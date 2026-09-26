// Autonomous pit-edge caution, continuous snail adhesion and physical body-wave regression.
// Run: node tools/surface-slime-snail.mjs.
// SLIME_CASE=pit|shaft|crest|wall|wave narrows a run; SLIME_BUNDLE supports an A/B bundle.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8205), debug = port + 1000;
const selection=process.env.SLIME_CASE || 'all';
assert.ok(['all','pit','shaft','crest','wall','wave'].includes(selection),'known SLIME_CASE');
const profile = fs.mkdtempSync('/tmp/sluice-slime-snail-');
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
  await game(`window.__snailSetup=function(kind,dir,width,seed,roll){
    resetJello();
    var floor=kind==='wall'?18:8,edge=(dir>0?160:160+width)*TILE;
    for(var r=0;r<30;r++)for(var c=115;c<205;c++){
      var solid=r>=floor;
      if(kind==='pit'&&c>=160&&c<160+width&&r>=floor&&r<28)solid=false;
      if(kind==='wall'&&r>=1&&r<floor&&(dir>0?c>=160:c<160))solid=true;
      world[r][c]=solid?{type:'stone',hp:100}:null;
      invalidateTerrainAround(r,c);
    }
    if(kind==='wall')edge=160*TILE;
    var x=kind==='wave'?150*TILE:edge-dir*72;
    var b=surfaceSlimeBuild(x,floor*TILE-36,{id:500,seed:seed,home:x});
    b.surfaceSlime.dir=dir;b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
    player.x=120*TILE;player.y=floor*TILE-PLAYER_H;player.vx=player.vy=0;player.thrusting=false;
    player.onJello=false;player.jelloGroundT=0;
    window.__snailBody=b;window.__snailFloor=floor*TILE;window.__snailEdge=edge;
    for(var n=0;n<30;n++)window.__snailStep(60);
    if(roll){
      var ca=Math.cos(roll),sa=Math.sin(roll),cx=b.cx,cy=b.cy;
      for(var p=0;p<b.n;p++){
        var px=b.px[p]-cx,py=b.py[p]-cy,ox=b.ox[p]-cx,oy=b.oy[p]-cy;
        b.px[p]=cx+ca*px-sa*py;b.py[p]=cy+sa*px+ca*py;
        b.ox[p]=cx+ca*ox-sa*oy;b.oy[p]=cy+sa*ox+ca*oy;
      }
      jelloUpdateBody(b,JELLO_H);
      var shift=floor*TILE-1-b.bboxB;
      for(p=0;p<b.n;p++){b.py[p]+=shift;b.oy[p]+=shift;}
      jelloUpdateBody(b,JELLO_H);surfaceSlimeDetach(b,.35);
      for(n=0;n<60;n++)window.__snailStep(60);
    }
    b.surfaceSlime.dir=dir;b.surfaceSlime.state='crawl';b.surfaceSlime.timer=100;
    b.surfaceSlime.goalX=b.cx+dir*TILE*12;
    b.surfaceSlime.home=b.cx;
    return b;
  };
  window.__snailStep=function(fps){
    var b=window.__snailBody;
    cam.x=b.cx-screenW/2;cam.y=b.cy-screenH*.5;
    surfaceSlimeTick(1/fps);updateJello(1/fps);
  };
  window.__snailIntegrity=function(b,result){
    for(var p=0;p<b.n;p++){
      if(!isFinite(b.px[p]+b.py[p]+b.ox[p]+b.oy[p]))result.finite=false;
      if(jelloWorldSolidAt(b.px[p],b.py[p]))result.embedded++;
    }
  }`);

  if(selection==='all'||selection==='pit'){
    // Command one initial approach only. The normal brain is free to stop,
    // turn, bridge a narrow gap, or choose a new material side by itself.
    const pits=await game(`(function(){
      var results=[];
      for(var rate=0;rate<3;rate++)for(var dir=-1;dir<=1;dir+=2)for(var widthIndex=0;widthIndex<3;widthIndex++){
        var fps=[30,60,144][rate],width=[1,3,6][widthIndex];
        var seed=[.08,.46,.84][(rate+widthIndex)%3],roll=[0,Math.PI*.5,Math.PI*1.37][(rate+widthIndex)%3];
        var b=window.__snailSetup('pit',dir,width,seed,roll),edge=window.__snailEdge,floor=window.__snailFloor;
        var start=b.cx,r={fps:fps,dir:dir,width:width,seed:seed,roll:roll,radius:b.surfaceSlime.radius,
          finite:true,embedded:0,maxDepth:-Infinity,maxDownSpeed:0,maxBodyDownSpeed:0,maxAdvance:0,closest:Infinity,
          unsupported:0,turned:false,crossed:false,trail:[]};
        var unsupported=0,lastY=b.cy,ys=[b.cy],speedFrames=Math.ceil(fps*.1);
        for(var n=0;n<fps*35;n++){
          window.__snailStep(fps);
          r.maxDepth=Math.max(r.maxDepth,b.cy-floor);
          r.maxBodyDownSpeed=Math.max(r.maxBodyDownSpeed,(b.cy-lastY)*fps);lastY=b.cy;
          ys.push(b.cy);if(ys.length>speedFrames+1)ys.shift();
          var downSpeed=(b.cy-ys[0])*fps/(ys.length-1);
          // A supported squish on the safe bank is not a fall into the pit.
          // Check launch speed as soon as any actual skin reaches the void.
          if(b.bboxR>160*TILE&&b.bboxL<(160+width)*TILE)r.maxDownSpeed=Math.max(r.maxDownSpeed,downSpeed);
          r.maxAdvance=Math.max(r.maxAdvance,(b.cx-start)*dir);
          r.closest=Math.min(r.closest,(edge-b.cx)*dir);
          r.turned=r.turned||b.surfaceSlime.dir!==dir;
          r.crossed=r.crossed||(b.cx-edge)*dir>width*TILE;
          var overGap=b.cx>160*TILE&&b.cx<(160+width)*TILE;
          unsupported=overGap&&!b.surfaceSlime.contacts&&!jelloSupportedBelowTile(b)?unsupported+1/fps:0;
          r.unsupported=Math.max(r.unsupported,unsupported);
          window.__snailIntegrity(b,r);
          if(n%fps===0)r.trail.push({t:n/fps,x:Math.round((b.cx-edge)*dir),depth:Math.round(b.cy-floor),
            contacts:b.surfaceSlime.contacts,dir:b.surfaceSlime.dir,state:b.surfaceSlime.state});
        }
        r.endDepth=b.cy-floor;r.endX=(b.cx-edge)*dir;results.push(r);
      }
      return results;
    })()`);
    console.log('PIT APPROACHES',JSON.stringify(pits.map(({trail,...r})=>r),null,2));
    const failed=pits.filter(r=>!r.finite||r.embedded||r.closest>60||r.maxDepth>r.radius*.35||r.maxDownSpeed>135||r.unsupported>.4);
    for(const r of failed)console.log('PIT FAILURE TRACE',JSON.stringify(r));
    check('all pit fixtures actually approach the edge',pits.every(r=>r.closest<=60));
    check('one, three and six tile pits never produce an autonomous deep fall',pits.every(r=>r.maxDepth<=r.radius*.35));
    check('pit edges never launch the body down or leave it hanging in unsupported air',pits.every(r=>r.maxDownSpeed<=135&&r.unsupported<=.4));
    check('pit approaches remain finite and outside solid terrain',pits.every(r=>r.finite&&r.embedded===0));
  }

  if(selection==='all'||selection==='shaft'){
    const shafts=await game(`(function(){
      var results=[];
      for(var rate=0;rate<3;rate++){
        var fps=[30,60,144][rate],seed=[.08,.46,.84][rate];
        window.__snailSetup('wave',1,0,seed,0);resetJello();
        var b=surfaceSlimeBuild(160.5*TILE,8*TILE-36,{id:500,seed:seed,home:160.5*TILE});
        window.__snailBody=b;b.surfaceSlime.state='idle';b.surfaceSlime.timer=100;
        for(var n=0;n<fps*2;n++)window.__snailStep(fps);
        var start=b.cy,lastY=b.cy,lastPoints=Array.from(b.py);
        // Mine a one-tile neck directly underneath the resting body. The
        // wider cavern below makes this an open-bottom channel, the real
        // terrain shape that exposed legacy gap ejection in living slimes.
        for(var row=8;row<13;row++){world[row][160]=null;invalidateTerrainAround(row,160);}
        for(row=13;row<22;row++)for(var col=156;col<165;col++){
          world[row][col]=null;invalidateTerrainAround(row,col);
        }
        var r={fps:fps,seed:seed,finite:true,embedded:0,maxInitialSpeed:0,maxInitialPointDrop:0,
          quarterDrop:0,halfDrop:0,endDrop:0,enteredNeck:false,trail:[]};
        for(n=0;n<fps*3;n++){
          window.__snailStep(fps);
          var elapsed=(n+1)/fps;
          if(elapsed<=.25){
            r.maxInitialSpeed=Math.max(r.maxInitialSpeed,(b.cy-lastY)*fps);
            r.quarterDrop=b.cy-start;
          }
          if(elapsed<=.5)r.halfDrop=b.cy-start;
          for(var p=0;p<b.n;p++){
            if(elapsed<=.25)r.maxInitialPointDrop=Math.max(r.maxInitialPointDrop,b.py[p]-lastPoints[p]);
            if(b.px[p]>160*TILE&&b.px[p]<161*TILE&&b.py[p]>8*TILE+.1)r.enteredNeck=true;
            lastPoints[p]=b.py[p];
          }
          lastY=b.cy;window.__snailIntegrity(b,r);
          if(n%Math.max(1,Math.round(fps*.1))===0)r.trail.push({t:elapsed,drop:b.cy-start,contacts:b.surfaceSlime.contacts});
        }
        r.endDrop=b.cy-start;results.push(r);
      }
      return results;
    })()`);
    console.log('SHAFT MINED UNDER RESTING SLIME',JSON.stringify(shafts.map(({trail,...r})=>r),null,2));
    for(const r of shafts.filter(r=>r.maxInitialSpeed>170||r.maxInitialPointDrop>16||r.quarterDrop>20||r.halfDrop>85||!r.finite||r.embedded))console.log('SHAFT FAILURE TRACE',JSON.stringify(r));
    check('resting skin really enters the newly mined one-tile neck',shafts.every(r=>r.enteredNeck));
    check('open-bottom shafts never eject resting material down by a tile per frame',shafts.every(r=>r.maxInitialSpeed<=170&&r.maxInitialPointDrop<=16&&r.quarterDrop<=20&&r.halfDrop<=85));
    check('mined shafts retain finite material and solid terrain collisions',shafts.every(r=>r.finite&&r.embedded===0));
  }

  if(selection==='all'||selection==='crest'){
    const crests=await game(`(function(){
      var results=[];
      for(var rate=0;rate<3;rate++)for(var dir=-1;dir<=1;dir+=2){
        var fps=[30,60,144][rate],platform=rate===1?3:2,wall=160*TILE,top=8*TILE;
        var b=window.__snailSetup('wave',dir,0,.46,0);
        resetJello();
        for(var r=0;r<30;r++)for(var c=115;c<205;c++){
          var distance=((c+.5)*TILE-wall)*dir,solid;
          if(distance<0)solid=r>=11;
          else if(distance<platform*TILE)solid=r>=8;
          else if(distance<(platform+6)*TILE)solid=r>=28;
          else solid=r>=8;
          world[r][c]=solid?{type:'stone',hp:100}:null;invalidateTerrainAround(r,c);
        }
        b=surfaceSlimeBuild(wall-dir*40,11*TILE-32,{id:500,seed:.46,home:wall-dir*40});
        window.__snailBody=b;b.surfaceSlime.dir=dir;b.surfaceSlime.state='crawl';b.surfaceSlime.timer=100;
        b.surfaceSlime.goalX=b.cx+dir*TILE*12;
        var gap=wall+dir*platform*TILE;
        var r={fps:fps,dir:dir,platform:platform,finite:true,embedded:0,gotOnTop:false,
          maxPitDepth:-Infinity,maxPitDownSpeed:0,closest:Infinity,trail:[]};
        var ys=[b.cy],speedFrames=Math.ceil(fps*.1);
        for(var n=0;n<fps*65;n++){
          window.__snailStep(fps);
          ys.push(b.cy);if(ys.length>speedFrames+1)ys.shift();
          var along=(b.cx-wall)*dir,pitX=(b.cx-gap)*dir,speed=(b.cy-ys[0])*fps/(ys.length-1);
          if(along>12&&b.cy<top-2)r.gotOnTop=true;
          if(r.gotOnTop){
            r.closest=Math.min(r.closest,-pitX);
            if(pitX>0&&pitX<6*TILE)r.maxPitDepth=Math.max(r.maxPitDepth,b.cy-top);
            var front=dir>0?b.bboxR:b.bboxL;
            if((front-gap)*dir>0&&pitX<6*TILE)r.maxPitDownSpeed=Math.max(r.maxPitDownSpeed,speed);
          }
          window.__snailIntegrity(b,r);
          if(n%fps===0)r.trail.push({t:n/fps,x:Math.round(along),depth:Math.round(b.cy-top),
            crest:b.surfaceSlime.crest,contacts:b.surfaceSlime.contacts,state:b.surfaceSlime.state});
        }
        if(!isFinite(r.maxPitDepth))r.maxPitDepth=null;
        results.push(r);
      }
      return results;
    })()`);
    console.log('PITS AFTER SHORT LEDGE TOPS',JSON.stringify(crests.map(({trail,...r})=>r),null,2));
    for(const r of crests.filter(r=>!r.gotOnTop||r.closest>65||r.maxPitDepth!==null&&r.maxPitDepth>10||r.maxPitDownSpeed>135||!r.finite||r.embedded))console.log('CREST PIT FAILURE TRACE',JSON.stringify(r));
    check('slimes crest two and three tile platforms and reach the far edge',crests.every(r=>r.gotOnTop&&r.closest<=65));
    check('finishing a ledge climb never carries the slime down the pit beyond it',crests.every(r=>(r.maxPitDepth===null||r.maxPitDepth<=10)&&r.maxPitDownSpeed<=135));
    check('ledge-to-pit approaches remain finite and outside solid terrain',crests.every(r=>r.finite&&r.embedded===0));
  }

  if(selection==='all'||selection==='wall'){
    const walls=await game(`(function(){
      var results=[];
      for(var rate=0;rate<3;rate++)for(var dir=-1;dir<=1;dir+=2){
        var fps=[30,60,144][rate],seed=[.08,.46,.84][rate];
        var b=window.__snailSetup('wall',dir,0,seed,0),start=b.cy,acquired=null;
        var r={fps:fps,dir:dir,seed:seed,finite:true,embedded:0,maxSlip:0,maxNoGrip:0,trail:[]};
        var highY=b.cy,noGrip=0,firstY=null;
        for(var n=0;n<fps*70;n++){
          window.__snailStep(fps);
          if(acquired===null&&b.surfaceSlime.climb&&start-b.cy>40){acquired=n/fps;highY=b.cy;firstY=b.cy;}
          if(acquired!==null){
            highY=Math.min(highY,b.cy);r.maxSlip=Math.max(r.maxSlip,b.cy-highY);
            noGrip=b.surfaceSlime.contacts>0?0:noGrip+1/fps;r.maxNoGrip=Math.max(r.maxNoGrip,noGrip);
          }
          window.__snailIntegrity(b,r);
          if(n%fps===0)r.trail.push({t:n/fps,y:Math.round(b.cy),contacts:b.surfaceSlime.contacts,state:b.surfaceSlime.state});
          if(acquired!==null&&n/fps-acquired>=22)break;
        }
        r.acquired=acquired;r.rise=start-b.cy;r.continuedRise=firstY===null?0:firstY-b.cy;
        // A normal idle intent must hold the wall without a motor gait. This
        // changes the brain's state, never points, constraints or adhesion.
        var pauseY=b.cy,pauseMin=b.cy,pauseMax=b.cy,pauseNoGrip=0,pauseIdle=0;
        b.surfaceSlime.state='idle';b.surfaceSlime.timer=4;
        for(n=0;n<fps*3;n++){
          window.__snailStep(fps);pauseMin=Math.min(pauseMin,b.cy);pauseMax=Math.max(pauseMax,b.cy);
          if(b.surfaceSlime.state==='idle')pauseIdle++;
          if(!b.surfaceSlime.contacts)pauseNoGrip++;
          window.__snailIntegrity(b,r);
        }
        r.pauseDrift=Math.max(Math.abs(pauseMin-pauseY),Math.abs(pauseMax-pauseY));
        r.pauseIdleFraction=pauseIdle/(fps*3);r.pauseNoGripFraction=pauseNoGrip/(fps*3);
        var releaseY=b.cy;
        if(dir>0){
          jelloLaunchBody(b,-dir*110,-20);r.release='throw';
        }else{
          // The same contact entry used by the real rig, with its outward
          // velocity. A test-only detach would hide missing input coupling.
          player.x=b.cx-dir*PLAYER_W*.45-PLAYER_W*.5;player.y=b.cy-PLAYER_H*.5;
          player.vx=-dir*145;player.vy=-20;
          jelloPlayerCouple(b,jelloStepH);r.release='rig';
        }
        r.detached=b.surfaceSlime.detach>0&&!b.surfaceSlime.climb&&b.surfaceSlime.contacts===0;
        player.x=120*TILE;player.vx=player.vy=0;
        for(n=0;n<fps*.65;n++)window.__snailStep(fps);
        r.releaseFall=b.cy-releaseY;results.push(r);
      }
      return results;
    })()`);
    console.log('SNAIL WALLS',JSON.stringify(walls.map(({trail,...r})=>r),null,2));
    for(const r of walls.filter(r=>r.acquired===null||r.continuedRise<25||r.maxSlip>15||r.maxNoGrip>.2||r.pauseDrift>12||r.pauseIdleFraction<.95||r.pauseNoGripFraction>.05))console.log('WALL FAILURE TRACE',JSON.stringify(r));
    check('both wall faces show sustained upward progress at 30/60/144 Hz',walls.every(r=>r.acquired!==null&&r.continuedRise>=25));
    check('wall crawling keeps a continuous foothold without repeated downward slips',walls.every(r=>r.maxSlip<=15&&r.maxNoGrip<=.2));
    check('three second idle pauses retain wall grip with at most twelve pixels of drift',walls.every(r=>r.pauseIdleFraction>=.95&&r.pauseDrift<=12&&r.pauseNoGripFraction<=.05));
    check('throws and actual rig contacts break grip so gravity takes over',walls.every(r=>r.detached&&r.releaseFall>12));
    check('wall crawling and pauses remain finite and outside solid terrain',walls.every(r=>r.finite&&r.embedded===0));
  }

  if(selection==='all'||selection==='wave'){
    const waves=await game(`(function(){
      var saved=SURFACE_SLIME_WAVE,results=[];
      try{
        for(var trial=0;trial<2;trial++){
          SURFACE_SLIME_WAVE=trial===0?saved:0;
          var b=window.__snailSetup('wave',1,0,.46,0),mins=[],maxs=[],minH=Infinity,maxH=0,start=b.cx;
          var radialSum=[],cosineSum=[],sineSum=[],samples=0,sumC=0,sumS=0,sumCC=0,sumSS=0,sumCS=0;
          for(var k=0;k<b.ringN;k++){
            mins[k]=Infinity;maxs[k]=-Infinity;radialSum[k]=cosineSum[k]=sineSum[k]=0;
          }
          for(var n=0;n<60*12;n++){
            window.__snailStep(60);
            if(n<60*3)continue;
            minH=Math.min(minH,b.bboxB-b.bboxT);maxH=Math.max(maxH,b.bboxB-b.bboxT);
            var c=Math.cos(b.surfaceSlime.phase),s=Math.sin(b.surfaceSlime.phase);
            samples++;sumC+=c;sumS+=s;sumCC+=c*c;sumSS+=s*s;sumCS+=c*s;
            for(k=0;k<b.ringN;k++){
              var p=b.ring[k],radius=Math.hypot(b.px[p]-b.cx,b.py[p]-b.cy);
              mins[k]=Math.min(mins[k],radius);maxs[k]=Math.max(maxs[k],radius);
              radialSum[k]+=radius;cosineSum[k]+=radius*c;sineSum[k]+=radius*s;
            }
          }
          var swings=maxs.map(function(v,i){return v-mins[i];});
          // Fit the first harmonic of actual material radii, which cannot be
          // changed by rigid rotation or translation. A travelling contour has
          // a coherent phase delay across the free back; synchronous breathing
          // does not. Slow crawling need not bounce the entire body vertically.
          var cc=sumCC-sumC*sumC/samples,ss=sumSS-sumS*sumS/samples;
          var cs=sumCS-sumC*sumS/samples,det=cc*ss-cs*cs,back=[];
          for(k=0;k<b.ringN;k++){
            var p=b.ring[k];if(b.qy[p]>=-b.surfaceSlime.radius*.3)continue;
            var rc=cosineSum[k]-radialSum[k]*sumC/samples;
            var rs=sineSum[k]-radialSum[k]*sumS/samples;
            var a=(rc*ss-rs*cs)/det,d=(rs*cc-rc*cs)/det;
            var amplitude=Math.hypot(a,d);
            if(amplitude>=b.surfaceSlime.radius*.08)back.push({x:b.qx[p],phase:Math.atan2(d,a),amplitude:amplitude});
          }
          back.sort(function(a,b){return a.x-b.x;});
          var phaseTotal=0,phaseTravel=0;
          for(k=1;k<back.length;k++){
            var difference=back[k].phase-back[k-1].phase;
            var delta=Math.atan2(Math.sin(difference),Math.cos(difference));
            phaseTotal+=delta;phaseTravel+=Math.abs(delta);
          }
          results.push({wave:trial===0,travel:b.cx-start,radius:b.surfaceSlime.radius,heightSwing:maxH-minH,
            meanSkinSwing:swings.reduce(function(a,v){return a+v;},0)/swings.length,maxSkinSwing:Math.max.apply(null,swings),
            backWavePoints:back.length,backPhaseSpan:Math.abs(phaseTotal),backPhaseCoherence:phaseTravel?Math.abs(phaseTotal)/phaseTravel:0});
        }
      }finally{SURFACE_SLIME_WAVE=saved;}
      return results;
    })()`);
    console.log('PHYSICAL BODY WAVES',JSON.stringify(waves,null,2));
    check('travelling waves visibly change the real skin, beyond translation or rigid rotation',waves[0].meanSkinSwing>=waves[0].radius*.35&&waves[0].meanSkinSwing>waves[1].meanSkinSwing*4);
    check('deformation propagates across the free back instead of breathing in place',waves[0].backWavePoints>=5&&waves[0].backPhaseSpan>=1&&waves[0].backPhaseCoherence>=.75);
    check('the physical waves produce crawling rather than a renderer-only effect',waves[0].travel>45&&Math.abs(waves[1].travel)<15);
  }
  check('no browser exceptions',errors.length===0);
  assert.equal(failures.length,0,failures.join('\n'));
  console.log('PASS pit caution, snail wall adhesion and physical body waves');
} finally { cleanup(); }
