/* ============================================================
   Marcus Aurelius, Meditations, side by side.
   Interactive explorer: pick a passage (cited Book.Section), read
   an explanation, optional Greek source, and sourced edition excerpts.

   Data:  window.MARCUS        (js/marcus-data.js)  -> {translators, order, entries}
   Notes: window.MARCUS_NOTES  (js/marcus-notes.js) -> per-passage commentary, keyed by "B.S"
   No dependencies. Vanilla, deferred. Edition punctuation is normalized.
   ============================================================ */
(function () {
  'use strict';

  /* The Key view omits the much older Casaubon wording. All adds it. */
  var KEY = ['long', 'haines', 'farquharson', 'hays'];

  var DATA, NOTES, cur = 0, view = 'key';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setIndex(open) {
    $('marc-gridpop').hidden = !open;
    $('marc-jump').setAttribute('aria-expanded', String(open));
  }

  function entry(i) { return DATA.entries[i]; }
  function refOf(e) { return e.b + '.' + e.s; }
  function meta(k) { return DATA.translators[k] || { name: k, year: null }; }

  function era(y) {
    if (!y) return '';
    if (y < 1920) return 'early';
    if (y < 1970) return 'mid';
    return 'modern';
  }
  function byYear(a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); }

  function indexOfRef(ref) {
    for (var i = 0; i < DATA.entries.length; i++) {
      if (refOf(DATA.entries[i]) === ref) return i;
    }
    return -1;
  }

  /* which versions to show for the current entry + view */
  function selection(e) {
    var have = {};
    e.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') return e.v.slice().sort(byYear);
    return KEY.map(function (k) { return have[k]; }).filter(Boolean).sort(byYear);
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* verse/prose text -> html, honoring line + paragraph breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="marc-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var e = entry(cur), note = NOTES[refOf(e)] || {};
    var total = e.v.length, sel = selection(e);

    $('marc-ref').textContent = 'Book ' + e.b + ', ' + e.s;
    $('marc-title').textContent = note.title ? note.title : '';
    $('marc-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source (the Greek) */
    if (e.gk) {
      $('marc-source').innerHTML =
        '<details><summary>Greek source' + (e.gkExcerpt ? ' (excerpt)' : '') + '</summary>' +
        '<p class="marc-zh-k"><a href="' + e.source + '">Received Greek text</a>' +
        ' <span>Book ' + e.b + ', ' + e.s + '; numbering may differ in the linked copy</span></p>' +
        '<p class="marc-zh" lang="grc">' + esc(e.gk) + '</p></details>';
    } else {
      $('marc-source').innerHTML =
        '<p class="marc-zh-k">Source <span>This passage is shown in translation only</span></p>';
    }

    /* commentary */
    $('marc-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="marc-v marc-' + era(m.year) + '">' +
        '<header class="marc-vh"><a class="marc-vn" href="' + v.source + '">' + esc(m.name) + '</a>' +
        '<span class="marc-vy">' + (m.year || '') + '</span></header>' +
        '<p class="marc-vloc">' + esc(v.locator || refOf(e)) + (v.excerpt && !/excerpt/i.test(v.locator || '') ? ' · excerpt' : '') + '</p>' +
        '<div class="marc-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('marc-versions').innerHTML = out ||
      '<p class="marc-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#marc-views button').forEach(function (b) {
      var selected = b.getAttribute('data-view') === view;
      b.classList.toggle('is-on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('#marc-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', b.getAttribute('data-ref') === refOf(e));
    });
    $('marc-prev').disabled = cur === 0;
    $('marc-next').disabled = cur === DATA.entries.length - 1;
  }

  function noteHtml(note) {
    if (!note.plain) return '<p class="marc-note-soon">The passage explanation could not be loaded.</p>';
    return '<div class="marc-note-card"><p class="marc-note-k">In plain English</p>' +
      '<p class="marc-note-gist">' + note.plain + '</p></div>';
  }

  /* ---------- navigation ---------- */
  function go(n, mode) {
    cur = Math.max(0, Math.min(DATA.entries.length - 1, n));
    render();
    if (mode !== false) history.replaceState(null, '', '#' + refOf(entry(cur)));
    var top = document.getElementById('marc');
    if (mode === 'scroll' && top) top.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function buildIndex(pop) {
    /* a compact index grouped by book: "Book N  3 · 7 · 17 ..." */
    var byBook = {};
    DATA.entries.forEach(function (e, i) {
      (byBook[e.b] = byBook[e.b] || []).push({ e: e, i: i });
    });
    Object.keys(byBook).sort(function (a, b) { return a - b; }).forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'marc-grp';
      var lbl = document.createElement('span');
      lbl.className = 'marc-grp-k';
      lbl.textContent = 'Book ' + b;
      row.appendChild(lbl);
      byBook[b].forEach(function (o) {
        var btn = document.createElement('button');
        btn.textContent = o.e.s;
        btn.setAttribute('data-ref', refOf(o.e));
        btn.onclick = (function (n) { return function () { setIndex(false); go(n, 'scroll'); }; })(o.i);
        row.appendChild(btn);
      });
      pop.appendChild(row);
    });
  }

  function wire() {
    $('marc-prev').onclick = function () { go(cur - 1); };
    $('marc-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#marc-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('marc-gridpop');
    $('marc-jump').onclick = function () { setIndex(pop.hidden); };
    buildIndex(pop);
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var i = indexOfRef(link.getAttribute('href').slice(1));
      if (i < 0) return;
      e.preventDefault();
      go(i, 'scroll');
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape' && !pop.hidden) { setIndex(false); $('marc-jump').focus(); }
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfRef(location.hash.slice(1));
      if (i >= 0) go(i, 'scroll');
    });
  }

  function boot() {
    DATA = window.MARCUS;
    NOTES = window.MARCUS_NOTES || {};
    if (!DATA) { setTimeout(boot, 60); return; }
    var i = indexOfRef(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    setIndex(false);
    render();
    var mount = document.getElementById('marc');
    if (mount) mount.classList.add('marc-ready');
    if (i >= 0) window.requestAnimationFrame(function () { go(i, 'scroll'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
