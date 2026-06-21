/* ============================================================
   The Kamasutra, side by side.
   Interactive explorer: step through the keystone passages, read
   the Sanskrit source, then compare the 1883 Burton translation
   against the 2002 Doniger and Kakar one, with a plain-language
   breakdown of what the passage says and where the two split.

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

  /* two eras for the colored left border: the lone Victorian
     (Burton, 1883) against the modern scholarship (Doniger and
     Kakar, 2002). The split between those columns is the page. */
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
    $('kama-count').innerHTML = '<b>' + sel.length + '</b> translations';

    /* source */
    $('kama-source').innerHTML =
      '<p class="kama-sa-k">Book ' + p.book +
      ' <span>&middot; ' + esc(p.bookTitle) + ' &middot; Kamasutra ' + esc(p.ref) + '</span></p>' +
      '<p class="kama-sa" lang="sa">' + esc(p.iast || '') + '</p>' +
      (p.gloss ? '<p class="kama-gloss-cap">' + esc(p.gloss) + '</p>' : '');

    /* commentary */
    $('kama-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="kama-v kama-' + era(m.year) + '">' +
        '<header class="kama-vh"><span class="kama-vn">' + esc(m.name) + '</span>' +
        '<span class="kama-vy">' + (m.year || '') + '</span></header>' +
        '<div class="kama-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('kama-versions').innerHTML = out;

    document.querySelectorAll('#kama-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-n') === cur);
    });
    $('kama-prev').disabled = cur === 1;
    $('kama-next').disabled = cur === N;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="kama-note-soon">A plain-language breakdown of this passage is on the way. For now, compare the two translations below.</p>';
    }
    var h = '<div class="kama-note-card">';
    if (note.gist) {
      h += '<p class="kama-note-k">What it says</p><p class="kama-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="kama-note-k">Where the translators split</p>';
      h += '<dl class="kama-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.sa ? '<span lang="sa">' + esc(s.sa) + '</span> ' : '') +
          (s.gloss ? '<span class="kama-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="kama-note-k">My read</p><p class="kama-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
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
    $('kama-jump').onclick = function () { pop.hidden = !pop.hidden; };

    /* the jump list: one row per passage, book + title */
    KAMA.passages.forEach(function (p, i) {
      var n = i + 1, note = NOTES[n] || {};
      var b = document.createElement('button');
      b.setAttribute('data-n', n);
      b.innerHTML = '<span class="kama-jrow-ch">Bk ' + p.book + '</span>' +
        '<span class="kama-jrow-t">' + esc(note.title || ('Passage ' + n)) + '</span>';
      b.onclick = (function (k) { return function () { pop.hidden = true; go(k, 'scroll'); }; })(n);
      pop.appendChild(b);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
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
