/* Opt-in air-pressure math and CPU oracle. No liquid particles are transported here. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiquidAirModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SOLID = 0, LIQUID = 1, AIR = 2;
  // CDF of the centered quadratic B-spline used by the native fine grid.
  // Integrating the basis over accessible geometry gives a density control
  // volume, which is distinct from the geometric water/gas phase volume.
  function quadraticIntegral(z) {
    finite(z, 'spline coordinate');
    if (z <= -1.5) return 0;
    if (z < -0.5) return Math.pow(z + 1.5, 3) / 6;
    if (z <= 0.5) return 0.5 + 0.75 * z - z * z * z / 3;
    if (z < 1.5) return 1 - Math.pow(1.5 - z, 3) / 6;
    return 1;
  }
  function kernelControlVolume(o) {
    var dx = positive(o.dx, 'pressure pitch'), h = positive(o.fineSize, 'fine pitch');
    var tile = positive(o.tileSize, 'tile pitch'), ratio = dx / h;
    if (!Number.isInteger(ratio)) throw new Error('pressure pitch must contain an integer number of fine cells');
    if (!Number.isInteger(o.col) || !Number.isInteger(o.row)) throw new Error('pressure cell coordinates must be integers');
    if (!Number.isInteger(o.width) || !Number.isInteger(o.height) || o.width <= 0 || o.height <= 0 || o.solid.length !== o.width * o.height)
      throw new Error('tile mask dimensions differ');
    var basisVolume = 0, fineVolumes = [];
    for (var fy = 0; fy < ratio; fy++) for (var fx = 0; fx < ratio; fx++) {
      var x = (o.col * ratio + fx + 0.5) * h, y = (o.row * ratio + fy + 0.5) * h;
      var blocked = 0;
      var c0 = Math.floor((x - 1.5 * h) / tile), c1 = Math.floor((x + 1.5 * h) / tile);
      var r0 = Math.floor((y - 1.5 * h) / tile), r1 = Math.floor((y + 1.5 * h) / tile);
      for (var tr = r0; tr <= r1; tr++) for (var tc = c0; tc <= c1; tc++) {
        if (tc < 0 || tr < 0 || tc >= o.width || tr >= o.height || !o.solid[tr * o.width + tc]) continue;
        var wx = quadraticIntegral(((tc + 1) * tile - x) / h) - quadraticIntegral((tc * tile - x) / h);
        var wy = quadraticIntegral(((tr + 1) * tile - y) / h) - quadraticIntegral((tr * tile - y) / h);
        blocked += h * h * wx * wy;
      }
      var volume = Math.max(0, h * h - blocked);
      fineVolumes.push(volume); basisVolume += volume;
    }
    var geometricVolume = dx * dx, x0 = o.col * dx, y0 = o.row * dx;
    for (var r = Math.floor(y0 / tile); r * tile < y0 + dx; r++) for (var c = Math.floor(x0 / tile); c * tile < x0 + dx; c++) {
      if (c < 0 || r < 0 || c >= o.width || r >= o.height || !o.solid[r * o.width + c]) continue;
      geometricVolume -= Math.max(0, Math.min(x0 + dx, (c + 1) * tile) - Math.max(x0, c * tile)) *
        Math.max(0, Math.min(y0 + dx, (r + 1) * tile) - Math.max(y0, r * tile));
    }
    return { basisVolume: basisVolume, geometricVolume: Math.max(0, geometricVolume), fineVolumes: fineVolumes };
  }
  function quadratic(z) {
    var a = Math.abs(z);
    return a <= 0.5 ? 0.75 - z * z : a < 1.5 ? 0.5 * (1.5 - a) * (1.5 - a) : 0;
  }
  function quadraticDerivative(z) {
    var a = Math.abs(z);
    return a <= 0.5 ? -2 * z : a < 1.5 ? (a - 1.5) * Math.sign(z) : 0;
  }
  function macStencil(x, y, dx, offsetX, offsetY, width, height, visit) {
    var px = x / dx - offsetX, py = y / dx - offsetY;
    var bx = Math.floor(px + 0.5), by = Math.floor(py + 0.5);
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var col = bx + i, row = by + j;
      if (col < 0 || row < 0 || col >= width || row >= height) continue;
      var a = px - col, b = py - row, wx = quadratic(a), wy = quadratic(b);
      visit(row * width + col, wx * wy, quadraticDerivative(a) * wy / dx,
        wx * quadraticDerivative(b) / dx, (col + offsetX) * dx, (row + offsetY) * dx);
    }
  }
  // Direct staggered APIC oracle. Particle velocities and C are in world units;
  // the engine adapter converts its displacement-per-step affine convention.
  function scatterMAC(o) {
    var d = dimensions(o), dx = positive(o.dx, 'dx'), pos = o.particles;
    if (!pos || pos.length % 4) throw new Error('Particle rows must contain x, y, vx, vy');
    var count = pos.length / 4, affine = field(o.affine, count * 4, 0, 'affine');
    var particleJ = field(o.particleJ, count, 1, 'particleJ');
    var mass = positive(o.particleMass === undefined ? 1 : o.particleMass, 'particleMass');
    var rho0 = positive(o.rho0 === undefined ? 1 : o.rho0, 'rho0');
    var uMass = new Float64Array((d.w + 1) * d.h), vMass = new Float64Array(d.w * (d.h + 1));
    var uMomentum = new Float64Array(uMass.length), vMomentum = new Float64Array(vMass.length);
    var uVolume = new Float64Array(uMass.length), vVolume = new Float64Array(vMass.length);
    var cellMass = new Float64Array(d.n), cellVolume = new Float64Array(d.n);
    for (var p = 0; p < count; p++) {
      var k = p * 4, x = finite(pos[k], 'particle x'), y = finite(pos[k + 1], 'particle y');
      var vx = finite(pos[k + 2], 'particle vx'), vy = finite(pos[k + 3], 'particle vy');
      var volume = mass * positive(particleJ[p], 'particle J') / rho0;
      macStencil(x, y, dx, 0, 0.5, d.w + 1, d.h, function (q, weight, gx, gy, xx, yy) {
        uMass[q] += mass * weight; uVolume[q] += volume * weight;
        uMomentum[q] += mass * weight * (vx + affine[k] * (xx - x) + affine[k + 1] * (yy - y));
      });
      macStencil(x, y, dx, 0.5, 0, d.w, d.h + 1, function (q, weight, gx, gy, xx, yy) {
        vMass[q] += mass * weight; vVolume[q] += volume * weight;
        vMomentum[q] += mass * weight * (vy + affine[k + 2] * (xx - x) + affine[k + 3] * (yy - y));
      });
      macStencil(x, y, dx, 0.5, 0.5, d.w, d.h, function (q, weight) {
        cellMass[q] += mass * weight; cellVolume[q] += volume * weight;
      });
    }
    var faceU = new Float64Array(uMass.length), faceV = new Float64Array(vMass.length);
    for (var i = 0; i < faceU.length; i++) if (uMass[i] > 0) faceU[i] = uMomentum[i] / uMass[i];
    for (i = 0; i < faceV.length; i++) if (vMass[i] > 0) faceV[i] = vMomentum[i] / vMass[i];
    return { width: d.w, height: d.h, dx: dx, uMass: uMass, vMass: vMass, uMomentum: uMomentum,
      vMomentum: vMomentum, uVolume: uVolume, vVolume: vVolume, cellMass: cellMass, cellVolume: cellVolume,
      faceU: faceU, faceV: faceV };
  }
  function gatherMAC(o) {
    var d = dimensions(o), dx = positive(o.dx, 'dx'), pos = o.particles;
    if (!pos || pos.length % 4) throw new Error('Particle rows must contain x, y, vx, vy');
    var u = field(o.faceU, (d.w + 1) * d.h, 0, 'faceU'), v = field(o.faceV, d.w * (d.h + 1), 0, 'faceV');
    var validU = field(o.faceValidU, u.length, 1, 'faceValidU'), validV = field(o.faceValidV, v.length, 1, 'faceValidV');
    var count = pos.length / 4, velocity = new Float64Array(count * 2), gradient = new Float64Array(count * 4);
    var supportRank = new Uint8Array(count * 2), supportWeight = new Float64Array(count * 2);
    function component(x, y, vertical) {
      var values = vertical ? v : u, valid = vertical ? validV : validU;
      var W = 0, X = 0, Y = 0, XX = 0, XY = 0, YY = 0, U = 0, UX = 0, UY = 0;
      macStencil(x, y, dx, vertical ? .5 : 0, vertical ? 0 : .5,
        vertical ? d.w : d.w + 1, vertical ? d.h + 1 : d.h, function (q, weight, gx, gy, xx, yy) {
          if (!valid[q]) return;
          var a = xx - x, b = yy - y, value = values[q];
          W += weight; X += weight * a; Y += weight * b; U += weight * value;
          XX += weight * a * a; XY += weight * a * b; YY += weight * b * b;
          UX += weight * value * a; UY += weight * value * b;
        });
      if (!(W > 1e-12)) return { value: 0, x: 0, y: 0, rank: 0, weight: W };
      var mx = X / W, my = Y / W, mean = U / W;
      var a = Math.max(0, XX / W - mx * mx), b = XY / W - mx * my, c = Math.max(0, YY / W - my * my);
      var bx = UX / W - mean * mx, by = UY / W - mean * my;
      var det = a * c - b * b, trace = a + c, cx = 0, cy = 0, rank = 0;
      if (trace > 1e-12 * dx * dx) {
        if (det > 1e-10 * trace * trace) {
          cx = (c * bx - b * by) / det; cy = (a * by - b * bx) / det; rank = 2;
        } else {
          // Explicit rank-one pseudoinverse. The missing derivative is not
          // inferred; callers see supportRank and must reject affine claims.
          var lambda = .5 * (trace + Math.sqrt((a - c) * (a - c) + 4 * b * b));
          var ex = 1, ey = 0;
          if (Math.abs(b) > 1e-12 * trace) { ex = b; ey = lambda - a; var norm = Math.hypot(ex, ey); ex /= norm; ey /= norm; }
          else if (c > a) { ex = 0; ey = 1; }
          var slope = (bx * ex + by * ey) / lambda; cx = slope * ex; cy = slope * ey; rank = 1;
        }
      }
      return { value: mean - cx * mx - cy * my, x: cx, y: cy, rank: rank, weight: W };
    }
    for (var p = 0; p < count; p++) {
      var k = p * 4, x = finite(pos[k], 'particle x'), y = finite(pos[k + 1], 'particle y');
      var a = component(x, y, false), b = component(x, y, true);
      velocity[p * 2] = a.value; velocity[p * 2 + 1] = b.value;
      gradient[k] = a.x; gradient[k + 1] = a.y; gradient[k + 2] = b.x; gradient[k + 3] = b.y;
      supportRank[p * 2] = a.rank; supportRank[p * 2 + 1] = b.rank;
      supportWeight[p * 2] = a.weight; supportWeight[p * 2 + 1] = b.weight;
    }
    return { velocity: velocity, gradient: gradient, supportRank: supportRank, supportWeight: supportWeight };
  }
  // Exact integral over a rectangular-cell material domain. Fractional input
  // assumes uniform alpha inside each cell and is an explicit approximation.
  function representedBasisVolume(o) {
    var d = dimensions(o), dx = positive(o.dx, 'dx'), pitch = positive(o.pitch || dx, 'basis pitch');
    var x = finite(o.x, 'basis x'), y = finite(o.y, 'basis y');
    var alpha = field(o.fluidFraction, d.n, 1, 'fluidFraction'), volume = 0;
    for (var r = Math.max(0, Math.floor((y - 1.5 * pitch) / dx)); r < d.h && r * dx < y + 1.5 * pitch; r++) {
      for (var c = Math.max(0, Math.floor((x - 1.5 * pitch) / dx)); c < d.w && c * dx < x + 1.5 * pitch; c++) {
        var a = alpha[r * d.w + c]; if (a < 0 || a > 1) throw new Error('fluidFraction must be in [0, 1]');
        var wx = quadraticIntegral(((c + 1) * dx - x) / pitch) - quadraticIntegral((c * dx - x) / pitch);
        var wy = quadraticIntegral(((r + 1) * dx - y) / pitch) - quadraticIntegral((r * dx - y) / pitch);
        volume += a * pitch * pitch * wx * wy;
      }
    }
    return volume;
  }
  function liquidEOS(o) {
    var J = positive(o.J, 'J'), rho0 = positive(o.rho0 === undefined ? 1 : o.rho0, 'rho0');
    var c = positive(o.soundSpeed, 'soundSpeed'), V0 = positive(o.restVolume === undefined ? 1 : o.restVolume, 'restVolume');
    var K = rho0 * c * c, rho = rho0 / J;
    return { J: J, density: rho, pressure: K * (1 / J - 1), beta: rho * c * c,
      energy: K * V0 * (J - 1 - Math.log(J)), volume: V0 * J };
  }
  function advanceJ(J, divergence, dt) {
    var next = positive(J, 'J') * Math.exp(positive(dt, 'dt') * finite(divergence, 'divergence'));
    return positive(next, 'advanced J');
  }
  function constitutiveCell(o) {
    var mass = finite(o.mass, 'mass'), basisVolume = positive(o.basisVolume, 'basisVolume');
    var geometricVolume = positive(o.geometricVolume, 'geometricVolume');
    var rho0 = positive(o.rho0 === undefined ? 1 : o.rho0, 'rho0'), c = positive(o.soundSpeed, 'soundSpeed');
    if (mass < 0) throw new Error('mass must be nonnegative');
    if (mass === 0) return { unresolved: true, density: 0, alpha: 0, compliance: 0, pressure: -rho0 * c * c };
    var rho = o.confined ? mass / basisVolume : positive(o.intrinsicDensity, 'intrinsicDensity');
    var represented = o.confined ? geometricVolume : finite(o.materialVolume, 'materialVolume');
    if (represented < 0) throw new Error('materialVolume must be nonnegative');
    var alpha = represented / geometricVolume;
    return { unresolved: alpha > 1 + 1e-9, density: rho, alpha: alpha,
      pressure: c * c * (rho - rho0), compliance: represented / (rho * c * c) };
  }
  function accessibleAir(o) {
    var d=dimensions(o),kind=field(o.kind,d.n,0,'kind'),c=o.cell;
    if(!Number.isInteger(c)||c<0||c>=d.n)throw new Error('Invalid constitutive cell');
    if(kind[c]===SOLID)return false;if(kind[c]===AIR)return true;
    var u=field(o.faceOpenU,(d.w+1)*d.h,1,'faceOpenU'),v=field(o.faceOpenV,d.w*(d.h+1),1,'faceOpenV');
    var cx=c%d.w,cy=Math.floor(c/d.w),reached=new Set([c]);
    for(var round=0;round<4;round++){
      var next=new Set(reached);
      for(var a of reached){var x=a%d.w,y=Math.floor(a/d.w);
        for(var side=0;side<4;side++){
          var nx=x+(side===0?-1:side===1?1:0),ny=y+(side===2?-1:side===3?1:0);
          if(nx<0||ny<0||nx>=d.w||ny>=d.h||Math.abs(nx-cx)>2||Math.abs(ny-cy)>2)continue;
          var b=ny*d.w+nx,open=side<2?u[y*(d.w+1)+x+(side===1?1:0)]:v[(y+(side===3?1:0))*d.w+x];
          if(kind[b]===SOLID||open<=0)continue;if(kind[b]===AIR)return true;next.add(b);
        }
      }reached=next;
    }return false;
  }
  function finite(x, name) {
    if (!Number.isFinite(x)) throw new Error(name + ' must be finite');
    return x;
  }
  function positive(x, name) {
    finite(x, name);
    if (!(x > 0)) throw new Error(name + ' must be positive');
    return x;
  }
  function dimensions(o) {
    var w = o.width, h = o.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new Error('Invalid pressure grid dimensions');
    return { w: w, h: h, n: w * h };
  }
  function field(a, n, value, name) {
    if (!a) { var out = new Float64Array(n); if (value) out.fill(value); return out; }
    if (a.length !== n) throw new Error(name + ' has wrong length');
    for (var i = 0; i < n; i++) finite(a[i], name);
    return a;
  }
  function sum(a) { var r = 0; for (var i = 0; i < a.length; i++) r += a[i]; return r; }
  function neighbors(i, w, h, visit) {
    var x = i % w, y = Math.floor(i / w);
    if (x) visit(i - 1);
    if (x + 1 < w) visit(i + 1);
    if (y) visit(i - w);
    if (y + 1 < h) visit(i + w);
  }

  // Four-connected physical empty space. volumeLabels add one fractional
  // interface shell; unresolved ambiguous fractions are reported explicitly.
  function labelAir(o) {
    var d = dimensions(o), w = d.w, h = d.h, n = d.n;
    var solid = field(o.solid, n, 0, 'solid');
    var fraction = field(o.liquidFraction, n, 0, 'liquidFraction');
    var cellOpen = field(o.cellOpen, n, 1, 'cellOpen');
    var faceOpen = field(o.faceOpen, n * 4, 1, 'faceOpen');
    for (var f = 0; f < faceOpen.length; f++) if (faceOpen[f] < 0 || faceOpen[f] > 1) throw new Error('faceOpen must be in [0, 1]');
    function connected(a,b) { var direction = Math.floor(a/w) === Math.floor(b/w) ? (b<a ? 0 : 1) : (b<a ? 2 : 3);
      return Math.min(faceOpen[a*4+direction],faceOpen[b*4+(direction^1)]) > 0; }
    var cellVolume = positive(o.cellVolume === undefined ? 1 : o.cellVolume, 'cellVolume');
    var threshold = o.threshold === undefined ? 0.5 : o.threshold;
    if (!(threshold > 0 && threshold <= 1)) throw new Error('Air threshold must be in (0, 1]');
    var ambient = o.ambientMask ? field(o.ambientMask, n, 0, 'ambientMask') : null;
    var labels = new Int32Array(n); labels.fill(-1);
    var airVolume = new Float64Array(n), queue = new Int32Array(n);
    var regions = [{ id: 0, ambient: true, cells: [], volume: 0 }];
    for (var i = 0; i < n; i++) {
      if (fraction[i] < 0 || fraction[i] > 1) throw new Error('Liquid fraction must be in [0, 1]');
      if (cellOpen[i] < 0 || cellOpen[i] > 1) throw new Error('cellOpen must be in [0, 1]');
      if (!solid[i]) airVolume[i] = (1 - fraction[i]) * cellVolume * cellOpen[i];
    }
    for (i = 0; i < n; i++) {
      if (labels[i] !== -1 || solid[i] || cellOpen[i] === 0 || fraction[i] >= threshold) continue;
      var head = 0, tail = 1, cells = [], open = false;
      queue[0] = i; labels[i] = -2;
      while (head < tail) {
        var c = queue[head++], x = c % w, y = Math.floor(c / w);
        cells.push(c);
        if (ambient ? !!ambient[c] : x === 0 || y === 0 || x === w - 1 || y === h - 1) open = true;
        neighbors(c, w, h, function (j) {
          if (labels[j] === -1 && !solid[j] && cellOpen[j] > 0 && fraction[j] < threshold && connected(c,j)) { labels[j] = -2; queue[tail++] = j; }
        });
      }
      var id = open ? 0 : regions.length;
      if (!open) regions.push({ id: id, ambient: false, cells: [], volume: 0 });
      for (var k = 0; k < cells.length; k++) { labels[cells[k]] = id; regions[id].cells.push(cells[k]); }
    }
    var volumeLabels = new Int32Array(labels), ambiguousVolume = 0;
    for (i = 0; i < n; i++) {
      if (labels[i] >= 0 || airVolume[i] === 0) continue;
      var near = -1, mixed = false;
      neighbors(i, w, h, function (j) {
        if (labels[j] >= 0 && connected(i,j)) { if (near >= 0 && near !== labels[j]) mixed = true; near = labels[j]; }
      });
      if (near >= 0 && !mixed) volumeLabels[i] = near;
      else ambiguousVolume += airVolume[i];
    }
    for (i = 0; i < n; i++) if (volumeLabels[i] >= 0) regions[volumeLabels[i]].volume += airVolume[i];
    return { width: w, height: h, labels: labels, volumeLabels: volumeLabels, airVolume: airVolume,
      regions: regions, cellVolume: cellVolume, ambiguousVolume: ambiguousVolume };
  }

  // An isolated mass deficit in prior liquid is not by itself vapor. Existing
  // air and newly opened solid space can advance geometrically; a new void in
  // confined liquid must spend certified active-floor expansion volume.
  function classifyPhase(o) {
    var d = dimensions(o), n = d.n, top = labelAir(o);
    var previous = field(o.previousKind, n, AIR, 'previousKind');
    var budget = field(o.expansionVolume, n, 0, 'expansionVolume');
    var vapor = field(o.previousVapor, n, 0, 'previousVapor');
    var vaporVolume = field(o.previousVaporVolume, n, 0, 'previousVaporVolume');
    var pressure = o.previousPressure ? field(o.previousPressure, n, 0, 'previousPressure') : null;
    var activeFloor = o.activeFloor ? field(o.activeFloor, n, 0, 'activeFloor') : null;
    var currentOpen = field(o.cellOpen, n, 1, 'cellOpen');
    var previousOpen = o.previousCellOpen ? field(o.previousCellOpen, n, 1, 'previousCellOpen') : null;
    var solid = field(o.solid, n, 0, 'solid');
    var kind = new Uint8Array(n), remaining = Float64Array.from(budget), status = new Uint8Array(n);
    var retained = 0, consumed = 0, opened = 0, authorized = 0, cleared = 0, unresolved = 0;
    for (var i = 0; i < n; i++) {
      if (budget[i] < 0) throw new Error('expansionVolume must be nonnegative');
      if (previous[i] !== SOLID && previous[i] !== LIQUID && previous[i] !== AIR) throw new Error('Invalid previous phase');
      if (vaporVolume[i] < 0) throw new Error('previousVaporVolume must be nonnegative');
      if (budget[i] > 0 && !pressure && !activeFloor) throw new Error('Expansion credit requires an explicit active pressure floor');
      if (activeFloor && !activeFloor[i] || pressure && pressure[i] > o.minimumPressure + 0.01) { cleared += remaining[i]; remaining[i] = 0; }
      kind[i] = solid[i] ? SOLID : LIQUID;
    }
    for (var r = 0; r < top.regions.length; r++) {
      var cells = top.regions[r].cells, inherit = top.regions[r].ambient;
      var geometry = 0, previousVoid = 0, available = 0, required = top.regions[r].volume;
      for (var c = 0; c < n; c++) if (top.volumeLabels[c] === r) {
        inherit = inherit || previous[c] === AIR && !vapor[c];
        if (previousOpen) geometry += Math.min(top.airVolume[c], Math.max(0, currentOpen[c] - previousOpen[c]) * top.cellVolume);
        else if (previous[c] === SOLID) geometry += top.airVolume[c];
        if (vapor[c]) previousVoid += vaporVolume[c];
        available += remaining[c];
      }
      var need = Math.max(0, required - geometry - previousVoid);
      var permit = inherit || available + 1e-12 >= need;
      if (!permit) {
        unresolved += need - available;
        for (var k = 0; k < cells.length; k++) {
          c = cells[k];
          if (previous[c] === AIR || previous[c] === SOLID) { kind[c] = AIR; status[c] = previous[c] === SOLID ? 2 : 5; }
          else { retained++; status[c] = 4; }
        }
        continue;
      }
      var spend = inherit ? 0 : need;
      for (k = 0; k < cells.length; k++) {
        c = cells[k]; kind[c] = AIR;
        status[c] = inherit ? 1 : previous[c] === SOLID ? 2 : previous[c] === AIR ? 5 : 3;
      }
      for (c = 0; c < n; c++) if (top.volumeLabels[c] === r && spend > 0 && available > 0) remaining[c] = Math.max(0, remaining[c] - spend * remaining[c] / available);
      consumed += spend;
      if (!inherit) { opened += geometry; authorized += spend; }
    }
    return { kind: kind, expansionVolume: remaining, status: status, candidateTopology: top,
      retainedLiquidCells: retained, consumedExpansionVolume: consumed,
      geometryOpenedVolume: opened, authorizedVaporVolume: authorized,
      clearedExpansionVolume: cleared, unresolvedVoidVolume: unresolved };
  }

  // amount has units pressure * volume and is conserved for noncondensable gas.
  // Air born inside water has zero noncondensable amount, rather than magically
  // acquiring atmosphere. Its vapor pressure/phase volume is a separate model.
  function remapGas(previous, next, oldGas, o) {
    o = o || {}; oldGas = oldGas || {};
    var atmosphere = positive(o.atmospherePressure === undefined ? 101325 : o.atmospherePressure, 'atmospherePressure');
    var vaporPressure = o.vaporPressure === undefined ? 0 : finite(o.vaporPressure, 'vaporPressure');
    var gas = {}, totals = {}, overlaps = {}, captured = 0, vented = 0, unassigned = 0, oldTotal = 0;
    if (previous && (previous.width !== next.width || previous.height !== next.height)) throw new Error('Gas remap grids must match');
    for (var r = 1; r < next.regions.length; r++) totals[r] = 0;
    if (!previous) {
      for (r = 1; r < next.regions.length; r++) { totals[r] = atmosphere * next.regions[r].volume; captured += totals[r]; }
    } else {
      var oldLabels = previous.volumeLabels || previous.labels, newLabels = next.volumeLabels || next.labels;
      for (var i = 0; i < next.labels.length; i++) {
        var from = oldLabels[i], to = newLabels[i];
        if (from < 0 || to < 0) continue;
        var overlap = Math.min(previous.airVolume[i], next.airVolume[i]);
        if (!(overlap > 0)) continue;
        if (from === 0) { if (to > 0) { totals[to] += atmosphere * overlap; captured += atmosphere * overlap; } }
        else {
          if (!overlaps[from]) overlaps[from] = {};
          overlaps[from][to] = (overlaps[from][to] || 0) + overlap;
        }
      }
      Object.keys(oldGas).forEach(function (key) {
        var id = +key, g = oldGas[key];
        if (!g || id <= 0) return;
        var amount = g.amount === undefined ? g.absolutePressure * g.volume : g.amount;
        if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error('Invalid gas amount');
        oldTotal += amount;
        var row = overlaps[id] || {}, total = 0;
        Object.keys(row).forEach(function (dest) { total += row[dest]; });
        if (!total) { unassigned += amount; return; }
        Object.keys(row).forEach(function (dest) {
          var part = amount * row[dest] / total;
          if (+dest === 0) vented += part; else totals[dest] += part;
        });
      });
    }
    for (r = 1; r < next.regions.length; r++) {
      var volume = positive(next.regions[r].volume, 'sealed gas volume'), a = totals[r];
      gas[r] = { id: r, volume: volume, amount: a, absolutePressure: a > 0 ? a / volume : vaporPressure,
        pressure: (a > 0 ? a / volume : vaporPressure) - atmosphere, vapor: a === 0 };
    }
    var newTotal = 0; Object.keys(gas).forEach(function (id) { newTotal += gas[id].amount; });
    return { gas: gas, capturedAmount: captured, trappedAmount: captured, ventedAmount: vented,
      unassignedAmount: unassigned, balanceError: oldTotal + captured - newTotal - vented - unassigned };
  }

  // Graph pressure oracle. Units: dx in world length, face velocities in
  // world length per simulation second, density in mass per volume, and
  // pressure in the corresponding physical units. The engine adapter owns
  // conversion from displacement per substep. kind: 0 solid, 1 water, 2 air.
  function buildSystem(o) {
    var d = dimensions(o), w = d.w, h = d.h, n = d.n;
    var dx = positive(o.dx, 'dx'), dt = positive(o.dt, 'dt');
    var rho = positive(o.rho, 'rho'), c = positive(o.soundSpeed, 'soundSpeed');
    var kind = field(o.kind, n, LIQUID, 'kind'), region = field(o.region, n, 0, 'region');
    var pressure = field(o.pressure, n, 0, 'pressure');
    var fraction = field(o.cellFraction, n, 1, 'cellFraction');
    var cellDensity = field(o.cellDensity, n, rho, 'cellDensity');
    var nu = (w + 1) * h, nv = w * (h + 1);
    var faceU = field(o.faceU, nu, 0, 'faceU'), faceV = field(o.faceV, nv, 0, 'faceV');
    var openU = field(o.faceOpenU, nu, 1, 'faceOpenU'), openV = field(o.faceOpenV, nv, 1, 'faceOpenV');
    var solidU = field(o.solidU, nu, 0, 'solidU'), solidV = field(o.solidV, nv, 0, 'solidV');
    var wallU = field(o.wallVelocityU, nu, 0, 'wallVelocityU'), wallV = field(o.wallVelocityV, nv, 0, 'wallVelocityV');
    var distanceU = field(o.faceDistanceU, nu, dx, 'faceDistanceU');
    var distanceV = field(o.faceDistanceV, nv, dx, 'faceDistanceV');
    var densityU = field(o.faceDensityU, nu, rho, 'faceDensityU'), densityV = field(o.faceDensityV, nv, rho, 'faceDensityV');
    var atmosphere = positive(o.atmospherePressure === undefined ? 101325 : o.atmospherePressure, 'atmospherePressure');
    var boundaryPressure = o.boundaryPressure === undefined ? 0 : finite(o.boundaryPressure, 'boundaryPressure');
    var cellDof = new Int32Array(n); cellDof.fill(-1);
    var gasDof = {}, compliance = [], old = [], coordinates = [], dofKind = [], gas = o.gas || {};
    for (var i = 0; i < n; i++) {
      if (kind[i] !== SOLID && kind[i] !== LIQUID && kind[i] !== AIR) throw new Error('Invalid cell kind');
      if (fraction[i] < 0 || fraction[i] > 1) throw new Error('cellFraction must be in [0, 1]');
      if (kind[i] === LIQUID) {
        if (!(fraction[i] > 0)) throw new Error('Liquid cell needs positive volume');
        cellDof[i] = compliance.length;
        compliance.push(fraction[i] * dx * dx / (positive(cellDensity[i], 'cell density') * c * c)); old.push(pressure[i]);
        coordinates.push({ x: (i % w + 0.5) * dx, y: (Math.floor(i / w) + 0.5) * dx, cell: i }); dofKind.push(LIQUID);
      } else if (kind[i] === AIR && region[i] > 0) {
        var id = region[i];
        if (!Number.isInteger(id)) throw new Error('Gas region must be an integer');
        if (gasDof[id] === undefined) {
          var g = gas[id]; if (!g) throw new Error('Missing gas region ' + id);
          var pAbs = positive(g.absolutePressure === undefined ? atmosphere + g.pressure : g.absolutePressure, 'gas absolute pressure');
          gasDof[id] = compliance.length; compliance.push(positive(g.volume, 'gas volume') / pAbs); old.push(pAbs - atmosphere);
          coordinates.push({ x: (i % w + 0.5) * dx, y: (Math.floor(i / w) + 0.5) * dx, cell: i, gasId: id }); dofKind.push(AIR);
        }
        cellDof[i] = gasDof[id];
      }
    }
    var m = compliance.length, diagonal = Float64Array.from(compliance), edges = [], faces = [], dt2 = dt * dt;
    function addFace(orientation, index, left, right, x, y) {
      var opens = orientation === 'u' ? openU : openV;
      var solids = orientation === 'u' ? solidU : solidV;
      var walls = orientation === 'u' ? wallU : wallV;
      var distances = orientation === 'u' ? distanceU : distanceV;
      var densities = orientation === 'u' ? densityU : densityV;
      var a = left < 0 ? -1 : cellDof[left], b = right < 0 ? -1 : cellDof[right];
      if (a === b || a < 0 && b < 0) return;
      var blocked = !!solids[index] || left >= 0 && kind[left] === SOLID || right >= 0 && kind[right] === SOLID;
      var open = opens[index]; if (open < 0 || open > 1) throw new Error('Face fraction must be in [0, 1]');
      var length = blocked ? 0 : dx * open, closedLength = dx - length, distance = positive(distances[index], 'face distance');
      var density = positive(densities[index], 'face density');
      var weight = blocked ? 0 : length / (density * distance);
      var f = { orientation: orientation, index: index, dofLeft: a, dofRight: b, cellLeft: left, cellRight: right,
        x: x, y: y, openLength: length, closedLength: closedLength, distance: distance, weight: weight, blocked: blocked,
        density: density, wallVelocity: walls[index], pressureLeft: left < 0 ? boundaryPressure : 0, pressureRight: right < 0 ? boundaryPressure : 0 };
      faces.push(f);
      if (weight > 0) {
        if (a >= 0) diagonal[a] += dt2 * weight;
        if (b >= 0) diagonal[b] += dt2 * weight;
        if (a >= 0 && b >= 0) edges.push({ a: a, b: b, weight: weight });
      }
    }
    for (var y = 0; y < h; y++) for (var x = 0; x <= w; x++) addFace('u', y * (w + 1) + x,
      x ? y * w + x - 1 : -1, x < w ? y * w + x : -1, x * dx, (y + 0.5) * dx);
    for (y = 0; y <= h; y++) for (x = 0; x < w; x++) addFace('v', y * w + x,
      y ? (y - 1) * w + x : -1, y < h ? y * w + x : -1, (x + 0.5) * dx, y * dx);
    var system = { width: w, height: h, dx: dx, rho: rho, dt: dt, soundSpeed: c, kind: kind, region: region,
      cellDof: cellDof, gasDof: gasDof, diagonal: diagonal, compliance: Float64Array.from(compliance),
      oldPressure: Float64Array.from(old), coordinates: coordinates, dofKind: Uint8Array.from(dofKind),
      edges: edges, faces: faces, faceU: Float64Array.from(faceU), faceV: Float64Array.from(faceV),
      atmospherePressure: atmosphere };
    system.rhs = assembleRhs(system, faceU, faceV, system.oldPressure);
    system.csr = packCSR(system);
    return system;
  }

  function assembleRhs(s, faceU, faceV, history) {
    faceU = faceU || s.faceU; faceV = faceV || s.faceV; history = history || s.oldPressure;
    var rhs = new Float64Array(s.diagonal.length);
    for (var i = 0; i < rhs.length; i++) rhs[i] = s.compliance[i] * history[i];
    for (i = 0; i < s.faces.length; i++) {
      var f = s.faces[i], a = f.dofLeft, b = f.dofRight;
      var u = f.orientation === 'u' ? faceU[f.index] : faceV[f.index];
      finite(u, 'face velocity'); var q = f.openLength * u + f.closedLength * f.wallVelocity;
      if (a >= 0) { rhs[a] -= s.dt * q; if (b < 0) rhs[a] += s.dt * s.dt * f.weight * f.pressureRight; }
      if (b >= 0) { rhs[b] += s.dt * q; if (a < 0) rhs[b] += s.dt * s.dt * f.weight * f.pressureLeft; }
    }
    return rhs;
  }

  function packCSR(s) {
    var n = s.diagonal.length, lists = new Array(n), dt2 = s.dt * s.dt;
    for (var i = 0; i < n; i++) lists[i] = [];
    for (i = 0; i < s.edges.length; i++) {
      var e = s.edges[i], v = -dt2 * e.weight;
      lists[e.a].push({ column: e.b, value: v }); lists[e.b].push({ column: e.a, value: v });
    }
    var rowPtr = new Uint32Array(n + 1), col = [], values = [];
    for (i = 0; i < n; i++) {
      rowPtr[i] = col.length; var merged = {};
      lists[i].forEach(function (e) { merged[e.column] = (merged[e.column] || 0) + e.value; });
      Object.keys(merged).map(Number).sort(function (a, b) { return a - b; }).forEach(function (j) { col.push(j); values.push(merged[j]); });
    }
    rowPtr[n] = col.length;
    return { rowPtr: rowPtr, columns: Uint32Array.from(col), values: Float64Array.from(values) };
  }
  function multiply(s, p, out) {
    out = out || new Float64Array(p.length);
    for (var i = 0; i < p.length; i++) out[i] = s.diagonal[i] * p[i];
    var dt2 = s.dt * s.dt;
    for (i = 0; i < s.edges.length; i++) {
      var e = s.edges[i], w = dt2 * e.weight;
      out[e.a] -= w * p[e.b]; out[e.b] -= w * p[e.a];
    }
    return out;
  }
  function dot(a, b) { var r = 0; for (var i = 0; i < a.length; i++) r += a[i] * b[i]; return r; }
  function residual(s, p, rhs, floor) {
    rhs = rhs || s.rhs; var ap = multiply(s, p), r2 = 0, bound = 0;
    for (var i = 0; i < p.length; i++) {
      var r = ap[i] - rhs[i], low = floor ? floor[i] : -Infinity;
      if (p[i] <= low + 1e-10 * Math.max(1, Math.abs(low))) { bound++; r = Math.min(0, r); }
      r2 += r * r;
    }
    return { absolute: Math.sqrt(r2), relative: Math.sqrt(r2) / Math.max(Math.sqrt(dot(rhs, rhs)), 1e-30), active: bound };
  }

  // Unconstrained PCG; lower-bound problems use projected Gauss-Seidel and
  // report the complementarity residual instead of hiding the clamp error.
  function solve(s, o) {
    o = o || {}; var n = s.diagonal.length, rhs = o.rhs || s.rhs;
    var tolerance = o.tolerance === undefined ? 1e-10 : positive(o.tolerance, 'tolerance');
    var maxIterations = o.maxIterations === undefined ? Math.max(100, n * 4) : o.maxIterations;
    var p = Float64Array.from(o.initial || s.oldPressure), iteration = 0, floor = null;
    if (o.minPressure !== undefined) {
      floor = new Float64Array(n);
      if (typeof o.minPressure === 'number') floor.fill(o.minPressure);
      else { if (o.minPressure.length !== n) throw new Error('Pressure floor has wrong length'); floor.set(o.minPressure); }
      for (var i = 0; i < n; i++) p[i] = Math.max(p[i], floor[i]);
      var csr = s.csr || packCSR(s);
      for (; iteration < maxIterations; iteration++) {
        for (i = 0; i < n; i++) {
          var other = 0;
          for (var k = csr.rowPtr[i]; k < csr.rowPtr[i + 1]; k++) other += csr.values[k] * p[csr.columns[k]];
          p[i] = Math.max(floor[i], (rhs[i] - other) / s.diagonal[i]);
        }
        var rr = residual(s, p, rhs, floor);
        if (rr.relative <= tolerance || rr.absolute <= 1e-20) { iteration++; break; }
      }
    } else {
      var ap = multiply(s, p), r = new Float64Array(n), z = new Float64Array(n), direction = new Float64Array(n);
      for (i = 0; i < n; i++) { r[i] = rhs[i] - ap[i]; z[i] = r[i] / s.diagonal[i]; direction[i] = z[i]; }
      var rz = dot(r, z), rhsNorm = Math.max(Math.sqrt(dot(rhs, rhs)), 1e-30);
      for (; iteration < maxIterations && Math.sqrt(dot(r, r)) > tolerance * rhsNorm && rz > 1e-40; iteration++) {
        multiply(s, direction, ap); var denom = dot(direction, ap);
        if (!(denom > 0)) throw new Error('Pressure operator is not positive definite');
        var alpha = rz / denom;
        for (i = 0; i < n; i++) { p[i] += alpha * direction[i]; r[i] -= alpha * ap[i]; z[i] = r[i] / s.diagonal[i]; }
        var nextRz = dot(r, z), beta = nextRz / rz;
        for (i = 0; i < n; i++) direction[i] = z[i] + beta * direction[i];
        rz = nextRz;
      }
    }
    for (i = 0; i < n; i++) finite(p[i], 'solved pressure');
    var finalResidual = residual(s, p, rhs, floor), active = [];
    if (floor) for (i = 0; i < n; i++) if (p[i] <= floor[i] + 1e-9 * Math.max(1, Math.abs(floor[i]))) active.push(i);
    return { pressure: p, iterations: iteration, residual: finalResidual, converged: finalResidual.relative <= tolerance || finalResidual.absolute <= 1e-20,
      activeCavitation: active, minPressure: floor };
  }

  function projectFaces(s, p, o) {
    o = o || {}; var u = Float64Array.from(o.faceU || s.faceU), v = Float64Array.from(o.faceV || s.faceV);
    var flux = new Float64Array(p.length), history = o.oldPressure || s.oldPressure;
    for (var i = 0; i < s.faces.length; i++) {
      var f = s.faces[i], a = f.dofLeft, b = f.dofRight, out = f.orientation === 'u' ? u : v;
      if (f.blocked) out[f.index] = f.wallVelocity;
      else {
        var left = a >= 0 ? p[a] : f.pressureLeft, right = b >= 0 ? p[b] : f.pressureRight;
        out[f.index] -= s.dt * (right - left) / (f.density * f.distance);
      }
      var q = f.openLength * out[f.index] + f.closedLength * f.wallVelocity;
      if (a >= 0) flux[a] += q; if (b >= 0) flux[b] -= q;
    }
    var volumeDeficit = new Float64Array(p.length), cavitationExpansion = new Float64Array(p.length), floor = o.minPressure;
    for (i = 0; i < p.length; i++) {
      volumeDeficit[i] = s.compliance[i] * (p[i] - history[i]) + s.dt * flux[i];
      var lower = typeof floor === 'number' ? floor : floor ? floor[i] : -Infinity;
      if (s.dofKind[i] === LIQUID && p[i] <= lower + 1e-9 * Math.max(1, Math.abs(lower))) cavitationExpansion[i] = Math.max(0, volumeDeficit[i]);
    }
    return { faceU: u, faceV: v, flux: flux, volumeDeficit: volumeDeficit,
      cavitationExpansion: cavitationExpansion, totalCavitationExpansion: sum(cavitationExpansion) };
  }

  function sampleField(a, width, height, x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, value = 0;
    for (var k = 0; k < 4; k++) {
      var xx = Math.max(0, Math.min(width - 1, x0 + (k & 1))), yy = Math.max(0, Math.min(height - 1, y0 + (k >> 1)));
      value += a[yy * width + xx] * (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
    }
    return value;
  }
  function advectPressure(o) {
    var d = dimensions(o), w = d.w, h = d.h, dx = positive(o.dx, 'dx'), dt = positive(o.dt, 'dt');
    var p = field(o.pressure, d.n, 0, 'pressure'), kind = field(o.kind, d.n, LIQUID, 'kind');
    var u = field(o.velocityU || o.faceU, (w + 1) * h, 0, 'velocityU');
    var v = field(o.velocityV || o.faceV, w * (h + 1), 0, 'velocityV');
    var out = new Float64Array(d.n);
    for (var i = 0; i < d.n; i++) {
      if (kind[i] !== LIQUID) { out[i] = 0; continue; }
      var x = i % w + 0.5, y = Math.floor(i / w) + 0.5;
      var vx = sampleField(u, w + 1, h, x, y - 0.5), vy = sampleField(v, w, h + 1, x - 0.5, y);
      var tx = Math.max(0.5, Math.min(w - 0.5, x - vx * dt / dx));
      var ty = Math.max(0.5, Math.min(h - 0.5, y - vy * dt / dx));
      var steps = Math.max(1, Math.ceil(2 * Math.hypot(tx - x, ty - y))), clearX = x, clearY = y;
      for (var step = 1; step <= steps; step++) {
        var sx = x + (tx - x) * step / steps, sy = y + (ty - y) * step / steps;
        var index = Math.floor(sy) * w + Math.floor(sx);
        if (kind[index] !== LIQUID) break;
        clearX = sx; clearY = sy;
      }
      var qx = clearX - 0.5, qy = clearY - 0.5, bx = Math.floor(qx), by = Math.floor(qy), fx = qx - bx, fy = qy - by;
      var total = 0, weight = 0;
      for (var k = 0; k < 4; k++) {
        var col = Math.max(0, Math.min(w - 1, bx + (k & 1))), row = Math.max(0, Math.min(h - 1, by + (k >> 1)));
        var j = row * w + col, wt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
        if (kind[j] === LIQUID) { total += wt * p[j]; weight += wt; }
      }
      out[i] = weight > 0 ? total / weight : p[i];
    }
    return out;
  }

  return { SOLID: SOLID, LIQUID: LIQUID, AIR: AIR, quadraticIntegral: quadraticIntegral, kernelControlVolume: kernelControlVolume,
    scatterMAC: scatterMAC, gatherMAC: gatherMAC, representedBasisVolume: representedBasisVolume,
    liquidEOS: liquidEOS, advanceJ: advanceJ, constitutiveCell: constitutiveCell, accessibleAir: accessibleAir,
    labelAir: labelAir, classifyPhase: classifyPhase, remapGas: remapGas,
    buildSystem: buildSystem, assembleRhs: assembleRhs, packCSR: packCSR, multiply: multiply,
    residual: residual, solve: solve, projectFaces: projectFaces, advectPressure: advectPressure };
});
