  // ========================================================================
  // v11.10 — Item radial wheel (UI_STYLE.md §8).
  // Replaces the four legacy HUD chips (teleporter, balloon, bombSmall,
  // bombLarge) for UI_NEW. Triggered by:
  //   - Click/tap the ITEMS button to toggle the wheel open — it stays
  //     open. Click/tap a wedge to fire that item (the wheel then closes);
  //     click the button again or tap empty space to dismiss it.
  //   - PC: hold [Q] as a shortcut (cursor drives selection, release fires).
  // Existing T / B / 1 / 2 hotkeys remain as muscle-memory shortcuts.
  // ========================================================================
  var ITEM_WHEEL_R = 70;
  var ITEM_WHEEL_RI = 22;
  var itemWheel = {
    open: false,
    cx: 0, cy: 0,         // wheel center, canvas px
    hover: -1,            // 0..3 (top, right, bottom, left)
    pointerId: null,      // 'mouse' | touchId | 'kb'
    px: 0, py: 0          // current pointer position
  };
  var mouseCursor = { x: 0, y: 0 };

  function getWheelItems() {
    return [
      { id: 'tele',    label: 'WARP',    count: teleporters, color: '#c8a4ff' },
      { id: 'small',   label: 'BOMB-S',  count: bombsSmall,  color: '#ff8040' },
      { id: 'large',   label: 'BOMB-L',  count: bombsLarge,  color: '#ff3020' },
      { id: 'balloon', label: 'BALLOON', count: balloons,    color: '#ffd060' }
    ];
  }
  function fireWheelItem(idx) {
    var it = getWheelItems()[idx];
    if (!it || it.count <= 0) return;
    if (it.id === 'tele')         activateTeleporter();
    else if (it.id === 'balloon') activateRoverDrop();
    else if (it.id === 'small')   activateBomb('small');
    else if (it.id === 'large')   activateBomb('large');
  }
  function itemWheelButtonRect() {
    var ch = consoleHeight();
    var bw = 56, bh = 36;
    return { x: 8, y: viewH - ch - bh - 6, w: bw, h: bh };
  }
  function pointInItemWheelButton(x, y) {
    if (!UI_NEW) return false;
    var r = itemWheelButtonRect();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function openItemWheel(id) {
    var r = itemWheelButtonRect();
    itemWheel.open = true;
    itemWheel.cx = r.x + r.w + ITEM_WHEEL_R + 4;
    itemWheel.cy = r.y + r.h / 2 - 12;
    if (itemWheel.cy < ITEM_WHEEL_R + 8) itemWheel.cy = ITEM_WHEEL_R + 8;
    if (itemWheel.cx + ITEM_WHEEL_R > viewW - 8) itemWheel.cx = viewW - 8 - ITEM_WHEEL_R;
    itemWheel.pointerId = id;
    itemWheel.hover = -1;
  }
  function updateItemWheelHover(px, py) {
    itemWheel.px = px; itemWheel.py = py;
    var dx = px - itemWheel.cx;
    var dy = py - itemWheel.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    // Only the wedge annulus counts — the center hub and anything beyond
    // the outer radius clear the selection (so a tap there dismisses).
    if (dist < ITEM_WHEEL_RI || dist > ITEM_WHEEL_R) { itemWheel.hover = -1; return; }
    var ang = Math.atan2(dy, dx);
    // top wedge centered at -PI/2; rotate so 0 = top, increasing clockwise
    var rot = (ang + Math.PI * 2 + Math.PI / 2 + Math.PI / 4) % (Math.PI * 2);
    itemWheel.hover = Math.floor(rot / (Math.PI / 2)) % 4;
  }
  function closeItemWheel(commit) {
    if (commit && itemWheel.hover >= 0) fireWheelItem(itemWheel.hover);
    itemWheel.open = false;
    itemWheel.pointerId = null;
    itemWheel.hover = -1;
  }
  function drawItemWheelButton() {
    var r = itemWheelButtonRect();
    // Plate base + bevel
    ctx.fillStyle = UIMAT_PLATE_BASE;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(r.x, r.y, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, 1);
    ctx.fillRect(r.x - 1, r.y + r.h, r.w + 2, 1);
    ctx.fillRect(r.x - 1, r.y - 1, 1, r.h + 2);
    ctx.fillRect(r.x + r.w, r.y - 1, 1, r.h + 2);
    drawConsoleRivet(r.x + 2, r.y + 2);
    drawConsoleRivet(r.x + r.w - 4, r.y + 2);
    drawConsoleRivet(r.x + 2, r.y + r.h - 4);
    drawConsoleRivet(r.x + r.w - 4, r.y + r.h - 4);
    var lbl = 'ITEMS';
    var lw = stencilTextWidth(lbl, 1);
    drawStencilText(lbl, r.x + Math.floor((r.w - lw) / 2), r.y + 5, 1, '#d4a838');
    var total = teleporters + balloons + bombsSmall + bombsLarge;
    var s = '×' + total;
    var sw = stencilTextWidth(s, 2);
    drawStencilText(s, r.x + Math.floor((r.w - sw) / 2), r.y + r.h - 18, 2, total > 0 ? '#40c060' : '#52504a');
    // Active glow when wheel is open
    if (itemWheel.open) {
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffd060';
      ctx.strokeStyle = '#ffd060';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.restore();
    }
  }
  // Pixel-art sprites for the consumables item wheel (warp / bombs / balloon),
  // matching the shop icon language: warm palette, 1px dark outline, light from
  // the upper-left. Self-contained so the generic pixel helpers stay private.
  var wheelItemSprites = (function () {
    var N = 32, INK = '#15100a';
    var STEEL  = ['#494139', '#6d6359', '#94897b', '#bcb1a1', '#ece2d2'];
    var REDST  = ['#5e1410', '#9e241a', '#d2402c', '#ee6a4e', '#ff9a7e'];
    var IRON   = ['#0e0c0b', '#23211e', '#3a3733', '#56524c', '#837c72'];
    var PURPLE = ['#241a44', '#3a2c6e', '#5a47a0', '#8a72d0', '#bca4ee'];
    var CYAN   = ['#1d4a55', '#2f8a9a', '#5fc6d6', '#a6ecf5', '#e6ffff'];
    function emptyGrid() {
      var g = [];
      for (var r = 0; r < N; r++) { var row = []; for (var c = 0; c < N; c++) row.push(0); g.push(row); }
      return g;
    }
    function setCell(g, r, c, v) { if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; }
    function shade(ramp, b) {
      var i = Math.round(b * (ramp.length - 1));
      if (i < 0) i = 0; if (i > ramp.length - 1) i = ramp.length - 1;
      return ramp[i];
    }
    function outline(g) {
      var out = emptyGrid(), r, c;
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) out[r][c] = g[r][c];
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        if (g[r][c] !== 0) continue;
        var near = (r > 0 && g[r - 1][c] !== 0) || (r < N - 1 && g[r + 1][c] !== 0) ||
                   (c > 0 && g[r][c - 1] !== 0) || (c < N - 1 && g[r][c + 1] !== 0);
        if (near) out[r][c] = INK;
      }
      return out;
    }
    function disc(g, cx, cy, rad, ramp, amb) {
      amb = amb == null ? 0.16 : amb;
      for (var r = Math.floor(cy - rad - 1); r <= Math.ceil(cy + rad + 1); r++) {
        for (var c = Math.floor(cx - rad - 1); c <= Math.ceil(cx + rad + 1); c++) {
          var nx = (c - cx) / rad, ny = (r - cy) / rad, d2 = nx * nx + ny * ny;
          if (d2 > 1) continue;
          var dif = nx * (-0.5) + ny * (-0.55) + Math.sqrt(1 - d2) * 0.66;
          setCell(g, r, c, shade(ramp, Math.min(1, amb + (1 - amb) * Math.max(0, dif))));
        }
      }
    }
    function box(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 0.82 - ((c - x0) / w) * 0.55;
        if (r === y0) b += 0.16;
        if (r === y1) b -= 0.20;
        setCell(g, r, c, shade(ramp, Math.max(0.04, Math.min(1, b))));
      }
    }
    function vcyl(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 1 - Math.abs((c - x0) / w - 0.34) * 1.45;
        if (r === y0) b += 0.08;
        setCell(g, r, c, shade(ramp, Math.max(0.06, Math.min(1, b))));
      }
    }
    function qbez(g, p0, p1, p2, color) {
      for (var t = 0; t <= 1.0001; t += 0.03) {
        var u = 1 - t;
        setCell(g, Math.round(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]),
                   Math.round(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]), color);
      }
    }
    function spark(g, cx, cy) {
      setCell(g, cy, cx, '#ffffff'); setCell(g, cy - 1, cx, '#ffe890'); setCell(g, cy + 1, cx, '#ffb24a');
      setCell(g, cy, cx - 1, '#ffe890'); setCell(g, cy, cx + 1, '#ffd060');
    }
    function buildTele() {
      var g = emptyGrid(), cx = 16, cy = 16, rx = 12, ry = 10;
      for (var r = cy - ry - 1; r <= cy + ry + 1; r++) for (var c = cx - rx - 1; c <= cx + rx + 1; c++) {
        var nx = (c - cx) / rx, ny = (r - cy) / ry, d = Math.sqrt(nx * nx + ny * ny), band = -1;
        if (d <= 1.0 && d > 0.78) band = 0;
        else if (d <= 0.66 && d > 0.46) band = 1;
        else if (d <= 0.36 && d > 0.18) band = 2;
        if (band >= 0) {
          var ramp = [PURPLE, PURPLE, [PURPLE[3], CYAN[2], CYAN[3]]][band];
          setCell(g, r, c, shade(ramp, Math.max(0.2, Math.min(1, 0.8 - (ny + nx) * 0.3 + band * 0.12))));
        }
      }
      disc(g, cx, cy, 3, [CYAN[2], CYAN[3], CYAN[4], '#ffffff'], 0.5);
      setCell(g, 6, 8, CYAN[3]); setCell(g, 26, 24, PURPLE[4]); setCell(g, 9, 25, '#ffffff');
      return outline(g);
    }
    function buildSmall() {
      var g = emptyGrid();
      vcyl(g, 12, 8, 20, 28, REDST);
      setCell(g, 8, 12, 0); setCell(g, 8, 20, 0); setCell(g, 28, 12, 0); setCell(g, 28, 20, 0);
      for (var c = 12; c <= 20; c++) { setCell(g, 11, c, REDST[3]); setCell(g, 25, c, REDST[3]); }
      box(g, 12, 16, 20, 19, ['#caa86a', '#e0c486', '#f2dca0']);
      qbez(g, [16, 8], [20, 5], [23, 3], '#3a2c1a');
      spark(g, 23, 3);
      return outline(g);
    }
    function buildLarge() {
      var g = emptyGrid();
      disc(g, 16, 19, 10, IRON, 0.14);
      setCell(g, 13, 12, '#9a948a'); setCell(g, 12, 13, '#857f76'); setCell(g, 14, 13, '#6a655e');
      box(g, 14, 7, 18, 10, STEEL);
      qbez(g, [16, 7], [21, 4], [24, 2], '#3a2c1a');
      spark(g, 24, 2);
      return outline(g);
    }
    function buildBalloon() {
      var g = emptyGrid(), b = [[11, 11, 6], [12, 22, 6], [21, 16, 6.5]];
      for (var i = 0; i < b.length; i++) {
        disc(g, b[i][1], b[i][0], b[i][2], REDST, 0.18);
        setCell(g, b[i][0] - 2, b[i][1] - 2, '#ffd8c8');
        setCell(g, b[i][0] - 2, b[i][1] - 1, '#ffb8a0');
        setCell(g, (b[i][0] + b[i][2]) | 0, b[i][1], REDST[1]);
      }
      qbez(g, [11, 17], [13, 24], [16, 30], '#6a5238');
      qbez(g, [22, 18], [20, 24], [16, 30], '#6a5238');
      qbez(g, [16, 28], [16, 29], [16, 31], '#6a5238');
      return outline(g);
    }
    var BUILDERS = { tele: buildTele, small: buildSmall, large: buildLarge, balloon: buildBalloon };
    var cache = {};
    function bitmap(id) {
      if (cache[id]) return cache[id];
      var build = BUILDERS[id]; if (!build) return null;
      var g = build();
      var off = document.createElement('canvas'); off.width = N; off.height = N;
      var o = off.getContext('2d');
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var v = g[r][c]; if (v === 0 || v == null) continue;
        o.fillStyle = v; o.fillRect(c, r, 1, 1);
      }
      cache[id] = off; return off;
    }
    return { bitmap: bitmap, SIZE: N };
  })();

  function drawWheelItemIcon(id, cx, cy, size) {
    var bmp = wheelItemSprites.bitmap(id);
    if (!bmp) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0, wheelItemSprites.SIZE, wheelItemSprites.SIZE,
                  Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    ctx.restore();
  }

  function drawItemWheel() {
    if (!UI_NEW) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawItemWheelButton();
    if (!itemWheel.open) { ctx.restore(); return; }
    // Dim backdrop so the wheel pops
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, viewW, viewH);
    var cx = itemWheel.cx, cy = itemWheel.cy;
    var R = ITEM_WHEEL_R, Ri = ITEM_WHEEL_RI;
    var items = getWheelItems();
    // Wedge angles: top wedge centered at -PI/2; each spans PI/2.
    for (var i = 0; i < 4; i++) {
      var a0 = -Math.PI / 2 - Math.PI / 4 + i * Math.PI / 2;
      var a1 = a0 + Math.PI / 2;
      var hovered = (itemWheel.hover === i);
      var enabled = items[i].count > 0;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.arc(cx, cy, Ri, a1, a0, true);
      ctx.closePath();
      if (hovered && enabled) ctx.fillStyle = '#5a4220';
      else if (enabled)       ctx.fillStyle = '#241c14';
      else                    ctx.fillStyle = '#15110d';
      ctx.fill();
      ctx.strokeStyle = hovered && enabled ? items[i].color : UI_OUTLINE;
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.stroke();
      // Hovered wedge gets a soft neon edge along the outer arc
      if (hovered && enabled) {
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = items[i].color;
        ctx.strokeStyle = items[i].color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1, a0 + 0.04, a1 - 0.04);
        ctx.stroke();
        ctx.restore();
      }
      // Icon + label + count along the wedge midline
      var mid = (a0 + a1) / 2;
      var lr = (R + Ri) / 2;
      var lx = cx + Math.cos(mid) * lr;
      var ly = cy + Math.sin(mid) * lr;
      if (!enabled) ctx.globalAlpha = 0.3;
      drawWheelItemIcon(items[i].id, lx, ly - 9, 18);
      ctx.globalAlpha = 1;
      var lbl = items[i].label;
      var lw = stencilTextWidth(lbl, 1);
      drawStencilText(lbl, Math.round(lx - lw / 2), Math.round(ly + 3), 1, enabled ? items[i].color : '#52504a');
      var cnt = '×' + items[i].count;
      var cw = stencilTextWidth(cnt, 1);
      drawStencilText(cnt, Math.round(lx - cw / 2), Math.round(ly + 13), 1, enabled ? '#d4a838' : '#52504a');
    }
    // Center hub
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(cx, cy, Ri - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a4220'; ctx.lineWidth = 1; ctx.stroke();
    // Center label
    var msg, msgColor;
    if (itemWheel.hover >= 0 && items[itemWheel.hover].count > 0) {
      msg = 'FIRE'; msgColor = items[itemWheel.hover].color;
    } else if (itemWheel.hover >= 0) {
      msg = 'EMPTY'; msgColor = '#a83020';
    } else {
      msg = 'PICK'; msgColor = '#d4a838';
    }
    var mw = stencilTextWidth(msg, 1);
    drawStencilText(msg, Math.round(cx - mw / 2), Math.round(cy - 4), 1, msgColor);
    ctx.restore();
  }

  // v11.3 — Console renderer (UI_STYLE.md §3). Draws the riveted plate-
  // steel frame plus N empty bay slots. Stage 4 will replace each bay
  // body with its instrument (needle gauge, plate counter, bay window,
  // dial wheel). Rendered in CSS-pixel space — every rect is integer-
  // pixel-aligned per the bible's pixel discipline (§2 axis 3).
  function drawConsoleRivet(cx, cy) {
    ctx.fillStyle = UIMAT_RIVET_RIM;
    ctx.fillRect(cx - 1, cy - 1, 4, 4);
    ctx.fillStyle = UIMAT_RIVET_CORE;
    ctx.fillRect(cx, cy, 2, 2);
  }
  // ====== Ornate console end-cap styles (v24.57+) ======
  // The end cap used to be a plain iron plate with one brass strip. These are
  // the ornate "BioShock-deco x Frontier-Soviet" treatments designed + tuned in
  // endcap-lab.html. The owner picks one live from the L panel via the
  // `endcap.STYLE` lever (0 = the original plain cap; 1..6 below). Every style
  // uses ONLY the locked palette (BLD reds/golds/metals + the UIMAT_* plate-steel
  // tones) per UI_STYLE.md, and is painted into the cached console frame, so it
  // is STATIC — any lamp glow is baked at cache-build time (no per-frame pulse),
  // matching the frame-cache architecture and the owner's "barely perceptible
  // motion" rule. Each draw fn paints the LEFT cap in local space (outer edge at
  // x, inner edge toward the body at x+w); drawConsoleCap mirrors it for the
  // right cap. Keep these byte-aligned with endcap-lab.html (the design bench).
  var CAP_STYLES = ['old', 'flute', 'star', 'bracket', 'glass', 'rosette', 'gauges', 'gunmetal'];
  var consoleCapStyleId = 7;             // v26.43 default: Machined Gunmetal (endcap.STYLE lever picks others)
  var CAP = {
    plate: UIMAT_PLATE_BASE, plateHi: UIMAT_PLATE_HIGHLIGHT, plateSh: UIMAT_PLATE_SHADOW,
    bay: UIMAT_BAY_RECESS, bayDark: UIMAT_BAY_RECESS_DARK, bayLite: UIMAT_BAY_RECESS_LIGHT,
    weld: UIMAT_WELD, outline: UI_OUTLINE,
    bDeep: '#3a2912', bDark: '#4f3a1b', bMid: '#7a5a2c', bHi: '#a07c40',
    bBright: '#c89a50', bShine: '#fff0c0', bSeat: '#5a4220',
    redDeep: '#5a1108', redDark: '#8a1a10', redBase: '#c8341c', redBright: '#e85c40',
    glow: '#fbc55a', cream: '#e6d5a8',
    ironDark: '#1f2933', ironBase: '#4a5560', ironHi: '#7a8590'
  };
  function capPx(x, y, w, h, c) { if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.ceil(w), Math.ceil(h)); }
  // small domed brass boss
  function capBoss(cx, cy, r) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      capPx(cx + dx, cy + dy, 1, 1, (dx + dy < -r * 0.4) ? CAP.bBright : (dx + dy > r * 0.4 ? CAP.bDark : CAP.bMid));
    }
    capPx(cx - r, cy - r, 1, 1, CAP.outline);
    capPx(cx - Math.round(r * 0.4), cy - Math.round(r * 0.4), 1, 1, CAP.bShine);
  }
  // 5-point Soviet star (point-in-polygon raster), top-left lit
  function capStar(cx, cy, r, fill, hi) {
    var pts = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5; var rr = (i % 2 === 0) ? r : r * 0.42; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    function inside(px, py) { var c = false; for (var i = 0, j = 9; i < 10; j = i++) { var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if (((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; }
    for (var yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (var xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      if (inside(xx + 0.5, yy + 0.5)) capPx(xx, yy, 1, 1, (xx + yy < cx + cy - 1) ? hi : fill);
    }
  }
  // filled disc; fn(dx,dy,edge)->color|null
  function capDisc(cx, cy, r, fn) { for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) { var d = dx * dx + dy * dy; if (d <= r * r) { var c = fn(dx, dy, d >= (r - 1) * (r - 1)); if (c) capPx(cx + dx, cy + dy, 1, 1, c); } } }
  // filled octagon; fn(dx,dy,edge,bevel)->color|null
  function capOcta(cx, cy, r, fn) { var dd = Math.round(r * 1.45);
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var cheb = Math.max(Math.abs(dx), Math.abs(dy)), man = Math.abs(dx) + Math.abs(dy);
      if (cheb <= r && man <= dd) { var edge = (cheb === r) || (man > dd - 1); var bevel = (cheb >= r - 1) || (man >= dd - 1);
        var c = fn(dx, dy, edge, bevel); if (c) capPx(cx + dx, cy + dy, 1, 1, c); } } }
  // one 2x3 brass bead (for beaded rails)
  function capBead(bx, by) { capPx(bx, by, 2, 3, CAP.bMid); capPx(bx, by, 2, 1, CAP.bHi); capPx(bx, by + 2, 2, 1, CAP.bDeep); }
  // base plate + outer outline + chamfered outer corners + inner seam (shared)
  function capShell(x, y, w, h) {
    capPx(x, y, w, h, CAP.plate);
    capPx(x, y, w, 1, CAP.plateHi);
    capPx(x, y + h - 1, w, 1, CAP.plateSh);
    capPx(x, y, 1, h, CAP.outline);
    var steps = 4;
    for (var ci = 0; ci < steps; ci++) { capPx(x + ci, y + steps - ci - 1, 1, 1, CAP.outline); capPx(x + ci, y + h - steps + ci, 1, 1, CAP.outline); }
    capPx(x + w - 1, y + 2, 1, h - 4, CAP.plateSh);
  }
  // --- 1: Fluted Pilaster — reeded bronze column + stepped deco capital/base ---
  function capFlute(x, y, w, h, t) {
    capShell(x, y, w, h);
    var ft = y + 13, fb = y + h - 13, il = x + 3, ir = x + w - 3;
    capPx(il, ft, ir - il, fb - ft, CAP.bDark);
    for (var fx = il; fx < ir - 1; fx += 3) {
      capPx(fx, ft, 1, fb - ft, CAP.bHi);
      capPx(fx + 1, ft, 1, fb - ft, CAP.bMid);
      capPx(fx + 2, ft, 1, fb - ft, CAP.bDeep);
    }
    capPx(x + 2, ft - 1, 1, fb - ft + 2, CAP.outline);
    capPx(ir, ft - 1, 1, fb - ft + 2, CAP.plateSh);
    capPx(x + 1, y + 2, w - 2, 3, CAP.bMid); capPx(x + 1, y + 2, w - 2, 1, CAP.bHi); capPx(x + 1, y + 4, w - 2, 1, CAP.bDeep);
    capPx(x + 3, y + 5, w - 6, 3, CAP.bMid); capPx(x + 3, y + 5, w - 6, 1, CAP.bHi); capPx(x + 3, y + 7, w - 6, 1, CAP.bDeep);
    capPx(x + 5, y + 8, w - 10, 3, CAP.bMid); capPx(x + 5, y + 8, w - 10, 1, CAP.bHi); capPx(x + 5, y + 10, w - 10, 1, CAP.outline);
    capPx(x + 1, y + h - 5, w - 2, 3, CAP.bMid); capPx(x + 1, y + h - 5, w - 2, 1, CAP.bHi); capPx(x + 1, y + h - 2, w - 2, 1, CAP.bDeep);
    capPx(x + 3, y + h - 8, w - 6, 3, CAP.bMid); capPx(x + 3, y + h - 8, w - 6, 1, CAP.bHi); capPx(x + 3, y + h - 6, w - 6, 1, CAP.bDeep);
    capPx(x + 5, y + h - 11, w - 10, 3, CAP.bMid); capPx(x + 5, y + h - 11, w - 10, 1, CAP.bHi); capPx(x + 5, y + h - 8, w - 10, 1, CAP.outline);
    var cy = y + (h >> 1);
    capDisc(x + (w >> 1), cy, 5, function (dx, dy, edge) { return edge ? CAP.outline : (dx + dy < 0 ? CAP.bBright : CAP.bDark); });
    capDisc(x + (w >> 1), cy, 2, function (dx, dy, edge) { return edge ? CAP.bDeep : CAP.bShine; });
    drawBrassBolt(x + 6, y + 5); drawBrassBolt(x + w - 7, y + 5);
    drawBrassBolt(x + 6, y + h - 6); drawBrassBolt(x + w - 7, y + h - 6);
  }
  // --- 2: Star Medallion — beveled brass octagon + recessed red star ---
  function capStarMedallion(x, y, w, h, t) {
    capShell(x, y, w, h);
    var cx = x + (w >> 1);
    for (var by = y + 9; by < y + h - 8; by += 6) { capBead(x + 3, by); capBead(x + w - 5, by); }
    capPx(x + 5, y + 6, w - 10, 3, CAP.bDark); capPx(x + 6, y + 6, w - 12, 2, CAP.bMid); capPx(x + 6, y + 6, w - 12, 1, CAP.bHi); drawBrassBolt(cx, y + 7);
    capPx(x + 5, y + h - 9, w - 10, 3, CAP.bDark); capPx(x + 6, y + h - 9, w - 12, 2, CAP.bMid); capPx(x + 6, y + h - 9, w - 12, 1, CAP.bHi); drawBrassBolt(cx, y + h - 8);
    var cy = y + (h >> 1), r = Math.min(12, (w >> 1) - 1);
    capOcta(cx, cy, r, function (dx, dy, edge, bevel) { if (edge) return CAP.outline; if (bevel) return (dx + dy < 0) ? CAP.bBright : CAP.bDark; return CAP.bMid; });
    capOcta(cx, cy, r - 3, function (dx, dy, edge) { return edge ? CAP.bDeep : CAP.redDeep; });
    for (var a = 0; a < 12; a++) { var ang = a * Math.PI / 6; for (var rr = 2; rr < r - 3; rr++) { if ((rr & 1) === 0) capPx(Math.round(cx + Math.cos(ang) * rr), Math.round(cy + Math.sin(ang) * rr), 1, 1, CAP.redDark); } }
    capStar(cx, cy, r - 4, CAP.redBase, CAP.redBright);
    drawBrassBolt(cx - r + 1, cy); drawBrassBolt(cx + r - 1, cy);
    drawConsoleRivet(x + 6, y + 5); drawConsoleRivet(x + w - 7, y + 5); drawConsoleRivet(x + 6, y + h - 7); drawConsoleRivet(x + w - 7, y + h - 7);
  }
  // --- 3: Hazard Bracket — iron flange, red-star plate, caution chevrons ---
  function capBracket(x, y, w, h, t) {
    capShell(x, y, w, h);
    var cx = x + (w >> 1);
    capPx(x + 1, y + 1, 3, h - 2, CAP.ironBase); capPx(x + 1, y + 1, 1, h - 2, CAP.ironHi); capPx(x + 4, y + 1, 1, h - 2, CAP.ironDark);
    capPx(x + 7, y + 5, w - 13, 10, CAP.bDark); capPx(x + 8, y + 6, w - 15, 8, CAP.bMid); capPx(x + 8, y + 6, w - 15, 1, CAP.bHi); capPx(x + 8, y + 13, w - 15, 1, CAP.bDeep);
    capStar(cx + 1, y + 10, 3, CAP.redBase, CAP.redBright);
    for (var ry = y + 22; ry < y + h - 18; ry += 12) { drawConsoleRivet(x + 8, ry); drawConsoleRivet(x + w - 9, ry); }
    var ct = y + (h >> 1) - 9, cb = y + (h >> 1) + 13, cl = x + 11, cr = x + w - 9;
    capPx(cl - 1, ct - 1, (cr - cl) + 2, (cb - ct) + 2, CAP.outline);
    capPx(cl, ct, cr - cl, cb - ct, CAP.bDeep);
    for (var sx = cl - 24; sx < cr; sx += 8) { for (var yy = ct; yy < cb; yy++) { var off = sx + (yy - ct); for (var xx = off; xx < off + 4; xx++) { if (xx >= cl && xx < cr) capPx(xx, yy, 1, 1, CAP.bHi); } } }
    capPx(cl, ct, cr - cl, 1, CAP.bShine); capPx(cl, cb - 1, cr - cl, 1, CAP.bDeep);
    capPx(x + 7, y + h - 13, w - 13, 8, CAP.bDark); capPx(x + 8, y + h - 12, w - 15, 6, CAP.bMid); capPx(x + 8, y + h - 12, w - 15, 1, CAP.bHi);
    drawConsoleRivet(x + 10, y + h - 9); drawConsoleRivet(x + w - 11, y + h - 9);
  }
  // --- 4: Stepped Glass — streamline setbacks + a baked warm lamp channel ---
  function capGlass(x, y, w, h, t) {
    capShell(x, y, w, h);
    capPx(x + 8, y + 4, 7, h - 8, CAP.plateHi);
    capPx(x + 7, y + 3, 1, h - 6, CAP.outline); capPx(x + 8, y + 3, 1, h - 6, CAP.bHi);
    capPx(x + 15, y + 5, 1, h - 10, CAP.outline); capPx(x + 16, y + 5, 1, h - 10, CAP.bHi); capPx(x + 17, y + 5, 1, h - 10, CAP.bDark);
    var gx = x + 18, gw = (x + w - 3) - gx;
    capPx(gx - 1, y + 6, gw + 1, h - 12, CAP.bayDark);
    var pulse = 0.5 + 0.5 * Math.sin(t * 1.0);
    ctx.save(); ctx.globalAlpha = 0.30 + 0.13 * pulse; capPx(gx, y + 8, gw, h - 16, CAP.glow); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * pulse; capPx(gx + (gw >> 1), y + 9, 1, h - 18, CAP.cream); ctx.restore();
    capPx(gx, y + 8, gw, 1, 'rgba(180,200,220,0.18)');
    capPx(x + 2, y + 2, w - 4, 3, CAP.bDark); capPx(x + 3, y + 2, w - 6, 2, CAP.bMid); capPx(x + 3, y + 2, w - 6, 1, CAP.bHi);
    capPx(x + 2, y + h - 5, w - 4, 3, CAP.bDark); capPx(x + 3, y + h - 5, w - 6, 2, CAP.bMid); capPx(x + 3, y + h - 5, w - 6, 1, CAP.bHi);
    drawBrassBolt(x + 5, y + 4); drawBrassBolt(x + w - 7, y + 4); drawBrassBolt(x + 5, y + h - 5); drawBrassBolt(x + w - 7, y + h - 5);
  }
  // --- 5: Filigree Rosette — brass frame, corner fans, egg-and-dart, rosette ---
  function capRosette(x, y, w, h, t) {
    capShell(x, y, w, h);
    capPx(x + 3, y + 3, w - 6, 1, CAP.bMid); capPx(x + 3, y + h - 4, w - 6, 1, CAP.bMid);
    capPx(x + 3, y + 3, 1, h - 6, CAP.bMid); capPx(x + w - 4, y + 3, 1, h - 6, CAP.bMid);
    capPx(x + 3, y + 3, 1, 1, CAP.bHi); capPx(x + w - 4, y + 3, 1, 1, CAP.bHi);
    function fan(fx, fy, sx, sy) { capPx(fx, fy, 1, 1, CAP.bHi); capPx(fx + sx, fy, 1, 1, CAP.bMid); capPx(fx, fy + sy, 1, 1, CAP.bMid); capPx(fx + 2 * sx, fy, 1, 1, CAP.bDark); capPx(fx, fy + 2 * sy, 1, 1, CAP.bDark); capPx(fx + sx, fy + sy, 1, 1, CAP.bDeep); }
    fan(x + 5, y + 5, 1, 1); fan(x + w - 6, y + 5, -1, 1); fan(x + 5, y + h - 6, 1, -1); fan(x + w - 6, y + h - 6, -1, -1);
    for (var by = y + 13; by < y + h - 12; by += 8) {
      capPx(x + 4, by, 3, 3, CAP.bMid); capPx(x + 4, by, 3, 1, CAP.bHi); capPx(x + 5, by + 4, 1, 1, CAP.bDeep);
      capPx(x + w - 7, by, 3, 3, CAP.bMid); capPx(x + w - 7, by, 3, 1, CAP.bHi); capPx(x + w - 6, by + 4, 1, 1, CAP.bDeep);
    }
    var cx = x + (w >> 1), cy = y + (h >> 1), r = Math.min(9, (w >> 1) - 5);
    for (var a = 0; a < 8; a++) { var ang = a * Math.PI / 4; var px = Math.round(cx + Math.cos(ang) * r), py = Math.round(cy + Math.sin(ang) * r); capPx(px - 1, py - 1, 2, 2, CAP.bMid); capPx(px - 1, py - 1, 1, 1, CAP.bHi); }
    capDisc(cx, cy, r - 2, function (dx, dy, edge) { return edge ? CAP.outline : (dx + dy < -1 ? CAP.bBright : (dx + dy > 1 ? CAP.bDark : CAP.bMid)); });
    capDisc(cx, cy, 2, function (dx, dy, edge) { return edge ? CAP.bDeep : CAP.bShine; });
  }
  // --- 6: Gauge Cluster — stacked brass dials with needles + one baked lamp ---
  function capGauges(x, y, w, h, t) {
    capShell(x, y, w, h);
    capPx(x + 3, y + 4, 2, h - 8, CAP.bDark); capPx(x + w - 5, y + 4, 2, h - 8, CAP.bDark);
    capPx(x + 3, y + 4, 1, h - 8, CAP.bHi); capPx(x + w - 5, y + 4, 1, h - 8, CAP.bHi);
    var cx = x + (w >> 1);
    var slots = [y + Math.round(h * 0.22), y + Math.round(h * 0.5), y + Math.round(h * 0.78)];
    var pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    for (var i = 0; i < slots.length; i++) {
      var cy = slots[i], r = Math.min(8, (w >> 1) - 4);
      capDisc(cx, cy, r, function (dx, dy, edge) { if (edge) return CAP.outline; var d = dx * dx + dy * dy; if (d >= (r - 2) * (r - 2)) return (dx + dy < 0) ? CAP.bBright : CAP.bDark; return CAP.bayDark; });
      capPx(cx, cy - r + 2, 1, 1, CAP.bHi);
      if (i === 1) {
        ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * pulse; capPx(cx - 1, cy - 1, 2, 2, CAP.glow); ctx.restore(); capPx(cx, cy, 1, 1, CAP.cream);
      } else {
        var ang = (i === 0) ? -2.2 : 0.7;
        var nx = Math.round(cx + Math.cos(ang) * (r - 3)), ny = Math.round(cy + Math.sin(ang) * (r - 3));
        var steps = Math.max(1, Math.max(Math.abs(nx - cx), Math.abs(ny - cy)));
        for (var s2 = 0; s2 <= steps; s2++) { capPx(Math.round(cx + (nx - cx) * s2 / steps), Math.round(cy + (ny - cy) * s2 / steps), 1, 1, s2 === 0 ? CAP.bShine : CAP.bHi); }
      }
    }
    drawBrassBolt(cx, (slots[0] + slots[1]) >> 1); drawBrassBolt(cx, (slots[1] + slots[2]) >> 1);
  }
  // --- 7: Machined Gunmetal (v26.43 default) — the quiet cap for the
  // gunmetal cluster. No brass, no flutes: the plate shell, two horizontal
  // relief grooves, one recessed round port ringed like the instrument
  // apertures, and two flush screws. The caps just terminate the rail and
  // let the lit instruments carry the design.
  function capGunmetal(x, y, w, h, t) {
    capShell(x, y, w, h);
    var cx = x + (w >> 1), cy = y + (h >> 1);
    function groove(gy) {
      capPx(x + 3, gy, w - 6, 1, CAP.plateSh);
      capPx(x + 3, gy + 1, w - 6, 1, CAP.plateHi);
    }
    groove(y + 8);
    groove(y + h - 10);
    var r = Math.min(7, (w >> 1) - 3);
    capDisc(cx, cy, r + 2, function (dx, dy, edge) { return edge ? CAP.outline : null; });
    capDisc(cx, cy, r + 1, function (dx, dy, edge) { return edge ? ((dx + dy >= 0) ? CAP.plateHi : CAP.plateSh) : null; });
    capDisc(cx, cy, r, function (dx, dy, edge) { return edge ? CAP.bayDark : '#0d1015'; });
    capPx(cx - (r >> 1) - 1, cy - (r >> 1) - 1, 2, 1, 'rgba(220,235,255,0.10)');
    drawConsoleRivet(cx - 1, y + 15);
    drawConsoleRivet(cx - 1, y + h - 17);
  }
  function capDispatch(style, x, y, w, h, t) {
    if (style === 'flute') capFlute(x, y, w, h, t);
    else if (style === 'star') capStarMedallion(x, y, w, h, t);
    else if (style === 'bracket') capBracket(x, y, w, h, t);
    else if (style === 'glass') capGlass(x, y, w, h, t);
    else if (style === 'rosette') capRosette(x, y, w, h, t);
    else if (style === 'gauges') capGauges(x, y, w, h, t);
    else if (style === 'gunmetal') capGunmetal(x, y, w, h, t);
  }
  // ---- End cap dispatcher: classic (style 0) or one of the ornate styles ----
  function drawConsoleCap(x, y, w, h, side) {
    var style = CAP_STYLES[consoleCapStyleId] || 'old';
    if (style === 'old') { drawConsoleCapClassic(x, y, w, h, side); return; }
    // Styles paint the LEFT orientation; mirror in place for the right cap.
    if (side === 'right') {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      capDispatch(style, 0, 0, w, h, 0);
      ctx.restore();
    } else {
      capDispatch(style, x, y, w, h, 0);
    }
  }
  // ---- Classic end cap (style 0): plain iron plate + one brass strip ----
  function drawConsoleCapClassic(x, y, w, h, side) {
    // Iron base with brass mid-strip and bolts at top + bottom corners.
    // The OUTER edge (away from the body) has a small chamfer giving it
    // the "mounted bracket" silhouette.
    var isLeft = (side === 'left');
    // Base plate
    ctx.fillStyle = UIMAT_PLATE_BASE;
    ctx.fillRect(x, y, w, h);
    // Bevels on the inner edge so it reads as part of the console body
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(x, y + h - 1, w, 1);
    // Outline on the outer edge
    ctx.fillStyle = UI_OUTLINE;
    var outerX = isLeft ? x : x + w - 1;
    ctx.fillRect(outerX, y, 1, h);
    // Outer chamfer — diagonal pixels on top and bottom outer corners
    var cornerSteps = 4;
    for (var ci = 0; ci < cornerSteps; ci++) {
      // Top corner
      var topCornerX = isLeft ? x + ci : x + w - 1 - ci;
      ctx.fillStyle = UI_OUTLINE;
      ctx.fillRect(topCornerX, y + cornerSteps - ci - 1, 1, 1);
      // Bottom corner
      ctx.fillRect(topCornerX, y + h - cornerSteps + ci, 1, 1);
    }
    // Brass middle strip — horizontal band giving the "trimmed mount" feel
    var brassY = y + Math.floor(h / 2) - 6;
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(x + 4, brassY, w - 8, 12);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(x + 5, brassY + 1, w - 10, 10);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(x + 5, brassY + 1, w - 10, 1);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(x + 5, brassY + 10, w - 10, 1);
    // Three small bolts on the brass strip (decorative)
    var bcx = x + Math.floor(w / 2);
    drawBrassBolt(bcx, brassY + 5);
    drawBrassBolt(x + 7, brassY + 5);
    drawBrassBolt(x + w - 8, brassY + 5);
    // Big iron corner bolts at top + bottom
    var bigCx = x + Math.floor(w / 2);
    drawConsoleRivet(bigCx, y + 5);
    drawConsoleRivet(bigCx, y + h - 7);
    // Edge accent bolts on the inner side (toward body)
    var innerX = isLeft ? x + w - 7 : x + 5;
    drawConsoleRivet(innerX, y + 5);
    drawConsoleRivet(innerX, y + h - 7);
  }

  // Side wing extension — fills the strip between screen edge and the
  // centered console. Slightly darker than the body so the centered
  // console stays the visual focal area. Has rivets along top + bottom
  // edges to read as part of the rig chassis.
  function drawConsoleSideWing(x, w, y, h, isLeftSide) {
    if (w <= 0) return;
    // Slightly darker plate body (v26.43: cooled to the gunmetal tokens —
    // this was the last warm-gray slab on the rail)
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(x, y, w, h);
    // Top weld + highlight
    ctx.fillStyle = UIMAT_WELD;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(x, y + 1, w, 1);
    // Bottom shadow + outline
    ctx.fillStyle = UIMAT_BAY_RECESS_DARK;
    ctx.fillRect(x, y + h - 2, w, 1);
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(x, y + h - 1, w, 1);
    // Rivet rows along top + bottom (~24px spacing). Skip too close to
    // the inner edge (next to the console end cap) so they don't crowd.
    var innerEdge = isLeftSide ? (x + w) : x;
    var startRx = isLeftSide ? (x + 14) : (x + 14);
    for (var rx = startRx; rx < x + w - 4; rx += 24) {
      // Skip rivets in the last 8px next to the inner edge
      if (Math.abs(rx - innerEdge) < 8) continue;
      drawConsoleRivet(rx, y + 5);
      drawConsoleRivet(rx, y + h - 7);
    }
    // Vertical "panel break" at the screen edge
    var edgeX = isLeftSide ? x : (x + w - 1);
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(edgeX, y + 2, 1, h - 4);
  }

  // Draws one console bay — the recessed panel plus its instrument,
  // both painted inside (bx, by, bw, bh).
  // v11.81 — console frame caching. The console's static structure (wings,
  // caps, plate, rivets, weld seams, bay recesses) is identical every frame
  // until a viewport resize, so it is rendered once into an offscreen canvas
  // and blitted; only the live instruments redraw per frame. Cuts a few
  // hundred fillRect/rivet calls per frame down to one drawImage.
  var consoleFrameCache = null;
  var consoleFrameKey = '';
  var consoleBayLayout = [];

  // (v26.43: drawConsoleBayRecess is gone. The bays no longer sit in their
  // own recessed panels; each instrument cuts its window straight into the
  // plate via instrWindow (220), so the rail reads as one milled panel.)

  function drawConsoleInstrument(bay, bx, by, bw, bh) {
    if (bay.id === 'fuel')         drawFuelGauge(bx, by, bw, bh);
    else if (bay.id === 'speed')   drawSpeedDisplay(bx, by, bw, bh);
    else if (bay.id === 'hull')    drawHullPlates(bx, by, bw, bh);
    else if (bay.id === 'cargo')   drawCargoBay(bx, by, bw, bh);
    else if (bay.id === 'cash')    drawCashDisplay(bx, by, bw, bh);
    else if (bay.id === 'depth')   drawDepthDisplay(bx, by, bw, bh);
  }

  // Draws the static console structure onto `ctx` (the caller points ctx at
  // the offscreen cache) and records each bay's rect for the live pass.
  function drawConsoleFrameContent(R) {
    consoleBayLayout.length = 0;
    // ---- Side wings: plate steel out to the full screen width ----
    drawConsoleSideWing(0, R.x, R.y, R.h, true);
    drawConsoleSideWing(R.x + R.w, (R.viewW || viewW) - (R.x + R.w), R.y, R.h, false);
    // ---- Left + right ornate end caps ----
    drawConsoleCap(R.x, R.y, R.capW, R.h, 'left');
    drawConsoleCap(R.x + R.w - R.capW, R.y, R.capW, R.h, 'right');
    // ---- Plate base (body only, between the end caps) ----
    var bx0 = R.bodyX, by0 = R.y, bw0 = R.bodyW, bh0 = R.h;
    ctx.fillStyle = UIMAT_PLATE_BASE;
    ctx.fillRect(bx0, by0, bw0, bh0);
    // ---- Top edge: arc-welded seam (1-px lighter line) ----
    ctx.fillStyle = UIMAT_WELD;
    ctx.fillRect(bx0, by0, bw0, 1);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(bx0, by0 + 1, bw0, 1);
    // ---- Bottom edge: shadow + outline ----
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(bx0, by0 + bh0 - 2, bw0, 1);
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(bx0, by0 + bh0 - 1, bw0, 1);
    // ---- Rivets along the top + bottom edges ----
    var rivetSpacing = 24;
    var rivetTopY = by0 + 5;
    var rivetBottomY = by0 + bh0 - 6;
    for (var rx = bx0 + 12; rx < bx0 + bw0 - 8; rx += rivetSpacing) {
      drawConsoleRivet(rx, rivetTopY);
      drawConsoleRivet(rx, rivetBottomY);
    }
    // ---- Bays: one row of all bays, or two rows when folded ----
    // v26.43: no per-bay recess panels and no vertical weld seams between
    // bays. Each instrument cuts its own window into the plate (instrWindow
    // in 220), so the plate runs unbroken behind the whole rail.
    var bayInset = 6;
    if (!R.stacked) {
      var bayX = bx0 + CONSOLE_BODY_PAD - 4;
      var bayTop = by0 + 4;
      var bayH = bh0 - 8;
      for (var b = 0; b < CONSOLE_BAYS.length; b++) {
        var bay = CONSOLE_BAYS[b];
        var ibx = bayX + bayInset / 2, iby = bayTop + 2;
        var ibw = bay.w - bayInset, ibh = bayH - 4;
        consoleBayLayout.push({ bay: bay, bx: ibx, by: iby, bw: ibw, bh: ibh });
        bayX += bay.w;
      }
    } else {
      // Folded: 2 rows, consoleStackCols() per row, every bay a uniform width.
      var cols = consoleStackCols();
      var rowH = bh0 / 2;
      var uniformW = Math.floor((bw0 - CONSOLE_BODY_PAD * 2) / cols);
      for (var sb = 0; sb < CONSOLE_BAYS.length; sb++) {
        var col = sb % cols;
        var row = (sb / cols) | 0;
        var slotX = bx0 + CONSOLE_BODY_PAD + col * uniformW;
        var slotY = by0 + row * rowH;
        var sbx = slotX + bayInset / 2, sby = slotY + 6;
        var sbw = uniformW - bayInset, sbh = rowH - 12;
        consoleBayLayout.push({ bay: CONSOLE_BAYS[sb], bx: sbx, by: sby, bw: sbw, bh: sbh });
      }
    }
  }

  function rebuildConsoleFrame(R, consY) {
    var ds = dpr * (R.scale || 1);     // device px per logical console unit
    if (!consoleFrameCache) consoleFrameCache = document.createElement('canvas');
    consoleFrameCache.width = Math.max(1, canvas.width);
    consoleFrameCache.height = Math.max(1, canvas.height - consY);
    var cctx = consoleFrameCache.getContext('2d');
    // The cache's (0,0) is the console's top-left; offset the console-coord
    // drawing up by consY so it lands at the cache origin. The console is drawn
    // in its logical space scaled by dpr*scale (see consoleRect / consoleScale).
    cctx.setTransform(ds, 0, 0, ds, 0, -consY);
    cctx.imageSmoothingEnabled = false;
    var oldCtx = ctx;
    ctx = cctx;
    drawConsoleFrameContent(R);
    ctx = oldCtx;
  }

