// Background ordinary-game capture with native animation callbacks and natural residents.
// DUMP=/tmp/capture WATER=0 DURATION_MS=90000 node tools/perf/test-ordinary-game.mjs
// INPUT=/absolute/path/recording.json optionally schedules its keyboard events.
// NO_POINTER=0 also schedules recorded pointer events; this is not deterministic replay.
// LIQUID_SOURCE=/absolute/path/reference.js substitutes only the GPU engine for comparison.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {profileSnowWorkload} from './profile-snow-workload.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=process.env.INPUT?JSON.parse(fs.readFileSync(process.env.INPUT,'utf8')):{durationMs:90000,events:[]};
if(process.env.DURATION_MS) input.durationMs=Number(process.env.DURATION_MS);
assert(input.durationMs>0&&input.durationMs<=600000,'Capture duration must fit the recorder limit');
const out=process.env.DUMP||path.join(os.tmpdir(),'sluice-ordinary-game');
assert(!path.resolve(out).startsWith(root+path.sep),'Artifacts stay outside the repo');
fs.mkdirSync(out,{recursive:true});
const liquidOriginal=fs.readFileSync(process.env.LIQUID_SOURCE||root+'/js/liquid-wgpu.js');
const liquid=process.env.SNOW_PROFILE==='1'?Buffer.from(profileSnowWorkload(liquidOriginal.toString())):liquidOriginal;
const src=fs.readFileSync(root+'/js/sluice.js','utf8'),end=src.lastIndexOf('})();');
const hook=`window.__ownerReplay={ready:function(){return introPhase==='done'&&playPerfActive&&!gamePhysicsBlocked&&playPerfTrace.frameCount>0;},start:function(){return playPerfTrace.started;},finish:function(){playPerfStop('Owner input route completed',false);return {schema:playPerfTrace.schema,version:GAME_VERSION,durationMs:playPerfTrace.ended-playPerfTrace.started,frameCount:playPerfTrace.frameCount,seconds:playPerfTrace.seconds,events:playPerfTrace.events,gpu:playPerfTrace.gpu,columns:playPerfFields.concat(Array.from({length:playPerfBucketLimit},function(_,i){return playPerfTrace.buckets[i]?'cpu.'+playPerfTrace.buckets[i]:null;})),stride:playPerfStride,chunkCount:playPerfTrace.chunks.length,initialState:playPerfTrace.initialState,initialSavedGame:playPerfTrace.initialSavedGame,gpuStatus:playPerfTrace.gpuStatus,droppedEvents:playPerfTrace.droppedEvents,droppedGPU:playPerfTrace.droppedGPU,droppedBuckets:playPerfTrace.droppedBuckets,metadata:playPerfTrace.metadata};},checkpoint:function(){return {seconds:playPerfTrace.seconds,gpu:playPerfTrace.gpu,frameCount:playPerfTrace.frameCount};}};\n`;
const bundle=src.slice(0,end)+hook+src.slice(end);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.m4a':'audio/mp4'};
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}const data=name==='/js/sluice.js'?bundle:name==='/js/liquid-wgpu.js'?liquid:fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-owner-replay-'));let chrome,ws,id=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
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
 let liveTimer=setInterval(async()=>{try{let checkpoint=await ev('__ownerReplay.checkpoint()');fs.writeFileSync(out+'/checkpoint.json',JSON.stringify(checkpoint));console.log(JSON.stringify({wallSec:Math.round((performance.now()-hostStart)/1000),live:await ev('(()=>{const x=__sluicePerformance.status();return {fps:x.fps,cpuMs:x.cpuMs,snow:x.state.snowActive,liquids:x.state.liquids}})()')}));}catch{}},10000);
 let last=0;for(const e of events){await sleep(hostStart+e.atMs-performance.now());if(e.kind.startsWith('key')){const code=e.detail.code;const key=code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code.startsWith('Digit')?code.slice(5):code;await send('Input.dispatchKeyEvent',{type:e.kind==='keydown'?'keyDown':'keyUp',key,code});}else{const d=e.detail,x=rect.left+d.x/d.width*rect.width,y=rect.top+d.y/d.height*rect.height;await send('Input.dispatchMouseEvent',{type:e.kind==='pointerdown'?'mousePressed':e.kind==='pointerup'?'mouseReleased':'mouseMoved',x,y,button:e.kind==='pointermove'?'none':'left',buttons:d.buttons||0,clickCount:e.kind==='pointermove'?0:1});}if(e.atMs-last>5000){last=e.atMs;console.log(JSON.stringify({seconds:e.atMs/1000,live:await ev('__sluicePerformance.status().fps')}));}}
 await sleep(hostStart+input.durationMs-performance.now());
 clearInterval(liveTimer);
 const result=await ev('__ownerReplay.finish()');result.frameChunks=[];for(let n=0;n<result.chunkCount;n++)result.frameChunks.push((await ev('__sluicePerformance.frameChunk('+n+')')).frames);result.testHarness={headless:true,nativeCallbacks:true,seed:48271,inputPath:process.env.INPUT||null,pointers:process.env.NO_POINTER==='0',water:process.env.WATER!=='0',snowProfile:process.env.SNOW_PROFILE==='1',bundleSHA256:createHash('sha256').update(src).digest('hex'),liquidSHA256:createHash('sha256').update(liquidOriginal).digest('hex'),servedLiquidSHA256:createHash('sha256').update(liquid).digest('hex')};
 if(process.env.SNOW_PROFILE==='1')result.snowWorkload=await ev('window.__snowWorkloadRows||[]');
 const boot=await ev('({error:window.__bootErr||null,loading:window.__ownerReplay&&__sluicePerformance.status().state.loading,report:document.getElementById("gm-loading-log")?.textContent||null})');
 fs.writeFileSync(out+'/boot.json',JSON.stringify(boot));
 assert(!boot.error&&result.frameCount>0,'Capture requires successful gameplay, not a failed loading screen: '+boot.error);
 assert(result.seconds.every(s=>!s.state.paused&&s.state.visible&&!s.state.loading),'Capture must stay active and visible');
 if(process.env.WATER==='0')assert(result.seconds.every(s=>Object.keys(s.state.particleTypes).every(type=>type==='5')),'Diagnostic run contains only snow');
 fs.writeFileSync(out+'/trace.json',JSON.stringify(result));const shot=await send('Page.captureScreenshot');fs.writeFileSync(out+'/end.png',Buffer.from(shot.data,'base64'));assert.deepEqual(errors,[]);const active=result.seconds.filter(s=>s.durationMs>=900);console.log(JSON.stringify({complete:true,out,frames:result.frameCount,errors,meanFPS:active.reduce((a,s)=>a+s.fps,0)/active.length,minFPS:Math.min(...active.map(s=>s.fps))}));
}finally{if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}server.close();try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}}
