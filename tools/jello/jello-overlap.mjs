// jello-overlap.mjs - the permanent no-merge / no-tunnel regression suite.
//
// Owner invariants (2026-08-02): slime bodies must NEVER sustain visible
// overlap, and must NEVER end up inside or past solid terrain. Single-body
// kinetics were proven absolute (0.0 px wall intrusion at 2000 real px/s);
// the reachable failure windows are multi-body crams, multi-tile soft
// bodies, NPC hop pileups, and the sanctioned phasing/park machinery. This
// suite drives exactly those windows and holds four bars:
//   A (hard)  zero body points inside solid tiles at any sample
//   B (hard)  no body centroid ever crosses a sealed 1-tile wall
//   C (hard)  every pair fully separates after pressure releases
//   D (soft)  non-phasing containment deeper than 3 px never sustains > 1 s
// It also records phasing windows, worst depths, and update.jello perf so
// fix commits can prove they did not regress feel or budget.
//
// Run: node tools/jello/jello-overlap.mjs   (from the repo root; serves
// itself on PORT, default 8148). Needs the Chrome-for-Testing shim at
// ~/.local/bin/agent-chrome-for-testing (WebGPU: --use-angle=metal).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 8148);
const DEBUG_PORT = PORT + 1000;
const CHROME = process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`;
const PROFILE = fs.mkdtempSync('/tmp/jello-overlap-');
const TILE = 32;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal',
  '--no-first-run', '--disable-gpu-sandbox',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank',
], { stdio: 'ignore' });
function cleanup() {
  try { chrome.kill(); } catch (e) {}
  try { server.kill(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);

async function cdpUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = (await r.json()).find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('no CDP page');
}

let ws, seq = 0;
const pending = new Map();
const consoleErrors = [];
function send(method, params = {}) {
  return new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expr, promise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: promise });
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result ? r.result.value : undefined;
}

const SCEN = process.env.SCEN ? process.env.SCEN.split(',') : null;
const want = s => !SCEN || SCEN.includes(s);
const DUMP = process.env.DUMP;
function dump(name, samples) {
  if (!DUMP) return;
  try { fs.writeFileSync(path.join(DUMP, `overlap-${name}.json`), JSON.stringify(samples)); } catch (e) {}
}

const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? '' });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
}
function note(name, detail) { console.log(`note  ${name}  [${detail}]`); }

// ---- page boot + helper injection (shared by both boots) ----
async function boot(query) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/grand-motherload.html?dev=1&nosave=1&${query}` });
  await sleep(9000);
  const b = await ev(`({ j: typeof window.__jello !== 'undefined',
    pir: !!(window.__jello && __jello.pointInRing),
    g: typeof window.gm !== 'undefined' })`);
  if (!b.j || !b.g) throw new Error('game did not boot');
  if (!b.pir) throw new Error('__jello.pointInRing export missing (needs v26.70+ engine)');
  await ev(`(function(){
    var TILE = ${TILE};
    var W = window.__H = {};
    W.solidAt = function (x, y) { return !!__jello.tile(Math.floor(y / TILE), Math.floor(x / TILE)); };
    W.ground = function (c) { for (var r = 0; r < 40; r++) if (__jello.tile(r, c)) return r; return -1; };
    W.site = function (c0, need) {
      var g0 = -1, run = 0, start = -1;
      for (var c = c0; c < 480; c++) {
        var g = W.ground(c);
        if (g < 2) { run = 0; continue; }
        if (g === g0 && run > 0) { run++; } else { g0 = g; run = 1; start = c; }
        if (run >= need) {
          var ok = true;
          for (var cc = start; cc < start + need && ok; cc++)
            for (var rr = g0 - 8; rr < g0 && ok; rr++)
              if (rr >= 0 && __jello.tile(rr, cc)) ok = false;
          if (ok) return { c: start, g: g0 };
          run = 0;
        }
      }
      return null;
    };
    W.pinStop = function () { if (W._pin) { clearInterval(W._pin); W._pin = null; } };
    W.pinStart = function (fx, fy) {
      W.pinStop();
      var p = __jello.player();
      W._pin = setInterval(function () {
        p.x = fx(); p.y = fy(); p.vx = 0; p.vy = 0;
        if (p.fuel !== undefined && p.fuel < 50) p.fuel = 100;
      }, 15);
    };
    W.bulldoze = function (dxPerTick, vx, ms, xMax) {
      var p = __jello.player();
      var iv = setInterval(function () {
        if (xMax === undefined || p.x < xMax) p.x += dxPerTick;
        p.vx = vx; p.vy = 0;
      }, 15);
      setTimeout(function () { clearInterval(iv); p.vx = 0; }, ms);
    };
    W.sampStop = function () { if (W._s) clearInterval(W._s.iv); };
    W.sampStart = function (ms, fn) {
      W.sampStop();
      var S = W._s = { data: [], t0: performance.now() };
      S.iv = setInterval(function () {
        try { var d = fn(); d.t = (performance.now() - S.t0) / 1000; S.data.push(d); }
        catch (e) { S.data.push({ err: String(e).slice(0, 120) }); }
      }, ms);
      return true;
    };
    W.samples = function () { W.sampStop(); return W._s ? W._s.data : []; };
    // Max engine-definition containment: deepest A-ring point inside B.
    W.containDepth = function (A, B) {
      var maxD = 0, n = 0, ring = A.ring, rn = A.ringN;
      for (var i = 0; i < rn; i++) {
        var p = ring[i], x = A.px[p], y = A.py[p];
        if (!isFinite(x + y)) continue;
        if (x < B.bboxL || x > B.bboxR || y < B.bboxT || y > B.bboxB) continue;
        if (!__jello.pointInRing(B, x, y)) continue;
        var nr = __jello.nearestOnRing(B, x, y);
        var d = Math.hypot(nr.x - x, nr.y - y);
        n++;
        if (d > maxD) maxD = d;
      }
      return { n: n, maxD: maxD };
    };
    // One sample over a pile: worst pairwise containment, solid points,
    // NaN count, phasing flags, wall intrusion (past faceX, if given).
    W.pileSample = function (list, faceX) {
      var worst = 0, worstN = 0, worstPair = '', anyPhase = false, solid = 0, nan = 0, maxPastWall = -1e9, centroidPast = 0;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b._phaseMate) anyPhase = true;
        for (var k = 0; k < b.n; k++) {
          var x = b.px[k], y = b.py[k];
          if (!isFinite(x + y)) { nan++; continue; }
          if (W.solidAt(x, y)) solid++;
          if (faceX !== undefined && x - faceX > maxPastWall) maxPastWall = x - faceX;
        }
        if (faceX !== undefined && b.cx > faceX) centroidPast++;
        for (var j = 0; j < list.length; j++) {
          if (i === j) continue;
          var cd = W.containDepth(b, list[j]);
          if (cd.maxD > worst) { worst = cd.maxD; worstN = cd.n; worstPair = i + '>' + j; }
        }
      }
      var perf = 0;
      try { perf = window.perfBuckets ? (perfBuckets['update.jello'] || 0) : 0; } catch (e) {}
      return { d: worst, cn: worstN, pair: worstPair, ph: anyPhase, solid: solid, nan: nan,
               past: maxPastWall, cPast: centroidPast, perf: perf };
    };
    W.fps = function (secs) {
      return new Promise(function (done) {
        var n = 0, t0 = performance.now();
        function tick() { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick); else done(n / secs); }
        requestAnimationFrame(tick);
      });
    };
    // Carve an open pocket [r0..r1] x [c0..c1].
    W.digPocket = function (r0, r1, c0, c1) {
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) __jello.clearTile(r, c);
      return true;
    };
    // Sealed underground cave pair: main chamber [g+1..g+3] x [c0..c0+3],
    // far cavity [g+1..g+3] x [c0+5..c0+7], NATURAL 1-tile dirt wall at
    // c0+4, natural roof at row g. Nothing can vault it or activate it;
    // the only way past the wall face is through the dirt.
    W.digCave = function (g, c0) {
      W.digPocket(g + 1, g + 3, c0, c0 + 3);
      W.digPocket(g + 1, g + 3, c0 + 5, c0 + 7);
      return (c0 + 4) * TILE;   // wall face x
    };
    return true;
  })()`);
}

// Harness-side sustained-depth analysis over samples.
function sustain(samples, bar, excludePhase) {
  let worst = 0, run = 0, runMax = 0, prevT = null, phaseT = 0;
  for (const s of samples) {
    if (s.err || s.d === undefined) continue;
    const dt = prevT === null ? 0 : s.t - prevT;
    prevT = s.t;
    if (s.ph) phaseT += dt;
    if (s.d > worst) worst = s.d;
    const counts = s.d > bar && !(excludePhase && s.ph);
    run = counts ? run + dt : 0;
    if (run > runMax) runMax = run;
  }
  return { worst: worst.toFixed(1), sustain: runMax.toFixed(2), phaseT: phaseT.toFixed(2) };
}
function maxOf(samples, key, tMin) {
  let m = -1e9;
  for (const s of samples) if (s[key] !== undefined && s[key] > m && (tMin === undefined || s.t >= tMin)) m = s[key];
  return m;
}

try {
  ws = new WebSocket(await cdpUrl());
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = evt => {
    const m = JSON.parse(evt.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      consoleErrors.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  };
  await send('Runtime.enable');
  await send('Page.enable');

  // ================= Engine-pure boot (NPC brains off) =================
  await boot('npc=0');

  // ---- S1: free-field opposed rams (the proven-solid case stays solid) ----
  if (want('S1')) {
    const site = await ev(`__H.site(30, 12)`);
    if (!site) throw new Error('no flat site');
    const g = site.g, c = site.c;
    await ev(`__H.pinStart(function(){ return ${c + 6} * ${TILE}; }, function(){ return ${g - 3} * ${TILE}; })`);
    await ev(`(function(){
      window.__A = __jello.build([{ r: ${g - 1}, c: ${c + 3} }], 'slime');
      window.__B = __jello.build([{ r: ${g - 1}, c: ${c + 9} }], 'slime');
      return !!(__A && __B);
    })()`);
    await ev(`__H.sampStart(40, function(){ return __H.pileSample([__A, __B]); })`);
    await ev(`(function(){
      var n = 0;
      window.__ram = setInterval(function () {
        __jello.launchBody(__A, 900, 0); __jello.launchBody(__B, -900, 0);
        if (++n >= 12) clearInterval(__ram);
      }, 600);
      return true;
    })()`);
    await sleep(9500);
    const s = await ev(`__H.samples()`);
    dump('S1', s);
    const a = sustain(s, 3, true);
    check('S1 ram: no sustained deep containment', Number(a.sustain) < 1.0, `worst=${a.worst}px sustain=${a.sustain}s phase=${a.phaseT}s`);
    check('S1 ram: zero points in solid (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    await sleep(3000);
    const end = await ev(`__H.pileSample([__A, __B])`);
    check('S1 ram: pair fully separated at end', end.d === 0, `d=${end.d.toFixed ? end.d.toFixed(1) : end.d}`);
  }

  // ---- S2: sealed-cave cram + rig bulldoze (the historical merge class) ----
  if (want('S2')) {
    const site = await ev(`__H.site(60, 16)`);
    const g = site.g, c = site.c;
    const wallFace = await ev(`__H.digCave(${g}, ${c + 3})`);
    await ev(`__H.pinStart(function(){ return ${c + 5} * ${TILE}; }, function(){ return (${g} + 2) * ${TILE}; })`);
    await ev(`(function(){
      window.__pile = [];
      for (var i = 0; i < 6; i++) {
        var b = __jello.build([{ r: ${g + 2} + (i % 2), c: ${c + 3} + (i % 4) }], 'slime');
        if (b) __pile.push(b);
      }
      return __pile.length;
    })()`);
    await sleep(1500);
    await ev(`__H.sampStart(40, function(){ return __H.pileSample(__pile, ${wallFace}); })`);
    // Bulldoze the rig through the chamber into the pile for 6 s (the push
    // tier + rig displace drive the cram exactly like a player squeezing
    // the pile against the far wall).
    await ev(`__H.pinStop()`);
    await ev(`(function(){
      var p = __jello.player();
      p.x = ${(c + 3.4)} * ${TILE}; p.y = (${g} + 2.5) * ${TILE};
      return __H.bulldoze(1.4, 240, 6000, ${(c + 5.6)} * ${TILE});
    })()`);
    await sleep(6500);
    // Release: rig out of the cave, camera pinned above it.
    await ev(`(function(){ var p = __jello.player(); return __H.pinStart(function(){ return ${c + 5} * ${TILE}; }, function(){ return (${g} - 2) * ${TILE}; }); })()`);
    await sleep(6000);
    const s = await ev(`__H.samples()`);
    dump('S2', s);
    const a = sustain(s, 3, true);
    const aAll = sustain(s, 3, false);
    check('S2 cram: no sustained deep non-phasing containment', Number(a.sustain) < 1.0, `worst=${a.worst}px sustain=${a.sustain}s (with-phase ${aAll.sustain}s, phase total ${a.phaseT}s)`);
    check('S2 cram: zero points in solid (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    check('S2 cram: nothing past the sealed wall', maxOf(s, 'cPast') === 0 && maxOf(s, 'past') < 2, `cPast=${maxOf(s, 'cPast')} past=${maxOf(s, 'past').toFixed(1)}px`);
    const end = await ev(`__H.pileSample(__pile)`);
    check('S2 cram: pile separated after release', end.d < 1, `d=${end.d.toFixed(1)}`);
    check('S2 cram: no NaN', maxOf(s, 'nan') === 0);
    note('S2 perf', `update.jello mean ${(s.reduce((t, x) => t + (x.perf || 0), 0) / s.length).toFixed(2)}ms`);
  }

  // ---- S3: multi-tile soft pair press (npt 3-4 bodies, the soft class) ----
  if (want('S3')) {
    const site = await ev(`__H.site(120, 14)`);
    const g = site.g, c = site.c;
    await ev(`__H.pinStart(function(){ return ${c + 5} * ${TILE}; }, function(){ return ${g - 3} * ${TILE}; })`);
    await ev(`(function(){
      window.__M1 = __jello.build([{ r: ${g - 2}, c: ${c + 3} }, { r: ${g - 2}, c: ${c + 4} }, { r: ${g - 1}, c: ${c + 3} }, { r: ${g - 1}, c: ${c + 4} }], 'slime');
      window.__M2 = __jello.build([{ r: ${g - 2}, c: ${c + 6} }, { r: ${g - 2}, c: ${c + 7} }, { r: ${g - 1}, c: ${c + 6} }, { r: ${g - 1}, c: ${c + 7} }], 'slime');
      return !!(__M1 && __M2);
    })()`);
    await sleep(800);
    await ev(`__H.sampStart(40, function(){ return __H.pileSample([__M1, __M2]); })`);
    await ev(`(function(){
      var n = 0;
      window.__mram = setInterval(function () {
        __jello.launchBody(__M1, 700, -60); __jello.launchBody(__M2, -700, -60);
        if (++n >= 10) clearInterval(__mram);
      }, 700);
      return true;
    })()`);
    await sleep(10000);
    const s = await ev(`__H.samples()`);
    dump('S3', s);
    const a = sustain(s, 3, true);
    check('S3 soft pair: no sustained deep containment', Number(a.sustain) < 1.0, `worst=${a.worst}px sustain=${a.sustain}s phase=${a.phaseT}s`);
    check('S3 soft pair: zero points in solid (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    await sleep(3000);
    const end = await ev(`__H.pileSample([__M1, __M2])`);
    check('S3 soft pair: separated at end', end.d === 0, `d=${end.d.toFixed(1)}`);
  }

  // ---- S5: forced co-located build (worst case; unmerge/phasing must fix it) ----
  if (want('S5')) {
    const site = await ev(`__H.site(180, 12)`);
    const g = site.g, c = site.c;
    await ev(`__H.pinStart(function(){ return ${c + 5} * ${TILE}; }, function(){ return ${g - 3} * ${TILE}; })`);
    await ev(`(function(){
      window.__C1 = __jello.build([{ r: ${g - 1}, c: ${c + 5} }], 'slime');
      window.__C2 = __jello.build([{ r: ${g - 1}, c: ${c + 5} }], 'slime');
      return !!(__C1 && __C2);
    })()`);
    await ev(`__H.sampStart(50, function(){ return __H.pileSample([__C1, __C2]); })`);
    await sleep(8000);
    const s = await ev(`__H.samples()`);
    dump('S5', s);
    const end = await ev(`__H.pileSample([__C1, __C2])`);
    check('S5 co-located: machinery separates the pair within 8s', end.d === 0, `end d=${end.d.toFixed(1)} (worst ${sustain(s, 3, false).worst}px)`);
    check('S5 co-located: zero points in solid during recovery (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    check('S5 co-located: no NaN', maxOf(s, 'nan') === 0);
  }

  // ---- S6: thin-wall cave cram (launches + rig pressure at a natural 1-tile wall) ----
  if (want('S6')) {
    const site = await ev(`__H.site(240, 16)`);
    const g = site.g, c = site.c;
    const wallFace = await ev(`__H.digCave(${g}, ${c + 3})`);
    await ev(`__H.pinStart(function(){ return ${c + 5} * ${TILE}; }, function(){ return (${g} + 2) * ${TILE}; })`);
    await ev(`(function(){
      window.__wp = [];
      for (var i = 0; i < 5; i++) {
        var b = __jello.build([{ r: ${g + 2} + (i % 2), c: ${c + 3} + (i % 3) }], 'slime');
        if (b) __wp.push(b);
      }
      return __wp.length;
    })()`);
    await sleep(1200);
    await ev(`__H.sampStart(40, function(){ return __H.pileSample(__wp, ${wallFace}); })`);
    // Launch the whole pile at the wall repeatedly, then bulldoze into it.
    await ev(`(function(){
      var n = 0;
      window.__wram = setInterval(function () {
        for (var i = 0; i < __wp.length; i++) __jello.launchBody(__wp[i], 1100, 0);
        if (++n >= 8) clearInterval(__wram);
      }, 650);
      return true;
    })()`);
    await sleep(6000);
    await ev(`__H.pinStop()`);
    await ev(`(function(){
      var p = __jello.player();
      p.x = ${(c + 3.4)} * ${TILE}; p.y = (${g} + 2.5) * ${TILE};
      return __H.bulldoze(1.5, 260, 5000, ${(c + 5.7)} * ${TILE});
    })()`);
    await sleep(5500);
    const s = await ev(`__H.samples()`);
    dump('S6', s);
    check('S6 wall cram: no centroid past the wall', maxOf(s, 'cPast') === 0, `cPast=${maxOf(s, 'cPast')}`);
    check('S6 wall cram: intrusion under 2px', maxOf(s, 'past') < 2, `past=${maxOf(s, 'past').toFixed(1)}px`);
    check('S6 wall cram: zero points in solid (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    check('S6 wall cram: no NaN', maxOf(s, 'nan') === 0);
  }

  // ================= NPC boot (the game-real pileup) =================
  if (want('S4')) {
  consoleErrors.length = 0;
  await boot('');   // NPC brains ON (ship default)

  // ---- S4: NPC hop pileup in a pit, 30 s of brains churning ----
    const site = await ev(`__H.site(30, 14)`);
    const g = site.g, c = site.c;
    await ev(`__H.digPocket(${g - 2}, ${g - 1}, ${c + 4}, ${c + 8})`);
    await ev(`__H.pinStart(function(){ return ${c + 6} * ${TILE}; }, function(){ return ${g - 3} * ${TILE}; })`);
    await ev(`(function(){
      window.__np = [];
      for (var i = 0; i < 5; i++) {
        var b = __jello.build([{ r: ${g - 2} - (i % 2), c: ${c + 4} + (i % 5) }], 'slime');
        if (b) __np.push(b);
      }
      return __np.length;
    })()`);
    await ev(`__H.sampStart(60, function(){ return __H.pileSample(__np); })`);
    await sleep(30000);
    const s = await ev(`__H.samples()`);
    dump('S4', s);
    const a = sustain(s, 3, true);
    check('S4 NPC pileup: no sustained deep containment', Number(a.sustain) < 1.0, `worst=${a.worst}px sustain=${a.sustain}s phase=${a.phaseT}s`);
    check('S4 NPC pileup: zero points in solid (post-settle)', maxOf(s, 'solid', 0.6) === 0, `max=${maxOf(s, 'solid', 0.6)}`);
    check('S4 NPC pileup: no NaN', maxOf(s, 'nan') === 0);
    const fps = await ev(`__H.fps(3)`, true);
    check('S4 NPC pileup: fps > 30', fps > 30, `${Math.round(fps)} fps`);
  }

  const realErrors = consoleErrors.filter(t => !/favicon|404|Deprecation/.test(t));
  check('console: no page errors across both boots', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  check('harness completed', false, String(e).slice(0, 300));
}

console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed`);
cleanup();
process.exit(failed ? 1 : 0);
