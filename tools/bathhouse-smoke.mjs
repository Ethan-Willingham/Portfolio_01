// Full bathhouse regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/bathhouse-smoke.mjs (screenshots go to /tmp, never the repo).
// Use --defaults-only for boot preferences, or --layout-only for responsive dev playtests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8183), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-bathhouse-');
const out = process.env.DUMP || '/tmp/sluice-bathhouse-qa';
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
const boilerCenter = '(function(){var r=bathBoilerScreenRect();return {x:r.x+r.w/2,y:r.y+r.h/2};})()';
const buttonCenter = action => `(function(){var b=hearthButtons.find(b=>b.action===${JSON.stringify(action)});return {x:b.x+b.w/2,y:b.y+b.h/2};})()`;
async function clientPoint(target) {
  return game(`(function(){var r=${target};var box=canvas.getBoundingClientRect();return {x:box.left+r.x*box.width/(canvas.width/dpr),y:box.top+r.y*box.height/(canvas.height/dpr)};})()`);
}
async function press(target, touch = false) {
  const point = await clientPoint(target);
  if(touch){
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  }
  await ev('new Promise(resolve=>requestAnimationFrame(()=>resolve()))');
}
async function move(target) {
  const point = await clientPoint(target);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
}
async function key(key, code) {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});
}
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
async function boilerFlow(label,touch=false) {
  await game('updateCamera();render()');
  check(label+' bath and all boiler controls share one view',await game("bathMode && hearthView==='bath' && ['coal','pump','strike','ash','water'].every(a=>hearthButtons.some(b=>b.action===a)) && !hearthButtons.some(b=>['bath','boiler','forge'].includes(b.action))"));
  const before = await game('JSON.stringify({water:bathWater,pour:bathPour,stock:forgeStock})');
  if (!touch) {
    await move(boilerCenter);await game('render()');
    check(label+' integrated firebox indicates direct dragging',await game("bathBoilerHover && canvas.style.cursor==='grab'"));
    await screenshot(label+'-boiler-hover');
    await move('({x:4,y:hearthNavHeight()+4})');await game('render()');
    check(label+' hover clears away from the firebox',await game('!bathBoilerHover'));
  }
  const camera=await game('JSON.stringify({x:cam.x,y:cam.y,scale:worldScale})');
  await press(boilerCenter,touch);await game('updateCamera();render()');
  check(label+' touching the grate never opens another screen or moves the camera',await game("hearthView==='bath'") && await game('JSON.stringify({x:cam.x,y:cam.y,scale:worldScale})')===camera);
  await press(buttonCenter('pump'),touch);
  check(label+' bellows operate from the bath',await game('hearthBeds.boiler.air>0.1'));
  check(label+' tending controls preserve water and stored supplies',await game('JSON.stringify({water:bathWater,pour:bathPour,stock:forgeStock})')===before);
}

try {
  let endpoint;
  for(let i=0;i<100;i++) { try {const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100); }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});
  for(let i=0;i<600;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))break;await sleep(100);}
  if (!await game("introPhase === 'done'")) { console.log('BOOT',await ev('({error:window.__bootErr,text:document.body.innerText})')); await screenshot('boot-failure'); }
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));
  if (process.argv.includes('--layout-only')) {
    await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
    await game('bathEnter()'); await sleep(700);
    await boilerFlow('desktop');
    check('single-room wheel and drag targets cannot reveal the old tower',await game(`(function(){
      var y=cam.y;bathScrollT-=120;bathCamPin();var stable=cam.y===y;
      bathScrollT+=240;bathCamPin();return stable&&cam.y===y&&bathMainRoomVisible();})()`));
    check('saved upper-floor scrolling has no easing or later camera drift',await game(`(function(){
      var owned=bathFloorsOwned[1];bathFloorsOwned[1]=true;var y=cam.y;
      bathScrollT=y-80;bathCamPin();var immediate=cam.y===y-80;
      for(var i=0;i<12;i++)bathCamPin();var stable=cam.y===y-80;
      bathFloorsOwned[1]=owned;hearthSetView('boiler');hearthSetView('bath');bathCamPin();
      return immediate&&stable&&cam.y===y;})()`));

    await key('`', 'Backquote');
    check('backtick enables dev mode inside the banya',await game('devMode'));
    check('world debug buttons are hidden in the banya',await ev("['gmTuneBtn','gmSlimeBtn'].every(id=>!document.getElementById(id)||getComputedStyle(document.getElementById(id)).display==='none')"));
    const stock = await game('JSON.stringify({stock:forgeStock,tank:siphon.tank,supplies:bathSupplies,cargo:cargo})');
    await game('skySlimes=[];bathGuests=[];skySlimeNext=100000;render()');
    await press('(function(){var b=hearthButtons.find(b=>b.action===\'kit\');return {x:b.x+b.w/2,y:b.y+b.h/2};})()');
    check('prepare bath starts a real fire and a bounded water pour',await game('hearthView===\'bath\' && hearthBeds.boiler.chunks.some(b=>b.lit) && bathPour>0 && bathPour<=BATH_MAX_WATER'));
    for(var wait=0;wait<180;wait++){if(await game('bathWater>=BATH_MIN_WATER && bathCanServe() && bathPour===0'))break;await sleep(500);}
    console.log('DEV BATH',await game('({water:bathWater,pour:bathPour,heat:bathHeat,power:hearthBeds.boiler.power})'));
    check('dev supply water reaches the real basin',await game('bathWater>=BATH_MIN_WATER && bathCanServe() && bathPour===0'));
    check('mine lighting leaves the real bath water unmasked',await game(`(function(){
      var wasEnabled=lightTune.enabled;lightTune.enabled=true;
      var curve=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),mask=liquidTerrainRenderMask();
      var rgba=mask.ctx.getImageData(Math.round((curve.x0+curve.x1)/2-mask.x),Math.round(curve.y0+curve.D*0.85-mask.y),1,1).data;
      lightTune.enabled=wasEnabled;return rgba[0]===0;
    })()`));
    await sleep(2000);
    await screenshot('live-filled-bath');
    check('actual water renders inside the curved basin',await game(`(function(){
      drawLiquids();
      var source=liquidWGPU&&liquidWGPU.renderActive?liquidWGPU.renderCanvas:liquidGLCanvas;
      if(!source)return false;
      var image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height;
      var ic=image.getContext('2d');ic.drawImage(source,0,0,image.width,image.height);
      var rgba=ic.getImageData(0,0,image.width,image.height).data;
      var curve=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),scale=dpr*worldScale,count=0;
      for(var x=curve.x0+4;x<curve.x1;x+=4)for(var y=curve.y0+4;y<curve.y0+curve.depthAt(x)-2;y+=4){
        var px=Math.round((x-cam.x)*scale),py=Math.round((y-cam.y)*scale);
        if(px>=0&&py>=0&&px<image.width&&py<image.height&&rgba[(py*image.width+px)*4+3]>16)count++;
      }
      return count>25;
    })()`));
    await press('(function(){var b=hearthButtons.find(b=>b.action===\'guest\');return {x:b.x+b.w/2,y:b.y+b.h/2};})()');
    await sleep(900);
    check('guest button places a real waiting guest',await game('bathGuests.length===1 && bathGuests[0].st===\'wait\''));
    await game('cancelAnimationFrame(gameRafId);gameRafId=0');
    for(const [width,height] of [[1440,714],[1280,900],[800,600],[390,844],[320,568],[844,390],[667,375],[568,320],[540,320],[520,320]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
      await game('isMobile='+String(width<500)+';resize()');
      for(const view of ['bath']) {
        await game('hearthSetView('+JSON.stringify(view)+');updateCamera();render()');
        // The GPU liquid renderer refreshes its view mapping in a real frame.
        // Let the resized scene settle before freezing geometry for inspection.
        await game('gameRafId=requestAnimationFrame(loop)'); await sleep(250);
        await game('cancelAnimationFrame(gameRafId);gameRafId=0');
        const fits = await game(`(function(){
          var bs=hearthButtons,w=canvas.width/dpr,h=canvas.height/dpr;
          for(var i=0;i<bs.length;i++){
            var a=bs[i];if(a.x<0||a.y<0||a.x+a.w>w||a.y+a.h>h||a.h<40)return false;
            for(var j=i+1;j<bs.length;j++){var b=bs[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)return false;}
          }
          var L=hearthRoomLayout(),tub=BATH_FLOORS[0],curve=bathTubCurve(tub,tub.tubs[0]),boiler=L.box;
          var left=(curve.x0-cam.x)*worldScale,right=(curve.x1-cam.x)*worldScale;
          var lip=(curve.y0-cam.y)*worldScale,bottom=(curve.y0+curve.D-cam.y)*worldScale;
          var overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
          return hearthView==='bath' && !bs.some(b=>['forge','boiler','bath'].includes(b.action)) &&
            ['coal','pump','strike','ash','water'].every(a=>bs.some(b=>b.action===a)) &&
            left>=L.scene.x&&right<=L.scene.x+L.scene.w&&lip>=L.scene.y&&bottom<=L.scene.y+L.scene.h&&
            boiler.w>=44&&boiler.h>=44&&boiler.x>=0&&boiler.x+boiler.w<=w&&
            boiler.y>=L.top&&boiler.y+boiler.h<L.footer&&!overlap(boiler,L.scene)&&
            bs.every(b=>!overlap(b,boiler));
        })()`);
        if (!fits) console.log('LAYOUT',await game('({view:hearthView,buttons:hearthButtons,layout:hearthRoomLayout(),boiler:bathBoilerScreenRect(),nav:hearthNavHeight(),hud:bathHUDHeight()})'));
        await screenshot('layout-'+width+'x'+height+'-'+view);
        check(width+'x'+height+' '+view+' controls fit without overlap',fits);
        if (width === 1440 && height === 714) {
          check('desktop room uses the reclaimed area for a broad firebox and larger bath',await game(`(function(){
            var L=hearthRoomLayout(),c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]);
            return L.box.w>L.w*0.40 && L.box.h<L.h*0.27 && (c.x1-c.x0)*worldScale>L.w*0.58 && bathHUDHeight()<=80;
          })()`));
        }
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(300);
    await game('isMobile=true;resize();updateCamera();render()');
    await boilerFlow('phone',true);
    await press('(function(){var r=bathOrderRect(bathGuests[0]);return {x:(r.x+r.w/2-cam.x)*worldScale,y:(r.y+r.h/2-cam.y)*worldScale};})()',true);
    await sleep(100);
    check('phone touch serves dev guest through the visible order',await game('bathGuests[0].st!==\'wait\''));
    check('dev interactions preserve the real supply inventory',await game('JSON.stringify({stock:forgeStock,tank:siphon.tank,supplies:bathSupplies,cargo:cargo})')===stock);
    await key('`','Backquote');
    await game('render()');
    check('backtick restores normal supplies and hides dev controls',await game('!devMode && !hearthButtons.some(b=>b.action===\'kit\'||b.action===\'guest\') && forgeCount(\'coal\')===forgeStock.coal'));
    for(const [width,height] of [[390,844],[1280,900]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
      await game('isMobile='+String(width<500)+';resize();gameRafId=requestAnimationFrame(loop)');await sleep(1500);
      await screenshot('final-bath-ready-'+width+'x'+height);
      await game('cancelAnimationFrame(gameRafId);gameRafId=0');
    }
    check('no layout, shader or runtime errors',errors.length===0);
    console.log('Screenshots: '+out);
  } else if (process.argv.includes('--defaults-only')) {
    async function reload(query = '') {
      await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35${query}`});
      await sleep(300);
      for(let i=0;i<600;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))return;await sleep(100);}
      throw Error('reload did not finish');
    }
    await ev("localStorage.setItem('sluice.opt.banya','0');localStorage.removeItem('sluice.opt.banya-default');localStorage.setItem('sluice.banya-test-save','keep')");
    await reload();
    check('returning off profile now sees the banya',await game("ENABLE_BATH && bathPickSite() && isPointOnBanya(banyaX+BANYA_W/2,SKY_ROWS*TILE-100)"));
    check('options show the migrated on setting',await ev("document.getElementById('gm-banya-on').getAttribute('aria-pressed')==='true' && localStorage.getItem('sluice.banya-test-save')==='keep'"));
    await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
    await game('player.x=banyaDoorX0-80;player.y=SKY_ROWS*TILE-PLAYER_H;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();render()');
    await screenshot('default-banya');
    await press('({x:(banyaX+BANYA_W/2-cam.x)*worldScale,y:(SKY_ROWS*TILE-120-cam.y)*worldScale})');
    await sleep(700);
    check('visible tower click opens the bath',await game("bathMode && hearthView==='bath'"));
    await screenshot('default-bath');
    await boilerFlow('default');
    await game('bathExit()');await sleep(700);
    await ev("document.getElementById('gm-banya-off').click()");
    await reload();
    check('later deliberate off choice persists',await game("!ENABLE_BATH && !isPointOnBanya(banyaX+BANYA_W/2,SKY_ROWS*TILE-100)"));
    await reload('&bath=1');
    check('URL on overrides without overwriting off',await game("ENABLE_BATH && localStorage.getItem('sluice.opt.banya')==='0'"));
    await ev("document.getElementById('gm-banya-on').click()");
    await reload('&bath=0');
    check('URL off overrides without overwriting on',await game("!ENABLE_BATH && localStorage.getItem('sluice.opt.banya')==='1'"));
    await reload();
    check('ordinary reload restores selected on',await game('ENABLE_BATH'));
    check('preference migration has no browser errors',errors.length===0);
  } else {
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(500);
  // This fast-forward advances visitors only. Remove starter gel residents so
  // their paused soft bodies do not become immovable collision barriers.
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;resetJello();devMode=false;skySlimes=[];skySlimeNext=0.01;player.x=banyaDoorX0-150;player.y=SKY_ROWS*TILE-PLAYER_H;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera()');
  await game('skySlimeTick(0.05);render()');await screenshot('arrival');
  // Keep the parked rig out of the visitors' way: contact play intentionally
  // suspends their door navigation while the player remains nearby.
  await game('player.x=banyaDoorX0+450;player.renderX=player.x;player.vx=0;player.vy=0;skySlimeRigLast=null');
  await game('for(var n=0;n<900;n++){skySlimeTick(0.1);bathGuestTick(0.1);}render()');
  // Random ponds can delay one arrival. Give the real navigation a bounded
  // second window, while retaining two guests for the later phone admission.
  await game('for(var n=0;n<1500 && bathGuests.length<2;n++){skySlimeTick(0.1);bathGuestTick(0.1);}render()');
  await game('for(var n=0;n<20;n++)bathGuestTick(0.1);render()');
  console.log('VISITORS',await game('({outside:skySlimes.map(function(s){return {visit:s.visit,x:s.x,y:s.y,age:s.age,playing:s.playing,wet:s.wet};}),inside:bathGuests.length,door:banyaDoorX0})'));
  check('sky visitors find the real world door',await game('bathGuests.length===2 && bathGuests.every(function(g){return g.st==="wait";})'));
  await game('bathEnter()');await sleep(600);await game('updateCamera();render()');
  await boilerFlow('normal');
  check('new bath starts dry and unheated',await game('bathWater===0 && bathFire===0 && bathHeat===0'));
  await screenshot('waiting-dry');
  check('cold dry tub refuses admission',await game('!bathServe(bathGuests[0].s.id)'));
  await game('cargo=Array.from({length:3},function(){return {type:"coal"};});siphon.tank[0]=12000;hearthSetView("boiler");hearthLoadCoal("boiler",120,12);hearthLoadCoal("boiler",150,12);hearthLoadCoal("boiler",180,12);for(var n=0;n<60;n++)bathGuestTick(1/60);render()');
  check('three physical chunks consume exactly three coal',await game('cargo.length===0 && forgeCount("coal")===0 && hearthBeds.boiler.chunks.length===3'));
  check('built-in steel still needs mined flint for ignition',await game('hearthHasTool("steel") && !hearthHasTool("flint") && !hearthStrike() && hearthBeds.boiler.chunks.every(function(b){return !b.lit;})'));
  await game('forgeStoneSinceFlint=FORGE_FLINT_GUARANTEE-1;forgeStoneDrop("stone");render()');
  await press('(function(){var b=hearthButtons.find(function(b){return b.action==="strike";});return {x:b.x+b.w/2,y:b.y+b.h/2};})()');
  check('mouse strike lights physical fuel without consuming tools',await game('hearthBeds.boiler.chunks.some(function(b){return b.lit;}) && forgeCount("flint")===1 && forgeCount("steel")===1 && forgeCount("coal")===0'));
  await game('for(var n=0;n<180;n++)bathGuestTick(1/60);hearthSetView("bath");render()');
  await press('({x:bathServiceButtons[0].x+80,y:bathServiceButtons[0].y+20})');
  check('mouse refill transfers existing tank water',await game('siphon.tank[0]===0 && bathPour===12000'));
  await game('gameRafId=requestAnimationFrame(loop)');
  for(let wait=0;wait<80;wait++){
    if(await game('bathWater>=BATH_MIN_WATER && bathHeat>0.35 && bathPour===0'))break;
    await sleep(500);
  }
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  console.log('WATER',await game('({water:bathWater,heat:bathHeat,pour:bathPour,liquid:liquidCount,lost:bathLostWater})'));
  await screenshot('warming');
  check('real water fills and warms',await game('bathWater>=BATH_MIN_WATER && bathHeat>0.35 && bathPour===0'));
  const id=await game('bathGuests[0].s.id');
  const before=await game('({water:bathWater,coal:cargo.length})');
  check('ready order admits without a per-guest resource fee',await game(`bathServe(${id}) && cargo.length===${before.coal} && bathWater===${before.water}`));
  await game('gameRafId=requestAnimationFrame(loop)');await sleep(4000);
  await screenshot('soaking');
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  check('guest is soaking in the actual tub',await game('bathGuests.some(function(g){return g.st==="soak";})'));
  const beforePay=await game('money');
  await game('for(var n=0;n<220;n++)bathGuestTick(0.1)');
  check('guest pays once after the soak',await game(`money===${beforePay}+BATH_VISIT.pay && bathServed===1`));
  check('splashed water is permanently drained',await game('bathLostWater>0 && bathWater<12000'));
  await screenshot('paid');
  const saved=await game('window.__bathFixtureSave=JSON.parse(JSON.stringify(saveBuild()));({money:money,water:bathBasinCount(),lost:bathLostWater,heat:bathHeat,fire:bathFire,fuel:hearthBeds.boiler.chunks.reduce(function(sum,b){return sum+b.fuel*b.life*(b.fuelShare||1);},0)})');
  await game('init();saveApply(window.__bathFixtureSave);delete window.__bathFixtureSave;introPhase="done";bathMode=true;hearthSetView("bath");bathWater=bathBasinCount();bathArmHeat();bathCamPin();render()');
  console.log('RELOAD', { before: saved, after: await game('({money:money,water:bathWater,lost:bathLostWater,heat:bathHeat,fire:bathFire,fuel:hearthBeds.boiler.fuelSeconds})') });
  check('reload preserves fuel, fire, heat, water and permanent loss',await game(`money===${saved.money} && bathWater===${saved.water} && bathLostWater===${saved.lost} && Math.abs(bathHeat-${saved.heat})<1e-9 && Math.abs(hearthBeds.boiler.fuelSeconds-${saved.fuel})<1e-7 && Math.abs(bathFire-${Math.min(saved.fire,saved.fuel)})<1e-7`));
  await game('for(var n=0;n<70;n++)bathGuestTick(0.1)');
  check('reload does not repeat payment',await game(`money===${saved.money}`));
  await game('beginSceneLoading("Restoring bath");gameRafId=requestAnimationFrame(loop)');
  for(let wait=0;wait<300;wait++){if(await game('introPhase==="done" || document.getElementById("game-intro").dataset.state==="error"'))break;await sleep(100);}
  if(!await game('introPhase==="done"')) console.log('RESTORE LOADING',JSON.stringify(await ev('SluiceLoading.report()'),null,2));
  check('restored scene completes its real loading gates',await game('introPhase==="done"'));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize();for(var frame=0;frame<60;frame++)updateCamera();render()');await screenshot('mobile');
  await boilerFlow('normal-phone',true);
  check('phone order cards remain readable',await game('bathGuests.filter(function(g){return g.st==="wait";}).every(function(g){return bathOrderRect(g).w*worldScale>=130;})'));
  check('touch resource controls stay large and the fire is reached in the room',await game('bathServiceButtons.length>=1 && bathServiceButtons.every(function(b){return b.h>=40;}) && !bathServiceButtons.some(function(b){return b.action==="boiler";})'));
  await press('(function(){var g=bathGuests.find(function(g){return g.st===\"wait\";}),r=bathOrderRect(g);return {x:(r.x+r.w/2-cam.x)*worldScale,y:(r.y+r.h/2-cam.y)*worldScale};})()',true);
  check('phone tap admits the waiting visitor',await game('bathGuests.every(function(g){return g.st!=="wait";})'));
  check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
  }
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
