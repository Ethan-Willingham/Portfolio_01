/* ============================================================
   The Dhammapada, side by side.
   Interactive explorer: pick any of the 423 verses, read the
   romanized Pali source, then compare every English translation in
   the corpus, with a plain-language breakdown of the keystone
   verses and where the translators split.

   Data:  window.DHP        (js/dhammapada-data.js)  -> {translators, order, vaggas, verses}
   Notes: window.DHP_NOTES  (js/dhammapada-notes.js) -> per-verse commentary
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var TOTAL = 423;

  /* The "Key" view: a recognizable spread across eras and styles, so a
     first-time reader is not dropped into every version at once. Victorian
     prose, Edwardian verse, the standard monastic reading, an idiosyncratic
     American one, and a contemporary one. Only those present are shown. */
  var KEY = ['muller', 'wagiswara', 'buddharakkhita', 'thanissaro', 'sujato'];

  var DHP, NOTES, cur = 1, view = 'key';
  var $ = function (id) { return document.getElementById(id); };

  function verse(n) { return DHP.verses[n - 1]; }
  function meta(k) { return DHP.translators[k] || { name: k, year: null, n: 0 }; }
  function vagga(n) { return DHP.vaggas[(verse(n).vg || 1) - 1] || DHP.vaggas[0]; }
  function hasNote(n) {
    var x = NOTES[n];
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
      return c.v.filter(function (v) { return meta(v.k).n >= 400; })
        .sort(function (a, b) { return (meta(a.k).year || 9999) - (meta(b.k).year || 9999); });
    }
    /* key, in chronological order, only those present on this verse */
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
      return l === '' ? '<span class="dhp-br"></span>' : l;
    }).join('<br>');
  }

  /* ---------- render ---------- */
  function render() {
    var c = verse(cur), note = NOTES[cur] || {}, vg = vagga(cur);
    var total = c.v.length, sel = selection(cur);

    $('dhp-vno').textContent = 'Verse ' + cur;
    $('dhp-title').textContent = note.title ? note.title : (vg.en);
    $('dhp-count').innerHTML = 'showing <b>' + sel.length + '</b> of ' + total +
      ' translations';

    /* source */
    $('dhp-source').innerHTML =
      '<p class="dhp-pali-k">Pali source <span>' + esc(vg.pali) + ' &middot; ' +
        'verse ' + cur + ' of ' + TOTAL + '</span></p>' +
      '<p class="dhp-pali" lang="pi">' + textHtml(c.pali || '') + '</p>';

    /* commentary */
    $('dhp-notes').innerHTML = noteHtml(note);

    /* translations */
    var out = sel.map(function (v) {
      var m = meta(v.k);
      return '<article class="dhp-v dhp-' + era(m.year) + '">' +
        '<header class="dhp-vh"><span class="dhp-vn">' + esc(m.name) + '</span>' +
        '<span class="dhp-vy">' + (m.year || '') + '</span></header>' +
        '<div class="dhp-vt">' + textHtml(v.t) + '</div></article>';
    }).join('');
    $('dhp-versions').innerHTML = out ||
      '<p class="dhp-empty">No translations in this view. Try All.</p>';

    document.querySelectorAll('#dhp-views button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === view);
    });
    document.querySelectorAll('#dhp-gridpop button').forEach(function (b) {
      b.classList.toggle('is-cur', +b.getAttribute('data-v') === cur);
    });
    $('dhp-prev').disabled = cur === 1;
    $('dhp-next').disabled = cur === TOTAL;
  }

  function noteHtml(note) {
    if (!note.gist && !(note.splits && note.splits.length)) {
      return '<p class="dhp-note-soon">No breakdown on this verse. It is one of the ' +
        'verses I left to speak for itself; compare the renderings below, or jump to a ' +
        '<button class="dhp-keylink" id="dhp-tokey">keystone verse</button>.</p>';
    }
    var h = '<div class="dhp-note-card">';
    if (note.gist) {
      h += '<p class="dhp-note-k">What it says</p><p class="dhp-note-gist">' +
        note.gist + '</p>';
    }
    if (note.splits && note.splits.length) {
      h += '<p class="dhp-note-k">Where the translators split</p>';
      h += '<dl class="dhp-splits">' + note.splits.map(function (s) {
        var word = s.pali || s.zh || '';
        return '<dt>' + (word ? '<span lang="pi">' + esc(word) + '</span> ' : '') +
          (s.gloss ? '<span class="dhp-gloss">' + esc(s.gloss) + '</span>' : '') +
          '</dt><dd>' + s.note + '</dd>';
      }).join('') + '</dl>';
    }
    if (note.read) {
      h += '<p class="dhp-note-k">My read</p><p class="dhp-note-read">' + note.read + '</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    cur = Math.max(1, Math.min(TOTAL, n));
    render();
    if (push !== false) history.replaceState(null, '', '#' + cur);
    var top = document.getElementById('dhp');
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
    DHP.vaggas.forEach(function (vg) {
      var sec = document.createElement('div');
      sec.className = 'dhp-gridsec';
      sec.innerHTML = '<p class="dhp-gridlabel"><span>' + esc(vg.pali) +
        '</span>' + esc(vg.en) + '</p>';
      var row = document.createElement('div');
      row.className = 'dhp-gridrow';
      for (var n = vg.from; n <= vg.to; n++) {
        var b = document.createElement('button');
        b.textContent = n;
        b.setAttribute('data-v', n);
        if (hasNote(n)) b.className = 'has-note';
        b.onclick = (function (m) { return function () { pop.hidden = true; go(m, 'scroll'); }; })(n);
        row.appendChild(b);
      }
      sec.appendChild(row);
      pop.appendChild(sec);
    });
  }

  function wire() {
    $('dhp-prev').onclick = function () { go(cur - 1); };
    $('dhp-next').onclick = function () { go(cur + 1); };
    document.querySelectorAll('#dhp-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });
    var pop = $('dhp-gridpop');
    $('dhp-jump').onclick = function () { pop.hidden = !pop.hidden; };
    buildGrid(pop);
    if ($('dhp-keyprev')) $('dhp-keyprev').onclick = function () { goKeystone(-1); };
    if ($('dhp-keynext')) $('dhp-keynext').onclick = function () { goKeystone(1); };
    /* delegated: the "jump to a keystone" link inside an empty breakdown */
    $('dhp-notes').addEventListener('click', function (e) {
      if (e.target && e.target.id === 'dhp-tokey') goKeystone(1);
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { go(cur - 1); }
      else if (e.key === 'ArrowRight') { go(cur + 1); }
      else if (e.key === 'Escape') { pop.hidden = true; }
    });
    window.addEventListener('hashchange', function () {
      var n = parseInt(location.hash.slice(1), 10);
      if (n >= 1 && n <= TOTAL && n !== cur) go(n, false);
    });
  }

  function boot() {
    DHP = window.DHP;
    NOTES = window.DHP_NOTES || {};
    if (!DHP) { setTimeout(boot, 60); return; }
    var n = parseInt(location.hash.slice(1), 10);
    if (n >= 1 && n <= TOTAL) cur = n;
    wire();
    render();
    var mount = document.getElementById('dhp');
    if (mount) mount.classList.add('dhp-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
