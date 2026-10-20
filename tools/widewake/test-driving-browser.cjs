/* Readable boats, real controls, wake rendering and camera behavior at device sizes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-v024/driving',isWebkit=process.env.WIDEWAKE_TEST_ENGINE==='webkit';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[],reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await(isWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  for(const [width,height,touch,fallback]of [[1440,900,false,false],[390,844,true,false],[844,390,true,false],[568,320,true,false],[844,390,true,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(touch&&isWebkit)await p.addInitScript(()=>document.addEventListener('pointerdown',e=>{if(e.target.id==='reach-water'&&e.pointerType==='mouse')Object.defineProperty(e,'pointerType',{value:'touch'});},true));
    if(fallback)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
    await p.goto(base+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view.terrain.ready);await p.click('#cast-off');
    await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;Object.assign(g.player,{x:0,y:2000,px:0,py:2000,angle:0,previousAngle:0});g.nextEncounter=1e9;v.camera={x:0,y:2000};});
    await p.waitForFunction(()=>Math.abs(__widewakeReach.view.zoom-__widewakeReach.view.stops.helm)<.01);
    const size=await p.evaluate(()=>{const v=__widewakeReach.view,s=__widewakeReach.game.player;return s.length*v.zoom*v.baseScale;});assert.ok(size>=39.8&&size<=40.2,'at least 40 CSS pixels in the most foreshortened heading');assert.equal(await p.locator('#broadside').count(),0);
    const start=await p.evaluate(()=>__widewakeReach.game.player.x),touchSession=touch&&!isWebkit?await context.newCDPSession(p):null;
    async function steer(x,y,ms){if(touch){const point={x:width*.3,y:height*.6,id:2},end={...point,x:point.x+x*48,y:point.y+y*48};if(touchSession){await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});}else{await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(end.x,end.y);}await p.waitForTimeout(ms);if(touchSession)await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();}else{const held=[...(x?[x>0?'d':'a']:[]),...(y?[y>0?'s':'w']:[])];for(const key of held)await p.keyboard.down(key);await p.waitForTimeout(ms);for(const key of held)await p.keyboard.up(key);}}
    await steer(0,-1,2300);await steer(.45,-1,650);
    const state=await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach,p=v.project(g.player.x,g.player.y);return{x:g.player.x,speed:Math.hypot(g.player.vx,g.player.vy),points:v.wakes.count,segments:v.stats.wakeSegments,stats:v.stats,screen:{x:p.x/v.width,y:p.y/v.height},error:v.gl?.getError()||0};});
    assert.ok(state.x>start+10&&state.points>12&&state.segments>5,JSON.stringify({width,height,fallback,state}));assert.equal(state.error,0);assert.ok(state.screen.x>.2&&state.screen.x<.8&&state.screen.y>.2&&state.screen.y<.8);assert.ok(state.stats.wakeBytes<=65536);await p.screenshot({path:path.join(out,`${width}x${height}${fallback?'-canvas':''}.png`)});
    if(!touch){
      const reset=angle=>p.evaluate(angle=>{const s=__widewakeReach.game.player;Object.assign(s,{x:0,px:0,y:2000,py:2000,vx:0,vy:0,turn:0,throttle:0,angle,previousAngle:angle});},angle);
      for(const [key,angle]of [['w',0],['ArrowUp',Math.PI/2],['w',Math.PI],['ArrowUp',-Math.PI/2]]){
        await reset(angle);await p.keyboard.down(key);await p.waitForTimeout(850);await p.keyboard.up(key);
        const s=await p.evaluate(()=>({...__widewakeReach.game.player}));assert.ok(s.x*Math.cos(angle)+(s.y-2000)*Math.sin(angle)>3,'forward follows the bow');assert.ok(Math.abs(s.vx*Math.sin(angle)-s.vy*Math.cos(angle))<.001,'engine velocity follows the bow independently of the current');
      }
      for(const [key,sign]of [['a',-1],['ArrowLeft',-1],['d',1],['ArrowRight',1]]){await reset(0);await p.keyboard.down(key);await p.waitForTimeout(450);await p.keyboard.up(key);assert.ok(await p.evaluate(sign=>__widewakeReach.game.player.angle*sign>.1,sign));}
      await reset(0);await p.keyboard.down('w');await p.waitForTimeout(1000);await p.keyboard.up('w');await p.keyboard.down('ArrowDown');await p.waitForTimeout(1200);await p.keyboard.up('ArrowDown');assert.ok(await p.evaluate(()=>__widewakeReach.game.player.vx>=0&&__widewakeReach.game.player.vx<1));
      // Exercise the real controller poller and shell mapping, including its
      // neutral gate. No simulation input is injected directly.
      await reset(Math.PI);await p.evaluate(()=>{window.helmPad={id:'Standard test controller',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[helmPad]});});await p.waitForFunction(()=>__widewakeReach.controller.present&&!__widewakeReach.controller.blocked);
      await p.evaluate(()=>helmPad.axes=[0,-1,0,0]);await p.waitForTimeout(900);assert.ok(await p.evaluate(()=>__widewakeReach.game.player.x< -3));await p.evaluate(()=>helmPad.axes=[.7,-.7,0,0]);await p.waitForTimeout(400);assert.ok(await p.evaluate(()=>WidewakeBattle.angleDelta(__widewakeReach.game.player.angle,Math.PI)>.2));await p.evaluate(()=>helmPad.axes=[0,0,0,0]);
      await p.click('#reach-pause');await p.evaluate(()=>helmPad.axes=[0,-1,0,0]);await p.click('#reach-resume');await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__widewakeReach.game.control.throttle),0,'held controller input stays blocked after pause');await p.evaluate(()=>helmPad.axes=[0,0,0,0]);await p.waitForFunction(()=>!__widewakeReach.controller.blocked);
    }
    // Paused water and wakes are unchanged; opening a camera tool cannot fire.
    await p.click('#reach-pause');const time=await p.evaluate(()=>__widewakeReach.game.time);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__widewakeReach.game.time),time);await p.click('#reach-resume');
    await p.click('#camera-toggle');await p.click('[data-zoom="fleet"]');const fleet=await p.evaluate(()=>__widewakeReach.view.targetZoom);await p.click('#camera-toggle');await p.click('[data-zoom="survey"]');assert.ok(await p.evaluate(f=>__widewakeReach.view.targetZoom<f,fleet));await p.click('#camera-toggle');await p.click('[data-zoom="helm"]');
    // The same chosen scale survives rotation, without an extra mobile shrink.
    await p.setViewportSize({width:height,height:width});await p.waitForTimeout(450);assert.ok(await p.evaluate(()=>Math.abs(__widewakeReach.view.targetZoom*__widewakeReach.view.baseScale*__widewakeReach.game.player.length-40)<.01));
    if(!touch){await p.setViewportSize({width,height});await p.waitForTimeout(500);await p.evaluate(()=>{__widewakeReach.view.follow=false;});const anchor=await p.evaluate(()=>__widewakeReach.view.screenWorld(900,440));await p.mouse.move(900,440);await p.mouse.wheel(0,-120);await p.waitForTimeout(700);const after=await p.evaluate(()=>__widewakeReach.view.screenWorld(900,440));assert.ok(Math.hypot(after.x-anchor.x,after.y-anchor.y)<.05,'wheel keeps the water under the cursor '+JSON.stringify({anchor,after}));}
    reports.push({width,height,touch,fallback,...state});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({engine:isWebkit?'webkit':'chromium',reports,errors},null,2));console.log('PASS readable hulls, mouse/keyboard/touch driving, curved wakes, pause, zoom stops, rotation and Canvas fallback');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
