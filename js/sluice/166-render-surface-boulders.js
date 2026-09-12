  // ====== SURFACE BOULDERS ======
  // Low, quiet stone accents between groves. Decorative, like the trees;
  // they leave the rig's route open. Baked at world-pixel resolution with the
  // station's stone ramp, top-left light and broad fractured faces.
  var surfaceBoulders = [], surfaceBoulderSprites = null;
  var surfaceBoulderWorld = null, surfaceBoulderDensity = -1;

  function surfaceBoulderBake(w, h, seed) {
    var s = treesMakeSprite(w + 6, h + 6), g = s.g;
    var baseY = h + 3, cx = (s.w / 2) | 0;
    var shoulder = .18 + treesHash(seed * 17) * .13;
    var peak = .36 + treesHash(seed * 29) * .20;
    var pts = [[.02,.92],[.06,.48],[shoulder,.15],[peak,0],
               [.80,.14],[.98,.60],[.94,1],[.20,1]];
    var mask = new Uint8Array(s.w * s.h), x, y, i;
    // Scan-convert the angular silhouette. The outline stays exactly one
    // world pixel, without antialiased paths or smooth gradients.
    for (y = 0; y <= h; y++) {
      var cuts = [], fy = y / h;
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= fy && b[1] > fy) || (b[1] <= fy && a[1] > fy)) {
          cuts.push((a[0] + (b[0] - a[0]) * (fy - a[1]) / (b[1] - a[1])) * w + 3);
        }
      }
      cuts.sort(function(a, b) { return a - b; });
      for (i = 0; i + 1 < cuts.length; i += 2) {
        for (x = Math.ceil(cuts[i]); x <= Math.floor(cuts[i + 1]); x++) mask[(y + 3) * s.w + x] = 1;
      }
    }
    for (y = 1; y < s.h - 1; y++) for (x = 1; x < s.w - 1; x++) {
      var at = y * s.w + x;
      if (!mask[at]) {
        if (y < baseY && (mask[at - 1] || mask[at + 1] || mask[at - s.w] || mask[at + s.w])) {
          g.fillStyle = BLD.outline; g.fillRect(x, y, 1, 1);
        }
        continue;
      }
      var nx = (x - 3) / w, ny = (y - 3) / h;
      var ridge = .34 + (nx - peak) * .28;
      g.fillStyle = ny < ridge ? BLD.stoneLight : (nx > .70 - ny * .12 ? BLD.stoneDark : BLD.stoneBase);
      // A broad broken foot seats the rock in soil. It has no bright rim.
      if (ny > .85 + nx * .05) g.fillStyle = BLD.stoneDark;
      g.fillRect(x, y, 1, 1);
      // One stepped fissure follows the meeting of the two main faces.
      if (ny > .37 && ny < .78 && x === Math.round(3 + w * (.59 + Math.floor(ny * 6) * .025))) {
        g.fillStyle = BLD.stoneDark; g.fillRect(x, y, 1, 1);
      }
    }
    // A short moss seam ties some stones to the grass without making every
    // face speckled. Three large facets remain the primary read.
    if (seed % 2) {
      g.fillStyle = TREES_GREEN_DARK;
      g.fillRect(6, baseY - 3, Math.round(w * .23), 2);
      g.fillRect(8, baseY - 4, Math.round(w * .12), 1);
    }
    return { cv:s.cv, w:s.w, h:s.h, ax:cx, ay:baseY };
  }

  function surfaceBoulderSupported(rock) {
    for (var c = rock.cL; c <= rock.cR; c++) {
      var t = tileAt(SKY_ROWS, c);
      if (!t || t === 'wall' || t.type === 'foundation' || treesInPond(c)) return false;
    }
    return true;
  }

  function surfaceBouldersRebuild() {
    if (!surfaceBoulderSprites) {
      surfaceBoulderSprites = [surfaceBoulderBake(26,13,11), surfaceBoulderBake(35,19,22),
        surfaceBoulderBake(45,22,35), surfaceBoulderBake(32,25,46)];
    }
    surfaceBoulders.length = 0;
    surfaceBoulderWorld = world;
    surfaceBoulderDensity = treesTune.density;
    var lastX = -1e9;
    for (var c = 3; c < COLS - 3; c++) {
      var region = regionAt(c);
      if (!region || region.kind !== REGION_TOWN) continue;
      if (Math.abs(c - townCenterCol(region.townIndex)) < TREES_TOWN_CLEAR - 2) continue;
      // More likely at the edge of a grove, but rare enough to keep clearings.
      if (treesHash(c * 1249 + 617) > .07 + (1 - treesGrove(c)) * .03) continue;
      var spr = surfaceBoulderSprites[Math.floor(treesHash(c * 373 + 19) * surfaceBoulderSprites.length)];
      var x = c * TILE + TILE * .5;
      if (x - lastX < TILE * 5) continue;
      var nearTree = false;
      for (var i = treesLowerBound(x - 110); i < TREES.length && TREES[i].x < x + 110; i++) {
        var tree = TREES[i];
        if (Math.abs(tree.x - x) < (spr.w + tree.spr.w) * .5 + 14) { nearTree = true; break; }
      }
      if (nearTree) continue;
      var rock = { x:x, spr:spr, cL:Math.floor((x - spr.ax + 3) / TILE),
        cR:Math.floor((x - spr.ax + spr.w - 4) / TILE) };
      if (!surfaceBoulderSupported(rock)) continue;
      surfaceBoulders.push(rock); lastX = x;
    }
  }

  function drawSurfaceBoulders() {
    var surfaceY = SKY_ROWS * TILE;
    if (cam.y >= surfaceY || cam.y + screenH < surfaceY - 32) return;
    if (!treesBuilt || treesWorldRef !== world) return;
    if (surfaceBoulderWorld !== world || surfaceBoulderDensity !== treesTune.density) surfaceBouldersRebuild();
    var smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < surfaceBoulders.length; i++) {
      var rock = surfaceBoulders[i], s = rock.spr;
      if (rock.x + s.w < cam.x) continue;
      if (rock.x - s.w > cam.x + screenW) break;
      // Removing ANY supporting surface tile removes the decorative stone.
      // Save/load derives the same result from the saved terrain, no new data.
      if (!surfaceBoulderSupported(rock)) continue;
      ctx.drawImage(s.cv, Math.round(rock.x - s.ax), surfaceY - s.ay);
    }
    ctx.imageSmoothingEnabled = smoothing;
  }
