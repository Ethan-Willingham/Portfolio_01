// Dense snow jet pass: prevent overpacking and delayed pile expansion.
// Run: node tools/sluice-snow-pile.mjs [--cpu] [--report-only].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8341), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-pile-qa';
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


  await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
    while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
    SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
    windSetTarget('still',1,0,100,0,0);surfaceWind.current=0;surfaceWind.flutter=0;
    window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    zoomMode='out';resize();player.x=cx+160;player.y=sy-PLAYER_H;player.vx=player.vy=0;updateCamera=function(){cam.x=cx-screenW*.5;cam.y=sy-screenH*.5;};cam.snap=true;updateCamera();
    for(var x=cx-300;x<cx+300;x+=1.4)for(var h=1.3;h<${cpu?15:44};h+=1.4){
      addLiquidParticle(5,x,sy-h,0,0,3);snow.active++;
    }
    window.massCount=snow.active;
    snow.mass=snow.emitted=massCount;window.contactStart=snow.time;window.contactFrames=[];

    window.contactSample=function(){
      var age=snow.time-contactStart;
      if(age>=2&&age<4.8){keys.ArrowUp=true;keys.ArrowRight=true;player.x=cx-240+(age-2)*190;player.y=sy-PLAYER_H-45;player.vx=190;player.vy=0;player.onGround=false;}
      else{keys.ArrowUp=keys.ArrowRight=false;player.x=cx+260;player.y=sy-PLAYER_H;player.vx=player.vy=0;}


      liquidToolSync();var hs=[],dens=[],rms=0,maxBucket=0,bins=new Map();
      for(var i=0;i<liquidCount;i++)if(liquidType[i]===5){
        hs.push(sy-liquidY[i]);dens.push(liquidDensity[i]);rms+=liquidVX[i]*liquidVX[i]+liquidVY[i]*liquidVY[i];
        var key=Math.floor(liquidX[i]/2.5)+100000*Math.floor(liquidY[i]/2.5),v=(bins.get(key)||0)+1;bins.set(key,v);maxBucket=Math.max(maxBucket,v);
      }
      hs.sort(function(a,b){return a-b});dens.sort(function(a,b){return a-b});
      contactFrames.push({t:snow.time-contactStart,active:hs.length,powder:snow.grains.length,parked:snow.parked.length/4,
        mean:hs.reduce(function(a,b){return a+b},0)/Math.max(1,hs.length),p95:hs[Math.floor(hs.length*.95)]||0,max:hs[hs.length-1]||0,
        density95:dens[Math.floor(dens.length*.95)]||0,densityMax:dens[dens.length-1]||0,maxBucket:maxBucket,
        mass:__particleSnow.stats().mass+rain.waterCount+rain.parked.length/2+rain.absorbed,frameDt:lastFrameDt,rms:Math.sqrt(rms/Math.max(1,hs.length))});
      window.contactRaf=requestAnimationFrame(contactSample);
    };window.contactRaf=requestAnimationFrame(contactSample);`);
  for(let t=0;t<30;t++){
    await sleep(1000);await screenshot('pile-'+t);
    if(await game('snow.time-contactStart>13'))break;
  }
  const frames=await game('cancelAnimationFrame(contactRaf);contactFrames');
  const initial=await game('massCount');
  const tail=frames.filter(f=>f.t>10&&f.t<13);
  const landed=frames.find(f=>f.t>5.8&&f.powder<initial*.05);
  const summary={solver:cpu?'cpu':'gpu',version:await game('GAME_VERSION'),initial,
    landedAt:landed?.t,landedHeight:landed?.p95,
    lateHeight:tail.reduce((a,f)=>a+f.p95,0)/tail.length,
    lateRMS:tail.reduce((a,f)=>a+f.rms,0)/tail.length,
    postJetDensity95:Math.max(...frames.filter(f=>f.t>5.8&&f.t<10).map(f=>f.density95)),
    peakPowder:Math.max(...frames.map(f=>f.powder)),
    maxCellOccupancy:Math.max(...frames.map(f=>f.maxBucket))};
  console.log('PILE',JSON.stringify(summary));
  fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify({summary,frames},null,2));
  check('jet releases a substantial physical plume',summary.peakPowder>initial*.1);
  check('entire trial conserves snow and meltwater',frames.every(f=>f.mass===initial));
  check('fixture stays in the simulation window',frames.every(f=>f.parked===0));
  check('enough settled samples',tail.length>30&&landed);
  if(!reportOnly){
    check('returning pile avoids sustained overpacking',summary.postJetDensity95<8);
    check('landed snow does not inflate seconds later',summary.lateHeight<summary.landedHeight*1.15+2);
    check('pile settles after the jet',summary.lateRMS<2);
  }
  assert.equal(errors.length,0,'no runtime or shader errors');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
