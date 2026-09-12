import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
// Run: node tools/perf/scroll-smoothness.mjs
// CHROME overrides the browser executable. DUMP keeps reports/screenshots
// outside the checkout. Uses an owned browser profile and a fresh unsaved world.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.DUMP ? path.resolve(process.env.DUMP) : fs.mkdtempSync(path.join(os.tmpdir(),'sluice-motion-results-'));
assert(out!==root && !out.startsWith(root+path.sep),'DUMP must be outside the checkout');
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-motion-chrome-'));
const mode='scroll';
const port=Number(process.env.PORT || 8836), debugPort=port+1000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probe=String.raw`
window.__motion = (function(){
  var cold=[], oldBuild=buildSurfaceBankStrip; buildSurfaceBankStrip=function(i,n){var t=performance.now();var r=oldBuild(i,n);cold.push({index:i,near:n,x:cam.x,ms:performance.now()-t});return r;}; var rows=[], enabled=false, pinY=0, oldUpdate=update, oldRender=render, transform=null;
  var oldSet=ctx.setTransform;
  ctx.setTransform=function(a,b,c,d,e,f) { if(enabled && a===dpr*worldScale && a!==1 && !transform) transform=[e,f]; return oldSet.apply(this,arguments); };
  update=function(dt) {oldUpdate(dt); if(enabled){player.y=pinY;player.renderY=pinY;player.vy=0;player.onGround=false;player.fuel=getMaxFuel();}};
  render=function(){
    transform=null;var t=performance.now(); oldRender();
    if(enabled)rows.push({dt:lastFrameDt*1000,cpu:performance.now()-t,x:player.x,rx:player.renderX,cx:cam.x,tx:transform&&transform[0],scale:dpr*worldScale,buckets:Object.assign({},perfBucketsRaw),chunks:terrainChunkRebuildsThisFrame});
  };
  return {
    ready:function(){return !!player && gameLoadingAssetsReady && !gameLoadingWorkPending;},
    start:function(disable){
      document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));
      var css=document.createElement('style');css.textContent='#game-pause,#game-intro,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);
      resize();
      drawPerfOverlay=function(){};SUN.paused=true; timeOfDay=.5;
      if(disable==='effects'){PERF_DISABLE_WEATHER=true;PERF_DISABLE_SMOKE_FLUID=true;PERF_DISABLE_EXHAUST_BRIDGE=true;PERF_DISABLE_WATER=true;PERF_DISABLE_ROCKET=true;}
      if(disable==='smoke'){PERF_DISABLE_SMOKE_FLUID=true;PERF_DISABLE_EXHAUST_BRIDGE=true;}
      if(disable==='weather')PERF_DISABLE_WEATHER=true;
      if(disable==='terrain')PERF_DISABLE_TERRAIN_CHUNKS=true;
      player.x=80*TILE;pinY=SKY_ROWS*TILE-PLAYER_H-100;player.y=pinY;player.renderX=player.x;player.renderY=pinY;player.vx=flyTune.speed;player.vy=0;player.onGround=false;cam.snap=true;updateCamera();
      keys.ArrowRight=true; keys[' ']=true;introPhase='done';gamePaused=false;startInPause=false;bootPauseFired=true;
      if(gameRafId)cancelAnimationFrame(gameRafId);lastTime=performance.now();enabled=true;gameRafId=requestAnimationFrame(loop);
      return {version:GAME_VERSION,width:canvas.width,height:canvas.height,ws:dpr*worldScale,worldCols:COLS,gpu:!!liquidWGPU,screen:[screenW,screenH]};
    },
    clear:function(){rows=[];cold=[];},
    verify:function(){
      var checks=[];
      function check(name,value){if(!value)throw Error(name);checks.push(name);}
      for(var near=0;near<2;near++){
        var full=buildSurfaceBankStrip(-2,!!near),job=beginSurfaceBankStrip(-2,!!near),stepped=null,n=0;
        while(!stepped){stepped=advanceSurfaceBankStrip(job,[1,7,31,83][n++%4]);check('bounded bank progress',n<1000);}
        var same=true;for(var i=0;i<full.day.length;i++)if(full.day[i]!==stepped.day[i]||full.night[i]!==stepped.night[i]){same=false;break;}
        check('incremental '+(near?'root':'soil')+' pixels match a complete bake',same);
      }
      // Cheap CPU work must not conceal a missed refresh in smoothness stats.
      perfFrameRingFilled=perfFrameRingIdx=perfIntervalRingFilled=perfIntervalRingIdx=0;
      perfFpsCap=144;
      perfPushFrame(1,1000/144);perfPushFrame(1,2000/144);perfPushFrame(1,1000/144);
      check('smoothness detects a missed refresh with a 1 ms CPU frame',Math.abs(perfJankStats().jankPct-100/3)<.001);
      check('slow-frame rate comes from refresh intervals',Math.abs(perfJankStats().low1-72)<.001);
      check('CPU timing stays separate',perfFrameStats().p99===1);
      // Exercise the real chunk compositor with opaque cached tile bitmaps.
      // Any fractional-scroll crack makes a transparent pixel between chunks.
      var savedCtx=ctx,savedCache=terrainChunkCache,savedCount=terrainChunkCount;
      var oldWarm=terrainWarmupFrames,oldBoost=terrainChunkRebuildBoostFrames;
      try {
        terrainChunkCache={};terrainChunkCount=0;terrainWarmupFrames=terrainChunkRebuildBoostFrames=0;
        for(var r=0;r<4;r++)for(var c=0;c<8;c++){
          var tile=document.createElement('canvas'),cacheScale=TERRAIN_CHUNK_RENDER_SCALE;
          var size=Math.ceil((TERRAIN_CHUNK_PX+TERRAIN_CHUNK_PAD*2)*cacheScale);
          tile.width=tile.height=size;var g=tile.getContext('2d');g.fillStyle='#79634c';g.fillRect(0,0,size,size);
          terrainChunkCache[terrainChunkKey(r,c)]={canvas:tile,ctx:g,scale:cacheScale,ready:true,dirty:false,lastUsed:performance.now()};terrainChunkCount++;
        }
        var test=document.createElement('canvas');test.width=512;test.height=120;ctx=test.getContext('2d',{willReadFrequently:true});
        var scales=[1.2,1.5,2,2.55,3.2142857142857144];
        for(var si=0;si<scales.length;si++)for(var oi=0;oi<3;oi++){
          var scale=scales[si],offset=[.13,.49,.81][oi];
          ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,120);
          ctx.setTransform(scale,0,0,scale,-(TERRAIN_CHUNK_PX-80+offset)*scale,-32*scale);
          drawTerrainChunks(1,Math.ceil(120/scale/TILE)+1,Math.floor((TERRAIN_CHUNK_PX-80)/TILE),Math.ceil((TERRAIN_CHUNK_PX-80+512/scale)/TILE));
          var bytes=ctx.getImageData(0,0,512,120).data,opaque=true;
          for(var y=4;y<116;y++)for(var x=4;x<508;x++)if(bytes[(y*512+x)*4+3]!==255)opaque=false;
          check('opaque chunk joins at scale '+scale+' offset '+offset,opaque);
        }
      } finally {ctx=savedCtx;terrainChunkCache=savedCache;terrainChunkCount=savedCount;terrainWarmupFrames=oldWarm;terrainChunkRebuildBoostFrames=oldBoost;}
      return checks.filter(function(name){return name!=='bounded bank progress';});
    },
    stop:function(){enabled=false;gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;return {rows:rows,cold:cold,diag:perfJankStats(),fps:perfFps,buckets:perfTopBuckets(12)};}
  };
})();
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(pathname==='/js/sluice.js'){let source=data.toString();if(mode==='subpixel')source=source.replaceAll('-Math.round((cam.x - _shk.x) * ws)','-(cam.x - _shk.x) * ws').replaceAll('-Math.round((cam.y - _shk.y) * ws)','-(cam.y - _shk.y) * ws');const end=source.lastIndexOf('})();');data=Buffer.from(source.slice(0,end)+probe+source.slice(end));}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch(e){res.writeHead(500);res.end(String(e));}});
let chrome,ws,seq=0;const pending=new Map(),errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},45000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
try {
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const executable=process.env.CHROME || (process.platform==='win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
  const angle=process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan';
  chrome=spawn(executable,['--headless=new','--enable-unsafe-webgpu','--use-angle='+angle,'--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  let target;for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  if(!target)throw Error('Chrome not started');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);})();'});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.5`});
  let ready=false;for(let i=0;i<240;i++){if(await ev('!!window.__motion && __motion.ready()')){ready=true;break;}await sleep(100);}
  if(!ready)throw Error('Boot timeout '+JSON.stringify(errors));
  console.log('STATE',JSON.stringify(await ev(`__motion.start(${JSON.stringify(mode)})`)));
  console.log('ADAPTER',JSON.stringify(await ev('(async()=>{if(!navigator.gpu)return null;let a=await navigator.gpu.requestAdapter();return a ? {vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description} : null})()')));
  await sleep(2500);await ev('__motion.clear()');
  await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});await send('Profiler.start');
  await sleep(9000);
  const profileData=await send('Profiler.stop');fs.writeFileSync(path.join(out,mode+'.cpuprofile'),JSON.stringify(profileData.profile));
  const result=await ev('__motion.stop()');result.errors=errors;fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result));
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,mode+'.png'),Buffer.from(shot.data,'base64'));
  function stats(a){a=a.slice().sort((x,y)=>x-y);return {n:a.length,avg:a.reduce((s,v)=>s+v,0)/a.length,p50:a[a.length>>1],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};}
  console.log('RESULT',JSON.stringify({mode,frame:stats(result.rows.map(r=>r.dt)),render:stats(result.rows.map(r=>r.cpu)),over144:result.rows.filter(r=>r.dt>7.5).length,diag:result.diag,fps:result.fps,buckets:result.buckets,cold:result.cold,errors}));
  assert.equal(errors.length,0,'no game runtime errors');
  assert(result.rows.length>100,'game produced enough frames to sample');
  let reversals=0,samples=0;
  for(let i=30;i<result.rows.length;i++){
    const a=result.rows[i-1],b=result.rows[i],dc=(b.cx-a.cx)*b.scale;
    if(dc<=0)continue;
    assert.notEqual(b.tx,null,'world transform was captured');
    if(b.tx-a.tx+dc*.9>1e-7)reversals++;samples++;
  }
  assert(samples>100,'sampled sustained horizontal camera motion');
  assert.equal(reversals,0,'distant scenery never reverses during steady flight');
  assert.equal(result.cold.length,0,'soil textures were prepared before scrolling into view');
  const checks=await ev('__motion.verify()');
  console.log('PASS '+(checks.length+5)+' checks; '+samples+' scrolling frames, no background reversals or cold soil builds');
  console.log('Artifacts: '+out);
  const byId=new Map(profileData.profile.nodes.map(n=>[n.id,n]));const hits=new Map();for(let i=0;i<(profileData.profile.samples||[]).length;i++){let n=byId.get(profileData.profile.samples[i]);let key=n.callFrame.functionName+' '+n.callFrame.url.split('/').at(-1)+':'+(n.callFrame.lineNumber+1);hits.set(key,(hits.get(key)||0)+profileData.profile.timeDeltas[i]);}console.log('CPU',JSON.stringify([...hits].sort((a,b)=>b[1]-a[1]).slice(0,18)));
} finally {if(ws){try{await send('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null)chrome.kill();server.close();}
