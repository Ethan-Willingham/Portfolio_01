// Physical snow jet checks. Uses its own Chrome for Testing process and profile.
// Run: node tools/sluice-snow-jet.mjs [--cpu] [--passes-only]. Screenshots stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8193), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-jet-qa';
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

  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35${process.argv.includes("--cpu")?"&cpuwater=1":""}`});await ready();
  check('requested particle solver is active',await game(process.argv.includes('--cpu')
    ? '(!liquidWGPU || !liquidWGPU.simActive)' : '!!(liquidWGPU && liquidWGPU.simActive)'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  // A brief pass over untouched snow must lift powder before a long hover
  // has time to build an eddy. No snowfall or prior pass supplies this plume.
  for (const [depth, direction] of [[4.2,1],[15,-1]]) {
    await game(`keys.ArrowUp=false;while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
      SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
      window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=62;c<103;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
      player.x=cx-(${direction})*280-PLAYER_W/2;player.y=sy-PLAYER_H-36;player.vx=player.vy=0;cam.snap=true;updateCamera();
      for(var x=cx-220;x<cx+220;x+=1.4)for(var h=1.3;h<${depth};h+=1.4){
        addLiquidParticle(5,x+(wHash(Math.floor(x*10),Math.floor(h*10),915)-.5)*.4,sy-h,0,0,3);snow.active++;}
      snow.mass=snow.emitted=snow.active;window.passInitial=snow.active;
      window.passX=player.x;window.passDistance=0;window.passGo=false;window.passLast=0;
      window.pinPass=function(t){var dt=passLast?Math.min(.05,(t-passLast)/1000):0;passLast=t;
        var moving=passGo&&passDistance<560;var dx=moving?Math.min(220*dt,560-passDistance):0;passDistance+=dx;passX+=${direction}*dx;
        player.x=passX;player.y=sy-PLAYER_H-36;player.vx=moving?${direction}*220:0;player.vy=0;player.dir=${direction};
        player.onGround=false;keys.ArrowUp=moving;window.passRaf=requestAnimationFrame(pinPass);};window.passRaf=requestAnimationFrame(pinPass);
      window.passStats=function(){liquidToolSync();var lifted=0,high=0,minY=sy,water=0;
        function grain(x,y){minY=Math.min(minY,y);if(y<sy-25)lifted++;if(y<sy-55)high++;}
        for(var i=0;i<liquidCount;i++){if(liquidType[i]===5)grain(liquidX[i],liquidY[i]);else if(liquidType[i]===0)water++;}
        for(var p of snow.grains)if(p.physical)grain(p.x,p.y);
        return {lifted:lifted,high:high,height:sy-minY,distance:passDistance,initial:passInitial,
          accounted:__particleSnow.stats().mass+water+rain.parked.length/2+rain.absorbed};};`);
    await sleep(1800);
    const resting=await game('passStats()');
    check('fresh bed stays settled before the pass',resting.lifted===0&&resting.accounted===resting.initial);
    await game('passGo=true');
    let peak=0, high=0, height=0, samples=[];
    for(let t=0;t<40;t++) {
      await sleep(100);
      const s=await game('passStats()');samples.push(s);
      peak=Math.max(peak,s.lifted);high=Math.max(high,s.high);height=Math.max(height,s.height);
      assert.equal(s.accounted,s.initial,'a low pass conserves every snow and meltwater particle');
      if(t===12||t===20)await screenshot(`snow-fresh-pass-${depth}-${t}`);
      if(s.distance>=560)break;
    }
    console.log('FRESH PASS',{depth,direction,initial:resting.initial,peak,high,height,liftedFraction:peak/resting.initial,samples:samples.map(s=>[Math.round(s.distance),s.lifted])});
    check('a moving pass lifts a plume from fresh snow',peak>resting.initial*.08&&high>5&&height>60);
    await game('cancelAnimationFrame(passRaf);keys.ArrowUp=false');
    await sleep(5000);
    check('pass airflow shuts down',await game('!snowAir.active'));
    const settled=await game('passStats()');
    check('lofted powder settles after the pass',settled.lifted<peak*.15+5);
    assert.equal(settled.accounted,settled.initial,'settling preserves all material');
  }
  if (!process.argv.includes('--passes-only')) {
  await game(`keys.ArrowUp=false;while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
    window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=68;c<99;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    player.x=cx-PLAYER_W/2;player.y=sy-PLAYER_H-45;player.vx=player.vy=0;cam.snap=true;updateCamera();
    for(var x=cx-230;x<cx+230;x+=1.4)for(var h=1.3;h<15;h+=1.4){addLiquidParticle(5,x+(Math.random()-.5)*.4,sy-h,0,0,3);snow.active++;}
    snow.mass=snow.emitted=snow.active;window.initialSnow=snow.active;
    window.jetOn=false;window.jetX=cx-PLAYER_W/2;
    window.pinHover=function(){player.x=jetX;player.y=sy-PLAYER_H-45;player.vx=player.vy=0;player.onGround=false;keys.ArrowUp=jetOn;window.hoverRaf=requestAnimationFrame(pinHover)};pinHover();`);
  await sleep(2500);await screenshot('snow-hover-before');
  await game('jetOn=true');
  let peakLift=0,peakSide=0,airMs=0;
  for(let t=0;t<12;t++){
    await sleep(250);
    const stats=await game(`(function(){liquidToolSync();var lifted=0,side=0,minY=sy;
      for(var i=0;i<liquidCount;i++)if(liquidType[i]===5){minY=Math.min(minY,liquidY[i]);if(liquidY[i]<sy-25)lifted++;if(liquidY[i]<sy-20&&Math.abs(liquidX[i]-cx)>45)side++;}
      for(var p of snow.grains)if(p.physical){minY=Math.min(minY,p.y);if(p.y<sy-25)lifted++;if(p.y<sy-20&&Math.abs(p.x-cx)>45)side++;}
      return {lifted:lifted,side:side,height:sy-minY,snow:__particleSnow.stats().active,melted:snow.melted,air:snowAir.peak,ms:snowAir.ms,div:snowAir.divergenceAfter};})()`);
    peakLift=Math.max(peakLift,stats.lifted);peakSide=Math.max(peakSide,stats.side);airMs=Math.max(airMs,stats.ms);
    console.log('HOVER',t,stats);if(t===3||t===7||t===11)await screenshot('snow-hover-'+t);
  }
  check('hover entrains actual snow beyond the jet core',peakLift>150&&peakSide>100);
  check('powder survives a hover instead of becoming a water blast',await game('__particleSnow.stats().mass>initialSnow*.65'));
  await game('jetX=cx-160');
  for(let t=0;t<18;t++){await game('jetX+=18');await sleep(80);}
  await screenshot('snow-low-pass');await game('jetOn=false');
  await sleep(4500);await screenshot('snow-jet-settled');
  check('airflow idles after the jet stops',await game('!snowAir.active'));
  const totals=await game(`(function(){var water=0;for(var i=0;i<liquidCount;i++)if(liquidType[i]===0)water++;return {initial:initialSnow,accounted:__particleSnow.stats().mass+water+rain.parked.length/2+rain.absorbed};})()`);
  console.log('CONSERVATION',totals,'peak airflow CPU ms',airMs);
  check('jet moves or melts snow without creating or losing its mass',totals.initial===totals.accounted);
  await game('cancelAnimationFrame(hoverRaf)');
  // Keep altitude controlled, but run the real frame loop, jet and renderer.
  // This crosses multiple view widths in both directions at 480 world px/s.
  await game(`while(liquidCount)removeLiquidParticle(liquidCount-1);rainReset(true,true);
    SNOW_RATE=345;weatherForce=4;weatherSetMood(4,true);player.x=2400;player.y=-650;
    player.vx=player.vy=0;cam.snap=true;updateCamera();
    window.flightX=2400;window.flightVX=0;window.flightLast=0;
    window.pinFlight=function(t){var dt=flightLast?Math.min(.05,(t-flightLast)/1000):0;flightLast=t;
      flightX+=flightVX*dt;player.x=flightX;player.y=-650;player.vx=flightVX;player.vy=0;
      player.onGround=false;keys.ArrowUp=true;window.flightRaf=requestAnimationFrame(pinFlight);};
    window.flightRaf=requestAnimationFrame(pinFlight);
    window.flightDensity=function(){return snow.grains.filter(function(p){
      return Math.abs(p.x-player.x-PLAYER_W/2)<180&&Math.abs(p.y-player.y)<140;
    }).length;};`);
  await sleep(4800);
  const overhead=await game(`(function(){var parts=snow.grains.filter(function(p){
    return Math.abs(p.x-player.x-PLAYER_W/2)<180&&p.y>player.y-105&&p.y<player.y-45;
  });return {count:parts.length,vy:parts.reduce(function(sum,p){return sum+p.vy;},0)/Math.max(1,parts.length)};})()`);
  console.log('OVERHEAD FALL',overhead);
  check('flakes keep falling through the top of the jet airflow area',overhead.count>20&&overhead.vy>35);
  await screenshot('snow-overhead-flow');
  const baseline=await game('flightDensity()'), densities=[];
  check('falling snow surrounds the airborne rig',baseline>100);
  for(const direction of [1,-1]) {
    await game(`flightVX=${direction*480}`);
    for(let t=0;t<8;t++) { await sleep(500);densities.push(await game('flightDensity()')); }
    await screenshot(direction>0?'snow-flight-right':'snow-flight-left');
  }
  check('high flight and exhaust never create rain in snow weather',await game(`(function(){liquidToolSync();for(var i=0;i<liquidCount;i++)if(liquidType[i]===0&&liquidOrigin[i]===3&&liquidY[i]<SKY_ROWS*TILE-32)return false;return rain.drops.length===0;})()`));
  await game('cancelAnimationFrame(flightRaf);keys.ArrowUp=false');
  console.log('FLIGHT COVERAGE',{baseline,min:Math.min(...densities),max:Math.max(...densities),stats:await ev('__particleSnow.stats()')});
  check('snow surrounds the rig throughout left and right jet flight',Math.min(...densities)>baseline*.45);
  check('flight streams distant flakes out of the active budget',await game('snow.airCount===0&&snow.recycled>1000&&snow.grains.length<=SNOW_FLAKE_CAP'));
  }
  assert.equal(errors.length,0,'no runtime or GPU validation errors');
  console.log('PASS live hover and low pass; screenshots '+out);
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
