// One owned testing window for native game FPS with controlled populations.
// Static: MATRIX=/tmp/matrix.json DRY_RUN=1 node tools/perf/run-native-capacity.mjs
// Headless reuse check: RUN_OWNED=1 VISIBLE=0 FRAME_MODE=timer120 MATRIX=... DUMP=... node ...
// Visible launch only after owner is ready: RUN_OWNED=1 OWNER_READY=1 MATRIX=... DUMP=... node ...
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {testingBinary,validateOwnedDescriptor} from './capacity-owned-browser.mjs';
const visible=process.env.VISIBLE!=='0',mode=process.env.FRAME_MODE||(visible?'native':'timer120');
assert(!visible||mode==='native','Visible calibration has no synthetic cadence');
assert(process.env.MATRIX,'Explicit capacity matrix required');
const matrix=JSON.parse(fs.readFileSync(process.env.MATRIX,'utf8'));assert(Array.isArray(matrix)&&matrix.length>0&&matrix.length<=64,'Bounded capacity matrix');
const out=path.resolve(process.env.DUMP||'/tmp/sluice-owned-native-capacity');
const binary=testingBinary(),debugPort=Number(process.env.DEBUG_PORT||9894);
assert(Number.isInteger(debugPort)&&debugPort>1024&&debugPort<65536,'Bounded debug port');
const flags=[...(visible?[]:['--headless=new']),'--no-first-run','--mute-audio','--enable-unsafe-webgpu','--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--window-size=1512,982'];
if(process.env.DRY_RUN==='1'){console.log(JSON.stringify({dryRun:true,browserLaunched:false,visible,mode,binary,flags,matrix,out,label:'Single owned testing-window calibration with synthetic initial populations; no display certification'}));process.exit(0);}
assert(process.env.RUN_OWNED==='1','Explicit RUN_OWNED=1 required to launch');
assert(!visible||process.env.OWNER_READY==='1','Visible window only after OWNER_READY=1');
assert(!fs.existsSync(out),'Retain prior evidence');fs.mkdirSync(out,{recursive:true});
const profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'sluice-capacity-owned-')));
let chrome=null,worker=null,stopping=false,ownershipValidated=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const terminate=async child=>{if(!child||child.exitCode!==null||child.signalCode)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1000)]);}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;if(worker&&worker.exitCode===null&&!worker.signalCode)worker.kill('SIGTERM');if(chrome&&chrome.exitCode===null&&!chrome.signalCode)chrome.kill('SIGTERM');});
async function closeOwnedBrowser(){
 if(!ownershipValidated)return;
 let socket=null,timer=null;
 try{
  validateOwnedDescriptor(out+'/owned-browser.json');
  const info=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version',{signal:AbortSignal.timeout(500)})).json();
  socket=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Owned browser close connection timeout')),1500);socket.onopen=resolve;socket.onerror=reject;});
  clearTimeout(timer);
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Owned Browser.close timeout')),2000);socket.onclose=()=>reject(Error('Owned browser connection closed'));socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id===1)resolve();};socket.send(JSON.stringify({id:1,method:'Browser.close'}));});
 }catch{}finally{clearTimeout(timer);socket?.close();}
}

try{
 chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),[...flags,'--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'});
 const descriptor={pid:chrome.pid,debugPort,profile,binary,visible};
 const descriptorFile=out+'/owned-browser.json';
 fs.writeFileSync(profile+'/sluice-owned-browser.json',JSON.stringify(descriptor),{mode:0o600});
 fs.writeFileSync(descriptorFile,JSON.stringify(descriptor),{mode:0o600});
 let ready=false;
 for(let i=0;i<100&&!stopping;i++){
  if(chrome.exitCode!==null||chrome.signalCode)throw Error('Owned browser exited during startup');
  try{const response=await fetch('http://127.0.0.1:'+debugPort+'/json/version',{signal:AbortSignal.timeout(1000)});ready=response.ok;}catch{}
  if(ready)break;await sleep(100);
 }
 assert(ready&&!stopping,'Owned testing browser ready');validateOwnedDescriptor(descriptorFile);ownershipValidated=true;
 const env={...process.env,DRY_RUN:'0',VISIBLE:visible?'1':'0',FRAME_MODE:mode,OWNED_BROWSER_DESCRIPTOR:descriptorFile,DUMP:out+'/cases'};
 const code=await new Promise((resolve,reject)=>{
  worker=spawn(process.execPath,[fileURLToPath(new URL('./capacity-sweep.mjs',import.meta.url))],{env,stdio:'inherit'});
  worker.once('error',reject);worker.once('exit',(code,signal)=>resolve(signal?130:code));
 });
 assert.equal(code,0,'Calibration worker failed; retained artifacts');
}finally{
 await terminate(worker);if(chrome&&chrome.exitCode===null&&!chrome.signalCode)await closeOwnedBrowser();await terminate(chrome);
 fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 if(stopping)process.exitCode=130;
}
