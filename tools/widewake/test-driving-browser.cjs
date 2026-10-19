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
    if(fallback)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
    await p.goto(base+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view.terrain.ready);await p.click('#cast-off');
    await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;Object.assign(g.player,{x:0,y:2000,px:0,py:2000,angle:0,previousAngle:0});g.nextEncounter=1e9;v.camera={x:0,y:2000};});
    await p.waitForFunction(()=>Math.abs(__widewakeReach.view.zoom-__widewakeReach.view.stops.helm)<.01);
    const size=await p.evaluate(()=>{const v=__widewakeReach.view,s=__widewakeReach.game.player;return s.length*v.zoom*v.baseScale;});assert.ok(size>=39.8&&size<=40.2,'at least 40 CSS pixels in the most foreshortened heading');assert.equal(await p.locator('#broadside').count(),0);
    const start=await p.evaluate(()=>__widewakeReach.game.player.x),touchSession=touch&&!isWebkit?await context.newCDPSession(p):null;
    async function steer(x,y,ms){if(touch){const r=await p.locator('#reach-helm').boundingBox(),point={x:r.x+r.width*(.5+x*.4),y:r.y+r.height*(.5+y*.4),id:2};if(touchSession)await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});else{await p.mouse.move(point.x,point.y);await p.mouse.down();}await p.waitForTimeout(ms);if(touchSession)await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();}else{const key=x?'d':'s';await p.keyboard.down(key);await p.waitForTimeout(ms);await p.keyboard.up(key);}}
    await steer(1,0,2300);await steer(0,1,1300);
    const state=await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach,p=v.project(g.player.x,g.player.y);return{x:g.player.x,speed:Math.hypot(g.player.vx,g.player.vy),points:v.wakes.count,segments:v.stats.wakeSegments,stats:v.stats,screen:{x:p.x/v.width,y:p.y/v.height},error:v.gl?.getError()||0};});
    assert.ok(state.x>start+10&&state.points>12&&state.segments>5,JSON.stringify({width,height,fallback,state}));assert.equal(state.error,0);assert.ok(state.screen.x>.2&&state.screen.x<.8&&state.screen.y>.2&&state.screen.y<.8);assert.ok(state.stats.wakeBytes<=65536);await p.screenshot({path:path.join(out,`${width}x${height}${fallback?'-canvas':''}.png`)});
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
