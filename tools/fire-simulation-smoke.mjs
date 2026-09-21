// Reacting fire: actual GPU numerical kernels, material coupling, UI and frame cost.
// Run: node tools/fire-simulation-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';
import { checkFireKernels } from './fire-kernel-checks.mjs';
import { checkFireMaterials } from './fire-material-checks.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8194), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-fire-qa';
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
const game = source => ev(`__hearthTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }

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
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;hearthRoomReset();forgeStock.coal=30;forgeStock.flint=1;forgeStock.steel=1;bathMode=true;bathFading=false;gamePaused=false;hearthSetView("boiler");render()');

  console.log('FIRE INIT', await ev('({available:window.__fire?.available,errors:window.__fire?.errors})'));
  check('WebGPU reacting fire compiled', await ev('!!window.__fire && __fire.available && !__fire.failed'));
  const kernelResults = await game('(' + checkFireKernels.toString() + ')(liquidWGPU.device)');
  for(const r of kernelResults) { console.log('KERNEL',r);check(r.label,r.pass); }
  const materialResults = await game('(' + checkFireMaterials.toString() + ')(liquidWGPU.device)');
  for(const r of materialResults){console.log('MATERIAL',r);check(r.label,r.pass);}
  async function run(seconds) {
    for(let f=0;f<Math.ceil(seconds*60);f+=12){
      await game(`for(var i=0;i<${Math.min(12,Math.ceil(seconds*60)-f)};i++)bathGuestTick(1/60)`);
      await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
      await sleep(0);
    }
    await game('render()');
  }
  async function stats() {
    return ev(`__fire.snapshot().then(function(s){var sum=0,max=0,min=1e9,flame=0,soot=0,oxygen=0,cells=0,invalid=0;for(var i=0;i<s.width*s.height;i++){if(s.mask[i*2]!==-1)continue;var o=i*8,rho=s.fields[o]+s.fields[o+1]+s.fields[o+2]+s.fields[o+3]+s.fields[o+5],T=300+s.fields[o+4]/Math.max(.05,rho);max=Math.max(max,T);min=Math.min(min,T);sum+=s.fields[o];flame+=s.fields[o+6];soot+=s.fields[o+3];oxygen+=s.fields[o+1];cells++;for(var j=0;j<8;j++)if(!Number.isFinite(s.fields[o+j])||s.fields[o+j]<-1e-6)invalid++;}return {gasKg:sum*s.volume,maxTemperature:max,minTemperature:min,flame:flame*s.volume,soot:soot*s.volume,oxygen:oxygen/cells,invalid:invalid,cpuMs:__fire.cpuMs,outputKW:__fire.outputKW,steps:__fire.steps,mirrored:__fire.mirrored};})`);
  }
  for(const x of [112,164,213]) await game(`hearthAddChunk('boiler',${x},175)`);
  await run(2); await screenshot('cold');
  const cold=await stats();console.log('COLD',cold);
  check('cold coal preserves all fuel with no flame or heat',cold.gasKg===0 && cold.flame===0 && cold.outputKW===0 && await game('hearthBeds.boiler.chunks.every(function(b){return b.fuel===1})'));
  await game('hearthIgnite("boiler")');
  for(const seconds of (process.env.QUICK ? [12] : [2,5,10,20,30,30])) {
    await run(seconds); await screenshot('fire-'+seconds);
    const state=await stats();console.log('FIRE',seconds,state);check('finite nonnegative gas fields',state.invalid===0);
    check('bounded material reservoirs',await game('hearthBeds.boiler.chunks.every(function(b){return b.fuel>=0 && b.fuel<=1 && b.surfaceKelvin>=300 && isFinite(b.surfaceKelvin)})'));
    console.log('BODIES',await game('hearthBeds.boiler.chunks.map(function(b){return {fuel:b.fuel,stage:b.stage,skin:b.surfaceKelvin,core:b.coreKelvin,air:b.oxygen,moisture:b.moisture,flame:b.flame};})'));
  }
  if(!process.env.QUICK)check('neighboring fuel catches through thermal exchange',await game('hearthBeds.boiler.chunks.filter(function(b){return b.lit}).length>=2'));
  const saved=await game('JSON.stringify(hearthSave())');
  await game('hearthRestore('+saved+')');
  assert.equal(await game('JSON.stringify(hearthSave())'),saved,'Kelvin temperatures and reservoirs survive save round trip');
  check('Kelvin temperatures and reservoirs survive save round trip',true);
  await game('hearthReset();for(var x of [95,160,225])hearthAddChunk("boiler",x,175)');await run(1);
  await game('for(var b of hearthBeds.boiler.chunks)hearthLightChunk(hearthBeds.boiler,b)');await run(8);await screenshot('full-fire');
  console.log('FULL FIRE',await stats());
  const cost=await game('(async function(){var cpu=[],wall=[],device=liquidWGPU.device;for(var i=0;i<120;i++){var t=performance.now();bathGuestTick(1/60);render();cpu.push(hearthFireGPU.cpuMs);await device.queue.onSubmittedWorkDone();wall.push(performance.now()-t);}function summary(a){a.sort(function(a,b){return a-b});return {avg:a.reduce(function(a,b){return a+b},0)/a.length,p95:a[Math.floor(a.length*.95)]};}return {fireSubmissionMs:summary(cpu),fireRoomAndQueueMs:summary(wall),buffers:hearthFireGPU.bufferBytes};})()');
  console.log('PERFORMANCE',cost);check('fire CPU submissions stay within the frame budget',cost.fireSubmissionMs.p95<3);
  await game('bathMode=false;bathEnter()');await sleep(600);
  await game('devMode=true;hearthRoomAction("kit");hearthRoomAction("guest");devMode=false;lastTime=performance.now();gameRafId=requestAnimationFrame(loop)');
  await sleep(21000);
  const fullGame=await game('({cpu:perfFrameStats(),interval:perfIntervalStats(),fireSteps:hearthFireGPU.steps,water:liquidWGPU.uploadedCount,bathWater:bathWater,smoke:USE_WEBGPU_SMOKE?"WebGPU":"WebGL",slime:jelloWGPU&&jelloWGPU.available})');
  console.log('FULL GAME',fullGame);check('full game runs water, steam and a guest alongside fire',fullGame.water>5000 && fullGame.bathWater>4000 && fullGame.interval.avg<25);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;render()');await screenshot('bath-fire');
  await game('gamePaused=true;render()');check('pause hides the fire layer',await ev('__fire.canvas.style.display==="none"'));
  await game('gamePaused=false;bathMode=false;render()');check('leaving the bath hides the fire layer',await ev('__fire.canvas.style.display==="none"'));
  await game('bathMode=true;hearthSetView("boiler");render()');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await game('isMobile=true;resize();hearthFirePrepare()');
  check('mobile uses the smaller bounded grid',await ev('__fire.available && __fire.width===128'));
  await run(4);await screenshot('phone-fire');
  check('mobile overlay is aligned inside the viewport',await ev('(function(){var r=__fire.canvas.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight;})()'));
  await game('hearthReset();bathGuestTick(1/60)');await run(6);
  const idle=await ev('__fire.submissions');await run(1);check('cold empty fire submits no GPU work',await ev('__fire.submissions')===idle);
  await game('hearthAddChunk("boiler",160,175);render()');
  for(const action of ['strike','pump']){
    const p=await game('(function(){var b=hearthButtons.find(function(b){return b.action==='+JSON.stringify(action)+'}),r=canvas.getBoundingClientRect();return {x:r.left+(b.x+b.w/2)*r.width/(canvas.width/dpr),y:r.top+(b.y+b.h/2)*r.height/(canvas.height/dpr)};})()');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await run(4);check('touch ignition wakes the idle GPU fire and consumes fuel',await game('hearthBeds.boiler.chunks[0].fuel<1 && hearthBeds.boiler.chunks[0].coreKelvin>600'));
  await game('hearthFireCancel();hearthAddChunk("boiler",160,170);hearthIgnite("boiler");for(var i=0;i<600;i++)bathGuestTick(1/60);render()');
  check('CPU fallback continues consuming fuel after fire device disposal',await game('hearthBeds.boiler.chunks.some(function(b){return b.fuel<1}) && hearthBeds.boiler.power>0'));
  check('no browser runtime errors', errors.length===0);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({kernels:kernelResults,materials:materialResults,performance:cost,fullGame:fullGame},null,2));
} finally {
  if (errors.length) console.error(JSON.stringify(errors.slice(0,4)));
  cleanup();
}
