// Snow overhang and post-jet wave regression with independent clearance measurements.
// Run: node tools/sluice-snow-wave.mjs [--cpu] [--report-only] [--jet] [--snow].
// Use --only-snow or --only-jets for a targeted repeated comparison.
// Optional SLUICE_TEST_BUNDLE and SLUICE_TEST_GPU compare prior solver builds.
// Artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8427), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-wave-qa';
assert.ok(!path.resolve(out).startsWith(root + path.sep), 'Screenshots stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file === path.join(root, 'js/sluice.js') && process.env.SLUICE_TEST_BUNDLE
      ? process.env.SLUICE_TEST_BUNDLE : file === path.join(root, 'js/liquid-wgpu.js') && process.env.SLUICE_TEST_GPU
      ? process.env.SLUICE_TEST_GPU : file);
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
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling',
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
    const diagnostic=await ev(`({body:document.body.innerText.slice(-2500),hook:typeof __snowTest,
      phase:typeof __snowTest==='function'?__snowTest("introPhase"):null})`);
    fs.writeFileSync(path.join(out,'loading.json'),JSON.stringify(diagnostic,null,2));
    await screenshot('loading');
    throw new Error('loading did not complete: '+JSON.stringify(diagnostic));
  }

  const cpu = process.argv.includes('--cpu'), reportOnly = process.argv.includes('--report-only');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35${cpu?'&cpuwater=1':''}`});
  await ready();
  check('requested particle solver is active',await game(cpu
    ? '(!liquidWGPU || !liquidWGPU.simActive)' : '!!(liquidWGPU && liquidWGPU.simActive)'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  const summaries = [];
  const trials = process.argv.includes('--only-snow') || process.argv.includes('--only-jets') ? [] : ['overhang'];
  if (process.argv.includes('--jet') || process.argv.includes('--only-jets')) trials.push('jet');
  if (process.argv.includes('--snow') || process.argv.includes('--only-snow') || process.argv.includes('--only-jets')) trials.push('snow-jet');
  for (const trial of trials) {
    const liveSnow = trial === 'snow-jet', jet = trial !== 'overhang';
    await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
      while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
      SNOW_RATE=${liveSnow?345:0};weatherForce=4;WEATHER_MOODS[4].pcp=${liveSnow?0.8:0};weatherSetMood(4,true);tutorialDone=true;
      window.waveRandom=window.waveRandom||Math.random;window.waveSeed=280110;
      Math.random=function(){waveSeed=(Math.imul(waveSeed,1664525)+1013904223)>>>0;return waveSeed/4294967296;};
      windSetTarget('still',1,0,100,0,0);surfaceWind.current=0;surfaceWind.flutter=0;
      window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
      zoomMode='out';resize();player.x=cx+300;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;rocketIntensity=0;
      window.waveCamera=window.waveCamera||updateCamera;
      updateCamera=function(){cam.x=cx-screenW*.5;cam.y=sy-screenH*.5;};cam.snap=true;updateCamera();
      for(var x=cx-${trial==='overhang'?160:liveSnow?240:300};x<cx+${trial==='overhang'?180:liveSnow?240:300};x+=1.4){
        var base=${trial==='overhang'?'x<cx-95?1.3:29.3':'1.3'};
        var top=${trial==='overhang'?(cpu?'61':'65'):liveSnow?'112*Math.max(0,1-Math.abs(x-cx)/240)':cpu?'15':'44'};
        for(var h=base;h<top;h+=1.4){addLiquidParticle(5,x,sy-h,0,0,3);snow.active++;}
      }
      snow.mass=snow.emitted=snow.active;
      window.waveInitial=snow.active;window.waveStarted=snow.time;window.waveFrames=[];window.waveReleased=0;window.waveFreshScans=0;window.waveScans=0;
      window.waveScan=window.waveScan||snowScan;
      snowScan=function(dt,maintenance){var before=snow.grains.length,gen=snow.readbackGen;waveScans++;waveScan(dt,maintenance);
        waveReleased+=Math.max(0,snow.grains.length-before);if(snow.readbackGen!==gen)waveFreshScans++;};
      window.waveGeneration=liquidWGPU&&liquidWGPU.simActive?liquidWGPU.readbackApplyGen:-1;
      window.waveFirstSolve=-1;window.waveLastGen=waveGeneration;window.waveLastTime=snow.time;
      window.waveSample=function(){
        var wall=snow.time-waveStarted;
        if(${jet}&&wall>=2&&wall<${liveSnow?6.8:4.8}){keys.ArrowUp=true;keys.ArrowRight=true;player.x=cx-240+(wall-2)*${liveSnow?105:190};
          player.y=sy-PLAYER_H-${liveSnow?130:45};player.vx=${liveSnow?105:190};player.vy=0;player.onGround=false;}
        else{keys.ArrowUp=keys.ArrowRight=false;player.x=cx+300;player.y=sy-PLAYER_H;player.vx=player.vy=0;}
        liquidToolSync();
        var gpu=liquidWGPU&&liquidWGPU.simActive,gen=gpu?liquidWGPU.readbackApplyGen:-1;
        if(waveFirstSolve<0&&(!gpu||gen!==waveGeneration))waveFirstSolve=snow.time;
        var dense={n:0,high:0,slow:0,sumVY:0,sumVY2:0,sumVX:0},powder={n:0,high:0,slow:0,sumVY:0,sumVY2:0,sumVX:0},skyCount=0;
        var nose={n:0,sumH:0,sumVY:0,minH:1e9,maxH:0},bins=new Map(),newReadback=gen!==waveLastGen;
        var packedLoftCandidates=0,packedLoftDensity=[],raisedDensity=[];
        function point(group,x,y,vx,vy){
          var h=sy-y;group.n++;group.sumVX+=vx;group.sumVY+=vy;group.sumVY2+=vy*vy;
          if(h>10){group.high++;if(Math.abs(vy)<8)group.slow++;}
          if(x>cx+20&&x<cx+175){nose.n++;nose.sumH+=h;nose.sumVY+=vy;nose.minH=Math.min(nose.minH,h);nose.maxH=Math.max(nose.maxH,h);}
          var k=Math.floor((x-cx)/5),b=bins.get(k);
          if(!b){b={n:0,minH:h,maxH:h,slow:0};bins.set(k,b);}b.n++;b.minH=Math.min(b.minH,h);b.maxH=Math.max(b.maxH,h);
          if(Math.abs(vy)<8)b.slow++;
        }
        for(var i=0;i<liquidCount;i++)if(liquidType[i]===5){
          point(dense,liquidX[i],liquidY[i],liquidVX[i],liquidVY[i]);
          if(sy-liquidY[i]>10)raisedDensity.push(liquidDensity[i]);
          if(liquidVY[i]<-12&&liquidDensity[i]>=LIQUID_SNOW_DENSITY*1.2){var a=snowAirAt(liquidX[i],liquidY[i]);
            if(Math.abs(a[0])+Math.abs(a[1])+a[2]>40){packedLoftCandidates++;packedLoftDensity.push(liquidDensity[i]);}}
        }
        for(var p of snow.grains){if(p.physical)point(powder,p.x,p.y,p.vx,p.vy);else skyCount++;}
        var archWidth=0,archGrains=0,slowArchGrains=0,noseClearance=[];
        for(var entry of bins){var k=entry[0],b=entry[1];
          // Geometric ground clearance deliberately does not call snowSupported:
          // a horizontal chain is precisely the support rule under test.
          if(b.n>=4&&b.minH>6&&b.maxH>12){archWidth+=5;archGrains+=b.n;slowArchGrains+=b.slow;}
          if(k>=4&&k<35&&b.n>=4)noseClearance.push(b.minH);
        }
        function finish(group){group.meanVX=group.sumVX/Math.max(1,group.n);group.meanVY=group.sumVY/Math.max(1,group.n);
          group.stdVY=Math.sqrt(Math.max(0,group.sumVY2/Math.max(1,group.n)-group.meanVY*group.meanVY));return group;}
        nose.meanH=nose.sumH/Math.max(1,nose.n);nose.meanVY=nose.sumVY/Math.max(1,nose.n);
        nose.meanClearance=noseClearance.reduce(function(a,b){return a+b},0)/Math.max(1,noseClearance.length);
        raisedDensity.sort(function(a,b){return a-b});packedLoftDensity.sort(function(a,b){return a-b});
        waveFrames.push({wall:wall,t:waveFirstSolve<0?-1:snow.time-waveFirstSolve,simDt:snow.time-waveLastTime,
          dense:finish(dense),powder:finish(powder),nose:nose,archWidth:archWidth,archGrains:archGrains,slowArchGrains:slowArchGrains,
          released:waveReleased,readbackGen:gen,readbackAge:gpu?liquidWGPU.getReadbackAge():0,newReadback:newReadback,
          scans:waveScans,freshScans:waveFreshScans,skyCount:skyCount,mutationSeq:liquidMutationSeq,
          packedLoftCandidates:packedLoftCandidates,packedLoftDensity95:packedLoftDensity[Math.floor(packedLoftDensity.length*.95)]||0,
          raisedDensity50:raisedDensity[Math.floor(raisedDensity.length*.5)]||0,raisedDensity95:raisedDensity[Math.floor(raisedDensity.length*.95)]||0,
          pendingReadback:gpu?liquidWGPU.readbackPending:false,readbackSeq:gpu?liquidWGPU.readbackSeq:0,
          readbackCount:gpu?liquidWGPU.readbackCount:0,liquidCount:liquidCount,
          snapshotMismatch:!!(gpu&&liquidWGPU.readbackPending&&(liquidWGPU.readbackSeq!==liquidMutationSeq||liquidWGPU.readbackCount!==liquidCount)),
          airPeak:snowAir.peak,airActive:snowAir.active,frameDt:lastFrameDt,parked:snow.parked.length/4,
          mass:__particleSnow.stats().mass+rain.waterCount+rain.parked.length/2+rain.absorbed,
          expectedMass:snow.emitted-snow.recycled-snow.collected+rain.emitted-rain.recycled});
        waveReleased=waveScans=waveFreshScans=0;waveLastGen=gen;waveLastTime=snow.time;
        window.waveRaf=requestAnimationFrame(waveSample);
      };window.waveRaf=requestAnimationFrame(waveSample);`);
    for (let i = 0; i < (jet ? 22 : 12); i++) {
      await sleep(1000); await screenshot(`${trial}-${i}`);
      if (await game(`waveFirstSolve>=0&&snow.time-waveFirstSolve>${liveSnow?16:jet?13:6}`)) break;
    }
    const frames = await game('cancelAnimationFrame(waveRaf);waveFrames');
    const initial = await game('waveInitial');
    const solved = frames.filter(f => f.t >= 0);
    const late = frames.filter(f => f.t > (liveSnow ? 9.8 : jet ? 7.8 : 1.2));
    const postJet = frames.filter(f => f.wall > (liveSnow ? 6.8 : 4.8) && f.wall < (liveSnow ? 9.8 : 7.8));
    const wake = solved.filter(f => f.airActive);
    let freshGap = 0, maxFreshGap = 0;
    for (const frame of wake) { freshGap = frame.freshScans ? 0 : freshGap + frame.simDt; maxFreshGap = Math.max(maxFreshGap, freshGap); }
    const first = solved[0], last = solved.at(-1);
    const quantile = (values, q) => values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))] || 0;
    const summary = { trial, solver: cpu ? 'cpu' : 'gpu', version: await game('GAME_VERSION'), initial,
      bundle:process.env.SLUICE_TEST_BUNDLE||path.join(root,'js/sluice.js'),engine:process.env.SLUICE_TEST_GPU||path.join(root,'js/liquid-wgpu.js'),
      firstSolvedAt: first?.wall, observedSeconds:last?.t, firstNoseHeight:first?.nose.meanH,lastNoseHeight:last?.nose.meanH,
      firstNoseClearance:first?.nose.meanClearance,lastNoseClearance:last?.nose.meanClearance,
      lateMaxArchWidth:Math.max(...late.map(f=>f.archWidth)),lateMaxSlowArch:Math.max(...late.map(f=>f.slowArchGrains)),
      lateCreepingFrameFraction:late.filter(f=>f.archWidth>30&&f.slowArchGrains>initial*.05).length/Math.max(1,late.length),
      peakPowder:Math.max(...solved.map(f=>f.powder.n)),maxReleaseBatch:Math.max(...solved.map(f=>f.released)),
      postJetMaxSlowArch:Math.max(0,...postJet.map(f=>f.slowArchGrains)),
      postJetSlowArchSeconds:postJet.reduce((a,f)=>a+f.slowArchGrains*f.simDt,0),
      freshScanFraction:solved.reduce((a,f)=>a+f.freshScans,0)/Math.max(1,solved.reduce((a,f)=>a+f.scans,0)),
      snapshotMismatchFrameFraction:solved.filter(f=>f.snapshotMismatch).length/Math.max(1,solved.length),
      peakSkyCount:Math.max(...solved.map(f=>f.skyCount)),finalMass:last?.mass,maxParked:Math.max(...frames.map(f=>f.parked)),
      peakPackedLoftCandidates:Math.max(...solved.map(f=>f.packedLoftCandidates)),
      maxPackedLoftDensity95:Math.max(...solved.map(f=>f.packedLoftDensity95)),
      readbackAgeP95:quantile(solved.map(f=>f.readbackAge),.95),maxReadbackAge:Math.max(...solved.map(f=>f.readbackAge)),
      wakeReadbackAgeP95:quantile(wake.map(f=>f.readbackAge),.95),wakeMaxFreshGap:maxFreshGap,
      wakeFreshScanFraction:wake.reduce((a,f)=>a+f.freshScans,0)/Math.max(1,wake.reduce((a,f)=>a+f.scans,0)),
      frameDtP95:quantile(solved.map(f=>f.frameDt),.95) };
    summaries.push(summary);console.log('WAVE',JSON.stringify(summary));
    fs.writeFileSync(path.join(out,`${trial}-frames.json`),JSON.stringify({summary,frames},null,2));
    check(`${trial} receives solved particle snapshots`,solved.length>30&&late.length>10);
    check(`${trial} conserves every emitted grain`,frames.every(f=>f.mass===f.expectedMass));
    // New atmospheric flakes may drift beyond the camera and enter normal
    // persistent storage. The fixed dry fixtures must remain fully visible.
    if (!liveSnow) check(`${trial} stays inside the active material region`,frames.every(f=>f.parked===0));
    if (!reportOnly) {
      check(`${trial} has no sustained slowly creeping arch`,summary.lateCreepingFrameFraction<0.1);
      if (trial === 'overhang') {
        check('unsupported overhang separates into individual powder',summary.peakPowder>initial*.25);
        check('the unsupported nose descends to the ground',summary.lastNoseClearance<3);
        check('the nose does not remain elevated as a coherent slab',summary.lastNoseHeight<30);
      } else check('the live jet entrains powder',summary.peakPowder>initial*.1);
    }
    await game('snowScan=waveScan;updateCamera=waveCamera;Math.random=waveRandom;keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false');
  }
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
  assert.equal(errors.length,0,'no runtime or shader errors');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
