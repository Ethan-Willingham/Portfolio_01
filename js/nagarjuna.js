/* Native disclosures keep the reading guide usable without JavaScript.
   Open any enclosing panels when a concept or source is linked directly. */
(function () {
  'use strict';

  function reveal(target) {
    for (var el = target; el; el = el.parentElement) {
      if (el.tagName === 'DETAILS') el.open = true;
    }
  }

  function openTarget(align) {
    var target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    reveal(target);
    if (align) {
      window.requestAnimationFrame(function () {
        target.scrollIntoView({ block: 'start' });
      });
    }
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (!link) return;
    var target = document.getElementById(link.hash.slice(1));
    if (target) reveal(target);
  });

  openTarget(false);
  window.addEventListener('hashchange', function () { openTarget(true); });
  window.addEventListener('load', function () { openTarget(true); });
})();
