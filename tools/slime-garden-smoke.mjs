// Full surface-loop regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/slime-garden-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8176), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-garden-');
const out = process.env.DUMP || '/tmp/sluice-garden-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__gardenTest = function(source) { return eval(source); };\n' + src.slice(i));
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
const game = source => ev(`__gardenTest(${JSON.stringify(source)})`);
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for(let i=0;i<100;i++) { try {const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100); }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});
  for(let i=0;i<300;i++){if(await ev(`typeof __gardenTest==='function' && __gardenTest("introPhase === 'done'")`))break;await sleep(100);}
  check('game completes normal loading',await game("introPhase === 'done'"));
  check('new effects warm without changing gameplay state',await ev('!!window.__shaderWarm && window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.garden>=0'));
  await ev(`window.__savedFullscreen=document.documentElement.requestFullscreen;
    window.__fullscreenCalls=0;
    document.documentElement.requestFullscreen=function(){window.__fullscreenCalls++;return Promise.resolve();};
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true,cancelable:true}));`);
  check('F activates only the scoop',await game('siphon.equipped') && await ev('window.__fullscreenCalls===0 && !document.body.classList.contains("gm-fs")'));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',altKey:true,bubbles:true,cancelable:true}));
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',altKey:true,repeat:true,bubbles:true,cancelable:true}));`);
  check('Alt+Enter requests fullscreen once without opening the shop',await ev('window.__fullscreenCalls===1') && await game('!keys.Enter && !shopOpen && siphon.equipped'));
  await ev(`document.documentElement.requestFullscreen=window.__savedFullscreen;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true,cancelable:true}));`);
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(1500);
  check('four lots and finite underground liquid pockets',await game('slimeGardenLots.length === 4 && mineralDeposits.length >= 8'));
  check('garden never intersects a surface lake',await game('surfacePonds.every(function(p){return p.cR < DECK_LEFT_COL-63 || p.cL > DECK_LEFT_COL-4;})'));
  check('brine before heat and deeper nectar/lumen',await game('mineralDeposits.some(function(p){return p.type===2 && p.r-SKY_ROWS<200;}) && mineralDeposits.some(function(p){return p.type===3 && p.r-SKY_ROWS>=200;}) && mineralDeposits.some(function(p){return p.type===4 && p.r-SKY_ROWS>=270;})'));
  await game('skySlimeNext=0.01');await sleep(650);
  check('first meteor arrives visibly above the surface',await game('skySlimes.length===1 && skySlimes[0].entry>0.1 && skySlimes[0].y<SKY_ROWS*TILE-skySlimes[0].r'));
  await screenshot('arrival');
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;money=179');
  check('first lot costs money and rejects insufficient cash',await game('!slimeGardenBuy(0) && money===179 && !slimeGardenLots[0].owned'));
  await game('money=1000');
  check('first stone lining needs no materials',await game('slimeGardenBuy(0) && money===820 && slimeGardenLots[0].owned'));
  check('purchased basin is 11 wide and 2 deep with solid floor',await game('(function(){var l=slimeGardenLots[0];for(var c=l.cL;c<=l.cR;c++){if(world[SKY_ROWS][c]||world[SKY_ROWS+1][c]||world[SKY_ROWS+2][c].type!=="foundation")return false;}return l.cR-l.cL+1===11;})()'));
  check('higher lot requires cargo materials',await game('!slimeGardenBuy(1) && money===820'));
  await game('cargo=[{type:"copper"},{type:"copper"},{type:"copper"}]');
  check('construction spends exact cash and material',await game('slimeGardenBuy(1) && money===170 && cargo.length===0'));
  // Controlled production scene: real liquid is laid at solver rest spacing.
  await game(`liquidCount=0; liquidOps.length=0; liquidMutationSeq++; liquidOpsOverflow=true; surfacePonds=[]; mineralDeposits=[]; mineralLiquidParked={};
    var l=slimeGardenLots[0];
    for(var y=l.y1-2;y>l.y1-34;y-=1.25) for(var x=l.x0+3;x<l.x1-3;x+=1.25) addLiquidParticle(0,x,y,0,0,0);
    skySlimes=[]; var s=skySlimeSpawn(l.x0+140,l.y1-25);s.age=10;s.entry=0;s.vx=s.vy=0;
    player.x=l.x1-36;player.y=l.y0-PLAYER_H;player.vx=player.vy=0;cam.snap=true;updateCamera();
    slimeGardenTick(0.1);`);
  check('water and a resident start a pearl',await game('slimeGardenLots[0].valid && slimeGardenLots[0].progress>0'));
  const before=await game('liquidCount');
  await game('for(var step=0;step<410;step++)slimeGardenTick(0.1)');
  check('one pearl incorporates exactly its liquid dose',await game(`slimeGardenLots[0].ready && liquidCount === ${before}-1800`));
  check('collection pays once',await game('slimeGardenCollect(0) && money===430 && !slimeGardenCollect(0) && money===430'));
  // Offscreen residency and additive save/restore must conserve liquid.
  const fluid=await game('liquidCount');
  await game('cam.y=10000;mineralLiquidClock=0;mineralLiquidTick(0.4)');
  check('leaving the surface parks all carried/poured liquid',await game(`liquidCount===0 && Object.values(mineralLiquidParked).reduce(function(n,a){return n+a.length/3;},0)===${fluid}`));
  check('offscreen recipe sampling retains bath contents',await game(`liquidSampleRect(slimeGardenLots[0].x0,slimeGardenLots[0].y0,slimeGardenLots[0].x1,slimeGardenLots[0].y1)[0]===${fluid}`));
  await game('siphon.tank=[201,0,302,403,504];skySlimes[0].wet=1;siphon.passenger=skySlimeCapture(skySlimes[0].x,skySlimes[0].y,30);var envelope=JSON.parse(JSON.stringify(saveBuild()));saveApply(envelope)');
  check('reload preserves purchased lots, tank and passenger',await game('slimeGardenLots[0].owned && slimeGardenLots[1].owned && siphon.tank[4]===504 && !!siphon.passenger'));
  check('reload preserves exact stored liquid quantity',await game(`Object.values(mineralLiquidParked).reduce(function(n,a){return n+a.length/3;},0)===${fluid}`));
  // Actual mouse route. Desktop aim must be clipped by terrain.
  await game('player.x=slimeGardenLots[0].x0+150;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();siphonToggle();render()');
  check('equipped keyboard R changes chamber without bailout',await game('siphonKey({key:"r",repeat:false}) && siphon.selected===2'));
  check('touch tank UI targets remain large and above console',await game('siphonButtons.length===3 && siphonButtons.every(function(b){return b.h>=36 && b.y+b.h<=consoleRect().y*consoleScale();})'));
  await game(`for(var i=0;i<6;i++){mineralLiquidClock=0;mineralLiquidTick(0.4);}
    var wx=player.x+PLAYER_W/2, wy=slimeGardenLots[0].y1-16;
    var sx=(wx-cam.x)*worldScale, sy=(wy-cam.y)*worldScale;
    processPointerDown(sx,sy,'mouse',true);siphonTick(0.05);processPointerUp('mouse');`);
  check('right mouse releases carried slime through real input routing',await game('!siphon.passenger && skySlimes.length===1'));
  const tankBefore=await game('siphonTotal()');
  await game(`siphon.passenger=skySlimeCapture(skySlimes[0].x,skySlimes[0].y,90);
    siphonToggle();
    for(var step=0;step<18;step++){player.x+=1;siphonTick(1/60);}`);
  check('scoop collects while moving with no held pointer',await game(`siphon.pointer===null && siphonTotal()>${tankBefore}`));
  check('left mouse remains available for movement',await game('!siphonPointerDown(viewW*0.65,viewH*0.35,"mouse",false)'));
  const pausedTank=await game('siphonTotal()');
  await game('gamePaused=true;siphonTick(0.1);gamePaused=false');
  check('paused scoop leaves liquids untouched',await game(`siphonTotal()===${pausedTank}`));
  const waterBefore=await game('siphon.tank[0]');
  await game(`siphon.passenger=null;siphon.selected=0;
    var wx=player.x+PLAYER_W/2+30, wy=slimeGardenLots[0].y0+10;
    processPointerDown((wx-cam.x)*worldScale,(wy-cam.y)*worldScale,'mouse',true);
    for(var step=0;step<12;step++)siphonTick(1/60);processPointerUp('mouse');`);
  check('right mouse pours downward without inventing volume',await game(`siphon.tank[0]<${waterBefore} && siphon.tank[0]>=0`));
  check('releasing pour does not restart suction',await game('!siphon.equipped'));
  check('HUD input stays separate from pouring',await game(`render();var b=drawHUD._zoomBtn;if(b){processPointerDown(b.x+b.w/2,b.y+b.h/2,'mouse');processPointerUp('mouse');}siphon.pointer===null`));
  await game(`var l=slimeGardenLots[0];skySlimes=[];var s=skySlimeSpawn(l.x0+110,l.y1-25);s.age=10;s.entry=0;s.vx=s.vy=0;s.wet=0.3;
    for(var y=l.y1-36;y>l.y1-50;y-=1.25) for(var x=l.x0+3;x<l.x1-3;x+=1.25) addLiquidParticle(0,x,y,0,0,0);
    player.x=l.x1+3;player.y=l.y0-PLAYER_H;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();siphon.noticeT=0;siphonToggle();`);
  await game('gameRafId=requestAnimationFrame(loop)');await sleep(2000);
  await screenshot('bath-and-tool');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize();siphon.noticeT=0');await sleep(750);await screenshot('mobile');
  check('mobile tool labels and dpad coexist',await game('siphonButtons.length===3 && siphonButtons.every(function(b){return !isInDpadZone(b.x+b.w,b.y+b.h);})'));
  check('mobile dpad pointer never owns siphon',await game("processPointerDown(DPAD_CX,DPAD_CY,99);var ok=dpadTouchId===99 && siphon.pointer===null;processPointerUp(99);ok"));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;mineralLiquidReset();mineralLiquidGenerate(true)');
  check('old mined worlds retain every mineral-liquid tier',await game('[2,3,4].every(function(t){return mineralDeposits.some(function(p){return p.type===t;});})'));
  check('GPU fluid backend stays active',await game('liquidWGPU.simActive && liquidWGPU.renderActive'));
  const contact = await game(`(async function(){
    var l=liquidWGPU, n=20, r=LIQUID_CELL*LIQUID_PDELTA*0.85;
    var ground=(SKY_ROWS+2)*TILE;
    player.x=slimeGardenLots[0].x0+160;player.y=ground-PLAYER_H;
    player.thrusting=false;rocketIntensity=0;explosions=[];skySlimes=[];jelloBodies=[];
    surfacePonds=[];mineralDeposits=[];mineralLiquidParked={};siphon.equipped=false;
    cam.snap=true;updateCamera();
    var results=[];
    for(var dir of [-1,1]) for(var speed of [2,160,500]) {
      player.dir=dir;player.vx=dir*speed;player.vy=0;
      liquidCount=0;liquidOps.length=0;liquidMutationSeq++;liquidOpsOverflow=true;
      var positions=new Float32Array(n*4), auxiliary=new Float32Array(n*4), flags=new Uint32Array(n);
      for(var i=0;i<n;i++) {
        var px=player.x+8+(i%5)*1.25, py=player.y+20+Math.floor(i/5)*1.25;
        addLiquidParticle(i%5,px,py,0,0,0);liquidSleeping[i]=1;liquidRestFrames[i]=90;
        positions[i*4]=px;positions[i*4+1]=py;
        auxiliary[i*4]=4;auxiliary[i*4+2]=px;auxiliary[i*4+3]=py;
        flags[i]=((i%5)&3)|(((i%5)&4)<<4)|16|(90<<8);
      }
      liquidStimSeq=liquidMutationSeq;liquidFrozenAll=true;liquidRigLastX=player.x-dir*0.25;liquidRigLastY=player.y;
      updateLiquids(1/60);
      if(liquidFrozenAll) throw new Error('slow rig contact failed to thaw water');
      // Execute the real compiled collision kernel against sleeping, embedded
      // particles. It must work independently of a pressure wake threshold.
      l.queue.writeBuffer(l.buf.pos,0,positions);
      l.queue.writeBuffer(l.buf.aux,0,auxiliary);
      l.queue.writeBuffer(l.buf.flag,0,flags);
      var rb=l.device.createBuffer({size:n*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      var enc=l.device.createCommandEncoder(), pass=enc.beginComputePass();
      pass.setPipeline(l.collidePipe.collide);pass.setBindGroup(0,l.collideBGs[l.collideBGs.length-1]);
      pass.dispatchWorkgroups(1);pass.end();
      enc.copyBufferToBuffer(l.buf.pos,0,rb,0,n*16);enc.copyBufferToBuffer(l.buf.flag,0,rb,n*16,n*4);
      l.queue.submit([enc.finish()]);await rb.mapAsync(GPUMapMode.READ);
      var data=rb.getMappedRange(), p=new Float32Array(data,0,n*4), f=new Uint32Array(data,n*16,n);
      for(var i=0;i<n;i++) {
        var cpu=liquidProjectMiner(positions[i*4],positions[i*4+1],0,0,r);
        if(!cpu) throw new Error('fixture expected an overlap');
        if(liquidMinerContains(p[i*4],p[i*4+1],r)) throw new Error('GPU left water in the rig');
        if(!liquidMinerExitClear(positions[i*4],positions[i*4+1],p[i*4],p[i*4+1],r)) throw new Error('GPU crossed terrain');
        if(((f[i]&3)|((f[i]>>4)&4))!==i%5 || (f[i]&16)) throw new Error('GPU changed material or left water sleeping');
        for(var lane=0;lane<4;lane++) if(Math.abs(p[i*4+lane]-cpu[lane])>0.02) throw new Error('CPU/GPU contact mismatch');
      }
      rb.unmap();rb.destroy();results.push({direction:dir,speed:speed,particles:n});
    }
    return results;
  })()`);
  check('slow/fast rig contact thaws and plows all five fluids on GPU and CPU',contact.length===6);
  assert.deepEqual(errors, [], 'no runtime or shader errors');
  console.log('Screenshots: '+out);
} finally {cleanup();}
