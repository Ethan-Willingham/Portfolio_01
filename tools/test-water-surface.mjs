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
  console.log('BOOT',width,height,query);
}
async function particleState() {
  return evaluate(`(async()=>{
    const e=__toy.liquid(),sources=[e.buf.pos,e.buf.aux,e.buf.flag,e.buf.affine];
    const native=e.toyNativeExtension;
    if(native?.ledgerBuffer)sources.push(native.ledgerBuffer,native.slotsBuffer);
    for(const b of Object.values(e.pressureModel?.buffers||{}))if(b&&(b.usage&GPUBufferUsage.COPY_SRC)&&!sources.includes(b))sources.push(b);
    for(const b of Object.values(e.toyMembrane?.buffers||{}))if(b&&(b.usage&GPUBufferUsage.COPY_SRC)&&!sources.includes(b))sources.push(b);
    const sizes=sources.map((b,i)=>i===2?Math.max(4,e.uploadedCount*4):i<4?Math.max(16,e.uploadedCount*16):b.size);
    const total=sizes.reduce((a,b)=>a+b,0),read=e.device.createBuffer({size:total,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const encoder=e.device.createCommandEncoder();let offset=0;
      sources.forEach((b,i)=>{encoder.copyBufferToBuffer(b,0,read,offset,sizes[i]);offset+=sizes[i];});
      e.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      const hash=await crypto.subtle.digest('SHA-256',read.getMappedRange());
      return {hash:Array.from(new Uint8Array(hash)),clock:e.simulationClock,count:e.uploadedCount};
    }finally{read.destroy();}
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
  async function ready(scene) {
    const deadline=Date.now()+45000;
    while(!await evaluate(`!!window.__toy && __toy.stats().scene===${JSON.stringify(scene)} && __toy.stats().waterState==='on' && !__toy.stats().loading && __demoTest('toyBootReady')`)){
      if(Date.now()>deadline)throw Error('Scene did not settle: '+scene);
      await sleep(60);
    }
    await evaluate('__toy.pause(true);__toy.set("waterLook","default");__toy.liquid().device.addEventListener("uncapturederror",e=>console.error(e.error.message))');
    assert(await evaluate('__toy.liquid().surfReady && !!__toy.liquid().surfSupportPipeline && !!__toy.liquid().surfReconstructPipeline'),'Shared surface pipeline is ready: '+scene);
  }
  await navigate(1280,720,'?scene=blank');await ready('blank');
  await sleep(100);await evaluate('__toy.liquid().queue.onSubmittedWorkDone()');
  const fixtures=await evaluate(`(async()=>{
    const e=__toy.liquid(),d=e.device,results=[],scale=4,w=512,h=384,stride=w*4;
    e.renderCtx.configure({device:d,format:e.renderFormat,alphaMode:'premultiplied',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const view={canvasW:w,canvasH:h,camX:0,camY:0,dpws:scale,viewW:128,viewH:96};
    const lattice=(x0,y0,x1,y1,pitch=1.25,omit=()=>false)=>{
      const p=[];for(let y=y0;y<=y1;y+=pitch)for(let x=x0;x<=x1;x+=pitch)if(!omit(x,y))p.push([x,y,0]);return p;
    };
    const gasBuffers=[];
    function gas(x,y,r){
      const make=(data)=>{const b=d.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});e.queue.writeBuffer(b,0,data);gasBuffers.push(b);return b;};
      const ledger=new Int32Array(32);ledger[4]=1;
      return {beforeSubstep:()=>{},buffers:{position:make(new Float32Array([x,y,0,0])),material:make(new Float32Array([10,r,1,0])),ledger:make(ledger)}};
    }
    async function render(points,{density=.4,grid=0,drops=0,legacy=false,air=null,soft=.25}={}){
      const n=points.length,p=new Float32Array(Math.max(1,n)*4),a=new Float32Array(p.length),f=new Uint32Array(Math.max(1,n));
      points.forEach((v,i)=>{p.set([v[0],v[1],v[3]||0,v[4]||0],i*4);a.set([density,0,v[0],v[1]],i*4);f[i]=v[2];});
      e.queue.writeBuffer(e.buf.pos,0,p);e.queue.writeBuffer(e.buf.aux,0,a);e.queue.writeBuffer(e.buf.flag,0,f);e.queue.writeBuffer(e.buf.affine,0,new Float32Array(p.length));
      e.queue.writeBuffer(e.buf.cellCount,0,new Uint32Array(e.buf.cellCount.size/4).fill(grid));
      e.uploadedCount=n;e.setToyMembrane(air);
      e.setRenderParam('SURFACE_FROM_POSITIONS',legacy?0:1);e.setRenderParam('SURFACE_RSCALE',.9);e.setRenderParam('SURFACE_SOFT',soft);e.setRenderParam('DROPLETS',drops);
      e.draw({...view,count:n});
      const b=d.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      try{const enc=d.createCommandEncoder();enc.copyTextureToBuffer({texture:e.renderCtx.getCurrentTexture()},{buffer:b,bytesPerRow:stride},[w,h]);e.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);return new Uint8Array(b.getMappedRange()).slice();}finally{b.destroy();}
    }
    function region(bytes,x0,y0,x1,y1){
      let min=255,max=0,wet=0,area=0,total=0;
      for(let y=Math.ceil(y0*scale);y<y1*scale;y++)for(let x=Math.ceil(x0*scale);x<x1*scale;x++){
        const a=bytes[y*stride+x*4+3];min=Math.min(min,a);max=Math.max(max,a);wet+=a>64;area+=a/255;total++;
      }return {min,max,wet,area:area/(scale*scale),total};
    }
    function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
    function png(bytes){const c=document.createElement('canvas');c.width=w;c.height=h;const rgba=bytes.slice();if(e.renderFormat.startsWith('bgra'))for(let i=0;i<rgba.length;i+=4){const r=rgba[i];rgba[i]=rgba[i+2];rgba[i+2]=r;}c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),w,h),0,0);return c.toDataURL('image/png').split(',')[1];}
    const body=lattice(16.125,16.125,112.125,80.125,1.25,(x,y)=>Math.abs(x-64.25)<1.9&&Math.abs(y-48.25)<1.9);
    const old=await render(body,{legacy:true}),current=await render(body),dense=await render(body,{density:4,grid:50});
    results.push({name:'sampled-body',previous:region(old,60,44,68,52),current:region(current,60,44,68,52),densityIndependent:same(current,dense),png:png(current)});
    const row=lattice(16.125,40.125,112.125,40.125);
    results.push({name:'single-shallow-layer',interior:region(await render(row),20,39.9,108,40.4)});
    const pipe=lattice(60.125,12.125,63.875,84.125);
    results.push({name:'narrow-pipe',interior:region(await render(pipe),60.6,17,63.4,78)});
    for(const gap of [4.5,6]){
      const groups=lattice(36.125,38.125,38.625,40.625).concat(lattice(38.625+gap,38.125,41.125+gap,40.625));
      results.push({name:'separate-dense-splashes',gap,center:region(await render(groups,{drops:1}),38.625+gap/2-.05,39.25,38.625+gap/2+.20,39.50)});
    }
    const pair=[[50.125,40.125,0,360,0],[52.725,40.125,0,-360,0]];
    results.push({name:'separate-pair',center:region(await render(pair,{drops:1}),51.35,40,51.55,40.25)});
    for(const radius of [3,4]){
      const ring=lattice(30.125,20.125,90.125,65.125,1.25,(x,y)=>Math.hypot(x-60.125,y-40.125)<radius);
      results.push({name:'real-empty-cavity',radius,center:region(await render(ring),59.95,39.95,60.3,40.3)});
    }
    const lone=[[60.125,40.125,0,360,0]];
    for(const soft of [.25,1.1]){
      const hidden=await render(lone,{soft}),visible=await render(lone,{soft,drops:1});
      results.push({name:'compact-drop',soft,body:region(hidden,55,35,66,46),drop:region(visible,55,35,66,46)});
    }
    const mixed=body.concat(lattice(16.125,82.125,112.125,83.375,1.25).map(p=>[p[0],p[1],65]));
    const mixedFrame=await render(mixed);
    results.push({name:'water-with-grain-only-grid',interior:region(mixedFrame,20,20,45,65),waterRegionSame:JSON.stringify(region(current,20,20,45,65))===JSON.stringify(region(mixedFrame,20,20,45,65))});
    for(const radius of [2,2.876]){
      const ring=lattice(30.125,20.125,90.125,65.125,1.25,(x,y)=>Math.hypot(x-60.125,y-40.125)<radius);
      const air=gas(60.125,40.125,radius),without=await render(ring),withAir=await render(ring,{air,drops:1});
      results.push({name:'resolved-small-gas',radius,before:region(without,60,40,60.25,40.25),center:region(withAir,60,40,60.25,40.25),water:region(withAir,40,25,50,55),png:png(withAir)});
    }
    e.setToyMembrane(null);for(const b of gasBuffers)b.destroy();
    // Wall fixtures use the host's real collision terrain, not a painted mask.
    __demoTest("clearWorldAll();wallRect(8,64,120,72);wallRect(0,16,16,72);addLiquidParticle('water',50,50,0,0,0);liquidWGPU.update(1/60)");
    await e.queue.onSubmittedWorkDone();
    const pool=lattice(17.125,20.125,112.125,62.625),floorFrame=await render(pool);
    results.push({name:'floor-and-wall',floor:region(floorFrame,25,63,105,63.5),wall:region(floorFrame,16.25,25,16.75,55),solid:region(floorFrame,25,66.5,105,68),png:png(floorFrame)});
    for(const [x,y] of [[60.125,60.125],[19.125,40.125]]){
      const cavity=lattice(17.125,20.125,112.125,62.625,1.25,(px,py)=>Math.hypot(px-x,py-y)<3);
      results.push({name:'wall-adjacent-cavity',center:region(await render(cavity),x-.1,y-.1,x+.15,y+.15)});
    }
    e.setRenderParam('DROPLETS',1);e.setRenderParam('SURFACE_SOFT',.25);
    return results;
  })()`);
  fs.writeFileSync(path.join(dump,'fixtures.json'),JSON.stringify(fixtures.map(({png,...f})=>f),null,2));
  for(const f of fixtures){
    if(f.png){fs.writeFileSync(path.join(dump,f.name+(f.radius||'')+'.png'),Buffer.from(f.png,'base64'));delete f.png;}
    if(f.name==='sampled-body'){assert(f.previous.wet<f.previous.total*.1,'Stored low density reproduces the drawing holes');assert(f.current.min>190,'Supported body closes the small sampling hole');assert(f.densityIndependent,'Neither pressure density nor the simulation count grid changes reconstructed water');}
    if(['single-shallow-layer','narrow-pipe','water-with-grain-only-grid'].includes(f.name))assert(f.interior.min>190,f.name+' stays filled');
    if(['separate-dense-splashes','separate-pair','real-empty-cavity','resolved-small-gas','wall-adjacent-cavity'].includes(f.name))assert.equal(f.center.max,0,f.name+' stays air');
    if(f.name==='floor-and-wall'){assert(f.floor.min>190&&f.wall.min>190,'Supported water reaches its floor and wall');assert.equal(f.solid.max,0,'The kernel cannot paint inside a solid wall');}
    if(f.name==='compact-drop'){assert.equal(f.body.max,0,'One particle never becomes a body, even in Pearl');assert(f.drop.area>0&&f.drop.area<5,'Moving spray stays compact');}
    if(f.name==='water-with-grain-only-grid')assert(f.waterRegionSame,'Adding grains cannot shrink water');
    if(f.name==='resolved-small-gas'){if(f.radius===2)assert(f.before.max>100,'The mask protects a bubble smaller than surface sampling');assert(f.water.min>190,'Masking a real bubble preserves surrounding water');}
  }
  console.log('FIXTURES',JSON.stringify(fixtures));
  const reports=[];
  // Every public menu scene is actually constructed, advanced and drawn.
  const scenes=await evaluate("Array.from(new Set(['cup','siphon','heron','falls','zerog','chimney','rig','spa','blank'].concat(WSSMachineRegistry.list().map(e=>e.id))))");
  const mobile=['self-flushing-cup','heron-air-smoke','thumb-straw','air-hose','material-oil-jar','material-sand-jar','melting-ice','water-balloons','douse-fire','slime-sauna','falls','zerog'];
  const cases=process.env.FIXTURES_ONLY==='1'?[]:scenes.map(scene=>[scene,1280,720,false,1]).concat(mobile.map(scene=>[scene,844,390,true,2]));
  for(const [scene,width,height,isMobile,dpr] of cases){
    await navigate(width,height,'?scene='+scene+'&paused=1',isMobile,dpr);await ready(scene);
    for(let i=0;i<12;i++){await inside('frame(lastT ? lastT+1000/60 : 1000/60);stopLoop();');await evaluate('__toy.liquid().queue.onSubmittedWorkDone()');}
    await sleep(60);await inside('drawLiquidToy()');
    assert(await evaluate('__toy.liquid().surfaceFromPositions'),'Every scene retains position reconstruction: '+scene);
    assert.equal(await evaluate('__toy.liquid().surfaceGapBridge'),0,'Every scene keeps detached gaps: '+scene);
    assert.equal(await evaluate('__toy.liquid().dropletStretch'),0,'Every scene keeps compact spray: '+scene);
    assert.equal(!!await evaluate('__toy.liquid().volumeSplats'),false,'No family overrides parcel reconstruction: '+scene);
    const state=await particleState(),mask=await surfaceMask();
    assert.deepEqual(await particleState(),state,'Drawing leaves position, velocity, affine, pressure, material and inventory buffers unchanged: '+scene);
    assert.equal(mask.wallPixels,0,'Water does not paint solid collision walls: '+scene);
    const stats=await evaluate('__toy.stats()');
    reports.push({scene,width,height,dpr,water:stats.water,mask});
    fs.writeFileSync(path.join(dump,'surface-report.json'),JSON.stringify({fixtures,scenes:scenes.length,reports,errors},null,2));
    if(mobile.includes(scene))await screenshot(scene+'-'+width);
    assert.equal(errors.length,0,scene+': '+JSON.stringify(errors));
    console.log('SCENE',reports.length+'/'+cases.length,scene,width,stats.water,JSON.stringify(mask));
  }
  // Palette switches and fullscreen-sized canvases keep the same body/spray path.
  await navigate(1920,1080,'?scene=self-flushing-cup&paused=1',false,2);await ready('self-flushing-cup');
  for(const look of ['default','rainbow','pearl','abyss','toxic','wine','chrome','candy']){
    await evaluate(`__toy.set('waterLook',${JSON.stringify(look)})`);await inside('drawLiquidToy()');
    assert(await evaluate('__toy.liquid().surfaceFromPositions'),'Appearance retains reconstruction: '+look);
    assert.equal(await evaluate('__toy.liquid().renderParamsHost[22]'),Math.fround(.9),'Appearance retains bounded support: '+look);
    assert.equal(errors.length,0,look+': '+JSON.stringify(errors));
  }
  fs.writeFileSync(path.join(dump,'surface-report.json'),JSON.stringify({fixtures,scenes:scenes.length,reports,errors},null,2));
  console.log('PASS',cases.length?scenes.length+' public scenes and landscape mobile families':'frozen surface fixtures','sampled bodies, genuine cavities, resolved bubbles, separate spray and unchanged physics');
} finally { await cleanup(); }
