// Physical-observer and render-isolation checks, no browser or player's save.
// PRESENTATION_FRAGMENT=/tmp/draft.js node tools/test-soft-presentation.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fragment = process.env.PRESENTATION_FRAGMENT || path.join(root, 'js/sluice/346-soft-presentation.js');
const source = fs.readFileSync(fragment, 'utf8');
// The optional patch data exercises the proposed exact call sites before integration.
const hookPatches = process.env.PRESENTATION_HOOKS ? JSON.parse(fs.readFileSync(process.env.PRESENTATION_HOOKS, 'utf8')) : [];
function fragmentText(name) {
  const relative = 'js/sluice/' + name;
  let text = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const patch of hookPatches.filter(patch => patch.path === relative)) {
    if (text.includes(patch.after)) continue;
    assert.equal(text.split(patch.before).length - 1, 1, relative + ' exact hook insertion site');
    text = text.replace(patch.before, patch.after);
  }
  return text;
}
const audio = fragmentText('346-slime-audio.js');
const surface = fragmentText('347-surface-slimes.js');
const contacts = ['342-soft-contact.js', '344-soft-terrain.js', '345-soft-pairs.js'].map(fragmentText).join('\n');
const hooksInstalled = contacts.includes('softPresentationContact(');
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
function context() {
  const calls = [], sounds = [];
  let depth = 0;
  const canvas = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createRadialGradient') return (...args) => {
      check(args.every(Number.isFinite), 'finite radial gradient');
      calls.push([key, ...args]);
      return { addColorStop() {} };
    };
    return (...args) => {
      check(args.filter(arg => typeof arg === 'number').every(Number.isFinite), 'finite canvas ' + key);
      if (key === 'save') depth++;
      if (key === 'restore') depth--;
      check(depth >= 0, 'canvas stack does not underflow');
      calls.push([key, ...args]);
    };
  } });
  const w = { console, Math, Float64Array, SOFT_PRESENTATION: true,
    URLSearchParams, location: { search: '' }, softProjectEnabled: false,
    softPlayEnabled: false, softPlayMaterialTrial: false, SOFT_PAIRS: true,
    performance: { now: () => 1000 }, solidAt: () => false, jelloWorldSolidAt: () => false,
    JELLO_REST_VEL: 30, JELLO_BOUNCE: 0.18, recordLandingImpact() {},
    JELLO_TIMESCALE: 0.5, JELLO_H: 1 / 240, jelloStepH: 1 / 240, jelloFrameNo: 0,
    skySlimeClamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), ctx: canvas,
    ENABLE_JELLO: true, gamePaused: false, gameOver: false, gameWon: false,
    shopOpen: false, shopState: 'closed', ledgerOpen: false, cargoManifestOpen: false,
    jelloBodies: [], player: { x: 450, y: 300 }, PLAYER_W: 22, PLAYER_H: 26, TILE: 32,
    cam: { x: 0, y: 0 }, screenW: 1000, screenH: 800,
    sfxPlay: (...args) => sounds.push(args), sfxPanAt: x => (x - 500) / 500,
    rocketJetVisible: () => false, calls, sounds, depth: () => depth };
  vm.createContext(w); vm.runInContext(surface + '\n' + audio + '\n' + contacts + '\n' + source, w);
  return w;
}
function body() {
  const b = { n: 25, ringN: 18, springN: 24, cx: 500, cy: 300, vx: 0, vy: 0,
    surfaceSlime: { radius: 25, seed: 0.3, hue: 133, blink: 0 }, tileW: 1.6, tileH: 1.6,
    px: new Float64Array(25), py: new Float64Array(25), ox: new Float64Array(25), oy: new Float64Array(25),
    rx: new Float64Array(25), ry: new Float64Array(25), sA: [], sB: [], ring: [] };
  b.rx[0] = 500; b.ry[0] = 300;
  for (let i = 1; i <= 24; i++) {
    const inner = i <= 6, count = inner ? 6 : 18, k = inner ? i - 1 : i - 7;
    const a = (k + 0.25) / count * Math.PI * 2, r = inner ? 8 : 25;
    b.rx[i] = 500 + Math.cos(a) * r; b.ry[i] = 300 + Math.sin(a) * r;
    b.sA.push(inner ? 0 : i); b.sB.push(inner ? i : 7 + ((i - 6) % 18));
    if (!inner) b.ring.push(i);
  }
  b.px.set(b.rx); b.py.set(b.ry); b.ox.set(b.rx); b.oy.set(b.ry);
  return b;
}
function transform(b, f = [1, 0, 0, 1], x = 500, y = 300, vx = 0, vy = 0) {
  for (let i = 0; i < b.n; i++) {
    const qx = b.rx[i] - 500, qy = b.ry[i] - 300;
    b.px[i] = x + f[0] * qx + f[1] * qy; b.py[i] = y + f[2] * qx + f[3] * qy;
    b.ox[i] = b.px[i] - vx / 120; b.oy[i] = b.py[i] - vy / 120;
  }
  b.cx = x; b.cy = y; b.vx = vx * 2; b.vy = vy * 2;
}
const geometry = b => JSON.stringify([b.px, b.py, b.ox, b.oy, b.rx, b.ry, b.sA, b.sB, b.cx, b.cy, b.vx, b.vy]);
const report = { transforms: [], refreshRates: [], sounds: 0 };
for (const [name, f] of [ ['rest', [1, 0, 0, 1]], ['compressed', [1.2, 0, 0, 0.6]],
  ['sheared', [1, 0.35, 0.2, 1]], ['rotated', [0, -1, 1, 0]], ['inverted', [1, 0, 0, -1]],
  ['near-flat', [1, 0, 0, 0.00001]] ]) {
  const w = context(), b = body(); transform(b, f);
  const before = geometry(b);
  check(w.softPresentationTick(b, 1 / 60, null, null), name + ' ticks');
  check(geometry(b) === before, name + ' tick never writes physical state');
  const beforeDraw = JSON.stringify(b);
  check(w.softPresentationDrawInterior(b), name + ' interior');
  check(w.softPresentationDrawEye(b), name + ' eye');
  check(JSON.stringify(b) === beforeDraw, name + ' rendering is read-only');
  check(w.depth() === 0, name + ' restores canvas');
  check(Number.isFinite(b.surfaceSlime.presentation.compression + b.surfaceSlime.presentation.extension), name + ' finite metrics');
  const matrix = w.calls.findLast(call => call[0] === 'transform').slice(1, 5);
  if (name === 'rotated') check(Math.abs(matrix[0] - 1) + Math.abs(matrix[3] - 1) + Math.abs(matrix[1]) + Math.abs(matrix[2]) < 1e-9, 'rigid rotation keeps eye cup circular');
  if (name === 'compressed') check(matrix[0] > 1 && matrix[3] < 1 && b.surfaceSlime.presentation.compression > 0.25, 'local squeeze is visible without reshaping body');
  report.transforms.push({ name, eyeMatrix: matrix, compression: b.surfaceSlime.presentation.compression });
}
{
  const w = context(), b = body(); w.softPresentationTick(b, 1 / 60, null, null);
  const state = b.surfaceSlime.presentation, out = new Float64Array(4);
  w.softPresentationEyeMatrix(b, state, out); const before = Array.from(out);
  b.px[b.ring[4]] += 10; b.py[b.ring[4]] -= 5;
  w.softPresentationEyeMatrix(b, state, out);
  assert.deepEqual(Array.from(out), before, 'a distant lobe does not impose a whole-body face transform');
  w.softPresentationDrawInterior(b);
  check(w.calls.some(call => call[0] === 'transform' && Math.abs(call[2]) + Math.abs(call[3]) > 0.01), 'the deformed lobe moves a local inclusion');
}
{
  const w = context(), b = body();
  // Put one small real material triangle around the first inclusion target.
  // Centre/rim fan deformation must no longer override that local triangle.
  const old = w.softPresentationInit(b).patches[0];
  const x = b.rx[old.o] + (b.rx[old.a] - b.rx[old.o]) * old.wa + (b.rx[old.c] - b.rx[old.o]) * old.wc;
  const y = b.ry[old.o] + (b.ry[old.a] - b.ry[old.o]) * old.wa + (b.ry[old.c] - b.ry[old.o]) * old.wc;
  for (const key of ['px','py','ox','oy','rx','ry']) {
    const values = new Float64Array(28); values.set(b[key]); b[key] = values;
  }
  for (const [i, dx, dy] of [[25,-2,-2],[26,2,-2],[27,0,2]]) {
    b.rx[i] = b.px[i] = b.ox[i] = x + dx; b.ry[i] = b.py[i] = b.oy[i] = y + dy;
  }
  b.n = 28; b.triN = 1; b.triA = [25]; b.triB = [26]; b.triC = [27];
  delete b.surfaceSlime.presentation;
  const patch = w.softPresentationInit(b).patches[0];
  check(patch.o === 25 && patch.a === 26 && patch.c === 27, 'inclusion binds the containing material triangle');
  w.softPresentationDrawInterior(b);
  const first = w.calls.find(call => call[0] === 'translate').slice(1);
  b.px[0] += 3; b.py[b.ring[10]] += 6; w.calls.length = 0;
  w.softPresentationDrawInterior(b);
  assert.deepEqual(w.calls.find(call => call[0] === 'translate').slice(1), first, 'remote centre or rim cannot drag a local inclusion'); assertions++;
  b.px[27] += 2; w.calls.length = 0;
  const before = geometry(b); w.softPresentationDrawInterior(b);
  const moved = w.calls.find(call => call[0] === 'translate').slice(1);
  check(Math.abs(moved[0] - first[0] - 2 * patch.wc) < 1e-9, 'inclusion follows local barycentric motion');
  check(geometry(b) === before, 'local material drawing remains read-only');
}
for (const fps of [30, 60, 144]) {
  const w = context(), b = body(), dt = 1 / fps;
  let x = 500, peak = 0;
  for (let n = 0; n < fps * 4; n++) {
    const t = n * dt, vx = 110 * Math.sin(t * Math.PI * 2);
    x += vx * dt; transform(b, undefined, x, 300, vx, 0);
    const before = geometry(b); w.softPresentationTick(b, dt, 120, 0);
    check(before === geometry(b), 'motion observer leaves node histories exact');
    const e = b.surfaceSlime.eye;
    check(Number.isFinite(e.x + e.y + e.vx + e.vy), 'finite pupil during acceleration');
    check(Math.hypot(e.x, e.y) <= 0.175 + 1e-12, 'pupil stays in physical cup');
    peak = Math.max(peak, Math.abs(e.x));
  }
  const e = b.surfaceSlime.eye;
  report.refreshRates.push({ fps, x: e.x, y: e.y, peak });
  transform(b, undefined, x + 10000, 300, 0, 0);
  w.softPresentationTick(b, dt, null, null);
  check(Math.hypot(e.vx, e.vy) < 1, 'teleport does not launch pupil');
  // The comparison can fall back to the existing observer with valid histories.
  w.surfaceSlimeEyeTick(b.surfaceSlime, b.px[0], b.py[0], 25, dt, null, null);
  check(Number.isFinite(e.x + e.y), 'live comparison preserves baseline eye fields');
}
check(Math.max(...report.refreshRates.map(r => r.x)) - Math.min(...report.refreshRates.map(r => r.x)) < 0.025, 'pupil response remains close at 30/60/144 Hz');
{
  const w = context(), b = body();
  w.SOFT_PRESENTATION = false; const before = JSON.stringify(b);
  check(!w.softPresentationTick(b, 1 / 60, null, null), 'flag-off bypass');
  w.softPresentationDrawEye(b); w.softPresentationDrawInterior(b); w.softPresentationContact(b, 7, 8, 0.5, 300, 250);
  check(before === JSON.stringify(b), 'flag-off leaves all state exact');
  w.SOFT_PRESENTATION = true; delete b.surfaceSlime; const hard = JSON.stringify(b);
  w.softPresentationTick(b, 1 / 60, null, null); w.softPresentationDrawEye(b); w.softPresentationDrawInterior(b); w.softPresentationContact(b, 7, 8, 0.5, 300, 250);
  check(hard === JSON.stringify(b), 'hard visitors cannot enter presentation');
}
{
  const w = context(), b = body();
  for (const speed of [0, 5, 50, 94]) w.softPresentationContact(b, 7, 8, 0.5, speed, speed);
  check(!b._sound, 'resting pile microcontacts remain silent');
  w.softPresentationContact(b, 7, 8, 0.5, 200, 0);
  check(!b._sound, 'unresolved approach creates no sound');
  const before = geometry(b);
  w.softPresentationContact(b, 7, 8, 0.25, 240, 220);
  check(b._sound.hit > 0.4 && b.vx === 0 && b.vy === 0, 'resolved local hit is audible even with a pinned center');
  const strength = b._sound.hit;
  w.softPresentationContact(b, 7, 8, 0.25, 110, 40);
  check(b._sound.hit === strength, 'weaker contacts do not replace strongest impact');
  check(geometry(b) === before, 'sound observer leaves physics exact');
  w.jelloBodies = [b];
  for (let i = 0; i < 7; i++) {
    const next = body(); w.softPresentationContact(next, 7, 8, 0.5, 240 + i * 10, 220); w.jelloBodies.push(next);
  }
  w.slimeAudioUpdate(1 / 60);
  check(w.sounds.length === 1, 'eight-body pile shares a single existing audio voice');
  for (const next of w.jelloBodies) w.softPresentationContact(next, 7, 8, 0.5, 300, 220);
  w.slimeAudioUpdate(1 / 60);
  check(w.sounds.length === 1, 'existing global cooldown still suppresses repeat pile hits');
  check(w.jelloBodies.every(next => next._sound.hit === 0), 'cooldown does not queue deferred impacts');
  report.sounds = w.sounds.length;
}
{
  const w = context(), b = body();
  w.softPresentationContact(b, 7.5, 8, 0.5, 240, 220);
  check(!b._sound, 'noninteger contact indices are ignored');
  b.sleeping = true;
  w.softPresentationContact(b, 7, 8, 0.5, 240, 220);
  b.sleeping = false; w.jelloBodies = [b]; w.slimeAudioUpdate(1 / 60);
  check(w.sounds.length === 1, 'a real contact can wake a silent sleeper in the same solver pass');
  for (const quietKey of ['gamePaused', 'gameOver', 'gameWon', 'shopOpen', 'ledgerOpen', 'cargoManifestOpen']) {
    const next = body(); w.jelloBodies = [next]; w[quietKey] = true;
    w.softPresentationContact(next, 7, 8, 0.5, 240, 220); w.slimeAudioUpdate(1);
    check(w.sounds.length === 1 && next._sound.hit === 0, quietKey + ' discards pending contact audio');
    w[quietKey] = false; w.slimeAudioUpdate(1);
    check(w.sounds.length === 1, quietKey + ' does not replay deferred impacts');
  }
}
if (hooksInstalled) {
  for (const h of [1 / 240, 1 / 720]) {
    const w = context(), observed = [];
    const observer = w.softPresentationContact;
    w.softPresentationContact = (...args) => { observed.push(args.slice(4)); return observer(...args); };
    const b = body();
    for (let i = 0; i < b.n; i++) b.oy[i] = b.py[i] - 240 * h / w.JELLO_TIMESCALE;
    w.softTerrainProject(b, 7, 8, 0.25, 0, -1, 0.3, h);
    check(observed.length === 1 && Math.abs(observed[0][0] - 240) < 1e-7, 'terrain hook uses real approach px/s at ' + h);
    check(Math.abs(observed[0][1] - 240 * 1.18) < 1e-7, 'terrain hook observes actual normal impulse including bounce');
    observed.length = 0;
    const A = body(), B = body();
    for (let i = 0; i < A.n; i++) {
      A.ox[i] = A.px[i] - 120 * h / w.JELLO_TIMESCALE;
      B.ox[i] = B.px[i] + 120 * h / w.JELLO_TIMESCALE;
    }
    w.softPairsPatch(A, 7, 8, 0.3, B, 9, 10, 0.65, -1, 0, 0.1, h);
    check(observed.length === 2 && observed.every(event => Math.abs(event[0] - 240) < 1e-7), 'pair hook uses real relative approach px/s');
    check(observed.every(event => Math.abs(event[1] - 240) < 1e-7), 'pair hook excludes velocity-free geometric correction');
    observed.length = 0;
    const rigidBody = body(), dt = h / w.JELLO_TIMESCALE;
    const frame = { rig: { x: 450, y: 300, vx: 240, vy: 0 }, vx: 240, vy: 0, hit: false };
    w.softContactProject(rigidBody, 7, 8, 0.3, -1, 0, 1, 300, dt, frame);
    const event = observed[0];
    const after = frame.rig.vx - ((rigidBody.px[7] - rigidBody.ox[7]) * 0.7 + (rigidBody.px[8] - rigidBody.ox[8]) * 0.3) / dt;
    check(observed.length === 1 && Math.abs(event[0] - 240) < 1e-7, 'rig hook does not convert already-real speeds twice');
    check(Math.abs(event[1] - (240 - after)) < 1e-7, 'rig hook measures the actual relative normal change');
    w.SOFT_PRESENTATION = false; observed.length = 0;
    w.softTerrainProject(body(), 7, 8, 0.25, 0, -1, 0.3, h);
    check(observed.length === 0, 'disabled presentation skips observer work at the contact site');
  }
  const w = context(), b = body(); b.vx = 600;
  w.slimeAudioImpact(b, 0, 400);
  check(!b._sound, 'old contact heuristic cannot win over a trial physical event');
  w.SOFT_PRESENTATION = false; w.slimeAudioImpact(b, 0, 400);
  check(b._sound.hit > 0, 'accepted contact audio remains available outside the trial');
  report.contactHookGroups = 3;
}
console.log(JSON.stringify(report, null, 2));
console.log('PASS soft presentation: local strain, inertia, read-only rendering, protected bodies, and physical audio (' + assertions + ' assertions).');
