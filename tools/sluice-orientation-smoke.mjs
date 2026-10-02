// Real browser rotations: mobile freezes in portrait, desktop stays responsive.
// Run: node tools/sluice-orientation-smoke.mjs. Owns its testing browser.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8321), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-orientation-');
const out = process.env.DUMP || '/tmp/sluice-orientation-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let ws, chrome, seq = 0;
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), end = src.lastIndexOf('})();');
      assert(end >= 0, 'bundle IIFE seam exists');
      data = Buffer.from(src.slice(0, end) + 'window.__orientationTest = function(source) { return eval(source); };\n' + src.slice(end));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
function cleanup() {
  try { ws?.close(); } catch {}
  chrome?.kill(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const game = source => ev(`__orientationTest(${JSON.stringify(source)})`);
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }
async function waitFor(expression, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await ev(expression)) return;
    await sleep(100);
  }
  throw new Error('Timed out: ' + label + ' ' + JSON.stringify(await ev('window.__bootErr || window.SluiceLoading?.report()')));
}
async function metrics(width, height, mobile = true) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile });
  await waitFor(`innerWidth===${width} && innerHeight===${height}`, 'viewport resize');
  await sleep(150);
}
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
const snapshot = () => game('({time:timeOfDay,x:player.x,y:player.y,fuel:player.fuel,stock:bathLiquidCount(0),water:bathWater,chunks:hearthBeds.boiler.chunks.map(b=>[b.x,b.y,b.mass,b.temp])})');
async function frozen(label) {
  await sleep(200); // Drain work already submitted by the final landscape frame.
  const before = await snapshot();
  await sleep(1000);
  assert.deepEqual(await snapshot(), before, label);
  check(label, await game('gameRafId===0 && mobileLandscapeBlocked && SluiceAudio.sfxStatus().paused'));
}
async function touchAt(x, y, id = 1) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
}
async function pressBath(action) {
  const p = await game(`(function(){var b=hearthButtons.find(b=>b.action===${JSON.stringify(action)}),r=canvas.getBoundingClientRect();if(!b)throw Error('missing button');return{x:r.left+b.x+b.w/2,y:r.top+b.y+b.h/2};})()`);
  await touchAt(p.x, p.y, 4);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
}

try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(100);
  }
  assert(endpoint, 'testing browser started');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1` });
  await waitFor(`typeof __orientationTest==='function' && __orientationTest("introPhase==='done'")`, 'portrait boot', 90000);
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  check('portrait cold boot finishes GPU warm-up behind the rotate screen', await game('isMobile && mobileLandscapeBlocked && liquidWGPU.available && hearthFireGPU.available && !gamePaused') && await ev("!document.getElementById('gm-rotate-screen').hidden && document.getElementById('game-canvas').inert && window.__shaderWarm.errors.length===0"));
  await frozen('portrait boot freezes clock, physics, supplies and sound');
  await screenshot('portrait-rotate-screen');

  await metrics(844, 390);
  const noon = await game('timeOfDay');
  await sleep(700);
  check('rotation to landscape starts normal play', await game('!mobileLandscapeBlocked && gameRafId!==0 && timeOfDay>'+noon+' && !SluiceAudio.sfxStatus().paused') && await ev("document.getElementById('gm-rotate-screen').hidden && !document.getElementById('game-canvas').inert"));
  const dpadPoint = await game('(function(){var r=canvas.getBoundingClientRect();return{x:r.left+DPAD_CX,y:r.top+DPAD_CY-DPAD_SIZE*.25};})()');
  await touchAt(dpadPoint.x, dpadPoint.y);
  await sleep(150);
  check('landscape touch can hold thrust', await game('touch.active && dpad.up'));
  await metrics(390, 844);
  check('portrait cancels the held dpad and thrust', await game('!touch.active && !dpad.up && !dpad.left && !dpad.right && !dpad.down && !player.thrusting && dpadTouchId===null'));
  await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp'}));document.getElementById('game-canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerId:88,bubbles:true,cancelable:true,clientX:200,clientY:200}));");
  check('portrait rejects delayed keyboard and canvas input', await game('!keys.ArrowUp && !touch.active && !bathTool.pointer'));
  await frozen('rotation freezes the running mine');
  await metrics(844, 340);
  check('landscape resume starts with controls released', await game('!mobileLandscapeBlocked && !dpad.up && !touch.active'));

  // The no-focus harness lever keeps boot reliable. Enable the real manual
  // pause handlers before clicking their actual native buttons.
  await game('PAUSE_DISABLED=false');
  await ev("document.getElementById('gm-pause-btn').click()");
  check('manual pause stops the loop', await game('gamePaused && gameRafId===0'));
  await metrics(390, 844);
  await metrics(844, 390);
  check('rotation preserves a manual pause and its menu', await game('gamePaused && gameRafId===0 && SluiceAudio.sfxStatus().paused') && await ev("document.getElementById('game-pause').classList.contains('is-visible')"));
  await ev("document.getElementById('gm-resume-btn').click()");
  await sleep(250);
  check('Resume restores the manually paused game in landscape', await game('!gamePaused && gameRafId!==0'));

  await game('bathEnter()'); await sleep(1000);
  await game('bathGuests=[];skySlimes=[];skySlimeNext=1e9;siphon.tank[0]=16000;');
  await pressBath('tool-valve');
  check('landscape bath can pour', await game('bathTool.mode===\'hose\' && bathTool.valve'));
  await metrics(390, 844);
  check('rotation closes the bath valve and releases tools', await game('!bathTool.valve && !bathTool.pointer && !bathTool.held && !bathTool.spraying && !hearthDrag && !bathPtrDown'));
  await frozen('portrait freezes the bath and its finite water');
  await metrics(844, 390);
  await sleep(250);
  check('bath resumes with side-by-side basin and furnace and no open valve', await game('!mobileLandscapeBlocked && hearthRoomLayout().landscape && !bathTool.valve && gameRafId!==0'));
  await screenshot('landscape-bath');

  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', platform: 'MacIntel' });
  await metrics(768, 1024);
  await send('Page.reload');
  await waitFor(`typeof __orientationTest==='function' && __orientationTest("introPhase==='done'")`, 'iPad boot', 90000);
  check('iPadOS desktop-style user agent still requires landscape', await game('isMobile && mobileLandscapeBlocked') && await ev('navigator.maxTouchPoints>1'));
  await metrics(1024, 768);
  await sleep(250);
  check('landscape iPad plays normally', await game('!mobileLandscapeBlocked && gameRafId!==0'));

  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel' });
  await metrics(390, 844, false);
  await send('Page.reload');
  await waitFor(`typeof __orientationTest==='function' && __orientationTest("introPhase==='done'")`, 'narrow desktop boot', 90000);
  const desktopTime = await game('timeOfDay');
  await sleep(500);
  check('narrow desktop remains playable in portrait-shaped windows', await game('!isMobile && !mobileLandscapeBlocked && timeOfDay>'+desktopTime) && await ev("document.getElementById('gm-rotate-screen').hidden"));
  check('no browser exceptions', errors.length === 0);
} finally { cleanup(); }
