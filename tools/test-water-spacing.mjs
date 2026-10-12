// Real particle-spacing regression. Rendering stays at its original width.
// Owns and closes Chrome for Testing; captures stay outside the repository.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-spacing-review';
const port = Number(process.env.PORT || 8459), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root,'js/liquid-wgpu.js')) {
      data=data.toString().replace('  window.LiquidWGPU = { create: create, stage: STAGE, last: null };',
        '  window.__spacingNative = { run:runDeclump, grid:buildGrid, clear:denseClearAll, bounds:computeGridBounds, terrain:computeTerrainBounds, uploadTerrain:uploadTerrainMask };\n  window.LiquidWGPU = { create: create, stage: STAGE, last: null };');
    }
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
      window.__demoTest = function(source) { return eval(source); };
      userPaused = true; syncRunning();
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
async function navigate(width, height, query = '?scene=falls', mobile = false, deviceScaleFactor = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!window.__toy && __toy.stats().waterState !== "booting"')) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}
async function distribution(){
 return evaluate(`(async()=>{
  const L=__toy.liquid(),n=L.uploadedCount,device=L.device,b=device.createBuffer({size:n*52,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   const e=device.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);e.copyBufferToBuffer(L.buf.aux,0,b,n*16,n*16);e.copyBufferToBuffer(L.buf.affine,0,b,n*32,n*16);e.copyBufferToBuffer(L.buf.flag,0,b,n*48,n*4);
   device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
   const a=b.getMappedRange(),p=new Float32Array(a,0,n*4),aux=new Float32Array(a,n*16,n*4),C=new Float32Array(a,n*32,n*4),flags=new Uint32Array(a,n*48,n),buckets=new Map(),nearest=[],densities=[],means=[],hist=new Array(10).fill(0);
   let finite=true,count=0,near=.55,closePairs=0,coincident=0,sumV=0,sumC=0,momentumX=0,momentumY=0,energy=0;
   for(let i=0;i<n;i++){
    if(flags[i]&160 || (flags[i]&3)!==0)continue;
    const x=p[i*4],y=p[i*4+1],vx=p[i*4+2],vy=p[i*4+3];
    finite=finite&&[x,y,vx,vy,...C.slice(i*4,i*4+4)].every(Number.isFinite);count++;densities.push(aux[i*4]/4);sumV+=Math.hypot(vx,vy);momentumX+=vx;momentumY+=vy;energy+=.5*(vx*vx+vy*vy);sumC+=Math.hypot(...C.slice(i*4,i*4+4));
    const key=Math.floor(x/2.5)+','+Math.floor(y/2.5);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
   }
   for(const list of buckets.values())for(const i of list){
    const x=p[i*4],y=p[i*4+1],cx=Math.floor(x/2.5),cy=Math.floor(y/2.5);let d2=Infinity;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of buckets.get((cx+dx)+','+(cy+dy))||[]){if(i===j)continue;
     const xx=p[j*4]-x,yy=p[j*4+1]-y,dd=xx*xx+yy*yy;d2=Math.min(d2,dd);if(j>i&&dd<near*near)closePairs++;if(j>i&&dd<.01*.01)coincident++;
    }
    nearest.push(Math.sqrt(d2));hist[Math.min(9,Math.floor(Math.sqrt(d2)/.2))]++;
   }
   nearest.sort((a,b)=>a-b);densities.sort((a,b)=>a-b);
   return {clock:L.simulationClock,count,finite,closePairs,coincident,closeFraction:hist.slice(0,3).reduce((a,b)=>a+b,0)/count,nearest:{p05:nearest[Math.floor(nearest.length*.05)],p50:nearest[Math.floor(nearest.length*.5)],p95:nearest[Math.floor(nearest.length*.95)]},density:{p05:densities[Math.floor(count*.05)],p50:densities[Math.floor(count*.5)],p95:densities[Math.floor(count*.95)]},meanSpeed:sumV/count,meanAffine:sumC/count,momentumX,momentumY,energy,hist};
  }finally{b.destroy();}
 })()`);
}
async function fixture(kind, enabled) {
  await inside(`(()=>{
    liquidWGPU.particleRegularization=${enabled};clearWorldAll();
    if(${JSON.stringify(kind)}==='wall'||${JSON.stringify(kind)}==='corner')wallRect(88,88,96,208);
    if(${JSON.stringify(kind)}==='floor'||${JSON.stringify(kind)}==='corner')wallRect(88,192,208,200);
    const r=1.0625, pitch=${JSON.stringify(kind)}==='uniform'?1.25:.4;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const px=(${JSON.stringify(kind)}==='wall'||${JSON.stringify(kind)}==='corner'?96+r+.001:120)+x*pitch;
      const py=(${JSON.stringify(kind)}==='floor'||${JSON.stringify(kind)}==='corner'?192-r-.001-y*pitch:120+y*pitch);
      const i=addLiquidParticle('water',px,py,27,-11,0);liquidG00[i]=.01;liquidG11[i]=-.02;
    }
    liquidWGPU.uploadParticles();__spacingNative.bounds(liquidWGPU,liquidCount);
    __spacingNative.terrain(liquidWGPU,liquidCount);__spacingNative.uploadTerrain(liquidWGPU);
    if(${JSON.stringify(kind)}==='inactive'){
      const flags=new Uint32Array(64);flags.fill(32,60,62);flags.fill(128,62,64);
      liquidWGPU.queue.writeBuffer(liquidWGPU.buf.flag,0,flags);
    }
    __spacingNative.clear(liquidWGPU);__spacingNative.grid(liquidWGPU);
  })()`);
}
async function buffers() {
  return evaluate(`(async()=>{
    const L=__toy.liquid(),n=L.uploadedCount,d=L.device,b=d.createBuffer({size:n*52,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);e.copyBufferToBuffer(L.buf.aux,0,b,n*16,n*16);e.copyBufferToBuffer(L.buf.affine,0,b,n*32,n*16);e.copyBufferToBuffer(L.buf.flag,0,b,n*48,n*4);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
      const a=b.getMappedRange();return {pos:Array.from(new Float32Array(a,0,n*4)),aux:Array.from(new Float32Array(a,n*16,n*4)),affine:Array.from(new Float32Array(a,n*32,n*4)),flags:Array.from(new Uint32Array(a,n*48,n)),clock:L.simulationClock};
    } finally {b.destroy();}
  })()`);
}
async function relax(iterations) {
  for(let i=0;i<iterations;i++)await evaluate('__spacingNative.grid(__toy.liquid(),true);__spacingNative.run(__toy.liquid());__toy.liquid().queue.onSubmittedWorkDone()');
}
function center(p){const n=p.length/4;return [p.filter((_,i)=>i%4===0).reduce((a,b)=>a+b,0)/n,p.filter((_,i)=>i%4===1).reduce((a,b)=>a+b,0)/n];}
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
  const reports=[];
  let randomHook;
  if(process.env.UNIT_ONLY!=='1')for(const [scene,width,height,mobile] of [['heron-air-smoke',1440,900,false],['heron-air-smoke',844,390,true],['falls',1440,900,false]]) {
    const pair=[];
    for(const enabled of [false,true]) {
      if(randomHook)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:randomHook});
      randomHook=(await send('Page.addScriptToEvaluateOnNewDocument',{source:'let spacingSeed=17;Math.random=()=>{spacingSeed=(Math.imul(spacingSeed,1664525)+1013904223)>>>0;return spacingSeed/4294967296;};'})).identifier;
      await navigate(width,height,'?scene='+scene+'&paused=1',mobile);
      for(let i=0;i<300;i++){if(!await evaluate('__toy.stats().loading'))break;await sleep(100);}
      await evaluate('__toy.pause(true);__toy.liquid().particleRegularization='+enabled);
      await evaluate("__toy.liquid().setRenderParam('SURFACE_FROM_POSITIONS',0)");
      await inside('drawLiquidToy()');
      assert.equal(await evaluate('__toy.liquid().renderParamsHost[22]'),Math.fround(.9),'The original compact rendering width is used');
      const captures=[await distribution()];
      for(const frames of [60,180,360]) {
        const perf=await evaluate('__toy.liquid().bench('+frames+',1/60)');
        const row=await distribution();row.msPerFrame=perf.msPerFrame;captures.push(row);
        assert.equal(row.count,captures[0].count,'Every real parcel is conserved');assert(row.finite,'Finite position, velocity and affine state');
      }
      await inside('drawLiquidToy()');await screenshot(scene+'-'+width+(enabled?'-corrected':'-reference'));
      pair.push({enabled,captures});console.log('DISTRIBUTION',scene,width,enabled,JSON.stringify(captures.at(-1)));
    }
    const previous=pair[0].captures.at(-1),current=pair[1].captures.at(-1);
    assert(previous.closeFraction>.3,'The reference reproduces real particle clumping');
    assert(current.closeFraction<.04,'Fewer than four percent of real parcels remain closer than half their rest spacing');
    assert(current.nearest.p50>1,'The median actual spacing recovers without thicker drawing');
    assert(current.closePairs<previous.closePairs*.1,'At least ninety percent of close pairs are removed');
    reports.push({scene,width,height,pair});
  }
  // Isolate the positional solve from gravity, pressure, G2P and collision.
  await navigate(1440,900,'?scene=heron-air-smoke&paused=1');
  for(let i=0;i<300;i++){if(!await evaluate('__toy.stats().loading'))break;await sleep(100);}
  await evaluate('__toy.pause(true)');
  const isolated=[];
  for(const kind of ['uniform','cloud','wall','floor','corner','inactive']) {
    await fixture(kind,false);const original=await buffers();await relax(20);assert.deepEqual(await buffers(),original,'The old correction leaves this below-threshold fixture alone: '+kind);
    await fixture(kind,true);const before=await buffers(),initial=await distribution();await relax(kind==='corner'?60:20);const after=await buffers(),result=await distribution();
    assert.deepEqual(after.aux,before.aux);assert.deepEqual(after.affine,before.affine);assert.deepEqual(after.flags,before.flags);assert.equal(after.clock,before.clock);
    assert.deepEqual(after.pos.filter((_,i)=>i%4>=2),before.pos.filter((_,i)=>i%4>=2),'Spacing preserves carried momentum and kinetic energy');
    if(kind==='uniform')assert.deepEqual(after,before,'Uniform translation is exactly preserved');
    else assert(result.closePairs<initial.closePairs*.1,'The actual compressed cloud separates: '+JSON.stringify({kind,initial:initial.closePairs,remaining:result.closePairs}));
    if(kind==='cloud')assert(center(before.pos).every((value,i)=>Math.abs(value-center(after.pos)[i])<.001),'Symmetric separation preserves the center of mass');
    if(kind==='wall'||kind==='corner')assert(after.pos.filter((_,i)=>i%4===0).every(x=>x>=96+1.0625),'No correction crosses the wall');
    if(kind==='floor'||kind==='corner')assert(after.pos.filter((_,i)=>i%4===1).every(y=>y<=192-1.0625),'No correction crosses the floor');
    if(kind==='inactive')assert.deepEqual(after.pos.slice(60*4),before.pos.slice(60*4),'Frozen and parked parcels never move');
    isolated.push({kind,initial,result});
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(dump,'spacing-report.json'),JSON.stringify({reports,isolated,errors},null,2));
  console.log('PASS physical water distribution, original draw width, parcel conservation, unchanged isolated momentum and wall/floor containment');
} finally { await cleanup(); }
