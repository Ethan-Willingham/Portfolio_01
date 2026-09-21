// Contact-driven muscle waves, ledge climbing, wall adhesion and knock-off regression.
// Run: node tools/surface-slime-crawl.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8200), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-surface-slime-');
const out = process.env.DUMP || '/tmp/sluice-crawl-qa';
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


  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimeNext=100000;skySlimes.length=0;surfaceSlimesSeeded=true');
  await game(`window.__crawlSetup = function(dir,height,seed){
    resetJello();
    for(var r=0;r<12;r++)for(var c=140;c<180;c++){
      world[r][c]=r>=8?{type:'stone',hp:100}:null;
      if(height && r>=8-height && r<8 && (dir>0?c>=160:c<160))world[r][c]={type:'stone',hp:100};
      invalidateTerrainAround(r,c);
    }
    var x=height?160*TILE-dir*40:155*TILE;
    var b=surfaceSlimeBuild(x,8*TILE-32,{id:500,seed:seed===undefined?.4:seed,home:x});
    b.surfaceSlime.dir=dir;b.surfaceSlime.state='crawl';b.surfaceSlime.timer=100;
    b.surfaceSlime.goalX=x+dir*TILE*12;
    player.x=140*TILE;player.y=8*TILE-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;
    player.onJello=false;player.jelloGroundT=0;
    cam.x=x-screenW/2;cam.y=8*TILE-screenH*.6;
    window.__crawlBody=b;return b;
  };
  window.__crawlStep=function(fps,seconds){
    var b=window.__crawlBody;
    for(var n=0;n<fps*seconds;n++){surfaceSlimeTick(1/fps);updateJello(1/fps);}
  }`);
  const rates=await game(`(function(){
    var out=[];
    for(var rate=0;rate<3;rate++)for(var dir=-1;dir<=1;dir+=2){
      var fps=[30,60,144][rate],b=window.__crawlSetup(dir,3),x=b.cx;
      var minHeight=1000,maxHeight=0,embedded=0;
      for(var n=0;n<fps*55;n++){
        surfaceSlimeTick(1/fps);updateJello(1/fps);
        minHeight=Math.min(minHeight,b.bboxB-b.bboxT);maxHeight=Math.max(maxHeight,b.bboxB-b.bboxT);
        for(var p=0;p<b.n;p++)if(jelloWorldSolidAt(b.px[p],b.py[p]))embedded++;
      }
      out.push({fps:fps,dir:dir,travel:(b.cx-x)*dir,y:b.cy,heights:[minHeight,maxHeight],embedded:embedded,finite:Array.from(b.px).concat(Array.from(b.py)).every(isFinite)});
    }return out;
  })()`);
  console.log('LEDGES',rates);
  check('waves climb and crest three-tile ledges in both directions at 30/60/144 Hz',rates.every(r=>r.finite&&r.travel>50&&r.y<165&&r.embedded===0));
  const sizes=await game(`(function(){
    var out=[];
    for(var i=0;i<3;i++){
      var seed=[.08,.65,.84][i],height=i===1?1:3,b=window.__crawlSetup(1,height,seed),x=b.cx;
      window.__crawlStep(60,60);
      out.push({seed:seed,points:b.n,height:height,travel:b.cx-x,y:b.cy});
    }return out;
  })()`);
  console.log('SIZES',sizes);
  check('small and large residents round short and tall ledges',sizes.every(r=>r.travel>50&&r.y<(8-r.height)*32+5));
  const propulsion=await game(`(function(){
    var wave=SURFACE_SLIME_WAVE,out=[];
    try {
      for(var trial=0;trial<2;trial++){
        SURFACE_SLIME_WAVE=trial===0?wave:0;
        var b=window.__crawlSetup(1,0),x=b.cx;
        // The shell-sized bodies take shorter physical strides.
        window.__crawlStep(60,15);out.push(b.cx-x);
      }
    }finally{SURFACE_SLIME_WAVE=wave;}
    var b=window.__crawlSetup(1,0);
    for(var p=0;p<b.n;p++){b.py[p]-=150;b.oy[p]-=150;}
    jelloUpdateBody(b,JELLO_H);var start=b.cx;
    window.__crawlStep(60,.3);
    return {wave:out[0],still:out[1],airDrift:b.cx-start};
  })()`);
  console.log('PROPULSION',propulsion);
  check('terrain contact and travelling muscle waves produce the locomotion',propulsion.wave>60&&Math.abs(propulsion.still)<15&&Math.abs(propulsion.airDrift)<1);
  const wall=await game(`(function(){
    var b=window.__crawlSetup(1,7),start=b.cy;
    // Wait for the same knock-off height across the visitor size range.
    for(var second=0;second<70&&start-b.cy<60;second++)window.__crawlStep(60,1);
    var climbY=b.cy,climbing=b.surfaceSlime.climb,grips=b.surfaceSlime.contacts;
    // A real rig contact invokes jelloPlayerCouple, not a test-only detach.
    player.x=b.cx-PLAYER_W*.7;player.y=b.cy-PLAYER_H*.5;player.vx=145;player.vy=-20;
    jelloPlayerCouple(b,jelloStepH);
    var detached=b.surfaceSlime.detach>0&&!b.surfaceSlime.climb&&b.surfaceSlime.contacts===0;
    player.x=140*TILE;player.vx=player.vy=0;
    window.__crawlStep(60,.7);
    return {rise:start-climbY,climbing:climbing,grips:grips,detached:detached,fall:b.cy-climbY};
  })()`);
  console.log('WALL AND KNOCK',wall);
  check('a tall wall is climbable and a rig impact breaks adhesion and drops the body',wall.rise>55&&wall.climbing&&wall.grips>0&&wall.detached&&wall.fall>10);
  const jets=await game(`(function(){
    var b=window.__crawlSetup(-1,7);window.__crawlStep(60,25);
    var climbing=b.surfaceSlime.climb;
    player.x=b.cx-PLAYER_W/2;player.y=b.bboxT-PLAYER_H-14;
    player.thrusting=true;player.fuel=100;player.renderX=player.x;player.renderY=player.y;player.bodyTiltRender=0;
    updateJello(1/60);
    var detached=b.surfaceSlime.detach>0&&!b.surfaceSlime.climb;
    player.thrusting=false;
    return {climbing:climbing,detached:detached};
  })()`);
  console.log('JET RELEASE',jets);
  check('ordinary exhaust peels a climbing resident off the wall',jets.climbing&&jets.detached);
  const broken=await game(`(function(){
    var b=window.__crawlSetup(1,7);window.__crawlStep(60,22);
    var before=b.surfaceSlime.contacts,y=b.cy;
    for(var r=0;r<8;r++)for(var c=160;c<180;c++)world[r][c]=null;
    window.__crawlStep(60,.1);var after=b.surfaceSlime.contacts;
    window.__crawlStep(60,.7);
    return {before:before,after:after,fall:b.cy-y};
  })()`);
  console.log('REMOVED WALL',broken);
  check('mining supporting terrain releases every wall bond',broken.before>0&&broken.after===0&&broken.fall>10);
  // Enlarged views of actual simulated points, no renderer-only deformation.
  await game('window.__crawlSetup(1,3);window.__crawlStep(60,22)');
  for(let frame=0;frame<4;frame++){
    await game(`(function(){
      window.__crawlStep(60,.22);var b=window.__crawlBody;
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#303931';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.translate(canvas.width*.5,canvas.height*.55);ctx.scale(5,5);ctx.translate(-b.cx,-b.cy);
      ctx.fillStyle='#747864';ctx.fillRect(160*TILE,5*TILE,10*TILE,3*TILE);ctx.fillRect(140*TILE,8*TILE,40*TILE,TILE);
      surfaceSlimeDraw(b);ctx.restore();
    })()`);
    await screenshot('climb-'+frame);
  }
  check('no browser exceptions',errors.length===0);
  console.log('PASS contact-driven crawling, climbing and release; screenshots '+out);
} finally { cleanup(); }
