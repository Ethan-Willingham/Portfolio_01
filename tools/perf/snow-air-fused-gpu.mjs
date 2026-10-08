#!/usr/bin/env node
// Exact GPU comparison of 60 Jacobi pressure steps and the fused workgroup.
// Eight arbitrary pressure fields compare both final ping-pong buffers; six
// complete air projections also compare mass, face fields and output pixels.
// AFTER=/path/candidate.js BEFORE=/path/reference.js CHROME=/path/browser
// DRY_RUN=1 validates source hooks without launching a GPU browser.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.DUMP||path.join(os.tmpdir(),'sluice-pressure-gpu');
const port=Number(process.env.PORT||8882),debug=port+1000,labels=['baseline','candidate'];
const before=process.env.BEFORE?fs.readFileSync(process.env.BEFORE,'utf8'):execFileSync('git',['show',(process.env.BEFORE_REF||'4219c6f6c5e2bf86316d5e14ac156720f0184598')+':js/liquid-wgpu.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const after=fs.readFileSync(process.env.AFTER||path.join(root,'js/liquid-wgpu.js'),'utf8');
const metadata={beforeSHA256:createHash('sha256').update(before).digest('hex'),afterSHA256:createHash('sha256').update(after).digest('hex')};
fs.mkdirSync(out,{recursive:true});
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
const sources=labels.map((name,n)=>{
  let source=n?after:before;
  assert.equal(source.split(marker).length,2);
  source=source.replace(marker,marker+`\nwindow.__pressureAPIs.${name}={WGSL_SNOW_BOUNDARY,buildSnowBoundary,runSnowBoundary,buildFused:typeof buildSnowBoundaryFused==='function'?buildSnowBoundaryFused:null};`);
  new vm.Script(source);return source;
});
if(process.env.DRY_RUN==='1'){console.log(JSON.stringify({metadata,out}));process.exit(0);}
async function check(timing=false){
  const apis=window.__pressureAPIs;
  if(apis.baseline.WGSL_SNOW_BOUNDARY!==apis.candidate.WGSL_SNOW_BOUNDARY)throw Error('Original shader changed');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter||adapter.limits.maxComputeWorkgroupStorageSize<32768)throw Error('32KiB workgroup storage unavailable');
  if(timing&&!adapter.features.has('timestamp-query'))throw Error('GPU timestamp queries unavailable');
  const device=await adapter.requestDevice({requiredFeatures:timing?['timestamp-query']:[],requiredLimits:{maxComputeWorkgroupStorageSize:32768,maxComputeInvocationsPerWorkgroup:adapter.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:adapter.limits.maxComputeWorkgroupSizeX,maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const create=device.createBuffer.bind(device);
  device.createBuffer=d=>create({...d,usage:(d.usage&GPUBufferUsage.MAP_READ)?d.usage:d.usage|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const instances={};
  const mk=(label,size,usage=GPUBufferUsage.STORAGE)=>device.createBuffer({label,size,usage});
  function params(i,n){i.uploadedCount=n;i.snowGrainHost.set([100,50,12,1/240,64,64,n,1,4,0,1.4,3.2,400,330,0,0]);device.queue.writeBuffer(i.snowGrainParams,0,i.snowGrainHost);}
  for(const name of ['baseline','candidate']){
    const i={device,queue:device.queue,buf:{pos:mk('pos',8192*16),flag:mk('flag',8192*4)},snowGrainParams:mk('params',64,GPUBufferUsage.UNIFORM),snowGrainHost:new Float32Array(16)};
    i.snowAirTexture=device.createTexture({size:[64,64],format:'rgba32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    params(i,0);device.pushErrorScope('validation');apis[name].buildSnowBoundary(i);if(apis[name].buildFused){apis[name].buildFused(i);if(i.snowBoundaryFusedReady)await i.snowBoundaryFusedReady;}
    const error=await device.popErrorScope();if(error)throw Error(error.message);instances[name]=i;
  }
  if(!instances.candidate.snowBoundaryFused)throw Error('Fused path not built');
  const unsupported={device:{limits:{maxComputeWorkgroupStorageSize:16384}}};
  apis.candidate.buildFused(unsupported);if(unsupported.snowBoundaryFused!==null)throw Error('Capability fallback failed');
  async function read(i,key){const b=i.buf[key],r=mk('read',b.size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);const enc=device.createCommandEncoder();enc.copyBufferToBuffer(b,0,r,0,b.size);device.queue.submit([enc.finish()]);await r.mapAsync(GPUMapMode.READ);const v=new Uint32Array(r.getMappedRange().slice(0));r.unmap();r.destroy();return v;}
  async function texture(i){const r=mk('textureRead',4096*16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:i.snowProjectedAir},{buffer:r,bytesPerRow:1024,rowsPerImage:64},[64,64]);device.queue.submit([enc.finish()]);await r.mapAsync(GPUMapMode.READ);const v=new Uint32Array(r.getMappedRange().slice(0));r.unmap();r.destroy();return v;}
  function equal(a,b,label){if(a.length!==b.length)throw Error(label+' length');for(let j=0;j<a.length;j++)if(a[j]!==b[j])throw Error(label+' differs at '+j+':'+a[j]+'/'+b[j]);}
  let seed=192837;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const report=[];
  function dispatchPressure(i,fused,descriptor){const enc=device.createCommandEncoder(),pass=enc.beginComputePass(descriptor);if(fused){pass.setPipeline(i.snowBoundaryFused.pipeline);pass.setBindGroup(0,i.snowBoundaryFused.group);pass.dispatchWorkgroups(1);}else{pass.setPipeline(i.snowBoundaryPipes.pressure);for(let j=0;j<60;j++){pass.setBindGroup(0,i.snowBoundaryBG[j%2]);pass.dispatchWorkgroups(16);}}pass.end();device.queue.submit([enc.finish()]);}
  try{
    for(const name of ['zero','random','constant','checker','walls','near-closed','closed','edge-impulse']){
      const field=new Float32Array(4096*4),p0=new Float32Array(4096),p1=new Float32Array(4096);
      for(let j=0;j<4096;j++){
        const x=j%64,y=j>>6;field[j*4]=(random()-.5)*100;field[j*4+1]=(random()-.5)*100;
        field[j*4+2]=name==='zero'?0:name==='constant'?7:name==='edge-impulse'?+(x===1&&y===1)*100:(random()-.5)*20;
        field[j*4+3]=name==='closed'?1:name==='near-closed'?1-((j%3)+1)*1e-7:name==='walls'?+(x===30||y===26):name==='checker'?(x+y)%2:name==='random'?random():0;
        p0[j]=name==='zero'?0:(random()-.5)*16;p1[j]=name==='zero'?0:(random()-.5)*24;
      }
      const outputs={};
      for(const label of ['baseline','candidate']){const i=instances[label];device.queue.writeBuffer(i.buf.snowAirField,0,field);device.queue.writeBuffer(i.buf.snowAirPressure0,0,p0);device.queue.writeBuffer(i.buf.snowAirPressure1,0,p1);dispatchPressure(i,label==='candidate');outputs[label]=[await read(i,'snowAirPressure0'),await read(i,'snowAirPressure1')];}
      equal(outputs.baseline[0],outputs.candidate[0],name+' pressure60');equal(outputs.baseline[1],outputs.candidate[1],name+' pressure59');report.push({name,exactPressureWords:8192});
    }
    for(const c of [{name:'empty',n:0},{name:'mixed-wind',n:2049},{name:'dense-pile',n:8192},{name:'masked-inlet',n:4096},{name:'frozen-grains',n:1025},{name:'fallback',n:513,fallback:true}]){
      const inlet=new Float32Array(4096*4),pos=new Float32Array(c.n*4),flags=new Uint32Array(c.n);
      for(let j=0;j<4096;j++){const x=j%64,y=j>>6;inlet.set([Math.sin(x*.24)*60,Math.cos(y*.17)*50,c.name==='masked-inlet'&&x>20&&x<35&&y>20?0:1,(j%7)*.1],j*4);}
      for(let j=0;j<c.n;j++){const x=c.name==='dense-pile'?330+j%64*.8:60+random()*850,y=c.name==='dense-pile'?450+Math.floor(j/64)*.8:20+random()*840;pos.set([x,y,(random()-.5)*100,(random()-.5)*100],j*4);flags[j]=j%7===0?0:65;if(c.name==='frozen-grains'&&j%3===0)flags[j]|=32;}
      const outputs={};
      for(const label of ['baseline','candidate']){
        const i=instances[label];params(i,c.n);if(c.n){device.queue.writeBuffer(i.buf.pos,0,pos);device.queue.writeBuffer(i.buf.flag,0,flags);}device.queue.writeTexture({texture:i.snowAirTexture},inlet,{bytesPerRow:1024},[64,64]);
        const fused=i.snowBoundaryFused;if(c.fallback)i.snowBoundaryFused=null;
        i.frameEncoder=device.createCommandEncoder();apis[label].runSnowBoundary(i);device.queue.submit([i.frameEncoder.finish()]);i.frameEncoder=null;i.snowBoundaryFused=fused;
        outputs[label]={};for(const key of ['snowAirPressure0','snowAirPressure1','snowAirField','snowAirMass'])outputs[label][key]=await read(i,key);outputs[label].texture=await texture(i);
      }
      for(const key of Object.keys(outputs.baseline))equal(outputs.baseline[key],outputs.candidate[key],c.name+'/'+key);report.push({name:c.name,exactCompleteWords:45056});
    }
    let timings=null;
    if(timing){
      const rounds=40,queries=device.createQuerySet({type:'timestamp',count:rounds*4});
      for(let warm=0;warm<8;warm++)for(const label of ['baseline','candidate'])dispatchPressure(instances[label],label==='candidate');
      for(let round=0;round<rounds;round++)for(let n=0;n<2;n++){
        const label=['baseline','candidate'][n],index=round*4+n*2;
        dispatchPressure(instances[label],n===1,{timestampWrites:{querySet:queries,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}});
      }
      const resolved=mk('queries',rounds*32,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC),readback=mk('queryRead',rounds*32,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),enc=device.createCommandEncoder();
      enc.resolveQuerySet(queries,0,rounds*4,resolved,0);enc.copyBufferToBuffer(resolved,0,readback,0,rounds*32);device.queue.submit([enc.finish()]);await readback.mapAsync(GPUMapMode.READ);
      const times=new BigUint64Array(readback.getMappedRange().slice(0));timings={};
      for(let n=0;n<2;n++){const values=[];for(let round=0;round<rounds;round++){const j=round*4+n*2;values.push(Number(times[j+1]-times[j])/1e6);}const sorted=values.slice().sort((a,b)=>a-b);timings[['baseline','candidate'][n]]={count:rounds,averageMs:values.reduce((a,b)=>a+b,0)/rounds,medianMs:sorted[20],p95Ms:sorted[38],samplesMs:values};}
      readback.unmap();readback.destroy();resolved.destroy();queries.destroy();
    }
    await device.queue.onSubmittedWorkDone();if(errors.length)throw Error(errors.join('\n'));return {passed:true,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture},reports:report,errors,timings};
  }finally{device.destroy();}
}
const page='<script>window.__pressureAPIs={}</script>'+labels.map((_,i)=>`<script src="/${i}.js"></script>`).join('')+'<script>window.__runPressure='+check.toString()+'</script>';
const server=http.createServer((req,res)=>{const m=req.url.match(/^\/(\d)\.js$/);res.setHeader('Content-Type',m?'text/javascript':'text/html');res.end(m?sources[+m[1]]:page);});await new Promise(r=>server.listen(port,'127.0.0.1',r));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-pressure-profile-'));const browser=spawn(process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing')),['--headless=new','--enable-unsafe-webgpu','--use-angle='+(process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan'),'--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,seq=0;const pending=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});const ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
const watchdog=setTimeout(()=>{browser.kill();server.close();process.exit(1)},180000);
try{let endpoint;for(let n=0;n<100&&!endpoint;n++){try{endpoint=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;}catch{}if(!endpoint)await sleep(100);}socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r));socket.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(r.method==='Runtime.exceptionThrown')console.log(JSON.stringify(r));if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}});await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}`});for(let n=0;n<100;n++){if(await ev('typeof window.__runPressure === "function"'))break;await sleep(100);if(n===99)throw Error('Page did not initialize');}console.log('PRESSURE_CHECK_START');const result=await ev('__runPressure('+JSON.stringify(process.env.TIMING==='1')+')');fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({metadata,...result},null,2));console.log(JSON.stringify(result));}finally{clearTimeout(watchdog);socket?.close();browser.kill();server.close();}
