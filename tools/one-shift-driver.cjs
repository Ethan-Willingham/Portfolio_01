'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function load(){const context=vm.createContext({console,performance});for(const file of ['data','labels','pathing','economy','content','sim','saves']){const f=path.join(__dirname,'../js/one-shift-'+file+'.js');if(fs.existsSync(f))vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});}return context.OneShift;}
// This policy uses the same validated commands as a player. It does not edit stock or money.
function act(sim,O,style='average'){
 const s=sim.s,w=s.workers[0];if(s.phase!=='shift'||w.task||w.queue.length)return;
 if(style==='casual'&&s.tick%40>3)return;
 if(s.situation?.effect==='seal'){const t=s.trucks.find(t=>t.status==='docked'&&t.direction==='in'&&t.seal!==t.expectedSeal);if(t){sim.command({type:'reject',truck:t.id});return;}}
 const outbound=s.trucks.filter(t=>t.direction==='out'&&t.status==='docked').sort((a,b)=>a.deadline-b.deadline);
 for(const t of outbound){
  if(t.order.every(l=>!sim.remaining(t,l))){sim.command({type:'dispatch',truck:t.id});return;}
  for(const l of t.order){const left=sim.remaining(t,l);if(!left)continue;
   const built=sim.available(l.item,t.client).find(p=>p.pick&&p.cases>0&&p.cases<=left&&!p.wrapped);if(built){if(sim.command({type:'wrap',pallet:built.id}).ok)return;}
   let ready=sim.available(l.item,t.client).filter(p=>p.cases<=left&&p.wrapped&&p.labelled).sort((a,b)=>a.receivedDay-b.receivedDay||Number(!!b.pick)-Number(!!a.pick))[0];
   if(ready){const q=sim.command({type:'move',pallet:ready.id,dest:{truck:t.id}});if(q.ok)return;}
   const unwrapped=sim.available(l.item,t.client).find(p=>p.pick&&p.cases===left&&!p.wrapped);
   if(unwrapped){if(sim.command({type:'wrap',pallet:unwrapped.id}).ok)return;}
   const source=sim.available(l.item,t.client).find(p=>!p.pick&&p.cases>=left);
   if(source){const empty=s.pallets.find(p=>p.pick&&p.cases===0&&!p.reservedBy&&p.item===l.item)||sim.p.get(sim.command({type:'empty',item:l.item,client:t.client}).pallet);if(empty&&sim.command({type:'pick',pallet:source.id,output:empty.id,count:left}).ok)return;}
  }
 }
 const inbound=s.trucks.find(t=>t.direction==='in'&&t.status==='docked');
 if(inbound){
  sim.command({type:'inspect',truck:inbound.id});if(!inbound.opened){const r=sim.command({type:'seal',truck:inbound.id});if(!r.ok){sim.command({type:'reject',truck:inbound.id});return;}}
  const p=inbound.manifest.map(id=>sim.p.get(id)).find(p=>p.place==='trailer'&&!p.reservedBy&&sim.reachable(inbound,p));
  if(p){sim.command({type:'scan',pallet:p.id});sim.command({type:'confirm',pallet:p.id,count:p.cases,condition:p.condition==='damage'?'damage':'sound'});if(sim.command({type:'move',pallet:p.id,dest:{lane:'receiving'}}).ok)return;}
 }
 if(['services','mixed','expert'].includes(style)&&s.day>=4&&s.owned.bench){const r=sim.command({type:'service',id:s.owned.assembly?'assembly':'kit',units:8});if(r.ok)return;}
 for(const p of s.pallets)if(p.place==='lane'&&!p.pick&&!p.reservedBy){const dest=sim.spot(p);if(dest&&sim.command({type:'move',pallet:p.id,dest}).ok)return;}
 if(O.has(s,'forklift')&&w.battery<20)sim.command({type:'charge'});
}
function evening(sim,O,style='average'){
 const s=sim.s;if(s.day<3){sim.command({type:'buy',id:'rack'});return;}
 const plans={casual:['training','usedLift','zones','door'],average:['training','lift','zones','door','upper','charger'],expert:['training','lift','door','zones','upper','bench','shelves','pack','crossdock','conveyor'],storage:['training','usedLift','upper','expansion','zones','reach','narrow','asrs'],throughput:['training','lift','door','zones','appointments','wrapper','conveyor','charger'],services:['training','usedLift','bench','zones','assembly','line','inspection','gifts','ticket'],fulfillment:['training','usedLift','shelves','pack','cart','zones','cartonFlow','sorter'],crossdock:['training','lift','door','crossdock','zones','appointments','conveyor'],mixed:['training','usedLift','upper','bench','shelves','pack','crossdock','zones','door','yard','baler']};
 for(const id of plans[style]||plans.average){if(!s.owned[id]&&s.cash>(O.equipment.find(e=>e.id===id)?.cost||0)*100+8000){sim.command({type:'buy',id});break;}}
 const desired={storage:['reserve'],throughput:['relay'],services:['lumen'],fulfillment:['paper'],crossdock:['relay'],mixed:['reserve','lumen','paper'],expert:['relay','paper','lumen']}[style]||[];
 for(const id of desired){const old=s.contracts.find(q=>q.id===id);if(!old||old.until-s.day<3)sim.command({type:'contract',id});}
 const base=s.contracts.find(q=>q.id==='trail');if(base&&base.until-s.day<3)sim.command({type:'contract',id:'trail'});
 if(O.has(s,'forklift')&&s.cash>45000&&s.workers.length<(style==='storage'?2:Math.min(5,s.contracts.length+1))&&s.day%4===0)sim.command({type:'hire',index:s.workers.length-1});
 if(!sim.spot(null)&&s.cash>60000)sim.command({type:'buy',id:'expansion'});
}
function day(sim,O,style='average'){let ticks=0;while(sim.s.phase==='shift'&&ticks++<22000){if(ticks%4===0)act(sim,O,style);sim.tick();}if(sim.s.phase!=='evening')throw Error('Day did not finish.');return sim.s.reports.at(-1);}
module.exports={load,act,evening,day};
