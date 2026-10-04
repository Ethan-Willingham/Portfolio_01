// Every browser test owns and closes its Chrome for Testing process.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium,launchOptions}=require('./browser-support.cjs');
const root=path.resolve(__dirname,'../..');
const hooks=`window.__mapAudit={
 state:()=>({topic,view:{lon:lonOf(view.x),lat:latOf(view.y),z:view.z},W,H,selected:selection&&selection.id,sat:{on:SAT.on,failed:SAT.failed},data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{loading:v.loading,pending:v.pending,error:v.error,tileError:v.tileError,count:v.count,loaded:v.features?.length,parts:v.tileParts?.size}]))}),
 layerInfo:()=>Object.fromEntries(Object.entries(layers).map(([id,c])=>[id,{kind:c.kind,minZ:c.minZ,on:c.on,bounds:c.metadata?.bounds,topic:Object.keys(topics).find(k=>topics[k].layers.includes(id))}])),
 sample:id=>{let f=data[id]?.features?.find(allowed);return f&&{id:f.id,name:f.name,type:f.type,lon:lonOf(f.x),lat:latOf(f.y),facts:featureFacts(f),reference:typeInfo(f),photo:photoFor(f)};},
 results:()=>resultItems.map(f=>({id:f.id,visible:visible(f)})),
 cache:id=>{let d=data[id],parts=[...d.tileParts.values()].flatMap(p=>p.features);return {parts:d.tileParts.size,count:d.features.length,duplicates:d.features.length-new Set(d.features.map(f=>f.id)).size,missing:parts.filter(f=>!d.features.includes(f)).length,stale:d.features.filter(f=>!parts.includes(f)).length};},
 streetNames:()=>data.contextStreets?.features?.map(f=>f.p.n).filter(Boolean),
 labels:()=>{let text=[],original=ctx.fillText;ctx.fillText=function(t){text.push(t);return original.apply(this,arguments);};try{draw();}finally{ctx.fillText=original;}return text;},
 move:(lon,lat,z)=>{view.x=mx(lon);view.y=my(lat);view.z=z;clampView();noteMoved();requestDraw();},
 point:(lon,lat)=>toPx(mx(lon),my(lat)),hit:(x,y)=>hitTest(x,y),
 select:(id,index=0)=>{let f=data[id].features[index];lastSelected=f.id;openPanel(f,false);return f.id;},
 layer:id=>data[id]?.features?.map(f=>({id:f.id,name:f.name,type:f.type,p:f.p,lon:lonOf(f.x),lat:latOf(f.y)})),
 home:()=>({lon:lonOf(HOME.x),lat:latOf(HOME.y),z:HOME.z}),
 performance:()=>{const a=[];for(let i=0;i<12;i++){let t=performance.now();draw();a.push(performance.now()-t);}return a;}
};`;
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
async function harness(){
 const errors=[],failures=[];
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{let bytes=fs.readFileSync(file);if(file.endsWith('/under-map.js')){const s=bytes.toString(),i=s.lastIndexOf('})();');bytes=Buffer.from(s.slice(0,i)+hooks+s.slice(i));}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try{browser=await chromium.launch(launchOptions);}catch(e){server.close();throw e;}
 return {url,errors,failures,browser,
  async page(size={width:1512,height:820},hash='#undermap',configure){
   const context=await browser.newContext({viewport:size,reducedMotion:'reduce',hasTouch:size.width<600,deviceScaleFactor:size.width<600?2:1});
   await context.route('https://www.googletagmanager.com/**',r=>r.abort());const page=await context.newPage();
   page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)failures.push(r.url());});
   if(configure)await configure(page);await page.goto(url+'/archive/under-the-street/under-the-street.html'+hash);
   await page.locator('#undermap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.__mapAudit&&document.querySelector('.um-result'));
   await page.evaluate(()=>document.fonts.ready);return {page,context};
  },async close(){try{await browser.close();}finally{await new Promise(r=>server.close(r));}}
 };
}
async function settle(page){await page.waitForFunction(()=>Object.values(__mapAudit.state().data).every(d=>!d.loading&&!d.pending));}
module.exports={harness,settle,root};
