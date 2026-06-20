  function drawConsole() {
    if (!UI_NEW) return;
    var R = consoleRect();
    var ds = dpr * (R.scale || 1);     // device px per logical console unit
    var consY = Math.round(R.y * ds);
    var key = canvas.width + 'x' + canvas.height + 'x' + Math.round(R.h) +
              'x' + (R.stacked ? 1 : 0) + 'x' + Math.round((R.scale || 1) * 100) +
              'x' + consoleCapStyleId;     // end-cap style is baked into the cached frame

    if (key !== consoleFrameKey || !consoleFrameCache) {
      rebuildConsoleFrame(R, consY);
      consoleFrameKey = key;
    }
    // Blit the cached static frame, 1:1 in device pixels.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(consoleFrameCache, 0, consY);
    ctx.restore();
    // Draw the live instruments on top, in the same scaled console space.
    ctx.save();
    ctx.setTransform(ds, 0, 0, ds, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < consoleBayLayout.length; i++) {
      var L = consoleBayLayout[i];
      drawConsoleInstrument(L.bay, L.bx, L.by, L.bw, L.bh);
    }
    ctx.restore();
  }

  // v11.27 — small persistent FPS + version display in top-left.
  // Tucked in stencil paint so it blends with the rest of the UI.
  function drawTopLeftDebug() {
    if (!UI_NEW) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var v = GAME_VERSION || '';
    var fps = (perfFps || 0) + ' FPS';
    // v23.64 — seat the version + FPS on a dark translucent plate so they stay
    // legible over the bright sky as well as the dark underground (was dim amber
    // on bare canvas, which washed out against the blue). Matches the dpad disc
    // / perf-panel backdrops; text bumped to near-opaque amber.
    var plateW = Math.max(stencilTextWidth(v, 1), stencilTextWidth(fps, 1)) + 8;
    ctx.fillStyle = 'rgba(8,10,14,0.62)';
    roundRect(ctx, 4, 3, plateW, 22, 3, true);
    drawStencilText(v, 8, 6, 1, 'rgba(238,202,104,0.96)');
    drawStencilText(fps, 8, 16, 1, 'rgba(238,202,104,0.96)');
    ctx.restore();
  }

  // v23.93 — geometry for the mobile split flight controls. Mirrors the d-pad
  // anchor: rotate L/R cluster bottom-LEFT, thrust bottom-RIGHT (the d-pad slot).
  // Shared by the touch hit-test (050) and the draw below. `hit` is the oversized
  // touch radius (visual `r` + 12) per the mobile-ergonomics research.
  function flightTouchGeom() {
    var r = DPAD_BTN;              // rotate button radius (~0.38 * DPAD_SIZE)
    var tR = DPAD_SIZE * 0.5;      // thrust radius — bigger (the primary verb)
    var cy = DPAD_CY;             // same height as the d-pad (clears the wheel button)
    var leftCX = DPAD_SIZE * 0.95; // mirror of DPAD_CX, bottom-left
    var sep = DPAD_SIZE * 0.5;
    return {
      rotL:   { cx: leftCX - sep, cy: cy, r: r,  hit: r + 12 },
      rotR:   { cx: leftCX + sep, cy: cy, r: r,  hit: r + 12 },
      thrust: { cx: DPAD_CX,      cy: cy, r: tR, hit: tR + 12 }
    };
  }
  // Split touch flight controls, Frontier-Soviet to match the d-pad (recessed
  // disc, orange pressed-state). The caller cross-fades via globalAlpha.
  function drawFlightPad(thrustAlpha) {
    // The rotate L/R cluster (left) draws at full opacity always; the thrust
    // button (right) is faded by thrustAlpha so it cross-fades with the d-pad.
    if (thrustAlpha === undefined) thrustAlpha = 1;
    var g = flightTouchGeom();
    function fpBtn(b, pressed, glyph) {
      ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r + DPAD_SIZE * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,11,4,0.45)'; ctx.fill();
      ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
      ctx.fillStyle   = pressed ? 'rgba(239,159,39,0.55)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = pressed ? '#EF9F27' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      glyph(b, pressed);
    }
    function fpInk(pressed) { return pressed ? '#1a1208' : 'rgba(255,255,255,0.62)'; }
    // rotate-left chevron
    fpBtn(g.rotL, flightTouch.rotL, function (b, p) {
      var s = b.r * 0.36;
      ctx.strokeStyle = fpInk(p); ctx.lineWidth = Math.max(2, DPAD_SIZE * 0.022);
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.cx + s * 0.5, b.cy - s); ctx.lineTo(b.cx - s * 0.6, b.cy); ctx.lineTo(b.cx + s * 0.5, b.cy + s); ctx.stroke();
    });
    // rotate-right chevron
    fpBtn(g.rotR, flightTouch.rotR, function (b, p) {
      var s = b.r * 0.36;
      ctx.strokeStyle = fpInk(p); ctx.lineWidth = Math.max(2, DPAD_SIZE * 0.022);
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.cx - s * 0.5, b.cy - s); ctx.lineTo(b.cx + s * 0.6, b.cy); ctx.lineTo(b.cx - s * 0.5, b.cy + s); ctx.stroke();
    });
    // thrust — upward flame/triangle. Faded by thrustAlpha (cross-fades with the
    // dig d-pad on the RIGHT). The rotate cluster above stays full opacity.
    if (thrustAlpha > 0.015) {
      ctx.save();
      ctx.globalAlpha *= thrustAlpha;
      fpBtn(g.thrust, flightTouch.thrust, function (b, p) {
        var s = b.r * 0.5;
        ctx.fillStyle = fpInk(p);
        ctx.beginPath(); ctx.moveTo(b.cx, b.cy - s); ctx.lineTo(b.cx + s * 0.7, b.cy + s * 0.6); ctx.lineTo(b.cx - s * 0.7, b.cy + s * 0.6); ctx.closePath(); ctx.fill();
      });
      ctx.restore();
    }
  }
  function drawDpad(cx, cy) {
    // Orbital arcs design: four arc segments arranged in a ring (Option B).
    var RO  = DPAD_SIZE * 0.85;   // outer radius — matches existing touch radius
    var RI  = DPAD_SIZE * 0.38;   // inner cutout radius
    var GAP = 0.045;              // gap between segments in radians

    // Background disc
    ctx.beginPath();
    ctx.arc(cx, cy, RO + DPAD_SIZE * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,11,4,0.45)';
    ctx.fill();

    // Map short keys to actual dpad state
    var dpadState = { u: dpad.up, r: dpad.right, d: dpad.down, l: dpad.left };

    // Four arc segments
    var arcs = [
      { key: 'u', s: -Math.PI/2 - Math.PI/4, e: -Math.PI/4 },
      { key: 'r', s: -Math.PI/4,              e:  Math.PI/4 },
      { key: 'd', s:  Math.PI/4,              e:  3*Math.PI/4 },
      { key: 'l', s:  3*Math.PI/4,            e:  5*Math.PI/4 }
    ];

    var arrowAngles = { u: 0, r: Math.PI/2, d: Math.PI, l: -Math.PI/2 };

    for (var ai = 0; ai < arcs.length; ai++) {
      var arc = arcs[ai];
      var pressed = dpadState[arc.key];
      var s = arc.s;
      var e = arc.e;

      ctx.beginPath();
      ctx.arc(cx, cy, RO, s + GAP, e - GAP);
      ctx.arc(cx, cy, RI, e - GAP, s + GAP, true);
      ctx.closePath();
      ctx.fillStyle   = pressed ? 'rgba(239,159,39,0.55)' : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = pressed ? '#EF9F27'                : 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 1;
      ctx.fill();
      ctx.stroke();

      // Arrow inside the arc, pointing in the cardinal direction
      var mid        = (s + e) / 2;
      var ar         = (RO + RI) / 2;
      var ax         = cx + Math.cos(mid) * ar;
      var ay         = cy + Math.sin(mid) * ar;
      var arrowSize  = DPAD_SIZE * 0.08;
      var arrowColor = pressed ? '#1a1208' : 'rgba(255,255,255,0.55)';

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(arrowAngles[arc.key]);
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize);
      ctx.lineTo(arrowSize * 0.72,  arrowSize * 0.5);
      ctx.lineTo(-arrowSize * 0.72, arrowSize * 0.5);
      ctx.closePath();
      ctx.fillStyle = arrowColor;
      ctx.fill();
      ctx.restore();
    }

    // Center dot — outer glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, RI - DPAD_SIZE * 0.03, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(239,159,39,0.10)';
    ctx.strokeStyle = 'rgba(239,159,39,0.20)';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();

    // Center dot — inner pip
    ctx.beginPath();
    ctx.arc(cx, cy, DPAD_SIZE * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,159,39,0.25)';
    ctx.fill();
  }

  // Pretty layer name + dramatic subtitle
  var LAYER_DISPLAY = {
    topsoil:    { title: 'TOPSOIL',         sub: 'Loose earth and roots',                color: '#a0824a' },
    bedrock:    { title: 'BEDROCK',         sub: 'Common minerals begin',                color: '#a8a8a8' },
    permafrost: { title: 'PERMAFROST',      sub: 'Heated drill required',                color: '#bfe6ff' },
    barrier:    { title: 'REINFORCED BAND', sub: 'Explosives required to break through', color: '#FFD200' },
    fossil:     { title: 'FOSSIL LAYER',    sub: 'Ancient remains, ancient prices',      color: '#d8aa66' },
    deepcrust:  { title: 'DEEP CRUST',      sub: 'Watch for radioactive deposits',       color: '#9aff9a' },
    magma:      { title: 'MAGMA VEINS',     sub: 'Heat shield strongly recommended',     color: '#ff7a3a' },
    crystal:    { title: 'CRYSTAL CAVES',   sub: 'Rare gemstones glitter in the dark',   color: '#b0c4ff' },
    mantle:     { title: 'MANTLE EDGE',     sub: 'Where dragons dwell',                  color: '#ff3030' },
  };

  function drawLayerBanner() {
    var info = LAYER_DISPLAY[layerBanner.name];
    if (!info) return;
    // Lifecycle (total 2.5s): slide-in (2.5 → 2.0), hold (2.0 → 0.5),
    // slide-out (0.5 → 0). Fade matches the slide.
    var t = layerBanner.t;
    var fade, slideProg;
    // Total banner life is 1.8s (set at trigger sites). Lifecycle:
    //   slide-in:   1.8 → 1.5  (0.3s)
    //   hold:       1.5 → 0.4  (1.1s)
    //   fade-out:   0.4 → 0.0  (0.4s)
    if (t > 1.5) {
      var p = (1.8 - t) / 0.3;       // 0 → 1
      fade = p;
      slideProg = p;
    } else if (t < 0.4) {
      var p2 = t / 0.4;              // 1 → 0
      fade = p2;
      slideProg = 1;
    } else {
      fade = 1;
      slideProg = 1;
    }

    // ---- Slim "now entering" strip ----
    // Earlier builds drew a 64px-tall card centered horizontally just below
    // the HUD. The player crosses zone boundaries constantly, so that big
    // card was constantly blocking the play area. New design: a small
    // 30px-tall translucent pill anchored to the RIGHT edge below the HUD,
    // showing only the layer name + a colored dot. Slides in from the right
    // and fades out — never holds the eye, never covers the rig.
    // hudH must match the bar height set in drawHUD (60 desktop / 104 mobile)
    // — those constants come from the same logic on both sides; if drawHUD's
    // sizing changes, update both. We also nudge the pill OFF the right
    // edge on mobile because the action chips already live on row 2 there
    // and the pill would land directly on top of them.
    var hudH = isMobile ? 104 : 60;
    var pillH = 30;
    var rightPad = 14;
    // Compute pill width from the title text so it's only as wide as it
    // needs to be. Includes a colored dot, eyebrow, and title.
    ctx.font = 'bold 12px ' + UI_FONT;
    var titleW = ctx.measureText(info.title).width;
    var pillW = titleW + 56;
    var slideOffset = (1 - slideProg) * 24;
    var pillX = viewW - pillW - rightPad + slideOffset;
    var pillY = hudH + 10;

    ctx.save();
    // Lower overall opacity so the strip recedes into the background.
    // Maxes out at ~0.7 even at full fade, never fully opaque.
    ctx.globalAlpha = fade * 0.78;

    // Drop shadow (subtle)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, pillX + 1, pillY + 2, pillW, pillH, pillH / 2, true);

    // Background pill — dark with a thin gradient
    var bgGrad = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
    bgGrad.addColorStop(0, 'rgba(22,18,12,0.85)');
    bgGrad.addColorStop(1, 'rgba(12,10,8,0.85)');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2, true);

    // Hairline border in the layer's accent color
    ctx.strokeStyle = info.color;
    ctx.globalAlpha = fade * 0.35;
    ctx.lineWidth = 1;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2, false, true);
    ctx.globalAlpha = fade * 0.78;

    // Colored dot (left)
    var dotR = 5;
    var dotX = pillX + 14;
    var dotY = pillY + pillH / 2;
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
    // Soft halo around the dot (matches the layer's accent)
    var halo = ctx.createRadialGradient(dotX, dotY, dotR, dotX, dotY, dotR * 2.4);
    halo.addColorStop(0, info.color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = fade * 0.35;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade * 0.78;

    // Tiny "ENTERING" eyebrow + title on one line
    ctx.font = 'bold 8px ' + UI_FONT;
    ctx.fillStyle = 'rgba(255,210,120,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('▸', dotX + 12, dotY);
    // Title
    ctx.font = 'bold 12px ' + UI_FONT;
    ctx.fillStyle = info.color;
    ctx.fillText(info.title, dotX + 22, dotY);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- No Man's Zone exit arrow ----
  // While crossing a combat gauntlet (a REGION_NOMANS region), an off-screen
  // waypoint arrow pinned to the screen edge points toward the safe town exit
  // AHEAD, tagged with the meters remaining (1 tile = 1 m, like the DEPTH
  // gauge). The classic objective marker: it rides the screen border in the
  // direction of the exit and becomes a floating tag once the exit scrolls on
  // screen. Travel direction is committed from vx with a deadzone so it never
  // flickers when you hover; it points to whichever town exit you are flying
  // toward (flee back the way you came and it flips). Screen space; fades in
  // and out. Caution gold off the NMZ banners.
  function drawNmzExitArrow() {
    if (!ENABLE_NMZ) return;   // No Man's Zones disabled: no exit-arrow HUD
    var pcx = player.x + PLAYER_W * 0.5;
    var rg = regionAt(Math.floor(pcx / TILE));
    var inZone = !!(rg && rg.kind === REGION_NOMANS);

    // Fade toward present/absent; cheap exponential ease on real frame time.
    var dt = lastFrameDt || 1 / 60;
    var a = drawNmzExitArrow._a || 0;
    a += ((inZone ? 1 : 0) - a) * Math.min(1, dt * 9);
    drawNmzExitArrow._a = a;
    if (a < 0.012 && !inZone) return;
    if (inZone) drawNmzExitArrow._geo = { c0: rg.c0, c1: rg.c1 };
    var geo = drawNmzExitArrow._geo;
    if (!geo) return;

    // Committed travel direction (-1 left / +1 right), vx deadzone = no flicker.
    var dir = drawNmzExitArrow._dir || -1;
    if (player.vx < -14) dir = -1; else if (player.vx > 14) dir = 1;
    drawNmzExitArrow._dir = dir;

    var zl = geo.c0 * TILE, zr = geo.c1 * TILE;
    var exitX = dir < 0 ? zl : zr;            // the boundary column you are heading to
    var exitY = SKY_ROWS * TILE;              // aim at the surface line of the exit
    var ahead = Math.max(0, dir < 0 ? (pcx - zl) : (zr - pcx));
    var meters = Math.max(0, Math.round(ahead / TILE));

    // World point -> CSS-px overlay space (the HUD draws at the dpr/CSS xform,
    // so 1 unit = 1 CSS px and worldX maps by (worldX - cam.x) * worldScale).
    var sc = worldScale || 1;
    var tx = (exitX - cam.x) * sc;
    var ty = (exitY - cam.y) * sc;

    // Clamp to an inset screen rectangle: the arrow rides the border in the
    // direction of the exit, or floats at the exit once it is on screen.
    var cx = viewW * 0.5, cy = viewH * 0.5;
    var inset = isMobile ? 26 : 34;
    var edgeL = inset, edgeT = inset, edgeR = viewW - inset, edgeB = viewH - inset;
    var onScreen = (tx >= edgeL && tx <= edgeR && ty >= edgeT && ty <= edgeB);
    var ax, ay, ang;
    if (onScreen) {
      ax = tx; ay = ty; ang = dir < 0 ? Math.PI : 0;
    } else {
      var dx = tx - cx, dy = ty - cy;
      if (dx === 0 && dy === 0) dx = (dir < 0 ? -1 : 1);
      var tHit = Infinity;
      if (dx > 0) tHit = Math.min(tHit, (edgeR - cx) / dx); else if (dx < 0) tHit = Math.min(tHit, (edgeL - cx) / dx);
      if (dy > 0) tHit = Math.min(tHit, (edgeB - cy) / dy); else if (dy < 0) tHit = Math.min(tHit, (edgeT - cy) / dy);
      if (!(tHit >= 0) || !isFinite(tHit)) tHit = 0;
      ax = cx + dx * tHit; ay = cy + dy * tHit;
      ang = Math.atan2(dy, dx);
    }

    var fade = Math.min(1, a) * 0.96;
    var aR = onScreen ? 12 : 15;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Dark disc behind the arrow so it reads over a bright sky.
    ctx.globalAlpha = fade * 0.34;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(ax, ay, aR + 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fade;

    // Gold arrowhead pointing toward the exit, with a notched tail.
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(aR, 0);
    ctx.lineTo(-aR * 0.7, -aR * 0.82);
    ctx.lineTo(-aR * 0.32, 0);
    ctx.lineTo(-aR * 0.7, aR * 0.82);
    ctx.closePath();
    ctx.lineWidth = 3.5; ctx.strokeStyle = BLD.outline; ctx.stroke();
    ctx.fillStyle = BLD.goldBright; ctx.fill();
    ctx.restore();

    // Distance tag, offset inward (toward screen center) from the arrow.
    var numStr = meters + 'm';
    ctx.font = 'bold 14px ' + UI_FONT;
    var tagW = ctx.measureText(numStr).width + 16, tagH = 21;
    var nx = ax - Math.cos(ang) * (aR + 6 + tagW * 0.5);
    var ny = ay - Math.sin(ang) * (aR + 6 + tagH * 0.5);
    nx = Math.max(edgeL + tagW * 0.5, Math.min(edgeR - tagW * 0.5, nx));
    ny = Math.max(edgeT + tagH * 0.5, Math.min(edgeB - tagH * 0.5, ny));
    ctx.fillStyle = 'rgba(12,9,6,0.88)';
    roundRect(ctx, nx - tagW / 2, ny - tagH / 2, tagW, tagH, tagH / 2, true);
    ctx.globalAlpha = fade * 0.55;
    ctx.strokeStyle = BLD.goldBright; ctx.lineWidth = 1;
    roundRect(ctx, nx - tagW / 2, ny - tagH / 2, tagW, tagH, tagH / 2, false, true);
    ctx.globalAlpha = fade;
    ctx.fillStyle = BLD.goldPale;
    ctx.fillText(numStr, nx, ny + 0.5);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    // Mobile + desktop both render a single dark status bar across the top
    // (fuel/hull/depth/cash/cargo). The action chips (tele, balloon, bombs,
    // zoom toggle) float over the canvas below the bar on mobile — each chip
    // carries its own translucent background, so no second bar is needed.

    // HUD scale: the bar was sized for a ~700-900px embedded canvas. In
    // desktop fullscreen the canvas can be 1920-3840px wide and the HUD
    // looks like a postage stamp. Scale everything (bar height, fonts,
    // chips, version text) proportionally for desktop sizes, capped so 4K
    // doesn't get cartoonish. Mobile uses its own per-element sizing.
    var hudScale = (!isMobile && viewW > 900) ? Math.min(2.2, viewW / 900) : 1;
    var hudW = viewW / hudScale;
    var hudH = viewH / hudScale;

    ctx.save();
    if (hudScale !== 1) ctx.scale(hudScale, hudScale);

    var twoRow = isMobile;
    var rowH = 52;
    var barH = twoRow ? rowH : 60;
    var row2Y = twoRow ? rowH : 0;        // y-offset for second-row content (chips)

    // v23.37 — the top status-bar background gradient was rebuilt every
    // frame; its stops are constant literals and barH only takes the two
    // device values (52 mobile / 60 desktop), so memoize it keyed by barH.
    // Gradient coords resolve at fill time, so the cached object paints
    // identically through the hudScale transform. drawHUD always renders in
    // the main pass, so the gradient stays bound to the right context.
    var grad = drawHUD._barGrad;
    if (!grad || drawHUD._barGradH !== barH) {
      grad = ctx.createLinearGradient(0, 0, 0, barH);
      grad.addColorStop(0, 'rgba(10,8,5,0.92)');
      grad.addColorStop(1, 'rgba(10,8,5,0.78)');
      drawHUD._barGrad = grad;
      drawHUD._barGradH = barH;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, hudW, barH);
    ctx.fillStyle = 'rgba(255,200,80,0.35)';
    ctx.fillRect(0, barH - 1, hudW, 1);

    // Reserve horizontal space on the right edge of row 1 for the HTML
    // fullscreen button which floats absolutely at top-right of the wrapper.
    // Without this, the cargo readout collides with the button on mobile.
    var fsBtnReserve = 36;

    var px = twoRow ? 10 : 14;
    var py = 16;
    var labelFont = 'bold 10px ' + UI_FONT;
    var valueFont = 'bold 13px ' + UI_FONT;

    // Fuel — narrower bar on mobile so fuel/hull/depth/cash/cargo all fit
    // on the same row at typical phone widths (~380px).
    var barW = twoRow ? 58 : 92;
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('FUEL', px, 12);
    var fuelPct = player.fuel / getMaxFuel();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, px, 16, barW, 10, 3, true);
    var fuelColor = fuelPct > 0.4 ? '#56c876' : fuelPct > 0.2 ? '#e8a735' : '#e44';
    ctx.fillStyle = fuelColor;
    roundRect(ctx, px, 16, Math.max(2, barW * fuelPct), 10, 3, true);

    // "Fuel needed to climb back to surface" indicator — drawn as a marker
    // on the fuel bar. If the marker sits to the right of the current fuel
    // level, you don't have enough fuel to make it back.
    var maxFuelNow = getMaxFuel();
    var fuelToSurface = getFuelToSurface();
    if (fuelToSurface > 0.5 && fuelToSurface <= maxFuelNow * 1.5) {
      var markerPct = Math.min(1, fuelToSurface / maxFuelNow);
      var markerX = px + barW * markerPct;
      var safe = player.fuel >= fuelToSurface;
      // Vertical line marker
      ctx.fillStyle = safe ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.95)';
      ctx.fillRect(markerX - 1, 13, 2, 16);
      // Tiny upward arrow above it
      ctx.beginPath();
      ctx.moveTo(markerX, 10);
      ctx.lineTo(markerX - 3, 14);
      ctx.lineTo(markerX + 3, 14);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = valueFont;
    ctx.fillStyle = '#fff';
    var fuelValStr = Math.ceil(player.fuel) + '/' + Math.ceil(getMaxFuel());
    ctx.fillText(fuelValStr, px, 38);
    // "↑X to surface" callout — drawn UNDER the bar (between bar and value
    // is too crowded; right of the value collides with the max-fuel digits).
    // Painted as a tiny chip floating just above the fuel marker line so it
    // visually associates with the marker on the bar.
    if (fuelToSurface > 0.5) {
      var safeNow = player.fuel >= fuelToSurface;
      ctx.font = 'bold 9px ' + UI_FONT;
      var chipText = '↑' + Math.ceil(fuelToSurface);
      var chipW = ctx.measureText(chipText).width + 8;
      // Anchor chip to the right end of the fuel bar so it never collides
      // with the "current/max" value text on the left.
      var chipX = px + barW - chipW;
      var chipY = 30;
      ctx.fillStyle = safeNow ? 'rgba(40,60,40,0.85)' : 'rgba(80,20,20,0.92)';
      roundRect(ctx, chipX, chipY, chipW, 12, 3, true);
      ctx.fillStyle = safeNow ? '#9be6b1' : '#ff9a9a';
      ctx.fillText(chipText, chipX + 4, chipY + 9);
    }

    // Hull
    px += barW + (twoRow ? 18 : 22);
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('HULL', px, 12);
    var hullPct = player.hull / getMaxHull();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, px, 16, barW, 10, 3, true);
    var hullColor = hullPct > 0.5 ? '#5aa3ff' : hullPct > 0.25 ? '#e8a735' : '#e44';
    ctx.fillStyle = hullColor;
    roundRect(ctx, px, 16, Math.max(2, barW * hullPct), 10, 3, true);
    ctx.font = valueFont;
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(player.hull) + '/' + Math.ceil(getMaxHull()), px, 38);

    // Depth / Height
    px += barW + (twoRow ? 14 : 28);
    ctx.font = labelFont;
    var rawDepth = Math.floor((player.y / TILE) - SKY_ROWS + 1);
    var aboveGround = rawDepth < 0;
    ctx.fillStyle = aboveGround ? '#aac8aa' : '#9aa';
    ctx.fillText(aboveGround ? 'HEIGHT' : 'DEPTH', px, 12);
    ctx.font = valueFont;
    ctx.fillStyle = aboveGround ? '#b0f0b0' : '#e8e8d0';
    var depthDisplay = aboveGround ? (Math.abs(rawDepth) + 'm') : (Math.max(0, rawDepth) + 'm');
    ctx.fillText(depthDisplay, px, 30);

    // Money
    px += twoRow ? 56 : 80;
    ctx.font = labelFont;
    ctx.fillStyle = devMode ? '#9bdcff' : '#9aa';
    ctx.fillText(devMode ? 'CASH · DEV' : 'CASH', px, 12);
    ctx.font = valueFont;
    ctx.fillStyle = devMode ? '#9bdcff' : '#FFD700';
    ctx.fillText('$' + money.toLocaleString(), px, 30);
    // When dev mode is on, render a tiny "FREE" chip so the no-cost
    // state is unmistakable while still showing the cash value.
    if (devMode) {
      ctx.font = 'bold 8px ' + UI_FONT;
      ctx.fillStyle = 'rgba(155,220,255,0.7)';
      ctx.fillText('PURCHASES FREE', px, 42);
    }

    // Cargo
    // On mobile, cash values can balloon past $999,999 late game and the
    // tighter row gets crowded. Anchor cargo to the right edge of row 1
    // there so it always reads cleanly regardless of cash digit count;
    // on desktop, keep the original left-to-right flow.
    if (twoRow) {
      ctx.font = labelFont;
      var cargoLabel = 'CARGO';
      var cargoVal = cargo.length + '/' + maxCargo;
      var cargoValW = 0;
      ctx.font = valueFont;
      cargoValW = ctx.measureText(cargoVal).width;
      ctx.font = labelFont;
      var cargoLabelW = ctx.measureText(cargoLabel).width;
      var cargoBlockW = Math.max(cargoLabelW, cargoValW);
      px = hudW - cargoBlockW - 12 - fsBtnReserve;
      ctx.fillStyle = '#9aa';
      ctx.fillText(cargoLabel, px, 12);
      ctx.font = valueFont;
      var cargoColor = cargo.length >= maxCargo ? '#e44' : (cargo.length >= maxCargo * 0.8 ? '#e8a735' : '#e8e8d0');
      ctx.fillStyle = cargoColor;
      ctx.fillText(cargoVal, px, 30);
    } else {
      px += 100;
      ctx.font = labelFont;
      ctx.fillStyle = '#9aa';
      ctx.fillText('CARGO', px, 12);
      ctx.font = valueFont;
      var cargoColor2 = cargo.length >= maxCargo ? '#e44' : (cargo.length >= maxCargo * 0.8 ? '#e8a735' : '#e8e8d0');
      ctx.fillStyle = cargoColor2;
      ctx.fillText(cargo.length + '/' + maxCargo, px, 30);
    }

    // (Cargo contents are shown as a stacked indicator on the player rig
    //  itself — see drawCargoStackOnPlayer(). Keeps the HUD clean and ties
    //  the visual to the thing it represents.)

    // Oil tank — appears once the pump exists or the rig is carrying oil.
    if ((upgrades.pumpLevel || 0) > 0 || oilGallons > 0) {
      var oilCap = getOilTankCapacity();
      var oilText = oilCap > 0 ? (oilGallons.toFixed(1) + '/' + oilCap) : 'NO PUMP';
      if (twoRow) {
        var oxHud = 10;
        var oyHud = row2Y + 12;
        ctx.font = labelFont;
        ctx.fillStyle = '#b79a5a';
        ctx.fillText('OIL', oxHud, oyHud);
        ctx.font = valueFont;
        ctx.fillStyle = oilGallons >= oilCap && oilCap > 0 ? '#e8a735' : '#d9b46a';
        ctx.fillText(oilText, oxHud, oyHud + 18);
      } else {
        // Desktop action chips occupy the right side of the HUD. Tuck oil
        // under the cargo readout instead of adding another full column.
        var oilInline = 'OIL ' + oilText;
        ctx.font = 'bold 9px ' + UI_FONT;
        ctx.fillStyle = oilGallons >= oilCap && oilCap > 0 ? '#e8a735' : '#d9b46a';
        ctx.fillText(oilInline, px, 44);
      }
    }

    // ---- Zoom toggle button (top-right of action row) ----
    // Tappable on mobile, clickable on desktop. Bounds are stored on the
    // function so the click handler can hit-test against them. On mobile
    // this lives on row 2 alongside the other action chips.
    var zb = drawHUD._zoomBtn = drawHUD._zoomBtn || {};
    var btnSize = isMobile ? 38 : 32;
    var btnPad = 8;
    // Desktop: chips share row 1 with the fullscreen button at top-right,
    // so reserve space for it. Mobile: chips sit on row 2 (below the FS
    // button vertically) and don't need the offset.
    zb.x = hudW - btnSize - btnPad - (isMobile ? 0 : fsBtnReserve);
    // Mobile: center the chip vertically in row 2. Desktop: park the chip
    // near the top of the bar (y=4) so the [Z] hint underneath fits inside
    // the bar instead of straddling into the play area.
    zb.y = isMobile ? row2Y + (rowH - btnSize) / 2 : 4;
    if (zb.y < 4) zb.y = 4;
    zb.w = btnSize;
    zb.h = btnSize;

    // ---- Teleporter chip (left of zoom button) ----
    // Always rendered; greys out when count = 0. Tap to use on mobile,
    // click or press [T] on desktop. Stays hidden when zero on mobile to
    // avoid teasing a useless button — desktop still shows it as a hint.
    var tb = drawHUD._teleBtn = drawHUD._teleBtn || {};
    var teleVisible = teleporters > 0 || !isMobile;
    if (teleVisible) {
      var teleW = isMobile ? 50 : 52;
      var teleH = btnSize;
      tb.x = zb.x - teleW - 6;
      tb.y = zb.y;
      tb.w = teleW;
      tb.h = teleH;
      var teleEnabled = teleporters > 0;
      // Background — purple glow when armed, dim when empty
      var teleGrad = ctx.createLinearGradient(0, tb.y, 0, tb.y + tb.h);
      if (teleEnabled) {
        teleGrad.addColorStop(0, 'rgba(140,90,220,0.45)');
        teleGrad.addColorStop(1, 'rgba(80,50,160,0.55)');
      } else {
        teleGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        teleGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
      }
      ctx.fillStyle = teleGrad;
      roundRect(ctx, tb.x, tb.y, tb.w, tb.h, 6, true);
      ctx.strokeStyle = teleEnabled ? 'rgba(200,160,255,0.7)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      roundRect(ctx, tb.x, tb.y, tb.w, tb.h, 6, false, true);

      // Glyph — stylized portal ring (concentric arcs) on the left
      var gx = tb.x + 12;
      var gy = tb.y + tb.h / 2;
      var glyphColor = teleEnabled ? '#e0c8ff' : 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = glyphColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(gx, gy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = glyphColor;
      ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
      // Subtle pulse when armed
      if (teleEnabled) {
        var pulse = (Math.sin(performance.now() / 400) + 1) * 0.5;
        ctx.strokeStyle = 'rgba(200,160,255,' + (0.15 + pulse * 0.25).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(gx, gy, 9 + pulse * 1.5, 0, Math.PI * 2); ctx.stroke();
      }

      // Count + key hint on the right
      ctx.fillStyle = teleEnabled ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 13px ' + UI_FONT;
      ctx.textAlign = 'left';
      ctx.fillText('×' + teleporters, gx + 12, gy + 4);
      ctx.textAlign = 'left';
    } else {
      tb.x = tb.y = tb.w = tb.h = 0;     // disable hit-test when hidden
    }

    // ---- Balloon chip (left of teleporter chip) ----
    // Same pattern as teleporter: visible always on desktop, hidden when
    // empty on mobile. Pink/peach to match the balloon visual.
    var bb = drawHUD._balloonBtn = drawHUD._balloonBtn || {};
    var balloonVisible = balloons > 0 || !isMobile;
    if (balloonVisible) {
      var balW = isMobile ? 50 : 52;
      var balH = btnSize;
      // Anchor to the left of whichever chip is currently to our right
      var anchorX = (tb.w > 0) ? tb.x : zb.x;
      bb.x = anchorX - balW - 6;
      bb.y = zb.y;
      bb.w = balW;
      bb.h = balH;
      var balEnabled = balloons > 0 && !roverMode;
      // Background — pink glow when armed
      var balGrad = ctx.createLinearGradient(0, bb.y, 0, bb.y + bb.h);
      if (balEnabled) {
        balGrad.addColorStop(0, 'rgba(255,140,140,0.45)');
        balGrad.addColorStop(1, 'rgba(180,60,60,0.55)');
      } else {
        balGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        balGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
      }
      ctx.fillStyle = balGrad;
      roundRect(ctx, bb.x, bb.y, bb.w, bb.h, 6, true);
      ctx.strokeStyle = balEnabled ? 'rgba(255,200,200,0.7)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      roundRect(ctx, bb.x, bb.y, bb.w, bb.h, 6, false, true);

      // Glyph — three little balloon circles
      var bgx = bb.x + 12;
      var bgy = bb.y + bb.h / 2;
      var bColor = balEnabled ? '#ffe0e0' : 'rgba(255,255,255,0.35)';
      ctx.fillStyle = bColor;
      ctx.beginPath(); ctx.arc(bgx - 3, bgy - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bgx + 3, bgy - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bgx,     bgy + 2, 3.2, 0, Math.PI * 2); ctx.fill();
      // Highlight specks
      if (balEnabled) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(bgx - 4, bgy - 3, 1, 1);
        ctx.fillRect(bgx + 2, bgy - 3, 1, 1);
        ctx.fillRect(bgx - 1, bgy + 1, 1, 1);
      }

      // Count + key hint
      ctx.fillStyle = balEnabled ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 13px ' + UI_FONT;
      ctx.textAlign = 'left';
      ctx.fillText('×' + balloons, bgx + 12, bgy + 4);
      ctx.textAlign = 'left';
    } else {
      bb.x = bb.y = bb.w = bb.h = 0;
    }

    // ---- Small bomb chip (left of balloon chip) ----
    // Same chip pattern as the other consumables. Red/orange to match
    // explosive iconography.
    var sb = drawHUD._bombSmallBtn = drawHUD._bombSmallBtn || {};
    var smallVisible = bombsSmall > 0 || !isMobile;
    if (smallVisible) {
      var sbW = isMobile ? 50 : 52;
      var sbH = btnSize;
      // Anchor to the left of whichever chip is currently to our right.
      var sbAnchorX = (bb.w > 0) ? bb.x : ((tb.w > 0) ? tb.x : zb.x);
      sb.x = sbAnchorX - sbW - 6;
      sb.y = zb.y;
      sb.w = sbW;
      sb.h = sbH;
      var sbEnabled = bombsSmall > 0;
      var sbGrad = ctx.createLinearGradient(0, sb.y, 0, sb.y + sb.h);
      if (sbEnabled) {
        sbGrad.addColorStop(0, 'rgba(232,74,58,0.45)');
        sbGrad.addColorStop(1, 'rgba(160,30,20,0.55)');
      } else {
        sbGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        sbGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
      }
      ctx.fillStyle = sbGrad;
      roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 6, true);
      ctx.strokeStyle = sbEnabled ? 'rgba(255,180,140,0.7)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 6, false, true);

      // Glyph — STICK OF DYNAMITE (small charge): tall narrow rectangle
      // with a fuse and spark. Distinct silhouette from the round large
      // bomb so the two HUD chips read at a glance.
      var sbgx = sb.x + 12;
      var sbgy = sb.y + sb.h / 2;
      var sbColor = sbEnabled ? '#ffd2c2' : 'rgba(255,255,255,0.35)';
      // TNT stick body
      ctx.fillStyle = sbColor;
      ctx.fillRect(sbgx - 3, sbgy - 5, 6, 11);
      // Lighter "TNT label" band across the middle
      ctx.fillStyle = sbEnabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)';
      ctx.fillRect(sbgx - 3, sbgy - 1, 6, 3);
      // Fuse — short curve up-and-right from the top
      ctx.strokeStyle = sbColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sbgx, sbgy - 5);
      ctx.quadraticCurveTo(sbgx + 3, sbgy - 8, sbgx + 5, sbgy - 9);
      ctx.stroke();
      if (sbEnabled) {
        ctx.fillStyle = '#FFD27A';
        ctx.beginPath(); ctx.arc(sbgx + 5, sbgy - 9, 1.4, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = sbEnabled ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 13px ' + UI_FONT;
      ctx.textAlign = 'left';
      ctx.fillText('×' + bombsSmall, sbgx + 12, sbgy + 4);
      ctx.textAlign = 'left';
    } else {
      sb.x = sb.y = sb.w = sb.h = 0;
    }

    // ---- Large bomb chip (left of small bomb chip) ----
    var lb = drawHUD._bombLargeBtn = drawHUD._bombLargeBtn || {};
    var largeVisible = bombsLarge > 0 || !isMobile;
    if (largeVisible) {
      var lbW = isMobile ? 50 : 52;
      var lbH = btnSize;
      var lbAnchorX = (sb.w > 0) ? sb.x : ((bb.w > 0) ? bb.x : ((tb.w > 0) ? tb.x : zb.x));
      lb.x = lbAnchorX - lbW - 6;
      lb.y = zb.y;
      lb.w = lbW;
      lb.h = lbH;
      var lbEnabled = bombsLarge > 0;
      var lbGrad = ctx.createLinearGradient(0, lb.y, 0, lb.y + lb.h);
      if (lbEnabled) {
        lbGrad.addColorStop(0, 'rgba(255,138,42,0.5)');
        lbGrad.addColorStop(1, 'rgba(180,70,10,0.6)');
      } else {
        lbGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        lbGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
      }
      ctx.fillStyle = lbGrad;
      roundRect(ctx, lb.x, lb.y, lb.w, lb.h, 6, true);
      ctx.strokeStyle = lbEnabled ? 'rgba(255,200,140,0.75)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      roundRect(ctx, lb.x, lb.y, lb.w, lb.h, 6, false, true);

      // Glyph — CLASSIC ROUND BOMB (large charge): dark sphere body, an
      // "X" marker hinting at the 3×3 blast area, fuse + spark, plus a
      // soft pulsing danger halo. Distinct from the dynamite stick of
      // the small charge so the two read at a glance.
      var lbgx = lb.x + 12;
      var lbgy = lb.y + lb.h / 2;
      var lbColor = lbEnabled ? '#ffe0c2' : 'rgba(255,255,255,0.35)';
      if (lbEnabled) {
        var lpulse = (Math.sin(performance.now() / 350) + 1) * 0.5;
        ctx.fillStyle = 'rgba(255,160,80,' + (0.15 + lpulse * 0.18).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(lbgx, lbgy + 1, 9 + lpulse * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      // Round body
      ctx.fillStyle = lbColor;
      ctx.beginPath(); ctx.arc(lbgx, lbgy + 1, 6, 0, Math.PI * 2); ctx.fill();
      // X mark — small crossed lines on the body. Drawn dark against the
      // light glyph color so the cross reads clearly.
      ctx.strokeStyle = 'rgba(40,18,8,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lbgx - 2.4, lbgy - 1); ctx.lineTo(lbgx + 2.4, lbgy + 3);
      ctx.moveTo(lbgx + 2.4, lbgy - 1); ctx.lineTo(lbgx - 2.4, lbgy + 3);
      ctx.stroke();
      // Fuse — short curve up-and-right, slightly longer than the small bomb's
      ctx.strokeStyle = lbColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lbgx + 3, lbgy - 4);
      ctx.quadraticCurveTo(lbgx + 6, lbgy - 7, lbgx + 8, lbgy - 9);
      ctx.stroke();
      if (lbEnabled) {
        ctx.fillStyle = '#FFD27A';
        ctx.beginPath(); ctx.arc(lbgx + 8, lbgy - 9, 1.8, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = lbEnabled ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 13px ' + UI_FONT;
      ctx.textAlign = 'left';
      ctx.fillText('×' + bombsLarge, lbgx + 12, lbgy + 4);
      ctx.textAlign = 'left';
    } else {
      lb.x = lb.y = lb.w = lb.h = 0;
    }

    var zoomedIn = (zoomMode === 'in');
    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, zb.x, zb.y, zb.w, zb.h, 6, true);
    ctx.strokeStyle = 'rgba(255,210,120,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, zb.x, zb.y, zb.w, zb.h, 6, false, true);

    // Magnifier icon — circle + handle, with + or − inside depending on
    // current state. The symbol shows what the CURRENT zoom is, so the user
    // sees "I'm zoomed in (+)" and tapping toggles to out (−).
    var mcx = zb.x + zb.w / 2 - 2;
    var mcy = zb.y + zb.h / 2 - 2;
    var mr = isMobile ? 8 : 7;
    ctx.strokeStyle = '#FFD27A';
    ctx.lineWidth = isMobile ? 1.8 : 1.6;
    ctx.beginPath();
    ctx.arc(mcx, mcy, mr, 0, Math.PI * 2);
    ctx.stroke();
    // Handle
    ctx.beginPath();
    ctx.moveTo(mcx + mr * 0.7, mcy + mr * 0.7);
    ctx.lineTo(mcx + mr * 1.5, mcy + mr * 1.5);
    ctx.stroke();
    // Inside symbol
    ctx.lineWidth = isMobile ? 1.7 : 1.5;
    var sym = isMobile ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(mcx - sym, mcy);
    ctx.lineTo(mcx + sym, mcy);
    if (zoomedIn) {
      ctx.moveTo(mcx, mcy - sym);
      ctx.lineTo(mcx, mcy + sym);
    }
    ctx.stroke();

    // Build version + FPS counter (bottom-right, tiny). Lets playtest
    // screenshots be matched to a specific commit. Bumped in GAME_VERSION
    // at the top of the file with each shipped change.
    ctx.font = 'bold 9px ' + UI_FONT;
    ctx.fillStyle = 'rgba(255,210,120,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText(GAME_VERSION, hudW - 6, hudH - 6);
    ctx.fillText(perfFps + ' fps', hudW - 6, hudH - 17);
    ctx.textAlign = 'left';

    ctx.restore();

    // Hit-test bounds are stored in *logical* (pre-scale) coordinates above.
    // Mouse handlers compare against canvas-pixel coords, so scale the
    // stored rects up to canvas pixels now that ctx is restored.
    if (hudScale !== 1) {
      var btns = [drawHUD._zoomBtn, drawHUD._teleBtn, drawHUD._balloonBtn, drawHUD._bombSmallBtn, drawHUD._bombLargeBtn];
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b && b.w > 0) { b.x *= hudScale; b.y *= hudScale; b.w *= hudScale; b.h *= hudScale; }
      }
    }
  }

