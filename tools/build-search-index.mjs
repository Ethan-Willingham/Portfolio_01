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
   Use --hub=inner-life to refresh one collection while preserving other entries.
   No dependencies (vanilla Node, regex extraction; the text only needs to be
   searchable, not perfectly structured). No em dashes in output copy.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD_CAP = 3600;      // max chars of text kept per section
const SECTIONS_CAP = 32;    // max sections kept per post
const POST_TEXT_CAP = 46000;// hard ceiling on total text per post
const EXPLORER_DATA = {
  'meditation.html': ['js/meditation-data.js', 'MED', 'techniques'],
  'cults-the-cage.html': ['js/cults-data.js', 'CULTS', 'cases'],
};

const READER_NOTES = {
  'art-of-war.html': ['js/aow-notes.js', 'AOW_NOTES'],
  'kama-sutra.html': ['js/kama-notes.js', 'KAMA_NOTES'],
};

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
  // The collection uses short card labels; search displays the revised article title.
  if (post.hub === 'inner-life') {
    const title = attr(html, /<meta property="og:title" content="([^"]+)"/);
    if (title) post.title = stripToText(title);
  }
  // work inside <main> when present, else <body>; drop heavy/non-content blocks
  // (.u-next is the generated endcap nav; its next-post titles are chrome, not
  // content, and must not make every collection member match its siblings)
  html = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i) || [html])[0]
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<nav class="u-next"[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Authored gallery cards are hidden after boot. Send their search hits to the visible gallery.
  const galleryRanges = post.hub === 'inner-life'
    ? [...html.matchAll(/<article\b[^>]*class="tale"[^>]*>[\s\S]*?<\/article>/g)]
        .map((match) => [match.index, match.index + match[0].length])
    : [];

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
    if (galleryRanges.some(([start, end]) => m.index >= start && m.index < end)) id = 'gal-frame';
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
    // Continuous essays still need all their paragraphs in the search index.
    // Keep the same chunk limit without requiring visible section headings.
    let chunk = '';
    for (const paragraph of html.split(/(?<=<\/p>)/i)) {
      if (chunk && stripToText(chunk + paragraph).length > CARD_CAP) {
        pushSection('', '', chunk);
        chunk = '';
      }
      chunk += paragraph;
    }
    pushSection('', '', chunk);
  } else {
    pushSection('', '', html.slice(0, heads[0].at)); // intro chunk (hero / lede)
    for (let i = 0; i < heads.length; i++) {
      const raw = html.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].at : html.length);
      pushSection(heads[i].head, heads[i].id, raw);
    }
  }
  // These readers render their explanations from local data. Include every
  // passage, with its existing numeric hash, so search can reach the explanation
  // rather than stopping at the introduction in the static HTML shell.
  const reader = READER_NOTES[post.url];
  if (reader) {
    const context = { window: {} };
    runInNewContext(readFileSync(join(ROOT, reader[0]), 'utf8'), context, { timeout: 1000 });
    for (const [id, note] of Object.entries(context.window[reader[1]])) {
      const explanations = (note.splits || []).map((split) => split.note || '').join(' ');
      const plain = Array.isArray(note.plain) ? note.plain.join(' ') : note.plain;
      pushSection(note.title, id, [note.gist, explanations, note.read, plain].filter(Boolean).join(' '));
    }
  }

  // Include the researched copy behind each explorer's choices. Every result
  // reaches the existing explorer, where all choices remain visible.
  const explorer = EXPLORER_DATA[post.url];
  if (explorer) {
    const context = { window: {} };
    runInNewContext(readFileSync(join(ROOT, explorer[0]), 'utf8'), context, { timeout: 1000 });
    const data = context.window[explorer[1]];
    for (const id of data.order) {
      const entry = data[explorer[2]][id];
      const text = Object.entries(entry)
        .filter(([key]) => !['name', 'fam', 'grade'].includes(key))
        .map(([, value]) => Array.isArray(value) ? value.join(' ') : value)
        .filter((value) => typeof value === 'string').join(' ');
      pushSection(entry.name, 'explorer', text);
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

// Hub child posts: the series/collection posts now live inside the hub index
// pages instead of on the homepage. Pull each hub's member links, tag them with
// the hub slug (so a hub page's own search scopes to its posts, and the homepage
// search still finds them as non-archived), and index their real text.
// A hub listed on the In Progress index instead of the Longform shelf gets its
// members flagged `inprogress` (from the actual In Progress collection cards), so
// the In Progress search finds them and the UI ranks and marks them like the
// archived posts. They are NOT `archived`: the files never moved, the URLs are
// live, and the homepage search still finds them.
const HUB_SLUGS = ['religion', 'philosophy', 'inner-life', 'power-story-love', 'staying-alive', 'career'];
const hubArg = process.argv.slice(2).find((arg) => arg.startsWith('--hub='));
const selectedHub = hubArg && hubArg.slice(6);
if (hubArg && !HUB_SLUGS.includes(selectedHub)) throw new Error(`Unknown hub: ${selectedHub}`);
const progressIndexHtml = existsSync(join(ROOT, 'archive.html')) ? readFileSync(join(ROOT, 'archive.html'), 'utf8') : '';
const IN_PROGRESS_HUBS = new Set([...progressIndexHtml.matchAll(/<a class="article-item is-collection" href="([^"]+)\.html"/g)].map(m => m[1]));
const BORING_HUBS = new Set(HUB_SLUGS.filter((s) => !IN_PROGRESS_HUBS.has(s)));
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
      keywords: '', hub: slug, hubs: BORING_HUBS.has(slug) ? [slug, 'boring-stuff'] : [slug], sections: [],
    };
    if (IN_PROGRESS_HUBS.has(slug)) post.inprogress = true;
    buildSections(post, join(ROOT, href));
    posts.push(post);
    seen.add(href);
  }
}

// Direct posts on the Boring Stuff shelf. Collection cards are skipped because
// their child posts were indexed above and tagged with both their collection
// slug and the parent shelf slug.
const shelfFile = join(ROOT, 'boring-stuff.html');
if (existsSync(shelfFile)) {
  const shelfHtml = readFileSync(shelfFile, 'utf8');
  const inner = (shelfHtml.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
  for (const block of inner.split(/<li class="article-list-item/).slice(1)) {
    const href = attr(block, /<a class="article-item" href="([^"]+)"/);
    const slug = href && href.replace(/\.html$/, '');
    if (!href || !/\.html$/.test(href) || HUB_SLUGS.includes(slug) || seen.has(href)) continue;
    const post = {
      url: href,
      title: stripToText(attr(block, /<h2 class="article-item-title">([\s\S]*?)<\/h2>/)),
      date: attr(block, /datetime="([^"]+)"/),
      dateDisplay: stripToText(attr(block, /<time[^>]*>([\s\S]*?)<\/time>/)),
      desc: stripToText(attr(block, /<p class="article-item-description">([\s\S]*?)<\/p>/)),
      thumb: attr(block, /<img[^>]*src="([^"]+)"/),
      keywords: '', hub: 'boring-stuff', hubs: ['boring-stuff'], sections: [],
    };
    buildSections(post, join(ROOT, href));
    posts.push(post);
    seen.add(href);
  }
}

// Direct in-progress posts can keep their root URLs, like the collection hubs.
// Index their cards as inprogress, without pretending the files were archived.
const progressFile = join(ROOT, 'archive.html');
if (existsSync(progressFile)) {
  const progressHtml = readFileSync(progressFile, 'utf8');
  const inner = (progressHtml.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
  for (const block of inner.split(/<li class="article-list-item/).slice(1)) {
    const href = attr(block, /<a class="article-item" href="([^"]+)"/);
    if (!href || !/\.html$/.test(href) || href.startsWith('archive/') || seen.has(href) || !existsSync(join(ROOT, href))) continue;
    const post = {
      url: href,
      title: stripToText(attr(block, /<h2 class="article-item-title">([\s\S]*?)<\/h2>/)),
      date: attr(block, /datetime="([^"]+)"/),
      dateDisplay: stripToText(attr(block, /<time[^>]*>([\s\S]*?)<\/time>/)),
      desc: stripToText(attr(block, /<p class="article-item-description">([\s\S]*?)<\/p>/)),
      thumb: attr(block, /<img[^>]*src="([^"]+)"/),
      keywords: attr(block, /data-keywords="([^"]+)"/),
      inprogress: true, sections: [],
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

let outputPosts = posts;
if (selectedHub) {
  const existing = JSON.parse(readFileSync(join(ROOT, 'search-index.json'), 'utf8'));
  const replacements = new Map(posts.filter((p) => p.hub === selectedHub).map((p) => [p.url, p]));
  const kept = new Set();
  outputPosts = existing.posts
    .filter((p) => p.hub !== selectedHub || replacements.has(p.url))
    .map((p) => { kept.add(p.url); return replacements.get(p.url) || p; });
  for (const [url, post] of replacements) if (!kept.has(url)) outputPosts.push(post);
}
const payload = { built: new Date().toISOString().slice(0, 10), count: outputPosts.length, posts: outputPosts };
const json = JSON.stringify(payload);
writeFileSync(join(ROOT, 'search-index.json'), json);

const kb = (json.length / 1024).toFixed(0);
console.log(`search-index.json: ${outputPosts.length} posts, ${json.length} bytes (${kb} KB)`);
const archived = outputPosts.filter(p => p.archived).length;
const inprog = outputPosts.filter(p => p.inprogress).length;
console.log(`  (${outputPosts.length - archived - inprog} active, ${inprog} in progress, ${archived} archived)`);
for (const p of selectedHub ? outputPosts.filter((p) => p.hub === selectedHub) : outputPosts) {
  const chars = p.sections.reduce((a, s) => a + s.text.length, 0);
  const mark = p.archived ? 'A ' : p.inprogress ? 'P ' : '  ';
  console.log(`  ${mark + p.url.padEnd(52)} ${String(p.sections.length).padStart(2)} sec  ${(chars/1024).toFixed(1).padStart(5)}KB  "${p.title}"`);
}
