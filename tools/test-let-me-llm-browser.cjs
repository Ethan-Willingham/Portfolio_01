#!/usr/bin/env node
// Real UI checks with an owned HTTP server and owned testing browsers.
// Run: node tools/test-let-me-llm-browser.cjs [evidence-directory]
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '/Users/ethan/Portfolio_01/research/let-me-llm/evidence/browser');
const pageFile = path.join(root, 'let-me-llm-that-for-you.html');
const QUESTION = 'Why does the Moon cause tides?';
const LONG_QUESTION = 'A question that needs several lines can still be read before ChatGPT opens. '.repeat(6).trim();
const report = { date: '2026-10-09', caseFilter: process.env.LMLTFY_CASE || null, browserFilter: process.env.LMLTFY_BROWSER || null, environments: [], checks: [], failures: [], unverified: [], timing: [], recordings: [], screenshots: [], captureWarnings: [] };
let browser, base, html, pasteHTML, api;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  let source;
  if (pathname === '/let-me-llm-that-for-you.html' || pathname === '/let-me-llm-that-for-you') source = html;
  else if (pathname === '/paste.html') source = pasteHTML;
  else if (pathname.startsWith('/history-')) source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>History sentinel</title></head><body><a id="continue" href="/let-me-llm-that-for-you.html#${api.encode(QUESTION)}">Continue</a></body></html>`;
  else { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(source);
});

function pass(engine, name, details) { report.checks.push({ engine, name, ...(details ? { details } : {}) }); console.log('PASS', engine, name); }
function unverified(engine, name, reason) { report.unverified.push({ engine, name, reason }); console.log('UNVERIFIED', engine, name, reason); }
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitHandoff(state, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (!state.handoffs.length && Date.now() < deadline) await delay(50);
  assert.ok(state.handoffs.length, 'Expected navigation did not occur');
}
async function tappedHandoff(state, engine, name) {
  const deadline = Date.now() + 2000;
  while (!state.handoffs.length && Date.now() < deadline) await delay(25);
  if (state.handoffs.length) return true;
  if (engine === 'webkit') {
    unverified(engine, name, 'WebKit emits no request for a user-activated ChatGPT navigation in this harness. A minimal page without CSP or test instrumentation reproduces it. Direct recipient navigation and the deferred paste-copy navigation are intercepted; real Safari and universal-link behavior remain owner checks.');
    return false;
  }
  assert.fail('Expected tapped navigation did not occur');
}

async function cleanup() {
  await browser?.close();
  browser = null;
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
});

function auditBeforeScripts() {
  window.__storageAccess = [];
  window.__clipboardWrites = [];
  window.__samples = [];
  window.__pageShows = [];
  window.__firstVisibleFrame = null;
  const audit = (kind, value) => {
    if (window.__browserAudit) window.__browserAudit(kind, value).catch(() => {});
  };
  const storage = name => { window.__storageAccess.push(name); audit('storage', name); };
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function (...args) { storage('Storage.' + name); return original.apply(this, args); };
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor?.get) Object.defineProperty(window, name, { configurable: true, get() { storage(name); return descriptor.get.call(window); } });
  }
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (cookie?.get) Object.defineProperty(Document.prototype, 'cookie', { configurable: true,
    get() { storage('cookie.read'); return cookie.get.call(this); },
    set(value) { storage('cookie.write'); return cookie.set.call(this, value); } });
  for (const [object, names] of [[window.indexedDB, ['open', 'deleteDatabase']], [window.caches, ['open', 'match', 'delete']]]) {
    if (!object) continue;
    for (const name of names) {
      const original = object[name];
      if (original) object[name] = function (...args) { storage(name); return original.apply(this, args); };
    }
  }
  if (navigator.clipboard?.writeText) {
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = value => {
      const write = { text: value, at: performance.now(), active: navigator.userActivation?.isActive };
      window.__clipboardWrites.push(write); audit('clipboard', write); return original(value);
    };
  }
  addEventListener('pageshow', event => { const show = { persisted: event.persisted, at: performance.now() }; window.__pageShows.push(show); audit('pageshow', show); });
  addEventListener('DOMContentLoaded', () => {
    let last = -100;
    function sample(now) {
      if (!document.hidden && window.__firstVisibleFrame === null) window.__firstVisibleFrame = now;
      if (now - last > 65) {
        last = now;
        const typed = document.getElementById('typed'), pointer = document.getElementById('pointer');
        if (typed && pointer) {
          const row = document.getElementById('row').getBoundingClientRect();
          const send = document.getElementById('ghost-send').getBoundingClientRect();
          const matrix = new DOMMatrix(getComputedStyle(pointer).transform);
          const sample = { at: now, text: typed.textContent, hidden: document.hidden,
            pointer: !pointer.hidden && Number(pointer.style.opacity) > 0.01,
            x: matrix.e, y: matrix.f, rowX: row.left + row.width * .05, rowY: row.top + row.height * .5,
            sendX: send.left + send.width * .5, sendY: send.top + send.height * .5,
            caption: document.getElementById('caption').textContent,
            tip: !document.getElementById('tip').hidden,
            caret: !document.getElementById('caret').hidden,
            arrow: getComputedStyle(document.getElementById('arrow')).display !== 'none',
            ibeam: getComputedStyle(document.getElementById('ibeam')).display !== 'none',
            focused: document.activeElement?.id || document.activeElement?.tagName };
          window.__samples.push(sample); audit('sample', sample);
        }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

async function fixture(engine, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', ...options });
  if (engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const state = { context, page: null, requests: [], errors: [], handoffs: [], reply: 204, samples: [], storage: [], clipboard: [], pageShows: [] };
  await context.exposeBinding('__browserAudit', ({ page }, kind, value) => {
    if (page !== state.page) return;
    const field = { sample: 'samples', storage: 'storage', clipboard: 'clipboard', pageshow: 'pageShows' }[kind];
    if (field) state[field].push(value);
  });
  await context.addInitScript(auditBeforeScripts);
  const page = await context.newPage();
  state.page = page;
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Playwright's WebKit screenshot inserts CSS despite the page's hash policy.
    // A native no-instrumentation repro confirms this specific capture-only error.
    if (state.capturing && engine === 'webkit' && text === "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.") {
      report.captureWarnings.push({ engine, text, url: page.url() });
    } else state.errors.push(text);
  });
  page.on('request', request => state.requests.push({ url: request.url(), type: request.resourceType() }));
  await context.route('https://chatgpt.com/**', async route => {
    // Resolve the pending document request before evaluating its current page.
    state.handoffs.push({ url: route.request().url(), at: Date.now(), referrer: route.request().headers().referer || null });
    if (state.reply === 204) await route.fulfill({ status: 204 });
    else await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Intercepted ChatGPT</title><main>Navigation intercepted by the test</main>' });
  });
  return state;
}

async function goto(state, suffix = '') {
  // A changed fragment on the same document does not run the entry script again.
  await state.page.goto('about:blank');
  state.requests.length = 0;
  state.errors.length = 0;
  state.handoffs.length = 0;
  for (const field of ['samples', 'storage', 'clipboard', 'pageShows']) state[field].length = 0;
  await state.page.goto(base + '/let-me-llm-that-for-you.html' + suffix, { waitUntil: 'load' });
  await state.page.waitForFunction(() => Boolean(window.LMLTFY));
}

async function clean(state, single = false) {
  assert.deepEqual(state.errors, [], 'Console and JavaScript must remain clean');
  assert.deepEqual(state.storage, [], 'The page accessed storage');
  assert.deepEqual(await state.context.cookies(), [], 'The page wrote cookies');
  const unexpected = state.requests.filter(item => !item.url.startsWith(base + '/') && !item.url.startsWith('https://chatgpt.com/'));
  assert.deepEqual(unexpected, [], 'Unexpected third-party requests');
  if (single) assert.equal(state.requests.filter(item => item.url.startsWith(base + '/')).length, 1, 'Each page opening must request only its HTML');
}

async function screenshot(state, name) {
  const file = path.join(output, name + '.png');
  state.capturing = true;
  try { await state.page.screenshot({ path: file, fullPage: true }); }
  finally { state.capturing = false; }
  report.screenshots.push(file);
}

async function layout(state) {
  const sizes = await state.page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(sizes.content <= sizes.width + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
}

async function caseRun(engine, name, run, options = {}) {
  if (process.env.LMLTFY_CASE && !process.env.LMLTFY_CASE.split(',').some(filter => name.includes(filter))) return;
  const state = await fixture(engine, options);
  try { await run(state); pass(engine, name); }
  catch (error) {
    report.failures.push({ engine, name, url: state.page.url(), errors: state.errors, handoffs: state.handoffs, error: error.stack || String(error) });
    const diagnostics = await state.page.evaluate(() => ({ url: location.href, samples: window.__samples, storage: window.__storageAccess, shows: window.__pageShows })).catch(() => null);
    fs.writeFileSync(path.join(output, `${engine}-${name.replace(/[^a-z0-9]+/gi, '-')}-diagnostics.json`), JSON.stringify({ errors: state.errors, requests: state.requests, handoffs: state.handoffs, diagnostics }, null, 2) + '\n');
    console.error('FAIL', engine, name, error.message);
    await screenshot(state, `${engine}-${name.replace(/[^a-z0-9]+/gi, '-')}-failure`).catch(() => {});
  } finally {
    const video = state.page.video();
    await state.context.close();
    if (video) {
      const destination = path.join(output, `${engine}-${name.replace(/[^a-z0-9]+/gi, '-')}.webm`);
      await video.saveAs(destination);
      report.recordings.push({ engine, name, path: destination });
    }
  }
}

async function makerChecks(state, engine) {
  const { page } = state;
  await goto(state);
  assert.equal(await page.locator('#example').count(), 0, 'Gate 1 removed Watch an example');
  assert.equal(await page.locator('#make').getAttribute('aria-disabled'), 'true');
  await page.locator('#make').focus();
  await page.locator('#make').press('Enter');
  assert.match(await page.locator('#hint').textContent(), /question/);
  await page.locator('#question').fill('first line');
  await page.locator('#question').evaluate(element => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
  });
  assert.equal(await page.locator('#link-card').isVisible(), false, 'IME Enter made a link');
  await page.locator('#question').press('End');
  await page.locator('#question').press('Shift+Enter');
  assert.equal(await page.locator('#question').inputValue(), 'first line\n');
  const question = 'What about & # + %?\n\u{4E2D}\u{6587}';
  await page.locator('#question').fill(question);
  await page.locator('#question').press('Enter');
  await page.locator('#link-card').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('copy').textContent === 'Copied' || document.getElementById('copy-status').textContent.length > 0);
  const link = await page.locator('#link').inputValue();
  assert.equal(link, 'https://ethanwillingham.com/let-me-llm-that-for-you#' + api.encode(question));
  assert.equal(page.url(), base + '/let-me-llm-that-for-you.html');
  const writes = state.clipboard;
  assert.equal(writes.at(-1).text, link);
  assert.equal(writes.at(-1).active, true, 'Copy did not begin inside user activation');
  if (engine === 'chromium') {
    assert.equal(await page.locator('#copy').textContent(), 'Copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);
  } else if (await page.locator('#copy').textContent() !== 'Copied') {
    unverified(engine, 'native clipboard permission', 'The browser blocked native clipboard; the selected-field fallback is visible. Chromium tests real clipboard permission and content.');
  }
  await page.locator('#preview').click();
  await page.locator('#return').waitFor({ state: 'visible' });
  assert.equal(state.handoffs.length, 0, 'Preview navigated');
  assert.equal(await page.locator('#bubble').textContent(), question);
  await page.locator('#return').click();
  assert.equal(await page.locator('#link').inputValue(), link);
  await page.locator('#edit').click();
  assert.equal(await page.locator('#question').inputValue(), question);
  assert.equal(await page.locator('#question').evaluate(element => element === document.activeElement), true);
  await page.locator('#question').fill('');
  assert.equal(await page.locator('#make').getAttribute('aria-disabled'), 'true');
  assert.equal(state.handoffs.length, 0);
  await clean(state, true);
}

async function recipient(state, engine, label, options = {}) {
  await goto(state, '#' + api.encode(QUESTION));
  assert.equal(await state.page.locator('#replica').getAttribute('inert'), '');
  await state.page.waitForFunction(() => document.getElementById('typed').textContent.length > 0);
  const first = await state.page.evaluate(() => ({ origin: performance.timeOrigin, paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, firstFrame: window.__firstVisibleFrame }));
  if (options.resize) {
    const before = await state.page.locator('#typed').textContent();
    await state.page.setViewportSize({ width: 320, height: 568 });
    assert.ok((await state.page.locator('#typed').textContent()).length >= before.length, 'Resize restarted typing');
  }
  const limit = Date.now() + 12000;
  while (!state.handoffs.length && Date.now() < limit) await delay(50);
  assert.equal(state.handoffs.length, 1, 'No automatic handoff');
  const handoff = state.handoffs[0];
  assert.equal(handoff.url, 'https://chatgpt.com/?q=' + encodeURIComponent(QUESTION));
  assert.equal(handoff.referrer, null, 'The handoff leaked a referrer');
  const start = first.paint ?? first.firstFrame;
  const elapsed = handoff.at - first.origin - start;
  report.timing.push({ engine, label, elapsed, origin: first.paint === undefined ? 'first visible requestAnimationFrame' : 'first contentful paint', url: handoff.url });
  assert.ok(elapsed >= 5000 && elapsed <= 8000, `30-character handoff took ${elapsed}ms`);
  const samples = state.samples;
  fs.writeFileSync(path.join(output, `${engine}-${label}-trace.json`), JSON.stringify({ first, handoff, elapsed, samples }, null, 2) + '\n');
  assert.ok(samples.some(sample => sample.text.length > 0 && sample.text.length < QUESTION.length), 'No visible typing');
  assert.ok(samples.some(sample => sample.caption === 'Step 2: Press send'), 'Step 2 never appeared');
  assert.equal(await state.page.locator('#bubble').textContent(), QUESTION);
  assert.equal(await state.page.locator('#open').isVisible(), false, 'Fallback appeared before 2.5 seconds');
  if (options.jump) {
    const visible = samples.filter(sample => sample.pointer);
    assert.ok(visible.length > 3);
    assert.ok(visible.every(sample => Math.min(Math.hypot(sample.x - sample.rowX, sample.y - sample.rowY), Math.hypot(sample.x - sample.sendX, sample.y - sample.sendY)) < 1), 'Jump pointer traveled between targets');
    assert.ok(samples.every(sample => sample.focused === 'BODY'), 'Recipient focused a control');
  }
  if (options.touch) {
    assert.ok(samples.some(sample => sample.tip), 'Touch never showed the fingertip');
    assert.ok(samples.filter(sample => sample.pointer).every(sample => sample.tip && !sample.arrow && !sample.ibeam), 'Touch displayed a mouse sprite beside the fingertip');
  } else {
    const clickFrames = samples.filter(sample => sample.pointer && sample.caret && sample.caption === 'Step 1: Type your question' && sample.text === '');
    assert.ok(clickFrames.length > 0, 'No click-in frame was sampled');
    assert.ok(clickFrames.every(sample => !sample.arrow && sample.ibeam), 'Click-in did not replace the arrow with the I-beam');
    const sendFrames = samples.filter(sample => sample.pointer && sample.caption === 'Step 2: Press send');
    assert.ok(sendFrames.length > 0, 'No send approach was sampled');
    assert.ok(sendFrames.every(sample => sample.arrow && !sample.ibeam), 'Send approach did not restore the arrow');
  }
  await layout(state);
  await screenshot(state, `${engine}-${label}-recipient`);
  await clean(state, true);
  return handoff;
}

async function fallbackChecks(state, engine) {
  const handoff = await recipient(state, engine, 'fallback');
  await state.page.locator('#open').waitFor({ state: 'visible' });
  const delayFromCall = Date.now() - handoff.at;
  assert.ok(delayFromCall >= 2200 && delayFromCall < 4000, `Fallback delay ${delayFromCall}ms`);
  assert.equal(await state.page.locator('#open').getAttribute('href'), handoff.url);
  await clean(state, true);
}

async function cappedQuestion(state, engine) {
  const question = '\u{4E2D}'.repeat(200);
  await goto(state);
  await state.page.locator('#question').fill(question + 'x');
  assert.equal(await state.page.locator('#make').getAttribute('aria-disabled'), 'true');
  assert.match(await state.page.locator('#hint').textContent(), /Remove 1 bytes/);
  await state.page.locator('#question').fill(question);
  assert.equal(await state.page.locator('#hint').textContent(), '0 bytes left');
  await goto(state, '#' + api.encode(question));
  await state.page.waitForFunction(() => document.getElementById('caption').textContent === 'Step 1: Type your question');
  const first = await state.page.evaluate(() => ({ origin: performance.timeOrigin, paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, firstFrame: window.__firstVisibleFrame }));
  await waitHandoff(state);
  const handoff = state.handoffs[0];
  const elapsed = handoff.at - first.origin - (first.paint ?? first.firstFrame);
  assert.ok(elapsed < 10000, `600-byte question took ${elapsed}ms`);
  assert.equal(handoff.url, 'https://chatgpt.com/?q=' + encodeURIComponent(question));
  assert.equal(await state.page.locator('#bubble').textContent(), question);
  assert.ok(state.samples.some(sample => sample.text === question), 'The cap-length question never appeared');
  assert.ok(state.samples.every(sample => sample.text === '' || sample.text === question), 'The long-question paste split the text');
  report.timing.push({ engine, label: '600-byte CJK paste', elapsed, urlLength: handoff.url.length });
  await layout(state); await clean(state, true);
}

async function escAndSkip(state, engine) {
  await goto(state, '#' + api.encode(QUESTION));
  await state.page.waitForFunction(() => document.getElementById('typed').textContent.length > 0);
  await state.page.keyboard.press('Escape');
  assert.equal(await state.page.locator('#typed').textContent(), QUESTION);
  assert.equal(await state.page.locator('#finished-send').isVisible(), true);
  assert.equal(await state.page.locator('#open').isVisible(), true);
  assert.equal(state.handoffs.length, 0);
  await state.page.locator('#finished-send').click();
  if (await tappedHandoff(state, engine, 'Escape finished-state manual send')) assert.equal(state.handoffs[0].url, 'https://chatgpt.com/?q=' + encodeURIComponent(QUESTION));
  await goto(state, '#' + api.encode(QUESTION));
  await state.page.keyboard.press('Tab');
  if (engine === 'webkit' && await state.page.evaluate(() => document.activeElement.id) !== 'skip') {
    await state.page.keyboard.press('Alt+Tab');
    if (await state.page.evaluate(() => document.activeElement.id) === 'skip') pass(engine, 'native Option+Tab focuses the skip link');
    else {
      unverified(engine, 'native Tab focus for links', 'The headless WebKit session does not focus links through Tab or Option+Tab. Programmatic focus still verifies that the skip link reveals itself; real Safari keyboard preferences remain a manual check.');
      await state.page.locator('#skip').focus();
    }
  }
  assert.equal(await state.page.evaluate(() => document.activeElement.id), 'skip');
  assert.equal(await state.page.locator('#skip').evaluate(element => element.getBoundingClientRect().top >= 0), true);
  await state.page.keyboard.press('Enter');
  if (await tappedHandoff(state, engine, 'keyboard skip handoff')) assert.equal(state.handoffs[0].url, 'https://chatgpt.com/?q=' + encodeURIComponent(QUESTION));
  await clean(state, true);
}

async function brokenAndXSS(state) {
  for (const fragment of ['!', api.encode(QUESTION).slice(0, -2), Buffer.from('v1|claude|5|hello').toString('base64url'), Buffer.from('v1|chatgpt|10000|' + 'x'.repeat(10000)).toString('base64url'), 'q=hello']) {
    await goto(state, '#' + fragment);
    assert.equal(await state.page.locator('#maker').isVisible(), true);
    assert.match(await state.page.locator('#hint').textContent(), /isn't valid/);
    assert.equal(state.handoffs.length, 0);
    await clean(state, true);
  }
  await goto(state, '?q=readable');
  assert.equal(await state.page.locator('#maker').isVisible(), true);
  assert.equal(await state.page.locator('#question').inputValue(), '');
  const raw = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script> javascript:alert(1)\u{202E}\u{E0041}';
  const cleanText = raw.replace(/[\u{202E}\u{E0041}]/gu, '');
  const payload = Buffer.from(`v1|chatgpt|${Buffer.byteLength(raw)}|${raw}`).toString('base64url');
  await goto(state, '#' + payload);
  await state.page.keyboard.press('Escape');
  assert.equal(await state.page.locator('#typed').textContent(), cleanText);
  assert.equal(await state.page.locator('#typed img, #typed script, #bubble img, #bubble script').count(), 0);
  assert.equal(await state.page.evaluate(() => window.__xss), undefined);
  await clean(state, true);
}

async function hashEntry(state) {
  const { page } = state;
  await goto(state);
  const origin = await page.evaluate(() => {
    window.__hashEntryMarker = 'same-document';
    return performance.timeOrigin;
  });
  const sameDocument = async () => {
    assert.deepEqual(await page.evaluate(() => ({ marker: window.__hashEntryMarker, origin: performance.timeOrigin })), { marker: 'same-document', origin });
    assert.equal(state.requests.filter(request => request.url.startsWith(base + '/')).length, 1, 'Changing the fragment reloaded the HTML');
  };
  await page.evaluate(payload => { location.hash = payload; }, api.encode(QUESTION));
  await page.locator('#recipient').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('typed').textContent.length > 0);
  assert.equal(await page.locator('#bubble').textContent(), QUESTION);
  assert.equal(await page.locator('#replica').getAttribute('inert'), '');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BODY');
  await sameDocument();
  await page.keyboard.press('Escape');
  assert.equal(state.handoffs.length, 0);
  await page.evaluate(() => { location.hash = ''; });
  await page.locator('#maker').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#recipient').isVisible(), false);
  await page.evaluate(() => { location.hash = '!'; });
  await page.waitForFunction(() => document.getElementById('hint').textContent.includes("isn't valid"));
  assert.equal(await page.locator('#maker').isVisible(), true);
  assert.equal(await page.locator('#recipient').isVisible(), false);
  await sameDocument();
  await page.evaluate(payload => { location.hash = payload; }, api.encode('A second question'));
  await page.locator('#recipient').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#bubble').textContent(), 'A second question');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#typed').textContent(), 'A second question');
  await sameDocument();
  await delay(800);
  assert.equal(state.handoffs.length, 0, 'An old hash-entry clock navigated after Escape');
  await clean(state, true);
}

async function longLayout(state, engine, label) {
  await goto(state, '#' + api.encode(LONG_QUESTION));
  await waitHandoff(state);
  await state.page.locator('#open').waitFor({ state: 'visible' });
  assert.equal(state.handoffs.length, 1);
  assert.equal(state.handoffs[0].url, 'https://chatgpt.com/?q=' + encodeURIComponent(LONG_QUESTION));
  const metrics = async () => state.page.evaluate(() => {
    const box = id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
    };
    const text = document.getElementById('bubble-text');
    return { width: innerWidth, height: innerHeight, bubble: box('bubble'), text: box('bubble-text'), replica: box('replica'),
      footer: { top: document.querySelector('footer').getBoundingClientRect().top }, lineHeight: parseFloat(getComputedStyle(text).lineHeight),
      focused: document.activeElement.tagName, question: text.textContent, typed: document.getElementById('typed').textContent };
  });
  const sent = await metrics();
  assert.equal(sent.question, LONG_QUESTION);
  assert.equal(sent.focused, 'BODY');
  assert.ok(sent.bubble.bottom + 8 <= sent.replica.top, `Bubble and composer collide: ${JSON.stringify(sent)}`);
  const lines = sent.height <= 359 ? 1 : sent.height <= 450 ? 2 : 8;
  assert.ok(sent.text.height <= lines * sent.lineHeight + 1, 'Sent text exceeds the available line clamp');
  const wholeLines = sent.text.height / sent.lineHeight;
  assert.ok(Math.abs(wholeLines - Math.round(wholeLines)) < .05, 'The clamp exposes a partial line');
  await layout(state); await screenshot(state, `${engine}-${label}-long-fallback`);
  await state.page.keyboard.press('Escape');
  const finished = await metrics();
  assert.equal(finished.typed, LONG_QUESTION);
  assert.equal(finished.focused, 'BODY');
  assert.ok(finished.replica.bottom + 8 <= finished.footer.top, `Finished composer covers the footer: ${JSON.stringify(finished)}`);
  assert.equal(state.handoffs.length, 1, 'Escape navigated after the original intercepted handoff');
  await layout(state); await screenshot(state, `${engine}-${label}-long-escape`);
  fs.writeFileSync(path.join(output, `${engine}-${label}-long-layout.json`), JSON.stringify({ questionBytes: Buffer.byteLength(LONG_QUESTION), sent, finished }, null, 2) + '\n');
  await clean(state, true);
}

async function pasteChecks(state, engine) {
  await state.page.goto(base + '/paste.html#' + api.encode(QUESTION));
  await state.page.locator('#paste-open').waitFor({ state: 'visible' });
  assert.equal(await state.page.locator('#paste-caption').textContent(), 'Step 3: Paste it into ChatGPT');
  assert.equal(state.handoffs.length, 0);
  assert.equal(await state.page.locator('#skip').isVisible(), false);
  await state.page.locator('#paste-open').click();
  const copyDeadline = Date.now() + 2000;
  while (!state.clipboard.length && Date.now() < copyDeadline) await delay(25);
  assert.equal(state.clipboard.at(-1)?.text, QUESTION);
  const limit = Date.now() + 2000;
  while (!state.handoffs.length && Date.now() < limit) await delay(50);
  if (state.handoffs.length) assert.equal(state.handoffs[0].url, 'https://chatgpt.com/');
  else {
    assert.equal(await state.page.locator('#open').getAttribute('href'), 'https://chatgpt.com/');
    await state.page.locator('#open').click();
    await waitHandoff(state);
    assert.equal(state.handoffs[0].url, 'https://chatgpt.com/');
    unverified(engine, 'paste branch native clipboard', 'Native clipboard was blocked; the manual-copy and open link fallback passed.');
  }
  await clean(state, true);
}

async function clipboardBlocked(state) {
  await state.context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Blocked for test')) } });
  });
  await goto(state);
  await state.page.locator('#question').fill(QUESTION);
  await state.page.locator('#make').click();
  await state.page.locator('#copy-status').waitFor({ state: 'visible' });
  await state.page.waitForFunction(() => document.getElementById('copy-status').textContent.length > 0);
  assert.match(await state.page.locator('#copy-status').textContent(), /copy/i);
  assert.equal(await state.page.locator('#link').evaluate(element => element.selectionStart === 0 && element.selectionEnd === element.value.length), true);
  await clean(state, true);
}

async function historyChecks(state, engine) {
  await state.page.goto(base + '/history-start');
  await state.page.locator('#continue').click();
  await state.page.locator('#open').waitFor({ state: 'visible' });
  state.reply = 200;
  await state.page.locator('#open').click();
  if (await tappedHandoff(state, engine, 'replacement history after tapped handoff')) {
    await state.page.waitForURL('https://chatgpt.com/**', { waitUntil: 'commit' });
    await state.page.goBack({ waitUntil: 'commit' });
    await state.page.waitForURL(base + '/history-start', { waitUntil: 'commit' });
    assert.equal(state.page.url(), base + '/history-start', 'replace left the recipient in normal history');
  }
  state.reply = 204;
  await goto(state, '#' + api.encode(QUESTION));
  await state.page.waitForFunction(() => document.getElementById('typed').textContent.length > 0);
  await state.page.goto(base + '/history-away');
  await state.page.goBack({ waitUntil: 'commit' });
  await state.page.locator('#finished-send').waitFor({ state: 'visible' });
  assert.equal(await state.page.locator('#typed').textContent(), QUESTION);
  assert.equal(state.handoffs.length, 0, 'Back replayed automatic handoff');
  const shows = state.pageShows;
  if (!shows.some(show => show.persisted)) unverified(engine, 'native persisted pageshow', 'This browser restored with a back_forward navigation rather than the back-forward cache. The real Back finished-state check passed.');
  await goto(state, '#' + api.encode(QUESTION));
  await state.page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  assert.equal(await state.page.locator('#finished-send').isVisible(), true);
  assert.equal(await state.page.locator('#typed').textContent(), QUESTION);
  assert.equal(state.handoffs.length, 0);
  await clean(state, true);
}

async function backgroundCheck(state, engine) {
  await goto(state, '#' + api.encode(QUESTION));
  const other = await state.context.newPage();
  try {
    await other.goto(base + '/history-background');
    await other.bringToFront();
    const hidden = await state.page.evaluate(() => document.hidden);
    if (!hidden) { unverified(engine, 'real background visibility pause', 'Headless tabs remain document.hidden=false after another tab comes to front. No synthetic visibility is claimed as a device test.'); return; }
    const before = await state.page.locator('#typed').textContent();
    await delay(1800);
    assert.equal(await state.page.locator('#typed').textContent(), before);
    assert.equal(state.handoffs.length, 0);
    await state.page.bringToFront();
    await state.page.waitForFunction(() => document.getElementById('typed').textContent.length > 0);
    await state.page.keyboard.press('Escape');
    pass(engine, 'real background visibility paused and resumed the sequence');
  } finally { await other.close(); }
  await clean(state, true);
}

async function suite(engine) {
  const launch = engine === 'chromium' ? { executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'], ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {};
  try { browser = await playwright[engine].launch({ headless: true, ...launch }); }
  catch (error) { unverified(engine, 'browser suite', error.message); return; }
  report.environments.push({ engine, version: browser.version(), executablePath: launch.executablePath || playwright[engine].executablePath() });
  try {
    await caseRun(engine, 'maker IME clipboard preview edit', state => makerChecks(state, engine));
    await caseRun(engine, 'blocked clipboard fallback', clipboardBlocked);
    for (const [label, width, height, theme] of [['small-light', 320, 568, 'light'], ['small-dark', 320, 568, 'dark'], ['landscape-light', 844, 390, 'light'], ['landscape-dark', 844, 390, 'dark'], ['desktop', 1440, 900, 'light'], ['wide', 2560, 1440, 'light']]) {
      await caseRun(engine, label, async state => {
        await goto(state); await layout(state); await screenshot(state, `${engine}-${label}-maker`);
        await recipient(state, engine, label);
      }, { viewport: { width, height }, colorScheme: theme,
        ...(engine === 'chromium' && label === 'desktop' ? { recordVideo: { dir: output, size: { width: 1440, height: 900 } } } : {}) });
    }
    await caseRun(engine, 'touch', state => recipient(state, engine, 'touch', { jump: true, touch: true }), { viewport: { width: 375, height: 812 }, hasTouch: true, ...(engine !== 'firefox' ? { isMobile: true } : {}), ...(engine === 'chromium' ? { recordVideo: { dir: output, size: { width: 375, height: 812 } } } : {}) });
    await caseRun(engine, 'reduced motion', state => recipient(state, engine, 'reduced', { jump: true }), { reducedMotion: 'reduce' });
    await caseRun(engine, 'mid-sequence resize', state => recipient(state, engine, 'resize', { resize: true }));
    await caseRun(engine, 'fallback after blocked navigation', state => fallbackChecks(state, engine));
    await caseRun(engine, 'Unicode near cap paste and maker byte limit', state => cappedQuestion(state, engine), { viewport: { width: 320, height: 568 } });
    await caseRun(engine, 'Escape manual send and keyboard skip', state => escAndSkip(state, engine));
    await caseRun(engine, 'broken truncated and XSS payloads', brokenAndXSS);
    await caseRun(engine, 'same-document valid broken and replacement hash entry', hashEntry);
    for (const [label, width, height, theme] of [['phone-light', 320, 568, 'light'], ['phone-dark', 320, 568, 'dark'], ['landscape-light', 740, 360, 'light'], ['landscape-dark', 740, 360, 'dark'], ['short-landscape', 740, 320, 'light'], ['desktop-dark', 1280, 800, 'dark']]) {
      await caseRun(engine, `${label} long-question layout`, state => longLayout(state, engine, label), { viewport: { width, height }, colorScheme: theme,
        ...(width < 1000 ? { hasTouch: true, ...(engine !== 'firefox' ? { isMobile: true } : {}) } : {}) });
    }
    await caseRun(engine, 'paste-step switch and copy tap', state => pasteChecks(state, engine));
    await caseRun(engine, 'replace history Back and persisted event', state => historyChecks(state, engine));
    await caseRun(engine, 'background visibility', state => backgroundCheck(state, engine));
    await caseRun(engine, '200-percent zoom layout proxy', async state => { await goto(state); await layout(state); await screenshot(state, `${engine}-zoom-layout-proxy`); await clean(state, true); }, { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    unverified(engine, 'native 200-percent browser zoom', 'The 720 CSS-pixel viewport at 2x density checks the layout equivalent of a 1440px display at 200 percent. Native browser UI zoom is not available in the headless harness.');
  } finally { await browser.close(); browser = null; }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    html = fs.readFileSync(pageFile, 'utf8');
    report.pageSHA256 = crypto.createHash('sha256').update(html).digest('hex');
    if (process.env.LMLTFY_EXPECT_SHA256) assert.equal(report.pageSHA256, process.env.LMLTFY_EXPECT_SHA256, 'The source changed before this frozen run');
    fs.writeFileSync(path.join(output, 'tested-page.html'), html);
    const harness = fs.readFileSync(__filename);
    report.harnessSHA256 = crypto.createHash('sha256').update(harness).digest('hex');
    fs.writeFileSync(path.join(output, 'tested-harness.cjs'), harness);
    assert.doesNotMatch(html, /CORE_PENDING|sha256-pending/, 'Wait for the actual core and CSP hashes before testing');
    const source = /<script\b[^>]*\bid="core"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
    const context = vm.createContext({ TextEncoder, TextDecoder, atob, btoa });
    vm.runInContext(source, context, { timeout: 1000 });
    api = context.LMLTFY;
    assert.equal(QUESTION.length, 30);
    const { policyFor, readPolicy } = await import(pathToFileURL(path.join(root, 'tools/let-me-llm-csp.mjs')).href);
    assert.equal(readPolicy(html).policy, policyFor(html));
    pasteHTML = html.replace('const USE_PASTE_STEP = false;', 'const USE_PASTE_STEP = true;');
    assert.notEqual(pasteHTML, html);
    pasteHTML = pasteHTML.replace(readPolicy(pasteHTML).tag, tag => tag.replace(/content="[^"]*"/, () => `content="${policyFor(pasteHTML)}"`));
    assert.equal(readPolicy(pasteHTML).policy, policyFor(pasteHTML));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    for (const engine of ['chromium', 'webkit', 'firefox'].filter(engine => !process.env.LMLTFY_BROWSER || engine === process.env.LMLTFY_BROWSER)) await suite(engine);
    report.passed = report.failures.length === 0;
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    report.passed = false;
    report.failures.push({ engine: 'harness', name: 'setup', error: error.stack || String(error) });
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.checks.length} checks passed, ${report.failures.length} failures, ${report.unverified.length} unverified environment checks`);
})();
