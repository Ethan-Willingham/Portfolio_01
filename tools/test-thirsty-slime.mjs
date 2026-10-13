// Contact uptake and pressure-driven discharge regression, with an owned Chrome for Testing process.
// Screenshots and measured uptake states go to /tmp/thirsty-slime-review.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.DUMP || '/tmp/thirsty-slime-review';
const port=Number(process.env.PORT || 8483),debug=port+1000;
const profile=fs.mkdtempSync('/tmp/thirsty-slime-browser-');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=createServer((request,response)=>{
  try {
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    response.end(fs.readFileSync(file));
  } catch {response.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,socket,serial=0;
const pending=new Map(),errors=[],reports=[];
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function until(expression,label,attempts=200){
  for(let i=0;i<attempts;i++){if(await evaluate(expression))return;await delay(100);}
  throw Error('Timed out: '+label);
}
async function advance(seconds){
  const end=await evaluate('__toy.liquid().simulationClock')+seconds;
  await until(`__toy.liquid().simulationClock>=${end}`,'native clock');
}
async function capture(name){
  const report=await evaluate(`(()=>{
    const b=__toy.bodies()[0],T=__toy.thirsty().stats(),P=__toy.thirsty().press.stats();let area=0,penetration=0,crossings=0;
    function jawDepth(x,y){for(const side of [-1,1]){const cx=P.center+side*P.q;
      if(x>cx-P.half && x<cx+P.half && y>P.top && y<P.bottom)penetration=Math.max(penetration,Math.min(x-cx+P.half,cx+P.half-x,y-P.top,P.bottom-y));}}
    function orientation(a,c,d){return (b.px[c]-b.px[a])*(b.py[d]-b.py[a])-(b.py[c]-b.py[a])*(b.px[d]-b.px[a]);}
    for(let k=0;k<b.ringN;k++){const a=b.ring[k],c=b.ring[(k+1)%b.ringN];
      for(let p=0;p<=16;p++){const t=p/16;jawDepth(b.px[a]*(1-t)+b.px[c]*t,b.py[a]*(1-t)+b.py[c]*t);}
      for(let j=k+2;j<b.ringN;j++){if(k===0 && j===b.ringN-1)continue;const d=b.ring[j],e=b.ring[(j+1)%b.ringN];
        if(orientation(a,c,d)*orientation(a,c,e)<-1e-6 && orientation(d,e,a)*orientation(d,e,c)<-1e-6)crossings++;}}
    for(let i=0;i<b.n;i++)jawDepth(b.px[i],b.py[i]);
    for(let k=0;k<b.ringN;k++){const a=b.ring[k],c=b.ring[(k+1)%b.ringN];area+=b.px[a]*b.py[c]-b.px[c]*b.py[a];}
    return {uptake:T,press:P,penetration,crossings,bounds:{left:b.bboxL,right:b.bboxR,top:b.bboxT,bottom:b.bboxB},nodes:b.n,actualArea:Math.abs(area)/2,finite:[...b.px,...b.py].every(Number.isFinite),
      status:document.getElementById('toy-status').textContent,stats:__toy.stats(),camera:__toy.camera()};
  })()`);
  assert.equal(report.uptake.error,null);assert.equal(report.stats.boundary.error,null);
  assert.ok(report.finite,'the grown mesh stays finite');
  assert.ok(report.press.minJ>.25,'local material cells stay oriented');
  assert.equal(report.crossings,0,'the skin never crosses itself');
  assert.equal(report.uptake.totalTaken,report.uptake.absorbedParcels+report.uptake.ejectedParcels,'all absorbed water is either stored or discharged');
  assert.equal(report.uptake.jetCounts.reduce((sum,n)=>sum+n,0),report.uptake.ejectedParcels,'every emitted parcel belongs to one pore');
  assert.ok(report.penetration<1.5,'skin and interior stay outside the jaw faces: '+report.penetration);
  assert.equal(report.stats.boundary.present+report.stats.boundary.parked,report.stats.allocation,'every native slot keeps an owner');
  assert.ok(Math.abs(report.uptake.restArea-(report.uptake.dryArea+report.uptake.grownParcels*1.5625))<.0001,'rest area follows only confirmed absorbed water');
  assert.notEqual(report.status,'Waiting for pressure','no disabled pressure status');
  reports.push({name,...report});console.log(name,JSON.stringify({uptake:report.uptake,press:report.press,penetration:report.penetration,crossings:report.crossings,bounds:report.bounds,nodes:report.nodes,actualArea:report.actualArea,status:report.status,allocation:report.stats.allocation,fps:report.stats.fps}));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));return report;
}
async function cleanup(){
  socket?.close();server.close();for(const item of pending.values())clearTimeout(item.timer);
  if(chrome && chrome.exitCode===null && chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
    const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.on('SIGINT',async()=>{await cleanup();process.exit(130);});
process.on('SIGTERM',async()=>{await cleanup();process.exit(143);});
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`,[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    `--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'
  ],{stdio:'ignore'});
  let endpoint;
  for(let i=0;i<150;i++){
    try {endpoint=(await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;} catch {}
    if(endpoint)break;await delay(100);
  }
  assert.ok(endpoint,'owned browser starts');socket=new WebSocket(endpoint);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const item=pending.get(m.id);pending.delete(m.id);clearTimeout(item?.timer);m.error?item?.reject(m.error):item?.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value || a.description));
  });
  await send('Runtime.enable');await send('Page.enable');
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await send('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:5});
    await send('Network.setUserAgentOverride',{userAgent:viewport.mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36'});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html?scene=thirsty-slime`});
    await until('!!window.__toy && __toy.machineState()?.ready && !!__toy.thirsty()','drinking slime boot');
    const prefix=viewport.mobile?'mobile':'desktop';
    await evaluate('__toy.pause(true);__toy.machine("thirsty-slime",{tapEnabled:false})');
    await until('__toy.machineState()?.ready && !!__toy.thirsty()', 'dry setup');
    await evaluate('__toy.pause(false)');
    const dry=await capture(prefix+'-dry');assert.equal(dry.uptake.absorbedParcels,0);
    await advance(1.5);const stillDry=await capture(prefix+'-still-dry');
    assert.equal(stillDry.uptake.absorbedParcels,0,'dry slime never grows with elapsed time');
    assert.equal(stillDry.uptake.restArea,dry.uptake.restArea);
    async function drag(worldX){
      const points=await evaluate(`(()=>{const b=__toy.bodies()[0],r=document.getElementById('toy-stage').getBoundingClientRect(),s=__toy.camera().scale;return {x:r.x+b.cx*s,y:r.y+b.cy*s,target:r.x+${worldX}*s};})()`);
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:points.x,y:points.y,id:1}]});
      else await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:points.x,y:points.y});
      assert.ok(await evaluate('__slimeGrab().active'),'pointer picks up the actual gel at '+JSON.stringify(points));
      for(let k=1;k<=45;k++){
        const x=points.x+(points.target-points.x)*k/45,y=points.y-18*Math.sin(Math.PI*k/45);
        if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
        else await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x,y});
        await delay(30);
      }
      await delay(400);
      console.log('drag',worldX,JSON.stringify(await evaluate('({grip:__slimeGrab(),x:__toy.bodies()[0].cx,y:__toy.bodies()[0].cy,press:__toy.thirsty().press.stats().held})')));
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:points.target,y:points.y});
    }
    await drag(215);await advance(.3);
    assert.ok(await evaluate('__toy.bodies()[0].cx<270'),'pointer moves the actual slime away from the stream');
    await evaluate('__toy.machinePrimary()');await advance(2);
    const away=await capture(prefix+'-away');assert.equal(away.uptake.absorbedParcels,0,'falling water away from the slime does not grow it');
    await drag(360);await advance(2);
    const wet=await capture(prefix+'-drinking');assert.ok(wet.uptake.absorbedParcels>100,'actual contact transfers water');
    assert.ok(wet.actualArea>dry.actualArea*1.1,'the visible skin grows');
    await evaluate('__toy.pause(true)');await delay(150);
    const paused=await evaluate('__toy.thirsty().stats()');await delay(300);
    assert.deepEqual(await evaluate('__toy.thirsty().stats()'),paused,'pause holds uptake and rest growth');
    await evaluate('__toy.pause(false)');
    await until('!document.getElementById("toy").classList.contains("is-paused") && document.getElementById("toy-resume").hidden','resume controls before a new gesture');
    async function pointer(type,x=0,y=0){
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{x,y,id:1}]});
      else await send('Input.dispatchMouseEvent',{type:{down:'mousePressed',move:'mouseMoved',up:'mouseReleased'}[type],button:type==='move'?'none':'left',buttons:type==='up'?0:1,clickCount:type==='move'?0:1,x,y});
    }
    async function handle(side,target){return evaluate(`(()=>{const p=__toy.thirsty().press.stats(),r=document.getElementById('toy-stage').getBoundingClientRect(),s=__toy.camera().scale;return {x:r.x+(p.center+${side}*p.q)*s,y:r.y+260*s,target:r.x+(p.center+${side}*${target})*s};})()`);}
    async function inventory(record=false){return evaluate(`(async()=>{
      const L=__toy.liquid(),count=__toy.stats().allocation,bytes=count*36;
      const read=L.device.createBuffer({size:bytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),enc=L.device.createCommandEncoder();
      enc.copyBufferToBuffer(L.buf.pos,0,read,0,count*16);enc.copyBufferToBuffer(L.buf.flag,0,read,count*16,count*4);
      enc.copyBufferToBuffer(L.toyNativeExtension.slotsBuffer,0,read,count*20,count*16);L.queue.submit([enc.finish()]);
      await read.mapAsync(GPUMapMode.READ);const raw=read.getMappedRange(),pos=new Float32Array(raw,0,count*4),flags=new Uint32Array(raw,count*16,count),slots=new Uint32Array(raw,count*20,count*4);
      let bound=0,flowing=0,reserve=0,released=0,upward=0,minY=400,maxSpeed=0;const ids=[];
      for(let i=0;i<count;i++){const kind=slots[i*4];
        if(!Number.isFinite(pos[i*4]+pos[i*4+1]+pos[i*4+2]+pos[i*4+3]))throw Error('Nonfinite native water');
        if(kind===2){bound++;ids.push(i);if(flags[i]!==160)throw Error('Bound water became live');}
        else if(kind===1){flowing++;if(flags[i]&160)throw Error('Released water remained frozen');
          if(window.__testBoundIds?.has(i)){released++;if(pos[i*4+3]<-40)upward++;minY=Math.min(minY,pos[i*4+1]);maxSpeed=Math.max(maxSpeed,Math.hypot(pos[i*4+2],pos[i*4+3]));}}
        else if(kind===0)reserve++;else throw Error('Unknown owner');
      }
      if(${record})window.__testBoundIds=new Set(ids);read.unmap();read.destroy();
      return {bound,flowing,reserve,total:count,released,upward,minY,maxSpeed};
    })()`);}
    await until('__toy.thirsty().stats().full','finite capacity',1200);await advance(.5);
    const full=await capture(prefix+'-full');assert.equal(full.uptake.absorbedParcels,full.uptake.capacityParcels);
    assert.ok(full.actualArea>dry.actualArea*14,'full slime reaches its much larger capacity');
    assert.equal(full.uptake.ejectedParcels,0,'water stays stored without a compressive load');
    await evaluate('__toy.machinePrimary()');await advance(1.5);
    const beforePress=await capture(prefix+'-before-press');await inventory(true);
    const grip=await handle(1,115);await pointer('down',grip.x,grip.y);
    assert.ok(await evaluate('__toy.thirsty().press.stats().held'),'the actual handle starts the squeeze');
    for(let k=1;k<=36;k++){await pointer('move',grip.x+(grip.target-grip.x)*k/36,grip.y);await delay(25);}
    await advance(.6);const mild=await capture(prefix+'-mild-jets');
    assert.ok(mild.uptake.ejectedParcels>100,'compressive contact releases stored native water');
    assert.ok(mild.uptake.jetCounts.filter(n=>n>0).length>=2,'separate pores produce multiple eruptions');
    assert.ok(mild.press.q>mild.press.target+2,'the gel still pushes back on the jaws');
    const hardTarget=await handle(1,24);await pointer('move',hardTarget.target,hardTarget.y);
    assert.ok(await evaluate('__toy.thirsty().press.stats().q>60'),'fast input pulls a spring without teleporting the jaw');
    await advance(.8);const hard=await capture(prefix+'-hard-jets');
    const flight=await inventory();console.log(prefix+'-native-flight',JSON.stringify(flight));
    assert.ok(flight.released>100 && flight.upward>10,'previously bound parcels are live upward-moving native water');
    assert.ok(flight.minY<beforePress.bounds.top-20,'the jets visibly rise above the unsqueezed slime');
    assert.ok(hard.uptake.jetSpeed>mild.uptake.jetSpeed,'a harder squeeze makes faster jets');
    await advance(2);const squeezed=await capture(prefix+'-squeezed');
    assert.ok(squeezed.uptake.absorbedParcels<full.uptake.absorbedParcels-2500,'holding the press visibly empties the slime');
    assert.ok(squeezed.actualArea<full.actualArea*.92,'the skin shrinks as its water leaves');
    assert.ok(squeezed.press.areaRatio>.9,'the smaller wet mesh retains its updated material area');
    assert.ok(squeezed.uptake.jetEnergy>0,'discharge carries kinetic energy');
    await pointer('up',hardTarget.target,hardTarget.y);await advance(2);
    const released=await capture(prefix+'-released');
    assert.ok(released.press.q>squeezed.press.q+30,'return springs reopen the jaws');
    assert.ok(released.press.pressure<12,'unloading removes the pressure source');
    const stopCount=released.uptake.ejectedParcels;await advance(.5);
    assert.equal(await evaluate('__toy.thirsty().stats().ejectedParcels'),stopCount,'jets stop when the press unloads');
    for(let axis=0;axis<2;axis++){
      const waterImpulse=released.uptake.jetImpulses.filter((_,i)=>i%2===axis).reduce((sum,n)=>sum+n,0);
      assert.ok(Math.abs(waterImpulse+released.press[axis?'recoilY':'recoilX'])<.001,'the gel receives the opposite measured jet impulse');
    }
    // Exercise the other handle, and pause in the middle of an eruption.
    const left=await handle(-1,24);await pointer('down',left.x,left.y);await pointer('move',left.target,left.y);
    await advance(1.5);await capture(prefix+'-left-jets');
    await evaluate('__toy.pause(true)');await delay(150);
    const heldPause=await evaluate('__toy.thirsty().press.stats()'),waterPause=await evaluate('__toy.thirsty().stats()');
    assert.equal(heldPause.held,false,'pausing cancels the held press');
    await delay(200);assert.deepEqual(await evaluate('__toy.thirsty().press.stats()'),heldPause,'pause holds mechanical state');
    assert.deepEqual(await evaluate('__toy.thirsty().stats()'),waterPause,'pause holds uptake and discharge');
    const stored=await inventory();
    assert.equal(stored.bound,waterPause.absorbedParcels,'actual stored slots match the net absorption ledger');
    assert.equal(stored.bound+stored.flowing+stored.reserve,stored.total,'discharge preserves the resident inventory');
    await pointer('up',left.target,left.y);await evaluate('__toy.pause(false)');await advance(2);
    const refillStart=await evaluate('__toy.thirsty().stats().absorbedParcels');
    await evaluate('__toy.machinePrimary()');await advance(4);
    const refilled=await capture(prefix+'-refilled');
    assert.ok(refilled.uptake.absorbedParcels>refillStart+300,'after release the slime drinks and grows again');
    await evaluate('document.getElementById("toy-instruments-open").click()');await delay(150);
    assert.ok(await evaluate('document.querySelector("#toy-panel-instruments > .toy-instrument-values").hidden && document.getElementById("toy-air-pressure-toggle").hidden'),'unused pressure readings are hidden');
    await evaluate('document.querySelector("#toy-panel-instruments [data-close]").click()');
    await evaluate('__toy.pause(true);__toy.machine("thirsty-slime",{tapEnabled:false})');
    await until('__toy.machineState()?.ready && __toy.thirsty()?.stats().absorbedParcels===0','restart clears uptake');
    assert.ok(Math.abs(await evaluate('__toy.thirsty().stats().restArea')-dry.uptake.dryArea)<.01,'restart restores dry material');
    await evaluate('__toy.pause(false)');await advance(.5);
    await until('!document.getElementById("toy").classList.contains("is-paused") && document.getElementById("toy-resume").hidden','dry press controls are available');
    const empty=await handle(1,24);await pointer('down',empty.x,empty.y);
    assert.ok(await evaluate('__toy.thirsty().press.stats().held'),'the dry comparison actually grabs the press');
    await pointer('move',empty.target,empty.y);await advance(1);
    const dryPress=await capture(prefix+'-dry-press');
    assert.ok(dryPress.press.q<90,'the empty comparison physically closes the jaws');
    assert.equal(dryPress.uptake.ejectedParcels,0,'squeezing a dry slime cannot invent water');
    await pointer('up',empty.target,empty.y);
    await evaluate('__toy.pause(false);__toy.scene("falls")');
    await until('!!window.__toy && __toy.stats().scene==="falls"','ordinary scene after the press');
    assert.equal(await evaluate('__toy.thirsty()'),null,'changing scenes retires contact resources');
    assert.equal(await evaluate('!!__toy.liquid().toyMembrane'),false);
    assert.ok(await evaluate('!document.querySelector(".toy-tools [data-tool=water]").hidden'),'original tools restore after leaving the scene');
    await evaluate('__toy.scene("float-slider-cistern")');
    await until('!!window.__toy && __toy.stats().scene==="float-slider-cistern" && __toy.machineState()?.ready && __toy.stats().boundary?.ready','ordinary native pool after the press');
    await advance(.3);
    const ordinary=await evaluate('__toy.stats()');
    assert.equal(ordinary.allocation,viewport.mobile?40000:100000,'other native scenes keep their full reserve allocation');
    assert.equal(ordinary.boundary.error,null);assert.equal(await evaluate('__toy.thirsty()'),null);

  }
  assert.deepEqual(errors,[],'no JavaScript or GPU errors');
  console.log('PASS: dry and off-stream controls, 16x swelling, conserved native discharge, multiple rising jets, load-dependent speed, shrinking, recoil, both handles, release, refill, pause, restart and scene cleanup with mouse and emulated touch.');
} finally {
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));await cleanup();
}
