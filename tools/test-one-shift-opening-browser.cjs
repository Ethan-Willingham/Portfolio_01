'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const dump = process.env.SHIFT_DUMP || '/Users/ethan/Portfolio_01/research/one-shift/evidence-closer/opening';
fs.mkdirSync(dump, {recursive:true});
const checks = [], errors = [], layouts = [], stages = [];
const check = (name, result) => {
  assert.ok(result, name);
  checks.push(name);
  console.log('PASS ' + name);
};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
let browser;

async function boot(page, url) {
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__oneShift);
  await page.evaluate(async () => {
    await document.fonts.ready;
    __oneShift.stop();
    OneShift.app.ui.update();
    OneShift.app.renderer.home(OneShift.app.sim.s);
    __oneShift.draw();
  });
}

async function openingLayout(page, label) {
  const layout = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height};
    };
    const r = OneShift.app.renderer, s = OneShift.app.sim.s, b = s.map.building;
    const floorA = r.screen(b.x - .24, b.y - .24), floorB = r.screen(b.x + b.w + .24, b.y + b.h + .24);
    const door = s.map.doors[0], dockA = r.screen(door.x, door.y), dockB = r.screen(door.x + 1.5, door.y + 2);
    const stock=s.map.racks.filter(q=>s.pallets.some(p=>p.place==='storage'&&p.cases>0&&p.y===q.y&&p.x>=q.x&&p.x<q.x+2)).map(q=>({a:r.screen(q.x-.1,q.y-.1),b:r.screen(q.x+2.1,q.y+1.1)}));
    const lanes=['receiving','shipping'].map(kind=>{const q=OneShift.docks.lane(s,kind);return {kind,a:r.screen(q.x,q.y),b:r.screen(q.x+q.w,q.y+q.h)};});
    const worker=s.workers[0],workerA=r.screen(worker.x,worker.y),workerB=r.screen(worker.x+1,worker.y+1),view=rect('#shift-view');
    const texts=[],g=r.g,fill=g.fillText;
    g.fillText=function(text,x,y,...rest){texts.push({text,x,y,width:this.measureText(text).width});return fill.call(this,text,x,y,...rest);};
    try{__oneShift.draw();}finally{g.fillText=fill;}
    const stockLabels=texts.filter(q=>/^(Stoves?\b|Lanterns?\b|Chairs?\b)/i.test(q.text));
    return {
      viewport:{width:innerWidth, height:innerHeight}, brand:rect('.shift-brand h1'), hud:rect('.shift-hud'),
      view, board:rect('#shift-queue'), card:rect('.shift-opening-card'),
      action:rect('.shift-opening-card [data-action="business-fulfill"]'), floorA, floorB, dockA, dockB,
      stock,lanes,workerA,workerB,stockLabels,roadLeft:r.screen(b.x+b.w+14,b.y).x,
      formerWideZoom:Math.min(64,view.width/(b.w+9),view.height/(b.h+1.2)),
      zoom:r.camera.zoom, words:document.querySelector('#shift-queue').innerText.trim().split(/\s+/).length,
      pointer:getComputedStyle(document.querySelector('#shift-view')).pointerEvents,
      pageOverflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
    };
  });
  layouts.push({label, ...layout});
  const {viewport:v, brand, hud, view, board, action, dockA:da, dockB:dz} = layout;
  const inside=(a,z)=>a.x>=view.left-1&&a.y>=view.top-1&&z.x<=view.right+1&&z.y<=view.bottom+1;
  check(label + ': title belongs to the visible top game header', brand.height >= 20 && brand.top >= 0 && brand.bottom <= hud.bottom && brand.top < v.height / 3);
  check(label + ': scene bounds and order card do not overlap', view.right <= board.left && view.top >= hud.bottom && view.bottom <= v.height && !layout.pageOverflow && layout.pointer === 'none');
  check(label + ': close framing shows stocked racks, the worker and both working lanes',layout.stock.length===3&&layout.stock.every(q=>inside(q.a,q.b))&&layout.lanes.every(q=>inside(q.a,q.b))&&inside(layout.workerA,layout.workerB));
  check(label + ': the rear dock stays visible while the road is outside the play area',inside(da,dz)&&layout.roadLeft>view.right);
  check(label + ': stock has larger detail than the former whole-warehouse view',layout.zoom>=layout.formerWideZoom*1.2&&layout.stockLabels.length===3&&layout.stockLabels.every(q=>q.x-q.width/2>=view.left&&q.x+q.width/2<=view.right&&q.y>=view.top+7&&q.y<=view.bottom-7));
  check(label + ': one clear first action is visible without scrolling', action.width >= 44 && action.height >= 44 && action.left >= board.left && action.right <= board.right && action.top >= board.top && action.bottom <= Math.min(board.bottom, v.height) && layout.words <= 35);
  check(label + ': Store and planning tabs wait until the first paid sale', await page.locator('#shift-store').isHidden() && await page.locator('.shift-business-tabs').isHidden() && await page.locator('[data-action="queue-toggle"]').isHidden() && await page.locator('[data-action="business-fulfill"]').count() === 1 && await page.locator('body.shift-opening').count() === 1);
  await page.screenshot({path:path.join(dump, label + '.png')});
}

async function advanceSale(page) {
  const result = await page.evaluate(() => {
    const app = OneShift.app, sim = app.sim, order = sim.s.commerce.orders.find(o => o.status === 'queued'), seen = new Set(), samples = [];
    for (let n = 0; n < 6000 && !sim.s.commerce.completed; n++) {
      sim.tick();
      app.ui.update();
      const task = sim.s.workers.find(w => w.task?.businessOrder === order.id)?.task;
      const truck = sim.t.get(order.truck), normal=document.querySelector('.shift-order-card[data-order="'+order.id+'"] .shift-order-progress'), progressEl=normal?.querySelector('progress');
      const status = document.querySelector('.shift-opening-status')?.textContent.trim() || normal?.querySelector('span')?.textContent.trim() || '';
      const progress=progressEl?{value:progressEl.value,max:progressEl.max}:null;
      const steps = [...document.querySelectorAll('.shift-opening-card li[data-state]')].map(el => ({stage:el.dataset.stage || el.textContent.trim().toLowerCase(), state:el.dataset.state}));
      const key = [task?.kind || 'gap', task?.phase || '', truck?.status || '', status, steps.map(s=>s.state).join('/'),progress?.value??''].join('|');
      if (!seen.has(key)) {
        seen.add(key);
        const r=app.renderer,g=r.g,fill=g.fillText,truckLabels=[];
        g.fillText=function(text,x,y,...rest){if(/^(INBOUND|OUTBOUND|\d+ MIN)$/.test(text)){const m=this.measureText(text);truckLabels.push({text,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});}return fill.call(this,text,x,y,...rest);};
        try{__oneShift.draw();}finally{g.fillText=fill;}
        const v=document.getElementById('shift-view').getBoundingClientRect(),pose=truck&&r.truckGeometry(sim.s,truck),a=pose&&r.screen(pose.x,pose.y),b=pose&&r.screen(pose.x+1,pose.y+2),rearVisible=!!a&&a.x>=v.left&&a.y>=v.top&&b.x<=v.right&&b.y<=v.bottom;
        const labelsInside=truckLabels.every(q=>q.left>=v.left-1&&q.right<=v.right+1&&q.top>=v.top-1&&q.bottom<=v.bottom+1);
        samples.push({tick:sim.s.tick, task:task?.kind || null, phase:task?.phase || null, truck:truck?.status || null, loaded:truck?.loaded.reduce((n,l)=>n+l.cases,0) || 0, departure:!!truck?.departureRequested, status, steps, progress,rearVisible,truckLabels,labelsInside});
      }
    }
    OneShift.saves.validate(sim.s);
    app.ui.update();
    __oneShift.draw();
    return {completed:sim.s.commerce.completed, cash:sim.s.cash, balance:sim.reconcile(), samples};
  });
  stages.push(...result.samples);
  return result;
}

(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = process.env.SHIFT_URL || 'http://127.0.0.1:' + server.address().port + '/one-shift.html';
    browser = await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing', headless:true});
    let desktop, phone;
    for (const [label, width, height, mobile] of [
      ['opening-laptop',1512,742,false], ['opening-desktop',1440,900,false],
      ['opening-ultrawide',2560,1080,false], ['opening-phone-large-text',667,375,true]
    ]) {
      const page = await browser.newPage({viewport:{width,height}, deviceScaleFactor:2, ...(mobile ? {isMobile:true,hasTouch:true} : {})});
      await boot(page,url);
      if (mobile) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '20.8px';
          OneShift.app.ui.update();
          OneShift.app.renderer.home(OneShift.app.sim.s);
          __oneShift.draw();
        });
        phone = page;
      }
      await openingLayout(page,label);
      if (label === 'opening-laptop') desktop = page;
      else if (!mobile) {
        await page.locator('[data-action="business-fulfill"]').click();
        const sale=await advanceSale(page);
        check(label+': the closer view completes a real sale with the loading rear visible',sale.completed===1&&sale.samples.some(s=>s.task==='load')&&sale.samples.filter(s=>s.truck==='docked').every(s=>s.rearVisible));
        await page.locator('[data-action="business-need-stock"]').click();
        await page.locator('#shift-queue [data-action="business-restock"][data-item="lantern"][data-count="16"]').click();
        await page.evaluate(()=>{const sim=OneShift.app.sim;for(let n=0;n<8000&&!sim.s.commerce.restocked;n++)sim.tick();OneShift.saves.validate(sim.s);OneShift.app.ui.update();__oneShift.draw();});
        check(label+': replenishment still lands in an actual rack',await page.evaluate(()=>OneShift.app.sim.s.commerce.restocked===1&&OneShift.app.sim.s.commerce.purchases[0].pallets.every(id=>OneShift.app.sim.p.get(id).place==='storage')));
        const before=await page.evaluate(()=>({...OneShift.app.renderer.camera})),at=await page.evaluate(()=>{const v=document.getElementById('shift-view').getBoundingClientRect();return {x:v.left+v.width/2,y:v.top+v.height/2};});
        await page.mouse.move(at.x,at.y);await page.mouse.down({button:'right'});await page.mouse.move(at.x+45,at.y+20,{steps:8});await page.mouse.up({button:'right'});
        check(label+': right-drag still pans from the closer crop',await page.evaluate(before=>OneShift.app.renderer.camera.x!==before.x&&OneShift.app.renderer.camera.zoom===before.zoom,before));
        await page.keyboard.press('h');await page.screenshot({path:path.join(dump,label+'-restocked.png')});
        await page.close();
      }
    }
    check('The first card names the item, reward and worker action in a short opening', await desktop.locator('.shift-opening-card h2').innerText().then(t => /8\s*lanterns/i.test(t)) && await desktop.locator('.shift-opening-card').innerText().then(t=>t.includes('$36') && /worker/i.test(t)));
    const minute = await desktop.evaluate(() => OneShift.app.sim.s.minute);
    await desktop.evaluate(() => __oneShift.resume());
    await desktop.waitForTimeout(350);
    await desktop.evaluate(() => __oneShift.stop());
    check('Opening animation runs while the first decision holds the clock', await desktop.evaluate(before=>OneShift.app.sim.s.minute === before && OneShift.app.sim.s.tick > 0,minute));
    const outside=await desktop.evaluate(()=>{
      const r=OneShift.app.renderer,s=OneShift.app.sim.s,p=s.pallets.find(p=>p.place==='storage'&&p.item==='stove'),v=document.getElementById('shift-view').getBoundingClientRect(),at=r.screen(p.x+.5,p.y+.5);
      return {id:p.id,at,targetX:v.left/2};
    });
    const panStart=await desktop.evaluate(()=>__oneShift.screen(12.5,13.5));
    await desktop.mouse.move(panStart.x,panStart.y);await desktop.mouse.down({button:'right'});
    await desktop.mouse.move(panStart.x+outside.targetX-outside.at.x,panStart.y,{steps:8});await desktop.mouse.up({button:'right'});
    const margin=await desktop.evaluate(id=>{__oneShift.draw();const p=OneShift.app.sim.p.get(id);return __oneShift.screen(p.x+.5,p.y+.5);},outside.id);
    await desktop.mouse.click(margin.x,margin.y);
    check('A cropped stock pallet cannot be selected through the slate margin',await desktop.evaluate(id=>!OneShift.app.ui.target&&OneShift.app.ui.selected.length===0&&!OneShift.app.renderer.hits.some(h=>h.kind==='pallet'&&h.id===id),outside.id));
    await desktop.locator('#shift-canvas').focus();await desktop.keyboard.press('Tab');
    check('Keyboard object cycling selects only visible scene objects',await desktop.evaluate(()=>{const hit=OneShift.app.ui.target,r=OneShift.app.renderer,v=document.getElementById('shift-view').getBoundingClientRect(),q=r.hits.find(q=>q.kind===hit?.kind&&q.id===hit?.id),a=q&&r.screen(q.x,q.y),b=q&&r.screen(q.x+q.w,q.y+q.h);return !!q&&b.x>v.left&&a.x<v.right&&b.y>v.top&&a.y<v.bottom;}));
    await desktop.keyboard.press('Escape');await desktop.keyboard.press('h');
    const idle = await desktop.evaluate(() => JSON.stringify(OneShift.app.sim.s.workers));
    const floor = await desktop.evaluate(() => __oneShift.screen(12.5,13.5));
    await desktop.mouse.click(floor.x,floor.y);
    check('The empty warehouse floor never asks the worker to walk', await desktop.evaluate(before=>JSON.stringify(OneShift.app.sim.s.workers) === before && !OneShift.app.ui.cursor,idle));
    const camera = await desktop.evaluate(() => ({...OneShift.app.renderer.camera}));
    await desktop.mouse.move(floor.x,floor.y);
    await desktop.mouse.down({button:'right'});
    await desktop.mouse.move(floor.x+50,floor.y+25,{steps:8});
    await desktop.mouse.up({button:'right'});
    check('Right-drag still moves the camera without adding a walking task', await desktop.evaluate(before=>OneShift.app.renderer.camera.x !== before.camera.x && JSON.stringify(OneShift.app.sim.s.workers) === before.idle,{camera,idle}));
    const manualCamera=await desktop.evaluate(()=>({...OneShift.app.renderer.camera}));
    await desktop.locator('[data-action="business-fulfill"]').focus();
    await desktop.keyboard.press('Enter');
    check('One native keyboard action starts the real first shipment', await desktop.evaluate(() => OneShift.app.sim.s.commerce.queue.length === 1 && !OneShift.app.sim.s.commerce.firstDecision));
    await desktop.evaluate(() => {for(let n=0;n<120;n++)OneShift.app.sim.tick();OneShift.app.ui.update();__oneShift.draw();});
    check('The first job outlines its actual source rack and labels the moving worker',await desktop.evaluate(()=>{
      const app=OneShift.app,s=app.sim.s,r=app.renderer,g=r.g,lines=[],words=[],stroke=g.strokeRect,fill=g.fillText;
      g.strokeRect=function(x,y,w,h){lines.push({x,y,w,h});return stroke.call(this,x,y,w,h);};
      g.fillText=function(text,x,y,...rest){words.push({text,x,y});return fill.call(this,text,x,y,...rest);};
      try{__oneShift.draw();}finally{g.strokeRect=stroke;g.fillText=fill;}
      const o=s.commerce.orders.find(o=>o.status==='queued'),p=app.sim.p.get(o.allocations[0].source),rack=s.map.racks.find(q=>q.y===p.y&&p.x>=q.x&&p.x<q.x+2),a=r.screen(rack.x,rack.y),b=r.screen(rack.x+2,rack.y+1),worker=s.workers.find(w=>w.task?.businessOrder===o.id)||s.workers[0],at=r.screen(worker.x+.5,worker.y-.25);
      return lines.some(q=>q.x<a.x&&q.y<a.y&&q.x+q.w>b.x&&q.y+q.h>b.y) && words.some(q=>q.text==='Worker'&&Math.abs(q.x-at.x)<1&&q.y<at.y&&q.y>at.y-20);
    }));
    await desktop.screenshot({path:path.join(dump,'opening-picking.png')});
    const sale = await advanceSale(desktop);
    check('Picking, packing and loading each have a truthful active stage', ['salePick','wrap','load'].every(kind=>sale.samples.some(s=>s.task===kind && s.steps.some(step=>step.state==='active' && step.stage.includes(({salePick:'pick',wrap:'pack',load:'ship'})[kind])))));
    const runningStages=sale.samples.filter(s=>s.steps.length);
    check('Shipment stages show one current step and never move backward', runningStages.every((s,i)=>s.steps.length===3 && s.steps.filter(step=>step.state==='active').length===1 && s.steps.every(step=>['waiting','active','done'].includes(step.state)) && (!i || s.steps.filter(step=>step.state==='done').length>=runningStages[i-1].steps.filter(step=>step.state==='done').length)));
    check('Arrival and worker gaps retain a meaningful shipping status', sale.samples.filter(s=>!s.task && s.truck && !s.departure).every(s=>s.status.length>0 && !/^queued$/i.test(s.status) && s.steps.some(step=>step.state==='active' && step.stage.includes('ship'))));
    check('First sale actually pays once and conserves its cases', sale.completed === 1 && sale.cash === 23550 && sale.balance.expected === sale.balance.accounted);
    check('The laptop loading rear remains visible without the truck front or road',sale.samples.some(s=>s.task==='load')&&sale.samples.filter(s=>s.truck==='docked').every(s=>s.rearVisible));
    check('Unlocking the full header after payment preserves a manually positioned camera',await desktop.evaluate(before=>['x','y','zoom'].every(k=>OneShift.app.renderer.camera[k]===before[k]),manualCamera));
    await desktop.keyboard.press('h');
    check('The receipt explains the earned reward and reveals normal planning', await desktop.locator('.shift-first-receipt').isVisible() && await desktop.locator('.shift-first-receipt').innerText().then(t=>t.includes('$36')) && await desktop.locator('[data-action="business-need-stock"]').isVisible() && await desktop.locator('#shift-store').isVisible() && await desktop.locator('.shift-business-tabs').isVisible() && await desktop.locator('body.shift-opening').count() === 0);
    check('First payment uses the receipt without a duplicate toast over the floor',await desktop.locator('#shift-toast').isHidden());
    await desktop.screenshot({path:path.join(dump,'opening-first-sale.png')});
    await desktop.locator('[data-action="business-need-stock"]').click();
    check('Buy stock names the visible board Stock',await desktop.locator('[data-action="queue-toggle"] strong').innerText().then(t=>t==='Stock'));
    await desktop.locator('#shift-queue [data-action="business-restock"][data-item="lantern"][data-count="16"]').click();
    check('Buy stock leads to a real paid 16-lantern supplier order', await desktop.evaluate(()=>OneShift.app.sim.s.commerce.purchases.length===1 && OneShift.app.sim.businessStock('lantern').incoming===16));
    await desktop.screenshot({path:path.join(dump,'opening-restock.png')});
    await desktop.evaluate(() => {
      const sim=OneShift.app.sim;
      for(let n=0;n<8000 && !sim.s.commerce.restocked;n++)sim.tick();
      OneShift.saves.validate(sim.s);OneShift.app.ui.update();__oneShift.draw();
    });
    check('Restocking finishes with physical paid stock in racks', await desktop.evaluate(()=>{const s=OneShift.app.sim.s;return s.commerce.restocked===1 && s.commerce.purchases[0].pallets.every(id=>OneShift.app.sim.p.get(id).place==='storage');}));
    await desktop.locator('[data-action="business-tab"][data-id="work"]').click();
    check('The Worker tab names its visible board Worker',await desktop.locator('[data-action="queue-toggle"] strong').innerText().then(t=>t==='Worker'));
    await desktop.locator('[data-action="business-tab"][data-id="orders"]').click();
    check('Returning to customers names the visible board Orders',await desktop.locator('[data-action="queue-toggle"] strong').innerText().then(t=>t==='Orders'));
    await desktop.locator('#shift-menu').click();
    await desktop.locator('[data-action="save"][data-id="1"]').click();
    await desktop.locator('[data-action="menu-close"]').click();
    await desktop.reload();
    await desktop.waitForFunction(() => !!window.__oneShift);
    await desktop.evaluate(() => __oneShift.stop());
    check('Reload restarts the first customer with fresh cash and hidden advanced controls', await desktop.evaluate(()=>OneShift.app.sim.s.commerce.completed===0 && OneShift.app.sim.s.cash===20000) && await desktop.locator('body.shift-opening').count()===1 && await desktop.locator('#shift-store').isHidden());
    await desktop.locator('#shift-menu').click();
    await desktop.locator('[data-action="load"][data-id="1"]').click();
    check('An explicitly loaded established business skips the opening', await desktop.evaluate(()=>OneShift.app.sim.s.commerce.completed===1 && OneShift.saves.validate(OneShift.app.sim.s)) && await desktop.locator('body.shift-opening').count()===0 && await desktop.locator('.shift-opening-card').count()===0 && await desktop.locator('#shift-store').isVisible());
    await desktop.locator('#shift-menu').click();
    await desktop.locator('#shift-settings summary').filter({hasText:'More'}).click();
    await desktop.locator('[data-action="new"][data-id="business"]').click();
    check('New game restores the same one-action opening', await desktop.locator('body.shift-opening').count()===1 && await desktop.locator('.shift-opening-card [data-action="business-fulfill"]').isVisible() && await desktop.locator('#shift-store').isHidden());
    await desktop.evaluate(() => __oneShift.newGame(1,'normal'));
    check('Legacy mode clears the business and opening presentation', await desktop.locator('body.shift-opening, body.shift-business').count()===0 && await desktop.locator('.shift-brand').isHidden() && await desktop.locator('#shift-view').isHidden() && await desktop.locator('#shift-store').isHidden());
    await desktop.evaluate(() => __oneShift.newGame(1,'business'));
    check('Returning from legacy restores the business masthead and opening', await desktop.locator('.shift-brand h1').isVisible() && await desktop.locator('body.shift-opening').count()===1);
    const recovery=await browser.newPage({viewport:{width:1512,height:742},deviceScaleFactor:2});
    await boot(recovery,url);
    await recovery.evaluate(()=>{
      const sim=OneShift.app.sim;
      for(const p of sim.businessAvailable('lantern')){
        const result=sim.command({type:'hold',pallet:p.id,value:true});
        if(!result.ok)throw Error(result.reason);
      }
      OneShift.saves.validate(sim.s);OneShift.saves.save(sim.s,1);OneShift.app.ui.update();
    });
    await recovery.locator('#shift-menu').click();
    await recovery.locator('[data-action="load"][data-id="1"]').click();
    check('A valid save with unavailable first-order stock exposes replenishment instead of trapping the opening',await recovery.locator('body.shift-opening').count()===0 && await recovery.locator('#shift-store').isVisible() && await recovery.locator('.shift-business-tabs').isVisible() && await recovery.locator('[data-action="business-need-stock"][data-item="lantern"]').isVisible() && await recovery.evaluate(()=>OneShift.app.sim.s.commerce.completed===0 && OneShift.app.sim.businessStock('lantern').free===0));
    await recovery.locator('[data-action="business-need-stock"][data-item="lantern"]').click();
    await recovery.locator('#shift-queue [data-action="business-restock"][data-item="lantern"][data-count="16"]').click();
    const recoveryMinute=await recovery.evaluate(()=>OneShift.app.sim.s.minute);
    await recovery.evaluate(()=>__oneShift.resume());
    await recovery.waitForTimeout(350);
    await recovery.evaluate(()=>__oneShift.stop());
    check('Unavailable-stock recovery allows the clock to run toward its supplier delivery',await recovery.evaluate(before=>OneShift.app.sim.s.minute>before,recoveryMinute));
    await recovery.evaluate(()=>{
      const sim=OneShift.app.sim;
      for(let n=0;n<8000&&!sim.s.commerce.restocked;n++)sim.tick();
      OneShift.saves.validate(sim.s);OneShift.app.ui.update();__oneShift.draw();
    });
    if(!await recovery.locator('[data-action="business-fulfill"]').first().isVisible())await recovery.locator('[data-action="business-tab"][data-id="orders"]').click();
    await recovery.locator('[data-action="business-fulfill"]').first().click();
    const recovered=await advanceSale(recovery);
    check('A replenished saved warehouse can finish its first actual customer shipment',recovered.completed===1 && recovered.balance.expected===recovered.balance.accounted);
    await recovery.screenshot({path:path.join(dump,'opening-recovered-stock.png')});
    await recovery.close();
    const mixed=await browser.newPage({viewport:{width:1512,height:742},deviceScaleFactor:2});
    await boot(mixed,url);
    await mixed.evaluate(()=>{
      const sim=OneShift.app.sim,result=sim.command({type:'cancelOrder',order:sim.s.commerce.orders[0].id});
      if(!result.ok)throw Error(result.reason);
      OneShift.saves.validate(sim.s);OneShift.saves.save(sim.s,1);OneShift.app.ui.update();
    });
    await mixed.locator('#shift-menu').click();
    await mixed.locator('[data-action="load"][data-id="1"]').click();
    check('A valid no-sale save after cancellation exposes the next customer',await mixed.locator('body.shift-opening').count()===0 && await mixed.locator('[data-action="business-advance"]').isVisible());
    await mixed.locator('[data-action="business-advance"]').click();
    await mixed.evaluate(()=>__oneShift.resume());
    await mixed.locator('.shift-order-card').waitFor({state:'visible'});
    await mixed.evaluate(()=>__oneShift.stop());
    check('A first sale with two products retains both order lines and the planning board',await mixed.locator('.shift-order-card').innerText().then(t=>t.includes('Stoves')&&t.includes('Chairs')) && await mixed.locator('.shift-opening-card').count()===0 && await mixed.locator('.shift-business-tabs').isVisible() && await mixed.evaluate(()=>OneShift.app.sim.s.commerce.orders.find(o=>o.status==='offered').lines.length===2));
    await mixed.locator('[data-action="business-fulfill"]').first().click();
    const mixedSale=await advanceSale(mixed);
    check('The mixed first customer ships both products for its actual $122 reward',mixedSale.completed===1 && mixedSale.balance.expected===mixedSale.balance.accounted && await mixed.evaluate(()=>OneShift.app.sim.s.commerce.orders.find(o=>o.status==='complete').paid===12200));
    check('A mixed order says Packing while its worker actually wraps either product',mixedSale.samples.some(s=>s.task==='wrap') && mixedSale.samples.filter(s=>s.task==='wrap').every(s=>/^packing/i.test(s.status)));
    const mixedProgress=mixedSale.samples.filter(s=>s.progress);
    check('Mixed-order progress never falls when the worker switches between products',mixedProgress.length>2 && mixedProgress.every((s,i)=>s.progress.max>0 && s.progress.value>=0 && s.progress.value<=s.progress.max && (!i || s.progress.value/s.progress.max>=mixedProgress[i-1].progress.value/mixedProgress[i-1].progress.max)));
    check('The mixed first-sale receipt offers stock for a product that actually shipped',await mixed.locator('.shift-first-receipt [data-action="business-need-stock"]').getAttribute('data-item').then(item=>['stove','chair'].includes(item)));
    await mixed.screenshot({path:path.join(dump,'opening-mixed-first-sale.png')});
    await mixed.close();
    const touchIdle=await phone.evaluate(()=>JSON.stringify(OneShift.app.sim.s.workers)), touchFloor=await phone.evaluate(()=>__oneShift.screen(12.5,13.5));
    await phone.touchscreen.tap(touchFloor.x,touchFloor.y);
    check('A phone floor tap does not add walking', await phone.evaluate(before=>JSON.stringify(OneShift.app.sim.s.workers)===before,touchIdle));
    await phone.locator('[data-action="business-fulfill"]').tap();
    const phoneSale=await advanceSale(phone);
    check('The enlarged-text phone can complete its visible first action', phoneSale.completed===1 && await phone.locator('.shift-first-receipt').isVisible());
    check('The phone loading rear stays visible in the closer scene',phoneSale.samples.some(s=>s.task==='load')&&phoneSale.samples.filter(s=>s.truck==='docked').every(s=>s.rearVisible));
    check('Truck text is fully inside the closer scene whenever it can fit',stages.some(s=>s.truckLabels.length>0)&&stages.every(s=>s.labelsInside));
    await phone.screenshot({path:path.join(dump,'opening-phone-receipt.png')});
    check('Phone receipt and Buy stock stay inside the card without scrolling', await phone.locator('.shift-first-receipt [data-action="business-need-stock"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.height>=44 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;}));
    check('Enlarged-text phone header keeps every unlocked control separate and on screen',await phone.locator('.shift-hud').evaluate(hud=>{const nodes=[...hud.querySelectorAll('.shift-brand,.shift-clock,.shift-cash,button')].filter(n=>n.getBoundingClientRect().width>0),rs=nodes.map(n=>n.getBoundingClientRect());return rs.every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight) && rs.every((r,i)=>rs.slice(i+1).every(q=>r.right<=q.left+.5||q.right<=r.left+.5||r.bottom<=q.top+.5||q.bottom<=r.top+.5));}));
    await phone.locator('[data-action="business-need-stock"]').tap();
    check('The phone stock board keeps its truthful heading when tabs scroll away',await phone.locator('[data-action="queue-toggle"] strong').innerText().then(t=>t==='Stock'));
    const touchBuy=phone.locator('#shift-queue [data-action="business-restock"][data-item="lantern"][data-count="16"]');
    await touchBuy.tap();
    check('Enlarged-text phone Buy stock can purchase real replenishment through the board',await phone.evaluate(()=>OneShift.app.sim.s.commerce.purchases.length===1&&OneShift.app.sim.businessStock('lantern').incoming===16));
    await phone.screenshot({path:path.join(dump,'opening-phone-stock.png')});
    await phone.evaluate(()=>{const sim=OneShift.app.sim;for(let n=0;n<8000&&!sim.s.commerce.restocked;n++)sim.tick();OneShift.saves.validate(sim.s);OneShift.app.ui.update();__oneShift.draw();});
    check('The closer phone view receives paid stock into an actual rack',await phone.evaluate(()=>OneShift.app.sim.s.commerce.restocked===1&&OneShift.app.sim.s.commerce.purchases[0].pallets.every(id=>OneShift.app.sim.p.get(id).place==='storage')));
    const phoneCamera=await phone.evaluate(()=>({...OneShift.app.renderer.camera}));
    const phonePan=await phone.evaluate(()=>{const v=document.getElementById('shift-view').getBoundingClientRect();return {x:v.left+v.width/2,y:v.top+v.height/2};}),touch=await phone.context().newCDPSession(phone);
    try{
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...phonePan,id:1}]});
      for(let n=1;n<=6;n++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:phonePan.x+n*5,y:phonePan.y+n*2.5,id:1}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }finally{await touch.detach();}
    check('The closer phone scene retains native touch-drag camera control',await phone.evaluate(before=>OneShift.app.renderer.camera.x!==before.x&&OneShift.app.renderer.camera.zoom===before.zoom,phoneCamera));
    await phone.setViewportSize({width:375,height:667});
    await phone.waitForTimeout(100);
    check('Portrait phone still freezes behind the rotate screen', await phone.locator('#shift-rotate').isVisible() && await phone.evaluate(()=>OneShift.app.rotated));
    check('The native opening playthrough has no JavaScript errors', errors.length===0);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(path.join(dump,'opening-browser.json'),JSON.stringify({checks,errors,layouts,stages},null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
