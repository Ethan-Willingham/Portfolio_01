// Contact absorption regression, with an owned Chrome for Testing process.
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
    const growingHandle=await evaluate(`(()=>{const p=__toy.thirsty().press.stats(),r=document.getElementById('toy-stage').getBoundingClientRect(),s=__toy.camera().scale;return {x:r.x+(p.center+p.q)*s,y:r.y+260*s,target:r.x+(p.center+60)*s};})()`);
    if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:growingHandle.x,y:growingHandle.y,id:1}]});
    else await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:growingHandle.x,y:growingHandle.y});
    assert.ok(await evaluate('__toy.thirsty().press.stats().held'),'growing handle is grabbed: '+JSON.stringify(growingHandle));
    if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:growingHandle.target,y:growingHandle.y,id:1}]});
    else await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:growingHandle.target,y:growingHandle.y});
    await advance(2);const growing=await capture(prefix+'-growing-under-load');
    assert.ok(growing.press.held,'the press remains held during growth');
    assert.ok(growing.uptake.absorbedParcels>wet.uptake.absorbedParcels+300,'water uptake continues against the press');
    assert.ok(growing.press.areaRatio>.93,'the constrained gel grows without losing area');
    if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:growingHandle.target,y:growingHandle.y});
    await until('__toy.thirsty().stats().full','finite capacity',1200);await advance(.5);
    const full=await capture(prefix+'-full');assert.equal(full.uptake.absorbedParcels,full.uptake.capacityParcels);
    assert.ok(full.actualArea>dry.actualArea*14,'full slime reaches its much larger capacity');
    await advance(1);assert.equal(await evaluate('__toy.thirsty().stats().absorbedParcels'),full.uptake.absorbedParcels,'full slime stops taking water');
    await evaluate('__toy.machinePrimary()');await advance(1.5);
    const beforePress=await capture(prefix+'-before-press');
    const handle=await evaluate(`(()=>{const p=__toy.thirsty().press.stats(),r=document.getElementById('toy-stage').getBoundingClientRect(),s=__toy.camera().scale;return {x:r.x+(p.center+p.q)*s,y:r.y+260*s,target:r.x+(p.center+65)*s};})()`);
    if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:handle.x,y:handle.y,id:1}]});
    else await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:handle.x,y:handle.y});
    assert.ok(await evaluate('__toy.thirsty().press.stats().held'),'the actual handle starts the squeeze');
    for(let k=1;k<=60;k++){
      const x=handle.x+(handle.target-handle.x)*k/60,y=handle.y;
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
      else await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x,y});
      await delay(35);
    }
    await advance(.7);const squeezed=await capture(prefix+'-squeezed');
    assert.ok(squeezed.press.q<beforePress.press.q-30,'the jaws close');
    assert.ok(squeezed.bounds.top<beforePress.bounds.top-25,'compression produces upward bulging');
    assert.ok(squeezed.press.q>squeezed.press.target+3,'gel load pushes back on the spring handle');
    assert.ok(squeezed.press.areaRatio>.9,'squeezing preserves gel area');
    assert.ok(squeezed.press.minJ>0,'material cells stay uninverted');
    assert.equal(squeezed.uptake.absorbedParcels,full.uptake.absorbedParcels,'squeezing does not invent or lose bound water');
    if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:handle.target,y:handle.y});
    assert.equal(await evaluate('__toy.thirsty().press.stats().held'),false);
    await advance(3);const released=await capture(prefix+'-released');
    assert.ok(released.press.q>squeezed.press.q+30,'return springs reopen the jaws');
    assert.ok(released.bounds.right-released.bounds.left>squeezed.bounds.right-squeezed.bounds.left+20,'the released gel spreads back out');
    // Fast, full-stroke gestures on both handles exercise the contact limit.
    for(const side of [-1,1]){
      const grip=await evaluate(`(()=>{const p=__toy.thirsty().press.stats(),r=document.getElementById('toy-stage').getBoundingClientRect(),s=__toy.camera().scale;return {x:r.x+(p.center+${side}*p.q)*s,y:r.y+260*s,target:r.x+(p.center+${side}*p.min)*s};})()`);
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x,y:grip.y,id:1}]});
      else await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:grip.x,y:grip.y});
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:grip.target,y:grip.y,id:1}]});
      else await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:grip.target,y:grip.y});
      assert.ok(await evaluate('__toy.thirsty().press.stats().q>120'),'the handle pulls a spring instead of teleporting the jaws');
      await advance(1.5);const hard=await capture(prefix+'-hard-'+side);
      assert.ok(hard.press.areaRatio>.93,'hard squeezes retain material area');
      await evaluate('__toy.pause(true)');await delay(150);
      const heldPause=await evaluate('__toy.thirsty().press.stats()');
      assert.equal(heldPause.held,false,'pausing cancels the held press');
      await delay(200);assert.deepEqual(await evaluate('__toy.thirsty().press.stats()'),heldPause,'pause holds mechanical state');
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:grip.target,y:grip.y});
      await evaluate('__toy.pause(false)');await advance(2.5);
      await capture(prefix+'-recover-'+side);
    }
    const inventory=await evaluate(`(()=>{const s=__toy.liquid().toyNativeExtension.snapshot();let bound=0,flowing=0,reserve=0;
      for(let i=0;i<s.count;i++){const kind=s.slots[i*4];if(kind===2){bound++;if(s.flags[i]!==160)throw Error('Bound water became live');}else if(kind===1)flowing++;else if(kind===0)reserve++;else throw Error('Unknown owner');}
      return {bound,flowing,reserve,total:s.count};})()`);
    assert.equal(inventory.bound,full.uptake.absorbedParcels,'unique bound native slots match absorption ledger');
    assert.equal(inventory.bound+inventory.flowing+inventory.reserve,inventory.total);
    await evaluate('document.getElementById("toy-instruments-open").click()');await delay(150);
    assert.ok(await evaluate('document.querySelector("#toy-panel-instruments > .toy-instrument-values").hidden && document.getElementById("toy-air-pressure-toggle").hidden'),'unused pressure readings are hidden');
    await evaluate('__toy.pause(true);__toy.machine("thirsty-slime",{})');
    await until('__toy.machineState()?.ready && __toy.thirsty()?.stats().absorbedParcels===0','restart clears uptake');
    assert.ok(Math.abs(await evaluate('__toy.thirsty().stats().restArea')-dry.uptake.dryArea)<.01,'restart restores dry material');
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
  console.log('PASS: dry control, uptake, 16x swelling, conserved inventory, mouse/touch squeeze, volume retention, jaw resistance, uninverted cells, uncrossed skin, contact clearance, fast gestures, release, pause, restart and scene cleanup.');
} finally {
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));await cleanup();
}
