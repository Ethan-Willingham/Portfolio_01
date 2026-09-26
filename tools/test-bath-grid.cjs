// Exercise the actual GPU-domain calculation without creating a GPU device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const gpu = fs.readFileSync(path.join(root, 'js/liquid-wgpu.js'), 'utf8');
const bath = fs.readFileSync(path.join(root, 'js/sluice/072-bath.js'), 'utf8');
function extract(text, pattern, label) {
  const found = text.match(pattern);
  assert(found, `${label} is available in the production source`);
  return found[0];
}
const s = { TILE: 32, console: { warn(message) { assert.fail(message); } } };
vm.createContext(s);
for (const name of ['GRID_MARGIN', 'GRID_MAX_CELLS', 'BLOCK_W', 'LIQUID_CELL_DEFAULT']) {
  vm.runInContext(extract(gpu, new RegExp(`  var ${name} = [^;]+;`), name), s);
}
vm.runInContext(extract(gpu, /  function computeGridBounds\(instance, count\) \{[\s\S]*?\n  \}/, 'GPU grid bounds'), s);
vm.runInContext(extract(bath, /  var BATH_FLOORS = \[[\s\S]*?\n  \];/, 'bath floors'), s);
vm.runInContext(extract(bath, /  var BATH_CAT_C = [^;]+;/, 'catenary constant'), s);
vm.runInContext(extract(bath, /  function bathTubCurve\(F, tb\) \{[\s\S]*?\n  \}/, 'bath curve'), s);
const curves = Array.from(s.BATH_FLOORS).filter(f => f.tubs.length).map(f => s.bathTubCurve(f, f.tubs[0]));
const descriptors = curves.map(c => [c.x0, c.x1, c.y0, c.D]);
function pack(bowls) {
  if (bowls === undefined || bowls === null) return bowls;
  const data = new Float32Array(20);
  bowls.forEach((b, i) => data.set(b, i * 4));
  return data;
}
function calculate(points, bowls = descriptors, region = [-1e9, -1e9, 1e9, 1e9], count = points.length) {
  const params = new ArrayBuffer(80), writes = [];
  const instance = {
    liquid: { arrays: { x: Float32Array.from(points, p => p[0]), y: Float32Array.from(points, p => p[1]) } },
    cellSize: s.LIQUID_CELL_DEFAULT, bathBowls: pack(bowls),
    worldTile: s.TILE, worldCols: 320, worldTotalRows: 1412, stepDt: 1 / 120,
    regionMinX: region[0], regionMinY: region[1], regionMaxX: region[2], regionMaxY: region[3],
    paramsHost: new Uint32Array(params), paramsHostF: new Float32Array(params), paramsBuf: {},
    queue: { writeBuffer(buffer, offset, data) { writes.push(Array.from(data)); } }
  };
  const grid = { ...s.computeGridBounds(instance, count) };
  assert.equal(writes.length, 1, 'one uniform upload describes the grid');
  assert.equal(grid.capped, false);
  assert.equal(grid.w % s.BLOCK_W, 0); assert.equal(grid.h % s.BLOCK_W, 0);
  assert.equal(grid.cells, grid.w * grid.h);
  return { grid, uniform: writes[0] };
}
function encloses(result, x, y, label) {
  const g = result.grid, cx = Math.floor(x / s.LIQUID_CELL_DEFAULT), cy = Math.floor(y / s.LIQUID_CELL_DEFAULT);
  assert(cx > g.originX && cx < g.originX + g.w - 1 && cy > g.originY && cy < g.originY + g.h - 1, label);
}
function bottom(result) { return (result.grid.originY + result.grid.h) * s.LIQUID_CELL_DEFAULT; }
const main = curves[0], center = (main.x0 + main.x1) / 2;

{
  for (const nozzleY of [main.y0 - 7 * s.TILE + 10, main.y0 - 90, main.y0 - 1]) {
    const packet = [[center - 1, nozzleY], [center + 1, nozzleY + 3]];
    const result = calculate(packet), oldDomain = calculate(packet, null);
    assert(bottom(oldDomain) < main.y0 + main.D, 'the initial packet exercises the formerly undersized domain');
    encloses(result, main.x0, main.y0, 'the first packet includes the left lip');
    encloses(result, main.x1, main.y0, 'the first packet includes the right lip');
    encloses(result, center, main.y0 + main.D + 4, 'the deepest basin point has its stencil before readback');
  }
  console.log('PASS first hose packets include the whole basin width and bottom before the GPU jet falls');
}

{
  for (const c of curves) {
    const points = [[(c.x0 + c.x1) / 2, c.y0 + c.D - 3], [c.x0 + 5, c.y0 + 1]];
    const result = calculate(points);
    encloses(result, c.x0, points[1][1], 'settling water keeps the left edge covered');
    encloses(result, c.x1, points[1][1], 'settling water keeps the right edge covered');
    encloses(result, (c.x0 + c.x1) / 2, c.y0 + c.D + 4, 'settling water keeps the bottom covered');
    assert.deepEqual(result, calculate(points, [[c.x0, c.x1, c.y0, c.D]]), 'empty tower tubs do not enlarge the active room');
  }
  // The second vessel overlaps only the added domain of the first vessel.
  // It must not become active merely because an earlier descriptor expanded it.
  const first = [100, 600, 1000, 200], emptyNext = [100, 600, 1400, 150];
  const point = [[350, 900]], expected = calculate(point, [first]);
  assert.deepEqual(calculate(point, [first, emptyNext]), expected);
  assert.deepEqual(calculate(point, [emptyNext, first]), expected, 'descriptor order cannot chain-expand empty rooms');
  console.log('PASS settled water stays covered while empty upper and adjacent tubs cannot chain-expand the grid');
}

{
  const outdoor = [[300, 100], [365, 200], [1800, 450], [-42, -61]];
  for (const region of [[-1e9, -1e9, 1e9, 1e9], [0, 0, 600, 600], [-100, -100, 0, 0]]) {
    assert.deepEqual(calculate(outdoor, descriptors, region), calculate(outdoor, null, region), 'outdoor grids and uniform bytes stay identical');
  }
  const packet = [[center, main.y0 - 90]];
  const baseline = calculate(packet, null);
  assert.deepEqual(calculate(packet, []), baseline, 'an empty descriptor buffer leaves the original grid intact');
  assert.deepEqual(calculate(packet, [[main.x0, main.x1, main.y0, 0], [main.x0, main.x1, main.y0, -10]]), baseline, 'disabled bowl slots have no effect');
  console.log('PASS outdoor grid uniforms are bit-identical and missing or disabled bowl descriptors retain baseline');
}

{
  const y = main.y0 - 10, region = [center - 30, y - 5, center + 30, y + 65];
  const points = [[center, y], [main.x0, main.y0 + main.D], [center, main.y0 - 300]];
  const clipped = calculate(points, descriptors, region);
  const expected = calculate([[center, y], [region[0], y], [region[2], region[3]]], null, region);
  assert.deepEqual(clipped.grid, expected.grid, 'the vessel expansion is clipped to the active region before ordinary halo and block padding');
  const disjoint = [center - 10, main.y0 + 400, center + 10, main.y0 + 500];
  const outside = [[center, main.y0 + 450]];
  assert.deepEqual(calculate(outside, descriptors, disjoint), calculate(outside, null, disjoint));
  console.log('PASS active-region clipping excludes distant particles and limits vessel expansion');
}

{
  for (const bowls of [descriptors, [[-100, 100, 0, 100]]]) {
    assert.deepEqual(calculate([], bowls), calculate([], null), 'zero particles cannot activate a vessel at the fallback origin');
    const points = [[1000, 1000], [center, main.y0]], region = [-20, -20, 20, 20];
    assert.deepEqual(calculate(points, bowls, region), calculate(points, null, region), 'all-outside particles cannot activate a vessel');
    assert.deepEqual(calculate([[0, 0]], bowls, [-1e9, -1e9, 1e9, 1e9], 0), calculate([[0, 0]], null, [-1e9, -1e9, 1e9, 1e9], 0), 'unused array entries do not enlarge an empty grid');
  }
  console.log('PASS zero, inactive and unused particle entries cannot inflate the GPU domain');
}
