// Compare real tree pixels with road and wall pixels at every active scale.
// Private renderer hooks stay in this server; the owned browser closes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),errors=[];let browser;
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    let data=fs.readFileSync(file);
    if(file.endsWith('/js/four-wheels-view.js'))data=data.toString().replace('return {draw,makeFloor,',
      "return {testModels:(scene,w)=>{terrainLevel=w.level;courseModels(scene,w,()=>true,'static');cliffFaces(scene,w,()=>true,'below');terrainLevel=null;},testTrees:(scene,w)=>{for(const p of w.level.decor)if(p.kind==='tree')courseTree(scene,p);spaceCourseTrees(scene,w.level);},testGround:courseGround,draw,makeFloor,");
    if(file.endsWith('/js/four-wheels.js')){
      const source=data.toString(),end=source.lastIndexOf('})();');
      data=source.slice(0,end)+'window.__sceneryQA={view,world:()=>world};'+source.slice(end);
    }
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const engine=process.env.CART_ENGINE==='webkit'?webkit:chromium;
  browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}:{})});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.googletagmanager.com/**',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/four-wheels.html');await page.waitForFunction(()=>!!window.__sceneryQA);
  for(const scale of [1,1.45,1.8]){
    const result=await page.evaluate(scale=>{
      const {view}=__sceneryQA,w=__sceneryQA.world(),treeScene=new view.Scene(1,true),road=new view.Scene();
      view.testTrees(treeScene,w);view.testModels(road,w);
      const trees=treeScene.commands.map(c=>c.treePosition);
      let pixels=0,covered=0;
      for(const tree of trees){
        const origin=CartView.project(tree),c=document.createElement('canvas');c.width=c.height=320;
        const g=c.getContext('2d');g.translate(c.width/2-origin.x*scale,c.height*.78-origin.y*scale);g.scale(scale,scale);
        treeScene.flush(g);const treePixels=g.getImageData(0,0,c.width,c.height).data;
        g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.restore();
        for(const area of w.level.floorAreas){
          const points=area.poly.map(p=>CartView.project({...p,z:CartTerrain.height(w.level,p)}));
          g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();
        }
        road.flush(g);const roadPixels=g.getImageData(0,0,c.width,c.height).data;
        for(let i=3;i<treePixels.length;i+=4)if(treePixels[i]){pixels++;if(roadPixels[i])covered++;}
      }
      return {trees:trees.length,expected:w.level.decor.length,pixels,covered,ground:trees.every(p=>p?.z===-100)};
    },scale);
    assert.equal(result.trees,result.expected,'every tree has a clear position');assert.ok(result.ground,'trees stand on the rock impact plane');
    assert.ok(result.pixels>2000,'sample actual tree silhouettes');assert.equal(result.covered,0,'roads and walls cover no tree pixels at scale '+scale);
    console.log('PASS '+result.pixels+' tree pixels clear roads and walls at scale '+scale);
  }
  const ground=await page.evaluate(()=>{
    const {view}=__sceneryQA,w=__sceneryQA.world(),draw=offset=>{
      const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.translate(-offset,0);
      view.testGround(g,w,{left:offset,top:0,right:offset+256,bottom:256});return g.getImageData(0,0,256,256).data;
    },a=draw(0),b=draw(128),repeat=draw(0);let mismatches=0,unstable=0;const colors=new Set();
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const i=(y*256+x)*4;colors.add(a.slice(i,i+3).join(','));
      for(let n=0;n<4;n++){if(a[i+n]!==repeat[i+n])unstable++;if(x>=128&&a[i+n]!==b[(y*256+x-128)*4+n])mismatches++;}
    }
    return {colors:colors.size,mismatches,unstable};
  });
  assert.ok(ground.colors>8,'the lower ground contains visible surface texture');
  assert.equal(ground.mismatches,0,'texture stays anchored across neighboring cache tiles');assert.equal(ground.unstable,0,'pause and redraw cannot advance scenery');
  assert.deepEqual(errors,[]);console.log('PASS textured lower ground stays fixed during scrolling and redraw');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
