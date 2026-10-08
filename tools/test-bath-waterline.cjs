// Exact cached waterline and empty-flake work regression; no browser required.
// Run: node tools/test-bath-waterline.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const s = { window: {}, TILE: 32, SKY_ROWS: 16, SKY_SLIME_GRAVITY: 300 };
vm.createContext(s);
for (const name of ['072-bath', '074-bath-service', '074-bath-skin']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', name + '.js'), 'utf8'), s, { filename: name });
}
// Uncached reference reads the actual shared curve with the original bisection.
function reference() {
  const f = s.BATH_FLOORS[0], c = s.bathTubCurve(f, f.tubs[0]);
  const water = s.bathArrivalVisibleWater(s.bathWater);
  let low = c.y0, high = c.y0 + c.D;
  for (let n = 0; n < 10; n++) {
    const line = (low + high) * 0.5;
    let volume = 0;
    for (let x = c.x0 + 4; x < c.x1; x += 8) volume += Math.max(0, c.y0 + c.depthAt(x) - 3 - line) * 8 / 1.5625;
    if (volume > water) low = line; else high = line;
  }
  return (low + high) * 0.5;
}
let visible = 1, calls = 0;
s.bathArrivalVisibleWater = water => water * visible;
const curve = s.bathTubCurve;
s.bathTubCurve = (...args) => {
  const c = curve(...args), depthAt = c.depthAt;
  c.depthAt = x => { calls++; return depthAt(x); };
  return c;
};
const floor = s.BATH_FLOORS[0], original = JSON.parse(JSON.stringify(floor));
let cases = 0;
for (const geometry of [0, 1, 2, 3]) for (const tightness of [1.4, 2, 2.6]) {
  Object.assign(floor, JSON.parse(JSON.stringify(original)));
  if (geometry === 1) floor.fr++;
  if (geometry === 2) floor.tubs[0][0] += 2;
  if (geometry === 3) { floor.sink--; floor.rim += 4; }
  s.BATH_CAT_C = tightness;
  for (const progress of [0, 0.3, 1]) for (const water of [0, 4000, 12000, 45000, 8000]) {
    visible = progress; s.bathWater = water;
    const expected = reference();
    assert.equal(s.bathWaterline(), expected, 'exact result after fill, drain, visibility or geometry change');
    const before = calls;
    for (let n = 0; n < 4; n++) assert.equal(s.bathWaterline(), expected);
    assert.equal(calls, before, 'unchanged waterline skips all depth samples');
    cases++;
  }
}
const line = s.bathWaterline;
let lineCalls = 0, projections = 0;
s.bathWaterline = () => { lineCalls++; return line(); };
s.bathToolProject = (x, y, vx, vy) => { projections++; return [x, y, vx, vy]; };
const before = calls;
for (let n = 0; n < 120; n++) s.bathSkinFlakeTick(1 / 120);
assert.equal(lineCalls, 0); assert.equal(calls, before);
const c = s.bathTubCurve(floor, floor.tubs[0]);
s.bathSkinFlakes.push({ x: c.x0 + 50, y: c.y0 - 20, vx: 10, vy: 5, life: 1, angle: 0, spin: 1 });
s.bathSkinFlakeTick(1 / 120);
assert.equal(lineCalls, 1); assert.equal(projections, 1);
assert.ok(s.bathSkinFlakes[0].life < 1 && s.bathSkinFlakes[0].angle > 0);
console.log(`PASS: ${cases} exact waterline cases, unchanged-input reuse and empty/live flake work.`);
