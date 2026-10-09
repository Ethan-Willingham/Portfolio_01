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
const publicLineup = JSON.parse(fs.readFileSync(path.join(root, 'assets/spongebob/lineup.json')));
const publicIds = publicLineup.characterIds;
const ids = catalog.characters.map(character => character.id);
const voteIds = [...new Set([...ids, ...(publicLineup.retainedCharacters || []).map(character => character.id)])];
assert.equal(catalog.scope, 'original-series', 'catalog is scoped to the original TV series');
assert.ok(catalog.characters.every(character => character.seriesEpisode && character.seriesSource?.startsWith('https://spongebob.fandom.com/wiki/')), 'every character has TV-episode evidence');
assert.equal(ids.includes('bare-knuckles-the-sea-bear'), false, 'spinoff-only characters are excluded');
assert.equal(publicIds.length, 19, 'all 19 owner-selected characters are preserved');
assert.ok(publicIds.every(id => voteIds.includes(id)), 'the public cast is available even outside the new picker scope');
const source = fs.readFileSync(path.join(root, 'services/spongebob-votes/worker/index.js'), 'utf8')
  .replace('/* SITES_ROSTER_IDS */ []', JSON.stringify(voteIds));
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
async function noMatchupOverlap(page) {
  assert.equal(await page.evaluate(() => {
    const cards = ['sb-fighter-left', 'sb-fighter-right'].map(id => document.getElementById(id).getBoundingClientRect());
    const controls = ['sb-vote-state', 'sb-round-actions'].map(id => document.getElementById(id)).filter(element => !element.hidden).map(element => element.getBoundingClientRect());
    return cards.every(card => controls.every(control => card.right <= control.left || card.left >= control.right || card.bottom <= control.top + 1));
  }), true, 'character cards do not overlap feedback or controls');
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
    assert.equal(await page.locator('#sb-selected-count').textContent(), String(publicIds.length));
    assert.equal(await page.getByRole('button', { name: 'Remove Bare-Knuckles the Sea Bear from lineup', exact: true }).isVisible(), true, 'the saved cast keeps its selected spinoff character');
    await page.locator('#sb-search').fill('My leg');
    assert.equal(await page.locator('.sb-character[data-id="fred"]').isVisible(), true, 'Fred can be found by his catchphrase');
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
    const selectedBox = page.locator('.sb-character[data-id="' + publicIds[0] + '"] input');
    await selectedBox.focus();
    assert.equal(await selectedBox.evaluate(input => getComputedStyle(input.closest('article')).outlineWidth), '2px', 'keyboard focus is visible');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#sb-selected-count').textContent(), String(publicIds.length - 1), 'keyboard toggles selection');
    await page.reload(); await page.locator('#sb-filters').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#sb-selected-count').textContent(), String(publicIds.length - 1), 'selection survives reload');
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
    assert.equal(await page.locator('.post-header, .post-body, .site-wrapper, .site-footer').count(), 0, 'comparer has its own app shell');
    assert.equal(await page.locator('link[href="style.css"], script[src="js/main.js"]').count(), 0, 'comparer does not load blog presentation');
    const attribution = page.getByRole('link', { name: '© 2026 Ethan Willingham', exact: true });
    assert.equal(await attribution.getAttribute('href'), '/', 'only footer attribution links home');
    assert.equal(await page.locator('#sb-roster-label').textContent(), '2 characters / Shared lineup');
    await voteFor(page, 'Patrick Star');
    await noMatchupOverlap(page);
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
    await page.goto(base + '/spongebob-fight.html#roster=spongebob-squarepants,patrick-star,sandy-cheeks,squidward-tentacles');
    const seen = new Set();
    for (let index = 0; index < 2; index++) {
      await fightReady(page);
      assert.match(await page.locator('#sb-progress').textContent(), /of 2$/i, 'four characters make two matchups');
      for (const name of await page.locator('.sb-fighter-name').allTextContents()) {
        assert.equal(seen.has(name), false, 'each character appears only once per round'); seen.add(name);
      }
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
    const retainedCast = await context();
    await retainedCast.page.goto(base + '/spongebob-fight.html#roster=bare-knuckles-the-sea-bear,fred');
    await fightReady(retainedCast.page);
    assert.ok((await retainedCast.page.locator('.sb-fighter-name').allTextContents()).includes('Bare-Knuckles the Sea Bear'), 'retained cast members still work in matchups');
    await retainedCast.context.close();
    const manual = await context({ width: 375, height: 812 });
    await manual.page.goto(base + '/spongebob-picker.html');
    await manual.page.locator('#sb-filters').waitFor({ state: 'visible' });
    await manual.page.locator('#sb-clear').click();
    await manual.page.locator('#sb-group').selectOption('Main cast');
    for (const id of ['spongebob-squarepants', 'patrick-star', 'sandy-cheeks', 'squidward-tentacles']) {
      await manual.page.locator('.sb-character[data-id="' + id + '"] input').check();
    }
    const chosenPairs = [['spongebob-squarepants', 'patrick-star'], ['sandy-cheeks', 'squidward-tentacles']];
    for (const pair of chosenPairs) {
      await manual.page.locator('#sb-pair-left').selectOption(pair[0]);
      await manual.page.locator('#sb-pair-right').selectOption(pair[1]);
      await manual.page.locator('#sb-pair-add').click();
    }
    assert.equal(await manual.page.locator('#sb-paired-list > li').count(), 2, 'manual pairs can be chosen from the selected cast');
    assert.equal(await manual.page.locator('#sb-pair-add').isDisabled(), true, 'used characters cannot be paired again');
    await manual.page.reload(); await manual.page.locator('#sb-filters').waitFor({ state: 'visible' });
    assert.deepEqual(await manual.page.evaluate(() => SpongeBobMatchups.getPairs()), chosenPairs, 'chosen pairs survive reload in order');
    const manualDownloadEvent = manual.page.waitForEvent('download'); await manual.page.locator('#sb-download-matchups').click();
    const manualDownload = await manualDownloadEvent;
    assert.deepEqual(JSON.parse(fs.readFileSync(await manualDownload.path(), 'utf8')).matchups, chosenPairs, 'download preserves exact matchups');
    await manual.page.locator('#sb-copy-matchups').click();
    const manualShare = await manual.page.evaluate(() => navigator.clipboard.readText());
    assert.deepEqual(JSON.parse(new URLSearchParams(new URL(manualShare).hash.slice(1)).get('matchups')), chosenPairs, 'share link includes ordered matchups');
    await noOverflow(manual.page);
    await manual.page.locator('#sb-pairing').scrollIntoViewIfNeeded();
    await manual.page.screenshot({ path: '/tmp/spongebob-pairing-mobile.png', fullPage: false });
    await manual.page.goto(manualShare);
    for (const names of [['SpongeBob SquarePants', 'Patrick Star'], ['Sandy Cheeks', 'Squidward Tentacles']]) {
      await fightReady(manual.page);
      assert.deepEqual(await manual.page.locator('.sb-fighter-name').allTextContents(), names, 'fight uses chosen pair order and sides');
      await manual.page.locator('#sb-skip').click();
    }
    assert.equal(await manual.page.locator('#sb-complete').isVisible(), true, 'manual round ends after its configured pairs');
    const invalidShare = new URL(manualShare);
    invalidShare.hash = new URLSearchParams({ roster: 'spongebob-squarepants,patrick-star,sandy-cheeks', matchups: JSON.stringify([['spongebob-squarepants','patrick-star'],['spongebob-squarepants','sandy-cheeks']]) }).toString();
    await manual.page.goto(invalidShare.href); await manual.page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await manual.page.locator('#sb-load-state').textContent(), /Each character can appear only once/);
    await manual.context.close();
    await mobile.page.goto(share); await fightReady(mobile.page); await noOverflow(mobile.page);
    const pictures = await mobile.page.locator('.sb-fighter-image img').evaluateAll(images => Promise.all(images.map(image => image.decode().then(() => image.naturalWidth > 0))));
    assert.ok(pictures.every(Boolean), 'both character portraits load');
    assert.ok(await mobile.page.locator('#sb-name-right').evaluate(name => name.getBoundingClientRect().bottom <= innerHeight), 'both character names are visible on the first mobile screen');
    assert.ok(await mobile.page.locator('#sb-fighter-right').evaluate(card => card.getBoundingClientRect().width >= 44 && card.getBoundingClientRect().height >= 44), 'vote targets are touch-sized');
    await mobile.page.screenshot({ path: '/tmp/spongebob-fight-mobile.png', fullPage: true });
    await noMatchupOverlap(mobile.page);
    await first.page.goto(share); await fightReady(first.page);
    await noMatchupOverlap(first.page);
    await first.page.screenshot({ path: '/tmp/spongebob-fight-desktop.png', fullPage: true });
    for (const viewport of [{ width: 320, height: 568 }, { width: 812, height: 375 }]) {
      const compact = await context(viewport);
      await compact.page.goto(base + '/spongebob-fight.html#roster=tattletale-strangler,tom-prison-guard-1');
      await fightReady(compact.page); await noOverflow(compact.page); await noMatchupOverlap(compact.page);
      await voteFor(compact.page, 'Tom (Prison guard 1)');
      await noOverflow(compact.page); await noMatchupOverlap(compact.page);
      await compact.page.screenshot({ path: '/tmp/spongebob-fight-' + viewport.width + '.png', fullPage: true });
      await compact.context.close();
    }
    assert.deepEqual(errors, [], 'no browser script errors');
    console.log('PASS: ' + ids.length + ' original-TV cards, catchphrase search, persistence, keyboard, export/share, real shared percentages, reversed duplicates, lost-response retry, one appearance per character, standalone comparer, desktop/mobile/landscape layouts.');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve)); sqlite.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
