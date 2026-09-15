// First-use GPU programs during play. Boots Sluice with Chrome GPU tracing, drives
// a route, and reports the Canvas shader compiles that land after the loading
// reveal, by route phase, with the raster flushes they stall. Method and results:
// docs/game/PERFORMANCE_SHADER_WARMUP_2026-09-13.md. Run sequentially.
// ROUTE=tour (default) visits the rig, the slime pen, digging, selling, the store,
// the cargo and ledger menus, bombs, a cave, depth, a pond, altitude, night, a
// storm, upgraded tiers and death. ROUTE=surface drives the uneven keyboard route
// for SECONDS. BUNDLE_REF serves a committed game bundle with this checkout's
// other assets. PROFILE_DIR reuses a browser profile, so a second run is a repeat
// visit with Chrome's program cache already filled. SIGNATURES=1 lists each new
// Canvas draw state near a late compile, with its JavaScript stack.
// MAX_COMPILES=N exits 1 when more than N compiles land after the reveal.
// macOS forces Chrome's Ganesh GL raster backend, the one in the Windows traces;
// GANESH=0 keeps the browser default, which may not emit the counted events.
// MOBILE=1 emulates a phone. VSYNC=1 keeps vsync-paced frames; the uncapped
// default also runs while the display sleeps. DUMP keeps the raw trace and a
// summary outside the checkout. SHADER_DUMP=<dir> also writes the source of each
// shader ANGLE compiles there, which needs the GPU sandbox off. CHROME overrides
// the browser executable.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {humanInputRoute} from './human-input-route.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.env.ROOT||path.join(here,'../..'));
const bundleRef=process.env.BUNDLE_REF||null;
const bundle=bundleRef?execFileSync('git',['show',bundleRef+':js/sluice.js'],{cwd:root,maxBuffer:64*1024*1024}).toString():fs.readFileSync(path.join(root,'js/sluice.js'),'utf8');
const keepDump=!!process.env.DUMP;
const out=path.resolve(process.env.DUMP||fs.mkdtempSync(path.join(os.tmpdir(),'sluice-shader-trace-')));
assert(!out.startsWith(root+path.sep),'DUMP must stay outside the checkout');
fs.mkdirSync(out,{recursive:true});
const port=Number(process.env.PORT||8871),debugPort=port+1000;
const route=process.env.ROUTE||'tour',seconds=Number(process.env.SECONDS||20);
const ganesh=process.env.GANESH?process.env.GANESH!=='0':process.platform==='darwin';
const signatures=process.env.SIGNATURES==='1';
const maxCompiles=process.env.MAX_COMPILES?Number(process.env.MAX_COMPILES):null;
const profileDir=process.env.PROFILE_DIR?path.resolve(process.env.PROFILE_DIR):null;
const mobile=process.env.MOBILE==='1';
const viewport=mobile?{width:390,height:844,deviceScaleFactor:3,mobile:true}:
  {width:Number(process.env.WIDTH||2048),height:Number(process.env.HEIGHT||1152),deviceScaleFactor:Number(process.env.DPR||1.25),mobile:false};
const executable=process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Appended inside the game IIFE, so it can wrap the loop and read game state.
const probe=`
window.__warmTrace=(function(){
  var frames=0,revealed=false,oldLoop=loop,frameMarks=${signatures};
  if(typeof runShaderWarmup==='function'){var oldWarm=runShaderWarmup;runShaderWarmup=function(){performance.mark('ST:warm:start');try{return oldWarm.apply(this,arguments);}finally{performance.mark('ST:warm:end');}};}
  loop=function(t){
    window.__stFrame=frames+1;var r=oldLoop(t);frames++;
    if(!revealed&&introPhase==='done'){revealed=true;window.__stRevealed=true;performance.mark('ST:reveal');}
    if(revealed&&frameMarks)performance.mark('ST:f'+frames);
    return r;
  };
  return {
    ready:function(){return introPhase==='done';},
    phase:function(name){performance.mark('ST:phase:'+name);},
    run:function(code){return eval(code);},
    tp:function(kind){
      for(var k in keys)keys[k]=false;gamePaused=false;
      var x=player.x,y=player.y;
      if(kind==='pen'){x=(DECK_LEFT_COL-25)*TILE;y=SKY_ROWS*TILE-PLAYER_H-2;}
      else if(kind==='deck'){x=DECK_CENTER_COL*TILE+2;y=DECK_ROW*TILE-PLAYER_H-1;}
      else if(kind==='dig'){x=(DECK_LEFT_COL-44)*TILE+4;y=SKY_ROWS*TILE-PLAYER_H-1;}
      else if(kind==='altitude'){x=(DECK_LEFT_COL-10)*TILE;y=SKY_ROWS*TILE-1600;}
      else if(kind==='pond'){var pond=surfacePonds.find(function(p){return p.cR-p.cL>=5;})||surfacePonds[0];if(pond){x=(pond.cL+pond.cR)*TILE*.5;y=SKY_ROWS*TILE-140;}}
      else if(kind==='cave'||kind==='deep'){
        var rr=SKY_ROWS+(kind==='deep'?Math.floor(TOWN_DEPTHS[0]*.8):55),best=0;
        if(kind==='deep'){for(var cr=rr-3;cr<=rr;cr++)for(var cc=140;cc<175;cc++)world[cr][cc]=null;}
        for(var r=rr;r<Math.min(rr+40,TOTAL_ROWS-3);r++){var run=0;for(var c=10;c<COLS-10;c++){
          run=!world[r][c]&&!world[r-1][c]?run+1:0;if(run>best){best=run;x=(c-run*.5)*TILE;y=(r-1)*TILE-PLAYER_H;}}}
      }
      player.x=player.renderX=x;player.y=player.renderY=y;player.vx=player.vy=0;cam.snap=true;updateCamera();
      player.fuel=getMaxFuel();player.hull=getMaxHull();return [x,y];
    },
    seedCargo:function(){if(cargo.length<6){var t=['coal','iron','copper','silver','gold','amber'];for(var i=0;i<t.length;i++)if(ORES[t[i]])cargo.push({type:t[i],shiny:i===4});}return cargo.length;},
    closeShop:function(){try{if(typeof ukCatalogClose==='function')ukCatalogClose();}catch(e){}shopState='closed';return shopState;},
    start:function(){gamePaused=false;startInPause=false;bootPauseFired=true;
      return {version:GAME_VERSION,canvas:[canvas.width,canvas.height],scale:dpr*worldScale,warm:window.__shaderWarm||null,boot:window.__bootErr||null};},
    state:function(){return {frames:frames,phase:introPhase,paused:gamePaused,boot:window.__bootErr||null};}
  };
})();
`;
const prelude=`(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
addEventListener('DOMContentLoaded',()=>{document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));let css=document.createElement('style');css.textContent='#game-pause,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-wrapper{max-width:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);dispatchEvent(new Event('resize'));});})();`;

const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml','.json':'application/json'};
const served=(()=>{const end=bundle.lastIndexOf('})();');return Buffer.from(bundle.slice(0,end)+probe+bundle.slice(end));})();
const server=http.createServer((req,res)=>{try{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(root,'.'+p);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(p==='/js/sluice.js'?served:fs.readFileSync(file));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));

const profile=profileDir||fs.mkdtempSync(path.join(os.tmpdir(),'sluice-shader-trace-chrome-'));
if(profileDir)fs.mkdirSync(profileDir,{recursive:true});
const args=['--headless=new','--mute-audio','--enable-unsafe-webgpu','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debugPort];
if(process.platform==='darwin')args.push('--use-angle=metal');
if(process.env.VSYNC!=='1')args.push('--disable-gpu-vsync','--disable-frame-rate-limit');
if(ganesh)args.push('--disable-features=SkiaGraphite');
const shaderDump=process.env.SHADER_DUMP?path.resolve(process.env.SHADER_DUMP):null;
if(shaderDump){fs.mkdirSync(shaderDump,{recursive:true});args.push('--enable-angle-features=dumpShaderSource','--disable-gpu-sandbox');}
args.push('about:blank');
const chrome=spawn(executable,args,{stdio:'ignore',env:shaderDump?{...process.env,ANGLE_SHADER_DUMP_PATH:shaderDump}:process.env});
let ws=null,seq=0,traceStream=null;
const pending=new Map(),errors=[],phaseErrors=[];
function send(method,params={},ms=60000){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},ms);
  pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression,ms){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},ms);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails).slice(0,500));return r.result?.value;}

async function analyze(file,sigs){
  const marks=[],events=[],open=new Map();
  const wanted=new Set(['shader_compile','RasterDecoderImpl::DoEndRasterCHROMIUM::Flush']);
  const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  // The trace streams one event object per line; the whole file can exceed a Node string.
  for await(let line of lines){
    line=line.trim();if(!line.startsWith('{"'))continue;if(line.endsWith(','))line=line.slice(0,-1);
    let e;try{e=JSON.parse(line);}catch{continue;}
    if(e.name&&e.name.startsWith('ST:')){marks.push({ts:e.ts,name:e.name});continue;}
    if(!wanted.has(e.name))continue;
    const key=e.pid+':'+e.tid+':'+e.name;
    if(e.ph==='X')events.push({name:e.name,ts:e.ts,ms:(e.dur||0)/1000});
    else if(e.ph==='B'){if(!open.has(key))open.set(key,[]);open.get(key).push(e.ts);}
    else if(e.ph==='E'){const s=open.get(key);if(s&&s.length){const b=s.pop();events.push({name:e.name,ts:b,ms:(e.ts-b)/1000});}}
  }
  marks.sort((a,b)=>a.ts-b.ts);events.sort((a,b)=>a.ts-b.ts);
  const reveal=marks.find(m=>m.name==='ST:reveal');
  if(!reveal)throw Error('trace has no reveal mark');
  const phases=marks.filter(m=>m.name.startsWith('ST:phase:'));
  const phaseAt=ts=>{let p='before route';for(const m of phases)if(m.ts<=ts)p=m.name.slice(9);return p;};
  const frameMarks=marks.filter(m=>/^ST:f\d+$/.test(m.name)).map(m=>({ts:m.ts,frame:+m.name.slice(4)}));
  const frameAt=ts=>{let lo=0,hi=frameMarks.length-1,hit=null;while(lo<=hi){const mid=(lo+hi)>>1;if(frameMarks[mid].ts<=ts){hit=frameMarks[mid];lo=mid+1;}else hi=mid-1;}return hit;};
  const sum=list=>list.reduce((s,e)=>s+e.ms,0);
  const round=v=>Math.round(v*10)/10;
  const compiles=events.filter(e=>e.name==='shader_compile');
  const flushes=events.filter(e=>e.name==='RasterDecoderImpl::DoEndRasterCHROMIUM::Flush');
  const loading=compiles.filter(e=>e.ts<reveal.ts),after=compiles.filter(e=>e.ts>=reveal.ts);
  const byPhase={};
  for(const c of after){const p=phaseAt(c.ts);byPhase[p]=byPhase[p]||{compiles:0,ms:0};byPhase[p].compiles++;byPhase[p].ms=round(byPhase[p].ms+c.ms);}
  const afterFlushes=flushes.filter(f=>f.ts>=reveal.ts);
  const groups=[];
  for(const c of after){const last=groups.at(-1);if(last&&c.ts-last.end<30000){last.items.push(c);last.end=c.ts+c.ms*1000;}else groups.push({start:c.ts,end:c.ts+c.ms*1000,items:[c]});}
  const bursts=groups.map(g=>{
    const flush=flushes.find(f=>f.ts<=g.start&&f.ts+f.ms*1000>=g.start),frame=frameAt(g.start);
    const near=sigs&&frame?sigs.filter(s=>s.afterReveal&&s.frame>=frame.frame-6&&s.frame<=frame.frame&&(s.frame>=frame.frame-2||/\|off$/.test(s.sig))):[];
    return {atSeconds:round((g.start-reveal.ts)/1e6),phase:phaseAt(g.start),compiles:g.items.length,ms:round(sum(g.items)),flushMs:flush?round(flush.ms):null,
      signatures:near.map(s=>({sig:s.sig,stack:s.stack}))};
  });
  return {
    compiles:{total:compiles.length,loading:loading.length,loadingMs:round(sum(loading)),afterReveal:after.length,afterRevealMs:round(sum(after))},
    afterRevealByPhase:byPhase,
    rasterFlushesAfterReveal:{over8ms:afterFlushes.filter(f=>f.ms>=8).length,over16ms:afterFlushes.filter(f=>f.ms>=16).length,maxMs:round(Math.max(0,...afterFlushes.map(f=>f.ms)))},
    bursts
  };
}

let exitCode=0;
try{
  let target;
  for(let i=0;i<150;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  if(!target)throw Error('browser did not start: '+executable);
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,400));
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(JSON.stringify(m.params.args).slice(0,400));
    if(m.method==='Tracing.tracingComplete')traceStream=m.params.stream;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',viewport);
  if(mobile)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const signatureProbe=signatures?fs.readFileSync(path.join(here,'shader-warmup-signatures.js'),'utf8'):'';
  await send('Page.addScriptToEvaluateOnNewDocument',{source:prelude+signatureProbe});
  await send('Tracing.start',{categories:'gpu,skia.shaders,disabled-by-default-skia.shaders,blink.user_timing',transferMode:'ReturnAsStream'});
  await sleep(300);
  const navigatedAt=Date.now();
  await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?nosave=1&nopause=1&tod=.5'});
  let ready=false;
  for(let i=0;i<600;i++){try{if(await ev('!!window.__warmTrace&&__warmTrace.ready()')){ready=true;break;}}catch{}await sleep(100);}
  if(!ready)throw Error('game never revealed (a sleeping display stops vsync-paced frames): '+JSON.stringify(errors));
  const loadMs=Date.now()-navigatedAt;
  const start=await ev('__warmTrace.start()');
  const VK={ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40};
  async function hold(keys,ms){
    for(const k of keys)await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:k,code:k,windowsVirtualKeyCode:VK[k]});
    await sleep(ms);
    for(const k of keys)await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k,windowsVirtualKeyCode:VK[k]});
  }
  async function phase(name,expr,ms){
    await ev('__warmTrace.phase('+JSON.stringify(name)+')');
    if(expr){const r=await ev('(function(){try{return JSON.stringify(__warmTrace.run('+JSON.stringify(expr)+'))}catch(e){return "ERR "+e}})()');if(String(r).startsWith('ERR'))phaseErrors.push(name+': '+r);}
    if(ms)await sleep(ms);
  }
  if(route==='surface'){await sleep(1000);await phase('surface');await humanInputRoute(send,seconds,'surface');}
  else if(route==='tour'){
    await phase('idle',null,1500);
    await phase('surface');await humanInputRoute(send,12,'surface');
    await phase('pen',"__warmTrace.tp('pen')",800);await hold(['ArrowRight'],800);await hold(['ArrowLeft'],900);await hold(['ArrowUp','ArrowRight'],400);await sleep(900);
    await phase('dig',"__warmTrace.tp('dig')",500);await hold(['ArrowDown'],4000);await hold(['ArrowRight'],1500);await hold(['ArrowLeft'],1500);await hold(['ArrowUp'],1800);
    await phase('sell',"(__warmTrace.tp('deck'),__warmTrace.seedCargo(),sellCargo(true),1)",4500);
    await phase('shop',"(__warmTrace.tp('deck'),enterShopFloor(),1)",3000);await ev('__warmTrace.closeShop()');await sleep(400);
    await phase('manifest',"(__warmTrace.seedCargo(),cargoManifestToggle())",1500);await ev("__warmTrace.run('cargoManifestOpen&&cargoManifestToggle()')");
    await phase('ledger',"ledgerToggle()",1500);await ev("__warmTrace.run('ledgerOpen&&ledgerToggle()')");
    await phase('bomb',"(__warmTrace.tp('dig'),bombSpawn('small'),bombSpawn('large'),1)",4200);
    await phase('cave',"__warmTrace.tp('cave')",2500);
    await phase('deep',"__warmTrace.tp('deep')",2500);
    await phase('pond',"__warmTrace.tp('pond')",2500);
    await phase('altitude',"__warmTrace.tp('altitude')",0);await hold(['ArrowUp'],2200);
    await phase('night',"(__warmTrace.tp('deck'),timeOfDay=.02)",3000);
    await phase('storm',"(gm.preset('storm ceiling'),1)",3500);
    await phase('upgrade',"(timeOfDay=.5,upgrades.drillLevel=5,upgrades.boosterLevel=5,__warmTrace.tp('dig'))",300);await hold(['ArrowUp'],1200);await hold(['ArrowDown'],2000);
    await phase('death',"(player.hull=0,endGame({type:'fall',speed:900}),1)",5000);
  } else throw Error('unknown ROUTE '+route);
  await phase('end');
  await sleep(500);
  const state=await ev('__warmTrace.state()');
  const sigs=signatures?await ev('window.__warmSignatures',120000):null;
  await send('Tracing.end');
  for(let i=0;i<2400&&!traceStream;i++)await sleep(50);
  if(!traceStream)throw Error('no trace stream');
  const traceFile=path.join(out,'trace.json'),fd=fs.openSync(traceFile,'w');
  let chunk;
  do{chunk=await send('IO.read',{handle:traceStream,size:1<<20},300000);fs.writeSync(fd,Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8'));}while(!chunk.eof);
  fs.closeSync(fd);await send('IO.close',{handle:traceStream});
  const result=await analyze(traceFile,sigs);
  const summary={bundleRef,route,ganesh,viewport,profile:profileDir?'reused':'fresh',loadMs,start,state,errors,phaseErrors,...result};
  const warm=start.warm;
  console.log(`${start.version} canvas ${start.canvas.join('x')} scale ${start.scale.toFixed(2)}, revealed after ${loadMs} ms, ${profileDir?'reused':'fresh'} profile, ${ganesh?'Ganesh':'default'} backend`);
  console.log(warm?`warm-up ${warm.ms} ms (raster ${warm.times.raster} ms), ${warm.passes} passes, errors ${JSON.stringify(warm.errors)}`:'no shader warm-up in this bundle');
  console.log(`compiles: loading ${result.compiles.loading} (${result.compiles.loadingMs} ms), after reveal ${result.compiles.afterReveal} (${result.compiles.afterRevealMs} ms)`);
  console.log('after reveal by phase:',Object.entries(result.afterRevealByPhase).map(([p,v])=>`${p} ${v.compiles} (${v.ms} ms)`).join(', ')||'none');
  const f=result.rasterFlushesAfterReveal;
  console.log(`raster flushes after reveal: ${f.over8ms} over 8 ms, ${f.over16ms} over 16 ms, longest ${f.maxMs} ms`);
  for(const b of result.bursts){
    console.log(`  +${b.atSeconds} s [${b.phase}] ${b.compiles} compile${b.compiles>1?'s':''} (${b.ms} ms)${b.flushMs!==null?' in a '+b.flushMs+' ms raster flush':''}`);
    for(const s of b.signatures)console.log(`      new ${s.sig}\n        ${s.stack}`);
  }
  if(!compilesSeen(result))console.log('warning: no shader_compile events; this backend or browser does not emit the counted Ganesh events');
  if(errors.length||phaseErrors.length){console.log('page errors',errors.slice(0,5),'route errors',phaseErrors);exitCode=1;}
  if(maxCompiles!==null&&result.compiles.afterReveal>maxCompiles){console.log(`FAIL: ${result.compiles.afterReveal} compiles after reveal, limit ${maxCompiles}`);exitCode=1;}
  if(keepDump){fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,1));if(sigs)fs.writeFileSync(path.join(out,'signatures.json'),JSON.stringify(sigs));console.log('trace and summary in',out);}
}finally{
  try{if(ws)await send('Browser.close',{},5000);}catch{}
  for(let i=0;i<60&&chrome.exitCode===null;i++)await sleep(100);
  if(chrome.exitCode===null)chrome.kill();
  server.close();
  if(!profileDir)fs.rmSync(profile,{recursive:true,force:true});
  if(!keepDump)fs.rmSync(out,{recursive:true,force:true});
}
process.exitCode=exitCode;
function compilesSeen(result){return result.compiles.total>0;}
