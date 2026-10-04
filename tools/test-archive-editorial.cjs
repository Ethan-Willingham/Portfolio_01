// Run with the workspace dependency bundle on NODE_PATH.
// Own the local server and testing browser, and close both on every exit.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/editorial/2026-10-03/progress.json'), 'utf8'));
const baseline = process.argv.includes('--baseline');
const selection = process.argv.find(arg => arg.startsWith('--slugs='));
const slugs = selection && new Set(selection.slice(8).split(','));
const posts = manifest.posts.filter(post => !slugs || slugs.has(post.slug));
const output = process.env.EDITORIAL_ARTIFACTS || '/tmp/portfolio-editorial-20261003-checks';
fs.mkdirSync(output, { recursive: true });
const report = { baseline, posts: [], syntax: [], failures: [] };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400).end(); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
let browser;
function fail(slug, viewport, issue) { report.failures.push({ slug, viewport, issue }); }
function inspectScripts(post) {
  const html = fs.readFileSync(path.join(root, post.file), 'utf8');
  let index = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    index++;
    if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json|module)["']/i.test(match[1]) || /\bsrc\s*=/i.test(match[1])) continue;
    try { new vm.Script(match[2], { filename: post.file + ':script-' + index }); }
    catch (error) { fail(post.slug, 'static', error.message); }
  }
  report.syntax.push({ slug: post.slug, inlineScripts: index });
}
async function probe(page, slug) {
  const result = {};
  if (slug === 'star-signs') {
    result.bodies = await page.locator('#ss-table .ss-prow').count();
    if (result.bodies !== 10) throw new Error('Chart lacks one of its ten displayed bodies');
    await page.locator('#ss-bn-go').click();
    const reading = (await page.locator('#ss-bn-reading').innerText()).split('\n').slice(1).join('\n');
    await page.locator('#ss-bn-stars [data-n="4"]').click();
    if (!(await page.locator('#ss-bn-reveal-text').innerText()).includes('everyone gets the same paragraph')) throw new Error('Generic reading lacks its explanation');
    await page.locator('#ss-bn-date-mount .pk-trigger').click();
    await page.evaluate(() => window.scrollTo({ top: window.scrollY + 600, behavior: 'instant' }));
    await page.waitForFunction(() => {
      const bounds = document.querySelector('.pk-pop.show').getBoundingClientRect();
      return bounds.top >= 7 && bounds.bottom <= innerHeight - 7;
    });
    result.pickerRemainsOnscreenAfterScroll = true;
    await page.locator('.pk-pop.show [data-a="nm"]').click();
    await page.locator('.pk-pop.show [data-date="1990-07-15"]').click();
    await page.locator('#ss-bn-go').click();
    result.sameReading = reading === (await page.locator('#ss-bn-reading').innerText()).split('\n').slice(1).join('\n');
    if (!result.sameReading) throw new Error('Birth date changed the supposedly generic paragraph');
    await page.locator('#ss-bn-stars [data-n="3"]').click();
    await page.locator('#ss-bn-tochart').click();
    await page.locator('#ss-table .ss-prow').first().click();
    if (await page.locator('#ss-table .ss-prow').first().getAttribute('aria-expanded') !== 'true') throw new Error('Chart provenance row did not open');
    await page.locator('#ss-cmp-btn').click();
    result.comparedBodies = await page.locator('#ss-cmp tbody tr').count();
    if (result.comparedBodies !== 10) throw new Error('House comparison lacks a body');
    await page.locator('#ss-seg [data-sys="placidus"]').click();
    await page.locator('#ss-scrub').fill('0');
    await page.locator('#ss-scrub').dispatchEvent('input');
    if (await page.locator('#ss-time').inputValue() !== '00:00') throw new Error('Time scrubber did not update the chart time');
    await page.locator('#ss-time-mount input[type="checkbox"]').check();
    result.unknownTime = await page.locator('#ss-note').innerText();
    if (!await page.locator('#ss-scrub').isDisabled() || await page.locator('#ss-table .ph').filter({ hasText: /H\d/ }).count() || !(await page.locator('#ss-cmp').innerText()).includes('known birth time')) throw new Error('Unknown time left precise houses or time controls visible');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__editorialChartCopy = text; } } });
    });
    await page.locator('#ss-share-btn').click();
    await page.waitForFunction(() => document.querySelector('#ss-share-out').textContent === 'Copied.');
    result.summary = await page.evaluate(() => window.__editorialChartCopy);
    if (!result.summary.includes('local noon assumed') || !result.summary.includes('Rising sign and houses omitted')) throw new Error('Unknown-time summary omitted its assumptions');
    await page.locator('#ss-time-mount input[type="checkbox"]').uncheck();
    await page.locator('#ss-city').fill('Unlisted place');
    if (!await page.locator('#ss-share-btn').isDisabled() || !(await page.locator('#ss-note').innerText()).includes('Choose a listed city')) throw new Error('Unlisted place was silently treated as a valid chart');
    await page.locator('#ss-city').fill('New York, USA');
    await page.locator('#ss-off').fill('');
    if (!await page.locator('#ss-share-btn').isDisabled() || !(await page.locator('#ss-note').innerText()).includes('Blank is not UTC')) throw new Error('Blank UTC offset was silently treated as zero');
    await page.locator('#ss-off').fill('-5');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Test clipboard unavailable'); } } });
      document.execCommand = () => false;
    });
    await page.locator('#ss-share-btn').click();
    await page.waitForFunction(() => document.querySelector('#ss-share-out').textContent.startsWith('Copy failed.'));
    result.copyFailure = await page.locator('#ss-share-out').innerText();
    if (!await page.locator('#ss-share-text').isVisible()) throw new Error('Failed clipboard copy left no selectable fallback');
  }
  if (slug === 'seven-habits') {
    result.habits = await page.locator('.hb h3').allTextContents();
    if (result.habits.length !== 7) throw new Error('Covey guide lacks one of the seven habits');
    await page.locator('.viz').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('.grow-v')].every(group => group.classList.contains('go')));
    result.diagram = await page.locator('.viz svg').getAttribute('aria-label');
    result.quadrants = await page.locator('.time-quadrants tbody tr').count();
    if (!result.diagram || result.quadrants !== 4) throw new Error('Covey diagram or four-quadrant table is missing');
    if (await page.evaluate(() => innerWidth < 600)) {
      result.diagramScroll = await page.locator('.viz-scroll').evaluate(region => { region.scrollLeft = 150; return region.scrollLeft; });
      if (result.diagramScroll <= 0) throw new Error('Phone staircase cannot scroll within its container');
    }
  }
  if (slug === 'machine-to-atom') {
    const photos = page.locator('img.zoom');
    result.zoomableImages = await photos.count();
    if (result.zoomableImages !== 16) throw new Error('Microscopy image count differs from the retained selection');
    result.images = [];
    for (let i = 0; i < result.zoomableImages; i++) {
      const photo = photos.nth(i);
      const title = await photo.getAttribute('data-zoom-title');
      await photo.click();
      await page.waitForFunction(() => document.querySelector('#lightbox-img').complete && document.querySelector('#lightbox-img').naturalWidth > 0);
      const caption = await page.locator('#lightbox-caption').innerText();
      if (!caption.includes(title)) throw new Error('Enlarged microscopy image lacks its matching credit: ' + title);
      await page.locator('#lightbox-zoom-in').click();
      if (await page.locator('#lightbox-zoom-label').innerText() === '100%') throw new Error('Microscopy image did not zoom');
      await page.locator('#lightbox-reset').click();
      if (await page.locator('#lightbox-zoom-label').innerText() !== '100%') throw new Error('Microscopy image did not reset');
      await page.keyboard.press('Escape');
      if (await page.locator('#lightbox').getAttribute('aria-hidden') !== 'true') throw new Error('Microscopy image did not close');
      result.images.push(title);
    }
  }
  if (slug === 'mri') {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'archive/mri/assets/mri/manifest.json'), 'utf8'));
    result.series = [];
    for (const region of manifest.regions) {
      await page.locator('[data-region="' + region + '"]').click();
      for (const series of manifest.slice_series.filter(series => series.region === region)) {
        await page.locator('[data-id="' + series.id + '"]').click();
        await page.waitForFunction(() => !document.querySelector('#slice-slider').disabled);
        const max = await page.locator('#slice-slider').getAttribute('max');
        if (Number(max) !== series.count - 1) throw new Error('MRI slice count differs from manifest: ' + series.id);
        await page.locator('#slice-slider').fill(max);
        await page.locator('#slice-slider').dispatchEvent('input');
        const count = await page.locator('#slice-count').innerText();
        const dimensions = await page.locator('#slice-canvas').evaluate(canvas => [canvas.width, canvas.height]);
        if (count !== series.count + ' / ' + series.count || dimensions[0] !== series.tile_w || dimensions[1] !== series.tile_h) throw new Error('MRI crop/readout differs from manifest: ' + series.id);
        result.series.push({ id: series.id, count, dimensions });
      }
    }
    result.totalSlices = manifest.slice_series.reduce((sum, series) => sum + series.count, 0);
    if (result.totalSlices !== 515 || result.series.length !== 16) throw new Error('MRI published subset changed');
    await page.locator('#play-btn').click();
    await page.waitForFunction(() => document.querySelector('#slice-slider').value !== document.querySelector('#slice-slider').max);
    await page.locator('#play-btn').click();
    const paused = await page.locator('#slice-count').innerText();
    await page.waitForTimeout(220);
    if (paused !== await page.locator('#slice-count').innerText()) throw new Error('MRI playback did not pause');
    await page.waitForFunction(() => !document.querySelector('#rotate-chk').disabled || document.querySelector('#loading-3d').classList.contains('failed'), undefined, { timeout: 30000 });
    result.meshAvailable = !await page.locator('#rotate-chk').isDisabled();
    if (result.meshAvailable) {
      await page.locator('[data-scene="spine"]').click();
      await page.waitForFunction(() => document.querySelector('#loading-3d').classList.contains('hidden') && document.querySelector('#nv-caption').textContent.startsWith('Spine / torso:'));
      result.spineCaption = await page.locator('#nv-caption').innerText();
      await page.locator('#rotate-chk').uncheck();
      await page.locator('[data-scene="brain"]').click();
      await page.waitForFunction(() => document.querySelector('#loading-3d').classList.contains('hidden') && document.querySelector('#nv-caption').textContent.startsWith('Brain:'));
      result.brainCaption = await page.locator('#nv-caption').innerText();
      await page.locator('#rotate-chk').check();
    } else result.meshLimit = await page.locator('#loading-3d').innerText();
  }
  if (slug === 'weather') {
    result.figures = await page.locator('.reel .figure.var').count();
    if (result.figures !== 21) throw new Error('Weather reel did not retain its 21 cards');
    result.sourceBlocks = await page.locator('.d-sources').count();
    result.sourceLinks = await page.locator('.d-sources a').count();
    if (result.sourceBlocks !== 28 || result.sourceLinks < 44) throw new Error('Weather evidence links did not render');
    await page.locator('.reel .d-sources').first().scrollIntoViewIfNeeded();
    if (!await page.locator('.reel .d-sources a').first().isVisible()) throw new Error('Weather evidence is hidden');
    await page.locator('#wxCanvas').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => /model time/.test(document.querySelector('#wxClock').textContent) && parseFloat(document.querySelector('#wxClock').textContent.replace('model time', '')) > 0);
    await page.locator('#wxSlider').fill('-4.5');
    await page.locator('#wxSlider').dispatchEvent('input');
    result.initialDifference = await page.locator('#wxSliderVal').innerText();
    if (result.initialDifference !== '3.16e-5') throw new Error('Lorenz half-step difference is rounded incorrectly');
    result.modelNote = await page.locator('.wx-model-note').innerText();
    if (!result.modelNote.includes('Dimensionless') || !result.modelNote.includes('no conversion to forecast days')) throw new Error('Lorenz model lacks its unit and scope explanation');
    result.resetClock = await page.locator('#wxReset').evaluate(button => { button.click(); return document.querySelector('#wxClock').textContent; });
    if (result.resetClock !== 'model time 0.0') throw new Error('Lorenz restart did not reset model time');
    await page.locator('.reel .plate').first().click();
    result.lightboxOpened = await page.locator('#lightbox').evaluate(element => element.classList.contains('open'));
    await page.keyboard.press('Escape');
    if (!result.lightboxOpened || await page.locator('#lightbox').evaluate(element => element.classList.contains('open'))) throw new Error('Weather image did not enlarge and close');
  }
  if (slug === 'claude-recommends') {
    result.initialCount = await page.locator('#cr-count').innerText();
    await page.locator('#cr-q').fill('__editorial_no_match__');
    await page.waitForFunction(initial => document.querySelector('#cr-count').innerText !== initial, result.initialCount);
    result.filteredCount = await page.locator('#cr-count').innerText();
    await page.locator('#cr-q').fill('');
    await page.waitForFunction(initial => document.querySelector('#cr-count').innerText === initial, result.initialCount);
    result.resetCount = await page.locator('#cr-count').innerText();
    if (result.initialCount !== result.resetCount || result.filteredCount === result.initialCount) throw new Error('Catalogue search did not change and reset');
    await page.locator('[data-dom="screen"]').click();
    result.screenCount = await page.locator('#cr-count').innerText();
    await page.locator('[data-sub="tv"]').click();
    result.tvCount = await page.locator('#cr-count').innerText();
    if (result.tvCount === result.screenCount) throw new Error('Screen type filter did not change results');
    await page.locator('[data-dom="music"]').click();
    await page.locator('#cr-chips button').nth(1).click();
    result.genreCount = await page.locator('#cr-count').innerText();
    if (result.genreCount === result.initialCount) throw new Error('Music genre filter did not change results');
    await page.locator('#cr-chips [data-g="all"]').click();
    await page.evaluate(() => {
      window.editorialCopied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.editorialCopied.push(text); } } });
    });
    await page.locator('#cr-copyall').click();
    await page.locator('#cr-batches button').first().click();
    result.copy = await page.evaluate(() => ({ lengths: window.editorialCopied.map(text => text.trim().split('\n').length), songs: JSON.parse(document.querySelector('#cr-music').textContent).length }));
    if (result.copy.lengths[0] !== result.copy.songs || result.copy.lengths[1] !== 200) throw new Error('Catalogue copy did not include the full list and first batch');
  }
  if (slug === 'get-used-to-everything') {
    const dots = page.locator('.tx-dot');
    const before = await dots.evaluateAll(elements => elements.map(element => ({ left: element.style.left, opacity: getComputedStyle(element).opacity })));
    if (before.length !== 6) throw new Error('Fixation demo lacks its six peripheral dots');
    // Shorten only this exercise's timeout to inspect its completion behavior.
    await page.evaluate(() => {
      const originalTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 30000 ? 350 : delay, ...args);
    });
    await page.locator('#tx-start').click();
    result.started = await page.locator('#tx-state').innerText();
    if (result.started !== 'Fixating: display unchanged') throw new Error('Fixation demo claims a perception result');
    await page.waitForFunction(() => document.querySelector('#tx-state').textContent === 'Time ended: display unchanged');
    const completed = await dots.evaluateAll(elements => elements.map(element => ({ left: element.style.left, opacity: getComputedStyle(element).opacity })));
    if (JSON.stringify(before) !== JSON.stringify(completed)) throw new Error('Fixation timer changed the stimulus');
    await page.locator('#tx-stage').dispatchEvent('mousemove');
    if (JSON.stringify(completed) !== JSON.stringify(await dots.evaluateAll(elements => elements.map(element => ({ left: element.style.left, opacity: getComputedStyle(element).opacity }))))) throw new Error('Pointer movement changed the fixation stimulus');
    await page.locator('#tx-reset').click();
    result.reset = await page.locator('#tx-state').innerText();
    const refreshed = await dots.evaluateAll(elements => elements.map(element => ({ left: element.style.left, opacity: getComputedStyle(element).opacity })));
    if (JSON.stringify(before) === JSON.stringify(refreshed) || result.reset !== 'Pattern refreshed') throw new Error('Refresh did not change the fixation stimulus');
    await page.locator('#tx-reset').click();
    if (JSON.stringify(before) !== JSON.stringify(await dots.evaluateAll(elements => elements.map(element => ({ left: element.style.left, opacity: getComputedStyle(element).opacity }))))) throw new Error('Second refresh did not recover the original pattern');
    result.stationaryStimulus = true;
    result.figures = await page.locator('figure.viz').count();
    if (result.figures !== 4) throw new Error('Adaptation guide lacks a retained conceptual figure');
  }
  if (slug === 'best-photographs') {
    await page.locator('#flip-canvas').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#flip-canvas');
      return canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] > 0;
    });
    await page.locator('#flip-play').click();
    result.flipState = await page.locator('#flip-play').getAttribute('aria-label');
    await page.locator('#flip-play').click();
    await page.locator('#flip-scrub').fill('7');
    await page.locator('#flip-scrub').dispatchEvent('input');
    result.flipFrame = await page.locator('#flip-frame').innerText();
    if (!result.flipFrame.includes('08')) throw new Error('Photographic flipbook did not scrub to its eighth frame');
    const ranges = page.locator('.ba input[type="range"]');
    result.comparisons = await ranges.count();
    for (let i = 0; i < result.comparisons; i++) {
      await ranges.nth(i).fill('25');
      await ranges.nth(i).dispatchEvent('input');
      const position = await ranges.nth(i).evaluate(element => element.closest('.ba').style.getPropertyValue('--pos'));
      if (position !== '25%') throw new Error('Photograph comparison slider did not move');
    }
    await page.locator('.zoomable img').first().click();
    result.lightboxOpened = await page.locator('#lb').evaluate(element => element.classList.contains('open'));
    await page.keyboard.press('Escape');
    if (!result.lightboxOpened || await page.locator('#lb').evaluate(element => element.classList.contains('open'))) throw new Error('Photograph lightbox did not open and close');
  }
  if (slug === 'the-number') {
    result.initial = await page.locator('#tn-num').innerText();
    await page.locator('#tn-want-n').fill('60000');
    await page.locator('#tn-want-n').dispatchEvent('change');
    await page.locator('#tn-want-n').blur();
    result.changed = await page.locator('#tn-num').innerText();
    if (result.initial === result.changed) throw new Error('Financial calculator did not respond to desired spending');
    const buttons = page.locator('[data-mult]');
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).click();
      (result.withdrawalOutputs ||= []).push(await page.locator('#tn-num').innerText());
    }
    if (new Set(result.withdrawalOutputs).size < 3) throw new Error('Withdrawal assumptions did not change target');
  }
  if (slug === 'nothing-new-under-the-sun') {
    async function expose(id) {
      const tool = page.locator('#' + id);
      await tool.evaluate(element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) { parent.open = true; parent.dataset.editorialProbeOpened = '1'; } });
      return tool;
    }
    await expose('almanac');
    const cases = page.locator('#alm-beads [role="button"]');
    result.almanacCases = await cases.count();
    if (result.almanacCases !== 4) throw new Error('Almanac lacks one of its four documented cases');
    for (let i=0;i<4;i++) {
      await cases.nth(i).click();
      if (await cases.nth(i).getAttribute('aria-pressed') !== 'true' || !await page.locator('#alm-card a').count()) throw new Error('Almanac case lacks its selected state or source');
    }
    await cases.nth(1).focus(); await page.keyboard.press('Enter');
    if (!(await page.locator('#alm-card').innerText()).includes('extensive remediation')) throw new Error('Almanac mislabels prevented Y2K failures');
    await expose('dials');
    result.emotionWords = await page.locator('#dp-choice option').count();
    await page.locator('#dp-choice').selectOption({ label: 'angry' });
    if (result.emotionWords !== 14 || await page.locator('#dr-near').innerText() !== 'angry') throw new Error('Illustrative affect map did not select its word');
    await expose('treadmill-tool');
    const patterns = page.locator('#tm-events button');
    result.adaptationPatterns = await patterns.count();
    const paths = [];
    for (let i=0;i<await patterns.count();i++) { await patterns.nth(i).click();paths.push(await page.locator('#tm-curve').getAttribute('d')); }
    if (result.adaptationPatterns !== 3 || new Set(paths).size !== 3) throw new Error('Illustrative adaptation patterns did not change the curve');
    await expose('wealth-tool');
    await page.locator('#wv-slider').fill('1000'); await page.locator('#wv-slider').dispatchEvent('input');
    result.incomeMaximum = await page.locator('#wv-wealth').innerText();
    if (result.incomeMaximum !== '$640,000' || !(await page.locator('#wealth-tool').innerText()).includes('no predicted happiness score')) throw new Error('Income illustration lost its logarithmic arithmetic or limits');
    await expose('goldenrule');
    const passages = page.locator('#gr-grid button');
    result.passages = await passages.count();
    for (let i=0;i<await passages.count();i++) {
      await passages.nth(i).click();
      if (!(await page.locator('#gr-card').innerText()).toLowerCase().includes('paraphrase') || !await page.locator('#gr-card a').count()) throw new Error('Religious passage lacks a paraphrase label or source');
    }
    if (result.passages !== 12) throw new Error('Religious selector lacks one of its twelve passages');
    await page.evaluate(() => document.querySelectorAll('details[data-editorial-probe-opened]').forEach(detail => { detail.open = false;delete detail.dataset.editorialProbeOpened; }));
  }
  if (slug === 'the-first-year') {
    result.charts = await page.locator('figure.viz[data-viz]').evaluateAll(figures => figures.map(figure => ({
      name: figure.dataset.viz, mounted: figure.dataset.mounted === '1',
      svg: figure.querySelectorAll('svg').length,
      labels: figure.querySelectorAll('svg text').length,
      focusable: figure.getAttribute('tabindex') === '0', regionName: figure.getAttribute('aria-label'),
      accessibleName: figure.querySelector('svg')?.getAttribute('aria-label')
    })));
    for (const chart of result.charts) {
      if (!chart.mounted || !chart.svg || !chart.labels || !chart.accessibleName || !chart.focusable || !chart.regionName) throw new Error('Infant chart lacks its mounted figure, labels or accessible description: ' + chart.name);
    }
    result.sourceComparisons = await page.evaluate(() => {
      const read = name => {
        const figure = document.querySelector('figure[data-viz="' + name + '"]');
        return {
          text: figure.textContent.replace(/\s+/g, ' ').trim(),
          accessibleName: figure.querySelector('svg').getAttribute('aria-label'),
          rows: [...figure.querySelectorAll('table.viz-data tbody tr')].map(row => [...row.cells].map(cell => cell.textContent.trim())),
          links: [...figure.querySelectorAll('.viz-note a')].map(link => link.href)
        };
      };
      return Object.fromEntries(['bf-duration', 'ppd-spectrum', 'paternal-ppd', 'paid-leave', 'infant-mortality', 'advice-pendulum', 'cryitout', 'colic-remedies', 'injury-age', 'leap', 'suid-cliff'].map(name => [name, read(name)]));
    });
    const compared = result.sourceComparisons;
    const values = name => compared[name].rows.map(row => parseFloat(row[1]));
    if (JSON.stringify(values('bf-duration')) !== '[85.7,62.1,40.8,27.9]') throw new Error('Breastfeeding comparison diverged from the dated CDC cohort');
    if (compared['bf-duration'].text.includes('1936') || compared['bf-duration'].rows.length !== 4) throw new Error('Unverified historical breastfeeding curve remains');
    if (JSON.stringify(values('ppd-spectrum')) !== '[13.2,9.7,23.5]' || !compared['ppd-spectrum'].text.includes('2018')) throw new Error('PRAMS symptom comparison lost its source estimates or year');
    if (JSON.stringify(values('paternal-ppd')) !== '[10.4,25.6]' || !compared['paternal-ppd'].text.includes('17.3 to 36.1')) throw new Error('Paternal depression comparison lost its intervals or source populations');
    if (compared['paid-leave'].rows.length !== 8 || compared['paid-leave'].text.includes('54.9') || !compared['paid-leave'].text.includes('average earnings')) throw new Error('Paid-leave comparison mixes calendar and full-rate-equivalent weeks');
    if (compared['infant-mortality'].text.includes('184.9') || compared['infant-mortality'].text.includes('near 140') || !compared['infant-mortality'].text.includes('separate period-linked')) throw new Error('Mortality chart retains an unsupported comparison');
    const initiatives = compared['advice-pendulum'].rows.map(row => row[0]);
    if (JSON.stringify(initiatives) !== '["1981","1991","1994"]' || !compared['advice-pendulum'].text.includes('uniform historical eras')) throw new Error('Advice timeline lost its limited historical scope');
    if (compared.cryitout.text.includes('0.80') || !compared.cryitout.text.includes('accessible abstract') || !compared.cryitout.text.includes('k=5')) throw new Error('Sleep-training figure overstates inaccessible numerical results');
    if (compared['colic-remedies'].rows.length !== 3 || !compared['colic-remedies'].text.includes('-46.4') || !compared['colic-remedies'].text.includes('107') || compared['colic-remedies'].text.includes('SOR')) throw new Error('Colic trial comparison lost its actual outcomes or denominator');
    const injuryCounts = compared['injury-age'].rows.map(row => row[2].replace(/,/g, ''));
    if (JSON.stringify(injuryCounts) !== '["3970","2884","1529","1354","1288","441","343","266"]' || compared['injury-age'].accessibleName.includes('85 percent')) throw new Error('Injury chart mixes age groups or retains the wrong suffocation denominator');
    if (!compared.leap.text.includes('wheals greater than 4') || !compared.leap.accessibleName.includes('497') || compared.leap.text.includes('reversed decades')) throw new Error('LEAP comparison lacks eligibility and follow-up limits');
    const suid2015 = compared['suid-cliff'].rows.find(row => row[0] === '2015');
    if (JSON.stringify(suid2015) !== '["2015","39.3","23.1","29.7","92.0"]' || !compared['suid-cliff'].text.includes('period-linked') || compared['suid-cliff'].accessibleName.includes('relabeling rather than fewer')) throw new Error('SUID figure loses published totals, source boundaries or inference limits');
    if (process.argv.includes('--figures')) {
      const originalOpen = await page.evaluate(() => [...document.querySelectorAll('details')].map(detail => detail.open));
      await page.evaluate(() => document.querySelectorAll('details').forEach(detail => detail.open = true));
      result.figureBounds = [];
      for (const name of result.charts.map(chart => chart.name)) {
        const svg = page.locator('figure[data-viz="' + name + '"] svg').first();
        await svg.scrollIntoViewIfNeeded();
        await svg.screenshot({ path: path.join(output, 'figure-' + page.viewportSize().width + '-' + name + '.png') });
        result.figureBounds.push(await svg.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return { name: element.closest('figure').dataset.viz, width: bounds.width, height: bounds.height, overflow: getComputedStyle(element).overflow,
            outside: [...element.querySelectorAll('text')].map(text => { const r=text.getBoundingClientRect();return { text:text.textContent,x:r.x-bounds.x,y:r.y-bounds.y,right:r.right-bounds.right,bottom:r.bottom-bounds.bottom }; }).filter(r=>r.x < -1 || r.y < -1 || r.right > 1 || r.bottom > 1) };
        }));
      }
      for (const bounds of result.figureBounds) if (bounds.outside.length) throw new Error('Chart text extends beyond its SVG: ' + bounds.name);
      if (page.viewportSize().width < 600) {
        const panel = page.locator('figure[data-viz="paid-leave"]');
        await panel.evaluate(element => element.scrollLeft = 0);
        await panel.focus();
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('figure[data-viz="paid-leave"]').scrollLeft > 20);
        result.keyboardChartScroll = await panel.evaluate(element => ({ left: element.scrollLeft, width: element.clientWidth, content: element.scrollWidth }));
        await panel.evaluate(element => element.scrollLeft = 0);
      }
      await page.evaluate(states => [...document.querySelectorAll('details')].forEach((detail, i) => detail.open = states[i]), originalOpen);
    }
    result.contents = await page.locator('#fy-toc-list a').count();
    if (!result.contents) throw new Error('Infant guide contents did not render');
    if (!await page.locator('#fy-toc-search').isVisible()) await page.locator('#fy-nav-toggle').click();
    await page.locator('#fy-toc-search').fill('sleep');
    await page.waitForFunction(() => document.querySelector('#fy-toc-count').textContent.trim().length > 0);
    result.filtered = await page.locator('#fy-toc-count').innerText();
    await page.locator('#fy-toc-search').fill('');
    if (await page.locator('#fy-nav-toggle').getAttribute('aria-expanded') === 'true' && await page.evaluate(() => innerWidth < 1100)) await page.locator('#fy-nav-toggle').click();
    async function openTool(name) {
      const tool = page.locator('[data-tool="' + name + '"]');
      await tool.evaluate(element => { for (let node = element.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; });
      return tool;
    }
    const dose = await openTool('dosing');
    await dose.locator('#dose-weight').fill('20');
    await dose.locator('#dose-age').fill('2');
    if (await dose.locator('.tool-out .big').count()) throw new Error('Dose shown for a baby under three months');
    await dose.locator('#dose-age').fill('8');
    if (await dose.locator('.tool-out .big').count()) throw new Error('Dose shown without clinician confirmation');
    await dose.locator('#dose-approved').check();
    result.acetaminophenMl = await dose.locator('.tool-out .big').innerText();
    if (result.acetaminophenMl !== '3.75 mL') throw new Error('Published acetaminophen band did not match 20 lb');
    await dose.locator('#dose-drug').selectOption('ibu');
    if (await dose.locator('.tool-out .big').count()) throw new Error('Ibuprofen shown without bottle strength');
    await dose.locator('#dose-conc').selectOption('infant');
    result.ibuprofenDrops = await dose.locator('.tool-out .big').innerText();
    await dose.locator('#dose-conc').selectOption('child');
    result.ibuprofenLiquid = await dose.locator('.tool-out .big').innerText();
    if (result.ibuprofenDrops !== '1.875 mL' || result.ibuprofenLiquid !== '3.75 mL') throw new Error('Ibuprofen strengths did not produce the published distinct volumes');
    await dose.locator('#dose-age').fill('5');
    if (await dose.locator('.tool-out .big').count()) throw new Error('Ibuprofen shown for a baby under six months');
    const ors = await openTool('ors');
    await ors.locator('#fy-ors-weight').fill('8');
    await ors.locator('#fy-ors-age').fill('8');
    if (await ors.locator('.tool-out .big').count()) throw new Error('ORS amount shown without a clinician-directed plan');
    await ors.locator('#fy-ors-approved').check();
    result.orsMl = await ors.locator('.tool-out .big').innerText();
    if (result.orsMl !== '600 mL') throw new Error('WHO Plan B arithmetic did not match 8 kg');
    await ors.getByRole('button', { name: 'lb', exact: true }).click();
    if (await ors.locator('.tool-out .big').innerText() !== result.orsMl) throw new Error('ORS unit conversion changed the plan');
    await ors.locator('#fy-ors-age').fill('2');
    if (await ors.locator('.tool-out .big').count()) throw new Error('ORS plan shown for a baby under three months');
    const growth = await openTool('growth');
    await growth.locator('[name="value"]').fill('7.3');
    result.growth = await growth.locator('.g-sub-line').innerText();
    if (!result.growth.includes('z-score')) throw new Error('Growth percentile did not render');
    await growth.locator('[name="early"]').check();
    await growth.locator('[name="weeksEarly"]').fill('17');
    await growth.locator('[name="weeksEarly"]').fill('8');
    if (!(await growth.locator('.tool-out').innerText()).includes('corrected age')) throw new Error('Growth output did not recover after invalid weeks early');
    await growth.locator('[name="age"]').fill('1');
    if (!(await growth.locator('.tool-out').innerText()).includes('Before the due date')) throw new Error('Growth tool extrapolated a term chart before the due date');
    const vaccine = await openTool('vaccine-timeline');
    await vaccine.locator('#fy-vt-date').fill('2026-01-31');
    result.vaccineCalendar = await vaccine.locator('.tool-out').innerText();
    const twoMonthVisit = await page.evaluate(() => new Date(2026, 2, 31).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
    if (!result.vaccineCalendar.includes(twoMonthVisit)) throw new Error('Vaccine visit did not preserve calendar months');
    await vaccine.locator('#fy-vt-country').selectOption('UK');
    if (!(await vaccine.locator('.tool-out').innerText()).includes('Official schedule source')) throw new Error('Country schedule source is missing');
    await vaccine.getByRole('button', { name: 'Clear date', exact: true }).click();
    if (await vaccine.locator('#fy-vt-date').inputValue()) throw new Error('Vaccine timeline clear did not reset the date');
    result.vaccineCalendar = result.vaccineCalendar.slice(0, 120);
    const matrix = await openTool('wellbaby-matrix');
    const programmes = await matrix.locator('#fy-matrix-country option').evaluateAll(options => options.map(option => ({ key: option.value, name: option.textContent })));
    result.programmes = programmes.length - 1;
    result.programmeSources = await matrix.locator('tbody a').count();
    if (result.programmes !== 12 || result.programmeSources !== 21) throw new Error('Well-child comparison lacks its 12 named programmes or 21 official sources');
    for (const programme of programmes.filter(option => option.key)) {
      await matrix.locator('#fy-matrix-country').selectOption(programme.key);
      const highlighted = matrix.locator('tbody tr.hl');
      if (await highlighted.count() !== 1 || await highlighted.getAttribute('data-programme') !== programme.key) throw new Error('Well-child programme selector highlighted a different jurisdiction');
      if (!(await matrix.locator('.tool-out').innerText()).startsWith(programme.name + ':') || !await matrix.locator('.tool-out a').count()) throw new Error('Selected well-child programme lacks matching detail and direct sources');
    }
    await matrix.locator('#fy-matrix-country').selectOption('');
    if (await matrix.locator('tbody tr.hl').count()) throw new Error('Well-child programme reset left a highlighted jurisdiction');
  }
  const disclosure = page.locator('main details > summary:visible, article details > summary:visible').first();
  if (await disclosure.count()) {
    await disclosure.click();
    result.disclosureOpened = await disclosure.evaluate(element => element.parentElement.open);
    await disclosure.click();
    if (!result.disclosureOpened) throw new Error('Reference disclosure did not open');
  }
  return result;
}
(async () => {
  try {
    for (const post of posts) inspectScripts(post);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', args: ['--enable-unsafe-webgpu'] });
    for (const viewport of [{ width: 1365, height: 900 }, { width: 375, height: 812 }]) {
      for (const post of posts) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        const errors = [], missing = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:') && response.status() >= 400) missing.push(response.url()); });
        await page.route('**/www.googletagmanager.com/**', route => route.abort());
        let record;
        try {
          await page.goto('http://127.0.0.1:' + server.address().port + '/' + post.file, { waitUntil: 'load', timeout: 60000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(650);
          record = await page.evaluate(() => {
            const title = document.querySelector('h1');
            const hero = document.querySelector('.editorial-hero');
            const h = hero && hero.getBoundingClientRect();
            const t = title && title.getBoundingClientRect();
            const style = title && getComputedStyle(title);
            const heroStyle = hero && getComputedStyle(hero);
            return {
              title: document.title.trim(), h1: title && title.textContent.replace(/\s+/g, ' ').trim(),
              ogTitle: document.querySelector('meta[property="og:title"]')?.content,
              h1Count: document.querySelectorAll('h1').length,
              hasBanner: !!document.querySelector('.arc-banner'), hasEditorialHero: !!hero,
              scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
              hero: h && { x: h.x, width: h.width, height: h.height, center: h.x + h.width / 2 },
              heroContentLeft: h && h.x + parseFloat(heroStyle.paddingLeft),
              heroContentRight: h && innerWidth - h.right + parseFloat(heroStyle.paddingRight),
              titleBox: t && { x: t.x, width: t.width, center: t.x + t.width / 2 },
              titleStyle: style && { fontSize: style.fontSize, lineHeight: style.lineHeight, fontFamily: style.fontFamily, textAlign: style.textAlign },
              gutter: getComputedStyle(document.documentElement).getPropertyValue('--gutter').trim(),
              brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].map(link => link.getAttribute('href')).filter(href => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))),
              heroOpacity: hero && getComputedStyle(hero).opacity,
              images: document.images.length, canvases: document.querySelectorAll('canvas').length
            };
          });
          record.slug = post.slug;
          record.viewport = viewport;
          if (record.h1Count !== 1) fail(post.slug, viewport.width, 'Expected exactly one h1');
          if (record.h1 !== record.title || record.ogTitle !== record.title) fail(post.slug, viewport.width, 'Document, visible and social titles disagree');
          if (!record.hasBanner) fail(post.slug, viewport.width, 'Archive notice missing');
          if (record.scrollWidth > viewport.width + 1) fail(post.slug, viewport.width, 'Horizontal page overflow');
          if (!baseline && !record.hasEditorialHero) fail(post.slug, viewport.width, 'Shared religious-post hero missing');
          if (!baseline && record.heroOpacity !== '1') fail(post.slug, viewport.width, 'Opening remains hidden with reduced motion');
          if (!baseline) record.brokenAnchors.forEach(href => fail(post.slug, viewport.width, 'Broken in-page anchor: ' + href));
          if (!baseline && record.hero && Math.abs(record.hero.center - record.titleBox.center) > 2) fail(post.slug, viewport.width, 'Title is not centered in its hero');
          if (!baseline && viewport.width === 375 && (Math.abs(record.heroContentLeft - 20) > 1 || Math.abs(record.heroContentRight - 20) > 1)) fail(post.slug, viewport.width, 'Phone hero gutter differs from the site 20px gutter');
          await page.screenshot({ path: path.join(output, post.slug + '-' + viewport.width + (baseline ? '-before' : '-after') + '.png') });
          if (!baseline && record.hasEditorialHero) await page.locator('.editorial-hero').screenshot({ path: path.join(output, post.slug + '-' + viewport.width + '-hero.png') });
          try { record.interactions = await probe(page, post.slug); }
          catch (error) { record.interactionError = error.message; fail(post.slug, viewport.width, error.message); }
          record.afterInteractionScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          if (record.afterInteractionScrollWidth > viewport.width + 1) fail(post.slug, viewport.width, 'Horizontal page overflow after interacting');
          record.errors = errors;
          record.missing = [...new Set(missing)];
          errors.forEach(error => fail(post.slug, viewport.width, error));
          record.missing.forEach(url => fail(post.slug, viewport.width, 'Local resource failed: ' + url));
          report.posts.push(record);
          console.log(JSON.stringify({ slug: post.slug, viewport: viewport.width, title: record.title, errors: errors.length, missing: record.missing.length }));
        } catch (error) { fail(post.slug, viewport.width, error.message); }
        finally { await page.close(); }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, baseline ? 'baseline.json' : 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ checked: report.posts.length, failures: report.failures.length, report: output }));
  if (!baseline && report.failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
