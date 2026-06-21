#!/usr/bin/env node
/*
  wrap-picture.mjs - wrap bare <img src="x.jpg|png"> in a <picture> that offers
  the .webp sibling first, falling back to the original for old browsers:

    <picture><source type="image/webp" srcset="x.webp"><img src="x.jpg" ...></picture>

  Idempotent and safe:
   - <script>, <style>, <!-- comments -->, and existing <picture> blocks are
     masked out before matching, so JS template strings and already-wrapped
     images are never touched (no double-wrap).
   - only wraps an <img> whose source has a real .webp sibling on disk.
   - the srcset value is URL-encoded (spaces -> %20, commas -> %2C) because both
     are delimiters in srcset; the <img src> is left exactly as authored.

  Usage:  node tools/wrap-picture.mjs [file ...]   # default: all shipped HTML
          node tools/wrap-picture.mjs --dry [file ...]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const fileArgs = args.filter((a) => a !== '--dry');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'assets', 'js', 'tools', 'docs', 'research']);
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
function encSrcset(ref) {
  // ref is the authored (raw) path with .webp extension; make it srcset-safe.
  return encodeURI(ref).replace(/,/g, '%2C');
}

const SENT = ''; // mask sentinel, won't appear in HTML
function maskBlocks(html, store) {
  // Order matters: comments first, then script/style, then existing pictures.
  const patterns = [
    /<!--[\s\S]*?-->/g,
    /<script\b[\s\S]*?<\/script>/gi,
    /<style\b[\s\S]*?<\/style>/gi,
    /<picture\b[\s\S]*?<\/picture>/gi,
  ];
  for (const re of patterns) {
    html = html.replace(re, (m) => { const i = store.push(m) - 1; return `${SENT}${i}${SENT}`; });
  }
  return html;
}
function unmask(html, store) {
  return html.replace(new RegExp(`${SENT}(\\d+)${SENT}`, 'g'), (_, i) => store[+i]);
}

const targets = fileArgs.length
  ? fileArgs.map((f) => path.resolve(f))
  : walkHtml(ROOT);

let totFiles = 0, totWrapped = 0, totNoWebp = 0;
for (const file of targets) {
  let html = fs.readFileSync(file, 'utf8');
  const store = [];
  let masked = maskBlocks(html, store);
  let wrapped = 0, noWebp = 0;

  masked = masked.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/(?<![-\w])src="([^"]+)"/i);
    if (!m) return tag;
    const clean = m[1].split('?')[0].split('#')[0]; // drop cache-buster / fragment
    if (!/\.(jpe?g|png)$/i.test(clean)) return tag;
    const abs = resolveRef(file, decodeURI(clean));
    if (!abs) return tag;
    const webpAbs = abs.replace(/\.(jpe?g|png)$/i, '.webp');
    if (!fs.existsSync(webpAbs)) { noWebp++; return tag; }
    const webpRef = encSrcset(clean.replace(/\.(jpe?g|png)$/i, '.webp'));
    wrapped++;
    return `<picture><source type="image/webp" srcset="${webpRef}">${tag}</picture>`;
  });

  const out = unmask(masked, store);
  if (wrapped > 0 && !DRY) fs.writeFileSync(file, out);
  if (wrapped > 0 || noWebp > 0) {
    totFiles++; totWrapped += wrapped; totNoWebp += noWebp;
    console.log(`  ${String(wrapped).padStart(3)} wrapped  ${noWebp ? '(' + noWebp + ' no-webp) ' : ''}${path.relative(ROOT, file)}`);
  }
}
console.log(`\n${DRY ? '[DRY] ' : ''}Files changed: ${totFiles}, images wrapped: ${totWrapped}, skipped (no webp): ${totNoWebp}`);
