// Background ordinary-game capture with native animation callbacks and natural residents.
// DUMP=/tmp/capture WATER=0 DURATION_MS=90000 node tools/perf/test-ordinary-game.mjs
// INPUT=/absolute/path/recording.json optionally schedules its keyboard events.
// NO_POINTER=0 also schedules recorded pointer events; this is not deterministic replay.
// LIQUID_SOURCE=/absolute/path/reference.js substitutes only the GPU engine for comparison.
// ROUTE=town-interaction uses adaptive real jets and grabs for 420 seconds by default.
// ROUTE=town-gather attempts to carry all five natural residents together in 300 seconds.
// CPU_PROFILE=1 adds inclusive aggregate diagnostics; BUNDLE_SOURCE substitutes the game bundle.
// EXPORT_FREEZE=0 keeps game RAF running during export; default freezes this test only after recording.
// DRY_RUN=1 validates sources/settings without starting a browser.
// SNOW_SNAPSHOT=1 freezes the game after the trace and saves true GPU resident state.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {naturalTownHook,naturalTownOptions,naturalTownRoute} from './natural-town-route.mjs';
import {gatherNaturalResidents} from './natural-town-gather.mjs';
import {profileGameCPU} from './profile-game-cpu.mjs';
import {profileSnowWorkload} from './profile-snow-workload.mjs';
async function captureResidentSnapshot() {
 if(playPerfActive||!playPerfTrace.ended)throw Error('Resident snapshot requires an ended trace');
 const instance=liquidWGPU;
 if(!instance?.device||!instance.simActive||!instance.uploadedCount)throw Error('Resident GPU state unavailable');
 if(gameRafId)cancelAnimationFrame(gameRafId);
 gameRafId=0;gamePaused=true;
 const words=view=>Array.from(new Uint32Array(view.buffer,view.byteOffset,view.byteLength/4));
 const plain=value=>JSON.parse(JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
 if(typeof window.__sluiceSnapshotBackend?.sparseState!=='function')throw Error('Private sparse snapshot backend unavailable');
 const snapshot={
  schema:'sluice-resident-snapshot-v1',version:GAME_VERSION,
  count:instance.uploadedCount,maxParticles:instance.maxParticles,cellSize:instance.cellSize,
  stepDt:instance.stepDt,simulationClock:instance.simulationClock,
  grid:plain(instance.grid),terrain:plain(instance.terrain),
  sparse:plain(window.__sluiceSnapshotBackend.sparseState(instance)),
  region:{minX:instance.regionMinX,minY:instance.regionMinY,maxX:instance.regionMaxX,maxY:instance.regionMaxY},
  gameParams:{slots:instance.gameParamsBufs.length,lanesPerSlot:instance.gameParamsHost.length/instance.gameParamsBufs.length},
  uniforms:{paramsHost:words(instance.paramsHost),gameParamsHost:words(instance.gameParamsHost),
   simParamsHost:words(instance.simParamsHost),snowGrainHost:words(instance.snowGrainHost)},
  gameState:plain(instance.liquid.getGameState()),view:plain(instance.liquid.getView()),
  snowAir:plain(instance.liquid.getSnowAir?.()||null),buffers:{},
  metadata:{traceEndPageMs:playPerfTrace.ended,capturedPageMs:performance.now(),
   afterTrace:true,rafStopped:gameRafId===0,pausedWithoutUI:true,nativeResidents:true,
   terrainMaskWords:instance.terrainMaskWords}
 };
 const sizes={pos:snapshot.count*16,aux:snapshot.count*16,affine:snapshot.count*16,
  flag:snapshot.count*4,terrainMask:instance.terrainMaskWords*4};
 const copies=[];
 try {
  const encoder=instance.device.createCommandEncoder({label:'test.residentSnapshot'});
  for(const [key,size] of Object.entries(sizes)) {
   if(!size){snapshot.buffers[key]=[];continue;}
   const buffer=instance.device.createBuffer({label:'test.snapshot.'+key,size,
    usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
   copies.push({key,buffer});
   encoder.copyBufferToBuffer(instance.buf[key],0,buffer,0,size);
  }
  instance.queue.submit([encoder.finish()]);
  await Promise.all(copies.map(({buffer})=>buffer.mapAsync(GPUMapMode.READ)));
  for(const {key,buffer} of copies)snapshot.buffers[key]=Array.from(new Uint32Array(buffer.getMappedRange()));
  return snapshot;
 } finally {
  for(const {buffer} of copies){try{buffer.unmap();}catch{}buffer.destroy();}
 }
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const route=process.env.ROUTE||'';assert(!route||['town-interaction','town-gather'].includes(route),'Known input route');
assert(!route||!process.env.INPUT,'Choose adaptive ROUTE or recorded INPUT');
const input=process.env.INPUT?JSON.parse(fs.readFileSync(process.env.INPUT,'utf8')):{durationMs:route==='town-gather'?300000:route?420000:90000,events:[]};
if(process.env.DURATION_MS) input.durationMs=Number(process.env.DURATION_MS);
assert(input.durationMs>0&&input.durationMs<=600000,'Capture duration must fit the recorder limit');
const routeOptions=route?naturalTownOptions(input.durationMs,route==='town-gather'):null;
const out=path.resolve(process.env.DUMP||path.join(os.tmpdir(),'sluice-ordinary-game'));
assert(out!==root&&!out.startsWith(root+path.sep),'Artifacts stay outside the repo');
fs.mkdirSync(out,{recursive:true});
const snowSnapshot=process.env.SNOW_SNAPSHOT==='1';
const liquidOriginal=fs.readFileSync(process.env.LIQUID_SOURCE||root+'/js/liquid-wgpu.js');
let liquid=liquidOriginal;
if(snowSnapshot){
 const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
 const backend=liquid.toString();
 assert.equal(backend.split(marker).length,2,'Unique private snapshot backend anchor');
 liquid=Buffer.from(backend.replace(marker,marker+`
 window.__sluiceSnapshotBackend={sparseState:function(instance){return {
  enabled:!!LIQUID_SPARSE,threshold:LIQUID_SPARSE_MIN_CELLS,
  veto:!!instance.sparseVeto,active:useSparse(instance)};}};`));
}
if(process.env.SNOW_PROFILE==='1')liquid=Buffer.from(profileSnowWorkload(liquid.toString()));
const bundleSourcePath=path.resolve(process.env.BUNDLE_SOURCE||root+'/js/sluice.js');
const bundleOriginal=fs.readFileSync(bundleSourcePath,'utf8');
const cpuProfile=process.env.CPU_PROFILE==='1'?profileGameCPU(bundleOriginal):null;
const src=cpuProfile?cpuProfile.source:bundleOriginal,end=src.lastIndexOf('})();');
assert(end>=0,'Game bundle closure anchor');
const exportFreeze=process.env.EXPORT_FREEZE!=='0'||snowSnapshot;
const hook=`window.__ownerReplay={
 ready:function(){return introPhase==='done'&&playPerfActive&&!gamePhysicsBlocked&&playPerfTrace.frameCount>0;},
 start:function(){return playPerfTrace.started;},
 finish:function(freeze){
  playPerfStop('Owner input route completed',false);
  if(freeze&&gameRafId){cancelAnimationFrame(gameRafId);gameRafId=0;}
  playPerfTrace.metadata.export={afterTrace:true,freezeRequested:!!freeze,gameRafStopped:gameRafId===0,
   uiPauseUnchanged:true,pageMs:performance.now()};
  return {schema:playPerfTrace.schema,version:GAME_VERSION,durationMs:playPerfTrace.ended-playPerfTrace.started,
   frameCount:playPerfTrace.frameCount,columns:playPerfFields.concat(Array.from({length:playPerfBucketLimit},function(_,i){return playPerfTrace.buckets[i]?'cpu.'+playPerfTrace.buckets[i]:null;})),
   stride:playPerfStride,chunkCount:playPerfTrace.chunks.length,initialState:playPerfTrace.initialState,
   initialSavedGame:playPerfTrace.initialSavedGame,gpuStatus:playPerfTrace.gpuStatus,
   droppedEvents:playPerfTrace.droppedEvents,droppedGPU:playPerfTrace.droppedGPU,droppedBuckets:playPerfTrace.droppedBuckets,
   metadata:playPerfTrace.metadata,sectionCounts:{seconds:playPerfTrace.seconds.length,events:playPerfTrace.events.length,gpu:playPerfTrace.gpu.length}};
 },
 part:function(key,offset,count){return playPerfTrace[key].slice(offset,offset+count);},
 checkpoint:function(secondsOffset,gpuOffset){return {seconds:playPerfTrace.seconds.slice(secondsOffset||0),gpu:playPerfTrace.gpu.slice(gpuOffset||0),frameCount:playPerfTrace.frameCount};}
};\n`;
const snapshotHook=snowSnapshot?`window.__ownerReplay.snapshot=${captureResidentSnapshot.toString()};\n`:'';
const bundle=src.slice(0,end)+hook+snapshotHook+(route?naturalTownHook:'')+src.slice(end);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.m4a':'audio/mp4'};
new vm.Script(bundle);
if(cpuProfile)fs.writeFileSync(out+'/cpu-profile-manifest.json',JSON.stringify({...cpuProfile.manifest,bundleSourcePath},null,2));
if(process.env.DRY_RUN==='1'){console.log(JSON.stringify({dryRun:true,browserLaunched:false,durationMs:input.durationMs,route:route||null,routeOptions,cpuProfile:!!cpuProfile,exportFreeze,bundleSourcePath,bundleSHA256:createHash('sha256').update(bundleOriginal).digest('hex'),servedBundleSHA256:createHash('sha256').update(bundle).digest('hex')}));process.exit(0);}
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}const data=name==='/js/sluice.js'?bundle:name==='/js/liquid-wgpu.js'?liquid:fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-owner-replay-'));let chrome,ws,checkpointTimer,checkpointInFlight=null,checkpointActive=false,evaluationTail=Promise.resolve(),result=null,traceComplete=false,phase='boot',id=0;const pending=new Map(),errors=[],checkpointState={seconds:[],gpu:[],frameCount:0};
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
// One evaluation at a time, including route reads, checkpoints and export.
function ev(expression){const task=evaluationTail.then(async()=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;});evaluationTail=task.catch(()=>{});return task;}
function scheduleCheckpoint(hostStart){
 if(!checkpointActive)return;
 checkpointTimer=setTimeout(()=>{
  checkpointInFlight=(async()=>{const checkpoint=await ev('__ownerReplay.checkpoint('+checkpointState.seconds.length+','+checkpointState.gpu.length+')');checkpointState.seconds.push(...checkpoint.seconds);checkpointState.gpu.push(...checkpoint.gpu);checkpointState.frameCount=checkpoint.frameCount;fs.writeFileSync(out+'/checkpoint.json',JSON.stringify(checkpointState));const live=await ev('(()=>{const x=__sluicePerformance.status();return {fps:x.fps,cpuMs:x.cpuMs,snow:x.state.snowActive,liquids:x.state.liquids}})()');console.log(JSON.stringify({wallSec:Math.round((performance.now()-hostStart)/1000),live}));})()
   .catch(error=>fs.writeFileSync(out+'/checkpoint-error.json',JSON.stringify({message:error.message,at:new Date().toISOString()})))
   .finally(()=>{checkpointInFlight=null;if(checkpointActive)scheduleCheckpoint(hostStart);});
 },10000);
}
async function stopCheckpoints(){checkpointActive=false;clearTimeout(checkpointTimer);if(checkpointInFlight)await checkpointInFlight;await evaluationTail;}

try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,debug=Number(process.env.DEBUG_PORT||9894);
 chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--window-size=1440,900','--enable-unsafe-webgpu','--use-angle=metal','--mute-audio','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
 let target;for(let n=0;n<100;n++){try{target=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');}catch{}if(target)break;await sleep(100);}assert(target);
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){let p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*google-analytics.com*','*googletagmanager.com*']});await send('Emulation.setDeviceMetricsOverride',{width:680,height:764,deviceScaleFactor:2,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'let replayRandom=48271;Math.random=()=>((replayRandom=Math.imul(replayRandom,1664525)+1013904223>>>0)/4294967296);'});
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?dev=1&snow=1&gmpreset=smoke-default&perfrec=1&nosave=1&nopause=1'+(process.env.WATER==='0'?'&perfwater=0':'')});
 let ready=false;for(let n=0;n<600;n++){const bootError=await ev('window.__bootErr||null');assert(!bootError,'Ordinary game boot failed: '+bootError);if(await ev('!!window.__ownerReplay&&__ownerReplay.ready()')){ready=true;break;}if(n===40)console.log(JSON.stringify({loading:await ev('({body:document.body.innerText.slice(-3500),boot:window.__bootErr,hook:typeof __ownerReplay})'),errors}));await sleep(100);}assert(ready,'Ordinary gameplay started');
 const rect=await ev('(()=>{const r=document.getElementById("game-canvas").getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()');
 const offset=await ev('performance.now()-__ownerReplay.start()'),hostStart=performance.now()-offset;
 const events=input.events.filter(e=>['keydown','keyup','pointerdown','pointerup','pointermove'].includes(e.kind)&&e.atMs<input.durationMs&&(process.env.NO_POINTER==='0'||!e.kind.startsWith('pointer')));
 console.log(JSON.stringify({started:true,out,liquidSource:process.env.LIQUID_SOURCE,offset,rect,events:events.length}));
 phase='capture';checkpointActive=true;scheduleCheckpoint(hostStart);
 let actionReport=null;
 if(route)actionReport=route==='town-gather'
  ?await gatherNaturalResidents(send,ev,{...routeOptions,out,durationMs:input.durationMs,hostStart})
  :await naturalTownRoute(send,ev,input.durationMs,hostStart,out,routeOptions);
 else{
 let last=0;for(const e of events){await sleep(hostStart+e.atMs-performance.now());if(e.kind.startsWith('key')){const code=e.detail.code;const key=code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code.startsWith('Digit')?code.slice(5):code;await send('Input.dispatchKeyEvent',{type:e.kind==='keydown'?'keyDown':'keyUp',key,code});}else{const d=e.detail,x=rect.left+d.x/d.width*rect.width,y=rect.top+d.y/d.height*rect.height;await send('Input.dispatchMouseEvent',{type:e.kind==='pointerdown'?'mousePressed':e.kind==='pointerup'?'mouseReleased':'mouseMoved',x,y,button:e.kind==='pointermove'?'none':'left',buttons:d.buttons||0,clickCount:e.kind==='pointermove'?0:1});}if(e.atMs-last>5000){last=e.atMs;console.log(JSON.stringify({seconds:e.atMs/1000,live:await ev('__sluicePerformance.status().fps')}));}}
 await sleep(hostStart+input.durationMs-performance.now());
 }
 await stopCheckpoints();phase='export';
 result=await ev('__ownerReplay.finish('+JSON.stringify(exportFreeze)+')');
 result.frameChunks=[];
 result.testHarness={route:route||null,routeOptions,cpuProfile:!!cpuProfile,bundleSourcePath,servedBundleSHA256:createHash('sha256').update(bundle).digest('hex'),headless:true,nativeCallbacks:true,seed:48271,inputPath:process.env.INPUT||null,pointers:!!route||process.env.NO_POINTER==='0',water:process.env.WATER!=='0',snowProfile:process.env.SNOW_PROFILE==='1',bundleSHA256:createHash('sha256').update(bundleOriginal).digest('hex'),liquidSHA256:createHash('sha256').update(liquidOriginal).digest('hex'),servedLiquidSHA256:createHash('sha256').update(liquid).digest('hex')};
 const chunkDir=out+'/frame-chunks';fs.mkdirSync(chunkDir,{recursive:true});
 for(const [key,count] of Object.entries(result.sectionCounts)){
  result[key]=[];
  for(let offset=0;offset<count;offset+=32)result[key].push(...await ev('__ownerReplay.part('+JSON.stringify(key)+','+offset+',32)'));
  fs.writeFileSync(out+'/'+key+'.json',JSON.stringify(result[key]));
 }
 for(let n=0;n<result.chunkCount;n++){
  const chunk=(await ev('__sluicePerformance.frameChunk('+n+')')).frames;
  fs.writeFileSync(chunkDir+'/'+String(n).padStart(4,'0')+'.json',JSON.stringify(chunk));result.frameChunks.push(chunk);
  fs.writeFileSync(out+'/export-progress.json',JSON.stringify({afterTrace:true,expectedChunks:result.chunkCount,savedChunks:result.frameChunks.length,frameCount:result.frameCount}));
 }
 result.exportComplete=true;traceComplete=true;
 if(actionReport){result.adaptiveRoute=actionReport;const jet=result.columns.indexOf('jet'),holding=result.columns.indexOf('holding');let jetFrames=0,heldFrames=0,jetMs=0,heldMs=0;for(const chunk of result.frameChunks)for(let i=0;i<chunk.length;i+=result.stride){if(chunk[i+jet]){jetFrames++;jetMs+=chunk[i+1];}if(chunk[i+holding]){heldFrames++;heldMs+=chunk[i+1];}}result.adaptiveCoverage={jetFrames,heldFrames,jetSeconds:jetMs/1000,heldSeconds:heldMs/1000,draggedIDs:actionReport.draggedIDs,initialIDs:actionReport.initialIDs};}
 fs.writeFileSync(out+'/trace.json',JSON.stringify(result));if(actionReport){assert(result.adaptiveCoverage.jetFrames>10&&result.adaptiveCoverage.heldFrames>10,'Actual frames show jets and held bodies');assert(actionReport.draggedIDs.length>0,'At least one natural resident completes a verified ten-second drag');}
 phase='optional-diagnostics';
 if(process.env.SNOW_PROFILE==='1')result.snowWorkload=await ev('window.__snowWorkloadRows||[]');
 const boot=await ev('({error:window.__bootErr||null,loading:window.__ownerReplay&&__sluicePerformance.status().state.loading,report:document.getElementById("gm-loading-log")?.textContent||null})');
 fs.writeFileSync(out+'/boot.json',JSON.stringify(boot));
 assert(!boot.error&&result.frameCount>0,'Capture requires successful gameplay, not a failed loading screen: '+boot.error);
 assert(result.seconds.every(s=>!s.state.paused&&s.state.visible&&!s.state.loading),'Capture must stay active and visible');
 if(process.env.WATER==='0')assert(result.seconds.every(s=>Object.keys(s.state.particleTypes).every(type=>type==='5')),'Diagnostic run contains only snow');
 if(snowSnapshot){
  const snapshot=await ev('__ownerReplay.snapshot()');
  for(const key of ['pos','aux','affine'])assert.equal(snapshot.buffers[key].length,snapshot.count*4,'Complete resident '+key);
  assert.equal(snapshot.buffers.flag.length,snapshot.count,'Complete resident flags');
  assert.equal(snapshot.buffers.terrainMask.length,snapshot.metadata.terrainMaskWords,'Complete uploaded terrain prefix');
  snapshot.metadata={...snapshot.metadata,capturedAt:new Date().toISOString(),capturePath:out,
   source:{...result.testHarness},traceDurationMs:result.durationMs,traceFrames:result.frameCount};
  const hashWords=values=>{const bytes=Buffer.alloc(values.length*4);values.forEach((value,i)=>bytes.writeUInt32LE(value,i*4));return {words:values.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
  snapshot.hashes={buffers:Object.fromEntries(Object.entries(snapshot.buffers).map(([key,values])=>[key,hashWords(values)])),
   uniforms:Object.fromEntries(Object.entries(snapshot.uniforms).map(([key,values])=>[key,hashWords(values)])),
   native:Object.fromEntries(['gameState','view','snowAir','sparse'].map(key=>[key,createHash('sha256').update(JSON.stringify(snapshot[key])).digest('hex')]))};
  fs.writeFileSync(out+'/resident-snapshot.json',JSON.stringify(snapshot));
  console.log(JSON.stringify({residentSnapshot:true,out,count:snapshot.count,guests:snapshot.gameState.guests?.length||0}));
 }
 fs.writeFileSync(out+'/trace.json',JSON.stringify(result));
 const shot=await send('Page.captureScreenshot');fs.writeFileSync(out+'/end.png',Buffer.from(shot.data,'base64'));assert.deepEqual(errors,[]);const active=result.seconds.filter(s=>s.durationMs>=900);console.log(JSON.stringify({complete:true,out,frames:result.frameCount,errors,meanFPS:active.reduce((a,s)=>a+s.fps,0)/active.length,minFPS:Math.min(...active.map(s=>s.fps))}));
}catch(error){
 fs.writeFileSync(out+'/capture-error.json',JSON.stringify({phase,traceComplete,message:error.message,stack:error.stack,at:new Date().toISOString()},null,2));
 if(result&&!traceComplete)fs.writeFileSync(out+'/trace-partial.json',JSON.stringify({...result,exportComplete:false}));
 throw error;
}finally{checkpointActive=false;clearTimeout(checkpointTimer);if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}server.close();try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}}
