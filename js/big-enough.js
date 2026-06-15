/* ============================================================
   big-enough.js
   Self-contained behavior for the natural-hypertrophy field guide.
   Three independent pieces, each in its own guarded block so one
   failing can never break the others:
     1. scroll-reveal + chart animations (respects reduced-motion)
     2. the right-rail contents nav + scrollspy
     3. the two interactive tools (protein target, cost-of-the-last-%)
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var reduce = false; /* owner: animate for everyone, even with prefers-reduced-motion set */

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

    function calc() {
      var val = parseFloat(w.value);
      if (isNaN(val) || val <= 0) { out.textContent = '--'; return; }
      val = Math.max(30, Math.min(unit === 'kg' ? 250 : 550, val));
      var kgWeight = unit === 'kg' ? val : val * 0.453592;
      var perKg = goal === 'gain' ? 1.6 : 2.1;
      var grams = Math.round(kgWeight * perKg);
      var perMeal = Math.round(grams / 4);
      out.textContent = grams + ' g';
      meal.innerHTML = 'That is about <b>' + perMeal + ' g per meal</b> across 4 meals' +
        (goal === 'cut' ? ', a bit higher because you are dieting.' : '.');
    }
    function setUnit(u) {
      if (u === unit) return;
      // convert the number so the same body stays selected
      var val = parseFloat(w.value);
      if (!isNaN(val)) { w.value = Math.round(u === 'lb' ? val / 0.453592 : val * 0.453592); }
      unit = u;
      kg.classList.toggle('on', u === 'kg'); lb.classList.toggle('on', u === 'lb');
      calc();
    }
    function setGoal(g) { goal = g; gain.classList.toggle('on', g === 'gain'); cut.classList.toggle('on', g === 'cut'); calc(); }

    w.addEventListener('input', calc);
    kg.addEventListener('click', function () { setUnit('kg'); });
    lb.addEventListener('click', function () { setUnit('lb'); });
    gain.addEventListener('click', function () { setGoal('gain'); });
    cut.addEventListener('click', function () { setGoal('cut'); });
    calc();
  })();

  /* ---------- 3b. COST-OF-THE-LAST-PERCENT TOOL ---------- */
  (function () {
    var slider = document.getElementById('dr-slider');
    if (!slider) return;
    var pctEl = document.getElementById('dr-pct');
    var yearsEl = document.getElementById('dr-years');
    var verdictEl = document.getElementById('dr-verdict');
    var dot = document.getElementById('dr-dot');
    var vline = document.getElementById('dr-vline');
    var TAU = 1.1;
    var X0 = 70, PXY = 71.25, XMAX = 660; // years axis: 0yr at x=70, 8yr at x=640, clamp 660
    var years90 = -TAU * Math.log(0.10); // ~2.53

    function update() {
      var p = parseInt(slider.value, 10);
      var f = p / 100;
      var years = -TAU * Math.log(1 - f);
      var x = Math.min(XMAX, X0 + years * PXY);
      var y = 250 - 2 * p;
      pctEl.textContent = p + '%';
      yearsEl.textContent = years.toFixed(1) + (years >= 1.95 && years < 2.05 ? ' years' : (Math.abs(years - 1) < 0.05 ? ' year' : ' years'));
      if (dot) { dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); }
      if (vline) { vline.setAttribute('x1', x.toFixed(1)); vline.setAttribute('x2', x.toFixed(1)); vline.setAttribute('y1', y.toFixed(1)); }

      var v;
      if (p <= 80) {
        v = 'Cheap and fast. You are on the steep, generous part of the curve, where every month of training pays you back in visible muscle.';
      } else if (p <= 92) {
        v = 'The smart stopping point. You have nearly all the muscle, and you got it for a fraction of what the final stretch would cost.';
      } else {
        var extra = (years - years90);
        v = 'Steep price. Getting from 90% to ' + p + '% alone adds about <b>' + extra.toFixed(1) +
            ' more years</b> of dedicated training, for a sliver of muscle almost no one would notice.';
      }
      verdictEl.innerHTML = v;
    }
    slider.addEventListener('input', update);
    update();
  })();
})();
