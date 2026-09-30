// Warm-GPU replay of one complete production snow tick from natural town state.
// SNAPSHOT=/tmp/capture/resident-snapshot.json DUMP=/tmp/town-scaling node tools/perf/snow-town-scaling.mjs
// DRY_RUN=1 validates source anchors, hashes and thinning without opening a browser.
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
const snapshotPath=process.env.SNAPSHOT||'/tmp/sluice-v129-scaling-town/resident-snapshot.json';
const out=process.env.DUMP||'/tmp/sluice-snow-town-scaling';
const dryRun=process.env.DRY_RUN==='1';
assert(!path.resolve(out).startsWith(root+path.sep),'Artifacts stay outside the repo');
const options={warmup:Number(process.env.WARMUP||32),samples:Number(process.env.SAMPLES||24),stride:64};
const rounds=Number(process.env.ROUNDS||2);
assert(Number.isInteger(options.warmup)&&options.warmup>=2&&Number.isInteger(options.samples)&&options.samples>=5&&options.warmup+options.samples<=64,'Batch must fit 4096 timestamp queries');
assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=5,'Rounds must be between one and five');
const original=fs.readFileSync(process.env.LIQUID_SOURCE||root+'/js/liquid-wgpu.js','utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const wordBytes=values=>{const bytes=Buffer.alloc(values.length*4);values.forEach((value,i)=>bytes.writeUInt32LE(value,i*4));return bytes;};
const sourceSHA256=sha(original);
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
const terrainAnchor="    var cp = grainPass || enc.beginComputePass({ label: 'liquid.collide' });";
assert.equal(original.split(marker).length,2,'Unique private export anchor');
assert.equal(original.split(terrainAnchor).length,2,'Unique terrain pass boundary');
const source=original.replace(terrainAnchor,terrainAnchor+`
    if(grainPass){cp.end();cp=enc.beginComputePass({label:'snow.terrain'});}`)
 .replace(marker,marker+`
window.__snowTownAPI={buildBuffers:buildBuffers,buildGridPipelines:buildGridPipelines,
 buildCollidePipelines:buildCollidePipelines,prepareSnowGrains:prepareSnowGrains,
 buildGrid:buildGrid,runSnowGrains:runSnowGrains,
 configureSparse:function(instance,state){LIQUID_SPARSE=state.enabled?1:0;
  instance.sparseVeto=state.veto;instance.sparseP2GOK=instance.sparseGrid2OK=true;
  return useSparse(instance);}};`);
new vm.Script(source);
const snapshot=fs.existsSync(snapshotPath)?JSON.parse(fs.readFileSync(snapshotPath,'utf8')):null;
let selection=null,counts=null,sparseState=null;
function hashIndex(i,posWords){let h=(i^posWords[i*4]^Math.imul(posWords[i*4+1],73856093))>>>0;h=Math.imul(h^(h>>>16),2246822519);h=Math.imul(h^(h>>>13),3266489917);return (h^(h>>>16))>>>0;}
if(snapshot){
 assert.equal(snapshot.schema,'sluice-resident-snapshot-v1','Supported resident snapshot schema');
 assert.equal(snapshot.metadata.source.liquidSHA256,sourceSHA256,'Snapshot source must match the actual GPU engine');
 for(const group of ['buffers','uniforms'])for(const [key,values] of Object.entries(snapshot[group])){
  const expected=snapshot.hashes[group][key];assert.equal(values.length,expected.words,key+' word count');
  assert.equal(sha(wordBytes(values)),expected.sha256,key+' byte hash');
 }
 for(const key of ['gameState','view','snowAir',...(snapshot.sparse?['sparse']:[])])assert.equal(sha(JSON.stringify(snapshot[key])),snapshot.hashes.native[key],key+' native state hash');
 for(const key of ['pos','aux','affine'])assert.equal(snapshot.buffers[key].length,snapshot.count*4,'Complete '+key);
 assert.equal(snapshot.buffers.flag.length,snapshot.count,'Complete flags');
 assert(!snapshot.snowAir?.active,'Active air requires a snapshot of the true projected GPU air texture');
 const pos=new Float32Array(new Uint32Array(snapshot.buffers.pos).buffer);
 const gp=new Float32Array(new Uint32Array(snapshot.uniforms.paramsHost).buffer);
 const eligible=[],passive=[],water=[];
 for(let i=0;i<snapshot.count;i++){
  const flag=snapshot.buffers.flag[i],type=(flag&3)|((flag>>>4)&4);
  if(type!==5){water.push(i);continue;}
  if(!(flag&32)&&pos[i*4]>=gp[16]&&pos[i*4]<=gp[18]&&pos[i*4+1]>=gp[17]&&pos[i*4+1]<=gp[19])eligible.push(i);
  else passive.push(i);
 }
 assert(eligible.length>0,'At least one active in-region grain');
 const ranked=eligible.map(i=>({i,hash:hashIndex(i,snapshot.buffers.pos)})).sort((a,b)=>a.hash-b.hash||a.i-b.i);
 selection={eligible,ranked:ranked.map(item=>item.i),passive,water};
 counts=process.env.COUNTS?process.env.COUNTS.split(',').map(Number):[500,1000,2000,4000,8000,eligible.length].filter(n=>n<=eligible.length);
 counts=[...new Set(counts)];
 assert(counts.every(n=>Number.isInteger(n)&&n>=1&&n<=eligible.length),'Every point must contain positive eligible snow');
 assert.equal(snapshot.grid.cells,snapshot.uniforms.paramsHost[5],'Captured grid dimensions agree');
 if(snapshot.sparse){
  sparseState={enabled:snapshot.sparse.enabled??true,veto:!!snapshot.sparse.veto,
   active:!!snapshot.sparse.active,threshold:snapshot.sparse.threshold,from:'captured'};
 }else{
  const threshold=32768,cells=snapshot.grid.cells;
  assert(cells>=threshold||cells<threshold/2,'Hybrid hysteresis requires captured sparse state in the intermediate band');
  sparseState={enabled:true,veto:cells<threshold/2,active:cells>=threshold,from:'unambiguous default hybrid threshold',threshold};
 }
}
async function initializeTownScale(){
 const snapshot=window.__townSnapshot,selection=window.__townSelection,state=window.__townSparse,api=window.__snowTownAPI;
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter||!adapter.features.has('timestamp-query'))throw Error('GPU timestamps required');
 const device=await adapter.requestDevice({requiredFeatures:['timestamp-query'],requiredLimits:{
  maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage,
  maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize}});
 const errors=[];let disposing=false;
 device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
 device.lost.then(info=>{if(!disposing)errors.push('Device lost: '+info.message);});
 const snowF=new Float32Array(new Uint32Array(snapshot.uniforms.snowGrainHost).buffer),dt=snowF[3];
 const instance={device,queue:device.queue,maxParticles:snapshot.maxParticles,uploadedCount:snapshot.count,
  frameEncoder:null,g2pReady:true,cellSize:snapshot.cellSize,stepDt:snapshot.stepDt,
  grid:{...snapshot.grid},terrain:{...snapshot.terrain},liquid:{getGameState:()=>snapshot.gameState,getSnowAir:()=>null}};
 device.pushErrorScope('validation');
 api.buildBuffers(instance);api.buildGridPipelines(instance);api.buildCollidePipelines(instance);api.prepareSnowGrains(instance,dt);
 const initializationError=await device.popErrorScope();if(initializationError)throw Error(initializationError.message);
 if(!instance.gridReady||!instance.collideReady)throw Error('Production snow pipelines unavailable');
 if(api.configureSparse(instance,state)!==state.active)throw Error('Captured sparse mode unavailable on this device');
 const restore=(host,words)=>new Uint32Array(host.buffer,host.byteOffset,host.byteLength/4).set(words);
 restore(instance.paramsHost,snapshot.uniforms.paramsHost);restore(instance.gameParamsHost,snapshot.uniforms.gameParamsHost);
 restore(instance.simParamsHost,snapshot.uniforms.simParamsHost);restore(instance.snowGrainHost,snapshot.uniforms.snowGrainHost);
 if(instance.gameParamsBufs.length!==snapshot.gameParams.slots)throw Error('Game uniform slot layout changed');
 const gameWords=new Uint32Array(snapshot.uniforms.gameParamsHost),lanes=snapshot.gameParams.lanesPerSlot;
 instance.gameParamsBufs.forEach((buffer,slot)=>device.queue.writeBuffer(buffer,0,gameWords.subarray(slot*lanes,(slot+1)*lanes)));
 device.queue.writeBuffer(instance.simParamsBuf,0,new Uint32Array(snapshot.uniforms.simParamsHost));
 device.queue.writeBuffer(instance.buf.terrainMask,0,new Uint32Array(snapshot.buffers.terrainMask));
 const query=device.createQuerySet({type:'timestamp',count:4096});
 const resolve=device.createBuffer({size:32768,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
 async function point(n,options){
  const chosen=new Set(selection.ranked.slice(0,n)),eligible=new Set(selection.eligible),sourceIndices=[];
  for(let i=0;i<snapshot.count;i++)if(!eligible.has(i)||chosen.has(i))sourceIndices.push(i);
  if(chosen.size!==n||sourceIndices.length!==snapshot.count-selection.eligible.length+n)throw Error('Thinning duplicates or drops passive rows');
  const count=sourceIndices.length,seeds={},values={};
  for(const key of ['pos','aux','affine','flag']){
   const stride=key==='flag'?1:4,data=new Uint32Array(count*stride);
   sourceIndices.forEach((original,row)=>{for(let lane=0;lane<stride;lane++)data[row*stride+lane]=snapshot.buffers[key][original*stride+lane];});
   values[key]=data;seeds[key]=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
   device.queue.writeBuffer(seeds[key],0,data);
  }
  instance.uploadedCount=count;instance.paramsHost[0]=count;instance.snowGrainHost[6]=count;
  device.queue.writeBuffer(instance.paramsBuf,0,instance.paramsHost);device.queue.writeBuffer(instance.snowGrainParams,0,instance.snowGrainHost);
  const steps=options.warmup+options.samples,counterBytes=steps*6*8;
  const counters=device.createBuffer({size:counterBytes,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const layout={timestamps:{offset:0,size:32768},dispatches:{offset:32768,size:counterBytes}};
  let size=32768+counterBytes;
  for(const [key,bytes] of Object.entries({cellCount:snapshot.grid.cells*4,cellOf:count*4,sortedIdx:count*4,snowDispatch:16,blockMeta:16,pos:count*16,aux:count*16,affine:count*16,flag:count*4})){
   layout[key]={offset:size,size:bytes};size+=bytes;
  }
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   device.pushErrorScope('validation');
   const encoder=device.createCommandEncoder({label:'snow.townBatch'}),records=[];
   for(let sample=0;sample<steps;sample++){
    for(const [key,data] of Object.entries(values))encoder.copyBufferToBuffer(seeds[key],0,instance.buf[key],0,data.byteLength);
    encoder.clearBuffer(instance.buf.cellCount,0,snapshot.grid.cells*4);encoder.clearBuffer(instance.buf.cellCursor,0,snapshot.grid.cells*4);encoder.clearBuffer(instance.buf.blockBitmap);
    const begin=encoder.beginComputePass.bind(encoder),passes=[];let next=0,call=0,stage='predict';
    encoder.beginComputePass=function(descriptor={}){const index=sample*options.stride+next;next+=2;
     passes.push({name:descriptor.label||'compute',index,call,stage});
     return begin({...descriptor,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}});};
    const publishDispatches=()=>{
     const offset=(sample*6+call)*8;
     encoder.copyBufferToBuffer(instance.buf.snowGuestDispatch,0,counters,offset,4);
     encoder.copyBufferToBuffer(instance.buf.snowFallbackDispatch,0,counters,offset+4,4);
    };
    instance.frameEncoder=encoder;
    try{
     api.runSnowGrains(instance,'predict',0);publishDispatches();api.buildGrid(instance,false,true);
     for(let contact=0;contact<5;contact++){
      call=contact+1;stage=contact===4?'shield':'contacts';
      api.runSnowGrains(instance,stage,0,contact===0);publishDispatches();
     }
    }finally{instance.frameEncoder=null;encoder.beginComputePass=begin;}
    if(next>options.stride)throw Error('Timestamp sample slot overflow: '+next);
    records.push({sample,passes,queryCount:next});
   }
   encoder.resolveQuerySet(query,0,steps*options.stride,resolve,0);
   encoder.copyBufferToBuffer(resolve,0,read,0,steps*options.stride*8);
   encoder.copyBufferToBuffer(counters,0,read,layout.dispatches.offset,counterBytes);
   for(const key of ['cellCount','cellOf','sortedIdx','snowDispatch','blockMeta','pos','aux','affine','flag']){
    const src=key==='snowDispatch'?instance.buf.snowGrainDispatch:instance.buf[key];
    encoder.copyBufferToBuffer(src,0,read,layout[key].offset,layout[key].size);
   }
   device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
   const mapped=read.getMappedRange(),times=new BigUint64Array(mapped,0,4096);
   const dispatch=new Uint32Array(mapped,layout.dispatches.offset,counterBytes/4);
   const rows=records.map(record=>{
    const row={sample:record.sample,warmup:record.sample<options.warmup,totalMs:0,passSumMs:0,groups:{},passes:[],dispatches:[]};
    for(let call=0;call<6;call++)row.dispatches.push({guestX:dispatch[(record.sample*6+call)*2],fallbackX:dispatch[(record.sample*6+call)*2+1]});
    let first=null,last=0n;
    for(const pass of record.passes){
     const a=times[pass.index],b=times[pass.index+1],args=row.dispatches[pass.call];
     const empty=pass.name==='snow.guestPrimary'?args.guestX===0:
      pass.name==='snow.fallback'&&pass.stage==='predict'?args.fallbackX===0:false;
     const entry={...pass,beginNs:a.toString(),endNs:b.toString(),emptyIndirect:empty,ms:null};
     if(!empty){
      if(a===0n||b<a)throw Error('Invalid positive-work timestamp: '+pass.name+'/'+record.sample);
      entry.ms=Number(b-a)/1e6;
      if(first===null||a<first)first=a;if(b>last)last=b;
      const group=pass.name==='snow.predict'?'prediction':pass.name==='snow.contacts'?'contacts':
       pass.name==='snow.shield'?'shield':pass.name==='snow.terrain'?'terrain':
       pass.name==='snow.guestPrimary'?'guestPrimary':pass.name==='snow.fallback'?'fallbackAndMotion':'index';
      row.groups[group]=(row.groups[group]||0)+entry.ms;
     }
     row.passes.push(entry);
    }
    row.totalMs=first===null?0:Number(last-first)/1e6;row.passSumMs=Object.values(row.groups).reduce((a,b)=>a+b,0);
    if(!(row.totalMs>0))throw Error('Missing full-tick timestamps');return row;
   });
   const wordView=key=>new Uint32Array(mapped,layout[key].offset,layout[key].size/4);
   const gridCounts=wordView('cellCount'),cellOf=wordView('cellOf'),snowDispatch=wordView('snowDispatch');
   let occupied=0,maxCell=0,grains=0,squared=0,neighborWork5x5=0;const histogram={};
   for(const value of gridCounts){grains+=value;squared+=value*value;if(value){occupied++;maxCell=Math.max(maxCell,value);const bin=value<=1?'1':value<=2?'2':value<=4?'3-4':value<=8?'5-8':value<=16?'9-16':value<=32?'17-32':value<=64?'33-64':value<=128?'65-128':'>128';histogram[bin]=(histogram[bin]||0)+1;}}
   const w=snapshot.grid.w,h=snapshot.grid.h;
   for(let cell=0;cell<gridCounts.length;cell++)if(gridCounts[cell]){
    const x=cell%w,y=Math.floor(cell/w);let neighbors=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)neighbors+=gridCounts[cell+dy*w+dx];
    neighborWork5x5+=gridCounts[cell]*neighbors;
   }
   let expectedIndexed=0;
   for(let row=0;row<count;row++){
    const original=sourceIndices[row],flag=values.flag[row],type=(flag&3)|((flag>>>4)&4);
    if(chosen.has(original)&&cellOf[row]===0xffffffff)throw Error('Selected grain missing from index: '+original);
    if(type===5&&cellOf[row]!==0xffffffff)expectedIndexed++;
    if(type!==5&&cellOf[row]!==0xffffffff)throw Error('Water entered the snow index');
   }
   if(grains!==expectedIndexed||grains!==snowDispatch[3])throw Error('Snow index count disagrees with retained membership');
   const indexed=new Set(wordView('sortedIdx').subarray(0,grains));
   if(indexed.size!==grains)throw Error('Snow index duplicated particle records');
   for(let row=0;row<count;row++)if(chosen.has(sourceIndices[row])&&!indexed.has(row))throw Error('Selected grain missing from sorted index');
   const final={};for(const key of ['pos','aux','affine','flag'])final[key]=wordView(key);
   for(const key of ['pos','aux','affine'])if(new Float32Array(mapped,layout[key].offset,layout[key].size/4).some(value=>!Number.isFinite(value)))throw Error('Non-finite '+key);
   let waterUnchanged=true,passivePositionsUnchanged=true;
   for(let row=0;row<count;row++){
    const type=(values.flag[row]&3)|((values.flag[row]>>>4)&4);
    if(((final.flag[row]&3)|((final.flag[row]>>>4)&4))!==type)throw Error('Material identity changed');
    if(type!==5)for(const key of ['pos','aux','affine','flag']){
     const stride=key==='flag'?1:4;for(let lane=0;lane<stride;lane++)waterUnchanged&&=values[key][row*stride+lane]===final[key][row*stride+lane];
    }
    if(type===5&&!chosen.has(sourceIndices[row]))for(let lane=0;lane<4;lane++)passivePositionsUnchanged&&=values.pos[row*4+lane]===final.pos[row*4+lane];
   }
   if(!waterUnchanged||!passivePositionsUnchanged)throw Error('Passive records moved');
   const flags=Array.from(final.flag),blocks=wordView('blockMeta')[0];read.unmap();
   const validation=await device.popErrorScope();if(validation)throw Error(validation.message);if(errors.length)throw Error(errors.join(';'));
   const timed=rows.filter(row=>!row.warmup),ordered=timed.map(row=>row.totalMs).sort((a,b)=>a-b);
   const stats=list=>{const sorted=list.slice().sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)};};
   const summary=stats(ordered);
   const samples=timed.map(row=>({totalMs:row.totalMs,passSumMs:row.passSumMs,
    passes:row.passes.reduce((result,pass)=>{if(pass.ms!==null)result[pass.name]=(result[pass.name]||0)+pass.ms;return result;},{})}));
   return {family:'captured-town',n,count,sourceIndices,retainedWater:selection.water.length,retainedPassiveSnow:selection.passive.length,
    grid:{cells:snapshot.grid.cells,sparse:state.active,occupied,maxGrains:maxCell,grains,activeBlocks:state.active?blocks:null,
     meanOccupied:occupied?grains/occupied:0,sumSquaredCounts:squared,neighborWork5x5,histogram},
    samples,rawSamples:rows,medianMs:summary.medianMs,p95Ms:summary.p95Ms,maxMs:summary.maxMs,
    groups:Object.fromEntries([...new Set(timed.flatMap(row=>Object.keys(row.groups)))].map(key=>[key,stats(timed.map(row=>row.groups[key]||0))])),
    readback:{finite:true,materialIdentitiesUnchanged:true,waterUnchanged,passivePositionsUnchanged,flagWords:flags},singleReadbackMap:true};
  }finally{try{read.unmap();}catch{}read.destroy();counters.destroy();for(const buffer of Object.values(seeds))buffer.destroy();}
 }
 window.__townScaling={point,info:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,
  device:adapter.info.device,description:adapter.info.description,dt,sparse:state,capacity:snapshot.maxParticles},
  dispose:function(){disposing=true;query.destroy();resolve.destroy();device.destroy();}};
 return __townScaling.info;
}
const program='window.__initializeTownScale='+initializeTownScale.toString()+';';
new vm.Script(program);
if(dryRun){
 console.log(JSON.stringify({dryRun:true,browserLaunched:false,sourceSHA256,instrumentedSHA256:sha(source),
  snapshotAvailable:!!snapshot,snapshotPath,counts:counts||['500','1000','2000','4000','8000','maxEligible'],
  eligible:selection?.eligible.length,water:selection?.water.length,passiveSnow:selection?.passive.length,sparseState,options,rounds}));
 process.exit(0);
}
assert(snapshot,'Snapshot file must exist before GPU execution');
fs.mkdirSync(out,{recursive:true});
const html='<meta charset="utf-8"><title>Natural town snow scaling</title><script src="/gpu.js"></script><script src="/snapshot.js"></script><script src="/test.js"></script>';
const snapshotProgram='window.__townSnapshot='+JSON.stringify(snapshot)+';window.__townSelection='+JSON.stringify(selection)+';window.__townSparse='+JSON.stringify(sparseState)+';';
const server=createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname,body={'/':html,'/gpu.js':source,'/snapshot.js':snapshotProgram,'/test.js':program}[route];res.writeHead(body?200:404,{'Content-Type':route==='/'?'text/html':'text/javascript','Cache-Control':'no-store'}).end(body||'');});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-town-scaling-'));
let chrome,socket,seq=0;const pending=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
const report={schema:'sluice-snow-town-scaling-v1',sourceSHA256,instrumentedSHA256:sha(source),snapshotPath,
 snapshotSHA256:sha(fs.readFileSync(snapshotPath)),snapshotVersion:snapshot.version,nativeGuests:snapshot.gameState.guests?.length||0,
 naturalStateHashes:snapshot.hashes.native,sourceGameMetadata:snapshot.metadata,selectionMethod:'Position and original-index hash ranking; nested subsets retain original row order. Water and passive snow retained unchanged.',
 counts,options,rounds,sparseState,rows:[],started:new Date().toISOString(),
 limitations:'Warm-GPU snapshot replay, not ordinary gameplay FPS. Actual production prediction, terrain collision, snow-only index, four contacts and final contact/shield, resident union exits and displacement tracking. Captured natural guest slot zero, terrain, uniforms and inactive air. No water physics, rendering, CPU gameplay, slime brains, or air projection. Every tick resets exact selected particle records with GPU copies outside the measured span. Thirty-two warm-up ticks and twenty-four timed ticks share one submitted batch per point by default, with one readback map. Full span includes inter-pass gaps/copies and twelve four-byte dispatch-count diagnostic copies per tick; excludes seed resets, compilation and readback. Empty indirect passes are identified by actual dispatchX; contact fallback still contains nonempty motion tracking. Native geometry is fixed for a controlled scaling test, and thinning can change contact trajectories and particle IDs.'};
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,debug=Number(process.env.DEBUG_PORT||9897);
 chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
 let tab;for(let i=0;i<100;i++){try{tab=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(item=>item.type==='page');}catch{}if(tab)break;await sleep(100);}assert(tab,'Owned testing browser started');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}};
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
 let ready=false;for(let i=0;i<200;i++){if(await ev('!!window.__snowTownAPI&&!!window.__townSnapshot&&!!window.__initializeTownScale')){ready=true;break;}await sleep(50);}assert(ready,'Snapshot replay loaded');
 report.adapter=await ev('__initializeTownScale()');
 for(let round=0;round<rounds;round++)for(const n of round%2?[...counts].reverse():counts){
  const row=await ev('__townScaling.point('+n+','+JSON.stringify(options)+')');row.round=round;
  row.selectionSHA256=sha(wordBytes(row.sourceIndices));report.rows.push(row);fs.writeFileSync(out+'/report.json',JSON.stringify(report));
  console.log(JSON.stringify({round,n,count:row.count,medianMs:row.medianMs,p95Ms:row.p95Ms,maxMs:row.maxMs,maxCell:row.grid.maxGrains}));
 }
 report.ended=new Date().toISOString();fs.writeFileSync(out+'/report.json',JSON.stringify(report));console.log(JSON.stringify({complete:true,out,points:report.rows.length}));
}finally{
 if(socket?.readyState===WebSocket.OPEN){try{await ev('window.__townScaling?.dispose()');}catch{}try{await send('Browser.close');}catch{}socket.close();}
 for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Cleanup'));}pending.clear();
 if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 server.close();try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}
}
