// Falls use real course forces. Check release, independent joints and saved flight.
const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics'),C=require('../js/four-wheels-course'),T=require('../js/four-wheels-terrain');
const make=(kind='cliff',mode='all-swivel')=>{const w=new P.World(C.build(kind==='lake'?3:6),false,mode),pose=kind==='lake'?{x:1680,y:1100,a:0,vx:65,vy:0}:{x:710,y:722,a:Math.PI/2,vx:0,vy:3};Object.assign(w.body,pose);T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=w.body.a);w.syncFixedWheels();return w;};
const step=(w,s,input={})=>{for(let i=0;i<Math.ceil(s*120);i++)w.step(1/120,input);};
const commit=w=>{for(let i=0;i<600&&!w.fall;i++)w.step(1/120,{push:1});assert.ok(w.fall&&w.ragdoll);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function check(name,fn){fn();console.log('PASS '+name);}
const hanging=mode=>{const w=make('cliff',mode);Object.assign(w.body,{x:710,y:733,a:-Math.PI/2,vx:0,vy:0,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=w.body.a);w.syncFixedWheels();return w;};
for(const mode of ['all-swivel','front-swivel'])check('a stuck dangling shopper pops while the cart stays on the road with '+mode,()=>{
 const w=hanging(mode),cart={...w.body};assert.equal(w.shopper.feet,0);assert.equal(w.floorAt(w.shopper),null);step(w,.25);assert.equal(w.ragdoll,null,'a short recovery window remains');step(w,.35);assert.ok(w.fall?.shopperOnly&&w.ragdoll);assert.equal(w.falls,1);assert.equal(w.shopper.grip,0);
 step(w,.6,{push:1,turn:1,brake:1});assert.ok(w.shopper.z>40&&distance(w.shopper,w.body)>60);assert.equal(w.ground.count,4);assert.equal(w.ground.airborne,false);assert.ok(Math.abs(w.body.z-cart.z)<.01&&Math.hypot(w.body.x-cart.x,w.body.y-cart.y)<1,'the cart retains real road support');assert.equal(w.events.filter(e=>e.type==='fall-impact').length,0,'the parked cart never hits the lower plane');
 step(w,3);assert.equal(w.fall,null);assert.equal(w.ragdoll,null);assert.equal(w.falls,1);assert.equal(w.roomIndex,0);assert.equal(w.shopperHang,0);
});
check('the dangling grace period and shopper-only tumble survive saves',()=>{
 const w=hanging();step(w,.3);const waiting=structuredClone(C.snapshot(w)),r=hanging();assert.ok(C.restore(r,waiting));assert.equal(r.shopperHang,w.shopperHang);step(w,.4);step(r,.4);assert.deepEqual(r.body,w.body);assert.deepEqual(r.ragdoll,w.ragdoll);assert.ok(w.fall.shopperOnly);
 const airborne=structuredClone(C.snapshot(w)),continued=hanging();assert.ok(C.restore(continued,airborne));step(w,.4,{push:1,turn:1,brake:1});step(continued,.4);assert.deepEqual(continued.body,w.body);assert.deepEqual(continued.ragdoll,w.ragdoll);
 for(const change of [s=>s.shopperHang=-1,s=>s.shopperHang=2,s=>s.fall.shopperOnly='yes']){const bad=structuredClone(airborne);change(bad);assert.equal(C.restore(hanging(),bad),false);}
 const old=structuredClone(waiting);delete old.shopperHang;const upgraded=hanging();assert.ok(C.restore(upgraded,old));assert.equal(upgraded.shopperHang,0);
});
check('a cart following its released shopper over the lip counts one fall',()=>{
 const w=hanging();step(w,.6);assert.ok(w.fall.shopperOnly);Object.assign(w.body,{x:710,y:790,z:-40,vx:0,vy:15,vz:-10});w.ground.lastHeight=0;step(w,1/120);assert.equal(w.fall.shopperOnly,false);assert.equal(w.falls,1);step(w,4);assert.equal(w.fall,null);assert.equal(w.falls,1);
});
check('a recoverable edge overhang never releases the shopper',()=>{const w=make();step(w,.15);assert.equal(w.ragdoll,null);step(w,1.5,{push:-1});assert.equal(w.falls,0);assert.equal(w.ragdoll,null);assert.ok(w.body.y<705);});
for(const kind of ['cliff','lake'])for(const mode of ['all-swivel','front-swivel'])check(kind+' launches, tumbles, lands and catches with '+mode,()=>{
 const w=make(kind,mode);commit(w);const start={...w.shopper},initialUp=w.ragdoll.nodes[1].z-w.ragdoll.nodes[0].z,identity=[w.body,w.wheels,w.stock],initialNodes=structuredClone(w.ragdoll.nodes);assert.equal(w.shopper.grip,0);assert.equal(w.shopper.feet,0);assert.ok(w.ragdoll.nodes[0].vz>100);
 step(w,.4);assert.ok(w.shopper.z>start.z+25,'a clear upward pop');assert.ok(distance(w.shopper,w.body)>60,'the released body separates from the cart');assert.ok(w.ragdoll.nodes[1].z-w.ragdoll.nodes[0].z<0,'the torso turns upside down');assert.ok(initialUp>0);
 for(const [a,b]of [[5,7],[7,9],[6,8],[8,10],[3,11],[11,13],[4,12],[12,14]])assert.ok(Math.abs(distance(w.ragdoll.nodes[a],w.ragdoll.nodes[b])-distance(initialNodes[a],initialNodes[b]))<.12,'bones retain their length');
 let impact=false,bounce=false,impactZ;for(let i=0;i<420&&w.fall;i++){w.step(1/120,{push:1,turn:1,brake:1});if(w.ragdoll){assert.ok(T.validRagdoll(w.ragdoll));if(w.ragdoll.impactTime!==null){impact=true;impactZ??=w.shopper.z;bounce ||=w.shopper.z>impactZ+1||w.ragdoll.nodes.some(n=>n.vz>15);}}}
 assert.ok(impact&&bounce,'the limbs hit and rebound');assert.equal(w.fall,null);assert.equal(w.ragdoll,null);assert.equal(w.falls,1);assert.deepEqual([w.body,w.wheels,w.stock],identity);assert.equal(w.wheelMode,mode);assert.equal(w.roomIndex,kind==='lake'?1:0);assert.ok(w.shopper.feet>0);
});
check('released input cannot steer or tether the ragdoll',()=>{const w=make();commit(w);step(w,.2);const r=new P.World(C.build());assert.ok(C.restore(r,structuredClone(C.snapshot(w))));step(w,.4);step(r,.4,{push:1,turn:-1,brake:1});assert.deepEqual(w.ragdoll,r.ragdoll);assert.deepEqual(w.body,r.body);});
check('a saved tumble resumes exact joint positions and momentum',()=>{const w=make();commit(w);step(w,.55);const save=structuredClone(C.snapshot(w)),r=new P.World(C.build());assert.ok(C.restore(r,save));assert.deepEqual(w.ragdoll,r.ragdoll);step(w,.35);step(r,.35);assert.deepEqual(w.ragdoll,r.ragdoll);assert.deepEqual(w.body,r.body);assert.deepEqual(w.shopper,r.shopper);
 for(const change of [s=>s.ragdoll.nodes.pop(),s=>s.ragdoll.nodes[3].vx='bad',s=>s.ragdoll.lengths[0]=-1,s=>s.ragdoll.time=Infinity,s=>s.fall=null]){const bad=structuredClone(save);change(bad);assert.equal(C.restore(new P.World(C.build()),bad),false);}
 const old=structuredClone(save);delete old.ragdoll;const upgraded=new P.World(C.build());assert.ok(C.restore(upgraded,old));step(upgraded,1/120);assert.ok(upgraded.ragdoll,'existing mid-fall saves release on Continue');
});
console.log('All ragdoll launch, recovery and save checks passed.');
