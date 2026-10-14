// Browser acceptance through real input and ordinary animation-frame playback.
// No solver stepping, clock replacement, or hidden fast-forward is used here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.DUMP || '/tmp/water-rocket-review';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-rocket-chrome-'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[],observations=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
fs.mkdirSync(output,{recursive:true});
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    response.end(fs.readFileSync(file));
  }catch{response.writeHead(404).end();}
});
let chrome,socket,sequence=0;
const pending=new Map();
function call(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},45000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function until(expression,timeout=45000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await evaluate(expression))return;await delay(100);}
  throw Error('Timed out: '+expression+'\n'+JSON.stringify(await evaluate('window.WSSWaterRocket?.active?.stats()')));
}
function check(label,condition){assert(condition,label);console.log('PASS '+label);}
async function stats(){return evaluate('WSSWaterRocket.active.stats()');}
async function capture(name){
  const sample=await stats();observations.push({name,...sample});
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(screenshot.data,'base64'));
  const brief={...sample};for(const key of ['flightSamples','exhaustEvents'])if(Array.isArray(brief[key]))brief[key]=brief[key].length;
  console.log(name,JSON.stringify(brief));
  console.log(name+' native',JSON.stringify(await evaluate('WSSWaterRocket.active.waterStats()')));
  return sample;
}
async function point(selector){
  const target=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,disabled:e.disabled,label:e.getAttribute('aria-label') || e.textContent};})()`);
  assert(target,'Control exists: '+selector);assert(!target.disabled,'Control is enabled: '+selector);return target;
}
async function click(selector,touch=false){
  const target=await point(selector);
  if(touch){
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});
  }
}
async function key(key,code,windowsVirtualKeyCode){
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
}
async function keyboardRange(selector){
  const before=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return {value:+e.value,step:+e.step,min:+e.min,max:+e.max,labels:Array.from(e.labels || []).map(l=>l.textContent.trim())};})()`);
  await key('ArrowRight','ArrowRight',39);
  const after=await evaluate(`+document.querySelector(${JSON.stringify(selector)}).value`);
  check(selector+' has a label and changes through the keyboard',before.labels.some(Boolean) && Math.abs(after-before.value-before.step)<1e-9 && after<=before.max);
  const model=await stats();
  check(selector+' updates the experiment configuration',selector==='#rocket-fill' ? Math.abs(model.fillFraction-after/100)<1e-9 : model.targetPressurePsi===after);
  await key('ArrowLeft','ArrowLeft',37);
  check(selector+' can return to its original setting',await evaluate(`+document.querySelector(${JSON.stringify(selector)}).value`)===before.value);
}
async function layout(name){
  const result=await evaluate(`(()=>{const root=document.getElementById('toy-water-rocket');const ids=['rocket-pump','rocket-latch','rocket-fill','rocket-slow','rocket-altitude','rocket-pressure-value'];return {hidden:root.hidden,phase:root.dataset.phase,width:innerWidth,height:innerHeight,headerBottom:document.querySelector('.toy-top').getBoundingClientRect().bottom,scroll:document.documentElement.scrollWidth,controls:ids.map(id=>{const e=document.getElementById(id);const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,font:parseFloat(s.fontSize),visible:s.display!=='none' && s.visibility!=='hidden'};})};})()`);
  check(name+' controls remain visible inside the viewport and below the header',!result.hidden && result.scroll<=result.width+1 && result.controls.every(c=>c.visible && c.width>0 && c.height>0 && c.left>=-1 && c.right<=result.width+1 && c.top>=result.headerBottom-1 && c.bottom<=result.height+1));
  const actions=result.controls.filter(c=>c.id==='rocket-pump'||c.id==='rocket-latch');
  check(name+' apparatus controls are 44-pixel touch targets',actions.every(c=>c.width>=44 && c.height>=44));
  console.log(name+' layout',JSON.stringify(result));return result;
}
async function readyToLaunch(touch){
  await until('!document.getElementById("rocket-pump").disabled');
  const target=await point('#rocket-pump');
  if(touch) await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
  else await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});
  await delay(3000);
  if(touch) await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});
  await until('!document.getElementById("rocket-latch").disabled');
  check('holding the apparatus pump raises actual tank pressure', (await stats()).pressurePa>100000);
}
async function pauseCheck(prefix){
  await click('#toy-pause');await until('__toy.stats().paused');
  const pausedAt=Date.now();
  const before=await stats();await delay(500);const after=await stats();
  // The complete public physics sample should stay unchanged while paused.
  assert.deepEqual(after,before,prefix+' pause freezes the model');console.log('PASS '+prefix+' pause freezes the model');
  await evaluate('window.dispatchEvent(new Event("blur"))');await delay(250);
  await evaluate('window.dispatchEvent(new Event("focus"))');await delay(250);
  check(prefix+' focus return preserves manual pause',await evaluate('__toy.stats().paused'));
  assert.deepEqual(await stats(),before,prefix+' focus return must not advance a manually paused flight');
  await capture(prefix+'-paused');
  await click('#toy-pause');await until('!__toy.stats().paused');
  return (Date.now()-pausedAt)/1000;
}
async function activityCheck(prefix){
  await evaluate('window.dispatchEvent(new Event("blur"))');const before=await stats();
  await delay(500);assert.deepEqual(await stats(),before,prefix+' blur freezes the existing experiment');
  await evaluate('window.dispatchEvent(new Event("focus"))');await delay(250);const after=await stats();
  check(prefix+' focus resumes without adding inactive time',after.elapsed>before.elapsed && after.elapsed-before.elapsed<.4 && !await evaluate('__toy.stats().paused'));
}
async function instrumentsCheck(prefix,touch){
  await click('#toy-instruments-open',touch);await until('!document.getElementById("toy-panel-instruments").hidden');await delay(150);
  const text=await evaluate('document.getElementById("toy-panel-instruments").innerText');
  check(prefix+' Instruments explains the bottle model without native waiting fields',/Water out, bottle up/i.test(text) && /What this model leaves out/i.test(text) && /illustrative simulation/i.test(text) && !/\bWaiting\b/i.test(text));
  await capture(prefix+'-instruments');await click('#toy-panel-instruments [data-close]',touch);
}

try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  const portFile=path.join(profile,'DevToolsActivePort'),deadline=Date.now()+30000;
  while(!fs.existsSync(portFile)){
    if(chrome.exitCode!==null || Date.now()>deadline)throw Error('Owned Chrome for Testing failed to start');
    await delay(100);
  }
  const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const tabs=await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){
      const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);
      message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);
    }else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    else if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error')errors.push(message.params.args.map(arg=>arg.value || arg.description));
  });
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Page.bringToFront');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    const prefix=viewport.mobile?'mobile':'desktop';
    await call('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile});
    await call('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:2});
    await call('Page.navigate',{url:origin+'/archive/water-smoke-slime/water-smoke-slime.html?scene=water-rocket'});
    await until('!!window.__toy && !!window.WSSWaterRocket?.active && __toy.machineState()?.ready && !__toy.stats().loading');
    await until('!document.getElementById("toy-water-rocket").hidden');
    check(prefix+' loads the requested scene at ordinary playback speed',await evaluate('__toy.stats().scene==="water-rocket" && __toy.stats().timeScale===1'));
    await layout(prefix);await capture(prefix+'-setup');
    const originalWater=await evaluate('WSSWaterRocket.active.waterStats()');
    check(prefix+' initializes shared native water in the bottle',originalWater.particles>2500 && originalWater.resident===originalWater.particles && originalWater.emitted===0);
    await activityCheck(prefix);
    await keyboardRange('#rocket-fill');
    await readyToLaunch(viewport.mobile);await capture(prefix+'-ready');
    const launchWall=Date.now();await click('#rocket-latch',viewport.mobile);
    await until('WSSWaterRocket.active.stats().altitude>1');
    await capture(prefix+'-flight');const pausedSeconds=await pauseCheck(prefix);
    const flyingWater=await evaluate('WSSWaterRocket.active.waterStats()');
    const flyingModel=await stats();
    check(prefix+' exhaust transfers conserved native particles',flyingWater.particles===originalWater.particles && flyingWater.emitted>0 && flyingWater.resident<originalWater.resident && flyingWater.readbackAge<.5 && Math.abs(flyingWater.resident*flyingWater.quantumKg-flyingModel.waterMass)<=flyingWater.quantumKg*1.1);
    await until('WSSWaterRocket.active.stats().phase==="descending"',30000);
    await capture(prefix+'-descending');
    await until('WSSWaterRocket.active.stats().phase==="landed"',45000);
    const result=await capture(prefix+'-landed');
    const landedWater=await evaluate('WSSWaterRocket.active.waterStats()');
    check(prefix+' native water remains conserved through landing',landedWater.particles===originalWater.particles && landedWater.emitted===originalWater.particles);
    check(prefix+' completes a finite flight and returns to ground',result.peakAltitude>1 && Math.abs(result.altitude)<.01 && Number.isFinite(result.velocity));
    const wallFlight=(Date.now()-launchWall)/1000-pausedSeconds;
    check(prefix+' flight uses ordinary elapsed time',result.flightTime>0 && result.flightTime<=wallFlight*1.12 && result.flightTime>=wallFlight*.5);
    await click('#rocket-next',viewport.mobile);
    await until('WSSWaterRocket.active.stats().phase==="ready"');
    check(prefix+' next flight restores its water and clears altitude',await evaluate('WSSWaterRocket.active.stats().altitude===0'));
    let before=await stats();await delay(700);let after=await stats();const ordinaryDelta=after.elapsed-before.elapsed;
    await click('#rocket-slow',viewport.mobile);
    check(prefix+' slow motion is explicit',await evaluate('document.getElementById("rocket-slow").checked'));
    before=await stats();await delay(700);after=await stats();const slowDelta=after.elapsed-before.elapsed;
    check(prefix+' slow motion changes elapsed physics time',ordinaryDelta>.2 && slowDelta/ordinaryDelta>.15 && slowDelta/ordinaryDelta<.4);
    await click('#rocket-slow',viewport.mobile);
    await readyToLaunch(viewport.mobile);await evaluate('window.__retiredRocket=WSSWaterRocket.active');await click('#toy-restart',viewport.mobile);
    await until('!!WSSWaterRocket.active && __toy.machineState()?.ready && !__toy.stats().loading && WSSWaterRocket.active.stats().phase==="ready"');
    check(prefix+' global restart reconstructs one fresh scene',await evaluate('document.querySelectorAll("#toy-water-rocket").length===1 && WSSWaterRocket.active.stats().altitude===0'));
    check(prefix+' restart retires the previous runtime',await evaluate('WSSWaterRocket.active!==__retiredRocket'));
    const retired=await evaluate('__retiredRocket.stats()');await delay(350);
    assert.deepEqual(await evaluate('__retiredRocket.stats()'),retired,prefix+' retired rocket state stops advancing');
    await instrumentsCheck(prefix,viewport.mobile);
    if(viewport.mobile){
      await call('Emulation.setDeviceMetricsOverride',{...viewport,height:350,deviceScaleFactor:2});await delay(250);
      await layout('mobile-short');await capture('mobile-short');
    }
  }
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await call('Emulation.setDeviceMetricsOverride',{width:620,height:820,mobile:false,deviceScaleFactor:2});await delay(250);
  await layout('narrow-desktop');await capture('narrow-desktop');
  await evaluate('__toy.scene("chimney")');
  // The shared shell navigates when the next scene has a different engine domain.
  await until('!!window.__toy && __toy.stats().scene==="chimney" && !__toy.stats().loading');
  check('scene departure removes the rocket runtime and presentation',await evaluate('!window.WSSWaterRocket?.active && (document.getElementById("toy-water-rocket")?.hidden ?? true)'));
  check('ordinary smoke still runs after leaving the rocket',await evaluate('__toy.stats().smoke && __toy.stats().timeScale===1'));
  check('no browser or shader errors',errors.length===0);
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify({observations,errors},null,2));
  console.log('Artifacts '+output);
}catch(error){
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack,errors,observations},null,2));
  if(socket?.readyState===WebSocket.OPEN){try{const screenshot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'failure.png'),Buffer.from(screenshot.data,'base64'));}catch{}}
  throw error;
}finally{
  for(const item of pending.values())clearTimeout(item.timer);pending.clear();try{socket?.close();}catch{}
  if(chrome && chrome.exitCode===null && chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
    const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
