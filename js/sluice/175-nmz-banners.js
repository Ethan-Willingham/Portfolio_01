  /* ====== NMZ CAUTION BANNERS ======
     Wind-blown caution blade flag (the car-wash / gas-station feather-flag
     silhouette) standing at every town <-> No Man's Zone mouth, to warn the
     player they are about to enter a combat gauntlet. Dressed as a hazard
     sign: bright caution-yellow field with diagonal black hazard stripes, a
     yellow warning triangle medallion, and a red-star finial on a flexible
     iron mast that bends + ripples on `surfaceWind`.

     One wide flag per mouth (v24.38; was a narrower flanking pair). The sail
     is authored once into an offscreen canvas at world-pixel resolution, then
     blitted in 1-px horizontal slices each frame with a per-row X offset
     (mast bend + travelling ripple) so the cloth stays crisp pixel art while
     it whips. Chosen from nmz-banner-lab.html. No gm levers (the gm fragments
     are intentionally untouched here); the feel lives in NMZ_BANNER below. */

  var NMZ_BANNER = {
    sailW: 28, sailH: 92,   // sail texture size, world px (wide caution blade)
    poleExtra: 16,          // bare mast below the sail, world px
    edgeInset: 10,          // flag stands this far inside the zone from a boundary
    cullMargin: 110         // off-screen reject margin, world px (covers wide sail + bend)
  };

  // Lazy offscreen sail texture (built once, then sliced every frame).
  var nmzSailTex = null;
  function buildNmzSailTex() {
    var Wt = NMZ_BANNER.sailW, Ht = NMZ_BANNER.sailH;
    var c = document.createElement('canvas'); c.width = Wt; c.height = Ht;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    // bright caution-yellow field with a rounded top
    g.fillStyle = BLD.goldBright; g.fillRect(0, 5, Wt, Ht - 5);
    g.beginPath(); g.moveTo(0, 5); g.quadraticCurveTo(Wt / 2, -2, Wt, 5); g.closePath(); g.fill();
    // diagonal black hazard stripes (caution-tape), yellow-dominant, clipped to the sail
    g.save(); g.beginPath(); g.rect(0, 0, Wt, Ht); g.clip();
    g.fillStyle = BLD.outline;
    var period = 17, blackW = 6;
    for (var d = -Ht; d < Wt + Ht; d += period) {
      g.beginPath();
      g.moveTo(d, 0); g.lineTo(d + blackW, 0); g.lineTo(d + blackW - Ht, Ht); g.lineTo(d - Ht, Ht);
      g.closePath(); g.fill();
    }
    g.restore();
    // leading (pole) edge shaded, trailing edge lit, to keep a little form
    g.globalAlpha = 0.45; g.fillStyle = BLD.goldDark; g.fillRect(0, 5, 3, Ht - 5);
    g.globalAlpha = 0.40; g.fillStyle = BLD.goldPale; g.fillRect(Wt - 3, 5, 3, Ht - 5);
    g.globalAlpha = 1;
    // yellow warning-triangle medallion near the top, on a dark disc for contrast
    var tcx = Math.round(Wt / 2), tcy = 17, tr = 8;
    g.fillStyle = BLD.outline; g.beginPath(); g.arc(tcx, tcy, tr + 3, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(tcx, tcy - tr); g.lineTo(tcx + tr, tcy + tr * 0.78); g.lineTo(tcx - tr, tcy + tr * 0.78);
    g.closePath();
    g.fillStyle = BLD.goldBright; g.fill();
    g.lineJoin = 'round'; g.lineWidth = 1.5; g.strokeStyle = BLD.outline; g.stroke();
    // exclamation mark
    g.fillStyle = BLD.outline;
    g.fillRect(tcx - 1, tcy - 4, 2, 6); g.fillRect(tcx - 1, tcy + 4, 2, 2);
    // sail body outline (rounded top approximated by a 1-px cap row)
    g.fillStyle = BLD.outline;
    g.fillRect(0, 5, Wt, 1); g.fillRect(0, Ht - 1, Wt, 1);
    g.fillRect(0, 5, 1, Ht - 5); g.fillRect(Wt - 1, 5, 1, Ht - 5);
    nmzSailTex = c;
    return c;
  }

  // One caution flag, base footing at (baseX, groundY). `phase` decorrelates
  // neighbouring flags so two on screen never ripple in lockstep.
  function drawNmzBladeFlag(baseX, groundY, phase) {
    if (!nmzSailTex) buildNmzSailTex();
    var tex = nmzSailTex, Wt = NMZ_BANNER.sailW, Ht = NMZ_BANNER.sailH;
    var wind = surfaceWind ? surfaceWind.current : 0;
    var flut = surfaceWind ? surfaceWind.flutter : (performance.now() / 600);
    var amp = 0.52 + Math.abs(wind) * 1.6;     // ripple drama (stronger wind response)
    var poleH = Ht + NMZ_BANNER.poleExtra;
    var sailTop = groundY - poleH;
    var ph = flut + phase;
    // cantilever bend of the flexible mast, f = 0 (footing) .. 1 (tip)
    function bendAt(f) {
      return wind * 23 * f * f                                  // lean into the wind
           + Math.sin(f * 3.0 - ph * 1.75) * amp * 6.2 * f      // primary ripple
           + Math.sin(f * 6.1 - ph * 2.6) * amp * 2.2 * f;      // secondary chop
    }
    ctx.save();
    ctx.lineJoin = 'round';
    // iron mast, following the leading-edge bend (two-tone)
    ctx.beginPath();
    for (var s = 0; s <= 1.0001; s += 0.06) {
      var yy = groundY - 4 - s * poleH;
      var xx = baseX + bendAt(s);
      if (s === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = BLD.metalDark;  ctx.lineWidth = 3.2; ctx.stroke();
    ctx.strokeStyle = BLD.metalLight; ctx.lineWidth = 1;   ctx.stroke();
    // red-star finial at the tip
    drawRedStar(baseX + bendAt(1), sailTop - 4, 3.4, 0.2);
    // base footing
    ctx.fillStyle = BLD.metalBase; ctx.fillRect(baseX - 4, groundY - 4, 8, 4);
    strokeRect1(baseX - 4, groundY - 4, 8, 4, BLD.outline);
    // sail: 1-px rows, each shifted in X to track the mast bend at its own
    // height; ripple already lives in bendAt, growing toward the free tip.
    var prevOff = null;
    for (var sy = 0; sy < Ht; sy++) {
      var sMast = 1 - (sy + 4) / poleH;          // exact mast fraction at this row
      var off = bendAt(sMast);
      var dx = Math.round(baseX + off);
      var dy = Math.round(sailTop + sy);
      ctx.drawImage(tex, 0, sy, Wt, 1, dx, dy, Wt, 1);
      if (prevOff !== null) {
        var d2 = off - prevOff;                  // horizontal slope -> faux fold shading
        if (d2 > 0.2)       { ctx.globalAlpha = Math.min(0.32, d2 * 0.18);  ctx.fillStyle = BLD.outline;  ctx.fillRect(dx, dy, Wt, 1); ctx.globalAlpha = 1; }
        else if (d2 < -0.2) { ctx.globalAlpha = Math.min(0.20, -d2 * 0.12); ctx.fillStyle = BLD.warmGlow; ctx.fillRect(dx, dy, Wt, 1); ctx.globalAlpha = 1; }
      }
      prevOff = off;
    }
    ctx.restore();
  }

  // One wide caution flag at each town <-> zone mouth; draw the on-screen ones.
  // Cheap: REGIONS has ~9 entries and culling rejects all but the boundary
  // near the camera, so usually at most one flag actually renders.
  function drawNmzBanners() {
    if (!ENABLE_NMZ) return;   // No Man's Zones disabled: no caution banners
    if (!REGIONS || !REGIONS.length) return;
    var groundY = DECK_ROW * TILE;
    var viewL = cam.x - NMZ_BANNER.cullMargin, viewR = cam.x + screenW + NMZ_BANNER.cullMargin;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      // a zone has two mouths: its right edge (rg.c1, toward the shallower
      // town) and its left edge (rg.c0, toward the deeper town).
      var edgeX = [ rg.c1 * TILE - NMZ_BANNER.edgeInset, rg.c0 * TILE + NMZ_BANNER.edgeInset ];
      for (var e = 0; e < 2; e++) {
        var x = edgeX[e];
        if (x < viewL || x > viewR) continue;   // cull off-screen
        drawNmzBladeFlag(x, groundY, x * 0.013);
      }
    }
  }
