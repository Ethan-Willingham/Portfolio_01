// Contact geometry checks against the filled production rig art.
// Run: node tools/test-rig-hull.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const art = fs.readFileSync('js/sluice/210-player.js', 'utf8');
const source = fs.readFileSync('js/sluice/069-rig-hull.js', 'utf8');
const w = { Math, Float64Array, PLAYER_W: 22, PLAYER_H: 26,
  player: { x: 120, y: 80, dir: 1, bodyTiltRender: 0 },
  scale: { x: 1, y: 1 }, dip: 0 };
w.playerBodyScale = () => w.scale;
w.playerFxLandOffset = () => w.dip;
vm.createContext(w); vm.runInContext(source, w);

function filledPath(marker) {
  const begin = art.indexOf(marker);
  assert(begin >= 0, 'production path marker ' + marker);
  const a = art.indexOf('    ctx.beginPath();', begin);
  const b = art.indexOf('    ctx.fill();', a);
  const points = [];
  const ctx = {
    beginPath() {}, closePath() {},
    moveTo(x, y) { points.push([x, y]); },
    lineTo(x, y) { points.push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) {
      const [sx, sy] = points.at(-1);
      for (let i = 1; i <= 160; i++) {
        const t = i / 160, u = 1 - t;
        points.push([u * u * sx + 2 * u * t * cx + t * t * x,
          u * u * sy + 2 * u * t * cy + t * t * y]);
      }
    }
  };
  vm.runInNewContext(art.slice(a, b), { ctx });
  return points;
}
const hull = filledPath('// ----- Heavy cast armor hull -----');
const cab = filledPath('// ----- Low command cupola and periscope slit -----');
const trackStart = art.indexOf('  function drawPlayerTracks()');
const track = art.slice(trackStart).match(/roundRect\(ctx, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), true\)/);
assert(track, 'production track rounded rectangle');
const [tl, tt, tw, th, tr] = track.slice(1).map(Number);
function pointIn(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function trackContains(x, y) {
  const qx = Math.abs(x - tl - tw / 2) - tw / 2 + tr;
  const qy = Math.abs(y - tt - th / 2) - th / 2 + tr;
  return Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(Math.max(qx, qy), 0) <= tr;
}
function painted(x, y, dip) {
  return trackContains(x, y) || pointIn([x, y - dip], hull) || pointIn([x, y - dip], cab);
}
function localPoints(dip) {
  return Array.from({ length: w.RIG_HULL_LOCAL.length / 2 }, (_, i) => {
    const x = w.RIG_HULL_LOCAL[i * 2], y = w.RIG_HULL_LOCAL[i * 2 + 1];
    return [x, y + (y < 18 ? dip : 0)];
  });
}
const neutral = localPoints(0);
assert(Math.min(...neutral.map(p => p[1])) < 7, 'rounded crown reaches the visible head');
assert(neutral[0][1] < 9 && neutral[9][1] < 9, 'both slopes continue to head height');
let sampleCount = 0;
// Reserve paint around the hull for drill shake and event-driven tremor.
const margin = 0.8;
for (let k = 0; k <= 27; k++) {
  const dip = k / 20, pts = localPoints(dip);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    assert(turn > 0.000001, 'strictly convex crown/base at dip ' + dip + ', vertex ' + i);
    for (let step = 0; step <= 160; step++) {
      const t = step / 160, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      for (let axis = 0; axis < 16; axis++) {
        const angle = axis / 16 * Math.PI * 2;
        assert(painted(x + Math.cos(angle) * margin, y + Math.sin(angle) * margin, dip),
          'inset contact boundary at dip ' + dip + ', edge ' + i + ', point ' + [x, y]);
        sampleCount++;
      }
    }
  }
  // The filled union has a narrow cab/track seam. Check the area as well as
  // vertices so a chord cannot silently cross a hole in the painted body.
  for (let y = 5; y < 25; y += 0.125) for (let x = 2; x < 20; x += 0.125) {
    if (pointIn([x, y], pts)) assert(painted(x, y, dip), 'contact interior is painted');
  }
  const bottom = pts.slice(-2);
  assert.equal(bottom[0][1], bottom[1][1], 'track base stays flat');
}

// Use the production draw transform to compare the physical vertices with
// their painted coordinates, including nonuniform scale and both mirrors.
const passStart = art.indexOf('  function drawRigBodyPass(');
const passEnd = art.indexOf('\n  }', passStart) + 4;
let matrix, stack, rendered;
function multiply(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
const ctx = { save() { stack.push([...matrix]); }, restore() { matrix = stack.pop(); },
  translate(x, y) { matrix = multiply(matrix, [1, 0, 0, 1, x, y]); },
  scale(x, y) { matrix = multiply(matrix, [x, 0, 0, y, 0, 0]); },
  rotate(a) { matrix = multiply(matrix, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); } };
const draw = { ctx, PLAYER_W: 22, PLAYER_H: 26,
  drawPlayerRigBody(t, dip) { rendered = localPoints(dip).map(([x, y]) =>
    [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]); } };
vm.createContext(draw); vm.runInContext(art.slice(passStart, passEnd), draw);
let poses = 0;
for (const dir of [-1, 1]) for (const dip of [0, 0.5, 1.35])
  for (const [sx, sy] of [[1, 1], [1.15, 0.82], [0.945, 1.099]])
    for (const tilt of [-0.35, 0, 0.35]) {
      w.player.dir = dir; w.player.bodyTiltRender = tilt; w.dip = dip; w.scale = { x: sx, y: sy };
      const h = w.rigContactHull();
      matrix = [1, 0, 0, 1, 0, 0]; stack = [];
      draw.drawRigBodyPass(w.player.x, w.player.y, tilt, sx, sy, dir < 0, 1, 0, dip);
      let cx = 0, cy = 0;
      for (let i = 0; i < h.n; i++) {
        assert(Math.hypot(h.x[i] - rendered[i][0], h.y[i] - rendered[i][1]) < 1e-9,
          'physics vertices match production draw transform');
        assert(Math.abs(Math.hypot(h.nx[i], h.ny[i]) - 1) < 1e-9, 'unit contact normal');
        cx += h.x[i] / h.n; cy += h.y[i] / h.n;
      }
      assert(w.rigHullContains(h, cx, cy), 'interior stays inside under pose');
      assert(w.rigHullQuery(h, cx, cy).distance < 0, 'interior signed distance');
      for (let i = 0; i < h.n; i++) {
        if (i !== h.n - 2) assert(h.ny[i] * Math.cos(tilt) - h.nx[i] * Math.sin(tilt) < 0,
          'every non-base face guides material toward the banked crown');
        const j = (i + 1) % h.n;
        const x = (h.x[i] + h.x[j]) / 2, y = (h.y[i] + h.y[j]) / 2;
        assert(w.rigHullContains(h, x - h.nx[i] * 0.1, y - h.ny[i] * 0.1), 'normal points out');
        assert(!w.rigHullContains(h, x + h.nx[i] * 0.1, y + h.ny[i] * 0.1), 'outward point is outside');
        const q = w.rigHullQuery(h, x + h.nx[i] * 0.25, y + h.ny[i] * 0.25);
        assert(Math.abs(q.distance - 0.25) < 1e-9, 'nearest face distance');
      }
      // Contact stays within the body users see even when the paint shakes.
      // Invert the exact draw transform to query the filled production art.
      for (const shakeX of [-0.55, 0.55]) for (const shakeY of [-0.3, 0.3])
        for (const tremor of [-0.00825, 0.00825]) {
          const co = Math.cos(tilt + tremor), si = Math.sin(tilt + tremor);
          for (let i = 0; i < h.n; i++) {
            const j = (i + 1) % h.n;
            for (let k = 0; k <= 24; k++) {
              const u = k / 24;
              const dx = h.x[i] + (h.x[j] - h.x[i]) * u - w.player.x - shakeX - 11;
              const dy = h.y[i] + (h.y[j] - h.y[i]) * u - w.player.y - shakeY - 26 * 0.56;
              const rx = 11 + dx * co + dy * si, ry = 26 * 0.56 - dx * si + dy * co;
              const lx = 11 + (rx - 11) / sx * dir, ly = 26 + (ry - 26) / sy;
              assert(painted(lx, ly, dip), 'contact stays inside visibly shaken body');
            }
          }
        }
      poses++;
    }
console.log('PASS: ' + sampleCount + ' painted boundary probes, 28 suspension offsets, ' + poses + ' draw poses, convexity, normals and signed distance.');
