
  // ====== SURFACE TREES (165) ======
  //
  // Pixel-art flora planted across the whole wide surface: spruce groves,
  // pale birches and bushes in the towns, scorched snags out in the No Man's
  // Zones, nothing on the ocean caps or in the pond pits. Pure decor: no
  // collision, the drill never targets a tree, and trees are NOT world tiles.
  //
  // DERIVED, NEVER SAVED. A tree stands exactly where the placement hash says
  // AND its ground tile at (SKY_ROWS, c) is still solid (the world surface is
  // flat at SKY_ROWS, see 015/030). treesRebuild() re-derives the whole set
  // whenever the world array identity changes, which covers both init() and
  // saveApply() (each swaps in a new grid). So save/load needs no new state:
  // fell a tree by digging its ground out, reload, and it stays gone because
  // the dug ground is what the save remembers.
  //
  // Systems in this fragment:
  //   - Placement: deterministic column hashes shaped by a smooth 1D "grove
  //     field" (two lerped value-noise octaves), so trees come in clustered
  //     stands with real clearings instead of even pepper. Towns are lush
  //     (clear zone around each station compound), zones are sparse snags.
  //   - Fall: treesOnClear(r, c), hooked at the end of markTerrainCleared
  //     (120), starts a physical tip-over when the ground tile under a trunk
  //     is cleared: gravity torque about the root, then at ~77 degrees the
  //     tree bursts into leaves + wood chips (treesPoof). Bushes pop on the
  //     spot. Falling trees keep integrating even off-screen (treesFalling),
  //     so a bombed grove finishes falling while you fly away.
  //   - Sway: per-tree angular spring (ang, angV) around a target leaning
  //     with surfaceWind (190) plus a slow per-tree breathing phase. The rig
  //     is a gust source: passing inside treesTune.gustR shoves the canopy
  //     away (speed-gated, idle hover does nothing, same discipline as the
  //     water coupling), the jet downwash shivers canopies it hovers over
  //     (rocketIntensity), and a sonic boom (player.fx.boomN) whips every
  //     visible tree. Strong gusts shed a leaf wake.
  //   - Leaves: one pooled particle array (leaves, wood chips, root dirt).
  //     Leaves flutter, fall, and SETTLE on the first solid tile under them
  //     (same world rule as the v24.126 precipitation), resting a beat
  //     before fading.
  //   - Birds: spruce + birch canopies hold a small hash-seeded perched
  //     population. Every treesTune.birdPeriod seconds or so an on-screen
  //     canopy releases one into the 205-birds boids: it joins an active
  //     flock slot with room, otherwise the farthest (off-screen) bird is
  //     relocated so the pool never grows. Hard gust passes and falls flush
  //     all of a tree's birds at once.
  //
  // Perf model: sprites are baked ONCE (one-time, ~16 small offscreen
  // canvases at world-px resolution) and blitted with a shear transform for
  // sway or a rotation for falls; nothing path-draws per frame (the v13.15
  // mountain lesson). Update + draw bail when the sky band is off screen and
  // touch only the camera slice of the x-sorted tree list (binary search).
  //
  // Render order (140): drawTrees runs BEFORE the stations so buildings stay
  // in front of canopies; drawTreeLeaves runs after birdsDraw so leaf wakes
  // drift over the ponds but behind the smoke trail + rig.

  // ----- Tunables (gm group 'trees', registered in 360) -----
  var treesTune = {
    enabled: 1,
    density: 1.0,     // global spawn multiplier (applies on the next rebuild)
    swayAmp: 1.0,     // ambient sway master
    windCouple: 1.0,  // surfaceWind lean coupling
    gustR: 96,        // rig gust radius around a canopy, px
    gustGain: 1.0,    // rig gust strength master
    leafRate: 1.0,    // leaf shed master
    birdPeriod: 11,   // mean seconds between ambient canopy bird launches
    fallRate: 1.0     // tip-over torque master
  };

  var TREES_KIND_SPRUCE = 0, TREES_KIND_BIRCH = 1, TREES_KIND_BUSH = 2, TREES_KIND_SNAG = 3;
  var TREES_LEAF_MAX = 160;        // global particle cap (leaves + chips + dirt)
  var TREES_VIEW_PAD = 220;        // px beyond the screen kept live for sway/draw
  var TREES_FALL_POOF_ANG = 1.35;  // lean (radians) where a falling tree bursts
  var TREES_TOWN_CLEAR = 18;       // columns kept tree-free around a town center

  // Flora palette: three locked greens plus one weathered-pale birch bark.
  // Kept darker + less saturated than the grass speck #9bb963 so canopies sit
  // a step behind the play-plane grass pop; trunks and chips reuse BLD wood
  // and every silhouette gets the mandatory BLD.outline ring (BUILDING_STYLE
  // section 3). Do not add more greens, recolour these.
  var TREES_GREEN_DARK = '#2e4420';   // spruce needle body / canopy undersides
  var TREES_GREEN_MID  = '#4a6631';   // birch + bush canopy body, spruce lit side
  var TREES_GREEN_LIT  = '#8f9c52';   // sparse sunlit dabs (brightest flora tone)
  var TREES_BARK_PALE  = '#d4c89f';   // birch bark (with BLD.outline tick marks)

  // ----- State -----
  var TREES = [];               // built by treesRebuild, ascending x
  var treesByCol = null;        // Int32Array(COLS): tree index + 1, 0 = none
  var treesBuilt = false;
  var treesWorldRef = null;     // world array identity sentinel (init/saveApply swap it)
  var treesSprites = null;      // baked sprite list
  var treesSet = null;          // per-kind lists of sprite indices
  var treesFalling = [];        // trees mid-tip (integrated even off-screen)
  var treeLeaves = [];          // pooled leaf/chip/dirt particles
  var treesT = 0;               // sway clock
  var treesLastBoomN = 0;       // player.fx.boomN diff (same idiom as 205)
  var treesBirdT = 6;           // countdown to the next ambient canopy launch

  // Dev boot lever: ?treeshot=COL teleports the rig to that surface column on
  // the first tree tick (headless screenshot harness; matches ?pondtest=).
  var treesShotCol = (function () {
    try {
      var m = /[?&]treeshot=(-?\d+)/.exec(window.location.search);
      return m ? parseInt(m[1], 10) : null;
    } catch (e) { return null; }
  })();
  // ?treefell=COL fells the nearest tree through the REAL dig path (clears
  // its ground tile then markTerrainCleared) one second in, so the whole
  // hook chain is testable headless. Implies parking the rig there too.
  var treesFellCol = (function () {
    try {
      var m = /[?&]treefell=(-?\d+)/.exec(window.location.search);
      return m ? parseInt(m[1], 10) : null;
    } catch (e) { return null; }
  })();
  if (treesFellCol != null && treesShotCol == null) treesShotCol = treesFellCol;
  var treesFellT = 1.0;

  // Cheap deterministic hash in [0,1), integer-keyed (the 205-birds idiom).
  function treesHash(n) {
    var x = Math.sin(n * 113.5 + 271.3) * 43758.5453;
    return x - Math.floor(x);
  }

  // Smooth 1D grove field over world columns: two lerped value-noise octaves,
  // floored so roughly a third of the land is true clearing and the rest
  // rises toward dense grove cores. Drives both spawn chance and tree size.
  function treesGrove(c) {
    var g0 = c / 22, i0 = Math.floor(g0), f0 = g0 - i0;
    f0 = f0 * f0 * (3 - 2 * f0);
    var a0 = treesHash(i0 * 131 + 7), b0 = treesHash((i0 + 1) * 131 + 7);
    var v = a0 + (b0 - a0) * f0;
    var g1 = c / 7, i1 = Math.floor(g1), f1 = g1 - i1;
    f1 = f1 * f1 * (3 - 2 * f1);
    var a1 = treesHash(i1 * 57 + 911), b1 = treesHash((i1 + 1) * 57 + 911);
    v = v * 0.78 + (a1 + (b1 - a1) * f1) * 0.22;
    v = (v - 0.26) / 0.74;
    if (v <= 0) return 0;
    if (v > 1) v = 1;
    return v * v * (3 - 2 * v);
  }

  function treesInPond(c) {
    for (var i = 0; i < surfacePonds.length; i++) {
      if (c >= surfacePonds[i].cL - 1 && c <= surfacePonds[i].cR + 1) return true;
    }
    return false;
  }

  // ----- Sprite baking -----
  // Each species bakes to a small offscreen canvas at 1 sprite px = 1 world
  // px. Shapes are stacks of per-row half-widths; treesPaintRows paints one
  // BLD.outline pass dilated 1 px all round, then the fill rows on top, so
  // every silhouette gets the building-bible outline ring for free (tier
  // underhangs read as shaded ledges where a wide row overhangs a narrow one).
  function treesPaintRows(g, cx, rows, fill) {
    var i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      r._x = Math.round(cx + (r.dx || 0) - r.hw);
      r._w = Math.max(1, Math.round(r.hw * 2));
    }
    g.fillStyle = BLD.outline;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      g.fillRect(r._x - 1, r.y - 1, r._w + 2, r.h + 2);
    }
    g.fillStyle = fill;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      g.fillRect(r._x, r.y, r._w, r.h);
    }
  }

  function treesMakeSprite(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return { cv: cv, g: cv.getContext('2d'), w: w, h: h };
  }

  // Spruce: deliberate overlapping triangular tiers (the per-row jitter of
  // the first pass read as ragged dirt at play zoom; jitter lives per TIER
  // now and every stepped edge is clean), one consistent sun side (right):
  // a mid-green wedge down each row's right flank, lit crest pixels at tier
  // tops, painter-outline underhang shadows separating the tiers, and a
  // plank-wood trunk with a deep shade column + root flare.
  function treesBakeSpruce(hTiles, seed) {
    var h = Math.round(hTiles * TILE);
    var w = (Math.round(h * 0.46) | 1);
    var s = treesMakeSprite(w + 6, h + 4);
    var g = s.g, cx = ((w + 6) / 2) | 0, baseY = h + 2;

    var tw = h > 110 ? 4 : 3;
    var trunkH = Math.round(h * 0.22);
    var trunkTop = baseY - trunkH;
    treesPaintRows(g, cx, [
      { y: trunkTop, h: trunkH - 3, hw: tw * 0.5 },
      { y: baseY - 3, h: 2, hw: tw * 0.5 + 1 },
      { y: baseY - 1, h: 1, hw: tw * 0.5 + 2 }
    ], BLD.woodDark);
    g.fillStyle = BLD.woodDeep;
    g.fillRect(Math.round(cx - tw * 0.5), trunkTop + 1, 1, trunkH - 2);
    g.fillStyle = BLD.woodMid;
    g.fillRect(Math.round(cx + tw * 0.5) - 1, baseY - 6, 1, 4);

    var tiers = hTiles > 3.6 ? 5 : 4;
    var topY = 4;
    var botY = baseY - Math.round(h * 0.12);
    var span = botY - topY;
    var rows = [], ti2, y;
    for (ti2 = 0; ti2 < tiers; ti2++) {
      var t0 = topY + span * (ti2 / tiers) * 0.92;
      var t1 = topY + span * ((ti2 + 1) / tiers);
      var tierW = (w * 0.5) * (0.34 + 0.66 * ((ti2 + 1) / tiers));
      tierW *= 0.92 + treesHash(seed * 53 + ti2 * 7) * 0.16;
      var tdx = Math.round((treesHash(seed * 59 + ti2 * 11) - 0.5) * 2);
      for (y = Math.round(t0); y < Math.round(t1); y += 2) {
        var p = (y - t0) / (t1 - t0);
        var hw = tierW * (0.18 + 0.82 * p);
        if (hw < 1) hw = 1;
        rows.push({ y: y, h: 2, hw: hw, dx: tdx, _tp: p });
      }
    }
    rows.unshift({ y: topY - 2, h: 2, hw: 0.6, _tp: 0 });   // crisp spike tip
    treesPaintRows(g, cx, rows, TREES_GREEN_DARK);

    var i, r;
    g.fillStyle = TREES_GREEN_MID;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r.hw < 2.5) continue;
      var wedge = Math.round(r.hw * 0.5 * (0.45 + r._tp * 0.55));
      if (wedge < 1) wedge = 1;
      g.fillRect(Math.round(cx + (r.dx || 0) + r.hw) - wedge, r.y, wedge, r.h);
    }
    g.fillStyle = TREES_GREEN_LIT;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r._tp < 0.30 && r.hw >= 1.5 && treesHash(seed * 71 + i) < 0.8) {
        g.fillRect(Math.round(cx + (r.dx || 0) + r.hw) - 1, r.y, 1, 1);
      }
    }
    g.fillStyle = BLD.outline;   // sparse deep notches on the shade flank
    for (i = 2; i < rows.length; i += 4) {
      r = rows[i];
      if (r.hw > 4 && treesHash(seed * 87 + i) < 0.5) {
        g.fillRect(Math.round(cx + (r.dx || 0) - r.hw) + 1, r.y, 1, 1);
      }
    }
    return { cv: s.cv, w: s.w, h: s.h, ax: cx, ay: baseY };
  }

  // Birch: weathered-pale ticked trunk, airy 3-lobe canopy in the mid green
  // with dark undersides and a few sunlit dabs.
  function treesBakeBirch(hTiles, seed) {
    var h = Math.round(hTiles * TILE);
    var w = (Math.round(h * 0.55) | 1);
    var s = treesMakeSprite(w + 4, h + 3);
    var g = s.g, cx = ((w + 4) / 2) | 0, baseY = h + 1;
    var tw = h > 80 ? 4 : 3;
    var trunkH = Math.round(h * 0.56);
    treesPaintRows(g, cx, [{ y: baseY - trunkH, h: trunkH, hw: tw * 0.5 }], TREES_BARK_PALE);
    g.fillStyle = BLD.woodDark;   // warm shade column on the pale bark
    g.fillRect(Math.round(cx - tw * 0.5), baseY - trunkH + 1, 1, trunkH - 2);
    g.fillStyle = BLD.outline;
    var ty = baseY - trunkH + 4, side = treesHash(seed * 17) < 0.5 ? 0 : 1;
    while (ty < baseY - 3) {
      g.fillRect(Math.round(cx - tw * 0.5) + (side ? Math.ceil(tw * 0.45) : 0), ty, Math.ceil(tw * 0.55), 1);
      side = 1 - side;
      ty += 5 + ((treesHash(seed * 29 + ty) * 4) | 0);
    }
    var rows = [], bi, blobs = [
      { bx: 0,                          by: h * 0.22, rx: w * 0.46, ry: h * 0.190 },
      { bx: -w * 0.22 - treesHash(seed * 41) * 2, by: h * 0.34, rx: w * 0.30, ry: h * 0.125 },
      { bx: w * 0.24 + treesHash(seed * 43) * 2,  by: h * 0.31, rx: w * 0.32, ry: h * 0.135 }
    ];
    for (bi = 0; bi < blobs.length; bi++) {
      var b = blobs[bi];
      var yA = Math.max(2, Math.round(b.by - b.ry)), yB = Math.round(b.by + b.ry);
      for (var y = yA; y < yB; y += 2) {
        var q = (y - b.by) / b.ry;
        var hw = b.rx * Math.sqrt(Math.max(0, 1 - q * q));
        hw += (treesHash(seed * 631 + bi * 97 + y * 7) - 0.5) * 1.4;
        if (hw < 1) continue;
        rows.push({ y: y, h: 2, hw: hw, dx: b.bx, _q: q, _bi: bi });
      }
    }
    treesPaintRows(g, cx, rows, TREES_GREEN_MID);
    var i, r;
    g.fillStyle = TREES_GREEN_DARK;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r._q > 0.45 && r.hw > 2) {
        g.fillRect(Math.round(cx + (r.dx || 0) - r.hw * 0.7), r.y, Math.max(1, Math.round(r.hw * 1.0)), 2);
      }
    }
    g.fillStyle = TREES_GREEN_LIT;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r._q < -0.15 && r.hw > 2.5) {
        var lw = Math.max(1, Math.round(r.hw * 0.34));
        g.fillRect(Math.round(cx + (r.dx || 0) + r.hw) - lw - 1, r.y, lw, 2);
      }
    }
    return { cv: s.cv, w: s.w, h: s.h, ax: cx, ay: baseY };
  }

  // Bush: low double lump sitting right on the grass line.
  function treesBakeBush(hTiles, seed) {
    var h = Math.round(hTiles * TILE);
    var w = (Math.round(h * 1.5) | 1);
    var s = treesMakeSprite(w + 4, h + 3);
    var g = s.g, cx = ((w + 4) / 2) | 0, baseY = h + 1;
    var rows = [];
    var lump = treesHash(seed * 13) < 0.5 ? -1 : 1;
    for (var y = 2; y < baseY; y += 2) {
      var p = (y - 2) / (baseY - 2);
      var hw = (w * 0.5) * Math.sqrt(Math.max(0.08, 1 - (1 - p) * (1 - p)));
      hw += Math.sin(p * 5 + seed) * 1.2 + (treesHash(seed * 211 + y) - 0.5) * 1.2;
      if (hw < 1.5) hw = 1.5;
      rows.push({ y: y, h: 2, hw: hw, dx: lump * (1 - p) * w * 0.10, _p: p });
    }
    treesPaintRows(g, cx, rows, TREES_GREEN_MID);
    g.fillStyle = TREES_GREEN_DARK;
    g.fillRect(Math.round(cx - w * 0.32), baseY - 3, Math.round(w * 0.64), 2);
    g.fillStyle = TREES_GREEN_LIT;
    for (var bi2 = 0; bi2 < rows.length; bi2++) {
      var br = rows[bi2];
      if (br._p < 0.40 && br.hw > 2.5) {
        var blw = Math.max(1, Math.round(br.hw * 0.30));
        g.fillRect(Math.round(cx + (br.dx || 0) + br.hw) - blw - 1, br.y, blw, 2);
      }
    }
    return { cv: s.cv, w: s.w, h: s.h, ax: cx, ay: baseY };
  }

  // Snag (No Man's Zone): bare kinked trunk, broken top, two stub branches,
  // all dead plank-wood. No leaves, ever.
  function treesBakeSnag(hTiles, seed) {
    var h = Math.round(hTiles * TILE);
    var w = (Math.round(h * 0.42) | 1);
    var s = treesMakeSprite(w + 6, h + 3);
    var g = s.g, cx = ((w + 6) / 2) | 0, baseY = h + 1;
    var kink = (treesHash(seed * 19) - 0.5) * 5;
    var rows = [], y;
    for (y = 2; y < baseY; y += 1) {
      var p = (y - 2) / (baseY - 2);
      var hw = 1.0 + p * 2.0;
      var dx = kink * Math.sin(p * 2.4) * (1 - p * 0.4);
      if (y < 5 && treesHash(seed * 71 + y) < 0.5) dx += 1;   // snapped-off top
      rows.push({ y: y, h: 1, hw: hw, dx: dx });
    }
    var a, armY, dir, len;
    for (a = 0; a < 2; a++) {
      armY = Math.round(baseY * (a ? 0.34 : 0.56));
      dir = a ? -1 : 1;
      len = 4 + ((treesHash(seed * 83 + a) * 4) | 0);
      for (var k = 1; k <= len; k++) {
        rows.push({ y: armY - ((k * 0.45) | 0), h: 1, hw: 0.9, dx: dir * (1.6 + k) });
      }
    }
    treesPaintRows(g, cx, rows, BLD.woodDark);
    g.fillStyle = BLD.woodDeep;
    for (y = 6; y < baseY - 1; y += 2) {
      var p2 = (y - 2) / (baseY - 2);
      g.fillRect(Math.round(cx + kink * Math.sin(p2 * 2.4) * (1 - p2 * 0.4) - (1.0 + p2 * 2.0)) + 1, y, 1, 2);
    }
    return { cv: s.cv, w: s.w, h: s.h, ax: cx, ay: baseY };
  }

  function treesBake() {
    treesSprites = [];
    treesSet = [[], [], [], []];
    function reg(kind, spr) {
      spr.kind = kind;
      treesSet[kind].push(treesSprites.length);
      treesSprites.push(spr);
    }
    var i;
    var sprS = [2.3, 3.1, 4.1];
    for (i = 0; i < sprS.length; i++) {
      reg(TREES_KIND_SPRUCE, treesBakeSpruce(sprS[i], 11 + i * 6));
      reg(TREES_KIND_SPRUCE, treesBakeSpruce(sprS[i] + 0.15, 23 + i * 6));
    }
    var brS = [2.1, 2.8];
    for (i = 0; i < brS.length; i++) {
      reg(TREES_KIND_BIRCH, treesBakeBirch(brS[i], 31 + i * 8));
      reg(TREES_KIND_BIRCH, treesBakeBirch(brS[i] + 0.12, 47 + i * 8));
    }
    reg(TREES_KIND_BUSH, treesBakeBush(0.85, 53));
    reg(TREES_KIND_BUSH, treesBakeBush(0.78, 67));
    var snS = [1.6, 2.3];
    for (i = 0; i < snS.length; i++) {
      reg(TREES_KIND_SNAG, treesBakeSnag(snS[i], 71 + i * 12));
      reg(TREES_KIND_SNAG, treesBakeSnag(snS[i] + 0.2, 83 + i * 12));
    }
  }

  // Sprite pick: the grove field biases toward the larger bakes in grove
  // cores, hash spreads within the band (lists are ordered small to large).
  function treesPickSprite(kind, sizeBias, h) {
    var list = treesSet[kind];
    var f = h * 0.5 + sizeBias * 0.5;
    if (f > 0.999) f = 0.999;
    return treesSprites[list[(f * list.length) | 0]];
  }

  // ----- Placement -----
  function treesRebuild() {
    treesWorldRef = world;
    treesBuilt = true;
    if (!treesSprites) treesBake();
    TREES.length = 0;
    treesFalling.length = 0;
    treeLeaves.length = 0;
    treesByCol = new Int32Array(COLS);
    var lastX = -1e9;
    for (var c = 2; c < COLS - 2; c++) {
      var reg = regionAt(c);
      if (!reg || reg.kind === REGION_OCEAN) continue;
      var isZone = reg.kind === REGION_NOMANS;
      var ease = 1;
      if (reg.kind === REGION_TOWN) {
        var dC = Math.abs(c - townCenterCol(reg.townIndex));
        if (dC < TREES_TOWN_CLEAR) continue;          // station compound clearing
        // start at 0.35 so the first trees frame the station view instead of
        // leaving the spawn screen bare, then ramp to full over ~12 cols
        ease = Math.min(1, 0.35 + ((dC - TREES_TOWN_CLEAR) / 12) * 0.65);
      }
      var g = treesGrove(c);
      if (g <= 0) continue;
      if (treesInPond(c)) continue;
      var dens = (isZone ? 0.17 : 0.66) * g * ease * treesTune.density;
      if (treesHash(c * 7919 + 31) >= dens) continue;
      var ground = tileAt(SKY_ROWS, c);
      if (!ground || ground === 'wall' || ground.type === 'foundation') continue;
      var kr = treesHash(c * 523 + 9);
      var kind;
      if (isZone) kind = kr < 0.74 ? TREES_KIND_SNAG : (kr < 0.92 ? TREES_KIND_SPRUCE : TREES_KIND_BUSH);
      else        kind = kr < 0.44 ? TREES_KIND_SPRUCE : (kr < 0.72 ? TREES_KIND_BIRCH : TREES_KIND_BUSH);
      var spr = treesPickSprite(kind, isZone ? g * 0.6 : g, treesHash(c * 277 + 5));
      // Grove cores let canopies just about touch (overlap reads as depth);
      // bushes tuck in tighter still.
      var minDx = (kind === TREES_KIND_BUSH) ? 16 : 10 + spr.w * 0.38;
      var x = c * TILE + TILE * 0.5 + (treesHash(c * 401 + 3) - 0.5) * 16;
      if (x - lastX < minDx) continue;
      lastX = x;
      TREES.push({
        c: c, x: x, baseY: SKY_ROWS * TILE,
        kind: kind, spr: spr, sizeF: spr.h / TILE,
        ang: 0, angV: 0,
        lean: (kind === TREES_KIND_SNAG ? (treesHash(c * 631) - 0.5) * 0.16 : (treesHash(c * 631) - 0.5) * 0.05),
        ph: treesHash(c * 769) * 6.283,
        wv: (1.4 + treesHash(c * 379) * 1.2) / (0.8 + (spr.h / TILE) * 0.30),
        st: 0, fallT: 0, fallDir: 0,
        leafCd: 0, birdCd: 0,
        birdN: (kind === TREES_KIND_SPRUCE || kind === TREES_KIND_BIRCH) && treesHash(c * 887) < 0.55
          ? 1 + ((treesHash(c * 887 + 1) * 2) | 0) : 0,
        cy: SKY_ROWS * TILE - spr.h * 0.62,
        cr: Math.max(spr.w * 0.5, spr.h * 0.30)
      });
      treesByCol[c] = TREES.length;   // index + 1
    }
    // Dev/local boot probe (the [regions] idiom): one line so density work is
    // verifiable headless without driving the game. Silent in prod.
    try {
      if (window.location && /[?&]dev=|localhost|127\.0\.0\.1|192\.168\./.test(window.location.href)) {
        var kn = [0, 0, 0, 0], perched = 0, di, bestC = 0, bestN = -1;
        for (di = 0; di < TREES.length; di++) { kn[TREES[di].kind]++; perched += TREES[di].birdN; }
        // densest 60-column window, for aiming screenshots at a grove core
        for (di = 0; di < TREES.length; di++) {
          var wn = 0, dj = di;
          while (dj < TREES.length && TREES[dj].c - TREES[di].c < 60) { wn++; dj++; }
          if (wn > bestN) { bestN = wn; bestC = TREES[di].c + 30; }
        }
        console.info('[trees] ' + TREES.length + ' trees (' + kn[0] + ' spruce, ' + kn[1] +
                     ' birch, ' + kn[2] + ' bush, ' + kn[3] + ' snag), ' + perched +
                     ' perched birds; densest grove ~col ' + bestC + ' (' + bestN + ' in 60)');
      }
    } catch (e) {}
  }

  // ----- Leaf / chip particles -----
  function treesLeafColor(kind, h) {
    if (kind === TREES_KIND_SNAG) return h < 0.5 ? BLD.woodDark : BLD.woodDeep;
    if (kind === TREES_KIND_SPRUCE) return h < 0.62 ? TREES_GREEN_DARK : TREES_GREEN_MID;
    return h < 0.55 ? TREES_GREEN_MID : (h < 0.85 ? TREES_GREEN_LIT : TREES_GREEN_DARK);
  }

  function treesSpawnLeaf(x, y, vx, vy, kind, seed) {
    if (treeLeaves.length >= TREES_LEAF_MAX) return;
    var h = treesHash(seed * 7717 + treeLeaves.length * 131 + ((treesT * 61) | 0));
    treeLeaves.push({
      x: x, y: y, vx: vx, vy: vy, t: 0,
      maxT: 0.9 + h * 0.8,
      col: treesLeafColor(kind, h),
      sz: h < 0.35 ? 2 : 1,
      ph: h * 6.283,
      chip: kind === TREES_KIND_SNAG ? 1 : 0,
      landed: 0
    });
  }

  function treesSpawnChips(x, y, n, vxBias, vyBias, seed) {
    for (var i = 0; i < n; i++) {
      if (treeLeaves.length >= TREES_LEAF_MAX) return;
      var h = treesHash(seed * 991 + i * 37);
      treeLeaves.push({
        x: x + (h - 0.5) * 6, y: y - treesHash(seed * 997 + i) * 4,
        vx: vxBias + (treesHash(seed * 313 + i) - 0.5) * 70,
        vy: vyBias - treesHash(seed * 317 + i) * 60,
        t: 0, maxT: 0.55 + h * 0.5,
        col: h < 0.35 ? BLD.woodDeep : (h < 0.72 ? BLD.woodDark : '#3f2818'),
        sz: h < 0.5 ? 2 : 1, ph: 0, chip: 1, landed: 0
      });
    }
  }

  // ----- Birds out of the canopy (205-birds glue) -----
  function treesLaunchBird(t) {
    if (t.birdN <= 0 || t.birdCd > 0) return false;
    if (typeof birdsInited === 'undefined' || !birdsInited || !birdsRoostN) return false;
    var b = -1, f, i;
    for (f = 0; f < BIRDS_FLOCKS; f++) {
      if (birdsFActive[f] && birdsFCount[f] < BIRDS_PER_FLOCK) {
        b = f * BIRDS_PER_FLOCK + birdsFCount[f];
        birdsFCount[f]++;
        break;
      }
    }
    if (b < 0) {
      // Every nearby flock is full: relocate the farthest active bird (it is
      // off-screen at 1.5+ screens, so the swap is invisible) to the canopy.
      var camCX = cam.x + screenW * 0.5, bestD = -1;
      for (f = 0; f < BIRDS_FLOCKS; f++) {
        if (!birdsFActive[f]) continue;
        for (i = 0; i < birdsFCount[f]; i++) {
          var bb = f * BIRDS_PER_FLOCK + i;
          var dd = Math.abs(birdsX[bb] - camCX);
          if (dd > bestD) { bestD = dd; b = bb; }
        }
      }
      if (b < 0) return false;
    }
    var hh = treesHash(t.c * 1213 + ((treesT * 37) | 0));
    var dir = hh < 0.5 ? -1 : 1;
    birdsX[b] = t.x + dir * 3;
    birdsY[b] = t.cy - t.spr.h * 0.10;
    birdsVX[b] = dir * (55 + hh * 60);
    birdsVY[b] = -(70 + treesHash(t.c * 1217) * 70);
    birdsPh[b] = hh * 2;
    t.birdN--;
    t.birdCd = 7 + hh * 8;
    // Launch rustle: a canopy blip and a couple of loose leaves.
    t.angV += dir * 0.16;
    if (t.kind !== TREES_KIND_SNAG && treesTune.leafRate > 0) {
      treesSpawnLeaf(t.x + dir * t.spr.w * 0.2, t.cy, dir * 30, -14, t.kind, t.c * 5 + 1);
      treesSpawnLeaf(t.x - dir * t.spr.w * 0.1, t.cy + 4, dir * 18, 6, t.kind, t.c * 5 + 2);
    }
    return true;
  }

  function treesFlushBirds(t) {
    var guard = 4;
    while (t.birdN > 0 && guard-- > 0) {
      t.birdCd = 0;
      if (!treesLaunchBird(t)) break;
    }
  }

  // ----- Falling -----
  function treesStartFall(t, dirHint) {
    if (t.st !== 0) return;
    treesFlushBirds(t);
    if (t.kind === TREES_KIND_BUSH) { treesPoof(t); return; }   // bushes pop, no tip
    t.st = 1;
    t.fallT = 0;
    var dir = dirHint;
    if (!dir) {
      // Tip toward the open side if one neighbour ground tile is already gone.
      var l = tileAt(SKY_ROWS, t.c - 1), r0 = tileAt(SKY_ROWS, t.c + 1);
      var lOpen = (l === null), rOpen = (r0 === null);
      if (lOpen !== rOpen) dir = lOpen ? -1 : 1;
      else dir = treesHash(t.c * 47 + 11) < 0.5 ? -1 : 1;
    }
    t.fallDir = dir;
    t.angV = dir * (0.45 + treesHash(t.c * 53) * 0.3);
    treesFalling.push(t);
    // Root-side dirt kick out of the fresh hole.
    treesSpawnChips(t.x, t.baseY - 2, 3 + ((treesHash(t.c * 67) * 3) | 0), dir * 24, -46, t.c);
  }

  function treesPoof(t) {
    t.st = 2;
    if (treesByCol && t.c >= 0 && t.c < treesByCol.length) treesByCol[t.c] = 0;
    var n = Math.round((6 + t.spr.h * 0.18) * treesTune.leafRate);
    if (n > 0) {
      // Make room so a big poof always reads, even with a full pool.
      while (treeLeaves.length > TREES_LEAF_MAX - n && treeLeaves.length) treeLeaves.shift();
      var sa = Math.sin(t.ang), ca = Math.cos(t.ang);
      for (var i = 0; i < n; i++) {
        var d = treesHash(t.c * 997 + i * 17) * t.spr.h;
        var px2 = t.x + sa * d, py2 = t.baseY - ca * d;
        treesSpawnLeaf(
          px2 + (treesHash(t.c * 13 + i) - 0.5) * t.spr.w * 0.7, py2,
          t.fallDir * (26 + treesHash(t.c * 19 + i) * 70) + (treesHash(t.c * 23 + i) - 0.5) * 50,
          -(16 + treesHash(t.c * 29 + i) * 80),
          t.kind, t.c * 11 + i);
      }
    }
    treesSpawnChips(t.x + sa2(t) * t.spr.h * 0.3, t.baseY - 6, 4, t.fallDir * 30, -50, t.c * 3 + 7);
  }
  function sa2(t) { return Math.sin(t.ang) * 1; }

  // markTerrainCleared hook (120): the world surface is flat at SKY_ROWS, so
  // only a row-4 clear can be ground out from under a trunk. Cheap row check
  // first, the overwhelmingly common case is a deep dig.
  function treesOnClear(r, c) {
    if (r !== SKY_ROWS || !treesBuilt || !treesByCol) return;
    if (c < 0 || c >= treesByCol.length) return;
    var idx = treesByCol[c];
    if (!idx) return;
    var t = TREES[idx - 1];
    if (t && t.st === 0) treesStartFall(t, 0);
  }

  // ----- Per-frame update (350 loop, visual systems block) -----
  function treesLowerBound(x) {
    var a = 0, b = TREES.length;
    while (a < b) {
      var m = (a + b) >> 1;
      if (TREES[m].x < x) a = m + 1; else b = m;
    }
    return a;
  }

  function treesUpdate(dt) {
    if (!treesTune.enabled) return;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    if (treesWorldRef !== world || !treesBuilt) treesRebuild();
    if (treesShotCol != null) {
      // ?treeshot=COL harness: park the rig at that surface column once.
      player.x = treesShotCol * TILE;
      player.y = SKY_ROWS * TILE - 64;
      player.vx = 0; player.vy = 0;
      cam.snap = true;
      treesShotCol = null;
    }
    if (treesFellCol != null) {
      treesFellT -= dt;
      if (treesFellT <= 0) {
        var fc = treesFellCol; treesFellCol = null;
        var fbi = -1, fbd = 1e9;
        for (var fti = 0; fti < TREES.length; fti++) {
          if (TREES[fti].st !== 0) continue;
          var fdd = Math.abs(TREES[fti].c - fc);
          if (fdd < fbd) { fbd = fdd; fbi = fti; }
        }
        if (fbi >= 0) {
          var tf = TREES[fbi], pb = tf.birdN;
          var gt = world[SKY_ROWS] && world[SKY_ROWS][tf.c];
          if (gt) {
            world[SKY_ROWS][tf.c] = null;
            try { markTerrainCleared(SKY_ROWS, tf.c, gt); } catch (e2) {}
          } else {
            treesStartFall(tf, 0);
          }
          try { console.info('[trees] treefell: felled col ' + tf.c + ' kind ' + tf.kind + ', perched before ' + pb + ', falling ' + treesFalling.length); } catch (e3) {}
        }
      }
    }
    if (!TREES.length && !treeLeaves.length) return;
    treesT += dt;
    var surfY = SKY_ROWS * TILE;

    // Falling trees integrate even off-screen so a bombed grove finishes
    // falling (and poofs) while the player flies away.
    for (var fi = treesFalling.length - 1; fi >= 0; fi--) {
      var ft = treesFalling[fi];
      ft.fallT += dt;
      ft.angV += Math.sin(ft.ang + ft.fallDir * 0.35) * 7.5 * treesTune.fallRate * dt;
      ft.ang += ft.angV * dt;
      if (ft.kind !== TREES_KIND_SNAG && treesHash(ft.c * 7 + ((ft.fallT * 30) | 0)) < 10 * dt * treesTune.leafRate) {
        var fd = 0.5 + treesHash(ft.c * 9 + ((ft.fallT * 50) | 0)) * 0.45;
        treesSpawnLeaf(
          ft.x + Math.sin(ft.ang) * ft.spr.h * fd, ft.baseY - Math.cos(ft.ang) * ft.spr.h * fd,
          ft.fallDir * 20, -10, ft.kind, ft.c * 31 + ((ft.fallT * 10) | 0));
      }
      if (Math.abs(ft.ang) >= TREES_FALL_POOF_ANG || ft.fallT > 3.5) {
        treesPoof(ft);
        treesFalling.splice(fi, 1);
      }
    }

    // Standing trees: only the camera slice sways (plus a pad).
    if (cam.y < surfY && TREES.length) {
      var lo = treesLowerBound(cam.x - TREES_VIEW_PAD);
      var hi = treesLowerBound(cam.x + screenW + TREES_VIEW_PAD);
      var px = player.x + PLAYER_W * 0.5, py = player.y + PLAYER_H * 0.5;
      var rigSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      var wind = surfaceWind.current || 0;
      var boomed = false;
      var bn = (player.fx && typeof player.fx.boomN === 'number') ? player.fx.boomN : treesLastBoomN;
      if (bn !== treesLastBoomN) { treesLastBoomN = bn; boomed = true; }
      var gustR = treesTune.gustR, gustR2 = gustR * gustR;
      var washOn = rocketIntensity > 0.25;

      for (var i = lo; i < hi; i++) {
        var t = TREES[i];
        if (t.st !== 0) continue;
        var target = wind * 0.05 * treesTune.windCouple
                   + Math.sin(treesT * t.wv + t.ph) * 0.016 * treesTune.swayAmp * (0.5 + Math.abs(wind) * 0.9);
        if (t.leafCd > 0) t.leafCd -= dt;
        if (t.birdCd > 0) t.birdCd -= dt;

        // Rig gust: speed-gated proximity shove away from the pass + a leaf
        // wake. Idle hover next to a tree does nothing (the water lesson:
        // never make a player-coupled force unconditional).
        var dx = px - t.x, dy = py - t.cy;
        var d2 = dx * dx + dy * dy;
        if (d2 < gustR2 && rigSpd > 46) {
          var d = Math.sqrt(d2) || 1;
          var f = (1 - d / gustR) * Math.min(1, rigSpd / 380) * treesTune.gustGain;
          t.angV += (dx > 0 ? -1 : 1) * f * 4.2 * dt * (60 / (20 + t.spr.h));
          if (f > 0.22 && t.leafCd <= 0 && t.kind !== TREES_KIND_SNAG && treesTune.leafRate > 0) {
            t.leafCd = 0.16 + treesHash(((treesT * 977) | 0) + t.c) * 0.2;
            var nL = 1 + ((f * 3) | 0);
            for (var li2 = 0; li2 < nL; li2++) {
              var lh = treesHash(t.c * 173 + li2 + ((treesT * 53) | 0));
              treesSpawnLeaf(
                t.x + (lh - 0.5) * t.spr.w * 0.8,
                t.cy + (treesHash(t.c * 179 + li2) - 0.5) * t.spr.h * 0.36,
                player.vx * 0.22 + (lh - 0.5) * 46,
                player.vy * 0.10 - 12 - lh * 26,
                t.kind, t.c * 7 + li2);
            }
          }
          if (f > 0.5 && t.birdN > 0) treesLaunchBird(t);   // hard buzz flushes a bird
        }

        // Jet downwash: hovering on the rocket above a canopy shivers it.
        if (washOn && dx > -(t.cr + 26) && dx < (t.cr + 26) && dy < 10 && dy > -170) {
          var wash = rocketIntensity * (1 - (-dy) / 170);
          if (wash > 0) {
            t.angV += Math.sin(treesT * 13 + t.ph * 3) * wash * 2.6 * dt;
            if (t.leafCd <= 0 && t.kind !== TREES_KIND_SNAG && treesTune.leafRate > 0 &&
                treesHash(((treesT * 199) | 0) + t.c) < wash * 1.4 * dt * 10) {
              t.leafCd = 0.3;
              treesSpawnLeaf(t.x + (treesHash(t.c + ((treesT * 7) | 0)) - 0.5) * t.spr.w * 0.6,
                             t.cy, (treesHash(t.c * 3) - 0.5) * 50, 18, t.kind, t.c * 13 + 5);
            }
          }
        }

        if (boomed) {
          t.angV += (t.x < px ? -1 : 1) * (0.5 + treesHash(t.c * 3) * 0.4);
          if (t.kind !== TREES_KIND_SNAG && treesTune.leafRate > 0) {
            treesSpawnLeaf(t.x, t.cy, (t.x < px ? -1 : 1) * 60, -30, t.kind, t.c * 17 + 3);
            treesSpawnLeaf(t.x, t.cy + 5, (t.x < px ? -1 : 1) * 40, -16, t.kind, t.c * 17 + 4);
          }
          if (t.birdN > 0) { t.birdCd = 0; treesLaunchBird(t); }
        }

        // Underdamped angular spring: small trees are twangier, big spruces
        // sway slow and settle in a couple of wobbles.
        var k = 30 / (0.8 + t.sizeF * 0.55);
        t.angV += (-(t.ang - target) * k - t.angV * 2.2) * dt;
        t.ang += t.angV * dt;
        if (t.ang > 0.5) { t.ang = 0.5; if (t.angV > 0) t.angV = 0; }
        else if (t.ang < -0.5) { t.ang = -0.5; if (t.angV < 0) t.angV = 0; }
      }

      // Every now and then an on-screen canopy releases a bird into the
      // boids (reservoir-pick a random visible occupied tree).
      treesBirdT -= dt;
      if (treesBirdT <= 0) {
        treesBirdT = treesTune.birdPeriod * (0.55 + treesHash((treesT * 131) | 0) * 0.9);
        var cand = -1, seen = 0;
        for (var bi = lo; bi < hi; bi++) {
          var bt = TREES[bi];
          if (bt.st !== 0 || bt.birdN <= 0 || bt.birdCd > 0) continue;
          if (bt.x < cam.x - 10 || bt.x > cam.x + screenW + 10) continue;
          seen++;
          if (treesHash(((treesT * 997) | 0) * 31 + bi) < 1 / seen) cand = bi;
        }
        if (cand >= 0) treesLaunchBird(TREES[cand]);
        else treesBirdT = 2.2;   // nothing eligible on screen: retry soon
      }
    }

    // Leaves: flutter, fall, settle on the first solid tile (the v24.126
    // precipitation rule), rest a beat, fade. In-place compact, no allocs.
    var wN = 0;
    for (var li = 0; li < treeLeaves.length; li++) {
      var L = treeLeaves[li];
      L.t += dt;
      if (L.t >= L.maxT) continue;
      if (!L.landed) {
        L.vy += (L.chip ? 340 : 130) * dt;
        L.vx *= Math.exp(-(L.chip ? 0.6 : 1.6) * dt);
        if (!L.chip) L.x += Math.sin((treesT + L.ph) * 7) * 16 * dt;
        L.x += L.vx * dt;
        L.y += L.vy * dt;
        if (L.vy > 0) {
          var lr = Math.floor((L.y + 1) / TILE), lc = Math.floor(L.x / TILE);
          if (lr >= 0 && tileAt(lr, lc) !== null) {
            L.landed = 1;
            L.y = lr * TILE - 1;
            L.vx = 0; L.vy = 0;
            if (L.maxT > L.t + 0.5) L.maxT = L.t + 0.5;
          } else if (L.y > surfY + 900) continue;   // lost down a deep shaft
        }
      }
      treeLeaves[wN++] = L;
    }
    treeLeaves.length = wN;
  }

  // ----- Draw (140, world transform active) -----
  function drawTrees() {
    if (!treesTune.enabled || !treesBuilt || !TREES.length) return;
    var surfY = SKY_ROWS * TILE;
    if (cam.y >= surfY) return;
    var lo = treesLowerBound(cam.x - TREES_VIEW_PAD);
    var hi = treesLowerBound(cam.x + screenW + TREES_VIEW_PAD);
    if (lo >= hi) return;
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;   // baked sprites stay chunky pixels
    for (var i = lo; i < hi; i++) {
      var t = TREES[i];
      if (t.st === 2) continue;
      var spr = t.spr;
      ctx.save();
      ctx.translate(Math.round(t.x), t.baseY);
      // Root seat shade: a 2 px smudge over the grass line plants the trunk.
      ctx.fillStyle = 'rgba(26,10,5,0.25)';
      ctx.fillRect(-((spr.w * 0.16) | 0), 0, Math.max(3, (spr.w * 0.32) | 0), 2);
      if (t.st === 1) {
        ctx.rotate(t.ang);
      } else {
        var sh = t.ang + t.lean;
        if (sh > 0.6) sh = 0.6; else if (sh < -0.6) sh = -0.6;
        // Shear, base pinned: the canopy leans, the roots stay planted.
        // Negated so positive ang leans the same way rotate(ang) tips a
        // falling trunk (sprite y is negative above the anchor).
        ctx.transform(1, 0, -sh, 1, 0, 0);
      }
      ctx.drawImage(spr.cv, -spr.ax, -spr.ay);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = sm;
  }

  function drawTreeLeaves() {
    if (!treeLeaves.length) return;
    var left = cam.x - 12, right = cam.x + screenW + 12;
    for (var i = 0; i < treeLeaves.length; i++) {
      var L = treeLeaves[i];
      if (L.x < left || L.x > right) continue;
      var a = 1 - L.t / L.maxT;
      ctx.globalAlpha = a > 0.85 ? 1 : a / 0.85;
      ctx.fillStyle = L.col;
      ctx.fillRect(Math.round(L.x), Math.round(L.y), L.sz, L.sz);
    }
    ctx.globalAlpha = 1;
  }

  // Debug handle (the __course / __sluiceSave idiom): counts, a forced
  // rebuild after density lever changes, and shoot(col) for headless preview
  // screenshots (parks the camera at a surface column and renders one frame;
  // harmless in play, the next loop frame re-takes the camera).
  window.__trees = {
    rebuild: function () { treesBuilt = false; treesUpdate(1 / 60); return TREES.length; },
    count: function () { return TREES.length; },
    info: function () {
      var standing = 0, gone = 0, kinds = [0, 0, 0, 0], birds = 0;
      for (var i = 0; i < TREES.length; i++) {
        var t = TREES[i];
        if (t.st === 0) standing++; else if (t.st === 2) gone++;
        kinds[t.kind]++;
        birds += t.birdN;
      }
      return { total: TREES.length, standing: standing, gone: gone,
               falling: treesFalling.length, leaves: treeLeaves.length,
               perched: birds, spruce: kinds[0], birch: kinds[1],
               bush: kinds[2], snag: kinds[3] };
    },
    shoot: function (col) {
      if (!treesBuilt) treesRebuild();
      var wx = (col == null)
        ? (TREES.length ? TREES[(TREES.length / 2) | 0].x : COLS * TILE * 0.5)
        : col * TILE;
      cam.x = wx - screenW * 0.5;
      if (cam.x < 0) cam.x = 0;
      cam.y = SKY_ROWS * TILE - screenH * 0.72;
      cam.snap = true;
      try { render(); } catch (e) { return 'render threw: ' + e; }
      return 'ok @col ' + Math.round(wx / TILE);
    }
  };
