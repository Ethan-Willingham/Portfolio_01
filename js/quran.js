/* ============================================================
   The Quran, side by side.
   Interactive explorer: fourteen curated keystone passages. For
   each, the Arabic source (right to left, with verse numbers), a
   transliteration, a plain-language breakdown of what it says and
   where the translators split, then the seven English translations
   stacked in chronological order.

   Data:  window.QURAN        (js/quran-data.js)  -> {translators, order, keystones}
   Notes: window.QURAN_NOTES  (js/quran-notes.js) -> per-keystone commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* the jump list, grouped along the book's spine (diagnosis -> cure) */
  var GROUPS = [
    { label: 'The self-summary', ids: ['1'] },
    { label: 'The one God', ids: ['112', '2:255', '24:35'] },
    { label: 'What is wrong with us', ids: ['103', '31:13', '14:7'] },
    { label: 'The way back', ids: ['2:177', '16:90', '2:256'] },
    { label: 'The prophets, revised', ids: ['19'] },
    { label: 'The Day, and the mercy', ids: ['81', '99', '39:53'] }
  ];

  var Q, NOTES, KS, cur = 0;
  var $ = function (id) { return document.getElementById(id); };

  function meta(k) { return Q.translators[k] || { name: k, year: null }; }
  function slug(id) { return id.replace(/:/g, '-'); }
  function indexOfId(id) {
    for (var i = 0; i < KS.length; i++) { if (KS[i].id === id) return i; }
    return -1;
  }

  function era(y) {
    if (!y) return '';
    if (y < 1900) return 'early';
    if (y < 1970) return 'mid';
    return 'modern';
  }

  /* western digits -> Arabic-Indic, for the verse ornaments */
  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤',
    '٥', '٦', '٧', '٨', '٩'];
  function arNum(s) {
    return String(s).replace(/\d/g, function (d) { return AR_DIGITS[+d]; });
  }

  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  /* verse/prose text -> html, honoring line breaks between verses */
  function textHtml(t) {
    return esc(t).split('\n').map(function (l) {
      return l === '' ? '<span class="qx-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var ks = KS[cur], note = NOTES[ks.id] || {};

    $('qx-kref').textContent = ks.ref;
    $('qx-title').textContent = ks.name;
    $('qx-count').innerHTML = 'keystone <b>' + (cur + 1) + '</b> of ' + KS.length;

    /* source: the Arabic, right to left, with verse ornaments */
    var arHtml = ks.ar.map(function (v) {
      return '<span class="qx-averse">' + esc(v.a) +
        '<span class="qx-ayah">' + arNum(v.n) + '</span></span>';
    }).join(' ');
    var src = '<p class="qx-ar-k">Arabic source <span>' + esc(ks.ref) + '</span></p>' +
      '<p class="qx-ar" lang="ar" dir="rtl">' + arHtml + '</p>';
    if (ks.tr) {
      src += '<p class="qx-tr"><b>Sound</b> &nbsp;' + esc(ks.tr) + '</p>';
    }
    $('qx-source').innerHTML = src;

    /* commentary */
    $('qx-notes').innerHTML = noteHtml(note);

    /* translations, chronological, with era tints */
    var byKey = {};
    ks.v.forEach(function (v) { byKey[v.k] = v; });
    var out = Q.order.map(function (k) {
      var v = byKey[k]; if (!v) return '';
      var m = meta(k);
      return '<article class="qx-v qx-' + era(m.year) + '">' +
        '<header class="qx-vh"><span class="qx-vn">' + esc(m.name) + '</span>' +
        '<span class="qx-vy">' + (m.year || '') + '</span></header>' +
        '<div class="qx-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('qx-versions').innerHTML = out || '<p class="qx-empty">No translations here.</p>';

    document.querySelectorAll('#qx-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', b.getAttribute('data-id') === ks.id);
    });
    $('qx-prev').disabled = cur === 0;
    $('qx-next').disabled = cur === KS.length - 1;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="qx-note-soon" style="font-style:italic;color:var(--text-faint);">Compare the renderings below.</p>';
    }
    var h = '<div class="qx-note-card">';
    if (note.gist) {
      h += '<p class="qx-note-k">What it says</p><p class="qx-note-gist">' + note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="qx-note-k">Where the translators split</p>';
      h += '<dl class="qx-splits">' + note.splits.map(function (s) {
        return '<dt>' + (s.ar ? '<span lang="ar" dir="rtl">' + esc(s.ar) + '</span>' : '') +
          (s.gloss ? '<span class="qx-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="qx-note-k">My read</p><p class="qx-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(0, Math.min(KS.length - 1, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + slug(KS[cur].id));
    var top = $('qx');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildGrid(pop) {
    GROUPS.forEach(function (g) {
      var sec = document.createElement('div');
      sec.className = 'qx-gridsec';
      sec.innerHTML = '<p class="qx-gridlabel">' + esc(g.label) + '</p>';
      var row = document.createElement('div');
      row.className = 'qx-gridrow';
      g.ids.forEach(function (id) {
        var i = indexOfId(id); if (i < 0) return;
        var ks = KS[i];
        var b = document.createElement('button');
        b.setAttribute('data-id', id);
        b.innerHTML = '<span>' + esc(ks.name) + '</span><span class="gk">' +
          esc(ks.ref.replace(/^Sura\s+/, '')) + '</span>';
        b.onclick = (function (m) { return function () { pop.hidden = true; go(m, 'scroll'); }; })(i);
        row.appendChild(b);
      });
      sec.appendChild(row);
      pop.appendChild(sec);
    });
  }

  function wire() {
    $('qx-prev').onclick = function () { go(cur - 1); };
    $('qx-next').onclick = function () { go(cur + 1); };
    var pop = $('qx-gridpop');
    $('qx-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    document.addEventListener('click', function (e) {
      if (!pop.hidden && !pop.contains(e.target) && e.target.id !== 'qx-jump' &&
        !$('qx-jump').contains(e.target)) { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfId(location.hash.slice(1).replace(/-/g, ':'));
      if (i >= 0 && i !== cur) go(i, false);
    });
  }

  function boot() {
    Q = window.QURAN;
    NOTES = window.QURAN_NOTES || {};
    if (!Q) { setTimeout(boot, 60); return; }
    KS = Q.keystones;
    var i = indexOfId(location.hash.slice(1).replace(/-/g, ':'));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = $('qx');
    if (mount) mount.classList.add('qx-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
