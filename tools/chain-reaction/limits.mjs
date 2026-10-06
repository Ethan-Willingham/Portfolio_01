import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,physics,moduleURL,fixtures,hash} from './core.mjs';
import {materialData,mass} from './materials.mjs';
export const thresholds=JSON.parse(await readFile(resolve(ROOT,'js/chain-reaction-thresholds.json')));
export function inEnvelope(p,envelope,direction=1){
 const speed=p.vx*direction,spin=p.spin*direction,r=thresholds.hero.radius;
 return speed>=envelope.speedMin&&speed<=envelope.speedMax&&p.y>=envelope.heightMin&&p.y<=envelope.heightMax&&Math.abs(p.vy)<=envelope.verticalSpeedMax&&Math.abs(spin+speed/r)<=envelope.rollingSlipSpinMax;
}
export function railDefinition(e,mirrored=false){
 const hero=thresholds.hero,properties=mass.properties(materialData.materials[hero.material],{construction:'sphere',radius:hero.radius});
 const definition={parts:[{id:'rail',shape:'box',fixed:true,mount:'port stand',x:0,y:.95,width:4,height:.1,friction:.45,restitution:.05},{id:'marble',shape:'ball',x:-1.7,y:1.15625+e.offset,radius:hero.radius,...properties,vx:e.vx,vy:e.vy,spin:-e.vx/hero.radius+e.slip,friction:hero.friction*e.friction,restitution:hero.restitution*e.restitution}]};
 return mirrored?physics.mirror(definition):definition;
}
export async function measureLimits(){
 const spikes=[];
 for(const definition of await fixtures()){
  const sim=await physics.create(definition,moduleURL),parts=new Map(definition.parts.map(p=>[p.id,p]));let peakSpeed=0,peakSurfaceSpeed=0;
  try{for(let n=0;n<definition.ticks;n++){sim.step();for(const p of sim.state()){
   if(parts.get(p.id).fixed)continue;const q=parts.get(p.id),radius=q.shape==='ball'?q.radius:Math.sqrt(q.width*q.width+q.height*q.height)/2;
   const speed=Math.sqrt(p.vx*p.vx+p.vy*p.vy);peakSpeed=Math.max(peakSpeed,speed);peakSurfaceSpeed=Math.max(peakSurfaceSpeed,speed+Math.abs(p.spin)*radius);
  }}}finally{sim.dispose();}
  spikes.push({name:definition.name,peakSpeed,peakSurfaceSpeed,overStageSpeedCap:peakSpeed>thresholds.velocityCap});
 }
 // The CCD stress fixture intentionally exceeds the proposed stage speed cap.
 assert(spikes.filter(s=>s.name!=='ccd').every(s=>!s.overStageSpeedCap),'Ordinary isolation exceeds speed cap');
 const ccd=[];const original=(await fixtures()).find(f=>f.name==='ccd');
 for(const speed of [40,80,120])for(const mirrored of [false,true]){
  let definition={...original,parts:original.parts.map(p=>p.id==='fast'?{...p,vx:speed}:p)};if(mirrored)definition=physics.mirror(definition);
  const sim=await physics.create(definition,moduleURL);let penetrated=false;
  try{for(let n=0;n<240;n++){sim.step();const p=sim.state().find(p=>p.id==='fast');if(mirrored?p.x<4.15:p.x>11.85)penetrated=true;}}
  finally{sim.dispose();}assert(!penetrated,'CCD crossed thin wall');ccd.push({speed,mirrored,pass:!penetrated});
 }
 const baton=thresholds.baton;
 const entries=[];
 for(const vx of [3.2,4,4.8])for(const slip of [-2,2])for(const offset of [-.004,.02])for(const vy of [-.3,.3])for(const friction of [.9,1.1])for(const restitution of [.9,1.1])entries.push({vx,slip,offset,vy,friction,restitution});
 entries.push({vx:4,slip:0,offset:0,vy:0,friction:1,restitution:1},{vx:3.5,slip:.8,offset:.01,vy:.05,friction:1,restitution:1},{vx:4.5,slip:-.8,offset:.015,vy:-.05,friction:.95,restitution:1.05},{vx:4.3,slip:.2,offset:.005,vy:0,friction:1.05,restitution:.95});
 const rails=[];
 for(const mirrored of [false,true])for(let index=0;index<entries.length;index++){
  const e=entries[index],definition=railDefinition(e,mirrored);
  const sim=await physics.create(definition,moduleURL);let crossing=null,snapshotHash;
  try{for(let n=0;n<240;n++){sim.step();const p=sim.state().find(p=>p.id==='marble');if(mirrored?p.x<=16:p.x>=0){crossing={...p,tick:sim.tick};snapshotHash=hash(sim.snapshot());break;}}}
  finally{sim.dispose();}
  assert(crossing,'Rail crossing absent');assert(crossing.y>=baton.emit.heightMin&&crossing.y<=baton.emit.heightMax&&Math.abs(crossing.vy)<=baton.emit.verticalSpeedMax,'Rail did not settle bounce: '+JSON.stringify({e,mirrored,crossing}));
  const canonical=index===96;const insideEmit=inEnvelope(crossing,baton.emit,mirrored?-1:1);if(canonical)assert(insideEmit,'Canonical rolling state outside EMIT');
  rails.push({index,mirrored,entry:e,crossing,snapshotHash,canonical,insideEmit});
 }
 assert(baton.emit.speedMin>=baton.accept.speedMin&&baton.emit.speedMax<=baton.accept.speedMax&&baton.emit.heightMin>=baton.accept.heightMin&&baton.emit.heightMax<=baton.accept.heightMax&&baton.emit.verticalSpeedMax<=baton.accept.verticalSpeedMax&&baton.emit.rollingSlipSpinMax<=baton.accept.rollingSlipSpinMax,'EMIT is not a subset of ACCEPT');
 const canonical=baton.canonical;assert(inEnvelope(canonical,baton.emit));
 const rejects=[{...canonical,vx:4.081},{...canonical,y:1.160251},{...canonical,vy:.201},{...canonical,spin:-25.09}];
 assert(rejects.every(p=>!inEnvelope(p,baton.emit)),'Envelope accepted an out-of-bounds state');
 const restFixture=(await fixtures()).find(f=>f.name==='marble-dominoes'),rest=await physics.create({...restFixture,parts:restFixture.parts.filter(p=>p.id!=='marble')},moduleURL);let restSpeed=0;
 try{for(let n=0;n<2400;n++){rest.step();if(n>240)for(const p of rest.state().filter(p=>p.id.startsWith('domino')))restSpeed=Math.max(restSpeed,Math.sqrt(p.vx*p.vx+p.vy*p.vy)+Math.abs(p.spin)*.655);}}
 finally{rest.dispose();}assert(restSpeed<thresholds.minimumPathSurfaceSpeed/100,'Rest motion too close to motion threshold');
 // For quintic smoothstep, max absolute jerk is 60 * displacement / duration cubed.
 const camera=[{distance:4,duration:1.5},{distance:16,duration:2.3}].map(p=>({...p,jerk:60*p.distance/(p.duration*p.duration*p.duration)}));
 assert(camera.every(p=>p.jerk<=thresholds.camera.translationJerkCap));
 const fastPanJerk=60*16/(1.2*1.2*1.2);assert(fastPanJerk>thresholds.camera.translationJerkCap);
 const handoffFrames=[{width:1440,height:900},{width:844,height:390},{width:390,height:844}].map(view=>({...view,heroDiameterCSS:thresholds.hero.radius*2*view.height/Math.max(thresholds.camera.handoffMinimumHeight,thresholds.camera.handoffWidth/(view.width/view.height))}));
 assert(handoffFrames.every(view=>view.heroDiameterCSS>=12),'Proposed handoff framing loses marble');
 const revealJerk=60*Math.log(14/9.3)/(1.2*1.2*1.2);assert(revealJerk<=thresholds.camera.logZoomJerkCap);
 return {pass:true,spikes,ccd,rails,canonicalPassed:2,railCornersPassed:rails.length,emitNormalizationBuilt:false,restSurfaceSpeed:restSpeed,camera:{handoffFrames,samples:camera,rejectedFastPanJerk:fastPanJerk,revealLogJerk:revealJerk},thresholds};
}

// Standalone evidence run; importing this module never writes files.
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 const core=await import('./core.mjs'),release=await core.toolLock(),clear=core.deadline(300000);
 try{console.log(JSON.stringify(await measureLimits(),null,2));}finally{clear();await release();}
}
