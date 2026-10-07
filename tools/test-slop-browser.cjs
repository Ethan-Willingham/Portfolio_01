#!/usr/bin/env node
// Own this test's HTTP server and Chrome for Testing process, then close both.
// Run with: node tools/test-slop-browser.cjs
// Screenshots and the JSON report go to /tmp/slop-qa, outside the repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const root = path.resolve(__dirname, '..');
const output = '/tmp/slop-qa';
const executablePath = path.join(os.homedir(), '.local/bin/agent-chrome-for-testing');
const report = { viewports: [], checks: [], errors: [] };
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
let browser;
let currentPage;
let stopping = false;

const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/slop.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const stat = fs.statSync(file);
    if (!stat.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end(); }
});

async function cleanup() {
  if (stopping) return;
  stopping = true;
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
});

function pass(check, details) {
  report.checks.push({ check, ...(details === undefined ? {} : { details }) });
  console.log('PASS', check);
}

function observe(page, label) {
  page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${label}: HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText || 'unknown failure';
    // Removing virtualized, still-loading tiles legitimately cancels requests.
    if (failure !== 'net::ERR_ABORTED') report.errors.push(`${label}: ${failure} ${new URL(request.url()).pathname}`);
  });
}

async function frames(page, count = 2) {
  await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); }, count);
}

async function camera(page) {
  return page.locator('#slop-wall').evaluate(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, zoom: matrix.a, tiles: element.childElementCount };
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    let previous;
    let stable = 0;
    const started = performance.now();
    while (performance.now() - started < 4000) {
      await new Promise(requestAnimationFrame);
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector('#slop-wall')).transform);
      const next = [matrix.a, matrix.e, matrix.f];
      stable = previous && next.every((value, index) => Math.abs(value - previous[index]) < 0.01) ? stable + 1 : 0;
      if (stable >= 8) return;
      previous = next;
    }
    throw new Error('The gallery camera did not settle.');
  });
}

async function visibleImagesDecoded(page) {
  // Probe the actual DOM images before preloading any independent Image objects.
  // A successful network fetch or naturalWidth alone does not ensure async
  // decoding has finished, especially on a transformed, virtualized wall.
  await page.waitForFunction(() => {
    const visible = [...document.images].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight && getComputedStyle(image).visibility !== 'hidden';
    });
    return visible.length > 0 && visible.every(image => image.complete && image.naturalWidth > 0);
  }, null, { timeout: 15000 });
  const decoded = await page.locator('img').evaluateAll(async images => {
    const visible = images.filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight && getComputedStyle(image).visibility !== 'hidden';
    });
    await Promise.all(visible.map(image => image.decode()));
    if (visible.some(image => !image.complete || image.naturalWidth === 0)) throw new Error('A visible DOM artwork is not loaded after decoding.');
    return visible.length;
  });
  // Let decoded pixels reach the compositor before taking visual evidence.
  await frames(page, 2);
  return decoded;
}

async function capture(page, name) {
  const decodedVisibleImages = await visibleImagesDecoded(page);
  await page.screenshot({ path: path.join(output, name) });
  (report.screenshots ||= []).push({ name, decodedVisibleImages });
}

async function ready(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SLOP_DATA?.works?.some(work => work.generation?.status === 'complete') && document.querySelector('.slop-card'), null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await visibleImagesDecoded(page);
}

async function completedWorks(page) {
  return page.evaluate(() => window.SLOP_DATA.works.filter(work => work.image && work.generation?.status === 'complete').map(work => ({ ...work, styleName: window.SLOP_DATA.styles.find(style => style.id === work.styleId)?.name || '' })));
}

async function visibleCard(page) {
  return page.locator('.slop-card').evaluateAll(elements => {
    const candidates = elements.map(element => {
      const rect = element.getBoundingClientRect();
      const x = Math.max(24, Math.min(innerWidth - 24, rect.x + rect.width / 2));
      const y = Math.max(105, Math.min(innerHeight - 90, rect.y + rect.height / 2));
      return { x, y, index: Number(element.dataset.index), title: element.dataset.title, inside: x > rect.left + 8 && x < rect.right - 8 && y > rect.top + 8 && y < rect.bottom - 8 && document.elementFromPoint(x, y)?.closest('.slop-card') === element };
    }).filter(candidate => candidate.inside);
    candidates.sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2));
    if (!candidates.length) throw new Error('No unobscured artwork is available for interaction.');
    return candidates[0];
  });
}

async function noDialog(page) {
  assert.equal(await page.locator('dialog[open]').count(), 0, 'A pan or zoom unexpectedly opened a dialog.');
}

async function checkLayout(page, label) {
  const layout = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    dialogs: [...document.querySelectorAll('dialog[open]')].map(dialog => ({ id: dialog.id, rect: dialog.getBoundingClientRect().toJSON(), modal: dialog.matches(':modal') })),
  }));
  assert.ok(layout.scroll[0] <= layout.viewport[0] + 1, `${label}: horizontal document overflow`);
  assert.ok(layout.scroll[1] <= layout.viewport[1] + 1, `${label}: vertical document overflow`);
  for (const dialog of layout.dialogs) {
    assert.equal(dialog.modal, true, `${label}: dialog is not native modal`);
    assert.ok(dialog.rect.left >= -1 && dialog.rect.top >= -1 && dialog.rect.right <= layout.viewport[0] + 1 && dialog.rect.bottom <= layout.viewport[1] + 1, `${label}: dialog extends beyond viewport`);
  }
}

async function imageChecks(page, label, works) {
  const loaded = await page.evaluate(async works => Promise.all(works.map(async work => {
    const assets = await Promise.all([...new Set([work.image, work.fallback].filter(Boolean))].map(src => new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error(`Image load timed out: ${src}`)), 15000);
      image.onload = () => { clearTimeout(timer); resolve({ src, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`Broken generated image: ${src}`)); };
      image.src = src;
    })));
    return { id: work.id, assets };
  })), works);
  for (const work of loaded) for (const asset of work.assets) assert.ok(asset.width > 100 && asset.height > 100, 'Artwork did not load real image pixels.');
  await visibleImagesDecoded(page);
  pass(`${label}: ${works.length} completed artworks and their fallbacks load`, loaded);
}

async function mouseChecks(page) {
  const viewport = page.viewportSize();
  const before = await camera(page);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 150, viewport.height / 2 + 85, { steps: 12 });
  await page.mouse.up();
  await settle(page);
  const dragged = await camera(page);
  assert.ok(Math.hypot(dragged.x - before.x, dragged.y - before.y) > 80, 'Mouse drag did not pan.');
  await noDialog(page);
  for (const [dx, dy, axis] of [[230, 0, 'x'], [0, 210, 'y']]) {
    const prior = await camera(page);
    await page.mouse.wheel(dx, dy);
    await settle(page);
    const after = await camera(page);
    assert.ok(Math.abs(after[axis] - prior[axis]) > 100, `Wheel ${axis} did not pan.`);
    await noDialog(page);
  }
  const anchor = { x: viewport.width * 0.36, y: viewport.height * 0.43 };
  await page.mouse.move(anchor.x, anchor.y);
  const prior = await camera(page);
  await page.keyboard.down('Control');
  try { await page.mouse.wheel(0, -100); } finally { await page.keyboard.up('Control'); }
  await settle(page);
  const zoomed = await camera(page);
  assert.ok(zoomed.zoom > prior.zoom * 1.3, 'Ctrl-wheel did not zoom.');
  const anchorError = Math.hypot((anchor.x - prior.x) / prior.zoom - (anchor.x - zoomed.x) / zoomed.zoom, (anchor.y - prior.y) / prior.zoom - (anchor.y - zoomed.y) / zoomed.zoom);
  assert.ok(anchorError < 1, `Ctrl-wheel moved its world anchor by ${anchorError}px.`);
  await noDialog(page);
  const initialCount = zoomed.tiles;
  let maximumCount = initialCount;
  for (let index = 0; index < 24; index++) {
    await page.mouse.wheel(1300, index % 2 ? -850 : 700);
    await frames(page, 2);
    maximumCount = Math.max(maximumCount, (await camera(page)).tiles);
  }
  await settle(page);
  const final = await camera(page);
  assert.ok(maximumCount <= initialCount + 40 && final.tiles <= initialCount + 16, 'Virtualized tile DOM grew during a long pan.');
  assert.ok(Math.abs(final.x - zoomed.x) > 10000, 'Long pan did not travel through the repeating wall.');
  await noDialog(page);
  await visibleImagesDecoded(page);
  pass('Desktop: drag, both wheel axes, anchored Ctrl-wheel and bounded long-pan DOM', { anchorError, initialCount, maximumCount, finalCount: final.tiles });
}

async function wallKeyboardChecks(page) {
  await page.evaluate(() => document.activeElement?.blur());
  const initial = await camera(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  const moved = await camera(page);
  assert.ok(Math.abs(moved.x - initial.x) > 600 * initial.zoom, 'Rapid arrow presses did not accumulate from initial page focus.');
  await page.keyboard.press('Home');
  await settle(page);
  const centered = await camera(page);
  assert.ok(Math.hypot(centered.x - initial.x, centered.y - initial.y) < 1, 'Home did not restore the initial center.');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await settle(page);
  assert.ok((await camera(page)).zoom > initial.zoom * 1.3, 'Rapid keyboard zoom presses did not accumulate.');
  await page.keyboard.press('Home');
  await settle(page);
  await noDialog(page);
  pass('Desktop: keyboard navigation from initial page focus and accumulated arrow/zoom presses');
}

async function dialogChecks(page, label, works) {
  const allWorks = await page.evaluate(() => window.SLOP_DATA.works);
  const activeIds = works.map(work => work.id);
  const retired = allWorks.filter(work => work.generation?.status === 'retired');
  const tileIds = await page.locator('.slop-card').evaluateAll(tiles => tiles.map(tile => tile.dataset.workId));
  assert.ok(tileIds.length > 0 && tileIds.every(id => activeIds.includes(id)), 'The wall includes an inactive work.');
  assert.equal(await page.locator('#slop-nav-count').textContent(), String(works.length), 'The gallery count includes retired works.');
  for (const name of ['about', 'index', 'ledger']) {
    const opener = page.locator(`.slop-nav [data-dialog="slop-${name}"]`);
    await opener.click();
    await page.locator(`#slop-${name}`).waitFor({ state: 'visible' });
    await checkLayout(page, `${label} ${name}`);
    await page.keyboard.press('Escape');
    await page.locator(`#slop-${name}`).waitFor({ state: 'hidden' });
    await page.waitForFunction(selector => document.querySelector(selector) === document.activeElement, `.slop-nav [data-dialog="slop-${name}"]`);
  }
  const revised = works.filter(work => work.generation?.revisions?.length).sort((a, b) => b.generation.attempts - a.generation.attempts);
  const target = revised[0] || works[Math.min(1, works.length - 1)];
  await page.locator('#slop-index-button').click();
  const input = page.locator('#slop-search');
  await input.fill('');
  const indexEntries = await page.locator('.slop-index-item').evaluateAll(items => items.map(item => ({ id: item.dataset.workId, caption: item.querySelector('.slop-index-style').textContent })));
  assert.deepEqual(indexEntries.map(item => item.id), activeIds, 'The Index must contain each active work once, with no retired works.');
  assert.ok(indexEntries.every(item => item.caption.startsWith(`${String(item.id).padStart(3, '0')} / `)), 'Index labels renumbered the retained works.');
  await input.fill(target.title);
  assert.ok(await page.locator('.slop-index-item').count() >= 1, 'Phrase search found no artwork.');
  assert.ok((await page.locator('#slop-index-grid').innerText()).includes(target.title));
  await input.fill(target.styleName);
  assert.ok((await page.locator('#slop-index-grid').innerText()).includes(target.title), 'Style search lost its artwork.');
  await input.fill('qzx-no-such-artwork-741');
  assert.equal(await page.locator('.slop-index-item').count(), 0);
  await input.fill(target.title);
  await page.locator('.slop-index-item').filter({ hasText: target.title }).first().click();
  await page.locator('#slop-index').waitFor({ state: 'hidden' });
  await settle(page);
  await visibleImagesDecoded(page);
  assert.equal(await page.locator('#slop-near-title').textContent(), target.title, 'Index jump centered the wrong work.');
  assert.equal(await page.locator('#slop-near-number').textContent(), `WORK ${String(target.id).padStart(3, '0')} / ${works.length} ON VIEW`);
  assert.equal(await page.locator('.slop-card:focus').getAttribute('data-title'), target.title, 'Index jump did not focus the centered artwork.');
  assert.equal(await page.locator('.slop-card:focus').getAttribute('data-work-id'), target.id, 'The focused artwork lost its stable work id.');
  await page.keyboard.press('Enter');
  await page.locator('#slop-work').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#slop-work-title').textContent(), target.title);
  assert.equal(await page.locator('#slop-work-number').textContent(), `WORK ${String(target.id).padStart(3, '0')}`, 'The popup renumbered the retained work.');
  await page.waitForFunction(() => document.querySelector('#slop-work-image img')?.naturalWidth > 100);
  const facts = await page.locator('#slop-work-facts > div').evaluateAll(rows => rows.map(row => ({ label: row.querySelector('dt').textContent, value: row.querySelector('dd').textContent })));
  assert.deepEqual(facts.map(fact => fact.label), ['Attempts', 'Generated with'], 'Artwork metadata must contain only the attempt count and combined provider/model line.');
  const attempts = target.generation?.attempts;
  assert.equal(facts[0].value, typeof attempts === 'number' && Number.isFinite(attempts) && attempts >= 0 ? new Intl.NumberFormat('en-US').format(attempts) : 'Not reported');
  assert.equal(facts[1].value, target.generation?.model ? `OpenAI ${target.generation.model}` : 'OpenAI · model not reported', 'The image model must come from its generation record.');
  await capture(page, `${label}-artwork-open.png`);
  await page.locator('.slop-prompt summary').click();
  assert.equal(await page.locator('#slop-work-prompt').textContent(), target.prompt, 'Displayed prompt differs from the stored generation prompt.');
  await checkLayout(page, `${label} artwork`);
  await capture(page, `${label}-artwork.png`);
  await page.locator('#slop-work [data-close]').click();
  await page.locator('#slop-work').waitFor({ state: 'hidden' });
  await page.locator('.slop-nav [data-dialog="slop-ledger"]').click();
  await page.locator('#slop-tab-production').focus();
  for (const [key, targetId] of [['ArrowRight', 'slop-tab-phrases'], ['End', 'slop-tab-styles'], ['Home', 'slop-tab-production'], ['ArrowLeft', 'slop-tab-styles'], ['Home', 'slop-tab-production']]) {
    await page.keyboard.press(key);
    assert.equal(await page.locator(`#${targetId}`).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator(`#${targetId}`).evaluate(element => element === document.activeElement), true);
    const panel = await page.locator(`#${targetId}`).getAttribute('aria-controls');
    assert.equal(await page.locator(`#${panel}`).isVisible(), true);
  }
  const imageStat = page.locator('.slop-stat').filter({ has: page.locator('.slop-stat-label', { hasText: 'Image inference tokens' }) });
  assert.equal(await imageStat.locator('.slop-stat-value').textContent(), 'Not reported');
  const generatedStat = page.locator('.slop-stat').filter({ has: page.locator('.slop-stat-label', { hasText: 'Unique generated works' }) });
  const generatedCount = allWorks.filter(work => work.image && Number.isFinite(work.generation?.attempts) && work.generation.attempts > 0).length;
  assert.equal(await generatedStat.locator('.slop-stat-value').textContent(), new Intl.NumberFormat('en-US').format(generatedCount), 'The production total lost retired images.');
  const attemptsStat = page.locator('.slop-stat').filter({ has: page.locator('.slop-stat-label', { hasText: 'Lifetime image attempts' }) });
  const attemptsKnown = allWorks.every(work => typeof work.generation?.attempts === 'number' && Number.isFinite(work.generation.attempts) && work.generation.attempts >= 0);
  const expectedAttempts = attemptsKnown ? new Intl.NumberFormat('en-US').format(allWorks.reduce((sum, work) => sum + work.generation.attempts, 0)) : 'Not reported';
  assert.equal(await attemptsStat.locator('.slop-stat-value').textContent(), expectedAttempts, 'The production total lost historical image attempts.');
  const ledgerRows = await page.locator('#slop-ledger-rows tr').evaluateAll(rows => rows.map(row => ({ id: row.dataset.workId, clickable: !!row.querySelector('button'), cells: [...row.cells].map(cell => cell.textContent), retirementReason: row.cells[4]?.title })));
  assert.deepEqual(ledgerRows.map(row => row.id), allWorks.map(work => work.id), 'The Ledger must retain all historical work records.');
  for (let index = 0; index < allWorks.length; index++) {
    const work = allWorks[index];
    const row = ledgerRows[index];
    assert.equal(row.clickable, activeIds.includes(work.id), `${work.id}: only active Ledger records may open an artwork.`);
    assert.equal(row.cells[4], work.generation?.status || 'Not recorded', `${work.id}: incorrect Ledger status.`);
    const attempts = work.generation?.attempts;
    assert.equal(row.cells[2], typeof attempts === 'number' && Number.isFinite(attempts) && attempts >= 0 ? new Intl.NumberFormat('en-US').format(attempts) : 'Not reported', `${work.id}: incorrect lifetime attempt count.`);
    if (work.generation?.status === 'retired') assert.equal(row.retirementReason, work.retirement?.reason, `${work.id}: the Ledger lost its retirement reason.`);
  }
  if (retired.length) {
    const note = await page.locator('#slop-usage-note').textContent();
    assert.ok(note.includes(`${works.length} works on view.`) && note.includes(`${retired.length} retired `) && note.includes('Totals include their images and attempts.'), 'The Ledger does not explain retired production totals.');
  }
  const imageUsageCells = await page.locator('#slop-ledger-rows tr td:nth-child(4)').allTextContents();
  assert.ok(imageUsageCells.length === allWorks.length && imageUsageCells.every(value => value === 'Not reported'), 'Unknown per-image tokens were changed to zero.');
  await checkLayout(page, `${label} ledger`);
  await capture(page, `${label}-ledger.png`);
  await page.keyboard.press('Escape');
  await page.locator('#slop-ledger').waitFor({ state: 'hidden' });
  pass(`${label}: native dialogs, focus return, phrase/style index jump, prompts and keyboard ledger tabs`);
  pass(`${label}: stable work ids, ${works.length} active works and ${retired.length} retired records, lifetime production totals`);
}

async function historyChecks(page, context, label, url) {
  await ready(page, url);
  const card = await visibleCard(page);
  const before = page.url();
  await page.mouse.click(card.x, card.y);
  await page.locator('#slop-work').waitFor({ state: 'visible' });
  const linked = page.url();
  assert.notEqual(linked, before, 'Opening an artwork did not create a shareable URL.');
  const title = await page.locator('#slop-work-title').textContent();
  await page.goBack();
  await page.locator('#slop-work').waitFor({ state: 'hidden' });
  await visibleImagesDecoded(page);
  await page.goForward();
  await page.locator('#slop-work').waitFor({ state: 'visible' });
  await visibleImagesDecoded(page);
  assert.equal(await page.locator('#slop-work-title').textContent(), title);
  await page.keyboard.press('Escape');
  await page.locator('#slop-work').waitFor({ state: 'hidden' });
  const direct = await context.newPage();
  observe(direct, `${label} direct link`);
  try {
    await ready(direct, linked);
    await direct.locator('#slop-work').waitFor({ state: 'visible' });
    assert.equal(await direct.locator('#slop-work-title').textContent(), title);
    await direct.keyboard.press('Escape');
    await direct.locator('#slop-work').waitFor({ state: 'hidden' });
    // Native dialog close events are queued after the open attribute disappears.
    await direct.waitForURL(current => current.toString() !== linked);
    assert.notEqual(direct.url(), linked, 'Closing a direct link left the work URL active.');
    const retiredId = await page.evaluate(() => window.SLOP_DATA.works.find(work => work.generation?.status === 'retired')?.id);
    if (retiredId) {
      await ready(direct, `${url}#work=${encodeURIComponent(retiredId)}`);
      await noDialog(direct);
      assert.equal(await direct.locator(`.slop-card[data-work-id="${retiredId}"]`).count(), 0, 'A retired direct link returned an image to the wall.');
    }
  } finally { await direct.close(); }
  pass(`${label}: direct artwork URLs, browser Back/Forward and close state`);
}

async function touchChecks(page, context, label) {
  const cdp = await context.newCDPSession(page);
  const point = (id, x, y) => ({ id, x, y, radiusX: 4, radiusY: 4, force: 1 });
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  try {
    const card = await visibleCard(page);
    const prior = await camera(page);
    await send('touchStart', [point(1, card.x, card.y)]);
    for (let index = 1; index <= 10; index++) {
      await send('touchMove', [point(1, card.x + index * 6, card.y + index * 5)]);
      await frames(page, 1);
    }
    await send('touchEnd', []);
    await settle(page);
    const dragged = await camera(page);
    assert.ok(Math.hypot(dragged.x - prior.x, dragged.y - prior.y) > 40, 'Real touch drag did not move the wall.');
    await noDialog(page);
    const viewport = page.viewportSize();
    const middle = { x: viewport.width / 2, y: viewport.height / 2 };
    const beforePinch = await camera(page);
    await send('touchStart', [point(2, middle.x - 42, middle.y), point(3, middle.x + 42, middle.y)]);
    for (let index = 1; index <= 10; index++) {
      await send('touchMove', [point(2, middle.x - 42 - index * 4, middle.y), point(3, middle.x + 42 + index * 4, middle.y)]);
      await frames(page, 1);
    }
    await send('touchEnd', []);
    await settle(page);
    const afterPinch = await camera(page);
    assert.ok(afterPinch.zoom > beforePinch.zoom * 1.5, 'Real two-finger pinch did not zoom.');
    const anchorError = Math.hypot((middle.x - beforePinch.x) / beforePinch.zoom - (middle.x - afterPinch.x) / afterPinch.zoom, (middle.y - beforePinch.y) / beforePinch.zoom - (middle.y - afterPinch.y) / afterPinch.zoom);
    assert.ok(anchorError < 2, `Touch pinch moved its world anchor by ${anchorError}px.`);
    await noDialog(page);
    await visibleImagesDecoded(page);
    const tap = await visibleCard(page);
    await send('touchStart', [point(4, tap.x, tap.y)]);
    await send('touchEnd', []);
    await page.locator('#slop-work').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#slop-work-title').textContent(), tap.title, 'A touch tap selected the wrong artwork.');
    await page.keyboard.press('Escape');
    await page.locator('#slop-work').waitFor({ state: 'hidden' });
    pass(`${label}: real CDP touch drag/pinch, fixed pinch anchor and suppressed gesture clicks`, { anchorError });
  } finally { await cdp.detach(); }
}

async function shuffleCheck(page, label) {
  await page.locator('#slop-shuffle').click();
  await settle(page);
  await noDialog(page);
  const decodedVisibleImages = await visibleImagesDecoded(page);
  await capture(page, `${label}-shuffled.png`);
  pass(`${label}: every viewport-intersecting DOM image loads and decodes after shuffle`, { decodedVisibleImages });
}

async function reducedMotionCheck(url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  currentPage = page;
  observe(page, 'Reduced motion');
  try {
    await ready(page, url);
    await page.mouse.move(600, 410);
    await page.mouse.down();
    await page.mouse.move(810, 490, { steps: 8 });
    await page.mouse.up();
    await frames(page, 2);
    const release = await camera(page);
    await frames(page, 20);
    const later = await camera(page);
    assert.ok(Math.hypot(later.x - release.x, later.y - release.y) < 0.1, 'Reduced motion retained drag inertia.');
    await noDialog(page);
    pass('Reduced motion: no drag inertia after pointer release');
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await playwright.chromium.launch({ headless: true, executablePath });
    const url = `http://127.0.0.1:${server.address().port}/slop.html`;
    for (const [label, width, height, touch] of [['desktop', 1440, 900, false], ['portrait', 375, 812, true], ['landscape', 844, 390, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const page = await context.newPage();
      currentPage = page;
      page.setDefaultTimeout(12000);
      observe(page, label);
      try {
        await ready(page, url);
        const works = await completedWorks(page);
        assert.ok(works.length > 0, 'No completed artworks are available for browser verification.');
        report.viewports.push({ label, width, height, completedWorks: works.length });
        await imageChecks(page, label, works);
        await checkLayout(page, label);
        await capture(page, `${label}-wall.png`);
        if (!touch) { await wallKeyboardChecks(page); await mouseChecks(page); }
        await dialogChecks(page, label, works);
        await historyChecks(page, context, label, url);
        if (touch) await touchChecks(page, context, label);
        await shuffleCheck(page, label);
        await checkLayout(page, `${label} final`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    await reducedMotionCheck(url);
    assert.deepEqual(report.errors, [], 'Browser reported console, JavaScript or asset failures.');
    pass('No JavaScript, console, broken-asset or viewport overflow errors');
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
