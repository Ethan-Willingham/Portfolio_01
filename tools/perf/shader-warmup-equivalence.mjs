// Pixel equivalence around the shader warm-up. Boots Sluice, freezes the game
// loop on its first revealed frame, fixes the clock, time of day and randomness,
// renders a fixed scene list and hashes the main and UI canvases. Three boots:
// a baseline bundle (BUNDLE_REF, default HEAD), this checkout, and this checkout
// with the warm-up disabled. The warm-up must leave every scene unchanged, and a
// refactor must match the baseline; a deliberate visual change will not.
// A scene passes when hashes match or every 32 px block's channel sums differ by
// under half a level per pixel. PORT, GANESH, VSYNC and CHROME work as in
// shader-warmup-trace.mjs. Exits 1 on any difference or page error.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.env.ROOT||path.join(here,'../..'));
const bundleRef=process.env.BUNDLE_REF||'HEAD';
const port=Number(process.env.PORT||8911);
const ganesh=process.env.GANESH?process.env.GANESH!=='0':process.platform==='darwin';
const executable=process.env.CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checkout=fs.readFileSync(path.join(root,'js/sluice.js'),'utf8');
const warmNeedle='  function prepareShaderWarmup() {\n';
const boots=[{name:'baseline',label:bundleRef,source:execFileSync('git',['show',bundleRef+':js/sluice.js'],{cwd:root,maxBuffer:64*1024*1024}).toString()},
  {name:'checkout',label:'checkout',source:checkout}];
if(checkout.includes(warmNeedle))boots.push({name:'nowarm',label:'checkout, warm-up disabled',source:checkout.replace(warmNeedle,warmNeedle+'    return false;\n')});
else console.log('this checkout has no prepareShaderWarmup; skipping the warm-up comparison');

const probe=`
window.__eq=(function(){
  var realLoop=loop;
  loop=function(t){if(window.__eqFreeze)return;if(introPhase==='done'){window.__eqFreeze=true;return;}return realLoop(t);};
  return {run:function(code){return eval(code);}};
})();
`;
// Evaluated inside the game IIFE. Uses only names present since v27.1.
const helpers=`(function(){
  window.__eqSetup=function(){var fixed=123456.789;performance.now=function(){return fixed;};Date.now=function(){return 1757700000000;};timeOfDay=0.5;GAME_VERSION='vEQ';};
  window.__eqSeed=function(seed){var s=seed>>>0;Math.random=function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
  window.__eqHash=function(cv){
    if(!cv)return null;var d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    var h=2166136261>>>0;for(var i=0;i<d.length;i++){h^=d[i];h=Math.imul(h,16777619)>>>0;}
    var B=32,bw=Math.ceil(cv.width/B),bh=Math.ceil(cv.height/B),g=new Array(bw*bh*4).fill(0);
    for(var y=0;y<cv.height;y++){var by=(y/B)|0;for(var x=0;x<cv.width;x++){var k=(y*cv.width+x)*4,o=(by*bw+((x/B)|0))*4;g[o]+=d[k];g[o+1]+=d[k+1];g[o+2]+=d[k+2];g[o+3]+=d[k+3];}}
    return {h:h.toString(16),g:g};
  };
  window.__eqSettle=function(n){for(var i=0;i<(n||8);i++){terrainWarmupFrames=1;terrainChunkPendingThisFrame=0;render();if(terrainChunkPendingThisFrame===0&&i>=2)break;}};
  window.__eqShot=function(name,out){out[name]={main:__eqHash(canvas),ui:__eqHash(typeof uiTopCanvas!=='undefined'?uiTopCanvas:null)};};
})()`;
const scenes=`(function(){
  var out={},base={x:cam.x,y:cam.y},surfaceY=SKY_ROWS*TILE;
  __eqSetup();
  function at(x,y){cam.x=x;cam.y=y;cam.snap=true;}
  __eqSeed(1);at(base.x,base.y);__eqSettle(4);__eqShot('spawn',out);
  __eqSeed(2);at(base.x+0.37,base.y+0.21);__eqSettle(3);__eqShot('spawn-fraction',out);
  __eqSeed(3);at((DECK_LEFT_COL-60)*TILE+0.3,surfaceY-screenH*0.45);__eqSettle(10);__eqShot('grass',out);
  __eqSeed(4);at(DECK_CENTER_COL*TILE-screenW*0.5+0.61,DECK_ROW*TILE-screenH*0.5+0.13);__eqSettle(10);__eqShot('deck',out);
  __eqSeed(5);at(100*TILE+0.4,surfaceY+30*TILE);__eqSettle(12);__eqShot('topsoil-cave',out);
  var stack=camLayerStack();
  for(var i=0;i<stack.length;i++){__eqSeed(10+i);at(100*TILE+0.4,surfaceY+stack[i].minDepth*TILE-screenH*0.5+0.27);__eqSettle(12);__eqShot('layer-'+stack[i].name,out);}
  __eqSeed(20);at(base.x,surfaceY-screenH*1.2);__eqSettle(4);__eqShot('altitude',out);
  __eqSeed(21);at(base.x,surfaceY-screenH+10);__eqSettle(4);__eqShot('bank-edge',out);
  __eqSeed(22);at(base.x+0.37,base.y+0.21);__eqSettle(3);
  floaters.push({x:cam.x+200,y:cam.y+150,text:'+$120 Gold',color:'#ffd24a',t:0.8,maxT:1.2,vy:-20,show:true});
  render();__eqShot('floater',out);floaters.length=0;
  __eqSeed(23);damageFlashT=0.6;render();__eqShot('damage',out);damageFlashT=0;
  __eqSeed(24);
  var billows=[],streaks=[];for(var b=0;b<10;b++)billows.push({x:cam.x+300+b*3,y:cam.y+200-b*2,vx:10,vy:-20,r:6+b,maxR:24,delay:b*0.01,heat:b/10});
  for(var k=0;k<12;k++)streaks.push({ang:k*0.5,len:30,speed:150,dist:4,width:1.5,bright:0.8});
  explosions=[{cx:cam.x+300,cy:cam.y+200,r:TILE*2.4,t:0.3,life:0.7,billows:billows,streaks:streaks,large:true}];
  render();__eqShot('explosion',out);explosions=[];
  __eqSeed(25);gameOver=true;deathPhaseT=0;lastFrameDt=0.5;for(var d=0;d<4;d++)render();__eqShot('death',out);
  return out;
})()`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.svg':'image/svg+xml','.json':'application/json'};
let current=null;
const server=http.createServer((req,res)=>{try{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.resolve(root,'.'+p);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(p==='/js/sluice.js'?current:fs.readFileSync(file));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));

async function render(boot,debugPort){
  const end=boot.source.lastIndexOf('})();');
  current=Buffer.from(boot.source.slice(0,end)+probe+boot.source.slice(end));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-equivalence-chrome-'));
  const args=['--headless=new','--mute-audio','--enable-unsafe-webgpu','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debugPort];
  if(process.platform==='darwin')args.push('--use-angle=metal');
  if(process.env.VSYNC!=='1')args.push('--disable-gpu-vsync','--disable-frame-rate-limit');
  if(ganesh)args.push('--disable-features=SkiaGraphite');
  args.push('about:blank');
  const chrome=spawn(executable,args,{stdio:'ignore'});
  let ws=null,seq=0;const pending=new Map(),errors=[];
  const send=(method,params={},ms=120000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},ms);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails).slice(0,600));return r.result?.value;};
  const run=code=>ev('__eq.run('+JSON.stringify(code)+')');
  try{
    let target;
    for(let i=0;i<150;i++){try{target=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
    if(!target)throw Error('browser did not start: '+executable);
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=e=>{const m=JSON.parse(e.data);
      if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
      if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,300));
      if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(JSON.stringify(m.params.args).slice(0,300));};
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:'(()=>{let s=48271;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);})();'});
    await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html?nosave=1&nopause=1&tod=.5'});
    let frozen=false;
    for(let i=0;i<600;i++){try{if(await ev('!!window.__eqFreeze')){frozen=true;break;}}catch{}await sleep(100);}
    if(!frozen)throw Error(boot.name+' never revealed (a sleeping display stops vsync-paced frames): '+JSON.stringify(errors));
    await sleep(500);
    await run(helpers);
    const shots=await run(scenes);
    const warm=await run("typeof shaderWarmState!=='undefined'&&shaderWarmState?{ms:shaderWarmState.ms,errors:shaderWarmState.errors}:null");
    return {shots,warm,errors};
  }finally{
    try{if(ws)await send('Browser.close',{},5000);}catch{}
    for(let i=0;i<40&&chrome.exitCode===null;i++)await sleep(100);
    if(chrome.exitCode===null)chrome.kill();
    fs.rmSync(profile,{recursive:true,force:true});
  }
}

function compare(a,b){
  if(!a&&!b)return {exact:true};
  if(!a||!b)return {exact:false,worst:Infinity,blocks:-1};
  if(a.h===b.h)return {exact:true};
  let worst=0,blocks=0;
  for(let i=0;i<a.g.length;i+=4){let w=0;for(let k=0;k<4;k++)w=Math.max(w,Math.abs(a.g[i+k]-b.g[i+k])/1024);if(w>0)blocks++;worst=Math.max(worst,w);}
  return {exact:false,worst,blocks};
}
const describe=r=>r.exact?'exact':`blocks ${r.blocks}, worst ${r.worst.toFixed(3)} levels per pixel`;

let failures=0;
try{
  const results={};
  let debugPort=port+1000;
  for(const boot of boots){
    results[boot.name]=await render(boot,debugPort++);
    const r=results[boot.name];
    console.log(`${boot.label}: ${Object.keys(r.shots).length} scenes, page errors ${r.errors.length}${r.warm?', warm-up '+r.warm.ms+' ms, warm-up errors '+JSON.stringify(r.warm.errors):''}`);
    if(r.errors.length){console.log('  ',r.errors.slice(0,3));failures++;}
    if(r.warm&&r.warm.errors.length)failures++;
  }
  const pairs=[['baseline','checkout',`${bundleRef} against this checkout`]];
  if(results.nowarm)pairs.unshift(['nowarm','checkout','warm-up disabled against enabled']);
  for(const [x,y,label] of pairs){
    const A=results[x].shots,B=results[y].shots;
    let same=0,exact=0;const names=[...new Set([...Object.keys(A),...Object.keys(B)])];
    console.log(`\n${label}`);
    for(const n of names){
      if(!A[n]||!B[n]){console.log(`  ${n}: missing`);failures++;continue;}
      const m=compare(A[n].main,B[n].main),u=compare(A[n].ui,B[n].ui);
      const ok=(m.exact||m.worst<0.5)&&(u.exact||u.worst<0.5);
      if(ok)same++;else failures++;
      if(m.exact&&u.exact)exact++;
      console.log(`  ${n.padEnd(18)} ${ok?'same':'DIFFERENT'}  main ${describe(m)} | ui ${describe(u)}`);
    }
    console.log(`  ${same}/${names.length} scenes match, ${exact} exactly`);
  }
}finally{server.close();}
process.exitCode=failures?1:0;
