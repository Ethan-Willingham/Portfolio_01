// A shopper slipping off a lip must be able to stand and drive again.
const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics'),C=require('../js/four-wheels-course'),T=require('../js/four-wheels-terrain');
const step=(w,seconds,input={})=>{for(let i=0;i<seconds*120;i++)w.step(1/120,input);};
function edge(mode='all-swivel',speed=0){
 const w=new P.World(C.build(6));Object.assign(w.body,{x:710,y:727,a:-Math.PI/2,vx:0,vy:-speed,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=w.body.a);w.setWheelMode(mode);return w;
}
function check(name,fn){fn();console.log('PASS '+name);}
check('feet alone slipping off the edge replant under held push in both wheel modes',()=>{
 for(const mode of ['all-swivel','front-swivel'])for(const speed of [0,3]){
  const w=edge(mode,speed);assert.equal(w.shopper.feet,0);assert.equal(w.ground.feet,0);assert.equal(w.floorAt(w.shopper),null);assert.ok(w.wheels.every(q=>q.load>0));
  let low=18,replanted=false;for(let i=0;i<120;i++){w.step(1/120,{push:1});low=Math.min(low,w.shopper.z);replanted||=w.shopper.feet>0;}
  assert.ok(replanted&&w.shopper.feet>.7);assert.ok(low>8,'a short stumble does not drop the torso under the platform');assert.ok(w.body.y<710&&w.body.vy< -25,'held push resumes without resetting input');assert.equal(w.falls,0);
 }
});
check('a stationary shopper steps in and stays planted, then push, pull and steering still work',()=>{
 for(const input of [{push:1},{push:-1},{turn:1}]){
  const w=edge();step(w,3);assert.ok(w.shopper.feet>.7&&w.floorAt(w.shopper));assert.equal(w.falls,0);const before={...w.body};step(w,.25,input);
  if(input.turn)assert.ok(Math.abs(P.wrap(w.body.a-before.a))>.12);else assert.ok((w.body.vx*Math.cos(before.a)+w.body.vy*Math.sin(before.a))*input.push>8);
 }
});
check('an oblique approach and sideways overhang can find a nearby foothold',()=>{
 for(const angle of [-Math.PI/2-.4,-Math.PI/2+.4]){
  const w=edge();w.body.a=angle;T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=angle);assert.equal(w.shopper.feet,0);step(w,1,{push:1});assert.ok(w.shopper.feet>.7&&w.body.y<710);assert.equal(w.falls,0);
 }
 const w=edge();Object.assign(w.body,{y:741,a:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>q.a=0);assert.equal(w.shopper.feet,0);step(w,.5);assert.ok(w.shopper.feet>.7,'a supported step beside the handle also works');assert.equal(w.falls,0);
});
check('existing saves with the shopper below the lip recover without discarding progress or mess',()=>{
 const w=edge();Object.assign(w.body,{y:725});Object.assign(w.shopper,{y:739,z:-1,vz:0,feet:0});w.ground.feet=0;w.stock.spill('water',650,700,6);const save=JSON.parse(JSON.stringify(C.snapshot(w))),r=edge();assert.ok(C.restore(r,save));const stock=r.stock,gate=r.gate;
 step(r,.2);assert.equal(r.shopper.feet,0,'arms lift before feet can provide traction');assert.ok(r.shopper.z>0&&r.shopper.z<8,'standing up is gradual');
 const continued=edge();assert.ok(C.restore(continued,JSON.parse(JSON.stringify(C.snapshot(r)))));step(r,.6,{push:1});step(continued,.6,{push:1});assert.deepEqual(continued.body,r.body);assert.deepEqual(continued.shopper,r.shopper);
 assert.ok(r.shopper.feet>.7&&r.shopper.z>12&&r.body.vy< -10);assert.equal(r.stock,stock);assert.equal(r.gate,gate);assert.ok(r.stock.liquids.get('water').cells.size>0);assert.equal(r.falls,0);
});
check('a shopper far below the road cannot step through the platform underside',()=>{
 const w=edge();Object.assign(w.body,{y:725});Object.assign(w.shopper,{y:739,z:-30,vz:0,feet:0});w.ground.feet=0;step(w,.05,{push:1});assert.equal(w.shopper.feet,0);assert.ok(w.shopper.z<0,'the existing arm tether cannot turn a deep drop into immediate floor contact');
});
check('a fully airborne cart cannot use the stepping assist to gain traction',()=>{
 const coast=edge(),drive=edge();for(const w of [coast,drive]){w.body.z=8;w.body.vz=15;w.ground.airborne=true;w.ground.count=0;w.ground.feet=0;w.wheels.forEach(q=>q.load=0);}
 step(coast,.05);step(drive,.05,{push:1,turn:1,brake:1});assert.equal(drive.shopper.feet,0);assert.deepEqual(drive.body,coast.body);assert.deepEqual(drive.shopper,coast.shopper);
});
console.log('All foot slip, replanting and continued-control checks passed.');
