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
async function reversalCheck(prefix){
  await ev('__toy.pause(true)');
  const sample=await ev(`(()=>{
    const model=__toy.breathingCave();let steps=0;
    while(model.stats().speedMetersPerSecond<-.15 && steps++<24*120)model.tick(1/120);
    steps=0;while(model.stats().speedMetersPerSecond<-.001 && steps++<12000)model.tick(1/12000);
    const canvas=document.createElement('canvas');canvas.width=720;canvas.height=400;
    const context=canvas.getContext('2d');let shafts=0,minAlpha=1;
    const stroke=context.stroke.bind(context);context.stroke=function(){shafts++;minAlpha=Math.min(minAlpha,this.globalAlpha);stroke();};
    model.draw(context,{scale:1,air:getComputedStyle(document.documentElement).getPropertyValue('--app-brass').trim()});
    const pixels=context.getImageData(0,0,720,400).data;
    const markers=model.markers(),visibleCenters=markers.filter(m=>{
      for(let y=Math.floor(m.y)-1;y<=Math.ceil(m.y)+1;y++)for(let x=Math.floor(m.x)-1;x<=Math.ceil(m.x)+1;x++)if(pixels[(y*720+x)*4+3]>0)return true;
      return false;
    }).length;
    __toy.highlightValve(null);
    return {count:markers.length,shafts,minAlpha,visibleCenters,speed:model.stats().speedMetersPerSecond};
  })()`);
  console.log(prefix+' reversal paint',JSON.stringify(sample));
  check(prefix+' every arrow stays visible as airflow reaches zero',Math.abs(sample.speed)<.002 && sample.shafts===sample.count && sample.visibleCenters===sample.count && sample.minAlpha>=.69);
  await record(prefix+'-turning');
  const continuity=await ev(`(()=>{
    const model=__toy.breathingCave(),before=model.markers();let steps=0;
    while(model.stats().speedMetersPerSecond<.001 && steps++<12000)model.tick(1/12000);
    const after=model.markers();__toy.highlightValve(null);
    return {same:after.every((m,i)=>m.id===before[i].id),maxDistance:Math.max(...after.map((m,i)=>Math.hypot(m.x-before[i].x,m.y-before[i].y))),speed:model.stats().speedMetersPerSecond};
  })()`);
  check(prefix+' arrows reverse at their existing positions',continuity.same && continuity.maxDistance<.02 && continuity.speed>0);
  await record(prefix+'-reversed');await ev('__toy.pause(false)');
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
  check(name+' has semantic pressure, status and arrow labels',ui.meterRole==='meter' && ui.meterText===ui.pressure && ui.role==='status' && ui.tracer.includes('Arrows show moving air'));
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
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await call('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=breathing-cave'});
    await until('!!window.__toy && !!__toy.breathingCave() && __toy.machineState()?.ready && !__toy.stats().loading');
    const prefix=viewport.mobile?'mobile':'desktop';
    check('scene reports live pressure instead of waiting',await ev('document.getElementById("toy-status").textContent!=="Waiting for pressure"'));
    await until('__toy.breathingCave().stats().speedMetersPerSecond < -5');const inhaled=await record(prefix+'-in');const inUI=await indicatorCheck(prefix+'-in');check('arrow follows air entering the cave',inUI.flow==='in');if(process.env.PREVIEW_ONLY==='1')continue;
    await reversalCheck(prefix);
    await until('__toy.breathingCave().stats().speedMetersPerSecond > 5');await record(prefix+'-out');
    await until('__toy.breathingCave().stats().seconds>16');const exhaled=await record(prefix+'-exhaling');const outUI=await indicatorCheck(prefix+'-out');check('arrow follows actual outgoing flow during pressure reversal',outUI.flow==='out' && outUI.context.includes('reverse'));
    check('arrows travel with the computed air through the actual entrance',exhaled.markerDistance>inhaled.markerDistance && exhaled.markerInwardCrossings>0 && exhaled.markerOutwardCrossings>0);
    await ev('__toy.pause(true)');const clock=await ev('__toy.breathingCave().stats().seconds');await delay(400);
    check('pause freezes gas and arrows',await ev('__toy.breathingCave().stats().seconds')===clock);check('pause is explicit in the indicator',(await indicatorCheck(prefix+'-paused')).paused);
    await clickMouth(viewport.mobile);
    const closed=await ev('__toy.breathingCave().stats()');check('actual entrance is closed',!closed.mouthOpen);
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>'+String(clock+2));
    const held=await record(prefix+'-closed');check('closed mouth is explicit in the indicator',(await indicatorCheck(prefix+'-closed')).flow==='closed');
    check('closed mouth retains the finite gas and stops every arrow',held.massKg===closed.massKg && held.markerDistance===closed.markerDistance && held.flowM3PerSecond===0);
    await clickMouth(viewport.mobile);await until('Math.abs(__toy.breathingCave().stats().speedMetersPerSecond)>5');await record(prefix+'-reopened');
    await ev('__toy.pause(true)');
    await ev('document.getElementById("toy-native-setup").value="steady";document.getElementById("toy-native-setup").dispatchEvent(new Event("change",{bubbles:true}))');await until('__toy.machineState()?.ready && !__toy.stats().loading');
    await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>2');const steady=await record(prefix+'-steady');const steadyUI=await indicatorCheck(prefix+'-steady');check('steady pressure reads as balanced and still',steadyUI.pressure==='Pressures are balanced' && steadyUI.flow==='still');
    check('steady pressure produces no airflow',steady.flowM3PerSecond===0 && steady.massKg===steady.initialMassKg && steady.markerDistance===0 && steady.movingMarkers===0);
    check('steady comparison is available in Instruments',await ev('Array.from(document.querySelectorAll("#toy-native-setup option")).some(o=>o.value==="steady")'));
    if(viewport.mobile){await call('Emulation.setDeviceMetricsOverride',{...viewport,height:350,deviceScaleFactor:1});await delay(400);await indicatorCheck('mobile-short');await record('mobile-short');}
    await ev('document.getElementById("toy-instruments-open").click()');await delay(200);await record(prefix+'-instruments');
  }
  await ev('__toy.pause(true);__toy.machine("glugging-bottle",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  await ev('__toy.machine("breathing-cave",{})');await until('__toy.machineState()?.ready && !__toy.stats().loading');
  check('a pressure draft cannot overwrite the working cave module',await ev('!!__toy.breathingCave() && !!__toy.machineState().definition.cave'));
  await call('Emulation.setDeviceMetricsOverride',{width:600,height:800,mobile:false,deviceScaleFactor:1});await delay(400);await indicatorCheck('narrow-desktop');await record('narrow-desktop');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await ev('__toy.pause(false)');await until('__toy.breathingCave().stats().seconds>2');await record('reduced-motion');
  check('reduced motion uses static direction arrows without freezing the air model',await ev('__toy.breathingCave().stats().visualMotion==="direction-only" && __toy.breathingCave().stats().admittedKg>0'));
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
