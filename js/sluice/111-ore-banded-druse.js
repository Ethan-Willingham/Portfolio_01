  // ===== Banded & druse ores: malachite, galena, magnetite, rhodochrosite ===
  // All four draw ONLY the mineral cluster; the dirt/stone host shows through
  // via drawEarlyOreBase. Light always from the upper-left. Geometry keyed
  // entirely to (r, c) via tileHash01 — no neighbour reads.

  // ----- Malachite -----
  // Green copper carbonate in botryoidal habit: concentric banding is the
  // signature tell (distinct from faceted emerald and mottled jade). A large
  // main bulb with one irregular satellite, plus a 2-3 pixel sheen highlight
  // on the upper-left ring of the main bulb.
  function drawMalachiteOre(tx, ty, r, c) {
    var cx = tx + 16;
    var cy = ty + 16;
    var ramp = {
      out:   '#06241a',
      bands: ['#0c3b22', '#157a44', '#2faa66', '#6fd99a']
    };

    // Vary the radius slightly per tile (9..10).
    var mainRad = 9 + (tileHash01(r, c, 0x4A00) < 0.5 ? 1 : 0);

    // Main botryoidal bulb.
    drawBandedBotryoidal(cx, cy, mainRad, ramp, r, c, 0x4A10);

    // Satellite bulb — offset by ±5..7 px on both axes so the cluster reads
    // irregular. Radius 4..5.
    var satRad  = 4 + (tileHash01(r, c, 0x4A20) < 0.5 ? 1 : 0);
    var satOffX = Math.round((tileHash01(r, c, 0x4A21) - 0.5) * 12);   // ±6
    var satOffY = Math.round((tileHash01(r, c, 0x4A22) - 0.5) * 10);   // ±5
    // Bias away from the main centre so the satellite doesn't pile directly
    // on top, giving a clear two-lobe silhouette.
    if (satOffX === 0) satOffX = 5;
    if (satOffY === 0) satOffY = 5;
    drawBandedBotryoidal(cx + satOffX, cy + satOffY, satRad, ramp, r, c, 0x4A30);

    // Accent sheen: 2-3 bright highlight pixels on the upper-left ring of the
    // main bulb — the glassy polish distinctive of polished malachite.
    var nSheen = 2 + (tileHash01(r, c, 0x4A40) < 0.4 ? 1 : 0);
    ctx.fillStyle = '#9ff0c0';
    for (var s = 0; s < nSheen; s++) {
      // Angles in the upper-left quadrant (π .. 3π/2 mapped into ring).
      var ang = Math.PI + (tileHash01(r, c, 0x4A41 + s) * Math.PI * 0.55);
      var sr  = mainRad - 1.5 - tileHash01(r, c, 0x4A50 + s) * 1.5;
      ctx.fillRect(
        cx + (Math.cos(ang) * sr | 0),
        cy + (Math.sin(ang) * sr | 0),
        1, 1
      );
    }
  }

  // ----- Galena -----
  // Lead-grey cleaved metallic cubes — hard, geometric, high-contrast
  // specular. Distinct from iron (banded) and silver (dendritic curly wire).
  // 1 hero cube + 2-3 satellite cubes from oreScatter anchor points.
  function drawGalenaOre(tx, ty, r, c) {
    var ramp = {
      out:    '#15181d',
      shadow: '#3a4048',
      base:   '#6b7480',
      light:  '#aeb8c4',
      shine:  '#eef4fa'
    };

    var pts = oreScatter(tx, ty, r, c, 0x7100, 3, 4);

    for (var i = 0; i < pts.length; i++) {
      var seed = 0x7110 + i * 0x10;

      // Rotation: ~70% of tiles nearly axis-aligned, ~30% boldly tilted.
      var tiltChoice = tileHash01(r, c, seed);
      var ang;
      if (tiltChoice < 0.70) {
        // Near axis-aligned — small wobble ±0.15 rad.
        ang = (tileHash01(r, c, seed + 1) - 0.5) * 0.30;
      } else {
        // Bold tilt ±0.25..0.50 rad.
        var sign = tileHash01(r, c, seed + 2) < 0.5 ? 1 : -1;
        ang = sign * (0.25 + tileHash01(r, c, seed + 3) * 0.25);
      }

      var half;
      if (i === 0) {
        // Hero cube.
        half = 6;
      } else {
        // Satellites: half 3..4.5 (steps of 0.5).
        half = 3 + (tileHash01(r, c, seed + 4) * 3 | 0) * 0.5;
      }

      drawMetalCube(pts[i].x, pts[i].y, half, ang, ramp, r, c, seed + 5, false);
    }
  }

  // ----- Magnetite -----
  // Near-black octahedral crystal druse — denser and smaller than galena.
  // 4-6 tight octahedra, faint steel-blue highlight; sharp angular crystals
  // distinct from coal (matte rounded bands) and iron (smooth banded shards).
  function drawMagnetiteOre(tx, ty, r, c) {
    var ramp = {
      out:    '#05070a',
      shadow: '#14181f',
      base:   '#262d38',
      light:  '#46505e',
      shine:  '#7a8696'
    };

    var pts = oreScatter(tx, ty, r, c, 0x7200, 4, 5);

    // Track the two largest crystals for the accent glint.
    var largest1Idx = 0, largest2Idx = 1;
    var half1 = 0, half2 = 0;

    for (var i = 0; i < pts.length; i++) {
      var seed = 0x7210 + i * 0x10;
      // Dense tight cluster: half 3..5.
      var half = 3 + tileHash01(r, c, seed) * 2;
      // Small hashed rotation — mostly axis-aligned for the faceted look.
      var ang  = (tileHash01(r, c, seed + 1) - 0.5) * 0.6;

      drawMetalCube(pts[i].x, pts[i].y, half, ang, ramp, r, c, seed + 2, true);

      // Record the two largest for the accent.
      if (half > half1) { half2 = half1; largest2Idx = largest1Idx; half1 = half; largest1Idx = i; }
      else if (half > half2) { half2 = half; largest2Idx = i; }
    }

    // Metallic blue-grey glint pixels on the upper-left tips of the two
    // largest crystals — the faint iridescent oil-slick surface that magnetite
    // shows under good light.
    ctx.fillStyle = '#8fa0b4';
    var a1 = pts[largest1Idx];
    var h1 = 3 + tileHash01(r, c, 0x7210 + largest1Idx * 0x10) * 2;
    ctx.fillRect((a1.x - (h1 * 0.3 | 0)) | 0, (a1.y - (h1 * 0.7 | 0)) | 0, 1, 1);

    if (largest2Idx < pts.length) {
      var a2 = pts[largest2Idx];
      var h2 = 3 + tileHash01(r, c, 0x7210 + largest2Idx * 0x10) * 2;
      ctx.fillRect((a2.x - (h2 * 0.3 | 0)) | 0, (a2.y - (h2 * 0.7 | 0)) | 0, 1, 1);
    }
  }

  // ----- Rhodochrosite -----
  // Rose-pink banded botryoidal — the "rose of the Andes". Sibling to
  // malachite in form but unmistakable in colour: dark wine banding grades
  // to pale blush then near-white at the upper crown. One satellite bulb.
  function drawRhodochrositeOre(tx, ty, r, c) {
    var cx = tx + 16;
    var cy = ty + 16;
    var ramp = {
      out:   '#3a0f22',
      bands: ['#5e1733', '#9c2a52', '#cf5378', '#f29ab4', '#ffd7e3']
    };

    // Main botryoidal bulb, radius 9..10.
    var mainRad = 9 + (tileHash01(r, c, 0x4B00) < 0.5 ? 1 : 0);
    drawBandedBotryoidal(cx, cy, mainRad, ramp, r, c, 0x4B10);

    // Satellite bulb — offset ±5..7 px, radius 4..5.
    var satRad  = 4 + (tileHash01(r, c, 0x4B20) < 0.5 ? 1 : 0);
    var satOffX = Math.round((tileHash01(r, c, 0x4B21) - 0.5) * 12);
    var satOffY = Math.round((tileHash01(r, c, 0x4B22) - 0.5) * 10);
    if (satOffX === 0) satOffX = -5;
    if (satOffY === 0) satOffY =  5;
    drawBandedBotryoidal(cx + satOffX, cy + satOffY, satRad, ramp, r, c, 0x4B30);

    // Accent: 1-2 bright near-white pixels at the upper-left crown — the
    // white-pink top band that makes rhodochrosite instantly recognisable.
    var nSheen = 1 + (tileHash01(r, c, 0x4B40) < 0.45 ? 1 : 0);
    ctx.fillStyle = '#fff0f5';
    for (var s = 0; s < nSheen; s++) {
      // Tight upper-left arc (between ~10 o'clock and ~12 o'clock).
      var ang = Math.PI + (tileHash01(r, c, 0x4B41 + s) * Math.PI * 0.40);
      var sr  = mainRad - 1.0 - tileHash01(r, c, 0x4B50 + s) * 1.5;
      ctx.fillRect(
        cx + (Math.cos(ang) * sr | 0),
        cy + (Math.sin(ang) * sr | 0),
        1, 1
      );
    }
  }
