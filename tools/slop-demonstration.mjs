#!/usr/bin/env node
// Record nine sequential image calls, then assemble their full images with code.
// This tool never calls an image model or changes a generation prompt.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, mkdtempSync, rmSync, renameSync, createReadStream } from 'node:fs';
import { resolve, dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const keys = ['words', 'evidence', 'medium', 'cringe', 'guardrails', 'batch'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function readData(file) {
  const source = readFileSync(file, 'utf8');
  const assignment = source.match(/window\.SLOP_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!assignment) throw Error('The catalogue must contain its strict JSON assignment.');
  return { source, data: JSON.parse(assignment[1]) };
}

function writeData(file, data, originalSource) {
  if (readFileSync(file, 'utf8') !== originalSource) throw Error('The catalogue changed during this operation. Reconcile the new files before retrying.');
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, '/* Slop: authored catalogue and recorded production data. */\nwindow.SLOP_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}

function dimensions(file) {
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!width || !height) throw Error('Could not read source image dimensions.');
  return { width, height };
}

function sourceExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'jpg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw Error('Expected a PNG, JPEG or WebP source image.');
}

function derivatives(source, directory) {
  const fallback = join(directory, 'image.jpg');
  const image = join(directory, 'image.webp');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '91', source, '--out', fallback], { stdio: 'pipe' });
  execFileSync('cwebp', ['-quiet', '-q', '86', source, '-o', image], { stdio: 'pipe' });
  return { image, fallback };
}

function installPair(root, converted, image, fallback) {
  mkdirSync(dirname(join(root, image)), { recursive: true });
  copyFileSync(converted.image, join(root, image));
  copyFileSync(converted.fallback, join(root, fallback));
}

function validateRuns(work) {
  const runs = work.generation.sourceRuns;
  if (!Array.isArray(runs) || runs.length > 9 || work.generation.attempts !== runs.length) throw Error('The source call count must match the demonstration records.');
  runs.forEach((run, index) => {
    if (run.number !== index + 1 || run.prompt !== work.originalPrompt) throw Error('Keep every unchanged source prompt in generation order.');
    if (index < runs.length - 1 && !run.review) throw Error('Every earlier source must be reviewed before another is recorded.');
  });
  return runs;
}

async function assemble(root, work, output) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
  const mime = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  const server = createServer((request, response) => {
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw Error('Missing asset');
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(path).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  let cleanupPromise;
  const cleanup = () => cleanupPromise ||= (async () => {
    try { await browser?.close(); }
    finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
  })();
  const handlers = ['SIGINT', 'SIGTERM'].map(signal => {
    const handler = () => cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    process.once(signal, handler);
    return [signal, handler];
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const images = work.generation.sourceRuns.map(run => `<img data-run="${run.number}" src="${origin}/${run.source.split('/').map(encodeURIComponent).join('/')}" alt="" draggable="false">`).join('');
    browser = await playwright.chromium.launch({ executablePath: join(homedir(), '.local/bin/agent-chrome-for-testing'), headless: true });
    const page = await browser.newPage({ viewport: { width: 1536, height: 1536 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} while loading the assembly.`); });
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="${origin}/style.css"><style>
      html, body { margin:0; padding:0; width:1536px; height:1536px; overflow:hidden; }
      #sheet { box-sizing:border-box; width:1536px; height:1536px; background:var(--text-bright, #f5f1ea); color:var(--bg, #303931); }
      #images { display:grid; grid-template-columns:repeat(3,448px); grid-template-rows:repeat(3,448px); width:1344px; height:1344px; margin:0 auto; }
      #images img { display:block; width:448px; height:448px; max-width:none; object-fit:contain; border:0; border-radius:0; filter:none; }
      #caption { box-sizing:border-box; height:192px; padding:8px 64px; display:flex; align-items:center; justify-content:center; text-align:center; }
      #caption span { font:400 76px/1.08 var(--font-body, sans-serif); letter-spacing:0; }
    </style></head><body><div id="sheet"><div id="images">${images}</div><div id="caption"><span>${escapeHtml(work.title)}</span></div></div></body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('#images img')];
      await Promise.all(images.map(image => image.decode()));
      const caption = document.querySelector('#caption span').getBoundingClientRect();
      const band = document.querySelector('#caption').getBoundingClientRect();
      return { loaded: images.length === 9 && images.every(image => image.complete && image.naturalWidth > 0), order: images.map(image => Number(image.dataset.run)), captionFits: caption.top >= band.top && caption.bottom <= band.bottom && caption.left >= band.left && caption.right <= band.right };
    });
    if (!result.loaded || result.order.some((number, index) => number !== index + 1) || !result.captionFits || errors.length) throw Error('The code grid did not render every full source and its caption correctly. ' + errors.join(' '));
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    await page.locator('#sheet').screenshot({ path: output, animations: 'disabled' });
    const png = readFileSync(output);
    if (png.readUInt32BE(16) !== 1536 || png.readUInt32BE(20) !== 1536) throw Error('The assembly must be a 1536-pixel square.');
  } finally {
    await cleanup();
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }
}

export async function main(args = process.argv.slice(2), root = projectRoot) {
  if (args.includes('--help')) return { usage: 'slop-demonstration.mjs --id NNN [--plan PATH] (--source PATH --request JSON | --review JSON | --assemble --notes JSON)', notes: 'Requests contain the exact bare prompt. Reviews contain all six checks. Assembly notes contain observation and alt. Record and review nine sources in order; never reroll them.' };
  const opt = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const id = opt('--id');
  if (!/^\d{3}$/.test(id || '')) throw Error('Supply --id NNN.');
  const modes = ['--source', '--review', '--assemble'].filter(flag => args.includes(flag));
  if (modes.length !== 1) throw Error('Choose exactly one source import, review, or code assembly.');
  const file = join(root, 'js/slop-data.js');
  const { source: originalSource, data } = readData(file);
  let work = data.works.find(entry => entry.id === id);
  if (work?.generation.status === 'retired') throw Error('Retired works must remain retired.');
  const plan = JSON.parse(readFileSync(resolve(opt('--plan') || join(root, 'research/slop/groups-04-10-plan.json')), 'utf8')).plan.find(entry => entry.id === id);
  if (plan?.kind !== 'demonstration-grid' || plan.expectedRuns !== 9) throw Error('This work must be a planned nine-run demonstration.');
  if (work && work.generation.kind !== 'demonstration-grid') throw Error('An ordinary work cannot become a demonstration.');
  if (!work && modes[0] !== '--source') throw Error('Import the first source before reviewing or assembling.');
  if (!work) {
    if (!data.phrases.some(entry => entry.id === plan.phraseId)) data.phrases.push({ id: plan.phraseId, text: plan.title });
    if (!data.styles.some(entry => entry.id === plan.styleId)) data.styles.push(plan.style);
    work = { id, phraseId: plan.phraseId, title: plan.title, styleId: plan.styleId, group: plan.group, alt: '', image: null, fallback: null, width: null, height: null, prompt: plan.prompt, originalPrompt: plan.prompt,
      generation: { kind: 'demonstration-grid', expectedRuns: 9, provider: 'OpenAI built-in image tool', model: null, status: 'reviewing', attempts: 0, usage: null, costUsd: null, sourceRuns: [], sourceSha256: null, assembly: null } };
    data.works.push(work);
  }
  if (work.prompt !== plan.prompt || work.originalPrompt !== plan.prompt) throw Error('The demonstration prompt must remain exactly as planned.');
  const runs = validateRuns(work);
  if (modes[0] === '--source') {
    if (runs.length >= 9) throw Error('All nine outputs are already recorded. Demonstrations are not rerolled.');
    const pending = data.works.flatMap(entry => entry.generation.sourceRuns || entry.generation.attemptLog || []).find(entry => !entry.review && !entry.legacy && !entry.deletedAt);
    if (pending) throw Error('Review the preceding generated source before recording another.');
    const request = JSON.parse(readFileSync(resolve(opt('--request')), 'utf8'));
    if (request.prompt !== plan.prompt) throw Error('Run the bare demonstration prompt verbatim, with nothing added.');
    if (request.referenceAttempt !== undefined) throw Error('Demonstration sources must not reference an earlier result.');
    const input = resolve(opt('--source'));
    const bytes = readFileSync(input);
    const extension = sourceExtension(bytes);
    const size = dimensions(input);
    const number = runs.length + 1;
    const stamp = `${id}-${String(number).padStart(2, '0')}`;
    const base = `assets/slop/demonstrations/${id}`;
    const source = `${base}/${stamp}-source.${extension}`;
    const image = `${base}/${stamp}.webp`, fallback = `${base}/${stamp}.jpg`;
    if ([source, image, fallback].some(path => existsSync(join(root, path)))) throw Error('Source assets already exist; never overwrite a recorded run.');
    const temporary = mkdtempSync(join(tmpdir(), 'slop-demo-import-'));
    try {
      const converted = derivatives(input, temporary);
      mkdirSync(join(root, base), { recursive: true });
      copyFileSync(input, join(root, source));
      installPair(root, converted, image, fallback);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    runs.push({ number, prompt: request.prompt, change: 'Unedited sequential demonstration run; the prompt is unchanged.', provider: 'OpenAI built-in image tool', model: null, usage: null, costUsd: null, source, image, fallback, ...size, sourceSha256: hash(bytes), recordedAt: new Date().toISOString(), review: null, decision: 'pending' });
    Object.assign(work.generation, { attempts: runs.length, status: 'reviewing' });
  } else if (modes[0] === '--review') {
    const run = runs.at(-1);
    if (!run || run.review) throw Error('Import an unreviewed source first.');
    const review = JSON.parse(readFileSync(resolve(opt('--review')), 'utf8'));
    if (!keys.every(key => typeof review.checks?.[key]?.pass === 'boolean' && text(review.checks[key].note))) throw Error('Record all six checks with boolean results and nonempty notes.');
    run.review = { checks: Object.fromEntries(keys.map(key => [key, { pass: review.checks[key].pass, note: review.checks[key].note }])), reviewedAt: new Date().toISOString() };
    run.decision = 'recorded';
    if (text(review.alt)) run.alt = review.alt;
  } else {
    if (work.generation.assembly) throw Error('The grid is already assembled. Its source records must remain unchanged.');
    if (runs.length !== 9 || runs.some(run => !run.review || run.decision !== 'recorded')) throw Error('Record and review all nine sources before assembling.');
    for (const run of runs) if (hash(readFileSync(join(root, run.source))) !== run.sourceSha256) throw Error(`Source ${run.number} no longer matches its recorded bytes.`);
    const notes = JSON.parse(readFileSync(resolve(opt('--notes')), 'utf8'));
    if (!text(notes.observation) || !text(notes.alt)) throw Error('Assembly notes need an observation of the nine actual outputs and an alt description.');
    const temporary = mkdtempSync(join(tmpdir(), 'slop-demo-grid-'));
    const source = `assets/slop/demonstrations/${id}/${id}-grid.png`;
    const image = `assets/slop/${id}.webp`, fallback = `assets/slop/${id}.jpg`;
    try {
      const png = join(temporary, 'grid.png');
      await assemble(root, work, png);
      const converted = derivatives(png, temporary);
      copyFileSync(png, join(root, source));
      installPair(root, converted, image, fallback);
      const sourceSha256 = hash(readFileSync(png));
      const recordedAt = new Date().toISOString();
      work.generation.assembly = { method: 'code', columns: 3, rows: 3, caption: work.title, sourceRunNumbers: runs.map(run => run.number), fit: 'contain', cellSize: 448, source, sourceSha256, recordedAt, script: 'tools/slop-demonstration.mjs', scriptSha256: hash(readFileSync(scriptPath)), observation: notes.observation, note: 'Code arranged all nine full source images in creation order, with contain scaling and a plain caption band. No source was cropped, retouched, replaced or rerolled.' };
      Object.assign(work, { image, fallback, width: 1536, height: 1536, alt: notes.alt });
      Object.assign(work.generation, { status: 'complete', sourceSha256, recordedAt });
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  writeData(file, data, originalSource);
  return { id, attempts: work.generation.attempts, reviewed: runs.filter(run => run.review).length, status: work.generation.status, assembled: Boolean(work.generation.assembly) };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
