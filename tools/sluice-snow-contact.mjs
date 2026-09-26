// Snow contact, returning powder and detached near-floor sheet regressions.
// Run: node tools/sluice-snow-contact.mjs [--cpu] [--report-only].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8243), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-contact-qa';
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

  const summaries=[];
  for(const trial of ['gap','return']) {
    await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
      while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
      SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
      surfaceWind.current=0;
      window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
      for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
      zoomMode='in';resize();player.x=cx+300;player.y=sy-PLAYER_H;player.vx=player.vy=0;cam.snap=true;updateCamera();
      for(var n=0;n<160;n++) {
        var x=cx-140+n*1.75;
        ${trial==='gap' ? `addLiquidParticle(5,x,sy-6,0,0,3);snow.active++;` :
        `snow.grains.push({x:x,y:sy-90-(n%7)*2,vx:0,vy:0,size:.3+(n%19)/19*.7,phase:n*2.399,physical:true});`}
      }
      snow.mass=snow.emitted=160;window.contactStart=snow.time;window.contactFrames=[];
      window.contactGeneration=liquidWGPU&&liquidWGPU.simActive?liquidWGPU.readbackApplyGen:-1;
      window.contactSample=function(){
        liquidToolSync();
        // Newly queued particles still have their initial CPU coordinates
        // until the first solved GPU snapshot arrives. Do not count that
        // upload/readback latency as a physical suspension in mid-air.
        if(liquidWGPU&&liquidWGPU.simActive&&liquidWGPU.readbackApplyGen===contactGeneration){
          window.contactRaf=requestAnimationFrame(contactSample);return;}
        var heights=[],up=0,embedded=0,energy=0,slow=0;
        function sample(x,y,vx,vy){var h=sy-y;heights.push(h);if(vy < -12)up++;
          if(liquidWorldSolidAt(x,y))embedded++;energy+=vx*vx+vy*vy;
          if(h>3&&h<8&&Math.abs(vy)<6)slow++;}
        for(var i=0;i<liquidCount;i++)if(liquidType[i]===5)sample(liquidX[i],liquidY[i],liquidVX[i],liquidVY[i]);
        for(var p of snow.grains)sample(p.x,p.y,p.vx,p.vy);
        contactFrames.push({t:snow.time-contactStart,up,embedded,slow,powder:snow.grains.length,
          min:Math.min.apply(null,heights),max:Math.max.apply(null,heights),
          mean:heights.reduce(function(a,b){return a+b;},0)/heights.length,
          mass:__particleSnow.stats().mass,rms:Math.sqrt(energy/heights.length)});
        window.contactRaf=requestAnimationFrame(contactSample);
      };window.contactRaf=requestAnimationFrame(contactSample);`);
    await sleep(trial==='gap'?1700:4300);
    await screenshot(trial);
    const frames=await game('cancelAnimationFrame(contactRaf);contactFrames');
    const late=frames.filter(f=>f.t>(trial==='gap'?.7:3.5));
    const summary={trial,version:await game('GAME_VERSION'),maxUp:Math.max(...frames.map(f=>f.up)),
      lateHeight:Math.max(...late.map(f=>f.max)),latePowder:Math.max(...late.map(f=>f.powder)),
      lateRMS:late.reduce((a,f)=>a+f.rms,0)/late.length,frames:frames.length};
    summaries.push(summary);console.log('CONTACT',JSON.stringify(summary));
    fs.writeFileSync(path.join(out,trial+'.json'),JSON.stringify({summary,frames},null,2));
    check(trial+' keeps all material',frames.every(f=>f.mass===160));
    check(trial+' stays outside terrain',frames.every(f=>f.embedded===0));
    if(!reportOnly){
      check(trial+' never launches resting or returning powder',summary.maxUp===0);
      check(trial+' settles at actual contact',summary.lateHeight<2 && summary.latePowder===0);
      check(trial+' is quiet after contact',summary.lateRMS<1);
      if(trial==='gap')check('detached sheet does not crawl as a slow block',frames.filter(f=>f.t>.25).every(f=>f.slow===0));
    }
  }
  assert.equal(errors.length,0,'no runtime or shader errors');
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));
  console.log('PASS snow contact and returning powder');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
