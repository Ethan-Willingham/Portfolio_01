/* ============================================================
   get-used-to-everything.js
   Self-contained behavior for the habituation field guide.
   Two independent pieces, each guarded so one failing cannot
   break the other:
     1. scroll-reveal + figure draw-in animations
     2. the Troxler fading demo
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var reduce = false; /* owner: animate for everyone, even with prefers-reduced-motion set */

  /* ---------- 1. REVEAL + FIGURE ANIMATION ---------- */
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

  /* ---------- 2. TROXLER FADING DEMO ---------- */
  (function () {
    var stage = document.getElementById('tx-stage');
    if (!stage) return;
    var startBtn = document.getElementById('tx-start');
    var resetBtn = document.getElementById('tx-reset');
    var state = document.getElementById('tx-state');
    if (!startBtn || !resetBtn) return;

    /* soft, low-contrast peripheral dots in the muted palette */
    var dots = [
      { x: 22, y: 28, s: 19, c: '158,199,154' }, /* sage */
      { x: 78, y: 25, s: 17, c: '143,179,199' }, /* blue */
      { x: 30, y: 75, s: 21, c: '217,151,140' }, /* coral */
      { x: 73, y: 72, s: 18, c: '223,194,136' }, /* gold */
      { x: 50, y: 16, s: 15, c: '183,155,196' }, /* plum */
      { x: 50, y: 85, s: 16, c: '207,159,120' }  /* clay */
    ];
    dots.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'tx-dot';
      el.style.left = d.x + '%';
      el.style.top = d.y + '%';
      el.style.width = d.s + '%';
      el.style.background = 'radial-gradient(circle at 50% 50%, rgba(' + d.c + ',0.5) 0%, rgba(' + d.c + ',0) 70%)';
      stage.appendChild(el);
    });

    var fadeTimer = null;
    function setState(t) { if (state) state.textContent = t; }

    function fade() {
      stage.classList.add('faded');
      startBtn.classList.add('is-on');
      setState('fading, hold your gaze');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { setState('gone'); }, 6200);
    }
    function restore() {
      clearTimeout(fadeTimer);
      stage.classList.remove('faded');
      startBtn.classList.remove('is-on');
      setState('ready');
    }

    startBtn.addEventListener('click', fade);
    resetBtn.addEventListener('click', restore);
    /* any movement over the stage refreshes the image, exactly like a microsaccade */
    stage.addEventListener('pointermove', function () {
      if (stage.classList.contains('faded')) restore();
    });
  })();
})();
