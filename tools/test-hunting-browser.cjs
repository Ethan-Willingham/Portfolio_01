// Owned Chrome for Testing process. Helpers exist only on this local QA server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dump = process.env.DUMP || '/tmp/hunting-game-v3-qa';
fs.mkdirSync(dump, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const errors = [], missing = [];
const hooks = `window.__huntTest = {
 ready: () => !!art && !!view,
 state: () => ({phase, time: world.time, x: world.hunter.x, y: world.hunter.y, mounted: world.hunter.mounted, ammo: world.hunter.ammo, shots: world.shots, recovered: world.recovered, zoom: view.camera.zoom, guide, holds: holds.size, keys: [...keys], blood: world.blood.length, species: world.species, windScale: world.options.windScale, dog: world.options.dog, minute: campaign.state.minute, credits: campaign.state.credits, owned: campaign.state.owned, records: campaign.state.records, tracks: campaign.state.tracks, artWidth: world.art.width}),
 stop: () => { cancelAnimationFrame(raf); raf = 0; },
 loop: () => { cancelAnimationFrame(raf); active = true; previous = 0; raf = requestAnimationFrame(frame); },
 step: (seconds, input) => {
  cancelAnimationFrame(raf); raf = 0;
  if (phase === 'camp') { campaign.advance(seconds, campSpeed); updateUI(); return; }
  if (phase !== 'running') return;
  const move = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const moveY = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
  for(let i=0;i<Math.round(seconds*120);i++) world.step(1/120,input || {move,moveY});
  campaign.advance(seconds); events(); updateUI(); draw();
 },
 shot: (wound=false) => {
  cancelAnimationFrame(raf); raf = 0;
  const kind = REGIONS[campaign.state.selected].animal;
  world = new World(art.masks[kind], 1000 + campaign.state.records.length + campaign.state.tracks.length, {...world.options, species: kind});
  Object.assign(world.hunter, {x:0,y:T.muzzleY,height:T.standHeight,mounted:true});
  world.deer=[world.deer[0]]; Object.assign(world.deer[0],{x:0,y:.8,previousX:0,previousY:.8,facingRight:true,pause:999});
  world.wind=0; scopeToggle=false; scopeHeld=false; view.scope(false,aim);
  const u=wound?.4:world.art.vitalsX, v=wound?.55:world.art.vitalsY, x=(u-.5)*world.art.width/T.pixelsPerUnit;
  const man=world.hunter, h=v*world.art.height/T.pixelsPerUnit, t=Math.hypot(x,.8-man.y)/T.muzzleSpeed;
  const vz=(h-man.height+.5*T.gravity*t*t)/t, duration=(vz+Math.sqrt(vz*vz+2*T.gravity*man.height))/T.gravity;
  aim={x:x*duration/t,y:man.y+(.8-man.y)*duration/t}; updateUI(); draw();
  const p=HuntingView.project(aim,view.camera), rect=canvas.getBoundingClientRect();
  return {x:rect.left+p.x*rect.width/T.width,y:rect.top+p.y*rect.height/T.height};
 },
 creditFixture: () => { campaign.state.credits=1000; renderCamp(); persist(); },
 clockFixture: minute => {campaign.state.minute=minute; updateUI();},
 screenshot: () => {draw(false); return canvas.toDataURL('image/png').split(',')[1];}
};`;
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('/js/hunting-game.js')) data = Buffer.from(data.toString().replace('// TEST_HOOKS:', hooks + '\n// TEST_HOOKS:'));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { missing.push(req.url); res.writeHead(404).end(); }
});
let browser;
function check(name, condition) { assert.ok(condition, name); console.log('PASS ' + name); }
async function setup(context, url) {
  await context.route('https://www.googletagmanager.com/**', route => route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => window.__huntTest?.ready()); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#hunt-game button')].filter(b => b.getBoundingClientRect().width > 0).every(b => { const r=b.getBoundingClientRect(); return r.x>=0 && r.right<=innerWidth+1 && r.height>=44; }));
}
(async () => {
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url='http://127.0.0.1:'+server.address().port+'/hunting-game.html';
  browser=await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'});
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}}), page=await setup(desktop,url);
  await page.evaluate(() => __huntTest.stop());
  check('camp loads with saved economy, clock and a gated area',await page.evaluate(()=>__huntTest.state().phase==='camp'&&__huntTest.state().credits===160&&document.querySelector('[data-region="cypress"]').disabled));
  check('desktop camp fits with usable controls',await noOverflow(page));
  await page.screenshot({path:path.join(dump,'camp.png'),fullPage:false});
  await page.locator('#hunt-departure').fill('17:00'); await page.locator('#hunt-wait-until').click();
  check('a chosen departure hour changes the real camp clock',await page.evaluate(()=>Math.floor(__huntTest.state().minute)===1020));
  await page.locator('[data-speed="0"]').click(); await page.evaluate(()=>__huntTest.step(60));
  check('paused camp time stays still',await page.evaluate(()=>Math.floor(__huntTest.state().minute)===1020));
  await page.locator('[data-speed="300"]').click(); await page.evaluate(()=>__huntTest.step(10));
  check('camp fast-forward advances fifty minutes in ten seconds',await page.evaluate(()=>Math.floor(__huntTest.state().minute)===1070));
  await page.locator('#hunt-departure').fill('06:00'); await page.locator('#hunt-wait-until').click();
  await page.locator('#hunt-embark').click(); await page.evaluate(()=>__huntTest.stop());
  check('the outing starts on foot at bottom left',await page.evaluate(()=>{const s=__huntTest.state();return s.phase==='running'&&s.x===-7.6&&s.y===-4.4&&!s.mounted;}));
  await page.keyboard.down('d'); await page.evaluate(()=>__huntTest.step(2.2)); await page.keyboard.up('d');
  await page.keyboard.press('e');
  check('walking to the real stand and pressing E mounts it',await page.evaluate(()=>__huntTest.state().mounted));
  await page.keyboard.press('q'); check('scope zooms the field',await page.evaluate(()=>__huntTest.state().zoom===2)); await page.keyboard.press('q');
  await page.keyboard.press('g'); check('the guide is optional',await page.evaluate(()=>!__huntTest.state().guide)); await page.keyboard.press('g');
  await page.keyboard.press('p'); const stopped=await page.evaluate(()=>__huntTest.state().time); await page.evaluate(()=>__huntTest.step(5));
  check('pausing stops animals, clock and held input',await page.evaluate(t=>{const s=__huntTest.state();return s.phase==='paused'&&s.time===t&&!s.holds&&!s.keys.length;},stopped)); await page.locator('#hunt-start').click();
  for(let i=0;i<3;i++) {
    const target=await page.evaluate(()=>__huntTest.shot()); await page.mouse.click(target.x,target.y); await page.evaluate(()=>__huntTest.step(2.5));
  }
  check('real pointer shots put three actual recoveries into the pack',await page.evaluate(()=>__huntTest.state().records.length===3&&__huntTest.state().records.every(r=>r.status==='packed')));
  await page.locator('#hunt-reset').click(); await page.locator('[data-tab="trophies"]').click();
  await page.screenshot({path:path.join(dump,'trophies.png'),fullPage:false});
  await page.locator('#hunt-sell-all').click();
  check('selling pays credits and keeps the recovery record',await page.evaluate(()=>__huntTest.state().credits>=350&&__huntTest.state().records.every(r=>r.status==='sold')));
  await page.locator('[data-tab="shop"]').click(); await page.locator('[data-unlock="cypress"]').click();
  check('earned credits unlock the second playable area',await page.locator('[data-unlock="cypress"]').isDisabled());
  await page.evaluate(()=>__huntTest.creditFixture());
  for(const item of ['rifle','dog','kit']) await page.locator('[data-buy="'+item+'"]').click();
  check('outfitter purchases charge once and disable owned items',await page.evaluate(()=>__huntTest.state().credits===200&&__huntTest.state().owned.length===3));
  await page.screenshot({path:path.join(dump,'shop.png'),fullPage:false});
  await page.locator('[data-tab="outing"]').click(); await page.locator('#hunt-embark').click(); await page.evaluate(()=>__huntTest.stop());
  check('cypress loads boar, the new rifle and the dog',await page.evaluate(()=>{const s=__huntTest.state();return s.species==='boar'&&s.windScale===.6&&s.dog&&s.artWidth===64;}));
  const boarTarget=await page.evaluate(()=>__huntTest.shot()); await page.mouse.click(boarTarget.x,boarTarget.y); await page.evaluate(()=>__huntTest.step(2.5));
  check('boar collision and sale records use the new sprite',await page.evaluate(()=>__huntTest.state().records.at(-1).species==='boar'));
  const woundTarget=await page.evaluate(()=>__huntTest.shot(true)); await page.mouse.click(woundTarget.x,woundTarget.y); await page.evaluate(()=>__huntTest.step(3));
  check('an actual wound escape leaves blood and a searchable trail',await page.evaluate(()=>__huntTest.state().blood>0&&__huntTest.state().tracks.length===1));
  await page.locator('#hunt-search').click(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('keyboard focus stays inside the tracking dialog',await page.evaluate(()=>document.activeElement.hasAttribute('data-search')));
  await page.screenshot({path:path.join(dump,'tracking.png'),fullPage:false});
  await page.locator('[data-search]').click(); await page.evaluate(()=>__huntTest.loop());
  await page.waitForFunction(()=>document.getElementById('hunt-track-close').disabled===false);
  check('the illustrated search consumes time and records a single outcome',await page.evaluate(()=>__huntTest.state().tracks[0].searched&&__huntTest.state().phase==='tracking'));
  await page.screenshot({path:path.join(dump,'tracking-result.png'),fullPage:false});
  await page.locator('#hunt-track-close').click(); await page.evaluate(()=>__huntTest.stop());
  await page.keyboard.press('g');
  await page.screenshot({path:path.join(dump,'cypress.png'),fullPage:false});
  fs.writeFileSync(path.join(dump,'field.png'),Buffer.from(await page.evaluate(()=>__huntTest.screenshot()),'base64'));
  await page.evaluate(()=>__huntTest.loop()); await page.keyboard.down('f'); const waitStart=await page.evaluate(()=>__huntTest.state());
  await page.waitForTimeout(250); await page.keyboard.up('f'); const waitEnd=await page.evaluate(()=>{__huntTest.stop();return __huntTest.state();});
  check('field wait speeds the animals and advances the day clock',waitEnd.time-waitStart.time>1&&waitEnd.minute-waitStart.minute>1);
  await page.locator('#hunt-fullscreen').click(); check('fullscreen contains the playable canvas',await page.evaluate(()=>document.fullscreenElement?.id==='hunt-game'||document.getElementById('hunt-game').classList.contains('hunt-fullscreen'))); await page.locator('#hunt-fullscreen').click();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); check('focus loss pauses the outing',await page.evaluate(()=>__huntTest.state().phase==='paused'));
  const before=await page.evaluate(()=>({credits:__huntTest.state().credits,records:__huntTest.state().records.length,owned:__huntTest.state().owned,tracks:__huntTest.state().tracks.length}));
  await page.reload(); await page.waitForFunction(()=>__huntTest?.ready());
  check('reload restores progress in camp without reopening a shot',await page.evaluate(expected=>{const s=__huntTest.state();return s.phase==='camp'&&s.credits===expected.credits&&s.records.length===expected.records&&JSON.stringify(s.owned)===JSON.stringify(expected.owned)&&s.tracks.length===expected.tracks;},before));
  await page.locator('#hunt-embark').click(); await page.evaluate(()=>{__huntTest.clockFixture(1200);__huntTest.loop();});
  await page.waitForFunction(()=>__huntTest.state().phase==='camp');
  check('the day ends at night and returns the hunter to camp',await page.locator('#hunt-embark').isDisabled());
  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}), phone=await setup(mobile,url);
  await phone.evaluate(()=>__huntTest.stop()); check('portrait camp has no horizontal overflow and 44-pixel controls',await noOverflow(phone));
  await phone.screenshot({path:path.join(dump,'mobile-camp.png'),fullPage:true});
  await phone.locator('#hunt-embark').tap(); await phone.evaluate(()=>__huntTest.stop());
  check('portrait field controls fit without horizontal overflow',await noOverflow(phone));
  const target=await phone.evaluate(()=>__huntTest.shot()); await phone.touchscreen.tap(target.x,target.y);
  check('touch aims without firing',await phone.evaluate(()=>__huntTest.state().shots===0));
  await phone.locator('#hunt-fire').tap(); await phone.evaluate(()=>__huntTest.step(2.5));
  check('the touch Fire button recovers a deer and saves it',await phone.evaluate(()=>__huntTest.state().records.length===1&&__huntTest.state().recovered===1));
  await phone.locator('#hunt-scope').tap(); check('touch scope changes magnification',await phone.evaluate(()=>__huntTest.state().zoom===2)); await phone.locator('#hunt-scope').tap();
  await phone.screenshot({path:path.join(dump,'mobile-field.png'),fullPage:true});
  await phone.setViewportSize({width:844,height:390}); check('landscape field controls fit',await noOverflow(phone)); await phone.screenshot({path:path.join(dump,'mobile-landscape.png'),fullPage:false});
  await phone.setViewportSize({width:320,height:740}); check('small-phone field controls fit',await noOverflow(phone));
  await phone.locator('#hunt-reset').tap(); check('small-phone camp controls fit',await noOverflow(phone));
  check('scripts have no page errors and all local assets load',!errors.length&&!missing.length);
  console.log('Screenshots: '+dump);
 } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);console.error({errors,missing});process.exitCode=1;});
