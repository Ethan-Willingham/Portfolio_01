// End-to-end bulk earth and sluice checks. Uses an isolated Chrome profile.
// Run: node tools/sluice-paydirt-smoke.mjs
// Optional CHROME, PORT, DUMP, BOOT_TIMEOUT. CPU_DIAGNOSTIC=1 is explicitly
// labelled and is never selected automatically when production WebGPU fails.
// PAD_ONLY=1 runs focused browser Gamepad API polling checks instead.
// LAYOUT_ONLY=1 verifies the entire running apparatus on short landscape views.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8837), debugPort = port + 1000;
const dump = path.resolve(process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-paydirt-shots-')));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-paydirt-chrome-'));
const diagnostic = process.env.CPU_DIAGNOSTIC === '1';
const bootTimeout = Number(process.env.BOOT_TIMEOUT || 180000);
fs.mkdirSync(dump, { recursive:true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let browser, ws, sequence = 0, checks = 0;

// Fixture access is added only by this local test server. It creates known
// terrain but uses the real drilling, bomb, docking, rendering and save paths.
const probe = `
window.__paydirtSmoke = {
  state:function(){return {version:GAME_VERSION,dev:devMode,intro:introPhase,
    paused:gamePaused,open:sluiceStationOpen,mobile:isMobile,portrait:mobileLandscapeBlocked,
    active:demoActivity.active(),money:money,x:player.x,y:player.y,
    used:paydirtUsed(),stored:paydirtStored(),capacity:paydirtCapacity(),cargo:cargo.length,
    model:paydirtSave(),saveOk:saveLastOk,waterGPU:!!liquidWGPU,
    bootError:window.__bootErr||null};},
  drillFixture:function(kind,full){
    if(sluiceStationOpen)sluiceStationToggle();
    cargoManifestClearInput();
    var r=SKY_ROWS+10,c=stationCenterCol()+35;
    for(var rr=r-3;rr<=r+2;rr++)for(var cc=c-2;cc<=c+2;cc++)world[rr][cc]={type:'dirt',hp:1};
    for(rr=r-3;rr<r;rr++)for(cc=c-1;cc<=c+1;cc++)world[rr][cc]=null;
    world[r][c]={type:kind,hp:1};
    player.x=c*TILE+(TILE-PLAYER_W)/2;player.y=r*TILE-PLAYER_H;
    player.vx=player.vy=0;player.onGround=true;player.fuel=getMaxFuel();player.hull=getMaxHull();
    player.drillGlideT=0;hitPauseT=0;drilling=null;
    if(full){paydirt.held={topsoil:paydirtCapacity()};paydirt.revision++;}
    this.cell={r:r,c:c};return {r:r,c:c,before:paydirtUsed()};
  },
  cellCleared:function(){return !world[this.cell.r][this.cell.c];},
  blastFixture:function(){
    var r=SKY_ROWS+18,c=stationCenterCol()+35;
    for(var rr=r-1;rr<=r+1;rr++)for(var cc=c-1;cc<=c+1;cc++)world[rr][cc]={type:'stone',hp:3};
    var before=paydirtUsed();detonateBomb({r:r,c:c,size:'large'});
    var cleared=0;for(rr=r-1;rr<=r+1;rr++)for(cc=c-1;cc<=c+1;cc++)if(!world[rr][cc])cleared++;
    return {before:before,after:paydirtUsed(),cleared:cleared};
  },
  dock:function(){
    cargoManifestClearInput();var pad=pumpPadRect();
    player.x=pad.x+pad.w/2-PLAYER_W/2;player.y=DECK_ROW*TILE-PLAYER_H;
    player.vx=player.vy=0;player.onGround=true;player.drillGlideT=0;drilling=null;hitPauseT=0;
    player.fuel=getMaxFuel();player.hull=getMaxHull();
  },
  seedStack:function(count,id){
    // Seed 131 rolls a real Sunwheel nugget at scoop 23 of the first topsoil
    // batch. This exercises the actual probability table, not a fake result.
    id=id||'topsoil';paydirt.seed=131;paydirt.stored[id]=count;paydirt.discovered[id]=true;paydirt.revision++;
    if(sluiceStationOpen){sluiceStationSelected=id;sluiceStationSignature='';sluiceStationRefresh();}
  },
  save:function(){return saveNow('paydirt-smoke');},
  worldCounts:function(){
    var counts=[];for(var band=0;band<6;band++)counts.push({min:PAYDIRT_DEPTHS[band],max:PAYDIRT_DEPTHS[band+1],dirt:0,stone:0});
    for(var r=SKY_ROWS;r<Math.min(TOTAL_ROWS,SKY_ROWS+400);r++)for(var c=0;c<COLS;c++){
      var tile=world[r]&&world[r][c];if(!tile || tile.type!=='dirt'&&tile.type!=='stone')continue;
      var at=0;for(var b=1;b<6;b++)if(r-SKY_ROWS>=PAYDIRT_DEPTHS[b])at=b;counts[at][tile.type]++;
    }return counts;
  },
  layout:function(){
    function rect(selector){var r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}
    return {panel:rect('#gm-sluice-panel'),card:rect('.sluice-card'),body:rect('.sluice-body'),
      materials:rect('.sluice-materials'),bench:rect('.sluice-workbench'),machine:rect('#gm-sluice-machine'),
      columns:getComputedStyle(document.querySelector('.sluice-body')).gridTemplateColumns};
  }
};
`;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
  '.woff':'font/woff','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.m4a':'audio/mp4','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve(root, '.'+pathname);
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
  let data=fs.readFileSync(file);
  if(pathname==='/js/sluice.js') {
    const source=data.toString(),end=source.lastIndexOf('})();');
    assert.ok(end>0,'bundle wrapper exists');data=Buffer.from(source.slice(0,end)+probe+source.slice(end));
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
});
function send(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function until(expression,name,timeout=15000) {
  const start=Date.now();
  while(Date.now()-start<timeout) {if(await ev(expression))return;await sleep(100);}
  throw Error(name+' timed out. '+JSON.stringify(await ev('window.__paydirtSmoke ? __paydirtSmoke.state() : {error:window.__bootErr,loading:window.SluiceLoading && SluiceLoading.report()}')));
}
async function check(name,expression) {assert.ok(await ev(expression),name);checks++;console.log('PASS '+name);}
function passed(name){checks++;console.log('PASS '+name);}
async function key(key,code=key) {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await sleep(70);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await sleep(70);
}
async function click(selector,touch=false) {
  const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(touch) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
  }
  await sleep(90);
}
async function size(width,height,mobile=false) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});await sleep(150);
}
async function shot(name) {
  const result=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(result.data,'base64'));
}
async function boot() {
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html${diagnostic?'?cpuwater=1&cpufire=1':''}`});
  await send('Page.bringToFront');
  await until('!!window.__paydirtSmoke','game script',bootTimeout);
  await ev('document.getElementById("game-canvas").scrollIntoView({block:"center"})');
  await until('__paydirtSmoke.state().intro === "done"','production loading',bootTimeout);
  await ev('document.fonts.ready');await sleep(200);
  if(await ev('__paydirtSmoke.state().paused'))await click('#gm-resume-btn');
  await until('__paydirtSmoke.state().active && !__paydirtSmoke.state().paused','active game');
}
async function controlsReachable() {
  return ev(`(()=>{
    const controls=[...document.querySelectorAll('#gm-sluice-panel button,#gm-sluice-panel summary')].filter(e=>e.getClientRects().length);
    const failures=[];
    for(const e of controls){e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(r.width<44||r.height<44||r.x<0||r.right>innerWidth+1||r.y<0||r.bottom>innerHeight+1||!(e===hit||e.contains(hit))) failures.push({text:e.textContent,w:r.width,h:r.height,x:r.x,y:r.y,hit:hit&&hit.id});}
    return failures;
  })()`);
}
async function padChecks() {
  await ev(`__paydirtSmoke.dock();__paydirtSmoke.seedStack(80);
    window.__mockSluicePad={connected:true,mapping:'standard',id:'Sluice test standard pad',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__mockSluicePad]});`);
  await until('window.__gamepad && __gamepad.connected','mock pad connected through production poll');
  async function down(index,on){await ev(`__mockSluicePad.buttons[${index}]={pressed:${on},value:${on?1:0}}`);await sleep(180);}
  async function press(index){await down(index,true);await down(index,false);}
  await press(10);await check('pad left stick opens station','__paydirtSmoke.state().open');
  await press(13);await check('pad direction focuses first material','document.activeElement.getAttribute("data-material")==="topsoil"');
  await press(3);await check('pad Y starts selected wash','__paydirtSmoke.state().model.pending && __paydirtSmoke.state().model.pending.count===80');
  await press(1);await check('pad B closes station','!__paydirtSmoke.state().open');
  await press(10);
  const y=await ev('__paydirtSmoke.state().y');await down(0,true);await sleep(350);
  await check('held pad A after native close cannot thrust',`!__paydirtSmoke.state().open && Math.abs(__paydirtSmoke.state().y-${y})<.1`);
  await down(0,false);await press(10);
  await until('__paydirtSmoke.state().model.pending.status==="ready"','pad wash ready',45000);
  const before=await ev('__paydirtSmoke.state().money+__paydirtSmoke.state().model.pending.value');
  await press(3);await press(3);
  await check('pad Y collects exactly once',`!__paydirtSmoke.state().model.pending && __paydirtSmoke.state().money===${before}`);
  await shot('sluice-gamepad-collection');
}
async function layoutChecks() {
  await ev('__paydirtSmoke.dock()');await key('p','KeyP');
  await ev('__paydirtSmoke.seedStack(600,"froststone")');await click('#gm-sluice-action');
  await check('long material status displays during actual processing','document.getElementById("gm-sluice-status").textContent==="Washing froststone grit" && __paydirtSmoke.state().model.pending.status==="washing"');
  for(const [width,height] of [[844,390],[568,320]]) {
    await size(width,height,true);
    assert.deepEqual(await controlsReachable(),[],`reachable controls ${width}x${height}`);passed(`layout controls remain reachable ${width}x${height}`);
    await ev('document.querySelector(".sluice-materials").scrollTop=0;document.querySelector(".sluice-workbench").scrollTop=0');await sleep(100);
    await check(`entire apparatus and action visible ${width}x${height}`,`(()=>{
      const m=document.getElementById('gm-sluice-machine').getBoundingClientRect(),b=document.querySelector('.sluice-workbench').getBoundingClientRect(),a=document.getElementById('gm-sluice-action').getBoundingClientRect();
      return m.height>=78 && m.x>=b.x && m.right<=b.right && m.top>=a.bottom && m.bottom<=b.bottom+.5 && a.height>=44 && a.top>=b.top && a.right<=b.right;
    })()`);
    await shot(`sluice-washing-landscape-${width}x${height}`);
  }
}
try {
  console.log(diagnostic?'CPU DIAGNOSTIC: explicit CPU comparison, not production GPU validation.':'PRODUCTION: ordinary non-dev WebGPU boot.');
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  const chromePath=process.env.CHROME || (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'));
  browser=spawn(chromePath,['--headless=new','--enable-unsafe-webgpu',
    '--use-angle='+(process.platform==='win32'?'d3d11':process.platform==='darwin'?'metal':'vulkan'),
    '--no-first-run','--disable-gpu-sandbox',`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'about:blank'],
    {stdio:'ignore',windowsHide:true});
  let target;
  for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  assert.ok(target,'disposable Chrome started');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>{ws.onopen=resolve;});
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id){const item=pending.get(message.id);pending.delete(message.id);if(item)message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error')errors.push(message.params.args);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await size(1280,800);await boot();
  if(process.env.LAYOUT_ONLY==='1') {
    await layoutChecks();
  } else if(process.env.PAD_ONLY==='1') {
    await padChecks();
  } else {
  await check('fresh ordinary game has empty bulk inventory','!__paydirtSmoke.state().dev && __paydirtSmoke.state().used===0 && __paydirtSmoke.state().stored===0');
  console.log('World material counts '+JSON.stringify(await ev('__paydirtSmoke.worldCounts()')));
  if(!diagnostic)await check('production water GPU is active','__paydirtSmoke.state().waterGPU');
  await ev('__paydirtSmoke.drillFixture("dirt",false)');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
  await until('__paydirtSmoke.cellCleared()','real drill clears dirt');
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  await check('actual drilling collects dirt outside ore cargo','__paydirtSmoke.state().used>=1 && __paydirtSmoke.state().model.held.topsoil>=1 && __paydirtSmoke.state().cargo===0');
  const blast=await ev('__paydirtSmoke.blastFixture()');
  assert.equal(blast.cleared,9);assert.equal(blast.after-blast.before,9);passed('real blast collects each cleared stone tile once');
  await ev('__paydirtSmoke.drillFixture("stone",true)');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
  await until('__paydirtSmoke.cellCleared()','full bulk bin still drills stone');
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  await check('full bin discards excess without blocking digging','__paydirtSmoke.state().used===__paydirtSmoke.state().capacity && __paydirtSmoke.state().cargo===0');
  await ev('__paydirtSmoke.dock()');
  await until('__paydirtSmoke.state().used===0 && __paydirtSmoke.state().stored>=600','actual pump-pad transfer');
  passed('docking unloads bulk without an ore sale');
  await until('!document.getElementById("gm-sluice-btn").hidden','surface entry button');
  await click('#gm-sluice-btn');await check('surface button opens sluice','__paydirtSmoke.state().open');
  await key('p','KeyP');await check('P closes station','!__paydirtSmoke.state().open');
  await key('p','KeyP');await check('P opens station','__paydirtSmoke.state().open');
  await ev('__paydirtSmoke.seedStack(80)');
  await shot('sluice-desktop-ready-to-wash');
  const position=await ev('JSON.stringify([__paydirtSmoke.state().x,__paydirtSmoke.state().y])');
  await key('ArrowUp');await key('ArrowDown');await key('1','Digit1');await key('i','KeyI');
  await check('station owns movement and gameplay keys',`__paydirtSmoke.state().open && JSON.stringify([__paydirtSmoke.state().x,__paydirtSmoke.state().y])===${JSON.stringify(position)}`);
  await click('#gm-sluice-action');
  await check('Wash transfers selected stack exactly once','__paydirtSmoke.state().model.pending.count===80 && __paydirtSmoke.state().model.stored.topsoil===0 && __paydirtSmoke.state().model.rollCounts.topsoil===80');
  const locked=await ev('JSON.stringify(__paydirtSmoke.state().model.pending.results)');
  await click('#gm-sluice-action');await check('repeated Wash input cannot consume twice','__paydirtSmoke.state().model.rollCounts.topsoil===80');
  await until('__paydirtSmoke.state().model.pending.elapsed>.25','real loop advances wash');
  await ev('window.dispatchEvent(new Event("blur"))');
  const inactiveElapsed=await ev('__paydirtSmoke.state().model.pending.elapsed');await sleep(350);
  await check('focus loss freezes wash and scheduler',`!__paydirtSmoke.state().active && __paydirtSmoke.state().model.pending.elapsed===${inactiveElapsed}`);
  await ev('window.dispatchEvent(new Event("focus"))');
  await until(`__paydirtSmoke.state().model.pending.elapsed>${inactiveElapsed}`,'focus resume');
  await shot('sluice-desktop-washing');
  await key('p','KeyP');await sleep(300);await key('p','KeyP');
  await check('closing and reopening preserves locked rewards',`JSON.stringify(__paydirtSmoke.state().model.pending.results)===${JSON.stringify(locked)}`);
  await until('__paydirtSmoke.state().model.pending.status === "ready"','real elapsed-time wash completes',45000);
  const specialPresented=await ev('document.getElementById("gm-sluice-status").textContent === "Sunwheel nugget found!" && __paydirtSmoke.state().model.pending.results.some(r=>r.id==="topsoil-exceptional" && r.count===1)');
  assert.ok(specialPresented,'real exceptional roll receives a named reveal');
  await shot('sluice-desktop-pan');
  const ready=await ev('({model:__paydirtSmoke.state().model.pending,money:__paydirtSmoke.state().money})');
  await ev('__paydirtSmoke.save()');await boot();await ev('__paydirtSmoke.dock()');await key('p','KeyP');
  await check('ready pan survives real reload without reroll',`__paydirtSmoke.state().model.pending.status==='ready' && JSON.stringify(__paydirtSmoke.state().model.pending.results)===${JSON.stringify(locked)}`);
  await click('#gm-sluice-action');
  await check('collect pays once and clears pending ownership',`!__paydirtSmoke.state().model.pending && __paydirtSmoke.state().money===${ready.money+ready.model.value} && __paydirtSmoke.state().model.washed.topsoil===80`);
  await check('named exceptional reveal becomes a retained specimen','__paydirtSmoke.state().model.finds["topsoil-exceptional"].count===1 && document.getElementById("gm-sluice-collection").textContent.includes("Sunwheel nugget")');
  await click('#gm-sluice-collection-title');await shot('sluice-desktop-specimen-collection');
  await click('#gm-sluice-action');
  await check('repeat collection cannot pay twice',`__paydirtSmoke.state().money===${ready.money+ready.model.value}`);
  for(const [width,height] of [[844,390],[568,320]]) {
    await size(width,height,false);const desktop=await ev('__paydirtSmoke.layout()');
    await size(width,height,true);const touch=await ev('__paydirtSmoke.layout()');
    // Desktop reserves native scrollbar gutters; touch uses overlay scrollbars.
    // Compare the actual arrangement and column widths, permitting only those
    // gutters inside the machine and the outer document's scrollbar offset.
    assert.equal(touch.columns,desktop.columns,`same columns at ${width}x${height}`);
    for(const part of ['panel','card','body','materials','bench']) {
      assert.ok(Math.abs(touch[part].w-desktop[part].w)<1 && Math.abs(touch[part].h-desktop[part].h)<1,`same ${part} size at ${width}x${height}`);
      assert.ok(Math.abs((touch[part].x-touch.panel.x)-(desktop[part].x-desktop.panel.x))<1,`same relative ${part} position`);
    }
    assert.ok(Math.abs(touch.machine.w-desktop.machine.w)<=16 && Math.abs(touch.machine.h-desktop.machine.h)<=6,'machine differs only by native scrollbar gutter');
    passed(`desktop/mobile layout parity ${width}x${height}`);
    assert.deepEqual(await controlsReachable(),[],`reachable 44px controls at ${width}x${height}`);passed(`all 44px controls reachable ${width}x${height}`);
    await ev('document.querySelector(".sluice-materials").scrollTop=0;document.querySelector(".sluice-workbench").scrollTop=0;document.getElementById("gm-sluice-close").scrollIntoView({block:"nearest"})');
    await sleep(100);await shot(`sluice-landscape-${width}x${height}`);
  }
  await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await size(844,390,true);await boot();await ev('__paydirtSmoke.dock()');await key('p','KeyP');
  await check('real mobile user agent enters same sluice','__paydirtSmoke.state().mobile && __paydirtSmoke.state().open');
  await ev('__paydirtSmoke.seedStack(40)');await click('#gm-sluice-action',true);
  await until('__paydirtSmoke.state().model.pending && __paydirtSmoke.state().model.pending.elapsed>.2','touch starts wash');
  await size(390,844,true);
  const portraitElapsed=await ev('__paydirtSmoke.state().model.pending.elapsed');await sleep(350);
  await check('portrait gate blocks panel and freezes processing',`__paydirtSmoke.state().portrait && document.getElementById('gm-sluice-panel').inert && !document.getElementById('gm-rotate-screen').hidden && __paydirtSmoke.state().model.pending.elapsed===${portraitElapsed}`);
  await shot('sluice-portrait-gate');
  await size(844,390,true);await until(`__paydirtSmoke.state().model.pending.elapsed>${portraitElapsed}`,'landscape resumes same wash');
  await key('p','KeyP');await click('#gm-pause-btn');
  const pausedElapsed=await ev('__paydirtSmoke.state().model.pending.elapsed');await size(390,844,true);await size(844,390,true);await sleep(250);
  await check('rotation preserves deliberate manual pause',`__paydirtSmoke.state().paused && __paydirtSmoke.state().model.pending.elapsed===${pausedElapsed}`);
  }
  assert.deepEqual(errors,[],'no runtime or console errors');
  console.log(`PASS ${checks} sluice checks. Screenshots: ${dump}`);
} catch(error) {
  if(ws)try{await shot('failure');fs.writeFileSync(path.join(dump,'failure.json'),JSON.stringify({error:String(error),errors,state:await ev('window.__paydirtSmoke && __paydirtSmoke.state()')},null,2));}catch{}
  throw error;
} finally {
  if(ws)ws.close();
  if(browser){browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,2000);}});}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  // This exact temporary directory was allocated above; no workspace paths are
  // enumerated or passed to another shell for cleanup.
  const resolvedProfile=fs.realpathSync(profile),resolvedTemp=fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(resolvedProfile),resolvedTemp,'cleanup stays directly in the system temporary directory');
  assert.ok(path.basename(resolvedProfile).startsWith('sluice-paydirt-chrome-'),'cleanup owns this exact test profile');
  fs.rmSync(resolvedProfile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
}
