  // ====== SURFACE BOULDERS ======
  // Low, quiet stone accents between groves. Decorative, like the trees;
  // they leave the rig's route open. Baked at world-pixel resolution with the
  // station's stone ramp, top-left light and broad fractured faces.
  var surfaceBoulders = [], surfaceBoulderSprites = {}, surfaceBoulderPalette = null;
  var surfaceBoulderWorld = null, surfaceBoulderDensity = -1;
  var SURFACE_BOULDER_SETTLE = .16, SURFACE_BOULDER_LIFE = 1.05;

  function surfaceBoulderMix(a, b, t) {
    var out = [];
    for (var i = 1; i < 7; i += 2) {
      var av = parseInt(a.slice(i, i + 2), 16), bv = parseInt(b.slice(i, i + 2), 16);
      out.push(Math.round(av + (bv - av) * t));
    }
    return 'rgb(' + out.join(',') + ')';
  }

  function surfaceBoulderColors() {
    if (!surfaceBoulderPalette) {
      // Stone scenery uses a compressed slice of the station's existing ramp.
      // Whole stones can lean lighter, but adjacent faces stay close in value.
      surfaceBoulderPalette = [surfaceBoulderMix(BLD.stoneDark, BLD.stoneBase, .56),
        surfaceBoulderMix(BLD.stoneDark, BLD.stoneBase, .73), BLD.stoneBase,
        surfaceBoulderMix(BLD.stoneBase, BLD.stoneLight, .15),
        surfaceBoulderMix(BLD.stoneBase, BLD.stoneLight, .28)];
    }
    return surfaceBoulderPalette;
  }

  function surfaceBoulderBake(w, h, seed) {
    var s = treesMakeSprite(w + 6, h + 6), g = s.g;
    var baseY = h + 3, cx = (s.w / 2) | 0;
    // Eight shape families, with a different crown, shoulder and lean per
    // column. Geometry may reverse; light always remains on the upper left.
    var kind = Math.floor(treesHash(seed * 11 + 31) * 8);
    var profiles = [
      [[.03,1],[.07,.54],[.23,.49],[.19,.31],[.38,.04],[.54,0],
        [.71,.18],[.70,.27],[.83,.29],[.96,.62],[.91,.80],[.95,1]],
      [[.02,1],[0,.72],[.12,.37],[.29,.22],[.50,.04],[.67,0],
        [.84,.24],[.88,.52],[1,.64],[.97,.97],[.71,1]],
      [[.04,1],[.01,.68],[.15,.30],[.35,.09],[.59,0],[.76,.14],
        [.81,.39],[.94,.46],[.91,.62],[1,.83],[.92,1]],
      [[.01,1],[.06,.64],[.18,.50],[.20,.24],[.38,.16],[.43,0],
        [.61,.05],[.70,.23],[.84,.22],[.96,.54],[1,.82],[.93,1]],
      [[.02,1],[0,.69],[.11,.35],[.30,.06],[.68,0],[.82,.16],
        [.93,.45],[1,.78],[.96,1]],
      [[.03,1],[.11,.61],[.26,.42],[.38,.21],[.64,0],[.73,.09],
        [.77,.36],[.89,.56],[1,.83],[.94,1]],
      [[.04,1],[0,.78],[.07,.47],[.21,.19],[.44,0],[.64,.03],
        [.83,.23],[.96,.54],[1,.83],[.93,1]],
      [[.01,1],[.04,.59],[.16,.42],[.28,.43],[.32,.16],[.48,0],
        [.63,.08],[.66,.29],[.80,.21],[.93,.45],[1,.83],[.95,1]]
    ];
    var pts = [], reverse = treesHash(seed * 29 + 7) < .5;
    var profile = profiles[kind];
    for (var p = 0; p < profile.length; p++) {
      var px = profile[p][0], py = profile[p][1];
      px += (treesHash(seed * 41 + p * 97) - .5) * .08;
      if (py > 0 && py < 1) py += (treesHash(seed * 47 + p * 71) - .5) * .09;
      px = Math.max(.01, Math.min(.99, px));
      pts.push([reverse ? 1 - px : px, Math.max(0, Math.min(1, py))]);
    }
    var split = .52 + treesHash(seed * 53 + 1) * .24;
    var splitLean = (treesHash(seed * 59 + 3) - .5) * .32;
    var cleft = .29 + treesHash(seed * 61 + 5) * .35;
    var cleftLean = (treesHash(seed * 67 + 9) - .5) * .28;
    var crown = .13 + treesHash(seed * 71 + 11) * .13;
    var hasCrack = treesHash(seed * 73 + 13) < .62;
    var palette = surfaceBoulderColors(), tone = treesHash(seed * 79 + 17) < .3 ? 1 : 0;
    var moss = surfaceBoulderMix(BLD.stoneBase, TREES_GREEN_DARK, .24);
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
      // The front plane continues over the crown. Low-contrast side facets
      // model slate without a separate bright patch laid across the top.
      var shaded = nx > split + ny * splitLean;
      if (ny > .94 - nx * .03) shaded = true;
      var lit = !shaded && ny < crown + nx * .14 && nx < split - .10;
      g.fillStyle = palette[tone + (shaded ? 1 : (lit ? 3 : 2))];
      g.fillRect(x, y, 1, 1);
      // A short, bent hairline and one small split at its foot. Keep most
      // of the face quiet; these are weathered rocks, not faceted jewels.
      var crackX = Math.round(3 + w * (cleft + ny * cleftLean)) + (ny > .44 ? 1 : 0);
      if (hasCrack && ny > .30 && ny < .63 &&
          (x === crackX || (ny > .56 && ny < .62 && x === crackX - 1))) {
        g.fillStyle = palette[tone]; g.fillRect(x, y, 1, 1);
      }
      // A couple of small fracture faces inside the shaded flank add depth
      // without scattering bright pixels or outlining every interior plane.
      if (kind % 3 === 0 && shaded && ny > .54 && ny < .64 && nx > .77 && nx < .86 - ny * .035) {
        g.fillStyle = palette[tone + 2]; g.fillRect(x, y, 1, 1);
      }
      if (seed % 2 && ny > .86 && nx > .14 && nx < .31 - (ny > .93 ? .05 : 0)) {
        g.fillStyle = moss; g.fillRect(x, y, 1, 1);
      }
    }
    return { cv:s.cv, w:s.w, h:s.h, ax:cx, ay:baseY,
      base:palette[tone + 2], shade:palette[tone + 1] };
  }

  function surfaceBoulderSprite(c) {
    if (surfaceBoulderSprites[c]) return surfaceBoulderSprites[c];
    var seed = c * 373 + 19;
    var sizes = [[29,20],[40,14],[35,23],[45,21],[44,15],[33,25],[32,18],[40,24]];
    var kind = Math.floor(treesHash(seed * 11 + 31) * sizes.length), size = sizes[kind];
    var w = Math.round(size[0] * (.82 + treesHash(seed * 83 + 3) * .38));
    var h = Math.round(size[1] * (.80 + treesHash(seed * 89 + 5) * .38));
    return surfaceBoulderSprites[c] = surfaceBoulderBake(w, h, seed);
  }

  function surfaceBoulderSupported(rock) {
    for (var c = rock.cL; c <= rock.cR; c++) {
      var t = tileAt(SKY_ROWS, c);
      if (!t || t === 'wall' || t.type === 'foundation' || treesInPond(c)) return false;
    }
    return true;
  }

  function surfaceBouldersRebuild() {
    surfaceBoulders.length = 0;
    surfaceBoulderWorld = world;
    surfaceBoulderDensity = treesTune.density;
    var lastX = -1e9;
    for (var c = 3; c < COLS - 3; c++) {
      if (ENABLE_BATH && c >= DECK_CENTER_COL + 13 && c <= DECK_CENTER_COL + 23) continue;
      var region = regionAt(c);
      if (!region || region.kind !== REGION_TOWN) continue;
      if (Math.abs(c - townCenterCol(region.townIndex)) < TREES_TOWN_CLEAR - 2) continue;
      // More likely at the edge of a grove, but rare enough to keep clearings.
      if (treesHash(c * 1249 + 617) > .07 + (1 - treesGrove(c)) * .03) continue;
      var spr = surfaceBoulderSprite(c);
      var x = c * TILE + TILE * .5;
      if (x - lastX < TILE * 5) continue;
      var nearTree = false;
      for (var i = treesLowerBound(x - 110); i < TREES.length && TREES[i].x < x + 110; i++) {
        var tree = TREES[i];
        if (Math.abs(tree.x - x) < (spr.w + tree.spr.w) * .5 + 14) { nearTree = true; break; }
      }
      if (nearTree) continue;
      var rock = { x:x, spr:spr, cL:Math.floor((x - spr.ax + 3) / TILE),
        cR:Math.floor((x - spr.ax + spr.w - 4) / TILE), fall:-1, gone:false, dir:1 };
      if (!surfaceBoulderSupported(rock)) continue;
      surfaceBoulders.push(rock); lastX = x;
    }
  }

  function surfaceBoulderPieces(s) {
    if (s.pieces) return s.pieces;
    s.pieces = [];
    // The three jagged slices exactly cover the original sprite. Splitting
    // starts with the same silhouette, without flashing a replacement asset.
    for (var k = 0; k < 3; k++) {
      var piece = treesMakeSprite(s.w, s.h);
      for (var y = 0; y < s.h; y++) {
        var step = Math.floor(y / 4) % 2;
        var a = Math.floor(s.w * .31 + y * .10) + step;
        var b = Math.floor(s.w * .68 - y * .08) + step;
        var left = k === 0 ? 0 : (k === 1 ? a : b);
        var right = k === 0 ? a : (k === 1 ? b : s.w);
        piece.g.drawImage(s.cv, left, y, right - left, 1, left, y, right - left, 1);
      }
      s.pieces.push(piece.cv);
    }
    return s.pieces;
  }

  function surfaceBouldersUpdate(dt) {
    if (!(dt > 0) || !treesBuilt || treesWorldRef !== world) return;
    if (surfaceBoulderWorld !== world || surfaceBoulderDensity !== treesTune.density) surfaceBouldersRebuild();
    var surfaceY = SKY_ROWS * TILE;
    for (var i = 0; i < surfaceBoulders.length; i++) {
      var rock = surfaceBoulders[i];
      if (rock.gone) continue;
      if (rock.fall >= 0) {
        rock.fall += dt;
        if (rock.fall >= SURFACE_BOULDER_LIFE) rock.gone = true;
      } else if (!surfaceBoulderSupported(rock)) {
        // No delayed replay when returning to a stone excavated offscreen.
        if (cam.y > surfaceY + 64 || cam.y + screenH < surfaceY - rock.spr.h ||
            rock.x + rock.spr.w < cam.x || rock.x - rock.spr.w > cam.x + screenW) {
          rock.gone = true; continue;
        }
        var missingX = 0, missing = 0;
        for (var c = rock.cL; c <= rock.cR; c++) {
          if (!tileAt(SKY_ROWS, c)) { missingX += (c + .5) * TILE; missing++; }
        }
        var lean = missing ? missingX / missing - rock.x : 0;
        rock.dir = lean ? (lean > 0 ? 1 : -1) : (treesHash(rock.x + 91) < .5 ? -1 : 1);
        rock.fall = 0;
        surfaceBoulderPieces(rock.spr);
      }
    }
  }

  function drawSurfaceBoulderFall(rock, surfaceY) {
    var s = rock.spr, t = rock.fall, dir = rock.dir;
    ctx.save();
    // Scenery is painted after terrain. Mask the collapse to air so pieces
    // settle into the dug gap instead of being drawn over the remaining soil.
    ctx.beginPath();
    ctx.rect(rock.x - s.w - 20, surfaceY - s.h - 24, s.w * 2 + 40, s.h + 24);
    for (var c = rock.cL - 1; c <= rock.cR + 1; c++) {
      for (var r = SKY_ROWS; r < SKY_ROWS + 3; r++) {
        if (!tileAt(r, c)) ctx.rect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    ctx.clip();
    if (t < SURFACE_BOULDER_SETTLE) {
      var p = t / SURFACE_BOULDER_SETTLE;
      ctx.translate(rock.x + dir * p, surfaceY + p);
      ctx.rotate(dir * .045 * p * p);
      ctx.drawImage(s.cv, -s.ax, -s.ay);
    } else {
      var f = t - SURFACE_BOULDER_SETTLE;
      var pieces = surfaceBoulderPieces(s);
      var alpha = Math.max(0, 1 - Math.max(0, f - .30) / .42);
      for (var k = 0; k < pieces.length; k++) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(rock.x + dir + (dir * 9 + (k - 1) * 7) * f,
          surfaceY + 1 + 110 * f * f + k * f * 2);
        ctx.rotate(dir * .045 + (dir * .16 + (k - 1) * .22) * f);
        ctx.drawImage(pieces[k], -s.ax, -s.ay);
        ctx.restore();
      }
      // Four little chips and three low, faint dust motes. No camera shake,
      // bright flash or sound competing with the player's drilling feedback.
      var baseAlpha = ctx.globalAlpha;
      ctx.globalAlpha = baseAlpha * Math.max(0, 1 - f / .72) * .75;
      for (var j = 0; j < 4; j++) {
        var vx = (j - 1.5) * 12 + dir * 5;
        var cy = surfaceY - 3 - (18 + j * 4) * f + 100 * f * f;
        ctx.fillStyle = j % 2 ? s.shade : s.base;
        ctx.fillRect(Math.round(rock.x + (j - 1.5) * 3 + vx * f), Math.round(cy), 2, j % 2 + 1);
      }
      ctx.fillStyle = s.base;
      for (var d = 0; d < 3; d++) {
        var age = f - d * .045;
        if (age < 0) continue;
        ctx.globalAlpha = baseAlpha * .20 * Math.min(1, age / .06) * Math.max(0, 1 - age / .78);
        var size = 2 + Math.floor(Math.min(1, age * 2) * 3);
        ctx.fillRect(Math.round(rock.x + (d - 1) * (5 + age * 9) + dir * age * 4),
          Math.round(surfaceY - 2 - age * 6), size, size);
      }
    }
    ctx.restore();
  }

  function drawSurfaceBoulders() {
    var surfaceY = SKY_ROWS * TILE;
    if (cam.y >= surfaceY + 80 || cam.y + screenH < surfaceY - 40) return;
    if (!treesBuilt || treesWorldRef !== world) return;
    if (surfaceBoulderWorld !== world || surfaceBoulderDensity !== treesTune.density) surfaceBouldersRebuild();
    var smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < surfaceBoulders.length; i++) {
      var rock = surfaceBoulders[i], s = rock.spr;
      if (rock.x + s.w < cam.x) continue;
      if (rock.x - s.w > cam.x + screenW) break;
      if (rock.gone) continue;
      if (rock.fall >= 0) drawSurfaceBoulderFall(rock, surfaceY);
      else ctx.drawImage(s.cv, Math.round(rock.x - s.ax), surfaceY - s.ay);
    }
    ctx.imageSmoothingEnabled = smoothing;
  }
