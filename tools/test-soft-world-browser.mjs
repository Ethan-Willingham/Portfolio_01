// Actual asynchronous GPU water and resident coupling, with an owned testing browser.
// BUNDLE=/tmp/world-gpu-bundle.js PORT=8292 node tools/test-soft-world-browser.mjs
// FPS=30,60 selects actual asynchronously stepped GPU checks. CPU fallback fails this test.
// Native clocks are preserved; real readback generation, age, and wet wake are checked.
// BUNDLE=/tmp/another-sluice.js selects a snapshot; otherwise the built bundle is read once.
// Broad health assertions intentionally do not assert that numerical metrics establish feel.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8292), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/slime-world-gpu';
const cpu = process.env.CPU === '1';
const checkpoint = Number(process.env.STAGE || 3);
const playground = process.env.PLAYGROUND === '1';
const playgroundOnly = process.env.PLAYGROUND_ONLY === '1';
assert.ok(checkpoint === 3 || checkpoint === 4, 'STAGE is 3 or 4');
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '&cpufire=1&_rafTimer=1';
let stage = 'setup';
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
assert.ok(bundle.includes('SOFT_MATERIAL'), 'build material experiment first');
const servedBundle = bundle.slice(0, end) + '\nwindow.__materialTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-material-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const filename = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!filename.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    const data = filename === path.join(root, 'js/sluice.js') ? servedBundle : fs.readFileSync(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
let chrome, socket, watchdog, sequence = 0, cleaned = false;
const pending = new Map(), browserErrors = [], failures = [], results = [];
let gpuInfo, stale, wake, capture, ui, error;
const boots = [];
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  clearTimeout(watchdog);
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  try { socket?.close(); } catch {}
  chrome?.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
function send(method, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + ' during ' + stage)); }, timeout);
    pending.set(id, { resolve, reject, timer });

    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__materialTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __materialTest === 'function'")) {
      boot.last = await game(`({ intro: introPhase, assets: gameLoadingAssetsReady, work: gameLoadingWorkPending,
        terrainPending: terrainChunkPendingThisFrame, clouds: loadingCloudsReady(), frame: gameRafId,
        fence: gameLoadingFence ? { frames: gameLoadingFence.frames, gpuDone: gameLoadingFence.gpuDone, gl: gameLoadingFence.gl.length } : null,
        warm: window.__shaderWarm, hidden: document.hidden,
        loading: window.SluiceLoading ? SluiceLoading.report().tasks.filter(function(t) { return t.state === 'running'; }) : [] })`);
      if (boot.last.intro === 'done') {
        if (panel) await game('softPlayTick(0);');
        boot.elapsedMs = performance.now() - started;
        console.log('BOOT completed ' + JSON.stringify(boot));
        return true;
      }
      if (boot.last.assets && !boot.last.work && boot.last.intro === 'warmup') {
        // Exercise the actual loading renderer when headless rAF is not progressing.
        // Never override introPhase or mark any readiness gate complete ourselves.
        await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; renderLoadingScene();');
        boot.manualFrames++;
      }
    }
    await sleep(50);
  }
  boot.elapsedMs = performance.now() - started;
  console.log('BOOT incomplete ' + JSON.stringify(boot));
  return false;
}

try {
  console.log('BOOT snapshot ' + bundleHash + ' cpu=' + cpu);
  stage = 'browser startup';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', ...(cpu ? ['--disable-gpu', '--disable-software-rasterizer'] :
      ['--enable-unsafe-webgpu', '--use-angle=metal']), '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', fs.openSync(path.join(dump, 'chrome.log'), 'w')] });
  watchdog = setTimeout(() => { console.error('FAIL comparison exceeded three minutes during ' + stage); cleanup(); process.exit(1); }, 180000);
  let endpoint;
  const startupBegan = performance.now();
  for (let attempt = 0; performance.now() - startupBegan < 25000; attempt++) {
    assert.equal(chrome.exitCode, null, 'owned browser stays alive during startup');
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      endpoint = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(endpoint, 'testing browser started');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP socket open exceeded ten seconds')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', event => { clearTimeout(timer); reject(new Error('CDP socket failed: ' + event.message)); }, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request?.timer);

      message.error ? request?.reject(message.error) : request?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      browserErrors.push(message.params.args.map(value => value.value || value.description));
    }
  });
  console.log('BOOT browser connected'); stage = 'initial page navigation';
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  if(!playgroundOnly) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1&softterrain=1&softmaterial=1${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__materialPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  }
  gpuInfo=[];capture=[];
  if(!playgroundOnly) {
  const rates=(process.env.FPS||'30,60').split(',').map(Number);
  for(const fps of rates) {
    stage = 'actual water fixture setup at '+fps;
    const info=await game(`(${gpuSetup.toString()})(${checkpoint})`);gpuInfo.push({fps,...info});
    console.log('GPU '+JSON.stringify({fps,...info}));
    check('actual GPU simulation is active at '+fps,!cpu&&info.simActive&&info.renderActive);
    assert.ok(!cpu&&info.simActive&&info.renderActive,'actual GPU water required; CPU is not a substitute');
    let captured=false;const rows=[];
    for(let frame=0;frame<fps*2;frame++) {
      stage='GPU water '+fps+'Hz frame '+frame;
      const row={fps,...await game(`(${gpuFrame.toString()})(1/${fps},${frame})`)};
      results.push(row);rows.push(row);
      if(frame%fps===0)console.log('FRAME '+JSON.stringify(row));
      if(!captured&&frame>=8&&row.wet&&row.bins>0&&row.fresh) {
        captured=true;
        try {
          stage='water image capture';
          const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},5000);
          const name=path.join(dump,'gpu-water-'+fps+'.png');fs.writeFileSync(name,Buffer.from(shot.data,'base64'));
          capture.push({kind:'native viewport',path:name,fps,frame});
        } catch(error) { capture.push({error:String(error),fps,frame}); }
      }
      await sleep(Math.ceil(1000/fps));
    }
    check('actual GPU readbacks advanced at '+fps,rows.at(-1).generation>rows[0].generation+5);
    check('fresh GPU flow was sampled at a wet resident at '+fps,rows.some(row=>row.wet&&row.bins>0&&row.fresh));
    const wet=rows.filter(row=>row.frame>=4&&row.wet);
    const fraction=wet.filter(row=>row.fresh).length/Math.max(1,wet.length);
    console.log('FRESH '+JSON.stringify({fps,wetFrames:wet.length,fraction}));
    check('wet GPU samples stay fresh after acquisition at '+fps,wet.length>5&&fraction>=0.9);
    check('GPU water geometry remains legal at '+fps,rows.every(row=>row.finite&&!row.crossed&&row.embedded===0&&row.area>0.4&&row.area<1.8));
    check('GPU remained active throughout at '+fps,rows.every(row=>row.simActive));
    check('finite pool mass remains unchanged at '+fps,rows.every(row=>row.count===info.count));
  }
  stage='real stale readback';stale=await game(`(${gpuStale.toString()})()`);console.log('STALE '+JSON.stringify(stale));
  check('real blocked readback exceeds stale threshold',stale.afterAgeReal>0.1&&stale.afterGen===stale.beforeGen);
  check('stale flow is skipped without waking or changing skin velocity',stale.bins===0&&stale.unchanged&&stale.sleeping);
  await sleep(60);
  for(let frame=0;frame<45;frame++){
    await game('updateLiquids(1/60);');await sleep(16);
    if(await game('liquidWGPU.getReadbackAge()/softWorldWaterScale()<=0.1'))break;
  }
  stage='fresh flow wake';wake=await game(`(${gpuWake.toString()})()`);console.log('WAKE '+JSON.stringify(wake));
  check('fresh actual GPU flow wakes sleeping wet skin',wake.ageReal<=0.1&&wake.wet>0.05&&wake.flow>4&&wake.awake);
  check('GPU skin channel retains slow boundary velocity in liquid units',wake.boundaryError<1e-8&&wake.boundaryNonzero);
  fs.writeFileSync(path.join(dump,'gpu-report.json'),JSON.stringify({bundleHash,cpu,checkpoint,boots,gpuInfo,results,stale,wake,capture,browserErrors,failures},null,2));
  }
  if(playground) await runPlayground();
  check('no browser exceptions',browserErrors.length===0);
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({bundleHash,cpu,checkpoint,boots,gpuInfo,results,stale,wake,capture,ui,browserErrors,failures},null,2));
  assert.equal(failures.length,0,failures.join('\n'));
} catch(caught) {
  error={message:String(caught),stage};throw caught;
} finally {
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({bundleHash,cpu,checkpoint,boots,gpuInfo,results,stale,wake,capture,ui,browserErrors,failures,error},null,2));
  cleanup();
}

function gpuSetup(checkpoint) {
  resetJello();SOFT_INTENT=SOFT_WORLD=SOFT_PAIRS=SOFT_CONTACT=SOFT_HANDLING=SOFT_TERRAIN=SOFT_MATERIAL=true;SOFT_PRESENTATION=checkpoint>=4;
  clearTimeout(gameRafId);cancelAnimationFrame(gameRafId);gameRafId=0;
  gamePaused=gameOver=gameWon=bathMode=false;shopState='closed';skySlimes.length=0;surfaceSlimesSeeded=true;
  var origin=DECK_CENTER_COL-18,x=origin*TILE,ground=SKY_ROWS*TILE,floor=ground-3*TILE;
  for(var r=0;r<=SKY_ROWS+6;r++)for(var c=origin-12;c<=origin+12;c++) {
    world[r][c]=r>=SKY_ROWS || (r>=SKY_ROWS-3&&(c===origin-3||c===origin+2))?{type:'foundation',hp:999}:null;
    invalidateTerrainAround(r,c);
  }
  for(var lp=liquidCount-1;lp>=0;lp--)removeLiquidParticle(lp);
  liquidSurfacePools={water:null,oil:null};liquidStepAcc=0;liquidPendingDt=0;liquidSimSkipFrames=0;
  var spacing=LIQUID_CELL*LIQUID_PDELTA;
  for(var wy=floor+35;wy<floor+3*TILE-4;wy+=spacing)for(var wx=x-2*TILE+4;wx<x+2*TILE-4;wx+=spacing)addLiquidParticle(0,wx,wy,35,0,0);
  player.x=x-250;player.y=ground-PLAYER_H;player.thrusting=false;player.vx=player.vy=0;player.fuel=100;
  player.renderX=player.x;player.renderY=player.y;
  cam.x=x-screenW/2;cam.y=ground-screenH*.65;
  var b=surfaceSlimeBuild(x,floor+30,{id:99501,seed:.45,r:24.3});surfaceSlimeDetach(b,30);
  window.__worldWaterState={body:b,x:x,floor:floor,count:liquidCount};
  return {simActive:!!(liquidWGPU&&liquidWGPU.simActive),renderActive:!!(liquidWGPU&&liquidWGPU.renderActive),
    flags:{pairs:SOFT_PAIRS,intent:SOFT_INTENT,world:SOFT_WORLD,presentation:SOFT_PRESENTATION},count:liquidCount,generation:liquidWGPU.readbackApplyGen,age:liquidWGPU.getReadbackAge(),adapter:liquidWGPU.adapterInfo||null};
}
function gpuFrame(dt,frame) {
  surfaceSlimeTick(dt);updateLiquids(dt);updateJello(dt);if(frame%3===0)render();
  var b=window.__worldWaterState.body,area=0,embedded=0,finite=true;
  for(var k=0;k<b.ringN;k++){var a=b.ring[k],c=b.ring[(k+1)%b.ringN];area+=b.px[a]*b.py[c]-b.py[a]*b.px[c];}
  for(k=0;k<b.n;k++){finite=finite&&isFinite(b.px[k]+b.py[k]+b.ox[k]+b.oy[k]);if(jelloWorldSolidAt(b.px[k],b.py[k]))embedded++;}
  return {frame:frame,simActive:liquidWGPU.simActive,generation:liquidWGPU.readbackApplyGen,age:liquidWGPU.getReadbackAge(),
    ageReal:liquidWGPU.getReadbackAge()/softWorldWaterScale(),fresh:isFinite(liquidWGPU.getReadbackAge())&&liquidWGPU.getReadbackAge()/softWorldWaterScale()<=0.1,bins:softWorldWaterBins.size,wet:b.surfaceSlime.wet,count:liquidCount,area:Math.abs(area*.5)/b.restArea,
    crossed:softTerrainSkinCrossed(b),embedded:embedded,finite:finite,x:b.cx,y:b.cy};
}
function gpuStale() {
  var b=window.__worldWaterState.body;
  // Withhold the JS event-loop turn needed by mapAsync, while real GPU work
  // advances its simulation clock. The mirror age below is the real API value.
  softWorldFrame([b],1,1/60);
  var gen=liquidWGPU.readbackApplyGen,age=liquidWGPU.getReadbackAge();
  for(var n=0;n<15;n++)updateLiquids(1/60);
  b.sleeping=true;b.sleepFrames=99;b._solve=false;
  var before=JSON.stringify([Array.from(b.px),Array.from(b.py),Array.from(b.ox),Array.from(b.oy)]);
  softWorldFrame([b],1,1/60);softWorldStep(b,jelloStepH);
  return {beforeGen:gen,afterGen:liquidWGPU.readbackApplyGen,beforeAge:age,afterAge:liquidWGPU.getReadbackAge(),
    afterAgeReal:liquidWGPU.getReadbackAge()/softWorldWaterScale(),bins:softWorldWaterBins.size,sleeping:b.sleeping,
    unchanged:before===JSON.stringify([Array.from(b.px),Array.from(b.py),Array.from(b.ox),Array.from(b.oy)])};
}
function gpuWake() {
  var s=window.__worldWaterState,b=s.body;
  // Move the actual body into the real pool to test sleep against actual
  // readback flow. Use an equal position/history translation, then stop it.
  var dx=s.x-b.cx,dy=s.floor+60-b.cy;
  for(var i=0;i<b.n;i++){b.px[i]+=dx;b.py[i]+=dy;b.ox[i]=b.px[i];b.oy[i]=b.py[i];}
  jelloUpdateBody(b,jelloStepH);b.bathBuoy=null;b.sleeping=false;
  softWorldFrame([b],1,1/60);b.sleeping=true;b._solve=false;b.sleepFrames=99;
  softWorldFrame([b],1,1/60);
  var wet=0,flow=0;
  for(i=0;i<b.ringN;i++){var k=b.ring[i];softWorldWaterSample(b.px[k],b.py[k]);
    if(softWorldSampleWet>0.05){wet=Math.max(wet,softWorldSampleWet);flow=Math.max(flow,Math.hypot(softWorldSampleX,softWorldSampleY));}}
  var awake=!b.sleeping&&b._solve;
  // A slow moving boundary must not disappear under the legacy 20 px/s fade.
  for(i=0;i<b.n;i++){b.ox[i]=b.px[i]-10*jelloStepH/JELLO_TIMESCALE;b.oy[i]=b.py[i]+6*jelloStepH/JELLO_TIMESCALE;}
  surfaceSlimeTick(1/60);
  var pts=surfaceSlimeGuests[0].pts,error=0,nonzero=false;
  for(i=0;i<pts.length;i+=4){error=Math.max(error,Math.abs(pts[i+2]*softWorldWaterScale()-10),Math.abs(pts[i+3]*softWorldWaterScale()+6));nonzero=nonzero||pts[i+2]!==0;}
  return {age:liquidWGPU.getReadbackAge(),ageReal:liquidWGPU.getReadbackAge()/softWorldWaterScale(),generation:liquidWGPU.readbackApplyGen,wet:wet,flow:flow,awake:awake,boundaryError:error,boundaryNonzero:nonzero};
}


async function runPlayground() {
  stage='actual playground navigation';
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?softplay=1&softnext=1&softstage=${checkpoint}&nopause=1&tod=0.35${extraParams}`});
  assert.ok(await awaitBoot(true),'actual playground completes loading');
  await game('clearTimeout(gameRafId);cancelAnimationFrame(gameRafId);gameRafId=0;');
  await evaluate("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await sleep(200);
  const controls=await evaluate(`(()=>{const panel=document.getElementById('soft-contact-playtest'),select=panel.querySelector('[aria-label="Interaction"]');
    const r=select.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,options:Array.from(select.options).map(o=>[o.value,o.textContent])};})()`);
  // Verify trusted browser key routing without claiming that CDP can commit
  // this platform's native popup. Retain the event and inspect it after all
  // DOM handlers have run, so defaultPrevented includes the game listener.
  await evaluate(`(()=>{const select=document.querySelector('#soft-contact-playtest [aria-label=Interaction]');
    select.addEventListener('keydown',event=>{window.__softSelectorKey=event;},{once:true});select.focus();})()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  const keyboardDown=await game("({scene:softPlayCase,key:!!keys.ArrowDown,trusted:!!(window.__softSelectorKey&&window.__softSelectorKey.isTrusted),defaultPrevented:window.__softSelectorKey?window.__softSelectorKey.defaultPrevented:null,target:window.__softSelectorKey?window.__softSelectorKey.target.tagName:null})");
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  const keyboardUp=await game('!!keys.ArrowDown');
  await game('keys.ArrowDown=true;');
  await evaluate("document.querySelector('#soft-contact-playtest [aria-label=Interaction]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  const heldKeyCleared=await game('!keys.ArrowDown');
  check('trusted selector ArrowDown retains native default without driving the rig',keyboardDown.trusted&&keyboardDown.target==='SELECT'&&keyboardDown.defaultPrevented===false&&!keyboardDown.key&&!keyboardUp);
  check('selector keyup clears a previously held game direction',heldKeyCleared);
  // Select the water fixture through its actual production change handler.
  // Repeat below uses a real browser mouse click.
  await evaluate(`(()=>{const select=document.querySelector('#soft-contact-playtest [aria-label="Interaction"]');select.value='water';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const first=await game(`(${playgroundPose.toString()})()`);
  ui={keyboard:{down:keyboardDown,upLatched:keyboardUp,heldKeyCleared},selection:'production DOM select change handler',controls,first:{...first,pose:undefined},frames:[]};
  check('actual select change handler selected Water basin',first.scene==='water'&&first.savesDisabled&&first.count>1000&&first.ids.length===2);
  assert.equal(first.scene,'water','actual scene selection succeeded');
  for(let frame=0;frame<90;frame++) {
    stage='actual playground water frame '+frame;
    const row=await game(`(${playgroundFrame.toString()})(1/60,${frame})`);ui.frames.push(row);
    if(!ui.capture&&frame>15&&row.wet>0&&row.bins>0) {
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},5000);
      const name=path.join(dump,'actual-playground-water.png');fs.writeFileSync(name,Buffer.from(shot.data,'base64'));ui.capture={frame,path:name};
    }
    await sleep(17);
  }
  const repeat=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('#soft-contact-playtest button')).find(b=>b.textContent==='Repeat');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  stage='actual playground Repeat';
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:repeat.x,y:repeat.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:repeat.x,y:repeat.y,button:'left',clickCount:1});
  const after=await game(`(${playgroundPose.toString()})()`);
  ui.after={...after,pose:undefined};ui.beforeHash=createHash('sha256').update(first.pose).digest('hex');ui.afterHash=createHash('sha256').update(after.pose).digest('hex');
  check('actual Repeat restores resident pose and finite water exactly',ui.beforeHash===ui.afterHash&&first.count===after.count);
  check('actual playground runs all requested checkpoints',first.flags.pairs&&first.flags.intent&&first.flags.world&&first.flags.presentation===(checkpoint>=4));
  check('actual playground wets residents and produces real flow',ui.frames.some(row=>row.wet>0&&row.flow>4&&row.bins>0));
  check('actual playground GPU readbacks advance',ui.frames.at(-1).generation>ui.frames[0].generation+5);
  check('actual playground retains legal bodies and fluid mass',ui.frames.every(row=>row.simActive&&row.crossed===0&&row.embedded===0&&row.finite&&row.count===first.count));
  console.log('PLAYGROUND '+JSON.stringify({count:first.count,flags:first.flags,repeat:ui.beforeHash===ui.afterHash,capture:ui.capture}));
  stage='ordinary default boot';
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1${extraParams}`});
  assert.ok(await awaitBoot(),'ordinary page completes loading');
  ui.defaults=await game('({contact:SOFT_CONTACT,handling:SOFT_HANDLING,terrain:SOFT_TERRAIN,material:SOFT_MATERIAL,pairs:SOFT_PAIRS,intent:SOFT_INTENT,world:SOFT_WORLD,presentation:SOFT_PRESENTATION})');
  check('ordinary boot leaves all eight experiments off',Object.values(ui.defaults).every(value=>value===false));
  console.log('DEFAULTS '+JSON.stringify(ui.defaults));
}
function playgroundPose() {
  var bodies=jelloBodies.filter(function(b){return !!b.surfaceSlime;});
  return {scene:softPlayCase,savesDisabled:SAVE_DISABLED,ids:bodies.map(function(b){return b.surfaceSlime.id;}),count:liquidCount,
    flags:{pairs:SOFT_PAIRS,intent:SOFT_INTENT,world:SOFT_WORLD,presentation:SOFT_PRESENTATION},
    pose:JSON.stringify({bodies:bodies.map(function(b){return[Array.from(b.px),Array.from(b.py),Array.from(b.ox),Array.from(b.oy)];}),
      water:[Array.from(liquidX.subarray(0,liquidCount)),Array.from(liquidY.subarray(0,liquidCount)),Array.from(liquidVX.subarray(0,liquidCount)),Array.from(liquidVY.subarray(0,liquidCount))]})};
}
function playgroundFrame(dt,frame) {
  softPlayTick(dt);surfaceSlimeTick(dt);updateLiquids(dt);updateJello(dt);if(frame%3===0)render();
  var crossed=0,embedded=0,finite=true,wet=0,flow=0;
  for(var bi=0;bi<jelloBodies.length;bi++){
    var b=jelloBodies[bi];if(!b.surfaceSlime)continue;wet+=b.surfaceSlime.wet;
    crossed+=softTerrainSkinCrossed(b)?1:0;
    for(var k=0;k<b.n;k++){finite=finite&&isFinite(b.px[k]+b.py[k]+b.ox[k]+b.oy[k]);if(jelloWorldSolidAt(b.px[k],b.py[k]))embedded++;}
  }
  for(var i=0;i<liquidCount;i++)flow=Math.max(flow,Math.hypot(liquidVX[i],liquidVY[i])*softWorldWaterScale());
  return {frame,simActive:liquidWGPU.simActive,count:liquidCount,generation:liquidWGPU.readbackApplyGen,
    ageReal:liquidWGPU.getReadbackAge()/softWorldWaterScale(),bins:softWorldWaterBins.size,wet,flow,crossed,embedded,finite};
}
