/* ============================================================
   The Social Contract, side by side.
   Three thinkers (Hobbes, Locke, Rousseau) answer the same set
   of questions about why anyone should obey the state and what
   makes power legitimate. Pick a question, read the plain-English
   answer from each, then the verbatim line from the book it came
   from, stacked so you can read them against each other.

   Data:  window.SC       (js/social-contract-data.js)
          -> {thinkers, order, questions}
   Notes: window.SC_NOTES (js/social-contract-notes.js)
          -> per-question breakdown (island handle, framing, the
             plain read of each thinker, where they split)
   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var SC, NOTES, cur = 0;
  var $ = function (id) { return document.getElementById(id); };

  function question(i) { return SC.questions[i]; }
  function thinker(k) { return SC.thinkers[k] || { name: k, work: '', year: null }; }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  /* ---------- render ---------- */
  function render() {
    var q = question(cur), note = (NOTES[q.id] || {});

    $('sc-qno').textContent = 'Question ' + (cur + 1);
    $('sc-qshort').textContent = q.short || '';

    /* the question + the island handle that makes it concrete */
    var head = '<p class="sc-q-k">The question</p>' +
      '<p class="sc-q">' + esc(q.q) + '</p>';
    if (note.island) head += '<p class="sc-island">' + note.island + '</p>';
    if (note.gist) head += '<p class="sc-gist">' + note.gist + '</p>';
    $('sc-question').innerHTML = head;

    /* the three thinkers, in order: the plain read, then their own words */
    var out = SC.order.map(function (k) {
      var t = thinker(k), a = (q.answers && q.answers[k]) || {};
      var read = (note.reads && note.reads[k]) || '';
      var verse = a.quote
        ? '<blockquote class="sc-quote">' + esc(a.quote) +
          '<cite class="sc-cite">' + esc(a.cite || (t.work)) + '</cite></blockquote>'
        : '';
      return '<article class="sc-t sc-' + k + '">' +
        '<header class="sc-th">' +
          '<span class="sc-tn">' + esc(t.name) + '</span>' +
          '<span class="sc-tw">' + esc(t.work) +
            (t.year ? ' <span class="sc-ty">' + t.year + '</span>' : '') + '</span>' +
        '</header>' +
        (read ? '<p class="sc-read">' + read + '</p>' : '') +
        verse +
        '</article>';
    }).join('');
    $('sc-thinkers').innerHTML = out;

    /* where they split / the catch */
    $('sc-split').innerHTML = note.split
      ? '<div class="sc-split-card"><p class="sc-split-k">Where they split</p>' +
        '<p class="sc-split-body">' + note.split + '</p></div>'
      : '';

    document.querySelectorAll('#sc-tabs button').forEach(function (b, i) {
      b.classList.toggle('is-on', i === cur);
      b.setAttribute('aria-selected', i === cur ? 'true' : 'false');
    });
    $('sc-prev').disabled = cur === 0;
    $('sc-next').disabled = cur === SC.questions.length - 1;
  }

  /* ---------- navigation ---------- */
  function go(n, scroll) {
    cur = Math.max(0, Math.min(SC.questions.length - 1, n));
    render();
    history.replaceState(null, '', '#' + question(cur).id);
    var top = $('sc');
    if (scroll && top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function indexOfId(id) {
    for (var i = 0; i < SC.questions.length; i++) {
      if (SC.questions[i].id === id) return i;
    }
    return -1;
  }

  function wire() {
    $('sc-prev').onclick = function () { go(cur - 1); };
    $('sc-next').onclick = function () { go(cur + 1); };

    var tabs = $('sc-tabs');
    SC.questions.forEach(function (q, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.innerHTML = '<span class="sc-tab-n">' + (i + 1) + '</span>' +
        '<span class="sc-tab-l">' + esc(q.short || q.q) + '</span>';
      b.onclick = (function (n) { return function () { go(n, true); }; })(i);
      tabs.appendChild(b);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key === 'ArrowRight') go(cur + 1);
    });
    window.addEventListener('hashchange', function () {
      var i = indexOfId(location.hash.slice(1));
      if (i >= 0 && i !== cur) go(i);
    });
  }

  function boot() {
    SC = window.SC;
    NOTES = window.SC_NOTES || {};
    if (!SC) { setTimeout(boot, 60); return; }
    var i = indexOfId(location.hash.slice(1));
    if (i >= 0) cur = i;
    wire();
    render();
    var mount = $('sc');
    if (mount) mount.classList.add('sc-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
