'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const dump=process.env.SHIFT_DUMP||path.join(require('node:os').tmpdir(),'one-shift-inventory');
fs.mkdirSync(dump,{recursive:true});
let server,browser,page,checks=0;
const errors=[];
const check=(name,result)=>{assert.ok(result,name);checks++;console.log('PASS '+name);};
const shot=(p,name)=>p.screenshot({path:path.join(dump,name+'.png')});
const settle=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const stock=p=>p.evaluate(()=>JSON.stringify({pallets:OneShift.app.sim.s.pallets,goods:OneShift.app.sim.s.goods,hands:OneShift.app.sim.s.commerce.hands,cash:OneShift.app.sim.s.cash,journal:OneShift.app.sim.s.journal}));
async function boot(p,url){
  p.on('pageerror',error=>errors.push(error.message));
  await p.goto(url);
  await p.waitForFunction(()=>OneShift.app?.places&&document.querySelector('#place-targets [data-point-x]')&&OneShift.app.scenes.inventoryLoaded&&OneShift.app.scenes.images.size===9&&OneShift.app.receiving.images.size===6);
  await p.bringToFront();await p.evaluate(()=>document.fonts.ready);
}
async function point(p,selector){
  const n=p.locator(selector);await n.waitFor({state:'visible'});await settle(p);
  return n.evaluate(node=>{const r=node.closest('.inventory-surface,.place-art').getBoundingClientRect();return {x:r.left+Number(node.dataset.pointX)*r.width,y:r.top+Number(node.dataset.pointY)*r.height};});
}
async function choose(p,selector,touch=false){
  if(selector.startsWith('#place-targets'))await p.locator('#place-loading').waitFor({state:'hidden'});
  const q=await point(p,selector);assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y),'Authored interaction point');
  if(touch)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);
  await settle(p);
}
async function aisle(p,index,touch=false){
  if(await p.evaluate(()=>OneShift.app.scenes.inventoryMode==='bay'))await p.locator('[data-inventory-back]').click();
  await choose(p,'.inventory-aisle[data-aisle="'+index+'"]',touch);
  await p.waitForFunction(i=>OneShift.app.scenes.inventoryMode==='bay'&&OneShift.app.scenes.inventoryAisle===i,index);
}
async function level(p,wanted,touch=false){
  while(await p.evaluate(()=>OneShift.app.scenes.inventoryLevel)!==wanted){
    const up=await p.evaluate(()=>OneShift.app.scenes.inventoryLevel)<wanted;
    const button=p.locator(up?'[data-inventory-up]':'[data-inventory-down]');
    if(touch)await button.tap();else await button.click();await settle(p);
  }
}
async function freshStock(p,{full=false,scale=1}={}){
  await p.evaluate(({full,scale})=>{
    const O=OneShift,a=O.app;__oneShift.stop();__oneShift.newGame(1,'business');
    const sim=a.sim,s=sim.s;a.paused=false;document.documentElement.style.fontSize=(16*scale)+'px';
    if(full){
      O.post(s,'Capital',2000,'Inventory browser fixture');s.commerce.completed=8;
      for(const id of ['training','usedLift','upper']){const r=sim.command({type:'buy',id});if(!r.ok)throw Error(r.reason);}
      const rack=s.map.racks[0],existing=s.pallets.slice();
      existing.forEach((p,i)=>Object.assign(p,{x:rack.x+i%2,y:rack.y,level:Math.floor(i/2),place:'storage',rack:rack.id}));
      // Split existing cases into two additional physical pallets. Goods and
      // total cost basis stay unchanged; the fixture validates before use.
      for(let side=0;side<2;side++){
        const source=existing[side],cost=Math.round(source.costBasis/source.cases);
        source.cases--;source.bookCases=source.cases;source.costBasis-=cost;
        sim.pallet(source.item,source.client,1,null,{x:rack.x+side,y:rack.y,level:3,place:'storage',rack:rack.id,confirmed:true,scanned:true,lot:source.lot,bestBy:source.bestBy,receivedDay:source.receivedDay,unitCost:cost,costBasis:cost});
      }
      sim.reindex();
    }
    O.saves.validate(s);if(sim.reconcile().expected!==sim.reconcile().accounted)throw Error('Fixture conservation failure.');
    a.ui.update();a.scenes.open('storage');
  },{full,scale});await settle(p);
}
async function palletPoint(p,id,nearEmpty=false){
  return p.evaluate(({id,nearEmpty})=>{
    const scene=OneShift.app.scenes,q=scene.layout.find(q=>q.p.id===id),r=scene.canvas.getBoundingClientRect();
    if(!q)throw Error('Missing rendered pallet '+id);
    let fallback;
    for(const fy of [.1,.2,.35,.5,.65,.8])for(const fx of [.5,.35,.65,.2,.8]){
      const x=r.left+scene.ox+(q.x+q.w*fx)*scene.scale,y=r.top+scene.oy+(q.y+q.h*fy)*scene.scale;
      if(scene.hit({clientX:x,clientY:y,pointerType:'mouse'})?.id!==id)continue;
      const empty=scene.inventoryArt.pick(scene.inventoryArt.sourcePoint(x,y),true);
      const answer={x,y,empty:empty?.definition?.id||null};
      if(!nearEmpty||empty)return answer;
      fallback??=answer;
    }
    if(fallback)return fallback;throw Error('Pallet has no sampled opaque pixel.');
  },{id,nearEmpty});
}
async function selectPallet(p,id,touch=false,nearEmpty=false){
  await settle(p);const q=await palletPoint(p,id,nearEmpty);
  if(touch)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);
  await p.waitForFunction(id=>OneShift.app.scenes.selected===id,id);await p.locator('#scene-label').waitFor({state:'visible'});return q;
}
async function closeLabel(p){await p.locator('#scene-deselect').click();await settle(p);}
async function newFromMenu(p){await p.locator(await p.locator('#shift-place').isVisible()?'#place-menu':'#shift-menu').click();await p.locator('#shift-settings details').filter({has:p.locator('[data-action="new"]')}).locator('summary').click();await p.locator('[data-action="new"][data-id="business"]').click();await p.waitForFunction(()=>OneShift.app.places.current==='clock'&&!OneShift.app.places.clockedIn);}
(async()=>{
  let url=process.env.SHIFT_URL;
  if(!url){
    server=http.createServer((request,response)=>{const file=path.resolve(root,'.'+new URL(request.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return;}response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');response.end(data);});});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/one-shift.html';
  }
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();await boot(page,url);
  await page.locator('#place-card [data-place="punch"]').click();await choose(page,'#place-targets [data-place="storage"]');
  check('Floor inventory doorway opens four native aisle targets',await page.locator('.inventory-aisle').count()===4&&await page.evaluate(()=>OneShift.app.scenes.inventoryMode==='overview'));
  check('Unreceived trailer pallets do not appear as rack inventory',await page.evaluate(()=>OneShift.app.scenes.inventorySnapshot.totalPallets===0&&OneShift.app.scenes.layout.length===0));
  await shot(page,'01-empty-overview');
  await freshStock(page);const before=await stock(page),seen=[];
  check('Stocked overview reports the actual six pallets and 104 cases',await page.evaluate(()=>OneShift.app.scenes.inventorySnapshot.totalPallets===6&&OneShift.app.scenes.inventorySnapshot.totalCases===104));
  check('Aisle hit areas have transparent object contours with no label boxes',await page.locator('.inventory-aisle').evaluateAll(nodes=>nodes.length===4&&nodes.every(n=>{const s=getComputedStyle(n);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.clipPath.startsWith('url(')&&!n.textContent.trim()&&!n.children.length;})));
  await shot(page,'02-stocked-overview');
  for(let i=0;i<4;i++){
    await aisle(page,i);
    check('Native aisle '+String.fromCharCode(65+i)+' opens its own real bay',await page.locator('#scene-title').textContent()==='Rack '+(i+1)+' / '+String.fromCharCode(65+i)+'01');
    const inspected=await page.evaluate(()=>{
      const scene=OneShift.app.scenes,view=scene.inventorySnapshot,nodes=[...document.querySelectorAll('.inventory-position')];
      return {ids:scene.layout.map(q=>q.p.id),correct:nodes.length===2&&view.positions.filter(p=>p.level===scene.inventoryLevel).every(p=>{const n=nodes.find(n=>n.dataset.slot===p.id);return n&&Number(n.dataset.aisle)===p.aisleIndex&&Number(n.dataset.bay)===p.bay&&Number(n.dataset.level)===p.level&&Number(n.dataset.side)===p.side&&(p.pallet?Number(n.dataset.pallet)===p.pallet:n.classList.contains('inventory-slot'));}),locked:view.positions.filter(p=>p.level>0).every(p=>p.locked&&!p.available&&!p.installed),geometry:scene.layout.every(q=>{const slot=OneShift.inventoryArtLayout.rack.slots.find(s=>s.level===q.p.level&&s.side===q.p.side);return q.x>=slot.x&&q.x+q.w<=slot.x+slot.w&&q.y>=slot.y&&q.y+q.h<=slot.base[1]+.01;})};
    });seen.push(...inspected.ids);
    check('Aisle '+String.fromCharCode(65+i)+' exposes exactly the two positions on the focused level',inspected.correct);
    check('Aisle '+String.fromCharCode(65+i)+' shows six locked upper positions',inspected.locked);
    check('Aisle '+String.fromCharCode(65+i)+' renders its real stock within the correct openings',inspected.geometry);
    await shot(page,'03-aisle-'+String.fromCharCode(65+i));
    check('Rack '+(i+1)+' shows only the actual racks farther along',await page.evaluate(i=>OneShift.app.scenes.inventoryDepth.map(b=>b.ordinal).join(',')===[1,2,3].filter(n=>n>i).join(','),i));
  }
  const actual=await page.evaluate(()=>OneShift.app.sim.s.pallets.filter(p=>p.place==='storage'&&p.cases>0).map(p=>p.id).sort((a,b)=>a-b));
  check('All stored pallets appear once across the four aisles',new Set(seen).size===seen.length&&JSON.stringify(seen.sort((a,b)=>a-b))===JSON.stringify(actual));
  check('Browsing all aisles changes no freight, lots, cash or ledger entries',await stock(page)===before);
  await page.keyboard.press('Escape');check('Escape from an unselected bay returns to the four aisles',await page.evaluate(()=>OneShift.app.scenes.inventoryMode==='overview'));
  await page.locator('.inventory-aisle[data-aisle="2"]').focus();await page.keyboard.press('Enter');check('Keyboard Enter opens the focused aisle',await page.evaluate(()=>OneShift.app.scenes.inventoryAisle===2&&OneShift.app.scenes.inventoryMode==='bay'));

  const addresses=await page.evaluate(()=>OneShift.inventorySnapshot(OneShift.app.sim).aisles.flatMap(a=>a.bays.map(b=>[b.rack,a.id,b.index])));
  await page.evaluate(()=>{const O=OneShift,a=O.app;O.post(a.sim.s,'Capital',1000,'Inventory browser rack fixture');const r=O.sceneBuyRack(a.sim);if(!r.ok)throw Error(r.reason);O.saves.validate(a.sim.s);a.ui.update();a.scenes.sync(true);});
  await aisle(page,0);await page.getByRole('button',{name:'Walk to Rack 5, Aisle A, Bay 2',exact:true}).click();
  check('Purchased rack is a second real bay in Aisle A',await page.evaluate(()=>OneShift.app.scenes.inventoryAisle===0&&OneShift.app.scenes.inventoryBay===1&&OneShift.app.scenes.inventorySnapshot.positions.length===8));
  check('Navigation names exactly five real racks without vague paging',await page.locator('[data-inventory-rack]').count()===5&&await page.locator('.scene-pages').isHidden());
  check('Adding a bay preserves every preexisting physical address',await page.evaluate(old=>{const now=OneShift.inventorySnapshot(OneShift.app.sim).aisles.flatMap(a=>a.bays.map(b=>[b.rack,a.id,b.index]));return old.every(x=>now.some(y=>JSON.stringify(y)===JSON.stringify(x)));},addresses));
  await page.getByRole('button',{name:'Walk to Rack 1, Aisle A, Bay 1',exact:true}).click();check('Named Rack 1 button returns to its real bay',await page.evaluate(()=>OneShift.app.scenes.inventoryBay===0));
  const routeStock=await stock(page);await page.locator('.scene-nav [data-place="floor"]').click();await choose(page,'#place-targets [data-place="storage"]');
  check('Returning through the floor reopens the overview without moving freight',await page.evaluate(()=>OneShift.app.scenes.inventoryMode==='overview')&&await stock(page)===routeStock);
  const saved=await page.evaluate(()=>JSON.stringify(OneShift.inventorySnapshot(OneShift.app.sim)));
  await page.locator('#shift-menu').click();await page.locator('[data-action="save"][data-id="1"]').click();await page.locator('[data-action="load"][data-id="1"]').click();
  check('Explicit save and load preserve exact aisle addresses, quantities and lots',await page.evaluate(()=>JSON.stringify(OneShift.inventorySnapshot(OneShift.app.sim)))===saved);

  // Capability fixtures isolate all three gates without auto-handling stock.
  await freshStock(page);await page.evaluate(()=>{const a=OneShift.app,p=a.sim.s.pallets[0],slot=a.sim.handFloorSlots('receiving').find(s=>s.available);Object.assign(p,{x:slot.x,y:slot.y,level:0,place:'lane',lane:'receiving'});a.sim.reindex();OneShift.saves.validate(a.sim.s);a.ui.update();a.scenes.open('staging');});
  const inbound=await page.evaluate(()=>OneShift.app.sim.s.pallets[0].id);await selectPallet(page,inbound);await page.locator('[data-hand="handLift"]').click();await page.locator('.scene-nav [data-place="floor"]').click();await choose(page,'#place-targets [data-place="storage"]');await aisle(page,0);
  const carried=await stock(page),upper='.inventory-slot[data-level="1"][data-side="0"]';await level(page,1);await choose(page,upper);
  check('Uninstalled upper position explains the rack upgrade and keeps carried stock',await page.locator('.inventory-note').textContent().then(t=>t.includes('Unlock upper storage'))&&await stock(page)===carried);
  await page.evaluate(()=>{const a=OneShift.app;for(const r of a.sim.s.map.racks)r.levels=4;a.sim.s.owned.upper=1;a.scenes.sync(true);});await choose(page,upper);
  check('Installed upper position still requires forklift training',await page.locator('.inventory-note').textContent().then(t=>t.includes('training'))&&await stock(page)===carried);
  await page.evaluate(()=>{const a=OneShift.app;a.sim.s.owned.training=1;a.scenes.sync(true);});await choose(page,upper);
  check('Training alone still requires an owned forklift',await page.locator('.inventory-note').textContent().then(t=>t.includes('forklift'))&&await stock(page)===carried);
  await page.evaluate(()=>{const a=OneShift.app;a.sim.s.owned.usedLift=1;a.scenes.sync(true);});
  const chosen=await page.locator(upper).getAttribute('data-slot');await choose(page,upper);
  check('Native available slot click stores the same carried pallet at that exact level',await page.evaluate(({id,slot})=>{const a=OneShift.app;OneShift.saves.validate(a.sim.s);return a.sim.s.commerce.hands.carry===null&&OneShift.inventoryLocation(a.sim,id).slot===slot&&a.sim.reconcile().accounted===104;},{id:inbound,slot:chosen}));
  await shot(page,'04-upper-putaway');

  await freshStock(page);await page.locator('[data-action="business-fulfill"]').first().click();const mode=await page.evaluate(()=>OneShift.app.scenes.inventoryMode);await page.locator('[data-hand="handBeginPick"]').click();
  check('Taking an empty pallet preserves the current inventory view',await page.evaluate(()=>OneShift.app.scenes.inventoryMode)===mode&&await page.evaluate(()=>OneShift.app.sim.p.get(OneShift.app.sim.s.commerce.hands.carry).cases===0));
  const source=await page.evaluate(()=>{const a=OneShift.app,id=a.sim.handOrder().allocations[0].source;return {id,...OneShift.inventoryLocation(a.sim,id)};});
  check('Pick instruction identifies the actual source aisle, bay and level',await page.locator('#scene-work').textContent().then(t=>t.includes('Aisle '+source.aisle)&&t.includes('Bay '+source.bayNumber)&&t.includes('level '+(source.level+1))));
  await aisle(page,source.aisleIndex);await selectPallet(page,source.id);const sourceBefore=await page.evaluate(id=>OneShift.app.sim.p.get(id).cases,source.id);await page.locator('[data-hand="handPickCase"]').click();
  check('Native rack selection and case pick transfer exactly one physical case',await page.evaluate(({id,count})=>{const a=OneShift.app;return a.sim.p.get(id).cases===count-1&&a.sim.p.get(a.sim.s.commerce.hands.carry).cases===1&&a.sim.reconcile().accounted===104;},{id:source.id,count:sourceBefore}));
  await closeLabel(page);await page.locator('[data-inventory-back]').click();await aisle(page,3);
  check('Navigating away mid-pick retains the same one-case carried pallet',await page.evaluate(()=>OneShift.app.sim.p.get(OneShift.app.sim.s.commerce.hands.carry).cases===1));

  await freshStock(page,{full:true});await aisle(page,0);
  check('Full rack fixture has eight actual pallets and only two active targets at a time',await page.locator('.scene-target[data-pallet]').count()===2&&await page.evaluate(()=>OneShift.app.scenes.inventorySnapshot.pallets.length===8&&OneShift.app.sim.reconcile().accounted===104));
  check('Full rack shows every active pallet only at its persisted slot',await page.evaluate(()=>{const a=OneShift.app;return a.scenes.layout.length===2&&a.scenes.layout.every(q=>{const real=OneShift.inventoryLocation(a.sim,q.p.id),n=document.querySelector('.scene-target[data-pallet="'+q.p.id+'"]');return real.slot===n.dataset.slot&&real.level===Number(n.dataset.level)&&real.side===Number(n.dataset.side);});}));
  check('Every full-rack pallet rests on its own deck without crossing an opening edge',await page.evaluate(()=>OneShift.app.scenes.layout.every(q=>{const slot=OneShift.inventoryArtLayout.rack.slots.find(s=>s.level===q.p.level&&s.side===q.p.side);return Math.abs(q.y+q.h-slot.base[1])<.01&&q.y>=slot.y&&q.x>=slot.x&&q.x+q.w<=slot.x+slot.w;})));
  await shot(page,'05-desktop-eight-pallets');
  const beforeLevels=await stock(page),camera=[];
  check('Bottom level disables downward navigation',await page.locator('[data-inventory-down]').isDisabled());
  for(let floor=0;floor<4;floor++){
    await level(page,floor);camera.push(await page.evaluate(()=>OneShift.app.scenes.oy));
    for(const id of await page.evaluate(()=>OneShift.app.scenes.layout.map(q=>q.p.id))){await selectPallet(page,id);check('Native pallet '+id+' label identifies its physical location',await page.evaluate(id=>{const l=OneShift.inventoryLocation(OneShift.app.sim,id);return document.getElementById('scene-place').textContent==='Aisle '+l.aisle+' / Bay '+l.bayNumber+' / level '+(l.level+1)+' / '+(l.side?'right':'left');},id));await closeLabel(page);}
    await shot(page,'05-desktop-level-'+(floor+1));
  }
  check('Each upward step pans the camera to a higher shelf',camera.every((value,i)=>i===0||value>camera[i-1]));
  check('Top level disables upward navigation without changing stock or money',await page.locator('[data-inventory-up]').isDisabled()&&await stock(page)===beforeLevels);
  await page.locator('[data-inventory-down]').focus();await page.keyboard.press('ArrowDown');
  check('Keyboard down moves exactly one level',await page.evaluate(()=>OneShift.app.scenes.inventoryLevel===2));
  await page.getByRole('button',{name:'Walk to Rack 2, Aisle B, Bay 1',exact:true}).click();
  check('Walking to another rack retains the viewing height and clears selection',await page.evaluate(()=>OneShift.app.scenes.inventoryLevel===2&&OneShift.app.scenes.selected===null));
  // Exercise the real DemoActivity loop as well as the deterministic stopped fixtures.
  await page.evaluate(()=>{OneShift.app.paused=true;__oneShift.resume();});
  await page.locator('[data-inventory-down]').click();
  await page.waitForFunction(()=>Math.abs(OneShift.app.scenes.inventoryCameraY-OneShift.app.scenes.inventoryCenter())<.2);
  check('Live camera settles at the next level without undoing manual pause',await page.evaluate(()=>OneShift.app.paused&&OneShift.app.scenes.inventoryLevel===1));
  await page.locator('[data-inventory-up]').click();await page.evaluate(()=>{OneShift.app.hidden=true;});
  const suspendedCamera=await page.evaluate(()=>OneShift.app.scenes.inventoryCameraY);await page.waitForTimeout(180);
  check('Inactive camera does not advance its pan',await page.evaluate(()=>OneShift.app.scenes.inventoryCameraY)===suspendedCamera);
  await page.evaluate(()=>{OneShift.app.hidden=false;});await page.waitForFunction(()=>Math.abs(OneShift.app.scenes.inventoryCameraY-OneShift.app.scenes.inventoryCenter())<.2);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-inventory-down]').click();
  check('Reduced motion moves immediately to the requested shelf',await page.evaluate(()=>OneShift.app.scenes.inventoryCameraY===OneShift.app.scenes.inventoryCenter()));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>__oneShift.stop());
  await newFromMenu(page);check('New Game from inventory returns to a valid manual warehouse clock',await page.evaluate(()=>{OneShift.saves.validate(OneShift.app.sim.s);return OneShift.app.sim.s.commerce.manualHandling&&OneShift.app.sim.s.map.inventoryNextOrdinal===4;}));
  await page.locator('#place-card [data-place="punch"]').click();await choose(page,'#place-targets [data-place="office"]');await newFromMenu(page);
  check('New Game from the office initializes manual inventory before rendering',await page.evaluate(()=>{OneShift.saves.validate(OneShift.app.sim.s);return OneShift.app.places.current==='clock'&&OneShift.app.sim.s.commerce.hands.carry===null;}));

  for(const [name,width,height,scale]of [['landscape',844,390,1],['small-large',667,375,1.3]]){
    const mobile=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1}),p=await mobile.newPage();await boot(p,url);await p.locator('#place-card [data-place="punch"]').tap();await freshStock(p,{scale});
    check(name+' four aisle targets are at least 44 pixels and inside the viewport',await p.locator('.inventory-aisle').evaluateAll(nodes=>nodes.length===4&&nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})));
    await shot(p,'06-'+name+'-overview');await aisle(p,0,true);
    const id=await p.evaluate(()=>OneShift.app.scenes.layout[0].p.id),q=await selectPallet(p,id,true,true);
    check(name+' exact pallet alpha wins over nearby empty-slot touch allowance',await p.evaluate(id=>OneShift.app.scenes.selected===id,id));if(q.empty)console.log('INFO '+name+' pallet alpha overlaps empty-slot touch allowance at '+q.empty);
    await closeLabel(p);await freshStock(p,{full:true,scale});await aisle(p,0,true);
    check(name+' active pallet targets are at least 44 pixels and within the scene',await p.locator('.inventory-position').evaluateAll(nodes=>nodes.length===2&&nodes.every(n=>{const r=n.getBoundingClientRect(),s=document.querySelector('.scene-stage').getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&r.left>=s.left-1&&r.top>=s.top-1&&r.right<=s.right+1&&r.bottom<=s.bottom+1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})));
    check(name+' up down and numbered rack buttons fit and retain 44px touch targets',await p.locator('.inventory-levels button,.inventory-route button').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})));
    await shot(p,'07-'+name+'-eight-pallets');
    for(let level=0;level<4;level++){
      if(level)await p.locator('[data-inventory-up]').tap();await settle(p);
      const id=await p.evaluate(level=>OneShift.app.scenes.layout.find(q=>q.p.level===level).p.id,level);await selectPallet(p,id,true);
      check(name+' touch selects actual stock on level '+(level+1),await p.evaluate(id=>OneShift.app.scenes.selected===id,id));if(level===1)await shot(p,'08-'+name+'-selected-stock');await closeLabel(p);
    }
    const unchanged=await stock(p);await p.setViewportSize({width:375,height:667});await settle(p);await p.waitForTimeout(120);
    check(name+' portrait shows the orientation gate without moving inventory',await p.locator('#shift-rotate').isVisible()&&await stock(p)===unchanged);
    await p.setViewportSize({width,height});await settle(p);await p.locator('[data-inventory-back]').tap();await aisle(p,3,true);
    check(name+' returning to landscape keeps working aisle navigation and exact freight',await p.evaluate(()=>OneShift.app.scenes.inventoryAisle===3)&&await stock(p)===unchanged);
    await freshStock(p,{scale});await aisle(p,0,true);await p.locator('[data-inventory-up]').tap();await settle(p);await choose(p,'.inventory-slot[data-level="1"][data-side="0"]',true);
    check(name+' locked upper position explains the missing upgrade visibly',await p.locator('.inventory-note').isVisible()&&await p.locator('.inventory-note').textContent().then(t=>t.includes('Unlock upper storage')));
    await mobile.close();
  }
  check('Inventory acceptance produced no browser errors',errors.length===0);console.log(checks+' inventory browser checks passed. Screenshots '+dump);
})().catch(async error=>{console.error(error);if(errors.length)console.error(errors);if(page&&!page.isClosed()){await shot(page,'failure').catch(()=>{});console.error(await page.evaluate(()=>({scene:OneShift.app.scenes.scene,mode:OneShift.app.scenes.inventoryMode,aisle:OneShift.app.scenes.inventoryAisle,bay:OneShift.app.scenes.inventoryBay,place:OneShift.app.places.current,selected:OneShift.app.scenes.selected})).catch(()=>({})));}process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
