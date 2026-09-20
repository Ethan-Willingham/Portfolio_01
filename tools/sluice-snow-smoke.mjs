// Physical snow integration, material conservation, interaction and visual checks. Uses its own Chrome for Testing process and profile.
// Run: node tools/sluice-snow-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8191), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-qa';
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});await ready();
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  check('ordinary worlds keep snow physics disabled',await game('!worldSnowEnabled && snow.mass===0'));
  await game('PAUSE_DISABLED=false');
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-snow-on').click()");
  check('Snow is a persisted next-world setting',await game("SluiceOptions.particleSnow && !worldSnowEnabled && localStorage.getItem('sluice.opt.rain')==='snow'"));
  await screenshot('snow-options');
  await ev("document.getElementById('gm-opt-back').click();document.getElementById('gm-new-game-btn').click();document.getElementById('gm-restart-btn').click()");await sleep(300);await ready();
  await sleep(1500);
  check('new snow world has actual shared solver particles and slow flakes',await game('worldSnowEnabled && snow.active>100 && snow.grains.length>50 && weatherPrecipType()==="snow" && rain.drops.length===0'));
  check('GPU solver and shaders are live',await game('liquidWGPU.simActive && liquidWGPU.renderActive') && await ev('__shaderWarm.errors.length===0'));
  await sleep(5000);await screenshot('snow-day');
  await game('timeOfDay=0.05');await sleep(1000);await screenshot('snow-night');
  await ev("document.getElementById('gm-pause-btn').click()");const frozen=await game('snow.time');await sleep(350);
  check('pause freezes snowfall and thaw',await game(`snow.time===${frozen}`));
  await ev("document.getElementById('gm-resume-btn').click()");
  console.log('FRESH',await ev('__particleSnow.stats()'));

  await game(`window.rc=80;window.sy=SKY_ROWS*TILE;window.clearSnowFixture=function(){
    keys.ArrowRight=keys.ArrowLeft=keys.ArrowDown=keys.ArrowUp=false;
    while(liquidCount)removeLiquidParticle(liquidCount-1);
    mineralLiquidReset();surfacePonds=[];rainReset(true,true);SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=rc-8;c<rc+45;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    player.x=(rc+2)*TILE;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;drilling=null;cam.snap=true;timeOfDay=0.35;updateCamera();
  }; clearSnowFixture();
  for(var x=(rc+5)*TILE;x<(rc+18)*TILE;x+=1.4)for(var h=1.4;h<Math.min(32,(x-(rc+5)*TILE)/4,((rc+18)*TILE-x)/4);h+=1.4){addLiquidParticle(5,x+(wHash(Math.floor(x*10),Math.floor(h*10),911)-0.5)*0.5,sy-h+(wHash(Math.floor(x*10),Math.floor(h*10),912)-0.5)*0.5,0,0,3);snow.active++;}
  snow.mass=snow.emitted=snow.active;window.seedCount=snow.active;`);
  await sleep(5000);await screenshot('snow-pile');
  const beforeDrive=await game(`({count:__particleSnow.stats().active,moving:__particleSnow.stats().moving,depth:sy-Math.min.apply(null,Array.from(liquidY.slice(0,liquidCount)))})`);console.log('RESTING PILE',beforeDrive);
  check('snow holds a low pile without boiling or losing material',beforeDrive.count>3500 && beforeDrive.moving<30 && beforeDrive.depth>15 && beforeDrive.depth<50);
  await game('window.driveStart=player.x;window.driveSamples=[];keys.ArrowRight=true');
  for(let i=0;i<9;i++){
    await sleep(320);
    const state=await game('({x:player.x,y:player.y,ground:player.onGround,moving:__particleSnow.stats().moving,remaining:__particleSnow.stats().active})');
    await game(`driveSamples.push(${JSON.stringify(state)})`);console.log('DRIVE',state);
    if(i===4)await screenshot('snow-plow');
  }
  await game('keys.ArrowRight=false');
  check('tracks drive through real snow particles without alternate foot support',await game('player.x>driveStart+300 && driveSamples.every(function(s){return s.ground && Math.abs(s.y-(sy-PLAYER_H))<2;}) && driveSamples.some(function(s){return s.moving>100;})'));
  check('cold snow mostly survives a drive instead of turning into a puddle',await game('__particleSnow.stats().active>seedCount*0.9'));
  await sleep(1800);await screenshot('snow-tracks');
  await game('keys.ArrowLeft=true');await sleep(2300);await game('keys.ArrowLeft=false');
  check('the same particle collision works driving left',await game('player.onGround && __particleSnow.stats().moving>20'));
  await game('window.jetMelt=snow.melted;keys.ArrowUp=true');
  let jetMoving=0;
  for(let i=0;i<7;i++) { await sleep(100);jetMoving=Math.max(jetMoving,await game('__particleSnow.stats().moving'));if(i===3)await screenshot('snow-jet'); }
  await game('keys.ArrowUp=false');
  console.log('JET',jetMoving,await game('({before:jetMelt,after:snow.melted})'));
  check('existing jet forces lift powder and exhaust warms it',jetMoving>50 && await game('snow.melted>jetMelt'));
  await game('player.x=(rc+10)*TILE+3;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;keys.ArrowDown=true');await sleep(1600);await game('keys.ArrowDown=false');
  check('ordinary digging remains available through snow',await game('world[SKY_ROWS][rc+10]===null'));

  await game('cancelAnimationFrame(gameRafId);gameRafId=0;liquidToolSync();window.beforeSave=__particleSnow.stats().mass;window.snowEnvelope=JSON.parse(JSON.stringify(saveBuild()));saveApply(snowEnvelope)');
  check('save/load retains exactly the shared snow and airborne mass',await game('__particleSnow.stats().mass===beforeSave && snowEnvelope.rain.snow.version===2'));
  check('water save does not duplicate snow',await game('snowEnvelope.rain.snow.particles.length/4+snowEnvelope.rain.snow.grains.length===beforeSave'));
  await game('clearSnowFixture();liquidToolSync();for(var i=0;i<20;i++)addLiquidParticle(5,rc*TILE+10+(i%5)*2.4,sy-2-Math.floor(i/5)*2.4,0,0,3);window.taken=liquidToolExtract(rc*TILE+15,sy-6,30,7)');
  check('native scoop transfers exactly one water unit per snow particle',await game('taken.length===5 && taken[0]===7 && liquidCount===13 && Array.from(liquidType.slice(0,liquidCount)).every(function(t){return t===5;})'));
  await game('window.beforeMelt=liquidCount;window.mx=liquidX[0];window.my=liquidY[0];snowMeltParticle(0)');
  check('melting changes the material in place, without adding, deleting or teleporting a particle',await game('liquidCount===beforeMelt && liquidType[0]===0 && liquidOrigin[0]===3 && liquidX[0]===mx && liquidY[0]===my'));
  await game('rain.waterCount=RAIN_STORAGE_CAP;window.blockedMelt=snowMeltParticle(1)');
  check('a full water reservoir defers thaw without losing snow',await game('!blockedMelt && liquidType[1]===5 && liquidCount===beforeMelt'));
  await game('clearSnowFixture();snowRestore({banks:[[rc*8,SKY_ROWS,8,0.1,0],[rc*8,SKY_ROWS,8,0.1,0],[-2,SKY_ROWS,20,0,0]],grains:[[rc*TILE+10,sy-10,20,-10,7,1,0.5,1]]})');
  check('old column saves migrate to individual particles without duplicates',await game('snow.parked.length/4===15 && snow.grains.length===0'));
  await game('clearSnowFixture();snowRestore({version:2,particles:[NaN,0,0,0,rc*TILE,sy-2,Infinity,0,-1,sy,0,0]})');
  check('malformed particle saves cannot enter the solver',await game('__particleSnow.stats().mass===0'));

  // End-to-end GPU drainage, including the formerly immortal poured/pond water.
  await game('clearSnowFixture();rainReset(true,false);weatherForce=0;weatherSetMood(0,true);player.x=(rc-4)*TILE;cam.snap=true;updateCamera();for(var origin=0;origin<4;origin++)for(var i=0;i<80;i++)addLiquidParticle(0,(rc+origin)*TILE+4+(i%12)*1.8,sy-2-Math.floor(i/12)*1.8,0,0,origin);gameRafId=requestAnimationFrame(loop)');
  await sleep(5000);await screenshot('rain-soaked');
  check('live GPU water from every source soaks into dirt',await game('liquidCount===0 && rain.absorbed===320'));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;clearSnowFixture();world[SKY_ROWS][rc]={type:"stone",hp:10};for(var i=0;i<50;i++)addLiquidParticle(0,rc*TILE+5+i%20,sy-2,0,0,0);rainScan(10)');
  check('stone still holds water',await game('liquidCount===50'));

  // Freeze the scene and compare a flake against that exact particle after
  // transfer. Both must produce identical nonempty pixels in the surface
  // renderer and with the legacy renderer selected.
  await game('clearSnowFixture();liquidWGPU.uploadParticles();render()');
  const clip=await game('({x:canvas.getBoundingClientRect().left+120*worldScale-12,y:canvas.getBoundingClientRect().top+100*worldScale-12,width:24,height:24,scale:1})');
  for (const surface of [1,0]) {
    await game(`liquidWGPU.setRenderParam('SURFACE_RENDER',${surface});snow.grains=[];while(liquidCount)removeLiquidParticle(liquidCount-1);liquidWGPU.uploadParticles();liquidWGPU.draw()`);
    const blank=(await send('Page.captureScreenshot',{format:'png',clip})).data;
    await game('snow.grains=[{x:cam.x+120,y:cam.y+100,vx:0,vy:0,size:0.8,phase:1}];liquidWGPU.draw()');
    const airborne=(await send('Page.captureScreenshot',{format:'png',clip})).data;
    await game('var flake=snow.grains.pop();snowParticle(flake.x,flake.y,flake.vx,flake.vy);liquidWGPU.uploadParticles();liquidWGPU.draw()');
    const landed=(await send('Page.captureScreenshot',{format:'png',clip})).data;
    check('airborne and solver snow have identical visible pixels (surface='+surface+')',airborne!==blank && airborne===landed);
  }
  await game("liquidWGPU.setRenderParam('SURFACE_RENDER',1)");

  if(process.argv.includes('--soak')) {
    await game('init();SNOW_RATE=345;weatherForce=4;weatherSetMood(4,true);gameRafId=requestAnimationFrame(loop)');await sleep(60000);await screenshot('snow-deep');
    const stats=await ev('__particleSnow.stats()');console.log('LONG SNOW',stats);
    check('sustained snowfall respects the real particle budgets',stats.active<=36000 && stats.mass<=120000 && stats.airborne<=5400);
  }
  if(process.argv.includes('--cpu')) {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&cpuwater=1&nosave=1&nopause=1&tod=0.35`});await ready();await sleep(6000);
    check('CPU fallback runs the same snow material',await game('(!liquidWGPU || !liquidWGPU.simActive) && snow.active>100 && Array.from(liquidType.slice(0,liquidCount)).some(function(t){return t===5;})'));
    await screenshot('snow-cpu');
    await game('cancelAnimationFrame(gameRafId);gameRafId=0;while(liquidCount)removeLiquidParticle(liquidCount-1);snow.grains=[];render()');
    const cpuClip=await game('({x:canvas.getBoundingClientRect().left+120*worldScale-12,y:canvas.getBoundingClientRect().top+100*worldScale-12,width:24,height:24,scale:1})');
    const cpuBlank=(await send('Page.captureScreenshot',{format:'png',clip:cpuClip})).data;
    await game('snow.grains=[{x:cam.x+120,y:cam.y+100,vx:0,vy:0,size:0.8,phase:1}];drawLiquids()');
    const cpuAir=(await send('Page.captureScreenshot',{format:'png',clip:cpuClip})).data;
    await game('var flake=snow.grains.pop();snowParticle(flake.x,flake.y,0,0);drawLiquids()');
    const cpuGround=(await send('Page.captureScreenshot',{format:'png',clip:cpuClip})).data;
    check('CPU snow keeps identical visible pixels on landing',cpuAir!==cpuBlank && cpuAir===cpuGround);
    await game('while(liquidCount)removeLiquidParticle(liquidCount-1);drawLiquids()');
    check('removing the last CPU grain clears its pixels',(await send('Page.captureScreenshot',{format:'png',clip:cpuClip})).data===cpuBlank);

  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await game('PAUSE_DISABLED=false');await ev("document.getElementById('gm-pause-btn').click()");await ev("document.getElementById('gm-options-btn').click()");await screenshot('snow-options-mobile');
  check('Snow remains tappable on mobile',await ev('(function(){var b=document.getElementById("gm-snow-on").getBoundingClientRect();return b.width>=40 && b.right<=innerWidth;})()'));
  assert.deepEqual(errors,[]);assert.deepEqual(await ev('__shaderWarm.errors'),[]);console.log('PASS no runtime or shader errors; screenshots '+out);
} finally { if(errors.length)console.log('ERRORS',errors);cleanup(); }
