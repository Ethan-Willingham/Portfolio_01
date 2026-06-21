/* the-body-rhymes.js
   The Body Rhymes. Scroll-reveal only (no charts in this post).
   Mirrors the reveal mechanism used by the other field guides so
   .reveal blocks fade up the first time they enter the viewport.
   Honors reduced motion, with a 4-second safety net so a block
   can never get stuck hidden.
*/
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  function fire(el) { el.classList.add('in'); }

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
