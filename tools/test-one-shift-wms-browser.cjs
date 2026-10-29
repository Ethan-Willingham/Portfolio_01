'use strict';
// Native input against the compiled Unity player. ReportState, ReportWmsState
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
const output = process.env.SHIFT_WMS_DUMP || path.join(os.tmpdir(), 'one-shift-wms-browser');
const keepFailedOpen = process.env.SHIFT_WMS_KEEP_FAILED_OPEN === '1';
const diagnosticPort = Number(process.env.SHIFT_WMS_CDP_PORT || 9229);
const includePick = process.env.SHIFT_WMS_PICK !== '0';
const fullCycle = process.env.SHIFT_WMS_FULL === '1';
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
  async function openDevice(){
    const device=page.locator('#warehouse-wms-handheld');
    if(!await device.isVisible()||!await device.evaluate(el=>el.classList.contains('is-interactive')))await page.keyboard.press('q');
    await page.waitForFunction(()=>document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive'));
    await poll('Device selection pauses physical simulation',value=>value.timeScale===0);await delay(120);
  }
  async function chooseTask(tile,order){
    await openDevice();const home=page.locator('[data-device-home]');if(await home.isVisible())await click(home);
    await click(page.locator('[data-wms-tile="'+tile+'"]'));
    await poll('Choose '+tile+' workflow',value=>value.wms.state.workflow.tile===tile);
    if(order){await click(page.locator('.wms-device-order').filter({hasText:order}));await poll('Choose '+order,value=>value.wms.state.workflow.orderId===order);}
    await click(page.locator('[data-device-floor]'));
    await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');
    await poll('Resume physical scanning',value=>value.timeScale>0&&!value.browserSuspended);await delay(250);
  }
  async function scanLabel(code,label,accept=true){
    const current=await state(),camera=current.wms.cameraPosition;
    const candidates=current.wms.labels.filter(item=>item.code===code).map(item=>{
      const d=distance(camera,item.point),facing=item.normal.reduce((sum,n,index)=>sum+n*(camera[index]-item.point[index])/d,0);
      return {...item,d,facing};
    }).filter(item=>item.d<4.2&&item.facing>.4).sort((a,b)=>b.facing-a.facing||a.d-b.d);
    assert.ok(candidates.length,label+' has a physically reachable front-facing label');
    let result;
    for(const candidate of candidates){
      await aimAt(candidate.point);await delay(240);const before=await state();await page.keyboard.press('f');
      result=await poll(label,value=>value.wms.state.scan.sequence>before.wms.state.scan.sequence,5000);
      if(result.wms.state.scan.code===code)break;
    }
    check(label+' decodes the printed '+code,result.wms.state.scan.code===code);
    check(label+(accept?' is accepted':' is rejected'),result.wms.state.scan.status===(accept?'success':'error'));
    return state(label);
  }
  async function confirm(label,predicate){
    await page.keyboard.press('Enter');const value=await poll(label,predicate,12000);check(label,value.wms.conserves);return value;
  }
  async function setCarryDistance(target){
    let current=await state();assert.ok(current.wms.heldCarton,'Mouse-wheel carry distance requires a real held body');
    for(let i=0;i<16&&Math.abs(current.wms.holdDistance-target)>.12;i++){
      await page.mouse.wheel(0,current.wms.holdDistance>target?120:-120);await delay(100);current=await state();
    }
    assert.ok(Math.abs(current.wms.holdDistance-target)<.3,'Native wheel reaches '+target+'m carry distance');
  }
  async function pickCarton(id){
    const value=await state(),body=bodyAt(value,id);assert.ok(body&&!body.kinematic,'Carton exists as a movable rigidbody');
    await aimAt(body.position);await use('Pick up '+id,value=>value.wms.heldCarton===id);await setCarryDistance(1.05);
    check('The player carries the actual '+id,(await state()).wms.heldCarton===id);
  }
  async function putCarton(id,point,bin){
    await aimAt(point);await setCarryDistance(2.35);await delay(350);
    await use('Release '+id,value=>!value.wms.heldCarton);
    const settled=await poll('Carton '+id+' settles inside '+bin,value=>{
      const body=bodyAt(value,id),carton=cartonAt(value,id);
      return body&&Math.hypot(...body.velocity)<.15&&!value.wms.heldCarton&&carton.physicalBin===bin;
    },12000);
    check('The released carton is physically supported inside '+bin,cartonAt(settled,id).physicalBin===bin&&settled.wms.conserves);
  }
  async function openComputer(){
    await aimAt([9.8,1.22,-8.908]);await page.waitForFunction(()=>document.getElementById('warehouse-hint').textContent==='Use warehouse computer');
    await page.keyboard.press('e');await page.waitForSelector('#warehouse-computer',{state:'visible',timeout:10000});
    await poll('Office computer pauses the warehouse',value=>value.computerOpen&&value.timeScale===0);
    await page.waitForSelector('#warehouse-wms-console',{state:'visible'});await delay(300);
  }
  async function closeComputer(){
    await click(page.locator('#warehouse-computer-close'));await page.waitForSelector('#warehouse-computer',{state:'hidden'});
    await poll('Return from the office monitor',value=>!value.computerOpen&&!value.browserSuspended&&value.timeScale>0);
    await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(250);
  }

  stage('Load the actual Sandbox player');
  await page.goto(process.env.SHIFT_TEST_URL||'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  check('Unity remains click-to-load',!await page.evaluate(()=>!!window.actualUnity));
  await click(page.locator('#warehouse-sandbox'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await page.bringToFront();await click(page.locator('#warehouse-canvas'));
  await poll('Sandbox renders physical frames',value=>value.frameCount>30&&!value.browserSuspended&&value.timeScale>0);
  if(!await pointerOwned())await click(page.locator('#warehouse-canvas'));
  await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(250);
  await page.evaluate(()=>{
    const probe=window.wmsPerformance={startedAt:Date.now(),activeFrames:0,maxActiveFrameGapMs:0,frameGaps:[],longTasks:[],stopped:false};
    probe.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())probe.longTasks.push({at:performance.timeOrigin+entry.startTime,duration:entry.duration});});
    probe.observer.observe({type:'longtask',buffered:false});let previous=performance.now(),previousActive=false;
    function frame(now){
      if(probe.stopped)return;
      const active=document.getElementById('warehouse-stage').dataset.browserActive!=='false'&&!document.getElementById('warehouse-computer').open&&
        !document.getElementById('warehouse-menu').open&&!document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive');
      if(active&&previousActive){const ms=now-previous;probe.activeFrames++;probe.maxActiveFrameGapMs=Math.max(probe.maxActiveFrameGapMs,ms);if(ms>50)probe.frameGaps.push({at:performance.timeOrigin+now,ms});}
      previous=now;previousActive=active;probe.raf=requestAnimationFrame(frame);
    }probe.raf=requestAnimationFrame(frame);
  });
  const initial=await state('INITIAL');
  check('Version 10 loads the WMS Sandbox',initial.buildVersion>=10&&initial.wms.state.mode==='sandbox');
  check('Sandbox starts with 100 physical stock cartons and two unreceived cartons',onHand(initial)===100&&initial.wms.bodies.length===102&&initial.wms.state.cartons.filter(c=>c.status==='Expected').length===2);
  check('Every rack slot and working area is one of 61 warehouse bins',initial.wms.state.bins.length===61&&initial.wms.state.bins.filter(b=>/^[ABC]\d\d-\d\d-\d\d$/.test(b.id)).length===54);
  check('Opening WMS stock conserves exactly',initial.wms.conserves);
  check('Physical carton and bin barcode faces exist',initial.wms.labels.some(label=>label.code==='BIN:F02')&&initial.wms.labels.filter(label=>label.code.startsWith('CARTON:')).length>=204);
  const calibrationBefore=await state();await relativeMouse(80,0);const calibrationAfter=await state();
  degreesPerPixel=angleDelta(calibrationAfter.playerYaw,calibrationBefore.playerYaw)/80;
  check('Native mouse input controls the compiled camera',Number.isFinite(degreesPerPixel)&&degreesPerPixel>.02&&degreesPerPixel<3);
  await capture('sandbox-populated');

  stage('TC22 physical barcode lookup and negative scan');
  await openDevice();check('The TC22 exposes five working application tiles',await page.locator('[data-wms-tile]').count()===5);
  await capture('tc22-application-home');await chooseTask('lookup');
  await walkTo(-.8,-3.6,'Approach the floor-stock barcode from the front cross aisle');
  const beforeLookup=await state();await scanLabel('BIN:F02','Read the real F02 bin label');
  check('A lookup leaves every stock and document quantity unchanged',ledgerFingerprint(await state())===ledgerFingerprint(beforeLookup));
  await capture('tc22-bin-lookup');
  const lookupCarton=beforeLookup.wms.state.cartons.find(carton=>carton.binId==='F02');
  await scanLabel('CARTON:'+lookupCarton.id,'Look up a physical carton handling label');
  check('Carton lookup shows the correct item and recorded bin',(await page.locator('#warehouse-wms-device-body').innerText()).includes('Shop towels')&&(await page.locator('#warehouse-wms-device-body').innerText()).includes('F02'));
  await walkTo(1,-3.6,'Face the product barcode from the clear cross aisle');await scanLabel('ITEM:towels','Look up a printed item barcode');
  check('Item lookup displays catalog stock without moving inventory',ledgerFingerprint(await state())===ledgerFingerprint(beforeLookup)&&(await page.locator('#warehouse-wms-device-body').innerText()).includes('Shop towels'));
  await capture('tc22-item-lookup');await walkTo(-.8,-3.6,'Return to the F02 location label');
  await aimAt([-.8,4,-9.8]);await delay(250);const beforeMiss=await state();await page.keyboard.press('f');
  const missed=await poll('Scanning a blank wall returns no decoded code',value=>value.wms.state.scan.sequence>beforeMiss.wms.state.scan.sequence);
  check('A scan requires the actual visible barcode face',missed.wms.state.scan.status==='error'&&!missed.wms.state.scan.code&&ledgerFingerprint(missed)===ledgerFingerprint(beforeMiss));

  stage('Scan and physically transfer one carton');
  await chooseTask('transfer');await scanLabel('BIN:F02','Transfer source bin');
  const source=await state(),target=source.wms.state.cartons.filter(c=>c.binId==='F02'&&c.status==='Available')
    .sort((a,b)=>distance(bodyAt(source,a.id).position,source.wms.cameraPosition)-distance(bodyAt(source,b.id).position,source.wms.cameraPosition))[0];
  assert.ok(target,'F02 contains a real available source carton');
  await scanLabel('CARTON:'+target.id,'Transfer carton');
  // Scan the destination before carrying; the next confirmation must still
  // reject the move until the exact body has been released inside that bin.
  await walkTo(-3.6,-3.6,'Read the destination across the clear front aisle');await scanLabel('BIN:F01','Transfer destination bin');
  const beforePremature=await state();await page.keyboard.press('Enter');await delay(200);const premature=await state();
  check('Scanning alone cannot transfer stock',cartonAt(premature,target.id).binId==='F02'&&ledgerFingerprint(premature)===ledgerFingerprint(beforePremature));
  await walkTo(bodyAt(source,target.id).position[0],-3.6,'Return to the scanned source carton');await pickCarton(target.id);
  await walkTo(.6,-3.6,'Carry around the floor stock');await walkTo(.6,.25,'Pass between the floor bins');
  await walkTo(-3.1,.25,'Carry to the open side of F01');await putCarton(target.id,[-3.1,.22,-1.3],'F01');
  check('Physical movement is still pending in the ledger',cartonAt(await state(),target.id).binId==='F02');
  const transferred=await confirm('Confirm exactly one physical bin transfer',value=>cartonAt(value,target.id).binId==='F01');
  check('The confirmed transfer changes only one carton location and preserves on-hand',onHand(transferred)===100&&transferred.wms.state.transactions.filter(t=>t.cartonId===target.id&&t.fromBin==='F02'&&t.toBin==='F01').length===1);
  await page.keyboard.press('Enter');await delay(250);const repeated=await state();
  check('Repeated confirmation does not duplicate a transfer',ledgerFingerprint(repeated)===ledgerFingerprint(transferred));
  await capture('tc22-transfer-confirmed');

  stage('Receive two real cartons against a partial purchase order');
  await chooseTask('receive','PO-1001');
  await walkTo(0,.25,'Reach the central warehouse aisle');await walkTo(0,8,'Walk toward the interior receiving area');
  await walkTo(-2.5,8,'Stand beside the clear eastern edge of REC-02');await scanLabel('BIN:REC-02','Receive source bin');
  const beforeWrongReceive=await state();await scanLabel('BIN:REC-02','Reject a location barcode when a carton is required',false);
  check('The wrong receiving scan changes no stock or document quantities',ledgerFingerprint(await state())===ledgerFingerprint(beforeWrongReceive));
  const receiptStart=await state(),expected=receiptStart.wms.state.cartons.filter(c=>c.poId==='PO-1001'&&c.status==='Expected');
  check('The seed delivery is two real cartons on a four-carton PO',expected.length===2&&orderCount(orderAt(receiptStart,'PO-1001'),'ordered')===4&&orderCount(orderAt(receiptStart,'PO-1001'),'received')===0);
  for(let index=0;index<expected.length;index++){
    const carton=expected[index];await scanLabel('CARTON:'+carton.id,'Receive '+carton.id);
    await confirm('Post receipt '+(index+1)+' of 2',value=>cartonAt(value,carton.id).status==='Available'&&cartonAt(value,carton.id).binId==='REC-02');
    const beforeDuplicate=await state();await scanLabel('CARTON:'+carton.id,'Reject duplicate receipt '+carton.id,false);
    check('A duplicate carton scan cannot increase received quantity',ledgerFingerprint(await state())===ledgerFingerprint(beforeDuplicate));
  }
  const received=await state('PARTIAL PO');
  check('PO-1001 remains open with exactly 2 of 4 CTN received',orderCount(orderAt(received,'PO-1001'),'received')===2&&orderAt(received,'PO-1001').status!=='Received'&&onHand(received)===102&&received.wms.conserves);
  await capture('tc22-partial-receipt');

  stage('Review the live office WMS and release a sales order');
  await walkTo(0,8,'Return to the center aisle');await walkTo(0,-3.6,'Return down the central cross aisle');
  await walkTo(5.37,-3.6,'Cross to the office doorway');await walkTo(5.37,-4.8,'Pass the internal office door');
  await walkTo(5.37,-7,'Walk beside the office desk');await walkTo(9.8,-7.3,'Approach the manager computer');await openComputer();
  check('The physical office opens the live Warehouse Management console',await page.locator('#warehouse-wms-console').isVisible());
  await capture('wms-manager-operations');
  await click(page.locator('[data-wms-page="inventory"]'));
  check('The manager inventory exposes quantities with their units',(await page.locator('#warehouse-wms-console').innerText()).includes('Allocated')&&(await page.locator('#warehouse-wms-console').innerText()).includes('CTN'));
  await capture('wms-manager-inventory');await click(page.locator('[data-wms-page="bins"]'));
  check('The manager console includes storage, receiving, staging and dispatch bins',['F01','REC-02','STAGE-01','DISPATCH-01'].every(id=>received.wms.state.bins.some(bin=>bin.id===id))&&await page.locator('.wms-table tbody tr').count()===61);
  await click(page.locator('[data-wms-page="purchaseOrders"]'));await click(page.locator('.wms-link').filter({hasText:/^PO-1001$/}));
  check('The manager PO line table reflects both floor receipts',(await page.locator('#warehouse-wms-console').innerText()).includes('Outstanding')&&await page.locator('.wms-table').first().locator('tbody tr').count()===2);
  await capture('wms-manager-partial-po');await click(page.locator('[data-wms-page="salesOrders"]'));
  await click(page.locator('.wms-link').filter({hasText:/^SO-2001$/}));
  check('Shipping is disabled before stock has been picked',await page.getByRole('button',{name:'Ship on handheld',exact:true}).isDisabled());
  const beforeRelease=await state();await click(page.locator('[data-wms-command="release-order"][data-wms-id="SO-2001"]'));
  const released=await poll('Release SO-2001 into warehouse allocation',value=>orderCount(orderAt(value,'SO-2001'),'allocated')===3);
  check('Manager release reserves three actual cartons without payment or physical movement',released.wms.state.cartons.filter(c=>c.soId==='SO-2001'&&c.status==='Reserved').length===3&&released.wms.state.cash===beforeRelease.wms.state.cash&&onHand(released)===102&&released.wms.conserves);
  await capture('wms-manager-released-so');
  await click(page.locator('[data-wms-page="tasks"]'));check('Released sales order creates floor work',await page.locator('#warehouse-wms-console').innerText().then(text=>text.includes('SO-2001')));
  await capture('wms-manager-work-queue');await closeComputer();
  if(!(await state()).frontDoorOpen){
    await walkTo(6.5,-8.4,'Approach the front door before carrying shipments');await aimAt([6.5,1.2,-10]);
    await use('Open the physical front door with empty hands',value=>value.frontDoorOpen);await delay(800);
  }

  if(includePick){
    stage('Pick an allocated carton into shipping staging');
    await walkTo(5.37,-7,'Leave the computer for picking');await walkTo(5.37,-4.8,'Exit the office');await walkTo(5.37,-3.6,'Reach the front cross aisle');
    await chooseTask('pick','SO-2001');
    const allocated=(await state()).wms.state.cartons.filter(c=>c.soId==='SO-2001'&&c.status==='Reserved'&&/^F0[123]$/.test(c.binId));
    const pick=allocated.find(c=>c.sku==='tape')||allocated[0];assert.ok(pick,'The first order reserves accessible floor stock');
    const bin=(await state()).wms.bins.find(b=>b.id===pick.binId);await walkTo(bin.center[0],-3.6,'Approach the allocated pick location');
    await scanLabel('BIN:'+pick.binId,'Pick source location');await scanLabel('CARTON:'+pick.id,'Pick allocated carton');
    await pickCarton(pick.id);await walkTo(.6,-3.6,'Carry the pick along the front cross aisle');
    // STAGE-01 lies in the open central dispatch approach, outside the office.
    await walkTo(3.3,-3.6,'Carry around the parked forklift toward staging');await walkTo(3.3,-5.7,'Reach the clear eastern staging edge');
    await putCarton(pick.id,[1.7,.22,-5.15],'STAGE-01');
    await scanLabel('BIN:STAGE-01','Pick destination staging');
    await confirm('Confirm the physically staged order pick',value=>cartonAt(value,pick.id).status==='Picked'&&cartonAt(value,pick.id).binId==='STAGE-01');
    const picked=await state();check('Picking conserves stock and leaves payment pending',orderCount(orderAt(picked,'SO-2001'),'picked')===1&&onHand(picked)===102&&picked.wms.state.cash===released.wms.state.cash&&picked.wms.conserves);
    await capture('tc22-first-pick-staged');
  }
  if(fullCycle){
    assert.ok(includePick,'The complete shipment requires the first-pick phase');
    stage('Finish the full sales-order pick');
    const stagePositions=[[1.7,.22,-5.15],[1.7,.22,-6.2],[1.18,.22,-5.7]];
    let current=await state(),pickIndex=1;
    while(orderCount(orderAt(current,'SO-2001'),'picked')<3){
      await walkTo(3.3,-3.6,'Return from staging to the pick aisle');
      const next=current.wms.state.cartons.find(c=>c.soId==='SO-2001'&&c.status==='Reserved');assert.ok(next,'A remaining physical allocation exists');
      const bin=current.wms.bins.find(b=>b.id===next.binId);assert.match(next.binId,/^F0[123]$/,'Starter order remains in accessible floor bins');
      await walkTo(bin.center[0],-3.6,'Reach remaining pick '+next.id);
      await scanLabel('BIN:'+next.binId,'Next allocated source bin');await scanLabel('CARTON:'+next.id,'Next allocated carton');
      if(distance((await state()).wms.cameraPosition,bodyAt(await state(),next.id).position)>2.5){
        await walkTo(.6,-3.6,'Go around the occupied floor stock');await walkTo(.6,.25,'Reach the north side of the floor bins');
        await walkTo(bodyAt(await state(),next.id).position[0],.25,'Approach the transferred carton from its open side');
      }
      await pickCarton(next.id);
      if((await state()).playerPosition[2]>-2.8){await walkTo(.6,.25,'Carry the north-side pick around the floor bins');await walkTo(.6,-3.6,'Return through the clear bin gap');}
      await walkTo(3.3,-3.6,'Carry the next pick toward staging');await walkTo(3.3,-5.7,'Use the clear staging approach');
      await putCarton(next.id,stagePositions[pickIndex],'STAGE-01');await scanLabel('BIN:STAGE-01','Confirm the next staging destination');
      current=await confirm('Post pick '+(pickIndex+1)+' of 3',value=>cartonAt(value,next.id).status==='Picked');pickIndex++;
    }
    check('The complete SO is physically staged before collection',orderAt(current,'SO-2001').status==='Picked'&&current.wms.state.cartons.filter(c=>c.soId==='SO-2001').every(c=>c.binId==='STAGE-01'&&c.physicalBin==='STAGE-01'));
    await capture('wms-order-fully-picked');
    await poll('The real collection van arrives and opens',value=>value.wms.courierState==='WaitingForLoading',180000,350);
    await chooseTask('ship','SO-2001');
    const shipping=(await state()).wms.state.cartons.filter(c=>c.soId==='SO-2001').map(c=>c.id);
    const cashBeforeShip=(await state()).wms.state.cash,orderValue=orderAt(await state(),'SO-2001').amount;
    for(let index=0;index<shipping.length;index++){
      const id=shipping[index];stage('Load physical shipment carton '+(index+1)+' of '+shipping.length);
      if(index){
        await walkTo(3,-23.3,'Exit the van for the next staged carton');await walkTo(3,-22.65,'Clear the waiting driver');
        await walkTo(6.5,-22.65,'Return along the front pavement');await walkTo(6.5,-11.3,'Walk up the front access ramp');
        await walkTo(6.5,-8,'Reenter the front office door');await walkTo(5.37,-7,'Pass beside the desk');
        await walkTo(5.37,-4.8,'Return through the internal doorway');await walkTo(5.37,-3.6,'Clear the office wall before turning');await walkTo(3.3,-3.6,'Reach the staging approach');await walkTo(3.3,-5.7,'Stand beside staged cartons');
      }
      await scanLabel('BIN:STAGE-01','Ship source staging bin');await scanLabel('CARTON:'+id,'Ship allocated carton '+id);await pickCarton(id);
      await walkTo(3.3,-3.6,'Carry the shipment clear of the forklift');await walkTo(5.37,-3.6,'Reach the office doorway with the shipment');
      await walkTo(5.37,-4.8,'Carry through the internal office doorway');await walkTo(5.37,-7,'Pass beside the desk with the carton');
      await walkTo(6.5,-8,'Line up with the front door');await walkTo(6.5,-11.3,'Carry the carton onto the porch');
      await walkTo(6.5,-22.65,'Carry the carton down the front ramp');await walkTo(3,-22.65,'Go around the driver');await walkTo(3,-23.3,'Approach the collection van ramp');
      await walkTo(3,-26,'Carry the carton onto the van deck');
      const dispatch=(await state()).wms.bins.find(bin=>bin.id==='DISPATCH-01');
      const target=[dispatch.center[0]+(index===0?-.4:index===1?.4:0),dispatch.center[1]-dispatch.size[1]/2+.22,dispatch.center[2]+(index<2?-.6:.55)];
      await putCarton(id,target,'DISPATCH-01');await walkTo(3,-23.3,'Step back to scan the carrier location');
      await scanLabel('BIN:DISPATCH-01','Ship destination carrier bin');
      const loaded=await confirm('Post physical load '+(index+1)+' of 3',value=>cartonAt(value,id).status==='Loaded');
      check('Loaded carton '+id+' keeps payment pending',loaded.wms.state.cash===cashBeforeShip&&loaded.wms.conserves&&orderCount(orderAt(loaded,'SO-2001'),'loaded')===index+1);
    }
    await capture('wms-loaded-carrier');await walkTo(3,-22.65,'Clear the van loading ramp');await walkTo(6.5,-22.65,'Stand beside the carrier departure route');
    const authorized=await confirm('Authorize shipment only after the physical loading is complete',value=>value.wms.state.workflow.step==='departing');
    check('Shipment authorization does not pay before departure',authorized.wms.state.cash===cashBeforeShip&&orderCount(orderAt(authorized,'SO-2001'),'shipped')===0);
    await capture('wms-shipment-departing');
    const paid=await poll('The carrier departs with the manifest and payment posts',value=>orderAt(value,'SO-2001').status==='Shipped',180000,350);
    check('One full WMS shipment conserves stock and pays exactly its order amount',paid.wms.state.cash===cashBeforeShip+orderValue&&onHand(paid)===99&&orderCount(orderAt(paid,'SO-2001'),'shipped')===3&&paid.wms.conserves);
    check('Shipped handling units leave the physical warehouse',shipping.every(id=>!bodyAt(paid,id)&&!cartonAt(paid,id)));
    stage('Create new manager documents after the completed shipment');
    await walkTo(6.5,-11.3,'Return up the front access ramp');await walkTo(6.5,-8,'Return to the office');await walkTo(9.8,-7.3,'Reach the manager computer after dispatch');await openComputer();
    for(const [kind,action,sku,quantity] of [['purchaseOrders','create-po','stretch',4],['salesOrders','create-so','mailers',2]]){
      await click(page.locator('[data-wms-page="'+kind+'"]'));await click(page.locator('[data-wms-create="'+kind+'"]'));
      await page.locator('#warehouse-wms-create-item').selectOption(sku);await page.locator('#warehouse-wms-create-quantity').fill(String(quantity));
      const before=await state(),ids=before.wms.state[kind].map(order=>order.id);
      await click(page.getByRole('button',{name:kind==='purchaseOrders'?'Create purchase order':'Create sales order',exact:true}));
      const created=await poll('Manager creates '+action,value=>value.wms.state[kind].some(order=>!ids.includes(order.id)));
      const document=created.wms.state[kind].find(order=>!ids.includes(order.id));
      check('Creating '+document.id+' changes no physical stock or cash',document.lines[0].sku===sku&&document.lines[0].ordered===quantity&&document.status==='Open'&&created.wms.state.cash===before.wms.state.cash&&onHand(created)===onHand(before)&&created.wms.conserves);
      await capture('wms-'+action+'-created');
    }
  }
  finalState=await state('FINAL');
  const diagnostics=classifyUnityConsole(messages);fs.writeFileSync(path.join(output,'console-diagnostics.json'),JSON.stringify(diagnostics,null,2));
  check('No browser errors, failed assets or active shader failures occurred',failures.length===0&&diagnostics.shaderFailures.length===0);
  console.log(checks.length+' native WMS checks passed. Captures: '+output);
})().catch(async error=>{
  console.error('FAILED STAGE '+currentStage);console.error(error);failures.push(error.stack||error.message);
  if(page)try{await page.screenshot({path:path.join(output,'failure.png'),timeout:60000});}catch{}
  process.exitCode=1;
}).finally(async()=>{
  if(page&&!page.isClosed())try{
    const performanceReport=await page.evaluate(()=>{
      const probe=window.wmsPerformance;if(!probe)return null;
      probe.stopped=true;cancelAnimationFrame(probe.raf);probe.observer.disconnect();
      return {startedAt:probe.startedAt,endedAt:Date.now(),activeFrames:probe.activeFrames,maxActiveFrameGapMs:probe.maxActiveFrameGapMs,frameGaps:probe.frameGaps,longTasks:probe.longTasks};
    });fs.writeFileSync(path.join(output,'performance.json'),JSON.stringify({phases,...performanceReport},null,2));
  }catch{}
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));
  fs.writeFileSync(path.join(output,'states.json'),JSON.stringify(states,null,2));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,failures,stage:currentStage,mouseDegreesPerPixel:degreesPerPixel,final:finalState},null,2));
  if(keepFailedOpen&&failures.length&&browser){
    console.log('Failed browser retained at http://127.0.0.1:'+diagnosticPort+'. Send a line to stdin to close it.');process.stdin.resume();
    await new Promise(resolve=>{process.stdin.once('data',resolve);browser.once('disconnected',resolve);});process.stdin.pause();
  }
  if(browser)await browser.close();server.close();
});
