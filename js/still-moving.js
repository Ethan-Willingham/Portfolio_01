/* ============================================================
   still-moving.js
   Self-contained behavior for the cardio + mobility field guide.
   Three independent pieces, each guarded so one failing can never
   break the others:
     1. scroll-reveal + chart draw-in animations
     2. the heart-rate zone calculator
     3. the weekly aerobic-minute calculator
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (pointer: fine)').matches;

  /* ---------- 1. REVEAL + CHART ANIMATION ---------- */
  (function () {
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function fire(el) {
      el.classList.add('in');
      var anim = el.querySelectorAll('.draw, .fade-el');
      for (var i = 0; i < anim.length; i++) anim[i].classList.add('go');
    }
    if (!motion || !('IntersectionObserver' in window)) {
      reveals.forEach(fire);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    document.documentElement.classList.add('sm-animate');
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();

  /* ---------- 2. HEART-RATE GUIDE ---------- */
  (function () {
    var age = document.getElementById('z-age');
    if (!age) return;
    var rest = document.getElementById('z-rest');
    var moderate = document.getElementById('z-z2');
    var hard = document.getElementById('z-hard');
    var mx = document.getElementById('z-mx');
    var cue = document.getElementById('z-cue');

    function band(lo, hi) { return Math.round(lo) + ' to ' + Math.round(hi); }
    function invalid(message) {
      moderate.textContent = hard.textContent = mx.textContent = '--';
      cue.textContent = message;
    }
    function calc() {
      var a = age.valueAsNumber;
      if (!Number.isFinite(a) || !Number.isInteger(a) || a < 18 || a > 81) {
        invalid('Enter an age from 18 to 81, the age range used in laboratory validation.');
        return;
      }
      var max = 208 - 0.7 * a; /* Tanaka 2001: predict maximum, not a measured threshold. */
      if (rest.validity.badInput) {
        invalid('Finish entering a resting heart rate, or leave the field blank.');
        return;
      }
      var hasRest = rest.value !== '';
      var r = rest.valueAsNumber;
      if (hasRest && (!Number.isFinite(r) || !Number.isInteger(r) || r < 30 || r > 120 || r >= max)) {
        invalid('Enter a resting heart rate from 30 to 120, below the predicted maximum, or leave it blank.');
        return;
      }
      if (hasRest) {
        var reserve = max - r;
        moderate.textContent = band(r + 0.40 * reserve, r + 0.59 * reserve);
        cue.textContent = 'Moderate estimate uses heart-rate reserve: resting HR + a fraction of (maximum minus resting HR). It does not measure your zone 2 threshold.';
      } else {
        moderate.textContent = band(0.64 * max, 0.76 * max);
        cue.textContent = 'Moderate estimate uses a percentage of predicted maximum. This does not measure your zone 2 threshold. At moderate effort you can talk, but singing is difficult.';
      }
      /* Helgerud's interval target is a percentage of maximum, independent of reserve. */
      hard.textContent = band(0.90 * max, 0.95 * max);
      mx.textContent = Math.round(max);
    }
    age.addEventListener('input', calc);
    rest.addEventListener('input', calc);
    calc();
  })();

  /* ---------- 3. WEEKLY AEROBIC MINUTES ---------- */
  (function () {
    var slider = document.getElementById('d-slider');
    if (!slider) return;
    var vigorous = document.getElementById('d-vigorous');
    var minEl = document.getElementById('d-min');
    var totalEl = document.getElementById('d-pct');
    var verdictEl = document.getElementById('d-verdict');
    var dot = document.getElementById('d-dot');
    var vline = document.getElementById('d-vline');
    var chart = document.getElementById('d-curve');
    var chartMax = Number(slider.max) + 2 * Number(vigorous.max);

    function update() {
      var moderate = slider.valueAsNumber;
      var hard = vigorous.valueAsNumber;
      minEl.textContent = moderate + ' min/week';
      slider.setAttribute('aria-valuetext', moderate + ' moderate minutes per week');
      if (!Number.isFinite(hard) || !Number.isInteger(hard) || hard < 0 || hard > Number(vigorous.max)) {
        totalEl.textContent = '--';
        verdictEl.textContent = 'Enter vigorous minutes from 0 to 600.';
        dot.setAttribute('visibility', 'hidden');
        vline.setAttribute('visibility', 'hidden');
        chart.setAttribute('aria-label', 'Enter valid vigorous minutes to plot the weekly total.');
        return;
      }
      var total = moderate + 2 * hard;
      totalEl.textContent = total;
      var x = 30 + Math.max(0, Math.min(chartMax, total)) / chartMax * 330;
      dot.setAttribute('visibility', 'visible');
      vline.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x.toFixed(1));
      vline.setAttribute('x1', x.toFixed(1));
      vline.setAttribute('x2', x.toFixed(1));
      chart.setAttribute('aria-label', total + ' moderate-equivalent minutes per week. The adult guideline range of 150 to 300 is highlighted.');
      if (total === 0) {
        verdictEl.textContent = 'No aerobic minutes entered. Start with activity you can manage, then build gradually.';
      } else if (total < 150) {
        verdictEl.textContent = 'Below the weekly target. Smaller amounts still help; you do not need to reach 150 before activity is worthwhile.';
      } else if (total <= 300) {
        verdictEl.textContent = 'In the recommended range of 150 to 300 moderate-equivalent minutes. This is a guideline comparison, not a personal health forecast.';
      } else {
        verdictEl.textContent = 'Above the guideline range. Additional activity can help; this calculator does not establish your optimal or safe maximum.';
      }
    }
    slider.addEventListener('input', update);
    vigorous.addEventListener('input', update);
    update();
  })();
})();
