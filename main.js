/* Reading progress bar */
(function () {
  'use strict';
  var bar = document.getElementById('reading-progress');
  if (!bar) return;
  var ticking = false;
  function update() {
    var scrollTop  = window.scrollY || document.documentElement.scrollTop;
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = scrollable <= 0 ? '100%' : Math.min((scrollTop / scrollable) * 100, 100) + '%';
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();

/* Copy buttons on code blocks */
(function () {
  'use strict';
  var COPY_SVG = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  var pres = document.querySelectorAll('.post-body pre');
  for (var i = 0; i < pres.length; i++) {
    var btn = document.createElement('button');
    btn.className = 'code-copy';
    btn.innerHTML = COPY_SVG;
    btn.title = 'Copy';
    pres[i].appendChild(btn);
    (function (b, pre) {
      b.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        navigator.clipboard.writeText(text).then(function () {
          b.innerHTML = CHECK_SVG;
          b.classList.add('copied');
          setTimeout(function () {
            b.innerHTML = COPY_SVG;
            b.classList.remove('copied');
          }, 1500);
        });
      });
    })(btn, pres[i]);
  }
})();
