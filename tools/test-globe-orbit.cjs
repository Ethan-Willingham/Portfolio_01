/* Local-only camera hooks. Owns and closes Chrome for Testing or WebKit.
   Real mouse/keyboard events on both engines; real touch events in Chromium. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),mobile=process.env.SAFARI_MOBILE==='1',dump=process.env.DUMP||'/tmp/daylight-globe-orbit';
fs.mkdirSync(dump,{recursive:true});
const checks=[],errors=[],evidence={engine:mobile?'WebKit mobile viewport':'Chrome',checks,errors};
const hooks=`
window.__orbitAudit={
 reset:(p,t=.4)=>{autoSpin=false;live=false;instant=new Date('2026-10-05T20:00:00Z');sunFraming=false;aimShift=0;phi=targetPhi=p;theta=targetTheta=t;radius=targetRadius=4;window.__orbitFrames=[];updateAstronomy();},
 state:()=>({phi,theta,targetPhi,targetTheta,radius,targetRadius,position:camera.position.toArray(),up:camera.up.toArray(),quaternion:camera.quaternion.toArray(),matrix:camera.matrixWorld.elements.slice(),fov:camera.fov,height:renderer.domElement.clientHeight,pin,sunFraming,sun:sunBody.position.clone().project(camera).toArray()}),
 project:point=>new THREE.Vector3(...point).project(camera).toArray(),
 frames:()=>window.__orbitFrames,
 monitor:on=>{window.__orbitMonitoring=on;window.__orbitFrames=[];}
};`;
const source=fs.readFileSync(path.join(root,'js/globe.js'),'utf8'),end=source.lastIndexOf('}());');assert(end>=0);
assert(source.includes('camera.lookAt(cameraAim);'));
const instrumented=(source.slice(0,end)+hooks+source.slice(end)).replace('camera.lookAt(cameraAim);','camera.lookAt(cameraAim);if(window.__orbitMonitoring)window.__orbitFrames.push({phi,up:camera.up.toArray(),quaternion:camera.quaternion.toArray(),position:camera.position.toArray()});');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.bin':'application/octet-stream','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(file.endsWith('/js/globe.js')?instrumented:fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
function check(name,value){assert(value,name);checks.push(name);console.log('PASS '+name);}
const dot=(a,b)=>a.reduce((total,v,i)=>total+v*b[i],0),norm=a=>Math.hypot(...a),near=(a,b)=>Math.abs(a-b)<1e-6;
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=page=>page.evaluate(()=>__orbitAudit.state());
async function reset(page,p,t){await page.evaluate(([p,t])=>__orbitAudit.reset(p,t),[p,t]);await settle(page);}
let browser;
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{
 browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});
 const context=await browser.newContext({viewport:mobile?{width:375,height:812}:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,isMobile:mobile,permissions:['geolocation'],geolocation:{latitude:37.7749,longitude:-122.4194},timezoneId:'America/Chicago'});
 await context.route('https://**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');
 await page.waitForFunction(()=>window.__orbitAudit&&!document.getElementById('globe-container').classList.contains('is-loading'),null,{timeout:30000});
 await page.locator('#globe-container canvas').scrollIntoViewIfNeeded();
 await reset(page,1.1);await page.evaluate(()=>__orbitAudit.monitor(true));
 const box=await page.locator('#globe-container canvas').boundingBox(),s=await state(page),factor=2*(s.radius-1)*Math.tan(s.fov*Math.PI/360)/s.height;
 const x=box.x+box.width/2,y=box.y+box.height/2,delta=.55/factor;
 for(let i=0;i<24;i++){
  await page.mouse.move(x,y+delta/2);await page.mouse.down();await page.mouse.move(x,y-delta/2,{steps:8});await page.mouse.up();await page.waitForTimeout(120);
 }
 await page.waitForTimeout(650);const revolutions=await state(page),frames=await page.evaluate(()=>__orbitAudit.frames());
 evidence.revolutions={state:revolutions,frameCount:frames.length};
 check('mouse can complete two vertical revolutions through both poles',revolutions.phi>4*Math.PI&&Math.abs(revolutions.targetPhi-(1.1+24*.55))<24*factor*2);
 check('pole crossings maintain a finite orthonormal camera frame',frames.every(f=>f.up.concat(f.position,f.quaternion).every(Number.isFinite)&&Math.abs(norm(f.up)-1)<1e-10&&Math.abs(dot(f.up,f.position))<1e-9&&Math.abs(norm(f.quaternion)-1)<1e-10));
 const minimumDot=Math.min(...frames.slice(1).map((f,i)=>Math.abs(dot(f.quaternion,frames[i].quaternion))));
 check('dragging over poles has no sudden camera roll flip',minimumDot>Math.cos(.7/2));
 evidence.revolutions={state:revolutions,frameCount:frames.length,minimumQuaternionDot:minimumDot};
 await page.locator('#globe-container').screenshot({path:path.join(dump,'two-revolutions.png')});
 await page.evaluate(()=>__orbitAudit.monitor(false));
 for(const pole of [-Math.PI,0,Math.PI,2*Math.PI]){
  const samples=[];for(const p of [pole-1e-5,pole,pole+1e-5]){await reset(page,p);samples.push(await state(page));}
  check('exact pole '+pole+' has continuous camera orientation',samples.every(s=>s.matrix.every(Number.isFinite)&&Math.abs(norm(s.quaternion)-1)<1e-10)&&Math.abs(dot(samples[0].quaternion,samples[2].quaternion))>1-1e-9);
 }
 await reset(page,1.1);await page.locator('#globe-container').focus();
 for(let i=0;i<100;i++)await page.keyboard.press('ArrowUp');
 const keyboard=await state(page);check('up arrow can orbit repeatedly past the north and south poles',near(keyboard.targetPhi,1.1-14));
 for(let i=0;i<200;i++)await page.keyboard.press('ArrowDown');
 check('down arrow can orbit repeatedly in the reverse direction',near((await state(page)).targetPhi,1.1+14));
 for(const p of [.6,-.6]){
  await reset(page,p);const before=await state(page),point=before.position.map(v=>v/before.radius);
  await page.locator('#globe-container').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);const after=await state(page),projection=await page.evaluate(point=>__orbitAudit.project(point),point);
  check('horizontal control follows the screen at phi '+p,near(after.targetTheta-before.theta,p<0?-.14:.14)&&projection[0]<-.01);
 }
 if(!mobile){
  await reset(page,.1);const session=await context.newCDPSession(page),touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
  await touch('touchStart',[[1,x,y-delta/2]]);for(let i=1;i<=8;i++)await touch('touchMove',[[1,x,y-delta/2+delta*i/8]]);await touch('touchEnd',[]);
  check('real touch drag continues through the north pole',(await state(page)).targetPhi<-.3);
  await reset(page,.7);await touch('touchStart',[[1,x-25,y],[2,x+25,y]]);await touch('touchMove',[[1,x-35,y],[2,x+35,y]]);await touch('touchMove',[[1,x-60,y],[2,x+60,y]]);await touch('touchEnd',[]);
  const pinch=await state(page);check('two-finger zoom retains orbit and avoids accidental pins',pinch.targetRadius<4&&pinch.targetRadius>=1.5&&near(pinch.targetPhi,.7)&&!pinch.pin);await session.detach();
 }
 await reset(page,-.6);await page.locator('#globe-container').focus();await page.keyboard.press('Enter');
 const pinned=await state(page);evidence.pin=pinned;check('center pin remains geographic when the view is inverted',pinned.pin&&Math.abs(pinned.pin.lat-(90-.6*180/Math.PI))<.03);
 await page.keyboard.press('Escape');check('Escape clears an inverted-view pin',!(await state(page)).pin);
 await page.keyboard.press('+');check('keyboard zoom still works',near((await state(page)).targetRadius,3.75));
 for(const button of ['#globe-location','#globe-sun']){
  await reset(page,40*Math.PI+3.8,40*Math.PI+.4);const before=await state(page);await page.locator(button).click();const target=await state(page);
  check(button+' returns within one half turn after many revolutions',Math.abs(target.targetPhi-before.phi)<=Math.PI+1e-10&&Math.abs(target.targetTheta-before.theta)<=Math.PI+1e-10);
  await page.waitForTimeout(1000);const after=await state(page);
  check(button+' restores a finite upright camera',after.matrix.every(Number.isFinite)&&after.up[1]>0);
  if(button==='#globe-location')check('My location still centers the actual coordinates',Math.abs(Math.asin(after.position[1]/after.radius)*180/Math.PI-37.7749)<.03&&Math.abs(Math.atan2(-after.position[2],after.position[0])*180/Math.PI+122.4194)<.03);
  else check('Sun still frames the actual solar disk',after.sunFraming&&Math.abs(after.sun[0])<1&&Math.abs(after.sun[1])<1);
 }
 check('orbit and controls have no JavaScript errors',errors.length===0);await context.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify(evidence,null,2));}
 console.log(checks.length+' checks passed. Evidence: '+dump);
})().catch(error=>{console.error(error);process.exitCode=1;});
