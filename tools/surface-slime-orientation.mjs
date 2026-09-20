// Material-relative orientation, variable gait and googly-eye regression.
// Run: node tools/surface-slime-orientation.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8203), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-slime-orientation-');
const out = process.env.DUMP || '/tmp/sluice-orientation-qa';
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
  await game(`window.__orientationSetup = function(seed){
    resetJello();
    for(var r=0;r<12;r++)for(var c=120;c<195;c++){
      world[r][c]=r>=8?{type:'stone',hp:100}:null;
      invalidateTerrainAround(r,c);
    }
    var x=156*TILE,b=surfaceSlimeBuild(x,8*TILE-34,{id:500,seed:seed,home:x});
    b.surfaceSlime.dir=1;b.surfaceSlime.state='crawl';b.surfaceSlime.timer=100;
    player.x=120*TILE;player.y=8*TILE-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;
    player.onJello=false;player.jelloGroundT=0;
    cam.x=x-screenW/2;cam.y=8*TILE-screenH*.6;
    window.__orientationBody=b;return b;
  };
  window.__orientationAngle=function(b){
    var dot=0,cross=0;
    for(var p=0;p<b.n;p++){
      var x=b.px[p]-b.cx,y=b.py[p]-b.cy;
      dot+=b.qx[p]*x+b.qy[p]*y;
      cross+=b.qx[p]*y-b.qy[p]*x;
    }
    return Math.atan2(cross,dot);
  };
  window.__orientationDifference=function(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));};
  window.__orientationStep=function(fps){
    var b=window.__orientationBody;
    cam.x=b.cx-screenW/2;
    surfaceSlimeTick(1/fps);updateJello(1/fps);
  };
  window.__orientationRoll=function(b,angle){
    var ca=Math.cos(angle),sa=Math.sin(angle),cx=b.cx,cy=b.cy;
    for(var p=0;p<b.n;p++){
      var x=b.px[p]-cx,y=b.py[p]-cy,ox=b.ox[p]-cx,oy=b.oy[p]-cy;
      b.px[p]=cx+ca*x-sa*y;b.py[p]=cy+sa*x+ca*y;
      b.ox[p]=cx+ca*ox-sa*oy;b.oy[p]=cy+sa*ox+ca*oy;
    }
    jelloUpdateBody(b,jelloStepH||JELLO_H);
    var shift=8*TILE-1-b.bboxB;
    for(p=0;p<b.n;p++){b.py[p]+=shift;b.oy[p]+=shift;}
    jelloUpdateBody(b,jelloStepH||JELLO_H);
    surfaceSlimeDetach(b,.45);
  }`);

  // The independent least-squares fit follows actual material points, not the
  // reported motor angle or a renderer transform. A restored birth pose fails.
  const rolls=await game(`(function(){
    var out=[];
    for(var rate=0;rate<3;rate++)for(var turn=0;turn<3;turn++){
      var fps=[30,60,144][rate],angle=[Math.PI*.5,Math.PI,Math.PI*1.37][turn];
      var b=window.__orientationSetup(.4);
      b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
      for(var n=0;n<fps*.5;n++)window.__orientationStep(fps);
      window.__orientationRoll(b,angle);
      var startAngle=window.__orientationAngle(b),firstActive=null,firstX=null;
      var recoveryMax=0,maxJump=0,lastAngle=startAngle,finite=true,embedded=0,gripFrames=0;
      var reportedError=0,trail=[];
      for(n=0;n<fps*6;n++){
        window.__orientationStep(fps);
        var m=b.surfaceSlime,material=window.__orientationAngle(b);
        maxJump=Math.max(maxJump,Math.abs(window.__orientationDifference(material,lastAngle)));
        lastAngle=material;
        if(m.drive&&!m.detach){
          if(firstActive===null){firstActive=n/fps;firstX=b.cx;}
          if(n/fps-firstActive<1.5)recoveryMax=Math.max(recoveryMax,Math.abs(window.__orientationDifference(material,startAngle)));
        }
        if(m.contacts>0)gripFrames++;
        if(isFinite(m.materialAngle))reportedError=Math.max(reportedError,Math.abs(window.__orientationDifference(material,m.materialAngle)));
        for(var p=0;p<b.n;p++){
          if(!isFinite(b.px[p]+b.py[p]+b.ox[p]+b.oy[p]))finite=false;
          if(jelloWorldSolidAt(b.px[p],b.py[p]))embedded++;
        }
        if(n%fps===0)trail.push({t:n/fps,angle:material,x:b.cx,state:m.state,reorient:m.reorient});
      }
      out.push({fps:fps,roll:angle,startAngle:startAngle,endAngle:window.__orientationAngle(b),
        reportedAngle:b.surfaceSlime.materialAngle,reportedError:reportedError,
        firstActive:firstActive,travel:firstX===null?0:b.cx-firstX,recoveryMax:recoveryMax,
        maxJump:maxJump,finite:finite,embedded:embedded,gripFrames:gripFrames,trail:trail});
    }return out;
  })()`);
  console.log('ROLLED MATERIAL',JSON.stringify(rolls,null,2));
  check('rolled material stays finite and outside terrain at 30/60/144 Hz',rolls.every(r=>r.finite&&r.embedded===0));
  check('every rolled orientation resumes contact-driven crawling',rolls.every(r=>r.firstActive!==null&&r.firstActive<3&&r.gripFrames>r.fps&&Math.abs(r.travel)>12));
  check('recovery does not restore the original material side to the floor',rolls.every(r=>r.recoveryMax<1.05&&r.maxJump<.38));
  check('reported material angle follows the actual material points',rolls.every(r=>Number.isFinite(r.reportedAngle)&&r.reportedError<.35));

  // A learned underside must also survive the transition from floor to wall
  // to ledge. Set only a travel intent; the motor must discover its own pose.
  const rolledLedges=await game(`(function(){
    var out=[];
    for(var trial=0;trial<3;trial++){
      var angle=[Math.PI*.5,Math.PI,Math.PI*1.37][trial],b=window.__orientationSetup(.4);
      var edge=160*TILE,top=5*TILE,start=edge-65,shift=start-b.cx;
      for(var r=5;r<8;r++)for(var c=160;c<195;c++){
        world[r][c]={type:'stone',hp:100};invalidateTerrainAround(r,c);
      }
      for(var p=0;p<b.n;p++){b.px[p]+=shift;b.ox[p]+=shift;}
      jelloUpdateBody(b,jelloStepH||JELLO_H);b.surfaceSlime.home=start;
      b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
      for(var n=0;n<30;n++)window.__orientationStep(60);
      window.__orientationRoll(b,angle);
      var startAngle=window.__orientationAngle(b),learnedPose=null,intentSet=false;
      var crossedAt=null,finite=true,embedded=0,sawClimb=false,sawTopGrip=false,trail=[];
      for(n=0;n<60*30;n++){
        var m=b.surfaceSlime;
        if(!intentSet&&!m.detach&&!m.reorient){
          m.dir=1;m.state='crawl';m.timer=60;intentSet=true;learnedPose=m.poseAngle;
        }
        window.__orientationStep(60);
        sawClimb=sawClimb||m.climb;sawTopGrip=sawTopGrip||m.topGrip;
        for(p=0;p<b.n;p++){
          if(!isFinite(b.px[p]+b.py[p]+b.ox[p]+b.oy[p]))finite=false;
          if(jelloWorldSolidAt(b.px[p],b.py[p]))embedded++;
        }
        if(n%120===0)trail.push({t:n/60,x:b.cx,y:b.cy,state:m.state,
          pose:m.poseAngle,material:window.__orientationAngle(b),topGrip:m.topGrip});
        if(b.cx>edge+18&&b.cy<top-4){crossedAt=n/60;break;}
      }
      out.push({roll:angle,startAngle:startAngle,learnedPose:learnedPose,
        crossedAt:crossedAt,x:b.cx,y:b.cy,finite:finite,embedded:embedded,
        sawClimb:sawClimb,sawTopGrip:sawTopGrip,trail:trail});
    }return out;
  })()`);
  console.log('ROLLED THREE-TILE LEDGES',JSON.stringify(rolledLedges,null,2));
  check('quarter, half and arbitrary rolls climb and cross a three-tile ledge within 30 seconds',rolledLedges.every(r=>r.crossedAt!==null&&r.crossedAt<30&&r.sawClimb));
  check('rolled ledge climbing stays finite and outside terrain',rolledLedges.every(r=>r.finite&&r.embedded===0));

  // Let the normal decision timer choose successive gaits. Do not directly
  // call a randomizer or manufacture different parameters in the fixture.
  const gaits=await game(`(function(){
    var out=[];
    for(var trial=0;trial<3;trial++){
      var seed=[.08,.46,.84][trial],b=window.__orientationSetup(seed),samples=[];
      b.surfaceSlime.timer=.1;
      for(var n=0;n<60*32;n++){
        window.__orientationStep(60);
        if(n%30===0){var m=b.surfaceSlime;samples.push({t:n/60,speed:m.gaitSpeed,amplitude:m.gaitAmplitude,length:m.gaitLength,state:m.state});}
      }
      out.push({seed:seed,samples:samples});
    }return out;
  })()`);
  const gaitRanges=gaits.map(g=>({seed:g.seed,...Object.fromEntries(['speed','amplitude','length'].map(key=>{
    const values=g.samples.map(s=>s[key]);
    return [key,{min:Math.min(...values),max:Math.max(...values),finite:values.every(Number.isFinite)}];
  }))}));
  console.log('NATURAL GAIT RANGES',JSON.stringify(gaitRanges,null,2));
  check('successive natural gaits vary their wave speed, amplitude and length',gaitRanges.every(g=>['speed','amplitude','length'].every(k=>g[k].finite&&g[k].max-g[k].min>1e-3)));
  check('different individuals do not repeat the same gait sequence',new Set(gaits.map(g=>JSON.stringify(g.samples.map(s=>[s.speed,s.amplitude,s.length])))).size===gaits.length);

  const pupils=await game(`(function(){
    var out=[];
    for(var trial=0;trial<3;trial++){
      var fps=[30,60,144][trial],b=window.__orientationSetup(.46);
      b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
      for(var n=0;n<fps;n++)window.__orientationStep(fps);
      var e=b.surfaceSlime.eye;
      // Hold the glance still only during the launch so a glance cannot
      // impersonate inertia. The next fixture uses unmodified natural glances.
      e.x=e.y=e.vx=e.vy=e.bodyVX=e.bodyVY=e.gazeX=e.gazeY=0;e.glance=100;
      jelloLaunchBody(b,240,-140);
      var maxOffset=0,maxSpeed=0,minLaunchX=0,finite=true;
      for(n=0;n<fps*4;n++){
        if(n===Math.floor(fps*1.2))window.__orientationRoll(b,Math.PI*.73);
        window.__orientationStep(fps);e=b.surfaceSlime.eye;
        maxOffset=Math.max(maxOffset,Math.hypot(e.x,e.y));
        maxSpeed=Math.max(maxSpeed,Math.hypot(e.vx,e.vy));
        if(n<fps*.25)minLaunchX=Math.min(minLaunchX,e.x);
        if(![e.x,e.y,e.vx,e.vy,e.anchorX,e.anchorY,e.bodyVX,e.bodyVY].every(isFinite))finite=false;
      }
      var still={seed:.46},stillMax=0,stillFinite=true;
      for(n=0;n<fps*20;n++){
        surfaceSlimeEyeTick(still,100,100,27,1/fps,null,null);
        var se=still.eye;stillMax=Math.max(stillMax,Math.hypot(se.x,se.y));
        if(![se.x,se.y,se.vx,se.vy].every(isFinite))stillFinite=false;
      }
      out.push({fps:fps,maxOffset:maxOffset,maxSpeed:maxSpeed,minLaunchX:minLaunchX,
        finite:finite,stillMax:stillMax,stillFinite:stillFinite});
    }return out;
  })()`);
  console.log('PUPIL INERTIA AND CUP BOUNDS',JSON.stringify(pupils,null,2));
  check('throws and rapid rolls move the loose pupil opposite acceleration',pupils.every(p=>p.minLaunchX<-.01&&p.maxOffset>.03&&p.maxSpeed>.1));
  check('thrown pupils stay finite inside the eye cup at 30/60/144 Hz',pupils.every(p=>p.finite&&p.maxOffset<=.17500001));
  check('natural idle glances remain finite inside the eye cup',pupils.every(p=>p.stillFinite&&p.stillMax<=.17500001&&p.stillMax>.02));

  // This final view deliberately rolls the body rather than rotating canvas.
  await game('window.__orientationSetup(.46);window.__orientationRoll(window.__orientationBody,Math.PI*1.37)');
  for(let frame=0;frame<4;frame++){
    await game(`(function(){
      for(var n=0;n<30;n++)window.__orientationStep(60);var b=window.__orientationBody;
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#303931';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.translate(canvas.width*.5,canvas.height*.55);ctx.scale(6,6);ctx.translate(-b.cx,-b.cy);
      ctx.fillStyle='#747864';ctx.fillRect(120*TILE,8*TILE,75*TILE,TILE);
      surfaceSlimeDraw(b);ctx.restore();
    })()`);
    await screenshot('rolled-crawl-'+frame);
  }
  check('no browser exceptions',errors.length===0);
  console.log('PASS material-relative orientation and varied crawling; screenshots '+out);
} finally { cleanup(); }
