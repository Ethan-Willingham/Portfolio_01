// Controlled scene audit. Run sequentially on an otherwise idle GPU.
// SCENES=drive,flight,pen,pond,cave,deep,night,storm; SECONDS=8; GPU=1
// CLOCK=1 TOD=.7 SCENES=cruise SECONDS=30 exercises moving light and bank re-entry.
// OVERLAY=1 retains diagnostics. EXPERIMENT=tools/perf/hitch-audit-probe.js adds attribution.
// SCENES=human uses real uneven keyboard gestures without overriding movement.
// SCENES=human-flyover flies up and down between the slime pen and the far end
// of the town (the dev boot builds the pen). NOVSYNC=1 uncaps frames, so each
// callback interval is that frame's cost; GANESH=1 forces Chrome's Ganesh raster
// backend, the one in the Windows traces. TRACE_CATEGORIES overrides TRACE=1's.
// PROFILE=0 omits CPU sampling when measuring normal frame delivery.
// BOOT_SECONDS=90 permits the game's 60-second GPU startup gates; failure saves state.
// FLIGHT_ROUTE=town uses the fuel/hull-checked corridor with town-flight-fixture.js.
// QUERY=snow=1 EXHAUST=copperhead SCENES=town measures a normal snow world
// with the chosen exhaust; the default query retains the dev-mode fixtures.
// ROOT can point at a second checkout; DUMP must stay outside the checkout.
// BUNDLE_REF serves a committed game bundle with this checkout's other assets.
// BUNDLE_SOURCE=/absolute/path serves a private assembled candidate instead.
// LIQUID_REF also selects the matching GPU engine for a coherent historical comparison.
// LIQUID_SOURCE=/absolute/path serves a private GPU variant without modifying the checkout.
// LIQUID_SOURCE and LIQUID_REF are mutually exclusive; captures record exact source hashes.
// SMOKE_SOURCE/SMOKE_REF and FIRE_SOURCE/FIRE_REF select the other GPU engines.
// CAPTURE=0 skips screenshots on a locked host; MIN_FPS=1 permits profiling severe slowdowns.
// SCENES=soft-new,soft-reference,soft-prior compares the playground with SOFT_CASE=pile.
// SIM_HZ fixes simulation dt for CPU workload comparisons, never a display-FPS measurement.
// SCENES=town-normal,slime-snow uses normal snow=1 boots at 1440x900 DPR2.
// VARIANTS=both,slimes,snow,neither runs independent query-override attribution boots.
// ACTIONS=mixed|hold|jet|walk|idle selects real inputs in slime-snow; default mixed.
// RESIDENTS=8 selects the combined scene population (1 to 32), default eight.
// DRY_RUN=1 prints the planned runs without starting a server or browser.
// TIMELINE=1 records every callback from loading through recovery, with live second bins.
// RECOVERY=10 keeps the game running after capture inputs are released (default 0).
// See tools/perf/SLIME_SNOW.md for capture commands and interpretation.
// WINDOW_X/Y place a normal test window on a second display. FULLSCREEN=0
// keeps that window normal; REFRESH_HZ records an explicitly requested OS display mode.
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
assert(!(bundleRef&&process.env.BUNDLE_SOURCE),'BUNDLE_REF and BUNDLE_SOURCE are mutually exclusive');
assert(!process.env.BUNDLE_SOURCE||path.isAbsolute(process.env.BUNDLE_SOURCE),'BUNDLE_SOURCE must be an absolute path');
const bundleSourcePath=bundleRef?null:process.env.BUNDLE_SOURCE||path.join(root,'js/sluice.js');
const liquidRef=process.env.LIQUID_REF||null;
assert(!(liquidRef&&process.env.LIQUID_SOURCE),'LIQUID_REF and LIQUID_SOURCE are mutually exclusive');
assert(!process.env.LIQUID_SOURCE||path.isAbsolute(process.env.LIQUID_SOURCE),'LIQUID_SOURCE must be an absolute path');
const liquidSourcePath=liquidRef?null:process.env.LIQUID_SOURCE||path.join(root,'js/liquid-wgpu.js');
const liquidSource=liquidRef?execFileSync('git',['show',liquidRef+':js/liquid-wgpu.js'],{cwd:root,maxBuffer:4*1024*1024}):fs.readFileSync(liquidSourcePath);
const liquidSHA256=createHash('sha256').update(liquidSource).digest('hex');
const smokeRef=process.env.SMOKE_REF||null;
assert(!(smokeRef&&process.env.SMOKE_SOURCE),'SMOKE_REF and SMOKE_SOURCE are mutually exclusive');
assert(!process.env.SMOKE_SOURCE||path.isAbsolute(process.env.SMOKE_SOURCE),'SMOKE_SOURCE must be an absolute path');
const smokeSourcePath=smokeRef?null:process.env.SMOKE_SOURCE||path.join(root,'js/smoke-wgpu.js');
const smokeSource=smokeRef?execFileSync('git',['show',smokeRef+':js/smoke-wgpu.js'],{cwd:root,maxBuffer:4*1024*1024}):fs.readFileSync(smokeSourcePath);
const smokeSHA256=createHash('sha256').update(smokeSource).digest('hex');
const fireRef=process.env.FIRE_REF||null;
assert(!(fireRef&&process.env.FIRE_SOURCE),'FIRE_REF and FIRE_SOURCE are mutually exclusive');
assert(!process.env.FIRE_SOURCE||path.isAbsolute(process.env.FIRE_SOURCE),'FIRE_SOURCE must be an absolute path');
const fireSourcePath=fireRef?null:process.env.FIRE_SOURCE||path.join(root,'js/fire-wgpu.js');
const fireSource=fireRef?execFileSync('git',['show',fireRef+':js/fire-wgpu.js'],{cwd:root,maxBuffer:4*1024*1024}):fs.readFileSync(fireSourcePath);
const fireSHA256=createHash('sha256').update(fireSource).digest('hex');
const bundleSource=bundleRef?execFileSync('git',['show',bundleRef+':js/sluice.js'],{cwd:root,maxBuffer:16*1024*1024}):fs.readFileSync(bundleSourcePath);
const out=process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(),'sluice-audit-'));
assert(!path.resolve(out).startsWith(root+path.sep)); fs.mkdirSync(out,{recursive:true});
const port=Number(process.env.PORT || 8840), debugPort=port+1000;
const seconds=Number(process.env.SECONDS || 8), gpu=process.env.GPU==='1';
const bootSeconds=Number(process.env.BOOT_SECONDS||90);
assert(Number.isFinite(bootSeconds)&&bootSeconds>0,'BOOT_SECONDS must be positive');
const residentCount=Number(process.env.RESIDENTS||8);
assert(Number.isInteger(residentCount)&&residentCount>=1&&residentCount<=32,'RESIDENTS must be 1 to 32');
const timeline=process.env.TIMELINE==='1', recovery=Number(process.env.RECOVERY||0);
assert(Number.isFinite(recovery)&&recovery>=0,'RECOVERY must be nonnegative seconds');
const scenes=(process.env.SCENES || 'drive,flight,pen,pond,cave,deep,night,storm').split(',');
const fixtureScene=name=>name==='town-normal'||name==='slime-snow';
const combinedScenes=scenes.some(fixtureScene);
const cpuSampling=!gpu&&(process.env.PROFILE==='1'||(process.env.PROFILE===undefined&&!combinedScenes));
const viewport={width:Number(process.env.WIDTH||(combinedScenes?1440:1798)),height:Number(process.env.HEIGHT||(combinedScenes?900:954)),deviceScaleFactor:Number(process.env.DPR||(combinedScenes?2:1.25)),mobile:false};
const fixtureSource=combinedScenes?fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'slime-snow-fixture.js'),'utf8'):'';
const variants=(process.env.VARIANTS||'configured').split(',');
assert(variants.every(v=>['configured','both','slimes','snow','neither'].includes(v)),'Known attribution variants');
const runs=scenes.flatMap(scene=>variants.map(variant=>{
  const query=new URLSearchParams(process.env.QUERY??(fixtureScene(scene)?'snow=1':'dev=1'));
  if(variant!=='configured'){
    query.set('jello',variant==='both'||variant==='slimes'?'1':'0');
    query.set('snow',variant==='both'||variant==='snow'?'1':'0');
    if(query.get('snow')==='0')query.set('rain','0');
  }
  const scheduler=query.get('_rafTimer')==='1'?'timer':'nativeRAF';
  return {scene,variant,id:scene+(variant==='configured'?'':'-'+variant),query:query.toString(),
    timeMode:Number(process.env.SIM_HZ)>0?'fixedDt':scheduler,scheduler};
}));
if(process.env.DRY_RUN==='1'){
  console.log(JSON.stringify({runs,viewport,seconds,gpu,cpuSampling,timeline,recovery,actions:process.env.ACTIONS||'mixed',
    minimumCombinedParticles:Number(process.env.PARTICLE_MIN??5000),liquidRef,liquidSourcePath,liquidSHA256,smokeRef,smokeSourcePath,smokeSHA256,out},null,2));
  process.exit(0);
}
const experiment=process.env.EXPERIMENT?fs.readFileSync(process.env.EXPERIMENT,'utf8'):'';
const canvasOptions=process.env.CANVAS_OPTIONS?JSON.parse(process.env.CANVAS_OPTIONS):null;
const electron=process.env.ELECTRON==='1', headed=electron||process.env.HEADED==='1';
const audioProbe=String.raw`window.__audioAudit=function(){var tracks=Object.keys(buffers).map(function(name){var b=buffers[name];return {name:name,seconds:b.duration,bytes:b.length*b.numberOfChannels*4};});return {state:ctx&&ctx.state,tracks:tracks,decodedBytes:tracks.reduce(function(s,t){return s+t.bytes;},0),heap:performance.memory&&performance.memory.usedJSHeapSize};};`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browserProfile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-audit-chrome-'));
const probe=String.raw`
${fixtureSource}
${experiment}
window.__audit=(function(){
  var rows=[],record=false,scene='',pinX=0,pinY=0,move=false,flying=false,rising=false,active=false,cruise=false,cruiseTime=0,cruiseRight=true;
  var loopCalls=0,oldLoop=loop,oldUpdate=update,previous=0,gpuRows=[],gpuPending=[],glCount=0;
  var loadingRows=[],oldLoading=renderLoadingScene;
  var jelloMicrosteps=null;
  var timelineRows=[],timelineBins=[],timelinePhase='loading',timelineOrigin=null,timelineBin=null;
  function flushTimeline(){
    if(!timelineBin)return;
    var b=timelineBin;b.callbackFps=b.durationMs>0?b.intervals*1000/b.durationMs:null;
    b.cpuAvgMs=b.cpuTotalMs/b.frames;delete b.cpuTotalMs;
    timelineBins.push(b);console.log('__SLUICE_TIMELINE__'+JSON.stringify(b));timelineBin=null;
  }
  function timelineFrame(row){
    if(!window.__auditTimeline)return;
    if(timelineOrigin===null)timelineOrigin=row.at;
    row.elapsedMs=row.at-timelineOrigin;
    row.phase=timelinePhase==='loading'&&introPhase==='done'?'startup':timelinePhase;
    row.introPhase=introPhase;row.hudFps=perfFps;
    row.hudCpuMs=typeof perfFrameMs==='number'?perfFrameMs:null;
    row.liquids=liquidCount;row.jello=jelloBodies.length;
    timelineRows.push(row);
    var second=Math.floor(row.elapsedMs/1000);
    if(timelineBin&&timelineBin.second!==second)flushTimeline();
    if(!timelineBin)timelineBin={second:second,firstAtMs:row.elapsedMs,lastAtMs:row.elapsedMs,frames:0,intervals:0,durationMs:0,cpuTotalMs:0,cpuMaxMs:0,hudFpsMin:null,hudFpsMax:null,phases:{},last:null};
    var b=timelineBin;b.frames++;b.lastAtMs=row.elapsedMs;
    if(row.dt>0){b.intervals++;b.durationMs+=row.dt;}
    b.cpuTotalMs+=row.cpu;b.cpuMaxMs=Math.max(b.cpuMaxMs,row.cpu);
    b.hudFpsMin=b.hudFpsMin===null?row.hudFps:Math.min(b.hudFpsMin,row.hudFps);
    b.hudFpsMax=b.hudFpsMax===null?row.hudFps:Math.max(b.hudFpsMax,row.hudFps);
    b.phases[row.phase]=(b.phases[row.phase]||0)+1;
    b.last={hudFps:row.hudFps,liquids:row.liquids,jello:row.jello,slimes:row.slimes,fixture:row.fixture,visible:row.visible,focus:row.focus};
  }
  if(typeof softHandlingPrepare==='function'){
    var oldHandlingPrepare=softHandlingPrepare;
    softHandlingPrepare=function(totalSteps,h){jelloMicrosteps=totalSteps;return oldHandlingPrepare.apply(this,arguments);};
  }
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
  loop=function(time){loopCalls++;var t=performance.now(),dt=previous?time-previous:0;previous=time;
    var jelloBefore=jelloFrameNo;jelloMicrosteps=null;
    if(window.__auditSimHz&&introPhase==='done')lastTime=time-1000/window.__auditSimHz;
    var result=oldLoop(time),cpu=performance.now()-t;
    var outerTicks=jelloFrameNo===jelloBefore?0:jelloLastSubs;
    window.__auditJelloTiming={outerTicks:outerTicks,microstepMultiplier:JELLO_SOLVER==='pbd'?1:Math.max(1,JELLO_XPBD_SUBSTEPS),
      microsteps:outerTicks?jelloMicrosteps:0,contacts:outerTicks?jelloContactsThisFrame:0};
    var frameFixture=(record||window.__auditTimeline)&&window.__slimeSnowFixture?__slimeSnowFixture.frame():null;
    if(window.__auditTimeline)timelineFrame({at:t,dt:dt,cpu:cpu,focus:document.hasFocus(),visible:!document.hidden,slimes:window.__auditJelloTiming,fixture:frameFixture});
    if(record&&introPhase==='done')rows.push({variant:window.__auditVariant||null,at:t,tod:timeOfDay,dt:dt,cpu:cpu,x:player.x,y:player.y,cx:cam.x,cy:cam.y,vx:player.vx,vy:player.vy,ground:player.onGround,fuel:player.fuel,hull:player.hull,focus:document.hasFocus(),visible:!document.hidden,maskWidth:smokeObstWaterCanvas&&smokeObstWaterCanvas.width,maskHeight:smokeObstWaterCanvas&&smokeObstWaterCanvas.height,buckets:Object.assign({},perfBucketsRaw),chunks:terrainChunkRebuildsThisFrame,heap:performance.memory?performance.memory.usedJSHeapSize:0});
    if(record&&introPhase==='done'){
      rows[rows.length-1].slimes=Object.assign({awake:jelloBodies.filter(function(b){return !b.sleeping&&!b.frozen;}).length},window.__auditJelloTiming);
      if(window.__slimeSnowFixture)rows[rows.length-1].fixture=frameFixture;
    }
    if(record&&introPhase==='done'&&typeof terrainBatchDraws!=='undefined'){
      rows[rows.length-1].terrain={direct:terrainDirectDraws,batches:terrainBatchDraws,builds:terrainBatchBuilds,bytes:terrainBatchBytes};
    }
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
  function state(){return {fixture:window.__slimeSnowFixture?__slimeSnowFixture.snapshot():null,loopHealth:{calls:loopCalls,phase:introPhase,paused:gamePaused,raf:gameRafId,visible:!document.hidden,focus:document.hasFocus()},smokeMask:window.__smokeObst?window.__smokeObst.info():null,version:GAME_VERSION,preset:gm.activePreset,canvas:[canvas.width,canvas.height],scale:dpr*worldScale,player:[player.x,player.y],camera:[cam.x,cam.y],mountains:typeof mtnGPU!=='undefined'?{active:!!mtnGPU&&!mtnGPUFailed,failed:mtnGPUFailed,size:mtnGPU&&[mtnGPU.canvas.width,mtnGPU.canvas.height],samples:mtnGPU&&mtnGPU.gl.getParameter(mtnGPU.gl.SAMPLES)}:null,liquids:liquidCount,jello:jelloBodies.length,awake:jelloBodies.filter(function(b){return !b.sleeping&&!b.frozen;}).length,bodies:jelloBodies.map(function(b){return {n:b.n,x:b.cx,y:b.cy,box:[b.bboxL,b.bboxT,b.bboxR,b.bboxB],sleep:b.sleeping,frozen:b.frozen,hits:b._cHits,cr:b.cr};}),smoke:[smokeFluidCanvas&&smokeFluidCanvas.width,smokeFluidCanvas&&smokeFluidCanvas.height],smokeTune:smokeTune,webgpu:!!(liquidWGPU&&liquidWGPU.ready),bootMs:performance.now(),warmup:loadingRows};}
  return {ready:function(){
      if(introPhase==='done'&&smokeFluidActive&&!smokeWGPUDriving&&
          (smokeDriver!==SmokeFluid||!smokeDriver.isReady()))throw Error('Smoke experiment left the active driver disconnected');
      return introPhase==='done';
    },state:state,inputBounds:function(){return {x:player.x,left:(DECK_LEFT_COL-23)*TILE,right:(DECK_LEFT_COL-13)*TILE};},
    flyState:function(){return {x:player.x,altitude:SKY_ROWS*TILE-(player.y+PLAYER_H),left:(DECK_LEFT_COL-24)*TILE,right:(DECK_RIGHT_COL+4)*TILE,ceiling:900};},
    start:function(name,disable){
      resize();scene=name;timelinePhase='warmup';if(!window.__keepOverlay)drawPerfOverlay=function(){};SUN.paused=!window.__runningClock;timeOfDay=window.__initialTOD===null?(name.startsWith('night')?.02:.5):window.__initialTOD;
      if(window.__auditExhaust){var savedMoney=money;money=999999;var bought=rigExhaustPurchase(window.__auditExhaust);money=savedMoney;if(!bought.ok)throw Error('Audit exhaust unavailable: '+window.__auditExhaust);}
      if(name==='storm')gm.preset('storm ceiling');
      var disabled=disable.split(',');
      if(disabled.indexOf('smoke')>=0){PERF_DISABLE_SMOKE_FLUID=true;PERF_DISABLE_EXHAUST_BRIDGE=true;}
      if(disabled.indexOf('water')>=0)PERF_DISABLE_WATER=true;
      if(disabled.indexOf('sky')>=0)PERF_DISABLE_NIGHTSKY=true;
      if(disabled.indexOf('jello')>=0){ENABLE_JELLO=false;}
      if(disabled.indexOf('weather')>=0)PERF_DISABLE_WEATHER=true;
      if(window.__slimeSnowFixture&&__slimeSnowFixture.handles(name)){
        active=false;gamePaused=false;startInPause=false;bootPauseFired=true;
        __slimeSnowFixture.setup(name);return state();
      }
      if(name.startsWith('soft-')){
        if(!softProjectEnabled||!softPlayEnabled)throw Error('Soft audit requires softplay=1&softnext=1');
        softPlayTick(0);softPlayCase=window.__auditSoftCase;
        if(name==='soft-reference')softProjectUseReference();else softProjectSelect(name==='soft-new');
        softPlayReset();active=false;gamePaused=false;startInPause=false;bootPauseFired=true;
        return state();
      }
      if(name==='human'||name==='human-slimes'||name==='human-flyover'){
        if(name==='human-slimes'||name==='human-flyover'){
          player.x=(DECK_LEFT_COL-(name==='human-flyover'?5:25))*TILE;player.y=SKY_ROWS*TILE-PLAYER_H-2;
          player.renderX=player.x;player.renderY=player.y;player.vx=player.vy=0;
          cam.snap=true;updateCamera();
        }
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
      if(name==='town')pinX=DECK_CENTER_COL*TILE;
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
    },timelineStage:function(phase){timelinePhase=phase;},pauseCapture:function(){record=false;window.__auditRecording=false;},finishTimeline:function(){flushTimeline();return {rowCount:timelineRows.length,bins:timelineBins,origin:timelineOrigin};},timelineRows:function(from,to){return timelineRows.slice(from,to);},clear:function(){timelinePhase='capture';rows=[];gpuRows=[];if(window.__gpuAudit)window.__gpuAudit.rows=[];record=true;window.__auditRecording=true;},
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
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(pathname==='/js/sluice.js'){let src=bundleSource.toString(),end=src.lastIndexOf('})();');data=Buffer.from(src.slice(0,end)+probe+src.slice(end));}if(pathname==='/js/liquid-wgpu.js'&&liquidSource)data=liquidSource;if(pathname==='/js/smoke-wgpu.js')data=smokeSource;if(pathname==='/js/fire-wgpu.js')data=fireSource;if(pathname==='/js/audio.js')data=Buffer.from(data.toString().replace('  // ===== public API',audioProbe+'\n  // ===== public API'));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch(e){res.writeHead(500);res.end(String(e));}});
let chrome,ws,seq=0;const pending=new Map(),errors=[];
let traceStream=null,timelineArtifact=null;
async function browserCall(method,params={}){const endpoint=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version')).json();return new Promise((resolve,reject)=>{const socket=new WebSocket(endpoint.webSocketDebuggerUrl);socket.onopen=()=>socket.send(JSON.stringify({id:1,method,params}));socket.onerror=reject;socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){socket.close();m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}};});}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},45000);pending.set(id,{resolve:r=>{clearTimeout(t);resolve(r)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
function stats(values){const a=values.slice().sort((a,b)=>a-b);return a.length?{n:a.length,avg:a.reduce((a,b)=>a+b,0)/a.length,p50:a[a.length>>1],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],p999:a[Math.floor(a.length*.999)],max:a.at(-1)}:null;}
function summarizeGPU(audit){
  if(!audit)return {supported:false,samples:0,encoders:[],passes:[],note:'GPU=1 enables asynchronous timestamp queries.'};
  const rows=audit.rows||[],encoders=[...new Set(rows.map(r=>r.name))].map(name=>({name,totalMs:stats(rows.filter(r=>r.name===name).map(r=>r.ms))}));
  const passes=rows.flatMap(r=>(r.passes||[]).map(p=>({encoder:r.name,...p})));
  return {supported:audit.supported,samples:rows.length,errors:audit.errors||[],encoders,
    passes:[...new Set(passes.map(p=>p.encoder+' / '+p.name))].map(name=>({name,ms:stats(passes.filter(p=>p.encoder+' / '+p.name===name).map(p=>p.ms))})),
    note:'Total is the sum of timestamped passes in each sampled encoder (every 24th per label), not total display GPU time. Readback generation, age, count and pending state are in each fixture frame.'};
}
async function combinedInputRoute(send,ev,duration,kind){
  assert(['mixed','idle','hold','jet','walk'].includes(kind),'Known combined input route');
  const patterns={mixed:[[1.2,'hold'],[.7,'right'],[.5,'jet'],[.4,'idle'],[.8,'left'],[.4,'idle']],
    hold:[[1.5,'hold'],[.4,'idle']],jet:[[.55,'jet'],[1.1,'idle']],walk:[[.8,'right'],[.9,'left'],[.3,'idle']],idle:[[1,'idle']]};
  const virtual={ArrowLeft:37,ArrowRight:39,ArrowUp:38};
  const began=performance.now(),log=[];let held=new Set(),index=0,pointer=null;
  async function keys(next){
    for(const key of held)if(!next.has(key))await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:virtual[key]});
    for(const key of next)if(!held.has(key))await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:virtual[key]});
    held=next;
  }
  async function release(){if(pointer){await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pointer.x,y:pointer.y,button:'left',buttons:0,clickCount:1});pointer=null;}}
  try{
    while(performance.now()-began<duration*1000){
      const [seconds,action]=patterns[kind][index++%patterns[kind].length];
      const until=Math.min(began+duration*1000,performance.now()+seconds*1000);
      let direction=action;
      if(action==='left'||action==='right'){
        const bounds=await ev('__slimeSnowFixture.bounds()');
        if(bounds.x<bounds.left)direction='right';else if(bounds.x>bounds.right)direction='left';
      }
      await keys(new Set(direction==='jet'?['ArrowUp']:direction==='left'?['ArrowLeft']:direction==='right'?['ArrowRight']:[]));
      const entry={atMs:performance.now()-began,action:action,keys:[...held]};log.push(entry);
      if(action==='hold'){
        const start=await ev('__slimeSnowFixture.pointer()');
        entry.resident=start?.id??null;
        if(start){
          pointer={x:start.x,y:start.y};
          await send('Input.dispatchMouseEvent',{type:'mouseMoved',...pointer,buttons:0});
          await send('Input.dispatchMouseEvent',{type:'mousePressed',...pointer,button:'left',buttons:1,clickCount:1});
          entry.grabAccepted=await ev('__slimeSnowFixture.frame().holding');
          const holdStart=performance.now();
          while(performance.now()<until){
            const progress=Math.min(1,(performance.now()-holdStart)/450);
            pointer={x:start.x+20*progress,y:start.y-45*progress};
            await send('Input.dispatchMouseEvent',{type:'mouseMoved',...pointer,button:'left',buttons:1});
            await sleep(Math.min(50,Math.max(0,until-performance.now())));
          }
          await release();
        }
      }
      await sleep(Math.max(0,until-performance.now()));
    }
  }finally{await release();await keys(new Set());}
  return log;
}
const summaries=fs.existsSync(path.join(out,'summary.json'))?JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8')).filter(r=>!runs.some(run=>run.id===r.scene)):[];
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const executable=electron?(process.env.ELECTRON_EXE||path.join(root,'desktop/node_modules/electron/dist/electron.exe')):process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
  const positioned=process.env.WINDOW_X!==undefined,fullscreen=process.env.FULLSCREEN!=='0';
  const args=[...(headed?(fullscreen&&!positioned?['--start-fullscreen']:[]):['--headless=new']),'--mute-audio',...(process.env.NOVSYNC==='1'?['--disable-gpu-vsync','--disable-frame-rate-limit']:[]),...(process.env.GANESH==='1'?['--disable-features=SkiaGraphite']:[]),'--enable-precise-memory-info','--enable-unsafe-webgpu','--use-angle='+(process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan'),'--no-first-run','--user-data-dir='+browserProfile,'--remote-debugging-port='+debugPort];
  if(electron)args.push(path.join(root,'desktop'),'--fullscreen','--profile='+browserProfile,'--audit-url=http://127.0.0.1:'+port+'/grand-motherload.html');else args.push('about:blank');
  chrome=spawn(executable,args,{stdio:'ignore',windowsHide:!headed,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  fs.writeFileSync(path.join(out,'browser-pid.txt'),String(chrome.pid));
  let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert(target,'Chrome boot');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onclose=()=>{for(const p of pending.values())p.reject(Error('CDP disconnected'));pending.clear();};
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);if(timeline&&timelineArtifact&&m.method==='Runtime.consoleAPICalled'){const value=m.params.args?.[0]?.value;if(typeof value==='string'&&value.startsWith('__SLUICE_TIMELINE__')){const bin=JSON.parse(value.slice('__SLUICE_TIMELINE__'.length));const entry={scene:timelineArtifact,...bin};fs.appendFileSync(path.join(out,timelineArtifact+'.timeline-bins.jsonl'),JSON.stringify(entry)+'\n');console.log('Timeline '+JSON.stringify(entry));}}if(m.method==='Tracing.tracingComplete')traceStream=m.params.stream;};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  try{fs.writeFileSync(path.join(out,'gpu-system.json'),JSON.stringify(await browserCall('SystemInfo.getInfo'),null,2));}
  catch(error){fs.writeFileSync(path.join(out,'gpu-system.json'),JSON.stringify({unavailable:String(error)}));}
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
  fs.writeFileSync(path.join(out,'display.json'),JSON.stringify({windowInfo,requestedRefreshHz:process.env.REFRESH_HZ ? Number(process.env.REFRESH_HZ) : null,screen:await ev('({x:screenX,y:screenY,width:screen.width,height:screen.height,availLeft:screen.availLeft,availTop:screen.availTop,dpr:devicePixelRatio})')},null,2));
  fs.writeFileSync(path.join(out,'environment.json'),JSON.stringify({browser:await send('Browser.getVersion'),cpu:os.cpus()[0].model,logicalCores:os.cpus().length,platform:os.platform(),root,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),bundleRef,bundleSourcePath,liquidRef,liquidSourcePath,liquidSHA256,smokeRef,smokeSourcePath,smokeSHA256,fireRef,fireSourcePath,fireSHA256,simulationHz:Number(process.env.SIM_HZ)||null,softCase:process.env.SOFT_CASE||'pile',flightRoute:process.env.FLIGHT_ROUTE||'flyover',query:process.env.QUERY??null,bootSeconds,runs,timeModes:runs.map(r=>({scene:r.id,timeMode:r.timeMode,scheduler:r.scheduler})),exhaust:process.env.EXHAUST||null,seconds,timeline,recoverySeconds:recovery,scenes,viewport,headed,electron,canvasOptions,clockRunning:process.env.CLOCK==='1',initialTimeOfDay:process.env.TOD?Number(process.env.TOD):null,overlay:process.env.OVERLAY==='1',residentCount,savedGraphics:process.env.SAVED||null,warmupSeconds:Number(process.env.WARMUP||3),experiment:process.env.EXPERIMENT||null,isolate:process.env.ISOLATE||null,preset:process.env.PRESET||'default',disabled:process.env.DISABLE||null,audio:process.env.AUDIO==='1',gpuTiming:gpu,cpuSampling,novsync:process.env.NOVSYNC==='1',ganesh:process.env.GANESH==='1'},null,2));
  await send('Emulation.setDeviceMetricsOverride',viewport);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:prelude+'window.__auditTimeline='+timeline+';window.__auditExhaust='+JSON.stringify(process.env.EXHAUST||'')+';window.__runningClock='+(process.env.CLOCK==='1')+';window.__keepOverlay='+(process.env.OVERLAY==='1')+';window.__initialTOD='+JSON.stringify(process.env.TOD?Number(process.env.TOD):null)+';window.__isolateStage='+JSON.stringify(process.env.ISOLATE||'')+';window.__auditGPU='+gpu+';'+(canvasOptions?`{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,this.id==='game-canvas'&&type==='2d'?${JSON.stringify(canvasOptions)}:options);};}`:'')+(gpu?'('+installGPUAudit.toString()+')();':'')+(process.env.SAVED?`localStorage.setItem('sluice.opt.gfx',${JSON.stringify(process.env.SAVED)});`:'')});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__auditResidentCount='+residentCount+';window.__auditSoftCase='+JSON.stringify(process.env.SOFT_CASE||'pile')+';window.__auditSimHz='+JSON.stringify(Number(process.env.SIM_HZ)||0)+';'});
  for(const run of runs){
    const scene=run.scene,artifact=run.id;
    errors.length=0;timelineArtifact=artifact;
    if(timeline)fs.writeFileSync(path.join(out,artifact+'.timeline-bins.jsonl'),'');
    if(headed)await send('Page.bringToFront');
    await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?'+run.query+'&nosave=1&nopause=1&tod=.5'+(process.env.PRESET?'&gmpreset='+encodeURIComponent(process.env.PRESET):'')});
    let ready=false;for(let i=0;i<bootSeconds*10;i++){if(await ev('!!window.__audit&&__audit.ready()')){ready=true;break;}await sleep(100);}
    if(!ready)fs.writeFileSync(path.join(out,artifact+'.failed-boot.json'),JSON.stringify(await ev('window.__audit&&__audit.state()'),null,2));
    assert(ready,'Scene load '+JSON.stringify(errors));
    if(headed)await send('Page.bringToFront');
    const boot=await ev('__audit.state()');
    if(process.env.AUDIO==='1'){
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:100,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:800,y:100,button:'left',clickCount:1});
      await sleep(10000);
    }
    const adapter=await ev('(async()=>{let a=await navigator.gpu?.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture,features:[...a.features]}:null})()');
    const start=await ev('__audit.start('+JSON.stringify(scene)+','+JSON.stringify(process.env.DISABLE||'')+')');
    await sleep(Number(process.env.WARMUP||3)*1000);
    if(headed){await send('Page.bringToFront');await sleep(250);}
    const warmed=await ev('__audit.state()');
    fs.writeFileSync(path.join(out,artifact+'.warmup.json'),JSON.stringify({start:start.loopHealth,end:warmed.loopHealth},null,2));
    assert(warmed.loopHealth.calls>start.loopHealth.calls+10,'Live animation loop before capture: '+JSON.stringify(warmed.loopHealth));
    if(headed)assert(warmed.loopHealth.visible&&warmed.loopHealth.focus,'Visible, focused browser before capture');
    if(process.env.TRACE==='1'){traceStream=null;await send('Tracing.start',{categories:process.env.TRACE_CATEGORIES||'devtools.timeline,cc,gpu,viz,disabled-by-default-gpu.service',transferMode:'ReturnAsStream'});}
    if(cpuSampling){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});await send('Profiler.start');}
    let presentation;
    if(process.env.PRESENTMON){assert(headed,'Presentation capture requires a visible window');const info=await browserCall('SystemInfo.getProcessInfo'),gpuProcess=info.processInfo.find(p=>p.type==='GPU');assert(gpuProcess,'GPU process');presentation=spawn(process.env.PRESENTMON,['--process_id',String(gpuProcess.id),'--timed',String(seconds),'--terminate_after_timed','--no_console_stats','--session_name','SluiceAudit'+chrome.pid,'--output_file',path.join(out,artifact+'.present.csv')],{windowsHide:true,stdio:['ignore',fs.openSync(path.join(out,artifact+'.present.log'),'w'),fs.openSync(path.join(out,artifact+'.present-error.log'),'w')]});}
    await sleep(150);await ev('__audit.clear()');
    let inputEvents;
    if(scene==='slime-snow')inputEvents=await combinedInputRoute(send,ev,seconds,process.env.ACTIONS||'mixed');
    else if(scene.startsWith('human'))inputEvents=await humanInputRoute(send,seconds,scene==='human-slimes'?'slimes':scene==='human-flyover'?(process.env.FLIGHT_ROUTE||'flyover'):'surface');else await sleep(seconds*1000);
    if(recovery>0){await ev('__audit.pauseCapture();__audit.timelineStage("recovery")');await sleep(recovery*1000);}
    // Uncapped captures can hold tens of thousands of rows; fetch them in slices
    // so one oversized protocol message cannot drop the debugging connection.
    const result=await ev('(()=>{const r=__audit.stop();window.__auditRows=r.rows;r.rowCount=r.rows.length;r.rows=[];return r;})()');
    for(let i=0;i<result.rowCount;i+=1000)result.rows.push(...await ev('__auditRows.slice('+i+','+(i+1000)+')'));
    if(timeline){const measured=await ev('__audit.finishTimeline()');measured.rows=[];for(let i=0;i<measured.rowCount;i+=1000)measured.rows.push(...await ev('__audit.timelineRows('+i+','+(i+1000)+')'));fs.writeFileSync(path.join(out,artifact+'.timeline.json'),JSON.stringify(measured));fs.writeFileSync(path.join(out,artifact+'.timeline.jsonl'),measured.rows.map(row=>JSON.stringify(row)).join('\n')+'\n');result.timeline={rowCount:measured.rowCount,bins:measured.bins,origin:measured.origin,recoverySeconds:recovery};}
    result.hiddenTerrain=await ev('window.__perf&&__perf.hiddenTerrain?__perf.hiddenTerrain():null');
    result.windowEnd=await browserCall('Browser.getWindowForTarget',{targetId:target.id});
    if(inputEvents)result.inputEvents=inputEvents;
    result.bundleSHA256=createHash('sha256').update(bundleSource).digest('hex');
    result.smokeRef=smokeRef; result.smokeSourcePath=smokeSourcePath; result.smokeSHA256=smokeSHA256;result.fireRef=fireRef;result.fireSourcePath=fireSourcePath;result.fireSHA256=fireSHA256; result.bundleSourcePath=bundleSourcePath; result.bundleRef=bundleRef; result.liquidRef=liquidRef; result.liquidSourcePath=liquidSourcePath; result.liquidSHA256=liquidSHA256; result.simulationHz=Number(process.env.SIM_HZ)||null; result.timerDriven=run.scheduler==='timer'; result.timeMode=run.timeMode; result.scheduler=run.scheduler; result.variant=run.variant; result.query=run.query; result.warmed=warmed; result.captureSeconds=seconds; result.flightRoute=process.env.FLIGHT_ROUTE||'flyover';
    if(presentation&&presentation.exitCode===null)await new Promise(resolve=>{presentation.once('exit',resolve);setTimeout(()=>{if(presentation.exitCode===null)presentation.kill();resolve();},5000);});
    let profile;if(cpuSampling){profile=(await send('Profiler.stop')).profile;fs.writeFileSync(path.join(out,artifact+'.cpuprofile'),JSON.stringify(profile));}
    result.boot=boot;result.start=start;result.adapter=adapter;result.errors=errors.slice();result.gpuSummary=summarizeGPU(result.webgpu);result.audio=await ev('window.__audioAudit&&__audioAudit()');
    result.snowGuestDiagnostic=await ev('window.LiquidWGPU&&LiquidWGPU.last&&LiquidWGPU.last.readSnowGuestCount?LiquidWGPU.last.readSnowGuestCount():null');
    result.snowGuestDiagnosis=await ev('window.LiquidWGPU&&LiquidWGPU.last&&LiquidWGPU.last.readSnowGuestDiagnosis?LiquidWGPU.last.readSnowGuestDiagnosis():null');
    result.gpuWorkload=await ev('(()=>{var g=window.LiquidWGPU&&LiquidWGPU.last;if(!g)return null;return {grid:g.grid,activeBlocks:g.activeBlocks,uploadedCount:g.uploadedCount,airFusionLanes:g.snowBoundaryFused&&g.snowBoundaryFused.lanes,airFusionError:g.snowBoundaryFusedError,clearFusion:!!g.sparseClearFusion,indexResetFusion:!!g.snowIndexResetFusion,gridFusionError:g.sparseGridFusionError};})()');
    result.experimentStats=await ev('({computePasses:window.__computePassCoalescing?window.__computePassCoalescing.snapshot():null,skySnapshot:window.__skySnapshotExperiment?window.__skySnapshotExperiment.stats():null,bankClip:window.__bankClipExperiment?window.__bankClipExperiment.stats():null})');
    fs.writeFileSync(path.join(out,artifact+'.json'),JSON.stringify(result));
    // Preserve the core measurement before optional, potentially large traces.
    if(process.env.TRACE==='1'){
      await send('Tracing.end');for(let i=0;i<1200&&!traceStream;i++)await sleep(50);
      assert(traceStream,'Trace completed');
      const fd=fs.openSync(path.join(out,artifact+'.trace.json'),'w');
      try{let part;do{part=await send('IO.read',{handle:traceStream,size:1024*1024});fs.writeSync(fd,Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));}while(!part.eof);}
      finally{fs.closeSync(fd);await send('IO.close',{handle:traceStream});}
    }
    if(process.env.CAPTURE!=='0')fs.writeFileSync(path.join(out,artifact+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    const keys=new Set(result.rows.flatMap(r=>Object.keys(r.buckets)));
    const buckets=[...keys].map(k=>[k,stats(result.rows.map(r=>r.buckets[k]||0))]).sort((a,b)=>b[1].avg-a[1].avg);
    const hits=new Map();if(profile){const byId=new Map(profile.nodes.map(n=>[n.id,n]));for(let i=0;i<profile.samples.length;i++){const n=byId.get(profile.samples[i]),key=n.callFrame.functionName+' '+n.callFrame.url.split('/').at(-1)+':'+(n.callFrame.lineNumber+1);hits.set(key,(hits.get(key)||0)+profile.timeDeltas[i]/1000);}}
    const summary={scene:artifact,sceneName:scene,variant:run.variant,liquidRef,liquidSourcePath,liquidSHA256,smokeRef,smokeSourcePath,smokeSHA256,fireRef,fireSourcePath,fireSHA256,query:run.query,flightRoute:process.env.FLIGHT_ROUTE||'flyover',timeMode:run.timeMode,scheduler:run.scheduler,simulationHz:Number(process.env.SIM_HZ)||null,callbackFps:result.rows.length?1000/stats(result.rows.map(r=>r.dt)).avg:null,fpsNote:run.timeMode==='nativeRAF'?'Native rAF callback rate; display presentation requires separate telemetry':'Workload timing only, not native display FPS',fixture:{start:start.fixture,warmed:warmed.fixture,end:result.state.fixture},webgpu:result.gpuSummary,version:boot.version,adapter,canvas:start.canvas,bootMs:boot.bootMs,frame:stats(result.rows.map(r=>r.dt)),cpu:stats(result.rows.map(r=>r.cpu)),over8ms:result.rows.filter(r=>r.dt>8).length,buckets,gpu:[...new Set(result.gpu.map(r=>r.name))].map(k=>[k,stats(result.gpu.filter(r=>r.name===k).map(r=>r.ms))]),profile:[...hits].sort((a,b)=>b[1]-a[1]).slice(0,25),errors:result.errors};
    summaries.push(summary);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
    console.log(JSON.stringify({...summary,buckets:buckets.slice(0,14)}));assert.equal(errors.length,0,'No game errors');assert(result.rows.length>seconds*Number(process.env.MIN_FPS||(fixtureScene(scene)?1:25)),'Enough live frames');
    if(fixtureScene(scene)&&headed){
      assert(result.rows.every(r=>r.visible),'Combined capture stayed visible throughout');
      assert(result.rows.length>1&&result.rows.at(-1).at-result.rows[0].at>=seconds*900,'Combined capture covered the requested duration');
    }
    if(scene==='slime-snow'){
      const state=warmed.fixture;assert(state,'Combined fixture reports state');
      assert.equal(state.residents,state.expectedResidents,'Expected resident count survived warmup');
      if(state.flags.snow)assert(state.liquids>=Number(process.env.PARTICLE_MIN??5000),'Combined capture retained the requested particle population');
      if(state.flags.snow)assert(state.physicalSnow>0,'Physical snow is present');
    }
    if(scene.startsWith('human')&&headed){
      assert(result.rows.every(r=>r.focus&&r.visible),'Input route stayed focused and visible');
      if(seconds>=10){
        const xs=result.rows.map(r=>r.x);
        assert(Math.max(...xs)-Math.min(...xs)>100,'Input route actually travelled');
        assert(result.rows.some(r=>r.ground)&&result.rows.some(r=>!r.ground),'Input route included ground and air');
        if(scene==='human-slimes'){
          assert(result.rows.filter(r=>r.slimes.awake>0).length>100,'Slime route exercised awake physics');
          assert(result.rows.filter(r=>r.slimes.contacts>0).length>20,'Slime route exercised body contacts');
        }
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
