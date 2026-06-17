/* ============================================================================
   search.js  -  the homepage full-text search (typeahead).

   A self-contained, no-dependency search over a prebuilt index
   (search-index.json, made by tools/build-search-index.mjs). It reads the real
   text of every post, ranks them per keystroke (title and headings weigh more
   than body), shows a spring-in dropdown of the best matches with a highlighted
   snippet, and deep-links to the matching section when it can.

   The index is fetched lazily on first focus, so the homepage stays light.
   Full keyboard control (up/down/enter/escape, "/" to focus) and a combobox
   a11y contract. Honours prefers-reduced-motion via CSS. No em dashes.
   ============================================================================ */
(function () {
  'use strict';

  var input = document.querySelector('.hs-input');
  var panel = document.getElementById('hs-panel');
  var live  = document.querySelector('.hs-readout');
  if (!input || !panel) return;

  var LIMIT = 7;              // results shown
  var data = null;           // prepared index
  var loading = false;
  var results = [];          // current result objects
  var active = -1;           // highlighted row index
  var lastQuery = '';

  // ---- text helpers ---------------------------------------------------------
  function lc(s) { return (s || '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }

  // word-aware match strength: whole word 1.0, word prefix 0.7, loose substring 0.4
  function tier(hay, t) {
    if (!hay) return 0;
    var i = hay.indexOf(t);
    if (i < 0) return 0;
    var before = i === 0 ? ' ' : hay.charAt(i - 1);
    var after = hay.charAt(i + t.length) || ' ';
    var bb = /[^a-z0-9]/.test(before), ba = /[^a-z0-9]/.test(after);
    if (bb && ba) return 1.0;
    if (bb) return 0.7;
    if (t.length < 3) return 0;   // short tokens must sit at a word boundary (kills noise)
    return 0.4;
  }

  // ---- prepare the index once (lowercased fields for fast scanning) ---------
  function prepare(payload) {
    var posts = payload.posts || [];
    var n = posts.length;
    posts.forEach(function (p, i) {
      p.titleLC = lc(p.title);
      p.descLC = lc(p.desc);
      p.kwLC = lc(p.keywords);
      p.recency = n > 1 ? (n - 1 - i) / (n - 1) : 1; // list is newest-first
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

  // ---- scoring --------------------------------------------------------------
  function scorePost(p, terms) {
    var total = 0, allInTitle = true;
    for (var k = 0; k < terms.length; k++) {
      var t = terms[k], best = 0;
      best = Math.max(best, 1.00 * tier(p.titleLC, t));
      best = Math.max(best, 0.62 * tier(p.kwLC, t));
      best = Math.max(best, 0.45 * tier(p.descLC, t));
      for (var s = 0; s < p.sections.length; s++) {
        var sec = p.sections[s];
        best = Math.max(best, 0.55 * tier(sec.headLC, t), 0.30 * tier(sec.textLC, t));
        if (best >= 0.55) break; // good enough, stop scanning sections for this term
      }
      if (best === 0) return -1; // AND: every term must land somewhere
      if (tier(p.titleLC, t) === 0) allInTitle = false;
      total += best;
    }
    if (allInTitle) total += 0.6;          // the whole query is in the title -> almost certainly the one
    return total + p.recency * 0.05;        // gentle recency tiebreak
  }

  // pick a snippet + deep-link: earliest section whose body holds a term, else
  // a section whose heading matches, else the card blurb.
  function describe(p, terms) {
    var i, s, lcs, pos, t, j;
    for (i = 0; i < p.sections.length; i++) {
      s = p.sections[i]; lcs = s.textLC; pos = -1;
      for (j = 0; j < terms.length; j++) { t = lcs.indexOf(terms[j]); if (t >= 0 && (pos < 0 || t < pos)) pos = t; }
      if (pos >= 0) return { snippet: windowAround(s.text, pos), label: s.head, url: anchor(p, s) };
    }
    for (i = 0; i < p.sections.length; i++) {
      s = p.sections[i];
      for (j = 0; j < terms.length; j++) {
        if (s.headLC.indexOf(terms[j]) >= 0) return { snippet: clip(s.text, 150) || p.desc, label: s.head, url: anchor(p, s) };
      }
    }
    return { snippet: p.desc || (p.sections[0] ? clip(p.sections[0].text, 150) : ''), label: '', url: p.url };
  }
  function anchor(p, s) { return s && s.id ? p.url + '#' + s.id : p.url; }
  function windowAround(text, pos) {
    var start = Math.max(0, pos - 50);
    var s = text.slice(start, start + 150);
    if (start > 0) s = '…' + s;
    if (start + 150 < text.length) s = s + '…';
    return s;
  }

  function hi(text, terms) {
    var out = esc(text);
    if (!terms.length) return out;
    var safe = terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).filter(Boolean);
    if (!safe.length) return out;
    try { return out.replace(new RegExp('(' + safe.join('|') + ')', 'gi'), '<mark class="hs-hi">$1</mark>'); }
    catch (e) { return out; }
  }

  // ---- run a query ----------------------------------------------------------
  function run(raw) {
    lastQuery = raw;
    var terms = lc(raw).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) { close(); return; }
    if (!data) { load(); return; }

    var scored = [];
    for (var i = 0; i < data.length; i++) {
      var sc = scorePost(data[i], terms);
      if (sc >= 0) scored.push({ post: data[i], score: sc });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    results = scored.slice(0, LIMIT).map(function (r) {
      var d = describe(r.post, terms);
      return { post: r.post, url: d.url, label: d.label, snippetHTML: hi(d.snippet, terms), titleHTML: hi(r.post.title, terms) };
    });
    active = results.length ? 0 : -1;
    render(terms, scored.length);
    open();
  }

  function render(terms, totalMatches) {
    var rows;
    if (!results.length) {
      rows = '<div class="hs-empty">No posts match “' + esc(lastQuery.trim()) + '”</div>';
      if (live) live.textContent = 'No posts match';
    } else {
      rows = results.map(function (r, i) {
        var label = r.label ? '<span class="hs-res-in">in ' + esc(r.label) + '</span>' : '';
        return '<a class="hs-res" role="option" id="hs-opt-' + i + '" href="' + r.url + '"' +
          (i === active ? ' aria-selected="true"' : '') + ' data-i="' + i + '" tabindex="-1">' +
          '<span class="hs-res-thumb">' + (r.post.thumb ? '<img src="' + r.post.thumb + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
          '<span class="hs-res-main">' +
            '<span class="hs-res-top"><span class="hs-res-title">' + r.titleHTML + '</span><span class="hs-res-date">' + esc(r.post.dateDisplay || '') + '</span></span>' +
            '<span class="hs-res-snip">' + label + r.snippetHTML + '</span>' +
          '</span>' +
          '<span class="hs-res-go" aria-hidden="true">→</span>' +
        '</a>';
      }).join('');
      rows += '<div class="hs-foot"><span><b>↑</b><b>↓</b> to move</span><span><b>↵</b> to open</span><span class="hs-foot-count">' + totalMatches + ' match' + (totalMatches === 1 ? '' : 'es') + '</span></div>';
      if (live) live.textContent = totalMatches + ' match' + (totalMatches === 1 ? '' : 'es');
    }
    panel.innerHTML = rows;
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

  // mouse: hover highlights, click is the native <a>
  panel.addEventListener('mousemove', function (e) {
    var row = e.target.closest('.hs-res'); if (!row) return;
    var i = +row.getAttribute('data-i'); if (i !== active) { active = i; paintActive(); }
  });
  panel.addEventListener('mousedown', function (e) {
    // let the click navigate; prevent the input from blurring first and closing us
    var row = e.target.closest('.hs-res'); if (row) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.home-search')) close();
  });
  input.addEventListener('blur', function () { setTimeout(function () { if (!panel.contains(document.activeElement)) close(); }, 120); });

  // "/" focuses the field from anywhere
  document.addEventListener('keydown', function (e) {
    var ae = document.activeElement, typing = ae && /^(input|textarea|select)$/i.test(ae.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
  });

  // warm the index on idle so the first keystroke is instant
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 }); else setTimeout(load, 1500);
})();
