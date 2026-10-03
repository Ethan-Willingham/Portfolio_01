// Ordinary driving over the introductory humps, including the former flip speed.
const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics'),C=require('../js/four-wheels-course'),T=require('../js/four-wheels-terrain');
const dt=1/120;
function pose(mode,x,speed){
 const w=new P.World(C.build(1),false,mode);
 Object.assign(w.body,{x,y:1220,a:-Math.PI/2,vx:0,vy:-speed,omega:0});
 T.init(w,w.terrainGeometry);w.wheels.forEach(q=>Object.assign(q,{a:w.body.a,omega:0}));w.syncFixedWheels();return w;
}
for(const mode of ['all-swivel','front-swivel']){
 for(const x of [550,590,630])for(const speed of [0,35,70,100,150,210]){
  const w=pose(mode,x,speed);let pitch=0,roll=0;
  for(let i=0;i<600&&w.body.y>1100;i++){
   w.step(dt,{push:1});pitch=Math.max(pitch,Math.abs(w.body.pitch));roll=Math.max(roll,Math.abs(w.body.rollTilt));
   assert.equal(w.fall,null,'a supported introductory bump cannot become a cliff fall');
  }
  assert.ok(w.body.y<=1100,'a full push crosses both humps');
  assert.ok(pitch<.3&&roll<.2,JSON.stringify({mode,x,speed,pitch,roll}));
  for(let i=0;i<120;i++)w.step(dt,{brake:1});
  assert.equal(w.falls,0);assert.ok(Math.abs(w.body.pitch)<.04&&Math.abs(w.body.rollTilt)<.04,'braking settles the cart before the turn');
 }
 console.log('PASS low-speed and full-speed bump approaches, centered and off-center, in '+mode);
}
// The transverse ends cannot hide a vertical wall in otherwise flat asphalt.
const level=C.build(),b=level.terrain.bumps;
for(const center of b.centers)for(const side of [-1,1]){
 const edge={x:b.x+side*b.width/2,y:b.y-center};
 assert.ok(T.height(level,edge)<1e-10);
 assert.ok(T.height(level,{...edge,x:edge.x-side*.3})<.02);
}
console.log('PASS the rounded ends meet the road continuously');
const w=pose('all-swivel',590,0);
Object.assign(w.body,{x:440,y:1520,a:0,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=0);
Object.assign(w.body,{rollTilt:.85,rollRate:.7,z:4.5});let restored=false;
for(let i=0;i<120;i++){
 w.step(dt,{turn:Math.abs(w.body.rollTilt)>.12?-Math.sign(w.body.rollTilt):0,brake:.5});
 restored ||=Math.abs(w.body.rollTilt)<.1&&w.wheels.every(q=>q.load>.1);
}
assert.ok(restored,'countersteering catches a moving tip within one second');assert.equal(w.falls,0);
console.log('PASS a physical balance correction responds within one second');
