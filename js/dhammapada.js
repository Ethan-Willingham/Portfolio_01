/* Dhammapada reading guide. Notes are paraphrases; translations retain source text. */
(function () {
  'use strict';
  var DHP = window.DHP, NOTES = window.DHP_NOTES || {}, cur = 1;
  var mount = document.getElementById('dhp');
  if (!mount) return;
  var $ = function (id) { return document.getElementById(id); };
  var TIERS = [
    { title: 'Main comparisons', keys: ['muller', 'buddharakkhita', 'thanissaro', 'sujato'] },
    { title: 'Other translations', keys: ['woodward', 'kaviratna', 'suddhaso'] },
    { title: 'Selected passages', keys: ['narada', 'myatin'] }
  ];
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function textHtml(s) { return esc(s).replace(/\n/g, '<br>'); }
  function verse(n) { return DHP.verses[n - 1]; }
  function numberFromHash() {
    var match = /^#([1-9]\d*)$/.exec(location.hash);
    var number = match && Number(match[1]);
    return number >= 1 && number <= DHP.verses.length ? number : null;
  }
  function sourceUrl(key, c) {
    var chapter = DHP.vaggas[c.vg - 1], stem = 'dhp' + chapter.from + '-' + chapter.to;
    var prefix = 'https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.';
    var no = String(c.vg).padStart(2, '0');
    switch (key) {
      case 'muller': return 'https://www.gutenberg.org/ebooks/2017';
      case 'woodward': return 'https://www.gutenberg.org/ebooks/35185';
      case 'buddharakkhita': return prefix + no + '.budd.html';
      case 'thanissaro': return prefix + no + '.than.html';
      case 'kaviratna': return 'https://www.theosociety.org/pasadena/dhamma/dham' + c.vg + '.htm';
      case 'sujato': case 'suddhaso': return 'https://suttacentral.net/' + stem + '/en/' + key;
      case 'narada': return 'https://readingfaithfully.org/dhammapada-translated-by-ven-narada-pdf/';
      case 'myatin': return 'https://www.tipitaka.net/tipitaka/dhp/verseload.php?verse=' + String(c.n).padStart(3, '0');
      default: return 'https://suttacentral.net/dhp';
    }
  }
  function closeGrid(returnFocus) {
    $('dhp-gridpop').hidden = true;
    $('dhp-jump').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('dhp-jump').focus({ preventScroll: true });
  }
  function render() {
    var c = verse(cur), note = NOTES[cur], available = {};
    c.v.forEach(function (entry) { available[entry.k] = entry; });
    $('dhp-vno').textContent = 'Verse ' + cur + ' of ' + DHP.verses.length;
    $('dhp-title').textContent = note ? note.title : DHP.vaggas[c.vg - 1].en;
    $('dhp-count').textContent = c.v.length + ' translations';
    $('dhp-notes').innerHTML = note && note.plain
      ? '<p class="dhp-note-k">In plain English</p><p class="dhp-note-text">' + esc(note.plain) + '</p>'
      : '<p class="dhp-note-text">The explanation could not be loaded. The translations follow below.</p>';
    $('dhp-source').innerHTML = '<p class="dhp-pali" lang="pi">' + textHtml(c.pali) + '</p>';
    $('dhp-versions').innerHTML = TIERS.map(function (tier) {
      var entries = tier.keys.map(function (key) { return available[key]; }).filter(Boolean);
      entries.sort(function (a, b) { return DHP.translators[a.k].year - DHP.translators[b.k].year; });
      if (!entries.length) return '';
      return '<div class="dhp-tier"><h3>' + tier.title + '</h3><span>' + entries.length + '</span></div>' +
        entries.map(function (entry) {
          var metadata = DHP.translators[entry.k], range = entry.range;
          var rangeHtml = range && range[0] !== range[1]
            ? '<p class="dhp-range">Verses ' + range[0] + '-' + range[1] + ' in this edition</p>' : '';
          return '<article class="dhp-v"><header class="dhp-vh">' +
            '<a class="dhp-vn" href="' + esc(sourceUrl(entry.k, c)) + '">' + esc(metadata.name) + '</a>' +
            '<span class="dhp-vy">' + metadata.year + '</span></header>' + rangeHtml +
            '<div class="dhp-vt">' + textHtml(entry.t) + '</div></article>';
        }).join('');
    }).join('');
    document.querySelectorAll('#dhp-gridpop button').forEach(function (button) {
      var current = Number(button.getAttribute('data-v')) === cur;
      button.classList.toggle('is-cur', current);
      if (current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    $('dhp-prev').disabled = cur === 1;
    $('dhp-next').disabled = cur === DHP.verses.length;
  }
  function go(n, options) {
    options = options || {};
    cur = Math.max(1, Math.min(DHP.verses.length, n));
    render();
    if (options.updateHash !== false) history.replaceState(null, '', '#' + cur);
    if (options.scroll) mount.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function buildGrid() {
    DHP.vaggas.forEach(function (chapter) {
      var section = document.createElement('div');
      section.className = 'dhp-gridsec';
      section.innerHTML = '<p class="dhp-gridlabel">' + chapter.n + '. ' + esc(chapter.en) +
        ' (' + chapter.from + '-' + chapter.to + ')</p>';
      var row = document.createElement('div');
      row.className = 'dhp-gridrow';
      for (var n = chapter.from; n <= chapter.to; n++) {
        var button = document.createElement('button');
        button.textContent = n;
        button.setAttribute('data-v', n);
        button.setAttribute('aria-label', 'Verse ' + n + ': ' + (NOTES[n] ? NOTES[n].title : chapter.en));
        button.onclick = (function (number) {
          return function () { closeGrid(true); go(number, { scroll: true }); };
        })(n);
        row.appendChild(button);
      }
      section.appendChild(row);
      $('dhp-gridpop').appendChild(section);
    });
  }
  if (!DHP || !DHP.verses || !DHP.verses.length) {
    $('dhp-loading').innerHTML = 'The verse reader could not load. Read the complete text at ' +
      '<a href="https://suttacentral.net/dhp/en/sujato">SuttaCentral</a>.';
    return;
  }
  buildGrid();
  $('dhp-prev').onclick = function () { go(cur - 1); };
  $('dhp-next').onclick = function () { go(cur + 1); };
  $('dhp-jump').onclick = function () {
    var pop = $('dhp-gridpop');
    pop.hidden = !pop.hidden;
    $('dhp-jump').setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) {
      var selected = pop.querySelector('[data-v="' + cur + '"]');
      selected.scrollIntoView({ block: 'nearest' });
      selected.focus({ preventScroll: true });
    }
  };
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var match = /^#([1-9]\d*)$/.exec(link.getAttribute('href'));
    if (!match || Number(match[1]) > DHP.verses.length) return;
    event.preventDefault();
    closeGrid(false);
    go(Number(match[1]), { scroll: true });
  });
  document.addEventListener('keydown', function (event) {
    if (event.target.closest('input, textarea, select, [contenteditable]') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape' && !$('dhp-gridpop').hidden) { closeGrid(true); return; }
    var rect = mount.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      go(cur + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  window.addEventListener('hashchange', function () {
    var number = numberFromHash();
    if (number) { closeGrid(false); go(number, { updateHash: false, scroll: true }); }
    if (location.hash === '#sources') $('sources').open = true;
  });
  var initial = numberFromHash();
  go(initial || 1, { updateHash: false, scroll: !!initial });
  if (location.hash === '#sources') $('sources').open = true;
  document.querySelector('a[href="#sources"]').addEventListener('click', function () { $('sources').open = true; });
  mount.classList.add('dhp-ready');
})();
