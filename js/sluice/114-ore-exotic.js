  // ----- Exotic ore renderers (diamond, painite, unobtanium, opal) -----
  // Diamond:     brilliant octahedral, iciest sparkle + chromatic dispersion.
  // Painite:     dark garnet-orange orthorhombic prism, warm clarity.
  // Unobtanium:  impossible magenta crystal, animated iridescent chrome rim.
  // Opal:        milky amorphous nodule, animated play-of-colour flecks.
  //
  // All four live in the drawEarlyOreBase host-through branch so dirt shows
  // between features. NEVER atlas-baked (opal + unobtanium animate per-frame).
  // Time source: performance.now() / 1000 + per-tile phase from tileHash01,
  // identical to drawUraniumOre so the animation contract is consistent.

  // ----- Diamond -----
  // Brilliant cut octahedral — near-colourless, strongest sparkle of any ore.
  // One hero gem + 1-2 smaller satellites, a 4-point star sparkle on the hero,
  // and chromatic R/G/B dispersion pixels just outside 2-3 crystal edges.
  function drawDiamondOre(tx, ty, r, c) {
    var ramp = {
      out:    '#3a6a8a',   // dark cool blue rim
      seam:   '#7ab0d0',   // vertical centre seam
      shadow: '#8fc4e0',   // lower-right face
      base:   '#c8ecf8',   // main body
      light:  '#eafaff',   // upper-left face
      shine:  '#ffffff'    // specular
    };

    // Hero position — slight jitter so it doesn't always sit dead centre.
    var hx = tx + 16 + Math.round((tileHash01(r, c, 0xD200) - 0.5) * 4);
    var hy = ty + 16 + Math.round((tileHash01(r, c, 0xD201) - 0.5) * 4);
    // Hero is equant (halfW ~ halfH) — the octahedral look.
    var heroW = 6 + (tileHash01(r, c, 0xD202) < 0.5 ? 1 : 0);   // 6 or 7
    var heroH = heroW;
    drawGemFacet(hx, hy, heroW, heroH, ramp);

    // 1-2 satellite crystals.
    var nSat = 1 + (tileHash01(r, c, 0xD210) < 0.55 ? 1 : 0);
    for (var si = 0; si < nSat; si++) {
      var sang = tileHash01(r, c, 0xD220 + si) * 6.283;
      var srad = 7 + tileHash01(r, c, 0xD230 + si) * 4;          // 7..11
      var sx = hx + Math.round(Math.cos(sang) * srad);
      var sy = hy + Math.round(Math.sin(sang) * srad);
      var sw = 3 + (tileHash01(r, c, 0xD240 + si) < 0.5 ? 1 : 0); // 3 or 4
      drawGemFacet(sx, sy, sw, sw, ramp);
    }

    // 4-point white sparkle star on the hero — the diamond signature.
    // Centre + orthogonal arms + 2 faint diagonal pixels.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx, hy, 1, 1);
    ctx.fillRect(hx - 1, hy, 1, 1);
    ctx.fillRect(hx + 1, hy, 1, 1);
    ctx.fillRect(hx, hy - 1, 1, 1);
    ctx.fillRect(hx, hy + 1, 1, 1);
    ctx.fillStyle = '#dff4ff';
    ctx.fillRect(hx - 1, hy - 1, 1, 1);
    ctx.fillRect(hx + 1, hy + 1, 1, 1);

    // Chromatic dispersion — single R/G/B pixels just outside crystal edges.
    var disp = ['#ff4250', '#46ff78', '#4aa6ff'];
    var dOffsets = [[-heroW - 1, 1], [heroW + 1, -2], [0, -heroH - 1]];
    for (var d = 0; d < 3; d++) {
      ctx.fillStyle = disp[d];
      ctx.fillRect(hx + dOffsets[d][0], hy + dOffsets[d][1], 1, 1);
    }
  }

  // ----- Painite -----
  // Dark garnet-orange orthorhombic prism — exceptional clarity, very rare.
  // Stubby chunky shards (high halfThk) read as fat orthorhombic prisms.
  // Warm brown-orange palette, brighter '#e89a5a' internal clarity glow,
  // one sharp specular. Distinctly warmer/darker than ruby.
  function drawPainiteOre(tx, ty, r, c) {
    var ramp = {
      out:    '#2a0e08',   // near-black warm outline
      shadow: '#5a2410',   // deep brown-shadow face
      base:   '#a8501e',   // orange-brown body
      light:  '#d68a4a',   // lit upper-left face
      shine:  '#ffd0a0'    // specular catch-light
    };

    // Hero prism — medium-aspect lozenge with thick halfThk to read as a prism.
    var hx = tx + 16 + Math.round((tileHash01(r, c, 0xA200) - 0.5) * 4);
    var hy = ty + 16 + Math.round((tileHash01(r, c, 0xA201) - 0.5) * 3);
    var hLen  = 5 + Math.round(tileHash01(r, c, 0xA202) * 2);    // 5..7
    var hThk  = 3 + (tileHash01(r, c, 0xA203) < 0.5 ? 0 : 1);   // 3 or 3.5 -> chunky
    var hTilt = (tileHash01(r, c, 0xA204) - 0.5) * 0.6;          // ±0.3 rad
    drawOreShard(hx, hy, hLen, hThk, hTilt, ramp, r, c, 0xA300);

    // 1-2 satellite prisms.
    var nSat = 1 + (tileHash01(r, c, 0xA210) < 0.6 ? 1 : 0);
    for (var si = 0; si < nSat; si++) {
      var sang = tileHash01(r, c, 0xA220 + si) * 6.283;
      var srad = 6 + tileHash01(r, c, 0xA230 + si) * 5;           // 6..11
      var sx = hx + Math.round(Math.cos(sang) * srad);
      var sy = hy + Math.round(Math.sin(sang) * srad);
      var sLen  = 3 + (tileHash01(r, c, 0xA240 + si) < 0.5 ? 0 : 1);
      var sThk  = 2 + (tileHash01(r, c, 0xA250 + si) < 0.4 ? 0 : 1);
      var sTilt = (tileHash01(r, c, 0xA260 + si) - 0.5) * 0.8;
      drawOreShard(sx, sy, sLen, sThk, sTilt, ramp, r, c, 0xA310 + si * 16);
    }

    // High-clarity internal glow — a brighter warm core on the hero.
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(hx, hy, 1, 1);
    ctx.fillRect(hx - 1, hy, 1, 1);

    // One sharp specular catch-light at the upper-left shoulder.
    ctx.fillStyle = '#ffd0a0';
    ctx.fillRect(hx - Math.round(hLen * 0.5), hy - 2, 1, 1);
  }

  // ----- Unobtanium -----
  // Impossible magenta crystal — legendary, animated iridescent chrome rim.
  // Tall hero facet + 2 satellites. Recomputes upper-left rim pixels each
  // frame, cycling hue. "Impossible geometry" thin facet lines. Alien feel.
  function drawUnobtaniumOre(tx, ty, r, c) {
    var ramp = {
      out:    '#3a0a4a',   // deep violet outline
      seam:   '#a020c0',   // vertical centre seam
      shadow: '#7a1490',   // lower-right face
      base:   '#c828d8',   // main magenta body
      light:  '#ff6af0',   // upper-left face
      shine:  '#ffffff'    // specular
    };
    var chromaColors = ['#ff4ad0', '#4af0ff', '#ffe14a', '#9a5cff'];

    // Per-tile phase so neighbours don't beat in lockstep.
    var t = performance.now() / 1000;
    var tilePhase = tileHash01(r, c, 0xB100) * 6.283;
    // Slow cycle: ~6s period.
    var chromaT = (t * 0.167 + tilePhase / 6.283) % 1;

    // Hero crystal — tall column (halfH > halfW, column-like silhouette).
    var hx = tx + 16 + Math.round((tileHash01(r, c, 0xB200) - 0.5) * 4);
    var hy = ty + 16 + Math.round((tileHash01(r, c, 0xB201) - 0.5) * 3);
    var heroW = 4 + (tileHash01(r, c, 0xB202) < 0.4 ? 0 : 1);   // 4 or 5
    var heroH = 7 + (tileHash01(r, c, 0xB203) < 0.5 ? 0 : 2);   // 7 or 9
    drawGemFacet(hx, hy, heroW, heroH, ramp);

    // 2 small satellites.
    for (var si = 0; si < 2; si++) {
      var sang = tileHash01(r, c, 0xB220 + si) * 6.283;
      var srad = 8 + tileHash01(r, c, 0xB230 + si) * 4;
      var sx = hx + Math.round(Math.cos(sang) * srad);
      var sy = hy + Math.round(Math.sin(sang) * srad);
      var sw = 2 + (tileHash01(r, c, 0xB240 + si) < 0.5 ? 1 : 2); // 3 or 4
      var sh = sw + 1 + (tileHash01(r, c, 0xB250 + si) < 0.5 ? 1 : 2);
      drawGemFacet(sx, sy, sw, sh, ramp);
    }

    // Animated iridescent chrome rim — paint over the hero's upper-left
    // silhouette pixels, cycling through the chroma palette each frame.
    var rimIdx = Math.floor(chromaT * 4) % 4;
    var rimIdxB = (rimIdx + 1) % 4;
    ctx.fillStyle = chromaColors[rimIdx];
    // Upper-left diagonal arm of the hero rim (approximate outline pixels).
    for (var ri = 1; ri <= heroH; ri++) {
      var rw = Math.round(heroW * (1 - ri / heroH));
      if (rw < 0) rw = 0;
      // Left edge only (upper hemisphere = light side).
      ctx.fillRect(hx - rw, hy - ri, 1, 1);
    }
    // Top apex pixel — second colour for shimmer.
    ctx.fillStyle = chromaColors[rimIdxB];
    ctx.fillRect(hx, hy - heroH, 1, 1);
    ctx.fillRect(hx - 1, hy - heroH + 1, 1, 1);

    // "Impossible geometry" thin facet lines across the hero that don't
    // quite close — painted as isolated pixels offset from where they'd
    // normally terminate. Static per tile (keyed by hash), alien feel.
    ctx.fillStyle = '#ff6af0';
    var fY1 = hy - Math.round(heroH * (0.3 + tileHash01(r, c, 0xB400) * 0.25));
    ctx.fillRect(hx - heroW + 1, fY1, 1, 1);
    ctx.fillRect(hx,             fY1, 1, 1);   // gap leaves it "open"
    ctx.fillRect(hx + heroW - 1, fY1 + 1, 1, 1); // doesn't quite meet

    var fY2 = hy + Math.round(heroH * (0.1 + tileHash01(r, c, 0xB401) * 0.15));
    ctx.fillStyle = '#c828d8';
    ctx.fillRect(hx - heroW + 2, fY2, 1, 1);
    ctx.fillRect(hx + 1,         fY2 - 1, 1, 1);  // broken, open, alien

    // Specular.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - Math.max(1, (heroW * 0.4) | 0), hy - Math.max(1, (heroH * 0.4) | 0), 1, 1);
  }

  // ----- Opal -----
  // Milky-white amorphous nodule with animated play-of-colour flecks.
  // drawEncasedNodule gives the sphere-shaded milky body; then ~10-14
  // iridescent flecks inside cycle colour over a ~6s period, per-fleck
  // phase so the flecks shimmer independently. The animated rainbow is the
  // whole point — it must read clearly against the milky white body.
  function drawOpalOre(tx, ty, r, c) {
    var bodyRamp = {
      out:  '#5a6470',   // cool grey-blue outline
      rim:  '#f4f8fc',   // near-white frost rime
      body: ['#8a96a4', '#a6b2c0', '#c2ced8', '#dde6ee', '#f2f8fc']
    };
    var opalColors = ['#ff4ad0', '#3ad0ff', '#7aff5a', '#ffd84a'];

    // Slight positional jitter per tile.
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0xF500) - 0.5) * 4);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0xF501) - 0.5) * 3);
    var rad = 9;

    drawEncasedNodule(cx, cy, rad, bodyRamp, r, c, 0xF600);

    // Per-tile time phase (same contract as drawUraniumOre).
    var t = performance.now() / 1000;
    var tilePhase = tileHash01(r, c, 0xF510) * 6.283;

    // 10-14 iridescent flecks inside the nodule.
    var nFleck = 10 + Math.round(tileHash01(r, c, 0xF520) * 4);   // 10..14
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.92;

    for (var i = 0; i < nFleck; i++) {
      // Fixed hashed position inside the nodule body.
      var fAng = tileHash01(r, c, 0xF530 + i * 7) * 6.283;
      var fR   = Math.sqrt(tileHash01(r, c, 0xF531 + i * 7)) * (rad - 2);
      var fx   = Math.round(cx + Math.cos(fAng) * fR);
      var fy   = Math.round(cy + Math.sin(fAng) * fR);

      // Per-fleck colour phase — so each fleck cycles at its own offset.
      var fleckPhase = tileHash01(r, c, 0xF532 + i * 7);
      // The 0.16 multiplier gives a ~6.25s full cycle; tilePhase / 6.283
      // is the per-tile offset (0..1) so tiles don't beat together.
      var colT = ((t * 0.16) + fleckPhase + tilePhase / 6.283) % 1;
      var colIdx = Math.floor(colT * 4) % 4;
      ctx.fillStyle = opalColors[colIdx];
      ctx.fillRect(fx, fy, 1, 1);
      // Some flecks are 2px for visibility.
      if (tileHash01(r, c, 0xF533 + i * 7) < 0.45) {
        // Pick direction for second pixel so it's still inside the nodule.
        var dx2 = (tileHash01(r, c, 0xF534 + i * 7) < 0.5) ? 1 : 0;
        var dy2 = dx2 === 0 ? 1 : 0;
        var fx2 = fx + dx2, fy2 = fy + dy2;
        var ddx = fx2 - cx, ddy = fy2 - cy;
        if (ddx * ddx + ddy * ddy < rad * rad) {
          ctx.fillRect(fx2, fy2, 1, 1);
        }
      }
    }

    ctx.globalAlpha = savedAlpha;
  }
