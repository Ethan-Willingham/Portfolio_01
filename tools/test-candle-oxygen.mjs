// Real GPU and ordinary host playback in an owned Chrome for Testing process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(),'candle-oxygen-'));
const profile=path.join(out,'profile'),port=Number(process.env.PORT || 8813),debug=port+1000;
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
  throw Error('Timed out: '+expression+' '+JSON.stringify(await ev('window.__toy?.fire()?.stats()')));
}
function check(label,condition){assert(condition,label);console.log('PASS '+label);}
async function record(name){
  const state=await ev('__toy.fire().stats()');observations.push({name,...state});console.log(name,JSON.stringify(state));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));return state;
}
async function fresh(options){
  await ev('__toy.pause(true)');
  await ev('__toy.machine("candle-in-jar",'+JSON.stringify(options)+')');
  await until('__toy.machineState()?.ready && !!__toy.fire() && !__toy.stats().loading');
  await ev('__toy.pause(false)');
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
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=candle-in-jar'});
  await until('!!window.__toy && !!__toy.fire() && __toy.machineState()?.ready && !__toy.stats().loading');
  check('real water and smoke backends boot',await ev('__toy.stats().waterState==="on" && __toy.stats().smoke'));
  const start=await record('sealed-burning');
  check('sealed candle starts with finite oxygen and no ember',start.burning && start.oxygenFraction>.19 && start.emberInputJ===0);
  await until('__toy.fire().stats().oxygenFraction<.178 && __toy.fire().stats().burning');
  const dim=await record('sealed-dimming');
  check('oxygen depletion weakens the live flame',dim.burnStrength>0 && dim.burnStrength<.75 && dim.oxygenConsumedLitres>0);
  await ev('__toy.pause(true)');await delay(100);
  const paused=await ev('__toy.fire().stats().elapsed');await delay(500);
  check('pause freezes oxygen consumption',await ev('__toy.fire().stats().elapsed')===paused);
  await ev('__toy.pause(false)');
  await until('__toy.fire().stats().extinguished');
  const outState=await record('sealed-out');
  check('sealed candle extinguishes at low oxygen',!outState.burning && outState.burnStrength===0 && outState.oxygenStarved && outState.emberInputJ===0);
  check('oxygen and heat ledgers balance',Math.abs(outState.oxygenResidualLitres)<1e-5 && Math.abs(outState.heatResidualJ)<1);
  const consumed=outState.oxygenConsumedLitres;
  await until('__toy.fire().stats().elapsed>'+String(outState.elapsed+2));
  check('an extinguished candle stops consuming oxygen',Math.abs((await ev('__toy.fire().stats().oxygenConsumedLitres'))-consumed)<1e-7);
  await ev('__toy.machinePrimary()');
  await until('__toy.fire().stats().oxygenFraction>.205');
  const aired=await record('opened-after-extinction');
  check('opening admits fresh oxygen without spontaneous relighting',aired.oxygenSuppliedLitres>0 && aired.extinguished && !aired.burning && aired.relights===0);
  await fresh({opened:true});
  await until('__toy.fire().stats().elapsed>30');
  const open=await record('open-burning');
  check('an open lid sustains the flame beyond sealed burnout',open.burning && open.oxygenFraction>.20 && open.oxygenSuppliedLitres>0 && !open.extinguished);
  await ev('__toy.machinePrimary()');
  await until('__toy.fire().stats().extinguished');
  check('replacing the lid traps a finite supply and extinguishes again',!(await ev('__toy.fire().stats().burning')));
  await fresh({});
  await until('__toy.fire().stats().elapsed>2');
  await ev('__toy.machinePrimary()');
  await until('__toy.fire().stats().elapsed>30');
  check('lifting the lid before extinction saves the existing flame',await ev('__toy.fire().stats().burning && !__toy.fire().stats().extinguished'));
  await ev('__toy.pause(true);__toy.machine("douse-fire",{})');
  await until('__toy.machineState()?.ready && !!__toy.fire() && !__toy.stats().loading');
  await ev('__toy.pause(false)');await until('__toy.fire().stats().elapsed>3');
  check('ordinary open-air fire keeps its existing ember behavior',await ev('__toy.fire().stats().burning && __toy.fire().stats().oxygenFraction===null && !__toy.machineState().definition.fire.noEmber'));
  await ev('__toy.machinePrimary()');await until('__toy.fire().stats().quenchEvents>0');
  check('native water still douses the ordinary fire',await ev('__toy.fire().stats().sourceToWaterJ>0'));
  await until('__toy.fire().stats().relights>0');
  check('the ordinary fire still reheats and relights after water drains',await ev('__toy.fire().stats().emberInputJ>0'));
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await fresh({});await until('__toy.fire().stats().extinguished');
  await record('mobile-sealed-out');
  check('landscape mobile uses the same oxygen extinction',await ev('!__toy.fire().stats().burning && __toy.fire().stats().oxygenStarved'));
  check('no browser or shader errors',errors.length===0);
  fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(observations,null,2));
  console.log('Artifacts '+out);
}finally{
  for(const p of pending.values())clearTimeout(p.timer);pending.clear();try{socket?.close();}catch{}
  if(chrome && chrome.exitCode===null && chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
    const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  server.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
