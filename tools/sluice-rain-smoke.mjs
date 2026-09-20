// Particle rain integration, physics, persistence and bounded-load regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/sluice-rain-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8189), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-rain-');
const out = process.env.DUMP || '/tmp/sluice-rain-qa';
assert.ok(!path.resolve(out).startsWith(root + path.sep), 'Screenshots stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__rainTest = function(source) { return eval(source); };\n' + src.slice(i));
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
const game = source => ev(`__rainTest(${JSON.stringify(source)})`);
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
    for(let i=0;i<400;i++){if(await ev(`typeof __rainTest==='function' && __rainTest("introPhase === 'done'")`))return;await sleep(100);}
    throw new Error('loading did not complete');
  }
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});
  await ready();
  check('default world has no particle rain',await game('!worldRainEnabled && rain.drops.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game("PAUSE_DISABLED=false");
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-rain-on').click()");
  check('native setting persists without changing the current world',await game("SluiceOptions.particleRain && !worldRainEnabled && localStorage.getItem('sluice.opt.rain')==='1'"));
  await screenshot('options');
  await ev("document.getElementById('gm-opt-back').click();document.getElementById('gm-new-game-btn').click();document.getElementById('gm-restart-btn').click()");
  await sleep(300);await ready();
  check('New game latches the rain setting',await game('worldRainEnabled'));
  check('rain shader warmup succeeds',await ev('!!window.__shaderWarm && window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.rain>=0'));
  check('rain worlds start dry with three shallow stone-lined lakes',await game(`surfacePonds.length===3 && surfacePonds.every(function(p){return p.rainFed && p.d===2 && rainLakeLined(p) && p.rainCount>1000 && p.rainCount<surfacePondNeed(p)*0.2;}) && rain.drops.length===0 && rain.climate.phase===0`));
  await screenshot('lakes-dry-start');
  await game('weatherForce=4;weatherSetMood(4,true);rainWeather()');
  await sleep(10000);
  console.log('Live rain:' ,await ev('__particleRain.stats()'));
  check('real rain joins the live GPU water solver',await game('liquidWGPU.simActive && rain.landed>500 && rain.waterCount>200 && rain.drops.length>80'));
  check('rendered drops stay finite and behind their collision point',await game('rain.drops.every(function(p){return isFinite(p.x+p.y+p.vx+p.vy) && !liquidWorldSolidAt(p.x,p.y);})'));
  await screenshot('rain-day');
  await game('timeOfDay=0.755');await sleep(2500);await screenshot('rain-dusk');
  await game('timeOfDay=0.05');await sleep(2500);await screenshot('rain-night');
  if (process.argv.includes('--soak')) {
    for (let i=0;i<6;i++) {
      await sleep(10000);
      console.log('Storm soak '+(i+1)*10+'s:',await ev('__particleRain.stats()'));
    }
    check('live GPU storm absorbs rain and keeps finite particle state',await game(`(function(){
      liquidToolSync();var count=0;
      for(var i=0;i<liquidCount;i++){if(!isFinite(liquidX[i]+liquidY[i]+liquidVX[i]+liquidVY[i]))return false;if(liquidOrigin[i]===3)count++;}
      return rain.absorbed>1000 && rain.damp.length<=RAIN_DAMP_CAP && count+rain.parked.length/2+rain.drops.length-rain.lakeCount<=RAIN_WATER_CAP;
    })()`));
    const frames=await ev(`new Promise(function(resolve){var a=[],last=performance.now();function tick(t){a.push(t-last);last=t;if(a.length<240)requestAnimationFrame(tick);else{a.sort(function(x,y){return x-y;});resolve({median:a[120],p95:a[228]});}}requestAnimationFrame(tick);})`);
    console.log('Frame milliseconds during sustained rain:',frames);
    await screenshot('rain-capacity');
  }
  await ev("document.getElementById('gm-pause-btn').click()");
  const paused=await game('rain.time');await sleep(500);
  check('pause freezes rain',await game(`rain.time===${paused}`));
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-rain-off').click()");
  check('changing the next-world choice keeps the current rain world',await game('!SluiceOptions.particleRain && worldRainEnabled'));
  await ev("document.getElementById('gm-resume-btn').click()");
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;window.rainEnvelope=JSON.parse(JSON.stringify(saveBuild()));window.savedRainCount=rainEnvelope.rain.water.length/2;rainRestore(rainEnvelope.rain)');
  check('save restores its own mode and exact settled water',await game('worldRainEnabled && rain.parked.length/2===savedRainCount && savedRainCount>500'));
  await game('rainScan();rainScan()');
  check('streaming does not duplicate saved rain',await game('rain.waterCount+rain.parked.length/2===savedRainCount'));
  await game('rainRestore(null)');
  check('old saves remain dry regardless of global choice',await game('!worldRainEnabled && rain.parked.length===0 && rain.drops.length===0'));

  // Exercise the real save loader, weather cycle, and offscreen lake ledger.
  await game('saveApply(rainEnvelope);weatherForce=-1;rainScan();window.savedClimate=JSON.stringify(rain.climate)');
  check('save loader preserves finite lake identity and water',await game('surfacePonds.length===3 && surfacePonds.every(function(p){return p.rainFed;}) && rain.waterCount+rain.parked.length/2===savedRainCount'));
  const climate=await game(`(function(){
    rainReset(true);var first=rain.climate.duration,result=[];
    for(var second=0;second<450;second++){
      rainAdvanceWeather(1);rainWeather();
      result.push({phase:rain.climate.phase,pcp:weather.tpcp});
    }
    return {first:first,wet:result.filter(function(s){return s.pcp>0;}).length,
      cloud:result.some(function(s){return s.phase===1 && s.pcp===0;}),
      dry:result.filter(function(s){return s.phase===0 && s.pcp===0;}).length};
  })()`);
  console.log('450 seconds of scheduled weather:',climate);
  check('weather has a dry opening, cloud buildup, short showers and long dry spells',climate.first>=55 && climate.first<=80 && climate.wet>=35 && climate.wet<=110 && climate.dry>220 && climate.cloud);
  await game(`rain.climate={phase:2,elapsed:17,duration:45,strength:0.75};window.weatherSave=rainSave();rainRestore(weatherSave)`);
  check('saving mid-shower preserves its progress instead of restarting the rain',await game('rain.climate.phase===2 && rain.climate.elapsed===17 && rain.climate.duration===45 && weather.pcp>0.5'));
  await game(`liquidCount=0;rainReset(true);rainSeedLakes();cam.x=0;cam.y=2000;rainScan();
    window.lakeInitial=rain.parked.length/2;rain.intensity=0.7;
    for(var n=0;n<450;n++)rainCatchLakes(0.1,false,0,0);
    window.lakeAfterShower=rain.parked.length/2;rainScan();`);
  check('a shower gradually fills all three offscreen lakes without running fluid physics',await game('lakeAfterShower>lakeInitial+8000 && lakeAfterShower<lakeInitial+18000 && liquidCount===0 && surfacePonds.every(function(p){return p.rainCount>surfacePondNeed(p)*0.4 && p.rainCount<surfacePondNeed(p);})'));
  await game('rainRecycle(40000)');
  check('rain recycling preserves stored lake water',await game('rain.parked.length/2===lakeAfterShower'));
  await game(`window.lake=surfacePonds[0];window.beforeTake=rain.parked.length/2;
    window.taken=liquidExtractRect(lake.cL*TILE,SKY_ROWS*TILE,(lake.cR+1)*TILE,(SKY_ROWS+lake.d)*TILE,0,500);
    cam.x=lake.cL*TILE;cam.y=SKY_ROWS*TILE-100;updateSurfacePondStreaming();
    for(var i=0;i<30;i++)rainScan();
    cam.x=COLS*TILE;updateSurfacePondStreaming();rainScan();
    cam.x=lake.cL*TILE;updateSurfacePondStreaming();for(var i=0;i<30;i++)rainScan();`);
  check('scooping and revisiting a rain lake never refills or duplicates its water',await game('taken===500 && rain.waterCount+rain.parked.length/2===beforeTake-500'));
  await game(`cam.y=2000;rainScan();window.beforeBreach=surfacePonds[0].rainCount;
    world[SKY_ROWS+lake.d][lake.cL]=null;rainScan();rain.intensity=1;
    for(var i=0;i<100;i++)rainCatchLakes(0.1,false,0,0);`);
  check('mining the stone lining stops offscreen catchment in that lake',await game('!lake.catchable && lake.rainCount===beforeBreach'));
  await game(`world[SKY_ROWS+lake.d][lake.cL]={type:'stone',hp:ORES.stone.hp};rainScan();
    for(var i=0;i<2000;i++)rainCatchLakes(0.1,false,0,0);window.fullLakes=rain.parked.length/2;
    window.largeSave=rainSave();rainRestore(largeSave);rainScan();`);
  check('full lake storage stays bounded and saves more than the old 6000-particle limit',await game('fullLakes>RAIN_WATER_CAP && fullLakes<RAIN_STORAGE_CAP && rain.waterCount+rain.parked.length/2===fullLakes'));
  await game('weatherForce=4;weatherSetMood(4,true)');

  // Controlled collision fixture: a solid surface, one open shaft, and a
  // sealed void below an intact roof. Disable spawning while stepping physics.
  await game(`liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;
    surfacePonds=[];surfacePondBasins=[];rainReset(true);rain.primed=true;
    window.rc=80;window.sy=SKY_ROWS*TILE;cam.x=(rc-4)*TILE;cam.y=sy+1;screenW=640;screenH=480;
    player.x=cam.x+500;player.y=sy-PLAYER_H;rain.scan=1000;
    for(var r=SKY_ROWS;r<SKY_ROWS+14;r++)for(var c=rc-5;c<rc+15;c++)world[r][c]={type:'stone',hp:10};
    for(var r=SKY_ROWS;r<SKY_ROWS+10;r++)world[r][rc+2]=null;
    world[SKY_ROWS+3][rc]=null;
    rain.drops=[{x:rc*TILE+16,y:sy-9,vx:0,vy:810,size:1,age:0}];updateParticleRain(0.05);`);
  check('fast drops hit the roof instead of tunnelling into a sealed cave',await game('liquidCount===1 && liquidY[0]<sy && rain.drops.length===0 && rain.landed===1'));
  await game(`rain.drops=[{x:(rc+2)*TILE+16,y:sy-9,vx:0,vy:810,size:1,age:0}];updateParticleRain(0.05)`);
  check('open shafts admit rain',await game('rain.drops.length===1 && rain.drops[0].y>sy && liquidCount===1'));
  await game('for(var frame=0;frame<20;frame++)updateParticleRain(0.05)');
  check('shaft rain lands as exactly one collectable water particle',await game('rain.drops.length===0 && liquidCount===2 && liquidY[1]>(SKY_ROWS+8)*TILE && rain.landed===2'));
  check('scoop captures rain as normal water',await game('liquidToolExtract(liquidX[1],liquidY[1],8,1)[0]===1 && liquidCount===1'));

  await game(`addLiquidParticle(2,rc*TILE+12,sy-4,0,0,0);addLiquidParticle(0,rc*TILE+18,sy-4,0,0,1);
    rain.parked=[10,10,11,11];rainRecycle(100);`);
  check('rain recycling preserves mineral, poured and pond water',await game('liquidCount===2 && liquidOrigin[0]!==3 && liquidOrigin[1]!==3 && rain.parked.length===0'));
  await game('rain.parked=[100,100,101,101,102,102]');
  check('offscreen baths can sample and consume rain without duplicating it',await game('liquidSampleRect(90,90,110,110)[0]===3 && liquidExtractRect(90,90,110,110,0,2)===2 && rain.parked.length===2'));

  // Water loss must be gradual, material-aware and safe for other liquids.
  await game(`liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;rainReset(true);
    cam.y=sy-120;screenW=640;screenH=480;
    world[SKY_ROWS][rc]={type:'dirt'};world[SKY_ROWS][rc+1]={type:'stone'};
    world[SKY_ROWS][rc+2]={type:'foundation'};world[SKY_ROWS][rc+3]={type:'copper'};
    world[SKY_ROWS][rc-1]=null;world[SKY_ROWS+1][rc]=null;
    for(var i=0;i<1000;i++)addLiquidParticle(0,rc*TILE+2+(i%28),sy-2,0,0,3);
    rainScan(0.16);`);
  check('dirt absorbs a puddle quickly across multiple scans',await game('liquidCount>300 && liquidCount<550 && rain.absorbed>450 && rain.damp.length>0'));
  await game(`rainScan(10);
    for(var c=rc+1;c<=rc+3;c++)for(var i=0;i<100;i++)addLiquidParticle(0,c*TILE+16,sy-2,0,0,3);
    for(var i=0;i<100;i++)addLiquidParticle(0,rc*TILE+16,sy-14,0,0,3);
    for(var i=0;i<3;i++)addLiquidParticle(i===2?2:0,rc*TILE+16,sy-2,0,0,i);
    for(var i=0;i<100;i++){addLiquidParticle(0,rc*TILE-2,sy+16,0,0,3);addLiquidParticle(0,rc*TILE+16,sy+TILE+2,0,0,3);}
    rainScan(10);`);
  check('rain touching dirt or foundation drains, including walls and ceilings',await game('liquidCount===301 && rain.absorbed===1302'));
  check('stone, ore and falling water retain their particles',await game('rain.waterCount===300'));
  check('soil absorbs ordinary and escaped pond water while preserving minerals',await game('(function(){var count=0;for(var i=0;i<liquidCount;i++)if(liquidOrigin[i]!==3)count++;return count===1;})()'));
  await game(`var parkedCol=rc+40;world[SKY_ROWS][parkedCol]={type:'dirt'};
    for(var i=0;i<100;i++)rain.parked.push(parkedCol*TILE+16,sy-2);
    rainScan(10);`);
  check('offscreen dirt absorbs parked rain without resurrecting it',await game('rain.parked.length===0 && liquidCount===301 && rain.absorbed===1402'));
  await game('rain.time+=7;rainScan()');
  check('damp marks fade away and release their cache entries',await game('rain.damp.length===0 && Object.keys(rain.dampCells).length===0'));
  await game('rainDampEdge(SKY_ROWS,rc,0,rc*TILE+4,sy);world[SKY_ROWS][rc]=null;rainScan()');
  check('digging removes the old dirt wetting mark',await game('rain.damp.length===0'));

  await game(`liquidCount=0;rainReset(true);rain.time=10;
    for(var c=rc-2;c<rc+12;c++)world[SKY_ROWS][c]={type:'dirt'};
    player.x=rc*TILE;player.y=sy-PLAYER_H;player.vx=90;player.vy=0;player.onGround=true;
    for(var i=0;i<1000;i++)addLiquidParticle(0,player.x+PLAYER_W+16,sy-2,0,0,3);
    for(var i=0;i<100;i++)addLiquidParticle(0,player.x+TILE*10,sy-2,0,0,3);
    for(var i=0;i<100;i++)addLiquidParticle(0,player.x-16,sy-2,0,0,3);
    for(var i=0;i<100;i++)addLiquidParticle(0,player.x+PLAYER_W+52,sy-2,0,0,3);
    rainUpdatePlow();rainScan(10);`);
  check('driving protects only a small crest, draining excess and water behind the rig',await game('liquidCount===RAIN_PLOW_CAP && rain.absorbed===1300-RAIN_PLOW_CAP'));
  await game('rainRecycle(1000)');
  check('reservoir recycling does not eat the bow wave',await game('liquidCount===RAIN_PLOW_CAP && rain.recycled===0'));
  await game('player.vx=0;rain.time+=0.2;for(var i=0;i<liquidCount;i++)liquidVX[i]=70;rainScan(10)');
  check('moving wake survives briefly after the rig stops',await game('liquidCount===RAIN_PLOW_CAP'));
  await game('for(var i=0;i<liquidCount;i++)liquidVX[i]=0;rainScan(10)');
  check('settled wake resumes dirt absorption',await game('liquidCount===0'));
  await game(`player.x=(rc+5)*TILE;player.vx=-90;rainUpdatePlow();
    addLiquidParticle(0,player.x-16,sy-2,-50,0,3);addLiquidParticle(0,player.x-50,sy-2,-50,0,3);rainScan(10);`);
  check('leftward driving protects the advancing side too',await game('liquidCount===1'));
  await game('player.vx=0;rain.time+=0.5;rainScan(10)');
  check('old wake protection expires even if liquid keeps jittering',await game('liquidCount===0'));
  await game(`rainReset(true);player.onGround=false;player.vx=90;rainUpdatePlow();
    addLiquidParticle(0,player.x+PLAYER_W+16,sy-2,0,0,3);rainScan(10);player.vx=0;`);
  check('flying over dirt does not suspend ground absorption',await game('liquidCount===0'));

  const drainage=await game(`(function(){var result=[],random=Math.random;
    try {for(var hz=0;hz<3;hz++){
      var fps=[30,60,144][hz],seed=731;
      Math.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      liquidCount=0;rainReset(true);rain.primed=true;cam.y=sy+1;world[SKY_ROWS][rc]={type:'dirt'};
      for(var i=0;i<2000;i++)addLiquidParticle(0,rc*TILE+16,sy-2,0,0,3);
      for(var f=0;f<fps;f++)updateParticleRain(1/fps);
      result.push({fps:fps,remaining:liquidCount});
    }} finally {Math.random=random;}
    return result;
  })()`);
  console.log('One second of dirt contact:',drainage);
  check('dirt removes at least 98% of the contact film within one second at 30, 60 and 144 FPS',drainage.every(v=>v.remaining<=40));
  await game(`liquidCount=0;rainReset(true);
    for(var i=0;i<RAIN_DAMP_CAP+100;i++)rainDampEdge(SKY_ROWS,20+i,0,(20+i)*TILE+4,sy);`);
  check('damp visuals have a hard cache budget',await game('rain.damp.length===RAIN_DAMP_CAP && Object.keys(rain.dampCells).length===RAIN_DAMP_CAP'));

  await game(`rainReset(true);cam.y=sy-280;rain.parked=[];
    for(var i=0;i<RAIN_WATER_CAP;i++)rain.parked.push(10,-4000);
    updateParticleRain(1/60);`);
  check('loading a full reservoir cannot overfill it when priming the sky',await game('rain.waterCount+rain.parked.length/2+rain.drops.length-rain.lakeCount<=RAIN_WATER_CAP'));
  await game(`
    for(var step=0;step<1800;step++)updateParticleRain(1/60);`);
  check('sustained storm stays inside the finite rain reservoir',await game('rain.waterCount+rain.parked.length/2+rain.drops.length-rain.lakeCount<=RAIN_WATER_CAP && rain.drops.length<=RAIN_DROP_CAP && rain.recycled>100'));
  check('full shared solver does not erase or fabricate landed water',await game(`(function(){var count=liquidCount;liquidCount=LIQUID_MAX_PARTICLES;var landed=rain.landed;var ok=!rainLand({vx:0,vy:600,size:0.5},100,100,false,true)&&rain.landed===landed;liquidCount=count;return ok;})()`));
  check('CPU fallback has a lower bounded rain budget',await game(`(function(){var gpu=liquidWGPU;liquidWGPU=null;rainReset(true);rain.primed=true;for(var f=0;f<600;f++)updateParticleRain(1/60);var ok=rain.waterCount+rain.parked.length/2+rain.drops.length<=RAIN_CPU_CAP;liquidWGPU=gpu;return ok;})()`));
  check('malformed saved rain is rejected and bounded',await game("rainRestore({enabled:true,water:[NaN,0,2,Infinity,-1,10,20,30,'40',50]});rain.parked.length===2 && rain.parked[0]===20"));

  // Reload a clean live scene for mobile layout and performance sampling.
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&rain=1&tod=0.35`});await ready();
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'))");
  await game('weatherForce=4;weatherSetMood(4,true);rainWeather()');
  await sleep(2500);
  const timings=await game(`(function(){var samples=[];for(var n=0;n<200;n++){var t=performance.now();updateParticleRain(1/60);samples.push(performance.now()-t);}samples.sort(function(a,b){return a-b;});return {p50:samples[100],p95:samples[190],max:samples[199]};})()`);
  console.log('Rain CPU update milliseconds:',timings);
  if (process.argv.includes('--plow')) {
    await game(`timeOfDay=0.35;tutorialDone=true;
      window.plowSamples=[];window.plowStart=player.x;
      keys.ArrowLeft=true;`);
    let peakFront=0;
    for(let i=0;i<10;i++) {
      await sleep(500);
      const state=await game(`(function(){liquidToolSync();var front=0,moving=0,maxHeight=0;
        for(var i=0;i<liquidCount;i++){
          if(liquidOrigin[i]!==3 || liquidX[i]<player.x-72 || liquidX[i]>player.x+4 || liquidY[i]<player.y-6 || liquidY[i]>player.y+PLAYER_H+6)continue;
          front++;maxHeight=Math.max(maxHeight,player.y+PLAYER_H-liquidY[i]);
          if(Math.abs(liquidVX[i])>12)moving++;
        }
        return {x:player.x,ground:player.onGround,front:front,moving:moving,height:maxHeight,water:rain.waterCount};
      })()`);
      console.log('Driving rain:',state);
      await game(`plowSamples.push(${JSON.stringify(state)})`);
      if(state.ground && state.moving>=8 && state.front>peakFront){peakFront=state.front;await screenshot('rain-plow-peak');}
    }
    await screenshot('rain-plow');
    await game('keys.ArrowLeft=false');
    check('live GPU driving still gathers a small moving crest',await game('player.x<plowStart-100 && plowSamples.some(function(s){return s.ground && s.front>=16 && s.moving>=8 && s.height>=3;})'));
    check('driving stays within the original small rain budget',await game('rain.waterCount+rain.parked.length/2+rain.drops.length-rain.lakeCount<=RAIN_WATER_CAP'));
    await sleep(2500);await screenshot('rain-plow-settled');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize()');await sleep(1500);await screenshot('rain-mobile');
  await game("PAUSE_DISABLED=false");
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-rain-label').scrollIntoView({block:'center'})");
  await screenshot('options-mobile');
  check('mobile rain setting fits the viewport',await ev("(function(){var r=document.getElementById('gm-rain-on').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40;})()"));
  if (process.argv.includes('--drain')) {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&rain=1&tod=0.35`});await ready();
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'))");
    await game(`liquidToolSync();liquidCount=0;rainReset(true);rain.primed=true;rainSpawn=function(){};
      surfacePonds=[];surfacePondBasins=[];surfaceBasinByCol=null;
      var sy=SKY_ROWS*TILE;var rc=80;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=rc-5;c<rc+20;c++){
        world[r][c]={type:'dirt',hp:10};invalidateTerrainAround(r,c);
      }
      player.x=(rc+9)*TILE;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;
      for(var j=0;j<20;j++)for(var k=0;k<100;k++){
        var i=addLiquidParticle(0,rc*TILE+k*1.25,sy-1.3-j*1.25,0,0,3);
        liquidSleeping[i]=1;liquidRestFrames[i]=LIQUID_SLEEP_FRAMES;
      }
      liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;`);
    for(let n=0;n<3;n++){
      await sleep(2000);
      console.log('Resting dirt puddle at '+(n+1)*2+'s:',await game(`(function(){liquidToolSync();var count=0,sleeping=0,minGap=Infinity,maxGap=0;
        for(var i=0;i<liquidCount;i++)if(liquidOrigin[i]===3){count++;sleeping+=liquidSleeping[i];minGap=Math.min(minGap,SKY_ROWS*TILE-liquidY[i]);maxGap=Math.max(maxGap,SKY_ROWS*TILE-liquidY[i]);}
        return {count:count,sleeping:sleeping,minGap:minGap,maxGap:maxGap,absorbed:rain.absorbed};})()`));
    }
    await screenshot('rain-deep-puddle-drained');
    check('a sleeping 2000-particle puddle drains completely into dirt',await game('liquidCount<20'));
  }
  if (process.argv.includes('--lakes')) {
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&rain=1&tod=0.35`});await ready();
    await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'))");
    await game(`window.lake=surfacePonds[1];tutorialDone=true;
      player.x=(lake.cL-3)*TILE;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;cam.snap=true;updateCamera();`);
    await sleep(4000);await screenshot('lake-before-shower');
    const low=await game('liquidToolSync();rainScan();lake.rainCount');
    await game(`liquidToolSync();rainScan();rain.intensity=0.7;
      for(var f=0;f<450;f++)rainCatchLakes(0.1,false,0,0);
      weatherForce=4;weatherSetMood(4,true);`);
    await sleep(6500);await screenshot('lake-after-shower');
    const full=await game(`liquidToolSync();rainScan();({count:lake.rainCount,capacity:surfacePondNeed(lake),stats:__particleRain.stats()})`);
    console.log('Lake before and after a shower:',{low,...full});
    check('live GPU lake visibly rises after rainfall',full.count>low*2 && full.count<full.capacity);
    await game('weatherForce=0;weatherSetMood(0,false)');
    await sleep(4000);await screenshot('lake-clearing');
    const cost=await game(`(function(){var a=[];for(var i=0;i<200;i++){var t=performance.now();updateParticleRain(1/60);a.push(performance.now()-t);}a.sort(function(a,b){return a-b;});return {median:a[100],p95:a[190],max:a[199]};})()`);
    console.log('Rain update with partly filled lakes, milliseconds:',cost);
  }
  console.log('Errors:',JSON.stringify(errors));
  check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {cleanup();}
