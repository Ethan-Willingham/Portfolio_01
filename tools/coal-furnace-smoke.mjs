// Polygon coal, staged combustion, real mouse/touch handling, and frame cost.
// Run: node tools/coal-furnace-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8193), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-coal-qa';
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
      data = Buffer.from(src.slice(0, end) + 'window.__hearthTest = function(source) { return eval(source); };\n' + src.slice(end));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const game = source => ev(`__hearthTest(${JSON.stringify(source)})`);
async function point(target) {
  return game(`(function(){var p=${target};if(!p)throw new Error('Missing interaction target');var r=canvas.getBoundingClientRect();return {x:r.left+p.x*r.width/(canvas.width/dpr),y:r.top+p.y*r.height/(canvas.height/dpr)};})()`);
}
const center = target => `(function(){var r=${target};return r&&{x:r.x+r.w/2,y:r.y+r.h/2};})()`;
const button = action => `hearthButtons.find(function(b){return b.action===${JSON.stringify(action)};})`;
async function mouse(type, p, down = false) {
  await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: down ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function touch(type, p) {
  await send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
}
async function press(action, mobile = false) {
  const p = await point(center(button(action)));
  if (mobile) { await touch('touchStart', p); await touch('touchEnd'); }
  else { await mouse('mousePressed', p, true); await mouse('mouseReleased', p); }
  await game('render()');
}
async function dragCoal({ mobile = false, cancel = false, x = 0.5, y = 0.28 } = {}) {
  const from = await point(center('hearthRoomLayout().bin'));
  const to = await point(`(function(){var r=hearthRoomLayout().box;return {x:r.x+r.w*${x},y:r.y+r.h*${y}};})()`);
  if (mobile) await touch('touchStart', from); else await mouse('mousePressed', from, true);
  check('the actual pointer grabs one physical chunk', await game('!!hearthDrag && hearthDrag.fresh'));
  for (let i = 1; i <= 8; i++) {
    const p = { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 };
    if (mobile) await touch('touchMove', p); else await mouse('mouseMoved', p, true);
  }
  await sleep(160);
  const resting = { x: to.x + 0.1, y: to.y };
  if (mobile) await touch('touchMove', resting); else await mouse('mouseMoved', resting, true);
  if (cancel && mobile) await touch('touchCancel');
  else if (cancel) {
    const outside = await point('({x:8,y:108})');
    await mouse('mouseMoved', outside, true); await mouse('mouseReleased', outside);
  } else if (mobile) await touch('touchEnd');
  else await mouse('mouseReleased', to);
  await game('render()');
}
async function advance(seconds) {
  await game(`for(var hearthQAFrame=0;hearthQAFrame<${Math.ceil(seconds * 60)};hearthQAFrame++)bathGuestTick(1/60);render()`);
}
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }
async function layoutCheck(label) {
  const result = await game(`(function(){var w=canvas.width/dpr,h=canvas.height/dpr,L=hearthRoomLayout();return {w:w,h:h,compact:!!L.compact,small:!!L.small,buttons:hearthButtons.map(function(b){return {action:b.action,x:b.x,y:b.y,w:b.w,h:b.h};})};})()`);
  check(label + ' controls fit the viewport', result.buttons.length >= 8 && result.buttons.every(b => b.w >= 40 && b.h >= 40 && b.x >= 0 && b.y >= 0 && b.x + b.w <= result.w + 1 && b.y + b.h <= result.h + 1));
  if (result.compact || result.small) check(label + ' footer leaves the controls unobscured', result.buttons.every(b => b.y + b.h <= result.h - 55));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&cpufire=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('current bundle boots the fire room', await game("introPhase==='done' && ENABLE_BATH && typeof hearthRoomLayout==='function'"));
  check('shader warm-up is clean', await ev('window.__shaderWarm.errors.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await sleep(500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;hearthRoomReset();forgeStock.coal=30;forgeStock.flint=1;forgeStock.steel=1;bathMode=true;bathFading=false;gamePaused=false;hearthSetView("boiler");render()');
  await screenshot('empty');
  for (const x of [0.5, 0.5, 0.5]) { await dragCoal({ x, y: 0.60 }); await advance(1); }
  await advance(3);
  check('three large coals settle without burning or losing stock', await game('hearthBeds.boiler.chunks.length===3 && forgeCount("coal")===27 && hearthBeds.boiler.chunks.every(function(b){return b.r>=29 && b.fuel===1 && !b.lit;})'));
  await screenshot('cold');
  await press('strike'); await advance(2); await screenshot('drying');
  await advance(10); await screenshot('flaming');
  console.log('IGNITION', await game('hearthBeds.boiler.chunks.map(function(b){return {x:b.x,y:b.y,r:b.r,lit:b.lit,stage:b.stage,heat:b.heat,air:b.oxygen};})'));
  check('a spark spreads through the nearby physical coal', await game('hearthBeds.boiler.chunks.filter(function(b){return b.lit;}).length>=2 && hearthBeds.boiler.power>0.5'));
  for (let i = 0; i < 3 && await game('hearthBeds.boiler.chunks.some(function(b){return !b.lit;})'); i++) await press('strike');
  await advance(6);
  check('a separated lump can be lit with another strike', await game('hearthBeds.boiler.chunks.every(function(b){return b.lit;})'));
  const burning = await game('JSON.stringify(hearthSave())');
  await game('var coalSnapshot=JSON.parse(JSON.stringify(hearthSave()));hearthRestore(coalSnapshot)');
  assert.equal(await game('JSON.stringify(hearthSave())'), burning, 'all saved material and thermal reservoirs round-trip exactly');
  await advance(24); await screenshot('coke');
  check('volatile flames give way to glowing coke', await game('hearthBeds.boiler.chunks.every(function(b){return b.volatile===0 && b.stage==="coke" && b.flame===0 && b.fuel>0;})'));
  await advance(130); await screenshot('ash');
  check('spent coal shrinks and cools into physical ash', await game('hearthBeds.boiler.chunks.every(function(b){return b.ash && b.r<b.baseR*0.46 && b.heat<0.05;}) && hearthBeds.boiler.power===0'));
  await press('ash');
  check('raking removes spent bodies without returning coal', await game('hearthBeds.boiler.chunks.length===0 && forgeCount("coal")===27'));
  const cost = await game('(function(){var result=[];for(var count of [3,18]){hearthReset();for(var i=0;i<count;i++)hearthAddChunk("boiler",160,12);for(var n=0;n<1800;n++)hearthStepBed(hearthBeds.boiler);var start=performance.now();for(var n=0;n<600;n++)hearthStepBed(hearthBeds.boiler);result.push({pieces:count,millisecondsPerStep:(performance.now()-start)/600});}return result;})()');
  console.log('PHYSICS COST', JSON.stringify(cost));
  check('a full coal bed stays within a practical frame budget', cost.every(c => c.millisecondsPerStep < 4));
  await game('hearthReset();render()');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await sleep(350);
  await game('isMobile=true;resize();hearthSetView("boiler");render()');
  await sleep(350);
  await screenshot('phone-before');
  await dragCoal({ mobile: true, cancel: true });
  check('touch cancel conserves stock', await game('forgeCount("coal")===27 && hearthBeds.boiler.chunks.length===0'));
  await dragCoal({ mobile: true }); await advance(1);
  check('touch places one real polygon', await game('forgeCount("coal")===26 && hearthBeds.boiler.chunks.length===1 && !hearthDrag'));
  await press('strike', true); await press('pump', true); await advance(7); await screenshot('phone-fire');
  check('touch ignition and bellows work', await game('hearthBeds.boiler.chunks[0].lit && hearthBeds.boiler.heat>0.2'));
  check('no browser runtime or shader errors', errors.length === 0 && await ev('window.__shaderWarm.errors.length===0'));
} finally {
  if (errors.length) console.error(JSON.stringify(errors));
  cleanup();
}
