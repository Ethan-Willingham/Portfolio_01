// Deterministic rig landing diagnostics against the real surface-resident solver.
// Run: node tools/test-slime-landings.mjs
// Optional: BUNDLE=/tmp/baseline.js DUMP=/tmp/landing-baseline PORT=8198
// EXTENDED=1 adds contact, real fall, and frame timing cases; EXTENDED=only skips the matrix.
// PLAYBACK=1 also checks the real RAF game/render loop against a living resident.
// CASES=stack,ceiling selects extended cases when narrowing a failure.
// Owns one Chrome for Testing process and closes that exact child in finally.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8198), debug = port + 1000;
const out = process.env.DUMP || '/tmp/sluice-landing-qa';
const bundle = process.env.BUNDLE ? path.resolve(process.env.BUNDLE) : path.join(root, 'js/sluice.js');
const profile = fs.mkdtempSync('/tmp/sluice-landing-browser-');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file === path.join(root, 'js/sluice.js') ? bundle : file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), close = src.lastIndexOf('})();');
      assert.ok(close > 0, 'game IIFE has an injection point');
      data = Buffer.from(src.slice(0, close) + `
        var landingResolve = jelloResolvePlayer;
        jelloResolvePlayer = function(dt) {
          var y = player.y, vy = player.vy;
          landingResolve(dt);
          player._landingLegacyY = player.y - y;
          player._landingLegacyV = player.vy - vy;
        };
        window.__landingTest = function(source) { return eval(source); };\n` + src.slice(close));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
let chrome, ws, seq = 0;
const pending = new Map(), errors = [];
function cleanup() {
  try { ws?.close(); } catch {}
  chrome?.kill(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__landingTest(${JSON.stringify(source)})`);

// Keep the test in the game's lexical scope: these are actual movement,
// terrain, material, and collision functions, not a duplicate physics model.
function scenarioSource(config) {
  return `(function(config) {
    cancelAnimationFrame(gameRafId); gameRafId = 0;
    resetJello(); skySlimes.length = 0; skySlimeNext = 100000;
    surfaceSlimesSeeded = true; gamePaused = false; gameOver = false; gameWon = false;
    bathMode = false; shopState = 'closed'; drilling = null; devMode = false;
    Object.keys(keys).forEach(function(key) { keys[key] = false; });
    Object.keys(player).forEach(function(key) {
      if (key.indexOf('jello') === 0 || key.indexOf('_j') === 0 || key.indexOf('_surfaceRig') === 0) delete player[key];
    });
    var col = DECK_CENTER_COL - 4, groundRow = SKY_ROWS + (config.kind === 'ceiling' ? 6 : 0);
    var x = (col + 0.5) * TILE, floor = groundRow * TILE;
    for (var r = Math.max(0, SKY_ROWS - 16); r <= groundRow + 4; r++) {
      for (var c = col - 12; c <= col + 12; c++) {
        world[r][c] = r >= groundRow ? { type: 'stone', hp: 100 } : null;
        invalidateTerrainAround(r, c);
      }
    }
    if (config.kind === 'wall') {
      x -= 12;
      for (var wr = Math.max(0, groundRow - 4); wr < groundRow; wr++) {
        world[wr][col + 1] = { type: 'stone', hp: 100 };
        invalidateTerrainAround(wr, col + 1);
      }
    }
    for (var lp = liquidCount - 1; lp >= 0; lp--) removeLiquidParticle(lp);
    player.x = x - 200; player.y = floor - PLAYER_H; player.vx = player.vy = 0;
    player.onGround = false; player.onJello = false; player.onCeiling = false;
    player.thrusting = false; player.thrustSpool = 0; player.drillGlideT = 0;
    player.hull = getMaxHull(); player.fuel = getMaxFuel();
    cam.x = x - screenW * 0.5; cam.y = floor - screenH * 0.65;
    var b = surfaceSlimeBuild(x, floor - 35, { id: 9000, seed: 0.4, hue: 133 });
    if (config.kind !== 'living') { surfaceSlimeDetach(b, 100000); b.surfaceSlime.timer = 100000; }
    for (var settle = 0; settle < 180; settle++) {
      surfaceSlimeTick(1 / 60); updateJello(1 / 60);
    }
    var bodies = [b];
    if (config.kind === 'stack') {
      var upper = surfaceSlimeBuild(b.cx, b.bboxT - 26, { id: 9001, seed: 0.4, hue: 190 });
      surfaceSlimeDetach(upper, 100000); upper.surfaceSlime.timer = 100000;
      bodies.push(upper); b = upper;
      for (var stackSettle = 0; stackSettle < 30; stackSettle++) {
        surfaceSlimeTick(1 / 60); updateJello(1 / 60);
      }
    }
    if (config.kind === 'airborne') {
      for (var ap = 0; ap < b.n; ap++) { b.py[ap] -= 180; b.oy[ap] -= 180; }
      jelloUpdateBody(b, jelloStepH || JELLO_H);
    }
    function bodyMetrics(b) {
      var left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      var finite = true, terrain = 0, area = 0, minDet = Infinity, folds = 0, terrainPenetration = 0;
      var hasCells = !!(b.cellN && b.cellA && b.cellB && b.cellC && b.cellInv);
      var cellMinDet = hasCells ? Infinity : null, cellFolds = hasCells ? 0 : null;
      for (var p = 0; p < b.n; p++) {
        finite = finite && isFinite(b.px[p]) && isFinite(b.py[p]) && isFinite(b.ox[p]) && isFinite(b.oy[p]);
        left = Math.min(left, b.px[p]); right = Math.max(right, b.px[p]);
        top = Math.min(top, b.py[p]); bottom = Math.max(bottom, b.py[p]);
        if (jelloWorldSolidAt(b.px[p], b.py[p])) {
          terrain++;
          var tileX = Math.floor(b.px[p] / TILE) * TILE, tileY = Math.floor(b.py[p] / TILE) * TILE;
          terrainPenetration = Math.max(terrainPenetration, Math.min(b.px[p] - tileX, tileX + TILE - b.px[p], b.py[p] - tileY, tileY + TILE - b.py[p]));
        }
      }
      for (var k = 0; k < b.ringN; k++) {
        var a = b.ring[k], z = b.ring[(k + 1) % b.ringN];
        area += b.px[a] * b.py[z] - b.px[z] * b.py[a];
      }
      for (var t = 0; t < b.triN; t++) {
        var a = b.triA[t], c = b.triB[t], d = b.triC[t], inv = t * 4;
        var det = ((b.px[c] - b.px[a]) * (b.py[d] - b.py[a]) -
          (b.py[c] - b.py[a]) * (b.px[d] - b.px[a])) *
          (b.triDmInv[inv] * b.triDmInv[inv + 3] - b.triDmInv[inv + 1] * b.triDmInv[inv + 2]);
        minDet = Math.min(minDet, det); if (det <= 0) folds++;
      }
      if (hasCells) {
        for (var ct = 0; ct < b.cellN; ct++) {
          var ca = b.cellA[ct], cb = b.cellB[ct], cc = b.cellC[ct], ci = ct * 4;
          var cellDet = ((b.px[cb] - b.px[ca]) * (b.py[cc] - b.py[ca]) -
            (b.py[cb] - b.py[ca]) * (b.px[cc] - b.px[ca])) *
            (b.cellInv[ci] * b.cellInv[ci + 3] - b.cellInv[ci + 1] * b.cellInv[ci + 2]);
          cellMinDet = Math.min(cellMinDet, cellDet); if (cellDet <= 0) cellFolds++;
          finite = finite && isFinite(cellDet);
        }
      }
      return { width: right - left, height: bottom - top, top: top, bottom: bottom,
        areaRatio: Math.abs(area) * 0.5 / b.restArea, minDet: minDet, folds: folds,
        cellMinDet: cellMinDet, cellFolds: cellFolds,
        terrain: terrain, terrainPenetration: terrainPenetration, penetration: Math.max(0, bottom - floor), finite: finite,
        cx: b.cx, cy: b.cy, bodyVX: b.vx * JELLO_TIMESCALE, bodyVY: b.vy * JELLO_TIMESCALE };
    }
    function rigTerrainMetrics() {
      var count = 0, penetration = 0;
      var x0 = player.x, y0 = player.y, x1 = x0 + PLAYER_W - 1, y1 = y0 + PLAYER_H - 1;
      for (var row = Math.floor(y0 / TILE); row <= Math.floor(y1 / TILE); row++) {
        for (var column = Math.floor(x0 / TILE); column <= Math.floor(x1 / TILE); column++) {
          if (tileAt(row, column) === null) continue;
          count++;
          penetration = Math.max(penetration, Math.min(x1 - column * TILE, (column + 1) * TILE - x0,
            y1 - row * TILE, (row + 1) * TILE - y0));
        }
      }
      return { count: count, penetration: Math.max(0, penetration) };
    }
    var initial = bodyMetrics(b), dt = 1 / config.fps;
    player.x = b.cx - PLAYER_W * 0.5 + config.offset;
    player.y = initial.top - PLAYER_H - (config.kind === 'drop' || config.kind === 'living' ? 180 : 4);
    player.vx = 0; player.vy = config.speed;
    player.onGround = false; player.onJello = false;
    player.renderX = player.x; player.renderY = player.y;
    if (config.kind === 'ceiling') {
      var roofRow = Math.floor(player.y / TILE) - 1;
      for (var roofCol = col - 2; roofCol <= col + 2; roofCol++) {
        world[roofRow][roofCol] = { type: 'stone', hp: 100 };
        invalidateTerrainAround(roofRow, roofCol);
      }
    }
    var film = document.createElement('canvas'); film.width = 1000; film.height = 480;
    var filmCtx = film.getContext('2d'), shots = [0, 3, 6, 10, 18, 30, 60, 180], shotIndex = 0;
    var hull = player.hull, frames = [], contacts = 0, releases = 0, wasContact = false;
    var minHeight = initial.height, maxWidth = initial.width, maxPenetration = 0, terrainHits = 0;
    var minDet = initial.minDet, maxFolds = 0, maxDeltaY = 0, maxCorrection = 0, maxUpward = 0;
    var firstContact = null, finite = true, elapsed = 0, simMs = 0, maxStepMs = 0;
    var rigTerrainFrames = 0, ceilingFrames = 0, maxRigPenetration = 0, maxMeshPenetration = 0, minAreaRatio = Infinity, maxAreaRatio = 0;
    var cellAvailable = true, minCellDet = Infinity, maxCellFolds = 0, earlyHullLost = 0, contactHullLost = 0;
    var actionStarted = null, actionReleased = null, repeatCount = 0, maxAway = 0, maxRise = 0, startY = player.y;
    var jitter = [1 / 144, 1 / 30, 1 / 90, 1 / 60, 0.043, 1 / 120];
    if (config.kind === 'raf-jitter') jitter = [1 / 59.8, 1 / 60.2, 1 / 60.1, 1 / 59.9, 1 / 60];
    for (var n = 0; elapsed < config.seconds - 1e-9; n++) {
      dt = Math.min(config.kind === 'irregular' || config.kind === 'raf-jitter' ? jitter[n % jitter.length] : 1 / config.fps, config.seconds - elapsed);
      keys.ArrowRight = config.kind === 'walkoff' && elapsed >= 1 && elapsed < 2.3;
      keys.ArrowUp = config.kind === 'takeoff' && elapsed >= 1 && elapsed < 2;
      if ((keys.ArrowRight || keys.ArrowUp) && actionStarted === null) actionStarted = elapsed;
      if (actionStarted !== null && !player.onJello && actionReleased === null) actionReleased = elapsed;
      if (config.kind === 'repeat' && repeatCount < 2 && elapsed >= (repeatCount + 1) * 1.6) {
        var again = bodyMetrics(b);
        player.x = b.cx - PLAYER_W * 0.5; player.y = again.top - PLAYER_H - 4;
        player.vx = 0; player.vy = config.speed; player.onJello = player.onGround = false;
        player._surfaceRigSupported = false; repeatCount++;
      }
      var oldY = player.y, oldRenderY = player.renderY, oldHull = player.hull;
      player._landingLegacyY = player._landingLegacyV = 0;
      var stepStart = performance.now();
      update(dt); surfaceSlimeTick(dt); updateJello(dt);
      var stepMs = performance.now() - stepStart; simMs += stepMs; maxStepMs = Math.max(maxStepMs, stepMs);
      elapsed += dt;
      if (!config.kind && config.fps === 60 && config.speed === 420 && config.offset === 0 && shots.indexOf(n) >= 0) {
        var oldCtx = ctx, tileX = (shotIndex % 4) * 250, tileY = Math.floor(shotIndex / 4) * 240;
        ctx = filmCtx; ctx.save(); ctx.beginPath(); ctx.rect(tileX, tileY, 250, 240); ctx.clip();
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg');
        ctx.fillRect(tileX, tileY, 250, 240); ctx.translate(tileX + 125, tileY + 220); ctx.scale(2, 2); ctx.translate(-x, -floor);
        ctx.fillStyle = '#758270'; ctx.fillRect(x - 63, floor, 126, 10);
        surfaceSlimeDraw(b); drawPlayer(); ctx.restore();
        ctx.fillStyle = '#ddd5c5'; ctx.font = '12px monospace'; ctx.fillText((n * dt).toFixed(2) + ' s', tileX + 10, tileY + 18);
        ctx = oldCtx; shotIndex++;
      }
      var info = bodyMetrics(b), contact = !!player.onJello, dy = player.y - oldY;
      var allBodies = bodies.map(bodyMetrics), rigTerrain = rigTerrainMetrics(), allFolds = 0, allCellFolds = 0;
      for (var metric = 0; metric < allBodies.length; metric++) {
        var bm = allBodies[metric];
        finite = finite && bm.finite;
        terrainHits += bm.terrain; allFolds += bm.folds;
        if (bm.cellFolds === null) { cellAvailable = false; allCellFolds = null; }
        else {
          minCellDet = Math.min(minCellDet, bm.cellMinDet);
          if (allCellFolds !== null) allCellFolds += bm.cellFolds;
        }
        minDet = Math.min(minDet, bm.minDet);
        maxMeshPenetration = Math.max(maxMeshPenetration, bm.terrainPenetration);
        minAreaRatio = Math.min(minAreaRatio, bm.areaRatio); maxAreaRatio = Math.max(maxAreaRatio, bm.areaRatio);
      }
      finite = finite && isFinite(player.x) && isFinite(player.y) && isFinite(player.vy);
      if (contact && !wasContact) { contacts++; if (firstContact === null) firstContact = elapsed - dt; }
      if (!contact && wasContact) releases++;
      wasContact = contact;
      minHeight = Math.min(minHeight, info.height); maxWidth = Math.max(maxWidth, info.width);
      maxFolds = Math.max(maxFolds, allFolds);
      if (allCellFolds !== null) maxCellFolds = Math.max(maxCellFolds, allCellFolds);
      if (elapsed <= 0.2 + 1e-9) earlyHullLost = Math.max(earlyHullLost, hull - player.hull);
      if (contact) contactHullLost += Math.max(0, oldHull - player.hull);
      maxPenetration = Math.max(maxPenetration, info.penetration);
      if (rigTerrain.count) rigTerrainFrames++;
      if (player.onCeiling) ceilingFrames++;
      maxRigPenetration = Math.max(maxRigPenetration, rigTerrain.penetration);
      maxDeltaY = Math.max(maxDeltaY, Math.abs(dy));
      maxCorrection = Math.max(maxCorrection, Math.abs(dy - player.vy * dt));
      maxUpward = Math.max(maxUpward, -player.vy);
      maxAway = Math.max(maxAway, Math.abs(player.x + PLAYER_W * 0.5 - b.cx));
      maxRise = Math.max(maxRise, startY - player.y);
      frames.push(Object.assign({ frame: n, t: elapsed, dt: dt, stepMs: stepMs, x: player.x, y: player.y,
        renderY: player.renderY, renderDY: player.renderY - oldRenderY, legacyY: player._landingLegacyY,
        legacyV: player._landingLegacyV, owned: !!surfaceRigFrame,
        vx: player.vx, vy: player.vy, onJello: contact, onGround: !!player.onGround, onCeiling: !!player.onCeiling,
        hull: player.hull, dy: dy, rigTerrain: rigTerrain.count, rigPenetration: rigTerrain.penetration,
        allFolds: allFolds, allCellFolds: allCellFolds, bodies: allBodies }, info));
    }
    keys.ArrowRight = keys.ArrowUp = false;
    var tail = frames.filter(function(f) { return f.t > config.seconds - 0.5; });
    return { config: config, initial: initial, summary: { finite: finite, firstContact: firstContact,
      contacts: contacts, releases: releases, minHeight: minHeight, maxWidth: maxWidth,
      heightRatio: minHeight / initial.height, widthRatio: maxWidth / initial.width,
      minDet: minDet, maxFolds: maxFolds, terrainHits: terrainHits, maxPenetration: maxPenetration,
      cellAvailable: cellAvailable, minCellDet: cellAvailable ? minCellDet : null, maxCellFolds: cellAvailable ? maxCellFolds : null,
      rigTerrainFrames: rigTerrainFrames, ceilingFrames: ceilingFrames, maxRigPenetration: maxRigPenetration, maxMeshPenetration: maxMeshPenetration,
      minAreaRatio: minAreaRatio, maxAreaRatio: maxAreaRatio, bodies: bodies.length,
      maxDeltaY: maxDeltaY, maxCorrection: maxCorrection, maxUpward: maxUpward,
      hullLost: hull - player.hull, earlyHullLost: earlyHullLost, contactHullLost: contactHullLost, finalOnJello: !!player.onJello,
      actionStarted: actionStarted, actionReleased: actionReleased, repeatCount: repeatCount, maxAway: maxAway, maxRise: maxRise,
      simMs: simMs, meanStepMs: simMs / frames.length, maxStepMs: maxStepMs,
      checks: { noFolds: maxFolds === 0, rigClear: rigTerrainFrames === 0, meshClear: terrainHits === 0,
        noCellFolds: cellAvailable ? maxCellFolds === 0 : null,
        contactHullSafe: contactHullLost === 0, initialHullSafe: earlyHullLost === 0 },
      tailMaxRigSpeed: Math.max.apply(null, tail.map(function(f) { return Math.abs(f.vy); })),
      tailRangeY: Math.max.apply(null, tail.map(function(f) { return f.y; })) - Math.min.apply(null, tail.map(function(f) { return f.y; })) }, frames: frames, film: shotIndex ? film.toDataURL('image/png') : null };
  })(${JSON.stringify(config)})`;
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(100);
  }
  assert.ok(endpoint, 'Chrome for Testing started');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p?.reject(message.error) : p?.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await evaluate(`typeof __landingTest === 'function' && __landingTest("introPhase === 'done'")`)) break;
    await sleep(100);
  }
  assert.equal(await game("introPhase === 'done' && ENABLE_JELLO"), true, 'game boots with slimes enabled: ' + JSON.stringify(errors));
  await game('cancelAnimationFrame(gameRafId); gameRafId = 0;');
  const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
  const speeds = (process.env.SPEEDS || '180,420,700').split(',').map(Number);
  const configs = process.env.EXTENDED === 'only' ? [] : rates.flatMap(fps => speeds.map(speed => ({ fps, speed, offset: 0, seconds: speed === 700 ? 8 : 5 })));
  if (process.env.EXTENDED !== 'only') configs.push({ fps: 60, speed: 420, offset: 19, seconds: 5 });
  if (process.env.EXTENDED) {
    const kinds = ['stack', 'wall', 'ceiling', 'airborne', 'walkoff', 'takeoff', 'repeat', 'irregular', 'drop', 'living', 'raf-jitter'];
    const selected = process.env.CASES ? process.env.CASES.split(',') : kinds;
    assert.ok(selected.every(kind => kinds.includes(kind)), 'known extended landing case');
    for (const kind of selected) {
      configs.push({ kind, fps: 60, speed: kind === 'drop' || kind === 'living' ? 0 : kind === 'airborne' ? 180 : kind === 'ceiling' ? 700 : 420, offset: 0, seconds: kind === 'repeat' ? 6 : 4 });
    }
  }
  const summaries = [], reports = [];
  for (const config of configs) {
    const report = await game(scenarioSource(config));
    const name = config.kind ? `landing-${config.kind}` : `landing-${config.fps}hz-${config.speed}-${config.offset ? 'edge' : 'center'}`;
    if (report.film) fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(report.film.split(',')[1], 'base64'));
    delete report.film;
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(report, null, 2));
    summaries.push({ name, ...report.summary }); reports.push(report);
    console.log(name, JSON.stringify(report.summary));
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ bundle, summaries, errors }, null, 2));
  assert.ok(reports.every(r => r.summary.finite), 'all rig and mesh states remain finite');
  assert.ok(reports.every(r => r.summary.terrainHits === 0), 'no gel points end a frame inside terrain');
  assert.ok(reports.every(r => r.summary.rigTerrainFrames === 0), 'the rig never ends a frame inside terrain');
  assert.ok(reports.every(r => r.summary.maxFolds === 0), 'no health triangles fold during landing scenarios');
  assert.ok(reports.every(r => r.summary.cellAvailable && r.summary.maxCellFolds === 0), 'material volume cells are present and never fold');
  assert.ok(reports.every(r => r.summary.contactHullLost === 0), 'gel contact never inflicts hull damage');
  assert.ok(reports.filter(r => r.config.kind === 'ceiling').every(r => r.summary.ceilingFrames > 0), 'the rebound actually reaches the low ceiling');
  assert.ok(reports.every(r => r.summary.contacts > 0), 'every scenario exercises a rig landing');
  assert.ok(reports.filter(r => !r.config.kind && r.config.offset === 0).every(r => r.summary.earlyHullLost === 0), 'centered initial landings are damage-free');
  for (const report of reports.filter(r => ['drop', 'living', 'raf-jitter'].includes(r.config.kind))) {
    assert.ok(report.frames.every(f => Math.abs(f.renderY - f.y) < 0.1), 'fall and rebound share one visible motion timeline');
    assert.ok(report.frames.every(f => Math.abs(f.legacyY) < 0.01 && Math.abs(f.legacyV) < 0.1), 'legacy hard containment never interrupts the landing');
  }
  const steady = reports.find(r => !r.config.kind && r.config.fps === 60 && r.config.speed === 420 && !r.config.offset);
  const jittered = reports.find(r => r.config.kind === 'raf-jitter');
  if (steady && jittered) {
    assert.ok(Math.abs(steady.summary.maxUpward - jittered.summary.maxUpward) < 8, 'small RAF timing jitter does not change rebound strength');
    assert.ok(Math.abs(steady.summary.minHeight - jittered.summary.minHeight) < 1, 'small RAF timing jitter does not change compression');
  }
  if (process.env.PLAYBACK) {
    await game(scenarioSource({ kind: 'living', fps: 60, speed: 0, offset: 0, seconds: 0 }));
    const playback = await game(`(function() {
      return new Promise(function(resolve) {
        var originalRender = render, records = [], started = performance.now();
        render = function() {
          originalRender();
          var b = jelloBodies[0], skin = surfaceSlimeRenderBody(b);
          records.push({ t: (performance.now() - started) / 1000, dt: lastFrameDt,
            y: player.y, renderY: player.renderY, vy: player.vy, onJello: player.onJello,
            cameraY: cam.y, top: skin.bboxT, width: skin.bboxR - skin.bboxL,
            legacyY: player._landingLegacyY, legacyV: player._landingLegacyV });
          if (performance.now() - started > 4500) {
            render = originalRender; gamePaused = true;
            resolve({ records: records, image: canvas.toDataURL('image/png') });
          }
        };
        lastTime = performance.now(); gameRafId = requestAnimationFrame(loop);
      });
    })()`);
    fs.writeFileSync(path.join(out, 'real-playback.png'), Buffer.from(playback.image.split(',')[1], 'base64'));
    delete playback.image;
    fs.writeFileSync(path.join(out, 'real-playback.json'), JSON.stringify(playback, null, 2));
    assert.ok(playback.records.length > 60 && playback.records.some(f => f.onJello), 'real game loop completes a landing and rebound');
    assert.ok(playback.records.every(f => Math.abs(f.renderY - f.y) < 0.1), 'real renderer stays aligned through contact');
    console.log('PASS real RAF playback: ' + playback.records.length + ' rendered frames');
  }
  assert.equal(errors.length, 0, 'no browser exceptions');
  console.log(`PASS landing diagnostics; full trajectories: ${out}`);
} finally { cleanup(); }
