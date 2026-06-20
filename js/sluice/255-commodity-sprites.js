  // ====================================================================
  //  COMMODITY SPRITES — a 32x32 baked pixel-art engine for the Trade
  //  Board goods. Same technique as the workshop's shopGearSprites: a
  //  grid is shaded with 5-stop ramps under an upper-left light, given a
  //  1px ink outline, then baked to a crisp nearest-neighbor bitmap.
  //
  //  This module is SELF-CONTAINED (only uses Math + document), so the
  //  fragment doubles as a standalone script: commodity-lab.html loads it
  //  with <script src> to render the whole set for visual review, while
  //  the game bundle pulls it in as part of the one IIFE. Keep it that way
  //  (no references to ctx / game state in here).
  // ====================================================================
  var commoditySprites = (function () {
    var N = 32, INK = '#0d0a06';
    // 5-stop ramps, dark -> light. Light falls from the upper-left.
    var IRON   = ['#0e0c0b', '#23211e', '#3a3733', '#56524c', '#837c72'];
    var STEEL  = ['#3f3a34', '#5e5750', '#837a6e', '#aaa094', '#ded3c2'];
    var SILVER = ['#34383e', '#565c64', '#848a92', '#b4bac2', '#eef2f8'];
    var GOLD   = ['#4a3208', '#7e5810', '#bd8a1e', '#e6bb38', '#ffe87a'];
    var BRASS  = ['#3e2c0c', '#6e521a', '#a8842e', '#d6b04c', '#ffe89a'];
    var COPPER = ['#3a1c0e', '#6e3a18', '#a35a28', '#cc8242', '#eeb474'];
    var LEAD   = ['#2a2e34', '#43484f', '#5e646c', '#7c828a', '#a4aab2'];
    var COAL   = ['#08080a', '#16161c', '#28282f', '#3e3e47', '#5e5e68'];
    var WOOD   = ['#3a2210', '#58351a', '#7a4d26', '#9c6c38', '#c0934e'];
    var LEATHER= ['#241410', '#3e2418', '#5e3a24', '#824f30', '#aa6e44'];
    var HEMP   = ['#4a3c1e', '#6e5a2e', '#937a40', '#bda05c', '#e2c88c'];
    var PAPER  = ['#5e4e2e', '#867442', '#b09a5e', '#d8c488', '#f6ecc4'];
    var GLASS  = ['#10282a', '#1d4a48', '#2f7a6c', '#5aae96', '#9fe0c4'];
    var AQUA   = ['#1d4a55', '#2f8a9a', '#5fc6d6', '#a6ecf5', '#e6ffff'];
    var AMBER  = ['#3a1c06', '#7a3e10', '#b8761c', '#e8a83a', '#ffd870'];
    var REDST  = ['#5e1410', '#9e241a', '#d2402c', '#ee6a4e', '#ff9a7e'];
    var HEAT   = ['#7a2410', '#c0431a', '#ef7a24', '#ffb24a', '#ffe890'];
    var STONE  = ['#2a2622', '#433f39', '#615b52', '#867e72', '#b4ab9c'];
    var BONE   = ['#4a4030', '#6e6250', '#9a8e76', '#c4b89a', '#ece2c8'];
    var SALT   = ['#54585e', '#80868e', '#aeb4bc', '#d8dee4', '#ffffff'];
    var SULFUR = ['#4a3a08', '#7a6212', '#aa8a1e', '#dcc032', '#fff260'];
    var TURQ   = ['#0e3a44', '#1c6a74', '#2c9aa4', '#5fc6cc', '#a6ecf0'];
    var VERDI  = ['#0e3a30', '#1c6a54', '#2c9a78', '#5fc6a0', '#a6ecd0'];
    var GLOW   = ['#0e2a3a', '#106a8a', '#1f9ec0', '#6fd0e4', '#d6f4ff'];
    var ARCANE = ['#241038', '#43206a', '#6e3499', '#9a5ec6', '#cda6ec'];
    var DIAMND = ['#2e3640', '#50596a', '#7e8aa0', '#b0bcce', '#eef4ff'];
    var TOBAC  = ['#241606', '#3e2810', '#5e3e18', '#7e5626', '#a4763c'];
    var COFFEE = ['#1e1208', '#34220e', '#4e3418', '#6e4c24', '#946c38'];
    var PELT   = ['#2a1c10', '#46301c', '#664a2e', '#8a6c44', '#b29260'];
    var CROW   = ['#0a0a10', '#16161f', '#26262f', '#3a3a46', '#5a5a70'];

    function emptyGrid() {
      var g = [];
      for (var r = 0; r < N; r++) { var row = []; for (var c = 0; c < N; c++) row.push(0); g.push(row); }
      return g;
    }
    function setCell(g, r, c, v) { r = Math.round(r); c = Math.round(c); if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; }
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
    // Shaded sphere — light upper-left.
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
    // Left-lit rectangular block.
    function box(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 0.82 - ((c - x0) / w) * 0.55;
        if (r === y0) b += 0.16;
        if (r === y1) b -= 0.20;
        setCell(g, r, c, shade(ramp, Math.max(0.04, Math.min(1, b))));
      }
    }
    // Vertical cylinder — bright stripe near the left third.
    function vcyl(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 1 - Math.abs((c - x0) / w - 0.34) * 1.45;
        if (r === y0) b += 0.08;
        if (r === y1) b -= 0.12;
        setCell(g, r, c, shade(ramp, Math.max(0.06, Math.min(1, b))));
      }
    }
    // Horizontal cylinder — bright stripe near the top third.
    function hcyl(g, x0, y0, x1, y1, ramp) {
      var h = Math.max(1, y1 - y0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 1 - Math.abs((r - y0) / h - 0.32) * 1.45;
        if (c === x0) b += 0.08;
        if (c === x1) b -= 0.12;
        setCell(g, r, c, shade(ramp, Math.max(0.06, Math.min(1, b))));
      }
    }
    // Quadratic-bezier stroke (single color).
    function qbez(g, p0, p1, p2, color) {
      for (var t = 0; t <= 1.0001; t += 0.03) {
        var u = 1 - t;
        setCell(g, u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
                   u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], color);
      }
    }
    // Straight 1px line (single color).
    function line(g, x0, y0, x1, y1, color) {
      var steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        setCell(g, y0 + (y1 - y0) * t, x0 + (x1 - x0) * t, color);
      }
    }
    // Flat-shaded filled triangle (crisp facet).
    function tri(g, x0, y0, x1, y1, x2, y2, color) {
      var minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
      for (var y = minY; y <= maxY; y++) {
        var xs = [];
        edgeX(x0, y0, x1, y1, y, xs); edgeX(x1, y1, x2, y2, y, xs); edgeX(x2, y2, x0, y0, y, xs);
        if (xs.length >= 2) {
          var a = Math.min.apply(null, xs), b = Math.max.apply(null, xs);
          for (var x = Math.round(a); x <= Math.round(b); x++) setCell(g, y, x, color);
        }
      }
    }
    function edgeX(ax, ay, bx, by, y, out) {
      if ((y < ay && y < by) || (y > ay && y > by)) return;
      if (ay === by) return;
      var t = (y - ay) / (by - ay);
      out.push(ax + (bx - ax) * t);
    }

    var BUILDERS = {};

    // ---- REFINED IRON INGOT (reskin) ---------------------------------
    BUILDERS.ingot = function () {
      var g = emptyGrid();
      for (var r = 13; r <= 21; r++) {
        var t = (r - 13) / 8, cL = 10 - Math.round(t * 4), cR = 22 + Math.round(t * 4), w = cR - cL;
        for (var c = cL; c <= cR; c++) {
          var b = 0.86 - ((c - cL) / w) * 0.5;
          if (r === 13) b += 0.16; if (r === 21) b -= 0.24;
          setCell(g, r, c, shade(STEEL, Math.max(0.05, Math.min(1, b))));
        }
      }
      for (var sr = 15; sr <= 18; sr++) for (var sc = 14; sc <= 19; sc++) setCell(g, sr, sc, shade(STEEL, 0.22));
      setCell(g, 16, 15, STEEL[4]); setCell(g, 16, 18, STEEL[4]); setCell(g, 17, 16, STEEL[1]);
      return outline(g);
    };

    // ---- POLISHED QUARTZ (reskin) ------------------------------------
    BUILDERS.crystal = function () {
      var g = emptyGrid();
      for (var r = 10; r <= 26; r++) {
        for (var c = 12; c <= 15; c++) setCell(g, r, c, AQUA[3]);
        for (var c2 = 17; c2 <= 20; c2++) setCell(g, r, c2, AQUA[1]);
        setCell(g, r, 16, AQUA[4]);
      }
      for (var r2 = 6; r2 <= 9; r2++) {
        var hw = r2 - 5;
        for (var c3 = 16 - hw; c3 <= 16 + hw; c3++) setCell(g, r2, c3, c3 < 16 ? AQUA[3] : (c3 > 16 ? AQUA[1] : AQUA[4]));
      }
      for (var c4 = 12; c4 <= 20; c4++) setCell(g, 26, c4, AQUA[0]);
      setCell(g, 12, 13, '#ffffff'); setCell(g, 13, 13, AQUA[4]); setCell(g, 18, 14, AQUA[4]);
      return outline(g);
    };

    // ---- COAL BRICKS (reskin) ----------------------------------------
    BUILDERS.brick = function () {
      var g = emptyGrid();
      function slab(x0, y0, x1, y1) {
        box(g, x0, y0, x1, y1, COAL);
        for (var c = x0; c <= x1; c++) { setCell(g, y0, c, shade(COAL, 0.7)); setCell(g, y1, c, shade(COAL, 0.06)); }
        setCell(g, Math.round((y0 + y1) / 2), x0 + 3, shade(COAL, 0.85));
        setCell(g, y0 + 1, x1 - 4, shade(COAL, 0.55));
      }
      slab(7, 17, 22, 24);
      slab(10, 9, 25, 16);
      return outline(g);
    };

    // ---- COPPER WIRE SPOOL (reskin) ----------------------------------
    BUILDERS.spool = function () {
      var g = emptyGrid();
      box(g, 8, 6, 10, 26, WOOD); box(g, 21, 6, 23, 26, WOOD);
      for (var r = 9; r <= 23; r++) {
        var band = (r % 2 === 0);
        for (var c = 11; c <= 20; c++) setCell(g, r, c, band ? COPPER[3] : COPPER[1]);
        setCell(g, r, 12, COPPER[4]);
      }
      setCell(g, 8, 9, WOOD[4]); setCell(g, 8, 22, WOOD[4]);
      return outline(g);
    };

    // ---- STRANGE FOSSIL (reskin) -------------------------------------
    BUILDERS.fossil = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 11, STONE, 0.32);
      var sa = 0, sr = 1.1;
      for (var i = 0; i < 72; i++) {
        sa += 0.4; sr += 0.125;
        setCell(g, 16 + Math.sin(sa) * sr, 16 + Math.cos(sa) * sr, BONE[i % 2 ? 3 : 2]);
      }
      setCell(g, 11, 13, BONE[4]);
      return outline(g);
    };

    // ---- ANTIQUE COG (reskin) ----------------------------------------
    BUILDERS.cog = function () {
      var g = emptyGrid();
      var teeth = 8;
      for (var t = 0; t < teeth; t++) {
        var a = t / teeth * Math.PI * 2, tx = 16 + Math.cos(a) * 12, ty = 16 + Math.sin(a) * 12;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) setCell(g, ty + dr, tx + dc, BRASS[2]);
      }
      disc(g, 16, 16, 10, BRASS, 0.28);
      for (var rr = -3; rr <= 3; rr++) for (var cc = -3; cc <= 3; cc++) if (rr * rr + cc * cc <= 9) setCell(g, 16 + rr, 16 + cc, INK);
      disc(g, 16, 16, 2.2, BRASS, 0.3);
      setCell(g, 12, 12, BRASS[4]);
      return outline(g);
    };

    // ---- BOTTLED LIGHTNING (reskin) ----------------------------------
    BUILDERS.bottle = function () {
      var g = emptyGrid();
      box(g, 14, 4, 17, 7, WOOD);                 // cork
      box(g, 14, 8, 17, 10, GLASS);               // neck
      vcyl(g, 11, 10, 20, 27, GLASS);             // body
      var bolt = [[12, 16], [13, 15], [14, 16], [15, 15], [16, 17], [17, 16], [18, 17], [19, 16], [20, 15], [21, 16], [22, 17], [23, 16], [24, 17], [25, 16]];
      for (var i = 0; i < bolt.length; i++) {
        setCell(g, bolt[i][0], bolt[i][1], i % 3 === 0 ? '#ffffff' : AQUA[4]);
        setCell(g, bolt[i][0], bolt[i][1] - 1, AQUA[3]);
      }
      for (var r = 12; r <= 26; r++) setCell(g, r, 12, GLASS[4]);
      return outline(g);
    };

    // ---- SEALED LETTER (reskin) --------------------------------------
    BUILDERS.letter = function () {
      var g = emptyGrid();
      box(g, 6, 10, 25, 23, PAPER);
      for (var k = 0; k <= 9; k++) { setCell(g, 10 + k, 6 + k, shade(PAPER, 0.32)); setCell(g, 10 + k, 25 - k, shade(PAPER, 0.32)); }
      setCell(g, 10, 6, PAPER[4]);
      disc(g, 16, 17, 3.3, REDST, 0.25);
      setCell(g, 16, 16, REDST[1]);
      return outline(g);
    };

    // ---- SILVER BAR --------------------------------------------------
    BUILDERS.silverbar = function () {
      var g = emptyGrid();
      for (var r = 13; r <= 21; r++) {
        var t = (r - 13) / 8, cL = 10 - Math.round(t * 4), cR = 22 + Math.round(t * 4), w = cR - cL;
        for (var c = cL; c <= cR; c++) {
          var b = 0.9 - ((c - cL) / w) * 0.55;
          if (r === 13) b += 0.14; if (r === 21) b -= 0.26;
          setCell(g, r, c, shade(SILVER, Math.max(0.06, Math.min(1, b))));
        }
      }
      line(g, 12, 15, 17, 13, SILVER[4]);          // diagonal shine
      for (var sr = 16; sr <= 18; sr++) for (var sc = 15; sc <= 18; sc++) setCell(g, sr, sc, shade(SILVER, 0.3));
      return outline(g);
    };

    // ---- GOLD BAR (stacked bullion) ----------------------------------
    BUILDERS.goldbar = function () {
      var g = emptyGrid();
      function bar(yc) {
        for (var r = yc; r <= yc + 6; r++) {
          var t = (r - yc) / 6, cL = 9 - Math.round(t * 3), cR = 22 + Math.round(t * 3), w = cR - cL;
          for (var c = cL; c <= cR; c++) {
            var b = 0.9 - ((c - cL) / w) * 0.5;
            if (r === yc) b += 0.14; if (r === yc + 6) b -= 0.24;
            setCell(g, r, c, shade(GOLD, Math.max(0.08, Math.min(1, b))));
          }
        }
      }
      bar(17); bar(9);
      setCell(g, 9, 12, GOLD[4]); setCell(g, 17, 13, GOLD[4]);
      return outline(g);
    };

    // ---- BOTTLE OF WHISKEY -------------------------------------------
    BUILDERS.whiskey = function () {
      var g = emptyGrid();
      box(g, 14, 3, 17, 6, WOOD);                  // cork
      box(g, 14, 6, 17, 9, AMBER);                 // neck
      vcyl(g, 11, 9, 20, 27, AMBER);               // amber body
      box(g, 12, 15, 19, 21, PAPER);               // label
      setCell(g, 18, 16, REDST[2]); setCell(g, 18, 18, REDST[2]);
      for (var r = 11; r <= 26; r++) setCell(g, r, 12, AMBER[4]);
      return outline(g);
    };

    // ---- STICK OF DYNAMITE -------------------------------------------
    BUILDERS.dynamite = function () {
      var g = emptyGrid();
      vcyl(g, 12, 9, 19, 27, REDST);               // red stick
      box(g, 12, 14, 19, 18, PAPER);               // banded label
      setCell(g, 16, 14, REDST[2]); setCell(g, 16, 17, REDST[2]);
      qbez(g, [16, 9], [21, 4], [25, 6], HEMP[1]); // fuse
      setCell(g, 25, 6, HEAT[4]); setCell(g, 24, 6, HEAT[3]); setCell(g, 25, 7, HEAT[2]); // spark
      for (var r = 11; r <= 26; r++) setCell(g, r, 13, REDST[3]);
      return outline(g);
    };

    // ---- MINER'S LANTERN ---------------------------------------------
    BUILDERS.lantern = function () {
      var g = emptyGrid();
      qbez(g, [11, 8], [16, 2], [21, 8], BRASS[3]); // handle
      box(g, 12, 7, 19, 9, BRASS);                  // top cap
      vcyl(g, 11, 9, 20, 23, GLASS);                // glass globe
      for (var r = 14; r <= 22; r++) {              // flame
        var t = (r - 14) / 8, hw = Math.round(3 * (1 - t)); if (hw < 0) hw = 0;
        for (var c = 16 - hw; c <= 16 + hw; c++) setCell(g, r, c, shade(HEAT, 0.45 + t * 0.5 - Math.abs(c - 16) * 0.12));
      }
      setCell(g, 13, 16, HEAT[4]);
      box(g, 11, 23, 20, 26, BRASS);                // base
      return outline(g);
    };

    // ---- TURQUOISE ---------------------------------------------------
    BUILDERS.turquoise = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 10, TURQ, 0.4);
      line(g, 9, 13, 16, 11, shade(STONE, 0.1));    // matrix veins
      line(g, 16, 11, 23, 17, shade(STONE, 0.1));
      line(g, 12, 20, 19, 22, shade(STONE, 0.15));
      setCell(g, 12, 12, TURQ[4]); setCell(g, 13, 13, TURQ[4]);
      return outline(g);
    };

    // ---- JAR OF GLOWMILK ---------------------------------------------
    BUILDERS.glowmilk = function () {
      var g = emptyGrid();
      box(g, 11, 6, 20, 9, BRASS);                  // lid
      vcyl(g, 10, 9, 21, 26, GLASS);                // jar glass
      for (var r = 13; r <= 25; r++) for (var c = 11; c <= 20; c++) {  // glowing fill
        var b = 0.55 + 0.4 * Math.sin((c - 11) * 0.5) - (r - 13) * 0.02;
        setCell(g, r, c, shade(GLOW, Math.max(0.3, Math.min(1, b))));
      }
      setCell(g, 14, 13, GLOW[4]); setCell(g, 16, 16, GLOW[4]); setCell(g, 20, 14, GLOW[4]);
      for (var r2 = 10; r2 <= 25; r2++) setCell(g, r2, 11, GLASS[4]);
      return outline(g);
    };

    // ---- FALLEN-STAR IRON (meteorite) --------------------------------
    BUILDERS.meteorite = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 10.5, IRON, 0.22);
      disc(g, 13, 13, 2.4, IRON, 0.08);             // craters
      disc(g, 20, 18, 2.0, IRON, 0.08);
      disc(g, 14, 21, 1.6, IRON, 0.1);
      setCell(g, 12, 12, HEAT[3]); setCell(g, 11, 13, HEAT[2]); // faint ember
      setCell(g, 18, 13, IRON[4]); setCell(g, 13, 18, IRON[4]);
      return outline(g);
    };

    // ---- ROCK SALT ---------------------------------------------------
    BUILDERS.saltblock = function () {
      var g = emptyGrid();
      box(g, 10, 13, 21, 24, SALT);
      box(g, 8, 9, 15, 14, SALT);                  // chunk upper-left
      line(g, 10, 18, 21, 18, shade(SALT, 0.45));  // facet seams
      line(g, 15, 14, 15, 24, shade(SALT, 0.45));
      for (var c = 10; c <= 21; c++) setCell(g, 13, c, SALT[4]);
      for (var c2 = 8; c2 <= 15; c2++) setCell(g, 9, c2, SALT[4]);
      setCell(g, 11, 11, '#ffffff'); setCell(g, 16, 19, SALT[4]);
      return outline(g);
    };

    // ---- BRIMSTONE (sulfur) ------------------------------------------
    BUILDERS.sulfur = function () {
      var g = emptyGrid();
      disc(g, 14, 17, 6.5, SULFUR, 0.35);
      disc(g, 21, 18, 5.5, SULFUR, 0.3);
      disc(g, 18, 12, 4.5, SULFUR, 0.42);
      setCell(g, 12, 11, '#fff8c0'); setCell(g, 16, 10, SULFUR[4]); setCell(g, 19, 21, SULFUR[4]);
      setCell(g, 18, 16, SULFUR[0]); setCell(g, 20, 15, SULFUR[0]);
      return outline(g);
    };

    // ---- SALTPETER (niter crust) -------------------------------------
    BUILDERS.niter = function () {
      var g = emptyGrid();
      disc(g, 16, 21, 8, STONE, 0.3);              // host rock
      var tips = [[16, 7], [12, 10], [20, 9], [14, 12], [22, 13], [18, 8]];
      for (var i = 0; i < tips.length; i++) {
        line(g, 16, 20, tips[i][0], tips[i][1], SALT[3]);
        setCell(g, tips[i][1], tips[i][0], SALT[4]);
      }
      return outline(g);
    };

    // ---- RAW SILVER ORE ----------------------------------------------
    BUILDERS.silverore = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 10, STONE, 0.32);
      line(g, 11, 11, 17, 15, SILVER[4]); line(g, 17, 15, 22, 12, SILVER[3]);
      line(g, 13, 21, 20, 18, SILVER[4]);
      setCell(g, 12, 14, SILVER[4]); setCell(g, 19, 20, SILVER[4]);
      setCell(g, 15, 11, SILVER[3]); setCell(g, 21, 16, SILVER[4]);
      return outline(g);
    };

    // ---- GOLD DUST (pouch) -------------------------------------------
    BUILDERS.golddust = function () {
      var g = emptyGrid();
      disc(g, 16, 20, 8, LEATHER, 0.3);            // pouch body
      box(g, 13, 11, 19, 14, LEATHER);             // cinched neck
      setCell(g, 12, 13, LEATHER[1]); setCell(g, 12, 17, LEATHER[1]);
      var grains = [[14, 9], [16, 8], [18, 10], [15, 11], [17, 9], [13, 11], [19, 12]];
      for (var i = 0; i < grains.length; i++) setCell(g, grains[i][1], grains[i][0], i % 2 ? GOLD[4] : GOLD[3]);
      setCell(g, 19, 13, LEATHER[4]);
      return outline(g);
    };

    // ---- LEAD PIG ----------------------------------------------------
    BUILDERS.leadpig = function () {
      var g = emptyGrid();
      hcyl(g, 6, 14, 26, 22, LEAD);
      setCell(g, 18, 12, LEAD[1]); setCell(g, 17, 19, LEAD[1]); setCell(g, 19, 22, LEAD[1]);
      for (var c = 8; c <= 24; c++) if (c % 3 === 0) setCell(g, 15, c, LEAD[3]);
      return outline(g);
    };

    // ---- FLASK OF QUICKSILVER ----------------------------------------
    BUILDERS.quicksilver = function () {
      var g = emptyGrid();
      box(g, 15, 3, 17, 5, WOOD);                  // cork
      box(g, 14, 5, 18, 12, GLASS);                // neck
      disc(g, 16, 19, 8.5, GLASS, 0.45);           // bulb glass
      disc(g, 16, 21, 6, SILVER, 0.5);             // mercury pool
      setCell(g, 19, 23, SILVER[4]); setCell(g, 13, 17, '#ffffff');
      for (var r = 6; r <= 11; r++) setCell(g, r, 15, GLASS[4]);
      return outline(g);
    };

    // ---- RAIL SPIKE --------------------------------------------------
    BUILDERS.railspike = function () {
      var g = emptyGrid();
      box(g, 11, 7, 20, 10, IRON);                 // head
      setCell(g, 7, 12, IRON[4]);                   // top-left lip
      for (var r = 10; r <= 25; r++) {
        var t = (r - 10) / 15, hw = 3 - Math.round(t * 2);
        var cL = 15 - hw, cR = 16 + hw, w = Math.max(1, cR - cL);
        for (var c = cL; c <= cR; c++) setCell(g, r, c, shade(IRON, Math.max(0.1, 0.85 - ((c - cL) / w) * 0.55)));
      }
      setCell(g, 26, 16, IRON[1]);
      for (var r2 = 11; r2 <= 24; r2++) setCell(g, r2, 14, IRON[4]);
      return outline(g);
    };

    // ---- KEG OF NAILS ------------------------------------------------
    BUILDERS.nailkeg = function () {
      var g = emptyGrid();
      vcyl(g, 9, 12, 22, 27, WOOD);                // keg body
      box(g, 9, 13, 22, 14, IRON); box(g, 9, 25, 22, 26, IRON); // hoops
      var nails = [[13, 6], [16, 5], [19, 6], [15, 8], [18, 8]];
      for (var i = 0; i < nails.length; i++) {
        line(g, 16, 12, nails[i][0], nails[i][1], IRON[3]);
        setCell(g, nails[i][1], nails[i][0], IRON[4]); setCell(g, nails[i][1], nails[i][0] - 1, IRON[4]);
      }
      return outline(g);
    };

    // ---- PICKAXE -----------------------------------------------------
    BUILDERS.pickhead = function () {
      var g = emptyGrid();
      for (var i = 0; i <= 22; i++) {               // wooden haft (diagonal)
        var t = i / 22, hc = 8 + t * 13, hr = 27 - t * 18;
        setCell(g, hr, hc, WOOD[2]); setCell(g, hr, hc + 1, WOOD[3]); setCell(g, hr + 1, hc, WOOD[1]);
      }
      tri(g, 16, 8, 16, 12, 5, 14, IRON[2]);        // curved head, left arm
      tri(g, 16, 8, 16, 12, 27, 14, IRON[2]);       // right arm
      setCell(g, 14, 4, IRON[1]); setCell(g, 14, 28, IRON[1]); // drooped tips
      line(g, 6, 13, 16, 8, IRON[4]); line(g, 16, 8, 26, 13, IRON[3]); // top sheen
      setCell(g, 11, 16, IRON[4]); setCell(g, 12, 16, IRON[0]); // socket eye
      return outline(g);
    };

    // ---- LUCKY HORSESHOE ---------------------------------------------
    BUILDERS.horseshoe = function () {
      var g = emptyGrid();
      for (var r = 6; r <= 25; r++) for (var c = 7; c <= 25; c++) {
        var dx = c - 16, dy = r - 14, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 6 || d > 9) continue;
        if (dy > 4 && Math.abs(dx) < 4) continue;   // open heel gap
        setCell(g, r, c, shade(IRON, Math.max(0.16, 0.86 - dx / 20 - dy / 26)));
      }
      var holes = [[16, 7], [10, 9], [8, 14], [22, 9], [24, 14]];
      for (var i = 0; i < holes.length; i++) setCell(g, holes[i][1], holes[i][0], INK);
      return outline(g);
    };

    // ---- LAMP OIL (tin) ----------------------------------------------
    BUILDERS.lampoil = function () {
      var g = emptyGrid();
      box(g, 9, 12, 21, 26, STEEL);                 // tin body
      box(g, 13, 9, 18, 12, STEEL);                 // cap
      box(g, 11, 16, 19, 22, AMBER);                // oil window
      setCell(g, 19, 15, AMBER[1]);
      qbez(g, [21, 13], [26, 11], [27, 9], STEEL[3]); // spout
      for (var r = 12; r <= 25; r++) setCell(g, r, 10, STEEL[4]); // edge sheen
      return outline(g);
    };

    // ---- COIL OF ROPE ------------------------------------------------
    BUILDERS.rope = function () {
      var g = emptyGrid();
      for (var r = 6; r <= 26; r++) for (var c = 6; c <= 26; c++) {
        var dx = c - 16, dy = r - 16, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 5 || d > 10) continue;
        var ang = Math.atan2(dy, dx);
        var strand = (Math.round(ang * 6 + d) % 2 === 0);
        setCell(g, r, c, strand ? HEMP[3] : HEMP[1]);
      }
      qbez(g, [18, 25], [22, 29], [25, 26], HEMP[2]); // loose end
      setCell(g, 11, 12, HEMP[4]);
      return outline(g);
    };

    // ---- POWDER KEG --------------------------------------------------
    BUILDERS.powderkeg = function () {
      var g = emptyGrid();
      vcyl(g, 8, 9, 23, 27, WOOD);                  // barrel
      box(g, 8, 11, 23, 12, IRON); box(g, 8, 17, 23, 18, IRON); box(g, 8, 25, 23, 26, IRON); // hoops
      // black powder diamond mark
      tri(g, 15, 19, 12, 22, 18, 22, COAL[1]); tri(g, 15, 25, 12, 22, 18, 22, COAL[1]);
      qbez(g, [15, 9], [19, 4], [23, 6], HEMP[1]);  // fuse
      setCell(g, 23, 6, HEAT[4]); setCell(g, 22, 6, HEAT[3]);
      return outline(g);
    };

    // ---- BRASS POCKET WATCH ------------------------------------------
    BUILDERS.pocketwatch = function () {
      var g = emptyGrid();
      disc(g, 16, 6, 2.4, BRASS, 0.3); setCell(g, 6, 16, INK); // bow ring
      disc(g, 16, 18, 8.5, BRASS, 0.3);             // case
      disc(g, 16, 18, 6.2, SALT, 0.6);              // face
      var ticks = [[16, 12], [22, 18], [16, 24], [10, 18]];
      for (var i = 0; i < ticks.length; i++) setCell(g, ticks[i][1], ticks[i][0], STONE[1]);
      line(g, 16, 18, 16, 14, INK); line(g, 16, 18, 19, 20, INK); // hands
      setCell(g, 18, 16, BRASS[1]);
      setCell(g, 12, 13, BRASS[4]);
      return outline(g);
    };

    // ---- SURVEYOR'S COMPASS ------------------------------------------
    BUILDERS.compass = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 9.5, BRASS, 0.3);             // case
      disc(g, 16, 16, 7, SALT, 0.55);               // face
      line(g, 16, 16, 12, 11, REDST[3]); line(g, 12, 11, 16, 16, REDST[2]); // N needle (red)
      line(g, 16, 16, 20, 21, SALT[1]);             // S needle
      setCell(g, 8, 16, REDST[2]);                  // N marker
      setCell(g, 16, 16, BRASS[1]);
      setCell(g, 11, 11, BRASS[4]);
      return outline(g);
    };

    // ---- TELEGRAPH KEY -----------------------------------------------
    BUILDERS.telegraphkey = function () {
      var g = emptyGrid();
      box(g, 6, 22, 26, 27, WOOD);                  // base
      box(g, 9, 17, 11, 22, BRASS); box(g, 20, 17, 22, 22, BRASS); // posts
      box(g, 11, 16, 23, 18, BRASS);                // lever arm
      disc(g, 10, 17, 3, COAL, 0.35);               // knob
      setCell(g, 16, 22, BRASS[4]);                 // pivot screw
      setCell(g, 24, 8, BRASS[3]); setCell(g, 24, 24, BRASS[3]); // terminals
      return outline(g);
    };

    // ---- SACK OF COFFEE ----------------------------------------------
    BUILDERS.coffeesack = function () {
      var g = emptyGrid();
      box(g, 9, 15, 23, 26, HEMP);                 // sack body
      setCell(g, 15, 9, 0); setCell(g, 15, 23, 0); // round top corners
      box(g, 13, 10, 19, 15, HEMP);                // cinched neck
      setCell(g, 11, 13, HEMP[1]); setCell(g, 11, 18, HEMP[1]); // tie ears
      for (var r = 17; r <= 25; r += 2) for (var c = 11; c <= 21; c += 2) setCell(g, r, c, HEMP[1]); // weave
      setCell(g, 26, 11, COFFEE[3]); setCell(g, 27, 13, COFFEE[2]); // spilled beans
      setCell(g, 26, 20, COFFEE[3]); setCell(g, 27, 18, COFFEE[2]);
      setCell(g, 17, 11, HEMP[4]);
      return outline(g);
    };

    // ---- TWIST OF TOBACCO --------------------------------------------
    BUILDERS.tobacco = function () {
      var g = emptyGrid();
      for (var r = 8; r <= 26; r++) {
        var t = (r - 8) / 18, hw = Math.round(4 * (1 - t * 0.4)), off = Math.round(Math.sin(r * 0.6) * 1.6);
        for (var c = 16 - hw + off; c <= 16 + hw + off; c++) setCell(g, r, c, ((r + c) % 3 === 0) ? TOBAC[1] : TOBAC[3]);
      }
      setCell(g, 7, 15, HEMP[3]); setCell(g, 7, 17, HEMP[3]); setCell(g, 6, 16, HEMP[2]); // tie
      setCell(g, 12, 14, TOBAC[4]);
      return outline(g);
    };

    // ---- BEAVER PELT -------------------------------------------------
    BUILDERS.pelt = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 10, PELT, 0.32);
      tri(g, 7, 8, 11, 14, 6, 15, PELT[2]); tri(g, 25, 8, 21, 14, 26, 15, PELT[2]);  // fore legs
      tri(g, 8, 26, 12, 21, 7, 23, PELT[1]); tri(g, 24, 26, 20, 21, 25, 23, PELT[1]); // hind legs
      for (var i = 0; i < 16; i++) setCell(g, 9 + (i * 7) % 14, 10 + (i * 5) % 13, i % 2 ? PELT[1] : PELT[4]); // fur
      line(g, 16, 9, 16, 23, PELT[1]);             // dorsal stripe
      return outline(g);
    };

    // ---- BOLT OF CALICO ----------------------------------------------
    BUILDERS.calico = function () {
      var g = emptyGrid();
      hcyl(g, 6, 12, 26, 22, PAPER);               // cloth roll
      for (var r = 12; r <= 22; r++) { setCell(g, r, 24, PAPER[1]); setCell(g, r, 26, PAPER[1]); } // folds
      for (var pr = 14; pr <= 20; pr += 2) for (var pc = 9; pc <= 22; pc += 3) setCell(g, pr, pc, (pc % 2 === 0) ? REDST[3] : '#3a5a9a'); // print
      for (var c = 7; c <= 25; c++) setCell(g, 12, c, PAPER[4]);
      return outline(g);
    };

    // ---- FIRE OPAL ---------------------------------------------------
    BUILDERS.opal = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 9, SALT, 0.5);               // milky body
      var fl = [[13, 13, HEAT[3]], [18, 14, VERDI[3]], [15, 18, AQUA[3]], [20, 18, REDST[3]], [12, 17, AQUA[4]], [17, 12, HEAT[4]], [19, 21, VERDI[4]]];
      for (var i = 0; i < fl.length; i++) setCell(g, fl[i][1], fl[i][0], fl[i][2]);
      setCell(g, 12, 12, '#ffffff');
      return outline(g);
    };

    // ---- DIAMOND -----------------------------------------------------
    BUILDERS.diamond = function () {
      var g = emptyGrid();
      tri(g, 11, 10, 21, 10, 16, 14, DIAMND[4]);   // table
      tri(g, 11, 10, 8, 14, 16, 14, DIAMND[3]);    // crown L
      tri(g, 21, 10, 24, 14, 16, 14, DIAMND[2]);   // crown R
      tri(g, 8, 14, 16, 14, 16, 26, DIAMND[2]);    // pavilion L
      tri(g, 24, 14, 16, 14, 16, 26, DIAMND[1]);   // pavilion R
      for (var c = 8; c <= 24; c++) setCell(g, 14, c, DIAMND[3]); // girdle
      setCell(g, 11, 13, '#ffffff'); setCell(g, 12, 12, DIAMND[4]);
      return outline(g);
    };

    // ---- AUTOMATON FINGER --------------------------------------------
    BUILDERS.brassfinger = function () {
      var g = emptyGrid();
      vcyl(g, 13, 8, 18, 13, BRASS); setCell(g, 7, 15, BRASS[3]); setCell(g, 7, 16, BRASS[3]); // tip
      box(g, 12, 13, 19, 15, BRASS);               // knuckle
      vcyl(g, 13, 15, 18, 21, BRASS);              // mid
      box(g, 12, 21, 19, 23, BRASS);               // knuckle
      vcyl(g, 13, 23, 18, 27, BRASS);              // base
      setCell(g, 14, 13, BRASS[0]); setCell(g, 17, 13, BRASS[0]);
      setCell(g, 14, 21, BRASS[0]); setCell(g, 17, 21, BRASS[0]);
      qbez(g, [16, 27], [22, 28], [24, 25], COPPER[3]); // dangling wire
      for (var r = 9; r <= 26; r++) setCell(g, r, 14, BRASS[4]);
      return outline(g);
    };

    // ---- BLACK CROW FEATHER ------------------------------------------
    BUILDERS.crowfeather = function () {
      var g = emptyGrid();
      qbez(g, [11, 27], [15, 16], [19, 6], CROW[2]); // rachis
      for (var i = 0; i < 18; i++) {
        var t = i / 18, sc = 11 + t * 8, sr = 27 - t * 21;
        var len = 5 * (1 - Math.abs(t - 0.45) * 1.1); if (len < 1) len = 1;
        var col = (i % 3 === 0) ? CROW[3] : CROW[1];
        line(g, sc, sr, sc - len, sr - len * 0.5, col);
        line(g, sc, sr, sc + len, sr + len * 0.4, col);
      }
      setCell(g, 14, 15, '#3a6a9a'); setCell(g, 18, 17, '#5a4a8a'); setCell(g, 11, 18, CROW[4]);
      return outline(g);
    };

    // ---- SINGING GEODE -----------------------------------------------
    BUILDERS.geode = function () {
      var g = emptyGrid();
      disc(g, 16, 16, 11, STONE, 0.3);             // rock shell
      disc(g, 16, 16, 7, COAL, 0.22);              // hollow cavity
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * Math.PI * 2;
        line(g, 16 + Math.cos(ang) * 7, 16 + Math.sin(ang) * 7, 16 + Math.cos(ang) * 3.5, 16 + Math.sin(ang) * 3.5, (a % 2) ? ARCANE[3] : ARCANE[2]);
        setCell(g, 16 + Math.sin(ang) * 3.5, 16 + Math.cos(ang) * 3.5, ARCANE[4]);
      }
      setCell(g, 16, 16, ARCANE[4]); setCell(g, 11, 11, STONE[4]);
      return outline(g);
    };

    // ---- SALT-FLAT IDOL ----------------------------------------------
    BUILDERS.saltidol = function () {
      var g = emptyGrid();
      disc(g, 16, 9, 4, SALT, 0.5);                // faceless head
      for (var r = 12; r <= 26; r++) {             // tapering body
        var hw = Math.round(3 + (r - 12) * 0.45);
        for (var c = 16 - hw; c <= 16 + hw; c++) setCell(g, r, c, shade(SALT, Math.max(0.18, 0.85 - ((c - (16 - hw)) / Math.max(1, 2 * hw)) * 0.5)));
      }
      setCell(g, 15, 10, SALT[2]); setCell(g, 16, 9, SALT[2]); setCell(g, 15, 22, SALT[2]); setCell(g, 16, 23, SALT[2]); // stub arms
      line(g, 16, 13, 16, 25, shade(SALT, 0.4));
      setCell(g, 8, 14, '#ffffff');
      return outline(g);
    };

    var cache = {};
    function bitmap(kind) {
      if (cache[kind]) return cache[kind];
      var build = BUILDERS[kind]; if (!build) return null;
      var g = build();
      var off = document.createElement('canvas'); off.width = N; off.height = N;
      var o = off.getContext('2d');
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var v = g[r][c]; if (v === 0 || v == null) continue;
        o.fillStyle = v; o.fillRect(c, r, 1, 1);
      }
      cache[kind] = off; return off;
    }
    function kinds() { return Object.keys(BUILDERS); }
    return { bitmap: bitmap, kinds: kinds, SIZE: N };
  })();
