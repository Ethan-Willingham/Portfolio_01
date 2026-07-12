/* archive-banner.js
 * One source of truth for the "this post is archived" notice that sits at the
 * top of every page under /archive. Each archived post loads this with a single
 * <script src="/js/archive-banner.js"></script> placed as the first child of
 * <body>, so the banner renders at the very top with no flash.
 *
 * The styles are injected here (with hardcoded fallbacks) so the banner looks
 * right even on the older archived pages whose stylesheet link is broken.
 *
 * To change the wording or the stat, edit this one file. Bump ARCHIVED / TOTAL
 * as the site grows and the percentage updates itself.
 */
(function () {
  "use strict";
  if (document.querySelector(".arc-banner")) return; // never double-insert

  // The stat. Counted 2026-07-12: 19 archived, 12 still live on the homepage.
  // (weather.html entered the count when it was archived; it had never had a homepage card.)
  var ARCHIVED = 19;
  var TOTAL = 31;
  var PCT = Math.round((ARCHIVED / TOTAL) * 100); // 61

  var css =
    ".arc-banner{font-family:var(--font-body,'Segoe UI',system-ui,sans-serif);" +
    "box-sizing:border-box;width:100%;color:var(--text,#e8e2d6);" +
    "background:#42473a;border-bottom:1px solid rgba(223,194,136,0.42);" +
    "box-shadow:inset 0 3px 0 0 #dfc288;padding:18px 24px;position:relative;z-index:2}" +
    ".arc-banner .arc-banner__in{max-width:720px;margin:0 auto;display:flex;gap:16px;align-items:flex-start}" +
    ".arc-banner .arc-banner__mark{flex:0 0 auto;font-size:1.5rem;line-height:1.2;color:#e6c074}" +
    ".arc-banner .arc-banner__body{min-width:0}" +
    ".arc-banner .arc-banner__kicker{font-family:var(--font-mono,ui-monospace,'Commit Mono',monospace);" +
    "font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:#e6c074;" +
    "margin:.1em 0 .5em;font-weight:600}" +
    ".arc-banner .arc-banner__lead{font-size:1.05rem;line-height:1.5;margin:0 0 .5em;font-weight:600;" +
    "color:var(--text-bright,#f5f1ea)}" +
    ".arc-banner p{font-size:.95rem;line-height:1.6;margin:.45em 0;color:var(--text-dim,#b8b2a2)}" +
    ".arc-banner a{color:#e6c074;text-decoration:underline;text-underline-offset:2px;" +
    "text-decoration-thickness:1px;white-space:nowrap}" +
    ".arc-banner a:hover{color:#ede0c0}" +
    "@media(max-width:600px){.arc-banner{padding:15px 18px}.arc-banner .arc-banner__in{gap:12px}" +
    ".arc-banner .arc-banner__mark{font-size:1.25rem}.arc-banner .arc-banner__lead{font-size:1rem}" +
    ".arc-banner a{white-space:normal}}" +
    "@media print{.arc-banner{display:none}}";

  var style = document.createElement("style");
  style.setAttribute("data-arc-banner", "");
  style.textContent = css;
  document.head.appendChild(style);

  var banner = document.createElement("aside");
  banner.className = "arc-banner";
  banner.setAttribute("role", "note");
  banner.setAttribute("aria-label", "Archived post notice");
  banner.innerHTML =
    '<div class="arc-banner__in">' +
    '<span class="arc-banner__mark" aria-hidden="true">▣</span>' +
    '<div class="arc-banner__body">' +
    '<p class="arc-banner__kicker">Archived</p>' +
    '<p class="arc-banner__lead">You’re reading something I shelved.</p>' +
    "<p>I move things into the archive when I lose interest, decide the idea was " +
    "better in my head than on the page, or just don’t feel like finishing them " +
    "right now. About " + PCT + "% of what I start ends up in here, so this one " +
    "is in good company.</p>" +
    "<p>So set your expectations: the design is rough in spots, some of it is " +
    "half-built, and parts read exactly like what they are, a draft that an AI and " +
    "I never came back to polish. It is here for the idea, not the finish. " +
    '<a href="/">See what actually made it &rarr;</a></p>' +
    "</div></div>";

  function place() {
    if (document.querySelector(".arc-banner")) return;
    document.body.insertBefore(banner, document.body.firstChild);
  }
  if (document.body) {
    place();
  } else {
    document.addEventListener("DOMContentLoaded", place);
  }
})();
