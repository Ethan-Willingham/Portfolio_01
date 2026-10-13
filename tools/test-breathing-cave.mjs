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
async function pressureTarget(side){
  const target=await ev(`(()=>{const b=document.querySelector('[data-cave-pressure="${side}"]'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,enabled:!b.disabled,label:b.getAttribute('aria-label')};})()`);
  check(side+' pressure button is accessible and at least 44 pixels',target.enabled && target.width>=44 && target.height>=44 && target.label.includes('10 hectopascals') && target.label.includes('hold'));
  return target;
}
async function clickPressure(side,touch){
  const target=await pressureTarget(side);
  if(touch){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});}
}
async function pressureHoldCheck(touch,prefix){
  await ev('__toy.pause(true)');
  const target=await pressureTarget('outside'),before=await ev('__toy.breathingCave().stats().outsidePressurePa');
  if(touch)await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
  else await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});
  check('held pressure is visibly pressed',await ev('document.querySelector("[data-cave-pressure=outside]").getAttribute("aria-pressed")==="true"'));
  await delay(600);const during=await ev('__toy.breathingCave().stats().outsidePressurePa');
  await delay(400);const later=await ev('__toy.breathingCave().stats().outsidePressurePa');
  check('holding continuously raises pressure after the tap',during-before>1600 && later-during>1000);
  if(touch)await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:2,y:2});
  const released=await ev('__toy.breathingCave().stats().outsidePressurePa');await delay(350);
  check('release outside the target immediately stops pressure input',await ev('__toy.breathingCave().stats().outsidePressurePa')===released && await ev('document.querySelector("[data-cave-pressure=outside]").getAttribute("aria-pressed")==="false"'));
  // Native keyboard events test both hold and browser-generated clicks.
  await ev('document.querySelector("[data-cave-pressure=inside]").focus()');
  const old=await ev('__toy.breathingCave().stats().pumpedKg');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(700);
  check('Space holds the pressure input',await ev('__toy.breathingCave().stats().pumpedKg')>old && await ev('document.querySelector("[data-cave-pressure=inside]").getAttribute("aria-pressed")==="true"'));
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  const up=await ev('__toy.breathingCave().stats().pumpedKg');await delay(350);
  check('keyboard release stops input without a duplicate click',await ev('__toy.breathingCave().stats().pumpedKg')===up);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(300);
  await ev('document.querySelector("[data-cave-pressure=inside]").blur()');
  const blurred=await ev('__toy.breathingCave().stats().pumpedKg');await delay(350);
  check('losing focus cancels a keyboard hold',await ev('__toy.breathingCave().stats().pumpedKg')===blurred && await ev('document.querySelector("[data-cave-pressure=inside]").getAttribute("aria-pressed")==="false"'));
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await ev('document.querySelector("[data-cave-pressure=inside]").focus()');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(350);
  await ev('window.dispatchEvent(new Event("blur"))');
  const inactive=await ev('__toy.breathingCave().stats().pumpedKg');await delay(350);
  check('window inactivity cancels held input and its scheduling',await ev('__toy.breathingCave().stats().pumpedKg')===inactive && await ev('document.querySelector("[data-cave-pressure=inside]").getAttribute("aria-pressed")==="false"'));
  await ev('window.dispatchEvent(new Event("focus"))');
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(250);
  check('returning to the window does not restart the old hold',await ev('__toy.breathingCave().stats().pumpedKg')===inactive);
  if(touch){
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});await delay(350);
    await call('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});const cancelled=await ev('__toy.breathingCave().stats().outsidePressurePa');await delay(350);
    check('touch cancellation stops input',await ev('__toy.breathingCave().stats().outsidePressurePa')===cancelled);
  }
  console.log('pressure hold',JSON.stringify({touch,tapAndHoldPa:later-before,continuousGainPa:later-during}));
  await ev('__toy.machine("breathing-cave",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  await ev('__toy.pause(false)');
  const liveTarget=await pressureTarget('inside');
  if(touch)await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:liveTarget.x,y:liveTarget.y}]});
  else await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:liveTarget.x,y:liveTarget.y});
  await delay(1600);const live=await record(prefix+'-held');
  check('holding during playback drives visible vane motion',live.speedMetersPerSecond>5 && live.vaneAngularTravel>30 && live.vaneDistanceMeters>50 && live.movingVanes>30);
  if(touch)await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:liveTarget.x,y:liveTarget.y});
  await ev('__toy.pause(true);__toy.machine("breathing-cave",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  await ev('__toy.pause(false)');
}
async function indicatorCheck(name){
  const ui=await ev(`(()=>{
    const panel=document.getElementById('toy-cave-indicator'),meter=document.getElementById('toy-cave-meter');
    const stage=document.getElementById('toy-stage').getBoundingClientRect(),p=panel.getBoundingClientRect(),top=document.querySelector('.toy-top').getBoundingClientRect();
    const style=getComputedStyle(panel),heading=getComputedStyle(document.getElementById('toy-cave-flow'));
    return {hidden:panel.hidden,flow:panel.dataset.flow,pressure:document.getElementById('toy-cave-pressure-text').textContent,
      context:document.getElementById('toy-cave-context').textContent,placement:style.getPropertyValue('--cave-placement').trim(),
      panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom,width:p.width,height:p.height},stage:{right:stage.right,bottom:stage.bottom},
      width:innerWidth,height:innerHeight,topEnd:top.bottom,meterRole:meter.getAttribute('role'),meterText:meter.getAttribute('aria-valuetext'),
      role:document.getElementById('toy-cave-flow').getAttribute('role'),fontSize:parseFloat(heading.fontSize),color:heading.color,background:style.backgroundColor,
      paused:!document.getElementById('toy-cave-paused').hidden,tracer:panel.querySelector('.toy-cave-tracer').textContent};
  })()`);
  const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(v=>{const x=Number(v)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
  const luminance=color=>rgb(color).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=luminance(ui.color),b=luminance(ui.background);const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  check(name+' indicator is readable, within view and clear of the apparatus',!ui.hidden && ui.panel.left>=0 && ui.panel.right<=ui.width && ui.panel.top>=ui.topEnd && ui.panel.bottom<=ui.height && ui.fontSize>=20 && contrast>=4.5 &&
    (ui.placement==='side'?ui.stage.right<ui.panel.left:ui.stage.bottom<ui.panel.top));
  check(name+' has semantic pressure, status and vane labels',ui.meterRole==='meter' && ui.meterText===ui.pressure && ui.role==='status' && ui.tracer.includes('Arrows travel and turn with the air'));
  console.log(name+' indicator',JSON.stringify(ui));return ui;
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
  await call('Page.bringToFront');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await call('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=breathing-cave'});
    await until('!!window.__toy && !!__toy.breathingCave() && __toy.machineState()?.ready && !__toy.stats().loading');
    const prefix=viewport.mobile?'mobile':'desktop';
    check('scene reports live pressure instead of waiting',await ev('document.getElementById("toy-status").textContent!=="Waiting for pressure"'));
    await until('__toy.breathingCave().stats().seconds>1');const balanced=await record(prefix+'-balanced');
    check('cave starts balanced with no automatic pressure or rotation',balanced.flowM3PerSecond===0 && balanced.massKg===balanced.initialMassKg && balanced.vaneAngularTravel===0);
    await indicatorCheck(prefix+'-balanced');
    if(process.env.PREVIEW_ONLY!=='1')await pressureHoldCheck(viewport.mobile,prefix);
    await ev(`(()=>{const m=__toy.breathingCave(),tick=m.tick.bind(m);window.rotationAudit={maxFrameAngle:0,samples:0,positionsMoved:0,identitiesChanged:0,maxFrameTravel:0};m.tick=function(dt){const old=m.vanes();tick(dt);m.vanes().forEach((v,i)=>{rotationAudit.maxFrameAngle=Math.max(rotationAudit.maxFrameAngle,Math.abs(v.angle-old[i].angle));if(v.x!==old[i].x || v.y!==old[i].y)rotationAudit.positionsMoved++;if(v.id!==old[i].id)rotationAudit.identitiesChanged++;rotationAudit.maxFrameTravel=Math.max(rotationAudit.maxFrameTravel,Math.hypot(v.x-old[i].x,v.y-old[i].y));});rotationAudit.samples++;};})()`);
    await ev('__toy.pause(true)');const before=await ev('__toy.breathingCave().stats()');
    await clickPressure('inside',viewport.mobile);const input=await ev('__toy.breathingCave().stats()');
    check('inside button adds real mass and exactly 10 hPa without changing outside',input.pumpedKg>0 && Math.abs(input.pressurePa-before.pressurePa-1000)<1e-6 && input.outsidePressurePa===before.outsidePressurePa);
    const singleStart=await ev('__toy.breathingCave().stats().seconds');await ev('__toy.pause(false)');
    await until('__toy.breathingCave().stats().seconds>'+String(singleStart+3));
    const response=await ev('(()=>{const room=__toy.breathingCave().vanes().filter(v=>v.x<460),turns=room.map(v=>Math.abs(v.angle-v.initialAngle)).sort((a,b)=>a-b);return {median:turns[Math.floor(turns.length/2)],min:turns[0],distance:__toy.breathingCave().stats().vaneDistanceMeters};})()');
    check('single tap visibly moves and turns the chamber arrows',response.median>Math.PI/4 && response.min>.1 && response.distance>100);console.log(prefix+' single tap response',JSON.stringify(response));await record(prefix+'-single-tap');
    await clickPressure('inside',viewport.mobile);
    await until('__toy.breathingCave().stats().speedMetersPerSecond>5');await record(prefix+'-out');
    check('inside pressure drives outgoing air',(await indicatorCheck(prefix+'-out')).flow==='out');
    await until('__toy.breathingCave().stats().seconds>3');
    await ev('__toy.pause(true)');const outsideBefore=await ev('__toy.breathingCave().stats()');
    for(let i=0;i<4;i++)await clickPressure('outside',viewport.mobile);
    const outsideInput=await ev('__toy.breathingCave().stats()');
    check('outside button changes only the reservoir pressure',outsideInput.outsidePressurePa-outsideBefore.outsidePressurePa===4000 && outsideInput.massKg===outsideBefore.massKg);
    await ev('__toy.pause(false)');await until('document.getElementById("toy-cave-paused").hidden');
    const reversing=await indicatorCheck(prefix+'-reversing');
    check('readout explains actual entrance inertia',reversing.flow==='out' && reversing.context.includes('reverse'));
    await record(prefix+'-reversing');
    await until('__toy.breathingCave().stats().speedMetersPerSecond < -5');await record(prefix+'-in');
    check('outside pressure drives incoming air',(await indicatorCheck(prefix+'-in')).flow==='in');if(process.env.PREVIEW_ONLY==='1')continue;
    const turningStart=await ev('__toy.breathingCave().stats().seconds');await until('__toy.breathingCave().stats().seconds>'+String(turningStart+1.5));await record(prefix+'-turned');
    const audit=await ev('rotationAudit');check('arrows travel and turn continuously with persistent identities in normal playback',audit.samples>100 && audit.maxFrameAngle<Math.PI/2 && audit.positionsMoved>1000 && audit.identitiesChanged===0 && audit.maxFrameTravel<5);console.log(prefix+' rotation audit',JSON.stringify(audit));
    await ev('__toy.pause(true)');const clock=await ev('__toy.breathingCave().stats().seconds'),angles=await ev('JSON.stringify(__toy.breathingCave().vanes())');await delay(400);
    check('pause freezes gas, arrow travel and angular momentum',await ev('__toy.breathingCave().stats().seconds')===clock && await ev('JSON.stringify(__toy.breathingCave().vanes())')===angles);check('pause is explicit in the indicator',(await indicatorCheck(prefix+'-paused')).paused);
    await clickMouth(viewport.mobile);
    const closed=await ev('__toy.breathingCave().stats()');check('actual entrance is closed',!closed.mouthOpen);
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>'+String(clock+2));
    const held=await record(prefix+'-closed');check('closed mouth is explicit in the indicator',(await indicatorCheck(prefix+'-closed')).flow==='closed');
    check('closed mouth retains finite gas and stops airflow',held.massKg===closed.massKg && held.flowM3PerSecond===0);
    await clickMouth(viewport.mobile);await until('Math.abs(__toy.breathingCave().stats().speedMetersPerSecond)>5');await record(prefix+'-reopened');
    await ev('__toy.pause(true)');
    await ev('document.getElementById("toy-native-setup").value="manual";document.getElementById("toy-native-setup").dispatchEvent(new Event("change",{bubbles:true}))');await until('__toy.machineState()?.ready && !__toy.stats().loading');
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>2');const steady=await record(prefix+'-steady');const steadyUI=await indicatorCheck(prefix+'-steady');check('steady pressure reads as balanced and still',steadyUI.pressure==='Pressures are balanced' && steadyUI.flow==='still');
    check('reset returns to balanced pressure without automatic airflow',steady.flowM3PerSecond===0 && steady.massKg===steady.initialMassKg && steady.vaneAngularTravel===0);
    check('manual and closed setups are available without weather cycling',await ev('Array.from(document.querySelectorAll("#toy-native-setup option")).map(o=>o.value).join(",")==="manual,closed"'));
    if(viewport.mobile){await call('Emulation.setDeviceMetricsOverride',{...viewport,height:350,deviceScaleFactor:1});await delay(400);await indicatorCheck('mobile-short');await record('mobile-short');}
    await ev('document.getElementById("toy-instruments-open").click()');await delay(200);await record(prefix+'-instruments');
  }
  await ev('__toy.pause(true);__toy.machine("glugging-bottle",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  await ev('__toy.machine("breathing-cave",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  check('a pressure draft cannot overwrite the working cave module',await ev('!!__toy.breathingCave() && !!__toy.machineState().definition.cave'));
  await call('Emulation.setDeviceMetricsOverride',{width:600,height:800,mobile:false,deviceScaleFactor:1});await delay(400);await indicatorCheck('narrow-desktop');await record('narrow-desktop');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await clickPressure('outside',false);await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>2');await record('reduced-motion');
  check('reduced motion still displays the actual vane response',await ev('__toy.breathingCave().stats().visualMotion==="moving-arrows" && __toy.breathingCave().stats().admittedKg>0 && __toy.breathingCave().stats().vaneAngularTravel>0'));
  const painted=await ev(`(()=>{const m=__toy.breathingCave(),canvas=document.createElement('canvas'),c=canvas.getContext('2d');let path=[],shaft=[];c.moveTo=(x,y)=>path=[[x,y]];c.lineTo=(x,y)=>path.push([x,y]);c.stroke=()=>shaft.push(path);m.draw(c,{scale:1,air:'white'});return shaft.every((p,i)=>Math.cos(Math.atan2(p[1][1]-p[0][1],p[1][0]-p[0][0])-m.vanes()[i].angle)>1-1e-8);})()`);
  check('reduced motion does not freeze the displayed angle at rest',painted);
  await call('Emulation.setEmulatedMedia',{features:[]});
  // The ordinary smoke scene still boots the unchanged WebGL solver.
  await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=chimney'});
  await until('!!window.__toy && __toy.stats().smoke && !__toy.stats().loading');
  check('cave indicator is hidden in other scenes',await ev('document.getElementById("toy-cave-indicator").hidden'));
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
