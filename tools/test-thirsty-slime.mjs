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
async function until(expression,label){
  for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(100);}
  throw Error('Timed out: '+label);
}
async function advance(seconds){
  const end=await evaluate('__toy.liquid().simulationClock')+seconds;
  await until(`__toy.liquid().simulationClock>=${end}`,'native clock');
}
async function capture(name){
  const report=await evaluate(`(()=>{
    const b=__toy.bodies()[0],T=__toy.thirsty().stats();let area=0;
    for(let k=0;k<b.ringN;k++){const a=b.ring[k],c=b.ring[(k+1)%b.ringN];area+=b.px[a]*b.py[c]-b.px[c]*b.py[a];}
    return {uptake:T,actualArea:Math.abs(area)/2,finite:[...b.px,...b.py].every(Number.isFinite),
      status:document.getElementById('toy-status').textContent,stats:__toy.stats(),camera:__toy.camera()};
  })()`);
  assert.equal(report.uptake.error,null);assert.equal(report.stats.boundary.error,null);
  assert.ok(report.finite,'the grown mesh stays finite');
  assert.equal(report.stats.boundary.present+report.stats.boundary.parked,report.stats.allocation,'every native slot keeps an owner');
  assert.ok(Math.abs(report.uptake.restArea-(report.uptake.dryArea+report.uptake.grownParcels*1.5625))<.0001,'rest area follows only confirmed absorbed water');
  assert.notEqual(report.status,'Waiting for pressure','no disabled pressure status');
  reports.push({name,...report});console.log(name,JSON.stringify({uptake:report.uptake,actualArea:report.actualArea,status:report.status,allocation:report.stats.allocation,fps:report.stats.fps}));
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
      for(let k=1;k<=35;k++){
        const x=points.x+(points.target-points.x)*k/35,y=points.y;
        if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
        else await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x,y});
        await delay(30);
      }
      await delay(200);
      if(viewport.mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:points.target,y:points.y});
    }
    await drag(270);await advance(.3);
    assert.ok(await evaluate('__toy.bodies()[0].cx<300'),'pointer moves the actual slime away from the stream');
    await evaluate('__toy.machinePrimary()');await advance(2);
    const away=await capture(prefix+'-away');assert.equal(away.uptake.absorbedParcels,0,'falling water away from the slime does not grow it');
    await drag(360);await advance(2);
    const wet=await capture(prefix+'-drinking');assert.ok(wet.uptake.absorbedParcels>100,'actual contact transfers water');
    assert.ok(wet.actualArea>dry.actualArea*1.1,'the visible skin grows');
    await evaluate('__toy.pause(true)');await delay(150);
    const paused=await evaluate('__toy.thirsty().stats()');await delay(300);
    assert.deepEqual(await evaluate('__toy.thirsty().stats()'),paused,'pause holds uptake and rest growth');
    await evaluate('__toy.pause(false)');await until('__toy.thirsty().stats().full','finite capacity');await advance(.5);
    const full=await capture(prefix+'-full');assert.equal(full.uptake.absorbedParcels,full.uptake.capacityParcels);
    assert.ok(full.actualArea>dry.actualArea*2,'full slime is visibly larger');
    await advance(1);assert.equal(await evaluate('__toy.thirsty().stats().absorbedParcels'),full.uptake.absorbedParcels,'full slime stops taking water');
    const inventory=await evaluate(`(()=>{const s=__toy.liquid().toyNativeExtension.snapshot();let bound=0,flowing=0,reserve=0;
      for(let i=0;i<s.count;i++){const kind=s.slots[i*4];if(kind===2){bound++;if(s.flags[i]!==160)throw Error('Bound water became live');}else if(kind===1)flowing++;else if(kind===0)reserve++;else throw Error('Unknown owner');}
      return {bound,flowing,reserve,total:s.count};})()`);
    assert.equal(inventory.bound,full.uptake.absorbedParcels,'unique bound native slots match absorption ledger');
    assert.equal(inventory.bound+inventory.flowing+inventory.reserve,inventory.total);
    await evaluate('document.getElementById("toy-instruments-open").click()');await delay(150);
    assert.ok(await evaluate('document.querySelector("#toy-panel-instruments .toy-instrument-values").hidden && document.getElementById("toy-air-pressure-toggle").hidden'),'unused pressure readings are hidden');
    await evaluate('__toy.pause(true);__toy.machine("thirsty-slime",{})');
    await until('__toy.machineState()?.ready && __toy.thirsty()?.stats().absorbedParcels===0','restart clears uptake');
    assert.ok(Math.abs(await evaluate('__toy.thirsty().stats().restArea')-dry.uptake.dryArea)<.01,'restart restores dry material');
    await evaluate('__toy.pause(false);__toy.scene("falls")');await delay(500);
    assert.equal(await evaluate('__toy.thirsty()'),null,'changing scenes retires contact resources');
    assert.equal(await evaluate('!!__toy.liquid().toyMembrane'),false);
    assert.ok(await evaluate('!document.querySelector(".toy-tools [data-tool=water]").hidden'),'original tools restore after leaving the scene');
  }
  assert.deepEqual(errors,[],'no JavaScript or GPU errors');
  console.log('PASS: dry control, native uptake, visible swelling, saturation, ownership, pause, restart and scene changes on desktop and landscape mobile.');
} finally {
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));await cleanup();
}
