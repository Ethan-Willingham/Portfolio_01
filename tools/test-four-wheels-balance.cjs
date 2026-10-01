// Physical outcomes under the same controls offered to players.
const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics'),C=require('../js/four-wheels-course'),T=require('../js/four-wheels-terrain');
const make=()=>{const w=new P.World(C.build());Object.assign(w.body,{x:440,y:1520,a:0,vx:0,vy:0,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=0);return w;};
const step=(w,seconds,input={})=>{for(let i=0;i<seconds*120;i++)w.step(1/120,input);};
function check(name,fn){fn();console.log('PASS '+name);}
check('the same moving sideways tip is recoverable by countersteering',()=>{
 const saved=make(),coasting=make(),wrong=make();for(const w of [saved,coasting,wrong])Object.assign(w.body,{rollTilt:.75,rollRate:.7,z:4.5});
 for(let i=0;i<300;i++)saved.step(1/120,{turn:Math.abs(saved.body.rollTilt)>.12?-Math.sign(saved.body.rollTilt):0,brake:.5});step(coasting,2.5);step(wrong,2.5,{turn:1});
 assert.ok(Math.abs(saved.body.rollTilt)<.1&&saved.wheels.every(q=>q.load>.1));assert.ok(Math.abs(coasting.body.rollTilt)>.25);assert.ok(Math.abs(wrong.body.rollTilt)>.3);assert.equal(saved.falls,0);
});
check('low wheel-height and high basket-height impacts produce opposite pitch reactions',()=>{
 for(const [height,sign]of [[4,1],[30,-1]]){const w=make();w.body.vx=65;const hit={x:461,y:1520,nx:-1,ny:0,depth:0,cartZ:height},j=w.impulse(hit);assert.ok(j>10&&w.body.pitchRate*sign>.3);const point={x:hit.x,y:hit.y,z:height},v=T.velocity(w.body,T.contactAt(w.body,point,{x:-1,y:0,z:0}).k);assert.ok(v.x<1,'the actual point of impact stops approaching the wall');}
});
check('the basket and frame land on solid ground without turning a road tip into a cliff fall',()=>{
 const w=make();Object.assign(w.body,{rollTilt:1.7,rollRate:.8,z:14});step(w,2.5);assert.equal(w.falls,0);assert.equal(w.fall,null);const shape=P.cartHull(w.body);assert.ok(Math.min(...shape.map(p=>p.z))>-.6);assert.ok(Math.abs(w.body.rollTilt)>.7);
});
check('the shopper keeps a separate stance and flexes while the cart rocks over all four bumps',()=>{
 const w=new P.World(C.build(1));Object.assign(w.body,{x:590,y:1220,a:-Math.PI/2,vx:0,vy:-35});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=w.body.a);let tilt=0,separation=0,crouch=0;
 for(let i=0;i<330;i++){w.step(1/120,w.body.y>1080?{push:1}:{brake:1});tilt=Math.max(tilt,Math.abs(w.body.pitch));const welded=T.kinematics(w.body,-16,0,18).p;separation=Math.max(separation,Math.hypot(w.shopper.x-welded.x,w.shopper.y-welded.y,w.shopper.z-welded.z));crouch=Math.max(crouch,w.shopper.crouch);}
 assert.ok(tilt>.07&&tilt<.75);assert.ok(separation>3&&crouch>.2);assert.equal(w.falls,0);assert.ok(w.body.y<1080);
});
check('a door contacts the independent shopper without a phantom rigid-body hit',()=>{
 for(const touching of [false,true]){const w=make();Object.assign(w.body,{x:490,y:1520,vx:-20});T.init(w,w.terrainGeometry);const d={...w.trackDoors[0],cx:474,cy:1500,a:Math.PI/2,rest:Math.PI/2,length:40,omega:0,broken:false};w.trackDoors=[d];Object.assign(w.shopper,{x:touching?474:460,y:1520,vx:-20});w.courseDoors(0);assert.equal(w.body.vx,-20);if(touching){assert.ok(w.shopper.vx>-20&&Math.abs(d.omega)>.01);}else{assert.equal(w.shopper.vx,-20);assert.equal(d.omega,0);}}
});
check('3D rotation preserves the cart dimensions through a full tumble',()=>{
 const w=make();Object.assign(w.body,{z:160,pitchRate:5,rollRate:3});Object.assign(w.shopper,{z:178,feet:0});w.ground.feet=0;w.ground.airborne=true;w.wheels.forEach(q=>q.load=0);
 for(let i=0;i<65;i++){w.step(1/120);const a=T.kinematics(w.body,-3,-11,31).p,b=T.kinematics(w.body,31,11,31).p;assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)-Math.hypot(34,22))<1e-7);assert.ok(Math.abs(Math.hypot(w.body.qw,w.body.qx,w.body.qy,w.body.qz)-1)<1e-9);}
});
check('a save preserves an active recovery, including the shopper spring momentum',()=>{
 const w=make();Object.assign(w.body,{rollTilt:.75,rollRate:.7,z:4.5});step(w,.18,{turn:-1});const restored=make(),save=JSON.parse(JSON.stringify(C.snapshot(w)));assert.ok(C.restore(restored,save));step(w,.45,{turn:-1});step(restored,.45,{turn:-1});assert.deepEqual(restored.body,w.body);assert.deepEqual(restored.shopper,w.shopper);
 for(const change of [q=>q.body.qw=2,q=>q.shopper.vz='bad',q=>q.shopper.grip=-1]){const bad=structuredClone(save);change(bad);assert.equal(C.restore(make(),bad),false);}
});
check('a v22 run retains its record position, stock and relay when upgrading the body model',()=>{
 const w=make();step(w,.2,{push:1});w.circuit.powered=true;w.circuit.lift=1;const save=JSON.parse(JSON.stringify(C.snapshot(w)));save.version=2;delete save.shopper;for(const k of ['comX','qw','qx','qy','qz','tiltPitch','tiltRoll'])delete save.body[k];save.body.comHeight=22;save.ground.count=6;const r=make();assert.ok(C.restore(r,save));assert.equal(r.time,w.time);assert.equal(r.circuit.powered,true);assert.equal(r.body.comHeight,16);assert.equal(r.stock.items.length,w.stock.items.length);step(r,.5);assert.equal(r.falls,0);
});
console.log('All balance, body-contact and flexible-shopper checks passed.');
