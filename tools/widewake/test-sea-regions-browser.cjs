/* Regional sea review at playing zoom, including the full combat population. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-sea-regions');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream'});res.end(e?'Missing':b);});});
let browser;const errors=[],reports=[];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  const layouts=process.env.WIDEWAKE_QUICK?[[1440,900,false]]:[[1440,900,false],[844,390,false],[844,390,true]];
  for(const [width,height,fallback]of layouts){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});p.on('console',m=>{if(m.type()==='error')console.error(m.text());});
    if(fallback)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    if(!fallback){const parity=await p.evaluate(()=>{
      const{game:g,view:v}=__widewakeReach,gl=v.gl,program=WidewakeOcean.program(gl,`#version 300 es
      layout(location=0)in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`,`#version 300 es
      precision highp float;uniform vec3 point;uniform vec2 water;out vec4 color;${WidewakeWaves.glsl}
      void main(){vec3 q=waveSurface(point.xy,point.z,water.x,water.y,0.);color=vec4(q.x/8.+.5,q.yz*.5+.5,1.);}`);
      v.uniforms(program);gl.bindVertexArray(v.quad.vao);gl.viewport(0,0,1,1);gl.disable(gl.DEPTH_TEST);const bytes=new Uint8Array(4);let max=0;
      for(const [x,y]of [[-550,600],[-350,-900],[100,-5100],[1800,1460],[0,2500],[2024,1516],[124,1597]])for(const t of [0,3.7,19.2]){const water=g.field.sample(x,y),q=g.sea.at(x,y,t,{},-1,false);gl.uniform3f(gl.getUniformLocation(program,'point'),x,y,t);gl.uniform2f(gl.getUniformLocation(program,'water'),water.depth,water.salinity);gl.drawArrays(gl.TRIANGLES,0,6);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);max=Math.max(max,Math.abs((bytes[0]/255-.5)*8-q.height),Math.abs((bytes[1]/255-.5)*2-q.dx),Math.abs((bytes[2]/255-.5)*2-q.dy));}
      gl.deleteProgram(program);gl.enable(gl.DEPTH_TEST);v.render(0,1);return{max,error:gl.getError()};
    });assert.equal(parity.error,0);assert.ok(parity.max<.035,'geographic chart, phase compression and water normals match CPU: '+JSON.stringify(parity));reports.push({width,parity});}
    for(const [name,x,y]of [['harbor',-550,600],['river',-350,-900],['freshwater',100,-5100],['coast',1800,1460],['offshore',0,2500]]){
      await p.evaluate(({x,y})=>{const{game:g,view:v}=__widewakeReach;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.time=18;g.sea.begin(18);Object.assign(g.player,{x,y,px:x,py:y,angle:-.8,previousAngle:-.8,vx:0,vy:0,turn:0,sea:null});g.sea.stepShip(g.player,1/60,false);v.follow=false;v.camera={x,y};v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.wakes.clear();v.render(0,1);},{x,y});
      await p.waitForFunction(()=>{__widewakeReach.view.render(0,1);return __widewakeReach.view.terrain.ready;});
      const report=await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach,s=g.player;return{water:g.field.sample(s.x,s.y),environment:g.sea.environment.at(s.x,s.y),sample:g.sea.at(s.x,s.y),gl:v.gl?.getError()||0,stats:v.stats};});assert.equal(report.gl,0);reports.push({width,fallback,name,...report});
      await p.screenshot({path:path.join(out,`${width}-${fallback?'canvas':'webgl'}-${name}.png`)});
    }
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.game?.time>2);await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    const combat=await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach;v.render(0,1);return{raiders:g.raiders.count,error:v.gl?.getError()||0,stats:v.stats};});assert.equal(combat.error,0);assert.ok(combat.raiders>=16000);reports.push({width,fallback,combat});await p.screenshot({path:path.join(out,`${width}-${fallback?'canvas':'webgl'}-combat.png`)});
    if(width===1440){const motion=[];for(let frame=0;frame<5;frame++){const attitude=await p.evaluate(()=>{const{game:g,view:v}=__widewakeReach;for(let i=0;i<45;i++)g.step(1/60,{throttle:.75,steer:.2});v.camera={x:g.player.x,y:g.player.y};v.render(0,1);return{time:g.time,z:g.player.sea.z,pitch:g.player.sea.pitch,roll:g.player.sea.roll,error:v.gl.getError()};});assert.equal(attitude.error,0);motion.push(attitude);await p.screenshot({path:path.join(out,`flagship-motion-${frame}.png`)});}assert.ok(Math.max(...motion.map(q=>q.z))-Math.min(...motion.map(q=>q.z))>.1);reports.push({motion});}
    await context.close();console.log('PASS regional sea '+width+(fallback?' Canvas':' WebGL'));
  }assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
