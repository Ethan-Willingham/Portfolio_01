/* ============================================================
   backtotop.js — a shared "back to top" affordance for posts.
   Self-contained: injects its own styles + button, no deps.

   Behaviour (chosen from the demo): a borderless arrow centered at the
   bottom that stays hidden until the reader reaches the BOTTOM of the
   page, then fades in and its arrow inks itself in (a drawn SVG stroke).
   On hover/focus it gains a faint highlight and expands to reveal a "top" label.
   Click returns to the top; focus moves to the top for keyboard/AT.

   Honours prefers-reduced-motion (no draw, no smooth scroll) and only
   shows on pages long enough to be worth it. Add to a page with:
     <script src="js/backtotop.js"></script>
   ============================================================ */
(function () {
  'use strict';
  if (document.querySelector('.btt-fab')) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css =
    '.btt-fab{position:fixed;left:50%;bottom:clamp(1rem,4vw,2.4rem);z-index:50;' +
      'display:inline-flex;align-items:center;padding:0.7rem 0.8rem;border:none;' +
      'font-family:var(--font-body,system-ui,sans-serif);font-size:0.88rem;line-height:inherit;' +
      'border-radius:2px;background:transparent;color:var(--text-dim,#B8B2A2);cursor:pointer;overflow:hidden;' +
      'opacity:0;transform:translateX(-50%);pointer-events:none;' +
      'transition:opacity .04s ease,color .25s ease;}' +
    '.btt-fab.show{opacity:1;pointer-events:auto;transition:opacity .45s ease,color .25s ease;}' +
    '.btt-fab svg{display:block;width:1.05em;height:1.05em;flex:none;}' +
    '.btt-fab .ar{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;' +
      'stroke-dasharray:27;stroke-dashoffset:27;transition:none;}' +
    '.btt-fab.show .ar{stroke-dashoffset:0;transition:stroke-dashoffset .9s ease .12s;}' +
    '.btt-fab .lbl{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;' +
      'transition:max-width .35s cubic-bezier(0.23,1,0.32,1),opacity .3s,margin .35s cubic-bezier(0.23,1,0.32,1);}' +
    '.btt-fab:hover{color:var(--text-bright,#F5F1EA);}' +
    '.btt-fab:hover .lbl,.btt-fab:focus-visible .lbl{max-width:5ch;opacity:1;margin-left:0.45em;}' +
    '.btt-fab:focus-visible{outline:none;color:var(--text-bright,#F5F1EA);box-shadow:0 0 0 2px rgba(212,196,160,0.5);}' +
    '@media (prefers-reduced-motion: reduce){.btt-fab,.btt-fab.show{transition:opacity .2s ease;}' +
      '.btt-fab .ar{transition:none;stroke-dashoffset:0;}.btt-fab .lbl{transition:none;}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'btt-fab';
  b.setAttribute('aria-label', 'Back to top');
  b.innerHTML =
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="ar" d="M10 16 L10 4.5 M4.5 9.5 L10 4.5 L15.5 9.5"/></svg>' +
    '<span class="lbl">top</span>';
  // It lives only at the very bottom: it inks in when you arrive there, and
  // the instant you scroll back up it's gone. It fades in place and never
  // travels up the page with the viewport; a click dismisses it at once.
  var shown = false;
  function show() {
    if (shown) return;
    shown = true;
    b.style.transition = '';
    b.classList.add('show');
  }
  function hide(fast) {
    if (!shown) return;
    shown = false;
    if (fast) b.style.transition = 'opacity .04s ease,color .25s ease';
    b.classList.remove('show');
  }

  b.addEventListener('click', function () {
    hide(true);                                           // vanish at once the moment it's used
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    var t = document.querySelector('h1') || document.querySelector('main') || document.body;
    if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  });
  document.body.appendChild(b);

  // Only worth a back-to-top on a genuinely long page.
  function longEnough() { return document.documentElement.scrollHeight > window.innerHeight * 1.8; }

  // Reveal as you ARRIVE at the bottom (within the zone, heading down); the instant you
  // back away upward it's gone, and it stays gone until you return to the bottom. We track
  // the deepest point reached rather than per-frame direction, so even a slow scroll-up
  // dismisses it promptly and pausing on the way up can never re-show it.
  var REVEAL_ZONE = 120;                                  // px from the bottom where it may appear
  var UP_DISMISS = 8;                                     // back away this far upward and it hides at once
  var lastY = window.scrollY || window.pageYOffset || 0;
  var deepest = lastY;                                    // furthest-down scrollY since we last headed down
  var ticking = false;
  function evaluate() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset || 0;
    if (y > lastY + 1 || y > deepest) deepest = y;        // heading down: chase the bottom so arrival re-reveals
    lastY = y;
    if (!longEnough()) { hide(); return; }
    if (deepest - y > UP_DISMISS) { hide(); return; }     // backed away from the bottom: dismiss immediately
    var fromBottom = document.documentElement.scrollHeight - (window.innerHeight + y);
    if (fromBottom <= REVEAL_ZONE) show(); else hide();
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(evaluate); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { lastY = deepest = window.scrollY || window.pageYOffset || 0; evaluate(); }, { passive: true });
  evaluate();
})();
