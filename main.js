/* Reading progress bar — post pages only */
(function () {
  'use strict';
  var bar = document.getElementById('reading-progress');
  if (!bar) return;
  var ticking = false;
  function update() {
    var scrollTop  = window.scrollY || document.documentElement.scrollTop;
    var docHeight  = document.documentElement.scrollHeight;
    var winHeight  = window.innerHeight;
    var scrollable = docHeight - winHeight;
    bar.style.width = scrollable <= 0 ? '100%' : Math.min((scrollTop / scrollable) * 100, 100) + '%';
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();
