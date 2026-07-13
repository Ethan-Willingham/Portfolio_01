/* ============================================================
   The Hebrew Bible, side by side.
   Interactive explorer for a curated set of keystone passages
   from the Tanakh, read as Judaism reads it. For each passage:
   the pointed Hebrew source, a transliteration of the line that
   matters, a plain-language breakdown of what it says and where
   the translators split, then the English versions stacked.

   Data:  window.HB        (js/hebrew-bible-data.js)  -> {translators, order, sections, passages}
   Notes: window.HB_NOTES  (js/hebrew-bible-notes.js) -> per-passage commentary, keyed by passage id
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: a clean first read, the modern Jewish standard
     (NJPS), the literary landmark (Alter), the Hebrew-echo (Fox, Torah
     only), and the famous old cadence (KJV). Present-only; if none of
     these is on a passage (the Talmud entry), it falls back to all. */
  var KEY = ['njps', 'alter', 'fox', 'kjv'];

  var HB, NOTES, P, cur = 0, view = 'key';
  var $ = function (id) { return document.getElementById(id); };

  function meta(k) { return HB.translators[k] || { name: k, year: null }; }
  function section(id) {
    for (var i = 0; i < HB.sections.length; i++) {
      if (HB.sections[i].id === id) return HB.sections[i];
    }
    return { id: id, en: id, he: '', sub: '' };
  }
  function indexOfId(id) {
    for (var i = 0; i < P.length; i++) if (P[i].id === id) return i;
    return -1;
  }

  function era(y) {
    if (!y) return '';
    if (y < 1900) return 'early';
    if (y < 1980) return 'mid';
    return 'modern';
  }

  /* which versions to show for the current passage + view */
  function selection(p) {
    var have = {};
    p.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') {
      return HB.order.map(function (k) { return have[k]; }).filter(Boolean);
    }
    /* key, in KEY order, present-only; fall back to all present if none match */
    var sel = KEY.map(function (k) { return have[k]; }).filter(Boolean);
    if (!sel.length) return HB.order.map(function (k) { return have[k]; }).filter(Boolean);
    return sel;
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* source / verse text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="hb-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var p = P[cur], note = NOTES[p.id] || {}, sec = section(p.sec);
    var total = p.v.length, sel = selection(p);

    $('hb-ref').innerHTML = '<span class="hb-idx">' + (cur + 1) + '</span>' + esc(p.ref);
    $('hb-title').textContent = note.title ? note.title : (p.label || '');
    $('hb-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translation' + (total === 1 ? '' : 's');

    /* source: section + reference kicker, the Hebrew (rtl), the transliteration */
    $('hb-source').innerHTML =
      '<p class="hb-he-k">' + esc(sec.en) + ' <span>' + esc(p.ref) + '</span></p>' +
      '<p class="hb-he" lang="' + (p.lang || 'he') + '" dir="rtl">' + textHtml(p.he || '') + '</p>' +
      (p.translit ? '<p class="hb-translit">' + esc(p.translit) + '</p>' : '');

    /* commentary */
    $('hb-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="hb-v hb-' + era(m.year) + '">' +
        '<header class="hb-vh"><span class="hb-vn">' + esc(m.name) + '</span>' +
        '<span class="hb-vy">' + (m.year || '') + '</span></header>' +
        '<div class="hb-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('hb-versions').innerHTML = out ||
      '<p class="hb-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#hb-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#hb-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', b.getAttribute('data-p') === p.id);
    });
    $('hb-prev').disabled = cur === 0;
    $('hb-next').disabled = cur === P.length - 1;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="hb-note-soon">Compare the renderings below.</p>';
    }
    var h = '<div class="hb-note-card">';
    if (note.gist) {
      h += '<p class="hb-note-k">What it says</p><p class="hb-note-gist">' + note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="hb-note-k">Where the translators split</p>';
      h += '<dl class="hb-splits">' + note.splits.map(function (s) {
        return '<dt>' +
          (s.he ? '<span class="hb-dt-he" lang="he" dir="rtl">' + esc(s.he) + '</span> ' : '') +
          (s.translit ? '<span class="hb-dt-tl">' + esc(s.translit) + '</span> ' : '') +
          (s.gloss ? '<span class="hb-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(0, Math.min(P.length - 1, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + P[cur].id);
    var top = document.getElementById('hb');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* the jump index, grouped by Tanakh section */
  function buildGrid(pop) {
    HB.sections.forEach(function (sec) {
      var items = P.filter(function (p) { return p.sec === sec.id; });
      if (!items.length) return;
      var box = document.createElement('div');
      box.className = 'hb-gridsec';
      box.innerHTML = '<p class="hb-gridlabel"><span lang="he" dir="rtl">' + esc(sec.he) +
        '</span>' + esc(sec.en) + (sec.sub ? ' <em>' + esc(sec.sub) + '</em>' : '') + '</p>';
      var row = document.createElement('div');
      row.className = 'hb-gridrow';
      items.forEach(function (p) {
        var b = document.createElement('button');
        b.innerHTML = '<span class="hb-gridnum">' + (P.indexOf(p) + 1) + '</span>' + esc(p.label);
        b.setAttribute('data-p', p.id);
        b.onclick = (function (id) {
          return function () { pop.hidden = true; go(indexOfId(id), 'scroll'); };
        })(p.id);
        row.appendChild(b);
      });
      box.appendChild(row);
      pop.appendChild(box);
    });
  }

  function wire() {
    $('hb-prev').onclick = function () { go(cur - 1); };
    $('hb-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#hb-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('hb-gridpop');
    $('hb-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfId(location.hash.slice(1));
      if (i >= 0 && i !== cur) go(i, false);
    });
  }

  function boot() {
    HB = window.HB;
    NOTES = window.HB_NOTES || {};
    if (!HB) { setTimeout(boot, 60); return; }
    P = HB.passages;
    var i = indexOfId(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = document.getElementById('hb');
    if (mount) mount.classList.add('hb-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
