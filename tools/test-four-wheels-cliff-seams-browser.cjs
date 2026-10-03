// Check the rendered cliff interiors, including the lower rock layer.
// Private renderer hooks stay in this local server. The owned browser closes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),errors=[];let browser;
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    let data=fs.readFileSync(file);
    if(file.endsWith('/js/four-wheels-view.js'))data=data.toString().replace('return {draw,makeFloor,','return {testCliffs:cliffFaces,draw,makeFloor,');
    if(file.endsWith('/js/four-wheels.js')){
      const source=data.toString(),end=source.lastIndexOf('})();');
      data=source.slice(0,end)+'window.__cliffQA={view,world:()=>world};'+source.slice(end);
    }
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
(async()=>{try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.CART_ENGINE==='webkit'?webkit:chromium;
  browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CART_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'}:{})});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.googletagmanager.com/**',route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/four-wheels.html');
  await page.waitForFunction(()=>!!window.__cliffQA);
  for(const scale of [1,1.45,1.8]){
    const result=await page.evaluate(scale=>{
      const w=__cliffQA.world(),view=__cliffQA.view,edges=CartView.exposedEdges(w.level,CartCourse);
      const points=edges.flatMap(e=>[CartView.project({...e.a,z:0}),CartView.project({...e.b,z:-105})]);
      const left=Math.floor(Math.min(...points.map(p=>p.x))*scale)-3,top=Math.floor(Math.min(...points.map(p=>p.y))*scale)-3;
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(Math.max(...points.map(p=>p.x))*scale)-left+4;canvas.height=Math.ceil(Math.max(...points.map(p=>p.y))*scale)-top+4;
      const g=canvas.getContext('2d');g.translate(-left,-top);g.scale(scale,scale);
      const scene=new view.Scene();view.testCliffs(scene,w,()=>true,'below');scene.flush(g);
      const pixels=g.getImageData(0,0,canvas.width,canvas.height).data;let samples=0,holes=0;
      for(const e of edges){
        if(e.normal.x+e.normal.y<.15||Math.hypot(e.a.x-e.b.x,e.a.y-e.b.y)<2)continue;
        const face=[CartView.project({...e.a,z:0}),CartView.project({...e.b,z:0}),CartView.project({...e.b,z:-105}),CartView.project({...e.a,z:-105})];
        for(const t of [.25,.5,.75])for(const z of [-15,-45,-75]){
          const p=CartView.project({x:e.a.x+(e.b.x-e.a.x)*t,y:e.a.y+(e.b.y-e.a.y)*t,z}),x=Math.floor(p.x*scale-left),y=Math.floor(p.y*scale-top);
          const center={x:(left+x+.5)/scale,y:(top+y+.5)/scale};
          // A projected point can round to a pixel beyond a narrow silhouette.
          // Check pixel centers inside the face, clear of its outer boundary.
          if(!CartCourse.inside(center,face)||Math.min(...face.map((a,i)=>CartCourse.nearest(center,a,face[(i+1)%4]).d))*scale<.6)continue;
          samples++;if(pixels[(y*canvas.width+x)*4+3]===0)holes++;
        }
      }
      return {samples,holes};
    },scale);
    assert.ok(result.samples>3000,'check cliff interiors across the entire course');
    assert.equal(result.holes,0,'no background pixels show through cliff interiors at scale '+scale);
    console.log('PASS '+result.samples+' cliff interior pixels contain rock at scale '+scale);
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
