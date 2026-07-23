/* ============================================================================
   search.js  -  the homepage search (a "find in the posts" typeahead).

   A literal CONTAINS search over a prebuilt index (search-index.json, made by
   tools/build-search-index.mjs). As you type, each result shows how many times
   the exact string occurs in that post and the FIRST occurrence in context, with
   the typed characters highlighted, like find-in-page across the whole site.

   - Literal substring match (precise: only posts that actually contain the text).
   - Per result: a "N matches" count + a context snippet (words either side).
   - Deep-links into the section the first hit lives in.
   - No guessing: if nothing contains the typed text, it shows no results. It
     never substitutes a near word for what you typed.
   - Archived posts are searchable, amber-flagged, and always after live posts.

   Lazy-loaded on first focus. Full keyboard + combobox a11y. No deps. No em dashes.
   ============================================================================ */
(function () {
  'use strict';

  var input = document.querySelector('.hs-input');
  var panel = document.getElementById('hs-panel');
  var live  = document.querySelector('.hs-readout');
  if (!input || !panel) return;

  // scope: 'home' (every non-archived post, the default), 'archive' (archived
  // posts only), or a hub slug (only that hub's posts). Set via the input's
  // data-search-scope attribute. The home scope includes the hub child posts,
  // so searching the homepage still finds a post that now lives inside a hub.
  var scope = input.getAttribute('data-search-scope') || 'home';
  function inScope(p) {
    if (scope === 'home') return !p.archived;
    if (scope === 'archive') return !!p.archived;
    return p.hub === scope || (p.hubs && p.hubs.indexOf(scope) >= 0);
  }

  var LIMIT = 6;            // results shown (kept tight on purpose)
  var data = null;
  var loading = false;
  var results = [];
  var active = -1;
  var lastQuery = '';

  // ---- text helpers ---------------------------------------------------------
  function lc(s) { return (s || '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
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

  // ---- prepare the index once ----------------------------------------------
  function prepare(payload) {
    var posts = payload.posts || [], n = posts.length;
    posts.forEach(function (p, i) {
      p.titleLC = lc(p.title); p.recency = n > 1 ? (n - 1 - i) / (n - 1) : 1;
      (p.sections || []).forEach(function (s) { s.headLC = lc(s.head); s.textLC = lc(s.text); });
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
      var p = data[pi];
      if (!inScope(p)) continue;
      var titleCount = countOf(p.titleLC, q), count = titleCount, firstSec = -1, firstPos = -1, headHits = 0;
      for (var si = 0; si < p.sections.length; si++) {
        var sec = p.sections[si];
        var hc = countOf(sec.headLC, q); headHits += hc;
        count += hc + countOf(sec.textLC, q);
        if (firstSec < 0) { var ph = sec.textLC.indexOf(q); if (ph >= 0) { firstSec = si; firstPos = ph; } }
      }
      if (count < 1) continue;
      // A title hit owns the top. A heading hit is only a nudge: kept below
      // the weight of a few body hits, so the visible per-post match counts
      // read as (near) sorted instead of looking shuffled.
      var score = (titleCount > 0 ? 10000 : 0) + headHits * 4 + count + p.recency * 3;
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

    var hits = literalHits(q);          // literal only; no near-word guessing
    var totalInstances = 0, postCount = hits.length, i;
    for (i = 0; i < hits.length; i++) totalInstances += hits[i].count;
    results = hits.slice(0, LIMIT).map(function (h) { return buildResult(h, q); });
    active = results.length ? 0 : -1;
    render(q, totalInstances, postCount);
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

  function render(q, totalInstances, postCount) {
    var html;
    if (!results.length) {
      html = '<div class="hs-empty">No matches for “' + esc(q) + '”</div>';
      if (live) live.textContent = 'No matches';
    } else {
      html = '';
      var archHeader = false;
      for (var i = 0; i < results.length; i++) {
        if (scope !== 'archive' && results[i].archived && !archHeader) { archHeader = true; html += '<div class="hs-group">Archived posts</div>'; }
        html += rowHTML(results[i], i);
      }
      var label = totalInstances + ' match' + (totalInstances === 1 ? '' : 'es') + ' in ' + postCount + ' post' + (postCount === 1 ? '' : 's');
      html += '<div class="hs-foot"><span class="hs-foot-count">' + label + '</span></div>';
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

  // Idle-prefetch the index (so the first keystroke is instant) only where the
  // connection is likely unmetered: desktop-class pointers, and never against
  // an explicit Save-Data signal. Phones skip the ~600 KB prefetch and load it
  // on first focus (or the / shortcut) instead.
  var conn = navigator.connection || {};
  var prefetch = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches && !conn.saveData;
  if (prefetch) {
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 }); else setTimeout(load, 1500);
  }
})();

/* ---------------------------------------------------------------------------
   Resonant hairline. A hairline is rendered on a <canvas> as a plucked string:
   a 1-D damped wave equation. Click or tap it to strum it at that point; the
   masthead search also plucks at the caret as you type. The loop runs only
   while there is energy (free at rest) and is skipped under prefers-reduced-
   motion, where the static CSS line stays. Mounted on the search underline and
   on the footer's top rule.
--------------------------------------------------------------------------- */
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var docCss = getComputedStyle(document.documentElement);
  function toRgb(name, fallback) {
    var v = (docCss.getPropertyValue(name) || fallback).trim().replace('#', '');
    if (v.length === 3) v = v.replace(/./g, '$&$&');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  var RULE = toRgb('--rule', '#4A544B'), ACC = toRgb('--accent', '#D4C4A0');
  var DPR = Math.min(2, window.devicePixelRatio || 1);

  function mountWave(host, opts) {
    var input = opts.input || null;
    var cv = document.createElement('canvas');
    cv.className = opts.cls;
    cv.setAttribute('aria-hidden', 'true');
    host.classList.add('wave-on');
    host.appendChild(cv);
    var ctx = cv.getContext('2d');
    var meas = input ? document.createElement('canvas').getContext('2d') : null;

    var N = 200, u = new Float32Array(N), vel = new Float32Array(N);
    var W = 0, H = 0, base = 0, focused = false, raf = null, warm = 0;
    var STIFF = 0.28, VDAMP = 0.992, AMP = 4.5, WARM_FADE = 0.012;

    function size() {
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * DPR));
      cv.height = Math.max(1, Math.round(H * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      base = H / 2;
      draw();
    }
    function caretX() {
      var s = getComputedStyle(input);
      meas.font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
      var w = meas.measureText(input.value).width;
      var left = input.getBoundingClientRect().left - cv.getBoundingClientRect().left;
      return Math.max(2, Math.min(W - 2, left + w));
    }
    function pluck(x, amp) {
      var c = Math.max(1, Math.min(N - 2, Math.round(x / W * (N - 1))));
      for (var k = -7; k <= 7; k++) { var j = c + k; if (j < 1 || j > N - 2) continue; u[j] += amp * Math.exp(-(k * k) / 10); }
      warm = 1;
      run();
    }
    function energy() { var e = 0; for (var i = 0; i < N; i++) e += u[i] * u[i] + vel[i] * vel[i]; return e; }
    function step() {
      var i, a;
      for (i = 1; i < N - 1; i++) { a = STIFF * (u[i - 1] + u[i + 1] - 2 * u[i]); vel[i] = (vel[i] + a) * VDAMP; }
      u[0] = u[N - 1] = 0; vel[0] = vel[N - 1] = 0;
      for (i = 1; i < N - 1; i++) u[i] += vel[i];
      warm = Math.max(0, warm - WARM_FADE);
      draw();
      if (energy() > 0.02 || warm > 0.01) { raf = requestAnimationFrame(step); }
      else { warm = 0; raf = null; draw(); }
    }
    function run() { if (!raf) raf = requestAnimationFrame(step); }
    function draw() {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      var t = Math.max(focused ? 0.22 : 0, warm);
      var cr = Math.round(RULE[0] + (ACC[0] - RULE[0]) * t), cg = Math.round(RULE[1] + (ACC[1] - RULE[1]) * t), cb = Math.round(RULE[2] + (ACC[2] - RULE[2]) * t);
      // One uniform color across, matching the static hairline. The accent warmth
      // snaps to full on a pluck and fades back at a steady linear rate (WARM_FADE
      // per frame), decoupled from the noisier ring energy, so it lingers a beat
      // and dissolves smoothly instead of flickering or staircasing.
      ctx.strokeStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < N; i++) { var x = i / (N - 1) * W, y = base + u[i]; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }

    if (input) {
      input.addEventListener('focus', function () { focused = true; draw(); });
      input.addEventListener('blur', function () { focused = false; draw(); });
      input.addEventListener('input', function () { pluck(caretX(), AMP); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') pluck(W * 0.5, AMP * 1.5); });
    }
    // Click or tap the line to strum it right there. preventDefault keeps focus
    // where it is (no keyboard popup on touch, an open results panel stays open).
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); pluck(e.clientX - cv.getBoundingClientRect().left, AMP * 1.6); });
    cv.addEventListener('mousedown', function (e) { e.preventDefault(); });

    if (window.ResizeObserver) new ResizeObserver(size).observe(cv); else window.addEventListener('resize', size);
    size();
  }

  var search = document.querySelector('.home-search');
  if (search && search.querySelector('.hs-input')) mountWave(search, { cls: 'hs-wave', input: search.querySelector('.hs-input') });

  var footer = document.querySelector('.site-footer-inner');
  if (footer) mountWave(footer, { cls: 'foot-wave' });
})();
