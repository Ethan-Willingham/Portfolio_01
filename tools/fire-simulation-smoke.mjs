// Reacting fire: actual GPU numerical kernels, material coupling, UI and frame cost.
// Run: node tools/fire-simulation-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';
import { checkFireKernels } from './fire-kernel-checks.mjs';
import { checkFireMaterials } from './fire-material-checks.mjs';
import { checkFireRendering } from './fire-render-checks.mjs';
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
      let src = data.toString();
      if(process.env.SLOW_FIRE_BOOT) src=src.replace('    hearthFirePrepare();',`    (function(){
        liquidWGPU.readyPromise=Promise.all([liquidWGPU.readyPromise,new Promise(r=>setTimeout(r,6500))]);
        var create=window.FireWGPU.create;
        window.FireWGPU.create=function(options){
          window.FireWGPU.create=create;var sim=create(options);
          sim.readyPromise=Promise.all([sim.readyPromise,new Promise(r=>setTimeout(r,3000))]).then(v=>v[0]);
          return sim;
        };
      })();
      hearthFirePrepare();`);
      const end = src.lastIndexOf('})();');
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
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.args.some(a=>typeof a.value==='string'&&/fallback|failed|timeout/i.test(a.value))) console.log('BROWSER',m.params.args.map(a=>a.value||a.description));
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

  console.log('FIRE INIT', await game('({available:window.__fire?.available,errors:window.__fire?.errors,waterReady:liquidWGPU?.available,waterLive:liquidWGPU?.simActive})'));
  check('WebGPU reacting fire compiled', await ev('!!window.__fire && __fire.available && !__fire.failed'));
  if(process.env.SLOW_FIRE_BOOT)check('delayed device startup keeps GPU fire instead of timing out to pixelated fallback',await ev('SluiceLoading.reports()[0].tasks.find(t=>t.id==="fire").state==="done"'));
  const kernelResults = await game('(' + checkFireKernels.toString() + ')(liquidWGPU.device)');
  for(const r of kernelResults) { console.log('KERNEL',r);check(r.label,r.pass); }
  const materialResults = await game('(' + checkFireMaterials.toString() + ')(liquidWGPU.device)');
  for(const r of materialResults){console.log('MATERIAL',r);check(r.label,r.pass);}
  const renderResults = await game('(' + checkFireRendering.toString() + ')(liquidWGPU.device)');
  for(const r of renderResults){console.log('RENDER',r);check(r.label,r.pass);}
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
  await game('hearthLightChunk(hearthBeds.boiler,hearthBeds.boiler.chunks[1])');
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
  await game('hearthReset();for(var y of [180,110]){var b=hearthAddChunk("boiler",160,y);b.angle=0;b.r=b.baseR=30;b.shape=[[-1,-.6],[1,-.6],[1,.6],[-1,.6]];hearthHullCache.delete(b);hearthMass(b);}var lower=hearthBeds.boiler.chunks[0];lower.fuel=lower.carbon=.08;lower.volatile=lower.moisture=0;');
  await run(0.5);
  const loaded=await game('({y:hearthBeds.boiler.chunks[1].y,kg:hearthBeds.boiler.chunks.reduce((n,b)=>n+b.dryKg,0)})');
  await run(8);
  const collapsed=await game('({fragments:hearthBeds.boiler.chunks.filter(b=>b.generation>0).length,y:hearthBeds.boiler.chunks.find(b=>b.id===2).y,kg:hearthBeds.boiler.chunks.reduce((n,b)=>n+b.dryKg,0)})');
  console.log('COLLAPSE',{loaded,collapsed});
  check('live GPU fuel fractures under weight and the supported coal drops',collapsed.fragments>=2 && collapsed.y>loaded.y+8 && Math.abs(collapsed.kg-loaded.kg)<1e-10);
  await screenshot('collapsed-coal');
  await game('hearthFireGPU.reset();for(var b of hearthBeds.boiler.chunks){b.fuel=b.volatile=b.carbon=0;b.ash=true;}');await run(2);
  check('live burnout leaves conserved mineral grains',await game(`Math.abs(hearthAshMass(hearthBeds.boiler)-${loaded.kg*.16})<1e-10 && hearthBeds.boiler.ash.length>4`));
  await screenshot('mineral-ash');
  await game('hearthReset();for(var x of [95,160,225])hearthAddChunk("boiler",x,175)');await run(1);
  await game('for(var b of hearthBeds.boiler.chunks)hearthLightChunk(hearthBeds.boiler,b)');await run(8);await screenshot('full-fire');
  console.log('FULL FIRE',await stats());
  async function flameVisibility(){return game(`(function(){
    var L=hearthRoomLayout();render();var src=hearthFireGPU.canvas,c=document.createElement('canvas');c.width=src.width;c.height=src.height;
    var ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);var d=ctx.getImageData(0,0,c.width,c.height).data;
    var count=0,above=0,highest=HEARTH_FLOOR;
    for(var y=0;y<c.height;y++)for(var x=0;x<c.width;x++){var o=(y*c.width+x)*4;
      if(d[o]>140&&d[o+1]>45&&d[o+3]>100){count++;var worldY=HEARTH_TOP+y*HEARTH_HEIGHT/c.height;if(worldY<90)above++;highest=Math.min(highest,worldY);}}
    return {pixels:count,aboveBed:above,highest:highest,area:count/(c.width*c.height),lit:hearthBeds.boiler.chunks.filter(b=>b.lit).length};})()`);}
  // A naturally lit bed must show flames above the fuel, not only edge light.
  await game('hearthReset();for(var row=0;row<2;row++)for(var x of [65,125,185,245])hearthAddChunk("boiler",x,175-row*55)');
  await run(2);await game('hearthIgnite("boiler")');await run(12);await screenshot('charcoal-bed-12');
  const ignitionVisibility=await flameVisibility();
  await run(18);await screenshot('charcoal-bed-30');
  const visibility={ignition:ignitionVisibility,sustained:await flameVisibility()};
  console.log('FLAME VISIBILITY',visibility);
  check('one ignition develops visible flames above an eight-piece bed',visibility.ignition.aboveBed>200&&visibility.ignition.area>.015&&visibility.sustained.area>.015&&visibility.sustained.lit>=3);
  for (const screen of [{width:1920,height:1080,deviceScaleFactor:2},{width:844,height:390,deviceScaleFactor:1}]) {
    await send('Emulation.setDeviceMetricsOverride',{...screen,mobile:false});
    await game('resize();render()');
    const layout = await game('(function(){var L=hearthRoomLayout(),r=hearthFireGPU.canvas.getBoundingClientRect();return {box:L.box,width:L.w,height:L.h,overlay:{x:r.x,y:r.y,w:r.width,h:r.height},controls:[L.bin,L.pump,L.action,L.ash]};})()');
    check('bounded wide chamber and accessible controls at '+screen.width,layout.box.w<=580.01 && Math.abs(layout.box.w/layout.box.h-416/320)<0.001 && layout.controls.every(r=>r.x>=0 && r.y>=0 && r.x+r.w<=layout.width && r.y+r.h<=layout.height && r.h>=44));
    check('fire canvas tracks resized chamber at '+screen.width,Math.abs(layout.overlay.w-layout.box.w)<1 && Math.abs(layout.overlay.h-layout.box.h)<1);
    await screenshot('fire-'+screen.width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await game('resize();render()');
  await game('hearthReset();for(var i=0;i<32;i++)hearthAddChunk("boiler",40+i%6*48,170-Math.floor(i/6)*42)');
  await run(3);await game('hearthIgnite("boiler")');await run(8);await screenshot('full-charcoal-bed');
  check('all 32 fuel pieces fit and reach the GPU',await game('hearthBeds.boiler.chunks.length===32 && hearthBeds.boiler.chunks.every(b=>Number.isFinite(b.surfaceKelvin)) && hearthFireGPU.available'));
  const cost=await game('(async function(){var cpu=[],wall=[],device=liquidWGPU.device;for(var i=0;i<120;i++){var t=performance.now();bathGuestTick(1/60);render();cpu.push(hearthFireGPU.cpuMs);await device.queue.onSubmittedWorkDone();wall.push(performance.now()-t);}function summary(a){a.sort(function(a,b){return a-b});return {avg:a.reduce(function(a,b){return a+b},0)/a.length,p95:a[Math.floor(a.length*.95)]};}return {fireSubmissionMs:summary(cpu),fireRoomAndQueueMs:summary(wall),buffers:hearthFireGPU.bufferBytes};})()');
  console.log('PERFORMANCE',cost);check('fire CPU submissions stay within the frame budget',cost.fireSubmissionMs.p95<3);
  await game('bathMode=false;bathEnter()');await sleep(600);
  await game('devMode=true;hearthRoomAction("kit");hearthRoomAction("guest");devMode=false;lastTime=performance.now();gameRafId=requestAnimationFrame(loop)');
  await sleep(21000);
  const fullGame=await game('({cpu:perfFrameStats(),interval:perfIntervalStats(),fireSteps:hearthFireGPU.steps,water:liquidWGPU.uploadedCount,bathWater:bathWater,smoke:USE_WEBGPU_SMOKE?"WebGPU":"WebGL",slime:jelloWGPU&&jelloWGPU.available})');
  console.log('FULL GAME',fullGame);check('full game runs water, steam and a guest alongside fire',fullGame.water>5000 && fullGame.bathWater>4000 && fullGame.interval.avg<25);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;render()');await screenshot('bath-fire');
  const bowlContact=await game(`(async function(){
    var gpu=liquidWGPU,n=gpu.uploadedCount,device=gpu.device;
    var rb=device.createBuffer({size:n*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    var enc=device.createCommandEncoder();enc.copyBufferToBuffer(gpu.buf.pos,0,rb,0,n*16);device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);var positions=new Float32Array(rb.getMappedRange());
    var c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),inside=0,nearWall=0,penetrating=0,worst=Infinity;
    for(var i=0;i<n;i++){var x=positions[i*4],y=positions[i*4+1];if(x<c.x0+4||x>c.x1-4||y<c.y0||y>c.y0+c.D+32)continue;
      inside++;var slope=bathCurveSlope(c,x),gap=(c.y0+c.depthAt(x)-y)/Math.sqrt(1+slope*slope);
      worst=Math.min(worst,gap);if(gap<2.5)penetrating++;if(gap<8)nearWall++;
    }rb.unmap();rb.destroy();return {inside:inside,nearWall:nearWall,penetrating:penetrating,worst:worst};
  })()`);
  console.log('BOWL CONTACT',bowlContact);
  check('live GPU water meets the curved liner without entering the hidden tile cavity',bowlContact.inside>4000&&bowlContact.nearWall>100&&bowlContact.penetrating===0);
  await game('gamePaused=true;render()');check('pause hides the fire layer',await ev('__fire.canvas.style.display==="none"'));
  await game('gamePaused=false;bathMode=false;render()');check('leaving the bath hides the fire layer',await ev('__fire.canvas.style.display==="none"'));
  await game('bathMode=true;hearthSetView("boiler");render()');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await game('isMobile=true;resize();hearthFirePrepare()');
  check('mobile uses the smaller bounded grid',await ev('__fire.available && __fire.width===144'));
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
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({kernels:kernelResults,materials:materialResults,rendering:renderResults,visibility,performance:cost,fullGame:fullGame,bowl:bowlContact},null,2));
} finally {
  if (errors.length) console.error(JSON.stringify(errors.slice(0,4)));
  cleanup();
}
