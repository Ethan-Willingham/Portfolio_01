/* ============================================================
   still-moving.js
   Self-contained behavior for the cardio + mobility field guide.
   Three independent pieces, each guarded so one failing can never
   break the others:
     1. scroll-reveal + chart draw-in animations
     2. the heart-rate zone calculator
     3. the cardio dose-response slider
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

  /* ---------- 2. HEART-RATE ZONE CALCULATOR ---------- */
  (function () {
    var age = document.getElementById('z-age');
    if (!age) return;
    var rest = document.getElementById('z-rest');
    var z2 = document.getElementById('z-z2'), hard = document.getElementById('z-hard'), mx = document.getElementById('z-mx');

    function band(lo, hi) { return Math.round(lo) + ' to ' + Math.round(hi); }

    function calc() {
      var a = parseInt(age.value, 10);
      if (isNaN(a)) { return; }
      a = Math.max(14, Math.min(100, a));
      var max = Math.round(208 - 0.7 * a); /* Tanaka 2001 */
      var r = parseInt(rest.value, 10);
      var useReserve = !isNaN(r) && r >= 30 && r < max - 20;
      var z2lo, z2hi, hlo, hhi;
      if (useReserve) {
        /* Karvonen heart-rate reserve */
        var hrr = max - r;
        z2lo = r + 0.60 * hrr; z2hi = r + 0.70 * hrr;
        hlo = r + 0.88 * hrr; hhi = r + 0.93 * hrr;
      } else {
        z2lo = 0.60 * max; z2hi = 0.70 * max;
        hlo = 0.90 * max; hhi = 0.95 * max;
      }
      z2.textContent = band(z2lo, z2hi);
      hard.textContent = band(hlo, hhi);
      mx.textContent = max;
    }
    age.addEventListener('input', calc);
    rest.addEventListener('input', calc);
    calc();
  })();

  /* ---------- 3. CARDIO DOSE-RESPONSE SLIDER ---------- */
  (function () {
    var slider = document.getElementById('d-slider');
    if (!slider) return;
    var minEl = document.getElementById('d-min');
    var pctEl = document.getElementById('d-pct');
    var verdictEl = document.getElementById('d-verdict');
    var dot = document.getElementById('d-dot');
    var vline = document.getElementById('d-vline');
    var FLOOR = 0.61, SPAN = 0.39, TAU = 95; /* HR = FLOOR + SPAN*exp(-min/TAU), fit to Arem 2015 */

    function update() {
      var min = parseInt(slider.value, 10);
      var hr = FLOOR + SPAN * Math.exp(-min / TAU);
      var pct = Math.round(((1 - hr) / SPAN) * 100);
      pct = Math.max(0, Math.min(100, pct));
      minEl.textContent = min + ' min/week';
      pctEl.textContent = pct + '%';

      /* move the marker on the mini curve */
      var x = 30 + (min / 600) * 330;
      var y = 20 + ((1 - hr) / 0.4) * 100;
      if (dot) { dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); }
      if (vline) { vline.setAttribute('x1', x.toFixed(1)); vline.setAttribute('x2', x.toFixed(1)); vline.setAttribute('y1', y.toFixed(1)); }

      var v;
      if (min === 0) {
        v = 'Nothing yet, and that means the single highest-return change in your whole health is sitting right in front of you. Even a daily walk moves this fast.';
      } else if (min < 75) {
        v = 'Below the official minimum, and already most of the way up the curve. This first bit is the best deal in preventive medicine.';
      } else if (min <= 300) {
        v = 'Squarely in the guideline range. You have nearly all of the benefit the data can find, for a few hours a week.';
      } else if (min <= 480) {
        v = 'Past the guideline, down near the floor of the curve. A little more buys a little more, and then it stops.';
      } else {
        v = 'Well past the point of extra years. Everything here is for fitness or for the love of it, not survival, and the data shows no harm in it.';
      }
      verdictEl.innerHTML = v;
    }
    slider.addEventListener('input', update);
    update();
  })();
})();
