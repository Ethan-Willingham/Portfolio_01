/* ============================================================================
   post-publish.js  -  the publish pipeline (ARCHIVING.md run in reverse).

   Turning a draft into a live post means doing all the downstream chores that
   ARCHIVING.md does in reverse: emit the final page, drop a homepage card,
   update the search index, render the social + thumbnail images, and set the
   absolute social tags. These are the pure pieces (string + canvas work); the
   builder wires them into one atomic commit. No DOM is required except for the
   canvas image renderers, which are browser only.

   The one thing publish does NOT do is the About-page attribution tile
   (js/git-attribution-data.js). That needs local Claude Code transcripts and
   cannot be made in the browser, so the builder surfaces a reminder instead of
   faking a tile. No em dashes.
   ============================================================================ */
import { slugify, escAttr, escText, SITE_ORIGIN } from './post-template.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// "2026-06-19" -> "19 Jun 2026" (no leading zero on the day, matching the homepage)
export function dateDisplay(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${parseInt(m[3],10)} ${MONTHS[parseInt(m[2],10)-1]} ${m[1]}`;
}

/* ---- a homepage card, exactly matching the existing markup ---------------- */
export function homepageCard({ slug, title, cardDesc, dateISO, keywords, alt, thumb, eager }){
  const img = thumb || `assets/thumbs/${slug}.jpg`;
  return `<li class="article-list-item fade-in" data-keywords="${escAttr(keywords)}">
          <a class="article-item" href="${slug}.html">
            <span class="article-item-thumb">
              <img src="${img}" width="600" height="400" loading="${eager ? 'eager' : 'lazy'}" decoding="async" alt="${escAttr(alt)}">
            </span>
            <time class="article-item-date" datetime="${dateISO}">${dateDisplay(dateISO)}</time>
            <h2 class="article-item-title">${escText(title)}</h2>
            <p class="article-item-description">${escText(cardDesc)}</p>
          </a>
        </li>`;
}

/* ---- the homepage list, re-sorted strictly by date (newest first) ---------
   Adds the new card (when given) and re-emits <ul class="article-list"> with
   every card ordered by its <time datetime>. The top card gets loading="eager",
   the rest "lazy", matching the convention. Cards with no date sort last but
   keep their relative order. The owner asked the homepage to order by date only. */
export function sortHomepage(indexHtml, newCard){
  const cards = indexHtml.match(/<li class="article-list-item[\s\S]*?<\/li>/g) || [];
  const all = cards.slice();
  if (newCard) all.unshift(newCard);                 // unshift so a same-date new post wins the tie
  const dateOf = c => (c.match(/datetime="([^"]+)"/) || [,''])[1];
  // stable sort by date descending (a tie keeps earlier array position)
  const decorated = all.map((c, i) => ({ c, i, d: dateOf(c) }));
  decorated.sort((a, b) => (b.d || '').localeCompare(a.d || '') || a.i - b.i);
  const sorted = decorated.map((x, idx) => {
    // first card eager, the rest lazy
    let c = x.c.replace(/\bloading="(eager|lazy)"/, idx === 0 ? 'loading="eager"' : 'loading="lazy"');
    return c;
  });
  const inner = '\n        ' + sorted.join('\n        ') + '\n      ';
  return indexHtml.replace(/(<ul class="article-list">)[\s\S]*?(<\/ul>)/, (_, open, close) => open + inner + close);
}

// Remove a post's card from the homepage (used by archive).
export function removeCard(indexHtml, slug){
  const re = new RegExp(`\\s*<li class="article-list-item[\\s\\S]*?href="${slug}\\.html"[\\s\\S]*?<\\/li>`, 'g');
  return indexHtml.replace(re, '');
}

/* ---- change a post's homepage date, then re-sort -------------------------- */
export function setCardDate(indexHtml, slug, dateISO){
  const re = new RegExp(`(<li class="article-list-item[\\s\\S]*?href="${slug}\\.html"[\\s\\S]*?<time class="article-item-date" datetime=")[^"]*(">)[^<]*(</time>)`);
  const updated = indexHtml.replace(re, `$1${dateISO}$2${dateDisplay(dateISO)}$3`);
  return sortHomepage(updated);   // owner wants the homepage ordered by date only
}

/* ============================================================================
   ARCHIVE  -  ARCHIVING.md, automated. Moving the page off the homepage into
   archive/<slug>/ while it stays live behind the amber banner.
   ============================================================================ */

// Every own-asset path the post references (not the shared fonts), e.g. its
// inline images. The two thumbs are added by the caller (they are not in the body).
export function collectOwnAssets(html){
  const out = new Set();
  const re = /(?:src|href)="(assets\/(?!fonts\/)[^"]+)"/g; let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

// Rewrite a root post into its archived form:
//  - shared resources (style.css, js/*, assets/fonts/*) to absolute paths
//  - the post's own assets to the relative paths they take inside archive/<slug>/
//  - og:url / og:image / twitter:image to the archive URLs
//  - the archive banner script as the first child of <body>
export function rewriteForArchive(html, slug, renameMap){
  let out = html;
  // own assets first (full distinct paths), so the shared rewrite cannot touch them
  for (const [oldSrc, relSrc] of Object.entries(renameMap)){
    out = out.split(`"${oldSrc}"`).join(`"${relSrc}"`);
  }
  // shared resources to absolute
  out = out.replace(/(href|src)="(style\.css|js\/[^"]*|assets\/fonts\/[^"]*)"/g, '$1="/$2"');
  // social tags to the archive URLs
  out = out.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/archive/${slug}/${slug}.html$2`);
  out = out.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/archive/${slug}/assets/${slug}-og.jpg$2`);
  out = out.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/archive/${slug}/assets/${slug}-og.jpg$2`);
  // banner as the first child of <body>
  if (!out.includes('/js/archive-banner.js')){
    out = out.replace(/<body([^>]*)>/, '<body$1>\n  <script src="/js/archive-banner.js"></script>');
  }
  return out;
}

// Reverse: archived page back to a root post.
export function rewriteForUnarchive(html, slug, renameMap){
  let out = html;
  out = out.replace(/\s*<script src="\/js\/archive-banner\.js"><\/script>/, '');
  for (const [archSrc, rootSrc] of Object.entries(renameMap)){
    out = out.split(`"${archSrc}"`).join(`"${rootSrc}"`);
  }
  // shared resources back to relative (root pages link them relatively)
  out = out.replace(/(href|src)="\/(style\.css|js\/[^"]*|assets\/fonts\/[^"]*)"/g, '$1="$2"');
  out = out.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/${slug}.html$2`);
  out = out.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/assets/thumbs/${slug}-og.jpg$2`);
  out = out.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${SITE_ORIGIN}/assets/thumbs/${slug}-og.jpg$2`);
  return out;
}

// Bump the ARCHIVED count in js/archive-banner.js (+1 archive, -1 unarchive).
export function bumpArchiveCounter(bannerJs, delta, dateISO){
  return bannerJs.replace(/var ARCHIVED = (\d+);[^\n]*/, (_, n) => {
    const v = Math.max(0, parseInt(n, 10) + delta);
    return `var ARCHIVED = ${v};` + (dateISO ? `   // updated ${dateISO}` : '');
  });
}

// Replace a post's search entry with its archived form (moved to the tail).
export function archiveSearchEntry(indexJsonText, slug, archivedHtml){
  const payload = JSON.parse(indexJsonText);
  const url = `archive/${slug}/${slug}.html`;
  const old = (payload.posts || []).find(p => p.url === `${slug}.html`) || {};
  payload.posts = (payload.posts || []).filter(p => p.url !== `${slug}.html` && p.url !== url);
  payload.posts.push({ url, title: old.title || slug, date: '', dateDisplay: '',
    desc: old.desc || '', thumb: `archive/${slug}/assets/${slug}-og.jpg`, keywords: '', archived: true,
    sections: buildSections(archivedHtml) });
  payload.count = payload.posts.length;
  return JSON.stringify(payload);
}

/* ============================================================================
   SEARCH INDEX  -  port of tools/build-search-index.mjs extraction, browser side
   ============================================================================ */
const ENT = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', middot:'·',
  mdash:'—', ndash:'–', hellip:'…', rsquo:'’', lsquo:'‘',
  ldquo:'“', rdquo:'”', times:'×', deg:'°', frac12:'½' };
function decode(s){
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
          .replace(/&([a-z0-9]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}
function stripToText(html){
  return decode(html.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function clip(s, n){ return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }

const CARD_CAP = 3600, SECTIONS_CAP = 32, POST_TEXT_CAP = 46000;
// Build the searchable sections of a post (intro chunk + one per heading).
export function buildSections(postHtml){
  let html = (postHtml.match(/<main[\s\S]*?<\/main>/i) || postHtml.match(/<body[\s\S]*?<\/body>/i) || [postHtml])[0]
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const headRe = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const heads = []; let m;
  while ((m = headRe.exec(html))){
    const ownId = (m[2].match(/\bid="([^"]+)"/) || [])[1];
    let id = ownId;
    if (!id){ const before = html.slice(Math.max(0, m.index - 320), m.index); const ids = [...before.matchAll(/\bid="([^"]+)"/g)]; if (ids.length) id = ids[ids.length-1][1]; }
    heads.push({ at: m.index, end: headRe.lastIndex, id: id || '', head: stripToText(m[3]) });
  }
  const sections = []; let total = 0;
  const push = (head, id, raw) => {
    if (sections.length >= SECTIONS_CAP || total >= POST_TEXT_CAP) return;
    const text = clip(stripToText(raw), CARD_CAP);
    if (!text && !head) return;
    total += text.length; sections.push({ head: head || '', id: id || '', text });
  };
  if (!heads.length) push('', '', html);
  else {
    push('', '', html.slice(0, heads[0].at));
    for (let i = 0; i < heads.length; i++) push(heads[i].head, heads[i].id, html.slice(heads[i].end, i+1 < heads.length ? heads[i+1].at : html.length));
  }
  return sections;
}

// One full search entry for a post (matches the build script's shape).
export function searchEntry({ url, title, dateISO, desc, thumb, keywords }, postHtml){
  return { url, title: stripToText(title), date: dateISO || '', dateDisplay: dateDisplay(dateISO),
    desc: stripToText(desc), thumb: thumb || '', keywords: keywords || '', sections: buildSections(postHtml) };
}

// Insert a new post at the top of the index (newest first), bump count + built.
// Archived posts already sit at the tail of the array, so unshifting the new
// active post to index 0 keeps them last and gives the new post top recency.
export function addToSearchIndex(indexJsonText, entry, builtISO){
  const payload = JSON.parse(indexJsonText);
  payload.posts = (payload.posts || []).filter(p => p.url !== entry.url);   // replace if re-publishing
  payload.posts.unshift(entry);
  payload.count = payload.posts.length;
  if (builtISO) payload.built = builtISO;
  return JSON.stringify(payload);
}
// Update the date shown for one post in the search index.
export function setSearchDate(indexJsonText, url, dateISO){
  const payload = JSON.parse(indexJsonText);
  const p = (payload.posts || []).find(x => x.url === url);
  if (p){ p.date = dateISO; p.dateDisplay = dateDisplay(dateISO); }
  return JSON.stringify(payload);
}
export function removeFromSearchIndex(indexJsonText, url, builtISO){
  const payload = JSON.parse(indexJsonText);
  payload.posts = (payload.posts || []).filter(p => p.url !== url);
  payload.count = payload.posts.length;
  if (builtISO) payload.built = builtISO;
  return JSON.stringify(payload);
}

// auto keywords from the title + section headings (lowercased word set)
export function autoKeywords(title, blocks){
  const words = new Set();
  const add = s => String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).forEach(w => { if (w.length > 2) words.add(w); });
  add(title);
  (blocks||[]).forEach(b => { if (b.type === 'heading') add(b.text); });
  return [...words].join(' ');
}

/* ============================================================================
   IMAGES  -  OG card (1200x630) + homepage thumb (600x400). Browser only.
   Either cover-fit an uploaded image, or draw a branded card in the site fonts
   on the locked green background.
   ============================================================================ */
const BG = '#303931', INK = '#f5f1ea', GOLD = '#d4c4a0', DIM = '#b8b2a2';
let _fontReady = null;
async function ensureFont(){
  if (_fontReady) return _fontReady;
  _fontReady = (async () => {
    try {
      const face = new FontFace('Century Supra Canvas', 'url(/assets/fonts/century_supra_a_regular.woff2)');
      await face.load(); document.fonts.add(face);
    } catch (e) { /* fall back to a serif if the font will not load */ }
  })();
  return _fontReady;
}
function loadImg(src){ return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image load failed')); i.src = src; }); }
function coverDraw(ctx, img, W, H){
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
function jpegB64(canvas, q = 0.86){ return canvas.toDataURL('image/jpeg', q).split(',')[1]; }

// wrap title text to a width, returns array of lines
function wrapLines(ctx, text, maxW){
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const w of words){ const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line){ lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function drawBranded(ctx, title, W, H){
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // a quiet gold hairline frame
  ctx.strokeStyle = 'rgba(212,196,160,0.5)'; ctx.lineWidth = Math.max(2, W/600); ctx.strokeRect(W*0.05, H*0.05, W*0.9, H*0.9);
  const fontFam = '"Century Supra Canvas", Georgia, serif';
  // small mono eyebrow
  ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(W*0.018)}px "Commit Mono", ui-monospace, monospace`;
  ctx.fillText('ETHANWILLINGHAM.COM', W/2, H*0.2);
  // title, wrapped
  let size = Math.round(W * 0.075);
  ctx.fillStyle = INK; ctx.font = `700 ${size}px ${fontFam}`;
  let lines = wrapLines(ctx, title, W*0.82);
  while (lines.length * size * 1.1 > H*0.5 && size > 20){ size -= 4; ctx.font = `700 ${size}px ${fontFam}`; lines = wrapLines(ctx, title, W*0.82); }
  const lh = size * 1.1; let y = H/2 - (lines.length-1)*lh/2 + size*0.34;
  for (const ln of lines){ ctx.fillText(ln, W/2, y); y += lh; }
}

async function renderOne(W, H, title, heroSrc){
  await ensureFont();
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (heroSrc){
    try { const img = await loadImg(heroSrc); ctx.fillStyle = BG; ctx.fillRect(0,0,W,H); coverDraw(ctx, img, W, H); }
    catch (e) { drawBranded(ctx, title, W, H); }
  } else { drawBranded(ctx, title, W, H); }
  return jpegB64(canvas);
}

// Returns { ogB64 (1200x630), thumbB64 (600x400) }. heroSrc optional (a data URL
// or same-origin path); when absent both are branded cards.
export async function renderSocialImages(title, heroSrc){
  const ogB64 = await renderOne(1200, 630, title, heroSrc);
  const thumbB64 = await renderOne(600, 400, title, heroSrc);
  return { ogB64, thumbB64 };
}
