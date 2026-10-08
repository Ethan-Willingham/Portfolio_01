// Exercise the actual resident builder and rocky contact, without a renderer.
// Multiple rock substeps before one gel tick must conserve momentum and lose energy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../js/sluice');

function fixture() {
  const s = {
    window: { location: { search: '' }, addEventListener() {} },
    location: { search: '' }, URLSearchParams, softProjectEnabled: false,
    performance: { now: () => 1000 },
    TILE: 32, GRAVITY: 600, COLS: 320, TOTAL_ROWS: 500, SKY_ROWS: 16,
    PLAYER_W: 22, PLAYER_H: 26, ENABLE_JELLO: true,
    player: { x: 5200, y: 486, vx: 0, vy: 0 }, tileAt: () => null
  };
  vm.createContext(s);
  for (const file of ['340-jello', '342-soft-contact', '347-slime-locomotion',
    '347-surface-slimes', '348-sky-slimes', '349-slime-touch']) {
    const filename = file === '349-slime-touch' && process.env.TOUCH_FRAGMENT || path.join(root, file + '.js');
    vm.runInContext(fs.readFileSync(filename, 'utf8'), s, { filename });
  }
  return s;
}

function velocities(s, b) {
  const scale = s.JELLO_TIMESCALE / (s.JELLO_H * s.jelloImpulseScale());
  return Array.from(b.px, (x, i) => [(x - b.ox[i]) * scale, (b.py[i] - b.oy[i]) * scale]);
}

function totals(s, b, rock) {
  const mass = s.SKY_SLIME_MASS * rock.r * rock.r / 625;
  const out = { energy: mass * (rock.vx ** 2 + rock.vy ** 2) / 2,
    x: mass * rock.vx, y: mass * rock.vy };
  for (const [vx, vy] of velocities(s, b)) {
    out.energy += s.SOFT_CONTACT_POINT_MASS * (vx * vx + vy * vy) / 2;
    out.x += s.SOFT_CONTACT_POINT_MASS * vx;
    out.y += s.SOFT_CONTACT_POINT_MASS * vy;
  }
  return out;
}

let cases = 0;
function run({ seed = 0.5, radius = 25, angle = 0, steps = 2,
  boost = [0, 0], localMotion = false, solver = 'xpbd', substeps = 3,
  equalVelocity = false, cachedVelocity = [800, -500], warm = false } = {}) {
  const s = fixture();
  s.JELLO_SOLVER = solver; s.JELLO_XPBD_SUBSTEPS = substeps;
  // Leave jelloStepH at its cold-boot value, just as for the first resident.
  const h = s.JELLO_H * s.jelloImpulseScale();
  if (warm) s.jelloStepH = h;
  const b = s.surfaceSlimeBuild(4800, 450, { id: 1, seed, r: radius });
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const rock = s.skySlimeFresh(4800 + nx * (radius + 13), 450 + ny * (radius + 13));
  rock.r = 25;
  rock.vx = boost[0] - (equalVelocity ? 0 : nx * 200);
  rock.vy = boost[1] - (equalVelocity ? 0 : ny * 200);
  for (let i = 0; i < b.n; i++) {
    b.ox[i] -= (boost[0] + (localMotion ? Math.sin(i * 1.7) * 180 : 0)) * h / s.JELLO_TIMESCALE;
    b.oy[i] -= (boost[1] + (localMotion ? Math.cos(i * 0.7) * 180 : 0)) * h / s.JELLO_TIMESCALE;
  }
  // Render/centroid reports are deliberately stale and cannot govern contact.
  b.vx = cachedVelocity[0]; b.vy = cachedVelocity[1];
  const before = totals(s, b, rock), old = velocities(s, b);
  for (let step = 0; step < steps; step++) {
    const prior = totals(s, b, rock);
    s.surfaceSlimeRockContact(rock, 1 / 240);
    const after = totals(s, b, rock);
    assert.ok(after.energy <= prior.energy + Math.max(1e-6, prior.energy * 1e-10),
      `passive contact ${JSON.stringify({ seed, radius, angle, step, localMotion, solver, substeps })}: ${prior.energy} -> ${after.energy}`);
    assert.ok(Math.abs(after.x - before.x) < 1e-7 && Math.abs(after.y - before.y) < 1e-7,
      'rock and local gel impulse conserve momentum');
  }
  const after = velocities(s, b);
  if (equalVelocity) {
    assert.ok(Math.abs(rock.vx - boost[0]) < 1e-7 && Math.abs(rock.vy - boost[1]) < 1e-7);
    after.forEach((v, i) => assert.ok(Math.hypot(v[0] - old[i][0], v[1] - old[i][1]) < 1e-7,
      'equal local velocities require no impulse despite stale centroid velocity'));
  }
  cases++;
  return { after, rock };
}

// The ordinary two rocky substeps at 120 FPS used to inject energy on the
// second contact, even with an initially correct centroid velocity report.
run({ cachedVelocity: [0, 0], warm: true });
for (const seed of [0.08, 0.5, 0.91]) for (const radius of [22, 25, 27]) {
  for (let angle = 0; angle < 6.2; angle += Math.PI / 4) {
    for (const localMotion of [false, true]) run({ seed, radius, angle, localMotion, steps: 8 });
  }
}
for (const solver of ['pbd', 'xpbd', 'fem']) for (const substeps of [1, 3, 5]) {
  run({ solver, substeps });
  run({ solver, substeps, equalVelocity: true, boost: [80, -35] });
}
for (const angle of [0.2, 1.6, 3.8]) {
  const base = run({ angle, localMotion: true }), boost = [130, -80];
  const moving = run({ angle, localMotion: true, boost });
  base.after.forEach((v, i) => assert.ok(Math.hypot(moving.after[i][0] - v[0] - boost[0],
    moving.after[i][1] - v[1] - boost[1]) < 1e-7, 'contact impulse is independent of the inertial frame'));
  assert.ok(Math.hypot(moving.rock.vx - base.rock.vx - boost[0],
    moving.rock.vy - base.rock.vy - boost[1]) < 1e-7);
}
console.log(`PASS: ${cases} rocky/soft contacts preserve momentum, dissipate energy, and use live local velocity.`);
