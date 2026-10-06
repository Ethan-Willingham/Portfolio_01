import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serve,browserRun} from './browser.mjs';
import {toolLock} from './core.mjs';

// Measure the actual GPU depth texture, not merely the camera configuration.
// A frozen bench isolates quantization from legitimate motion and film grain.
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest');
await mkdir(folder,{recursive:true});
const release=await toolLock(),server=await serve(),rows=[];
const fixtureRenderer=process.env.CHAIN_REACTION_RENDERER_FIXTURE?await readFile(process.env.CHAIN_REACTION_RENDERER_FIXTURE,'utf8'):null;
const fixture='<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="scene"></canvas><script src="/js/vendor/three-r128.min.js"></script><script src="/js/chain-reaction-materials.js"></script><script src="/js/chain-reaction-renderer.js"></script>';
try{
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  for(const profile of [{name:'desktop',width:1440,height:844,dpr:1},{name:'owner',width:859,height:711,dpr:2},{name:'landscape',width:844,height:334,dpr:2}]){
   const page=await browser.newPage({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr});
   if(fixtureRenderer)await page.route('**/js/chain-reaction-renderer.js',r=>r.fulfill({contentType:'text/javascript',body:fixtureRenderer}));
   await page.route('**/depth-test.html',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(server.url+'/depth-test.html');
   await page.evaluate(async()=>{
    const T=THREE,OriginalRenderer=T.WebGLRenderer;
    T.WebGLRenderer=function(...args){const renderer=new OriginalRenderer(...args),render=renderer.render;renderer.render=function(scene,camera){if(camera.isPerspectiveCamera){window.filmScene=scene;window.filmCamera=camera;window.filmRenderer=this;window.filmTarget=this.getRenderTarget();}else if(scene.children[0]?.material?.uniforms?.depthMap)window.depthMap=scene.children[0].material.uniforms.depthMap.value;return render.call(this,scene,camera);};return renderer;};
    const index=await fetch('/assets/chain-reaction/index.json').then(r=>r.json()),ds=await Promise.all(index.stages.map(s=>fetch('/assets/chain-reaction/stages/'+s.file).then(r=>r.json())));
    window.view=ChainReaction.makeView(document.getElementById('scene'),ds);view.draw(0,false,0,false);
    // Keep the real workbench, hide mounted mechanisms for an unobstructed plane.
    filmScene.children.filter(o=>o.isGroup).slice(1).forEach(o=>o.visible=false);
    const coords=new Float32Array(16*4);window.coords=coords;
    const uvMap=new T.DataTexture(coords,16,1,T.RGBAFormat,T.FloatType);uvMap.needsUpdate=true;
    const target=new T.WebGLRenderTarget(16,1,{type:T.FloatType,depthBuffer:false});
    const material=new T.ShaderMaterial({uniforms:{depth:{value:depthMap},coords:{value:uvMap},range:{value:new T.Vector2()}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}',fragmentShader:'precision highp float;varying vec2 vUv;uniform sampler2D depth,coords;uniform vec2 range;void main(){vec2 p=texture2D(coords,vUv).rg;float d=texture2D(depth,p).r;float z=range.x*range.y/(range.y-d*(range.y-range.x));gl_FragColor=vec4(z,0.,0.,1.);}'});
    const probeScene=new T.Scene(),probeCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);probeScene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
    window.probe=c=>{
     view.setCamera(c);view.draw(0,false,0,false);filmCamera.updateMatrixWorld();
     const size=filmRenderer.getDrawingBufferSize(new T.Vector2()),expected=[],selected=[],colors=[],gl=filmRenderer.getContext();
     for(let n=0;n<16;n++){
      const x=c.x+(n/15-.5)*Math.min((c.sampleWidth??c.width)*.68,36),point=new T.Vector3(x,0,.60),ndc=point.clone().project(filmCamera);
      const px=Math.floor((ndc.x+1)*size.x/2),py=Math.floor((ndc.y+1)*size.y/2),u=(px+.5)/size.x,v=(py+.5)/size.y;
      coords.set([u,v,0,1],n*4);
      const near=new T.Vector3(u*2-1,v*2-1,-1).unproject(filmCamera),far=new T.Vector3(u*2-1,v*2-1,1).unproject(filmCamera),ray=far.sub(near),p=near.clone().addScaledVector(ray,-near.y/ray.y),z=-p.clone().applyMatrix4(filmCamera.matrixWorldInverse).z;
      expected.push(z);selected.push(px>=0&&px<size.x&&py>=0&&py<size.y&&p.x>-2&&p.x<50&&p.z>-.9&&p.z<1.0);
      const cx=(ndc.x+1)*size.x/2-.5,cy=(ndc.y+1)*size.y/2-.5,ix=Math.floor(cx),iy=Math.floor(cy),fx=cx-ix,fy=cy-iy,rgba=new Uint8Array(16);
      if(ix>=0&&iy>=0&&ix+1<size.x&&iy+1<size.y)gl.readPixels(ix,iy,2,2,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      colors.push([0,1,2].map(k=>rgba[k]*(1-fx)*(1-fy)+rgba[4+k]*fx*(1-fy)+rgba[8+k]*(1-fx)*fy+rgba[12+k]*fx*fy));
     }
     uvMap.needsUpdate=true;material.uniforms.range.value.set(filmCamera.near,filmCamera.far);filmRenderer.setRenderTarget(target);filmRenderer.render(probeScene,probeCamera);const pixels=new Float32Array(16*4);filmRenderer.readRenderTargetPixels(target,0,0,16,1,pixels);filmRenderer.setRenderTarget(null);
     return {camera:{...c,near:filmCamera.near,far:filmCamera.far},samples:expected.map((z,n)=>({expected:z,measured:pixels[n*4],error:Math.abs(z-pixels[n*4]),selected:selected[n]})).filter(p=>p.selected),colors};
    };
    window.disposeProbe=()=>{uvMap.dispose();target.dispose();material.dispose();probeScene.children[0].geometry.dispose();view.dispose();};
    window.prepareFootProbe=()=>{
     let geometry;filmScene.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const s=o.geometry.boundingBox.getSize(new T.Vector3());if(Math.abs(s.x-.32)<.0001&&Math.abs(s.y-.07)<.0001&&Math.abs(s.z-.36)<.0001)geometry=o.geometry;});
     if(!geometry)throw Error('Real bearing foot geometry missing');
     // Red foot renders before blue bench, as gold paint renders before maple.
     // A farther bench must never overwrite the nearer, shallow mounting plate.
     const red=new T.MeshBasicMaterial({color:0xff0000,toneMapped:false}),blue=new T.MeshBasicMaterial({color:0x0000ff,toneMapped:false}),foot=new T.Mesh(geometry,red);
     foot.position.set(24,.035,.1);filmScene.add(foot);filmScene.children.find(o=>o.isGroup).children[0].material=blue;
     window.probeFoot=c=>{view.setCamera(c);view.draw(0,false,0,false);const size=filmRenderer.getDrawingBufferSize(new T.Vector2()),p=new T.Vector3(24,.035,.266).project(filmCamera),x=Math.floor((p.x+1)*size.x/2),y=Math.floor((p.y+1)*size.y/2);if(x<0||y<0||x>=size.x||y>=size.y)return null;const rgba=new Uint8Array(4);filmRenderer.readRenderTargetPixels(filmTarget,x,y,1,1,rgba);return {rgba:[...rgba],pass:rgba[0]>=250&&rgba[2]<=2};};
     window.disposeFoot=()=>{red.dispose();blue.dispose();filmScene.remove(foot);};
    };
   });
   const samples=[];
   for(let n=0;n<=120;n++){
    const u=n<=60?n/60:(120-n)/60,s=u*u*u*(10+u*(-15+6*u)),c={x:8.9+15.1*s,y:3.25+.85*s,width:11.2*Math.exp(Math.log(54/11.2)*s),minHeight:6.7*Math.exp(Math.log(10/6.7)*s)};
    const sample=await page.evaluate(c=>probe(c),c);samples.push({frame:n,...sample});
   }
   const errors=samples.flatMap(r=>r.samples.map(p=>p.error));assert(errors.length>100,'No bench-plane samples');
   const jitter=[];for(const width of [11.2,28,54]){const frames=[];for(let n=0;n<16;n++)frames.push((await page.evaluate(c=>probe(c),{x:24,y:4.1,width:width*Math.exp((n-8)*.0002),minHeight:10,sampleWidth:width})).colors);const deltas=[];for(let n=1;n<frames.length;n++)for(let p=0;p<16;p++)for(let k=0;k<3;k++)deltas.push(Math.abs(frames[n][p][k]-frames[n-1][p][k]));jitter.push({width,frames:frames.length,maximumColorChange:Math.max(...deltas),meanColorChange:deltas.reduce((a,b)=>a+b,0)/deltas.length});}
   await page.evaluate(()=>prepareFootProbe());const footFrames=[];for(let n=0;n<=120;n++){const c=samples[n].camera,result=await page.evaluate(c=>probeFoot(c),c);if(result)footFrames.push({frame:n,...result});}await page.evaluate(()=>disposeFoot());assert(footFrames.length>40,'No mounting-foot samples');
   const row={engine,profile,sampleCount:errors.length,maximumDepthError:Math.max(...errors),meanDepthError:errors.reduce((a,b)=>a+b,0)/errors.length,jitter,footFrames,occludedFootFrames:footFrames.filter(r=>!r.pass).length,samples};row.pass=row.maximumDepthError<=.002&&row.occludedFootFrames===0;rows.push(row);
   console.log(engine,profile.name,'maximum GPU depth error',row.maximumDepthError,row.pass);
   console.log('Small camera changes, fixed bench points:',jitter.map(r=>({width:r.width,max:r.maximumColorChange,mean:r.meanColorChange})));
   console.log('Incorrectly occluded mounting-foot frames:',row.occludedFootFrames,'of',footFrames.length);
   await page.evaluate(()=>disposeProbe());await page.close();
  }
 });
 await writeFile(resolve(folder,'depth'+(process.env.CHAIN_REACTION_BASELINE?'-before':'')+'.json'),JSON.stringify(rows,null,2)+'\n');
 if(!process.env.CHAIN_REACTION_BASELINE)assert(rows.every(r=>r.pass),'GPU depth quantization exceeds a seventh of the smallest bevel');
}finally{await server.close();await release();}
