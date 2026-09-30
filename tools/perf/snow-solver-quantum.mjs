// Warm-GPU replay of one equal physical water quantum of snow from frozen natural town state.
// GRAIN_STEPS=3 CONTACTS=2 SHIELD=last-tick SNAPSHOT_SOURCE=/tmp/liquid-v129-snow-reference.js
// DUMP=/tmp/quantum node tools/perf/snow-solver-quantum.mjs
// CONTACTS counts all relaxation passes; SHIELD replaces the last contact on selected grain ticks.
// LIQUID_SOURCE selects the tested engine. SNAPSHOT_SOURCE explicitly selects the captured
// engine for origin hash validation; without it, the snapshot must match the tested engine.
// PAIR=1 PAIR_REFERENCE_SOURCE=/path/reference.js runs same-device ABBA batches.
// A defaults to2/5/every-tick; B defaults to3/2/last-tick (GRAIN_STEPS/CONTACTS/SHIELD).
// PAIR_GRAIN_STEPS/PAIR_CONTACTS/PAIR_SHIELD override A. Each batch warms independently.
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
const out=path.resolve(process.env.DUMP||'/tmp/sluice-snow-solver-quantum');
const dryRun=process.env.DRY_RUN==='1';
assert(out!==root&&!out.startsWith(root+path.sep),'Artifacts stay outside the repo');
const paired=process.env.PAIR==='1';
const schedule={grainSteps:Number(process.env.GRAIN_STEPS||(paired?3:2)),contacts:Number(process.env.CONTACTS||(paired?2:5)),shield:process.env.SHIELD||(paired?'last-tick':'every-tick')};
const referenceSchedule={grainSteps:Number(process.env.PAIR_GRAIN_STEPS||2),contacts:Number(process.env.PAIR_CONTACTS||5),shield:process.env.PAIR_SHIELD||'every-tick'};
if(paired){
 assert(Number.isInteger(referenceSchedule.grainSteps)&&referenceSchedule.grainSteps>=1&&referenceSchedule.grainSteps<=8,'Reference grain steps');
 assert(Number.isInteger(referenceSchedule.contacts)&&referenceSchedule.contacts>=1&&referenceSchedule.contacts<=8,'Reference relaxation count');
 assert(['last-tick','every-tick'].includes(referenceSchedule.shield),'Reference shield schedule');
}
assert(Number.isInteger(schedule.grainSteps)&&schedule.grainSteps>=1&&schedule.grainSteps<=8,'One to eight grain steps');
assert(Number.isInteger(schedule.contacts)&&schedule.contacts>=1&&schedule.contacts<=8,'One to eight relaxation passes');
assert(['last-tick','every-tick'].includes(schedule.shield),'Known shield schedule');
const options={warmup:Number(process.env.WARMUP||8),samples:Number(process.env.SAMPLES||8),stride:Number(process.env.QUERY_STRIDE||256)};
assert([128,256].includes(options.stride),'Query stride must be128 or256');
const rounds=Number(process.env.ROUNDS||2);
assert(Number.isInteger(options.warmup)&&options.warmup>=2&&Number.isInteger(options.samples)&&options.samples>=5&&(options.warmup+options.samples)*options.stride<=4096,'Batch must fit4096 timestamp queries');
assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=5,'Rounds must be between one and five');
const testedSourcePath=path.resolve(process.env.LIQUID_SOURCE||root+'/js/liquid-wgpu.js');
const snapshotSourcePath=path.resolve(process.env.SNAPSHOT_SOURCE||testedSourcePath);
const original=fs.readFileSync(testedSourcePath,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const wordBytes=values=>{const bytes=Buffer.alloc(values.length*4);values.forEach((value,i)=>bytes.writeUInt32LE(value,i*4));return bytes;};
const sourceSHA256=sha(original);
const snapshotSourceSHA256=snapshotSourcePath===testedSourcePath?sourceSHA256:sha(fs.readFileSync(snapshotSourcePath));
const sourceProvenance={testedSourcePath,testedSourceSHA256:sourceSHA256,snapshotSourcePath,
 snapshotSourceSHA256,explicitSnapshotSource:!!process.env.SNAPSHOT_SOURCE,
 crossSourceReplay:snapshotSourceSHA256!==sourceSHA256};
let pairing=null;
if(paired){
 assert(process.env.PAIR_REFERENCE_SOURCE,'PAIR_REFERENCE_SOURCE must explicitly identify the comparison source');
 const referencePath=path.resolve(process.env.PAIR_REFERENCE_SOURCE),reference=fs.readFileSync(referencePath,'utf8');
 // The harness replaces runFrame scheduling. Everything outside that function,
 // including all shader strings, constants and callable helpers, must match.
 const stripScheduling=text=>{
  const start=text.indexOf('  function runFrame(instance, dt) {'),end=text.indexOf('  function runStage7SelfTest(instance)',start);
  assert(start>=0&&end>start,'Unique production scheduling boundaries');
  return text.slice(0,start)+text.slice(end);
 };
 assert.equal(stripScheduling(original),stripScheduling(reference),'Paired engines must have identical kernels and helpers outside replaced runFrame');
 const usedFunctions=['buildBuffers','buildGridPipelines','buildP2GPipelines','buildGrid2Pipelines','writeSimParams','buildCollidePipelines','prepareSnowGrains','buildSnowGrainPipeline','buildGrid','runSnowGrains','runCollide','liquidEncoder','liquidSubmit','useSparse'];
 const functionSHA256={};
 for(const name of usedFunctions){
  const functionSlice=text=>{
   const start=text.indexOf('  function '+name+'(');assert(start>=0,'Used production helper '+name);
   const end=text.indexOf('\n  function ',start+1);return text.slice(start,end<0?text.length:end);
  };
  const body=functionSlice(original);assert.equal(body,functionSlice(reference),'Used helper unchanged: '+name);
  functionSHA256[name]=sha(body);
 }
 pairing={compiledEngine:'testedSource only; reference source is validation provenance, not a second executing engine',
  referenceSourcePath:referencePath,referenceSourceSHA256:sha(reference),kernelAndHelperSHA256:sha(stripScheduling(original)),
  usedFunctionSHA256:functionSHA256,schedules:{A:referenceSchedule,B:schedule},order:['A','B','B','A'],
  dispatchCalls:{A:referenceSchedule.grainSteps*(referenceSchedule.contacts+1),B:schedule.grainSteps*(schedule.contacts+1)},
  warmup:'Every A or B batch begins with the full configured warmup; seed resets precede every quantum'};
}
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
const terrainAnchor="    var cp = grainPass || enc.beginComputePass({ label: 'liquid.collide' });";
assert.equal(original.split(marker).length,2,'Unique private export anchor');
assert.equal(original.split(terrainAnchor).length,2,'Unique terrain pass boundary');
const source=original.replace(terrainAnchor,terrainAnchor+`
    if(grainPass){cp.end();cp=enc.beginComputePass({label:'snow.terrain'});}`)
 .replace(marker,marker+`
window.__snowTownAPI={buildBuffers:buildBuffers,buildGridPipelines:buildGridPipelines,
 buildP2GPipelines:buildP2GPipelines,buildGrid2Pipelines:buildGrid2Pipelines,writeSimParams:writeSimParams,
 buildCollidePipelines:buildCollidePipelines,prepareSnowGrains:prepareSnowGrains,
 buildGrid:buildGrid,runSnowGrains:runSnowGrains,
 configureSparse:function(instance,state){LIQUID_SPARSE=state.enabled?1:0;
  instance.sparseVeto=state.veto;
  return useSparse(instance);}};`);
new vm.Script(source);
const snapshot=fs.existsSync(snapshotPath)?JSON.parse(fs.readFileSync(snapshotPath,'utf8')):null;
let selection=null,counts=null,sparseState=null,physicalTime=null;
function hashIndex(i,posWords){let h=(i^posWords[i*4]^Math.imul(posWords[i*4+1],73856093))>>>0;h=Math.imul(h^(h>>>16),2246822519);h=Math.imul(h^(h>>>13),3266489917);return (h^(h>>>16))>>>0;}
if(snapshot){
 assert.equal(snapshot.schema,'sluice-resident-snapshot-v1','Supported resident snapshot schema');
 assert.equal(snapshot.metadata.source.liquidSHA256,snapshotSourceSHA256,
  'Snapshot source must match SNAPSHOT_SOURCE exactly, or the tested engine when SNAPSHOT_SOURCE is omitted');
 for(const group of ['buffers','uniforms'])for(const [key,values] of Object.entries(snapshot[group])){
  const expected=snapshot.hashes[group][key];assert.equal(values.length,expected.words,key+' word count');
  assert.equal(sha(wordBytes(values)),expected.sha256,key+' byte hash');
 }
 for(const key of ['gameState','view','snowAir',...(snapshot.sparse?['sparse']:[])])assert.equal(sha(JSON.stringify(snapshot[key])),snapshot.hashes.native[key],key+' native state hash');
 for(const key of ['pos','aux','affine'])assert.equal(snapshot.buffers[key].length,snapshot.count*4,'Complete '+key);
 assert.equal(snapshot.buffers.flag.length,snapshot.count,'Complete flags');
 assert(!snapshot.snowAir?.active,'Active air requires a snapshot of the true projected GPU air texture');
 const capturedGrainDt=new Float32Array(new Uint32Array(snapshot.uniforms.snowGrainHost).buffer)[3];
 assert(Number.isFinite(capturedGrainDt)&&capturedGrainDt>0,'Finite positive captured grain dt');
 const origin=fs.readFileSync(snapshotSourcePath,'utf8');
 const timescaleText=origin.match(/var LIQUID_TIMESCALE\s*=\s*([0-9.]+);/)?.[1];
 assert(timescaleText,'Captured engine has a numeric reference timescale');
 const timescale=Number(timescaleText),expectedDt=Math.fround(snapshot.stepDt/timescale/2);
 assert.equal(capturedGrainDt,expectedDt,'Snapshot dt must equal the captured two-grain water quantum');
 const quantum=capturedGrainDt*2,grainDt=Math.fround(quantum/schedule.grainSteps);
 physicalTime={capturedReferenceGrainSteps:2,capturedWaterStepDt:snapshot.stepDt,capturedTimescale:timescale,
  capturedGrainDt,physicalQuantumSeconds:quantum,requestedGrainDt:quantum/schedule.grainSteps,
  uniformGrainDt:grainDt,executedSeconds:grainDt*schedule.grainSteps,
  float32DurationErrorSeconds:grainDt*schedule.grainSteps-quantum};
 assert(Math.abs(physicalTime.float32DurationErrorSeconds)<=quantum*1e-7,'Equal physical duration within uniform Float32 precision');

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
 counts=(process.env.COUNTS||'13932').split(',').map(Number);
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
async function initializeSnowQuantum(){
 const snapshot=window.__townSnapshot,selection=window.__townSelection,state=window.__townSparse,api=window.__snowTownAPI,schedule=window.__snowSchedule,physicalTime=window.__snowPhysicalTime;
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter||!adapter.features.has('timestamp-query'))throw Error('GPU timestamps required');
 const device=await adapter.requestDevice({requiredFeatures:['timestamp-query'],requiredLimits:{
  maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage,
  maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize}});
 const errors=[];let disposing=false;
 device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
 device.lost.then(info=>{if(!disposing)errors.push('Device lost: '+info.message);});
 const dt=physicalTime.uniformGrainDt,dispatchCalls=schedule.grainSteps*(schedule.contacts+1);
 const instance={device,queue:device.queue,maxParticles:snapshot.maxParticles,uploadedCount:snapshot.count,
  frameEncoder:null,g2pReady:true,cellSize:snapshot.cellSize,stepDt:snapshot.stepDt,
  grid:{...snapshot.grid},terrain:{...snapshot.terrain},liquid:{getGameState:()=>snapshot.gameState,getSnowAir:()=>null}};
 device.pushErrorScope('validation');
 api.buildBuffers(instance);api.buildGridPipelines(instance);
 api.buildP2GPipelines(instance);api.buildGrid2Pipelines(instance);api.writeSimParams(instance);
 api.buildCollidePipelines(instance);api.prepareSnowGrains(instance,dt);
 const initializationError=await device.popErrorScope();if(initializationError)throw Error(initializationError.message);
 if(!instance.gridReady||!instance.collideReady)throw Error('Production snow pipelines unavailable');
 if(state.active&&(!instance.sparseP2GOK||!instance.sparseGrid2OK))throw Error('Production sparse clear pipelines unavailable');
 if(api.configureSparse(instance,state)!==state.active)throw Error('Captured sparse mode unavailable on this device');
 const restore=(host,words)=>new Uint32Array(host.buffer,host.byteOffset,host.byteLength/4).set(words);
 restore(instance.paramsHost,snapshot.uniforms.paramsHost);restore(instance.gameParamsHost,snapshot.uniforms.gameParamsHost);
 restore(instance.simParamsHost,snapshot.uniforms.simParamsHost);restore(instance.snowGrainHost,snapshot.uniforms.snowGrainHost);
 // Restore physical context first, then override only the solver dt for this schedule.
 instance.snowGrainHost[3]=dt;
 if(instance.snowGrainHost[3]!==dt)throw Error('Grain dt uniform changed');
 if(instance.gameParamsBufs.length!==snapshot.gameParams.slots)throw Error('Game uniform slot layout changed');
 const gameWords=new Uint32Array(snapshot.uniforms.gameParamsHost),lanes=snapshot.gameParams.lanesPerSlot;
 instance.gameParamsBufs.forEach((buffer,slot)=>device.queue.writeBuffer(buffer,0,gameWords.subarray(slot*lanes,(slot+1)*lanes)));
 device.queue.writeBuffer(instance.simParamsBuf,0,new Uint32Array(snapshot.uniforms.simParamsHost));
 device.queue.writeBuffer(instance.buf.terrainMask,0,new Uint32Array(snapshot.buffers.terrainMask));
 const query=device.createQuerySet({type:'timestamp',count:4096});
 const resolve=device.createBuffer({size:32768,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
 async function point(n,options,scheduleOverride){
  const schedule=scheduleOverride||window.__snowSchedule;
  const dt=Math.fround(physicalTime.physicalQuantumSeconds/schedule.grainSteps),dispatchCalls=schedule.grainSteps*(schedule.contacts+1);
  const pointPhysicalTime={...physicalTime,requestedGrainDt:physicalTime.physicalQuantumSeconds/schedule.grainSteps,
   uniformGrainDt:dt,executedSeconds:dt*schedule.grainSteps,float32DurationErrorSeconds:dt*schedule.grainSteps-physicalTime.physicalQuantumSeconds};
  if(Math.abs(pointPhysicalTime.float32DurationErrorSeconds)>physicalTime.physicalQuantumSeconds*1e-7)throw Error('Point physical duration differs');
  instance.snowGrainHost[3]=dt;

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
  const steps=options.warmup+options.samples,counterBytes=steps*dispatchCalls*8;
  const counters=device.createBuffer({size:counterBytes,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const layout={timestamps:{offset:0,size:32768},dispatches:{offset:32768,size:counterBytes}};
  let size=32768+counterBytes;
  for(const [key,bytes] of Object.entries({cellCount:snapshot.grid.cells*4,cellOf:count*4,sortedIdx:count*4,snowDispatch:16,blockMeta:16,pos:count*16,aux:count*16,affine:count*16,flag:count*4})){
   layout[key]={offset:size,size:bytes};size+=bytes;
  }
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   device.pushErrorScope('validation');
   const encoder=device.createCommandEncoder({label:'snow.quantumBatch'}),records=[];
   for(let sample=0;sample<steps;sample++){
    for(const [key,data] of Object.entries(values))encoder.copyBufferToBuffer(seeds[key],0,instance.buf[key],0,data.byteLength);
    encoder.clearBuffer(instance.buf.cellCount,0,snapshot.grid.cells*4);encoder.clearBuffer(instance.buf.cellCursor,0,snapshot.grid.cells*4);encoder.clearBuffer(instance.buf.blockBitmap);
    // Establish the preceding mixed-material index outside the timed span.
    // Production's first snow build retires the water index after G2P.
    const precedingEncoder=instance.frameEncoder;
    instance.frameEncoder=encoder;
    try{api.buildGrid(instance,false,false);}finally{instance.frameEncoder=precedingEncoder;}
    const begin=encoder.beginComputePass.bind(encoder),passes=[];let next=0,call=0,stage='predict',grain=0;
    encoder.beginComputePass=function(descriptor={}){const index=sample*options.stride+next;next+=2;
     if(next>options.stride)throw Error('Timestamp sample slot overflow: '+next);
     passes.push({name:descriptor.label||'compute',index,call,stage,grain});
     return begin({...descriptor,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}});};
    const publishDispatches=()=>{
     const offset=(sample*dispatchCalls+call)*8;
     encoder.copyBufferToBuffer(instance.buf.snowGuestDispatch,0,counters,offset,4);
     encoder.copyBufferToBuffer(instance.buf.snowFallbackDispatch,0,counters,offset+4,4);
    };
    instance.frameEncoder=encoder;
    try{
     for(grain=0;grain<schedule.grainSteps;grain++){
      call=grain*(schedule.contacts+1);stage='predict';
      api.runSnowGrains(instance,'predict',0);publishDispatches();
      api.buildGrid(instance,true,true);
      for(let contact=0;contact<schedule.contacts;contact++){
       call=grain*(schedule.contacts+1)+contact+1;
       const shielding=contact===schedule.contacts-1&&(schedule.shield==='every-tick'||grain===schedule.grainSteps-1);
       stage=shielding?'shield':'contacts';
       api.runSnowGrains(instance,stage,0,contact===0);publishDispatches();
      }
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
    for(let call=0;call<dispatchCalls;call++)row.dispatches.push({guestX:dispatch[(record.sample*dispatchCalls+call)*2],fallbackX:dispatch[(record.sample*dispatchCalls+call)*2+1]});
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
    if(!(row.totalMs>0))throw Error('Missing full-quantum timestamps');return row;
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
   return {family:'captured-town-quantum',n,count,sourceIndices,schedule,physicalTime:pointPhysicalTime,dispatchCalls,retainedWater:selection.water.length,retainedPassiveSnow:selection.passive.length,
    grid:{cells:snapshot.grid.cells,sparse:state.active,occupied,maxGrains:maxCell,grains,activeBlocks:state.active?blocks:null,
     meanOccupied:occupied?grains/occupied:0,sumSquaredCounts:squared,neighborWork5x5,histogram},
    samples,rawSamples:rows,medianMs:summary.medianMs,p95Ms:summary.p95Ms,maxMs:summary.maxMs,
    groups:Object.fromEntries([...new Set(timed.flatMap(row=>Object.keys(row.groups)))].map(key=>[key,stats(timed.map(row=>row.groups[key]||0))])),
    readback:{finite:true,particleRowIdentitiesPreserved:true,snowParticleMassPreserved:true,materialIdentitiesUnchanged:true,waterUnchanged,passivePositionsUnchanged,flagWords:flags},singleReadbackMap:true};
  }finally{try{read.unmap();}catch{}read.destroy();counters.destroy();for(const buffer of Object.values(seeds))buffer.destroy();}
 }
 window.__snowQuantum={point,info:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,
  device:adapter.info.device,description:adapter.info.description,dt,schedule,physicalTime,dispatchCalls,sparse:state,capacity:snapshot.maxParticles},
  dispose:function(){disposing=true;query.destroy();resolve.destroy();device.destroy();}};
 return __snowQuantum.info;
}
const program='window.__initializeSnowQuantum='+initializeSnowQuantum.toString()+';';
new vm.Script(program);
if(dryRun){
 console.log(JSON.stringify({dryRun:true,browserLaunched:false,sourceSHA256,...sourceProvenance,instrumentedSHA256:sha(source),
  snapshotAvailable:!!snapshot,snapshotPath,counts:counts||[13932],schedule,pairing,physicalTime,dispatchCalls:schedule.grainSteps*(schedule.contacts+1),
  eligible:selection?.eligible.length,water:selection?.water.length,passiveSnow:selection?.passive.length,sparseState,options,rounds}));
 process.exit(0);
}
assert(snapshot,'Snapshot file must exist before GPU execution');
fs.mkdirSync(out,{recursive:true});
const html='<meta charset="utf-8"><title>Frozen town snow solver quantum</title><script src="/gpu.js"></script><script src="/snapshot.js"></script><script src="/test.js"></script>';
const snapshotProgram='window.__townSnapshot='+JSON.stringify(snapshot)+';window.__townSelection='+JSON.stringify(selection)+';window.__townSparse='+JSON.stringify(sparseState)+';window.__snowSchedule='+JSON.stringify(schedule)+';window.__snowPhysicalTime='+JSON.stringify(physicalTime)+';';
const server=createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname,body={'/':html,'/gpu.js':source,'/snapshot.js':snapshotProgram,'/test.js':program}[route];res.writeHead(body?200:404,{'Content-Type':route==='/'?'text/html':'text/javascript','Cache-Control':'no-store'}).end(body||'');});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-snow-quantum-'));
let chrome,socket,seq=0;const pending=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
const report={schema:'sluice-snow-solver-quantum-v1',sourceSHA256,...sourceProvenance,instrumentedSHA256:sha(source),snapshotPath,
 snapshotSHA256:sha(fs.readFileSync(snapshotPath)),snapshotVersion:snapshot.version,nativeGuests:snapshot.gameState.guests?.length||0,
 naturalStateHashes:snapshot.hashes.native,sourceGameMetadata:snapshot.metadata,selectionMethod:'Position and original-index hash ranking; nested subsets retain original row order. Water and passive snow retained unchanged.',
 counts,options,schedule,pairing,physicalTime,dispatchCalls:schedule.grainSteps*(schedule.contacts+1),rounds,sparseState,
 indexPreparation:{untimedPrecedingIndex:'mixed water and snow',timedSnowClearPrev:'every grain including first',
  sharedFields:'real production buffers, initially zero; water P2G/G2P excluded'},rows:[],started:new Date().toISOString(),
 limitations:'Synthetic frozen natural-geometry GPU replay, not gameplay FPS or physical-law acceptance. One full captured physical water quantum advances snow via the configured grain count and relaxation/shield schedule. Every prediction and relaxation retains production terrain and resident collision, guest union fallback, and motion tracking; each grain rebuilds the neighbor index with the real shared-field/count clears and initializes motion on its first relaxation. An untimed preceding mixed water/snow index supplies deterministic prior block membership as a proxy for the production post-G2P dirty state; real field buffers begin zero and water velocity/physics are excluded, so this is not exact full-game state. Water physics, rendering, CPU gameplay, slime brains and active air projection are excluded. Captured water records remain passive neighbors excluded from the snow index. Every quantum resets exact particle records outside the timed span. Full-span timestamps include inter-pass gaps and dispatch-count copies, exclude seed resets, compilation and readback. Floating dt uniform precision is reported. Relative geometry is frozen and thinning can alter particle IDs and trajectories.'};
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,debug=Number(process.env.DEBUG_PORT||9897);
 chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
 let tab;for(let i=0;i<100;i++){try{tab=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(item=>item.type==='page');}catch{}if(tab)break;await sleep(100);}assert(tab,'Owned testing browser started');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}};
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
 let ready=false;for(let i=0;i<200;i++){if(await ev('!!window.__snowTownAPI&&!!window.__townSnapshot&&!!window.__initializeSnowQuantum')){ready=true;break;}await sleep(50);}assert(ready,'Snapshot replay loaded');
 report.adapter=await ev('__initializeSnowQuantum()');
 for(let round=0;round<rounds;round++)for(const n of round%2?[...counts].reverse():counts){
  const batches=pairing?pairing.order:[null];
  for(let batch=0;batch<batches.length;batch++){
   const label=batches[batch],selected=pairing?pairing.schedules[label]:schedule;
   const row=await ev('__snowQuantum.point('+n+','+JSON.stringify(options)+','+JSON.stringify(selected)+')');
   row.round=round;row.medianMsPerPhysicalSecond=row.medianMs/physicalTime.physicalQuantumSeconds;
   if(pairing){row.pairLabel=label;row.batch=batch;row.executionOrder=report.rows.length;}
   row.selectionSHA256=sha(wordBytes(row.sourceIndices));report.rows.push(row);fs.writeFileSync(out+'/report.json',JSON.stringify(report));
   console.log(JSON.stringify({round,n,batch,pairLabel:label,count:row.count,schedule:row.schedule,medianMs:row.medianMs,p95Ms:row.p95Ms,maxMs:row.maxMs,maxCell:row.grid.maxGrains}));
  }
 }
 report.ended=new Date().toISOString();fs.writeFileSync(out+'/report.json',JSON.stringify(report));console.log(JSON.stringify({complete:true,out,points:report.rows.length}));
}finally{
 if(socket?.readyState===WebSocket.OPEN){try{await ev('window.__snowQuantum?.dispose()');}catch{}try{await send('Browser.close');}catch{}socket.close();}
 for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Cleanup'));}pending.clear();
 if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 server.close();try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}
}
