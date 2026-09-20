import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fn(src, name) {
  const a = src.indexOf('  function ' + name + '(');
  assert(a >= 0, name);
  return src.slice(a, src.indexOf('\n  }', a) + 4);
}
const s = { Math, Number, isFinite, window: {},
  LIQUID_MAX_PARTICLES: 40000, LIQUID_OPS_MAX: 300000, LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5,
  LIQUID_DENSITY: 4, TILE: 32, PLAYER_W: 22, PLAYER_H: 26,
  liquidCount: 0, liquidMutationSeq: 0, liquidOps: [], liquidOpsOverflow: false, liquidWGPU: null,
  introPhase: 'done', gamePaused: false, gameOver: false, gameWon: false,
  shopOpen: false, shopState: 'closed', ledgerOpen: false, cargoManifestOpen: false,
  itemWheel: { open: false }, bathMode: false, isMobile: false,
  player: { x: 300, y: 174, vx: 0, vy: 0, dir: 1 }, drilling: null,
  skySlimeCapture() { return null; }, skySlimeRelease() { s.releases++; return {}; }, releases: 0,
  sfxPlay() {}, isInDpadZone() { return false; }, consoleRect() { return { y: 900 }; }, consoleScale() { return 1; }
};
s.liquidWorldSolidAt = (x, y) => y >= 200;
s.liquidPointInMiner = (x, y) => x >= s.player.x + 1 && x <= s.player.x + 21 && y >= s.player.y + 6 && y <= s.player.y + 25;
for (const key of ['Type','Origin','X','Y','VX','VY','G00','G01','G10','G11','Density','Aeration','Sleeping','Frozen','RestFrames','PrevX','PrevY','LX','LY','PVX','PVY','GX','GY','DX','DY']) s['liquid'+key] = new Float64Array(40000);
vm.createContext(s);
vm.runInContext(fn(read('js/sluice/030-worldgen.js'),'addLiquidParticle') +
  fn(read('js/sluice/070-collision-liquids.js'),'liquidLineClear') +
  read('js/sluice/071-liquid-catalog.js') + read('js/sluice/075-liquid-tool.js'), s);
function reset(load) {
  s.siphonReset(); s.siphon.tank = load.slice(); s.liquidCount = 0; s.liquidOps.length = 0;
  Object.assign(s.player, {x:300,y:174,vx:0,vy:0,onGround:true});
}
function step() {
  s.player.vy += 760 / 60; s.player.y += s.player.vy / 60;
  if(s.player.y > 174) {s.player.y=174;s.player.vy=0;}
  s.siphonTick(1/60);
}
function flight(load) {
  reset(load); s.siphonDump();
  let peak = 0;
  for(let i=0;i<150;i++) {step();peak=Math.max(peak,174-s.player.y);}
  assert.equal(s.siphonTotal(),0,'single click empties every chamber');
  assert.equal(s.liquidCount,load.reduce((a,b)=>a+b),'every dumped particle survives');
  const counts=[0,0,0,0,0];for(let i=0;i<s.liquidCount;i++) counts[s.liquidType[i]]++;
  assert.deepEqual(counts,load,'mixed dump conserves each liquid');
  assert(!s.siphon.equipped && !s.siphon.dump,'scoop stays off after dumping');
  return peak;
}
const full=flight([4000,1000,4000,3000,4000]), small=flight([4000,0,0,0,0]);
assert(full>110 && small>15 && small<full,'full load launches higher than a small load');
reset([16000,0,0,0,0]);s.siphonDump();const burst=s.siphon.dump;
s.siphonDump();s.siphonToggle();s.siphon.pointer='mouse';s.siphonPointerUp('mouse');
assert.equal(s.siphon.dump,burst,'click repeats, F and mouse release do not recharge/cancel the burst');
s.gamePaused=true;s.siphonTick(1);s.gamePaused=false;
assert.equal(s.siphon.dump.age,0,'pause freezes the committed action');
step();const saved=JSON.parse(JSON.stringify(s.siphonSave())), emitted=s.liquidCount;
s.siphonRestore(saved);assert.equal(s.siphonTotal()+emitted,16000,'reload preserves undischarged volume');
assert.equal(s.siphon.dump,null,'reload never repeats earned recoil');
reset([0,0,0,0,0]);s.siphonDump();assert.equal(s.player.vy,0);assert.equal(s.siphon.dump,null);
s.liquidWorldSolidAt=()=>true;reset([1000,0,0,0,0]);s.siphonDump();
for(let i=0;i<60;i++)s.siphonTick(1/60);
assert.equal(s.siphonTotal(),1000);assert.equal(s.player.vy,0);assert.equal(s.siphon.dump,null);
s.liquidWorldSolidAt=(x,y)=>y>=200;s.LIQUID_MAX_PARTICLES=50;reset([16000,0,0,0,0]);s.siphonDump();
for(let i=0;i<90;i++)step();
assert.equal(s.siphonTotal()+s.liquidCount,16000,'full solver retains the rest of the load');
assert.equal(s.liquidCount,50);assert.equal(s.siphon.dump,null);
s.LIQUID_MAX_PARTICLES=40000;reset([0,0,0,0,0]);s.siphon.passenger={r:25};s.siphonDump();s.siphonTick(1/60);
assert.equal(s.releases,1);assert.equal(s.siphon.passenger,null);assert.equal(s.player.vy,0);
console.log(`PASS dump conservation, five liquids, ground launch (${full.toFixed(1)}px full / ${small.toFixed(1)}px quarter), one-shot input, pause, reload, blocked exits, capacity and passenger release.`);
