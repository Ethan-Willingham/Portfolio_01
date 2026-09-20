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
  await sleep(10000);
  console.log('Live rain:',await ev('__particleRain.stats()'));
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
    check('live GPU storm reaches the recycling limit with finite particle state',await game(`(function(){
      liquidToolSync();var count=0;
      for(var i=0;i<liquidCount;i++){if(!isFinite(liquidX[i]+liquidY[i]+liquidVX[i]+liquidVY[i]))return false;if(liquidOrigin[i]===3)count++;}
      return rain.recycled>1000 && count+rain.parked.length/2+rain.drops.length<=RAIN_WATER_CAP;
    })()`));
    const frames=await ev(`new Promise(function(resolve){var a=[],last=performance.now();function tick(t){a.push(t-last);last=t;if(a.length<240)requestAnimationFrame(tick);else{a.sort(function(x,y){return x-y;});resolve({median:a[120],p95:a[228]});}}requestAnimationFrame(tick);})`);
    console.log('Frame milliseconds at full rain capacity:',frames);
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
  await game(`rainReset(true);cam.y=sy-280;rain.parked=[];
    for(var i=0;i<RAIN_WATER_CAP;i++)rain.parked.push(10,-4000);
    updateParticleRain(1/60);`);
  check('loading a full reservoir cannot overfill it when priming the sky',await game('rain.waterCount+rain.parked.length/2+rain.drops.length<=RAIN_WATER_CAP'));
  await game(`
    for(var step=0;step<1800;step++)updateParticleRain(1/60);`);
  check('sustained storm stays inside the finite rain reservoir',await game('rain.waterCount+rain.parked.length/2+rain.drops.length<=RAIN_WATER_CAP && rain.drops.length<=RAIN_DROP_CAP && rain.recycled>100'));
  check('full shared solver does not erase or fabricate landed water',await game(`(function(){var count=liquidCount;liquidCount=LIQUID_MAX_PARTICLES;var landed=rain.landed;var ok=!rainLand({vx:0,vy:600,size:0.5},100,100,false,true)&&rain.landed===landed;liquidCount=count;return ok;})()`));
  check('CPU fallback has a lower bounded rain budget',await game(`(function(){var gpu=liquidWGPU;liquidWGPU=null;rainReset(true);rain.primed=true;for(var f=0;f<600;f++)updateParticleRain(1/60);var ok=rain.waterCount+rain.parked.length/2+rain.drops.length<=8000;liquidWGPU=gpu;return ok;})()`));
  check('malformed saved rain is rejected and bounded',await game("rainRestore({enabled:true,water:[NaN,0,2,Infinity,-1,10,20,30,'40',50]});rain.parked.length===2 && rain.parked[0]===20"));

  // Reload a clean live scene for mobile layout and performance sampling.
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&rain=1&tod=0.35`});await ready();
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'))");
  await sleep(2500);
  const timings=await game(`(function(){var samples=[];for(var n=0;n<200;n++){var t=performance.now();updateParticleRain(1/60);samples.push(performance.now()-t);}samples.sort(function(a,b){return a-b;});return {p50:samples[100],p95:samples[190],max:samples[199]};})()`);
  console.log('Rain CPU update milliseconds:',timings);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize()');await sleep(1500);await screenshot('rain-mobile');
  await game("PAUSE_DISABLED=false");
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-rain-label').scrollIntoView({block:'center'})");
  await screenshot('options-mobile');
  check('mobile rain setting fits the viewport',await ev("(function(){var r=document.getElementById('gm-rain-on').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40;})()"));
  console.log('Errors:',JSON.stringify(errors));
  check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {cleanup();}
