// Contact, recovery, launch and water-relay regressions, with ordinary player forces.
const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics'),C=require('../js/four-wheels-course'),T=require('../js/four-wheels-terrain');
const make=(i=0)=>new P.World(C.build(i));
const step=(w,s,input={})=>{for(let i=0;i<s*120;i++)w.step(1/120,input);};
const pose=(w,x,y,a=0,v=0)=>{Object.assign(w.body,{x,y,a,vx:Math.cos(a)*v,vy:Math.sin(a)*v,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>Object.assign(q,{a,omega:0}));};
function check(name,fn){fn();console.log('PASS '+name);}
check('one height field supplies hills, four physical bumps and a real unsupported jump gap',()=>{
 const w=make(),l=w.level;assert.ok(T.height(l,{x:1200,y:820})>40);const bump=l.terrain.bumps;for(const u of bump.centers){const p={x:bump.x,y:bump.y-u};assert.ok(w.floorAt(p).height>4);assert.ok(T.height(l,{x:p.x,y:p.y+15})<.1);}
 assert.equal(w.floorAt({x:1215,y:410}),null);assert.equal(w.floorAt({x:1215,y:520}),null);assert.ok(w.floorAt({x:1260,y:410}).height>14);assert.ok(w.floorAt({x:1170,y:410}));
});
check('a supported cart settles, leans on a hill and coasts downhill under gravity',()=>{
 const flat=make();step(flat,2);assert.ok(Math.abs(flat.body.z)<.2&&Math.abs(flat.body.pitch)<.01&&Math.abs(flat.body.rollTilt)<.01);assert.equal(flat.falls,0);
 const w=make(4);pose(w,1300,980,Math.PI);const initial={...w.body},floor=w.floorAt(w.body);assert.ok(initial.z>20&&Math.abs(initial.pitch)>.05);step(w,1);assert.ok(w.body.vx*floor.gx+w.body.vy*floor.gy< -5);assert.ok(Number.isFinite(w.body.pitchRate));
});
check('the same two-wheel overhang can be pulled back or pushed too far',()=>{
 const rescued=make(6),lost=make(6);for(const w of [rescued,lost]){pose(w,710,722,Math.PI/2,3);step(w,.15);assert.equal(w.fall,null);assert.equal(w.edge.count,2);assert.ok(w.body.pitch>.005);}
 step(rescued,1.5,{push:-1});assert.equal(rescued.falls,0);assert.equal(rescued.fall,null);assert.ok(rescued.body.y<705);assert.ok(rescued.terrainStats.saves>0);
 step(lost,2,{push:1});assert.equal(lost.falls,1);assert.ok(lost.fall&&lost.body.z< -26);const identity=[lost.body,lost.wheels,lost.stock];step(lost,3);assert.equal(lost.fall,null);assert.equal(lost.roomIndex,0);assert.deepEqual([lost.body,lost.wheels,lost.stock],identity);
});
check('the boost accelerates real wheels, the ramp launches, and a short approach fails',()=>{
 const jump=make(5);pose(jump,1390,410,Math.PI,35);let air=false;for(let i=0;i<120*3;i++){jump.step(1/120,{push:1});air ||=jump.ground.airborne;}assert.ok(air&&jump.body.x<1150);assert.ok(jump.terrainStats.boosts>0&&jump.terrainStats.jumps>0&&jump.terrainStats.landings>0);assert.equal(jump.falls,0);
 const short=make(5);pose(short,1250,410,Math.PI,8);step(short,3,{push:1});assert.ok(short.falls>0,'coasting off the lip is not a scripted success');
});
check('airborne input cannot create ground traction or brake momentum',()=>{
 const coast=make(5),controlled=make(5);for(const w of [coast,controlled]){pose(w,1215,410,Math.PI,60);Object.assign(w.body,{z:45,vz:10});Object.assign(w.shopper,{z:63,vz:10,feet:0});w.ground.airborne=true;w.ground.count=0;w.ground.feet=0;w.wheels.forEach(q=>q.load=0);}
 step(coast,.1);step(controlled,.1,{push:1,turn:1,brake:1});assert.ok(Math.abs(coast.body.vx-controlled.body.vx)<.01&&Math.abs(coast.body.a-controlled.body.a)<.01);
});
check('ice reduces tire friction, rolling loss and the shopper footing',()=>{
 const ice=make(9),dry=make(1);pose(ice,2110,600,Math.PI/2,45);pose(dry,800,1200,Math.PI/2,45);step(ice,.2,{brake:1});step(dry,.2,{brake:1});assert.equal(ice.stock.sample(2110,600).kind,'ice');assert.ok(Math.hypot(ice.body.vx,ice.body.vy)>Math.hypot(dry.body.vx,dry.body.vy)*2);assert.ok(ice.ground.feet<.3);
});
check('isolated wet contacts and sauce cannot power the relay; a connected water film can',()=>{
 const w=make(7),t=w.level.terrain.circuit,near=t.terminals;w.stock.spill('water',near[0].x-5,near[0].y,1);w.stock.spill('water',near[1].x+5,near[1].y,1);assert.deepEqual(T.circuitConnection(w),[]);w.stock.liquids.clear();w.stock.spill('ketchup',909,290,32);step(w,1);assert.equal(w.circuit.powered,false);assert.ok(C.wallsNear(w.level,{x:947,y:290}).some(r=>r.side==='shutter'));
 w.stock.spill('water',909,290,32);step(w,2);assert.equal(w.circuit.powered,true);assert.equal(w.circuit.lift,1);assert.ok(!C.wallsNear(w.level,{x:947,y:290}).some(r=>r.side==='shutter'));
});
check('a normal impact on the actual table vase powers a saved persistent relay',()=>{
 const w=make(7);pose(w,850,290,0,65);step(w,2,{push:.4});step(w,10,{brake:1});assert.ok(w.stock.stats.fallen&&w.stock.stats.broken);assert.ok(w.stock.liquids.get('water').cells.size>0);assert.equal(w.circuit.powered,true);const s=JSON.parse(JSON.stringify(C.snapshot(w))),r=make();assert.ok(C.restore(r,s));assert.deepEqual(r.circuit.powered,w.circuit.powered);assert.equal(r.circuit.lift,1);assert.deepEqual(r.body,w.body);
 const bad=structuredClone(s);bad.circuit.lift=2;assert.equal(C.restore(make(),bad),false);
});
check('loose stock follows elevated ground and falls through the same jump void',()=>{
 const w=make(),p=w.stock.addProduct('can',350,1520,{z:T.height(w.level,{x:350,y:1520}),vx:15,state:'floor'});for(let i=0;i<120;i++)w.stock.integrate(1/120);assert.ok(p.z>0);assert.ok(Math.abs(p.z-w.floorAt(p).height)<1);
 const falling=w.stock.addProduct('can',1215,410,{z:8,state:'air'});for(let i=0;i<60;i++)w.stock.integrate(1/120);assert.ok(falling.z<0&&!falling.broken);for(let i=0;i<240;i++)w.stock.integrate(1/120);assert.equal(falling.state,'gone');
});
check('schema 1 keeps the old run and mess while creating the new relay challenge',()=>{
 const source=make();step(source,.4,{push:1});source.stock.spill('wine',1180,1300,8);const saved=JSON.parse(JSON.stringify(C.snapshot(source)));saved.version=1;for(const k of ['ground','edge','circuit','terrainStats'])delete saved[k];for(const k of ['z','vz','pitch','rollTilt','pitchRate','rollRate','comHeight'])delete saved.body[k];saved.wheels.forEach(q=>{delete q.load;delete q.groundZ;});const w=make();assert.ok(C.restore(w,saved));assert.equal(w.time,source.time);assert.equal(w.body.x,source.body.x);assert.equal(w.body.vx,source.body.vx);assert.deepEqual([...w.stock.liquids.get('wine').cells],[...source.stock.liquids.get('wine').cells]);assert.equal(w.shelves[6].stockItems.length,1);assert.equal(w.shelves[6].cx,890);assert.ok(C.restore(make(),JSON.parse(JSON.stringify(C.snapshot(w)))));
});
check('an airborne save keeps velocity, wheel loads, angular motion and delayed impact',()=>{
 const w=make(5);pose(w,1215,410,Math.PI,60);Object.assign(w.body,{z:45,vz:10,pitchRate:.7});w.ground.airborne=true;w.ground.count=0;w.ground.feet=0;w.wheels.forEach(q=>q.load=0);const r=make(),s=JSON.parse(JSON.stringify(C.snapshot(w)));assert.ok(C.restore(r,s));step(w,.3);step(r,.3);assert.deepEqual(r.body,w.body);assert.deepEqual(r.ground,w.ground);
 const lost=make(6);pose(lost,710,722,Math.PI/2,3);for(let i=0;i<480&&!lost.fall;i++)lost.step(1/120,{push:1});const mid=make();assert.ok(C.restore(mid,JSON.parse(JSON.stringify(C.snapshot(lost)))));assert.equal(mid.fall.impactTime,null);step(mid,3);assert.equal(mid.fall,null);assert.equal(mid.falls,1);
});
console.log('All terrain and recovery checks passed.');
