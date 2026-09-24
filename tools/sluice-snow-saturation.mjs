// Saturated sky buffer must not trap conserved powder in the dense solver.
// Run: node tools/sluice-snow-saturation.mjs [--cpu] [--report-only].
// Optional SLUICE_TEST_BUNDLE compares a prior bundle; artifacts stay in /tmp.
// POWDER_COUNT=30000 also exercises a much larger conserved airborne burst.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8225), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-saturation-qa';
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

  const powderCount=Number(process.env.POWDER_COUNT||3600);
  assert.ok(Number.isInteger(powderCount)&&powderCount>=3600&&powderCount<=36000,'bounded powder fixture');
  const columns=powderCount>3600?240:80, spacing=powderCount>3600?1.4:3;
  await game(`keys.ArrowUp=keys.ArrowLeft=keys.ArrowRight=false;
    while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];rainReset(true,true);
    SNOW_RATE=0;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
    window.sy=SKY_ROWS*TILE;window.cx=82*TILE;
    for(var r=SKY_ROWS;r<SKY_ROWS+8;r++)for(var c=58;c<108;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    zoomMode='out';resize();player.x=cx;player.y=sy-PLAYER_H;player.vx=player.vy=0;cam.snap=true;updateCamera();
    for(var i=0;i<SNOW_FLAKE_CAP;i++)snow.grains.push({x:cx-150+(i%100)*3,y:sy-320-Math.floor(i/100),
      vx:0,vy:32+(i%3)*21,size:(i%3)*.5,phase:i*2.399});
    for(var i=0;i<${powderCount};i++){addLiquidParticle(5,cx-${columns*spacing/2}+(i%${columns})*${spacing},sy-220-Math.floor(i/${columns})*${spacing},
      Math.sin(i*2.399)*50,-100-(i%41),3);snow.active++;}
    snow.mass=snow.emitted=snow.grains.length+snow.active;window.burstInitial=snow.mass;
    window.burstStart=snow.time;window.burstFrames=[];window.burstLast=performance.now();
    window.burstSample=function(t){
      liquidToolSync();var powder=0,descending=0,slow=0,sum=0,sum2=0;
      for(var p of snow.grains)if(p.physical){
        powder++;if(p.vy>=0){descending++;sum+=p.vy;sum2+=p.vy*p.vy;
          var fall=32+p.size*42+Math.sin(snow.time*1.7+p.phase)*9;if(p.vy<fall-.001)slow++;}
      }
      var active=0,stalled=0;
      for(var i=0;i<liquidCount;i++)if(liquidType[i]===5){active++;if(Math.abs(liquidVY[i])<25)stalled++;}
      var mean=sum/Math.max(1,descending);
      burstFrames.push({t:snow.time-burstStart,ms:t-burstLast,powder,descending,slow,mean,
        spread:Math.sqrt(Math.max(0,sum2/Math.max(1,descending)-mean*mean)),active,stalled,
        airborne:snow.grains.length,mass:__particleSnow.stats().mass});
      burstLast=t;window.burstRaf=requestAnimationFrame(burstSample);
    };window.burstRaf=requestAnimationFrame(burstSample);`);
  await sleep(2200);
  await screenshot('saturated-flurry');
  const result=await game('cancelAnimationFrame(burstRaf);({initial:burstInitial,frames:burstFrames})');
  fs.writeFileSync(path.join(out,'saturation.json'),JSON.stringify(result,null,2));
  const late=result.frames.filter(f=>f.t>1.3), last=late.at(-1);
  check('saturation trial advances through the apex',late.length>12);
  console.log('SATURATION',JSON.stringify({initial:result.initial,...last,frameMsP95:result.frames.map(f=>f.ms).sort((a,b)=>a-b)[Math.floor(result.frames.length*.95)]}));
  check('saturation conserves all sky snow and lofted powder',result.frames.every(f=>f.mass===result.initial));
  if(!reportOnly){
    check('full weather buffer never traps unsupported solver snow',late.every(f=>f.active===0&&f.stalled===0));
    check('all conserved grains become loose powder',late.every(f=>f.powder===powderCount));
    check('descending powder matches sky fall speeds with individual variation',late.every(f=>f.descending>powderCount*.8&&f.slow===0&&f.spread>6));
  }
  // Render a sentinel at the END of the >8192-particle cloud. A fixed-size
  // GPU upload once silently discarded this entire tail after handoff.
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;window.burstSave=snowSave();for(var p of snow.grains)p.x=cam.x-10000;render()');
  const clip=await game('({x:canvas.getBoundingClientRect().left+120*worldScale-12,y:canvas.getBoundingClientRect().top+100*worldScale-12,width:24,height:24,scale:1})');
  const blank=(await send('Page.captureScreenshot',{format:'png',clip})).data;
  await game('var p=snow.grains[snow.grains.length-1];p.x=cam.x+120;p.y=cam.y+100;render()');
  const tail=(await send('Page.captureScreenshot',{format:'png',clip})).data;
  if(!reportOnly)check('last flake beyond the old GPU draw limit stays visible',last.airborne>8192&&tail!==blank);
  fs.writeFileSync(path.join(out,'tail-grain.png'),Buffer.from(tail,'base64'));
  const restored=await game('snowReset(true);snowRestore(burstSave);({mass:__particleSnow.stats().mass,powder:snow.grains.filter(function(p){return p.physical;}).length})');
  check('large flurry survives save/load without changing airborne motion',restored.mass===result.initial && restored.powder===powderCount && await game('JSON.stringify(snowSave().grains)===JSON.stringify(burstSave.grains)'));
  check('no runtime or shader errors',errors.length===0);
  console.log('PASS saturated snow flight');
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
