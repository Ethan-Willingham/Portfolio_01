/* Actual coast regressions, physical fleet arrivals, and retained detours. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {D,W,C,earth,make,place}=require('./sea-fixtures.cjs');
const geojson=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson')));
const check=(label,fn)=>{fn();console.log('PASS '+label);};
function quiet(g){g.spawnTimer=1e9;g.bossSites=[];return g;}
function fixture(from,to){const s=C.fresh();s.atSea=true;s.location={...to,angle:0};s.fleet[0].location={...from,angle:0};s.fleet[0].cargo={iron:7};s.fleet[0].hp=123;s.wake=[to];return quiet(new C.Game(earth,s));}
function sailFor(g,seconds){for(let i=0;i<seconds*60;i++)g.step(1/60);}
check('escorts escape the actual Iceland and Magellan coast traps without a stored wake',()=>{
  for(const [from,port]of [[W.point(-22.686357629814353,64.02207507881991),'lisbon'],[W.point(-69.4732047233243,-52.32514686720506),'havana']]){
    const to=new C.Game(earth).ports.find(p=>p.id===port),g=fixture(from,to),f=g.fleet[0];assert.ok(earth.water(f.x,f.y,13));assert.equal(earth.water(f.x,f.y,15),false);assert.equal(g.dock(),false);const cargo={...f.data.cargo},hp=f.hp;
    for(let i=0;i<180*60&&g.harborStragglers().length;i++){const before={x:f.x,y:f.y};g.step(1/60);assert.ok(W.distance(before,f)<6,'a companion jumped during coastal recovery');assert.ok(earth.water(f.x,f.y,f.radius),'a companion entered land');}
    assert.equal(g.harborStragglers().length,0,port+' remains stranded');assert.deepEqual(f.data.cargo,cargo);assert.equal(f.hp,hp);assert.ok(g.dock());assert.equal(g.quantity('iron'),7);
  }
});
check('the refined channel works in either direction and every returned leg clears the hull',()=>{
  const inside=W.point(-69.4732047233243,-52.32514686720506),outside=W.point(-67.4,-51);
  for(const [from,to]of [[inside,outside],[outside,inside]]){const cold=new W.Earth(geojson),route=cold.route(from,to,13,13);assert.ok(route);let prev=from;for(const q of route){assert.ok(cold.clear(prev,q,13),'coastal route cuts a headland');prev=q;}assert.ok(W.distance(prev,to)<1);assert.ok(cold.coastRoutes.size>0,'regression must exercise the refined channel');}
});
check('many separated boats schedule at most one route search per step',()=>{
  const g=make();while(g.fleet.length<g.fleetLimit)assert.ok(g.buyBoat('freighter'));place(g,W.point(-67.4,-51));quiet(g);const q=W.point(-69.4732047233243,-52.32514686720506);for(const f of g.fleet){Object.assign(f,q);f.wake=[{...q}];f.navTimer=0;}
  const original=earth.route;let calls=0;earth.route=function(...args){if(args.length<=4)calls++;return original.apply(this,args);};
  try{for(let i=0;i<g.fleet.length+2;i++){calls=0;g.step(1/60);assert.ok(calls<=1,'more than one fleet route search in one step');}assert.ok(g.fleet.every(f=>W.distance(f,q)>0),'a boat never received a route or a clear formation leg');}finally{earth.route=original;}
});
check('a coastal detour survives reconstruction with exact motion and bounded Float64 records',()=>{
  const g=fixture(W.point(-69.4732047233243,-52.32514686720506),W.point(-67.4,-51));sailFor(g,.5);assert.ok(g.fleet[0].navRoute.length);const s=g.snapshot(),cold=new W.Earth(geojson),copy=quiet(new C.Game(cold,s));quiet(g);assert.deepEqual(copy.fleet[0].navRoute,g.fleet[0].navRoute);
  for(let i=0;i<60*8;i++){g.step(1/60);copy.step(1/60);assert.deepEqual(copy.snapshot(),g.snapshot());}
  const old=structuredClone(s);for(const f of old.sea.friendly)delete f.navRoute;assert.doesNotThrow(()=>new C.Game(earth,old));
});
check('a rejected docking preserves combat, cargo, work and first-arrival rewards',()=>{
  const g=make();place(g,g.sites.find(s=>s.id==='bahama-bank'));quiet(g);assert.ok(g.startProduction());const port=g.ports.find(p=>p.id==='nassau');Object.assign(g.player,port);const f=g.fleet[0];Object.assign(f,W.point(-50,20));g.addCargo('iron',13,f.uid);g.spawn('gunner',g.player,true);g.drops.push({x:g.player.x+20,y:g.player.y,t:12,kind:'cargo',item:'wood'});const before=g.snapshot();
  assert.equal(g.dock(),false);assert.deepEqual(g.snapshot(),before);assert.equal(g.mode,'sea');assert.ok(g.production);assert.ok(g.harborStragglers(port).includes(f));
  for(const boat of g.fleet)Object.assign(boat,earth.nearestWater({x:port.x+120,y:port.y+80},13));assert.ok(g.dock());assert.equal(g.s.coins,before.coins+100);assert.equal(g.quantity('iron'),13);assert.equal(g.production,null);assert.equal(g.enemies.length,0);assert.equal(g.drops.length,0);assert.equal(g.dock(),false);assert.equal(g.s.coins,before.coins+100);
});
check('the widest full convoy can dock from the outer flagship ring',()=>{
  const g=make();while(g.fleet.length<g.fleetLimit)assert.ok(g.buyBoat('freighter'));const port=g.ports.find(p=>p.id==='honolulu');place(g,{x:port.x+185,y:port.y});quiet(g);g.formation='wide';g.player.angle=Math.PI;sailFor(g,15);assert.equal(g.harborStragglers().length,0);assert.ok(g.dock());
});
check('new guard orders and workboat recall discard an obsolete coastal destination',()=>{
  const g=make(),site=g.sites.find(s=>s.id==='bahama-bank');place(g,site);quiet(g);const guard=g.fleet.find(f=>g.canGuard(f)),worker=g.fleet.find(f=>f.type==='trawler'),stale=[W.point(-50,20)];guard.navRoute=stale.slice();assert.ok(g.setGuard(guard.uid,worker.uid));assert.deepEqual(guard.navRoute,[]);worker.navRoute=stale.slice();assert.ok(g.startProduction());assert.deepEqual(worker.navRoute,[]);worker.navRoute=stale.slice();g.finishProduction(false);assert.deepEqual(worker.navRoute,[]);assert.equal(worker.navTimer,0);
});
console.log('Convoy navigation checks complete.');
