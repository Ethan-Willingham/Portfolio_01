'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Builder = require('../js/water-machines-builder.js');
let passed = 0;
function test(name, operation) { operation(); passed++; process.stdout.write('PASS ' + name + '\n'); }
function fixture(width = 40, height = 30) {
  const walls = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (r === 0 || c === 0 || r === height - 1 || c === width - 1) walls[r * width + c] = 1;
  const changes = [];
  const builder = Builder.create({ width, height, tile: 8, walls, onChange: event => changes.push(event) });
  return { builder, walls, changes, width, height, at: (c, r) => walls[r * width + c] };
}
function documentToken(doc) { return 'wmb1.' + Buffer.from(JSON.stringify(doc), 'ascii').toString('base64url'); }
function tokenDocument(token) { return JSON.parse(Buffer.from(token.slice(5), 'base64url').toString('ascii')); }
function component(walls, width, height, start) {
  const seen = new Set(), stack = [start];
  while (stack.length) {
    const index = stack.pop();
    if (seen.has(index) || walls[index]) continue;
    seen.add(index);
    const c = index % width, r = Math.floor(index / width);
    if (c > 0) stack.push(index - 1); if (c < width - 1) stack.push(index + 1);
    if (r > 0) stack.push(index - width); if (r < height - 1) stack.push(index + width);
  }
  return seen;
}

test('straight pipe has a selected clear bore, solid sides and open mouths', () => {
  const f = fixture();
  const part = f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 92 }], 24);
  assert.equal(part.bore, 24);
  for (let c = 8; c <= 24; c++) {
    assert.equal(f.at(c, 10), 0); assert.equal(f.at(c, 11), 0); assert.equal(f.at(c, 12), 0);
    assert.equal(f.at(c, 9), 1); assert.equal(f.at(c, 13), 1);
  }
  assert.equal(f.at(7, 11), 0); assert.equal(f.at(25, 11), 0);
  assert.equal(f.changes.length, 1); assert.ok(f.changes[0].indices.length);
  assert.equal(f.changes[0].walls, f.walls);
});
test('pipe through an existing solid clears its bore and mouths without changing the border', () => {
  const f = fixture(); f.walls.fill(1);
  const borderBefore = f.walls.filter((_, index) => index < f.width || index >= f.width * (f.height - 1) || index % f.width === 0 || index % f.width === f.width - 1);
  f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 92 }], 24);
  assert.equal(f.at(7, 11), 0); assert.equal(f.at(25, 11), 0);
  const borderAfter = f.walls.filter((_, index) => index < f.width || index >= f.width * (f.height - 1) || index % f.width === 0 || index % f.width === f.width - 1);
  assert.deepEqual(borderAfter, borderBefore);
});
test('orthogonal routed bend is continuous and remains sealed when its mouths are capped', () => {
  const f = fixture();
  const part = f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 180 }], 24);
  assert.equal(part.points.length, 3);
  f.builder.vent({ x: 56, y: 80, width: 8, height: 24 }, false);
  f.builder.vent({ x: 184, y: 184, width: 24, height: 8 }, false);
  const interior = component(f.walls, f.width, f.height, 11 * f.width + 8);
  assert.ok(interior.has(21 * f.width + 24), 'water path reaches the second leg');
  assert.ok(!interior.has(3 * f.width + 3), 'a closed pipe does not reach outside air');
  assert.equal(f.at(25, 10), 0, 'the outer bend retains a full bore-sized interior');
});
test('a live tee preserves the full existing bore and a manually sealed cell', () => {
  const f=fixture();
  f.builder.strokePipe([{x:68,y:92},{x:196,y:92}],16);
  f.builder.vent({x:160,y:88,width:8,height:8},false);
  const before=f.walls.slice(),parts=f.builder.getParts();
  f.builder.strokePipe([{x:132,y:44},{x:132,y:92}],16);
  for(let r=11;r<=12;r++)for(let c=8;c<=24;c++)if(!(r===11&&c===20))assert.equal(f.at(c,r),0,'The new shell cannot obstruct the existing hydraulic cross section.');
  assert.equal(f.at(20,11),1,'An existing seal remains a physical wall.');
  const branch=component(f.walls,f.width,f.height,5*f.width+16);
  assert(branch.has(11*f.width+8)&&branch.has(12*f.width+24));
  const joined=f.walls.slice();f.builder.undo();assert.deepEqual(f.walls,before);assert.deepEqual(f.builder.getParts(),parts);
  f.builder.redo();assert.deepEqual(f.walls,joined);
  const fresh=fixture();fresh.builder.fromShare(f.builder.share('https://example.test/toy'));assert.deepEqual(fresh.walls,joined);
});
test('even bore and sub-tile request use the returned actual snapped bore', () => {
  const f = fixture();
  const part = f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 92 }], 25);
  assert.equal(part.bore, 32);
  for (let r = 10; r <= 13; r++) assert.equal(f.at(12, r), 0);
  assert.equal(f.at(12, 9), 1); assert.equal(f.at(12, 14), 1);
});
test('open and sealed vessels expose distinct physical openings', () => {
  const f = fixture();
  f.builder.vessel({ x: 48, y: 48, width: 64, height: 80 }, false);
  assert.equal(f.at(9, 6), 0); assert.equal(f.at(6, 6), 1); assert.equal(f.at(9, 15), 1); assert.equal(f.at(9, 10), 0);
  f.builder.vessel({ x: 160, y: 48, width: 64, height: 80 }, true);
  assert.equal(f.at(23, 6), 1); assert.equal(f.at(23, 10), 0);
  const chamber = component(f.walls, f.width, f.height, 10 * f.width + 23);
  assert.ok(!chamber.has(3 * f.width + 3));
  f.builder.vent({ x: 176, y: 48, width: 8, height: 8 }, true);
  assert.ok(component(f.walls, f.width, f.height, 10 * f.width + 23).has(3 * f.width + 3));
  f.builder.vent({ x: 176, y: 48, width: 8, height: 8 }, false);
  assert.ok(!component(f.walls, f.width, f.height, 10 * f.width + 23).has(3 * f.width + 3));
  assert.equal(f.builder.getParts().filter(part => part.type === 'vent').length, 1);
});
test('one gesture groups geometry and valve metadata, with isolated undo/redo', () => {
  const f = fixture(), before = f.walls.slice();
  const water = { x: [80, 84], velocity: [3, 5] };
  f.builder.begin('one pipe gesture');
  f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 92 }], 24);
  f.builder.addPart('check', { rect: { x: 120, y: 88, width: 8, height: 24 }, direction: 'right', open: false, mass: 2, crackingPressure: 4, hysteresis: 0.5 });
  assert.equal(f.changes.length, 0);
  assert.equal(f.builder.commit(), true); assert.equal(f.changes.length, 1);
  const built = f.walls.slice(), parts = f.builder.getParts();
  water.x[0] = 180;
  assert.equal(f.builder.undo(), true); assert.deepEqual(f.walls, before); assert.deepEqual(f.builder.getParts(), []);
  assert.equal(water.x[0], 180);
  assert.equal(f.builder.redo(), true); assert.deepEqual(f.walls, built); assert.deepEqual(f.builder.getParts(), parts);
  assert.equal(water.x[0], 180); assert.equal(f.builder.redo(), false);
});
test('cancel restores geometry, an empty gesture makes no history, and a new edit drops redo', () => {
  const f = fixture(), before = f.walls.slice();
  f.builder.begin('cancel'); f.builder.vessel({ x: 48, y: 48, width: 64, height: 80 }, true);
  assert.equal(f.builder.cancel(), true); assert.deepEqual(f.walls, before); assert.deepEqual(f.builder.getParts(), []);
  assert.equal(f.builder.undo(), false);
  f.builder.begin(); assert.equal(f.builder.commit(), false);
  f.builder.vessel({ x: 48, y: 48, width: 64, height: 80 }, true); f.builder.undo();
  f.builder.vessel({ x: 160, y: 48, width: 64, height: 80 }, false);
  assert.equal(f.builder.redo(), false);
});
test('host scene geometry inside begin/commit is undoable without replacing the wall reference', () => {
  const f = fixture(), original = f.walls.slice();
  f.builder.begin('scene geometry'); f.walls[12 * f.width + 12] = 1;
  f.builder.commit(); assert.equal(f.changes[0].reason, 'scene geometry');
  f.builder.undo(); assert.deepEqual(f.walls, original); assert.equal(f.builder.walls, f.walls);
  f.builder.redo(); assert.equal(f.at(12, 12), 1);
});
test('invalid geometry is rejected before mutation', () => {
  const f = fixture(), before = f.walls.slice();
  assert.throws(() => f.builder.strokePipe([{ x: 12, y: 12 }, { x: 84, y: 12 }], 32), /outside editable/);
  assert.throws(() => f.builder.strokePipe([{ x: 68, y: 92 }, { x: 68, y: 92 }], 24), /nonzero/);
  assert.throws(() => f.builder.addPart('flap', { rect: { x: 80, y: 80, width: 8, height: 24 }, mass: -1 }), /mass/);
  assert.throws(() => f.builder.addPart('timer', {}), /supports/);
  assert.deepEqual(f.walls, before); assert.deepEqual(f.builder.getParts(), []); assert.equal(f.builder.undo(), false);
});
test('history limit evicts oldest gestures and cannot undo through an active gesture', () => {
  const f = fixture(); f.builder.historyLimit = 2;
  f.builder.vent({ x: 80, y: 80, width: 8, height: 8 }, false);
  f.builder.vent({ x: 96, y: 80, width: 8, height: 8 }, false);
  f.builder.vent({ x: 112, y: 80, width: 8, height: 8 }, false);
  assert.equal(f.builder.undo(), true); assert.equal(f.builder.undo(), true); assert.equal(f.builder.undo(), false);
  assert.equal(f.at(10, 10), 1);
  f.builder.begin(); assert.throws(() => f.builder.undo(), /finish/); f.builder.cancel();
  f.builder.clearHistory(); assert.equal(f.builder.redo(), false);
});
test('validated part updates change metadata, preserve geometry and remain undoable', () => {
  const f = fixture(), valve = f.builder.addPart('flap', { rect: { x: 80, y: 80, width: 24, height: 8 }, open: false });
  const before = f.walls.slice(); f.builder.updatePart(valve.id, { open: true, material: 'glass' });
  assert.equal(f.builder.getParts()[0].open, true); assert.deepEqual(f.walls, before);
  f.builder.undo(); assert.equal(f.builder.getParts()[0].open, false); assert.equal(f.builder.getParts()[0].material, undefined);
  f.builder.redo(); assert.equal(f.builder.getParts()[0].open, true);
  assert.throws(() => f.builder.updatePart(valve.id, { type: 'timer' }), /unknown/);
  assert.throws(() => f.builder.updatePart(valve.id, { mass: -1 }), /mass/);
  assert.equal(f.builder.getParts()[0].mass, 1);
  const vessel = f.builder.vessel({ x: 160, y: 48, width: 64, height: 80 }, true);
  f.builder.updatePart(vessel.id, { sealed: false }); assert.equal(f.at(23, 6), 0);
  f.builder.undo(); assert.equal(f.at(23, 6), 1);
  const vent = f.builder.vent({ x: 176, y: 48, width: 8, height: 8 }, true);
  f.builder.updatePart(vent.id, { open: false }); assert.equal(f.at(22, 6), 1);
});
test('URL round-trip reproduces walls and all part types in a fresh builder', () => {
  const f = fixture();
  f.builder.strokePipe([{ x: 68, y: 92 }, { x: 196, y: 92 }], 24);
  f.builder.vessel({ x: 48, y: 144, width: 64, height: 80 }, true);
  f.builder.vent({ x: 64, y: 144, width: 8, height: 8 }, false);
  f.builder.addPart('check', { rect: { x: 120, y: 88, width: 8, height: 24 }, direction: 'right', open: false });
  f.builder.addPart('flap', { rect: { x: 144, y: 88, width: 8, height: 24 }, direction: 'left', mass: 3 });
  f.builder.addPart('nozzle', { rect: { x: 192, y: 88, width: 8, height: 24 }, direction: 'right', bore: 24, material: 'glass' });
  const url = f.builder.share('https://example.com/toy.html?scene=blank#build-kit');
  assert.equal(new URL(url).searchParams.get('scene'), 'blank'); assert.equal(new URL(url).hash, '#build-kit');
  const decoded = Builder.decode(url), fresh = fixture();
  assert.deepEqual(decoded.walls, f.walls); assert.deepEqual(decoded.parts, f.builder.getParts());
  fresh.builder.fromShare(url); assert.deepEqual(fresh.walls, f.walls); assert.deepEqual(fresh.builder.getParts(), f.builder.getParts());
  assert.equal(fresh.builder.encode(), f.builder.encode());
  fresh.builder.undo(); assert.equal(fresh.builder.getParts().length, 0); fresh.builder.redo();
  const ids = new Set(fresh.builder.getParts().map(part => part.id));
  const added = fresh.builder.addPart('nozzle', { rect: { x: 232, y: 88, width: 8, height: 24 } }); assert.ok(!ids.has(added.id));
});
test('share rejects version, dimensions, invalid runs, unsupported fields and invalid metadata', () => {
  const f = fixture(), valid = tokenDocument(f.builder.encode());
  const reject = edit => { const doc = structuredClone(valid); edit(doc); assert.throws(() => Builder.decode(documentToken(doc)), /Build:/); };
  assert.throws(() => Builder.decode('wmb2.YQ'), /version/);
  reject(doc => { doc.v = 2; }); reject(doc => { doc.width = 1000000; });
  reject(doc => { doc.runs[0] = -1; }); reject(doc => { doc.runs[0] = 0; });
  reject(doc => { doc.runs[0] += 1; }); reject(doc => { doc.particles = []; });
  reject(doc => { doc.parts = [{ id: 'p1', type: 'emitter', rect: { x: 8, y: 8, width: 8, height: 8 } }]; });
  reject(doc => { doc.parts = [{ id: 'p1', type: 'vent', rect: { x: 8.5, y: 8, width: 8, height: 8 }, open: true }]; });
  reject(doc => { doc.parts = [{ id: 'p1', type: 'vent', rect: { x: 8, y: 8, width: 8, height: 8 }, open: 'false' }]; });
  reject(doc => { doc.parts = [{ id: 'p1', type: 'vent', rect: { x: 8, y: 8, width: 8, height: 8 }, open: true, timer: 1 }]; });
  assert.throws(() => Builder.decode('wmb1.' + 'A'.repeat(Builder.limits.maxToken)), /large/);
  assert.throws(() => f.builder.share('javascript:alert(1)'), /protocol/);
});
test('a rejected share leaves the current usable build and history unchanged', () => {
  const f = fixture(); f.builder.vessel({ x: 48, y: 48, width: 64, height: 80 }, true);
  const before = f.walls.slice(), parts = f.builder.getParts(), other = fixture(41, 30);
  assert.throws(() => f.builder.fromShare(other.builder.encode()), /does not match/);
  assert.deepEqual(f.walls, before); assert.deepEqual(f.builder.getParts(), parts);
  const doc = tokenDocument(f.builder.encode()); doc.bit = 0;
  assert.throws(() => f.builder.fromShare(documentToken(doc)), /border/);
  assert.deepEqual(f.walls, before); assert.equal(f.builder.undo(), true);
});
test('detailed hostile grids fail the URL limit without an oversized allocation on decode', () => {
  const width = 200, height = 200, walls = Uint8Array.from({ length: width * height }, (_, i) => i % 2);
  assert.throws(() => Builder.encode({ width, height, tile: 8, walls, parts: [] }), /detailed/);
  assert.throws(() => Builder.decode(documentToken({ v: 1, width: 200, height: 200, tile: 8, bit: 0, runs: [40001], parts: [] })), /wall run/);
});
test('metadata returned to callers is detached and browser global uses the browser base64 path', () => {
  const f = fixture(); const part = f.builder.vessel({ x: 48, y: 48, width: 64, height: 80 }, true); part.rect.x = 9999;
  const parts = f.builder.getParts(); parts[0].rect.x = 9999; assert.equal(f.builder.getParts()[0].rect.x, 48);
  const sandbox = { Uint8Array, URL, btoa: text => Buffer.from(text, 'binary').toString('base64'), atob: text => Buffer.from(text, 'base64').toString('binary') };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/water-machines-builder.js'), 'utf8'), sandbox);
  const api = sandbox.WaterMachinesBuilder;
  assert.ok(api); const token = api.encode({ width: f.width, height: f.height, tile: 8, walls: f.walls, parts: f.builder.getParts() });
  assert.deepEqual(Array.from(api.decode(token).walls), Array.from(f.walls)); assert.equal(api.decode(token).parts[0].rect.x, 48);
});
process.stdout.write('Passed ' + passed + ' builder tests. Geometry, topology, history, fresh-context sharing and malformed input checked.\n');
