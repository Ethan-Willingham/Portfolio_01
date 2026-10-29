'use strict';
// Focused v11 native controls/layout regression; no full shipment replay. ReportState, ReportWmsState
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
const output = process.env.SHIFT_WMS_DUMP || path.join(os.tmpdir(), 'one-shift-v11-browser');
const keepFailedOpen = process.env.SHIFT_WMS_KEEP_FAILED_OPEN === '1';
const diagnosticPort = Number(process.env.SHIFT_WMS_CDP_PORT || 9229);
const officeOnly = process.env.SHIFT_V11_OFFICE_ONLY === '1';


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

  stage('Focused v11 browser checks');
  const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  await page.goto(process.env.SHIFT_TEST_URL||'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  await click(page.locator('#warehouse-sandbox'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await click(page.locator('#warehouse-canvas'));await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(500);
  let current=await state('Opening');
  check('v11 has 97 bins and 100 owned cartons',current.buildVersion===11&&current.wms.state.bins.length===97&&onHand(current)===100&&current.wms.conserves);
  check('Receiving and staging flank the garage',current.wms.bins.filter(b=>['REC-02','STAGE-01'].includes(b.id)).every(b=>b.center[2]>=9));
  check('TC22 starts equipped',current.wms.state.equipped);
  const before=await state();await relativeMouse(80,0);const after=await state();degreesPerPixel=angleDelta(after.playerYaw,before.playerYaw)/80;
  check('Native camera receives mouse movement',degreesPerPixel>.02&&degreesPerPixel<3);
  if (!officeOnly) {
  await yawTo(0);await capture('v11-racks-and-handheld');
  await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
  await page.waitForSelector('#warehouse-wms-handheld.is-interactive');
  check('Right click opens five live TC22 tiles',await page.locator('[data-wms-tile]').count()===5);
  await delay(350);
  await capture('v11-device-inspection');
  await click(page.locator('[data-wms-tile="lookup"]'));
  await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
  await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(400);
  const label=(await state()).wms.labels.find(l=>l.code==='BIN:F02');await aimAt(label.point);await delay(250);
  const seq=(await state()).wms.state.scan.sequence;
  await page.mouse.down();await delay(60);await page.mouse.up();
  current=await poll('Left click decodes physical bin',s=>s.wms.state.scan.sequence>seq);
  check('Left click scans instead of grabbing',current.wms.state.scan.code==='BIN:F02'&&!current.wms.heldCarton);
  await delay(300);await capture('v11-live-device-lookup');
  await page.keyboard.press('q');await poll('Stow device',s=>!s.wms.state.equipped);
  await walkTo(-.8,-3.6,'Approach floor carton');
  current=await state();const carton=current.wms.state.cartons.find(c=>c.binId==='F02'),id=carton.id;
  await aimAt(bodyAt(current,id).position);const initialRotation=bodyAt(await state(),id).rotation;
  await page.mouse.down();await poll('Hold left mouse picks up',s=>s.wms.heldCarton===id);await pitchTo(12);await delay(400);
  await relativeMouse(55,0);await delay(400);
  current=await state();const kept=bodyAt(current,id).rotation;
  check('Held carton retains its orientation when looking',kept.every((angle,i)=>Math.abs(angleDelta(angle,initialRotation[i]))<8));
  await page.mouse.down({button:'right'});await relativeMouse(60,0);await delay(400);await page.mouse.up({button:'right'});await delay(400);
  current=await state();check('Right mouse deliberately rotates the held carton',bodyAt(current,id).rotation.some((angle,i)=>Math.abs(angleDelta(angle,kept[i]))>10)&&current.wms.heldCarton===id);
  await page.mouse.up();await poll('Mouse release drops carton',s=>!s.wms.heldCarton);check('Release-to-drop keeps stock conserved',(await state()).wms.conserves);
  await delay(700);await page.keyboard.press('q');await poll('Equip device',s=>s.wms.state.equipped);
  await aimAt(bodyAt(await state(),id).position);await page.keyboard.down('e');await poll('E hold carries with TC22 equipped',s=>s.wms.heldCarton===id);
  await page.keyboard.press('q');await delay(150);check('Stowing scanner keeps the held carton',(await state()).wms.heldCarton===id);
  await page.keyboard.press('q');await delay(150);check('Equipping scanner keeps the held carton',(await state()).wms.heldCarton===id);
  await page.keyboard.up('e');await poll('E release puts carton down',s=>!s.wms.heldCarton);
  check('E hold and release work with scanner equipped',true);
  await walkTo(.65,-3.6,'Reach center aisle');await walkTo(.65,8,'Reach garage staging lane');await yawTo(0);await capture('v11-receiving-and-staging');
  await walkTo(.65,-3.6,'Return through center aisle');
  }
  stage('Office pointer-lock return and denied capture');
  await walkTo(5.37,-3.6,'Reach office doorway');await walkTo(5.37,-4.8,'Enter office');await walkTo(5.37,-7,'Pass office desk');await walkTo(8.5,-7,'Reach computer');
  await openComputer();await closeComputer();check('Normal computer exit restores mouse capture',await pointerOwned());
  await openComputer();
  await page.evaluate(()=>{const canvas=document.getElementById('warehouse-canvas');window.savedPointerRequest=canvas.requestPointerLock;canvas.requestPointerLock=function(){return Promise.reject(new DOMException('Pointer lock cannot be acquired immediately after the user has exited the lock.','SecurityError'));};});
  await click(page.locator('#warehouse-computer-close'));await poll('Camera returns after denied capture',s=>!s.computerOpen&&!s.browserSuspended&&s.timeScale>0);await delay(700);
  check('Denied capture does not crash or show Unity error dialog',dialogs.length===0&&failures.length===0);
  await page.evaluate(()=>{document.getElementById('warehouse-canvas').requestPointerLock=window.savedPointerRequest;});
  await click(page.locator('#warehouse-canvas'));await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(350);
  const moveBefore=await state();await page.keyboard.down('a');await delay(250);await page.keyboard.up('a');
  check('Fresh click recovers movement after denied capture',distance((await state()).playerPosition,moveBefore.playerPosition)>.15);
  const diagnostics=classifyUnityConsole(messages);
  check('No active shader failures or browser errors',diagnostics.shaderFailures.length===0&&failures.length===0&&dialogs.length===0);
  finalState=await state('Final');await capture('v11-final');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,officeOnly,checks,diagnostics,dialogs,final:finalState},null,2));
  console.log(checks.length+' focused v11 checks passed. '+output);
})().catch(async error=>{
  console.error(error);failures.push(String(error.stack||error));process.exitCode=1;
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,stage:currentStage,checks,failures},null,2));
}).finally(async()=>{
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));
  if(browser)await browser.close();server.close();
});
