/* The Torah concept index uses native details elements. This small layer makes
   deep links open the concept they point to, then leaves disclosure behavior
   to the browser. */
(function () {
  'use strict';

  function targetConcept() {
    if (!location.hash) return null;
    var target = document.getElementById(location.hash.slice(1));
    return target && target.classList.contains('torah-concept') ? target : null;
  }

  function openTarget(align) {
    var target = targetConcept();
    if (!target) return;
    target.open = true;
    if (align) {
      window.setTimeout(function () {
        target.scrollIntoView({ block: 'start' });
      }, 80);
    }
  }

  document.querySelectorAll('.concept-index a').forEach(function (link) {
    link.addEventListener('click', function () {
      var id = link.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (target) target.open = true;
    });
  });

  window.addEventListener('hashchange', function () { openTarget(true); });
  window.addEventListener('load', function () { openTarget(true); });
})();
