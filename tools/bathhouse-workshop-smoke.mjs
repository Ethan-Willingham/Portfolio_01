// Integrated bath workshop: real pointer placement, ignition, grate and storage.
// Run: node tools/bathhouse-workshop-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';



import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { savedBathEntry } from './bathhouse-saved-entry.mjs';
import { bathHoseFlow } from './bathhouse-hose-flow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8197), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-workshop-qa';
const savedFixture = process.env.BATH_SAVE ? JSON.parse(fs.readFileSync(process.env.BATH_SAVE, 'utf8')) : null;
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
      let src = process.env.BUNDLE ? data.toString() : fs.readdirSync(path.join(root, 'js/sluice')).filter(n=>/^\d.*\.js$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,'js/sluice',n),'utf8')).join('\n');
      const end = src.lastIndexOf('})();');
      assert(end >= 0, 'bundle IIFE seam exists');
      data = Buffer.from(src.slice(0, end) + 'window.__hearthTest = function(source) { return eval(source); };\n' + src.slice(end));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
function cleanup() {
  try { ws?.close(); } catch {}
  chrome?.kill(); server.close();
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const game = source => ev(`__hearthTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }

const button = action => `(function(){var b=hearthButtons.find(b=>b.action===${JSON.stringify(action)});if(!b)throw Error('missing button '+${JSON.stringify(action)});return {x:b.x+b.w/2,y:b.y+b.h/2};})()`;
async function client(target){return game(`(function(){var p=${target},r=canvas.getBoundingClientRect();return{x:r.left+p.x*r.width/(canvas.width/dpr),y:r.top+p.y*r.height/(canvas.height/dpr)};})()`);}
async function move(target){const p=await client(target);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});}
async function press(target,touch=false){
  const p=await client(target);
  if(touch){await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  await game('render()');
}

try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(100);
  }
  assert(endpoint, 'testing browser started');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.args.some(a=>typeof a.value==='string'&&/fallback|failed|timeout/i.test(a.value))) console.log('BROWSER',m.params.args.map(a=>a.value||a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  if (savedFixture) await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(!localStorage.getItem('bath.test.seeded')){localStorage.setItem('sluice.save.a',${JSON.stringify(JSON.stringify(savedFixture))});localStorage.setItem('bath.test.seeded','1');}` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?dev=1&${savedFixture ? '' : 'nosave=1&'}nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('workshop boots with GPU water', await game("introPhase==='done' && !!liquidWGPU && liquidWGPU.available"));
  check('shader warm-up clean', await ev('window.__shaderWarm.errors.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  if (process.env.BATH_HOSE) {
    await bathHoseFlow({ game, ev, send, sleep, check, screenshot, press, button });
  } else if (savedFixture) {
    await savedBathEntry({ fixture: savedFixture, game, ev, send, sleep, check, screenshot, press, button });
  } else {
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];bathNoticeT=0;updateCamera();render();');
  check('old prepare and guest buttons removed', await game("!hearthButtons.some(b=>['kit','guest'].includes(b.action))"));
  check('a fresh bath starts with no water or queued fill', await game('bathBasinCount()===0 && bathPour===0 && bathSilos.pending.every(n=>n===0)'));
  await game('for(var i=0;i<120;i++){bathOperationsTick(1/60);bathToolTick(1/60);}render();');
  check('idle entry does not populate the tub', await game('bathBasinCount()===0'));
  check('dev mode is enabled for the empty-entry check', await game('devMode'));
  await game('setDevMode(false);setDevMode(true);bathPour=123;for(var i=0;i<120;i++)bathGuestTick(1/60);');
  check('dev toggles and legacy fill reservations cannot auto-pour', await game('bathBasinCount()===0&&bathPour===0&&bathSilos.pending[0]===123'));
  await press(button('hose'));
  await game('for(var i=0;i<120;i++)bathGuestTick(1/60);');
  check('selecting the dev hose keeps its valve closed', await game('bathBasinCount()===0&&!bathTool.valve&&!bathTool.spraying'));
  await game('bathToolReset();bathSiloReset();render();');
  await screenshot('dry-copper-basin');
  await game("devMode=false;forgeGive('coal',6);forgeGive('flint',1);cargo.push('amber','amber','methaneice','sulfur','copper','malachite');");
  const stock=await game("hearthMaterialCount('amber')");
  await press(button('fuels'));
  await screenshot('fuel-rack-desktop');
  await press(button('fuel:amber'));
  const center='(function(){var r=hearthRoomLayout().box;return {x:r.x+r.w/2-14,y:r.y+r.h*.3+16};})()';
  await move(center); await game('render()');
  check('selecting and previewing do not spend stock', await game("hearthMaterialCount('amber')")===stock);
  const preview=await game('({id:hearthHandPreview().id,shape:hearthHandPreview().shape,angle:hearthHandPreview().angle,point:hearthHandPoint({x:hearthHand.x,y:hearthHand.y},false)})');
  await screenshot('amber-ghost');
  await press(center);
  const realized=await game('({stock:hearthMaterialCount("amber"),b:hearthBeds.boiler.chunks.at(-1)})');
  check('click spends exactly one selected material',realized.stock===stock-1&&realized.b.material==='amber');
  check('realized hull and position match preview',realized.b.id===preview.id&&JSON.stringify(realized.b.shape)===JSON.stringify(preview.shape)&&realized.b.angle===preview.angle&&Math.abs(realized.b.x-preview.point.x)<.01&&Math.abs(realized.b.y-preview.point.y)<.01);
  await game('for(var i=0;i<240;i++)hearthStepBed(hearthBeds.boiler);render()');
  check('realized piece falls to the actual grate',await game('hearthBeds.boiler.chunks[0].y')>realized.b.y+30);
  const remaining=await game('hearthMaterialCount("amber")');
  await press('(function(){var r=hearthRoomLayout().box;return {x:r.x+2,y:r.y+r.h-2};})()');
  check('invalid wall drop does not spend inventory',await game('hearthMaterialCount("amber")')===remaining);
  await press('(function(){var b=hearthBeds.boiler.chunks[0],r=hearthRoomLayout().box;return {x:r.x+b.x*r.w/HEARTH_WIDTH-14,y:r.y+(b.y-HEARTH_TOP)*r.h/HEARTH_HEIGHT+16};})()');
  check('overlapping drop does not spend inventory',await game('hearthMaterialCount("amber")')===remaining);
  await press(button('strike'));
  const above='(function(){var b=hearthBeds.boiler.chunks[0],r=hearthRoomLayout().box;return {x:r.x+b.x*r.w/HEARTH_WIDTH,y:r.y+(b.y-b.r-8-HEARTH_TOP)*r.h/HEARTH_HEIGHT};})()';
  await press(above);
  check('selecting or clicking striker does not auto-ignite',await game('!hearthBeds.boiler.chunks.some(b=>b.lit)&&!hearthHand.sparks.length'));
  const sp=await client(above);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...sp,button:'left',clickCount:1});
  for(let i=1;i<=4;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:sp.x+i*12,y:sp.y,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:sp.x+48,y:sp.y,button:'left',clickCount:1});
  check('manual dragging casts physical sparks',await game('hearthHand.sparks.length>0'));
  await game('for(var i=0;i<120;i++)hearthHandTick(1/120);render()');
  check('spark contact lights actual fuel',await game('hearthBeds.boiler.chunks[0].lit'));
  await game('hearthBeds.boiler.ash.push({x:HEARTH_WIDTH/2,y:HEARTH_FLOOR-3,vx:0,vy:0,r:3,kg:.002,seed:7,heat:0});');
  const bodies=await game('hearthBeds.boiler.chunks.length');
  await press(button('ash'));
  await game('hearthHandTick(.6);render()');await screenshot('grate-in-motion');
  await game('for(var i=0;i<100;i++)hearthHandTick(1/120)');
  check('travelling grate sifts ash while retaining fuel',await game('hearthBeds.boiler.ash.length===0&&hearthHand.rake===null&&hearthBeds.boiler.chunks[0].vy<0')&&await game('hearthBeds.boiler.chunks.length')===bodies);
  await game('siphon.tank=[700,0,1300,0,0,97];bathSiloReset();render()');
  await press(button('liquids'));await press(button('silo-store'));
  check('UI storage conserves water/brine and leaves snow in rig',await game('bathLiquidCount(0)===700&&bathLiquidCount(2)===1300&&siphon.tank[0]===0&&siphon.tank[2]===0&&siphon.tank[5]===97'));
  await screenshot('liquid-silos-desktop');
  await press(button('liquid:2'));
  check('selecting brine arms hose',await game("bathSilos.selected===2&&bathTool.mode==='hose'"));
  const beforeBrine=await game('bathLiquidCount(2)');
  const beforeParticle=await game('liquidSampleRect(0,0,COLS*TILE,world.length*TILE)[2]');
  await game('bathTool.valve=true;for(var i=0;i<30;i++)bathToolTick(1/60);bathTool.valve=false;render()');
  check('hose emits selected brine and spends only emitted particles',await game('bathLiquidCount(2)')<beforeBrine&&await game('liquidSampleRect(0,0,COLS*TILE,world.length*TILE)[2]')-beforeParticle===beforeBrine-await game('bathLiquidCount(2)'));
  const save=await game('JSON.stringify({silos:bathSiloSave(),workshop:hearthRoomSave(),thermal:bathThermalSave()})');
  await game('var savecheck=bathServiceSave();bathServiceRestore(savecheck);render();');
  check('store and material selection survive save/restore',await game('JSON.stringify({silos:bathSiloSave(),workshop:hearthRoomSave(),thermal:bathThermalSave()})')===save);
  await game(`devMode=true;bathToolReset();hearthReset();hearthHand.rack=hearthHand.silos=false;hearthHand.visible=false;
    for(var i=0;i<14;i++){var b=hearthDropMaterial('boiler',HEARTH_WIDTH/2-190+i*29,110,HEARTH_MATERIAL_ORDER[i%6]);for(var j=0;j<50;j++)hearthStepBed(hearthBeds.boiler);if(hearthMaterial(b.material).role==='fuel')hearthLightChunk(hearthBeds.boiler,b);}
    liquidCount=0;liquidOps.length=0;liquidMutationSeq++;
    var curve=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]);
    for(var y=curve.y0+55;y<curve.y0+curve.D-7;y+=2)for(var x=curve.x0+12;x<curve.x1-12;x+=2)if(y<curve.y0+curve.depthAt(x)-6)addLiquidParticle(0,x,y,0,0,0);
    bathWater=bathBasinCount();bathThermalReset();bathThermalSample();
    bathThermal.energy.set(bathThermal.capacity.map((c,k)=>c*(k>=48?42:22)));bathThermalStep(.05);bathThermalUpload();bathNoticeT=0;`);
  for(let i=0;i<120;i++){await game('hearthRoomTick(1/60);bathThermalTick(1/60);updateLiquids(1/60);bathThermalVaporTick(1/60);');await game('liquidWGPU.device.queue.onSubmittedWorkDone()');}
  await game('render()');await screenshot('workshop-desktop');
  for(const [width,height,mobile]of [[390,844,true],[667,375,true],[320,568,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await sleep(150);await game('resize();bathCamY=-1;updateCamera();updateLiquids(1/60);render();');
    const layout=await game('({w:canvas.width/dpr,h:canvas.height/dpr,buttons:hearthButtons.map(b=>({a:b.action,x:b.x,y:b.y,w:b.w,h:b.h}))})');
    check(`${width}x${height} controls stay on canvas`,layout.buttons.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=layout.w+.5&&b.y+b.h<=layout.h+.5));
    check(`${width}x${height} controls have usable touch targets`,layout.buttons.every(b=>b.w>=44&&b.h>=44));
    await screenshot(`workshop-${width}x${height}`);
    await press(button('fuels'),true);
    check(`${width}x${height} tray draws above GPU flames`,await game('!!hearthOverlayCanvas&&Number(hearthOverlayCanvas.style.zIndex)>Number(hearthFireGPU.canvas.style.zIndex)'));
    await screenshot(`fuel-rack-${width}x${height}`);
    await press(button('fuel:methaneice'),true);
    const n=await game('hearthBeds.boiler.chunks.length');
    await press('(function(){var r=hearthRoomLayout().box;for(var y=HEARTH_TOP+40;y<HEARTH_FLOOR-40;y+=30)for(var x=120;x<HEARTH_WIDTH-120;x+=40)if(hearthPlacementValid({x:x,y:y}))return {x:r.x+x*r.w/HEARTH_WIDTH,y:r.y+(y-HEARTH_TOP)*r.h/HEARTH_HEIGHT};throw Error("no clear drop site");})()',true);
    check(`${width}x${height} touch places selected fuel`,await game('hearthBeds.boiler.chunks.length')===n+1);
    await game('for(var i=0;i<240;i++)hearthStepBed(hearthBeds.boiler);');
    await press(button('liquids'),true);await screenshot(`silos-${width}x${height}`);
    await game('hearthHand.silos=false;render()');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await game('bathExit()');await sleep(550);
  await game('resize();bathCamPin();var sr=bathSilosExteriorRect();cam.x=banyaX-120;cam.y=SKY_ROWS*TILE-500;render();');
  check('workshop overlay clears on exit',await game('hearthOverlayCanvas.style.display==="none"'));
  check('three exterior silos stand to the right of bath',await game('bathSilos.tanks.length===3&&bathSilosExteriorRect().x>=banyaX+BANYA_W+32'));
  await screenshot('bathhouse-exterior-silos');
  }
  check('no browser or GPU errors',errors.length===0);
  console.log('ERRORS',errors);
} finally { cleanup(); }
