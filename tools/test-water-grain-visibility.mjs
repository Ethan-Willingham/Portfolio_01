// Frozen GPU pixels: water cannot repaint fine grains according to particle order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dump=process.env.DUMP || '/tmp/water-grain-visibility';
fs.mkdirSync(dump,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png'};
const server=createServer((req,res)=>{
  try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-grain-'));
let child,socket,serial=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}assert(port);
  const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value || a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,mobile:false,deviceScaleFactor:2});
  const url='http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=material-sand-jar&paused=1';
  await send('Page.navigate',{url});
  let ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !__toy.stats().loading')){ready=true;break;}await sleep(100);}assert(ready);
  await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');
  assert(await evaluate('__toy.liquid().surfReady && __toy.liquid().renderActive'), 'the jar uses the surface renderer');
  await sleep(100);
  const frame=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(dump,'jar.png'),Buffer.from(frame.data,'base64'));
  const result=await evaluate(`(async()=>{
    const e=__toy.liquid(),d=e.device;
    d.addEventListener('uncapturederror',event=>console.error(event.error.message));
    e.renderCtx.configure({device:d,format:e.renderFormat,alphaMode:'premultiplied',
      usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const view={canvasW:512,canvasH:256,viewW:512,viewH:256,camX:0,camY:0,dpws:4};
    const grain=[60.125,32.125,0,0,65];
    async function capture(particles){
      const n=particles.length,p=new Float32Array(Math.max(1,n)*4),a=new Float32Array(p.length),f=new Uint32Array(Math.max(1,n));
      particles.forEach((v,i)=>{p.set(v.slice(0,4),i*4);a.set([3.2,0,v[0],v[1]],i*4);f[i]=v[4];});
      d.queue.writeBuffer(e.buf.pos,0,p);d.queue.writeBuffer(e.buf.aux,0,a);d.queue.writeBuffer(e.buf.flag,0,f);
      e.uploadedCount=n;e.draw({...view,count:n});
      const b=d.createBuffer({size:512*256*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      try{const enc=d.createCommandEncoder();enc.copyTextureToBuffer({texture:e.renderCtx.getCurrentTexture()},{buffer:b,bytesPerRow:2048},[512,256]);
        d.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);return new Uint8Array(b.getMappedRange()).slice();
      }finally{b.destroy();}
    }
    function hash(bytes){let h=2166136261;for(const v of bytes)h=Math.imul(h^v,16777619);return h>>>0;}
    const cases=[];
    for(const dpws of [1,2,4]){
    view.dpws=dpws;
    const dry=await capture([grain]);
    for(const [name,water]of [
      ['overlapping-drop',[[60.125,32.125,0,0,0]]],
      ['surface-drop',[[60.9,32.7,50,10,0]]],
      ['submerged',Array.from({length:81},(_,i)=>[60.125+(i%9-4)*1.25,32.125+(Math.floor(i/9)-4)*1.25,0,0,0])]
    ]){
      const background=await capture(water),first=await capture([grain,...water]),last=await capture([...water,grain]);
      let difference=0,maskError=0,samples=0,dryArea=0,wetArea=0;
      // Recover the grain's opacity from its contrast against the same water
      // frame. This compares edge definition independently of background tint.
      const cx=Math.floor(grain[0]*dpws),cy=Math.floor(grain[1]*dpws),radius=Math.ceil(dpws*1.3);
      for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
        const i=(y*512+x)*4,alpha=dry[i+3]/255;
        for(let c=0;c<4;c++)difference+=first[i+c]!==last[i+c];
        if(alpha<.05)continue;
        const color=dry[i]/alpha,denominator=color-background[i];
        if(Math.abs(denominator)<40)continue;
        const opacity=(first[i]-background[i])/denominator;
        maskError=Math.max(maskError,Math.abs(opacity-alpha));samples++;dryArea+=alpha;wetArea+=opacity;
      }
      cases.push({name,dpws,difference,maskError,samples,dryArea,wetArea,firstHash:hash(first),lastHash:hash(last)});
    }
    }
    return {format:e.renderFormat,cases};
  })()`);
  console.log(JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(dump,'result.json'),JSON.stringify(result,null,2));
  for(const row of result.cases){
    assert.equal(row.difference,0,row.name+': grain pixels cannot depend on particle storage order');
    assert(row.samples>0 && row.maskError<.04,row.name+': immersed and dry grains retain the same opacity and edge');
    assert(Math.abs(row.wetArea/row.dryArea-1)<.05,row.name+': immersion preserves the visible grain footprint');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,mobile:true,deviceScaleFactor:2});
  await send('Page.navigate',{url});
  ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !__toy.stats().loading')){ready=true;break;}await sleep(100);}assert(ready);
  await evaluate('__toy.pause(false)');await sleep(2000);await evaluate('__toy.pause(true)');
  assert(await evaluate('__toy.stats().waterState==="on" && __toy.liquid().surfGrainPipeline!==null'), 'the live landscape jar keeps both render layers active');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(dump,'jar-landscape.png'),Buffer.from(mobile.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,mobile:false,deviceScaleFactor:1});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1&nopause=1'});
  ready=false;for(let i=0;i<600;i++){if(await evaluate('!!window.gm && !!window.SluiceLoading && !SluiceLoading.active() && !!window.LiquidWGPU?.last?.renderActive')){ready=true;break;}await sleep(100);}
  assert(ready,'Sluice boots with the shared GPU renderer');
  assert(await evaluate('LiquidWGPU.last.simActive && LiquidWGPU.last.surfReady && !!LiquidWGPU.last.surfGrainPipeline'),'the game compiles both surface particle pipelines');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: dry, surface and submerged grain definition on real WebGPU');
}finally{
  socket?.close();server.close();for(const p of pending.values())clearTimeout(p.timer);
  if(child && child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
