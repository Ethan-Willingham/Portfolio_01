// Run: node tools/sluice-menu-smoke.mjs
// Optional DUMP=/tmp/sluice-menus saves screenshots outside the repository.
// Owns a disposable Chrome for Testing profile and closes its exact process.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8794), debugPort = port + 1000;
const dump = process.env.DUMP;
if (dump) fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/sluice-menu-smoke-');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let chrome, ws, sequence = 0, checks = 0;
// Read-only inspection and deterministic specimen seeding, injected by this
// test server only. No test accessors are added to the production bundle.
const probe = `
window.__menuSmoke = {
  state: function () { return { version: GAME_VERSION, intro: introPhase,
    paused: gamePaused, page: pauseMenuPage, ledger: ledgerOpen,
    shop: shopState, wheel: itemWheel.open, wheelRect: itemWheelButtonRect(),
    width: viewW, height: viewH, modal: ukModal ? ukModal.id : null,
    money: money, x: player.x, y: player.y }; },
  seedConsole: function (scenario) {
    update = function () {};
    introPhase = 'done';
    player.vx = player.vy = 0; speedoMphSmooth = 0;
    player.y = SKY_ROWS * TILE; player.fuel = maxFuel; player.hull = getMaxHull();
    cargo = []; reserveFuel = 0; money = displayMoney = 1250;
    saveLastOk = true; saveLastWallMs = 0; saveLampT = saveLampFailT = 0;
    _ftsTime = performance.now() + 1e9; _ftsValue = 0;
    if (scenario === 'working') {
      player.y += 182 * TILE; player.fuel = maxFuel * 0.72; player.hull = getMaxHull() * 0.86;
      reserveFuel = 2; _ftsValue = maxFuel * 0.18;
      cargo = [{type:'coal',shiny:false},{type:'gold',shiny:false}]; money = displayMoney = 18250;
    }
    if (scenario === 'critical') {
      player.y += 380 * TILE; player.fuel = maxFuel * 0.09; player.hull = getMaxHull() * 0.18;
      reserveFuel = 4; _ftsValue = maxFuel * 1.12;
      cargo = [{type:'unobtanium',shiny:true}]; money = displayMoney = 12345678;
      saveLastOk = false;
    }
    consoleBaySigs = []; consoleInstKey = '';
  },
  consoleInfo: function () { return { rect: consoleRect(), layout: consoleBayLayout, height: consoleHeight(), mobile: isMobile, dpad: {x:DPAD_CX,y:DPAD_CY,r:DPAD_SIZE*0.91},
    used: cargoUsed(), capacity: maxCargo, fuel: consoleFuelReading(), save: consoleSaveState(),
    signatures: CONSOLE_BAYS.map(function (bay) {return consoleBaySig(bay.id);}) }; },
  consoleScan: function () {
    var oldCtx = ctx, oldText = consoleText, bounds = [], current;
    var scratch = document.createElement('canvas'); scratch.width=canvas.width; scratch.height=canvas.height;
    ctx = scratch.getContext('2d');
    consoleText = function (text, x, y, size, color, align, bold) {
      oldText(text, x, y, size, color, align, bold);
      var width = ctx.measureText(text).width;
      bounds.push({ text:text, size:size, color:color, left:align==='right'?x-width:x,
        right:align==='right'?x:x+width, bottom:y, bay:current });
    };
    try { consoleBayLayout.forEach(function (cell) {current=cell; drawConsoleInstrument(cell.bay,cell.bx,cell.by,cell.bw,cell.bh);}); }
    finally {ctx=oldCtx;consoleText=oldText;}
    return bounds;
  },
  resetConsole: function () { SAVE_DISABLED=true;localStorage.removeItem(SAVE_KEY_A);localStorage.removeItem(SAVE_KEY_B); },
  upgradeCargo: function () { maxCargo += 4; },
  consolePaint: function (cached) {
    var old=PERF_CONSOLE_CACHE,oldCtx=ctx;
    var scratch=document.createElement('canvas');scratch.width=canvas.width;scratch.height=canvas.height;
    ctx=scratch.getContext('2d'); PERF_CONSOLE_CACHE=cached;
    try {drawConsole();} finally {PERF_CONSOLE_CACHE=old;ctx=oldCtx;}
    var y=Math.round((viewH-consoleHeight())*dpr);
    var pixels=scratch.getContext('2d').getImageData(0,y,canvas.width,canvas.height-y).data;
    var hash=0,maxDiff=0,changed=0,large=0;
    for(var i=0;i<pixels.length;i++) {
      hash=(hash*31+pixels[i])|0;
      if(this.pixels) {var d=Math.abs(pixels[i]-this.pixels[i]);maxDiff=Math.max(maxDiff,d);if(d)changed++;if(d>4)large++;}
    }
    this.pixels=pixels;
    return {hash:hash,maxDiff:maxDiff,changed:changed,large:large,total:pixels.length};
  },
  seedLedger: function () { ledgerOreList().forEach(function (ore) { ledgerRecordOre(ore, false); }); },
  parkAtShop: function () { player.x = nearestTownStationCol() * TILE + TILE / 2 - PLAYER_W / 2; player.y = DECK_ROW * TILE - PLAYER_H; player.vx = player.vy = 0; player.onGround = true; },
  ledger: function () { return { page: ledgerPage, layout: ledgerLayout(), count: ledgerOreList().length }; },
  catalog: function () { return { hit: UK_HIT, layout: ukLayoutC, depth: ukStackDepth(), tab: ukState.tab, selected: ukCurSel() }; },
  stockWheel: function () { teleporters=2; bombsSmall=5; bombsLarge=1; balloons=3; }
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
async function canvasClick(expression, touch = false) {
  const p=await ev(`(() => {const r=(${expression}), c=document.getElementById('game-canvas').getBoundingClientRect();return {x:c.x+r.x+r.w/2,y:c.y+r.y+r.h/2};})()`);
  if(touch) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
  }
  await sleep(250);
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
  await send('Page.navigate', { url:`http://127.0.0.1:${port}/grand-motherload.html` });
  let ready = false;
  for (let i=0; i<150; i++) { if (await ev('!!window.__menuSmoke')) { ready=true; break; } await sleep(100); }
  assert.ok(ready, 'game booted');
  await send('Page.bringToFront');
  if (await ev('__menuSmoke.state().paused')) await click('gm-resume-btn');
  await ev('document.fonts.ready');
  for (let i=0; i<100; i++) { if (await ev('__menuSmoke.state().intro === "done"')) break; await sleep(100); }
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
  for (const [width,height,mobile] of [[1440,900,false],[390,844,true],[320,568,true],[568,320,true],[844,390,true],[768,1024,true],[1920,1080,false]]) {
    await size(width,height,mobile);
    for (const scenario of ['working','critical']) {
      await ev(`__menuSmoke.seedConsole('${scenario}')`); await sleep(100);
      await check(`console text fits ${scenario} ${width}x${height}`, `__menuSmoke.consoleScan().every(t=>t.size>=11 && t.left>=t.bay.bx-1 && t.right<=t.bay.bx+t.bay.bw+1 && t.bottom<=t.bay.by+t.bay.bh)`);
      await check(`console stays inside ${width}x${height}`, `(() => {const c=__menuSmoke.consoleInfo(),r=c.rect;return c.layout.length===6 && c.layout.every(b=>b.bx*r.scale>=0 && (b.bx+b.bw)*r.scale<=__menuSmoke.state().width && b.by>=r.y && b.by+b.bh<=r.viewH) && Math.abs(r.h*r.scale-c.height)<1;})()`);
      await shot(`console-${scenario}-${width}x${height}`);
    }
  }
  await check('oversized ore counts weighted slots', '__menuSmoke.consoleInfo().used === 8 && __menuSmoke.consoleInfo().capacity === 5');
  await check('return shortfall and expired save failure remain clear', '__menuSmoke.consoleInfo().fuel.shortfall && __menuSmoke.consoleInfo().fuel.homePercent === 113 && __menuSmoke.consoleInfo().save === "failed"');
  const oldCargo = await ev('__menuSmoke.consoleInfo().signatures[2]');
  const oldPixels = await ev('__menuSmoke.consolePaint(true)');
  await ev('__menuSmoke.upgradeCargo()');
  await check('capacity upgrades invalidate cargo reading', `__menuSmoke.consoleInfo().signatures[2] !== ${JSON.stringify(oldCargo)}`);
  const newPixels = await ev('__menuSmoke.consolePaint(true)');
  assert.notEqual(oldPixels.hash,newPixels.hash,'capacity upgrade repaints cached pixels');
  const parity=await ev('__menuSmoke.consolePaint(false)');console.log('Console cache comparison',JSON.stringify(parity));
  assert.ok(parity.maxDiff <= 1,'cached and direct console agree within compositing rounding');
  await ev('__menuSmoke.resetConsole()');
  await size(1440,900); await boot();
  await sleep(600); await shot('console-live-desktop');
  await shot('console-detail',await ev('(() => {const r=document.getElementById("game-canvas").getBoundingClientRect(),h=__menuSmoke.consoleInfo().height;return {x:r.x,y:r.bottom-h,width:r.width,height:h,scale:2};})()'));
  await click('gm-pause-btn');
  await check('pause dialog and focus', '__menuSmoke.state().paused && document.activeElement.id === "gm-resume-btn"');
  await shot('pause-desktop');
  await click('gm-options-btn'); await shot('options-desktop');
  await ev('document.getElementById("gm-vol").focus()'); await key('ArrowRight');
  await check('native slider arrows apply and persist', 'document.getElementById("gm-vol-value").value === "61%" && localStorage.getItem("sluice.volume") === "0.61"');
  await click('gm-gfx-bal'); await click('gm-dmgflash-off'); await click('gm-lowflash-on');
  await check('selected settings apply', 'SluiceOptions.damageFlash === false && SluiceOptions.lowFlash === true && gm.get("weather.lightning") === 0 && document.getElementById("gm-gfx-bal").getAttribute("aria-pressed") === "true"');
  await key('Escape');
  await check('Escape backs out and restores focus', '__menuSmoke.state().paused && __menuSmoke.state().page === "main" && document.activeElement.id === "gm-options-btn"');
  await click('gm-controls-btn'); await shot('controls-desktop'); await key('Escape');
  await ev('document.getElementById("gm-new-game-btn").focus()'); await key('Tab');
  await check('Tab stays in menu', 'document.activeElement.id === "gm-resume-btn"');
  await ev('__sluiceSave._test.addMoney(12345); __sluiceSave.now()');
  const savedMoney = await ev('__menuSmoke.state().money');
  await click('gm-new-game-btn'); await shot('new-game-confirmation');
  await check('new game starts with safe focus', 'document.activeElement.id === "gm-cancel-restart"');
  await key('Escape');
  await check('cancel preserves progress', `__menuSmoke.state().money === ${savedMoney}`);
  await key('Escape'); await check('resume gives gameplay keyboard focus', "document.activeElement.id === 'game-canvas'"); await boot(); await click('gm-pause-btn'); await click('gm-options-btn');
  await check('save and settings survive reload', `__menuSmoke.state().money === ${savedMoney} && document.getElementById('gm-vol').value === '61' && document.getElementById('gm-gfx-bal').getAttribute('aria-pressed') === 'true' && !SluiceOptions.damageFlash && SluiceOptions.lowFlash`);
  for (const [width,height,mobile] of [[390,844,true],[320,568,true],[844,390,true],[768,1024,true],[1920,1080,false]]) {
    await size(width,height,mobile);
    await check(`menu fits ${width}x${height}`, `(() => {const a=document.getElementById('game-pause').getBoundingClientRect(),c=document.getElementById('gm-pause-card').getBoundingClientRect(),b=document.getElementById('gm-opt-back').getBoundingClientRect();return c.left>=a.left && c.right<=a.right && c.top>=a.top && c.bottom<=a.bottom && b.bottom<=a.bottom && document.querySelector('.pause-body').scrollWidth<=document.querySelector('.pause-body').clientWidth;})()`);
    await shot(`options-${width}x${height}`);
  }
  await size(390,844,true);
  await ev('document.querySelector(".pause-body").scrollTop=0');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:640}]});
  for(let y=610;y>=300;y-=30){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});await sleep(20);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
  await check('touch scroll reaches lower settings', `(() => {const b=document.querySelector('.pause-body'); return b.scrollTop > 0 && b.scrollTop >= b.scrollHeight-b.clientHeight-2;})()`);
  await key('Escape'); await click('gm-new-game-btn'); await click('gm-restart-btn');
  await check('explicit confirmation resets run only', `!__menuSmoke.state().paused && __menuSmoke.state().money < ${savedMoney} && localStorage.getItem('sluice.opt.gfx') === 'balanced'`);
  await size(1440,900); await sleep(1500);
  await key('c','KeyC'); await shot('ledger-desktop');
  await check('ledger opens', '__menuSmoke.state().ledger');
  await key('Escape'); await check('ledger Escape closes without pause', '!__menuSmoke.state().ledger && !__menuSmoke.state().paused');
  await ev('__menuSmoke.parkAtShop()'); await key('Enter'); await sleep(500); await shot('shop-desktop');
  await check('shop opens', '__menuSmoke.state().shop !== "closed"');
  await size(390,844,true); await sleep(200); await shot('shop-mobile');
  await canvasClick("__menuSmoke.catalog().hit.find(r=>r.id==='uk:child')",true);
  await check('touch opens drill tiers', '__menuSmoke.catalog().depth === 1');await shot('shop-tiers-mobile');
  await canvasClick("__menuSmoke.catalog().hit.find(r=>r.id==='uk:back')",true);
  await check('touch returns to shop root', '__menuSmoke.catalog().depth === 0');
  await canvasClick("__menuSmoke.catalog().hit.find(r=>r.id==='uk:tab:shelf')",true);
  await check('touch switches shop tabs', '__menuSmoke.catalog().tab === "shelf"');await shot('shop-supplies-mobile');
  await ev('__sluiceSave._test.addMoney(100000)');await sleep(100);
  const beforeBuy=await ev('__menuSmoke.state().money');
  await canvasClick("__menuSmoke.catalog().hit.find(r=>r.id==='uk:act')",true);
  await check('shop purchase still applies', `__menuSmoke.state().money < ${beforeBuy}`);
  await size(568,320,true);await sleep(150);await shot('shop-short-landscape');
  await check('short landscape keeps actions inside panel', `(() => {const c=__menuSmoke.catalog(),a=c.hit.find(r=>r.id==='uk:act'),L=c.layout;return a.h>=44 && a.y>=L.y && a.y+a.h<=L.y+L.h;})()`);

  await size(844,390,true); await sleep(200); await shot('shop-landscape');
  await key('Escape'); await sleep(400);
  await size(390,844,true); await ev('__menuSmoke.seedLedger()'); await key('c','KeyC'); await shot('ledger-mobile');
  const position=await ev('__menuSmoke.state()');
  await canvasClick('__menuSmoke.ledger().layout.next',true);
  await check('ledger touch pages forward', '__menuSmoke.ledger().page === 1');
  await key('End');await shot('ledger-last-page-mobile');
  await check('ledger reaches final specimens', '__menuSmoke.ledger().page === __menuSmoke.ledger().layout.pages-1');
  await key('Home');
  await check('ledger blocks movement', `__menuSmoke.state().x === ${position.x} && __menuSmoke.state().y === ${position.y}`);
  await size(844,390,true);await shot('ledger-landscape');
  await canvasClick('__menuSmoke.ledger().layout.close',true);
  await check('ledger touch closes', '!__menuSmoke.state().ledger');
  await key('c','KeyC');

  await key('Escape'); await size(1440,900); await key('q','KeyQ');
  // Q is hold-to-use, so capture during its keydown rather than after release.
  await ev('__menuSmoke.stockWheel()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'q',code:'KeyQ'});await sleep(200);await shot('item-wheel');
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'q',code:'KeyQ'});
  await send('Emulation.setUserAgentOverride', { userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  await size(390,844,true,3); await boot();
  await check('mobile controls boot', '__menuSmoke.consoleInfo().mobile');
  await shot('console-live-phone');
  for (const [width,height] of [[390,844],[320,568],[844,390],[568,320]]) {
    await size(width,height,true,2);
    for(const scenario of ['empty','critical']) {
      await ev(`__menuSmoke.seedConsole('${scenario}')`); await sleep(100);
      await check(`mobile console fits ${scenario} ${width}x${height}`, `(() => {const c=document.getElementById('game-canvas').getBoundingClientRect();const ui=__menuSmoke.consoleInfo();return c.bottom<=innerHeight && ui.dpad.y-ui.dpad.r>=0 && ui.dpad.y+ui.dpad.r<=ui.rect.y*ui.rect.scale && __menuSmoke.consoleScan().every(t=>t.size>=11 && t.left>=t.bay.bx-1 && t.right<=t.bay.bx+t.bay.bw+1 && t.bottom<=t.bay.by+t.bay.bh);})()`);
      await shot(`console-touch-${scenario}-${width}x${height}`);
    }
  }
  await click('gm-fullscreen-btn'); await sleep(400);
  await check('fullscreen console stays visible', 'document.body.classList.contains("gm-fs") && document.getElementById("game-canvas").getBoundingClientRect().bottom<=innerHeight');
  await shot('console-fullscreen-phone');
  assert.deepEqual(errors, [], 'browser console and runtime errors');
  console.log(`PASS ${checks} menu checks, no browser errors`);
} finally {
  if(ws) ws.close();
  if(chrome) { chrome.kill(); await new Promise(resolve=> {if(chrome.exitCode!==null) resolve();else {chrome.once('exit',resolve);setTimeout(resolve,2000);} }); }
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
}
