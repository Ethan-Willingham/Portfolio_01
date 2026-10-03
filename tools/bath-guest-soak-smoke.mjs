// Automatic bath admission, physical water contact and uneven crust peeling.
// Run: BUNDLE=1 node tools/bath-guest-soak-smoke.mjs. Owns its testing browser.
// BUNDLE_SOURCE=/absolute/path.js verifies a separately assembled candidate.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8342), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-bath-soak-');
const out = process.env.DUMP || '/tmp/sluice-bath-soak-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let ws, chrome, seq = 0;
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const source = process.env.BUNDLE_SOURCE ? fs.readFileSync(process.env.BUNDLE_SOURCE, 'utf8') : process.env.BUNDLE ? data.toString() : fs.readdirSync(path.join(root, 'js/sluice'))
        .filter(name => /^\d.*\.js$/.test(name)).sort().map(name => fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8')).join('\n');
      const seam = source.lastIndexOf('})();');
      assert(seam >= 0, 'bundle IIFE seam exists');
      data = Buffer.from(source.slice(0, seam) + 'window.__bathSoakTest = function(source) { return eval(source); };\n' + source.slice(seam));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
function cleanup() {
  try { ws?.close(); } catch {}
  chrome?.kill(); server.close();
  for (const request of pending.values()) request.reject(new Error('browser harness closed'));
  pending.clear();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => ev(`__bathSoakTest(${JSON.stringify(source)})`);
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
async function viewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await game(`isMobile=${mobile};resize();window.dispatchEvent(new Event('resize'));`);
}

// Replenish sensible energy only. The fixture keeps actual distributed water,
// guest positions, colliders and patch exposure under the ordinary game code.
const temperature = value => `bathThermalSample();for(var k=0;k<72;k++){bathThermal.energy[k]=bathThermal.capacity[k]*(${value}-20);bathThermal.temperature[k]=${value};}
  bathThermal.meanC=${value};bathThermal.copperC=${value};bathHeat=(${value}-20)/28;`;
async function ticks(count, degrees = 42, gpu = false) {
  for (let done = 0; done < count; done += gpu ? 1 : 15) {
    const batch = Math.min(gpu ? 1 : 15, count - done);
    await game(`for(var frame=0;frame<${batch};frame++){${temperature(degrees)}bathGuestTick(1/60);${gpu ? 'updateLiquids(1/60);' : ''}}updateCamera();render();`);
    if (gpu) {
      await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
      await sleep(2);
    }
  }
}
const guestState = `bathGuests.map(function(g){return {id:g.s.id,st:g.st,manual:!!g.manual,paid:!!g.paid,served:!!g.served,soak:g.soak,
  x:g.s.x,y:g.s.y,vx:g.s.vx,vy:g.s.vy,wet:g.s.wet,r:g.s.r,skin:g.skin.map(function(p){return {wet:p.wet,peel:p.peel};})};})`;
const mass = `(function(){liquidToolSync();var parked=0;Object.values(mineralLiquidParked).forEach(function(data){parked+=data.length/3;});
  return{live:liquidCount,parked:parked,lost:bathLostWater,evaporated:bathThermal.evaporatedKg*100};})()`;

try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(100);
  }
  assert(endpoint, 'testing browser started');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request?.reject(message.error) : request?.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?dev=1&nosave=1&nopause=1&tod=0.35` });
  for (let attempt = 0; attempt < 600; attempt++) {
    if (await ev(`typeof __bathSoakTest==='function' && __bathSoakTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('ordinary boot uses GPU water with clean shaders', await game("introPhase==='done' && !!liquidWGPU && liquidWGPU.available && window.__shaderWarm.errors.length===0"));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game('bathEnter()'); await sleep(750);
  await game(`cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;
    bathGuests=[];skySlimes=[];skySlimeNext=1e9;bathToolReset();hearthReset();
    liquidCount=0;liquidOps.length=0;liquidMutationSeq++;mineralLiquidParked={};bathWater=0;bathNoticeT=0;
    var savedRandom=Math.random,probeSeed=73;Math.random=function(){probeSeed=(Math.imul(probeSeed,1664525)+1013904223)>>>0;return probeSeed/4294967296;};
    var probeGuest=skySlimeFresh(0,0);Math.random=savedRandom;bathGuestAccept(probeGuest);bathGuests[0].st='wait';bathGuests[0].hop=null;`);
  const id = await game('bathGuests[0].s.id');
  await ticks(60, 42);
  check('warm dry tub leaves the guest waiting', await game("!bathGuests[0].served && bathGuests[0].st==='wait'"));
  const count = await game(`(function(){var c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),spacing=LIQUID_CELL*LIQUID_PDELTA;
    for(var x=c.x0+spacing;x<c.x1-spacing;x+=spacing){
      var floor=c.y0+c.depthAt(x)-6*Math.hypot(1,bathCurveSlope(c,x));
      for(var y=c.y0+c.D*.45;y<floor;y+=spacing)addLiquidParticle(0,x,y,0,0,0);
    }bathWater=bathBasinCount();bathThermalReset();bathThermalSample();bathArmHeat();return bathWater;})()`);
  check('fixture contains enough actual distributed water', count >= await game('BATH_MIN_WATER'));
  const initialMass = await game(mass);
  await ticks(60, 20);
  check('cold full tub leaves the guest waiting', await game("!bathGuests[0].served && bathGuests[0].st==='wait'"));
  await ticks(60, 60);
  check('hot full tub leaves the guest waiting', await game("!bathGuests[0].served && bathGuests[0].st==='wait'"));
  await ticks(1);
  check('ready tub starts entry immediately without a click', await game("bathGuests[0].served && bathGuests[0].st==='hop' && bathGuests[0].hop.next==='plunge'"));
  await screenshot('desktop-entry');
  await ticks(210, 42, true);
  let immersed = (await game(guestState))[0];
  for (let settle = 0; settle < 8 && immersed.wet <= .25; settle++) {
    await ticks(30, 42, true); immersed = (await game(guestState))[0];
  }
  console.log('IMMERSED', { ...immersed, skin: { count: immersed.skin.length, min: Math.min(...immersed.skin.map(p=>p.peel)), max: Math.max(...immersed.skin.map(p=>p.peel)) } });
  check('automatic entry becomes an immersed physical body', immersed.manual && immersed.wet > .25 && immersed.soak > 0 && !immersed.paid);
  check('mixed material contour feeds the real water collider', await game('bathGuestContour(bathGuests[0].s).every(function(p){return Number.isFinite(p.x+p.y);}) && bathGuestColliders.some(function(c){return c.pts && c.pts.length>=48 && c.pts.every(Number.isFinite);})'));
  check('GPU liquid simulation stays live during the plunge', await game('liquidWGPU.simActive && liquidWGPU.uploadedCount>4000'));
  await screenshot('desktop-immersed');

  const beforeKick = (await game(guestState))[0];
  await game('bathGuests[0].s.vx=180;');
  await ticks(30, 42, true);
  const kicked = (await game(guestState))[0];
  console.log('KICK_RESPONSE', { x: kicked.x, y: kicked.y, vx: kicked.vx, vy: kicked.vy, wet: kicked.wet, soak: kicked.soak });
  check('a horizontal impulse moves the guest without a scripted reset', kicked.x > beforeKick.x + 8 && Math.abs(kicked.vx) > 1);
  check('buoyancy keeps the guest afloat and its motion finite', Number.isFinite(kicked.x + kicked.y + kicked.vx + kicked.vy) && kicked.wet > .2 && (kicked.wet < .99 || kicked.vy < 0));
  const water = await game(`(async function(){var gpu=liquidWGPU,n=gpu.uploadedCount,b=gpu.device.createBuffer({size:Math.max(16,n*16),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{var e=gpu.device.createCommandEncoder();e.copyBufferToBuffer(gpu.buf.pos,0,b,0,n*16);gpu.device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
      var values=new Float32Array(b.getMappedRange()),s=bathGuests[0].s,near=0,moving=0,core=0;
      for(var k=0;k<n;k++){var dx=values[k*4]-s.x,dy=values[k*4+1]-s.y,d=dx*dx+dy*dy;
        if(d<s.r*s.r*.25)core++;if(d<s.r*s.r*9){near++;if(Math.hypot(values[k*4+2],values[k*4+3])>5)moving++;}}
      return{near:near,moving:moving,core:core};}finally{b.unmap();b.destroy();}})()`);
  console.log('WATER_CONTACT', water);
  check('real GPU particles move around the guest and clear its core', water.near > 20 && water.moving > 0 && water.core < water.near * .035);
  const afterContact = await game(mass);
  const totalMass = state => state.live + state.parked + state.lost + state.evaporated;
  check('guest contact conserves water including floor spills and evaporation', Math.abs(totalMass(afterContact) - totalMass(initialMass)) < .001);
  console.log('WATER_MASS', { initial: initialMass, afterContact });

  let mixed, sawFlakes = false;
  for (let interval = 0; interval < 35; interval++) {
    await ticks(15);
    sawFlakes ||= await game('bathSkinFlakes.length>0');
    const state = (await game(guestState))[0];
    const values = state.skin.map(patch => patch.peel);
    if (Math.max(...values) >= .999 && Math.min(...values) < .3 && sawFlakes) { mixed = state; break; }
  }
  assert(mixed, 'a mid-bath guest exposes soft patches while retaining harder patches');
  check('wet crust peels unevenly before the bath finishes', mixed.skin.some(patch => patch.peel >= .999) && mixed.skin.some(patch => patch.peel < .3) && !mixed.paid);
  check('loosened crust creates detached flakes', sawFlakes);
  check('exposed soft patches give the guest an uneven physical boundary', await game(`(function(){var s=bathGuests[0].s,rr=bathGuestContour(s).map(function(p){return Math.hypot(p.x-s.x,p.y-s.y);});return Math.max.apply(null,rr)-Math.min.apply(null,rr)>s.r*.025 && Math.min.apply(null,rr)<s.r*.985 && Math.max.apply(null,rr)>=s.r*.995;})()`));
  await ticks(30, 42, true);
  await screenshot('desktop-partial-peel');
  await viewport(844, 390, true);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;updateCamera();render();');
  check('landscape mobile shows the same integrated room', await game('!mobileLandscapeBlocked && !hearthRoomLayout().mobile && hearthRoomLayout().wide'));
  await screenshot('mobile-partial-peel');

  const frozen = (await game(guestState))[0];
  await game('bathTool.held=bathGuests[0];bathTool.x=bathGuests[0].s.x;bathTool.y=bathGuests[0].s.y-bathGuests[0].s.r-8;');
  await ticks(90);
  const held = (await game(guestState))[0];
  assert.equal(held.soak, frozen.soak, 'held guest earns no soak time');
  assert.deepEqual(held.skin, frozen.skin, 'held guest earns no wetting or peel progress');
  console.log('PASS holding freezes earned bath and patch progress');
  await game('bathToolReset();');
  const beforeCold = (await game(guestState))[0];
  await ticks(90, 20);
  const cold = (await game(guestState))[0];
  assert.equal(cold.soak, beforeCold.soak, 'cold guest earns no soak time');
  assert.deepEqual(cold.skin.map(p=>p.peel), beforeCold.skin.map(p=>p.peel), 'cold water pauses peeling');
  console.log('PASS cold water pauses soak and shell peeling');

  const saved = await game('JSON.parse(JSON.stringify(bathServiceSave()))');
  await game(`bathServiceRestore(${JSON.stringify(saved)});bathMode=true;bathFading=false;bathCarveRoom();bathCamPin();bathWater=bathBasinCount();updateCamera();render();`);
  const restored = (await game(guestState))[0];
  assert.equal(restored.id, id); assert.equal(restored.soak, cold.soak); assert.deepEqual(restored.skin, cold.skin);
  check('saved partial shell restores on the same guest', await game('bathGuests[0].s._bathSkin===bathGuests[0].skin'));

  await game('keys.ArrowUp=true;bathTool.valve=true;gameRafId=requestAnimationFrame(loop);');
  await viewport(390, 844, true);
  check('portrait activates the rotate gate and clears held input', await game("mobileLandscapeBlocked && !document.getElementById('gm-rotate-screen').hidden && !keys.ArrowUp && !bathTool.valve && gameRafId===0"));
  const portrait = await game('JSON.stringify({soak:bathGuests[0].soak,x:bathGuests[0].s.x,y:bathGuests[0].s.y})');
  await sleep(450);
  assert.equal(await game('JSON.stringify({soak:bathGuests[0].soak,x:bathGuests[0].s.x,y:bathGuests[0].s.y})'), portrait, 'portrait gate freezes guest play');
  await screenshot('portrait-rotate-gate');
  await viewport(844, 390, true);
  check('returning to landscape resumes ordinary play', await game('!mobileLandscapeBlocked && !gamePaused && !!gameRafId'));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;');
  await viewport(390, 844, true); await viewport(844, 390, true);
  check('rotation preserves a deliberate pause', await game('gamePaused && !mobileLandscapeBlocked && gameRafId===0'));
  await game('gamePaused=false;');

  const moneyBefore = await game('money');
  for (let interval = 0; interval < 90 && !await game(`surfaceSlimeSave().residents.some(function(r){return r.id===${id};})`); interval++) await ticks(30);
  check('finished bath pays once and creates the same soft resident', await game(`money===${moneyBefore}+BATH_VISIT.pay && bathServed===1 && surfaceSlimeSave().residents.filter(function(r){return r.id===${id};}).length===1`));
  const paid = await game('JSON.parse(JSON.stringify(bathServiceSave()))');
  await game(`bathServiceRestore(${JSON.stringify(paid)});bathMode=true;bathFading=false;`);
  await ticks(120);
  check('reload after completion never duplicates payment or resident', await game(`money===${moneyBefore}+BATH_VISIT.pay && bathServed===1 && surfaceSlimeSave().residents.filter(function(r){return r.id===${id};}).length===1`));
  await screenshot('mobile-completed-bath');
  check('no browser exceptions or error logs', errors.length === 0);
} finally {
  if (errors.length) console.error(JSON.stringify(errors));
  cleanup();
}
