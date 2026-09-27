// GPU snow keeps its exact state outside the active region and resumes on entry.
// Run: node tools/sluice-snow-region.mjs (requires the approved testing browser).
// PORT selects the HTTP port; DUMP selects an artifact directory outside the repo.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8441), debug = port + 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-snow-region-profile-'));
const out = path.resolve(process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-snow-region-')));
assert.ok(out !== root && !out.startsWith(root + path.sep), 'Artifacts stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file === path.join(root, 'js/sluice.js') && process.env.SLUICE_TEST_BUNDLE
      ? process.env.SLUICE_TEST_BUNDLE : file === path.join(root, 'js/liquid-wgpu.js') && process.env.SLUICE_TEST_GPU
      ? process.env.SLUICE_TEST_GPU : file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__snowTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png' };
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME || path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), [
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], {stdio:'ignore'});
let ws, seq=0; const pending=new Map(), errors=[];
let cleanupPromise, launchError;
chrome.once('error', error => { launchError=error; });
function cleanup() {
  return cleanupPromise ||= (async () => {
    try { ws?.close(); } catch {}
    if(chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const exited=new Promise(resolve => chrome.once('exit',resolve));
      chrome.kill();
      const force=setTimeout(() => chrome.kill('SIGKILL'),2000);force.unref();
      await exited;clearTimeout(force);
    }
    server.closeAllConnections();server.close();
    fs.rmSync(profile,{recursive:true,force:true});
  })();
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]]) {
  process.once(signal,async () => { await cleanup();process.exit(code); });
}
function send(method,params={}) {
  return new Promise((resolve,reject) => {
    const id=++seq,timer=setTimeout(() => {pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__snowTest(${JSON.stringify(source)})`);
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
try {
  let endpoint;
  for (let i=0;i<100;i++) {
    if(launchError)throw launchError;
    try { const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl; if(endpoint)break; } catch {}
    await sleep(100);
  }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  async function ready() {
    for(let i=0;i<400;i++){
      if(errors.length)throw new Error('Game startup failed: '+JSON.stringify(errors.slice(0,3)));
      if(await ev(`typeof __snowTest==='function' && __snowTest("introPhase === 'done'")`))return;
      await sleep(100);
    }
    const diagnostic=await ev(`({body:document.body.innerText.slice(-2500),hook:typeof __snowTest,
      phase:typeof __snowTest==='function'?__snowTest("introPhase"):null})`);
    fs.writeFileSync(path.join(out,'loading.json'),JSON.stringify(diagnostic,null,2));
    await screenshot('loading');
    throw new Error('loading did not complete: '+JSON.stringify(diagnostic));
  }

  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35`});
  await ready();
  assert.ok(await game('!!(liquidWGPU && liquidWGPU.simActive)'),'WebGPU snow solver is active');
  const result=await game(`(async function(){
    gamePaused=true;cancelAnimationFrame(gameRafId);while(liquidCount)removeLiquidParticle(liquidCount-1);
    var sy=SKY_ROWS*TILE,cx=82*TILE;
    cam.x=cx-300;cam.y=sy-300;player.x=cx+250;player.y=sy-PLAYER_H;player.thrusting=false;rocketIntensity=0;
    snowAir.active=false;snowAir.wind=0;snowAir.clock=0;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    var view=liquidWGPU.liquid.getView,regionCenter=cx;
    liquidWGPU.liquid.getView=function(){var v=view();v.regionMinX=regionCenter-60;v.regionMaxX=regionCenter+60;v.regionMinY=sy-200;v.regionMaxY=sy+100;return v;};
    async function read(){var d=liquidWGPU.device,b=d.createBuffer({size:liquidCount*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});var e=d.createCommandEncoder();e.copyBufferToBuffer(liquidWGPU.buf.pos,0,b,0,liquidCount*16);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);var a=Array.from(new Float32Array(b.getMappedRange()));b.unmap();b.destroy();return a;}
    addLiquidParticle(5,cx,sy-80,0,0,3);
    addLiquidParticle(5,cx+300,sy-80,7,11,3);addLiquidParticle(5,cx+300.5,sy-80,7,11,3);
    liquidWGPU.uploadParticles();var initial=await read();
    for(var t=0;t<16;t++){liquidWGPU.update(1/60);await liquidWGPU.queue.onSubmittedWorkDone();}
    var outside=await read();regionCenter=cx+300;
    for(var t=0;t<16;t++){liquidWGPU.update(1/60);await liquidWGPU.queue.onSubmittedWorkDone();}
    var returned=await read();return {initial,outside,returned,active:liquidWGPU.simActive};})()`);
  assert.equal(result.active,true,'WebGPU stays active');
  assert.deepEqual(result.outside.slice(4),result.initial.slice(4),'off-region overlapping snow preserves every position and velocity lane');
  assert.ok(result.outside[1]>result.initial[1]+1,'local snow continues falling');
  assert.deepEqual(result.returned.slice(0,4),result.outside.slice(0,4),'newly off-region local grain preserves its exact state');
  assert.ok(result.returned[5]>result.outside[5]+1,'returning snow resumes falling');
  assert.ok(Math.hypot(result.returned[4]-result.returned[8],result.returned[5]-result.returned[9])>1,'returning neighbors resume grain contacts');
  assert.equal(errors.length,0,'no browser errors');
  fs.writeFileSync(path.join(out,'region-result.json'),JSON.stringify(result,null,2));
  console.log('PASS resident snow region guard; evidence: '+path.join(out,'region-result.json'));
} finally {
  if(errors.length)console.log('ERRORS',errors.slice(0,8));
  await cleanup();
}
