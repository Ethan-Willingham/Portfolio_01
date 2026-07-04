  // ====== LIGHTING / FOG OF WAR (connectivity reveal) ======
  // The world starts dark. A cell is "lit" only if it is open space (air) with
  // a path to the surface through other open space — so the surface and every
  // tunnel/cave the miner has connected to it are revealed, while sealed
  // pockets stay black until a drill breaks through to them. This is pure
  // connectivity, NOT Terraria's light-decay: anything connected to the surface
  // is FULLY lit, and stays lit forever (the world only ever opens up, so the
  // lit set is monotonic — a cell never goes dark once revealed).
  //
  // Storage: lightArr[r*lightCols + c] === 1 marks a lit AIR cell. Solid tiles
  // are never stored; at draw time a solid tile is shaded by how deep it sits
  // from the nearest lit air cell, so you see 'reach' rock blocks past the lit
  // edge: the rock/ore faces lining your tunnels, plus a dimmer ring beyond.
  // Everything else is painted dark by drawDarknessOverlay().
  //
  // Hooks (grep these): lightingInit() runs in init() after generateWorld();
  // lightingOnClear() runs at the end of markTerrainCleared() (covers drill,
  // bombs, and jello tiles that dissolve during jelloCheckActivation);
  // drawDarknessOverlay() runs in render() after the world entities.

  // Live-tunable look — registered as the 'light' group in the GM facade
  // (toggle the panel with L, or gm.set('light.darkAlpha', 0.8) in console).
  var lightTune = {
    enabled: 1,        // 0 disables the overlay entirely (whole world visible)
    darkAlpha: 1,      // opacity of a fully-hidden cell (1 = pure black)
    soft: 1,           // 1 = smooth ~1-tile gradient edge; 0 = crisp tile steps
    reach: 1.5         // how many rock blocks you see past the lit edge; the
                       // fractional part dims the last ring (1.5 = 2nd ring @ 50%)
  };

  var lightArr = null;     // Uint8Array, 1 = lit air cell; sized TOTAL_ROWS*lightCols
  var lightCols = 0;       // COLS captured at alloc time (row stride for lightArr)

  // Iterative flood over 4-connected AIR cells, marking each lit. The stack
  // holds flat indices; the lit bit gates re-entry so every cell is visited at
  // most once ever — breaking into a large cavern is a one-time cost, then free.
  function lightFlood(stack) {
    lightRev++;   // v25.40: the fog overlay caches on this (flood = the only lightArr writer)
    var arr = lightArr, cols = lightCols, rows = TOTAL_ROWS;
    while (stack.length) {
      var idx = stack.pop();
      var r = (idx / cols) | 0;
      var c = idx - r * cols;
      if (r > 0)        { var iu = idx - cols; if (!arr[iu] && tileAt(r - 1, c) === null) { arr[iu] = 1; stack.push(iu); } }
      if (r < rows - 1) { var idn = idx + cols; if (!arr[idn] && tileAt(r + 1, c) === null) { arr[idn] = 1; stack.push(idn); } }
      if (c > 0)        { var il = idx - 1;     if (!arr[il] && tileAt(r, c - 1) === null) { arr[il] = 1; stack.push(il); } }
      if (c < cols - 1) { var ir = idx + 1;     if (!arr[ir] && tileAt(r, c + 1) === null) { arr[ir] = 1; stack.push(ir); } }
    }
  }

  // Build the initial lit set: the open sky is lit, and the flood spills down
  // through any open space already connected to it (surface gaps, cave mouths).
  // Called from init() once the world array exists.
  function lightingInit() {
    lightCols = COLS;
    lightArr = new Uint8Array(TOTAL_ROWS * COLS);
    var seeds = [];
    // Row 0 is open sky across the whole world; seed every air cell in it and
    // let the flood fill the rest of the sky band and any surface openings.
    for (var c = 0; c < COLS; c++) {
      if (tileAt(0, c) === null) { lightArr[c] = 1; seeds.push(c); }
    }
    lightFlood(seeds);
  }

  // A cell at (r,c) just became air (drilled, bombed, or a dissolved jello
  // tile). If it now touches the lit region — or sits in the open sky band —
  // light it and flood into whatever open space it just connected. Otherwise it
  // stays dark until a later dig opens a path to the surface. Idempotent.
  function lightingOnClear(r, c) {
    if (!lightArr || r < 0 || r >= TOTAL_ROWS || c < 0 || c >= lightCols) return;
    var idx = r * lightCols + c;
    if (lightArr[idx]) return;                        // already lit
    lightRev++;   // v25.40: even an UNCONNECTED clear changes the fog (graded
                  // solid -> full-dark air), so the cached overlay must rebuild
    var connected = (r < SKY_ROWS);                   // open sky is always lit
    if (!connected) {
      if (r > 0 && lightArr[idx - lightCols]) connected = true;
      else if (r < TOTAL_ROWS - 1 && lightArr[idx + lightCols]) connected = true;
      else if (c > 0 && lightArr[idx - 1]) connected = true;
      else if (c < lightCols - 1 && lightArr[idx + 1]) connected = true;
    }
    if (!connected) return;
    lightArr[idx] = 1;
    lightFlood([idx]);
  }

  // Is there a lit AIR cell exactly d tiles away (Chebyshev) from (r,c)? Scans
  // only the square ring at radius d; the interior was covered by smaller d. A
  // set lightArr bit always means air, so no tile lookup is needed here.
  function litRingHit(r, c, d) {
    var rows = TOTAL_ROWS, cols = lightCols, arr = lightArr;
    var top = r - d, bot = r + d, lft = c - d, rgt = c + d;
    for (var cc = lft; cc <= rgt; cc++) {             // top + bottom edges
      if (cc < 0 || cc >= cols) continue;
      if (top >= 0 && arr[top * cols + cc]) return true;
      if (bot < rows && arr[bot * cols + cc]) return true;
    }
    for (var rr = top + 1; rr <= bot - 1; rr++) {     // left + right edges
      if (rr < 0 || rr >= rows) continue;
      if (lft >= 0 && arr[rr * cols + lft]) return true;
      if (rgt < cols && arr[rr * cols + rgt]) return true;
    }
    return false;
  }

  // Darkness for the cell at (r,c): 0 = fully visible, 1 = fully hidden. Lit air
  // is 0; an unlit air cell (a still-sealed pocket) is 1, so caves stay secret
  // until breached. A solid tile is graded by its Chebyshev distance d to the
  // nearest lit air: the first rock ring (d=1) is always full, and reveal fades
  // to dark at distance 'reach' (reach 1.5 => the 2nd ring sits at 50%). The
  // open sky above the world (r<0) is always visible.
  function lightCellShade(r, c) {
    if (r < 0) return 0;
    if (r >= TOTAL_ROWS || c < 0 || c >= lightCols) return 1;
    if (tileAt(r, c) === null) return lightArr[r * lightCols + c] ? 0 : 1;
    var reach = lightTune.reach; if (!(reach >= 1)) reach = 1;
    var maxD = Math.ceil(reach);
    for (var d = 1; d <= maxD; d++) {
      if (litRingHit(r, c, d)) {
        var dark = d - reach;                         // d=1, reach>=1 => <=0 (full)
        return dark <= 0 ? 0 : (dark >= 1 ? 1 : dark);
      }
    }
    return 1;
  }

  // The darkness overlay. Build a 1-texel-per-tile alpha map over the visible
  // range (0 = visible, darkAlpha = hidden), then blit it up to world scale.
  // With smoothing on, the bilinear upscale yields a ~1-tile soft gradient at
  // every lit/dark boundary; with it off the edge is crisp tile steps. RGB is
  // 0 everywhere so only the alpha is interpolated — no colour fringing.
  var lightFogCanvas = null, lightFogCtx = null, lightFogImg = null;
  var lightRev = 0;        // bumped by lightFlood — the only lightArr writer
  var lightFogSig = '';    // v25.40: the fog IMAGE rebuilds only when this changes
  function drawDarknessOverlay(startRow, endRow, startCol, endCol) {
    if (!lightTune.enabled || !lightArr) return;
    var pad = 1;                                      // 1-tile margin: gradient blends in from off-screen
    var c0 = startCol - pad, r0 = startRow - pad;
    var bw = (endCol - startCol + 1) + pad * 2;
    var bh = (endRow - startRow + 1) + pad * 2;
    if (bw <= 0 || bh <= 0) return;
    if (!lightFogCanvas) {
      lightFogCanvas = document.createElement('canvas');
      lightFogCtx = lightFogCanvas.getContext('2d');
    }
    if (lightFogCanvas.width !== bw || lightFogCanvas.height !== bh || !lightFogImg) {
      lightFogCanvas.width = bw; lightFogCanvas.height = bh;
      lightFogImg = lightFogCtx.createImageData(bw, bh);
      lightFogSig = '';                               // realloc wiped the pixels: force a rebuild
    }
    var a = Math.round(255 * (lightTune.darkAlpha < 0 ? 0 : (lightTune.darkAlpha > 1 ? 1 : lightTune.darkAlpha)));
    // The per-cell shade scan (~900 cells x up-to-reach ring probes) + the
    // putImageData ran EVERY frame underground, ~all of it for an unchanged
    // view (harness: the biggest unbucketed slice of the deep-idle frame).
    // The fog only changes when the view window shifts a whole tile, the lit
    // grid gains cells (lightRev — lightFlood is the only writer), or the
    // levers move; rebuild exactly then. The blit below still runs per frame
    // (the main canvas is cleared each frame).
    var sig = c0 + ',' + r0 + ',' + bw + ',' + bh + ',' + lightRev + ',' + a + ',' + lightTune.reach;
    if (sig !== lightFogSig) {
      lightFogSig = sig;
      var data = lightFogImg.data;
      var p = 0;
      for (var j = 0; j < bh; j++) {
        var rr = r0 + j;
        for (var i = 0; i < bw; i++) {
          data[p] = 0; data[p + 1] = 0; data[p + 2] = 0;
          var sh = lightCellShade(rr, c0 + i);
          data[p + 3] = sh <= 0 ? 0 : (sh >= 1 ? a : Math.round(a * sh));
          p += 4;
        }
      }
      lightFogCtx.putImageData(lightFogImg, 0, 0);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = !!lightTune.soft;
    ctx.drawImage(lightFogCanvas, c0 * TILE, r0 * TILE, bw * TILE, bh * TILE);
    ctx.restore();
  }
