#!/usr/bin/env node
/*
  build-webp.mjs - generate .webp siblings for every jpg/png that the site's
  HTML actually references via <img src> or <picture><source srcset>.

  Driven by real references (not a blind asset walk) so it never wastes work on
  og: share images, favicons, or the gitignored zoom-src masters. Idempotent:
  skips a file whose .webp already exists and is newer than the source.

  Quality: photos (jpg) at q82, which is visually lossless at display sizes and
  cuts ~55-70% of the bytes; PNGs (usually diagrams/screenshots with text) get
  lossless when small, q90 when large, to keep edges crisp.

  Usage:  node tools/build-webp.mjs            # convert what's missing/stale
          node tools/build-webp.mjs --force    # rebuild every referenced webp
          node tools/build-webp.mjs --dry      # list what would convert
  Requires cwebp on PATH (brew install webp).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'assets', 'js', 'tools', 'docs', 'research']);
// Throwaway / dev chooser pages: not shipped content, don't convert their imgs.
const SKIP_HTML = /(-lab\.html$|^post-builder\.html$|^blog-edit\.html$)/;

function walkHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkHtml(path.join(dir, e.name), acc); }
    else if (e.name.endsWith('.html') && !SKIP_HTML.test(e.name)) acc.push(path.join(dir, e.name));
  }
  return acc;
}

function resolveRef(htmlFile, ref) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) return null;
  const clean = ref.split('?')[0].split('#')[0];
  return clean.startsWith('/') ? path.join(ROOT, clean) : path.join(path.dirname(htmlFile), clean);
}

// Collect every referenced raster source across all shipped HTML.
const refs = new Set();
for (const html of walkHtml(ROOT)) {
  const txt = fs.readFileSync(html, 'utf8');
  for (const m of txt.matchAll(/<img\b[^>]*?(?<![-\w])src="([^"]+)"/gi)) maybeAdd(html, m[1]);
  for (const m of txt.matchAll(/\bsrcset="([^"]+)"/gi)) {
    for (const cand of m[1].split(',')) maybeAdd(html, cand.trim().split(/\s+/)[0]);
  }
}
function maybeAdd(html, ref) {
  const clean = ref.split('?')[0].split('#')[0]; // drop cache-buster / fragment
  if (!/\.(jpe?g|png)$/i.test(clean)) return;
  const abs = resolveRef(html, decodeURI(clean));
  if (abs && fs.existsSync(abs)) refs.add(abs);
}

const todo = [...refs].filter((src) => {
  const webp = src.replace(/\.(jpe?g|png)$/i, '.webp');
  if (FORCE) return true;
  if (!fs.existsSync(webp)) return true;
  return fs.statSync(webp).mtimeMs < fs.statSync(src).mtimeMs; // stale
}).sort();

console.log(`Referenced rasters: ${refs.size}.  To convert: ${todo.length}${FORCE ? ' (--force)' : ''}.`);
if (DRY) { todo.forEach((f) => console.log('  ' + path.relative(ROOT, f))); process.exit(0); }
if (!todo.length) process.exit(0);

function cwebpArgs(src, out) {
  if (/\.png$/i.test(src)) {
    const small = fs.statSync(src).size < 50 * 1024;
    return small ? ['-quiet', '-lossless', src, '-o', out]
                 : ['-quiet', '-q', '90', '-alpha_q', '100', src, '-o', out];
  }
  return ['-quiet', '-q', '82', src, '-o', out];
}
function convert(src) {
  return new Promise((resolve) => {
    const out = src.replace(/\.(jpe?g|png)$/i, '.webp');
    const p = spawn('cwebp', cwebpArgs(src, out));
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code !== 0) { console.error(`  FAIL ${path.relative(ROOT, src)}: ${err.trim()}`); return resolve(null); }
      const before = fs.statSync(src).size, after = fs.statSync(out).size;
      resolve({ src, before, after });
    });
  });
}

// Small concurrency pool.
let i = 0, before = 0, after = 0, ok = 0;
const POOL = 4;
async function worker() {
  while (i < todo.length) {
    const idx = i++;
    const r = await convert(todo[idx]);
    if (r) { ok++; before += r.before; after += r.after; const pct = Math.round((r.after / r.before) * 100); console.log(`  [${ok}/${todo.length}] ${pct}%  ${path.relative(ROOT, r.src)}`); }
  }
}
await Promise.all(Array.from({ length: POOL }, worker));
const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`\nDone: ${ok} converted.  ${kb(before)} -> ${kb(after)}  (${Math.round((after / before) * 100)}% of original, saved ${kb(before - after)}).`);
