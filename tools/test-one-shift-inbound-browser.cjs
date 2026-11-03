'use strict';
// Native receiving gameplay. DOM HUD snapshots are observation only. Every
// action uses normal page controls, keyboard or mouse: no injected scan codes,
// gameplay methods, transforms, fake pointer locks or synthetic stock records.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const {classifyUnityConsole}=require('./one-shift-unity-console.cjs');
const root=path.resolve(__dirname,'..');
const output=process.env.SHIFT_INBOUND_DUMP||path.join(root,'research','receiving-v15-browser');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
const checks=[],observations=[],messages=[],errors=[],requests=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const angle=(to,from)=>((to-from+540)%360)-180;
const ground=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
let browser,page,phase='Starting',mouseX=640,mouseY=360,sensitivity=.18;
function stage(value){phase=value;console.log('STAGE '+value);}
function check(label,value){assert.ok(value,label);checks.push(label);console.log('PASS '+label);}
async function state(label=''){
  const value=await page.locator('.in-warehouse-stage').evaluate(node=>({
    ready:node.dataset.ready,active:node.dataset.active,locked:node.dataset.locked,interface:node.dataset.interface,
    build:Number(node.dataset.buildVersion),frames:Number(node.dataset.frames),hud:JSON.parse(node.dataset.hud||'{}'),
    scene:JSON.parse(node.dataset.sceneState||'{}'),captureError:node.dataset.captureError||''
  }));
  if(label){observations.push({label,at:Date.now(),...value});fs.writeFileSync(path.join(output,'latest-state.json'),JSON.stringify(value,null,2));}
  return value;
}
async function poll(label,test,timeout=20000){
  const deadline=Date.now()+timeout;let current;
  do{current=await state();if(test(current))return current;await delay(120);}while(Date.now()<deadline);
  throw new Error(label+' timed out: '+JSON.stringify(current));
}
async function click(selector){const item=typeof selector==='string'?page.locator(selector):selector;const box=await item.boundingBox();await item.click();if(box){mouseX=box.x+box.width/2;mouseY=box.y+box.height/2;}await delay(220);}
async function capture(name){await page.screenshot({path:path.join(output,name+'.png'),timeout:60000});}
async function locked(){await page.waitForFunction(()=>document.pointerLockElement?.id==='in-warehouse-canvas',null,{timeout:15000});await poll('Native floor control',s=>s.hud.inbound?.canControl);}
async function startPlaying(){await click('.in-warehouse-gate button');await locked();}
async function moveMouse(dx,dy){mouseX+=dx;mouseY+=dy;await page.mouse.move(mouseX,mouseY);await delay(240);}
async function yawTo(target){
  for(let i=0;i<12;i++){
    const current=(await state()).hud.inbound,error=angle(target,current.cameraRotation[1]);if(Math.abs(error)<.4)return;
    const pixels=Math.max(-450,Math.min(450,error/sensitivity)),parts=Math.ceil(Math.abs(pixels)/90);
    for(let p=0;p<parts;p++)await moveMouse(pixels/parts,0);
  }
  assert.ok(Math.abs(angle(target,(await state()).hud.inbound.cameraRotation[1]))<.8,'Mouse reaches yaw '+target);
}
async function pitchTo(target){
  for(let i=0;i<10;i++){
    const current=(await state()).hud.inbound,error=target-angle(current.cameraRotation[0],0);if(Math.abs(error)<.3)return;
    await moveMouse(0,Math.max(-180,Math.min(180,error/sensitivity)));
  }
  assert.ok(Math.abs(target-angle((await state()).hud.inbound.cameraRotation[0],0))<.8,'Mouse reaches pitch '+target);
}
async function aimAt(point){const eye=(await state()).hud.inbound.cameraPosition;await yawTo(Math.atan2(point[0]-eye[0],point[2]-eye[2])*180/Math.PI);await pitchTo(Math.atan2(eye[1]-point[1],ground(eye,point))*180/Math.PI);}
async function walkTo(x,z,label,tolerance=.23){
  await pitchTo(0);let current=await state(),stuck=0;const deadline=Date.now()+60000;
  while(ground(current.hud.inbound.playerPosition,[x,0,z])>tolerance&&Date.now()<deadline){
    const p=current.hud.inbound.playerPosition,remaining=ground(p,[x,0,z]);await yawTo(Math.atan2(x-p[0],z-p[2])*180/Math.PI);
    await page.keyboard.down('w');try{await delay(Math.max(45,Math.min(400,(remaining-tolerance/2)/2.8*1000)));}finally{await page.keyboard.up('w');}
    await delay(230);const after=await state();stuck=ground(p,after.hud.inbound.playerPosition)<.025?stuck+1:0;
    assert.ok(stuck<7,label+' blocked at '+JSON.stringify(after.hud.inbound.playerPosition));current=after;
  }
  check(label,ground(current.hud.inbound.playerPosition,[x,0,z])<tolerance+.06);return current;
}
async function openDevice(){await page.mouse.click(mouseX,mouseY,{button:'right'});await page.waitForSelector('#in-scanner-dialog[open]');await poll('Scanner interface',s=>s.hud.inbound.scannerInspecting);}
async function returnFloor(){await click('#in-scanner-dialog > header [data-action="return-floor"]');await locked();}
async function mobileSteps(){await openDevice();for(let i=0;i<3;i++)await click('#in-scanner-dialog [data-action="next"]');await returnFloor();}
async function labelPoint(index=1){const unit=(await state()).hud.inbound.units[index];return [unit.position[0],unit.position[1]-.04428,unit.position[2]-.196];}
async function pauseAndChoose(id){
  await page.keyboard.press('Escape');await page.waitForSelector('#in-game-dialog[open]');await click('#in-game-dialog a[href="#inbound"]');
  if(['basic','partial','lot','serial','date'].includes(id))await click('a[href="#mobile"]');
  await click('a[href="#practice/'+id+'"]');await poll('Ready '+id,s=>s.ready==='true'&&s.hud.inbound?.lesson===id,30000);await startPlaying();
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:process.env.SHIFT_INBOUND_HEADED!=='1',channel:process.env.SHIFT_BROWSER_CHANNEL||'chrome',args:['--enable-gpu',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('console',m=>messages.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url());});
  page.on('dialog',async dialog=>{errors.push('Unexpected browser dialog: '+dialog.message());await dialog.dismiss();});
  stage('Clean menus and first warehouse load');await page.goto('http://127.0.0.1:'+server.address().port+'/one-shift.html');
  await click('a[href="#inbound"]');await click('a[href="#mobile"]');
  check('Menus do not load Unity',!requests.some(url=>url.includes('OneShiftWeb.')));
  await click('a[href="#practice/basic"]');await poll('Build15 ready',s=>s.ready==='true'&&s.build===15&&s.hud.inbound?.sceneReady,240000);
  messages.push({type:'log',text:'INBOUND_BROWSER_READY'});await capture('01-ready');await startPlaying();
  const opening=await state('Opening');check('Basic fixture opens exactly four unreceived physical units',opening.hud.inbound.physicalUnits===4&&opening.hud.inbound.good===0&&!opening.hud.inbound.wmsRuntimePresent);
  const before=(await state()).hud.inbound.cameraRotation[1];await moveMouse(60,0);const after=(await state()).hud.inbound.cameraRotation[1];sensitivity=angle(after,before)/60;
  check('Native mouse rotates the actual camera',sensitivity>.02&&sensitivity<3);await yawTo(0);
  stage('Walk, carry and put down real stock');await walkTo(-3.9,8.15,'WASD approaches the delivery');
  check('Guide observes real walking',(await state()).hud.inbound.hasWalked);
  const unit=(await state()).hud.inbound.units[1],original=unit.position.slice();await aimAt(original);await page.keyboard.down('e');
  await poll('Physical pickup',s=>s.hud.holding&&s.hud.inbound.units.some(u=>u.held));await pitchTo(12);await delay(650);
  const carried=await state('Carried');check('Held E lifts a physical carton and clears receiving readiness',carried.hud.holding&&!carried.hud.inbound.allDeliveredAtReceiving&&carried.hud.inbound.good===0&&Math.abs(carried.hud.inbound.units[1].position[1]-original[1])>.15);
  await capture('02-carry');await aimAt(original);await delay(900);await page.keyboard.up('e');
  await poll('Delivery settled after release',s=>!s.hud.holding&&s.hud.inbound.allDeliveredAtReceiving,20000);check('Releasing E puts stock back without recording it',(await state()).hud.inbound.good===0);
  stage('TC22 task and physical barcode');await mobileSteps();await aimAt(await labelPoint(0));await page.keyboard.press('f');
  await poll('F reads the physical barcode',s=>s.hud.inbound.lastScan==='TAPE-48'&&s.hud.inbound.scannerFeedback==='success');check('F reads a real Code128 delivery label',(await state()).hud.inbound.inspected);
  await delay(1400);await aimAt(await labelPoint(2));await page.mouse.down();await delay(800);
  const heldScan=await state('Held scan');check('Held left mouse projects and decodes the real scanner stripe',heldScan.hud.inbound.scannerTrigger&&heldScan.hud.inbound.scannerAimVisible&&heldScan.hud.inbound.scannerAimSurface&&heldScan.hud.inbound.scannerFeedback==='success');
  await capture('03-held-scan');await page.mouse.up();await poll('Trigger released',s=>!s.hud.inbound.scannerTrigger);
  await openDevice();await page.locator('#receipt-quantity').fill('4');await click('#in-scanner-dialog button[type="submit"]');
  await poll('Receipt posted to same units',s=>s.hud.inbound.good===4&&s.hud.inbound.physicalUnits===4);check('TC22 quantity receipt records the existing four units',(await state()).hud.inbound.waiting===0);
  await click('#in-scanner-dialog [data-action="review-complete"]');await click('#in-scanner-dialog [data-action="confirm-close"]');
  await page.waitForFunction(()=>document.getElementById('in-step-title')?.textContent==='Purchase order completed');await capture('04-basic-complete');await returnFloor();
  stage('Escape pause and cached ASN lesson');await page.keyboard.press('Escape');await page.waitForSelector('#in-game-dialog[open]');const paused=await state();await delay(600);const stillPaused=await state();
  check('Escape pauses the engine without changing stock',paused.active==='false'&&stillPaused.frames===paused.frames&&stillPaused.hud.inbound.good===4);
  await click('#in-game-dialog [data-action="resume-game"]');await locked();await pauseAndChoose('asn');
  check('ASN reuses one loader with exactly five fresh physical units',requests.filter(url=>url.includes('OneShiftWeb.loader.js')).length===1&&(await state()).hud.inbound.physicalUnits===5&&(await state()).hud.inbound.good===0);
  await walkTo(-3.9,8.1,'Walk to ASN container');await openDevice();await click('#in-scanner-dialog [data-action="next"]');await returnFloor();
  await aimAt([-3.9,.104,-.793+10]);await page.keyboard.press('f');await poll('ASN container barcode',s=>s.hud.inbound.lastScan==='ASN-1001'&&s.hud.inbound.scannerFeedback==='success');
  await openDevice();await click('#in-scanner-dialog button[type="submit"]');await poll('ASN recorded',s=>s.hud.inbound.good===5);check('One physical container scan receives its five manifest units',(await state()).hud.inbound.physicalUnits===5);await capture('05-asn-received');await returnFloor();
  stage('Walk to actual office for web receiving');await pauseAndChoose('web');
  for(const [x,z,label]of [[.65,7.35,'Clear receiving rack end'],[.65,-2.5,'Walk the central aisle'],[5.37,-2.5,'Line up with the office doorway'],[5.37,-7,'Walk through the office doorway'],[9.8,-7.4,'Approach the physical office monitor']])await walkTo(x,z,label);
  await aimAt([9.8,1.2,-8.99]);await poll('Actual monitor interaction',s=>s.hud.hint==='Use warehouse computer');const atDesk=(await state()).hud.inbound.playerPosition.slice();
  await page.keyboard.press('e');await poll('Office camera enters',s=>s.hud.computer.open&&!s.hud.computer.transitioning);await page.waitForSelector('#in-scanner-dialog.is-computer[open]');
  check('Walking to the monitor opens the real office transition',(await state()).hud.computer.open);await capture('06-office');
  await page.locator('#po-number').fill('PO-1007');await click('#in-scanner-dialog button[type="submit"]');await page.locator('#receipt-location').selectOption('REC-02');await page.locator('#receipt-quantity').fill('3');await page.locator('#receipt-damaged').fill('1');await click('#in-scanner-dialog button[type="submit"]');
  await poll('Web good and damage receipt',s=>s.hud.inbound.good===3&&s.hud.inbound.damaged===1);check('Office receipt keeps four physical units with three good and one damaged',(await state()).hud.inbound.physicalUnits===4);await capture('07-web-received');
  await click('#in-scanner-dialog > header [data-action="return-floor"]');await poll('Office camera returns',s=>!s.hud.computer.open&&!s.hud.computer.transitioning&&s.hud.inbound.canControl);await locked();
  check('Leaving the office restores the same standing position',ground(atDesk,(await state()).hud.inbound.playerPosition)<.1);await capture('08-office-return');
  check('All three lessons reuse one Unity download',requests.filter(url=>url.includes('OneShiftWeb.loader.js')).length===1&&requests.filter(url=>url.includes('OneShiftWeb.wasm.unityweb')).length===1);
  stage('Lot and expiration-date receiving from physical labels');
  for(const [id,code,quantity,wrong,number]of [['lot','LOT-204',4,'LOT-WRONG','09'],['date','2027-06-30',3,'2027-07-01','10']]){
    await pauseAndChoose(id);await walkTo(-3.9,8.15,'Walk to '+id+' delivery');await mobileSteps();await aimAt(await labelPoint(1));await page.keyboard.press('f');
    await poll('Physical '+id+' scan',s=>s.hud.inbound.lastScan===code&&s.hud.inbound.scannerFeedback==='success');await openDevice();
    check(id+' tracking value comes from the actual barcode',await page.locator('#receipt-core').inputValue()===code);
    check(id+' uses the documented Add Line action',await page.locator('#in-scanner-dialog button[type="submit"]').textContent()==='Add Line');
    await page.locator('#receipt-quantity').fill(String(quantity));await page.locator('#receipt-core').fill(wrong);await click('#in-scanner-dialog button[type="submit"]');
    check(id+' rejects a tracking value that differs from the scanned delivery',(await state()).hud.inbound.good===0&&(await page.locator('#in-feedback').textContent()).includes('exactly as printed'));
    await page.locator('#receipt-core').fill(code);await click('#in-scanner-dialog button[type="submit"]');await poll('Record '+id,s=>s.hud.inbound.good===quantity);
    const received=await state(id+' receipt');check(id+' records exact quantities and tracking on the original units',received.hud.inbound.physicalUnits===quantity&&received.hud.inbound.units.every(unit=>unit.status==='Received'&&unit.core===code));
    await capture(number+'-'+id+'-received');await returnFloor();
  }
  stage('Distinct serial scans and duplicate rejection');await pauseAndChoose('serial');await walkTo(-3.9,8.15,'Walk to serialized units');await mobileSteps();
  await aimAt(await labelPoint(0));await page.keyboard.press('f');await poll('First physical serial receives one unit',s=>s.hud.inbound.good===1&&s.hud.inbound.lastScan==='SN-1001');
  check('A physical serial scan records exactly one of two units',(await state()).hud.inbound.waiting===1&&(await state()).hud.inbound.physicalUnits===2);
  await delay(400);await page.keyboard.press('f');await poll('Repeated serial visibly rejected',s=>s.hud.inbound.scannerFeedback==='error');
  check('Repeating the first serial cannot create a duplicate receipt',(await state()).hud.inbound.good===1&&(await state()).hud.inbound.waiting===1);await capture('11-duplicate-serial');
  await aimAt(await labelPoint(1));await page.keyboard.press('f');await poll('Second physical serial receives the other unit',s=>s.hud.inbound.good===2&&s.hud.inbound.lastScan==='SN-1002');
  check('Two distinct physical serials receive exactly two original units',(await state()).hud.inbound.physicalUnits===2&&(await state()).hud.inbound.units.every(unit=>unit.status==='Received'));
  await openDevice();check('The TC22 records both unique serial numbers',(await page.locator('#in-scanner-dialog .in-receipts').textContent()).includes('SN-1001')&&(await page.locator('#in-scanner-dialog .in-receipts').textContent()).includes('SN-1002'));await capture('12-serial-received');await returnFloor();
  stage('Partial delivery leaves the remaining order open');await pauseAndChoose('partial');await walkTo(-3.9,8.15,'Walk to partial delivery');await mobileSteps();await aimAt(await labelPoint(1));await page.keyboard.press('f');
  await poll('Partial delivery barcode',s=>s.hud.inbound.lastScan==='TAPE-48'&&s.hud.inbound.scannerFeedback==='success');await openDevice();await page.locator('#receipt-quantity').fill('3');await click('#in-scanner-dialog button[type="submit"]');await poll('Three delivered units received',s=>s.hud.inbound.good===3);
  check('Partial receiving never creates the three undelivered units',(await state()).hud.inbound.physicalUnits===3);await click('#in-scanner-dialog [data-action="review-complete"]');
  check('Review shows exactly three units still on order',await page.locator('.in-facts div').filter({hasText:'Still on order'}).locator('dd').textContent()==='3');
  await capture('13-partial-review');await click('#in-scanner-dialog [data-action="cancel-close"]');
  check('Declining completion leaves the partial order Receiving',await page.locator('#in-scanner-dialog .in-status-row strong').textContent()==='Receiving');await returnFloor();
  stage('Explicitly complete the prepared received order');await pauseAndChoose('close');await openDevice();
  check('Prepared order has four recorded units but still requires completion',(await state()).hud.inbound.good===4&&await page.locator('#in-step-title').textContent()==='Review the received order');
  await click('#in-scanner-dialog [data-action="review-complete"]');check('Completion requires a separate explicit confirmation',await page.locator('#in-step-title').textContent()==='Complete this purchase order?');
  await page.locator('#integration-setup').selectOption('yes');await click('#in-scanner-dialog [data-action="confirm-close"]');
  await page.waitForFunction(()=>document.getElementById('in-step-title')?.textContent==='Purchase order completed');
  check('Integrated completion becomes Unassigned while preserving four recorded units',await page.locator('#in-scanner-dialog .in-status-row strong').textContent()==='Unassigned'&&(await state()).hud.inbound.good===4&&(await state()).hud.inbound.physicalUnits===4);await capture('14-close-integrated');await returnFloor();
  check('All eight receiving lessons reuse one Unity download',requests.filter(url=>url.includes('OneShiftWeb.loader.js')).length===1&&requests.filter(url=>url.includes('OneShiftWeb.wasm.unityweb')).length===1);
  const diagnostics=classifyUnityConsole(messages,'INBOUND_BROWSER_READY');check('No gameplay shader failures or browser errors',diagnostics.shaderFailures.length===0&&errors.length===0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,checks,diagnostics,final:await state('Final')},null,2));console.log(checks.length+' receiving browser checks passed. '+output);
})().catch(async error=>{
  console.error(error);errors.push(String(error.stack||error));process.exitCode=1;
  if(page&&!page.isClosed()){await state('Failure').catch(()=>{});await capture('failure').catch(()=>{});}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,phase,checks,errors},null,2));
}).finally(async()=>{
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(observations,null,2));
  if(browser)await browser.close();server.close();
});
