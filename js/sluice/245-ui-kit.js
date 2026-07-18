  // ########################################################################
  // ##  UI KIT (uk) -- the reusable overlay system                        ##
  // ########################################################################
  // v26.18 -- One shared system for every full-screen popup the game needs:
  // the station store today, and any future surface where the player views,
  // buys, sells, stores, or combines things. Two layers:
  //
  //   1. THE FIZZ. While a modal is up, the live world keeps rendering
  //      underneath and the kit draws it back blurred, dimmed, and
  //      vignetted (a two-step downscale/upscale through offscreen
  //      canvases; no ctx.filter, so it works everywhere). The playfield
  //      reads as "the world, out of focus"; the console stays sharp.
  //
  //   2. THE CATALOG MODAL. A generic tabs + list + detail + one-action
  //      panel driven entirely by a spec object. Pages never draw their
  //      own chrome; they build item descriptors and the kit renders,
  //      hit-tests, animates, and fires the shared purchase fx.
  //
  // Opening a new popup elsewhere in the game is:
  //
  //   ukCatalogOpen({
  //     id:    'myThing',
  //     title: 'MY THING',
  //     tabs:  [{ id: 'a', label: 'TAB A', build: buildItemsFn }],
  //     onClose: function () { ... }        // fired after the close anim
  //   });
  //
  // where buildItemsFn() returns an array of items:
  //
  //   { key: 'drill',                 // stable id (selection + fx)
  //     name: 'CARBIDE DRILL',        // stencil caps, list + detail
  //     sub: 'LV 2 / 6',              // small mono line in the list row
  //     icon: function (cx, cy, px),  // draws the art at center/size
  //     state: 'INSTALLED . LV 2',    // small mono line under the detail name
  //     badge: 'x3',                  // corner tag on the detail art stage
  //     pips: { cur: 2, max: 6 },     // optional tier pips
  //     stat: { label: 'POWER', cur: 'LV 2', next: 'LV 3', delta: '+1' },
  //     desc: 'One plain sentence about what it does.',
  //     priceLabel: '$900',           // right side of the list row
  //     priceTier: 'gold',            // 'gold' | 'red' | 'dim'
  //     act: { label: 'BUY  $900', enabled: true,
  //            reason: 'SHORT $220', reasonKind: 'short' },
  //     onAct: function (item) { return { ok: true, float: '+DRILL' }; } }
  //
  // A tab may carry open:fn instead of build:fn to hand control to a
  // bespoke page (the flag-gated Trade Board uses this).
  //
  // LEVELS (v26.21). The catalog is a navigation STACK, the drill-down
  // grammar of every good console menu: tabs hold the root list, and any
  // level can open a deeper one. Two declarative doors down:
  //
  //   item.kind = 'folder'                    // the whole row is a door:
  //   item.children = { title, build }        // tap descends immediately,
  //                                           // chevron on the row's right
  //
  //   item.children + item.childLabel         // normal buyable item with a
  //                                           // secondary ghost button in
  //                                           // the detail pane (for tier
  //                                           // ladders, variants, "view
  //                                           // more" surfaces)
  //
  // While deep, the tab strip becomes a breadcrumb (BACK chip + trail,
  // e.g. "WORKSHOP ▸ DRILL TIERS"), content slides in from the side,
  // Escape / the B button / ArrowLeft pop ONE level, the X still closes
  // the whole modal, and buying inside a level refreshes every level.
  // Bespoke flows (combine pickers) can call ukPush({title, build}) /
  // ukPop() directly. Sub-level items may omit act entirely
  // (informational rows render without the action button).
  //
  // Input enters through ukPointerDown/Move/Up/Wheel and ukCatalogKeys
  // (arrows + enter + tab cycling); the shop routes its existing
  // newShopPointer* entry points here. All state is kit-local; the only
  // shared pieces are the ns* particle pools and the money chip from 240.

  // ---- kit state ---------------------------------------------------------
  var ukModal    = null;   // active spec, null = closed
  var ukState    = null;   // { tab, sel:{tabId:key}, items, scroll, scrollMax, lastMoney }
  var ukOpenT    = 0;      // entrance progress 0..1
  var ukCloseT   = -1;     // -1 idle; >= 0 counts the close anim down
  var ukHover    = null;   // hovered hit id
  var ukPress    = null;   // { id, x, y, moved, pointer } from pointer-down
  var ukDeniedT  = 0;      // action-button shake after a blocked click
  var ukArtPopT  = 0;      // detail-art pop after a successful action
  var ukListDrag = null;   // { pointer, startY, startScroll, moved }
  var UK_HIT     = [];     // per-frame hit rects { id, x, y, w, h }
  var ukFizzA    = null;   // downscale chain step 1 { c, x, w, h }
  var ukFizzB    = null;   // downscale chain step 2
  var ukVig      = null;   // cached vignette { w, h, grad }
  var ukLayoutC  = null;   // layout cache for the current frame
  var ukSlide    = { t: 0, dir: 0 };   // level-change slide (1 = from right)

  function ukHitAt(x, y) {
    for (var i = UK_HIT.length - 1; i >= 0; i--) {
      var r = UK_HIT[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---- the fizz: blurred + dimmed live world ----------------------------
  function ukFizzLayer(prev, w, h) {
    if (prev && prev.w === w && prev.h === h) return prev;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    return { c: c, x: x, w: w, h: h };
  }
  function ukFizzDraw(strength) {
    if (strength <= 0.01) return;
    var playH = viewH - consoleHeight();
    if (playH < 8) return;
    // Downscale the freshly-rendered world twice (1/4 then 1/8), then
    // stretch it back with bilinear sampling. Reads as a soft frost.
    var srcW = canvas.width;
    var srcH = Math.max(1, Math.min(canvas.height, Math.round(playH * dpr)));
    var aw = Math.max(1, Math.round(viewW / 4)), ah = Math.max(1, Math.round(playH / 4));
    var bw = Math.max(1, Math.round(viewW / 8)), bh = Math.max(1, Math.round(playH / 8));
    ukFizzA = ukFizzLayer(ukFizzA, aw, ah);
    ukFizzB = ukFizzLayer(ukFizzB, bw, bh);
    ukFizzA.x.drawImage(canvas, 0, 0, srcW, srcH, 0, 0, aw, ah);
    ukFizzB.x.drawImage(ukFizzA.c, 0, 0, aw, ah, 0, 0, bw, bh);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = strength;
    ctx.drawImage(ukFizzB.c, 0, 0, bw, bh, 0, 0, viewW, playH);
    // Cool night dim; the warm world glows through it.
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(9,11,16,' + (0.50 * strength).toFixed(3) + ')';
    ctx.fillRect(0, 0, viewW, playH);
    // Vignette (cached radial gradient) pulls the eye to the center.
    if (!ukVig || ukVig.w !== viewW || ukVig.h !== playH) {
      var g = ctx.createRadialGradient(viewW / 2, playH * 0.46, Math.min(viewW, playH) * 0.32,
                                       viewW / 2, playH * 0.5, Math.max(viewW, playH) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.42)');
      ukVig = { w: viewW, h: playH, grad: g };
    }
    ctx.globalAlpha = strength;
    ctx.fillStyle = ukVig.grad;
    ctx.fillRect(0, 0, viewW, playH);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  // ---- drawing primitives ------------------------------------------------
  // The modal surface: solid gunmetal plate, dark outline, one warm top
  // light line, small brass corner ticks. Quiet; the content is the show.
  function ukPanelBox(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x - 5, y - 1, w + 10, h + 9);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 1, y + 4, w, h + 1);
    ctx.fillStyle = UIT_EDGE;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = UIT_PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,216,150,0.09)';
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y + h - 2, w, 2);
    // brass ticks in each corner
    ctx.fillStyle = '#8a6a30';
    ctx.fillRect(x + 3, y + 3, 8, 2); ctx.fillRect(x + 3, y + 3, 2, 8);
    ctx.fillRect(x + w - 11, y + 3, 8, 2); ctx.fillRect(x + w - 5, y + 3, 2, 8);
    ctx.fillRect(x + 3, y + h - 5, 8, 2); ctx.fillRect(x + 3, y + h - 11, 2, 8);
    ctx.fillRect(x + w - 11, y + h - 5, 8, 2); ctx.fillRect(x + w - 5, y + h - 11, 2, 8);
  }
  // A recessed dark niche (art stages, list wells).
  function ukInset(x, y, w, h) {
    ctx.fillStyle = UIT_INSET_DK;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = UIT_INSET;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
  }
  // Commit Mono text. Stencil caps carry titles and prices; mono carries
  // sentences and small state lines, which stay readable at small sizes.
  function ukMono(str, x, y, px, color, align, bold) {
    ctx.save();
    ctx.font = (bold ? 'bold ' : '') + px + 'px ' + UI_FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
    ctx.restore();
  }
  function ukMonoW(str, px, bold) {
    ctx.save();
    ctx.font = (bold ? 'bold ' : '') + px + 'px ' + UI_FONT;
    var w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }
  // Word-wrapped centered mono block. Returns the number of lines drawn.
  function ukMonoWrap(str, cx, y, maxW, px, lineH, color, maxLines) {
    if (!str) return 0;
    ctx.save();
    ctx.font = px + 'px ' + UI_FONT;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var words = str.split(' ');
    var line = '';
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var probe = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(probe).width > maxW && line) {
        lines.push(line);
        line = words[i];
        if (lines.length >= maxLines) break;
      } else {
        line = probe;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], Math.round(cx), Math.round(y + j * lineH));
    }
    ctx.restore();
    return lines.length;
  }
  // Tier pips: filled = owned levels.
  function ukPips(x, y, w, h, cur, max) {
    if (max < 1) max = 1;
    var gap = 3;
    var pw = (w - gap * (max - 1)) / max;
    for (var i = 0; i < max; i++) {
      var px = x + i * (pw + gap);
      var on = i < cur;
      ctx.fillStyle = UIT_EDGE;
      ctx.fillRect(px - 1, y - 1, pw + 2, h + 2);
      ctx.fillStyle = on ? UIT_GOLD : UIT_INSET;
      ctx.fillRect(px, y, pw, h);
      if (on) {
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(px, y, pw, 1);
      }
    }
  }
  // The one button. kind: 'gold' (primary) | 'lock' (disabled with reason).
  function ukButton(r, label, kind, hover, pressT, px) {
    var squish = pressT > 0 ? 2 : 0;
    ctx.fillStyle = UIT_EDGE;
    ctx.fillRect(r.x - 1, r.y - 1 + squish, r.w + 2, r.h + 2 - squish);
    if (kind === 'gold') {
      ctx.fillStyle = hover ? UIT_GOLD_HI : UIT_GOLD;
      ctx.fillRect(r.x, r.y + squish, r.w, r.h - squish);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(r.x, r.y + squish, r.w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
      nsText(label, r.x + r.w / 2, r.y + squish + (r.h - squish - px) / 2, px, UIT_GOLD_TEXT, 'center');
    } else if (kind === 'ghost') {
      // Secondary affordance: hollow, brass-edged, quiet next to the gold.
      ctx.fillStyle = hover ? 'rgba(255,216,150,0.08)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = hover ? UIT_GOLD : '#8a6a30';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      nsText(label, r.x + r.w / 2, r.y + (r.h - px) / 2, px,
             hover ? UIT_GOLD_HI : UIT_TEXT, 'center');
    } else {
      ctx.fillStyle = UIT_INSET;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(r.x, r.y, r.w, 2);
      var lockCol = (kind === 'short') ? UIT_RED : UIT_DIM;
      nsText(label, r.x + r.w / 2, r.y + (r.h - px) / 2, px, lockCol, 'center');
    }
  }

  // ---- catalog modal: open / close / rebuild ----------------------------
  function ukCatalogOpen(spec) {
    ukModal = spec;
    ukState = { tab: spec.tab || spec.tabs[0].id, sel: {}, items: [],
                scroll: 0, scrollMax: 0, lastMoney: null, stack: [] };
    ukOpenT = 0; ukCloseT = -1;
    ukHover = null; ukPress = null; ukListDrag = null;
    ukDeniedT = 0; ukArtPopT = 0;
    ukSlide = { t: 0, dir: 0 };
    ukRebuildItems();
  }
  function ukCatalogClose() {
    if (!ukModal || ukCloseT >= 0) return;
    ukCloseT = 0.15;
  }
  // Hard reset with no animation (external code closed the surface).
  function ukCatalogReset() {
    ukModal = null; ukState = null;
    ukOpenT = 0; ukCloseT = -1;
    ukListDrag = null; ukPress = null;
  }
  function ukTabDef(id) {
    if (!ukModal) return null;
    for (var i = 0; i < ukModal.tabs.length; i++) {
      if (ukModal.tabs[i].id === id) return ukModal.tabs[i];
    }
    return null;
  }
  // ---- the level stack ---------------------------------------------------
  // Root level = the active tab's items; ukPush opens deeper levels (a
  // folder's contents, a tier ladder, a picker). Selection lives per
  // level; the shared scroll is saved on push and restored on pop.
  function ukTopLevel() {
    if (!ukState || !ukState.stack.length) return null;
    return ukState.stack[ukState.stack.length - 1];
  }
  function ukStackDepth() { return ukState ? ukState.stack.length : 0; }
  function ukCurItems() {
    var top = ukTopLevel();
    return top ? top.items : (ukState ? ukState.items : []);
  }
  function ukCurSel() {
    var top = ukTopLevel();
    return top ? top.sel : ukState.sel[ukState.tab];
  }
  function ukCurSetSel(key) {
    var top = ukTopLevel();
    if (top) top.sel = key; else ukState.sel[ukState.tab] = key;
  }
  function ukFirstSelectable(items) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind !== 'folder') return items[i].key;
    }
    return null;
  }
  function ukPush(spec) {
    if (!ukState || !spec) return;
    var lv = { title: spec.title || '', build: spec.build || null,
               items: [], sel: null, savedScroll: ukState.scroll };
    lv.items = lv.build ? lv.build() : (spec.items || []);
    lv.sel = ukFirstSelectable(lv.items);
    ukState.stack.push(lv);
    ukState.scroll = 0;
    ukSlide = { t: 1, dir: 1 };
  }
  function ukPop() {
    if (!ukState || !ukState.stack.length) return false;
    var lv = ukState.stack.pop();
    ukState.scroll = lv.savedScroll || 0;
    ukSlide = { t: 1, dir: -1 };
    ukRebuildItems();   // a purchase inside the level may have aged the parent
    return true;
  }

  function ukSelectedItem() {
    if (!ukState) return null;
    var items = ukCurItems();
    var key = ukCurSel();
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) return items[i];
    }
    return null;
  }
  function ukRebuildItems() {
    var tab = ukTabDef(ukState.tab);
    ukState.items = (tab && tab.build) ? tab.build() : [];
    var key = ukState.sel[ukState.tab];
    var have = false;
    for (var i = 0; i < ukState.items.length; i++) {
      if (ukState.items[i].key === key) { have = true; break; }
    }
    if (!have && ukState.items.length) ukState.sel[ukState.tab] = ukFirstSelectable(ukState.items);
    // Refresh every open level from its builder so prices, states, and
    // ownership stay live after a purchase anywhere in the stack.
    for (var s = 0; s < ukState.stack.length; s++) {
      var lv = ukState.stack[s];
      if (lv.build) lv.items = lv.build();
      var ok = false;
      for (var j = 0; j < lv.items.length; j++) {
        if (lv.items[j].key === lv.sel) { ok = true; break; }
      }
      if (!ok && lv.items.length) lv.sel = ukFirstSelectable(lv.items);
    }
  }
  function ukSwitchTab(id) {
    if (!ukState || ukState.tab === id) return;
    var def = ukTabDef(id);
    if (!def) return;
    if (def.open) { def.open(); return; }   // bespoke page takes over
    ukState.tab = id;
    ukState.scroll = 0;
    ukState.stack.length = 0;
    ukRebuildItems();
  }

  // ---- layout ------------------------------------------------------------
  function ukLayout(M) {
    var us = M.us;
    var mx = Math.round((M.portrait ? 7 : 24) * us);
    var my = Math.round((M.portrait ? 7 : 16) * us);
    // The modal is a card floating IN the fizzed world, not a takeover:
    // on landscape/desktop it stays under ~72% of the width and ~84% of
    // the playfield height so the blurred world clearly frames it.
    // Portrait keeps near-full width (phones need every column) and its
    // height cap already leaves a generous fizz band up top.
    var w, h;
    if (M.portrait) {
      w = Math.min(viewW - mx * 2, Math.round(660 * us));
      h = Math.min(M.bottom - my * 2, Math.round(620 * us));
    } else {
      w = Math.min(viewW - mx * 2, Math.round(560 * us), Math.round(viewW * 0.72));
      h = Math.min(M.bottom - my * 2, Math.round(480 * us), Math.round(M.bottom * 0.84));
    }
    var x = Math.round((viewW - w) / 2);
    // Portrait: anchor to the bottom so the top band stays clear for the
    // radio bubble (which deliberately draws over the shop) and the
    // action button sits in thumb reach. Landscape/desktop: centered.
    var y = M.portrait ? (M.bottom - my - h) : Math.round((M.bottom - h) / 2);
    var pad = Math.round(12 * us);
    var headH = Math.round(44 * us);
    // The strip under the header holds the tab row at the root and the
    // breadcrumb (BACK + trail) inside a pushed level.
    var tabH = (ukModal.tabs.length > 1 || ukStackDepth() > 0)
      ? Math.max(34, Math.round(36 * us)) : 0;
    var bodyX = x + pad;
    var bodyY = y + headH + tabH + Math.round(8 * us);
    var bodyW = w - pad * 2;
    var bodyH = y + h - pad - bodyY;
    var L = { us: us, x: x, y: y, w: w, h: h, pad: pad, headH: headH, tabH: tabH,
              bodyX: bodyX, bodyY: bodyY, bodyW: bodyW, bodyH: bodyH };
    if (M.portrait) {
      L.detailH = Math.min(Math.round(bodyH * 0.55), Math.round(300 * us));
      L.listX = bodyX; L.listY = bodyY;
      L.listW = bodyW; L.listH = bodyH - L.detailH - Math.round(8 * us);
      L.detX = bodyX; L.detY = L.listY + L.listH + Math.round(8 * us);
      L.detW = bodyW;
    } else {
      var gap = Math.round(12 * us);
      L.listX = bodyX; L.listY = bodyY;
      L.listW = Math.round(bodyW * 0.46) - Math.round(gap / 2);
      L.listH = bodyH;
      L.detX = bodyX + L.listW + gap; L.detY = bodyY;
      L.detW = bodyW - L.listW - gap;
      L.detailH = bodyH;
    }
    return L;
  }

  // ---- draw --------------------------------------------------------------
  function ukCatalogDraw(M) {
    if (!ukModal) return;
    var dt = 1 / 60;
    if (ukCloseT >= 0) {
      ukCloseT -= dt;
      if (ukCloseT <= 0) {
        var done = ukModal.onClose;
        ukCatalogReset();
        if (done) done();
        return;
      }
    } else if (ukOpenT < 1) {
      ukOpenT = Math.min(1, ukOpenT + dt / 0.20);
    }
    if (ukDeniedT > 0) ukDeniedT -= dt;
    if (ukArtPopT > 0) ukArtPopT -= dt;
    if (ukSlide.t > 0) ukSlide.t = Math.max(0, ukSlide.t - dt / 0.16);
    if (money !== ukState.lastMoney) {
      ukState.lastMoney = money;
      ukRebuildItems();
    }

    var prog = (ukCloseT >= 0) ? Math.max(0, ukCloseT / 0.15) : nsEaseOut(ukOpenT);
    UK_HIT.length = 0;
    ukFizzDraw(prog);
    UK_HIT.push({ id: 'uk:backdrop', x: 0, y: 0, w: viewW, h: M.bottom });

    var L = ukLayout(M);
    ukLayoutC = L;
    // Inert zone over the panel body: a stray tap between widgets must do
    // nothing, not fall through to the tap-out-to-close backdrop.
    UK_HIT.push({ id: 'uk:panel', x: L.x - 2, y: L.y - 2, w: L.w + 4, h: L.h + 4 });
    ctx.save();
    ctx.globalAlpha = prog;
    ctx.translate(0, (1 - prog) * Math.round(12 * L.us));

    ukPanelBox(L.x, L.y, L.w, L.h);
    ukDrawHeader(L);
    if (L.tabH > 0) {
      if (ukStackDepth() > 0) ukDrawCrumb(L);
      else ukDrawTabs(L);
    }
    // Level content slides in sideways on push/pop (the drill-down
    // spatial cue), clipped to the panel so nothing pokes out of it.
    var slid = ukSlide.t > 0;
    if (slid) {
      var se = nsEaseOut(1 - ukSlide.t);
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.x, L.bodyY - 2, L.w, L.bodyH + Math.round(4 * L.us));
      ctx.clip();
      ctx.globalAlpha = prog * (0.3 + 0.7 * se);
      ctx.translate(Math.round((1 - se) * 30 * L.us) * ukSlide.dir, 0);
    }
    ukDrawList(L);
    ukDrawDetail(L);
    if (slid) ctx.restore();

    ctx.restore();
    if (ukCloseT < 0) ukCatalogKeys();
  }

  // Breadcrumb strip: a BACK chip on the left, the trail beside it
  // ("WORKSHOP ▸ DRILL TIERS"). Replaces the tab row while deep.
  function ukDrawCrumb(L) {
    var us = L.us;
    var tx = L.x + L.pad;
    var ty = L.y + L.headH + Math.round(6 * us);
    var th = L.tabH - Math.round(6 * us);
    var bw = Math.max(56, Math.round(64 * us));
    var hov = (ukHover === 'uk:back');
    ctx.fillStyle = UIT_EDGE;
    ctx.fillRect(tx - 1, ty - 1, bw + 2, th + 2);
    ctx.fillStyle = hov ? '#3d4655' : UIT_PANEL_SEL;
    ctx.fillRect(tx, ty, bw, th);
    ctx.fillStyle = 'rgba(255,216,150,0.08)';
    ctx.fillRect(tx, ty, bw, 1);
    // left-pointing chevron, drawn like the close X (no '<' stencil glyph)
    var cxx = tx + Math.round(10 * us), cyy = Math.round(ty + th / 2);
    var arm = Math.max(4, Math.round(4.5 * us));
    ctx.fillStyle = hov ? UIT_GOLD_HI : UIT_BODY;
    for (var a = 0; a < arm; a++) {
      ctx.fillRect(cxx + a, cyy - a - 1, 2, 2);
      ctx.fillRect(cxx + a, cyy + a - 1, 2, 2);
    }
    var bpx = Math.round(8.5 * us);
    nsText('BACK', cxx + arm + Math.round(6 * us), ty + Math.round((th - bpx) / 2), bpx,
           hov ? UIT_TEXT : UIT_BODY);
    UK_HIT.push({ id: 'uk:back', x: tx - 4, y: ty - 4, w: bw + 8, h: th + 8 });
    // trail
    var tabDef = ukTabDef(ukState.tab);
    var trail = tabDef ? tabDef.label : '';
    for (var i = 0; i < ukState.stack.length; i++) {
      trail += (trail ? ' ▸ ' : '') + (ukState.stack[i].title || '');
    }
    var tpx = Math.round(8.5 * us);
    var maxW = L.w - L.pad * 2 - bw - Math.round(14 * us);
    var tw = nsTextW(trail, tpx);
    if (tw > maxW && tw > 0) tpx = Math.max(6, tpx * maxW / tw);
    nsText(trail, tx + bw + Math.round(10 * us), ty + Math.round((th - tpx) / 2), tpx, UIT_DIM);
  }

  function ukDrawHeader(L) {
    var us = L.us;
    var cy = L.y + Math.round(L.headH / 2);
    // title
    var tpx = Math.round(15 * us);
    nsText(ukModal.title, L.x + L.pad + 2, cy - Math.round(tpx / 2), tpx, UIT_TEXT);
    // close button (top-right square)
    var cw = Math.max(34, Math.round(30 * us));
    var cr = { x: L.x + L.w - cw - Math.round(7 * us), y: L.y + Math.round((L.headH - cw) / 2), w: cw, h: cw };
    var chov = (ukHover === 'uk:close');
    ctx.fillStyle = UIT_EDGE;
    ctx.fillRect(cr.x - 1, cr.y - 1, cr.w + 2, cr.h + 2);
    ctx.fillStyle = chov ? '#3d4655' : UIT_PANEL_SEL;
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    ctx.fillStyle = 'rgba(255,216,150,0.10)';
    ctx.fillRect(cr.x, cr.y, cr.w, 1);
    var xc = cr.x + cr.w / 2, yc = cr.y + cr.h / 2, arm = Math.round(cr.w * 0.20);
    ctx.fillStyle = chov ? UIT_GOLD_HI : UIT_BODY;
    for (var o = -arm; o <= arm; o++) {
      ctx.fillRect(xc + o - 1, yc + o - 1, 2, 2);
      ctx.fillRect(xc + o - 1, yc - o - 1, 2, 2);
    }
    UK_HIT.push({ id: 'uk:close', x: cr.x - 4, y: cr.y - 4, w: cr.w + 8, h: cr.h + 8 });
    // money chip, right-aligned against the close button
    var chipH = Math.round(28 * us);
    nsDrawMoneyChip(cr.x - Math.round(10 * us), L.y + Math.round((L.headH - chipH) / 2), us, 'right');
    // hairline under the header
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(L.x + 1, L.y + L.headH, L.w - 2, 2);
    ctx.fillStyle = 'rgba(255,216,150,0.05)';
    ctx.fillRect(L.x + 1, L.y + L.headH + 2, L.w - 2, 1);
  }

  function ukDrawTabs(L) {
    var us = L.us;
    var n = ukModal.tabs.length;
    var tx = L.x + L.pad;
    var tw = L.w - L.pad * 2;
    var ty = L.y + L.headH + Math.round(6 * us);
    var th = L.tabH - Math.round(6 * us);
    var each = Math.floor(tw / n);
    for (var i = 0; i < n; i++) {
      var def = ukModal.tabs[i];
      var rx = tx + i * each;
      var rw = (i === n - 1) ? (tw - each * (n - 1)) : each;
      var active = (def.id === ukState.tab);
      var hov = (ukHover === 'uk:tab:' + def.id);
      if (active) {
        ctx.fillStyle = UIT_PANEL_SEL;
        ctx.fillRect(rx, ty, rw, th);
        ctx.fillStyle = 'rgba(255,216,150,0.08)';
        ctx.fillRect(rx, ty, rw, 1);
        ctx.fillStyle = UIT_GOLD;
        ctx.fillRect(rx, ty + th - 3, rw, 3);
      } else if (hov) {
        ctx.fillStyle = 'rgba(255,216,150,0.05)';
        ctx.fillRect(rx, ty, rw, th);
      }
      var px = Math.round(9.5 * us);
      nsText(def.label, rx + rw / 2, ty + (th - px) / 2, px,
             active ? UIT_TEXT : (hov ? UIT_BODY : UIT_DIM), 'center');
      UK_HIT.push({ id: 'uk:tab:' + def.id, x: rx, y: ty - 4, w: rw, h: th + 8 });
    }
  }

  function ukDrawList(L) {
    var us = L.us;
    var items = ukCurItems();
    var n = items.length;
    ukInset(L.listX, L.listY, L.listW, L.listH);
    if (n === 0) {
      ukMono('Nothing here yet.', L.listX + L.listW / 2, L.listY + L.listH / 2,
             Math.max(10, Math.round(11 * us)), UIT_DIM, 'center');
      return;
    }
    var ideal = Math.round(54 * us);
    var rowH = Math.max(Math.max(40, Math.round(40 * us)), Math.min(ideal, Math.floor(L.listH / n)));
    if (rowH < 44 && L.listH / n < 44) rowH = 44;   // touch floor; overflow scrolls
    var totalH = rowH * n;
    ukState.scrollMax = Math.max(0, totalH - L.listH);
    if (ukState.scroll > ukState.scrollMax) ukState.scroll = ukState.scrollMax;
    if (ukState.scroll < 0) ukState.scroll = 0;

    // The list body is one big drag-to-scroll zone; rows are pushed after
    // it, and ukHitAt scans backwards, so a row always wins over the zone.
    UK_HIT.push({ id: 'uk:list', x: L.listX, y: L.listY, w: L.listW, h: L.listH });
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.listX + 1, L.listY + 1, L.listW - 2, L.listH - 2);
    ctx.clip();
    var selKey = ukCurSel();
    for (var i = 0; i < n; i++) {
      var it = items[i];
      var ry = L.listY + i * rowH - Math.round(ukState.scroll);
      if (ry + rowH < L.listY || ry > L.listY + L.listH) continue;
      var isFolder = (it.kind === 'folder');
      var selected = !isFolder && (it.key === selKey);
      var hov = (ukHover === 'uk:item:' + it.key);
      if (selected) {
        ctx.fillStyle = UIT_PANEL_SEL;
        ctx.fillRect(L.listX + 1, ry, L.listW - 2, rowH);
        ctx.fillStyle = UIT_GOLD;
        ctx.fillRect(L.listX + 1, ry, 3, rowH);
      } else if (hov) {
        ctx.fillStyle = 'rgba(255,216,150,0.05)';
        ctx.fillRect(L.listX + 1, ry, L.listW - 2, rowH);
      }
      // icon well
      var iw = rowH - Math.round(12 * us);
      if (iw > Math.round(44 * us)) iw = Math.round(44 * us);
      var ix = L.listX + Math.round(8 * us);
      var iy = ry + Math.round((rowH - iw) / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ix, iy, iw, iw);
      if (it.icon) it.icon(ix + iw / 2, iy + iw / 2, iw * 0.82);
      // name + sub
      var namePx = Math.round(8.5 * us);
      var subPx = Math.max(9, Math.round(9.5 * us));
      var tx0 = ix + iw + Math.round(9 * us);
      var pricePx = Math.round(8.5 * us);
      var priceW = it.priceLabel ? nsTextW(it.priceLabel, pricePx) : 0;
      var nameMaxW = (L.listX + L.listW - Math.round(10 * us) - priceW - Math.round(8 * us)) - tx0;
      var npx = namePx;
      var nw = nsTextW(it.name, npx);
      if (nw > nameMaxW && nw > 0) npx = Math.max(6, npx * nameMaxW / nw);
      if (it.sub) {
        nsText(it.name, tx0, ry + Math.round(rowH * 0.24) - Math.round(npx / 2) + 2, npx, selected ? UIT_TEXT : UIT_BODY);
        ukMono(it.sub, tx0, ry + Math.round(rowH * 0.74) + 3, subPx, UIT_DIM);
      } else {
        nsText(it.name, tx0, ry + Math.round((rowH - npx) / 2), npx, selected ? UIT_TEXT : UIT_BODY);
      }
      // right side: folders get the descend chevron, items their price
      if (isFolder) {
        nsText('▸', L.listX + L.listW - Math.round(10 * us), ry + Math.round((rowH - pricePx) / 2), pricePx,
               hov ? UIT_GOLD_HI : UIT_DIM, 'right');
      } else if (it.priceLabel) {
        var pc = UIT_DIM;
        if (it.priceTier === 'gold') pc = UIT_MONEY;
        else if (it.priceTier === 'red') pc = UIT_RED;
        nsText(it.priceLabel, L.listX + L.listW - Math.round(10 * us), ry + Math.round((rowH - pricePx) / 2), pricePx, pc, 'right');
      }
      // hairline between rows
      if (i < n - 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(L.listX + 1, ry + rowH - 1, L.listW - 2, 1);
      }
      UK_HIT.push({ id: 'uk:item:' + it.key, x: L.listX, y: Math.max(L.listY, ry), w: L.listW,
                    h: Math.min(rowH, L.listY + L.listH - ry) });
    }
    ctx.restore();
    // scrollbar
    if (ukState.scrollMax > 0) {
      var trackX = L.listX + L.listW - 4;
      var thumbH = Math.max(18, L.listH * (L.listH / totalH));
      var thumbY = L.listY + (L.listH - thumbH) * (ukState.scroll / ukState.scrollMax);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(trackX, L.listY + 2, 3, L.listH - 4);
      ctx.fillStyle = '#5c6675';
      ctx.fillRect(trackX, thumbY, 3, thumbH);
    }
  }

  function ukDrawDetail(L) {
    var us = L.us;
    var it = ukSelectedItem();
    if (!it) return;
    var x = L.detX, w = L.detW;
    var pad = Math.round(10 * us);
    var bottom = L.detY + L.detailH;

    // Stack from the bottom: action button, drill-in ghost button, desc,
    // stat, pips, state, name. The art stage takes whatever is left on
    // top. Informational rows (no act) give their button space back.
    var btnH = it.act ? Math.max(44, Math.round(44 * us)) : 0;
    var btnY = bottom - btnH;
    var childBtnH = it.children ? Math.max(34, Math.round(34 * us)) : 0;
    var childGap = it.children ? Math.round(6 * us) : 0;
    var childY = btnY - childGap - childBtnH;
    var cursorY = childY - Math.round(8 * us);

    var descPx = Math.max(10, Math.round(10.5 * us));
    var descLineH = Math.round(descPx * 1.45);
    var descLines = it.desc ? 2 : 0;
    if (it.desc && L.detailH > Math.round(300 * us)) descLines = 3;
    var descH = descLines > 0 ? descLines * descLineH + Math.round(4 * us) : 0;
    var descY = cursorY - descH;

    var statH = it.stat ? Math.round(30 * us) : 0;
    var statY = descY - statH;

    var pipsH = it.pips ? Math.round(8 * us) : 0;
    var pipsPad = it.pips ? Math.round(8 * us) : 0;
    var pipsY = statY - pipsH - pipsPad;

    var subPx = Math.max(9, Math.round(10 * us));
    var subH = it.state ? Math.round(16 * us) : Math.round(4 * us);
    var subY = pipsY - subH;

    var namePx = Math.round(12 * us);
    var nameH = Math.round(18 * us);
    var nameY = subY - nameH;

    var artY = L.detY;
    var artH = nameY - Math.round(8 * us) - artY;
    var artMin = Math.round(54 * us);
    if (artH < artMin) {
      // squeeze: drop the description first, then shrink the art floor
      if (descH > 0) {
        var reclaim = descH;
        descH = 0; descLines = 0;
        artH += reclaim;
        nameY += reclaim; subY += reclaim; pipsY += reclaim; statY += reclaim; descY = statY;
      }
      if (artH < Math.round(40 * us)) artH = Math.round(40 * us);
    }

    // art stage
    ukInset(x, artY, w, artH);
    var acx = x + w / 2, acy = artY + artH / 2;
    // warm banded halo behind the art (stepped alpha, pixel-friendly)
    var haloR = Math.min(w, artH) * 0.44;
    for (var hb = 4; hb >= 1; hb--) {
      var hf = hb / 4;
      ctx.fillStyle = 'rgba(255,204,110,' + (0.10 * (1 - hf) * (1 - hf) + 0.012).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(acx, acy, haloR * 0.3 + haloR * 0.7 * hf, 0, Math.PI * 2); ctx.fill();
    }
    // Absolute cap: the item painters were drawn for chip-to-card sizes;
    // stretching them past ~190 px starts to read as flat slabs.
    var artSize = Math.min(w - Math.round(40 * us), artH - Math.round(20 * us), 190);
    var idle = Math.sin(nsRoomT * 1.6) * 2 * us;
    var pop = ukArtPopT > 0 ? 1 + 0.07 * Math.sin((ukArtPopT / 0.22) * Math.PI) : 1;
    if (it.icon) {
      ctx.save();
      ctx.translate(acx, acy + idle);
      ctx.scale(pop, pop);
      it.icon(0, 0, artSize);
      ctx.restore();
    }
    // stock corner badge on the art stage
    if (it.badge) {
      var bdPx = Math.max(9, Math.round(9.5 * us));
      var bdW = ukMonoW(it.badge, bdPx, true) + Math.round(12 * us);
      var bdH = bdPx + Math.round(8 * us);
      ctx.fillStyle = 'rgba(8,10,14,0.85)';
      ctx.fillRect(x + w - bdW - 4, artY + 4, bdW, bdH);
      ctx.fillStyle = UIT_GOLD;
      ctx.fillRect(x + w - bdW - 4, artY + 4, 2, bdH);
      ukMono(it.badge, x + w - 4 - bdW / 2 + 1, artY + 4 + bdH - Math.round(5 * us), bdPx, UIT_TEXT, 'center', true);
    }

    // name
    var dnw = nsTextW(it.name, namePx);
    var maxNameW = w - Math.round(12 * us);
    var dnpx = (dnw > maxNameW && dnw > 0) ? Math.max(7, namePx * maxNameW / dnw) : namePx;
    nsText(it.name, x + w / 2, nameY + Math.round((nameH - dnpx) / 2), dnpx, UIT_TEXT, 'center');
    // state line
    if (it.state) {
      ukMono(it.state, x + w / 2, subY + subH - Math.round(4 * us), subPx, UIT_DIM, 'center');
    }
    // pips
    if (it.pips) {
      var pw = Math.min(w - pad * 2, Math.round(190 * us));
      ukPips(x + (w - pw) / 2, pipsY, pw, pipsH, it.pips.cur, it.pips.max);
    }
    // stat delta
    if (it.stat) {
      var sLabPx = Math.max(9, Math.round(9.5 * us));
      var valPx = Math.round(11 * us);
      var sY = statY + Math.round(6 * us);
      ukMono(it.stat.label, x + w / 2, sY + sLabPx - 2, sLabPx, UIT_DIM, 'center');
      // '▸' is the one arrow glyph in STENCIL_FONT ('>' has no bitmap).
      var valStr = it.stat.next ? (it.stat.cur + ' ▸ ' + it.stat.next) : it.stat.cur;
      var deltaStr = it.stat.delta ? ('  ' + it.stat.delta) : '';
      var vw = nsTextW(valStr, valPx);
      var dw = deltaStr ? nsTextW(deltaStr, Math.round(valPx * 0.8)) : 0;
      var startX = x + w / 2 - (vw + dw) / 2;
      nsText(valStr, startX, sY + sLabPx + Math.round(4 * us), valPx, UIT_TEXT);
      if (deltaStr) {
        nsText(deltaStr, startX + vw, sY + sLabPx + Math.round(4 * us) + Math.round(valPx * 0.14), Math.round(valPx * 0.8), UIT_MONEY);
      }
    }
    // description
    if (descLines > 0 && it.desc) {
      ukMonoWrap(it.desc, x + w / 2, descY + descPx + Math.round(2 * us),
                 w - pad * 2, descPx, descLineH, UIT_BODY, descLines);
    }
    // secondary drill-in (ghost) sits above the action button
    if (it.children) {
      var gr = { x: x + pad, y: childY, w: w - pad * 2, h: childBtnH };
      ukButton(gr, (it.childLabel || 'MORE') + '  ▸', 'ghost',
               ukHover === 'uk:child', 0, Math.round(9 * us));
      UK_HIT.push({ id: 'uk:child', x: gr.x, y: gr.y, w: gr.w, h: gr.h });
    }
    // action button
    if (it.act) {
      var shake = ukDeniedT > 0 ? Math.round(Math.sin(ukDeniedT * 44) * 3) : 0;
      var br = { x: x + pad + shake, y: btnY, w: w - pad * 2, h: btnH };
      var bpx = Math.round(11 * us);
      var pressT = (ukPress && ukPress.id === 'uk:act') ? 1 : 0;
      if (it.act.enabled) {
        ukButton(br, it.act.label, 'gold', ukHover === 'uk:act', pressT, bpx);
      } else {
        var reason = it.act.reason || it.act.label;
        var kind = (it.act.reasonKind === 'short') ? 'short' : 'lock';
        ukButton(br, reason, kind, false, 0, Math.round(9.5 * us));
      }
      UK_HIT.push({ id: 'uk:act', x: br.x, y: br.y, w: br.w, h: br.h });
    }
  }

  // ---- shared action plumbing -------------------------------------------
  function ukFireAction() {
    var it = ukSelectedItem();
    if (!it || !it.act) return;
    var L = ukLayoutC;
    var bx = L ? L.detX + L.detW / 2 : viewW / 2;
    var by = L ? L.detY + L.detailH - Math.round(22 * L.us) : viewH / 2;
    if (!it.act.enabled) {
      ukDeniedT = 0.24;
      nsSpawnCoins(bx, by, 3, true);
      sfxPlay('ui-denied');
      return;
    }
    var res = it.onAct ? it.onAct(it) : null;
    if (res && res.ok) {
      ukArtPopT = 0.22;
      nsSpawnCoins(bx, by, 10);
      if (res.float && L) {
        nsSpawnFloater(res.float, L.detX + L.detW / 2, L.detY + Math.round(26 * L.us), '#ffe79a', 12);
      }
      ukRebuildItems();
    } else {
      ukDeniedT = 0.24;
    }
  }

  // ---- input -------------------------------------------------------------
  function ukPointerDown(x, y, id) {
    if (!ukModal || ukCloseT >= 0) return true;
    var hit = ukHitAt(x, y);
    var hid = hit ? hit.id : null;
    ukPress = { id: hid, x: x, y: y, moved: 0, pointer: id };
    if (!hid) return true;
    if (hid === 'uk:close') { ukCatalogClose(); return true; }
    if (hid === 'uk:back') { ukPop(); return true; }
    if (hid.indexOf('uk:tab:') === 0) { ukSwitchTab(hid.slice(7)); return true; }
    if (hid === 'uk:act') { ukFireAction(); return true; }
    if (hid === 'uk:child') {
      var sel = ukSelectedItem();
      if (sel && sel.children) ukPush(sel.children);
      return true;
    }
    if (hid.indexOf('uk:item:') === 0) {
      var key = hid.slice(8);
      var items = ukCurItems();
      for (var fi = 0; fi < items.length; fi++) {
        if (items[fi].key === key && items[fi].kind === 'folder') {
          // Folder rows are doors: tapping descends immediately.
          if (items[fi].children) ukPush(items[fi].children);
          return true;
        }
      }
      ukCurSetSel(key);
      ukListDrag = { pointer: id, startY: y, startScroll: ukState.scroll, moved: 0 };
      return true;
    }
    if (hid === 'uk:list') {
      ukListDrag = { pointer: id, startY: y, startScroll: ukState.scroll, moved: 0 };
      return true;
    }
    // 'uk:backdrop': close on release if it stays a tap
    return true;
  }
  function ukPointerMove(x, y) {
    if (!ukModal) return;
    var hit = ukHitAt(x, y);
    ukHover = hit ? hit.id : null;
  }
  function ukPointerDrag(x, y, id) {
    if (!ukModal) return;
    if (ukPress && ukPress.pointer === id) {
      ukPress.moved = Math.max(ukPress.moved, Math.abs(y - ukPress.y) + Math.abs(x - ukPress.x));
    }
    if (ukListDrag && ukListDrag.pointer === id) {
      var dy = y - ukListDrag.startY;
      ukListDrag.moved = Math.max(ukListDrag.moved, Math.abs(dy));
      ukState.scroll = ukListDrag.startScroll - dy;
      if (ukState.scroll < 0) ukState.scroll = 0;
      if (ukState.scroll > ukState.scrollMax) ukState.scroll = ukState.scrollMax;
    }
  }
  function ukPointerUp(id) {
    if (!ukModal) return;
    if (ukPress && ukPress.pointer === id) {
      if (ukPress.id === 'uk:backdrop' && ukPress.moved < 10) ukCatalogClose();
      ukPress = null;
    }
    if (ukListDrag && ukListDrag.pointer === id) ukListDrag = null;
  }
  function ukWheel(d) {
    if (!ukModal) return false;
    ukState.scroll += d;
    if (ukState.scroll < 0) ukState.scroll = 0;
    if (ukState.scroll > ukState.scrollMax) ukState.scroll = ukState.scrollMax;
    return true;
  }

  // Keyboard: arrows move the selection, left/right cycle tabs, enter acts.
  // Escape stays with the game loop (it owns the back/exit path).
  function ukCatalogKeys() {
    if (!ukState) return;
    var items = ukCurItems();
    var idx = -1;
    var selKey = ukCurSel();
    for (var i = 0; i < items.length; i++) if (items[i].key === selKey) { idx = i; break; }
    var moved = false;
    // Arrow selection walks non-folder rows (folder rows are pointer
    // doors; keyboard reaches depth through ArrowRight on items with
    // children, which today covers every shipped level).
    if (keys['ArrowDown'] || keys['s'] || keys['S']) {
      keys['ArrowDown'] = keys['s'] = keys['S'] = false;
      for (var d = idx + 1; d < items.length; d++) {
        if (items[d].kind !== 'folder') { idx = d; moved = true; break; }
      }
    }
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
      keys['ArrowUp'] = keys['w'] = keys['W'] = false;
      for (var u = idx - 1; u >= 0; u--) {
        if (items[u].kind !== 'folder') { idx = u; moved = true; break; }
      }
    }
    if (moved && idx >= 0 && items[idx]) {
      ukCurSetSel(items[idx].key);
      // keep the selection on screen
      var L = ukLayoutC;
      if (L) {
        var n = items.length;
        var rowH = ukState.scrollMax > 0 ? (L.listH + ukState.scrollMax) / n : L.listH / Math.max(1, n);
        var top = idx * rowH, bot = top + rowH;
        if (top < ukState.scroll) ukState.scroll = top;
        if (bot > ukState.scroll + L.listH) ukState.scroll = bot - L.listH;
      }
    }
    var tabDir = 0;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) { keys['ArrowRight'] = keys['d'] = keys['D'] = false; tabDir = 1; }
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) { keys['ArrowLeft'] = keys['a'] = keys['A'] = false; tabDir = -1; }
    if (ukStackDepth() > 0) {
      // Deep in a level: right descends further (when possible), left pops.
      if (tabDir === 1) {
        var selDeep = ukSelectedItem();
        if (selDeep && selDeep.children) ukPush(selDeep.children);
      } else if (tabDir === -1) {
        ukPop();
      }
    } else if (tabDir !== 0) {
      // Root: left/right always cycle the tabs (never hijacked).
      ukCycleTab(tabDir);
    }
    if (keys['Enter'] || keys[' '] || keys['Space'] || keys['Spacebar']) {
      keys['Enter'] = keys[' '] = keys['Space'] = keys['Spacebar'] = false;
      ukFireAction();
    }
  }
  function ukCycleTab(dir) {
    if (ukModal.tabs.length < 2) return;
    var ti = 0;
    for (var t = 0; t < ukModal.tabs.length; t++) if (ukModal.tabs[t].id === ukState.tab) { ti = t; break; }
    var nt = (ti + dir + ukModal.tabs.length) % ukModal.tabs.length;
    // skip bespoke-page tabs on keyboard cycling
    if (!ukModal.tabs[nt].open) ukSwitchTab(ukModal.tabs[nt].id);
  }

