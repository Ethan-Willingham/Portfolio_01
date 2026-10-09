// Browser integration tests use the real Worker against an isolated SQLite database.
// The test owns and closes the separate Chrome for Testing process in finally.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/spongebob/characters.json')));
const ids = catalog.characters.map(character => character.id);
const source = fs.readFileSync(path.join(root, 'services/spongebob-votes/worker/index.js'), 'utf8')
  .replace('/* SITES_ROSTER_IDS */ []', JSON.stringify(ids));
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(root, 'services/spongebob-votes/drizzle/0000_matchup_votes.sql'), 'utf8'));
const DB = {
  prepare(sql) { return { bind(...values) {
    const bindings = Object.fromEntries(values.map((value, index) => ['?' + (index + 1), value]));
    const statement = sqlite.prepare(sql);
    return { first: async () => statement.get(bindings), run: () => /^\s*SELECT/i.test(sql)
      ? { results: statement.all(bindings), meta: { changes: 0 } }
      : { results: [], meta: statement.run(bindings) } };
  } }; },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  withSession: () => DB
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let browser, worker, base, failure = null;
const errors = [];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, base || 'http://127.0.0.1');
  if (url.pathname === '/v1/votes') {
    try {
      if (failure === 'get' && request.method === 'GET' || failure === 'post' && request.method === 'POST') { response.writeHead(503).end(); return; }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const result = await worker.fetch(new Request(url, {
        method: request.method, headers: request.headers,
        ...(body.length ? { body } : {})
      }), { DB });
      if (failure === 'after-commit' && request.method === 'POST') { response.writeHead(503).end(); return; }
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
    } catch (error) { response.writeHead(500).end(error.message); }
    return;
  }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(fs.readFileSync(file)); }
  catch (_) { response.writeHead(404).end(); }
});
async function context(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(endpoint => { window.SPONGEBOB_VOTES_ENDPOINT = endpoint; }, base);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function fightReady(page) { await page.waitForFunction(() => !document.getElementById('sb-matchup').hidden && (!document.getElementById('sb-fighter-left').disabled || !document.getElementById('sb-next').hidden)); }
async function voteFor(page, name) { await page.getByRole('button', { name: 'Choose ' + name + ' to win', exact: true }).click(); await page.locator('#sb-next').waitFor({ state: 'visible' }); }
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal overflow');
}
(async () => {
  try {
    worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.SPONGEBOB_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    const first = await context(); const page = first.page;
    await page.goto(base + '/spongebob-picker.html'); await page.locator('#sb-filters').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.sb-character').count(), ids.length);
    assert.equal(await page.locator('.sb-source-link').count(), ids.length, 'each image has a source');
    assert.equal(await page.locator('#sb-selected-count').textContent(), '10');
    const photo = catalog.characters.find(character => character.fallbackImage);
    assert.ok(photo, 'photographic portraits include a fallback');
    await page.locator('#sb-search').fill(photo.name);
    const photoCard = page.locator('.sb-character[data-id="' + photo.id + '"]');
    await photoCard.scrollIntoViewIfNeeded();
    await page.waitForFunction(id => {
      const img = document.querySelector('.sb-character[data-id="' + id + '"] img');
      return img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith('.webp');
    }, photo.id);
    assert.equal(await photoCard.locator('source').getAttribute('srcset'), photo.image);
    assert.equal(await photoCard.locator('img').getAttribute('src'), photo.fallbackImage);
    await photoCard.locator('source').evaluate(element => element.remove());
    await page.waitForFunction(id => {
      const img = document.querySelector('.sb-character[data-id="' + id + '"] img');
      return img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith('.png');
    }, photo.id);
    await page.locator('#sb-search').fill('');
    const bob = page.locator('.sb-character[data-id="spongebob-squarepants"] input');
    await bob.focus();
    assert.equal(await bob.evaluate(input => getComputedStyle(input.closest('article')).outlineWidth), '2px', 'keyboard focus is visible');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#sb-selected-count').textContent(), '9', 'keyboard toggles selection');
    await page.reload(); await page.locator('#sb-filters').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#sb-selected-count').textContent(), '9', 'selection survives reload');
    await page.locator('#sb-clear').click(); await page.locator('#sb-only-selected').check();
    assert.equal(await page.locator('#sb-no-results').isVisible(), true, 'empty selected view works');
    await page.locator('#sb-reset-filters').click();
    const aliasCharacter = catalog.characters.find(character => character.aliases?.includes('Debbie Rechid'));
    assert.ok(aliasCharacter, 'catalog preserves familiar alternate names');
    await page.locator('#sb-search').fill('Debbie Rechid');
    assert.equal(await page.locator('.sb-character[data-id="' + aliasCharacter.id + '"]').isVisible(), true, 'search finds a renamed character by its alias');
    await page.locator('#sb-search').fill('');
    await page.locator('#sb-group').selectOption('Main cast');
    await page.locator('#sb-search').fill('SpongeBob SquarePants'); await page.locator('#sb-select-visible').click();
    await page.locator('#sb-search').fill('Patrick Star'); await page.locator('#sb-select-visible').click();
    await page.locator('#sb-search').fill(''); await page.locator('#sb-only-selected').check();
    assert.equal(await page.locator('.sb-character:not([hidden])').count(), 2);
    await page.locator('.sb-review-link').click();
    const downloadEvent = page.waitForEvent('download'); await page.locator('#sb-download').click();
    const download = await downloadEvent;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(exported.characterIds, ['spongebob-squarepants', 'patrick-star']);
    await page.locator('#sb-copy-link').click();
    const share = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(share.includes('#roster='));
    await noOverflow(page);
    await page.goto(share); await fightReady(page);
    assert.equal(await page.locator('#sb-roster-label').textContent(), '2 characters / Shared lineup');
    await voteFor(page, 'Patrick Star');
    assert.match(await page.locator('#sb-vote-total').textContent(), /^1 vote/);
    assert.match(await page.locator('#sb-vote-status').textContent(), /100%/);
    const second = await context();
    await second.page.goto(share); await fightReady(second.page); await voteFor(second.page, 'SpongeBob SquarePants');
    assert.match(await second.page.locator('#sb-vote-total').textContent(), /^2 votes/);
    assert.equal(await second.page.locator('#sb-result-left').textContent(), '50%');
    assert.equal(await second.page.locator('#sb-result-right').textContent(), '50%');
    await page.locator('#sb-refresh').click(); await page.waitForFunction(() => document.getElementById('sb-vote-total').textContent.startsWith('2 votes'));
    const repeated = await page.evaluate(() => SpongeBobVotes.vote({ pair: ['patrick-star', 'spongebob-squarepants'], winner: 'spongebob-squarepants' }));
    assert.equal(repeated.total, 2); assert.equal(repeated.winner, 'patrick-star', 'first vote sticks for reversed pair');
    await page.reload(); await fightReady(page);
    assert.match(await page.locator('#sb-vote-status').textContent(), /saved choice: Patrick Star/);
    assert.match(await page.locator('#sb-vote-total').textContent(), /^2 votes/);
    const third = await context(); failure = 'get';
    await third.page.goto(share); await third.page.locator('#sb-vote-retry').waitFor({ state: 'visible' });
    assert.equal(await third.page.locator('#sb-fighter-left').isDisabled(), true);
    assert.equal(await third.page.locator('#sb-result-left').isVisible(), false, 'outage never displays fake percentages');
    failure = null; await third.page.locator('#sb-vote-retry').click(); await fightReady(third.page);
    failure = 'after-commit';
    await third.page.getByRole('button', { name: 'Choose Patrick Star to win', exact: true }).click();
    await third.page.locator('#sb-vote-retry').waitFor({ state: 'visible' });
    assert.equal(await third.page.locator('#sb-result-left').isVisible(), false, 'lost response is unconfirmed');
    failure = null; await third.page.locator('#sb-vote-retry').click(); await third.page.locator('#sb-next').waitFor({ state: 'visible' });
    assert.match(await third.page.locator('#sb-vote-total').textContent(), /^3 votes/, 'retry confirms exactly one saved vote');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM matchup_votes').get().n, 3);
    await page.goto(base + '/spongebob-fight.html#roster=spongebob-squarepants,patrick-star,sandy-cheeks');
    const seen = new Set();
    for (let index = 0; index < 3; index++) {
      await fightReady(page);
      const pair = (await page.locator('.sb-fighter-name').allTextContents()).sort().join('|');
      assert.equal(seen.has(pair), false, 'unordered pairs never repeat'); seen.add(pair);
      if (await page.locator('#sb-next').isVisible()) await page.locator('#sb-next').click(); else await page.locator('#sb-skip').click();
    }
    assert.equal(await page.locator('#sb-complete').isVisible(), true);
    await page.goto(base + '/spongebob-fight.html#roster=made-up'); await page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await page.locator('#sb-load-state').textContent(), /at least two valid characters/);
    const missingAPI = await context();
    await missingAPI.context.route('**/js/spongebob-votes.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await missingAPI.page.goto(share); await missingAPI.page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await missingAPI.page.locator('#sb-load-state').textContent(), /vote service did not load/);
    assert.equal(await missingAPI.page.locator('#sb-matchup').isVisible(), false, 'missing API has no fabricated result');
    const mobile = await context({ width: 375, height: 812 });
    await mobile.page.goto(base + '/spongebob-picker.html'); await mobile.page.locator('#sb-filters').waitFor({ state: 'visible' });
    assert.equal(await mobile.page.evaluate(() => getComputedStyle(document.body).paddingLeft), '20px', 'site mobile gutter');
    await noOverflow(mobile.page);
    await mobile.page.screenshot({ path: '/tmp/spongebob-picker-mobile.png', fullPage: false });
    await mobile.page.evaluate(() => window.scrollTo(0, document.getElementById('sb-character-grid').getBoundingClientRect().top + scrollY - 155));
    await mobile.page.screenshot({ path: '/tmp/spongebob-picker-mobile-cards.png', fullPage: false });
    await mobile.page.locator('.sb-review-link').click();
    assert.ok(await mobile.page.locator('#sb-download').isVisible(), 'review jump reaches export');
    await mobile.page.goto(share); await fightReady(mobile.page); await noOverflow(mobile.page);
    const pictures = await mobile.page.locator('.sb-fighter-image img').evaluateAll(images => Promise.all(images.map(image => image.decode().then(() => image.naturalWidth > 0))));
    assert.ok(pictures.every(Boolean), 'both character portraits load');
    assert.ok(await mobile.page.locator('#sb-name-right').evaluate(name => name.getBoundingClientRect().bottom <= innerHeight), 'both character names are visible on the first mobile screen');
    await mobile.page.screenshot({ path: '/tmp/spongebob-fight-mobile.png', fullPage: true });
    await first.page.goto(share); await fightReady(first.page);
    await first.page.screenshot({ path: '/tmp/spongebob-fight-desktop.png', fullPage: true });
    assert.deepEqual(errors, [], 'no browser script errors');
    console.log('PASS: ' + ids.length + ' sourced cards, persistence, keyboard, export/share, two-browser real percentages, reversed duplicates, lost-response retry, unique rounds, invalid roster, 375px layout.');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve)); sqlite.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
