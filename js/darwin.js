/* ============================================================
   Darwin, a walk through On the Origin of Species (1859).
   Approach B (the One-Reading Walk): the page is read top to
   bottom, so this script is light. It powers the sticky station
   rail: a scroll-spy that names the stop you are in, a jump
   menu, and prev/next that scroll to the neighboring stop.

   Contract with darwin.html:
     #walkbar      the sticky bar
       #walk-prev  #walk-next   nav buttons
       #walk-jump  (button) -> #walk-stno + #walk-stlabel
       #walk-count "1 / 8"
     #walkpop      the jump menu (filled here)
     section.station[id]  each with data-label and data-tag

   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var bar = $('walkbar');
  if (!bar) return;

  var stations = Array.prototype.slice.call(
    document.querySelectorAll('section.station')
  );
  if (!stations.length) return;

  var pop = $('walkpop');
  var stno = $('walk-stno');
  var stlabel = $('walk-stlabel');
  var count = $('walk-count');
  var total = stations.length;
  var cur = 0;

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tag(el) { return el.getAttribute('data-tag') || ''; }
  function label(el) { return el.getAttribute('data-label') || ''; }

  /* ---------- the jump menu ---------- */
  function buildPop() {
    if (!pop) return;
    pop.innerHTML = stations.map(function (el, i) {
      return '<button data-i="' + i + '">' +
        '<span class="walkpop-n">' + (i + 1) + '</span>' +
        '<span class="walkpop-name">' + label(el) + '</span>' +
        '<span class="walkpop-tag">' + tag(el) + '</span>' +
        '</button>';
    }).join('');
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      pop.hidden = true;
      bar.classList.remove('is-open');
      goTo(+b.getAttribute('data-i'));
    });
  }

  /* ---------- reflect the current station ---------- */
  function paint() {
    var el = stations[cur];
    if (stno) stno.textContent = 'Stop ' + (cur + 1);
    if (stlabel) stlabel.textContent = label(el);
    if (count) count.innerHTML = '<b>' + (cur + 1) + '</b> / ' + total;
    if (pop) {
      Array.prototype.forEach.call(pop.children, function (b, i) {
        b.classList.toggle('is-cur', i === cur);
      });
    }
    $('walk-prev').disabled = cur === 0;
    $('walk-next').disabled = cur === total - 1;
  }

  function goTo(i) {
    i = Math.max(0, Math.min(total - 1, i));
    var el = stations[i];
    var y = el.getBoundingClientRect().top + window.pageYOffset -
      (bar.offsetHeight + 12);
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- scroll-spy ---------- */
  function spy() {
    var line = bar.getBoundingClientRect().bottom + 4;
    var i = 0;
    for (var k = 0; k < stations.length; k++) {
      if (stations[k].getBoundingClientRect().top <= line) i = k;
    }
    if (i !== cur) { cur = i; paint(); }
  }

  /* ---------- wire ---------- */
  function wire() {
    $('walk-prev').onclick = function () { goTo(cur - 1); };
    $('walk-next').onclick = function () { goTo(cur + 1); };
    if (pop) {
      $('walk-jump').onclick = function () {
        pop.hidden = !pop.hidden;
        bar.classList.toggle('is-open', !pop.hidden);
      };
      document.addEventListener('click', function (e) {
        if (pop.hidden) return;
        if (!pop.contains(e.target) && !$('walk-jump').contains(e.target)) {
          pop.hidden = true;
          bar.classList.remove('is-open');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          pop.hidden = true;
          bar.classList.remove('is-open');
        }
      });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { spy(); ticking = false; });
    }, { passive: true });
    window.addEventListener('resize', spy, { passive: true });
  }

  buildPop();
  wire();
  spy();
  paint();
  /* catch scroll position restored on reload */
  window.addEventListener('load', spy);
})();
