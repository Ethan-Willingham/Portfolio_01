import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Real pointer and keyboard actions against the live WebGPU demo.
// Run: node tools/test-hourglass.mjs [--benchmark] [--mobile]
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const benchmark=process.argv.includes('--benchmark');
const detail=process.env.HOURGLASS_SAND||'';
const mobile=process.argv.includes('--mobile');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'hourglass-review-'));
const errors=[];
const server=createServer((req,res)=>{try{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data=fs.readFileSync(file);
 if(file.endsWith('/js/water-smoke-slime.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=Buffer.from(source.slice(0,end)+'window.__wssInteractionTest=function(source){return eval(source);};\n'+source.slice(end));}
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);
}catch(error){res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){let r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
const sim=source=>ev(`__wssInteractionTest(${JSON.stringify(source)})`);
async function until(expr,ms=45000){const end=Date.now()+ms;while(!await ev(expr)){if(Date.now()>end)throw Error('Timed out: '+expr);await pause(50);}}
async function mouse(type,x,y,extra={}){await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:1,...extra});}
async function target(id='primary'){return ev(`(()=>{let b=document.querySelector('.toy-scene-action[data-control="${id}"]'),r=b?.getBoundingClientRect();return b&&!b.hidden&&r?{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}:null})()`);}
async function clickTarget(id='primary'){const r=await target(id);assert(r,'visible direct target '+id);await mouse('mouseMoved',r.x,r.y);await mouse('mousePressed',r.x,r.y);await mouse('mouseReleased',r.x,r.y);}
async function load(scene){await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${scene}${detail?'&sand='+detail:''}`});await until(`typeof __toy==='object'&&!__toy.stats().loading&&__toy.stats().waterState==='on'&&document.querySelector('.toy-scene-action')!==null`);await pause(300);assert.equal(await ev('document.querySelector(".toy-foot")'),null);assert.equal(await ev('__toy.stats().scene'),scene);}
async function capture(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync('/tmp/hourglass-review',{recursive:true});fs.writeFileSync('/tmp/hourglass-review/'+name+'.png',Buffer.from(r.data,'base64'));}
async function snapshot(){return ev(`(async()=>{
 const L=__toy.liquid(),n=L.uploadedCount,d=L.device,b=d.createBuffer({size:n*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 try{const enc=d.createCommandEncoder();enc.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);d.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);const a=new Float32Array(b.getMappedRange());
 const words=new Uint32Array(a.buffer,a.byteOffset,a.length);let hash=2166136261;for(const word of words)hash=Math.imul(hash^word,16777619)>>>0;
 let finite=true,outside=0,upper=0,lower=0,maxLeak=0,minX=Infinity,maxX=-Infinity;for(let i=0;i<n;i++){
 const x=a[i*4],y=a[i*4+1];finite=finite&&Array.from(a.subarray(i*4,i*4+4)).every(Number.isFinite);
 const leak=Math.max(56-y,y-344,Math.abs(x-360)-WSSHourglass.halfWidth(y));maxLeak=Math.max(maxLeak,leak);if(leak>.05)outside++;
 if(y<200)upper++;else lower++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);
 }
 const diameter=WSSHourglass.geometry().radius*2,buckets=new Map(),overlaps=[];let maxSpeed=0;
 const key=(x,y)=>y*8192+x;
 for(let i=0;i<n;i++){const k=key(Math.floor(a[i*4]/diameter),Math.floor(a[i*4+1]/diameter));let list=buckets.get(k);if(!list)buckets.set(k,list=[]);list.push(i);maxSpeed=Math.max(maxSpeed,Math.hypot(a[i*4+2],a[i*4+3]));}
 for(let i=0;i<n;i+=Math.max(1,Math.floor(n/4000))){const x=a[i*4],y=a[i*4+1],cx=Math.floor(x/diameter),cy=Math.floor(y/diameter);let nearest=diameter;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of buckets.get(key(cx+dx,cy+dy))||[]){if(j!==i)nearest=Math.min(nearest,Math.hypot(x-a[j*4],y-a[j*4+1]));}
 overlaps.push(1-nearest/diameter);}
 overlaps.sort((a,b)=>a-b);
 return {n,hash,finite,outside,upper,lower,maxLeak,minX,maxX,maxSpeed,overlapMean:overlaps.reduce((a,b)=>a+b,0)/overlaps.length,overlapP95:overlaps[Math.floor(overlaps.length*.95)],overlapMax:overlaps.at(-1),clock:L.simulationClock};
 }finally{b.destroy();}
})()`);}
try{
 const portFile=path.join(profile,'DevToolsActivePort'),launchDeadline=Date.now()+30000;while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>launchDeadline)throw Error('Chrome launch failed');await pause(50);}
 const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){let p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
 if(mobile){await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});}
 await load('hourglass');await ev('__toy.pause(true)');console.log('BOOT',await ev('__toy.stats()'),await sim('({error:buildError,ready:machineState.ready,runtime:!!toyDraftRuntime,slip:!!toyMaterialSlip})'));assert.equal(await sim('machineState.ready'),true,'Apparatus compiled and ready');
 if(benchmark){
  const info=await ev('(async()=>{const a=await navigator.gpu.requestAdapter();return {adapter:{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description},version:__toy.version,count:__toy.liquid().uploadedCount,geometry:WSSHourglass.geometry()};})()');
  const cost=await sim(`(async()=>{const samples=[];for(let frame=0;frame<360;frame++){const t=performance.now();updateLiquidToy(1/60);render();await liquidWGPU.queue.onSubmittedWorkDone();if(frame>=60)samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);return {samples:samples.length,mean:samples.reduce((a,b)=>a+b,0)/samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)]};})()`);
  await ev('__toy.pause(false)');
  const cadence=await ev('(async()=>{const times=[];let last;for(let i=0;i<360;i++){const t=await new Promise(requestAnimationFrame);if(i>60)times.push(t-last);last=t;}times.sort((a,b)=>a-b);return {frames:times.length,fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),p95:times[Math.floor(times.length*.95)],p99:times[Math.floor(times.length*.99)]};})()');
  await ev('__toy.pause(true)');await capture('benchmark-'+(detail||'default'));
  const result={info,cost,cadence,state:await snapshot(),errors};assert(result.state.lower>0&&result.state.finite&&result.state.outside===0,'Benchmark must actually flow inside the glass');assert.equal(errors.length,0,JSON.stringify(errors));console.log('BENCHMARK',JSON.stringify(result));
  fs.mkdirSync('/tmp/hourglass-review',{recursive:true});fs.writeFileSync('/tmp/hourglass-review/benchmark-'+(detail||'default')+'.json',JSON.stringify(result,null,2));
 }else{
 let initial=await snapshot();console.log('INITIAL',initial);await capture('initial');
 assert.equal(await ev('__toy.stats().timeScale'),.2);assert.equal(await sim('timeInput.value'),'20');
 assert(initial.finite && initial.outside===0);const n=initial.n;await sim('render()');assert.deepEqual(await snapshot(),initial,'Drawing reads the resident state without changing physics');
 // Step the actual resident grains with the authored slow clock, preserving the population.
 for(let stage=0;stage<4;stage++){
  await sim('(function(){for(var i=0;i<240;i++)updateLiquidToy(1/60);render();})()');await pause(150);
  const state=await snapshot();console.log('FLOW',stage,state);assert.equal(state.n,n);assert(state.finite && state.outside===0,'Finite grains stay within the drawn glass');assert(state.overlapP95<.08,'Dense grains retain their physical size');await capture('flow-'+stage);
 }
 const flow=await snapshot();assert(Math.abs(flow.clock-initial.clock-4*240/60*1.55*.2)<.02,'Slow motion preserves elapsed time');assert(flow.lower>100 && flow.upper>100,'The narrow neck transfers a finite charge gradually');
 // Verify the numerical model directly, using the same live GPU kernels.
 const physical=await ev(`(async()=>{
  const L=__toy.liquid(),n=L.uploadedCount,d=L.device,size=n*16,oldClock=L.simulationClock,g=L.getSimParam('GRAVITY');
  const backup=d.createBuffer({size,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),read=d.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  let e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,backup,0,size);d.queue.submit([e.finish()]);
  async function positions(){let e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,read,0,32);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const p=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return p;}
  try{
   L.uploadedCount=1;L.setSimParam('GRAVITY',250);d.queue.writeBuffer(L.buf.pos,0,new Float32Array([360,260,0,0]));let t=L.simulationClock;
   for(let i=0;i<50;i++)L.update(1/60);t=L.simulationClock-t;const fall=await positions();
   const diameter=WSSHourglass.geometry().radius*2;L.uploadedCount=2;L.setSimParam('GRAVITY',0);
   d.queue.writeBuffer(L.buf.pos,0,new Float32Array([355,270,0,0,355+diameter*.5,270,0,0]));L.update(1/60);const pair=await positions();
   return {fallError:Math.abs(fall[1]-(260+125*t*t)),velocityError:Math.abs(fall[3]-250*t),separation:pair[4]-pair[0],diameter,centerError:Math.abs((pair[0]+pair[4])*.5-(355+diameter*.25))};
  }finally{let e=d.createCommandEncoder();e.copyBufferToBuffer(backup,0,L.buf.pos,0,size);d.queue.submit([e.finish()]);await d.queue.onSubmittedWorkDone();L.uploadedCount=n;L.simulationClock=oldClock;L.setSimParam('GRAVITY',g);backup.destroy();read.destroy();}
 })()`);
 console.log('PHYSICS',physical);assert(physical.fallError<.01&&physical.velocityError<.005,'Freefall follows the declared gravity');assert(physical.separation>physical.diameter*.995&&physical.centerError<.001,'Two grains separate at their actual diameter without shifting their center');
 await clickTarget();console.log('SHAKE',await sim('machineState.lastMaterialImpulse'));assert.equal(await sim('Math.abs(machineState.lastMaterialImpulse.horizontalVelocityImpulse)'),24);
 await sim('(function(){for(var i=0;i<60;i++)updateLiquidToy(1/60);render();})()');let shaken=await snapshot();assert(shaken.finite && shaken.outside===0 && shaken.n===n,'A gentle shake preserves containment and grain inventory');
 await ev('__toy.pause(false)');await pause(3000);await ev('__toy.pause(true)');await capture('desktop');
 const frozen=await snapshot();await pause(300);assert.deepEqual(await snapshot(),frozen,'Pause freezes native grain state');
 await ev('document.getElementById("toy-fullscreen").click()');await pause(150);await ev('document.getElementById("toy-fullscreen").click()');await pause(150);assert.deepEqual(await snapshot(),frozen,'Fullscreen preserves a deliberately paused simulation');
 // Smaller viewports use the same glass and actual resident finish.
 for(const [width,height,mobile] of [[844,390,true],[390,844,true],[1512,700,false]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile});await ev('__toy.resize()');await pause(200);await capture(width+'x'+height);
  assert(await ev('document.documentElement.scrollWidth<=innerWidth'),'No page overflow');
  assert(await ev('(()=>{const c=document.getElementById("toy-hourglass-grains"),s=__toy.liquid().renderCanvas;return c.width===s.width && c.height===s.height;})()'),'Finish follows the exact display resolution');
 }
 await ev('document.getElementById("toy-restart").click()');await until('typeof __toy!=="undefined"&&!__toy.stats().loading && __toy.machineState()?.ready');await pause(200);const reset=await snapshot();assert.equal(reset.n,n);assert(reset.lower<10 && reset.finite && reset.outside===0,'Restart rebuilds the charge and contacts');assert.equal(await ev('document.querySelectorAll("#toy-hourglass-grains").length'),1,'Restart retires the old finish');
 await ev('__toy.scene("material-sand-jar")');await until('typeof __toy!=="undefined"&&__toy.stats().scene==="material-sand-jar"&&!__toy.stats().loading');
 assert.equal(await ev('document.querySelectorAll("#toy-hourglass-grains").length'),0,'Leaving the scene retires its finish');assert.equal(await ev('__toy.liquid().renderCanvas.style.visibility'),'','Other material scenes retain their renderer');assert.equal(await ev('__toy.stats().timeScale'),1,'Other scenes keep their existing playback speed');
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS hourglass refinement');
 }
}finally{
 for(const p of pending.values())clearTimeout(p.timer);ws?.close();
 if(chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
 await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
