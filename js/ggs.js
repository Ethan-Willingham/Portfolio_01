/* ============================================================
   The Guru Granth Sahib, side by side.
   Interactive explorer for a CURATED set of keystone passages
   (the full scripture is 1,430 pages, so this is the load-bearing
   selection, not the whole book). Pick a passage, read the
   Gurmukhi source and its transliteration, get a plain-language
   breakdown of what it says and where the translators split, then
   compare the English translations stacked against each other.

   Data:  window.GGS        (js/ggs-data.js)  -> {translators, parts, passages}
   Notes: window.GGS_NOTES  (js/ggs-notes.js) -> per-passage breakdown, keyed by id
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var GGS, NOTES, list, cur = 0;
  var $ = function (id) { return document.getElementById(id); };

  function meta(k) { return GGS.translators[k] || { name: k, year: null }; }
  function part(n) { return GGS.parts[n - 1] || GGS.parts[0]; }

  function era(y) {
    if (!y) return '';
    if (y < 1950) return 'early';
    if (y < 2000) return 'mid';
    return 'modern';
  }

  /* translations for a passage, oldest first */
  function ordered(p) {
    return p.v.slice().sort(function (a, b) {
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
      return l === '' ? '<span class="ggs-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var p = list[cur], note = NOTES[p.id] || {}, sel = ordered(p);

    $('ggs-pno').textContent = note.title || p.id;
    $('ggs-loc').textContent = p.loc + (p.who ? '  ·  ' + p.who : '');
    $('ggs-count').innerHTML = 'passage <b>' + (cur + 1) + '</b> of ' + list.length;

    /* source: Gurmukhi + transliteration */
    $('ggs-source').innerHTML =
      '<p class="ggs-gur-k">Source <span>' + esc(p.loc) + '</span></p>' +
      '<p class="ggs-gur" lang="pa">' + textHtml(p.gur || '') + '</p>' +
      (p.tr ? '<p class="ggs-tr">' + textHtml(p.tr) + '</p>' : '');

    /* breakdown (always present on a keystone) */
    $('ggs-notes').innerHTML = noteHtml(note);

    /* the stacked translations */
    var out = sel.map(function (v) {
      var m = meta(v.k), caution = m.caution
        ? ' <span class="ggs-flag">cautionary</span>' : '';
      return '<article class="ggs-v ggs-' + era(m.year) + '">' +
        '<header class="ggs-vh"><span class="ggs-vn">' + esc(m.name) + caution +
        '</span><span class="ggs-vy">' + (m.year || '') + '</span></header>' +
        '<div class="ggs-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('ggs-versions').innerHTML = out ||
      '<p class="ggs-empty">Translations for this passage are on the way.</p>';

    document.querySelectorAll('#ggs-menu [data-go]').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-go') === cur);
    });
    $('ggs-prev').disabled = cur === 0;
    $('ggs-next').disabled = cur === list.length - 1;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="ggs-note-soon">Compare the renderings below.</p>';
    }
    var h = '<div class="ggs-note-card">';
    if (note.gist) {
      h += '<p class="ggs-note-k">What it says</p><p class="ggs-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="ggs-note-k">The words that do not cross over</p>';
      h += '<dl class="ggs-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.gur ? '<span lang="pa">' + esc(s.gur) + '</span> ' : '') +
          (s.gloss ? '<span class="ggs-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="ggs-note-k">My read</p><p class="ggs-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, scroll) {
    cur = Math.max(0, Math.min(list.length - 1, n));
    render();
    history.replaceState(null, '', '#' + list[cur].id);
    var top = $('ggs');
    if (scroll && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function indexOfId(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  /* the jump menu: passages grouped by part, as a titled list */
  function buildMenu(menu) {
    GGS.parts.forEach(function (pt, pi) {
      var inPart = list.map(function (p, i) { return { p: p, i: i }; })
        .filter(function (x) { return x.p.part === pi + 1; });
      if (!inPart.length) return;
      var sec = document.createElement('div');
      sec.className = 'ggs-menusec';
      var label = '<p class="ggs-menulabel">' + esc(pt.label) +
        (pt.sub ? ' <span>' + esc(pt.sub) + '</span>' : '') + '</p>';
      sec.innerHTML = label + inPart.map(function (x) {
        var note = NOTES[x.p.id] || {};
        return '<button class="ggs-menurow" data-go="' + x.i + '">' +
          '<span class="ggs-menurow-t">' + esc(note.title || x.p.id) + '</span>' +
          '<span class="ggs-menurow-m">' + esc(x.p.loc) + '</span></button>';
      }).join('');
      menu.appendChild(sec);
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b) { menu.hidden = true; go(+b.getAttribute('data-go'), 'scroll'); }
    });
  }

  function wire() {
    $('ggs-prev').onclick = function () { go(cur - 1); };
    $('ggs-next').onclick = function () { go(cur + 1); };
    var menu = $('ggs-menu');
    $('ggs-jump').onclick = function () { menu.hidden = !menu.hidden; };
    buildMenu(menu);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { menu.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfId(location.hash.slice(1));
      if (i >= 0 && i !== cur) go(i);
    });
  }

  function boot() {
    GGS = window.GGS;
    NOTES = window.GGS_NOTES || {};
    if (!GGS) { setTimeout(boot, 60); return; }
    list = GGS.passages;
    var i = indexOfId(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = $('ggs');
    if (mount) mount.classList.add('ggs-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
