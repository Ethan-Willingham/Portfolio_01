// Real GPU and ordinary host playback in an owned Chrome for Testing process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(),'breathing-cave-'));
const profile=path.join(out,'profile'),port=Number(process.env.PORT || 8819),debug=port+1000;
fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});response.end(fs.readFileSync(file));
  }catch{response.writeHead(404).end();}
});
let chrome,socket,serial=0;
const pending=new Map(),errors=[],observations=[];
function call(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression){
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function until(expression,timeout=60000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await ev(expression))return;await delay(100);}
  throw Error('Timed out: '+expression+' '+JSON.stringify(await ev('window.__toy?.breathingCave()?.stats()')));
}
function check(label,condition){assert(condition,label);console.log('PASS '+label);}
async function record(name){
  const state=await ev('__toy.breathingCave().stats()');observations.push({name,...state});console.log(name,JSON.stringify(state));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));return state;
}
async function clickMouth(touch){
  const target=await ev(`(()=>{const r=document.querySelector('.toy-scene-action[data-control="primary"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
  check('mouth target is at least 44 pixels',target.width>=44 && target.height>=44);
  if(touch){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});}
}

try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
    '--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
  let endpoint;
  for(let n=0;n<100;n++){
    try{endpoint=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;}catch{}
    if(endpoint)break;await delay(100);
  }
  assert(endpoint,'Owned browser started');socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p?.timer);message.error?p?.reject(Error(JSON.stringify(message.error))):p?.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    else if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error')errors.push(message.params.args);
  });
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await call('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=breathing-cave'});
    await until('!!window.__toy && !!__toy.breathingCave() && __toy.machineState()?.ready && !__toy.stats().loading');
    const prefix=viewport.mobile?'mobile':'desktop';
    check('scene reports live pressure instead of waiting',await ev('document.getElementById("toy-status").textContent!=="Waiting for pressure"'));
    await until('__toy.breathingCave().stats().speedMetersPerSecond < -5');const inhaled=await record(prefix+'-in');
    await until('__toy.breathingCave().stats().speedMetersPerSecond > 5');await record(prefix+'-out');
    await until('__toy.breathingCave().stats().seconds>16');const exhaled=await record(prefix+'-exhaling');
    check('computed airflow carries the finite smoke out of the chamber',exhaled.smokeInChamber<inhaled.smokeInChamber);
    await ev('__toy.pause(true)');const clock=await ev('__toy.breathingCave().stats().seconds');await delay(400);
    check('pause freezes gas and smoke',await ev('__toy.breathingCave().stats().seconds')===clock);
    await clickMouth(viewport.mobile);
    const closed=await ev('__toy.breathingCave().stats()');check('actual entrance is closed',!closed.mouthOpen);
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>'+String(clock+2));
    const held=await record(prefix+'-closed');
    check('closed mouth retains actual finite gas and smoke',held.massKg===closed.massKg && held.smokeAmount===closed.smokeAmount && held.flowM3PerSecond===0);
    await clickMouth(viewport.mobile);await until('Math.abs(__toy.breathingCave().stats().speedMetersPerSecond)>5');await record(prefix+'-reopened');
    await ev('__toy.pause(true)');
    await ev('document.getElementById("toy-native-setup").value="steady";document.getElementById("toy-native-setup").dispatchEvent(new Event("change",{bubbles:true}))');await until('__toy.machineState()?.ready && !__toy.stats().loading');
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>2');const steady=await record(prefix+'-steady');
    check('steady pressure produces no airflow',steady.flowM3PerSecond===0 && steady.massKg===steady.initialMassKg && steady.smokeAmount===steady.initialSmokeAmount);
    check('steady comparison is available in Instruments',await ev('Array.from(document.querySelectorAll("#toy-native-setup option")).some(o=>o.value==="steady")'));
    await ev('document.getElementById("toy-instruments-open").click()');await delay(200);await record(prefix+'-instruments');
  }
  await ev('__toy.pause(true);__toy.machine("glugging-bottle",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  await ev('__toy.machine("breathing-cave",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  check('a pressure draft cannot overwrite the working cave module',await ev('!!__toy.breathingCave() && !!__toy.machineState().definition.cave'));
  // The ordinary smoke scene still boots the unchanged WebGL solver.
  await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=chimney'});
  await until('!!window.__toy && __toy.stats().smoke && !__toy.stats().loading');
  check('ordinary smoke remains available',await ev('!__toy.breathingCave() && __toy.stats().smoke'));
  check('no browser or shader errors',errors.length===0);
  fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(observations,null,2));console.log('Artifacts '+out);

}finally{
  for(const p of pending.values())clearTimeout(p.timer);pending.clear();try{socket?.close();}catch{}
  if(chrome && chrome.exitCode===null && chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
    const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  server.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
