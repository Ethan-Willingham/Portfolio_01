'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const dump=process.env.SHIFT_DUMP||path.join(os.tmpdir(),'one-shift-receiving');
fs.mkdirSync(dump,{recursive:true});
let browser,server,checks=0;
const check=(name,ok=true)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const shot=(page,name)=>page.screenshot({path:path.join(dump,name+'.png')});
const remaining=page=>page.evaluate(()=>OneShift.app.sim.receivingLoads().find(t=>t.id===OneShift.app.receiving.truckId).remaining);
const headerFits=page=>page.evaluate(()=>{
  const hud=document.querySelector('.shift-hud').getBoundingClientRect(),view=document.getElementById('shift-scenes').getBoundingClientRect();
  const controls=[...document.querySelectorAll('.shift-hud button')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());
  return controls.every((a,i)=>a.width>=44&&a.height>=44&&a.left>=hud.left-1&&a.right<=hud.right+1&&a.top>=hud.top-1&&a.bottom<=hud.bottom+1&&controls.slice(i+1).every(b=>a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1))&&hud.bottom<=view.top+1;
});
async function boot(page,url){
  await page.goto(url);await page.waitForFunction(()=>window.OneShift?.app?.receiving?.images.size===6);
  await page.evaluate(()=>document.fonts.ready);await page.bringToFront();
}
async function point(page){return page.evaluate(()=>{
  const v=OneShift.app.receiving,q=v.layout.find(q=>q.p.canScan),r=v.canvas.getBoundingClientRect();
  if(!q)throw Error('No reachable pallet');
  return {id:q.p.id,x:r.x+v.ox+(q.x+q.w*.5)*v.scale,y:r.y+v.oy+(q.y+q.h*.68)*v.scale};
});}
async function select(page,touch=false){const p=await point(page);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await page.locator('#receiving-label').waitFor({state:'visible'});return p;}
async function scan(page,touch=false){const n=await remaining(page);if(touch)await page.locator('#receiving-scan').tap();else await page.locator('#receiving-scan').click();await page.waitForFunction(n=>OneShift.app.sim.receivingLoads().find(t=>t.id===OneShift.app.receiving.truckId).remaining===n-1,n);await page.waitForFunction(()=>!OneShift.app.receiving.departing);}
(async()=>{
  let url=process.env.SHIFT_URL;
  if(!url){server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port+'/one-shift-classic.html';}
  browser=await chromium.launch({headless:true,...(process.env.SHIFT_CHROME?{executablePath:process.env.SHIFT_CHROME}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await boot(page,url);
  check('Public game opens on six real starting pallets',await remaining(page)===6);
  check('Opening conserves 104 cases and $200',await page.evaluate(()=>{const s=OneShift.app.sim.s;return s.pallets.reduce((n,p)=>n+p.cases,0)===104&&s.cash===20000&&s.journal.length===0;}));
  await page.locator('#receiving-close').click();await page.waitForTimeout(180);
  check('Opening warehouse header fits with Receive stock visible',await headerFits(page));
  await page.locator('#shift-receiving-open').click();
  await shot(page,'01-opening');
  const first=await point(page);await page.mouse.move(first.x,first.y);
  check('Native hover finds the pallet silhouette',await page.evaluate(id=>OneShift.app.receiving.hover===id,first.id));
  await shot(page,'02-hover');
  await select(page);await shot(page,'03-selected');
  check('Selected cargo has actual lot, count and barcode',await page.locator('#receiving-lot').innerText()==='L001'&&await page.locator('#receiving-cases').innerText()==='24');
  const beforeTick=await page.evaluate(()=>OneShift.app.sim.s.tick);
  await page.locator('#receiving-scan').click();await page.locator('#receiving-pause').click();
  const scanTime=await page.evaluate(()=>OneShift.app.receiving.scanning?.time);
  await page.waitForTimeout(850);
  check('Manual pause freezes a scan',await remaining(page)===6&&await page.evaluate(()=>OneShift.app.receiving.scanning?.time)===scanTime);
  await page.locator('#receiving-pause').click();await page.waitForFunction(()=>OneShift.app.sim.receivingLoads()[0].remaining===5);await page.waitForFunction(()=>!OneShift.app.receiving.departing);
  check('Scan accepts once and removes only that sprite',await page.locator('.receiving-target').count()===5&&await page.evaluate(()=>OneShift.app.sim.s.trucks[0].receipt.length===1));
  await shot(page,'04-one-received');
  await page.locator('.receiving-target[aria-disabled="false"]').first().focus();await page.keyboard.press('Enter');
  check('Keyboard selects the next pallet',await page.locator('#receiving-label').isVisible());
  await page.keyboard.press('Enter');await page.waitForFunction(()=>OneShift.app.sim.receivingLoads()[0].remaining===4);await page.waitForFunction(()=>!OneShift.app.receiving.departing);
  check('Scene holds the business clock during receiving',await page.evaluate(()=>OneShift.app.sim.s.tick)===beforeTick);
  await page.locator('#receiving-close').click();await page.locator('#shift-menu').click();
  await page.locator('[data-action="save"][data-id="1"]').click();
  await page.locator('[data-action="load"][data-id="1"]').click();
  await page.locator('#shift-receiving-open').click();
  check('Explicit save/load keeps accepted pallets removed',await remaining(page)===4&&await page.locator('.receiving-target').count()===4);
  let index=2;while(await remaining(page)){await select(page);await scan(page);await shot(page,'05-received-'+(++index));}
  check('Last scan exposes the empty trailer and completion',await page.locator('.receiving-target').count()===0&&await page.locator('#receiving-complete').isVisible());
  check('Scan completion distinguishes acceptance from physical unloading',await page.locator('#receiving-complete').innerText().then(t=>/Labels checked/.test(t)&&/unload and put away/.test(t)));
  await page.locator('#receiving-finish').click();
  const physical=await page.evaluate(()=>{
    const a=OneShift.app,s=a.sim;__oneShift.stop();
    const staged=new Set(),premature=[];
    for(let i=0;i<15000&&!s.s.pallets.every(p=>p.place==='storage');i++){
      s.tick(!a.ui.guideActive());
      for(const p of s.s.pallets){
        if(p.place==='lane'&&p.receivingDestination)staged.add(p.id);
        if(p.receivingDestination&&s.businessAvailable(p.item).some(q=>q.id===p.id))premature.push(p.id);
      }
    }
    a.ui.update();a.renderer.draw(s.s,a.ui);OneShift.saves.validate(s.s);
    return {stored:s.s.pallets.filter(p=>p.place==='storage').length,cases:s.s.pallets.reduce((n,p)=>n+p.cases,0),r:s.reconcile(),staged:staged.size,premature};
  });
  check('Received loads physically reach racks without inventory duplication',physical.stored===6&&physical.cases===104&&physical.r.expected===physical.r.accounted);
  check('Each accepted pallet passes through Receiving before becoming available',physical.staged===6&&physical.premature.length===0);
  await shot(page,'06-warehouse');
  await page.locator('[data-action="business-fulfill"]').first().click();
  const sale=await page.evaluate(()=>{const a=OneShift.app;for(let i=0;i<15000&&!a.sim.s.commerce.completed;i++)a.sim.tick();a.ui.update();a.renderer.draw(a.sim.s,a.ui);OneShift.saves.validate(a.sim.s);return a.sim.s.commerce.completed;});
  check('Existing selling loop still completes after receiving',sale===1);
  await page.locator('[data-action="business-need-stock"]').first().click();
  await page.locator('[data-stock="lantern"] [data-action="business-restock"]').click();
  await page.evaluate(()=>{const a=OneShift.app;for(let i=0;i<15000&&!a.sim.receivingLoads().some(t=>!t.opening&&t.status==='docked');i++)a.sim.tick();a.ui.update();__oneShift.resume();});
  check('Established header fits with an arriving supplier and Store visible',await headerFits(page));
  await page.locator('#shift-receiving-open').click();
  check('Paid replenishment uses actual incoming manifest',await page.evaluate(()=>{const v=OneShift.app.receiving;return !v.load.opening&&v.load.total===1&&v.load.cases===16;}));
  await shot(page,'07-supplier-load');await select(page);await scan(page);await page.locator('#receiving-finish').click();
  check('No browser exceptions in full receive, save, sell, replenish loop',errors.length===0);
  const mobileContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await boot(mobile,url);
  await mobile.locator('#receiving-close').tap();await mobile.waitForTimeout(180);
  check('Landscape warehouse header fits with Receive stock visible',await headerFits(mobile));
  await mobile.locator('#shift-receiving-open').tap();
  await select(mobile,true);await shot(mobile,'08-landscape-selected');
  check('Landscape touch targets fit at 44px',await mobile.evaluate(()=>['scan','deselect','pause','close'].every(id=>{const r=document.getElementById('receiving-'+id).getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight;})));
  await scan(mobile,true);check('Native touch receives a single pallet',await remaining(mobile)===5);
  await mobile.locator('#receiving-pause').tap();await mobile.locator('#receiving-pause').focus();await mobile.setViewportSize({width:390,height:844});
  await mobile.waitForFunction(()=>OneShift.app.rotated);const rotatedTick=await mobile.evaluate(()=>OneShift.app.sim.s.tick);
  await mobile.keyboard.press('Enter');await mobile.waitForTimeout(250);
  check('Portrait blocks native activation and preserves manual pause',await mobile.evaluate(tick=>OneShift.app.paused&&OneShift.app.sim.s.tick===tick,rotatedTick));await shot(mobile,'09-portrait-gate');
  await mobile.setViewportSize({width:667,height:375});await mobile.waitForFunction(()=>!OneShift.app.rotated);
  check('Returning to landscape does not resume deliberate pause',await mobile.evaluate(()=>OneShift.app.paused));await mobile.locator('#receiving-pause').tap();
  await select(mobile,true);await shot(mobile,'10-small-landscape');
  await mobile.evaluate(()=>{OneShift.app.ui.settings.scale=1.3;document.documentElement.style.fontSize='20.8px';});
  await shot(mobile,'11-large-text');
  check('Large-text scan stays on screen',await mobile.locator('#receiving-scan').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}));
  const narrow=await context.newPage();await narrow.setViewportSize({width:560,height:850});await boot(narrow,url);await select(narrow);await shot(narrow,'12-narrow-desktop');
  check('Tall desktop keeps active gameplay',await narrow.evaluate(()=>!OneShift.app.rotated&&OneShift.app.receiving.visible));
  await page.bringToFront();await page.locator('#shift-menu').click();
  await page.locator('#shift-settings summary').filter({hasText:/^More$/}).click();
  await page.locator('[data-action="new"][data-id="business"]').click();
  check('Menu New game returns to the same real scan-first opening',await page.evaluate(()=>OneShift.app.receiving.visible&&OneShift.app.sim.receivingLoads()[0].remaining===6&&OneShift.app.sim.businessStock('lantern').free===0));
  check('All browser checks finish without exceptions',errors.length===0);
  console.log(checks+' receiving browser checks passed. Screenshots: '+dump);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server?server.close(r):r());});
