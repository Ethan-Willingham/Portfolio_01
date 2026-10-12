// Center support, fan controls and grab regression, using owned Chrome for Testing.
// Screenshots and measured slime/flow states go to /tmp/smoke-wind-tunnel-review.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.DUMP || '/tmp/smoke-wind-tunnel-review';
const port=Number(process.env.PORT || 8487),debug=port+1000;
const profile=fs.mkdtempSync('/tmp/smoke-wind-tunnel-browser-');
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
  const end=await evaluate('__toy.smokeWindTunnel().stats(__toy.bodies()).seconds')+seconds;
  for(let i=0;i<Math.ceil(seconds*40)+200;i++){
    if(await evaluate(`__toy.smokeWindTunnel().stats(__toy.bodies()).seconds>=${end}`))return;
    await delay(100);
  }
  throw Error('Timed out advancing tunnel clock');
}
async function capture(name){
  const report=await evaluate(`(()=>{
    const T=__toy,b=T.bodies()[0],smoke=T.smokeWindTunnel().stats(T.bodies());
    return {smoke,center:[b.cx,b.cy],bounds:[b.bboxL,b.bboxR,b.bboxT,b.bboxB],
      finite:[...b.px,...b.py,...b.ox,...b.oy].every(Number.isFinite),
      gripping:T.keyboardState().grabbing,reading:T.instruments(),version:T.version};
  })()`);
  reports.push({name,...report});console.log(name,JSON.stringify({center:report.center,seconds:report.smoke.seconds,
    supportError:report.smoke.supportError,strain:report.smoke.strain,wakeDye:report.smoke.wakeDye}));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
  assert.ok(report.finite,'all slime position and velocity coordinates stay finite');
  assert.equal(report.reading.error,null,'no scene error');return report;
}
async function clickFan(){
  const point=await evaluate(`(()=>{const b=document.querySelector('.toy-scene-action[data-control="primary"]');
    const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
}
async function grab(){
  const point=await evaluate(`(()=>{const r=document.getElementById('toy-input').getBoundingClientRect(),w=__toy.world(),b=__toy.bodies()[0];return {x:r.x+(b.cx+22)*r.width/w.w,y:r.y+b.cy*r.height/w.h,scale:r.height/w.h};})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y});
  for(let i=1;i<=16;i++){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:point.x+i*2*point.scale,y:point.y-i*2*point.scale});await delay(25);
  }
  const held=await capture('grab-held');assert.ok(held.gripping,'the slime remains grabbable');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x+32*point.scale,y:point.y-32*point.scale});
  await advance(12);const released=await capture('grab-released');
  assert.ok(!released.gripping,'release ends the grip');assert.ok(Math.abs(released.center[1]-200)<18,'the released slime returns to mid-channel');
}
async function cleanup(){
  socket?.close();server.close();
  for(const item of pending.values())clearTimeout(item.timer);
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
  assert.ok(endpoint,'owned browser starts');
  socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const item=pending.get(m.id);pending.delete(m.id);clearTimeout(item?.timer);m.error?item?.reject(m.error):item?.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value || a.description));
  });
  await send('Runtime.enable');await send('Page.enable');
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html?scene=smoke-wind-tunnel`});
    await until('!!window.__toy && __toy.machineState()?.ready && !!__toy.smokeWindTunnel()','tunnel boot');
    const prefix=viewport.mobile?'mobile':'desktop';
    await evaluate(`window.__tunnelSamples=[];window.__tunnelTimer=setInterval(()=>{const b=__toy.bodies()[0];__tunnelSamples.push([b.cx,b.cy,b.bboxT,b.bboxB]);},100)`);
    await capture(prefix+'-initial');
    for(const seconds of [5,10,15]){
      await advance(seconds);const live=await capture(prefix+'-on-'+seconds);
      assert.ok(live.smoke.fieldReady && live.smoke.wakeDye>0,'the actual smoke wake remains visible');
      assert.ok(live.smoke.strain>.05,'the supported gel still deforms under airflow');
    }
    const samples=await evaluate('clearInterval(__tunnelTimer);__tunnelSamples');
    const maxY=Math.max(...samples.map(p=>Math.abs(p[1]-200))),maxX=Math.max(...samples.map(p=>Math.abs(p[0]-272)));
    console.log(prefix+'-center-range',JSON.stringify({maxY,maxX}));
    assert.ok(maxY<18,prefix+' center stays within half a radius of mid-channel');
    assert.ok(maxX<40,prefix+' support prevents horizontal drift');
    assert.ok(samples.every(p=>p[2]>112 && p[3]<288),prefix+' gel clears both tunnel walls');
    await clickFan();await advance(5);const off=await capture(prefix+'-off');assert.equal(off.smoke.fanEnabled,false);
    await clickFan();await advance(4);const on=await capture(prefix+'-restarted');assert.equal(on.smoke.fanEnabled,true);
    assert.ok(on.smoke.fanImpulse>off.smoke.fanImpulse,'restarting supplies actual airflow');
    if(!viewport.mobile)await grab();
  }
  // A fresh fan-off setup has no pressure drive and stays centered.
  await evaluate(`__toy.machine('smoke-wind-tunnel',{fanOff:true})`);await until('__toy.machineState()?.ready','fan-off setup');
  await advance(5);const quiet=await capture('fresh-fan-off');
  assert.ok(Math.abs(quiet.center[0]-272)<.01 && Math.abs(quiet.center[1]-200)<.01,'fan-off starts stress-free at the center');
  assert.deepEqual(errors,[],'no JavaScript or GPU errors');
  console.log('PASS: centered live airflow, desktop/mobile fan cycles, grab recovery and stress-free fan-off.');
} finally {
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));await cleanup();
}
