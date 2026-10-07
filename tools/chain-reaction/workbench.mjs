import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT, physics, moduleURL, hash, toolLock} from './core.mjs';
import {serve, browserRun} from './browser.mjs';

const unlock = await toolLock();
let server;
try {
  const output = process.env.CHAIN_REACTION_OUTPUT || '/tmp/chain-reaction-workbench';
  await mkdir(output, {recursive: true});
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'chain-reaction/workbench-manifest.json')));
  for (const file of manifest.files) assert.equal(hash(await readFile(resolve(ROOT, 'chain-reaction', file.file))), file.publishedHash, file.file);
  const stages = await Promise.all([1, 2, 3, 4].map(async n => JSON.parse(await readFile(resolve(ROOT, 'chain-reaction/stages/viewer', String(n).padStart(5, '0') + '.json')))));
  server = await serve();
  const origin = process.env.CHAIN_REACTION_URL || server.url;
  const reports = [];
  for (const engine of ['chromium', 'webkit']) {
    await browserRun(engine, async browser => {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2});
      const page = await context.newPage(), failures = [], errors = [];
      page.on('response', r => {if (r.url().startsWith(origin) && r.status() >= 400) failures.push([r.status(), r.url()]);});
      page.on('pageerror', e => errors.push(e.message));
      const report = {engine, layouts: [], studies: []};
      await page.goto(origin + '/archive.html');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: resolve(output, `${engine}-in-progress.png`)});
      await page.locator('#chain-reaction a.article-item').click();
      await page.waitForURL('**/chain-reaction-workbench.html');
      assert.equal(await page.locator('.workbench-studies a').count(), 9);
      const hrefs = await page.locator('main a').evaluateAll(links => links.map(a => a.href));
      for (const href of new Set(hrefs)) assert.equal((await context.request.get(href)).status(), 200, href);
      for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 844, height: 390}]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => ({width: innerWidth, content: document.documentElement.scrollWidth, gutter: document.querySelector('.site-wrapper').getBoundingClientRect().left}));
        assert.ok(layout.content <= layout.width, JSON.stringify(layout));
        if (viewport.width === 375) assert.equal(layout.gutter, 20);
        report.layouts.push({...viewport, ...layout});
        await page.screenshot({path: resolve(output, `${engine}-hub-${viewport.width}.png`), fullPage: true});
      }
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(origin + '/chain-reaction/connected-slice.html?paused=1#stage=1');
      await page.waitForFunction(() => window.ChainReactionPage?.ready && ChainReactionPage.state().maxWorlds === 2);
      assert.equal(await page.locator('#sound').isVisible(), false);
      for (let i = 0; i < 80; i++) {
        const state = await page.evaluate(() => ChainReactionPage.advance(120));
        if (state.ended) break;
      }
      const completion = await page.evaluate(() => ({state: ChainReactionPage.state(), completed: ChainReactionPage.completed()}));
      assert.equal(completion.state.ended, true);
      assert.equal(completion.state.maxWorlds, 2);
      assert.equal(completion.completed.length, 4);
      report.chain = completion.completed.map((s, i) => {
        assert.equal(s.report.pass, true);
        assert.equal(s.tick, Math.round(stages[i].verified.duration * 240));
        assert.equal(hash(Uint8Array.from(s.snapshot)), stages[i].verified.stateHash);
        return {stage: s.stage, tick: s.tick, pass: s.report.pass, hash: hash(Uint8Array.from(s.snapshot))};
      });
      await page.goto(origin + '/chain-reaction/connected-slice.html?paused=1#stage=4');
      await page.waitForFunction(() => window.ChainReactionPage?.ready);
      await page.evaluate(() => ChainReactionPage.seek(4, 2));
      await page.screenshot({path: resolve(output, `${engine}-drawer.png`)});
      for (const [file, hook, tick] of [
        ['guided.html?kit=14', 'ChainReactionCatch', 3000],
        ['drawer.html', 'ChainReactionDrawer', 480],
        ['drawer-port.html', 'ChainReactionDrawerRelease', 2400],
        ['drawer-outlet.html?kit=16', 'ChainReactionDrawerOutlet', 3000],
        ['rocker-landing.html', 'ChainReactionRocker', 2400],
        ['rocker-outlet.html', 'ChainReactionRockerOutlet', 2000],
      ]) {
        await page.goto(origin + '/chain-reaction/' + file);
        await page.waitForFunction(name => window[name]?.ready, hook);
        const result = await page.evaluate(async ({hook, tick}) => {
          const api = window[hook]; await api.seek(tick);
          return {definition: api.definition, state: api.state(), snapshot: api.snapshot?.()};
        }, {hook, tick});
        const sim = await physics.create(result.definition, moduleURL);
        try {
          for (let n = 0; n < result.state.tick; n++) sim.step();
          assert.deepEqual(result.state.poses, sim.state(), engine + ' ' + file);
          if (result.snapshot) assert.equal(hash(Uint8Array.from(result.snapshot)), hash(sim.snapshot()));
        } finally {sim.dispose();}
        assert.ok(result.state.poses.every(p => [p.x, p.y, p.angle].every(Number.isFinite)));
        assert.equal(await page.locator('.cr-home').getAttribute('href'), '/chain-reaction-workbench.html');
        report.studies.push({file, tick: result.state.tick, exact: true});
      }
      await page.goto(origin + '/chain-reaction/props.html');
      await page.waitForFunction(() => window.ChainReactionProps?.ready);
      for (const id of ['drawer', 'square', 'cradle', 'arrow', 'rack']) {
        await page.locator('#prop').selectOption(id);
        await page.waitForFunction(id => ChainReactionProps.state().selected === id && ChainReactionProps.state().pose === 0, id);
        await page.locator('#pose').click();
        await page.waitForFunction(() => ChainReactionProps.state().pose === 1);
      }
      report.props = {count: 5, poses: 10};
      assert.deepEqual(failures, []);
      assert.deepEqual(errors, []);
      reports.push(report);
      await context.close();
    });
    console.log(engine + ': four-stage playback, six mechanism worlds, ten prop poses and three hub layouts passed.');
  }
  await writeFile(resolve(output, 'workbench.json'), JSON.stringify({pass: true, origin, files: manifest.files.length, reports}, null, 2) + '\n');
} finally {await server?.close(); await unlock();}
