/* Shared physical sea, shader health, device layouts and Canvas fallback. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-waves');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
let browser;const errors=[],reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})});
  for(const [width,height,fallback]of [[1440,900,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>(errors.push(e.message),console.error(e.message)));
    if(fallback)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');
    await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;Object.assign(g.player,{x:0,px:0,y:2200,py:2200,angle:.2,previousAngle:.2});g.nextEncounter=1e9;v.camera={x:0,y:2200};});
    await p.keyboard.down('w');await p.waitForTimeout(2500);await p.keyboard.down('d');await p.waitForTimeout(450);await p.keyboard.up('d');await p.waitForTimeout(500);await p.keyboard.up('w');await p.keyboard.press('Escape');
    const report=await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach,s=g.player;v.render(0,1);return{speed:s.speed,sea:s.sea,pose:v.poses[0],stats:v.stats,gl:v.gl?.getError()||0,time:g.time,packets:g.sea.count};});assert.equal(report.gl,0);assert.equal(report.speed,36);assert.ok(report.packets>2);assert.ok(Number.isFinite(report.pose.z)&&Number.isFinite(report.pose.roll));assert.equal(report.stats.waveCrests,0,'pressure packets never render expanding rings');assert.ok(report.stats.wakeSegments>0,'moving boats retain a continuous foam trail');assert.ok(report.stats.bowSpraySegments>0||report.pose.airborne||report.stats.landingSplashSegments>0,'water contact throws spray; an airborne hull leaves the water clear');assert.ok(report.stats.waveCrests+report.stats.bowSpraySegments<=8192,'water presentation stays bounded');reports.push({width,height,fallback,...report});
    // A stopped simulation must produce identical wave pixels on consecutive draws.
    const frozen=await p.evaluate(()=>{const v=__widewakeReach.view;function hash(){v.render(0,1);const g=v.gl;if(!g)return v.canvas.toDataURL();const a=new Uint8Array(v.canvas.width*v.canvas.height*4);g.readPixels(0,0,v.canvas.width,v.canvas.height,g.RGBA,g.UNSIGNED_BYTE,a);let h=0;for(let i=0;i<a.length;i+=17)h=(Math.imul(h,31)+a[i])|0;return h;}return hash()===hash();});assert.ok(frozen,'pause freezes the sea');
    await p.locator('#reach-menu').evaluate(el=>el.close());await p.screenshot({path:path.join(out,`${width}-${fallback?'canvas':'sea'}.png`)});
    if(width===1440){
      const parity=await p.evaluate(()=>{
        const {view:v}=__widewakeReach,gl=v.gl,program=WidewakeOcean.program(gl,`#version 300 es
          layout(location=0)in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`,`#version 300 es
          precision highp float;uniform vec3 samplePoint;out vec4 color;${WidewakeWaves.glsl}
          void main(){vec3 w=waveSurface(samplePoint.xy,samplePoint.z,22.,1.,1.);color=vec4(w.x/8.+.5,w.yz*.5+.5,1.);}`);
        gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program,'uSeaStrength'),1);gl.bindVertexArray(v.quad.vao);gl.viewport(0,0,1,1);gl.disable(gl.DEPTH_TEST);const bytes=new Uint8Array(4);let error=0;
        for(let i=0;i<20;i++){const x=i*53.71,y=i*-71.33,t=i*.73,q=WidewakeWaves.sample(x,y,t);gl.uniform3f(gl.getUniformLocation(program,'samplePoint'),x,y,t);gl.drawArrays(gl.TRIANGLES,0,6);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);error=Math.max(error,Math.abs((bytes[0]/255-.5)*8-q.height),Math.abs((bytes[1]/255-.5)*2-q.dx),Math.abs((bytes[2]/255-.5)*2-q.dy));}
        gl.deleteProgram(program);gl.enable(gl.DEPTH_TEST);v.render(0,1);return error;
      });assert.ok(parity<.035,'CPU/GPU wave phase and slopes agree: '+parity);

      const ride=await p.evaluate(()=>{
        const {game:g,view:v}=__widewakeReach;const s=g.player;Object.assign(s,{x:0,y:2200,px:0,py:2200,angle:0,previousAngle:0,vx:36,vy:0,turn:0,sea:null});g.sea.wake.fill(0);g.sea.count=g.sea.cursor=0;v.wakes.clear();let low=Infinity,high=-Infinity,bow=0,roll=0;
        for(let n=0;n<900;n++){g.step(1/60,{throttle:1,steer:Math.sin(n/90)*.18});v.wakes.sample(g.ships,g.ships,g.time);low=Math.min(low,s.sea.z);high=Math.max(high,s.sea.z);bow=Math.max(bow,Math.abs(s.sea.pitch)*s.length*.76);roll=Math.max(roll,Math.abs(s.sea.roll));}
        v.camera.x=s.x;v.camera.y=s.y;v.render(0,1);return{heaveMetres:high-low,heavePixels:(high-low)*.8660254*v.zoom*v.baseScale,bowPixels:bow*.8660254*v.zoom*v.baseScale,roll,spray:v.stats.bowSpraySegments};
      });assert.ok(ride.heavePixels>18,'swell riding is visible at actual helm zoom: '+JSON.stringify(ride));assert.ok(ride.bowPixels>4,'bow clearly climbs and descends waves');assert.ok(ride.roll>.15&&ride.roll<.481);reports.push({ride});await p.screenshot({path:path.join(out,'riding-sea.png')});

      await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;g.player.type='gunboat';Object.assign(g.player,WidewakeBattle.roles.gunboat);v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.render(0,1);});await p.screenshot({path:path.join(out,'escort-sea.png')});
      await p.evaluate(()=>{const {view:v}=__widewakeReach;v.zoom=v.targetZoom=v.stops.fleet;v.render(0,1);});await p.screenshot({path:path.join(out,'fleet-sea.png')});
    }
    await context.close();console.log('PASS waves '+width+'x'+height+(fallback?' Canvas':' WebGL'));
  }
  const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.game?.time>3);await p.keyboard.down('w');await p.waitForTimeout(1200);await p.keyboard.up('w');await p.keyboard.press('Escape');
  const combat=await p.evaluate(()=>({metrics:__widewakeReach.metrics(),time:__widewakeReach.game.time,packets:__widewakeReach.game.sea.count}));assert.equal(combat.metrics.targetRaiders,16384);assert.ok(combat.metrics.kills>0);reports.push({combat});
  const loss=await p.evaluate(()=>{const v=__widewakeReach.view,e=v.gl.getExtension('WEBGL_lose_context');if(!e)return false;window.restoreWaveContext=()=>e.restoreContext();e.loseContext();return true;});
  if(loss){await p.waitForFunction(()=>__widewakeReach.view.lost);await p.evaluate(()=>restoreWaveContext());await p.waitForFunction(()=>!__widewakeReach.view.lost);const restored=await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach;v.render(0);return{time:g.time,packets:g.sea.count,error:v.gl.getError()};});assert.equal(restored.time,combat.time);assert.equal(restored.packets,combat.packets);assert.equal(restored.error,0);}
  await p.locator('#reach-menu').evaluate(el=>el.close());await p.screenshot({path:path.join(out,'endgame-sea.png')});await context.close();console.log('PASS endgame sea and graphics context restoration preserve simulation');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
