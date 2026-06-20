/* ============================================================
   The New Testament, side by side.
   Interactive explorer: pick a keystone passage, read the Greek
   source, then compare every English translation in the corpus,
   with a plain-language breakdown of what the passage says and
   where the translators split.

   Data:  window.NT        (js/new-testament-data.js)  -> {translators, order, sections, passages}
   Notes: window.NT_NOTES  (js/new-testament-notes.js) -> per-passage commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The "Key" view: a spread across the eras and styles, so a first-time
     reader is not dropped into nine versions at once. The source of the
     cadence, the monument, the scholarly standard, the popular modern, and
     the deliberately strange literal one. Only those present are shown. */
  var KEY = ['tyndale', 'kjv', 'nrsv', 'niv', 'hart'];

  var NT, NOTES, cur = 1, view = 'key', TOTAL = 1;
  var $ = function (id) { return document.getElementById(id); };

  function passage(n) { return NT.passages[n - 1]; }
  function meta(k) { return NT.translators[k] || { name: k, year: null, era: '' }; }
  function section(n) {
    var p = passage(n), s = NT.sections;
    for (var i = 0; i < s.length; i++) { if (p.n >= s[i].from && p.n <= s[i].to) return s[i]; }
    return s[0];
  }
  function indexOfId(id) {
    for (var i = 0; i < NT.passages.length; i++) { if (NT.passages[i].id === id) return i + 1; }
    return null;
  }

  /* which versions to show for the current passage + view */
  function selection(n) {
    var c = passage(n), have = {};
    c.v.forEach(function (v) { have[v.k] = v; });
    if (view === 'all') {
      return NT.order.map(function (k) { return have[k]; }).filter(Boolean);
    }
    return KEY.map(function (k) { return have[k]; }).filter(Boolean);
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* text -> html, honoring line + stanza breaks */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="nt-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var c = passage(cur), note = NOTES[c.id] || {}, sec = section(cur);
    var total = c.v.length, sel = selection(cur);

    $('nt-ref').textContent = c.ref;
    $('nt-title').textContent = note.title ? note.title : sec.label;
    $('nt-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source: Greek, then a transliteration of the key line */
    var src = '<p class="nt-gk-k">Greek source <span>' + esc(c.ref) +
      ' &middot; ' + esc(sec.tag || sec.label) + '</span></p>' +
      '<p class="nt-gk" lang="grc">' + textHtml(c.gk || '') + '</p>';
    if (c.tr) {
      src += '<p class="nt-translit"><span>sounds like</span> ' + esc(c.tr) + '</p>';
    }
    $('nt-source').innerHTML = src;

    /* commentary */
    $('nt-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="nt-v nt-' + (m.era || 'mid') + '">' +
        '<header class="nt-vh"><span class="nt-vn">' + esc(m.name) + '</span>' +
        '<span class="nt-vy">' + (m.year || '') + '</span></header>' +
        '<div class="nt-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('nt-versions').innerHTML = out ||
      '<p class="nt-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#nt-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#nt-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-v') === cur);
    });
    $('nt-prev').disabled = cur === 1;
    $('nt-next').disabled = cur === TOTAL;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '';
    }
    var h = '<div class="nt-note-card">';
    if (note.gist) {
      h += '<p class="nt-note-k">What it says</p><p class="nt-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="nt-note-k">Where the translators split</p>';
      h += '<dl class="nt-splits">' + note.splits.map(function (s) {
        var word = s.gk || s.he || '';
        var lang = s.he ? 'he' : 'grc';
        return '<dt>' + (word ? '<span lang="' + lang + '">' + esc(word) + '</span> ' : '') +
          (s.gloss ? '<span class="nt-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="nt-note-k">My read</p><p class="nt-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(1, Math.min(TOTAL, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + passage(cur).id);
    var top = document.getElementById('nt');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildGrid(pop) {
    NT.sections.forEach(function (sec) {
      var box = document.createElement('div');
      box.className = 'nt-gridsec';
      box.innerHTML = '<p class="nt-gridlabel">' + esc(sec.label) + '</p>';
      var row = document.createElement('div');
      row.className = 'nt-gridrow';
      for (var n = sec.from; n <= sec.to; n++) {
        var p = passage(n);
        var b = document.createElement('button');
        b.innerHTML = '<span class="nt-gridref">' + esc(p.short || p.ref) + '</span>' +
          '<span class="nt-gridname">' + esc((NOTES[p.id] && NOTES[p.id].title) || '') + '</span>';
        b.setAttribute('data-v', n);
        b.onclick = (function (m) { return function () { pop.hidden = true; go(m, 'scroll'); }; })(n);
        row.appendChild(b);
      }
      box.appendChild(row);
      pop.appendChild(box);
    });
  }

  function wire() {
    $('nt-prev').onclick = function () { go(cur - 1); };
    $('nt-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#nt-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('nt-gridpop');
    $('nt-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var n = indexOfId(location.hash.slice(1));
      if (n && n !== cur) go(n, false);
    });
  }

  function boot() {
    NT = window.NT;
    NOTES = window.NT_NOTES || {};
    if (!NT) { setTimeout(boot, 60); return; }
    TOTAL = NT.passages.length;
    var n = indexOfId(location.hash.slice(1));
    if (n) cur = n;
    wire();
    render();
    var mount = document.getElementById('nt');
    if (mount) mount.classList.add('nt-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
