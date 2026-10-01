const assert=require('node:assert/strict');
const Physics=require('../js/four-wheels-physics.js'),Tricks=require('../js/four-wheels-tricks.js'),Stock=require('../js/four-wheels-stock.js');
const {World}=Physics,dt=1/120;
const fixture={name:'style fixture',start:{x:110,y:142,a:0},limit:300,par:100,shelves:[],objects:[],gates:[{x:420,y:260}],exit:{side:'right',center:150,width:80}};
const step=(w,t,input={})=>{for(let i=0;i<Math.round(t/dt)&&w.status==='running';i++)w.step(dt,input);};
function test(name,fn){fn();console.log('PASS '+name);}
test('near clearance includes protruding tires and the actual shopper circle',()=>{
 const w=new World({...fixture,shelves:[{x:200,y:160,w:32,h:32,kind:'table'}]}),g=w.tricks.geometry;
 const parts=[g.corners(w.body),...w.wheels.map((q,i)=>g.casterCorners(w.body,q,i))],person=g.point(w.body,g.BODY.personX,0);
 Object.assign(w.body,{x:210,y:142});const moved=[g.corners(w.body),...w.wheels.map((q,i)=>g.casterCorners(w.body,q,i))];
 const gap=w.tricks.gapTo(w.shelves[0],moved,g.point(w.body,g.BODY.personX,0));assert.ok(gap.gap>3.9&&gap.gap<4.2);
 const cartOnly=Tricks.polygonGap(g.corners(w.body),Stock.shelfPolygon(w.shelves[0]),Stock.polygonContact);assert.ok(cartOnly.gap>6);
 const behind={x:187,y:142,radius:4};assert.equal(w.tricks.gapTo(behind,moved,g.point(w.body,g.BODY.personX,0)).gap,0);
 assert.ok(parts.length===5&&person.x===94);
});
test('a clean pass rewards once only after clearing an intact table',()=>{
 const w=new World({...fixture,start:{x:80,y:142,a:0},shelves:[{x:200,y:160,w:32,h:32,kind:'table'}]});w.body.vx=70;
 step(w,1,{push:.35});assert.equal(w.tricks.counts.near,0,'still beside the obstacle');
 step(w,2,{push:.35});assert.equal(w.tricks.counts.near,1);assert.equal(w.bonus,1);assert.equal(w.penalty,0);assert.equal(w.shelves[0].spilled,false);
 const event=w.events.find(e=>e.type==='trick');assert.equal(event.kind,'near');assert.ok(event.clearance<=6&&event.clearance>.15);
 w.tricks.nearMisses(80);assert.equal(w.tricks.counts.near,1);
});
test('actual tire and basket impacts never become near misses on that pass',()=>{
 for(const y of [149,162]){
  const w=new World({...fixture,start:{x:80,y,a:0},shelves:[{x:200,y:160,w:32,h:32,kind:'table'}]});w.body.vx=70;let contact=false;
  for(let i=0;i<480;i++){w.step(dt,{push:.35});contact||=w.trickHit;}
  assert.ok(contact);assert.equal(w.tricks.counts.near,0);
 }
});
test('a close cone pass uses the prop radius and does not knock it over',()=>{
 const w=new World({...fixture,start:{x:80,y:142,a:0},objects:[{kind:'cone',x:200,y:165}]});w.body.vx=75;step(w,3,{push:.35});
 assert.equal(w.objects[0].down,false);assert.equal(w.penalty,0);assert.equal(w.tricks.counts.near,1);
});
test('moving 180 and 360 rotations upgrade the same clean maneuver across angle wrapping',()=>{
 for(const direction of [-1,1]) {
  const w=new World(fixture);w.body.vx=75;step(w,4,{turn:direction});
  const events=w.events.filter(e=>e.type==='trick');assert.equal(events[0].kind,'half');assert.equal(events[1].kind,'full');
  assert.equal(events[1].upgrade,true);assert.equal(events[1].direction,direction);assert.equal(events[1].combo,1);
  assert.equal(w.tricks.counts.half,0);assert.equal(w.tricks.counts.full,1);assert.equal(w.bonus,3);assert.equal(w.tricks.score,350);
 }
});
test('spinning in place and changing direction cannot accumulate free rotations',()=>{
 const parked=new World(fixture);step(parked,6,{turn:1});assert.equal(parked.tricks.score,0);assert.equal(parked.bonus,0);
 const wiggle=new World(fixture);wiggle.body.vx=70;for(let i=0;i<4;i++){step(wiggle,.5,{turn:1});step(wiggle,.5,{turn:-1});}
 assert.equal(wiggle.tricks.counts.half+wiggle.tricks.counts.full,0);
});
test('one continuous rotation can pay a full spin only once',()=>{
 const w=new World(fixture);w.body.vx=75;step(w,5,{turn:1});assert.equal(w.tricks.counts.full,1);assert.equal(w.bonus,3);
});
test('a sustained sideways coast is a slide while straight and brief glides are not',()=>{
 const side=new World({...fixture,start:{x:230,y:100,a:0}});side.body.vy=65;step(side,.3);assert.equal(side.tricks.counts.slide,0);step(side,.45);assert.equal(side.tricks.counts.slide,1);
 const straight=new World(fixture);straight.body.vx=65;step(straight,1);assert.equal(straight.tricks.counts.slide,0);
});
test('combos multiply style, upgrades do not multiply themselves, and the clock bonus is bounded',()=>{
 const w=new World(fixture),s=w.tricks;w.time=20;
 s.award('near',100,100);s.award('half',100,100);assert.equal(s.combo,2);s.award('full',100,100,true);assert.equal(s.combo,2);
 assert.equal(s.score,75+200+500);assert.equal(w.bonus,4);assert.equal(s.counts.half,0);
 for(let i=0;i<30;i++)s.award('near',100,100);assert.equal(w.bonus,Tricks.BONUS_CAP);assert.equal(s.combo,4);
 assert.equal(w.remaining,w.level.limit-w.time-w.penalty+12);assert.equal(w.result.bonus,12);assert.equal(w.result.style,s.score);
 s.interrupt();assert.equal(s.combo,0);assert.equal(s.score,w.result.style);assert.equal(w.bonus,12);assert.ok(w.events.some(e=>e.type==='combo-break'));
});
test('a clean combo expires on simulation time and collisions reset unbanked spin progress',()=>{
 const w=new World(fixture);w.tricks.award('near',100,100);step(w,5.1);assert.equal(w.tricks.combo,0);assert.equal(w.tricks.score,75);
 const hit=new World({...fixture,start:{x:400,y:142,a:0}});hit.body.vx=75;let contacts=0;for(let i=0;i<216;i++){hit.step(dt,{turn:1});if(hit.trickHit){contacts++;assert.equal(hit.tricks.spin,null);}}assert.ok(contacts>0);assert.equal(hit.tricks.counts.half+hit.tricks.counts.full,0);
});
test('falls and pose jumps cannot grant a spin or carry a combo through recovery',()=>{
 const levels=require('../js/four-wheels-levels.js'),w=new World(levels.journey());w.tricks.award('near',1,1);w.tricks.award('half',1,1);
 const h=w.level.hazards[0];Object.assign(w.body,{x:h.x,y:h.y,vx:60,a:0});step(w,.1,{turn:1});assert.equal(w.tricks.combo,0);assert.equal(w.tricks.spin,null);assert.equal(w.bonus,2);
 step(w,1.2);assert.equal(w.tricks.counts.full,0);
 const jump=new World(fixture);Object.assign(jump.body,{x:300,a:Math.PI});step(jump,dt,{turn:1});assert.equal(jump.tricks.score,0);
});
test('expired deadlines cannot be revived by a trick and practice does not grant clock time',()=>{
 const w=new World({...fixture,limit:.1});w.time=.1;w.tricks.award('full',100,100);assert.equal(w.bonus,0);step(w,dt);assert.equal(w.status,'lost');
 const p=new World(fixture,true);p.tricks.award('half',100,100);assert.equal(p.bonus,0);assert.equal(p.tricks.score,100);
});
test('trick observation leaves physical forces, velocity, wheels and cadence identical',()=>{
 const a=new World(fixture),b=new World(fixture);a.body.vx=b.body.vx=75;
 b.tricks.step=()=>{};
 for(let i=0;i<480;i++){a.step(dt,{turn:1});b.step(dt,{turn:1});}
 assert.deepEqual(a.body,b.body);assert.deepEqual(a.wheels,b.wheels);assert.deepEqual(a.gait,b.gait);assert.ok(a.tricks.score>0);
});
console.log('All close-call, spin, slide and combo checks passed.');
