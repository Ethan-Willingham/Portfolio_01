  // ---- Coal and combustion art: independent of the saved hearth model. ----
  // A small advected temperature field starts at the live coal surfaces. Its
  // buffers belong to the bed through a WeakMap, never to a saved object.
  var hearthArtFields = new WeakMap();
  var hearthArtShapes = new WeakMap();
  var hearthArtTranslucent = new WeakMap();
  var hearthArtRGB = {};
  var hearthArtRamp = null;
  var hearthArtSparkGlow = null;
  var HEARTH_ART_W = 176;
  var HEARTH_ART_H = 50;

  function hearthArtHash(n) {
    n = Math.imul((n | 0) ^ 0x68bc21eb, 0x1b873593);
    n = Math.imul(n ^ (n >>> 13), 0x85ebca6b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function hearthArtColor(color, alpha) {
    var rgb = hearthArtRGB[color];
    if (!rgb) {
      var value = parseInt(color.slice(1), 16);
      rgb = hearthArtRGB[color] = [value >>> 16, (value >>> 8) & 255, value & 255];
    }
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function hearthArtMakeRamp() {
    var stops = [BLD.redDeep, BLD.redDark, BLD.redBase, BLD.redBright,
      BLD.goldBase, BLD.warmGlow, BLD.goldPale, BLD.cream];
    var colors = [], ramp = new Uint8ClampedArray(256 * 4), i, j;
    for (i = 0; i < stops.length; i++) {
      hearthArtColor(stops[i], 1);
      colors.push(hearthArtRGB[stops[i]]);
    }
    for (i = 0; i < 256; i++) {
      var v = i / 255, position = Math.min(6.999, v * 7), low = position | 0;
      var mix = position - low;
      for (j = 0; j < 3; j++) ramp[i * 4 + j] = colors[low][j] * (1 - mix) + colors[low + 1][j] * mix;
      ramp[i * 4 + 3] = Math.min(248, Math.max(0, (v - 0.08) * 470));
    }
    hearthArtRamp = ramp;
  }

  function hearthArtShape(body) {
    var shape = hearthArtShapes.get(body);
    if (shape) return shape;
    var seed = ((Number(body.seed) || 0) * 65537 + Number(body.id || 0) * 97) | 0;
    var vertices = hearthHull(body).vertices, cracks = [], crust = [], strata = [], pores = [], i;
    var count = vertices.length;
    var cx = (hearthArtHash(seed + 819) - 0.5) * 0.27;
    var cy = (hearthArtHash(seed + 311) - 0.5) * 0.29;
    var upper = vertices[Math.floor(count * 0.68)], lower = vertices[Math.floor(count * 0.19)];
    var kneeX = cx + (hearthArtHash(seed + 761) - 0.5) * 0.46, kneeY = cy - 0.3;
    cracks.push([upper[0], upper[1], kneeX, kneeY, cx + 0.16, cy + 0.28, lower[0], lower[1]]);
    for (i = 0; i < 3; i++) {
      var end = vertices[(i * 3 + 1) % count];
      var rootX = i === 0 ? kneeX : cx + 0.16, rootY = i === 0 ? kneeY : cy + 0.28;
      cracks.push([rootX, rootY,
        rootX * 0.6 + end[0] * 0.3 + (hearthArtHash(seed + i * 13) - 0.5) * 0.22,
        rootY * 0.6 + end[1] * 0.3 + (hearthArtHash(seed + i * 19) - 0.5) * 0.24,
        end[0] * 0.76 + (hearthArtHash(seed + i * 23) - 0.5) * 0.14,
        end[1] * 0.69 + (hearthArtHash(seed + i * 29) - 0.5) * 0.13,
        end[0], end[1]]);
    }
    for (i = 0; i < 22; i++) crust.push([
      (hearthArtHash(seed + i * 53 + 981) - 0.5) * 1.3,
      (hearthArtHash(seed + i * 41 + 721) - 0.5) * 1.25,
      0.07 + hearthArtHash(seed + i * 37 + 367) * 0.17,
      hearthArtHash(seed + i * 67 + 63)
    ]);
    for (i = 0; i < 17; i++) strata.push([
      (hearthArtHash(seed + i * 47 + 412) - 0.5) * 1.7,
      (hearthArtHash(seed + i * 31 + 608) - 0.5) * 1.55,
      0.16 + hearthArtHash(seed + i * 73) * 0.48,
      hearthArtHash(seed + i * 109)
    ]);
    for (i = 0; i < 30; i++) pores.push([
      (hearthArtHash(seed + i * 83 + 21) - 0.5) * 1.6,
      (hearthArtHash(seed + i * 67 + 75) - 0.5) * 1.5,
      0.013 + hearthArtHash(seed + i * 43 + 123) * 0.034
    ]);
    shape = { vertices: vertices, strata: strata, pores: pores, cracks: cracks, crust: crust, seed: seed, cx: cx, cy: cy };
    hearthArtShapes.set(body, shape);
    return shape;
  }

  function hearthArtPolygon(c, vertices, radius) {
    c.beginPath();
    c.moveTo(vertices[0][0] * radius, vertices[0][1] * radius);
    for (var i = 1; i < vertices.length; i++) c.lineTo(vertices[i][0] * radius, vertices[i][1] * radius);
    c.closePath();
  }

  // The x/y are the desired centre; scale is applied to the body's real radius.
  // No global game context is used, so bins and warm-up canvases share this art.
  function hearthDrawCoal(c, body, x, y, scale, time) {
    if (!c || !body) return;
    if (c.globalAlpha < 0.999) { hearthDrawCoalTranslucent(c, body, x, y, scale, time); return; }
    if (body.material && body.material !== 'coal' && body.material !== 'wood') { hearthDrawMineralFuel(c, body, x, y, scale, time); return; }
    var shape = hearthArtShape(body), vertices = shape.vertices;
    var radius = Math.max(2, Number(body.r) || 16) * (scale == null ? 1 : scale);
    var heat = Math.max(0, Math.min(1, Number(body.heat) || 0));
    var fuel = Math.max(0, Math.min(1, body.fuel == null ? 1 : Number(body.fuel)));
    var ash = body.ash ? 1 : Math.max(0, Number(body.coating) || 0);
    var angle = Number(body.angle) || 0, pulse = 0.92 + Math.sin((time || 0) * 4.1 + shape.seed) * 0.08;
    var emission = Math.max(0, (heat - 0.30) / 0.70) * pulse;
    var i, a, b;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    if (emission > 0.01) {
      var glow = c.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius * 1.85);
      glow.addColorStop(0, hearthArtColor(BLD.redBright, emission * 0.42));
      glow.addColorStop(0.45, hearthArtColor(BLD.redBase, emission * 0.22));
      glow.addColorStop(1, hearthArtColor(BLD.redBase, 0));
      c.fillStyle = glow;
      c.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
    }
    hearthArtPolygon(c, vertices, radius);
    c.fillStyle = BLD.metalBase;
    c.fill();
    c.fillStyle = hearthArtColor(BLD.metalDark, 0.4);
    c.fill();
    c.strokeStyle = BLD.outline;
    c.lineJoin = 'bevel';
    c.lineWidth = Math.max(0.6, radius * 0.025);
    c.stroke();
    c.save();
    c.clip();
    // Matte, broken charcoal faces. Light stays above and left as the real
    // hull tumbles; long grain follows the piece instead of a metallic facet.
    for (i = 0; i < vertices.length; i++) {
      a = vertices[i]; b = vertices[(i + 1) % vertices.length];
      var normal = Math.atan2(a[1] + b[1], a[0] + b[0]) + angle;
      var light = Math.cos(normal + Math.PI * 0.73);
      c.beginPath();
      c.moveTo(shape.cx * radius, shape.cy * radius);
      c.lineTo(a[0] * radius, a[1] * radius);
      c.lineTo(b[0] * radius, b[1] * radius);
      c.closePath();
      c.fillStyle = light > 0.44 ? BLD.metalLight : light < -0.2 ? BLD.outline : BLD.metalDark;
      c.globalAlpha = light > 0.44 ? 0.32 + light * 0.18 : 0.5;
      c.fill();
      if (ash > 0.12 && hearthArtHash(shape.seed + i * 101) < ash) {
        c.globalAlpha = 0.32 + ash * 0.51;
        c.fillStyle = light > 0.2 ? BLD.stonePale : BLD.stoneBase;
        c.fill();
      }
    }
    c.globalAlpha = 1;
    // Thin, broken bedding planes and dull black pits distinguish coal from
    // polished ore. The little glossy cleavage lips turn with the actual lump.
    for (i = 0; i < shape.strata.length; i++) {
      var layer = shape.strata[i], lx = layer[0] * radius, ly = layer[1] * radius, lw = layer[2] * radius;
      lw *= 1.6;
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + lw * 0.42, ly - lw * 0.045); c.lineTo(lx + lw, ly + lw * 0.025);
      c.strokeStyle = hearthArtColor(BLD.outline, 0.85); c.lineWidth = Math.max(0.8, radius * 0.028); c.stroke();
      c.beginPath(); c.moveTo(lx + lw * 0.08, ly - 0.7); c.lineTo(lx + lw * 0.4, ly - lw * 0.045 - 0.7);
      c.strokeStyle = hearthArtColor(ash > 0.5 ? BLD.stonePale : BLD.metalLight, 0.18 + layer[3] * 0.18);
      c.lineWidth = Math.max(0.5, radius * 0.016); c.stroke();
    }
    if (emission > 0.015) {
      c.beginPath();
      for (i = 0; i < shape.cracks.length; i++) {
        var crack = shape.cracks[i];
        c.moveTo(crack[0] * radius, crack[1] * radius);
        c.lineTo(crack[2] * radius, crack[3] * radius);
        c.lineTo(crack[4] * radius, crack[5] * radius);
        c.lineTo(crack[6] * radius, crack[7] * radius);
      }
      c.lineWidth = Math.max(1.4, radius * 0.080);
      c.strokeStyle = hearthArtColor(BLD.redBase, emission * 0.94);
      c.stroke();
      c.lineWidth = Math.max(0.7, radius * 0.027);
      c.strokeStyle = hearthArtColor(heat > 0.72 ? BLD.warmGlow : BLD.redBright, emission);
      c.stroke();
      if (heat > 0.75) {
        c.lineWidth = Math.max(0.5, radius * 0.009);
        c.strokeStyle = hearthArtColor(BLD.goldPale, (heat - 0.75) * 2.8);
        c.stroke();
      }
      // An exposed hot lip remains visible below the crust.
      c.beginPath();
      for (i = 0; i < vertices.length; i++) {
        a = vertices[i]; b = vertices[(i + 1) % vertices.length];
        if (hearthArtHash(shape.seed + i * 89) < 0.26) {
          c.moveTo(a[0] * radius * 0.92, a[1] * radius * 0.92);
          c.lineTo((a[0] * 0.46 + b[0] * 0.54) * radius * 0.91, (a[1] * 0.46 + b[1] * 0.54) * radius * 0.91);
        }
      }
      c.lineWidth = Math.max(0.8, radius * 0.065);
      c.strokeStyle = hearthArtColor(BLD.redBright, emission * 0.7);
      c.stroke();
    }
    // Fractured black scales and mineral ash sit above, breaking up the veins.
    for (i = 0; i < shape.crust.length; i++) {
      var flake = shape.crust[i], fx = flake[0] * radius, fy = flake[1] * radius, fr = flake[2] * radius;
      c.beginPath();
      c.moveTo(fx - fr, fy - fr * 0.46);
      c.lineTo(fx + fr * 0.45, fy - fr * 0.82);
      c.lineTo(fx + fr, fy + fr * 0.3);
      c.lineTo(fx - fr * 0.35, fy + fr * 0.64);
      c.closePath();
      c.fillStyle = flake[3] < ash ? (flake[3] < ash * 0.45 ? BLD.stonePale : BLD.stoneLight) : BLD.outline;
      c.globalAlpha = flake[3] < ash ? 0.77 : 0.45;
      c.fill();
    }
    c.globalAlpha = 1;
    for (i = 0; i < shape.pores.length; i++) {
      var pore = shape.pores[i], pr = pore[2] * radius;
      c.fillStyle = hearthArtColor(BLD.outline, 0.65 - ash * 0.3);
      c.beginPath(); c.ellipse(pore[0] * radius, pore[1] * radius, pr * 1.5, pr * 0.65, 0, 0, Math.PI * 2); c.fill();
    }
    // One broken cleft catches daylight. No all-round specular rim.
    c.strokeStyle = hearthArtColor(ash > 0.45 ? BLD.cream : BLD.metalLight, ash > 0.45 ? 0.37 : 0.55);
    c.lineWidth = Math.max(0.6, radius * 0.04);
    for (i = 0; i < vertices.length; i++) {
      a = vertices[i]; b = vertices[(i + 1) % vertices.length];
      if (Math.cos(Math.atan2(a[1] + b[1], a[0] + b[0]) + angle + Math.PI * 0.73) < 0.72) continue;
      c.beginPath();
      c.moveTo(a[0] * radius * 0.94, a[1] * radius * 0.94);
      c.lineTo(b[0] * radius * 0.88, b[1] * radius * 0.88);
      c.stroke();
    }
    c.restore();
    c.restore();
  }

  function hearthDrawCoalTranslucent(c, body, x, y, scale, time) {
    // Composite the complete piece once. Per-facet alpha would accumulate
    // toward opaque where its overlapping paint layers meet in the ghost.
    var radius = Math.max(2, Number(body.r) || 16) * (scale == null ? 1 : scale);
    var size = Math.ceil(radius * 4.4 + 4), sprite = hearthArtTranslucent.get(body);
    var key = [size, radius, body.angle, body.heat, body.fuel, body.ash, body.coating,
      body.material, body.heat > 0.01 ? Math.floor((time || 0) * 30) : 0].join('|');
    if (!sprite) {
      var canvas = document.createElement('canvas');
      sprite = { canvas: canvas, c: canvas.getContext('2d'), key: '' };
      hearthArtTranslucent.set(body, sprite);
    }
    if (sprite.key !== key) {
      sprite.canvas.width = sprite.canvas.height = size * 2;
      sprite.c.setTransform(2, 0, 0, 2, 0, 0);
      hearthDrawCoal(sprite.c, body, size / 2, size / 2, scale, time);
      sprite.key = key;
    }
    c.drawImage(sprite.canvas, x - size / 2, y - size / 2, size, size);
  }

  function hearthDrawFuelGhost(c, body, x, y, time, valid, lineScale) {
    // The specimen stays translucent; its exact silhouette stays readable
    // over both the dark brickwork and bright flames.
    c.save(); c.globalAlpha = valid ? 0.64 : 0.42;
    hearthDrawCoal(c, body, x, y, 1, time); c.restore();
    c.save(); c.translate(x, y); c.rotate(body.angle || 0);
    hearthArtPolygon(c, hearthHull(body).vertices, Math.max(2, Number(body.r) || 16));
    c.lineJoin = 'bevel'; c.lineWidth = 3.4 * lineScale;
    c.strokeStyle = hearthArtColor(BLD.outline, 0.85); c.stroke();
    c.lineWidth = 1.4 * lineScale;
    c.strokeStyle = valid ? BLD.cream : UIT_RED; c.stroke(); c.restore();
  }

  function hearthDrawMineralFuel(c, body, x, y, scale, time) {
    var spec = hearthMaterial(body.material), shape = hearthArtShape(body), vertices = shape.vertices;
    var radius = Math.max(2, body.r) * (scale == null ? 1 : scale), angle = body.angle || 0;
    c.save(); c.translate(x, y); c.rotate(angle);
    hearthArtPolygon(c, vertices, radius); c.fillStyle = body.ash ? BLD.stonePale : spec.color; c.fill();
    c.lineWidth = Math.max(0.65, radius * 0.04); c.strokeStyle = BLD.outline; c.stroke();
    c.save(); c.clip();
    for (var i = 0; i < vertices.length; i++) {
      var a = vertices[i], b = vertices[(i + 1) % vertices.length];
      var light = Math.cos(Math.atan2(a[1] + b[1], a[0] + b[0]) + angle + Math.PI * 0.73);
      c.beginPath(); c.moveTo(-radius * 0.1, -radius * 0.12);
      c.lineTo(a[0] * radius, a[1] * radius); c.lineTo(b[0] * radius, b[1] * radius); c.closePath();
      c.fillStyle = light > 0 ? spec.highlight : BLD.outline; c.globalAlpha = Math.abs(light) * 0.42; c.fill();
    }
    c.globalAlpha = 1;
    if (body.material === 'malachite') {
      c.strokeStyle = hearthArtColor(spec.highlight, 0.52); c.lineWidth = Math.max(1, radius * 0.08);
      for (var band = 0; band < 4; band++) { c.beginPath(); c.ellipse(-radius * 0.45, radius * 0.2, radius * (0.24 + band * 0.26), radius * (0.18 + band * 0.22), 0, 0, Math.PI * 2); c.stroke(); }
    } else {
      c.strokeStyle = hearthArtColor(spec.highlight, 0.72); c.lineWidth = Math.max(0.6, radius * 0.025);
      for (var cut = 0; cut < 3; cut++) {
        var crack = shape.cracks[cut]; c.beginPath(); c.moveTo(crack[0] * radius, crack[1] * radius);
        c.lineTo(crack[2] * radius, crack[3] * radius); c.lineTo(crack[4] * radius, crack[5] * radius); c.stroke();
      }
    }
    if (body.heat > 0.35) {
      c.fillStyle = hearthArtColor(BLD.redBright, (body.heat - 0.35) * 0.22); c.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    // A pale broken skin appears as real combustible mass is exhausted.
    if (spec.role === 'fuel' && body.fuel < 0.4) {
      c.fillStyle = BLD.stonePale; c.globalAlpha = (0.4 - body.fuel) * 1.9;
      for (var f = 0; f < shape.crust.length; f++) {
        var flake = shape.crust[f]; c.fillRect(flake[0] * radius, flake[1] * radius, flake[2] * radius, flake[2] * radius * 0.5);
      }
    }
    c.restore(); c.restore();
  }

  function hearthArtFlame(body) {
    var flame = body.flame == null ? 1 : body.flame;
    return Math.max(0, Math.min(1, body.heat)) * (0.20 + flame * 0.80);
  }
  function hearthArtVapors(c, chunks, time) {
    for (var i = 0; i < chunks.length; i++) {
      var b = chunks[i]; if (b.held) continue;
      var smoke = Number(b.smoke) || 0, steam = Number(b.steam) || 0;
      if (smoke + steam < 0.01) continue;
      for (var j = 0; j < 6; j++) {
        var age = (time * (0.28 + j * 0.007) + hearthArtHash(b.id * 97 + j * 73)) % 1;
        var x = b.x + Math.sin(age * 5 + b.seed * 30 + j) * (5 + age * 13);
        var y = b.y - b.r * 0.55 - age * (58 + steam * 32);
        c.globalAlpha = Math.sin(age * Math.PI) * Math.min(0.24, smoke * 0.18 + steam * 0.16);
        c.fillStyle = steam > smoke ? BLD.stonePale : BLD.stoneBase;
        c.beginPath(); c.ellipse(x, y, 3 + age * 15, 2 + age * 7, -0.3, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  function hearthArtField(bed) {
    var field = hearthArtFields.get(bed);
    if (field) return field;
    var canvas = document.createElement('canvas');
    canvas.width = HEARTH_ART_W; canvas.height = HEARTH_ART_H;
    var context = canvas.getContext('2d', { alpha: true });
    field = { canvas: canvas, ctx: context, image: context.createImageData(HEARTH_ART_W, HEARTH_ART_H),
      heat: new Float32Array(HEARTH_ART_W * HEARTH_ART_H),
      next: new Float32Array(HEARTH_ART_W * HEARTH_ART_H),
      noise: new Float32Array(1024), sinX: new Float32Array(HEARTH_ART_W), cosX: new Float32Array(HEARTH_ART_W),
      sinX2: new Float32Array(HEARTH_ART_W), cosX2: new Float32Array(HEARTH_ART_W),
      sources: [], last: -1, clock: 0, carry: 0, active: 0, sourceHeat: 0, hadChunks: false };
    for (var i = 0; i < field.noise.length; i++) field.noise[i] = hearthArtHash(i * 97 + 317) * 2 - 1;
    for (i = 0; i < HEARTH_ART_W; i++) {
      field.sinX[i] = Math.sin(i * 0.17); field.cosX[i] = Math.cos(i * 0.17);
      field.sinX2[i] = Math.sin(i * 0.31); field.cosX2[i] = Math.cos(i * 0.31);
    }
    hearthArtFields.set(bed, field);
    return field;
  }

  function hearthArtSample(buffer, x, y) {
    if (x < 0 || x >= HEARTH_ART_W - 1 || y < 0 || y >= HEARTH_ART_H - 1) return 0;
    var ix = x | 0, iy = y | 0, dx = x - ix, dy = y - iy, at = iy * HEARTH_ART_W + ix;
    return (buffer[at] * (1 - dx) + buffer[at + 1] * dx) * (1 - dy) +
      (buffer[at + HEARTH_ART_W] * (1 - dx) + buffer[at + HEARTH_ART_W + 1] * dx) * dy;
  }

  function hearthArtStep(field, bed, dt) {
    var w = HEARTH_ART_W, h = HEARTH_ART_H, heat = field.heat, next = field.next;
    var flowX = (w / HEARTH_WIDTH) / (112 / 416), flowY = (h / HEARTH_HEIGHT) / (76 / 210);
    var air = Math.max(0, Math.min(1, bed.air == null ? 0.65 : Number(bed.air)));
    var t = field.clock, phase = (t * 17) | 0, noise = field.noise;
    var x, y, at, ix, iy;
    next.fill(0);
    // Semi-Lagrangian transport: the material rises faster when hot. Smooth
    // large eddies fold the plume while a changing coarse noise field frays it.
    for (y = 1; y < h - 1; y++) {
      var rowWind = Math.sin(y * 0.19 - t * 1.8) * 3.1 + Math.sin(y * 0.071 + t * 2.7) * 2;
      var rowCool = (0.12 + (1 - y / h) * 0.22) * dt;
      var sinY = Math.sin(y * 0.2 - t * 2.8), cosY = Math.cos(y * 0.2 - t * 2.8);
      var sinY2 = Math.sin(y * 0.13 + t * 3.9), cosY2 = Math.cos(y * 0.13 + t * 3.9);
      for (x = 1; x < w - 1; x++) {
        at = y * w + x;
        var value = heat[at];
        var curl = noise[((x >> 2) * 29 + (y >> 2) * 73 + phase) & 1023];
        var wave = field.sinX[x] * cosY + field.cosX[x] * sinY;
        var roll = field.sinX2[x] * cosY2 + field.cosX2[x] * sinY2;
        var turbulence = 0.38 + (1 - Math.min(1, value)) * 0.62;
        // Preserve transport speed in chamber units when the field aspect changes.
        var vx = ((rowWind + wave * 14 + roll * 8 + curl * 4) * turbulence + (w * 0.5 - x) * 0.022) * flowX;
        var vy = (16 + air * 15 + value * 18 + wave * 4 - roll * 3) * flowY;
        var advected = hearthArtSample(heat, x - vx * dt, y + vy * dt);
        var blur = hearthArtSample(heat, x - vx * dt + curl * 0.47, y + vy * dt + 0.35);
        next[at] = Math.max(0, advected * 0.95 + blur * 0.05 - rowCool * (0.75 + curl * 0.3));
      }
    }
    var sources = field.sources;
    for (var i = 0; i < sources.length; i++) {
      var body = sources[i], bx = body.x * w / HEARTH_WIDTH, by = (body.y - body.r * 0.42 - HEARTH_TOP) * h / HEARTH_HEIGHT;
      var radius = Math.max(2, body.r * w / HEARTH_WIDTH * 0.95);
      var intensity = hearthArtFlame(body) * (0.84 + air * 0.16);
      var flicker = 0.88 + noise[((body.id || i) * 53 + ((t * 13) | 0)) & 1023] * 0.12;
      var minX = Math.max(1, Math.floor(bx - radius)), maxX = Math.min(w - 2, Math.ceil(bx + radius));
      var minY = Math.max(1, Math.floor(by - radius * 0.48)), maxY = Math.min(h - 2, Math.ceil(by + radius * 0.58));
      for (iy = minY; iy <= maxY; iy++) for (ix = minX; ix <= maxX; ix++) {
        var dist = Math.abs(ix - bx) / radius, depth = Math.abs(iy - by) / (radius * 0.72);
        var source = Math.max(0, 1 - dist * dist - depth * depth * 0.6) * intensity * flicker;
        at = iy * w + ix;
        next[at] = Math.min(1.18, Math.max(next[at], source * 1.18));
      }
    }
    field.next = heat; field.heat = next;
    field.clock += dt;
  }

  function hearthArtPrime(field, bed) {
    var w = HEARTH_ART_W, h = HEARTH_ART_H;
    var air = Math.max(0, Math.min(1, Number(bed.air) || 0));
    // Reopening a hot furnace must not look like lighting a cold one. Seed a
    // curved, tapering plume directly above each real burning lump, then let
    // the ordinary transport take over. Work is bounded by the coal cap and
    // field size; no simulation ticks, fuel changes, or long visual pre-roll.
    for (var i = 0; i < field.sources.length; i++) {
      var body = field.sources[i], heat = hearthArtFlame(body);
      if (heat < 0.7) continue;
      var bx = body.x * w / HEARTH_WIDTH, by = (body.y - body.r * 0.42 - HEARTH_TOP) * h / HEARTH_HEIGHT;
      var radius = body.r * w / HEARTH_WIDTH * (0.83 + air * 0.25);
      var height = body.r * (3.6 + heat * 3.2) * (0.8 + air * 0.45) * h / HEARTH_HEIGHT;
      var phase = (Number(body.seed) || 0) * 19 + field.clock * 1.6;
      var inlet = heat * (0.84 + air * 0.16) * 1.18;
      var minY = Math.max(1, Math.floor(by - height)), maxY = Math.min(h - 2, Math.ceil(by));
      for (var y = minY; y <= maxY; y++) {
        var rise = Math.max(0, Math.min(1, (by - y) / height));
        var bend = (Math.sin(rise * 7.7 + phase) - Math.sin(phase)) * rise * radius * 1.15;
        bend += Math.sin(rise * 13.5 - phase) * rise * rise * radius * 0.5;
        var center = bx + bend, span = Math.max(0.5, radius * (1 - rise * 0.85));
        span *= 0.92 + Math.sin(rise * 15 + phase * 0.4) * 0.16;
        var minX = Math.max(1, Math.floor(center - span)), maxX = Math.min(w - 2, Math.ceil(center + span));
        var temperature = inlet * Math.sqrt(1 - rise);
        for (var x = minX; x <= maxX; x++) {
          var across = (x - center) / span;
          var value = temperature * Math.max(0, 1 - across * across);
          var at = y * w + x;
          if (value > field.heat[at]) field.heat[at] = value;
        }
      }
    }
  }

  function hearthArtUpdate(field, bed, time) {
    var now = Number(time) || 0, first = field.last < 0;
    var gap = first ? 0 : Math.max(0, now - field.last);
    var elapsed = first ? 1 / 30 : Math.min(0.1, gap);
    field.last = now;
    field.sources.length = 0;
    var chunks = bed.chunks || [], heatSum = 0, hottest = 0, i, dirty = false;
    if (!chunks.length) {
      if (field.hadChunks) {
        field.heat.fill(0); field.next.fill(0);
        field.ctx.clearRect(0, 0, HEARTH_ART_W, HEARTH_ART_H);
      }
      field.hadChunks = false; field.sourceHeat = 0; field.active = 0; field.carry = 0;
      return;
    }
    field.hadChunks = true;
    for (i = 0; i < chunks.length; i++) {
      var body = chunks[i];
      if (body.held || body.ash || !body.lit || body.fuel <= 0 || body.heat <= 0.12) continue;
      field.sources.push(body); heatSum += body.heat; hottest = Math.max(hottest, hearthArtFlame(body));
    }
    if (gap > 0.4) {
      // Old plumes must not survive a return to an empty or rearranged grate.
      field.heat.fill(0); field.next.fill(0); field.clock = now; dirty = true;
    }
    if (hottest > 0.78 && (first || gap > 0.4 || heatSum > field.sourceHeat + 0.75)) {
      hearthArtPrime(field, bed); dirty = true;
    }
    field.sourceHeat = heatSum;
    field.active = Math.min(1, heatSum / 6);
    field.carry = Math.min(0.1, field.carry + elapsed);
    var steps = 0;
    while (field.carry >= 1 / 30 && steps < 3) {
      hearthArtStep(field, bed, 1 / 30);
      field.carry -= 1 / 30; steps++;
    }
    if (!steps && !dirty) return;
    if (!hearthArtRamp) hearthArtMakeRamp();
    var data = field.image.data, ramp = hearthArtRamp;
    for (i = 0; i < field.heat.length; i++) {
      var value = Math.min(255, Math.max(0, field.heat[i] * 242)) | 0, at = i * 4, ri = value * 4;
      data[at] = ramp[ri]; data[at + 1] = ramp[ri + 1]; data[at + 2] = ramp[ri + 2]; data[at + 3] = ramp[ri + 3];
      if (value > 24) {
        var px = (i % HEARTH_ART_W + 0.5) * HEARTH_WIDTH / HEARTH_ART_W;
        var py = HEARTH_TOP + (Math.floor(i / HEARTH_ART_W) + 0.5) * HEARTH_HEIGHT / HEARTH_ART_H;
        var tint = [0,0,0], weight = 0;
        for (var source = 0; source < chunks.length; source++) {
          var item = chunks[source], spec = hearthMaterial(item.material), rise = item.y - py, reach = item.r * 1.8;
          if (item.held || spec.tint <= 0 || item.heat < 0.2 || rise < -item.r || rise > item.r * 5 || Math.abs(item.x - px) > reach) continue;
          var influence = spec.tint * Math.min(1,(item.heat-0.2)*2.5) * (1-Math.abs(item.x-px)/reach) * (1-Math.max(0,rise)/(item.r*5));
          for (var rgb = 0; rgb < 3; rgb++) tint[rgb] += spec.flame[rgb] * influence;
          weight += influence;
        }
        if (weight > 0) {
          var blend = Math.min(0.96,weight), light = Math.max(data[at],data[at+1],data[at+2]);
          for (var color = 0; color < 3; color++) data[at+color] = data[at+color]*(1-blend)+tint[color]/weight*light*blend;
        }
      }
    }
    field.ctx.putImageData(field.image, 0, 0);
  }

  function hearthArtEmbers(c, sources, air, time) {
    for (var i = 0; i < sources.length; i++) {
      var body = sources[i], seed = (Number(body.seed) * 997 + i * 41) | 0;
      var count = body.heat > 0.65 ? 3 : 1;
      for (var j = 0; j < count; j++) {
        var life = 1.7 + hearthArtHash(seed + j * 11) * 1.9;
        var epoch = (time + hearthArtHash(seed + j * 97) * life) / life;
        var age = epoch - Math.floor(epoch), cycle = Math.floor(epoch);
        if (hearthArtHash(seed + j * 53 + cycle * 37) > body.heat * 0.61 + air * 0.22) continue;
        var drift = (hearthArtHash(seed + j * 71 + cycle * 17) - 0.5) * 24;
        var x = body.x + Math.sin(age * 8 + seed) * 4 + drift * age;
        var y = body.y - body.r * 0.68 - age * (48 + air * 74);
        var opacity = (1 - age) * (0.35 + body.heat * 0.65);
        c.fillStyle = hearthArtColor(age < 0.3 ? BLD.goldPale : BLD.redBright, opacity);
        c.fillRect(Math.round(x), Math.round(y), age < 0.5 ? 1.5 : 1, 2 + air);
        c.fillStyle = hearthArtColor(BLD.redBase, opacity * 0.38);
        c.fillRect(Math.round(x), Math.round(y + 3), 1, 3);
      }
    }
  }

  function hearthArtEventSparks(c, bed) {
    var sparks = bed.sparks;
    if (!sparks || !sparks.length) return;
    if (!hearthArtSparkGlow) {
      hearthArtSparkGlow = document.createElement('canvas');
      hearthArtSparkGlow.width = hearthArtSparkGlow.height = 24;
      var glowCtx = hearthArtSparkGlow.getContext('2d');
      var glow = glowCtx.createRadialGradient(12, 12, 0, 12, 12, 12);
      glow.addColorStop(0, hearthArtColor(BLD.warmGlow, 0.42));
      glow.addColorStop(0.24, hearthArtColor(BLD.redBright, 0.25));
      glow.addColorStop(1, hearthArtColor(BLD.redBase, 0));
      glowCtx.fillStyle = glow; glowCtx.fillRect(0, 0, 24, 24);
    }
    c.save();
    // Physics supplies each impact/striker burst. The taper follows the actual
    // velocity, so thrown coals fling sparks sideways and bellows loft them.
    for (var i = 0; i < sparks.length; i++) {
      var spark = sparks[i];
      var heat = Math.max(0, Math.min(1, Number(spark.heat) || 0));
      if (heat <= 0 || spark.t >= spark.life) continue;
      var radius = Math.max(0.6, Number(spark.r) || 1);
      var vx = Number(spark.vx) || 0, vy = Number(spark.vy) || 0;
      var speed = Math.sqrt(vx * vx + vy * vy), age = Math.max(0, Number(spark.t) || 0);
      var tail = Math.min(0.045, age) * (0.4 + heat * 0.6);
      var tx = spark.x - vx * tail, ty = spark.y - vy * tail;
      var nx = speed > 0.01 ? -vy / speed : 1, ny = speed > 0.01 ? vx / speed : 0;
      var bloom = radius * (5 + heat * 3);
      c.globalAlpha = heat * heat;
      c.drawImage(hearthArtSparkGlow, spark.x - bloom, spark.y - bloom, bloom * 2, bloom * 2);
      c.globalAlpha = Math.min(1, heat * 2);
      c.fillStyle = heat > 0.6 ? BLD.warmGlow : BLD.redBright;
      c.beginPath();
      c.moveTo(spark.x + nx * radius * 0.62, spark.y + ny * radius * 0.62);
      c.lineTo(tx, ty);
      c.lineTo(spark.x - nx * radius * 0.62, spark.y - ny * radius * 0.62);
      c.closePath(); c.fill();
      c.fillStyle = heat > 0.75 ? BLD.cream : heat > 0.36 ? BLD.goldPale : BLD.redBright;
      var core = Math.max(1, radius * 1.2);
      c.fillRect(Math.round(spark.x - core * 0.5), Math.round(spark.y - core * 0.5), core, core);
    }
    c.restore();
  }

  // Interior only. The caller supplies the cast-iron door, grate, and controls.
  // x/y/w/h map the working coal bed; the casing can continue up to the tub.
  function hearthDrawFirebox(c, bed, x, y, w, h, time, options) {
    if (!c || !bed || w <= 0 || h <= 0) return;
    var physical = typeof hearthFireDraw === 'function' && hearthFireDraw(c, bed, x, y, w, h);
    var field = physical ? { active: bed.heat, sources: [] } : hearthArtField(bed), chunks = bed.chunks || [];
    if (!physical) hearthArtUpdate(field, bed, time);
    var hot = field.active, air = Math.max(0, Math.min(1, bed.air == null ? 0.65 : Number(bed.air)));
    var i, row, col;
    c.save();
    var profile = options && options.profile;
    if (profile) hearthCasingPath(c, profile, true);
    else { c.beginPath(); c.rect(x, y, w, h); }
    c.clip();
    var ceiling = profile ? HEARTH_TOP + (profile.ceiling - y) * HEARTH_HEIGHT / h : HEARTH_TOP;
    c.translate(x, y); c.scale(w / HEARTH_WIDTH, h / HEARTH_HEIGHT); c.translate(0,-HEARTH_TOP);
    c.fillStyle = BLD.outline; c.fillRect(-HEARTH_WIDTH, ceiling, HEARTH_WIDTH * 3, HEARTH_FLOOR - ceiling);
    // Soot-blackened firebrick. A few top faces survive through the carbon,
    // keeping the cavity legible before the first spark and under a low fire.
    var brickLeft = profile ? (profile.sides[0][0] - x) * HEARTH_WIDTH / w : 0;
    var brickRight = profile ? (profile.sides[profile.sides.length - 1][0] - x) * HEARTH_WIDTH / w : HEARTH_WIDTH;
    for (row = Math.floor(ceiling / 31); row < 7; row++) for (col = Math.floor(brickLeft / 58) - 1; col <= Math.ceil(brickRight / 58); col++) {
      var bx = col * 58 + (row % 2 ? 29 : 0), by = row * 31;
      var variation = hearthArtHash(row * 53 + col * 97 + 811);
      c.fillStyle = hearthArtColor(variation > 0.6 ? BLD.woodDark : BLD.stoneDark, 0.12 + variation * 0.05);
      c.fillRect(bx + 2, by + 2, 55, 28);
      c.fillStyle = hearthArtColor(BLD.stoneBase, 0.04);
      c.fillRect(bx + 3, by + 2, 52, 1);
    }
    if (hot > 0.005) {
      var glow = c.createRadialGradient(HEARTH_WIDTH / 2, 180, 5, HEARTH_WIDTH / 2, 160, HEARTH_WIDTH * 0.61);
      glow.addColorStop(0, hearthArtColor(BLD.redBright, 0.24 * hot));
      glow.addColorStop(0.45, hearthArtColor(BLD.redBase, 0.12 * hot));
      glow.addColorStop(1, hearthArtColor(BLD.redDeep, 0));
      c.fillStyle = glow; c.fillRect(-HEARTH_WIDTH, ceiling, HEARTH_WIDTH * 3, HEARTH_FLOOR - ceiling);
    }
    // Rear air slots feed the third-direction exchange in the GPU slice.
    // They stay visible above a low bed and disappear behind a full pile.
    for (row = 0; row < 2; row++) for (col = 24; col < HEARTH_WIDTH - 10; col += 34) {
      var ventY = row ? 185 : 85;
      c.fillStyle = hearthArtColor(BLD.metalBase, 0.26); c.fillRect(col, ventY - 1, 10, 1);
      c.fillStyle = BLD.outline; c.fillRect(col, ventY, 10, 3);
    }
    c.fillStyle = BLD.metalDark; c.fillRect(0, HEARTH_FLOOR - 2, HEARTH_WIDTH, 2);
    c.fillStyle = hearthArtColor(BLD.stoneLight, 0.2); c.fillRect(0, HEARTH_FLOOR - 1, HEARTH_WIDTH, 1);
    // Mineral residue is simulated and saved, never painted in an empty grate.
    var ash = bed.ash || [];
    for(i=0;i<ash.length;i++){
      var grain=ash[i],radius=Math.max(1.3,Math.sqrt(grain.kg/0.00008));
      c.fillStyle=grain.seed>0.4?BLD.cream:BLD.stonePale;
      c.beginPath();c.moveTo(grain.x-radius,grain.y);c.lineTo(grain.x-radius*0.4,grain.y-radius);
      c.lineTo(grain.x+radius,grain.y-radius*0.3);c.lineTo(grain.x+radius*0.6,grain.y+radius*0.6);c.closePath();c.fill();
      c.fillStyle=hearthArtColor(BLD.outline,0.28);c.fillRect(grain.x-radius*.4,grain.y+radius*.35,radius,Math.max(.5,radius*.25));
      if(grain.heat>0.45){c.fillStyle=hearthArtColor(BLD.redBright,(grain.heat-.45)*.9);c.fillRect(grain.x-.5,grain.y-.5,1,1);}
    }
    if (!physical) {
      hearthArtVapors(c, chunks, Number(time) || 0);
      // This field is deliberately coarse for CPU fallback. Reconstruct its
      // light smoothly instead of magnifying each cell into a visible block.
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(field.canvas, 0, HEARTH_TOP, HEARTH_WIDTH, HEARTH_HEIGHT);
      c.restore();
    }
    // Contact shadows stay close to each actual hull.
    for (i = 0; i < chunks.length; i++) {
      var body = chunks[i];
      if (body.held) continue;
      c.fillStyle = hearthArtColor(BLD.outline, 0.47);
      var hull = hearthWorldHull(body);
      c.beginPath(); c.moveTo(hull[0][0] + 1.5, hull[0][1] + 2);
      for (var hv = 1; hv < hull.length; hv++) c.lineTo(hull[hv][0] + 1.5, hull[hv][1] + 2);
      c.closePath(); c.fill();
      hearthDrawCoal(c, body, body.x, body.y, 1, time);
    }
    hearthArtEmbers(c, field.sources, air, Number(time) || 0);
    hearthArtEventSparks(c, bed);
    if(bed.sweep>0){
      var rakeX=HEARTH_WIDTH*(1-bed.sweep/0.4);c.strokeStyle=BLD.metalLight;c.lineWidth=2;
      c.beginPath();c.moveTo(rakeX-30,185);c.lineTo(rakeX,205);c.stroke();
      c.fillStyle=BLD.metalBase;c.fillRect(rakeX-10,202,20,2);
      for(var tooth=0;tooth<5;tooth++)c.fillRect(rakeX-10+tooth*5,202,1,6);
    }
    // Reflected heat kisses the chamber edges, never a permanent orange frame.
    if (hot > 0.005) {
      c.fillStyle = hearthArtColor(BLD.redBright, 0.19 * hot);
      c.fillRect(1, 90, 2, 117); c.fillRect(HEARTH_WIDTH - 3, 103, 2, 104);
      c.fillStyle = hearthArtColor(BLD.warmGlow, 0.12 * hot);
      c.fillRect(4, 207, HEARTH_WIDTH - 8, 1);
    }
    c.restore();
  }

  // Called under the game's loading cover; state is intentionally disposable.
  function hearthArtWarm(c) {
    HEARTH_MATERIAL_ORDER.forEach(function(id, i) { var preview = hearthFuelPreview(id); if(preview) hearthDrawCoal(c, preview, 30+i*32, 30, 0.4, 0); });
    var ghost = hearthFuelPreview('coal');
    if (ghost) hearthDrawFuelGhost(c, ghost, 30, 60, 0, true, 1);
    var bed = { air: 0.75, sweep: 0.2, ash: [
      {x:125,y:206,kg:0.0004,heat:0.6,seed:0.3},
      {x:129,y:207,kg:0.0004,heat:0.1,seed:0.7}
    ], sparks: [
      { x: 153, y: 145, vx: -37, vy: -91, t: 0.12, life: 0.8, r: 1.4, heat: 0.85 },
      { x: 164, y: 132, vx: 25, vy: -65, t: 0.42, life: 0.7, r: 1, heat: 0.4 }
    ], chunks: [
      { id: 1, seed: 1.31, x: 142, y: 191, r: 33, angle: 0.4, heat: 0.95, fuel: 0.8, lit: true, flame: 1, smoke: 0.4, steam: 0.2 },
      { id: 2, seed: 4.18, x: 175, y: 192, r: 29, angle: -0.3, heat: 0, fuel: 1 },
      { id: 3, seed: 2.71, x: 160, y: 165, r: 22, angle: 1.3, heat: 0.6, fuel: 0.1, lit: true, flame: 0, coating: 0.8 }
    ] };
    hearthDrawFirebox(c, bed, 0, 0, 160, 160, 0);
    hearthDrawFirebox(c, bed, 0, 0, 160, 160, 0.1);
    hearthDrawCoal(c, bed.chunks[0], 190, 50, 1, 0);
    hearthDrawCoal(c, bed.chunks[1], 225, 50, 1, 0);
    hearthDrawCoal(c, bed.chunks[2], 255, 50, 1, 0);
  }
