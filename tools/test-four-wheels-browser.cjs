// Owns and closes Chrome for Testing. Test hooks exist only in this local server.
// NODE_PATH=/path/to/node_modules DUMP=/tmp/four-wheels-qa ASSETS=1 node tools/test-four-wheels-browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const pilot=require('./four-wheels-driver.cjs');
const root=path.resolve(__dirname,'..'),dump=process.env.DUMP||'/tmp/four-wheels-qa';fs.mkdirSync(dump,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const errors=[],requests=[];
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try {
  let data=process.env.SOURCE_INDEX?execFileSync('git',['show',':'+path.relative(root,file)],{cwd:root,env:{...process.env,GIT_INDEX_FILE:process.env.SOURCE_INDEX},maxBuffer:32*1024*1024}):fs.readFileSync(file);
  if(file.endsWith('/js/four-wheels.js')) {
   const source=data.toString(),end=source.lastIndexOf('})();');
   data=source.slice(0,end)+`
    const testPilot=${pilot.toString()};
    window.__cartTest={
     state:()=>({phase,index:levelIndex,room:world.roomIndex,narrowCamera,followCart,body:{...world.body},wheels:world.wheels.map(q=>({...q})),gait:{...world.gait},gate:world.gate,time:world.time,penalty:world.penalty,messes:world.messes,fall:world.fall,falls:world.falls,practice:world.practice,records,keys:keys.size,touches:touches.size,contacts:world.boundaryContacts}),
     world:()=>world,draw,reset,run,events,stop:()=>{cancelAnimationFrame(raf);raf=0;},
     step:(seconds,input={})=>{cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.ceil(seconds*120)&&phase==='running';i++){world.step(1/120,input);events();tickEffects(1/120);}draw();updateUI();},
     pilot:(seconds)=>{cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.ceil(seconds*120)&&phase==='running';i++){world.step(1/120,testPilot(world));events();tickEffects(1/120);}draw();updateUI();},
     exit:()=>{world.gate=world.level.gates.length;Object.assign(world.body,{...world.exit.approach,a:world.exit.a,vx:0,vy:0,omega:0});world.wheels.forEach(q=>{q.a=world.exit.a;q.omega=0;});},
     crossing:()=>{reset(0);run();cancelAnimationFrame(raf);raf=0;const p=world.level.portals[0];world.gate=p.opensAt;Object.assign(world.body,{x:430,y:p.y,a:0,vx:60,vy:0,omega:0});world.wheels.forEach(q=>{q.a=0;q.roll=123;});world.stock.spill('wine',130,220,12);draw();updateUI();},
     hazard:(kind)=>{reset(kind==='lake'?3:2);run();cancelAnimationFrame(raf);raf=0;const r=world.level.rooms[kind==='lake'?3:2];world.safePose={...r.spawn};const h=world.level.hazards[0];Object.assign(world.body,{x:kind==='lake'?h.x-h.rx-9:r.x+462,y:kind==='lake'?h.y:r.y+220,a:0,vx:70,vy:0,omega:0});world.wheels.forEach(q=>{q.a=0;q.omega=0;});draw();updateUI();},
     renderFrame:()=>{const c=document.createElement('canvas');c.width=960;c.height=600;view.draw(c.getContext('2d'),world,floor,{preview:true,follow:true});return c.toDataURL().split(',')[1];},
     frames:(kind)=>{__cartTest.hazard(kind);const frames=[];for(let i=0;i<36;i++){world.step(1/120);world.step(1/120);world.step(1/120);world.step(1/120);frames.push(__cartTest.renderFrame());}events();draw();updateUI();return frames;},
     profile:()=>{const c=document.createElement('canvas');c.width=960;c.height=600;const g=c.getContext('2d');for(let i=0;i<5;i++)view.draw(g,world,floor,{follow:true});const t=performance.now();for(let i=0;i<30;i++)view.draw(g,world,floor,{follow:true});return (performance.now()-t)/30;},
     thumb:()=>{reset(3);const h=world.level.hazards[0];Object.assign(world.body,{x:h.x-h.rx-25,y:h.y+5,a:-.3});world.wheels.forEach((q,i)=>q.a=-.3+i*.25);const c=document.createElement('canvas');c.width=1200;c.height=750;view.draw(c.getContext('2d'),world,floor,{preview:true,follow:true});return c.toDataURL().split(',')[1];}
    };
   `+source.slice(end);
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch(e){res.writeHead(404).end();}
});
let browser;
function check(name,condition){assert.ok(condition,name);console.log('PASS '+name);}
async function setup(context,url){await context.route('https://www.googletagmanager.com/**',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.goto(url);await page.waitForFunction(()=>!!window.__cartTest);await page.evaluate(()=>document.fonts.ready);return page;}
const state=p=>p.evaluate(()=>__cartTest.state());
const shot=(p,name)=>p.locator('#cart-game').screenshot({path:path.join(dump,name+'.png')});
const fits=()=>{const game=document.getElementById('cart-game').getBoundingClientRect(),stage=document.getElementById('cart-stage').getBoundingClientRect(),c=document.getElementById('cart-canvas');return game.top>=0&&game.bottom<=innerHeight+1&&game.height>innerHeight*.9&&Math.abs(c.height/c.width-stage.height/stage.width)<.003&&document.documentElement.scrollWidth<=innerWidth;};
(async()=>{try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/four-wheels.html';
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'});
 const desktop=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await desktop.addInitScript(()=>{localStorage.setItem('four-wheels-records-v4','[{"time":50,"stars":3}]');});
 const page=await setup(desktop,url);
 check('the game boots one connected world and the higher isometric camera',await page.evaluate(()=>__cartTest.world().level.connected&&__cartTest.world().level.rooms.length===6&&CartView.CAMERA.vertical/CartView.CAMERA.horizontal>.75));
 check('the game fills the desktop viewport without stretching its pixel camera',await page.evaluate(fits));
 check('the opening describes wheel checkpoints and connected rooms',/any wheel/.test(await page.locator('#cart-overlay-text').textContent())&&/doorway/.test(await page.locator('#cart-overlay-text').textContent()));
 check('practice starts unticked',!(await page.locator('#cart-practice').isChecked()));await shot(page,'desktop-start');
 await page.setViewportSize({width:1280,height:720});
 check('the opening card fits on a short laptop',await page.evaluate(()=>{const a=document.querySelector('.cart-overlay-card').getBoundingClientRect(),b=document.getElementById('cart-stage').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom+1;}));
 await page.setViewportSize({width:1440,height:1000});await page.locator('#cart-start').click();await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');let a=await state(page);
 check('keyboard pushing advances the actual cart',Math.hypot(a.body.vx,a.body.vy)>20);const before={...a.body};
 await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');a=await state(page);
 check('steering changes heading while preserving coasting momentum',Math.abs(a.body.a-before.a)>.07&&Math.abs(Math.atan2(a.body.vy,a.body.vx)-Math.atan2(before.vy,before.vx))<.2);
 check('the shopper leans into a keyboard turn',Math.abs(a.gait.leanY)>.3);
 await page.locator('#cart-pause').click();const parked=await state(page);await page.waitForTimeout(200);const later=await state(page);
 check('pause freezes the clock, cart, wheels and gait',parked.phase==='paused'&&JSON.stringify([parked.time,parked.body,parked.wheels,parked.gait])===JSON.stringify([later.time,later.body,later.wheels,later.gait]));
 await page.locator('#cart-start').click();await page.keyboard.press('r');check('retry starts the same trip again',(await state(page)).room===0&&(await state(page)).messes===0);
 await page.evaluate(()=>{__cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world(),p=w.level.gates[0];Object.assign(w.body,{x:p.x-49,y:p.y,a:0,vx:0,vy:0,omega:0});w.wheels.forEach(q=>{q.a=0;q.omega=0;});__cartTest.step(1/120);});
 check('basket contact alone does not clear a checkpoint',(await state(page)).gate===0);
 await page.evaluate(()=>{const w=__cartTest.world(),p=w.level.gates[0];Object.assign(w.body,{x:p.x-45.7,y:p.y+12,a:0});__cartTest.step(1/120);});
 check('a gap beside the real tire keeps the checkpoint active',(await state(page)).gate===0);
 await page.evaluate(()=>{__cartTest.world().body.x+=.4;__cartTest.step(1/120);});
 check('a tiny tire overlap clears the checkpoint',(await state(page)).gate===1);await shot(page,'wheel-checkpoint');
 const nativeColors=await page.evaluate(()=>{const c=document.getElementById('cart-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let coral=0;for(let i=0;i<d.length;i+=4)if(d[i]>d[i+1]+25&&d[i+1]>d[i+2])coral++;return coral;});
 check('color occupies a substantial part of the playfield',nativeColors>15000);
 await page.evaluate(()=>__cartTest.crossing());const count=requests.length;
 const crossing=await page.evaluate(()=>{const w=__cartTest.world();window.__sameBody=w.body;window.__sameWheels=w.wheels;window.__sameStock=w.stock;return __cartTest.state();});
 await page.evaluate(()=>__cartTest.step(1.6,{push:1}));a=await state(page);
 check('driving through a door enters the next room with no overlay',a.room===1&&a.phase==='running'&&await page.locator('#cart-overlay').isHidden());
 check('crossing keeps the same cart, wheels and stock objects',await page.evaluate(()=>{const w=__cartTest.world();return w.body===__sameBody&&w.wheels===__sameWheels&&w.stock===__sameStock;}));
 check('momentum, rolling distances and the clock continue through the seam',a.body.vx>50&&a.wheels.every(q=>q.roll>123)&&a.time>crossing.time+1.5&&a.gate===3);
 check('rooms need no new requests during a crossing',requests.length===count);
 check('the HUD follows the new room',/Room 02/.test(await page.locator('#cart-course-number').textContent())&&await page.locator('#cart-course-title').textContent()==='Endcap trouble');await shot(page,'doorway-crossing');
 await page.locator('#cart-courses').click();check('all six starting rooms are available',await page.locator('.cart-course-tile').count()===6);await shot(page,'room-picker');
 check('room previews use the isometric renderer',await page.evaluate(()=>[...document.querySelectorAll('.cart-course-tile canvas')].every(c=>c.width===720&&c.height===580)));
 await page.locator('.cart-course-tile').nth(3).click();await page.locator('#cart-start').click();await page.evaluate(()=>__cartTest.stop());await shot(page,'lake-room');
 check('the whole connected map can be opened during play',await page.locator('#cart-camera').isVisible());const mapBefore=await state(page);await page.locator('#cart-camera').click();const mapAfter=await state(page);
 check('the map changes the view without advancing physics',!mapAfter.followCart&&JSON.stringify([mapBefore.body,mapBefore.time,mapBefore.gait])===JSON.stringify([mapAfter.body,mapAfter.time,mapAfter.gait]));await shot(page,'connected-map');
 await page.locator('#cart-camera').click();
 const frameSets={};
 for(const kind of ['lake','cliff']) {
  await page.evaluate(kind=>__cartTest.hazard(kind),kind);await page.evaluate(()=>__cartTest.step(.35,{push:1,turn:1}));a=await state(page);
  check(kind+' takes away support and draws the falling cart',a.fall?.kind===kind&&a.body.z< -7&&Math.abs(a.body.pitch)+Math.abs(a.body.rollTilt)>.1&&a.penalty===8);await shot(page,kind+'-fall');
  await page.locator('#cart-pause').click();const falling=await state(page);await page.waitForTimeout(150);
  check('pause also freezes a '+kind+' fall',JSON.stringify(falling.fall)===JSON.stringify((await state(page)).fall));await page.locator('#cart-start').click();
  await page.evaluate(()=>__cartTest.step(1));a=await state(page);
  check(kind+' returns to a safe entrance with one penalty',a.fall===null&&a.phase==='running'&&a.penalty===8&&a.falls===1&&a.body.z===0);await shot(page,kind+'-recovery');
  if(process.env.ASSETS==='1')frameSets[kind]=await page.evaluate(kind=>__cartTest.frames(kind),kind);
 }
 await page.evaluate(()=>{__cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world();Object.assign(w.body,{x:72,y:157,a:0,vx:0,vy:0,omega:0});w.wheels.forEach(q=>{q.a=0;q.omega=0;});__cartTest.step(.8,{push:1});__cartTest.step(3.2);});
 check('the first-room vase still breaks and leaves clear physical water',await page.evaluate(()=>{const w=__cartTest.world();return w.stock.stats.broken===1&&w.stock.liquids.get('water').cells.size>40&&!w.shelves[0].down;}));await shot(page,'vase-puddle');
 console.log('Connected render profile: '+(await page.evaluate(()=>__cartTest.profile())).toFixed(2)+' ms/frame.');
 await page.evaluate(()=>{document.getElementById('cart-practice').checked=false;__cartTest.reset(0);__cartTest.run();__cartTest.stop();});
 const visited=new Set([0]);let trip;
 for(let i=0;i<30;i++) {
  await page.evaluate(()=>__cartTest.pilot(10));trip=await state(page);visited.add(trip.room);
  if(trip.phase==='won')break;
  check('the trip keeps rolling through gameplay chunk '+(i+1),trip.phase==='running'&&await page.locator('#cart-overlay').isHidden());
 }
 check('a full browser playthrough visits all six rooms and reaches checkout',trip.phase==='won'&&visited.size===6&&trip.falls===0);
 await shot(page,'full-trip-checkout');
 await page.evaluate(()=>{__cartTest.reset(0);__cartTest.run();__cartTest.stop();__cartTest.exit();__cartTest.step(1.1,{push:1});});
 check('final checkout requires physically driving the whole cart out',(await state(page)).phase==='running');await page.evaluate(()=>__cartTest.step(1.2,{push:1}));a=await state(page);
 check('the final exit ends the trip and saves a new record',a.phase==='won'&&a.records[0]?.stars===3);await shot(page,'checkout');
 check('older independent-course records remain untouched',await page.evaluate(()=>JSON.parse(localStorage.getItem('four-wheels-records-v4'))[0].time===50));
 await page.reload();await page.waitForFunction(()=>!!window.__cartTest);check('trip records survive reload',(await state(page)).records[0]?.stars===3);
 await page.evaluate(()=>{__cartTest.run();__cartTest.stop();const w=__cartTest.world();w.penalty=w.level.limit;__cartTest.step(.1);});
 check('timeout provides retry and untimed practice',(await state(page)).phase==='lost'&&await page.locator('#cart-secondary').isVisible());await page.locator('#cart-secondary').click();
 check('practice starts an untimed connected trip',(await state(page)).practice);await page.evaluate(()=>__cartTest.stop());
 const mobile=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true}),phone=await setup(mobile,url);
 check('the portrait game fits without horizontal overflow',await phone.evaluate(fits));
 check('touch utilities retain 44-pixel targets',await phone.evaluate(()=>[...document.querySelectorAll('.cart-icon-button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
 await phone.locator('#cart-start').tap();check('portrait uses a closer following pixel camera',(await state(phone)).narrowCamera&&await phone.locator('#cart-canvas').getAttribute('width')==='480');await shot(phone,'mobile-driving');
 const push=await phone.locator('[data-control="push"]').boundingBox(),right=await phone.locator('[data-control="right"]').boundingBox();
 const touch=await mobile.newCDPSession(phone);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:push.x+push.width/2,y:push.y+push.height/2,id:1},{x:right.x+right.width/2,y:right.y+right.height/2,id:2}]});await phone.waitForTimeout(350);
 a=await state(phone);check('two touch pointers can push and turn together',a.touches===2&&Math.hypot(a.body.vx,a.body.vy)>10&&Math.abs(a.body.a+Math.PI/2)>.05);
 await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});check('cancelled touches release all forces',(await state(phone)).touches===0);
 await phone.evaluate(()=>__cartTest.stop());await phone.locator('#cart-camera').tap();await shot(phone,'mobile-map');check('mobile can inspect every connected room',!(await state(phone)).followCart);await phone.locator('#cart-camera').tap();
 await phone.setViewportSize({width:320,height:720});check('the smallest phone layout fits',await phone.evaluate(fits));await shot(phone,'mobile-small');
 await phone.setViewportSize({width:852,height:393});await phone.waitForFunction(()=>document.getElementById('cart-canvas').width===960);check('landscape keeps the full game and following camera usable',await phone.evaluate(fits)&&await phone.locator('#cart-camera').isVisible());await shot(phone,'mobile-landscape');
 await page.locator('#cart-fullscreen').click();check('fullscreen remains usable',await page.evaluate(()=>document.fullscreenElement===document.getElementById('cart-game')||document.getElementById('cart-game').classList.contains('cart-pseudo-fullscreen')));await page.locator('#cart-fullscreen').click();
 const fallback=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce'});await fallback.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});const blocked=await setup(fallback,url);await blocked.locator('#cart-start').click();await blocked.keyboard.down('w');await blocked.waitForTimeout(150);await blocked.keyboard.up('w');check('blocked storage and reduced motion still allow play',(await state(blocked)).phase==='running');
 await blocked.evaluate(()=>window.dispatchEvent(new Event('blur')));check('losing focus pauses and clears inputs',(await state(blocked)).phase==='paused'&&(await state(blocked)).keys===0);
 const archive=await desktop.newPage();await archive.route('https://www.googletagmanager.com/**',r=>r.abort());await archive.goto(url.replace('four-wheels.html','archive.html'));check('the game stays listed in In Progress',await archive.locator('a[href="four-wheels.html"]').count()>0);
 check('no JavaScript errors during desktop, touch or fallback play',errors.length===0);
 if(process.env.ASSETS==='1') {
  const sharp=require('sharp');
  for(const [kind,frames]of Object.entries(frameSets)){const raw=await Promise.all(frames.map(p=>sharp(Buffer.from(p,'base64')).ensureAlpha().raw().toBuffer()));await sharp(Buffer.concat(raw),{raw:{width:960,height:600*raw.length,channels:4,pageHeight:600}}).gif({delay:raw.map(()=>30),loop:0}).toFile(path.join(dump,kind+'-fall.gif'));}
  const thumb=await page.evaluate(()=>__cartTest.thumb());await sharp(Buffer.from(thumb,'base64')).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(path.join(root,'assets/thumbs/four-wheels.jpg'));
  console.log('Wrote the connected-store thumbnail.');
 }
 console.log('Screenshots: '+dump);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);if(errors.length)console.error(errors);process.exitCode=1;});
