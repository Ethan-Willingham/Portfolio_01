'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {load}=require('./one-shift-driver.cjs'),O=load();
for(const name of ['receiving','scenes-model'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/one-shift-'+name+'.js'),'utf8'),{OneShift:O});
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
function rows(sim,scene){
  const first=O.sceneSnapshot(sim,scene),all=[];
  for(let page=0;page<first.pages;page++){const q=O.sceneSnapshot(sim,scene,page);assert.equal(q.page,page);assert.ok(q.pallets.length<=3);all.push(...q.pallets);}
  assert.equal(all.length,first.total);return all;
}
function projected(sim){
  const all=['staging','storage','shipping'].flatMap(scene=>rows(sim,scene));
  assert.equal(new Set(all.map(p=>p.id)).size,all.length,'A pallet belongs to one scene only');
  for(const row of all){const p=sim.p.get(row.id);for(const key of ['item','cases','lot','bestBy','receivedDay','place','sscc'])assert.equal(row[key],p[key]);}
  const physical=sim.s.pallets.filter(p=>p.cases>0&&['storage','lane','transit'].includes(p.place));
  const carried=new Set(sim.s.workers.flatMap(w=>[w.task,...w.queue].filter(t=>t?.kind==='salePick').map(t=>t.output)));
  for(const id of carried)assert.ok(!all.some(p=>p.id===id),'A carried pick cannot appear in a floor position');
  const carriedCases=[...carried].reduce((n,id)=>n+(sim.p.get(id)?.cases||0),0);
  assert.equal(all.reduce((n,p)=>n+p.cases,0)+carriedCases,physical.reduce((n,p)=>n+p.cases,0),'Every physical case is on a scene floor or with its picking worker');
  const r=sim.reconcile();assert.equal(r.expected,r.accounted);O.saves.validate(sim.s);return all;
}
function until(sim,test,max=16000){for(let i=0;i<max&&!test();i++){sim.tick();if(i%73===0)projected(sim);}assert.ok(test(),'Simulation reached target');projected(sim);}
function opening(){const sim=new O.Sim(1,'business'),load=sim.prepareReceivingOpening();assert.ok(load.ok);return {sim,ids:load.pallets};}
function scanAll(sim,ids){for(const id of ids)assert.ok(sim.command({type:'receivePallet',pallet:id}).ok);}

check('Snapshots paginate exact stock records without mutating simulation or exposing internal references',()=>{
  const sim=new O.Sim(1,'business'),before=sim.hash(),first=O.sceneSnapshot(sim,'storage');
  assert.equal(first.total,6);assert.equal(first.capacity,8);assert.equal(first.pages,3);assert.equal(first.page,0);assert.equal(first.pallets.length,3);assert.equal(rows(sim,'storage').reduce((n,p)=>n+p.cases,0),104);
  assert.equal(O.sceneSnapshot(sim,'storage',999).page,2);assert.equal(O.sceneSnapshot(sim,'storage',2).pallets.length,0);assert.equal(O.sceneSnapshot(sim,'storage',-9).page,0);assert.equal(O.sceneSnapshot(sim,'storage',NaN).page,0);
  assert.equal(O.sceneSnapshot(sim,'unknown').scene,'storage');assert.equal(O.sceneSnapshot(sim,'staging').pages,1);assert.equal(O.sceneSnapshot(sim,'shipping').total,0);
  first.pallets[0].cases=999;first.work.push('changed');assert.equal(sim.hash(),before);projected(sim);
});
check('Scans do not invent floor stock, and every unloaded opening pallet moves through staging to storage',()=>{
  const {sim,ids}=opening(),staged=new Set();assert.equal(projected(sim).length,0);scanAll(sim,ids);assert.equal(projected(sim).length,0);
  until(sim,()=>sim.s.workers[0].task?.kind==='unload');assert.ok(O.sceneSnapshot(sim,'staging').work.some(text=>text.includes('Unloading')));
  until(sim,()=>{
    const stage=rows(sim,'staging');for(const p of stage){staged.add(p.id);assert.ok(!rows(sim,'storage').some(q=>q.id===p.id));}
    return ids.every(id=>sim.p.get(id).place==='storage');
  });
  assert.equal(staged.size,6);assert.equal(rows(sim,'staging').length,0);assert.equal(rows(sim,'storage').length,6);assert.equal(sim.s.cash,20000);projected(sim);
});
check('Real picking, wrapping and loading change scene records once while loaded stock leaves the floor',()=>{
  const {sim,ids}=opening();scanAll(sim,ids);until(sim,()=>ids.every(id=>sim.p.get(id).place==='storage'));
  const order=sim.s.commerce.orders[0],worker=sim.s.workers[0];assert.ok(sim.command({type:'fulfill',order:order.id}).ok);
  until(sim,()=>worker.task?.kind==='salePick');assert.equal(rows(sim,'shipping').length,0);assert.ok(O.sceneSnapshot(sim,'shipping').work.some(text=>text.includes('empty shipping pallet')));
  assert.ok(rows(sim,'storage').some(p=>p.status==='Reserved for picking'));
  until(sim,()=>worker.task?.kind==='salePick'&&worker.task.collected);const output=sim.p.get(worker.task.output);assert.equal(rows(sim,'shipping').length,0);assert.ok(O.sceneSnapshot(sim,'storage').work.some(text=>text.includes('8 picked cases')));
  until(sim,()=>output.place==='lane'&&output.lane==='shipping');const staged=rows(sim,'shipping').find(p=>p.id===output.id);assert.equal(staged.order,order.id);assert.equal(staged.moving,false);assert.equal(staged.status,'Awaiting wrap and label');
  until(sim,()=>worker.task?.kind==='wrap'&&!worker.task.path?.length);assert.equal(rows(sim,'shipping')[0].status,'Wrapping and labeling');
  until(sim,()=>worker.task?.kind==='load'&&worker.task.phase==='dest');assert.equal(rows(sim,'shipping')[0].status,'Loading the truck');
  until(sim,()=>sim.p.get(output.id).place==='shipped');assert.equal(rows(sim,'shipping').length,0);assert.ok(O.sceneSnapshot(sim,'shipping').work.some(text=>text.includes('8 cases loaded')));
  until(sim,()=>order.status==='complete');assert.equal(order.paid,3600);assert.equal(order.cogs,1600);assert.equal(sim.s.cash,23550);
  until(sim,()=>sim.t.get(order.truck).status==='gone');assert.equal(O.sceneSnapshot(sim,'shipping').work.some(text=>text.includes('cases loaded')),false);projected(sim);
});
check('Depleting an early rack pallet leaves other storage anchors fixed and replacement stock reuses its physical slot',()=>{
  const sim=new O.Sim(8,'business'),before=rows(sim,'storage'),first=before[0],order=sim.makeBusinessOrder(480,[{item:first.item,cases:first.cases}]);
  sim.businessArrivals();assert.ok(sim.command({type:'fulfill',order:order.id}).ok);until(sim,()=>sim.p.get(first.id).place==='empty');
  const after=rows(sim,'storage');assert.equal(O.sceneSnapshot(sim,'storage').pages,3);assert.ok(!after.some(p=>p.id===first.id));
  for(const previous of before.slice(1)){const current=after.find(p=>p.id===previous.id);assert.ok(current);assert.equal(current.page,previous.page);assert.equal(current.slot,previous.slot);assert.equal(current.rack,previous.rack);}
  until(sim,()=>order.status==='complete');assert.ok(sim.command({type:'restock',item:first.item,count:16}).ok);const purchase=sim.s.commerce.purchases.at(-1);
  until(sim,()=>purchase.stored);const replacement=rows(sim,'storage').find(p=>p.id===purchase.pallets[0]);assert.equal(replacement.page,first.page);assert.equal(replacement.slot,first.slot);assert.equal(replacement.rack,first.rack);projected(sim);
});
check('A partially completed delivery projects identically after explicit save and load',()=>{
  const {sim,ids}=opening();scanAll(sim,ids);until(sim,()=>sim.s.pallets.some(p=>p.place==='lane'&&p.lane==='receiving'));
  const state=O.saves.decode(O.saves.encode(sim.s)),restored=new O.Sim(9,'business');restored.restore(state);
  for(const scene of ['staging','storage','shipping'])assert.equal(JSON.stringify(O.sceneSnapshot(restored,scene)),JSON.stringify(O.sceneSnapshot(sim,scene)));
  until(restored,()=>ids.every(id=>restored.p.get(id).place==='storage'));assert.equal(restored.reconcile().expected,104);projected(restored);
});
check('Cancelled carried freight remains a real Shipping return until its movement finishes',()=>{
  const sim=new O.Sim(4,'business'),order=sim.s.commerce.orders[0],worker=sim.s.workers[0];sim.command({type:'fulfill',order:order.id});
  until(sim,()=>worker.task?.kind==='salePick'&&worker.task.collected);const id=worker.task.output;assert.ok(sim.command({type:'cancelOrder',order:order.id}).ok);
  const row=rows(sim,'shipping').find(p=>p.id===id);assert.equal(row.cases,8);assert.equal(row.status,'Returning to Shipping');assert.equal(row.moving,true);assert.equal(row.order,null);
  until(sim,()=>sim.businessStock('lantern').free===40);assert.equal(sim.s.commerce.totalSales,0);projected(sim);
});
check('A paid supplier delivery remains off the floor until physical unload and preserves its ledger',()=>{
  const sim=new O.Sim(5,'business');sim.setManualReceiving(true);const quote=sim.restockQuote('chair',16);assert.ok(sim.command({type:'restock',item:'chair',count:16}).ok);
  const purchase=sim.s.commerce.purchases[0],truck=sim.t.get(purchase.truck),id=truck.manifest[0];assert.ok(!projected(sim).some(p=>p.id===id));
  until(sim,()=>truck.status==='docked');scanAll(sim,[id]);assert.ok(!projected(sim).some(p=>p.id===id));
  until(sim,()=>rows(sim,'staging').some(p=>p.id===id));assert.equal(rows(sim,'staging').find(p=>p.id===id).cases,16);assert.equal(purchase.stored,false);
  until(sim,()=>purchase.stored);assert.ok(rows(sim,'storage').some(p=>p.id===id));assert.equal(sim.s.cash,20000-quote.cost);projected(sim);
});
check('Scene rack buying uses real build rules, adds reachable capacity and charges once',()=>{
  const sim=new O.Sim(6,'business'),cash=sim.s.cash,before=sim.businessCapacity().slots;
  assert.ok(O.sceneBuyRack(sim).ok);const rack=sim.s.map.racks.at(-1);assert.equal(sim.businessCapacity().slots,before+2);assert.equal(sim.s.cash,cash-5500);
  assert.ok(O.pathing.path(sim.s,sim.s.workers[0],{x:rack.x,y:rack.y+1}));assert.ok(O.pathing.path(sim.s,sim.s.workers[0],{x:rack.x+1,y:rack.y+1}));assert.equal(sim.s.journal.filter(e=>e.category==='Purchases').length,1);
  assert.equal(rows(sim,'storage').length,6);assert.equal(sim.reconcile().expected,104);projected(sim);
});
check('Scene rack buying cannot spend on unreachable positions or bypass available cash',()=>{
  const sim=new O.Sim(7,'business'),b=sim.s.map.building;
  for(let y=b.y;y<b.y+b.h;y++)for(let x=15;x<b.x+b.w;x++)if(x!==sim.s.workers[0].x||y!==sim.s.workers[0].y)sim.s.map.blocks.push({x,y});sim.s.map.revision++;
  const blocked=sim.hash();assert.equal(O.sceneBuyRack(sim).ok,false);assert.equal(sim.hash(),blocked);
  sim.s.map.blocks=[];sim.s.map.revision++;for(let i=0;i<3;i++)assert.ok(O.sceneBuyRack(sim).ok);
  const broke=sim.hash();assert.equal(O.sceneBuyRack(sim).ok,false);assert.equal(sim.hash(),broke);projected(sim);
  const legacy=new O.Sim(7,'normal'),old=legacy.hash();assert.equal(O.sceneBuyRack(legacy).ok,false);assert.equal(legacy.hash(),old);
});
console.log(checks+' scene model checks passed.');
