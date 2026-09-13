// Controlled scene audit. Run sequentially on an otherwise idle GPU.
// SCENES=drive,flight,pen,pond,cave,deep,night,storm; SECONDS=8; GPU=1
// CLOCK=1 TOD=.7 SCENES=cruise SECONDS=30 exercises moving light and bank re-entry.
// OVERLAY=1 retains diagnostics. EXPERIMENT=tools/perf/hitch-audit-probe.js adds attribution.
// SCENES=human uses real uneven keyboard gestures without overriding movement.
// PROFILE=0 omits CPU sampling when measuring normal frame delivery.
// ROOT can point at a second checkout; DUMP must stay outside the checkout.
// BUNDLE_REF serves a committed game bundle with this checkout's other assets.
// WINDOW_X/Y place a normal test window on a second display. FULLSCREEN=0
// keeps that window normal; REFRESH_HZ documents the OS display mode.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installGPUAudit} from './gpu-audit-probe.mjs';
import {humanInputRoute} from './human-input-route.mjs';
const root=path.resolve(process.env.ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const bundleRef=process.env.BUNDLE_REF||null;
const bundleSource=bundleRef?execFileSync('git',['show',bundleRef+':js/sluice.js'],{cwd:root,maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,'js/sluice.js'));
const out=process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(),'sluice-audit-'));
assert(!path.resolve(out).startsWith(root+path.sep)); fs.mkdirSync(out,{recursive:true});
const port=Number(process.env.PORT || 8840), debugPort=port+1000;
const seconds=Number(process.env.SECONDS || 8), gpu=process.env.GPU==='1';
const cpuSampling=!gpu&&process.env.PROFILE!=='0';
const viewport={width:Number(process.env.WIDTH||1798),height:Number(process.env.HEIGHT||954),deviceScaleFactor:Number(process.env.DPR||1.25),mobile:false};
const experiment=process.env.EXPERIMENT?fs.readFileSync(process.env.EXPERIMENT,'utf8'):'';
const canvasOptions=process.env.CANVAS_OPTIONS?JSON.parse(process.env.CANVAS_OPTIONS):null;
const electron=process.env.ELECTRON==='1', headed=electron||process.env.HEADED==='1';
const audioProbe=String.raw`window.__audioAudit=function(){var tracks=Object.keys(buffers).map(function(name){var b=buffers[name];return {name:name,seconds:b.duration,bytes:b.length*b.numberOfChannels*4};});return {state:ctx&&ctx.state,tracks:tracks,decodedBytes:tracks.reduce(function(s,t){return s+t.bytes;},0),heap:performance.memory&&performance.memory.usedJSHeapSize};};`;
const scenes=(process.env.SCENES || 'drive,flight,pen,pond,cave,deep,night,storm').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browserProfile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-audit-chrome-'));
const probe=String.raw`
${experiment}
window.__audit=(function(){
  var rows=[],record=false,scene='',pinX=0,pinY=0,move=false,flying=false,rising=false,active=false,cruise=false,cruiseTime=0,cruiseRight=true;
  var oldLoop=loop,oldUpdate=update,previous=0,gpuRows=[],gpuPending=[],glCount=0;
  var loadingRows=[],oldLoading=renderLoadingScene;
  renderLoadingScene=function(){var t=performance.now(),p=introPhase;oldLoading();loadingRows.push({at:t,ms:performance.now()-t,phase:p,next:introPhase,assets:gameLoadingAssetsReady,pending:terrainChunkPendingThisFrame,clouds:loadingCloudsReady()});};
  function query(name,getGL,fn){
    if(!window.__auditGPU)return fn;
    return function(){var gl=getGL(),ext=gl&&gl.getExtension('EXT_disjoint_timer_query_webgl2'),q;
      if(window.__auditGPU&&record&&ext&&gl.createQuery&&glCount%24===0){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}
      function finish(){if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);gpuPending.push({gl:gl,ext:ext,q:q,name:name});q=null;}}
      // Stop the mountain query before Canvas imports its image. Cross-context
      // synchronization is not time executing the mountain draw commands.
      var composite=name==='mountains'&&q?ctx.drawImage:null,result;
      if(composite)ctx.drawImage=function(){finish();return composite.apply(this,arguments);};
      try{result=fn.apply(this,arguments);}finally{if(composite)ctx.drawImage=composite;finish();}
      return result;
    };
  }
  updateSmoke=query('smoke.update',smokeProbeGL,updateSmoke);
  smokeFluidDraw=query('smoke.draw',smokeProbeGL,smokeFluidDraw);
  renderSkyGL=query('sky',function(){return skyGL;},renderSkyGL);
  if(typeof drawMountainsGL==='function')drawMountainsGL=query('mountains',function(){return mtnGPU&&mtnGPU.gl;},drawMountainsGL);
  loop=function(time){var t=performance.now(),dt=previous?time-previous:0;previous=time;
    var result=oldLoop(time),cpu=performance.now()-t;
    if(record&&introPhase==='done')rows.push({at:t,tod:timeOfDay,dt:dt,cpu:cpu,x:player.x,y:player.y,cx:cam.x,cy:cam.y,vx:player.vx,vy:player.vy,ground:player.onGround,fuel:player.fuel,hull:player.hull,focus:document.hasFocus(),visible:!document.hidden,maskWidth:smokeObstWaterCanvas&&smokeObstWaterCanvas.width,maskHeight:smokeObstWaterCanvas&&smokeObstWaterCanvas.height,buckets:Object.assign({},perfBucketsRaw),chunks:terrainChunkRebuildsThisFrame});
    glCount++;
    for(var i=gpuPending.length-1;i>=0;i--){var p=gpuPending[i];if(p.gl.getQueryParameter(p.q,p.gl.QUERY_RESULT_AVAILABLE)){
      if(!p.gl.getParameter(p.ext.GPU_DISJOINT_EXT))gpuRows.push({name:p.name,ms:p.gl.getQueryParameter(p.q,p.gl.QUERY_RESULT)/1e6});
      p.gl.deleteQuery(p.q);gpuPending.splice(i,1);
    }}
    return result;
  };
  update=function(dt){oldUpdate(dt);if(active){
    if(cruise){cruiseTime+=dt;pinY=SKY_ROWS*TILE-340-70*Math.sin(cruiseTime*.45);if(player.x>(COLS-20)*TILE)cruiseRight=false;if(player.x<20*TILE)cruiseRight=true;keys.ArrowRight=cruiseRight;keys.ArrowLeft=!cruiseRight;}
    if(rising)pinY-=200*dt;
    player.y=pinY;player.renderY=pinY;player.vy=0;player.onGround=!flying;
    if(!move){player.x=pinX;player.renderX=pinX;player.vx=0;}
    player.fuel=getMaxFuel();player.hull=getMaxHull();
  }};
  function state(){return {smokeMask:window.__smokeObst?window.__smokeObst.info():null,version:GAME_VERSION,preset:gm.activePreset,canvas:[canvas.width,canvas.height],scale:dpr*worldScale,player:[player.x,player.y],camera:[cam.x,cam.y],mountains:typeof mtnGPU!=='undefined'?{active:!!mtnGPU&&!mtnGPUFailed,failed:mtnGPUFailed,size:mtnGPU&&[mtnGPU.canvas.width,mtnGPU.canvas.height],samples:mtnGPU&&mtnGPU.gl.getParameter(mtnGPU.gl.SAMPLES)}:null,liquids:liquidCount,jello:jelloBodies.length,awake:jelloBodies.filter(function(b){return !b.sleeping&&!b.frozen;}).length,bodies:jelloBodies.map(function(b){return {n:b.n,x:b.cx,y:b.cy,box:[b.bboxL,b.bboxT,b.bboxR,b.bboxB],sleep:b.sleeping,frozen:b.frozen,hits:b._cHits,cr:b.cr};}),smoke:[smokeFluidCanvas&&smokeFluidCanvas.width,smokeFluidCanvas&&smokeFluidCanvas.height],smokeTune:smokeTune,webgpu:!!(liquidWGPU&&liquidWGPU.ready),bootMs:performance.now(),warmup:loadingRows};}
  return {ready:function(){
      if(introPhase==='done'&&smokeFluidActive&&!smokeWGPUDriving&&
          (smokeDriver!==SmokeFluid||!smokeDriver.isReady()))throw Error('Smoke experiment left the active driver disconnected');
      return introPhase==='done';
    },state:state,
    start:function(name,disable){
      resize();scene=name;if(!window.__keepOverlay)drawPerfOverlay=function(){};SUN.paused=!window.__runningClock;timeOfDay=window.__initialTOD===null?(name.startsWith('night')?.02:.5):window.__initialTOD;
      if(name==='storm')gm.preset('storm ceiling');
      var disabled=disable.split(',');
      if(disabled.indexOf('smoke')>=0){PERF_DISABLE_SMOKE_FLUID=true;PERF_DISABLE_EXHAUST_BRIDGE=true;}
      if(disabled.indexOf('water')>=0)PERF_DISABLE_WATER=true;
      if(disabled.indexOf('sky')>=0)PERF_DISABLE_NIGHTSKY=true;
      if(disabled.indexOf('jello')>=0){ENABLE_JELLO=false;}
      if(disabled.indexOf('weather')>=0)PERF_DISABLE_WEATHER=true;
      if(name==='human'){
        active=false;gamePaused=false;startInPause=false;bootPauseFired=true;
        return state();
      }
      pinX=(DECK_LEFT_COL-5)*TILE;pinY=SKY_ROWS*TILE-PLAYER_H;
      // Fixed-altitude flight reaches the pen's pillar during longer captures.
      // Use drive for uninterrupted horizontal travel; inspect raw x/cx traces.
      move=name==='drive'||name==='flight'||name==='nightflight';flying=name==='flight'||name==='nightflight';
      rising=name==='ascent'||name==='nightascent';if(rising){move=true;flying=true;}
      cruise=name==='cruise';cruiseTime=0;cruiseRight=true;if(cruise){move=true;flying=true;}
      if(flying){pinX=80*TILE;pinY-=100;}
      if(cruise){pinX=20*TILE;pinY=SKY_ROWS*TILE-340;}
      if(name==='pen')pinX=(DECK_LEFT_COL-18)*TILE;
      if(name==='pond'||name==='nightpond'){var pond=surfacePonds.find(function(p){return p.cR-p.cL>=5;})||surfacePonds[0];if(!pond)throw Error('No pond');pinX=(pond.cL+pond.cR)*TILE*.5;pinY+=name==='nightpond'?-100:TILE;flying=true;}
      if(name==='cave'||name==='deep'){
        var rr=SKY_ROWS+(name==='deep'?Math.floor(TOWN_DEPTHS[0]*.8):55),best=0;
        if(name==='deep'){
          // A mined chamber at 80% town depth; deeper dormant towns are bedrock.
          for(var cr=rr-3;cr<=rr;cr++)for(var cc=140;cc<175;cc++)world[cr][cc]=null;
        }
        for(var r=rr;r<Math.min(rr+40,TOTAL_ROWS-3);r++){var run=0;for(var c=10;c<COLS-10;c++){
          run=!world[r][c]&&!world[r-1][c]?run+1:0;if(run>best){best=run;pinX=(c-run*.5)*TILE;pinY=(r-1)*TILE;}
        }} if(!best)throw Error('No cave');flying=true;
      }
      for(var k in keys)keys[k]=false;
      player.x=pinX;player.y=pinY;player.renderX=pinX;player.renderY=pinY;player.vx=move?(flying?flyTune.speed:200):0;player.vy=0;
      keys.ArrowRight=move;keys[' ']=flying&&move;cam.snap=true;updateCamera();
      gamePaused=false;startInPause=false;bootPauseFired=true;active=true;
      return state();
    },clear:function(){rows=[];gpuRows=[];if(window.__gpuAudit)window.__gpuAudit.rows=[];record=true;window.__auditRecording=true;},
    stop:function(){record=false;window.__auditRecording=false;active=false;gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;var s=state();s.liquidActivity={awake:liquidStatAwake,sleeping:liquidStatSleeping,frozen:liquidStatFrozen};return {scene:scene,rows:rows,gpu:gpuRows,webgpu:window.__gpuAudit,state:s};}
  };
})();
`;
const prelude=String.raw`
(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
addEventListener('DOMContentLoaded',()=>{document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));let css=document.createElement('style');css.textContent='#game-pause,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-wrapper{max-width:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);dispatchEvent(new Event('resize'));});
})();
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(pathname==='/js/sluice.js'){let src=bundleSource.toString(),end=src.lastIndexOf('})();');data=Buffer.from(src.slice(0,end)+probe+src.slice(end));}if(pathname==='/js/audio.js')data=Buffer.from(data.toString().replace('  // ===== public API',audioProbe+'\n  // ===== public API'));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch(e){res.writeHead(500);res.end(String(e));}});
let chrome,ws,seq=0;const pending=new Map(),errors=[];
let traceStream=null;
async function browserCall(method,params={}){const endpoint=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version')).json();return new Promise((resolve,reject)=>{const socket=new WebSocket(endpoint.webSocketDebuggerUrl);socket.onopen=()=>socket.send(JSON.stringify({id:1,method,params}));socket.onerror=reject;socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){socket.close();m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}};});}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},45000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
function stats(values){const a=values.slice().sort((a,b)=>a-b);return a.length?{n:a.length,avg:a.reduce((a,b)=>a+b,0)/a.length,p50:a[a.length>>1],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],p999:a[Math.floor(a.length*.999)],max:a.at(-1)}:null;}
const summaries=fs.existsSync(path.join(out,'summary.json'))?JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8')).filter(r=>!scenes.includes(r.scene)):[];
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const executable=electron?(process.env.ELECTRON_EXE||path.join(root,'desktop/node_modules/electron/dist/electron.exe')):process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
  const positioned=process.env.WINDOW_X!==undefined,fullscreen=process.env.FULLSCREEN!=='0';
  const args=[...(headed?(fullscreen&&!positioned?['--start-fullscreen']:[]):['--headless=new']),'--mute-audio','--enable-precise-memory-info','--enable-unsafe-webgpu','--use-angle='+(process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan'),'--no-first-run','--user-data-dir='+browserProfile,'--remote-debugging-port='+debugPort];
  if(electron)args.push(path.join(root,'desktop'),'--fullscreen','--profile='+browserProfile,'--audit-url=http://127.0.0.1:'+port+'/grand-motherload.html');else args.push('about:blank');
  chrome=spawn(executable,args,{stdio:'ignore',windowsHide:!headed,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  fs.writeFileSync(path.join(out,'browser-pid.txt'),String(chrome.pid));
  let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert(target,'Chrome boot');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onclose=()=>{for(const p of pending.values())p.reject(Error('CDP disconnected'));pending.clear();};
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);if(m.method==='Tracing.tracingComplete')traceStream=m.params.stream;};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  let windowInfo=null;
  if(positioned){
    const {windowId}=await browserCall('Browser.getWindowForTarget',{targetId:target.id});
    await browserCall('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
    await browserCall('Browser.setWindowBounds',{windowId,bounds:{left:Number(process.env.WINDOW_X),top:Number(process.env.WINDOW_Y||0),width:Number(process.env.WINDOW_WIDTH||1080),height:Number(process.env.WINDOW_HEIGHT||1800)}});
    // A per-monitor DPI transition can rescale the first bounds request.
    await sleep(500);
    await browserCall('Browser.setWindowBounds',{windowId,bounds:{left:Number(process.env.WINDOW_X),top:Number(process.env.WINDOW_Y||0),width:Number(process.env.WINDOW_WIDTH||1080),height:Number(process.env.WINDOW_HEIGHT||1800)}});
    if(fullscreen)await browserCall('Browser.setWindowBounds',{windowId,bounds:{windowState:'fullscreen'}});
    await sleep(500);
    windowInfo=await browserCall('Browser.getWindowBounds',{windowId});
  }
  fs.writeFileSync(path.join(out,'display.json'),JSON.stringify({windowInfo,refreshHz:Number(process.env.REFRESH_HZ||144),screen:await ev('({x:screenX,y:screenY,width:screen.width,height:screen.height,availLeft:screen.availLeft,availTop:screen.availTop,dpr:devicePixelRatio})')},null,2));
  fs.writeFileSync(path.join(out,'environment.json'),JSON.stringify({browser:await send('Browser.getVersion'),cpu:os.cpus()[0].model,logicalCores:os.cpus().length,platform:os.platform(),root,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),bundleRef,seconds,scenes,viewport,headed,electron,canvasOptions,clockRunning:process.env.CLOCK==='1',initialTimeOfDay:process.env.TOD?Number(process.env.TOD):null,overlay:process.env.OVERLAY==='1',warmupSeconds:Number(process.env.WARMUP||3),experiment:process.env.EXPERIMENT||null,isolate:process.env.ISOLATE||null,preset:process.env.PRESET||'default',disabled:process.env.DISABLE||null,audio:process.env.AUDIO==='1',gpuTiming:gpu,cpuSampling},null,2));
  await send('Emulation.setDeviceMetricsOverride',viewport);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:prelude+'window.__runningClock='+(process.env.CLOCK==='1')+';window.__keepOverlay='+(process.env.OVERLAY==='1')+';window.__initialTOD='+JSON.stringify(process.env.TOD?Number(process.env.TOD):null)+';window.__isolateStage='+JSON.stringify(process.env.ISOLATE||'')+';window.__auditGPU='+gpu+';'+(canvasOptions?`{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,this.id==='game-canvas'&&type==='2d'?${JSON.stringify(canvasOptions)}:options);};}`:'')+(gpu?'('+installGPUAudit.toString()+')();':'')+(process.env.SAVED?`localStorage.setItem('sluice.opt.gfx',${JSON.stringify(process.env.SAVED)});`:'')});
  for(const scene of scenes){
    errors.length=0;
    await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?dev=1&nosave=1&nopause=1&tod=.5'+(process.env.PRESET?'&gmpreset='+encodeURIComponent(process.env.PRESET):'')});
    let ready=false;for(let i=0;i<500;i++){if(await ev('!!window.__audit&&__audit.ready()')){ready=true;break;}await sleep(100);}assert(ready,'Scene load '+JSON.stringify(errors));
    const boot=await ev('__audit.state()');
    if(process.env.AUDIO==='1'){
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:100,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:800,y:100,button:'left',clickCount:1});
      await sleep(10000);
    }
    const adapter=await ev('(async()=>{let a=await navigator.gpu?.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture,features:[...a.features]}:null})()');
    const start=await ev('__audit.start('+JSON.stringify(scene)+','+JSON.stringify(process.env.DISABLE||'')+')');
    await sleep(Number(process.env.WARMUP||3)*1000);
    if(process.env.TRACE==='1'){traceStream=null;await send('Tracing.start',{categories:'devtools.timeline,cc,gpu,viz,disabled-by-default-gpu.service',transferMode:'ReturnAsStream'});}
    if(cpuSampling){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});await send('Profiler.start');}
    let presentation;
    if(process.env.PRESENTMON){assert(headed,'Presentation capture requires a visible window');const info=await browserCall('SystemInfo.getProcessInfo'),gpuProcess=info.processInfo.find(p=>p.type==='GPU');assert(gpuProcess,'GPU process');presentation=spawn(process.env.PRESENTMON,['--process_id',String(gpuProcess.id),'--timed',String(seconds),'--terminate_after_timed','--no_console_stats','--session_name','SluiceAudit'+chrome.pid,'--output_file',path.join(out,scene+'.present.csv')],{windowsHide:true,stdio:['ignore',fs.openSync(path.join(out,scene+'.present.log'),'w'),fs.openSync(path.join(out,scene+'.present-error.log'),'w')]});}
    await sleep(150);await ev('__audit.clear()');
    let inputEvents;
    if(scene==='human')inputEvents=await humanInputRoute(send,seconds);else await sleep(seconds*1000);
    const result=await ev('__audit.stop()');
    result.hiddenTerrain=await ev('window.__perf&&__perf.hiddenTerrain?__perf.hiddenTerrain():null');
    result.windowEnd=await browserCall('Browser.getWindowForTarget',{targetId:target.id});
    if(inputEvents)result.inputEvents=inputEvents;
    result.bundleSHA256=createHash('sha256').update(bundleSource).digest('hex');
    result.bundleRef=bundleRef;
    if(presentation&&presentation.exitCode===null)await new Promise(resolve=>{presentation.once('exit',resolve);setTimeout(()=>{if(presentation.exitCode===null)presentation.kill();resolve();},5000);});
    let profile;if(cpuSampling){profile=(await send('Profiler.stop')).profile;fs.writeFileSync(path.join(out,scene+'.cpuprofile'),JSON.stringify(profile));}
    result.boot=boot;result.start=start;result.adapter=adapter;result.errors=errors.slice();result.audio=await ev('window.__audioAudit&&__audioAudit()');
    fs.writeFileSync(path.join(out,scene+'.json'),JSON.stringify(result));
    // Preserve the core measurement before optional, potentially large traces.
    if(process.env.TRACE==='1'){
      await send('Tracing.end');for(let i=0;i<1200&&!traceStream;i++)await sleep(50);
      assert(traceStream,'Trace completed');
      const fd=fs.openSync(path.join(out,scene+'.trace.json'),'w');
      try{let part;do{part=await send('IO.read',{handle:traceStream,size:1024*1024});fs.writeSync(fd,Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));}while(!part.eof);}
      finally{fs.closeSync(fd);await send('IO.close',{handle:traceStream});}
    }
    fs.writeFileSync(path.join(out,scene+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    const keys=new Set(result.rows.flatMap(r=>Object.keys(r.buckets)));
    const buckets=[...keys].map(k=>[k,stats(result.rows.map(r=>r.buckets[k]||0))]).sort((a,b)=>b[1].avg-a[1].avg);
    const hits=new Map();if(profile){const byId=new Map(profile.nodes.map(n=>[n.id,n]));for(let i=0;i<profile.samples.length;i++){const n=byId.get(profile.samples[i]),key=n.callFrame.functionName+' '+n.callFrame.url.split('/').at(-1)+':'+(n.callFrame.lineNumber+1);hits.set(key,(hits.get(key)||0)+profile.timeDeltas[i]/1000);}}
    const summary={scene,version:boot.version,adapter,canvas:start.canvas,bootMs:boot.bootMs,frame:stats(result.rows.map(r=>r.dt)),cpu:stats(result.rows.map(r=>r.cpu)),over8ms:result.rows.filter(r=>r.dt>8).length,buckets,gpu:[...new Set(result.gpu.map(r=>r.name))].map(k=>[k,stats(result.gpu.filter(r=>r.name===k).map(r=>r.ms))]),profile:[...hits].sort((a,b)=>b[1]-a[1]).slice(0,25),errors:result.errors};
    summaries.push(summary);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
    console.log(JSON.stringify({...summary,buckets:buckets.slice(0,14)}));assert.equal(errors.length,0,'No game errors');assert(result.rows.length>seconds*25,'Enough live frames');
    if(scene==='human'&&headed){
      assert(result.rows.every(r=>r.focus&&r.visible),'Input route stayed focused and visible');
      if(seconds>=10){
        const xs=result.rows.map(r=>r.x);
        assert(Math.max(...xs)-Math.min(...xs)>100,'Input route actually travelled');
        assert(result.rows.some(r=>r.ground)&&result.rows.some(r=>!r.ground),'Input route included ground and air');
      }
    }
  }
  console.log('Artifacts: '+out);
}finally{
  if(ws){try{await send('Browser.close');}catch{}ws.close();}
  if(chrome&&chrome.exitCode===null)await new Promise(resolve=>{chrome.once('exit',resolve);setTimeout(resolve,2000);});
  if(chrome&&chrome.exitCode===null)chrome.kill();server.close();
  assert.equal(path.dirname(path.resolve(browserProfile)),path.resolve(os.tmpdir()));
  assert(path.basename(browserProfile).startsWith('sluice-audit-chrome-'));
  try{fs.rmSync(browserProfile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
  catch(error){console.warn('Browser profile cleanup deferred: '+browserProfile+' ('+error.code+')');}
}
