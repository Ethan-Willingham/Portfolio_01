// Actual Retina pointer input and pressure-bound reduction on owned WebGPU.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.DUMP || '/tmp/water-cup-handling');
assert(!out.startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=createServer((req,res)=>{
  try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-cup-handling-'));
let child,socket,serial=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}assert(port);
  const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:820,mobile:false,deviceScaleFactor:2});
  const url=process.env.URL || 'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html';
  await send('Page.navigate',{url:url+'?scene=cup&paused=1'});
  let ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready')){ready=true;break;}await sleep(100);}assert(ready);
  const layout=await evaluate('({bottom:document.getElementById("toy").getBoundingClientRect().bottom,height:innerHeight,dpr:devicePixelRatio,world:__toy.world()})');
  assert(layout.bottom<=layout.height,'Full player fits at the top of the MacBook page');assert.equal(layout.dpr,2);

  // Include non-multiple dispatch sizes: inactive lanes must join every barrier.
  const pressureBounds=await evaluate(`(async()=>{
    const device=__toy.liquid().device,rows=[];
    device.pushErrorScope('validation');
    const module=device.createShaderModule({code:LiquidAirWGPU.shaderSource});
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'measurePressure'}});
    for(const count of [1,127,128,129,11620]){
      const cfg=new Uint32Array(16);cfg[2]=count;
      const values=new Float32Array(count*4);
      for(let i=0;i<count;i++)values[i*4]=Math.fround(Math.sin(i*1.7)*12000);
      values[(count-1)*4]=-12345.625;
      const expected=Math.max(...Array.from({length:count},(_,i)=>Math.abs(values[i*4])));
      const config=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const pressure=device.createBuffer({size:values.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      const gas=device.createBuffer({size:(count+2)*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const read=device.createBuffer({size:4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      device.queue.writeBuffer(config,0,cfg);device.queue.writeBuffer(pressure,0,values);
      const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:config}},{binding:9,resource:{buffer:gas}},{binding:10,resource:{buffer:pressure}}]});
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
      pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(Math.ceil(count/128));pass.end();
      encoder.copyBufferToBuffer(gas,(count+1)*64+4,read,0,4);device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);const actual=new Float32Array(read.getMappedRange())[0];
      read.unmap();rows.push({count,expected,actual});
      for(const buffer of [config,pressure,gas,read])buffer.destroy();
    }
    const error=await device.popErrorScope();return {rows,error:error?.message || null};
  })()`);
  assert.equal(pressureBounds.error,null);for(const r of pressureBounds.rows)assert.equal(r.actual,r.expected);

  await evaluate('__toy.set("slimeShape","heart");document.getElementById("toy-machine-primary").click()');
  const spawned=await evaluate('(()=>{const b=__toy.bodies()[0];let min=Infinity,max=0;for(let k=0;k<b.ringN;k++){const i=b.ring[k],r=Math.hypot(b.px[i]-b.cx,b.py[i]-b.cy);min=Math.min(min,r);max=Math.max(max,r);}return {points:b.n,springs:b.springN,ring:b.ringN,radius:b.surfaceSlime.radius,radialRatio:max/min};})()');
  assert.equal(spawned.points,91,'Giant uses the smaller mesh');
  assert(spawned.radialRatio<1.2,'Primary remains a ball after a different spawn shape was selected');
  await evaluate('document.getElementById("toy-pause").click();window.__handlingFrames=[];window.__handlingLast=0;requestAnimationFrame(function tick(t){if(__handlingLast)__handlingFrames.push(t-__handlingLast);__handlingLast=t;requestAnimationFrame(tick);})');
  await sleep(1800);
  const started=await evaluate('({clock:__toy.liquid().simulationClock,wall:performance.now()})');
  await sleep(8000);
  const before=await evaluate(`(()=>{const b=__toy.bodies()[0],g=document.getElementById('toy-stage').getBoundingClientRect();return {
    fps:__toy.stats().fps,clock:__toy.liquid().simulationClock,wall:performance.now(),water:__toy.stats().water,
    error:__toy.airStats().error,cx:b.cx,cy:b.cy,width:b.bboxR-b.bboxL,height:b.bboxB-b.bboxT,
    screen:{x:g.x+b.cx*g.width/__toy.world().w,y:g.y+b.cy*g.height/__toy.world().h,scale:g.width/__toy.world().w}};})()`);
  assert(!before.error);assert(before.width/before.height<1.6,'Settled giant remains compact');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.screen.x,y:before.screen.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.screen.x,y:before.screen.y,button:'left',buttons:1,clickCount:1});
  const grabStarted=await evaluate('__slimeGrab()');assert(grabStarted.active,'Pointer picks up the giant');
  for(let i=1;i<=30;i++){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.screen.x+90*before.screen.scale*i/30,y:before.screen.y-150*before.screen.scale*i/30,button:'left',buttons:1});await sleep(25);
  }
  await sleep(2500);
  const held=await evaluate('(()=>{const b=__toy.bodies()[0];return {grab:__slimeGrab(),cx:b.cx,cy:b.cy,rejections:b._handRejects||0,finite:Array.from(b.px).every(Number.isFinite)&&Array.from(b.py).every(Number.isFinite)};})()');
  assert(held.grab.active&&held.grab.gap<25,'Held patch follows the pointer');
  assert(held.cx-before.cx>65&&held.cy-before.cy<-100,'Body can move out of the cup');
  assert.equal(held.rejections,0,'Dragging does not lock behind the topology guard');assert(held.finite);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.screen.x+90*before.screen.scale,y:before.screen.y-150*before.screen.scale,button:'left',buttons:0,clickCount:1});
  assert(!(await evaluate('__slimeGrab().active')),'Release ends the grip');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(out,'macbook-drag.png'),Buffer.from(screenshot.data,'base64'));
  const frameMs=await evaluate('(()=>{const a=__handlingFrames.slice(30).sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};})()');
  assert.equal(errors.length,0,JSON.stringify(errors));
  const report={pass:true,version:await evaluate('__toy.version'),layout,pressureBounds,spawned,before,held,
    simulationRate:(before.clock-started.clock)/((before.wall-started.wall)/1000),frameMs,errors,
    hostSHA256:createHash('sha256').update(fs.readFileSync(path.join(root,'js/water-smoke-slime.js'))).digest('hex')};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  for(const p of pending.values())clearTimeout(p.timer);socket?.close();server.close();
  if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timer);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
