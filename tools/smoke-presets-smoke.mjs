// Exhaust catalog, UI, and GPU regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/smoke-presets-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8770), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-smoke-presets-');
const out = process.env.DUMP || '/tmp/sluice-smoke-presets-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__smokeTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__gameSmokeTest = function(source) { return eval(source); };\n' + src.slice(i));
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
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},45000); pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__smokeTest(${JSON.stringify(source)})`);
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for (let i=0;i<100;i++) {
    try { const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl; if(endpoint)break; } catch {}
    await sleep(100);
  }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint); await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/water-smoke-slime.html?smoke=cauldron`});
  for(let i=0;i<200;i++){if(await ev(`!!window.__toy && !!document.getElementById('smoke-family')`))break;await sleep(100);}
  check('rig preview and smoke engine boot',await ev("__toy.stats().scene === 'rig' && __toy.stats().smoke"));
  await game('stopLoop();userPaused=false;');
  const ids=await ev('SmokePresets.recipes.map(p=>p.id)');
  check('two retained looks and nine fluid experiments',ids.length===11 && new Set(ids).size===11 && !ids.includes('inkblossom') && !ids.includes('default'));
  for(const id of ['copperhead','dragon']) {
    const saved=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/smoke',id+'.json'),'utf8'));
    const current=await ev(`__toy.set('smokePreset','${id}');__toy.smokeExport()`);
    for(const field of ['source','fluid','palette','colors'])assert.deepEqual(current.preset[field],saved.preset[field],id+' '+field);
    assert.deepEqual(current.tuning,saved.tuning,id+' tuning');assert.deepEqual(current.scale,saved.scale,id+' scale');
    check(id+' preserves the exported recipe, scale, tuning, and sampler',current.samplerVersion===1);
  }
  check('samples remain finite and bounded across tuning extremes',await ev(`(()=>{
    for(const recipe of SmokePresets.recipes)for(const amount of [.25,1,2.5])for(let i=0;i<240;i++){
      const packets=SmokePresets.sample(recipe,i/30,1.9,{mass:amount,motion:amount,size:amount},{rad:4.2,dye:.55,lift:1.8},1.5);
      if(packets.length>8 || packets.some(p=>![p.x,p.y,p.vx,p.vy,p.radius,...Object.values(p.color)].every(Number.isFinite) || p.radius<=0 || Object.values(p.color).some(v=>v<0)))return false;
      if(recipe.samplerVersion===3 && Math.abs(packets.reduce((sum,p)=>sum+p.vx,0))>1e-8)return false;
    }return true;
  })()`));
  const failures=[];
  for(const id of (process.env.ONLY ? process.env.ONLY.split(',') : ids)){
    const stats=await game(`(async function(){
      presetSet('smoke',${JSON.stringify(id)});scene('rig');
      for(var n=0;n<${Number(process.env.FRAMES || 180)};n++) {presetTickSmoke(1/30);emittersTick(1/30);smokeFrame(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}
      render();SmokeFluid.displayPass();
      var gl=smokeCanvas.getContext('webgl2')||smokeCanvas.getContext('webgl');
      var pixels=new Uint8Array(smokeCanvas.width*smokeCanvas.height*4);gl.readPixels(0,0,smokeCanvas.width,smokeCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      var lit=0,clipped=0;for(var p=0;p<pixels.length;p+=4){if(pixels[p+3]>8)lit++;if(pixels[p]>249&&pixels[p+1]>249&&pixels[p+2]>249)clipped++;}
      return {lit:lit,clipped:clipped,error:gl.getError()};
    })()`);
    console.log('RENDER',id,JSON.stringify(stats));
    if(!(stats.lit>100 && stats.clipped<Math.max(1,stats.lit*.15) && stats.error===0))failures.push(id);
    await screenshot(id);
  }
  check('all recipes visibly render as fluid smoke: '+failures.join(', '),failures.length===0);
  await ev(`document.querySelector('[data-panel="smoke"]').click()`);
  await sleep(200); await screenshot('library-desktop');
  check('desktop library leaves the preview exposed',await ev(`(()=>{const a=document.getElementById('toy-viewport').getBoundingClientRect(),b=document.getElementById('toy-panel-smoke').getBoundingClientRect();return b.left>=a.right-1;})()`));
  await ev(`__toy.set('smokePreset','cauldron');__toy.smokeTune('mass',1.75);var weight=document.getElementById('smoke-physics-WEIGHT');weight.value=125;weight.dispatchEvent(new Event('input'));document.getElementById('smoke-favorite').click();`);
  check('physics slider updates the live target',await ev(`__toy.smokePreset().physics.WEIGHT===125`));
  check('favorite stores exact tuning and live physics',await ev(`(()=>{const p=JSON.parse(localStorage.getItem('sluice-smoke-favorites-v1'))['cauldron'];return p.tuning.mass===1.75 && p.physics.WEIGHT===125 && p.solverVersion===1 && !p.preset.effect;})()`));
  await ev(`__toy.set('smokePreset','dragon');__toy.set('smokePreset','vortex-cannon')`);
  check('new looks do not inherit the saved tuning',await ev(`__toy.smokePreset().tuning.mass===1 && __toy.smokePreset().scale==='default'`));
  await ev(`document.getElementById('smoke-family').value='favorites';document.getElementById('smoke-family').dispatchEvent(new Event('change'));document.querySelector('[data-preset="smoke:cauldron"]').click();`);
  check('favorite selection restores saved tuning',await ev(`__toy.smokePreset().tuning.mass===1.75 && __toy.smokePreset().physics.WEIGHT===125 && document.querySelectorAll('.smoke-recipe:not([hidden])').length===1`));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
  for(const [button,filename] of [['smoke-export','sluice-smoke-cauldron.json'],['smoke-export-favorites','sluice-smoke-shortlist.json']]){
    const file=path.join(out,filename);fs.rmSync(file,{force:true});await ev(`document.getElementById('${button}').click()`);
    for(let n=0;n<60&&!fs.existsSync(file);n++)await sleep(100);
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    check('download '+filename,(saved.recipes?.[0] || saved).tuning.mass===1.75 && (saved.recipes?.[0] || saved).physics.WEIGHT===125);
  }
  check('switching presets keeps the live smoke, world and GPU resources',await game(`(function(){
    scene('rig');presetSet('smoke','cauldron');
    SmokeFluid.splat(.5,.5,20,30,{r:.3,g:.2,b:.1},.4);
    var gl=smokeCanvas.getContext('webgl2')||smokeCanvas.getContext('webgl');
    function read(){var optical=SmokeFluid.config.OPTICAL_DENSITY;SmokeFluid.config.OPTICAL_DENSITY=0;SmokeFluid.displayPass();SmokeFluid.config.OPTICAL_DENSITY=optical;var bytes=new Uint8Array(smokeCanvas.width*smokeCanvas.height*4);gl.readPixels(0,0,smokeCanvas.width,smokeCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
    var before=read(),oldCanvas=smokeCanvas,allocations=0,methods={};
    ['createTexture','createFramebuffer','createProgram'].forEach(function(k){methods[k]=gl[k];gl[k]=function(){allocations++;return methods[k].apply(gl,arguments);};});
    var snapshots=[];
    try {
      window.SmokePresets.recipes.forEach(function(p){presetSet('smoke',p.id);var after=read();snapshots.push(before.every(function(v,i){return v===after[i];}));});
      return snapshots.every(Boolean)&&allocations===0&&oldCanvas===smokeCanvas&&!smokeCleanSwitch;
    } finally {Object.keys(methods).forEach(function(k){gl[k]=methods[k];});}
  })()`));
  await ev(`__toy.scene('chimney');__toy.set('smokePreset','vortex-cannon')`);
  await game(`(async function(){for(var n=0;n<60;n++){presetTickSmoke(1/30);emittersTick(1/30);smokeFrame(1/30);if(n%8===0)await new Promise(requestAnimationFrame);}render();})()`);
  check('smoke clears without changing water or slimes',await ev(`(()=>{const a=__toy.stats();__toy.clearSmoke();const b=__toy.stats();return a.slimes>0&&a.water===b.water&&a.slimes===b.slimes;})()`));
  await ev(`__toy.scene('rig');__toy.smokeRigMode('drive');__toy.set('smokePreset','velvet-rope');__toy.pause(false)`);
  await sleep(1800);await screenshot('moving-fluid');console.log('LIVE',await ev('JSON.stringify(__toy.stats())'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/water-smoke-slime.html?smoke=cauldron`});
  for(let i=0;i<200;i++){if(await ev(`!!document.getElementById('smoke-family')`))break;await sleep(100);}
  await sleep(1500);await screenshot('phone-preview');
  check('phone has no horizontal overflow',await ev('document.documentElement.scrollWidth<=innerWidth'));
  await ev(`document.querySelector('[data-panel="smoke"]').click()`);await sleep(100);await screenshot('phone-library');
  check('phone library fits the viewport',await ev(`(()=>{const r=document.getElementById('toy-panel-smoke').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;})()`));
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?dev=1&nosave=1&nopause=1&tod=0.35`});
  for(let i=0;i<300;i++){if(await ev(`typeof __gameSmokeTest==='function' && __gameSmokeTest("introPhase === 'done'")`))break;await sleep(100);}
  check('Sluice boots with the shared smoke engine and live material API',await ev(`typeof gm.smokePhysics==='function' && __gameSmokeTest("introPhase==='done' && smokeFluidActive && SmokeFluid.isReady()")`));
  check('Sluice can change material without restarting its world',await ev(`__gameSmokeTest(\`(function(){
    var domain=SmokeFluid.getCanvas(),originalWorld=world,originalPlayer=player;
    gm.smokePhysics({HEAT:2,COOLING:1,BUOYANCY:100,WEIGHT:20});
    SmokeFluid.splat(.5,.5,0,12,{r:.2,g:.1,b:.05},.08);
    for(var n=0;n<30;n++)SmokeFluid.step(1/60);
    SmokeFluid.displayPass();var gl=domain.getContext('webgl2')||domain.getContext('webgl');
    var ok=domain===SmokeFluid.getCanvas() && world===originalWorld && player===originalPlayer && gm.smokePhysics().BUOYANCY===100 && gl.getError()===0;
    gm.smokePhysics({},0);return ok;
  })()\`)`));
  await screenshot('sluice-boot');
  check('no browser exceptions or console errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally { cleanup(); }
