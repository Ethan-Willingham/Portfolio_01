import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Real pointer and keyboard actions against the live WebGPU demo.
// Run: node tools/test-water-demo-actions.mjs
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
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
async function load(scene){await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${scene}`});await until(`typeof __toy==='object'&&!__toy.stats().loading&&__toy.stats().waterState==='on'&&document.querySelector('.toy-scene-action')!==null`);await pause(300);assert.equal(await ev('document.querySelector(".toy-foot")'),null);assert.equal(await ev('__toy.stats().scene'),scene);}
async function capture(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync('/tmp/hourglass-review',{recursive:true});fs.writeFileSync('/tmp/hourglass-review/'+name+'.png',Buffer.from(r.data,'base64'));}
async function snapshot(){return ev(`(async()=>{
 const L=__toy.liquid(),n=L.uploadedCount,d=L.device,b=d.createBuffer({size:n*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 try{const enc=d.createCommandEncoder();enc.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);d.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);const a=new Float32Array(b.getMappedRange());
 const words=new Uint32Array(a.buffer,a.byteOffset,a.length);let hash=2166136261;for(const word of words)hash=Math.imul(hash^word,16777619)>>>0;
 let finite=true,outside=0,upper=0,lower=0,maxLeak=0,minX=Infinity,maxX=-Infinity;for(let i=0;i<n;i++){
 const x=a[i*4],y=a[i*4+1];finite=finite&&Array.from(a.subarray(i*4,i*4+4)).every(Number.isFinite);
 const leak=Math.max(56-y,y-344,Math.abs(x-360)-WSSHourglass.halfWidth(y));maxLeak=Math.max(maxLeak,leak);if(leak>.05)outside++;
 if(y<200)upper++;else lower++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);
 }return {n,hash,finite,outside,upper,lower,maxLeak,minX,maxX,clock:L.simulationClock};
 }finally{b.destroy();}
})()`);}
try{
 const portFile=path.join(profile,'DevToolsActivePort'),launchDeadline=Date.now()+30000;while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>launchDeadline)throw Error('Chrome launch failed');await pause(50);}
 const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){let p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
 await load('hourglass');await ev('__toy.pause(true)');console.log('BOOT',await ev('__toy.stats()'),await sim('({error:buildError,ready:machineState.ready,runtime:!!toyDraftRuntime,slip:!!toyMaterialSlip})'));assert.equal(await sim('machineState.ready'),true,'Apparatus compiled and ready');let initial=await snapshot();console.log('INITIAL',initial);await capture('initial');
 assert.equal(await ev('__toy.stats().timeScale'),.2);assert.equal(await sim('timeInput.value'),'20');
 assert(initial.finite && initial.outside===0);const n=initial.n;await sim('render()');assert.deepEqual(await snapshot(),initial,'Drawing reads the resident state without changing physics');
 // Step actual native grains with the authored slow clock, preserving the population.
 for(let stage=0;stage<4;stage++){
  await sim('(function(){for(var i=0;i<240;i++)updateLiquidToy(1/60);render();})()');await pause(150);
  const state=await snapshot();console.log('FLOW',stage,state);assert.equal(state.n,n);assert(state.finite && state.outside===0,'Finite grains stay within the drawn glass');await capture('flow-'+stage);
 }
 const flow=await snapshot();assert(Math.abs(flow.clock-initial.clock-4*240/60*1.55*.2)<.02,'Slow motion preserves elapsed time');assert(flow.lower>100 && flow.upper>100,'The narrow neck transfers a finite charge gradually');
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
}finally{
 for(const p of pending.values())clearTimeout(p.timer);ws?.close();
 if(chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
 await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
