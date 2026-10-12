// Real WebGPU sand bank settling, retained water and direct pour on desktop and landscape mobile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dump=process.env.DUMP || '/tmp/sand-dam-review';
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
  const results=[];
  async function capture(name){
    const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(r.data,'base64'));
  }
  async function sample(){return evaluate(`(async()=>{
    const e=__toy.liquid(),d=e.device,n=e.uploadedCount;
    const b=d.createBuffer({size:n*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const enc=d.createCommandEncoder();enc.copyBufferToBuffer(e.buf.pos,0,b,0,n*16);enc.copyBufferToBuffer(e.buf.flag,0,b,n*16,n*4);
      d.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);
      const mapped=b.getMappedRange(),p=new Float32Array(mapped,0,n*4),f=new Uint32Array(mapped,n*16,n),dx=__toy.room()?.x || 0;
      const result={clock:e.simulationClock,count:n,water:0,sand:0,finite:true,sandTop:400,sandLeft:999,sandRight:0,upstream:0,downstream:0,waterTopLeft:400,waterTopRight:400,escaped:0};
      for(let i=0;i<n;i++){
        const x=p[i*4]-dx,y=p[i*4+1],sand=((f[i]&3)|((f[i]>>4)&4))===5;
        result.finite &&= [...p.slice(i*4,i*4+4)].every(Number.isFinite);
        if(x<64||x>664||y>386)result.escaped++;
        if(sand){result.sand++;result.sandTop=Math.min(result.sandTop,y);result.sandLeft=Math.min(result.sandLeft,x);result.sandRight=Math.max(result.sandRight,x);}
        else{result.water++;if(x<280){result.upstream++;result.waterTopLeft=Math.min(result.waterTopLeft,y);}if(x>520){result.downstream++;result.waterTopRight=Math.min(result.waterTopRight,y);}}
      }
      return result;
    }finally{b.destroy();}
  })()`);}
  async function runTo(seconds){
    const start=await evaluate('__toy.liquid().simulationClock');await evaluate('__toy.pause(false)');
    const deadline=Date.now()+90000;
    while(await evaluate('__toy.liquid().simulationClock')<start+seconds){assert(Date.now()<deadline,'simulation advances');await sleep(100);}
    await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(50);
  }
  for(const [width,height,mobile]of(process.env.BASELINE==='1'?[[1440,1000,false]]:[[1440,1000,false],[844,390,true]])){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=sand-dam&paused=1'});
    let ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !__toy.stats().loading')){ready=true;break;}await sleep(100);}assert(ready);
    await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(100);
    const initial=await sample();await capture(width+'-initial');console.log('INITIAL',width,JSON.stringify(initial));
    await runTo(2);const settled=await sample();await capture(width+'-settled');console.log('SETTLED',width,JSON.stringify(settled));
    await runTo(18);const held=await sample();await capture(width+'-held');console.log('HELD',width,JSON.stringify(held));
    const pourTarget=await evaluate(`(()=>{const r=document.querySelector('.toy-scene-action[data-control="primary"]').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...pourTarget});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...pourTarget});
    await runTo(2);const poured=await sample();await capture(width+'-poured');console.log('POURED',width,JSON.stringify(poured));
    results.push({width,height,initial,settled,held,poured});
    assert(initial.finite && settled.finite && held.finite && poured.finite,'all particles remain finite');
    assert.equal(held.sand,initial.sand,'sand inventory stays conserved');
    assert.equal(held.water,initial.water,'water inventory stays conserved before the pour');
    assert(poured.water>held.water,'the pour adds real water');
    assert.equal(poured.sand,held.sand,'the pour keeps the grain inventory');
    if(process.env.BASELINE!=='1'){
      assert(initial.sand>initial.water,'the bank has a substantial sand inventory');
      assert(held.upstream>initial.water*.9,'the settled bank retains most water upstream');
      assert(held.downstream<initial.water*.05,'the downstream side starts dry and stays mostly dry');
      assert.equal(held.escaped,0,'the continuous trough contains both materials');
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
      const target=await evaluate(`(()=>{const r=document.querySelector('.toy-scene-action')?.getBoundingClientRect();return r&&{width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})()`);
      assert(target && target.width>=44 && target.height>=44 && target.x>=0 && target.y>=0 && target.right<=width && target.bottom<=height,'pour remains a visible touch target');
    }
  }
  if(process.env.BASELINE!=='1'){
    // Remove only the authored sand inventory, preserving the same real
    // retaining lips and initial water. The lips alone must allow a spill.
    await evaluate(`(async()=>{
      const module=WSSMachines['sand-dam'],make=module.make;
      module.make=function(w,o){const d=make(w,o);d.initial=d.initial.filter(s=>d.materialAt(s.rect.x+s.rect.width*.5,s.rect.y+s.rect.height*.5)==='water');return d;};
      try{await __toy.machine('sand-dam');}finally{module.make=make;}
      __toy.pause(true);await __toy.liquid().queue.onSubmittedWorkDone();
    })()`);
    const emptyInitial=await sample();assert.equal(emptyInitial.sand,0,'empty-bank control contains no grains');
    await runTo(20);const emptyHeld=await sample();await capture('empty-bank-control');
    console.log('EMPTY BANK',JSON.stringify(emptyHeld));
    assert(emptyHeld.upstream<emptyInitial.water*.9,'the visible retaining lips alone allow water past the bank');
    assert(results.at(-1).held.upstream/results.at(-1).initial.water>emptyHeld.upstream/emptyInitial.water+.1,'the loose bank improves water retention');
    results.push({emptyInitial,emptyHeld});
  }
  fs.writeFileSync(path.join(dump,'result.json'),JSON.stringify(results,null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: sand bank containment, inventory and direct pour');
}finally{
  socket?.close();server.close();for(const p of pending.values())clearTimeout(p.timer);
  if(child && child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
