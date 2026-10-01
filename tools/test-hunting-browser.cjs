// Uses only an owned Chrome for Testing child, closed in finally.
// NODE_PATH=/path/to/bundled/node_modules node tools/test-hunting-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP || '/tmp/hunting-game-qa';
fs.mkdirSync(dump, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const errors = [], missing = [];
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('/js/hunting-game.js')) {
      data = Buffer.from(data.toString().replace('// TEST_HOOKS:', `
        window.__huntTest = {
          ready: () => !!world && !!view,
          state: () => ({ phase, time: world.time, ammo: world.hunter.ammo, reload: world.hunter.reload, shots: world.shots, recovered: world.recovered, wind: world.wind, x: world.hunter.x, zoom: view.camera.zoom, guide, holds: holds.size, keys: [...keys], deer: world.deer, art: { width: world.art.width, height: world.art.height, solid: world.art.alpha.filter(a => a >= 128).length } }),
          stop: () => { cancelAnimationFrame(raf); raf = 0; },
          loop: () => { cancelAnimationFrame(raf); previous = 0; raf = requestAnimationFrame(frame); },
          step: (seconds, input) => {
            cancelAnimationFrame(raf); raf = 0;
            const move = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
            for (let i = 0; i < Math.round(seconds * 120) && phase === 'running'; i++) world.step(1 / 120, input || { move });
            events(); updateUI(); draw();
          },
          shot: () => {
            cancelAnimationFrame(raf); raf = 0;
            world = new World(world.art, 11); world.deer = [world.deer[0]];
            Object.assign(world.deer[0], { x: 0, y: .8, facingRight: true, pause: 999 }); world.wind = 0;
            scopeToggle = false; scopeHeld = false; view.scope(false, aim);
            const man = world.hunter, h = .45 * world.art.height / 16, x = .1 * world.art.width / 16;
            const t = Math.hypot(x, .8 - man.y) / T.muzzleSpeed;
            const vz = (h - T.standHeight + .5 * T.gravity * t * t) / t;
            const duration = (vz + Math.sqrt(vz * vz + 2 * T.gravity * T.standHeight)) / T.gravity;
            aim = { x: x * duration / t, y: man.y + (.8 - man.y) * duration / t };
            updateUI(); draw();
            const p = HuntingView.project(aim, view.camera), rect = canvas.getBoundingClientRect();
            return { x: rect.left + p.x * rect.width / T.width, y: rect.top + p.y * rect.height / T.height };
          },
          screenshot: () => { draw(false); return canvas.toDataURL('image/png').split(',')[1]; }
        };
        // TEST_HOOKS:`));
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { missing.push(req.url); res.writeHead(404).end(); }
});
let browser;
function check(name, condition) { assert.ok(condition, name); console.log('PASS ' + name); }
async function setup(context, url) {
  await context.route('https://www.googletagmanager.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__huntTest?.ready());
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.hunt-toolbar button, .hunt-actions button')].every(button => { const r = button.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && r.height >= 44; }));
}
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/hunting-game.html';
    browser = await chromium.launch({ headless: true, executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await setup(desktop, url);
    check('the original art loads and the briefing does not advance the field', await page.evaluate(() => { const s = __huntTest.state(); return s.phase === 'ready' && s.time === 0 && s.art.width === 24 && s.art.solid > 100; }));
    check('desktop controls fit and have 44-pixel targets', await noOverflow(page));
    await page.screenshot({ path: path.join(dump, 'desktop-ready.png'), fullPage: true });
    await page.locator('#hunt-start').click();
    check('start enters the field and focuses the canvas', await page.evaluate(() => __huntTest.state().phase === 'running' && document.activeElement.id === 'hunt-canvas'));
    const target = await page.evaluate(() => __huntTest.shot());
    await page.mouse.click(target.x, target.y);
    check('a real pointer click fires one round and consumes ammo', await page.evaluate(() => __huntTest.state().shots === 1 && __huntTest.state().ammo === 4));
    await page.evaluate(() => __huntTest.step(2.5));
    check('the actual sprite chest hit is recovered and reported by the UI', await page.evaluate(() => __huntTest.state().recovered === 1 && document.getElementById('hunt-recovered').textContent === '1' && document.getElementById('hunt-message').textContent.includes('Recovered')));
    await page.keyboard.press('r');
    check('keyboard reload starts a timed reload', await page.evaluate(() => __huntTest.state().reload > 0));
    await page.evaluate(() => __huntTest.step(1.2));
    check('reload completes with five rounds', await page.evaluate(() => __huntTest.state().ammo === 5));
    await page.keyboard.press('q');
    check('keyboard scope zooms the original pixel field', await page.evaluate(() => __huntTest.state().zoom === 2));
    await page.keyboard.press('q');
    await page.mouse.move(target.x, target.y); await page.mouse.down({ button: 'right' });
    check('right mouse raises the scope', await page.evaluate(() => __huntTest.state().zoom === 2));
    await page.mouse.up({ button: 'right' });
    check('releasing right mouse returns to the full field', await page.evaluate(() => __huntTest.state().zoom === 1));
    await page.keyboard.press('g');
    check('the guide can be disabled without changing shot behavior', await page.evaluate(() => !__huntTest.state().guide));
    await page.keyboard.down('d'); await page.evaluate(() => __huntTest.step(1)); await page.keyboard.up('d');
    check('keyboard shuffling stays on the stand', await page.evaluate(() => __huntTest.state().x === .7));
    await page.keyboard.press('p');
    const paused = await page.evaluate(() => __huntTest.state().time);
    await page.evaluate(() => __huntTest.step(1));
    check('pause freezes the simulation and clears held input', await page.evaluate(time => { const s = __huntTest.state(); return s.phase === 'paused' && s.time === time && !s.holds && !s.keys.length; }, paused));
    await page.locator('#hunt-start').click(); await page.locator('#hunt-reset').click();
    await page.evaluate(() => __huntTest.stop());
    check('new outing clears counters and keeps playing', await page.evaluate(() => { const s = __huntTest.state(); return s.phase === 'running' && !s.shots && !s.recovered && s.ammo === 5; }));
    check('the game and all controls fit within the opening desktop viewport', await page.evaluate(() => document.getElementById('hunt-game').getBoundingClientRect().bottom <= innerHeight));
    await page.evaluate(() => __huntTest.loop());
    await page.keyboard.down('f');
    const waitStart = await page.evaluate(() => __huntTest.state().time);
    await page.waitForTimeout(200);
    await page.keyboard.up('f');
    const waitEnd = await page.evaluate(() => { __huntTest.stop(); return __huntTest.state().time; });
    check('holding F advances the live simulation at eight times speed', waitEnd - waitStart > .9);
    await page.locator('#hunt-reset').click(); await page.evaluate(() => __huntTest.stop());
    await page.screenshot({ path: path.join(dump, 'desktop-playing.png'), fullPage: true });
    const screenshot = await page.evaluate(() => __huntTest.screenshot());
    fs.writeFileSync(path.join(dump, 'field.png'), Buffer.from(screenshot, 'base64'));
    await page.locator('#hunt-fullscreen').click();
    check('fullscreen contains the playable canvas', await page.evaluate(() => document.fullscreenElement?.id === 'hunt-game' || document.getElementById('hunt-game').classList.contains('hunt-fullscreen')));
    await page.locator('#hunt-fullscreen').click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('losing focus pauses the outing', await page.evaluate(() => __huntTest.state().phase === 'paused'));

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const phone = await setup(mobile, url);
    check('portrait controls fit without horizontal scrolling', await noOverflow(phone));
    await phone.screenshot({ path: path.join(dump, 'mobile-ready.png'), fullPage: true });
    await phone.locator('#hunt-start').tap(); await phone.evaluate(() => __huntTest.stop());
    const mobileTarget = await phone.evaluate(() => __huntTest.shot());
    await phone.touchscreen.tap(mobileTarget.x, mobileTarget.y);
    check('touch positions the aim without firing an accidental shot', await phone.evaluate(() => __huntTest.state().shots === 0));
    await phone.locator('#hunt-fire').tap(); await phone.evaluate(() => __huntTest.step(2.5));
    check('the separate touch Fire button hits and recovers a deer', await phone.evaluate(() => __huntTest.state().shots === 1 && __huntTest.state().recovered === 1));
    await phone.locator('#hunt-scope').tap();
    check('the touch scope button toggles magnification', await phone.evaluate(() => __huntTest.state().zoom === 2));
    await phone.screenshot({ path: path.join(dump, 'mobile-playing.png'), fullPage: true });
    await phone.setViewportSize({ width: 844, height: 390 });
    check('landscape controls remain visible and fit the screen', await noOverflow(phone));
    await phone.screenshot({ path: path.join(dump, 'mobile-landscape.png'), fullPage: true });
    check('all page scripts run without errors and all local assets load', !errors.length && !missing.length);
    console.log('Screenshots: ' + dump);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); console.error({ errors, missing }); process.exitCode = 1; });
