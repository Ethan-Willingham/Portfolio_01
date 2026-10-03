// Run: node tools/sluice-death-smoke.mjs
// Optional DUMP=/tmp/sluice-death saves screenshots outside the repository.
// Owns a disposable Chrome for Testing profile and closes its exact process.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8796), debugPort = port + 1000;
const dump = process.env.DUMP;
if (dump) fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/sluice-death-smoke-');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let chrome, ws, sequence = 0, checks = 0;
// Read-only inspection and deterministic specimen seeding, injected by this
// test server only. No test accessors are added to the production bundle.
const probe = `
var deathWorldTicks = 0;
[updateWeather, updateParticleRain, updateLiquids, updateJello, updateSmoke,
 updateCamera, treesUpdate, surfaceSlimeTick, skySlimeTick].forEach(function(fn) {
  var wrapped=function(){deathWorldTicks++;return fn.apply(this,arguments);};
  if(fn===updateWeather)updateWeather=wrapped;
  else if(fn===updateParticleRain)updateParticleRain=wrapped;
  else if(fn===updateLiquids)updateLiquids=wrapped;
  else if(fn===updateJello)updateJello=wrapped;
  else if(fn===updateSmoke)updateSmoke=wrapped;
  else if(fn===updateCamera)updateCamera=wrapped;
  else if(fn===treesUpdate)treesUpdate=wrapped;
  else if(fn===surfaceSlimeTick)surfaceSlimeTick=wrapped;
  else if(fn===skySlimeTick)skySlimeTick=wrapped;
});
window.__deathSmoke = {
  state: function () { return {version:GAME_VERSION,intro:introPhase,paused:gamePaused,
    over:gameOver,clock:deathPhaseT,money:money,cargo:cargo.length,upgrades:JSON.stringify(upgrades),
    grid:JSON.stringify(world[SKY_ROWS+20]),fuel:player.fuel,hull:player.hull,
    maxFuel:getMaxFuel(),maxHull:getMaxHull(),x:player.x,y:player.y,
    blocked:mobileLandscapeBlocked,keys:keys,touch:touch.active,dpad:dpad,
    worldTicks:deathWorldTicks,tod:timeOfDay,cam:[cam.x,cam.y],
    reveal:deathRevealProgress(),opacity:deathOverlay.style.getPropertyValue('--death-reveal-opacity'),
    burst:deathSequence ? {ready:deathSequence.ready,duration:deathSequence.duration,quiet:deathSequence.quiet,
      lowFlash:deathSequence.lowFlash,pieces:deathSequence.pieces.length,physics:deathSequence.physicsT,
      x:deathSequence.x,y:deathSequence.y} : null}; },
  seed: function (kind, cause) {
    SAVE_DISABLED=true;devMode=false;update=function(){};
    money=8920;displayMoney=money;cargo=[];
    if(kind!=='empty') cargo=[{type:'gold'}, {type:'gold',shiny:true}, 'coal'];
    upgrades.hull=2;depthRecord=184;
    player.x=(townStationCol(0)-4)*TILE;player.y=(SKY_ROWS+183)*TILE;
    player.renderX=player.x;player.renderY=player.y;
    var row=Math.floor(player.y/TILE),col=Math.floor(player.x/TILE);
    for(var r=row-5;r<row+5;r++)for(var c=col-6;c<col+7;c++)world[r][c]=null;
    for(var r=SKY_ROWS-2;r<row;r++)world[r][col]=null;
    terrainChunkCache={};lightingInit();
    player.hull=0;player.vx=player.vy=0;cam.snap=true;updateCamera();
    for(var warm=0;warm<12;warm++)render();
    endGame({type:cause||'fall'});
  },
  preview: function (time) {
    if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;
    if(time<deathSequence.duration)deathOverlay.hidden=true;
    deathSequence.pieces=[];deathSequence.physicsT=0;deathFractureSprite(deathSequence);
    deathPhaseT=time;updateDeathFragments(deathSequence);drawDeathFrame();
  },
  continue: function () {lastTime=performance.now();gameRafId=requestAnimationFrame(loop);},
  release: function () {deathRecover();},
  fee: function () {applyDeathPenalty();},
  pad: function (pressed) {
    gpFindPad=function(){return {connected:true,mapping:'standard',id:'Recovery test',axes:[0,0],
      buttons:Array.from({length:16},function(_,i){return {pressed:i===0&&pressed,value:i===0&&pressed?1:0};})};};
    gpFrame();
  }
};
`;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.woff':'font/woff', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.m4a':'audio/mp4', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(file);
  if (pathname === '/js/sluice.js') {
    const source = data.toString(), end = source.lastIndexOf('})();');
    data = Buffer.from(source.slice(0, end) + probe + source.slice(end));
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(data);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function check(name, expression) {
  assert.ok(await ev(expression), name); checks++; console.log('PASS ' + name);
}
async function key(key, code = key) {
  await send('Input.dispatchKeyEvent', { type:'keyDown', key, code });
  await sleep(90);
  await send('Input.dispatchKeyEvent', { type:'keyUp', key, code });
  await sleep(80);
}
async function click(id) {
  const p = await ev(`(() => { const e=document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', clickCount:1, ...p });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...p });
  await sleep(50);
}
async function size(width, height, mobile = false, deviceScaleFactor = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled:mobile });
  await sleep(120);
}
async function shot(name, clip) {
  if (!dump) return;
  const result = await send('Page.captureScreenshot', { format:'png', ...(clip ? {clip} : {}) });
  fs.writeFileSync(path.join(dump, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function boot() {
  await send('Page.navigate', { url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1` });
  let ready = false;
  for (let i=0; i<150; i++) { if (await ev('!!window.__deathSmoke')) { ready=true; break; } await sleep(100); }
  assert.ok(ready, 'game booted');
  await send('Page.bringToFront');
  if (await ev('__deathSmoke.state().paused')) await click('gm-resume-btn');
  await ev('document.fonts.ready');
  for (let i=0; i<600; i++) { if (await ev('__deathSmoke.state().intro === "done"')) break; await sleep(100); }
  assert.ok(await ev('__deathSmoke.state().intro === "done"'), 'game completed loading');
  if (await ev('__deathSmoke.state().paused')) await click('gm-resume-btn');
}
try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'
  ], { stdio:'ignore' });
  let target;
  for (let i=0; i<80; i++) { try { target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target) break; } catch {} await sleep(100); }
  assert.ok(target, 'Chrome for Testing started');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen=resolve; });
  ws.onmessage = event => {
    const message=JSON.parse(event.data);
    if (message.id) { const item=pending.get(message.id); pending.delete(message.id); if(item) message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    if (message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method==='Runtime.consoleAPICalled' && message.params.type==='error') errors.push(message.params.args);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls:['*googletagmanager.com*','*google-analytics.com*'] });
  await size(1440,900); await boot();
  async function seed(kind='mixed', cause='fall') {
    await ev(`__deathSmoke.seed(${JSON.stringify(kind)},${JSON.stringify(cause)})`);
    await screenReady();
  }
  async function screenReady() {
    for(let i=0;i<60;i++) {
      if(await ev("!document.getElementById('game-death').hidden && !document.getElementById('gm-death-return').disabled")) return;
      await sleep(50);
    }
    throw Error('Death summary did not appear');
  }
  async function alive() {
    for(let i=0;i<600;i++) {
      if(await ev('!SluiceLoading.active() && !__deathSmoke.state().over')) return;
      await sleep(100);
    }
    throw Error('Recovery did not finish loading');
  }
  await ev('__deathSmoke.seed("mixed","fall")');
  for(let i=0;i<30;i++){if(await ev('__deathSmoke.state().burst?.ready'))break;await sleep(10);}
  const impact=await ev('__deathSmoke.state()');
  await check('short explosion precedes the recovery screen', '__deathSmoke.state().burst.ready && __deathSmoke.state().burst.duration<=1 && document.getElementById("game-death").hidden');
  await ev('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}));__deathSmoke.release()');
  await check('recovery input cannot skip the explosion', '__deathSmoke.state().over && document.getElementById("game-death").hidden');
  await sleep(230);
  for(let i=0;i<60;i++){if(await ev('__deathSmoke.state().burst.physics>0'))break;await sleep(20);}
  await check('weather, water, slimes, sun and camera freeze while the rig breaks apart', `(()=>{const s=__deathSmoke.state();return s.worldTicks===${impact.worldTicks} && s.tod===${impact.tod} && JSON.stringify(s.cam)===${JSON.stringify(JSON.stringify(impact.cam))} && s.burst.pieces===7 && s.burst.physics>0;})()`);
  await key('Escape');const paused=await ev('__deathSmoke.state().clock');await sleep(150);
  await check('manual pause freezes the explosion clock', `__deathSmoke.state().paused && __deathSmoke.state().clock===${paused}`);
  await key('Escape');
  // Deterministic review stills use the real production drawing path. Holding
  // the RAF is test-server-only and never adds a production screenshot mode.
  for(const t of [0.04,0.12,0.25,0.48,0.78]) {
    await ev(`__deathSmoke.preview(${t})`);
    await shot(`burst-desktop-${t}`,await ev(`(()=>{const r=document.getElementById('game-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`));
  }
  for(const offset of [0.08,0.18,0.29]) {
    await ev(`__deathSmoke.preview(__deathSmoke.state().burst.duration+${offset})`);
    await shot(`death-reveal-${offset}`,await ev(`(()=>{const r=document.getElementById('game-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`));
  }
  await check('pixelated fade follows the burst with recovery held until readable', `(()=>{const s=__deathSmoke.state(),o=document.getElementById('game-death');return s.reveal>0&&s.reveal<1&&Number(s.opacity)>0&&Number(s.opacity)<1&&!o.hidden&&o.getAttribute('aria-hidden')==='true'&&getComputedStyle(o.querySelector('.death-card')).maskImage.includes('data:image/svg+xml')&&document.getElementById('gm-death-return').disabled;})()`);
  await ev('document.getElementById("gm-death-return").click();__deathSmoke.release();window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))');
  await check('click and keyboard cannot bypass the fade', '__deathSmoke.state().over');
  await key('Escape');const fading=await ev('__deathSmoke.state()');await sleep(150);
  await check('manual pause holds the exact pixel reveal', `__deathSmoke.state().paused && __deathSmoke.state().clock===${fading.clock} && __deathSmoke.state().opacity===${JSON.stringify(fading.opacity)}`);
  await key('Escape');await screenReady();
  await check('fully revealed panel drops its pixel mask and restores access', 'getComputedStyle(document.querySelector(".death-card")).maskImage==="none" && document.getElementById("game-death").getAttribute("aria-hidden")==="false" && __deathSmoke.state().opacity==="1.000"');
  await check('summary appears with one focused action', `!document.getElementById('game-death').hidden &&
    document.querySelectorAll('#game-death button').length===1 && document.activeElement.id==='gm-death-return' &&
    document.getElementById('gm-death-cause').textContent==='Hard landing at 184 m.' &&
    document.getElementById('gm-death-fee').textContent==='$892' && document.getElementById('gm-death-balance').textContent==='$8,028' &&
    document.getElementById('gm-death-cargo').textContent==='$1,205'`);
  await shot('death-desktop',await ev(`(()=>{const r=document.getElementById('game-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`));
  await key('Tab');await key('Tab');await key('Tab');
  await check('Tab stays on recovery', "document.activeElement.id==='gm-death-return'");
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',repeat:true}))");
  await check('held thrust does not recover', '__deathSmoke.state().over');
  await ev("document.getElementById('game-canvas').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:5,clientY:5}))");
  await check('canvas input cannot bypass the action', '__deathSmoke.state().over && !__deathSmoke.state().touch');
  await key('Escape');
  await check('Escape opens ordinary pause', '__deathSmoke.state().paused && document.activeElement.id==="gm-resume-btn"');
  await key('Escape');await sleep(100);
  await check('resume restores recovery focus', '__deathSmoke.state().over && document.activeElement.id==="gm-death-return"');
  const before=await ev('__deathSmoke.state()');
  await ev('__deathSmoke.fee()');await sleep(80);
  await check('autosave penalty cannot change the displayed bill', "document.getElementById('gm-death-fee').textContent==='$892' && document.getElementById('gm-death-balance').textContent==='$8,028' && document.getElementById('gm-death-cargo').textContent!=='Empty hold'");
  await click('gm-death-return');await alive();
  await check('one click recovers with one fee and preserves the mine and upgrades', `(()=>{const s=__deathSmoke.state();return !s.over && s.money===8028 && s.cargo===0 && s.upgrades===${JSON.stringify(before.upgrades)} && s.grid===${JSON.stringify(before.grid)} && s.hull===s.maxHull && s.fuel===s.maxFuel && !s.touch && Object.values(s.keys).every(v=>!v) && document.getElementById('game-death').hidden;})()`);
  for(const shortcut of ['Enter',' ','r']) {
    await seed('empty','fuel');
    await check('empty hold is clear for '+JSON.stringify(shortcut), "document.getElementById('gm-death-cargo').textContent==='Empty hold'");
    await key(shortcut);await alive();
    await check('single shortcut recovers '+JSON.stringify(shortcut), '!__deathSmoke.state().over && __deathSmoke.state().money===8028');
  }
  await seed();
  await ev('__deathSmoke.pad(true)');await sleep(100);
  await check('controller held on connection cannot recover', '__deathSmoke.state().over');
  await ev('__deathSmoke.pad(false);__deathSmoke.pad(true)');await alive();
  await check('fresh controller A press recovers', '!__deathSmoke.state().over && __deathSmoke.state().money===8028');
  await ev('__deathSmoke.pad(true)');
  await check('recovery press cannot spill into thrust', '!__deathSmoke.state().keys[" "]');
  await ev('__deathSmoke.pad(false)');
  await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await size(844,390,true,2);await boot();
  await ev('__deathSmoke.seed("mixed","magma")');await sleep(80);
  await size(390,844,true,2);const stopped=await ev('__deathSmoke.state().clock');await sleep(180);
  await check('portrait freezes the burst before the panel', `__deathSmoke.state().blocked && __deathSmoke.state().clock===${stopped} && document.getElementById("game-death").hidden`);
  await size(844,390,true,2);
  await ev('__deathSmoke.preview(0.2)');await shot('burst-landscape');await ev('__deathSmoke.continue()');
  await ev('__deathSmoke.preview(__deathSmoke.state().burst.duration+0.18)');await shot('death-reveal-landscape');
  await size(390,844,true,2);const pixelStop=await ev('__deathSmoke.state()');await sleep(180);
  await check('portrait freezes the pixel fade', `__deathSmoke.state().blocked && __deathSmoke.state().clock===${pixelStop.clock} && __deathSmoke.state().opacity===${JSON.stringify(pixelStop.opacity)}`);
  await size(844,390,true,2);await screenReady();
  for(const [width,height] of [[844,390],[667,375],[568,320],[1024,600],[844,250]]) {
    await size(width,height,true,2);
    await check(`recovery action fits landscape ${width}x${height}`, `(()=>{const a=document.querySelector('.game-canvas-area').getBoundingClientRect(),c=document.querySelector('.death-card').getBoundingClientRect(),b=document.getElementById('gm-death-return').getBoundingClientRect(),body=document.querySelector('.death-body');return b.width>=44&&b.height>=44&&b.top>=a.top&&b.bottom<=a.bottom&&c.left>=a.left&&c.right<=a.right&&body.clientHeight>0&&document.querySelector('.death-actions').getBoundingClientRect().top>=body.getBoundingClientRect().bottom-1;})()`);
    if(height>=320) await check(`summary fits without scrolling ${width}x${height}`, `(()=>{const b=document.querySelector('.death-body');return b.scrollHeight<=b.clientHeight+1;})()`);
    await shot(`death-landscape-${width}x${height}`,await ev(`(()=>{const r=document.getElementById('game-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`));
  }
  await size(390,844,true,2);
  const frozen=await ev('__deathSmoke.state().clock');await sleep(300);
  await ev("document.getElementById('gm-death-return').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))");
  await check('portrait blocks recovery and freezes the death clock', `__deathSmoke.state().blocked && __deathSmoke.state().over && __deathSmoke.state().clock===${frozen} && !document.getElementById('gm-rotate-screen').hidden && document.getElementById('game-death').inert`);
  await size(844,390,true,2);
  await key('Escape');
  await size(390,844,true,2);await size(844,390,true,2);
  await check('rotation preserves manual pause', '__deathSmoke.state().paused && __deathSmoke.state().over');
  await click('gm-resume-btn');await sleep(100);
  const pos=await ev(`(()=>{const r=document.getElementById('gm-death-return').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pos]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await alive();
  await check('one landscape touch recovers', '!__deathSmoke.state().over && __deathSmoke.state().money===8028 && document.getElementById("game-death").hidden');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await ev('SluiceOptions.set("lowflash","1");__deathSmoke.seed("mixed","bomb")');await sleep(100);
  await check('reduced motion uses a shorter quieter explosion without a bright core', '__deathSmoke.state().burst.quiet && __deathSmoke.state().burst.lowFlash && __deathSmoke.state().burst.duration===0.6');
  await ev('__deathSmoke.preview(0.20)');await shot('burst-reduced-motion');
  await ev('__deathSmoke.preview(__deathSmoke.state().burst.duration+0.06)');
  await check('reduced motion uses a brief plain fade with no pixel breakup', 'Number(__deathSmoke.state().opacity)>0 && Number(__deathSmoke.state().opacity)<1 && getComputedStyle(document.querySelector(".death-card")).maskImage==="none"');
  await ev('__deathSmoke.continue()');await screenReady();
  await check('reduced-motion explosion still leads to recovery', '!document.getElementById("game-death").hidden && document.activeElement.id==="gm-death-return"');
  await click('gm-death-return');await alive();
  await check('recovery releases the frozen frame and fragment resources', '!__deathSmoke.state().burst && !__deathSmoke.state().over');
  await check('new drawing effects are warmed without shader errors', 'window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.death>=0');
  assert.deepEqual(errors, [], 'browser console and runtime errors');
  console.log(`PASS ${checks} recovery checks, no browser errors`);
} finally {
  if(ws) ws.close();
  if(chrome) { chrome.kill(); await new Promise(resolve=> {if(chrome.exitCode!==null) resolve();else {chrome.once('exit',resolve);setTimeout(resolve,2000);} }); }
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
}
