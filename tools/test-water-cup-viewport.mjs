// Stock cup geometry and scene selection through the actual host. Owns Chrome.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.DUMP || '/tmp/water-cup-viewport');
assert(!out.startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=createServer((req,res)=>{
  try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-cup-viewport-'));
let child,socket,serial=0;const pending=new Map(),errors=[],rows=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
const hash=value=>createHash('sha256').update(value).digest('hex');
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}assert(port);
  const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);});
  await send('Runtime.enable');await send('Page.enable');
  const url='http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html';
  async function ready(cup){
    for(let i=0;i<300;i++){if(await evaluate(cup?'!!window.__toy && !!__toy.machineState()?.ready && __toy.stats().scene==="cup"':'!!window.__toy && __toy.stats().waterState==="on"'))return;await sleep(100);}throw Error('Host did not become ready');
  }
  async function inspect(name){
    await evaluate('__toy.pause(true);document.getElementById("toy").scrollIntoView({block:"start",behavior:"instant"})');
    await evaluate('__toy.liquid().queue.onSubmittedWorkDone()');await sleep(200);
    const state=await evaluate('(()=>{const v=document.getElementById("toy-viewport").getBoundingClientRect(),s=document.getElementById("toy-stage").getBoundingClientRect();return {version:__toy.version,world:__toy.world(),paused:__toy.stats().paused,count:__toy.stats().water,definition:__toy.machineState().definition,walls:Array.from(__toy.builder().walls),viewport:{width:v.width,height:v.height},stage:{width:s.width,height:s.height},ready:__toy.airStats().ready,href:location.href};})()');
    assert.deepEqual(state.world,{w:1120,h:664,tile:8,cols:140,rows:83});assert(state.paused);assert(state.ready);
    assert(state.stage.width<=state.viewport.width+1 && state.stage.height<=state.viewport.height+1,
      'The fitted cup remains inside the player');
    const geometrySHA256=hash(JSON.stringify({world:state.world,definition:state.definition,walls:state.walls}));
    if(rows.length)assert.equal(geometrySHA256,rows[0].geometrySHA256,'Viewport does not change physical geometry');
    const frame=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(frame.data,'base64'));
    const blueWaterPixels=await evaluate(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(frame.data)}),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+2]>40&&pixels[i+2]>pixels[i]*1.35&&pixels[i+2]>pixels[i+1]*1.15)blue++;bitmap.close();return blue;})()`);
    assert(blueWaterPixels>Math.min(10000,state.stage.width*state.stage.height*.12),
      'The paused cup visibly contains water at its fitted display size: '+JSON.stringify({name,blueWaterPixels,stage:state.stage}));
    const {walls,definition,...compact}=state;rows.push({name,...compact,geometrySHA256,blueWaterPixels});
  }
  for(const [name,width,height,mobile]of [['desktop',1440,1000,false],['macbook',1512,820,false],
    ['macbook-short',1512,700,false],['short-desktop',980,700,false],['landscape',844,390,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
    await send('Page.navigate',{url:url+'?scene=cup&paused=1'});await ready(true);
    if(!mobile){
      await evaluate('window.scrollTo(0,0);__toy.resize()');
      const layout=await evaluate('({bottom:document.getElementById("toy").getBoundingClientRect().bottom,height:innerHeight})');
      assert(layout.bottom<=layout.height,'The entire cup and its controls fit without scrolling: '+name);
    }
    await inspect(name);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:980,height:700,mobile:false,deviceScaleFactor:1});
  await send('Page.navigate',{url:url+'?scene=falls'});await ready(false);
  await evaluate('__toy.pause(true);document.getElementById("toy-scene-picker").open=true;document.querySelector("[data-scene=cup]").click()');
  await sleep(100);await ready(true);
  assert(await evaluate('__toy.stats().paused'),'Scene reload preserves manual pause');await inspect('scene-selection');
  assert(await evaluate('!document.querySelector("[data-scene=siphon], [data-scene=heron]")'),
    'The public scene menu exposes only the released cup experiment');
  await evaluate('document.getElementById("toy-scene-picker").open=true;document.querySelector("[data-scene=falls]").click();__toy.pause(true)');
  await ready(false);await evaluate('__toy.liquid().queue.onSubmittedWorkDone()');await sleep(200);
  const ordinaryReturn=await evaluate('({scene:__toy.stats().scene,water:__toy.stats().water,air:__toy.airStats(),model:!!__toy.liquid().pressureModel,volumeSplats:!!__toy.liquid().volumeSplats})');
  assert.equal(ordinaryReturn.scene,'falls');assert(ordinaryReturn.water>0);
  assert.equal(ordinaryReturn.air.enabled,false);assert.equal(ordinaryReturn.model,false);
  assert.equal(ordinaryReturn.volumeSplats,false,'Ordinary scenes restore their original water rendering');
  await evaluate('document.getElementById("toy-scene-picker").open=true;document.querySelector("[data-scene=cup]").click()');
  await ready(true);await inspect('return-to-cup');
  assert.equal(errors.length,0,JSON.stringify(errors));
  const report={pass:true,rows,ordinaryReturn,errors,hostSHA256:hash(fs.readFileSync(path.join(root,'js/water-smoke-slime.js')))};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  for(const p of pending.values())clearTimeout(p.timer);socket?.close();server.close();
  if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timer);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
