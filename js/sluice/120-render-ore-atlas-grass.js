  function drawEarlyOreBase(tx, ty, r, c, type) {
    var salt = oreDepositSalt(type);
    var hotX = tx + 10 + tileHash01(r, c, salt + 21) * 12;
    var hotY = ty + 8 + tileHash01(r, c, salt + 22) * 12;
    var g;

    if (type === 'coal') {
      // Per-tile pixel-art shard cluster. 3 or 4 parallel tilted lozenge
      // shards stacked vertically inside the tile. Tilt direction varies
      // per tile (some lean left-up/right-down, others the opposite) and
      // tilt magnitude ranges ~9°-25°. One shard may instead render as an
      // irregular clump rather than a clean streak. Dirt or stone underlay
      // shows BETWEEN shards and at the tile margins, so the cluster fills
      // only ~50-60% of the tile and reads as anthracite bands set INTO
      // the host rather than a painted-on solid block.
      //
      // Geometry is keyed entirely off (r, c) — no neighbor queries — so
      // mining a coal tile cannot mutate any survivor's appearance
      // (MINERALS_BIBLE §3 Axis 8 / §7).
      //
      // Each shard is rasterized column-by-column along its long axis
      // with 1-px fillRects: lozenge taper + per-column thickness wobble
      // gives the irregular bumpy pixel-art outline. Tone is selected by
      // perpendicular row within the column — outline ring on the rim,
      // silver-grey highlight just inside the upper edge, near-black base
      // interior, soft shadow just inside the lower edge.
      var coalPal = materialPalette('coal', 'default');
      var SILVER = '#6c7280';      // upper-edge anthracite shine
      var SOFT_SHADOW = '#0e0f14'; // inner lower edge

      var tiltSign = tileHash01(r, c, 0xC000) < 0.5 ? 1 : -1;
      var sharedTilt = tiltSign * (0.16 + tileHash01(r, c, 0xC001) * 0.28); // ±9°-25°
      var cosT = Math.cos(sharedTilt);
      var sinT = Math.sin(sharedTilt);

      var shardCount = 3 + Math.floor(tileHash01(r, c, 0xC002) * 1.999); // 3..4
      var clusterCx = tx + TILE * 0.5 + (tileHash01(r, c, 0xC003) - 0.5) * 3;
      var clusterCy = ty + TILE * 0.5 + (tileHash01(r, c, 0xC004) - 0.5) * 3;

      var spacing = 5.2 + tileHash01(r, c, 0xC005) * 1.4; // 5.2..6.6 px between centerlines
      var totalSpan = (shardCount - 1) * spacing;
      var topCy = clusterCy - totalSpan * 0.5;

      // 0, 1, or 2 clumps — each fused into a host shard band (drawn
      // AFTER the streaks so they overpaint as thickened knots in the
      // host bands rather than reading as separate floating blobs).
      var clumpRoll = tileHash01(r, c, 0xC006);
      var clumpCount = clumpRoll < 0.30 ? 0 : (clumpRoll < 0.70 ? 1 : 2);
      var clumpHostIdxA = Math.floor(tileHash01(r, c, 0xC007) * shardCount);
      var clumpHostIdxB = clumpCount >= 2
        ? (clumpHostIdxA + 1 + Math.floor(tileHash01(r, c, 0xC008) * (shardCount - 1))) % shardCount
        : -1;
      if (clumpCount < 1) clumpHostIdxA = -1;
      // Forbid the {top-most, bottom-most} pair — two clumps both on the
      // outer bands looks like two stray blobs floating apart, not a band
      // detail. If we landed on it, move the second clump to a middle band.
      if (clumpCount >= 2) {
        var loIdx = Math.min(clumpHostIdxA, clumpHostIdxB);
        var hiIdx = Math.max(clumpHostIdxA, clumpHostIdxB);
        if (loIdx === 0 && hiIdx === shardCount - 1) {
          clumpHostIdxB = shardCount <= 3
            ? 1
            : (tileHash01(r, c, 0xC009) < 0.5 ? 1 : 2);
        }
      }
      var clumpHosts = []; // captured during the shard loop

      for (var sIdx = 0; sIdx < shardCount; sIdx++) {
        var seed = 0xC100 + sIdx * 23;

        // Middle shards stretch further along the bedding axis than the
        // top/bottom shards — gives the cluster a long-lens silhouette.
        // Length factor: 1.0 at top/bottom, ~1.45 at the cluster midline.
        var distFromMid = Math.abs(sIdx - (shardCount - 1) / 2);
        var maxDist = Math.max(1, (shardCount - 1) / 2);
        var lengthFactor = 1 + 0.65 * (1 - distFromMid / maxDist);

        var halfLen = (6.0 + tileHash01(r, c, seed + 1) * 2.2) * lengthFactor; // edges 6.0..8.2, middles ~9.9..13.5
        var halfThk = 1.6 + tileHash01(r, c, seed + 2) * 0.9;                  // 1.6..2.5

        var jitterX = (tileHash01(r, c, seed + 3) - 0.5) * 2.4;
        var cx = clusterCx + jitterX;
        var cy = topCy + sIdx * spacing + (tileHash01(r, c, seed + 4) - 0.5) * 0.8;

        if (sIdx === clumpHostIdxA) {
          clumpHosts.push({ cx: cx, cy: cy, halfLen: halfLen, halfThk: halfThk, seed: seed, slot: 0 });
        }
        if (sIdx === clumpHostIdxB) {
          clumpHosts.push({ cx: cx, cy: cy, halfLen: halfLen, halfThk: halfThk, seed: seed, slot: 1 });
        }

        var uMin = -Math.ceil(halfLen);
        var uMax = Math.ceil(halfLen);
        for (var u = uMin; u <= uMax; u++) {
          // Lozenge taper: thickness pinches to ~0 at the tips.
          var ut = u / halfLen;
          var taper = 1 - ut * ut * 0.88;
          if (taper < 0) taper = 0;
          // Per-column wobble for irregular pixel-art edge.
          var wobble = (tileHash01(r, c, seed + 200 + u * 7) - 0.5) * 0.7;
          var t = halfThk * taper + wobble;
          if (t < 0.45) continue;
          var thkPx = Math.max(1, Math.round(t * 2));

          var pxC = cx + u * cosT;
          var pyC = cy + u * sinT;
          var halfPx = (thkPx - 1) * 0.5;

          for (var v = 0; v < thkPx; v++) {
            var d = halfPx - v; // d > 0 toward upper edge
            var fx = Math.floor(pxC + d * sinT);
            var fy = Math.floor(pyC - d * cosT);

            var fill;
            if (v === 0) {
              // Upper rim — outline if column is at the tips, else silver shine.
              var isTip = (u === uMin || u === uMax || u === uMin + 1 || u === uMax - 1);
              fill = isTip ? coalPal.shadow : SILVER;
            } else if (v === thkPx - 1) {
              fill = coalPal.shadow; // lower outline
            } else if (v === 1 && thkPx >= 4) {
              fill = coalPal.highlight; // inner highlight band
            } else if (v === thkPx - 2 && thkPx >= 5) {
              fill = SOFT_SHADOW;
            } else {
              fill = coalPal.base;
            }
            ctx.fillStyle = fill;
            ctx.fillRect(fx, fy, 1, 1);
          }
        }

        // Occasional bright glint pixel along the shine line — pyrite-ish.
        if (tileHash01(r, c, seed + 9) < 0.40) {
          var glintU = Math.floor((tileHash01(r, c, seed + 10) - 0.5) * halfLen * 1.2);
          if (glintU > uMin + 1 && glintU < uMax - 1) {
            var gpxC = cx + glintU * cosT;
            var gpyC = cy + glintU * sinT;
            var gd = halfThk - 0.4;
            ctx.fillStyle = '#7a8090';
            ctx.fillRect(Math.floor(gpxC + gd * sinT), Math.floor(gpyC - gd * cosT), 1, 1);
          }
        }
      }

      // Clump bulges — each fused into a host shard's centerline so the
      // band visually swells into a knot at that point rather than reading
      // as a separate floating blob. Drawn AFTER the streaks so they
      // overpaint the host shard's tapered silhouette at the bulge.
      for (var ch = 0; ch < clumpHosts.length; ch++) {
        var clumpHost = clumpHosts[ch];
        var hSeed = clumpHost.seed + clumpHost.slot * 41;
        // Slide the clump anywhere along the host shard's long axis —
        // including near the left or right tip, not just the middle.
        var uOff = (tileHash01(r, c, hSeed + 12) - 0.5) * clumpHost.halfLen * 1.7;
        var clumpCx = clumpHost.cx + uOff * cosT;
        var clumpCy = clumpHost.cy + uOff * sinT;
        var clumpR = 2.6 + tileHash01(r, c, hSeed + 11) * 1.4; // 2.6..4.0
        var rMaxK = Math.ceil(clumpR + 1);
        // Upper-edge direction in tile space = (sinT, -cosT). Used both
        // for shine bias and as the perpendicular axis of the host band.
        for (var dy = -rMaxK; dy <= rMaxK; dy++) {
          for (var dx = -rMaxK; dx <= rMaxK; dx++) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            var noise = (tileHash01(r, c, hSeed + 300 + (dx + 8) * 17 + (dy + 8)) - 0.5) * 0.9;
            var rEff = clumpR + noise;
            if (dist > rEff) continue;
            var rimDepth = rEff - dist;
            // Project (dx,dy) onto the band's upper-edge direction —
            // positive = upper side of the host shard.
            var upScore = dx * sinT - dy * cosT;
            var fillC;
            if (rimDepth < 1.0) {
              fillC = upScore > clumpR * 0.15 ? SILVER : coalPal.shadow;
            } else if (rimDepth < 1.9 && upScore > 0) {
              fillC = coalPal.highlight;
            } else if (rimDepth < 1.6 && upScore < -clumpR * 0.3) {
              fillC = SOFT_SHADOW;
            } else {
              fillC = coalPal.base;
            }
            ctx.fillStyle = fillC;
            ctx.fillRect(Math.floor(clumpCx + dx), Math.floor(clumpCy + dy), 1, 1);
          }
        }
      }
      return true;
    }

    if (type === 'copper') {
      // Native copper: branching metallic ribbons embedded in the host,
      // with tiny green oxidation freckles. The vein paths are per-tile
      // but never full-tile, so it reads as metal inside rock rather than
      // a painted copper block.
      var copperPal = materialPalette('copper', 'default');
      var CU_HI = copperPal.highlight;
      var CU_BODY = '#bf6b34';
      var CU_MID = copperPal.base;
      var CU_DARK = copperPal.shadow;
      var CU_PATINA = copperPal.accent;
      var cuAngle = (tileHash01(r, c, 0xC0A1) - 0.5) * 1.55;
      var cuCos = Math.cos(cuAngle);
      var cuSin = Math.sin(cuAngle);
      var cuCx = tx + TILE * 0.5 + (tileHash01(r, c, 0xC0A2) - 0.5) * 3.2;
      var cuCy = ty + TILE * 0.5 + (tileHash01(r, c, 0xC0A3) - 0.5) * 3.0;
      var veinCount = 2 + Math.floor(tileHash01(r, c, 0xC0A4) * 1.999);

      for (var vi = 0; vi < veinCount; vi++) {
        var vSeed = 0xC100 + vi * 47;
        var centerOff = (vi - (veinCount - 1) * 0.5) * (4.2 + tileHash01(r, c, vSeed + 1) * 1.8);
        var halfLen = 9.5 + tileHash01(r, c, vSeed + 2) * 4.5;
        var branchSign = tileHash01(r, c, vSeed + 3) < 0.5 ? -1 : 1;
        var branchStart = -halfLen * 0.15 + (tileHash01(r, c, vSeed + 4) - 0.5) * halfLen * 0.6;
        var branchLen = halfLen * (0.34 + tileHash01(r, c, vSeed + 5) * 0.20);

        for (var u = -Math.ceil(halfLen); u <= Math.ceil(halfLen); u++) {
          var taper = 1 - Math.abs(u) / (halfLen + 0.01);
          if (taper <= 0) continue;
          var wiggle = Math.sin(u * 0.62 + tileHash01(r, c, vSeed + 6) * 6.28) * 1.15;
          var thk = 1.2 + taper * 2.0 + (tileHash01(r, c, vSeed + 100 + u * 5) - 0.5) * 0.75;
          var thkPx = Math.max(1, Math.round(thk));
          var pxC = cuCx + u * cuCos + (centerOff + wiggle) * -cuSin;
          var pyC = cuCy + u * cuSin + (centerOff + wiggle) * cuCos;

          for (var w = -thkPx; w <= thkPx; w++) {
            if (Math.abs(w) > thk) continue;
            var fx = Math.floor(pxC + w * -cuSin);
            var fy = Math.floor(pyC + w * cuCos);
            var rim = Math.abs(w) / Math.max(1, thk);
            var fillCu;
            if (rim > 0.78) fillCu = CU_DARK;
            else if (w < -0.4 && taper > 0.28) fillCu = CU_HI;
            else if (taper > 0.56) fillCu = CU_BODY;
            else fillCu = CU_MID;
            ctx.fillStyle = fillCu;
            ctx.fillRect(fx, fy, 1, 1);
          }

          if (u > branchStart && u < branchStart + branchLen) {
            var bu = (u - branchStart) / branchLen;
            var branchU = u + bu * branchLen * 0.22;
            var branchOff = centerOff + wiggle + branchSign * bu * 7.5;
            var bThk = Math.max(1, Math.round(2.1 * (1 - bu)));
            var bx = cuCx + branchU * cuCos + branchOff * -cuSin;
            var by = cuCy + branchU * cuSin + branchOff * cuCos;
            for (var bw = -bThk; bw <= bThk; bw++) {
              ctx.fillStyle = bw < 0 ? CU_HI : (Math.abs(bw) === bThk ? CU_DARK : CU_BODY);
              ctx.fillRect(Math.floor(bx + bw * -cuSin), Math.floor(by + bw * cuCos), 1, 1);
            }
          }
        }
      }

      var nugCount = 2 + Math.floor(tileHash01(r, c, 0xC300) * 2.999);
      for (var ni = 0; ni < nugCount; ni++) {
        var nSeed = 0xC330 + ni * 31;
        var nx = tx + 8 + tileHash01(r, c, nSeed) * 16;
        var ny = ty + 7 + tileHash01(r, c, nSeed + 1) * 17;
        var nr = 1.6 + tileHash01(r, c, nSeed + 2) * 1.5;
        var nMax = Math.ceil(nr + 1);
        for (var ndy = -nMax; ndy <= nMax; ndy++) {
          for (var ndx = -nMax; ndx <= nMax; ndx++) {
            var nd = Math.sqrt(ndx * ndx + ndy * ndy);
            if (nd > nr + (tileHash01(r, c, nSeed + 40 + (ndx + 5) * 9 + (ndy + 5)) - 0.5) * 0.45) continue;
            ctx.fillStyle = nd > nr - 0.8 ? CU_DARK : (ndx + ndy < -1 ? CU_HI : CU_BODY);
            ctx.fillRect(Math.floor(nx + ndx), Math.floor(ny + ndy), 1, 1);
          }
        }
      }

      for (var pi = 0; pi < 3; pi++) {
        if (tileHash01(r, c, 0xC400 + pi) > 0.72) continue;
        ctx.fillStyle = pi === 0 ? '#8cc28c' : CU_PATINA;
        ctx.fillRect(
          Math.floor(tx + 6 + tileHash01(r, c, 0xC410 + pi * 3) * 20),
          Math.floor(ty + 6 + tileHash01(r, c, 0xC411 + pi * 3) * 20),
          1 + Math.floor(tileHash01(r, c, 0xC412 + pi * 3) * 1.999),
          1);
      }
      return true;
    }

    if (type === 'bauxite') {
      // Per-tile pisolitic bauxite: rusty clay pocket plus rounded
      // pea-stone grains. The stone underlay shows around the cluster,
      // keeping it embedded instead of painted across the whole tile.
      // Geometry is keyed only to (r, c), so mined neighbours cannot
      // reshape surviving ore tiles.
      var bauxitePal = materialPalette('bauxite', 'default');
      var RUST_LIGHT = bauxitePal.highlight;
      var RUST_BODY  = '#b84f27';
      var RUST_MID   = bauxitePal.base;
      var RUST_DIM   = '#6f2b18';
      var RUST_DARK  = bauxitePal.shadow;
      var CREAM      = bauxitePal.accent;
      var DUST       = '#c48a55';

      var bcx = tx + TILE * 0.5 + (tileHash01(r, c, 0xB0A1) - 0.5) * 2.4;
      var bcy = ty + TILE * 0.5 + (tileHash01(r, c, 0xB0A2) - 0.5) * 2.2;
      var angle = (tileHash01(r, c, 0xB0A3) - 0.5) * 1.0;
      var cosA = Math.cos(angle);
      var sinA = Math.sin(angle);
      var pocketRx = 10.4 + tileHash01(r, c, 0xB0A4) * 2.4;
      var pocketRy = 7.4 + tileHash01(r, c, 0xB0A5) * 2.0;
      var pocketPhaseA = tileHash01(r, c, 0xB0A6) * Math.PI * 2;
      var pocketPhaseB = tileHash01(r, c, 0xB0A7) * Math.PI * 2;
      var pocketPhaseC = tileHash01(r, c, 0xB0A8) * Math.PI * 2;

      for (var dy = -15; dy <= 15; dy++) {
        for (var dx = -15; dx <= 15; dx++) {
          var u = dx * cosA + dy * sinA;
          var v = -dx * sinA + dy * cosA;
          var theta = Math.atan2(v / pocketRy, u / pocketRx);
          var contour = 1 +
            Math.sin(theta * 3 + pocketPhaseA) * 0.13 +
            Math.sin(theta * 5 + pocketPhaseB) * 0.08 +
            Math.sin(theta * 7 + pocketPhaseC) * 0.045;
          if (contour < 0.76) contour = 0.76;
          var q = ((u * u) / (pocketRx * pocketRx) + (v * v) / (pocketRy * pocketRy)) / (contour * contour);
          var edgeNoise = (tileHash01(r, c, 0xB100 + (dx + 16) * 23 + (dy + 16) * 7) - 0.5) * 0.22;
          var qEff = q + edgeNoise;
          var fill = null;

          if (qEff <= 0.92) {
            if (qEff > 0.78) fill = RUST_DARK;
            else if (qEff > 0.58) fill = RUST_DIM;
            else if ((-u - v) > 4.8 && qEff < 0.42) fill = RUST_LIGHT;
            else if (qEff < 0.30) fill = RUST_BODY;
            else fill = RUST_MID;
          } else if (qEff <= 1.20) {
            var rimRoll = tileHash01(r, c, 0xB200 + (dx + 16) * 19 + (dy + 16) * 11);
            if (rimRoll < 0.26) fill = rimRoll < 0.06 ? RUST_DARK : RUST_DIM;
          }

          if (fill) {
            ctx.fillStyle = fill;
            ctx.fillRect(Math.floor(bcx + dx), Math.floor(bcy + dy), 1, 1);
          }
        }
      }

      var grainCount = 8 + Math.floor(tileHash01(r, c, 0xB300) * 3.999);
      for (var gi = 0; gi < grainCount; gi++) {
        var gSeed = 0xB340 + gi * 37;
        var ga = tileHash01(r, c, gSeed) * Math.PI * 2;
        var gr = Math.sqrt(tileHash01(r, c, gSeed + 1)) * 0.82;
        var gu = Math.cos(ga) * pocketRx * gr;
        var gv = Math.sin(ga) * pocketRy * gr;
        var gx = bcx + gu * cosA - gv * sinA;
        var gy = bcy + gu * sinA + gv * cosA;
        var grainRx = 2.1 + tileHash01(r, c, gSeed + 2) * 1.9;
        var grainRy = 1.8 + tileHash01(r, c, gSeed + 3) * 1.6;
        var grainAng = angle + (tileHash01(r, c, gSeed + 4) - 0.5) * 0.65;
        var gCos = Math.cos(grainAng);
        var gSin = Math.sin(grainAng);
        var maxR = Math.ceil(Math.max(grainRx, grainRy) + 1.5);

        for (var gyOff = -maxR; gyOff <= maxR; gyOff++) {
          for (var gxOff = -maxR; gxOff <= maxR; gxOff++) {
            var tu = gxOff * gCos + gyOff * gSin;
            var tv = -gxOff * gSin + gyOff * gCos;
            var d2 = (tu * tu) / (grainRx * grainRx) + (tv * tv) / (grainRy * grainRy);
            var gn = (tileHash01(r, c, gSeed + 100 + (gxOff + 8) * 13 + (gyOff + 8) * 3) - 0.5) * 0.20;
            var dEff = d2 + gn;
            if (dEff > 1.0) continue;

            var lit = (-gxOff - gyOff) / Math.max(1, maxR);
            var grainFill;
            if (dEff > 0.78) {
              grainFill = lit > 0.15 ? DUST : RUST_DARK;
            } else if (lit > 0.48 && dEff < 0.62) {
              grainFill = CREAM;
            } else if (lit > 0.18 && dEff < 0.72) {
              grainFill = RUST_LIGHT;
            } else if (dEff < 0.34) {
              grainFill = RUST_BODY;
            } else {
              grainFill = RUST_MID;
            }

            ctx.fillStyle = grainFill;
            ctx.fillRect(Math.floor(gx + gxOff), Math.floor(gy + gyOff), 1, 1);
          }
        }
      }

      var chipCount = 2 + Math.floor(tileHash01(r, c, 0xB500) * 2.999);
      for (var ci = 0; ci < chipCount; ci++) {
        var chipSeed = 0xB520 + ci * 17;
        var chipA = tileHash01(r, c, chipSeed) * Math.PI * 2;
        var chipR = Math.sqrt(tileHash01(r, c, chipSeed + 1)) * 0.72;
        var chipU = Math.cos(chipA) * pocketRx * chipR;
        var chipV = Math.sin(chipA) * pocketRy * chipR;
        var chipX = Math.floor(bcx + chipU * cosA - chipV * sinA);
        var chipY = Math.floor(bcy + chipU * sinA + chipV * cosA);
        ctx.fillStyle = ci === 0 ? '#f0c98a' : CREAM;
        ctx.fillRect(chipX, chipY, 2, 1);
        if (tileHash01(r, c, chipSeed + 2) > 0.45) ctx.fillRect(chipX, chipY + 1, 1, 1);
      }
      return true;
    }

    if (type === 'iron') {
      // Iron ore: dark hematite/magnetite bands with rusty seams and
      // small silver glints. The cluster is broken into stacked plates
      // instead of a smooth metallic oval.
      var ironPal = materialPalette('iron', 'default');
      var FE_HI = ironPal.highlight;
      var FE_BODY = ironPal.base;
      var FE_MID = '#3f4448';
      var FE_DARK = ironPal.shadow;
      var FE_RUST = ironPal.accent;
      var feAngle = (tileHash01(r, c, 0xF0A1) - 0.5) * 0.85;
      var feCos = Math.cos(feAngle);
      var feSin = Math.sin(feAngle);
      var feCx = tx + TILE * 0.5 + (tileHash01(r, c, 0xF0A2) - 0.5) * 2.8;
      var feCy = ty + TILE * 0.5 + (tileHash01(r, c, 0xF0A3) - 0.5) * 2.4;
      var plateCount = 3 + Math.floor(tileHash01(r, c, 0xF0A4) * 1.999);
      var plateGap = 4.6 + tileHash01(r, c, 0xF0A5) * 1.2;

      for (var fi = 0; fi < plateCount; fi++) {
        var fSeed = 0xF100 + fi * 43;
        var fOff = (fi - (plateCount - 1) * 0.5) * plateGap;
        var fHalfLen = 6.8 + tileHash01(r, c, fSeed + 1) * 5.8;
        var fHalfThk = 1.8 + tileHash01(r, c, fSeed + 2) * 1.4;
        var fShift = (tileHash01(r, c, fSeed + 3) - 0.5) * 3.2;

        for (var fu = -Math.ceil(fHalfLen); fu <= Math.ceil(fHalfLen); fu++) {
          var ft = 1 - Math.abs(fu) / (fHalfLen + 0.01);
          if (ft <= 0) continue;
          var fEdge = fHalfThk * (0.55 + ft * 0.62) + (tileHash01(r, c, fSeed + 90 + fu * 5) - 0.5) * 0.55;
          var fThk = Math.max(1, Math.round(fEdge * 2));
          var fpx = feCx + (fu + fShift) * feCos + fOff * -feSin;
          var fpy = feCy + (fu + fShift) * feSin + fOff * feCos;

          for (var fv = 0; fv < fThk; fv++) {
            var fd = (fThk - 1) * 0.5 - fv;
            var ix = Math.floor(fpx + fd * -feSin);
            var iy = Math.floor(fpy + fd * feCos);
            var fFill;
            if (fv === 0) fFill = ft > 0.18 ? FE_HI : FE_DARK;
            else if (fv === fThk - 1) fFill = FE_DARK;
            else if (fv === 1 && fThk >= 4) fFill = '#777c7f';
            else if (fv > fThk - 3 && fThk >= 5) fFill = FE_MID;
            else fFill = FE_BODY;
            ctx.fillStyle = fFill;
            ctx.fillRect(ix, iy, 1, 1);
          }
        }

        if (tileHash01(r, c, fSeed + 7) < 0.72) {
          var rustU = (tileHash01(r, c, fSeed + 8) - 0.5) * fHalfLen * 1.4;
          var rustX = feCx + (rustU + fShift) * feCos + fOff * -feSin;
          var rustY = feCy + (rustU + fShift) * feSin + fOff * feCos;
          ctx.fillStyle = FE_RUST;
          ctx.fillRect(Math.floor(rustX), Math.floor(rustY), 2, 1);
          ctx.fillStyle = '#6d2d1b';
          ctx.fillRect(Math.floor(rustX + feCos * 2), Math.floor(rustY + feSin * 2), 1, 1);
        }
      }

      var stainCount = 4 + Math.floor(tileHash01(r, c, 0xF300) * 2.999);
      for (var si = 0; si < stainCount; si++) {
        var sSeed = 0xF330 + si * 17;
        if (tileHash01(r, c, sSeed) < 0.22) continue;
        ctx.fillStyle = si % 2 === 0 ? 'rgba(151,72,38,0.70)' : 'rgba(88,42,28,0.70)';
        ctx.fillRect(
          Math.floor(tx + 5 + tileHash01(r, c, sSeed + 1) * 22),
          Math.floor(ty + 5 + tileHash01(r, c, sSeed + 2) * 22),
          1 + Math.floor(tileHash01(r, c, sSeed + 3) * 1.999),
          1);
      }
      return true;
    }

    if (type === 'pyrite') {
      // Pyrite renders here (not the flourish path) so it skips the
      // flat ORES.color placeholder fill — the dirt/stone host shows
      // through between the brass cubes, the way coal/iron read.
      drawPyriteOre(tx, ty, r, c);
      return true;
    }

    if (type === 'silver') {
      // Silver too — host shows through between the curly wires.
      drawSilverOre(tx, ty, r, c);
      return true;
    }

    if (type === 'gold') {
      // Gold too — nuggets + dendritic wires on the host.
      drawGoldOre(tx, ty, r, c);
      return true;
    }

    if (type === 'methaneice') {
      // Methane ice — a translucent nodule; host shows around it.
      drawMethaneiceOre(tx, ty, r, c);
      return true;
    }

    if (type === 'amber') {
      // Amber — a translucent resin nodule; host shows around it.
      drawAmberOre(tx, ty, r, c);
      return true;
    }

    if (type === 'cinnabar') {
      // Cinnabar — a scarlet crystal druse; host shows through.
      drawCinnabarOre(tx, ty, r, c);
      return true;
    }

    if (type === 'uranium') {
      // Uranium — acid-green starburst with a luminous glow rim and
      // decay specks; host shows through around the crystals.
      drawUraniumOre(tx, ty, r, c);
      return true;
    }

    if (type === 'fossil') {
      // Fossil — skull + big bones in three iconic arrangements
      // (museum shelf, profile skull with crossed bones, jolly roger).
      // Host dirt shows through around the bones.
      drawFossilOre(tx, ty, r, c);
      return true;
    }

    if (type === 'obsidian') {
      // Obsidian — massive black volcanic-glass mass with conchoidal
      // arcs and a hard specular highlight; host shows through around
      // the blob silhouette.
      drawObsidianOre(tx, ty, r, c);
      return true;
    }

    if (type === 'emerald') {
      // Emerald — tall jewel-green hexagonal-prism cluster (1 hero +
      // 1–2 satellites); host shows through between crystals.
      drawEmeraldOre(tx, ty, r, c);
      return true;
    }

    if (type === 'tanzanite') {
      // Tanzanite — violet-blue orthorhombic-prism cut gem that hue-
      // shifts (pleochroism) along each crystal's length (1 hero + 1–2
      // leaning satellites); host shows through between crystals.
      drawTanzaniteOre(tx, ty, r, c);
      return true;
    }

    if (type === 'ruby') {
      // Ruby — squat barrel-shaped crimson corundum cluster (1 hero +
      // 1–2 satellites + base druse); host shows through between
      // crystals. Differs from emerald by aspect (squat) and from
      // cinnabar by lustre (faceted glassy, not matte).
      drawRubyOre(tx, ty, r, c);
      return true;
    }

    // ---- v24.15 batch-2 ores (renderers in 111-114; helpers in 108) ----
    // Every one draws ONLY its mineral cluster on the dirt/stone host, the
    // same host-through contract as the gems above.
    if (type === 'malachite')     { drawMalachiteOre(tx, ty, r, c); return true; }
    if (type === 'galena')        { drawGalenaOre(tx, ty, r, c); return true; }
    if (type === 'magnetite')     { drawMagnetiteOre(tx, ty, r, c); return true; }
    if (type === 'rhodochrosite') { drawRhodochrositeOre(tx, ty, r, c); return true; }
    if (type === 'jade')          { drawJadeOre(tx, ty, r, c); return true; }
    if (type === 'turquoise')     { drawTurquoiseOre(tx, ty, r, c); return true; }
    if (type === 'lapis')         { drawLapisOre(tx, ty, r, c); return true; }
    if (type === 'cobalt')        { drawCobaltOre(tx, ty, r, c); return true; }
    if (type === 'amethyst')      { drawAmethystOre(tx, ty, r, c); return true; }
    if (type === 'peridot')       { drawPeridotOre(tx, ty, r, c); return true; }
    if (type === 'sulfur')        { drawSulfurOre(tx, ty, r, c); return true; }
    if (type === 'platinum')      { drawPlatinumOre(tx, ty, r, c); return true; }
    // Diamond/painite/unobtanium — upgraded from the legacy drawGemScatter
    // placeholder (was dispatched in 140; now host-through here).
    if (type === 'diamond')       { drawDiamondOre(tx, ty, r, c); return true; }
    if (type === 'painite')       { drawPainiteOre(tx, ty, r, c); return true; }
    if (type === 'unobtanium')    { drawUnobtaniumOre(tx, ty, r, c); return true; }
    // Opal — milky nodule with animated play-of-colour (renders live, never
    // atlas-baked, so the flecks can cycle each frame).
    if (type === 'opal')          { drawOpalOre(tx, ty, r, c); return true; }
    // The Great Seam: legendary molten-gold vein (renderer in 295; pulsing
    // glow animates, so live-only, never atlas-baked).
    if (type === 'greatseam')     { drawGreatSeam(tx, ty, r, c); return true; }

    return false;
  }

  function isEarlyOreAtlasType(type) {
    for (var i = 0; i < EARLY_ORE_ATLAS_TYPES.length; i++) {
      if (EARLY_ORE_ATLAS_TYPES[i] === type) return true;
    }
    return false;
  }

  function earlyOreAtlasKey(type, variant) {
    return type + '|' + variant;
  }

  function buildEarlyOreAtlas() {
    if (earlyOreAtlasCache) return earlyOreAtlasCache;
    var cache = {};
    var savedCtx = ctx;
    try {
      for (var ti = 0; ti < EARLY_ORE_ATLAS_TYPES.length; ti++) {
        var type = EARLY_ORE_ATLAS_TYPES[ti];
        var salt = oreDepositSalt(type);
        for (var v = 0; v < EARLY_ORE_ATLAS_VARIANTS; v++) {
          var canv = document.createElement('canvas');
          canv.width = TILE * EARLY_ORE_ATLAS_SCALE;
          canv.height = TILE * EARLY_ORE_ATLAS_SCALE;
          var g = canv.getContext('2d');
          g.setTransform(EARLY_ORE_ATLAS_SCALE, 0, 0, EARLY_ORE_ATLAS_SCALE, 0, 0);
          g.imageSmoothingEnabled = false;
          ctx = g;

          // Synthetic coordinates preserve the current ore renderer's
          // procedural vocabulary while letting nearby world tiles reuse
          // finished pixels instead of rerasterizing every frame.
          var fakeR = 3000 + ti * 997 + v * 37 + (salt & 127);
          var fakeC = 3000 + ti * 619 + v * 53 + ((salt >>> 7) & 127);
          ctx.save();
          oreDepositPath(0, 0, fakeR, fakeC, type);
          ctx.clip();
          drawEarlyOreBase(0, 0, fakeR, fakeC, type);
          ctx.restore();

          cache[earlyOreAtlasKey(type, v)] = canv;
        }
      }
    } finally {
      ctx = savedCtx;
    }
    earlyOreAtlasCache = cache;
    return cache;
  }

  function pickEarlyOreAtlasVariant(r, c, type) {
    var salt = oreDepositSalt(type) ^ 0xEA7A5;
    return Math.floor(tileHash01(r, c, salt) * EARLY_ORE_ATLAS_VARIANTS) % EARLY_ORE_ATLAS_VARIANTS;
  }

  // A rare "shiny" ore tile (worldgen flag tile.shiny). Inverts the whole
  // tile's colours via difference-with-white (bold and unmistakable) and
  // twinkles a few star sparkles around the perimeter. Called LIVE from the
  // tile loop in 140 right after the ore is drawn, so it inverts the ore plus
  // the cached underlay beneath it. The sparkles animate (tNow), so this can
  // never be baked into the terrain chunk cache. Rarity = SHINY_ORE_CHANCE.
  function drawShinyTile(tx, ty, r, c, tNow) {
    ctx.save();
    // 1) Colour inversion over the tile rect.
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.globalCompositeOperation = 'source-over';
    // 2) Bright framing rim so it reads "precious", not "glitched".
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    // 3) Twinkling star sparkles around the edge.
    for (var si = 0; si < 5; si++) {
      var phase = tileHash01(r, c, 1300 + si) * 6.2832;
      var pulse = 0.5 + 0.5 * Math.sin(tNow * 3.1 + phase);
      if (pulse < 0.18) continue;
      var per = ((si / 5) * 4 + tileHash01(r, c, 1700 + si) * 0.6) % 4;
      var px, py;
      if (per < 1)      { px = tx + per * TILE;              py = ty; }
      else if (per < 2) { px = tx + TILE;                    py = ty + (per - 1) * TILE; }
      else if (per < 3) { px = tx + TILE - (per - 2) * TILE; py = ty + TILE; }
      else              { px = tx;                           py = ty + TILE - (per - 3) * TILE; }
      var arm = 1.2 + 2.2 * pulse;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * pulse).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
      ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEarlyOreAtlas(tx, ty, r, c, type) {
    if (!USE_EARLY_ORE_ATLAS || !isEarlyOreAtlasType(type)) return false;
    var atlas = earlyOreAtlasCache || buildEarlyOreAtlas();
    var variant = pickEarlyOreAtlasVariant(r, c, type);
    var canv = atlas[earlyOreAtlasKey(type, variant)];
    if (!canv) return false;
    var wasSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canv, tx, ty, TILE, TILE);
    ctx.imageSmoothingEnabled = wasSmooth;
    return true;
  }

  function drawEarlyOreDetails(tx, ty, r, c, type, tNow) {
    // Baseline ores now rasterize their full mineral identity in
    // drawEarlyOreBase. Other ores keep their bespoke flourishes inline
    // in the main tile render pass.
    if (type === 'coal' || type === 'copper' || type === 'bauxite' || type === 'iron') {
      return;
    }
  }


  // Surface-tile topsoil/grass overlay. Repaints the top ~20 px as a
  // stratified surface block: grass → grass shadow → dark topsoil
  // (roots) → mid topsoil (root tips) → translucent fade into the
  // existing dirt. The band boundaries are NOT straight horizontal
  // lines — filled curves are computed from continuous world-X sinusoid
  // noise so the boundaries undulate smoothly across tile edges without
  // the comb-like vertical striping that 1-px column fills produce.
  //
  // Detail features (blades, roots, fibers, pebbles, flowers) are
  // placed with NO tile-edge margin — adjacent tiles' details can sit
  // right against the boundary, also killing the every-32-px stripe of
  // "less detail" that the previous version had.
  function drawSurfaceGrass(tx, ty, r, c) {
    if (r !== SKY_ROWS) return;

    // ----- Wavy stratified bands (filled curves, world-X noise) -----
    var samples = [];
    var sampleStep = 2;
    for (var sx = tx - sampleStep; sx <= tx + TILE + sampleStep; sx += sampleStep) {
      // Two-frequency sinusoid noise: continuous across tile edges,
      // smooth and non-repeating across the visible surface.
      var n1 = Math.sin(sx * 0.51) + Math.cos(sx * 0.31 + 1.3);          // -2 to 2
      var n2 = Math.sin(sx * 0.27 + 2.1) + Math.cos(sx * 0.43 + 3.7);
      var n3 = Math.sin(sx * 0.19 + 4.3) + Math.cos(sx * 0.35 + 5.9);

      var grassEnd  = Math.max(1, 2 + n1 * 0.55);
      var shadowEnd = grassEnd + 1.45 + Math.max(-0.45, Math.min(0.45, n2 * 0.24));
      var darkEnd   = Math.max(shadowEnd + 3, 8 + n2 * 1.20);
      var midEnd    = Math.max(darkEnd + 3, 14 + n3 * 1.35);
      var fadeMid   = Math.min(20.5, midEnd + 2);
      var fadeEnd   = Math.min(22, Math.max(fadeMid + 0.5, midEnd + 4 + n1 * 0.55));
      samples.push({ x: sx, grass: grassEnd, shadow: shadowEnd, dark: darkEnd, mid: midEnd, fadeMid: fadeMid, fade: fadeEnd });
    }

    function surfaceSampleY(s, key) {
      return ty + (key ? s[key] : 0);
    }

    function fillSurfaceBand(style, topKey, bottomKey) {
      var topPoints = [];
      var bottomPoints = [];
      for (var si = 0; si < samples.length; si++) {
        topPoints.push({ x: samples[si].x, y: surfaceSampleY(samples[si], topKey) });
        bottomPoints.push({ x: samples[si].x, y: surfaceSampleY(samples[si], bottomKey) });
      }
      ctx.fillStyle = style;
      ctx.beginPath();
      curveThrough(topPoints, false);
      for (var bi = bottomPoints.length - 1; bi >= 0; bi--) {
        if (bi === bottomPoints.length - 1) {
          ctx.lineTo(bottomPoints[bi].x, bottomPoints[bi].y);
        } else {
          var prev = bottomPoints[bi + 1];
          var cur = bottomPoints[bi];
          var midX = (prev.x + cur.x) * 0.5;
          var midY = (prev.y + cur.y) * 0.5;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, TILE, TILE);
    ctx.clip();
    fillSurfaceBand('#5e7d3a', null, 'grass');
    fillSurfaceBand('#3f5826', 'grass', 'shadow');
    fillSurfaceBand('#2c1d10', 'shadow', 'dark');
    fillSurfaceBand('#3f2818', 'dark', 'mid');
    fillSurfaceBand('rgba(60,40,22,0.55)', 'mid', 'fadeMid');
    fillSurfaceBand('rgba(60,40,22,0.30)', 'fadeMid', 'fade');
    ctx.restore();

    // ----- Bright blade specks (8 per tile, anywhere across the full tile) -----
    ctx.fillStyle = '#9bb963';
    for (var gb = 0; gb < 8; gb++) {
      var gbx = tx + Math.floor(tileHash01(r, c, 0xA10 + gb) * TILE);
      ctx.fillRect(gbx, ty, 1, 1);
    }

    // ----- Tall 2-px blades (5 attempts, ~60% spawn rate) -----
    for (var tb = 0; tb < 5; tb++) {
      if (tileHash01(r, c, 0xA30 + tb) > 0.40) {
        var tbx = tx + Math.floor(tileHash01(r, c, 0xA20 + tb) * TILE);
        ctx.fillStyle = '#9bb963';
        ctx.fillRect(tbx, ty, 1, 1);
        ctx.fillStyle = '#5e7d3a';
        ctx.fillRect(tbx, ty + 1, 1, 1);
      }
    }

    // ----- Yellow flower (~10%) -----
    if (tileHash01(r, c, 0xA40) > 0.90) {
      var fwx = tx + Math.floor(tileHash01(r, c, 0xA41) * (TILE - 1));
      ctx.fillStyle = '#e9b54a';
      ctx.fillRect(fwx, ty + 1, 1, 1);
      if (fwx + 1 < tx + TILE) {
        ctx.fillStyle = '#c98e2a';
        ctx.fillRect(fwx + 1, ty + 1, 1, 1);
      }
    }

    // ----- Fibrous specks (8 attempts, ~55% spawn rate) -----
    ctx.fillStyle = '#160a04';
    for (var ft = 0; ft < 8; ft++) {
      if (tileHash01(r, c, 0xAD0 + ft) > 0.45) {
        var ftx = tx + Math.floor(tileHash01(r, c, 0xAE0 + ft) * TILE);
        var fty = ty + 9 + Math.floor(tileHash01(r, c, 0xAF0 + ft) * 6);
        ctx.fillRect(ftx, fty, 1, 1);
      }
    }

    // ----- Pebble at the topsoil-to-dirt transition (~25%) -----
    if (tileHash01(r, c, 0xA50) > 0.75) {
      var pbx = tx + Math.floor(tileHash01(r, c, 0xA51) * TILE);
      var pby = ty + 13 + Math.floor(tileHash01(r, c, 0xA52) * 3);
      ctx.fillStyle = '#6d5138';
      ctx.fillRect(pbx, pby, 1, 1);
      if (pbx + 1 < tx + TILE) {
        ctx.fillStyle = '#2b1c12';
        ctx.fillRect(pbx + 1, pby, 1, 1);
      }
    }
  }

  function terrainChunkKey(chunkR, chunkC) {
    return chunkR + ':' + chunkC;
  }

  function invalidateTerrainChunk(chunkR, chunkC) {
    var key = terrainChunkKey(chunkR, chunkC);
    if (terrainChunkCache[key]) terrainChunkCache[key].dirty = true;
  }

  function invalidateTerrainAround(r, c) {
    var minChunkR = Math.floor((r - 2) / TERRAIN_CHUNK_TILES);
    var maxChunkR = Math.floor((r + 2) / TERRAIN_CHUNK_TILES);
    var minChunkC = Math.floor((c - 2) / TERRAIN_CHUNK_TILES);
    var maxChunkC = Math.floor((c + 2) / TERRAIN_CHUNK_TILES);
    for (var cr = minChunkR; cr <= maxChunkR; cr++) {
      for (var cc = minChunkC; cc <= maxChunkC; cc++) {
        invalidateTerrainChunk(cr, cc);
      }
    }
  }

  function terrainClearKey(r, c) {
    return r + ':' + c;
  }

  function clearedKindForTile(r, c, tile) {
    if (!tile) return null;
    if (tile.type === 'stone') return 'stone';
    if (tile.type === 'dirt') return 'dirt';
    if (ORES[tile.type] &&
        tile.type !== 'foundation' &&
        tile.type !== 'barrier' &&
        tile.type !== 'jello' &&
        tile.type !== 'bedrock') {
      return oreUnderlayKind(openBlockNeighbors(r, c, tile.type)) || 'dirt';
    }
    return null;
  }

  function clearedTerrainKindAt(r, c) {
    return terrainClearedKinds[terrainClearKey(r, c)] || null;
  }

  function markTerrainCleared(r, c, tile) {
    var clearedKind = clearedKindForTile(r, c, tile);
    if (clearedKind) terrainClearedKinds[terrainClearKey(r, c)] = clearedKind;
    invalidateTerrainAround(r, c);
    terrainClearOverlays.push({ r: r, c: c, t: 0.22 });
    if (terrainClearOverlays.length > 36) terrainClearOverlays.splice(0, terrainClearOverlays.length - 36);
    try { spawnMineBreak(r, c, tile); } catch (e) {}   // block-break FX — never let it break mining
    // Mining beside a jello cluster wakes it into a live soft body.
    if (ENABLE_JELLO) jelloCheckActivation(r, c);   // jello disabled: a save-loaded jello tile stays inert

    // Mining under/beside resting water wakes it so it drains into the hole.
    liquidWakeForDig(r, c);
    // Newly-opened air: reveal it + flood any cave it just connected to the surface.
    lightingOnClear(r, c);
    // Digging the ground out from under a surface tree tips it over (165).
    treesOnClear(r, c);
  }

