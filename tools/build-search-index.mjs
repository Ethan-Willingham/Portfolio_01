#!/usr/bin/env node
/* ============================================================================
   build-search-index.mjs  -  the homepage search index generator.

   The site is static (no server, no build step), so full-text search needs a
   prebuilt index. This reads the post list + card metadata straight out of
   index.html, then opens each post file and extracts its real text, broken into
   sections by heading (with the heading's anchor id, so a result can deep-link
   to the exact spot). Output: search-index.json, loaded lazily by js/search.js.

   Run from the repo root:  node tools/build-search-index.mjs
   Re-run whenever posts are added, retitled, or substantially edited.
   No dependencies (vanilla Node, regex extraction; the text only needs to be
   searchable, not perfectly structured). No em dashes in output copy.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD_CAP = 3600;      // max chars of text kept per section
const SECTIONS_CAP = 32;    // max sections kept per post
const POST_TEXT_CAP = 46000;// hard ceiling on total text per post

// ---- tiny HTML helpers ------------------------------------------------------
const ENT = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', middot:'·',
  mdash:'—', ndash:'–', hellip:'…', rsquo:'’', lsquo:'‘',
  ldquo:'“', rdquo:'”', times:'×', deg:'°', frac12:'½' };
function decode(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
          .replace(/&([a-z0-9]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}
function stripToText(html) {
  return decode(
    html.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}
function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }

// ---- pull the ordered post list + card metadata out of index.html ----------
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const listHtml = (indexHtml.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
const cardBlocks = listHtml.split(/<li class="article-list-item/).slice(1);

function attr(block, re) { const m = block.match(re); return m ? decode(m[1]).trim() : ''; }

// extract a post's text, broken into sections by heading (with anchor ids)
function buildSections(post, file) {
  if (!existsSync(file)) return;
  let html = readFileSync(file, 'utf8');
  // work inside <main> when present, else <body>; drop heavy/non-content blocks
  html = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i) || [html])[0]
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // find every heading, its anchor id (own id, else nearest preceding id="..."),
  // and the raw span between this heading and the next -> one searchable section.
  const headRe = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const heads = [];
  let m;
  while ((m = headRe.exec(html))) {
    const ownId = (m[2].match(/\bid="([^"]+)"/) || [])[1];
    let id = ownId;
    if (!id) {
      const before = html.slice(Math.max(0, m.index - 320), m.index);
      const ids = [...before.matchAll(/\bid="([^"]+)"/g)];
      if (ids.length) id = ids[ids.length - 1][1];
    }
    heads.push({ at: m.index, end: headRe.lastIndex, id: id || '', head: stripToText(m[3]) });
  }

  let total = 0;
  const pushSection = (head, id, raw) => {
    if (post.sections.length >= SECTIONS_CAP || total >= POST_TEXT_CAP) return;
    const text = clip(stripToText(raw), CARD_CAP);
    if (!text && !head) return;
    total += text.length;
    post.sections.push({ head: head || '', id: id || '', text });
  };

  if (heads.length === 0) {
    pushSection('', '', html);
  } else {
    pushSection('', '', html.slice(0, heads[0].at)); // intro chunk (hero / lede)
    for (let i = 0; i < heads.length; i++) {
      const raw = html.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].at : html.length);
      pushSection(heads[i].head, heads[i].id, raw);
    }
  }
}

const posts = [];
const seen = new Set();
for (const block of cardBlocks) {
  const href = attr(block, /<a class="article-item" href="([^"]+)"/);
  if (!href || !/\.html$/.test(href)) continue;
  const post = {
    url: href,
    title: stripToText(attr(block, /<h2 class="article-item-title">([\s\S]*?)<\/h2>/)),
    date: attr(block, /datetime="([^"]+)"/),
    dateDisplay: stripToText(attr(block, /<time[^>]*>([\s\S]*?)<\/time>/)),
    desc: stripToText(attr(block, /<p class="article-item-description">([\s\S]*?)<\/p>/)),
    thumb: attr(block, /<img[^>]*src="([^"]+)"/),
    keywords: attr(block, /data-keywords="([^"]+)"/),
    sections: [],
  };
  buildSections(post, join(ROOT, href));
  posts.push(post);
  seen.add(href);
}

// Hub child posts: the series posts now live inside the four hub index pages
// instead of on the homepage. Pull each hub's member links, tag them with the
// hub slug (so a hub page's own search scopes to its posts, and the homepage
// search still finds them as non-archived), and index their real text.
const HUB_SLUGS = ['religion', 'philosophy', 'inner-life', 'power-story-love'];
for (const slug of HUB_SLUGS) {
  const hubFile = join(ROOT, slug + '.html');
  if (!existsSync(hubFile)) continue;
  const hubHtml = readFileSync(hubFile, 'utf8');
  const inner = (hubHtml.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
  for (const block of inner.split(/<li class="article-list-item/).slice(1)) {
    const href = attr(block, /<a class="article-item" href="([^"]+)"/);
    if (!href || !/\.html$/.test(href) || seen.has(href)) continue;
    const post = {
      url: href,
      title: stripToText(attr(block, /<h2 class="article-item-title">([\s\S]*?)<\/h2>/)),
      date: '', dateDisplay: '',
      desc: stripToText(attr(block, /<p class="article-item-description">([\s\S]*?)<\/p>/)),
      thumb: attr(block, /<img[^>]*src="([^"]+)"/),
      keywords: '', hub: slug, sections: [],
    };
    buildSections(post, join(ROOT, href));
    posts.push(post);
    seen.add(href);
  }
}

// Content pages worth searching that are not in the homepage list (the colophon
// now lives behind the About page, but it is still real, searchable content).
const EXTRAS = [
  { url: 'colophon.html', date: '2026-06-16', dateDisplay: '16 Jun 2026', thumb: 'assets/thumbs/colophon.jpg',
    keywords: 'colophon design palette fonts typography components style credits build meta about page parts' },
];
for (const ex of EXTRAS) {
  if (seen.has(ex.url) || !existsSync(join(ROOT, ex.url))) continue;
  const head = readFileSync(join(ROOT, ex.url), 'utf8').slice(0, 4000);
  const post = {
    url: ex.url,
    title: stripToText((head.match(/<meta property="og:title" content="([^"]+)"/) || head.match(/<title>([^<]+)<\/title>/) || [, ex.url])[1]),
    date: ex.date || '', dateDisplay: ex.dateDisplay || '',
    desc: stripToText((head.match(/<meta name="description" content="([^"]+)"/) || [, ''])[1]),
    thumb: ex.thumb || '', keywords: ex.keywords || '', sections: [],
  };
  buildSections(post, join(ROOT, ex.url));
  posts.push(post);
}

// Archived posts (archive/<slug>/<slug>.html). They are off the homepage but still
// live and worth searching; flag them so the UI marks them and ranks them last.
let archiveDirs = [];
try { archiveDirs = readdirSync(join(ROOT, 'archive'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch (e) {}
for (const slug of archiveDirs) {
  const url = `archive/${slug}/${slug}.html`;
  const file = join(ROOT, url);
  if (seen.has(url) || !existsSync(file)) continue;
  const head = readFileSync(file, 'utf8').slice(0, 4000);
  const grab = re => { const m = head.match(re); return m ? decode(m[1]).trim() : ''; };
  const ogimg = grab(/<meta property="og:image" content="([^"]+)"/).replace(/^https?:\/\/[^/]+/, '');
  const post = {
    url,
    title: stripToText(grab(/<meta property="og:title" content="([^"]+)"/) || grab(/<title>([^<]+)<\/title>/) || slug),
    date: '', dateDisplay: '',
    desc: stripToText(grab(/<meta name="description" content="([^"]+)"/)),
    thumb: ogimg, keywords: '', archived: true, sections: [],
  };
  buildSections(post, file);
  posts.push(post);
  seen.add(url);
}

const payload = { built: new Date().toISOString().slice(0, 10), count: posts.length, posts };
const json = JSON.stringify(payload);
writeFileSync(join(ROOT, 'search-index.json'), json);

const kb = (json.length / 1024).toFixed(0);
console.log(`search-index.json: ${posts.length} posts, ${json.length} bytes (${kb} KB)`);
const active = posts.filter(p => !p.archived).length;
console.log(`  (${active} active, ${posts.length - active} archived)`);
for (const p of posts) {
  const chars = p.sections.reduce((a, s) => a + s.text.length, 0);
  console.log(`  ${(p.archived ? 'A ' : '  ') + p.url.padEnd(52)} ${String(p.sections.length).padStart(2)} sec  ${(chars/1024).toFixed(1).padStart(5)}KB  "${p.title}"`);
}
