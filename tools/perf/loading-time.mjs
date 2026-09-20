// Loading time of a baseline bundle (BUNDLE_REF, default HEAD) against this
// checkout. Each round boots both, in alternating order, in a fresh browser
// profile (cold GPU program cache), then again on that profile (a repeat visit).
// Times run from navigation, read in the page: warm-up start and length, first
// ready frame, GPU fence, reveal start, and the end of the loading fade.
// ROUNDS=5 KINDS=cold,repeat. Frames are vsync-paced by default, which needs an
// awake display. NOVSYNC=1 uncaps frames for a sleeping display; the loading
// loop then spins while the GPU fence drains, which lengthens that wait, so only
// compare runs made the same way. WIDTH, HEIGHT and DPR set the viewport
// (default 2048x1152 at 1.25); DUMP writes every boot as JSON. PORT, GANESH and
// CHROME work as in shader-warmup-trace.mjs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.env.ROOT||path.join(here,'../..'));
const bundleRef=process.env.BUNDLE_REF||'HEAD';
const versions={
  baseline:{label:bundleRef,source:execFileSync('git',['show',bundleRef+':js/sluice.js'],{cwd:root,maxBuffer:64*1024*1024}).toString()},
  checkout:{label:'checkout',source:fs.readFileSync(path.join(root,'js/sluice.js'),'utf8')}
};
const rounds=Number(process.env.ROUNDS||5),kinds=(process.env.KINDS||'cold,repeat').split(',');
const vsync=process.env.NOVSYNC!=='1';
const ganesh=process.env.GANESH?process.env.GANESH!=='0':process.platform==='darwin';
const port=Number(process.env.PORT||8931);
const viewport={width:Number(process.env.WIDTH||2048),height:Number(process.env.HEIGHT||1152),deviceScaleFactor:Number(process.env.DPR||1.25),mobile:false};
const executable=process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const probe=`
window.__loadTime=(function(){
  var t={warmStart:0,warmMs:0,firstReady:0,fence:0,revealing:0,done:0},waiters=[];
  function timed(fn,edge){return function(){var s=performance.now(),r=fn.apply(this,arguments);if(edge(r)){t.warmStart=s;t.warmMs=performance.now()-s;}return r;};}
  if(typeof prepareShaderWarmup==='function')prepareShaderWarmup=timed(prepareShaderWarmup,function(){return true;});
  // v27.1 drew a rig preview and waited for an asynchronous snapshot instead.
  if(typeof prepareLoadingRigShaders==='function')prepareLoadingRigShaders=timed(prepareLoadingRigShaders,function(r){return r&&!t.warmStart;});
  var oldLoop=loop;
  loop=function(time){
    var r=oldLoop(time),now=performance.now();
    if(!t.firstReady&&gameLoadingFirstReadyAt)t.firstReady=gameLoadingFirstReadyAt;
    if(!t.fence&&gameLoadingFence)t.fence=now;
    if(!t.revealing&&(introPhase==='revealing'||introPhase==='done'))t.revealing=now;
    if(!t.done&&introPhase==='done'){t.done=now;waiters.splice(0).forEach(function(f){f();});}
    return r;
  };
  return {t:t,whenDone:function(){return t.done?Promise.resolve():new Promise(function(r){waiters.push(r);});},
    info:function(){return {version:GAME_VERSION,canvas:[canvas.width,canvas.height],warm:window.__shaderWarm||null,boot:window.__bootErr||null};}};
})();
`;
const prelude=`(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
addEventListener('DOMContentLoaded',()=>{document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));let css=document.createElement('style');css.textContent='#game-pause,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}.game-wrapper{max-width:none!important}.game-canvas-area{width:100%!important;height:100%!important}';document.head.appendChild(css);dispatchEvent(new Event('resize'));});})();`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml','.json':'application/json'};
const served={};
for(const [key,v] of Object.entries(versions)){const end=v.source.lastIndexOf('})();');served[key]=Buffer.from(v.source.slice(0,end)+probe+v.source.slice(end));}
let current=null;
const server=http.createServer((req,res)=>{try{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(root,'.'+p);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(p==='/js/sluice.js'?served[current]:fs.readFileSync(file));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));

let debugPort=port+1000;
async function boot(key,profile){
  current=key;
  const dp=debugPort++;
  const args=['--headless=new','--mute-audio','--enable-unsafe-webgpu','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+dp];
  if(process.platform==='darwin')args.push('--use-angle=metal');
  if(!vsync)args.push('--disable-gpu-vsync','--disable-frame-rate-limit');
  if(ganesh)args.push('--disable-features=SkiaGraphite');
  args.push('about:blank');
  const chrome=spawn(executable,args,{stdio:'ignore'});
  let ws=null,seq=0;const pending=new Map(),errors=[];
  const send=(method,params={},ms=90000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},ms);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const ev=async(expression,ms)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},ms);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails).slice(0,400));return r.result?.value;};
  try{
    let target;
    for(let i=0;i<150;i++){try{target=(await(await fetch('http://127.0.0.1:'+dp+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
    if(!target)throw Error('browser did not start: '+executable);
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=e=>{const m=JSON.parse(e.data);
      if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
      if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,300));
      if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(JSON.stringify(m.params.args).slice(0,300));};
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',viewport);
    await send('Page.addScriptToEvaluateOnNewDocument',{source:prelude});
    await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?nosave=1&nopause=1&tod=.5'});
    let probed=false;
    for(let i=0;i<300;i++){try{if(await ev('!!window.__loadTime',5000)){probed=true;break;}}catch{}await sleep(50);}
    if(!probed)throw Error('game script never ran: '+JSON.stringify(errors));
    try{await ev('__loadTime.whenDone()',60000);}
    catch(e){throw Error('game never revealed'+(vsync?' (a sleeping display stops vsync-paced frames; NOVSYNC=1 avoids that)':'')+': '+e.message);}
    const t=await ev('__loadTime.t'),info=await ev('__loadTime.info()');
    // Give Chrome time to write newly compiled programs to the profile's cache.
    await sleep(1500);
    return {version:versions[key].label,t,info,errors};
  }finally{
    try{if(ws)await send('Browser.close',{},5000);}catch{}
    for(let i=0;i<40&&chrome.exitCode===null;i++)await sleep(100);
    if(chrome.exitCode===null)chrome.kill();
  }
}

const results=[];
const ms=v=>Math.round(v);
try{
  const keys=Object.keys(versions);
  for(let round=0;round<rounds;round++){
    const order=round%2?[...keys].reverse():keys;
    for(const key of order){
      const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-loading-chrome-'));
      try{
        for(const kind of kinds){
          const r=await boot(key,profile);r.kind=kind;r.round=round;results.push(r);
          const t=r.t,warm=r.info.warm;
          console.log(`round ${round} ${r.version.padEnd(10)} ${kind.padEnd(6)} revealed ${ms(t.done)} ms | warm-up ${t.warmStart?ms(t.warmStart)+' +'+ms(t.warmMs):'none'} | first ready ${ms(t.firstReady)} | fence ${ms(t.fence)} | reveal starts ${ms(t.revealing)} | page errors ${r.errors.length}${warm?' | warm-up raster '+warm.times.raster+' ms, errors '+warm.errors.length:''}`);
        }
      }finally{fs.rmSync(profile,{recursive:true,force:true});}
    }
  }
}finally{server.close();}
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
console.log(`\nmedians over ${rounds} rounds (${vsync?'vsync-paced':'uncapped'} frames, ${ganesh?'Ganesh':'default'} backend, ${viewport.width}x${viewport.height} at ${viewport.deviceScaleFactor})`);
for(const kind of kinds){
  const rows={};
  for(const v of Object.values(versions)){
    const rs=results.filter(r=>r.kind===kind&&r.version===v.label);
    rows[v.label]=median(rs.map(r=>r.t.done));
    console.log(`${kind.padEnd(6)} ${v.label.padEnd(10)} revealed ${ms(rows[v.label])} ms [${rs.map(r=>ms(r.t.done)).join(', ')}], first ready ${ms(median(rs.map(r=>r.t.firstReady)))} ms, fence wait ${ms(median(rs.map(r=>r.t.revealing-r.t.fence)))} ms`);
  }
  console.log(`${kind.padEnd(6)} checkout minus ${bundleRef}: ${ms(rows.checkout-rows[bundleRef])} ms`);
}
if(process.env.DUMP){fs.mkdirSync(process.env.DUMP,{recursive:true});fs.writeFileSync(path.join(process.env.DUMP,'loading-time.json'),JSON.stringify({bundleRef,vsync,ganesh,viewport,rounds,results},null,1));}
process.exitCode=results.some(r=>r.errors.length||r.info.boot)?1:0;
