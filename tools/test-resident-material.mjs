// Resident material regression: momentum, passive response, support and physical release.
// Owns Chrome for Testing and closes the exact child process in finally.
// Run: node tools/test-resident-material.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8206), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-surface-slime-');
const out = process.env.DUMP || '/tmp/sluice-resident-material-qa';
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
  await game(`window.__materialSetup = function(radius, height) {
    resetJello(); skySlimes.length = 0; surfaceSlimesSeeded = true;
    var floor = 20 * TILE, x = 155 * TILE;
    for (var r = 0; r < 35; r++) for (var c = 135; c < 180; c++) {
      world[r][c] = r >= 20 ? {type:'stone', hp:100} : null;
      invalidateTerrainAround(r,c);
    }
    player.x = 136 * TILE; player.y = floor - PLAYER_H;
    player.vx = player.vy = 0; player.thrusting = false; player.onJello = false;
    player._surfaceRigSupported = false; player.jelloGroundT = 0;
    cam.x = x - screenW/2; cam.y = floor - screenH*.7;
    var b = surfaceSlimeBuild(x, floor - height, {id:500, seed:.46, r:radius});
    window.__materialBody = b;
    return b;
  };
  window.__materialMomentum = function(b) {
    var x=0,y=0,vx=0,vy=0,angular=0,inertia=0,energy=0;
    var scale=JELLO_TIMESCALE/(b._stepH || jelloStepH || JELLO_H*jelloImpulseScale());
    for(var p=0;p<b.n;p++){x+=b.px[p];y+=b.py[p];vx+=(b.px[p]-b.ox[p])*scale;vy+=(b.py[p]-b.oy[p])*scale;}
    x/=b.n;y/=b.n;vx/=b.n;vy/=b.n;
    for(p=0;p<b.n;p++){
      var dx=b.px[p]-x,dy=b.py[p]-y;
      var ux=(b.px[p]-b.ox[p])*scale-vx,uy=(b.py[p]-b.oy[p])*scale-vy;
      angular+=dx*uy-dy*ux;inertia+=dx*dx+dy*dy;energy+=ux*ux+uy*uy;
    }
    return {x:x,y:y,vx:vx,vy:vy,angular:angular,spin:angular/inertia,energy:energy};
  };
  window.__materialStep = function(fps, seconds) {
    var b=window.__materialBody, folds=0, embedded=0, minArea=Infinity, maxArea=0;
    for(var n=0;n<Math.round(fps*seconds);n++){
      surfaceSlimeTick(1/fps);updateJello(1/fps);
      for(var p=0;p<b.n;p++)if(jelloWorldSolidAt(b.px[p],b.py[p]))embedded++;
      var area=0;
      for(var t=0;t<b.cellN;t++){
        var a=b.cellA[t],c=b.cellB[t],d=b.cellC[t];
        var det=(b.px[c]-b.px[a])*(b.py[d]-b.py[a])-(b.py[c]-b.py[a])*(b.px[d]-b.px[a]);
        if(det<=0)folds++;area+=det*.5;
      }
      minArea=Math.min(minArea,area/b.restArea);maxArea=Math.max(maxArea,area/b.restArea);
    }
    return {folds:folds,embedded:embedded,minArea:minArea,maxArea:maxArea,
      finite:Array.from(b.px).concat(Array.from(b.py),Array.from(b.ox),Array.from(b.oy)).every(isFinite)};
  }`);

  const damping = await game(`(function(){
    var b=__materialSetup(24,250),h=JELLO_H*jelloImpulseScale();b._stepH=h;
    for(var p=0;p<b.n;p++){
      var x=b.px[p]-b.cx,y=b.py[p]-b.cy;
      b.ox[p]=b.px[p]-(70-2*y+.8*x)*h/JELLO_TIMESCALE;
      b.oy[p]=b.py[p]-(-30+2*x-.8*y)*h/JELLO_TIMESCALE;
    }
    var before=__materialMomentum(b);
    for(var n=0;n<240;n++)surfaceSlimeDampMotion(b,h);
    var after=__materialMomentum(b);
    return {linear:Math.hypot(after.vx-before.vx,after.vy-before.vy),
      angular:Math.abs(after.angular-before.angular)/Math.abs(before.angular),energy:after.energy/before.energy};
  })()`);
  console.log('VISCOSITY',damping);
  check('viscosity dissipates deformation without erasing translation or spin',
    damping.linear<1e-6 && damping.angular<1e-7 && damping.energy<.98);

  const air = await game(`(function(){
    var gravity=JELLO_GRAVITY,drag=JELLO_DAMPING,out=[];
    try{
      JELLO_GRAVITY=0;JELLO_DAMPING=1;
      for(var rate=0;rate<3;rate++){
        var fps=[30,60,144][rate],b=__materialSetup(24,250),h=JELLO_H*jelloImpulseScale();b._stepH=h;
        for(var p=0;p<b.n;p++){
          b.ox[p]=b.px[p]-(60-2*(b.py[p]-b.cy))*h/JELLO_TIMESCALE;
          b.oy[p]=b.py[p]-(2*(b.px[p]-b.cx))*h/JELLO_TIMESCALE;
        }
        var before=__materialMomentum(b),health=__materialStep(fps,1),after=__materialMomentum(b);
        out.push({fps:fps,travel:after.x-before.x,vertical:after.y-before.y,spin:after.spin,
          momentum:after.angular/before.angular,health:health});
      }
    }finally{JELLO_GRAVITY=gravity;JELLO_DAMPING=drag;}
    return out;
  })()`);
  console.log('FREE MOTION',air);
  check('an unsupported throw keeps its drift and tumble at 30/60/144 Hz',
    air.every(r=>Math.abs(r.travel-60)<1 && Math.abs(r.vertical)<1 && r.spin>1.3 && r.health.finite && !r.health.folds));

  const passive = await game(`(function(){
    var out=[];
    for(var rate=0;rate<3;rate++)for(var size=0;size<3;size++){
      var fps=[30,60,144][rate],radius=[22,24.5,27][size],b=__materialSetup(radius,140);
      var rest=Array.from(b.sRest),health=__materialStep(fps,10),startX=b.cx,startY=b.cy;
      var still=__materialStep(fps,5);
      out.push({fps:fps,radius:radius,health:health,still:still,drift:Math.hypot(b.cx-startX,b.cy-startY),
        restUnchanged:rest.every(function(v,i){return v===b.sRest[i];}),state:b.surfaceSlime.state});
    }
    return out;
  })()`);
  console.log('PASSIVE',passive);
  check('all sizes settle with stable material, legal cells and no autonomous travelling wave',passive.every(r=>
    r.health.finite && r.still.finite && !r.health.folds && !r.still.folds && !r.health.embedded && !r.still.embedded &&
    r.drift<2 && r.restUnchanged && r.still.minArea>.8 && r.still.maxArea<1.2));

  const removal = await game(`(function(){
    var b=__materialSetup(24,35);__materialStep(60,6);
    var y=b.cy,wasSleeping=b.sleeping;
    for(var r=20;r<28;r++)for(var c=152;c<159;c++)world[r][c]=null;
    var health=__materialStep(60,.4);
    return {drop:b.cy-y,wasSleeping:wasSleeping,health:health};
  })()`);
  console.log('REMOVED SUPPORT',removal);
  check('removing support wakes resting gel and gravity immediately takes over',removal.drop>30 && removal.health.finite && !removal.health.embedded);

  const release = await game(`(function(){
    var out=[];
    for(var mode=0;mode<2;mode++){
      var b=__materialSetup(24,180);
      surfaceSlimeGrabStart(b.cx+12,b.cy-8,'test');
      for(var n=0;n<30;n++){
        surfaceSlimeGrabMove(155*TILE+12+n*2.3,20*TILE-188-n*1.3,'test');
        surfaceSlimeTick(1/60);updateJello(1/60);
      }
      var before=Array.from(b.px).concat(Array.from(b.py),Array.from(b.ox),Array.from(b.oy));
      var momentum=__materialMomentum(b),x=b.cx;
      surfaceSlimeGrabEnd('test',!!mode);
      var after=Array.from(b.px).concat(Array.from(b.py),Array.from(b.ox),Array.from(b.oy));
      var health=__materialStep(60,.3);
      out.push({cancel:!!mode,unchanged:before.every(function(v,i){return v===after[i];}),
        vx:momentum.vx,travel:b.cx-x,health:health});
    }
    return out;
  })()`);
  console.log('RELEASE',release);
  check('release and cancellation preserve every material velocity without a bonus impulse',
    release.every(r=>r.unchanged && r.vx>20 && r.travel>5 && r.health.finite && !r.health.folds && !r.health.embedded));

  const invariance = await game(`(function(){
    var samples=[];
    for(var trial=0;trial<2;trial++){
      var b=__materialSetup(24,150);b.surfaceSlime.age=trial*123.45;
      jelloLaunchBody(b,80,-40,{h:JELLO_H*jelloImpulseScale(),spin:1});
      __materialStep(60,1.5);samples.push(Array.from(b.px).concat(Array.from(b.py)));
    }
    return Math.max.apply(null,samples[0].map(function(v,i){return Math.abs(v-samples[1][i]);}));
  })()`);
  check('the same physical initial conditions produce the same response regardless of animation age',invariance<1e-7);
  await game(`(function(){
    var b=__materialSetup(24,140),film=document.createElement('canvas');film.width=1920;film.height=520;
    var ink=film.getContext('2d');ink.fillStyle='#303931';ink.fillRect(0,0,1920,520);
    for(var shot=0;shot<12;shot++){
      __materialStep(120,shot? .1:.01);
      var saved=ctx;ctx=ink;
      ctx.save();ctx.translate(80+shot*160,455);ctx.scale(2.6,2.6);ctx.translate(-b.cx,-20*TILE);
      ctx.fillStyle='#747864';ctx.fillRect(b.cx-30,20*TILE,60,2);surfaceSlimeDraw(b);ctx.restore();ctx=saved;
    }
    window.__materialFilm=film.toDataURL('image/png');render();
  })()`);
  const film=await ev('window.__materialFilm');
  fs.writeFileSync(path.join(out,'drop-strip.png'),Buffer.from(film.split(',')[1],'base64'));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({damping,air,passive,removal,release,invariance},null,2));
  check('no browser exceptions',errors.length===0);
  console.log('PASS resident material; report and contact strip '+out);
} finally { cleanup(); }
