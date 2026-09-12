  // Mountain geometry is static. Triangulate it once, then let the GPU move
  // and light it. Large compound Canvas paths otherwise rasterize on Chrome's
  // GPU-process CPU thread every frame. The Canvas renderer remains the fallback.
  var mtnGPU = null, mtnGPUFailed = false, MTN_GPU_ENABLED = true;
  var MTN_GPU_SUPERSAMPLE = 1;

  function MtnRecordedPath() { this.lines = []; this.line = null; }
  MtnRecordedPath.prototype.moveTo = function (x, y) {
    this.line = [[x, y]]; this.lines.push(this.line);
  };
  MtnRecordedPath.prototype.lineTo = function (x, y) { this.line.push([x, y]); };
  MtnRecordedPath.prototype.closePath = function () {};

  function mtnCross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function mtnTriangle(out, a, b, c) {
    out.push(a[0], a[1], b[0], b[1], c[0], c[1]);
  }
  function mtnTriangulate(out, points) {
    if (points.length < 3) return;
    var area = 0, order = [], i;
    for (i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      area += a[0] * b[1] - b[0] * a[1]; order.push(i);
    }
    if (area < 0) order.reverse();
    while (order.length > 3) {
      var found = false;
      for (i = 0; i < order.length; i++) {
        var a = points[order[(i + order.length - 1) % order.length]];
        var b = points[order[i]], c = points[order[(i + 1) % order.length]];
        if (mtnCross(a, b, c) <= 1e-9) continue;
        var inside = false;
        for (var j = 0; j < order.length; j++) {
          var p = points[order[j]];
          if (p === a || p === b || p === c) continue;
          if (mtnCross(a, b, p) >= -1e-9 && mtnCross(b, c, p) >= -1e-9 &&
              mtnCross(c, a, p) >= -1e-9) { inside = true; break; }
        }
        if (inside) continue;
        mtnTriangle(out, a, b, c); order.splice(i, 1); found = true; break;
      }
      if (!found) throw new Error('Mountain polygon could not be triangulated');
    }
    mtnTriangle(out, points[order[0]], points[order[1]], points[order[2]]);
  }

  // Opaque segment rectangles and miter wedges have the same butt caps and
  // miter limit as Canvas. MSAA coverage is resolved after all overlaps.
  function mtnStrokeTriangles(out, pts, width) {
    var half = width * 0.5, previous = null;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy); if (len < 1e-9) continue;
      dx /= len; dy /= len;
      var nx = -dy * half, ny = dx * half;
      var al = [a[0] + nx, a[1] + ny], ar = [a[0] - nx, a[1] - ny];
      var bl = [b[0] + nx, b[1] + ny], br = [b[0] - nx, b[1] - ny];
      mtnTriangle(out, al, ar, bl); mtnTriangle(out, ar, br, bl);
      if (previous) {
        var cross = previous.dx * dy - previous.dy * dx;
        var sign = cross > 0 ? -1 : 1;
        var l = [a[0] + previous.nx * sign, a[1] + previous.ny * sign];
        var r = [a[0] + nx * sign, a[1] + ny * sign];
        var denom = 1 + previous.dx * dx + previous.dy * dy;
        var mx = denom > 1e-9 ? (previous.nx + nx) * sign / denom : Infinity;
        var my = denom > 1e-9 ? (previous.ny + ny) * sign / denom : Infinity;
        if (mx * mx + my * my <= half * half * 100) {
          var tip = [a[0] + mx, a[1] + my];
          mtnTriangle(out, a, l, tip); mtnTriangle(out, a, tip, r);
        } else mtnTriangle(out, a, l, r);
      }
      previous = { dx: dx, dy: dy, nx: nx, ny: ny };
    }
  }

  function initMtnGPU() {
    if (mtnGPUFailed) return null;
    if (mtnGPU) return mtnGPU;
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl2', { alpha: true, antialias: true, depth: false, stencil: false });
    if (!gl) { mtnGPUFailed = true; return null; }
    function shader(type, text) {
      var s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('Mountain shader'); }
      return s;
    }
    try {
      var vs = shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 pos;uniform vec2 size;uniform vec2 shift;uniform float scale;void main(){vec2 p=pos*scale+shift;gl_Position=vec4(p.x/size.x*2.0-1.0,1.0-p.y/size.y*2.0,0,1);}');
      var fs = shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;uniform vec3 color;out vec4 pixel;void main(){pixel=vec4(color,1);}');
      var program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, 'pos'); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Mountain program');
      mtnGPU = { gl: gl, canvas: c, program: program, layers: {}, lights: gl.createBuffer(),
        maxSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        size: gl.getUniformLocation(program, 'size'), shift: gl.getUniformLocation(program, 'shift'),
        scale: gl.getUniformLocation(program, 'scale'), color: gl.getUniformLocation(program, 'color') };
      c.addEventListener('webglcontextlost', function (event) { event.preventDefault(); mtnGPUFailed = true; });
      c.addEventListener('webglcontextrestored', function () { mtnGPU = null; mtnGPUFailed = false; });
      return mtnGPU;
    } catch (error) { mtnGPUFailed = true; return null; }
  }

  function mtnGPULayer(renderer, cfg) {
    var first = Math.floor((cam.x * (1 - cfg.parallax) - cfg.step * 2) / cfg.step);
    var last = Math.ceil((cam.x * (1 - cfg.parallax) + screenW + cfg.step * 2) / cfg.step);
    var baseY = SKY_ROWS * TILE + (cfg.baseYOffset || 0), gl = renderer.gl;
    var old = renderer.layers[cfg.seed];
    if (old && old.first <= first && old.last >= last && old.baseY === baseY) return old;
    first -= MTN_CACHE_MARGIN; last += MTN_CACHE_MARGIN;
    var paths = buildMtnPeakPaths(cfg, baseY, first, last, MtnRecordedPath);
    var layer = { first: first, last: last, baseY: baseY, batches: {} };
    var names = ['body', 'snow', 'rim', 'left', 'right', 'snowLeft', 'snowRight'];
    for (var i = 0; i < names.length; i++) {
      var name = names[i], tris = [], lines = paths[name].lines;
      for (var j = 0; j < lines.length; j++) {
        if (name === 'body' || name === 'snow') mtnTriangulate(tris, lines[j]);
        else mtnStrokeTriangles(tris, lines[j], name === 'rim' ? (cfg.rimWidth || 1) :
          name === 'left' || name === 'right' ? (cfg.moonRimWidth || 1) : 0.7);
      }
      var buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
      layer.batches[name] = { buffer: buffer, count: tris.length / 2 };
    }
    if (old) for (var k in old.batches) gl.deleteBuffer(old.batches[k].buffer);
    renderer.layers[cfg.seed] = layer; return layer;
  }

  function mtnGPUPaint(renderer, batch, color) {
    if (!color || !batch.count) return;
    var gl = renderer.gl, rgb = color.match(/[\d.]+/g);
    gl.uniform3f(renderer.color, +rgb[0] / 255, +rgb[1] / 255, +rgb[2] / 255);
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, batch.count);
  }

  function mtnGPULights(renderer, cfg, baseY, transform, top) {
    if (!cfg.distantLights) return;
    var gl = renderer.gl, now = performance.now(), ox = cam.x * cfg.parallax;
    var first = Math.floor((cam.x * (1 - cfg.parallax) - cfg.step * 2) / cfg.step);
    var last = Math.ceil((cam.x * (1 - cfg.parallax) + screenW + cfg.step * 2) / cfg.step);
    // Keep the original world-pixel rounding and draw order between layers.
    gl.uniform2f(renderer.shift, transform.e, transform.f - top);
    for (var idx = first; idx <= last; idx++) {
      if (tileHash01(idx, cfg.seed, 0xA711) <= cfg.minorRatio || tileHash01(idx, cfg.seed, 0xF710) > 0.28) continue;
      var phase = Math.floor(tileHash01(idx, cfg.seed, 0xF711) * 4);
      if (((Math.floor(now / 500) + phase) & 1) !== 0) continue;
      var h = cfg.minHMajor + tileHash01(idx, cfg.seed, 0xA710) * (cfg.maxHMajor - cfg.minHMajor);
      if (tileHash01(idx, cfg.seed, 0xA712) > 0.80) h *= 1.30;
      var x = Math.floor(idx * cfg.step + cfg.step * 0.5 +
        (tileHash01(idx, cfg.seed, 0xA713) - 0.5) * cfg.step * 0.22 + ox);
      var y = Math.floor(baseY - h) - 1;
      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lights);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x,y,x+1,y,x,y+1,x,y+1,x+1,y,x+1,y+1]), gl.STREAM_DRAW);
      var rgb = mtnRGB(tileHash01(idx, cfg.seed, 0xF712) < 0.6 ? BG.distantLight : BG.distantWindow);
      mtnGPUPaint(renderer, { buffer: renderer.lights, count: 6 }, mtnCSS(rgb));
    }
  }

  function drawMountainsGL(layers) {
    if (!MTN_GPU_ENABLED || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over') return false;
    var renderer = initMtnGPU(); if (!renderer || renderer.gl.isContextLost()) return false;
    try {
      var gl = renderer.gl, transform = ctx.getTransform(), ws = transform.a;
      if (transform.b || transform.c || transform.d !== ws || ws <= 0) return false;
      var top = canvas.height, bottom = 0;
      for (var i = 0; i < layers.length; i++) {
        var cfg = layers[i], base = SKY_ROWS * TILE + (cfg.baseYOffset || 0);
        top = Math.min(top, Math.floor((base - Math.max(cfg.maxHMajor * 1.3, cfg.maxHMinor) - 16) * ws + transform.f));
        bottom = Math.max(bottom, Math.ceil((base + 28) * ws + transform.f));
      }
      top = Math.max(0, top); bottom = Math.min(canvas.height, bottom);
      if (bottom <= top) return true;
      var ss = MTN_GPU_SUPERSAMPLE, w = Math.ceil(canvas.width * ss), h = Math.ceil((bottom - top) * ss);
      if (w > renderer.maxSize || h > renderer.maxSize) return false;
      var allocatedH = Math.min(renderer.maxSize, Math.ceil(h / 64) * 64);
      // Quantized, grow-only height avoids reallocating MSAA buffers when a
      // fractional vertical camera move changes the visible band by one pixel.
      if (renderer.canvas.width !== w) { renderer.canvas.width = w; renderer.canvas.height = allocatedH; }
      else if (renderer.canvas.height < h) renderer.canvas.height = allocatedH;
      gl.viewport(0, 0, w, renderer.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND); gl.useProgram(renderer.program); gl.enableVertexAttribArray(0);
      gl.uniform2f(renderer.size, canvas.width, renderer.canvas.height / ss); gl.uniform1f(renderer.scale, ws);
      for (var i = 0; i < layers.length; i++) {
        var cfg = layers[i], layer = mtnGPULayer(renderer, cfg), colors = mountainColors(cfg);
        gl.uniform2f(renderer.shift, transform.e + cam.x * cfg.parallax * ws, transform.f - top);
        var names = ['body', 'snow', 'rim', 'left', 'right', 'snowLeft', 'snowRight'];
        for (var j = 0; j < names.length; j++) mtnGPUPaint(renderer, layer.batches[names[j]], colors[names[j] === 'body' ? 'fill' : names[j]]);
        mtnGPULights(renderer, cfg, layer.baseY, transform, top);
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(renderer.canvas, 0, top, canvas.width, renderer.canvas.height / ss); ctx.restore();
      return true;
    } catch (error) { mtnGPUFailed = true; return false; }
  }
