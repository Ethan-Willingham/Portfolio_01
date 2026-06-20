/* ============================================================================
   post-template.js  -  the content engine for the new-post builder.

   Pure string work, no DOM, so it runs the same in the browser builder and in a
   node test. It owns three things:
     1. the post block model (the palette + a factory + per-block serialization),
     2. the post <head> and the on-brand <style> block (distilled from
        the-far-side-of-the-body.html, the canonical post the owner pointed at),
     3. buildPostHTML(), which turns {meta, blocks} into a full document.

   Every block maps to a real kit.css component (see STYLE.md), so a finished
   post is on-brand by default and reads like the rest of the site. No em dashes.
   ============================================================================ */

export const SITE_ORIGIN = 'https://ethanwillingham.com';
export const MIN_PER_WORD = 1 / 220;   // ~220 wpm, for the auto read-time

/* ---- tiny escapers (pure, browser + node) -------------------------------- */
export function escAttr(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
export function escText(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Title -> slug. "The Far Side of the Body" -> "the-far-side-of-the-body".
export function slugify(s){
  return String(s || '').toLowerCase().trim()
    .replace(/['’"]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0, 80) || 'untitled';
}

/* ============================================================================
   THE BLOCK MODEL
   Each block is { id, type, ...fields }. The hero is stored separately on the
   draft (meta), not in the block list, because every post opens with it and it
   is never reordered or deleted.
   ============================================================================ */

// The palette the builder shows on "+ Add block". Order = display order.
export const PALETTE = [
  { type:'heading', label:'Section heading', hint:'Starts a new section', icon:'H' },
  { type:'text',    label:'Paragraph',       hint:'Body text',            icon:'¶' },
  { type:'lede',    label:'Lead paragraph',  hint:'A bigger opener',      icon:'P' },
  { type:'image',   label:'Image',           hint:'Upload + caption',     icon:'▦' },
  { type:'callout', label:'Callout',         hint:'Boxed highlight',      icon:'!' },
  { type:'quote',   label:'Pull quote',      hint:'A line to dwell on',   icon:'“' },
  { type:'table',   label:'Table',           hint:'Rows and columns',     icon:'▤' },
  { type:'steps',   label:'Numbered steps',  hint:'Step by step',         icon:'1' },
  { type:'entries', label:'Numbered entries',hint:'No. 01 cards',         icon:'№' },
  { type:'divider', label:'Divider',         hint:'A section break',      icon:'···' },
  { type:'sources', label:'Sources',         hint:'Graded reference list',icon:'§' },
];

let _idn = 0;
export function newId(){ _idn += 1; return 'b' + Date.now().toString(36) + (_idn).toString(36); }

// A fresh block of a type, with sensible on-brand placeholder content.
export function makeBlock(type){
  const id = newId();
  switch(type){
    case 'heading': return { id, type, kicker:'', text:'A new section' };
    case 'text':    return { id, type, html:'Write the paragraph here.' };
    case 'lede':    return { id, type, html:'A bigger opening line for the section.' };
    case 'image':   return { id, type, src:'', w:0, h:0, alt:'', caption:'' };
    case 'callout': return { id, type, variant:'callout', kicker:'The point', html:'The thing worth boxing.' };
    case 'quote':   return { id, type, html:'A line worth dwelling on.', cite:'' };
    case 'table':   return { id, type, headers:['Column','Column'], rows:[['','']], feature:-1 };
    case 'steps':   return { id, type, items:[{ h:'Step', p:'Detail.' }] };
    case 'entries': return { id, type, items:[{ num:'No. 01', h:'Headline.', p:'Body.' }] };
    case 'divider': return { id, type };
    case 'sources': return { id, type, note:'Every number here links its primary source.', items:[{ html:'<b>Author (year).</b> Title. <a href="#">link</a>', grade:'a' }] };
    default:        return { id, type:'text', html:'' };
  }
}

/* ============================================================================
   SERIALIZE ONE BLOCK  -> inner HTML (no wrapping <section>; the walker adds it)
   ============================================================================ */
function gradeChip(g){
  const map = { a:'solid', b:'good', c:'contested', d:'weak' };
  if (!g || !map[g]) return '';
  return ` <span class="u-grade u-grade-${g}">${map[g]}</span>`;
}

export function serializeBlock(b){
  switch(b.type){
    case 'heading': {
      const id = slugify(b.text);
      const k = b.kicker && b.kicker.trim() ? `<p class="u-sechead-k">${escText(b.kicker)}</p>` : '';
      return `<div class="u-sechead">${k}<h2 id="${id}-h" class="u-sechead-h">${b.text || ''}</h2></div>`;
    }
    case 'text':  return `<p>${b.html || ''}</p>`;
    case 'lede':  return `<p class="lede">${b.html || ''}</p>`;
    case 'image': {
      if (!b.src) return `<figure class="u-figure"><div class="u-figure-img" style="aspect-ratio:3/2;display:grid;place-items:center;color:var(--text-faint)">image</div>${b.caption?`<figcaption class="u-figure-cap">${b.caption}</figcaption>`:''}</figure>`;
      const dims = (b.w && b.h) ? ` width="${b.w}" height="${b.h}"` : '';
      const cap = b.caption && b.caption.trim() ? `<figcaption class="u-figure-cap">${b.caption}</figcaption>` : '';
      return `<figure class="u-figure"><img class="u-figure-img" src="${escAttr(b.src)}"${dims} loading="lazy" decoding="async" alt="${escAttr(b.alt)}">${cap}</figure>`;
    }
    case 'callout': {
      const cls = b.variant === 'move' ? ' u-move' : b.variant === 'aside' ? ' u-aside' : '';
      const k = `<p class="u-callout-k">${escText(b.kicker || '')}</p>`;
      return `<aside class="u-callout${cls}">${k}<p class="u-callout-body">${b.html || ''}</p></aside>`;
    }
    case 'quote': {
      const cite = b.cite && b.cite.trim() ? `<cite class="u-pq-cite">${escText(b.cite)}</cite>` : '';
      return `<blockquote class="u-pq">${b.html || ''}${cite}</blockquote>`;
    }
    case 'table': {
      const heads = (b.headers || []).map(h => `<th>${escText(h)}</th>`).join('');
      const body = (b.rows || []).map((row, ri) => {
        const tds = (row || []).map((c, ci) => ci === 0 ? `<td>${c || ''}</td>` : `<td class="u-num">${c || ''}</td>`).join('');
        return `<tr${ri === b.feature ? ' class="u-feature"' : ''}>${tds}</tr>`;
      }).join('');
      return `<table class="u-table"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case 'steps': {
      const lis = (b.items || []).map(it => `<li class="u-step"><span class="u-step-h">${it.h || ''}</span><p class="u-step-p">${it.p || ''}</p></li>`).join('');
      return `<ol class="u-steps">${lis}</ol>`;
    }
    case 'entries': {
      const arts = (b.items || []).map(it => `<article class="u-entry"><span class="u-entry-num">${escText(it.num || '')}</span><h3 class="u-entry-h">${it.h || ''}</h3><p class="u-entry-p">${it.p || ''}</p></article>`).join('');
      return `<div class="u-entries">${arts}</div>`;
    }
    case 'divider': return `<hr class="u-divider">`;
    case 'sources': return '';   // handled specially by the walker (its own section)
    default: return '';
  }
}

// The sources section, rendered as its own <section id="sources">.
function serializeSources(b){
  const note = b.note && b.note.trim() ? `<p class="src-note">${b.note}</p>` : '';
  const lis = (b.items || []).map(it => `<li>${it.html || ''}${gradeChip(it.grade)}</li>`).join('\n        ');
  const n = (b.items || []).length;
  return `<section id="sources" class="sec" aria-labelledby="sources-h">
      <div class="u-sechead"><p class="u-sechead-k">The fine print</p><h2 id="sources-h" class="u-sechead-h">Sources</h2></div>
      ${note}
      <details class="u-collapse">
        <summary class="u-collapse-s">The full list, ${n} source${n===1?'':'s'}</summary>
        <ol>
        ${lis}
        </ol>
      </details>
    </section>`;
}

/* ============================================================================
   WALK THE BLOCK LIST -> the inner HTML of <main>
   Headings open a new <section class="sec">; everything else fills the current
   section (an intro `.sec first` is opened lazily). The sources block is always
   its own trailing section.
   ============================================================================ */
export function serializeMain(blocks){
  const out = [];
  let cur = null;     // { id, attrs, body:[] } or null
  let first = true;

  const flush = () => {
    if (!cur) return;
    const cls = cur.firstClass ? 'sec first' : 'sec';
    out.push(`<section class="${cls}"${cur.idAttr}${cur.ariaAttr}>\n      ${cur.body.join('\n      ')}\n    </section>`);
    cur = null;
  };

  for (const b of (blocks || [])){
    if (b.type === 'sources'){ flush(); out.push(serializeSources(b)); continue; }
    if (b.type === 'heading'){
      flush();
      const id = slugify(b.text);
      cur = { body:[serializeBlock(b)], idAttr:` id="${id}"`, ariaAttr:` aria-labelledby="${id}-h"`, firstClass:first };
      first = false;
    } else {
      if (!cur){ cur = { body:[], idAttr:'', ariaAttr:'', firstClass:first }; first = false; }
      cur.body.push(serializeBlock(b));
    }
  }
  flush();
  return out.join('\n\n    ');
}

/* ============================================================================
   THE POST <style> BLOCK  (distilled, generic, on-brand)
   Carries the hero, the .sec rhythm, the sources styling, the inline override
   utilities, and a no-JS-safe reveal. Mirrors the-far-side-of-the-body.html.
   ============================================================================ */
export const POST_STYLE = `  :root { --measure: 780px; --ease: cubic-bezier(0.23, 1, 0.32, 1); }
  html { overflow-x: hidden; }
  body { overflow-x: hidden; }

  .post-back.ll-back { display: block; max-width: var(--measure); margin: 0 auto; padding-left: var(--gutter); padding-right: var(--gutter); }

  /* ---------- HERO ---------- */
  .hero { max-width: var(--measure); margin: 0 auto; padding: 1rem var(--gutter) 0; }
  .hero-title { font-family: var(--font-heading); font-weight: 700; font-size: clamp(2.9rem, 10vw, 6rem); line-height: 0.98; letter-spacing: -0.025em; color: var(--text-bright); text-wrap: balance; margin: 0; }
  .hero-dek { font-family: var(--font-heading); font-style: italic; font-size: clamp(1.2rem, 3.2vw, 1.6rem); line-height: 1.46; color: var(--text-dim); margin: 1.2rem 0 0; max-width: 44ch; text-wrap: pretty; }
  .hero-meta { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-dim); margin: 1.4rem 0 0; padding-top: 1.1rem; border-top: 1px solid var(--rule); display: flex; flex-wrap: wrap; gap: 0.5em 1.1em; }
  .hero-meta b { color: var(--accent); font-weight: 400; }
  .hero-meta .sep { opacity: 0.4; }

  /* ---------- SECTIONS ---------- */
  .sec { max-width: var(--measure); margin: 0 auto; padding: clamp(3.2rem, 6vw, 4.6rem) var(--gutter) 0; scroll-margin-top: 1.5rem; }
  .sec.first { padding-top: clamp(2.2rem, 5vw, 3.2rem); }
  .sec > :last-child { margin-bottom: 0; }
  .sec .u-sechead { align-items: flex-start; text-align: left; margin: 0 0 0.9rem; }
  .sec .u-sechead-k { font-size: 0.66rem; letter-spacing: 0.12em; padding: 0.26em 0.72em; }
  .sec .u-sechead-h { color: var(--text-bright); }
  .sec p { font-size: var(--body-size, 1.16rem); line-height: var(--body-leading, 1.7); color: var(--text); margin: 0 0 1.15em; text-wrap: pretty; }
  .sec a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s, color 0.2s; }
  .sec a:hover { color: var(--accent-hover); border-bottom-color: var(--accent-hover); }
  .sec strong, .sec b { font-weight: 600; color: var(--text-bright); }
  .sec em { font-style: italic; }
  .sec .lede { font-size: 1.16rem; line-height: 1.6; color: var(--text-bright); margin-bottom: 1.1em; }
  @media (min-width: 720px) { .sec .lede { font-size: 1.24rem; } }
  .sec .u-figure { margin: 1.8rem 0 0; }
  .sec .u-pq, .sec .u-callout, .sec .u-table, .sec .u-steps, .sec .u-entries { margin-top: 1.6rem; }
  .sec .u-divider { margin-top: 3.2rem; }
  .sec .u-callout:not(.u-move):not(.u-aside) { padding: 18px 22px; border-radius: 14px; box-shadow: none; }
  .sec .u-callout:not(.u-move):not(.u-aside) .u-callout-body { font-size: 1.0rem; line-height: 1.55; }

  /* inline overrides the builder can apply (kept curated + on-brand) */
  .tx-lg { font-size: 1.18em; }
  .tx-sm { font-size: 0.85em; }
  .ft-mono { font-family: var(--font-mono); }
  .ft-head { font-family: var(--font-heading); }

  /* ---------- SOURCES ---------- */
  #sources { padding-top: clamp(2.4rem, 4vw, 3.2rem); }
  #sources .u-sechead-h { font-size: clamp(1.5rem, 3.6vw, 1.85rem); }
  .src-note { font-size: 0.95rem; line-height: 1.55; color: var(--text-dim); max-width: 62ch; margin: 0.6rem 0 1.1em; }
  #sources ol { font-family: var(--font-body); font-size: 0.8rem; color: var(--text-dim); line-height: 1.5; padding-left: 1.4em; margin: 0.2em 0 1em; }
  #sources li { margin-bottom: 0.5em; }
  #sources li::marker { color: var(--accent); }
  #sources li a { color: var(--accent); border-bottom: 1px solid transparent; text-decoration: none; }
  #sources li a:hover { border-bottom-color: var(--accent); }
  #sources b { color: var(--text); font-weight: 600; }
  #sources i { color: var(--text-dim); }
  @media (min-width: 700px) { #sources ol { columns: 2; column-gap: 2.2rem; } #sources li { break-inside: avoid; } }

  /* ---------- THUMBNAIL CREDIT ---------- */
  .thumb-credit { font-family: var(--font-body); font-size: 0.74rem; line-height: 1.5; color: var(--text-faint); max-width: var(--measure); margin: 1.8rem auto 0; padding: 0 var(--gutter); }
  .thumb-credit a { color: var(--text-faint); border-bottom: 1px dotted rgba(120,134,120,0.5); text-decoration: none; }
  .thumb-credit a:hover { color: var(--accent); border-bottom-color: var(--accent); }

  /* ---------- REVEAL (no-JS safe) ---------- */
  html.js .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.7s ease, transform 0.7s var(--ease); }
  html.js .reveal.in { opacity: 1; transform: none; }

  @media print {
    .reading-progress, .site-footer, .post-back, .btt-fab { display: none !important; }
    body { background: #fff; color: #161616; }
    .sec, .hero { max-width: none; }
    .sec p, .lede { color: #161616; }
    .u-callout, figure, .u-pq { break-inside: avoid; }
    a { color: #161616; }
  }`;

/* ============================================================================
   THE POST <head>
   Faithful to the-far-side-of-the-body.html: charset, the js-class shim, gtag +
   Clarity, viewport, title/description, the og/twitter block, the Century Supra
   font preload, favicons, the stylesheet. A draft adds noindex and leaves the
   social image pointing at a neutral default until publish fills it in.
   ============================================================================ */
export function buildHead(meta, opts){
  opts = opts || {};
  const draft = !!opts.draft;
  const slug = meta.slug || slugify(meta.title);
  const title = escAttr(meta.title || 'Untitled');
  const desc = escAttr(meta.desc || '');
  const ogTitle = escAttr(meta.title || 'Untitled');     // title rule: identical across title/og/h1
  const ogDesc = escAttr(meta.ogDesc || meta.desc || '');
  const ogUrl = `${SITE_ORIGIN}/${slug}.html`;
  const ogImg = draft ? `${SITE_ORIGIN}/assets/thumbs/home.png` : `${SITE_ORIGIN}/assets/thumbs/${slug}-og.jpg`;
  const robots = draft ? '\n  <meta name="robots" content="noindex, nofollow">' : '';

  return `<head>
  <meta charset="UTF-8">
  <script>document.documentElement.className += ' js';</script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-1NS9QT1HEM"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-1NS9QT1HEM');
  </script>
  <!-- Microsoft Clarity -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "wo3l78g9ld");
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${robots}
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Ethan Willingham">
  <meta property="og:url" content="${ogUrl}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ogImg}">
  <link rel="preload" href="assets/fonts/century_supra_a_regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="style.css">
  <style>
  /* ${escText(meta.title || 'Untitled')} . Built with the site's block builder. No em dashes. */
${POST_STYLE}
  </style>
</head>`;
}

/* ---- the hero (always the opening; not a reorderable block) -------------- */
export function buildHero(meta){
  const metaLine = (meta.metaLine && meta.metaLine.trim()) ? meta.metaLine : 'A field guide';
  return `  <header class="hero">
    <h1 class="hero-title">${meta.title || 'Untitled'}</h1>
    <p class="hero-dek">${meta.dek || ''}</p>
    <p class="hero-meta">${metaLine}</p>
  </header>`;
}

/* ---- the whole document -------------------------------------------------- */
export function buildPostHTML(draftObj){
  const meta = draftObj.meta || {};
  const blocks = draftObj.blocks || [];
  const head = buildHead(meta, { draft: !!draftObj.draft });
  const hero = buildHero(meta);
  const main = serializeMain(blocks);
  const credit = (meta.thumbCredit && meta.thumbCredit.trim())
    ? `\n    <p class="thumb-credit">${meta.thumbCredit}</p>\n` : '';

  return `<!DOCTYPE html>
<html lang="en">
${head}
<body>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>

  <a href="/" class="post-back ll-back"><span class="pb-label">Home</span></a>

${hero}

  <main id="guide">

    ${main}
${credit}
  </main>

  <footer class="site-footer">
    <div class="site-footer-inner" style="max-width:var(--measure); margin:0 auto;">
      <a href="/">&copy; 2026 Ethan Willingham</a>
    </div>
  </footer>

  <script src="js/main.js"></script>
  <script src="js/backtotop.js"></script>
  <script>
  /* Scroll-reveal for .reveal blocks. No-JS safe (CSS only hides under html.js),
     with a 4s watchdog so nothing is ever left hidden. */
  (function () {
    'use strict';
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function fire(el){ el.classList.add('in'); }
    if (!('IntersectionObserver' in window)) { reveals.forEach(fire); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();
  </script>
</body>
</html>
`;
}

/* ---- a preview-safe document for the live iframe -------------------------
   Same styles + hero + main as the real post, but with <base href="/"> so the
   shared css / fonts resolve, no analytics or scripts, images eager. This is
   what the builder shows on the right, so "what you see is what ships". */
export function buildPreviewHTML(draftObj){
  const meta = draftObj.meta || {};
  const blocks = draftObj.blocks || [];
  const hero = buildHero(meta);
  const main = serializeMain(blocks).replace(/loading="lazy"/g, 'loading="eager"');
  const credit = (meta.thumbCredit && meta.thumbCredit.trim())
    ? `\n    <p class="thumb-credit">${meta.thumbCredit}</p>\n` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escAttr(meta.title || 'Untitled')}</title>
  <link rel="stylesheet" href="style.css">
  <style>
${POST_STYLE}
  </style>
</head>
<body>
  <a href="javascript:void 0" class="post-back ll-back"><span class="pb-label">Home</span></a>
${hero}
  <main id="guide">

    ${main}
${credit}
  </main>
  <footer class="site-footer">
    <div class="site-footer-inner" style="max-width:var(--measure); margin:0 auto;">
      <a href="javascript:void 0">&copy; 2026 Ethan Willingham</a>
    </div>
  </footer>
</body>
</html>`;
}

/* ---- draft round-tripping -------------------------------------------------
   A draft file is a real previewable page that also carries its own editable
   model in a JSON island, so re-opening it restores every block exactly. The
   island is stripped on publish. `<` is escaped so user text can never close
   the script tag early. */
const DRAFT_MARK = 'be-draft-model';
export function embedDraftModel(html, draftObj){
  const json = JSON.stringify({ meta: draftObj.meta || {}, blocks: draftObj.blocks || [] })
    .replace(/</g, '\\u003c');
  const island = `<script type="application/json" id="${DRAFT_MARK}">${json}</script>\n</body>`;
  return html.replace('</body>', island);
}
export function extractDraftModel(html){
  const m = html.match(new RegExp(`<script type="application/json" id="${DRAFT_MARK}">([\\s\\S]*?)</script>`));
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch(e){ return null; }
}

/* read-time helper (rounded up to the nearest minute, min 1) */
export function readMinutes(blocks){
  let words = 0;
  for (const b of (blocks || [])){
    const bits = [b.html, b.text, b.caption, b.note].filter(Boolean).join(' ');
    words += bits.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
    (b.items || []).forEach(it => { words += [it.h,it.p,it.html].filter(Boolean).join(' ').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length; });
  }
  return Math.max(1, Math.round(words * MIN_PER_WORD));
}
