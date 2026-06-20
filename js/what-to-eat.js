/* ============================================================
   what-to-eat.js
   Self-contained behavior for the diet field guide. Three
   independent pieces, each guarded so one failing can never
   break the others:
     1. scroll-reveal + chart draw-in animations
     2. the "three numbers" calculator (calories, protein, fiber)
     3. the "shapes of enough" dose-response explorer
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. REVEAL + CHART ANIMATION ---------- */
  (function () {
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function fire(el) {
      el.classList.add('in');
      var anim = el.querySelectorAll('.draw, .fade-el');
      for (var i = 0; i < anim.length; i++) anim[i].classList.add('go');
    }
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach(fire);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();

  /* small helper: wire a segmented button group, call cb(value, button) on click */
  function seg(id, cb) {
    var box = document.getElementById(id);
    if (!box) return null;
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !box.contains(b)) return;
      var sibs = box.querySelectorAll('button');
      for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove('on');
      b.classList.add('on');
      cb(b);
    });
    return box;
  }

  /* ---------- 2. THE THREE NUMBERS ---------- */
  (function () {
    var w = document.getElementById('n-weight');
    if (!w) return;
    var wv = document.getElementById('n-weight-v');
    var calEl = document.getElementById('n-cal'), proEl = document.getElementById('n-pro'),
        fibEl = document.getElementById('n-fib'), railEl = document.getElementById('n-rail');

    var unit = 'lb';      /* display only; weight is stored in lb on the slider */
    var act = 13;         /* calories per lb */
    var goal = 0;         /* calorie offset */

    function commas(n) { return Math.round(n).toLocaleString('en-US'); }

    function update() {
      var lb = parseInt(w.value, 10);
      if (unit === 'kg') {
        wv.textContent = Math.round(lb / 2.2046) + ' kg';
      } else {
        wv.textContent = lb + ' lb';
      }
      var maint = lb * act;
      var target = maint + goal;
      var protein = Math.round(0.7 * lb);
      var fiber = Math.round(target / 1000 * 14);

      calEl.textContent = commas(target);
      proEl.textContent = protein;
      fibEl.textContent = fiber;

      var note;
      if (goal < 0) {
        note = 'A roughly 500-calorie daily deficit, the standard pace for losing about a pound a week. Keep protein up so the weight you lose is fat, not muscle. ';
      } else if (goal > 0) {
        note = 'A small surplus for building muscle alongside lifting (see Big Enough). Bigger surpluses mostly add fat, not gains. ';
      } else {
        note = 'Roughly what it takes to hold steady. ';
      }
      railEl.innerHTML = note + 'These are rule-of-thumb estimates, not a prescription: calories are bodyweight times an activity factor, protein is 0.7 g per pound, and fiber is 14 g per 1,000 calories, the actual federal guideline. Real bodies run a few hundred calories either way, so treat them as a starting line and adjust by what the scale and the mirror do.';
    }

    w.addEventListener('input', update);
    seg('n-unit', function (b) { unit = b.getAttribute('data-unit'); update(); });
    seg('n-act', function (b) { act = parseInt(b.getAttribute('data-act'), 10); update(); });
    seg('n-goal', function (b) { goal = parseInt(b.getAttribute('data-goal'), 10); update(); });
    update();
  })();

  /* ---------- 3. THE SHAPES OF ENOUGH ---------- */
  (function () {
    var path = document.getElementById('s-path');
    if (!path) return;
    var verdict = document.getElementById('s-verdict');

    /* viewBox 380x170; x runs 34..368, y: 30 = good (top), 132 = bad (bottom) */
    var LEVERS = {
      protein: {
        d: 'M34,120 C 70,112 100,52 150,44 C 210,40 300,40 368,40',
        color: '#9ec79a',
        v: '<b>Protein: rises, then flat.</b> Climbs fast to about 0.7 g per pound, then a plateau. More does no harm, it just does nothing.'
      },
      fiber: {
        d: 'M34,128 C 110,116 200,80 280,58 C 320,47 350,40 368,36',
        color: '#9ec79a',
        v: '<b>Fiber: keeps paying.</b> One of the few levers with no clear plateau in the studied range. Almost nobody manages to eat too much.'
      },
      steps: {
        d: 'M34,134 C 64,120 90,58 130,48 C 200,38 300,38 368,38',
        color: '#8fb3c7',
        v: '<b>Walking: steep, then flat.</b> The jump from nothing to a daily walk is enormous; from a lot to more, tiny. The full story is in Still Moving.'
      },
      salt: {
        d: 'M34,118 C 80,70 150,40 200,40 C 250,40 320,72 368,116',
        color: '#dfc288',
        v: '<b>Salt: a U-curve.</b> Too much raises blood pressure, but very low intake is also tied to higher risk. Aim for the middle, not the minimum.'
      },
      anti: {
        d: 'M34,66 C 110,66 150,68 190,72 C 250,80 320,112 368,132',
        color: '#d9978c',
        v: '<b>Antioxidant pills: the cliff.</b> No benefit for a well-fed person, and at high doses they nudge the risk of dying up. The clearest case where more is worse.'
      }
    };

    function show(key) {
      var L = LEVERS[key] || LEVERS.protein;
      path.setAttribute('d', L.d);
      path.setAttribute('stroke', L.color);
      /* draw fresh each time unless reduced motion */
      path.classList.remove('draw', 'go');
      if (!reduce) {
        /* force reflow so the animation restarts */
        void path.getBoundingClientRect();
        path.classList.add('draw', 'go');
      }
      verdict.innerHTML = L.v;
    }

    seg('s-pick', function (b) { show(b.getAttribute('data-lever')); });
    show('protein');
  })();
})();
