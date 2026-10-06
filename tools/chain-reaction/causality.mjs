import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {ROOT,physics,moduleURL} from './core.mjs';
await import(pathToFileURL(resolve(ROOT,'js/chain-reaction-causality.js')));

export async function auditCausality(definition){
  const sim=await physics.create(definition,moduleURL);
  try{const watch=globalThis.ChainReaction.causality.watch(sim,definition);for(let i=0;i<definition.ticks;i++){sim.step();watch.sample();}return watch.report();}
  finally{sim.dispose();}
}

async function disconnected(definition,disabled){
  const ids=definition.causality.targets,index=ids.indexOf(disabled),downstream=index<0?ids:ids.slice(index+1);
  const parts=index<0?definition.parts.filter(p=>p.id!==disabled):definition.parts.map(p=>p.id===disabled?{...p,fixed:true,mount:'test-clamp'}:p);
  const variant={...definition,parts},sim=await physics.create(variant,moduleURL),initial=new Map(variant.parts.map(p=>[p.id,p]));
  let maxAngle=0,maxTravel=0;const failures=[];
  try{
    for(let tick=0;tick<definition.causality.counterfactualTicks;tick++){
      sim.step();const state=new Map(sim.state().map(p=>[p.id,p]));
      for(const id of downstream){const p=state.get(id),start=initial.get(id);maxAngle=Math.max(maxAngle,Math.abs(p.angle));maxTravel=Math.max(maxTravel,Math.hypot(p.x-start.x,p.y-start.y));}
    }
    if(maxAngle>definition.causality.maxRestAngle||maxTravel>definition.causality.maxRestTravel)failures.push({type:'disconnected-chain-moved',disabled,maxAngle,maxTravel});
    return {disabled,intervention:index<0?'source removed':'link clamped',downstream:downstream.length,ticks:sim.tick,maxAngle,maxTravel,failures,pass:failures.length===0};
  }finally{sim.dispose();}
}

export async function verifyCausality(definition){
  const positive=await auditCausality(definition),controls=[];
  // Remove the ball, then physically clamp each predecessor in a separate test world.
  for(const id of [definition.causality.source,...definition.causality.targets.slice(0,-1)])controls.push(await disconnected(definition,id));
  // The gate must detect the exact two regressions found in the preview.
  const first=definition.causality.targets[0],mutations=[];
  for(const name of ['pretilted','ramp-overlap']){
    const ramp=definition.parts.find(p=>p.id==='ramp'),target=definition.parts.find(p=>p.id===first);
    const overlapX=ramp.x+Math.sign(target.x-ramp.x)*.9;
    const variant={...definition,parts:definition.parts.map(p=>p.id===first?{...p,...(name==='pretilted'?{angle:-.2}:{x:overlapX})}:p)};
    const result=await auditCausality(variant);
    const caught=result.failures.some(f=>f.id===first&&['not-armed-at-rest','motion-before-contact'].includes(f.type));
    mutations.push({name,caught,firstFailure:result.failures.find(f=>f.id===first)});
  }
  assert(positive.pass,'Contact-chain audit failed: '+JSON.stringify(positive.failures));
  assert(controls.every(c=>c.pass),'Disconnected chain moved: '+JSON.stringify(controls.filter(c=>!c.pass)));
  assert(mutations.every(m=>m.caught),'Regression gate accepted a known bad layout');
  return {name:definition.name,positive,controls,mutations,pass:true};
}
