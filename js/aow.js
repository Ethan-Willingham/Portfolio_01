/* ============================================================
   The Art of War, side by side.
   Interactive explorer: step through the keystone passages, read
   the Chinese source, then compare every English translation in
   the corpus, with a plain-language breakdown of what the passage
   says and where the translators split.

   Data:  window.AOW        (js/aow-data.js)  -> {translators, order, passages}
   Notes: window.AOW_NOTES  (js/aow-notes.js) -> per-passage commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var AOW, NOTES, cur = 1, N = 0;
  var $ = function (id) { return document.getElementById(id); };

  function passage(n) { return AOW.passages[n - 1]; }
  function meta(k) { return AOW.translators[k] || { name: k, year: null, n: 0 }; }

  /* three eras for the colored left border: Giles (1910), Griffith
     (1963), then the modern wave from Cleary 1988 on. */
  function era(y) {
    if (!y) return '';
    if (y < 1950) return 'early';
    if (y < 1981) return 'mid';
    return 'modern';
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
      return l === '' ? '<span class="aow-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var p = passage(cur), note = NOTES[cur] || {}, sel = selection(cur);

    $('aow-pno').textContent = 'Passage ' + cur + ' / ' + N;
    $('aow-title').textContent = note.title ? note.title : '';
    $('aow-count').innerHTML = '<b>' + sel.length + '</b> translations';

    /* source */
    $('aow-source').innerHTML =
      '<p class="aow-zh-k">Chapter ' + p.ch +
      ' <span>&middot; <span lang="zh">' + esc(p.chZh) + '</span> &middot; ' +
      esc(p.chTitle) + ' &middot; received text, China, by ~4th c. BCE</span></p>' +
      '<p class="aow-zh" lang="zh">' + esc(p.zh || '') + '</p>';

    /* commentary */
    $('aow-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="aow-v aow-' + era(m.year) + '">' +
        '<header class="aow-vh"><span class="aow-vn">' + esc(m.name) + '</span>' +
        '<span class="aow-vy">' + (m.year || '') + '</span></header>' +
        '<div class="aow-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('aow-versions').innerHTML = out;

    document.querySelectorAll('#aow-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-n') === cur);
    });
    $('aow-prev').disabled = cur === 1;
    $('aow-next').disabled = cur === N;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="aow-note-soon">A plain-language breakdown of this passage is on the way. For now, compare the renderings below.</p>';
    }
    var h = '<div class="aow-note-card">';
    if (note.gist) {
      h += '<p class="aow-note-k">What it says</p><p class="aow-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="aow-note-k">Where the translators split</p>';
      h += '<dl class="aow-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.zh ? '<span lang="zh">' + esc(s.zh) + '</span> ' : '') +
          (s.gloss ? '<span class="aow-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="aow-note-k">My read</p><p class="aow-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, scroll) {
    cur = Math.max(1, Math.min(N, n));
    render();
    history.replaceState(null, '', '#' + cur);
    var top = $('aow');
    if (scroll === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wire() {
    $('aow-prev').onclick = function () { go(cur - 1); };
    $('aow-next').onclick = function () { go(cur + 1); };

    var pop = $('aow-gridpop');
    $('aow-jump').onclick = function () { pop.hidden = !pop.hidden; };

    /* the jump list: one row per passage, chapter + title */
    AOW.passages.forEach(function (p, i) {
      var n = i + 1, note = NOTES[n] || {};
      var b = document.createElement('button');
      b.setAttribute('data-n', n);
      b.innerHTML = '<span class="aow-jrow-ch">Ch ' + p.ch + '</span>' +
        '<span class="aow-jrow-t">' + esc(note.title || ('Passage ' + n)) + '</span>';
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
    AOW = window.AOW;
    NOTES = window.AOW_NOTES || {};
    if (!AOW) { setTimeout(boot, 60); return; }
    N = AOW.passages.length;
    var n = parseInt(location.hash.slice(1), 10);
    if (n >= 1 && n <= N) cur = n;
    wire();
    render();
    var mount = $('aow');
    if (mount) mount.classList.add('aow-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
