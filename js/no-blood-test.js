/* no-blood-test.js
   The Book With No Blood Test. Scroll-reveal + chart draw-in.
   Mirrors the reveal mechanism used by the other field guides so
   .reveal blocks fade up and .draw / .fade-el children animate
   the first time they enter the viewport. Honors reduced motion,
   and has a 4-second safety net so nothing can get stuck hidden.
*/
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  reveals.forEach(function (el) { io.observe(el); });

  // safety net: never leave a reveal block hidden
  setTimeout(function () {
    reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); });
  }, 4000);
})();
