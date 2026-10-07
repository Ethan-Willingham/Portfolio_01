#!/usr/bin/env node
// A mechanical review sheet: real image files rendered at exactly 336 CSS px.
// No image generation, cropping, filtering, catalogue edits, or publication.
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SIDE = 336;
const COLUMNS = 5;
const GAP = 20;
const PADDING = 32;
const pad = value => String(value).padStart(3, '0');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function usage() {
  console.log(`Build faithful Slop review images from the local artwork files.

  node tools/slop-contact-sheet.cjs --end 035
  node tools/slop-contact-sheet.cjs --end 044
  node tools/slop-contact-sheet.cjs --single 035

Options:
  --start N       First work on a contact sheet (default 025).
  --end N         Last work on a contact sheet (default 044; at most 50 works).
  --single N      Save an image-only 336 x 336 preview, plus labelled HTML.
  --prompts PATH  Prompt pack used for titles not yet in slop-data.js.
  --title TEXT    Explicit title for --single when no title is recorded yet.
  --help         Show this help.

Sheets always have five columns and 336 x 336 image squares. Labels sit outside
the art. Missing files are omitted and listed in the sheet and terminal output.
Single-work mode requires its image to exist. Outputs are written beneath
research/slop/review/. The script never edits source images or catalogue data.`);
}

function parseArgs() {
  const options = { start: 25, end: 44, single: null, prompts: null, title: null };
  const supplied = new Set();
  for (let index = 2; index < process.argv.length; index += 1) {
    const flag = process.argv[index];
    if (flag === '--help' || flag === '-h') { usage(); return null; }
    if (!['--start', '--end', '--single', '--prompts', '--title'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = process.argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    const key = flag.slice(2);
    supplied.add(key);
    if (['start', 'end', 'single'].includes(key)) {
      if (!/^\d{1,3}$/.test(value) || Number(value) < 1) throw new Error(`${flag} requires a work number from 001 to 999.`);
      options[key] = Number(value);
    } else options[key] = value;
  }
  if (options.single !== null && (supplied.has('start') || supplied.has('end'))) throw new Error('Use either --single or --start/--end.');
  if (options.title && options.single === null) throw new Error('--title applies only to --single.');
  if (options.single === null && (options.end < options.start || options.end - options.start >= 50)) throw new Error('A contact sheet must request 1 to 50 consecutive works.');
  return options;
}

function readTitles(options) {
  const titles = new Map();
  const promptFile = options.prompts ? path.resolve(options.prompts) : path.join(root, 'research/slop/NEXT_PROMPTS.md');
  if (options.prompts && !fs.existsSync(promptFile)) throw new Error(`Prompt pack not found: ${promptFile}`);
  if (fs.existsSync(promptFile)) {
    const pack = fs.readFileSync(promptFile, 'utf8');
    const group = pack.split(/^## Third group[^\n]*\n/m)[1]?.split(/^## Fourth group/m)[0] || '';
    for (const heading of group.matchAll(/^###\s+(\d+)\.\s+(.+)$/gm)) {
      const sequence = Number(heading[1]);
      if (sequence >= 1 && sequence <= 50) titles.set(pad(sequence + 34), heading[2].trim());
    }
  }
  const catalogueFile = path.join(root, 'js/slop-data.js');
  const source = fs.readFileSync(catalogueFile, 'utf8');
  const assignment = source.match(/window\.SLOP_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!assignment) throw new Error('slop-data.js must contain its normal strict JSON assignment.');
  const catalogue = JSON.parse(assignment[1]);
  const phrases = new Map((catalogue.phrases || []).map(phrase => [phrase.id, phrase.text]));
  for (const work of catalogue.works || []) {
    const title = work.title || phrases.get(work.phraseId);
    if (title) titles.set(String(work.id).padStart(3, '0'), title);
  }
  if (options.title) titles.set(pad(options.single), options.title);
  return titles;
}

function selectWorks(options, titles) {
  const start = options.single ?? options.start;
  const end = options.single ?? options.end;
  const works = [];
  const missing = [];
  for (let number = start; number <= end; number += 1) {
    const id = pad(number);
    const image = ['jpg', 'webp', 'png'].map(extension => `assets/slop/${id}.${extension}`).find(relative => fs.existsSync(path.join(root, relative)));
    if (!image) { missing.push(id); continue; }
    const title = titles.get(id);
    if (!title) throw new Error(`No title is recorded for ${id}. Add --prompts PATH, or use --single ${id} --title TEXT.`);
    works.push({ id, title, image });
  }
  if (!works.length) throw new Error(`No artwork files exist for the requested range ${pad(start)} to ${pad(end)}.`);
  if (options.single !== null && missing.length) throw new Error(`Artwork ${pad(options.single)} does not exist yet.`);
  return { works, missing, start, end };
}

function makeHtml(selection, single) {
  const { works, missing, start, end } = selection;
  const title = single ? `Slop / work ${pad(start)}` : `Slop / works ${pad(start)} to ${pad(end)}`;
  const columns = single ? 1 : COLUMNS;
  const width = columns * SIDE + (columns - 1) * GAP + PADDING * 2;
  const cards = works.map(work => `<figure class="review-card" data-work="${work.id}">
    <img src="../../../${escapeHtml(work.image)}" width="${SIDE}" height="${SIDE}" loading="eager" decoding="async" alt="${escapeHtml(work.title)}">
    <figcaption><span class="review-number">${work.id}</span><span class="review-title">${escapeHtml(work.title)}</span></figcaption>
  </figure>`).join('\n');
  return { width, html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="../../../style.css">
  <style>
    html { scroll-behavior: auto; }
    body { width: ${width}px; min-width: ${width}px; margin: 0; padding: ${PADDING}px; color: var(--text); background: var(--bg); font-family: var(--font-body); }
    .review-header { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin: 0 0 26px; }
    .review-header h1 { font: 30px/1.2 var(--font-heading); font-weight: 400; letter-spacing: -.02em; }
    .review-header p { color: var(--text-dim); font: 11px/18px var(--font-mono); white-space: nowrap; }
    .review-grid { display: grid; grid-template-columns: repeat(${columns}, ${SIDE}px); gap: 20px ${GAP}px; align-items: start; }
    .review-card { margin: 0; width: ${SIDE}px; }
    .review-card img { display: block; width: ${SIDE}px; height: ${SIDE}px; max-width: none; object-fit: contain; border: 0; border-radius: 0; filter: none; }
    .review-card figcaption { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 9px; padding: 10px 0 0; min-height: 56px; }
    .review-number { color: var(--text-faint); font: 11px/20px var(--font-mono); }
    .review-title { color: var(--text); font: 15px/20px var(--font-body); }
    .review-footer { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--rule); color: var(--text-dim); font: 11px/1.65 var(--font-mono); }
    ${single ? '.review-header { display: block; } .review-header p { margin-top: 10px; }' : ''}
  </style>
</head>
<body>
  <header class="review-header"><h1>${escapeHtml(title)}</h1><p>${works.length} ${works.length === 1 ? 'image' : 'images'} / 336 x 336 px each</p></header>
  <main class="review-grid" aria-label="Artwork review contact sheet">${cards}</main>
  <footer class="review-footer">Source images only. No cropping, filters, or changes to the artwork.${missing.length ? `<br>Not present yet: ${missing.map(escapeHtml).join(', ')}.` : ''}</footer>
</body>
</html>
` };
}

async function render(options, selection, outputFile, width) {
  let playwright;
  try { playwright = require('playwright'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  let cleanupPromise;
  const cleanup = () => cleanupPromise ||= (async () => {
    try { await browser?.close(); }
    finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
  })();
  const signals = ['SIGINT', 'SIGTERM'].map(signal => {
    const handler = () => cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    process.once(signal, handler);
    return [signal, handler];
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await playwright.chromium.launch({ headless: true, executablePath: path.join(os.homedir(), '.local/bin/agent-chrome-for-testing') });
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    const urlPath = path.relative(root, outputFile).split(path.sep).map(encodeURIComponent).join('/');
    await page.goto(`http://127.0.0.1:${server.address().port}/${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.locator('.review-card img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.map(image => ({ id: image.closest('figure').dataset.work, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight }));
    });
    for (const image of geometry) {
      if (image.width !== SIDE || image.height !== SIDE) throw new Error(`Work ${image.id} is not displayed at exactly ${SIDE}px square.`);
      if (!image.sourceWidth || image.sourceWidth !== image.sourceHeight) throw new Error(`Work ${image.id} is missing or not square; review its source before making a sheet.`);
    }
    if (geometry.length !== selection.works.length) throw new Error('The rendered image count does not match the selected work count.');
    if (errors.length) throw new Error(errors.join('\n'));
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const pngFile = outputFile.replace(/\.html$/, '.png');
    if (options.single !== null) await page.locator('.review-card img').screenshot({ path: pngFile, animations: 'disabled' });
    else await page.screenshot({ path: pngFile, fullPage: true, animations: 'disabled' });
    const png = fs.readFileSync(pngFile);
    const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    if (options.single !== null && (dimensions.width !== SIDE || dimensions.height !== SIDE)) throw new Error('Single-work PNG dimensions are not exactly 336 x 336.');
    console.log(JSON.stringify({ png: pngFile, html: outputFile, dimensions, imageSize: SIDE, columns: options.single !== null ? 1 : COLUMNS, works: selection.works.map(work => ({ id: work.id, title: work.title, source: work.image })), missing: selection.missing }, null, 2));
  } finally {
    await cleanup();
    for (const [signal, handler] of signals) process.removeListener(signal, handler);
  }
}

(async () => {
  const options = parseArgs();
  if (!options) return;
  const selection = selectWorks(options, readTitles(options));
  const { width, html } = makeHtml(selection, options.single !== null);
  const outputDirectory = path.join(root, 'research/slop/review');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const baseName = options.single !== null ? `work-${pad(options.single)}-at-336` : `contact-sheet-${pad(selection.start)}-${pad(selection.end)}`;
  const htmlFile = path.join(outputDirectory, `${baseName}.html`);
  fs.writeFileSync(htmlFile, html);
  await render(options, selection, htmlFile, width);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
