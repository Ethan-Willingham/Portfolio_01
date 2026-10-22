'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {load} = require('./one-shift-driver.cjs');
const O = load();
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/one-shift-receiving.js'),'utf8'),{OneShift:O});
let checks = 0;
function check(name,fn) {fn();checks++;console.log('PASS '+name);}
function reconciles(sim) {
  const r = sim.reconcile();assert.equal(r.expected,r.accounted);
  O.saves.validate(sim.s);
  assert.equal(sim.s.cash,sim.s.openingCash+sim.s.journal.filter(e=>e.day===sim.s.day).reduce((n,e)=>n+e.cents,0));
}
function until(sim,test,max=20000) {
  for (let i=0;i<max && !test();i++) {sim.tick();if(i%97===0)reconciles(sim);}
  assert.ok(test(),'Simulation reached its target');reconciles(sim);
}
function opening(seed=1) {
  const sim = new O.Sim(seed,'business');
  const result = sim.prepareReceivingOpening();assert.equal(result.ok,true);
  return {sim,truck:sim.t.get(result.truck),ids:result.pallets};
}
const scan = (sim,id) => {const r=sim.command({type:'receivePallet',pallet:id});assert.equal(r.ok,true,r.reason);return r;};

check('Opening load relocates existing capital without creating inventory, costs, or duplicate pallets',()=>{
  const sim = new O.Sim(1,'business'), before = sim.snapshot(), assets = O.businessAssets(sim.s);
  const result = sim.prepareReceivingOpening(), load = sim.receivingLoads()[0];
  assert.equal(result.ok,true);assert.equal(load.total,6);assert.equal(load.cases,104);assert.equal(load.remaining,6);assert.equal(load.opening,true);
  assert.equal(sim.s.cash,before.cash);assert.equal(sim.s.goods.arrived,before.goods.arrived);assert.equal(O.businessAssets(sim.s),assets);
  assert.equal(sim.s.journal.length,0);assert.equal(sim.s.commerce.purchases.length,0);assert.equal(sim.businessStock('lantern').free,0);
  for (const p of sim.s.pallets) {const old=before.pallets.find(q=>q.id===p.id);for(const k of ['sscc','cases','lot','bestBy','unitCost','costBasis'])assert.equal(p[k],old[k]);assert.equal(p.place,'trailer');}
  const hash=sim.hash();assert.equal(sim.prepareReceivingOpening().reused,true);assert.equal(sim.hash(),hash);reconciles(sim);
});
check('Unscanned loads wait, front rows gate scans, and duplicate actions are read-only failures',()=>{
  const {sim,truck,ids}=opening(2);for(let i=0;i<50;i++)sim.tick();
  assert.ok(ids.every(id=>sim.p.get(id).place==='trailer'));assert.equal(sim.s.workers[0].task,null);
  const hash=sim.hash();assert.equal(sim.command({type:'receivePallet',pallet:ids[2]}).ok,false);assert.equal(sim.hash(),hash);
  scan(sim,ids[0]);const once=sim.hash();assert.equal(sim.command({type:'receivePallet',pallet:ids[0]}).ok,false);assert.equal(sim.hash(),once);assert.equal(truck.receipt.length,1);
  assert.equal(sim.command({type:'confirm',pallet:ids[0],count:999}).ok,false);
  assert.equal(sim.command({type:'move',pallet:ids[1],dest:{x:7,y:8,level:0}}).ok,false);
  scan(sim,ids[1]);assert.equal(sim.receivingPallets(truck.id)[2].canScan,true);reconciles(sim);
});
check('All rows can be scanned while paused, with distinct rack reservations and no premature available stock',()=>{
  const {sim,truck,ids}=opening(3), tick=sim.s.tick;
  for(const id of ids)scan(sim,id);
  assert.equal(sim.s.tick,tick);assert.equal(sim.receivingLoads()[0].remaining,0);assert.equal(sim.s.workers[0].queue.length,0);
  assert.equal(new Set(truck.receipt.map(r=>[r.destination.x,r.destination.y,r.destination.level].join('/'))).size,6);
  assert.ok(ids.every(id=>sim.p.get(id).place==='trailer'));assert.equal(sim.businessStock('stove').free,0);reconciles(sim);
  until(sim,()=>ids.every(id=>sim.p.get(id).place==='storage'));
  assert.equal(sim.businessStock('stove').free,40);assert.equal(sim.businessStock('lantern').free,40);assert.equal(sim.businessStock('chair').free,24);
  assert.equal(sim.s.cash,20000);assert.equal(sim.s.journal.length,0);assert.equal(sim.s.commerce.restocked,0);
  for(const r of truck.receipt) {const p=sim.p.get(r.pallet);assert.equal(p.x,r.destination.x);assert.equal(p.y,r.destination.y);assert.equal(p.level,r.destination.level);}
  until(sim,()=>truck.status==='gone');reconciles(sim);
});
check('Every accepted pallet physically stages before putaway and remains unavailable until it reaches its reserved rack',()=>{
  const {sim,ids}=opening(30),seen=new Set(),stages=new Set();for(const id of ids)scan(sim,id);
  assert.equal(sim.receivingProgress().awaitingUnload,6);assert.equal(sim.receivingProgress().casesPending,104);
  until(sim,()=>{
    const progress=sim.receivingProgress();assert.equal(progress.pending+progress.stored,6);assert.equal(sim.businessCapacity().used,6);
    for(const id of ids){const p=sim.p.get(id),status=sim.receivingPhysicalStatus(p);stages.add(status);
      if(p.place==='lane'){seen.add(id);assert.equal(p.lane,'receiving');assert.ok(p.receivingDestination);}
      if(p.receivingDestination){assert.equal(sim.occupied(p.receivingDestination.x,p.receivingDestination.y,p.receivingDestination.level),true);assert.ok(!sim.businessAvailable(p.item).some(q=>q.id===id));}
      if(p.place==='storage'){assert.ok(seen.has(id));assert.equal(p.receivingDestination,undefined);}
    }
    return ids.every(id=>sim.p.get(id).place==='storage');
  });
  assert.equal(seen.size,6);for(const status of ['unloading','staged','puttingAway','stored'])assert.ok(stages.has(status),status);
  assert.equal(sim.receivingProgress().pending,0);reconciles(sim);
});
check('A full Receiving area waits, and multiple workers cannot claim its one free position twice',()=>{
  const {sim,ids}=opening(31),lane=O.docks.lane(sim.s,'receiving');for(const id of ids)scan(sim,id);
  sim.addWorker({name:'Receiver',role:'receiver',wage:25});
  const cells=[];for(let y=lane.y;y<lane.y+lane.h;y++)for(let x=lane.x;x<lane.x+lane.w;x++)cells.push({x,y});
  sim.s.map.blocks.push(...cells);sim.s.map.revision++;
  for(let n=0;n<40;n++)sim.tick();assert.ok(ids.every(id=>sim.p.get(id).place==='trailer'));assert.ok(sim.s.workers.every(w=>!w.task&&!w.queue.length));
  const free=cells.at(-1);sim.s.map.blocks=sim.s.map.blocks.filter(p=>p.x!==free.x||p.y!==free.y);sim.s.map.revision++;
  const staged=new Set();until(sim,()=>{
    const unloads=sim.s.workers.flatMap(w=>[w.task,...w.queue].filter(t=>t?.kind==='unload'));
    assert.ok(unloads.length<=1);for(const t of unloads){assert.equal(t.dest.place,'lane');assert.equal(t.dest.lane,'receiving');assert.equal(t.dest.x,free.x);assert.equal(t.dest.y,free.y);}
    for(const id of ids)if(sim.p.get(id).place==='lane')staged.add(id);
    return ids.every(id=>sim.p.get(id).place==='storage');
  });assert.equal(staged.size,6);reconciles(sim);
});
check('Staged stock saves its rack claim, survives overnight, and completes real putaway on the next shift',()=>{
  const {sim,ids}=opening(32);for(const id of ids)scan(sim,id);
  until(sim,()=>ids.some(id=>sim.p.get(id).place==='lane'));
  const id=ids.find(id=>sim.p.get(id).place==='lane'),p=sim.p.get(id),where={x:p.x,y:p.y},destination={...p.receivingDestination};
  const restored=new O.Sim(1,'business');restored.restore(O.saves.decode(O.saves.encode(sim.s)));assert.equal(restored.hash(),sim.hash());
  restored.s.minute=restored.s.shiftEnd;until(restored,()=>restored.s.phase==='evening');assert.equal(restored.p.get(id).place,'lane');
  assert.ok(restored.command({type:'nextDay'}).ok);assert.equal(restored.p.get(id).x,where.x);assert.equal(restored.p.get(id).y,where.y);assert.deepEqual({...restored.p.get(id).receivingDestination},destination);
  assert.equal(restored.occupied(destination.x,destination.y,destination.level),true);assert.equal(restored.businessAvailable(p.item).some(q=>q.id===id),false);
  until(restored,()=>ids.every(id=>restored.p.get(id).place==='storage'));reconciles(restored);
});
check('Old accepted receipts migrate into pending rack reservations without resending inventory',()=>{
  const {sim,ids}=opening(33);scan(sim,ids[0]);const old=sim.snapshot();delete old.pallets.find(p=>p.id===ids[0]).receivingDestination;
  const restored=new O.Sim(1,'business');restored.restore(O.saves.validate(old));assert.ok(restored.p.get(ids[0]).receivingDestination);
  assert.equal(restored.receivingProgress().awaitingUnload,1);assert.equal(restored.receivingProgress().unscanned,5);assert.equal(restored.reconcile().expected,104);
  until(restored,()=>restored.p.get(ids[0]).place==='storage');reconciles(restored);
});
check('Old direct-to-rack unload saves finish their existing move with a migrated reservation',()=>{
  const {sim,ids}=opening(34);scan(sim,ids[0]);until(sim,()=>sim.s.workers[0].task?.kind==='unload'&&sim.s.workers[0].task.phase==='dest');
  const old=sim.snapshot(),p=old.pallets.find(p=>p.id===ids[0]),w=old.workers[0],d={...p.receivingDestination};delete p.receivingDestination;
  w.task.dest=d;w.task.end={x:d.x,y:d.y+1};w.task.path=O.pathing.path(old,w,w.task.end);
  const restored=new O.Sim(1,'business');restored.restore(O.saves.validate(old));assert.ok(restored.p.get(ids[0]).receivingDestination);
  until(restored,()=>restored.p.get(ids[0]).place==='storage');assert.equal(restored.p.get(ids[0]).x,d.x);assert.equal(restored.p.get(ids[0]).y,d.y);assert.equal(restored.p.get(ids[0]).receivingDestination,undefined);reconciles(restored);
});
check('A partially scanned save restores acceptance, reservations, lot identity and remaining gameplay',()=>{
  const {sim,truck,ids}=opening(4);scan(sim,ids[0]);scan(sim,ids[1]);
  const saved=O.saves.encode(sim.s), restored=new O.Sim(9,'business');restored.restore(O.saves.decode(saved));
  assert.equal(restored.hash(),sim.hash());assert.equal(restored.s.commerce.manualReceiving,true);assert.equal(restored.receivingLoads()[0].remaining,4);
  for(const id of ids.slice(2))scan(restored,id);
  until(restored,()=>ids.every(id=>restored.p.get(id).place==='storage'));
  assert.equal(restored.t.get(truck.id).receipt.length,6);reconciles(restored);
});
check('A full or unreachable rack rejects scanning without a receipt or an inventory change',()=>{
  const {sim,ids}=opening(5);sim.s.map.racks=sim.s.map.racks.slice(0,1);sim.s.map.revision++;
  scan(sim,ids[0]);scan(sim,ids[1]);const hash=sim.hash();
  assert.match(sim.command({type:'receivePallet',pallet:ids[2]}).reason,/rack/);assert.equal(sim.hash(),hash);
  sim.s.map.racks[0].levels=4;assert.equal(sim.command({type:'receivePallet',pallet:ids[2]}).ok,false);
  Object.assign(sim.s.owned,{training:1,usedLift:1,upper:1});scan(sim,ids[2]);assert.equal(sim.receivingPallets(sim.s.trucks[0].id)[2].destination.level,1);reconciles(sim);
});
check('Paid supplier deliveries wait for the scan and retain the original purchase receipt and cash ledger',()=>{
  const sim=new O.Sim(6,'business');sim.setManualReceiving(true);const cash=sim.s.cash,q=sim.restockQuote('chair',32);
  assert.equal(sim.command({type:'restock',item:'chair',count:32}).ok,true);
  const purchase=sim.s.commerce.purchases[0],truck=sim.t.get(purchase.truck);
  assert.equal(sim.command({type:'receivePallet',pallet:truck.manifest[0]}).ok,false);
  until(sim,()=>truck.status==='docked');for(let i=0;i<40;i++)sim.tick();
  assert.equal(purchase.received.length,0);assert.ok(truck.manifest.every(id=>sim.p.get(id).place==='trailer'));
  for(const id of truck.manifest)scan(sim,id);
  assert.equal(purchase.received.length,0);assert.equal(sim.s.cash,cash-q.cost);
  until(sim,()=>truck.manifest.some(id=>sim.p.get(id).place==='lane'));
  assert.equal(purchase.received.length,0);assert.equal(purchase.stored,false);assert.equal(sim.s.commerce.restocked,0);assert.equal(sim.businessStock('chair').stored,24);assert.equal(sim.businessStock('chair').incoming,32);
  until(sim,()=>purchase.stored);assert.equal(purchase.received.length,2);assert.equal(sim.s.commerce.restocked,1);
  assert.equal(sim.s.journal.filter(e=>e.category==='Receiving').length,0);assert.equal(sim.s.cash,cash-q.cost);reconciles(sim);
});
check('Partial receiving carries overnight without moving stored pallets or corrupting a save',()=>{
  const {sim,truck,ids}=opening(7);scan(sim,ids[0]);scan(sim,ids[1]);
  until(sim,()=>ids.slice(0,2).every(id=>sim.p.get(id).place==='storage'));
  const positions=ids.slice(0,2).map(id=>({id,x:sim.p.get(id).x,y:sim.p.get(id).y}));
  until(sim,()=>sim.s.phase==='evening');assert.equal(sim.command({type:'nextDay'}).ok,true);reconciles(sim);
  assert.equal(truck.manifest.length,4);assert.equal(truck.receipt.length,0);
  until(sim,()=>truck.status==='docked');
  for(const q of positions){assert.equal(sim.p.get(q.id).x,q.x);assert.equal(sim.p.get(q.id).y,q.y);}
  for(const id of ids.slice(2))scan(sim,id);
  until(sim,()=>ids.every(id=>sim.p.get(id).place==='storage'));reconciles(sim);
});
check('An unscanned first dock does not block accepted stock at a second dock',()=>{
  const sim=new O.Sim(11,'business');sim.setManualReceiving(true);
  sim.s.map.doors.push({id:sim.id(),x:21,y:16});sim.s.map.revision++;
  assert.equal(sim.command({type:'restock',item:'stove',count:8}).ok,true);
  assert.equal(sim.command({type:'restock',item:'lantern',count:8}).ok,true);
  const [first,second]=sim.s.trucks;
  until(sim,()=>first.status==='docked'&&second.status==='docked');
  assert.notEqual(first.door,second.door);
  scan(sim,second.manifest[0]);
  until(sim,()=>sim.p.get(second.manifest[0]).place==='storage'&&sim.s.commerce.restocked===1);
  assert.equal(sim.p.get(first.manifest[0]).place,'trailer');
  assert.equal(first.receipt.length,0);assert.equal(sim.s.commerce.restocked,1);reconciles(sim);
});
check('Save validation rejects forged receiving counts, duplicated targets and malformed acceptance',()=>{
  const {sim,truck,ids}=opening(8);scan(sim,ids[0]);scan(sim,ids[1]);
  for(const corrupt of [
    s=>s.commerce.manualReceiving='yes',
    s=>s.trucks[0].receipt[0].received++,
    s=>s.trucks[0].receipt[0].sscc='000000000000000000',
    s=>s.trucks[0].receipt[0].scannedTick=9999,
    s=>s.trucks[0].receipt[1].destination={...s.trucks[0].receipt[0].destination},
    s=>s.trucks[0].receipt.push({...s.trucks[0].receipt[0]}),
    s=>s.trucks[0].receipt[0].destination.x=30,
    s=>s.pallets[1].receivingDestination={...s.pallets[0].receivingDestination},
    s=>s.pallets[0].receivingDestination.level=99
  ]) {const state=sim.snapshot();corrupt(state);assert.throws(()=>O.saves.validate(state));}
  assert.equal(truck.receipt.length,2);reconciles(sim);
});
check('Opt-out business and legacy modes keep their existing receiving semantics',()=>{
  const sim=new O.Sim(10,'business');assert.equal(sim.command({type:'restock',item:'stove',count:16}).ok,true);
  until(sim,()=>sim.s.commerce.restocked===1);assert.equal(sim.s.trucks[0].receipt.length,0);
  const legacy=new O.Sim(10,'normal');assert.equal(legacy.setManualReceiving(true),false);assert.equal(legacy.prepareReceivingOpening().ok,false);assert.equal(legacy.command({type:'receivePallet',pallet:1}).ok,false);reconciles(legacy);
});
console.log(checks+' receiving checks passed.');
