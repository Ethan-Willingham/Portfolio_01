import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Continuous inlet and real GPU waterfall regression. Owns Chrome for Testing.
// POUR_REFERENCE=/absolute/prior/host.js records the prior inlet for comparison.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wss-water-pour-'));
const errors=[],report=[];
const output=process.env.DUMP || '/tmp/water-demo-pour';fs.mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{try{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data=fs.readFileSync(file);
 if(file.endsWith('/js/water-smoke-slime.js')){const source=process.env.POUR_REFERENCE?fs.readFileSync(process.env.POUR_REFERENCE,'utf8'):data.toString(),end=source.lastIndexOf('})();');data=Buffer.from(source.slice(0,end)+'window.__wssInteractionTest=function(source){return eval(source);};\n'+source.slice(end));}
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
async function load(scene){await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${scene}`});await until(`typeof __toy==='object'&&!__toy.stats().loading&&__toy.stats().waterState==='on'&&(!WSSMachineRegistry.lookup(${JSON.stringify(scene)}) || __toy.machineState()?.ready)`);await pause(300);assert.equal(await ev('document.querySelector(".toy-foot")'),null);assert.equal(await ev('__toy.stats().scene'),scene);}
try{
 const portFile=path.join(profile,'DevToolsActivePort'),launchDeadline=Date.now()+30000;while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>launchDeadline)throw Error('Chrome launch failed');await pause(50);}
 const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){let p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1180,height:780,deviceScaleFactor:1,mobile:false});

 const reference=!!process.env.POUR_REFERENCE;
 if(!reference){
  await load('douse-fire');await ev('__toy.pause(true)');
  // Equal simulated time at different callback rates admits equal inventory.
  const cadence=await sim(`(()=>{
   var rows=[];
   for(var hz of [30,60,120]){
    clearLiquid();var source={x:200,y:80,acc:0};
    for(var i=0;i<hz;i++)spawnWaterFlow(source,1/hz,1800,12,0,110,LIQUID_MAX_PARTICLES-8);
    var flow=liquidCount;
    clearLiquid();pointerDown=true;pointerControl=false;tool='water';brushR=16;px=200;py=80;pvx=0;pvy=0;pointerWaterFlow={acc:0};
    for(i=0;i<hz;i++)toolTick(1/hz);
    var pointer=liquidCount;pointerDown=false;tool='poke';
    clearLiquid();emitters.length=0;waterSource(200,80,0,110,330);
    for(i=0;i<hz;i++)emittersTick(1/hz);
    rows.push({hz:hz,count:flow,pointer:pointer,emitter:liquidCount});emitters.length=0;
   }
   clearLiquid();var source={x:200,y:80,acc:0};spawnWaterFlow(source,1/30,1800,12,0,110,LIQUID_MAX_PARTICLES-8);
   var ys=Array.from(liquidY.slice(0,liquidCount)),xs=Array.from(liquidX.slice(0,liquidCount));
   var span={count:liquidCount,y:Math.max(...ys)-Math.min(...ys),x:Math.max(...xs)-Math.min(...xs),finite:xs.concat(ys).every(Number.isFinite)};
   clearLiquid();spawnWaterFlow({x:200,y:80,acc:0},1/30,1800,12,0,110,7);var capped=liquidCount;
   clearLiquid();wallRect(160,88,240,96);var blocked=spawnWaterFlow({x:200,y:80,acc:0},.05,1800,12,0,300,LIQUID_MAX_PARTICLES-8);
   var through=Array.from(liquidY.slice(0,liquidCount)).some(y=>y>=88);
   return {rows:rows,span:span,capped:capped,blocked:blocked,through:through};
  })()`);
  assert(cadence.rows.every(r=>Math.abs(r.count-1800)<=1),JSON.stringify(cadence));
  assert(cadence.rows.every(r=>Math.abs(r.pointer-2856.96)<=1 && Math.abs(r.emitter-511.5)<=1),'brush and fixed sources preserve flow at different frame rates');
  assert(cadence.span.finite && cadence.span.y>3 && cadence.span.x>20,'parcels fill an inlet segment, not a row');
  assert.equal(cadence.capped,7,'admission obeys the capacity exactly');assert.equal(cadence.through,false,'an inlet cannot bypass a thin wall');
  console.log('CADENCE',JSON.stringify(cadence));
 }
 for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
  await load('douse-fire');await ev('__toy.pause(true)');await pause(200);
  await clickTarget();
  const queued=await sim('firePourPending');assert.equal(queued,reference?700:2400);
  const prefix=viewport.mobile?'mobile':'desktop';
  let start=await ev('__toy.liquid().simulationClock'),captured=new Set(),contact=false;
  for(let step=0;step<220;step++){
   await sim('frame(lastT ? lastT+1000/60 : 1000/60);stopLoop();');
   await ev('__toy.liquid().queue.onSubmittedWorkDone()');
   const time=await ev('__toy.liquid().simulationClock');
   const stats=await ev('__toy.fire().stats()');contact ||= stats.smothered;
   for(const mark of [.25,.6,1,1.4,2.1])if(time-start>=mark && !captured.has(mark)){
    captured.add(mark);
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(output,prefix+'-'+mark+'.png'),Buffer.from(shot.data,'base64'));
    const water=await ev(`(async()=>{
     var L=__toy.liquid(),count=__toy.stats().water,spout=__toy.machineState().definition.fire.pour;
     var B=L.device.createBuffer({size:Math.max(16,count*16),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
     var E=L.device.createCommandEncoder();E.copyBufferToBuffer(L.buf.pos,0,B,0,count*16);L.queue.submit([E.finish()]);
     await B.mapAsync(GPUMapMode.READ);var P=new Float32Array(B.getMappedRange()),bins=new Array(24).fill(0),xs=[],ys=[],finite=true;
     for(var i=0;i<count;i++){
      var x=P[i*4],y=P[i*4+1];finite=finite&&Number.isFinite(x+y);
      if(y>spout.y+24 && y<spout.y+216 && Math.abs(x-spout.x)<65){bins[Math.floor((y-spout.y-24)/8)]++;xs.push(x);ys.push(y);}
     }
     B.unmap();B.destroy();return {count,finite,bins,occupied:bins.filter(n=>n>0).length,inFlight:xs.length,
       width:xs.length?Math.max(...xs)-Math.min(...xs):0,height:ys.length?Math.max(...ys)-Math.min(...ys):0};
    })()`);
    assert(water.finite,'all native water positions remain finite');
    report.push({prefix,time:time-start,water,fire:stats});
    console.log('FLOW',prefix,mark,JSON.stringify(water));
    if(!reference && mark===1){assert(water.occupied>=22,'falling stream has no empty horizontal bands');assert(water.inFlight>300,'a full stream reaches the hearth');}
   }
   if(time-start>4 && !(await sim('firePourPending')))break;
  }
  assert.equal(await ev('__toy.fire().stats().poured'),queued,'the whole finite pail is admitted once');
  assert(contact,'native falling water quenches the fire');
  assert.equal(await sim('firePourPending'),0,'completed pour leaves no queued water');
  const poured=await ev('__toy.fire().stats().poured');await pause(100);assert.equal(await ev('__toy.fire().stats().poured'),poured,'pause stops admission');
  await ev('__toy.machine("douse-fire",{})');await until('__toy.machineState()?.ready');
  assert.equal(await sim('firePourPending'),0,'restart clears pending inlet state');
  await ev('__toy.machine("douse-fire",{miss:true})');await until('__toy.machineState()?.ready');await clickTarget();
  start=await ev('__toy.liquid().simulationClock');
  for(let i=0;i<150 && await ev('__toy.liquid().simulationClock')-start<3;i++){
   await sim('frame(lastT ? lastT+1000/60 : 1000/60);stopLoop();');await ev('__toy.liquid().queue.onSubmittedWorkDone()');
   assert.equal(await ev('__toy.fire().stats().quenchEvents'),0,'pouring beside the hearth does not quench it');
  }
 }
 if(!reference){
  await load('blank');await ev('__toy.pause(true)');
  await sim('waterSource(worldW*.5,60,0,110,330);');
  const generation=await ev('__toy.liquid().readbackApplyGen');
  for(let i=0;i<120;i++){
   await sim('frame(lastT ? lastT+1000/60 : 1000/60);stopLoop();');await ev('__toy.liquid().queue.onSubmittedWorkDone()');
  }
  assert(await ev('__toy.liquid().readbackApplyGen')>generation+10,'continuous additions keep the particle mirror refreshing');
  assert(await ev('__toy.mirror(0).y')>160,'the fresh mirror follows the moving water');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({reference,report,errors},null,2));
 console.log('PASS continuous waterfall, capacity, frame rates, wall containment, finite volume and fire contact');

}finally{
 for(const p of pending.values())clearTimeout(p.timer);ws?.close();
 if(chrome.exitCode===null&&chrome.signalCode===null){
  const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
  const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
 }
 await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

