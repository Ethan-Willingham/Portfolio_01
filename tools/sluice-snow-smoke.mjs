// Physical snow integration, material conservation, interaction and visual checks. Uses its own Chrome for Testing process and profile.
// Run: node tools/sluice-snow-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8191), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-snow-');
const out = process.env.DUMP || '/tmp/sluice-snow-qa';
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});await ready();
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  check('ordinary worlds keep snow physics disabled',await game('!worldSnowEnabled && snow.mass===0'));
  await game('PAUSE_DISABLED=false');
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-snow-on').click()");
  check('Snow is a persisted next-world setting',await game("SluiceOptions.particleSnow && !worldSnowEnabled && localStorage.getItem('sluice.opt.rain')==='snow'"));
  await screenshot('snow-options');
  await ev("document.getElementById('gm-opt-back').click();document.getElementById('gm-new-game-btn').click();document.getElementById('gm-restart-btn').click()");await sleep(300);await ready();
  check('new snow world boots with real powder and a gentle snowfall',await game('worldSnowEnabled && worldRainEnabled && snow.mass>2000 && snow.banks.length>1000 && snow.grains.length>50 && weatherPrecipType() === "snow" && rain.drops.length===0'));
  check('the actual snow renderer warms under the loading cover',await ev('__shaderWarm.times.snow>=0 && __shaderWarm.errors.length===0'));
  await sleep(10000);
  console.log('Fresh snowfall:',await ev('__particleSnow.stats()'));
  await screenshot('snow-day');
  await game('timeOfDay=0.755');await sleep(2200);await screenshot('snow-dusk');
  await game('timeOfDay=0.05');await sleep(2200);await screenshot('snow-night');
  check('all snow mass belongs to exactly one bank or moving grain',await game(`snow.mass===snow.banks.reduce(function(n,b){return n+b.mass;},0)+snow.grains.reduce(function(n,p){return n+p.mass;},0) && snow.mass+snow.melted+snow.collected+snow.escaped===snow.emitted`));
  await ev("document.getElementById('gm-pause-btn').click()");const frozen=await game('snow.time');await sleep(400);
  check('pause freezes the snow and thaw',await game(`snow.time===${frozen}`));
  await ev("document.getElementById('gm-resume-btn').click()");

  // A bank along a clear road lets a real drive exercise compaction and spray.
  await game(`timeOfDay=0.35;weatherForce=4;weatherSetMood(4,true);tutorialDone=true;
    window.rc=80;window.sy=SKY_ROWS*TILE;
    for(var r=SKY_ROWS;r<SKY_ROWS+5;r++)for(var c=rc-5;c<rc+35;c++){world[r][c]={type:'dirt',hp:ORES.dirt.hp};invalidateTerrainAround(r,c);}
    for(var c=rc*8;c<(rc+28)*8;c++){var b=snowBank(c,SKY_ROWS,true);snow.mass+=12-b.mass;snow.emitted+=12-b.mass;b.mass=12;b.pack=0;}
    player.x=(rc+2)*TILE;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;cam.snap=true;updateCamera();
    window.driveStart=player.x;keys.ArrowRight=true;window.driveSamples=[];`);
  for(let i=0;i<8;i++){
    await sleep(450);
    const state=await game(`({x:player.x,y:player.y,speed:player.vx,ground:player.onGround,powder:snow.powder,packed:snow.packed,mass:snow.mass})`);
    await game(`driveSamples.push(${JSON.stringify(state)})`);console.log('Driving in powder:',state);
    if(i===3)await screenshot('snow-plow');
  }
  await game('keys.ArrowRight=false');
  check('the rig moves through powder, leaves packed tracks and throws real snow',await game('player.x>driveStart+150 && driveSamples.some(function(s){return s.powder>0 && s.packed>5 && s.ground;})'));
  await sleep(600);await screenshot('snow-tracks');
  await game('player.x=(rc+18)*TILE+3;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;cam.snap=true;keys.ArrowDown=true');
  await sleep(1600);await game('keys.ArrowDown=false');await screenshot('snow-drill');
  check('the ordinary Down control drills through snow into the ground',await game('world[SKY_ROWS][rc+18]===null'));
  await game('player.x=(rc+24)*TILE;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.onGround=true;drilling=null;cam.snap=true;window.jetMelt=snow.melted;keys.ArrowUp=true');await sleep(1200);await screenshot('snow-jet');await game('keys.ArrowUp=false');
  check('jet exhaust disturbs and melts the snow below it',await game('snow.powder>0 && snow.melted>jetMelt'));

  await game('cancelAnimationFrame(gameRafId);gameRafId=0;window.snowEnvelope=JSON.parse(JSON.stringify(saveBuild()));window.savedSnow=snow.mass;saveApply(window.snowEnvelope)');
  check('save/load preserves banks, compression, flying powder and every snow mass unit',await game('worldSnowEnabled && snow.mass===savedSnow && snow.grains.length===snowEnvelope.rain.snow.grains.length && snow.banks.some(function(b){return b.pack>0.5;})'));
  check('snow state stays separate from its meltwater',await game('snow.mass+rain.parked.length/2===savedSnow+snowEnvelope.rain.water.length/2'));

  // Controlled fixtures use the real game functions with rendering paused.
  await game(`window.clearSnowFixture=function(){
    liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;
    surfacePonds=[];surfacePondBasins=[];rainReset(true,true);snowReset(true);
    weatherForce=0;weatherSetMood(0,true);rain.intensity=0;cam.x=(rc-4)*TILE;cam.y=sy-120;screenW=640;screenH=480;
    player.x=(rc+15)*TILE;player.y=sy-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;player.onGround=true;player.lastMoveD=false;player.onSnow=false;
    for(var r=SKY_ROWS;r<SKY_ROWS+20;r++)for(var c=rc-5;c<rc+22;c++)world[r][c]={type:'stone',hp:10};
    snow.rigX=player.x;
  };clearSnowFixture();
  snowDeposit(rc*8+4,SKY_ROWS,10,0);snow.mass=snow.emitted=10;
  window.bank=snowBank(rc*8+4,SKY_ROWS,false);window.fluffy=snowHeight(bank);bank.pack=0.9;`);
  check('packing changes volume without changing mass',await game('snowHeight(bank)<fluffy*0.4 && bank.mass===10 && snow.mass===10'));
  await game(`clearSnowFixture();snowDeposit(rc*8+4,SKY_ROWS,12,0);snow.mass=snow.emitted=12;
    snowBlast(rc*TILE+18,sy-8,35);`);
  check('a blast converts settled snow into conserved flying powder',await game('snow.powder>0 && snow.mass===12 && snow.banks.reduce(function(n,b){return n+b.mass;},0)+snow.grains.reduce(function(n,p){return n+p.mass;},0)===12'));
  await game(`clearSnowFixture();snowDeposit(rc*8+4,SKY_ROWS,8,0);snow.mass=snow.emitted=8;
    world[SKY_ROWS][rc]=null;world[SKY_ROWS+1][rc]=null;
    for(var n=0;n<80;n++)updateSnow(0.025);`);
  check('mining the support makes the snow fall instead of hover',await game('!snowBank(rc*8+4,SKY_ROWS,false) && snow.mass===8 && snow.banks.some(function(b){return b.mass>0 && b.row>SKY_ROWS;})'));
  await game(`clearSnowFixture();snowAddGrain(rc*TILE+16,sy-8,0,74,1,false);snow.mass=snow.emitted=1;
    for(var n=0;n<10;n++)updateSnow(0.025);`);
  check('falling flakes accumulate on a solid roof',await game('snow.grains.length===0 && snow.banks.some(function(b){return b.mass===1 && b.row===SKY_ROWS;})'));
  await game(`clearSnowFixture();for(var r=SKY_ROWS;r<SKY_ROWS+5;r++)world[r][rc]=null;
    snowAddGrain(rc*TILE+16,sy-8,0,74,1,false);snow.mass=snow.emitted=1;
    for(var n=0;n<30;n++)updateSnow(0.025);`);
  check('open shafts admit falling snow',await game('snow.grains.some(function(p){return p.y>sy;}) && snow.banks.length===0'));
  await game(`clearSnowFixture();snowAddGrain(rc*TILE+16,sy-8,0,74,1,false);snow.mass=snow.emitted=1;
    for(var x=rc*TILE;x<rc*TILE+TILE;x++)for(var y=sy-12;y<sy;y++)rain.cells[rainCell(x,y)]=10;
    updateSnow(0.025);`);
  check('snow touching water becomes exactly its mass of real water',await game('snow.mass===0 && snow.melted===1 && snow.grains.length===0 && liquidCount===1 && liquidOrigin[0]===3'));
  await game(`clearSnowFixture();snowDeposit(rc*8+4,SKY_ROWS,10,0);snow.mass=snow.emitted=10;
    window.taken=liquidToolExtract(rc*TILE+18,sy-10,25,6)[0];`);
  check('scooping snow puts the exact water equivalent into the intake',await game('taken===6 && snow.mass===4 && snow.collected===6 && liquidCount===0'));
  await game(`clearSnowFixture();snowAddGrain(rc*TILE+18,sy-10,20,-10,7,true);snow.mass=snow.emitted=7;
    window.taken=liquidToolExtract(rc*TILE+18,sy-10,25,4)[0];`);
  check('the scoop also collects flying powder without duplicating the remainder',await game('taken===4 && snow.mass===3 && snow.collected===4 && snow.grains[0].mass===3'));
  await game(`clearSnowFixture();snow.mass=snow.emitted=12;window.fullCount=liquidCount;liquidCount=LIQUID_MAX_PARTICLES;
    window.blockedMelt=snowMelt(rc*TILE+16,sy-2,12,0,0);liquidCount=fullCount;`);
  check('a full water solver never erases snow during melting',await game('blockedMelt===0 && snow.mass===12 && snow.melted===0'));

  const thaw=await game(`(function(){var results=[];
    for(var test=0;test<4;test++){
      clearSnowFixture();var hz=[30,60,144,60][test];snow.temperature=test===3?-5:4;
      for(var col=rc*8;col<rc*8+40;col++){snowDeposit(col,SKY_ROWS,6,0);snow.mass+=6;snow.emitted+=6;}
      // The material step has a fixed cadence independent of rendering.
      var clock=0;for(var f=0;f<hz*30;f++){clock+=1/hz;while(clock>=0.05){snowBankTick(0.05);clock-=0.05;}}
      results.push({hz:hz,cold:test===3,mass:snow.mass,melted:snow.melted,water:liquidCount});
    }return results;
  })()`);
  console.log('Thirty seconds of thaw:',thaw);
  check('warm powder thaws into water while cold powder persists',thaw.slice(0,3).every(s=>s.melted>100&&s.water===s.melted)&&thaw[3].melted===0);
  check('thaw behaves consistently at 30, 60 and 144 FPS',Math.max(...thaw.slice(0,3).map(s=>s.melted))-Math.min(...thaw.slice(0,3).map(s=>s.melted))<=3);
  await game(`clearSnowFixture();snowRestore({banks:[[rc*8,SKY_ROWS,7,0.3,0],[rc*8,SKY_ROWS,7,0.3,0],[-1,2,4,0],[rc*8,SKY_ROWS,NaN,0]],grains:[[NaN,0,0,0,1,0,0,0]]});`);
  check('malformed and duplicate saved snow cannot inflate mass',await game('snow.mass===7 && snow.banks.length===1 && snow.grains.length===0'));
  await game('rainRestore({enabled:true,water:[]})');
  check('old rain saves do not silently become snow worlds',await game('worldRainEnabled && !worldSnowEnabled && snow.mass===0'));

  // Fresh scene for performance, long-term stability and mobile layout.
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&snow=1&tod=0.35`});await ready();
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'))");
  if(process.argv.includes('--soak')){
    await game('weatherForce=4;weatherSetMood(4,true)');
    for(let i=0;i<6;i++){await sleep(10000);console.log('Snowfall '+(i+1)*10+'s:',await ev('__particleSnow.stats()'));}
    check('sustained snow respects particle, storage and bank budgets',await game(`snow.mass<=SNOW_MASS_CAP && snow.grains.length<=SNOW_FLAKE_CAP+SNOW_POWDER_CAP && snow.powder<=SNOW_POWDER_CAP && snow.banks.length<=SNOW_BANK_CAP && snow.mass===snow.banks.reduce(function(n,b){return n+b.mass;},0)+snow.grains.reduce(function(n,p){return n+p.mass;},0)`));
    await screenshot('snow-deep');
  }
  const timings=await game(`(function(){var a=[];for(var n=0;n<200;n++){var t=performance.now();updateParticleRain(1/60);a.push(performance.now()-t);}a.sort(function(a,b){return a-b;});return {median:a[100],p95:a[190],max:a[199]};})()`);
  console.log('Snow update milliseconds:',timings);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize()');await sleep(1300);await screenshot('snow-mobile');
  await game('PAUSE_DISABLED=false');
  await ev("document.getElementById('gm-pause-btn').click()");
  await ev("document.getElementById('gm-options-btn').click();document.getElementById('gm-rain-label').scrollIntoView({block:'center'})");await screenshot('snow-options-mobile');
  check('the Snow option fits and remains tappable on mobile',await ev("(function(){var r=document.getElementById('gm-snow-on').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40;})()"));
  if(process.argv.includes('--cpu')){
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&snow=1&cpuwater=1&tod=0.35`});await ready();
    await sleep(4000);
    check('snow boots and melts on the CPU water fallback',await game('(!liquidWGPU || !liquidWGPU.simActive) && worldSnowEnabled && snow.grains.length>20 && snow.mass>2000 && snow.melted>0'));
    await screenshot('snow-cpu');console.log('CPU snow:',await ev('__particleSnow.stats()'));
  }
  console.log('Errors:',JSON.stringify(errors));check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {cleanup();}
