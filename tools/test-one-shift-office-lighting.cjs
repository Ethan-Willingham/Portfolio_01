'use strict';
// Native office-entry lighting capture. ReportState, ReportWmsState
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
const output = process.env.SHIFT_WMS_DUMP || path.join(os.tmpdir(), 'one-shift-office-lighting');
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
  page.on('dialog',async dialog=>{failures.push(dialog.message());await dialog.dismiss();});
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

  stage('Office entry lighting');
  await page.goto(process.env.SHIFT_TEST_URL || 'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  await click(page.locator('#warehouse-sandbox'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await click(page.locator('#warehouse-canvas'));await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(450);
  const a=await state();await relativeMouse(80,0);degreesPerPixel=angleDelta((await state()).playerYaw,a.playerYaw)/80;
  await walkTo(5.37,-3.6,'Office approach');
  const afterHour=Number(process.env.SHIFT_OFFICE_HOUR||0);
  if(afterHour){
    await walkTo(5.37,-4.4,'Stationary lighting observation',.045);await aimAt([10,1.7,-9.6]);
    const stationary=[];
    for(const hour of [6,6.25,6.5,6.75,7,8,afterHour]){
      const value=await poll('Observe native dawn at '+hour,value=>value.hour>=hour,240000,1000);
      stationary.push({requestedHour:hour,hour:value.hour,position:value.playerPosition,tiers:value.fixtureShadowTiers});
      await capture('stationary-'+String(hour).replace('.','_'));
    }
    fs.writeFileSync(path.join(output,'stationary-frames.json'),JSON.stringify(stationary,null,2));
    await walkTo(5.37,-3.6,'Return to office approach');
  }
  const frames=[];
  for(const z of [-3.8,-4,-4.2,-4.4,-4.8,-5.2,-5.6,-6]){
    await walkTo(5.37,z,'Entry '+z,.045);await aimAt([10,1.7,-9.6]);await delay(150);
    const value=await state('Entry '+z);frames.push({z,hour:value.hour,position:value.playerPosition,tiers:value.fixtureShadowTiers});
    await capture('office-'+String(z).replace('.','_'));
  }
  fs.writeFileSync(path.join(output,'office-frames.json'),JSON.stringify(frames,null,2));
  await walkTo(5.37,-7,'Pass office doorway');await walkTo(8.5,-7,'Reach workstation');
  await openComputer();await capture('office-console');await closeComputer();
  check('Computer return restores native pointer capture',await page.evaluate(()=>document.pointerLockElement?.id==='warehouse-canvas'));
  check('No browser or active shader errors',failures.length===0&&classifyUnityConsole(messages).shaderFailures.length===0);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));if(browser)await browser.close();server.close();});
