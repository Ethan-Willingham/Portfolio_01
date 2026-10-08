// A first bath-born resident must use the same launch speed as later guests.
// Run: node tools/test-bath-resident-launch.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const s = {
    window: { location: { search: '' } }, performance: { now: () => 1000 },
    TILE: 32, GRAVITY: 600, COLS: 320, TOTAL_ROWS: 500, SKY_ROWS: 16,
    PLAYER_W: 22, PLAYER_H: 26, ENABLE_JELLO: true, ENABLE_BATH: true,
    player: { x: 5200, y: 486, vx: 0, vy: 0 },
    tileAt: () => null, bathPickSite: () => true,
    banyaDoorX0: 4700, banyaDoorX1: 4732,
  };
  vm.createContext(s);
  for (const file of ['340-jello', '347-slime-locomotion', '347-surface-slimes',
    '348-sky-slimes', '074-bath-service']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sluice', file + '.js'), 'utf8'), s,
      { filename: file });
  }
  return s;
}

let cases = 0;
for (const solver of ['pbd', 'xpbd', 'fem']) for (const substeps of [1, 3, 5]) {
  for (const existing of [false, true]) {
    const s = fixture();
    s.JELLO_SOLVER = solver; s.JELLO_XPBD_SUBSTEPS = substeps;
    const h = s.JELLO_H * s.jelloImpulseScale();
    if (existing) {
      s.surfaceSlimeBuild(4600, 474, { id: 1, seed: 0.2 });
      // The preceding resident has advanced the effective solver timestep.
      s.jelloStepH = h;
    }
    const guest = { id: 10, seed: 0.5, r: 25, bathed: true };
    assert.equal(s.bathReleaseGuest({ s: guest }), true);
    const b = s.jelloBodies.find(body => body.surfaceSlime.id === guest.id);
    assert.ok(b, 'the actual bath release creates the guest identity');
    assert.equal(b.surfaceSlime.radius, guest.r, 'release retains guest size');
    for (let p = 0; p < b.n; p++) {
      const vx = (b.px[p] - b.ox[p]) * s.JELLO_TIMESCALE / h;
      const vy = (b.py[p] - b.oy[p]) * s.JELLO_TIMESCALE / h;
      assert.ok(Math.abs(vx - 65) < 1e-7, `${solver}/${substeps}/${existing}: horizontal launch ${vx}`);
      assert.ok(Math.abs(vy + 110) < 1e-7, `${solver}/${substeps}/${existing}: vertical launch ${vy}`);
    }
    // Consume that history with the actual integrator, isolated in free space
    // from gravity and damping so it measures the launch itself.
    s.JELLO_GRAVITY = 0; s.JELLO_DAMPING = 1;
    const x = Array.from(b.px), y = Array.from(b.py);
    s.jelloIntegrate(b, h);
    for (let p = 0; p < b.n; p++) {
      assert.ok(Math.abs(b.px[p] - x[p] - 65 * h / s.JELLO_TIMESCALE) < 1e-7);
      assert.ok(Math.abs(b.py[p] - y[p] + 110 * h / s.JELLO_TIMESCALE) < 1e-7);
    }
    cases++;
  }
}
console.log(`PASS: ${cases} first/later bath releases retain the intended launch across solver substeps.`);

for (const kind of ['resident', 'rock', 'rig', 'terrain']) {
  const s = fixture(), x = (s.banyaDoorX0 + s.banyaDoorX1) / 2, y = s.SKY_ROWS * s.TILE - 38;
  Object.assign(s, { gameOver: false, gameWon: false, gamePaused: false, bathMode: false,
    bathOperationsTick() {}, bathToolTick() {}, bathSkinFlakeTick() {}, bathToolCollider() {},
    money: 75 });
  s.bathServed = 1;
  const guest = { s: { id: 10, seed: 0.5, r: 25, bathed: true, x: 650, y: 19500, age: 0 },
    paid: true, served: true, st: 'exit', t: 0 };
  s.bathGuests.push(guest);
  let clear;
  if (kind === 'resident') {
    const b = s.surfaceSlimeBuild(x, y, { id: 1, seed: 0.2 });
    b.sleeping = b.frozen = true;
    clear = () => {
      for (let p = 0; p < b.n; p++) { b.px[p] += 200; b.ox[p] += 200; }
      b.cx += 200; b.bboxL += 200; b.bboxR += 200;
    };
  } else if (kind === 'rock') {
    s.skySlimes.push({ x, y, r: 25 }); clear = () => { s.skySlimes[0].x += 200; };
  } else if (kind === 'rig') {
    s.player.x = x - 11; s.player.y = y + 12; clear = () => { s.player.x += 200; };
  } else {
    s.tileAt = (row, col) => row === Math.floor(y / 32) && col === Math.floor(x / 32) ? { type: 'stone' } : null;
    clear = () => { s.tileAt = () => null; };
  }
  const before = s.jelloBodies.length;
  for (let n = 0; n < 4; n++) s.bathGuestTick(1 / 60);
  assert.equal(s.bathGuests[0], guest, kind + ' keeps the same paid guest indoors');
  assert.equal(s.jelloBodies.length, before, kind + ' creates no overlapping body');
  assert.equal(guest.s.x, 650); assert.equal(guest.s.y, 19500);
  assert.equal(s.money, 75); assert.equal(s.bathServed, 1);
  clear(); s.bathGuestTick(1 / 60);
  assert.equal(s.bathGuests.length, 0, kind + ' releases immediately when clear');
  assert.equal(s.jelloBodies.length, before + 1);
  assert.equal(s.jelloBodies.filter(b => b.surfaceSlime.id === guest.s.id).length, 1);
  for (let n = 0; n < 4; n++) s.bathGuestTick(1 / 60);
  assert.equal(s.jelloBodies.length, before + 1, kind + ' never duplicates the release');
  assert.equal(s.money, 75); assert.equal(s.bathServed, 1);
}
{
  const s = fixture(), x = (s.banyaDoorX0 + s.banyaDoorX1) / 2, y = s.SKY_ROWS * s.TILE - 38;
  s.surfaceSlimeBuild(x + 42, y + 42, { id: 1, seed: 0.2, r: 25 });
  assert.equal(s.bathReleaseGuest({ s: { id: 10, seed: 0.5, r: 25, bathed: true } }), true,
    'a nearby diagonal resident with clear skin does not block the door');
}
console.log('PASS: occupied resident/rock/rig/terrain exits preserve the paid guest and release it once after clearance.');
{
  const s = fixture();
  Object.assign(s, { gameOver: false, gameWon: false, gamePaused: false, bathMode: true,
    bathOperationsTick() {}, bathToolTick() {}, bathSkinFlakeTick() {}, bathToolCollider() {},
    bathGuestContour: () => null, money: 150 });
  s.bathServed = 2;
  for (const id of [20, 21]) s.bathGuests.push({
    s: { id, seed: 0.5, r: 25, bathed: true, x: 650, y: 19500, age: 0 },
    paid: true, served: true, st: 'exit', t: 0,
  });
  s.bathGuestTick(1 / 60);
  assert.equal(s.jelloBodies.length, 1, 'simultaneous indoor departures create only one exterior body');
  assert.equal(s.bathGuests.length, 1);
  const first = s.jelloBodies[0]; first.frozen = true;
  for (let n = 0; n < 60; n++) s.bathGuestTick(1 / 60);
  assert.equal(s.jelloBodies.length, 1, 'offscreen frozen doorway resident blocks the next birth');
  for (let p = 0; p < first.n; p++) { first.px[p] += 200; first.ox[p] += 200; }
  first.cx += 200; first.bboxL += 200; first.bboxR += 200;
  s.bathGuestTick(1 / 60);
  assert.equal(s.bathGuests.length, 0); assert.equal(s.jelloBodies.length, 2);
  assert.equal(s.money, 150); assert.equal(s.bathServed, 2);
  assert.equal(new Set(s.jelloBodies.map(b => b.surfaceSlime.id)).size, 2);
}
console.log('PASS: simultaneous indoor departures cannot stack frozen residents at the exterior door.');
