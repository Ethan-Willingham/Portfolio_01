/* ============================================================
   Euclid and the invention of proof: a walk through the Elements.
   Two independent pieces, both vanilla and deferred, no deps:

   1) THE WALK RAIL  (same contract as js/aristotle.js): a sticky
      scroll-spy over section.station[id] with a jump menu and
      prev/next. #walkbar #walk-prev #walk-next #walk-jump
      (#walk-stno + #walk-stlabel) #walk-count #walkpop.

   2) THE GEOMETRY FIGURES: each .gfig holds one <svg> whose
      elements carry data-seq="1..N". They start hidden (CSS) and
      are revealed in ascending seq order to draw the construction
      the way a compass-and-straightedge reader would. Plays once
      on scroll-into-view; a Replay button re-runs it. Honors
      prefers-reduced-motion by revealing the finished figure at
      once (no motion). No em dashes.
   ============================================================ */
(function () {
  'use strict';

  /* =================== 1. THE WALK RAIL =================== */
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    var bar = $('walkbar');
    if (!bar) return;
    var stations = Array.prototype.slice.call(document.querySelectorAll('section.station'));
    if (!stations.length) return;

    var pop = $('walkpop'), stno = $('walk-stno'), stlabel = $('walk-stlabel'),
        count = $('walk-count'), total = stations.length, cur = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function tag(el) { return el.getAttribute('data-tag') || ''; }
    function label(el) { return el.getAttribute('data-label') || ''; }

    function buildPop() {
      if (!pop) return;
      pop.innerHTML = stations.map(function (el, i) {
        return '<button data-i="' + i + '">' +
          '<span class="walkpop-n">' + (i + 1) + '</span>' +
          '<span class="walkpop-name">' + label(el) + '</span>' +
          '<span class="walkpop-tag">' + tag(el) + '</span></button>';
      }).join('');
      pop.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]');
        if (!b) return;
        pop.hidden = true; bar.classList.remove('is-open');
        goTo(+b.getAttribute('data-i'));
      });
    }
    function paint() {
      var el = stations[cur];
      if (stno) stno.textContent = 'Stop ' + (cur + 1);
      if (stlabel) stlabel.textContent = label(el);
      if (count) count.innerHTML = '<b>' + (cur + 1) + '</b> / ' + total;
      if (pop) Array.prototype.forEach.call(pop.children, function (b, i) {
        b.classList.toggle('is-cur', i === cur);
      });
      $('walk-prev').disabled = cur === 0;
      $('walk-next').disabled = cur === total - 1;
    }
    function goTo(i) {
      i = Math.max(0, Math.min(total - 1, i));
      var el = stations[i];
      var y = el.getBoundingClientRect().top + window.pageYOffset - (bar.offsetHeight + 12);
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
    function spy() {
      var line = bar.getBoundingClientRect().bottom + 4, i = 0;
      for (var k = 0; k < stations.length; k++) {
        if (stations[k].getBoundingClientRect().top <= line) i = k;
      }
      if (i !== cur) { cur = i; paint(); }
    }
    function wire() {
      $('walk-prev').onclick = function () { goTo(cur - 1); };
      $('walk-next').onclick = function () { goTo(cur + 1); };
      if (pop) {
        $('walk-jump').onclick = function () {
          pop.hidden = !pop.hidden; bar.classList.toggle('is-open', !pop.hidden);
        };
        document.addEventListener('click', function (e) {
          if (pop.hidden) return;
          if (!pop.contains(e.target) && !$('walk-jump').contains(e.target)) {
            pop.hidden = true; bar.classList.remove('is-open');
          }
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { pop.hidden = true; bar.classList.remove('is-open'); }
        });
      }
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return; ticking = true;
        window.requestAnimationFrame(function () { spy(); ticking = false; });
      }, { passive: true });
      window.addEventListener('resize', spy, { passive: true });
    }
    buildPop(); wire(); spy(); paint();
    window.addEventListener('load', spy);
  })();

  /* =================== 2. THE GEOMETRY FIGURES =================== */
  (function () {
    var figs = Array.prototype.slice.call(document.querySelectorAll('.gfig[data-anim]'));
    if (!figs.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var STEP = 780; /* ms between construction steps */

    figs.forEach(function (fig) {
      var svg = fig.querySelector('svg');
      if (!svg) return;
      var els = Array.prototype.slice.call(svg.querySelectorAll('[data-seq]'));
      var maxSeq = els.reduce(function (m, e) { return Math.max(m, +e.getAttribute('data-seq')); }, 0);
      var btn = fig.querySelector('.gp-btn');
      var timers = [];
      function clear() { timers.forEach(clearTimeout); timers = []; }
      function reset() { clear(); els.forEach(function (e) { e.classList.remove('drawn'); }); }
      function showAll() { els.forEach(function (e) { e.classList.add('drawn'); }); }
      function play() {
        reset();
        if (reduce) { showAll(); return; }
        for (var s = 1; s <= maxSeq; s++) {
          (function (s) {
            timers.push(setTimeout(function () {
              els.filter(function (e) { return +e.getAttribute('data-seq') === s; })
                 .forEach(function (e) { e.classList.add('drawn'); });
            }, (s - 1) * STEP));
          })(s);
        }
      }
      if (btn) btn.addEventListener('click', play);

      var played = false;
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting && !played) { played = true; play(); }
          });
        }, { threshold: 0.4 });
        io.observe(fig);
      } else {
        showAll();
      }
    });
  })();
})();
