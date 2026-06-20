  // ----- Polished-stone ores (jade, turquoise, lapis, cobalt) -----
  // All four are v24.15 polished-stone showcase ores. Jade = pure
  // drawPolishedStone. Turquoise = polished body + matrix webbing.
  // Lapis = polished body + gold pyrite + calcite flecks. Cobalt =
  // tabular crystal blade cluster (drawOreShard), no polished body.
  // Light always upper-left. Per-pixel only. Host shows through.

  // ----- Jade Ore -----
  // Smooth waxy green pebble — the canonical drawPolishedStone showcase.
  // No facets, no veins, no bands: pure mottled polished nephrite.
  // ~40 % of tiles get a smaller second lobe for a pebble-pair read.
  // Distinct from: emerald (faceted crystal), malachite (banded botryoidal).
  function drawJadeOre(tx, ty, r, c) {
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x6A00) - 0.5) * 2);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x6A01) - 0.5) * 2);
    var ramp = {
      out:    '#10301f',
      shadow: '#1c4a32',
      base:   '#2f7a4e',
      mid:    '#4f9e6e',
      light:  '#86c79a',
      sheen:  '#d8f0e0'
    };
    drawPolishedStone(cx, cy, 10, ramp, r, c, 0x6A10);

    // Pebble-pair on ~40 % of tiles.
    if (tileHash01(r, c, 0x6A20) < 0.40) {
      var offAng = tileHash01(r, c, 0x6A21) * 6.283;
      var offR   = 5 + tileHash01(r, c, 0x6A22) * 1.5;
      var cx2 = Math.round(cx + Math.cos(offAng) * offR);
      var cy2 = Math.round(cy + Math.sin(offAng) * offR);
      drawPolishedStone(cx2, cy2, 5, ramp, r, c, 0x6A30);
    }
  }

  // ----- Turquoise Ore -----
  // Polished blue-green cabochon with black spiderweb matrix veins.
  // The dark webbing IS the signature — chalcedony host intruded by
  // dark matrix cracks. Distinct from: methaneice (icy translucent),
  // cobalt (crystalline blades), jade (no veins, pure green).
  function drawTurquoiseOre(tx, ty, r, c) {
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x7300) - 0.5) * 2);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x7301) - 0.5) * 2);
    var bodyRamp = {
      out:    '#10403e',
      shadow: '#1c6f68',
      base:   '#2fa298',
      mid:    '#48c9bd',
      light:  '#9fe8dd',
      sheen:  '#e8fffb'
    };
    drawPolishedStone(cx, cy, 9, bodyRamp, r, c, 0x7310);
    // Matrix webbing overlay — drawn after body so veins sit on top.
    drawMatrixVeins(cx, cy, 8, { dark: '#1a1410', mid: '#4a3a28' }, r, c, 0x7320);
  }

  // ----- Lapis Ore -----
  // Ultramarine polished rock with gold pyrite flecks + white calcite.
  // The bright gold sparkle against deep blue IS the signature.
  // Distinct from: cobalt (crystalline, lighter blue), tanzanite (faceted gem).
  function drawLapisOre(tx, ty, r, c) {
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x7400) - 0.5) * 2);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x7401) - 0.5) * 2);
    var bodyRamp = {
      out:    '#0c1a4a',
      shadow: '#142a6e',
      base:   '#22398f',
      mid:    '#3257b8',
      light:  '#5a82e0',
      sheen:  '#aac4ff'
    };
    drawPolishedStone(cx, cy, 10, bodyRamp, r, c, 0x7410);
    // Pyrite gold + white calcite flecks scattered over body.
    drawFlecks(cx, cy, 8,
      ['#e8c24a', '#f0d878', '#e8c24a', '#dfe6ee'],
      14, r, c, 0x7420);
  }

  // ----- Cobalt Ore -----
  // Electric-blue tabular crystal blades — anisotropic flat plates,
  // NOT rounded. Mirrors drawSilverOre's multi-element cluster approach
  // but uses drawOreShard (flat lozenge plates) not curl-wires.
  // halfThk kept low (1.5-2.0) for the tabular "flat plate" read.
  // Distinct from: silver (white curls), iron (grey bands),
  //                turquoise (rounded, no crystals).
  function drawCobaltOre(tx, ty, r, c) {
    var bladeRamp = {
      out:    '#0c1638',
      shadow: '#1f3f9e',
      base:   '#2f5bd8',
      light:  '#5a86f0',
      shine:  '#bcd4ff'
    };
    var cx = tx + 16 + Math.round((tileHash01(r, c, 0x7500) - 0.5) * 3);
    var cy = ty + 16 + Math.round((tileHash01(r, c, 0x7501) - 0.5) * 3);

    // Hero blade — longer, near-centre.
    var heroLen  = 7 + tileHash01(r, c, 0x7510) * 2;           // 7..9
    var heroTilt = (tileHash01(r, c, 0x7511) - 0.5) * 2.4;
    var heroThk  = 1.5 + tileHash01(r, c, 0x7512) * 0.5;       // 1.5..2.0
    drawOreShard(cx, cy, heroLen, heroThk, heroTilt, bladeRamp, r, c, 0x7520);

    // 2-3 satellite blades offset from centre.
    var nSat = 2 + (tileHash01(r, c, 0x7530) < 0.55 ? 0 : 1);  // 2..3
    for (var i = 0; i < nSat; i++) {
      var sAng  = tileHash01(r, c, 0x7540 + i * 8) * 6.283;
      var sDist = 3.5 + tileHash01(r, c, 0x7541 + i * 8) * 2.5;
      var sx    = Math.round(cx + Math.cos(sAng) * sDist);
      var sy    = Math.round(cy + Math.sin(sAng) * sDist);
      var sLen  = 4 + tileHash01(r, c, 0x7542 + i * 8) * 2;    // 4..6
      var sTilt = heroTilt + (tileHash01(r, c, 0x7543 + i * 8) - 0.5) * 1.8;
      var sThk  = 1.5 + tileHash01(r, c, 0x7544 + i * 8) * 0.5;
      drawOreShard(sx, sy, sLen, sThk, sTilt, bladeRamp, r, c, 0x7560 + i * 0x30);
    }

    // Electric-blue tip glints on 1-2 blade tips.
    var nGlint = 1 + (tileHash01(r, c, 0x75A0) < 0.55 ? 0 : 1);
    var glintOffX = [Math.round(Math.cos(heroTilt) * heroLen * 0.85),
                     Math.round(Math.cos(heroTilt) * -heroLen * 0.75)];
    var glintOffY = [Math.round(Math.sin(heroTilt) * heroLen * 0.85),
                     Math.round(Math.sin(heroTilt) * -heroLen * 0.75)];
    ctx.fillStyle = '#cfe0ff';
    for (var g = 0; g < nGlint; g++) {
      ctx.fillRect(cx + glintOffX[g], cy + glintOffY[g], 1, 1);
    }
  }
