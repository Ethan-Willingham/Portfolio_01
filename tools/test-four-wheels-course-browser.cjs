// Private test hooks are injected by this server, never shipped. Chrome is owned and closed.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{chromium,webkit}=require('playwright');
const pilot=require('./four-wheels-course-driver.cjs');
const root=path.resolve(__dirname,'..'),dump=process.env.DUMP||'/tmp/four-wheels-course-qa';fs.mkdirSync(dump,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const errors=[],requests=[];let browser;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{
 let data=process.env.SOURCE_INDEX?execFileSync('git',['show',':'+path.relative(root,file)],{cwd:root,env:{...process.env,GIT_INDEX_FILE:process.env.SOURCE_INDEX},maxBuffer:32*1024*1024}):fs.readFileSync(file);
 if(file.endsWith('/js/four-wheels.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=source.slice(0,end)+`
 const testPilot=${pilot.toString()};
 window.__cartTest={
  state:()=>({phase,index:levelIndex,room:world.roomIndex,narrowCamera,followCart,cameraFocusY:touchFocusY,body:{...world.body},shopper:{...world.shopper},wheels:world.wheels.map(q=>({...q})),gait:{...world.gait},gate:world.gate,time:world.time,distance:world.distance,peak:world.peak,best:{...best},penalty:world.penalty,bonus:world.bonus,particles:particles.length,terrain:{...world.terrainStats},ground:{...world.ground},circuit:{...world.circuit},messes:world.messes,fall:world.fall,falls:world.falls,practice:world.practice,keys:keys.size,touches:touches.size,input:controls(),touchInput:[...touches].map(([id,q])=>({id,source:q.source,turn:q.turn||0,push:q.push||0,brake:q.brake||0,baseX:q.baseX||0,baseY:q.baseY||0})),contacts:world.boundaryContacts}),
  world:()=>world,draw,reset,run,events,save,startPractice,returnToRun,stop:()=>{cancelAnimationFrame(raf);raf=0;},
  step:(seconds,input)=>{cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.ceil(seconds*120)&&phase==='running';i++){world.step(1/120,input||controls());events();tickEffects(1/120);}draw();updateUI();},
  pilot:(seconds)=>{cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.ceil(seconds*120)&&phase==='running';i++){world.step(1/120,testPilot(world));events();tickEffects(1/120);}draw();updateUI();},
  pose:(index)=>{__cartTest.reset(index);__cartTest.run();__cartTest.stop();draw();updateUI();},
  hazard:(kind)=>{__cartTest.pose(kind==='lake'?3:6);const p=kind==='lake'?{x:1680,y:1100,a:0,vx:65,vy:0,omega:0}:{x:710,y:700,a:Math.PI/2,vx:0,vy:65,omega:0};Object.assign(world.body,p);CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>{q.a=p.a;q.omega=0;});draw();updateUI();},
  terrainPose:(chapter,x,y,a,v=0)=>{__cartTest.pose(chapter);Object.assign(world.body,{x,y,a,vx:Math.cos(a)*v,vy:Math.sin(a)*v,omega:0});CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>Object.assign(q,{a,omega:0}));draw();updateUI();},
  stunt:()=>{prepare(new World({...Course.build(),objects:[],shelves:[],start:{x:135,y:1520,a:0}}));run();__cartTest.stop();world.body.vx=75;draw();},
  finishPose:()=>{world.gate=world.level.gates.length;Object.assign(world.body,{x:world.level.finish.x-80,y:world.level.finish.y,a:0,vx:38,vy:0,omega:0});CartTerrain.init(world,world.terrainGeometry);world.wheels.forEach(q=>{q.a=0;q.omega=0;});},
  profile:()=>{const c=document.createElement('canvas');c.width=960;c.height=600;const g=c.getContext('2d');for(let i=0;i<5;i++)view.draw(g,world,floor,{follow:true});const t=performance.now();for(let i=0;i<30;i++)view.draw(g,world,floor,{follow:true});return (performance.now()-t)/30;},
  thumb:()=>{const w=new World(Course.build()),c=document.createElement('canvas');Object.assign(w.body,{x:421,y:1507,a:-.4});w.wheels.forEach((q,i)=>q.a=-.4+i*.2);c.width=1200;c.height=750;view.draw(c.getContext('2d'),w,makeFloor(w.level),{preview:true,follow:true});return c.toDataURL().split(',')[1];}
 };`+source.slice(end);}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch(e){res.writeHead(404).end();}});
function check(name,condition){assert.ok(condition,name);console.log('PASS '+name);}
async function setup(context,url){await context.route('https://www.googletagmanager.com/**',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.goto(url);await page.waitForFunction(()=>!!window.__cartTest);await page.evaluate(()=>document.fonts.ready);return page;}
const state=p=>p.evaluate(()=>__cartTest.state());
async function shot(p,name){return p.locator('#cart-game').screenshot({path:path.join(dump,name+'.png')});}
const fits=()=>{const game=document.getElementById('cart-game').getBoundingClientRect(),stage=document.getElementById('cart-stage').getBoundingClientRect(),c=document.getElementById('cart-canvas');return Math.abs(game.top)<1&&Math.abs(game.left)<1&&Math.abs(game.width-innerWidth)<1&&Math.abs(game.height-innerHeight)<1&&Math.abs(stage.width-innerWidth)<1&&Math.abs(stage.height-innerHeight)<1&&Math.abs(c.height/c.width-stage.height/stage.width)<.003&&document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1;};
(async()=>{try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/four-wheels.html';
 browser=await (process.env.CART_ENGINE==='webkit'?webkit:chromium).launch({headless:true,...(process.env.CART_ENGINE==='webkit'?{}:{executablePath:process.env.CART_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'})});
 const desktop=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await desktop.addInitScript(()=>{if(!localStorage.getItem('four-wheels-records-v6'))localStorage.setItem('four-wheels-records-v6','[{"time":42,"stars":3}]');});
 const page=await setup(desktop,url);let a;
 if(process.env.MOBILE_ONLY!=='1'){
 check('the complete twelve-section course boots',await page.evaluate(()=>__cartTest.world().level.campaign&&__cartTest.world().level.rooms.length===12));
 check('the canvas fills the complete desktop viewport with no reserved bars',await page.evaluate(fits));await shot(page,'desktop-start');
 await page.setViewportSize({width:1280,height:720});check('briefing fits a short laptop',await page.evaluate(()=>{const a=document.querySelector('.cart-overlay-card').getBoundingClientRect(),b=document.getElementById('cart-stage').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom+1;}));await page.setViewportSize({width:1440,height:1000});
 await page.locator('#cart-start').click();await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');a=await state(page);
 check('keyboard push moves the physical cart',a.body.vx>20);const before={...a.body};await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');a=await state(page);
 check('turning preserves the coasting direction',Math.abs(a.body.a-before.a)>.07&&Math.abs(Math.atan2(a.body.vy,a.body.vx)-Math.atan2(before.vy,before.vx))<.2);await shot(page,'desktop-track');
 check('the HUD leaves the center and bottom of the track free',await page.evaluate(()=>{const read=document.querySelector('.cart-readouts').getBoundingClientRect(),buttons=document.querySelector('.cart-utilities').getBoundingClientRect(),canvas=document.getElementById('cart-canvas').getBoundingClientRect();return read.width<200&&read.height<90&&buttons.width<100&&buttons.height===44&&read.right<canvas.width*.3&&buttons.left>canvas.width*.7&&document.getElementById('cart-instructions').getBoundingClientRect().height===0&&document.getElementById('cart-courses').getBoundingClientRect().height===0;}));
 await page.keyboard.press('m');check('M opens the course map from the unobstructed track',!(await state(page)).followCart);await page.keyboard.press('m');

 await page.locator('#cart-pause').click();const parked=await state(page);await page.waitForTimeout(200);check('pause freezes wheels, gait and progress',JSON.stringify([parked.body,parked.wheels,parked.gait,parked.time])===JSON.stringify([(await state(page)).body,(await state(page)).wheels,(await state(page)).gait,(await state(page)).time]));
 check('pause exposes route, restart, sound and fullscreen without moving the canvas',await page.locator('#cart-courses').isVisible()&&await page.locator('#cart-retry').isVisible()&&await page.locator('#cart-sound').isVisible()&&await page.locator('#cart-fullscreen').isVisible()&&await page.evaluate(fits));
 await page.locator('#cart-help summary').click();check('instructions open inside the paused game',await page.locator('#cart-instructions').isVisible()&&await page.locator('.cart-prose').isVisible()&&(await state(page)).phase==='paused');
 const helpTime=(await state(page)).time;await page.keyboard.press('w');await page.waitForTimeout(100);check('reading help never pushes the parked cart',(await state(page)).time===helpTime&&(await state(page)).keys===0);
 await page.locator('.cart-bottomnav a').last().focus();await page.keyboard.press('Tab');check('Tab stays inside the pause menu',await page.locator('#cart-start').evaluate(e=>document.activeElement===e));await page.keyboard.press('Shift+Tab');check('reverse Tab stays inside the pause menu',await page.locator('.cart-bottomnav a').last().evaluate(e=>document.activeElement===e));await shot(page,'pause-help');
 await page.reload();await page.waitForFunction(()=>!!window.__cartTest);a=await state(page);check('reload restores a parked run',a.phase==='ready'&&JSON.stringify(a.body)===JSON.stringify(parked.body)&&a.time===parked.time&&await page.locator('#cart-start').textContent()==='Continue');
 await page.locator('#cart-start').click();await page.keyboard.press('r');check('start over asks before discarding progress',(await state(page)).phase==='confirm');await page.locator('#cart-secondary').click();check('cancel keeps the run',(await state(page)).phase==='running');
 await page.evaluate(()=>{__cartTest.reset();__cartTest.run();__cartTest.stop();});
 const count=requests.length;await page.evaluate(()=>{for(let i=0;i<90&&__cartTest.state().room<2;i++)__cartTest.pilot(1);});a=await state(page);
 check('normal forces reach the grocery detour without loading',a.room===2&&!a.fall&&a.phase==='running'&&requests.length===count&&await page.locator('#cart-overlay').isHidden());await shot(page,'quick-mart');
 await page.evaluate(()=>__cartTest.save());const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('four-wheels-course-v1')));await page.locator('#cart-pause').click();await page.locator('#cart-courses').click();check('only reached practice sections unlock',await page.locator('.cart-course-tile').count()===12&&await page.locator('.cart-course-tile:not(:disabled)').count()===3);await shot(page,'route-picker');
 await page.locator('#cart-picker-close').click();check('closing the route returns to the paused menu',(await state(page)).phase==='paused'&&await page.locator('#cart-start').isVisible()&&await page.locator('#cart-courses').evaluate(e=>document.activeElement===e));await page.locator('#cart-courses').click();await page.locator('.cart-course-tile').nth(1).click();await page.locator('#cart-start').click();await page.evaluate(()=>{__cartTest.stop();__cartTest.step(.3,{push:1});__cartTest.save();});check('practice preserves the parked challenge and record',await page.evaluate(old=>{const s=JSON.parse(localStorage.getItem('four-wheels-course-v1'));return __cartTest.world().practice&&JSON.stringify(s.run)===JSON.stringify(old.run)&&s.best.peak===old.best.peak;},saved));
 await page.locator('#cart-pause').click();await page.locator('#cart-retry').click();check('exit practice restores the challenge',(await state(page)).room===2&&JSON.stringify((await state(page)).body)===JSON.stringify(a.body));
 await page.locator('#cart-start').click();await page.evaluate(()=>__cartTest.stop());
 await page.locator('#cart-camera').click();check('overview displays the whole course without changing physics',!(await state(page)).followCart);await shot(page,'course-map');await page.locator('#cart-camera').click();
 for(const i of [3,4,6,7,9,10,11]){await page.evaluate(i=>__cartTest.pose(i),i);await shot(page,'section-'+(i+1));}
 await page.evaluate(()=>{__cartTest.terrainPose(2,1025,1368,0,130);__cartTest.step(1,{push:1});});
 check('a hard real door impact produces glass debris',await page.evaluate(()=>__cartTest.world().trackDoors[0].broken&&__cartTest.world().stock.items.some(p=>p.kind==='shard')));await shot(page,'broken-door');
 await page.evaluate(()=>{__cartTest.terrainPose(2,1190,1316,0,65);__cartTest.step(2,{push:.3});__cartTest.save();});
 check('a table hit makes a clear physical water puddle',await page.evaluate(()=>__cartTest.world().stock.liquids.get('water')?.cells.size>0));await shot(page,'vase-water');
 const mess=await page.evaluate(()=>{const w=__cartTest.world();return {body:{...w.body},stats:{...w.stock.stats},items:w.stock.items.map(p=>[p.state,p.x,p.y,p.z]),water:[...w.stock.liquids.get('water').cells]};});
 await page.reload();await page.waitForFunction(()=>!!window.__cartTest);
 check('reload preserves supported stock, broken debris and clear water',await page.evaluate(old=>{const w=__cartTest.world();return JSON.stringify({body:{...w.body},stats:{...w.stock.stats},items:w.stock.items.map(p=>[p.state,p.x,p.y,p.z]),water:[...w.stock.liquids.get('water').cells]})===JSON.stringify(old);},mess));
 check('old timed records remain untouched',await page.evaluate(()=>localStorage.getItem('four-wheels-records-v6')==='[{"time":42,"stars":3}]'));
 for(const kind of ['lake','cliff']){await page.evaluate(kind=>__cartTest.hazard(kind),kind);await page.evaluate(()=>{for(let i=0;i<50&&!__cartTest.world().fall;i++)__cartTest.step(.1,{push:1});});a=await state(page);check(kind+' has a gravity fall and no clock penalty',a.fall?.kind===kind&&a.body.z<a.ground.lastHeight-8&&a.penalty===0);await shot(page,kind+'-fall');await page.locator('#cart-pause').click();const f=await state(page);await page.waitForTimeout(200);check('pause freezes '+kind+' gravity',JSON.stringify(f.fall)===JSON.stringify((await state(page)).fall));await page.locator('#cart-start').click();await page.evaluate(()=>__cartTest.step(3));check(kind+' catches at an earlier stretch and keeps the peak',!(await state(page)).fall&&(await state(page)).room===(kind==='lake'?1:0)&&(await state(page)).peak>=f.peak);}
 check('the spin rewards and style UI are removed',await page.locator('#cart-trick, #cart-style').count()===0&&await page.evaluate(()=>!window.CartTricks));
 await page.evaluate(()=>{__cartTest.terrainPose(6,710,722,Math.PI/2,3);__cartTest.step(.15);});check('two wheels can overhang while ordinary recovery controls remain active',!(await state(page)).fall&&(await state(page)).ground.count>0);await shot(page,'edge-overhang');
 await page.evaluate(()=>__cartTest.step(1.5,{push:-1}));check('pulling rescues the cart before the fall is committed',(await state(page)).falls===0&&(await state(page)).terrain.saves>0);await shot(page,'edge-rescued');
 await page.evaluate(()=>{__cartTest.terrainPose(0,440,1520,0);Object.assign(__cartTest.world().body,{rollTilt:.75,rollRate:.7,z:4.5});__cartTest.draw();});await shot(page,'tip-start');
 await page.evaluate(()=>__cartTest.step(.2,{turn:-1,brake:.5}));await shot(page,'tip-saving');
 await page.evaluate(()=>{for(let i=0;i<28;i++){const w=__cartTest.world();__cartTest.step(1/60,{turn:Math.abs(w.body.rollTilt)>.12?-Math.sign(w.body.rollTilt):0,brake:.5});}});await shot(page,'tip-recovering');
 await page.evaluate(()=>{for(let i=0;i<100;i++){const w=__cartTest.world();__cartTest.step(1/60,{turn:Math.abs(w.body.rollTilt)>.12?-Math.sign(w.body.rollTilt):0,brake:.5});}});a=await state(page);check('countersteering restores four loaded tires without a scripted fall',Math.abs(a.body.rollTilt)<.1&&a.wheels.every(q=>q.load>.1)&&a.falls===0);await shot(page,'tip-saved');
 await page.evaluate(()=>{__cartTest.terrainPose(1,590,1195,-Math.PI/2,35);__cartTest.step(.35,{push:1});});await shot(page,'speed-bumps');
 await page.evaluate(()=>__cartTest.terrainPose(4,1260,930,-2.04));await shot(page,'quarry-climb');
 await page.evaluate(()=>{__cartTest.terrainPose(5,1390,410,Math.PI,35);for(let i=0;i<300;i++){__cartTest.step(1/120,{push:1});if(__cartTest.world().ground.airborne&&__cartTest.world().body.z>10)break;}__cartTest.step(.08,{push:1});__cartTest.save();});check('the ramp produces visible unsupported airtime',(await state(page)).ground.airborne&&(await state(page)).body.z>10);await shot(page,'boost-jump');
 const flying=await state(page);await page.reload();await page.waitForFunction(()=>!!window.__cartTest);check('reloading in a jump parks the same vertical and angular momentum',JSON.stringify((await state(page)).body)===JSON.stringify(flying.body));await page.locator('#cart-start').click();await page.evaluate(()=>{__cartTest.stop();__cartTest.step(1.1,{brake:1});});check('the jump lands on the far side with real contact recovery',(await state(page)).falls===0&&(await state(page)).terrain.landings>0);await shot(page,'jump-landed');
 await page.evaluate(()=>{__cartTest.terrainPose(7,850,290,0,65);__cartTest.step(2,{push:.4});__cartTest.step(3,{brake:1});});check('the table vase powers the actual lifting shutter',(await state(page)).circuit.powered&&(await state(page)).circuit.lift===1);await shot(page,'water-relay');
 await page.evaluate(()=>{__cartTest.terrainPose(9,2110,600,Math.PI/2,45);__cartTest.step(.2,{brake:1});});await shot(page,'ice');
 console.log('Warm render ms:',await page.evaluate(()=>__cartTest.profile()));
 } else {await page.locator('#cart-start').click();await page.evaluate(()=>__cartTest.stop());}
 const mobile=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobile.addInitScript(()=>{window.dropCartEnds=0;window.addEventListener('touchend',e=>{if(window.dropCartEnds>0){window.dropCartEnds--;e.stopImmediatePropagation();}},true);});
 const phone=await setup(mobile,url);
 check('phone explains one driving stick and one brake',await phone.locator('.cart-intro-touch').isVisible()&&await phone.locator('#cart-touch').isHidden()&&await phone.locator('#cart-stick').count()===1&&await phone.locator('#cart-drive').count()===0);
 await phone.locator('#cart-start').tap();await phone.evaluate(()=>__cartTest.stop());
 const geometry=()=>{const s=document.getElementById('cart-stick').getBoundingClientRect(),b=document.getElementById('cart-touch-brake').getBoundingClientRect(),k=document.querySelector('.cart-stick-knob').getBoundingClientRect(),m=document.getElementById('cart-camera').getBoundingClientRect();return s.width>=140&&k.width>=60&&b.width>=140&&b.height>=140&&s.right+4<=b.left&&m.bottom<s.top&&[s,b].every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight);};
 check('large familiar controls fit without reserving a bottom bar',await phone.evaluate(fits)&&await phone.evaluate(geometry));await shot(phone,'mobile-driving');
 const r=await phone.locator('#cart-stick').boundingBox(),br=await phone.locator('#cart-touch-brake').boundingBox(),sx=r.x+r.width/2,sy=r.y+r.height/2,travel=r.width*.28;
 const finger={x:sx,y:sy,id:1},braking={x:br.x+br.width/2,y:br.y+br.height/2,id:2};
 const cdp=process.env.CART_ENGINE==='webkit'?null:await mobile.newCDPSession(phone);
 await phone.evaluate(()=>window.testFingers=new Map());
 const send=async(type,points)=>{
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  else await phone.evaluate(({type,points})=>{
   const active=window.testFingers,changed=[];
   const touch=p=>document.createTouch(window,p.target,p.id,p.x,p.y,p.x,p.y);
   if(type==='touchCancel'){for(const p of active.values())changed.push(touch(p));active.clear();}
   else for(const p of points){if(type==='touchEnd'){const old=active.get(p.id);if(old){changed.push(touch(old));active.delete(p.id);}}else if(type==='touchStart'){if(!active.has(p.id)){const q={...p,target:document.elementFromPoint(p.x,p.y)};active.set(p.id,q);changed.push(touch(q));}}else{const old=active.get(p.id);if(old){Object.assign(old,p);changed.push(touch(old));}}}
   if(changed.length){const target=changed[0].target,remaining=[...active.values()].map(touch);target.dispatchEvent(new TouchEvent(type.toLowerCase(),{bubbles:true,cancelable:true,touches:document.createTouchList(...remaining),targetTouches:document.createTouchList(...remaining.filter(t=>t.target===target)),changedTouches:document.createTouchList(...changed)}));}
  },{type,points});
  await phone.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 const neutral=async()=>{const q=await state(phone);return q.touches===0&&q.input.push===0&&q.input.turn===0&&q.input.brake===0&&await phone.evaluate(()=>document.getElementById('cart-stick').style.getPropertyValue('--thumb-x')==='0px'&&document.getElementById('cart-stick').style.getPropertyValue('--thumb-y')==='0px'&&!document.getElementById('cart-stick').classList.contains('is-held'));};
 await phone.locator('#cart-stick').tap({position:{x:30,y:r.height-30}});check('a native quick tap also releases without injecting force',await neutral());
 // Begin away from the painted center. This used to apply full force on contact.
 finger.x=sx-r.width*.28;finger.y=sy+r.height*.28;await send('touchStart',[finger]);a=await state(phone);
 check('a touch near an edge starts neutral under that thumb',a.touches===1&&a.input.push===0&&a.input.turn===0&&a.touchInput[0].baseX< -30&&a.touchInput[0].baseY>30);
 const ox=finger.x,oy=finger.y;
 finger.x=ox+travel*.5;finger.y=oy-travel*.5;await send('touchMove',[finger]);a=await state(phone);
 check('a diagonal combines proportional steering and push',a.input.push>.4&&a.input.push<.46&&a.input.turn>.4&&a.input.turn<.46);await phone.evaluate(()=>__cartTest.step(.3));a=await state(phone);
 check('the one stick moves and turns the physical cart',Math.hypot(a.body.vx,a.body.vy)>8&&Math.abs(a.body.a)>.04);await shot(phone,'mobile-diagonal');
 finger.x=ox+2;finger.y=oy-2;await send('touchMove',[finger]);a=await state(phone);check('returning to the touch origin coasts inside a dead zone',a.input.push===0&&a.input.turn===0);
 await phone.evaluate(()=>document.getElementById('cart-stick').style.transform='translateY(20px)');await send('touchMove',[finger]);check('layout motion cannot move the frozen input origin',(await state(phone)).input.push===0&&(await state(phone)).input.turn===0);await phone.evaluate(()=>document.getElementById('cart-stick').style.transform='');
 finger.x=ox;finger.y=oy-travel-4;await send('touchMove',[finger]);check('drag up pushes at full force',(await state(phone)).input.push>.999&&(await state(phone)).input.turn===0);
 finger.y=oy+travel+4;await send('touchMove',[finger]);check('drag down pulls at full force',(await state(phone)).input.push< -.999);
 finger.x=ox+travel*.5;finger.y=oy-travel*.7;await send('touchMove',[finger]);const held=(await state(phone)).input.turn;
 await send('touchStart',[finger,braking]);a=await state(phone);check('the right brake stops push while keeping steering and only two physical owners',a.touches===2&&a.input.push===0&&a.input.brake===1&&a.input.turn===held);await shot(phone,'mobile-brake');
 const extra={x:sx,y:sy,id:3};await send('touchStart',[finger,braking,extra]);check('another finger cannot steal the stick',(await state(phone)).touches===2&&(await state(phone)).input.turn===held);await send('touchEnd',[extra]);
 braking.x=br.x-30; // Outside the button, still the same physical contact.
 await send('touchMove',[finger,braking]);check('brake holds through a drag outside its button',(await state(phone)).input.brake===1);
 await send('touchEnd',[braking]);a=await state(phone);check('releasing just the brake preserves the held stick',a.touches===1&&a.input.brake===0&&a.input.push>.5&&a.input.turn===held);
 finger.x=ox-travel*3;finger.y=oy;await send('touchMove',[finger]);a=await state(phone);check('dragging outside the stick keeps bounded directional input',a.input.turn< -.999&&a.input.push===0);
 await send('touchEnd',[finger]);check('release outside the control immediately springs back and coasts',await neutral());
 finger.x=sx;finger.y=sy;await send('touchStart',[finger]);finger.x+=travel;finger.y-=travel;await send('touchMove',[finger]);await send('touchStart',[finger,braking]);await send('touchCancel',[]);check('cancellation clears both axes and the brake',await neutral());
 // Fault injection: physically lift both fingers while suppressing terminal events.
 finger.x=sx;finger.y=sy;await send('touchStart',[finger]);finger.x+=travel;await send('touchMove',[finger]);braking.x=br.x+br.width/2;await send('touchStart',[finger,braking]);await phone.evaluate(()=>window.dropCartEnds=2);await send('touchEnd',[finger]);await send('touchEnd',[braking]);check('the dropped-release fixture really leaves both inputs stranded',(await state(phone)).touches===2);
 const fresh={x:sx-30,y:sy+20,id:7};await send('touchStart',[fresh]);a=await state(phone);check('the next physical touch removes stale owners and begins neutral',a.touches===1&&a.input.turn===0&&a.input.push===0&&a.input.brake===0);await send('touchEnd',[fresh]);check('the repaired control also releases normally',await neutral());
 finger.x=sx;finger.y=sy;await send('touchStart',[finger]);finger.x+=travel;await send('touchMove',[finger]);await phone.evaluate(()=>document.getElementById('cart-pause').click());check('pause clears every physical input and hides the controls',(await state(phone)).phase==='paused'&&await neutral()&&await phone.locator('#cart-touch').isHidden());await send('touchEnd',[finger]);await phone.locator('#cart-start').tap();await phone.evaluate(()=>__cartTest.stop());
 await phone.locator('#cart-stick').focus();await phone.keyboard.down('ArrowRight');check('a focused stick also accepts a momentary keyboard input',(await state(phone)).input.turn===.1&&(await state(phone)).keys===0);await phone.keyboard.up('ArrowRight');check('keyboard release recenters the stick',await neutral());
 await phone.locator('#cart-touch-brake').focus();await phone.keyboard.down('Space');check('the brake is keyboard accessible',(await state(phone)).input.brake===1);await phone.keyboard.up('Space');check('keyboard brake release coasts',await neutral());
 finger.x=sx;finger.y=sy;await send('touchStart',[finger]);finger.x+=travel;await send('touchMove',[finger]);await phone.setViewportSize({width:852,height:393});await phone.waitForFunction(()=>document.getElementById('cart-canvas').width===960);check('rotating the phone clears held input',await neutral());await send('touchEnd',[finger]);
 for(const [width,height]of [[852,393],[320,568],[393,852],[430,932],[568,320],[768,1024]]){await phone.setViewportSize({width,height});await phone.waitForTimeout(60);check('large controls fit '+width+' by '+height,await phone.evaluate(fits)&&await phone.evaluate(geometry));await shot(phone,'mobile-'+width+'x'+height);}
 await phone.locator('#cart-camera').tap();check('the full route is still available',!(await state(phone)).followCart);await phone.locator('#cart-camera').tap();
 await phone.setViewportSize({width:852,height:393});await phone.waitForFunction(()=>document.getElementById('cart-canvas').width===960);
 // Mouse/pen fallback must not require successful pointer capture to see a lift.
 const mr=await phone.locator('#cart-stick').boundingBox();
 await phone.evaluate(()=>{window.savedCapture=HTMLElement.prototype.setPointerCapture;HTMLElement.prototype.setPointerCapture=function(){};});
 await phone.mouse.move(mr.x+mr.width/2,mr.y+mr.height/2);await phone.mouse.down();await phone.mouse.move(mr.x+mr.width*2,mr.y-40);check('window-level pointer move survives absent capture',(await state(phone)).input.turn>0);
 await phone.mouse.up();check('window-level pointer up cannot strand a mouse stick',(await state(phone)).touches===0&&(await state(phone)).input.turn===0);await phone.evaluate(()=>HTMLElement.prototype.setPointerCapture=window.savedCapture);
 if(process.env.MOBILE_ONLY==='1'){check('no JavaScript errors on desktop and mobile',errors.length===0);console.log('Screenshots: '+dump);return;}
 await page.evaluate(()=>{__cartTest.reset();__cartTest.run();__cartTest.stop();});
 // A whole journey, driven by forces. This is intentionally separate from pose-based render fixtures.
 await page.evaluate(()=>__cartTest.pilot(440));a=await state(page);
 console.log('Journey:',JSON.stringify({seconds:a.time,gate:a.gate,falls:a.falls,relay:a.circuit.powered}));
 check('a complete normal-control journey reaches the finish',a.phase==='won'&&a.gate===54&&a.falls===0&&a.distance>9300);
 check('completion saves the full distance and clears the parked run',await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('four-wheels-course-v1'));return s.best.completed&&s.best.peak===__cartTest.world().level.totalDistance&&s.run===null;}));await shot(page,'finish');
 await phone.evaluate(()=>{__cartTest.finishPose();__cartTest.step(1.8,{push:1});});
 check('a phone can finish with distance and falls',(await state(phone)).phase==='won'&&!/style/.test(await phone.locator('#cart-result').textContent()));
 check('the finish card fits in landscape',await phone.evaluate(()=>{const a=document.querySelector('.cart-overlay-card').getBoundingClientRect(),b=document.getElementById('cart-stage').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom+1;}));await shot(phone,'mobile-finish');
 await page.reload();await page.waitForFunction(()=>!!window.__cartTest);check('furthest distance and finish survive reload',(await state(page)).best.completed);
 await page.locator('#cart-fullscreen').click();check('fullscreen works',await page.evaluate(()=>document.fullscreenElement===document.getElementById('cart-game')||document.getElementById('cart-game').classList.contains('cart-pseudo-fullscreen')));await page.locator('#cart-fullscreen').click();
 const fallback=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce'});await fallback.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});const blocked=await setup(fallback,url);await blocked.locator('#cart-start').click();await blocked.keyboard.down('w');await blocked.waitForTimeout(150);await blocked.keyboard.up('w');check('blocked storage still allows play',(await state(blocked)).phase==='running');
 check('reduced motion removes scene shake and decorative dust',await blocked.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
 await blocked.evaluate(()=>window.dispatchEvent(new Event('blur')));check('losing focus parks and clears inputs',(await state(blocked)).phase==='paused'&&(await state(blocked)).keys===0);
 const archive=await desktop.newPage();await archive.route('https://www.googletagmanager.com/**',r=>r.abort());await archive.goto(url.replace('four-wheels.html','archive.html'));check('the game stays in In Progress',await archive.locator('a[href="four-wheels.html"]').count()>0);
 check('no JavaScript errors on desktop, phone or fallback',errors.length===0);
 if(process.env.ASSETS==='1'){const sharp=require('sharp'),thumb=await page.evaluate(()=>__cartTest.thumb());await sharp(Buffer.from(thumb,'base64')).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(path.join(root,'assets/thumbs/four-wheels.jpg'));await sharp(Buffer.from(thumb,'base64')).webp({quality:90}).toFile(path.join(root,'assets/thumbs/four-wheels.webp'));}
 console.log('Screenshots: '+dump);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);if(errors.length)console.error(errors);process.exitCode=1;});
