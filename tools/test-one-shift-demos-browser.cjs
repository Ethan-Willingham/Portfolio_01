'use strict';
// Native customer demonstrations. ReportState, ReportWmsState
// and the existing HUD callback only observe state. Never inject scan codes,
// set transforms, spawn cartons, or call gameplay methods through JavaScript.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {classifyUnityConsole} = require('./one-shift-unity-console.cjs');
const root = path.resolve(__dirname, '..');
const demo = process.env.SHIFT_DEMO || 'transfer';
assert.ok(['receive','transfer','pick-ship'].includes(demo),'SHIFT_DEMO is a known scenario');
const output = process.env.SHIFT_WMS_DUMP || path.join(os.tmpdir(), 'one-shift-demo-'+demo);
const keepFailedOpen = process.env.SHIFT_WMS_KEEP_FAILED_OPEN === '1';
const diagnosticPort = Number(process.env.SHIFT_WMS_CDP_PORT || 9229);



fs.mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((request,response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
const checks=[], states=[], messages=[], failures=[], phases=[];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
const angleDelta = (to,from) => ((to-from+540)%360)-180;
const groundDistance = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const distance = (a,b) => Math.hypot(...a.map((value,index)=>value-b[index]));
const bodyAt = (value,id) => value.wms.bodies.find(body=>body.id===id);
const cartonAt = (value,id) => value.wms.state.cartons.find(carton=>carton.id===id);
const orderAt = (value,id) => [...value.wms.state.purchaseOrders,...value.wms.state.salesOrders].find(order=>order.id===id);
const orderCount = (order,field) => order.lines.reduce((sum,line)=>sum+line[field],0);
const onHand = value => value.wms.state.items.reduce((sum,item)=>sum+item.onHand,0);
const ledgerFingerprint = value => JSON.stringify({cartons:value.wms.state.cartons.map(c=>[c.id,c.binId,c.status,c.poId,c.soId]),
  po:value.wms.state.purchaseOrders,so:value.wms.state.salesOrders,transactions:value.wms.state.transactions,cash:value.wms.state.cash});
let browser,page,currentStage='Preparing native WMS test',mouseX=600,mouseY=400,degreesPerPixel=.18,finalState;
function check(label,condition) { assert.ok(condition,label);checks.push(label);console.log('PASS '+label); }
function stage(label) { currentStage=label;phases.push({label,at:Date.now()});console.log('STAGE '+label); }

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:process.env.SHIFT_WMS_HEADED!=='1',channel:process.env.SHIFT_BROWSER_CHANNEL||'chrome',
    args:['--enable-gpu',...(process.platform==='win32'?['--use-angle=d3d11']:[]),...(keepFailedOpen?['--remote-debugging-port='+diagnosticPort]:[])]});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page=await context.newPage();
  let firstWorldReport=false;
  page.on('console',message=>{
    const text=message.text();
    if(text.includes('ONE_SHIFT_STATE ')){if(!firstWorldReport){firstWorldReport=true;messages.push({type:message.type(),text});}return;}
    if(!text.includes('WAREHOUSE_WMS ')&&!text.includes('WAREHOUSE_WMS_PART '))messages.push({type:message.type(),text});
  });
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failures.push(response.status()+' '+response.url());});
  await page.addInitScript(()=>{
    document.addEventListener('load',event=>{
      if(event.target.tagName!=='SCRIPT'||!event.target.src.includes('OneShiftWeb.loader.js'))return;
      const factory=window.createUnityInstance;if(typeof factory!=='function')return;
      window.createUnityInstance=function(...args){
        const report=args[1].onWarehouseHUD;
        args[1].onWarehouseHUD=function(payload){window.warehouseObservedHUD=typeof payload==='string'?JSON.parse(payload):payload;return report.apply(this,arguments);};
        return factory.apply(this,args).then(instance=>{window.actualUnity=instance;return instance;});
      };
    },true);
  });
  async function report(method,prefix){
    if(method==='ReportWmsState'){
      // Unity WebGL truncates individual console records at roughly 8 KB.
      // Diagnostics arrive as numbered chunks; capture every line before the
      // synchronous SendMessage call so none of a multi-line report is lost.
      let collect,timer;const chunks=new Map();
      const response=new Promise((resolve,reject)=>{
        timer=setTimeout(()=>{page.off('console',collect);reject(new Error('Chunked WMS observation timed out after '+chunks.size+' chunks'));},15000);
        collect=message=>{
          const line=message.text(),part=line.match(/WAREHOUSE_WMS_PART (\d+)\/(\d+) ([\s\S]*)/);
          try{
            if(part){
              const index=Number(part[1]),count=Number(part[2]);chunks.set(index,part[3].replace(/\r?\n$/,''));
              if(chunks.size!==count)return;
              const offset=chunks.has(0)?0:1,serialized=Array.from({length:count},(_,i)=>chunks.get(i+offset)).join('');
              const value=JSON.parse(serialized);clearTimeout(timer);page.off('console',collect);resolve(value);
            }else if(line.includes(prefix)){
              const value=JSON.parse(line.slice(line.indexOf(prefix)+prefix.length).trim());clearTimeout(timer);page.off('console',collect);resolve(value);
            }
          }catch(error){clearTimeout(timer);page.off('console',collect);reject(error);}
        };page.on('console',collect);
      });
      await page.evaluate(method=>actualUnity.SendMessage('BrowserLifecycle',method,''),method);return response;
    }
    const emitted=page.waitForEvent('console',{predicate:message=>message.text().includes(prefix),timeout:15000});
    await page.evaluate(method=>actualUnity.SendMessage('BrowserLifecycle',method,''),method);
    const line=(await emitted).text();return JSON.parse(line.slice(line.indexOf(prefix)+prefix.length).trim());
  }
  async function state(label){
    const world=await report('ReportState','ONE_SHIFT_STATE '),wms=await report('ReportWmsState','WAREHOUSE_WMS ');
    const value={...world,wms};
    // Barcode geometry is observed on every read for native aiming, but need
    // not be duplicated thousands of times in the retained diagnostic log.
    states.push({label:label||'',at:Date.now(),...world,wms:label?wms:{conserves:wms.conserves,invariantReason:wms.invariantReason,
      cameraPosition:wms.cameraPosition,cameraRotation:wms.cameraRotation,heldCarton:wms.heldCarton,holdDistance:wms.holdDistance,
      courierState:wms.courierState,revision:wms.state.revision,workflow:wms.state.workflow,scan:wms.state.scan,message:wms.state.message}});
    fs.writeFileSync(path.join(output,'latest-state.json'),JSON.stringify(value,null,2));
    if(label)console.log(label+' '+JSON.stringify({position:value.playerPosition,yaw:value.playerYaw,camera:wms.cameraRotation,
      holding:wms.heldCarton,onHand:onHand(value),workflow:wms.state.workflow,scan:wms.state.scan,message:wms.state.message}));
    return value;
  }
  async function poll(label,predicate,timeout=20000,interval=110){
    let current;const deadline=Date.now()+timeout;
    do{current=await state();if(predicate(current))return current;await delay(interval);}while(Date.now()<deadline);
    throw new Error(label+' timed out: '+JSON.stringify({position:current?.playerPosition,holding:current?.wms.heldCarton,
      workflow:current?.wms.state.workflow,scan:current?.wms.state.scan,message:current?.wms.state.message,courier:current?.wms.courierState}));
  }
  async function capture(name){const box=await page.locator('#warehouse-canvas').boundingBox();await page.screenshot({path:path.join(output,name+'.png'),clip:box,scale:'css',timeout:60000});}
  async function click(locator){const rect=await locator.boundingBox();await locator.click();if(rect){mouseX=rect.x+rect.width/2;mouseY=rect.y+rect.height/2;}await delay(140);}
  async function pointerOwned(){return page.evaluate(()=>document.pointerLockElement?.id==='warehouse-canvas');}
  async function use(label,predicate){
    const before=await state();await page.keyboard.down('e');
    try{await poll(label,value=>value.frameCount>=before.frameCount+2&&predicate(value));}finally{await page.keyboard.up('e');}
    await delay(110);return state(label);
  }
  async function relativeMouse(dx,dy){mouseX+=dx;mouseY+=dy;await page.mouse.move(mouseX,mouseY);await delay(100);}
  async function yawTo(target){
    for(let pass=0;pass<9;pass++){
      const current=await state(),error=angleDelta(target,current.playerYaw);if(Math.abs(error)<.35)return;
      const pixels=Math.max(-500,Math.min(500,error/degreesPerPixel)),parts=Math.max(1,Math.ceil(Math.abs(pixels)/80));
      for(let i=0;i<parts;i++)await relativeMouse(pixels/parts,0);
    }
    assert.ok(Math.abs(angleDelta(target,(await state()).playerYaw))<.7,'Native mouse reaches target yaw '+target);
  }
  async function pitchTo(target){
    for(let pass=0;pass<9;pass++){
      const current=await state(),error=target-angleDelta(current.wms.cameraRotation[0],0);if(Math.abs(error)<.25)return;
      const pixels=Math.max(-350,Math.min(350,error/degreesPerPixel)),parts=Math.max(1,Math.ceil(Math.abs(pixels)/70));
      for(let i=0;i<parts;i++)await relativeMouse(0,pixels/parts);
    }
    assert.ok(Math.abs(target-angleDelta((await state()).wms.cameraRotation[0],0))<.65,'Native mouse reaches target pitch '+target);
  }
  async function aimAt(point){
    const camera=(await state()).wms.cameraPosition;
    await yawTo(Math.atan2(point[0]-camera[0],point[2]-camera[2])*180/Math.PI);
    await pitchTo(Math.atan2(camera[1]-point[1],groundDistance(camera,point))*180/Math.PI);await delay(120);
  }
  async function walkTo(x,z,label,tolerance=.18){
    let previous=await state(),stuck=0;const held=previous.wms.heldCarton;
    await pitchTo(held?8:0);const goal=[x,0,z],deadline=Date.now()+40000;
    while(groundDistance(previous.playerPosition,goal)>tolerance&&Date.now()<deadline){
      const p=previous.playerPosition,remaining=groundDistance(p,goal);
      await yawTo(Math.atan2(x-p[0],z-p[2])*180/Math.PI);await page.keyboard.down('w');
      try{await delay(Math.max(40,Math.min(280,(remaining-tolerance*.5)/2.8*1000)));}finally{await page.keyboard.up('w');}
      await delay(70);const current=await state();
      if(held)assert.equal(current.wms.heldCarton,held,label+' keeps the same physical carton');
      if(groundDistance(current.playerPosition,previous.playerPosition)<.025)stuck++;else stuck=0;
      assert.ok(stuck<7,label+' blocked at '+JSON.stringify(current.playerPosition));previous=current;
    }
    check(label,groundDistance(previous.playerPosition,goal)<=tolerance+.05);return state(label);
  }
  async function chooseTask(tile,order){
    if(!await page.locator('#warehouse-wms-handheld').evaluate(el=>el.classList.contains('is-interactive'))){await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});}
    await page.waitForSelector('#warehouse-wms-handheld.is-interactive');
    const home=page.locator('[data-device-home]');if(await home.isVisible())await click(home);
    await click(page.locator('[data-wms-tile="'+tile+'"]'));await poll('Choose '+tile,s=>s.wms.state.workflow.tile===tile);
    if(order){await click(page.locator('.wms-device-order').filter({hasText:order}));await poll('Choose '+order,s=>s.wms.state.workflow.orderId===order);}
    await capture('task-'+tile);
    await click(page.locator('[data-device-floor]'));await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(350);
  }
  async function scanLabel(code,label){
    const current=await state(),eye=current.wms.cameraPosition;
    const candidates=current.wms.labels.filter(l=>l.code===code).map(l=>{const d=distance(eye,l.point);return {...l,d,facing:l.normal.reduce((sum,n,i)=>sum+n*(eye[i]-l.point[i])/d,0)};}).filter(l=>l.d<4.2&&l.facing>.4).sort((a,b)=>b.facing-a.facing||a.d-b.d);
    assert.ok(candidates.length,label+' has a reachable visible label');let decoded;
    for(const candidate of candidates){
      await aimAt(candidate.point);await delay(240);const before=await state();await page.mouse.down();
      try{
        await delay(700);decoded=await state();
        if(decoded.wms.state.scan.code===code&&decoded.wms.state.scan.sequence>before.wms.state.scan.sequence){
          check(label+' holds the red aimer on the real surface',decoded.wms.scannerTrigger&&decoded.wms.scannerAimVisible&&decoded.wms.scannerAimSurface);
          check(label+' projects a flat stripe and shows visible acceptance',decoded.wms.scannerLineSegments>0&&decoded.wms.scannerFeedback==='success');
          const sequence=decoded.wms.state.scan.sequence;await delay(350);const continued=await state();
          check(label+' decodes once per held target',continued.wms.scannerAimVisible&&continued.wms.state.scan.sequence===sequence&&sequence===before.wms.state.scan.sequence+1);
          if(!laserCaptured){await capture('held-red-aimer');laserCaptured=true;}break;
        }
      }finally{await page.mouse.up();}
      await delay(250);
    }
    await delay(200);const released=await state();
    check(label+' reads '+code,decoded?.wms.state.scan.code===code&&decoded.wms.state.scan.status==='success');
    check(label+' releases the trigger',!released.wms.scannerTrigger);return released;
  }
  async function setDistance(target){
    target=Math.max(1.05,Math.min(2.35,target));let current=await state();
    for(let i=0;i<15&&Math.abs(current.wms.holdDistance-target)>.11;i++){
      await page.mouse.wheel(0,current.wms.holdDistance>target?120:-120);await delay(100);current=await state();
    }
    assert.ok(Math.abs(current.wms.holdDistance-target)<.24,'Wheel approaches requested carry distance');
  }
  async function pick(id){
    const current=await state();await aimAt(bodyAt(current,id).position);await page.keyboard.down('e');
    await poll('Hold E picks up '+id,s=>s.wms.heldCarton===id);await pitchTo(12);await setDistance(1.1);await delay(250);
    check('Same physical carton is held',(await state()).wms.heldCarton===id);
  }
  async function approachRack(binId){
    const current=await state(),label=current.wms.labels.find(l=>l.code==='BIN:'+binId);
    await walkTo(label.point[0]+label.normal[0]*1.1,label.point[2]+label.normal[2]*1.1,'Approach '+binId,.12);
  }
  async function place(id,binId,offset=[0,0]){
    let current=await state();const bin=current.wms.bins.find(b=>b.id===binId),body=bodyAt(current,id);
    const target=[bin.center[0]+offset[0],bin.surfaceY+body.size[1]/2+.04,bin.center[2]+offset[1]];
    const high=[target[0],target[1]+.65,target[2]];
    await aimAt(high);await setDistance(distance((await state()).wms.cameraPosition,high));await delay(700);
    await aimAt(target);await setDistance(distance((await state()).wms.cameraPosition,target));await delay(650);
    await page.keyboard.up('e');await poll('Release '+id,s=>!s.wms.heldCarton);
    const settled=await poll('Supported placement of '+id+' in '+binId,s=>cartonAt(s,id)?.physicalBin===binId&&Math.hypot(...bodyAt(s,id).velocity)<.18,15000,180);
    check('Physical placement agrees with '+binId,settled.wms.conserves);return settled;
  }
  async function confirm(label,predicate){
    await page.keyboard.press('Enter');const current=await poll(label,predicate,15000);
    check(label,current.wms.conserves);return current;
  }
  async function receive(){
    stage('Receive two prepared cartons');await chooseTask('receive','PO-1001');await scanLabel('BIN:REC-02','Receiving bin');
    const ids=(await state()).wms.state.cartons.map(c=>c.id);
    for(const id of ids){await scanLabel('CARTON:'+id,'Expected carton '+id);await confirm('Receive '+id,s=>cartonAt(s,id).status==='Available');}
    check('Receipt alone does not complete putaway',!(await state()).wms.state.demo.complete);await capture('receipts-posted');
    for(let i=0;i<ids.length;i++){
      const id=ids[i],destination=i===0?'C03-01-01':'C03-01-02';stage('Put away '+id);
      if(i){await walkTo(-.6,8.3,'Return around north end of row C');await walkTo(-3.9,8.3,'Return to receiving');}
      await chooseTask('transfer');await scanLabel('BIN:REC-02','Putaway source');await scanLabel('CARTON:'+id,'Putaway carton');await pick(id);
      await walkTo(-3.9,8.3,'Clear the receiving stock');await walkTo(-.6,8.3,'Carry around row C');await approachRack(destination);
      await place(id,destination);await scanLabel('BIN:'+destination,'Putaway destination');await confirm('Post putaway '+id,s=>cartonAt(s,id).binId===destination);
    }
    const final=await state();check('Two cartons received and available in rack storage',onHand(final)===2&&final.wms.state.demo.received===2&&final.wms.state.demo.transferred===2);
  }
  async function transfer(){
    stage('Transfer the prepared pick-face carton');const id=(await state()).wms.state.cartons[0].id;
    await chooseTask('transfer');
    await pitchTo(-75);const emptyBefore=await state();await page.mouse.down();await delay(1150);
    const empty=await state();check('Empty hold shows a visible no-read result',empty.wms.scannerFeedback==='error'&&empty.wms.state.scan.sequence===emptyBefore.wms.state.scan.sequence+1);
    await delay(350);check('Empty hold reports once without changing stock',(await state()).wms.state.scan.sequence===empty.wms.state.scan.sequence&&ledgerFingerprint(await state())===ledgerFingerprint(emptyBefore));
    await capture('device-no-read');await page.mouse.up();await pitchTo(0);
    const wrongState=await state(),wrongLabel=wrongState.wms.labels.filter(l=>l.code==='CARTON:'+id).sort((a,b)=>distance(wrongState.wms.cameraPosition,a.point)-distance(wrongState.wms.cameraPosition,b.point))[0];
    await aimAt(wrongLabel.point);await page.mouse.down();await delay(700);const wrong=await state();
    check('Wrong workflow scan is visibly rejected without moving inventory',wrong.wms.scannerFeedback==='error'&&wrong.wms.state.workflow.step==='source'&&ledgerFingerprint(wrong)===ledgerFingerprint(wrongState));
    await capture('device-rejected');await page.mouse.up();
    await scanLabel('BIN:C01-01-01','Transfer source');await scanLabel('CARTON:'+id,'Transfer carton');await pick(id);
    await approachRack('C01-01-02');await place(id,'C01-01-02');await scanLabel('BIN:C01-01-02','Transfer destination');
    await confirm('Post the transfer',s=>cartonAt(s,id).binId==='C01-01-02');
    check('Transfer preserves the one-carton quantity',onHand(await state())===1);
  }
  async function pickShip(){
    stage('Pick the prepared customer order');const id=(await state()).wms.state.cartons[0].id;
    await page.mouse.down();await delay(250);check('Held trigger starts aiming',(await state()).wms.scannerTrigger);
    await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
    await page.waitForSelector('#warehouse-wms-handheld.is-interactive');
    check('Right click cancels a held scan and inspects the screen',!(await state()).wms.scannerTrigger);
    await page.mouse.up();
    await chooseTask('pick','SO-2001');await scanLabel('BIN:C03-01-01','Pick source');await scanLabel('CARTON:'+id,'Allocated carton');await pick(id);
    await walkTo(.65,8.3,'Carry north along central aisle');await walkTo(3.9,8.3,'Pass the north ends of the racks');await place(id,'STAGE-01');
    await scanLabel('BIN:STAGE-01','Pick destination');await confirm('Confirm physical staging',s=>cartonAt(s,id).status==='Picked');
    check('Staging books collection without payment',(await state()).wms.state.cash===0);await capture('pick-complete-awaiting-carrier');
    await poll('Actual collection van parks and opens',s=>s.wms.courierState==='WaitingForLoading',180000,350);
    await chooseTask('ship','SO-2001');await scanLabel('BIN:STAGE-01','Ship source');await scanLabel('CARTON:'+id,'Shipping carton');await pick(id);
    await walkTo(.65,8.3,'Clear the rack end with shipment');await walkTo(.65,-2.5,'Carry down the central aisle');await walkTo(5.37,-2.5,'Line up clear of the office wall');
    await walkTo(5.37,-4.8,'Carry through office doorway');await walkTo(5.37,-7,'Pass the workstation');await walkTo(6.5,-8,'Line up with open front door');
    await walkTo(6.5,-11.3,'Carry onto front porch');await walkTo(6.5,-22.65,'Follow the pedestrian ramp');await walkTo(3,-22.65,'Pass beside waiting driver');
    await walkTo(3,-23.3,'Reach collection ramp');await walkTo(3,-26,'Carry onto van deck');await place(id,'DISPATCH-01',[-.35,-.5]);
    await walkTo(3,-23.3,'Step back to read carrier label');await scanLabel('BIN:DISPATCH-01','Carrier destination');await confirm('Confirm the manifest load',s=>cartonAt(s,id).status==='Loaded');
    check('Loaded carton does not complete shipment early',!(await state()).wms.state.demo.complete&&(await state()).wms.state.cash===0);
    await walkTo(3,-22.65,'Clear loading ramp');await walkTo(6.5,-22.65,'Stand clear of departure route');
    await confirm('Authorize actual carrier departure',s=>s.wms.state.workflow.step==='departing');
    const shipped=await poll('Actual offsite departure completes customer order',s=>orderAt(s,'SO-2001').status==='Shipped',180000,350);
    check('One shipment posts one offsite payment',shipped.wms.state.cash===70&&onHand(shipped)===0&&shipped.wms.state.demo.shipped===1&&!bodyAt(shipped,id));
  }

  stage('Boot the '+demo+' customer walkthrough');
  const dialogs=[];let laserCaptured=false;page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  const url=new URL(process.env.SHIFT_TEST_URL||'http://127.0.0.1:'+server.address().port+'/one-shift.html');url.searchParams.set('mode','demo');url.searchParams.set('demo',demo);
  await page.goto(url.href);await click(page.locator('#warehouse-demo-launch'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await click(page.locator('#warehouse-canvas'));await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(500);
  let opening=await state('Opening');
  check('Compiled v13 opens the selected fresh demo',opening.buildVersion===13&&opening.wms.state.mode==='demo'&&opening.wms.state.demo.id===demo&&opening.wms.conserves);
  check('Customer walkthrough starts in daylight',opening.hour>=9&&opening.hour<9.5);
  check('Completion is initially hidden',!opening.wms.state.demo.complete&&!await page.locator('#warehouse-demo-complete').isVisible());
  await capture('demo-opening');const before=await state();await relativeMouse(60,0);const after=await state();degreesPerPixel=angleDelta(after.playerYaw,before.playerYaw)/60;
  check('Native mouse controls the actual camera',degreesPerPixel>.02&&degreesPerPixel<3);
  if(demo==='receive')await receive();else if(demo==='pick-ship')await pickShip();else await transfer();
  finalState=await poll('Guide verifies actual scenario completion',s=>s.wms.state.demo.complete);
  await page.waitForSelector('#warehouse-demo-complete',{state:'visible'});await capture('verified-demo-completion');
  check('Completion dialog follows actual posted work',finalState.wms.state.demo.completed===finalState.wms.state.demo.total&&finalState.wms.conserves);
  const diagnostics=classifyUnityConsole(messages);check('No active shader failures or browser errors',diagnostics.shaderFailures.length===0&&failures.length===0&&dialogs.length===0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,demo,checks,diagnostics,dialogs,final:finalState},null,2));
  console.log(checks.length+' native '+demo+' checks passed. '+output);
})().catch(async error=>{
  console.error(error);failures.push(String(error.stack||error));process.exitCode=1;
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,demo,stage:currentStage,checks,failures},null,2));
}).finally(async()=>{
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(states,null,2));
  if(process.exitCode&&keepFailedOpen){console.log('Browser preserved for read-only diagnosis and native input at http://127.0.0.1:'+diagnosticPort);return;}
  if(browser)await browser.close();server.close();
});
