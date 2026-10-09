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
const originalSelectedIds = [
  'bubble-buddy', 'alaskan-bull-worm', 'man-ray', 'tattletale-strangler', 'herb-star', 'baby-prunes',
  'bare-knuckles-the-sea-bear', 'billy-fishkin', 'bubbleman', 'drifter', 'iron-eye', 'janet',
  'larry-luciano', 'lemont', 'lou', 'officer-nancy', 'patar', 'spongegar', 'tom-prison-guard-1'
];
const newlySelectedIds = [
  'incidental-211', 'incidental-152', 'incidental-22', 'incidental-24', 'incidental-222', 'incidental-42',
  'incidental-104', 'incidental-49a', 'incidental-30', 'conductor-1', 'customer', 'mermaid-man-man-ray-timeline', 'nurse'
];
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
assert.equal(publicIds.length, 34, 'the public cast includes the screenshot selection, Karen, and Kevin');
assert.equal(new Set(publicIds).size, 34, 'the public cast has no repeated IDs');
assert.ok(originalSelectedIds.every(id => publicIds.includes(id)), 'all original 19 owner-selected characters are preserved');
assert.ok([...newlySelectedIds, 'karen', 'kevin-c-cucumber'].every(id => publicIds.includes(id)), 'all 13 new screenshot selections plus Karen and Kevin are included');
assert.ok(publicIds.every(id => voteIds.includes(id)), 'the public cast is available even outside the new picker scope');
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
async function pickerReady(page, count) {
  await page.waitForFunction(expected => document.querySelectorAll('.sb-character[data-id]').length === expected && window.SpongeBobMatchups?.getPairs, count);
  await page.locator('#sb-preview-matchups').waitFor({ state: 'visible' });
}
function characterCard(page, id) { return page.locator('.sb-character[data-id="' + id + '"]'); }
async function confirmPair(page, pair) {
  await characterCard(page, pair[0]).click();
  await characterCard(page, pair[1]).click();
  assert.equal(await page.locator('.sb-character[aria-pressed="true"]').count(), 2, 'exactly two portraits are active before confirmation');
  assert.equal(await page.locator('#sb-pair-add').isDisabled(), false, 'two distinct choices enable confirmation');
  await page.locator('#sb-pair-add').click();
}
async function pairingControlsVisible(page) {
  assert.equal(await page.locator('#sb-pair-add').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
  }), true, 'Confirm remains in the viewport while choosing portraits');
  for (const id of ['sb-pair-preview-left', 'sb-pair-preview-right']) {
    assert.equal(await page.locator('#' + id).evaluate(preview => {
      const rect = preview.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
    }), true, 'both picked portrait previews remain visible with confirmation');
  }
}
async function focusedPortraitVisible(page) {
  const visible = () => {
    const card = document.activeElement, station = document.getElementById('sb-pairing');
    if (!card?.classList.contains('sb-character')) return false;
    const rect = card.getBoundingClientRect(), stationBottom = station.getBoundingClientRect().bottom;
    return rect.top >= Math.max(0, stationBottom) + 7 && rect.bottom <= innerHeight + 1;
  };
  await page.waitForFunction(visible, null, { timeout: 3000 });
  assert.equal(await page.evaluate(visible), true, 'keyboard focus moves to a portrait fully below the sticky selection station');
}
async function pickerScreenshot(page, file) {
  await page.locator('.sb-character img, .sb-pair-preview img, .sb-paired-list img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager';
    return image.decode();
  })));
  assert.equal(await page.locator('.sb-image-unavailable').count(), 0, 'all picker portraits remain available');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: file, fullPage: false });
}
async function finishPairing(page, remainingIds) {
  const pairs = [];
  for (let index = 0; index + 1 < remainingIds.length; index += 2) {
    const pair = remainingIds.slice(index, index + 2);
    await confirmPair(page, pair); pairs.push(pair);
  }
  return pairs;
}
async function configuredRound(page, url, pairs) {
  await page.goto(url);
  for (const names of pairs.map(pair => pair.map(id => castById.get(id).name))) {
    await fightReady(page);
    assert.deepEqual(await page.locator('.sb-fighter-name').allTextContents(), names, 'fight preserves the confirmed pair order and sides');
    await page.locator('#sb-skip').click();
  }
  assert.equal(await page.locator('#sb-complete').isVisible(), true, 'the chosen round ends after its configured pairs');
}
(async () => {
  try {
    worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.SPONGEBOB_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing' });
    const first = await context(); const page = first.page;
    await page.goto(base + '/spongebob-picker.html'); await pickerReady(page, 34);
    assert.deepEqual((await page.locator('.sb-character').evaluateAll(cards => cards.map(card => card.dataset.id))).sort(), publicIds.slice().sort(), 'the picker shows only the selected 34-character cast');
    assert.equal(await characterCard(page, 'bare-knuckles-the-sea-bear').isVisible(), true, 'the selected cast retains its saved spinoff character');
    assert.equal(await page.locator('#sb-pair-add').isDisabled(), true, 'confirmation starts disabled');
    assert.equal(await page.locator('#sb-preview-matchups').getAttribute('aria-disabled'), 'true', 'preview starts unavailable before a matchup is chosen');
    const decodedPortraits = await page.evaluate(async refreshedIds => {
      const data = await SpongeBob.load();
      return Promise.all(refreshedIds.map(async id => {
        const character = data.byId.get(id), picture = SpongeBob.picture(character, '', true), image = picture.querySelector('img');
        await image.decode();
        return { id, image: character.image, currentSrc: image.currentSrc, sourceImage: character.sourceImage, width: image.naturalWidth, height: image.naturalHeight };
      }));
    }, refreshedPortraitIds);
    for (const portrait of decodedPortraits) {
      assert.equal(portrait.image, portraitOverrides[portrait.id].image, 'the loaded picker data uses each refreshed portrait');
      assert.ok(portrait.currentSrc.endsWith(portrait.image), 'the browser loads the replacement asset itself');
      assert.equal(portrait.sourceImage, portraitOverrides[portrait.id].sourceImage, 'loaded portrait provenance matches the source manifest');
      assert.ok(portrait.width > 0 && portrait.height > 0, 'each refreshed portrait decodes in the browser');
    }
    const manualIds = ['incidental-24', 'incidental-42', 'karen', 'kevin-c-cucumber'];
    await characterCard(page, manualIds[0]).click();
    assert.equal(await page.locator('#sb-pair-add').isDisabled(), true, 'a single selection cannot form a matchup');
    await characterCard(page, manualIds[1]).click();
    assert.equal(await page.locator('#sb-pair-add').isDisabled(), false);
    await characterCard(page, manualIds[2]).click();
    assert.equal(await page.locator('.sb-character[aria-pressed="true"]').count(), 2, 'clicking a third portrait never creates a third active choice');
    await page.locator('#sb-pair-cancel').click();
    assert.equal(await page.locator('.sb-character[aria-pressed="true"]').count(), 0, 'cancel clears both pending choices');
    assert.equal(await page.locator('.sb-character').count(), 34, 'cancel keeps the whole cast available');
    assert.equal(await page.locator('#sb-pair-add').isDisabled(), true);
    await characterCard(page, manualIds[0]).focus(); await page.keyboard.press('Space');
    assert.equal(await characterCard(page, manualIds[0]).getAttribute('aria-pressed'), 'true', 'Space chooses a portrait');
    await characterCard(page, manualIds[1]).focus(); await page.keyboard.press('Enter');
    assert.equal(await characterCard(page, manualIds[1]).getAttribute('aria-pressed'), 'true', 'Enter chooses the second portrait');
    await page.keyboard.press('Space');
    assert.equal(await characterCard(page, manualIds[1]).getAttribute('aria-pressed'), 'false', 'keyboard activation can cancel a single choice');
    await page.keyboard.press('Enter');
    await noOverflow(page);
    await pairingControlsVisible(page);
    await pickerScreenshot(page, '/tmp/spongebob-selected-picker-desktop-two.png');
    await page.locator('#sb-pair-add').click();
    await pickerReady(page, 32);
    assert.equal(await characterCard(page, manualIds[0]).count(), 0, 'confirmation removes the first portrait from the remaining cast');
    assert.equal(await characterCard(page, manualIds[1]).count(), 0, 'confirmation removes the second portrait from the remaining cast');
    assert.deepEqual(await page.evaluate(() => SpongeBobMatchups.getPairs()), [manualIds.slice(0, 2)]);
    assert.equal(await page.locator('.sb-character[aria-pressed="true"]').count(), 0, 'confirmation clears pending selections');
    assert.match(await page.locator('#sb-pair-summary').textContent(), /32/, 'the remaining count updates after confirmation');
    await confirmPair(page, manualIds.slice(2, 4)); await pickerReady(page, 30);
    await page.locator('.sb-pair-remove').first().click(); await pickerReady(page, 32);
    assert.equal(await characterCard(page, manualIds[0]).isVisible(), true, 'removing a matchup returns its first portrait');
    assert.equal(await characterCard(page, manualIds[1]).isVisible(), true, 'removing a matchup returns its second portrait');
    assert.deepEqual(await page.evaluate(() => SpongeBobMatchups.getPairs()), [manualIds.slice(2, 4)], 'removal preserves the order of other confirmed pairs');
    await confirmPair(page, manualIds.slice(0, 2));
    const chosenPairs = [manualIds.slice(2, 4), manualIds.slice(0, 2)];
    await page.reload(); await pickerReady(page, 30);
    assert.deepEqual(await page.evaluate(() => SpongeBobMatchups.getPairs()), chosenPairs, 'confirmed pairs survive reload in order');
    const downloadEvent = page.waitForEvent('download'); await page.locator('#sb-download-matchups').click();
    const download = await downloadEvent;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(exported.characterIds.slice().sort(), publicIds.slice().sort(), 'download retains the entire selected cast');
    assert.deepEqual(exported.matchups, chosenPairs, 'download preserves exact ordered matchups');
    assert.ok(exported.retainedCharacters?.some(character => character.id === 'bare-knuckles-the-sea-bear'), 'download includes the retained cast metadata');
    await page.locator('#sb-copy-matchups').click();
    const manualShare = await page.evaluate(() => navigator.clipboard.readText());
    const shareParams = new URLSearchParams(new URL(manualShare).hash.slice(1));
    assert.deepEqual(shareParams.get('roster').split(',').sort(), publicIds.slice().sort(), 'the matchup link retains the selected cast');
    assert.deepEqual(JSON.parse(shareParams.get('matchups')), chosenPairs, 'the matchup link carries exact pair order');
    assert.equal(await page.locator('#sb-preview-matchups').getAttribute('aria-disabled'), 'false', 'confirmed pairs enable the direct preview');
    assert.equal(new URL(await page.locator('#sb-preview-matchups').getAttribute('href'), base).href, manualShare, 'preview links directly to the same chosen round');
    const used = new Set(chosenPairs.flat());
    const finalPairs = [...chosenPairs, ...await finishPairing(page, publicIds.filter(id => !used.has(id)))];
    await pickerReady(page, 0);
    assert.equal(await page.locator('#sb-paired-list > li').count(), 17, 'the 34-character cast can be completely paired');
    assert.deepEqual(await page.evaluate(() => SpongeBobMatchups.getPairs()), finalPairs, 'the completed round keeps confirmation order');
    assert.equal(new Set(finalPairs.flat()).size, 34, 'each selected character is assigned exactly once');
    assert.equal(await page.locator('#sb-pair-add').isDisabled(), true, 'a completed round cannot add another pair');
    await noOverflow(page);
    await page.locator('#sb-pair-summary').scrollIntoViewIfNeeded();
    await pickerScreenshot(page, '/tmp/spongebob-selected-picker-desktop-complete.png');
    await page.reload(); await pickerReady(page, 0);
    assert.deepEqual(await page.evaluate(() => SpongeBobMatchups.getPairs()), finalPairs, 'the completed round remains complete after reload');
    const completedPreview = new URL(await page.locator('#sb-preview-matchups').getAttribute('href'), base).href;
    assert.deepEqual(JSON.parse(new URLSearchParams(new URL(completedPreview).hash.slice(1)).get('matchups')), finalPairs, 'the complete preview carries all 17 confirmed matchups in order');
    await configuredRound(page, completedPreview, finalPairs);
    await configuredRound(page, manualShare, chosenPairs);
    const share = await page.evaluate(() => SpongeBob.fightURL(['spongebob-squarepants', 'patrick-star']));
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
    const fullPublicRound = await context();
    await fullPublicRound.page.goto(base + '/spongebob-fight.html');
    const publicSeen = new Set();
    for (let index = 0; index < 17; index++) {
      await fightReady(fullPublicRound.page);
      assert.match(await fullPublicRound.page.locator('#sb-progress').textContent(), /of 17$/i, 'the 34-character public cast makes 17 matchups');
      for (const name of await fullPublicRound.page.locator('.sb-fighter-name').allTextContents()) {
        assert.equal(publicSeen.has(name), false, 'each public cast member appears only once in the default round');
        publicSeen.add(name);
      }
      if (await fullPublicRound.page.locator('#sb-next').isVisible()) await fullPublicRound.page.locator('#sb-next').click();
      else await fullPublicRound.page.locator('#sb-skip').click();
    }
    assert.deepEqual([...publicSeen].sort(), publicIds.map(id => castById.get(id).name).sort(), 'the default round reaches every public cast member exactly once');
    assert.equal(await fullPublicRound.page.locator('#sb-complete').isVisible(), true, 'the default public round ends after 17 disjoint matchups');
    await fullPublicRound.context.close();
    await page.goto(base + '/spongebob-fight.html#roster=made-up'); await page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await page.locator('#sb-load-state').textContent(), /at least two valid characters/);
    const missingAPI = await context();
    await missingAPI.context.route('**/js/spongebob-votes.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await missingAPI.page.goto(share); await missingAPI.page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await missingAPI.page.locator('#sb-load-state').textContent(), /vote service did not load/);
    assert.equal(await missingAPI.page.locator('#sb-matchup').isVisible(), false, 'missing API has no fabricated result');
    const retainedCast = await context();
    await retainedCast.page.goto(base + '/spongebob-fight.html#roster=bare-knuckles-the-sea-bear,fred');
    await fightReady(retainedCast.page);
    assert.ok((await retainedCast.page.locator('.sb-fighter-name').allTextContents()).includes('Bare-Knuckles the Sea Bear'), 'retained cast members still work in matchups');
    await retainedCast.context.close();
    const legacy = await context();
    const legacyIds = manualIds.slice(), legacyPairs = [manualIds.slice(2, 4), manualIds.slice(0, 2)];
    await legacy.context.addInitScript(({ selection, pairs }) => {
      if (!localStorage.getItem('spongebob-character-selection-v1')) {
        localStorage.setItem('spongebob-character-selection-v1', JSON.stringify(selection));
        localStorage.setItem('spongebob-matchups-v1', JSON.stringify(pairs));
      }
    }, { selection: legacyIds, pairs: legacyPairs });
    await legacy.page.goto(base + '/spongebob-picker.html'); await pickerReady(legacy.page, 0);
    assert.deepEqual(await legacy.page.evaluate(() => SpongeBobMatchups.getPairs()), legacyPairs, 'manual pairs saved by the earlier dropdown editor remain usable');
    await legacy.page.locator('.sb-pair-remove').first().click(); await pickerReady(legacy.page, 2);
    assert.deepEqual((await legacy.page.locator('.sb-character').evaluateAll(cards => cards.map(card => card.dataset.id))).sort(), legacyPairs[0].slice().sort(), 'removing a legacy saved pair returns the correct two portraits');
    await legacy.context.close();
    for (const savedIds of [[], ['karen']]) {
      const recovery = await context({ width: 320, height: 568 });
      await recovery.context.addInitScript(selection => {
        if (!localStorage.getItem('spongebob-character-selection-v1')) localStorage.setItem('spongebob-character-selection-v1', JSON.stringify(selection));
      }, savedIds);
      await recovery.page.goto(base + '/spongebob-picker.html'); await pickerReady(recovery.page, savedIds.length);
      assert.equal(await recovery.page.locator('#sb-use-public-cast').isVisible(), true, 'an empty or one-character saved cast offers recovery');
      await recovery.page.locator('#sb-use-public-cast').click(); await pickerReady(recovery.page, 34);
      assert.deepEqual((await recovery.page.locator('.sb-character').evaluateAll(cards => cards.map(card => card.dataset.id))).sort(), publicIds.slice().sort(), 'recovery restores the complete public cast');
      await noOverflow(recovery.page); await recovery.context.close();
    }
    const noStorage = await context();
    await noStorage.context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
    });
    await noStorage.page.goto(base + '/spongebob-picker.html'); await pickerReady(noStorage.page, 34);
    await confirmPair(noStorage.page, manualIds.slice(0, 2)); await pickerReady(noStorage.page, 32);
    assert.deepEqual(await noStorage.page.evaluate(() => SpongeBobMatchups.getPairs()), [manualIds.slice(0, 2)], 'pairing still works when browser storage is unavailable');
    assert.equal(await noStorage.page.locator('#sb-preview-matchups').getAttribute('aria-disabled'), 'false', 'the unsaved chosen matchup still has a usable preview');
    await noStorage.context.close();
    const odd = await context();
    const oddIds = ['bubble-buddy', 'karen', 'kevin-c-cucumber', 'incidental-24', 'bare-knuckles-the-sea-bear'];
    await odd.context.addInitScript(selection => {
      if (!localStorage.getItem('spongebob-character-selection-v1')) localStorage.setItem('spongebob-character-selection-v1', JSON.stringify(selection));
    }, oddIds);
    await odd.page.goto(base + '/spongebob-picker.html'); await pickerReady(odd.page, 5);
    assert.deepEqual((await odd.page.locator('.sb-character').evaluateAll(cards => cards.map(card => card.dataset.id))).sort(), oddIds.slice().sort(), 'a saved smaller cast is used instead of the public roster');
    const oddPairs = await finishPairing(odd.page, oddIds);
    await pickerReady(odd.page, 1);
    assert.equal(await characterCard(odd.page, oddIds[4]).count(), 1, 'an odd cast leaves its final character available');
    assert.equal(await characterCard(odd.page, oddIds[4]).isDisabled(), true, 'one leftover character cannot pair with itself');
    assert.equal(await odd.page.locator('#sb-pair-form').isVisible(), false, 'the picker hides confirmation when no valid pair remains');
    assert.deepEqual(await odd.page.evaluate(() => SpongeBobMatchups.getPairs()), oddPairs);
    const oddPreview = new URL(await odd.page.locator('#sb-preview-matchups').getAttribute('href'), base).href;
    await configuredRound(odd.page, oddPreview, oddPairs);
    await odd.context.close();
    const invalidShare = new URL(manualShare);
    invalidShare.hash = new URLSearchParams({ roster: 'spongebob-squarepants,patrick-star,sandy-cheeks', matchups: JSON.stringify([['spongebob-squarepants','patrick-star'],['spongebob-squarepants','sandy-cheeks']]) }).toString();
    await page.goto(invalidShare.href); await page.locator('#sb-load-retry').waitFor({ state: 'visible' });
    assert.match(await page.locator('#sb-load-state').textContent(), /Each character can appear only once/);
    const mobile = await context({ width: 375, height: 812 });
    await mobile.page.goto(base + '/spongebob-picker.html'); await pickerReady(mobile.page, 34);
    await noOverflow(mobile.page);
    const mobilePairs = [];
    const mobileFirstPair = [publicIds[0], publicIds.at(-1)];
    await characterCard(mobile.page, mobileFirstPair[0]).click(); await characterCard(mobile.page, mobileFirstPair[1]).click();
    await pairingControlsVisible(mobile.page);
    await pickerScreenshot(mobile.page, '/tmp/spongebob-selected-picker-mobile-two.png');
    assert.ok(await characterCard(mobile.page, publicIds[0]).evaluate(card => card.getBoundingClientRect().width >= 44 && card.getBoundingClientRect().height >= 44), 'portrait choices are touch-sized');
    await mobile.page.locator('#sb-pair-add').click(); mobilePairs.push(mobileFirstPair);
    mobilePairs.push(...await finishPairing(mobile.page, publicIds.filter(id => !mobileFirstPair.includes(id))));
    await pickerReady(mobile.page, 0); await noOverflow(mobile.page);
    assert.deepEqual(await mobile.page.evaluate(() => SpongeBobMatchups.getPairs()), mobilePairs, 'mobile can finish all 17 matchups in order');
    await mobile.page.locator('#sb-pair-summary').scrollIntoViewIfNeeded();
    await pickerScreenshot(mobile.page, '/tmp/spongebob-selected-picker-mobile-complete.png');
    const narrowPicker = await context({ width: 320, height: 568 });
    await narrowPicker.page.goto(base + '/spongebob-picker.html'); await pickerReady(narrowPicker.page, 34);
    await noOverflow(narrowPicker.page);
    await characterCard(narrowPicker.page, 'mermaid-man-man-ray-timeline').click(); await characterCard(narrowPicker.page, 'tom-prison-guard-1').click();
    await noOverflow(narrowPicker.page); await pairingControlsVisible(narrowPicker.page);
    await narrowPicker.page.locator('#sb-pair-add').click(); await pickerReady(narrowPicker.page, 32);
    await noOverflow(narrowPicker.page); await focusedPortraitVisible(narrowPicker.page);
    await narrowPicker.page.locator('.sb-pair-remove').first().click(); await pickerReady(narrowPicker.page, 34);
    await noOverflow(narrowPicker.page); await focusedPortraitVisible(narrowPicker.page);
    await narrowPicker.context.close();
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
    console.log('PASS: selected 34-character portrait picker, two-choice keyboard/cancel/confirmation, removal and ordered persistence, exact pair sharing/export, 17 completed manual and default matchups without repeats, odd saved cast, 95 refreshed portraits, real isolated vote percentages, reversed duplicates, lost-response retry, standalone comparer, desktop/mobile/landscape layouts.');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve)); sqlite.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
