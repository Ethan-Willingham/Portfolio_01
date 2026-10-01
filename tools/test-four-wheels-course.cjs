const assert=require('node:assert/strict'),P=require('../js/four-wheels-physics.js'),C=require('../js/four-wheels-course.js'),S=require('../js/four-wheels-stock.js'),T=require('../js/four-wheels-terrain.js'),pilot=require('./four-wheels-course-driver.cjs');
function check(name,fn){fn();console.log('PASS '+name);}
const make=(i=0,practice=false)=>new P.World(C.build(i),practice);
const step=(w,seconds,input={})=>{for(let i=0;i<seconds*120;i++){w.step(1/120,input);w.events.length=0;}};
const pose=(w,x,y,a=0,v=0)=>{Object.assign(w.body,{x,y,a,vx:Math.cos(a)*v,vy:Math.sin(a)*v,omega:0});T.init(w,w.terrainGeometry);w.wheels.forEach(q=>{q.a=a;q.omega=0;});};
check('twelve chapters share one supported route and three stores',()=>{
 const w=make(),l=w.level;assert.equal(l.sections.length,12);assert.equal(l.stores.length,3);assert.equal(l.gates.length,54);assert.ok(l.totalDistance>9300);assert.ok(l.sections.some(s=>s.rail===0)&&l.sections.some(s=>s.rail===3));
 for(const leg of l.legs)for(let t=0;t<=1;t+=.05){const p={x:leg.a.x+(leg.b.x-leg.a.x)*t,y:leg.a.y+(leg.b.y-leg.a.y)*t};assert.ok(w.isFloor(p)||leg.chapter===5&&T.inStrip(p,l.terrain.gap));}
 for(const rail of l.rails)assert.ok(C.wallsNear(l,rail.a,10).some(q=>q.poly===rail.poly));
 for(const section of l.sections){assert.ok(w.isFloor(section.start));assert.ok(l.gates[section.startGate].visible);}
 for(const o of w.objects)assert.ok(w.isFloor(o),'prop starts on supported floor');assert.equal(w.remaining,Infinity);step(w,3);assert.equal(w.status,'running');assert.equal(w.penalty,0);
});
check('dirt, grass, asphalt and grocery tiles change real wheel forces',()=>{
 const w=make();assert.equal(w.stock.sample(300,1520).kind,'dirt');assert.equal(w.stock.sample(300,1620).kind,'grass');assert.equal(w.stock.sample(800,1200).kind,'asphalt');assert.equal(w.stock.sample(1175,1360).kind,'tile');
 assert.ok(w.stock.sample(300,1620).drag>w.stock.sample(300,1520).drag&&w.stock.sample(300,1520).drag>w.stock.sample(800,1200).drag);
 const dirt=make(),road=make(),grass=make();pose(dirt,300,1520,0,50);pose(road,800,1200,Math.PI/2,50);pose(grass,300,1620,0,50);step(dirt,.4);step(road,.4);step(grass,.4);
 assert.ok(Math.hypot(road.body.vx,road.body.vy)>Math.hypot(dirt.body.vx,dirt.body.vy));assert.ok(Math.hypot(dirt.body.vx,dirt.body.vy)>Math.hypot(grass.body.vx,grass.body.vy));
 const contact=P.casterPose(w.body,w.wheels[0],0);w.stock.spill('water',contact.x,contact.y,8);w.body.vx=35;step(w,1/120);assert.ok(w.wheels[0].surface.grip<w.wheels[2].surface.grip);assert.ok(w.wheels[0].coating.water>0);
});
check('physical rails stop the cart and show red resting contact',()=>{
 const w=make();pose(w,300,1450,-Math.PI/2,65);step(w,.75,{push:1});assert.equal(w.falls,0);assert.ok(w.boundaryContacts.length>0);assert.ok(w.body.y>1415);step(w,.2);assert.ok(w.boundaryContacts.length>0);
});
check('unguarded edges and water cost ground while retaining the same world',()=>{
 for(const kind of ['lake','cliff']){const w=make(kind==='lake'?3:6),body=w.body,wheels=w.wheels,stock=w.stock;w.peak=w.distance+200;w.stock.spill('wine',1180,1300,10);const volume=w.stock.liquids.get('wine').cells.size;pose(w,kind==='lake'?1680:710,kind==='lake'?1100:700,kind==='lake'?0:Math.PI/2,65);step(w,1.3,{push:1});assert.equal(w.fall.kind,kind);assert.ok(w.body.z<w.ground.lastHeight-8);assert.equal(w.falls,1);assert.equal(w.penalty,0);const peak=w.peak;assert.ok(w.lostDistance>1000);step(w,2);assert.equal(w.roomIndex,kind==='lake'?1:0);assert.equal(w.peak,peak);assert.equal(w.body,body);assert.equal(w.wheels,wheels);assert.equal(w.stock,stock);assert.ok(w.stock.liquids.get('wine').cells.size>=volume);assert.ok(w.gate<w.level.sections[kind==='lake'?3:6].startGate);}
 const w=make(6,true);pose(w,710,700,Math.PI/2,65);step(w,4);assert.equal(w.roomIndex,6);assert.equal(w.falls,1);
});
check('grocery doors swing under ordinary force and high impacts shatter glass',()=>{
 const gentle=make(2);pose(gentle,1025,1368,0,25);let excursion=0;for(let i=0;i<120;i++){gentle.step(1/120,{push:1});excursion=Math.max(excursion,...gentle.trackDoors.slice(0,2).map(d=>Math.abs(P.wrap(d.a-d.rest))));}assert.ok(excursion>.8);assert.ok(gentle.body.x>1070);assert.ok(gentle.trackDoors.every(d=>!d.broken));
 const hard=make(2);pose(hard,1025,1368,0,130);step(hard,1,{push:1});assert.ok(hard.trackDoors[0].broken);assert.equal(hard.stock.fragments,10);assert.ok(hard.stock.items.some(p=>p.kind==='shard'&&p.state==='floor'));
});
check('stock fills three real tiers and a table still spills clear water',()=>{
 const w=make(2);for(const s of w.shelves.filter(s=>s.kind!=='table'))assert.deepEqual([...new Set(s.stockItems.map(p=>p.tier))].sort((a,b)=>a-b),[12,22,32]);
 for(let i=0;i<w.shelves.length;i++)for(let j=i+1;j<w.shelves.length;j++)assert.equal(S.polygonContact(S.shelfPolygon(w.shelves[i]),S.shelfPolygon(w.shelves[j])),null);
 pose(w,1190,1316,0,65);step(w,2,{push:.3});assert.ok(w.stock.stats.fallen>0&&w.stock.stats.broken>0);assert.ok(w.stock.liquids.get('water')?.cells.size>0);assert.equal(w.penalty,0);
 const saved=JSON.parse(JSON.stringify(C.snapshot(w))),restored=make();assert.ok(C.restore(restored,saved));assert.deepEqual(restored.body,w.body);assert.deepEqual(restored.stock.stats,w.stock.stats);assert.equal(restored.stock.items.length,w.stock.items.length);assert.deepEqual(restored.stock.items.map(p=>[p.state,p.x,p.y,p.z]),w.stock.items.map(p=>[p.state,p.x,p.y,p.z]));assert.deepEqual([...restored.stock.liquids.get('water').cells],[...w.stock.liquids.get('water').cells]);assert.equal(restored.shelves[0].cx,w.shelves[0].cx);assert.deepEqual(restored.objects,w.objects);step(restored,.5);assert.ok(Number.isFinite(restored.body.x));
});
check('saved gravity resumes with the intended catch and rejects damaged saves',()=>{
 const w=make(6);pose(w,710,700,Math.PI/2,65);for(let i=0;i<480&&!w.fall;i++)w.step(1/120);const s=JSON.parse(JSON.stringify(C.snapshot(w))),restored=make();assert.ok(C.restore(restored,s));assert.ok(restored.fall);step(restored,2);assert.equal(restored.roomIndex,0);assert.equal(restored.falls,1);
 for(const change of [q=>q.body.vx='bad',q=>q.shelves[0].tilt='bad',q=>q.items[0].mass=-1,q=>q.wheels[0].a=null,q=>q.objects[0].mass=0,q=>q.stats.broken=-1,q=>q.gate=999,q=>q.liquids=[{kind:'water',cells:[[1,'bad']]}]]){const bad=JSON.parse(JSON.stringify(s));change(bad);assert.equal(C.restore(make(),bad),false);}
});
check('distance requires ordered tire capture and the whole footprint finishes',()=>{
 const w=make();pose(w,3220,200);step(w,1/120);assert.equal(w.gate,0);assert.equal(w.distance,0);assert.equal(w.status,'running');
 w.gate=w.level.gates.length;pose(w,3140,200);step(w,1/120);assert.equal(w.status,'running');pose(w,3200,200);step(w,1/120);assert.equal(w.status,'won');assert.equal(w.peak,w.level.totalDistance);
 const spin=new P.World({...C.build(),start:{x:135,y:1520,a:0},objects:[],shelves:[]});spin.body.vx=75;step(spin,3.6,{turn:1});assert.equal(spin.tricks.counts.full,0);assert.equal(spin.tricks.score,0);assert.equal(spin.bonus,0);
});
check('the entire course is driveable with player controls, without teleporting or falling',()=>{
 const w=make(),body=w.body,wheels=w.wheels,stock=w.stock,visited=new Set();let swung=false;
 for(let i=0;i<120*450&&w.status==='running';i++){w.step(1/120,pilot(w));visited.add(w.roomIndex);swung ||=w.trackDoors.some(d=>Math.abs(P.wrap(d.a-d.rest))>.4);w.events.length=0;}
 assert.equal(w.status,'won');assert.equal(w.falls,0);assert.equal(w.gate,w.level.gates.length);assert.equal(visited.size,12);assert.ok(swung);assert.equal(w.body,body);assert.equal(w.wheels,wheels);assert.equal(w.stock,stock);assert.equal(w.peak,w.level.totalDistance);assert.ok(w.circuit.powered);assert.ok(w.terrainStats.jumps>0&&w.terrainStats.landings>0&&w.terrainStats.maxHeight>65&&w.terrainStats.boosts>0);
 console.log('Journey: '+JSON.stringify({seconds:w.time,distance:w.distance,sections:visited.size,falls:w.falls}));
});
console.log('All continuous-course checks passed.');
