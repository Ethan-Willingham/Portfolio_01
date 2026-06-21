/* The Chemical Path: gentle reveal-on-scroll.
   The post is otherwise static (a comparison table, an SVG figure, prose).
   This runs first, so a later error can never leave a .reveal element stuck
   at opacity 0. Without JS the CSS reduced-motion fallback shows everything.
   (Same pattern as js/frankl.js.) */
(function () {
  'use strict';
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (!reveals.length) return;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }
})();
