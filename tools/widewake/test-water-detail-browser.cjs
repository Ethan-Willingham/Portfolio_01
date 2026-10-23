/* Current bends must not rephase ripples; bow contact and turn history stay local. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-water-detail');
fs.mkdirSync(out,{recursive:true});const reports=[],errors=[];let browser;
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [width,height,canvas]of [[1373,1022,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(canvas)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    if(!canvas){
      const detail=await p.evaluate(()=>{
        const v=__widewakeReach.view,gl=v.gl,program=WidewakeOcean.program(gl,`#version 300 es
        layout(location=0)in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`,`#version 300 es
        precision highp float;uniform vec3 point;out vec4 color;${WidewakeOceanArt.waterGLSL}
        void main(){vec2 p=point.xy+gl_FragCoord.xy*.37,c=vec2(.3,.42),q=seaRipples(p,c,point.z);
          float flow=length(seaRipples(p,c+vec2(.001,-.001),point.z)-q);
          float seam=length(seaRipples(p,c,point.z-.001)-seaRipples(p,c,point.z+.001));
          color=vec4(flow*50.,seam*50.,length(q)*2.,1.);}`);
        v.uniforms(program);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,v.noise);gl.uniform1i(gl.getUniformLocation(program,'uNoise'),2);gl.bindVertexArray(v.quad.vao);gl.viewport(0,0,32,32);gl.disable(gl.DEPTH_TEST);
        const bytes=new Uint8Array(32*32*4);let maxFlow=0,maxSeam=0,detail=0;
        for(const [x,y]of [[340,650],[-550,600],[120,-5100],[3900,-7200]])for(const t of [0,1.37,3,4.1,6,18.9,3600,3601.2,12002.9,12003]){
          gl.uniform3f(gl.getUniformLocation(program,'point'),x,y,t);gl.drawArrays(gl.TRIANGLES,0,6);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
          for(let i=0;i<bytes.length;i+=4){maxFlow=Math.max(maxFlow,bytes[i]/255/50);maxSeam=Math.max(maxSeam,bytes[i+1]/255/50);detail=Math.max(detail,bytes[i+2]/255/2);}
        }
        gl.deleteProgram(program);gl.enable(gl.DEPTH_TEST);v.render(0,1);return{maxFlow,maxSeam,detail,error:gl.getError()};
      });assert.equal(detail.error,0);assert.ok(detail.maxFlow<.003,'small current changes cannot fold or rephase the water: '+JSON.stringify(detail));assert.ok(detail.maxSeam<.003,'flow resets stay continuous after hours of simulation: '+JSON.stringify(detail));assert.ok(detail.detail>.08,'the fix retains visible irregular surface detail');reports.push({width,detail});
    }
    await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach,s=g.player;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.time=18;g.sea.begin(18);Object.assign(s,{x:340,y:650,px:340,py:650,angle:Math.PI,previousAngle:Math.PI,vx:-24,vy:0,turn:0,sea:null});g.sea.stepShip(s,1/60,false);v.follow=false;v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.wakes.clear();});
    for(const [name,frames,steer]of [['salt-windpumps',0,0],['straight',180,0],['turn',240,.75],['countersteer',150,-.65]]){
      const motion=await p.evaluate(({frames,steer})=>{const{game:g,view:v}=__widewakeReach,s=g.player;for(let i=0;i<frames;i++){g.step(1/60,{throttle:.8,steer});v.wakes.sample(g.ships,g.ships,g.time);}v.camera={x:s.x,y:s.y};v.render(0,1);return{x:s.x,y:s.y,pitch:s.sea.pitch,roll:s.sea.roll,spray:v.stats.bowSpraySegments,wake:v.stats.wakeSegments,error:v.gl?.getError()||0};},{frames,steer});assert.equal(motion.error,0);if(frames)assert.ok(motion.wake>10,'stern history survives the turn');else assert.equal(motion.wake,0,'no disconnected V before stern history exists');reports.push({width,canvas,name,...motion});
      await p.waitForFunction(()=>{__widewakeReach.view.render(0,1);return __widewakeReach.view.terrain.ready;});await p.screenshot({path:path.join(out,`${width}-${canvas?'canvas':'webgl'}-${name}.png`)});
    }
    const paused=await p.evaluate(()=>{const v=__widewakeReach.view;v.render(0,1);const a=v.canvas.toDataURL();v.render(0,1);return a===v.canvas.toDataURL();});assert.ok(paused,'water detail and contact foam freeze with simulation time');await context.close();console.log('PASS continuous water detail and turns '+width+(canvas?' Canvas':' WebGL'));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
