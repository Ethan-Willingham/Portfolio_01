/* Compare actual close boat pixels to a supersampled geometric reference. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-hull-detail');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
let browser;const errors=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
  const result=await p.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,gl=v.gl,original={width:v.width,height:v.height,zoom:v.zoom,baseScale:v.baseScale},batch=v.batches.launch;
    const W=160,H=112,rows=[],images=[];v.width=W/2;v.height=H/2;v.baseScale=1;v.zoom=20/2;
    function pixels(mesh,scale,angle,tilt=0){
      const f=gl.createFramebuffer(),resolve=gl.createFramebuffer(),color=gl.createRenderbuffer(),depth=gl.createRenderbuffer(),texture=gl.createTexture(),samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES));
      gl.bindFramebuffer(gl.FRAMEBUFFER,resolve);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W*scale,H*scale,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.bindRenderbuffer(gl.RENDERBUFFER,color);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.RGBA8,W*scale,H*scale);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,color);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.DEPTH_COMPONENT24,W*scale,H*scale);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Hull comparison framebuffer unavailable');gl.viewport(0,0,W*scale,H*scale);gl.clearColor(.07,.20,.25,1);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      batch.count=0;batch.add(0,0,0,Math.cos(angle),Math.sin(angle));batch.tilt(tilt,tilt*.4);
      if(mesh){v.uniforms(v.main);batch.draw();}else{v.atlas.begin();v.atlas.draw('launch',batch);v.atlas.edges();}
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,f);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,resolve);gl.blitFramebuffer(0,0,W*scale,H*scale,0,0,W*scale,H*scale,gl.COLOR_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.FRAMEBUFFER,resolve);
      const a=new Uint8Array(W*H*scale*scale*4);gl.readPixels(0,0,W*scale,H*scale,gl.RGBA,gl.UNSIGNED_BYTE,a);const small=new Uint8Array(W*H*4);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let k=0;k<4;k++){let sum=0;for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)sum+=a[((H*scale-1-(y*scale+sy))*W*scale+x*scale+sx)*4+k];small[(y*W+x)*4+k]=Math.round(sum/(scale*scale));}
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);for(const x of [f,resolve])gl.deleteFramebuffer(x);for(const x of [color,depth])gl.deleteRenderbuffer(x);gl.deleteTexture(texture);return small;
    }
    for(const pixelsPerMetre of [13.3333333,20])for(const angle of [0,.23,.57,1.11,2.47]){
      v.zoom=pixelsPerMetre/2;
      const reference=pixels(true,4,angle),sprite=pixels(false,1,angle),mesh=pixels(true,1,angle);let oldError=0,newError=0;
      for(let n=0;n<reference.length;n+=4)for(let k=0;k<3;k++){oldError+=(sprite[n+k]-reference[n+k])**2;newError+=(mesh[n+k]-reference[n+k])**2;}
      const visible=a=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-18)+Math.abs(a[i+1]-51)+Math.abs(a[i+2]-64)>35)n++;return n;};
      rows.push({pixelsPerMetre,angle,oldError,newError,ratio:newError/oldError,spritePixels:visible(sprite),meshPixels:visible(mesh)});images.push({sprite,mesh,reference});
    }
    const sheet=document.createElement('canvas');sheet.width=W*3;sheet.height=(H+22)*images.length;const ctx=sheet.getContext('2d');ctx.fillStyle='#123440';ctx.fillRect(0,0,sheet.width,sheet.height);ctx.font='12px monospace';ctx.fillStyle='#e8dfb5';
    images.forEach((row,y)=>{['sprite','mesh','reference'].forEach((key,x)=>{ctx.putImageData(new ImageData(new Uint8ClampedArray(row[key]),W,H),x*W,y*(H+22));ctx.fillText(key,x*W+8,y*(H+22)+H+15);});});
    const pair=document.createElement('canvas');pair.width=W*2;pair.height=H+22;const pc=pair.getContext('2d');pc.fillStyle='#123440';pc.fillRect(0,0,pair.width,pair.height);pc.putImageData(new ImageData(new Uint8ClampedArray(images[0].sprite),W,H),0,0);pc.putImageData(new ImageData(new Uint8ClampedArray(images[0].mesh),W,H),W,0);pc.fillStyle='#e8dfb5';pc.font='12px Segoe UI';pc.fillText('Before',8,H+15);pc.fillText('After',W+8,H+15);
    Object.assign(v,original);v.zoom=.5;const farUsesGeometry=v.usesHullGeometry('launch');g.sea.strength=0;Object.assign(g.player,{x:0,y:2400,px:0,py:2400,angle:0,previousAngle:0,vx:0,vy:0,sea:null});g.sea.stepShip(g.player,0,false);v.camera={x:0,y:2400};v.follow=false;v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.render(0,1);
    return{rows,sheet:sheet.toDataURL(),pair:pair.toDataURL(),detailedHulls:v.stats.detailedHulls,farUsesGeometry,atlasBytes:v.atlas.bytes,gl:gl.getError(),raiderUsesGeometry:v.usesHullGeometry('raider0')};
  });
  fs.writeFileSync(path.join(out,'comparison.png'),Buffer.from(result.sheet.split(',')[1],'base64'));fs.writeFileSync(path.join(out,'before-after.png'),Buffer.from(result.pair.split(',')[1],'base64'));delete result.sheet;delete result.pair;console.log(JSON.stringify(result,null,2));assert.equal(result.gl,0);assert.equal(result.raiderUsesGeometry,false);assert.equal(result.farUsesGeometry,false);assert.ok(result.detailedHulls>=1);
  for(const row of result.rows){assert.ok(row.spritePixels>100&&row.meshPixels>100,'both comparison hulls must actually render');assert.ok(row.ratio<.65,'geometry improves fidelity to the supersampled reference: '+JSON.stringify(row));}
  await p.screenshot({path:path.join(out,'actual-helm.png')});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log('PASS nearby hull detail against geometric reference, helm selection and swarm sprite path');console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
