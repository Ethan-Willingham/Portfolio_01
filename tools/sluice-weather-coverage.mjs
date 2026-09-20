// World-wide precipitation coverage and rain/snow identity regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/sluice-weather-coverage.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8199), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-rain-');
const out = process.env.DUMP || '/tmp/sluice-weather-qa';
assert.ok(!path.resolve(out).startsWith(root + path.sep), 'Screenshots stay outside the repo');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__rainTest = function(source) { return eval(source); };\n' + src.slice(i));
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
const game = source => ev(`__rainTest(${JSON.stringify(source)})`);
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
    for(let i=0;i<400;i++){if(await ev(`typeof __rainTest==='function' && __rainTest("introPhase === 'done'")`))return;await sleep(100);}
    throw new Error('loading did not complete');
  }
  for (const mode of ['snow','rain']) {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?${mode}=1&wmood=4&nosave=1&nopause=1&tod=0.35${process.argv.includes('--cpu')?'&cpuwater=1':''}`});
    await ready();
    await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
    await game(`cancelAnimationFrame(gameRafId);gameRafId=0;
      while(liquidCount)removeLiquidParticle(liquidCount-1);mineralLiquidReset();surfacePonds=[];
      rainReset(true,${mode==='snow'});weatherForce=4;weatherSetMood(4,true);tutorialDone=true;`);
    const counts=[];
    for(const [index,x,y] of [[0,400,55],[1,2600,-650],[2,7600,-1850],[3,9700,-3500],[4,400,-3500],[5,7600,55]]) {
      const sample=await game(`(function(){player.x=${x};player.y=${y};player.vx=player.vy=0;player.thrusting=false;
        cam.snap=true;updateCamera();updateWeather(1/60);updateParticleRain(1/60);render();
        var parts=worldSnowEnabled?snow.grains:rain.drops, bins=[0,0,0,0];
        for(var p of parts)if(p.x>=cam.x&&p.x<cam.x+screenW&&p.y>=cam.y&&p.y<Math.min(SKY_ROWS*TILE,cam.y+screenH))
          bins[Math.min(3,Math.floor((p.x-cam.x)/screenW*4))]++;
        return {bins:bins,type:weatherPrecipType(),rain:rain.drops.length,snow:snow.grains.length,
          legacy:precipActive,phase:rain.climate.phase,intensity:rain.intensity};})()`);
      console.log(mode,index,sample);counts.push(sample.bins);
      check(`${mode} covers all four view columns at map stop ${index}`,sample.bins.every(n=>n>3));
      check(`${mode} retains one precipitation identity at map stop ${index}`,sample.type===mode&&sample.legacy===0&&(mode==='snow'?sample.rain===0:sample.snow===0));
      if(index===1||index===3)await screenshot(`${mode}-map-${index}`);
    }
    const transition=await game(`(function(){
      while(liquidCount)removeLiquidParticle(liquidCount-1);rainReset(true,${mode==='snow'});
      player.x=2500;player.y=-650;player.thrusting=false;cam.x=2000;cam.y=-1000;
      function bins(){var b=[0,0,0,0,0,0,0,0,0,0,0,0],p=worldSnowEnabled?snow.grains:rain.drops;
        for(var f of p)if(f.x>=cam.x&&f.x<cam.x+screenW&&f.y>=cam.y&&f.y<cam.y+screenH)
          b[Math.floor((f.x-cam.x)/screenW*4)+4*Math.floor((f.y-cam.y)/screenH*3)]++;
        return b;}
      for(var n=0;n<600;n++){weather.pcp=.02+.63*n/600;updateParticleRain(1/60);}
      var waiting=bins();cam.x=6500;player.x=7000;updateParticleRain(0);var arriving=bins();
      render();return {waiting:waiting,arriving:arriving};})()`);
    const sum=b=>b.reduce((a,n)=>a+n,0),ratio=sum(transition.arriving)/sum(transition.waiting);
    console.log(mode,'evolving front',transition,ratio);
    check(`${mode} builds equally in visited and unvisited sky`,ratio>.8&&ratio<1.25);
    check(`${mode} has no horizontal or vertical curtain`,Math.min(...transition.waiting)>Math.max(...transition.waiting)*.4);
    await screenshot(`${mode}-buildup-travel`);
    await game('cam.y=SKY_ROWS*TILE+100;window.beforeUnderground=rain.emitted+snow.emitted;updateParticleRain(1/60)');
    check(`${mode} does not seed weather inside the mine`,await game('rain.emitted+snow.emitted===beforeUnderground'));
    if(mode==='snow') {
      await game(`while(liquidCount)removeLiquidParticle(liquidCount-1);
        rainRestore({enabled:true,mode:'snow',snow:{version:2,particles:[],grains:[],airParked:[[7000,-700,0,53,1,0,.5,0]]},water:[2400,-700,2400,SKY_ROWS*TILE+8]});
        cam.x=2000;cam.y=-1000;player.x=2400;player.y=-650;`);
      check('old snow saves cannot revive cached storm strips',await game('snow.airCount===0&&snow.grains.length===0'));
      check('legacy atmospheric water retires without creating another snow patch; surface water stays water',await game('snow.mass===0&&snow.parked.length===0&&rain.recycled===1&&rain.parked.length===2&&rain.parked[1]===SKY_ROWS*TILE+8'));
      await game('snowStore(2400,-700,0,53);snow.mass=1;snowScan(.12);snowScan(.12)');
      check('isolated physical snow returns to slow flight without changing mass',await game('snow.grains.length===1&&snow.grains[0].physical&&snow.mass===1'));
      check('jet heat cannot make rain out of airborne powder',await game('player.thrusting=true;player.jetForce=200;snow.temperature=4;snowHeat(player.x+PLAYER_W*.5,player.y+PLAYER_H+15)===0'));
      check('clearing cannot thaw the world while snow is still falling',await game('weatherForce=-1;rain.climate.phase=3;weather.pcp=.4;snowTemperature()<0'));
      check('rain rendering rejects a snow world',await game(`(function(){var strokes=0,old=ctx.stroke;try{ctx.stroke=function(){strokes++;};drawParticleRain();}finally{ctx.stroke=old;}return strokes===0;})()`));
    }
  }
  assert.equal(errors.length,0,'no runtime or GPU validation errors');
  console.log('PASS whole-map rain and snow, high flight, underground gating, mode exclusivity and no atmospheric thaw; screenshots '+out);
} finally { if(errors.length)console.log('ERRORS',errors.slice(0,8));cleanup(); }
