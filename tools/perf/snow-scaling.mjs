// Controlled scaling of the production snow grain kernels, without terrain or actors.
// DUMP=/tmp/snow-scaling node tools/perf/snow-scaling.mjs
// COUNTS=1000,4000,16000 ROUNDS=2 SAMPLES=24 WARMUP=32 optionally shorten the sweep.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.DUMP||'/tmp/sluice-snow-scaling';
assert(!path.resolve(out).startsWith(root+path.sep),'Artifacts stay outside the repo');
const counts=(process.env.COUNTS||'500,1000,2000,4000,8000,12000,16000,24000,36000').split(',').map(Number);
assert(counts.every(n=>Number.isInteger(n)&&n>=1&&n<=36000),'Positive counts must fit the active snow budget');
const options={samples:Number(process.env.SAMPLES||24),warmup:Number(process.env.WARMUP||32)};
const rounds=Number(process.env.ROUNDS||2);
assert(Number.isInteger(options.samples)&&Number.isInteger(options.warmup)&&Number.isInteger(rounds)&&
 options.samples>=5&&options.samples<=100&&options.warmup>=2&&options.samples+options.warmup<=128&&rounds>=1&&rounds<=5);
const original=fs.readFileSync(process.env.LIQUID_SOURCE||root+'/js/liquid-wgpu.js','utf8');
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
assert.equal(original.split(marker).length,2,'Unique private export anchor');
const source=original.replace(marker,marker+`
window.__snowScaleAPI={buildBuffers:buildBuffers,buildGridPipelines:buildGridPipelines,
  prepareSnowGrains:prepareSnowGrains,writeGameParams:writeGameParams,buildGrid:buildGrid,
  runSnowGrains:runSnowGrains,readbackBuffer:readbackBuffer,
  setSparse:function(){LIQUID_SPARSE=1;LIQUID_SPARSE_MIN_CELLS=1;},
  motion:function(instance){var pass=instance.frameEncoder.beginComputePass({label:'snow.motion'});
    pass.setPipeline(instance.snowGrainPipe.trackMotion);pass.setBindGroup(0,instance.snowGrainBG);
    pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));pass.end();}};`);
new vm.Script(source);
async function initialize() {
  const api=window.__snowScaleAPI;
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter||!adapter.features.has('timestamp-query'))throw Error('GPU timestamps required');
  const device=await adapter.requestDevice({requiredFeatures:['timestamp-query'],
    requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const cells=256*256,capacity=40000,dt=(1/120)/1.38366702/2;
  const instance={device,queue:device.queue,maxParticles:capacity,uploadedCount:0,frameEncoder:null,
    cellSize:2.5,stepDt:dt,liquid:{getGameState:()=>({})}};
  device.pushErrorScope('validation');
  api.buildBuffers(instance);api.buildGridPipelines(instance);api.prepareSnowGrains(instance,dt);api.writeGameParams(instance,1);
  const error=await device.popErrorScope();if(error)throw Error(error.message);
  if(!instance.sparseGridOK)throw Error('Production sparse grid unavailable');
  // The isolated index build uses clearPrev=false, so no P2G/pressure dispatch
  // runs. Their readiness gates do not represent a simulated water chain here.
  instance.sparseP2GOK=instance.sparseGrid2OK=true;api.setSparse();
  const query=device.createQuerySet({type:'timestamp',count:4096});
  const resolve=device.createBuffer({size:32768,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size:32768,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  async function point(n,family,options){
    instance.uploadedCount=n;instance.grid={w:256,h:256,cells};
    const params=instance.paramsHost,f=instance.paramsHostF;
    params.fill(0);params[0]=n;params[1]=params[2]=256;params[5]=cells;
    f[6]=dt;f[7]=.4;f[8]=64;f[9]=32;f[10]=64;f.set([0,0,639,639],16);
    device.queue.writeBuffer(instance.paramsBuf,0,params);api.prepareSnowGrains(instance,dt);
    const pos=new Float32Array(Math.max(1,n)*4),aux=new Float32Array(Math.max(1,n)*4),
      affine=new Float32Array(Math.max(1,n)*4),flag=new Uint32Array(Math.max(1,n));
    const diameter=2.5/Math.sqrt(3.2),cols=Math.max(1,Math.ceil(Math.sqrt(n)));
    const extent=family==='fixed-80px-square'?80:40;
    for(let i=0;i<n;i++){
      const c=i%cols,r=Math.floor(i/cols);
      const x=42+(family==='constant-density'?(c+(r%2)*.5)*diameter:(c+.5)*extent/cols);
      const y=42+(family==='constant-density'?r*diameter*Math.sqrt(.75):(r+.5)*extent/cols);
      pos.set([x,y,(i%7-3)*.1,(i%5)*.1],i*4);aux.set([3.2,0,x,y],i*4);affine.set([.7,0,0,.6],i*4);flag[i]=73;
    }
    const seeds={};
    for(const [name,data] of Object.entries({pos,aux,affine,flag})){
      seeds[name]=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
      device.queue.writeBuffer(seeds[name],0,data);
    }
    function reset(enc){
      for(const [name,data] of Object.entries({pos,aux,affine,flag}))enc.copyBufferToBuffer(seeds[name],0,instance.buf[name],0,data.byteLength);
      enc.clearBuffer(instance.buf.cellCount);enc.clearBuffer(instance.buf.cellCursor);enc.clearBuffer(instance.buf.blockBitmap);
    }
    function encode(enc,base){
      const begin=enc.beginComputePass.bind(enc),names=[];let next=0;
      enc.beginComputePass=function(d={}){
        names.push(d.label||'compute');const offset=next;next+=2;
        return begin({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:base+offset,endOfPassWriteIndex:base+offset+1}});
      };
      instance.frameEncoder=enc;
      api.runSnowGrains(instance,'predict');api.buildGrid(instance,false,true);
      for(let pass=0;pass<5;pass++){
        api.runSnowGrains(instance,pass===4?'shield':'contacts',undefined,pass===0);
        api.motion(instance);
      }
      instance.frameEncoder=null;
      enc.beginComputePass=begin;
      if(next>32)throw Error('Timestamp sample slot overflow');
      return {names,base};
    }
    const samples=[];device.pushErrorScope('validation');
    const enc=device.createCommandEncoder({label:'snow.scalingBatch'}),steps=[];
    for(let s=0;s<options.warmup+options.samples;s++){reset(enc);steps.push(encode(enc,s*32));}
    enc.resolveQuerySet(query,0,steps.length*32,resolve,0);enc.copyBufferToBuffer(resolve,0,read,0,steps.length*256);
    device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
    const times=new BigUint64Array(read.getMappedRange());
    for(let s=0;s<steps.length;s++){
      const q=steps[s];
      const row={totalMs:0,passSumMs:0,passes:{}};
      let first=null,last=0n;
      q.names.forEach((name,i)=>{
        const begin=times[q.base+i*2],end=times[q.base+i*2+1];
        if(begin===0n&&end===0n)throw Error('Missing timestamps: '+name);
        if(begin===0n||end<begin)throw Error('Invalid pass timestamps: '+name);
        if(first===null||begin<first)first=begin;if(end>last)last=end;
        row.passes[name]=(row.passes[name]||0)+Number(end-begin)/1e6;
      });
      row.totalMs=first===null?0:Number(last-first)/1e6;
      row.passSumMs=Object.values(row.passes).reduce((a,b)=>a+b,0);
      if(!(row.totalMs>0))throw Error('Missing full-step GPU timestamps');
      if(s>=options.warmup)samples.push(row);
    }
    read.unmap();for(const seed of Object.values(seeds))seed.destroy();
    const counts=new Uint32Array(await api.readbackBuffer(instance,instance.buf.cellCount,cells*4));
    let occupied=0,max=0,squared=0,grains=0,neighborWork5x5=0;
    for(const count of counts){if(count)occupied++;max=Math.max(max,count);squared+=count*count;grains+=count;}
    for(let c=0;c<cells;c++)if(counts[c]){
      const x=c%256,y=Math.floor(c/256);let neighbors=0;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<256&&y+dy>=0&&y+dy<256)neighbors+=counts[c+dy*256+dx];
      neighborWork5x5+=counts[c]*neighbors;
    }
    const blocks=new Uint32Array(await api.readbackBuffer(instance,instance.buf.blockMeta,16))[0];
    if(grains!==n)throw Error('Grid dropped grains: '+grains+' vs '+n);
    const result=new Float32Array(await api.readbackBuffer(instance,instance.buf.pos,Math.max(1,n)*16));
    if(result.some(value=>!Number.isFinite(value)))throw Error('Non-finite grain state');
    const validation=await device.popErrorScope();if(validation)throw Error(validation.message);
    if(errors.length)throw Error(errors.join(';'));
    const ordered=samples.map(s=>s.totalMs).sort((a,b)=>a-b);
    return {family,n,grid:{cells,occupied,activeBlocks:blocks,maxGrains:max,meanOccupiedGrains:occupied?grains/occupied:0,sumSquaredCounts:squared,neighborWork5x5},samples,
      medianMs:ordered[Math.floor(ordered.length/2)],p95Ms:ordered[Math.ceil(ordered.length*.95)-1]};
  }
  window.__snowScaling={point,info:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,
    device:adapter.info.device,description:adapter.info.description,dt,capacity,cells},
    dispose:function(){query.destroy();resolve.destroy();read.destroy();device.destroy();}};
  return __snowScaling.info;
}
const program='window.__initializeSnowScaling='+initialize.toString()+';';
const html='<meta charset="utf-8"><title>Controlled snow scaling</title><script src="/gpu.js"></script><script src="/test.js"></script>';
const server=createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname;
  const body={'/':html,'/gpu.js':source,'/test.js':program}[route];
  res.writeHead(body?200:404,{'Content-Type':route==='/'?'text/html':'text/javascript','Cache-Control':'no-store'}).end(body||'');});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-snow-scale-'));
let chrome,socket,seq=0;const pending=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},45000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
fs.mkdirSync(out,{recursive:true});
const report={sourceSHA256:createHash('sha256').update(original).digest('hex'),sourceCommit:process.env.SOURCE_COMMIT||null,
  counts,options,rounds,rows:[],started:new Date().toISOString(),
  limitations:'Controlled GPU tick, not gameplay FPS. Actual production prediction, snow index, four contact passes, final contact/shield and tracking after each contact. No terrain, residents, rendering, airflow projection or water. A single submitted batch per point avoids CPU map gaps between warm-up and samples. Inputs and index counts reset with GPU copies before each timed step; five relaxation passes then run without resets. Production atomic index ordering retained. Fixed grid and region cover all grains. Full timestamp span is earliest kernel begin to latest kernel end, including inter-pass copies and gaps; excludes test resets, compilation and readback. Pass sums also reported. Zero snow runs no grain chain and is not a measured baseline.'};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,debug=Number(process.env.DEBUG_PORT||9896);
  chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
  let tab;for(let i=0;i<100;i++){try{tab=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');}catch{}if(tab)break;await sleep(100);}assert(tab,'Testing browser started');
  socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  let ready=false;for(let i=0;i<100;i++){if(await ev('!!window.__snowScaleAPI&&!!window.__initializeSnowScaling')){ready=true;break;}await sleep(50);}assert(ready);
  report.adapter=await ev('__initializeSnowScaling()');
  const families=['constant-density','fixed-80px-square','fixed-40px-square'];
  for(let round=0;round<rounds;round++)for(const n of round%2?[...counts].reverse():counts){
    for(const family of round%2?[...families].reverse():families){
      const row=await ev('__snowScaling.point('+n+','+JSON.stringify(family)+','+JSON.stringify(options)+')');
      row.round=round;report.rows.push(row);fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
      console.log(JSON.stringify({round,family,n,ms:row.medianMs,maxCell:row.grid.maxGrains}));
    }
  }
  await ev('__snowScaling.dispose()');report.ended=new Date().toISOString();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:true,out,points:report.rows.length}));
}finally{
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Cleanup'));}pending.clear();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  server.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
