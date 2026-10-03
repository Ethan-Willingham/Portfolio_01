// Real keyboard/touch input and saved runs around a shopper-only edge slip.
// The server injects private hooks; the owned browser closes even on failure.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(process.env.CART_SOURCE_ROOT||path.join(__dirname,'..')),dump=process.env.DUMP||'/tmp/cart-footing-browser';fs.mkdirSync(dump,{recursive:true});
const errors=[],mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp'};
function instrument(source){
 const end=source.lastIndexOf('})();');assert.ok(end>0);return source.slice(0,end)+`
   window.__footingTest={
    stop:()=>{cancelAnimationFrame(raf);raf=0;},
    edge:(mode,oldSave=false)=>{prepare(new World(Course.build(6),false,mode));run();__footingTest.stop();Object.assign(world.body,{x:710,y:oldSave?725:727,a:-Math.PI/2,vx:0,vy:-3,omega:0});CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>q.a=world.body.a);world.syncFixedWheels();if(oldSave){Object.assign(world.shopper,{y:739,z:-1,vz:0,feet:0});world.ground.feet=0;}draw();},
    step:seconds=>{__footingTest.stop();for(let i=0;i<Math.ceil(seconds*120);i++){world.step(1/120,controls());events();tickEffects(1/120);}draw();updateUI();},
    state:()=>({body:{...world.body},shopper:{...world.shopper},ground:{...world.ground},falls:world.falls,input:controls(),phase}),
    save,draw
   };`+source.slice(end);
}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let data=fs.readFileSync(file);if(file.endsWith('/js/four-wheels.js'))data=instrument(data.toString());res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}catch(e){res.writeHead(404).end();}
});
const state=p=>p.evaluate(()=>__footingTest.state());
const check=(name,yes)=>{assert.ok(yes,name);console.log('PASS '+name);};
async function setup(browser,url,phone){
 const context=await browser.newContext({viewport:phone?{width:852,height:393}:{width:1280,height:720},isMobile:phone,hasTouch:phone});
 if(process.env.CART_REMOTE_URL)await context.route('**/js/four-wheels.js?*',async route=>{const response=await route.fetch();assert.ok(response.ok());await route.fulfill({response,body:instrument(await response.text())});});
 await context.route('https://www.googletagmanager.com/**',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>!!window.__footingTest);await page.locator('#cart-start').click();await page.evaluate(()=>__footingTest.stop());return {page,context};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=process.env.CART_REMOTE_URL||'http://127.0.0.1:'+server.address().port+'/four-wheels.html',isWebKit=process.env.CART_ENGINE==='webkit';
 browser=await (isWebKit?webkit:chromium).launch({headless:true,...(isWebKit?{}:{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'})});
 const {page}=await setup(browser,url,false);
 for(const mode of ['all-swivel','front-swivel']){
  await page.evaluate(mode=>__footingTest.edge(mode),mode);check('desktop fixture loses only shopper footing in '+mode,(await state(page)).shopper.feet===0&&(await state(page)).ground.count===4);
  await page.screenshot({path:path.join(dump,'desktop-'+mode+'-slip.png')});await page.keyboard.down('w');await page.evaluate(()=>__footingTest.step(1));await page.keyboard.up('w');const s=await state(page);
  check('held keyboard push resumes after feet replant in '+mode,s.shopper.feet>.7&&s.body.y<710&&s.body.vy< -25&&s.falls===0);await page.screenshot({path:path.join(dump,'desktop-'+mode+'-recovered.png')});
 }
 await page.evaluate(()=>{__footingTest.edge('all-swivel',true);__footingTest.save();});const hanging=await state(page);await page.reload();await page.waitForFunction(()=>!!window.__footingTest);
 check('reload keeps the old hanging run behind Continue',(await state(page)).shopper.z===hanging.shopper.z&&(await state(page)).phase==='ready');await page.locator('#cart-start').click();await page.evaluate(()=>__footingTest.stop());await page.keyboard.down('w');await page.evaluate(()=>__footingTest.step(.8));await page.keyboard.up('w');
 check('Continue repairs the hanging pose and restores real keyboard push',(await state(page)).shopper.feet>.7&&(await state(page)).body.vy< -10&&(await state(page)).falls===0);
 const {page:phone,context}=await setup(browser,url,true),cdp=isWebKit?null:await context.newCDPSession(phone);
 for(const mode of ['all-swivel','front-swivel']){
  await phone.evaluate(mode=>__footingTest.edge(mode),mode);const r=await phone.locator('#cart-stick').boundingBox(),finger={id:1,x:r.x+r.width/2,y:r.y+r.height/2};
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});finger.y-=r.width*.28;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]});}
  else await phone.evaluate(({x,y,travel})=>{const target=document.getElementById('cart-stick'),send=(type,Y)=>{const touch=document.createTouch(window,target,1,x,Y,x,Y),list=document.createTouchList(touch);target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:list,targetTouches:list,changedTouches:list}));};send('touchstart',y);send('touchmove',y-travel);},{x:finger.x,y:finger.y,travel:r.width*.28});
  check('landscape phone holds native stick push in '+mode,(await state(phone)).input.push>.99);await phone.evaluate(()=>__footingTest.step(1));const s=await state(phone);
  check('held touch push resumes after feet replant in '+mode,s.shopper.feet>.7&&s.body.y<710&&s.body.vy< -25&&s.falls===0);await phone.screenshot({path:path.join(dump,'phone-'+mode+'-recovered.png')});
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await phone.evaluate(()=>{const target=document.getElementById('cart-stick'),touch=document.createTouch(window,target,1,0,0,0,0);target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:document.createTouchList(),targetTouches:document.createTouchList(),changedTouches:document.createTouchList(touch)}));});
  check('touch release still clears push after recovering',(await state(phone)).input.push===0);
 }
 check('no browser JavaScript errors',errors.length===0);console.log('Screenshots: '+dump);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
