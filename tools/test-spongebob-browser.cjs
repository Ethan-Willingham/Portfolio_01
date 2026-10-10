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
const requestedPairs = [
  ['officer-nancy', 'billy-fishkin'], ['customer', 'baby-prunes'], ['incidental-49a', 'incidental-22'],
  ['mermaid-man-man-ray-timeline', 'incidental-30'], ['man-ray', 'alaskan-bull-worm'], ['nurse', 'janet'],
  ['bare-knuckles-the-sea-bear', 'spongegar'], ['tattletale-strangler', 'incidental-222'],
  ['herb-star', 'incidental-211'], ['bubble-buddy', 'iron-eye']
];
const publicPairs = publicLineup.matchups;
const forwardedRosterIds = ['incidental-211','incidental-152','bubble-buddy','incidental-22','incidental-24','incidental-222','incidental-42','incidental-104','incidental-49a','incidental-30','alaskan-bull-worm','man-ray','tattletale-strangler','herb-star','baby-prunes','billy-fishkin','bubbleman','conductor-1','customer','drifter','iron-eye','janet','larry-luciano','lemont','lou','mermaid-man-man-ray-timeline','nurse','officer-nancy','patar','spongegar','tom-prison-guard-1','bare-knuckles-the-sea-bear'];
const ids = catalog.characters.map(character => character.id);
const byId = new Map(catalog.characters.map(character => [character.id, character]));
const castById = new Map([...catalog.characters, ...(publicLineup.retainedCharacters || [])].map(character => [character.id, character]));
const firstCatalogIds = JSON.parse(fs.readFileSync(path.join(root, 'assets/spongebob/first-catalog-ids.json')));
const firstCatalogSet = new Set(firstCatalogIds);
const pickerIds = catalog.pickerCharacterIds;
const pickerSet = new Set(pickerIds);
const portraitOverrides = JSON.parse(fs.readFileSync(path.join(root, 'assets/spongebob/portrait-overrides.json'))).characters;
const refreshedPortraitIds = Object.keys(portraitOverrides);
const voteIds = [...new Set([...ids, ...(publicLineup.retainedCharacters || []).map(character => character.id)])];
assert.equal(firstCatalogIds.length, 1021, 'the original picker catalog is recorded');
assert.equal(firstCatalogSet.size, 1021, 'the original picker IDs are unique');
assert.equal(pickerIds.length, 654, 'the full catalog retains the 654 newly added characters');
assert.equal(pickerSet.size, 654, 'the new picker IDs are unique');
assert.ok(pickerIds.every(id => byId.has(id) && !firstCatalogSet.has(id)), 'the picker includes only new characters from the internal catalog');
assert.equal(catalog.scope, 'original-series', 'catalog is scoped to the original TV series');
assert.ok(catalog.characters.every(character => character.seriesEpisode && character.seriesSource?.startsWith('https://spongebob.fandom.com/wiki/')), 'every character has TV-episode evidence');
assert.equal(ids.includes('bare-knuckles-the-sea-bear'), false, 'spinoff-only characters are excluded');
assert.equal(publicIds.length, 20, 'the public cast contains only the 20 requested participants');
assert.equal(new Set(publicIds).size, 20, 'the public cast has no repeated IDs');
assert.deepEqual(publicPairs, requestedPairs, 'the public matchups preserve the exact requested order and sides');
assert.equal(new Set(publicPairs.flat()).size, 20, 'the ten requested matchups use each character once');
assert.deepEqual(publicIds.slice().sort(), publicPairs.flat().sort(), 'there are no extra characters in the public round');
assert.equal(refreshedPortraitIds.length, 95, 'the portrait refresh includes all 95 sourced replacements');
for (const id of refreshedPortraitIds) {
  const override = portraitOverrides[id], character = castById.get(id);
  assert.ok(character, 'each portrait replacement has a valid character ID');
  assert.equal(character.image, override.image, 'the catalog uses the refreshed portrait asset');
  assert.equal(character.sourceImage, override.sourceImage, 'the replacement keeps its image-source attribution');
  const portrait = fs.readFileSync(path.join(root, override.image));
  assert.equal(portrait.subarray(0, 4).toString(), 'RIFF', 'refreshed portraits are real WebP files');
  assert.equal(portrait.subarray(8, 12).toString(), 'WEBP', 'refreshed portraits are real WebP files');
}
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
  try { const body = fs.readFileSync(file); response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(body); }
  catch (_) { response.writeHead(404).end(); }
});
async function context(viewport = { width: 1280, height: 900 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  await context.addInitScript(endpoint => { window.SPONGEBOB_VOTES_ENDPOINT = endpoint; }, base);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function fightReady(page) {
  await page.waitForFunction(() => !document.getElementById('sb-matchup').hidden && (!document.getElementById('sb-fighter-left').disabled || !document.getElementById('sb-next').hidden));
}
async function voteFor(page, name) {
  await page.getByRole('button', { name: 'Choose ' + name + ' to win', exact: true }).click();
  await page.locator('#sb-next').waitFor({ state: 'visible' });
}
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
async function readablePhoneLayout(page) {
  await noOverflow(page); await noMatchupOverlap(page);
  const geometry = await page.evaluate(() => {
    const textFits = [...document.querySelectorAll('.sb-fighter-name, .sb-fighter-result, .sb-fighter-count')].filter(e => !e.hidden).every(e => {
      const box = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e);
      const text = range.getBoundingClientRect();
      return text.left >= box.left - 1 && text.right <= box.right + 1 && text.top >= box.top - 3 && text.bottom <= box.bottom + 3;
    });
    const touchTargets = [...document.querySelectorAll('button:not([hidden]), .sb-app-footer a')].filter(e => e.getBoundingClientRect().height).every(e => {
      const box = e.getBoundingClientRect(); return box.width >= 44 && box.height >= 44;
    });
    const portraits = [...document.querySelectorAll('.sb-fighter-image')].every(e => e.getBoundingClientRect().height >= 72);
    const next = document.getElementById('sb-next'), actions = document.getElementById('sb-round-actions');
    const nextIsProminent = next.hidden || next.getBoundingClientRect().height >= 56 && next.getBoundingClientRect().width >= actions.getBoundingClientRect().width - 1;
    return { textFits, touchTargets, portraits, nextIsProminent };
  });
  assert.deepEqual(geometry, { textFits: true, touchTargets: true, portraits: true, nextIsProminent: true }, 'phone names, portraits and controls stay readable and touch-sized');
}
async function capture(page, file) {
  await page.locator('.sb-fighter-image img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: file, fullPage: true });
}
async function consumeRound(page, pairs, { touch = false, viewport } = {}) {
  const seen = new Set();
  for (let index = 0; index < pairs.length; index++) {
    await fightReady(page);
    const names = pairs[index].map(id => castById.get(id).name);
    assert.deepEqual(await page.locator('.sb-fighter-name').allTextContents(), names, 'the round preserves the exact chosen order and sides');
    for (const id of pairs[index]) { assert.equal(seen.has(id), false, 'a character never repeats'); seen.add(id); }
    if (touch) await readablePhoneLayout(page);
    assert.equal(await page.locator('#sb-next').isVisible(), false, 'each matchup starts unanswered, including replayed rounds');
    if (!await page.locator('#sb-next').isVisible()) {
      assert.equal(await page.locator('#sb-round-actions').isVisible(), false, 'advance controls stay hidden until a vote is saved');
      if (viewport && index === 0) await capture(page, '/tmp/spongebob-phone-' + viewport.width + 'x' + viewport.height + '-choices.png');
      if (touch) await page.locator('#sb-fighter-left').tap(); else await page.locator('#sb-fighter-left').click();
      await page.locator('#sb-next').waitFor({ state: 'visible' });
    }
    assert.equal(await page.locator('#sb-next').isEnabled(), true, 'a confirmed vote enables Next matchup');
    if (touch) await readablePhoneLayout(page); else { await noOverflow(page); await noMatchupOverlap(page); }
    if (viewport && index === 3) await capture(page, '/tmp/spongebob-phone-' + viewport.width + 'x' + viewport.height + '-results.png');
    if (touch) await page.locator('#sb-next').tap(); else await page.locator('#sb-next').click();
  }
  assert.equal(await page.locator('#sb-complete').isVisible(), true, 'the round ends after exactly its configured pairs');
  assert.equal(await page.locator('#sb-matchup').isVisible(), false, 'no extra pair appears');
  assert.equal(seen.size, pairs.length * 2);
}
(async () => {
  try {
    worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.SPONGEBOB_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    const first = await context(), page = first.page;
    const share = base + '/spongebob-fight.html#roster=spongebob-squarepants,patrick-star';
    await page.goto(share); await fightReady(page);
    assert.equal(await page.title(), 'Bikini Bottom Showdown');
    assert.equal(await page.locator('h1').textContent(), 'Bikini Bottom Showdown');
    assert.equal(await page.locator('.post-header, .post-body, .site-wrapper, .site-footer').count(), 0, 'comparer retains its own app shell');
    assert.equal(await page.locator('link[href="style.css"], script[src="js/main.js"]').count(), 0, 'comparer does not load blog presentation');
    assert.equal(await page.locator('#sb-skip, .sb-app-menu, #sb-round-header').count(), 0, 'Skip, lineup menu and matchup captions are removed');
    assert.equal(await page.locator('a').count(), 1, 'the only link is the copyright footer');
    assert.equal(await page.getByRole('link', { name: '© 2026 Ethan Willingham', exact: true }).getAttribute('href'), '/');
    assert.equal(await page.locator('#sb-vote-state').isVisible(), false, 'ready choices do not need a repeated instruction');
    assert.equal(await page.locator('#sb-next').isVisible(), false, 'unanswered pairs cannot advance');
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
    const previousId = await page.evaluate(() => SpongeBobVotes.getVoterId());
    await page.evaluate(id => {
      localStorage.setItem('spongebob-voter-v1', id);
      sessionStorage.setItem('spongebob-voter-v1', id);
    }, previousId);
    await page.reload(); await fightReady(page);
    assert.notEqual(await page.evaluate(() => SpongeBobVotes.getVoterId()), previousId, 'a reload ignores both legacy saved identities');
    assert.equal(await page.locator('#sb-vote-state').isVisible(), false, 'a reload does not reveal a previous vote');
    assert.equal(await page.locator('#sb-result-left').isVisible(), false);
    assert.equal(await page.locator('#sb-next').isVisible(), false);
    await voteFor(page, 'SpongeBob SquarePants');
    assert.match(await page.locator('#sb-vote-status').textContent(), /^You chose SpongeBob SquarePants/);
    assert.match(await page.locator('#sb-vote-total').textContent(), /^3 votes/, 'new rounds add responses while preserving community totals');
    const outage = await context({ width: 320, height: 568 }, { isMobile: true, hasTouch: true }); failure = 'get';
    await outage.page.goto(share); await outage.page.locator('#sb-vote-retry').waitFor({ state: 'visible' });
    assert.equal(await outage.page.locator('#sb-fighter-left').isDisabled(), true);
    assert.equal(await outage.page.locator('#sb-result-left').isVisible(), false, 'outage never displays fake percentages');
    assert.equal(await outage.page.locator('#sb-next').isVisible(), false, 'a failed read does not reveal an advance button');
    await readablePhoneLayout(outage.page);
    failure = null; await outage.page.locator('#sb-vote-retry').tap(); await fightReady(outage.page);
    failure = 'after-commit';
    await outage.page.getByRole('button', { name: 'Choose Patrick Star to win', exact: true }).tap();
    await outage.page.locator('#sb-vote-retry').waitFor({ state: 'visible' });
    assert.equal(await outage.page.locator('#sb-next').isVisible(), false, 'an unconfirmed vote cannot advance');
    await readablePhoneLayout(outage.page);
    failure = null; await outage.page.locator('#sb-vote-retry').tap(); await outage.page.locator('#sb-next').waitFor({ state: 'visible' });
    assert.match(await outage.page.locator('#sb-vote-total').textContent(), /^4 votes/, 'retry confirms exactly one saved vote');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM matchup_votes').get().n, 4);
    await readablePhoneLayout(outage.page); await outage.context.close();
    await page.goto(base + '/spongebob-fight.html'); await fightReady(page);
    const decoded = await page.evaluate(async ids => {
      const data = await SpongeBob.load();
      return Promise.all(ids.map(async id => { const character = data.byId.get(id), image = new Image(); image.src = character.image; await image.decode(); return { id, image: character.image, width: image.naturalWidth, height: image.naturalHeight }; }));
    }, refreshedPortraitIds);
    for (const portrait of decoded) { assert.equal(portrait.image, portraitOverrides[portrait.id].image); assert.ok(portrait.width > 0 && portrait.height > 0); }
    await capture(page, '/tmp/spongebob-showdown-desktop.png');
    await consumeRound(page, requestedPairs);
    await capture(page, '/tmp/spongebob-showdown-complete.png');
    const completedRoundId = await page.evaluate(() => SpongeBobVotes.getVoterId());
    await page.locator('#sb-restart').click(); await fightReady(page);
    assert.notEqual(await page.evaluate(() => SpongeBobVotes.getVoterId()), completedRoundId, 'Play another round starts a fresh identity');
    await consumeRound(page, requestedPairs);
    const forwarded = await context();
    await forwarded.page.goto(base + '/spongebob-fight.html#' + new URLSearchParams({ roster: forwardedRosterIds.join(','), matchups: JSON.stringify(requestedPairs) }));
    await consumeRound(forwarded.page, requestedPairs); await forwarded.context.close();
    const random = await context();
    await random.page.goto(base + '/spongebob-fight.html#roster=spongebob-squarepants,patrick-star,sandy-cheeks,squidward-tentacles');
    const namesSeen = new Set();
    for (let index = 0; index < 2; index++) {
      await fightReady(random.page);
      for (const name of await random.page.locator('.sb-fighter-name').allTextContents()) { assert.equal(namesSeen.has(name), false); namesSeen.add(name); }
      await random.page.locator('#sb-fighter-left').click(); await random.page.locator('#sb-next').waitFor({ state: 'visible' }); await random.page.locator('#sb-next').click();
    }
    assert.equal(namesSeen.size, 4); assert.equal(await random.page.locator('#sb-complete').isVisible(), true); await random.context.close();
    await page.goto(base + '/spongebob-fight.html#roster=made-up'); await page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await page.locator('#sb-load-state').textContent(), /at least two valid characters/);
    await page.goto(base + '/spongebob-fight.html#' + new URLSearchParams({ roster: 'spongebob-squarepants,patrick-star,sandy-cheeks', matchups: JSON.stringify([['spongebob-squarepants', 'patrick-star'], ['spongebob-squarepants', 'sandy-cheeks']]) }));
    await page.locator('#sb-load-retry').waitFor({ state: 'visible' }); assert.match(await page.locator('#sb-load-state').textContent(), /Each character can appear only once/);
    const missingAPI = await context();
    await missingAPI.context.route('**/js/spongebob-votes.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await missingAPI.page.goto(share); await missingAPI.page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await missingAPI.page.locator('#sb-load-state').textContent(), /vote service did not load/);
    assert.equal(await missingAPI.page.locator('#sb-matchup').isVisible(), false); await missingAPI.context.close();
    const noStorage = await context();
    await noStorage.context.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
    });
    await noStorage.page.goto(share); await fightReady(noStorage.page); await voteFor(noStorage.page, 'Patrick Star');
    await noStorage.page.reload(); await fightReady(noStorage.page);
    assert.equal(await noStorage.page.locator('#sb-result-left').isVisible(), false, 'storage is unnecessary for fresh rounds');
    await voteFor(noStorage.page, 'SpongeBob SquarePants'); await noStorage.context.close();
    for (const viewport of [{ width: 320, height: 480 }, { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
      const phone = await context(viewport, { isMobile: true, hasTouch: true });
      await phone.page.goto(base + '/spongebob-fight.html'); await consumeRound(phone.page, requestedPairs, { touch: true, viewport });
      await noOverflow(phone.page); await phone.context.close();
    }
    assert.equal((await page.request.get(base + '/spongebob-picker.html')).status(), 404, 'the retired picker is deleted');
    assert.ok(!fs.readFileSync(path.join(root, 'archive.html'), 'utf8').includes('spongebob-picker.html'));
    assert.ok(!JSON.parse(fs.readFileSync(path.join(root, 'search-index.json'))).posts.some(post => post.url === 'spongebob-picker.html'));
    assert.deepEqual(errors, [], 'no browser script errors');
    console.log('PASS: ten exact pairs with no repeats; touch voting/results/large Next across eight phone viewports and both orientations; no Skip/menu/captions/picker; 95 clean portraits; real isolated vote totals, fresh reloads and replays, ignored legacy storage, duplicate prevention within a round and safe retry.');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve)); sqlite.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
