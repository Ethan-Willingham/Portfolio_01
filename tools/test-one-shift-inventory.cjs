'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const O=require('./one-shift-driver.cjs').load();
for(const name of ['receiving','hands','scenes-model','inventory-model'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/one-shift-'+name+'.js'),'utf8'),{OneShift:O});
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS '+name);};
const plain=value=>JSON.parse(JSON.stringify(value));
const clone=sim=>plain(sim.s);
const fresh=()=>{const sim=new O.Sim(1,'business');sim.setManualHandling();O.ensureInventoryLayout(sim);return sim;};
const command=(sim,action)=>{const result=sim.command(action);assert.ok(result.ok,JSON.stringify(action)+': '+result.reason);O.saves.validate(sim.s);assert.equal(sim.reconcile().expected,sim.reconcile().accounted);return result;};
const stripLayout=state=>{delete state.map.inventoryNextOrdinal;for(const rack of state.map.racks)delete rack.inventoryOrdinal;return state;};
const allPositions=snapshot=>snapshot.aisles.flatMap(aisle=>aisle.bays.flatMap(bay=>bay.positions));
const addressMap=sim=>new Map(O.inventorySnapshot(sim).aisles.flatMap(aisle=>aisle.bays.map(bay=>[bay.rack,aisle.id+'/'+bay.index])));
const addRack=sim=>{const result=O.sceneBuyRack(sim);assert.ok(result.ok,result.reason);O.saves.validate(sim.s);return sim.s.map.racks.at(-1);};

check('Opt-in adds stable addresses without changing any stock, capacity or ledger',()=>{
  const sim=new O.Sim(1,'business');sim.setManualHandling();const before=clone(sim),capacity=plain(sim.businessCapacity());
  assert.equal(O.ensureInventoryLayout(sim),true);
  assert.deepEqual(stripLayout(clone(sim)),before);assert.deepEqual(plain(sim.businessCapacity()),capacity);
  assert.deepEqual(plain(sim.s.map.racks.map(r=>r.inventoryOrdinal)),[0,1,2,3]);assert.equal(sim.s.map.inventoryNextOrdinal,4);
  O.saves.validate(sim.s);assert.equal(sim.reconcile().accounted,104);
});

check('Four aisles expose eight positions per real bay but only eight initial usable slots',()=>{
  const sim=fresh(),view=O.inventorySnapshot(sim),positions=allPositions(view);
  assert.deepEqual(plain(view.aisles.map(a=>a.id)),['A','B','C','D']);assert.equal(view.aisles.length,4);
  assert.ok(view.aisles.every(a=>a.bayCount===1&&a.bays[0].positions.length===8));
  assert.equal(positions.length,32);assert.equal(positions.filter(p=>p.installed).length,8);assert.equal(view.usable,8);
  assert.equal(positions.filter(p=>p.locked).length,24);assert.equal(view.available,2);
  assert.equal(view.totalPallets,6);assert.equal(view.totalCases,104);
  assert.equal(new Set(positions.map(p=>p.x+'/'+p.y+'/'+p.level)).size,32);
  assert.equal(new Set(positions.map(p=>p.id)).size,32);
});

check('Snapshots and pallet locators are read-only and preserve exact lot and sprite identity',()=>{
  const sim=fresh(),before=JSON.stringify(sim.s);
  for(const aisle of ['A','B','C','D']){
    const view=O.inventorySnapshot(sim,aisle);
    for(const stock of view.pallets){const actual=sim.p.get(stock.id),location=O.inventoryLocation(sim,actual);
      assert.equal(location.aisle,aisle);assert.equal(location.bay,0);assert.equal(stock.cases,actual.cases);
      assert.equal(stock.lot,actual.lot);assert.equal(stock.sscc,actual.sscc);assert.equal(stock.bestBy,actual.bestBy);
      assert.equal(stock.costBasis,actual.costBasis);assert.equal(stock.artIndex,O.palletArtIndex(actual));
      assert.equal(view.positions.find(p=>p.pallet===stock.id).id,location.slot);
    }
  }
  assert.equal(JSON.stringify(sim.s),before);assert.equal(sim.reconcile().accounted,104);
});

check('Added racks rotate through A to D without moving existing addresses',()=>{
  const sim=fresh(),initial=addressMap(sim);O.post(sim.s,'Capital',10000,'Inventory fixture capital');sim.s.commerce.completed=20;
  command(sim,{type:'buy',id:'expansion'});
  const additions=[];
  for(let i=0;i<4;i++){sim.id();sim.id();additions.push(addRack(sim));}
  assert.deepEqual(additions.map(r=>r.inventoryOrdinal),[4,5,6,7]);
  const mapped=addressMap(sim);for(const [rack,address]of initial)assert.equal(mapped.get(rack),address);
  assert.deepEqual(additions.map(r=>mapped.get(r.id)),['A/1','B/1','C/1','D/1']);
  assert.equal(O.inventorySnapshot(sim).usable,16);assert.equal(O.inventorySnapshot(sim).totalCases,104);
});

check('Removing a bay leaves its address unused and later construction never renumbers stock',()=>{
  const sim=fresh();O.post(sim.s,'Capital',10000,'Inventory fixture capital');sim.s.commerce.completed=20;
  command(sim,{type:'buy',id:'expansion'});for(let i=0;i<4;i++)addRack(sim);
  sim.step(10000);assert.equal(sim.s.phase,'evening');
  const before=addressMap(sim),removed=sim.s.map.racks.find(r=>r.inventoryOrdinal===5);
  command(sim,{type:'build',kind:'remove',x:removed.x,y:removed.y});
  const after=addressMap(sim);assert.equal(after.has(removed.id),false);
  for(const [id,address]of after)assert.equal(address,before.get(id));
  const newRack=addRack(sim);assert.equal(newRack.inventoryOrdinal,8);assert.equal(addressMap(sim).get(newRack.id),'A/2');
  assert.equal(O.inventorySnapshot(sim,'B',1).bay,0);assert.equal(sim.s.map.inventoryNextOrdinal,9);
  assert.equal(O.inventorySnapshot(sim).totalCases,104);
});

check('Upper artwork stays locked until levels, training and forklift access all exist',()=>{
  const sim=fresh();let view=O.inventorySnapshot(sim,'A');assert.ok(view.positions.filter(p=>p.level>0).every(p=>!p.installed&&p.locked&&!p.available));
  for(const rack of sim.s.map.racks)rack.levels=4;
  view=O.inventorySnapshot(sim,'A');assert.ok(view.positions.filter(p=>p.level>0).every(p=>p.installed&&p.locked&&!p.available&&p.reason.includes('training')));
  sim.s.owned.training=1;view=O.inventorySnapshot(sim,'A');assert.ok(view.positions.filter(p=>p.level>0).every(p=>p.locked&&p.reason.includes('forklift')));
  sim.s.owned.usedLift=1;view=O.inventorySnapshot(sim,'A');assert.ok(view.positions.filter(p=>p.level>0).every(p=>!p.locked&&p.available));
  assert.equal(O.inventorySnapshot(sim).usable,32);assert.equal(sim.businessCapacity().slots,32);
  sim.s.owned.training=0;view=O.inventorySnapshot(sim,'A');assert.ok(view.positions.filter(p=>p.level>0).every(p=>p.locked&&!p.available));
  O.saves.validate(sim.s);
});

check('Actual hand-slot reservation and carried receipt exchange availability remain authoritative',()=>{
  const sim=fresh();sim.prepareReceivingOpening();const truck=sim.s.trucks.find(t=>t.supplier),first=truck.manifest[0];
  command(sim,{type:'receivePallet',pallet:first});
  let slots=new Map(sim.handRackSlots().map(slot=>[slot.id,slot]));
  for(const position of allPositions(O.inventorySnapshot(sim)).filter(p=>p.installed))assert.equal(position.available,slots.get(position.id).available);
  command(sim,{type:'handUnload',pallet:first});command(sim,{type:'handLift',pallet:first});
  assert.equal(O.inventoryLocation(sim,first),null);
  slots=new Map(sim.handRackSlots().map(slot=>[slot.id,slot]));
  for(const position of allPositions(O.inventorySnapshot(sim)).filter(p=>p.installed))assert.equal(position.available,slots.get(position.id).available);
  const chosen=allPositions(O.inventorySnapshot(sim)).find(p=>p.available);command(sim,{type:'handStore',slot:chosen.id});
  assert.equal(O.inventoryLocation(sim,first).slot,chosen.id);assert.equal(O.inventorySnapshot(sim).totalCases,sim.p.get(first).cases);
});

check('Save round trips preserve stable addresses, holes, stock and capacity',()=>{
  const sim=fresh();O.post(sim.s,'Capital',10000,'Inventory fixture capital');sim.s.commerce.completed=20;command(sim,{type:'buy',id:'expansion'});
  addRack(sim);addRack(sim);sim.step(10000);const removed=sim.s.map.racks.find(r=>r.inventoryOrdinal===4);command(sim,{type:'build',kind:'remove',x:removed.x,y:removed.y});
  const expected=plain(O.inventorySnapshot(sim));const restored=new O.Sim(2,'business');restored.restore(O.saves.decode(O.saves.encode(sim.s)));
  assert.deepEqual(plain(O.inventorySnapshot(restored)),expected);assert.deepEqual(plain(restored.businessCapacity()),plain(sim.businessCapacity()));
  assert.equal(restored.s.map.inventoryNextOrdinal,6);assert.equal(addRack(restored).inventoryOrdinal,6);
  assert.equal(restored.reconcile().accounted,104);
});

check('Old manual saves migrate on restore only when the app has opted into aisle addresses',()=>{
  const old=new O.Sim(1,'business');old.setManualHandling();O.post(old.s,'Capital',1000,'Inventory fixture capital');addRack(old);
  assert.equal(old.s.map.inventoryNextOrdinal,undefined);
  const untouched=new O.Sim(2,'business');untouched.restore(O.saves.decode(O.saves.encode(old.s)));assert.equal(untouched.s.map.inventoryNextOrdinal,undefined);
  const publicApp=fresh();publicApp.restore(O.saves.decode(O.saves.encode(old.s)));assert.equal(publicApp.s.map.inventoryNextOrdinal,5);
  assert.deepEqual(plain(publicApp.s.map.racks.map(r=>r.inventoryOrdinal)),[0,1,2,3,4]);
  assert.deepEqual(stripLayout(clone(publicApp)),clone(old));
});

check('Malformed, duplicate, missing or excessive address metadata is rejected',()=>{
  const sim=fresh();
  for(const value of [-1,3,4.5,'4',null,1000001]){const state=clone(sim);state.map.inventoryNextOrdinal=value;assert.throws(()=>O.saves.validate(state),/inventory/i);}
  for(const value of [-1,.5,'0',null,1000000]){const state=clone(sim);state.map.racks[0].inventoryOrdinal=value;assert.throws(()=>O.saves.validate(state),/inventory/i);}
  let state=clone(sim);state.map.racks[1].inventoryOrdinal=0;assert.throws(()=>O.saves.validate(state),/inventory/i);
  state=clone(sim);delete state.map.racks[0].inventoryOrdinal;assert.throws(()=>O.saves.validate(state),/inventory/i);
  state=clone(sim);delete state.map.inventoryNextOrdinal;assert.throws(()=>O.saves.validate(state),/inventory/i);
  state=clone(sim);state.map.racks[0].inventoryOrdinal=3;state.map.racks[3].inventoryOrdinal=0;assert.throws(()=>O.saves.validate(state),/inventory/i);
});

check('Legacy nonmanual models and read-only projections are not implicitly opted in',()=>{
  const legacy=new O.Sim(1,'normal'),before=JSON.stringify(legacy.s);
  assert.equal(O.ensureInventoryLayout(legacy),false);assert.equal(O.inventorySnapshot(legacy),null);assert.equal(O.inventoryLocation(legacy,1),null);assert.equal(JSON.stringify(legacy.s),before);
  const manual=new O.Sim(1,'business');manual.setManualHandling();const saved=JSON.stringify(manual.s);
  assert.equal(O.inventorySnapshot(manual).totalCases,104);assert.equal(JSON.stringify(manual.s),saved);assert.equal(manual.s.map.inventoryNextOrdinal,undefined);
});

console.log(checks+' inventory mapping checks passed.');
