/* ============================================================
   the-other-hours.js
   Self-contained behavior for the "rest of health" field guide.
   Three independent pieces, each guarded so one failing can never
   break the others:
     1. scroll-reveal + chart draw/grow animations
     2. the caffeine curfew calculator
     3. the leverage-weighted "where your next hour goes" audit
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
      var anim = el.querySelectorAll('.draw, .fade-el, .grow');
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

  /* ---------- 2. CAFFEINE CURFEW ---------- */
  (function () {
    var bed = document.getElementById('c-bed');
    if (!bed) return;
    var sens = document.getElementById('c-sens');
    var out = document.getElementById('c-out');

    function fmt(mins) {
      mins = ((mins % 1440) + 1440) % 1440;
      var h = Math.floor(mins / 60), m = mins % 60;
      var ap = h < 12 ? 'am' : 'pm';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
    }
    function calc() {
      var parts = (bed.value || '22:30').split(':');
      var bedMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      if (isNaN(bedMin)) return;
      var hrs = parseInt(sens.value, 10);
      out.textContent = fmt(bedMin - hrs * 60);
    }
    bed.addEventListener('input', calc);
    sens.addEventListener('change', calc);
    calc();
  })();

  /* ---------- 3. THE LEVERAGE-WEIGHTED AUDIT ---------- */
  (function () {
    var grid = document.getElementById('audit-grid');
    if (!grid) return;
    var head = document.getElementById('audit-head');
    var note = document.getElementById('audit-note');
    var selects = Array.prototype.slice.call(grid.querySelectorAll('select'));

    /* one entry per row, in document order, with the advice to surface */
    var levers = [
      { head: 'Lock down your sleep first', note: 'It sits upstream of almost everything else here. Pick a fixed wake time, get morning light, and keep alcohol and late caffeine out of the back half of the night. If you snore and wake up wrecked, get checked for apnea.' },
      { head: 'Invest in the people around you', note: 'On the evidence, this is health, not leisure. Protect a standing get-together, make the call you keep putting off, and treat your close relationships like something you train.' },
      { head: 'Quitting smoking is your single highest-leverage move', note: 'Nothing else on this list comes close. Quitting by around 40 buys back most of the lost decade, and earlier reclaims nearly all of it. Make this the one thing you fix.' },
      { head: 'Find out your blood pressure', note: 'It is the most treatable major killer and it has no symptoms. A cheap home cuff and, if needed, a generic pill prevent more harm than almost anything in medicine. Add a blood panel while you are at it.' },
      { head: 'Pull back on the alcohol', note: 'There is no health case for it; the protective glass of wine was a measurement error. Drink less, or not at all, and never for your heart.' },
      { head: 'Start moving, even a little', note: 'A daily walk is the highest-return change there is if you do nothing now. The fitness guides on this site lay out how little it takes, in Big Enough and Still Moving.' },
      { head: 'Get outside in the morning', note: 'Daylight, early and outdoors, is the cheapest sleep and mood upgrade on this page. Ten minutes and a coat, most days.' }
    ];

    function update() {
      var bestIdx = -1, bestGap = 0;
      for (var i = 0; i < selects.length; i++) {
        var w = parseInt(selects[i].getAttribute('data-w'), 10) || 0;
        var v = parseInt(selects[i].value, 10) || 0;
        var gap = w * v;
        if (gap > bestGap) { bestGap = gap; bestIdx = i; }
      }
      if (bestIdx === -1) {
        head.textContent = 'You have the big levers covered';
        note.textContent = 'Genuinely, the high-leverage stuff looks handled. Keep it up, and everything below this is fine-tuning. That is a good place to be.';
        return;
      }
      head.textContent = levers[bestIdx].head;
      note.textContent = levers[bestIdx].note;
    }
    selects.forEach(function (s) { s.addEventListener('change', update); });
    update();
  })();
})();
