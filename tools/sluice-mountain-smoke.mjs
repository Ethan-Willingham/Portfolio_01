import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
// Run: node tools/sluice-mountain-smoke.mjs
// CHROME overrides the browser executable. DUMP keeps reports/screenshots
// outside the checkout. Uses an owned browser profile and a fresh unsaved world.
// BEFORE_FRAGMENT optionally benchmarks a saved older mountain fragment.
// BUILD_ROOT verifies an assembled release while other agents edit the checkout.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP ? path.resolve(process.env.DUMP) : fs.mkdtempSync(path.join(os.tmpdir(),'sluice-mountain-results-'));
assert(out!==root && !out.startsWith(root+path.sep),'DUMP must be outside the checkout');
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-mountain-chrome-'));
const port=Number(process.env.PORT || 8862), debugPort=port+1000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probe=String.raw`
window.__mountainQA=(function(){
  var rows=[],builds=0,running=false,previous=0,testClock=null;
  var before=typeof mtnPathCache==='undefined',build=before?buildMtnStrip:buildMtnPaths;
  if(before)buildMtnStrip=function(){builds++;return build.apply(this,arguments);};
  else {
    buildMtnPaths=function(){builds++;return build.apply(this,arguments);};
    var oldLight=updateMountainLight;
    updateMountainLight=function(now){return oldLight(testClock===null?now:testClock);};
  }
  var draw=drawSkyMountains;
  drawSkyMountains=function(){
    var start=performance.now(),result=draw.apply(this,arguments);
    if(running)rows.push({ms:performance.now()-start,dt:previous?start-previous:0});
    previous=start;return result;
  };
  return {
    ready:function(){return !!player&&gameLoadingAssetsReady&&!gameLoadingWorkPending;},
    start:function(){
      document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));
      var css=document.createElement('style');css.textContent='#game-pause,#game-intro,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);
      resize();drawPerfOverlay=function(){};
      introPhase='done';gamePaused=false;startInPause=false;bootPauseFired=true;SUN.paused=false;timeOfDay=.735;DAY_CYCLE_SECONDS=48;
      if(gameRafId)cancelAnimationFrame(gameRafId);lastTime=performance.now();gameRafId=requestAnimationFrame(loop);
      return {version:GAME_VERSION,before:before,width:canvas.width,height:canvas.height};
    },
    sample:function(){rows=[];builds=0;running=true;},
    stop:function(){running=false;gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;return {rows:rows,builds:builds};},
    scene:function(t,x,alt){
      timeOfDay=t;SUN.paused=true;if(!before)mtnLight=null;
      if(x!==undefined)player.x=x;
      player.y=SKY_ROWS*TILE-PLAYER_H-(alt||0);player.vx=player.vy=0;
      player.renderX=player.x;player.renderY=player.y;resize();cam.snap=true;updateCamera();
      for(var i=0;i<10;i++)render();
      return {x:cam.x,y:cam.y,ws:dpr*worldScale,screenW:screenW};
    },
    verify:function(){
      if(before)return {baseline:true};
      var checks=[];
      function check(name,value){if(!value)throw Error(name);checks.push(name);}
      var savedCtx=ctx,savedCamX=cam.x,savedW=screenW,savedTime=timeOfDay,savedLights=drawMtnLights;
      var surface=SKY_ROWS*TILE,test=document.createElement('canvas');test.width=960;test.height=360;
      ctx=test.getContext('2d',{willReadFrequently:true});screenW=640;cam.x=2200;drawMtnLights=function(){};
      function frame(t,clock){
        timeOfDay=t;testClock=clock;updateAtmosCacheGL();
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,960,360);
        ctx.setTransform(1.5,0,0,1.5,-cam.x*1.5,-surface*1.5+330);
        drawSkyMountains(cam.x,cam.x+screenW,surface);
      }
      try {
        mtnPathCache={};mtnLight=null;frame(.23,0);
        var startBuilds=builds,last=null,maxStep=0;
        testClock=null;
        for(var i=0;i<=28800;i++){
          timeOfDay=i/28800;updateMountainLight(i*1000/60);
          if(last)maxStep=Math.max(maxStep,Math.abs(mtnLight.left-last.left),Math.abs(mtnLight.right-last.right));
          if(!Number.isFinite(mtnLight.left+mtnLight.right+mtnLight.day))throw Error('Non-finite light');
          last={left:mtnLight.left,right:mtnLight.right};
        }
        check('continuous sun and moon direction across a full day',maxStep<.001);
        mtnLight=null;
        var worst=null,maxPixel=0,alphaChanges=0,previousPixels=null,changedFrames=0;
        for(var f=0;f<180;f++){
          frame(.747+f/(480*60),f*1000/60);
          var pixels=ctx.getImageData(0,0,960,360).data,changed=false;
          if(previousPixels)for(var j=0;j<pixels.length;j+=4){
            if(pixels[j+3]!==previousPixels[j+3])alphaChanges++;
            if(pixels[j+3]===255&&previousPixels[j+3]===255)for(var k=0;k<3;k++){
              var delta=Math.abs(pixels[j+k]-previousPixels[j+k]);if(delta>maxPixel){maxPixel=delta;worst={f:f,x:(j/4)%960,y:Math.floor(j/4/960),k:k,a:previousPixels[j+k],b:pixels[j+k]};}if(delta)changed=true;
            }
          }
          if(changed)changedFrames++;previousPixels=pixels;
        }
        check('daylight never rebuilds geometry',builds===startBuilds);
        check('opaque mountain light changes by at most two RGB levels per frame: '+JSON.stringify({maxPixel:maxPixel,alphaChanges:alphaChanges,changedFrames:changedFrames,worst:worst}),maxPixel<=2);
        check('fixed silhouettes retain identical coverage throughout sunset',alphaChanges===0);
        check('sunset visibly changes mountain colours',changedFrames>20);
        var shapes=Object.values(mtnPathCache);
        ctx.scale(1.7,1.7);drawSkyMountains(cam.x,cam.x+screenW,surface);
        check('zoom reuses resolution-independent paths',builds===startBuilds);
        for(var q=0;q<shapes.length;q++)check('same geometry object for layer '+q,Object.values(mtnPathCache)[q]===shapes[q]);
        ctx.globalAlpha=.37;frame(.25,5000);check('mountains restore parent opacity',Math.abs(ctx.globalAlpha-.37)<1e-6);ctx.globalAlpha=1;
        for(var pos of [-5000,0,3500,100000]){cam.x=pos;frame(.75,6000);check('four bounded caches while scrolling',Object.keys(mtnPathCache).length===4);}
        var cfg={seed:137,step:150,minorRatio:.5,minHMajor:80,maxHMajor:130,minHMinor:32,maxHMinor:62};
        var paths=buildMtnPaths(cfg,surface,-3,3),peaks=[];
        for(var z=-3;z<=3;z++)peaks.push(buildMountainPeak(z,137,150,surface,cfg));
        ctx.setTransform(1,0,0,1,450,200-surface);ctx.clearRect(-450,surface-200,960,360);ctx.fill(paths.body);
        var raster=ctx.getImageData(0,0,960,360).data,solid=true,interior=0;
        for(var pk of peaks)for(var x=Math.ceil(pk.pts[0][0])+3;x<pk.pts[6][0]-3;x++){
          for(var si=0;si<6;si++)if(x>=pk.pts[si][0]&&x<pk.pts[si+1][0]){
            var a=pk.pts[si],b=pk.pts[si+1],top=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
            var px=x+450,py=Math.ceil(top)+4+200-surface;
            if(px>=0&&px<960&&py>=0&&py<210){interior++;if(raster[(py*960+px)*4+3]!==255)solid=false;}
          }
        }
        check('overlapping peaks have opaque interiors',solid&&interior>100);
        return {checks:checks,maxDirectionalStep:maxStep,maxPixelStep:maxPixel,changedFrames:changedFrames,alphaChanges:alphaChanges};
      } finally {ctx=savedCtx;cam.x=savedCamX;screenW=savedW;timeOfDay=savedTime;drawMtnLights=savedLights;testClock=null;mtnLight=null;}
    }
  };
})();
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}if(process.env.BUILD_ROOT){const built=path.join(process.env.BUILD_ROOT,pathname);if(fs.existsSync(built))file=built;}let data=fs.readFileSync(file);if(pathname==='/js/sluice.js'){
const fragments=fs.readdirSync(path.join(root,'js/sluice')).filter(n=>/^\d{3}-.*\.js$/.test(n)).sort();
let source=process.env.BUILD_ROOT?data.toString():fragments.map(n=>n==='160-render-mountains.js'&&process.env.BEFORE_FRAGMENT?fs.readFileSync(process.env.BEFORE_FRAGMENT,'utf8'):fs.readFileSync(path.join(root,'js/sluice',n),'utf8')).join('');
const end=source.lastIndexOf('})();');data=Buffer.from(source.slice(0,end)+probe+source.slice(end));
}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch(e){res.writeHead(500);res.end(String(e));}});
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

  await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?nosave=1&nopause=1&wmood=clear'});
  let ready=false;for(let i=0;i<240;i++){if(await ev('!!window.__mountainQA && __mountainQA.ready()')){ready=true;break;}await sleep(100);}
  if(!ready)throw Error('Boot timeout '+JSON.stringify(errors));
  console.log('STATE',JSON.stringify(await ev('__mountainQA.start()')));
  await sleep(2000);await ev('__mountainQA.sample()');await sleep(8000);
  const result=await ev('__mountainQA.stop()');
  function stats(a){a=a.slice().sort((x,y)=>x-y);return {n:a.length,avg:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)};}
  console.log('PERF',JSON.stringify({mountains:stats(result.rows.map(r=>r.ms)),frames:stats(result.rows.map(r=>r.dt)),builds:result.builds}));
  assert(result.rows.length>100,'sampled active game frames');
  const verify=await ev('__mountainQA.verify()');console.log('CHECKS',JSON.stringify(verify));
  const scenes=[['dawn',.25],['noon',.5],['sunset',.75],['night',0],
    ['snow-dawn',.25,1800,60],['snow-sunset',.75,1800,60],['snow-night',0,1800,60],['ascent',.75,2300,120]];
  for(const [name,t,x,alt] of scenes){
    await ev('__mountainQA.scene('+t+','+(x===undefined?'undefined':x)+','+(alt||0)+')');
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(200);await ev('__mountainQA.scene(.75)');
  const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'mobile.png'),Buffer.from(mobile.data,'base64'));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({result,verify,errors},null,2));
  if(errors.length)console.log('ERRORS',JSON.stringify(errors.slice(0,3)));
  assert.equal(errors.length,0,'no game runtime errors; report: '+out);
  console.log('PASS. Artifacts: '+out);
} finally {if(ws){try{await send('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null)chrome.kill();server.close();}
