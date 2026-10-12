// Surface continuity, wall clipping and compact spray on the real demo GPU.
// Owns and closes Chrome for Testing; captures stay outside the repository.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-surface-review';
const port = Number(process.env.PORT || 8459), debug = port + 1000;
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
async function waterAlpha(softness, stretch) {
  return evaluate(`(async () => {
    const engine=__toy.liquid(),device=engine.device;
    // Canvas textures expire after presentation. Copy this exact draw before
    // yielding, rather than sampling a subsequently cleared canvas image.
    engine.renderCtx.configure({device,format:engine.renderFormat,alphaMode:'premultiplied',
      usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
    engine.setRenderParam('SURFACE_SOFT',${softness});
    if(${stretch !== undefined})engine.setRenderParam('DROPLET_STRETCH',${stretch || 0});
    engine.draw();
    const source=engine.renderCanvas,bytesPerRow=Math.ceil(source.width*4/256)*256;
    const buffer=device.createBuffer({size:bytesPerRow*source.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const encoder=device.createCommandEncoder();
      encoder.copyTextureToBuffer({texture:engine.renderCtx.getCurrentTexture()},
        {buffer,bytesPerRow},[source.width,source.height]);
      device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
      const rgba=new Uint8Array(buffer.getMappedRange());let fringe=0,area=0,left=source.width,right=-1,top=source.height,bottom=-1;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
        const alpha=rgba[y*bytesPerRow+x*4+3];area+=alpha/255;if(alpha>20 && alpha<190)fringe++;
        if(alpha>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      }
      return {fringe,area,width:Math.max(0,right-left+1),height:Math.max(0,bottom-top+1)};
    } finally {buffer.destroy();}
  })()`);
}
async function particleState() {
  return evaluate(`(async()=>{
    const engine=__toy.liquid(),device=engine.device,n=engine.uploadedCount;
    const buffer=device.createBuffer({size:n*36,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const encoder=device.createCommandEncoder();
      encoder.copyBufferToBuffer(engine.buf.pos,0,buffer,0,n*16);
      encoder.copyBufferToBuffer(engine.buf.aux,0,buffer,n*16,n*16);
      encoder.copyBufferToBuffer(engine.buf.flag,0,buffer,n*32,n*4);
      device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
      const hash=await crypto.subtle.digest('SHA-256',buffer.getMappedRange());
      return {hash:Array.from(new Uint8Array(hash)),clock:engine.simulationClock,count:__toy.stats().water};
    }finally{buffer.destroy();}
  })()`);
}
async function surfaceMask() {
  return evaluate(`(async()=>{
    const engine=__toy.liquid(),device=engine.device;
    engine.renderCtx.configure({device,format:engine.renderFormat,alphaMode:'premultiplied',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
    engine.draw();
    const w=engine.renderCanvas.width,h=engine.renderCanvas.height,stride=Math.ceil(w*4/256)*256;
    const buffer=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:engine.renderCtx.getCurrentTexture()},{buffer,bytesPerRow:stride},[w,h]);device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
      const wallGrid=__demoTest("Array.from(walls)"),world=__toy.world(),scale=engine.renderParamsHost[2];
      let coveredArea=0,wallPixels=0;
      const bytes=new Uint8Array(buffer.getMappedRange()),dry=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h),holes=[];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const alpha=bytes[y*stride+x*4+3];dry[y*w+x]=alpha<100;coveredArea+=alpha/255/(scale*scale);
        const c=Math.floor(((x+.5)/scale+engine.renderParamsHost[0])/world.tile),r=Math.floor(((y+.5)/scale+engine.renderParamsHost[1])/world.tile);
        if(alpha>=100&&c>=0&&r>=0&&c<world.cols&&r<world.rows&&wallGrid[r*world.cols+c])wallPixels++;
      }
      for(let start=0;start<dry.length;start++){
        if(!dry[start]||seen[start])continue;
        let head=0,tail=1,border=false;queue[0]=start;seen[start]=1;
        while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;
          if(x===0||y===0||x===w-1||y===h-1)border=true;
          for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&dry[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}
        }
        if(!border&&tail>4)holes.push(tail/(engine.renderParamsHost[2]**2));
      }
      return {coveredArea,wallPixels,holes:holes.length,holeArea:holes.reduce((a,b)=>a+b,0),largest:Math.max(0,...holes)};
    }finally{buffer.destroy();}
  })()`);
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
  const reports=[];
  for(const [scene,width,height,mobile] of [
    ['heron-air-smoke',1440,900,false],['heron-air-smoke',844,390,true],['falls',1440,900,false]
  ]) {
    await navigate(width,height,'?scene='+scene,mobile);
    if(scene==='heron-air-smoke'){
      for(let i=0;i<300;i++){
        if(await evaluate('!!__toy.machineState()?.ready && !__toy.stats().loading'))break;
        await sleep(100);
      }
      assert.ok(await evaluate('__toy.machineState()?.ready'),'The screenshot apparatus boots');
    }
    await sleep(4000);await evaluate('__toy.pause(true)');await sleep(100);
    await inside('drawLiquidToy()');
    assert.equal(!!await evaluate('__toy.liquid().volumeSplats'),false,'Scene retains its density and spray gates');
    assert.equal(await evaluate('__toy.liquid().renderParamsHost[22]'),2,'Scene retains overlapping kernels');
    const state=await particleState();
    await evaluate("__toy.liquid().setRenderParam('SURFACE_RSCALE',.9)");
    const previous=await surfaceMask();await inside('drawLiquidToy()');await screenshot(scene+'-'+width+'-before');
    await evaluate("__toy.liquid().setRenderParam('SURFACE_RSCALE',2)");
    const current=await surfaceMask();await inside('drawLiquidToy()');await screenshot(scene+'-'+width+'-after');
    assert.deepEqual(await particleState(),state,'Reconstruction does not move, accelerate, create or remove water');
    assert.equal(current.wallPixels,0,'Water stays outside the apparatus walls');
    if(scene==='heron-air-smoke'){
      assert.ok(previous.holeArea>100,'The previous renderer reproduces the torn pools');
      assert.ok(current.holeArea<previous.holeArea*.25,'At least 75 percent of the interior gap area disappears');
    }
    await evaluate("__toy.set('waterLook','pearl');__toy.set('waterLook','default')");
    await inside('drawLiquidToy()');
    assert.equal(!!await evaluate('__toy.liquid().volumeSplats'),false,'Changing water looks retains the density and spray gates');
    assert.equal(await evaluate('__toy.liquid().renderParamsHost[22]'),2,'Changing water looks restores surface support');
    reports.push({scene,width,height,previous,current});console.log('SURFACE',JSON.stringify(reports.at(-1)));
  }
  await evaluate("__toy.scene('blank');__toy.pause(true)");
  await inside("addLiquidParticle('water',worldW*.5,worldH*.5,360,0,0);liquidWGPU.update(1/60)");
  await evaluate('__toy.liquid().queue.onSubmittedWorkDone()');
  const state=await particleState(),drop=await waterAlpha(.25,0);
  const scale=await evaluate('__toy.liquid().renderParamsHost[2]');
  assert.ok(drop.area>0,'An isolated drop remains visible');
  assert.ok(drop.width/scale<3.5 && drop.height/scale<3.5,'Fast isolated drops remain compact');
  await evaluate("__toy.liquid().setRenderParam('DROPLETS',0)");
  const hidden=await waterAlpha(.25,0);
  assert.equal(hidden.area,0,'A lone particle never expands into a surface blob');
  assert.deepEqual(await particleState(),state,'Spray rendering leaves its velocity and mass unchanged');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(dump,'surface-report.json'),JSON.stringify({reports,drop,errors},null,2));
  console.log('PASS continuous water surfaces, wall clipping, unchanged physics and compact spray');
} finally { await cleanup(); }
