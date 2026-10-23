/* Actual helm bindings, then repeatable rendered spinout and recovery runs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-oversteer');
fs.mkdirSync(out,{recursive:true});const reports=[],errors=[];let browser;
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})});
  for(const[width,height,canvas]of [[1440,900,false],[844,390,false],[844,390,true]]){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(canvas)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'?null:get.call(this,t,...a);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');
    let session;if(touch){session=await context.newCDPSession(p);const point={x:width*.25,y:height*.64,id:2};await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+60,y:point.y-60}]});}
    else{await p.keyboard.down('w');await p.keyboard.down('d');}
    await p.waitForFunction(()=>__widewakeReach.game.control.throttle>.6&&__widewakeReach.game.control.steer>.6);
    // The circular touch stick has partial axes on its diagonal. Lift and make
    // a horizontal gesture to request full rudder from its floating origin.
    if(touch){const point={x:width*.25,y:height*.64,id:2};await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+80}]});await p.waitForFunction(()=>__widewakeReach.game.control.steer>.95&&Math.abs(__widewakeReach.game.control.throttle)<.05);}
    const held=await p.evaluate(()=>({...__widewakeReach.game.control}));
    if(touch)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else{await p.keyboard.up('w');await p.keyboard.up('d');}
    await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach,s=g.player;g.time=0;g.sea.strength=0;g.sea.begin(0);g.sea.count=0;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];
      Object.assign(s,{x:340,y:650,px:340,py:650,angle:0,previousAngle:0,vx:36,vy:0,turn:0,throttle:1,sea:null});g.sea.stepShip(s,1/60,false);v.wakes.clear();v.foam.clear();v.follow=false;v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.camera={x:s.x,y:s.y};v.render(0,1);});
    const states=[];let maxSlip=0,minSpeed=36;
    for(const[name,seconds,input]of [['entry',.4,{throttle:1,steer:0}],['turn',.6,held],['overcommit',touch?2.4:.9,held],['recover',5,{throttle:1,steer:0}]]){
      const state=await p.evaluate(({seconds,input})=>{const{game:g,view:v}=__widewakeReach,s=g.player;let maxSlip=0,minSpeed=36,peakRoll=0;
        for(let n=0;n<Math.round(seconds*60);n++){g.step(1/60,input);v.wakes.sample(g.ships,g.ships,g.time,g.field);const speed=Math.hypot(s.vx,s.vy);minSpeed=Math.min(minSpeed,speed);if(speed>5)maxSlip=Math.max(maxSlip,Math.abs(WidewakeBattle.angleDelta(s.angle,Math.atan2(s.vy,s.vx))));peakRoll=Math.max(peakRoll,Math.abs(s.sea.roll));}
        v.camera={x:s.x,y:s.y};v.render(0,1);return{maxSlip,minSpeed,peakRoll,speed:Math.hypot(s.vx,s.vy),turn:s.turn,x:s.x,y:s.y,wake:v.wakes.count,error:v.gl?.getError()||0};
      },{seconds,input});assert.equal(state.error,0);states.push({name,...state});maxSlip=Math.max(maxSlip,state.maxSlip);minSpeed=Math.min(minSpeed,state.minSpeed);
      await p.waitForFunction(()=>__widewakeReach.view.terrain.ready,{},{polling:100});await p.evaluate(()=>__widewakeReach.view.render(0,1));await p.screenshot({path:path.join(out,`${width}-${canvas?'canvas':'webgl'}-${name}.png`)});
    }
    assert.ok(maxSlip>.8&&minSpeed<36*.65,'sustained input must visibly skid and scrub speed: '+JSON.stringify(states));
    assert.ok(states.some(s=>s.wake>10),'the wake records the actual turn');assert.ok(states.at(-1).speed>32&&Math.abs(states.at(-1).turn)<.04,'released helm eventually recovers through water forces');
    const frozen=await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach,time=g.time;v.render(0,1);const a=v.canvas.toDataURL();v.render(0,1);return time===g.time&&a===v.canvas.toDataURL();});assert.ok(frozen,'pause preserves motion and wake pixels');
    reports.push({width,canvas,held,states});await context.close();console.log('PASS oversteer, speed loss, wake, recovery and pause '+width+(canvas?' Canvas':' WebGL'));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
