// Browser regression for the standalone demo. Owns and closes Chrome for Testing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {checkIsolatedDeclump} from './water-declump-isolated.mjs';
import {checkNativeDeclumpOrdering} from './water-declump-sort-oracle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-air-review';
const port = Number(process.env.PORT || 8467), debug = port + 1000;
const sha=data=>createHash('sha256').update(data).digest('hex');
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if(file===path.join(root,'js/liquid-wgpu.js')){
      if(process.env.CURRENT_NATIVE)data=fs.readFileSync(process.env.CURRENT_NATIVE);
      if(globalThis.nativeReference && process.env.NATIVE_REFERENCE)data=fs.readFileSync(process.env.NATIVE_REFERENCE);
      const nativeSHA=sha(data);
      if(process.env.DECLUMP_ISOLATED || process.env.DECLUMP_SORT_NATIVE)data=data.toString().replace(
        '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };',
        '  window.__ownedNativeAPI={runDeclump:runDeclump,buildGrid:buildGrid};\n  window.LiquidWGPU = { create: create, stage: STAGE, last: null };');
      data=Buffer.concat([Buffer.from(data),Buffer.from('\nwindow.__ownedNativeSHA='+JSON.stringify(nativeSHA)+';\n')]);
    }
    if(file===path.join(root,'js/liquid-air-wgpu.js')){
      if(globalThis.airReference)data=fs.readFileSync(process.env.REFERENCE);
      data=Buffer.concat([data,Buffer.from('\nwindow.__ownedAirSHA='+JSON.stringify(sha(data))+';\n')]);
    }
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      if(process.env.CURRENT_HOST)data=fs.readFileSync(process.env.CURRENT_HOST);
      if(globalThis.hostReference)data=fs.readFileSync(process.env.HOST_REFERENCE);
      const hostSHA=sha(data);
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
      ` + source.slice(end)+'\nwindow.__ownedHostSHA='+JSON.stringify(hostSHA)+';\n';
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
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 180000);
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: Number(process.env.DPR || 2), mobile });
  const priorOrigin=await evaluate('performance.timeOrigin');
  const split=query.split('#'),freshQuery=split[0]+(split[0].includes('?')?'&':'?')+'ownedCapture='+sequence;
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${freshQuery}${split[1]?'#'+split[1]:''}` });
  let ready=false;
  for (let i = 0; i < 120; i++) {
    try{ready=await evaluate(`performance.timeOrigin!==${priorOrigin} && document.readyState==='complete' && !!window.__toy && __toy.stats().waterState!=='booting'`);}catch{}
    if(ready)break;
    await sleep(100);
  }
  assert(ready,'Fresh document and real backend finish loading');
  await sleep(1000);
  const loaded=await evaluate('({host:window.__ownedHostSHA,air:window.__ownedAirSHA,native:window.__ownedNativeSHA})');
  assert.equal(loaded.host,sha(fs.readFileSync(globalThis.hostReference?process.env.HOST_REFERENCE:process.env.CURRENT_HOST || path.join(root,'js/water-smoke-slime.js'))),'Loaded selected host bytes');
  assert.equal(loaded.air,sha(fs.readFileSync(globalThis.airReference?process.env.REFERENCE:path.join(root,'js/liquid-air-wgpu.js'))),'Loaded selected air module bytes');
  assert.equal(loaded.native,sha(fs.readFileSync(globalThis.nativeReference?process.env.NATIVE_REFERENCE:process.env.CURRENT_NATIVE || path.join(root,'js/liquid-wgpu.js'))),'Loaded selected native engine bytes');
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`,[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    `--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'],{stdio:'ignore'});
  let endpoint;
  for(let i=0;i<150;i++){try{endpoint=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;}catch{}if(endpoint)break;await sleep(100);}
  assert(endpoint,'Owned Chrome starts');socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p?.timer);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  await send('Runtime.enable');await send('Page.enable');
  const rows=[];let reportExtras={};
  if(process.env.EQUIVALENCE || process.env.BENCH_COMPARE)assert(process.env.REFERENCE || process.env.HOST_REFERENCE || process.env.NATIVE_REFERENCE,'Comparison requires saved prior source');
  if(process.env.HOST_BENCH)assert(process.env.HOST_REFERENCE,'HOST_BENCH requires the saved prior host');
  async function prepareSelectedNative(){
    if(!process.env.NATIVE_JACOBI)return;
    await evaluate('__toy.liquid().setSimParam("DECLUMP_JACOBI",1)');
    assert.equal(await evaluate('__toy.liquid().getSimParam("DECLUMP_JACOBI")'),1,'Requested native candidate supported');
    if(await evaluate('typeof __toy.liquid().prepareDeclumpJacobi === "function"'))
      assert.equal(await evaluate('__toy.liquid().prepareDeclumpJacobi()'),true,'Selected native candidate validated and ready');
  }
  async function nativeHashes(){return evaluate(`(async()=>{
    const L=__toy.liquid(),M=__toy.airModel(),D=L.device,n=L.uploadedCount,count=M.width*M.height;
    const sources=[['pos',L.buf.pos,n*16],['affine',L.buf.affine,n*16],['aux',L.buf.aux,n*16],['flag',L.buf.flag,n*4],
      ['cells',M.buffers.cells,count*32],['labels',M.buffers.labels,count*8],['history',M.buffers.history,count*32],['pressure',M.buffers.pressure,count*16],
      ['gas',M.buffers.gas,(count+2)*64],['phase',M.buffers.gas,count*16,M.phaseOffset],['geometry',M.buffers.geometry,count*32]];
    const encoder=D.createCommandEncoder(),reads=sources.map(([name,source,size,offset=0])=>{
      const b=D.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyBufferToBuffer(source,offset,b,0,size);return {name,b};});
    L.queue.submit([encoder.finish()]);const hashes={};
    try{await Promise.all(reads.map(async({name,b})=>{await b.mapAsync(GPUMapMode.READ);const digest=await crypto.subtle.digest('SHA-256',b.getMappedRange());hashes[name]=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}));return hashes;}
    finally{for(const {b}of reads){b.unmap();b.destroy();}}
  })()`);}
  async function recordNative(id){
    const capture=await evaluate(`(()=>{
      const L=__toy.liquid(),M=__toy.airModel();
      function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
      const host={};for(const [name,data]of [['params',L.paramsHost],['gameParams',L.gameParamsHost],['simParams',L.simParamsHost]])host[name]=encode(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
      const state={clock:L.simulationClock,air:__toy.airStats(),dt:L.stepDt,count:L.uploadedCount,readbackGeneration:L.readbackApplyGen,readbackAppliedTime:L.readbackAppliedTime,
        mutationSeq:L.liquid.getMutationSeq?L.liquid.getMutationSeq():null,settings:M.settings,loaded:{host:__ownedHostSHA,air:__ownedAirSHA,native:__ownedNativeSHA}};
      return {host,state};
    })()`);
    if(process.env.DECLUMP_COUNTS)capture.state.declumpInputCounts=await evaluate(`(async()=>{
      const L=__toy.liquid(),source=L.buf.declumpJacobiCounts;if(!source)return null;
      const b=L.device.createBuffer({size:source.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=L.device.createCommandEncoder();
      enc.copyBufferToBuffer(source,0,b,0,source.size);L.queue.submit([enc.finish()]);
      try{await b.mapAsync(GPUMapMode.READ);const words=new Uint32Array(b.getMappedRange());let max=0,oversizedCells=0,particlesInOversizedCells=0;
        for(const count of words){max=Math.max(max,count);if(count>128){oversizedCells++;particlesInOversizedCells+=count;}}
        return {maximumBucketCount:max,oversizedCells,particlesInOversizedCells};
      }finally{b.unmap();b.destroy();}
    })()`);
    const folder=path.join(dump,id);fs.mkdirSync(folder,{recursive:true});
    const hashes={};for(const [name,base64]of Object.entries(capture.host)){
      const bytes=Buffer.from(base64,'base64');fs.writeFileSync(path.join(folder,name+'.bin'),bytes);hashes[name]=sha(bytes);
    }
    for(const name of ['pos','affine','aux','flag','cells','labels','history','pressure','gas','geometry']){
      const base64=await evaluate(`(async()=>{
        const name=${JSON.stringify(name)},L=__toy.liquid(),M=__toy.airModel(),D=L.device,n=L.uploadedCount,c=M.width*M.height;
        const sources={pos:[L.buf.pos,n*16],affine:[L.buf.affine,n*16],aux:[L.buf.aux,n*16],flag:[L.buf.flag,n*4],
          cells:[M.buffers.cells,c*32],labels:[M.buffers.labels,c*8],history:[M.buffers.history,c*32],pressure:[M.buffers.pressure,c*16],gas:[M.buffers.gas,(c+2)*64],geometry:[M.buffers.geometry,c*32]};
        const [source,size]=sources[name],b=D.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=D.createCommandEncoder();
        encoder.copyBufferToBuffer(source,0,b,0,size);L.queue.submit([encoder.finish()]);
        try{await b.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(b.getMappedRange());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
        finally{b.unmap();b.destroy();}
      })()`);
      const bytes=Buffer.from(base64,'base64');fs.writeFileSync(path.join(folder,name+'.bin'),bytes);hashes[name]=sha(bytes);
    }
    fs.writeFileSync(path.join(folder,'state.json'),JSON.stringify(capture.state,null,2)+'\n');
    return {folder:id,hashes,state:capture.state};
  }
  if(process.env.DECLUMP_SORT_NATIVE){
    await navigate(1512,820,'?scene=cup&paused=1#toy');
    const result=await evaluate(`(${checkNativeDeclumpOrdering.toString()})()`);
    result.loadedSources=await evaluate('({host:__ownedHostSHA,air:__ownedAirSHA,native:__ownedNativeSHA})');
    result.errors=errors;assert.deepEqual(errors,[]);reportExtras=result;
    console.log('NATIVE ORDERING',JSON.stringify({pass:result.pass,cases:result.rows.length}));
  }else if(process.env.DECLUMP_ISOLATED){
    await navigate(1512,820,'?scene=cup&paused=1#toy');await evaluate('__toy.pause(true)');
    const result=await evaluate(`(${checkIsolatedDeclump.toString()})()`);
    result.loaded=await evaluate('({host:__ownedHostSHA,air:__ownedAirSHA,native:__ownedNativeSHA})');
    result.errors=errors;assert.deepEqual(errors,[]);
    reportExtras=result;
    fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify(result,null,2)+'\n');
    console.log('ISOLATED OVERLAP',JSON.stringify({pass:result.pass,cases:result.rows.length}));
  }else if(process.env.REPEAT_NATIVE){
    // Prescribed immersed poses isolate native transport from CPU slime motion.
    // This diagnostic deliberately records raw buffers, not just rounded probes.
    const captureConfig={seeds:(process.env.SEEDS || '17,42,913').split(',').map(Number),
      frames:Number(process.env.FRAMES || 4),requestedNativeParams:Object.assign({},process.env.DECLUMP_OFF?{DECLUMP_ON:0}:{},process.env.DECLUMP_JACOBI?{DECLUMP_JACOBI:1}:{}),
      dt:1/60,poses:'Primary mesh translated to x+9*sin(frame*.23), y=210+7*cos(frame*.17), with zero guest velocity'};
    reportExtras={captureConfig};
    for(const seed of captureConfig.seeds){
      const runs=[];
      for(let repeat=0;repeat<2;repeat++){
        await navigate(1512,820,'?scene=cup&paused=1#toy');
        await evaluate(`__toy.machine('cup',{seed:${seed}}).then(()=>true)`);
        await evaluate('__toy.pause(true)');
        if(process.env.DECLUMP_OFF)await evaluate('__toy.liquid().setSimParam("DECLUMP_ON",0)');
        if(process.env.DECLUMP_JACOBI){
          await evaluate('__toy.liquid().setSimParam("DECLUMP_JACOBI",1)');
          assert.equal(await evaluate('__toy.liquid().getSimParam("DECLUMP_JACOBI")'),1,'Native snapshot mode is active');
          if(await evaluate('typeof __toy.liquid().prepareDeclumpJacobi === "function"'))
            assert.equal(await evaluate('__toy.liquid().prepareDeclumpJacobi()'),true,'Requested native pipelines are validated and ready');
          await evaluate('__toy.liquid().device.pushErrorScope("validation")');
        }
        const steps=[{frame:0,capture:await recordNative(`seed-${seed}-repeat-${repeat}-frame-0`)}];
        await evaluate('__toy.machinePrimary();__toy.pause(true)');
        await inside('window.__geometryTestPose=jelloBodies.map(b=>({cx:b.cx,cy:b.cy,px:Array.from(b.px),py:Array.from(b.py)}));');
        for(let frame=1;frame<=captureConfig.frames;frame++){
          await inside(`jelloBodies.forEach(function(b,index){var pose=__geometryTestPose[index],dx=Math.sin(${frame}*.23)*9,dy=210-pose.cy+Math.cos(${frame}*.17)*7;
            for(var point=0;point<b.n;point++){b.px[point]=pose.px[point]+dx;b.py[point]=pose.py[point]+dy;b.ox[point]=b.px[point];b.oy[point]=b.py[point];}
            b.cx=pose.cx+dx;b.cy=pose.cy+dy;b.bboxL=Math.min.apply(null,b.px);b.bboxR=Math.max.apply(null,b.px);b.bboxT=Math.min.apply(null,b.py);b.bboxB=Math.max.apply(null,b.py);});airGeometryTick();`);
          await evaluate('__toy.liquid().update(1/60);__toy.liquid().queue.onSubmittedWorkDone()');
          steps.push({frame,capture:await recordNative(`seed-${seed}-repeat-${repeat}-frame-${frame}`)});
        }
        if(process.env.DECLUMP_JACOBI){
          const validation=await evaluate('__toy.liquid().device.popErrorScope().then(error=>error?.message || null)');
          assert.equal(validation,null,'Opt-in native snapshot pipeline and transfers validate');
        }
        runs.push({repeat,steps});
      }
      const comparison=runs[0].steps.map((step,i)=>({frame:step.frame,different:Object.keys(step.capture.hashes).filter(key=>step.capture.hashes[key]!==runs[1].steps[i].capture.hashes[key])}));
      rows.push({seed,runs,comparison});console.log('REPEAT INPUT/OUTPUT',seed,JSON.stringify(comparison));
      fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({captureConfig,rows,errors},null,2));
    }
    assert.deepEqual(errors,[]);
    if(process.env.EXPECT_REPEAT)assert(rows.every(row=>row.comparison.every(frame=>frame.different.length===0)),
      'All captured native buffers repeat byte for byte');
  }else if(process.env.HOST_BENCH){
    const warmupMs=Number(process.env.HOST_WARMUP_SECONDS || 4)*1000;
    const sampleMs=Number(process.env.HOST_BENCH_SECONDS || 8)*1000;
    assert(warmupMs>=0 && sampleMs>0, 'Valid presentation sample duration');
    for(const updated of [false,true,true,false]){
      globalThis.hostReference=!updated;
      globalThis.airReference=!!process.env.REFERENCE && !updated;
      globalThis.nativeReference=!!process.env.NATIVE_REFERENCE && !updated;
      await navigate(1512,820,'?scene=cup&paused=1#toy');
      await prepareSelectedNative();
      await evaluate('__toy.machine("cup",{seed:17}).then(()=>true)');
      assert(await evaluate('__toy.machineState()?.ready && __toy.airModel()?.enabled'),'Real cup pressure model ready');
      await evaluate('document.getElementById("toy").scrollIntoView();__toy.machinePrimary();__toy.pause(false)');
      await sleep(warmupMs);
      await inside(`
        window.__geometryProfile={};
        function profileGeometry(name,fn){return function(){var start=performance.now();try{return fn.apply(this,arguments);}finally{var samples=__geometryProfile[name] || (__geometryProfile[name]=[]);samples.push(performance.now()-start);}};}
        airGeometryTick=profileGeometry('airGeometryTick',airGeometryTick);
        jelloWaterCoupleTick=profileGeometry('jelloWaterCoupleTick',jelloWaterCoupleTick);
        updateJello=profileGeometry('updateJello',updateJello);
        buildWaterCells=profileGeometry('buildWaterCells',buildWaterCells);
        render=profileGeometry('render',render);
      `);
      const frames=await evaluate(`new Promise(resolve=>{const times=[],rates=[];let last=null;const start=performance.now();function tick(t){if(last!==null)times.push(t-last);last=t;rates.push(__toy.stats().fps);if(t-start<${sampleMs})requestAnimationFrame(tick);else resolve({times,rates,sim:__toy.instruments().simulationSeconds,profile:__geometryProfile});}requestAnimationFrame(tick);})`);
      await evaluate('__toy.pause(true)');
      const bodies=await inside('jelloBodies.map(b=>({points:b.n,ringPoints:b.ringN,center:{x:b.cx,y:b.cy}}))');
      rows.push({scene:'cup',updated,warmupMs,sampleMs,bodies,frames,loaded:await evaluate('({host:__ownedHostSHA,air:__ownedAirSHA,native:__ownedNativeSHA})')});
      const summary=Object.fromEntries(Object.entries(frames.profile).map(([name,samples])=>{const s=samples.slice().sort((a,b)=>a-b);return [name,{samples:s.length,medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)]}];}));
      console.log('CUP HOST PROFILE',updated,JSON.stringify(summary));
    }
  }else if(process.env.BENCH_COMPARE){
    for(const scene of ['heron','siphon','cup']){
      await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
      for(const updated of [false,true,true,false]){
        globalThis.airReference=!!process.env.REFERENCE && !updated;
        globalThis.hostReference=!!process.env.HOST_REFERENCE && !updated;
        globalThis.nativeReference=!!process.env.NATIVE_REFERENCE && !updated;
        await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
        await prepareSelectedNative();
        await evaluate(`__toy.pause(true);__toy.machine('${scene}',{seed:17,pressure:{}}).then(()=>true)`);
        await evaluate('__toy.liquid().bench(20,1/60)');
        const bench=await evaluate('__toy.liquid().bench(120,1/60)');rows.push({scene,updated,bench});console.log('PAIRED BENCH',scene,updated,JSON.stringify(bench));
      }
    }
    fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors},null,2));assert.deepEqual(errors,[]);
  }else if(process.env.EQUIVALENCE){
    for(const scene of (process.env.SCENES || 'heron,siphon,cup').split(','))for(const seed of [17,42,913]){
      const captures=[];
      for(const updated of [false,true]){
        globalThis.airReference=!!process.env.REFERENCE && !updated;
        globalThis.hostReference=!!process.env.HOST_REFERENCE && !updated;
        globalThis.nativeReference=!!process.env.NATIVE_REFERENCE && !updated;
        await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
        await prepareSelectedNative();
        await evaluate(`__toy.pause(true);__toy.machine('${scene}',{seed:${seed},pressure:{}}).then(()=>true)`);
        assert(await evaluate('__toy.airModel().enabled'),'Air model active');
        if(process.env.EQUIVALENCE_GEOMETRY && scene==='cup'){
          await evaluate('__toy.machinePrimary();__toy.pause(true)');
          await inside('window.__geometryTestPose=jelloBodies.map(b=>({cx:b.cx,cy:b.cy,px:Array.from(b.px),py:Array.from(b.py)}));');
        }
        const steps=[];
        for(let frame=1;frame<=20;frame++){
          if(process.env.EQUIVALENCE_GEOMETRY && scene==='cup')await inside(`
            jelloBodies.forEach(function(b,index){var pose=__geometryTestPose[index],dx=Math.sin(${frame}*.23)*9,dy=210-pose.cy+Math.cos(${frame}*.17)*7;
              for(var point=0;point<b.n;point++){b.px[point]=pose.px[point]+dx;b.py[point]=pose.py[point]+dy;b.ox[point]=b.px[point];b.oy[point]=b.py[point];}
              b.cx=pose.cx+dx;b.cy=pose.cy+dy;b.bboxL=Math.min.apply(null,b.px);b.bboxR=Math.max.apply(null,b.px);b.bboxT=Math.min.apply(null,b.py);b.bboxB=Math.max.apply(null,b.py);});
            airGeometryTick();
          `);
          await evaluate('__toy.liquid().update(1/60);__toy.liquid().queue.onSubmittedWorkDone()');
          if([1,5,20].includes(frame))steps.push({frame,hashes:await nativeHashes()});
        }
        captures.push({updated,steps,loaded:await evaluate('({host:__ownedHostSHA,air:__ownedAirSHA,native:__ownedNativeSHA})')});
      }
      if(process.env.GEOMETRY_ONLY){
        assert(process.env.EQUIVALENCE_GEOMETRY,'GEOMETRY_ONLY uses prescribed moving guest poses');
        assert.deepEqual(captures[1].steps.map(s=>s.hashes.geometry),captures[0].steps.map(s=>s.hashes.geometry),'Moving guest geometry buffers match prior release: '+scene+' '+seed);
      }else assert.deepEqual(captures[1].steps,captures[0].steps,'Default particle, pressure and gas buffers match prior release: '+scene+' '+seed);
      rows.push({scene,seed,captures,scope:process.env.GEOMETRY_ONLY?'Prescribed moving guest geometry only. Full guest/water snapshots can differ in repeat controls with identical sources.':'Full native buffers without moving guest poses.'});console.log('EQUIVALENT',scene,seed);
    }
    fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors},null,2));assert.deepEqual(errors,[]);
  }else
  for(const scene of (process.env.SCENES || 'heron,siphon,cup').split(',')){
    await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
    await evaluate('document.getElementById("toy").scrollIntoView();__toy.pause(true)');
    for(let tries=0;tries<100&&!await evaluate('__toy.machineState()?.ready');tries++)await sleep(100);
    assert(await evaluate('__toy.machineState()?.ready && __toy.airModel()?.enabled'),'Real pressure model ready');
    await inside('airPressureColors=false;pressureColors=false;');
    const L='__toy.liquid()';
    console.log('BENCH start',scene);const base=await evaluate(`${L}.bench(20,1/60)`);
    console.log('BENCH done',JSON.stringify(base));const stats=await evaluate('({toy:__toy.stats(),air:__toy.airStats(),settings:__toy.airModel().settings})');
    await evaluate('Promise.resolve(__toy.airModel().capture()).then(()=>true)');
    if(!process.env.BENCH_ONLY){
      await inside('airPressureColors=true');
      await evaluate('__toy.airPressureView(true);__toy.machinePrimary();__toy.pause(false)');
      await sleep(4000);
      const frames=await evaluate(`new Promise(resolve=>{const times=[],rates=[];let last=null;const start=performance.now();function tick(t){if(last!==null)times.push(t-last);last=t;rates.push(__toy.stats().fps);if(t-start<6000)requestAnimationFrame(tick);else resolve({times,rates,sim:__toy.instruments().simulationSeconds,overlay:__toy.pressureViewState()});}requestAnimationFrame(tick);})`);
      await evaluate('__toy.pause(true)');await screenshot(scene+'-air');
      await evaluate('document.getElementById("toy-air-pressure-compact").click()');
      assert.equal(await evaluate('__toy.airPressureView()'),false,'Compact control hides air');
      await evaluate('document.getElementById("toy-instruments-open").click();document.getElementById("toy-air-pressure-toggle").click()');
      assert.equal(await evaluate('__toy.airPressureView()'),true,'Instruments restores air');
      assert.equal(await evaluate('document.getElementById("toy-air-pressure-compact").getAttribute("aria-pressed")'),'true','Controls agree');
      await evaluate('document.querySelector("#toy-panel-instruments [data-close]").click()');
      rows.push({scene,base,stats,frames});
    }else rows.push({scene,base,stats});
    console.log(scene,JSON.stringify(base));
  }
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors,...reportExtras},null,2));assert.deepEqual(errors,[]);
}finally{await cleanup();}
