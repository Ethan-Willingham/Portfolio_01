import assert from 'node:assert/strict';
import {measureStage} from './stage.mjs';
import {physics,moduleURL,hash} from './core.mjs';
import {thresholds} from './limits.mjs';
export async function robustness(stage,seed=229780501){
 const initialSeed=seed,random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;},rows=[];
 for(const mirrored of [false,true]){const samples=[];
  for(let n=0;n<200;n++){
   const d=structuredClone(stage),p=d.parts.find(p=>p.id===d.entryId),a=thresholds.baton.accept;
   if(p){if(n<16){p.vx=n&1?a.speedMax:a.speedMin;p.y=n&2?a.heightMax:a.heightMin;p.vy=n&4?a.verticalSpeedMax:-a.verticalSpeedMax;p.spin=-p.vx/p.radius+(n&8?a.rollingSlipSpinMax:-a.rollingSlipSpinMax);}else{p.vx=a.speedMin+random()*(a.speedMax-a.speedMin);p.y=a.heightMin+random()*(a.heightMax-a.heightMin);p.vy=(random()*2-1)*a.verticalSpeedMax;p.spin=-p.vx/p.radius+(random()*2-1)*a.rollingSlipSpinMax;}}
   for(const q of d.parts)if(!q.fixed&&q.id!==d.entryId){q.x+=(random()*2-1)*.02;q.y+=(random()*2-1)*.02;q.angle=(q.angle||0)+(random()*2-1)*.008726646259971648;q.friction*=.9+.2*random();q.restitution*=.9+.2*random();}
   const r=await measureStage(d,mirrored,false);samples.push({sample:n,pass:r.pass,failures:r.failures,snapshotHash:r.snapshotHash,duration:r.exit?.time});
  }
  const passing=samples.filter(r=>r.pass).length;rows.push({mirrored,runs:200,passing,pass:passing>=199,seed:initialSeed,sampleHash:hash(JSON.stringify(samples)),failures:samples.filter(r=>!r.pass)});
  console.log('Stage '+stage.stageNumber+' '+(mirrored?'mirrored':'forward')+': '+passing+'/200 variation runs');
 }
 return rows;
}
export async function interruptionControls(stage){const rows=[];
 for(const mirrored of [false,true])for(const id of stage.path.filter(id=>id!==stage.exitId)){
  let d=structuredClone(stage),p=d.parts.find(p=>p.id===id);if(p.fixed)continue;p.fixed=true;p.mount='verification clamp';p.vx=p.vy=p.spin=0;d.joints=d.joints.filter(j=>j.a!==id&&j.b!==id);if(mirrored)d=physics.mirror(d);const s=await physics.create(d,moduleURL);let exited=false;
  try{for(let n=0;n<6000;n++){s.step();const q=s.bodies.get(d.exitId).translation();if(mirrored?q.x<=0:q.x>=16){exited=true;break;}}rows.push({mirrored,clamped:id,pass:!exited});}finally{s.dispose();}
 }
 assert(rows.every(r=>r.pass),'Interrupted chain emitted a marble');return rows;
}
// A reserve stress test, independent from the standard 200-run gate.
export async function reserveControls(stage){const rows=[];
 for(const mirrored of [false,true])for(const id of stage.path.filter(id=>!['marble-in','marble-out','clock-arm','cup','wheel'].includes(id))){
  const d=structuredClone(stage),p=d.parts.find(p=>p.id===id);p.mass*=2;p.inertia*=2;d.durationWindow=[0,25];const r=await measureStage(d,mirrored,true);rows.push({mirrored,loaded:id,massFactor:2,pass:r.pass,failures:r.failures,duration:r.exit?.time});
 }
 assert(rows.every(r=>r.pass),'Doubled trigger load failed');return rows;
}
