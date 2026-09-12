// Run: DUMP=/tmp/sluice-surface-smoke node tools/sluice-surface-smoke.mjs
// Uses an owned Chrome for Testing process and a disposable browser profile.
// The probe is injected by this local server only, never into the shipped game.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8796), debugPort = port + 1000;
const dump = process.env.DUMP && path.resolve(process.env.DUMP);
if (dump) {
  assert.ok(dump !== root && !dump.startsWith(root + path.sep), 'DUMP must be outside the repository');
  fs.mkdirSync(dump, { recursive: true });
}
const profile = fs.mkdtempSync('/tmp/sluice-surface-smoke-profile-');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map(), reports = [];
let chrome, ws, sequence = 0, checks = 0;
const probe = `
window.__surfaceSmoke = (function () {
  var originalRender = render;
  var centerCol = 80;
  function state() { return { version:GAME_VERSION, tile:TILE, surfaceY:SKY_ROWS*TILE,
    cam:{x:cam.x,y:cam.y}, width:viewW,height:viewH,scale:worldScale,day:timeOfDay,
    transition:typeof drawSurfaceTransition === 'function',
    depth:typeof SURFACE_TRANSITION_DEPTH === 'number' ? SURFACE_TRANSITION_DEPTH : null }; }
  function stop() {
    gamePaused=true; if(gameRafId) cancelAnimationFrame(gameRafId); gameRafId=0;
    introPhase='done';
    document.body.classList.add('gm-fs');
    document.body.appendChild(document.querySelector('.game-wrapper'));
    var css=document.createElement('style');
    css.textContent='#game-pause,#game-intro,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-canvas-area{width:100%!important;height:100%!important}';
    document.head.appendChild(css);
    PERF_DISABLE_CONSOLE=true; PERF_DISABLE_WEATHER=true;
    PERF_DISABLE_SMOKE_FLUID=true; PERF_DISABLE_EXHAUST_BRIDGE=true;
    drawHUD=function(){}; drawDpad=function(){}; drawPerfOverlay=function(){};
    drawItemWheel=function(){}; drawItemWheelButton=function(){};
    timeOfDay=0.5; SUN.paused=true; grassWindTune.ambient=0;
    resize(); return state();
  }
  function specimen(o) {
    var depth=o.depth || 5, width=o.width || 7, deep=o.deep || 0;
    var c0=centerCol-Math.floor(width/2), c1=c0+width;
    for(var r=0;r<SKY_ROWS+100;r++) {
      for(var c=centerCol-38;c<centerCol+39;c++) {
        world[r][c]=r<SKY_ROWS ? null : {type:'dirt',hp:ORES.dirt.hp};
      }
    }
    surfacePonds=[]; liquidParticles=[]; liquidCount=0; jelloBodies=[];
    for(var y=SKY_ROWS+deep;y<SKY_ROWS+deep+depth;y++) {
      for(var x=c0;x<c1;x++) world[y][x]=null;
    }
    if(deep) for(var y=SKY_ROWS;y<SKY_ROWS+deep;y++) world[y][centerCol]=null;
    // A visible untouched cavern below the shallow excavation gives depth context.
    if(!deep) for(var y=SKY_ROWS+depth+2;y<SKY_ROWS+depth+6;y++) {
      for(var x=c0-1;x<c1+1;x++) world[y][x]=null;
    }
    player.x=(centerCol+0.5)*TILE-PLAYER_W/2;
    player.y=(SKY_ROWS+deep+depth)*TILE-PLAYER_H;
    player.renderX=player.x; player.renderY=player.y;
    player.vx=player.vy=0; player.onGround=true;
    treesRebuild(); lightingInit();
    terrainChunkCache={}; terrainChunkCount=0; terrainWarmupFrames=3;
    terrainChunkRebuildBoostFrames=100; terrainClearOverlays=[]; terrainClearedKinds={};
    timeOfDay=o.night ? 0 : 0.5;
    zoomMode=o.zoom || 'out'; resize();
    if(o.scale) {worldScale=targetWorldScale=o.scale;screenW=viewW/worldScale;screenH=viewH/worldScale;syncTerrainChunkRenderScale();}
    cam.x=(centerCol+0.5)*TILE-screenW/2;
    cam.y=deep ? (SKY_ROWS+deep+depth/2)*TILE-screenH/2 : SKY_ROWS*TILE-screenH*(o.sky || 0.27);
    for(var n=0;n<60;n++) originalRender();
    return state();
  }
  function drawAt(cx,cy,segments) {
    var oldCtx=ctx, ox=cam.x, oy=cam.y;
    var c=document.createElement('canvas');c.width=1024;c.height=240;
    try {
      ctx=c.getContext('2d',{willReadFrequently:true});
      cam.x=cx;cam.y=cy;ctx.setTransform(1,0,0,1,-cx,-SKY_ROWS*TILE);
      var fn=typeof drawSurfaceTransition === 'function' ? drawSurfaceTransition : drawSurfaceDirtCap;
      for(var s=0;s<(segments || 1);s++) {
        ctx.save();ctx.beginPath();ctx.rect(cx+s*1024/(segments || 1),SKY_ROWS*TILE,1024/(segments || 1),240);ctx.clip();
        fn(cx+s*1024/(segments || 1),cx+(s+1)*1024/(segments || 1));ctx.restore();
      }
      return c;
    } finally {ctx=oldCtx;cam.x=ox;cam.y=oy;}
  }
  function pixels(c) {return c.getContext('2d').getImageData(0,0,c.width,c.height).data;}
  function compare(a,b) {
    var n=0,max=0,sum=0;
    for(var i=0;i<a.length;i++){var d=Math.abs(a[i]-b[i]);if(d)n++;if(d>max)max=d;sum+=d;}
    return {changed:n,max:max,mean:sum/a.length};
  }
  function seamAlpha(scale) {
    var old=ctx,c=document.createElement('canvas');c.width=1024;c.height=240;
    try {
      ctx=c.getContext('2d',{willReadFrequently:true});ctx.setTransform(scale,0,0,scale,-cam.x*scale,-SKY_ROWS*TILE*scale);
      drawSurfaceTransition(cam.x,cam.x+1024/scale);
      var a=ctx.getImageData(0,Math.round(30*scale),1024,1).data,min=255,defects=[];
      for(var x=3;x<1021;x++) {var alpha=a[x*4+3];min=Math.min(min,alpha);if(alpha<254)defects.push({x:x,alpha:alpha});}
      return {scale:scale,minAlpha:min,defects:defects};
    } finally {ctx=old;}
  }
  function surfaceMouths() {
    var saved=ctx, c0=centerCol-3, c1=centerCol+3;
    var test=document.createElement('canvas');test.width=9*TILE;test.height=2*TILE;
    try {
      ctx=test.getContext('2d',{willReadFrequently:true});
      ctx.translate(-(c0-1)*TILE,-SKY_ROWS*TILE);
      drawSmoothVoids(SKY_ROWS,SKY_ROWS+1,c0-1,c1+1);
      var data=ctx.getImageData(0,0,test.width,test.height).data;
      var residue=0, solid=0;
      // A wide open mouth must meet the sky all the way across. Keep
      // the real solid shoulders opaque on either side of the opening.
      for(var y=0;y<6;y++)for(var x=TILE+3;x<8*TILE-3;x++)
        if(data[(y*test.width+x)*4+3])residue++;
      for(var y=0;y<6;y++) {
        solid+=data[(y*test.width+4)*4+3];
        solid+=data[(y*test.width+test.width-5)*4+3];
      }
      return {residue:residue,solid:solid};
    } finally {ctx=saved;}
  }
  function diagnostics() {
    var before=JSON.stringify(world), x=cam.x, y=cam.y;
    var seams=[seamAlpha(1.2),seamAlpha(1.5),seamAlpha(2.55),seamAlpha(3.2142857142857144)];
    var a=drawAt(x,y), bytes=pixels(a);
    drawAt(x+TILE*47,y+TILE*3);
    var again=drawAt(x,y), split=drawAt(x,y,4);
    var alphas=[];
    for(var row=0;row<a.height;row++) {var sum=0;for(var col=0;col<a.width;col++)sum+=bytes[(row*a.width+col)*4+3];alphas.push(sum/a.width);}
    var g=ctx, timings=[], cold=[], recolor=[], oldX=cam.x, oldY=cam.y, oldTime=timeOfDay;
    var scratch=document.createElement('canvas');scratch.width=1024;scratch.height=240;
    try {
      ctx=scratch.getContext('2d');ctx.setTransform(1,0,0,1,-x,-SKY_ROWS*TILE);
      var fn=typeof drawSurfaceTransition === 'function' ? drawSurfaceTransition : drawSurfaceDirtCap;
      for(var coldRun=0;coldRun<3;coldRun++) {
        surfaceTransitionCache.clear();var begin=performance.now();fn(x,x+1024);cold.push(performance.now()-begin);
      }
      for(var palette=0;palette<4;palette++) {
        timeOfDay=palette%2 ? 0.5 : 0;var begin=performance.now();fn(x,x+1024);recolor.push(performance.now()-begin);
      }
      timeOfDay=oldTime;
      for(var run=0;run<8;run++) {var t=performance.now();for(var n=0;n<100;n++)fn(x,x+1024);timings.push((performance.now()-t)/100);}
    } finally {ctx=g;cam.x=oldX;cam.y=oldY;timeOfDay=oldTime;}
    timings.sort(function(a,b){return a-b;});
    return { mouth:surfaceMouths(), seamAlpha:seams, terrainUnchanged:before===JSON.stringify(world), roundTrip:compare(bytes,pixels(again)),
      split:compare(bytes,pixels(split)), alphaRows:alphas,
      drawMs:{median:timings[4],max:timings[7],min:timings[0],cold:cold,paletteChange:recolor},cacheEntries:surfaceTransitionCache.size,
      surfaceImage:a.toDataURL('image/png') };
  }
  return {state:state,stop:stop,specimen:specimen,diagnostics:diagnostics,
    render:function(){originalRender();}, move:function(dx,dy){cam.x+=dx;cam.y+=dy;for(var n=0;n<40;n++)originalRender();return state();}};
})();
`;
const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.m4a':'audio/mp4','.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
    let data=fs.readFileSync(file);
    if(pathname==='/js/sluice.js') {
      const source=data.toString(), end=source.lastIndexOf('})();');
      assert.ok(end>0,'game IIFE end found');
      data=Buffer.from(source.slice(0,end)+probe+source.slice(end));
    }
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  } catch(error) {res.writeHead(500);res.end(String(error));}
});
function send(method,params={}) {
  return new Promise((resolve,reject) => {
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
function check(name,value) {assert.ok(value,name);checks++;console.log('PASS '+name);}
async function size(width,height,mobile=false) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await sleep(120);
}
async function shot(name) {
  if(!dump)return;
  const result=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(result.data,'base64'));
}
async function scene(name,options,viewport=[1440,900,false]) {
  await size(...viewport);
  const state=await ev('__surfaceSmoke.specimen('+JSON.stringify(options)+')');
  await shot(name);reports.push({name,...state});console.log('VIEW '+name+' '+JSON.stringify(state));
  return state;
}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`,[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
    `--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'about:blank'
  ],{stdio:'ignore'});
  let chromeError;chrome.once('error',error=>{chromeError=error;});
  let target;
  for(let i=0;i<100;i++) {if(chromeError)throw chromeError;try {target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  assert.ok(target,'Chrome for Testing started');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(p)message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error')errors.push(message.params.args);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);})();'});
  await size(1440,900);
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&jello=0&tod=0.5`});
  let ready=false;
  for(let n=0;n<160;n++){if(await ev('!!window.__surfaceSmoke')){ready=true;break;}await sleep(100);}
  check('game booted',ready);await ev('document.fonts.ready');await ev('__surfaceSmoke.stop()');
  const initial=await scene('pit-day',{width:7,depth:5,scale:2.55});
  check('replacement renderer is built',initial.transition);
  const diagnostic=await ev('__surfaceSmoke.diagnostics()');
  console.log('MOUTH '+JSON.stringify(diagnostic.mouth));
  check('open excavation has no foreground slivers at the sky',diagnostic.mouth.residue===0);
  check('solid surface shoulders remain opaque',diagnostic.mouth.solid===12*255);
  check('drawing preserves the terrain grid',diagnostic.terrainUnchanged);
  check('camera travel returns identical transition pixels',diagnostic.roundTrip.changed===0);
  check('drawing adjacent view strips preserves the same image',diagnostic.split.max<=8 && diagnostic.split.mean<0.05);
  const depth=initial.depth;
  check('fractional zoom keeps cache boundaries opaque',diagnostic.seamAlpha.every(s=>s.minAlpha===255));
  check('transition cache stays bounded',diagnostic.cacheEntries<=16);
  check('transition fades out before its lower boundary',depth!==null && diagnostic.alphaRows[Math.min(239,Math.ceil(depth)+2)]<0.2);
  if(dump)fs.writeFileSync(path.join(dump,'transition-isolated.png'),Buffer.from(diagnostic.surfaceImage.split(',')[1],'base64'));
  delete diagnostic.surfaceImage;reports.push({diagnostic});
  console.log('DRAW '+JSON.stringify(diagnostic.drawMs));
  console.log('SEAM '+JSON.stringify(diagnostic.seamAlpha));
  await scene('pit-night',{width:7,depth:5,scale:2.55,night:true});
  await scene('wide-shallow-night',{width:17,depth:3,scale:2.55,night:true});
  await scene('narrow-shaft',{width:1,depth:9,scale:2.55});
  await scene('broad-excavation',{width:25,depth:11,zoom:'out'});
  await ev('__surfaceSmoke.move(17.25,41.5)');await shot('broad-scrolled-fractional');
  await scene('below-transition',{width:14,depth:20,scale:2,sky:0.08});
  await ev('__surfaceSmoke.move(0,230)');await shot('below-transition-scrolled');
  await scene('deep-underground',{width:16,depth:10,deep:65,zoom:'out'});
  await scene('zoom-close',{width:7,depth:5,zoom:'in'});
  await scene('mobile-portrait',{width:7,depth:5,zoom:'out'},[390,844,true]);
  await scene('mobile-landscape',{width:7,depth:5,zoom:'out'},[844,390,true]);
  check('browser reports no console or runtime errors',errors.length===0);
  if(dump)fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({checks,reports,errors},null,2));
  console.log(`PASS ${checks} surface transition checks, ${reports.length-1} views`);
} finally {
  if(ws) {try{await send('Browser.close');}catch{}ws.close();}
  if(chrome && chrome.exitCode===null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000)]);
    if(chrome.exitCode===null)chrome.kill('SIGKILL');
  }
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
}
