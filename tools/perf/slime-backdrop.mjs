// Regression for unused surface-slime refraction copies. Uses real Canvas pixels.
// node tools/perf/slime-backdrop.mjs; screenshots and browser profiles stay in /tmp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-backdrop-'));
const port = Number(process.env.PORT || 8952), debug = port + 1000;
// Snapshot the sources together so another task's unbuilt changes cannot leave
// this test using a new loading page with an older generated game bundle.
const pageSource = fs.readFileSync(path.join(root, 'grand-motherload.html'));
const source = fs.readdirSync(path.join(root, 'js/sluice')).filter(f => /^\d{3}-.*\.js$/.test(f)).sort()
  .map(f => fs.readFileSync(path.join(root, 'js/sluice', f), 'utf8')).join('\n');
const end = source.lastIndexOf('})();');
const bundle = source.slice(0, end) + 'window.__backdropTest=function(source){return eval(source);};\n' + source.slice(end);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.m4a': 'audio/mp4' };
const server = http.createServer((req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = name === '/js/sluice.js' ? bundle : name === '/grand-motherload.html' ? pageSource : fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, ws, sequence = 0;
const pending = new Map(), errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const checkPixels = String.raw`(function(){
  cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;
  var originalCtx=ctx,originalBegin=jelloBackdropBegin,originalDraw=jelloDrawBody,originalNow=performance.now;
  var oldBegin=eval('('+jelloBackdropBegin.toString().replace('b.surfaceSlime || ','')+')');
  var oldBody=eval('('+jelloDrawBody.toString().replace('sw > 1 && sh > 1 && sx < ctx.canvas.width && sy < ctx.canvas.height &&\n          sx + sw > 0 && sy + sh > 0','sw > 1 && sh > 1')+')');
  var cv=document.createElement('canvas');cv.width=640;cv.height=400;ctx=cv.getContext('2d');
  performance.now=function(){return 123456;};
  var reports=[],copies=0,copyArea=0,oldFor=jelloBackdropFor,fallbacks=0,selfCopies=0;
  var mainCopy=ctx.drawImage;
  ctx.drawImage=function(source){if(source===ctx.canvas)selfCopies++;return mainCopy.apply(this,arguments);};
  jelloBackdropFor=function(){var result=oldFor.apply(this,arguments);if(!result)fallbacks++;return result;};
  // Snapshot imports occur on this dedicated backdrop context only.
  jelloBackdropCanvas=document.createElement('canvas');jelloBackdropCtx=jelloBackdropCanvas.getContext('2d');
  var oldCopy=jelloBackdropCtx.drawImage;
  jelloBackdropCtx.drawImage=function(){copies++;copyArea+=arguments[3]*arguments[4];return oldCopy.apply(this,arguments);};
  function background(){
    ctx.reset();ctx.fillStyle='#4a5953';ctx.fillRect(0,0,640,400);
    for(var y=0;y<400;y+=13){ctx.fillStyle=y%26?'#927456':'#354c64';ctx.fillRect(0,y,640,7);}
    for(var x=0;x<640;x+=17){ctx.fillStyle='rgba(202,183,140,.42)';ctx.fillRect(x,0,4,400);}
    ctx.setTransform(worldScale,0,0,worldScale,-cam.x*worldScale,-cam.y*worldScale);
  }
  function resident(x,y){return surfaceSlimeBuild(x,y,{id:999,seed:.4,hue:133});}
  function glass(x,y){var b=jelloBuildDisc(x,y,30,'slime');b.refract=.2;return b;}
  var scenarios=[
    ['residents only',function(){resident(180,210);resident(430,210);}],
    ['glass only',function(){glass(280,210);}],
    ['separate mixed',function(){resident(100,210);glass(400,210);}],
    ['resident before overlapping glass',function(){resident(290,210);glass(310,210);}],
    ['glass before overlapping resident',function(){glass(290,210);resident(310,210);}],
    ['overlapping glass',function(){glass(290,210);glass(310,210);}],
    ['viewport edge',function(){resident(180,210);glass(4,210);}],
    ['offscreen glass',function(){resident(180,210);glass(1300,210);}],
    ['left margin',function(){glass(cam.x-40,210);}],
    ['right margin',function(){glass(cam.x+screenW+40,210);}],
    ['top margin',function(){glass(160,cam.y-40);}],
    ['bottom margin',function(){glass(160,cam.y+screenH+40);}]
  ];
  try {
    JELLO_DEBUG_PARTICLES=false;jelloSplats=[];
    for(var scale of [1,1.37,2])for(var scene of scenarios){
      jelloBodies=[];jelloCount=0;
      dpr=1;worldScale=scale;screenW=640/scale;screenH=400/scale;cam.x=.17;cam.y=200-screenH*.5+.23;
      scene[1]();
      jelloFrameNo++;
      function paint(begin,bodyDraw){
        copies=copyArea=fallbacks=selfCopies=0;jelloBackdropBegin=begin;jelloDrawBody=bodyDraw;background();drawJelloBlobs();
        return {pixels:ctx.getImageData(0,0,640,400).data,copies:copies,area:copyArea,fallbacks:fallbacks,selfCopies:selfCopies};
      }
      // Warm material followers and raster paths on both paths before comparing.
      for(var k=0;k<12;k++){paint(oldBegin,oldBody);paint(originalBegin,originalDraw);}
      var a=paint(oldBegin,oldBody),b=paint(originalBegin,originalDraw),changed=0,max=0;
      for(var i=0;i<a.pixels.length;i++){var delta=Math.abs(a.pixels[i]-b.pixels[i]);if(delta)changed++;max=Math.max(max,delta);}
      reports.push({scene:scene[0],scale:scale,changed:changed,max:max,beforeCopies:a.copies,afterCopies:b.copies,
        beforeArea:a.area,afterArea:b.area,beforeFallbacks:a.fallbacks,afterFallbacks:b.fallbacks,beforeSelf:a.selfCopies,afterSelf:b.selfCopies});
    }
    return reports;
  } finally {ctx=originalCtx;jelloBackdropBegin=originalBegin;jelloDrawBody=originalDraw;jelloBackdropFor=oldFor;performance.now=originalNow;}
})()`;
try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--mute-audio',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + debug, 'about:blank'
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await sleep(100);
  }
  assert.ok(target, 'testing browser started');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen = resolve; });
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['*google-analytics.com*', '*googletagmanager.com*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/grand-motherload.html?nosave=1&nopause=1&snow=1' });
  let ready = false;
  for (let i = 0; i < 450; i++) { if (await ev('!!window.__backdropTest&&__backdropTest("introPhase===\'done\'")')) { ready = true; break; } await sleep(100); }
  assert.ok(ready, 'game finished loading');
  const reports = await ev('__backdropTest(' + JSON.stringify(checkPixels) + ')');
  for (const r of reports) {
    assert.equal(r.changed, 0, 'identical pixels: ' + JSON.stringify(r));
    if (r.scene.endsWith('margin')) {
      assert.equal(r.beforeSelf, 1, 'old margin body performed an empty self-copy');
      assert.equal(r.afterSelf, 0, 'fully offscreen sources perform no self-copy');
    } else assert.equal(r.afterFallbacks, r.beforeFallbacks, 'preserve overlapping-lens fallback: ' + JSON.stringify(r));
    if (r.scene === 'residents only' || r.scene === 'offscreen glass') {
      assert.equal(r.beforeCopies, 1, 'old path reproduced unnecessary copy');
      assert.equal(r.afterCopies, 0, 'surface residents need no backdrop');
    }
    assert.ok(r.afterArea <= r.beforeArea, 'copy only bounds needed by actual glass');
  }
  assert.deepEqual(errors, [], 'no browser errors');
  fs.writeFileSync(process.env.DUMP || '/tmp/sluice-backdrop-results.json', JSON.stringify(reports, null, 2));
  console.log('PASS: ' + reports.length + ' pixel-identical scenes; no resident-only copies; glass, mixed overlap and view-edge refraction preserved.');
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} ws.close(); }
  if (chrome && chrome.exitCode === null) chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
}
