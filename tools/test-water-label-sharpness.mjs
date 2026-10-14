// Display-resolution annotation regression for the standalone demo. Owns and closes Chrome for Testing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-label-review';
const port = Number(process.env.PORT || 8447), debug = port + 1000;
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
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {width:2560,height:1440,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate', {url:`http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html?scene=self-flushing-cup`});
  for(let i=0;i<200;i++){
    if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !!document.getElementById("toy-instruments-canvas")'))break;
    await sleep(100);
  }
  assert.equal(await evaluate('__toy.stats().waterState'), 'on', 'native water boots');
  await evaluate('__toy.pause(true); document.fonts.ready');
  // Record the actual text transform. It must place world anchors directly in
  // display pixels, even when the simulation is cropped or zoomed.
  await inside(`window.__labelDraws=[];
    var originalLabelFill=instrumentsCtx.fillText;
    instrumentsCtx.fillText=function(text,x,y){
      var m=this.getTransform();window.__labelDraws.push({text,x,y,font:this.font,a:m.a,d:m.d,e:m.e,f:m.f});
      return originalLabelFill.apply(this,arguments);
    };machineOverlayCache=null;drawMachineOverlay();`);
  async function check(name,width,height,density,zoom=1){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:density,mobile:false});
    await sleep(200);
    await evaluate(`__toy.setCamera({zoom:${zoom},panX:0,panY:0})`);
    await sleep(100);
    const result=await inside(`(() => {
      var layer=document.getElementById('toy-instruments-canvas'),bounds=layer.getBoundingClientRect();
      var stageBounds=stage.getBoundingClientRect(),view=viewport.getBoundingClientRect();
      var label=window.__labelDraws.filter(x=>x.text==='Fill line').at(-1);
      var pixels=instrumentsCtx.getImageData(0,0,layer.width,layer.height).data;
      return {parent:layer.parentElement.id,width:layer.width,height:layer.height,
        cssWidth:bounds.width,cssHeight:bounds.height,viewWidth:viewport.clientWidth,viewHeight:viewport.clientHeight,
        transform:getComputedStyle(layer).transform,density:devicePixelRatio,label,
        stageLeft:stageBounds.left-view.left,stageTop:stageBounds.top-view.top,scale:fitScale,
        painted:pixels.some((value,i)=>i%4===3 && value>0),paused:userPaused};
    })()`);
    assert.equal(result.parent,'toy-viewport');
    assert.equal(result.transform,'none');
    assert.equal(result.width,Math.round(result.viewWidth*density));
    assert.equal(result.height,Math.round(result.viewHeight*density));
    assert.equal(result.cssWidth,result.viewWidth);
    assert.equal(result.cssHeight,result.viewHeight);
    assert.ok(result.painted && result.paused, name+': paused labels remain visible');
    assert.ok(result.label,name+': scene labels drawn');
    const sx=result.width/result.viewWidth,sy=result.height/result.viewHeight;
    assert.ok(Math.abs(result.label.a-sx*result.scale)<1e-6);
    assert.ok(Math.abs(result.label.d-sy*result.scale)<1e-6);
    assert.ok(Math.abs(result.label.e-sx*result.stageLeft)<0.1);
    assert.ok(Math.abs(result.label.f-sy*result.stageTop)<0.1);
    assert.ok(Math.abs(parseFloat(result.label.font)*result.scale-12)<0.001);
    await screenshot(name);
    console.log(name,JSON.stringify(result));
  }
  await check('1440p-100',2560,1440,1);
  await check('1440p-125',2048,1152,1.25);
  await check('1440p-150',1707,960,1.5);
  await check('small-window',800,500,1.25);
  await check('zoom-and-crop',1280,720,1.5,2);
  await check('retina',1440,900,2);
  await check('high-density',1000,700,3);
  // A display change with identical CSS dimensions must repaint without camera
  // setters, resize events, or a running animation loop.
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1.25,mobile:false});
  for(let i=0;i<50;i++){
    if(await evaluate('document.getElementById("toy-instruments-canvas").width===Math.round(document.getElementById("toy-instruments-canvas").clientWidth*1.25)'))break;
    await sleep(100);
  }
  assert.ok(await evaluate(`(() => {
    var c=document.getElementById('toy-instruments-canvas');
    return c.width===Math.round(c.clientWidth*1.25) && c.height===Math.round(c.clientHeight*1.25);
  })()`),'DPR-only change redraws paused annotations');
  await evaluate('document.getElementById("toy-fullscreen").click()');
  await sleep(300);
  await check('expanded',1920,1080,1.25);
  await evaluate('__toy.pause(false)');await sleep(500);
  await evaluate('__toy.pause(true)');
  await evaluate('__toy.airPressureView(false); __toy.scene("blank")');await sleep(200);
  assert.ok(await evaluate(`(() => {
    var c=document.getElementById('toy-instruments-canvas');
    return !c || !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,i)=>i%4===3 && value);
  })()`),
    'switching to an empty scene clears the entire viewport annotation layer');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: screen-resolution labels, resizing, zoom, fullscreen and live DPR changes');
} finally { await cleanup(); }
