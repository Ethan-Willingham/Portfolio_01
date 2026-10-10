// Run with the workspace dependency bundle on NODE_PATH. Own both processes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.HAIRLINE_ARTIFACTS || '/tmp/portfolio-hairline';
fs.mkdirSync(output, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  let body;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) body = fs.readFileSync(file);
  if (!body) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(body);
});
let browser;
const report = { engine: process.env.HAIRLINE_ENGINE || 'chromium', shell: 'working', checks: [] };
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const engine = report.engine === 'webkit' ? webkit : chromium;
    browser = await engine.launch({ headless: true, ...(engine === chromium ? { executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/index.html');
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.hairline-string').count(), 2);
    const top = '.home-search .hairline-string', bottom = '.site-footer-inner .hairline-string';
    async function origin(selector = top, ratio = 0.5) {
      const rect = await page.locator(selector).boundingBox();
      return { x: rect.x + rect.width * ratio, y: rect.y + 0.5, width: rect.width };
    }
    async function shape(selector = top) {
      return page.locator(selector + ' .hairline-ink').evaluate(el => {
        const points = [...el.getAttribute('d').matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => [Number(m[1]), Number(m[2]) - 0.5]);
        return { max: Math.max(...points.map(p => Math.abs(p[1]))), min: Math.min(...points.map(p => p[1])),
          first: points[0], last: points[points.length - 1], finite: points.length === 97 && points.every(p => p.every(Number.isFinite)) };
      });
    }
    async function setMotion(reducedMotion) {
      await page.emulateMedia({ reducedMotion });
      await page.waitForFunction(reduce => document.querySelector('.home-search').classList.contains('wave-on') !== reduce, reducedMotion === 'reduce');
    }
    async function reset() {
      await page.mouse.up();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await setMotion('reduce');
      await setMotion('no-preference');
    }
    async function grab(selector = top, ratio = 0.5) {
      const p = await origin(selector, ratio); await page.mouse.move(p.x, p.y); await page.mouse.down(); return p;
    }
    async function peak(selector = top, ms = 600) {
      return page.locator(selector + ' .hairline-ink').evaluate((el, ms) => new Promise(resolve => {
        let max = 0, min = 0; const end = performance.now() + ms;
        function read() {
          for (const m of el.getAttribute('d').matchAll(/[ML][\d.-]+,([\d.-]+)/g)) {
            const y = Number(m[1]) - 0.5; max = Math.max(max, Math.abs(y)); min = Math.min(min, y);
          }
          if (performance.now() < end) requestAnimationFrame(read); else resolve({ max, min });
        } read();
      }), ms);
    }
    const check = (name, values) => { report.checks.push({ name, ...values }); console.log(name, values || 'passed'); };

    let p = await origin(); await page.mouse.click(p.x, p.y);
    const tap = await peak(top, 350); assert(tap.max > 2 && tap.max < 7, JSON.stringify(tap));
    const echo = await peak(top, 1000); assert(echo.max > 0.5 && echo.max < 4 && echo.min < -0.2, JSON.stringify(echo));
    check('click swells gently with small reflections', { tap, echo });
    await reset(); p = await grab();
    await page.mouse.move(p.x, p.y + 100, { steps: 18 });
    const held = await shape(); assert(held.max > 65 && held.max < 100); assert.equal(held.first[1], 0); assert.equal(held.last[1], 0);
    await page.waitForTimeout(180); assert(Math.abs((await shape()).max - held.max) < 0.1);
    await page.screenshot({ path: path.join(output, report.engine + '-' + report.shell + '-held.png') });
    await page.mouse.up(); const ring = await peak(); assert(ring.min < -15, JSON.stringify(ring)); check('held tension rebounds across the rest line', ring);
    await page.waitForTimeout(4500); assert.equal((await shape()).max, 0); check('released line settles completely');

    await reset(); p = await grab(); await page.mouse.move(p.x, p.y + 100, { steps: 12 });
    for (let d = 95; d >= 0; d -= 5) { await page.mouse.move(p.x, p.y + d); await page.waitForTimeout(25); }
    await page.waitForTimeout(160); await page.mouse.up();
    const gentle = await peak(); assert(gentle.max < 0.8); check('slow return releases quietly', gentle);

    await reset(); p = await grab(); await page.mouse.move(p.x, p.y + 200, { steps: 20 });
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('hairline-dragging')), false);
    const slip = await peak(); assert(slip.min < -12);
    await page.mouse.move(p.x, p.y - 40, { steps: 4 });
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('hairline-dragging')), false);
    await page.mouse.up(); check('overstretch slips and cannot recatch during the same press', slip);

    await reset(); p = await origin(top, 0.5);
    await page.mouse.move(p.x, p.y + 30); await page.mouse.down();
    await page.mouse.move(p.x, p.y - 70, { steps: 12 });
    assert((await shape()).min < -45); assert.equal(await page.locator('html').evaluate(el => el.classList.contains('hairline-dragging')), true);
    await page.mouse.up(); check('dragging into the line catches it');

    await reset();
    const textStart = await page.locator('.article-item-title').first().evaluate(el => {
      const node = el.querySelector('a') || el;
      const range = document.createRange(); range.selectNodeContents(node);
      const rect = range.getClientRects()[0]; return { x: rect.left + 12, y: rect.top + rect.height / 2 };
    });
    p = await origin(); await page.mouse.move(textStart.x, textStart.y); await page.mouse.down();
    await page.mouse.move(textStart.x + 70, textStart.y, { steps: 5 });
    await page.mouse.move(p.x, p.y - 30, { steps: 8 });
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('hairline-dragging')), false);
    await page.mouse.move(p.x, p.y + 30); await page.mouse.up();
    assert.equal((await shape()).max, 0);
    await page.evaluate(() => getSelection().removeAllRanges()); check('text drags do not catch the hairline');

    await reset(); p = await grab(top, 0.03); await page.mouse.move(p.x, p.y + 70, { steps: 8 });
    await page.mouse.up(); await peak(); assert((await shape()).finite); check('pulling near an anchor remains stable');
    await reset(); p = await grab(); await page.mouse.move(p.x, p.y + 60);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await shape()).max, 0); await page.mouse.up(); check('losing focus clears a held gesture');
    await reset(); p = await grab(); await page.mouse.move(p.x, p.y + 60);
    await page.setViewportSize({ width: 900, height: 950 }); await page.waitForTimeout(100);
    assert.equal((await shape()).max, 0); await page.mouse.up(); check('resizing clears a held gesture');

    await reset(); p = await grab(); await page.mouse.move(p.x, p.y + 60);
    await setMotion('reduce');
    assert.equal(await page.locator('.wave-on').count(), 0); assert.equal(await page.locator(top).isVisible(), false);
    await page.mouse.up(); await setMotion('no-preference');
    assert.equal(await page.locator(top).isVisible(), true); p = await origin(); await page.mouse.click(p.x, p.y);
    assert((await peak()).max > 1); check('reduced motion can be changed during a pull');

    await reset();
    await page.locator('.hs-input').focus(); await page.locator('.hs-input').fill('ocean');
    await page.waitForSelector('.hs-res'); assert((await peak()).max > 0.2);
    assert.equal(await page.locator('.hs-input').inputValue(), 'ocean');
    await page.keyboard.press('Escape'); await page.locator('.hs-input').fill('');
    check('search and typing ripples still work');
    await page.locator('.site-tagline').click();
    await page.locator('.hs-about').filter({ hasText: /^About$/ }).click(); await page.waitForURL('**/about.html');
    check('navigation remains clickable');

    await page.goto(base + '/index.html'); await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await page.waitForTimeout(120);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    p = await origin(bottom); await page.mouse.click(p.x, p.y);
    const footerTap = await peak(bottom, 350); assert(footerTap.max > 2 && footerTap.max < 7, JSON.stringify(footerTap));
    check('footer click makes the same small ripple', footerTap);
    await reset();
    p = await grab(bottom); await page.mouse.move(p.x, p.y - 95, { steps: 12 });
    assert((await shape(bottom)).min < -60); await page.mouse.up(); assert((await peak(bottom)).max > 25);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), height);
    check('footer stretches without changing page height');

    await page.goto(base + '/religion.html'); await page.waitForTimeout(1500);
    p = await grab(); await page.mouse.move(p.x, p.y + 60, { steps: 8 }); assert((await shape()).max > 40); await page.mouse.up();
    check('collection hairlines share the interaction');

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(base + '/index.html'); await mobile.waitForTimeout(1500);
    const m = await mobile.locator(top).boundingBox();
    await mobile.touchscreen.tap(m.x + m.width / 2, m.y + 0.5);
    await mobile.waitForTimeout(40);
    assert(await mobile.locator(top + ' .hairline-ink').evaluate(el => [...el.getAttribute('d').matchAll(/[ML][\d.-]+,([\d.-]+)/g)].some(m => Math.abs(Number(m[1]) - 0.5) > 0.2)));
    assert.equal(await mobile.locator('.hairline-hit').first().evaluate(el => getComputedStyle(el).touchAction), 'pan-y');
    if (engine === chromium) {
      const cdp = await mobile.context().newCDPSession(mobile);
      const x = m.x + m.width / 2, y = m.y + 0.5;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let d = 10; d <= 130; d += 10) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d }] }); await mobile.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await mobile.waitForTimeout(120); assert(await mobile.evaluate(() => scrollY > 50));
    }
    check('touch taps work and vertical scrolling remains available');
    await mobile.close();
    assert.deepEqual(errors, []); check('no browser script errors');
    fs.writeFileSync(path.join(output, report.engine + '-' + report.shell + '-report.json'), JSON.stringify(report, null, 2));
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
