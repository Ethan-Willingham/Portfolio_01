// Run: DUMP=/tmp/sluice-loading-smoke node tools/sluice-loading-smoke.mjs
// Local-server probes and resource faults never enter the production bundle.
// Owns a disposable Chrome for Testing profile and closes its exact process.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT || 8802),debugPort=port+1000;
const dump=process.env.DUMP && path.resolve(process.env.DUMP);
if(dump){assert.ok(dump!==root && !dump.startsWith(root+path.sep),'DUMP must be outside the repository');fs.mkdirSync(dump,{recursive:true});}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-loading-profile-'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),faults=new Map(),faultHits=[],held=[],errors=[],reports=[];
let chrome,ws,sequence=0,checks=0,scenario='startup';
const probe=`
window.__loadingSmoke=(function(){
  var realLoop=loop,realInit=init,initEvents=[],revealEvents=[],lastBeginFrame=-1,loadingTicks=0,hiddenMotion=0;
  var realResize=resize,resizeCalls=0;
  resize=function(){if(!resolutionBatchDepth)resizeCalls++;return realResize.apply(this,arguments);};
  loop=function(t){
    if(window.__loadingTestHold && introPhase!=='done') {lastTime=t;gameRafId=requestAnimationFrame(loop);return;}
    var active=SluiceLoading.active(),before={x:player.x,y:player.y,fuel:player.fuel};
    var result=realLoop(t);
    if(active && SluiceLoading.active()){
      loadingTicks++;
      if(player.x!==before.x || player.y!==before.y || player.fuel!==before.fuel)hiddenMotion++;
    }
    return result;
  };
  init=function(){
    initEvents.push({active:!!(window.SluiceLoading && SluiceLoading.active()),
      state:document.getElementById('game-intro').dataset.state,
      framesSinceBegin:lastBeginFrame<0 ? null : window.__loadingFrames-lastBeginFrame,preset:window.gm&&gm.activePreset});
    return realInit();
  };
  var realBegin=SluiceLoading.begin;
  SluiceLoading.begin=function(){lastBeginFrame=window.__loadingFrames;return realBegin.apply(this,arguments);};
  new MutationObserver(function(){
    if(document.getElementById('game-intro').dataset.state!=='revealing')return;
    var before={x:player.x,y:player.y,fuel:player.fuel};
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));
    requestAnimationFrame(function(){
      revealEvents.push({active:SluiceLoading.active(),stationary:player.x===before.x && player.y===before.y && player.fuel===before.fuel,
        blocked:!keys.ArrowRight});
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));
    });
  }).observe(document.getElementById('game-intro'),{attributes:true,attributeFilter:['data-state']});
  return {
    state:function(){return {version:GAME_VERSION,intro:introPhase,paused:gamePaused,
      x:player.x,y:player.y,fuel:player.fuel,money:money,keys:Object.keys(keys).filter(function(k){return keys[k];}),
      touch:!!touch.active,initEvents:initEvents,revealEvents:revealEvents,loadingTicks:loadingTicks,hiddenMotion:hiddenMotion,bootError:window.__bootErr || null,
      loaderActive:SluiceLoading.active(),worldReady:!!world.length,gpuWater:!!liquidWGPU,gpuJello:!!jelloWGPU,gpuSmoke:!!smokeWGPU,
      stable:gameLoadingStableFrames,settled:introSettledFrames,preset:gm.activePreset,workerFailed:weatherBakeWorkerFailed,
      resizeCalls:resizeCalls,canvas:[canvas.width,canvas.height],cssPixels:viewW*viewH,pixelBudget:RES_PIXEL_BUDGET,choice:SluiceOptions.graphicsChoice};},
    saveMarker:function(){money=12345;saveNow('loading smoke');return money;},
    hold:function(on){window.__loadingTestHold=on;},
    evictTerrain:function(){terrainChunkCache={};terrainChunkCount=0;}
  };
})();
`;
const atlasProbe=`
(function(){
  var realLoop=loop,calls=0;
  loop=function(t){calls++;return realLoop(t);};
  window.__loadingAtlasState=function(){return {worldRows:world.length,playerReady:Number.isFinite(player.x)&&Number.isFinite(player.y),paused:gamePaused,loopCalls:calls};};
})();
`;
const gpuDelayProbe=`
(function(){
  var create=LiquidWGPU.create;
  LiquidWGPU.create=function(options){
    var water=create(options),originalReady=water.readyPromise,dispose=water.dispose;
    var stats=window.__gpuLoadingProbe={createdAt:performance.now(),disposeTimes:[],currentCanvasRemoved:false,lateCreated:false,lateDestroyed:0,settled:false};
    water.dispose=function(){
      stats.disposeTimes.push(performance.now());
      var canvas=water.renderCanvas;
      var result=dispose.apply(water,arguments);
      if(!stats.lateCreated)stats.currentCanvasRemoved=!canvas||!canvas.isConnected;
      return result;
    };
    water.readyPromise=new Promise(function(resolve,reject){
      setTimeout(function(){
        Promise.resolve(originalReady).then(function(result){
          // Reproduce resources appearing after the 8s timeout but before the
          // delayed initialization promise settles. Use the real disposer.
          var late=document.createElement('canvas');late.dataset.loadingGpuProbe='late';
          document.getElementById('game-canvas').parentElement.appendChild(late);
          water.renderCanvas=late;water.renderCtx=null;
          water.buf=water.buf||{};water.buf.loadingLateProbe={destroy:function(){stats.lateDestroyed++;}};
          stats.lateCreated=true;stats.settled=true;stats.settledAt=performance.now();resolve(result);
        },reject);
      },10000);
    });
    return water;
  };
})();
`;
const earlyProbe=`
if(location.search.indexOf('worker-blocked')>=0)window.Worker=function(){throw Error('Intentional worker denial');};
if(location.search.indexOf('worker-hung')>=0)window.Worker=function(){this.postMessage=function(){};this.terminate=function(){};};
if(location.search.indexOf('large-canvas-budget')>=0)addEventListener('DOMContentLoaded',function(){document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));var css=document.createElement('style');css.textContent='.game-wrapper{width:100vw!important;max-width:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);dispatchEvent(new Event('resize'));});
window.__loadingFrames=0;window.__loadingHistory=[];
window.addEventListener('DOMContentLoaded',function(){if(window.__loadingAtlasState)window.__loadingAtlasAtDOMContentLoaded=__loadingAtlasState();});
(function tick(){window.__loadingFrames++;requestAnimationFrame(tick);})();
(function(){
  var previous='';
  new MutationObserver(function(){
    var root=document.getElementById('game-intro'),status=document.getElementById('gm-loading-status');
    if(!root)return;
    var entry={state:root.dataset.state || '',text:status ? status.textContent.trim() : '',frame:window.__loadingFrames};
    var key=entry.state+'|'+entry.text;
    if(key!==previous){previous=key;window.__loadingHistory.push(entry);}
  }).observe(document,{subtree:true,attributes:true,childList:true,characterData:true});
})();
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.m4a':'audio/mp4','.svg':'image/svg+xml'};
function deliver(res,file,pathname){
  if(res.destroyed)return;
  let data=fs.readFileSync(file);
  if(pathname==='/js/sluice.js'){
    const source=data.toString(),end=source.lastIndexOf('})();');assert.ok(end>0,'IIFE end found');
    data=Buffer.from(source.slice(0,end)+(scenario==='art-atlas' ? atlasProbe : probe)+source.slice(end));
  }
  if(pathname==='/js/liquid-wgpu.js' && scenario==='gpu-timeout')data=Buffer.from(data.toString()+gpuDelayProbe);
  res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(data);
}
const server=http.createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    const fault=faults.get(pathname) || (pathname.startsWith('/assets/fonts/') ? faults.get('fonts') : null);
    if(fault)faultHits.push({scenario,pathname,fault});
    if(fault==='hold'){held.push({res,file,pathname});return;}
    if(fault==='fail'){res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Intentional loading smoke resource failure');return;}
    deliver(res,file,pathname);
  }catch(error){res.writeHead(500);res.end(String(error));}
});
function release(pathname){faults.delete(pathname);for(let n=held.length-1;n>=0;n--){const h=held[n];if(h.pathname===pathname || pathname==='fonts' && h.pathname.startsWith('/assets/fonts/')){held.splice(n,1);deliver(h.res,h.file,h.pathname);}}}
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function until(expression,message,timeout=30000){const begin=Date.now();while(Date.now()-begin<timeout){if(await ev(expression))return;await sleep(70);}throw Error(message);}
function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
async function status(){return ev(`(()=>{const e=document.getElementById('game-intro'),s=document.getElementById('gm-loading-status');if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e),ancestors=[];for(let p=e.parentElement;p;p=p.parentElement){const a=getComputedStyle(p);ancestors.push({tag:p.tagName,id:p.id,classes:p.className,opacity:Number(a.opacity),display:a.display,visibility:a.visibility});}const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {state:e.dataset.state,text:s?s.textContent.trim():'',active:window.SluiceLoading?SluiceLoading.active():null,opacity:Number(c.opacity),display:c.display,visibility:c.visibility,pointer:c.pointerEvents,inert:e.inert,ariaHidden:e.getAttribute('aria-hidden'),busy:e.getAttribute('aria-busy'),ancestors,ownsCenter:!!hit&&e.contains(hit),rect:{x:r.x,y:r.y,width:r.width,height:r.height},live:!!(s&&(s.getAttribute('role')==='status'||s.closest('[aria-live]')))};})()`);}
async function shot(name){if(!dump)return;const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(r.data,'base64'));}
async function click(id){const p=await ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
async function key(key,code,type='keyDown'){
  const event={type,key,code};
  const virtual={Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40};
  if(virtual[key])event.windowsVirtualKeyCode=virtual[key];
  if(key==='Enter' && type==='keyDown')event.text='\r';
  await send('Input.dispatchKeyEvent',event);
}
async function tap(keyName,code){await key(keyName,code);await sleep(100);await key(keyName,code,'keyUp');}
async function size(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});await sleep(100);}
async function navigate(name,query=''){
  scenario=name;
  const url=`http://127.0.0.1:${port}/grand-motherload.html${query || '?'}${query ? '&' : ''}loading-smoke=${encodeURIComponent(name)}`;
  await send('Page.navigate',{url});
  await until(`location.href===${JSON.stringify(url)} && !!document.getElementById("game-intro")`,'initial loading markup was not parsed');
}
async function ready(name,timeout=40000,paused=false){
  await until('!!window.__loadingSmoke && document.getElementById("game-intro").dataset.state === "ready" && !SluiceLoading.active()',name+' did not reveal',timeout);
  const state=await ev('__loadingSmoke.state()'),loader=await status();
  check(name+' reveals a complete world',state.worldReady && state.intro==='done' && !state.bootError);
  check(name+' restores the expected pause state',state.paused===paused && !loader.active);
  reports.push({name,state,loader,history:await ev('__loadingHistory')});
  return state;
}
async function visible(name){const s=await status();const valid=s && s.state==='loading' && s.active && s.opacity>0.95 && s.display!=='none' && s.visibility!=='hidden' && s.ancestors.every(a=>a.opacity>0.95 && a.display!=='none' && a.visibility!=='hidden') && s.ownsCenter && s.text.length>3 && s.rect.width>200 && s.rect.height>200 && !s.inert;if(!valid)console.log('LOADER '+JSON.stringify(s));check(name,valid);return s;}
async function heldInput(){
  const before=await ev('__loadingSmoke.state()');
  await key('ArrowRight','ArrowRight');await key('ArrowUp','ArrowUp');await key('Escape','Escape');
  const p=await ev(`(()=>{const e=document.getElementById('game-canvas'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
  await sleep(180);
  const after=await ev('__loadingSmoke.state()');
  check('loading blocks keys, pause, and pointer gameplay',after.x===before.x && after.y===before.y && after.fuel===before.fuel && after.paused===before.paused && after.keys.length===0 && !after.touch);
  await key('ArrowRight','ArrowRight','keyUp');await key('ArrowUp','ArrowUp','keyUp');await key('Escape','Escape','keyUp');
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const executable=process.env.CHROME || (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
  const angle=process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan';
  chrome=spawn(executable,['--headless=new','--mute-audio','--enable-unsafe-webgpu','--use-angle='+angle,'--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  let spawnError;chrome.once('error',e=>{spawnError=e;});let target;
  for(let n=0;n<100;n++){if(spawnError)throw spawnError;try{target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  assert.ok(target,'Chrome for Testing started');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push({scenario,error:m.params.exceptionDetails});if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push({scenario,error:m.params.args});};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:earlyProbe});
  await size(1440,900);

  faults.set('/js/sluice.js','hold');
  await navigate('cold-delayed-bundle');
  await until('!!window.SluiceLoading','early loading controller is missing');
  const early=await visible('cold load has visible status before game bundle');
  check('loading status is announced accessibly',early.live);
  check('game bundle is still unavailable',!await ev('!!window.__loadingSmoke'));
  await shot('cold-loading');
  await ev('window.__loadingTestHold=true');release('/js/sluice.js');
  await until('!!window.__loadingSmoke && __loadingSmoke.state().worldReady','game initialization did not reach warmup');
  await visible('loader stays present during world warmup');await heldInput();await shot('world-warmup');
  await ev('__loadingSmoke.hold(false)');const first=await ready('fresh boot');await shot('fresh-ready');
  check('real loading frames do not simulate hidden gameplay',first.loadingTicks>0 && first.hiddenMotion===0);
  check('arrival follows complete cache frames',first.settled>=6);
  check('reveal fade blocks gameplay until it completes',first.revealEvents.some(e=>e.active) && first.revealEvents.every(e=>e.stationary && e.blocked));
  await ev('__loadingSmoke.saveMarker()');

  faults.set('/js/sluice.js','hold');await navigate('returning-save');
  await visible('returning save has an immediate loader');release('/js/sluice.js');
  const restored=await ready('returning save');check('returning load preserves the saved run',restored.money===12345);

  await click('gm-pause-btn');await click('gm-new-game-btn');
  const initializations=await ev('__loadingSmoke.state().initEvents.length');
  await ev('__loadingSmoke.hold(true)');await click('gm-restart-btn');
  await until('SluiceLoading.active()','new game did not start loader');
  await visible('new game uses the loading screen');
  await until('__loadingSmoke.state().initEvents.length>'+initializations,'new game did not initialize');
  const reset=await ev('__loadingSmoke.state()');
  const init=reset.initEvents.at(-1);
  check('new game paints loading before heavy initialization',init.active && init.state==='loading' && init.framesSinceBegin>=2);
  await heldInput();await shot('new-game-loading');
  await ev('__loadingSmoke.hold(false)');const fresh=await ready('new game');check('confirmed new game resets progress',fresh.money<12345);
  await ev('__loadingSmoke.saveMarker()');

  faults.set('/js/sluice.js','fail');await navigate('critical-resource-failure');
  await until('document.getElementById("game-intro").dataset.state === "error"','failed critical bundle did not show recovery');
  const failed=await status();
  check('critical failure provides a visible retry',failed.active && failed.opacity>0.95 && await ev('document.getElementById("gm-loading-retry").getClientRects().length>0'));
  await shot('critical-failure');faults.delete('/js/sluice.js');
  scenario='retry-recovery';await ev('document.getElementById("gm-loading-retry").focus()');await tap('Enter','Enter');
  const retry=await ready('retry recovery');check('keyboard retry preserves the existing save',retry.money===12345);

  scenario='cold-town-recovery';await tap('r','KeyR');
  await ev('__loadingSmoke.evictTerrain();__loadingSmoke.hold(true)');await tap('r','KeyR');
  await until('SluiceLoading.active()','uncached town recovery did not start loader');
  await visible('uncached town recovery covers its rebuild');await heldInput();await shot('town-recovery-loading');
  await ev('__loadingSmoke.hold(false)');const recovered=await ready('town recovery');
  check('town recovery retains its normal fee',recovered.money===11111);
  scenario='cached-town-recovery';const recoveryHistory=await ev('__loadingHistory.length');
  await tap('r','KeyR');await tap('r','KeyR');await sleep(250);
  check('cached town recovery stays immediate',!await ev('SluiceLoading.active()') && !await ev(`__loadingHistory.slice(${recoveryHistory}).some(e=>e.state==='loading')`));

  faults.set('fonts','fail');faults.set('/assets/images/moon.jpg','fail');
  await navigate('optional-assets-failure');await ready('optional resource fallback',50000);await shot('optional-fallback-ready');
  check('optional fallback exercised failed font and moon requests',faultHits.some(f=>f.scenario==='optional-assets-failure' && f.pathname.startsWith('/assets/fonts/')) && faultHits.some(f=>f.scenario==='optional-assets-failure' && f.pathname==='/assets/images/moon.jpg'));
  faults.delete('fonts');faults.delete('/assets/images/moon.jpg');

  const regular='/assets/fonts/commit_mono_regular.woff2',bold='/assets/fonts/commit_mono_bold.woff2';
  faults.set(regular,'fail');faults.set(bold,'hold');await navigate('independent-font-readiness');
  await until('!!window.__loadingSmoke && __loadingSmoke.state().worldReady','font test did not initialize');
  await sleep(1500);
  await visible('failed regular font does not bypass pending bold font');
  check('independent font test exercised both network paths',faultHits.some(f=>f.scenario==='independent-font-readiness'&&f.pathname===regular&&f.fault==='fail')&&held.some(h=>h.pathname===bold));
  await shot('bold-font-pending');release(bold);faults.delete(regular);await ready('independent font readiness');

  await navigate('gpu-timeout');
  await until('!!window.__gpuLoadingProbe','GPU timeout instrumentation was not exercised');
  const cpu=await ready('GPU timeout fallback',25000);
  const gpuFirst=await ev('__gpuLoadingProbe');
  check('GPU timeout switches to CPU and disposes current resources',!cpu.gpuWater&&!cpu.gpuJello&&!cpu.gpuSmoke&&gpuFirst.disposeTimes.length>=1&&gpuFirst.currentCanvasRemoved&&gpuFirst.disposeTimes[0]-gpuFirst.createdAt>=7800);
  await shot('gpu-timeout-ready');
  await until('__gpuLoadingProbe.settled && __gpuLoadingProbe.disposeTimes.length>=2','late GPU initialization did not receive disposal',10000);
  check('late GPU resources are removed without orphan canvases',await ev('__gpuLoadingProbe.lateDestroyed>=1 && !document.querySelector("[data-loading-gpu-probe]") && !__loadingSmoke.state().gpuWater'));
  reports.push({name:'GPU disposal',gpu:await ev('__gpuLoadingProbe')});

  await ev("localStorage.setItem('sluice.opt.gfx','balanced')");
  await navigate('saved-graphics');const balanced=await ready('saved graphics');
  check('saved Balanced is selected before world initialization',balanced.preset==='high' && balanced.initEvents.every(e=>e.preset==='high') && balanced.choice==='balanced');
  await navigate('url-graphics','?gmpreset=extreme');const extreme=await ready('URL graphics override');
  await sleep(250);
  check('URL device choice wins without a delayed saved-preset resize',extreme.preset==='extreme' && extreme.initEvents.every(e=>e.preset==='extreme') && await ev('gm.activePreset==="extreme"'));
  await click('gm-pause-btn');await click('gm-options-btn');
  for(const choice of ['performance','balanced','extreme']){
    const before=await ev('__loadingSmoke.state()');
    await ev('__loadingSmoke.hold(true);SluiceOptions.set("gfx",'+JSON.stringify(choice)+')');
    await until('SluiceLoading.active()','graphics change did not cover the scene');
    await visible(choice+' graphics change stays covered');
    await sleep(100);await heldInput();await ev('__loadingSmoke.hold(false)');
    const after=await ready(choice+' graphics change',40000,true);
    check(choice+' applies one resize and preserves the rig',after.resizeCalls===before.resizeCalls+1 && after.x===before.x && after.y===before.y && after.fuel===before.fuel);
    check(choice+' selection matches the actual tier',after.preset===({performance:'low',balanced:'high',extreme:'extreme'})[choice]);
  }
  await ev("localStorage.removeItem('sluice.opt.gfx')");
  await size(3840,2160);await navigate('large-canvas-budget');const large=await ready('large canvas');
  console.log('LARGE '+JSON.stringify({canvas:large.canvas,cssPixels:large.cssPixels,budget:large.pixelBudget}));
  check('large canvas respects the chosen pixel budget',large.cssPixels>large.pixelBudget && large.canvas[0]*large.canvas[1]<=large.pixelBudget+large.canvas[0]+large.canvas[1]);
  await size(1440,900);
  for(const name of ['worker-blocked','worker-hung']){
    await navigate(name,'?wmood=3');const fallback=await ready(name,50000);
    check(name+' uses complete synchronous cloud fallback',fallback.workerFailed && fallback.settled>=6);
  }

  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await size(390,844,true);faults.set('/js/sluice.js','hold');await navigate('mobile-reduced-motion');
  await visible('mobile loading remains visible');
  check('mobile loading fits its stage',await ev(`(()=>{const a=document.getElementById('game-intro').getBoundingClientRect(),s=document.getElementById('gm-loading-status').getBoundingClientRect();return s.left>=a.left && s.right<=a.right && s.top>=a.top && s.bottom<=a.bottom && a.width<=innerWidth;})()`));
  check('reduced motion removes loading animation',await ev(`(()=>{const e=document.getElementById('game-intro');return [e,...e.querySelectorAll('*')].every(n=>[null,'::before','::after'].every(p=>{const c=getComputedStyle(n,p);return c.animationName==='none'||parseFloat(c.animationDuration)<=0.01;}));})()`));
  await shot('mobile-reduced-loading');release('/js/sluice.js');await ready('mobile reduced motion');await shot('mobile-ready');

  scenario='art-atlas';await size(1440,900);
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/art-lab.html?loading-smoke=atlas`});
  await until('!!window.__loadingAtlasAtDOMContentLoaded && !!document.getElementById("counts").textContent','art atlas did not build',40000);
  const atlasAtReady=await ev('__loadingAtlasAtDOMContentLoaded');
  check('art atlas receives initialized state at DOMContentLoaded',atlasAtReady.worldRows>0&&atlasAtReady.playerReady);
  const atlasBefore=await ev('__loadingAtlasState()');await sleep(250);const atlasAfter=await ev('__loadingAtlasState()');
  check('art atlas stop keeps the game loop stopped',atlasBefore.paused&&atlasAfter.paused&&atlasAfter.loopCalls===atlasBefore.loopCalls);
  reports.push({name:'art atlas',atDOMContentLoaded:atlasAtReady,stopped:atlasAfter});await shot('art-atlas');

  check('no unexpected browser errors',errors.length===0);
  if(dump)fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({checks,reports,errors,faultHits},null,2));
  console.log(`PASS ${checks} loading checks`);
}finally{
  for(const h of held)h.res.destroy();
  if(ws){try{await send('Browser.close');}catch{}ws.close();}
  if(chrome && chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  server.closeAllConnections();await new Promise(r=>server.close(r));
  assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));
  assert(path.basename(profile).startsWith('sluice-loading-profile-'));
  fs.rmSync(profile,{recursive:true,force:true});
}
