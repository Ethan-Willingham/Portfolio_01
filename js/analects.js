/* ============================================================
   The Analects of Confucius, side by side.
   Pick any of the 503 passages, begin with one plain-language
   distillation, read the received Chinese, then compare every
   English translation in the corpus. Famous editions lead.

   Data:  window.ANA       -> {translators, order, books, chapters}
   Notes: window.ANA_NOTES -> {"B.C": {title, plain}}
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* The editions most likely to be recognized or owned. They lead
     whenever the corpus has their wording for the current passage. */
  var KEY = ['legge', 'waley', 'lau', 'ames', 'slingerland'];

  var ANA, NOTES, cur = 0;
  var $ = function (id) { return document.getElementById(id); };

  function chapter(i) { return ANA.chapters[i]; }
  function refOf(ch) { return ch.b + '.' + ch.c; }
  function meta(k) { return ANA.translators[k] || { name: k, year: null, n: 0 }; }
  function book(n) { return ANA.books[n - 1] || ANA.books[0]; }

  function era(y) {
    if (!y) return '';
    if (y < 1950) return 'early';
    if (y < 2000) return 'mid';
    return 'modern';
  }

  /* Every English version for the passage in three tiers. A complete
     edition is marked full in the corpus or covers at least 450 of the
     503 received passages. */
  function tiers(ch) {
    var have = {}, inKey = {};
    ch.v.forEach(function (v) { have[v.k] = v; });
    KEY.forEach(function (k) { inKey[k] = true; });
    var byYear = function (a, b) {
      return (meta(a.k).year || 9999) - (meta(b.k).year || 9999);
    };
    var t1 = KEY.map(function (k) { return have[k]; }).filter(Boolean);
    var t2 = ch.v.filter(function (v) {
      var m = meta(v.k);
      return !inKey[v.k] && (m.full === true || m.n >= 450);
    }).sort(byYear);
    var t3 = ch.v.filter(function (v) {
      var m = meta(v.k);
      return !inKey[v.k] && m.full !== true && m.n < 450;
    }).sort(byYear);
    return [
      { label: 'The famous ones', list: t1 },
      { label: 'The lesser-known complete translations', list: t2 },
      { label: 'Partial translations', list: t3 }
    ];
  }

  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  function textHtml(t) {
    return esc(t).split('\n').map(function (line) {
      return line === '' ? '<span class="ana-br"></span>' : line;
    }).join('<br>');
  }

  function versionHtml(v) {
    var m = meta(v.k);
    return '<article class="ana-v ana-' + era(m.year) + '">' +
      '<header class="ana-vh"><span class="ana-vn">' + esc(m.name) + '</span>' +
      '<span class="ana-vy">' + (m.year || '') + '</span></header>' +
      '<div class="ana-vt">' + textHtml(v.t) + '</div></article>';
  }

  function noteHtml(note) {
    if (!note.plain) {
      return '<p class="ana-note-error">The plain-English opening for this passage did not load. The source and translations are still available below.</p>';
    }
    return '<div class="ana-note"><p class="ana-note-k">In plain English</p>' +
      '<p class="ana-note-text">' + note.plain + '</p></div>';
  }

  function render() {
    var ch = chapter(cur), ref = refOf(ch), note = NOTES[ref] || {}, bk = book(ch.b);

    $('ana-chno').textContent = 'Book ' + ch.b + ', passage ' + ch.c;
    $('ana-title').textContent = note.title || '';
    $('ana-count').innerHTML = '<b>' + ch.v.length + '</b> translation' + (ch.v.length === 1 ? '' : 's');
    $('ana-notes').innerHTML = noteHtml(note);
    $('ana-source').innerHTML =
      '<p class="ana-source-head"><b><a href="https://ctext.org/analects">Received Chinese</a></b><span>' + esc(bk.zh) +
      ' &middot; ' + ref + '</span></p><p class="ana-zh" lang="zh">' + textHtml(ch.zh) + '</p>';

    $('ana-versions').innerHTML = tiers(ch).map(function (group) {
      if (!group.list.length) return '';
      return '<div class="ana-tier"><b>' + group.label + '</b><span>' +
        group.list.length + '</span></div>' + group.list.map(versionHtml).join('');
    }).join('');

    document.querySelectorAll('#ana-gridpop button').forEach(function (button) {
      button.classList.toggle('is-cur', button.getAttribute('data-ref') === ref);
    });
    $('ana-prev').disabled = cur === 0;
    $('ana-next').disabled = cur === ANA.chapters.length - 1;
  }

  function go(i, push) {
    cur = Math.max(0, Math.min(ANA.chapters.length - 1, i));
    render();
    if (push !== false) history.replaceState(null, '', '#' + refOf(chapter(cur)));
    var top = $('ana');
    if (push === 'scroll' && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function indexOfRef(ref) {
    for (var i = 0; i < ANA.chapters.length; i++) {
      if (refOf(ANA.chapters[i]) === ref) return i;
    }
    return -1;
  }

  function buildGrid(pop) {
    ANA.books.forEach(function (bk) {
      var section = document.createElement('div');
      section.className = 'ana-gridsec';
      section.innerHTML = '<p class="ana-gridlabel"><span lang="zh">' + esc(bk.zh) +
        '</span>Book ' + bk.n + ' &middot; ' + esc(bk.en) + '</p>';
      var row = document.createElement('div');
      row.className = 'ana-gridrow';
      ANA.chapters.forEach(function (ch, i) {
        if (ch.b !== bk.n) return;
        var button = document.createElement('button');
        var ref = refOf(ch);
        button.textContent = ch.c;
        button.setAttribute('data-ref', ref);
        button.title = ref + ': ' + (NOTES[ref] ? NOTES[ref].title : '');
        button.onclick = (function (index) {
          return function () {
            pop.hidden = true;
            $('ana-jump').setAttribute('aria-expanded', 'false');
            go(index, 'scroll');
          };
        })(i);
        row.appendChild(button);
      });
      section.appendChild(row);
      pop.appendChild(section);
    });
  }

  function wire() {
    $('ana-prev').onclick = function () { go(cur - 1); };
    $('ana-next').onclick = function () { go(cur + 1); };
    var pop = $('ana-gridpop');
    buildGrid(pop);
    $('ana-jump').onclick = function () {
      pop.hidden = !pop.hidden;
      this.setAttribute('aria-expanded', String(!pop.hidden));
    };
    document.addEventListener('keydown', function (event) {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft') go(cur - 1);
      else if (event.key === 'ArrowRight') go(cur + 1);
      else if (event.key === 'Escape') {
        pop.hidden = true;
        $('ana-jump').setAttribute('aria-expanded', 'false');
      }
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
    var mount = $('ana');
    if (mount) mount.classList.add('ana-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
