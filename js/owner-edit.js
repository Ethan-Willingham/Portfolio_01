/* ============================================================================
   owner-edit.js  -  the owner's private edit affordances on the public site.

   This file is loaded ONLY on a device that has unlocked the editor before
   (backtotop.js checks the harmless localStorage flag `be_owner` and injects
   this script only when it is set). A stranger has no flag, so this file is
   never even fetched, and the public site stays exactly normal for everyone
   else. The flag is not the key and reveals nothing: clicking any affordance
   still routes through blog-edit.html / post-builder.html, which require the
   password to decrypt the GitHub key. A lost laptop exposes nothing.

   Default affordance (the owner can change it via entry-lab.html): one small,
   low-key control in the bottom-right corner that opens a short menu, "Edit
   this page", "New post", and "Forget this device".
   ============================================================================ */
(function () {
  "use strict";
  if (window.__ownerEditMounted) return;            // never double-mount
  try { if (localStorage.getItem("be_owner") !== "1") return; } catch (e) { return; }
  window.__ownerEditMounted = true;

  // ---- what is this page? ----------------------------------------------------
  // path relative to the site root, e.g. "the-far-side-of-the-body.html" or
  // "archive/the-number/the-number.html". "/" and "/index.html" are the homepage.
  var path = location.pathname.replace(/^\/+/, "");
  if (path === "" || path === "index.html") path = "index.html";
  var isHome = path === "index.html";
  // Editor surfaces never get the affordance (they don't load backtotop, but be safe).
  if (/^(blog-edit|post-builder|edit)\.html$/.test(path) || /-lab\.html$/.test(path)) return;
  var editPath = path;                              // the file the page editor should open
  var editLabel = isHome ? "Edit the homepage" : "Edit this page";

  // ---- styles (scoped, palette tokens, print-hidden, reduced-motion aware) ----
  var css =
    ".oe-fab{position:fixed;right:calc(clamp(1rem,4vw,2.2rem) + env(safe-area-inset-right,0px));" +
      "bottom:calc(clamp(1rem,4vw,2.2rem) + env(safe-area-inset-bottom,0px));z-index:80;" +
      "width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;" +
      "border-radius:999px;border:1px solid var(--rule,#4a544b);background:var(--bg-raised,#1e2420);" +
      "color:var(--accent,#d4c4a0);cursor:pointer;opacity:.5;" +
      "box-shadow:0 1px 2px rgba(8,12,9,.4),0 12px 30px -14px rgba(8,12,9,.7);" +
      "transition:opacity .2s ease,transform .2s ease,border-color .2s ease;}" +
    ".oe-fab:hover,.oe-fab:focus-visible{opacity:1;border-color:var(--accent,#d4c4a0);outline:none;transform:translateY(-1px);}" +
    ".oe-fab svg{width:18px;height:18px;display:block;}" +
    ".oe-menu{position:fixed;right:calc(clamp(1rem,4vw,2.2rem) + env(safe-area-inset-right,0px));" +
      "bottom:calc(clamp(1rem,4vw,2.2rem) + env(safe-area-inset-bottom,0px) + 52px);z-index:81;" +
      "min-width:212px;background:var(--bg-raised,#1e2420);border:1px solid var(--rule,#4a544b);" +
      "border-radius:14px;padding:6px;font-family:var(--font-body,'Segoe UI',system-ui,sans-serif);" +
      "box-shadow:0 1px 2px rgba(8,12,9,.4),0 24px 56px -18px rgba(8,12,9,.72);" +
      "opacity:0;visibility:hidden;transform:translateY(6px) scale(.98);transform-origin:bottom right;" +
      "transition:opacity .16s ease,transform .2s cubic-bezier(.23,1,.32,1),visibility .16s;}" +
    ".oe-menu.open{opacity:1;visibility:visible;transform:none;}" +
    ".oe-menu a,.oe-menu button{display:flex;align-items:center;gap:.6em;width:100%;text-align:left;" +
      "font-family:inherit;font-size:.92rem;color:var(--text,#e8e2d6);background:transparent;border:none;" +
      "border-radius:9px;padding:.6rem .7rem;cursor:pointer;text-decoration:none;}" +
    ".oe-menu a:hover,.oe-menu button:hover,.oe-menu a:focus-visible,.oe-menu button:focus-visible{" +
      "background:var(--s-gold-tint,rgba(212,196,160,.08));color:var(--text-bright,#f5f1ea);outline:none;}" +
    ".oe-menu .oe-ic{flex:none;width:16px;text-align:center;color:var(--accent,#d4c4a0);font-size:.95em;}" +
    ".oe-menu .oe-sep{height:1px;background:var(--rule,#4a544b);margin:5px 4px;opacity:.6;}" +
    ".oe-menu .oe-forget{color:var(--text-dim,#b8b2a2);}" +
    ".oe-menu .oe-forget:hover{color:var(--warn,#d99090);}" +
    "@media print{.oe-fab,.oe-menu{display:none !important;}}" +
    "@media (prefers-reduced-motion: reduce){.oe-fab,.oe-menu{transition:opacity .12s ease;}}";
  var st = document.createElement("style");
  st.setAttribute("data-owner-edit", "");
  st.textContent = css;
  document.head.appendChild(st);

  // ---- the control + menu -----------------------------------------------------
  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "oe-fab";
  fab.setAttribute("aria-label", "Owner tools");
  fab.setAttribute("aria-haspopup", "menu");
  fab.setAttribute("aria-expanded", "false");
  // a quiet pencil mark
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l2 2"/></svg>';

  var menu = document.createElement("div");
  menu.className = "oe-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    '<a role="menuitem" href="/blog-edit.html?edit=' + encodeURIComponent(editPath) + '">' +
      '<span class="oe-ic">✎</span>' + editLabel + "</a>" +
    '<a role="menuitem" href="/post-builder.html">' +
      '<span class="oe-ic">+</span>New post</a>' +
    '<a role="menuitem" href="/post-builder.html#drafts">' +
      '<span class="oe-ic">▤</span>Drafts &amp; publishing</a>' +
    '<div class="oe-sep"></div>' +
    '<button type="button" class="oe-forget" role="menuitem">' +
      '<span class="oe-ic">×</span>Forget this device</button>';

  function place() {
    document.body.appendChild(menu);
    document.body.appendChild(fab);
  }
  if (document.body) place();
  else document.addEventListener("DOMContentLoaded", place);

  // ---- open / close -----------------------------------------------------------
  var open = false;
  function setOpen(v) {
    open = v;
    menu.classList.toggle("open", v);
    fab.setAttribute("aria-expanded", v ? "true" : "false");
    if (v) { var first = menu.querySelector("a,button"); if (first) first.focus(); }
  }
  fab.addEventListener("click", function (e) { e.stopPropagation(); setOpen(!open); });
  document.addEventListener("click", function (e) {
    if (open && !menu.contains(e.target) && e.target !== fab) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) { setOpen(false); fab.focus(); }
  });

  // ---- forget this device -----------------------------------------------------
  menu.querySelector(".oe-forget").addEventListener("click", function () {
    try { localStorage.removeItem("be_owner"); } catch (e) {}
    // also drop the in-memory token if a tool tab shares this window (it does not,
    // but harmless), then remove the affordance immediately.
    fab.remove(); menu.remove(); st.remove();
    window.__ownerEditMounted = false;
  });
})();
