// Bath-born soft-body residents, lifecycle, physics and rendering regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/sky-slime-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8196), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-surface-slime-');
const out = process.env.DUMP || '/tmp/sluice-surface-slime-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__bathTest = function(source) { return eval(source); };\n' + src.slice(i));
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
const game = source => ev(`__bathTest(${JSON.stringify(source)})`);
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
  for(let i=0;i<300;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(500);
  check('five residents on first boot',await game('jelloBodies.filter(function(b){return !!b.surfaceSlime;}).length===5'));
  await screenshot('first-boot');
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimeNext=100000');
  console.log('RESIDENTS',await game('jelloBodies.filter(function(b){return !!b.surfaceSlime;}).map(function(b){return {x:b.cx,y:b.cy,n:b.n,state:b.surfaceSlime.state};})'));
  const movement=await game(`(function(){
    var b=jelloBodies.filter(function(b){return !!b.surfaceSlime;})[0], start=b.cx, heights=[], maxSpeed=0;
    player.x=b.cx-250;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    cam.x=b.cx-screenW/2;cam.y=SKY_ROWS*TILE-screenH*.6;
    for(var n=0;n<600;n++){surfaceSlimeTick(1/60);updateJello(1/60);heights.push(b.bboxB-b.bboxT);maxSpeed=Math.max(maxSpeed,Math.hypot(b.vx,b.vy)*JELLO_TIMESCALE);}
    render();return {distance:Math.abs(b.cx-start),heightRange:Math.max.apply(null,heights)-Math.min.apply(null,heights),maxSpeed:maxSpeed,finite:jelloBodies.every(function(b){return Array.from(b.px).concat(Array.from(b.py)).every(isFinite);})};
  })()`);
  console.log('MOVEMENT',movement);
  check('muscles move a real deforming mesh',movement.distance>10 && movement.heightRange>3 && movement.finite);
  await screenshot('walking');
  const physics=await game(`(function(){
    var reports=[];
    for(var rate=0;rate<3;rate++){
      resetJello();surfaceSlimesSeeded=true;
      var fps=[30,60,144][rate], x=(DECK_CENTER_COL-4)*TILE, floor=SKY_ROWS*TILE;
      var b=surfaceSlimeBuild(x,floor-180,{id:999,seed:.4,hue:133});
      player.x=x-220;player.y=floor-PLAYER_H;player.vx=player.vy=0;
      cam.x=x-screenW/2;cam.y=floor-screenH*.6;
      var minH=1000,maxH=0,maxY=0;
      for(var n=0;n<fps*4;n++){updateJello(1/fps);minH=Math.min(minH,b.bboxB-b.bboxT);maxH=Math.max(maxH,b.bboxB-b.bboxT);maxY=Math.max(maxY,b.bboxB-floor);}
      var settled=b.cx; jelloLaunchBody(b,150,-220,{h:jelloStepH});
      for(n=0;n<fps*2;n++)updateJello(1/fps);
      reports.push({fps:fps,compression:maxH-minH,travel:b.cx-settled,penetration:maxY,finite:Array.from(b.px).concat(Array.from(b.py)).every(isFinite)});
    }
    render();return reports;
  })()`);
  console.log('PHYSICS',physics);
  check('fall, squash and launch remain stable at 30/60/144 Hz',physics.every(p=>p.finite&&p.compression>4&&p.travel>25&&p.penetration<8));
  await screenshot('after-impact');
  const life=await game(`(function(){
    resetJello();surfaceSlimesSeeded=false;surfaceSlimeSeed();
    var saved=JSON.parse(JSON.stringify(surfaceSlimeSave())), ids=saved.residents.map(function(s){return s.id;});
    resetJello();surfaceSlimeRestore(saved);surfaceSlimeTick(1/60);
    var restored=surfaceSlimeSave(), unique=new Set(restored.residents.map(function(s){return s.id;}));
    var before=restored.residents.length;
    var s=skySlimeFresh(0,0);s.bathed=true;s.r=22.25;s.seed=.9;
    var g={s:s,paid:true};var released=bathReleaseGuest(g);
    var born=jelloBodies.filter(function(b){return b.surfaceSlime&&b.surfaceSlime.id===s.id;})[0];
    for(var n=0;n<1200;n++){surfaceSlimeTick(1/60);updateJello(1/60);}
    var stayed=jelloBodies.indexOf(born)>=0,bornRadius=born.surfaceSlime.radius;
    var finalSave=JSON.parse(JSON.stringify(surfaceSlimeSave()));
    resetJello();surfaceSlimeRestore(finalSave);
    var reloaded=jelloBodies.filter(function(b){return b.surfaceSlime&&b.surfaceSlime.id===s.id;})[0];
    return {before:before,restored:unique.size,ids:ids.join(',')===restored.residents.map(function(s){return s.id;}).join(','),released:released,born:!!born,stayed:stayed,after:surfaceSlimeSave().residents.length,
      skyRadius:s.r,bornRadius:bornRadius,reloadedRadius:reloaded.surfaceSlime.radius,
      startersSameRange:saved.residents.every(function(s){return s.r>=22&&s.r<=27;})};
  })()`);
  console.log('LIFECYCLE',life);
  check('save restores identities once and bathed guests stay',life.before===5&&life.restored===5&&life.ids&&life.released&&life.born&&life.stayed&&life.after===6);
  check('unhardening and reloading keep the incoming sky visitor size',life.skyRadius===life.bornRadius&&life.bornRadius===life.reloadedRadius&&life.startersSameRange);
  const contact=await game(`(function(){
    resetJello();skySlimeReset();skySlimeNext=100000;surfaceSlimesSeeded=true;
    var x=(DECK_CENTER_COL-4)*TILE,floor=SKY_ROWS*TILE,b=surfaceSlimeBuild(x,floor-35,{seed:.3});
    player.x=x-220;player.y=floor-PLAYER_H;player.vx=player.vy=0;
    cam.x=x-screenW/2;cam.y=floor-screenH*.6;
    for(var n=0;n<80;n++)updateJello(1/60);
    var start=b.cx,rock=skySlimeFresh(x-110,floor-25);rock.r=25;rock.vx=210;rock.entry=0;skySlimes.push(rock);
    for(n=0;n<90;n++){skySlimeTick(1/60);updateJello(1/60);}
    render();return {travel:b.cx-start,separation:Math.abs(rock.x-b.cx),finite:Array.from(b.px).every(isFinite)};
  })()`);
  console.log('ROCK CONTACT',contact);
  check('rocky visitors transfer force to soft residents',contact.finite&&contact.travel>5&&contact.separation>35);
  const rigPlay=await game(`(function(){
    resetJello();skySlimes.length=0;surfaceSlimesSeeded=true;
    var x=(DECK_CENTER_COL-4)*TILE,b=surfaceSlimeBuild(x,SKY_ROWS*TILE-35,{seed:.3});
    player.x=x-105;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    cam.x=x-screenW/2;cam.y=SKY_ROWS*TILE-screenH*.6;
    for(var n=0;n<60;n++)updateJello(1/60);
    var start=b.cx;keys.ArrowRight=true;
    try {for(n=0;n<100;n++){update(1/60);surfaceSlimeTick(1/60);updateJello(1/60);}}
    finally {keys.ArrowRight=false;}
    return {travel:b.cx-start,finite:Array.from(b.px).every(isFinite),rigX:player.x};
  })()`);
  console.log('RIG PLAY',rigPlay);
  check('ordinary driving pushes the soft body',rigPlay.finite&&rigPlay.travel>25);
  const pointer=await game(`(function(){
    resetJello();skySlimes.length=0;surfaceSlimesSeeded=true;
    var x=(DECK_CENTER_COL-4)*TILE,b=surfaceSlimeBuild(x,SKY_ROWS*TILE-36,{id:404,seed:.4});
    player.x=x-220;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    cam.x=x-screenW/2;cam.y=SKY_ROWS*TILE-screenH*.6;
    for(var n=0;n<60;n++)updateJello(1/60);render();
    var rect=canvas.getBoundingClientRect();
    return {x:rect.left+(b.cx-cam.x)*worldScale,y:rect.top+(b.cy-cam.y)*worldScale,startY:b.cy,scale:worldScale};
  })()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pointer.x,y:pointer.y,button:'left',clickCount:1});
  check('real mouse input grabs the visible creature',await game('!!surfaceSlimeGrip'));
  for(let n=1;n<=18;n++){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x+n*3,y:pointer.y-n*6,button:'left',buttons:1});
    await game('surfaceSlimeTick(1/60);updateJello(1/60);render()');
  }
  await game('for(var n=0;n<80;n++){surfaceSlimeTick(1/60);updateJello(1/60);}render()');
  const grip=await game('(function(){var b=surfaceSlimeGrip.body;return {y:b.cy,stretch:(b.bboxB-b.bboxT)/b.surfaceSlime.radius,finite:Array.from(b.px).concat(Array.from(b.py)).every(isFinite)};})()');
  console.log('GRIP',grip);
  check('compliant grip lifts a deforming body',grip.finite&&grip.y<pointer.startY-35);
  await screenshot('stretched');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pointer.x+54,y:pointer.y-108,button:'left',clickCount:1});
  check('pointer release clears the physical grip',await game('!surfaceSlimeGrip&&!jelloBodies[0]._grabbed'));
  // Save the whole game, restoring gel after world and ordinary jello.
  const roundtrip=await game(`(function(){
    surfaceSlimesSeeded=false;surfaceSlimeSeed();
    var env=JSON.parse(JSON.stringify(saveBuild())), before=env.surfaceSlimes.residents.length;
    saveApply(env);surfaceSlimeTick(1/60);
    var after=surfaceSlimeSave();return {before:before,after:after.residents.length,seeded:after.seeded};
  })()`);
  console.log('FULL SAVE',roundtrip);
  check('full game save preserves residents without reseeding',roundtrip.seeded&&roundtrip.before===roundtrip.after);
  // A close view exposes the actual mesh, face fit and material at playable scale.
  await game(`(function(){
    resetJello();surfaceSlimesSeeded=true;
    var x=(DECK_CENTER_COL-3)*TILE;
    player.x=x-140;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    for(var i=0;i<5;i++)surfaceSlimeBuild(x+i*75,SKY_ROWS*TILE-34,{id:2000+i,seed:.08+i*.19,hue:surfaceSlimeHues[i]});
    cam.x=x-220;cam.y=SKY_ROWS*TILE-screenH*.60;
    for(var n=0;n<50;n++)updateJello(1/60);
    render();
  })()`);
  await screenshot('lineup');
  await game(`(function(){
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#303931';ctx.fillRect(0,0,canvas.width,canvas.height);
    var list=jelloBodies.filter(function(b){return !!b.surfaceSlime;});
    for(var i=0;i<list.length;i++){
      var b=list[i];ctx.save();ctx.translate(180+i*220,300);ctx.scale(3,3);ctx.translate(-b.cx,-b.cy);surfaceSlimeDraw(b);ctx.restore();
    }ctx.restore();
  })()`);
  await screenshot('faces');
  const barrier=await game(`(function(){
    resetJello();var x=(DECK_CENTER_COL-4)*TILE,b=surfaceSlimeBuild(x,SKY_ROWS*TILE-35,{seed:.4});
    cam.x=x-screenW/2;cam.y=SKY_ROWS*TILE-screenH*.6;
    for(var n=0;n<60;n++)updateJello(1/60);
    surfaceSlimeGrabStart(b.cx,b.cy,'test');surfaceSlimeGrabMove(b.cx,SKY_ROWS*TILE+140,'test');
    var embedded=0;
    for(n=0;n<180;n++){
      updateJello(1/60);
      for(var p=0;p<b.n;p++)if(jelloWorldSolidAt(b.px[p],b.py[p]))embedded++;
    }
    surfaceSlimeGrabEnd('test',true);
    for(n=0;n<120;n++)updateJello(1/60);
    return {embedded:embedded,finite:Array.from(b.px).concat(Array.from(b.py)).every(isFinite),released:!b._grabbed};
  })()`);
  console.log('WALL GRIP',barrier);
  check('dragging into terrain cannot pull gel through the floor',barrier.finite&&barrier.released&&barrier.embedded===0);
  // A real WebGPU basin checks buoyancy and the same moving gel boundary.
  await game(`(function(){
    resetJello();skySlimes.length=0;
    for(var r=SKY_ROWS-1;r<=SKY_ROWS+7;r++)for(var c=140;c<=149;c++){
      world[r][c]=r===SKY_ROWS+7||c===140||c===149?{type:'stone',hp:100}:null;
      invalidateTerrainAround(r,c);lightingOnClear(r,c);
    }
    for(var p=liquidCount-1;p>=0;p--)removeLiquidParticle(p);
    var left=141*TILE+2,right=149*TILE-2,top=(SKY_ROWS+2)*TILE,bottom=(SKY_ROWS+7)*TILE-2;
    for(var y=top;y<bottom;y+=1.5)for(var x=left;x<right;x+=1.5)addLiquidParticle(0,x,y,0,0,0);
    player.x=139*TILE;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();
  })()`);
  await game(`(async function(){for(var n=0;n<120;n++){liquidToolSync();updateLiquids(1/60);if(n%2===0){render();await new Promise(requestAnimationFrame);}}surfaceSlimeBuild(145*TILE,(SKY_ROWS+2)*TILE-130,{id:555,seed:.2});})()`);
  const water=await game(`(async function(){
    var b=jelloBodies[0],maxY=b.cy,wet=false,before=liquidCount;
    for(var n=0;n<540;n++){
      liquidToolSync();surfaceSlimeTick(1/60);updateLiquids(1/60);updateJello(1/60);
      maxY=Math.max(maxY,b.cy);wet=wet||!!b.surfaceSlime.wet;
      if(n%2===0){render();await new Promise(requestAnimationFrame);}
    }
    render();return {wet:wet,maxY:maxY,y:b.cy,vy:b.vy*JELLO_TIMESCALE,alive:jelloBodies.indexOf(b)>=0,
      before:before,after:liquidCount,guests:surfaceSlimeGuests.length,gpu:liquidWGPU&&liquidWGPU.simActive,floor:(SKY_ROWS+7)*TILE};
  })()`);
  console.log('WATER',water);
  check('gel floats, displaces real water and never dissolves',water.gpu&&water.wet&&water.alive&&water.guests===1&&water.y<water.floor-50&&water.before===water.after);
  await screenshot('water');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const finger=await game(`(function(){
    resetJello();isMobile=true;resize();var x=DECK_CENTER_COL*TILE;
    var b=surfaceSlimeBuild(x,SKY_ROWS*TILE-50,{seed:.4});
    player.x=x-90;player.y=SKY_ROWS*TILE-PLAYER_H;player.renderX=player.x;player.renderY=player.y;
    cam.x=x-90;cam.y=SKY_ROWS*TILE-screenH*.48;
    for(var n=0;n<50;n++)updateJello(1/60);render();
    var rect=canvas.getBoundingClientRect();return {x:rect.left+(b.cx-cam.x)*worldScale,y:rect.top+(b.cy-cam.y)*worldScale};
  })()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:finger.x,y:finger.y}]});
  check('real touch input grabs a resident',await game('!!surfaceSlimeGrip'));
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:finger.x+20,y:finger.y-65}]});
  await game('for(var n=0;n<40;n++)updateJello(1/60);render()');
  await screenshot('phone-touch');
  await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  check('touch cancellation releases the resident',await game('!surfaceSlimeGrip&&!jelloBodies[0]._grabbed'));
  check('no browser exceptions',errors.length===0);
  console.log('PASS surface residents; screenshots '+out);
} finally { cleanup(); }
