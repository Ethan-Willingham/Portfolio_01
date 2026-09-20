#!/usr/bin/env node
// Smoke momentum regression against the built game, with an owned testing browser.
// Run: node tools/sluice-smoke-coupling.mjs. No save or personal browser is touched.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-smoke-coupling-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let chrome, ws, seq = 0;
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'grand-motherload.html')) {
      data = Buffer.from(data.toString().replace('<body>', '<body class="gm-fs">'));
    }
    if (file === path.join(root, 'js/sluice.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      assert.ok(end > 0, 'game IIFE exists');
      data = Buffer.from(source.slice(0, end) +
        'window.__smokeCouplingTest = function(source) { return eval(source); };\n' + source.slice(end));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
      '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const game = source => evaluate(`__smokeCouplingTest(${JSON.stringify(source)})`);
function check(label, condition, detail) {
  assert.ok(condition, label + (detail === undefined ? '' : ': ' + JSON.stringify(detail)));
  console.log('PASS ' + label);
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  chrome = spawn(process.env.CHROME || path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=' + (process.platform === 'darwin' ? 'metal' : 'vulkan'),
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 200; i++) {
    if (launchError) throw launchError;
    assert.equal(chrome.exitCode, null, 'testing browser remains running');
    await sleep(100);
  }
  assert.ok(fs.existsSync(portFile), 'testing browser opened debugging endpoint');
  const debug = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      message.error ? task?.reject(message.error) : task?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map(arg => arg.value || arg.description));
    }
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await evaluate(`typeof __smokeCouplingTest==='function' && __smokeCouplingTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('game boots with both smoke solvers and the coupling helpers', await game(`
    introPhase==='done' && SmokeFluid.isReady() && rigExhaustAvailable() &&
    typeof rocketSmokeCouple==='function' && typeof smokeFluidMovingBodies==='function'`));
  await game(`cancelAnimationFrame(gameRafId);gameRafId=0;
    gameOver=false;gameWon=false;shopOpen=false;shopState='closed';ledgerOpen=false;cargoManifestOpen=false;
    roverMode=false;drilling=null;PERF_DISABLE_ROCKET=false;PERF_DISABLE_SMOKE_FLUID=false;rocketTune.enabled=true;
    player.drillGlideT=0;player.lastMoveU=true;player.thrusting=true;player.fuel=100;player.vx=player.vy=0;
    player.bodyTiltRender=0;player.x=COLS*TILE/2;player.y=-200;player.renderX=player.x;player.renderY=player.y;
    cam.x=player.x-screenW/2;cam.y=player.y-screenH/2;
    jelloBodies=[];skySlimes=[];liquidCount=0;smokeTune.diesel_enabled=false;smokeTune.wind_x=0;
    smokeFluidEnsure();rigExhaustEnsure();rocketIntensity=0.8;`);

  const impulses = await game(`(function(){
    function capture(driver, dt, frames){
      var calls=[],original=driver.splatVelocity,originalSplat=driver.splat;
      function record(x,y,dx,dy,r){calls.push({x:x,y:y,dx:dx,dy:dy,r:r});}
      driver.splatVelocity=record;
      driver.splat=function(x,y,dx,dy,col,r){record(x,y,dx,dy,r);};
      try{for(var i=0;i<frames;i++)rocketSmokeCouple(driver,dt);}
      finally{driver.splatVelocity=original;driver.splat=originalSplat;}
      var c=driver.getCanvas(),dims=driver.simW>0&&driver.simH>0?{w:driver.simW,h:driver.simH}:
        smokeWGPUResDims(driver.config.SIM_RESOLUTION,c.width,c.height);
      return {calls:calls.map(function(p){return {
        x:cam.x-smokeFluidMarginWorldX+p.x*smokeFluidDomainWorldW,
        y:cam.y-smokeFluidMarginWorldY+(1-p.y)*smokeFluidDomainWorldH,
        dx:p.dx*smokeFluidDomainWorldW/dims.w,dy:-p.dy*smokeFluidDomainWorldH/dims.h,
        radius:Math.sqrt(p.r/100*Math.max(1,c.width/c.height))*smokeFluidDomainWorldH
      };})};
    }
    var result={};
    [smokeDriver,rigExhaustFluid].forEach(function(driver,index){
      var name=index?'custom':'ambient',r=result[name]={};
      r.hz30=capture(driver,1/30,15);r.hz60=capture(driver,1/60,30);r.hz120=capture(driver,1/120,60);
      var w=smokeFluidDomainWorldW,h=smokeFluidDomainWorldH,mx=smokeFluidMarginWorldX,my=smokeFluidMarginWorldY;
      try{
        smokeFluidDomainWorldW*=0.625;smokeFluidDomainWorldH*=0.625;
        smokeFluidMarginWorldX*=0.625;smokeFluidMarginWorldY*=0.625;
        r.zoom=capture(driver,1/60,30);
      }finally{smokeFluidDomainWorldW=w;smokeFluidDomainWorldH=h;smokeFluidMarginWorldX=mx;smokeFluidMarginWorldY=my;}
      player.bodyTiltRender=-0.55;r.tilt=capture(driver,1/60,1);player.bodyTiltRender=0;
      player.thrusting=false;r.released=capture(driver,1/60,1);player.thrusting=true;
      player.lastMoveU=false;r.noInput=capture(driver,1/60,1);player.lastMoveU=true;
      player.fuel=0;r.noFuel=capture(driver,1/60,1);player.fuel=100;
      var oldY=player.y;player.y=player.renderY=10;
      var wallY=64,row=wallY/TILE,col=Math.floor(player.x/TILE),old=[];
      for(var k=col-4;k<=col+4;k++){old.push(world[row][k]);world[row][k]={type:'stone',hp:1};}
      try{r.blocked=capture(driver,1/60,1);r.wallY=wallY;}
      finally{for(var k2=col-4;k2<=col+4;k2++)world[row][k2]=old[k2-col+4];player.y=player.renderY=oldY;}
    });
    result.webgpu=capture({config:{},simW:320,simH:224,getCanvas:function(){return smokeFluidCanvas;},
      splatVelocity:function(){}},1/60,30);
    return result;
  })()`);
  const total = sample => sample.calls.reduce((out, p) => ({ x: out.x + p.dx, y: out.y + p.dy }), { x: 0, y: 0 });
  const close = (a, b, tolerance = 0.002) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  for (const name of ['ambient', 'custom']) {
    const result = impulses[name];
    const reference = total(result.hz60);
    check(name + ' jet injects downward momentum', result.hz60.calls.length > 0 && reference.y > 0, reference);
    for (const hz of ['hz30', 'hz120']) {
      const comparison = total(result[hz]);
      check(name + ' equal-time momentum is independent of ' + hz.slice(2) + ' Hz cadence',
        close(reference.x, comparison.x) && close(reference.y, comparison.y), { reference, comparison });
    }
    const zoom = total(result.zoom);
    check(name + ' zoom preserves world momentum and plume width',
      close(reference.x, zoom.x) && close(reference.y, zoom.y) &&
      result.zoom.calls.length === result.hz60.calls.length && result.zoom.calls.every((p, i) =>
        close(p.radius, result.hz60.calls[i].radius) && close(p.x, result.hz60.calls[i].x) && close(p.y, result.hz60.calls[i].y)),
      { reference, zoom });
    const tilt = total(result.tilt);
    check(name + ' banked jet points with the chassis', tilt.x > 0 && tilt.y > 0 && close(tilt.x / tilt.y, Math.tan(0.55), 0.04), tilt);
    check(name + ' release, no input and empty fuel stop fresh impulses',
      !result.released.calls.length && !result.noInput.calls.length && !result.noFuel.calls.length);
    check(name + ' terrain stops direct jet injection at its near face', result.blocked.calls.length > 0 &&
      result.blocked.calls.every(p => p.y <= result.wallY + 4), result.blocked);
  }
  check('ambient and custom fields receive equivalent world momentum',
    close(total(impulses.ambient.hz60).y, total(impulses.custom.hz60).y));
  check('the parked WebGPU interface receives finite, equivalent world momentum',
    impulses.webgpu.calls.length > 0 && impulses.webgpu.calls.every(p =>
      [p.x, p.y, p.dx, p.dy, p.radius].every(Number.isFinite)) &&
    close(total(impulses.webgpu).y, total(impulses.ambient.hz60).y), total(impulses.webgpu));

  const routing = await game(`(function(){
    var counts=[0,0],drivers=[smokeDriver,rigExhaustFluid],originals=drivers.map(function(d){return d.splatVelocity;});
    drivers.forEach(function(d,i){d.splatVelocity=function(){counts[i]++;return originals[i].apply(d,arguments);};});
    try{
      rigExhaustState.equipped='stock';smokeAwakeT=2;rigExhaustAwake=2;
      player.lastMoveU=player.thrusting=true;rocketIntensity=0.8;
      updateSmoke(1/60);return counts;
    }finally{drivers.forEach(function(d,i){d.splatVelocity=originals[i];});}
  })()`);
  check('the real update loop routes jet velocity to both active fields', routing.every(n => n > 0), routing);

  const clouds = await game(`(function(){
    var result={};
    function radius(driver,r){var c=driver.getCanvas();return 100*Math.pow(r/smokeFluidDomainWorldH,2)/Math.max(1,c.width/c.height);}
    function measure(driver){
      driver.displayPass();var c=driver.getCanvas(),gl=c.getContext('webgl2')||c.getContext('webgl');
      var pixels=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      var mass=0,x=0,y=0;
      for(var i=0;i<pixels.length;i+=4){var weight=pixels[i];mass+=weight;x+=weight*(i/4%c.width+0.5);y+=weight*(Math.floor(i/4/c.width)+0.5);}
      if(gl.getError())throw Error('WebGL readback failed');
      return {mass:mass,x:cam.x-smokeFluidMarginWorldX+x/mass/c.width*smokeFluidDomainWorldW,
        y:cam.y-smokeFluidMarginWorldY+(1-y/mass/c.height)*smokeFluidDomainWorldH};
    }
    [smokeDriver,rigExhaustFluid].forEach(function(driver,index){
      var name=index?'custom':'ambient';result[name]={};
      driver.config.CURL=0;driver.config.DENSITY_DISSIPATION=0;driver.config.VELOCITY_DISSIPATION=0.08;
      driver.config.wind_x=0;driver.config.OPTICAL_DENSITY=0;driver.setPhysics({},0);
      ['off','down','tilted'].forEach(function(mode){
        driver.clear();driver.clearObstacle();player.bodyTiltRender=0;
        var nozzles=rocketNozzles(),cx=(nozzles[0].x+nozzles[1].x)/2,cy=(nozzles[0].y+nozzles[1].y)/2;
        for(var row=0;row<3;row++)for(var col=-1;col<=1;col++){
          var uv=smokeFluidWorldToUV(cx+col*17,cy+20+row*22);
          driver.splat(uv.uvX,uv.uvY,0,0,{r:0.16,g:0.16,b:0.16},radius(driver,11));
        }
        var start=measure(driver);player.bodyTiltRender=mode==='tilted'?-0.55:0;
        player.thrusting=mode!=='off';player.lastMoveU=true;rocketIntensity=0.8;
        for(var frame=0;frame<60;frame++){rocketSmokeCouple(driver,1/60);driver.step(1/60);}
        var end=measure(driver);result[name][mode]={dx:end.x-start.x,dy:end.y-start.y,retention:end.mass/start.mass};
      });
      var startX=player.renderX,startY=player.renderY,baseCamX=cam.x;
      ['stationary','camera','moving'].forEach(function(mode){
        driver.clear();driver.clearObstacle();player.bodyTiltRender=0;player.thrusting=false;
        player.renderX=startX;player.renderY=startY;
        var cx=startX+PLAYER_W/2,cy=startY+PLAYER_H/2;
        for(var row=-1;row<=1;row++)for(var col=-1;col<=1;col++){
          var uv=smokeFluidWorldToUV(cx+col*15,cy+row*12);
          driver.splat(uv.uvX,uv.uvY,0,0,{r:0.16,g:0.16,b:0.16},radius(driver,11));
        }
        var start=measure(driver),c=driver.getCanvas();
        var dyeDims=smokeWGPUResDims(driver.config.DYE_RESOLUTION,c.width,c.height);
        var cameraCell=smokeFluidDomainWorldW/dyeDims.w;
        // Seed the history at the same initial position used by the sweep.
        // The camera case pans only the field; its world-space hull stays still.
        if(mode==='moving')player.renderX=startX-65;
        driver.setMovingBodies(smokeFluidMovingBodies(),cam.x-smokeFluidMarginWorldX,cam.y-smokeFluidMarginWorldY,
          smokeFluidDomainWorldW,smokeFluidDomainWorldH,1/60,smokeFluidObstacleW,smokeFluidObstacleH,true);
        for(var frame=0;frame<120;frame++){
          if(mode==='moving')player.renderX=startX-65+(frame+1)*130/120;
          if(mode==='camera'){
            var next=baseCamX+Math.round(Math.sin((frame+1)*Math.PI*2/120)*10)*cameraCell;
            driver.scroll((next-cam.x)/smokeFluidDomainWorldW,0);cam.x=next;
          }
          driver.setMovingBodies(smokeFluidMovingBodies(),cam.x-smokeFluidMarginWorldX,cam.y-smokeFluidMarginWorldY,
            smokeFluidDomainWorldW,smokeFluidDomainWorldH,1/60,smokeFluidObstacleW,smokeFluidObstacleH,true);
          driver.step(1/60);
        }
        // Disable only visual occlusion before weighing the finite cloud.
        // Hidden smoke inside a hull must not be counted as smoke destruction.
        driver.setMovingBodies([],cam.x-smokeFluidMarginWorldX,cam.y-smokeFluidMarginWorldY,
          smokeFluidDomainWorldW,smokeFluidDomainWorldH,1/60,smokeFluidObstacleW,smokeFluidObstacleH,true);
        var end=measure(driver);result[name][mode]={dx:end.x-start.x,dy:end.y-start.y,retention:end.mass/start.mass};
        cam.x=baseCamX;player.renderX=startX;player.renderY=startY;
      });
    });
    player.thrusting=true;player.bodyTiltRender=0;return result;
  })()`);
  for (const [name, result] of Object.entries(clouds)) {
    check(name + ' a finite cloud moves downward under thrust', result.down.dy > result.off.dy + 2, result);
    check(name + ' a finite cloud follows tilted thrust sideways', result.tilted.dx > result.off.dx + 1, result);
    check(name + ' thrust moves visible smoke without erasing the cloud',
      result.down.retention > 0.55 && result.tilted.retention > 0.55 &&
      result.down.retention < 1.2 && result.tilted.retention < 1.2, result);
    check(name + ' the moving rig displaces a finite cloud', result.moving.dx > result.stationary.dx + 2, result);
    check(name + ' the rig pushes smoke without erasing or inflating it',
      result.moving.retention > 0.75 && result.moving.retention < 1.25, result);
    check(name + ' camera motion does not add momentum to a stationary rig',
      Math.abs(result.camera.dx-result.stationary.dx) < 2 && Math.abs(result.camera.dy-result.stationary.dy) < 2, result);
  }
  const boundary = await game(`(function(){
    var bodies=smokeFluidMovingBodies(),rig=bodies.find(function(b){return jelloBodies.indexOf(b)<0;});
    if(!rig)return null;
    var first=Array.from(rig.px),y=Array.from(rig.py),old=cam.x;
    cam.x+=100;var again=smokeFluidMovingBodies();cam.x=old;
    var cameraStable=JSON.stringify(first)===JSON.stringify(Array.from(rig.px))&&JSON.stringify(y)===JSON.stringify(Array.from(rig.py));
    player.renderX+=12;var moved=smokeFluidMovingBodies(),dx=rig.px[rig.ring[0]]-first[rig.ring[0]];player.renderX-=12;
    smokeFluidMovingBodies();return {count:rig.ringN,stable:again.indexOf(rig)>=0&&moved.indexOf(rig)>=0,cameraStable:cameraStable,dx:dx};
  })()`);
  check('the rig boundary retains identity and uses world motion without camera motion', boundary &&
    boundary.count >= 4 && boundary.stable && boundary.cameraStable && close(boundary.dx, 12), boundary);

  // Exercise the real update path with finite clouds and all emitters off.
  // Wind must keep acting when emission stops, changes sign, or the player
  // returns to stock while an older colored plume is still in the air.
  const wind = await game(`(function(){
    var drivers=[smokeDriver,rigExhaustFluid],result={cases:{},configs:[]};
    var cx=COLS*TILE/2,surface=SKY_ROWS*TILE,speed=0.04;
    player.thrusting=false;player.lastMoveU=false;rocketIntensity=0;
    smokeTune.enabled=false;smokeTune.diesel_enabled=false;smokeTune.sim_time_scale=1;smokeTune.world_lock=true;
    RIG_EXHAUST_CATALOG.forEach(function(p){rigExhaustState.owned[p.id]=true;});
    // An empty underground chamber isolates the surface-wind boundary from
    // terrain occlusion, without bypassing the game's obstacle painter.
    for(var r=SKY_ROWS;r<SKY_ROWS+14;r++)for(var c=Math.floor(cx/TILE)-12;c<=Math.floor(cx/TILE)+12;c++)world[r][c]=null;
    function measure(driver){
      driver.displayPass();var c=driver.getCanvas(),gl=c.getContext('webgl2')||c.getContext('webgl');
      var bytes=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      var mass=0,x=0;
      for(var i=0;i<bytes.length;i+=4){mass+=bytes[i];x+=bytes[i]*(i/4%c.width+0.5);}
      if(gl.getError())throw Error('Wind cloud readback failed');
      return {mass:mass,x:cam.x-smokeFluidMarginWorldX+x/mass/c.width*smokeFluidDomainWorldW};
    }
    function both(){return drivers.map(measure);}
    function advance(){for(var frame=0;frame<30;frame++)updateSmoke(1/60);return both();}
    function delta(start,end){return end.map(function(p,i){return {dx:p.x-start[i].x,retention:p.mass/start[i].mass};});}
    [['positive',surface-180,speed],['negative',surface-180,-speed],['still',surface-180,0],
      ['underground',surface+180,speed],['reverseAfterStock',surface-180,speed]].forEach(function(test){
      rigExhaustSelect('copperhead');
      cam.x=cx-screenW/2;cam.y=test[1]-screenH/2;
      smokeFluidEnsure();rigExhaustEnsure();smokeTune.wind_x=test[2];
      drivers.forEach(function(d){
        d.clear();d.config.CURL=0;d.config.DENSITY_DISSIPATION=0;d.config.VELOCITY_DISSIPATION=0;
        d.config.OPTICAL_DENSITY=0;d.setPhysics({},0);
      });
      smokeFluidPrevCamX=cam.x;smokeFluidPrevCamY=cam.y;
      smokeFluidPrevScreenW=screenW;smokeFluidPrevScreenH=screenH;
      rigExhaustPrevX=cam.x;rigExhaustPrevY=cam.y;smokeObstPrevCamX=NaN;
      smokeAwakeT=10;rigExhaustAwake=10;updateSmoke(1/60);
      var uv=smokeFluidWorldToUV(cx,test[1]);
      drivers.forEach(function(d){var c=d.getCanvas();
        var radius=100*Math.pow(18/smokeFluidDomainWorldH,2)/Math.max(1,c.width/c.height);
        d.splat(uv.uvX,uv.uvY,0,0,{r:0.25,g:0.10,b:0.04},radius);
      });
      var start=both(),end=advance();result.cases[test[0]]=delta(start,end);
      if(test[0]==='reverseAfterStock'){
        rigExhaustSelect('stock');smokeTune.wind_x=-speed;
        var reversed=advance();result.afterStock=delta(end,reversed);
        result.stockEquipped=rigExhaustState.equipped==='stock';
      }
    });
    // Every recipe and camera height must read the same current world wind.
    RIG_EXHAUST_CATALOG.filter(function(p){return !!p.recipe;}).forEach(function(p){
      [surface-screenH*3,surface-screenH/2,surface+screenH*2].forEach(function(y){
        cam.y=y;smokeTune.wind_x=-speed;rigExhaustSelect(p.id);
        smokeAwakeT=2;rigExhaustAwake=2;updateSmoke(1/60);
        var expected=Math.max(0,Math.min(1,1-(surface-(cam.y-smokeFluidMarginWorldY))/smokeFluidDomainWorldH));
        result.configs.push({id:p.id,expected:expected,actual:drivers.map(function(d){
          return {wind:d.config.wind_x,above:d.config.wind_above_y};
        })});
      });
    });
    return result;
  })()`);
  for (const [index, name] of ['ambient', 'custom'].entries()) {
    const positive = wind.cases.positive[index], negative = wind.cases.negative[index];
    check(name + ' existing smoke follows positive and negative surface wind with emitters off',
      positive.dx > 5 && negative.dx < -5 && positive.retention > 0.8 && negative.retention > 0.8,
      { positive, negative });
    check(name + ' calm air and underground smoke remain still',
      Math.abs(wind.cases.still[index].dx) < 1 && Math.abs(wind.cases.underground[index].dx) < 1,
      { still: wind.cases.still[index], underground: wind.cases.underground[index] });
    check(name + ' live reversal carries the surviving cloud after equipping stock',
      wind.stockEquipped && wind.cases.reverseAfterStock[index].dx > 5 &&
      wind.afterStock[index].dx < -5 && wind.afterStock[index].retention > 0.8, wind.afterStock[index]);
  }
  check('all exhaust recipes share the current wind and surface boundary at every camera height',
    wind.configs.length >= 21 && wind.configs.every(sample => sample.actual.every(c =>
      close(c.wind, -0.04) && close(c.above, sample.expected))), wind.configs);
  const silhouettes = await game(`(function(){
    cam.x=player.renderX-screenW/2;cam.y=player.renderY-screenH/2;
    var results=[],originX=cam.x-smokeFluidMarginWorldX,originY=cam.y-smokeFluidMarginWorldY;
    function sample(driver,point){
      driver.displayPass();var c=driver.getCanvas(),gl=c.getContext('webgl2')||c.getContext('webgl');
      var uv=smokeFluidWorldToUV(point.x,point.y),pixel=new Uint8Array(4);
      gl.readPixels(Math.floor(uv.uvX*c.width),Math.floor(uv.uvY*c.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      return pixel[3];
    }
    [smokeDriver,rigExhaustFluid].forEach(function(driver,index){
      driver.clear();driver.clearObstacle();driver.config.SHADING=false;driver.config.OPTICAL_DENSITY=0;
      driver.config.EDGE_SHARPNESS=0;
      driver.setLiquidField([],[],[],[],0,0,0,1,1,1);
      var c=driver.getCanvas(),uv=smokeFluidWorldToUV(player.renderX+11,player.renderY+13);
      driver.splat(uv.uvX,uv.uvY,0,0,{r:0.8,g:0.4,b:0.1},
        100*Math.pow(45/smokeFluidDomainWorldH,2)/Math.max(1,c.width/c.height));
      [-1,1].forEach(function(facing){[0,-0.55,0.55].forEach(function(tilt){
        player.dir=facing;player.bodyTiltRender=tilt;
        // Open air beside the cupola, inside the former rectangular mask.
        var gap=playerLocalToWorld(facing<0?PLAYER_W-19.5:19.5,4);
        var core=playerLocalToWorld(PLAYER_W/2,16);
        driver.setMovingBodies([],originX,originY,smokeFluidDomainWorldW,smokeFluidDomainWorldH,
          1/60,smokeFluidObstacleW,smokeFluidObstacleH,true);
        var open=sample(driver,gap),inside=sample(driver,core);
        driver.setMovingBodies(smokeFluidMovingBodies(),originX,originY,smokeFluidDomainWorldW,smokeFluidDomainWorldH,
          1/60,smokeFluidObstacleW,smokeFluidObstacleH,true);
        results.push({field:index?'custom':'ambient',facing:facing,tilt:tilt,
          open:open,gap:sample(driver,gap),inside:inside,core:sample(driver,core)});
      });});
    });
    player.bodyTiltRender=0;player.dir=1;return results;
  })()`);
  for(const r of silhouettes){
    check(r.field+' smoke remains in open air beside the roof ('+r.facing+', '+r.tilt+')',
      r.open>100&&r.gap/r.open>0.8,r);
    check(r.field+' solid chassis still occludes smoke ('+r.facing+', '+r.tilt+')',
      r.inside>100&&r.core/r.inside<0.1,r);
  }
  check('browser reports no runtime or shader errors', errors.length === 0, errors);
  const report = { routing, clouds, boundary, silhouettes, wind: { cases: wind.cases, afterStock: wind.afterStock } };
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  try { ws?.close(); } catch {}
  for (const task of pending.values()) task.reject(Error('Harness closed'));
  pending.clear();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), sleep(2000)]);
  }
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
