// Near-ground powder and release-cadence regression, using a real running game.
// Run: node tools/sluice-snow-ground.mjs [--cpu] [--dense] [--report-only].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8197), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-ground-qa';
assert.ok(!path.resolve(out).startsWith(root + path.sep), 'Screenshots stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file === path.join(root, 'js/sluice.js') && process.env.SLUICE_TEST_BUNDLE
      ? process.env.SLUICE_TEST_BUNDLE : file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__snowTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png' };
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], {stdio:'ignore'});
let ws, seq=0; const pending=new Map(), errors=[];
function cleanup() { try {ws?.close();} catch {} chrome.kill(); server.close(); try {fs.rmSync(profile,{recursive:true,force:true});} catch {} }
process.on('SIGINT', () => {cleanup();process.exit(130);});
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__snowTest(${JSON.stringify(source)})`);
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for (let i=0;i<100;i++) {
    try { const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl; if(endpoint)break; } catch {}
    await sleep(100);
  }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  async function ready() {
    for(let i=0;i<400;i++){if(await ev(`typeof __snowTest==='function' && __snowTest("introPhase === 'done'")`))return;await sleep(100);}
    throw new Error('loading did not complete');
  }

  const cpu = process.argv.includes('--cpu'), dense = process.argv.includes('--dense'), reportOnly = process.argv.includes('--report-only');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35${cpu?'&cpuwater=1':''}`});
  await ready();
  check('requested particle solver is active',await game(cpu
    ? '(!liquidWGPU || !liquidWGPU.simActive)' : '!!(liquidWGPU && liquidWGPU.simActive)'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  const summaries=[];
  const quantile=(values,p)=>{const a=values.slice().sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]||0;};
  for (const moving of [false,true]) {
    const trial=moving?'pass':'hover';
    await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
      while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
      SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
      window.groundOriginalRandom=window.groundOriginalRandom||Math.random;window.groundSeed=16868;
      Math.random=function(){groundSeed=(Math.imul(groundSeed,1664525)+1013904223)>>>0;return groundSeed/4294967296;};
      windSetTarget('still',1,0,100,0,0);surfaceWind.flutter=0;
      window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
      zoomMode='in';resize();
      window.groundX=cx-PLAYER_W/2-${moving?280:0};
      player.x=groundX;player.y=sy-PLAYER_H-36;player.vx=player.vy=0;cam.snap=true;updateCamera();
      for(var x=cx-310;x<cx+310;x+=1.4)for(var h=1.3;h<${dense?32:12};h+=1.4){
        addLiquidParticle(5,x+(wHash(Math.floor(x*10),Math.floor(h*10),915)-.5)*.4,sy-h,0,0,3);snow.active++;}
      snow.mass=snow.emitted=snow.active;window.groundInitial=snow.active;
      window.groundGo=false;window.groundElapsed=0;window.groundLast=0;window.groundSnowTime=snow.time;
      window.groundSeen=new WeakSet();window.groundPrevious=new WeakMap();window.groundFrames=[];
      window.groundSample=function(t){
        var simDt=snow.time-groundSnowTime;groundSnowTime=snow.time;
        var dt=groundLast?(t-groundLast)/1000:0;groundLast=t;
        if(groundGo){
          groundElapsed+=simDt;
          var bins=[0,0,0,0], released=0,powder=0,solid=0,water=0,stationary=0,tracked=0,maxStep=0,maxResidual=0;
          for(var p of snow.grains)if(p.physical){
            powder++;var h=sy-p.y;
            if(h>=2&&h<60)bins[h<12?0:h<24?1:h<36?2:3]++;
            if(!groundSeen.has(p)){groundSeen.add(p);released++;}
            var prior=groundPrevious.get(p);
            if(prior&&simDt>0&&Math.hypot(p.vx,p.vy)>30){
              var step=Math.hypot(p.x-prior.x,p.y-prior.y);tracked++;
              if(step<1e-7)stationary++;
              maxStep=Math.max(maxStep,step);maxResidual=Math.max(maxResidual,Math.hypot(p.x-prior.x-p.vx*simDt,p.y-prior.y-p.vy*simDt));
            }
            groundPrevious.set(p,{x:p.x,y:p.y});
            if(liquidWorldSolidAt(p.x,p.y))solid++;
          }
          var stalled=0;
          for(var i=0;i<liquidCount;i++){
            if(liquidType[i]===0)water++;
            if(liquidType[i]===5&&liquidY[i]<sy-20&&Math.hypot(liquidVX[i],liquidVY[i])<6)stalled++;
          }
          groundFrames.push({t:groundElapsed,dt:dt,simDt:simDt,frameDt:lastFrameDt,airMs:snowAir.ms,bins:bins,
            released:released,powder:powder,stalled:stalled,solid:solid,tracked:tracked,stationary:stationary,maxStep:maxStep,maxResidual:maxResidual,
            bed:__particleSnow.stats().active,accounted:__particleSnow.stats().mass+water+rain.parked.length/2+rain.absorbed});
          if(groundElapsed>=${dense?8:3.4})groundGo=false;
        }
        player.x=groundX+(${moving?180:0})*groundElapsed;player.y=sy-PLAYER_H-36;
        player.vx=groundGo?${moving?180:0}:0;player.vy=0;player.dir=1;player.onGround=false;
        keys.ArrowUp=groundGo;keys.ArrowRight=groundGo&&${moving};keys.ArrowLeft=false;
        window.groundRaf=requestAnimationFrame(groundSample);
      };window.groundRaf=requestAnimationFrame(groundSample);`);
    await sleep(1500);
    await screenshot(`${trial}-before`);
    const initial=await game('groundInitial');
    await game('groundSeed=16868;groundGo=true');
    for(let i=0;i<7;i++){
      await sleep(450);await screenshot(`${trial}-${i}`);
      if(await game('!groundGo'))break;
    }
    for(let i=0;i<100&&await game('groundGo');i++)await sleep(100);
    const frames=await game('groundFrames');
    check(`${trial} completes bounded live trial`,await game('!groundGo')&&frames.length>30);
    const active=frames.filter(f=>f.t>.3&&f.t<2.5&&f.bed>100);
    const occupied=frames.filter(f=>f.t>.7&&f.powder>100);
    let gap=0,maxGap=0;
    for(const f of active){gap=f.released?0:gap+f.simDt;maxGap=Math.max(maxGap,gap);}
    const summary={trial,version:await game('GAME_VERSION'),solver:cpu?'cpu':'gpu',initial,frames:frames.length,
      meanBins:[0,1,2,3].map(i=>occupied.reduce((s,f)=>s+f.bins[i],0)/Math.max(1,occupied.length)),
      nearGroundPresence:occupied.filter(f=>f.bins[0]+f.bins[1]>=5).length/Math.max(1,occupied.length),
      releaseFrames:active.filter(f=>f.released>0).length,eligibleFrames:active.length,
      releaseFrameFraction:active.filter(f=>f.released>0).length/Math.max(1,active.length),
      maxReleaseGapMs:maxGap*1000,releaseBatchP95:quantile(active.filter(f=>f.released>0).map(f=>f.released),.95),
      frameMsP50:quantile(frames.map(f=>f.dt*1000),.5),frameMsP95:quantile(frames.map(f=>f.dt*1000),.95),
      simMsP50:quantile(frames.map(f=>f.simDt*1000),.5),simMsP95:quantile(frames.map(f=>f.simDt*1000),.95),
      airMsP95:quantile(frames.map(f=>f.airMs),.95),terrainPenetrations:frames.reduce((n,f)=>n+f.solid,0),
      stationaryMovingFlakes:frames.reduce((n,f)=>n+f.stationary,0),trackedFlakeFrames:frames.reduce((n,f)=>n+f.tracked,0),
      maxStep:Math.max(...frames.map(f=>f.maxStep)),maxIntegrationResidual:Math.max(...frames.map(f=>f.maxResidual))};
    // Normalize bin widths. A thin 2-12px strip cannot be satisfied by
    // thousands of flakes riding together one tile above the surface.
    summary.floorToShelfDensity=(summary.meanBins[0]/10)/Math.max(1,summary.meanBins[2]/12);
    summaries.push(summary);
    fs.writeFileSync(path.join(out,`${trial}-frames.json`),JSON.stringify({summary,frames},null,2));
    console.log('GROUND',JSON.stringify(summary));
    check(`${trial} conserves every snow and meltwater particle`,frames.every(f=>f.accounted===initial));
    check(`${trial} loose flakes never enter solid terrain`,summary.terrainPenetrations===0);
    check(`${trial} moving flakes advance every simulation frame`,summary.stationaryMovingFlakes===0);
    if(!reportOnly){
      check(`${trial} keeps powder close to the ground`,summary.nearGroundPresence>.8&&summary.floorToShelfDensity>.1);
      check(`${trial} releases powder on most active frames`,summary.releaseFrameFraction>.55&&summary.maxReleaseGapMs<100);
      if(dense)check(`${trial} leaves no sustained floating sheet after the dense burst`,
        frames.filter(f=>f.t>5).every(f=>f.stalled<initial*.01));
    }
    await game('cancelAnimationFrame(groundRaf);keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;Math.random=groundOriginalRandom');
  }
  // A still patch outside the finite air field must not inherit the fact
  // that a jet is active elsewhere. Mild solver bounce is not an updraft.
  const distant=await game(`(function(){
    cancelAnimationFrame(gameRafId);
    var gpuActive=liquidWGPU&&liquidWGPU.simActive;
    if(liquidWGPU)liquidWGPU.simActive=false;
    try {
    keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;player.thrusting=false;rocketIntensity=0;
    while(liquidCount)removeLiquidParticle(liquidCount-1);rainReset(true,true);SNOW_RATE=0;
    player.x=cx-PLAYER_W/2;player.y=sy-PLAYER_H-36;player.vx=player.vy=0;
    cam.x=cx+200;cam.y=sy-200;
    snowAir.active=true;snowAir.life=3;snowAir.x=cx-384;snowAir.y=sy-180;
    for(var x of [cx+800,cx+808]){var i=addLiquidParticle(5,x,sy-12,0,-13,3);liquidDensity[i]=1;snow.active++;}
    snow.mass=snow.emitted=2;
    var minVY=-13,maxHeight=12;
    for(var i=0;i<8;i++){
      updateSnow(1/60);
      for(var p of snow.grains){minVY=Math.min(minVY,p.vy);maxHeight=Math.max(maxHeight,sy-p.y);}
    }
    return {powder:snow.grains.filter(function(p){return p.physical;}).length,
      remaining:__particleSnow.stats().mass,airSpeed:Math.hypot.apply(Math,snowAirAt(cx+800,sy-12)),minVY:minVY,maxHeight:maxHeight};
    } finally {if(liquidWGPU)liquidWGPU.simActive=gpuActive;}
  })()`);
  console.log('DISTANT STILL AIR',JSON.stringify(distant));
  check('distant probe conserves both grains',distant.remaining===2);
  if(!reportOnly)check('mild motion outside local airflow never earns a jet kick',
    distant.airSpeed===0&&distant.minVY>=-13&&distant.maxHeight<13);
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
  assert.equal(errors.length,0,'no runtime or GPU validation errors');
  console.log('PASS near-ground powder regression; frames and screenshots '+out);
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
