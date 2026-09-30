// Browser checks using an owned Chrome for Testing process, closed in finally.
// NODE_PATH=/path/to/node_modules node tools/test-four-wheels-browser.cjs
// DUMP defaults to /tmp/four-wheels-qa. Test hooks exist only in this server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP || '/tmp/four-wheels-qa';
fs.mkdirSync(dump, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const errors = [];
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = process.env.SOURCE_INDEX ? execFileSync('git', ['show', ':' + path.relative(root, file)], { cwd: root, env: { ...process.env, GIT_INDEX_FILE: process.env.SOURCE_INDEX }, maxBuffer: 32 * 1024 * 1024 }) : fs.readFileSync(file);
    if (file.endsWith('/js/four-wheels.js')) {
      let source = data.toString(); const end = source.lastIndexOf('})();');
      source = source.slice(0, end) + `
      window.__cartTest = {
        state: () => ({ phase, index:levelIndex, body:{...world.body}, gait:{...world.gait}, wheels:world.wheels, time:world.time, gate:world.gate, messes:world.messes, penalty:world.penalty, practice:world.practice, touch:touches.size, keys:keys.size, records, canSave, remaining:world.remaining, objects:world.objects, contacts:world.boundaryContacts, exitOpen:world.exitOpen, exiting:world.exiting }),
        stop: () => { cancelAnimationFrame(raf); raf=0; },
        crashScene: () => {
          cancelAnimationFrame(raf);raf=0;
          const level={...levels[0],name:'Stock collision check',start:{x:150,y:150,a:0},shelves:[{x:220,y:107,w:40,h:86,stock:'groceries',label:'WINE & SAUCES'}],objects:[],signs:[],gates:[{x:420,y:250}]};
          world=new World(level,true);floor=makeFloor(level);phase='running';particles=[];world.body.vx=60;draw();updateUI();
        },
        vaseScene: () => {
          reset(0);run();
          cancelAnimationFrame(raf);raf=0;
          const level={...levels[0],start:{x:72,y:157,a:0}};
          world=new World(level,true);floor=makeFloor(level);phase='running';particles=[];draw();updateUI();
        },
        crashFrames: (vase=false) => {
          const frames=[],c=document.createElement('canvas');c.width=480;c.height=300;const g=c.getContext('2d');
          for(let i=0;i<144;i++){for(let k=0;k<5;k++)world.step(1/120,vase&&world.time<.8?{push:1}:{});draw(g,world,floor,true);frames.push(c.toDataURL('image/png').split(',')[1]);}
          events();draw();updateUI();return frames;
        },
        step: (seconds,input={}) => { cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.round(seconds*120)&&phase==='running';i++){world.step(1/120,input);events();tickEffects(1/120);}draw();updateUI(); },
        approachExit: () => { world.gate=world.level.gates.length;const q=world.exit;Object.assign(world.body,{...q.approach,a:q.a,vx:0,vy:0,omega:0});world.wheels.forEach(w=>{w.a=q.a;w.omega=0;}); },
        casterSheet: () => {
          const sheet=document.createElement('canvas');sheet.width=600;sheet.height=360;
          const g=sheet.getContext('2d');rect(g,0,0,600,360,P.floor);
          const cases=[
            {label:'FORWARD',a:0,w:[0,0,0,0]},
            {label:'SWUNG INWARD',a:0,w:[-Math.PI/2,-Math.PI/2,Math.PI/2,Math.PI/2]},
            {label:'REVERSING',a:0,w:[Math.PI,Math.PI,Math.PI,Math.PI]},
            {label:'COASTING THROUGH A TURN',a:.7,w:[.1,1.1,-.4,1.5]}
          ];
          cases.forEach((q,i)=>{g.save();g.translate(i%2*300,Math.floor(i/2)*180);text(g,q.label,150,17,P.dark,7,'center');g.scale(3,3);drawCart(g,{x:45,y:28,a:q.a,vx:0,vy:0},q.w.map(a=>({a,roll:0})));g.restore();});
          return sheet.toDataURL('image/png').split(',')[1];
        },
        walkingFrames: () => {
          const frames=[],c=document.createElement('canvas');c.width=360;c.height=216;const g=c.getContext('2d');
          const body={x:45,y:26,a:0,vx:60,vy:0,omega:0},gait={phase:0,stride:0,forward:1,sideways:0,speed:0};
          const wheels=CartPhysics.WHEELS.map(()=>({a:0,roll:0}));
          for(let i=0;i<60;i++)CartPhysics.advanceGait(gait,body,1/120,{push:1});
          for(let i=0;i<48;i++) {
            for(let j=0;j<5;j++) {CartPhysics.advanceGait(gait,body,1/120,{push:1});wheels.forEach(w=>{w.roll+=60/120;});}
            rect(g,0,0,360,216,P.floor);g.save();g.scale(4,4);drawCart(g,body,wheels,gait);g.restore();
            text(g,'WALKING / 60 PIXELS PER SECOND',180,198,P.dark,8,'center');frames.push(c.toDataURL('image/png').split(',')[1]);
          }
          return frames;
        },
        postureSheet: () => {
          const c=document.createElement('canvas');c.width=600;c.height=540;const g=c.getContext('2d');rect(g,0,0,600,540,P.floor);
          const poses=[
            {label:'STANDING',vx:0,omega:0,input:{}},
            {label:'PUSHING',vx:60,omega:0,input:{push:1}},
            {label:'PULLING BACK',vx:-40,omega:0,input:{push:-1}},
            {label:'BRAKING',vx:60,omega:0,input:{brake:1}},
            {label:'TURNING LEFT',vx:35,omega:-1.5,input:{turn:-1}},
            {label:'TURNING RIGHT',vx:35,omega:1.5,input:{turn:1}}
          ];
          poses.forEach((q,i)=>{
            const body={x:45,y:28,a:0,vx:q.vx,vy:0,omega:q.omega},gait={...new World(levels[0]).gait};
            for(let j=0;j<90;j++)CartPhysics.advanceGait(gait,body,1/120,q.input);
            g.save();g.translate(i%2*300,Math.floor(i/2)*180);text(g,q.label,150,17,P.dark,7,'center');g.scale(3,3);
            drawCart(g,body,WHEELS.map(()=>({a:0,roll:0})),gait);g.restore();
          });return c.toDataURL('image/png').split(',')[1];
        },
        motionFrames: () => {
          const frames=[],c=document.createElement('canvas');c.width=720;c.height=432;const g=c.getContext('2d');
          const poses=['PUSH / COAST','TURN LEFT','TURN RIGHT','BRAKE / PULL BACK'].map(label=>({label,body:{x:45,y:26,a:0,vx:0,vy:0,omega:0},gait:{...new World(levels[0]).gait},wheels:WHEELS.map(()=>({a:0,roll:0}))}));
          for(let i=0;i<96;i++) {
            rect(g,0,0,720,432,P.floor);
            poses.forEach((q,n)=>{
              const t=i/24,active=t<2.3,ease=Math.min(1,t*3),rest=Math.max(0,1-(t-2.3)*2);
              const input=n===0?(active?{push:t<1.3?1:0}:{}):n<3?(active?{turn:n===1?-1:1}:{}):(t<.8?{}:t<1.5?{brake:1}:active?{push:-1}:{});
              q.body.vx=n===0?60*ease*(active?1:rest):n<3?25*(active?1:rest):t<.8?60:t<1.5?60*(1-(t-.8)/.7):active?-40*Math.min(1,(t-1.5)*3):-40*rest;
              q.body.omega=n===1||n===2?(n===1?-1:1)*1.5*ease*(active?1:rest):0;
              for(let j=0;j<5;j++){CartPhysics.advanceGait(q.gait,q.body,1/120,input);q.wheels.forEach(w=>{w.roll+=q.body.vx/120;});}
              g.save();g.translate(n%2*360,Math.floor(n/2)*216);g.scale(4,4);drawCart(g,q.body,q.wheels,q.gait);g.restore();
              text(g,q.label,n%2*360+180,Math.floor(n/2)*216+198,P.dark,8,'center');
            });frames.push(c.toDataURL('image/png').split(',')[1]);
          }return frames;
        },
        reset, draw, run, world: () => world
      };
      ` + source.slice(end);
      data = Buffer.from(source);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
function check(name, condition) { assert.ok(condition, name); console.log('PASS ' + name); }
async function setup(context, url) {
  await context.route('https://www.googletagmanager.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => !!window.__cartTest); await page.evaluate(() => document.fonts.ready);
  return page;
}
(async () => {
  try {
    await listen(); const url = 'http://127.0.0.1:' + server.address().port + '/four-wheels.html';
    browser = await chromium.launch({ headless: true, executablePath: process.env.CART_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
    await desktop.addInitScript(() => { localStorage.setItem('four-wheels-records-v1', '[{"time":12,"stars":3}]');localStorage.setItem('four-wheels-records-v2', '[{"time":34,"stars":2}]');localStorage.setItem('four-wheels-records-v3', '[{"time":40,"stars":2}]'); });
    const page = await setup(desktop, url);
    const fillsOpeningViewport = () => {
      const game=document.getElementById('cart-game').getBoundingClientRect();
      const nav=document.querySelector('.cart-bottomnav').getBoundingClientRect();
      return game.top >= 0 && game.top < 16 && game.bottom <= innerHeight + 1
        && game.height > innerHeight * .9 && game.width >= Math.min(innerWidth * .95,1800)
        && nav.top >= game.bottom && !document.querySelector('.arc-banner,.u-hero,.post-header');
    };
    check('the page opens directly into a viewport-sized game with site links below', await page.evaluate(fillsOpeningViewport));
    check('the game title is inside the opening panel', await page.locator('#cart-overlay-title').textContent() === 'All Four Wheels');
    check('the interface uses paper and ink rather than the site green', await page.evaluate(() => {
      const paper=getComputedStyle(document.querySelector('.cart-toolbar')).backgroundColor;
      const shell=getComputedStyle(document.getElementById('cart-game')).backgroundColor;
      return shell==='rgb(245, 241, 234)' && getComputedStyle(document.body).backgroundColor==='rgb(41, 40, 32)' && paper!=='rgb(30, 36, 32)';
    }));
    await page.screenshot({ path: path.join(dump, 'desktop-first-screen.png') });
    await page.locator('#cart-game').scrollIntoViewIfNeeded();
    await page.locator('#cart-game').screenshot({ path: path.join(dump, 'desktop-start.png') });
    check('the new post boots and begins with an unticked practice option', await page.locator('#cart-start').isVisible() && !(await page.locator('#cart-practice').isChecked()));
    await page.setViewportSize({width:1280,height:720});
    check('the complete start panel fits on a short laptop screen', await page.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(),stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.top>=stage.top && card.bottom<=stage.bottom;
    }));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'laptop-start.png')});
    await page.setViewportSize({width:1440,height:1200});
    await page.locator('#cart-start').click(); await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
    let a = await page.evaluate(() => __cartTest.state());
    check('W applies forward force', a.body.y < 226 && a.body.vy < -30);
    await page.keyboard.down('d'); await page.waitForTimeout(550); await page.keyboard.up('d');
    a = await page.evaluate(() => __cartTest.state());
    check('keyboard rotation leaves the old direction of motion intact', a.body.a > -1 && Math.abs(a.body.vx) < 1 && a.body.vy < -20);
    check('the shopper visibly leans while steering through keyboard input', Math.abs(a.gait.leanY) > 1);
    await page.locator('#cart-sound').click();
    check('sound can be enabled after a gesture', await page.locator('#cart-sound').getAttribute('aria-pressed') === 'true');
    await page.locator('#cart-sound').click();
    await page.locator('#cart-pause').click(); const pausedTime = (await page.evaluate(() => __cartTest.state())).time;
    const pausedGait = (await page.evaluate(() => __cartTest.state())).gait;
    await page.waitForTimeout(350);
    check('pause stops the simulation and clock', (await page.evaluate(() => __cartTest.state())).time === pausedTime);
    check('pausing also freezes the shopper mid-step', JSON.stringify((await page.evaluate(() => __cartTest.state())).gait) === JSON.stringify(pausedGait));
    await page.locator('#cart-start').click(); await page.keyboard.press('r');
    check('retry resets penalties and position', (await page.evaluate(() => __cartTest.state())).messes === 0);
    await page.evaluate(() => {
      __cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world(),p=w.level.gates[0];
      Object.assign(w.body,{x:p.x,y:p.y+CartPhysics.BODY.personX,a:-Math.PI/2,vx:0,vy:0,omega:0});w.wheels.forEach(q=>{q.a=-Math.PI/2;q.omega=0;});__cartTest.step(1/120);
    });
    check('shopper contact alone does not clear the basket checkpoint', (await page.evaluate(()=>__cartTest.state())).gate===0);
    await page.evaluate(() => {
      const w=__cartTest.world(),p=w.level.gates[0];w.body.y=p.y+CartPhysics.CHECKPOINT_SENSOR.x-(CartPhysics.CHECKPOINT_RADIUS+CartPhysics.CHECKPOINT_SENSOR.radius+.5);__cartTest.step(1/120);
    });
    check('a gap before the small contact circle keeps the checkpoint active', (await page.evaluate(()=>__cartTest.state())).gate===0);
    await page.locator('#cart-game').screenshot({path:path.join(dump,'checkpoint-before-contact.png')});
    await page.evaluate(() => {__cartTest.world().body.y+=.6;__cartTest.step(1/120);});
    check('a tiny basket-marker overlap clears the checkpoint', await page.evaluate(()=>{
      const w=__cartTest.world(),p=w.level.gates[0],person=CartPhysics.point(w.body,CartPhysics.CHECKPOINT_SENSOR.x,0);
      return w.gate===1&&CartPhysics.CHECKPOINT_SENSOR.radius===4&&Math.hypot(person.x-p.x,person.y-p.y)>CartPhysics.CHECKPOINT_RADIUS;
    }));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'checkpoint-cleared.png')});
    await page.locator('#cart-courses').click();
    check('all six courses are selectable', await page.locator('.cart-course-tile').count() === 6);
    await page.locator('#cart-picker').screenshot({ path: path.join(dump, 'courses.png') });
    await page.locator('.cart-course-tile').nth(3).click();
    check('course selection opens the chosen briefing', (await page.evaluate(() => __cartTest.state())).index === 3 && await page.locator('#cart-start').isVisible());
    await page.locator('#cart-start').click();
    await page.evaluate(() => { __cartTest.stop(); __cartTest.step(1.2, {push:1}); __cartTest.step(.55,{turn:1}); });
    await page.locator('#cart-game').screenshot({ path: path.join(dump, 'wet-floor.png') });
    const casterSheet = await page.evaluate(() => __cartTest.casterSheet());
    fs.writeFileSync(path.join(dump, 'caster-details.png'), Buffer.from(casterSheet, 'base64'));
    const postureSheet = await page.evaluate(() => __cartTest.postureSheet());
    fs.writeFileSync(path.join(dump, 'shopper-postures.png'), Buffer.from(postureSheet, 'base64'));
    const walkingFrames = await page.evaluate(() => __cartTest.walkingFrames());
    const walkingDir=path.join(dump,'walking-frames');fs.mkdirSync(walkingDir,{recursive:true});
    walkingFrames.forEach((pixels,i)=>fs.writeFileSync(path.join(walkingDir,String(i).padStart(3,'0')+'.png'),Buffer.from(pixels,'base64')));
    if (process.env.ASSETS === '1') {
      const sharp=require('sharp'),raw=await Promise.all(walkingFrames.map(pixels=>sharp(Buffer.from(pixels,'base64')).ensureAlpha().raw().toBuffer()));
      // GIF timing is in 10ms units. This pattern preserves the 24fps demo.
      await sharp(Buffer.concat(raw),{raw:{width:360,height:216*raw.length,channels:4,pageHeight:216}})
        .gif({delay:raw.map((_,i)=>i%6===5?50:40),loop:0}).toFile(path.join(dump,'walking.gif'));
      const motionFrames=await page.evaluate(()=>__cartTest.motionFrames());
      const motion=await Promise.all(motionFrames.map(pixels=>sharp(Buffer.from(pixels,'base64')).ensureAlpha().raw().toBuffer()));
      await sharp(Buffer.concat(motion),{raw:{width:720,height:432*motion.length,channels:4,pageHeight:432}})
        .gif({delay:motion.map((_,i)=>i%6===5?50:40),loop:0}).toFile(path.join(dump,'shopper-motion.gif'));
    }
    const casterState = await page.evaluate(() => {
      const w=__cartTest.world();
      return w.wheels.map((q,i)=>({angle:q.a,pivot:CartPhysics.casterPose(w.body,q,i).pivot,center:CartPhysics.casterPose(w.body,q,i),trail:CartPhysics.CASTER.trail}));
    });
    check('all four rendered casters have offset tire centers and independent angles', casterState.every(q => Math.hypot(q.center.x-q.pivot.x,q.center.y-q.pivot.y) >= q.trail) && Math.abs(casterState[0].angle-casterState[3].angle) > .1);
    await page.evaluate(()=>__cartTest.crashScene());
    await page.locator('#cart-game').screenshot({path:path.join(dump,'stock-before-impact.png')});
    const crashFrames=await page.evaluate(()=>__cartTest.crashFrames());
    const crash=await page.evaluate(()=>{
      const w=__cartTest.world();return {stats:w.stock.stats,down:w.shelves[0].down,penalty:w.penalty,items:w.stock.items.filter(p=>p.state!=='shelf').length,liquids:[...w.stock.liquids.keys()]};
    });
    check('a normal-speed impact collapses a rack and leaves broken products on the floor',crash.down&&crash.stats.fallen>0&&crash.stats.broken>0&&crash.items>5&&crash.penalty===5&&crash.liquids.includes('wine'));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'stock-after-collapse.png')});
    if(process.env.ASSETS==='1') {
      const sharp=require('sharp'),raw=await Promise.all(crashFrames.map(pixels=>sharp(Buffer.from(pixels,'base64')).ensureAlpha().raw().toBuffer()));
      await sharp(Buffer.concat(raw),{raw:{width:480,height:300*raw.length,channels:4,pageHeight:300}}).gif({delay:raw.map((_,i)=>i%6===5?50:40),loop:0}).toFile(path.join(dump,'shelf-collapse.gif'));
    }
    await page.evaluate(()=>__cartTest.vaseScene());
    check('the introductory scene contains one square table and a single vase',await page.evaluate(()=>{
      const w=__cartTest.world();return w.shelves.length===1&&w.objects.length===0&&w.shelves[0].kind==='table'&&w.shelves[0].w===w.shelves[0].h&&w.stock.items.length===1&&w.stock.items[0].kind==='vase';
    }));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'vase-before-impact.png')});
    const vaseFrames=await page.evaluate(()=>__cartTest.crashFrames(true));
    check('a normal push spills the vase and leaves a physical clear-water pool',await page.evaluate(()=>{
      const w=__cartTest.world();return !w.shelves[0].down&&w.stock.stats.broken===1&&w.stock.liquids.get('water').cells.size>40&&w.stock.items.some(p=>p.source==='vase');
    }));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'vase-puddle.png')});
    if(process.env.ASSETS==='1') {
      const sharp=require('sharp'),raw=await Promise.all(vaseFrames.map(pixels=>sharp(Buffer.from(pixels,'base64')).ensureAlpha().raw().toBuffer()));
      await sharp(Buffer.concat(raw),{raw:{width:480,height:300*raw.length,channels:4,pageHeight:300}}).gif({delay:raw.map((_,i)=>i%6===5?50:40),loop:0}).toFile(path.join(dump,'vase-drop.gif'));
    }
    await page.evaluate(()=>{
      __cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world();
      Object.assign(w.body,{x:110,y:238,a:0,vx:50,vy:0,omega:0});w.wheels.forEach(q=>{q.a=0;q.omega=0;});
      for(const i of [0,2]){const p=CartPhysics.casterPose(w.body,w.wheels[i],i);w.stock.addProduct(i===0?'wine':'ketchup',p.x,p.y);}
      __cartTest.step(.8);
    });
    check('real caster contacts break wine, flatten ketchup and paint separate tire trails',await page.evaluate(()=>{
      const s=__cartTest.world().stock;return s.stats.broken>0&&s.stats.crushed>0&&s.stats.wheelContacts>0&&s.smears.length>5;
    }));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'wheels-through-stock.png')});
    const stockPause=await page.evaluate(()=>{
      const w=__cartTest.world();return JSON.stringify({items:w.stock.items.map(p=>[p.x,p.y,p.z]),shelves:w.shelves.map(s=>[s.cx,s.cy,s.tilt]),film:[...w.stock.liquids].map(([k,l])=>[k,[...l.cells]])});
    });
    await page.locator('#cart-pause').click();await page.waitForTimeout(250);
    check('pause freezes shelves, airborne stock and liquid spreading',stockPause===await page.evaluate(()=>{
      const w=__cartTest.world();return JSON.stringify({items:w.stock.items.map(p=>[p.x,p.y,p.z]),shelves:w.shelves.map(s=>[s.cx,s.cy,s.tilt]),film:[...w.stock.liquids].map(([k,l])=>[k,[...l.cells]])});
    }));
    await page.evaluate(() => {__cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world();w.gate=1;w.messes=2;w.penalty=7;w.time=50;__cartTest.step(1/120);});
    check('the HUD shows cleared markers, actual penalties and an urgent shrinking clock', await page.evaluate(() =>
      document.querySelector('#cart-route-steps i').classList.contains('is-done') && document.querySelectorAll('#cart-route-steps .is-current').length===1 &&
      document.getElementById('cart-penalty').textContent==='+7s' && document.querySelector('.cart-clock').classList.contains('is-urgent') &&
      Number(document.getElementById('cart-clock-fill').style.getPropertyValue('--clock'))<.13));
    await page.locator('#cart-game').screenshot({path:path.join(dump,'urgent-hud.png')});
    const redPixels = () => {
      const probe=document.createElement('canvas');probe.width=probe.height=1;const p=probe.getContext('2d');
      p.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--warn').trim()||'#d99090';p.fillRect(0,0,1,1);
      const expected=p.getImageData(0,0,1,1).data;
      const g=document.getElementById('cart-canvas').getContext('2d'),pixels=g.getImageData(0,0,480,300).data;let count=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]===expected[0]&&pixels[i+1]===expected[1]&&pixels[i+2]===expected[2])count++;
      return count;
    };
    await page.evaluate(() => { __cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world();Object.assign(w.body,{x:441,y:150,a:0,vx:0,vy:0,omega:0});w.wheels.forEach(q=>{q.a=0;q.omega=0;});__cartTest.step(1/120); });
    check('an exact resting edge touch turns the real collision outline red immediately', (await page.evaluate(() => __cartTest.state())).contacts.some(c=>c.side==='right'&&c.part==='cart') && await page.evaluate(redPixels)>100);
    await page.locator('#cart-game').screenshot({path:path.join(dump,'edge-contact.png')});
    await page.evaluate(() => {__cartTest.world().body.x=410;__cartTest.step(.4);});
    check('the red cue clears after moving away from the edge', (await page.evaluate(()=>__cartTest.state())).contacts.length===0 && await page.evaluate(redPixels)===0);
    await page.evaluate(() => {__cartTest.reset(0);__cartTest.run();__cartTest.stop();const w=__cartTest.world();Object.assign(w.body,{x:230,y:29.5,a:0,vx:0,vy:0,omega:0});w.wheels.forEach(q=>{q.a=Math.PI/2;q.omega=0;});__cartTest.step(1/120);});
    check('a tire brushing the edge produces the same immediate red cue', (await page.evaluate(()=>__cartTest.state())).contacts.some(c=>c.part==='wheel:0')&&await page.evaluate(redPixels)>100);
    await page.locator('#cart-game').screenshot({path:path.join(dump,'wheel-edge-contact.png')});
    if (process.env.ASSETS === '1') {
      const pixels = await page.evaluate(() => {
        __cartTest.reset(2); __cartTest.stop();
        const w=__cartTest.world(), wrap=CartPhysics.wrap, clamp=CartPhysics.clamp;
        for(let i=0;i<9.5*120;i++) {
          let target=w.level.gates[w.gate]||w.exit.approach;
          if(w.gate<w.level.gates.length){const previous=w.gate?w.level.gates[w.gate-1]:w.level.start,a=Math.atan2(target.y-previous.y,target.x-previous.x);target={x:target.x-CartPhysics.CHECKPOINT_SENSOR.x*Math.cos(a),y:target.y-CartPhysics.CHECKPOINT_SENSOR.x*Math.sin(a)};}
          const b=w.body,dx=target.x-b.x,dy=target.y-b.y,d=Math.hypot(dx,dy),speed=Math.min(62,d*1.25);
          const vx=d>1?dx/d*speed:0,vy=d>1?dy/d*speed:0,ax=(vx-b.vx)*2.1,ay=(vy-b.vy)*2.1;
          let error=wrap(Math.atan2(ay,ax)-b.a),sign=1;
          if(Math.abs(error)>Math.PI/2){error=wrap(error+Math.PI);sign=-1;}
          w.step(1/120,{turn:clamp(error*4-b.omega*1.15,-1,1),push:Math.abs(error)<.65?clamp(Math.hypot(ax,ay)/(sign===1?78:50),0,1)*sign:0,brake:Math.abs(error)>.6&&Math.hypot(b.vx,b.vy)>40?1:0});
        }
        __cartTest.draw();return document.getElementById('cart-canvas').toDataURL('image/png').split(',')[1];
      });
      const sharp=require('sharp');
      await sharp(Buffer.from(pixels,'base64')).resize(1200,750,{kernel:'nearest'}).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(path.join(root,'assets/thumbs/four-wheels.jpg'));
      console.log('Wrote game thumbnail.');
    }
    await page.evaluate(() => { __cartTest.reset(0); __cartTest.run(); __cartTest.approachExit(); __cartTest.step(1.15,{push:1}); });
    check('checkout has a physical opening and the cart can be halfway outside', (await page.evaluate(()=>__cartTest.state())).exiting && (await page.evaluate(()=>__cartTest.state())).phase==='running');
    check('a clean checkout crossing does not trigger the solid-boundary warning', (await page.evaluate(()=>__cartTest.state())).contacts.length===0 && await page.evaluate(redPixels)===0);
    await page.locator('#cart-game').screenshot({path:path.join(dump,'exit-crossing.png')});
    await page.evaluate(() => __cartTest.step(1,{push:1}));
    a = await page.evaluate(() => __cartTest.state());
    check('driving out completes a course and saves a record', a.phase === 'won' && a.records[0].stars === 3);
    check('the earlier parking records remain untouched', await page.evaluate(()=>JSON.parse(localStorage.getItem('four-wheels-records-v1'))[0].time===12));
    await page.locator('#cart-game').screenshot({ path: path.join(dump, 'checkout.png') });
    await page.reload(); await page.waitForFunction(() => !!window.__cartTest);
    check('earlier shopper-checkpoint records remain intact under their old key',await page.evaluate(()=>JSON.parse(localStorage.getItem('four-wheels-records-v2'))[0].time===34));
    check('earlier shelf course records remain intact under their old key',await page.evaluate(()=>JSON.parse(localStorage.getItem('four-wheels-records-v3'))[0].time===40));
    check('records survive reload', (await page.evaluate(() => __cartTest.state())).records[0].stars === 3);
    await page.locator('#cart-fullscreen').click();
    check('fullscreen is usable', await page.evaluate(() => document.fullscreenElement === document.getElementById('cart-game') || document.getElementById('cart-game').classList.contains('cart-pseudo-fullscreen')));
    await page.locator('#cart-fullscreen').click();
    await page.evaluate(() => { __cartTest.reset(); __cartTest.run(); __cartTest.world().penalty=65; __cartTest.step(.1); });
    check('timeout presents retry and practice actions', (await page.evaluate(() => __cartTest.state())).phase === 'lost' && await page.locator('#cart-secondary').isVisible());
    await page.locator('#cart-secondary').click();
    check('the practice action starts an untimed attempt', (await page.evaluate(() => __cartTest.state())).practice);
    await page.evaluate(() => { __cartTest.approachExit(); __cartTest.step(2,{push:1}); });
    check('practice leaves the previous timed record intact', (await page.evaluate(() => __cartTest.state())).records[0].time === a.records[0].time);
    const mobile = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const phone = await setup(mobile, url); await phone.locator('#cart-game').scrollIntoViewIfNeeded();
    check('the portrait game and touch controls fit the opening viewport', await phone.evaluate(fillsOpeningViewport));
    check('touch utility buttons have 44-pixel targets', await phone.evaluate(() => [...document.querySelectorAll('.cart-icon-button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
    check('mobile has no horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('the mobile briefing fits inside the playfield', await phone.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(), stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.left >= stage.left && card.right <= stage.right && stage.right <= innerWidth;
    }));
    await phone.locator('#cart-game').screenshot({ path: path.join(dump, 'mobile-start.png') });
    await phone.locator('#cart-start').tap();
    const push = await phone.locator('[data-control="push"]').boundingBox(), turn = await phone.locator('[data-control="right"]').boundingBox();
    const session = await mobile.newCDPSession(phone);
    const p = { x: push.x + push.width / 2, y: push.y + push.height / 2, id: 1 }, q = { x: turn.x + turn.width / 2, y: turn.y + turn.height / 2, id: 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p,q] }); await phone.waitForTimeout(650);
    a = await phone.evaluate(() => __cartTest.state());
    check('two-finger touch can push and turn at once', a.touch === 2 && a.body.a > -1 && Math.hypot(a.body.vx, a.body.vy) > 25);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    check('cancelled touches release all forces', (await phone.evaluate(() => __cartTest.state())).touch === 0);
    await phone.locator('#cart-game').screenshot({ path: path.join(dump, 'mobile-driving.png') });
    await phone.locator('#cart-pause').tap();
    await phone.locator('#cart-game').screenshot({ path: path.join(dump, 'mobile-pause.png') });
    await phone.evaluate(() => {__cartTest.reset(0);__cartTest.run();__cartTest.approachExit();__cartTest.step(2,{push:1});});
    await phone.locator('#cart-game').screenshot({path:path.join(dump,'mobile-checkout.png')});
    check('mobile checkout results fit inside the playfield', await phone.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(), stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.top>=stage.top&&card.bottom<=stage.bottom;
    }));
    await phone.setViewportSize({ width: 320, height: 720 });
    check('320px layout has no horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await phone.evaluate(()=>__cartTest.reset(4));
    check('long course titles fit the narrow toolbar and stay available to screen readers', await phone.evaluate(()=>{
      const title=document.getElementById('cart-course-title').getBoundingClientRect(),utilities=document.querySelector('.cart-utilities').getBoundingClientRect();
      return title.right<=utilities.left && document.getElementById('cart-courses').getAttribute('aria-label').includes('Some assembly required');
    }));
    await phone.locator('#cart-courses').tap();
    await phone.locator('#cart-picker').screenshot({ path: path.join(dump, 'mobile-courses.png') });
    await phone.setViewportSize({width:852,height:393});
    await phone.evaluate(() => __cartTest.reset());
    check('the landscape phone also opens into a complete game', await phone.evaluate(fillsOpeningViewport));
    check('the landscape briefing and start button fit the playfield', await phone.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(),stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.top>=stage.top&&card.bottom<=stage.bottom;
    }));
    await phone.locator('#cart-game').screenshot({path:path.join(dump,'landscape-start.png')});
    await phone.evaluate(() => {__cartTest.run();__cartTest.approachExit();__cartTest.step(2,{push:1});});
    check('landscape checkout results fit without scrolling',await phone.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(),stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.top>=stage.top&&card.bottom<=stage.bottom;
    }));
    await phone.locator('#cart-game').screenshot({path:path.join(dump,'landscape-checkout.png')});
    await page.setViewportSize({width:2560,height:1440});
    check('wide monitors keep the game centered and capped at 1800 pixels',await page.evaluate(()=>{
      const r=document.getElementById('cart-game').getBoundingClientRect();return Math.abs(r.width-1800)<1&&Math.abs(r.left-(innerWidth-r.width)/2)<1;
    }));
    const blocked = await browser.newContext({ viewport: {width:1280,height:900}, reducedMotion: 'reduce' });
    await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const fallback = await setup(blocked, url); await fallback.locator('#cart-start').click();
    check('blocked storage and reduced motion still allow play', (await fallback.evaluate(() => __cartTest.state())).phase === 'running');
    await page.evaluate(() => { __cartTest.reset(); __cartTest.run(); window.dispatchEvent(new Event('blur')); });
    check('losing window focus pauses and clears inputs', (await page.evaluate(() => __cartTest.state())).phase === 'paused' && (await page.evaluate(() => __cartTest.state())).keys === 0);
    await page.goto(url.replace('four-wheels.html','archive.html'));
    check('the post is listed on In Progress', await page.locator('a.article-item[href="four-wheels.html"]').count() === 1);
    await page.locator('.hs-field').click();await page.locator('.hs-input').fill('All Four Wheels');
    await page.waitForSelector('.hs-res[href*="four-wheels.html"]');
    check('In Progress search finds the new game', await page.locator('.hs-res[href*="four-wheels.html"]').count()===1);
    check('no JavaScript errors in desktop, touch, or fallback sessions', errors.length === 0);
    console.log('Screenshots: ' + dump);
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode=1; });
