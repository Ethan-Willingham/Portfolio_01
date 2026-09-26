// Physical continuity, deliberate pacing and intent-transition regression.
// Run: node tools/surface-slime-smooth.mjs. SLIME_BUNDLE supports baseline comparison.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8215), debug = port + 1000;

const selection = process.env.SLIME_CASE || 'all';
assert.ok(['all', 'ground', 'transition', 'wall'].includes(selection), 'known SLIME_CASE');
const profile = fs.mkdtempSync('/tmp/sluice-slime-smooth-');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = process.env.SLIME_BUNDLE ? fs.readFileSync(process.env.SLIME_BUNDLE,'utf8') : data.toString(), i = src.lastIndexOf('})();');
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
let ws, watchdog, seq=0; const pending=new Map(), errors=[];
function cleanup() { clearTimeout(watchdog);try {ws?.close();} catch {} chrome.kill(); server.close(); try {fs.rmSync(profile,{recursive:true,force:true});} catch {} }
process.on('SIGINT', () => {cleanup();process.exit(130);});
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__bathTest(${JSON.stringify(source)})`);
const failures=[];
function check(label, condition) { if(!condition)failures.push(label);console.log((condition?'PASS ':'FAIL ')+label); }
watchdog=setTimeout(()=>{console.error('FAIL browser regression exceeded three minutes');cleanup();process.exit(1);},180000);
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
  await game(`window.__smoothSetup=function(kind,fps,seed){
    resetJello();
    var floor=kind==='wall'?20:8,wall=160*TILE;
    for(var r=0;r<32;r++)for(var c=115;c<205;c++){
      var solid=r>=floor||kind==='wall'&&r>=1&&c>=160;
      world[r][c]=solid?{type:'stone',hp:100}:null;invalidateTerrainAround(r,c);
    }
    var x=kind==='wall'?wall-42:150*TILE;
    var b=surfaceSlimeBuild(x,floor*TILE-36,{id:500,seed:seed,home:x});
    b.surfaceSlime.dir=1;b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
    player.x=120*TILE;player.y=floor*TILE-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;
    player.onJello=false;player.jelloGroundT=0;
    window.__smoothBody=b;
    for(var n=0;n<fps*2;n++)window.__smoothStep(fps);
    b.surfaceSlime.state='crawl';b.surfaceSlime.timer=100;b.surfaceSlime.goalX=b.cx+TILE*12;
    return b;
  };
  window.__smoothStep=function(fps){
    var b=window.__smoothBody;
    cam.x=b.cx-screenW/2;cam.y=b.cy-screenH*.5;
    surfaceSlimeTick(1/fps);updateJello(1/fps);
  };
  window.__smoothHeal=jelloInversionHeal;
  jelloInversionHeal=function(b){
    var x=Array.from(b.px),y=Array.from(b.py);
    window.__smoothHeal(b);
    var shift=0;
    for(var p=0;p<b.n;p++)shift=Math.max(shift,Math.hypot(b.px[p]-x[p],b.py[p]-y[p]));
    b.__healMove=Math.max(b.__healMove||0,shift);
    b.__healCount=(b.__healCount||0)+(shift>.1?1:0);
  };
  window.__smoothRun=function(kind,fps,seed){
    var b=window.__smoothSetup(kind,fps,seed),m=b.surfaceSlime;
    var r={kind:kind,fps:fps,seed:seed,finite:true,embedded:0,
      maxPointJump:0,maxPointSpeed:0,maxCenterSpeed:0,maxCenterJump:0,maxPointAcceleration:0,
      stopFrames:0,frames:0,healFrames:0,maxHealMove:0,
      renderStops:0,maxRenderSpeed:0,renderChangedPhysics:false,renderFinite:true,
      maxInverted:0,maxTargetInverted:0,minTargetDet:1,maxRecover:0,maxSlip:0,gripBreaks:0,segments:[],trail:[]};
    var startX=b.cx,startY=b.cy,prevX=Array.from(b.px),prevY=Array.from(b.py),vx=[],vy=[],speeds=[],jumps=[],acc=[];
    var prevCx=b.cx,prevCy=b.cy,lastGrip=false,highY=b.cy,sampleBegin=3;
    var drawX=Array.from(b.px),drawY=Array.from(b.py);
    var seconds=kind==='wall'?30:24;
    for(var n=0;n<fps*seconds;n++){
      var elapsed=n/fps;
      if(kind==='transition'){
        if([7,10,16,18].some(function(t){return n===fps*t;}))r.segments.push({time:elapsed,x:b.cx,phase:m.phase,state:m.state});
        if(n===fps*7){m.state='idle';m.timer=100;}
        if(n===fps*10){m.state='crawl';m.timer=100;}
        if(n===fps*16){m.state='idle';m.timer=100;}
        if(n===fps*18){m.dir=-1;m.goalX=b.cx-TILE*12;m.state='crawl';m.timer=100;}
      }
      var previousAccum=jelloAccum;
      window.__smoothStep(fps);
      var physicalDt=Math.max(0,(1/fps*JELLO_TIMESCALE+previousAccum-jelloAccum)/JELLO_TIMESCALE);
      var physicalRate=physicalDt>0.000001?1/physicalDt:0;
      var centerJump=Math.hypot(b.cx-prevCx,b.cy-prevCy),maxJump=0,maxAcceleration=0;
      for(var p=0;p<b.n;p++){
        if(!isFinite(b.px[p]+b.py[p]+b.ox[p]+b.oy[p]))r.finite=false;
        if(jelloWorldSolidAt(b.px[p],b.py[p]))r.embedded++;
        var dx=b.px[p]-prevX[p],dy=b.py[p]-prevY[p],speed=Math.hypot(dx,dy)*fps;
        maxJump=Math.max(maxJump,Math.hypot(dx,dy));
        if(vx[p]!==undefined)maxAcceleration=Math.max(maxAcceleration,Math.hypot(dx*fps-vx[p],dy*fps-vy[p])*fps);
        prevX[p]=b.px[p];prevY[p]=b.py[p];vx[p]=dx*fps;vy[p]=dy*fps;
      }
      var beforeDrawX=Array.from(b.px),beforeDrawY=Array.from(b.py),cxBeforeDraw=b.cx,cyBeforeDraw=b.cy;
      var drawBody=typeof surfaceSlimeRenderBody==='function'?surfaceSlimeRenderBody(b):b,drawJump=0;
      for(p=0;p<b.n;p++){
        drawJump=Math.max(drawJump,Math.hypot(drawBody.px[p]-drawX[p],drawBody.py[p]-drawY[p]));
        drawX[p]=drawBody.px[p];drawY[p]=drawBody.py[p];
        if(!isFinite(drawX[p]+drawY[p]))r.renderFinite=false;
        if(b.px[p]!==beforeDrawX[p]||b.py[p]!==beforeDrawY[p])r.renderChangedPhysics=true;
      }
      if(b.cx!==cxBeforeDraw||b.cy!==cyBeforeDraw)r.renderChangedPhysics=true;
      if(elapsed>=sampleBegin){
        r.frames++;if(drawJump<.000001)r.renderStops++;
        r.maxRenderSpeed=Math.max(r.maxRenderSpeed,drawJump*fps);if(maxJump<.000001)r.stopFrames++;
        r.maxPointJump=Math.max(r.maxPointJump,maxJump);r.maxPointSpeed=Math.max(r.maxPointSpeed,maxJump*physicalRate);
        r.maxCenterJump=Math.max(r.maxCenterJump,centerJump);r.maxCenterSpeed=Math.max(r.maxCenterSpeed,centerJump*physicalRate);
        r.maxPointAcceleration=Math.max(r.maxPointAcceleration,maxAcceleration);
        speeds.push(centerJump*fps);jumps.push(maxJump);acc.push(maxAcceleration);
        var targetInverted=0;
        for(var tri=0;tri<b.triN;tri++){
          var a=b.triA[tri],bb=b.triB[tri],c=b.triC[tri];
          var x1=b.muscleX[bb]-b.muscleX[a],y1=b.muscleY[bb]-b.muscleY[a];
          var x2=b.muscleX[c]-b.muscleX[a],y2=b.muscleY[c]-b.muscleY[a];
          var inv=b.triDmInv,offset=tri*4;
          var f00=x1*inv[offset]+x2*inv[offset+2],f01=x1*inv[offset+1]+x2*inv[offset+3];
          var f10=y1*inv[offset]+y2*inv[offset+2],f11=y1*inv[offset+1]+y2*inv[offset+3];
          var det=f00*f11-f01*f10;r.minTargetDet=Math.min(r.minTargetDet,det);
          if(det<-.02)targetInverted++;
        }
        r.maxTargetInverted=Math.max(r.maxTargetInverted,targetInverted);
        r.maxInverted=Math.max(r.maxInverted,b._invN||0);r.maxRecover=Math.max(r.maxRecover,b._recoverT||0);
        if(kind==='wall'&&startY-b.cy>40){
          highY=Math.min(highY,b.cy);r.maxSlip=Math.max(r.maxSlip,b.cy-highY);
          if(lastGrip&&!m.contacts)r.gripBreaks++;lastGrip=!!m.contacts;
        }
      }
      if(n%fps===0)r.trail.push({t:elapsed,x:b.cx-startX,rise:startY-b.cy,phase:m.phase,
        state:m.state,contacts:m.contacts,power:m.power,inv:b._invN||0,heal:b.__healMove||0,
        maxJump:maxJump,angle:m.angle,pose:m.poseAngle});
      prevCx=b.cx;prevCy=b.cy;
    }
    r.segments.push({time:seconds,x:b.cx,phase:m.phase,state:m.state});
    function quantile(values,q){values.sort(function(a,b){return a-b;});return values[Math.floor((values.length-1)*q)];}
    r.meanSpeed=speeds.reduce(function(a,b){return a+b;},0)/speeds.length;
    r.p99PointJump=quantile(jumps,.99);r.p99PointAcceleration=quantile(acc,.99);
    r.healFrames=b.__healCount||0;r.maxHealMove=b.__healMove||0;r.travel=b.cx-startX;r.rise=startY-b.cy;
    return r;
  }`);
  const results=await game(`(function(){var out=[];
    for(var kind=0;kind<3;kind++)for(var rate=0;rate<3;rate++){
      if(${JSON.stringify(selection)}==='all'||${JSON.stringify(selection)}===['ground','transition','wall'][kind])out.push(window.__smoothRun(['ground','transition','wall'][kind],[30,60,144][rate],.46));
    }
    if(${JSON.stringify(selection)}==='all'||${JSON.stringify(selection)}==='ground')out.push(window.__smoothRun('ground',60,.84));
    if(${JSON.stringify(selection)}==='all'||${JSON.stringify(selection)}==='wall')out.push(window.__smoothRun('wall',60,.84));
    return out;
  })()`);
  console.log('PHYSICAL CONTINUITY',JSON.stringify(results.map(({trail,...r})=>r),null,2));
  if(process.env.SLIME_TRACE)for(const r of results)console.log('TRACE',JSON.stringify(r));
  check('normal movement stays finite and outside solid terrain',results.every(r=>r.finite&&r.embedded===0));
  check('muscles keep every target cell facing outward',results.every(r=>r.maxTargetInverted===0&&r.minTargetDet>=.19));
  check('normal strides never trigger a visible emergency shape correction',results.every(r=>r.maxHealMove<=1));
  check('actual skin motion has no large one-frame impulses',results.every(r=>r.maxPointSpeed<=200));
  check('drawing remains finite and never changes physical points or the physical centroid',results.every(r=>r.renderFinite&&!r.renderChangedPhysics));
  check('moving residents have no repeated display frames at 144 Hz',results.filter(r=>r.fps===144&&r.kind!=='transition').every(r=>r.renderStops===0));
  check('ground progress is deliberate, between three and nine pixels per second',results.filter(r=>r.kind==='ground').every(r=>r.travel/24>=3&&r.travel/24<=9));
  check('wall crawling makes sustained upward progress without losing its grip',results.filter(r=>r.kind==='wall').every(r=>r.rise>=35&&r.gripBreaks===0&&r.maxSlip<=8));
  check('starts, rests and a deliberate turn preserve movement in the requested direction',results.filter(r=>r.kind==='transition').every(r=>r.segments[2].x-r.segments[1].x>10&&r.segments[3].x-r.segments[4].x>10));
  if(selection==='all'){
    const intentions=await game(`(function(){
      var out=[];
      for(var trial=0;trial<2;trial++){
        var b=window.__smoothSetup('ground',60,[.08,.84][trial]),m=b.surfaceSlime;
        m.state='idle';m.timer=.01;
        var r={seed:m.seed,turns:0,longestWalk:0,idleSeconds:0,span:0},lastDir=m.dir,walking=0,minX=b.cx,maxX=b.cx;
        for(var n=0;n<60*32;n++){
          window.__smoothStep(60);
          if(m.dir!==lastDir)r.turns++;
          lastDir=m.dir;
          if(m.state==='crawl'){walking+=1/60;r.longestWalk=Math.max(r.longestWalk,walking);}
          else {walking=0;r.idleSeconds+=1/60;}
          minX=Math.min(minX,b.cx);maxX=Math.max(maxX,b.cx);
        }
        r.span=maxX-minX;out.push(r);
      }
      return out;
    })()`);
    console.log('AUTONOMOUS INTENT',JSON.stringify(intentions));
    check('residents pursue a direction for at least ten seconds before resting or turning',intentions.every(r=>r.longestWalk>=10&&r.turns<=2&&r.idleSeconds<12&&r.span>50));
  }
  check('no browser exceptions',errors.length===0);
  if(process.env.SLIME_RESULT)fs.writeFileSync(process.env.SLIME_RESULT,JSON.stringify(results,null,2));
  assert.equal(failures.length,0,failures.join('\n'));
} finally { cleanup(); }
