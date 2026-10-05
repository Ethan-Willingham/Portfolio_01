'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{load,act}=require('./one-shift-driver.cjs'),O=load();let checks=0,accepted=0,rejected=0,maxStill=0;const begin=performance.now();
for(let seed=1;seed<=1000;seed++){
 const sim=new O.Sim(seed,'peak'),s=sim.s;let rng=seed;const random=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
 // Layout fixtures vary safe rack placement, without altering stock or worker speed.
 s.cash=s.openingCash=500000;sim.command({type:'buy',id:'training'});sim.command({type:'buy',id:'usedLift'});sim.command({type:'hire',index:seed%O.staff.length});
 for(let i=0;i<12;i++){const r=sim.command({type:'build',kind:'rack',x:7+random(19),y:7+random(10)});if(r.ok)accepted++;else rejected++;}
 for(let i=0;i<3;i++){const x=7+random(19),y=6+random(14),p=O.pathing.path(s,s.workers[0],{x,y},true);if(p){assert.ok(p.every(q=>!O.pathing.blocked(s,q.x,q.y,true)));sim.command({type:'walk',x,y});checks++;}}
 const progress=new Map();let ticks=0;while(s.phase==='shift'&&ticks++<22000){if(ticks%4===0)act(sim,O);sim.tick();for(const w of s.workers){if(!w.task){progress.delete(w.id);continue;}const token=[w.task.id,w.task.phase,w.task.progress,w.x,w.y].join('/'),old=progress.get(w.id),still=old?.token===token?old.still+1:0;maxStill=Math.max(maxStill,still);assert.ok(still<3600,'Deadlock seed '+seed+' worker '+w.id);progress.set(w.id,{token,still});}}
 assert.equal(s.phase,'evening');const g=sim.reconcile();assert.ok(Math.abs(g.expected-g.accounted)<1e-6);assert.equal(s.reports[0].closing,s.reports[0].opening+s.reports[0].entries.reduce((a,q)=>a+q.cents,0));
}
const result={days:1000,routeChecks:checks,acceptedRackPlacements:accepted,rejectedRackPlacements:rejected,maxUnchangedTicks:maxStill,elapsedMs:performance.now()-begin};console.log(JSON.stringify(result));fs.mkdirSync('/Users/ethan/Portfolio_01/research/one-shift/evidence',{recursive:true});fs.writeFileSync('/Users/ethan/Portfolio_01/research/one-shift/evidence/pathing.json',JSON.stringify(result,null,2));
