/* ============================================================
   The Kamasutra, side by side.
   Selected passages with editorial explanations, a Sanskrit
   disclosure and excerpts from two English editions.

   Data:  window.KAMA        (js/kama-data.js)  -> {translators, order, passages}
   Notes: window.KAMA_NOTES  (js/kama-notes.js) -> per-passage commentary
   No dependencies. Vanilla, deferred. No em dashes (in my code).
   ============================================================ */
(function () {
  'use strict';

  var KAMA, NOTES, cur = 1, N = 0;
  var $ = function (id) { return document.getElementById(id); };

  function passage(n) { return KAMA.passages[n - 1]; }
  function meta(k) { return KAMA.translators[k] || { name: k, year: null, n: 0 }; }

  /* Edition-era colors are visual identifiers, not quality grades. */
  function era(y) {
    if (!y) return '';
    return y < 1950 ? 'early' : 'modern';
  }

  /* every translation present in this passage, oldest first */
  function selection(n) {
    return passage(n).v.slice().sort(function (a, b) {
      return (meta(a.k).year || 9999) - (meta(b.k).year || 9999);
    });
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* verse/prose text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="kama-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var p = passage(cur), note = NOTES[cur] || {}, sel = selection(cur);

    $('kama-pno').textContent = 'Passage ' + cur + ' / ' + N;
    $('kama-title').textContent = note.title ? note.title : '';
    $('kama-count').innerHTML = '<b>' + sel.length + '</b> editions';

    /* source */
    $('kama-source').innerHTML =
      '<p class="kama-sa-k">Book ' + p.book +
      ' <span>&middot; ' + esc(p.bookTitle) + ' &middot; Kamasutra ' + esc(p.sourceRef || p.ref) + '</span></p>' +
      '<p class="kama-sa" lang="sa">' + textHtml(p.iast || '') + '</p>' +
      (p.gloss ? '<p class="kama-gloss-cap">' + esc(p.gloss) + '</p>' : '');

    /* commentary */
    $('kama-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="kama-v kama-' + era(m.year) + '">' +
        '<header class="kama-vh"><span class="kama-vn"><a href="' + esc(m.url) + '" title="' + esc(m.src) + '">' + esc(m.name) + '</a></span>' +
        '<span class="kama-vy">' + (m.year || '') + '</span></header>' +
        '<div class="kama-vt">' + textHtml(v.t) + '</div>' +
        '<p class="kama-v-cite">' + esc(v.ref || p.ref) +
        (v.page ? ' · <a href="' + esc(v.url) + '">' + esc(v.pageLabel || ('p. ' + v.page)) + '</a>' : '') + '</p></article>';
    }).join('');
    $('kama-versions').innerHTML = out;

    document.querySelectorAll('#kama-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-n') === cur);
    });
    $('kama-prev').disabled = cur === 1;
    $('kama-next').disabled = cur === N;
  }

  function noteHtml(note) {
    var paragraphs = note.plain || [];
    if (!paragraphs.length) return '';
    return '<div class="kama-note-card"><p class="kama-note-k">In plain English</p>' +
      paragraphs.map(function (p) { return '<p class="kama-note-gist">' + p + '</p>'; }).join('') + '</div>';
  }

  /* ---------- navigation ---------- */
  function go(n, scroll) {
    cur = Math.max(1, Math.min(N, n));
    render();
    history.replaceState(null, '', '#' + cur);
    var top = $('kama');
    if (scroll === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wire() {
    $('kama-prev').onclick = function () { go(cur - 1); };
    $('kama-next').onclick = function () { go(cur + 1); };

    var pop = $('kama-gridpop');
    function closeIndex() { pop.hidden = true; $('kama-jump').setAttribute('aria-expanded', 'false'); }
    $('kama-jump').onclick = function () {
      pop.hidden = !pop.hidden;
      $('kama-jump').setAttribute('aria-expanded', String(!pop.hidden));
    };

    /* the jump list: one row per passage, book + title */
    KAMA.passages.forEach(function (p, i) {
      var n = i + 1, note = NOTES[n] || {};
      var b = document.createElement('button');
      b.setAttribute('data-n', n);
      b.innerHTML = '<span class="kama-jrow-ch">Bk ' + p.book + '</span>' +
        '<span class="kama-jrow-t">' + esc(note.title || ('Passage ' + n)) + '</span>';
      b.onclick = (function (k) { return function () { closeIndex(); go(k, 'scroll'); }; })(n);
      pop.appendChild(b);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { closeIndex(); }
    });
    window.addEventListener('hashchange', function () {
      var n = parseInt(location.hash.slice(1), 10);
      if (n >= 1 && n <= N && n !== cur) { cur = n; render(); }
    });
  }

  function boot() {
    KAMA = window.KAMA;
    NOTES = window.KAMA_NOTES || {};
    if (!KAMA) { setTimeout(boot, 60); return; }
    N = KAMA.passages.length;
    var n = parseInt(location.hash.slice(1), 10);
    if (n >= 1 && n <= N) cur = n;
    wire();
    render();
    var mount = $('kama');
    if (mount) mount.classList.add('kama-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
