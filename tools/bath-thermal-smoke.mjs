// Bath thermal field: actual GPU shader execution, evaporation and ordinary clock.
// Run: node tools/bath-thermal-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';



import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8194), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-fire-qa';
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
      let src = fs.readdirSync(path.join(root, 'js/sluice')).filter(n=>/^\d.*\.js$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,'js/sluice',n),'utf8')).join('\n');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('thermal shaders boot cleanly', await game("introPhase==='done' && !!liquidWGPU && liquidWGPU.available"));
  check('shader warm-up clean', await ev('window.__shaderWarm.errors.length===0'));
  const outdoorClock = await game('LIQUID_TIMESCALE');
  await game("cancelAnimationFrame(gameRafId);gameRafId=0;devMode=true;bathMode=true;bathFading=false;gamePaused=false;bathCarveRoom();bathCamPin();bathArmHeat();updateCamera();");
  if(process.env.CPU) await game('liquidWGPU.simActive=false;liquidWGPU.renderActive=false;');
  const speed=await game('({k:bathScaleK,ts:LIQUID_TIMESCALE})');
  check('bath keeps ordinary simulation clock',speed.k===1&&speed.ts===outdoorClock);
  await game(`liquidCount=0;liquidOps.length=0;liquidMutationSeq++;
    var curve=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]);
    for(var y=curve.y0+55;y<curve.y0+curve.D-7;y+=2)for(var x=curve.x0+12;x<curve.x1-12;x+=2)
      if(y<curve.y0+curve.depthAt(x)-6)addLiquidParticle(0,x,y,0,0,0);
    bathWater=bathBasinCount();bathThermalSample();
    bathThermal.energy.set(bathThermal.capacity.map((c,k)=>c*(k>=48?70:35)));
    bathThermalStep(.05);bathThermalUpload();`);
  console.log('THERMAL',await game('({count:liquidCount,C:bathThermal.meanC,capacity:bathThermal.totalCapacity})'));
  for(let f=0;f<300;f++){
    await game('bathThermalTick(1/60);updateLiquids(1/60);bathThermalVaporTick(1/60);');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
    await sleep(5);
  }
  await game('updateCamera();render()');
  check((process.env.CPU?'CPU fallback':'GPU')+' thermal solver executes cleanly',errors.length===0);
  check('shared thermal field stays finite and retains hot water',await game('bathThermal.meanC>50&&Array.from(bathThermal.gpu).every(Number.isFinite)'));
  check('snow force remains zero',await game('bathThermalForce(bathThermal.x0+300,bathThermal.y0+130,5)===0'));
  check('actual evaporation produces visible vapor',await game('bathThermal.evaporatedKg>0&&bathThermal.vapor.length>0'));
  await screenshot(process.env.CPU?'thermal-cpu':'thermal-gpu');
  console.log('THERMAL FINAL',await game('({count:liquidCount,C:bathThermal.meanC,vapor:bathThermal.vapor.length,errors:liquidWGPU.errors})'));
  console.log('ERRORS',errors);
} finally { cleanup(); }
