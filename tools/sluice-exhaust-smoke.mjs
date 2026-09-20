// Store, live exhaust settings and material regression. Owns its testing browser.
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
async function key(key, code = key) {
  const windowsVirtualKeyCode = { Enter: 13, Escape: 27, ArrowRight: 39, Tab: 9 }[key] || 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode,
    ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
}
async function clickNative(id, fraction = .5) {
  const point = await ev(`(function(){
    var e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled)return null;
    e.scrollIntoView({block:'nearest'});var r=e.getBoundingClientRect();
    return r.width&&r.height?{x:r.left+r.width*${fraction},y:r.top+r.height/2}:null;
  })()`);
  assert.ok(point, 'reachable native control ' + id);
  if (mobileControls) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
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
  check('settings expose each owned recipe in export units', await game(`(function(){
    return RIG_EXHAUST_CATALOG.every(function(p){
      rigExhaustSelect(p.id);var s=rigExhaustSettings();
      return s.id===p.id&&s.name===p.name&&s.description===p.description&&s.custom===!!p.recipe&&
        JSON.stringify(s.tuning)===JSON.stringify(p.tuning)&&JSON.stringify(s.physics)===JSON.stringify(p.physics)&&
        s.appearance.sharpness===0&&s.appearance.lifetime===1;
    });
  })()`));
  check('stock exhaust refuses custom settings and restore actions', await game(`(function(){
    rigExhaustSelect('stock');var before=JSON.stringify(rigExhaustSave());
    return !rigExhaustSetSetting('tuning','mass',2)&&!rigExhaustSetSetting('appearance','sharpness',1)&&
      !rigExhaustRestoreSettings()&&JSON.stringify(rigExhaustSave())===before;
  })()`));
  await game(`rigExhaustSelect(${JSON.stringify(velvet.id)})`);
  check('invalid setting names and nonnumeric values cannot alter a recipe', await game(`(function(){
    var before=JSON.stringify(rigExhaustSave()),tests=[['unknown','mass',1],['tuning','unknown',1],
      ['appearance','unknown',1],['appearance','__proto__',1],['tuning','constructor',1],
      ['physics','HEAT',2],['tuning','motion',2],['tuning','size',2],
      ['tuning','mass',NaN],['tuning','mass',Infinity],['tuning','mass',-Infinity],
      ['tuning','mass','1.5'],['appearance','lifetime',null],['appearance','sharpness',true]];
    return tests.every(function(t){return !rigExhaustSetSetting(t[0],t[1],t[2]);})&&JSON.stringify(rigExhaustSave())===before;
  })()`));
  check('settings reads return independent copies', await game(`(function(){
    var s=rigExhaustSettings(),before=JSON.stringify(s);s.tuning.mass=999;s.appearance.sharpness=999;s.appearance.lifetime=999;s.id='unknown';
    return JSON.stringify(rigExhaustSettings())===before;
  })()`));
  check('visual controls clamp at their supported ranges', await game(`(function(){
    var limits=[['tuning','mass',0.1,2],['appearance','sharpness',0,1],['appearance','lifetime',0.5,3]];
    var ok=limits.every(function(l){
      return rigExhaustSetSetting(l[0],l[1],-10000)&&rigExhaustSettings()[l[0]][l[1]]===l[2]&&
        rigExhaustSetSetting(l[0],l[1],10000)&&rigExhaustSettings()[l[0]][l[1]]===l[3];
    });rigExhaustRestoreSettings();return ok;
  })()`));
  check('tuning changes stay independent for each exhaust and preserve catalog defaults', await game(`(function(){
    var catalog=JSON.stringify(RIG_EXHAUST_CATALOG),base=rigExhaustSettings();
    if(!rigExhaustSetSetting('tuning','mass',1.75)||!rigExhaustSetSetting('appearance','sharpness',0.6))return false;
    var custom=JSON.stringify(rigExhaustSettings());rigExhaustSelect('witchfire');var other=rigExhaustSettings();
    if(other.tuning.mass!==1||other.appearance.sharpness!==0||other.appearance.lifetime!==1)return false;
    if(!rigExhaustSetSetting('tuning','mass',0.5)||!rigExhaustSetSetting('appearance','lifetime',2))return false;
    rigExhaustSelect(${JSON.stringify(velvet.id)});
    return JSON.stringify(rigExhaustSettings())===custom&&base.tuning.mass!==1.75&&JSON.stringify(RIG_EXHAUST_CATALOG)===catalog;
  })()`));
  check('modified recipes survive the full game save round trip and death', await game(`(function(){
    var before=JSON.stringify(rigExhaustSave()),saved=JSON.parse(JSON.stringify(saveBuild()));
    rigExhaustReset();saveApply(saved);var restored=JSON.stringify(rigExhaustSave())===before;
    gameOver=true;respawnFromDeath();return restored&&!gameOver&&JSON.stringify(rigExhaustSave())===before;
  })()`));
  check('saved setting objects cannot mutate live or restored recipes', await game(`(function(){
    var saved=rigExhaustSave(),before=JSON.stringify(rigExhaustSettings());
    saved.settings[${JSON.stringify(velvet.id)}].tuning.mass=999;
    if(JSON.stringify(rigExhaustSettings())!==before)return false;
    saved=rigExhaustSave();rigExhaustLoad(saved);saved.settings[${JSON.stringify(velvet.id)}].appearance.sharpness=999;
    return JSON.stringify(rigExhaustSettings())===before;
  })()`));
  check('setting changes persist through the real save slots', await game(`(function(){
    var disabled=SAVE_DISABLED;SAVE_DISABLED=false;
    try{
      rigExhaustSetSetting('appearance','lifetime',2.5);rigExhaustFlushSettings();
      var saved=saveLoadEnvelope();return saved.profile.rigExhaust.settings[${JSON.stringify(velvet.id)}].appearance.lifetime===2.5;
    }finally{SAVE_DISABLED=disabled;}
  })()`));
  check('linger adjusts dye dissipation without changing material or velocity damping', await game(`(function(){
    var def=rigExhaustGet(),c=rigExhaustFluid.config;
    return Math.abs(c.DENSITY_DISSIPATION-def.recipe.fluid.DENSITY_DISSIPATION/2.5)<1e-9&&
      c.VELOCITY_DISSIPATION===def.recipe.fluid.VELOCITY_DISSIPATION&&
      JSON.stringify(rigExhaustSettings().physics)===JSON.stringify(def.physics);
  })()`));
  check('damaged saves sanitize visual settings and ignore unowned recipes', await game(`(function(){
    var saved=rigExhaustSave();
    try {
      rigExhaustLoad({owned:['velvet-rope'],equipped:'velvet-rope',settings:{
        'velvet-rope':{tuning:{mass:999,motion:2,size:2},appearance:{sharpness:NaN,lifetime:-10},physics:{HEAT:4}},
        'witchfire':{tuning:{mass:2}},stock:{tuning:{mass:2}},unknown:{tuning:{mass:2}}}});
      var s=rigExhaustSettings(),stored=rigExhaustSave().settings;
      return s.tuning.mass===2&&s.appearance.sharpness===0&&s.appearance.lifetime===0.5&&
        s.tuning.motion===rigExhaustGet().tuning.motion&&s.physics.HEAT===rigExhaustGet().physics.HEAT&&
        Object.keys(stored).length===1&&!stored['velvet-rope'].physics;
    } finally {rigExhaustLoad(saved);}
  })()`));
  check('restore resets only the equipped recipe to its exported defaults', await game(`(function(){
    rigExhaustSelect('witchfire');var other=JSON.stringify(rigExhaustSettings());
    rigExhaustSelect(${JSON.stringify(velvet.id)});var p=rigExhaustGet();
    if(!rigExhaustRestoreSettings())return false;var s=rigExhaustSettings();
    if(JSON.stringify(s.tuning)!==JSON.stringify(p.tuning)||JSON.stringify(s.physics)!==JSON.stringify(p.physics)||s.appearance.sharpness!==0||s.appearance.lifetime!==1)return false;
    rigExhaustSelect('witchfire');var same=JSON.stringify(rigExhaustSettings())===other;
    rigExhaustRestoreSettings();return same&&rigExhaustFluid.config.EDGE_SHARPNESS===0&&
      rigExhaustFluid.config.DENSITY_DISSIPATION===rigExhaustGet().recipe.fluid.DENSITY_DISSIPATION;
  })()`));
  const effectiveMaterials = await game(`(function(){
    return RIG_EXHAUST_CATALOG.filter(function(p){return !!p.recipe;}).map(function(p){
      rigExhaustSelect(p.id);rigExhaustApply(true);
      var packets=window.SmokePresets.sample(p.recipe,1.25,0,p.tuning,p.scale.values,1);
      return {id:p.id,units:rigExhaustUnits,physics:rigExhaustFluid.getPhysics(),curl:rigExhaustFluid.config.CURL,
        geometry:packets.map(function(s){return [s.x,s.y,s.vx,s.vy,s.radius];})};
    });
  })()`);
  for (const material of effectiveMaterials) {
    const def = catalog.find(p => p.id === material.id);
    for (const [field, value] of Object.entries(def.physics)) {
      const expected = ['BUOYANCY', 'WEIGHT', 'EDGE_SPIN'].includes(field) ? value * material.units : value;
      assert.ok(Math.abs(material.physics[field] - expected) < 1e-7, material.id + ' live physics ' + field);
    }
  }
  check('exported material forces reach the separate game solver in world units', true);
  check('exhausts have distinct source motion and material behavior beyond color',
    new Set(effectiveMaterials.map(p => JSON.stringify([p.geometry, p.physics, p.curl]))).size === paid.length);
  await game(`rigExhaustSelect(${JSON.stringify(velvet.id)});shopState='closed';shopOpen=false;ukCatalogReset();introPhase='done';if(window.SluiceLoading)window.SluiceLoading.finish(function(){});`);
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
  const appearance = await game(`(function(){
    rigExhaustSelect(${JSON.stringify(velvet.id)});rigExhaustApply(true);
    var f=rigExhaustFluid,c=f.config,gl=rigExhaustContext,oldCanvas=rigExhaustCanvas,oldWorld=world,oldPlayer=player;
    var ambient=JSON.stringify([SmokeFluid.config,SmokeFluid.getPhysics()]),allocations=0,clears=0,methods={};
    function read(neutral){
      var optical=c.OPTICAL_DENSITY,sharpness=c.EDGE_SHARPNESS;
      if(neutral){c.OPTICAL_DENSITY=0;c.EDGE_SHARPNESS=0;}
      f.displayPass();c.OPTICAL_DENSITY=optical;c.EDGE_SHARPNESS=sharpness;
      var bytes=new Uint8Array(oldCanvas.width*oldCanvas.height*4);gl.readPixels(0,0,oldCanvas.width,oldCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
    }
    function faint(bytes){var count=0;for(var i=3;i<bytes.length;i+=4)if(bytes[i]>0&&bytes[i]<40)count++;return count;}
    var stored=read(true),soft=read(false);
    ['createTexture','createFramebuffer','createBuffer','createShader','createProgram'].forEach(function(k){methods[k]=gl[k];gl[k]=function(){allocations++;return methods[k].apply(gl,arguments);};});
    var oldClear=f.clear;f.clear=function(){clears++;return oldClear.apply(f,arguments);};
    try {
      rigExhaustSetSetting('tuning','mass',1.8);rigExhaustSetSetting('appearance','lifetime',2);
      rigExhaustSetSetting('appearance','sharpness',1);var crisp=read(false),after=read(true);
      return {faintSoft:faint(soft),faintCrisp:faint(crisp),visiblyChanged:!soft.every(function(v,i){return v===crisp[i];}),
        dyePreserved:stored.every(function(v,i){return v===after[i];}),allocations:allocations,clears:clears,
        sameIdentity:f===rigExhaustFluid&&oldCanvas===rigExhaustCanvas&&oldWorld===world&&oldPlayer===player,
        ambientPreserved:JSON.stringify([SmokeFluid.config,SmokeFluid.getPhysics()])===ambient,error:gl.getError()};
    } finally {Object.keys(methods).forEach(function(k){gl[k]=methods[k];});f.clear=oldClear;rigExhaustRestoreSettings();}
  })()`);
  console.log('APPEARANCE', appearance);
  check('visual settings preserve stored dye, GPU resources, world and ambient smoke', appearance.dyePreserved &&
    appearance.allocations === 0 && appearance.clears === 0 && appearance.sameIdentity && appearance.ambientPreserved && appearance.error === 0);
  check('sharpness visibly removes soft edge coverage', appearance.visiblyChanged && appearance.faintSoft > 0 && appearance.faintCrisp < appearance.faintSoft);
  await game("rigExhaustSetSetting('appearance','sharpness',1);rigExhaustFluid.displayPass();render();");
  await screenshot('velvet-rope-crisp');
  await game('rigExhaustRestoreSettings();');

  // Identical neutral-color splats isolate recipe physics from source shape
  // and palette. Readback y increases upward in the actual game fluid domain.
  const materialMotion = await game(`(async function(){
    var results={},f=rigExhaustFluid,gl=rigExhaustContext,w=rigExhaustCanvas.width,h=rigExhaustCanvas.height;
    function measure(){
      f.displayPass();var bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      var sum=0,y=0;for(var i=0;i<bytes.length;i+=4){sum+=bytes[i];y+=bytes[i]*(Math.floor(i/4/w)+.5);}
      return {sum:sum,y:y/Math.max(1,sum),error:gl.getError()};
    }
    try {
      for(var id of ['velvet-rope','witchfire']){
        rigExhaustSelect(id);rigExhaustApply(true);f.clear();f.clearObstacle();
        f.setMovingBodies([],0,0,1,1,1/30,smokeFluidObstacleW,smokeFluidObstacleH,true);
        f.setLiquidField([],[],[],[],0,0,0,1,1,1);f.config.OPTICAL_DENSITY=0;
        f.splat(.5,.5,0,0,{r:.5,g:.5,b:.5},.25);var before=measure();
        for(var n=0;n<120;n++){f.step(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}
        var after=measure();results[id]={rise:after.y-before.y,mass:after.sum,initial:before.sum,error:after.error};
      }
      // No source update and no transport forces: only the selected linger
      // setting differs while identical dye fades for four simulated seconds.
      results.fade={};rigExhaustSelect('velvet-rope');
      for(var lifetime of [1,3]){
        rigExhaustSetSetting('appearance','lifetime',lifetime);rigExhaustApply(true);f.clear();
        f.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0,VISCOSITY:0,EDGE_SPIN:0},0);
        f.config.CURL=0;f.config.wind_x=0;f.config.wind_above_y=0;f.config.OPTICAL_DENSITY=0;
        f.splat(.5,.5,0,0,{r:.5,g:.5,b:.5},.25);var before=measure();
        for(var n=0;n<120;n++){f.step(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}
        var after=measure();results.fade[lifetime]={mass:after.sum,initial:before.sum,retained:after.sum/before.sum,error:after.error};
      }
      return results;
    } finally {rigExhaustRestoreSettings();rigExhaustApply(true);f.clear();smokeObstPrevCamX=NaN;}
  })()`);
  console.log('MATERIAL MOTION', materialMotion);
  check('Witchfire rises faster than thick Velvet with identical color and source geometry',
    materialMotion.witchfire.mass > 100 && materialMotion['velvet-rope'].mass > 100 &&
    materialMotion.witchfire.rise > materialMotion['velvet-rope'].rise + .5 &&
    materialMotion.witchfire.error === 0 && materialMotion['velvet-rope'].error === 0);
  const fade = materialMotion.fade;
  check('longer linger retains more identical dye after four seconds with the source off',
    fade[1].initial > 100 && fade[1].initial === fade[3].initial && fade[1].retained > 0 &&
    fade[3].retained < 1 && fade[3].retained > fade[1].retained * 1.3 &&
    fade[1].error === 0 && fade[3].error === 0);
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

  await game('PAUSE_DISABLED=false;syncPauseBtnForShop();');
  await clickNative('gm-pause-btn');
  await clickNative('gm-options-btn'); await clickNative('gm-exhaust-btn');
  check('pause options exposes exactly the three visual exhaust controls', await ev(`(function(){
    var page=document.querySelector('[data-pause-page="exhaust"]'),inputs=Array.from(page.querySelectorAll('input'));
    return !page.hidden&&inputs.length===3&&inputs.every(function(e){return !e.disabled;})&&
      ['gm-exhaust-mass','gm-exhaust-sharpness','gm-exhaust-lifetime'].every(function(id){return inputs.some(function(e){return e.id===id;});});
  })()`));
  const beforeKeyboard = await game('rigExhaustSettings().tuning.mass');
  await ev("document.getElementById('gm-exhaust-mass').focus()"); await key('ArrowRight');
  check('native keyboard slider changes exhaust density without moving the rig', await game(`rigExhaustSettings().tuning.mass>${beforeKeyboard}&&gamePaused&&!keys.ArrowRight`));
  check('keyboard slider refreshes its accessible value and displayed output', await ev(`(function(){
    var e=document.getElementById('gm-exhaust-mass'),o=document.getElementById('gm-exhaust-mass-value');
    var percent=Math.round(Number(e.value)*100);
    return Number(e.value)>${beforeKeyboard}&&o.value===percent+'%'&&e.getAttribute('aria-valuetext')===percent+' percent';
  })()`));
  await screenshot('settings-desktop');
  await key('Escape');
  check('Escape returns from exhaust to options and restores keyboard focus', await game("gamePaused&&pauseMenuPage==='options'&&document.activeElement.id==='gm-exhaust-btn'"));
  await key('Enter');
  check('Enter reopens the exhaust page from its focused options button', await game("gamePaused&&pauseMenuPage==='exhaust'"));
  await clickNative('gm-exhaust-restore');
  check('native restore button restores the selected visual defaults', await game(`rigExhaustSettings().tuning.mass===rigExhaustGet().tuning.mass&&rigExhaustSettings().appearance.sharpness===0&&rigExhaustSettings().appearance.lifetime===1`));
  await clickNative('gm-menu-close'); await game('cancelAnimationFrame(gameRafId);gameRafId=0;');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  mobileControls = true;
  await sleep(300); await game('resize();render()');
  await openStore(); await selectStoreItem(rainbow.id); await screenshot('store-phone');
  check('phone store fits its viewport with a reachable equip action', await game(`(function(){var h=UK_HIT.find(function(h){return h.id==='uk:act';});var L=ukLayoutC;return h&&h.x>=0&&h.y>=0&&h.x+h.w<=viewW+1&&h.y+h.h<=viewH+1&&L.x>=0&&L.x+L.w<=viewW+1;})()`));
  await game("shopState='closed';shopOpen=false;ukCatalogReset();syncPauseBtnForShop();render()");
  await clickNative('gm-pause-btn'); await clickNative('gm-options-btn'); await clickNative('gm-exhaust-btn');
  await clickNative('gm-exhaust-sharpness', .8); await clickNative('gm-exhaust-lifetime', .8);
  check('phone touch sliders update sharpness and linger', await game('gamePaused&&rigExhaustSettings().appearance.sharpness>.5&&rigExhaustSettings().appearance.lifetime>2'));
  check('phone exhaust settings fit the viewport without horizontal overflow', await ev(`(function(){
    var r=document.getElementById('gm-pause-card').getBoundingClientRect();
    return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth;
  })()`));
  await screenshot('settings-phone'); await clickNative('gm-exhaust-restore');
  check('phone restore resets the live visual settings', await game('rigExhaustSettings().appearance.sharpness===0&&rigExhaustSettings().appearance.lifetime===1'));
  await clickNative('gm-menu-close'); await game('cancelAnimationFrame(gameRafId);gameRafId=0;');
  await openStore();
  await selectStoreItem(stock.id); await clickHit('uk:act');
  check('phone can switch back to stock without purchase', await game(`rigExhaustState.equipped===${JSON.stringify(stock.id)}`));
  await game("shopState='closed';shopOpen=false;ukCatalogReset();syncPauseBtnForShop();render()");
  await clickNative('gm-pause-btn'); await clickNative('gm-options-btn'); await clickNative('gm-exhaust-btn');
  check('stock settings explain ownership and disable all visual controls', await ev(`(function(){
    var page=document.querySelector('[data-pause-page="exhaust"]');
    return Array.from(page.querySelectorAll('input')).every(function(e){return e.disabled;})&&
      document.getElementById('gm-exhaust-restore').disabled&&document.getElementById('gm-exhaust-note').textContent.includes('Store');
  })()`));
  await clickNative('gm-menu-close'); await game('cancelAnimationFrame(gameRafId);gameRafId=0;PAUSE_DISABLED=true;');
  check('new game clears purchased cosmetics and custom settings', await game(`(function(){
    rigExhaustSelect(${JSON.stringify(rainbow.id)});rigExhaustSetSetting('appearance','lifetime',2);
    if(!Object.keys(rigExhaustSave().settings).length)return false;
    saveWipe();init();return rigExhaustState.equipped===${JSON.stringify(stock.id)}&&Object.keys(rigExhaustSave().settings).length===0&&RIG_EXHAUST_CATALOG.every(function(p){return !p.price||!rigExhaustIsOwned(p.id);});
  })()`));
  check('no browser exceptions or console errors', errors.length === 0);
  console.log('Screenshots: ' + out);
} finally {
  if (errors.length) console.error(JSON.stringify(errors));
  cleanup();
}
