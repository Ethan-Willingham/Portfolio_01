const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const sourcePath = path.join(__dirname, '../js/water-smoke-slime.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('  function jelloWaterCoupleTick(dt) {');
const end = source.indexOf('\n  /* ==== TOOLS + INPUT', start);
assert(start >= 0 && end > start, 'Coupling source boundaries exist');
const code = source.slice(start, end);
function run(bodyCode, substeps, cup, initialVelocity = 0) {
  const b = {n: 4, px: [80, 88, 88, 80], py: [80, 80, 88, 88], ox: [80, 88, 88, 80], oy: [80, 80, 88, 88],
    bboxL: 80, bboxR: 88, bboxT: 80, bboxB: 88, cx: 84, cy: 84};
  b.oy = b.py.map(y => y - initialVelocity * (1 / 240 / substeps) / .5);
  const context = {jelloBodies: [b], machineState: cup ? {definition: {name: 'cup'}} : null,
    JELLO_H: 1 / 240, JELLO_TIMESCALE: .5, JELLO_GRAVITY: 250, jelloImpulseScale: () => 1 / substeps,
    TILE: 8, gridW: 32, gridH: 32, walls: new Uint8Array(1024), waterCellsAny: true,
    waterCellCount: new Uint32Array(1024).fill(40), waterCellVX: new Float64Array(1024), waterCellVY: new Float64Array(1024),
    WATER_CELL_REST: 40, WATER_CELL_WET: 6, BUOY_BETA: .24, DRAG_K: 8, COUPLE_DV_CAP: 340, RAM_L: 340,
    poolSurfaceAt: () => 0, window: {}, toyFrameNo: 0};
  vm.createContext(context); vm.runInContext(bodyCode + '\njelloWaterCoupleTick(1/60);', context);
  return {previous: b.oy.slice(), velocity: (b.py[0] - b.oy[0]) * .5 / (1 / 240 / substeps)};
}
const rows = [];
for (const initialVelocity of [0, 20]) for (const substeps of [1, 3, 6]) {
  const dt = 1 / 60;
  const buoyancy = -250 * 1.24 * dt / (1 + initialVelocity / 260);
  const viscous = -initialVelocity * (1 - Math.exp(-1.8 * dt));
  const fluidDrag = -initialVelocity * (1 - Math.exp(-8 * dt));
  const expected = initialVelocity + buoyancy + viscous + fluidDrag;
  const cup = run(code, substeps, true, initialVelocity);
  assert(Math.abs(cup.velocity - expected) < 1e-9, 'Cup buoyancy and drag use the actual Verlet substep');
  if (initialVelocity === 0) {
    const ordinary = run(code, substeps, false);
    assert(Math.abs(ordinary.velocity - expected * substeps) < 1e-9, 'Ordinary toy coupling retains its established impulse');
  }
  rows.push({substeps, initialVelocity, expected, actual: cup.velocity});
}
console.log(JSON.stringify({pass: true, cases: rows}, null, 2));
