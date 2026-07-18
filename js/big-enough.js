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
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      var sets = parseInt(slider.value, 10);
      var x = X0 + (sets / 30) * (XMAX - X0);
      setsEl.textContent = sets + (sets === 1 ? ' set' : ' sets');
      if (dot) dot.setAttribute('cx', x.toFixed(1));
      if (vline) {
        vline.setAttribute('x1', x.toFixed(1));
        vline.setAttribute('x2', x.toFixed(1));
      }

      var label, v;
      if (sets < 5) {
        label = 'Low weekly dose';
        v = 'This may build muscle, especially for a novice, but it sits below the volume current reviews associate with larger average hypertrophy.';
      } else if (sets < 10) {
        label = 'Productive dose';
        v = 'A time-efficient amount that can build muscle. If growth is the priority and recovery is good, more weekly work may help.';
      } else if (sets < 20) {
        label = 'High-return range';
        v = 'A defensible hypertrophy range for many lifters. More sets can still add growth, but the average return per set gets smaller.';
      } else {
        label = 'Smaller-return range';
        v = 'Higher volume can still work. Evidence is thinner at the far end, and the added fatigue makes individual recovery and progress the deciding tests.';
      }
      bandEl.textContent = label;
      verdictEl.innerHTML = v;
    }
    slider.addEventListener('input', update);
    update();
  })();
})();
