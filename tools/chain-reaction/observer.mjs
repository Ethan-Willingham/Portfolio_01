import assert from 'node:assert/strict';
import {physics,moduleURL,hash} from './core.mjs';
import {mass,materialData} from './materials.mjs';

// The excluded cell overlaps only in projection. The enabled cell is elsewhere,
// which also catches an observer that uses the body's group instead of each cell.
export function observerDefinitions(){
 return [false,true].map(samePlane=>{
  const definition={name:'release-depth-'+(samePlane?'blocked':'separate'),contactProfile:'fresh-v1',noSleep:true,ticks:12,
   parts:[{id:'support',shape:'compound',fixed:true,mount:'regression fixture',x:0,y:1.5,layer:2,z:.15,depth:.1,
    colliders:[{shape:'box',width:2,height:1,x:0,y:0,layer:samePlane?2:4,z:samePlane?0:-1,depth:.1},{shape:'box',width:.1,height:.1,x:3,y:0,layer:2,z:0,depth:.1}]},
    {id:'recipient',shape:'ball',radius:.1,x:0,y:2.1,vx:1,spin:-10,mass:.005,inertia:.00002,layer:2,z:.15,depth:.2,friction:.45,restitution:0}],joints:[],
   steps:[{id:'release',kind:'unblock',from:'support',to:'recipient',motion:{axis:'x',sign:1,travel:.01}}]};
  Object.assign(definition.parts[0],mass.compoundProperties(materialData.materials.maple,definition.parts[0].colliders,.1));
  return definition;
 });
}
export async function verifyObserver(){
 const results=[];
 for(const definition of observerDefinitions()){
  const samePlane=definition.name.endsWith('blocked');
  const sim=await physics.create(definition,moduleURL),watch=globalThis.ChainReaction.events.watch(sim,definition);
  try{
   for(let n=0;n<definition.ticks;n++){sim.step();const before=hash(sim.snapshot());watch.sample();assert.equal(hash(sim.snapshot()),before,'Observer changed the world');}
   const report=watch.report();assert(report.events[0].motionTick!==null,'Fixture did not reach its motion threshold');
   assert.equal(report.failures.some(f=>f.type==='blocked-release'),samePlane,'Release depth compatibility');
   if(!samePlane)assert(report.pass,JSON.stringify(report.failures));
   results.push({samePlane,report,snapshotHash:hash(sim.snapshot())});
  }finally{sim.dispose();}
 }
 return {pass:true,results};
}
