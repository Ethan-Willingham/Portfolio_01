// Texture preparation stays behind the loading card. The test server injects
// private hooks and owns its browser, which closes in finally.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),errors=[];let browser;
const hooks=`
 window.__cartLoading={
  ready:()=>artworkReady,
  state:()=>({phase,time:world.time,ready:artworkReady,tiles:floor.tiles.size,rocks:floor.rocks.size,preparedTiles:floor.preparedTiles.size,preparedRocks:floor.preparedRocks.size,
   pixels:[...floor.preparedTiles.values(),...floor.preparedRocks.values()].reduce((n,t)=>n+t.canvas.width*t.canvas.height,0)}),
  walk:()=>{cancelAnimationFrame(raf);raf=0;const original=CartCourse.snapshot(world),samples=[];
   for(const section of world.level.sections)for(const p of section.path){
    Object.assign(world.body,p);CartTerrain.init(world,world.terrainGeometry);world.body.a=section.start.a;world.ground.lastHeight=CartTerrain.height(world.level,p);
    const start=performance.now();draw();samples.push(performance.now()-start);
   }
   CartCourse.restore(world,original);draw();return samples;
  },
  reuse:()=>{const prepared=floor.preparedTiles,rocks=floor.preparedRocks;reset();startPractice(0);cancelAnimationFrame(raf);raf=0;returnToRun();return prepared===floor.preparedTiles&&rocks===floor.preparedRocks;},
  draw,run,
  pause:()=>pause(),
  save:()=>save(),
  latePractice:()=>{startPractice(10);cancelAnimationFrame(raf);raf=0;draw();return {body:{...world.body},start:{...world.level.sections[10].start}};},
  body:()=>({...world.body})
 };`;
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let data=fs.readFileSync(file);
  if(file.endsWith('/js/four-wheels-view.js'))data=data.toString()
   .replace('function exposedEdges(level,Course) {','function exposedEdges(level,Course) {window.__generatedEdges=(window.__generatedEdges||0)+1;')
   .replace('const Course=root.CartCourse,size=256,area=', 'window.__generatedFloor=(window.__generatedFloor||0)+1;const Course=root.CartCourse,size=256,area=')
   .replace('const size=512,tile=document.createElement', 'window.__generatedRock=(window.__generatedRock||0)+1;const size=512,tile=document.createElement')
   .replace('async function prepareCourse(w,background,onProgress=()=>{}) {','async function prepareCourse(w,background,onProgress=()=>{}) {if(window.__failPreparation){window.__failPreparation=false;throw new Error("Test preparation failure");}');
  if(file.endsWith('/js/four-wheels.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=source.slice(0,end)+hooks+source.slice(end);}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
const generated=page=>page.evaluate(()=>[window.__generatedFloor||0,window.__generatedRock||0,window.__generatedEdges||0]);
async function ready(page){await page.waitForFunction(()=>window.__cartLoading?.ready(),{},{timeout:60000});}
async function exercise(label,context,url){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await ready(page);
 assert.equal(await page.locator('#cart-canvas').evaluate(e=>getComputedStyle(e).visibility),'visible');
 assert.equal(await page.locator('#cart-start').isEnabled(),true);
 const initial=await page.evaluate(()=>__cartLoading.state()),before=await generated(page);
 assert.equal(initial.phase,'ready');assert.equal(initial.preparedTiles,71);assert.ok(initial.preparedRocks>0);
 assert.ok(initial.pixels*4<140*1024*1024,'prepared course artwork stays below 140 MiB');
 const samples=await page.evaluate(()=>__cartLoading.walk());
 assert.deepEqual(await generated(page),before,'every route point uses prepared textures after LRU eviction');
 assert.ok(await page.evaluate(()=>__cartLoading.reuse()),'restart, practice and returning to the run retain the same sources');
 assert.deepEqual(await generated(page),before,'switching runs creates no new textures');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__cartLoading.walk());
 await page.setViewportSize({width:844,height:390});await page.evaluate(()=>__cartLoading.walk());
 assert.deepEqual(await generated(page),before,'viewport and orientation changes create no new textures');
 const state=await page.evaluate(()=>__cartLoading.state());assert.ok(state.tiles<=32&&state.rocks<=24,'live raster caches stay bounded');
 const practice=await page.evaluate(()=>__cartLoading.latePractice());assert.equal(practice.body.x,practice.start.x);assert.equal(practice.body.y,practice.start.y);
 assert.deepEqual(await generated(page),before,'late-course practice uses the prepared artwork immediately');
 await page.reload();await ready(page);assert.equal((await page.evaluate(()=>__cartLoading.state())).preparedTiles,71,'reload prepares the full course before allowing play');
 console.log('PASS '+label+' prepared whole course, cache eviction, restart/practice, rotation and reload '+JSON.stringify({artworkMiB:initial.pixels*4/1024/1024,mean:samples.reduce((n,x)=>n+x,0)/samples.length,max:Math.max(...samples)}));
 await page.close();
}
(async()=>{try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/four-wheels.html';
 const engine=process.env.CART_ENGINE==='webkit'?webkit:chromium;
 browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CART_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'}:{})});
 const desktop=await browser.newContext({viewport:{width:1280,height:720}});await desktop.route('https://www.googletagmanager.com/**',r=>r.abort());
 let releaseFont;const delayedFont=new Promise(resolve=>releaseFont=resolve);
 await desktop.route('**/commit_mono_bold.woff2',async route=>{await delayedFont;await route.continue();});
 const slow=await desktop.newPage();slow.on('pageerror',e=>errors.push(e.message));
 await slow.goto(url,{waitUntil:'domcontentloaded'});await slow.waitForFunction(()=>!!window.__cartLoading);
 assert.equal(await slow.locator('#cart-start').isDisabled(),true,'Play waits for the actual canvas font');
 assert.equal(await slow.locator('#cart-canvas').evaluate(e=>getComputedStyle(e).visibility),'hidden','no partially prepared scene is visible');
 await slow.evaluate(()=>__cartLoading.run());assert.equal(await slow.evaluate(()=>__cartLoading.state().phase),'ready','early inputs cannot start physics');
 assert.equal(await slow.evaluate(()=>__cartLoading.state().time),0,'preparation does not advance the run');
 releaseFont();await slow.waitForFunction(()=>__cartLoading.state().preparedTiles>0&&!__cartLoading.ready());
 await slow.screenshot({path:'/tmp/four-wheels-loading.png'});await ready(slow);
 const before=await generated(slow);await slow.locator('#cart-start').click();await slow.keyboard.down('w');await slow.waitForTimeout(300);await slow.keyboard.up('w');
 assert.ok(await slow.evaluate(()=>__cartLoading.state().time)>0,'Play advances the game after readiness');
 await slow.evaluate(()=>__cartLoading.pause());assert.deepEqual(await generated(slow),before,'font completion never clears prepared terrain during play');
 await slow.screenshot({path:'/tmp/four-wheels-loaded.png'});await slow.close();await desktop.unroute('**/commit_mono_bold.woff2');
 await exercise('desktop',desktop,url);
 const phone=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});await phone.route('https://www.googletagmanager.com/**',r=>r.abort());
 await exercise('phone',phone,url);
 const fallback=await browser.newContext({viewport:{width:1280,height:720}});await fallback.route('https://www.googletagmanager.com/**',r=>r.abort());await fallback.route('**/commit_mono*.woff2',r=>r.abort());
 const failed=await fallback.newPage();failed.on('pageerror',e=>errors.push(e.message));await failed.goto(url);await ready(failed);
 assert.equal(await failed.locator('#cart-start').isEnabled(),true,'failed fonts still settle to a playable prepared scene');await failed.close();
 const retry=await browser.newContext();await retry.route('https://www.googletagmanager.com/**',r=>r.abort());await retry.addInitScript(()=>window.__failPreparation=true);
 const recovering=await retry.newPage();recovering.on('pageerror',e=>errors.push(e.message));await recovering.goto(url);await recovering.waitForFunction(()=>document.getElementById('cart-start').textContent==='Try again');
 assert.equal(await recovering.locator('#cart-canvas').evaluate(e=>getComputedStyle(e).visibility),'hidden','preparation failure keeps the partial scene hidden');
 await recovering.locator('#cart-start').click();await ready(recovering);assert.equal(await recovering.locator('#cart-start').textContent(),'Play');await recovering.close();
 assert.deepEqual(errors,[]);console.log('All course texture preparation checks passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
