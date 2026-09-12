import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Compare real path commands and water-interaction state with the release
// before caching. No browser or third-party packages needed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.BASE_REF || '387a4cb';
const read = (file, old) => old
  ? execFileSync('git', ['show', `${base}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 4e6})
  : fs.readFileSync(path.join(root, file), 'utf8');
function section(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert(start >= 0 && end > start, 'source boundaries exist');
  return source.slice(start, end);
}
let seed = 23981;
const rand = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
class RecordedPath {
  constructor() { this.commands = []; }
  moveTo(...p) { this.commands.push(['M', ...p]); }
  lineTo(...p) { this.commands.push(['L', ...p]); }
  quadraticCurveTo(...p) { this.commands.push(['Q', ...p]); }
  closePath() { this.commands.push(['Z']); }
}
function terrain(old) {
  const c = vm.createContext({Path2D: RecordedPath, TILE: 32, cells: []});
  vm.runInContext('function tileAt(r,c){return cells[r]?.[c] ?? (cells[r]?.[c] === null ? null : "wall");}', c);
  vm.runInContext(section(read('js/sluice/100-render-terrain.js', old),
    '  var VOID_CONVEX_INSET', '  function drawSurfaceVoidMouths'), c);
  return c;
}
const oldTerrain = terrain(true), newTerrain = terrain(false);
let pathChecks = 0;
function checkPath(rect) {
  const expected = oldTerrain.buildVoidContourPath(...rect);
  const actual = newTerrain.buildVoidContourPath(...rect);
  assert.deepEqual(actual.commands, expected.commands, 'all contour commands are identical');
  assert.strictEqual(newTerrain.buildVoidContourPath(...rect), actual, 'unchanged path is reused');
  pathChecks++;
  return actual;
}
for (let trial = 0; trial < 100; trial++) {
  // Dense rock, sparse caves, islands and diagonal saddle corners.
  const cells = Array.from({length: 34}, () => Array.from({length: 45}, () => rand() < (trial % 5) / 4 ? null : 'rock'));
  oldTerrain.cells = newTerrain.cells = cells;
  const rect = [-2 + trial % 3, 30, trial % 4, 41];
  checkPath(rect);
  cells[13][17] = cells[13][17] === null ? 'rock' : null;
  checkPath(rect); // direct edits with no dirty notification
  cells[13][18] = cells[13][17];
  checkPath(rect);
}
for (const name of ['VOID_CONVEX_INSET', 'VOID_CONCAVE_INSET', 'VOID_RUN_FADE',
  'WOBBLE_AMP_LOW', 'WOBBLE_AMP_HIGH', 'WOBBLE_WAVELEN_LOW', 'WOBBLE_WAVELEN_HIGH', 'WOBBLE_SAMPLE_STEP', 'TILE']) {
  oldTerrain[name] *= 1.2; newTerrain[name] *= 1.2;
  checkPath([0, 29, 0, 39]);
}
for (let i = 0; i < 24; i++) checkPath([0, 20, i, i + 15]);
assert.equal(newTerrain.voidContourCache.length, 12, 'contour cache stays bounded');
console.log(`PASS ${pathChecks} exact contour comparisons, mutation/tuning invalidation and bounded reuse`);

function water(old) {
  const c = vm.createContext({performance: {now: () => 300}, Map, Float32Array});
  vm.runInContext(`
    var TILE=32, JELLO_DISSOLVE=1, JELLO_DISSOLVE_R=40, JELLO_DISSOLVE_N=500;
    var JELLO_DISSOLVE_DENSE=80, JELLO_DISSOLVE_DWELL=.35;
    var jelloWaterBins=new Map(), jelloWaterBinN=new Float32Array(2048), jelloWaterBinCache=null;
    var jelloSplashWakes=[{t0:0},{t0:280}], jelloDissolving=null, jelloBodies=[], events=[];
    var liquidX=[],liquidY=[],liquidType=[],liquidCount=0,liquidMutationSeq=0;
    var liquidWGPU={simActive:true,readbackApplyGen:1};
    function jelloDissolveStart(b){b._melting=true;b.meltT=0;jelloDissolving=b;events.push('start');}
    function jelloDissolvePoof(b,dt){b.meltT+=dt;if(b.meltT<.7)return false;events.push('melt');
      liquidX[liquidCount]=b.bboxL;liquidY[liquidCount]=b.bboxT;liquidType[liquidCount++]=0;liquidMutationSeq++;return true;}
  `, c);
  vm.runInContext(section(read('js/sluice/340-jello.js', old),
    '  function jelloWaterDissolveFrame', '  // Dev probe (window.__smokeObst pattern)'), c);
  let builds = 0;
  const clear = c.jelloWaterBins.clear;
  c.jelloWaterBins.clear = function() { builds++; return clear.call(this); };
  c.builds = () => builds;
  return c;
}
const original = water(true), optimized = water(false);
const both = fn => { fn(original); fn(optimized); };
function snapshot(c) {
  return JSON.stringify({bins: [...c.jelloWaterBins].map(([key, slot]) => [key, slot, c.jelloWaterBinN[slot]]),
    bodies: c.jelloBodies, melting: c.jelloDissolving, events: c.events, wakes: c.jelloSplashWakes, count: c.liquidCount});
}
let waterChecks = 0;
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    both(c => c.jelloWaterDissolveFrame(c.jelloBodies, c.jelloBodies.length, 1 / 144));
    assert.equal(snapshot(optimized), snapshot(original), 'density, dwell and melt state match');
    waterChecks++;
  }
}
function reset(count, body = {bboxL: 128, bboxR: 168, bboxT: 128, bboxB: 168}) {
  const xs = [], ys = [], types = [];
  for (let i = 0; i < count; i++) {xs.push(110 + rand() * 40); ys.push(110 + rand() * 40); types.push(i % 17 === 0 ? 1 : 0);}
  both(c => {c.liquidX=xs.slice(); c.liquidY=ys.slice(); c.liquidType=types.slice(); c.liquidCount=count;
    c.liquidMutationSeq++; c.jelloBodies=[{...body}]; c.jelloDissolving=null; c.events=[]; c.JELLO_DISSOLVE=1;});
}
reset(3000); tick(170); // dense water triggers, dwells, melts and adds particles
assert.deepEqual([...optimized.events], ['start', 'melt']);
reset(240); tick(50); // dry/spray case, many repeated frames
assert(optimized.builds() < original.builds() / 4, 'unchanged mirror skips at least 75% of bin rebuilds');
for (let i = 0; i < 50; i++) {
  both(c => {c.liquidX[0] += 17; c.liquidWGPU.readbackApplyGen++;}); tick(3);
  both(c => {c.liquidType[1] = 1 - c.liquidType[1]; c.liquidMutationSeq++;}); tick();
  both(c => {c.jelloBodies[0].bboxL += .125;}); tick();
}
both(c => {c.liquidWGPU.simActive=false;});
for (let i = 0; i < 20; i++) { both(c => {c.liquidY[2] += 20;}); tick(); }
both(c => {c.liquidWGPU={simActive:true,readbackApplyGen:1};}); tick();
both(c => {c.liquidX=c.liquidX.slice();c.liquidX[3]=400;}); tick();
both(c => {c.liquidCount--;c.liquidMutationSeq++;}); tick();
both(c => {c.JELLO_DISSOLVE=0;}); tick();
both(c => {c.JELLO_DISSOLVE=1;}); tick();
both(c => {c.liquidX[0]=NaN;c.liquidY[1]=Infinity;c.liquidWGPU.readbackApplyGen++;}); tick();
reset(3000,{bboxL:128,bboxR:168,bboxT:128,bboxB:168,guest:true}); tick(80);
reset(3000,{bboxL:128,bboxR:168,bboxT:128,bboxB:168,npc:true}); tick(80);
reset(3000,{bboxL:-100,bboxR:50000,bboxT:0,bboxB:10});
both(c => {for(let i=0;i<c.liquidCount;i++){c.liquidX[i]=i*16;c.liquidY[i]=0;c.liquidType[i]=0;}}); tick(2);
assert.equal(optimized.jelloWaterBins.size, 2048, 'overflow keeps the original first-bin cap');
both(c => {c.liquidCount=0;c.liquidMutationSeq++;}); tick();
console.log(`PASS ${waterChecks} exact water-interaction frames, readback/mutation/CPU fallback, guests, invalid positions and overflow`);
console.log(`Water bin rebuilds: ${original.builds()} before, ${optimized.builds()} after`);
