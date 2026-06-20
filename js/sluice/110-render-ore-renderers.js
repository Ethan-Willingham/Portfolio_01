  function oreUnderlayKind(n) {
    if (n.upKind === 'stone' || n.downKind === 'stone' || n.leftKind === 'stone' || n.rightKind === 'stone') {
      return 'stone';
    }
    if (n.upKind === 'dirt' || n.downKind === 'dirt' || n.leftKind === 'dirt' || n.rightKind === 'dirt') {
      return 'dirt';
    }
    return null;
  }

  function oreDepositSalt(type) {
    var salt = 0x91;
    for (var i = 0; i < type.length; i++) {
      salt = ((salt * 33) ^ type.charCodeAt(i)) & 0x7fffffff;
    }
    return salt;
  }

  // Renderer dispatch by Containment (MINERALS_BIBLE §3 Axis 8 / §6).
  // The clip shape this function produces is the ore's footprint inside
  // the tile. Banded-strata containment (coal) gets a full-tile clip;
  // every other mineral today is massive-nodule and gets a wiggly oval
  // blob.
  //
  // The blob shape is keyed entirely off (r, c) — neighbor queries are
  // intentionally NOT used. Earlier versions read `n.leftKind` etc. and
  // appended bridge subpaths into matching neighbours, which made the
  // survivor's outline mutate when its neighbour was mined (forbidden
  // by §3 Axis 8 "Anti-pattern" and §7 "no tile is alone, but mining
  // one tile must not reshape its neighbour"). Vein-aware rendering
  // for gold/silver/copper is on the roadmap as a separate, opt-in
  // pass — not via this function.
  //
  // The `n` parameter is kept for API compatibility but unused.
  function oreDepositPath(tx, ty, r, c, type /* , n */) {
    // v16.6 — every ore clips to the full tile rect. The ore renderers
    // now spread their features across the whole tile (the coal/copper
    // model), so there is no oval deposit shape any more; the clip is
    // kept only to stop a feature bleeding past the tile boundary.
    ctx.beginPath();
    ctx.rect(tx, ty, TILE, TILE);
  }

  // ===== v16.6 — Ore rendering system =====================================
  // Rebuilt on the coal/copper/bauxite/iron model. Those reference ores
  // never draw a smooth clipped shape: each breaks the ore into several
  // small features spread across the WHOLE tile, with the dirt/stone host
  // showing between them. No painted host, no oval — the ore reads as
  // mineral set into the rock, and a patch of ore tiles merges into one
  // continuous deposit instead of a grid of circles.
  //
  // All geometry is keyed only on (r,c) via tileHash01 — no neighbour
  // reads — so mining a tile never reshapes a survivor. Fully static.

  // v16.9 — feature anchor points for ONE ore tile, as a centred,
  // irregular CLUMP (the coal model). The cluster sits in the middle of
  // the tile and leaves a clear dirt margin all round, so the ore reads
  // as mineral embedded IN the dirt host — NOT a full-tile texture, and
  // NOT a smooth oval. One feature at the clump centre, the rest in a
  // jittered ring around it; the ragged ring + varied feature sizes give
  // the clump an irregular outline like coal's shard cluster.
  function oreScatter(tx, ty, r, c, seed, minN, maxN) {
    var n = minN + ((tileHash01(r, c, seed) * (maxN - minN + 0.99)) | 0);
    if (n > 5) n = 5; else if (n < 4) n = 4;     // 4-5 features — a clump, not a fill
    var ccx = tx + 16 + Math.round((tileHash01(r, c, seed + 1) - 0.5) * 3);
    var ccy = ty + 16 + Math.round((tileHash01(r, c, seed + 2) - 0.5) * 3);
    var pts = [{ x: ccx, y: ccy }];
    var base = tileHash01(r, c, seed + 3) * 6.283;
    for (var i = 1; i < n; i++) {
      var ang = base + ((i - 1) / (n - 1)) * 6.283
                + (tileHash01(r, c, seed + 40 + i) - 0.5) * 1.5;
      var rad = 2 + tileHash01(r, c, seed + 60 + i) * 3.6;       // 2 .. 5.6
      pts.push({
        x: ccx + Math.round(Math.cos(ang) * rad),
        y: ccy + Math.round(Math.sin(ang) * rad)
      });
    }
    return pts;
  }

  // One faceted crystal — an octahedral rhombus: four facets (top-left
  // lit), a centre seam, a hue-shifted rim, a specular. ramp needs
  // {out, seam, shadow, base, light, shine}. Tall halfH reads column-like
  // (emerald), equal reads equant (ruby), balanced reads octahedral.
  function drawGemFacet(cx, cy, halfW, halfH, ramp) {
    cx = cx | 0; cy = cy | 0;
    for (var dy = -halfH; dy <= halfH; dy++) {
      var rw = Math.round(halfW * (1 - Math.abs(dy) / halfH));
      for (var dx = -rw; dx <= rw; dx++) {
        var fill;
        if (dx === -rw || dx === rw || Math.abs(dy) === halfH) fill = ramp.out;
        else if (dx === 0) fill = ramp.seam;
        else if (dx < 0) fill = (dy < 0) ? ramp.light : ramp.base;
        else fill = (dy < 0) ? ramp.base : ramp.shadow;
        ctx.fillStyle = fill;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    ctx.fillStyle = ramp.shine;
    ctx.fillRect(cx - Math.max(1, (halfW * 0.4) | 0), cy - Math.max(1, (halfH * 0.4) | 0), 1, 1);
  }

  // One ragged tilted shard — the coal/iron lozenge primitive. Rasterised
  // column-by-column with a per-column thickness wobble (ragged edge) and
  // a perpendicular tone ramp {out, shadow, base, light, shine}.
  function drawOreShard(cx, cy, halfLen, halfThk, tilt, ramp, r, c, seed) {
    var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    var uMin = -Math.ceil(halfLen), uMax = Math.ceil(halfLen);
    for (var u = uMin; u <= uMax; u++) {
      var ut = u / halfLen;
      var taper = 1 - ut * ut * 0.84;
      if (taper < 0) taper = 0;
      var wob = (tileHash01(r, c, seed + 120 + ((u + 24) * 7)) - 0.5) * 0.7;
      var t = halfThk * taper + wob;
      if (t < 0.42) continue;
      var thk = Math.max(1, Math.round(t * 2));
      var pxC = cx + u * cosT, pyC = cy + u * sinT;
      var half = (thk - 1) * 0.5;
      var tip = (u <= uMin + 1 || u >= uMax - 1);
      for (var v = 0; v < thk; v++) {
        var d = half - v;
        var fill;
        if (v === 0) fill = tip ? ramp.out : ramp.light;
        else if (v === thk - 1) fill = ramp.out;
        else if (v === 1 && thk >= 4) fill = ramp.shine;
        else if (v === thk - 2 && thk >= 5) fill = ramp.shadow;
        else fill = ramp.base;
        ctx.fillStyle = fill;
        ctx.fillRect(Math.floor(pxC + d * sinT), Math.floor(pyC - d * cosT), 1, 1);
      }
    }
  }

  // One ragged rounded grain — the bauxite-pisolith primitive. A filled
  // disc with edge noise (ragged rim) and top-left lighting. ramp needs
  // {out, shadow, base, light}.
  function drawOreGrain(cx, cy, rad, ramp, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    var rMax = Math.ceil(rad + 1);
    for (var dy = -rMax; dy <= rMax; dy++) {
      for (var dx = -rMax; dx <= rMax; dx++) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        var noise = (tileHash01(r, c, seed + 160 + (dx + 10) * 13 + (dy + 10)) - 0.5) * 0.95;
        var rEff = rad + noise;
        if (dist > rEff) continue;
        var lit = (dx + dy) / Math.max(1, rad);
        var fill;
        if (rEff - dist < 0.95) fill = ramp.out;
        else if (lit < -0.5) fill = ramp.light;
        else if (lit > 0.55) fill = ramp.shadow;
        else fill = ramp.base;
        ctx.fillStyle = fill;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  // Thin connecting wires between scatter points — the dendritic habit of
  // native metals. Drawn under the grains so they read as roots.
  function drawOreWires(pts, ramp, r, c, seed) {
    for (var w = 0; w + 1 < pts.length && w < 3; w++) {
      var a = pts[w], b = pts[w + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy < 9) continue;
      drawOreShard((a.x + b.x) * 0.5, (a.y + b.y) * 0.5,
                   Math.sqrt(dx * dx + dy * dy) * 0.5, 0.85,
                   Math.atan2(dy, dx), ramp, r, c, seed + w * 16);
    }
  }

  // ----- The headline gems, rebuilt on the system above -----

  // drawDiamondOre moved to 114-ore-exotic.js — redesigned into a brilliant
  // octahedral host-through renderer with a 4-point sparkle + dispersion (v24.15).

  function drawEmeraldOre(tx, ty, r, c) {
    // Emerald — a rich cluster of tall hexagonal-prism crystals growing
    // from matrix: a dominant hero + 2-3 satellites + a base druse of
    // tiny crystal nubs, the way raw beryl grows. Each prism is read as a
    // TRUE six-sided column (lit-left face, bright vertical FRONT EDGE —
    // the hexagonal tell, translucent GLOW core, shadow-right face) and is
    // terminated either flat (pinacoid) or pointed (pyramid), chosen per
    // crystal. Detail comes from horizontal growth-ZONING bands, a dashed
    // beryl striation, a 1-3 fleck jardin field (the first a bright
    // internal reflection), occasional satellite glints, and the hero's
    // lone specular twinkle. The TALL columnar aspect is emerald's locked
    // signature in the cut-gem family (bible cut-gem lock). Renders
    // host-through (drawEarlyOreBase branch). Keyed only to (r, c).
    var OUT   = '#0a3826';   // outline — a soft dark green, not near-black
    var DEEP  = '#0f4631';   // shadow-right face / grooves — darkest
    var BASE  = '#188a55';   // front face — deep jewel green
    var BASEZ = '#136b4c';   // growth-zoning band — deeper, bluer
    var LIT   = '#34ac6e';   // lit-left face
    var GLOW  = '#5ed79a';   // translucent inner glow / termination facet
    var GLOWH = '#7be6b6';   // hot inner reflection fleck
    var EDGE  = '#9bf0c0';   // bright vertical front edge — the hexagonal tell
    var SHINE = '#eafff4';   // the one specular twinkle

    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xE000) - 0.5) * 3);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xE001) - 0.5) * 3);

    // Rotate a local (u along the column, v across) sample to screen and
    // plot it, clipped to the tile. Shared by every crystal + nub.
    function plotRot(pcx, pcy, cosT, sinT, u, v, tone) {
      var px = Math.round(pcx + v * cosT - u * sinT);
      var py = Math.round(pcy + v * sinT + u * cosT);
      if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) return;
      ctx.fillStyle = tone;
      ctx.fillRect(px, py, 1, 1);
    }

    // One hexagonal-prism crystal. tip 0 = flat termination, 1 = pyramid.
    // detail 1 = hero (zoning + striation + jardin + specular); 0 =
    // satellite/nub (faces + occasional glint, keeps the hero dominant).
    function drawPrism(pcx, pcy, halfLen, halfW, tilt, detail, tip, seed) {
      halfLen = Math.round(halfLen);
      halfW = Math.round(halfW);
      var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      var W = halfW * 2 + 1;                  // column width (px)
      var leftFace = halfW >= 3 ? 2 : 1;      // lit-left face width
      var kEdge = leftFace + 1;               // bright front-edge column
      var capLen = halfLen >= 8 ? 3 : 2;      // flat-termination band height
      var capInset = halfW >= 3 ? 1 : 0;      // flat-top foreshortening
      var tipLen = (tip === 1) ? halfW + 1 : capLen;   // pyramid runs taller
      var stria = (halfW >= 4 && detail >= 1);

      // Two growth-zoning band centres (the 2nd ~50% of the time), keyed
      // per crystal so the deeper-green stripes vary tile to tile.
      var span = halfLen * 2 - 4; if (span < 1) span = 1;
      var zoneA = 2 + ((tileHash01(r, c, seed + 1) * span) | 0);
      var zoneB = (tileHash01(r, c, seed + 2) < 0.5)
                  ? 2 + ((tileHash01(r, c, seed + 3) * span) | 0) : -9;

      for (var u = -halfLen; u <= halfLen; u++) {
        var top = u + halfLen;               // 0 at the crystal tip
        var inTip = top < tipLen;
        var rowHalf = halfW;
        if (inTip) {
          rowHalf = (tip === 1) ? Math.round(halfW * top / tipLen)
                                : halfW - capInset;
        }
        var inZone = (top === zoneA || top === zoneA + 1 ||
                      top === zoneB || top === zoneB + 1);
        for (var v = -rowHalf; v <= rowHalf; v++) {
          var k = v + halfW;                 // 0..W-1 column index
          var tone;
          if (inTip && tip === 1) {
            // Pyramidal termination — bright lit facets, slanted outline.
            if (top === 0) tone = EDGE;                       // sharp apex
            else if (v === -rowHalf || v === rowHalf) tone = OUT;
            else tone = (v < 0) ? EDGE : GLOW;
          } else if (inTip) {
            // Flat (pinacoid) termination — foreshortened bright facet.
            if (top === 0 || v === -rowHalf || v === rowHalf) tone = OUT;
            else tone = (top === 1) ? EDGE : GLOW;
          } else if (u === halfLen) {
            tone = OUT;                       // bottom silhouette
          } else if (k === 0 || k === W - 1) {
            tone = OUT;                       // left / right silhouette
          } else if (k <= leftFace) {
            tone = LIT;                       // lit-left face
          } else if (k === kEdge) {
            tone = EDGE;                      // bright vertical front edge
          } else if (k >= W - 2) {
            tone = DEEP;                      // shadow-right face
          } else if (k === kEdge + 1) {
            tone = inZone ? BASEZ : GLOW;     // translucent glow core
          } else {
            tone = inZone ? BASEZ : BASE;     // jewel-green front face
            if (stria && k === kEdge + 2 &&
                top > capLen + 1 && top < halfLen * 2 - 1 &&
                (top % 5 !== 0)) tone = DEEP; // dashed beryl striation
          }
          plotRot(pcx, pcy, cosT, sinT, u, v, tone);
        }
      }

      // Jardin inclusion field — emerald's signature internal garden.
      // Hero: 1-3 flecks (the first a bright internal reflection); a
      // single large satellite may get one. Quiet, in the front face.
      var nIncl = (detail >= 1)
                  ? 1 + ((tileHash01(r, c, seed + 5) * 3) | 0)
                  : (halfW >= 3 && tileHash01(r, c, seed + 5) < 0.4 ? 1 : 0);
      for (var j = 0; j < nIncl; j++) {
        var ispan = halfLen * 2 - capLen - 4; if (ispan < 1) ispan = 1;
        var iu = -halfLen + capLen + 2 + ((tileHash01(r, c, seed + 10 + j) * ispan) | 0);
        var iv = -1 + ((tileHash01(r, c, seed + 20 + j) * 3) | 0);
        plotRot(pcx, pcy, cosT, sinT, iu, iv, (j === 0) ? GLOWH : DEEP);
      }

      // Specular twinkle (hero) — a hot point on the lit termination plus
      // a 1px tail down the bright front edge. Tip-aware so it always
      // lands on crystal, never bare host. Satellites get an occasional
      // softer glow glint instead (modest emerald flash, bible §3/§6).
      if (detail >= 1) {
        if (tip === 1) {
          plotRot(pcx, pcy, cosT, sinT, -halfLen + 2, -1, SHINE);
          plotRot(pcx, pcy, cosT, sinT, -halfLen + 3, kEdge - halfW, SHINE);
        } else {
          plotRot(pcx, pcy, cosT, sinT, -halfLen, -halfW + capInset + 1, SHINE);
          plotRot(pcx, pcy, cosT, sinT, -halfLen + 1, kEdge - halfW, SHINE);
        }
      } else if (tileHash01(r, c, seed + 6) < 0.4) {
        plotRot(pcx, pcy, cosT, sinT, -halfLen + 1, kEdge - halfW, GLOW);
      }
    }

    // Hero dimensions first, so satellites + nubs share its base.
    var heroLen = 8 + Math.round(tileHash01(r, c, 0xE070) * 4);     // 8..12
    var heroW = 3 + (tileHash01(r, c, 0xE071) < 0.5 ? 0 : 1);       // 3..4
    var baseY = cy + heroLen - 1;

    // Whole-cluster rotation — the entire specimen (hero + satellites +
    // nubs) is spun rigidly by ONE random angle per tile, pivoting on the
    // hero centre. Each component's position is rotated about (cx, cy) and
    // the same angle is added to its own tilt, so the arrangement and the
    // relative crystal angles are preserved exactly — only the whole thing
    // turns. (The baked upper-left lighting turns with it, like rotating
    // the sprite.)
    var clusterAng = tileHash01(r, c, 0xE0FF) * 6.28318;
    var cosP = Math.cos(clusterAng), sinP = Math.sin(clusterAng);
    function place(px, py) {
      var dx = px - cx, dy = py - cy;
      return { x: cx + dx * cosP - dy * sinP, y: cy + dx * sinP + dy * cosP };
    }

    // Base druse — 2-4 tiny crystal nubs around the shared base so the
    // cluster reads as growing out of the rock, not floating. Behind all.
    var nNub = 2 + ((tileHash01(r, c, 0xE090) * 3) | 0);            // 2..4
    for (var b = 0; b < nNub; b++) {
      var nbX = cx + Math.round((tileHash01(r, c, 0xE0A0 + b) - 0.5) * 15);
      var nbLen = 2 + ((tileHash01(r, c, 0xE0B0 + b) * 2) | 0);     // 2..3
      var nbW = 1 + (tileHash01(r, c, 0xE0D0 + b) < 0.5 ? 0 : 1);   // 1..2
      var nbTilt = (tileHash01(r, c, 0xE0C0 + b) - 0.5) * 0.8;
      var np = place(nbX, baseY - nbLen);
      drawPrism(np.x, np.y, nbLen, nbW, nbTilt + clusterAng, 0, 1, 0xB000 + b * 0x40);
    }

    // Satellites (2-3), behind the hero, varied termination + lean.
    var nSat = 2 + (tileHash01(r, c, 0xE010) < 0.45 ? 1 : 0);       // 2..3
    for (var si = 0; si < nSat; si++) {
      var side = (si % 2 === 0) ? -1 : 1;
      var satLen = 4 + Math.round(tileHash01(r, c, 0xE040 + si) * 4); // 4..8
      var satW = 2 + (tileHash01(r, c, 0xE050 + si) < 0.6 ? 0 : 1);   // 2..3
      // Roots scattered in a small zone, not one exact shared point — the
      // bottoms used to converge too perfectly on the hero baseline.
      var satX = cx + side * (3 + Math.round(tileHash01(r, c, 0xE020 + si) * 4))
                 + Math.round((tileHash01(r, c, 0xE0E0 + si) - 0.5) * 7);
      var satY = cy + (heroLen - satLen)
                 + Math.round((tileHash01(r, c, 0xE0F0 + si) - 0.5) * 7);
      var satTilt = side * (0.12 + tileHash01(r, c, 0xE060 + si) * 0.30);
      var satTip = (tileHash01(r, c, 0xE068 + si) < 0.5) ? 0 : 1;
      var sp = place(satX, satY);
      drawPrism(sp.x, sp.y, satLen, satW, satTilt + clusterAng, 0, satTip, 0xC000 + si * 0x40);
    }

    // Hero last, on top, dominant — flat or pointed termination. Its
    // centre is the pivot, so it just spins in place.
    var heroTip = (tileHash01(r, c, 0xE073) < 0.5) ? 0 : 1;
    drawPrism(cx, cy, heroLen, heroW,
              (tileHash01(r, c, 0xE072) - 0.5) * 0.3 + clusterAng,
              1, heroTip, 0xE200);
  }

  function drawRubyOre(tx, ty, r, c) {
    // Ruby — v17.60 unified design. User feedback on v17.59: the
    // "couple variants that are roughly hexagonal" read well — keep
    // those, add VARIATION + ROTATION on top, then mirror obsidian's
    // composition (irregular dominant shape + 2-3 broken-off satellites
    // orbiting around it). The 8 distinct scene types are gone;
    // instead one unified hex-prism helper (`drawHexPrism`) handles
    // every crystal, with rotation, aspect ratio, position, and
    // satellite count all randomised per-tile. The "variation" is
    // continuous, not bucketed:
    //   - Hero aspect: 3 buckets (squat / medium / tall) randomised inside each.
    //   - Hero rotation: any angle 0..2π — every tile orients differently.
    //   - Hero centre: ±2 px jitter from tile centre.
    //   - 2-3 satellites: orbital positions, own rotations, own sizes,
    //     all kept clearly smaller than the hero (obsidian dominance rule).
    // The hex-prism silhouette is preserved via chamfered short ends
    // + per-row ±1 px width jitter — the v17.57 rough-crystal language.
    // Lighting is in SCREEN space so the lit side stays at the upper-
    // left regardless of crystal rotation. Burgundy palette retained.
    // Renders host-through; keyed only to (r, c).
    // v17.63 polish palette — pushed every tone toward more saturated,
    // more vibrant ruby red. The v17.62 burgundy palette read muddy
    // and lacked the "precious gem" feel; this palette gives every
    // band a clearer red identity from outline through specular peak.
    var OUT   = '#1c0408';                                       // dark outline (slight red tint)
    var CRACK = '#280608';                                       // fissure
    var DEEP  = '#5a1024';                                       // shadow
    var MID   = '#a0183a';                                       // body (vibrant blood-red, was burgundy)
    var LIT   = '#d83458';                                       // lit (bright ruby)
    var HOT   = '#f04068';                                       // highlight peaks (vivid pink-red)
    var FIRE  = '#ff90a8';                                       // internal sparkle pixels (new)
    var SPEC  = '#fff0f4';                                       // near-white specular catchlight (new)
    var SILK  = '#f8e0e0';                                       // silk inclusion (slightly brighter)

    function paintAt(px, py, tone) {
      if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) return;
      ctx.fillStyle = tone;
      ctx.fillRect(px, py, 1, 1);
    }

    // ---- Shared per-pixel tone logic ----
    // 4-tone screen-space body lighting — light from the upper-left of
    // the crystal regardless of crystal rotation. v17.63 added the HOT
    // band at `lit > 5` so the brightest upper-left wedge of the
    // crystal reads truly bright, not just "less mid". Larger crystals
    // get a proportionally larger lit zone via the halfW * 0.3 offset.
    function lightTone(dx, dy, halfW) {
      var lit = -dx - dy + halfW * 0.3;
      if (lit > 5)  return HOT;
      if (lit > 2)  return LIT;
      if (lit > -1) return MID;
      return DEEP;
    }

    // Block-based colour zoning — 2×2 block hash on LOCAL coords (so
    // the patches stay attached to the crystal as it rotates). Shifts
    // tone up/down by one step in ~10% of blocks each direction
    // (v17.62 tightened from 14% — the previous frequency was reading
    // as noise on smaller crystals rather than natural zoning).
    function zoneTone(lu, lv, halfW, halfH, seed, baseTone) {
      var blockX = Math.floor((lu + halfW) / 2);
      var blockY = Math.floor((lv + halfH) / 2);
      var noise = tileHash01(r, c, seed + 200 + blockX * 13 + blockY * 19);
      if (noise > 0.90) {
        if (baseTone === DEEP) return MID;
        if (baseTone === MID)  return LIT;
        if (baseTone === LIT)  return HOT;
      } else if (noise < 0.10) {
        if (baseTone === LIT) return MID;
        if (baseTone === MID) return DEEP;
        if (baseTone === HOT) return LIT;
      }
      return baseTone;
    }

    // ===== Hex prism — rotated, jittered, naturally rough =====
    // ONE unified crystal helper. The "hexagonal" silhouette read comes
    // from chamfered short ends (basal pinacoid faces) + per-row width
    // jitter ±1 px (the v17.57 rough-mineral edge language). The
    // `angle` parameter rotates the whole crystal via backward-mapped
    // sampling: for every screen pixel (su, sv), inverse-rotate to
    // local coords (lu, lv), round to (iu, iv), and check shape /
    // outline / interior tone in that LOCAL frame. Lighting samples
    // SCREEN coords so the lit side stays upper-left no matter how
    // the crystal rotates; zoning + core + crack + silk sample LOCAL
    // coords so their pattern stays glued to the crystal.
    //   detail 0 — body only (small satellite chips)
    //   detail 1 — + colour zoning + crack (mid satellite)
    //   detail 2 — + pigeon's blood core + silk inclusion (hero)
    function drawHexPrism(cu, cv, halfW, halfH, angle, seed, detail) {
      var cosA = Math.cos(-angle), sinA = Math.sin(-angle);
      var cosF = Math.cos(angle),  sinF = Math.sin(angle);

      // v17.64: stronger chamfer — the v17.63 2-row chamfer left too
      // many middle rows at full width and the silhouette read as a
      // mildly bevelled rectangle, not a hex prism. New scaling:
      //   - tall (halfH ≥ 7 && halfW ≥ 5): 4-row chamfer (4/3/2/1)
      //     so the elongated body still tapers to a narrow basal
      //     pinacoid at the very top/bottom (chamfer 4 leaves 1 px on
      //     each side at the edge → 3 px wide basal face on halfW 5)
      //   - standard (halfH ≥ 4 && halfW ≥ 5): 3-row chamfer (3/2/1)
      //     gives the clear hex profile that was missing
      //   - narrow heroes (halfW = 4): 2-row chamfer (2/1) — fallback,
      //     no v17.64 hero falls here but kept for future tweaks
      //   - small satellites: 1-row chamfer scaled to halfW
      function chamferAt(iv) {
        var ad = Math.abs(iv);
        if (halfH < 4) {
          if (ad === halfH) return Math.max(1, Math.round(halfW * 0.33));
          return 0;
        }
        if (halfH >= 7 && halfW >= 5) {
          if (ad === halfH)     return 4;
          if (ad === halfH - 1) return 3;
          if (ad === halfH - 2) return 2;
          if (ad === halfH - 3) return 1;
          return 0;
        }
        if (halfW >= 5) {
          if (ad === halfH)     return 3;
          if (ad === halfH - 1) return 2;
          if (ad === halfH - 2) return 1;
          return 0;
        }
        if (halfW >= 4) {
          if (ad === halfH)     return 2;
          if (ad === halfH - 1) return 1;
          return 0;
        }
        if (ad === halfH) return 1;
        return 0;
      }

      var coreU = 0, coreV = 0, coreRad = 0;
      if (detail >= 2) {
        coreU = Math.round((tileHash01(r, c, seed + 80) - 0.5) * halfW * 0.6);
        coreV = Math.round((tileHash01(r, c, seed + 81) - 0.5) * halfH * 0.6);
        coreRad = 1 + Math.round(tileHash01(r, c, seed + 82) * 1.5);
      }

      // Backward map — iterate screen pixels in the rotated bbox, look
      // up local coords for shape and interior classification.
      var box = Math.ceil(Math.sqrt(halfW * halfW + halfH * halfH)) + 2;
      for (var sv = -box; sv <= box; sv++) {
        for (var su = -box; su <= box; su++) {
          var lu = su * cosA - sv * sinA;
          var lv = su * sinA + sv * cosA;
          var iu = Math.round(lu), iv = Math.round(lv);
          if (Math.abs(iv) > halfH) continue;
          var ch = chamferAt(iv);
          // v17.62: less frequent jitter (* 1.5 → ~17% of rows get ±1
          // vs ~25% with * 2), and skip jitter entirely on tiny crystals
          // (halfW < 3) where ±1 px is too dominant relative to the body
          // and reads as noise rather than rough mineral edges.
          var jit = (ch === 0 && halfW >= 3)
                    ? Math.round((tileHash01(r, c, seed + 10 + (iv + halfH)) - 0.5) * 1.5)
                    : 0;
          var eff = halfW - ch + jit;
          if (eff < 1) continue;
          if (Math.abs(iu) > eff) continue;

          var atSide   = (Math.abs(iu) === eff);
          var atTopBot = (Math.abs(iv) === halfH);
          var tone;
          if (atSide || atTopBot) {
            tone = OUT;
          } else {
            // Lighting in SCREEN coords (su, sv) — lit side stays upper-left
            tone = lightTone(su, sv, halfW);
            // v17.62: skip colour zoning on small crystals (halfW < 4)
            // where the 2×2 block patches read as noise; zoning is for
            // hero-scale crystals where blocks read as natural zones.
            if (detail >= 1 && halfW >= 4) tone = zoneTone(iu, iv, halfW, halfH, seed, tone);
            if (detail >= 2 && coreRad > 0) {
              var ccx = iu - coreU, ccy = iv - coreV;
              var cd2 = ccx * ccx + ccy * ccy;
              if (cd2 <= coreRad * coreRad) {
                // Inside core — pigeon's blood (deeper tones)
                if (tone === HOT)      tone = LIT;
                else if (tone === LIT) tone = MID;
                else if (tone === MID) tone = DEEP;
              } else if (cd2 <= (coreRad + 1.5) * (coreRad + 1.5)) {
                // Halo ring — brighter tones (the "glow" wrapping the
                // deep core, v17.63 polish — gives the gem its
                // internal-light feel rather than a flat dark spot).
                if (tone === DEEP)     tone = MID;
                else if (tone === MID) tone = LIT;
                else if (tone === LIT) tone = HOT;
              }
            }
          }
          paintAt(cu + su, cv + sv, tone);
        }
      }

      // Crack — drawn in LOCAL space (so it stays glued to the crystal)
      // then rotated back to screen for placement. v17.62: gated on
      // halfH >= 3 so the 4-pixel diagonal doesn't appear on small/
      // short satellite crystals where it reads as scattered dark
      // pixels rather than a coherent fissure.
      if (detail >= 1 && halfH >= 3) {
        var crU = -halfW + 2 + Math.round(tileHash01(r, c, seed + 100) * halfW * 0.5);
        var crV = -halfH + 2 + Math.round(tileHash01(r, c, seed + 101) * halfH * 0.5);
        for (var k = 0; k < 4; k++) {
          var lku = crU + k;
          var lkv = crV + Math.floor(k * 0.6) + (k > 1 ? 1 : 0);
          paintAt(cu + Math.round(lku * cosF - lkv * sinF),
                  cv + Math.round(lku * sinF + lkv * cosF), CRACK);
        }
      }

      // Silk inclusion — single pale pixel near the local "top" of the
      // crystal, rotated to screen.
      if (detail >= 2) {
        var skU = Math.round((tileHash01(r, c, seed + 110) - 0.5) * (halfW - 1));
        var skV = -halfH + 2 + Math.round(tileHash01(r, c, seed + 111) * 2);
        paintAt(cu + Math.round(skU * cosF - skV * sinF),
                cv + Math.round(skU * sinF + skV * cosF), SILK);
      }

      // FIRE — 1-2 internal sparkle pixels (v17.63 polish). Drawn in
      // LOCAL coords so the flashes stay glued to the crystal as it
      // rotates; positioned away from outline + chamfer so they
      // always land on body interior.
      if (detail >= 2) {
        var nFire = 1 + (tileHash01(r, c, seed + 130) > 0.5 ? 1 : 0);
        for (var fi = 0; fi < nFire; fi++) {
          var fU = Math.round((tileHash01(r, c, seed + 131 + fi * 2) - 0.5) * halfW * 0.7);
          var fV = Math.round((tileHash01(r, c, seed + 132 + fi * 2) - 0.5) * halfH * 0.7);
          if (Math.abs(fV) > halfH - 1) continue;
          var fCh = chamferAt(fV);
          if (Math.abs(fU) > halfW - fCh - 1) continue;
          paintAt(cu + Math.round(fU * cosF - fV * sinF),
                  cv + Math.round(fU * sinF + fV * cosF), FIRE);
        }
      }

      // SPECULAR PEAK — bright pinpoint catchlight in the screen
      // upper-left interior (v17.63 polish, modelled on obsidian's
      // pure-white specular). Searches diagonally from upper-left
      // toward the centre for the first screen position whose
      // inverse-rotated local coords land on a body interior pixel
      // with at least 2 px of inset from the outline + chamfer (so
      // it never sits on the OUT outline even with extreme jitter).
      // Paints SPEC + 2 HOT halo pixels — the catchlight pops while
      // the halo blends it into the lit body.
      if (detail >= 2) {
        var maxR = Math.ceil(Math.sqrt(halfW * halfW + halfH * halfH));
        for (var spOff = Math.floor(maxR * 0.45); spOff >= 0; spOff--) {
          var ssx = -spOff, ssy = -spOff;
          var ilu = ssx * cosA - ssy * sinA;
          var ilv = ssx * sinA + ssy * cosA;
          var iiu = Math.round(ilu), iiv = Math.round(ilv);
          if (Math.abs(iiv) > halfH - 2) continue;
          var iich = chamferAt(iiv);
          if (Math.abs(iiu) > halfW - iich - 2) continue;
          paintAt(cu + ssx,     cv + ssy,     SPEC);
          paintAt(cu + ssx + 1, cv + ssy,     HOT);
          paintAt(cu + ssx,     cv + ssy + 1, HOT);
          break;
        }
      }
    }

    // ===== Shard chip (satellite shape) =====
    // v17.65: at satellite scale (~5-7 px across) the hex-prism
    // chamfered silhouette doesn't have enough rows to read as hex —
    // it ends up looking like a tiny rectangle. Modelled directly on
    // obsidian's drawChunk satellite shape: 4-5 vertex polygon with
    // random per-vertex radii so every shard is an angular fragment
    // with visibly distinct corners regardless of pixel scale. Clean
    // OUT outline (distance-to-edge < 0.7); body painted with screen-
    // space lightTone so the lit side stays at the upper-left.
    function drawShardChip(cu, cv, baseRad, seed) {
      var nVerts = 4 + Math.floor(tileHash01(r, c, seed) * 2);      // 4 or 5
      var rotBase = tileHash01(r, c, seed + 1) * Math.PI * 2;
      var verts = [];
      var minX = 99, maxX = -99, minY = 99, maxY = -99;
      for (var vi = 0; vi < nVerts; vi++) {
        var vAng = rotBase + vi * (Math.PI * 2 / nVerts);
        var vRad = baseRad * (0.7 + tileHash01(r, c, seed + 10 + vi) * 0.6);
        var vx = Math.cos(vAng) * vRad;
        var vy = Math.sin(vAng) * vRad;
        verts.push({ x: vx, y: vy });
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
      }

      function inPoly(px, py) {
        var inside = false;
        for (var i = 0, j = nVerts - 1; i < nVerts; j = i++) {
          var xi = verts[i].x, yi = verts[i].y;
          var xj = verts[j].x, yj = verts[j].y;
          if ((yi > py) !== (yj > py) &&
              px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
          }
        }
        return inside;
      }

      function distToEdge(px, py) {
        var minDist = 999;
        for (var i = 0, j = nVerts - 1; i < nVerts; j = i++) {
          var x1 = verts[j].x, y1 = verts[j].y;
          var x2 = verts[i].x, y2 = verts[i].y;
          var ex = x2 - x1, ey = y2 - y1;
          var lenSq = ex * ex + ey * ey;
          var t = lenSq > 0 ? ((px - x1) * ex + (py - y1) * ey) / lenSq : 0;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var nx = x1 + t * ex, ny = y1 + t * ey;
          var ddx = px - nx, ddy = py - ny;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < minDist) minDist = d;
        }
        return minDist;
      }

      var y0 = Math.floor(minY) - 1, y1 = Math.ceil(maxY) + 1;
      var x0 = Math.floor(minX) - 1, x1 = Math.ceil(maxX) + 1;
      for (var dy = y0; dy <= y1; dy++) {
        for (var dx = x0; dx <= x1; dx++) {
          if (!inPoly(dx, dy)) continue;
          var tone;
          if (distToEdge(dx, dy) < 0.7) {
            tone = OUT;
          } else {
            tone = lightTone(dx, dy, baseRad);
          }
          paintAt(cu + dx, cv + dy, tone);
        }
      }
    }

    // ---- Composition: hero + 2-3 orbital satellites (obsidian rule) ----
    // The hero is the dominant crystal at the tile centre (with ±2 px
    // jitter). Its aspect ratio falls into one of three buckets so
    // neighbouring tiles can read as squat / equant / tall corundum.
    // The hero's rotation is fully randomised across 0..2π. Then 2-3
    // small satellites orbit at varied angles + distances, each with
    // its own rotation and own size — but all kept clearly smaller
    // than the hero so dominance is preserved (the obsidian rule).
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xF000) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xF001) - 0.5) * 4);

    var aspect = tileHash01(r, c, 0xF010);
    var heroHalfW, heroHalfH;
    if (aspect < 0.33) {
      // Squat barrel — wider than tall, classic corundum habit
      heroHalfW = 6 + Math.floor(tileHash01(r, c, 0xF011) * 2);   // 6-7
      heroHalfH = 4 + Math.floor(tileHash01(r, c, 0xF012) * 2);   // 4-5
    } else if (aspect < 0.66) {
      // Medium / equant
      heroHalfW = 5 + Math.floor(tileHash01(r, c, 0xF013) * 2);   // 5-6
      heroHalfH = 5 + Math.floor(tileHash01(r, c, 0xF014) * 2);   // 5-6
    } else {
      // Tall column — v17.64 bumped halfW 4 → 5 so the body is wide
      // enough to carry the 4-row tall-hex chamfer (top tapers to a
      // 3-px-wide basal pinacoid). At halfW=4 the chamfer would have
      // bottomed out at width 1, looking like a vertical pyramid; at
      // halfW=5 with chamfer 4 the top stays at width 3 — narrow but
      // still a true hex prism termination.
      heroHalfW = 5;
      heroHalfH = 7 + Math.floor(tileHash01(r, c, 0xF016) * 2);   // 7-8
    }

    var heroAng = tileHash01(r, c, 0xF020) * Math.PI * 2;         // 0..2π

    // Satellites first (so hero overlaps them on top — dominance).
    // Distance band 5..8.5 px is tuned to STRADDLE the hero edge for
    // typical hero sizes (halfW 4..7) — the satellites partially tuck
    // INTO the hero so when the hero is painted on top its outline
    // erases the satellite's, and the cluster reads as one merged
    // shape (the obsidian blending rule). Distance band that's too
    // far reads as floating chunks; band that's too close hides the
    // satellites entirely.
    var nSat = 2 + Math.floor(tileHash01(r, c, 0xF030) * 2);      // 2-3
    for (var si = 0; si < nSat; si++) {
      var satAng = (si / nSat) * Math.PI * 2
                   + (tileHash01(r, c, 0xF040 + si) - 0.5) * 1.5;
      var satDist = 5 + tileHash01(r, c, 0xF050 + si) * 3.5;      // 5..8.5 px
      var satX = cx + Math.round(Math.cos(satAng) * satDist);
      var satY = cy + Math.round(Math.sin(satAng) * satDist);
      // v17.65: satellites are angular polygon SHARDS, not hex prisms.
      // baseRad 2.5..3.5 gives polygon spans ~3.5..9 px (40-55% of
      // hero radius — matches obsidian satellite scale 0.40-0.54).
      var satBaseRad = 2.5 + tileHash01(r, c, 0xF060 + si) * 1.0;
      drawShardChip(satX, satY, satBaseRad, 0x6900 + si * 0x40);
    }

    // Hero — drawn last so it dominates where satellites overlap
    drawHexPrism(cx, cy, heroHalfW, heroHalfH, heroAng, 0x6A40, 2);
  }

  function drawPyriteOre(tx, ty, r, c) {
    // Fool's gold — a druse of hard brass cubes interpenetrating into a
    // blocky clump on the dark host rock. Each cube is a true three-face
    // box (lit top, mid front, shaded right side) rasterised by a
    // per-pixel face classifier, and carries a small per-cube rotation so
    // the clump juts at varied angles rather than a rigid grid. The tell
    // is the fine striations grooving the faces — perpendicular between
    // top and front, jittered, never evenly stepped. A tad of weathering
    // keeps it off the CG look: the dark outline chips here and there and
    // sparse grit specks pit the front faces. Paler, greyer and more
    // rigidly geometric than gold. Geometry is keyed only to (r, c).
    var pal = materialPalette('pyrite', 'default');
    // Renderer-local brass ramp — three faces, each a 2-tone falloff.
    var P = {
      out:     '#352808',     // silhouette outline — below every face
      grit:    '#4a3914',     // dark pit speck — surface grit / dirt
      sideLo:  '#54401a',     // right (shaded) face, lower
      side:    '#6f5622',     // right (shaded) face
      frontLo: '#8f7029',     // front face, shaded lower-right
      front:   pal.base,      // front face body              (#b89638)
      frontHi: '#cda742',     // front face, lit upper-left band
      top:     pal.highlight, // top face body                (#e6c659)
      topHi:   '#f4dc86',     // top face, lit back-left
      rim:     pal.accent,    // crisp catch-light, up-left contour (#fff2c0)
      rimLo:   '#eccb6a',     // rim low in the tile — warm gold, not white
      striaT:  '#c6a43c',     // groove on the lit top face
      striaF:  '#9a7c2e'      // groove on the front face
    };

    // One brass cube in 3/4 view, rotated by rot about its front-face
    // centre. (x, y) is the un-rotated front-face top-left; s the
    // front-face edge; d the cabinet depth shearing top + side up-right.
    function pyCube(x, y, s, d, rot, seed) {
      x = x | 0; y = y | 0; d = d | 0;
      var cos = Math.cos(rot), sin = Math.sin(rot);
      var HALF = s * 0.5;
      var pSx = x + HALF, pSy = y + HALF;       // rotation pivot (screen)

      // Jittered striation grooves + sparse grit specks — large cubes
      // only (small satellites stay clean). Front grooves run vertical,
      // top grooves run back-to-front; the two read perpendicular.
      var fG = null, tG = null, grit = [];
      if (s >= 6) {
        fG = [];
        var nf = 2 + ((tileHash01(r, c, seed + 11) * (s >= 9 ? 2.99 : 1.99)) | 0);
        for (var a = 0; a < nf; a++) {
          var gc = Math.round((a + 0.5) / nf * (s - 3) + 1.5
                   + (tileHash01(r, c, seed + 20 + a) - 0.5) * 1.7);
          var gy0 = 1 + ((tileHash01(r, c, seed + 30 + a) * 2.4) | 0);
          var gy1 = (s - 2) - ((tileHash01(r, c, seed + 40 + a) * 2.4) | 0);
          if (gc >= 1 && gc <= s - 2 && gy1 - gy0 >= 2) fG.push([gc, gy0, gy1]);
        }
        tG = [];
        var nt = 2 + ((tileHash01(r, c, seed + 12) * (s >= 9 ? 2.99 : 1.99)) | 0);
        for (var b = 0; b < nt; b++) {
          var gt = Math.round((b + 0.5) / nt * (s - 3) + 1.5
                   + (tileHash01(r, c, seed + 50 + b) - 0.5) * 1.7);
          if (gt >= 1 && gt <= s - 2) tG.push(gt);
        }
        var ng = 2 + ((tileHash01(r, c, seed + 60) * (s >= 9 ? 3.99 : 2.49)) | 0);
        for (var gi = 0; gi < ng; gi++) {
          var spx = 1 + ((tileHash01(r, c, seed + 70 + gi) * (s - 2)) | 0);
          var spy = Math.round(s * 0.42 + tileHash01(r, c, seed + 80 + gi) * s * 0.5);
          if (spy <= s - 2) grit.push([spx, spy]);
        }
      }

      // Face of a cube-local point: 0 empty · 1 front · 2 top · 3 side.
      function faceAt(lx, ly) {
        if (lx >= 0 && lx < s && ly >= 0 && ly < s) return 1;
        if (ly < 0 && ly >= -d && lx + ly >= 0 && lx + ly < s) return 2;
        if (lx >= s && lx < s + d) {
          var rr = ly + lx - s + 1;
          if (rr >= 0 && rr < s) return 3;
        }
        return 0;
      }
      // Classify a screen pixel — inverse-rotate it into cube-local space.
      function faceScreen(px, py) {
        var dx = px - pSx, dy = py - pSy;
        return faceAt(HALF + dx * cos + dy * sin, HALF - dx * sin + dy * cos);
      }

      var cx0 = Math.round(pSx), cy0 = Math.round(pSy);
      var R = Math.ceil((HALF + d) * 1.42) + 2;
      for (var py = cy0 - R; py <= cy0 + R; py++) {
        for (var px = cx0 - R; px <= cx0 + R; px++) {
          var dx = px - pSx, dy = py - pSy;
          var lx = HALF + dx * cos + dy * sin;
          var ly = HALF - dx * sin + dy * cos;
          var f = faceAt(lx, ly);
          if (!f) continue;
          var eL = !faceScreen(px - 1, py), eU = !faceScreen(px, py - 1);
          var eR = !faceScreen(px + 1, py), eD = !faceScreen(px, py + 1);
          var fill;
          if (eL || eR || eU || eD) {
            // Bright rim on the up/left contour of the two lit faces;
            // dark outline elsewhere. A tad of the dark outline chips
            // away (host shows through) for a weathered edge.
            if ((eL || eU) && f !== 3) {
              // The near-white catch-light is kept to the upper contour;
              // low in the tile the rim warms to gold so it does not
              // read as white pixels at the base of the cluster.
              fill = (py > ty + 17) ? P.rimLo : P.rim;
            } else {
              if (tileHash01(r, c, 0x9000 + (px & 127) * 53 + (py & 127)) < 0.12) continue;
              fill = P.out;
            }
          } else if (f === 1) {
            var rlx = Math.round(lx), rly = Math.round(ly);
            var hit = false, j;
            for (j = 0; j < grit.length; j++)
              if (grit[j][0] === rlx && grit[j][1] === rly) { hit = true; break; }
            if (hit) {
              fill = P.grit;
            } else {
              var onF = false;
              if (fG) for (j = 0; j < fG.length; j++)
                if (rlx === fG[j][0] && rly >= fG[j][1] && rly <= fG[j][2]) { onF = true; break; }
              var fk = (lx + ly) / (2 * s);
              fill = onF ? P.striaF
                   : (fk < 0.26 ? P.frontHi : (fk > 0.62 ? P.frontLo : P.front));
            }
          } else if (f === 2) {
            var t2 = lx + ly, onT = false, rt2 = Math.round(t2), ti;
            if (tG) for (ti = 0; ti < tG.length; ti++) if (rt2 === tG[ti]) { onT = true; break; }
            fill = onT ? P.striaT : (t2 < s * 0.42 ? P.topHi : P.top);
          } else {
            fill = (ly + lx - s + 1 > s * 0.55) ? P.sideLo : P.side;
          }
          ctx.fillStyle = fill;
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }

    // Per-cube rotation — most cubes stay flat (the axis-aligned OG
    // look); a discrete minority pick a bold variant. No continuous
    // jitter: a cube is either square-on or deliberately canted.
    function pickRot(seed, flatChance) {
      var t = tileHash01(r, c, seed);
      if (t < flatChance) return 0;                  // flat — the majority
      var u = (t - flatChance) / (1 - flatChance);
      if (u < 0.36) return Math.PI / 4;              // +45 deg — diamond
      if (u < 0.72) return -Math.PI / 4;             // -45 deg — diamond
      if (u < 0.86) return Math.PI / 6;              // +30 deg — canted
      return -Math.PI / 6;                           // -30 deg — canted
    }

    // Hero crystal — the dominant cube, centred; usually flat so it
    // anchors the read, occasionally canted.
    var hs = 9 + ((tileHash01(r, c, 0x7C04) * 2.99) | 0);   // 9..11
    var hd = 3 + ((tileHash01(r, c, 0x7C05) * 1.99) | 0);   // 3..4
    var hx = tx + 16 - ((hs + hd) >> 1) + Math.round((tileHash01(r, c, 0x7C02) - 0.5) * 3);
    var hy = ty + 16 - ((hs - hd) >> 1) + Math.round((tileHash01(r, c, 0x7C03) - 0.5) * 3);
    var heroRot = pickRot(0x7C06, 0.78);                    // 78% flat

    // Satellite slots — front-face origin offsets from the hero. A and B
    // sit BEHIND (drawn first; the hero overpaints them so they emerge
    // from its top edge); C and D sit IN FRONT (drawn after the hero,
    // over its lower body). Inclusion order A,C,B,D keeps 2- and 3-cube
    // clusters diagonally balanced. Fields: [ox, oy, isBehind].
    var SLOTS = [
      [-4,      -5,       true ],   // A — emerges up-left
      [-3,      hs - 6,   false],   // C — sits low-left, in front
      [hs - 3,  -4,       true ],   // B — emerges up-right
      [hs - 5,  hs - 4,   false]    // D — sits low-right, in front
    ];
    var nSat = 2 + ((tileHash01(r, c, 0x7C01) * 2.99) | 0);  // 2..4 satellites
    var CUBE_SEED = [0x7C80, 0x7CE0, 0x7D40, 0x7DA0];

    function drawSat(k, behindPhase) {
      var slot = SLOTS[k];
      if (slot[2] !== behindPhase) return;
      var ss = 4 + ((tileHash01(r, c, 0x7C40 + k) * 3.99) | 0);   // 4..7
      var sd = 2 + ((tileHash01(r, c, 0x7C48 + k) * 1.99) | 0);   // 2..3
      var sx = hx + slot[0] + Math.round((tileHash01(r, c, 0x7C50 + k) - 0.5) * 4);
      var sy = hy + slot[1] + Math.round((tileHash01(r, c, 0x7C58 + k) - 0.5) * 4);
      pyCube(sx, sy, ss, sd, pickRot(0x7C60 + k, 0.62), CUBE_SEED[k]); // 62% flat
    }

    var k;
    for (k = 0; k < nSat; k++) drawSat(k, true);    // behind the hero
    pyCube(hx, hy, hs, hd, heroRot, 0x7E00);        // the hero
    for (k = 0; k < nSat; k++) drawSat(k, false);   // in front of the hero

    // One quiet static glint on the hero's lit top face — transformed
    // through the hero's rotation so it tracks the tilt (MINERALS_BIBLE §3).
    var gh = hs * 0.5;
    var gdx = (hd + 1) - gh, gdy = (1 - hd) - gh;
    var gcos = Math.cos(heroRot), gsin = Math.sin(heroRot);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(Math.round(hx + gh + gdx * gcos - gdy * gsin),
                 Math.round(hy + gh + gdx * gsin + gdy * gcos), 1, 1);
  }

  function drawGoldOre(tx, ty, r, c) {
    // Native gold — a clean, gleaming dendrite: a shared root throws
    // 4-5 thin gold wires that fan wide; ~two-thirds carry one
    // sub-branch that sprouts from the parent wire's EXACT far end, so
    // every joint connects — no detached bits. No twigs; sub-branches
    // taper to fine points; bright gold nodes sit only at the root and
    // the arm joints. Wire-led like silver — strings stay thin and
    // continuous, presence is in the wide reach and the node mass, not
    // in clutter. Hot near-white gleam; gold is the showcase ore.
    // Static. Keyed only to (r, c).
    var ramp = {
      out:    '#5e3f0a',   // deep amber contour
      shadow: '#bd8a1f',   // amber-gold shaded side
      base:   '#e8b22e',   // rich bright gold
      light:  '#ffd24a',   // hot lit gold
      shine:  '#fff8d0'    // near-white gleam
    };                     // no `tarnish` — gold is noble
    var cx = tx + 16, cy = ty + 16;

    // Deterministic per-(r, c) hash stream.
    var hseed = 0xB010;
    function rnd() { return tileHash01(r, c, hseed++); }

    // nArm thin wires fanned wide from a shared root.
    var nArm = 4 + (rnd() < 0.5 ? 0 : 1);                   // 4..5
    var armBase = rnd() * 6.283;
    var fan = 2.7 + rnd() * 0.9;                            // wide fan
    var arms = [], sumX = 0, sumY = 0;
    for (var i = 0; i < nArm; i++) {
      var dir = armBase + ((i / (nArm - 1)) - 0.5) * fan + (rnd() - 0.5) * 0.5;
      var len = 9 + rnd() * 4;                              // 9..13
      var ex = Math.cos(dir) * len, ey = Math.sin(dir) * len;
      arms.push({ dir: dir, ex: ex, ey: ey });
      sumX += ex; sumY += ey;
    }
    var ox = cx - sumX / (nArm + 1), oy = cy - sumY / (nArm + 1);

    function clampPt(px, py, maxR) {
      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxR) { px = cx + dx / d * maxR; py = cy + dy / d * maxR; }
      return { x: px, y: py };
    }

    // Wires first; node points collected as we go. goldWire returns the
    // wire's actual screen-space endpoints, so a sub-branch can sprout
    // from exactly where its arm ends — the joint stays connected.
    var wseed = 0xB300, nodes = [];
    function goldWire(ax, ay, bx, by, thk) {
      var dx = bx - ax, dy = by - ay, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 3) return { x0: ax, y0: ay, x1: bx, y1: by };
      var e = drawCurlWire((ax + bx) * 0.5, (ay + by) * 0.5, Math.atan2(dy, dx),
                           dist * 1.15, thk, 0, 0.55, ramp, r, c, wseed);
      wseed += 0x18;
      return e;
    }

    var root = clampPt(ox, oy, 13);
    for (i = 0; i < nArm; i++) {
      var a = arms[i];
      var aTip = clampPt(a.ex + ox, a.ey + oy, 11);
      var ae = goldWire(root.x, root.y, aTip.x, aTip.y, 2.7);   // arm
      var armEnd = { x: ae.x1, y: ae.y1 };                      // actual far end
      nodes.push({ x: armEnd.x, y: armEnd.y, rad: 2 + (rnd() < 0.5 ? 1 : 0) });

      if (rnd() < 0.65) {                                       // one sub-branch
        var sAng = a.dir + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6);
        var sLen = 7 + rnd() * 3;
        var sTip = clampPt(armEnd.x + Math.cos(sAng) * sLen,
                           armEnd.y + Math.sin(sAng) * sLen, 14);
        goldWire(armEnd.x, armEnd.y, sTip.x, sTip.y, 2.2);      // sub — taper out
      }
    }

    // Bright gold nodes over the wires — a knot at the root, a node at
    // each arm joint. A hot gleam pip on each; sub-branches taper bare.
    var nseed = 0xB600;
    function node(nx, ny, rad) {
      drawOreGrain(nx, ny, rad, ramp, r, c, nseed);
      nseed += 0x20;
      ctx.fillStyle = ramp.shine;
      ctx.fillRect((nx | 0) - 1, (ny | 0) - 1, 1, 1);
    }
    node(root.x, root.y, 4);
    for (i = 0; i < nodes.length; i++) node(nodes[i].x, nodes[i].y, nodes[i].rad);
  }

  // One curly native-metal wire — the silver / gold vein primitive.
  // Walks a curved centreline (lazy drift + two heading harmonics + an
  // optional terminal hook) and stamps a tapered metal cross-section at
  // each step: dark outline, shaded side, base, lit side, near-white
  // shine — lit consistently from the upper-left as the wire curls. A
  // couple of hash-picked steps drop a dark tarnish freckle, but only if
  // the ramp carries a `tarnish` key — noble metals (gold) skip it.
  // Returns the two screen-space endpoints. ramp: {out, shadow, base,
  // light, shine, tarnish?}; curlScale scales the curl (1 silver, ~0.45).
  function drawCurlWire(midX, midY, baseAng, arcLen, thk, hookSign, curlScale, ramp, r, c, seed) {
    var TWO_PI = Math.PI * 2;
    var STEPS = Math.max(12, Math.round(arcLen * 2.2));
    var stepLen = arcLen / STEPS;
    var drift = (tileHash01(r, c, seed + 1) - 0.5) * 1.2;
    var c1amp = (0.90 + tileHash01(r, c, seed + 2) * 0.70) * curlScale;  // main curl
    var c1frq = 0.80 + tileHash01(r, c, seed + 3) * 0.65;
    var c1phs = tileHash01(r, c, seed + 4) * TWO_PI;
    var c2amp = (0.20 + tileHash01(r, c, seed + 5) * 0.24) * curlScale;  // fine wobble
    var c2frq = 2.4 + tileHash01(r, c, seed + 6) * 1.7;
    var c2phs = tileHash01(r, c, seed + 7) * TWO_PI;
    var hookAmt = hookSign * (1.6 + tileHash01(r, c, seed + 8) * 1.3) * curlScale;

    // Pass 1 — trace the centreline, accumulate the centroid.
    var xs = [], ys = [], hds = [], px = 0, py = 0, sumX = 0, sumY = 0;
    for (var i = 0; i <= STEPS; i++) {
      var t = i / STEPS;
      var h = baseAng + drift * (t - 0.5)
            + c1amp * Math.sin(TWO_PI * c1frq * t + c1phs)
            + c2amp * Math.sin(TWO_PI * c2frq * t + c2phs);
      if (t > 0.66) { var hk = (t - 0.66) / 0.34; h += hookAmt * hk * hk; }
      xs[i] = px; ys[i] = py; hds[i] = h;
      sumX += px; sumY += py;
      px += Math.cos(h) * stepLen;
      py += Math.sin(h) * stepLen;
    }
    var ox = midX - sumX / (STEPS + 1), oy = midY - sumY / (STEPS + 1);

    // Tarnish freckles — the signature accent: 0..2 dark spots per wire.
    var frkRoll = tileHash01(r, c, seed + 9);
    var frkN = !ramp.tarnish ? 0 : (frkRoll < 0.45 ? 0 : (frkRoll < 0.78 ? 1 : 2));
    var frkA = 4 + ((tileHash01(r, c, seed + 10) * (STEPS - 8)) | 0);
    var frkB = 4 + ((tileHash01(r, c, seed + 11) * (STEPS - 8)) | 0);

    // Pass 2 — stamp tapered metal cross-sections along the centreline.
    for (var j = 0; j <= STEPS; j++) {
      var wx = xs[j] + ox, wy = ys[j] + oy, hh = hds[j];
      var tt = j / STEPS;
      var edgeT = 1 - (2 * tt - 1) * (2 * tt - 1);              // 0 ends, 1 mid
      var halfThk = thk * 0.5 * (0.42 + 0.58 * edgeT);
      if (halfThk < 0.5) halfThk = 0.5;
      var perpX = -Math.sin(hh), perpY = Math.cos(hh);
      var Ldot = -perpX - perpY, aL = Math.abs(Ldot);          // perp vs light
      var frk = (frkN >= 1 && j >= frkA - 1 && j <= frkA + 1) ||
                (frkN >= 2 && j >= frkB - 1 && j <= frkB + 1);
      var SW = Math.max(2, Math.round(halfThk / 0.5));
      for (var s = -SW; s <= SW; s++) {
        var d = Math.abs(s) / SW;
        var ex = Math.round(wx + (s / SW) * halfThk * perpX);
        var ey = Math.round(wy + (s / SW) * halfThk * perpY);
        var side = s * Ldot;                                   // >0 lit, <0 shadow
        var fill;
        if (frk && d < 0.5) {
          fill = ramp.tarnish;
        } else if (d > 0.72) {
          fill = side > 0 ? (aL > 0.72 ? ramp.shine : ramp.light) : ramp.out;
        } else if (d > 0.30) {
          fill = side > 0 ? ramp.light : (side < 0 ? ramp.shadow : ramp.base);
        } else {
          fill = ramp.base;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(ex, ey, 1, 1);
      }
    }
    return { x0: xs[0] + ox, y0: ys[0] + oy,
             x1: xs[STEPS] + ox, y1: ys[STEPS] + oy };
  }

  function drawSilverOre(tx, ty, r, c) {
    // Native "wire silver" — a generous tangle of long, bright, curly
    // metallic wires with pooled beads, embedded in the dark host rock.
    // Cool near-white: the brightest, coolest common metal — brighter
    // and bluer than iron. Distinct from gold's dendritic spray —
    // silver is a crossing tangle of long sweeping curls, not a fan
    // from a root — and stays cooler and calmer (gold is the showier
    // metal). Signature accent: dark tarnish freckles. Keyed to (r, c).
    var ramp = {
      out:     '#2b313b',   // dark cool outline / shadow-side rim
      shadow:  '#5d6b7a',   // shaded side of a wire
      base:    '#aab8c6',   // wire body — cool light silver
      light:   '#d8e2ea',   // lit side
      shine:   '#f4f8fc',   // near-white specular on a strongly-lit rim
      tarnish: '#3e4856'    // dark cool tarnish freckle — the accent
    };
    var ccx = tx + 16 + Math.round((tileHash01(r, c, 0xA001) - 0.5) * 4);
    var ccy = ty + 16 + Math.round((tileHash01(r, c, 0xA002) - 0.5) * 4);
    var nWires = 3 + (tileHash01(r, c, 0xA003) < 0.45 ? 0 : 1);       // 3..4
    var angBase = tileHash01(r, c, 0xA004) * 6.283;

    var ends = [];
    for (var i = 0; i < nWires; i++) {
      var wSeed = 0xA100 + i * 64;
      var ang = angBase + i * (6.283 / nWires)
              + (tileHash01(r, c, wSeed) - 0.5) * 0.9;
      var mx = ccx + Math.round((tileHash01(r, c, wSeed + 1) - 0.5) * 8);
      var my = ccy + Math.round((tileHash01(r, c, wSeed + 2) - 0.5) * 8);
      var arcLen = 15 + tileHash01(r, c, wSeed + 3) * 6;              // 15..21
      var thk = 3.0 + tileHash01(r, c, wSeed + 4) * 0.9;             // 3.0..3.9
      var hookSign = tileHash01(r, c, wSeed + 5) < 0.5
                   ? (tileHash01(r, c, wSeed + 6) < 0.5 ? 1 : -1) : 0;
      ends.push(drawCurlWire(mx, my, ang, arcLen, thk, hookSign, 0.82,
                             ramp, r, c, wSeed + 16));
    }

    // Pooled silver beads, drawn over the wires: a knot where they
    // tangle at the centre, plus a cap on roughly half the wire ends.
    function bead(bx, by, rad, bseed) {
      drawOreGrain(bx, by, rad, ramp, r, c, bseed);
      ctx.fillStyle = ramp.shine;                          // tiny specular pip
      ctx.fillRect((bx | 0) - 1, (by | 0) - 1, 1, 1);
    }
    bead(ccx, ccy, 3 + ((tileHash01(r, c, 0xA005) * 1.99) | 0), 0xA200);
    for (var e = 0; e < ends.length; e++) {
      if (tileHash01(r, c, 0xA050 + e) < 0.6) {
        var useEnd1 = tileHash01(r, c, 0xA060 + e) < 0.5;
        bead(useEnd1 ? ends[e].x1 : ends[e].x0,
             useEnd1 ? ends[e].y1 : ends[e].y0,
             2 + ((tileHash01(r, c, 0xA070 + e) * 2.5) | 0),
             0xA300 + e * 0x60);
      }
    }
  }

  // ----- Phase 2 (v16.7): the remaining ores on the same system -----

  // Scatter of faceted crystals — the workhorse for crystalline ores.
  function drawGemScatter(tx, ty, r, c, seed, ramp, minN, maxN, wLo, wHi, hLo, hHi) {
    var pts = oreScatter(tx, ty, r, c, seed, minN, maxN);
    for (var i = 0; i < pts.length; i++) {
      var hw = wLo + ((tileHash01(r, c, seed + 300 + i) * (wHi - wLo + 0.99)) | 0);
      var hh = hLo + ((tileHash01(r, c, seed + 330 + i) * (hHi - hLo + 0.99)) | 0);
      drawGemFacet(pts[i].x, pts[i].y, hw, hh, ramp);
    }
    return pts;
  }

  // Scatter of ragged tilted shards — for glassy / splintery ores.
  function drawShardScatter(tx, ty, r, c, seed, ramp, minN, maxN, lLo, lHi, thk) {
    var pts = oreScatter(tx, ty, r, c, seed, minN, maxN);
    for (var i = 0; i < pts.length; i++) {
      var hl = lLo + ((tileHash01(r, c, seed + 300 + i) * (lHi - lLo + 0.99)) | 0);
      var tilt = (tileHash01(r, c, seed + 330 + i) - 0.5) * 3.0;
      drawOreShard(pts[i].x, pts[i].y, hl, thk, tilt, ramp, r, c, seed + 360 + i * 40);
    }
    return pts;
  }

  // Scatter of ragged grains — for granular ores.
  function drawGrainScatter(tx, ty, r, c, seed, ramp, minN, maxN, rLo, rHi) {
    var pts = oreScatter(tx, ty, r, c, seed, minN, maxN);
    for (var i = 0; i < pts.length; i++) {
      var rad = rLo + ((tileHash01(r, c, seed + 300 + i) * (rHi - rLo + 0.99)) | 0);
      drawOreGrain(pts[i].x, pts[i].y, rad, ramp, r, c, seed + 360 + i * 24);
    }
    return pts;
  }

  function drawCinnabarOre(tx, ty, r, c) {
    // Cinnabar (mercury ore) — production-locked v17.22. A spatial-fade
    // puff cluster (centre dense, edges dissolve) anchored at the *head*
    // of a per-tile drag stroke, with an elliptical scatter halo of 42
    // loose pigment specks trailing along the drag direction through
    // the host. Cluster is pulled ~1 px against smearAng so it reads as
    // the dense origin of the stroke; halo trails outward as the thin
    // tail (bias 0.60). Tone bands across the halo are shadow-weighted
    // in the mid so the smear has strong readable midtone with outline
    // tone only in the far tail. A single bright peach glint anchors
    // the biggest puff (uncommon rarity flash per bible §3). Matte and
    // opaque — NOT a glassy faceted jewel (ruby's lane). Keyed only to
    // (r, c).
    var ramp = {
      out:    '#380c0a',   // dark warm outline / far tail
      shadow: '#7c1d15',   // shaded side of a puff / mid halo
      base:   '#a82e1f',   // mid blood-scarlet / inner halo
      light:  '#cc4530'    // lit side
    };

    // Per-tile drag direction — picked first so cluster + halo align.
    var smearAng = tileHash01(r, c, 0xE020) * Math.PI * 2;
    var smearCos = Math.cos(smearAng);
    var smearSin = Math.sin(smearAng);

    // Cluster anchor — pulled ~1 px against the drag direction so the
    // cluster reads as the dense head of the stroke; small random
    // jitter (±1 px integer) on top so neighbouring cinnabar tiles
    // don't form a rigid centre-aligned chain.
    var cx = tx + 16 - smearCos + Math.round((tileHash01(r, c, 0xE001) - 0.5) * 3);
    var cy = ty + 16 - smearSin + Math.round((tileHash01(r, c, 0xE002) - 0.5) * 3);

    // ---- Smear halo (drawn first; puffs sit on top) ----
    // Loose pigment specks in an elliptical annulus around the cluster;
    // bias 0.60 along smearAng forms the tear-drop. Tone fades base →
    // shadow → outline as the speck travels outward; shadow dominates
    // the mid band (40–85% of the halo radius) so the smear reads with
    // strong midtone instead of a dim outline tail.
    for (var i = 0; i < 42; i++) {
      var s = 0xE400 + i * 6;
      var ang = tileHash01(r, c, s) * Math.PI * 2;
      var ax = Math.cos(ang), ay = Math.sin(ang);
      var dot = ax * smearCos + ay * smearSin;                    // -1..1
      var bias = 1 + dot * 0.60;                                  // 0.40..1.60 tear-drop
      var hr = 5.5 + tileHash01(r, c, s + 1) * 9.5;               // 5.5..15
      var hx = cx + ax * hr * bias;
      var hy = cy + ay * hr * bias;
      var ix = hx | 0, iy = hy | 0;
      if (ix < tx || ix >= tx + 32 || iy < ty || iy >= ty + 32) continue;
      var t = tileHash01(r, c, s + 2);
      if (t < 0.22) continue;                                     // 22% gap, halo isn't solid
      var dn = (hr - 5.5) / 9.5;                                  // 0..1 near→far
      var tone;
      if (dn < 0.40)      tone = (t < 0.55) ? ramp.base   : ramp.shadow;
      else if (dn < 0.85) tone = (t < 0.45) ? ramp.shadow : ramp.out;
      else                tone = ramp.out;
      ctx.fillStyle = tone;
      ctx.fillRect(ix, iy, 1, 1);
    }

    // ---- The puff cluster (chunky centre, spatial fade to edges) ----
    var SPACING = 3.5;
    var bigR = 0, bigX = cx, bigY = cy;
    for (var gy = -2; gy <= 2; gy++) {
      for (var gx = -2; gx <= 2; gx++) {
        var slot = 0xE100 + ((gy + 2) * 5 + (gx + 2)) * 16;
        // Spatial vignette: distance from cluster centre in grid units,
        // 0 at centre, ~2.83 at far corners. Both empty-chance and max
        // puff radius scale with this, so the cluster gradient-fades
        // into the host at its rim.
        var gd = Math.sqrt(gx * gx + gy * gy);
        var fade = Math.min(1, gd / 2.4);                          // 0..1
        var skipChance = 0.18 + fade * 0.55;                       // 18% centre → 73% edge
        if (tileHash01(r, c, slot) < skipChance) continue;
        var jx = (tileHash01(r, c, slot + 1) - 0.5) * 1.7;          // sub-cell jitter
        var jy = (tileHash01(r, c, slot + 2) - 0.5) * 1.7;
        var px = cx + gx * SPACING + jx;
        var py = cy + gy * SPACING + jy;
        var dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy > 81) continue;                      // round the cluster
        var rMax = 2.8 - fade * 1.4;                               // centre 2.8 → edge 1.4
        var rad = 1.0 + tileHash01(r, c, slot + 3) * (rMax - 1.0);
        drawOreGrain(px, py, rad, ramp, r, c, slot + 8);
        if (rad > bigR) { bigR = rad; bigX = px; bigY = py; }
      }
    }
    // Single bright peach glint on the biggest puff — brighter than
    // v17.21 so the flash survives against the busier smear composition,
    // but still one pixel per bible §3 "one quiet glint" budget.
    if (bigR > 0) {
      ctx.fillStyle = '#f59078';
      ctx.fillRect((bigX | 0) - 1, (bigY | 0) - 1, 1, 1);
    }
  }

  // A small insect silhouette — the amber inclusion. Fixed bug anatomy
  // (segmented body, six splayed legs, two antennae) drawn at (ix, iy)
  // rotated by ang. bodyTone is the solid body; limbTone (lighter) the
  // thin legs and antennae. Per-pixel; no hashing — shape is fixed.
  function drawInsectInclusion(ix, iy, ang, bodyTone, limbTone) {
    var cs = Math.cos(ang), sn = Math.sin(ang);
    function px(lx, ly) { return [ix + lx * cs - ly * sn, iy + lx * sn + ly * cs]; }
    function disc(lx, ly, rr) {
      var p = px(lx, ly), m = Math.ceil(rr), cxr = Math.round(p[0]), cyr = Math.round(p[1]);
      for (var ddy = -m; ddy <= m; ddy++) {
        for (var ddx = -m; ddx <= m; ddx++) {
          if (ddx * ddx + ddy * ddy <= rr * rr) ctx.fillRect(cxr + ddx, cyr + ddy, 1, 1);
        }
      }
    }
    function limb(ax, ay, bx, by) {
      var a = px(ax, ay), b = px(bx, by);
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
      for (var i = 0; i <= n; i++) {
        ctx.fillRect(Math.round(a[0] + dx * i / n), Math.round(a[1] + dy * i / n), 1, 1);
      }
    }
    // Legs + antennae first, so the body discs overpaint their roots.
    ctx.fillStyle = limbTone;
    limb(1.2, -1.1, 3.0, -3.9);   limb(1.2, 1.1, 3.0, 3.9);     // front legs
    limb(0.2, -1.3, 0.5, -4.2);   limb(0.2, 1.3, 0.5, 4.2);     // mid legs
    limb(-0.8, -1.1, -2.4, -3.7); limb(-0.8, 1.1, -2.4, 3.7);   // rear legs
    limb(3.2, -0.5, 5.2, -2.2);   limb(3.2, 0.5, 5.2, 2.2);     // antennae
    // Segmented body — abdomen, thorax, head.
    ctx.fillStyle = bodyTone;
    disc(-2.7, 0, 2.2);
    disc(0.4, 0, 1.6);
    disc(2.7, 0, 1.2);
  }

  function drawAmberOre(tx, ty, r, c) {
    // Amber — a blob of translucent honey-gold fossil resin with a dark
    // insect silhouette suspended inside (the signature accent) and a
    // fleck or two of trapped debris. Reuses the Encased-ore nodule
    // helper; warm and glowing where methane-ice is cold. A matte
    // rounded lump, NOT faceted. Calm and static. Keyed only to (r, c).
    var ramp = {
      out:  '#3f2207',     // dark brown outline
      rim:  '#ffeaad',     // glossy pale-honey lit rim
      body: ['#7a4410', '#9c5d18', '#bf7c22',     // honey body, dark..light
             '#dd9a30', '#f0b746', '#ffd472']
    };
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xD010) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xD011) - 0.5) * 4);
    var rad = 9.5 + tileHash01(r, c, 0xD012) * 1.6;          // 9.5..11.1

    drawEncasedNodule(cx, cy, rad, ramp, r, c, 0xD100);

    // The trapped insect — suspended a little off-centre, at a lazy angle.
    var ia = tileHash01(r, c, 0xD013) * 6.283;
    var id = tileHash01(r, c, 0xD014) * 3.2;
    drawInsectInclusion(cx + Math.cos(ia) * id, cy + Math.sin(ia) * id,
                        tileHash01(r, c, 0xD015) * 6.283, '#2c1a0a', '#46300f');

    // A fleck or two of trapped debris in the resin.
    for (var k = 0; k < 3; k++) {
      if (tileHash01(r, c, 0xD600 + k) < 0.4) continue;
      var da = tileHash01(r, c, 0xD608 + k) * 6.283;
      var dd = (0.34 + tileHash01(r, c, 0xD610 + k) * 0.46) * rad;
      ctx.fillStyle = '#46300f';
      ctx.fillRect(Math.round(cx + Math.cos(da) * dd),
                   Math.round(cy + Math.sin(da) * dd), 1, 1);
    }
  }

  function drawFossilOre(tx, ty, r, c) {
    // Fossil ore — three variations of skull + big bones. Every tile
    // shows a skull paired with multiple big bones (no single-bone
    // variations — those read too bare).
    //  (A) profile dinosaur skull + TWO parallel horizontal femurs
    //      stacked below (= sign style, museum-shelf);
    //  (B) profile dinosaur skull + two crossed femurs (jolly-roger
    //      with a side-view skull);
    //  (C) classic jolly roger (front-view skull with two eye sockets
    //      + two crossed femurs underneath).
    // All three rotate per-tile so the orientation varies. ORES key
    // and function are now `fossil` / `drawFossilOre` (was `trilobite`
    // for code continuity until v17.34; renamed in v17.35 since the
    // design is dinosaur bones, not literal trilobites). Keyed only
    // to (r, c).
    var boneOut    = '#3a2410';                                  // dark outline
    var boneShadow = '#7a6450';                                  // shadow side
    var boneMid    = '#c8b08a';                                  // mid body (ivory)
    var boneLit    = '#e8d4a8';                                  // lit highlight
    var boneHole   = '#1c1206';                                  // dark hole (eye socket)

    // Per-tile params — cluster centre jitter + rotation angle.
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x7000) - 0.5) * 3);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x7001) - 0.5) * 3);
    var rotAng = tileHash01(r, c, 0x7002) * Math.PI * 2;
    var rcv = Math.cos(rotAng), rsv = Math.sin(rotAng);

    // ---- Helper: paint a single pixel in body-local (u, v) ----
    function paintLocal(u, v, tone) {
      var px = (cx + u * rcv - v * rsv) | 0;
      var py = (cy + u * rsv + v * rcv) | 0;
      if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) return;
      ctx.fillStyle = tone;
      ctx.fillRect(px, py, 1, 1);
    }

    // ---- Helper: bone-body tone based on lit side and edge ----
    function boneToneAt(u, hw, atEdge) {
      if (atEdge) return boneOut;
      var lit = -u / Math.max(0.5, hw);
      if (lit > 0.45)       return boneLit;
      else if (lit > -0.30) return boneMid;
      else                  return boneShadow;
    }

    // ---- Helper: draw a femur at (cu, cv) oriented along ang ----
    // Femur silhouette: bulbous epiphyses + slender shaft. Used by
    // every variation so the femurs are consistent in shape.
    function drawFemurAt(cu, cv, ang, halfLen, baseHW) {
      var fc = Math.cos(ang), fs = Math.sin(ang);
      for (var fv = -halfLen; fv <= halfLen; fv++) {
        var fv01 = (fv + halfLen) / (halfLen * 2);
        var fsn = (fv01 - 0.5) * 2;
        var fhw = (baseHW * 0.42) + (baseHW * 0.58) * Math.pow(Math.abs(fsn), 4);
        if (Math.abs(fsn) > 0.93) {
          var fcap = (Math.abs(fsn) - 0.93) / 0.07;
          fhw *= Math.sqrt(Math.max(0, 1 - fcap * fcap));
        }
        if (fhw < 0.3) continue;
        var fhwi = Math.ceil(fhw);
        for (var fu = -fhwi; fu <= fhwi; fu++) {
          if (Math.abs(fu) > fhw + 0.1) continue;
          var fbodyU = cu + (fu * fc - fv * fs);
          var fbodyV = cv + (fu * fs + fv * fc);
          var fatEdge = Math.abs(fu) >= fhw - 0.5;
          paintLocal(fbodyU, fbodyV, boneToneAt(fu, fhw, fatEdge));
        }
      }
    }

    // ---- Helper: small side-view dinosaur skull centered at (0, skCv)
    // Extends along the u axis (cranium at -u, snout at +u), ~14 px
    // long. Width per slice from a hand-tuned table with a cranium
    // dome top-shift. Eye socket + nostril + 3 teeth past the jaw line.
    function drawSmallProfileSkull(skCv) {
      var smallProfWidths = [
        // sk_u = -7 to +7
        1.5, 2.6, 3.4, 3.6, 3.4, 3.0, 2.6, 2.2, 1.9, 1.6, 1.3, 1.0, 0.7, 0.4, 0
      ];
      for (var sk_u = -7; sk_u <= 7; sk_u++) {
        var sk_hw = smallProfWidths[sk_u + 7];
        if (sk_hw < 0.3) continue;
        // Cranium dome — top of skull shifted up (in -v direction)
        var sk_top = sk_u < -2 ? -((-2 - sk_u) / 5) * 0.6 : 0;
        var sk_hwi = Math.ceil(sk_hw + Math.abs(sk_top));
        for (var sk_v = -sk_hwi; sk_v <= sk_hwi; sk_v++) {
          var sk_local_v = sk_v - sk_top;
          if (Math.abs(sk_local_v) > sk_hw + 0.1) continue;
          var sk_atEdge = Math.abs(sk_local_v) >= sk_hw - 0.5;
          paintLocal(sk_u, skCv + sk_v, boneToneAt(sk_local_v, sk_hw, sk_atEdge));
        }
      }
      // Eye socket — dark elliptical hole at cranium / snout junction
      for (var ey_u = -4; ey_u <= -2; ey_u++) {
        for (var ey_v = -3; ey_v <= -1; ey_v++) {
          var ey_ell = ((ey_u + 3) / 1.2) * ((ey_u + 3) / 1.2) + ((ey_v + 2) / 1.2) * ((ey_v + 2) / 1.2);
          if (ey_ell > 1) continue;
          paintLocal(ey_u, skCv + ey_v, boneHole);
        }
      }
      // Nostril near snout tip
      paintLocal(4, skCv, boneHole);
      paintLocal(5, skCv, boneHole);
      // Teeth past the jaw line (+v side from skull center)
      for (var tt_u = 0; tt_u <= 4; tt_u += 2) {
        var tt_hw = smallProfWidths[tt_u + 7];
        if (tt_hw < 0.5) continue;
        var tt_v = Math.ceil(tt_hw) + 1;
        paintLocal(tt_u, skCv + tt_v, boneOut);
      }
    }

    // ---- Arrangement: pick once per tile from 3 variations ----
    var arr = tileHash01(r, c, 0x7003);

    if (arr < 0.40) {
      // ================================================
      // (A) Profile skull + 2 PARALLEL big femurs (= sign)
      // ================================================
      // Side-view dinosaur skull on top + two horizontal femurs
      // stacked beneath. The upper femur is slightly bigger
      // (halfLen=11, baseHW=3.3), the lower slightly smaller
      // (halfLen=10, baseHW=2.8) so the composition has a clear
      // hierarchy. Bare-skull-plus-one-bone was too sparse; two
      // stacked femurs read as a clear museum-shelf bone collection.
      drawSmallProfileSkull(-9);
      drawFemurAt(0, 1, Math.PI / 2, 11, 3.3);
      drawFemurAt(0, 9, Math.PI / 2, 10, 2.8);
    }
    else if (arr < 0.70) {
      // ================================================
      // (B) Profile skull + two crossed femurs
      // ================================================
      // Side-view skull on top + jolly-roger-style crossed femurs
      // underneath (the dinosaur version of the bones symbol).
      drawSmallProfileSkull(-8);
      drawFemurAt(0, 6, Math.PI * 0.20, 9, 2.6);
      drawFemurAt(0, 6, -Math.PI * 0.20, 9, 2.6);
    }
    else {
      // ================================================
      // (C) Classic Jolly Roger — front-view skull + crossed femurs
      // ================================================
      // Round front-view skull with two eye sockets, nasal cavity,
      // and a teeth row + two femurs crossed in an X underneath.
      var ssCv = -7;
      // Cranium — rounded oval ~10 wide × 7 tall
      for (var sky = -3; sky <= 3; sky++) {
        for (var skx = -5; skx <= 5; skx++) {
          var skEll = (skx / 5) * (skx / 5) + (sky / 3.5) * (sky / 3.5);
          if (skEll > 1) continue;
          var atEdgeSm = skEll > 0.65;
          var skTone;
          if (atEdgeSm) skTone = boneOut;
          else {
            var skLit = -skx / 5;
            if (skLit > 0.3) skTone = boneLit;
            else if (skLit > -0.3) skTone = boneMid;
            else skTone = boneShadow;
          }
          paintLocal(skx, ssCv + sky, skTone);
        }
      }
      // Two eye sockets — dark 2×2 holes
      for (var ssy = -1; ssy <= 0; ssy++) {
        for (var ssx = -3; ssx <= -2; ssx++) {
          paintLocal(ssx, ssCv + ssy, boneHole);
        }
        for (var ssx2 = 2; ssx2 <= 3; ssx2++) {
          paintLocal(ssx2, ssCv + ssy, boneHole);
        }
      }
      // Nasal cavity — small dark triangle below eyes
      paintLocal(0, ssCv + 1, boneHole);
      paintLocal(-1, ssCv + 2, boneHole);
      paintLocal(0, ssCv + 2, boneHole);
      paintLocal(1, ssCv + 2, boneHole);
      // Teeth row at bottom of skull — 3 visible vertical lines
      paintLocal(-2, ssCv + 3, boneOut);
      paintLocal(0, ssCv + 3, boneOut);
      paintLocal(2, ssCv + 3, boneOut);

      // Crossed femurs in the lower half
      drawFemurAt(0, 6, Math.PI * 0.20, 9, 2.6);
      drawFemurAt(0, 6, -Math.PI * 0.20, 9, 2.6);
    }
  }

  function drawUraniumOre(tx, ty, r, c) {
    // Uranium — acid-green crystalline starburst with a luminous
    // yellow-green *glow rim* around the silhouette (the radioactive
    // aura) and a few pale decay specks scattered nearby suggesting
    // alpha emission. 6–8 tapered shards radiate outward from a central
    // core point; each spike is drawn TWICE — first as a fatter halo
    // shard in the glow colour, then as the real shard in the dark /
    // acid-green ramp on top — so a 1-pixel luminous rim shows through
    // around every silhouette edge once the body overdraws the centre.
    // The cluster centre carries a small intense glow heart and the
    // shards' outline tone is a very dark olive so the silhouette reads
    // crisp against the host dirt. Renders host-through (drawEarlyOreBase
    // branch); no flat ORES.color fill underneath. Keyed only to (r, c).
    var ramp = {
      out:    '#0e2a0a',   // very dark olive (silhouette outline)
      shadow: '#2e5a18',   // dark olive
      base:   '#5fc028',   // acid-green body
      light:  '#9be148',   // bright lime
      shine:  '#cbff6e'    // facet highlight
    };
    var glowColor = '#beff5c';                                  // luminous yellow-green rim
    var glowRamp = { out: glowColor, shadow: glowColor, base: glowColor, light: glowColor, shine: glowColor };
    var decayCol = '#e8ffaf';                                   // pale UV decay speck

    // Cluster centre with mild jitter.
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xF010) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xF011) - 0.5) * 4);

    // 6–8 spike count, evenly distributed angles + per-spike jitter.
    var nSpikes = 6 + ((tileHash01(r, c, 0xF020) * 3) | 0);     // 6, 7, or 8
    var angBase = tileHash01(r, c, 0xF021) * Math.PI * 2;
    var spikes = [];
    for (var i = 0; i < nSpikes; i++) {
      var s = 0xF030 + i * 8;
      var ang = angBase + (i / nSpikes) * Math.PI * 2
              + (tileHash01(r, c, s) - 0.5) * 0.45;             // ~±13° jitter
      var halfLen = 2.8 + tileHash01(r, c, s + 1) * 2.2;        // shard half-axis 2.8..5
      var halfThk = 0.9 + tileHash01(r, c, s + 2) * 0.7;        // shard half-thickness 0.9..1.6
      // Anchor the shard so its near end sits at the cluster centre and
      // it extends outward by 2*halfLen along ang (drawOreShard centres
      // the shard on (cx, cy) and extends ±halfLen along its tilt axis).
      var shardCx = cx + Math.cos(ang) * halfLen;
      var shardCy = cy + Math.sin(ang) * halfLen;
      spikes.push({ cx: shardCx, cy: shardCy, halfLen: halfLen, halfThk: halfThk, tilt: ang, seed: s + 100 });
    }

    // ---- Pass 1: glow halo — fatter, all-glow shards. The expansion
    // shows as a 1-pixel luminous rim once the bodies overdraw on top.
    for (var i = 0; i < spikes.length; i++) {
      var sp = spikes[i];
      drawOreShard(sp.cx, sp.cy, sp.halfLen + 0.5, sp.halfThk + 0.6, sp.tilt, glowRamp, r, c, sp.seed);
    }

    // ---- Pass 2: spike bodies — the dark-outlined acid-green crystals.
    for (var i = 0; i < spikes.length; i++) {
      var sp = spikes[i];
      drawOreShard(sp.cx, sp.cy, sp.halfLen, sp.halfThk, sp.tilt, ramp, r, c, sp.seed);
    }

    // ---- Central core — a small bright glow heart at cluster centre.
    var icx = cx | 0, icy = cy | 0;
    ctx.fillStyle = '#a2f342';                                  // intense centre
    ctx.fillRect(icx, icy, 1, 1);
    ctx.fillStyle = glowColor;
    ctx.fillRect(icx - 1, icy, 1, 1);
    ctx.fillRect(icx + 1, icy, 1, 1);
    ctx.fillRect(icx, icy - 1, 1, 1);
    ctx.fillRect(icx, icy + 1, 1, 1);

    // ---- Decay specks — 2-4 single pale pixels scattered around the
    // cluster (after gap-skip), outside the spike silhouette, suggesting
    // alpha emission.
    for (var d = 0; d < 5; d++) {
      var ds = 0xF200 + d * 4;
      if (tileHash01(r, c, ds + 2) < 0.35) continue;            // 35% gap
      var dang = tileHash01(r, c, ds) * Math.PI * 2;
      var dist = 10 + tileHash01(r, c, ds + 1) * 4;             // 10..14 px from centre
      var dpx = (cx + Math.cos(dang) * dist) | 0;
      var dpy = (cy + Math.sin(dang) * dist) | 0;
      if (dpx < tx || dpx >= tx + 32 || dpy < ty || dpy >= ty + 32) continue;
      ctx.fillStyle = decayCol;
      ctx.fillRect(dpx, dpy, 1, 1);
    }

    // ---- Slow breathing aura — two layers that breathe in/out over
    // ~4.5 seconds with a per-tile phase offset so neighbouring uranium
    // tiles don't beat in lockstep (would otherwise read as a grid).
    // Layer A: 40 sparse glow pixels in a wide outer ring (radius 7-13)
    // so the aura extends past the spike silhouette into open host.
    // Layer B: brighter central core during the top half of the cycle.
    // Peak alpha 0.9 so the difference between trough (invisible aura)
    // and peak (clear bright halo) is actually visible frame-to-frame.
    // drawEarlyOreBase renders live per-frame for uranium (outside
    // EARLY_ORE_ATLAS_TYPES, so not atlas-baked), so the animation
    // works without invalidating any cache.
    var pulseT = performance.now() / 1000;
    var pulsePhase = tileHash01(r, c, 0xF300) * Math.PI * 2;
    var pulse = 0.5 + 0.5 * Math.sin(pulseT * 1.4 + pulsePhase);    // 0..1, period ~4.5s
    var savedAlpha = ctx.globalAlpha;
    // Layer A: outer aura halo
    if (pulse > 0.02) {
      ctx.globalAlpha = pulse * 0.90;
      ctx.fillStyle = glowColor;
      for (var au = 0; au < 40; au++) {
        var auSeed = 0xF310 + au * 3;
        var auAng = tileHash01(r, c, auSeed) * Math.PI * 2;
        var auR = 7 + tileHash01(r, c, auSeed + 1) * 6;             // 7..13
        var aupx = (cx + Math.cos(auAng) * auR) | 0;
        var aupy = (cy + Math.sin(auAng) * auR) | 0;
        if (aupx < tx || aupx >= tx + 32 || aupy < ty || aupy >= ty + 32) continue;
        ctx.fillRect(aupx, aupy, 1, 1);
      }
    }
    // Layer B: hot core during the top half of the pulse cycle.
    if (pulse > 0.3) {
      ctx.globalAlpha = (pulse - 0.3) / 0.7;                        // 0..1 over 0.3..1
      ctx.fillStyle = '#eaff96';                                    // very bright yellow-green
      var icx3 = cx | 0, icy3 = cy | 0;
      ctx.fillRect(icx3, icy3, 1, 1);
      ctx.fillRect(icx3 - 1, icy3, 1, 1);
      ctx.fillRect(icx3 + 1, icy3, 1, 1);
      ctx.fillRect(icx3, icy3 - 1, 1, 1);
      ctx.fillRect(icx3, icy3 + 1, 1, 1);
    }
    ctx.globalAlpha = savedAlpha;
  }

  // One lumpy, translucent, rounded nodule — the Encased-ore primitive
  // (methane ice, amber). Shaded as a 3-D sphere: a surface-normal
  // diffuse term lit from the upper-left, so the tone bands curve with
  // the form instead of running as flat diagonal stripes. A 4x4 ordered
  // dither blends adjacent body tones so the gradient reads smooth on a
  // small palette. Dark outline on the lower-right rim, frost rime on
  // the upper-left. ramp needs {out, rim, body:[dark..light tones]}.
  // Keyed to (r, c, seed).
  function drawEncasedNodule(cx, cy, rad, ramp, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    var pA = tileHash01(r, c, seed + 1) * 6.283;
    var pB = tileHash01(r, c, seed + 2) * 6.283;
    var pC = tileHash01(r, c, seed + 3) * 6.283;
    var body = ramp.body, nLev = body.length;
    var rMax = Math.ceil(rad * 1.3) + 1;
    for (var dy = -rMax; dy <= rMax; dy++) {
      for (var dx = -rMax; dx <= rMax; dx++) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        var theta = Math.atan2(dy, dx);
        var contour = 1 + Math.sin(theta * 3 + pA) * 0.11
                        + Math.sin(theta * 5 + pB) * 0.07
                        + Math.sin(theta * 2 + pC) * 0.06;
        var noise = (tileHash01(r, c, seed + 40 + (dx + 20) * 32 + (dy + 20)) - 0.5) * 0.7;
        var rEff = rad * contour + noise;
        if (dist > rEff) continue;
        // Sphere-normal diffuse — light from the upper-left, tilted
        // toward the viewer; the z term brightens the bulge.
        var nx = dx / rad, ny = dy / rad;
        var nr2 = nx * nx + ny * ny;
        var nz = nr2 < 1 ? Math.sqrt(1 - nr2) : 0;
        var diff = nx * -0.62 + ny * -0.62 + nz * 0.48;
        var fill;
        if (rEff - dist < 1.1) {
          fill = diff > 0.10 ? ramp.rim : ramp.out;       // frost rime / outline
        } else {
          var t = (diff + 0.72) / 1.62;                   // -> 0..1 brightness
          var idx = Math.floor(t * (nLev - 1)
                  + BAYER4[(dy & 3) * 4 + (dx & 3)] / 16);
          if (idx < 0) idx = 0; else if (idx > nLev - 1) idx = nLev - 1;
          fill = body[idx];
        }
        ctx.fillStyle = fill;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  function drawMethaneiceOre(tx, ty, r, c) {
    // Methane ice ("fire ice") — a pale, translucent icy-blue nodule
    // with gas bubbles trapped inside, wrapped in a halo of fine frost
    // crystals spraying off its surface. A matte, rounded lump, NOT a
    // faceted gem (that is diamond's lane). Signature accent: the
    // trapped bubbles. Calm and static (a common ore). Keyed to (r, c).
    var ramp = {
      out:    '#33505f',   // dark cool outline
      rim:    '#f0fafc',   // frosty near-white rime / hot frost
      frost2: '#aecdd6',   // dimmer frost — the fading outer spray
      body: ['#5d8295', '#7299aa', '#8aafbf',     // icy body, dark..light
             '#a3c4d2', '#bed9e3', '#d8edf3']
    };
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xC010) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xC011) - 0.5) * 4);
    var rad = 9 + tileHash01(r, c, 0xC012) * 1.6;           // 9..10.6

    drawEncasedNodule(cx, cy, rad, ramp, r, c, 0xC100);

    // Trapped gas bubbles — the signature accent: small icy spheres set
    // inside the nodule (pale core, bright catch-light, dark far rim).
    var nBub = 3 + ((tileHash01(r, c, 0xC013) * 1.99) | 0);  // 3..4
    for (var i = 0; i < nBub; i++) {
      var bSeed = 0xC600 + i * 16;
      var ba = tileHash01(r, c, bSeed) * 6.283;
      var bd = (0.18 + tileHash01(r, c, bSeed + 1) * 0.52) * rad;
      var bx = cx + Math.cos(ba) * bd, by = cy + Math.sin(ba) * bd;
      var br = 1.7 + tileHash01(r, c, bSeed + 2) * 0.9;      // 1.7..2.6
      var bMax = Math.ceil(br + 0.5);
      for (var dy = -bMax; dy <= bMax; dy++) {
        for (var dx = -bMax; dx <= bMax; dx++) {
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d > br + 0.4) continue;
          var bfill;
          if (d > br - 0.85) {
            bfill = (dx + dy < -0.3) ? ramp.rim : ramp.out;  // catch-light / far rim
          } else {
            bfill = ramp.body[5];                            // pale bubble core
          }
          ctx.fillStyle = bfill;
          ctx.fillRect(Math.round(bx + dx), Math.round(by + dy), 1, 1);
        }
      }
    }

    // Frost spray — a halo of fine frost crystals off the nodule:
    // bright 1-3px radial needles dense at the surface, fading to
    // sparse dim specks as they reach out into the host.
    var nSpray = 20 + ((tileHash01(r, c, 0xC800) * 10) | 0);  // 20..29
    for (var s = 0; s < nSpray; s++) {
      var sSeed = 0xC820 + s * 8;
      var sAng = tileHash01(r, c, sSeed) * 6.283;
      var u = tileHash01(r, c, sSeed + 1);
      var off = u * u * 7;                                   // 0 (surface)..7
      var sd = rad - 1 + off;
      var sx = cx + Math.cos(sAng) * sd, sy = cy + Math.sin(sAng) * sd;
      var near = off < 3.5;
      ctx.fillStyle = near ? ramp.rim : ramp.frost2;
      var sLen = near ? (1 + ((tileHash01(r, c, sSeed + 2) * 2.5) | 0)) : 1;
      var cax = Math.cos(sAng), cay = Math.sin(sAng);
      for (var k = 0; k < sLen; k++) {
        ctx.fillRect(Math.round(sx + cax * k), Math.round(sy + cay * k), 1, 1);
      }
    }
  }

  function drawObsidianOre(tx, ty, r, c) {
    // Obsidian — a CLUSTER of angular volcanic-glass chunks: one hero
    // chunk with 2-3 smaller shards broken off and clustered around
    // it. Real obsidian shatters into interlocking pieces, so a
    // cluster of polygons reads truer than a single clean blob. Each
    // chunk is its own 5-vertex polygon — purple-violet body, sharp
    // straight outline, lavender mirror shines; the hero also carries
    // the pure-white specular. Renders host-through (drawEarlyOreBase
    // branch). Keyed only to (r, c).
    var OUT    = '#000000';   // pure-black outline
    var SHADOW = '#0a0418';   // body shadow — deep purple-black
    var BASE   = '#1e1232';   // body base — clearly purple-tinted
    var LIT    = '#3c2a60';   // lit face — violet-purple
    var HOT    = '#b095d8';   // mirror-shine cores — lavender
    var SPEC   = '#ffffff';   // pure-white specular peak — HERO pixel
    var SHEEN  = '#b06ce8';   // rim iridescence — vivid violet flash

    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x6700) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x6701) - 0.5) * 4);

    // Light + mirror-shine angle are shared by every chunk so the
    // whole cluster reads as lit by one source with parallel gloss.
    var LX = -0.7071, LY = -0.7071;
    var shineAng = -Math.PI / 4 + (tileHash01(r, c, 0x6720) - 0.5) * 0.25;
    var sdx = Math.cos(shineAng), sdy = Math.sin(shineAng);
    var perpX = -sdy, perpY = sdx;

    // Draw one angular glass chunk centred at (chx, chy). detail 2 =
    // hero (2 mirror shines + specular + 2-3 sheen), 1 = mid shard
    // (1 shine + 1 sheen), 0 = small shard (1 short shine only).
    function drawChunk(chx, chy, sizeScale, detail, seed) {
      var nVerts = 5;
      var rotBase = tileHash01(r, c, seed) * Math.PI * 2;
      var verts = [];
      var minX = 99, maxX = -99, minY = 99, maxY = -99;
      for (var vi = 0; vi < nVerts; vi++) {
        var vAng = rotBase + vi * (Math.PI * 2 / nVerts);
        var vRad = (6 + tileHash01(r, c, seed + 10 + vi) * 6) * sizeScale;
        var vx = Math.cos(vAng) * vRad, vy = Math.sin(vAng) * vRad;
        verts.push({ x: vx, y: vy });
        if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
      }

      // Point-in-polygon (ray casting).
      function inPoly(px, py) {
        var inside = false;
        for (var i = 0, j = nVerts - 1; i < nVerts; j = i++) {
          var xi = verts[i].x, yi = verts[i].y;
          var xj = verts[j].x, yj = verts[j].y;
          if ((yi > py) !== (yj > py) &&
              px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
          }
        }
        return inside;
      }
      // Shortest distance from (px, py) to any polygon edge — gives
      // the sharp straight outline along the polygon's flat sides.
      function distToEdge(px, py) {
        var minDist = 999;
        for (var i = 0, j = nVerts - 1; i < nVerts; j = i++) {
          var x1 = verts[j].x, y1 = verts[j].y;
          var x2 = verts[i].x, y2 = verts[i].y;
          var ex = x2 - x1, ey = y2 - y1;
          var lenSq = ex * ex + ey * ey;
          var t = lenSq > 0 ? ((px - x1) * ex + (py - y1) * ey) / lenSq : 0;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var nx = x1 + t * ex, ny = y1 + t * ey;
          var ddx = px - nx, ddy = py - ny;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < minDist) minDist = d;
        }
        return minDist;
      }
      // Walk a ray from chunk centre at `ang` and return the radius
      // where it exits the polygon — used to anchor specular + sheen.
      function rayExit(ang) {
        var rdx = Math.cos(ang), rdy = Math.sin(ang), out = 1;
        for (var rr = 1; rr < 18; rr += 0.5) {
          if (!inPoly(rdx * rr, rdy * rr)) break;
          out = rr;
        }
        return out;
      }

      // Body — polygon-clipped 4-tone shading over the vertex bbox.
      var y0 = Math.floor(minY) - 1, y1 = Math.ceil(maxY) + 1;
      var x0 = Math.floor(minX) - 1, x1 = Math.ceil(maxX) + 1;
      for (var dy = y0; dy <= y1; dy++) {
        for (var dx = x0; dx <= x1; dx++) {
          if (!inPoly(dx, dy)) continue;
          var px = chx + dx, py = chy + dy;
          if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) continue;
          var bTone;
          if (distToEdge(dx, dy) < 0.7) {
            bTone = OUT;
          } else {
            var bDist = Math.sqrt(dx * dx + dy * dy);
            var bLit = bDist < 0.5 ? 0 : (dx * LX + dy * LY) / bDist;
            if (bLit > 0.5) bTone = LIT;
            else if (bLit > -0.1) bTone = BASE;
            else bTone = SHADOW;
          }
          ctx.fillStyle = bTone;
          ctx.fillRect(px, py, 1, 1);
        }
      }

      // Mirror shines — lavender HOT diagonal streaks on the lit
      // face. Length scales with the chunk so big chunks get long
      // streaks and small shards get short ones.
      var avgDim = ((maxX - minX) + (maxY - minY)) * 0.5;
      var nShine = detail >= 2 ? 2 : 1;
      for (var s = 0; s < nShine; s++) {
        var off = (nShine === 2 ? (s === 0 ? -2.5 : 2.5) : 0)
                  + (tileHash01(r, c, seed + 30 + s) - 0.5);
        var slen = Math.round(avgDim * (0.34 + tileHash01(r, c, seed + 35 + s) * 0.12));
        if (slen < 3) slen = 3;
        for (var t = 0; t < slen; t++) {
          var localT = t - (slen - 1) / 2;
          var lpx = Math.round(perpX * off + sdx * localT);
          var lpy = Math.round(perpY * off + sdy * localT);
          if (!inPoly(lpx, lpy)) continue;
          if (distToEdge(lpx, lpy) < 1.0) continue;
          var ldist = Math.sqrt(lpx * lpx + lpy * lpy);
          var lit2 = ldist < 0.5 ? 1 : (lpx * LX + lpy * LY) / ldist;
          if (lit2 < 0) continue;
          if (Math.sin((t + 0.5) / slen * Math.PI) > 0.3) {
            var hpx = chx + lpx, hpy = chy + lpy;
            if (hpx >= tx && hpx < tx + 32 && hpy >= ty && hpy < ty + 32) {
              ctx.fillStyle = HOT;
              ctx.fillRect(hpx, hpy, 1, 1);
            }
          }
        }
      }

      // Specular — hero only. Pure-white pixel + HOT halo at ~55% of
      // the chunk's upper-left radius, so it lands on the lit face.
      if (detail >= 2) {
        var spMax = rayExit(-Math.PI * 0.72);
        var spPx = Math.round(Math.cos(-Math.PI * 0.72) * spMax * 0.55);
        var spPy = Math.round(Math.sin(-Math.PI * 0.72) * spMax * 0.55);
        ctx.fillStyle = HOT;
        if (inPoly(spPx + 1, spPy)) ctx.fillRect(chx + spPx + 1, chy + spPy, 1, 1);
        if (inPoly(spPx, spPy + 1)) ctx.fillRect(chx + spPx, chy + spPy + 1, 1, 1);
        ctx.fillStyle = SPEC;
        if (inPoly(spPx, spPy)) ctx.fillRect(chx + spPx, chy + spPy, 1, 1);
      }

      // Rim iridescence — hero 2-3 SHEEN pixels, mid shard 1, small 0.
      var nSheen = detail >= 2 ? (tileHash01(r, c, seed + 50) < 0.5 ? 2 : 3)
                 : (detail >= 1 ? 1 : 0);
      for (var sh = 0; sh < nSheen; sh++) {
        var shAng = -Math.PI * 0.55 + (tileHash01(r, c, seed + 60 + sh) - 0.5) * 1.8;
        var shR = rayExit(shAng) - 0.5;
        var shx = chx + Math.round(Math.cos(shAng) * shR);
        var shy = chy + Math.round(Math.sin(shAng) * shR);
        if (shx >= tx && shx < tx + 32 && shy >= ty && shy < ty + 32) {
          ctx.fillStyle = SHEEN;
          ctx.fillRect(shx, shy, 1, 1);
        }
      }
    }

    // Satellite shards first (behind), hero last (on top, dominant) —
    // the pyrite hero+satellites composition. Satellites are kept
    // distinctly smaller than the hero and pushed out a little so
    // they read as minor shards poking past a dominant main chunk,
    // not co-equal pieces.
    var nSat = 2 + Math.floor(tileHash01(r, c, 0x6705) * 2);       // 2..3
    for (var si = 0; si < nSat; si++) {
      var satAng = (si / nSat) * Math.PI * 2
                   + (tileHash01(r, c, 0x6760 + si) - 0.5) * 1.5;
      var satDist = 6 + tileHash01(r, c, 0x6770 + si) * 3.5;       // 6..9.5 px
      var satX = cx + Math.round(Math.cos(satAng) * satDist);
      var satY = cy + Math.round(Math.sin(satAng) * satDist);
      var satScale = 0.40 + tileHash01(r, c, 0x6780 + si) * 0.14;  // 0.40..0.54
      drawChunk(satX, satY, satScale, si === 0 ? 1 : 0, 0x6900 + si * 0x40);
    }
    // Hero chunk — dominant, restored to the v17.40 single-chunk
    // size (the version the owner liked). The satellites above are
    // just the broken-off variation around it.
    drawChunk(cx, cy, 1.05, 2, 0x6A40);
  }

  function drawTanzaniteOre(tx, ty, r, c) {
    // Tanzanite — v17.67 "more" pass: a richer, denser specimen. Cut-gem
    // cluster of ORTHORHOMBIC prisms (crisp rectangular cross-section +
    // low wedge top — NOT ruby/emerald's hex). Headline = TRICHROISM:
    // every crystal hue-shifts violet→(indigo|BURGUNDY)→blue along its
    // length (per-tile direction flip; ~40% flash a warm burgundy mid-
    // band — tanzanite's real blue/violet/burgundy pleochroism). Plus
    // block colour zoning, a bright table facet on the termination,
    // internal FIRE sparkle, a silk fleck and one rotation-proof specular
    // (hero only). Cluster: 1 hero + 2-3 satellites + a base druse of
    // nubs. Backward-mapped rotation + SCREEN-space 4-tone lighting (lit
    // upper-left at any lean); hue + zoning ride LOCAL coords so they
    // stay glued to the crystal. Renders host-through (drawEarlyOreBase).
    // Keyed only to (r, c). Differentiators: vs ruby = rectangular +
    // violet (not hex + red); vs painite = violet + hue-shift/burgundy
    // flash (painite is dark-orange + static).
    var OUT  = '#0c0a2e';   // dark blue-violet outline
    // Brightness ramps [DEEP, MID, LIT, HOT] per hue zone.
    var VIO = ['#2c1f72', '#523fb4', '#7d64ea', '#ab93ff'];   // violet end
    var IND = ['#241f82', '#3f48be', '#5f6fe6', '#8f9bff'];   // indigo middle
    var BLU = ['#15296e', '#2a57c4', '#4f88ee', '#86b8ff'];   // blue end
    var BUR = ['#3e1242', '#6e1f63', '#a8357f', '#e070a8'];   // trichroic burgundy flash
    var FIRE = '#dffaff';   // internal fire sparkle (cyan-white)
    var SPEC = '#eaf0ff';   // specular catch-light (hero)
    var SILK = '#cfe0ff';   // silk inclusion fleck (hero)

    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x6A00) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x6A01) - 0.5) * 4);

    // One leaning orthorhombic prism (backward-mapped rotation). detail
    // 0 = nub (body + hue), 1 = satellite (+ zoning), 2 = hero (+ fire +
    // silk + specular).
    function drawPrism(pcx, pcy, halfW, halfH, angle, detail, seed) {
      pcx = Math.round(pcx); pcy = Math.round(pcy);
      halfW = Math.round(halfW); halfH = Math.round(halfH);
      var cosA = Math.cos(-angle), sinA = Math.sin(-angle);
      var cosF = Math.cos(angle), sinF = Math.sin(angle);
      var wedge = (halfH >= 6) ? 3 : 2;                  // termination height
      var flip = tileHash01(r, c, seed + 1) < 0.5;       // hue direction
      var midRamp = (tileHash01(r, c, seed + 2) < 0.36) ? BUR : IND;  // trichroic flash (~⅓)
      var bestSum = 1e9, bestX = 0, bestY = 0, gotBest = false;
      var box = Math.ceil(Math.sqrt(halfW * halfW + halfH * halfH)) + 2;
      for (var sv = -box; sv <= box; sv++) {
        for (var su = -box; su <= box; su++) {
          var lu = su * cosA - sv * sinA;
          var lv = su * sinA + sv * cosA;
          var iu = Math.round(lu), iv = Math.round(lv);
          if (iv < -halfH || iv > halfH || iu < -halfW || iu > halfW) continue;
          // wedge roof: top edge peaks in the middle, slopes to the
          // corners over `wedge` rows → a clean prism termination.
          var roof = -halfH + Math.round(wedge * Math.abs(iu) / halfW);
          if (iv < roof) continue;
          var px = pcx + su, py = pcy + sv;
          if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) continue;

          var t = (iv + halfH) / (2 * halfH);        // along the long axis
          if (flip) t = 1 - t;
          var ramp = (t < 0.36) ? VIO : (t < 0.64) ? midRamp : BLU;
          var tone;
          if (Math.abs(iu) === halfW || iv === halfH || iv === roof) {
            // Dark outline, but a bright lit-contour catch-light along the
            // crystal's upper-left silhouette — sharpens the form so the
            // prism reads crisp instead of soft (rim-light polish).
            tone = (detail >= 1 && (-su - sv) > halfW * 0.7) ? ramp[3] : OUT;
          } else {
            var lit = -su - sv + halfW * 0.3;        // screen upper-left = bright
            var bi = (lit > 4) ? 3 : (lit > 1) ? 2 : (lit > -2) ? 1 : 0;
            if (iv - roof <= 1) bi = (bi < 3) ? bi + 1 : 3;   // bright table facet
            if (detail >= 1) {                       // block colour zoning
              var bx = (iu + halfW) >> 1, by = (iv + halfH) >> 1;
              var zn = tileHash01(r, c, seed + 60 + bx * 7 + by * 13);
              if (zn > 0.86 && bi < 3) bi++;
              else if (zn < 0.13 && bi > 0) bi--;
            }
            tone = ramp[bi];
            if (bi >= 2 && (px + py) < bestSum) {
              bestSum = px + py; bestX = px; bestY = py; gotBest = true;
            }
          }
          ctx.fillStyle = tone;
          ctx.fillRect(px, py, 1, 1);
        }
      }

      // Interior flourishes — local→screen, kept well inside the body.
      function plotLocal(plu, plv, tn) {
        var px = pcx + Math.round(plu * cosF - plv * sinF);
        var py = pcy + Math.round(plu * sinF + plv * cosF);
        if (px < tx || px >= tx + 32 || py < ty || py >= ty + 32) return;
        ctx.fillStyle = tn; ctx.fillRect(px, py, 1, 1);
      }

      if (detail >= 2) {
        // Internal fire — 1-2 cyan-white sparkle pixels.
        var nf = 1 + (tileHash01(r, c, seed + 8) < 0.5 ? 1 : 0);
        for (var k = 0; k < nf; k++) {
          var fu = Math.round((tileHash01(r, c, seed + 10 + k) - 0.5) * (halfW - 1) * 1.3);
          var fv = Math.round((tileHash01(r, c, seed + 14 + k) - 0.5) * halfH * 0.8);
          plotLocal(fu, fv, FIRE);
        }
        // Silk inclusion fleck.
        plotLocal(Math.round((tileHash01(r, c, seed + 5) - 0.5) * (halfW - 1)),
                  Math.round((tileHash01(r, c, seed + 6) - 0.5) * halfH * 0.8), SILK);
        // The one specular at the crystal's upper-left bright extreme.
        if (gotBest) { ctx.fillStyle = SPEC; ctx.fillRect(bestX, bestY, 1, 1); }
      }
    }

    // ---- cluster: base nubs (behind) → satellites → hero (front) ----
    var nNub = 1 + ((tileHash01(r, c, 0x6A90) * 3) | 0);            // 1..3
    for (var b = 0; b < nNub; b++) {
      var nbX = cx + Math.round((tileHash01(r, c, 0x6AB0 + b) - 0.5) * 11);  // tight to the cluster
      var nbY = cy + 4 + Math.round(tileHash01(r, c, 0x6AC0 + b) * 8);       // sit at the base, not scattered
      var nbH = 2 + Math.round(tileHash01(r, c, 0x6AD0 + b) * 2);   // 2..4
      var nbAng = (tileHash01(r, c, 0x6AA0 + b) - 0.5) * 1.3;
      drawPrism(nbX, nbY, 2, nbH, nbAng, 0, 0x6B00 + b * 0x20);
    }

    var nSat = 2 + (tileHash01(r, c, 0x6A20) < 0.5 ? 1 : 0);        // 2..3
    for (var si = 0; si < nSat; si++) {
      var side = (si % 2 === 0) ? -1 : 1;
      var satH = 4 + Math.round(tileHash01(r, c, 0x6A30 + si) * 3);  // 4..7
      var satW = 2 + (tileHash01(r, c, 0x6A40 + si) < 0.5 ? 0 : 1);  // 2..3
      var satAng = side * (0.18 + tileHash01(r, c, 0x6A50 + si) * 0.5);
      var sxx = cx + side * (3 + Math.round(tileHash01(r, c, 0x6A60 + si) * 3));
      var syy = cy + 2 + Math.round((tileHash01(r, c, 0x6A70 + si) - 0.5) * 6);
      drawPrism(sxx, syy, satW, satH, satAng, 1, 0x6A80 + si * 0x20);
    }

    var heroH = 7 + Math.round(tileHash01(r, c, 0x6A10) * 3);        // 7..10
    var heroW = 3 + (tileHash01(r, c, 0x6A11) < 0.5 ? 0 : 1);        // 3..4
    var heroAng = (tileHash01(r, c, 0x6A12) - 0.5) * 0.7;            // ±0.35 rad lean
    drawPrism(cx, cy, heroW, heroH, heroAng, 2, 0x6AE0);
  }

  // drawPainiteOre + drawUnobtaniumOre moved to 114-ore-exotic.js — redesigned
  // from the drawGemScatter placeholder into host-through renderers (v24.15).

