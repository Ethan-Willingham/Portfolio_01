/* ============================================================
   FROM THE MACHINE TO THE ATOM  -  the dive engine
   A scroll-driven "powers of ten" zoom. One growing scale value
   falls through a stack of layers; each layer's visual scales and
   cross-fades while its fact card and the scale readout are gated
   by depth. Real photos up top, computed scenes (interconnect,
   transistor, silicon lattice) below.

   Only transform + opacity are animated (compositor friendly). The
   rAF loop runs only while the dive is on screen and the tab is
   visible. Reduced-motion / no-JS visitors get the stacked article
   in the HTML/CSS; here we just paint one static frame per scene so
   the computed panels are not blank.
   ============================================================ */
(function () {
  'use strict';

  var dive = document.getElementById('dive');
  if (!dive) return;

  var viewport = dive.querySelector('.viewport');
  var layerEls = [].slice.call(dive.querySelectorAll('.layer'));
  var vises = layerEls.map(function (l) { return l.querySelector('.layer-vis'); });
  var texts = layerEls.map(function (l) { return l.querySelector('.layer-text'); });
  var sizes = layerEls.map(function (l) { return parseFloat(l.getAttribute('data-size')); });
  var N = layerEls.length;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- helpers ----
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- generative scenes ----
  var scenes = buildScenes();

  function buildScenes() {
    var list = [];
    vises.forEach(function (vis, i) {
      var canvas = vis.querySelector('canvas');
      if (!canvas) { list[i] = null; return; }
      var kind = canvas.getAttribute('data-scene');
      list[i] = makeScene(kind, canvas);
    });
    return list;
  }

  function makeScene(kind, canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var geo = null;

    function resize() {
      var w = canvas.offsetWidth || 800;
      var h = canvas.offsetHeight || 533;
      W = w; H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo = build(kind, w, h);
    }

    function draw(now) {
      if (!geo) resize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(kind, ctx, geo, W, H, now);
    }

    return { canvas: canvas, resize: resize, draw: draw };
  }

  // ---- scene geometry builders ----
  function build(kind, w, h) {
    if (kind === 'lattice') return buildLattice(w, h);
    if (kind === 'interconnect') return buildInterconnect(w, h);
    if (kind === 'transistor') return buildTransistor(w, h);
    return {};
  }

  function buildInterconnect(w, h) {
    // four stacked "metal layers", coarse bright copper on top to fine cool
    // wires beneath, drawn top-down like city floors seen from above.
    var defs = [
      { pitch: 0.16, horiz: true,  width: 9,   color: [150, 96, 42],  off: [6, 5] },
      { pitch: 0.115, horiz: false, width: 5.2, color: [196, 126, 58], off: [3, 3] },
      { pitch: 0.072, horiz: true,  width: 3.0, color: [150, 152, 160], off: [1, 1] },
      { pitch: 0.044, horiz: false, width: 1.7, color: [120, 172, 196], off: [0, 0] }
    ];
    var L = defs.map(function (d) {
      var step = Math.max(8, d.pitch * Math.min(w, h));
      var lines = [];
      if (d.horiz) { for (var y = step * 0.5; y < h + step; y += step) lines.push(y); }
      else { for (var x = step * 0.5; x < w + step; x += step) lines.push(x); }
      return { def: d, step: step, lines: lines };
    });
    // a few signal tracks that pulse along the top copper
    var pulses = [];
    for (var i = 0; i < 5; i++) pulses.push({ y: (0.12 + 0.18 * i) * h, speed: 40 + i * 22, phase: i * 0.6 });
    return { L: L, pulses: pulses };
  }

  function buildTransistor(w, h) {
    var s = Math.min(w, h) / 9.2;          // iso unit
    var cx = w * 0.5, cy = h * 0.62;
    return { s: s, cx: cx, cy: cy };
  }

  function buildLattice(w, h) {
    var atoms = [], i, j, k, b;
    var basis = [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0]];
    var diamond = [];
    basis.forEach(function (p) { diamond.push(p); diamond.push([p[0] + .25, p[1] + .25, p[2] + .25]); });
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) for (k = 0; k < 2; k++) {
      for (b = 0; b < diamond.length; b++) {
        var x = diamond[b][0] + i - 1, y = diamond[b][1] + j - 1, z = diamond[b][2] + k - 1;
        if (x * x + y * y + z * z <= 0.95) atoms.push([x, y, z]);
      }
    }
    // bonds: nearest-neighbour at a*sqrt(3)/4 ~ 0.4330
    var bonds = [];
    var d0 = Math.sqrt(3) / 4 + 0.02;
    for (i = 0; i < atoms.length; i++) for (j = i + 1; j < atoms.length; j++) {
      var dx = atoms[i][0] - atoms[j][0], dy = atoms[i][1] - atoms[j][1], dz = atoms[i][2] - atoms[j][2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < d0) bonds.push([i, j]);
    }
    return { atoms: atoms, bonds: bonds, scale: Math.min(w, h) * 0.34, cx: w * 0.5, cy: h * 0.5 };
  }

  // ---- scene renderers ----
  function render(kind, ctx, geo, w, h, now) {
    if (kind === 'interconnect') return renderInterconnect(ctx, geo, w, h, now);
    if (kind === 'transistor') return renderTransistor(ctx, geo, w, h, now);
    if (kind === 'lattice') return renderLattice(ctx, geo, w, h, now);
  }

  function renderInterconnect(ctx, geo, w, h, now) {
    ctx.fillStyle = '#090b06';
    ctx.fillRect(0, 0, w, h);
    var t = now * 0.001;
    geo.L.forEach(function (layer, idx) {
      var d = layer.def;
      var ox = d.off[0], oy = d.off[1];
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = 'rgba(' + d.color[0] + ',' + d.color[1] + ',' + d.color[2] + ',' + (0.34 + idx * 0.06) + ')';
      ctx.lineWidth = d.width;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      layer.lines.forEach(function (p) {
        if (d.horiz) { ctx.moveTo(-10, p); ctx.lineTo(w + 10, p); }
        else { ctx.moveTo(p, -10); ctx.lineTo(p, h + 10); }
      });
      ctx.stroke();
      ctx.restore();
    });
    // vias: bright dots on a coarse grid where layers cross
    var g0 = geo.L[0], g1 = geo.L[1];
    ctx.fillStyle = 'rgba(232,196,120,0.7)';
    for (var a = 0; a < g0.lines.length; a++) {
      for (var bx = 0; bx < g1.lines.length; bx += 2) {
        var vy = g0.lines[a], vx = g1.lines[bx];
        ctx.beginPath(); ctx.arc(vx, vy, 1.7, 0, 6.2832); ctx.fill();
      }
    }
    // slow signal pulses on the top copper
    ctx.globalCompositeOperation = 'lighter';
    geo.pulses.forEach(function (p) {
      var x = ((t * p.speed + p.phase * w) % (w + 200)) - 100;
      var grd = ctx.createRadialGradient(x, p.y, 0, x, p.y, 46);
      grd.addColorStop(0, 'rgba(255,214,150,0.55)');
      grd.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - 50, p.y - 50, 100, 100);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderTransistor(ctx, geo, w, h, now) {
    ctx.fillStyle = '#0b0f0a';
    ctx.fillRect(0, 0, w, h);
    var s = geo.s, cx = geo.cx, cy = geo.cy;
    var C = Math.cos(0.5236), S = Math.sin(0.5236); // 30deg iso
    function P(x, y, z) { return [cx + (x - y) * C * s, cy + (x + y) * S * s - z * s]; }
    function face(pts, fill) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function box(x, y, z, dx, dy, dz, top, lft, rgt) {
      var p000 = P(x, y, z + dz), p100 = P(x + dx, y, z + dz), p110 = P(x + dx, y + dy, z + dz), p010 = P(x, y + dy, z + dz);
      var b100 = P(x + dx, y, z), b110 = P(x + dx, y + dy, z), b010 = P(x, y + dy, z);
      face([p000, p100, p110, p010], top);          // top
      face([p100, b100, b110, p110], rgt);           // right side
      face([p010, p110, b110, b010], lft);           // front side
    }
    // substrate slab
    box(-3.4, -3.4, -0.9, 6.8, 6.8, 0.9, '#1c2630', '#10161d', '#161e26');
    // three fins running front-to-back (along y)
    var finXs = [-1.7, -0.1, 1.5];
    finXs.forEach(function (fx) {
      box(fx, -3.0, 0, 0.7, 6.0, 1.5, '#3b4a5a', '#212b35', '#2c3946');
    });
    // gate bar crossing over the fins (along x), raised
    box(-3.0, -0.7, 0.0, 6.4, 1.4, 2.2, '#caa15a', '#7c5f30', '#9b7942');
    // source / drain contacts on the fin ends
    finXs.forEach(function (fx) {
      box(fx - 0.05, -3.0, 1.5, 0.8, 1.0, 0.7, '#9aa6b2', '#5a626c', '#727b85');
      box(fx - 0.05, 2.0, 1.5, 0.8, 1.0, 0.7, '#9aa6b2', '#5a626c', '#727b85');
    });
    // electrons drifting under the gate (source -> drain), faint
    ctx.globalCompositeOperation = 'lighter';
    var t = now * 0.001;
    for (var e = 0; e < 9; e++) {
      var fx2 = finXs[e % 3];
      var prog = ((t * 0.6 + e * 0.27) % 1);
      var ey = lerp(-2.6, 2.6, prog);
      var pt = P(fx2 + 0.35, ey, 1.7);
      var grd = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 9);
      grd.addColorStop(0, 'rgba(255,226,150,0.85)');
      grd.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(pt[0] - 10, pt[1] - 10, 20, 20);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderLattice(ctx, geo, w, h, now) {
    ctx.fillStyle = '#070a06';
    ctx.fillRect(0, 0, w, h);
    var ang = now * 0.00007;
    var tilt = 0.5;
    var ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
    var pts = geo.atoms.map(function (p) {
      var x = p[0] * ca - p[2] * sa;
      var z = p[0] * sa + p[2] * ca;
      var y = p[1] * ct - z * st;
      var zz = p[1] * st + z * ct;
      var persp = 2.6 / (2.6 - zz * 0.5);
      return { sx: geo.cx + x * geo.scale * persp, sy: geo.cy + y * geo.scale * persp, z: zz, r: persp };
    });
    // bonds first (dim)
    ctx.lineWidth = 1.4;
    geo.bonds.forEach(function (b) {
      var p = pts[b[0]], q = pts[b[1]];
      var depth = (p.z + q.z) * 0.5;
      var alpha = clamp(0.18 + depth * 0.18, 0.05, 0.4);
      ctx.strokeStyle = 'rgba(150,160,150,' + alpha + ')';
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke();
    });
    // atoms, far to near
    var order = pts.map(function (p, i) { return i; }).sort(function (a, b) { return pts[a].z - pts[b].z; });
    ctx.globalCompositeOperation = 'lighter';
    order.forEach(function (i) {
      var p = pts[i];
      var rad = 12 * p.r;
      var lum = clamp(0.45 + p.z * 0.4, 0.2, 1);
      var grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad);
      grd.addColorStop(0, 'rgba(' + Math.round(235 * lum) + ',' + Math.round(224 * lum) + ',' + Math.round(196 * lum) + ',0.95)');
      grd.addColorStop(0.45, 'rgba(' + Math.round(212 * lum) + ',' + Math.round(196 * lum) + ',' + Math.round(160 * lum) + ',0.5)');
      grd.addColorStop(1, 'rgba(150,150,150,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, 6.2832); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- scale readout ----
  var srSize = document.getElementById('srSize');
  var srPow = document.getElementById('srPow');
  var spineBob = document.getElementById('spineBob');
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function supStr(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }

  function fmtSize(m) {
    var v, u;
    if (m >= 1) { v = m; u = 'm'; }
    else if (m >= 1e-3) { v = m * 1e3; u = 'mm'; }
    else if (m >= 1e-6) { v = m * 1e6; u = 'µm'; }
    else if (m >= 1e-9) { v = m * 1e9; u = 'nm'; }
    else { v = m * 1e12; u = 'pm'; }
    var s;
    if (v >= 100) s = String(Math.round(v));
    else if (v >= 10) s = v.toFixed(0);
    else if (v >= 1) s = v.toFixed(1);
    else s = v.toFixed(2);
    return s + ' ' + u;
  }

  function fmtPow(m) {
    var e = Math.floor(Math.log10(m));
    if (e >= 0) return '';
    var mant = m / Math.pow(10, e);
    return mant.toFixed(1) + ' × 10' + supStr(e) + ' m';
  }

  function updateReadout(depth) {
    var i = clamp(Math.floor(depth), 0, N - 1);
    var j = clamp(i + 1, 0, N - 1);
    var f = clamp(depth - i, 0, 1);
    var logm = lerp(Math.log10(sizes[i]), Math.log10(sizes[j]), f);
    var m = Math.pow(10, logm);
    if (srSize) srSize.textContent = fmtSize(m);
    if (srPow) srPow.textContent = fmtPow(m);
  }

  // ============================================================
  //  Reduced-motion / fallback: paint one static frame, then stop.
  // ============================================================
  if (reduce) {
    scenes.forEach(function (sc) { if (sc) { sc.resize(); sc.draw(4200); } });
    return;
  }

  // ============================================================
  //  ZOOM MODE
  // ============================================================
  var ZOOM = 6.0;

  function sizeScenes() { scenes.forEach(function (sc) { if (sc) sc.resize(); }); }
  sizeScenes();

  var running = false, rafId = 0;

  function update(now) {
    var rect = dive.getBoundingClientRect();
    var total = dive.offsetHeight - window.innerHeight;
    var scrolled = clamp(-rect.top, 0, total);
    var p = total > 0 ? scrolled / total : 0;
    var depth = p * (N - 1);

    for (var i = 0; i < N; i++) {
      var d = depth - i;
      var scale = Math.pow(ZOOM, d);
      var fin = smoothstep(-1.0, -0.15, d);
      var fout = 1 - smoothstep(0.35, 1.0, d);
      var op = fin * fout;
      var vis = vises[i];
      if (op < 0.004) {
        vis.style.visibility = 'hidden';
      } else {
        vis.style.visibility = 'visible';
        vis.style.opacity = op.toFixed(3);
        vis.style.transform = 'scale(' + scale.toFixed(4) + ')';
        if (scenes[i] && op > 0.02) scenes[i].draw(now);
      }
      // fact card gate
      var tin = smoothstep(-0.5, -0.16, d);
      var tout = 1 - smoothstep(0.22, 0.6, d);
      var top = tin * tout;
      var tx = texts[i];
      tx.style.opacity = top.toFixed(3);
      tx.style.transform = 'translateY(' + (8 * (1 - top)).toFixed(1) + 'px)';
      tx.style.visibility = top < 0.01 ? 'hidden' : 'visible';
    }

    updateReadout(depth);
    if (spineBob) spineBob.style.top = (p * 100).toFixed(2) + '%';
  }

  function loop(now) {
    if (!running) return;
    if (document.hidden) { running = false; return; }
    update(now);
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; rafId = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { rootMargin: '50px' });
    io.observe(dive);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) start();
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { sizeScenes(); update(performance.now()); }, 150);
  });

  // first paint
  update(performance.now());
})();
