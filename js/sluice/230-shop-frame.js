  // ========================================================================
  // SHOP ARCHITECTURE  (USE_NEW_SHOP_UI feature flag)
  // ========================================================================
  //   USE_NEW_SHOP_UI = true   → v26.18 STORE: one catalog modal on the
  //       shared UI kit (245) floating over the fizzed-out live world.
  //       Spec + pointer routing in 250, workshop items in 270, shelf
  //       items in 280. newShopDrawBoard() (260) is the flag-off Trade
  //       Board's bespoke page, reached as a MARKET tab when its flag
  //       is on.
  //   USE_NEW_SHOP_UI = false  → the EXACT pre-v14.1 shop is restored:
  //       drawShopRoom() sprite hub, drawWorkshopSubPage(),
  //       drawShelfSubPage(), board = "COMING SOON". The old code paths
  //       are untouched and still branch-reachable — flip the flag false
  //       to revert instantly. Everything from here to the "NEW SHOP"
  //       banner in 240 belongs to that legacy path.
  // ========================================================================
  var USE_NEW_SHOP_UI = true;

  // ========================================================================
  // v11.13 — Walk-up shop interior (UI_STYLE.md §15).
  //
  // Phase B: theme registry + room geometry + three station tiles +
  // sub-page push/pop with brass back-arrow. Sub-page bodies are
  // placeholders; Phase C–G fills them with the real workshop, shelf,
  // and board. The room renders above the console (which stays visible
  // per §15.6 — fuel/hull/depth still readable while shopping).
  // ========================================================================

  // §15.5 theme registry. New towns add an entry here, the room renders
  // identically with swapped chrome. v11 launches with soviet only.
  var SHOP_THEMES = {
    soviet: {
      label:           'SOVIET',
      wallCream:       '#d6b66a',  // warm beige wall plaster
      wallCreamHi:     '#e8c878',
      wallCreamLo:     '#9c7838',
      wainscot:        '#5c2820',  // dark red wainscoting band at wall bottom
      wainscotHi:      '#7a3828',
      wainscotLo:      '#3a1410',
      floorPlank:      '#7a4828',  // wood plank floor
      floorPlankHi:    '#9c6438',
      floorPlankLo:    '#4a2818',
      ironStrip:       '#2a2520',  // iron bolt-strip below floor
      ironStripHi:     '#4a4540',
      ironStripBolt:   '#5a5550',
      beamWood:        '#3a2618',  // top/side post wood
      beamWoodHi:      '#5a3a22',
      beamWoodLo:      '#1a0e08',
      beamIron:        '#1f1812',  // iron brackets on posts
      beamIronHi:      '#3a3530',
      bannerBg:        '#8c2820',  // red sign banner across station top
      bannerBgHi:      '#a83830',
      bannerBgLo:      '#5a1810',
      bannerFrame:     '#3a3530',  // iron L-brackets on banner
      stencilWarm:     '#f0d088',  // warm cream stencil on banners
      stencilCool:     '#1a0e08',  // dark stencil on light surfaces
      pegboard:        '#6a4828',  // workshop pegboard brown
      pegboardHole:    '#2a1810',
      pegboardFrame:   '#3a3530',
      shelfDark:       '#1a0e08',  // shelf interior dark
      shelfWood:       '#4a2818',  // shelf wood boards
      shelfWoodHi:     '#7a4828',
      flagRed:         '#a01a14',  // soviet flag
      flagRedHi:       '#c83830',
      flagGold:        '#e8b830',
      flagPole:        '#3a3530',
      lampShade:       '#1a1612',
      lampShadeHi:     '#3a3530',
      lampBulb:        '#ffd060',
      lampGlow:        'rgba(255,200,90,0.18)',
      accentColor:     '#a01a14',
      paperBg:         '#e8d098',  // cream paper / sign for COMING SOON
      paperShadow:     '#9c7838'
    },
    western: {
      label:           'WESTERN',
      wallCream:       '#c8a878',
      wallCreamHi:     '#dac08c',
      wallCreamLo:     '#8c6838',
      wainscot:        '#4a2818',
      wainscotHi:      '#6a3a20',
      wainscotLo:      '#2a1410',
      floorPlank:      '#7a4828',
      floorPlankHi:    '#9c6438',
      floorPlankLo:    '#4a2818',
      ironStrip:       '#2a2520',
      ironStripHi:     '#4a4540',
      ironStripBolt:   '#5a5550',
      beamWood:        '#5a3a22',
      beamWoodHi:      '#7a5028',
      beamWoodLo:      '#2a1810',
      beamIron:        '#1f1812',
      beamIronHi:      '#3a3530',
      bannerBg:        '#7a4828',
      bannerBgHi:      '#9c6438',
      bannerBgLo:      '#4a2818',
      bannerFrame:     '#5a3a22',
      stencilWarm:     '#f0d088',
      stencilCool:     '#1a0e08',
      pegboard:        '#7a5828',
      pegboardHole:    '#3a2810',
      pegboardFrame:   '#5a3a22',
      shelfDark:       '#2a1810',
      shelfWood:       '#5a3a22',
      shelfWoodHi:     '#8a6438',
      flagRed:         '#d4a838',   // sheriff gold star uses this
      flagRedHi:       '#f0d088',
      flagGold:        '#9c7838',
      flagPole:        '#3a3530',
      lampShade:       '#1a1612',
      lampShadeHi:     '#3a3530',
      lampBulb:        '#ffd060',
      lampGlow:        'rgba(255,200,90,0.18)',
      accentColor:     '#d4a838',
      paperBg:         '#e8d098',
      paperShadow:     '#9c7838'
    }
  };
  var currentTown = 'soviet';   // future towns set this to switch chrome
  function shopTheme() { return SHOP_THEMES[currentTown] || SHOP_THEMES.soviet; }

  // v11.15 — Sprite-based shop interior. The procedural drawShopRoom is
  // kept as a fallback so the shop stays usable for towns whose art
  // hasn't landed yet. SHOP_SPRITES maps each town to its background
  // image; SHOP_HIT_RECTS defines the work-area click targets as
  // FRACTIONS of the room rect so they scale with the canvas.
  var SHOP_SPRITES = {
    soviet:  {
      background: 'assets/shop/soviet/background.png',
      masks: {
        workshop: 'assets/shop/soviet/masks/workshop.png',
        shelf:    'assets/shop/soviet/masks/shelf.png',
        board:    'assets/shop/soviet/masks/board.png',
        leave:    'assets/shop/soviet/masks/leave.png'
      }
    },
    western: { background: 'assets/shop/western/background.png' }
  };
  function getShopStationMask(stationId) {
    var spec = SHOP_SPRITES[currentTown];
    if (!spec || !spec.masks || !spec.masks[stationId]) return null;
    return loadShopSprite(spec.masks[stationId]);
  }

  // v11.18 — Programmatic mask extraction from the background image.
  // For each station we define a bounding box + seed points (positions
  // inside the station where we sample the local color). At first hover,
  // we flood-fill from each seed, constrained to the bbox, with a color-
  // distance tolerance. The union of all flood fills = the silhouette.
  // Cached forever per (town, station, image-natural-size) so the heavy
  // pass runs only once.
  //
  // Tuning notes if a station's outline looks wrong:
  //  - bbox too loose → bleeds into adjacent regions (tighten fy/fx)
  //  - bbox too tight → outline crops the station (loosen)
  //  - seeds miss a sub-region → add a seed inside the missed area
  //  - tolerance too low → outline is patchy / has holes
  //  - tolerance too high → bleeds into adjacent similar colors
  var SHOP_STATION_EXTRACTION = {
    soviet: {
      workshop: {
        bbox: { fx0: 0.04, fy0: 0.20, fx1: 0.38, fy1: 0.84 },
        seeds: [
          { fx: 0.16, fy: 0.62 },   // workbench wood top
          { fx: 0.18, fy: 0.74 },   // drawer cabinet wood
          { fx: 0.22, fy: 0.50 },   // drill body (grey/metal)
          { fx: 0.18, fy: 0.42 },   // lamp arm
          { fx: 0.14, fy: 0.36 },   // pegboard
          { fx: 0.10, fy: 0.40 }    // hanging tool
        ],
        tolerance: 55
      },
      shelf: {
        // Tight upper bound so the clerk's torso is outside the search area;
        // wide right bound so right-side items are reachable.
        bbox: { fx0: 0.32, fy0: 0.60, fx1: 0.96, fy1: 1.00 },
        seeds: [
          // Wood counter top — many x positions for continuous coverage
          { fx: 0.36, fy: 0.66 },
          { fx: 0.42, fy: 0.66 },
          { fx: 0.48, fy: 0.66 },
          { fx: 0.55, fy: 0.66 },
          { fx: 0.62, fy: 0.66 },
          { fx: 0.70, fy: 0.66 },
          { fx: 0.78, fy: 0.66 },
          { fx: 0.86, fy: 0.66 },
          { fx: 0.92, fy: 0.66 },
          // Wood counter front face — one seed per plank (planks ~7% wide)
          { fx: 0.34, fy: 0.85 },
          { fx: 0.40, fy: 0.85 },
          { fx: 0.46, fy: 0.85 },
          { fx: 0.52, fy: 0.85 },
          { fx: 0.58, fy: 0.85 },
          { fx: 0.64, fy: 0.85 },
          { fx: 0.70, fy: 0.85 },
          { fx: 0.76, fy: 0.85 },
          { fx: 0.82, fy: 0.85 },
          { fx: 0.88, fy: 0.85 },
          { fx: 0.94, fy: 0.85 },
          // Items (each distinct color/shape gets a seed)
          { fx: 0.42, fy: 0.62 },   // red jerrycan
          { fx: 0.50, fy: 0.62 },   // dynamite bundle (red sticks)
          { fx: 0.58, fy: 0.62 },   // white medkit
          { fx: 0.68, fy: 0.62 },   // blue REPAIR KIT
          { fx: 0.76, fy: 0.62 },   // brass canister
          { fx: 0.84, fy: 0.62 },   // battery / right cylinder
          { fx: 0.90, fy: 0.62 }    // rightmost item
        ],
        // Tightened tolerance — wood (#6a4828) and khaki coat (#8a7028) are
        // ~51 RGB units apart, so 40 leaves a safe margin against clerk bleed.
        tolerance: 40
      },
      board: {
        bbox: { fx0: 0.74, fy0: 0.16, fx1: 0.99, fy1: 0.58 },
        seeds: [
          { fx: 0.86, fy: 0.32 },   // chalkboard slate
          { fx: 0.78, fy: 0.20 },   // brass frame
          { fx: 0.95, fy: 0.20 },   // brass frame other side
          { fx: 0.92, fy: 0.48 }    // COMING SOON paper
        ],
        tolerance: 50
      },
      leave: {
        bbox: { fx0: 0.39, fy0: 0.16, fx1: 0.54, fy1: 0.58 },
        seeds: [
          { fx: 0.46, fy: 0.30 },   // door body grey
          { fx: 0.46, fy: 0.45 }    // door lower
        ],
        tolerance: 45
      }
    }
  };
  var _shopExtractedMaskCache = {};   // key 'town|station|w|h' → canvas
  function extractStationMaskFromBackground(stationId) {
    var spec = SHOP_STATION_EXTRACTION[currentTown];
    if (!spec || !spec[stationId]) return null;
    var bgPath = SHOP_SPRITES[currentTown] && SHOP_SPRITES[currentTown].background;
    var bg = bgPath ? loadShopSprite(bgPath) : null;
    if (!bg || !bg.complete || bg.naturalWidth === 0) return null;
    var iw = bg.naturalWidth, ih = bg.naturalHeight;
    var key = currentTown + '|' + stationId + '|' + iw + 'x' + ih;
    if (_shopExtractedMaskCache[key]) return _shopExtractedMaskCache[key];

    var ext = spec[stationId];
    // Read background pixels into a typed array (one-time per cache miss)
    var srcCanvas = document.createElement('canvas');
    srcCanvas.width = iw; srcCanvas.height = ih;
    var srcCtx = srcCanvas.getContext('2d');
    srcCtx.imageSmoothingEnabled = false;
    srcCtx.drawImage(bg, 0, 0);
    var src;
    try { src = srcCtx.getImageData(0, 0, iw, ih).data; }
    catch (e) { return null; }   // CORS or other read failure

    // Build the mask via flood fill
    var maskCanvas = document.createElement('canvas');
    maskCanvas.width = iw; maskCanvas.height = ih;
    var maskCtx = maskCanvas.getContext('2d');
    var maskImg = maskCtx.createImageData(iw, ih);
    var mask = maskImg.data;
    var visited = new Uint8Array(iw * ih);

    var bx0 = Math.max(0, Math.floor(ext.bbox.fx0 * iw));
    var by0 = Math.max(0, Math.floor(ext.bbox.fy0 * ih));
    var bx1 = Math.min(iw - 1, Math.floor(ext.bbox.fx1 * iw));
    var by1 = Math.min(ih - 1, Math.floor(ext.bbox.fy1 * ih));
    var tol2 = ext.tolerance * ext.tolerance;

    // Multi-seed flood fill — each seed runs its own pass with that
    // seed's reference color. Shares the `visited` bitmap so seeds
    // don't double-process. Mask = union of all reachable pixels per
    // (seed-color, bbox, tolerance).
    for (var s = 0; s < ext.seeds.length; s++) {
      var sx = Math.floor(ext.seeds[s].fx * iw);
      var sy = Math.floor(ext.seeds[s].fy * ih);
      if (sx < bx0 || sx > bx1 || sy < by0 || sy > by1) continue;
      var seedI = (sy * iw + sx) * 4;
      var sR = src[seedI], sG = src[seedI + 1], sB = src[seedI + 2];
      var stack = [sx, sy];
      while (stack.length > 0) {
        var py = stack.pop();
        var px = stack.pop();
        if (px < bx0 || px > bx1 || py < by0 || py > by1) continue;
        var vi = py * iw + px;
        if (visited[vi]) continue;
        var pi = vi * 4;
        var dr = src[pi] - sR;
        var dg = src[pi + 1] - sG;
        var db = src[pi + 2] - sB;
        if (dr * dr + dg * dg + db * db > tol2) continue;
        visited[vi] = 1;
        mask[pi] = 255;
        mask[pi + 1] = 255;
        mask[pi + 2] = 255;
        mask[pi + 3] = 255;
        if (px + 1 <= bx1) { stack.push(px + 1); stack.push(py); }
        if (px - 1 >= bx0) { stack.push(px - 1); stack.push(py); }
        if (py + 1 <= by1) { stack.push(px); stack.push(py + 1); }
        if (py - 1 >= by0) { stack.push(px); stack.push(py - 1); }
      }
    }

    maskCtx.putImageData(maskImg, 0, 0);
    _shopExtractedMaskCache[key] = maskCanvas;
    return maskCanvas;
  }
  // Wrapper: prefer a user-provided mask PNG; otherwise extract from bg.
  function getOrExtractStationMask(stationId) {
    var pngMask = getShopStationMask(stationId);
    if (pngMask && pngMask.complete && pngMask.naturalWidth > 0) return pngMask;
    return extractStationMaskFromBackground(stationId);
  }

  var loadedShopSprites = {};
  function loadShopSprite(path) {
    if (loadedShopSprites[path]) return loadedShopSprites[path];
    var img = new Image();
    img.src = path;
    loadedShopSprites[path] = img;
    return img;
  }
  // Hit-rects expressed as fractions of the room rect (0..1) so they
  // auto-scale to any canvas size. Tuned against the v1 Soviet
  // background. If a future town's composition shifts the work-area
  // positions, override per-town in SHOP_SPRITES[town].hitRects.
  var SHOP_HIT_RECTS_DEFAULT = {
    workshop: { fx0: 0.00, fy0: 0.18, fx1: 0.36, fy1: 0.74 },
    shelf:    { fx0: 0.20, fy0: 0.55, fx1: 0.74, fy1: 1.00 },
    board:    { fx0: 0.74, fy0: 0.04, fx1: 1.00, fy1: 0.58 },
    leave:    { fx0: 0.40, fy0: 0.18, fx1: 0.52, fy1: 0.55 }
  };
  function shopHitRects() {
    var perTown = SHOP_SPRITES[currentTown] && SHOP_SPRITES[currentTown].hitRects;
    return perTown || SHOP_HIT_RECTS_DEFAULT;
  }
  function shopWorkAreaRect(id) {
    var L = shopRoomLayout();
    var roomW = viewW;
    var roomH = L.canvasBottom;
    var f = shopHitRects()[id];
    if (!f) return { x: 0, y: 0, w: 0, h: 0, id: id };
    return {
      x: Math.floor(f.fx0 * roomW),
      y: Math.floor(f.fy0 * roomH),
      w: Math.ceil((f.fx1 - f.fx0) * roomW),
      h: Math.ceil((f.fy1 - f.fy0) * roomH),
      id: id
    };
  }

  // §15 walk-up geometry, redrawn in v11.14 to match the reference frame:
  // top wood beam → cream wall above red wainscot → wood plank floor → iron
  // bolt strip → console. Corner posts on left/right span the wall area.
  // Three station tiles sit on the wall, ordered WORKSHOP / BOARD / SHELF
  // (board centered, flag flies above it).
  function shopRoomLayout() {
    var ch = consoleHeight();
    var canvasBottom = viewH - ch;
    var topBeamH    = 28;
    var cornerPostW = 28;
    var floorStripH = 14;
    var floorPlankH = Math.floor(canvasBottom * 0.13);  // ~80px on standard
    if (floorPlankH < 56) floorPlankH = 56;
    var wainscotH   = 22;
    var wallTop     = topBeamH;
    var wallBottom  = canvasBottom - floorStripH - floorPlankH - wainscotH;
    return {
      canvasBottom:  canvasBottom,
      topBeamH:      topBeamH,
      cornerPostW:   cornerPostW,
      wallTop:       wallTop,
      wallBottom:    wallBottom,
      wainscotTop:   wallBottom,
      wainscotH:     wainscotH,
      floorTop:      wallBottom + wainscotH,
      floorH:        floorPlankH,
      floorStripTop: canvasBottom - floorStripH,
      floorStripH:   floorStripH
    };
  }
  function shopStationRects() {
    return {
      workshop: shopWorkAreaRect('workshop'),
      board:    shopWorkAreaRect('board'),
      shelf:    shopWorkAreaRect('shelf')
    };
  }
  function shopLeaveBtnRect() {
    return shopWorkAreaRect('leave');
  }
  function shopBackArrowRect() {
    // Wide enough for chevron + "BACK" stencil at scale 1 (chevron ~16 +
    // text ~24 + padding) without clipping the K.
    return { x: 12, y: 12, w: 68, h: 32 };
  }

  // Hovered station id ('workshop'|'shelf'|'board'|null), driven by mouse on
  // PC and last touch on mobile. Used to brighten the station frame.
  var shopHoverStation = null;

  // ----- Sub-renderers used by drawShopRoom -----
  function drawLampGlow(cx, topY, T, wallTop, wallBottom) {
    // Soft warm radial halo on the wall behind/below the lamp.
    var bulbY = topY + 18 + 13;
    var r = 90;
    var g = ctx.createRadialGradient(cx, bulbY, 4, cx, bulbY, r);
    g.addColorStop(0, 'rgba(255,200,90,0.30)');
    g.addColorStop(0.4, 'rgba(255,180,80,0.14)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, wallTop, r * 2, wallBottom - wallTop);
  }
  // Sprite-based renderer (v11.15). Loads the town's background PNG and
  // composites overlay text + hover highlights on top. Falls back to the
  // procedural drawShopRoomProcedural if the sprite isn't loaded yet.
  function drawShopRoom() {
    var T = shopTheme();
    var L = shopRoomLayout();
    var spriteSpec = SHOP_SPRITES[currentTown];
    var bg = spriteSpec ? loadShopSprite(spriteSpec.background) : null;
    var bgReady = bg && bg.complete && bg.naturalWidth > 0;
    if (!bgReady) {
      drawShopRoomProcedural();
      return;
    }
    // Draw the background scaled to fill the room rect, nearest-neighbor
    // for crisp pixels at any device resolution.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, viewW, L.canvasBottom);

    // v11.26 — Hover outline + label on floor stations REMOVED per user
    // feedback. The shop background image already has gold-trimmed frames
    // around each station; the chunky yellow overlay was redundant. Click
    // detection remains (hit-rects via shopWorkAreaRect).

    // Dev-mode overlay: show every hit-rect with a dashed outline
    if (devMode) {
      var ids = ['workshop', 'shelf', 'board', 'leave'];
      ctx.lineWidth = 1;
      for (var i = 0; i < ids.length; i++) {
        var hr = shopWorkAreaRect(ids[i]);
        ctx.strokeStyle = ids[i] === 'leave' ? '#ff4030' : '#ffd060';
        if (ctx.setLineDash) ctx.setLineDash([4, 4]);
        ctx.strokeRect(hr.x + 0.5, hr.y + 0.5, hr.w - 1, hr.h - 1);
        if (ctx.setLineDash) ctx.setLineDash([]);
        drawStencilText(ids[i].toUpperCase(), hr.x + 4, hr.y + 4, 1, ids[i] === 'leave' ? '#ff4030' : '#ffd060');
      }
    }
  }

  // Procedural fallback — minimal placeholder shown when a town's
  // background sprite isn't loaded yet (e.g. western before its art
  // lands, or the soviet sprite while it's still loading on slow
  // connections). Renders a dim plate-steel backdrop with a "SHOP ART
  // PENDING" stencil so interactions still work.
  function drawShopRoomProcedural() {
    var L = shopRoomLayout();
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, viewW, L.canvasBottom);
    ctx.fillStyle = '#2a2420';
    for (var sy = 32; sy < L.canvasBottom; sy += 32) {
      ctx.fillRect(0, sy, viewW, 1);
    }
    var msg = 'SHOP ART PENDING';
    var sub = '(' + currentTown.toUpperCase() + ' THEME)';
    var mw = stencilTextWidth(msg, 3);
    var sw = stencilTextWidth(sub, 1);
    drawStencilText(msg, Math.floor((viewW - mw) / 2), Math.floor(L.canvasBottom / 2 - 24), 3, '#d4a838');
    drawStencilText(sub, Math.floor((viewW - sw) / 2), Math.floor(L.canvasBottom / 2 + 16), 1, '#7d6d4d');
  }

  function drawShopBackArrow() {
    var r = shopBackArrowRect();
    var T = shopTheme();
    // Brass plate
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = '#5a3e1c';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
    // Arrow glyph — left-pointing chevron
    var ax = r.x + 10, ay = r.y + r.h / 2;
    ctx.fillStyle = '#1f1408';
    for (var aoff = 0; aoff < 7; aoff++) {
      ctx.fillRect(ax + aoff, ay - aoff - 1, 2, 2);
      ctx.fillRect(ax + aoff, ay + aoff - 1, 2, 2);
    }
    // "BACK" stencil
    drawStencilText('BACK', r.x + 18, r.y + Math.floor((r.h - 7) / 2), 1, '#1f1408');
  }

  // ========================================================================
  // v11.20 — Shop sub-pages, sexy modal pass.
  // Materials catalog from UI_STYLE.md §4 driving every surface: plate
  // steel for the modal frame, etched brass for nameplates/lever
  // mounts, wood for item compartments, cream paper for price tags
  // pinned with brass tacks. §5.5 lever switches confirm purchases.
  // Each item compartment reads as a physical display niche, not a UI
  // card. Subtle wood grain, drop shadows, hover glow, lever pull
  // animation, coin splash on buy.
  // ========================================================================
  var SHELF_BUY_RECTS = [];      // populated each frame; consumed by handler
  var shopHoverShelfItem = null; // hovered item key in the shelf modal
  var shelfBuyFx = { key: null, t: 0, success: false };
  var shelfCoins = [];           // coin splash particles {x, y, vx, vy, t, size, phase}
  // ---- v11.21 polish state ----
  var shopShelfModalEnterT = 0;  // 0..1 modal entrance progress
  var shelfHoverFadeT = {};      // per-item hover fade progress (0..1)
  var shelfStockFlashes = [];    // "+1" stock floaters {key, x, y, t}
  var cashFlashFx = { color: null, t: 0 };  // cash readout flash on buy/fail
  var shelfBreathT = 0;          // 0..2π running phase for lever idle breathing
  var shelfReceipt = { text: '', t: 0 };   // {text, t} — paper strip at modal bottom

  // ---- Material helpers for the modal ----
  function drawIronBracket(x, y, w, h, mirrorH, mirrorV) {
    // L-shape iron bracket; mirrorH/V flip the legs of the L
    ctx.fillStyle = '#1f1812';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3a3530';
    if (!mirrorH && !mirrorV) {
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x, y, 2, h);
    } else if (mirrorH && !mirrorV) {
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x + w - 2, y, 2, h);
    } else if (!mirrorH && mirrorV) {
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.fillRect(x, y, 2, h);
    } else {
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.fillRect(x + w - 2, y, 2, h);
    }
    // 4 bolt heads on the bracket
    function bolt(bx, by) {
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(bx - 1, by - 1, 4, 4);
      ctx.fillStyle = '#7a7570';
      ctx.fillRect(bx, by, 2, 2);
      ctx.fillStyle = '#a8a8a0';
      ctx.fillRect(bx, by, 1, 1);
    }
    bolt(x + 4, y + 4);
    bolt(x + w - 6, y + 4);
    bolt(x + 4, y + h - 6);
    bolt(x + w - 6, y + h - 6);
  }
  function drawBrassCornerL(x, y, mirrorH, mirrorV) {
    // Small 12x12 brass corner bracket
    var sz = 12;
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(x, y, sz, sz);
    ctx.fillStyle = '#7a5a2c';
    if (!mirrorH && !mirrorV) {
      ctx.fillRect(x, y, sz, 3);
      ctx.fillRect(x, y, 3, sz);
    } else if (mirrorH && !mirrorV) {
      ctx.fillRect(x, y, sz, 3);
      ctx.fillRect(x + sz - 3, y, 3, sz);
    } else if (!mirrorH && mirrorV) {
      ctx.fillRect(x, y + sz - 3, sz, 3);
      ctx.fillRect(x, y, 3, sz);
    } else {
      ctx.fillRect(x, y + sz - 3, sz, 3);
      ctx.fillRect(x + sz - 3, y, 3, sz);
    }
    ctx.fillStyle = '#a07c40';
    if (!mirrorH && !mirrorV) ctx.fillRect(x + 1, y + 1, sz - 1, 1);
    if (mirrorH && !mirrorV)  ctx.fillRect(x, y + 1, sz - 1, 1);
    if (!mirrorH && mirrorV)  ctx.fillRect(x + 1, y + sz - 2, sz - 1, 1);
    if (mirrorH && mirrorV)   ctx.fillRect(x, y + sz - 2, sz - 1, 1);
  }
  function drawBrassBolt(cx, cy) {
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    ctx.fillStyle = '#5a4220';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(cx - 1, cy - 1, 2, 1);
    ctx.fillStyle = '#fff0c0';
    ctx.fillRect(cx - 1, cy - 1, 1, 1);
  }

  function drawConsumableIconBig(kind, cx, cy, size) {
    // Larger, chunkier pixel-art versions of the consumable icons.
    // Each renders centered at (cx, cy) within a `size` × `size` bbox.
    var s = size;
    // Idle animation runs off nsRoomT (the live shop clock, in seconds).
    // shelfBreathT only ticks on the dead legacy shelf, so the icons were
    // frozen on the live page; nsRoomT advances every shop frame.
    var t = (typeof nsRoomT === 'number') ? nsRoomT : 0;
    if (kind === 'teleporter') {
      // Brass beacon lantern with a glowing turquoise glass core (the old
      // purple crystal was off-palette and read as fantasy magic).
      var w = Math.floor(s * 0.52), h = Math.floor(s * 0.60);
      var x = cx - Math.floor(w / 2), y = cy - Math.floor(h / 2) + 4;
      var pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
      // Banded glow behind the glass (stepped alpha, no smooth blur)
      var glowR = Math.floor(w * 0.9), glowY = y + Math.floor(h * 0.45), glowA = 0.10 + 0.10 * pulse;
      for (var tgb = 5; tgb >= 1; tgb--) {
        var tgf = tgb / 5;
        ctx.fillStyle = 'rgba(120,200,220,' + (glowA * (1 - tgf) * (1 - tgf)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(cx, glowY, 6 + (glowR - 6) * tgf, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(x - 2, y - 6, w + 4, h + 12);
      // Brass foot + cap
      ctx.fillStyle = '#4f3a1b'; ctx.fillRect(x, y + h - 6, w, 6);
      ctx.fillStyle = '#7a5a2c'; ctx.fillRect(x + 1, y + h - 6, w - 2, 2);
      ctx.fillStyle = '#4f3a1b'; ctx.fillRect(x, y - 6, w, 7);
      ctx.fillStyle = '#7a5a2c'; ctx.fillRect(x + 1, y - 5, w - 2, 3);
      ctx.fillStyle = '#a07c40'; ctx.fillRect(x + 1, y - 5, w - 2, 1);
      // Glass body
      var gx = x + 3, gy = y, gw = w - 6, gh = h - 6;
      ctx.fillStyle = '#16323a'; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = '#3f6470'; ctx.fillRect(gx + 1, gy + 2, gw - 2, gh - 6);
      ctx.fillStyle = '#5a8090'; ctx.fillRect(gx + 2, gy + Math.floor(gh * 0.30), gw - 4, Math.floor(gh * 0.34));
      if (pulse > 0.5) { ctx.fillStyle = '#8fbecb'; ctx.fillRect(gx + 2, gy + Math.floor(gh * 0.30), gw - 4, 2); }
      ctx.fillStyle = '#bfe6ef'; ctx.fillRect(gx + 3, gy + 3, 2, Math.floor(gh * 0.4));
      // Brass corner posts + ring handle
      ctx.fillStyle = '#7a5a2c'; ctx.fillRect(x, y - 2, 3, h - 2); ctx.fillRect(x + w - 3, y - 2, 3, h - 2);
      ctx.fillStyle = '#a07c40'; ctx.fillRect(x, y - 2, 1, h - 2);
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(cx - 5, y - 12, 10, 3);
      ctx.fillStyle = '#a07c40'; ctx.fillRect(cx - 4, y - 11, 8, 1);
    } else if (kind === 'balloon') {
      // Inflated round rover bladder + brass valve + rope tail. Round
      // silhouette so it never reads like the jerry can or crate.
      var rad = Math.floor(s * 0.34), by = cy - 2;
      var rows = [0.45, 0.62, 0.78, 0.90, 0.97, 1.0, 1.0, 0.97, 0.90, 0.78, 0.62, 0.42];
      var rh = Math.floor(rad * 2 / rows.length);
      for (var ri = 0; ri < rows.length; ri++) {
        var ww = Math.floor(rad * 2 * rows[ri]), yy = by - rad + ri * rh;
        ctx.fillStyle = '#1a0a05'; ctx.fillRect(cx - Math.floor(ww / 2) - 1, yy, ww + 2, rh + 1);
        ctx.fillStyle = '#9c7820'; ctx.fillRect(cx - Math.floor(ww / 2), yy, ww, rh);
        if (ri < 6) { ctx.fillStyle = '#d4a838'; ctx.fillRect(cx - Math.floor(ww / 2) + 1, yy, Math.floor(ww * 0.7), Math.max(1, rh - 1)); }
      }
      ctx.fillStyle = '#fff0c0'; ctx.fillRect(cx - Math.floor(rad * 0.5), by - rad + rh, Math.floor(rad * 0.5), 2);
      ctx.fillStyle = '#7a5a2c'; ctx.fillRect(cx - 1, by - rad + rh, 2, rad * 2 - rh);
      // Brass valve at the top
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(cx - 3, by - rad - 6, 6, 7);
      ctx.fillStyle = '#a07c40'; ctx.fillRect(cx - 2, by - rad - 5, 4, 5);
      ctx.fillStyle = '#fff0c0'; ctx.fillRect(cx - 2, by - rad - 5, 1, 3);
      // Rope tail swaying gently
      var rsw = Math.sin(t * 0.8) * 2;
      ctx.fillStyle = '#5e3e22';
      ctx.fillRect(cx + rad - 4, by + rad - 6, 2, 8);
      ctx.fillRect(cx + rad - 4 + rsw, by + rad + 1, 2, 6);
    } else if (kind === 'bombSmall') {
      // Single red dynamite stick: iron crimped caps, a cream paper band, and
      // a curled twine fuse with a banded ember.
      var sw = Math.floor(s * 0.24), sh = Math.floor(s * 0.66);
      var sx = cx - Math.floor(sw / 2), sy = cy - Math.floor(sh / 2) + 6;
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
      ctx.fillStyle = '#7a1a14'; ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#a01a14'; ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.fillStyle = '#c83830'; ctx.fillRect(sx + 2, sy + 2, 2, sh - 4);
      ctx.fillStyle = 'rgba(58,12,8,0.5)'; ctx.fillRect(sx + sw - 3, sy + 2, 2, sh - 4);
      // Iron crimped caps
      ctx.fillStyle = '#2a2724'; ctx.fillRect(sx - 1, sy - 1, sw + 2, 4);
      ctx.fillStyle = '#3d3a35'; ctx.fillRect(sx, sy, sw, 2);
      ctx.fillStyle = '#4f4c46'; ctx.fillRect(sx + 1, sy, sw - 2, 1);
      ctx.fillStyle = '#2a2724'; ctx.fillRect(sx - 1, sy + sh - 3, sw + 2, 4);
      ctx.fillStyle = '#3d3a35'; ctx.fillRect(sx, sy + sh - 3, sw, 2);
      // Cream paper band + label
      var bandY = sy + Math.floor(sh * 0.42), bandH = Math.floor(sh * 0.22);
      ctx.fillStyle = '#e8d098'; ctx.fillRect(sx - 1, bandY, sw + 2, bandH);
      ctx.fillStyle = '#bfa46a'; ctx.fillRect(sx - 1, bandY + bandH - 1, sw + 2, 1);
      if (s >= 56) {
        var lw = stencilTextWidth('TNT', 1);
        drawStencilText('TNT', sx + Math.floor((sw - lw) / 2), bandY + Math.floor((bandH - 7) / 2), 1, '#3a1810');
      } else {
        ctx.fillStyle = '#3a1810'; ctx.fillRect(sx + 2, bandY + Math.floor(bandH / 2) - 1, sw - 4, 2);
      }
      // Curled twine fuse
      ctx.fillStyle = '#5e3e22'; ctx.fillRect(cx - 1, sy - 7, 2, 8);
      ctx.fillStyle = '#7a4828'; ctx.fillRect(cx + 1, sy - 11, 2, 5);
      ctx.fillStyle = '#5e3e22'; ctx.fillRect(cx + 2, sy - 14, 2, 4);
      // Banded ember
      var fl = 0.5 + 0.5 * Math.sin(t * 7), emA = 0.25 * fl + 0.15;
      for (var eb = 3; eb >= 1; eb--) {
        var ef = eb / 3;
        ctx.fillStyle = 'rgba(255,170,60,' + (emA * (1 - ef) * (1 - ef)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(cx + 3, sy - 15, 1 + 6 * ef, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = fl > 0.5 ? '#fff0b0' : '#ffd060'; ctx.fillRect(cx + 2, sy - 16, 2, 2);
    } else if (kind === 'bombLarge') {
      // Bundle of 3 sticks with twine bands, a brass detonator clip, and a
      // fuse coil. The clip + stick gaps stop it reading as a flat red grid.
      var stickW = Math.floor(s * 0.18), stickH = Math.floor(s * 0.66);
      var bundleW = stickW * 3 + 4, bundleX = cx - Math.floor(bundleW / 2);
      var stickY = cy - Math.floor(stickH / 2) + 6;
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(bundleX - 1, stickY - 1, bundleW + 2, stickH + 2);
      for (var di = 0; di < 3; di++) {
        var x2 = bundleX + 2 + di * (stickW + 1);
        ctx.fillStyle = '#7a1a14'; ctx.fillRect(x2, stickY, stickW, stickH);
        ctx.fillStyle = '#a01a14'; ctx.fillRect(x2 + 1, stickY + 1, stickW - 2, stickH - 2);
        ctx.fillStyle = '#c83830'; ctx.fillRect(x2 + 1, stickY + 2, 1, stickH - 4);
        ctx.fillStyle = '#3a1410'; ctx.fillRect(x2, stickY, stickW, 2); ctx.fillRect(x2, stickY + stickH - 2, stickW, 2);
      }
      // Twine bands with knots
      for (var tbi = 0; tbi < 2; tbi++) {
        var tby = stickY + Math.floor(stickH * (0.30 + tbi * 0.36));
        ctx.fillStyle = '#3a1810'; ctx.fillRect(bundleX, tby, bundleW, 4);
        ctx.fillStyle = '#5e3e22'; ctx.fillRect(bundleX, tby, bundleW, 1);
        ctx.fillStyle = '#7a4828'; ctx.fillRect(bundleX + Math.floor(bundleW / 2) - 1, tby - 1, 3, 6);
      }
      // Brass detonator clip on top
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(cx - 5, stickY - 8, 10, 8);
      ctx.fillStyle = '#7a5a2c'; ctx.fillRect(cx - 4, stickY - 7, 8, 7);
      ctx.fillStyle = '#a07c40'; ctx.fillRect(cx - 4, stickY - 7, 8, 1);
      ctx.fillStyle = '#fff0c0'; ctx.fillRect(cx - 3, stickY - 6, 1, 3);
      // Fuse coil + banded ember
      var lsw = Math.sin(t * 5), lemA = 0.18 + 0.12 * (0.5 + 0.5 * lsw);
      ctx.fillStyle = '#5e3e22'; ctx.fillRect(cx + 4, stickY - 6, 2, 6); ctx.fillRect(cx + 5, stickY - 10, 2, 5);
      for (var lb = 3; lb >= 1; lb--) {
        var lf = lb / 3;
        ctx.fillStyle = 'rgba(255,170,60,' + (lemA * (1 - lf) * (1 - lf)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(cx + 7, stickY - 12, 1 + 5 * lf, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = lsw > 0 ? '#fff0b0' : '#ffd060'; ctx.fillRect(cx + 6, stickY - 12, 2, 2);
    } else if (kind === 'reserveFuel') {
      // Amber NATO jerry can — triple-handle top, cream label, clean X-brace.
      var rcW = Math.floor(s * 0.54), rcH = Math.floor(s * 0.62);
      var rcX = cx - Math.floor(rcW / 2), rcY = cy - Math.floor(rcH / 2) + 6;
      var hY = rcY - Math.floor(s * 0.13), hPostH = Math.floor(s * 0.13);
      // Triple-handle top bar
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(rcX + 2, hY, rcW - 4, 4);
      ctx.fillStyle = '#8a5e16'; ctx.fillRect(rcX + 3, hY + 1, rcW - 6, 2);
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(rcX + 2, hY, 4, hPostH); ctx.fillRect(cx - 2, hY, 4, hPostH); ctx.fillRect(rcX + rcW - 6, hY, 4, hPostH);
      // Body
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(rcX - 2, rcY - 2, rcW + 4, rcH + 4);
      ctx.fillStyle = '#c8901f'; ctx.fillRect(rcX, rcY, rcW, rcH);
      ctx.fillStyle = '#ffd45a'; ctx.fillRect(rcX, rcY, rcW, 3); ctx.fillRect(rcX, rcY, 3, rcH);
      ctx.fillStyle = '#8a5e16'; ctx.fillRect(rcX, rcY + rcH - 3, rcW, 3); ctx.fillRect(rcX + rcW - 3, rcY, 3, rcH);
      // X-brace embossing
      ctx.fillStyle = 'rgba(58,38,8,0.7)';
      var xN = rcH - 14;
      for (var xi = 0; xi < xN; xi++) {
        var xf = xi / xN;
        ctx.fillRect(rcX + 5 + Math.floor(xf * (rcW - 13)), rcY + 7 + xi, 3, 1);
        ctx.fillRect(rcX + rcW - 8 - Math.floor(xf * (rcW - 13)), rcY + 7 + xi, 3, 1);
      }
      // Cream label panel
      ctx.fillStyle = '#e8d098'; ctx.fillRect(rcX + Math.floor(rcW * 0.2), rcY + Math.floor(rcH * 0.18), Math.floor(rcW * 0.6), Math.floor(rcH * 0.2));
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(rcX + Math.floor(rcW * 0.3), rcY + Math.floor(rcH * 0.24), Math.floor(rcW * 0.4), 2);
      // Screw cap, top-center
      var cpX = rcX + Math.floor(rcW * 0.5) - 3, cpH = Math.floor(s * 0.05);
      ctx.fillStyle = '#1a0a05'; ctx.fillRect(cpX - 1, rcY - cpH - 1, 8, cpH + 2);
      ctx.fillStyle = '#a9791f'; ctx.fillRect(cpX, rcY - cpH, 6, cpH);
      ctx.fillStyle = '#d4a838'; ctx.fillRect(cpX, rcY - cpH, 6, 1);
      // Glint
      ctx.fillStyle = 'rgba(255,244,200,0.7)'; ctx.fillRect(rcX + 4, rcY + 6, 2, Math.floor(rcH * 0.3));
    }
  }

  // §5.5 lever switch — brass lever on a brass mount, ball at the top.
  // pullT 0 = idle (ball up), 1 = fully pulled (ball at the bottom).
  // hoverFade is smoothed 0..1; subtle breathing when armed + idle.
  function drawShelfLever(cx, topY, h, armed, hoverFade, pullT) {
    // Idle breathing — subtle 8% brightness pulse on the ball when affordable
    var breathBoost = armed && pullT === 0 ? (Math.sin(shelfBreathT) * 0.5 + 0.5) * 0.08 : 0;
    var leverColor = armed ? '#d4a838' : '#5a4530';
    var darkColor = armed ? '#a07c40' : '#3a2818';
    var ballColor = armed ? '#fff0c0' : '#7a6840';
    var pullPx = Math.floor((h - 12) * pullT);
    var ballY = topY + pullPx;

    // Mount plate at the bottom
    var mY = topY + h - 4;
    ctx.fillStyle = '#1a0a05';
    ctx.beginPath(); ctx.arc(cx, mY, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darkColor;
    ctx.beginPath(); ctx.arc(cx, mY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = leverColor;
    ctx.beginPath(); ctx.arc(cx, mY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ballColor;
    ctx.fillRect(cx - 2, mY - 2, 1, 1);

    // Shaft
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cx - 3, ballY, 6, mY - ballY);
    ctx.fillStyle = leverColor;
    ctx.fillRect(cx - 2, ballY, 4, mY - ballY);
    ctx.fillStyle = ballColor;
    ctx.fillRect(cx - 2, ballY + 2, 1, mY - ballY - 4);

    // Ball at top
    ctx.fillStyle = '#1a0a05';
    ctx.beginPath(); ctx.arc(cx, ballY, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darkColor;
    ctx.beginPath(); ctx.arc(cx, ballY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = leverColor;
    ctx.beginPath(); ctx.arc(cx, ballY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ballColor;
    ctx.beginPath(); ctx.arc(cx - 1, ballY - 1, 2, 0, Math.PI * 2); ctx.fill();

    // Smooth hover glow + idle breath
    var glowAlpha = 0;
    if (armed) {
      glowAlpha = 0.18 * hoverFade + 0.10 * breathBoost / 0.08;
    }
    if (glowAlpha > 0.01) {
      var grad = ctx.createRadialGradient(cx, ballY, 4, cx, ballY, 22);
      grad.addColorStop(0, 'rgba(255,224,80,' + Math.min(0.65, glowAlpha + 0.25).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,224,80,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 24, ballY - 24, 48, 48);
    }
  }

  function drawShopSubPageFrame(stationId) {
    // Background: dim the floor image so it reads as backdrop
    var spec = SHOP_SPRITES[currentTown];
    var bg = spec ? loadShopSprite(spec.background) : null;
    var L = shopRoomLayout();
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0, viewW, L.canvasBottom);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    } else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    }
    // Title banner (red sign across top)
    var T = shopTheme();
    var bannerW = Math.min(440, viewW - 96);
    var bannerH = 44;
    var bannerX = Math.floor((viewW - bannerW) / 2);
    var bannerY = 14;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(bannerX - 2, bannerY - 2, bannerW + 4, bannerH + 4);
    ctx.fillStyle = '#5a1810';
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    ctx.fillStyle = '#8c2820';
    ctx.fillRect(bannerX + 1, bannerY + 1, bannerW - 2, bannerH - 2);
    ctx.fillStyle = '#a83830';
    ctx.fillRect(bannerX + 1, bannerY + 1, bannerW - 2, 2);
    // Iron L-brackets
    ctx.fillStyle = '#3a3530';
    ctx.fillRect(bannerX, bannerY, 8, 8);
    ctx.fillRect(bannerX + bannerW - 8, bannerY, 8, 8);
    ctx.fillRect(bannerX, bannerY + bannerH - 8, 8, 8);
    ctx.fillRect(bannerX + bannerW - 8, bannerY + bannerH - 8, 8, 8);
    ctx.fillStyle = '#5a5550';
    ctx.fillRect(bannerX + 2, bannerY + 2, 2, 2);
    ctx.fillRect(bannerX + bannerW - 4, bannerY + 2, 2, 2);
    ctx.fillRect(bannerX + 2, bannerY + bannerH - 4, 2, 2);
    ctx.fillRect(bannerX + bannerW - 4, bannerY + bannerH - 4, 2, 2);
    // Title text
    var title = stationId.toUpperCase();
    var tw = stencilTextWidth(title, 3);
    drawStencilText(title, bannerX + Math.floor((bannerW - tw) / 2), bannerY + Math.floor((bannerH - 21) / 2), 3, '#f0d088');

    // Cash readout under the banner
    var cashStr = '$' + money.toLocaleString();
    var cw = stencilTextWidth(cashStr, 2);
    drawStencilText(cashStr, Math.floor((viewW - cw) / 2), bannerY + bannerH + 10, 2, '#d4a838');

    drawShopBackArrow();
    return { bannerY: bannerY, bannerH: bannerH, contentTop: bannerY + bannerH + 36 };
  }


  function drawShelfSubPage() {
    var L = shopRoomLayout();
    SHELF_BUY_RECTS = [];
    var dt = 1 / 60;

    // ---- Animation ticks ----
    if (shelfBuyFx.t > 0) shelfBuyFx.t -= dt;
    if (shelfBuyFx.t <= 0) shelfBuyFx.key = null;
    // Modal entrance
    shopShelfModalEnterT = Math.min(1, shopShelfModalEnterT + dt / 0.20);
    // Lever idle breathing
    shelfBreathT = (shelfBreathT + dt * 1.8) % (Math.PI * 2);
    // Cash flash decay
    if (cashFlashFx.t > 0) cashFlashFx.t -= dt;
    if (cashFlashFx.t <= 0) cashFlashFx.color = null;
    // Stock floaters
    for (var sfi = shelfStockFlashes.length - 1; sfi >= 0; sfi--) {
      shelfStockFlashes[sfi].t -= dt;
      if (shelfStockFlashes[sfi].t <= 0) shelfStockFlashes.splice(sfi, 1);
    }
    // Hover fade per item
    var allItemKeys = ['teleporter', 'balloon', 'bombSmall', 'bombLarge'];
    for (var hki = 0; hki < allItemKeys.length; hki++) {
      var k = allItemKeys[hki];
      var target = (shopHoverShelfItem === k) ? 1 : 0;
      var cur = shelfHoverFadeT[k] || 0;
      var rate = dt / 0.12;
      if (cur < target) cur = Math.min(target, cur + rate);
      else if (cur > target) cur = Math.max(target, cur - rate);
      shelfHoverFadeT[k] = cur;
    }
    // Coin particles tick — variety (size, sparkle phase)
    for (var ci = shelfCoins.length - 1; ci >= 0; ci--) {
      var pc = shelfCoins[ci];
      pc.x += pc.vx; pc.y += pc.vy;
      pc.vy += 0.35;
      pc.phase = (pc.phase || 0) + 0.6;
      pc.t -= dt;
      if (pc.t <= 0) shelfCoins.splice(ci, 1);
    }

    // ---- Backdrop: dim the floor image ----
    var spec = SHOP_SPRITES[currentTown];
    var bg = spec ? loadShopSprite(spec.background) : null;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0, viewW, L.canvasBottom);
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    } else {
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    }

    // ---- Modal box ----
    // Top margin must clear the BACK button (y=12, h=32 → bottom at 44).
    // Use 56 minimum so the back arrow always has breathing room.
    var modalW = Math.min(820, viewW - 60);
    var modalH = Math.min(560, L.canvasBottom - 88);   // leave ~56 top + 32 bottom
    var modalX = Math.floor((viewW - modalW) / 2);
    var modalY = Math.max(56, Math.floor((L.canvasBottom - modalH) / 2));

    // Modal entrance scale + opacity — drops in from 94% scale + 0 opacity
    var entranceEase = 1 - Math.pow(1 - shopShelfModalEnterT, 3);   // cubic ease-out
    var entranceScale = 0.94 + 0.06 * entranceEase;
    var entranceAlpha = entranceEase;
    if (entranceEase < 1) {
      var modalCX = modalX + modalW / 2;
      var modalCY = modalY + modalH / 2;
      ctx.save();
      ctx.globalAlpha = entranceAlpha;
      ctx.translate(modalCX, modalCY);
      ctx.scale(entranceScale, entranceScale);
      ctx.translate(-modalCX, -modalCY);
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(modalX + 8, modalY + 10, modalW, modalH);

    // Outer outline + plate steel body
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(modalX - 2, modalY - 2, modalW + 4, modalH + 4);
    ctx.fillStyle = '#3d3a35';
    ctx.fillRect(modalX, modalY, modalW, modalH);
    ctx.fillStyle = '#4f4c46';
    ctx.fillRect(modalX, modalY, modalW, 2);
    ctx.fillRect(modalX, modalY, 2, modalH);
    ctx.fillStyle = '#2a2724';
    ctx.fillRect(modalX, modalY + modalH - 2, modalW, 2);
    ctx.fillRect(modalX + modalW - 2, modalY, 2, modalH);

    // Warm rim light catching the upper-left edge of the modal — consistent
    // with the shop floor's lamp position (upper-left vent / bulb).
    var rimGrad = ctx.createLinearGradient(modalX, modalY, modalX + modalW * 0.55, modalY + modalH * 0.4);
    rimGrad.addColorStop(0, 'rgba(255,200,90,0.10)');
    rimGrad.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(modalX + 2, modalY + 2, modalW - 4, modalH - 4);

    // Iron L-brackets at the four corners
    drawIronBracket(modalX + 2, modalY + 2, 28, 28, false, false);
    drawIronBracket(modalX + modalW - 30, modalY + 2, 28, 28, true, false);
    drawIronBracket(modalX + 2, modalY + modalH - 30, 28, 28, false, true);
    drawIronBracket(modalX + modalW - 30, modalY + modalH - 30, 28, 28, true, true);

    // Rivet seam along the top horizontal weld line
    var seamY = modalY + 36;
    ctx.fillStyle = '#2a2724';
    ctx.fillRect(modalX + 36, seamY, modalW - 72, 1);
    ctx.fillStyle = '#5a5750';
    ctx.fillRect(modalX + 36, seamY + 1, modalW - 72, 1);
    for (var rx = modalX + 60; rx < modalX + modalW - 60; rx += 28) {
      drawConsoleRivet(rx, modalY + 14);
    }

    // ---- Brass header band with title + cash ----
    var headX = modalX + 36;
    var headY = modalY + 50;
    var headW = modalW - 72;
    var headH = 48;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(headX - 2, headY - 2, headW + 4, headH + 4);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(headX, headY, headW, headH);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(headX + 2, headY + 2, headW - 4, headH - 4);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(headX + 2, headY + 2, headW - 4, 2);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(headX + 2, headY + headH - 4, headW - 4, 2);
    drawBrassBolt(headX + 8, headY + 8);
    drawBrassBolt(headX + headW - 10, headY + 8);
    drawBrassBolt(headX + 8, headY + headH - 10);
    drawBrassBolt(headX + headW - 10, headY + headH - 10);
    // Brass tarnish — small darker spots + a few diagonal scratches.
    // Deterministic positions (no per-frame movement; this is patina,
    // not noise).
    ctx.fillStyle = '#5a3e1c';
    ctx.fillRect(headX + 18, headY + 14, 2, 2);
    ctx.fillRect(headX + 56, headY + 22, 3, 1);
    ctx.fillRect(headX + 92, headY + 12, 2, 1);
    ctx.fillRect(headX + 124, headY + 28, 1, 2);
    ctx.fillRect(headX + headW - 84, headY + 18, 2, 1);
    ctx.fillRect(headX + headW - 56, headY + 30, 3, 1);
    // Diagonal scratches
    ctx.fillStyle = 'rgba(40,30,16,0.5)';
    for (var ti = 0; ti < 4; ti++) ctx.fillRect(headX + 36 + ti, headY + 6 + ti, 1, 1);
    for (var tj = 0; tj < 5; tj++) ctx.fillRect(headX + headW - 130 + tj, headY + 14 + tj, 1, 1);
    // Subtle wear streak under the title (where a finger would rest)
    ctx.fillStyle = 'rgba(60,42,22,0.30)';
    ctx.fillRect(headX + 24, headY + headH - 14, headW - 140, 2);

    // Title left of center
    var title = 'QUARTERMASTER SUPPLIES';
    drawStencilText(title, headX + 24, headY + Math.floor((headH - 21) / 2) + 1, 3, '#1f1408');

    // Cash readout — black inset display panel right side, flashes on buy/fail
    var cashStr = '$' + money.toLocaleString();
    var cw = stencilTextWidth(cashStr, 2);
    var cashW = cw + 28;
    var cashH = 26;
    var cashX = headX + headW - cashW - 10;
    var cashY = headY + Math.floor((headH - cashH) / 2);
    var flashAmt = cashFlashFx.t > 0 ? Math.min(1, cashFlashFx.t * 3) : 0;
    var cashColor = '#d4a838';
    if (flashAmt > 0 && cashFlashFx.color) {
      // Interpolate: 0 = base, 1 = full flash color
      cashColor = cashFlashFx.color;
    }
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cashX, cashY, cashW, cashH);
    ctx.fillStyle = '#0e0a04';
    ctx.fillRect(cashX + 2, cashY + 2, cashW - 4, cashH - 4);
    // Flash backing
    if (flashAmt > 0 && cashFlashFx.color) {
      var bgFlashColor = cashFlashFx.color === '#40c060' ? 'rgba(64,192,96,' : 'rgba(168,40,40,';
      ctx.fillStyle = bgFlashColor + (flashAmt * 0.35).toFixed(3) + ')';
      ctx.fillRect(cashX + 2, cashY + 2, cashW - 4, cashH - 4);
    }
    ctx.fillStyle = 'rgba(212,168,56,0.10)';
    ctx.fillRect(cashX + 2, cashY + 2, cashW - 4, 2);
    drawStencilText(cashStr, cashX + 14, cashY + 6, 2, cashColor);

    // ---- 4-col grid of consumable compartments ----
    // v11.32 — switched from 2x2 to 4xN grid (matching WORKSHOP) so more
    // items can be added as additional rows without overcrowding.
    var consumables = [
      { key: 'teleporter', name: 'TELEPORTER',    cost: shop.teleporter, count: teleporters, hotkey: 'T' },
      { key: 'balloon',    name: 'ROVER BALLOON', cost: shop.balloon,    count: balloons,    hotkey: 'B' },
      { key: 'bombSmall',  name: 'SMALL CHARGE',  cost: shop.bombSmall,  count: bombsSmall,  hotkey: '1' },
      { key: 'bombLarge',  name: 'LARGE CHARGE',  cost: shop.bombLarge,  count: bombsLarge,  hotkey: '2' },
      // Reserve fuel auto-deploys (no use-key), and is the one consumable
      // with a hard cap — maxCount drives the FULL state on the BUY lever.
      { key: 'reserveFuel', name: 'RESERVE FUEL', cost: shop.reserveFuel, count: reserveFuel, hotkey: 'AUTO', maxCount: RESERVE_FUEL_MAX }
    ];
    var COLS = 4;
    var rowsNeeded = Math.ceil(consumables.length / COLS);

    var gridX = headX + 8;
    var gridW = headW - 16;
    var cellPad = 10;
    var cellW = Math.floor((gridW - cellPad * (COLS - 1)) / COLS);
    var SHELF_CELL_H = 150;     // target; auto-shrinks if modal is smaller
    var availForGrid = (modalY + modalH - 36) - (headY + headH + 14);
    var cellH = Math.floor((availForGrid - cellPad * (rowsNeeded - 1)) / rowsNeeded);
    if (cellH > SHELF_CELL_H) cellH = SHELF_CELL_H;
    if (cellH < 110) cellH = 110;
    var gridY = headY + headH + 14;
    if (rowsNeeded === 1) {
      // Vertically center single row in the available space
      gridY = headY + headH + Math.floor((availForGrid - cellH) / 2);
    }

    for (var i = 0; i < consumables.length; i++) {
      var c = consumables[i];
      var col = i % COLS;
      var row = Math.floor(i / COLS);
      var cx = gridX + col * (cellW + cellPad);
      var cy = gridY + row * (cellH + cellPad);
      drawShelfCompartment(c, cx, cy, cellW, cellH);
    }

    // ---- Footer hint ----
    var hint = 'PULL A LEVER TO CONFIRM PURCHASE';
    var hw = stencilTextWidth(hint, 1);
    drawStencilText(hint, modalX + Math.floor((modalW - hw) / 2), modalY + modalH - 16, 1, '#7d6d4d');

    // ---- Receipt printer — paper strip slides down from the bottom edge
    // of the modal when a purchase is made, dwells, then retracts.
    if (shelfReceipt.t > 0) {
      shelfReceipt.t -= dt;
      var rT = shelfReceipt.t;
      var rTotal = 2.4;
      var rElapsed = rTotal - rT;
      var slideOut = Math.min(1, rElapsed / 0.25);
      var slideIn = Math.max(0, (rT - 0.0) / 0.4);
      var revealed = (rElapsed < 0.25) ? slideOut : slideIn;
      var rPaperW = Math.min(180, modalW - 40);
      var rPaperH = 38;
      var rPaperX = modalX + modalW - rPaperW - 36;
      var rPaperFullY = modalY + modalH - 4;
      var rPaperY = rPaperFullY - rPaperH * revealed;
      // Paper shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(rPaperX + 2, rPaperY + 3, rPaperW, rPaperH * revealed);
      // Paper face
      ctx.fillStyle = '#9c7838';
      ctx.fillRect(rPaperX, rPaperY, rPaperW, rPaperH * revealed);
      ctx.fillStyle = '#e8d098';
      ctx.fillRect(rPaperX + 1, rPaperY, rPaperW - 2, rPaperH * revealed - 2);
      // Aging stain at the bottom strip
      ctx.fillStyle = 'rgba(120,80,30,0.10)';
      ctx.fillRect(rPaperX + 1, rPaperY + rPaperH * revealed - 6, rPaperW - 2, 4);
      // Tear-off pattern at the bottom edge (small jagged dark teeth)
      if (revealed > 0.85) {
        ctx.fillStyle = '#5a3e1c';
        for (var ti2 = rPaperX + 4; ti2 < rPaperX + rPaperW - 4; ti2 += 4) {
          ctx.fillRect(ti2, rPaperY + rPaperH * revealed - 2, 2, 2);
        }
      }
      // Receipt text — only readable once mostly extended
      if (revealed > 0.6) {
        var tAlpha = Math.min(1, (revealed - 0.6) / 0.25);
        var rsHeader = 'TRANSACTION';
        var rsHW = stencilTextWidth(rsHeader, 1);
        drawStencilText(rsHeader, rPaperX + Math.floor((rPaperW - rsHW) / 2), rPaperY + 4, 1, 'rgba(31,20,8,' + tAlpha.toFixed(3) + ')');
        var rsBody = shelfReceipt.text;
        var rsBW = stencilTextWidth(rsBody, 1);
        drawStencilText(rsBody, rPaperX + Math.floor((rPaperW - rsBW) / 2), rPaperY + 16, 1, 'rgba(31,20,8,' + tAlpha.toFixed(3) + ')');
      }
      // Slot in the modal frame where the paper exits — small dark rect
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(rPaperX + 4, modalY + modalH - 6, rPaperW - 8, 2);
    }

    // ---- Coin splash particles (rendered last so they're on top) ----
    for (var pi = 0; pi < shelfCoins.length; pi++) {
      var pp = shelfCoins[pi];
      var alpha = Math.min(1, pp.t * 2);
      var sparkle = Math.sin(pp.phase || 0) > 0;
      var sz = pp.size || 3;
      // Trail (faded slightly behind)
      ctx.fillStyle = 'rgba(212,168,56,' + (alpha * 0.4).toFixed(3) + ')';
      ctx.fillRect(pp.x - pp.vx * 0.4, pp.y - pp.vy * 0.4, sz, sz);
      // Main coin
      ctx.fillStyle = (cashFlashFx.color === '#a01a14') ? 'rgba(168,40,40,' + alpha.toFixed(3) + ')' : 'rgba(212,168,56,' + alpha.toFixed(3) + ')';
      ctx.fillRect(pp.x, pp.y, sz, sz);
      // Bright sparkle (alternates on/off via sin phase)
      if (sparkle) {
        ctx.fillStyle = 'rgba(255,240,192,' + alpha.toFixed(3) + ')';
        ctx.fillRect(pp.x, pp.y, 1, 1);
      }
    }

    // ---- "+1" stock floaters ----
    for (var sfli = 0; sfli < shelfStockFlashes.length; sfli++) {
      var sfl = shelfStockFlashes[sfli];
      var sfAlpha = Math.min(1, sfl.t * 2.5);
      var rise = (1 - sfl.t / 0.7) * 18;
      var sfStr = '+1';
      var sfW = stencilTextWidth(sfStr, 2);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * sfAlpha).toFixed(3) + ')';
      ctx.fillRect(sfl.x - Math.floor(sfW / 2) - 3, sfl.y - rise - 3, sfW + 6, 18);
      drawStencilText(sfStr, sfl.x - Math.floor(sfW / 2), sfl.y - rise - 1, 2, 'rgba(64,192,96,' + sfAlpha.toFixed(3) + ')');
    }

    // Close the modal-entrance transform if active
    if (entranceEase < 1) ctx.restore();

    drawShopBackArrow();
  }

  function drawShelfCompartment(c, x, y, w, h) {
    var atCap = !!c.maxCount && c.count >= c.maxCount;
    var canBuy = !atCap && (devMode || money >= c.cost);
    var hoverFade = shelfHoverFadeT[c.key] || 0;   // smoothed 0..1
    var hovered = hoverFade > 0.05;
    var pulling = (shelfBuyFx.key === c.key && shelfBuyFx.t > 0);
    // Lever animation: ease-out pull (0..0.12s) → hold (0.12..0.18s) →
    // ease-in spring-back (0.18..0.40s). Snappy down, slow return.
    var pullT = 0;
    if (pulling) {
      var totalT = 0.4;
      var elapsed = totalT - shelfBuyFx.t;
      if (elapsed < 0.12) {
        var p1 = elapsed / 0.12;
        pullT = 1 - Math.pow(1 - p1, 3);   // cubic ease out
      } else if (elapsed < 0.18) {
        pullT = 1;
      } else {
        var p2 = Math.min(1, (elapsed - 0.18) / 0.22);
        pullT = 1 - p2 * p2;                // quadratic ease back
      }
    }

    // ---- Wooden compartment ----
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#5e3e22';
    ctx.fillRect(x, y, w, h);
    // Wood grain (horizontal subtle streaks)
    ctx.fillStyle = '#4a2f18';
    for (var gy = y + 6; gy < y + h - 4; gy += 7) {
      ctx.fillRect(x + 4, gy, w - 8, 1);
    }
    // Wood patina — deterministic small scuffs, dents, knots seeded by the
    // compartment's c.key so each item's compartment has consistent unique
    // character across renders. Tiny details that signal "made with care."
    var seedHash = 0;
    for (var hi = 0; hi < c.key.length; hi++) seedHash = (seedHash * 31 + c.key.charCodeAt(hi)) | 0;
    function seedRand(n) {
      var v = Math.sin((seedHash + n) * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    }
    // 4 small dents
    ctx.fillStyle = '#3a2218';
    for (var di = 0; di < 4; di++) {
      var dx = x + 6 + Math.floor(seedRand(di * 2) * (w - 12));
      var dy = y + 6 + Math.floor(seedRand(di * 2 + 1) * (h - 12));
      ctx.fillRect(dx, dy, 2, 1);
    }
    // 1 small knot (darker oval)
    var knX = x + 8 + Math.floor(seedRand(20) * (w - 24));
    var knY = y + 8 + Math.floor(seedRand(21) * (h - 24));
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(knX, knY, 4, 3);
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(knX + 1, knY + 1, 2, 1);
    // 1 diagonal scuff
    ctx.fillStyle = '#3a2218';
    var scX = x + 10 + Math.floor(seedRand(30) * (w - 30));
    var scY = y + 12 + Math.floor(seedRand(31) * (h - 30));
    for (var sci = 0; sci < 5; sci++) ctx.fillRect(scX + sci, scY + sci, 1, 1);
    // Wood bevel
    ctx.fillStyle = '#7a5028';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillStyle = '#3a2218';
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);
    // Brass corner brackets
    drawBrassCornerL(x + 2, y + 2, false, false);
    drawBrassCornerL(x + w - 14, y + 2, true, false);
    drawBrassCornerL(x + 2, y + h - 14, false, true);
    drawBrassCornerL(x + w - 14, y + h - 14, true, true);
    // Compartment number stamp in the upper-left brass area
    var numStr = c.key === 'teleporter' ? '01' : c.key === 'balloon' ? '02' : c.key === 'bombSmall' ? '03' : c.key === 'bombLarge' ? '04' : '05';
    drawStencilText(numStr, x + 16, y + 4, 1, '#1f1408');

    // v11.32 — Vertical layout matching WORKSHOP cells (icon niche on top,
    // nameplate / stock / BUY button stacked below). Fixed bottom block
    // sized in pixels so nothing overflows regardless of cell h.
    var TOP_PAD = 8;
    var BOTTOM_PAD = 5;
    var BTN_H = 28;
    var BTN_GAP = 5;
    var STOCK_H = 8;
    var STOCK_GAP = 4;
    var NAMEPLATE_H = 14;
    var NAMEPLATE_GAP = 3;
    var bottomBlockH = NAMEPLATE_GAP + NAMEPLATE_H + STOCK_GAP + STOCK_H + BTN_GAP + BTN_H + BOTTOM_PAD;
    var nicheH = h - TOP_PAD - bottomBlockH;
    if (nicheH < 32) nicheH = 32;
    var nicheX = x + 12;
    var nicheY = y + TOP_PAD;
    var nicheW = w - 24;

    // Dark display niche
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(nicheX, nicheY, nicheW, nicheH);
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(nicheX + 2, nicheY + 2, nicheW - 4, nicheH - 4);
    if (hoverFade > 0.01) {
      var glowGrad = ctx.createRadialGradient(nicheX + nicheW / 2, nicheY + nicheH / 2, 4, nicheX + nicheW / 2, nicheY + nicheH / 2, nicheW * 0.7);
      glowGrad.addColorStop(0, 'rgba(255,200,90,' + (0.28 * hoverFade).toFixed(3) + ')');
      glowGrad.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(nicheX + 2, nicheY + 2, nicheW - 4, nicheH - 4);
    }
    var iconSize = Math.min(nicheW - 12, nicheH - 8);
    drawConsumableIconBig(c.key, nicheX + Math.floor(nicheW / 2), nicheY + Math.floor(nicheH / 2), iconSize);

    // Brass nameplate
    var npX = nicheX;
    var npY = nicheY + nicheH + NAMEPLATE_GAP;
    var npW = nicheW;
    var npH = NAMEPLATE_H;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(npX - 1, npY - 1, npW + 2, npH + 2);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(npX, npY, npW, npH);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(npX + 1, npY + 1, npW - 2, npH - 2);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(npX + 1, npY + 1, npW - 2, 1);
    var nw = stencilTextWidth(c.name, 1);
    drawStencilText(c.name, npX + Math.floor((npW - nw) / 2), npY + 3, 1, '#1f1408');

    // Stock + hotkey strip (replaces the right-column layout)
    var stockY = npY + npH + STOCK_GAP;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(npX - 1, stockY - 1, npW + 2, STOCK_H + 2);
    ctx.fillStyle = '#0e0a04';
    ctx.fillRect(npX, stockY, npW, STOCK_H);
    var stockStr = 'x' + c.count + '  [' + c.hotkey + ']';
    var sw = stencilTextWidth(stockStr, 1);
    drawStencilText(stockStr, npX + Math.floor((npW - sw) / 2), stockY + 1, 1, c.count > 0 ? '#40c060' : '#7d6d4d');

    // BUY button — fixed height, single-line label with price
    var btnY = stockY + STOCK_H + BTN_GAP;
    var btnH = BTN_H;
    var btnW = npW;
    var btnX = npX;
    var compress = pullT > 0 ? Math.floor(pullT * 3) : 0;
    var btnDrawY = btnY + compress;
    var btnDrawH = btnH - compress;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(btnX - 1, btnDrawY - 1, btnW + 2, btnDrawH + 2);
    var btnBody;
    if (!canBuy) btnBody = '#3a3530';
    else if (hoverFade > 0.05) btnBody = hoverFade > 0.5 ? '#ffe068' : '#e8c850';
    else btnBody = '#d4a838';
    ctx.fillStyle = btnBody;
    ctx.fillRect(btnX, btnDrawY, btnW, btnDrawH);
    ctx.fillStyle = canBuy ? 'rgba(80,50,16,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(btnX, btnDrawY + btnDrawH - 3, btnW, 3);
    // v11.35 — Always show price; dim button color signals affordability.
    var txtColor = canBuy ? '#1f1408' : '#7d6d4d';
    var btnLbl = atCap ? 'FULL' : 'BUY $' + c.cost.toLocaleString();
    var lblW = stencilTextWidth(btnLbl, 2);
    drawStencilText(btnLbl, btnX + Math.floor((btnW - lblW) / 2), btnDrawY + Math.floor((btnDrawH - 14) / 2), 2, txtColor);

    // Hit rect: covers the whole bottom interactive block
    SHELF_BUY_RECTS.push({
      x: btnX, y: nicheY + nicheH,
      w: btnW, h: btnY + btnH - (nicheY + nicheH),
      key: c.key, cost: c.cost, canBuy: canBuy,
      leverCX: btnX + Math.floor(btnW / 2),
      leverTopY: btnY
    });
  }

  function fireShelfBuyFx(rect, success) {
    shelfBuyFx = { key: rect.key, t: 0.4, success: success };
    if (success) {
      // Coin splash — varied size, sparkle phase, trail
      for (var i = 0; i < 10; i++) {
        shelfCoins.push({
          x: rect.leverCX + (Math.random() - 0.5) * 6,
          y: rect.leverTopY,
          vx: (Math.random() - 0.5) * 5,
          vy: -2.5 - Math.random() * 2.5,
          t: 0.55 + Math.random() * 0.35,
          size: 2 + Math.floor(Math.random() * 3),
          phase: Math.random() * Math.PI * 2
        });
      }
      // Cash readout: brief green flash
      cashFlashFx = { color: '#40c060', t: 0.35 };
      // "+1" floater rising from the stock counter
      shelfStockFlashes.push({
        key: rect.key,
        x: rect.x + Math.floor(rect.w / 2),
        y: rect.y + 60,
        t: 0.7
      });
      // Receipt printer paper strip
      var receiptName = rect.key === 'teleporter' ? 'TELEPORTER' :
                       rect.key === 'balloon'    ? 'ROVER BALLOON' :
                       rect.key === 'bombSmall'  ? 'SMALL CHARGE' :
                       rect.key === 'bombLarge'  ? 'LARGE CHARGE' : 'RESERVE FUEL';
      shelfReceipt = { text: receiptName + '  $' + rect.cost.toLocaleString(), t: 2.4 };
    } else {
      // Failure — short red flash, no coins
      cashFlashFx = { color: '#a01a14', t: 0.25 };
    }
  }

