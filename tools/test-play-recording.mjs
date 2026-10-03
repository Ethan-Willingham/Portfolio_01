// Real game, real inputs and native animation callbacks. Owns its test browser.
// Optional HEAD=1 shows the test window; never launches the owner's Chrome.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-record-test-'));
assert(!path.resolve(out).startsWith(root + path.sep)); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-record-browser-'));
const port = Number(process.env.PORT || 8894), debugPort = port + 1000;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const fixture = `var recordTestReadbackAge=null;window.__recordTest={ready:function(){return introPhase==='done'&&(!startInPause||bootPauseFired)},
 ageProbe:function(on){if(on){recordTestReadbackAge=liquidWGPU.getReadbackAge;liquidWGPU.getReadbackAge=function(){return 0.25;};}else{liquidWGPU.getReadbackAge=recordTestReadbackAge;}},
 counter:function(){return saveCounter},seedSave:function(){saveNow('test');saveCounter+=17},state:function(){return {paused:gamePaused,manifest:cargoManifestOpen,ledger:ledgerOpen}},limit:function(n){playPerfLimit=n},
 expire:function(){playPerfTrace.started-=600001;playPerfHeartbeat()},
 summary:function(){return {seconds:playPerfTrace.seconds,events:playPerfTrace.events,
 gpu:playPerfTrace.gpu,frames:playPerfTrace.frameCount,reason:playPerfTrace.reason}}};`;
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    let data = fs.readFileSync(file);
    if (url.pathname === '/js/sluice.js') {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = Buffer.from(source.slice(0, end) + fixture + source.slice(end));
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
const delay = ms => new Promise(r => setTimeout(r, ms));
let chrome, ws, seq = 0; const pending = new Map(), errors = [];
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('Timeout ' + method)); }, 30000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
}
async function until(expression, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await ev(expression)) return; await delay(100); }
  console.log('Failure state ' + JSON.stringify(await ev('(()=>{const s=window.__sluicePerformance?.status();return {live:s&&{frames:s.frames,fps:s.fps,recording:s.recording,reason:s.reason},state:window.__recordTest?.state()}})()')));
  console.log('Errors ' + JSON.stringify(errors));
  throw Error('Condition timed out: ' + expression);
}
async function key(key, code, down = true) {
  await call('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key, code });
}
async function tap(value, code) { await key(value, code); await delay(60); await key(value, code, false); }
try {
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const args = [...(process.env.HEAD === '1' ? ['--window-size=1440,900'] : ['--headless=new']),
    '--mute-audio', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + debugPort, 'about:blank'];
  chrome = spawn('/Users/ethan/.local/bin/agent-chrome-for-testing', args, { stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find(t => t.type === 'page'); } catch {}
    if (target) break; await delay(100);
  }
  assert(target, 'Owned test browser boot');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args);
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*'] });
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:' + port + '/grand-motherload.html?snow=1' });
  await until('window.__recordTest && __recordTest.ready()');
  if (await ev('document.getElementById("game-pause").classList.contains("is-visible")')) await tap('Escape', 'Escape');
  await until('!__recordTest.state().paused');
  await delay(3000);
  assert.equal(await ev('document.getElementById("gm-perf-recorder").hidden'), true, 'Ordinary game hides recorder');
  await ev('__recordTest.seedSave()');
  const counter = await ev('__recordTest.counter()');
  await ev('__recordTest.ageProbe(true)');
  await tap('F9', 'F9');
  assert.equal(await ev('__sluicePerformance.status().recording'), true);
  assert.equal(await ev('__sluicePerformance.status().state.readbackAgeMs'), 250, 'Snapshot converts simulation seconds to milliseconds');
  await delay(100);
  await ev('__recordTest.ageProbe(false)');
  assert.equal(await ev('__recordTest.counter()'), counter, 'Recording must neither advance nor rewind the save counter');
  await key('D', 'KeyD'); await key(' ', 'Space'); await delay(500);
  await key('D', 'KeyD', false); await key(' ', 'Space', false);
  await tap('i', 'KeyI'); await until('__recordTest.state().manifest'); await delay(650); await tap('Escape', 'Escape');
  await tap('c', 'KeyC'); await until('__recordTest.state().ledger'); await delay(650); await tap('Escape', 'Escape');
  await ev('(()=>{const t=performance.now();while(performance.now()-t<220){}return true})()');
  await tap('Escape', 'Escape'); await until('__recordTest.state().paused'); await delay(250); await tap('Escape', 'Escape');
  await until('!__recordTest.state().paused');
  await until('__recordTest.summary().frames >= 1100', 90000);
  const screen = await call('Page.captureScreenshot'); fs.writeFileSync(path.join(out, 'recording.png'), Buffer.from(screen.data, 'base64'));
  await tap('F9', 'F9');
  const deadline = Date.now() + 10000; let filename;
  while (Date.now() < deadline) { filename = fs.readdirSync(out).find(p => p.endsWith('.json') && p.startsWith('sluice-performance-')); if (filename) break; await delay(100); }
  assert(filename, 'F9 saves local trace');
  const trace = JSON.parse(fs.readFileSync(path.join(out, filename), 'utf8'));
  assert(trace.initialSavedGame && trace.initialSavedGame.world, 'Existing saved context included');
  const frames = trace.frameChunks.flat(); assert.equal(frames.length, trace.frameCount * trace.stride);
  assert(trace.frameCount >= 1100 && trace.frameChunks.length >= 2, 'Retains every frame across chunk boundary');
  const col = name => trace.columns.indexOf(name), values = name => Array.from({ length: trace.frameCount }, (_, i) => frames[i * trace.stride + col(name)]);
  assert(values('readbackAgeMs').includes(250), 'Packed native frames convert simulation seconds to milliseconds');
  assert(Math.max(...values('intervalMs')) >= 180, 'Keeps induced hitch');
  assert(values('view').includes(1) && values('view').includes(2), 'Records manifest and ledger frames');
  assert(values('inputMask').some(v => v & 8), 'Shifted D input captured');
  assert(trace.events.some(e => e.kind === 'pause') && trace.events.some(e => e.kind === 'resume'));
  assert(trace.events.some(e => e.kind === 'keydown' && e.detail.code === 'KeyD'));
  assert(col('cpu.jello.contact') >= 0 && values('cpu.jello.internal').some(v => v > 0), 'Ordinary play gets detailed slime timings');
  assert(trace.seconds.some(s => s.state.particleTypes['5'] > 0), 'Snow state retained');
  assert(trace.gpuStatus.supported && trace.gpu.length, 'Actual GPU timestamps');
  assert(trace.gpu.every(g => g.ms >= 0 && g.ms < 1000 && g.passes.length && g.submittedAt >= g.at));
  assert.equal(trace.droppedEvents, 0); assert.equal(trace.droppedBuckets, 0); assert.equal(trace.droppedGPU, 0);
  await until('__sluiceGPUTrace.status().pending===0');
  await ev('__recordTest.limit(8)'); await tap('F9', 'F9');
  await until('__recordTest.summary().reason === "Frame limit"');
  assert.equal(await ev('__recordTest.summary().frames'), 8, 'Bound stops cleanly');
  await ev('__recordTest.limit(72000)'); await tap('F9', 'F9');
  await ev('__recordTest.expire()');
  assert.equal(await ev('__recordTest.summary().reason'), 'Ten-minute limit', 'Time limit stops without recursion');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const report = { pass: true, file: filename, frames: trace.frameCount, seconds: trace.durationMs / 1000,
    maxIntervalMs: Math.max(...values('intervalMs')), gpuSamples: trace.gpu.length,
    recorderMeanMs: values('recorderMs').reduce((a, b) => a + b, 0) / trace.frameCount,
    recorderMaxMs: Math.max(...values('recorderMs')), errors };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); console.log('Artifacts: ' + out);
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: String(error), errors }, null, 2)); throw error;
} finally {
  if (ws) { try { await call('Browser.close'); } catch {} ws.close(); }
  if (chrome && chrome.exitCode === null) await new Promise(r => { chrome.once('exit', r); setTimeout(r, 2000); });
  if (chrome && chrome.exitCode === null) chrome.kill();
  server.close(); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
