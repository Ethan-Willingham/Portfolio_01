'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),dump=process.env.SHIFT_DUMP||path.join(require('node:os').tmpdir(),'one-shift-tooltips');
fs.mkdirSync(dump,{recursive:true});
let server,browser,page,checks=0;const errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const tip=p=>p.locator('#shift-hover-label');
async function ready(p){await p.waitForFunction(()=>window.OneShift?.app?.hoverLabels&&document.getElementById('place-image').naturalWidth>0);await p.evaluate(()=>document.fonts.ready);}
async function point(p,selector){return p.locator(selector).evaluate(n=>{const r=n.closest('.place-art-engine').getBoundingClientRect();return {x:r.left+Number(n.dataset.pointX)*r.width,y:r.top+Number(n.dataset.pointY)*r.height};});}
async function hover(p,selector,text){
  await p.mouse.move(1,1);await p.waitForTimeout(170);
  const n=p.locator(selector);
  if(await n.getAttribute('data-point-x')!==null){const q=await point(p,selector);await p.mouse.move(q.x,q.y);}else await n.hover();
  await tip(p).waitFor({state:'visible'});
  if(text)check('Hover label: '+text,(await tip(p).textContent()).includes(text));
  check('Label stays inside viewport',await tip(p).evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=11&&r.top>=11&&r.right<=innerWidth-10&&r.bottom<=innerHeight-10;}));
}
async function choose(p,id){const q=await point(p,'#place-targets [data-place="'+id+'"]');await p.mouse.click(q.x,q.y);await p.locator('#place-loading').waitFor({state:'hidden'});}
async function shot(p,name){await p.waitForTimeout(160);await p.screenshot({path:path.join(dump,name+'.png')});}
async function palletPoint(p,viewName){return p.evaluate(viewName=>{
  const v=OneShift.app[viewName],r=v.canvas.getBoundingClientRect();
  for(const q of [...v.layout].reverse())for(let y=.2;y<.9;y+=.1)for(let x=.2;x<.9;x+=.1){
    const e={clientX:r.left+v.ox+(q.x+q.w*x)*v.scale,clientY:r.top+v.oy+(q.y+q.h*y)*v.scale,pointerType:'mouse'};
    if(v.hit(e)?.id===q.p.id)return {x:e.clientX,y:e.clientY,id:q.p.id,name:q.p.name};
  }throw Error('No pallet hit found');
},viewName);}
(async()=>{
  let url=process.env.SHIFT_URL;
  if(!url){
    server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/one-shift-classic.html';
  }
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await ready(page);
  const start=await page.evaluate(()=>OneShift.app.sim.hash());
  await hover(page,'#place-targets [data-place="punch"]','Clock in');await shot(page,'01-clock');
  check('Hover does not advance the entrance or mutate the warehouse',await page.evaluate(()=>OneShift.app.sim.hash())===start);
  check('Visible label describes its native target',await page.locator('#place-targets [data-place="punch"]').getAttribute('aria-describedby')==='shift-hover-label');
  const rect=await tip(page).boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.waitForTimeout(350);
  check('Pointer can enter the label without dismissing it',await tip(page).isVisible());
  await page.keyboard.press('Escape');check('Escape dismisses the label without leaving the room',await tip(page).isHidden()&&await page.evaluate(()=>OneShift.app.places.current==='clock'));
  await hover(page,'#place-menu','Game menu');await page.mouse.move(1,1);await tip(page).waitFor({state:'hidden'});
  await hover(page,'#place-menu','Game menu');check('Repeated enter and leave retains working dismissal',await tip(page).isVisible());
  await page.keyboard.press('Escape');await page.keyboard.press('Tab');await page.locator('#place-targets [data-place="punch"]').focus();
  check('Keyboard focus shows the object label and key',await tip(page).isVisible()&&await tip(page).locator('kbd').textContent()==='Enter');
  await page.keyboard.press('Enter');check('Keyboard activation still clocks in',await page.evaluate(()=>OneShift.app.places.current==='floor'));
  check('Activation dismisses the previous label',await tip(page).isHidden());
  await page.evaluate(()=>{OneShift.app.paused=true;OneShift.app.ui.update();});
  for(const [id,text]of [['office','Office'],['staging','Receiving'],['storage','Inventory'],['shipping','Shipping'],['clock','Time cards']])await hover(page,'#place-targets [data-place="'+id+'"]',text);
  await hover(page,'#place-targets [data-place="office"]','Office');await shot(page,'02-floor-office');await choose(page,'office');
  for(const [id,text]of [['purchases','Purchase orders'],['orders','Customer orders'],['equipment','Equipment catalog'],['ledger','Ledger'],['floor','Warehouse floor']])await hover(page,'#place-targets [data-place="'+id+'"]',text);
  await hover(page,'#place-targets [data-place="ledger"]','Ledger');await shot(page,'03-desk-ledger');await choose(page,'purchases');
  await hover(page,'[data-paper-action="quantity"][data-count="8"]','purchase draft');
  check('Office label belongs to the active modal and its top layer',await tip(page).evaluate(n=>n.parentElement.id==='shift-office-papers'&&n.matches(':popover-open')&&!n.closest('[inert]')));
  await shot(page,'04-paperwork');await page.locator('[data-paper-action="close"]').click();await choose(page,'orders');
  const disabled=page.locator('[data-paper-action="accept-order"]:disabled').first();
  if(await disabled.count()){await hover(page,'[data-paper-action="accept-order"]:disabled','Put away the required stock first.');check('Disabled action is labelled unavailable',await tip(page).textContent().then(t=>t.includes('Unavailable')));}
  await page.locator('[data-paper-action="close"]').click();await page.locator('#place-menu').click();
  await hover(page,'#shift-settings [data-setting="volume"]','Volume');
  check('Menu label is visible above the native dialog',await tip(page).evaluate(n=>n.parentElement.id==='shift-settings'&&n.matches(':popover-open')));
  await hover(page,'#shift-settings [data-action="load"][data-id="1"]','This save slot is empty.');await shot(page,'05-menu');
  await page.locator('[data-action="menu-close"]').click();await choose(page,'floor');await choose(page,'staging');
  await hover(page,'#shift-pause','Resume shift');
  await hover(page,'#scene-prev','There are no more areas');
  await page.evaluate(()=>{OneShift.app.paused=false;OneShift.app.ui.update();});
  await page.locator('[data-action="business-receiving"]').click();
  await page.waitForFunction(()=>OneShift.app.receiving.layout.length>0&&!OneShift.app.receiving.assetFailed);
  const p=await palletPoint(page,'receiving');await page.mouse.move(p.x,p.y);await tip(page).waitFor({state:'visible'});
  check('Canvas hover labels the actual alpha-tested pallet',await tip(page).textContent().then(t=>t.includes(p.name)&&t.includes('cases')));await shot(page,'06-trailer');
  await page.mouse.click(p.x,p.y);await hover(page,'#receiving-scan','Read this pallet label');
  await page.locator('#receiving-scan').click();await page.waitForFunction(()=>!OneShift.app.receiving.scanning&&OneShift.app.receiving.pallets.some(p=>p.canUnload));
  await hover(page,'#receiving-scan','Pull this checked pallet');
  await page.locator('#receiving-close').click();await page.locator('.scene-nav [data-place="floor"]').click();await choose(page,'storage');
  if(await page.locator('.inventory-aisle').count()){
    await hover(page,'.inventory-aisle[data-aisle="0"]','Aisle A');await shot(page,'07-inventory');
    const q=await point(page,'.inventory-aisle[data-aisle="0"]');await page.mouse.click(q.x,q.y);
    await hover(page,'.inventory-slot[data-level="1"][data-side="0"]','Unlock upper storage');
  }
  await page.setViewportSize({width:667,height:375});await page.evaluate(()=>{document.documentElement.style.fontSize='20.8px';OneShift.app.ui.settings.scale=1.3;OneShift.app.ui.update();});
  await hover(page,'#shift-menu','Game menu');await shot(page,'08-narrow');
  await page.evaluate(()=>{OneShift.app.ui.settings.reducedMotion=true;});await hover(page,'#shift-menu','Game menu');
  check('Saved reduced-motion preference disables tooltip animation',await tip(page).evaluate(n=>getComputedStyle(n).animationName==='none'));
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));check('Inactivity clears visible labels',await tip(page).isHidden());
  const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(url);await ready(touch);
  await touch.locator('#place-card [data-place="punch"]').tap();check('Touch activates on the first tap without a sticky label',await touch.evaluate(()=>OneShift.app.places.current==='floor')&&await tip(touch).isHidden());
  const q=await point(touch,'#place-targets [data-place="office"]');await touch.touchscreen.tap(q.x,q.y);check('Touch room targets retain direct navigation',await touch.evaluate(()=>OneShift.app.places.current==='office')&&await tip(touch).isHidden());
  await touch.setViewportSize({width:390,height:844});await touch.locator('#shift-rotate').waitFor({state:'visible'});check('Portrait keeps the orientation gate and no hover label',await tip(touch).isHidden());
  await mobile.close();check('No browser exceptions',errors.length===0);console.log(checks+' tooltip browser checks passed. Screenshots: '+dump);
})().catch(async error=>{console.error(error);console.error(errors);if(page)await shot(page,'failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
