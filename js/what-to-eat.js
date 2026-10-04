/* ============================================================
   what-to-eat.js
   Self-contained behavior for the diet field guide. Three
   independent pieces, each guarded so one failing can never
   break the others:
     1. scroll-reveal + chart draw-in animations
     2. the "three numbers" calculator (calories, protein, fiber)
     3. qualitative evidence sketches
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var reduce = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches;

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
    document.documentElement.classList.add('we-animate');
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();

  /* small helper: wire a segmented button group, call cb(value, button) on click */
  function seg(id, cb) {
    var box = document.getElementById(id);
    if (!box) return null;
    var initial = box.querySelectorAll('button');
    for (var j = 0; j < initial.length; j++) initial[j].setAttribute('aria-pressed', initial[j].classList.contains('on') ? 'true' : 'false');
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !box.contains(b)) return;
      var sibs = box.querySelectorAll('button');
      for (var i = 0; i < sibs.length; i++) {
        sibs[i].classList.remove('on');
        sibs[i].setAttribute('aria-pressed', 'false');
      }
      b.classList.add('on');
      b.setAttribute('aria-pressed', 'true');
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

    var LB_TO_KG = 0.45359237;
    var unit = 'lb';
    var weightLb = parseFloat(w.value);
    var act = 13;         /* calories per lb */
    var goal = 0;         /* calorie offset */

    function commas(n) { return Math.round(n).toLocaleString('en-US'); }

    function update() {
      var lb = weightLb;
      if (unit === 'kg') {
        wv.textContent = (lb * LB_TO_KG).toFixed(1) + ' kg';
      } else {
        wv.textContent = lb + ' lb';
      }
      var maint = lb * act;
      var target = maint + goal;
      var protein = Math.round(1.6 * lb * LB_TO_KG);
      var fiber = Math.round(maint / 1000 * 14);
      var lowTarget = target < 1000;
      w.setAttribute('aria-valuetext', wv.textContent);

      calEl.textContent = lowTarget ? 'Individual' : commas(target);
      proEl.textContent = protein;
      fibEl.textContent = fiber;

      var note;
      if (lowTarget) {
        note = 'This combination gives less than 1,000 calories a day, so the tool withholds that calorie target. NIDDK also rejects goals below that level; it is not an adequate intake for everyone. ';
      } else if (goal < 0) {
        note = 'This example subtracts 500 calories from estimated maintenance. It does not predict a fixed weekly loss; expenditure and appetite change over time. ';
      } else if (goal > 0) {
        note = 'This example adds 250 calories to estimated maintenance for a goal of building muscle with resistance training. The appropriate intake depends on training and the actual result. ';
      } else {
        note = 'This is an illustrative maintenance estimate. ';
      }
      railEl.innerHTML = note + 'The calorie formula omits age, height, sex, and medical history. Protein uses a training target of 1.6 g/kg (about 0.7 g per pound); fiber uses 14 g per 1,000 estimated maintenance calories, so changing the goal does not automatically lower fiber. These examples are for adults, outside pregnancy or breastfeeding. For a more detailed model, see the <a href="https://www.niddk.nih.gov/bwp">NIDDK Body Weight Planner</a>.';
    }

    w.addEventListener('input', function () {
      weightLb = unit === 'kg' ? parseFloat(w.value) / LB_TO_KG : parseFloat(w.value);
      weightLb = Math.round(Math.max(90, Math.min(350, weightLb)));
      update();
    });
    seg('n-unit', function (b) {
      unit = b.getAttribute('data-unit');
      var factor = unit === 'kg' ? LB_TO_KG : 1;
      w.min = String(90 * factor);
      w.max = String(350 * factor);
      w.step = String(factor);
      w.value = String(weightLb * factor);
      update();
    });
    seg('n-act', function (b) { act = parseInt(b.getAttribute('data-act'), 10); update(); });
    seg('n-goal', function (b) { goal = parseInt(b.getAttribute('data-goal'), 10); update(); });
    update();
  })();

  /* ---------- 3. QUALITATIVE EVIDENCE SKETCHES ---------- */
  (function () {
    var path = document.getElementById('s-path');
    if (!path) return;
    var verdict = document.getElementById('s-verdict');
    var curve = document.getElementById('s-curve');
    var noCurve = document.getElementById('s-no-curve');

    /* Unquantified sketches, not fitted dose-response data. Outcomes differ by topic. */
    var LEVERS = {
      protein: {
        d: 'M34,120 C 70,112 100,52 150,44 C 210,40 300,40 368,40',
        color: '#9ec79a',
        v: '<b>Protein and training.</b> Average fat-free-mass gains showed diminishing returns near 0.7 g per pound. The estimated cutoff is uncertain. This curve is schematic, not a fitted result. <a href="https://pubmed.ncbi.nlm.nih.gov/28698222/">Morton 2018</a>'
      },
      fiber: {
        d: 'M34,128 C 110,116 200,80 280,58 C 320,47 350,40 368,36',
        color: '#9ec79a',
        v: '<b>Fiber and health.</b> Higher intake was associated with lower disease risk. The review suggested benefit beyond 25 to 29 grams daily, without establishing unlimited benefit. This curve is schematic. <a href="https://pubmed.ncbi.nlm.nih.gov/30638909/">Reynolds 2019</a>'
      },
      steps: {
        d: 'M34,134 C 64,120 90,58 130,48 C 200,38 300,38 368,38',
        color: '#8fb3c7',
        v: '<b>Walking and mortality.</b> Cohort studies associated more steps with lower mortality, with diminishing returns at a level that varied by age. The sketch is not a measured curve. <a href="https://pubmed.ncbi.nlm.nih.gov/35247352/">Paluch 2022</a>. See <a href="still-moving.html">Still Moving</a> for more.'
      },
      salt: {
        d: 'M34,40 C 110,48 220,82 368,132',
        color: '#dfc288',
        v: '<b>Sodium and cardiovascular risk.</b> Repeated urine measurements associated higher sodium with higher risk. They do not support choosing a protective middle from a U-shaped curve. Most adults are advised to stay below 2,300 mg of sodium daily. The sketch is qualitative. <a href="https://www.nejm.org/doi/full/10.1056/NEJMoa2109794">Ma 2022</a>; <a href="https://cdn.realfood.gov/DGA_508.pdf">Dietary Guidelines</a>.'
      },
      anti: {
        d: '',
        color: '#d9978c',
        v: '<b>Antioxidant supplements.</b> Some trials found harm from beta-carotene, vitamin A, or vitamin E supplements, especially in particular populations. The full pooled mortality result was inconclusive. Those comparisons do not establish a common dose-response curve, so none is drawn here. The forest plot above gives the actual estimates. <a href="https://jamanetwork.com/journals/jama/fullarticle/205797">Bjelakovic 2007</a>'
      }
    };

    function show(key) {
      var L = LEVERS[key] || LEVERS.protein;
      path.setAttribute('d', L.d);
      if (noCurve) noCurve.setAttribute('visibility', L.d ? 'hidden' : 'visible');
      path.setAttribute('stroke', L.color);
      /* draw fresh each time unless reduced motion */
      path.classList.remove('draw', 'go');
      if (!reduce) {
        /* force reflow so the animation restarts */
        void path.getBoundingClientRect();
        path.classList.add('draw', 'go');
      }
      verdict.innerHTML = L.v;
      if (curve) curve.setAttribute('aria-label', verdict.textContent);
    }

    seg('s-pick', function (b) { show(b.getAttribute('data-lever')); });
    show('protein');
  })();
})();
