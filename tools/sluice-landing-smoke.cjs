// Run with Playwright available: node tools/sluice-landing-smoke.cjs
// DUMP points outside the repo for visual evidence; BASELINE=1 uses HEAD's bundle.
// All test hooks are injected by this temporary server, never shipped in the game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP && path.resolve(process.env.DUMP);
if (dump) {
  assert(dump !== root && !dump.startsWith(root + path.sep), 'Keep evidence outside the repo');
  fs.mkdirSync(dump, { recursive: true });
}
const probe = `
window.__landingTest = (function () {
  var clock = 1000, floorRow = SKY_ROWS + 8, col = 80;
  var realNow = performance.now.bind(performance);
  var realCushion = playerWaterCushion;
  var realChimney = chimneyCapCatch, realProbe = jelloGroundProbe;
  function state() {
    return { version: GAME_VERSION, floorY:floorRow*TILE, viewW:viewW,viewH:viewH,screenW:screenW,screenH:screenH,cam:{x:cam.x,y:cam.y},scale:worldScale, x:player.x,y:player.y,vy:player.vy,
      hull:player.hull,ground:player.onGround,jello:player.onJello,
      pause:hitPauseT,squash:player.squash,fx:Object.assign({},player.fx),
      dust:rocketWash.filter(function(p){return p.landing;}).length,
      wash:rocketWash.length,over:gameOver,
      offset:typeof playerFxLandOffset==='function' ? playerFxLandOffset() : null };
  }
  function stop() {
    if(gameRafId)cancelAnimationFrame(gameRafId); gameRafId=0;
    gamePaused=false; introPhase='done'; devMode=false;
    document.body.classList.add('gm-fs');
    document.body.appendChild(document.querySelector('.game-wrapper'));
    var css=document.createElement('style');
    css.textContent='#game-intro,#game-pause,.game-header,#gm-perf-badge,#gm-pause-btn{display:none!important}';
    document.head.appendChild(css);
    performance.now=function(){return clock;};
    timeOfDay=0.5; SUN.paused=true;
    PERF_DISABLE_SMOKE_FLUID=true; PERF_DISABLE_WEATHER=true;
    drawPerfOverlay=function(){};
    resize(); return state();
  }
  function scene(o) {
    o=o||{}; resize(); gameOver=false; gameWon=false; shopOpen=false; shopState='closed';
    drilling=null; hitPauseT=0; damageFlashT=0; keys={};
    jelloBodies=[]; liquidParticles=[]; liquidCount=0; surfacePonds=[];
    for(var r=Math.max(0,SKY_ROWS-8);r<floorRow+10;r++)for(var c=col-20;c<=col+20;c++)
      world[r][c]=r<floorRow?null:{type:'dirt',hp:ORES.dirt.hp};
    player.x=col*TILE+5;
    player.y=floorRow*TILE-PLAYER_H-(o.gap===undefined?0.5:o.gap);
    player.vx=0;player.vy=o.speed||0;player.dir=o.dir||1;
    player.renderX=player.x;player.renderY=player.y;
    player.onGround=false;player.onJello=false;player.onCeiling=false;
    player.drillGlideT=0;player.drillCooldownT=0;
    player.thrusting=false;player.thrustSpool=0;player.thrustLatch=false;
    player.hull=o.hull===undefined?1000:o.hull;player.fuel=getMaxFuel();
    player.squash=0;player.tremor=0;player.bodyTiltRender=0;
    player.jelloImpactVy=0;player.jelloGroundT=0;player.jelloRideY=undefined;
    player.fx={igniteN:0,boomN:0,vaporN:0,landN:0,landVy:0,landTilt:0};
    clearRocketPlume();
    player.airTime=o.air===undefined?1:o.air;player.peakFallVy=740;player._groundWas=false;
    if(typeof _pfxLandDip!=='undefined'){_pfxLandDip=0;_pfxLandAge=1;_pfxLandSeen=0;}
    if(typeof _pfxPlayer!=='undefined')_pfxPlayer=player;
    flightFxSeen={sync:true,ignite:0,land:0};
    playerWaterCushion=function(){return o.cushion||0;};
    chimneyCapCatch=o.ledge?function(){return floorRow*TILE-PLAYER_H;}:function(){return null;};
    jelloGroundProbe=o.gel?function(){return {surfaceY:floorRow*TILE-16,vy:0,vx:0};}:realProbe;
    if(o.gel){player.y=floorRow*TILE-16-PLAYER_H+1;player.renderY=player.y;}
    cam.x=player.x-screenW/2;cam.y=player.y-screenH*0.62;
    terrainChunkCache={};terrainChunkCount=0;terrainWarmupFrames=3;
    terrainChunkRebuildBoostFrames=100;lightingInit();treesRebuild();
    clock+=1000;_pfxLast=clock;
    return state();
  }
  function step(n,dt) {
    for(var i=0;i<(n||1);i++){
      clock+=(dt||1/60)*1000;
      update(dt||1/60);updateRocketPlume(dt||1/60);updateDrillAnim(dt||1/60);playerFxTick();
    }
    return state();
  }
  function input(key) {keys[key]=true;return step(1);}
  function sheet() {
    var out=document.createElement('canvas');out.width=1100;out.height=208;
    var g=out.getContext('2d'), realCtx=ctx;
    g.fillStyle='#303931';g.fillRect(0,0,out.width,out.height);
    var phases=[0,0.028,0.065,0.11,0.20];
    for(var i=0;i<phases.length;i++) {
      _pfxLandAge=phases[i];_pfxLast=clock;
      ctx=g;g.save();g.beginPath();g.rect(i*220,0,220,208);g.clip();
      g.fillStyle='#b4ac99';g.font='13px monospace';g.fillText(Math.round(phases[i]*1000)+' ms',i*220+14,24);
      g.translate(i*220+63,48);g.scale(4,4);g.translate(-player.renderX,-player.renderY);
      g.fillStyle='#5a5248';g.fillRect(player.renderX-20,floorRow*TILE,80,20);
      drawPlayer();g.restore();
    }
    ctx=realCtx;return out.toDataURL('image/png');
  }
  return {state:state,stop:stop,scene:scene,step:step,input:input,sheet:sheet,
    draw:function(){render();},
    contact:function(speed,surface,cushion){recordLandingImpact(speed,floorRow*TILE,surface,cushion||0);updateFlightFx(0);playerFxTick();return state();},
    reset:function(){respawnAtTown(0);return state();},
    teleport:function(){teleporters=1;activateTeleporter();return state();},
    offsets:function(){var a=[];for(var i=0;i<=300;i++){_pfxLandAge=i/1000;a.push(playerFxLandOffset());}return a;},
    resetObject:function(){player=Object.assign({},player,{fx:{landN:0,igniteN:0,boomN:0}});playerFxTick();return state();},
    restore:function(){performance.now=realNow;playerWaterCushion=realCushion;chimneyCapCatch=realChimney;jelloGroundProbe=realProbe;}
  };
})();
`;
async function main() {
  const errors=[];
  const bundle=process.env.BASELINE ? execFileSync('git',['show','HEAD:js/sluice.js'],{cwd:root,maxBuffer:16*1024*1024}).toString() : fs.readFileSync(path.join(root,'js/sluice.js'),'utf8');
  const end=bundle.lastIndexOf('})();');
  assert(end>0);
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/js/sluice.js'){
      res.setHeader('Content-Type','text/javascript');res.end(bundle.slice(0,end)+probe+bundle.slice(end));return;
    }
    const p=path.resolve(root,'.'+pathname);
    if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2','.m4a':'audio/mp4'};
    res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');
    const stream=fs.createReadStream(p);stream.on('error',()=>res.writeHead(404).end());stream.pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu']});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1',{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.__landingTest && window.gm && window.SluiceLoading && !window.SluiceLoading.active(),{timeout:60000});
    const call=(name,...args)=>page.evaluate(({name,args})=>window.__landingTest[name](...args),{name,args});
    console.log('Boot',await call('stop'));
    const reports=[];
    for(const scenario of [{speed:120},{speed:280},{speed:450},{speed:600},{speed:280,dir:-1},{speed:450,cushion:0.5},{speed:450,cushion:1},{speed:280,ledge:true}]) {
      await call('scene',scenario);
      let s=await call('step',1);
      if(process.env.BASELINE)s=await call('step',8);
      reports.push({scenario,state:s});

      if(!process.env.BASELINE){
        assert.equal(s.fx.landN,1,'One collision-time landing');
        assert(s.fx.landVy<scenario.speed+20 && s.fx.landVy>80 && (scenario.cushion || s.fx.landVy>=scenario.speed-30),'Uses actual contact speed, not peak 740');
        assert.equal(s.pause,0,'Landing never freezes input');assert.equal(s.squash,0,'No stacked deformation');
        assert.equal(s.fx.landY,s.floorY,'Dust anchored at supporting terrain');
        assert(s.dust<=6,'Bounded contact dust');
        if(scenario.cushion)assert.equal(s.dust,0,'No dry dust in water');
        const expected=await page.evaluate(speed=>{if(speed<=340)return 0;if(speed<=460)return(speed-340)*.10;if(speed<=560)return 12+Math.pow((speed-460)/100,1.45)*42;return 90+Math.pow((speed-560)/80,1.7)*260;},s.fx.landVy);
        assert(Math.abs(s.hull-(1000-(scenario.ledge?0:expected*(1-(scenario.cushion||0)))))<1e-6,'Fall damage preserved');
      }
      if(dump && scenario.speed===450 && !scenario.cushion){
        fs.writeFileSync(path.join(dump,'landing-'+(process.env.BASELINE?'before':'after')+'.png'),Buffer.from((await call('sheet')).split(',')[1],'base64'));
        await call('draw');await page.screenshot({path:path.join(dump,'game-'+(process.env.BASELINE?'before':'after')+'.png')});
      }
      if(!process.env.BASELINE){
        const settled=await call('step',90);
        assert.equal(settled.fx.landN,1,'Parked rig never repeats landing');assert.equal(settled.dust,0,'Dust expires');assert.equal(settled.offset,0,'Suspension settles');
      }
    }
    if(!process.env.BASELINE){
      await call('scene',{speed:280,air:0});assert.equal((await call('step',1)).fx.landN,0,'Tiny step stays quiet');
      await call('scene',{speed:120});assert.equal((await call('step',1)).dust,0,'Braked soft landing has no dust');
      await call('scene',{speed:450});await call('step',1);const before=await call('state');const driven=await call('input','ArrowRight');assert(driven.x>before.x,'Drive on first frame after landing');
      await call('scene',{speed:450});await call('step',1);const launched=await call('input',' ');assert(launched.vy<0,'Jet on first frame after landing');
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await call('scene',{speed:280});await call('step',1);await call('draw');

      if(dump)await page.screenshot({path:path.join(dump,'mobile.png')});
      await page.setViewportSize({width:1440,height:900});
      await call('scene',{speed:600,hull:50});assert((await call('step',1)).over,'Fatal falls remain fatal');
      assert.equal((await call('reset')).offset,0,'Recovery clears suspension');
      await call('scene',{speed:450});await call('step',1);assert.equal((await call('teleport')).offset,0,'Teleport clears suspension');
      await call('scene',{speed:450});await call('step',1);assert.equal((await call('resetObject')).offset,0,'New player clears suspension');
      await call('scene',{speed:450,gel:true});const gel=await call('step',1);assert(gel.jello,'Collision catches gel');assert.equal(gel.fx.landSurface,'jello');assert.equal(gel.dust,0);assert.equal(gel.offset,0);assert.equal(gel.hull,1000);
      await call('scene',{speed:450});await call('step',1);const offsets=await call('offsets');assert(offsets.every(x=>x>=0&&x<=1.35));assert.equal(offsets[200],0);assert(offsets.slice(28).every((x,i,a)=>i===0||x<=a[i-1]),'One monotonic recovery, no bounce');
      for(const dt of [1/30,1/60,1/120]){await call('scene',{speed:280});const s=await call('step',1,dt);assert.equal(s.fx.landN,1);assert.equal(s.pause,0);}

    }
    console.log(JSON.stringify(reports.map(r=>({scenario:r.scenario,contactSpeed:r.state.fx.landVy,dust:r.state.dust,hull:r.state.hull,paused:r.state.pause})),null,2));
    assert.deepEqual(errors,[],'Browser errors');
    console.log(process.env.BASELINE?'Baseline captured.':'Landing collision, damage, materials, input, lifecycle, frame rates and browser render checks passed.');
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
