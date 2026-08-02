/* archive-banner.js
 * One source of truth for the "this post is still in progress" notice that sits at the
 * top of every page under /archive, and on the hub page of a collection that is
 * still being filled out. Each such page loads this with a single
 * <script src="/js/archive-banner.js"></script> placed as the first child of
 * <body>, so the banner renders at the very top with no flash. (An in-progress
 * hub gets that line from tools/gen-hubs.mjs, from its inProgress flag.)
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

  // The stat. Recounted 2026-08-01, when the philosophy and power-story-love
  // collections moved to the In Progress index: 40 in progress (19 under
  // /archive plus those two collections' 14 + 7 live members), against 84 posts
  // in all (12 homepage cards + 32 on the Longform shelf + the 40).
  // The old 20/31 counted only the archive against the homepage, which left out
  // the whole Longform shelf and so overstated the share. This denominator is
  // every post on the site. Recount both numbers together; a bump to one alone
  // makes the sentence below false. `node tools/build-search-index.mjs` prints
  // the active / in progress / archived split, which is the easiest recount.
  var ARCHIVED = 40;
  var TOTAL = 84;
  var PCT = Math.round((ARCHIVED / TOTAL) * 100); // 48

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
  banner.setAttribute("aria-label", "In-progress post notice");
  banner.innerHTML =
    '<div class="arc-banner__in">' +
    '<span class="arc-banner__mark" aria-hidden="true">▣</span>' +
    '<div class="arc-banner__body">' +
    '<p class="arc-banner__kicker">In Progress</p>' +
    '<p class="arc-banner__lead">You’re reading something that isn’t ready yet.</p>' +
    "<p>Nothing I make shows up finished. Every post starts rough and goes through " +
    "a lot of versions; the ones in here just aren’t there yet, still being worked " +
    "on, on hold, or not how I want them. About " + PCT + "% of what I start is " +
    "sitting in progress like this, so this one is in good company.</p>" +
    "<p>So set your expectations: the design is rough in spots, some of it is " +
    "half-built, and parts read exactly like what they are, a draft an AI and I " +
    "haven’t come back to polish yet. It is here for the idea, not the finish. " +
    '<a href="/">See what’s ready &rarr;</a></p>' +
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
