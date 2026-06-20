/* ============================================================
   The Bhagavad Gita, side by side.
   Interactive explorer: pick any of the 700 verses, read the
   Sanskrit source (Devanagari + transliteration), then compare
   every English translation in the corpus, with a plain-language
   breakdown of the keystone verses and where the translators split.

   Data:  window.GITA        (js/gita-data.js)  -> {translators, order, chapters, verses}
   Notes: window.GITA_NOTES  (js/gita-notes.js) -> per-verse commentary, keyed by "ch.vn"
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: a recognizable spread across eras and styles, so a
     first-time reader is not dropped into every version at once. A Victorian
     scholar, the Victorian verse that reached the West, a Theosophist, a
     modern monastic, and the academic and poetic moderns. Only those present
     on a given verse are shown, so a plain verse shows the full-length
     translations and a keystone verse adds the moderns. */
  var KEY = ['arnold', 'telang', 'purohit', 'sivananda', 'adidevananda',
    'gambirananda', 'easwaran', 'miller', 'mitchell'];

  var GITA, NOTES, cur = 1, view = 'key', TOTAL = 700;
  var refToN = {}, nToRef = {};
  var $ = function (id) { return document.getElementById(id); };

  function verse(n) { return GITA.verses[n - 1]; }
  function meta(k) { return GITA.translators[k] || { name: k, year: null, n: 0 }; }
  function refOf(n) { return nToRef[n] || ''; }
  function chapterOf(n) {
    var ch = verse(n).ch;
    return GITA.chapters[ch - 1] || GITA.chapters[0];
  }
  function note(n) { return NOTES[refOf(n)] || {}; }
  function hasNote(n) {
    var x = note(n);
    return !!(x && (x.gist || (x.splits && x.splits.length)));
  }

  function era(y) {
    if (!y) return '';
    if (y < 1950) return 'early';
    if (y < 2000) return 'mid';
    return 'modern';
  }

  /* which versions to show for the current verse + view */
  function selection(n) {
    var c = verse(n), have = {};
    c.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') {
      return c.v.slice().sort(function (a, b) {
        return (meta(a.k).year || 9999) - (meta(b.k).year || 9999);
      });
    }
    if (view === 'complete') {
      return c.v.filter(function (v) { return meta(v.k).n >= 650; })
        .sort(function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); });
    }
    /* key, in chronological order, only those present on this verse */
    return KEY.map(function (k) { return have[k]; }).filter(Boolean)
      .sort(function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); });
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* verse/prose text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t || '').split('\n').map(function (l) {
      return l === '' ? '<span class="gita-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var c = verse(cur), nt = note(cur), ch = chapterOf(cur);
    var total = c.v.length, sel = selection(cur);

    $('gita-ref').textContent = refOf(cur);
    $('gita-title').textContent = nt.title ? nt.title : ch.en;
    $('gita-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source */
    $('gita-source').innerHTML =
      '<p class="gita-sa-k">Sanskrit source <span>chapter ' + c.ch + ', verse ' +
        c.vn + ' &middot; ' + esc(ch.sa) + '</span></p>' +
      (c.dev ? '<p class="gita-dev" lang="sa">' + textHtml(c.dev) + '</p>' : '') +
      (c.iast ? '<p class="gita-iast" lang="sa-Latn">' + textHtml(c.iast) + '</p>' : '');

    /* commentary */
    $('gita-notes').innerHTML = noteHtml(nt);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="gita-v gita-' + era(m.year) + '">' +
        '<header class="gita-vh"><span class="gita-vn">' + esc(m.name) + '</span>' +
        '<span class="gita-vy">' + (m.year || '') + '</span></header>' +
        '<div class="gita-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('gita-versions').innerHTML = out ||
      '<p class="gita-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#gita-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#gita-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-n') === cur);
    });
    $('gita-prev').disabled = cur === 1;
    $('gita-next').disabled = cur === TOTAL;
  }

  function noteHtml(nt) {
    if (!nt.gist && !(nt.splits && nt.splits.length)) {
      return '<p class="gita-note-soon">No breakdown on this verse. It is one of the ' +
        'verses I left to speak for itself; compare the renderings below, or jump to a ' +
        '<button class="gita-keylink" id="gita-tokey">keystone verse</button>.</p>';
    }
    var h = '<div class="gita-note-card">';
    if (nt.gist) {
      h += '<p class="gita-note-k">What it says</p><p class="gita-note-gist">' +
        nt.gist + '</p>';
    }
    if (nt.splits && nt.splits.length) {
      h += '<p class="gita-note-k">Where the translators split</p>';
      h += '<dl class="gita-splits">' + nt.splits.map(function (s) {
        var word = s.sa || '';
        return '<dt>' + (word ? '<span lang="sa-Latn">' + esc(word) + '</span> ' : '') +
          (s.gloss ? '<span class="gita-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (nt.read) {
      h += '<p class="gita-note-k">My read</p><p class="gita-note-read">' + nt.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(1, Math.min(TOTAL, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + refOf(cur));
    var top = document.getElementById('gita');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* jump to the next/previous verse that carries a breakdown */
  function goKeystone(dir) {
    var n = cur;
    for (var i = 0; i < TOTAL; i++) {
      n += dir;
      if (n < 1) n = TOTAL; if (n > TOTAL) n = 1;
      if (hasNote(n)) { go(n, 'scroll'); return; }
    }
  }

  function buildGrid(pop) {
    GITA.chapters.forEach(function (ch) {
      var sec = document.createElement('div');
      sec.className = 'gita-gridsec';
      sec.innerHTML = '<p class="gita-gridlabel"><span>' + ch.n + ' &middot; ' +
        esc(ch.sa) + '</span>' + esc(ch.en) + '</p>';
      var row = document.createElement('div');
      row.className = 'gita-gridrow';
      for (var n = ch.from; n <= ch.to; n++) {
        var b = document.createElement('button');
        b.textContent = verse(n).vn;
        b.setAttribute('data-n', n);
        b.title = refOf(n);
        if (hasNote(n)) b.className = 'has-note';
        b.onclick = (function (m) { return function () { pop.hidden = true; go(m, 'scroll'); }; })(n);
        row.appendChild(b);
      }
      sec.appendChild(row);
      pop.appendChild(sec);
    });
  }

  function wire() {
    $('gita-prev').onclick = function () { go(cur - 1); };
    $('gita-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#gita-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('gita-gridpop');
    $('gita-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    if ($('gita-keyprev')) $('gita-keyprev').onclick = function () { goKeystone(-1); };
    if ($('gita-keynext')) $('gita-keynext').onclick = function () { goKeystone(1); };
    /* delegated: the "jump to a keystone" link inside an empty breakdown */
    $('gita-notes').addEventListener('click', function (e) {
      if (e.target && e.target.id === 'gita-tokey') goKeystone(1);
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var n = refToN[location.hash.slice(1)];
      if (n && n !== cur) go(n, false);
    });
  }

  function indexRefs() {
    GITA.verses.forEach(function (v, i) {
      var n = i + 1, ref = v.ch + '.' + v.vn;
      v.n = n; v.ref = ref;
      refToN[ref] = n; nToRef[n] = ref;
    });
  }

  function boot() {
    GITA = window.GITA;
    NOTES = window.GITA_NOTES || {};
    if (!GITA) { setTimeout(boot, 60); return; }
    TOTAL = GITA.verses.length;
    indexRefs();
    var n = refToN[location.hash.slice(1)];
    if (n) cur = n;
    wire();
    render();
    var mount = document.getElementById('gita');
    if (mount) mount.classList.add('gita-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
