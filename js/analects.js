/* ============================================================
   The Analects of Confucius, side by side.
   Interactive explorer: pick any chapter (cited Book.Chapter, e.g.
   15.24), read the Classical Chinese source, then compare every
   English translation in the corpus, with a plain-language
   breakdown of the keystone chapters and where the translators
   split.

   Data:  window.ANA       (js/analects-data.js)  -> {translators, order, books, chapters}
   Notes: window.ANA_NOTES (js/analects-notes.js) -> per-chapter commentary, keyed "B.C"
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: a recognizable spread across eras and styles, so a
     first-time reader is not dropped into every version at once. The
     complete public-domain and freely-licensed translations carry every
     chapter; the in-copyright moderns appear on the keystone chapters,
     where a breakdown turns on their wording, so a keystone shows a
     fuller stack than a passing line does. Only those present are shown,
     listed oldest to newest. */
  var KEY = ['legge', 'waley', 'lau', 'muller', 'ames', 'slingerland', 'eno'];

  var ANA, NOTES, cur = 0, view = 'key';
  var $ = function (id) { return document.getElementById(id); };

  function chapter(i) { return ANA.chapters[i]; }
  function refOf(ch) { return ch.b + '.' + ch.c; }
  function meta(k) { return ANA.translators[k] || { name: k, year: null, n: 0 }; }
  function book(n) { return ANA.books[n - 1] || ANA.books[0]; }
  function hasNote(ref) {
    var x = NOTES[ref];
    return !!(x && (x.gist || (x.splits && x.splits.length)));
  }

  function era(y) {
    if (!y) return '';
    if (y < 1950) return 'early';
    if (y < 2000) return 'mid';
    return 'modern';
  }

  /* a "complete" translation runs (almost) the whole book; the data marks
     them full:true, with an n-count fallback for safety */
  function isFull(k) {
    var m = meta(k);
    return m.full === true || (m.n && m.n >= ANA.chapters.length - 25);
  }

  /* which versions to show for the current chapter + view */
  function selection(ch) {
    var have = {};
    ch.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') {
      return ch.v.slice().sort(function (a, b) {
        return (meta(a.k).year || 9999) - (meta(b.k).year || 9999);
      });
    }
    if (view === 'complete') {
      return ch.v.filter(function (v) { return isFull(v.k); })
        .sort(function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); });
    }
    /* key, oldest to newest, only those present on this chapter */
    return KEY.map(function (k) { return have[k]; }).filter(Boolean);
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* passage text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="ana-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var ch = chapter(cur), ref = refOf(ch), note = NOTES[ref] || {}, bk = book(ch.b);
    var total = ch.v.length, sel = selection(ch);

    $('ana-chno').textContent = ref;
    $('ana-title').textContent = note.title ? note.title : ('Book ' + ch.b + ', ' + bk.en);
    $('ana-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source */
    $('ana-source').innerHTML =
      '<p class="ana-zh-k">Chinese source <span>' + esc(bk.zh) + ' &middot; Book ' +
        ch.b + ', ' + esc(bk.en) + ' &middot; ' + ref + '</span></p>' +
      '<p class="ana-zh" lang="zh">' + textHtml(ch.zh || '') + '</p>';

    /* commentary */
    $('ana-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="ana-v ana-' + era(m.year) + '">' +
        '<header class="ana-vh"><span class="ana-vn">' + esc(m.name) + '</span>' +
        '<span class="ana-vy">' + (m.year || '') + '</span></header>' +
        '<div class="ana-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('ana-versions').innerHTML = out ||
      '<p class="ana-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#ana-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#ana-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', b.getAttribute('data-ref') === ref);
    });
    $('ana-prev').disabled = cur === 0;
    $('ana-next').disabled = cur === ANA.chapters.length - 1;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="ana-note-soon">No breakdown on this chapter. It is one of the ' +
        'passages I left to speak for itself; compare the renderings below, or jump to a ' +
        '<button class="ana-keylink" id="ana-tokey">keystone chapter</button>.</p>';
    }
    var h = '<div class="ana-note-card">';
    if (note.gist) {
      h += '<p class="ana-note-k">What it says</p><p class="ana-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="ana-note-k">Where the translators split</p>';
      h += '<dl class="ana-splits">' + note.splits.map(function (s) {
        var word = s.zh || '';
        return '<dt>' + (word ? '<span lang="zh">' + esc(word) + '</span> ' : '') +
          (s.gloss ? '<span class="ana-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="ana-note-k">My read</p><p class="ana-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(i, push) {
    cur = Math.max(0, Math.min(ANA.chapters.length - 1, i));
    render();
    if (push !== false) history.replaceState(null, '', '#' + refOf(chapter(cur)));
    var top = document.getElementById('ana');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* jump to the next/previous chapter that carries a breakdown */
  function goKeystone(dir) {
    var n = cur, len = ANA.chapters.length;
    for (var i = 0; i < len; i++) {
      n += dir;
      if (n < 0) n = len - 1; if (n > len - 1) n = 0;
      if (hasNote(refOf(chapter(n)))) { go(n, 'scroll'); return; }
    }
  }

  function indexOfRef(ref) {
    for (var i = 0; i < ANA.chapters.length; i++) {
      if (refOf(ANA.chapters[i]) === ref) return i;
    }
    return -1;
  }

  function buildGrid(pop) {
    ANA.books.forEach(function (bk) {
      var sec = document.createElement('div');
      sec.className = 'ana-gridsec';
      sec.innerHTML = '<p class="ana-gridlabel"><span lang="zh">' + esc(bk.zh) +
        '</span>Book ' + bk.n + ' &middot; ' + esc(bk.en) + '</p>';
      var row = document.createElement('div');
      row.className = 'ana-gridrow';
      ANA.chapters.forEach(function (ch, i) {
        if (ch.b !== bk.n) return;
        var ref = refOf(ch);
        var b = document.createElement('button');
        b.textContent = ch.c;
        b.setAttribute('data-ref', ref);
        b.title = ref;
        if (hasNote(ref)) b.className = 'has-note';
        b.onclick = (function (m) { return function () { pop.hidden = true; go(m, 'scroll'); }; })(i);
        row.appendChild(b);
      });
      sec.appendChild(row);
      pop.appendChild(sec);
    });
  }

  function wire() {
    $('ana-prev').onclick = function () { go(cur - 1); };
    $('ana-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#ana-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('ana-gridpop');
    $('ana-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    if ($('ana-keyprev')) $('ana-keyprev').onclick = function () { goKeystone(-1); };
    if ($('ana-keynext')) $('ana-keynext').onclick = function () { goKeystone(1); };
    /* delegated: the "jump to a keystone" link inside an empty breakdown */
    $('ana-notes').addEventListener('click', function (e) {
      if (e.target && e.target.id === 'ana-tokey') goKeystone(1);
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfRef(location.hash.slice(1));
      if (i >= 0 && i !== cur) go(i, false);
    });
  }

  function boot() {
    ANA = window.ANA;
    NOTES = window.ANA_NOTES || {};
    if (!ANA) { setTimeout(boot, 60); return; }
    var i = indexOfRef(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = document.getElementById('ana');
    if (mount) mount.classList.add('ana-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
