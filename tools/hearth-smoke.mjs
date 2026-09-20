// Real mouse/touch coal handling, the first striker, a heated bath, and persistence.
// Run: node tools/hearth-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8187), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-hearth-qa';
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
  assert.equal(await game('!!hearthDrag && hearthDrag.fresh'), true, 'the actual pointer grabs one physical chunk');
  for (let i = 1; i <= 8; i++) {
    const p = { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 };
    if (mobile) await touch('touchMove', p); else await mouse('mouseMoved', p, true);
  }
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('current bundle boots the fire room', await game("introPhase==='done' && ENABLE_BATH && typeof hearthRoomLayout==='function'"));
  check('shader warm-up is clean', await ev('window.__shaderWarm.errors.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await sleep(500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimes=[];skySlimeNext=0.01;forgeResourcesReset();cargo=Array.from({length:12},function(){return {type:"coal"};}).concat([{type:"iron"},{type:"iron"}]);forgeStock.flint=1;siphon.tank[0]=12200;player.x=banyaDoorX0-150;player.y=SKY_ROWS*TILE-PLAYER_H;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();for(var n=0;n<900;n++){skySlimeTick(0.1);bathGuestTick(0.1);}');
  check('real visitors reach the waiting room', await game('bathGuests.length>0 && bathGuests.some(function(g){return g.st==="wait";})'));
  await game('bathEnter()'); await sleep(650); await game('updateCamera();render()');
  check('entry opens the boiler with preserved supplies', await game('bathMode && hearthView==="boiler" && forgeCount("coal")===12 && forgeCount("iron")===2 && forgeCount("steel")===0'));
  await layoutCheck('desktop'); await screenshot('cold');
  const beforeCancel = await game('({coal:forgeCount("coal"),chunks:hearthBeds.boiler.chunks.length})');
  await dragCoal({ cancel: true });
  check('releasing a fresh chunk outside refunds exactly one coal', await game(`forgeCount('coal')===${beforeCancel.coal} && hearthBeds.boiler.chunks.length===${beforeCancel.chunks} && !hearthDrag`));
  for (const x of [0.40, 0.50, 0.60]) { await dragCoal({ x }); await advance(0.8); }
  await advance(1);
  check('three mouse-dragged chunks settle cold on the grate', await game('hearthBeds.boiler.chunks.length===3 && hearthBeds.boiler.chunks.every(function(b){return !b.held && !b.lit && b.y>120;}) && forgeCount("coal")===9'));
  await screenshot('pile');
  await press('strike');
  check('a boiler cannot ignite before making steel', await game('hearthBeds.boiler.chunks.every(function(b){return !b.lit;})'));

  await press('forge'); await press('work');
  check('loading the forge commits exactly two iron', await game('hearthJob.stage==="heating" && forgeCount("iron")===0 && forgeCount("steel")===0'));
  await dragCoal();
  check('the first forge uses only one coal', await game('hearthBeds.forge.chunks.length===1 && forgeCount("coal")===8'));
  for (let i = 0; i < 18 && await game('hearthJob.stage==="heating"'); i++) { await press('pump'); await advance(2); }
  check('the banked ember heats the first striker without existing steel', await game('hearthJob.stage==="hammer" && hearthJob.heat>=0.65'));
  await screenshot('forge-hot');
  await advance(0.3);
  for (let i = 0; i < 3; i++) { await press('work'); await advance(0.3); }
  check('three real hammer presses shape the striker', await game('hearthJob.stage==="quench" && hearthJob.hits===3'));
  const quenchWater = await game('bathWaterCount()');
  await press('work');
  check('quenching spends exactly two litres', await game(`hearthJob.stage==='cooling' && bathWaterCount()===${quenchWater - 200}`));
  await screenshot('forge-quench');
  await advance(3.2); await press('work'); await press('work');
  check('the completed striker is collected only once', await game('forgeCount("steel")===1 && hearthJob.stage==="empty"'));
  await press('boiler'); await press('strike'); await press('pump'); await advance(8);
  check('flint and steel ignite the physical boiler fuel without consuming the tools', await game('hearthBeds.boiler.chunks.some(function(b){return b.lit;}) && hearthBeds.boiler.heat>0.3 && forgeCount("flint")===1 && forgeCount("steel")===1'));
  await screenshot('fire');

  await press('bath');
  const waterButton = await game('hearthButtons.some(function(b){return b.action==="water";})');
  if (waterButton) await press('water');
  else {
    const p = await point(center('bathServiceButtons.find(function(b){return b.action==="water";})'));
    await mouse('mousePressed', p, true); await mouse('mouseReleased', p);
  }
  check('refill transfers the real remaining tank contents', await game('siphon.tank[0]===0 && bathPour===12000'));
  await game('gameRafId=requestAnimationFrame(loop)'); await sleep(12000);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;render()');
  console.log('THERMAL', await game('({water:bathWater,heat:bathHeat,boiler:hearthBeds.boiler.heat,pour:bathPour,gpu:!!(liquidWGPU&&liquidWGPU.simActive)})'));
  check('the actual WebGPU tub fills and warms from burning coal', await game('liquidWGPU && liquidWGPU.simActive && bathWater>=BATH_MIN_WATER && bathHeat>=0.35 && bathPour===0'));
  await screenshot('bath');
  const guestPoint = await point('(function(){var g=bathGuests.find(function(g){return g.st==="wait";}),r=bathOrderRect(g);return {x:(r.x+r.w/2-cam.x)*worldScale,y:(r.y+r.h/2-cam.y)*worldScale};})()');
  const beforePay = await game('money');
  await mouse('mousePressed', guestPoint, true); await mouse('mouseReleased', guestPoint);
  await game('gameRafId=requestAnimationFrame(loop)'); await sleep(3500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  check('the real guest button admits a slime into the warm water', await game('bathGuests.some(function(g){return g.served;})'));
  await advance(23);
  check('a bath heated by physical coal still pays once', await game(`money===${beforePay}+BATH_VISIT.pay && bathServed===1`));

  const saved = await game('({resources:forgeResourcesSave(),hearth:hearthRoomSave(),money:money})');
  await game('var hearthQAEnvelope=JSON.parse(JSON.stringify(saveBuild()));init();saveApply(hearthQAEnvelope);introPhase="done";bathMode=true;bathWater=bathBasinCount();bathArmHeat();bathCamPin();hearthView="boiler";render()');
  assert.deepEqual(await game('forgeResourcesSave()'), saved.resources, 'full save restores supplies and finished tools');
  assert.deepEqual(await game('hearthRoomSave()'), saved.hearth, 'full save restores physical fuel and the completed forge');
  check('full save round trip preserves the completed craft and payment', await game(`money===${saved.money} && forgeCount('steel')===1`));
  await ev('window.SluiceLoading.finish(function(){})'); await sleep(500);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await game('isMobile=true;resize();hearthView="boiler";for(var n=0;n<60;n++)updateCamera();render()');
  await layoutCheck('phone');
  const mobileBefore = await game('({coal:forgeCount("coal"),chunks:hearthBeds.boiler.chunks.length})');
  await dragCoal({ mobile: true, cancel: true });
  check('touch cancellation returns coal and clears capture state', await game(`forgeCount('coal')===${mobileBefore.coal} && hearthBeds.boiler.chunks.length===${mobileBefore.chunks} && !hearthDrag && !hearthPress`));
  await dragCoal({ mobile: true }); await advance(0.7);
  check('phone touch can place a real coal chunk', await game(`forgeCount('coal')===${mobileBefore.coal - 1} && hearthBeds.boiler.chunks.length===${mobileBefore.chunks + 1} && !hearthDrag`));
  await press('pump', true); await press('forge', true);
  check('phone tabs and controls use real touch input', await game('hearthView==="forge" && hearthBeds.boiler.air>0'));
  await press('boiler', true); await screenshot('mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await game('resize();render()'); await layoutCheck('short landscape');
  await press('forge', true); check('short landscape forge tab is tappable', await game('hearthView==="forge"'));
  await screenshot('landscape');
  await send('Emulation.setDeviceMetricsOverride', { width: 568, height: 320, deviceScaleFactor: 1, mobile: true });
  await game('resize();render()'); await layoutCheck('small landscape');
  await press('boiler', true); await press('pump', true);
  check('small landscape tabs and bellows remain tappable', await game('hearthView==="boiler" && hearthBeds.boiler.air>0'));
  await screenshot('landscape-small');
  check('no browser runtime or shader errors', errors.length === 0 && await ev('window.__shaderWarm.errors.length===0'));
  console.log('Screenshots: ' + out);
} finally {
  if (errors.length) console.error(JSON.stringify(errors));
  cleanup();
}
