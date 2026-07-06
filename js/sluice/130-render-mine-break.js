  // ====== MINE BREAK FX ====================================================
  // Block-break feedback ported from the mine-lab.html chooser. Subtle,
  // physical debris: rounded rock chips that collide with the terrain via
  // solidAt(), bounce + settle, plus fine grit, a soft dust bloom, and a
  // material-hued flash/ring reserved for high-value ore (the 'rare' tier,
  // value >= 800) so common mining (dirt/stone/low ore) stays debris-only.
  // Tier (soft/hard/ore/rare) is derived from the tile's ORES entry. The
  // 'hard' (stone) and 'ore' (low-value) tiers spawn chips/grit/dust like
  // 'soft', just faster/more; only 'rare' adds the bloom + sparks.
  // Drawn in world space in the entity
  // pass (after explosions). Chip fill is a per-frame radial gradient — fine
  // at these counts; bake to a sprite if it ever shows on the perf panel.
  // The game's existing hit-pause + squash supply the "punch"; the screen
  // kick is intentionally left for a follow-up (needs the render transform).
  var mineChips = [], mineGrit = [], mineDust = [], mineFlashes = [];
  function mineRand(a, b) { return a + Math.random() * (b - a); }
  function mineHexRGB(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mineShade(h, amt) { var c = mineHexRGB(h), f = amt < 0 ? 0 : 255, t = Math.abs(amt);
    return 'rgb(' + Math.round(c[0] + (f - c[0]) * t) + ',' + Math.round(c[1] + (f - c[1]) * t) + ',' + Math.round(c[2] + (f - c[2]) * t) + ')'; }
  function mineRgba(h, a) { var c; if (h.charAt(0) === '#') c = mineHexRGB(h); else { var m = h.match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return h; c = [+m[1], +m[2], +m[3]]; } return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  // ----- Crack telegraph: chiselled fractures that grow from the contact face as the drill bites in -----
  var mineCrackCache = {};
  function mineCrackFor(r, c, dir) {
    var key = r + ':' + c + ':' + dir, cached = mineCrackCache[key]; if (cached) return cached;
    if (Object.keys(mineCrackCache).length > 150) mineCrackCache = {};
    var seed = (r * 73856093 ^ c * 19349663 ^ ((dir ? dir.charCodeAt(0) : 100) * 2654435)) >>> 0;
    function rng() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function r0(a, b) { return a + rng() * (b - a); }
    var ox = dir === 'l' ? TILE * 0.34 : dir === 'r' ? -TILE * 0.34 : 0, oy = dir === 'd' ? -TILE * 0.34 : dir === 'u' ? TILE * 0.34 : 0;
    var ix = dir === 'l' ? -1 : dir === 'r' ? 1 : 0, iy = dir === 'd' ? 1 : dir === 'u' ? -1 : 0;
    var baseAng = Math.atan2(iy || 0.001, ix || 0.001), strokes = [], lim = TILE * 0.46, main = 2 + ((rng() * 2) | 0);
    for (var m2 = 0; m2 < main; m2++) {
      var ang = baseAng + r0(-0.95, 0.95), segs = 4 + ((rng() * 3) | 0), seglen = (TILE * 0.72) / segs, px = ox, py = oy, pts = [[px, py]];
      for (var s = 0; s < segs; s++) { ang += r0(-0.5, 0.5); px += Math.cos(ang) * seglen * r0(0.7, 1.2); py += Math.sin(ang) * seglen * r0(0.7, 1.2);
        px = Math.max(-lim, Math.min(lim, px)); py = Math.max(-lim, Math.min(lim, py)); pts.push([px, py]); }
      strokes.push(pts);
      if (rng() < 0.7 && pts.length > 3) { var bi = 2 + ((rng() * (pts.length - 3)) | 0), bx = pts[bi][0], by = pts[bi][1], ba = ang + r0(-1.5, 1.5), bsegs = 2 + ((rng() * 2) | 0), bpts = [[bx, by]];
        for (var b = 0; b < bsegs; b++) { ba += r0(-0.5, 0.5); bx += Math.cos(ba) * seglen * 0.7; by += Math.sin(ba) * seglen * 0.7; bx = Math.max(-lim, Math.min(lim, bx)); by = Math.max(-lim, Math.min(lim, by)); bpts.push([bx, by]); }
        strokes.push(bpts); }
    }
    mineCrackCache[key] = { strokes: strokes }; return mineCrackCache[key];
  }
  function mineDrawCrack(cxw, cyw, pts, baseW, grow, alpha) {
    var n = pts.length, show = Math.max(2, Math.min(n, Math.ceil(n * grow))), L = [], R = [], i;
    for (i = 0; i < show; i++) { var p = pts[i], a = pts[Math.min(i + 1, show - 1)], b = pts[Math.max(i - 1, 0)];
      var dx = a[0] - b[0], dy = a[1] - b[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, w = baseW * (1 - i / (n - 1)) * 0.5; if (w < 0.3) w = 0.3;
      L.push([cxw + p[0] + nx * w, cyw + p[1] + ny * w]); R.push([cxw + p[0] - nx * w, cyw + p[1] - ny * w]); }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath();
    ctx.fillStyle = 'rgba(8,5,3,' + alpha + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.16) + ')'; ctx.lineWidth = 0.6; ctx.beginPath();
    ctx.moveTo(L[0][0] - 0.4, L[0][1] - 0.5); for (i = 1; i < L.length; i++) ctx.lineTo(L[i][0] - 0.4, L[i][1] - 0.5); ctx.stroke();
  }
  function mineDrawCracks(r, c, dir, prog) {
    var cr = mineCrackFor(r, c, dir), dx = c * TILE + TILE / 2, dy = r * TILE + TILE / 2, grow = Math.min(1, (prog - 0.06) / 0.94);
    ctx.save(); ctx.beginPath(); ctx.rect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1); ctx.clip();
    var baseW = (TILE / 40) * (2.4 + grow * 1.4);
    for (var ci = 0; ci < cr.strokes.length; ci++) { var sg = Math.min(1, grow * 1.25 - ci * 0.08); if (sg <= 0.05) continue;
      mineDrawCrack(dx, dy, cr.strokes[ci], baseW, Math.max(0.12, sg), 0.34 + grow * 0.42); }
    ctx.restore();
  }
  function mineTier(tile) {
    var type = tile && tile.type, def = ORES[type], val = def ? def.value : 0, color = def ? def.color : '#6b4d34';
    if (type === 'dirt' || !def) return { tier:'soft', color:color, speed:42,  dust:2, grit:6,  flash:0,    ring:0,   sparks:0 };
    if (val === 0)              return { tier:'hard', color:color, speed:80,  dust:2, grit:8,  flash:0,    ring:0,   sparks:0 };
    if (val >= 800)             return { tier:'rare', color:color, speed:100, dust:3, grit:10, flash:0.85, ring:1.0, sparks:3 };
    return                            { tier:'ore',  color:color, speed:80,  dust:2, grit:8,  flash:0,    ring:0,   sparks:0 };
  }
  function spawnMineBreak(r, c, tile) {
    var P = mineTier(tile), cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
    var col = P.color, hi = mineShade(col, 0.36), lo = mineShade(col, -0.28);
    var nChips = P.tier === 'rare' ? 16 : P.tier === 'soft' ? 12 : 13, i;
    for (i = 0; i < nChips; i++) {
      var fx = cx + mineRand(-TILE * 0.34, TILE * 0.34), fy = cy + mineRand(-TILE * 0.34, TILE * 0.34);
      var ang = Math.atan2(fy - cy, fx - cx) + mineRand(-0.8, 0.8), sp = P.speed * mineRand(0.4, 1.35);
      var cr = TILE * mineRand(0.03, 0.10), pn = 6 + ((Math.random() * 4) | 0), elong = mineRand(0.7, 1.5), outline = [];
      for (var a2 = 0; a2 < pn; a2++) { var oa = (a2 / pn) * 6.2832 + mineRand(-0.3, 0.3), rr = cr * mineRand(0.55, 1.0);
        outline.push([Math.cos(oa) * rr * elong, Math.sin(oa) * rr / Math.sqrt(elong)]); }
      mineChips.push({ x:fx, y:fy, outline:outline, r:cr, rest:false,
        vx: Math.cos(ang) * sp + mineRand(-22, 22), vy: Math.sin(ang) * sp - mineRand(15, 70),
        rot: mineRand(0, 6.28), vrot: mineRand(-7, 7), t:0, maxT: mineRand(0.45, 0.75),
        base: col, hi: hi, lo: lo,
        spec: P.tier === 'rare' ? '#ffffff' : P.tier === 'ore' ? mineShade(col, 0.7) : (Math.random() < 0.4 ? mineShade(col, 0.5) : null) });
    }
    if (mineChips.length > 500) mineChips.splice(0, mineChips.length - 500);
    for (i = 0; i < P.grit; i++) { var ga = mineRand(0, 6.2832), gs = mineRand(30, 150);
      mineGrit.push({ x: cx + mineRand(-10, 10), y: cy + mineRand(-10, 10), vx: Math.cos(ga) * gs, vy: Math.sin(ga) * gs - mineRand(15, 60),
        t:0, maxT: mineRand(0.22, 0.45), size: mineRand(1, 2), color: mineShade(col, -0.2), stuck:false }); }
    if (mineGrit.length > 400) mineGrit.splice(0, mineGrit.length - 400);
    for (i = 0; i < P.dust; i++) {
      mineDust.push({ x: cx + mineRand(-6, 6), y: cy + mineRand(-4, 4), vy: mineRand(-20, -42), delay: mineRand(0.03, 0.10),
        t:0, maxT: mineRand(0.4, 0.65), r: TILE * 0.14, r1: TILE * 0.32 * mineRand(1.5, 2.2), color: mineShade(col, 0.26) }); }
    if (P.flash > 0) mineFlashes.push({ kind:'flash', x:cx, y:cy, t:0, maxT: 0.10 + P.flash * 0.05, r: TILE * (0.45 + P.flash * 0.55),
      color: P.tier === 'rare' ? '#eafcff' : mineShade(col, 0.5), strength: P.flash, delay:0 });
    if (P.ring > 0) mineFlashes.push({ kind:'ring', x:cx, y:cy, t:0, maxT: 0.16 + P.ring * 0.06, r0: TILE * 0.25, r1: TILE * (0.8 + P.ring * 0.7),
      color: P.tier === 'rare' ? '#bfefff' : mineShade(col, 0.45), width: 1 + P.ring, delay:0 });
    for (i = 0; i < P.sparks; i++) mineFlashes.push({ kind:'spark', x: cx + mineRand(-TILE * 0.4, TILE * 0.4), y: cy + mineRand(-TILE * 0.4, TILE * 0.4),
      delay: mineRand(0, 0.05), t:0, maxT: mineRand(0.35, 0.6), size: mineRand(2, 5), rot: mineRand(0, 1.57), color: '#dffaff' });
    if (mineFlashes.length > 120) mineFlashes.splice(0, mineFlashes.length - 120);
  }
  function mineCollide(p, dt, rest, frict, rad) {
    rad = rad || 1; p.vy += 760 * dt;
    var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, hit = false;
    if (solidAt(nx, p.y, 1, 1)) { nx = p.vx > 0 ? Math.floor(nx / TILE) * TILE - rad : (Math.floor(nx / TILE) + 1) * TILE + rad; p.vx = -p.vx * rest; p.vy *= frict; hit = true; }
    if (solidAt(nx, ny, 1, 1)) { ny = p.vy > 0 ? Math.floor(ny / TILE) * TILE - rad : (Math.floor(ny / TILE) + 1) * TILE + rad; p.vy = -p.vy * rest; p.vx *= frict; hit = true; }
    p.x = nx; p.y = ny; return hit;
  }
  function updateMineFx(dt) {
    if (dt > 0.05) dt = 0.05;
    var i;
    for (i = mineChips.length - 1; i >= 0; i--) { var s = mineChips[i]; s.t += dt; if (s.t >= s.maxT) { mineChips.splice(i, 1); continue; }
      if (!s.rest) { var hit = mineCollide(s, dt, 0.4, 0.6, s.r); if (hit) s.vrot = s.vrot * 0.5 + s.vx * 0.03; s.rot += s.vrot * dt;
        if (Math.abs(s.vx) + Math.abs(s.vy) < 14 && solidAt(s.x, s.y + s.r + 2, 1, 1)) { s.rest = true; s.vx = 0; s.vy = 0; s.vrot = 0; } } }
    for (i = mineGrit.length - 1; i >= 0; i--) { var gr = mineGrit[i]; gr.t += dt; if (gr.t >= gr.maxT) { mineGrit.splice(i, 1); continue; }
      if (!gr.stuck) { mineCollide(gr, dt, 0.25, 0.5, 1); if (Math.abs(gr.vx) + Math.abs(gr.vy) < 12 && solidAt(gr.x, gr.y + 2, 1, 1)) gr.stuck = true; } }
    for (i = mineDust.length - 1; i >= 0; i--) { var d = mineDust[i]; if (d.delay > 0) { d.delay -= dt; continue; } d.t += dt; if (d.t >= d.maxT) { mineDust.splice(i, 1); continue; }
      d.y += d.vy * dt; d.vy *= Math.pow(0.4, dt); d.r += (d.r1 - d.r) * Math.min(1, dt * 4); }
    for (i = mineFlashes.length - 1; i >= 0; i--) { var f = mineFlashes[i]; if (f.delay > 0) { f.delay -= dt; continue; } f.t += dt; if (f.t >= f.maxT) mineFlashes.splice(i, 1); }
  }
  function drawMineFx() {
    if (!mineChips.length && !mineGrit.length && !mineDust.length && !mineFlashes.length) return;
    var i;
    for (i = 0; i < mineDust.length; i++) { var d = mineDust[i]; if (d.delay > 0) continue; var da = Math.sin(Math.min(1, d.t / d.maxT) * Math.PI) * 0.26;
      var gd = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); gd.addColorStop(0, mineRgba(d.color, da)); gd.addColorStop(1, mineRgba(d.color, 0));
      ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill(); }
    for (i = 0; i < mineChips.length; i++) { var s = mineChips[i], life = s.t / s.maxT, a = life > 0.8 ? 1 - (life - 0.8) / 0.2 : 1, sh = s.rest ? 1 : 1 - life * 0.12;
      var scc = Math.floor(s.x / TILE), sr0 = Math.floor(s.y / TILE);
      for (var rr = sr0; rr <= sr0 + 2; rr++) { if (solidAt(scc * TILE + 1, rr * TILE + 1, 1, 1)) { var syy = rr * TILE, prox = 1 - Math.max(0, (syy - s.y)) / (TILE * 1.4);
        if (prox > 0) { ctx.globalAlpha = a * 0.18 * prox; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(s.x, syy - 1.2, s.r * (0.85 + prox * 0.5), s.r * 0.34, 0, 0, 6.2832); ctx.fill(); } break; } }
      ctx.globalAlpha = a; ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.scale(sh, sh);
      var o = s.outline, m0x = (o[o.length - 1][0] + o[0][0]) / 2, m0y = (o[o.length - 1][1] + o[0][1]) / 2;
      ctx.beginPath(); ctx.moveTo(m0x, m0y);
      for (var k = 0; k < o.length; k++) { var cu = o[k], nn = o[(k + 1) % o.length]; ctx.quadraticCurveTo(cu[0], cu[1], (cu[0] + nn[0]) / 2, (cu[1] + nn[1]) / 2); }
      ctx.closePath();
      var gg = ctx.createRadialGradient(-s.r * 0.4, -s.r * 0.45, 0, 0, 0, s.r * 1.35);
      gg.addColorStop(0, s.hi); gg.addColorStop(0.55, s.base); gg.addColorStop(1, s.lo);
      ctx.fillStyle = gg; ctx.fill();
      if (s.spec) { ctx.globalAlpha = a * 0.6; ctx.fillStyle = s.spec; ctx.beginPath(); ctx.arc(-s.r * 0.33, -s.r * 0.4, s.r * 0.22, 0, 6.2832); ctx.fill(); }
      ctx.restore(); }
    ctx.globalAlpha = 1;
    for (i = 0; i < mineGrit.length; i++) { var g2 = mineGrit[i]; ctx.globalAlpha = (1 - g2.t / g2.maxT) * 0.65; ctx.fillStyle = g2.color; ctx.beginPath(); ctx.arc(g2.x, g2.y, g2.size * 0.5, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < mineFlashes.length; i++) { var f = mineFlashes[i]; if (f.delay > 0) continue; var ft = f.t / f.maxT;
      if (f.kind === 'ring') { var r2 = f.r0 + (f.r1 - f.r0) * (1 - Math.pow(1 - ft, 4)); ctx.globalAlpha = (1 - ft) * 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = f.width * (1 - ft * 0.6); ctx.beginPath(); ctx.arc(f.x, f.y, r2, 0, 6.2832); ctx.stroke(); }
      else if (f.kind === 'spark') { var sa = Math.sin(ft * Math.PI), sz = f.size * (0.6 + sa * 0.6); ctx.globalAlpha = sa; ctx.strokeStyle = f.color; ctx.lineWidth = 1.4;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); ctx.moveTo(0, -sz); ctx.lineTo(0, sz); ctx.stroke(); ctx.restore(); }
      else { var br = f.r * (0.7 + ft * 0.5); var bg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, br); bg.addColorStop(0, mineRgba(f.color, (1 - ft) * Math.min(1, f.strength + 0.3))); bg.addColorStop(1, mineRgba(f.color, 0));
        ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(f.x, f.y, br, 0, 6.2832); ctx.fill(); } }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // ====== end MINE BREAK FX ===============================================

  function cacheLayerName(rowLayer, kind) {
    var layerName = materialLayer(rowLayer);
    if (layerName === 'magma' || layerName === 'mantle') {
      layerName = kind === 'stone' ? 'bedrock' : 'deepcrust';
    }
    return layerName;
  }

  // v25.63 — Permafrost no longer gets a per-tile ice overlay. It renders as
  // a cold palette (see TILE_MATERIALS.dirt/stone.permafrost) straight through
  // the same seamless world-coord wash + chunk detail field that topsoil uses,
  // so permafrost dirt and stone tile perfectly (the old drawPermafrostFrost
  // painted tile-local gradients + a bright top edge, which read as a grid).
  // Cave-ceiling icicles below are still drawn live.

  // Ice icicles hanging from a permafrost cave ceiling — a solid tile
  // with open space below. Drawn LIVE (after the terrain composite) so
  // they hang into the open cave without the void-erase pass clipping
  // them. Static geometry, hashed on (r,c).
  function drawPermafrostIcicles(tx, ty, r, c) {
    var n = 2 + ((tileHash01(r, c, 0x1D01) * 3) | 0);   // 2..4 icicles
    for (var i = 0; i < n; i++) {
      var ix = tx + 4 + ((tileHash01(r, c, 0x1D10 + i) * (TILE - 8)) | 0);
      var ilen = 6 + ((tileHash01(r, c, 0x1D20 + i) * 12) | 0);    // 6..17 px long
      var iw = 1 + (tileHash01(r, c, 0x1D30 + i) < 0.5 ? 0 : 1);   // root half-width 1..2
      for (var u = 0; u < ilen; u++) {
        var hw = Math.round(iw * (1 - u / ilen));
        for (var dx = -hw; dx <= hw; dx++) {
          ctx.fillStyle = (dx === -hw || dx === hw) ? '#7fa8c8'
                        : (dx < 0) ? '#dff1fb' : '#a9cfe6';
          ctx.fillRect(ix + dx, ty + TILE + u, 1, 1);
        }
      }
      ctx.fillStyle = '#ffffff';                                  // meltwater bead at the tip
      ctx.fillRect(ix, ty + TILE + ilen - 1, 1, 1);
    }
  }

  // ===== Magma / mantle crust (v25.63 overhaul) =====
  // The old magma decoration was a per-TILE vertical gradient plus a per-tile
  // hashed vein whose vertices were clamped inside one tile — so the rock
  // banded at every tile row and the "lava" read as a repeating grid of
  // identical orange hooks (it did NOT tile). The crust below is built the
  // same way dirt/stone tile seamlessly: everything is hashed on a WORLD grid,
  // independent of tile origin, so the cooled-basalt plates and the glowing
  // molten cracks flow continuously across tile (and chunk) boundaries. Shared
  // by the baked chunk (drawCachedLayerDecoration), the live redraw that covers
  // smooth void edges (140-render-maindraw), and the shatter FX — one look
  // everywhere. Callers need not clip; the function clips itself to the tile so
  // seams never bleed into an adjacent layer or ore tile.
  var MAGMA_PLATE = 34;    // crack-network cell size in world px
  var MAGMA_MOTTLE = 20;   // basalt-blotch grid in world px
  function magmaCrustNode(gr, gc) {
    return {
      x: gc * MAGMA_PLATE + (tileHash01(gr, gc, 0x51A1) - 0.5) * MAGMA_PLATE * 0.62,
      y: gr * MAGMA_PLATE + (tileHash01(gr, gc, 0x51A2) - 0.5) * MAGMA_PLATE * 0.62
    };
  }
  function magmaCrustSeam(a, b, gr, gc, salt, pass, hot) {
    // heat eased toward 0 (~h^1.8): most seams are dim hairline cracks, a few
    // run bright and molten — dark plates with a scatter of live veins, not a
    // uniform orange net.
    var h = tileHash01(gr, gc, salt);
    var heat = h * h * (1.7 - 0.7 * h);
    var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    var pxp = -(b.y - a.y), pyp = (b.x - a.x);
    var plen = Math.hypot(pxp, pyp) || 1;
    var jit = (tileHash01(gr, gc, salt ^ 0x1234) - 0.5) * 9;
    mx += pxp / plen * jit; my += pyp / plen * jit;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    if (pass === 0) {
      ctx.strokeStyle = hot ? 'rgba(206,38,14,' + (0.02 + heat * 0.20).toFixed(3) + ')'
                            : 'rgba(230,60,18,' + (0.02 + heat * 0.19).toFixed(3) + ')';
      ctx.lineWidth = 2.4 + heat * 3.4;
      ctx.stroke();
    } else {
      ctx.strokeStyle = hot ? 'rgba(255,84,34,' + (0.07 + heat * 0.60).toFixed(3) + ')'
                            : 'rgba(255,116,42,' + (0.07 + heat * 0.60).toFixed(3) + ')';
      ctx.lineWidth = 1.0 + heat * 1.7;
      ctx.stroke();
      if (heat > 0.5) {
        ctx.strokeStyle = hot ? 'rgba(255,196,132,' + ((heat - 0.5) * 1.5).toFixed(3) + ')'
                              : 'rgba(255,230,156,' + ((heat - 0.5) * 1.5).toFixed(3) + ')';
        ctx.lineWidth = 0.6 + heat * 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
      }
    }
  }
  function drawMagmaCrust(tx, ty, r, c, hot) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, TILE, TILE);
    ctx.clip();
    // 1. Flat dark basalt base — no per-tile gradient, so no row banding.
    ctx.fillStyle = hot ? '#1f0806' : '#180a06';
    ctx.fillRect(tx, ty, TILE, TILE);
    // 2. World-grid basalt mottle so the plates are not a flat colour.
    var MOT = MAGMA_MOTTLE;
    var m0c = Math.floor((tx - MOT) / MOT), m1c = Math.floor((tx + TILE) / MOT);
    var m0r = Math.floor((ty - MOT) / MOT), m1r = Math.floor((ty + TILE) / MOT);
    for (var mr = m0r; mr <= m1r; mr++) {
      for (var mc = m0c; mc <= m1c; mc++) {
        var mh = tileHash01(mr, mc, 0x4113);
        var mxx = mc * MOT + MOT * 0.5 + (tileHash01(mr, mc, 0x4114) - 0.5) * MOT * 0.7;
        var myy = mr * MOT + MOT * 0.5 + (tileHash01(mr, mc, 0x4115) - 0.5) * MOT * 0.7;
        var mrad = MOT * 0.4 + tileHash01(mr, mc, 0x4116) * MOT * 0.42;
        ctx.fillStyle = mh > 0.5 ? (hot ? 'rgba(70,18,12,0.30)' : 'rgba(58,24,12,0.30)') : 'rgba(4,1,1,0.42)';
        ctx.beginPath();
        ctx.ellipse(mxx, myy, mrad, mrad * 0.78, mh * 6.2832, 0, 6.2832);
        ctx.fill();
      }
    }
    // 3. Glowing molten crack network on the world grid (flows across tiles).
    var g0c = Math.floor(tx / MAGMA_PLATE) - 1, g1c = Math.floor((tx + TILE) / MAGMA_PLATE) + 1;
    var g0r = Math.floor(ty / MAGMA_PLATE) - 1, g1r = Math.floor((ty + TILE) / MAGMA_PLATE) + 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var gr = g0r; gr <= g1r; gr++) {
        for (var gc = g0c; gc <= g1c; gc++) {
          var n0 = magmaCrustNode(gr, gc);
          magmaCrustSeam(n0, magmaCrustNode(gr, gc + 1), gr, gc, 0x0077, pass, hot);
          magmaCrustSeam(n0, magmaCrustNode(gr + 1, gc), gr, gc, 0x0088, pass, hot);
          if (pass === 1) {
            var ph = tileHash01(gr, gc, 0xB10B);
            if (ph > 0.86) {
              var pr = 1.4 + (ph - 0.86) * 11;
              ctx.fillStyle = hot ? 'rgba(255,104,44,0.28)' : 'rgba(255,126,48,0.28)';
              ctx.beginPath();
              ctx.arc(n0.x, n0.y, pr, 0, 6.2832);
              ctx.fill();
              ctx.fillStyle = hot ? 'rgba(255,216,152,0.9)' : 'rgba(255,234,172,0.9)';
              ctx.beginPath();
              ctx.arc(n0.x, n0.y, pr * 0.4, 0, 6.2832);
              ctx.fill();
            }
          }
        }
      }
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.restore();
  }

  function drawCachedLayerDecoration(tile, tx, ty, r, c, rowLayer) {
    if (!rowLayer || (tile.type !== 'dirt' && tile.type !== 'stone')) return;
    if (rowLayer.name === 'magma' || rowLayer.name === 'mantle') {
      drawMagmaCrust(tx, ty, r, c, rowLayer.name === 'mantle');
    } else if (rowLayer.name === 'crystal') {
      ctx.fillStyle = 'rgba(160,180,255,0.18)';
      ctx.fillRect(tx, ty, TILE, TILE);
      if (((r * 31 + c * 17) % 5) === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(tx + 8 + (c % 3) * 5, ty + 6 + (r % 3) * 5, 1.5, 1.5);
      }
    }
  }

  function drawStoneDirtUnderlay(r, c, rowLayer) {
    var tx = c * TILE;
    var ty = r * TILE;
    drawMaterialTile('dirt', tx, ty, r, c, rowLayer);
    drawCachedLayerDecoration({ type: 'dirt' }, tx, ty, r, c, rowLayer);
  }

  function drawCachedTerrainBase(tile, r, c, rowLayer) {
    var tx = c * TILE;
    var ty = r * TILE;
    if (tile.type === 'dirt') {
      drawMaterialTile('dirt', tx, ty, r, c, rowLayer);
      drawCachedLayerDecoration(tile, tx, ty, r, c, rowLayer);
      drawSurfaceGrass(tx, ty, r, c);
    } else if (tile.type === 'stone') {
      drawMaterialTile('stone', tx, ty, r, c, rowLayer);
      drawCachedLayerDecoration(tile, tx, ty, r, c, rowLayer);
    } else if (ORES[tile.type] &&
               tile.type !== 'foundation' &&
               tile.type !== 'barrier' &&
               tile.type !== 'jello' &&
               tile.type !== 'bedrock') {
      var oreN = openBlockNeighbors(r, c, tile.type);
      var underKind = oreUnderlayKind(oreN) || 'dirt';
      if (underKind === 'stone') {
        drawStoneDirtUnderlay(r, c, rowLayer);
        return;
      }
      var layerName = cacheLayerName(rowLayer, underKind);
      var underN = materialNeighbors(r, c, underKind);
      drawMaterialWorldWash(underKind, tx, ty, r, c, layerName, underN);
      if (underKind === 'dirt') drawDirtMassDetail(tx, ty, r, c, layerName, underN);
      else drawStoneMassDetail(tx, ty, r, c, layerName, underN);
      drawTerrainBlend(underKind, tx, ty, layerName, underN);
      // v16.8 — apply the layer decoration (e.g. permafrost frost, magma
      // retint) to the ore's underlay too, so an ore tile no longer
      // punches an un-treated hole in the layer it sits in.
      drawCachedLayerDecoration({ type: 'dirt' }, tx, ty, r, c, rowLayer);
      if (underKind === 'dirt') drawSurfaceGrass(tx, ty, r, c);
    }
  }

  // ============================================================
  // CHUNK-LEVEL DETAIL FIELD
  // Renders clouds, clods, and chips ONCE across the chunk's world
  // bounds — each shape painted exactly once, eliminating the
  // brightness banding that came from per-tile overlap. Continuity
  // across tile boundaries is automatic because shapes span freely.
  // Continuity across CHUNK boundaries is imperfect (each chunk
  // renders into its own canvas, so a shape near a chunk edge gets
  // cut off by the receiving chunk not knowing about it) — but
  // chunks are 128px and shapes are ~10-50px, so the artifact is
  // rare and small.
  // ============================================================

  // Build a clip path covering all tiles whose effective rendering kind
  // matches `kind` in [r0..r1, c0..c1]. Includes ore tiles whose underlay
  // is `kind`. Returns null if no tiles match.
  function buildKindRectPath(kind, r0, r1, c0, c1) {
    var path = null;
    var any = false;
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var k = effectiveTerrainKindAtWorld(c * TILE + 1, r * TILE + 1);
        if (k !== kind) continue;
        if (!path) path = new Path2D();
        path.rect(c * TILE, r * TILE, TILE, TILE);
        any = true;
      }
    }
    return any ? path : null;
  }


  // Returns the effective rendering kind of the tile at (wx, wy):
  // 'dirt' or 'stone' for actual dirt/stone tiles, OR for ore tiles
  // (which render with a dirt or stone underlay depending on neighbors).
  // Returns null for empty space, walls, platforms, or other non-terrain.
  function effectiveTerrainKindAtWorld(wx, wy) {
    var r = Math.floor(wy / TILE);
    var c = Math.floor(wx / TILE);
    var t = getTileObj(r, c);
    if (!t) return null;
    if (t.type === 'dirt') return 'dirt';
    if (t.type === 'stone') return 'stone';
    // Ores render on a dirt or stone underlay — match drawCachedTerrainBase logic
    if (ORES[t.type] &&
        t.type !== 'foundation' &&
        t.type !== 'barrier' &&
        t.type !== 'jello' &&
        t.type !== 'bedrock') {
      var oreN = openBlockNeighbors(r, c, t.type);
      return oreUnderlayKind(oreN) || 'dirt';
    }
    return null;
  }

  // Pick layer name from a world-Y pixel coord (used to color shapes
  // that may straddle the layer-row boundaries at the cell level).
  function layerNameAtWorldY(wy) {
    var row = Math.floor(wy / TILE);
    var depth = row - SKY_ROWS;
    if (depth < 0 || row >= TOTAL_ROWS) return 'topsoil';
    var layer = getLayerForCam(depth);
    return layer ? layer.name : 'topsoil';
  }

  // Stone layer names get coerced to 'bedrock' for non-stone-distinct layers
  // (matches the existing per-tile coercion in drawMaterialTile).
  function stoneLayerNameAtWorldY(wy) {
    var ln = layerNameAtWorldY(wy);
    if (ln === 'magma' || ln === 'mantle') return 'bedrock';
    return ln;
  }

  // Iterate all cloud cells overlapping a chunk and paint each once,
  // restricted to cells whose center sits inside a tile of the given kind.
  // Cheap JS check — no GPU clip path needed.
  function drawChunkClouds(kind, rowStart, rowEnd, colStart, colEnd) {
    var wx0 = colStart * TILE;
    var wy0 = rowStart * TILE;
    var wx1 = (colEnd + 1) * TILE;
    var wy1 = (rowEnd + 1) * TILE;
    var cloudSize = kind === 'dirt' ? 126 : 164;
    var cloudReach = kind === 'dirt' ? 190 : 300;
    var minC = Math.floor((wx0 - cloudReach) / cloudSize);
    var maxC = Math.floor((wx1 + cloudReach - 1) / cloudSize);
    var minR = Math.floor((wy0 - cloudReach) / cloudSize);
    var maxR = Math.floor((wy1 + cloudReach - 1) / cloudSize);
    var saltA = kind === 'dirt' ? 0xD07C10 : 0x570A10;
    // For dirt, build a clip path covering all dirt tiles in this chunk
    // so the soft cloud blobs don't leak past the surface or into voids.
    // The clouds-per-chunk count is small (~5-10) so the clip cost is fine.
    // For stone, the caller already has the unified rounded stone clip active.
    var dirtClip = null;
    if (kind === 'dirt') {
      dirtClip = buildKindRectPath('dirt', rowStart, rowEnd, colStart, colEnd);
      if (!dirtClip) return;
      ctx.save();
      ctx.clip(dirtClip);
    }
    for (var gr = minR; gr <= maxR; gr++) {
      for (var gc = minC; gc <= maxC; gc++) {
        var h = tileHash01(gr, gc, saltA);
        if (h < 0.23) continue;
        var cx = gc * cloudSize + 14 + tileHash01(gr, gc, 0xA11CE) * (cloudSize - 28);
        var cy = gr * cloudSize + 12 + tileHash01(gr, gc, 0xA11CF) * (cloudSize - 24);
        if (kind === 'dirt' && effectiveTerrainKindAtWorld(cx, cy) !== 'dirt') continue;
        var rx = (kind === 'dirt' ? 35 : 52) + tileHash01(gr, gc, 0xA11D0) * (kind === 'dirt' ? 34 : 58);
        var ry = (kind === 'dirt' ? 18 : 30) + tileHash01(gr, gc, 0xA11D1) * (kind === 'dirt' ? 26 : 46);
        var hot = h > 0.64;
        var rot = tileHash01(gr, gc, 0xA11D2) * Math.PI;
        if (layerNameAtWorldY(cy) === 'permafrost') {
          // Frozen band: swap the warm/earthy stains for pale rime + blue shadow.
          if (hot) {
            if (kind === 'dirt') drawSoftEllipseBlob(cx, cy, rx, ry, rot, 200, 224, 236, 0.075, gr, gc, 0xC10D);
            else drawSoftEllipseBlob(cx, cy, rx, ry, rot, 226, 240, 250, 0.050, gr, gc, 0xC10D);
          } else {
            if (kind === 'dirt') drawSoftEllipseBlob(cx, cy, rx, ry, rot, 26, 34, 40, 0.100, gr, gc, 0xC10D);
            else drawSoftEllipseBlob(cx, cy, rx, ry, rot, 46, 72, 98, 0.070, gr, gc, 0xC10D);
          }
        } else if (hot) {
          if (kind === 'dirt') drawSoftEllipseBlob(cx, cy, rx, ry, rot, 196, 118, 62, 0.105, gr, gc, 0xC10D);
          else drawSoftEllipseBlob(cx, cy, rx, ry, rot, 235, 232, 210, 0.060, gr, gc, 0xC10D);
        } else {
          if (kind === 'dirt') drawSoftEllipseBlob(cx, cy, rx, ry, rot, 22, 12, 7, 0.125, gr, gc, 0xC10D);
          else drawSoftEllipseBlob(cx, cy, rx, ry, rot, 8, 10, 9, 0.085, gr, gc, 0xC10D);
        }
      }
    }
    if (dirtClip) ctx.restore();
  }

  function drawVoidDirtClouds(r, c) {
    var tx = c * TILE;
    var ty = r * TILE;
    var wx0 = tx;
    var wy0 = ty;
    var wx1 = tx + TILE;
    var wy1 = ty + TILE;
    var cloudSize = 126;
    var cloudReach = 190;
    var minC = Math.floor((wx0 - cloudReach) / cloudSize);
    var maxC = Math.floor((wx1 + cloudReach - 1) / cloudSize);
    var minR = Math.floor((wy0 - cloudReach) / cloudSize);
    var maxR = Math.floor((wy1 + cloudReach - 1) / cloudSize);
    for (var gr = minR; gr <= maxR; gr++) {
      for (var gc = minC; gc <= maxC; gc++) {
        var h = tileHash01(gr, gc, 0xD07C10);
        if (h < 0.23) continue;
        var cx = gc * cloudSize + 14 + tileHash01(gr, gc, 0xA11CE) * (cloudSize - 28);
        var cy = gr * cloudSize + 12 + tileHash01(gr, gc, 0xA11CF) * (cloudSize - 24);
        var rx = 35 + tileHash01(gr, gc, 0xA11D0) * 34;
        var ry = 18 + tileHash01(gr, gc, 0xA11D1) * 26;
        var hot = h > 0.64;
        var rot = tileHash01(gr, gc, 0xA11D2) * Math.PI;
        if (hot) drawSoftEllipseBlob(cx, cy, rx, ry, rot, 196, 118, 62, 0.105);
        else drawSoftEllipseBlob(cx, cy, rx, ry, rot, 22, 12, 7, 0.125);
      }
    }
  }

  // Iterate all clod cells (8px world grid) overlapping a chunk, paint each once.
  function drawChunkDirtClods(rowStart, rowEnd, colStart, colEnd) {
    var wx0 = colStart * TILE;
    var wy0 = rowStart * TILE;
    var wx1 = (colEnd + 1) * TILE;
    var wy1 = (rowEnd + 1) * TILE;
    var clod = 8;
    var clodReach = 16;
    var minClodC = Math.floor((wx0 - clodReach) / clod);
    var maxClodC = Math.floor((wx1 + clodReach - 1) / clod);
    var minClodR = Math.floor((wy0 - clodReach) / clod);
    var maxClodR = Math.floor((wy1 + clodReach - 1) / clod);
    for (var cr = minClodR; cr <= maxClodR; cr++) {
      for (var cc = minClodC; cc <= maxClodC; cc++) {
        var cx = cc * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A8) - 0.5) * 4.2;
        var cy = cr * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A9) - 0.5) * 4.2;
        // Skip cells whose center isn't inside a dirt-rendering tile (includes ores w/ dirt underlay)
        if (effectiveTerrainKindAtWorld(cx, cy) !== 'dirt') continue;
        var h = tileHash01(cr, cc, 0xD1A7);
        var rx = 2.0 + tileHash01(cr, cc, 0xD1AA) * 3.6;
        var ry = 1.45 + tileHash01(cr, cc, 0xD1AB) * 2.8;
        var layerName = layerNameAtWorldY(cy);
        var lineTint = layerName === 'crystal' ? 'rgba(210,185,235,' : layerName === 'permafrost' ? 'rgba(30,40,46,' : 'rgba(32,17,9,';
        var hiTint = layerName === 'crystal' ? 'rgba(225,210,255,' : layerName === 'permafrost' ? 'rgba(214,236,245,' : 'rgba(230,145,78,';
        ctx.fillStyle = h > 0.72
          ? hiTint + (0.08 + tileHash01(cr, cc, 0xD1AC) * 0.045).toFixed(3) + ')'
          : lineTint + (0.115 + tileHash01(cr, cc, 0xD1AD) * 0.070).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, tileHash01(cr, cc, 0xD1AE) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Iterate all chip cells (15px world grid) overlapping a chunk, paint each once.
  // Caller has the unified rounded stone clip already active, so chips outside
  // the stone shape get clipped automatically by GPU. We don't add another clip.
  function drawChunkStoneChips(rowStart, rowEnd, colStart, colEnd) {
    var wx0 = colStart * TILE;
    var wy0 = rowStart * TILE;
    var wx1 = (colEnd + 1) * TILE;
    var wy1 = (rowEnd + 1) * TILE;
    var chip = 15;
    var chipReach = 26;
    var minChipC = Math.floor((wx0 - chipReach) / chip);
    var maxChipC = Math.floor((wx1 + chipReach - 1) / chip);
    var minChipR = Math.floor((wy0 - chipReach) / chip);
    var maxChipR = Math.floor((wy1 + chipReach - 1) / chip);
    for (var pr = minChipR; pr <= maxChipR; pr++) {
      for (var pc = minChipC; pc <= maxChipC; pc++) {
        var cx = pc * chip + 4 + tileHash01(pr, pc, 0x51AC) * (chip - 8);
        var cy = pr * chip + 4 + tileHash01(pr, pc, 0x51AD) * (chip - 8);
        // No center-test here. The unified rounded stone path bulges OUTSIDE
        // literal stone tile rects to form the smooth "arch" seams between
        // adjacent tiles; chips whose centers land in those arches need to
        // render so the arch fill matches the chip-dense interior. The
        // caller already has the unified stone clip active, so the GPU
        // discards anything that lands outside the actual stone shape.
        var ph = tileHash01(pr, pc, 0x51AB);
        var rad = 5 + tileHash01(pr, pc, 0x51AE) * 7;
        var sides = 5 + Math.floor(tileHash01(pr, pc, 0x51AF) * 3);
        var rot = tileHash01(pr, pc, 0x51B0) * Math.PI * 2;
        var layerName = stoneLayerNameAtWorldY(cy);
        var coolHi = layerName === 'crystal' ? 'rgba(195,205,255,' : layerName === 'permafrost' ? 'rgba(233,245,252,' : 'rgba(245,245,225,';
        var coolLo = layerName === 'crystal' ? 'rgba(16,18,36,' : layerName === 'permafrost' ? 'rgba(64,96,124,' : 'rgba(7,9,8,';
        ctx.fillStyle = ph > 0.58
          ? coolHi + (0.045 + tileHash01(pr, pc, 0x51B1) * 0.030).toFixed(3) + ')'
          : coolLo + (0.055 + tileHash01(pr, pc, 0x51B2) * 0.045).toFixed(3) + ')';
        ctx.beginPath();
        for (var side = 0; side < sides; side++) {
          var a = rot + side / sides * Math.PI * 2;
          var rr = rad * (0.62 + tileHash01(pr * 9 + side, pc, 0x51B3) * 0.42);
          var px = cx + Math.cos(a) * rr;
          var py = cy + Math.sin(a) * rr * 0.74;
          if (side === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function renderTerrainChunk(chunkR, chunkC, chunk) {
    var oldCtx = ctx;
    var canvas = chunk.canvas;
    var g = chunk.ctx;
    var cacheScale = chunk.scale || TERRAIN_CHUNK_RENDER_SCALE;
    var worldX = chunkC * TERRAIN_CHUNK_PX;
    var worldY = chunkR * TERRAIN_CHUNK_PX;
    var drawX = worldX - TERRAIN_CHUNK_PAD;
    var drawY = worldY - TERRAIN_CHUNK_PAD;
    var rowStart = chunkR * TERRAIN_CHUNK_TILES - 1;
    var rowEnd = rowStart + TERRAIN_CHUNK_TILES + 1;
    var colStart = chunkC * TERRAIN_CHUNK_TILES - 1;
    var colEnd = colStart + TERRAIN_CHUNK_TILES + 1;

    ctx = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.setTransform(cacheScale, 0, 0, cacheScale, -drawX * cacheScale, -drawY * cacheScale);
    ctx.beginPath();
    ctx.rect(drawX, drawY, canvas.width / cacheScale, canvas.height / cacheScale);
    ctx.clip();

    // Pass 1: render dirt, ores, and layer decorations. Stone cells get a
    // dirt underlay first, so the rounded stone mask never exposes black
    // transparent corners inside the cached chunk.
    for (var r = rowStart; r <= rowEnd; r++) {
      var rowDepth = r - SKY_ROWS;
      var rowLayer = (rowDepth >= 0 && r < TOTAL_ROWS) ? getLayerForCam(rowDepth) : null;
      for (var c = colStart; c <= colEnd; c++) {
        var tile = getTileObj(r, c);
        if (!tile) continue;
        if (tile.type === 'stone') {
          drawStoneDirtUnderlay(r, c, rowLayer);
          continue;
        }
        drawCachedTerrainBase(tile, r, c, rowLayer);
      }
    }

    // Chunk-level dirt detail field: clouds + clods, each painted exactly once.
    if (USE_CHUNK_DETAIL_FIELD) {
      drawChunkClouds('dirt', rowStart, rowEnd, colStart, colEnd);
      drawChunkDirtClods(rowStart, rowEnd, colStart, colEnd);
    }

    // Pass 2: render connected stone as one rounded mass that remains inside
    // the real stone tile footprint.
    var contourRowStart = rowStart - 1;
    var contourRowEnd = rowEnd + 1;
    var contourColStart = colStart - 1;
    var contourColEnd = colEnd + 1;
    var stonePath = buildUnifiedStonePatchPath(contourRowStart, contourRowEnd, contourColStart, contourColEnd);
    if (stonePath) {
      drawStonePatchShadow(stonePath);
      ctx.save();
      ctx.clip(stonePath);
      drawUnifiedStoneWash(rowStart - 1, rowEnd + 1, colStart - 1, colEnd + 1);
      if (!USE_CHUNK_DETAIL_FIELD) {
        for (var sr = rowStart - 1; sr <= rowEnd + 1; sr++) {
          var srowDepth = sr - SKY_ROWS;
          var srowLayer = (srowDepth >= 0 && sr < TOTAL_ROWS) ? getLayerForCam(srowDepth) : null;
          var slayerName = srowLayer ? srowLayer.name : 'topsoil';
          if (slayerName === 'magma' || slayerName === 'mantle') {
            slayerName = 'bedrock';
          }
          for (var sc = colStart - 1; sc <= colEnd + 1; sc++) {
            drawStoneMassDetail(sc * TILE, sr * TILE, sr, sc, slayerName, STONE_INTERIOR_NEIGHBORS);
          }
        }
      }
      // Chunk-level stone detail field: clouds + chips painted once each,
      // inside the unified rounded stone clip already active here.
      if (USE_CHUNK_DETAIL_FIELD) {
        drawChunkClouds('stone', rowStart - 1, rowEnd + 1, colStart - 1, colEnd + 1);
        drawChunkStoneChips(rowStart - 1, rowEnd + 1, colStart - 1, colEnd + 1);
      }
      // Layer decorations (permafrost overlay, magma veins, crystal sparkle)
      // for the actual stone tiles, painted after the wash so they sit on top.
      for (var dr2 = rowStart; dr2 <= rowEnd; dr2++) {
        var dRowDepth = dr2 - SKY_ROWS;
        var dRowLayer = (dRowDepth >= 0 && dr2 < TOTAL_ROWS) ? getLayerForCam(dRowDepth) : null;
        for (var dc2 = colStart; dc2 <= colEnd; dc2++) {
          var dTile = getTileObj(dr2, dc2);
          if (dTile && dTile.type === 'stone') {
            drawCachedLayerDecoration(dTile, dc2 * TILE, dr2 * TILE, dr2, dc2, dRowLayer);
          }
        }
      }
      drawStoneEdgeRim(rowStart - 1, rowEnd + 1, colStart - 1, colEnd + 1, stonePath);
      ctx.restore();
    }

    // v13.11 — erases the chunk's cave voids to transparent (the parallax
    // wall now shows through from the underground-bg pass behind).
    drawSmoothVoids(rowStart, rowEnd, colStart, colEnd);

    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx = oldCtx;
    chunk.dirty = false;
    chunk.ready = true;
  }

  function trimTerrainChunkCache() {
    var limit = terrainChunkCacheLimit();
    if (terrainChunkCount <= limit) return;
    var chunks = [];
    for (var key in terrainChunkCache) {
      if (Object.prototype.hasOwnProperty.call(terrainChunkCache, key)) {
        chunks.push({ key: key, lastUsed: terrainChunkCache[key].lastUsed || 0 });
      }
    }
    chunks.sort(function (a, b) { return a.lastUsed - b.lastUsed; });
    var removeCount = Math.max(0, terrainChunkCount - limit);
    for (var i = 0; i < removeCount; i++) {
      delete terrainChunkCache[chunks[i].key];
      terrainChunkCount--;
    }
  }

  function getTerrainChunk(chunkR, chunkC) {
    var key = terrainChunkKey(chunkR, chunkC);
    var chunk = terrainChunkCache[key];
    if (chunk && Math.abs((chunk.scale || 1) - TERRAIN_CHUNK_RENDER_SCALE) > 0.01) {
      delete terrainChunkCache[key];
      terrainChunkCount--;
      chunk = null;
    }
    if (!chunk) {
      var c = document.createElement('canvas');
      var logicalSize = TERRAIN_CHUNK_PX + TERRAIN_CHUNK_PAD * 2;
      c.width = Math.ceil(logicalSize * TERRAIN_CHUNK_RENDER_SCALE);
      c.height = Math.ceil(logicalSize * TERRAIN_CHUNK_RENDER_SCALE);
      chunk = terrainChunkCache[key] = {
        canvas: c,
        ctx: c.getContext('2d'),
        dirty: true,
        scale: TERRAIN_CHUNK_RENDER_SCALE,
        lastUsed: 0,
        ready: false
      };
      terrainChunkCount++;
    }
    chunk.lastUsed = ++terrainChunkUseTick;
    var rebuildsLimit = (terrainWarmupFrames > 0 || terrainChunkRebuildBoostFrames > 0) ? 80 : TERRAIN_CHUNK_REBUILDS_PER_FRAME;
    if (chunk.dirty && terrainChunkRebuildsThisFrame < rebuildsLimit) {
      renderTerrainChunk(chunkR, chunkC, chunk);
      terrainChunkRebuildsThisFrame++;
    }
    return chunk;
  }

  function drawTerrainChunks(startRow, endRow, startCol, endCol) {
    terrainChunkRebuildsThisFrame = 0;
    var chunkR0 = Math.floor((startRow - 1) / TERRAIN_CHUNK_TILES);
    var chunkR1 = Math.floor((endRow + 1) / TERRAIN_CHUNK_TILES);
    var chunkC0 = Math.floor((startCol - 1) / TERRAIN_CHUNK_TILES);
    var chunkC1 = Math.floor((endCol + 1) / TERRAIN_CHUNK_TILES);
    var stitchPad = 1;
    var srcX = TERRAIN_CHUNK_PAD - stitchPad;
    var srcY = TERRAIN_CHUNK_PAD - stitchPad;
    var srcW = TERRAIN_CHUNK_PX + stitchPad * 2;
    var srcH = TERRAIN_CHUNK_PX + stitchPad * 2;
    var oldSmoothing = ctx.imageSmoothingEnabled;
    var oldQuality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    for (var cr = chunkR0; cr <= chunkR1; cr++) {
      for (var cc = chunkC0; cc <= chunkC1; cc++) {
        var chunk = getTerrainChunk(cr, cc);
        if (!chunk.ready) continue;
        var cacheScale = chunk.scale || 1;
        ctx.drawImage(
          chunk.canvas,
          srcX * cacheScale,
          srcY * cacheScale,
          srcW * cacheScale,
          srcH * cacheScale,
          cc * TERRAIN_CHUNK_PX - stitchPad,
          cr * TERRAIN_CHUNK_PX - stitchPad,
          srcW,
          srcH
        );
      }
    }
    ctx.imageSmoothingEnabled = oldSmoothing;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = oldQuality;
    trimTerrainChunkCache();
  }

  function drawTerrainClearOverlays(startRow, endRow, startCol, endCol) {
    // v6.4: was redrawing the just-mined tile via the legacy per-tile
    // organic-blob renderer for 0.22s after a clear. Now that chunks
    // rebuild on the same frame as the tile change with the new wobbly
    // contour path, that overlay was actually painting the OLD geometry
    // on top of the NEW chunk for a few frames — visible as a flash of
    // the v5.x tunnel shape. Chunks pick up the new geometry instantly,
    // so the overlay is no longer needed; leave the function as a no-op
    // so the call site (and the terrainClearOverlays push that drives
    // it) keep working without spurious flashes.
  }

