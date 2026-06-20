/* ============================================================
 * jello-wgpu.js — WebGPU compute port of the jello INNER LOOP
 * ------------------------------------------------------------
 * Ports jelloBodyInternalSubstep (xpbd solver only) for ISOLATED
 * bodies: integrate + COLORED XPBD distance constraints + world
 * tile collision + velocity clamp (Stage 1), with volume / shape
 * match / strain limit / gap block / XSPH following in Stage 2.
 * Bodies in contact islands / near the player stay on the CPU
 * loop in js/sluice/340-jello.js (the v22 unified-contact
 * invariant: body-body contact must interleave with the internal
 * solve PER SUBSTEP — see the banner there). One workgroup per
 * body, ONE dispatch per frame: the substep loop runs INSIDE the
 * kernel (a per-phase dispatch chain would be ~700 dispatches of
 * encoder overhead per frame; bodies are workgroup-sized, so
 * workgroupBarrier() between phases is legal and sufficient).
 *
 * PARALLEL XPBD = build-time GREEDY EDGE COLORING: within a color
 * no two edges share a point, so a parallel batch is bitwise
 * identical to a serial sweep of that batch in any order. Colors
 * dispatch in fixed order, so GPU == color-ordered CPU sweep,
 * op for op in f32 — which is what makes a liquid-grade
 * self-test possible (tight epsilon, no stiffness drift).
 *
 * Staged — the CPU drives ALL live bodies until Stage 3:
 *   Stage 1  .. shared device (borrows the liquid's GPUDevice,
 *               smoke-wgpu pattern) + buffer pools + the
 *               mega-kernel with integrate / colored-distance /
 *               world-collide / vclamp phases + a deterministic
 *               single-cube-drop BOOT SELF-TEST against an
 *               in-module Math.fround CPU reference. Dormant:
 *               nothing in the game reads results.
 *   Stage 2  .. volume + shape match + strain limit + gap block
 *               + XSPH phases; full-chain self-test.
 *   Stage 3  .. flip-live: 340's island partition routes
 *               isolated bodies here behind USE_WEBGPU_JELLO
 *               (default false), 1-frame-latency readback,
 *               Y dev hotkey.
 *
 * HARD RULE: never put a backtick anywhere in the WGSL string —
 * it lives inside a JS backtick template literal. ASCII only.
 * ============================================================ */
(function () {
  'use strict';
  var STAGE = 1;

  // ---- Capacity constants (mirror 340's JELLO_MAX_*) ----
  var JW_MAX_POINTS  = 6000;
  var JW_MAX_BODIES  = 64;
  var JW_MAX_EDGES   = 24576;
  var JW_MAX_COLORS  = 16;
  var JW_MAX_STEPS   = 128;          // in-kernel substep cap (live frames pass <= 64)
  var WG             = 256;          // workgroup size (a body is <= ~600 points)
  var JW_TERRAIN_MAX_TILES = 1 << 16;
  var JW_BODY_U32    = 32;           // header stride in u32 lanes (n, starts, colorStart[17], pads)

  /* ---- Greedy edge coloring -------------------------------------------
   * First color unused by either endpoint, edges in build order. On the
   * square lattice this lands ~8 colors (H/V structural x parity + the
   * two shear diagonal families x parity); greedy <= 2*maxDegree - 1 and
   * the lattice maxDegree is 8, so JW_MAX_COLORS = 16 always suffices.
   * Returns { order: Int32Array (color-major edge permutation),
   *           colorStart: Int32Array(nColors+1), nColors }.
   * Deterministic: same body -> same coloring, CPU and GPU agree. ------ */
  function jwColorEdges(n, sA, sB, springN) {
    var pointMask = new Uint32Array(n);          // bit c set = a c-colored edge touches the point
    var edgeColor = new Int32Array(springN);
    var counts = new Int32Array(JW_MAX_COLORS);
    var nColors = 0, s, c;
    for (s = 0; s < springN; s++) {
      var used = pointMask[sA[s]] | pointMask[sB[s]];
      for (c = 0; c < JW_MAX_COLORS - 1; c++) { if (!(used & (1 << c))) break; }
      edgeColor[s] = c;
      pointMask[sA[s]] |= (1 << c);
      pointMask[sB[s]] |= (1 << c);
      counts[c]++;
      if (c + 1 > nColors) nColors = c + 1;
    }
    var colorStart = new Int32Array(nColors + 1);
    for (c = 0; c < nColors; c++) colorStart[c + 1] = colorStart[c] + counts[c];
    var cursor = Int32Array.from(colorStart.subarray(0, nColors));
    var order = new Int32Array(springN);
    for (s = 0; s < springN; s++) order[cursor[edgeColor[s]]++] = s;
    return { order: order, colorStart: colorStart, nColors: nColors };
  }

  /* ---- Self-test body: one NPT=3 tile cube (16 points), the exact spring
   * pattern 340's jelloBuildBody lays down for a single cell: structural
   * right+down neighbours, shear = both diagonals of each lattice cell. */
  function jwTestCube(x0, y0, spacing) {
    var N = 4, n = N * N;
    var px = new Float32Array(n), py = new Float32Array(n);
    var i, j;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      px[j * N + i] = Math.fround(x0 + i * spacing);
      py[j * N + i] = Math.fround(y0 + j * spacing);
    }
    var sA = [], sB = [], rest = [], type = [];
    function spring(a, b, t) {
      var dx = px[a] - px[b], dy = py[a] - py[b];
      sA.push(a); sB.push(b); rest.push(Math.fround(Math.sqrt(dx * dx + dy * dy))); type.push(t);
    }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var p = j * N + i;
      if (i + 1 < N) spring(p, p + 1, 0);         // structural right
      if (j + 1 < N) spring(p, p + N, 0);         // structural down
      if (i + 1 < N && j + 1 < N) {               // cell shear diagonals
        spring(p, p + N + 1, 1);
        spring(p + 1, p + N, 1);
      }
    }
    return { n: n, px: px, py: py, sA: sA, sB: sB, rest: rest, type: type };
  }

  /* ---- CPU reference: replays the kernel op-for-op under Math.fround.
   * Per substep: P1 integrate, P2 color-ordered distance sweep, P6 world
   * collide vs the mask, P8 vclamp. Within a color edges share no points,
   * so JS order within a color matches any GPU thread order exactly. ---- */
  function jwReference(body, coloring, params, mask, steps) {
    var f = Math.fround;
    var n = body.n;
    var px = Float32Array.from(body.px), py = Float32Array.from(body.py);
    var ox = Float32Array.from(body.px), oy = Float32Array.from(body.py);
    var TILE = params.tile;
    function solid(x, y) {
      var c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      var lc = c - params.tileOrigC, lr = r - params.tileOrigR;
      if (lc < 0 || lr < 0 || lc >= params.tileW || lr >= params.tileH) return false;
      var bit = lr * params.tileW + lc;
      return (mask[bit >> 5] & (1 << (bit & 31))) !== 0;
    }
    var s, i, st;
    for (st = 0; st < steps; st++) {
      // P1 integrate
      for (i = 0; i < n; i++) {
        var vx = f(f(px[i] - ox[i]) * params.damp);
        var vy = f(f(py[i] - oy[i]) * params.damp);
        if (vx > params.vcap) vx = params.vcap; else if (vx < -params.vcap) vx = -params.vcap;
        if (vy > params.vcap) vy = params.vcap; else if (vy < -params.vcap) vy = -params.vcap;
        ox[i] = px[i]; oy[i] = py[i];
        px[i] = f(px[i] + vx);
        py[i] = f(f(py[i] + vy) + params.gravTerm);
      }
      // P2 colored distance sweep
      for (var c = 0; c < coloring.nColors; c++) {
        for (var e = coloring.colorStart[c]; e < coloring.colorStart[c + 1]; e++) {
          s = coloring.order[e];
          var i0 = body.sA[s], i1 = body.sB[s];
          var dx = f(px[i1] - px[i0]), dy = f(py[i1] - py[i0]);
          var d = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
          if (d < 1e-9) continue;
          var C = f(d - body.rest[s]);
          var at = body.type[s] ? params.alphaShear : params.alphaStruct;
          var dLam = f(-C / f(2 + at));
          var nx = f(dx / d), ny = f(dy / d);
          var sx = f(dLam * nx), sy = f(dLam * ny);
          px[i0] = f(px[i0] - sx); py[i0] = f(py[i0] - sy);
          px[i1] = f(px[i1] + sx); py[i1] = f(py[i1] + sy);
        }
      }
      // P6 world collide (port of jelloCollidePointWorld: rest threshold,
      // static friction, came-from bias; enclosed -> snap to prev)
      for (i = 0; i < n; i++) {
        var x = px[i], y = py[i];
        if (!solid(x, y)) continue;
        var col = Math.floor(x / TILE), row = Math.floor(y / TILE);
        var left = col * TILE, right = left + TILE, top = row * TILE, bot = top + TILE;
        var pen0 = f(y - top), pen1 = f(bot - y), pen2 = f(x - left), pen3 = f(right - x);
        var cvx = f(x - ox[i]), cvy = f(y - oy[i]);
        var minB = params.restVelH;
        if (oy[i] < top + TILE * 0.5) pen0 = f(pen0 - 1.5); else pen1 = f(pen1 - 1.5);
        if (ox[i] < left + TILE * 0.5) pen2 = f(pen2 - 1.5); else pen3 = f(pen3 - 1.5);
        var doneMask = 0, resolved = false;
        for (var k = 0; k < 4 && !resolved; k++) {
          var best = -1, bestPen = 1e9;
          if (!(doneMask & 1) && pen0 < bestPen) { best = 0; bestPen = pen0; }
          if (!(doneMask & 2) && pen1 < bestPen) { best = 1; bestPen = pen1; }
          if (!(doneMask & 4) && pen2 < bestPen) { best = 2; bestPen = pen2; }
          if (!(doneMask & 8) && pen3 < bestPen) { best = 3; bestPen = pen3; }
          if (best < 0) break;
          doneMask |= (1 << best);
          if (best === 0) {
            if (!solid(x, top - 1)) {
              y = f(top - 0.01);
              oy[i] = f(y + ((cvy > minB || cvy < -minB) ? f(cvy * params.bounce) : 0));
              ox[i] = (cvx > minB || cvx < -minB) ? f(x - f(cvx * params.floorFric)) : x;
              px[i] = x; py[i] = y; resolved = true;
            }
          } else if (best === 1) {
            if (!solid(x, bot + 1)) {
              y = f(bot + 0.01);
              oy[i] = f(y + ((cvy > minB || cvy < -minB) ? f(cvy * params.bounce) : 0));
              ox[i] = (cvx > minB || cvx < -minB) ? f(x - f(cvx * params.floorFric)) : x;
              px[i] = x; py[i] = y; resolved = true;
            }
          } else if (best === 2) {
            if (!solid(left - 1, y)) {
              x = f(left - 0.01);
              ox[i] = f(x + ((cvx > minB || cvx < -minB) ? f(cvx * params.bounce) : 0));
              oy[i] = (cvy > minB || cvy < -minB) ? f(y - f(cvy * params.wallFric)) : y;
              px[i] = x; py[i] = y; resolved = true;
            }
          } else {
            if (!solid(right + 1, y)) {
              x = f(right + 0.01);
              ox[i] = f(x + ((cvx > minB || cvx < -minB) ? f(cvx * params.bounce) : 0));
              oy[i] = (cvy > minB || cvy < -minB) ? f(y - f(cvy * params.wallFric)) : y;
              px[i] = x; py[i] = y; resolved = true;
            }
          }
        }
        if (!resolved) { px[i] = ox[i]; py[i] = oy[i]; }
      }
      // P8 vclamp
      for (i = 0; i < n; i++) {
        var wx = f(px[i] - ox[i]), wy = f(py[i] - oy[i]);
        var sp = f(Math.sqrt(f(f(wx * wx) + f(wy * wy))));
        if (sp > params.vcap) {
          var sc = f(params.vcap / sp);
          ox[i] = f(px[i] - f(wx * sc));
          oy[i] = f(py[i] - f(wy * sc));
        }
      }
    }
    return { px: px, py: py, ox: ox, oy: oy };
  }

  /* ---- The mega-kernel ------------------------------------------------
   * One workgroup per body; the substep loop runs inside. Per-body header
   * fields are loaded by thread 0 into workgroup vars and re-read through
   * workgroupUniformLoad so the WGSL uniformity analysis accepts barriers
   * inside loops bounded by them (the known landmine). phaseMask gates
   * the Stage-2 phases off until they land. */
  var WGSL_JELLO_STEP = /* wgsl */ `
struct Params {
  steps      : u32,  nBodies : u32,  phaseMask : u32,  pad0 : u32,
  h          : f32,  damp    : f32,  gravTerm  : f32,  vcap : f32,
  alphaStruct: f32,  alphaShear : f32,  bounce : f32,  restVelH : f32,
  floorFric  : f32,  wallFric   : f32,  tile   : f32,  pad1 : f32,
  tileOrigC  : i32,  tileOrigR  : i32,  tileW  : u32,  tileH : u32,
};
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read_write> pos  : array<vec4<f32>>;  // px,py,ox,oy
// binding 2 (aux: qx,qy,rx,ry) arrives with the Stage-2 shape-match phase;
// declaring it unused would make the 'auto' layout strip it and reject the
// bind group entry, so it stays out of BOTH the WGSL and the bind group.
@group(0) @binding(3) var<storage, read>       edgeA: array<u32>;
@group(0) @binding(4) var<storage, read>       edgeB: array<u32>;
@group(0) @binding(5) var<storage, read>       edgeRest : array<f32>;
@group(0) @binding(6) var<storage, read>       edgeType : array<u32>;
@group(0) @binding(7) var<storage, read>       bodyU : array<u32>;       // headers, JW_BODY_U32 stride
@group(0) @binding(8) var<storage, read>       mask  : array<u32>;

var<workgroup> wgN        : u32;
var<workgroup> wgPtStart  : u32;
var<workgroup> wgEdgeStart: u32;
var<workgroup> wgNColors  : u32;
var<workgroup> wgColor    : array<u32, 17>;

fn solidAt(x: f32, y: f32) -> bool {
  let c = i32(floor(x / P.tile));
  let r = i32(floor(y / P.tile));
  let lc = c - P.tileOrigC;
  let lr = r - P.tileOrigR;
  if (lc < 0 || lr < 0 || lc >= i32(P.tileW) || lr >= i32(P.tileH)) { return false; }
  let bit = u32(lr) * P.tileW + u32(lc);
  return (mask[bit >> 5u] & (1u << (bit & 31u))) != 0u;
}

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  let bodyI = wid.x;
  if (bodyI >= P.nBodies) { return; }
  if (lid.x == 0u) {
    let h = bodyI * 32u;
    wgN         = bodyU[h];
    wgPtStart   = bodyU[h + 1u];
    wgEdgeStart = bodyU[h + 2u];
    wgNColors   = bodyU[h + 4u];
    for (var c = 0u; c < 17u; c = c + 1u) { wgColor[c] = bodyU[h + 8u + c]; }
  }
  workgroupBarrier();
  let n        = workgroupUniformLoad(&wgN);
  let ptStart  = workgroupUniformLoad(&wgPtStart);
  let edStart  = workgroupUniformLoad(&wgEdgeStart);
  let nColors  = workgroupUniformLoad(&wgNColors);

  for (var step = 0u; step < P.steps; step = step + 1u) {
    // ---- P1 integrate (Verlet + damp + per-axis vcap + gravity) ----
    for (var i = lid.x; i < n; i = i + 256u) {
      var p = pos[ptStart + i];
      var vx = (p.x - p.z) * P.damp;
      var vy = (p.y - p.w) * P.damp;
      vx = clamp(vx, -P.vcap, P.vcap);
      vy = clamp(vy, -P.vcap, P.vcap);
      p.z = p.x; p.w = p.y;
      p.x = p.x + vx;
      p.y = (p.y + vy) + P.gravTerm;
      pos[ptStart + i] = p;
    }
    workgroupBarrier();
    // ---- P2 colored XPBD distance sweep (one sweep, lambdas provably 0) ----
    for (var c = 0u; c < nColors; c = c + 1u) {
      let e0 = workgroupUniformLoad(&wgColor[c]);
      let e1 = workgroupUniformLoad(&wgColor[c + 1u]);
      for (var e = e0 + lid.x; e < e1; e = e + 256u) {
        let i0 = ptStart + edgeA[edStart + e];
        let i1 = ptStart + edgeB[edStart + e];
        let pa = pos[i0];
        let pb = pos[i1];
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d = sqrt(dx * dx + dy * dy);
        if (d >= 1e-9) {
          let C = d - edgeRest[edStart + e];
          var at = P.alphaStruct;
          if (edgeType[edStart + e] != 0u) { at = P.alphaShear; }
          let dLam = -C / (2.0 + at);
          let nx = dx / d;
          let ny = dy / d;
          let sx = dLam * nx;
          let sy = dLam * ny;
          pos[i0] = vec4<f32>(pa.x - sx, pa.y - sy, pa.z, pa.w);
          pos[i1] = vec4<f32>(pb.x + sx, pb.y + sy, pb.z, pb.w);
        }
      }
      workgroupBarrier();
    }
    // ---- P6 world collide (jelloCollidePointWorld port: rest threshold,
    //      static friction, came-from bias; enclosed -> snap to prev) ----
    for (var i = lid.x; i < n; i = i + 256u) {
      var p = pos[ptStart + i];
      if (solidAt(p.x, p.y)) {
        let col = floor(p.x / P.tile);
        let row = floor(p.y / P.tile);
        let left = col * P.tile;
        let right = left + P.tile;
        let top = row * P.tile;
        let bot = top + P.tile;
        var pen0 = p.y - top;
        var pen1 = bot - p.y;
        var pen2 = p.x - left;
        var pen3 = right - p.x;
        let cvx = p.x - p.z;
        let cvy = p.y - p.w;
        if (p.w < top + P.tile * 0.5) { pen0 = pen0 - 1.5; } else { pen1 = pen1 - 1.5; }
        if (p.z < left + P.tile * 0.5) { pen2 = pen2 - 1.5; } else { pen3 = pen3 - 1.5; }
        var doneMask = 0u;
        var resolved = false;
        for (var k = 0u; k < 4u; k = k + 1u) {
          if (resolved) { break; }
          var best = -1;
          var bestPen = 1e9;
          if ((doneMask & 1u) == 0u && pen0 < bestPen) { best = 0; bestPen = pen0; }
          if ((doneMask & 2u) == 0u && pen1 < bestPen) { best = 1; bestPen = pen1; }
          if ((doneMask & 4u) == 0u && pen2 < bestPen) { best = 2; bestPen = pen2; }
          if ((doneMask & 8u) == 0u && pen3 < bestPen) { best = 3; bestPen = pen3; }
          if (best < 0) { break; }
          doneMask = doneMask | (1u << u32(best));
          if (best == 0) {
            if (!solidAt(p.x, top - 1.0)) {
              let y = top - 0.01;
              var bounceT = 0.0;
              if (cvy > P.restVelH || cvy < -P.restVelH) { bounceT = cvy * P.bounce; }
              p.w = y + bounceT;
              if (cvx > P.restVelH || cvx < -P.restVelH) { p.z = p.x - cvx * P.floorFric; } else { p.z = p.x; }
              p.y = y; resolved = true;
            }
          } else if (best == 1) {
            if (!solidAt(p.x, bot + 1.0)) {
              let y = bot + 0.01;
              var bounceT = 0.0;
              if (cvy > P.restVelH || cvy < -P.restVelH) { bounceT = cvy * P.bounce; }
              p.w = y + bounceT;
              if (cvx > P.restVelH || cvx < -P.restVelH) { p.z = p.x - cvx * P.floorFric; } else { p.z = p.x; }
              p.y = y; resolved = true;
            }
          } else if (best == 2) {
            if (!solidAt(left - 1.0, p.y)) {
              let x = left - 0.01;
              var bounceT = 0.0;
              if (cvx > P.restVelH || cvx < -P.restVelH) { bounceT = cvx * P.bounce; }
              p.z = x + bounceT;
              if (cvy > P.restVelH || cvy < -P.restVelH) { p.w = p.y - cvy * P.wallFric; } else { p.w = p.y; }
              p.x = x; resolved = true;
            }
          } else {
            if (!solidAt(right + 1.0, p.y)) {
              let x = right + 0.01;
              var bounceT = 0.0;
              if (cvx > P.restVelH || cvx < -P.restVelH) { bounceT = cvx * P.bounce; }
              p.z = x + bounceT;
              if (cvy > P.restVelH || cvy < -P.restVelH) { p.w = p.y - cvy * P.wallFric; } else { p.w = p.y; }
              p.x = x; resolved = true;
            }
          }
        }
        if (!resolved) { p.x = p.z; p.y = p.w; }
        pos[ptStart + i] = p;
      }
    }
    workgroupBarrier();
    // ---- P8 velocity clamp (isotropic, slides prev toward current) ----
    for (var i = lid.x; i < n; i = i + 256u) {
      var p = pos[ptStart + i];
      let wx = p.x - p.z;
      let wy = p.y - p.w;
      let sp = sqrt(wx * wx + wy * wy);
      if (sp > P.vcap) {
        let sc = P.vcap / sp;
        p.z = p.x - wx * sc;
        p.w = p.y - wy * sc;
        pos[ptStart + i] = p;
      }
    }
    workgroupBarrier();
  }
}
`;

  /* ---- Buffers --------------------------------------------------------- */
  function buildBuffers(instance) {
    var dev = instance.device;
    function sbuf(label, bytes, usage) {
      return dev.createBuffer({ label: label, size: bytes, usage: usage });
    }
    var S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    instance.buf = {
      pos:      sbuf('jello.pos',      JW_MAX_POINTS * 16, S | GPUBufferUsage.COPY_SRC),
      aux:      sbuf('jello.aux',      JW_MAX_POINTS * 16, S),
      edgeA:    sbuf('jello.edgeA',    JW_MAX_EDGES * 4,  S),
      edgeB:    sbuf('jello.edgeB',    JW_MAX_EDGES * 4,  S),
      edgeRest: sbuf('jello.edgeRest', JW_MAX_EDGES * 4,  S),
      edgeType: sbuf('jello.edgeType', JW_MAX_EDGES * 4,  S),
      bodyU:    sbuf('jello.bodyU',    JW_MAX_BODIES * JW_BODY_U32 * 4, S),
      mask:     sbuf('jello.mask',     (JW_TERRAIN_MAX_TILES >> 5) * 4, S),
      params:   sbuf('jello.params',   80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
      readA:    sbuf('jello.readA',    JW_MAX_POINTS * 16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST),
      readB:    sbuf('jello.readB',    JW_MAX_POINTS * 16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)
    };
    instance.paramsHostU = new Uint32Array(20);
    instance.paramsHostF = new Float32Array(instance.paramsHostU.buffer);
    instance.buffersReady = true;
  }

  function buildPipeline(instance) {
    var dev = instance.device;
    var module = dev.createShaderModule({ label: 'jello.step', code: WGSL_JELLO_STEP });
    instance.pipeline = dev.createComputePipeline({
      label: 'jello.step',
      layout: 'auto',
      compute: { module: module, entryPoint: 'main' }
    });
    var b = instance.buf;
    instance.bindGroup = dev.createBindGroup({
      label: 'jello.bind',
      layout: instance.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: b.params } },
        { binding: 1, resource: { buffer: b.pos } },
        { binding: 3, resource: { buffer: b.edgeA } },
        { binding: 4, resource: { buffer: b.edgeB } },
        { binding: 5, resource: { buffer: b.edgeRest } },
        { binding: 6, resource: { buffer: b.edgeType } },
        { binding: 7, resource: { buffer: b.bodyU } },
        { binding: 8, resource: { buffer: b.mask } }
      ]
    });
    instance.pipelineReady = true;
  }

  function writeParams(instance, p) {
    var U = instance.paramsHostU, F = instance.paramsHostF;
    U[0] = p.steps >>> 0; U[1] = p.nBodies >>> 0; U[2] = p.phaseMask >>> 0; U[3] = 0;
    F[4] = p.h; F[5] = p.damp; F[6] = p.gravTerm; F[7] = p.vcap;
    F[8] = p.alphaStruct; F[9] = p.alphaShear; F[10] = p.bounce; F[11] = p.restVelH;
    F[12] = p.floorFric; F[13] = p.wallFric; F[14] = p.tile; F[15] = 0;
    U[16] = p.tileOrigC | 0; U[17] = p.tileOrigR | 0; U[18] = p.tileW >>> 0; U[19] = p.tileH >>> 0;
    instance.queue.writeBuffer(instance.buf.params, 0, U.buffer, 0, 80);
  }

  /* ---- Stage 1 self-test: deterministic single-cube drop ----------------
   * A 16-point NPT=3 cube falls ~3 tiles onto a solid floor inside an 8x8
   * mask, 120 substeps at h = 1/240 in two dispatches (the kernel loops
   * in-kernel; two submits also exercise the steps-resume path). The GPU
   * result must match the in-module Math.fround CPU reference to
   * RMS < 1e-3 px (f32 ULP drift only - same op order by construction). */
  function runSelfTest(instance) {
    var TILE = 32;
    var body = jwTestCube(2 * TILE + 4, 1 * TILE, 32 / 3);
    var coloring = jwColorEdges(body.n, body.sA, body.sB, body.sA.length);
    // 8x8 mask: bottom two rows solid, side walls open.
    var tileW = 8, tileH = 8;
    var mask = new Uint32Array(Math.ceil(tileW * tileH / 32));
    for (var r = 6; r < 8; r++) for (var c = 0; c < 8; c++) {
      var bit = r * tileW + c;
      mask[bit >> 5] |= (1 << (bit & 31));
    }
    var h = 1 / 240;
    var params = {
      steps: 60, nBodies: 1, phaseMask: 0,
      h: Math.fround(h),
      damp: Math.fround(Math.pow(0.999, 1)),       // per-substep retention at dt = H
      gravTerm: Math.fround(600 * h * h),          // gravity * h^2 (timescale 1 for the test)
      vcap: Math.fround(600 * h),
      alphaStruct: Math.fround((4.0e-3 / 10) / (h * h)),
      alphaShear: Math.fround((8.0e-3 / 10) / (h * h)),
      bounce: 0.18, restVelH: Math.fround(30 * h),
      floorFric: 0.86, wallFric: 0.94,
      tile: TILE, tileOrigC: 0, tileOrigR: 0, tileW: tileW, tileH: tileH
    };
    var ref = jwReference(body, coloring, params, mask, 120);

    // Pack the cube into the pools at slot 0.
    var q = instance.queue;
    var n = body.n, springN = body.sA.length;
    var posHost = new Float32Array(n * 4);
    for (var i = 0; i < n; i++) {
      posHost[i * 4] = body.px[i]; posHost[i * 4 + 1] = body.py[i];
      posHost[i * 4 + 2] = body.px[i]; posHost[i * 4 + 3] = body.py[i];
    }
    q.writeBuffer(instance.buf.pos, 0, posHost.buffer);
    var eA = new Uint32Array(springN), eB = new Uint32Array(springN);
    var eR = new Float32Array(springN), eT = new Uint32Array(springN);
    for (var e = 0; e < springN; e++) {
      var s = coloring.order[e];                   // color-major pool order
      eA[e] = body.sA[s]; eB[e] = body.sB[s]; eR[e] = body.rest[s]; eT[e] = body.type[s];
    }
    q.writeBuffer(instance.buf.edgeA, 0, eA.buffer);
    q.writeBuffer(instance.buf.edgeB, 0, eB.buffer);
    q.writeBuffer(instance.buf.edgeRest, 0, eR.buffer);
    q.writeBuffer(instance.buf.edgeType, 0, eT.buffer);
    var head = new Uint32Array(JW_BODY_U32);
    head[0] = n; head[1] = 0; head[2] = 0; head[3] = springN; head[4] = coloring.nColors;
    for (var c2 = 0; c2 <= coloring.nColors; c2++) head[8 + c2] = coloring.colorStart[c2];
    q.writeBuffer(instance.buf.bodyU, 0, head.buffer);
    q.writeBuffer(instance.buf.mask, 0, mask.buffer);
    writeParams(instance, params);

    function dispatch() {
      var enc = instance.device.createCommandEncoder({ label: 'jello.selftest' });
      var pass = enc.beginComputePass();
      pass.setPipeline(instance.pipeline);
      pass.setBindGroup(0, instance.bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
      q.submit([enc.finish()]);
    }
    dispatch();           // 60 steps
    dispatch();           // +60 steps (params unchanged)

    var enc2 = instance.device.createCommandEncoder();
    enc2.copyBufferToBuffer(instance.buf.pos, 0, instance.buf.readA, 0, n * 16);
    q.submit([enc2.finish()]);
    return instance.buf.readA.mapAsync(GPUMapMode.READ, 0, n * 16).then(function () {
      var got = new Float32Array(instance.buf.readA.getMappedRange(0, n * 16).slice(0));
      instance.buf.readA.unmap();
      var sum = 0, maxd = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var ddx = got[i2 * 4] - ref.px[i2], ddy = got[i2 * 4 + 1] - ref.py[i2];
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        sum += dd * dd; if (dd > maxd) maxd = dd;
      }
      var rms = Math.sqrt(sum / n);
      instance.selfTestRms = rms; instance.selfTestMax = maxd;
      instance.selfTestOk = (rms < 1e-3 && maxd < 0.05);
      try {
        console.log('JelloWGPU Stage ' + STAGE + ': cube-drop self-test ' +
          (instance.selfTestOk ? 'OK' : 'FAIL') +
          ' - rms=' + rms.toExponential(2) + 'px max=' + maxd.toExponential(2) + 'px' +
          ' (dormant; CPU drives all live bodies)');
      } catch (_) {}
      return instance.selfTestOk;
    });
  }

  /* ---- create ----------------------------------------------------------- */
  function create(opts) {
    opts = opts || {};
    var instance = {
      stage: STAGE,
      device: null, queue: null,
      available: false,        // device + buffers + pipeline ready
      simActive: false,        // Stage 3 flips this; Stage 1 stays dormant
      failed: false,
      buffersReady: false, pipelineReady: false,
      selfTestOk: false, selfTestRms: -1, selfTestMax: -1,
      readyPromise: null,
      // Stage 3 API stubs (the game can call these unconditionally):
      frame: function () { return false; },
      applyReadback: function () { return false; },
      reset: function () {},
      dispose: function () {}
    };
    var liquid = opts.liquid;
    if (!liquid || !liquid.readyPromise) {
      instance.failed = true;
      instance.readyPromise = Promise.resolve(false);
      try { console.log('JelloWGPU: no shared WebGPU device - CPU jello stays.'); } catch (_) {}
      return instance;
    }
    instance.readyPromise = liquid.readyPromise.then(function () {
      if (!liquid.device || !liquid.available) {
        instance.failed = true;
        try { console.log('JelloWGPU: shared device unavailable - CPU jello stays.'); } catch (_) {}
        return false;
      }
      instance.device = liquid.device;
      instance.queue = liquid.device.queue;
      try {
        liquid.device.lost.then(function (info) {
          instance.available = false; instance.simActive = false; instance.failed = true;
          try { console.warn('JelloWGPU: shared device lost -', info && info.message); } catch (_) {}
        });
      } catch (_) {}
      try {
        buildBuffers(instance);
        buildPipeline(instance);
        instance.available = true;
      } catch (e) {
        instance.failed = true;
        try { console.warn('JelloWGPU Stage 1: build failed - ' + ((e && e.message) || e)); } catch (_) {}
        return false;
      }
      // Boot self-test: fired, logged, not awaited by the game.
      return runSelfTest(instance).catch(function (e) {
        try { console.warn('JelloWGPU Stage 1: self-test threw - ' + ((e && e.message) || e)); } catch (_) {}
        return false;
      });
    });
    return instance;
  }

  window.JelloWGPU = { create: create, stage: STAGE };
})();
