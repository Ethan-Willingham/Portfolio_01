/* ============================================================
   backtotop.js - a shared "back to top" affordance for posts.
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
    '.btt-fab{position:fixed;left:50%;' +
      'bottom:calc(clamp(1rem,4vw,2.4rem) + env(safe-area-inset-bottom,0px) + var(--btt-vv,0px));z-index:50;' +
      'display:inline-flex;align-items:center;padding:0.7rem 0.8rem;border:none;' +
      'font-family:var(--font-body,system-ui,sans-serif);font-size:0.88rem;line-height:inherit;' +
      'border-radius:2px;background:transparent;color:var(--text-dim,#B8B2A2);cursor:pointer;overflow:hidden;' +
      // iOS paints a translucent-black box over a tapped control by default; kill it
      // (and the long-press callout) so a tap shows nothing but the scroll.
      '-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;' +
      'opacity:0;transform:translateX(-50%);pointer-events:none;' +
      'transition:opacity .04s ease,color .25s ease;}' +
    '.btt-fab.show{opacity:1;pointer-events:auto;transition:opacity .45s ease,color .25s ease;}' +
    '.btt-fab svg{display:block;width:1.05em;height:1.05em;flex:none;}' +
    '.btt-fab .ar{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;' +
      'stroke-dasharray:27;stroke-dashoffset:27;transition:none;}' +
    '.btt-fab.show .ar{stroke-dashoffset:0;transition:stroke-dashoffset .9s ease .12s;}' +
    '.btt-fab .lbl{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;' +
      'transition:max-width .35s cubic-bezier(0.23,1,0.32,1),opacity .3s,margin .35s cubic-bezier(0.23,1,0.32,1);}' +
    // Keyboard focus always reveals the label + highlight.
    '.btt-fab:focus-visible .lbl{max-width:5ch;opacity:1;margin-left:0.45em;}' +
    '.btt-fab:focus-visible{outline:none;color:var(--text-bright,#F5F1EA);box-shadow:0 0 0 2px rgba(212,196,160,0.5);}' +
    // Hover reveal is pointer-only. On a touch device the first tap would otherwise
    // land on :hover (opening the "top" label), and the browser swallows that tap as
    // a hover, forcing a second tap to actually scroll. Gate it to real pointers so a
    // single tap goes straight to the click handler and returns to the top.
    '@media (hover: hover) and (pointer: fine){' +
      '.btt-fab:hover{color:var(--text-bright,#F5F1EA);}' +
      '.btt-fab:hover .lbl{max-width:5ch;opacity:1;margin-left:0.45em;}' +
    '}' +
    // The click handler parks focus on the page title for keyboard/AT users.
    // Safari draws a default focus ring around it even on a tap; suppress that
    // ring when the move came from a tap/click (the handler adds .btt-noring).
    '.btt-noring:focus{outline:none;}' +
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

  var lastAct = 0;
  function goTop(ring) {
    // One activation guard: on touch we act on touchend AND cancel the synthesized
    // click, but keep this in case a browser slips the click through anyway.
    if (Date.now() - lastAct < 600) return;
    lastAct = Date.now();
    hide(true);                                           // vanish at once the moment it's used
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    var t = document.querySelector('h1') || document.querySelector('main') || document.body;
    if (t) {
      t.setAttribute('tabindex', '-1');
      // Move focus to the top for keyboard/AT, but don't box the title in a focus
      // ring for a tap/click; a keyboard activation (ring) keeps it so the jump shows.
      if (ring) t.classList.remove('btt-noring'); else t.classList.add('btt-noring');
      t.focus({ preventScroll: true });
    }
  }

  // Touch path: act on the FIRST tap. Left to itself, iOS Safari runs a mouse-
  // emulation dance on the first tap of a control (hover, focus, THEN a deferred
  // click) that swallows it, so it took a second tap to scroll. Handling touchend
  // and preventing its default cancels that whole sequence (the emulated
  // mouse/focus events and the deferred click), so a single tap scrolls at once
  // and nothing flashes under the finger. A drag that began on the button is left
  // to scroll the page.
  var tsx = 0, tsy = 0, tMoved = false;
  b.addEventListener('touchstart', function (ev) {
    var t = ev.changedTouches[0]; tsx = t.clientX; tsy = t.clientY; tMoved = false;
  }, { passive: true });
  b.addEventListener('touchmove', function (ev) {
    var t = ev.changedTouches[0];
    if (Math.abs(t.clientX - tsx) > 10 || Math.abs(t.clientY - tsy) > 10) tMoved = true;
  }, { passive: true });
  b.addEventListener('touchend', function (ev) {
    if (tMoved) return;                                   // was a scroll/drag, not a tap
    ev.preventDefault();                                  // cancel the emulated mouse + deferred click
    goTop(false);
  }, { passive: false });

  // Mouse and keyboard (Enter/Space and AT activation arrive as a click; detail 0
  // means a keyboard/AT activation, which keeps the focus ring).
  b.addEventListener('click', function (ev) { goTop(ev.detail === 0); });
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

  // Mobile browsers slide a toolbar over the BOTTOM of the layout viewport, which
  // is exactly where this button sits and exactly when it appears (at the page
  // bottom). Lift it by however much of the layout viewport the toolbar (or an
  // on-screen keyboard) currently hides, read from the visual viewport, so it is
  // never tucked behind the chrome. No-op on desktop (visual == layout viewport).
  function syncViewport() {
    var vv = window.visualViewport;
    var hidden = vv ? (window.innerHeight - vv.height - vv.offsetTop) : 0;
    b.style.setProperty('--btt-vv', (hidden > 0 ? hidden : 0) + 'px');
  }

  function evaluate() {
    ticking = false;
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll < 0) maxScroll = 0;
    var y = window.scrollY || window.pageYOffset || 0;
    if (y > maxScroll) y = maxScroll;                     // ignore iOS rubber-band overscroll past the end
    if (y > lastY + 1 || y > deepest) deepest = y;        // heading down: chase the bottom so arrival re-reveals
    if (deepest > maxScroll) deepest = maxScroll;         // overscroll must not inflate the high-water mark, or the
    lastY = y;                                            // settle-back from the bounce would read as "scrolled up"
    if (!longEnough()) { hide(); return; }
    if (deepest - y > UP_DISMISS) { hide(); return; }     // backed away from the bottom: dismiss immediately
    var fromBottom = maxScroll - y;
    if (fromBottom <= REVEAL_ZONE) show(); else hide();
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(evaluate); } }
  function onResize() { syncViewport(); lastY = deepest = window.scrollY || window.pageYOffset || 0; evaluate(); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  // The mobile toolbar showing/hiding fires on the visual viewport, often without
  // a window 'resize', so track it directly to keep both the lift and the reveal current.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize, { passive: true });
    window.visualViewport.addEventListener('scroll', function () { syncViewport(); onScroll(); }, { passive: true });
  }
  syncViewport();
  evaluate();
})();

/* Owner-only: this script is on every post and the homepage, so it is the one
   place to bootstrap the private edit affordances without touching every page.
   A normal visitor has no `be_owner` flag, so this no-ops and owner-edit.js is
   never even fetched; the public site is 100% unchanged for them. The flag only
   says "show my edit controls on this device"; it is not the key and acting on
   any affordance still requires the password. */
(function () {
  "use strict";
  try {
    if (localStorage.getItem("be_owner") !== "1") return;
    var s = document.createElement("script");
    s.src = "/js/owner-edit.js";
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
