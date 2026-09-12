  // Water is a separate DOM canvas above the terrain. Its visible contact
  // must use the cave's carved outline, not the square physics tile mask.
  // Keep this bitmap anchored to tiles and reuse it while the camera moves
  // inside the same window. The shared contour cache detects all tile edits.
  var liquidTerrainRender = null;
  function liquidTerrainRenderMask() {
    var c0 = Math.floor(cam.x / TILE) - 2;
    var c1 = Math.ceil((cam.x + viewW / worldScale) / TILE) + 2;
    var r0 = Math.floor(cam.y / TILE) - 2;
    var r1 = Math.ceil((cam.y + viewH / worldScale) / TILE) + 2;
    var path = buildVoidContourPath(Math.max(SKY_ROWS, r0), r1, c0, c1);
    var m = liquidTerrainRender;
    if (!m) {
      var cv = document.createElement('canvas');
      m = liquidTerrainRender = { canvas: cv, ctx: cv.getContext('2d'), revision: 0 };
    }
    if (m.path === path && m.c0 === c0 && m.r0 === r0 && m.c1 === c1 && m.r1 === r1) return m;
    m.path = path; m.c0 = c0; m.r0 = r0; m.c1 = c1; m.r1 = r1;
    m.x = c0 * TILE; m.y = r0 * TILE;
    var w = (c1 - c0 + 1) * TILE, h = (r1 - r0 + 1) * TILE;
    m.openPath = new Path2D(path);
    if (m.y < SKY_ROWS * TILE) m.openPath.rect(m.x, m.y, w, SKY_ROWS * TILE - m.y);
    if (r0 <= SKY_ROWS && r1 >= SKY_ROWS) m.openPath.addPath(buildSurfaceVoidMouthPath(c0, c1));
    // One texel per world pixel, independent of display DPR and zoom.
    if (m.canvas.width !== w) m.canvas.width = w;
    if (m.canvas.height !== h) m.canvas.height = h;
    var mc = m.ctx;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, w, h);
    mc.save();
    mc.translate(-m.x, -m.y);
    mc.fillStyle = '#000';
    mc.fillRect(m.x, m.y, w, h);
    mc.globalCompositeOperation = 'destination-out';
    mc.fill(m.openPath);
    mc.restore();
    m.revision++;
    return m;
  }

  var liquidGLTerrainTexture = null, liquidGLTerrainRevision = -1;
  var liquidGLTerrainLoc = null, liquidGLTerrainRectLoc = null, liquidGLTerrainViewLoc = null;
  function liquidGLBindTerrain(gl) {
    var m = liquidTerrainRenderMask();
    if (!liquidGLTerrainTexture) {
      liquidGLTerrainTexture = gl.createTexture();
      liquidGLTerrainLoc = gl.getUniformLocation(liquidGLProgram, 'u_terrain');
      liquidGLTerrainRectLoc = gl.getUniformLocation(liquidGLProgram, 'u_terrainRect');
      liquidGLTerrainViewLoc = gl.getUniformLocation(liquidGLProgram, 'u_terrainView');
      gl.bindTexture(gl.TEXTURE_2D, liquidGLTerrainTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, liquidGLTerrainTexture);
    if (liquidGLTerrainRevision !== m.revision) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.canvas);
      liquidGLTerrainRevision = m.revision;
    }
    gl.uniform1i(liquidGLTerrainLoc, 0);
    gl.uniform4f(liquidGLTerrainRectLoc, m.x, m.y, 1 / m.canvas.width, 1 / m.canvas.height);
    gl.uniform4f(liquidGLTerrainViewLoc, cam.x, cam.y, 1 / (dpr * worldScale), canvas.height);
  }

  function liquidCanvasClipTerrain() {
    var m = liquidTerrainRenderMask();
    ctx.clip(m.openPath);
  }
