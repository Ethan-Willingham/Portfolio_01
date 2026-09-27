// Sequential resident physics integration comparison. Uses a private Chrome for Testing child.
// CPU=1 STAGES=1,2,3,4 FPS=30,60,144 DUMP=/tmp/my-run
// LIFECYCLE=1 adds save, bath conversion, sleep, and menu integration checks.
// CPU=1 uses software graphics and CPU water/fire for the dry geometry and UI fixtures.
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
const port = Number(process.env.PORT || 8284), debug = port + 1000;
const dump = process.env.DUMP || '/tmp/sluice-soft-project';
const cpu = process.env.CPU !== '0';
const extraParams = cpu ? '&cpuwater=1&cpufire=1&_rafTimer=1' : '';
let stage = 'setup';
const skipUI = process.env.SKIP_UI === '1';
const stages = (process.env.STAGES || '1').split(',').map(Number);
const rates = (process.env.FPS || '30,60,144').split(',').map(Number);
const selected = (process.env.CASES || 'head-on,glancing,pile,support,wall,jet,water').split(',');
const modes = (process.env.MODES || 'prior,new').split(',');
assert.ok(stages.every(s => Number.isInteger(s) && s >= 1 && s <= 4), 'STAGES between 1 and 4');
assert.ok(rates.every(fps => fps >= 20 && fps <= 240), 'FPS between 20 and 240');
assert.ok(selected.every(name => ['head-on','glancing','pile','support','wall','jet','water'].includes(name)), 'known CASES');
assert.ok(modes.every(mode => ['prior','new'].includes(mode)), 'known MODES');
fs.mkdirSync(dump, { recursive: true });
const bundlePath = process.env.BUNDLE || path.join(root, 'js/sluice.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const end = bundle.lastIndexOf('})();');
assert.ok(end > 0 && bundle.includes('SOFT_HANDLING'), 'built bundle contains handling experiment');
assert.ok(bundle.includes('SOFT_MATERIAL'), 'build material experiment first');
assert.ok(bundle.includes('SOFT_PROJECT_MAX_STAGE'), 'build project stages first');
const servedBundle = bundle.slice(0, end) + '\nwindow.__projectTest = function(source) { return eval(source); };\n' + bundle.slice(end);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync('/tmp/sluice-soft-project-browser-');
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
let ui, defaults, lifecycle;
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
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + ' during ' + stage)); }, 30000);
    pending.set(id, { resolve, reject, timer });

    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__projectTest(${JSON.stringify(source)})`);
function check(label, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + label);
  if (!condition) failures.push(label);
}

async function awaitBoot(panel = false) {
  const started = performance.now(), boot = { manualFrames: 0, last: null };
  boots.push(boot);
  while (performance.now() - started < 30000) {
    if (await evaluate("typeof __projectTest === 'function'")) {
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
      if (cpu && boot.last.assets && !boot.last.work && boot.last.intro === 'warmup') {
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
  watchdog = setTimeout(() => { console.error('FAIL comparison exceeded ten minutes during ' + stage); cleanup(); process.exit(1); }, 600000);
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35&softcontact=1&softhandling=1&softterrain=1&softmaterial=1${extraParams}` });
  assert.ok(await awaitBoot(), 'fixture page completes its real loading gates');
  console.log('BOOT state ' + JSON.stringify(await game("({ intro: introPhase, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, savesDisabled: SAVE_DISABLED })"))); stage = 'fixture initialization';
  assert.ok(await game("introPhase === 'done' && SAVE_DISABLED && SOFT_CONTACT && SOFT_HANDLING"), 'game boots with saves disabled');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  await game(`clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0; devMode = false;
    window.__materialPlayerInitial = JSON.parse(JSON.stringify(player));
    skySlimes.length = 0; skySlimeNext = 100000; surfaceSlimesSeeded = true;`);

  const available = await game('SOFT_PROJECT_MAX_STAGE');
  assert.ok(stages.every(s => s <= available), `requested stages are installed (max ${available})`);
  for (const checkpoint of stages) for (const fps of rates) for (const name of selected) {
    if (checkpoint < 3 && (name === 'jet' || name === 'water')) continue;
    for (const mode of modes) {
      stage = `${checkpoint}/${name}/${fps}/${mode}`;
      console.log('START '+stage);
      const result = await game(`(${runProjectFixture.toString()})(${JSON.stringify({ checkpoint, fps, name, mode })}, ${health.toString()})`);
      results.push(result); const { initial, samples, ...compact } = result; console.log('CASE '+JSON.stringify(compact));
      check(stage+' finite and present',result.finite && result.alive);
      if (mode === 'new') {
        check(stage+' intact skin and health triangles',result.maxCrossings===0 && result.minDet>=-1e-6);
        if(checkpoint >= 2)check(stage+' no overlapping collinear skin edges',result.maxSkinOverlaps===0);
        check(stage+' no inter-body skin crossings',result.maxInterCrossings===0 && result.maxInsideDepth<0.15);
        check(stage+' clear terrain',result.embedded===0 && result.segmentHits===0 && result.enclosed===0);
        check(stage+' bounded volume',result.minArea>0.4 && result.maxArea<1.8);
        if(checkpoint >= 3 && name==='jet')check(stage+' actual jet momentum recoils the rig',result.rigRecoil < -1);
        if(checkpoint >= 3 && name==='water')check(stage+' actual water flow and hydrostatic lift reach the skin',result.waterInitial > 0 && result.maxWet > 0 && result.maxWaterSpeed > 0 && result.hydrostatic);
        if(name==='support'){check(stage+' upper body is supported before extraction',result.supportClearance>8 && result.supportContacts>0);check(stage+' removing bottom support makes upper body fall',result.supportDrop>12);}
      }
      if(result.release)check(stage+' release preserves node state',result.release.unchanged && result.release.cleared && result.release.recovery===0);
      writeReport();
    }
  }
  for(let i=0;i<results.length;i++) {
    const a=results[i],b=results.find(r=>r!==a&&r.checkpoint===a.checkpoint&&r.fps===a.fps&&r.name===a.name&&r.mode!==a.mode);
    if(b && a.mode==='prior')check(`stage${a.checkpoint}/${a.name}/${a.fps} identical starting material`,a.initial===b.initial);
  }
  if (process.env.LIFECYCLE === '1') await runLifecycle();
  if(!skipUI)await runUI();
  check('no browser exceptions',browserErrors.length===0);writeReport({ui,defaults,lifecycle});
  assert.equal(failures.length,0,failures.join('\n'));
} catch(error) {
  fs.writeFileSync(path.join(dump,'interrupted.json'),JSON.stringify({stage,error:String(error),bundleHash,boots,results,browserErrors},null,2));throw error;
} finally { cleanup(); }
function writeReport(extra={}) {
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({bundlePath,bundleHash,cpu,boots,results,browserErrors,failures,
    notes:['Physics timings exclude geometry assertions, rendering, and fluid steps.','Prior mode holds every earlier checkpoint enabled.','Numerical safeguards cannot establish satisfying feel.'],...extra},null,2));
}
function runProjectFixture(spec, health) {
  var nativeRandom=Math.random, nativeNow=performance.now, clock=100000, rng=314159265;
  var realNow=performance.now.bind(performance);
  Math.random=function(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  performance.now=function(){return clock;};
  var dt=1/spec.fps, bodies=[], times=[], origin=DECK_CENTER_COL-18, x=origin*TILE, floor=SKY_ROWS*TILE;
  var impact=spec.name==='head-on'||spec.name==='glancing', held=spec.name==='support'||spec.name==='wall';
  try {
    if(surfaceSlimeGrip)surfaceSlimeGrabEnd(undefined,true);
    resetJello();skySlimes.length=0;skySlimeNext=1e9;surfaceSlimesSeeded=true;
    SOFT_CONTACT=SOFT_HANDLING=SOFT_TERRAIN=SOFT_MATERIAL=true;
    softProjectStage=spec.checkpoint;softProjectEnabled=true;softProjectSelect(spec.mode==='new');softContactClear();
    Object.keys(keys).forEach(function(key){keys[key]=false;});dpad.left=dpad.right=dpad.up=dpad.down=false;
    Object.assign(player,JSON.parse(JSON.stringify(window.__materialPlayerInitial)));
    gamePaused=gameOver=gameWon=shopOpen=ledgerOpen=cargoManifestOpen=bathMode=false;shopState='closed';
    drilling=null;hitPauseT=0;siphon.equipped=false;
    player.x=x-250;player.y=floor-PLAYER_H;player.vx=player.vy=0;player.onJello=false;player.onGround=true;
    player.thrusting=false;player.thrustSpool=0;player.bodyTiltRender=0;
    player.renderX=player.x;player.renderY=player.y;
    for(var r=0;r<=SKY_ROWS+8;r++)for(var c=origin-15;c<=origin+15;c++){
      world[r][c]=r>=SKY_ROWS||(spec.name==='wall'&&c===origin+3&&r>=SKY_ROWS-4)?{type:'foundation',hp:ORES.foundation.hp}:null;
      invalidateTerrainAround(r,c);
    }
    for(var lp=liquidCount-1;lp>=0;lp--)removeLiquidParticle(lp);
    var count=impact?2:spec.name==='wall'||spec.name==='water'?1:spec.name==='support'?2:6;
    for(var j=0;j<count;j++){
      var bx=impact?x+(j?65:-65):spec.name==='support'?x:x+(j%2)*58-29;
      var by=impact?floor-145+(spec.name==='glancing'&&j?20:0):floor-28-(spec.name==='support'?j:Math.floor(j/2))*58;
      if(count===1)bx=x;
      var b=surfaceSlimeBuild(bx,by,{id:99000+j,seed:.46+j*.03,hue:133+j*41,r:24.3});
      surfaceSlimeDetach(b,30);bodies.push(b);
    }
    cam.x=x-screenW*.5;cam.y=floor-screenH*.65;
    if(impact)for(j=0;j<2;j++)for(var p=0;p<bodies[j].n;p++)bodies[j].ox[p]-=(j?-180:180)*(JELLO_H/Math.max(1,JELLO_XPBD_SUBSTEPS))/JELLO_TIMESCALE;
    var out={checkpoint:spec.checkpoint,mode:spec.mode,name:spec.name,fps:spec.fps,finite:true,alive:true,maxCrossings:0,maxSkinOverlaps:0,maxInterCrossings:0,
      maxInsideDepth:0,maxWet:0,maxWaterSpeed:0,hydrostatic:false,minDet:1,embedded:0,segmentHits:0,enclosed:0,minArea:Infinity,maxArea:0,maxPairContacts:0,maxPairImpulse:0,
      firstViolation:null,release:null,supportDrop:0,samples:[],initial:JSON.stringify(bodies.map(pose))};
    // Stacks begin legally separated and settle under gravity before handling.
    if(!impact)for(var settle=0;settle<240;settle++){clock+=1000/120;updateJello(1/120);observe(-2+settle/120);}
    var base=bodies[0],gripX=base.cx,gripY=base.cy;
    var upper=bodies[bodies.length-1],supportStart=upper.cy;
    out.supportClearance=floor-upper.bboxB;out.supportContacts=out.maxPairContacts;
    if(held)surfaceSlimeGrabStart(gripX,gripY,'fixture');
    if(spec.name==='jet'){
      player.x=x-PLAYER_W/2;player.y=Math.min.apply(null,bodies.map(function(b){return b.bboxT;}))-38-PLAYER_H;
      player.renderX=player.x;player.renderY=player.y;player.fuel=maxFuel;player.thrusting=true;
    }
    if(spec.name==='water'){
      // Real moving water, initially beside the resident, goes through the CPU solver.
      for(var wy=floor-42;wy<floor-3;wy+=2.5)for(var wx=x-65;wx<x-28;wx+=2.5){
        if(typeof addWaterParticle==='function')addWaterParticle(wx,wy,90,0);
        else if(typeof addLiquidParticle==='function')addLiquidParticle(0,wx,wy,90,0);
      }
      out.waterInitial=liquidCount;
    }
    var total=Math.round(spec.fps*3),releaseFrame=Math.round(spec.fps*1.2);
    for(var frame=0;frame<total;frame++){
      var t=frame*dt;
      if(held&&frame===releaseFrame){var before=JSON.stringify(pose(base));surfaceSlimeGrabEnd('fixture',false);
        out.release={unchanged:before===JSON.stringify(pose(base)),cleared:!surfaceSlimeGrip&&!base._grabbed,recovery:base._recoverT||0};}
      if(held&&frame<releaseFrame){var ramp=Math.min(1,(t+dt)/1.0);surfaceSlimeGrabMove(gripX+ramp*(spec.name==='support'?180:130),gripY+(spec.name==='support'?-5:-28)*ramp,'fixture');}
      clock+=dt*1000;
      // Keep deterministic passive intentions for contact fixtures. World
      // collision, pointer compliance, gravity, and the material remain live.
      if(spec.name==='water'){surfaceSlimeTick(dt);updateLiquids(dt);}
      var start=realNow();updateJello(dt);times.push(realNow()-start);
      observe(t);
      if(frame%Math.max(1,Math.round(spec.fps/10))===0)out.samples.push({t:t,centres:bodies.map(function(b){return[b.cx,b.cy];}),pairContacts:typeof softPairsReport!=='undefined'?softPairsReport.contacts:0});
    }
    out.supportDrop=upper.cy-supportStart;out.rigRecoil=player.vy;
    out.waterFinal=liquidCount;out.final=bodies.map(function(b){return{cx:b.cx,cy:b.cy,vx:b.vx*JELLO_TIMESCALE,vy:b.vy*JELLO_TIMESCALE};});
    times.sort(function(a,b){return a-b;});out.physicsMs={median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]};
    return out;
    function pose(b){return[Array.from(b.px),Array.from(b.py),Array.from(b.ox),Array.from(b.oy)];}
    function observe(t){
      var inter=0,depth=0;
      for(var a=0;a<bodies.length;a++){
        var b=bodies[a],h=health(b);
        if (typeof softWorldBody === 'function' && softWorldBody(b) && spec.name === 'water') {
          out.hydrostatic = out.hydrostatic || !!b.bathBuoy;
          for (var wetK = 0; wetK < b.ringN; wetK++) {
            var wetNode = b.ring[wetK]; softWorldWaterSample(b.px[wetNode],b.py[wetNode]);
            out.maxWet = Math.max(out.maxWet,softWorldSampleWet);
            out.maxWaterSpeed = Math.max(out.maxWaterSpeed,Math.hypot(softWorldSampleX,softWorldSampleY));
          }
        }
        out.finite=out.finite&&h.finite;out.alive=out.alive&&jelloBodies.indexOf(b)>=0;
        out.maxCrossings=Math.max(out.maxCrossings,h.crossings);out.maxSkinOverlaps=Math.max(out.maxSkinOverlaps,h.overlaps);out.minDet=Math.min(out.minDet,h.minDet);
        out.minArea=Math.min(out.minArea,h.area);out.maxArea=Math.max(out.maxArea,h.area);
        out.embedded+=h.embedded;out.segmentHits+=h.segmentHits;out.enclosed+=h.enclosed;
        if(!out.firstViolation&&(!h.finite||h.crossings||h.minDet< -1e-6||h.embedded||h.segmentHits||h.enclosed))out.firstViolation={t:t,body:a,health:h};
        for(var z=a+1;z<bodies.length;z++){
          var c=bodies[z];
          for(var i=0;i<b.ringN;i++)for(var k=0;k<c.ringN;k++){
            var bi=b.ring[i],bj=b.ring[(i+1)%b.ringN],ci=c.ring[k],cj=c.ring[(k+1)%c.ringN];
            var ax=b.px[bi],ay=b.py[bi],bx=b.px[bj],by=b.py[bj],cx=c.px[ci],cy=c.py[ci],dx=c.px[cj],dy=c.py[cj];
            if(Math.max(ax,bx)<=Math.min(cx,dx)||Math.min(ax,bx)>=Math.max(cx,dx)||Math.max(ay,by)<=Math.min(cy,dy)||Math.min(ay,by)>=Math.max(cy,dy))continue;
            var c1=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),c2=(bx-ax)*(dy-ay)-(by-ay)*(dx-ax);
            var c3=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx),c4=(dx-cx)*(by-cy)-(dy-cy)*(bx-cx);
            if(c1*c2< -1e-8&&c3*c4< -1e-8)inter++;
          }
          inside(b,c);inside(c,b);
        }
      }
      out.maxInterCrossings=Math.max(out.maxInterCrossings,inter);out.maxInsideDepth=Math.max(out.maxInsideDepth,depth);
      if(!out.firstViolation&&(inter||depth>.15))out.firstViolation={t:t,interCrossings:inter,insideDepth:depth};
      if(typeof softPairsReport!=='undefined'){out.maxPairContacts=Math.max(out.maxPairContacts,softPairsReport.contacts,jelloContactsThisFrame);out.maxPairImpulse=Math.max(out.maxPairImpulse,softPairsReport.impulse);}
      function inside(A,B){for(var k=0;k<A.ringN;k++){var p=A.ring[k],x=A.px[p],y=A.py[p];if(!jelloPointInRing(B,x,y))continue;var q=jelloNearestOnRing(B,x,y);depth=Math.max(depth,Math.hypot(x-q.x,y-q.y));}}
    }
  }finally{if(surfaceSlimeGrip)surfaceSlimeGrabEnd(undefined,true);Math.random=nativeRandom;performance.now=nativeNow;}
}
function health(b) {
    function cross(a,c,d) { return (b.px[c]-b.px[a])*(b.py[d]-b.py[a])-(b.py[c]-b.py[a])*(b.px[d]-b.px[a]); }
    var out = { finite: true, area: 0, embedded: 0, segmentHits: 0, enclosed: 0, crossings: 0, overlaps: 0, minDet: 1 }, eps = 0.05;
    for (var p = 0; p < b.n; p++) {
      out.finite = out.finite && isFinite(b.px[p] + b.py[p] + b.ox[p] + b.oy[p]);
      if (jelloWorldSolidAt(b.px[p], b.py[p])) {
        var col = Math.floor(b.px[p] / TILE), row = Math.floor(b.py[p] / TILE);
        if (Math.min(b.px[p] - col * TILE, (col + 1) * TILE - b.px[p], b.py[p] - row * TILE, (row + 1) * TILE - b.py[p]) > eps) out.embedded++;
      }
    }
    for (var k = 0; k < b.ringN; k++) {
      var a = b.ring[k], z = b.ring[(k + 1) % b.ringN];
      out.area += (b.px[a] - b.cx) * (b.py[z] - b.cy) - (b.px[z] - b.cx) * (b.py[a] - b.cy);
      for (var j = k + 2; j < b.ringN; j++) {
        if (k === 0 && j === b.ringN - 1) continue;
        var c = b.ring[j], d = b.ring[(j + 1) % b.ringN];
        if (cross(a, z, c) * cross(a, z, d) < -1e-8 && cross(c, d, a) * cross(c, d, z) < -1e-8) out.crossings++;
        var edgeX = b.px[z] - b.px[a], edgeY = b.py[z] - b.py[a], edgeL2 = edgeX*edgeX + edgeY*edgeY;
        if (edgeL2 > 1e-10 && Math.abs(cross(a,z,c)) < 1e-7 && Math.abs(cross(a,z,d)) < 1e-7) {
          var uc = ((b.px[c]-b.px[a])*edgeX + (b.py[c]-b.py[a])*edgeY)/edgeL2;
          var ud = ((b.px[d]-b.px[a])*edgeX + (b.py[d]-b.py[a])*edgeY)/edgeL2;
          if ((Math.min(1,Math.max(uc,ud))-Math.max(0,Math.min(uc,ud)))*Math.sqrt(edgeL2) > 1e-5) out.overlaps++;
        }
      }
      for (var row = Math.max(0, Math.floor(Math.min(b.py[a], b.py[z]) / TILE)); row <= Math.floor(Math.max(b.py[a], b.py[z]) / TILE); row++)
        for (var col = Math.floor(Math.min(b.px[a], b.px[z]) / TILE); col <= Math.floor(Math.max(b.px[a], b.px[z]) / TILE); col++) {
          if (!tileAt(row, col)) continue;
          var dx = b.px[z] - b.px[a], dy = b.py[z] - b.py[a], low = 0, high = 1;
          var pp = [-dx, dx, -dy, dy], qq = [b.px[a] - col * TILE - eps, (col + 1) * TILE - eps - b.px[a], b.py[a] - row * TILE - eps, (row + 1) * TILE - eps - b.py[a]];
          for (var s = 0; s < 4 && low < high; s++) {
            if (Math.abs(pp[s]) < 1e-10) { if (qq[s] < 0) high = -1; }
            else if (pp[s] < 0) low = Math.max(low, qq[s] / pp[s]); else high = Math.min(high, qq[s] / pp[s]);
          }
          if (low < high - 1e-8) out.segmentHits++;
        }
    }
    out.area = Math.abs(out.area) / (2 * b.restArea);
    for (row = Math.max(0, Math.floor(b.bboxT / TILE)); row <= Math.floor(b.bboxB / TILE); row++)
      for (col = Math.floor(b.bboxL / TILE); col <= Math.floor(b.bboxR / TILE); col++) {
        if (!tileAt(row, col)) continue;
        [[0.5,0.5],[0.01,0.01],[0.99,0.01],[0.01,0.99],[0.99,0.99]].forEach(function(q) { if (jelloPointInRing(b, (col + q[0]) * TILE, (row + q[1]) * TILE)) out.enclosed++; });
      }
    for (var t = 0; t < b.triN; t++) {
      var ii = t * 4, det = cross(b.triA[t], b.triB[t], b.triC[t]) * (b.triDmInv[ii] * b.triDmInv[ii + 3] - b.triDmInv[ii + 1] * b.triDmInv[ii + 2]);
      out.minDet = Math.min(out.minDet, det);
    }
    return out;
  }

async function runUI() {
  stage = 'UI navigation';
  // Fresh navigation verifies the opt-in page and real mouse/touch event routing.
  // Persistence must be disabled by softplay itself, without a nosave parameter.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?softplay=1&softnext=1&softstage=${Math.max(...stages)}&nopause=1&tod=0.35${extraParams}` });
  assert.ok(await awaitBoot(true), 'playtest page completes its real loading gates');
  await game('clearTimeout(gameRafId); cancelAnimationFrame(gameRafId); gameRafId = 0;');
  await evaluate("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
  await sleep(200);
  ui = await game(`(function() {
    var panel = document.getElementById('soft-contact-playtest');
    return { found: !!panel, savesDisabled: SAVE_DISABLED, contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL,
      buttons: panel ? Array.from(panel.querySelectorAll('button')).map(function(b) { return b.textContent; }) : [],
      options: panel ? Array.from(panel.querySelector('select[aria-label="Interaction"]').options).map(function(o) { return o.value; }) : [] };
  })()`);
  ui.interactions = [];
  check('physics opt-in page has both modes and all available arenas with saves off', ui.found && ui.savesDisabled && ui.contact && ui.handling && ui.terrain && ui.material &&
    ui.buttons.includes('New physics') && ui.buttons.includes('Prior physics') &&
    ['pile', 'pair', 'support', 'ledge'].every(value => ui.options.includes(value)));
  if (bundle.includes('function softProjectUseReference(')) {
    ui.checkpoints = await game(`(function() {
      var panel = document.getElementById('soft-contact-playtest');
      var selector = panel.querySelector('select[aria-label="Physics checkpoint"]');
      var button = function(label) { return Array.from(panel.querySelectorAll('button')).find(function(b) { return b.textContent === label; }); };
      var reports = [];
      for (var stage = 1; stage <= SOFT_PROJECT_MAX_STAGE; stage++) {
        selector.value = stage; selector.dispatchEvent(new Event('change', { bubbles: true }));
        button('New physics').click();
        var fresh = [SOFT_PAIRS,SOFT_INTENT,SOFT_WORLD,SOFT_PRESENTATION];
        button('Prior physics').click();
        var prior = [SOFT_PAIRS,SOFT_INTENT,SOFT_WORLD,SOFT_PRESENTATION];
        button('Accepted reference').click();
        reports.push({ stage: stage, fresh: fresh, prior: prior,
          referenceOff: !SOFT_CONTACT && !SOFT_HANDLING && !SOFT_TERRAIN && !SOFT_MATERIAL &&
            !SOFT_PAIRS && !SOFT_INTENT && !SOFT_WORLD && !SOFT_PRESENTATION && softProjectReference,
          referencePressed: button('Accepted reference').getAttribute('aria-pressed') === 'true' });
      }
      selector.value = SOFT_PROJECT_MAX_STAGE; selector.dispatchEvent(new Event('change', { bubbles: true }));
      button('New physics').click(); return reports;
    })()`);
    check('stage selector compares each mechanism with all previous stages held constant', ui.checkpoints.every(r =>
      r.fresh.every((on,i) => on === (i < r.stage)) && r.prior.every((on,i) => on === (i < r.stage - 1))));
    check('accepted reference disables every experiment and marks its selected button', ui.checkpoints.every(r => r.referenceOff && r.referencePressed));
    check('world and movement arrangements are available', ['head-on','glancing','intent','jet','water'].every(v => ui.options.includes(v)));
  }
  await game(`window.__materialUICheck = function(before) {
    var b = window.__materialUIBody, values = [Array.from(b.px), Array.from(b.py), Array.from(b.ox), Array.from(b.oy)];
    if (before) { window.__materialUIBefore = values; window.__materialUIRefs = [b.px, b.py, b.ox, b.oy]; return true; }
    var error = 0;
    for (var a = 0; a < 4; a++) for (var p = 0; p < b.n; p++) error = Math.max(error, Math.abs(values[a][p] - window.__materialUIBefore[a][p]));
    return { released: !surfaceSlimeGrip && !b._grabbed, arrayChange: error,
      sameArrays: window.__materialUIRefs[0] === b.px && window.__materialUIRefs[1] === b.py &&
        window.__materialUIRefs[2] === b.ox && window.__materialUIRefs[3] === b.oy,
      recoverTime: b._recoverT || 0, contact: SOFT_CONTACT, handling: SOFT_HANDLING };
  };`);
  for (const input of ['mouse', 'touch']) {
    const mobile = input === 'touch';
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await evaluate("window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0)");
    await sleep(100);
    for (const experimental of [false, true]) for (const arena of ui.options) {
      stage = `UI/${input}/${arena}/${experimental ? 'new' : 'prior'}`;
      const prepared = await game(`(function() {
        var panel = document.getElementById('soft-contact-playtest');
        var label = ${JSON.stringify(experimental ? 'New physics' : 'Prior physics')};
        var button = Array.from(panel.querySelectorAll('button')).find(function(b) { return b.textContent === label; });
        button.click();
        var select = panel.querySelector('select[aria-label="Interaction"]'); select.value = ${JSON.stringify(arena)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
        function scenePose() {
          return JSON.stringify({ rig: [player.x, player.y, player.vx, player.vy], bodies:
            jelloBodies.filter(function(body) { return !!body.surfaceSlime; }).map(function(body) {
              return [Array.from(body.px), Array.from(body.py), Array.from(body.ox), Array.from(body.oy)];
            }) });
        }
        var originalPose = scenePose();
        var bodies = jelloBodies.filter(function(body) { return !!body.surfaceSlime; });
        var b = bodies[0], tileColumn = Math.floor(b.cx / TILE);
        var originalTile = JSON.stringify(world[SKY_ROWS][tileColumn]);
        var repeat = Array.from(panel.querySelectorAll('button')).find(function(button) { return button.textContent === 'Repeat'; });
        surfaceSlimeGrabStart(b.cx, b.cy, 'repeat-test');
        world[SKY_ROWS][tileColumn] = null; invalidateTerrainAround(SKY_ROWS, tileColumn);
        keys.ArrowRight = keys.d = true; dpad.up = true;
        player.drillGlideT = 0.2; player.slideAssistT = 1; hitPauseT = 0.03;
        if (repeat) repeat.click();
        var repeatPoseMatches = scenePose() === originalPose;
        var repeatRestoresTile = JSON.stringify(world[SKY_ROWS][tileColumn]) === originalTile;
        var repeatClearsInput = !surfaceSlimeGrip && !keys.ArrowRight && !keys.d && !dpad.up &&
          player.drillGlideT === 0 && player.slideAssistT === 0 && hitPauseT === 0;
        bodies = jelloBodies.filter(function(body) { return !!body.surfaceSlime; });
        b = bodies[0]; window.__materialUIBody = b;
        // Keep a fixed view during drag, as the deterministic harness does.
        cam.x = b.cx - screenW * 0.48; cam.y = b.cy - screenH * 0.57;
        render(); var rect = canvas.getBoundingClientRect();
        return { x: rect.left + (b.cx - cam.x) * worldScale,
          y: rect.top + (b.cy - cam.y) * worldScale, scale: worldScale, startY: b.cy,
          modeMatches: softProjectNew === ${experimental} && SOFT_CONTACT && SOFT_HANDLING && SOFT_TERRAIN,
          pressed: button.getAttribute('aria-pressed') === 'true', count: bodies.length,
          repeatAvailable: !!repeat, repeatPoseMatches: repeatPoseMatches,
          repeatRestoresTile: repeatRestoresTile, repeatClearsInput: repeatClearsInput };
      })()`);
      const cancel = mobile || arena === 'ledge';
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: prepared.x, y: prepared.y }] });
      else await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const grabbed = await game('!!surfaceSlimeGrip && surfaceSlimeGrip.body === window.__materialUIBody');
      if (grabbed) for (let frame = 1; frame <= 18; frame++) {
        const px = prepared.x + prepared.scale * 30 * frame / 18;
        const py = prepared.y - prepared.scale * 65 * frame / 18;
        if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: px, y: py }] });
        else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'left', buttons: 1 });
        await game('update(1/60); surfaceSlimeTick(1/60); updateJello(1/60);');
      }
      const lifted = await game(`(function() { for (var i = 0; i < 18; i++) { update(1/60); surfaceSlimeTick(1/60); updateJello(1/60); } render(); return ${prepared.startY} - window.__materialUIBody.cy; })()`);
      await game('__materialUICheck(true)');
      if (mobile) await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else if (cancel) await evaluate("window.dispatchEvent(new Event('blur'))");
      else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x + prepared.scale * 30,
        y: prepared.y - prepared.scale * 65, button: 'left', clickCount: 1 });
      const release = await game('__materialUICheck(false)');
      // Clear browser mouse bookkeeping after blur without changing the case result.
      if (!mobile && cancel) await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prepared.x, y: prepared.y, button: 'left', clickCount: 1 });
      const report = { input, mode: experimental ? 'new' : 'prior', arena, cancel,
        ...prepared, grabbed, lifted, release };
      const screenshot = cpu ? { data: (await game("render(); canvas.toDataURL('image/png')")).split(',')[1] } :
        await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      report.captureKind = cpu ? 'native-game-canvas' : 'browser-viewport';
      report.screenshot = `ui-${input}-${arena}-${report.mode}.png`;
      fs.writeFileSync(path.join(dump, report.screenshot), Buffer.from(screenshot.data, 'base64'));
      ui.interactions.push(report);
      console.log('UI ' + JSON.stringify(report));
    }
    if (mobile) {
      ui.mobile = await evaluate(`(function() {
        var panel = document.getElementById('soft-contact-playtest'), box = panel.getBoundingClientRect();
        return { width: innerWidth, height: innerHeight,
          fits: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
          controls: Array.from(panel.querySelectorAll('button,select')).map(function(el) {
            var r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { label: el.textContent || el.getAttribute('aria-label'), height: r.height, width: r.width,
              reachable: hit === el || el.contains(hit) };
          }) };
      })()`);
    }
  }
  check('real mouse and touch select both modes and grab all available arenas', ui.interactions.length === ui.options.length * 4 &&
    ui.interactions.every(r => r.modeMatches && r.pressed && r.grabbed && r.count >= 2));
  check('Repeat restores each arena pose, terrain and input state in both modes', ui.interactions.every(r =>
    r.repeatAvailable && r.repeatPoseMatches && r.repeatRestoresTile && r.repeatClearsInput));
  check('real pointer motion lifts the material and every input path releases', ui.interactions.every(r => r.lifted > 10 && r.release.released));
  check('real new-physics release and cancellation preserve node arrays without recovery', ui.interactions.filter(r => r.mode === 'new').every(r =>
    r.release.sameArrays && r.release.arrayChange === 0 && r.release.recoverTime === 0));
  check('390 by 844 physics controls fit and remain reachable', ui.mobile.fits &&
    ui.mobile.controls.every(control => control.reachable && control.width > 0 && control.height >= 44));

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1${extraParams}` });
  assert.ok(await awaitBoot(), 'ordinary game completes its real loading gates');
  defaults = await game("({ contact: SOFT_CONTACT, handling: SOFT_HANDLING, terrain: SOFT_TERRAIN, material: SOFT_MATERIAL, playtest: softPlayEnabled })");
  check('ordinary game keeps all experiments off', !defaults.contact && !defaults.handling && !defaults.terrain && !defaults.material && !defaults.playtest);
}

async function runLifecycle() {
  stage = 'lifecycle';
  lifecycle = await game(`(function() {
    var result = [], originalDisabled = SAVE_DISABLED;
    for (var mode = 0; mode < 2; mode++) {
      SOFT_CONTACT = SOFT_HANDLING = SOFT_TERRAIN = SOFT_MATERIAL = !!mode;
      softProjectEnabled = !!mode; softProjectStage = SOFT_PROJECT_MAX_STAGE; softProjectSelect(true);
      resetJello(); skySlimeReset(); skySlimeNext = 1e9;
      gamePaused = gameOver = gameWon = bathMode = false; shopState = 'closed';
      surfaceSlimesSeeded = false; surfaceSlimeSeed();
      var saved = JSON.parse(JSON.stringify(surfaceSlimeSave()));
      resetJello(); surfaceSlimeRestore(saved); surfaceSlimeTick(1/60);
      var restored = surfaceSlimeSave();
      var identities = saved.residents.map(function(s) { return [s.id,s.r,s.hue,s.seed]; });
      var restoredIdentities = restored.residents.map(function(s) { return [s.id,s.r,s.hue,s.seed]; });
      var sky = skySlimeFresh(0,0); sky.bathed = true; sky.r = 22.25; sky.seed = .9;
      var released = bathReleaseGuest({ s: sky, paid: true });
      var born = jelloBodies.find(function(b) { return b.surfaceSlime && b.surfaceSlime.id === sky.id; });
      var bornData = born && [born.surfaceSlime.id,born.surfaceSlime.radius,born.surfaceSlime.hue];
      var envelope = JSON.parse(JSON.stringify(saveBuild()));
      saveApply(envelope); surfaceSlimeTick(1/60);
      var after = surfaceSlimeSave(), reloaded = jelloBodies.find(function(b) { return b.surfaceSlime && b.surfaceSlime.id === sky.id; });
      var reloadedData = reloaded && [reloaded.surfaceSlime.id,reloaded.surfaceSlime.radius,reloaded.surfaceSlime.hue];
      // Shop freeze exercises the engine's own early return. Pause uses the
      // outer animation loop, so call that loop rather than bypassing it.
      var b = reloaded, pose = function() { return JSON.stringify([Array.from(b.px),Array.from(b.py),Array.from(b.ox),Array.from(b.oy)]); };
      var before = pose(); shopState = 'opening'; updateJello(1/60); var shopFrozen = pose() === before; shopState = 'closed';
      gamePaused = true; loop(performance.now()); var pauseFrozen = pose() === before; gamePaused = false;
      // A real grab wakes a sleeping body, and opening the menu cancels the
      // same pointer attachment without altering its material histories.
      b.sleeping = true; b.sleepFrames = 120;
      surfaceSlimeGrabStart(b.cx,b.cy,'lifecycle');
      var grabbed = !!surfaceSlimeGrip && surfaceSlimeGrip.body === b;
      var woke = !b.sleeping; before = pose();
      gamePaused = true; surfaceSlimeTick(1/60);
      var cancelled = !surfaceSlimeGrip && !b._grabbed;
      var preserved = pose() === before; gamePaused = false;
      result.push({ mode: mode ? 'full' : 'reference', ids: JSON.stringify(identities) === JSON.stringify(restoredIdentities),
        count: restored.residents.length, released: released, born: !!born, size: bornData && bornData[1],
        roundtrip: JSON.stringify(bornData) === JSON.stringify(reloadedData), total: after.residents.length,
        seeded: after.seeded, saveDisabled: SAVE_DISABLED && originalDisabled, shopFrozen: shopFrozen,
        pauseFrozen: pauseFrozen, grabbed: grabbed, woke: woke, cancelled: cancelled, preserved: preserved });
    }
    return result;
  })()`);
  console.log('LIFECYCLE ' + JSON.stringify(lifecycle));
  check('reference and full mode preserve resident identities and full saves', lifecycle.every(r => r.ids && r.count === 5 && r.total === 6 && r.seeded && r.roundtrip));
  check('bath conversion preserves the visitor size in both modes', lifecycle.every(r => r.released && r.born && r.size === 22.25));
  check('shop and pause freeze nodes in both modes', lifecycle.every(r => r.shopFrozen && r.pauseFrozen));
  check('sleeping residents wake on grab and menus cancel ownership', lifecycle.every(r => r.grabbed && r.woke && r.cancelled));
  check('full physics menu cancellation preserves motion and playtests keep saves off', lifecycle.every(r => r.saveDisabled && (r.mode === 'reference' || r.preserved)));
}
