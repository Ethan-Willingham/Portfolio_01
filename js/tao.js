/* ============================================================
   The Tao Te Ching, side by side.
   Interactive explorer: pick any of the 81 chapters, begin with
   one plain-language distillation, then compare every English
   translation in the corpus. The stack makes disagreements
   visible without turning the opening into translator notes.

   Data: window.TAO (js/tao-data.js)  -> {translators, order, chapters}
   Notes: window.TAO_NOTES (js/tao-notes.js) -> per-chapter commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The famous translations, the ones people actually own, in
     chronological order. They lead the stack; everything else
     follows in two quieter tiers. */
  var KEY = ['legge', 'gorn-old', 'waley', 'bynner', 'yutang',
    'blakney', 'lau', 'feng-english', 'mitchell', 'henricks', 'addiss-lombardo',
    'le-guin', 'hinton'];

  var TAO, NOTES, cur = 1;
  var $ = function (id) { return document.getElementById(id); };

  function chapter(n) { return TAO.chapters[n - 1]; }
  function meta(k) { return TAO.translators[k] || { name: k, year: null, n: 0 }; }

  function era(y) {
    if (!y) return '';
    if (y < 1920) return 'early';
    if (y < 1970) return 'mid';
    return 'modern';
  }
  function eraLabel(y) {
    if (!y) return '';
    if (y < 1920) return 'Victorian';
    if (y < 1970) return 'mid-century';
    return 'modern';
  }

  /* every version for the chapter, in three tiers: the famous
     translations, the other complete ones, then the long tail of
     partial renderings. Chronological inside each tier. */
  function tiers(n) {
    var c = chapter(n), have = {}, inKey = {};
    c.v.forEach(function (v) { have[v.k] = v; });
    KEY.forEach(function (k) { inKey[k] = true; });
    var byYear = function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); };
    var t1 = KEY.map(function (k) { return have[k]; }).filter(Boolean);
    var t2 = c.v.filter(function (v) { return !inKey[v.k] && meta(v.k).n >= 75; }).sort(byYear);
    var t3 = c.v.filter(function (v) { return !inKey[v.k] && meta(v.k).n < 75; }).sort(byYear);
    return [
      { label: 'The famous ones', list: t1 },
      { label: 'The lesser-known complete translations', list: t2 },
      { label: 'Partial translations', list: t3 }
    ];
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* verse/prose text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="tao-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function vHtml(v) {
    var m = meta(v.k);
    return '<article class="tao-v tao-' + era(m.year) + '">' +
      '<header class="tao-vh"><span class="tao-vn">' + esc(m.name) + '</span>' +
      '<span class="tao-vy">' + (m.year || '') + '</span></header>' +
      '<div class="tao-vt">' + textHtml(v.t) + '</div></article>';
  }

  function render() {
    var c = chapter(cur), note = NOTES[cur] || {};

    $('tao-chno').textContent = 'Chapter ' + cur;
    $('tao-title').textContent = note.title ? note.title : '';
    $('tao-count').innerHTML = '<b>' + c.v.length + '</b> translations';

    /* commentary */
    $('tao-notes').innerHTML = noteHtml(note);

    /* translations, famous first, then complete, then the long tail */
    $('tao-versions').innerHTML = tiers(cur).map(function (g) {
      if (!g.list.length) return '';
      return '<div class="tao-tier"><b>' + g.label + '</b><span>' + g.list.length + '</span></div>' +
        g.list.map(vHtml).join('');
    }).join('');

    document.querySelectorAll('#tao-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.textContent === cur);
    });
    $('tao-prev').disabled = cur === 1;
    $('tao-next').disabled = cur === 81;
  }

  function noteHtml(note) {
    if (!note.plain) {
      return '<p class="tao-note-error">The plain-English opening for this chapter did not load. The translations are still available below.</p>';
    }
    return '<div class="tao-note">' +
      '<p class="tao-note-k">In plain English</p>' +
      '<p class="tao-note-text">' + note.plain + '</p></div>';
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(1, Math.min(81, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + cur);
    var top = document.getElementById('tao');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wire() {
    $('tao-prev').onclick = function () { go(cur - 1); };
    $('tao-next').onclick = function () { go(cur + 1); };
    var pop = $('tao-gridpop');
    $('tao-jump').onclick = function () { pop.hidden = !pop.hidden; };
    for (var i = 1; i <= 81; i++) {
      var b = document.createElement('button');
      b.textContent = i;
      b.onclick = (function (n) { return function () { pop.hidden = true; go(n, 'scroll'); }; })(i);
      pop.appendChild(b);
    }
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var n = parseInt(location.hash.slice(1), 10);
      if (n >= 1 && n <= 81 && n !== cur) go(n, false);
    });
  }

  function boot() {
    TAO = window.TAO;
    NOTES = window.TAO_NOTES || {};
    if (!TAO) { setTimeout(boot, 60); return; }
    var n = parseInt(location.hash.slice(1), 10);
    if (n >= 1 && n <= 81) cur = n;
    wire();
    render();
    var mount = document.getElementById('tao');
    if (mount) mount.classList.add('tao-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
