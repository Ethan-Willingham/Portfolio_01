/* Real Chromium touch gestures, with native WebKit taps and a mouse bridge for
   WebKit drags. Playwright does not expose multi-touch dispatch on WebKit. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-touch',isWebkit=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data);});});
let browser;const errors=[];
async function neutral(p){assert.deepEqual(await p.evaluate(()=>__widewakeReach.input.stick),{x:0,y:0});assert.equal(await p.locator('#reach-helm').isVisible(),false);}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await(isWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  const url='http://127.0.0.1:'+server.address().port+'/widewake.html?test';
  for(const [width,height]of [[844,390],[667,375],[568,320],[390,844]]){
    const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(isWebkit)await p.addInitScript(()=>document.addEventListener('pointerdown',e=>{if(e.target.id==='reach-water'&&e.pointerType==='mouse')Object.defineProperty(e,'pointerType',{value:'touch'});},true));
    await p.addInitScript(()=>document.addEventListener('pointerdown',e=>{if(e.target.id==='reach-water')window.lastWaterPointer=e.pointerId;},true));await p.goto(url);await p.tap('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view.terrain.ready);await neutral(p);await p.tap('#cast-off');
    await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;Object.assign(g.player,{x:0,y:2000,px:0,py:2000,vx:0,vy:0,angle:0,previousAngle:0});g.nextEncounter=1e9;v.camera={x:0,y:2000};});
    const session=isWebkit?null:await c.newCDPSession(p),point={x:Math.round(width*.3),y:Math.round(height*.62),id:1};
    async function send(type,points){if(session)await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});else if(type==='touchStart'){await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();}else if(type==='touchMove')await p.mouse.move(points[0].x,points[0].y);else await p.mouse.up();await p.evaluate(()=>new Promise(requestAnimationFrame));}
    async function start(at=point){await send('touchStart',[at]);}
    async function move(dx,dy){await send('touchMove',[{...point,x:point.x+dx,y:point.y+dy}]);}
    async function end(){await send('touchEnd',[]);}
    await start();let box=await p.locator('#reach-helm').boundingBox();assert.ok(Math.abs(box.x+box.width/2-point.x)<1&&Math.abs(box.y+box.height/2-point.y)<1,'joystick starts at the contact');assert.deepEqual(await p.evaluate(()=>__widewakeReach.input.stick),{x:0,y:0});
    await move(3,2);assert.deepEqual(await p.evaluate(()=>__widewakeReach.input.stick),{x:0,y:0},'finger jitter stays neutral');
    await move(0,-22);const half=await p.evaluate(()=>__widewakeReach.input.stick.y);assert.ok(half<-.35&&half>-.8,'proportional throttle');
    await move(0,-60);await p.waitForTimeout(800);assert.ok(await p.evaluate(()=>__widewakeReach.input.stick.y<-.99&&__widewakeReach.game.player.vx>2),'real gesture drives along the bow');
    await p.screenshot({path:path.join(out,`${width}x${height}-steering.png`)});await end();await neutral(p);
    await start();await move(130,0);box=await p.locator('#reach-helm').boundingBox();assert.ok(box.x+box.width/2>point.x+80,'base follows long drags');await move(78,0);assert.ok(await p.evaluate(()=>__widewakeReach.input.stick.x<0),'short reverse drag changes rudder: '+JSON.stringify(await p.evaluate(()=>__widewakeReach.input))); await end();await neutral(p);
    // Either hand can start the helm; a tap begins and ends neutral.
    await p.tap('#reach-water',{position:{x:width*.7,y:height*.5}});await neutral(p);
    await start({x:width*.7,y:height*.5,id:1});assert.equal(await p.locator('#reach-helm').isVisible(),true);await end();await neutral(p);
    // Ring can be clipped at an edge without adding page overflow or losing release.
    await start({x:3,y:height*.5,id:1});assert.equal(await p.locator('#reach-helm').isVisible(),true);await end();await neutral(p);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(session){
      await start();await move(0,-48);const second={x:width*.65,y:height*.6,id:2},one={...point,y:point.y-48};await send('touchStart',[one,second]);await neutral(p);
      const before=await p.evaluate(()=>({zoom:__widewakeReach.view.targetZoom,offset:{...__widewakeReach.view.offset}}));
      await send('touchMove',[{...one,x:one.x-30,y:one.y+12},{...second,x:second.x+40,y:second.y+12}]);
      const after=await p.evaluate(()=>({zoom:__widewakeReach.view.targetZoom,offset:{...__widewakeReach.view.offset}}));assert.ok(after.zoom>before.zoom,'pinch zoom');assert.ok(Math.hypot(after.offset.x-before.offset.x,after.offset.y-before.offset.y)>.1,'two-finger camera pan '+JSON.stringify({before,after}));await neutral(p);
      await send('touchEnd',[second]);await send('touchMove',[{...one,y:one.y-50}]);await neutral(p);await end();await start();await move(0,-48);await send('touchCancel',[]);await neutral(p);
      await start();await move(0,-48);await p.evaluate(()=>{const e=document.getElementById('reach-water');e.releasePointerCapture(window.lastWaterPointer);});await move(0,-50);await neutral(p);await end();
      // A second finger on an action must not become a camera gesture.
      await start();await move(0,-48);const button=await p.locator('#camera-toggle').boundingBox(),tap={x:button.x+button.width/2,y:button.y+button.height/2,id:2},held={...point,y:point.y-48};await send('touchStart',[held,tap]);await send('touchEnd',[tap]);assert.equal(await p.getAttribute('#camera-toggle','aria-expanded'),'true');assert.ok(await p.evaluate(()=>__widewakeReach.input.stick.y<-.99));await end();await neutral(p);await p.tap('#camera-toggle');
      await start();await move(0,-48);await send('touchStart',[held,tap]);const dragged={...tap,x:tap.x-55,y:tap.y-55};await send('touchMove',[held,dragged]);await send('touchEnd',[dragged]);assert.equal(await p.getAttribute('#camera-toggle','aria-expanded'),'false','dragging off cancels the action');await end();await neutral(p);
      await start();await move(0,-48);const chart=await p.locator('#chart-open').boundingBox(),chartTap={x:chart.x+chart.width/2,y:chart.y+chart.height/2,id:2};await send('touchStart',[held,chartTap]);await send('touchEnd',[chartTap]);assert.equal(await p.evaluate(()=>__widewakeReach.mode),'chart','second-finger chart tap');await neutral(p);await end();await p.tap('[data-close="reach-chart"]');
    }
    await start();await move(0,-48);await p.keyboard.press('Escape');await neutral(p);const time=await p.evaluate(()=>__widewakeReach.game.time);await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__widewakeReach.game.time),time);await end();await p.tap('#reach-resume');await neutral(p);
    await start();await move(0,-48);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await neutral(p);assert.equal(await p.evaluate(()=>__widewakeReach.mode),'menu');await end();await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.tap('#reach-resume');
    await start();await move(0,-48);await p.setViewportSize({width:height,height:width});await p.waitForFunction(()=>__widewakeReach.input.stick.y===0);await neutral(p);await end();await p.setViewportSize({width,height});
    await p.tap('#chart-open');await neutral(p);await p.tap('[data-close="reach-chart"]');await neutral(p);
    if(width===844){await p.tap('#reach-pause');await p.tap('#menu-combat');await start();await move(0,-48);assert.ok(await p.evaluate(()=>__widewakeReach.game.endgame&&__widewakeReach.input.stick.y<-.99));await end();await neutral(p);await p.tap('#reach-pause');await p.tap('#leave-combat');await neutral(p);}
    await c.close();console.log(`PASS ${width}x${height}: floating origin, dead zone, analog helm, following base, either hand, release, menus, blur and rotation`);
  }
  // Desktop still uses drag to pan and wheel to zoom.
  const c=await browser.newContext({viewport:{width:1200,height:800}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view.terrain.ready);await p.click('#cast-off');await p.mouse.move(500,400);await p.mouse.down();await p.mouse.move(560,430);await p.mouse.up();assert.ok(await p.evaluate(()=>Math.hypot(__widewakeReach.view.offset.x,__widewakeReach.view.offset.y)>1));await neutral(p);const zoom=await p.evaluate(()=>__widewakeReach.view.targetZoom);await p.mouse.wheel(0,-100);assert.ok(await p.evaluate(z=>__widewakeReach.view.targetZoom>z,zoom));await c.close();
  assert.deepEqual(errors,[]);console.log('PASS desktop camera and clean runtime; '+(isWebkit?'native WebKit taps and bridged drags':'real Chromium multi-touch, capture loss, cancel and simultaneous HUD actions'));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
