/* ============================================================
   FROM THE MACHINE TO THE ATOM  -  the dive engine (v2)
   One scroll-driven canvas. Scroll maps to a global zoom Z in [0,1]
   across 16 rungs (6 m down to 0.3 nm). The OPTICAL span (Z up to
   ~0.33) deep-zooms crisp crops of three high-res photos (machine,
   wafer, die), match-cut at a focal point and cross-dissolved. At the
   resolution of light the image dissolves into the COMPUTED span:
   procedural scenes (logic cells, the copper wiring stack, a transistor,
   the silicon lattice) that fall the rest of the way to a single atom.
   One warm grade unifies everything. A DOM HUD carries the live
   field-of-view readout and a few gated fact cards.

   Only the canvas + opacity are touched per frame; the rAF loop runs
   only while the dive is on screen and the tab is visible. Reduced-motion
   / no-JS visitors get the stacked article in the HTML (this engine
   never runs for them).
   ============================================================ */
(function () {
  'use strict';

  var dive = document.getElementById('dive');
  var canvas = document.getElementById('zoomCanvas');
  if (!dive || !canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var VW = 0, VH = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function easeInPow(t, k) { return Math.pow(clamp(t, 0, 1), k); }
  function log10(x) { return Math.log(x) / Math.LN10; }

  // ---- 16-rung scale ladder: field of view in meters (rung 1 .. rung 16) ----
  var FOV = [6, 2, 0.6, 0.3, 0.06, 0.012, 0.0025, 5e-4, 1e-4, 2e-5, 3e-6, 5e-7, 8e-8, 1.5e-8, 1e-9, 3e-10];
  var LTOP = log10(FOV[0]), LBOT = log10(FOV[FOV.length - 1]), SPAN = LTOP - LBOT; // ~10.3 decades
  function zOf(fov) { return (LTOP - log10(fov)) / SPAN; }
  function fovAt(z) { return Math.pow(10, LTOP - z * SPAN); }
  var PHOTO_END = zOf(FOV[6]); // rung 7, 2.5 mm, ~0.328

  // ---- photo layers (zoom-quilt), each owns a contiguous Z sub-range ----
  // fx,fy = focal point you fall toward (the match-cut anchor).
  var third = PHOTO_END / 3;
  var photo = [
    { src: 'assets/images/zoom/machine.jpg', fx: 0.50, fy: 0.52, z0: 0, z1: third },
    { src: 'assets/images/zoom/wafer.jpg', fx: 0.50, fy: 0.50, z0: third, z1: 2 * third },
    { src: 'assets/images/zoom/die.jpg', fx: 0.50, fy: 0.50, z0: 2 * third, z1: PHOTO_END }
  ];
  var PHOTO_ZOOM = 14;   // crop magnification each photo travels before hand-off
  var DISSOLVE = 0.34;   // fraction of a layer's range spent cross-fading to the next

  // ---- computed scenes, each owns a Z sub-range below the optical limit ----
  var scenes = [
    { kind: 'cells', z0: PHOTO_END, z1: zOf(1e-4) },     // rungs 8-9
    { kind: 'wiring', z0: zOf(1e-4), z1: zOf(3e-6) },    // rungs 10-11
    { kind: 'transistor', z0: zOf(3e-6), z1: zOf(8e-8) },// rungs 12-13
    { kind: 'lattice', z0: zOf(8e-8), z1: 1.0 }          // rungs 14-16
  ];
  var SCENE_ZOOM = 7;    // visual zoom each computed scene travels (true scale is in the readout)
  var GRADE = { warm: 0.16, con: 1.06, vig: 0.42, lift: 0.12 };

  // ---- images ----
  var imgs = [], loaded = 0;
  photo.forEach(function (p, i) {
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { p.W = im.naturalWidth; p.H = im.naturalHeight; loaded++; };
    im.src = p.src; imgs[i] = im;
  });

  function sizeCanvas() {
    VW = dive.querySelector('.viewport').clientWidth;
    VH = dive.querySelector('.viewport').clientHeight;
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    buildScenes();
  }

  // ============================================================
  //  PHOTO ZOOM-QUILT
  // ============================================================
  function drawPhoto(p, im, t, alpha) {
    if (!p.W) return;
    var W = p.W, H = p.H;
    var coverW = Math.min(W, H * (VW / VH));
    var exitW = coverW / PHOTO_ZOOM;
    var cw = Math.min(coverW, coverW * Math.pow(exitW / coverW, clamp(t, 0, 1.05)));
    var ch = cw * (VH / VW);
    var te = easeInPow(clamp(t, 0, 1), 1.6);
    var cx = lerp(W / 2, p.fx * W, te), cy = lerp(H / 2, p.fy * H, te);
    var sx = clamp(cx - cw / 2, 0, Math.max(0, W - cw));
    var sy = clamp(cy - ch / 2, 0, Math.max(0, H - ch));
    ctx.globalAlpha = alpha;
    ctx.filter = 'contrast(' + GRADE.con + ') saturate(' + (1 - GRADE.warm * 0.5) + ') sepia(' + GRADE.warm + ')';
    ctx.drawImage(im, sx, sy, cw, ch, 0, 0, VW, VH);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }

  function renderPhotoSpan(Z) {
    // find active photo layer
    for (var i = 0; i < photo.length; i++) {
      var p = photo[i];
      if (Z >= p.z0 && Z < p.z1 + 1e-6) {
        var t = (Z - p.z0) / (p.z1 - p.z0);
        drawPhoto(p, imgs[i], t, 1);
        // dissolve into next layer over the last DISSOLVE of this range
        if (t > 1 - DISSOLVE && i + 1 < photo.length) {
          var a = (t - (1 - DISSOLVE)) / DISSOLVE;
          var pn = photo[i + 1], tn = (Z - pn.z0) / (pn.z1 - pn.z0); // negative -> clamps to cover
          drawPhoto(pn, imgs[i + 1], tn, a);
        }
        return i;
      }
    }
    return photo.length - 1;
  }

  // ============================================================
  //  COMPUTED SCENES (procedural, gold-graded, internal zoom by t)
  // ============================================================
  var sceneGeo = {};
  function buildScenes() {
    sceneGeo.cells = buildCells(VW, VH);
    sceneGeo.wiring = buildWiring(VW, VH);
    sceneGeo.transistor = { s: Math.min(VW, VH) / 9.2, cx: VW * 0.5, cy: VH * 0.6 };
    sceneGeo.lattice = buildLattice(VW, VH);
  }

  function drawScene(kind, t, alpha, now) {
    var zf = Math.pow(SCENE_ZOOM, clamp(t, 0, 1.05));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(VW / 2, VH / 2); ctx.scale(zf, zf); ctx.translate(-VW / 2, -VH / 2);
    if (kind === 'cells') renderCells(t, now);
    else if (kind === 'wiring') renderWiring(t, now);
    else if (kind === 'transistor') renderTransistor(t, now);
    else if (kind === 'lattice') renderLattice(t, now);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function renderComputedSpan(Z, now) {
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      if (Z >= s.z0 && Z < s.z1 + 1e-6) {
        var t = (Z - s.z0) / (s.z1 - s.z0);
        drawScene(s.kind, t, 1, now);
        if (t > 1 - 0.3 && i + 1 < scenes.length) {
          var a = (t - 0.7) / 0.3;
          drawScene(scenes[i + 1].kind, 0.0, a, now);
        }
        return;
      }
    }
    drawScene('lattice', 1, 1, now);
  }

  // -- cells: a dense logic/SRAM array, rows of small cells, copper-on-dark --
  function buildCells(w, h) {
    var cell = Math.max(10, Math.min(w, h) * 0.05);
    var cells = [];
    var tones = ['#7a5a2e', '#9a7338', '#b98a44', '#5a6470', '#6f7a86', '#caa15a'];
    for (var y = -cell; y < h + cell; y += cell) {
      for (var x = -cell; x < w + cell; x += cell) {
        cells.push({ x: x, y: y, c: tones[(Math.random() * tones.length) | 0], r: 0.55 + Math.random() * 0.4 });
      }
    }
    return { cell: cell, cells: cells };
  }
  function renderCells(t, now) {
    var g = sceneGeo.cells, cell = g.cell;
    g.cells.forEach(function (c) {
      var pad = cell * (1 - c.r) * 0.5;
      ctx.fillStyle = c.c;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(c.x + pad, c.y + pad, cell - pad * 2, cell - pad * 2);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(c.x + pad, c.y + cell * 0.5, cell - pad * 2, 1.2); // a faint routing line
    });
    ctx.globalAlpha = 1;
  }

  // -- wiring: stacked copper "floors" seen from above, vias, slow pulses --
  function buildWiring(w, h) {
    var defs = [
      { pitch: 0.18, horiz: true, width: 11, color: [150, 96, 42], off: [7, 6] },
      { pitch: 0.125, horiz: false, width: 6, color: [196, 126, 58], off: [3, 3] },
      { pitch: 0.078, horiz: true, width: 3.2, color: [150, 152, 160], off: [1, 1] },
      { pitch: 0.05, horiz: false, width: 1.9, color: [120, 172, 196], off: [0, 0] }
    ];
    var ext = 1.6; // overdraw so zoom never reveals blank edges
    var L = defs.map(function (d) {
      var step = Math.max(8, d.pitch * Math.min(w, h));
      var lines = [];
      if (d.horiz) { for (var y = -h * ext; y < h * ext; y += step) lines.push(y); }
      else { for (var x = -w * ext; x < w * ext; x += step) lines.push(x); }
      return { def: d, step: step, lines: lines };
    });
    var pulses = [];
    for (var i = 0; i < 5; i++) pulses.push({ y: (0.12 + 0.18 * i) * h, speed: 36 + i * 20, phase: i * 0.6 });
    return { L: L, pulses: pulses, ext: ext };
  }
  function renderWiring(t, now) {
    var geo = sceneGeo.wiring, w = VW, h = VH, ext = geo.ext;
    geo.L.forEach(function (layer, idx) {
      var d = layer.def;
      ctx.save(); ctx.translate(d.off[0], d.off[1]);
      ctx.strokeStyle = 'rgba(' + d.color[0] + ',' + d.color[1] + ',' + d.color[2] + ',' + (0.4 + idx * 0.06) + ')';
      ctx.lineWidth = d.width; ctx.lineCap = 'butt';
      ctx.beginPath();
      layer.lines.forEach(function (p) {
        if (d.horiz) { ctx.moveTo(-w * ext, p); ctx.lineTo(w * ext, p); }
        else { ctx.moveTo(p, -h * ext); ctx.lineTo(p, h * ext); }
      });
      ctx.stroke(); ctx.restore();
    });
    var g0 = geo.L[0], g1 = geo.L[1];
    ctx.fillStyle = 'rgba(232,196,120,0.7)';
    for (var a = 0; a < g0.lines.length; a++) {
      for (var bx = 0; bx < g1.lines.length; bx += 2) {
        ctx.beginPath(); ctx.arc(g1.lines[bx], g0.lines[a], 2.0, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    var tm = now * 0.001;
    geo.pulses.forEach(function (p) {
      var x = ((tm * p.speed + p.phase * w) % (w + 200)) - 100;
      var grd = ctx.createRadialGradient(x, p.y, 0, x, p.y, 50);
      grd.addColorStop(0, 'rgba(255,214,150,0.5)'); grd.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = grd; ctx.fillRect(x - 54, p.y - 54, 108, 108);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // -- transistor: an isometric FinFET, fins under a gate bar, drifting electrons --
  function renderTransistor(t, now) {
    var g = sceneGeo.transistor, s = g.s, cx = g.cx, cy = g.cy;
    var C = Math.cos(0.5236), S = Math.sin(0.5236);
    function P(x, y, z) { return [cx + (x - y) * C * s, cy + (x + y) * S * s - z * s]; }
    function face(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    function box(x, y, z, dx, dy, dz, top, lft, rgt) {
      var p000 = P(x, y, z + dz), p100 = P(x + dx, y, z + dz), p110 = P(x + dx, y + dy, z + dz), p010 = P(x, y + dy, z + dz);
      var b100 = P(x + dx, y, z), b110 = P(x + dx, y + dy, z), b010 = P(x, y + dy, z);
      face([p000, p100, p110, p010], top); face([p100, b100, b110, p110], rgt); face([p010, p110, b110, b010], lft);
    }
    box(-3.4, -3.4, -0.9, 6.8, 6.8, 0.9, '#1c2630', '#10161d', '#161e26');
    var finXs = [-1.7, -0.1, 1.5];
    finXs.forEach(function (fx) { box(fx, -3.0, 0, 0.7, 6.0, 1.5, '#3b4a5a', '#212b35', '#2c3946'); });
    box(-3.0, -0.7, 0.0, 6.4, 1.4, 2.2, '#caa15a', '#7c5f30', '#9b7942');
    finXs.forEach(function (fx) {
      box(fx - 0.05, -3.0, 1.5, 0.8, 1.0, 0.7, '#9aa6b2', '#5a626c', '#727b85');
      box(fx - 0.05, 2.0, 1.5, 0.8, 1.0, 0.7, '#9aa6b2', '#5a626c', '#727b85');
    });
    ctx.globalCompositeOperation = 'lighter';
    var tm = now * 0.001;
    for (var e = 0; e < 9; e++) {
      var fx2 = finXs[e % 3], prog = ((tm * 0.6 + e * 0.27) % 1), ey = lerp(-2.6, 2.6, prog);
      var pt = P(fx2 + 0.35, ey, 1.7);
      var grd = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 9);
      grd.addColorStop(0, 'rgba(255,226,150,0.85)'); grd.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = grd; ctx.fillRect(pt[0] - 10, pt[1] - 10, 20, 20);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // -- lattice: the silicon diamond-cubic lattice, atoms glowing, slow drift --
  function buildLattice(w, h) {
    var atoms = [], i, j, k, b;
    var basis = [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0]];
    var diamond = [];
    basis.forEach(function (p) { diamond.push(p); diamond.push([p[0] + .25, p[1] + .25, p[2] + .25]); });
    var R = 2;
    for (i = -R; i < R; i++) for (j = -R; j < R; j++) for (k = -R; k < R; k++) {
      for (b = 0; b < diamond.length; b++) {
        var x = diamond[b][0] + i, y = diamond[b][1] + j, z = diamond[b][2] + k;
        if (x * x + y * y + z * z <= 2.4) atoms.push([x, y, z]);
      }
    }
    var bonds = [], d0 = Math.sqrt(3) / 4 + 0.02;
    for (i = 0; i < atoms.length; i++) for (j = i + 1; j < atoms.length; j++) {
      var dx = atoms[i][0] - atoms[j][0], dy = atoms[i][1] - atoms[j][1], dz = atoms[i][2] - atoms[j][2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < d0) bonds.push([i, j]);
    }
    return { atoms: atoms, bonds: bonds, scale: Math.min(w, h) * 0.20, cx: w * 0.5, cy: h * 0.5 };
  }
  function renderLattice(t, now) {
    var geo = sceneGeo.lattice, ang = now * 0.00006, tilt = 0.5;
    var ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
    var pts = geo.atoms.map(function (p) {
      var x = p[0] * ca - p[2] * sa, z = p[0] * sa + p[2] * ca;
      var y = p[1] * ct - z * st, zz = p[1] * st + z * ct;
      var persp = 2.6 / (2.6 - zz * 0.35);
      return { sx: geo.cx + x * geo.scale * persp, sy: geo.cy + y * geo.scale * persp, z: zz, r: persp };
    });
    ctx.lineWidth = 1.4;
    geo.bonds.forEach(function (b) {
      var p = pts[b[0]], q = pts[b[1]], depth = (p.z + q.z) * 0.5;
      ctx.strokeStyle = 'rgba(150,160,150,' + clamp(0.16 + depth * 0.16, 0.04, 0.36) + ')';
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke();
    });
    var order = pts.map(function (p, i) { return i; }).sort(function (a, b) { return pts[a].z - pts[b].z; });
    ctx.globalCompositeOperation = 'lighter';
    order.forEach(function (i) {
      var p = pts[i], rad = 11 * p.r, lum = clamp(0.45 + p.z * 0.4, 0.2, 1);
      var grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad);
      grd.addColorStop(0, 'rgba(' + ((235 * lum) | 0) + ',' + ((224 * lum) | 0) + ',' + ((196 * lum) | 0) + ',0.95)');
      grd.addColorStop(0.45, 'rgba(' + ((212 * lum) | 0) + ',' + ((196 * lum) | 0) + ',' + ((160 * lum) | 0) + ',0.5)');
      grd.addColorStop(1, 'rgba(150,150,150,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, 6.2832); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // ============================================================
  //  GRADE (one warm filmic pass over the whole frame)
  // ============================================================
  function grade() {
    if (GRADE.lift > 0) { ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = 'rgba(20,24,15,' + GRADE.lift + ')'; ctx.fillRect(0, 0, VW, VH); }
    if (GRADE.warm > 0) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(212,170,90,' + (GRADE.warm * 0.8) + ')'; ctx.fillRect(0, 0, VW, VH); }
    ctx.globalCompositeOperation = 'source-over';
    if (GRADE.vig > 0) {
      var g = ctx.createRadialGradient(VW / 2, VH * 0.46, Math.min(VW, VH) * 0.2, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.75);
      g.addColorStop(0, 'rgba(7,9,6,0)'); g.addColorStop(1, 'rgba(7,9,6,' + GRADE.vig + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    }
  }

  // ============================================================
  //  HUD: readout + gated fact cards + spine
  // ============================================================
  var srSize = document.getElementById('srSize'), srPow = document.getElementById('srPow');
  var spineBob = document.getElementById('spineBob');
  var facts = [].slice.call(dive.querySelectorAll('.fact'));
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function supStr(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }
  function fmtSize(m) {
    var v, u;
    if (m >= 1) { v = m; u = 'm'; } else if (m >= 1e-3) { v = m * 1e3; u = 'mm'; }
    else if (m >= 1e-6) { v = m * 1e6; u = 'µm'; } else if (m >= 1e-9) { v = m * 1e9; u = 'nm'; }
    else { v = m * 1e12; u = 'pm'; }
    var s = v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
    return s + ' ' + u;
  }
  function fmtPow(m) { var e = Math.floor(log10(m)); if (e >= 0) return ''; return (m / Math.pow(10, e)).toFixed(1) + ' × 10' + supStr(e) + ' m'; }

  function updateHud(Z) {
    var m = fovAt(Z);
    if (srSize) srSize.textContent = fmtSize(m);
    if (srPow) srPow.textContent = fmtPow(m);
    if (spineBob) spineBob.style.top = (Z * 100).toFixed(2) + '%';
    facts.forEach(function (f) {
      var zc = parseFloat(f.getAttribute('data-zc')), zw = parseFloat(f.getAttribute('data-zw')) || 0.045;
      var op = smoothstep(zc - zw * 1.6, zc - zw * 0.6, Z) * (1 - smoothstep(zc + zw * 0.6, zc + zw * 1.6, Z));
      f.style.opacity = op.toFixed(3);
      f.style.visibility = op < 0.01 ? 'hidden' : 'visible';
      f.style.transform = 'translateY(' + (10 * (1 - op)).toFixed(1) + 'px)';
    });
  }

  // ============================================================
  //  FRAME
  // ============================================================
  function render(now) {
    var rect = dive.getBoundingClientRect();
    var total = dive.offsetHeight - window.innerHeight;
    var Z = clamp(total > 0 ? -rect.top / total : 0, 0, 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = '#07090c'; ctx.fillRect(0, 0, VW, VH);

    if (Z < PHOTO_END - 0.001) {
      renderPhotoSpan(Z);
      // seam: dissolve the last photo into the first computed scene
      if (Z > PHOTO_END - 0.04) {
        var a = smoothstep(PHOTO_END - 0.04, PHOTO_END, Z);
        drawScene('cells', 0, a, now);
      }
    } else {
      // tail of the photo still showing as computed fades up
      if (Z < PHOTO_END + 0.04) {
        var pa = 1 - smoothstep(PHOTO_END, PHOTO_END + 0.04, Z);
        if (pa > 0.01) { var pl = photo[photo.length - 1]; drawPhoto(pl, imgs[photo.length - 1], 1.05, pa); }
      }
      renderComputedSpan(Z, now);
    }

    grade();
    updateHud(Z);
  }

  // ---- rAF loop, only while the dive is on screen ----
  var running = false, rafId = 0;
  function loop(now) { if (!running) return; if (document.hidden) { running = false; return; } render(now); rafId = requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; rafId = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  function init() {
    sizeCanvas();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { e.isIntersecting ? start() : stop(); }); }, { rootMargin: '60px' }).observe(dive);
    } else start();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { sizeCanvas(); render(performance.now()); }, 150); });
    render(performance.now());
  }

  // wait for the first (eager) image before first paint; scenes need no images
  if (imgs[0].complete && imgs[0].naturalWidth) { photo[0].W = imgs[0].naturalWidth; photo[0].H = imgs[0].naturalHeight; loaded = Math.max(loaded, 1); init(); }
  else imgs[0].addEventListener('load', init);

  // expose for headless inspection / debugging
  window.__mta = { render: render, scrollToZ: function (z) { var total = dive.offsetHeight - window.innerHeight; window.scrollTo(0, dive.offsetTop + z * total); }, PHOTO_END: PHOTO_END };
})();
