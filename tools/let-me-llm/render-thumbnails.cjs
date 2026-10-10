#!/usr/bin/env node
// Render the wordless artwork with this process's own Chrome for Testing.
// Run: node tools/let-me-llm/render-thumbnails.cjs [evidence-directory] [--homepage-only]
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const root = path.resolve(__dirname, '../..');
const shareSource = path.join(__dirname, 'thumbnail-lab.html');
const homeSource = path.join(__dirname, 'homepage-thumbnail.html');
const assets = path.join(root, 'assets/thumbs');
const evidence = path.resolve(process.argv[2] || '/Users/ethan/Portfolio_01/research/let-me-llm/evidence/integration');
const report = { sources: [homeSource, shareSource].map(file => path.relative(root, file)), browser: '/Users/ethan/.local/bin/agent-chrome-for-testing', checks: [], errors: [], images: [] };
let browser;

function recordImage(file, width, height) {
  const bytes = fs.readFileSync(file);
  report.images.push({ file: path.relative(root, file), width, height, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}

async function render(width, height, suffix, source) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => report.errors.push(`Unexpected request: ${request.url()}`));
  try {
    await page.setContent(fs.readFileSync(source, 'utf8'));
    const state = await page.evaluate(() => {
      const composer = document.querySelector('.composer');
      const send = document.querySelector('.send');
      const pointer = document.querySelector('.pointer');
      const s = send.getBoundingClientRect();
      const p = pointer.getBoundingClientRect();
      return { text: document.body.innerText.trim(), composerRadius: getComputedStyle(composer).borderRadius, sendRadius: getComputedStyle(send).borderRadius, background: getComputedStyle(document.body).backgroundColor, pointerOnSend: p.left + 3 >= s.left && p.left + 3 <= s.right && p.top + 2 >= s.top && p.top + 2 <= s.bottom };
    });
    const homepage = source === homeSource;
    assert.deepEqual(state, { text: '', composerRadius: '26px', sendRadius: '12px', background: homepage ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)', pointerOnSend: true });
    const basename = `let-me-llm-that-for-you${suffix}`;
    const jpg = path.join(assets, basename + '.jpg');
    await page.screenshot({ path: jpg, type: 'jpeg', quality: 92 });
    await page.screenshot({ path: path.join(evidence, basename + '.png') });
    recordImage(jpg, width, height);
    if (homepage) {
      const webp = path.join(assets, basename + '.webp');
      execFileSync('cwebp', ['-quiet', '-q', '90', jpg, '-o', webp]);
      recordImage(webp, width, height);
    }
    report.checks.push(`${width}x${height}: wordless ${homepage ? 'dark chat with question bubble and thinking bars' : 'light composer'}, 26px composer radius, 12px send radius, pointer on send`);
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  try {
    browser = await playwright.chromium.launch({ headless: true, executablePath: report.browser });
    await render(600, 400, '-tool', homeSource);
    if (!process.argv.includes('--homepage-only')) await render(1200, 630, '-og', shareSource);
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log('Rendered wordless homepage JPG/WebP' + (process.argv.includes('--homepage-only') ? '.' : ' and OG JPG.'));
  } catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    throw error;
  } finally {
    await browser?.close();
    fs.writeFileSync(path.join(evidence, 'thumbnail-render-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
