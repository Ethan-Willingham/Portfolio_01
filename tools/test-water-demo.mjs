// Browser regression for the standalone demo. Owns and closes Chrome for Testing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-demo-review';
const port = Number(process.env.PORT || 8435), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
      function demoMinimumOrientation(b) {
        var minimum = Infinity;
        for(var t=0;t<b.triN;t++) {
          var a=b.triA[t],c=b.triB[t],d=b.triC[t];
          var rest=(b.rx[c]-b.rx[a])*(b.ry[d]-b.ry[a])-(b.ry[c]-b.ry[a])*(b.rx[d]-b.rx[a]);
          var area=(b.px[c]-b.px[a])*(b.py[d]-b.py[a])-(b.py[c]-b.py[a])*(b.px[d]-b.px[a]);
          if(Math.abs(rest)>1e-9)minimum=Math.min(minimum,area/rest);
        }
        return minimum;
      }
      window.__demoTest = function(source) { return eval(source); };
      ` + source.slice(end);
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(data);
  } catch { response.writeHead(404).end(); }
});
let chrome, socket, sequence = 0;
const pending = new Map(), errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  try { socket?.close(); } catch {}
  server.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    const force = setTimeout(() => chrome.kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(force);
  }
  for (const p of pending.values()) clearTimeout(p.timer);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const inside = source => evaluate(`__demoTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dump, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function navigate(width, height, query = '', mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!window.__toy && __toy.stats().waterState !== "booting"')) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 150; i++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p => p.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    await sleep(100);
  }
  assert.ok(endpoint, 'Chrome for Testing starts');
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p?.timer); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await navigate(1440, 1000);
  await screenshot('desktop');
  console.log('ERRORS', JSON.stringify([...new Set(errors.map(e => e.exception?.description || JSON.stringify(e)))]));
  assert.equal(errors.length, 0, 'initial boot has no JavaScript errors');
  if (process.env.PREVIEW_ONLY === '1') process.exitCode = 0;
  else {
    assert.ok(await evaluate('__toy.stats().waterState === "on" && __toy.stats().smoke'), 'water and smoke boot on hardware graphics');
    assert.ok(await evaluate('__toy.stats().waterLook === "rainbow" && __toy.stats().rainbow.ready && __toy.stats().rainbow.active && __toy.stats().rainbow.frames > 0'), 'rainbow transport and finish render on the GPU by default');
    assert.ok(await evaluate('!document.getElementById("toy-rainbow-water").hidden && LiquidWGPU.last.renderCanvas.hidden'), 'the rainbow finish replaces the raw water layer');
    await evaluate(`document.querySelector('[data-preset="waterLook:default"]').click()`); await sleep(200);
    assert.ok(await evaluate('!__toy.stats().rainbow.active && document.getElementById("toy-rainbow-water").hidden && !LiquidWGPU.last.renderCanvas.hidden'), 'normal water restores its original canvas');
    await evaluate(`document.querySelector('[data-preset="waterLook:rainbow"]').click()`); await sleep(300);
    assert.ok(await evaluate('__toy.stats().rainbow.active && !document.getElementById("toy-rainbow-water").hidden'), 'rainbow can be selected again');
    const pool = await evaluate(`(() => {
      const bounds = document.getElementById('toy-stage').getBoundingClientRect();
      return { x:bounds.x+bounds.width*.3, y:bounds.y+bounds.height*.34, radius:bounds.width*.065 };
    })()`);
    await send('Input.dispatchMouseEvent', { type:'mouseMoved',x:pool.x+pool.radius,y:pool.y });
    await send('Input.dispatchMouseEvent', { type:'mousePressed',button:'left',buttons:1,clickCount:1,x:pool.x+pool.radius,y:pool.y });
    for (let step=0;step<40;step++) {
      const angle = step/40*Math.PI*4;
      await send('Input.dispatchMouseEvent', { type:'mouseMoved',buttons:1,x:pool.x+Math.cos(angle)*pool.radius,y:pool.y+Math.sin(angle)*pool.radius*.35 });
      await sleep(30);
    }
    await send('Input.dispatchMouseEvent', { type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:pool.x+pool.radius,y:pool.y });
    await sleep(1500); await screenshot('rainbow-stirred');
    assert.ok(await evaluate('__toy.stats().rainbow.active && __toy.stats().waterState === "on"'), 'stirring keeps the water finish and solver active');
    await evaluate('__toy.pause(true)');
    const finishFrames = await evaluate('__toy.stats().rainbow.frames');
    const before = await evaluate('__toy.bodies().map(b => [b.cx,b.cy])'); await sleep(300);
    assert.deepEqual(await evaluate('__toy.bodies().map(b => [b.cx,b.cy])'), before, 'pause freezes bodies');
    assert.equal(await evaluate('__toy.stats().rainbow.frames'), finishFrames, 'pause freezes the rainbow finish');
    await evaluate('document.getElementById("toy-resume").click()');
    assert.equal(await evaluate('__toy.stats().paused'), false, 'resume button works');
    for (const scene of ['falls', 'zerog', 'chimney', 'spa', 'rig']) {
      await evaluate(`document.querySelector('[data-scene="${scene}"]').click()`); await sleep(500);
      assert.equal(await evaluate('__toy.stats().scene'), scene, 'scene control ' + scene);
      assert.ok(await evaluate('__toy.bodies().every(b => [...b.px,...b.py].every(Number.isFinite) && b.surfaceSlime && !b.surfaceSlime.eye && !(b.actor && b.actor.enabled))'), 'slimes are finite, passive and eyeless in ' + scene);
    }
    await evaluate('__toy.scene("falls");document.querySelector("[data-panel=slime]").click()'); await screenshot('slime-panel');
    assert.ok(await evaluate('!document.getElementById("toy-panel-slime").hidden'), 'slime menu opens');
    assert.equal(await evaluate(`document.querySelectorAll('[data-preset="slimeLook:eyes"]').length`), 0, 'no eye preset');
    await evaluate('document.querySelector("#toy-panel-slime [data-close]").click()');
    await inside(`stopLoop(); userPaused = true; scene('blank'); setGravityUI(1);
      spawnSlimeAt(worldW*.42,worldH*.3,27); spawnSlimeAt(worldW*.5,worldH*.18,27);`);
    const physics = await inside(`(function() {
      var minimum = Infinity, finite = true;
      for(var frameNo=0;frameNo<360;frameNo++) { updateJello(1/60);
        for(var bi=0;bi<jelloBodies.length;bi++) { var b=jelloBodies[bi];
          for(var p=0;p<b.n;p++) finite = finite && isFinite(b.px[p]+b.py[p]);
          minimum=Math.min(minimum,demoMinimumOrientation(b));
        }
      }
      return {finite:finite,bodies:jelloBodies.length,minimum:minimum,
        floor:jelloBodies.map(function(b){return b.bboxB;})};
    })()`);
    console.log('PHYSICS', JSON.stringify(physics));
    assert.ok(physics.finite && physics.bodies === 2 && physics.minimum > 0, 'drop and pile keep material orientation and finite positions');
    const grip = await inside(`(function(){
      scene('blank');setGravityUI(0);var b=spawnSlimeAt(worldW*.35,worldH*.5,30);
      var x=b.cx,y=b.cy, grabbed=jelloGrabStart(x+18,y-5);
      for(var f=0;f<60;f++){jelloGrabTick(x+18+f*2,y-5-30*Math.sin(f/60*Math.PI));updateJello(1/60);}
      var moved=b.cx-x, spread=b.bboxR-b.bboxL;jelloGrabEnd();
      var vx=b.vx;for(f=0;f<30;f++)updateJello(1/60);
      return {grabbed:grabbed,moved:moved,spread:spread,vx:vx,finite:[...b.px,...b.py].every(Number.isFinite),minimum:demoMinimumOrientation(b)};
    })()`);
    console.log('GRIP', JSON.stringify(grip));
    assert.ok(grip.grabbed && grip.moved > 70 && grip.finite && grip.minimum > 0, 'material grip deforms and moves the body without folding');
    const wallGrip = await inside(`(function(){
      scene('blank');setGravityUI(0);wallRect(worldW*.5,0,worldW*.5+16,worldH);
      var b=spawnSlimeAt(worldW*.4,worldH*.5,27);jelloGrabStart(b.cx,b.cy);
      for(var f=0;f<80;f++){jelloGrabTick(worldW*.4+f*3,worldH*.5);updateJello(1/60);}
      var inside=0;for(var p=0;p<b.n;p++)if(jelloWorldSolidAt(b.px[p],b.py[p]))inside++;
      jelloGrabEnd();return {inside:inside,left:b.bboxL,right:b.bboxR,wall:Math.round(worldW*.5/8)*8,minimum:demoMinimumOrientation(b)};
    })()`);
    console.log('WALL GRIP', JSON.stringify(wallGrip));
    assert.ok(wallGrip.inside===0 && wallGrip.right<=wallGrip.wall+1 && wallGrip.minimum>0, 'pulling against a drawn wall keeps the gel outside terrain');
    for (const [w,h,mobile] of [[390,844,true],[844,390,true],[1280,720,false]]) {
      await navigate(w,h,'',mobile); await screenshot(w+'x'+h);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal overflow at '+w+'x'+h);
      await evaluate('document.getElementById("toy-fullscreen").click()'); await sleep(300);
      assert.ok(await evaluate('document.getElementById("toy-viewport").getBoundingClientRect().bottom <= innerHeight && document.querySelector(".toy-foot").getBoundingClientRect().bottom <= innerHeight+1'), 'fullscreen controls remain visible at '+w+'x'+h);
      await screenshot('fullscreen-'+w+'x'+h);
    }
    await evaluate('document.getElementById("toy-fullscreen").click()');
    await inside('liquidWGPU.renderActive = false; updateLiquidToy(1/60);');
    assert.ok(await evaluate('__toy.stats().waterState === "off" && !__toy.stats().rainbow.active && document.getElementById("toy-rainbow-water").hidden'), 'a water backend failure also hides the rainbow finish');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      Object.defineProperty(navigator, 'gpu', { value: undefined });
      const originalContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        return /webgl/.test(kind) ? null : originalContext.call(this, kind, ...args);
      };
    ` });
    await navigate(1024,768);
    assert.ok(await evaluate('__toy.stats().waterState === "off" && !__toy.stats().smoke && __toy.bodies().length > 0'), 'slime remains available without WebGPU or WebGL');
    assert.ok(await evaluate('document.querySelector("[data-tool=water]").disabled && document.querySelector("[data-tool=smoke]").disabled && !document.querySelector("[data-tool=slime]").disabled && !document.getElementById("toy-nowater").hidden'), 'unsupported materials explain availability and disable their tools');
    assert.ok(await evaluate('document.getElementById("toy-hint").textContent.includes("stretch")'), 'fallback hint describes the available gel');
    await screenshot('no-graphics-backend');
    assert.equal(errors.length, 0, 'no runtime errors across scenes, controls and sizes');
    console.log('PASS: physics demo browser regression');
  }
} finally { await cleanup(); }
