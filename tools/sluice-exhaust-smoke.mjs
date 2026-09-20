// Store exhaust regression. Owns a separate Chrome for Testing process and profile.
// Run: node tools/sluice-exhaust-smoke.mjs. Screenshots stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8786), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-exhaust-');
const out = process.env.DUMP || '/tmp/sluice-exhaust-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    // Start at the final viewport size so first-use allocation checks do
    // not measure an unrelated fullscreen resize after shader warmup.
    if (file === path.join(root, 'grand-motherload.html')) {
      data = Buffer.from(data.toString().replace('<body>', '<body class="gm-fs">'));
    }
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__exhaustTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
  '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], { stdio: 'ignore' });
let ws, seq = 0, mobileControls = false;
const pending = new Map(), errors = [];
function cleanup() {
  try { ws?.close(); } catch {}
  chrome.kill(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const game = source => ev(`__exhaustTest(${JSON.stringify(source)})`);
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }
async function screenshot(name) {
  // The game loop is stopped for deterministic checks. Let transaction
  // feedback settle so repeated test clicks do not overlap in the capture.
  if (name.startsWith('store-')) await game('nsTickParticles(2);nsMoneyShown=displayMoney=money;ukArtPopT=ukDeniedT=0;render()');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function clickHit(id) {
  const point = await game(`(function(){
    render();var hit=UK_HIT.find(function(h){return h.id===${JSON.stringify(id)};});
    if(!hit)return null;
    var r=canvas.getBoundingClientRect();
    return {x:r.left+(hit.x+hit.w/2)*r.width/viewW,y:r.top+(hit.y+hit.h/2)*r.height/viewH};
  })()`);
  assert.ok(point, 'visible store control ' + id);
  if (mobileControls) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  await game('render()');
}
async function openStore() {
  await game("shopState='floor';shopOpen=false;ukCatalogReset();storeLastTab='workshop';storeModalEnsure();ukOpenT=1;render()");
  await clickHit('uk:tab:exhaust');
  check('EXHAUST tab opens through the store pointer handler', await game("ukState.tab==='exhaust'"));
}
async function selectStoreItem(id) {
  const key = await game(`(function(){var item=ukCurItems().find(function(it){return it.key===${JSON.stringify(id)}||it.key==='exhaust:'+${JSON.stringify(id)}||it.key==='exhaust-'+${JSON.stringify(id)};});return item&&item.key;})()`);
  assert.ok(key, 'store item exists for ' + id);
  await game(`(function(){
    var items=ukCurItems(),i=items.findIndex(function(it){return it.key===${JSON.stringify(key)};});
    var L=ukLayoutC;
    var rowH=Math.max(44,Math.round(40*L.us),Math.min(Math.round(54*L.us),Math.floor(L.listH/items.length)));
    ukState.scroll=Math.min(ukState.scrollMax,Math.max(0,i*rowH-L.listH/2));render();
  })()`);
  await clickHit('uk:item:' + key);
  check('store selects ' + id, await game(`ukSelectedItem().key===${JSON.stringify(key)}`));
}

try {
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
      endpoint = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(endpoint, 'testing browser started');
  ws = new WebSocket(endpoint);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p?.reject(m.error) : p?.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __exhaustTest==='function' && __exhaustTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('normal game boots with exhaust catalog', await game("introPhase==='done' && typeof rigExhaustPurchase==='function' && SmokeFluid.isReady()"));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await sleep(500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;rigExhaustReset();');
  const catalog = await game('RIG_EXHAUST_CATALOG');
  const paid = catalog.filter(item => item.price > 0), stock = catalog.find(item => item.price === 0);
  const rainbow = catalog.find(item => item.id === 'prismatic');
  const velvet = catalog.find(item => item.id === 'velvet-rope');
  check('catalog contains stock, six chosen exports and premium rainbow', catalog.length === 8 && new Set(catalog.map(p => p.id)).size === 8 && paid.length === 7 && !!stock && !!velvet);
  check('Prismatic is strictly the most expensive exhaust', !!rainbow && paid.every(p => p.id === rainbow.id || rainbow.price > p.price));
  check('new game starts with free stock exhaust only', await game(`rigExhaustState.equipped===${JSON.stringify(stock.id)}&&rigExhaustIsOwned(${JSON.stringify(stock.id)})&&RIG_EXHAUST_CATALOG.every(function(p){return !p.price||!rigExhaustIsOwned(p.id);})`));
  for (const item of paid.filter(item => item.id !== rainbow.id)) {
    const fixtureFile = path.join(root, 'tools/fixtures/smoke', item.id + '.json');
    assert.ok(fs.existsSync(fixtureFile), 'recorded export fixture ' + item.id);
    const saved = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
    assert.deepEqual(item.recipe.source, saved.preset.source, item.id + ' exported source');
    if (item.id === velvet.id) {
      for (const [key, value] of Object.entries(saved.preset.fluid)) {
        assert.deepEqual(item.recipe.fluid[key], value, item.id + ' original fluid ' + key);
      }
      const added = Object.keys(item.recipe.fluid).filter(key => !Object.hasOwn(saved.preset.fluid, key)).sort();
      assert.deepEqual(added, ['OPTICAL_ABSORPTION', 'OPTICAL_BRIGHTNESS'], 'Velvet adds only display controls');
      assert.equal(item.recipe.fluid.OPTICAL_BRIGHTNESS, .64, 'Velvet optical color value');
      assert.equal(item.recipe.fluid.OPTICAL_ABSORPTION, 3.2, 'Velvet optical absorption');
    } else assert.deepEqual(item.recipe.fluid, saved.preset.fluid, item.id + ' exported fluid');
    assert.deepEqual(item.tuning, saved.tuning, item.id + ' exported tuning');
    assert.deepEqual(item.scale, saved.scale, item.id + ' exported scale');
    assert.deepEqual(item.physics, saved.physics || { HEAT: 0, COOLING: 1, BUOYANCY: 0, WEIGHT: 0, VISCOSITY: 0, EDGE_SPIN: 0 }, item.id + ' exported physics');
    if (item.id !== velvet.id) {
      assert.deepEqual(item.recipe.palette, saved.preset.palette, item.id + ' exported palette');
      assert.deepEqual(item.recipe.colors, saved.preset.colors, item.id + ' exported colors');
    }
  }
  check('chosen exported motion, scale and material settings are preserved', true);
  check('Velvet Rope palette is saturated crimson', velvet.recipe.palette.every(c => c[0] > c[1] * 2.5 && c[0] > c[2] * 1.25));

  const first = paid.find(item => item.id !== rainbow.id);
  check('unowned and unknown exhaust cannot be equipped', await game(`!rigExhaustSelect(${JSON.stringify(first.id)})&&!rigExhaustSelect('unknown-exhaust')&&rigExhaustState.equipped===${JSON.stringify(stock.id)}`));
  check('invalid purchase cannot change money or ownership', await game(`(function(){money=4321;var state=JSON.stringify(rigExhaustSave());var result=rigExhaustPurchase('unknown-exhaust');return !result.ok&&money===4321&&JSON.stringify(rigExhaustSave())===state;})()`));
  check('insufficient funds cannot purchase', await game(`(function(){money=${first.price - 1};var result=rigExhaustPurchase(${JSON.stringify(first.id)});return !result.ok&&money===${first.price - 1}&&!rigExhaustIsOwned(${JSON.stringify(first.id)});})()`));

  await game(`money=${first.price - 1}`);
  await openStore(); await selectStoreItem(first.id);
  check('store action disables purchase when short of money', await game('!ukSelectedItem().act.enabled'));
  await clickHit('uk:act');
  check('disabled store action cannot charge or equip', await game(`money===${first.price - 1}&&!rigExhaustIsOwned(${JSON.stringify(first.id)})`));
  await game(`money=${first.price + 123};ukRebuildItems();render()`);
  await game(`(function(){
    var gl=rigExhaustContext,methods=['createTexture','createFramebuffer','createBuffer','createShader','createProgram'];
    var probe=window.__firstExhaustAllocation={gl:gl,original:{},calls:{},canvas:rigExhaustCanvas,world:world,player:player};
    methods.forEach(function(key){probe.calls[key]=0;probe.original[key]=gl[key];gl[key]=function(){probe.calls[key]++;return probe.original[key].apply(gl,arguments);};});
  })()`);
  await clickHit('uk:act');
  check('store purchase charges exactly once and equips immediately', await game(`money===123&&rigExhaustIsOwned(${JSON.stringify(first.id)})&&rigExhaustState.equipped===${JSON.stringify(first.id)}`));
  const firstPurchase = await game(`(function(){var p=window.__firstExhaustAllocation;return {calls:Object.assign({},p.calls),sameWorld:world===p.world&&player===p.player,sameCanvas:rigExhaustCanvas===p.canvas};})()`);
  const firstFrame = await game(`(function(){
    var p=window.__firstExhaustAllocation;
    try{updateSmoke(1/30);render();return {calls:Object.assign({},p.calls),sameWorld:world===p.world&&player===p.player,sameCanvas:rigExhaustCanvas===p.canvas};}
    finally{Object.keys(p.original).forEach(function(key){p.gl[key]=p.original[key];});delete window.__firstExhaustAllocation;}
  })()`);
  console.log('FIRST PURCHASE', firstPurchase, 'FIRST FRAME', firstFrame);
  check('first purchase uses its prewarmed GPU material without rebuilding the game', firstPurchase.sameCanvas && firstPurchase.sameWorld && Object.values(firstPurchase.calls).every(n => n === 0));
  check('first exhaust frame uses prewarmed GPU resources', firstFrame.sameCanvas && firstFrame.sameWorld && Object.values(firstFrame.calls).every(n => n === 0));
  check('repeated purchase does not charge an owned item', await game(`(function(){rigExhaustPurchase(${JSON.stringify(first.id)});return money===123;})()`));
  await selectStoreItem(stock.id); await clickHit('uk:act');
  check('stock exhaust can be re-equipped for free', await game(`rigExhaustState.equipped===${JSON.stringify(stock.id)}&&money===123`));
  await selectStoreItem(first.id); await clickHit('uk:act');
  check('owned store selection equips without another charge', await game(`rigExhaustState.equipped===${JSON.stringify(first.id)}&&money===123`));
  await screenshot('store-desktop');

  check('save output does not alias live ownership', await game(`(function(){var data=rigExhaustSave();data.owned.length=0;data.equipped='unknown';return rigExhaustIsOwned(${JSON.stringify(first.id)})&&rigExhaustState.equipped===${JSON.stringify(first.id)};})()`));
  check('missing legacy exhaust state restores safe stock defaults', await game(`(function(){rigExhaustLoad();return rigExhaustState.equipped===${JSON.stringify(stock.id)}&&rigExhaustIsOwned(${JSON.stringify(stock.id)})&&!rigExhaustIsOwned(${JSON.stringify(first.id)});})()`));
  check('unknown, duplicate and unowned equipped IDs are sanitized', await game(`(function(){
    rigExhaustLoad({owned:[${JSON.stringify(stock.id)},${JSON.stringify(first.id)},${JSON.stringify(first.id)},'unknown-exhaust',null],equipped:${JSON.stringify(rainbow.id)}});
    var saved=rigExhaustSave();return saved.owned.length===2&&saved.owned.indexOf('unknown-exhaust')<0&&saved.equipped===${JSON.stringify(stock.id)};
  })()`));
  check('purchase state survives a full game save round trip', await game(`(function(){
    money=${rainbow.price + 222};rigExhaustPurchase(${JSON.stringify(rainbow.id)});
    var before=JSON.stringify(rigExhaustSave()),saved=JSON.parse(JSON.stringify(saveBuild()));
    rigExhaustReset();money=0;saveApply(saved);
    return JSON.stringify(rigExhaustSave())===before&&money===222&&rigExhaustState.equipped===${JSON.stringify(rainbow.id)};
  })()`));
  check('free equip immediately persists the choice in the real save slots', await game(`(function(){
    var disabled=SAVE_DISABLED;SAVE_DISABLED=false;
    try{rigExhaustSelect(${JSON.stringify(stock.id)});var saved=saveLoadEnvelope();
      if(!saved||saved.profile.rigExhaust.equipped!==${JSON.stringify(stock.id)})return false;
      rigExhaustSelect(${JSON.stringify(rainbow.id)});saved=saveLoadEnvelope();
      return saved.profile.rigExhaust.equipped===${JSON.stringify(rainbow.id)}&&saved.profile.rigExhaust.owned.indexOf(${JSON.stringify(rainbow.id)})>=0;
    }finally{SAVE_DISABLED=disabled;}
  })()`));
  check('death recovery keeps purchased exhaust and equipped choice', await game(`(function(){var before=JSON.stringify(rigExhaustSave());gameOver=true;respawnFromDeath();return !gameOver&&JSON.stringify(rigExhaustSave())===before;})()`));
  await game("shopState='closed';shopOpen=false;ukCatalogReset();introPhase='done';if(window.SluiceLoading)window.SluiceLoading.finish(function(){});");

  // The real engine emits the chosen source into its own fluid domain. A
  // preset switch must leave both worlds and every GPU allocation intact.
  await game(`money=10000000;RIG_EXHAUST_CATALOG.forEach(function(p){rigExhaustPurchase(p.id);});rigExhaustSelect(${JSON.stringify(velvet.id)});`);
  await game(`(async function(){
    player.x=(DECK_LEFT_COL-4)*TILE;player.y=SKY_ROWS*TILE-PLAYER_H;
    player.renderX=player.x;player.renderY=player.y;player.vx=0;player.vy=0;cam.snap=true;updateCamera();
    for(var n=0;n<150;n++){updateSmoke(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}render();
  })()`);
  check('rig exhaust uses a separate live fluid from world smoke', await game('rigExhaustFluid&&rigExhaustFluid.isReady()&&rigExhaustFluid!==SmokeFluid&&rigExhaustCanvas!==SmokeFluid.getCanvas()'));
  const crimson = await game(`(function(){
    rigExhaustFluid.displayPass();var gl=rigExhaustCanvas.getContext('webgl2')||rigExhaustCanvas.getContext('webgl');
    var pixels=new Uint8Array(rigExhaustCanvas.width*rigExhaustCanvas.height*4);gl.readPixels(0,0,rigExhaustCanvas.width,rigExhaustCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    var lit=0,red=0,white=0,opaque=0,peakRGB=0,peakAlpha=0;
    for(var i=0;i<pixels.length;i+=4){if(pixels[i+3]>8){lit++;if(pixels[i]>pixels[i+1]*2&&pixels[i]>pixels[i+2]*1.2)red++;if(Math.min(pixels[i],pixels[i+1],pixels[i+2])>230)white++;
      peakRGB=Math.max(peakRGB,pixels[i],pixels[i+1],pixels[i+2]);peakAlpha=Math.max(peakAlpha,pixels[i+3]);if(pixels[i+3]>128)opaque++;}}
    return {lit:lit,red:red,white:white,opaque:opaque,peakRGB:peakRGB/255,peakAlpha:peakAlpha/255,error:gl.getError()};
  })()`);
  console.log('CRIMSON', crimson);
  check('actual Velvet Rope fluid is deep crimson with useful opacity', crimson.lit > 100 && crimson.red > crimson.lit * .8 && crimson.white === 0 && crimson.peakRGB > .55 && crimson.peakRGB <= .66 && crimson.opaque > 100 && crimson.peakAlpha > .6 && crimson.error === 0);
  await screenshot('velvet-rope');
  check('equipping preserves existing fluid, GPU resources, world and player', await game(`(function(){
    var oldWorld=world,oldPlayer=player,oldCanvas=rigExhaustCanvas,ambient=JSON.stringify(SmokeFluid.getPhysics());
    var gl=rigExhaustCanvas.getContext('webgl2')||rigExhaustCanvas.getContext('webgl'),allocations=0,clears=0,original={};
    ['createTexture','createFramebuffer','createProgram'].forEach(function(k){original[k]=gl[k];gl[k]=function(){allocations++;return original[k].apply(gl,arguments);};});
    var oldClear=rigExhaustFluid.clear;rigExhaustFluid.clear=function(){clears++;return oldClear.apply(this,arguments);};
    function read(){var optical=rigExhaustFluid.config.OPTICAL_DENSITY;rigExhaustFluid.config.OPTICAL_DENSITY=0;rigExhaustFluid.displayPass();rigExhaustFluid.config.OPTICAL_DENSITY=optical;var bytes=new Uint8Array(rigExhaustCanvas.width*rigExhaustCanvas.height*4);gl.readPixels(0,0,rigExhaustCanvas.width,rigExhaustCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
    var before=read(),preserved=true;
    try{
      RIG_EXHAUST_CATALOG.forEach(function(p){rigExhaustSelect(p.id);var after=read();preserved=preserved&&before.every(function(v,i){return v===after[i];});});
      return preserved&&allocations===0&&clears===0&&world===oldWorld&&player===oldPlayer&&rigExhaustCanvas===oldCanvas&&JSON.stringify(SmokeFluid.getPhysics())===ambient;
    }finally{Object.keys(original).forEach(function(k){gl[k]=original[k];});rigExhaustFluid.clear=oldClear;}
  })()`));
  await game(`(async function(){rigExhaustSelect(${JSON.stringify(rainbow.id)});rigExhaustFluid.clear();for(var n=0;n<330;n++){updateSmoke(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}render();})()`);
  const rainbowStats = await game(`(function(){
    rigExhaustFluid.displayPass();var gl=rigExhaustCanvas.getContext('webgl2')||rigExhaustCanvas.getContext('webgl');
    var pixels=new Uint8Array(rigExhaustCanvas.width*rigExhaustCanvas.height*4);gl.readPixels(0,0,rigExhaustCanvas.width,rigExhaustCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    var lit=0,hues=[0,0,0];for(var i=0;i<pixels.length;i+=4){if(pixels[i+3]>8){lit++;var max=Math.max(pixels[i],pixels[i+1],pixels[i+2]),min=Math.min(pixels[i],pixels[i+1],pixels[i+2]);if(max-min>20)hues[[pixels[i],pixels[i+1],pixels[i+2]].indexOf(max)]++;}}
    return {lit:lit,hues:hues,error:gl.getError()};
  })()`);
  console.log('PRISMATIC', rainbowStats);
  check('premium rainbow produces several saturated fluid hues', rainbowStats.lit > 100 && rainbowStats.hues.filter(n => n > 20).length >= 3 && rainbowStats.error === 0);
  await screenshot('prismatic');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  mobileControls = true;
  await sleep(300); await game('resize();render()');
  await openStore(); await selectStoreItem(rainbow.id); await screenshot('store-phone');
  check('phone store fits its viewport with a reachable equip action', await game(`(function(){var h=UK_HIT.find(function(h){return h.id==='uk:act';});var L=ukLayoutC;return h&&h.x>=0&&h.y>=0&&h.x+h.w<=viewW+1&&h.y+h.h<=viewH+1&&L.x>=0&&L.x+L.w<=viewW+1;})()`));
  await selectStoreItem(stock.id); await clickHit('uk:act');
  check('phone can switch back to stock without purchase', await game(`rigExhaustState.equipped===${JSON.stringify(stock.id)}`));
  check('new game clears purchased cosmetics and returns to stock', await game(`(function(){saveWipe();init();return rigExhaustState.equipped===${JSON.stringify(stock.id)}&&RIG_EXHAUST_CATALOG.every(function(p){return !p.price||!rigExhaustIsOwned(p.id);});})()`));
  check('no browser exceptions or console errors', errors.length === 0);
  console.log('Screenshots: ' + out);
} finally {
  if (errors.length) console.error(JSON.stringify(errors));
  cleanup();
}
