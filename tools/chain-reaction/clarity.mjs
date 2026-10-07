import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {serve,browserRun} from './browser.mjs';
import {toolLock,hash,deadline} from './core.mjs';
const folder=process.env.CHAIN_REACTION_EVIDENCE,old=await readFile(process.env.CHAIN_REACTION_RENDERER_BEFORE,'utf8'),rows=[];
assert(folder);await mkdir(folder,{recursive:true});const release=await toolLock(),cancel=deadline(240000),server=await serve();
const fixture='<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="scene"></canvas><script src="/js/vendor/three-r128.min.js"></script><script src="/js/chain-reaction-materials.js"></script><script src="/js/chain-reaction-renderer.js"></script>';
try {
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  for(const profile of [{name:'desktop',width:1440,height:900,dpr:1},{name:'owner',width:859,height:767,dpr:2},{name:'phone',width:844,height:390,dpr:2}])for(const baseline of [true,false]){
   const page=await browser.newPage({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
   if(baseline)await page.route('**/js/chain-reaction-renderer.js',r=>r.fulfill({contentType:'text/javascript',body:old}));
   await page.route('**/clarity-test.html',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(server.url+'/clarity-test.html');
   const probe=await page.evaluate(async()=>{
    const T=THREE,Original=T.WebGLRenderer,calls=[];
    T.WebGLRenderer=function(...args){const r=new Original(...args),render=r.render,gl=r.getContext();if(r.capabilities.isWebGL2){const storage=gl.renderbufferStorageMultisample.bind(gl);gl.renderbufferStorageMultisample=(...args)=>{calls.push({samples:args[1],format:args[2],width:args[3],height:args[4]});return storage(...args);};}r.render=function(scene,camera){if(camera.isPerspectiveCamera){window.filmScene=scene;window.filmRenderer=r;window.filmTarget=r.getRenderTarget();}return render.call(r,scene,camera);};return r;};
    const index=await fetch('/assets/chain-reaction/index.json').then(r=>r.json()),ds=await Promise.all(index.stages.map(s=>fetch('/assets/chain-reaction/stages/'+s.file).then(r=>r.json())));
    window.view=ChainReaction.makeView(document.getElementById('scene'),ds);view.setCamera({x:8.9,y:3.25,width:11.2,minHeight:6.7});view.draw(0,false,0,false);
    const production={quality:view.quality?.(),gpuAllocations:[...calls],shadowMaps:filmScene.children.filter(o=>o.isDirectionalLight&&o.castShadow).map(l=>({width:l.shadow.map.width,height:l.shadow.map.height,filter:filmRenderer.shadowMap.type,radius:l.shadow.radius}))};
    filmScene.children.filter(o=>o.isGroup).forEach(o=>o.visible=false);
    // A flat diagonal measures real fractional coverage in the scene buffer.
    // Rear checkerboard detail must survive the final pass without focus blur.
    const bg=new T.Color('#303931');filmScene.background=bg;const ink=new T.MeshBasicMaterial({color:'#e8e2d6',toneMapped:false}),stripe=new T.Mesh(new T.PlaneGeometry(.7,3.2),ink);stripe.position.set(7.2,3.1,.3);stripe.rotation.z=.31;filmScene.add(stripe);
    const card=document.createElement('canvas');card.width=card.height=128;const c=card.getContext('2d');for(let y=0;y<16;y++)for(let x=0;x<16;x++){c.fillStyle=(x+y)%2?'#e8e2d6':'#303931';c.fillRect(x*8,y*8,8,8);}const texture=new T.CanvasTexture(card);texture.encoding=T.sRGBEncoding;texture.minFilter=texture.magFilter=T.NearestFilter;const checker=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:texture,toneMapped:false}));checker.position.set(10.4,3.2,-1.4);filmScene.add(checker);view.draw(0,false,0,false);
    const size=filmRenderer.getDrawingBufferSize(new T.Vector2()),canvas=new Uint8Array(size.x*size.y*4),gl=filmRenderer.getContext();gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,canvas);const target=filmTarget,raw=new Uint8Array(target.width*target.height*4);filmRenderer.readRenderTargetPixels(target,0,0,target.width,target.height,raw);
    let partial=0,maximumPostDifference=0;const colors=new Map();for(let y=0;y<size.y;y++)for(let x=Math.round(size.x*.15);x<Math.round(size.x*.44);x++){const k=(y*size.x+x)*4,tag=raw[k]+','+raw[k+1]+','+raw[k+2];colors.set(tag,(colors.get(tag)||0)+1);}const dominant=[...colors].sort((a,b)=>b[1]-a[1]).slice(0,2).map(r=>r[0]);for(const [tag,count]of colors)if(!dominant.includes(tag))partial+=count;
    if(target.width===size.x&&target.height===size.y)for(let n=0;n<canvas.length;n++)if(n%4!==3)maximumPostDifference=Math.max(maximumPostDifference,Math.abs(canvas[n]-raw[n]));
    return{...production,partialCoveragePixels:partial,colorLevels:colors.size,maximumPostDifference,glError:gl.getError(),canvasSize:{width:size.x,height:size.y},targetSize:{width:target.width,height:target.height},msaaTarget:!!target.isWebGLMultisampleRenderTarget};
   });
   await page.screenshot({path:folder+'/'+engine+'-'+profile.name+'-'+(baseline?'before':'after')+'-clarity.png'});
   if(!baseline){assert(probe.msaaTarget);assert(probe.gpuAllocations.some(c=>c.samples>=2&&c.format===33190),'No multisampled 24-bit scene depth');assert(probe.partialCoveragePixels>100,'No fractional diagonal edge coverage');assert(probe.maximumPostDifference<=1,'Final pass blurs scene details');assert(probe.shadowMaps.every(m=>m.width===4096&&m.filter===1));assert.equal(probe.glError,0);assert.deepEqual(errors,[]);}
   rows.push({engine,profile,baseline,probe,errors});await page.evaluate(()=>view.dispose());await page.close();
  }
 });
 await writeFile(folder+'/clarity.json',JSON.stringify({beforeHash:hash(old),rows},null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({engine:r.engine,profile:r.profile.name,before:r.baseline,coverage:r.probe.partialCoveragePixels,postDifference:r.probe.maximumPostDifference,samples:r.probe.quality?.samples,glError:r.probe.glError}))));
}finally{await server.close();await release();cancel();}
