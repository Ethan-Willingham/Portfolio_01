const assert=require('node:assert/strict');
const Levels=require('../js/four-wheels-levels.js');
const {World,casterPose,footprint}=require('../js/four-wheels-physics.js');
const drive=require('./four-wheels-driver.cjs');
const dt=1/120;
const step=(w,t,input={})=>{for(let i=0;i<Math.ceil(t/dt);i++)w.step(dt,input);};
function check(name,fn){fn();console.log('PASS '+name);}
check('the six rooms share one world with supported connecting corridors',()=>{
  const w=new World(Levels.journey());assert.equal(w.level.rooms.length,6);assert.equal(w.level.portals.length,5);
  for(const p of w.level.portals)for(let t=0;t<=56;t+=2)for(const y of [-24,0,24]) {
    assert.ok(w.isFloor({x:p.x+p.nx*t-p.ny*y,y:p.y+p.ny*t+p.nx*y}),'the cart has floor all the way through each corridor');
  }
  for(const r of w.level.rooms){assert.ok(w.isFloor(r.spawn),'a room entrance must be safe');assert.ok(r.openings);}
});
check('doorways unlock in route order and leave their jambs solid',()=>{
  const w=new World(Levels.journey()),p=w.level.portals[0];
  assert.ok(w.activeWalls().includes(p.barrier));w.gate=p.opensAt;
  assert.ok(!w.activeWalls().includes(p.barrier));assert.ok(w.activeWalls().includes(w.level.portals[1].barrier));
  Object.assign(w.body,{x:414,y:170,a:0});w.wheels.forEach(q=>q.a=0);step(w,2,{push:1});
  assert.equal(w.roomIndex,0);assert.ok(w.body.x<445);assert.ok(w.boundaryContacts.length);
});
check('crossing a doorway preserves body, wheels, clock, gait, stock and spills',()=>{
  const w=new World(Levels.journey()),p=w.level.portals[0];w.gate=p.opensAt;
  Object.assign(w.body,{x:430,y:p.y,a:0,vx:60,vy:0,omega:0});w.wheels.forEach(q=>{q.a=0;q.roll=123;});
  w.stock.spill('wine',130,220,12);const body=w.body,wheels=w.wheels,stock=w.stock,vase=w.stock.items[0];let crossings=0,lastX=w.body.x;
  for(let i=0;i<360;i++) {
    const before=w.roomIndex;w.step(dt,{push:1});assert.equal(w.body,body);assert.equal(w.wheels,wheels);assert.equal(w.stock,stock);assert.equal(w.stock.items[0],vase);
    assert.ok(Math.abs(w.body.x-lastX)<2,'no teleport at the seam');lastX=w.body.x;
    if(before!==w.roomIndex){crossings++;assert.ok(w.body.vx>60);assert.ok(w.wheels.every(q=>q.roll>123));assert.ok(w.gait.phase>0);}
  }
  assert.equal(crossings,1);assert.equal(w.roomIndex,1);assert.equal(w.status,'running');assert.ok(w.time>2.9);assert.equal(w.gate,3);
  assert.ok(Math.abs([...w.stock.liquids.get('wine').cells.values()].reduce((a,v)=>a+v,0)-12)<1e-6);
});
check('later-room water is indexed separately and stays under those wheels',()=>{
  const w=new World(Levels.journey()),p={x:1200,y:580};w.stock.spill('water',p.x,p.y,32);
  assert.equal(w.stock.sample(p.x,p.y).kind,'water');assert.equal(w.stock.sample(160,240).kind,null);
  assert.ok(w.stock.cols>120);assert.ok([...w.stock.liquids.get('water').cells.keys()].every(k=>k>=0));
});
check('lakes remove wheel support, gravity keeps momentum, and recovery charges once',()=>{
  const w=new World(Levels.journey()),h=w.level.hazards[0],b=w.body;w.roomIndex=3;w.safePose={...w.level.rooms[3].spawn};
  Object.assign(b,{x:h.x-h.rx-9,y:h.y,a:0,vx:70,vy:0,omega:0});w.wheels.forEach(q=>q.a=0);
  const stock=w.stock,startX=b.x,startGate=w.gate;w.step(dt);
  assert.equal(w.fall?.kind,'lake');assert.equal(w.penalty,8);assert.equal(w.falls,1);
  step(w,.3,{turn:1,push:-1,brake:1});assert.ok(b.z< -7);assert.ok(b.x>startX+18);assert.ok(Math.abs(b.a)<.01,'airborne input cannot instantly steer the fall');
  step(w,.9);assert.equal(w.fall,null);assert.equal(w.stock,stock);assert.equal(w.gate,startGate);assert.equal(w.penalty,8);
  assert.equal(b.x,w.safePose.x);assert.equal(b.y,w.safePose.y);assert.equal(b.z,0);assert.ok(w.isFloor(b));
});
check('an unguarded cliff is a real fall while adjacent walls remain solid',()=>{
  const w=new World(Levels.journey()),r=w.level.rooms[2];w.roomIndex=2;w.safePose={...r.spawn};
  Object.assign(w.body,{x:r.x+462,y:r.y+220,a:0,vx:70,vy:0,omega:0});w.wheels.forEach(q=>q.a=0);w.step(dt);
  assert.equal(w.fall?.kind,'cliff');step(w,.3);assert.ok(w.body.z< -7&&Math.abs(w.body.pitch)>.1);
  const solid=new World(Levels.journey());Object.assign(solid.body,{x:r.x+430,y:r.y+110,a:0,vx:70,vy:0,omega:0});solid.wheels.forEach(q=>q.a=0);step(solid,2,{push:1});
  assert.equal(solid.fall,null);assert.ok(solid.body.x<r.x+445);assert.ok(solid.boundaryContacts.length);
});
check('timeout still applies during a fall, and practice keeps recovering',()=>{
  const level=Levels.journey(),h=level.hazards[0];
  const w=new World({...level,limit:.1});Object.assign(w.body,{x:h.x,y:h.y,a:0});w.step(dt);step(w,.2);assert.equal(w.status,'lost');
  const practice=new World({...level,limit:.1},true);Object.assign(practice.body,{x:h.x,y:h.y,a:0});practice.step(dt);step(practice,1.3);assert.equal(practice.status,'running');assert.equal(practice.fall,null);
});
check('the whole connected trip is driveable with player controls before closing',()=>{
  const w=new World(Levels.journey());const seen=new Set([0]);
  for(let i=0;i<w.level.limit*120&&w.status==='running';i++){w.step(dt,drive(w));seen.add(w.roomIndex);}
  console.log('Journey: '+JSON.stringify({status:w.status,gate:w.gate,time:w.time,penalty:w.penalty,falls:w.falls,body:w.body,room:w.roomIndex}));
  assert.equal(w.status,'won','no blocked route or forced hazard');assert.equal(w.gate,w.level.gates.length);assert.equal(seen.size,6);assert.equal(w.falls,0,'the marked route has a safe way around every hazard');
  assert.ok(footprint(w.body,w.wheels).every(p=>p.x<0));
});

check('each later starting room can still reach checkout without a forced fall',()=>{
  for(let room=1;room<6;room++) {
    const w=new World(Levels.journey(room));
    for(let i=0;i<w.level.limit*120&&w.status==='running';i++)w.step(dt,drive(w));
    assert.equal(w.status,'won','starting room '+room);assert.equal(w.falls,0,'safe route from starting room '+room);
  }
});
