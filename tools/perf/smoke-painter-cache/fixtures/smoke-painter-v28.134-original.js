// Frozen actual v28.134 smoke painter/state, before prefix and empty-alpha edits.
// Full source SHA256: a9e76887042be5eb9af7299d73ff0e6f6c133ad2f4107985844aaa126e3947f2
// Extraction provenance is recorded in smoke-painter-provenance.json.
  var smokeObstWaterBins = null;     // continuous particle density, reused on repaint
  var smokeObstWaterVY = null;       // density-weighted falling-water velocity
  var smokeObstWaterCanvas = null, smokeObstWaterCtx = null, smokeObstWaterImage = null;
  var smokeObstWaterCache = null;
  // Fast water entrains (frozen state extraction boundary).
  function smokeFluidPaintObstacle() {
    smokeObstDbgPaints++;
    if (!smokeFluidActive) return;
    if (isMobile) {
      smokeFluidPaintObstacleGL();
      return;
    }
    var _opd0 = performance.now();
    var oc = smokeFluidObstacleCtx;
    var ow = smokeFluidObstacleW, oh = smokeFluidObstacleH;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, ow, oh);
    var domainX = cam.x - smokeFluidMarginWorldX;
    var domainY = cam.y - smokeFluidMarginWorldY;
    var sxScale = ow / smokeFluidDomainWorldW;
    var syScale = oh / smokeFluidDomainWorldH;
    var startCol = Math.max(0, Math.floor(domainX / TILE) - 1);
    var endCol = Math.min(COLS - 1, Math.floor((domainX + smokeFluidDomainWorldW) / TILE) + 1);
    var startRow = Math.floor(domainY / TILE) - 1;
    var endRow = Math.floor((domainY + smokeFluidDomainWorldH) / TILE) + 1;

    var _terrainMaskT = performance.now();
    if (!smokeTerrainMaskPaint(oc, domainX, domainY, sxScale, syScale)) {
      // Pass 1, opaque coverage for every tile that has any visual material.
      // Use sub-pixel positions (no Math.floor) so the obstacle edge moves
      // continuously with the camera. If we snapped to integer pixels here,
      // the obstacle would jump in 1-pixel increments while the dye texture
      // scrolls at full sub-pixel precision, and the advection shader (which
      // zeros dye inside obstacles) would chew through smoke at the boundary
      // every frame the camera was moving.
      oc.fillStyle = '#000';
      var voidCarveTiles = [];
      var tileW = TILE * sxScale;
      var tileH = TILE * syScale;
      for (var r = startRow; r <= endRow; r++) {
        for (var c = startCol; c <= endCol; c++) {
          var t = tileAt(r, c);
          if (t != null && t !== 'wall') {
            oc.fillRect((c * TILE - domainX) * sxScale, (r * TILE - domainY) * syScale, tileW, tileH);
          } else if (t === null) {
            if (dominantVoidBackingKind(r, c)) {
              oc.fillRect((c * TILE - domainX) * sxScale, (r * TILE - domainY) * syScale, tileW, tileH);
              voidCarveTiles.push(r, c);
            }
          }
        }
      }

      // Pass 2, carve out the cave interior using the SAME contour path the
      // visual renderer fills. One destination-out fill subtracts every cave
      // polygon at once, guaranteeing collision matches the visible boundary.
      if (voidCarveTiles.length) {
        oc.save();
        oc.setTransform(sxScale, 0, 0, syScale, -domainX * sxScale, -domainY * syScale);
        oc.globalCompositeOperation = 'destination-out';
        oc.fillStyle = '#000';
        var voidPath = buildVoidContourPath(startRow, endRow, startCol, endCol);
        oc.fill(voidPath);
        if (startRow <= SKY_ROWS && endRow >= SKY_ROWS) {
          var oldCtx = ctx;
          ctx = oc;
          drawSurfaceVoidMouths(startCol, endCol);
          ctx = oldCtx;
        }
        oc.globalCompositeOperation = 'source-over';
        oc.restore();
      }

    }
    perfMark('update.smokeTerrain', _terrainMaskT);

    // Pass 3, live jello bodies are solid obstacles too, so the diesel smoke
    // flows AROUND a gel cube instead of straight through it. Fill each visible
    // body's boundary ring (source-over, opaque) in world space, the ring is a
    // fixed-topology polygon that deforms with the cube, so the obstacle tracks
    // the squish exactly. Cheap (one ~32-vertex fill per on-screen cube).
    if (!smokeDriver.setMovingBodies && jelloBodies.length) {
      oc.save();
      oc.setTransform(sxScale, 0, 0, syScale, -domainX * sxScale, -domainY * syScale);
      oc.fillStyle = '#000';
      var domR = domainX + smokeFluidDomainWorldW, domB = domainY + smokeFluidDomainWorldH;
      for (var jb = 0; jb < jelloBodies.length; jb++) {
        var jbody = jelloBodies[jb];
        if (jbody.ringN < 3) continue;
        // v26.02: bath guests are NOT smoke obstacles. A soaker's ring at
        // the waterline zeroed the fog dye around it, punching moving
        // holes between the steam and the water (the owner's "blocks of
        // air"). Slimes are translucent gel; the fog may drift over them.
        if (jbody.guest) continue;
        if (jbody.bboxR < domainX || jbody.bboxL > domR ||
            jbody.bboxB < domainY || jbody.bboxT > domB) continue;
        var jring = jbody.ring, jpx = jbody.px, jpy = jbody.py;
        oc.beginPath();
        oc.moveTo(jpx[jring[0]], jpy[jring[0]]);
        for (var jri = 1; jri < jbody.ringN; jri++) oc.lineTo(jpx[jring[jri]], jpy[jring[jri]]);
        oc.closePath();
        oc.fill();
      }
      oc.restore();
    }

    // The rig material shares terrain, but water enters its live coupling
    // field instead of deleting dye through the ambient smoke's water mask.
    if (rigExhaustFluid && rigExhaustNeedsStep())
      rigExhaustFluid.setObstacleAlpha(smokeFluidObstacleCanvas);

    // Pass 4: water still blocks smoke using the asynchronous CPU mirror.
    // Reconstruct a continuous density mask instead of switching whole 8 px
    // squares between clear, rim and solid. Those switches punched visible
    // dark blue rectangles out of smoke over the water (v26.120).
    // Never read the WebGPU water canvas here: before render it is cleared,
    // and after render it forces a GPU sync. Bath fog still hugs its surface;
    // the mobile quad path still skips water, as before.
    if (SMOKE_WATER_OBSTACLE && liquidCount > 0 &&
        !(typeof bathMode !== 'undefined' && bathMode)) {
      smokeObstDbgStamps++;
      var BIN = 4;                                     // world px per sample
      // Anchor samples to the world so camera motion cannot reshuffle them.
      // The padding includes the quadratic kernel beyond the visible domain.
      // A padded 64 px window keeps the same world samples while the camera
      // moves within it. Drawing still follows the camera at full precision.
      var windowStep = 64;
      var originX = Math.floor(domainX / windowStep) * windowStep - BIN * 2;
      var originY = Math.floor(domainY / windowStep) * windowStep - BIN * 2;
      var binsW = (Math.ceil((domainX + smokeFluidDomainWorldW) / windowStep) * windowStep - originX) / BIN + 2;
      var binsH = (Math.ceil((domainY + smokeFluidDomainWorldH) / windowStep) * windowStep - originY) / BIN + 2;
      var nBins = binsW * binsH;
      var gpu = typeof liquidWGPU !== 'undefined' && liquidWGPU;
      var canCache = gpu && gpu.simActive && typeof gpu.readbackApplyGen === 'number' &&
        typeof liquidMutationSeq === 'number';
      var cached = smokeObstWaterCache;
      var reuse = canCache && cached && cached.gpu === gpu &&
        cached.gen === gpu.readbackApplyGen && cached.seq === liquidMutationSeq &&
        cached.count === liquidCount && cached.x === liquidX && cached.y === liquidY &&
        cached.vy === liquidVY && cached.ox === originX && cached.oy === originY &&
        cached.w === binsW && cached.h === binsH && cached.flow === SMOKE_WATER_FLOW_MIN_VY;
      // Freeze/wake runs on the CPU between GPU readbacks. A wake also zeros
      // velocity, so check these flags before reusing that mirror's image.
      if (reuse) {
        for (var fi = 0; fi < liquidCount; fi++) {
          if (cached.frozen[fi] !== liquidFrozen[fi]) { reuse = false; break; }
        }
      }
      if (!reuse) {
        if (!smokeObstWaterBins || smokeObstWaterBins.length < nBins) {
          smokeObstWaterBins = new Float32Array(Math.max(nBins, 16384));
          smokeObstWaterVY = new Float32Array(smokeObstWaterBins.length);
        }
        var bins = smokeObstWaterBins;
        bins.fill(0, 0, nBins);
        smokeObstWaterVY.fill(0, 0, nBins);
        var domR = originX + (binsW - 1.5) * BIN;
        var domB = originY + (binsH - 1.5) * BIN;
        for (var wi = 0; wi < liquidCount; wi++) {
          if (liquidFrozen[wi]) continue;
          var wx = liquidX[wi], wy = liquidY[wi];
          if (wx < originX + BIN || wx >= domR || wy < originY + BIN || wy >= domB) continue;
          var gx = (wx - originX) / BIN, gy = (wy - originY) / BIN;
          var ix = Math.floor(gx - 0.5), iy = Math.floor(gy - 0.5);
          var fx = gx - ix, fy = gy - iy;
          // Quadratic B-spline weights sum to one and have continuous slopes.
          // Nine deposits per particle, with no per-particle allocations.
          var x0 = 0.5 * (1.5 - fx) * (1.5 - fx);
          var x1 = 0.75 - (fx - 1) * (fx - 1);
          var x2 = 0.5 * (fx - 0.5) * (fx - 0.5);
          for (var ky = 0; ky < 3; ky++) {
            var yw = ky === 0 ? 0.5 * (1.5 - fy) * (1.5 - fy) :
              ky === 1 ? 0.75 - (fy - 1) * (fy - 1) : 0.5 * (fy - 0.5) * (fy - 0.5);
            var bi = (iy + ky) * binsW + ix;
            var w0 = x0 * yw, w1 = x1 * yw, w2 = x2 * yw;
            bins[bi] += w0; bins[bi + 1] += w1; bins[bi + 2] += w2;
            smokeObstWaterVY[bi] += liquidVY[wi] * w0;
            smokeObstWaterVY[bi + 1] += liquidVY[wi] * w1;
            smokeObstWaterVY[bi + 2] += liquidVY[wi] * w2;
          }
        }
        if (!smokeObstWaterCanvas) {
          smokeObstWaterCanvas = document.createElement('canvas');
          smokeObstWaterCtx = smokeObstWaterCanvas.getContext('2d');
        }
        if (!smokeObstWaterImage || smokeObstWaterCanvas.width !== binsW || smokeObstWaterCanvas.height !== binsH) {
          smokeObstWaterCanvas.width = binsW; smokeObstWaterCanvas.height = binsH;
          smokeObstWaterImage = smokeObstWaterCtx.createImageData(binsW, binsH);
        }
        var rgba = smokeObstWaterImage.data;
        // Same density range as the old 10..24 particles per 8x8 bin, scaled
        // by area. Pools remain solid; the rim changes continuously. Floating
        // counts also avoid the old 255-count saturation under compression.
        for (var bi = 0; bi < nBins; bi++) {
          var bn = bins[bi];
          var coverage = Math.max(0, Math.min(1, (bn - 2.5) / 3.5));
          coverage *= coverage * (3 - 2 * coverage);
          var falling = bn > 0 ? Math.max(0, Math.min(1,
            (smokeObstWaterVY[bi] / bn - SMOKE_WATER_FLOW_MIN_VY) / 20)) : 0;
          falling *= falling * (3 - 2 * falling);
          rgba[bi * 4 + 3] = Math.round(255 * coverage * (1 - 0.6 * falling));
        }
        smokeObstWaterCtx.putImageData(smokeObstWaterImage, 0, 0);
        if (canCache) {
          var frozenCopy = cached && cached.frozen.length === liquidCount ? cached.frozen : new Uint8Array(liquidCount);
          for (var fi = 0; fi < liquidCount; fi++) frozenCopy[fi] = liquidFrozen[fi];
          smokeObstWaterCache = { gpu: gpu, gen: gpu.readbackApplyGen, seq: liquidMutationSeq,
            count: liquidCount, x: liquidX, y: liquidY, vy: liquidVY, frozen: frozenCopy,
            ox: originX, oy: originY, w: binsW, h: binsH, flow: SMOKE_WATER_FLOW_MIN_VY };
        } else smokeObstWaterCache = null;
      }
      oc.save();
      oc.imageSmoothingEnabled = true;
      // A density sample is at a pixel's centre, hence the half-cell offset.
      oc.drawImage(smokeObstWaterCanvas,
        (originX - BIN * 0.5 - domainX) * sxScale, (originY - BIN * 0.5 - domainY) * syScale,
        binsW * BIN * sxScale, binsH * BIN * syScale);
      oc.restore();
      smokeObstDbgSrc = 'mirror';
    }

    perfMark('update.smokeObstacleDraw', _opd0);
    var _opu0 = performance.now();
    smokeDriver.setObstacleAlpha(smokeFluidObstacleCanvas);
    perfMark('update.smokeObstacleUpload', _opu0);
  }

  // Hand the strongest downward water motion (frozen painter extraction boundary).
