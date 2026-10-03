/* Native passage disclosures, with links into them and a complete print view. */
(function () {
  'use strict';

  function revealLinkedPassage() {
    var id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); }
    catch (_) { return; }
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    var disclosure = target.closest('details');
    if (!disclosure) return;
    disclosure.open = true;
    window.requestAnimationFrame(function () {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }

  window.addEventListener('hashchange', revealLinkedPassage);
  revealLinkedPassage();

  var printState = [];
  window.addEventListener('beforeprint', function () {
    if (printState.length) return;
    document.querySelectorAll('main details').forEach(function (item) {
      printState.push({ item: item, open: item.open });
      item.open = true;
    });
  });
  window.addEventListener('afterprint', function () {
    printState.forEach(function (state) { state.item.open = state.open; });
    printState = [];
  });
})();
