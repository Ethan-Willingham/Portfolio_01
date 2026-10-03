// Real save/load and bath-exit residency checks in an owned Chrome for Testing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port=Number(process.env.PORT || 8854),debugPort=port+1000;
const mobile=process.argv.includes('--mobile');
const travel=process.argv.includes('--travel');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-arrival-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws,id=0;
const pending=new Map(),errors=[];
const probe=`
window.__arrivalRun=function(code){return eval(code);};
window.__arrivalReveals=[];window.__arrivalLate=[];window.__arrivalBirths=[];window.__arrivalLoads=[];
var arrivalBegin=SluiceLoading.begin;
SluiceLoading.begin=function(label){window.__arrivalLoads.push(label);return arrivalBegin.apply(this,arguments);};
function arrivalSnapshot(){
 var visible=function(x,y){return x>=cam.x&&x<cam.x+screenW&&y>=cam.y&&y<cam.y+screenH;};
 var pending=[0,0,0],live=[0,0,0];
 Object.keys(mineralLiquidParked).forEach(function(k){var p=mineralLiquidParked[k];for(var i=0;i<p.length;i+=3)if(visible(p[i+1],p[i+2]))pending[0]++;});
 for(var i=0;i<rain.parked.length;i+=2)if(visible(rain.parked[i],rain.parked[i+1])&&!liquidWorldSolidAt(rain.parked[i],rain.parked[i+1]))pending[1]++;
 for(var i=0;i<snow.parked.length;i+=4)if(visible(snow.parked[i],snow.parked[i+1])&&!liquidWorldSolidAt(snow.parked[i],snow.parked[i+1]))pending[2]++;
 for(var i=0;i<liquidCount;i++){if(liquidOrigin[i]===0)live[0]++;else if(liquidType[i]===5)live[2]++;else if(liquidOrigin[i]===RAIN_ORIGIN)live[1]++;}
 return {pending:pending,live:live,phase:introPhase,cam:[cam.x,cam.y],gpu:!!(liquidWGPU&&liquidWGPU.simActive),snowMass:__particleSnow.stats().mass,clock:timeOfDay,front:rain.climate.elapsed};
}
var arrivalFinish=SluiceLoading.finish;
SluiceLoading.finish=function(){window.__arrivalReveals.push(arrivalSnapshot());return arrivalFinish.apply(this,arguments);};
var arrivalAdding=addLiquidParticle,arrivalRestoring=false;
addLiquidParticle=function(t,x,y){if(arrivalRestoring&&introPhase==='done'&&x>=cam.x&&x<cam.x+screenW&&y>=cam.y&&y<cam.y+screenH)window.__arrivalLate.push([t,x,y]);return arrivalAdding.apply(this,arguments);};
[mineralLiquidTick,rainScan,snowScan].forEach(function(fn,i){var wrap=function(){arrivalRestoring=true;try{return fn.apply(this,arguments);}finally{arrivalRestoring=false;}};if(i===0)mineralLiquidTick=wrap;else if(i===1)rainScan=wrap;else snowScan=wrap;});
[rainSpawn,snowSpawn].forEach(function(fn,i){var wrap=function(x,y){if(introPhase==='done'&&x>=cam.x&&x<cam.x+screenW&&y>=cam.y&&y<cam.y+screenH)window.__arrivalBirths.push([i,x,y]);return fn.apply(this,arguments);};if(i===0)rainSpawn=wrap;else snowSpawn=wrap;});
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.m4a':'audio/mp4'};
const server=http.createServer((req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 let data=fs.readFileSync(pathname==='/js/sluice.js'&&process.env.SLUICE_BUNDLE?process.env.SLUICE_BUNDLE:pathname==='/grand-motherload.html'&&process.env.SLUICE_PAGE?process.env.SLUICE_PAGE:file);
 if(pathname==='/js/sluice.js'){const s=data.toString(),end=s.lastIndexOf('})();');data=Buffer.from(s.slice(0,end)+probe+s.slice(end));}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 }catch(e){res.writeHead(500).end(String(e));}
});
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out'));},30000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function game(code){return ev('__arrivalRun('+JSON.stringify(code)+')');}
async function until(expression,label,timeout=90000){const start=Date.now();while(Date.now()-start<timeout){if(await ev(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify(await ev('window.SluiceLoading&&SluiceLoading.report()')));}
async function ready(){await until("window.__arrivalRun&&__arrivalRun(\"introPhase==='done'\")&&!SluiceLoading.active()",'scene did not reveal');assert.equal(await ev('window.__bootErr||null'),null);}
function check(name,value){assert.ok(value,name);console.log('PASS '+name);}
async function streamingTravel(){
 const restored=await game(`(function(){
  cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;
  for(var i=liquidCount-1;i>=0;i--)removeLiquidParticle(i);
  mineralLiquidReset();rainReset(true,true);snow.parked=[];
  __arrivalLoads=[];__arrivalReveals=[];keys.ArrowRight=true;dpad.right=true;
  var x=cam.x+screenW/2,y=cam.y+screenH/3,start={x:player.x,y:player.y,clock:timeOfDay};
  for(var n=0;n<8000;n++)mineralLiquidPark(2,x+n%100*1.25,y+Math.floor(n/100)*1.25);
  for(var n=0;n<1500;n++)rain.parked.push(x+n%100*1.25,y+Math.floor(n/100)*1.25);
  for(var n=0;n<1500;n++)snowStore(x+n%100*1.4,y+Math.floor(n/100)*1.4,17,-23);
  for(var pass=0;pass<3;pass++){
   mineralLiquidClock=0;mineralLiquidTick(0);rainScan(0);snowScan(0,0,true,true);
  }
  var typed=0,water=0,powder=0,velocity=true;
  for(var i=0;i<liquidCount;i++){
   if(liquidType[i]===2)typed++;
   else if(liquidType[i]===5){powder++;velocity=velocity&&liquidVX[i]===17&&liquidVY[i]===-23;}
   else if(liquidOrigin[i]===RAIN_ORIGIN)water++;
  }
  return {phase:introPhase,loads:__arrivalLoads.slice(),reveals:__arrivalReveals.length,
   held:keys.ArrowRight&&dpad.right,stationary:player.x===start.x&&player.y===start.y&&timeOfDay===start.clock,
   counts:[typed,water,powder],velocity:velocity,pending:[Object.keys(mineralLiquidParked).length,rain.parked.length,snow.parked.length]};
 })()`);
 console.log('TRAVEL_RESTORE',JSON.stringify(restored));
 check('ordinary restoration leaves the loading screen closed',restored.phase==='done'&&restored.loads.length===0&&restored.reveals===0);
 check('ordinary restoration preserves held keyboard and touch controls',restored.held);
 check('bounded batches conserve all typed water and snow',JSON.stringify(restored.counts)==='[8000,1500,1500]'&&restored.pending.every(n=>n===0));
 check('restored snow retains its velocity',restored.velocity);
 check('residency does not move the rig or world clock',restored.stationary);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?snow=1&nosave=1&nopause=1'});await ready();
 await game(`__arrivalLoads=[];__arrivalReveals=[];player.fuel=1e6;player.hull=1e6;if(gamePaused)resumeGame();`);
 const startX=await game('player.x');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await sleep(5000);
 const outbound=await game('({x:player.x,held:keys.ArrowRight,phase:introPhase})');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await sleep(5000);
 const returned=await game('({x:player.x,held:keys.ArrowLeft,phase:introPhase,loads:__arrivalLoads.slice()})');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
 console.log('SURFACE_DRIVE',JSON.stringify({startX,outbound,returned}));
 check('surface drive and reversal move the rig',outbound.x>startX+100&&returned.x<outbound.x-100);
 check('surface drive and reversal preserve held controls',outbound.held&&returned.held);
 check('surface travel never starts scene loading',outbound.phase==='done'&&returned.phase==='done'&&returned.loads.length===0);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?rain=0&snow=0&nosave=1&nopause=1'});await ready();
 const pond=await game(`(function(){
  cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;
  var pond=surfacePonds.filter(function(p){return !p.rainFed;})[0];
  if(!pond)return null;
  cam.x=(pond.cL+pond.cR+1)*TILE/2-screenW/2;cam.y=SKY_ROWS*TILE-screenH/2;
  drainSurfacePond(pond);__arrivalLoads=[];keys.ArrowRight=true;dpad.right=true;
  var before=liquidCount,need=surfacePondNeed(pond),filled=fillSurfacePond(pond);
  return {filled:filled,need:need,added:liquidCount-before,held:keys.ArrowRight&&dpad.right,phase:introPhase,loads:__arrivalLoads.slice()};
 })()`);
 console.log('POND_RESTORE',JSON.stringify(pond));
 check('legacy ponds restore completely without loading or clearing input',pond&&pond.filled&&pond.need===pond.added&&pond.need>0&&pond.held&&pond.phase==='done'&&pond.loads.length===0);
}
try{
 await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});
 chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--mute-audio','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'});
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target);
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*google-analytics.com*','*googletagmanager.com*']});
 await send('Emulation.setDeviceMetricsOverride',{width:mobile?932:1440,height:mobile?430:900,deviceScaleFactor:1,mobile});
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?snow=1'});await ready();
 check('fresh snow world is populated before reveal',await ev('__arrivalReveals[0].pending.every(n=>n===0)&&__arrivalReveals[0].live[2]>600'));
 if(travel){await streamingTravel();}else{
 // Build an actual envelope with multiple restoration batches in each store.
 const expected=await game(`(function(){
 cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;
 for(var i=liquidCount-1;i>=0;i--)removeLiquidParticle(i);
 mineralLiquidReset();rainReset(true,true);snow.parked=[];snow.grains=[];
 rain.climate.phase=3;rain.climate.elapsed=10;rain.climate.duration=300;rain.climate.kind='snow';
 weather.cov=.8;weather.pcp=0;weather.tcov=.8;weather.tpcp=0;
 updateCamera();
 var lake=surfacePonds.filter(function(p){return p.rainFed;}).sort(function(a,b){return Math.abs(a.cL*TILE-player.x)-Math.abs(b.cL*TILE-player.x);})[0];
 player.x=(lake.cL+lake.cR+1)*TILE/2;player.y=SKY_ROWS*TILE-PLAYER_H-8;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();
 var x0=lake.cL*TILE+3,y0=(SKY_ROWS+lake.d)*TILE-3,columns=Math.floor(((lake.cR-lake.cL+1)*TILE-6)/1.25);
 for(var n=0;n<6000;n++)rain.parked.push(x0+n%columns*1.25,y0-Math.floor(n/columns)*1.25);
 for(var n=0;n<8000;n++)mineralLiquidPark(2,x0+n%columns*1.25,y0-Math.floor(n/columns)*1.25);
 for(var n=0;n<9000;n++)snowStore(cam.x+10+n%140*1.4,SKY_ROWS*TILE-2-Math.floor(n/140)*1.4,0,0);
 snow.mass=9000;
 var saved=saveBuild();localStorage.setItem(SAVE_KEY_A,JSON.stringify(saved));localStorage.removeItem(SAVE_KEY_B);
 return {clock:timeOfDay,front:rain.climate.elapsed};
 })()`);
 await send('Page.reload');await ready();
 let reveal=await ev('__arrivalReveals.at(-1)');console.log('SAVED_REVEAL',JSON.stringify(reveal));
 check('saved pool and pile batches finish before reveal',reveal.pending.every(n=>n===0)&&reveal.live[0]>=8000&&reveal.live[1]>=6000&&reveal.live[2]>=9000);
 check('loading preserves world and weather clocks',reveal.clock===expected.clock&&reveal.front===expected.front);
 check('GPU solver draws restored material',reveal.gpu);
 await sleep(650);check('saved material does not trickle into the visible resumed scene',await ev('__arrivalLate.length===0'));
 await game(`var curve=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]);for(var n=0;n<4200;n++)mineralLiquidPark(2,(curve.x0+curve.x1)/2-62+n%100*1.25,curve.y0+curve.D-8-Math.floor(n/100)*1.25);bathEnter();`);await until('__arrivalRun("bathMode&&!bathFading&&introPhase===\'done\'")','bath did not open');
 check('bath entry restores the saved tub before reveal',await ev('__arrivalReveals.at(-1).pending.every(n=>n===0)&&__arrivalReveals.at(-1).live[0]>=4200'));
 // Exercise every parked store on exit, preserving its positions and mass.
 const exitMass=await game(`for(var i=liquidCount-1;i>=0;i--){if(liquidType[i]===5)snowStore(liquidX[i],liquidY[i],liquidVX[i],liquidVY[i]);else if(liquidOrigin[i]===RAIN_ORIGIN)rain.parked.push(liquidX[i],liquidY[i]);else mineralLiquidPark(liquidType[i],liquidX[i],liquidY[i]);removeLiquidParticle(i);}__arrivalLate=[];var mass=__particleSnow.stats().mass;bathExit();mass;`);
 await until('__arrivalRun("!bathMode")','bath did not exit');await ready();
 reveal=await ev('__arrivalReveals.at(-1)');console.log('EXIT_REVEAL',JSON.stringify(reveal));
 check('bath exit waits for all visible parked materials',reveal.pending.every(n=>n===0)&&reveal.snowMass===exitMass&&reveal.live[2]>600);
 await sleep(650);check('bath exit has no visible restoration batches',await ev('__arrivalLate.length===0'));
 // A visible weather ramp still generates outside the view.
 await game(`__arrivalBirths=[];rain.climate.phase=2;rain.climate.kind='snow';rain.climate.elapsed=40;rain.climate.duration=300;weather.pcp=.85;snow.field.strength=.85;`);await sleep(500);
 check('snow ramp creates no flakes in front of the user',await ev('__arrivalBirths.length===0'));
 await game(`rain.climate.kind='rain';weather.pcp=.85;rain.field.strength=.85;`);await sleep(500);
 check('rain ramp creates no drops in front of the user',await ev('__arrivalBirths.length===0'));
 const liveRestore=await game(`__arrivalReveals=[];__arrivalLoads=[];keys.ArrowRight=true;var before=liquidCount;mineralLiquidPark(2,cam.x+screenW/2,cam.y+screenH/2);mineralLiquidClock=0;mineralLiquidTick(0);({added:liquidCount===before+1,held:keys.ArrowRight,phase:introPhase});`);
 check('ordinary visible residency continues without loading or clearing input',liveRestore.added&&liveRestore.held&&liveRestore.phase==='done'&&await ev('__arrivalReveals.length===0&&__arrivalLoads.length===0'));
 await game(`__arrivalReveals=[];respawnAtTown(0);`);await ready();
 check('town recovery also prepares parked material',await ev('__arrivalReveals.length===1&&__arrivalReveals[0].pending.every(n=>n===0)'));
 await game(`__arrivalReveals=[];player.y=(SKY_ROWS+80)*TILE;teleporters=1;activateTeleporter();`);await ready();
 check('teleport destination is prepared before reveal',await ev('__arrivalReveals.length===1&&__arrivalReveals[0].pending.every(n=>n===0)'));
 }
 check('browser has no runtime errors',errors.length===0);
}finally{
 for(const p of pending.values())p.reject(Error('test cleanup'));pending.clear();
 if(ws)ws.close();if(chrome){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);}
 await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});
}
