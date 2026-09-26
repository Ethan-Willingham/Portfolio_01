// Live mixed weather, cloudy snow preservation, thunder and thaw regression.
// Run: node tools/sluice-weather-cycle.mjs [--cpu].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8393), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-weather-cycle-qa';
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

  const cpu = process.argv.includes('--cpu');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35${cpu?'&cpuwater=1':''}`});
  await ready();
  check('requested particle solver is active',await game(cpu
    ? '(!liquidWGPU || !liquidWGPU.simActive)' : '!!(liquidWGPU && liquidWGPU.simActive)'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");

  await game(`while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
    SNOW_RATE=0;weatherForce=-1;tutorialDone=true;window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'stone',hp:ORES.stone.hp};invalidateTerrainAround(r,c);}
    rain.climate={phase:3,elapsed:0,duration:240,strength:.7,kind:'snow',storm:false,run:1,first:false};
    weatherSetMood(2,true);rainWeather();snow.field.strength=rain.field.strength=0;
    windSetTarget('still',1,0,100,0,0);surfaceWind.current=0;surfaceWind.flutter=0;
    zoomMode='out';resize();player.x=cx-PLAYER_W*.5;player.y=sy-PLAYER_H-34;player.vx=player.vy=0;cam.snap=true;updateCamera();
    for(var n=0;n<1000;n++){addLiquidParticle(5,cx-70+(n%100)*1.4,sy-1.3-Math.floor(n/100)*1.4,0,0,3);snow.active++;}
    snow.mass=snow.emitted=1000;`);
  await sleep(1600);await screenshot('cloudy-snow');
  check('cloudy aftermath holds deposited snow without thaw',await game('snow.melted===0&&__particleSnow.stats().mass===1000&&snow.temperature<0'));
  await game('keys.ArrowUp=true');await sleep(1700);await game('keys.ArrowUp=false');
  check('player jets do not melt snow under clouds',await game('snow.melted===0&&__particleSnow.stats().mass===1000&&rain.waterCount===0'));
  await game(`cancelAnimationFrame(gameRafId);gameRafId=0;
    gameOver=false;player.hull=getMaxHull();player.x=cx+180;player.y=sy-PLAYER_H;player.vx=player.vy=0;
    rain.climate={phase:2,elapsed:20,duration:100,strength:.95,kind:'rain',storm:true,run:1,first:false};
    rainWeather();weatherSetMood(5,true);window.weatherSave=JSON.parse(JSON.stringify(rainSave()));rainRestore(weatherSave);`);
  check('rain-front save keeps existing snow and front progress',await game("worldSnowEnabled&&weatherPrecipType()==='rain'&&rain.climate.elapsed===20&&rain.climate.storm&&__particleSnow.stats().mass===1000"));
  await game('gameRafId=requestAnimationFrame(loop)');await sleep(2000);
  check('rain and surviving snow update together',await game('rain.drops.length>0&&__particleSnow.stats().mass>0&&rain.landed>0'));
  await game('weather.flashT=0');await sleep(65);
  check('rain thunderstorm drives the existing lightning effect',await game('weather.flash>0.1'));
  check('rain thunderstorm selects thunder ambience',await ev("SluiceAudio.sfx.ambience.zone()==='storm'"));
  await screenshot('rain-thunderstorm');
  await game(`cancelAnimationFrame(gameRafId);gameRafId=0;
    while(liquidCount)removeLiquidParticle(liquidCount-1);rainReset(true,true);SNOW_RATE=0;
    player.x=cx+180;player.y=sy-PLAYER_H;player.vx=player.vy=0;updateCamera();
    rain.climate={phase:0,elapsed:40,duration:180,strength:.7,kind:'snow',storm:false,run:1,first:false};
    weatherSetMood(0,true);rainWeather();snow.field.strength=0;rain.field.strength=0;
    for(var n=0;n<800;n++){addLiquidParticle(5,cx-56+(n%80)*1.4,sy-1.3-Math.floor(n/80)*1.4,0,0,3);snow.active++;}
    snow.mass=snow.emitted=800;gameRafId=requestAnimationFrame(loop);`);
  await sleep(2600);await screenshot('sunny-thaw');
  const thaw=await game('({snow:__particleSnow.stats().mass,melted:snow.melted,water:rain.waterCount+rain.parked.length/2,heat:snow.temperature,absorbed:rain.absorbed})');
  console.log('THAW',thaw);
  check('clearing skies thaw snow gradually into conserved water',thaw.melted>5&&thaw.snow>100&&thaw.snow+thaw.water+thaw.absorbed===800&&thaw.heat>0);
  assert.equal(errors.length,0,'no runtime or shader errors');
  console.log('PASS mixed weather and protected cloudy snow');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
