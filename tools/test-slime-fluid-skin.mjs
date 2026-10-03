#!/usr/bin/env node
// Focused rendered-skin collision checks. DRY_RUN=1 never launches a browser.
// BEFORE=/path/reference.js overrides the committed v28.148 reference.
// BENCH=1 adds matched 16,384-particle GPU collision throughput in ABBA order.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeSkinFixtures, polygonTest } from './slime-fluid-skin-fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP||'/tmp/sluice-fluid-skin-focused';
const port=Number(process.env.PORT||8397),debugPort=port+1000;
const timeoutMs=Number(process.env.TIMEOUT_MS||180000);
const bench=process.env.BENCH==='1';
const fixtures=makeSkinFixtures(root),sources={},metadata={};
const beforeRef='1106d03cf78d9ffb302c90d3b392c72a094660be';
const files={before:process.env.BEFORE||null,after:process.env.AFTER||path.join(root,'js/liquid-wgpu.js')};
for(const [label,file] of Object.entries(files)) {
  const source=file?fs.readFileSync(file,'utf8'):execFileSync('git',['show',beforeRef+':js/liquid-wgpu.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(source.split(marker).length,2,label+' private API export anchor');
  sources[label]=source.replace(marker,marker+`\n  window.__waterCollisionAPIs.${label}={waterQueued:true,waterCompact:true,
    buildBuffers:buildBuffers,buildCollidePipelines:buildCollidePipelines,uploadTerrainMask:uploadTerrainMask,
    writeGameParams:writeGameParams,writeSimParams:writeSimParams,runCollide:runCollide,readbackBuffer:readbackBuffer,
    layout:{meta:GS_META_BASE,ring:GS_RING_BASE,lanes:GS_PARAM_LANES,slots:GS_FRAME_SLOTS}};`);
  new vm.Script(sources[label],{filename:file||beforeRef});
  metadata[label]={path:file?path.resolve(file):null,ref:file?null:beforeRef,sha256:createHash('sha256').update(source).digest('hex'),instrumentation:'Private API exports only; production shader and host math unchanged.'};
}
// Host packing uses production code, independent of GPU collision readbacks.
const hostContext=vm.createContext({window:{__waterCollisionAPIs:{}}});
vm.runInContext(sources.after,hostContext,{filename:files.after});
const hostAPI=hostContext.window.__waterCollisionAPIs.after;
for(const winding of [1,-1]) {
  const f=fixtures.fixtures.find(f=>f.name===(winding===1?'skin-convex-water':'skin-clockwise-convex-water'));
  const guest={...f.guests[0],pts:f.guests[0].pts.slice()};
  for(let i=0;i<20;i++){guest.pts[i*4+2]=0;guest.pts[i*4+3]=0;}
  const dx=guest.pts[0]-guest.x,dy=guest.pts[1]-guest.y,len=Math.hypot(dx,dy);
  guest.pts[2]=500*dx/len;guest.pts[3]=500*dy/len;
  const uploaded=[],layout=hostAPI.layout;
  hostAPI.writeGameParams({gameParamsHost:new Float32Array(layout.lanes*layout.slots),gameParamsBufs:Array.from({length:layout.slots},(_,i)=>i),
    stepDt:1/120,liquid:{getGameState:()=>({guests:[guest]})},queue:{writeBuffer(slot,offset,bytes){uploaded[slot]=Float32Array.from(bytes);}}},2);
  const bounded=uploaded.every(pose=>Array.from({length:20},(_,i)=>{const p=layout.ring+i*4;return Math.abs(pose[p]-pose[layout.meta])<=pose[layout.meta+2]+1e-6&&Math.abs(pose[p+1]-pose[layout.meta+1])<=pose[layout.meta+3]+1e-6;}).every(Boolean));
  const checks={allSlotsUploaded:uploaded.length===layout.slots,uploadedBoundsContainRewoundVertices:bounded,
    differentialVelocityChangesEarlierPose:uploaded[0][layout.ring]!==uploaded[1][layout.ring],
    earlierConcavePoseInvalidatesConvex:uploaded[0][layout.meta+4]===2,currentPoseKeepsSignedConvex:uploaded[1][layout.meta+4]===(winding===1?3:4)};
  fixtures.cpu.push({name:'two-substep-velocity-packing-'+winding,checks,pass:Object.values(checks).every(Boolean)});
}
const oldTool=fs.readFileSync(path.join(root,'tools/test-water-collision-gpu.mjs'),'utf8');
const legacyFixtureSource=oldTool.slice(oldTool.indexOf('function makeFixtures()'),oldTool.indexOf('async function runGPU()'));
const legacyFixtures=vm.runInNewContext('('+legacyFixtureSource+')()');
for(const f of legacyFixtures)fixtures.fixtures.push({...f,exact:true,clearance:null,outlines:[]});
let runner=oldTool.slice(oldTool.indexOf('async function runGPU()'),oldTool.indexOf('async function runBenchmark()'));
assert(runner.startsWith('async function runGPU()'));
const replaceOnce=(a,b)=>{assert.equal(runner.split(a).length,2,'GPU runner anchor: '+a);runner=runner.replace(a,b);};
replaceOnce('  const fixtures = window.__waterMakeFixtures();','');
replaceOnce('  if (window.__waterCollisionAPIs.before.snowShader !== window.__waterCollisionAPIs.after.snowShader) throw new Error("Snow collision shader changed");','');
replaceOnce('      const api = window.__waterCollisionAPIs[label];','      const api = window.__waterCollisionAPIs[label];\n      const fixtures = window.__waterMakeFixtures(label);');
const fixtureData=fixtures.fixtures.map(({outlines,...f})=>f);
async function runThroughput() {
  const count=16384,batchSteps=16,warmSteps=8,samples=6,order=['before','after','after','before'];
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw new Error('No benchmark adapter');
  const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const gpuErrors=[],instances={},rows=[];let current,destroying=false;
  device.addEventListener('uncapturederror',e=>gpuErrors.push(e.error.message));device.lost.then(info=>{if(!destroying)gpuErrors.push(info.message);});
  const seedBuffers={};
  const seeds={pos:new Float32Array(count*4),aux:new Float32Array(count*4),flag:new Uint32Array(count)};
  for(let i=0;i<count;i++) {
    // Uniform cloud, deterministic small jitter, identical across both sources.
    const jitter=((Math.imul(i+1,2654435761)>>>0)/4294967296-.5)*.35;
    const x=35+(i%128)*1.32+jitter,y=45+Math.floor(i/128)*.95-jitter;
    seeds.pos.set([x,y,-13,17],i*4);seeds.aux.set([3.2,.2,x,y],i*4);
  }
  try {
    for(const key of ['pos','aux','flag'])seedBuffers[key]=device.createBuffer({size:seeds[key].byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    for(const label of ['before','after']) {
      const api=window.__waterCollisionAPIs[label];
      const instance=instances[label]={device,queue:device.queue,maxParticles:count,g2pReady:true,stepDt:1/120,frameEncoder:null,terrainMaskWords:0,
        liquid:{getGameState:()=>({guests:current.guests}),fillTerrainSolid(col,row,w,h,target){target.fill(0);}}};
      device.pushErrorScope('validation');api.buildBuffers(instance);api.buildCollidePipelines(instance);
      const error=await device.popErrorScope();if(error)throw new Error(label+' throughput pipeline: '+error.message);
      if(!instance.collideReady)throw new Error(label+' throughput pipeline not ready');
      instance.uploadedCount=count;instance.terrain={originCol:-2,originRow:-4,w:12,h:16,tiles:192};instance.bathBowls=new Float32Array(20);
      const u=instance.paramsHost,f=instance.paramsHostF;u.fill(0);u[0]=count;u[1]=64;u[2]=64;u[5]=4096;
      f[6]=1/120;f[7]=.25;f[8]=8;f[9]=32;f[10]=8;u[12]=-2;u[13]=-4;u[14]=12;u[15]=16;f.set([0,-128,256,256],16);
      device.queue.writeBuffer(instance.paramsBuf,0,u);api.uploadTerrainMask(instance);api.writeSimParams(instance);
    }
    async function batch(instance,api,snowOnly,steps) {
      const encoder=device.createCommandEncoder({label:'skin-throughput.seeded-collision'});instance.frameEncoder=encoder;
      try{for(let step=0;step<steps;step++) {
        for(const key of ['pos','aux','flag'])encoder.copyBufferToBuffer(seedBuffers[key],0,instance.buf[key],0,seeds[key].byteLength);
        api.runCollide(instance,0,snowOnly);
      }}finally{instance.frameEncoder=null;}
      const started=performance.now();device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();return (performance.now()-started)/steps;
    }
    for(const family of window.__skinBenchFamilies)for(const snowOnly of [false,true]) {
      seeds.flag.fill(snowOnly?65:0);for(const key of ['pos','aux','flag'])device.queue.writeBuffer(seedBuffers[key],0,seeds[key]);
      for(let round=0;round<order.length;round++) {
        const label=order[round],instance=instances[label],api=window.__waterCollisionAPIs[label];
        current={guests:(label==='before'?family.legacyGuests:family.guests).map(g=>Object.assign({},g,{skin:label==='after'}))};
        api.writeGameParams(instance,1);await batch(instance,api,snowOnly,warmSteps);
        const times=[];for(let i=0;i<samples;i++){window.__waterProgress={stage:'throughput',family:family.name,snowOnly,label,round,sample:i};times.push(await batch(instance,api,snowOnly,batchSteps));}
        const sorted=times.slice().sort((a,b)=>a-b),queued=new Uint32Array(await api.readbackBuffer(instance,instance.buf.snowFallbackCount,16))[0];
        const output=new Float32Array(await api.readbackBuffer(instance,instance.buf.pos,count*16));
        rows.push({family:family.name,material:snowOnly?'snow':'water',label,round,count,guestCount:current.guests.length,batchSteps,warmSteps,
          samplesMs:times,medianMs:(sorted[2]+sorted[3])/2,minMs:sorted[0],maxMs:sorted.at(-1),lastFallbackCount:queued,finite:Array.from(output).every(Number.isFinite)});
      }
    }
    return {rows,gpuErrors,pass:!gpuErrors.length&&rows.every(r=>r.finite),
      seed:{count,cloud:[35,45,128,128,1.32,.95],velocity:[-13,17],aux:[3.2,.2]},order,
      limitation:'Matched post-G2P collision throughput, including identical GPU seed reset copies and one queue fence per batch. Wall time per collision, not GPU timestamps or ordinary-game FPS; no integration, contacts, rendering or CPU resident movement.'};
  }finally {
    for(const instance of Object.values(instances)){for(const b of Object.values(instance.buf||{}))b.destroy();instance.paramsBuf?.destroy();instance.simParamsBuf?.destroy();for(const b of instance.gameParamsBufs||[])b.destroy();}
    for(const b of Object.values(seedBuffers))b.destroy();destroying=true;device.destroy();
  }
}
const program=`window.__skinFixtures=${JSON.stringify(fixtureData)};
window.__waterMakeFixtures=function(label){return __skinFixtures.map(function(f){
  var guests=label==='before' && f.baselineGeometry==='legacy'?f.legacyGuests:f.guests;
  return Object.assign({},f,{guests:guests.map(function(g){return Object.assign({},g,{skin:label==='after'&&g.skin});})});
});};window.__waterRunGPU=(${runner});window.__skinBenchFamilies=${JSON.stringify(fixtures.benchFamilies)};window.__skinRunThroughput=(${runThroughput.toString()});`;
new vm.Script(program);
const report={pass:false,cpu:fixtures.cpu,hashes:fixtures.hashes,sources:metadata,constants:fixtures.constants,
  limitation:fixtures.limitation+' GPU tests cover production collision stage only, without integration, rendering or an ordinary-game FPS claim.'};
fs.mkdirSync(out,{recursive:true});
if(process.env.DRY_RUN==='1') {
  report.pass=fixtures.cpu.every(c=>c.pass);report.dryRun=true;report.browserLaunched=false;
  report.fixtureSummary=fixtures.fixtures.map(f=>({name:f.name,count:f.particles.length,snowOnly:f.snowOnly,modes:f.modes}));report.benchmark=bench;
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,cpuCases:report.cpu.length,failedCases:report.cpu.filter(c=>!c.pass),gpuFixtures:report.fixtureSummary.length,browserLaunched:false,report:path.join(out,'report.json')},null,2));
  assert(report.pass,'Rendered fluid skin CPU checks');process.exit(0);
}

const float=word=>new Float32Array(new Uint32Array([word]).buffer)[0];
function compare(result) {
  const rows=[];
  for(let ri=0;ri<result.outputs.after.length;ri++) {
    const row=result.outputs.after[ri],before=result.outputs.before[ri],fixture=fixtures.fixtures.find(f=>f.name===row.fixture),checks=[];
    const check=(name,pass,details)=>checks.push({name,pass:!!pass,...(pass?{}:{details})});
    check('Matched source fixture',row.name===before.name);
    const protectedIndices=row.unchanged.concat(Array.from({length:result.capacity-row.count},(_,i)=>i+row.count));
    for(const label of ['before','after']) {
      const r=result.outputs[label][ri];
      for(const key of ['pos','aux','flag']) {
        const lanes=key==='flag'?1:4;
        check(label+' frozen, wrong material and count tail '+key,protectedIndices.every(i=>Array.from({length:lanes},(_,j)=>i*lanes+j).every(k=>r[key][k]===r.input[key][k]&&r.second[key][k]===r.input[key][k])));
      }
    }
    check('Finite active positions and velocities',row.pos.slice(0,row.count*4).map(float).every(Number.isFinite));
    if(fixture.exact)for(const key of ['pos','aux','flag']) {
      check('Ordinary guest unchanged '+key,JSON.stringify(before[key])===JSON.stringify(row[key]));
      check('Repeated ordinary collision unchanged '+key,JSON.stringify(before.second[key])===JSON.stringify(row.second[key]));
    }
    if(fixture.keepPosition)check('Ordinary guest retains its shallow deadband',row.pos[0]===row.input.pos[0]&&row.pos[1]===row.input.pos[1]);
    if(fixture.clearance!==null) {
      for(let i=0;i<fixture.activeCount;i++) {
        const x=float(row.pos[i*4]),y=float(row.pos[i*4+1]);
        const tests=fixture.outlines.map(points=>polygonTest(points,x,y));
        check('Outside every rendered quadratic contour '+i,tests.every(t=>!t.inside),{x,y,tests});
        check('Fixed pixel clearance '+i,tests.every(t=>t.distance>=fixture.clearance-2e-4),tests.map(t=>t.distance));
        if(fixture.terrain==='floor')check('Terrain-clear floor exit '+i,y+(fixture.snowOnly?2.5/Math.sqrt(3.2)*.5:2.5*.5*.85)<128+.002,{x,y});
        if(fixture.name.startsWith('skin-'))check('Shallow skin overlap repaired '+i,row.pos[i*4]!==row.input.pos[i*4]||row.pos[i*4+1]!==row.input.pos[i*4+1]);
        if(fixture.name.startsWith('skin-')) {
          const dx=x-float(row.input.pos[i*4]),dy=y-float(row.input.pos[i*4+1]),distance=Math.hypot(dx,dy);
          const dvx=float(row.pos[i*4+2])-float(row.input.pos[i*4+2]),dvy=float(row.pos[i*4+3])-float(row.input.pos[i*4+3]);
          check('Tangential velocity preserved '+i,Math.abs(dvx*dy-dvy*dx)/(distance||1)<.003,{dx,dy,dvx,dvy});
        }
      }
    }
    // The second collision sees the same scene, without another integration.
    for(let i=0;i<fixture.activeCount;i++)check('Stationary position does not repeatedly repair '+i,
      Math.abs(float(row.pos[i*4])-float(row.second.pos[i*4]))<.002&&Math.abs(float(row.pos[i*4+1])-float(row.second.pos[i*4+1]))<.002);
    if(fixture.name.startsWith('union-forward')) {
      const reverse=result.outputs.after.find(r=>r.name===row.name.replace('union-forward','union-reverse'));
      for(const key of ['pos','aux','flag'])check('Union independent of guest order '+key,JSON.stringify(row[key])===JSON.stringify(reverse[key]));
    }
    if(fixture.name==='skin-convex-water'||fixture.name==='skin-convex-snow') {
      const ray=result.outputs.after.find(r=>r.name===row.name.replace('skin-convex-','skin-convex-ray-'));
      for(const key of ['pos','aux','flag'])check('Convex fast path matches ray path '+key,JSON.stringify(row[key])===JSON.stringify(ray[key]));
    }
    if(fixture.requireFallback&&!fixture.snowOnly)check('Terrain pinch enters compact fallback',row.branches[0]>0,row.branches);
    rows.push({name:row.name,pass:checks.every(c=>c.pass),checks});
  }
  return rows;
}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-fluid-skin-'));
const html='<!doctype html><meta charset="utf-8"><title>Rendered slime fluid boundary test</title><script>window.__waterCollisionAPIs={}</script><script src="/before.js"></script><script src="/after.js"></script><script src="/test.js"></script>';
const server=createServer((req,res)=>{
  const file={'/':['text/html',html],'/before.js':['text/javascript',sources.before],'/after.js':['text/javascript',sources.after],'/test.js':['text/javascript',program]}[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':file[0]}).end(file[1]);
});
let chrome,socket,sequence=0,stopping=false,chromeLog='';const pending=new Map(),browserErrors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanup(){
  if(stopping)return;stopping=true;
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('Browser cleanup'));}pending.clear();
  try{socket?.close();}catch{}
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1500)]);if(chrome.exitCode===null){chrome.kill('SIGKILL');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1500)]);}}
  await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.once('SIGINT',()=>{cleanup().finally(()=>process.exit(130));});process.once('SIGTERM',()=>{cleanup().finally(()=>process.exit(143));});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},timeoutMs);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',data=>{chromeLog=(chromeLog+data.toString()).slice(-30000);});chrome.on('error',e=>browserErrors.push(e.message));
  let endpoint;
  for(let i=0;i<100;i++){try{endpoint=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;}catch{}if(endpoint)break;if(chrome.exitCode!==null)throw new Error('Owned browser exited: '+chromeLog);await sleep(100);}
  assert(endpoint,'Owned Chrome for Testing endpoint');socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onclose=()=>{for(const e of pending.values()){clearTimeout(e.timer);e.reject(new Error('CDP socket closed'));}pending.clear();};
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')browserErrors.push(JSON.stringify(m.params.exceptionDetails));};
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  let ready=false;for(let i=0;i<100;i++){ready=await evaluate('typeof __waterRunGPU === "function" && !!__waterCollisionAPIs.after');if(ready)break;await sleep(50);}assert(ready,'Production source snapshots loaded');
  const started=performance.now();
  const result=await evaluate('(async()=>{const r=window.__waterResult=await __waterRunGPU();return {adapterInfo:r.adapterInfo,capacity:r.capacity,gpuErrors:r.gpuErrors,counts:{before:r.outputs.before.length,after:r.outputs.after.length}};})()');
  result.outputs={before:[],after:[]};for(const label of ['before','after'])for(let i=0;i<result.counts[label];i++)result.outputs[label].push(await evaluate(`__waterResult.outputs.${label}[${i}]`));delete result.counts;
  report.gpu=compare(result);report.gpuErrors=result.gpuErrors;report.browserErrors=browserErrors;report.adapterInfo=result.adapterInfo;report.elapsedMs=performance.now()-started;
  if(bench)report.throughput=await evaluate('__skinRunThroughput()');
  report.pass=report.cpu.every(c=>c.pass)&&report.gpu.every(c=>c.pass)&&!browserErrors.length&&!result.gpuErrors.length&&(!bench||report.throughput.pass);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(out,'chrome.log'),chromeLog);
  if(!report.pass||process.env.SAVE_RAW==='1')fs.writeFileSync(path.join(out,'raw.json'),JSON.stringify(result)+'\n');
  console.log(JSON.stringify({pass:report.pass,cpuCases:report.cpu.length,gpuCases:report.gpu.length,checks:report.cpu.reduce((n,r)=>n+Object.keys(r.checks).length,0)+report.gpu.reduce((n,r)=>n+r.checks.length,0),failedCases:[...report.cpu,...report.gpu].filter(c=>!c.pass),throughput:report.throughput?.rows.map(({samplesMs,...r})=>r),report:path.join(out,'report.json')},null,2));
  assert(report.pass,'Rendered slime fluid skin checks');
}catch(error){let progress;try{if(socket?.readyState===1)progress=await evaluate('__waterProgress');}catch{}fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,progress,browserErrors,sources:metadata},null,2)+'\n');throw error;
}finally{await cleanup();}
