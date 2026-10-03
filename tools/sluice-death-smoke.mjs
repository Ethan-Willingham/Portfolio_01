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
window.__deathSmoke = {
  state: function () { return {version:GAME_VERSION,intro:introPhase,paused:gamePaused,
    over:gameOver,clock:deathPhaseT,money:money,cargo:cargo.length,upgrades:JSON.stringify(upgrades),
    grid:JSON.stringify(world[SKY_ROWS+20]),fuel:player.fuel,hull:player.hull,
    maxFuel:getMaxFuel(),maxHull:getMaxHull(),x:player.x,y:player.y,
    blocked:mobileLandscapeBlocked,keys:keys,touch:touch.active,dpad:dpad}; },
  seed: function (kind, cause) {
    SAVE_DISABLED=true;devMode=false;update=function(){};
    money=8920;displayMoney=money;cargo=[];
    if(kind!=='empty') cargo=[{type:'gold'}, {type:'gold',shiny:true}, 'coal'];
    upgrades.hull=2;depthRecord=184;
    player.x=(townStationCol(0)-4)*TILE;player.y=(SKY_ROWS+183)*TILE;
    player.vx=player.vy=0;cam.snap=true;updateCamera();
    endGame({type:cause||'fall'});
  },
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
    await sleep(450);
  }
  async function alive() {
    for(let i=0;i<600;i++) {
      if(await ev('!SluiceLoading.active() && !__deathSmoke.state().over')) return;
      await sleep(100);
    }
    throw Error('Recovery did not finish loading');
  }
  await seed();
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
  await seed('mixed','magma');
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
  assert.deepEqual(errors, [], 'browser console and runtime errors');
  console.log(`PASS ${checks} recovery checks, no browser errors`);
} finally {
  if(ws) ws.close();
  if(chrome) { chrome.kill(); await new Promise(resolve=> {if(chrome.exitCode!==null) resolve();else {chrome.once('exit',resolve);setTimeout(resolve,2000);} }); }
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
}
