// Actual WebGPU regression for natural entrained air and the Heron fountain.
// Owns and closes Chrome for Testing; captures stay outside the repository.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-entrained-air-review';
const port = Number(process.env.PORT || 8469), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const sourcePaths=['archive/water-smoke-slime/water-smoke-slime.html','js/wss-bubbles.js','js/water-machines-scenes.js','js/water-smoke-slime.js','js/liquid-air-wgpu.js','js/liquid-wgpu.js'];
const frozen=new Map(sourcePaths.map(p=>[path.join(root,p),fs.readFileSync(path.join(root,p))]));
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(frozen.get(path.join(root,p))).digest('hex')]));
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = frozen.get(file) || fs.readFileSync(file);
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
  const priorOrigin=await evaluate('performance.timeOrigin');
  query+=(query.includes('?')?'&':'?')+'testLoad='+sequence;
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate(`performance.timeOrigin!==${priorOrigin} && !!window.__toy && !__toy.stats().loading && __toy.stats().waterState !== 'booting'`)) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}

// Prescribed gas and carrier fields isolate actual GPU transfer, slip, inventory
// and wall contact. Full native Heron playback follows these component checks.
async function componentFixture(kind) {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}}),queue=device.queue;
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const width=32,height=32,count=width*height,dx=5,n=64,scale=1024,allocated=[];
  function buffer(size){const b=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});allocated.push(b);return b;}
  const cells=new ArrayBuffer(count*32),cf=new Float32Array(cells),ci=new Uint32Array(cells),labels=new Uint32Array(count*2);
  labels.fill(0xffffffff);for(let c=0;c<count;c++){cf[c*8]=1;ci[c*8+3]=1;}
  const history=new ArrayBuffer(count*32),hf=new Float32Array(history),hi=new Int32Array(history),geometry=new Float32Array(count*8),transport=new Float32Array(count*12);
  const root=(kind==='expansion-corner'?18:20)*width+(['partial-wall','expansion-wall','expansion-corner'].includes(kind)?18:16),area=kind==='large'?225:25,amount=area*scale;
  for(let y=0;y<(kind==='large'?3:1);y++)for(let x=0;x<(kind==='large'?3:1);x++){
    const c=root+y*width+x;cf[c*8]=0;ci[c*8+3]=2;labels[c*2]=kind==='atmosphere'?0:root+1;
  }
  hi[root*8+2]=amount;hi[root*8+3]=amount;hf[root*8+4]=area;hi[root*8+5]=root+1;
  if(kind==='vapor')hi[root*8+6]=1;
  if(kind==='compressed')hf[root*8]=100000;
  if(kind==='ceiling'||kind==='expansion-corner')for(let x=0;x<width;x++)geometry[(16*width+x)*8]=1;
  const vx=kind==='sweep-wall'?1200:kind==='advect'?12:0,vy=kind==='advect'?5:0;
  for(let c=0;c<count;c++){transport[c*12]=vx;transport[c*12+1]=vx;transport[c*12+2]=vy;transport[c*12+3]=vy;}
  const L={simActive:true,device,queue,simulationClock:0,simParamsHost:new Float32Array([kind==='zero'||kind==='advect'?0:250]),
    buf:{pos:buffer(16),flag:buffer(4),affine:buffer(16),terrainMask:buffer(64)},setToyMembrane(){}};
  L.paramsBuf=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});allocated.push(L.paramsBuf);
  const gridBytes=new ArrayBuffer(64),gu=new Uint32Array(gridBytes),gf=new Float32Array(gridBytes);
  gf[8]=20;gf[9]=8;gf[10]=20;gu[14]=20;gu[15]=20;queue.writeBuffer(L.paramsBuf,0,gridBytes);
  const terrain=new Uint32Array(16);
  function solid(x,y){const k=y*20+x;terrain[k>>5]|=1<<(k&31);}
  if(kind==='ceiling'||kind==='expansion-corner')for(let x=0;x<20;x++)solid(x,10);
  if(['partial-wall','expansion-wall','expansion-corner'].includes(kind)){
    for(let y=0;y<20;y++)solid(10,y);
    for(let c=0;c<count;c++)if(c%width===17)geometry[c*8]=.6;
  }
  if(kind==='sweep-wall')for(let y=0;y<20;y++)solid(13,y);
  queue.writeBuffer(L.buf.terrainMask,0,terrain);
  queue.writeBuffer(L.buf.pos,0,new Float32Array([150,150,7,11]));queue.writeBuffer(L.buf.flag,0,new Uint32Array([32]));
  const A={enabled:true,width,height,cellSize:dx,settings:{atmospherePressure:100000,volumeScale:scale},buffers:{
    cells:buffer(count*32),labels:buffer(count*8),history:buffer(count*32),geometry:buffer(count*32),transport:buffer(count*48),gas:buffer(count*64)},setPhaseCompanion(){}};
  queue.writeBuffer(A.buffers.cells,0,cells);queue.writeBuffer(A.buffers.labels,0,labels);queue.writeBuffer(A.buffers.history,0,history);
  queue.writeBuffer(A.buffers.geometry,0,geometry);queue.writeBuffer(A.buffers.transport,0,transport);
  const B=await WSSBubbles.create({liquid:L,air:A,width:160,height:160,maxParticles:n,inject:false,entrainedArea:200});
  async function read(){const b=device.createBuffer({size:128+n*32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{const e=device.createCommandEncoder();e.copyBufferToBuffer(B.buffers.ledger,0,b,0,128);e.copyBufferToBuffer(B.buffers.position,0,b,128,n*16);e.copyBufferToBuffer(B.buffers.material,0,b,128+n*16,n*16);queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const a=b.getMappedRange();return {ledger:Array.from(new Int32Array(a,0,32)),pos:Array.from(new Float32Array(a,128,4)),material:Array.from(new Float32Array(a,128+n*16,4))};}finally{b.unmap();b.destroy();}}
  try{
    let e=device.createCommandEncoder();B.beginFrame(e,{h:1/120,count:1,clock:0});B.finishGas(e);queue.submit([e.finish()]);
    const birth=await read(),excluded=['large','vapor','atmosphere'].includes(kind);
    if(excluded){check(birth.ledger[22]===0,'Large headspaces, vapor and atmosphere must retain their current representation');return {kind,excluded:true,errors};}
    check(birth.ledger[22]===1 && birth.ledger[21]===amount,'Exactly the finite native gas amount transfers once '+JSON.stringify({birth,errors}));
    check(birth.material[0]===amount && birth.material[2]===1,'Gas has a live material parcel');
    const tension=.072*100000/101325/(.0254/(160/30)),absolute=kind==='compressed'?200000:100000;
    const expectedRadius=2*100000*area/Math.PI/(Math.sqrt(tension*tension+4*absolute*100000*area/Math.PI)+tension);
    check(Math.abs(birth.material[1]-expectedRadius)<.0001,'Independent gas pressure and surface tension radius');
    if(kind==='unresolved'){
      labels[root*2]=101;queue.writeBuffer(A.buffers.labels,0,labels);
      e=device.createCommandEncoder();B.collectGas(e);B.finishGas(e);queue.submit([e.finish()]);
      const carried=await read();check(carried.material[0]===amount && carried.material[2]===1 && carried.material[3]===-1,'A transient parent label keeps gas in its parcel');
      check(carried.ledger[23]===0 && carried.ledger[8]===0,'A non-root cell cannot own coupled pressure inventory');
      return {kind,birth,carried,errors};
    }
    if(kind==='expansion-wall'||kind==='expansion-corner'){
      for(let c=0;c<count;c++)if(ci[c*8+3]===1)hf[c*8]=-80000;queue.writeBuffer(A.buffers.history,0,history);
      e=device.createCommandEncoder();B.afterSubstep(e,{count:1});queue.submit([e.finish()]);
      const expanded=await read(),radius=expanded.material[1];
      check(expanded.material[0]===amount,'Expansion preserves finite gas');
      check(radius>4.5 && expanded.pos[0]>=88+radius,'Expansion contact moves away from the wall instead of pinning the bubble');
      if(kind==='expansion-corner')check(expanded.pos[1]>=88+radius,'Both corner contacts remain clear');
      else check(expanded.pos[1]<birth.pos[1],'An expanding bubble continues to rise along the wall');
      return {kind,birth,expanded,errors};
    }
    if(kind==='sweep-wall'){
      for(let i=0;i<20;i++){e=device.createCommandEncoder();B.afterSubstep(e,{count:1});queue.submit([e.finish()]);}
      const swept=await read();check(swept.pos[0]>birth.pos[0] && swept.pos[0]+swept.material[1]<=104,'Swept circular contact cannot cross the native wall');
      check(swept.material[0]===amount,'Wall contact preserves gas');return {kind,birth,swept,errors};
    }
    // Capture runs again while the native root still reports the same amount.
    e=device.createCommandEncoder();B.collectGas(e);B.finishGas(e);queue.submit([e.finish()]);
    check((await read()).ledger[22]===1,'An already represented root cannot be captured twice');
    e=device.createCommandEncoder();B.afterSubstep(e,{count:1});queue.submit([e.finish()]);
    const moved=await read(),g=L.simParamsHost[0],slip=Math.sqrt(Math.PI*expectedRadius*g);
    check(Math.abs(moved.pos[0]-(birth.pos[0]+vx/120))<.00003,'Carrier advection in x');
    // outsidePressure uses the stationary surrounding water, whose pressure
    // is zero in this fixture. Compressed births re-expand on their next step.
    if(kind!=='compressed')check(Math.abs(moved.pos[1]-(birth.pos[1]+(vy-slip)/120))<.00003,'Size-dependent buoyancy plus carrier advection in y');
    check(moved.material[0]===amount,'Motion preserves gas amount');
    if(kind==='zero'||kind==='ceiling'){
      for(let i=0;i<600;i++){e=device.createCommandEncoder();B.afterSubstep(e,{count:1});B.collectGas(e);queue.submit([e.finish()]);}
      const held=await read();check(held.material[0]===amount && held.material[2]===1,'No age-based escape or gas deletion in a sealed or zero-gravity fixture');
      if(kind==='zero')check(held.pos[0]===birth.pos[0] && held.pos[1]===birth.pos[1],'Zero gravity leaves a stationary submerged bubble stationary');
      else check(held.pos[1]>85+held.material[1],'The bubble cannot cross a sealed ceiling');
    }
    check(errors.length===0,errors.join('\n'));return {kind,birth,moved,expectedRadius,errors};
  }finally{await queue.onSubmittedWorkDone();B.destroy();for(const b of allocated)b.destroy();device.destroy();}
}
async function snapshot(){
  return evaluate(`(async()=>{
    const L=__toy.liquid(),A=__toy.airModel(),B=__toy.entrainedAir(),n=L.uploadedCount,d=L.device;
    const b=d.createBuffer({size:n*16+(B?256*48+128:0),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{const e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);
      if(B){e.copyBufferToBuffer(B.buffers.position,0,b,n*16,256*16);e.copyBufferToBuffer(B.buffers.material,0,b,n*16+256*16,256*16);e.copyBufferToBuffer(B.buffers.witness,0,b,n*16+256*32,256*16);e.copyBufferToBuffer(B.buffers.ledger,0,b,n*16+256*48,128);}
      d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const bytes=b.getMappedRange(),p=new Float32Array(bytes,0,n*4);let finite=true;for(const v of p)finite=finite&&Number.isFinite(v);
      let bubbles=[],ledger=null;if(B){const pos=new Float32Array(bytes,n*16,256*4),m=new Float32Array(bytes,n*16+256*16,256*4),w=new Float32Array(bytes,n*16+256*32,256*4);ledger=Array.from(new Int32Array(bytes,n*16+256*48,32));
        for(let i=0;i<ledger[4];i++)if(m[i*4+2]>.5)bubbles.push({slot:i,x:pos[i*4],y:pos[i*4+1],radius:m[i*4+1],amount:m[i*4]/A.settings.volumeScale,state:m[i*4+2],birth:w[i*4+1],birthY:w[i*4+2]});}
      const s=await A.capture();return {clock:L.simulationClock,count:n,finite,bubbles,bubbleLedger:ledger,scale:A.settings.volumeScale,gas:s.ledger,pockets:s.pockets,phase:s.phaseLedger};
    }finally{b.unmap();b.destroy();}
  })()`);
}
async function tank(mode){
  await navigate(1440,900,'?scene=heron-air-smoke&paused=1');
  await inside(`(async()=>{userPaused=true;syncRunning();clearWorldAll();machineState=null;
    wallRect(224,112,232,320);wallRect(432,112,440,320);wallRect(224,312,440,320);
    for(let y=160;y<311;y+=1.25)for(let x=234;x<431;x+=1.25)if(Math.hypot(x-330,y-254)>7.5)addLiquidParticle('water',x,y,0,0,0);
    liquidWGPU.uploadParticles();bakeWalls();await enableAirModel({phaseChange:true,iterations:128,cellSize:5,particlePressure:true,directGather:${mode==='corrected'},projectedVelocity:${mode==='corrected'},boundaryReconstruction:${mode==='corrected'},collapseEmptyCells:${mode==='corrected'},vaporClosure:${mode==='corrected'}});
    if(${mode==='corrected'}){toyEntrainedAir=await WSSBubbles.create({liquid:liquidWGPU,air:airModel,width:worldW,height:worldH,maxParticles:256,inject:false,entrainedArea:200});liquidWGPU.setToyMembrane(toyEntrainedAir);}
  })()`);
  const rows=[];
  for(let i=0;i<=40;i++){if(i)await evaluate('__toy.liquid().bench(4,1/60)');const row=await snapshot();rows.push(row);assert(row.finite);assert.equal(row.count,rows[0].count);
    if(row.bubbleLedger){const l=row.bubbleLedger;assert.equal(l[0]+l[21]-l[1]-l[2]-l[3],0,'Captured gas is either moving or released to the atmosphere');assert.equal(l[8],0);assert.equal(l[9],0);}}
  await inside('drawLiquidToy()');await screenshot('tank-'+mode);return {mode,rows};
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

  await navigate(1440,900,'?scene=heron-air-smoke&paused=1');
  const components=[];
  for(const kind of ['small','zero','advect','ceiling','large','vapor','atmosphere','compressed','unresolved','partial-wall','expansion-wall','expansion-corner','sweep-wall']){
    const row=await evaluate(`(${componentFixture.toString()})(${JSON.stringify(kind)})`);assert.deepEqual(row.errors,[]);components.push(row);console.log('COMPONENT',kind,'pass');}
  fs.writeFileSync(path.join(dump,'component-report.json'),JSON.stringify({sourceHashes,components},null,2));
  if(process.env.COMPONENT_ONLY==='1')process.exitCode=0;
  else {
  const reference=await tank('reference'),corrected=await tank('corrected');
  fs.writeFileSync(path.join(dump,'tank-report.json'),JSON.stringify({components,reference,corrected},null,2));
  const exit=corrected.rows.find(r=>r.bubbleLedger?.[1]>0),last=corrected.rows.at(-1);
  assert(exit && exit.clock<2.5,'A submerged compact pocket reaches the atmosphere within 2.5 simulation seconds');
  assert(corrected.rows.some(r=>r.bubbles.some(b=>b.birthY>245 && b.birthY-b.y>65)),'The gas actually travels through the water before escaping');
  assert(reference.rows.some(r=>r.clock>2.5 && r.pockets.some(p=>p.amount>25)),'The released transport reproduces the lingering pocket');
  assert(last.bubbleLedger[21]>0);assert(last.bubbleLedger[1]>=last.bubbleLedger[21]*.98,'Captured finite air reaches atmosphere instead of disappearing underwater');
  const scenes=[];
  for(const [width,height,mobile,seed] of [[1440,900,false,17],[1440,900,false,42],[1440,900,false,913],[844,390,true,17]]){
    await navigate(width,height,'?scene=heron-air-smoke&paused=1',mobile);
    await evaluate('__toy.machine("heron-air-smoke",{seed:'+seed+'})');await evaluate('__toy.pause(true)');
    const rows=[await snapshot()];
    for(const frames of [39,156,234]){const perf=await evaluate('__toy.liquid().bench('+frames+',1/60)');const row=await snapshot();row.msPerFrame=perf.msPerFrame;rows.push(row);fs.writeFileSync(path.join(dump,'scene-progress.json'),JSON.stringify({width,height,mobile,seed,rows},null,2));
      assert(row.finite);assert.equal(row.count,rows[0].count,'All native water parcels remain');const l=row.bubbleLedger;assert(l,'Exact scene enables entrainment');assert.equal(l[0]+l[21]-l[1]-l[2]-l[3],0);assert.equal(l[8],0);assert.equal(l[9],0);assert.equal(l[13],0,'No bubble capacity refusal');assert(Math.abs(row.gas.balanceError+l[23]/row.scale)<.01,'The native pressure ledger accounts for every coupled parcel exactly once');}
    const final=rows.at(-1);assert(final.bubbleLedger[22]>0,'Natural detached gas is captured in the real fountain');assert(final.pockets.some(p=>p.amount>1000),'Large sealed headspaces remain in the pressure solver');
    await inside('drawLiquidToy()');await screenshot('heron-'+width+'-'+seed);scenes.push({width,height,mobile,seed,rows});console.log('HERON',width,seed,'captures',final.bubbleLedger[22],'escaped',final.bubbleLedger[1]/final.scale);
  }
  fs.writeFileSync(path.join(dump,'scene-report.json'),JSON.stringify({scenes},null,2));
  assert(await evaluate('(async()=>{const L=__toy.liquid();await __toy.machine("sewer-gas-trap");return L===__toy.liquid() && __toy.entrainedAir()===null;})()'),'Reconstructing an apparatus retires its gas companion');
  await navigate(1440,900,'?scene=falls&paused=1');assert.equal(await evaluate('__toy.entrainedAir()'),null,'Leaving the apparatus releases the companion');
  await navigate(1440,900,'?scene=air-hose&paused=1');await evaluate('__toy.pause(true)');await evaluate('__toy.liquid().bench(60,1/60)');const hose=await evaluate('__toy.bubbles().stats()');assert.equal(hose.capturedAmount,0);assert.equal(hose.residual,0);assert(hose.births>0);assert.equal(hose.finiteErrors,0);assert.equal(hose.historyUnderflows,0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({sourceHashes,components,reference,corrected,scenes,hose,errors},null,2));
  console.log('PASS actual gas transfer, buoyancy, carrier flow, ceiling, zero gravity, pressure radius, no timer, native water conservation and real desktop/mobile fountain');
  }
}finally{await cleanup();}
