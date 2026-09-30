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
        state: () => ({ phase, index:levelIndex, body:{...world.body}, time:world.time, gate:world.gate, messes:world.messes, penalty:world.penalty, practice:world.practice, touch:touches.size, keys:keys.size, records, canSave, remaining:world.remaining, objects:world.objects }),
        stop: () => { cancelAnimationFrame(raf); raf=0; },
        step: (seconds,input={}) => { cancelAnimationFrame(raf);raf=0;for(let i=0;i<Math.round(seconds*120)&&phase==='running';i++){world.step(1/120,input);events();tickEffects(1/120);}draw();updateUI(); },
        park: () => { world.gate=world.level.gates.length;const q=world.level.goal;Object.assign(world.body,{x:q.x-Math.cos(q.a)*4,y:q.y-Math.sin(q.a)*4,a:q.a,vx:0,vy:0,omega:0}); },
        casterSheet: () => {
          const sheet=document.createElement('canvas');sheet.width=600;sheet.height=360;
          const g=sheet.getContext('2d');rect(g,0,0,600,360,P.floor);
          const cases=[
            {label:'FORWARD',a:0,w:[0,0,0,0]},
            {label:'SWUNG INWARD',a:0,w:[-Math.PI/2,-Math.PI/2,Math.PI/2,Math.PI/2]},
            {label:'REVERSING',a:0,w:[Math.PI,Math.PI,Math.PI,Math.PI]},
            {label:'COASTING THROUGH A TURN',a:.7,w:[.1,1.1,-.4,1.5]}
          ];
          cases.forEach((q,i)=>{g.save();g.translate(i%2*300,Math.floor(i/2)*180);text(g,q.label,150,17,P.dark,7,'center');g.scale(3,3);drawCart(g,{x:45,y:28,a:q.a,vx:0,vy:0},q.w.map(a=>({a,roll:0})),0);g.restore();});
          return sheet.toDataURL('image/png').split(',')[1];
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
    const page = await setup(desktop, url);
    await page.locator('#cart-game').scrollIntoViewIfNeeded();
    await page.locator('#cart-game').screenshot({ path: path.join(dump, 'desktop-start.png') });
    check('the new post boots and begins with an unticked practice option', await page.locator('#cart-start').isVisible() && !(await page.locator('#cart-practice').isChecked()));
    await page.locator('#cart-start').click(); await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
    let a = await page.evaluate(() => __cartTest.state());
    check('W applies forward force', a.body.y < 226 && a.body.vy < -30);
    await page.keyboard.down('d'); await page.waitForTimeout(550); await page.keyboard.up('d');
    a = await page.evaluate(() => __cartTest.state());
    check('keyboard rotation leaves the old direction of motion intact', a.body.a > -1 && Math.abs(a.body.vx) < 1 && a.body.vy < -20);
    await page.locator('#cart-sound').click();
    check('sound can be enabled after a gesture', await page.locator('#cart-sound').getAttribute('aria-pressed') === 'true');
    await page.locator('#cart-sound').click();
    await page.locator('#cart-pause').click(); const pausedTime = (await page.evaluate(() => __cartTest.state())).time;
    await page.waitForTimeout(350);
    check('pause stops the simulation and clock', (await page.evaluate(() => __cartTest.state())).time === pausedTime);
    await page.locator('#cart-start').click(); await page.keyboard.press('r');
    check('retry resets penalties and position', (await page.evaluate(() => __cartTest.state())).messes === 0);
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
    const casterState = await page.evaluate(() => {
      const w=__cartTest.world();
      return w.wheels.map((q,i)=>({angle:q.a,pivot:CartPhysics.casterPose(w.body,q,i).pivot,center:CartPhysics.casterPose(w.body,q,i),trail:CartPhysics.CASTER.trail}));
    });
    check('all four rendered casters have offset tire centers and independent angles', casterState.every(q => Math.hypot(q.center.x-q.pivot.x,q.center.y-q.pivot.y) >= q.trail) && Math.abs(casterState[0].angle-casterState[3].angle) > .1);
    if (process.env.ASSETS === '1') {
      const pixels = await page.evaluate(() => {
        __cartTest.reset(2); __cartTest.stop();
        const w=__cartTest.world(), wrap=CartPhysics.wrap, clamp=CartPhysics.clamp;
        for(let i=0;i<9.5*120;i++) {
          const target=w.level.gates[w.gate]||w.level.goal,b=w.body,dx=target.x-b.x,dy=target.y-b.y,d=Math.hypot(dx,dy),speed=Math.min(62,d*1.25);
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
    await page.evaluate(() => { __cartTest.reset(0); __cartTest.run(); __cartTest.park(); __cartTest.step(.7); });
    a = await page.evaluate(() => __cartTest.state());
    check('parking completes a course and saves a record', a.phase === 'won' && a.records[0].stars === 3);
    await page.locator('#cart-game').screenshot({ path: path.join(dump, 'checkout.png') });
    await page.reload(); await page.waitForFunction(() => !!window.__cartTest);
    check('records survive reload', (await page.evaluate(() => __cartTest.state())).records[0].stars === 3);
    await page.locator('#cart-fullscreen').click();
    check('fullscreen is usable', await page.evaluate(() => document.fullscreenElement === document.getElementById('cart-game') || document.getElementById('cart-game').classList.contains('cart-pseudo-fullscreen')));
    await page.locator('#cart-fullscreen').click();
    await page.evaluate(() => { __cartTest.reset(); __cartTest.run(); __cartTest.world().penalty=65; __cartTest.step(.1); });
    check('timeout presents retry and practice actions', (await page.evaluate(() => __cartTest.state())).phase === 'lost' && await page.locator('#cart-secondary').isVisible());
    await page.locator('#cart-secondary').click();
    check('the practice action starts an untimed attempt', (await page.evaluate(() => __cartTest.state())).practice);
    await page.evaluate(() => { __cartTest.park(); __cartTest.step(.7); });
    check('practice leaves the previous timed record intact', (await page.evaluate(() => __cartTest.state())).records[0].time === a.records[0].time);
    const mobile = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const phone = await setup(mobile, url); await phone.locator('#cart-game').scrollIntoViewIfNeeded();
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
    await phone.evaluate(() => {__cartTest.reset(0);__cartTest.run();__cartTest.park();__cartTest.step(.7);});
    await phone.locator('#cart-game').screenshot({path:path.join(dump,'mobile-checkout.png')});
    check('mobile checkout results fit inside the playfield', await phone.evaluate(() => {
      const card=document.querySelector('.cart-overlay-card').getBoundingClientRect(), stage=document.getElementById('cart-stage').getBoundingClientRect();
      return card.top>=stage.top&&card.bottom<=stage.bottom;
    }));
    await phone.setViewportSize({ width: 320, height: 720 });
    check('320px layout has no horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await phone.locator('#cart-courses').tap();
    await phone.locator('#cart-picker').screenshot({ path: path.join(dump, 'mobile-courses.png') });
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
