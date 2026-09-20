// Browser regression: real flight update, then live CPU/WebGPU water contact.
// Run: node tools/sluice-rig-water-smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'sluice-rig-water-'));
const server = createServer((req,res) => {
  try {
    const file = path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    let data=fs.readFileSync(file===path.join(root,'js/sluice.js') && process.env.SLUICE_SOURCE ? process.env.SLUICE_SOURCE : file);
    if(file===path.join(root,'js/sluice.js')){
      const source=data.toString(),end=source.lastIndexOf('})();');
      data=Buffer.from(source.slice(0,end)+'window.__rigWaterTest = function(source) { return eval(source); };\n'+source.slice(end));
    }
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn(process.env.CHROME || path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),[
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{stdio:'ignore'});
let ws,seq=0,launchError;const pending=new Map(),errors=[];
chrome.on('error',error=>{launchError=error;});
function send(method,params={}){return new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},45000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
const game=source=>ev(`__rigWaterTest(${JSON.stringify(source)})`);
try{
  const portFile=path.join(profile,'DevToolsActivePort'),deadline=Date.now()+20000;
  while(!fs.existsSync(portFile)){
    if(launchError)throw launchError;
    if(chrome.exitCode!==null||Date.now()>deadline)throw Error('Chrome for Testing failed to launch');await pause(50);
  }
  const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));
  });
  await send('Runtime.enable');await send('Page.enable');
  for(const cpu of [false,true]){
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/grand-motherload.html?dev=1&nosave=1&nopause=1&jello=0&bath=0${cpu?'&cpuwater=1':''}`});
    const readyUntil=Date.now()+60000;
    while(!await ev(`typeof __rigWaterTest === 'function' && __rigWaterTest("introPhase === 'done'")`)){
      if(Date.now()>readyUntil)throw Error('Game loading timed out');await pause(100);
    }
    const boot=await game(`cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;devMode=false;tutorialDone=true;
      skySlimes=[];jelloBodies=[];surfacePonds=[];keys={};
      JSON.stringify({version:GAME_VERSION,gpu:!!(liquidWGPU&&liquidWGPU.simActive)})`);
    assert.equal(JSON.parse(boot).gpu,!cpu,'requested liquid solver is active');
    console.log('BOOT',boot);
    // An actual chamber, with deep open space for the waterfall case.
    await game(`window.__rigScene=function(kind){
      var r=SKY_ROWS+12,c=90;
      for(var row=r-3;row<r+32;row++)for(var col=c-2;col<c+7;col++)
        world[row][col]=(col>=c&&col<c+4&&row<r+(kind==='lake'?28:30))?null:{type:'stone',hp:ORES.stone.hp};
      terrainChunkCache={};terrainChunkCount=0;
      liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;
      player.x=(c+2)*TILE-PLAYER_W/2;player.y=(r+1)*TILE;player.vx=0;player.vy=740;
      player.onGround=false;player.onJello=false;player.airTime=0;player.thrustSpool=0;player._thrustWas=false;
      player.drillGlideT=0;player.fuel=getMaxFuel();player.hull=getMaxHull();gameOver=false;drilling=null;keys={};
      if(kind!=='dry')for(var y=(r+4)*TILE+.625;y<(r+28)*TILE;y+=1.25)
        for(var x=c*TILE+.625;x<(c+4)*TILE;x+=1.25)
          addLiquidParticle('water',x,y,0,kind==='waterfall'?600:0);
      cam.snap=true;updateCamera();return player.y;
    };`);
    // Full update() ensures gravity, the water call, fall cap and movement
    // are composed correctly. Freeze the fluid fixture for comparable runs.
    const flight=await game(`(function(){var out={};
      for(var kind of ['dry','lake','waterfall']){
        var start=__rigScene(kind),entry=0,min=Infinity;
        for(var i=0;i<45;i++){update(1/60);if(player.waterFrac>.5){if(!entry)entry=player.vy;min=Math.min(min,player.vy);}}
        out[kind]={distance:player.y-start,speed:player.vy,entry:entry,min:min,wet:player.waterFrac};
      }return out;})()`);
    assert(flight.lake.entry>650,'lake entry carries momentum');
    assert(flight.lake.speed>430&&flight.lake.distance>400,'lake sink remains brisk in the full flight integrator');
    assert(flight.waterfall.distance>flight.dry.distance*.98,'waterfall descent matches free fall');
    console.log(cpu?'CPU FLIGHT':'GPU FLIGHT',JSON.stringify(flight));
    const escape=await game(`(function(){__rigScene('lake');player.y+=200;player.vy=430;
      var start=player.y;keys.ArrowUp=true;for(var i=0;i<150;i++)update(1/60);keys={};
      return {rise:start-player.y,speed:player.vy};})()`);
    assert(escape.rise>60&&escape.speed<-80,'the actual jet controls lift the rig back out');
    console.log('JET ESCAPE',JSON.stringify(escape));
    // Exercise the live solver and its real mirror, rather than only the
    // frozen fixtures. The rig must reach the deep part of a real water body.
    const start=await game(`__rigScene('lake')`);let peakWet=0,minWetSpeed=Infinity;
    // Settle the water on the chamber floor before dropping into it.
    for(let frame=0;frame<90;frame++){
      await game('updateLiquids(1/60)');await pause(8);
    }
    for(let frame=0;frame<70;frame++){
      const s=await game(`update(1/60);updateCamera();updateLiquids(1/60);
        if(${frame}%6===0)render();({y:player.y,vy:player.vy,wet:player.waterFrac,dead:gameOver,ground:player.onGround})`);
      peakWet=Math.max(peakWet,s.wet);if(s.wet>.5&&!s.ground)minWetSpeed=Math.min(minWetSpeed,s.vy);
      assert(!s.dead&&Number.isFinite(s.vy),'live water keeps the rig finite and alive');
      await pause(8);
    }
    const live=await game(`({distance:player.y-${start},speed:player.vy,wet:player.waterFrac,count:liquidCount})`);
    console.log(cpu?'CPU LIVE':'GPU LIVE',JSON.stringify({...live,peakWet,minWetSpeed}));
    assert(peakWet>.4,'live solver produces hull water contact');
    assert(live.distance>480&&minWetSpeed>300,'live water does not reinstate slow sinking');
    const streamStart=await game(`__rigScene('waterfall')`);let streamWet=0;
    for(let frame=0;frame<60;frame++){
      const wet=await game('update(1/60);updateCamera();updateLiquids(1/60);player.waterFrac');
      streamWet=Math.max(streamWet,wet);await pause(8);
    }
    const stream=await game(`({distance:player.y-${streamStart},speed:player.vy})`);
    assert(streamWet>.3&&stream.distance>710,'a live falling stream preserves near-free-fall descent');
    console.log('LIVE WATERFALL',JSON.stringify({...stream,peakWet:streamWet}));
    // Sampling budget with a busy liquid scene: include all 120k particles.
    const ms=await game(`(function(){var old=liquidCount;for(var i=old;i<LIQUID_MAX_PARTICLES;i++){
      liquidType[i]=0;liquidX[i]=0;liquidY[i]=0;}
      liquidCount=LIQUID_MAX_PARTICLES;var start=performance.now();
      for(var n=0;n<100;n++)playerWaterSample();var ms=(performance.now()-start)/100;
      liquidCount=old;return ms;})()`);
    assert(ms<5,'120k-particle sampler fits the frame budget');console.log('SAMPLE 120k',ms.toFixed(3)+'ms');
  }
  assert.equal(errors.length,0,'no runtime or GPU validation errors');
  console.log('PASS: CPU/WebGPU boot, full flight integration, live liquid contact and sampling budget.');
}finally{
  if(errors.length)console.error(errors.slice(0,5));
  for(const p of pending.values())clearTimeout(p.timer);
  ws?.close();server.close();
  if(chrome.pid&&chrome.exitCode===null&&chrome.signalCode===null){
    const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');
    await Promise.race([stopped,pause(3000)]);
    if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await stopped;}
  }
  fs.rmSync(profile,{recursive:true,force:true});
}
