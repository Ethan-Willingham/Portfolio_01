/* Requires Playwright and axe-core. Owns and closes its test browser and HTTP server.
   SITE_AUDIT_OUTPUT optionally saves screenshots and accessibility results. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const output = process.env.SITE_AUDIT_OUTPUT;
const results = [];
const errors = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
let browser, safari, base;
async function audit(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () => (await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })));
  results.push({ name, violations });
  if (output) {
    await page.screenshot({ path: path.join(output, name + '.png') });
    fs.writeFileSync(path.join(output, 'accessibility.json'), JSON.stringify(results, null, 2));
  }
  assert.deepEqual(violations, [], name + ' accessibility');
}
async function newPage(engine, options = {}) {
  const context = await engine.newContext({ viewport: { width: 375, height: 812 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function credits(page) {
  await page.locator('#attribution-title').scrollIntoViewIfNeeded();
  await page.locator('.ma-minds').waitFor();
  await page.waitForFunction(() => !document.querySelector('#ma-root').hasAttribute('aria-busy'));
}
(async () => {
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = process.env.SITE_AUDIT_BASE_URL || 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    for (const width of [375, 1440]) {
      for (const file of ['index', 'archive', 'about', 'labs', 'philosophy', 'religion', 'inner-life', 'staying-alive']) {
        const { context, page } = await newPage(browser, { viewport: { width, height: width === 375 ? 812 : 1000 } });
        const requests = [];
        page.on('request', request => requests.push(request.url()));
        await page.goto(base + '/' + file + '.html', { waitUntil: 'networkidle' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), file + ' fits at ' + width);
        if (file === 'about') {
          if (width === 375) assert.ok(!requests.some(url => /git-attribution|post-prompts-data/.test(url)), 'Credits and prompts stay out of mobile startup');
          await credits(page);
          assert.ok(!requests.some(url => /post-prompts-data/.test(url)), 'Prompts wait for a post to open');
        }
        const compact = page.locator('.arc-banner--compact');
        if (await compact.count()) {
          assert.ok((await compact.boundingBox()).height < 180, 'Closed draft notice fits');
          const summary = compact.locator('summary');
          assert.ok((await summary.boundingBox()).height >= 44, 'Draft disclosure touch target');
          await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await compact.locator('details').getAttribute('open'), '', 'Draft explanation opens from keyboard');
          await page.keyboard.press('Enter');
        }
        await audit(page, file + '-' + width);
        if (file === 'about') {
          await page.locator('button.ma-mind').first().click();
          assert.equal(await page.locator('button.ma-mind[aria-pressed="true"]').count(), 1);
          await audit(page, 'about-filter-' + width);
          await page.locator('.ma-filter-clear').click();
        }
        if (file === 'index') {
          const input = page.locator('.hs-input');
          await input.fill('ocean'); await page.locator('.hs-res').first().waitFor();
          await input.press('ArrowDown');
          assert.equal(await page.locator('.hs-res[aria-selected="true"]').count(), 1);
          await input.press('ArrowDown');
          assert.equal(await page.locator('.hs-res[aria-selected="true"]').count(), 1);
          await audit(page, 'search-' + width);
          await input.press('Escape');
          assert.equal(await input.getAttribute('aria-expanded'), 'false');
        }
        await context.close();
        console.log('PASS', file, width);
      }
    }
    // Failed deferred requests can be retried, and closing a tray during a download is safe.
    {
      const { context, page } = await newPage(browser);
      let historyAttempts = 0, creditAttempts = 0, promptAttempts = 0;
      await page.route('**/git-history-data.js*', route => ++historyAttempts === 1 ? route.abort() : route.continue());
      await page.route('**/git-attribution-data.js*', route => ++creditAttempts === 1 ? route.abort() : route.continue());
      await page.route('**/post-prompts-data.js*', async route => {
        if (++promptAttempts === 1) return route.abort();
        await new Promise(resolve => setTimeout(resolve, 400));
        return route.continue();
      });
      await page.goto(base + '/about.html');
      await page.locator('[data-history-status] button').click();
      await page.waitForFunction(() => !document.querySelector('#gh-reset').disabled);
      assert.equal(historyAttempts, 2, 'History retry once');
      assert.ok(await page.locator('#gh-canvas').evaluate(canvas => canvas.width > 0 && window.GIT_HISTORY.commits.length > 0), 'Timeline initializes after deferred data');
      await page.locator('#attribution-title').scrollIntoViewIfNeeded();
      await page.locator('[data-attribution-status] button').click();
      await credits(page);
      assert.equal(creditAttempts, 2, 'Credits retry once');
      await page.locator('.cv-viewall').click();
      await page.locator('.cv[data-key="the-other-side"]').click();
      await page.locator('.ma-prompts button').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ma-tray').getAttribute('aria-hidden'), 'true');
      await page.locator('.cv[data-key="the-other-side"]').click();
      await page.locator('.ma-prompt').first().waitFor();
      assert.equal(promptAttempts, 2, 'Opening during pending retry shares the request');
      assert.equal(await page.locator('.ma-tray-link').getAttribute('href'), '/the-other-side.html');
      await page.locator('.ma-tray-x').focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('.ma-tray-link').evaluate(el => el === document.activeElement), true, 'Dialog wraps backwards');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.ma-tray-x').evaluate(el => el === document.activeElement), true, 'Dialog wraps forwards');
      await audit(page, 'about-tray');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.cv[data-key="the-other-side"]').evaluate(el => el === document.activeElement), true, 'Tray restores focus');
      await context.close();
    }
    for (const width of [320, 560, 768]) {
      const { context, page } = await newPage(browser, { viewport: { width, height: 812 }, deviceScaleFactor: 2 });
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const image = page.locator('.article-item[href="slop.html"] img');
      assert.match(await image.evaluate(el => el.currentSrc), /slop-(480|720|960)\.webp$/);
      assert.ok(await image.evaluate(el => Math.abs(el.getBoundingClientRect().width / el.getBoundingClientRect().height - 1.5) < .01));
      await context.close();
    }
    {
      const { context, page } = await newPage(browser, { javaScriptEnabled: false, reducedMotion: 'reduce' });
      await page.goto(base + '/');
      assert.equal(await page.locator('.article-item').count(), 14);
      assert.ok(await page.locator('.article-list-item').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1')));
      await context.close();
    }
    safari = await webkit.launch({ headless: true });
    {
      const { context, page } = await newPage(safari);
      await page.goto(base + '/about.html'); await credits(page);
      await page.goto(base + '/'); await page.locator('.hs-input').fill('ocean');
      await page.locator('.hs-res').first().waitFor();
      await page.locator('.hs-input').press('Enter');
      await page.waitForURL('**/ocean.html*', { waitUntil: 'commit' });
      await context.close();
    }
    assert.deepEqual(errors, [], 'No browser script errors');
    console.log('PASS deferred retries, prompt races, responsive images, no-JavaScript cards, and WebKit search');
  } finally {
    if (safari) await safari.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
