/* Real regional water at several zooms, shader parity and frozen frames. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-water-grid');
fs.mkdirSync(out,{recursive:true});const reports=[],errors=[];let browser;
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [width,height,canvas]of [[1440,900,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(canvas)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    if(!canvas){const parity=await p.evaluate(()=>{
      const{game:g,view:v}=__widewakeReach,gl=v.gl,program=WidewakeOcean.program(gl,`#version 300 es
      layout(location=0)in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`,`#version 300 es
      precision highp float;uniform vec3 point;uniform vec2 water;uniform int seamAxis;out vec4 color;${WidewakeWaves.glsl}
      void main(){vec3 q=waveSurface(point.xy,point.z,water.x,water.y,0.);color=vec4(q.x/8.+.5,q.yz*.5+.5,1.);
        if(seamAxis>=0){vec2 d=seamAxis==0?vec2(.001,0.):vec2(0.,.001);vec3 a=waveSurface(point.xy-d,point.z,water.x,water.y,0.),b=waveSurface(point.xy+d,point.z,water.x,water.y,0.);color=vec4(abs(a-b)*100.,1.);}}`);
      v.uniforms(program);gl.uniform1i(gl.getUniformLocation(program,'seamAxis'),-1);gl.bindVertexArray(v.quad.vao);gl.viewport(0,0,1,1);gl.disable(gl.DEPTH_TEST);const bytes=new Uint8Array(4);let heightError=0,slopeError=0,seamJump=0;
      for(const[x,y]of [[160,450],[-550,600],[-350,-900],[100,-5100],[1800,1460],[0,2500]])for(let i=0;i<12;i++){
        const px=x+i*3.713,py=y-i*2.731,t=i*.73,w=g.field.sample(px,py),q=WidewakeWaves.sample(px,py,t,w.depth,w.salinity,false,{},g.sea.environment.at(px,py));
        gl.uniform3f(gl.getUniformLocation(program,'point'),px,py,t);gl.uniform2f(gl.getUniformLocation(program,'water'),w.depth,w.salinity);gl.drawArrays(gl.TRIANGLES,0,6);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        heightError=Math.max(heightError,Math.abs((bytes[0]/255-.5)*8-q.height));slopeError=Math.max(slopeError,Math.abs((bytes[1]/255-.5)*2-q.dx),Math.abs((bytes[2]/255-.5)*2-q.dy));
      }
      for(const [x,y,axis]of [[832,853.37,0],[725.37,960,1],[384,533.37,0],[405.37,512,1],[-576,597.37,0],[1813.37,1472,1]])for(const t of [0,3.7,18,27]){
        const w=g.field.sample(x,y);gl.uniform1i(gl.getUniformLocation(program,'seamAxis'),axis);gl.uniform3f(gl.getUniformLocation(program,'point'),x,y,t);gl.uniform2f(gl.getUniformLocation(program,'water'),w.depth,w.salinity);gl.drawArrays(gl.TRIANGLES,0,6);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);seamJump=Math.max(seamJump,bytes[0]/255/100,bytes[1]/255/100,bytes[2]/255/100);
      }
      gl.deleteProgram(program);gl.enable(gl.DEPTH_TEST);v.render(0,1);return{heightError,slopeError,seamJump,error:gl.getError()};
    });assert.equal(parity.error,0);assert.ok(parity.heightError<.025&&parity.slopeError<.006,'regional CPU/GPU wave shape and normals agree: '+JSON.stringify(parity));assert.ok(parity.seamJump<.0005,'GPU heights and normals stay continuous at the X-shape regression sites: '+JSON.stringify(parity));reports.push({width,parity});}
    const scenes=[['bank-close',850,850,6.666667],['bank-mid',850,850,3.333333],['bank-wide',850,850,1.666667],['cell-crossing',350,500,6.666667],['mouth-close',340,650,6.666667],['mouth-mid',340,650,3.333333],['mouth-wide',340,650,1.666667],['river',-350,-900,3.333333],['headwaters',100,-5100,3.333333],['coast',1800,1460,1.666667],['offshore',0,2500,1.666667]];
    for(const[name,x,y,zoom]of scenes){
      await p.evaluate(({x,y,zoom})=>{const{game:g,view:v}=__widewakeReach,s=g.player;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.time=18;g.sea.begin(18);Object.assign(s,{x,y,px:x,py:y,angle:-Math.PI*.75,previousAngle:-Math.PI*.75,vx:0,vy:0,turn:0,sea:null});g.sea.stepShip(s,1/60,false);v.follow=false;v.camera={x,y};v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=zoom;v.wakes.clear();v.foam.clear();v.render(0,1);},{x,y,zoom});
      await p.waitForFunction(()=>__widewakeReach.view.terrain.ready,{},{polling:100});
      const state=await p.evaluate(checkMotion=>{
        const{game:g,view:v}=__widewakeReach,gl=v.gl;
        function pixels(){v.render(0,1);if(!gl)return v.canvas.toDataURL();const a=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;}
        const a=pixels(),b=pixels();let maxDelta=0,changed=0;
        if(gl)for(let i=0;i<a.length;i+=4){let delta=0;for(let j=0;j<3;j++)delta=Math.max(delta,Math.abs(a[i+j]-b[i+j]));if(delta)changed++;maxDelta=Math.max(maxDelta,delta);}
        // Software MSAA can round a few shoreline pixels by one color step.
        // A paused surface must retain all other pixels and the simulation time.
        const frozen=gl?maxDelta<=1&&changed<=a.length/4*.0001:a===b;
        let motion=true;if(checkMotion){g.time+=.25;const c=pixels();g.time-=.25;pixels();
          if(gl){let moved=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-c[i])+Math.abs(a[i+1]-c[i+1])+Math.abs(a[i+2]-c[i+2])>2)moved++;motion=moved>a.length/4*.005;}else motion=a!==c;
        }
        return{frozen,maxDelta,changed,motion,time:g.time,error:gl?.getError()||0};
      },name==='mouth-close');
      assert.ok(state.frozen,name+' '+JSON.stringify(state));assert.equal(state.error,0);
      assert.equal(state.time,18);assert.ok(state.motion,'the pause comparison must also detect moving water');
      reports.push({width,canvas,name,...state});await p.screenshot({path:path.join(out,`${width}-${canvas?'canvas':'webgl'}-${name}.png`)});
      console.log('PASS '+width+' '+(canvas?'Canvas':'WebGL')+' '+name);
    }
    await context.close();console.log('PASS water grid views, regional parity and pause '+width+(canvas?' Canvas':' WebGL'));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
