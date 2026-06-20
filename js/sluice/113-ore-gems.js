  // ----- Gem ores: amethyst, peridot, sulfur, platinum -----
  // All four follow the same tile contract as the rest of 110:
  //   • 32×32 tile, (tx,ty) top-left, centre (tx+16, ty+16)
  //   • light from upper-LEFT
  //   • per-pixel ctx.fillRect(x,y,1,1) only — no gradients, arcs, AA
  //   • deterministic randomness via tileHash01(r,c,seed)
  //   • draw ONLY the mineral — host shows through, no tile fill
  //   • cluster occupies centre ~55-65%, clear host margin all round
  //   • static (no animation), keyed only to (r, c)

  // ----- Amethyst -----
  // Purple quartz geode: a druse of upward-pointing crystal prisms, bases
  // along the lower-centre, tips fanning up. Many smaller points read as
  // a true geode — distinct from tanzanite (single cut) and ruby (hexagonal
  // prism). Uses drawGemFacet for each point (tall halfH > halfW).
  function drawAmethystOre(tx, ty, r, c) {
    var ramp = {
      out:    '#1e0c40',
      seam:   '#4a2a86',
      shadow: '#3a1b6e',
      base:   '#6a3bb5',
      light:  '#9b6fe0',
      shine:  '#e8d8ff'
    };

    // Cluster base — centred slightly below tile midpoint so tips have
    // room to fan upward.
    var bx = tx + 16 + Math.round((tileHash01(r, c, 0x4A00) - 0.5) * 3);
    var by = ty + 20 + Math.round((tileHash01(r, c, 0x4A01) - 0.5) * 2);

    // Number of crystal points: 4-6. The first (index 0) is the hero
    // centre point — taller and wider than its flanking siblings.
    var nPts = 4 + ((tileHash01(r, c, 0x4A02) * 3) | 0);  // 4..6

    // Fan angle spread — tips splay outward from a narrow vertical origin.
    var fanHalf = 0.55 + tileHash01(r, c, 0x4A03) * 0.25;  // 0.55..0.80 rad

    for (var i = 0; i < nPts; i++) {
      // Hero (i=0) at tile centre; satellites fan out either side.
      var sideI = (i === 0) ? 0 : ((i % 2 === 1) ? -(((i + 1) / 2) | 0) : ((i / 2) | 0));

      // Lateral offset in pixels along the base.
      var latOff = sideI * (3.5 + tileHash01(r, c, 0x4A10 + i) * 1.8);

      // Vertical size: hero tallest, outer chips shorter.
      var absSide = sideI < 0 ? -sideI : sideI;
      var halfH = (8 - absSide) + Math.round(tileHash01(r, c, 0x4A20 + i) * 2);
      if (halfH < 3) halfH = 3;
      var halfW = 2 + (tileHash01(r, c, 0x4A30 + i) < 0.4 ? 0 : 1);  // 2..3

      // Fan tilt: centre straight up (small lean), outer tips lean outward.
      var tilt = sideI * fanHalf / Math.max(1, (nPts - 1) * 0.5);
      var cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      // Crystal grows upward, so the centre of the facet is halfway up
      // from the base. The facet centre sits halfH pixels above the base
      // along the tilt direction, plus the lateral offset perpendicular to it.
      var cx = bx + Math.round(latOff * cosT - (-halfH) * sinT);
      var cy = by + Math.round(latOff * sinT + (-halfH) * cosT);

      drawGemFacet(cx, cy, halfW, halfH, ramp);
    }
  }

  // ----- Peridot -----
  // Olive-lime faceted gem (mantle olivine) with an oily internal glow.
  // One equant hero gem + 2 orbiting satellites; a small bright core pixel
  // below-left of the hero gives the oil-green internal-light feel.
  // Distinct from emerald (jewel green), uranium (acid druse), jade (mottled).
  function drawPeridotOre(tx, ty, r, c) {
    var ramp = {
      out:    '#1e3408',
      seam:   '#4a7016',
      shadow: '#3a5a10',
      base:   '#6a9e1e',
      light:  '#9ccb3a',
      shine:  '#e8ff9a'
    };

    // Hero centre — slight jitter.
    var hx = tx + 16 + Math.round((tileHash01(r, c, 0x5B00) - 0.5) * 4);
    var hy = ty + 16 + Math.round((tileHash01(r, c, 0x5B01) - 0.5) * 4);
    var heroHalf = 5 + (tileHash01(r, c, 0x5B02) < 0.5 ? 0 : 1);  // 5..6

    // Two satellites at hashed orbital angle + distance.
    var orbBase = tileHash01(r, c, 0x5B10) * 6.283;
    for (var si = 0; si < 2; si++) {
      var oAng = orbBase + si * 3.14159 + (tileHash01(r, c, 0x5B20 + si) - 0.5) * 1.2;
      var oDist = 8 + tileHash01(r, c, 0x5B30 + si) * 4;           // 8..12
      var sx = hx + Math.round(Math.cos(oAng) * oDist);
      var sy = hy + Math.round(Math.sin(oAng) * oDist);
      var sHalf = 2 + (tileHash01(r, c, 0x5B40 + si) < 0.5 ? 0 : 1); // 2..3
      drawGemFacet(sx, sy, sHalf, sHalf, ramp);
    }

    // Hero gem on top.
    drawGemFacet(hx, hy, heroHalf, heroHalf, ramp);

    // Oily internal glow — a 2x2 brighter core just below-left of hero
    // centre; the helper's shine already placed a specular, this is the
    // distinct oil-slick accent.
    ctx.fillStyle = '#c8f060';
    ctx.fillRect(hx - 1, hy + 1, 1, 1);
    ctx.fillRect(hx - 2, hy + 1, 1, 1);
  }

  // ----- Sulfur -----
  // Bright lemon-yellow volcanic crystal crust: many tiny sharp chips +
  // a few rounded grains in gaps; one orange realgar fleck as the accent.
  // Matte crystalline lemon — distinct from gold (metallic vein) and pyrite
  // (brassy cubes). Uses oreScatter anchors + extra hashed density points.
  function drawSulfurOre(tx, ty, r, c) {
    var fRamp = {
      out:    '#6a4e08',
      seam:   '#c9a318',
      shadow: '#b89018',
      base:   '#e8cf2a',
      light:  '#f7ea5e',
      shine:  '#fff7a0'
    };
    var gRamp = {
      out:    '#6a4e08',
      shadow: '#b89018',
      base:   '#e8cf2a',
      light:  '#f7ea5e'
    };

    // 4-5 base anchor points for the cluster core.
    var pts = oreScatter(tx, ty, r, c, 0x7600, 4, 5);

    // Extra hashed points around anchors for crystal density (6-9 total chips).
    var extraPts = [];
    var nExtra = 2 + ((tileHash01(r, c, 0x7610) * 4) | 0);  // 2..5
    for (var e = 0; e < nExtra; e++) {
      var eAng = tileHash01(r, c, 0x7620 + e) * 6.283;
      var eDist = 2 + tileHash01(r, c, 0x7630 + e) * 3.5;
      var baseIdx = (e % pts.length);
      extraPts.push({
        x: pts[baseIdx].x + Math.round(Math.cos(eAng) * eDist),
        y: pts[baseIdx].y + Math.round(Math.sin(eAng) * eDist)
      });
    }
    var allPts = pts.concat(extraPts);

    // Draw tiny facet chips at all points.
    for (var i = 0; i < allPts.length; i++) {
      var halfW = 1 + (tileHash01(r, c, 0x7640 + i) < 0.5 ? 0 : 1);  // 1..2
      var halfH = 2 + (tileHash01(r, c, 0x7650 + i) < 0.5 ? 0 : 1);  // 2..3
      drawGemFacet(allPts[i].x, allPts[i].y, halfW, halfH, fRamp);
    }

    // 2-3 small rounded grains filling gaps between chips.
    var nGrains = 2 + (tileHash01(r, c, 0x7660) < 0.5 ? 0 : 1);
    for (var g = 0; g < nGrains; g++) {
      var gAng = tileHash01(r, c, 0x7670 + g) * 6.283;
      var gDist = tileHash01(r, c, 0x7680 + g) * 4;
      var gx = pts[0].x + Math.round(Math.cos(gAng) * gDist);
      var gy = pts[0].y + Math.round(Math.sin(gAng) * gDist);
      var gRad = 1.5 + tileHash01(r, c, 0x7690 + g) * 1.0;  // 1.5..2.5
      drawOreGrain(gx, gy, gRad, gRamp, r, c, 0x7700 + g * 0x20);
    }

    // ONE orange realgar fleck — the single accent pixel.
    var rPt = pts[(tileHash01(r, c, 0x7770) * pts.length) | 0];
    var rOff = tileHash01(r, c, 0x7771) < 0.5 ? -2 : 2;
    ctx.fillStyle = '#e8641e';
    ctx.fillRect(rPt.x + rOff, rPt.y - 1, 1, 1);
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(rPt.x + rOff + 1, rPt.y - 1, 1, 1);
  }

  // ----- Platinum -----
  // Heavy white-metal vein nuggets: 2-3 stout curly wires crossing near
  // centre, heavy grains at wire joints, stouter than silver's thin curls.
  // Premium precious metal — distinct from silver (cooler, thin curls)
  // and iron. Wire+grain dendrite mirrors drawGoldOre but platinum-white.
  function drawPlatinumOre(tx, ty, r, c) {
    var wRamp = {
      out:    '#3a4048',
      shadow: '#5a6068',
      base:   '#9aa4ae',
      light:  '#d8e0e8',
      shine:  '#fbfeff'
    };
    var gRamp = {
      out:    '#3a4048',
      shadow: '#6a7078',
      base:   '#aab4be',
      light:  '#e8f0f6'
    };

    var ccx = tx + 16 + Math.round((tileHash01(r, c, 0x6C00) - 0.5) * 4);
    var ccy = ty + 16 + Math.round((tileHash01(r, c, 0x6C01) - 0.5) * 4);

    var nWires = 2 + (tileHash01(r, c, 0x6C02) < 0.5 ? 0 : 1);  // 2..3
    var angBase = tileHash01(r, c, 0x6C03) * 6.283;
    var joints = [];

    for (var i = 0; i < nWires; i++) {
      var wSeed = 0x6C80 + i * 0x40;
      var ang = angBase + (i / nWires) * 6.283 + (tileHash01(r, c, wSeed) - 0.5) * 0.8;
      // Wire midpoint near centre, staggered slightly.
      var mx = ccx + Math.round((tileHash01(r, c, wSeed + 1) - 0.5) * 6);
      var my = ccy + Math.round((tileHash01(r, c, wSeed + 2) - 0.5) * 6);
      var arcLen = 9 + tileHash01(r, c, wSeed + 3) * 4;            // 9..13
      var thk = 2.0 + tileHash01(r, c, wSeed + 4) * 0.8;           // 2.0..2.8
      var hookSign = (tileHash01(r, c, wSeed + 5) < 0.33) ? -1
                   : (tileHash01(r, c, wSeed + 5) < 0.66) ?  1 : 0;
      var e = drawCurlWire(mx, my, ang, arcLen, thk, hookSign, 0.5,
                           wRamp, r, c, wSeed + 8);
      // Collect both endpoints as nugget locations.
      joints.push({ x: e.x0, y: e.y0, rad: 2.5 + tileHash01(r, c, wSeed + 16) * 0.8 });
      joints.push({ x: e.x1, y: e.y1, rad: 2.5 + tileHash01(r, c, wSeed + 17) * 0.8 });
    }

    // Heavy nugget at the cluster centre (the main junction).
    drawOreGrain(ccx, ccy, 3.0 + tileHash01(r, c, 0x6C10) * 0.5, gRamp, r, c, 0x6D00);
    ctx.fillStyle = wRamp.shine;
    ctx.fillRect((ccx | 0) - 1, (ccy | 0) - 1, 1, 1);

    // Nuggets at wire endpoints / joints.
    var nSeed = 0x6D80;
    for (var j = 0; j < joints.length; j++) {
      if (tileHash01(r, c, 0x6C50 + j) < 0.35) continue;  // ~65% get a nugget
      drawOreGrain(joints[j].x, joints[j].y, joints[j].rad, gRamp, r, c, nSeed + j * 0x18);
      ctx.fillStyle = wRamp.shine;
      ctx.fillRect((joints[j].x | 0) - 1, (joints[j].y | 0) - 1, 1, 1);
    }
  }
