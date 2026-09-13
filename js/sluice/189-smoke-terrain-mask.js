  // Cache the smoke mask's static terrain in world space. Replaying hundreds
  // of Canvas tile/contour draws on every pan caused missed display refreshes
  // even when JavaScript finished well inside the frame budget. Water and
  // moving bodies still update separately at their existing cadence.
  var smokeTerrainMask = null;
  var smokeTerrainMaskBuilds = 0;
  function smokeTerrainMaskPaint(oc, domainX, domainY, sxScale, syScale) {
    // A zoom changes the sampling scale every frame. Use the direct painter
    // during that short transition instead of repeatedly allocating bitmaps.
    if (worldScale !== targetWorldScale) return false;
    // Keep the direct edge coverage at the world's hard side/bottom limits.
    // A filtered cached tile edge can otherwise leave isolated half-covered
    // pixels where the mask meets a completely empty off-world column.
    if (domainX < 0 || domainX + smokeFluidDomainWorldW > COLS * TILE ||
        domainY + smokeFluidDomainWorldH > TOTAL_ROWS * TILE) return false;
    var step = 4;
    var c0 = Math.floor(domainX / (TILE * step)) * step - 2;
    var r0 = Math.floor(domainY / (TILE * step)) * step - 2;
    var cols = Math.ceil(smokeFluidDomainWorldW / TILE) + step + 5;
    var rows = Math.ceil(smokeFluidDomainWorldH / TILE) + step + 5;
    var c1 = c0 + cols - 1, r1 = r0 + rows - 1;
    // Twice the destination mask's density limits extra edge filtering when
    // the cached image follows the camera at fractional pixel positions.
    var sx = sxScale * 2, sy = syScale * 2;
    var w = Math.ceil(cols * TILE * sx), h = Math.ceil(rows * TILE * sy);
    if (!(w > 0 && h > 0) || w > 4096 || h > 4096 || cols * rows > 65536) return false;
    var left = Math.max(0, c0), right = Math.min(COLS - 1, c1);
    var path = buildVoidContourPath(r0, r1, left, right);
    var m = smokeTerrainMask;
    var changed = !m || m.c0 !== c0 || m.r0 !== r0 || m.cols !== cols ||
      m.rows !== rows || m.sx !== sxScale || m.sy !== syScale || m.path !== path;
    if (!m) {
      var cv = document.createElement('canvas');
      var mc = cv.getContext('2d');
      if (!mc) return false;
      m = smokeTerrainMask = { canvas: cv, ctx: mc };
    }
    if (!m.cells || m.cells.length !== cols * rows) {
      m.cells = new Uint8Array(cols * rows);
      changed = true;
    }
    // Compare actual coverage, including the backing of empty edge cells.
    // This catches mining, bombs, save loads and direct dev edits without
    // relying on every terrain writer calling a particular invalidation hook.
    var i = 0, hasVoids = false;
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var t = tileAt(r, c);
        var filled = t != null && t !== 'wall' ? 1 :
          t === null && dominantVoidBackingKind(r, c) ? 2 : 0;
        if (filled === 2) hasVoids = true;
        if (m.cells[i] !== filled) { m.cells[i] = filled; changed = true; }
        i++;
      }
    }
    var x = c0 * TILE, y = r0 * TILE;
    if (changed) {
      m.c0 = c0; m.r0 = r0; m.cols = cols; m.rows = rows;
      m.sx = sxScale; m.sy = syScale; m.path = path;
      if (m.canvas.width !== w) m.canvas.width = w;
      if (m.canvas.height !== h) m.canvas.height = h;
      var mc = m.ctx;
      mc.setTransform(1, 0, 0, 1, 0, 0);
      mc.clearRect(0, 0, w, h);
      mc.fillStyle = '#000';
      i = 0;
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          if (m.cells[i++]) mc.fillRect((c * TILE - x) * sx, (r * TILE - y) * sy, TILE * sx, TILE * sy);
        }
      }
      if (hasVoids) {
        mc.save();
        mc.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
        mc.globalCompositeOperation = 'destination-out';
        mc.fill(path);
        if (r0 <= SKY_ROWS && r1 >= SKY_ROWS) {
          var oldCtx = ctx;
          try { ctx = mc; drawSurfaceVoidMouths(left, right); }
          finally { ctx = oldCtx; }
        }
        mc.restore();
      }
      smokeTerrainMaskBuilds++;
    }
    oc.save();
    oc.imageSmoothingEnabled = true;
    oc.drawImage(m.canvas, (x - domainX) * sxScale, (y - domainY) * syScale,
      m.canvas.width / 2, m.canvas.height / 2);
    oc.restore();
    return true;
  }
