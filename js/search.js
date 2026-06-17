/* ============================================================================
   search.js  -  the homepage search (a "find in the posts" typeahead).

   A literal CONTAINS search over a prebuilt index (search-index.json, made by
   tools/build-search-index.mjs). As you type, each result shows how many times
   the exact string occurs in that post and the FIRST occurrence in context, with
   the typed characters highlighted, like find-in-page across the whole site.

   - Literal substring match (precise: only posts that actually contain the text).
   - Per result: a "N matches" count + a context snippet (words either side).
   - Deep-links into the section the first hit lives in.
   - Typo tolerance is a FALLBACK only: if nothing matches literally, it offers
     the nearest real word (bounded Damerau-Levenshtein), so a misspelling still
     lands without ever loosening a normal query.
   - Archived posts are searchable, amber-flagged, and always after live posts.

   Lazy-loaded on first focus. Full keyboard + combobox a11y. No deps. No em dashes.
   ============================================================================ */
(function () {
  'use strict';

  var input = document.querySelector('.hs-input');
  var panel = document.getElementById('hs-panel');
  var live  = document.querySelector('.hs-readout');
  if (!input || !panel) return;

  var LIMIT = 6;            // results shown (kept tight on purpose)
  var data = null;
  var vocab = {};           // first-char -> words, for the typo fallback only
  var vocabSet = new Set();
  var loading = false;
  var results = [];
  var active = -1;
  var lastQuery = '';

  // ---- text helpers ---------------------------------------------------------
  function lc(s) { return (s || '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
  function tokens(s) { return lc(s).split(/[^a-z0-9]+/); }
  function countOf(s, q) { if (!s) return 0; var c = 0, i = 0; while ((i = s.indexOf(q, i)) >= 0) { c++; i += q.length; } return c; }
  function anchor(p, s) { return s && s.id ? p.url + '#' + s.id : p.url; }

  function hiLiteral(text, q) {
    var out = esc(text);
    if (!q) return out;
    var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return out.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="hs-hi">$1</mark>'); }
    catch (e) { return out; }
  }

  // a context window around a hit: a few words either side, trimmed to whole words.
  function contextWindow(text, pos, qlen) {
    var a = Math.max(0, pos - 34), b = Math.min(text.length, pos + qlen + 120);
    var pre = text.slice(a, pos), mid = text.slice(pos, pos + qlen), post = text.slice(pos + qlen, b);
    if (a > 0) pre = pre.replace(/^\S*\s+/, '');           // drop a clipped leading word
    if (b < text.length) post = post.replace(/\s+\S*$/, '');// drop a clipped trailing word
    return (a > 0 ? '… ' : '') + pre + mid + post + (b < text.length ? ' …' : '');
  }

  // ---- typo fallback machinery (bounded Damerau-Levenshtein) ----------------
  function dist(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i]; var rowBest = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && prev2 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowBest) rowBest = v;
      }
      if (rowBest > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }
  function maxTypos(len) { return len < 4 ? 0 : len < 8 ? 1 : 2; }
  function nearestWord(t) {
    var md = maxTypos(t.length); if (md === 0) return null;
    var bucket = vocab[t.charAt(0)] || [], best = null, bestD = 99;
    for (var k = 0; k < bucket.length; k++) {
      var w = bucket[k];
      if (w === t || Math.abs(w.length - t.length) > md) continue;
      var d = dist(t, w, md);
      if (d <= md && d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  // ---- prepare the index once ----------------------------------------------
  function prepare(payload) {
    var posts = payload.posts || [], n = posts.length;
    vocab = {}; vocabSet = new Set();
    posts.forEach(function (p, i) {
      p.titleLC = lc(p.title); p.recency = n > 1 ? (n - 1 - i) / (n - 1) : 1;
      var seen = Object.create(null);
      function harvest(str) { var ws = tokens(str), j, w; for (j = 0; j < ws.length; j++) { w = ws[j]; if (w.length >= 3 && !seen[w]) { seen[w] = 1; var c = w.charAt(0); (vocab[c] || (vocab[c] = [])).push(w); vocabSet.add(w); } } }
      harvest(p.title); harvest(p.keywords);
      (p.sections || []).forEach(function (s) { s.headLC = lc(s.head); s.textLC = lc(s.text); harvest(s.head); harvest(s.text); });
    });
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

  // ---- the contains search --------------------------------------------------
  function literalHits(q) {
    var hits = [];
    for (var pi = 0; pi < data.length; pi++) {
      var p = data[pi], titleCount = countOf(p.titleLC, q), count = titleCount, firstSec = -1, firstPos = -1, headHits = 0;
      for (var si = 0; si < p.sections.length; si++) {
        var sec = p.sections[si];
        var hc = countOf(sec.headLC, q); headHits += hc;
        count += hc + countOf(sec.textLC, q);
        if (firstSec < 0) { var ph = sec.textLC.indexOf(q); if (ph >= 0) { firstSec = si; firstPos = ph; } }
      }
      if (count < 1) continue;
      var score = (titleCount > 0 ? 10000 : 0) + headHits * 40 + count + p.recency * 3;
      hits.push({ post: p, count: count, score: score, firstSec: firstSec, firstPos: firstPos });
    }
    hits.sort(function (a, b) { return (a.post.archived ? 1 : 0) - (b.post.archived ? 1 : 0) || b.score - a.score; });
    return hits;
  }

  function buildResult(h, q) {
    var p = h.post, url = p.url, label = '', snippet;
    if (h.firstSec >= 0) {
      var sec = p.sections[h.firstSec];
      url = anchor(p, sec); label = sec.head;
      snippet = contextWindow(sec.text, h.firstPos, q.length);
    } else {
      snippet = p.desc || (p.sections[0] ? clip(p.sections[0].text, 150) : '');
    }
    return { post: p, url: url, archived: !!p.archived, count: h.count, label: label, titleHTML: hiLiteral(p.title, q), snippetHTML: hiLiteral(snippet, q) };
  }

  function run(raw) {
    lastQuery = raw;
    var q = lc(raw).replace(/\s+/g, ' ').trim();
    if (q.length < 2) { close(); return; }
    if (!data) { load(); return; }

    var corrected = null, hits = literalHits(q), useQ = q;
    if (!hits.length && q.indexOf(' ') < 0) {     // nothing literal: try a single-word typo fix
      var w = nearestWord(q);
      if (w) { corrected = w; useQ = w; hits = literalHits(w); }
    }

    var totalInstances = 0, postCount = hits.length, i;
    for (i = 0; i < hits.length; i++) totalInstances += hits[i].count;
    results = hits.slice(0, LIMIT).map(function (h) { return buildResult(h, useQ); });
    active = results.length ? 0 : -1;
    render(q, corrected, totalInstances, postCount);
    open();
  }

  function rowHTML(r, i) {
    var n = r.count, countLbl = n + ' match' + (n === 1 ? '' : 'es');
    return '<a class="hs-res' + (r.archived ? ' is-arch' : '') + '" role="option" id="hs-opt-' + i + '" href="' + r.url + '"' +
      (i === active ? ' aria-selected="true"' : '') + ' data-i="' + i + '" tabindex="-1">' +
      '<span class="hs-res-thumb">' + (r.post.thumb ? '<img src="' + r.post.thumb + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
      '<span class="hs-res-main">' +
        '<span class="hs-res-top"><span class="hs-res-title">' + r.titleHTML + '</span><span class="hs-res-count">' + countLbl + '</span></span>' +
        '<span class="hs-res-snip">' + r.snippetHTML + '</span>' +
      '</span>' +
    '</a>';
  }

  function render(q, corrected, totalInstances, postCount) {
    var html;
    if (!results.length) {
      html = '<div class="hs-empty">No text matching “' + esc(q) + '” in any post</div>';
      if (live) live.textContent = 'No matches';
    } else {
      html = '';
      if (corrected) html += '<div class="hs-corrected">Showing matches for <b>' + esc(corrected) + '</b></div>';
      var archHeader = false;
      for (var i = 0; i < results.length; i++) {
        if (results[i].archived && !archHeader) { archHeader = true; html += '<div class="hs-group">Archived posts</div>'; }
        html += rowHTML(results[i], i);
      }
      var label = totalInstances + ' match' + (totalInstances === 1 ? '' : 'es') + ' in ' + postCount + ' post' + (postCount === 1 ? '' : 's');
      html += '<div class="hs-foot"><span><b>↑</b><b>↓</b> move</span><span><b>↵</b> open</span><span class="hs-foot-count">' + label + '</span></div>';
      if (live) live.textContent = label;
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
