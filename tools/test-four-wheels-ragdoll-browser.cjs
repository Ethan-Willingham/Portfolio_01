// Real keyboard/touch falls, frozen poses, reloads and visual QA. Own the browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),dump=process.env.DUMP||'/tmp/cart-ragdoll-browser';fs.mkdirSync(dump,{recursive:true});
const hooks=`
 window.__ragTest={
  stop:()=>{cancelAnimationFrame(raf);raf=0;},
  edge:kind=>{prepare(new World(Course.build(kind==='lake'?3:6)));run();__ragTest.stop();Object.assign(world.body,kind==='lake'?{x:1680,y:1100,a:0,vx:65,vy:0,omega:0}:{x:710,y:722,a:Math.PI/2,vx:0,vy:3,omega:0});CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>q.a=world.body.a);draw();},
  step:seconds=>{__ragTest.stop();for(let i=0;i<Math.ceil(seconds*120)&&phase==='running';i++){world.step(1/120,controls());events();tickEffects(1/120);}draw();},
  commit:()=>{__ragTest.stop();for(let i=0;i<600&&!world.fall;i++){world.step(1/120,controls());events();tickEffects(1/120);}draw();},
  state:()=>({phase,run:Course.snapshot(world),input:controls()}),
  visible:()=>{const camera=view.connectedCamera(canvas.width,canvas.height,world,true,touchFocusY);return world.ragdoll.nodes.map(n=>{const p=CartView.project(n);return {x:camera.x+p.x*camera.scale,y:camera.y+p.y*camera.scale,width:canvas.width,height:canvas.height};});},
  render:()=>{draw();return canvas.toDataURL();},save
 };`;
function instrument(source){const end=source.lastIndexOf('})();');assert.ok(end>0);return source.slice(0,end)+hooks+source.slice(end);}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'},errors=[];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{let data=fs.readFileSync(file);if(file.endsWith('/js/four-wheels.js'))data=instrument(data.toString());res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404).end();}});
const check=(name,condition)=>{assert.ok(condition,name);console.log('PASS '+name);};
const state=page=>page.evaluate(()=>__ragTest.state());
async function touch(page,context,start,isWebKit){
 if(!isWebKit){const cdp=context.ragCDP||=await context.newCDPSession(page);if(start){const r=await page.locator('#cart-stick').boundingBox(),finger={id:1,x:r.x+r.width/2,y:r.y+r.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});finger.y-=r.width*.3;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]});}else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else await page.evaluate(start=>{const target=document.getElementById('cart-stick'),r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,send=(type,Y)=>{const t=document.createTouch(window,target,1,x,Y,x,Y),list=document.createTouchList(t);target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?document.createTouchList():list,targetTouches:type==='touchend'?document.createTouchList():list,changedTouches:list}));};if(start){send('touchstart',y);send('touchmove',y-r.width*.3);}else send('touchend',y);},start);
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=process.env.CART_REMOTE_URL||'http://127.0.0.1:'+server.address().port+'/four-wheels.html',isWebKit=process.env.CART_ENGINE==='webkit';
 browser=await(isWebKit?webkit:chromium).launch({headless:true,...(isWebKit?{}:{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'})});
 for(const phone of [false,true]){
  const label=phone?'phone':'desktop',context=await browser.newContext({viewport:phone?{width:852,height:393}:{width:1280,height:720},hasTouch:phone,isMobile:phone});await context.route('https://www.googletagmanager.com/**',r=>r.abort());
  if(process.env.CART_REMOTE_URL)await context.route('**/js/four-wheels.js?*',async route=>{const response=await route.fetch();assert.ok(response.ok());await route.fulfill({response,body:instrument(await response.text())});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!!window.__ragTest);await page.evaluate(()=>document.fonts.ready);
  for(const kind of ['cliff','lake']){
   await page.evaluate(kind=>__ragTest.edge(kind),kind);
   if(phone)await touch(page,context,true,isWebKit);else await page.keyboard.down('w');
   check(label+' actual input pushes toward '+kind,(await state(page)).input.push>.9);
   await page.evaluate(()=>__ragTest.commit());if(phone)await touch(page,context,false,isWebKit);else await page.keyboard.up('w');
   check(label+' '+kind+' releases a jointed shopper',(await state(page)).run.ragdoll?.nodes.length===15);
   for(const dt of [.2,.2,.25,.35]){await page.evaluate(dt=>__ragTest.step(dt),dt);const s=await state(page),time=s.run.ragdoll?.time.toFixed(2);check(label+' '+kind+' joints remain in camera at '+time,(await page.evaluate(()=>__ragTest.visible())).every(p=>p.x>0&&p.x<p.width&&p.y>0&&p.y<p.height));await page.screenshot({path:path.join(dump,label+'-'+kind+'-'+time+'.png')});}
   const before=await state(page),first=await page.evaluate(()=>__ragTest.render()),second=await page.evaluate(()=>__ragTest.render());check(label+' drawing freezes ragdoll pose',first===second&&JSON.stringify(before.run.ragdoll)===JSON.stringify((await state(page)).run.ragdoll));
   await page.locator('#cart-pause').click();const paused=await state(page);await page.evaluate(()=>__ragTest.step(.4));check(label+' pause freezes every joint',JSON.stringify(paused.run.ragdoll)===JSON.stringify((await state(page)).run.ragdoll));
   await page.reload();await page.waitForFunction(()=>!!window.__ragTest);check(label+' Continue restores the exact tumble',JSON.stringify(paused.run.ragdoll)===JSON.stringify((await state(page)).run.ragdoll));
   await page.locator('#cart-start').click();await page.evaluate(()=>__ragTest.step(3));check(label+' '+kind+' catches with an attached shopper',(await state(page)).run.ragdoll===null&&(await state(page)).run.fall===null&&(await state(page)).run.shopper.feet>0);
  }
  await context.close();
 }
 check('no browser JavaScript errors',errors.length===0);console.log('Screenshots: '+dump);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
