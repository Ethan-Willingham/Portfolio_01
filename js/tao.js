/* ============================================================
   The Tao Te Ching, side by side.
   Interactive explorer: pick any of the 81 chapters, read the
   Chinese source, then compare every English translation in the
   corpus, with a plain-language breakdown of what the chapter
   says and where the translators split.

   Data: window.TAO (js/tao-data.js)  -> {translators, order, chapters}
   Notes: window.TAO_NOTES (js/tao-notes.js) -> per-chapter commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: a recognizable spread across eras and styles,
     so a first-time reader is not dropped into 45 versions at once. */
  var KEY = ['legge', 'gorn-old', 'waley', 'bynner', 'yutang',
    'blakney', 'lau', 'feng-english', 'mitchell', 'henricks', 'addiss-lombardo',
    'le-guin', 'hinton'];

  var TAO, NOTES, cur = 1, view = 'key';
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

  /* which versions to show for the current chapter + view */
  function selection(n) {
    var c = chapter(n), have = {};
    c.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') {
      return c.v.slice().sort(function (a, b) {
        return (meta(a.k).year || 9999) - (meta(b.k).year || 9999);
      });
    }
    if (view === 'complete') {
      return c.v.filter(function (v) { return meta(v.k).n >= 75; })
        .sort(function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); });
    }
    /* key, in chronological order, only those present in this chapter */
    return KEY.map(function (k) { return have[k]; }).filter(Boolean);
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
  function render() {
    var c = chapter(cur), note = NOTES[cur] || {};
    var total = c.v.length, sel = selection(cur);

    $('tao-chno').textContent = 'Chapter ' + cur;
    $('tao-title').textContent = note.title ? note.title : '';
    $('tao-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source */

    /* commentary */
    $('tao-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="tao-v tao-' + era(m.year) + '">' +
        '<header class="tao-vh"><span class="tao-vn">' + esc(m.name) + '</span>' +
        '<span class="tao-vy">' + (m.year || '') + '</span></header>' +
        '<div class="tao-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('tao-versions').innerHTML = out ||
      '<p class="tao-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#tao-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#tao-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.textContent === cur);
    });
    $('tao-prev').disabled = cur === 1;
    $('tao-next').disabled = cur === 81;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="tao-note-soon">A plain-language breakdown of this chapter is on the way. For now, compare the renderings below.</p>';
    }
    var h = '<div class="tao-note-card">';
    if (note.gist) {
      h += '<p class="tao-note-k">What it says</p><p class="tao-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="tao-note-k">Where the translators split</p>';
      h += '<dl class="tao-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.zh ? '<span lang="zh">' + esc(s.zh) + '</span> ' : '') +
          (s.gloss ? '<span class="tao-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="tao-note-k">My read</p><p class="tao-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
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
    document.querySelectorAll('#tao-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
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
