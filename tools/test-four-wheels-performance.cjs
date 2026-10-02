// Measure the real frame loop, including 120 Hz physics, sound and rendering.
// Test hooks are injected locally. The owned browser closes in finally.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),errors=[],results={};let browser,reference=null;
const hooks=`
 let frameSamples=[],frameIntervals=[],lastFrameSample;
 const originalFrame=frame;frame=function(now){const start=performance.now();if(lastFrameSample!==undefined)frameIntervals.push(now-lastFrameSample);lastFrameSample=now;try{return originalFrame(now);}finally{frameSamples.push(performance.now()-start);}};
 window.__cartPerf={
  clear:()=>{frameSamples=[];frameIntervals=[];lastFrameSample=undefined;},
  stats:()=>({frames:frameSamples,intervals:frameIntervals,time:world.time,cells:[...world.stock.liquids.values()].reduce((n,l)=>n+l.cells.size,0),sound:sound.enabled,rocks:floor.rocks?.size||0,tiles:floor.tiles.size}),
  scene:(chapter,x,y,a=0,v=0)=>{cancelAnimationFrame(raf);raf=0;reset(chapter);followCart=true;if(x!==undefined){Object.assign(world.body,{x,y,a,vx:Math.cos(a)*v,vy:Math.sin(a)*v,omega:0});CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>Object.assign(q,{a,omega:0}));}if(chapter===2||chapter===7){for(let i=0;i<240;i++)world.step(1/120,{push:.4});world.events.length=0;}draw();},
  cacheCheck:()=>{cancelAnimationFrame(raf);raf=0;const original=CartCourse.snapshot(world),changes=[];
   const check=()=>{draw();const warm=canvas.toDataURL();view.refreshFonts();view.draw(ctx,world,view.makeFloor(world.level),{follow:followCart});changes.push(warm===canvas.toDataURL());};
   const s=world.shelves[1],p=s.stockItems.find(p=>p.state==='shelf');check();s.cx+=7;s.a+=.13;s.tilt+=.2;s.nx=.6;s.ny=.8;check();p.u+=3;p.a+=.3;p.color=5;check();world.stock.release(p);p.state='floor';p.flat=true;p.width*=1.35;check();view.refreshFonts();check();
   CartCourse.restore(world,original);draw();return changes;
  },
  mapCheck:()=>{cancelAnimationFrame(raf);raf=0;followCart=false;draw();const map=floor.rockMap,rocks=floor.rocks?.size||0;const start=performance.now();for(let i=0;i<12;i++)draw();const ms=(performance.now()-start)/12;const reused=map===floor.rockMap;followCart=true;draw();return {reused,rocks,ms};}
 };`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let data=reference&&/four-wheels[^/]*\.(js|css|html)$/.test(file)?execFileSync('git',['show',reference+':'+path.relative(root,file)],{cwd:root,maxBuffer:10*1024*1024}):fs.readFileSync(file);
  if(file.endsWith('/js/four-wheels.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=source.slice(0,end)+hooks+source.slice(end);}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404).end();}
});
const distribution=a=>{const sorted=a.slice().sort((a,b)=>a-b);return {mean:a.reduce((n,x)=>n+x,0)/a.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
async function measure(label,context,url){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>!!window.__cartPerf);await page.evaluate(()=>document.fonts.ready);
 const samples={};
 for(const [name,pose]of [['start',[0]],['grocery',[2,1190,1316,0,65]],['relay',[7,850,290,0,65]]]){
  await page.evaluate(p=>__cartPerf.scene(...p),pose);await page.locator('#cart-start').click();await page.keyboard.down('w');
  await page.waitForTimeout(750);await page.evaluate(()=>__cartPerf.clear());const start=Date.now();await page.waitForTimeout(4000);
  const data=await page.evaluate(()=>__cartPerf.stats()),cpu=distribution(data.frames),interval=distribution(data.intervals);
  samples[name]={fps:data.frames.length*1000/(Date.now()-start),cpu,interval,cells:data.cells};
  assert.ok(data.frames.length>50&&data.time>3,'the running simulation makes progress');assert.ok(data.sound,'sound stays enabled');
  if(label!=='baseline'){assert.ok(cpu.p95<Number(process.env.CART_FRAME_BUDGET||16.7),label+' '+name+' frame budget: '+JSON.stringify(cpu));assert.ok(data.rocks<=24&&data.tiles<=32,'raster caches stay bounded');}
  console.log(label+' '+name+': '+JSON.stringify(samples[name]));await page.keyboard.up('w');await page.locator('#cart-pause').click();
 }
 if(label!=='baseline'){
  await page.evaluate(()=>__cartPerf.scene(2,1190,1316));
  const updates=await page.evaluate(()=>__cartPerf.cacheCheck());assert.ok(updates.every(Boolean),'cached geometry updates after furniture movement, stock changes, release and font refresh: '+JSON.stringify(updates));
  const map=await page.evaluate(()=>__cartPerf.mapCheck());assert.ok(map.reused&&map.rocks<=24,'overview reuses its raster rather than thrashing world tiles');assert.ok(map.ms<Number(process.env.CART_FRAME_BUDGET||16.7),'overview stays within the render budget: '+JSON.stringify(map));console.log('PASS '+label+' cache invalidation and bounded overview '+JSON.stringify(map));
 }
 await page.close();results[label]=samples;
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/four-wheels.html';
 browser=await (process.env.CART_ENGINE==='webkit'?webkit:chromium).launch({headless:true,...(process.env.CART_ENGINE==='webkit'?{}:{executablePath:process.env.CART_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'})});
 const desktop=await browser.newContext({viewport:{width:1280,height:720}});await desktop.route('https://www.googletagmanager.com/**',r=>r.abort());
 if(process.env.CART_COMPARE_REF){reference=process.env.CART_COMPARE_REF;await measure('baseline',desktop,url);reference=null;}
 await measure('desktop',desktop,url);
 const phone=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});await phone.route('https://www.googletagmanager.com/**',r=>r.abort());
 await measure('phone',phone,url);
 if(results.baseline)for(const name of ['grocery','relay'])assert.ok(results.desktop[name].cpu.mean<results.baseline[name].cpu.mean*.7,name+' reduces actual frame work by at least 30 percent');
 assert.deepEqual(errors,[]);console.log('All sustained frame performance checks passed.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
