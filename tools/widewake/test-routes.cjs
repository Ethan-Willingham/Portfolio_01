const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
const g=new C.Game(earth),start={x:g.player.x,y:g.player.y};
let maxMs=0;
for(const p of [...g.ports,...g.sites]){
  const t=performance.now(),route=earth.route(start,p);maxMs=Math.max(maxMs,performance.now()-t);
  assert.ok(route,'No route to '+p.id);let a=start;
  for(const b of route){assert.ok(earth.clear(a,b,14),'Land crossing on route to '+p.id);a=b;}
  assert.ok(W.distance(a,p)<100,'Route ends outside harbor or working radius: '+p.id);
  console.log('PASS water route to '+p.name);
}
// Sail through the narrow strait in both directions, using the actual helm physics.
for(const [a,b]of [[W.point(-7,35.9),W.point(-3.8,35.9)],[W.point(-3.8,35.9),W.point(-7,35.9)]]){
  const state=C.fresh();state.atSea=true;state.location={...a,angle:0};const trip=new C.Game(earth,state);trip.spawnTimer=1e9;trip.bossSites=[];
  assert.ok(trip.navigate(b));for(let i=0;i<60*60&&trip.autopilot;i++){trip.step(1/60);assert.ok(!earth.land(trip.player.x,trip.player.y),'Ship touched land in Gibraltar');}
  assert.ok(W.distance(trip.player,b)<70,'Helmsman stalled in Gibraltar');for(let i=0;i<60*10;i++)trip.step(1/60);for(const f of trip.fleet){assert.ok(!earth.land(f.x,f.y),'Escort crossed land');assert.ok(W.distance(f,trip.player)<320,'Escort stranded at strait');}console.log('PASS actual Gibraltar passage with following escort');
}
// Regression for a hull caught inside the turn on Iceland's southwest coast.
{
  const state=C.fresh();state.atSea=true;state.location={x:75470.28335326706,y:12500.425771380756,angle:0};state.hull='frigate';state.upgrades.engine=4;
  const trip=new C.Game(earth,state),target=trip.ports.find(p=>p.id==='reykjavik');trip.spawnTimer=1e9;trip.bossSites=[];trip.target=target;trip.route=[{x:75600,y:12240},target];trip.autopilot=true;
  for(let i=0;i<60*90&&trip.autopilot;i++){trip.step(1/60);assert.ok(!earth.land(trip.player.x,trip.player.y));}
  assert.ok(W.distance(trip.player,target)<100);assert.ok(!trip.autopilot);console.log('PASS Iceland coast recovery with an upgraded engine');
}
console.log('All 42 destinations reachable. Slowest uncached route '+maxMs.toFixed(0)+'ms (worker on the browser).');
