/* ============================================================
   big-enough.js
   Self-contained behavior for the natural-hypertrophy field guide.
   Three independent pieces, each in its own guarded block:
     1. scroll-reveal + chart animations (respects reduced-motion)
     2. the protein target tool
     3. the weekly-volume tool
   ============================================================ */
(function () {
  'use strict';
  var reduce = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches;

  /* ---------- 1. REVEAL + CHART ANIMATION ---------- */
  (function () {
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function fire(el) {
      el.classList.add('in');
      var anim = el.querySelectorAll('.draw, .grow-b, .grow-v, .fade-el');
      for (var i = 0; i < anim.length; i++) anim[i].classList.add('go');
    }
    // If motion is off or the observer is missing, just show everything.
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach(fire);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    document.documentElement.classList.add('be-animate');
    reveals.forEach(function (el) { io.observe(el); });
    // Safety backstop: never leave content hidden if something goes wrong.
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();

  /* ---------- 2. PROTEIN TARGET TOOL ---------- */
  (function () {
    var w = document.getElementById('pc-weight');
    if (!w) return;
    var kg = document.getElementById('pc-kg'), lb = document.getElementById('pc-lb');
    var gain = document.getElementById('pc-gain'), cut = document.getElementById('pc-cut');
    var out = document.getElementById('pc-out'), meal = document.getElementById('pc-meal');
    var unit = 'lb', goal = 'gain';
    var LB_TO_KG = 0.45359237;
    var kgWeight = null;

    function readWeight() {
      var val = w.valueAsNumber;
      var valid = Number.isFinite(val) && val >= Number(w.min) && val <= Number(w.max);
      kgWeight = valid ? (unit === 'kg' ? val : val * LB_TO_KG) : null;
      w.setAttribute('aria-invalid', String(!valid));
    }
    function calc() {
      var invalid = kgWeight === null || !w.validity.valid;
      w.setAttribute('aria-invalid', String(invalid));
      if (invalid) {
        out.textContent = '--';
        meal.textContent = "Enter a bodyweight within the tool's range: 60 to 550 lb, or the equivalent in kg.";
        return;
      }
      var low = goal === 'gain' ? 1.6 : 1.8;
      var high = goal === 'gain' ? 1.6 : 2.7;
      var lowGrams = Math.round(kgWeight * low), highGrams = Math.round(kgWeight * high);
      out.textContent = lowGrams + (goal === 'cut' ? ' to ' + highGrams : '') + ' g';
      meal.textContent = 'If you divide that across 4 meals, about ' + Math.round(kgWeight * low / 4) +
        (goal === 'cut' ? ' to ' + Math.round(kgWeight * high / 4) : '') + ' g per meal. Four meals is optional.';
    }
    function setUnit(u) {
      if (u === unit) return;
      // Keep the underlying weight, rather than converting rounded displays back and forth.
      unit = u;
      w.min = u === 'kg' ? String(60 * LB_TO_KG) : '60';
      w.max = u === 'kg' ? String(550 * LB_TO_KG) : '550';
      var converted = u === 'kg' ? kgWeight : kgWeight / LB_TO_KG;
      var rounded = Math.round(converted * 10) / 10;
      w.value = kgWeight === null ? '' : String(Math.min(Number(w.max), Math.max(Number(w.min), rounded)));
      w.setAttribute('aria-label', 'Bodyweight in ' + (u === 'kg' ? 'kilograms' : 'pounds'));
      kg.classList.toggle('on', u === 'kg'); lb.classList.toggle('on', u === 'lb');
      kg.setAttribute('aria-pressed', String(u === 'kg')); lb.setAttribute('aria-pressed', String(u === 'lb'));
      calc();
    }
    function setGoal(g) {
      goal = g;
      gain.classList.toggle('on', g === 'gain'); cut.classList.toggle('on', g === 'cut');
      gain.setAttribute('aria-pressed', String(g === 'gain')); cut.setAttribute('aria-pressed', String(g === 'cut'));
      calc();
    }

    w.addEventListener('input', function () { readWeight(); calc(); });
    kg.addEventListener('click', function () { setUnit('kg'); });
    lb.addEventListener('click', function () { setUnit('lb'); });
    gain.addEventListener('click', function () { setGoal('gain'); });
    cut.addEventListener('click', function () { setGoal('cut'); });
    readWeight(); calc();
  })();

  /* ---------- 3b. WEEKLY VOLUME TOOL ---------- */
  (function () {
    var slider = document.getElementById('dr-slider');
    if (!slider) return;
    var setsEl = document.getElementById('dr-sets');
    var bandEl = document.getElementById('dr-band');
    var verdictEl = document.getElementById('dr-verdict');
    var dot = document.getElementById('dr-dot');
    var vline = document.getElementById('dr-vline');
    var X0 = 35, XMAX = 320;

    function update() {
      var sets = parseFloat(slider.value);
      var x = X0 + (sets / 30) * (XMAX - X0);
      setsEl.textContent = sets + (sets === 1 ? ' set' : ' sets');
      if (dot) dot.setAttribute('cx', x.toFixed(1));
      if (vline) {
        vline.setAttribute('x1', x.toFixed(1));
        vline.setAttribute('x2', x.toFixed(1));
      }

      var label, v;
      if (sets === 0) {
        label = 'No weekly sets selected';
        v = 'This selects no resistance-training dose for this muscle group. Trials showing growth from low volume still involve some training.';
      } else if (sets < 5) {
        label = 'Low weekly dose';
        v = 'This may build muscle, especially for a novice, but it sits below the volume current reviews associate with larger average hypertrophy.';
      } else if (sets < 10) {
        label = 'Productive dose';
        v = 'A time-efficient amount that can build muscle. If growth is the priority and recovery is good, more weekly work may help.';
      } else if (sets < 20) {
        label = 'Common starting range';
        v = 'Around ten challenging sets is a useful starting point when growth is the priority. This band is not a measured optimum. More can help, with smaller average returns.';
      } else {
        label = 'Smaller-return range';
        v = 'Higher volume can still work. Evidence is thinner at the far end, and the added fatigue makes individual recovery and progress the deciding tests.';
      }
      bandEl.textContent = label;
      verdictEl.textContent = v;
      slider.setAttribute('aria-valuetext', sets + ' weekly sets. ' + label + '.');
    }
    slider.addEventListener('input', update);
    update();
  })();
})();
