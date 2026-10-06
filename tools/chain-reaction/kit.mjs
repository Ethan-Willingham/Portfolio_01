import assert from 'node:assert/strict';
import {fixtures,physics,moduleURL,hash,toolLock} from './core.mjs';
import {initialGeometry,depthLayers} from './geometry.mjs';
import {mass,materialData} from './materials.mjs';
import '../../js/chain-reaction-events.js';
import {pathToFileURL} from 'node:url';
export async function verifyKit(){
 const report=[],names=['sliding-latch','supported-cup','wheel-knocker'];
 for(const original of (await fixtures()).filter(f=>names.includes(f.name)))for(const mirrored of [false,true]){
  const d=mirrored?physics.mirror(original):original,sim=await physics.create(d,moduleURL);
  try{
   const geometry=initialGeometry(d,sim),layers=depthLayers(d);assert(geometry.pass,JSON.stringify(geometry));assert(layers.pass,JSON.stringify(layers));
   for(const p of d.parts.filter(p=>p.mass)){
    const material=materialData.materials[p.material];
    const expected=p.shape==='compound'?mass.compoundProperties(material,p.colliders,p.depth):mass.properties(material,p.shape==='ball'?{construction:'sphere',radius:p.radius}:{construction:p.construction||'box',width:p.width,height:p.height,depth:p.depth,thickness:p.thickness});
    assert(Math.abs(expected.mass-p.mass)<1e-14&&Math.abs(expected.inertia-p.inertia)<1e-14,'Stored kit mass: '+p.id);
    if(p.shape==='compound')assert(Math.abs(expected.centerOfMass.x-p.centerOfMass.x)<1e-14&&Math.abs(expected.centerOfMass.y-p.centerOfMass.y)<1e-14,'Compound CoM: '+p.id);
   }
   const watch=globalThis.ChainReaction.events.watch(sim,d);
   for(let n=0;n<d.ticks;n++){sim.step();if([1,120,d.ticks].includes(sim.tick)){const before=hash(sim.snapshot());watch.sample();assert.equal(hash(sim.snapshot()),before,'Transfer observer changed physics');}else watch.sample();}
   const events=watch.report();assert(events.pass,JSON.stringify(events));report.push({fixture:d.name,mirrored,geometry,layers,events,hash:hash(sim.snapshot())});
  }finally{sim.dispose();}
  const source=d.steps[0].from,target=d.steps[0].to,disconnected=structuredClone(d);disconnected.parts=disconnected.parts.filter(p=>p.id!==source);disconnected.joints=disconnected.joints.filter(j=>j.a!==source&&j.b!==source);
  const control=await physics.create(disconnected,moduleURL);try{control.step(2400);const b=control.bodies.get(target),start=d.parts.find(p=>p.id===target);assert(Math.abs(b.rotation()-(start.angle||0))<.025,'Disconnected recipient moved: '+d.name);assert(Math.abs(b.translation().x-start.x)<.04,'Disconnected recipient travelled: '+d.name);}finally{control.dispose();}
 }
 const supported=(await fixtures()).find(f=>f.name==='supported-cup'),early=structuredClone(supported);early.parts.find(p=>p.id==='mallet').spin=-3;
 const sim=await physics.create(early,moduleURL);try{const watch=globalThis.ChainReaction.events.watch(sim,early);for(let n=0;n<early.ticks;n++){sim.step();watch.sample();}assert(watch.report().failures.some(f=>f.type==='motion-before-contact'),'Early-motion mutation was accepted');}finally{sim.dispose();}
 const overlap=(await fixtures()).find(f=>f.name==='sliding-latch');overlap.parts.find(p=>p.id==='marble-out').x=14.4;
 const bad=await physics.create(overlap,moduleURL);try{assert(!initialGeometry(overlap,bad).pass,'Armed overlap was accepted');}finally{bad.dispose();}
 const excluded=structuredClone(supported);excluded.parts.push({id:'bad-depth',shape:'box',fixed:true,mount:'test fixture',x:2,y:5,width:.1,height:.1,depth:.2,z:.15,layer:1});assert(!depthLayers(excluded).pass,'Excluded visible collision was accepted');
 await assert.rejects(()=>physics.create({...supported,contactProfile:'unknown'},moduleURL),/Unknown contact profile/);
 const reversed=structuredClone(supported);[reversed.steps[0],reversed.steps[1]]=[reversed.steps[1],reversed.steps[0]];
 const order=await physics.create(reversed,moduleURL);try{const watch=globalThis.ChainReaction.events.watch(order,reversed);for(let n=0;n<reversed.ticks;n++){order.step();watch.sample();}assert(watch.report().failures.some(f=>f.type==='out-of-order'),'Reversed contact transfers were accepted');}finally{order.dispose();}
 const cached=structuredClone((await fixtures()).find(f=>f.name==='sliding-latch'));delete cached.contactProfile;
 const stale=await physics.create(cached,moduleURL);let reproduced;
 try{stale.step(cached.ticks);reproduced={gateY:stale.bodies.get('gate').translation().y,latchX:stale.bodies.get('latch').translation().x};assert(reproduced.gateY>.9&&reproduced.latchX>14.9,'Cached-contact reproduction changed');}finally{stale.dispose();}
 return {pass:true,report,disconnectedControls:report.length,mutationsRejected:5,cachedSupportReproduced:reproduced};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const release=await toolLock();try{console.log(JSON.stringify(await verifyKit(),null,2));}finally{await release();}}
