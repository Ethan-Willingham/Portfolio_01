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
const output = process.env.SHIFT_WMS_CAREER_DUMP || path.join(os.tmpdir(), 'one-shift-wms-career-browser');
const keepFailedOpen = process.env.SHIFT_WMS_KEEP_FAILED_OPEN === '1';
const diagnosticPort = Number(process.env.SHIFT_WMS_CDP_PORT || 9229);
const fullCycle = process.env.SHIFT_WMS_CAREER_RECEIVE_ONLY !== '1';
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
  let observedWorldState=false;
  page.on('console',message=>{
    const text=message.text();
    // Retain the first real world record so shader classification can separate
    // startup diagnostics from failures after the player became active.
    if(text.includes('ONE_SHIFT_STATE ')){if(observedWorldState)return;observedWorldState=true;}
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
    throw new Error(label+' timed out: '+JSON.stringify({position:current?.playerPosition,wms:current?.wms}));
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
    const porchReceipt=code.startsWith('CARTON:')&&current.wms.state.workflow.tile==='receive'&&current.wms.state.workflow.sourceBin==='REC-01';
    const candidates=current.wms.labels.filter(item=>item.code===code).map(item=>{
      const d=distance(camera,item.point),facing=item.normal.reduce((sum,n,index)=>sum+n*(camera[index]-item.point[index])/d,0);
      return {...item,d,facing};
    }).filter(item=>item.d<4.2&&item.facing>.4).sort((a,b)=>
      (porchReceipt?(Math.abs(a.normal[1])>.6?1:0)-(Math.abs(b.normal[1])>.6?1:0):0)||b.facing-a.facing||a.d-b.d);
    assert.ok(candidates.length,label+' has a physically reachable front-facing label');
    let result;
    for(const candidate of candidates){
      await aimAt(candidate.point);await delay(240);const before=await state();await page.keyboard.press('f');
      result=await poll(label,value=>value.wms.state.scan.sequence>before.wms.state.scan.sequence,5000);
      if(result.wms.state.scan.code===code)break;
      assert.ok(result.wms.state.scan.status!=='success'||!result.wms.state.scan.code,
        label+' decoded a different visible carton '+result.wms.state.scan.code+'; do not retry after that scan legitimately advanced the workflow');
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

  stage('Load the actual empty career player');
  await page.goto(process.env.SHIFT_TEST_URL||'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  check('Unity remains click-to-load',!await page.evaluate(()=>!!window.actualUnity));
  await click(page.locator('#warehouse-play'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await page.bringToFront();await click(page.locator('#warehouse-canvas'));
  await poll('Career renders physical frames',value=>value.frameCount>30&&!value.browserSuspended&&value.timeScale>0);
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
  const initial=await state('INITIAL EMPTY CAREER');
  check('Version 10 opens the empty career with $600 and no physical cartons',initial.buildVersion>=10&&initial.wms.state.mode==='career'&&initial.wms.state.cash===600&&initial.wms.bodies.length===0&&onHand(initial)===0);
  check('Career starts with floor work locations and no purchased rack bins',initial.wms.state.bins.length===7&&!initial.wms.state.bins.some(bin=>/^[ABC]\d\d-\d\d-\d\d$/.test(bin.id)));
  check('The opening examples are a three-carton PO and matching SO',orderCount(orderAt(initial,'PO-1001'),'ordered')===3&&orderCount(orderAt(initial,'SO-2001'),'ordered')===3&&initial.wms.conserves);
  const calibrationBefore=await state();await relativeMouse(80,0);const calibrationAfter=await state();
  degreesPerPixel=angleDelta(calibrationAfter.playerYaw,calibrationBefore.playerYaw)/80;
  check('Native mouse controls the career camera',Number.isFinite(degreesPerPixel)&&degreesPerPixel>.02&&degreesPerPixel<3);
  await capture('career-empty-warehouse');

  async function floorToOffice(label){
    await walkTo(5.37,-3.6,label+': approach the internal doorway');await walkTo(5.37,-4.8,label+': enter the office');
    await walkTo(5.37,-7,label+': pass beside the desk');await walkTo(9.8,-7.3,label+': approach the monitor');
  }
  async function floorToPorch(label){
    await walkTo(5.37,-3.6,label+': reach the office approach');await walkTo(5.37,-4.8,label+': pass the internal doorway');
    await walkTo(5.37,-7,label+': pass beside the desk');await walkTo(6.5,-8,label+': line up with the front door');
    await walkTo(6.5,-11.3,label+': pass onto the porch');
  }
  async function porchToFloor(label){
    await walkTo(6.5,-11.3,label+': leave the parcel shelf');await walkTo(6.5,-8,label+': reenter through the front door');
    await walkTo(5.37,-7,label+': pass beside the desk');await walkTo(5.37,-4.8,label+': pass the internal doorway');
    await walkTo(5.37,-3.6,label+': clear the north office wall');
    await walkTo(5.37,.25,label+': reach the clear north side of floor storage');
  }
  async function approachFloorLabel(label){
    await walkTo(-2.25,.25,label+': leave room around stored cartons');await walkTo(-2.25,-3.6,label+': walk through the clear bin gap');
    await walkTo(-3.6,-3.6,label+': face the F01 floor barcode');
  }
  stage('Book the first purchase from the real office WMS');
  await floorToOffice('First purchase');await openComputer();
  check('Manager WMS opens before the separate Business app',await page.locator('#warehouse-wms-console').isVisible()&&await page.locator('#warehouse-business').isHidden());
  await click(page.locator('[data-wms-page="purchaseOrders"]'));
  check('Creating additional career orders is locked until the first shipment',await page.locator('[data-wms-create="purchaseOrders"]').isDisabled());
  await click(page.locator('[data-wms-detail="purchaseOrders:PO-1001"]'));await capture('career-opening-po');
  const purchaseCost=orderAt(initial,'PO-1001').amount;
  await click(page.locator('[data-wms-command="book-po"][data-wms-id="PO-1001"]'));
  const booked=await poll('First booking debits cash and creates exactly three inbound cartons',value=>value.wms.bodies.length===3&&value.wms.state.cash===initial.wms.state.cash-purchaseCost);
  check('Booking creates expected handling units without receiving or allocating stock',onHand(booked)===0&&booked.wms.state.cartons.every(carton=>carton.status==='Expected'&&carton.poId==='PO-1001')&&orderCount(orderAt(booked,'PO-1001'),'received')===0&&booked.wms.conserves);
  await closeComputer();

  stage('Watch the physical courier deliver cartons to the porch');
  await walkTo(6.5,-8.4,'Walk from the monitor to the front door');
  if(!(await state()).frontDoorOpen){await aimAt([6.5,1.3,-10]);await use('Open the physical front door',value=>value.frontDoorOpen);await delay(750);}
  const openDoor=await state();check('The front door is opened with empty hands before the first pickup',openDoor.frontDoorOpen&&!openDoor.wms.heldCarton);
  await walkTo(6.5,-10.7,'Wait beside the door clear of the courier carrying path');await yawTo(180);await capture('career-courier-approach');
  const delivered=await poll('Courier releases every inbound carton onto the parcel shelf',value=>value.wms.bodies.length===3&&value.wms.bodies.every(body=>!body.kinematic&&Math.hypot(...body.velocity)<.25)&&value.wms.state.cartons.every(carton=>carton.physicalBin==='REC-01'),180000,350);
  check('A completed physical drop leaves stock unreceived until the operator scans it',onHand(delivered)===0&&orderCount(orderAt(delivered,'PO-1001'),'received')===0&&delivered.wms.state.cash===booked.wms.state.cash&&delivered.wms.conserves);
  await poll('Delivery driver clears the porch and returns to the street',value=>value.wms.courierState==='Idle',90000,350);
  await walkTo(6.5,-11.3,'Step onto the receiving porch');await walkTo(7.1,-11.6,'Pass around the shelf corner');
  await walkTo(8.25,-12.1,'Face both stacked carton columns from the courier standing space');
  await chooseTask('receive','PO-1001');await scanLabel('BIN:REC-01','Read the real porch receiving location');
  const receivingOrder=(await state()).wms.bodies.slice().sort((a,b)=>Math.abs(b.position[1]-a.position[1])>.05?b.position[1]-a.position[1]:a.position[0]-b.position[0]).map(body=>body.id);
  for(let index=0;index<receivingOrder.length;index++){
    const id=receivingOrder[index];await scanLabel('CARTON:'+id,'Match porch carton '+id+' to its PO');
    await confirm('Receive physical porch carton '+(index+1)+' of 3',value=>cartonAt(value,id).status==='Available'&&cartonAt(value,id).binId==='REC-01');
  }
  const received=await state('PORCH PO RECEIVED');
  check('Every delivered carton is received once into REC-01',onHand(received)===3&&orderAt(received,'PO-1001').status==='Received'&&orderCount(orderAt(received,'PO-1001'),'received')===3&&received.wms.state.items.reduce((sum,item)=>sum+item.available,0)===0&&received.wms.conserves);
  await capture('career-porch-receipt');

  stage('Carry the received cartons into floor storage with Transfer');
  const floorPositions=[[-4.1,.22,-2.22],[-3.1,.22,-2.22],[-3.6,.22,-1.35]];
  for(let index=0;index<receivingOrder.length;index++){
    const id=receivingOrder[index];
    if(index){await walkTo(5.37,-3.6,'Return along the clear cross aisle for the next carton');await floorToPorch('Next received carton');await walkTo(7.1,-11.6,'Pass around the parcel shelf');await walkTo(8.25,-12.1,'Approach the remaining porch cartons from their front labels');}
    await chooseTask('transfer');await scanLabel('BIN:REC-01','Transfer source receiving bin');await scanLabel('CARTON:'+id,'Transfer the next received carton');
    await pickCarton(id);await porchToFloor('Putaway '+id);await walkTo(floorPositions[index][0],.25,'Carry '+id+' to its open floor position');
    await putCarton(id,floorPositions[index],'F01');await approachFloorLabel('Complete putaway '+id);await scanLabel('BIN:F01','Transfer destination floor storage');
    await confirm('Post physical putaway '+(index+1)+' of 3',value=>cartonAt(value,id).binId==='F01');
  }
  const stored=await state('OPENING STOCK STORED');
  check('Putaway makes exactly three cartons available without creating inventory',onHand(stored)===3&&stored.wms.state.items.reduce((sum,item)=>sum+item.available,0)===3&&stored.wms.state.cartons.every(carton=>carton.binId==='F01'&&carton.physicalBin==='F01')&&stored.wms.conserves);
  await capture('career-three-cartons-stored');

  if(fullCycle){
    stage('Release the opening sales order and pick its actual cartons');
    await floorToOffice('Opening customer order');await openComputer();await click(page.locator('[data-wms-page="salesOrders"]'));
    await click(page.locator('[data-wms-detail="salesOrders:SO-2001"]'));await click(page.locator('[data-wms-command="release-order"][data-wms-id="SO-2001"]'));
    const released=await poll('Allocate exactly the stored opening cartons',value=>orderCount(orderAt(value,'SO-2001'),'allocated')===3);
    check('Releasing an order reserves the stock without early payment',released.wms.state.cartons.every(carton=>carton.status==='Reserved'&&carton.soId==='SO-2001')&&released.wms.state.cash===booked.wms.state.cash);
    await closeComputer();await walkTo(5.37,-7,'Leave the desk for picking');await walkTo(5.37,-4.8,'Leave through the internal office door');await walkTo(5.37,-3.6,'Reach the front picking aisle');
    await chooseTask('pick','SO-2001');
    // Leave room for the rotated carton footprint and the small settling drift
    // after release. The western target is approached from its clear west side.
    const stagePositions=[[1.23,.22,-6.2],[2.05,.22,-6.2],[1.55,.22,-5.25]];
    for(let index=0;index<receivingOrder.length;index++){
      const id=receivingOrder[index];
      if(index){
        if((await state()).playerPosition[0]<1)await walkTo(.05,-3.6,'Leave staging through its clear west approach');
        await walkTo(3.3,-3.6,'Return from staging to the picking aisle');
      }
      await walkTo(-3.6,-3.6,'Approach the allocated F01 stock');await scanLabel('BIN:F01','Pick source location');await scanLabel('CARTON:'+id,'Pick allocated carton '+id);
      const current=await state();
      if(distance(current.wms.cameraPosition,bodyAt(current,id).position)>2.5){await walkTo(-2.25,-3.6,'Walk around the stored cartons');await walkTo(-2.25,.25,'Reach the north side of F01');await walkTo(bodyAt(current,id).position[0],.25,'Reach the rear carton');}
      await pickCarton(id);
      if((await state()).playerPosition[2]>-2.8){await walkTo(-2.25,.25,'Carry around the north corner of F01');await walkTo(-2.25,-3.6,'Return along the clear bin gap');}
      if(index===0){await walkTo(.05,-3.6,'Approach the empty west side of staging');await walkTo(.05,-6.2,'Place the first pick from the west');}
      else{await walkTo(3.3,-3.6,'Carry toward dispatch staging');await walkTo(3.3,-5.7,'Stand on the clear east side of staging');}
      await putCarton(id,stagePositions[index],'STAGE-01');await scanLabel('BIN:STAGE-01','Pick destination staging location');
      await confirm('Confirm opening pick '+(index+1)+' of 3',value=>cartonAt(value,id).status==='Picked');
    }
    const picked=await state('OPENING ORDER PICKED');
    check('All opening cartons are physically staged before collection',orderAt(picked,'SO-2001').status==='Picked'&&picked.wms.state.cartons.every(carton=>carton.binId==='STAGE-01'&&carton.physicalBin==='STAGE-01')&&picked.wms.conserves);
    await capture('career-opening-order-staged');await poll('Collection van parks and opens its loading ramp',value=>value.wms.courierState==='WaitingForLoading',180000,350);
    await chooseTask('ship','SO-2001');
    const cashBeforeShip=picked.wms.state.cash,orderValue=orderAt(picked,'SO-2001').amount;
    for(let index=0;index<receivingOrder.length;index++){
      const id=receivingOrder[index];stage('Load career carton '+(index+1)+' of 3');
      if(index){
        await walkTo(3,-22.65,'Clear the loading ramp');await walkTo(6.5,-22.65,'Return along the front pavement');await walkTo(6.5,-11.3,'Walk up the pedestrian access ramp');
        await walkTo(6.5,-8,'Reenter the front office door');await walkTo(5.37,-7,'Pass beside the desk');await walkTo(5.37,-4.8,'Pass through the internal doorway');
        await walkTo(5.37,-3.6,'Fully exit north of the office wall before turning west');
        await walkTo(3.3,-3.6,'Reach the staging approach');await walkTo(3.3,-5.7,'Stand beside the next staged carton');
      }
      const beforePickup=await state();
      if(distance(beforePickup.wms.cameraPosition,bodyAt(beforePickup,id).position)>2.5){await walkTo(3.3,-3.6,'Go around the staged stock');await walkTo(.05,-3.6,'Reach the west staging approach');await walkTo(.05,-5.7,'Stand within reach of the western carton');}
      await scanLabel('BIN:STAGE-01','Ship source staging bin');await scanLabel('CARTON:'+id,'Ship allocated carton '+id);await pickCarton(id);
      if((await state()).playerPosition[0]<1)await walkTo(.05,-3.6,'Carry clear of the west staging edge');
      await walkTo(3.3,-3.6,'Carry north of the office corner before turning toward its doorway');
      await floorToPorch('Ship '+id);await walkTo(6.5,-22.65,'Carry the carton down the access ramp');await walkTo(3,-22.65,'Walk around the waiting driver');
      await walkTo(3,-23.3,'Reach the van ramp');await walkTo(3,-26,'Carry the shipment onto the van deck');
      const dispatch=(await state()).wms.bins.find(bin=>bin.id==='DISPATCH-01');
      const target=[dispatch.center[0]+(index===0?-.4:index===1?.4:0),dispatch.center[1]-dispatch.size[1]/2+.22,dispatch.center[2]+(index<2?-.6:.55)];
      await putCarton(id,target,'DISPATCH-01');await walkTo(3,-23.3,'Step back to scan the carrier location');await scanLabel('BIN:DISPATCH-01','Ship destination van bin');
      const loaded=await confirm('Post loaded career carton '+(index+1)+' of 3',value=>cartonAt(value,id).status==='Loaded');
      check('Loading preserves the unpaid order until departure',loaded.wms.state.cash===cashBeforeShip&&orderCount(orderAt(loaded,'SO-2001'),'loaded')===index+1&&loaded.wms.conserves);
    }
    await walkTo(3,-22.65,'Clear the carrier loading ramp');await walkTo(6.5,-22.65,'Stand beside the departure path');
    const authorized=await confirm('Authorize the completed shipment from clear ground',value=>value.wms.state.workflow.step==='departing');
    check('Shipment confirmation still waits for the actual carrier departure',authorized.wms.state.cash===cashBeforeShip&&orderCount(orderAt(authorized,'SO-2001'),'shipped')===0);
    const paid=await poll('Carrier departs and the opening customer pays',value=>orderAt(value,'SO-2001').status==='Shipped',180000,350);
    check('Career completes its first full physical distribution cycle once',paid.wms.state.cash===cashBeforeShip+orderValue&&onHand(paid)===0&&paid.wms.state.completedOrders===1&&receivingOrder.every(id=>!bodyAt(paid,id)&&!cartonAt(paid,id))&&paid.wms.conserves);
    await capture('career-first-shipment-paid');

    stage('Create and book another purchase with earned cash');
    await walkTo(6.5,-11.3,'Return up the front ramp');await walkTo(6.5,-8,'Reenter the office after collection');await walkTo(9.8,-7.3,'Return to the manager computer');await openComputer();
    await click(page.locator('[data-wms-page="purchaseOrders"]'));await click(page.locator('[data-wms-create="purchaseOrders"]'));
    await page.locator('#warehouse-wms-create-item').selectOption('towels');await page.locator('#warehouse-wms-create-quantity').fill('2');
    const beforeCreate=await state(),priorIds=beforeCreate.wms.state.purchaseOrders.map(order=>order.id);
    await click(page.getByRole('button',{name:'Create purchase order',exact:true}));
    const created=await poll('A new manager purchase order is created',value=>value.wms.state.purchaseOrders.some(order=>!priorIds.includes(order.id)));
    const next=created.wms.state.purchaseOrders.find(order=>!priorIds.includes(order.id));
    check('New document creation does not invent stock or spend cash',next.lines[0].sku==='towels'&&next.lines[0].ordered===2&&created.wms.state.cash===paid.wms.state.cash&&onHand(created)===0&&created.wms.conserves);
    await click(page.locator('[data-wms-command="book-po"][data-wms-id="'+next.id+'"]'));
    const repeat=await poll('Second supplier visit is booked with earned working capital',value=>value.wms.state.cash===paid.wms.state.cash-next.amount&&value.wms.state.cartons.filter(carton=>carton.poId===next.id&&carton.status==='Expected').length===2);
    check('Repeat purchasing starts another physical inbound cycle with no free inventory',onHand(repeat)===0&&repeat.wms.bodies.length===2&&repeat.wms.courierState!=='Idle'&&repeat.wms.conserves);
    await capture('career-repeat-purchase-booked');
  }
  finalState=await state('FINAL');
  const diagnostics=classifyUnityConsole(messages);fs.writeFileSync(path.join(output,'console-diagnostics.json'),JSON.stringify(diagnostics,null,2));
  check('No browser errors, failed assets or active shader failures occurred',failures.length===0&&diagnostics.shaderFailures.length===0);
  console.log(checks.length+' native WMS career checks passed. Captures: '+output);
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
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({scope:fullCycle?'Full native career purchase, porch receipt, putaway, pick, carrier shipment and repeat purchase':'Native career purchase, courier porch receipt and putaway only',checks,failures,stage:currentStage,mouseDegreesPerPixel:degreesPerPixel,final:finalState},null,2));
  if(keepFailedOpen&&failures.length&&browser){
    console.log('Failed browser retained at http://127.0.0.1:'+diagnosticPort+'. Send a line to stdin to close it.');process.stdin.resume();
    await new Promise(resolve=>{process.stdin.once('data',resolve);browser.once('disconnected',resolve);});process.stdin.pause();
  }
  if(browser)await browser.close();server.close();
});
