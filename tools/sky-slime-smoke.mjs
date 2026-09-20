// Sky visitor physics and rendering regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/sky-slime-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8184), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-sky-slime-');
const out = process.env.DUMP || '/tmp/sluice-sky-slime-qa';
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
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimeReset();skySlimeNext=100000;ENABLE_BATH=false');
  await game(`(function(){
    var x=(DECK_LEFT_COL-4)*TILE;
    player.x=x-110;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=0;player.vy=0;
    player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();
    var s=skySlimeFresh(x,SKY_ROWS*TILE-25);s.r=25;s.entry=0;s.settled=true;s._ground=true;skySlimes.push(s);
    var b=skySlimeFresh(x+85,SKY_ROWS*TILE-140);b.entry=0;b.vy=200;skySlimes.push(b);render();
  })()`);
  await screenshot('surface');
  await game(`(function(){
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#303931';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.scale(3,3);
    for(var i=0;i<6;i++){
      var s=skySlimeFresh(65+i*60,105);s.seed=i*.163+.05;s.r=25;s.entry=0;s.eyeSize=.41;s.angle=i*.61;s.pupilX=(i%3-1)*2;s.pupilY=3.5;
      s.squash=i===4?.11:0;s._ground=true;skySlimeDrawBody(s);
    }
    ctx.restore();
  })()`);
  await screenshot('crust-and-eyes');
  // Actual game update, with normal drive input, must transfer rig motion.
  check('driving the rig kicks a resting visitor',await game(`(function(){
    skySlimes.length=1;var s=skySlimes[0];s.x=player.x+PLAYER_W+42;s.y=SKY_ROWS*TILE-s.r;s.vx=s.vy=s.spin=0;
    var before=s.x;keys.ArrowRight=true;
    for(var n=0;n<45;n++){update(1/60);skySlimeTick(1/60);}
    keys.ArrowRight=false;render();return s.x>before+40 && s.vx>50;
  })()`));
  await screenshot('rig-contact');
  console.log('CONTACT',await game('skySlimes.map(function(s){return {x:s.x,y:s.y,vx:s.vx,vy:s.vy};})'));
  // A fixed drive + jet sequence uses the existing controls and no ball
  // steering. It must turn a ground pop into two separated aerial contacts.
  const aerial=await game(`(function(){
    var original=skySlimePlayer,frame=0,events=[],peak=Infinity,maxContactSnap=0;
    skySlimePlayer=function(s,rx,ry,vx,vy){
      var before=s.vy,drawX=player.renderX,drawY=player.renderY;original(s,rx,ry,vx,vy);
      maxContactSnap=Math.max(maxContactSnap,Math.hypot(player.renderX-drawX,player.renderY-drawY));
      if(s.vy<before-15 && (!events.length || frame-events[events.length-1].frame>4))
        events.push({frame:frame,air:!player.onGround,vy:s.vy});
    };
    try {
      ENABLE_BATH=true;skySlimeReset();skySlimeNext=100000;
      player.x=(DECK_LEFT_COL-4)*TILE-110;player.y=SKY_ROWS*TILE-PLAYER_H;
      player.vx=player.vy=0;player.lastMoveU=player.lastMoveR=false;player.onGround=true;
      player.renderX=player.x;player.renderY=player.y;
      player.thrustSpool=0;player.jetPulse=0;player.fuel=100;
      var b=skySlimeFresh(player.x+110,SKY_ROWS*TILE-25);b.r=25;b.spin=0;b.entry=0;b.seed=.3;skySlimes.push(b);
      keys.ArrowRight=true;
      for(frame=0;frame<66;frame++){
        keys.ArrowUp=frame>=26 && frame<50;
        update(1/60);skySlimeTick(1/60);updateCamera();peak=Math.min(peak,b.y);
      }
      render();return {hits:events,height:SKY_ROWS*TILE-25-peak,playing:b.playing,maxContactSnap:maxContactSnap};
    } finally {skySlimePlayer=original;keys.ArrowUp=keys.ArrowRight=false;ENABLE_BATH=false;}
  })()`);
  console.log('AERIAL',aerial);
  check('ordinary drive and jet controls can chain two aerial contacts',aerial.playing&&aerial.height>60&&aerial.hits.filter(h=>h.air).length>=2);
  check('dribble contacts preserve continuous sprite motion',aerial.maxContactSnap<1);
  await screenshot('aerial');
  // Actual UP input and a moving pass must create pressure without contact.
  const jets=await game(`(function(){
    var original=skySlimePlayer,contacts=0,results=[];
    skySlimePlayer=function(s,rx,ry,vx,vy){
      var beforeX=s.vx,beforeY=s.vy;original(s,rx,ry,vx,vy);
      if(Math.hypot(s.vx-beforeX,s.vy-beforeY)>0.001)contacts++;
    };
    try {
      for(var pass=0;pass<2;pass++){
        skySlimeReset();skySlimeNext=100000;ENABLE_BATH=false;contacts=0;
        var x=(DECK_LEFT_COL-4)*TILE;
        player.x=x-26;player.y=SKY_ROWS*TILE-75;player.vx=pass?200:0;player.vy=0;
        player.renderX=player.x;player.renderY=player.y;player.lastMoveU=player.lastMoveR=false;
        player.onGround=false;player.flightTilt=player.flightTiltVel=player.bodyTiltRender=0;
        player.thrustSpool=player.jetForce=0;player.fuel=100;
        var b=skySlimeFresh(x,SKY_ROWS*TILE-25);b.r=25;b.spin=0;b.entry=0;skySlimes.push(b);
        keys.ArrowLeft=false;keys.ArrowRight=!!pass;keys.ArrowUp=true;
        var peakSpeed=0,peakSquash=0;
        for(var frame=0;frame<24;frame++){
          update(1/60);updateCamera();updateRocketPlume(1/60);skySlimeTick(1/60);
          peakSpeed=Math.max(peakSpeed,Math.abs(b.vx));peakSquash=Math.max(peakSquash,b.squash);
          if(pass&&frame===8)render();
        }
        results.push({flyover:!!pass,dx:b.x-x,peakSpeed:peakSpeed,peakSquash:peakSquash,
          playing:b.playing,contacts:contacts,force:player.jetForce});
      }
      return results;
    } finally {skySlimePlayer=original;keys.ArrowUp=keys.ArrowRight=false;}
  })()`);
  console.log('JETS',jets);
  check('live jets roll and compress a guest without touching it',jets.every(j=>j.contacts===0&&j.playing&&j.peakSpeed>8&&j.peakSquash>.025&&j.force>0)&&jets[0].dx>5);
  await screenshot('jet-wash');
  await game('player.lastMoveU=false;player.thrusting=false;player.thrustSpool=player.jetForce=0;clearRocketPlume()');
  // Use the real player gravity, terrain sweep, support checks and jet
  // controls: a unit-only circle solver would miss the ledge-fall nudge.
  const landings=await game(`(function(){
    var results=[];
    for(var fps of [30,60,144]){
      skySlimeReset();skySlimeNext=100000;ENABLE_BATH=false;
      var x=(DECK_LEFT_COL-4)*TILE, floor=SKY_ROWS*TILE;
      Object.assign(player,{x:x-PLAYER_W/2,y:floor-PLAYER_H-140,vx:0,vy:0,
        renderX:x-PLAYER_W/2,renderY:floor-PLAYER_H-140,onGround:false,onJello:false,
        thrustSpool:0,jetForce:0,jetPulse:0,drillGlideT:0,fuel:100,
        lastMoveU:false,lastMoveR:false,lastMoveL:false});
      var b=skySlimeFresh(x,floor-25);b.r=25;b.spin=0;b.entry=0;b.playing=true;skySlimes.push(b);
      var overlap=0,rebound=0,restSpeed=0;
      for(var frame=0;frame<fps*10;frame++){
        update(1/fps);skySlimeTick(1/fps);
        var c=skySlimeRigContact(b,player.x,player.y);
        overlap=Math.max(overlap,c?c.depth:0);
        rebound=Math.max(rebound,-player.vy);
        if(frame>fps*9)restSpeed=Math.max(restSpeed,Math.abs(player.vy));
      }
      updateCamera();render();
      var supported=player.onGround&&skySlimeSupportsRig(player.x,player.y),startY=player.y;
      keys.ArrowUp=true;
      for(var frame=0;frame<fps*.4;frame++){update(1/fps);skySlimeTick(1/fps);}
      keys.ArrowUp=false;
      results.push({fps:fps,overlap:overlap,rebound:rebound,restSpeed:restSpeed,
        supported:supported,takeoff:startY-player.y,airborne:!player.onGround});
    }
    return results;
  })()`);
  console.log('LANDINGS',landings);
  check('landing cushions and settles on the guest at 30, 60 and 144 Hz',
    landings.every(l=>l.overlap<.05&&l.rebound>20&&l.rebound<55&&l.restSpeed<2&&l.supported));
  check('normal jets lift off a resting guest',landings.every(l=>l.takeoff>20&&l.airborne));
  await screenshot('landing-rest');
  await game('player.lastMoveU=false;player.thrusting=false;player.thrustSpool=player.jetForce=0;clearRocketPlume()');
  check('frozen flight clears stored thrust',await game(`(function(){
    var old=shopOpen;try{shopOpen=true;player.jetForce=880;update(1/60);return player.jetForce===0;}
    finally{shopOpen=old;}
  })()`));
  // Fill a real stone-lined basin next to the active camera and run the
  // normal CPU/GPU water update. All particles are real solver particles.
  await game(`(function(){
    skySlimes.length=0;
    for(var r=SKY_ROWS-1;r<=SKY_ROWS+7;r++)for(var c=140;c<=149;c++){
      world[r][c]=r===SKY_ROWS+7||c===140||c===149?{type:'stone',hp:100}:null;
      invalidateTerrainAround(r,c);lightingOnClear(r,c);
    }
    for(var p=liquidCount-1;p>=0;p--)removeLiquidParticle(p);
    var left=141*TILE+2,right=149*TILE-2,top=(SKY_ROWS+2)*TILE,bottom=(SKY_ROWS+7)*TILE-2;
    for(var y=top;y<bottom;y+=1.25)for(var x=left;x<right;x+=1.25)addLiquidParticle(0,x,y,0,0,0);
    player.x=139*TILE;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;
    player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();

  })()`);
  await game(`(async function(){for(var n=0;n<240;n++){liquidToolSync();updateLiquids(1/60);if(n%2===0){render();await new Promise(requestAnimationFrame);}}var b=skySlimeFresh(145*TILE,(SKY_ROWS+2)*TILE-180);b.vy=350;b.vx=0;b.r=25;b.entry=0;skySlimes.push(b);})()`);
  const before=await game('liquidCount');
  const water=await game(`(async function(){
    var b=skySlimes[0],maxWet=0,maxY=b.y,speeds=[];
    for(var n=0;n<1080;n++){
      liquidToolSync();skySlimeTick(1/60);updateLiquids(1/60);
      maxWet=Math.max(maxWet,b.wet);maxY=Math.max(maxY,b.y);
      if(n%90===0)speeds.push({y:Math.round(b.y),vy:Math.round(b.vy),wet:+b.wet.toFixed(2)});
      if(n%2===0){render();await new Promise(requestAnimationFrame);}
    }
    render();return {maxWet:maxWet,maxY:maxY,speeds:speeds,y:b.y,vy:b.vy,wet:b.wet,count:liquidCount,gpu:liquidWGPU&&liquidWGPU.simActive,floor:(SKY_ROWS+7)*TILE,surface:liquidSampleBall(b.x,b.y,b.r).surface};
  })()`);
  console.log('WATER',water);
  await screenshot('water-bob');
  check('real pool arrests the plunge and supports the ball',water.maxWet>.65&&water.maxY<water.floor-25&&water.y<water.surface+45&&Math.abs(water.vy)<55);
  check('visitor interaction preserves liquid mass',water.count===before);
  check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
