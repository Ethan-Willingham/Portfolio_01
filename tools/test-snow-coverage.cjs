// Deterministic weather-only regression. The live GPU/CPU jet and smoke tests
// cover solver transfer; this isolates camera coverage, streaming and saves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let seed = 2039;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noop = () => {};
const s = { Math: math, window: { location: { search: '' } },
  cam: {x: 2000, y: -900}, screenW: 960, screenH: 600,
  TILE: 32, SKY_ROWS: 4, COLS: 320, TOTAL_ROWS: 500, PLAYER_W: 30, PLAYER_H: 24,
  SNOW_RATE: 345, SNOW_FLAKE_CAP: 5400, SNOW_MASS_CAP: 120000,
  SNOW_ACTIVE_CAP: 36000, SNOW_CPU_CAP: 7000, LIQUID_MAX_PARTICLES: 65536,
  RAIN_STORAGE_CAP: 40000, RAIN_ORIGIN: 3, liquidCount: 0, liquidWGPU: null,
  liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [],
  rain: { intensity: .65, cells: {}, parked: [], waterCount: 0 },
  surfaceWind: { current: .3 }, player: {x: 2465, y: -620},
  snowAir: {}, snowAirReset: noop, updateSnowAir: noop, snowAirAt: () => [0, 0],
  liquidToolSync: noop, rainCatchLakes: noop,
  tileAt: () => null, liquidWorldSolidAt: () => false, liquidPointInMiner: () => false,
  liquidLineClear: () => true, rainCell: (x, y) => Math.floor(y / 6) * 2000 + Math.floor(x / 6)
};
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice/156-particle-weather.js'), 'utf8'), s);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice/159-snow-physics.js'), 'utf8'), s);
s.snowTemperature = () => -4;
function reset() {
  s.snowReset(true); s.cam.x = 2000; s.cam.y = -900; s.screenW = 960; s.screenH = 600;
  s.rain.intensity = .65; s.surfaceWind.current = .3; s.SNOW_RATE = 345;
  s.updateSnow(0);
}
function count(rect) { return s.snow.grains.filter(p => p.x >= rect.left && p.x < rect.right && p.y >= rect.top && p.y < rect.bottom).length; }
function nearRig() { return count({left: s.cam.x + 300, right: s.cam.x + 660, top: s.cam.y + 180, bottom: s.cam.y + 420}); }
function step(dx, dy = 0, frames = 1) {
  for (let i = 0; i < frames; i++) { s.cam.x += dx; s.cam.y += dy; s.updateSnow(1 / 60); }
}
reset();
const baseline = nearRig(), counts = [];
for (const direction of [1, -1, 1, -1]) for (let t = 0; t < 8; t++) {
  step(direction * 8, 0, 30); counts.push(nearRig());
}
console.log('FLIGHT', {baseline, min: Math.min(...counts), max: Math.max(...counts)});
assert.ok(Math.min(...counts) > baseline * .65 && Math.max(...counts) < baseline * 1.5);
assert.ok(s.snow.grains.length <= 5400 && s.snow.airCount === 0, 'no frozen offscreen weather');
assert.equal(s.window.__particleSnow.stats().mass + s.snow.recycled, s.snow.emitted);

// A camera-only translation cannot drag particles already in the overlap.
reset();
const tracked = s.snow.grains.filter(p => p.x > 2350 && p.x < 2500).map(p => [p,p.x,p.y,p.vx,p.vy]);
s.cam.x += 120; s.updateSnow(0);
for (const [p,x,y,vx,vy] of tracked) {
  assert.ok(s.snow.grains.includes(p)); assert.deepEqual([p.x,p.y,p.vx,p.vy],[x,y,vx,vy]);
}
// Revisits sample the current storm, without preserving a frozen old patch.
s.cam.x += 2400; s.updateSnow(0); s.cam.x -= 2400; s.updateSnow(0);
assert.ok(nearRig() > baseline * .7);
const saved = JSON.parse(JSON.stringify(s.snowSave()));
const mass = s.window.__particleSnow.stats().mass;
s.snowReset(true); s.snowRestore(saved);
assert.equal(s.window.__particleSnow.stats().mass, mass);
assert.equal(JSON.stringify(s.snowSave()), JSON.stringify(saved), 'field and weather round-trip');
s.updateSnow(0);
assert.equal(s.window.__particleSnow.stats().mass, mass, 'reload does not add a second field');
const collected=s.snow.grains.find(p=>p.weatherKey!==undefined), collectedKey=collected.weatherKey;
s.snow.grains.splice(s.snow.grains.indexOf(collected),1);s.snow.mass--;s.snow.collected++;
s.updateSnow(.11);
assert.ok(!s.snow.grains.some(p=>p.weatherKey===collectedKey),'consumed source flakes cannot respawn into the wake');
s.snowReset(true);
s.snowRestore({version:2,particles:[2400,125,0,0],grains:[[2400,-700,0,53,1,0,.5,0]],airParked:[[7000,-700,0,53,1,0,.5,0]]});
assert.equal(s.snow.grains.length,0,'legacy active sky cannot overlap the new field');
assert.equal(s.snow.airCount,0,'legacy cached sky cannot return as a wall');
assert.equal(s.snow.mass,1,'legacy deposited material retains its mass');

// This was the visible wall: a held view retained the old storm intensity,
// while travelling seeded a much denser current storm beside it.
function densityAcrossView(parts) {
  const bins = Array(12).fill(0);
  for (const p of parts) if (p.x >= s.cam.x && p.x < s.cam.x+s.screenW && p.y >= s.cam.y && p.y < s.cam.y+s.screenH)
    bins[Math.floor((p.x-s.cam.x)/s.screenW*4)+4*Math.floor((p.y-s.cam.y)/s.screenH*3)]++;
  return bins;
}
function stormTransition(update, parts, setIntensity) {
  setIntensity(.02); update(0);
  for (let i=0;i<600;i++) {setIntensity(.02+.63*i/600);update(1/60);}
  const waiting=densityAcrossView(parts()), oldX=s.cam.x;
  s.cam.x+=1800; update(0); const arriving=densityAcrossView(parts());
  const total=a=>a.reduce((x,y)=>x+y,0), ratio=total(arriving)/total(waiting);
  console.log('BUILDUP', {waiting,arriving,ratio});
  assert.ok(ratio>.8&&ratio<1.25, 'a storm grows equally in visited and unvisited sky');
  assert.ok(Math.min(...waiting)>Math.max(...waiting)*.45, 'no horizontal or vertical storm curtain');
  for(let i=0;i<600;i++){setIntensity(.65-.58*i/600);update(1/60);}
  const clearing=total(densityAcrossView(parts()));s.cam.x=oldX;update(0);
  const returning=total(densityAcrossView(parts()));
  console.log('CLEARING', {clearing,returning});
  assert.ok(returning<clearing*1.6, 'returning cannot revive the earlier heavy storm');
  assert.ok(Math.abs(returning-clearing)<total(waiting)*.25, 'finishing visible particles create only a modest difference from the current source');
  const visible=parts().filter(p=>p.x>s.cam.x+8&&p.x<s.cam.x+s.screenW-8&&p.y>s.cam.y+8&&p.y<s.cam.y+s.screenH-8);
  setIntensity(0);update(1/60);
  assert.ok(visible.every(p=>parts().includes(p)),'a storm ending never deletes a visible particle');
  for(let i=0;i<1400;i++){setIntensity(0);update(.05);}
  assert.equal(densityAcrossView(parts()).reduce((a,b)=>a+b,0),0,'remaining weather falls out naturally after the source clears');
}
s.snowReset(true); s.cam.x=2000;
stormTransition(dt=>s.updateSnow(dt),()=>s.snow.grains,v=>{s.rain.intensity=v;});

reset(); s.screenW=1440;s.screenH=800;s.updateSnow(0);
assert.ok(count({left:s.cam.x+1050,right:s.cam.x+1400,top:-700,bottom:-300})>100);
step(0,-5,120); assert.ok(nearRig()>100); step(0,5,120); assert.ok(nearRig()>100);
for(const x of [0,320*32-960]){reset();s.cam.x=x;s.cam.y=-4500;s.updateSnow(0);assert.ok(nearRig()>100);}
for(const scene of ['fair','underground']){
  reset(); if(scene==='fair'){s.snowReset(true);s.rain.intensity=0;}else s.cam.y=s.SKY_ROWS*s.TILE+1;
  const emitted=s.snow.emitted;step(8,0,60);assert.equal(s.snow.emitted,emitted);
}
// Audit every atmospheric retirement during an abrupt shutdown, climbing,
// reversal and zoom. No weather controller may remove a visible grain.
reset();
let retired=0;
const retire=s.snowRetire;
s.snowRetire=p=>{
  assert.ok(p.x<s.cam.x-96||p.x>s.cam.x+s.screenW+96||p.y<s.cam.y-96||p.y>s.cam.y+s.screenH+96,'thinning remains outside the protected view');
  retired++;retire(p);
};
for(let i=0;i<600;i++){
  s.rain.intensity=0;
  if(i>120&&i<420){s.cam.y-=5;s.cam.x+=i<270?4:-4;}
  if(i===420){s.screenW=1200;s.screenH=750;}
  s.updateSnow(1/60);
}
assert.ok(retired>1000,'audit exercised real offscreen retirement');
assert.ok(s.snow.field.strength>.449&&s.snow.field.strength<.451,'snow supply falls by at most two percentage points each second');
const thinningSave=JSON.parse(JSON.stringify(s.snowSave()));
s.snowReset(true);s.snowRestore(thinningSave);
assert.equal(s.snow.field.strength,thinningSave.field.strength,'saving during thinning preserves the gradual transition');
s.snowRetire=retire;
// Going underground must not locally weaken an ongoing world-wide front.
reset();s.cam.y=600;step(0,0,180);
assert.equal(s.snow.field.strength,.65);
reset();s.snow.active=s.SNOW_CPU_CAP;
assert.ok(s.snowSpawn(2400,-700));assert.ok(s.snowParticle(2400,-700,0,53));
assert.equal(s.snow.parked.length,4,'full solver stores contact material without stopping weather');

function settleInAir(air) {
  reset();s.SNOW_RATE=0;s.rain.intensity=0;
  const flake={x:2400,y:-700,vx:0,vy:53,size:.5,phase:1,physical:true};
  s.snow.grains=[flake];s.snow.mass=1;s.snowAirAt=()=>air;step(0,0,90);return flake.vy;
}
const calm=settleInAir([0,0]),crosswind=settleInAir([8,0]),downwash=settleInAir([0,15]),updraft=settleInAir([0,-120]);
assert.ok(crosswind>calm*.8&&downwash>calm&&updraft< -40,'airflow preserves settling and actual updrafts');
s.snowAirAt=()=>[0,0];s.SNOW_RATE=345;

vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/sluice/157-particle-rain.js'),'utf8'),s);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/sluice/158-rain-lakes.js'),'utf8'),s);
const catchLakes=s.rainCatchLakes;
s.weatherForce=4;s.weather={pcp:.65};s.weatherTune={enabled:true};s.weatherSetMood=noop;
s.bathMode=s.PERF_DISABLE_WATER=s.PERF_DISABLE_WEATHER=false;
s.rainScan=noop;s.rainCatchLakes=noop;s.rainAdvanceWeather=noop;
s.rainLand=()=>{s.rain.landed++;return true;};s.liquidWGPU={simActive:true};
s.rainReset(true,false);s.cam.x=2000;s.cam.y=-900;s.screenW=960;s.screenH=600;
stormTransition(dt=>s.updateParticleRain(dt),()=>s.rain.drops,v=>{s.weather.pcp=v;});
assert.equal(s.snow.grains.length,0,'rain has no snow weather');
const shaft={x:2400,y:s.SKY_ROWS*s.TILE+40,vx:0,vy:645,size:.5,age:0,weatherRank:.5};
s.rain.drops=[shaft];s.weather.pcp=0;s.cam.y=s.SKY_ROWS*s.TILE;s.updateParticleRain(.11);
assert.ok(s.rain.drops.includes(shaft),'ending a storm cannot delete water already falling into a shaft');
let caught=0;
s.surfacePonds=[{rainFed:true,catchable:true,cL:10,cR:12,rainCredit:0}];
s.rainStoreInLake=(lake,n)=>{caught+=n;};s.rain.intensity=0;
catchLakes(1,false,0,0,.5);
assert.equal(caught,33,'offscreen lakes receive the same fading supply as visible sky');
catchLakes(1,false,0,0,0);
assert.equal(caught,33,'catchment stops when the eased source finishes');
console.log('PASS evolving whole-world rain/snow, both flight directions, no curtains, clearing, saves, budgets and jet settling');
