// Collision and floor-material regressions. Run: node tools/test-four-wheels-stock.cjs
const assert = require('node:assert/strict');
const {World,point,BODY,casterPose,corners}=require('../js/four-wheels-physics.js');
const Stock=require('../js/four-wheels-stock.js');
const dt=1/120;
const empty={start:{x:140,y:150,a:0},limit:300,par:100,shelves:[],objects:[],gates:[{x:420,y:250}],exit:{side:'right',center:150,width:80}};
const aisle={...empty,shelves:[{x:200,y:110,w:40,h:80,stock:'groceries'}]};
const step=(w,seconds,input={})=>{for(let i=0;i<Math.round(seconds*120);i++)w.step(dt,input);};
const volume=w=>[...w.stock.liquids.values()].reduce((n,l)=>n+[...l.cells.values()].reduce((a,b)=>a+b,0),0)+w.wheels.reduce((n,w)=>n+Object.values(w.coating||{}).reduce((a,b)=>a+b,0),0);
const test=(name,fn)=>{fn();console.log('PASS '+name);};

test('a shopper centered exactly on a shelf edge receives a valid contact normal',()=>{
  const h=Stock.circlePolygon(100,110,4,Stock.boxPolygon({x:110,y:110,a:0},10,10));
  assert.ok(h&&Math.hypot(h.nx,h.ny)>.99&&h.depth===4);
});

test('free-body contacts conserve momentum and transfer spin at the contact point',()=>{
  const a={x:100,y:100,a:0,vx:40,vy:5,omega:0,mass:2,inertia:30};
  const b={x:110,y:100,a:0,vx:0,vy:0,omega:0,mass:3,inertia:40};
  const px=a.mass*a.vx+b.mass*b.vx,py=a.mass*a.vy+b.mass*b.vy;
  const energy=()=>.5*(a.mass*(a.vx*a.vx+a.vy*a.vy)+b.mass*(b.vx*b.vx+b.vy*b.vy)+a.inertia*a.omega*a.omega+b.inertia*b.omega*b.omega);
  const before=energy();Stock.resolve(a,b,{x:105,y:103,nx:-1,ny:0,depth:.1},.1,.35);
  assert.ok(Math.abs(a.mass*a.vx+b.mass*b.vx-px)<1e-9);
  assert.ok(Math.abs(a.mass*a.vy+b.mass*b.vy-py)<1e-9);
  assert.ok(Math.abs(a.omega)>.1&&Math.abs(b.omega)>.1);
  assert.ok(energy()<=before+1e-9,'friction and restitution cannot create kinetic energy');
});

test('a light shelf hit rocks and settles without spilling or charging a penalty',()=>{
  const w=new World(aisle,true);w.body.vx=40;let max=0;
  for(let i=0;i<600;i++){w.step(dt);max=Math.max(max,w.shelves[0].tilt);}
  assert.ok(max>.01&&max<.1);assert.ok(w.shelves[0].tilt<.01);
  assert.equal(w.stock.stats.fallen,0);assert.equal(w.penalty,0);
});

test('the shelf rocking degree of freedom is included in contact effective mass',()=>{
  const w=new World(aisle,true),s=w.shelves[0];w.body.vx=100;
  const energy=()=>.5*(w.body.vx**2+w.body.vy**2+BODY.inertia*w.body.omega**2+s.mass*(s.vx**2+s.vy**2)+s.inertia*s.omega**2+s.tipInertia*s.tiltOmega**2);
  const h={x:200,y:146,nx:-1,ny:0,depth:.1};w.stock.prepareHit(s,h,22);
  const before=energy();w.impulse(h,s);
  assert.ok(s.tiltOmega>0&&s.vx>0&&w.body.vx<100);
  assert.ok(energy()<before,'adding a rocking impulse must not create extra collision energy');
});

test('supported bottles collide and transfer motion while still on the board',()=>{
  const w=new World(aisle,true),s=w.shelves[0],a=s.stockItems[0],b=s.stockItems[1];
  a.u=b.u-4;a.du=20;w.stock.positionStock(a);w.stock.integrate(.05);
  assert.equal(a.state,'shelf');assert.equal(b.state,'shelf');assert.ok(b.du>1&&a.du<20);
});

test('a hard cart impact topples the physical rack, releases stock and charges once',()=>{
  const w=new World(aisle,true);w.body.vx=135;const s=w.shelves[0],originalMass=s.mass;
  step(w,6);
  assert.ok(s.down&&Math.abs(s.tilt-Math.PI/2)<1e-9);assert.equal(w.stock.stats.toppled,1);
  assert.equal(s.stockItems.filter(p=>p.state==='shelf').length,0);
  assert.equal(w.stock.stats.fallen,s.stockItems.length);
  assert.ok(s.mass<originalMass,'released stock changes rack mass and center of mass');
  assert.equal(w.penalty,5);assert.equal(w.messes,1);
  assert.ok(w.stock.stats.broken>0&&w.stock.liquids.has('wine'));
  const h=Stock.polygonContact(corners(w.body),Stock.shelfPolygon(s));assert.ok(!h||h.depth<.1);
  step(w,2,{push:1});assert.equal(w.penalty,5,'a second contact cannot charge the rack again');
});

test('shelf yaw and the fallen frame use their real rotated collision footprint',()=>{
  const s=Stock.createShelf({x:200,y:100,w:30,h:80,stock:'wine'},0);
  s.a=.6;s.tilt=Math.PI/2;s.nx=1;s.ny=0;
  const poly=Stock.shelfPolygon(s),q=Stock.shelfPoint(s,0,0,s.height);
  assert.ok(q.x>s.cx+35&&Math.abs(q.z)<1e-9);
  assert.ok(Stock.circlePolygon(q.x,q.y,3,poly));
  assert.equal(Stock.circlePolygon(100,100,3,poly),null);
});

test('a falling rack can transfer its impact into the next rack and topple it',()=>{
  const w=new World({...empty,start:{x:60,y:240,a:0},shelves:[{x:180,y:90,w:40,h:95,stock:'groceries'},{x:232,y:90,w:40,h:95,stock:'wine'}]},true);
  Object.assign(w.shelves[0],{tilt:.65,tiltOmega:1.5,nx:1,ny:0,vx:60});step(w,6);
  assert.ok(w.shelves.every(s=>s.down));assert.equal(w.stock.stats.toppled,2);assert.equal(w.penalty,10);
});

test('different products fall, bounce, break or survive according to material',()=>{
  const w=new World(empty,true);
  w.stock.addProduct('wine',330,80,{z:32});
  w.stock.addProduct('plate',370,100,{z:32});
  const can=w.stock.addProduct('can',310,190,{z:32,vx:30,omega:4});
  const ketchup=w.stock.addProduct('ketchup',350,220,{z:32});
  step(w,3);
  assert.equal(w.stock.stats.broken,2);assert.ok(w.stock.items.some(p=>p.kind==='shard'&&p.z===0));
  assert.ok(!can.broken&&can.x>335&&can.z===0);assert.ok(!ketchup.broken&&ketchup.flat,'a hard landing can burst the plastic bottle without creating glass');
  assert.ok(w.stock.liquids.has('wine'));assert.equal(w.penalty,0,'products do not stack arbitrary penalties');
  const ids=w.stock.items.map(p=>p.id);step(w,8);assert.deepEqual(w.stock.items.map(p=>p.id),ids,'landed stock stays on the floor');
});

test('loose stock clears the basket but a real tire contact crushes glass and sauce',()=>{
  const w=new World({...empty,start:{x:230,y:150,a:0}},true);
  const center=point(w.body,BODY.cartX,0),clear=w.stock.addProduct('wine',center.x,center.y);
  w.step(dt);assert.ok(!clear.broken&&clear.wheelHits===0,'the raised basket does not smash ground stock');
  const a=casterPose(w.body,w.wheels[0],0),b=casterPose(w.body,w.wheels[2],2);
  const bottle=w.stock.addProduct('wine',a.x,a.y),sauce=w.stock.addProduct('ketchup',b.x,b.y);
  w.body.vx=30;w.step(dt);
  assert.ok(bottle.broken&&sauce.flat);assert.ok(w.stock.stats.wheelContacts>=2);
  assert.ok(w.stock.liquids.has('wine')&&w.stock.liquids.has('ketchup'));
  assert.ok(w.stock.items.some(p=>p.kind==='shard'),'glass becomes physical fragments');
});

test('wine spreads farther than ketchup while the film conserves its volume',()=>{
  const w=new World(empty,true);w.stock.spill('wine',300,80,12);w.stock.spill('ketchup',300,220,12);
  const before=volume(w);for(let i=0;i<100;i++)w.stock.flow(.05);
  const wine=w.stock.liquids.get('wine'),ketchup=w.stock.liquids.get('ketchup');
  assert.ok(wine.cells.size>ketchup.cells.size*1.4);
  assert.ok(Math.abs(volume(w)-before)<1e-8);
  assert.ok([...wine.cells.values(),...ketchup.cells.values()].every(v=>v>=0));
});

test('each tire picks up liquid, paints its own trail and changes grip',()=>{
  const w=new World({...empty,start:{x:180,y:150,a:0}},true),p=casterPose(w.body,w.wheels[0],0);
  w.stock.spill('ketchup',p.x,p.y,18);w.body.vx=50;const before=volume(w);
  w.step(dt);assert.ok(w.wheels[0].surface.grip<.7);assert.equal(w.wheels[2].surface.grip,1);
  step(w,.6);
  assert.ok(w.stock.smears.length>5);assert.ok(w.wheels.some(q=>(q.coating.ketchup||0)>0));
  assert.ok(w.stock.smears.some(q=>q.x>p.x+10),'the wheel carries sauce onto clean tiles');
  assert.ok(Math.abs(volume(w)-before)<1e-6,'pickup and deposition transfer actual film volume');
});

test('unequal wheel grip produces a braking yaw and all-wet braking takes longer',()=>{
  const fixture={...empty,start:{x:230,y:150,a:0}};
  const dry=new World(fixture,true),one=new World(fixture,true),wet=new World(fixture,true);
  for(const w of [dry,one,wet])w.body.vx=70;
  const p=casterPose(one.body,one.wheels[0],0);one.stock.spill('oil',p.x,p.y,30);
  for(const q of wet.wheels.map((wheel,i)=>casterPose(wet.body,wheel,i)))wet.stock.spill('oil',q.x,q.y,50);
  step(dry,.08,{brake:1});step(one,.08,{brake:1});step(wet,.08,{brake:1});
  assert.ok(Math.abs(one.body.omega)>Math.abs(dry.body.omega)+.015);
  assert.ok(wet.body.vx>dry.body.vx+5);
});

test('dense debris, bottle breakage and chain contacts remain bounded and finite',()=>{
  const w=new World({...empty,start:{x:50,y:260,a:0},shelves:[{x:180,y:90,w:40,h:95,stock:'groceries'},{x:232,y:90,w:40,h:95,stock:'wine'}]},true);
  for(let i=0;i<45;i++)w.stock.addProduct(i%2?'ketchup':'wine',280+i%9*12,60+Math.floor(i/9)*23,{z:24+i%3*6,vx:-30+i%7*10,vy:i%3*7,omega:i%5});
  w.shelves[0].tilt=.65;w.shelves[0].tiltOmega=1.5;w.shelves[0].nx=1;w.shelves[0].ny=0;
  for(let i=0;i<2400;i++) {
    w.step(dt,{push:Math.sin(i/160)>.1?1:-1,turn:Math.sin(i/90),brake:i%380<30?1:0});
    for(const o of [w.body,...w.stock.items,...w.shelves])for(const [key,v] of Object.entries(o))if(typeof v==='number')assert.ok(Number.isFinite(v),key);
  }
  assert.ok(w.shelves.every(s=>s.cx>7&&s.cx<473&&s.cy>7&&s.cy<293));
  assert.ok(w.stock.items.filter(p=>p.kind==='shard').length<=Stock.MAX_FRAGMENTS);
  assert.ok(w.stock.smears.length<=1200);
  assert.ok([...w.stock.liquids.values()].every(l=>l.cells.size<=116*71));
  assert.ok(w.stock.stats.toppled>=1&&w.stock.stats.broken>=20);
});
console.log('All shelf, stock and floor physics checks passed.');
