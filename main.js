/* ============================================================
   MAIN.JS
   Minimal — just powers the reading-progress bar on post pages.
   ============================================================ */

(function () {
  'use strict';

  var bar = document.getElementById('reading-progress');
  if (!bar) return;

  var ticking = false;

  function updateProgress() {
    var scrollTop    = window.scrollY || document.documentElement.scrollTop;
    var docHeight    = document.documentElement.scrollHeight;
    var winHeight    = window.innerHeight;
    var scrollable   = docHeight - winHeight;

    if (scrollable <= 0) {
      bar.style.width = '100%';
      return;
    }

    var percent = Math.min((scrollTop / scrollable) * 100, 100);
    bar.style.width = percent + '%';
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(updateProgress);
      ticking = true;
    }
  }, { passive: true });

  // Run once on load
  updateProgress();
})();
