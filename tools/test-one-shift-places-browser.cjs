'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.SHIFT_DUMP || path.join(require('node:os').tmpdir(), 'one-shift-places');
fs.mkdirSync(dump, {recursive:true});
let server, browser, checks = 0;
const errors = [];
const check = (name, result) => { assert.ok(result, name); checks++; console.log('PASS '+name); };
const shot = (page, name) => page.screenshot({path:path.join(dump,name+'.png')});
const snapshot = page => page.evaluate(() => JSON.stringify(OneShift.app.sim.snapshot()));
const stock = page => page.evaluate(() => JSON.stringify({pallets:OneShift.app.sim.s.pallets,hands:OneShift.app.sim.s.commerce.hands,goods:OneShift.app.sim.s.goods,cash:OneShift.app.sim.s.cash}));
const target = (page, name) => page.locator('#place-targets [data-place="'+name+'"]');
const paper = (page, name) => page.locator('#shift-office-papers [data-paper-action="'+name+'"]');

async function boot(page, url) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => OneShift.app?.places && OneShift.app.office && document.getElementById('place-image').complete && document.getElementById('place-image').naturalWidth > 0);
  await page.bringToFront();
  await page.evaluate(() => document.fonts.ready);
}

async function inPlace(page, name) {
  await page.waitForFunction(name => OneShift.app.places.current === name, name);
  await page.waitForFunction(() => document.getElementById('place-image').complete && document.getElementById('place-image').naturalWidth > 0);
}

(async () => {
  let url = process.env.SHIFT_URL;
  if (!url) {
    server = http.createServer((request, response) => {
      const file = path.resolve(root, '.'+new URL(request.url, 'http://local').pathname);
      if (!file.startsWith(root+path.sep)) { response.writeHead(403).end(); return; }
      fs.readFile(file, (error, data) => {
        if (error) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream');
        response.end(data);
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = 'http://127.0.0.1:'+server.address().port+'/one-shift.html';
  }
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  const page = await context.newPage();
  await boot(page, url);
  const opening = await snapshot(page);
  await page.waitForTimeout(300);
  check('Opening time-card station holds the exact warehouse state', await snapshot(page) === opening && await page.evaluate(() => !OneShift.app.places.clockedIn));
  check('Unclocked station has no active floor doorway', await target(page,'floor').count() === 0);
  await shot(page,'01-clock-station');

  const startingStock = await stock(page);
  await page.locator('#place-card [data-place="punch"]').click();
  await inPlace(page, 'floor');
  check('Punching in opens the central floor', await page.evaluate(() => OneShift.app.places.clockedIn) && await target(page,'office').isVisible());
  check('Central floor has all five real destinations', await target(page,'office').count() === 1 && await target(page,'staging').count() === 1 && await target(page,'storage').count() === 1 && await target(page,'shipping').count() === 1 && await target(page,'clock').count() === 1);
  await shot(page,'02-central-floor');
  await target(page,'office').click();
  await inPlace(page,'office');
  await target(page,'floor').click();
  await inPlace(page,'floor');
  check('Office doorway round-trip never handles or duplicates freight', await stock(page) === startingStock);
  await target(page,'office').click();
  await inPlace(page,'office');
  const deskState = await snapshot(page);
  await page.waitForTimeout(350);
  check('Seated office freezes the world clock and handling', await snapshot(page) === deskState);
  check('Office room tone remains active while paperwork pauses the world', await page.evaluate(() => OneShift.app.audio.context?.state === 'running' && OneShift.app.audio.active && OneShift.app.audio.place === 'office'));
  await shot(page,'03-seated-office');

  for (const [kind, title] of [['purchases','Purchase orders'],['orders','Customer orders'],['equipment','Equipment catalog'],['ledger','Warehouse ledger']]) {
    await target(page,kind).focus();
    await page.keyboard.press('Enter');
    check(kind+' desk object opens its own document', await page.locator('#shift-office-papers').isVisible() && await page.locator('#office-paper-title').textContent() === title);
    await page.keyboard.press('Shift+Tab');
    check(kind+' document traps keyboard focus inside the paper', await page.evaluate(() => !!document.activeElement.closest('#shift-office-papers')));
    await page.keyboard.press('Escape');
    check(kind+' Escape returns focus to the same desk object', !await page.locator('#shift-office-papers').isVisible() && await target(page,kind).evaluate(node => document.activeElement === node));
  }

  await target(page,'purchases').click();
  await page.locator('#office-purchase-product').selectOption('lantern');
  await page.locator('[data-paper-action="quantity"][data-count="8"]').click();
  const beforePO = await page.evaluate(() => {
    const a=OneShift.app, s=a.sim.s;
    return {cash:s.cash, credit:s.credit, count:s.commerce.purchases.length, cases:a.sim.reconcile().onHand, quote:a.sim.restockQuote('lantern',8), journal:s.journal.length};
  });
  await paper(page,'review-purchase').click();
  check('Reviewing a purchase draft does not spend cash or create stock', await page.evaluate(before => {
    const a=OneShift.app,s=a.sim.s;
    return s.cash===before.cash && s.credit===before.credit && s.commerce.purchases.length===before.count && a.sim.reconcile().onHand===before.cases;
  }, beforePO));
  await shot(page,'04-purchase-review');
  await paper(page,'place-purchase').dblclick();
  check('Native double-click places one eight-case supplier order', await page.evaluate(before => {
    const a=OneShift.app,s=a.sim.s,p=s.commerce.purchases.at(-1);
    return s.commerce.purchases.length===before.count+1 && p.item==='lantern' && p.count===8 && p.cost===before.quote.cost && s.cash===before.cash-before.quote.cost+before.quote.credit && s.credit===before.credit+before.quote.credit;
  }, beforePO));
  check('Purchased cases are real trailer freight awaiting player receiving', await page.evaluate(before => {
    const a=OneShift.app,p=a.sim.s.commerce.purchases.at(-1);
    return p.pallets.reduce((sum,id)=>sum+a.sim.p.get(id).cases,0)===8 && p.pallets.every(id=>a.sim.p.get(id).place==='trailer') && a.sim.reconcile().onHand===before.cases+8;
  }, beforePO));
  check('Purchase receipt removes the confirmation action', await paper(page,'place-purchase').count() === 0 && await page.locator('.office-purchase-receipt').isVisible());
  await shot(page,'05-purchase-receipt');
  await paper(page,'close').click();

  // Use native pause to make exact state comparisons independent of animation timing.
  await page.locator('#shift-place').focus();
  await page.keyboard.press(' ');
  check('Player can pause while seated at the desk', await page.evaluate(() => OneShift.app.paused));
  const pausedState = await snapshot(page);
  await target(page,'floor').click();
  await target(page,'office').click();
  await target(page,'ledger').click();
  await paper(page,'close').click();
  await target(page,'floor').click();
  await target(page,'clock').click();
  check('Manual pause survives room navigation and document close', await page.evaluate(() => OneShift.app.paused) && await snapshot(page) === pausedState);
  await page.locator('#place-card [data-place="punch"]').click();
  check('Clocking out saves the exact current business', await page.evaluate(state => !OneShift.app.places.clockedIn && JSON.stringify(OneShift.saves.load()) === state, pausedState));
  await page.waitForTimeout(200);
  check('Clocked-out state does not advance', await snapshot(page) === pausedState);
  await shot(page,'06-clocked-out');
  await page.locator('#place-card [data-place="punch"]').click();
  check('Clocking back in preserves stock, purchases, ledger and manual pause', await page.evaluate(() => OneShift.app.paused && OneShift.app.places.current==='floor') && await snapshot(page) === pausedState);
  await target(page,'clock').click();
  await page.locator('#place-card [data-place="punch"]').click();
  const savedText = await page.evaluate(() => localStorage.getItem('one-shift-save-auto'));
  await page.reload();
  await page.waitForFunction(() => OneShift.app?.places?.saved);
  check('Reload offers the saved shift from the time-card station', await page.evaluate(() => OneShift.app.places.current==='clock' && !OneShift.app.places.started && !!OneShift.app.places.saved));
  await page.reload();
  await page.waitForFunction(() => OneShift.app?.places?.saved);
  check('Leaving an unclocked reload cannot overwrite the existing autosave', await page.evaluate(() => localStorage.getItem('one-shift-save-auto')) === savedText);
  // Stop only frame advancement so the native punch can be compared byte for byte.
  await page.evaluate(() => __oneShift.stop());
  await page.locator('#place-card [data-place="punch"]').click();
  check('Reloaded clock-in restores the exact saved simulation', await snapshot(page) === pausedState);

  await page.locator('#place-menu').click();
  await page.locator('#shift-import').setInputFiles({name:'one-shift-place-save.json',mimeType:'application/json',buffer:Buffer.from(savedText)});
  await page.waitForFunction(() => !OneShift.app.menuPause);
  check('Imported save reconnects to the building with exact stock and ledger', await page.evaluate(() => OneShift.app.places.current==='floor' && OneShift.app.places.clockedIn) && await snapshot(page) === pausedState);

  await page.evaluate(() => {
    __oneShift.newGame(17,'business');
    const a=OneShift.app;
    a.paused=false;
    a.sim.s.commerce.firstDecision=false;
    a.sim.s.minute=a.sim.s.shiftEnd-.01;
    a.places.go('floor');
    __oneShift.resume();
  });
  await page.waitForFunction(() => OneShift.app.sim.s.phase==='evening' && OneShift.app.places.current==='clock');
  check('End of shift opens the clock station without recursive rendering', await page.evaluate(() => OneShift.app.sim.s.day===1 && OneShift.app.ui.lastPhase==='evening' && OneShift.app.sim.s.reports.length===1));
  await page.locator('#place-card [data-place="punch"]').click();
  check('Evening punch-out keeps the completed day closed', await page.evaluate(() => !OneShift.app.places.clockedIn && OneShift.app.sim.s.day===1 && OneShift.app.sim.s.phase==='evening'));
  await page.locator('#place-card [data-place="punch"]').click();
  check('Next clock-in advances exactly one day', await page.evaluate(() => OneShift.app.places.clockedIn && OneShift.app.places.current==='floor' && OneShift.app.sim.s.day===2 && OneShift.app.sim.s.phase==='shift' && OneShift.app.sim.s.reports.length===1));
  await page.waitForTimeout(250);
  check('The new shift remains day two without a second advance', await page.evaluate(() => OneShift.app.sim.s.day===2));

  const olderText=await page.evaluate(()=>{
    const older=new OneShift.Sim(1,'normal').s;
    OneShift.saves.validate(older);
    OneShift.saves.save(older);
    OneShift.saves.save(older,1);
    OneShift.app.places.started=false;
    return localStorage.getItem('one-shift-save-auto');
  });
  await page.reload();
  await page.waitForFunction(()=>OneShift.app?.places?.legacySaved);
  check('Older autosave stays untouched while the clock offers a new warehouse',await page.locator('#place-card [data-place="punch"]').textContent()==='Start new warehouse'&&await page.evaluate(()=>localStorage.getItem('one-shift-save-auto'))===olderText);
  const olderState=await page.evaluate(()=>JSON.stringify(OneShift.saves.load()));
  await page.evaluate(()=>{window.testOriginalSave=OneShift.saves.save;OneShift.saves.save=function(state,slot){return slot==='legacy'?false:window.testOriginalSave.call(this,state,slot);};});
  await page.locator('#place-card [data-place="punch"]').click();
  await page.waitForTimeout(250);
  check('Failed legacy backup keeps the old save and reports the failure',await page.evaluate(()=>!OneShift.app.places.clockedIn&&!!OneShift.app.places.legacySaved)&&await page.locator('#place-note').textContent().then(text=>text.includes('could not be backed up'))&&await page.evaluate(()=>localStorage.getItem('one-shift-save-auto'))===olderText);
  await page.evaluate(()=>{OneShift.saves.save=window.testOriginalSave;});
  await page.locator('#place-card [data-place="punch"]').click();
  check('Starting the new warehouse retains an exact exportable legacy backup',await page.evaluate(older=>JSON.stringify(OneShift.saves.load('legacy'))===older&&OneShift.business(OneShift.app.sim.s)&&OneShift.app.sim.s.commerce.manualHandling&&OneShift.app.places.current==='floor',olderState));
  await page.locator('#place-menu').click();
  const beforeRejection=await snapshot(page);
  await page.locator('[data-action="load"][data-id="1"]').click();
  check('Loading an older named slot is rejected before changing the live business',await snapshot(page)===beforeRejection&&await page.locator('#shift-settings').isVisible()&&await page.locator('#shift-settings').innerText().then(text=>text.includes('older service-mode save')));
  await page.locator('#shift-import').setInputFiles({name:'older-service-save.json',mimeType:'application/json',buffer:Buffer.from(olderText)});
  await page.waitForTimeout(200);
  check('Importing an older JSON save is rejected with a visible explanation',await snapshot(page)===beforeRejection&&await page.locator('#shift-settings').isVisible()&&await page.locator('#shift-settings').innerText().then(text=>text.includes('older service-mode save')));
  await page.locator('[data-action="menu-close"]').click();
  await target(page,'clock').click();
  await page.evaluate(()=>{window.testOriginalSave=OneShift.saves.save;OneShift.saves.save=()=>false;});
  await page.locator('#place-card [data-place="punch"]').click();
  await page.waitForTimeout(350);
  check('A failed clock-out save keeps a persistent storage warning',await page.evaluate(()=>!OneShift.app.places.clockedIn)&&await page.locator('#place-note').textContent().then(text=>text.includes('storage is unavailable')));
  await page.evaluate(()=>{OneShift.saves.save=window.testOriginalSave;});
  await context.close();

  for (const [name,width,height,scale] of [['landscape',844,390,1],['small-large',667,375,1.3]]) {
    const mobile=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const p=await mobile.newPage();
    await boot(p,url);
    await p.evaluate(scale=>{document.documentElement.style.fontSize=scale*16+'px';OneShift.app.places.resize();},scale);
    check(name+' clock punch is at least 44 pixels tall', await p.locator('#place-card [data-place="punch"]').evaluate(node=>node.getBoundingClientRect().height>=44));
    await p.locator('#place-card [data-place="punch"]').tap();
    for (const place of ['floor','office']) {
      if(place==='office')await target(p,'office').tap();
      await inPlace(p,place);
      const bounds=await p.locator('.place-target').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {id:node.dataset.place,w:r.width,h:r.height,fit:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};}));
      check(name+' '+place+' hotspots fit the viewport with 44px targets',bounds.length>0&&bounds.every(box=>box.w>=44&&box.h>=44&&box.fit));
      await shot(p,'07-'+name+'-'+place);
    }
    await target(p,'purchases').tap();
    check(name+' office paperwork is visible and has a 44px close control',await paper(p,'close').isVisible()&&await paper(p,'close').evaluate(node=>node.getBoundingClientRect().height>=44));
    await shot(p,'08-'+name+'-paper');
    await paper(p,'close').tap();
    const mobileState=await snapshot(p);
    await p.setViewportSize({width:375,height:667});
    await p.waitForTimeout(250);
    check(name+' portrait freezes the office and shows the rotation gate',await p.locator('#shift-rotate').isVisible()&&await snapshot(p)===mobileState);
    await mobile.close();
  }
  check('Places, paperwork, saves and shift transition have no browser errors',errors.length===0);
  console.log(checks+' places browser checks passed. Screenshots '+dump);
})().catch(error=>{console.error(error);if(errors.length)console.error(errors);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
