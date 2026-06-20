  // ===== v24.15 — Shared ore-renderer primitives (batch 2) ================
  // Top-level pixel-art helpers for the second wave of Earth ores (malachite,
  // galena, magnetite, turquoise, cobalt, lapis, amethyst, jade,
  // rhodochrosite, sulfur, peridot, opal, platinum). Same contract as the
  // batch-1 helpers in 110 (drawGemFacet / drawOreShard / drawOreGrain /
  // drawCurlWire / drawEncasedNodule): 32×32 tile, light from the upper-LEFT,
  // per-pixel ctx.fillRect only, geometry keyed off tileHash01(r,c,seed) —
  // never neighbour reads, so mining a tile can't reshape a survivor
  // (MINERALS_BIBLE §7). All draw ONLY the mineral; the dirt/stone host shows
  // through via drawEarlyOreBase.

  // One cleaved metallic cube (galena) or octahedral crystal (magnetite).
  // A rotated square (octa=false) or point-up rhombus (octa=true), beveled by
  // screen-space upper-left light, with cleavage step-lines on the cube faces
  // and a single specular catch-light. ramp = {out, shadow, base, light, shine}.
  function drawMetalCube(cx, cy, half, ang, ramp, r, c, seed, octa) {
    cx = cx | 0; cy = cy | 0;
    var cosA = Math.cos(-ang), sinA = Math.sin(-ang);
    var R = Math.ceil(half * 1.5) + 1;
    var step = Math.max(1.6, half * 0.78);
    var phase = tileHash01(r, c, seed + 5) * step;
    for (var dy = -R; dy <= R; dy++) {
      for (var dx = -R; dx <= R; dx++) {
        var lu = dx * cosA - dy * sinA;
        var lv = dx * sinA + dy * cosA;
        var edge, fill;
        if (octa) {
          var m = Math.abs(lu) / half + Math.abs(lv) / half;
          if (m > 1) continue;
          edge = (1 - m) * half;
          if (edge < 0.9) {
            fill = ramp.out;
          } else if (Math.abs(lu) < 0.85) {
            fill = ramp.light;                 // central body ridge
          } else if (lu < 0) {
            fill = (lv < 0) ? ramp.light : ramp.base;
          } else {
            fill = (lv < 0) ? ramp.base : ramp.shadow;
          }
        } else {
          var mu = Math.abs(lu), mv = Math.abs(lv);
          if (mu > half || mv > half) continue;
          edge = half - (mu > mv ? mu : mv);
          if (edge < 0.9) {
            fill = ramp.out;
          } else {
            var lit = (-lu - lv) / half;       // upper-left positive
            if (lit > 0.42) fill = ramp.light;
            else if (lit < -0.42) fill = ramp.shadow;
            else fill = ramp.base;
            // Cubic cleavage steps — thin parallel grooves one tone deeper.
            var q = lu - lv + phase;
            q = q - Math.floor(q / step) * step;
            if (q < 0.7 && edge > 1.5) {
              fill = (fill === ramp.light) ? ramp.base
                   : (fill === ramp.base) ? ramp.shadow : ramp.out;
            }
          }
        }
        ctx.fillStyle = fill;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    // Specular catch-light at the upper-left of the silhouette.
    ctx.fillStyle = ramp.shine;
    ctx.fillRect(cx - Math.round(half * 0.34), cy - Math.round(half * 0.40), 1, 1);
  }

  // Concentric banded bulb cluster — botryoidal habit (malachite,
  // rhodochrosite). 1-2 overlapping lobes; each pixel's ring index selects a
  // band tone, shifted toward the dark end on the lower-right hemisphere so the
  // bulb still reads as a lit 3-D form. ramp = {out, bands:[dark..light]}.
  function drawBandedBotryoidal(cx, cy, rad, ramp, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    var bands = ramp.bands, nB = bands.length;
    var nLobe = 1 + (tileHash01(r, c, seed) < 0.55 ? 1 : 0);
    for (var li = 0; li < nLobe; li++) {
      var lr = rad * (li === 0 ? 1.0 : (0.52 + tileHash01(r, c, seed + 1 + li) * 0.22));
      var lcx = cx + (li === 0 ? 0 : Math.round((tileHash01(r, c, seed + 3 + li) - 0.5) * rad * 1.3));
      var lcy = cy + (li === 0 ? 0 : Math.round((tileHash01(r, c, seed + 5 + li) - 0.5) * rad * 1.1));
      var bandW = 1.8 + tileHash01(r, c, seed + 7 + li) * 0.8;
      var ringJit = tileHash01(r, c, seed + 9 + li) * bandW;
      var rMax = Math.ceil(lr) + 1;
      for (var dy = -rMax; dy <= rMax; dy++) {
        for (var dx = -rMax; dx <= rMax; dx++) {
          var dist = Math.sqrt(dx * dx + dy * dy);
          var noise = (tileHash01(r, c, seed + 60 + (dx + 16) * 19 + (dy + 16)) - 0.5) * 0.8;
          var rEff = lr + noise;
          if (dist > rEff) continue;
          var fill;
          if (rEff - dist < 1.0) {
            fill = ramp.out;
          } else {
            var ring = Math.floor((dist + ringJit) / bandW);
            var idx = ring % nB;
            var lit = (-dx - dy) / Math.max(1, lr);   // upper-left light
            if (lit < -0.28 && idx > 0) idx -= 1;      // shadow side deepens
            else if (lit > 0.40 && idx < nB - 1) idx += 1;
            fill = bands[idx];
          }
          ctx.fillStyle = fill;
          ctx.fillRect(lcx + dx, lcy + dy, 1, 1);
        }
      }
    }
  }

  // Smooth opaque mottled pebble with a waxy upper-left sheen (jade base; also
  // the body turquoise/lapis overlay their veins/flecks onto). Sphere-shaded
  // with a low-frequency mottle so tone drifts in organic patches — NO facets,
  // NO bands. ramp = {out, shadow, base, mid, light, sheen}.
  function drawPolishedStone(cx, cy, rad, ramp, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    var tones = [ramp.shadow, ramp.base, ramp.mid, ramp.light];
    var pA = tileHash01(r, c, seed + 1) * 6.283;
    var pB = tileHash01(r, c, seed + 2) * 6.283;
    var pC = tileHash01(r, c, seed + 3) * 6.283;
    var cA = tileHash01(r, c, seed + 4) * 6.283;
    var rMax = Math.ceil(rad * 1.25) + 1;
    for (var dy = -rMax; dy <= rMax; dy++) {
      for (var dx = -rMax; dx <= rMax; dx++) {
        var theta = Math.atan2(dy, dx);
        var contour = 1 + Math.sin(theta * 3 + cA) * 0.10 + Math.sin(theta * 2 + pC) * 0.06;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var rEff = rad * contour;
        if (dist > rEff) continue;
        var nx = dx / rad, ny = dy / rad;
        var nr2 = nx * nx + ny * ny;
        var nz = nr2 < 1 ? Math.sqrt(1 - nr2) : 0;
        var diff = nx * -0.6 + ny * -0.6 + nz * 0.5;          // upper-left
        var mottle = Math.sin(dx * 0.7 + pA) * Math.sin(dy * 0.62 + pB) * 0.22;
        var t = (diff + 0.7) / 1.5 + mottle;
        var fill;
        if (rEff - dist < 1.0) {
          fill = ramp.out;
        } else {
          var idx = Math.floor(t * tones.length);
          if (idx < 0) idx = 0; else if (idx > tones.length - 1) idx = tones.length - 1;
          fill = tones[idx];
        }
        ctx.fillStyle = fill;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    // Waxy sheen — a short curved glint on the upper-left shoulder.
    ctx.fillStyle = ramp.sheen;
    var sAng = 3.9 + (tileHash01(r, c, seed + 8) - 0.5) * 0.6;
    for (var s = -2; s <= 2; s++) {
      var aa = sAng + s * 0.30;
      var sr = rad * 0.62;
      ctx.fillRect(cx + Math.round(Math.cos(aa) * sr), cy + Math.round(Math.sin(aa) * sr), 1, 1);
    }
  }

  // Dark matrix webbing clipped to a radius — the spiderweb veins of turquoise.
  // A few random-walk cracks from jittered seed points; thin dark core with a
  // faint lighter shoulder. veinRamp = {dark, mid}.
  function drawMatrixVeins(cx, cy, rad, veinRamp, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    var nVein = 3 + (tileHash01(r, c, seed) * 2 | 0);          // 3..4
    for (var vi = 0; vi < nVein; vi++) {
      var ang = tileHash01(r, c, seed + 10 + vi) * 6.283;
      var px = cx + (tileHash01(r, c, seed + 20 + vi) - 0.5) * rad * 1.1;
      var py = cy + (tileHash01(r, c, seed + 30 + vi) - 0.5) * rad * 1.1;
      var len = Math.round(rad * (1.0 + tileHash01(r, c, seed + 40 + vi) * 0.8));
      for (var k = 0; k < len; k++) {
        ang += (tileHash01(r, c, seed + 100 + vi * 31 + k) - 0.5) * 0.9;
        px += Math.cos(ang);
        py += Math.sin(ang);
        var ddx = px - cx, ddy = py - cy;
        if (ddx * ddx + ddy * ddy > rad * rad) break;
        var fx = Math.round(px), fy = Math.round(py);
        ctx.fillStyle = veinRamp.mid;
        ctx.fillRect(fx, fy - 1, 1, 1);                        // lighter shoulder
        ctx.fillStyle = veinRamp.dark;
        ctx.fillRect(fx, fy, 1, 1);                            // dark core
      }
    }
  }

  // Scattered sparkle flecks within a radius — gold pyrite + white calcite in
  // lapis, and the static fallback for opal's play-of-colour. colors is an
  // array; each fleck picks one and gets a brighter centre pixel.
  function drawFlecks(cx, cy, rad, colors, count, r, c, seed) {
    cx = cx | 0; cy = cy | 0;
    for (var i = 0; i < count; i++) {
      var ang = tileHash01(r, c, seed + i * 7) * 6.283;
      var rr = Math.sqrt(tileHash01(r, c, seed + i * 7 + 3)) * rad;
      var fx = Math.round(cx + Math.cos(ang) * rr);
      var fy = Math.round(cy + Math.sin(ang) * rr);
      var col = colors[i % colors.length];
      ctx.fillStyle = col;
      ctx.fillRect(fx, fy, 1, 1);
      if (tileHash01(r, c, seed + i * 7 + 5) < 0.4) {
        ctx.fillRect(fx + 1, fy, 1, 1);                        // occasional 2px fleck
      }
    }
  }
