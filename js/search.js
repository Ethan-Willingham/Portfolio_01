/* ============================================================================
   search.js  -  the homepage full-text search (typeahead).

   A self-contained, no-dependency search over a prebuilt index
   (search-index.json, made by tools/build-search-index.mjs). It reads the real
   text of every post, ranks them per keystroke (title and headings weigh more
   than body), shows a spring-in dropdown of the best matches with a highlighted
   snippet, and deep-links to the matching section when it can.

   World-class touches:
   - Typo tolerance: a bounded Damerau-Levenshtein over a per-load vocabulary,
     so "warehosue", "octapus", "supercentenarian" still find the right post.
   - Archived posts are searchable too, clearly marked, and always ranked AFTER
     every live post (a hard tier, not just a score nudge).

   The index is fetched lazily on first focus, so the homepage stays light.
   Full keyboard control (up/down/enter/escape, "/" to focus) + a combobox a11y
   contract. Honours prefers-reduced-motion via CSS. No em dashes.
   ============================================================================ */
(function () {
  'use strict';

  var input = document.querySelector('.hs-input');
  var panel = document.getElementById('hs-panel');
  var live  = document.querySelector('.hs-readout');
  if (!input || !panel) return;

  var LIMIT = 8;             // results shown
  var data = null;          // prepared index
  var vocab = {};           // first-char -> array of words, for fuzzy lookup
  var vocabSet = new Set();  // every indexed word, for "is this a real word?" checks
  var loading = false;
  var results = [];
  var active = -1;
  var lastQuery = '';

  // field weights (also used as the per-word weight for fuzzy whole-word hits)
  var W_TITLE = 1.00, W_KW = 0.62, W_HEAD = 0.55, W_DESC = 0.45, W_BODY = 0.30;

  // ---- text helpers ---------------------------------------------------------
  function lc(s) { return (s || '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
  function words(s) { return lc(s).split(/[^a-z0-9]+/); }

  // word-aware substring strength: whole word 1.0, word prefix 0.7, loose 0.4
  function tier(hay, t) {
    if (!hay) return 0;
    var i = hay.indexOf(t);
    if (i < 0) return 0;
    var before = i === 0 ? ' ' : hay.charAt(i - 1);
    var after = hay.charAt(i + t.length) || ' ';
    var bb = /[^a-z0-9]/.test(before), ba = /[^a-z0-9]/.test(after);
    if (bb && ba) return 1.0;
    if (bb) return 0.7;
    if (t.length < 3) return 0;   // short tokens must sit at a word boundary
    return 0.4;
  }

  // bounded Damerau-Levenshtein (optimal string alignment, with transpositions).
  // Returns the distance, or max+1 once it is certain to exceed max (early out).
  function dist(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowBest = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && prev2 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowBest) rowBest = v;
      }
      if (rowBest > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  // Algolia-style ramp: no typos under 4 chars, 1 typo to 7, 2 only at 8+. Keeping
  // distance-2 off shorter words avoids conflating two real words (placebo/placed).
  function maxTypos(len) { return len < 4 ? 0 : len < 8 ? 1 : 2; }

  // typo candidates for a term: vocabulary words within edit distance, sharing
  // the first letter (real typos almost always keep it). Cached per query.
  var fcache = {};
  function fuzzyFor(t) {
    if (t in fcache) return fcache[t];
    var md = maxTypos(t.length), res = {}, bucket = vocab[t.charAt(0)] || [], k;
    // Only spend on fuzzy when the term LOOKS like a typo: it is not itself a real
    // indexed word and not the start of one (mid-typing). That keeps a correctly
    // spelled query exact, so "painting" never drifts to "parenting".
    var skip = md === 0 || vocabSet.has(t);
    if (!skip) for (k = 0; k < bucket.length; k++) { if (bucket[k].length > t.length && bucket[k].lastIndexOf(t, 0) === 0) { skip = true; break; } }
    if (!skip) {
      for (k = 0; k < bucket.length; k++) {
        var w = bucket[k];
        if (w === t || Math.abs(w.length - t.length) > md) continue;
        var d = dist(t, w, md);
        if (d <= md && (!(w in res) || d < res[w])) res[w] = d;
      }
    }
    fcache[t] = res;
    return res;
  }

  // ---- prepare the index once ----------------------------------------------
  function prepare(payload) {
    var posts = payload.posts || [], n = posts.length;
    vocab = {}; vocabSet = new Set();
    posts.forEach(function (p, i) {
      p.titleLC = lc(p.title); p.descLC = lc(p.desc); p.kwLC = lc(p.keywords);
      p.recency = n > 1 ? (n - 1 - i) / (n - 1) : 1;
      p.words = Object.create(null);
      function add(str, wt) { var ws = words(str), j, w; for (j = 0; j < ws.length; j++) { w = ws[j]; if (w.length < 2) continue; if ((p.words[w] || 0) < wt) p.words[w] = wt; } }
      add(p.title, W_TITLE); add(p.keywords, W_KW); add(p.desc, W_DESC);
      (p.sections || []).forEach(function (s) { s.headLC = lc(s.head); s.textLC = lc(s.text); add(s.head, W_HEAD); add(s.text, W_BODY); });
      for (var w in p.words) { if (w.length >= 3) { var c = w.charAt(0); (vocab[c] || (vocab[c] = [])).push(w); } }
    });
    // dedupe each vocab bucket and record every word for the real-word check
    for (var c in vocab) {
      vocab[c] = Object.keys(vocab[c].reduce(function (m, w) { m[w] = 1; return m; }, Object.create(null)));
      for (var u = 0; u < vocab[c].length; u++) vocabSet.add(vocab[c][u]);
    }
    data = posts;
  }

  function load() {
    if (data || loading) return;
    loading = true;
    fetch('search-index.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { prepare(j); loading = false; if (document.activeElement === input && input.value.trim()) run(input.value); })
      .catch(function () { loading = false; });
  }

  // ---- scoring --------------------------------------------------------------
  function termScore(p, t, fz) {
    var s = W_TITLE * tier(p.titleLC, t);
    s = Math.max(s, W_KW * tier(p.kwLC, t), W_DESC * tier(p.descLC, t));
    for (var i = 0; i < p.sections.length; i++) {
      var sec = p.sections[i];
      s = Math.max(s, W_HEAD * tier(sec.headLC, t), W_BODY * tier(sec.textLC, t));
      if (s >= 0.7) break;
    }
    for (var w in fz) { var wt = p.words[w]; if (wt !== undefined) s = Math.max(s, wt * (fz[w] === 1 ? 0.6 : 0.42)); }
    return s;
  }

  function scorePost(p, terms, fuzz) {
    var total = 0, allInTitle = true;
    for (var k = 0; k < terms.length; k++) {
      var ts = termScore(p, terms[k], fuzz[k]);
      if (ts === 0) return -1;                       // AND: every term must land
      if (tier(p.titleLC, terms[k]) === 0) allInTitle = false;
      total += ts;
    }
    if (allInTitle) total += 0.6;
    return total + p.recency * 0.05;
  }

  // strings actually present in the post that satisfied each term (typed term +
  // any fuzzy word that hit), used for the snippet + the highlighting.
  function matchedStrings(p, terms, fuzz) {
    var out = [];
    for (var k = 0; k < terms.length; k++) {
      out.push(terms[k]);
      var fz = fuzz[k];
      for (var w in fz) if (p.words[w] !== undefined) out.push(w);
    }
    return out;
  }

  // snippet + deep-link: earliest section whose body holds a match, else a
  // section whose heading matches, else the blurb.
  function describe(p, ms) {
    var i, s, pos, j, t;
    for (i = 0; i < p.sections.length; i++) {
      s = p.sections[i]; pos = -1;
      for (j = 0; j < ms.length; j++) { t = s.textLC.indexOf(ms[j]); if (t >= 0 && (pos < 0 || t < pos)) pos = t; }
      if (pos >= 0) return { snippet: windowAround(s.text, pos), label: s.head, url: anchor(p, s) };
    }
    for (i = 0; i < p.sections.length; i++) {
      s = p.sections[i];
      for (j = 0; j < ms.length; j++) if (s.headLC.indexOf(ms[j]) >= 0) return { snippet: clip(s.text, 150) || p.desc, label: s.head, url: anchor(p, s) };
    }
    return { snippet: p.desc || (p.sections[0] ? clip(p.sections[0].text, 150) : ''), label: '', url: p.url };
  }
  function anchor(p, s) { return s && s.id ? p.url + '#' + s.id : p.url; }
  function windowAround(text, pos) {
    var start = Math.max(0, pos - 50), s = text.slice(start, start + 150);
    if (start > 0) s = '…' + s;
    if (start + 150 < text.length) s = s + '…';
    return s;
  }
  function hi(text, ms) {
    var out = esc(text);
    var safe = ms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).filter(Boolean);
    if (!safe.length) return out;
    safe.sort(function (a, b) { return b.length - a.length; });   // longer first, so words win over their prefixes
    try { return out.replace(new RegExp('(' + safe.join('|') + ')', 'gi'), '<mark class="hs-hi">$1</mark>'); }
    catch (e) { return out; }
  }

  // ---- run a query ----------------------------------------------------------
  function run(raw) {
    lastQuery = raw;
    var terms = lc(raw).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) { close(); return; }
    if (!data) { load(); return; }

    var fuzz = terms.map(fuzzyFor);
    var scored = [];
    for (var i = 0; i < data.length; i++) {
      var sc = scorePost(data[i], terms, fuzz);
      if (sc >= 0) scored.push({ post: data[i], score: sc });
    }
    // live posts always before archived; then by score
    scored.sort(function (a, b) { return (a.post.archived ? 1 : 0) - (b.post.archived ? 1 : 0) || b.score - a.score; });

    results = scored.slice(0, LIMIT).map(function (r) {
      var ms = matchedStrings(r.post, terms, fuzz);
      var d = describe(r.post, ms);
      return { post: r.post, url: d.url, label: d.label, archived: !!r.post.archived, snippetHTML: hi(d.snippet, ms), titleHTML: hi(r.post.title, ms) };
    });
    active = results.length ? 0 : -1;
    render(scored.length);
    open();
  }

  function rowHTML(r, i) {
    var meta = r.archived
      ? '<span class="hs-res-arch">Archived</span>'
      : '<span class="hs-res-date">' + esc(r.post.dateDisplay || '') + '</span>';
    var label = r.label ? '<span class="hs-res-in">in ' + esc(r.label) + '</span>' : '';
    return '<a class="hs-res' + (r.archived ? ' is-arch' : '') + '" role="option" id="hs-opt-' + i + '" href="' + r.url + '"' +
      (i === active ? ' aria-selected="true"' : '') + ' data-i="' + i + '" tabindex="-1">' +
      '<span class="hs-res-thumb">' + (r.post.thumb ? '<img src="' + r.post.thumb + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
      '<span class="hs-res-main">' +
        '<span class="hs-res-top"><span class="hs-res-title">' + r.titleHTML + '</span>' + meta + '</span>' +
        '<span class="hs-res-snip">' + label + r.snippetHTML + '</span>' +
      '</span>' +
      '<span class="hs-res-go" aria-hidden="true">→</span>' +
    '</a>';
  }

  function render(totalMatches) {
    var html;
    if (!results.length) {
      html = '<div class="hs-empty">No posts match “' + esc(lastQuery.trim()) + '”</div>';
      if (live) live.textContent = 'No posts match';
    } else {
      html = '';
      var archHeader = false;
      for (var i = 0; i < results.length; i++) {
        if (results[i].archived && !archHeader) { archHeader = true; html += '<div class="hs-group">Archived posts</div>'; }
        html += rowHTML(results[i], i);
      }
      html += '<div class="hs-foot"><span><b>↑</b><b>↓</b> to move</span><span><b>↵</b> to open</span><span class="hs-foot-count">' + totalMatches + ' match' + (totalMatches === 1 ? '' : 'es') + '</span></div>';
      if (live) live.textContent = totalMatches + ' match' + (totalMatches === 1 ? '' : 'es');
    }
    panel.innerHTML = html;
    paintActive();
  }

  function paintActive() {
    var opts = panel.querySelectorAll('.hs-res');
    for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('is-active', i === active);
    input.setAttribute('aria-activedescendant', active >= 0 && results.length ? 'hs-opt-' + active : '');
    if (active >= 0 && opts[active]) opts[active].scrollIntoView({ block: 'nearest' });
  }

  // ---- open / close ---------------------------------------------------------
  var isOpen = false;
  function open() { if (isOpen) return; isOpen = true; panel.classList.add('is-open'); input.setAttribute('aria-expanded', 'true'); }
  function close() {
    if (!isOpen) { panel.classList.remove('is-open'); return; }
    isOpen = false; active = -1;
    panel.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-activedescendant', '');
    if (live) live.textContent = '';
  }
  function go(i) { var r = results[i]; if (r) window.location.href = r.url; }

  // ---- events ---------------------------------------------------------------
  input.addEventListener('focus', function () { load(); if (input.value.trim()) run(input.value); });
  input.addEventListener('input', function () { run(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { if (!isOpen) { run(input.value); return; } e.preventDefault(); if (results.length) { active = (active + 1) % results.length; paintActive(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { active = (active - 1 + results.length) % results.length; paintActive(); } }
    else if (e.key === 'Enter') { if (isOpen && active >= 0) { e.preventDefault(); go(active); } }
    else if (e.key === 'Escape') { if (isOpen) { e.preventDefault(); close(); } else if (input.value) { input.value = ''; close(); } else { input.blur(); } }
    else if (e.key === 'Tab') { close(); }
  });
  panel.addEventListener('mousemove', function (e) {
    var row = e.target.closest('.hs-res'); if (!row) return;
    var i = +row.getAttribute('data-i'); if (i !== active) { active = i; paintActive(); }
  });
  panel.addEventListener('mousedown', function (e) { if (e.target.closest('.hs-res')) e.preventDefault(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.home-search')) close(); });
  input.addEventListener('blur', function () { setTimeout(function () { if (!panel.contains(document.activeElement)) close(); }, 120); });
  document.addEventListener('keydown', function (e) {
    var ae = document.activeElement, typing = ae && /^(input|textarea|select)$/i.test(ae.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
  });

  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 }); else setTimeout(load, 1500);
})();
