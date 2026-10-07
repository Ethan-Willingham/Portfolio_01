import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash, toolLock} from './core.mjs';
import {browserRun, serve} from './browser.mjs';

const output = process.env.CHAIN_REACTION_OUTPUT || '/tmp/chain-reaction-immersive';
const research = process.env.CHAIN_REACTION_RESEARCH;
assert.ok(research, 'Set CHAIN_REACTION_RESEARCH to the private Chain Reaction directory');
const canonicalPath = resolve(research, 'evidence/cycle-22/connected-canonical.json');
const canonicalBytes = await readFile(canonicalPath);
const canonical = JSON.parse(canonicalBytes).rows.find(row => row.sample === 'canonical' && !row.mirrored);
assert.equal(canonical?.result.eventFrames.length, 8, 'Missing the eight recorded drawer transfer frames');
const viewports = [
  {width: 1440, height: 900}, {width: 859, height: 767},
  {width: 844, height: 390}, {width: 390, height: 844},
];
const routes = ['/chain-reaction.html', '/chain-reaction/connected-slice.html'];
const middles = [{stage: 1, tick: 1140}, {stage: 4, tick: 1375}];
const reports = [];
const unlock = await toolLock();
let server, origin;

// Wait for two acknowledged browser frames, including the renderer's dirty draw.
async function settleFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function settledTitle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const title = document.getElementById('stage-title');
    return !title || getComputedStyle(title).opacity === (title.classList.contains('faded') ? '0' : '1');
  });
  await settleFrames(page);
}
async function readState(page) {
  return page.evaluate(() => {
    const {stage, tick, paused, ended, following} = ChainReactionPage.state();
    return {stage, tick, paused, ended, following};
  });
}
async function layout(page, viewport) {
  const actual = await page.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    };
    const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    return {
      canvas: box(document.getElementById('machine')),
      scroll: {width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight},
      links: [...document.querySelectorAll('a')].filter(visible).map(a => ({text: a.textContent.trim(), href: a.getAttribute('href'), ...box(a)})),
      buttons: [...document.querySelectorAll('button')].filter(visible).map(b => ({id: b.id, text: b.textContent.trim(), ...box(b)})),
      removed: document.querySelectorAll('.cr-bar,#caption,#about,#about-toggle,#share').length,
      immersive: document.body.classList.contains('cr-immersive'),
    };
  });
  assert.ok(actual.immersive);
  assert.equal(actual.removed, 0, 'The connected demo still has article controls');
  for (const [key, expected] of Object.entries({x: 0, y: 0, ...viewport})) {
    assert.ok(Math.abs(actual.canvas[key] - expected) < 1, 'Canvas does not fill the viewport: ' + JSON.stringify(actual));
  }
  assert.ok(actual.scroll.width <= viewport.width && actual.scroll.height <= viewport.height, 'The immersive demo scrolls');
  assert.deepEqual(actual.links.map(({text, href}) => ({text, href})), [{text: 'Home', href: '/index.html'}]);
  assert.deepEqual(actual.buttons.map(b => b.id).sort(), ['pause', 'restart']);
  for (const control of [...actual.links, ...actual.buttons]) {
    assert.ok(control.width >= 44 && control.height >= 44, 'Control is smaller than 44 CSS pixels');
    assert.ok(control.x >= 0 && control.y >= 0 && control.x + control.width <= viewport.width + 1 && control.y + control.height <= viewport.height + 1, 'Control leaves the viewport');
  }
  return actual;
}
async function themeMetadata(page) {
  const metadata = await page.evaluate(() => {
    const {diorama, bench, partMaps} = ChainReactionPage.inspect();
    return {
      stageCount: partMaps.length,
      themes: diorama?.themes,
      bench: {kind: bench.userData.kind, version: bench.userData.version, themeCount: bench.userData.themeCount},
    };
  });
  assert.equal(metadata.stageCount, 4, 'The connected diorama needs four definitions');
  assert.ok(Array.isArray(metadata.themes));
  assert.deepEqual(metadata.themes.map(theme => theme.id), ['workshop', 'sewing-alcove', 'toy-theatre', 'curiosity-cabinet']);
  assert.equal(new Set(metadata.themes.map(theme => theme.wood)).size, 4, 'Theme wood stays the same');
  assert.equal(new Set(metadata.themes.map(theme => theme.wall)).size, 4, 'Theme background stays the same');
  for (const [index, theme] of metadata.themes.entries()) {
    assert.equal(theme.xStart, index * 16);
    assert.equal(theme.xEnd, (index + 1) * 16);
    assert.equal(theme.nonPhysical, true);
    for (const field of ['title', 'wood', 'wall', 'description']) {
      assert.ok(typeof theme[field] === 'string' && theme[field].trim().length > 0, 'Missing theme ' + field);
    }
  }
  assert.deepEqual(metadata.bench, {kind: 'scenery', version: 1, themeCount: 4});
  return metadata;
}
async function frozenPair(page, stem, label) {
  await settledTitle(page);
  const before = await readState(page);
  const first = resolve(output, stem + '-a.png'), second = resolve(output, stem + '-b.png');
  const a = await page.screenshot({path: first, fullPage: true});
  await page.waitForTimeout(160);
  const b = await page.screenshot({path: second, fullPage: true});
  const after = await readState(page);
  assert.ok(before.paused && after.paused, label + ' is not paused');
  assert.equal(before.stage, after.stage, label + ' changes stages while paused');
  assert.equal(before.tick, after.tick, label + ' advances physics while paused');
  assert.equal(hash(a), hash(b), label + ' changes pixels while paused');
  return {label, stage: before.stage, tick: before.tick, files: [first, second], exactHash: hash(a), intervalMs: 160};
}
async function controls(page) {
  await page.evaluate(() => ChainReactionPage.seek(4, 0));
  await settledTitle(page);
  await page.locator('#restart').click();
  // Actual playback acknowledges Replay and separates native mouse clicks. In
  // WebKit, immediate clicks on adjacent changing controls can omit click events.
  await page.waitForFunction(() => {
    const s = ChainReactionPage.state();
    return s.stage === 1 && !s.paused && s.tick >= 180;
  });
  await page.getByRole('button', {name: 'Pause', exact: true}).click();
  await page.waitForFunction(() => ChainReactionPage.state().paused && document.getElementById('pause').getAttribute('aria-pressed') === 'true');
  const stopped = await readState(page);
  await settleFrames(page);
  assert.equal((await readState(page)).tick, stopped.tick, 'Pause does not hold its tick');
  const snapshot = hash(Uint8Array.from(await page.evaluate(() => ChainReactionPage.snapshot())));
  await page.locator('#machine').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => !ChainReactionPage.state().following && !document.getElementById('follow').hidden);
  const followBox = await page.locator('#follow').boundingBox();
  assert.ok(followBox.width >= 44 && followBox.height >= 44);
  await page.locator('#follow').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => ChainReactionPage.state().following && document.getElementById('follow').hidden);
  assert.equal((await readState(page)).tick, stopped.tick, 'Looking around advances a paused world');
  assert.equal(hash(Uint8Array.from(await page.evaluate(() => ChainReactionPage.snapshot()))), snapshot, 'Looking around changes physics');
  return {replay: true, pause: true, manualFollow: true, followActivation: 'keyboard', stoppedTick: stopped.tick, unchangedSnapshot: snapshot};
}

try {
  await mkdir(output, {recursive: true});
  if (process.env.CHAIN_REACTION_URL) origin = process.env.CHAIN_REACTION_URL.replace(/\/$/, '');
  else {server = await serve(); origin = server.url;}
  for (const engine of ['chromium', 'webkit']) {
    await browserRun(engine, async browser => {
      const context = await browser.newContext({viewport: viewports[0], deviceScaleFactor: 2});
      try {
        const page = await context.newPage(), errors = [], failedResources = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
        page.on('response', response => {if (response.url().startsWith(origin) && response.status() >= 400) failedResources.push({status: response.status(), url: response.url()});});
        const report = {engine, layouts: [], framing: [], frozen: [], controls: []};
        reports.push(report);
        for (const [routeIndex, route] of routes.entries()) {
          for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            // Identical goto URLs may reuse the current document. Start from a
            // blank document so ready and the initial tick belong to this case.
            await page.goto('about:blank');
            await page.goto(origin + route + '?paused=1#stage=4');
            await page.waitForFunction(() => window.ChainReactionPage?.ready);
            await settledTitle(page);
            const state = await readState(page);
            assert.deepEqual({stage: state.stage, tick: state.tick, paused: state.paused}, {stage: 4, tick: 0, paused: true});
            const themes = await themeMetadata(page);
            if (!report.diorama) report.diorama = themes;
            else assert.deepEqual(themes, report.diorama, 'Theme metadata changes between routes or layouts');
            report.layouts.push({route, viewport, ...await layout(page, viewport)});
            if (routeIndex === 0) {
              for (const frame of canonical.result.eventFrames) {
                await page.evaluate(time => ChainReactionPage.seek(4, time), frame.time);
                const points = await page.evaluate(points => {
                  const {camera} = ChainReactionPage.inspect();
                  return points.map(p => {
                    const q = new THREE.Vector3(p.x + 48, p.y, p.z || 0).project(camera);
                    return {x: q.x, y: q.y};
                  });
                }, frame.points);
                assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= .95 && Math.abs(p.y) <= .95), 'Actual camera crops ' + frame.id + ': ' + JSON.stringify({viewport, points}));
                report.framing.push({viewport, id: frame.id, tick: frame.tick, points});
              }
              for (const middle of middles) {
                await page.evaluate(({stage, tick}) => ChainReactionPage.seek(stage, tick / 240), middle);
                const stem = `${engine}-${viewport.width}x${viewport.height}-stage-${middle.stage}-${middle.tick}`;
                const snapshot = hash(Uint8Array.from(await page.evaluate(() => ChainReactionPage.snapshot())));
                const paused = await frozenPair(page, stem + '-paused', 'frozen scene');
                await page.evaluate(() => ChainReactionPage.overview());
                await settleFrames(page);
                await page.waitForFunction(() => !ChainReactionPage.state().following && !document.getElementById('follow').hidden);
                await page.locator('#follow').focus();
                await page.keyboard.press('Enter');
                await page.waitForFunction(() => ChainReactionPage.state().following && document.getElementById('follow').hidden);
                const returned = await frozenPair(page, stem + '-zoom-return', 'paused zoom return');
                assert.equal(hash(Uint8Array.from(await page.evaluate(() => ChainReactionPage.snapshot()))), snapshot, 'Zoom return changes the physics snapshot');
                report.frozen.push({viewport, ...middle, paused, returned, unchangedSnapshot: snapshot});
              }
            }
          }
          report.controls.push({route, ...await controls(page)});
        }
        report.quality = await page.evaluate(() => ChainReactionPage.quality());
        assert.ok(report.quality.samples >= 2);
        assert.equal(report.quality.pixelRatio, 2);
        for (const field of ['focusBlur', 'motionBlur', 'grain']) assert.equal(report.quality[field], 0);
        assert.deepEqual(failedResources, []);
        assert.deepEqual(errors, []);
        report.errors = errors;
        report.failedResources = failedResources;
        report.pass = true;
        await page.close();
      } finally {await context.close();}
    });
    console.log(engine + ': eight immersive layouts, 32 actual transfer frames, eight frozen pairs, eight zoom-return pairs and both routes\' controls passed.');
  }
  await writeFile(resolve(output, 'immersive.json'), JSON.stringify({
    pass: true, origin,
    scope: 'Immersive shell, actual drawer camera framing, exact frozen full-page pixels and paused zoom-return stability. Full chronological physics snapshot verification remains in workbench.mjs.',
    sources: {tool: hash(await readFile(fileURLToPath(import.meta.url))), canonicalFrames: hash(canonicalBytes)},
    routes, viewports, reports,
  }, null, 2) + '\n');
} catch (error) {
  await mkdir(output, {recursive: true});
  await writeFile(resolve(output, 'immersive-failed.json'), JSON.stringify({pass: false, origin, error: String(error), stack: error.stack, reports}, null, 2) + '\n');
  throw error;
} finally {await server?.close(); await unlock();}
