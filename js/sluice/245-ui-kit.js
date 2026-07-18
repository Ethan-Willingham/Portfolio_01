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
    // Warm dim so panel text pops without going to black.
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(12,9,6,' + (0.50 * strength).toFixed(3) + ')';
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
  // The modal surface: solid warm plate, dark outline, one top light line,
  // small brass corner ticks. Deliberately quiet; the content is the show.
  function ukPanelBox(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x - 5, y - 1, w + 10, h + 9);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 1, y + 4, w, h + 1);
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2b241b';
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
    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#17120c';
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
      ctx.fillStyle = '#0b0906';
      ctx.fillRect(px - 1, y - 1, pw + 2, h + 2);
      ctx.fillStyle = on ? '#d8ac3e' : '#241e15';
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
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(r.x - 1, r.y - 1 + squish, r.w + 2, r.h + 2 - squish);
    if (kind === 'gold') {
      ctx.fillStyle = hover ? '#ffdf66' : '#d8ac3e';
      ctx.fillRect(r.x, r.y + squish, r.w, r.h - squish);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(r.x, r.y + squish, r.w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
      nsText(label, r.x + r.w / 2, r.y + squish + (r.h - squish - px) / 2, px, '#241608', 'center');
    } else {
      ctx.fillStyle = '#241d15';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(r.x, r.y, r.w, 2);
      var lockCol = (kind === 'short') ? '#d05a48' : '#7a7060';
      nsText(label, r.x + r.w / 2, r.y + (r.h - px) / 2, px, lockCol, 'center');
    }
  }

  // ---- catalog modal: open / close / rebuild ----------------------------
  function ukCatalogOpen(spec) {
    ukModal = spec;
    ukState = { tab: spec.tab || spec.tabs[0].id, sel: {}, items: [],
                scroll: 0, scrollMax: 0, lastMoney: null };
    ukOpenT = 0; ukCloseT = -1;
    ukHover = null; ukPress = null; ukListDrag = null;
    ukDeniedT = 0; ukArtPopT = 0;
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
  function ukSelectedItem() {
    if (!ukState) return null;
    var key = ukState.sel[ukState.tab];
    for (var i = 0; i < ukState.items.length; i++) {
      if (ukState.items[i].key === key) return ukState.items[i];
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
    if (!have && ukState.items.length) ukState.sel[ukState.tab] = ukState.items[0].key;
  }
  function ukSwitchTab(id) {
    if (!ukState || ukState.tab === id) return;
    var def = ukTabDef(id);
    if (!def) return;
    if (def.open) { def.open(); return; }   // bespoke page takes over
    ukState.tab = id;
    ukState.scroll = 0;
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
    var tabH = (ukModal.tabs.length > 1) ? Math.max(34, Math.round(36 * us)) : 0;
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
    if (L.tabH > 0) ukDrawTabs(L);
    ukDrawList(L);
    ukDrawDetail(L);

    ctx.restore();
    if (ukCloseT < 0) ukCatalogKeys();
  }

  function ukDrawHeader(L) {
    var us = L.us;
    var cy = L.y + Math.round(L.headH / 2);
    // title
    var tpx = Math.round(15 * us);
    nsText(ukModal.title, L.x + L.pad + 2, cy - Math.round(tpx / 2), tpx, '#f0d894');
    // close button (top-right square)
    var cw = Math.max(34, Math.round(30 * us));
    var cr = { x: L.x + L.w - cw - Math.round(7 * us), y: L.y + Math.round((L.headH - cw) / 2), w: cw, h: cw };
    var chov = (ukHover === 'uk:close');
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(cr.x - 1, cr.y - 1, cr.w + 2, cr.h + 2);
    ctx.fillStyle = chov ? '#4a3b22' : '#332a1d';
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    ctx.fillStyle = 'rgba(255,216,150,0.10)';
    ctx.fillRect(cr.x, cr.y, cr.w, 1);
    var xc = cr.x + cr.w / 2, yc = cr.y + cr.h / 2, arm = Math.round(cr.w * 0.20);
    ctx.fillStyle = chov ? '#ffdf9a' : '#c9b184';
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
        ctx.fillStyle = '#382e1e';
        ctx.fillRect(rx, ty, rw, th);
        ctx.fillStyle = 'rgba(255,216,150,0.08)';
        ctx.fillRect(rx, ty, rw, 1);
        ctx.fillStyle = '#d8ac3e';
        ctx.fillRect(rx, ty + th - 3, rw, 3);
      } else if (hov) {
        ctx.fillStyle = 'rgba(255,216,150,0.05)';
        ctx.fillRect(rx, ty, rw, th);
      }
      var px = Math.round(9.5 * us);
      nsText(def.label, rx + rw / 2, ty + (th - px) / 2, px,
             active ? '#f0d894' : (hov ? '#bda878' : '#8a7a58'), 'center');
      UK_HIT.push({ id: 'uk:tab:' + def.id, x: rx, y: ty - 4, w: rw, h: th + 8 });
    }
  }

  function ukDrawList(L) {
    var us = L.us;
    var items = ukState.items;
    var n = items.length;
    ukInset(L.listX, L.listY, L.listW, L.listH);
    if (n === 0) {
      ukMono('Nothing here yet.', L.listX + L.listW / 2, L.listY + L.listH / 2,
             Math.max(10, Math.round(11 * us)), '#7a7060', 'center');
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
    var selKey = ukState.sel[ukState.tab];
    for (var i = 0; i < n; i++) {
      var it = items[i];
      var ry = L.listY + i * rowH - Math.round(ukState.scroll);
      if (ry + rowH < L.listY || ry > L.listY + L.listH) continue;
      var selected = (it.key === selKey);
      var hov = (ukHover === 'uk:item:' + it.key);
      if (selected) {
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(L.listX + 1, ry, L.listW - 2, rowH);
        ctx.fillStyle = '#d8ac3e';
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
        nsText(it.name, tx0, ry + Math.round(rowH * 0.24) - Math.round(npx / 2) + 2, npx, selected ? '#f0dfae' : '#cdbd92');
        ukMono(it.sub, tx0, ry + Math.round(rowH * 0.74) + 3, subPx, selected ? '#a89468' : '#7d7058');
      } else {
        nsText(it.name, tx0, ry + Math.round((rowH - npx) / 2), npx, selected ? '#f0dfae' : '#cdbd92');
      }
      // price, right-aligned
      if (it.priceLabel) {
        var pc = '#8a7a58';
        if (it.priceTier === 'gold') pc = '#e8c052';
        else if (it.priceTier === 'red') pc = '#d05a48';
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
      ctx.fillStyle = '#6a5a34';
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

    // Stack from the bottom: action button, reason, desc, stat, pips,
    // state, name. The art stage takes whatever is left on top.
    var btnH = Math.max(44, Math.round(44 * us));
    var btnY = bottom - btnH;
    var cursorY = btnY - Math.round(8 * us);

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
      ctx.fillStyle = 'rgba(10,8,5,0.82)';
      ctx.fillRect(x + w - bdW - 4, artY + 4, bdW, bdH);
      ctx.fillStyle = '#d8ac3e';
      ctx.fillRect(x + w - bdW - 4, artY + 4, 2, bdH);
      ukMono(it.badge, x + w - 4 - bdW / 2 + 1, artY + 4 + bdH - Math.round(5 * us), bdPx, '#f0dfae', 'center', true);
    }

    // name
    var dnw = nsTextW(it.name, namePx);
    var maxNameW = w - Math.round(12 * us);
    var dnpx = (dnw > maxNameW && dnw > 0) ? Math.max(7, namePx * maxNameW / dnw) : namePx;
    nsText(it.name, x + w / 2, nameY + Math.round((nameH - dnpx) / 2), dnpx, '#f0d894', 'center');
    // state line
    if (it.state) {
      ukMono(it.state, x + w / 2, subY + subH - Math.round(4 * us), subPx, '#9a8a64', 'center');
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
      ukMono(it.stat.label, x + w / 2, sY + sLabPx - 2, sLabPx, '#8a7a58', 'center');
      // '▸' is the one arrow glyph in STENCIL_FONT ('>' has no bitmap).
      var valStr = it.stat.next ? (it.stat.cur + ' ▸ ' + it.stat.next) : it.stat.cur;
      var deltaStr = it.stat.delta ? ('  ' + it.stat.delta) : '';
      var vw = nsTextW(valStr, valPx);
      var dw = deltaStr ? nsTextW(deltaStr, Math.round(valPx * 0.8)) : 0;
      var startX = x + w / 2 - (vw + dw) / 2;
      nsText(valStr, startX, sY + sLabPx + Math.round(4 * us), valPx, '#eadfb8');
      if (deltaStr) {
        nsText(deltaStr, startX + vw, sY + sLabPx + Math.round(4 * us) + Math.round(valPx * 0.14), Math.round(valPx * 0.8), '#e8c052');
      }
    }
    // description
    if (descLines > 0 && it.desc) {
      ukMonoWrap(it.desc, x + w / 2, descY + descPx + Math.round(2 * us),
                 w - pad * 2, descPx, descLineH, '#b3a582', descLines);
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
    if (hid.indexOf('uk:tab:') === 0) { ukSwitchTab(hid.slice(7)); return true; }
    if (hid === 'uk:act') { ukFireAction(); return true; }
    if (hid.indexOf('uk:item:') === 0) {
      ukState.sel[ukState.tab] = hid.slice(8);
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
    var items = ukState.items;
    var idx = -1;
    var selKey = ukState.sel[ukState.tab];
    for (var i = 0; i < items.length; i++) if (items[i].key === selKey) { idx = i; break; }
    var moved = false;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) {
      keys['ArrowDown'] = keys['s'] = keys['S'] = false;
      if (idx < items.length - 1) { idx++; moved = true; }
    }
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
      keys['ArrowUp'] = keys['w'] = keys['W'] = false;
      if (idx > 0) { idx--; moved = true; }
    }
    if (moved && idx >= 0 && items[idx]) {
      ukState.sel[ukState.tab] = items[idx].key;
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
    if (tabDir !== 0 && ukModal.tabs.length > 1) {
      var ti = 0;
      for (var t = 0; t < ukModal.tabs.length; t++) if (ukModal.tabs[t].id === ukState.tab) { ti = t; break; }
      var nt = (ti + tabDir + ukModal.tabs.length) % ukModal.tabs.length;
      // skip bespoke-page tabs on keyboard cycling
      if (!ukModal.tabs[nt].open) ukSwitchTab(ukModal.tabs[nt].id);
    }
    if (keys['Enter'] || keys[' '] || keys['Space'] || keys['Spacebar']) {
      keys['Enter'] = keys[' '] = keys['Space'] = keys['Spacebar'] = false;
      ukFireAction();
    }
  }

