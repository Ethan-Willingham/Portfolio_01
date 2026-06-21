/* ============================================================
   Marcus Aurelius, Meditations, side by side.
   Interactive explorer: pick a passage (cited Book.Section), read
   the Koine Greek source, then compare the English translations in
   the corpus, with a plain-language breakdown of what the passage
   says and where the translators split.

   Data:  window.MARCUS        (js/marcus-data.js)  -> {translators, order, entries}
   Notes: window.MARCUS_NOTES  (js/marcus-notes.js) -> per-passage commentary, keyed by "B.S"
   No dependencies. Vanilla, deferred. No em dashes in my own text;
   the translations are quoted verbatim and keep their punctuation.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: the three complete public-domain translations
     (Casaubon 1634, Long 1862, Haines 1916) plus the beloved modern
     (Hays 2002), shown chronologically, so a first read is a clean
     spread across four centuries. "All" adds the other moderns. */
  var KEY = ['casaubon', 'long', 'haines', 'staniforth', 'hays'];

  var DATA, NOTES, cur = 0, view = 'key';
  var $ = function (id) { return document.getElementById(id); };

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
        '<p class="marc-zh-k">Source <span>Koine Greek, written c. 170s CE</span></p>' +
        '<p class="marc-zh" lang="grc">' + esc(e.gk) + '</p>';
    } else {
      $('marc-source').innerHTML =
        '<p class="marc-zh-k">Source <span>Marcus wrote in Koine Greek; this passage is shown in translation only</span></p>';
    }

    /* commentary */
    $('marc-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="marc-v marc-' + era(m.year) + '">' +
        '<header class="marc-vh"><span class="marc-vn">' + esc(m.name) + '</span>' +
        '<span class="marc-vy">' + (m.year || '') + '</span></header>' +
        '<div class="marc-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('marc-versions').innerHTML = out ||
      '<p class="marc-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#marc-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#marc-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', b.getAttribute('data-ref') === refOf(e));
    });
    $('marc-prev').disabled = cur === 0;
    $('marc-next').disabled = cur === DATA.entries.length - 1;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="marc-note-soon">A plain-language breakdown of this passage is on the way. For now, compare the renderings below.</p>';
    }
    var h = '<div class="marc-note-card">';
    if (note.gist) {
      h += '<p class="marc-note-k">What it says</p><p class="marc-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="marc-note-k">The Greek behind it</p>';
      h += '<dl class="marc-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.gk ? '<span lang="grc">' + esc(s.gk) + '</span> ' : '') +
          (s.gloss ? '<span class="marc-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="marc-note-k">My read</p><p class="marc-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, mode) {
    cur = Math.max(0, Math.min(DATA.entries.length - 1, n));
    render();
    if (mode !== false) history.replaceState(null, '', '#' + refOf(entry(cur)));
    var top = document.getElementById('marc');
    if (mode === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        btn.onclick = (function (n) { return function () { pop.hidden = true; go(n, 'scroll'); }; })(o.i);
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
    $('marc-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildIndex(pop);
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
    DATA = window.MARCUS;
    NOTES = window.MARCUS_NOTES || {};
    if (!DATA) { setTimeout(boot, 60); return; }
    var i = indexOfRef(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = document.getElementById('marc');
    if (mount) mount.classList.add('marc-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
