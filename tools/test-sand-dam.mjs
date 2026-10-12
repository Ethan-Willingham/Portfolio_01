// Real WebGPU sand bank water-driven grain motion and visible held pour on desktop and landscape mobile.
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
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sand-demo-'));
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
  async function load(width,height,mobile,seed){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=sand-dam&paused=1'});
    let ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !__toy.stats().loading')){ready=true;break;}await sleep(100);}assert(ready,'sand scene boots');
    if(seed!==17)await evaluate('__toy.machine("sand-dam",{seed:'+seed+'})');
    await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(100);
  }
  async function capture(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(r.data,'base64'));}
  async function visibleDrySand(){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    return evaluate(`(async()=>{
      const image=new Image();image.src=${JSON.stringify('data:image/png;base64,')}+${JSON.stringify(shot.data)};await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const c=canvas.getContext('2d');c.drawImage(image,0,0);
      const box=document.getElementById('toy-stage').getBoundingClientRect(),scale=__toy.camera().scale;
      const x=Math.floor(box.x+280*scale),y=Math.floor(box.y+268*scale),w=Math.ceil(232*scale),h=Math.ceil(24*scale);
      const rgba=c.getImageData(x,y,w,h).data;let grains=0;
      for(let p=0;p<rgba.length;p+=4)if(rgba[p]>60 && rgba[p]>rgba[p+1]*1.1 && rgba[p+1]>rgba[p+2]*1.25)grains++;
      return grains;
    })()`);
  }
  async function sample(){return evaluate(`(async()=>{
    const e=__toy.liquid(),n=e.uploadedCount,b=e.device.createBuffer({size:n*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const enc=e.device.createCommandEncoder();enc.copyBufferToBuffer(e.buf.pos,0,b,0,n*16);enc.copyBufferToBuffer(e.buf.flag,0,b,n*16,n*4);
      e.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);
      const mapped=b.getMappedRange(),p=new Float32Array(mapped,0,n*4),f=new Uint32Array(mapped,n*16,n);
      const r={clock:e.simulationClock,count:n,water:0,sand:0,finite:true,inBasin:0,offBed:0,points:[],waterInBasin:0};
      for(let i=0;i<n;i++){
        const x=p[i*4],y=p[i*4+1],sand=((f[i]&3)|((f[i]>>4)&4))===5;
        r.finite &&= Number.isFinite(x+y+p[i*4+2]+p[i*4+3]);
        const basin=x>=512&&x<688&&y>=336&&y<376;
        if(sand){r.sand++;r.points.push([i,x,y]);if(basin)r.inBasin++;if(x>=512||y>308)r.offBed++;}
        else{r.water++;if(basin)r.waterInBasin++;}
      }return r;
    }finally{b.destroy();}
  })()`);}
  async function runTo(seconds){
    const start=await evaluate('__toy.liquid().simulationClock');await evaluate('__toy.pause(false)');
    const deadline=Date.now()+90000;
    while(await evaluate('__toy.liquid().simulationClock')<start+seconds){assert(Date.now()<deadline,'simulation advances');await sleep(100);}
    await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(50);
  }
  async function holdPour(seconds){
    await evaluate('__toy.pause(false)');
    const target=await evaluate(`(()=>{const b=document.querySelector('.toy-scene-action[data-control="primary"]'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,label:b.textContent,visible:getComputedStyle(b.firstElementChild).opacity};})()`);
    assert(target.width>=44&&target.height>=44&&target.visible==='1'&&target.label.includes('pour'),'pour is a visible labeled touch target');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:target.x,y:target.y});
    assert(await evaluate('__toy.stats().pouring'),'holding the button starts the real source');
    const start=await evaluate('__toy.liquid().simulationClock'),deadline=Date.now()+90000;
    while(await evaluate('__toy.liquid().simulationClock')<start+seconds){assert(Date.now()<deadline);await sleep(100);}
    await capture('pouring-'+(await evaluate('innerWidth')));
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:target.x,y:target.y});
    assert.equal(await evaluate('__toy.stats().pouring'),false,'release stops the source');
    await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');return target;
  }
  function withoutPoints(r){const {points,...summary}=r;return summary;}
  function movement(a,b){const positions=new Map(a.points.map(p=>[p[0],p.slice(1)]));let moved=0,total=0,right=0;
    for(const [id,x,y]of b.points){const before=positions.get(id);if(!before)continue;const d=Math.hypot(x-before[0],y-before[1]);total+=d;if(d>12)moved++;right+=x-before[0];}
    return {moved,mean:total/b.sand,right:right/b.sand};
  }
  const results=[];
  const cases=process.env.QUICK==='1'?[[1440,900,false,17]]:[[1440,900,false,17],[844,390,true,17],[1440,900,false,42]];
  for(const [width,height,mobile,seed]of cases){
    await load(width,height,mobile,seed);const initial=await sample();await capture(width+'-'+seed+'-initial');
    assert.equal(initial.water,0,'the bank starts dry');await runTo(2);const settled=await sample();await capture(width+'-'+seed+'-dry-bank');
    const dryPixels=await visibleDrySand();assert(dryPixels>20,'sand is visibly tan above the slab before pouring');
    await runTo(width===1440&&seed===17?18:6);const dry=await sample();await capture(width+'-'+seed+'-dry-control');
    await load(width,height,mobile,seed);await runTo(2);const wetStart=await sample();const target=await holdPour(4);const poured=await sample();
    await runTo(2);const wet=await sample();await capture(width+'-'+seed+'-washed');
    const displayed=await evaluate('__toy.sandDamStats()');
    const row={width,height,seed,dryPixels,displayed,initial:withoutPoints(initial),settled:withoutPoints(settled),dry:withoutPoints(dry),wet:withoutPoints(wet),dryMovement:movement(settled,dry),wetMovement:movement(wetStart,wet),target};
    results.push(row);console.log(JSON.stringify(row));fs.writeFileSync(path.join(dump,'result.json'),JSON.stringify(results,null,2));
    assert(initial.finite&&dry.finite&&wet.finite,'all material positions and velocities stay finite');
    assert(dry.offBed<initial.sand*.05,'the dry charge stays on the bed before a pour');
    assert.equal(wet.sand,initial.sand,'pouring never creates or deletes sand');
    assert(Math.abs(displayed.inBasin-wet.inBasin)<initial.sand*.05,'the visible collected result matches resident grains');
    assert.equal(wet.water,poured.water,'releasing the source stops admission');
    if(process.env.EXPLORE!=='1'){
      assert(wet.inBasin>initial.sand*.2,'water washes a visible share of sand into the receiving basin');
      assert(wet.offBed>dry.offBed+initial.sand*.2,'wet displacement exceeds the matched dry control');
      assert(row.wetMovement.moved>row.dryMovement.moved+initial.sand*.2,'water causes measurable grain movement beyond settling');
      assert(wet.waterInBasin>0,'water reaches the same receiving basin');
    }
    const guide=await evaluate(`(()=>{const guide=document.getElementById('toy-sand-guide'),r=guide.getBoundingClientRect();return {hidden:guide.hidden,top:r.top,bottom:r.bottom};})()`);
    assert(!guide.hidden && guide.top>=0 && guide.bottom<target.y-target.height*.5,'instructions are visible above the pour control');
    await evaluate('__toy.machine("sand-dam");__toy.pause(true)');
    const reset=await sample();assert.equal(reset.water,0,'reset restores a dry experiment');assert.equal(reset.sand,initial.sand,'reset restores the finite sand charge');
    await evaluate('__toy.pause(false)');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:target.x,y:target.y});
    assert(await evaluate('__toy.stats().pouring'),'reset leaves the source usable');
    await evaluate('__toy.pause(true)');await sleep(100);
    assert.equal(await evaluate('__toy.stats().pouring'),false,'pause releases a held pour');
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:target.x,y:target.y});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await evaluate('document.querySelector(".toy-scene-action[data-control=primary]").focus();__toy.pause(false)');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert(await evaluate('__toy.stats().pouring'),'Space holds the focused pour button');
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate('__toy.stats().pouring'),false,'key release stops the source');
  }
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: visible held pour, native grain motion, dry comparison and conserved sand');
}finally{
  socket?.close();server.close();for(const p of pending.values())clearTimeout(p.timer);
  if(child && child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
