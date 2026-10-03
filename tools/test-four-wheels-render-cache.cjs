// The optional artwork worker, stale replies, fallback and model invalidation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),sharp=require('sharp'),root=path.resolve(__dirname,'..');let browser;
const hooks=`window.__renderQA={
 ready:()=>floor.pending===0,
 scene:index=>{cancelAnimationFrame(raf);raf=0;reset(index);floor=view.makeFloor(world.level,false,true);draw();},
 stats:()=>({pending:floor.pending,working:floor.working,tiles:floor.tiles.size,rocks:floor.rocks.size,chunks:floor.commandRasters?.size||0,pixels:floor.commandRasters?.pixels||0}),
 fresh:()=>{draw();const cached=canvas.toDataURL(),before=JSON.stringify(Course.snapshot(world));view.draw(ctx,world,view.makeFloor(world.level),{follow:followCart,focusY:touchFocusY});const fresh=canvas.toDataURL();draw();return {cached,fresh,unchanged:before===JSON.stringify(Course.snapshot(world))};},
 change:()=>{const shelf=world.shelves[1],p=shelf.stockItems.find(p=>p.state==='shelf');shelf.cx+=7;shelf.tilt=.2;shelf.a+=.1;p.color=(p.color+1)%6;p.u+=3;draw();},
 release:()=>{const p=world.shelves[1].stockItems.find(p=>p.state==='shelf');world.stock.release(p);p.state='floor';p.flat=true;p.width*=1.35;draw();},
 fonts:()=>{view.refreshFonts();draw();},
 map:()=>{followCart=!followCart;draw();}
};`;
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let data=fs.readFileSync(file);if(file.endsWith('/js/four-wheels.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=source.slice(0,end)+hooks+source.slice(end);}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream'}).end(data);
 }catch{res.writeHead(404).end();}
});
// Intermediate transparent canvases can change the last color byte at a few
// pixels when premultiplied alpha is rounded. Geometry or a stale tint cannot.
async function check(page,label){
 await page.waitForFunction(()=>__renderQA.ready());const result=await page.evaluate(()=>__renderQA.fresh());
 // Decode outside the browser. Repeated getImageData on the live canvas can
 // switch Chrome from GPU to software rendering midway through this test.
 const decode=png=>sharp(Buffer.from(png.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
 const [cached,fresh]=await Promise.all([decode(result.cached),decode(result.fresh)]);assert.equal(cached.length,fresh.length);
 let changed=0,max=0;for(let i=0;i<cached.length;i+=4){let different=false;for(let j=0;j<4;j++){const d=Math.abs(cached[i+j]-fresh[i+j]);max=Math.max(max,d);different||=d>0;}if(different)changed++;}
 assert.ok(max<=1&&changed<cached.length/4*.001,label+': cached and fresh pixels match within 8-bit compositing rounding: '+JSON.stringify({changed,max}));assert.ok(result.unchanged,'rendering cannot change a saved run');
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/four-wheels.html';
 const engine=process.env.CART_ENGINE==='webkit'?webkit:chromium;
 browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}:{})});
 for(const mode of ['worker','unavailable','failure']){
  const context=await browser.newContext({viewport:{width:1280,height:720}}),errors=[];
  await context.route('https://www.googletagmanager.com/**',r=>r.abort());
  if(mode==='unavailable')await context.addInitScript(()=>{window.OffscreenCanvas=undefined;});
  if(mode==='failure')await context.route('**/four-wheels-scenery-worker.js?*',r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!!window.__renderQA&&document.getElementById('cart-game').dataset.loading!=='true');await page.evaluate(()=>document.fonts.ready);
  for(const chapter of [0,2,4,7,11]){await page.evaluate(i=>__renderQA.scene(i),chapter);await check(page,mode+' chapter '+chapter);}
  await page.evaluate(()=>{__renderQA.scene(7);__renderQA.scene(0);__renderQA.scene(2);});await check(page,mode+' quick changes');
  for(const action of ['change','release','fonts','map','map']){await page.evaluate(action=>__renderQA[action](),action);await check(page,mode+' '+action);}
  const stats=await page.evaluate(()=>__renderQA.stats());assert.equal(stats.working,mode==='worker');assert.ok(stats.tiles<=32&&stats.rocks<=24&&stats.chunks<=96&&stats.pixels<=4*1024*1024);assert.deepEqual(errors,[]);
  console.log('PASS '+mode+' scenery, quick scene changes, cache invalidation and bounded memory');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
