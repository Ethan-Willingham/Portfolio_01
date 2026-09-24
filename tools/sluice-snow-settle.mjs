// Resting snow at several depths, plus unsupported solver-grain descent.
// Run: node tools/sluice-snow-settle.mjs [--cpu] [--report-only].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8197), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-settle-qa';
assert.ok(!path.resolve(out).startsWith(root + path.sep), 'Screenshots stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file === path.join(root, 'js/sluice.js') && process.env.SLUICE_TEST_BUNDLE
      ? process.env.SLUICE_TEST_BUNDLE : file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__snowTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png' };
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], {stdio:'ignore'});
let ws, seq=0; const pending=new Map(), errors=[];
function cleanup() { try {ws?.close();} catch {} chrome.kill(); server.close(); try {fs.rmSync(profile,{recursive:true,force:true});} catch {} }
process.on('SIGINT', () => {cleanup();process.exit(130);});
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__snowTest(${JSON.stringify(source)})`);
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for (let i=0;i<100;i++) {
    try { const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl; if(endpoint)break; } catch {}
    await sleep(100);
  }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  async function ready() {
    for(let i=0;i<400;i++){if(await ev(`typeof __snowTest==='function' && __snowTest("introPhase === 'done'")`))return;await sleep(100);}
    throw new Error('loading did not complete');
  }

  const cpu = process.argv.includes('--cpu'), reportOnly = process.argv.includes('--report-only');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?snow=1&nosave=1&nopause=1&tod=0.35${cpu?'&cpuwater=1':''}`});
  await ready();
  check('requested particle solver is active',await game(cpu
    ? '(!liquidWGPU || !liquidWGPU.simActive)' : '!!(liquidWGPU && liquidWGPU.simActive)'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");

  const trials=[];
  for(const depth of [3,7,12,20,32]){
    await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
      while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
      SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
      window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
      zoomMode='in';resize();player.x=cx+250;player.y=sy-PLAYER_H;player.vx=player.vy=0;cam.snap=true;updateCamera();
      for(var x=cx-180;x<cx+180;x+=1.4)for(var h=1.3;h<${depth};h+=1.4){
        addLiquidParticle(5,x+(wHash(Math.floor(x*10),Math.floor(h*10),915)-.5)*.4,sy-h,0,0,3);snow.active++;}
      snow.mass=snow.emitted=snow.active;window.settleInitial=snow.active;
      window.settleSamples=[];window.settleLast=0;window.settleTime=0;
      window.settleRafFn=function(t){
        if(!settleLast||t-settleLast>90){settleLast=t;liquidToolSync();
          var moving=0,energy=0,still=0,count=0,heights=[],cols=Array(72).fill(0),sleeping=0,up=0;
          for(var i=0;i<liquidCount;i++)if(liquidType[i]===5){
            var v2=liquidVX[i]*liquidVX[i]+liquidVY[i]*liquidVY[i];count++;energy+=v2;
            if(v2>9)moving++;if(v2<.01)still++;if(liquidVY[i]<-3)up++;if(liquidSleeping[i])sleeping++;
            var c=Math.floor((liquidX[i]-cx+180)/5);if(c>=0&&c<72)cols[c]=Math.max(cols[c],sy-liquidY[i]);
          }
          settleSamples.push({t:snow.time-settleTime,moving:moving,rms:Math.sqrt(energy/Math.max(1,count)),still:still,up:up,sleeping:sleeping,
            cols:cols,count:count,flakes:snow.grains.length,calm:LIQUID_CALM,mass:__particleSnow.stats().mass,melted:snow.melted});
        }
        window.settleRaf=requestAnimationFrame(settleRafFn);
      };settleTime=snow.time;window.settleRaf=requestAnimationFrame(settleRafFn);`);
    await sleep(8500);await screenshot('layer-'+depth);
    const samples=await game('cancelAnimationFrame(settleRaf);settleSamples');
    const late=samples.filter(f=>f.t>4);
    check('enough settled frames at depth '+depth,late.length>=12);
    const summary={depth,initial:await game('settleInitial'),meanRMS:late.reduce((s,f)=>s+f.rms,0)/late.length,
      maxMoving:Math.max(...late.map(f=>f.moving)),maxFlakes:Math.max(...late.map(f=>f.flakes)),minMass:Math.min(...late.map(f=>f.mass)),
      calm:late.at(-1)?.calm,count:late.at(-1)?.count,meanUp:late.reduce((s,f)=>s+f.up,0)/late.length};
    let motion=0,n=0;for(let i=1;i<late.length;i++)for(let c=2;c<70;c++){motion+=Math.abs(late[i].cols[c]-late[i-1].cols[c]);n++;}
    summary.meanSurfaceMotion=motion/n;trials.push(summary);
    fs.writeFileSync(path.join(out,'layer-'+depth+'.json'),JSON.stringify({summary,samples},null,2));
    console.log('LAYER',JSON.stringify(summary));
    if(!reportOnly){
      check('quiet snow conserves mass at depth '+depth,samples.every(f=>f.mass===summary.initial && f.melted===0));
      check('resting snow does not launch flakes at depth '+depth,summary.maxFlakes===0);
      check('resting layer stops rebounding at depth '+depth,summary.meanRMS<1 && summary.meanUp<2);
      check('resting contour stays still at depth '+depth,summary.meanSurfaceMotion<(depth<=12?.03:.08));
    }
    if(depth===7 || depth===12){
      // Isolate the dense-solver fallback: a full free-flake buffer can leave
      // unsupported snow here. Do not let ballistic transfer hide a stalled
      // particle or newly introduced sleep latch after digging out the floor.
      await game(`window.settleScan=snowScan;snowScan=function(){};liquidToolSync();
        window.dropY=Array.from(liquidY.subarray(0,liquidCount));
        for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=Math.floor((cx-185)/TILE);c<=Math.floor((cx+185)/TILE);c++){
          world[r][c]=null;invalidateTerrainAround(r,c);
        }`);
      await sleep(1200);
      const drop=await game(`liquidToolSync();var dy=[];var sleeping=0;
        for(var i=0;i<liquidCount;i++){dy.push(liquidY[i]-dropY[i]);if(liquidSleeping[i])sleeping++;}
        snowScan=settleScan;({count:liquidCount,before:dropY.length,min:Math.min.apply(null,dy),
          mean:dy.reduce(function(a,b){return a+b;},0)/dy.length,sleeping:sleeping})`);
      console.log('UNSUPPORTED',JSON.stringify({depth,...drop}));
      if(!reportOnly)check('unsupported layer still falls at depth '+depth,
        drop.count===drop.before && drop.min>.5 && drop.mean>4 && drop.sleeping===0);
    }
  }
  assert.equal(errors.length,0,'no runtime or shader errors');
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(trials,null,2));
  console.log('PASS snow settling');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
