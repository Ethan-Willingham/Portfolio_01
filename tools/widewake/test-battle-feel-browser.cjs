/* Real UI feedback and render interpolation, separate from the load benchmark. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),isWebkit=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-battle-feel-browser');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[],check=s=>console.log('PASS '+s);
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await(isWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.WIDEWAKE_TEST_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/widewake-battle.html?test&population=0');await p.click('#resume');await p.locator('#broadside').hover();assert.equal(await p.evaluate(()=>__widewakeBattle.view.showBroadside),true);
  await p.screenshot({path:path.join(out,'broadside-preview.png')});await p.mouse.move(700,500);assert.equal(await p.evaluate(()=>__widewakeBattle.view.showBroadside),false);
  await p.locator('#work-toggle').focus();await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'broadside');assert.equal(await p.evaluate(()=>__widewakeBattle.view.showBroadside),true);
  await p.keyboard.press('Space');assert.equal(await p.locator('#broadside').isDisabled(),true);assert.equal(await p.locator('#broadside-clock').textContent(),'12s');assert.equal(await p.evaluate(()=>__widewakeBattle.view.showBroadside),false);
  await p.click('#pause');const cursor=await p.evaluate(()=>__widewakeBattle.battle.burstCursor);assert.ok(cursor>0&&cursor<48);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>__widewakeBattle.battle.burstCursor),cursor);await p.click('#resume');await p.waitForTimeout(550);assert.equal(await p.evaluate(()=>__widewakeBattle.battle.burstCursor),48);assert.equal(await p.evaluate(()=>__widewakeBattle.battle.shots.peak),48);
  check('mouse and keyboard broadside preview, immediate cooldown feedback and exact volley continuation after pause');

  await p.click('[data-zoom="fleet"]');await p.waitForTimeout(600);await p.mouse.move(1410,400);await p.mouse.down();await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>WidewakeOcean.aimGuide(__widewakeBattle.battle.player,__widewakeBattle.battle.control.aim).inRange),false);await p.screenshot({path:path.join(out,'out-of-range.png')});await p.mouse.up();
  await p.click('[data-zoom="helm"]');await p.waitForTimeout(600);await p.mouse.move(900,500);await p.mouse.down();await p.waitForTimeout(60);assert.equal(await p.evaluate(()=>WidewakeOcean.aimGuide(__widewakeBattle.battle.player,__widewakeBattle.battle.control.aim).inRange),true);
  await p.evaluate(()=>{const b=__widewakeBattle.battle,a=b.control.aim;b.raiders.add(a.x,a.y,2,b.random);b.raiders.hp[b.raiders.count-1]=1200;});await p.waitForFunction(()=>__widewakeBattle.battle.lastHit.time>0);await p.screenshot({path:path.join(out,'manual-hits.png')});await p.mouse.up();
  assert.ok(await p.evaluate(()=>__widewakeBattle.sound.stats.peakVoices)<=64);check('out-of-range guide and owned hit confirmation during actual pointer fire');

  await p.keyboard.down('d');await p.waitForTimeout(1200);await p.click('#pause');await p.keyboard.up('d');
  const interpolation=await p.evaluate(()=>{
    const v=__widewakeBattle.view,b=__widewakeBattle.battle,s=b.player;v.follow=false;
    const original={x:s.x,y:s.y,angle:s.angle,time:b.time},draw=[];
    for(const alpha of [0,.5,1]){v.render(0,alpha);draw.push({alpha,x:v.batches.flagship.data[0]+v.camera.x,y:v.batches.flagship.data[1]+v.camera.y,angle:v.poses[0].angle});}
    const unchanged=s.x===original.x&&s.y===original.y&&s.angle===original.angle&&b.time===original.time;
    return{draw,unchanged,previousX:s.px,x:s.x};
  });
  assert.equal(interpolation.unchanged,true);assert.ok(interpolation.x>interpolation.previousX);assert.ok(Math.abs(interpolation.draw[0].x-interpolation.previousX)<.001);assert.ok(Math.abs(interpolation.draw[2].x-interpolation.x)<.001);assert.ok(Math.abs(interpolation.draw[1].x-(interpolation.draw[0].x+interpolation.draw[2].x)/2)<.001);
  const reduced=await p.evaluate(()=>{
    const v=__widewakeBattle.view,b=__widewakeBattle.battle,m=b.mounts[0];m.recoil=4;b.effects.count=0;b.effects.add(b.player.x,b.player.y,10,1);v.reduced=false;v.render(0);const normal={x:v.batches.barrel.data[0],y:v.batches.barrel.data[1],effects:v.quad.count};v.reduced=true;v.render(0);return{normal,reduced:{x:v.batches.barrel.data[0],y:v.batches.barrel.data[1],effects:v.quad.count}};
  });
  assert.ok(Math.hypot(reduced.normal.x-reduced.reduced.x,reduced.normal.y-reduced.reduced.y)>3.9);assert.equal(reduced.normal.effects,1);assert.equal(reduced.reduced.effects,0);
  check('rendered hulls interpolate without advancing simulation; reduced motion removes recoil and impact flashes');

  const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),touch=await phone.newPage();touch.on('pageerror',e=>errors.push(e.message));
  await touch.goto(base+'/widewake-battle.html?test&population=0');await touch.tap('#resume');await touch.tap('#broadside');await touch.waitForTimeout(600);assert.equal(await touch.evaluate(()=>__widewakeBattle.view.showBroadside),false);assert.equal(await touch.evaluate(()=>__widewakeBattle.battle.burstCursor),48);await touch.screenshot({path:path.join(out,'touch-reload.png')});await phone.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'feel-browser.json'),JSON.stringify({engine:isWebkit?'webkit':'chromium',interpolation,reduced},null,2)+'\n');check('touch firing does not leave a hover preview stuck on screen; no browser errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
