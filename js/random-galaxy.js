/* ============================================================
   RANDOM-GALAXY.JS, "Randomness Is Clumpy"

   A bounded universe explorer for random number generators.

   Every generator emits a stream of floats in [0,1). We read it
   as OVERLAPPING successive triples, point_i = (u_i, u_{i+1},
   u_{i+2}), and scatter those into a unit cube. That mapping is
   the classic spectral / lag plot: it's exactly what exposes a
   bad generator's hidden structure.

     - A good generator  -> a clumpy cosmos, like real space.
     - RANDU             -> the points snap onto ~15 flat planes
                            as you rotate. The most famous failure
                            in computing, made into scenery.

   Stars are drawn as camera-facing billboards with ADDITIVE
   blending, so dense clumps glow brighter for free, clumpiness
   becomes luminosity with no extra work.

   This is the v0.1 foundation slice. Bloom, the density-driven
   volumetric nebula, the operator knobs, the diagnostic gauges,
   and the solar-system home dock all layer on top of this.
   ============================================================ */
(function () {
  'use strict';

  var VERSION = 'v1.60';

  /* ---- Analytics helper (safe no-op if gtag is missing) ---- */
  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }

  /* ---- DOM ---- */
  var canvas    = document.getElementById('galaxy-canvas');
  var statusEl  = document.getElementById('galaxy-status');
  var nameEl    = document.getElementById('galaxy-name');
  var blurbEl   = document.getElementById('galaxy-blurb');
  var gensEl    = document.getElementById('galaxy-gens');
  var wrapperEl = document.getElementById('galaxy-wrapper');
  var hudLine   = document.getElementById('gx-line');
  var hudTarget = document.getElementById('gx-target');
  var calloutEl = document.getElementById('galaxy-callout');
  var tagEl     = document.getElementById('gx-tag');
  var sizeEl    = document.getElementById('gx-size');
  var fpsEl     = document.getElementById('galaxy-fps');
  var hintEl    = document.getElementById('galaxy-hint');
  var verEl     = document.getElementById('galaxy-ver');
  var badgeEl   = document.getElementById('galaxy-badge');
  var instToggleEl = document.getElementById('galaxy-inst-toggle');
  var instPanelEl  = document.getElementById('galaxy-instruments');
  var radiusGroup  = document.getElementById('galaxy-radius');
  var speedWrap = document.getElementById('galaxy-speed');
  var speedRange = document.getElementById('gx-speed-range');
  var speedVal  = document.getElementById('gx-speed-val');
  var predValueEl = document.getElementById('gx-pred-value');
  var predFillEl  = document.getElementById('gx-pred-fill');
  var predSubEl   = document.getElementById('gx-pred-sub');
  var predLabelEl = document.getElementById('gx-pred-label');
  if (!canvas) return;

  function fail(msg) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.classList.add('gx-status-error');
      statusEl.style.display = '';
    }
  }

  if (!navigator.gpu) {
    canvas.style.background = '#06070d';
    fail('This piece renders with WebGPU, which this browser does not support yet. It runs today in Chrome and Edge; Safari and Firefox are still rolling support out.');
    return;
  }

  /* ============================================================
     PRNG REGISTRY
     Each entry: { key, name, blurb, make(seed) -> next() }
     `next()` returns a float in [0,1). Adding a generator here is
     all it takes to add a new universe to explore.
     ============================================================ */

  // RANDU, IBM's infamous LCG: x = 65539*x mod 2^31.
  // 65539 * (2^31-1) < 2^53, so the product is exact in a double.
  function makeRandu(seed) {
    var x = (seed >>> 0) % 2147483648;
    if (x <= 0) x = 1;
    if ((x & 1) === 0) x += 1;            // RANDU wants an odd seed
    return function () {
      x = (65539 * x) % 2147483648;
      return x / 2147483648;
    };
  }

  // Mulberry32, a solid little modern PRNG. Good statistical quality.
  function makeMulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Numerical Recipes LCG, mod 2^32 (via Math.imul for exact low 32 bits).
  // A middling generator, fine in 1D, faint lattice in 3D triples.
  function makeNRLcg(seed) {
    var x = seed >>> 0;
    return function () {
      x = (Math.imul(1664525, x) + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  // The browser's built-in (V8 is xorshift128+). Good, and NOT seedable.
  function makeNative() {
    return function () { return Math.random(); };
  }

  // ---- The zoo: generators (and chaotic maps) whose hidden structure shows
  // the moment you read the stream as 3D points. This is the whole of Act III. ----

  // MT19937, the Mersenne Twister: the most-used PRNG in the world (Python's
  // default). Statistically excellent, so it looks like a plain clumpy cloud.
  function makeMersenne(seed) {
    var mt = new Uint32Array(624), idx = 624;
    mt[0] = seed >>> 0;
    for (var i = 1; i < 624; i++) {
      var p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    function twist() {
      for (var i = 0; i < 624; i++) {
        var y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
        var n = mt[(i + 397) % 624] ^ (y >>> 1);
        if (y & 1) n = n ^ 0x9908b0df;
        mt[i] = n >>> 0;
      }
      idx = 0;
    }
    return function () {
      if (idx >= 624) twist();
      var y = mt[idx++];
      y ^= y >>> 11;
      y ^= (y << 7) & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= y >>> 18;
      return (y >>> 0) / 4294967296;
    };
  }

  // MINSTD (Park-Miller, 1988): x = 16807*x mod (2^31 - 1). The "minimal
  // standard" LCG. 16807*x stays under 2^53, so plain doubles stay exact.
  function makeMinstd(seed) {
    var x = (seed >>> 0) % 2147483647;
    if (x === 0) x = 1;
    return function () {
      x = (16807 * x) % 2147483647;
      return x / 2147483647;
    };
  }

  // A coarse LCG: tiny modulus, so only a few thousand values exist and the
  // triples collapse onto a blunt 3D grid. a,c chosen for full period.
  function makeCoarseLcg(seed) {
    var m = 4096, a = 1229, c = 1;
    var x = (seed >>> 0) % m;
    return function () {
      x = (a * x + c) % m;
      return x / m;
    };
  }

  // Von Neumann's middle-square (1949), the first PRNG: square the number and
  // keep the middle digits. Famous for falling into short loops or zero.
  function makeMidSquare(seed) {
    var x = ((seed >>> 0) % 900000) + 100000;   // a 6-digit start
    return function () {
      var sq = x * x;                       // < 1e12, exact in a double
      x = Math.floor(sq / 1000) % 1000000;  // the middle six digits
      return x / 1000000;
    };
  }

  // Logistic map at r = 4: x -> 4x(1-x). Not a generator, a chaotic equation.
  // Looks random in one column; in 3D every point lands on one curved thread.
  function makeLogistic(seed) {
    var x = (((seed >>> 0) % 999998) + 1) / 1000000;
    return function () {
      x = 4 * x * (1 - x);
      if (x <= 0) x = 1e-6; else if (x >= 1) x = 1 - 1e-6;
      return x;
    };
  }

  // Tent map (slope just under 2 to dodge the floating-point shift collapse).
  // Folds the interval each step; its points sit on sharp folded sheets.
  function makeTent(seed) {
    var x = (((seed >>> 0) % 999998) + 1) / 1000000;
    return function () {
      x = (x < 0.5) ? (1.99 * x) : (1.99 * (1 - x));
      if (x <= 0) x = 1e-6; else if (x >= 1) x = 1 - 1e-6;
      return x;
    };
  }

  // Weyl / additive recurrence: add an irrational each step, keep the fraction.
  // Lovely and uniform in 1D, but the triples line up on a few parallel rails.
  function makeWeyl(seed) {
    var alpha = 0.6180339887498949;             // golden-ratio fraction
    var x = ((seed >>> 0) % 100000) / 100000;
    return function () {
      x = (x + alpha) % 1;
      return x;
    };
  }

  // Counter: barely a generator. Count upward and wrap. Consecutive values
  // differ by a hair, so every triple sits on the main diagonal: one line.
  function makeCounter(seed) {
    var N = 1000003, n = (seed >>> 0) % N;
    return function () {
      n = (n + 1) % N;
      return n / N;
    };
  }

  // Only Mulberry32 (real randomness) is live right now; the demo is a clean
  // A/B against the "imagined" even field. The other generator functions above
  // are kept dormant on purpose, ready for when the zoo returns.
  var ALGOS = [
    {
      key: 'mulberry32', name: 'Mulberry32', seeded: true, make: makeMulberry32, quality: 'good', tag: 'trusted',
      blurb: 'A million rolls of a real random generator, drawn as points in space. Look close: randomness clumps. Dense knots, hollow voids, the odd streak, exactly the way stars gather into clusters and filaments. Colour tracks the crowding, so tight knots burn warm and bright while empty space stays cold and dim. Which raises a strange question: could pure chance ever roll a perfectly even universe? Or would every generator, given enough rolls, land on the very same thing?'
    }
  ];

  /* ============================================================
     POINT GENERATION  (CPU)
     PRNGs are inherently sequential, so we run them on the CPU and
     upload the positions. Overlapping triples are the load-bearing
     bit, they're what make RANDU's planes appear.
     ============================================================ */
  var POINT_COUNT = 200000;     // ACTIVE generated count (live, set by the Particles dev slider). Default 200k (PC).
  var POINT_CAP   = 12000000;   // hard ceiling the buffer may grow to (dev slider max). 12M = ~192MB buffer (under the 256MB WebGPU limit).
  var pointCapacity = POINT_COUNT;  // current allocated capacity; grows toward POINT_CAP on demand, never shrinks
  // 4 floats per point: x, y, z, and a density-deviation value
  // (log2 of local density / expected). The deviation drives colour, warm
  // clusters, cold voids, so the picture itself proves the thesis.
  // Sized to the ACTIVE count, not the cap: the default footprint stays 1M
  // and only reallocates upward when the Particles slider is cranked, so the
  // default look + memory + startup are untouched (the density field, hence
  // the clumpiness colouring, depends on the count).
  var positions = new Float32Array(POINT_COUNT * 4);

  var PROX_RADIUS = 0.013;      // spatial-grid cell size; must stay >= the max cluster radius
  var TOUCH_RADIUS = 0.009;     // neighbour radius for the random field's density colouring (cube units); wider = more points get a colour, so the cloud reads as a rich clumpy rainbow rather than lonely dim specks
  var LY_PER_UNIT = 400;        // real-space scale: the unit cube spans 400 light years
  var FLIGHT_TARGET_DIST = 0.4; // in flight, only bracket clusters within this distance (cube units, ~160 ly)
  var clumps = [];              // detected clusters: { x, y, z, members, size }
  var CLUMP_MIN_COUNT = 2;      // a star needs this many touching neighbours (cluster size 3+) to seed a cluster
  var CLUMP_RADIUS = 0.06;      // merge candidates within this distance into one clump
  var MAX_CLUMPS = 48;          // track at most this many clumps
  var CLUMP_CAND_CAP = 4000;    // cap candidates before clustering (perf for structured generators)
  var touchHist = new Float64Array(17);  // per-star touching-count histogram (drives the live odds); float for scaled estimates
  var gridCounts = null, gridOrder = null, gridCursor = null, ptCell = null;

  var currentIndex = 0;
  var currentSeed = 1;
  var currentField = 'random';   // which point field is loaded: 'random' (PRNG), an attractor, a fractal, or a number set
  var pendingField = null;       // a field to swap in once the morph dips to the (invisible) grid

  function loadField(f) {
    if (f === 'thomas') generateThomas();
    else if (f === 'lorenz') generateLorenz();
    else if (f === 'aizawa') generateAizawa();
    else if (f === 'dadras') generateDadras();
    else if (f === 'sierpinski') generateSierpinski();
    else if (f === 'jerusalem') generateJerusalem();
    else if (f === 'vicsek') generateVicsek();
    else if (f === 'primes3d') generatePrimes3D();
    else if (f === 'gprimes') generateGaussianPrimes();
    else if (f === 'collatz') generateCollatz();
    else if (f === 'pi') generatePi();
    else if (f === 'polytope') generatePolytope();
    else if (f === 'clifford') generateClifford();
    else if (f === 'logistic') generateLogistic();
    else if (f === 'recaman') generateRecaman();
    else if (f === 'floweroflife') generateFlowerOfLife();
    else if (f === 'metatron') generateMetatron();
    else if (f === 'hopf') generateHopf();
    else if (f === 'lotus') generateLotus();
    else if (f === 'harmonics') generateHarmonics();
    else if (f === 'bfs' || f === 'bidir' || f === 'dijkstra' || f === 'wavefront' || f === 'randomflood' || f === 'dfs' || f === 'randomwalk') generateSearch(f);
    else if (isSortField(f)) generateSort(f);
    else if (isLifeField(f)) generateLife(f);
    else regenerate();
    currentField = f;
    // Search + sort scenes spawn stationary so you can take them in before
    // moving; every other scene resumes the cruise speed you last chose.
    if (isSearchField(f) || isSortField(f) || isLifeField(f)) applySpeed(0); else applySpeed(lastCruiseSpeed);
  }

  function regenerate() {
    var algo = ALGOS[currentIndex];
    var next = algo.make(currentSeed);
    // Rolling window of three: point_i = (u_i, u_{i+1}, u_{i+2}).
    var a = next();
    var b = next();
    var c;
    for (var i = 0; i < POINT_COUNT; i++) {
      c = next();
      positions[i * 4 + 0] = a;
      positions[i * 4 + 1] = b;
      positions[i * 4 + 2] = c;
      a = b;
      b = c;
    }
    computeHeat();
    if (instanceBuffer && device) {
      device.queue.writeBuffer(instanceBuffer, 0, positions);
    }
  }

  // Grow the point buffer toward POINT_CAP on demand (never shrinks, to avoid
  // realloc churn). instanceBuffer is a plain vertex buffer (bound per-draw via
  // setVertexBuffer, not in a bind group), so recreating it needs no rebind.
  function ensurePointCapacity(n) {
    if (n <= pointCapacity) return;
    pointCapacity = n;
    positions = new Float32Array(pointCapacity * 4);   // closure var; all generators re-read it
    if (device) {
      if (instanceBuffer) { try { instanceBuffer.destroy(); } catch (e) {} }
      instanceBuffer = device.createBuffer({
        size: positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }
  }

  // Live "particle count" lever (dev Particles slider). Sets the active count,
  // re-derives the imagined-grid side, grows the buffer if needed, then
  // regenerates the CURRENT field at the new count and re-uploads. Draw cap is
  // bumped to draw all the new points. Heavy at 4M (CPU gen + heat), so the
  // slider applies on release, not every tick.
  function setPointCount(n) {
    n = Math.max(1000, Math.min(POINT_CAP, Math.round(n)));
    if (isLifeField(currentField)) return;   // Life scenes own a fixed point budget; the dev slider must not fight it
    if (isSearchField(currentField)) {
      // On the torus search the lattice is a fixed N^3 buffer; changing
      // POINT_COUNT here fought it (the old breakage). Reinterpret the slider as
      // the lattice resolution instead, so it adds/removes torus particles.
      var sn = Math.max(30, Math.min(90, Math.round(Math.cbrt(n))));
      if (sn === SEARCH_N) return;
      SEARCH_N = sn;
      if (pf) pf.built = false;                          // force a rebuild at the new resolution
      ensurePointCapacity(sn * sn * sn + EDGE_BUDGET);
      loadField(currentField);
      return;
    }
    if (n === POINT_COUNT && DRAW_COUNT === POINT_COUNT) return;
    ensurePointCapacity(n);
    POINT_COUNT = n;
    MORPH_GRID_N = Math.max(2, Math.round(Math.cbrt(POINT_COUNT)));
    DRAW_COUNT = POINT_COUNT;
    loadField(currentField);
  }

  // Thomas' cyclically symmetric attractor: a three-line chaotic equation,
  //   dx = sin(y) - b*x,  dy = sin(z) - b*y,  dz = sin(x) - b*z.
  // The vector field is 2*pi-periodic, so folding the trajectory into one
  // cell and letting the engine tile it reproduces an endless lattice of
  // glowing loops you fly through forever. Colour rides the speed (4th float).
  function generateThomas() {
    var b = 0.208186, dt = 0.03;
    var x = 0.1, y = 0.0, z = 0.0;
    var inv = 1 / (Math.PI * 2);
    for (var i = 0; i < POINT_COUNT; i++) {
      var dx = Math.sin(y) - b * x;
      var dy = Math.sin(z) - b * y;
      var dz = Math.sin(x) - b * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
      var px = x * inv, py = y * inv, pz = z * inv;
      positions[i * 4 + 0] = px - Math.floor(px);
      positions[i * 4 + 1] = py - Math.floor(py);
      positions[i * 4 + 2] = pz - Math.floor(pz);
      positions[i * 4 + 3] = 2 + Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), 3);
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Lorenz attractor: the iconic butterfly with two wings,
  //   dx = 10(y-x),  dy = x(28-z)-y,  dz = xy-(8/3)z.
  // Integrate 2000 warmup steps to shed the transient, then record 1 M points.
  // Normalize to a centered unit cube (radius 0.33) so the engine can tile it.
  // Colour rides the step speed so the fast-switching neck glows gold/red.
  function generateLorenz() {
    var dt = 0.005;
    var x = 0.1, y = 0.0, z = 0.0;
    var i, dx, dy, dz, spd;
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    // Warmup: burn off transient before recording.
    for (i = 0; i < 2000; i++) {
      dx = 10 * (y - x);
      dy = x * (28 - z) - y;
      dz = x * y - (8 / 3) * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
    }
    // First pass: record raw coords and track extents.
    for (i = 0; i < POINT_COUNT; i++) {
      dx = 10 * (y - x);
      dy = x * (28 - z) - y;
      dz = x * y - (8 / 3) * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
      spd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      positions[i * 4 + 3] = 2 + Math.min(spd * 0.04, 3);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    // Second pass: remap to [0,1] centered at 0.5 with radius 0.33.
    var cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5;
    var range = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    var scale = 0.66 / range;
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i * 4 + 0] = (positions[i * 4 + 0] - cx) * scale + 0.5;
      positions[i * 4 + 1] = (positions[i * 4 + 1] - cy) * scale + 0.5;
      positions[i * 4 + 2] = (positions[i * 4 + 2] - cz) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Aizawa attractor: a globe skewered by an axial spike with banded equatorial rings,
  //   dx = (z-0.7)x - 3.5y,  dy = 3.5x + (z-0.7)y,
  //   dz = 0.6 + 0.95z - z^3/3 - (x^2+y^2)(1+0.25z) + 0.1z*x^3.
  // Two-pass: integrate to record, then normalize to centered radius 0.33.
  function generateAizawa() {
    var dt = 0.01;
    var x = 0.1, y = 0.0, z = 0.0;
    var i, dx, dy, dz, spd;
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    for (i = 0; i < 2000; i++) {
      dx = (z - 0.7) * x - 3.5 * y;
      dy = 3.5 * x + (z - 0.7) * y;
      dz = 0.6 + 0.95 * z - z * z * z / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x;
      x += dx * dt; y += dy * dt; z += dz * dt;
    }
    for (i = 0; i < POINT_COUNT; i++) {
      dx = (z - 0.7) * x - 3.5 * y;
      dy = 3.5 * x + (z - 0.7) * y;
      dz = 0.6 + 0.95 * z - z * z * z / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x;
      x += dx * dt; y += dy * dt; z += dz * dt;
      spd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      positions[i * 4 + 3] = 2 + Math.min(spd * 2.0, 3);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    var cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5;
    var range = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    var scale = 0.66 / range;
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i * 4 + 0] = (positions[i * 4 + 0] - cx) * scale + 0.5;
      positions[i * 4 + 1] = (positions[i * 4 + 1] - cy) * scale + 0.5;
      positions[i * 4 + 2] = (positions[i * 4 + 2] - cz) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Rossler attractor: a flat spiral sheet that folds back up at one edge,
  //   dx = -y - z,  dy = x + 0.2y,  dz = 0.2 + z(x - 5.7).
  // dt=0.02 is fine here; the system is mildly expanding but well-bounded on the attractor.
  function generateRossler() {
    var dt = 0.02;
    var x = 0.1, y = 0.0, z = 0.0;
    var i, dx, dy, dz, spd;
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    for (i = 0; i < 2000; i++) {
      dx = -y - z;
      dy = x + 0.2 * y;
      dz = 0.2 + z * (x - 5.7);
      x += dx * dt; y += dy * dt; z += dz * dt;
    }
    for (i = 0; i < POINT_COUNT; i++) {
      dx = -y - z;
      dy = x + 0.2 * y;
      dz = 0.2 + z * (x - 5.7);
      x += dx * dt; y += dy * dt; z += dz * dt;
      spd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      positions[i * 4 + 3] = 2 + Math.min(spd * 0.15, 3);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    var cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5;
    var range = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    var scale = 0.66 / range;
    // Fixed-dt integration piles points up where the orbit is slow, which beads
    // the bright spiral. A touch of jitter dithers those dense bands into a glow.
    var ROSSLER_JIT = 0.004;
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i * 4 + 0] = (positions[i * 4 + 0] - cx) * scale + 0.5 + (Math.random() - 0.5) * ROSSLER_JIT;
      positions[i * 4 + 1] = (positions[i * 4 + 1] - cy) * scale + 0.5 + (Math.random() - 0.5) * ROSSLER_JIT;
      positions[i * 4 + 2] = (positions[i * 4 + 2] - cz) * scale + 0.5 + (Math.random() - 0.5) * ROSSLER_JIT;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Halvorsen attractor: one rule, identical on all three axes, each pulled by the
  // square of the next. Cyclically symmetric (rotate 120 deg -> maps onto itself);
  // spins a three-armed smoke-vortex.
  function generateHalvorsen() {
    var dt = 0.0042, a = 1.89, x = -1.48, y = -1.51, z = 2.04, i, dx, dy, dz, spd;
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (i = 0; i < 3000; i++) { dx = -a*x - 4*y - 4*z - y*y; dy = -a*y - 4*z - 4*x - z*z; dz = -a*z - 4*x - 4*y - x*x; x += dx*dt; y += dy*dt; z += dz*dt; }
    for (i = 0; i < POINT_COUNT; i++) {
      dx = -a*x - 4*y - 4*z - y*y; dy = -a*y - 4*z - 4*x - z*z; dz = -a*z - 4*x - 4*y - x*x;
      x += dx*dt; y += dy*dt; z += dz*dt;
      spd = Math.sqrt(dx*dx + dy*dy + dz*dz);
      positions[i*4] = x; positions[i*4+1] = y; positions[i*4+2] = z; positions[i*4+3] = 2 + Math.min(spd * 0.04, 3);
      if (x<xmin)xmin=x; if (x>xmax)xmax=x; if (y<ymin)ymin=y; if (y>ymax)ymax=y; if (z<zmin)zmin=z; if (z>zmax)zmax=z;
    }
    var cx = (xmin+xmax)*0.5, cy = (ymin+ymax)*0.5, cz = (zmin+zmax)*0.5, range = Math.max(xmax-xmin, ymax-ymin, zmax-zmin), scale = 0.62 / range, J = 0.003;
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i*4]   = (positions[i*4]   - cx) * scale + 0.5 + (Math.random()-0.5)*J;
      positions[i*4+1] = (positions[i*4+1] - cy) * scale + 0.5 + (Math.random()-0.5)*J;
      positions[i*4+2] = (positions[i*4+2] - cz) * scale + 0.5 + (Math.random()-0.5)*J;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Dadras attractor: a four-winged chaotic flow that folds back on itself, the
  // trajectory leaping between lobes with no warning, always tracing the same
  // butterfly-of-butterflies.
  function generateDadras() {
    var dt = 0.002, a = 3, b = 2.7, c = 1.7, d = 2, e = 9, x = 1.1, y = 2.1, z = -2.0, i, dx, dy, dz, spd;   // small dt: Euler is unstable on the quadratic terms at larger steps
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (i = 0; i < 6000; i++) { dx = y - a*x + b*y*z; dy = c*y - x*z + z; dz = d*x*y - e*z; x += dx*dt; y += dy*dt; z += dz*dt; }
    for (i = 0; i < POINT_COUNT; i++) {
      dx = y - a*x + b*y*z; dy = c*y - x*z + z; dz = d*x*y - e*z;
      x += dx*dt; y += dy*dt; z += dz*dt;
      spd = Math.sqrt(dx*dx + dy*dy + dz*dz);
      positions[i*4] = x; positions[i*4+1] = y; positions[i*4+2] = z; positions[i*4+3] = 2 + Math.min(spd * 0.05, 3);
      if (x<xmin)xmin=x; if (x>xmax)xmax=x; if (y<ymin)ymin=y; if (y>ymax)ymax=y; if (z<zmin)zmin=z; if (z>zmax)zmax=z;
    }
    var cx2 = (xmin+xmax)*0.5, cy2 = (ymin+ymax)*0.5, cz2 = (zmin+zmax)*0.5, range2 = Math.max(xmax-xmin, ymax-ymin, zmax-zmin), scale2 = 0.6 / range2, J2 = 0.003;
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i*4]   = (positions[i*4]   - cx2) * scale2 + 0.5 + (Math.random()-0.5)*J2;
      positions[i*4+1] = (positions[i*4+1] - cy2) * scale2 + 0.5 + (Math.random()-0.5)*J2;
      positions[i*4+2] = (positions[i*4+2] - cz2) * scale2 + 0.5 + (Math.random()-0.5)*J2;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Primes in 3D: plot integer lattice points (a, b, c) in [-N, N]^3 whose
  // squared distance a^2+b^2+c^2 is a prime number. N=103 yields ~977,540 points.
  // The Legendre three-square theorem creates exact spherical-shell voids: integers
  // of the form 4^a*(8b+7) can never be a sum of three squares, carving visibly
  // empty shells into the cloud. Each surviving point is pure number theory.
  // Color rides the shell radius so the layering reads as a depth gradient.
  function generatePrimes3D() {
    var N = 103;
    var maxR2 = 3 * N * N;
    // Sieve of Eratosthenes up to maxR2.
    var sieve = new Uint8Array(maxR2 + 1);
    var p, j;
    for (j = 2; j <= maxR2; j++) sieve[j] = 1;
    for (p = 2; p * p <= maxR2; p++) {
      if (sieve[p]) {
        for (j = p * p; j <= maxR2; j += p) sieve[j] = 0;
      }
    }
    var n = 0, inv2N = 1 / (2 * N), sqrtMax = Math.sqrt(maxR2);
    var a, b, c, r2;
    for (a = -N; a <= N && n < POINT_COUNT; a++) {
      for (b = -N; b <= N && n < POINT_COUNT; b++) {
        for (c = -N; c <= N && n < POINT_COUNT; c++) {
          r2 = a * a + b * b + c * c;
          if (r2 >= 2 && r2 <= maxR2 && sieve[r2]) {
            positions[n * 4 + 0] = (a + N) * inv2N;
            positions[n * 4 + 1] = (b + N) * inv2N;
            positions[n * 4 + 2] = (c + N) * inv2N;
            // Shell radius scaled to [1.5, 5.5] for rich color gradient.
            positions[n * 4 + 3] = 1.5 + (Math.sqrt(r2) / sqrtMax) * 4.0;
            n++;
          }
        }
      }
    }
    // Fill any shortfall by repeating earlier points.
    var s;
    for (var i = n; i < POINT_COUNT; i++) {
      s = (n > 0) ? (i % n) : 0;
      positions[i * 4 + 0] = positions[s * 4 + 0];
      positions[i * 4 + 1] = positions[s * 4 + 1];
      positions[i * 4 + 2] = positions[s * 4 + 2];
      positions[i * 4 + 3] = positions[s * 4 + 3];
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Gaussian primes: Gaussian integers a+bi whose norm a^2+b^2 is prime (for
  // a,b both nonzero) or whose nonzero part is a rational prime p with p%4===3
  // (for Gaussian integers on the axes). N=1650 yields ~990,492 real points.
  // The result is a 2D fractal tiling that looks like a four-fold symmetric galaxy
  // with conspicuous voids and spiraling arms. Displayed as a thin 3D sheet with
  // a small z-jitter that lets the engine fly through it at an angle.
  function generateGaussianPrimes() {
    var N = 1650;
    var maxP = 2 * N * N + 1;
    // Sieve.
    var sieve = new Uint8Array(maxP + 1);
    var p, j;
    for (j = 2; j <= maxP; j++) sieve[j] = 1;
    for (p = 2; p * p <= maxP; p++) {
      if (sieve[p]) {
        for (j = p * p; j <= maxP; j += p) sieve[j] = 0;
      }
    }
    var n = 0, inv2N = 1 / (2 * N), halfN = N;
    var a, b, n2, v, isGP, r;
    for (a = -halfN; a <= halfN && n < POINT_COUNT; a++) {
      for (b = -halfN; b <= halfN && n < POINT_COUNT; b++) {
        n2 = a * a + b * b;
        if (n2 === 0) continue;
        isGP = false;
        if (a !== 0 && b !== 0) {
          isGP = (n2 <= maxP && sieve[n2] === 1);
        } else {
          v = Math.abs(a !== 0 ? a : b);
          isGP = (v >= 2 && v <= maxP && sieve[v] === 1 && (v % 4 === 3));
        }
        if (isGP) {
          // Small z-jitter so the sheet has gentle depth when flown through.
          r = Math.sqrt(n2) / (halfN * Math.SQRT2);
          positions[n * 4 + 0] = (a + halfN) * inv2N;
          positions[n * 4 + 1] = (b + halfN) * inv2N;
          positions[n * 4 + 2] = 0.5 + (((a * 1327 + b * 937) & 0xff) / 255 - 0.5) * 0.04;
          // Color by distance from origin: inner glow cyan, outer arms red.
          positions[n * 4 + 3] = 1.5 + r * 4.0;
          n++;
        }
      }
    }
    // Fill any shortfall by repeating earlier points.
    var s;
    for (var i = n; i < POINT_COUNT; i++) {
      s = (n > 0) ? (i % n) : 0;
      positions[i * 4 + 0] = positions[s * 4 + 0];
      positions[i * 4 + 1] = positions[s * 4 + 1];
      positions[i * 4 + 2] = positions[s * 4 + 2];
      positions[i * 4 + 3] = positions[s * 4 + 3];
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // ====== IFS FRACTALS (chaos game) ======
  // All four use the same pattern: warmup, iterate picking a random affine map,
  // record the point + which map produced it (for color), then remap the whole
  // cloud to sit centered at (0.5,0.5,0.5) within radius ~0.4 so the engine's
  // periodic tiling picks it up cleanly.

  // Sierpinski tetrahedron: 4 maps, each p -> 0.5*(p + V_i) for the four
  // vertices of a regular tetrahedron. Drop a point anywhere, keep jumping
  // halfway toward a random corner, and a perfect self-similar tetrahedron
  // crystallises out of pure chance. Zoom in: another tetrahedron. Zoom in
  // again: another. The recursion goes down forever.
  function generateSierpinski() {
    // Regular tetrahedron vertices in a unit cube.
    var V = [
      [0.0, 0.0, 0.0],
      [1.0, 0.0, 0.0],
      [0.5, Math.sqrt(3) / 2, 0.0],
      [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3]
    ];
    // w values spread over [1.5, 5.5] for the 4 maps (pale -> red).
    var wmap = [1.5, 2.5, 3.8, 5.5];
    var px = 0.5, py = 0.5, pz = 0.5;
    // Warmup.
    for (var w = 0; w < 20; w++) {
      var mi = (Math.random() * 4) | 0;
      px = 0.5 * (px + V[mi][0]);
      py = 0.5 * (py + V[mi][1]);
      pz = 0.5 * (pz + V[mi][2]);
    }
    // Track min/max for remapping.
    var xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9;
    for (var i = 0; i < POINT_COUNT; i++) {
      var m = (Math.random() * 4) | 0;
      px = 0.5 * (px + V[m][0]);
      py = 0.5 * (py + V[m][1]);
      pz = 0.5 * (pz + V[m][2]);
      if (!isFinite(px)) px = 0.5;
      if (!isFinite(py)) py = 0.5;
      if (!isFinite(pz)) pz = 0.5;
      positions[i * 4 + 0] = px;
      positions[i * 4 + 1] = py;
      positions[i * 4 + 2] = pz;
      positions[i * 4 + 3] = wmap[m];
      if (px < xmin) xmin = px; if (px > xmax) xmax = px;
      if (py < ymin) ymin = py; if (py > ymax) ymax = py;
      if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz;
    }
    // Remap: center at (0.5,0.5,0.5), uniform scale to radius ~0.4.
    var span = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    if (span < 1e-9) span = 1.0;
    var scale = 0.52 / span;   // smaller so more of the tetrahedron reads at once (was 0.8)
    var cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5;
    for (var j = 0; j < POINT_COUNT; j++) {
      positions[j * 4 + 0] = (positions[j * 4 + 0] - cx) * scale + 0.5;
      positions[j * 4 + 1] = (positions[j * 4 + 1] - cy) * scale + 0.5;
      positions[j * 4 + 2] = (positions[j * 4 + 2] - cz) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // Jerusalem cube: a two-scale IFS. The unit cube is cut by a cross of slots
  // into 8 corner cubes (side r = 1/(1+sqrt2)) and 12 edge cubes (side r^2),
  // leaving the central cross and the 6 face crosses hollow. Recursing forever
  // breeds doorways within doorways at silver-ratio proportions. The chaos game
  // runs over the 20 contraction maps; colour rides which map fired (the coarse
  // corner maps cool/pale, the finer edge maps warm), so the two nested scales
  // read as two colour families woven together.
  function generateJerusalem() {
    var r  = 1 / (1 + Math.SQRT2);   // ~0.41421 (silver ratio): corner-cube side
    var r2 = r * r;                  // ~0.17157: edge-cube side
    var M = [], cc = [0, 1 - r], ci, cj, ck;
    for (ci = 0; ci < 2; ci++) for (cj = 0; cj < 2; cj++) for (ck = 0; ck < 2; ck++)
      M.push({ s: r, ox: cc[ci], oy: cc[cj], oz: cc[ck] });   // 8 corner cubes
    var midE = (1 - r2) * 0.5, endE = [0, 1 - r2], ax, e1, e2;
    for (ax = 0; ax < 3; ax++) for (e1 = 0; e1 < 2; e1++) for (e2 = 0; e2 < 2; e2++) {
      if (ax === 0)      M.push({ s: r2, ox: midE,     oy: endE[e1], oz: endE[e2] });
      else if (ax === 1) M.push({ s: r2, ox: endE[e1], oy: midE,     oz: endE[e2] });
      else               M.push({ s: r2, ox: endE[e1], oy: endE[e2], oz: midE });   // 12 edge cubes
    }
    var MN = M.length, wmap = [], wi;
    for (wi = 0; wi < MN; wi++) wmap.push(wi < 8 ? (1.6 + (wi / 7) * 1.4) : (3.4 + ((wi - 8) / 11) * 2.1));
    var px = 0.5, py = 0.5, pz = 0.5, w, m;
    for (w = 0; w < 25; w++) { m = (Math.random() * MN) | 0; px = M[m].s * px + M[m].ox; py = M[m].s * py + M[m].oy; pz = M[m].s * pz + M[m].oz; }
    var xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9, i;
    for (i = 0; i < POINT_COUNT; i++) {
      m = (Math.random() * MN) | 0;
      px = M[m].s * px + M[m].ox; py = M[m].s * py + M[m].oy; pz = M[m].s * pz + M[m].oz;
      if (!isFinite(px)) px = 0.5; if (!isFinite(py)) py = 0.5; if (!isFinite(pz)) pz = 0.5;
      positions[i*4] = px; positions[i*4+1] = py; positions[i*4+2] = pz; positions[i*4+3] = wmap[m];
      if (px < xmin) xmin = px; if (px > xmax) xmax = px;
      if (py < ymin) ymin = py; if (py > ymax) ymax = py;
      if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz;
    }
    var span = Math.max(xmax - xmin, ymax - ymin, zmax - zmin); if (span < 1e-9) span = 1.0;
    var scale = 0.66 / span, cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5, j;
    for (j = 0; j < POINT_COUNT; j++) {
      positions[j*4]   = (positions[j*4]   - cx) * scale + 0.5;
      positions[j*4+1] = (positions[j*4+1] - cy) * scale + 0.5;
      positions[j*4+2] = (positions[j*4+2] - cz) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // 3D Vicsek (plus/cross) fractal: 7 maps p -> p/3 + T_i/3 over the kept cells
  // of the 3x3x3 grid (a cell is kept iff at least TWO of its coords equal 1):
  // the body centre + the 6 face centres. The result is a 3D plus-sign whose
  // every arm sprouts a smaller plus at its tip, forever - a spiky crystalline
  // jack of axes. The core map glows warm; the six arms fan through cooler hues.
  function generateVicsek() {
    var T = [], a, b, c;
    for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) for (c = 0; c < 3; c++) {
      var centers = (a === 1 ? 1 : 0) + (b === 1 ? 1 : 0) + (c === 1 ? 1 : 0);
      if (centers >= 2) T.push([a, b, c]);
    }
    var TN = T.length, wmap = [], wi;
    for (wi = 0; wi < TN; wi++) {
      var isCore = (T[wi][0] === 1 && T[wi][1] === 1 && T[wi][2] === 1);
      wmap.push(isCore ? 5.4 : (1.6 + (wi / (TN - 1)) * 3.0));
    }
    var px = 0.5, py = 0.5, pz = 0.5, w, m;
    for (w = 0; w < 25; w++) { m = (Math.random() * TN) | 0; px = px/3 + T[m][0]/3; py = py/3 + T[m][1]/3; pz = pz/3 + T[m][2]/3; }
    var xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9, i;
    for (i = 0; i < POINT_COUNT; i++) {
      m = (Math.random() * TN) | 0;
      px = px/3 + T[m][0]/3; py = py/3 + T[m][1]/3; pz = pz/3 + T[m][2]/3;
      if (!isFinite(px)) px = 0.5; if (!isFinite(py)) py = 0.5; if (!isFinite(pz)) pz = 0.5;
      positions[i*4] = px; positions[i*4+1] = py; positions[i*4+2] = pz; positions[i*4+3] = wmap[m];
      if (px < xmin) xmin = px; if (px > xmax) xmax = px;
      if (py < ymin) ymin = py; if (py > ymax) ymax = py;
      if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz;
    }
    var span = Math.max(xmax - xmin, ymax - ymin, zmax - zmin); if (span < 1e-9) span = 1.0;
    var scale = 0.70 / span, cx = (xmin + xmax) * 0.5, cy = (ymin + ymax) * 0.5, cz = (zmin + zmax) * 0.5, j;
    for (j = 0; j < POINT_COUNT; j++) {
      positions[j*4]   = (positions[j*4]   - cx) * scale + 0.5;
      positions[j*4+1] = (positions[j*4+1] - cy) * scale + 0.5;
      positions[j*4+2] = (positions[j*4+2] - cz) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // (Cantor dust retired — it read as undifferentiated grains; removed from the menu.)

  // ====== END IFS FRACTALS ======

  // Collatz hailstone tree: every integer from 1 to N_MAX has a unique
  // successor under the Collatz map (even n -> n/2, odd n -> 3n+1), so
  // they form a single rooted tree draining into 1. We lay the tree out in
  // 3D by walking a BFS from the root and fanning each parent's children
  // into a cone whose opening angle grows with depth, left-biasing odd-step
  // children (triple-plus-one) and right-biasing even-step children (halving).
  // Edges near the root are shared by many paths, so they receive more points
  // and glow brighter, forming a dense glowing trunk. Color rides orbit depth:
  // shallow near-root edges are gold/red; long outlier branches fade to pale cyan.
  function generateCollatz() {
    var N_MAX = 60000;          // numbers whose paths we trace
    var STEP_BASE = 1.8;        // base edge length (raw coords, normalized later)

    // Pass 1: compute Collatz successor and orbit depth for n in [1, N_MAX].
    // succ[n] = Collatz(n) = n/2 (even) or 3n+1 (odd).
    // depth[n] = steps to reach 1 (depth[1] = 0).
    var succ  = new Uint32Array(N_MAX + 1);
    var depth = new Int32Array(N_MAX + 1);
    var n, s, i;
    for (n = 2; n <= N_MAX; n++) {
      succ[n] = (n & 1) ? (3 * n + 1) : (n >>> 1);
    }
    // Iterative depth computation with a scratch map for out-of-range nodes.
    // A Map (not a plain {}) - the out-of-range Collatz peaks reach the millions,
    // and a million large integer keys drops a plain object into slow dictionary
    // mode (the multi-second load hitch); Map stays fast.
    var scratch = new Map();
    var stk = [];
    for (n = 2; n <= N_MAX; n++) {
      if (depth[n] !== 0) continue;
      stk.length = 0;
      var cur = n;
      while (cur !== 1) {
        var already;
        if (cur <= N_MAX) { already = (cur < n) ? true : (depth[cur] !== 0); }
        else              { already = scratch.has(cur); }
        if (already) break;
        stk.push(cur);
        cur = (cur & 1) ? (3 * cur + 1) : (cur >>> 1);
      }
      var baseDep;
      if (cur === 1)          baseDep = 0;
      else if (cur <= N_MAX)  baseDep = depth[cur];
      else                    baseDep = scratch.get(cur) | 0;
      for (var si = stk.length - 1; si >= 0; si--) {
        baseDep++;
        var sv = stk[si];
        if (sv <= N_MAX) depth[sv] = baseDep;
        else             scratch.set(sv, baseDep);
      }
    }

    // Pass 2: build children lists (inverse of succ, restricted to [1, N_MAX]).
    var childHead = new Int32Array(N_MAX + 1);
    var childNext = new Int32Array(N_MAX + 1);
    for (i = 0; i <= N_MAX; i++) { childHead[i] = -1; childNext[i] = -1; }
    for (n = 2; n <= N_MAX; n++) {
      s = succ[n];
      if (s >= 1 && s <= N_MAX) {
        childNext[n] = childHead[s];
        childHead[s] = n;
      }
    }

    // Pass 3: BFS from root to assign 3D positions.
    // Each parent fans its children into a cone. The cone half-angle widens with
    // depth so deep branches spread naturally (like coral). Even-halving edges
    // get a tighter bend; odd-tripling edges fan wider.
    var nodeX  = new Float64Array(N_MAX + 1);
    var nodeY  = new Float64Array(N_MAX + 1);
    var nodeZ  = new Float64Array(N_MAX + 1);
    var nodeDX = new Float64Array(N_MAX + 1);
    var nodeDY = new Float64Array(N_MAX + 1);
    var nodeDZ = new Float64Array(N_MAX + 1);
    // Root at origin, heading straight up.
    nodeX[1] = 0; nodeY[1] = 0; nodeZ[1] = 0;
    nodeDX[1] = 0; nodeDY[1] = 1; nodeDZ[1] = 0;

    var bfsQueue = new Int32Array(N_MAX + 1);
    var bfsHead = 0, bfsTail = 0;
    bfsQueue[bfsTail++] = 1;
    while (bfsHead < bfsTail) {
      var par = bfsQueue[bfsHead++];
      var cArr = [];
      var ch = childHead[par];
      while (ch !== -1) { cArr.push(ch); ch = childNext[ch]; }
      var nCh = cArr.length;
      if (nCh === 0) continue;

      // Build orthonormal frame from parent heading.
      var fwx = nodeDX[par], fwy = nodeDY[par], fwz = nodeDZ[par];
      var flen = Math.sqrt(fwx*fwx + fwy*fwy + fwz*fwz);
      if (flen < 1e-9) { fwx = 0; fwy = 1; fwz = 0; }
      else             { fwx /= flen; fwy /= flen; fwz /= flen; }
      // Right vector: cross(forward, ref).
      var rightx, righty, rightz;
      if (Math.abs(fwy) < 0.9) {
        rightx = -fwy; righty = fwx; rightz = 0;
      } else {
        rightx = 0; righty = fwz; rightz = -fwy;
      }
      var rlen = Math.sqrt(rightx*rightx + righty*righty + rightz*rightz);
      if (rlen < 1e-9) { rightx = 1; righty = 0; rightz = 0; }
      else             { rightx /= rlen; righty /= rlen; rightz /= rlen; }
      // Up vector: cross(right, forward).
      var upx = righty*fwz - rightz*fwy;
      var upy = rightz*fwx - rightx*fwz;
      var upz = rightx*fwy - righty*fwx;

      // Cone half-angle widens gently with depth.
      var dpar = depth[par];
      var coneBase = 0.50 + Math.min(dpar * 0.004, 0.40);
      for (var ci = 0; ci < nCh; ci++) {
        var child = cArr[ci];
        var az = (nCh > 1) ? (ci / nCh) * 2 * Math.PI : 0;
        // Even-halving edges bend more gently; odd-tripling edges fan wider.
        var isEven = (child & 1) === 0 && (child >>> 1) === par;
        var cone = coneBase * (isEven ? 0.75 : 1.25);
        var cosC = Math.cos(cone), sinC = Math.sin(cone);
        var cosAz = Math.cos(az), sinAz = Math.sin(az);
        var cdx = fwx * cosC + (rightx * cosAz + upx * sinAz) * sinC;
        var cdy = fwy * cosC + (righty * cosAz + upy * sinAz) * sinC;
        var cdz = fwz * cosC + (rightz * cosAz + upz * sinAz) * sinC;
        var cdlen = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
        if (cdlen < 1e-9) { cdx = fwx; cdy = fwy; cdz = fwz; }
        else              { cdx /= cdlen; cdy /= cdlen; cdz /= cdlen; }
        // Edge length shrinks with depth so deep branches stay within the sphere.
        var stepLen = STEP_BASE * Math.pow(0.84, Math.min(dpar, 30));
        nodeX[child] = nodeX[par] + cdx * stepLen;
        nodeY[child] = nodeY[par] + cdy * stepLen;
        nodeZ[child] = nodeZ[par] + cdz * stepLen;
        nodeDX[child] = cdx; nodeDY[child] = cdy; nodeDZ[child] = cdz;
        bfsQueue[bfsTail++] = child;
      }
    }

    // Pass 4: subtree sizes weight how many points each edge gets.
    // An edge shared by many paths (near the root) is dense and bright.
    var subtreeSize = new Uint32Array(N_MAX + 1);
    for (i = 0; i <= N_MAX; i++) subtreeSize[i] = 1;
    for (var bi = bfsTail - 1; bi >= 0; bi--) {
      var bn = bfsQueue[bi];
      s = succ[bn];
      if (bn > 1 && s >= 1 && s <= N_MAX) subtreeSize[s] += subtreeSize[bn];
    }
    // Point budget per edge is weighted by SQRT(subtreeSize), not subtreeSize:
    // the linear weight piled most of the points onto the few near-root trunk
    // edges - a wall of overlapping additive sprites that tanked the fps (and the
    // camera spawns right inside it). The sqrt keeps the trunk densest but spreads
    // far more points out to the branches: cheaper to draw, more of the tree reads.
    var totalWeight = 0;
    for (n = 2; n <= N_MAX; n++) {
      s = succ[n];
      if (s >= 1 && s <= N_MAX) totalWeight += Math.sqrt(subtreeSize[n]);
    }
    if (totalWeight < 1) totalWeight = 1;

    // Pass 5: scatter points along edges, proportional to subtreeSize.
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    var ptCount = 0;
    var maxDepth2 = 0;
    for (n = 1; n <= N_MAX; n++) { if (depth[n] > maxDepth2) maxDepth2 = depth[n]; }
    if (maxDepth2 < 1) maxDepth2 = 1;
    // Deterministic RNG -- same coral on every load.
    var rngState = 0xC011A123 | 0;
    function prng() {
      rngState ^= rngState << 13;
      rngState ^= rngState >>> 17;
      rngState ^= rngState << 5;
      return ((rngState >>> 0) / 4294967296);
    }
    for (n = 2; n <= N_MAX; n++) {
      s = succ[n];
      if (s < 1 || s > N_MAX) continue;
      var edgeW = Math.sqrt(subtreeSize[n]);
      var nPts = Math.round((edgeW / totalWeight) * POINT_COUNT);
      if (nPts < 1) nPts = 1;
      var ex0 = nodeX[n], ey0 = nodeY[n], ez0 = nodeZ[n];
      var ex1 = nodeX[s], ey1 = nodeY[s], ez1 = nodeZ[s];
      // Color: near-root trunk = gold/red (w up to 5.5), deep branches = pale cyan (w ~1.8).
      var dNorm = Math.min(depth[n] / maxDepth2, 1.0);
      var wCol = Math.max(1.5, Math.min(5.5, 1.8 + (1.0 - dNorm) * (1.0 - dNorm) * 3.7));
      for (var pi2 = 0; pi2 < nPts && ptCount < POINT_COUNT; pi2++, ptCount++) {
        var tt = prng();
        var px = ex0 + (ex1 - ex0) * tt;
        var py = ey0 + (ey1 - ey0) * tt;
        var pz = ez0 + (ez1 - ez0) * tt;
        positions[ptCount*4+0] = px;
        positions[ptCount*4+1] = py;
        positions[ptCount*4+2] = pz;
        positions[ptCount*4+3] = wCol;
        if (px < xmin) xmin = px; if (px > xmax) xmax = px;
        if (py < ymin) ymin = py; if (py > ymax) ymax = py;
        if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz;
      }
    }
    // Fill shortfall by cycling earlier points.
    var fillN = Math.max(ptCount, 1);
    for (i = ptCount; i < POINT_COUNT; i++) {
      var src2 = i % fillN;
      positions[i*4+0] = positions[src2*4+0];
      positions[i*4+1] = positions[src2*4+1];
      positions[i*4+2] = positions[src2*4+2];
      positions[i*4+3] = positions[src2*4+3];
    }

    // Normalize to radius ~0.39. Center on the CENTROID (the dense near-root
    // trunk holds most points), not the bbox center, which for a fanning tree
    // lands in an outlying void. The flight camera spawns at the cube center,
    // so this drops it inside the structure instead of staring at nothing.
    if (!isFinite(xmin) || !isFinite(xmax)) { xmin = 0; xmax = 1; }
    if (!isFinite(ymin) || !isFinite(ymax)) { ymin = 0; ymax = 1; }
    if (!isFinite(zmin) || !isFinite(zmax)) { zmin = 0; zmax = 1; }
    var maxSpan = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    if (maxSpan < 1e-9) maxSpan = 1.0;
    var normScale = 0.78 / maxSpan;
    var ncx = 0, ncy = 0, ncz = 0, ncc = 0;
    for (i = 0; i < ptCount; i++) {
      var qx = positions[i*4+0], qy = positions[i*4+1], qz = positions[i*4+2];
      if (isFinite(qx) && isFinite(qy) && isFinite(qz)) { ncx += qx; ncy += qy; ncz += qz; ncc++; }
    }
    if (ncc > 0) { ncx /= ncc; ncy /= ncc; ncz /= ncc; }
    else { ncx = (xmin + xmax) * 0.5; ncy = (ymin + ymax) * 0.5; ncz = (zmin + zmax) * 0.5; }
    for (i = 0; i < POINT_COUNT; i++) {
      var rx = positions[i*4+0], ry = positions[i*4+1], rz = positions[i*4+2];
      if (!isFinite(rx)) rx = 0.5;
      if (!isFinite(ry)) ry = 0.5;
      if (!isFinite(rz)) rz = 0.5;
      positions[i*4+0] = (rx - ncx) * normScale + 0.5;
      positions[i*4+1] = (ry - ncy) * normScale + 0.5;
      positions[i*4+2] = (rz - ncz) * normScale + 0.5;
      if (!isFinite(positions[i*4+3])) positions[i*4+3] = 2.0;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }







  // ===== generatePi (scene "pi") =====
  function generatePi() {
    // Compute pi in base 10 using Machin's formula:
    //   pi/4 = 4*arctan(1/5) - arctan(1/239)    (Machin, 1706)
    // We use big-integer base-B arithmetic stored in Uint32Arrays (big-endian).
    // Each arctan is computed as an alternating series with a shared "numer"
    // array that tracks B^LIMBS / x^(2k+1); each term = numer / (2k+1).
    // This avoids the mul-before-divide recurrence and gives exact truncation.
    // TARGET_DIGITS = 5000 runs in roughly 1-2s in JS (benchmarked).
    var TARGET_DIGITS = 5000;
    var LIMBS = Math.ceil(TARGET_DIGITS / 4) + 10;   // +10 guard limbs
    var B = 10000;                                    // base per limb (4 decimal digits each)

    // Compute arctan(1/x) * B^LIMBS, big-endian base-B Uint32Array.
    // numer tracks B^LIMBS / x^(2k+1); divided by x^2 each iteration.
    // term_k = floor(numer / (2k+1)).
    function atanRecip(x) {
      var acc   = new Uint32Array(LIMBS);
      var numer = new Uint32Array(LIMBS);
      var term  = new Uint32Array(LIMBS);
      var i, k, q, rem, t;

      // Initialize numer = B^LIMBS / x. The "1" is the implicit leading digit
      // (B^LIMBS = 1 followed by LIMBS zero limbs); rem starts at 1.
      rem = 1;
      for (i = 0; i < LIMBS; i++) {
        t = rem * B;                       // note: numer[i] starts 0, no add needed
        q = Math.floor(t / x);
        numer[i] = q;
        rem = t - q * x;
      }
      // term_0 = numer (denominator 1), acc = term_0.
      for (i = 0; i < LIMBS; i++) { term[i] = numer[i]; acc[i] = numer[i]; }

      // Subsequent terms: numer /= x^2, then term = numer / (2k+1).
      for (k = 1; ; k++) {
        // Divide numer by x (twice).
        rem = 0;
        for (i = 0; i < LIMBS; i++) {
          t = rem * B + numer[i];
          q = Math.floor(t / x);
          numer[i] = q;
          rem = t - q * x;
        }
        rem = 0;
        for (i = 0; i < LIMBS; i++) {
          t = rem * B + numer[i];
          q = Math.floor(t / x);
          numer[i] = q;
          rem = t - q * x;
        }
        // term_k = numer / (2k+1).
        var denom = 2 * k + 1;
        rem = 0;
        for (i = 0; i < LIMBS; i++) {
          t = rem * B + numer[i];
          q = Math.floor(t / denom);
          term[i] = q;
          rem = t - q * denom;
        }
        // Stop when term is entirely zero (series has converged to full precision).
        var allZero = true;
        for (i = 0; i < LIMBS; i++) {
          if (term[i] !== 0) { allZero = false; break; }
        }
        if (allZero) break;
        // k odd: subtract term; k even: add term.
        if (k % 2 === 1) {
          var carry1 = 0;
          for (i = LIMBS - 1; i >= 0; i--) {
            var s1 = acc[i] - term[i] + carry1;
            if (s1 < 0) { s1 += B; carry1 = -1; } else { carry1 = 0; }
            acc[i] = s1;
          }
        } else {
          var carry2 = 0;
          for (i = LIMBS - 1; i >= 0; i--) {
            var s2 = acc[i] + term[i] + carry2;
            carry2 = Math.floor(s2 / B);
            acc[i] = s2 - carry2 * B;
          }
        }
      }
      return acc;
    }

    // pi/4 = 4*arctan(1/5) - arctan(1/239); multiply result by 4 to get pi.
    var a5   = atanRecip(5);
    var a239 = atanRecip(239);
    var pi4  = new Uint32Array(LIMBS);
    var ci, cq, ccarry;

    // 4 * a5 into pi4.
    for (ci = 0; ci < LIMBS; ci++) pi4[ci] = a5[ci];
    ccarry = 0;
    for (ci = LIMBS - 1; ci >= 0; ci--) {
      cq = pi4[ci] * 4 + ccarry;
      ccarry = Math.floor(cq / B);
      pi4[ci] = cq - ccarry * B;
    }

    // Subtract a239 to get pi/4.
    ccarry = 0;
    for (ci = LIMBS - 1; ci >= 0; ci--) {
      cq = pi4[ci] - a239[ci] + ccarry;
      if (cq < 0) { cq += B; ccarry = -1; } else { ccarry = 0; }
      pi4[ci] = cq;
    }

    // Multiply by 4 to get pi. The integer part (3) overflows into ccarry.
    ccarry = 0;
    for (ci = LIMBS - 1; ci >= 0; ci--) {
      cq = pi4[ci] * 4 + ccarry;
      ccarry = Math.floor(cq / B);
      pi4[ci] = cq - ccarry * B;
    }
    // ccarry now holds the integer part of pi (= 3).

    // Extract base-10 digits from the base-10000 fractional limbs.
    // The integer part (ccarry = 3) is prepended separately so digit 0 = '3',
    // digit 1 = first fractional digit ('1'), etc. -- matching 3.14159...
    var digits = [ccarry];   // prepend the integer part
    for (ci = 0; ci < LIMBS; ci++) {
      var limb = pi4[ci];
      digits.push(Math.floor(limb / 1000) % 10);
      digits.push(Math.floor(limb / 100)  % 10);
      digits.push(Math.floor(limb / 10)   % 10);
      digits.push(limb % 10);
    }
    // Keep only TARGET_DIGITS digits (the prepended integer digit is digit 0).
    if (digits.length > TARGET_DIGITS) digits.length = TARGET_DIGITS;

    var numDigits = digits.length;   // 5,000 real pi digits

    // Ten fixed directions spread over a sphere via the golden-angle spiral,
    // one direction per decimal digit 0-9. The same digit always steps in the
    // same direction; the walk is entirely determined by pi's decimal expansion.
    var DIRS = [];
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    var nd;
    for (nd = 0; nd < 10; nd++) {
      var phi2   = Math.acos(1 - 2 * (nd + 0.5) / 10);
      var theta2 = goldenAngle * nd;
      DIRS.push([
        Math.sin(phi2) * Math.cos(theta2),
        Math.sin(phi2) * Math.sin(theta2),
        Math.cos(phi2)
      ]);
    }

    // Accumulate the 3D walk: one waypoint per digit.
    var STEP = 0.5;
    var wx = 0, wy = 0, wz = 0;
    var wpX = new Float32Array(numDigits);
    var wpY = new Float32Array(numDigits);
    var wpZ = new Float32Array(numDigits);
    var di;
    for (di = 0; di < numDigits; di++) {
      var d = digits[di];
      var dir = DIRS[d];
      wx += dir[0] * STEP;
      wy += dir[1] * STEP;
      wz += dir[2] * STEP;
      wpX[di] = wx;
      wpY[di] = wy;
      wpZ[di] = wz;
    }

    // First pass: compute extents for normalization.
    var xmin3 = Infinity, xmax3 = -Infinity;
    var ymin3 = Infinity, ymax3 = -Infinity;
    var zmin3 = Infinity, zmax3 = -Infinity;
    for (di = 0; di < numDigits; di++) {
      if (wpX[di] < xmin3) xmin3 = wpX[di]; if (wpX[di] > xmax3) xmax3 = wpX[di];
      if (wpY[di] < ymin3) ymin3 = wpY[di]; if (wpY[di] > ymax3) ymax3 = wpY[di];
      if (wpZ[di] < zmin3) zmin3 = wpZ[di]; if (wpZ[di] > zmax3) zmax3 = wpZ[di];
    }
    // Center on the walk's centroid (the road's mass), not the bbox center,
    // so the flight camera spawns on the road instead of in empty space.
    var cx3 = 0, cy3 = 0, cz3 = 0, cN3 = 0;
    for (di = 0; di < numDigits; di++) {
      if (isFinite(wpX[di]) && isFinite(wpY[di]) && isFinite(wpZ[di])) { cx3 += wpX[di]; cy3 += wpY[di]; cz3 += wpZ[di]; cN3++; }
    }
    if (cN3 > 0) { cx3 /= cN3; cy3 /= cN3; cz3 /= cN3; }
    else { cx3 = (xmin3 + xmax3) * 0.5; cy3 = (ymin3 + ymax3) * 0.5; cz3 = (zmin3 + zmax3) * 0.5; }
    var span3 = Math.max(xmax3 - xmin3, ymax3 - ymin3, zmax3 - zmin3);
    if (!isFinite(span3) || span3 < 1e-9) span3 = 1.0;
    var sc3 = 0.76 / span3;   // fit within radius ~0.38 around center 0.5

    // Second pass: fill the positions buffer by interpolating each segment.
    // Distribute POINT_COUNT slots evenly across the (numDigits-1) segments.
    var numSegs    = numDigits - 1;
    var ptsPerSeg  = POINT_COUNT / numSegs;
    var n3 = 0;
    var seg3, pi3, t3, ax3, ay3, az3, bx3, by3, bz3, segPts3, frac3;
    for (seg3 = 0; seg3 < numSegs && n3 < POINT_COUNT; seg3++) {
      var startPt3 = Math.round(seg3 * ptsPerSeg);
      var endPt3   = Math.round((seg3 + 1) * ptsPerSeg);
      if (endPt3 > POINT_COUNT) endPt3 = POINT_COUNT;
      segPts3 = endPt3 - startPt3;
      if (segPts3 <= 0) continue;

      ax3 = (wpX[seg3]     - cx3) * sc3 + 0.5;
      ay3 = (wpY[seg3]     - cy3) * sc3 + 0.5;
      az3 = (wpZ[seg3]     - cz3) * sc3 + 0.5;
      bx3 = (wpX[seg3 + 1] - cx3) * sc3 + 0.5;
      by3 = (wpY[seg3 + 1] - cy3) * sc3 + 0.5;
      bz3 = (wpZ[seg3 + 1] - cz3) * sc3 + 0.5;

      // Progress [0,1] along the full walk drives the color gradient.
      // Early digits are cool cyan (w 1.5), late digits are hot red (w 5.0).
      frac3     = seg3 / numSegs;
      var wCol3 = 1.5 + frac3 * 3.5;

      for (pi3 = 0; pi3 < segPts3 && n3 < POINT_COUNT; pi3++) {
        t3 = segPts3 > 1 ? pi3 / (segPts3 - 1) : 0.0;
        positions[n3 * 4 + 0] = ax3 + t3 * (bx3 - ax3);
        positions[n3 * 4 + 1] = ay3 + t3 * (by3 - ay3);
        positions[n3 * 4 + 2] = az3 + t3 * (bz3 - az3);
        positions[n3 * 4 + 3] = wCol3;
        n3++;
      }
    }
    // Fill any shortfall by cycling the walk from the beginning.
    var fill3;
    for (fill3 = n3; fill3 < POINT_COUNT; fill3++) {
      var src3 = fill3 % Math.max(1, n3);
      positions[fill3 * 4 + 0] = positions[src3 * 4 + 0];
      positions[fill3 * 4 + 1] = positions[src3 * 4 + 1];
      positions[fill3 * 4 + 2] = positions[src3 * 4 + 2];
      positions[fill3 * 4 + 3] = positions[src3 * 4 + 3];
    }

    // Hard clamp: guard any NaN / Inf that crept through.
    var ci3;
    for (ci3 = 0; ci3 < POINT_COUNT; ci3++) {
      if (!isFinite(positions[ci3 * 4 + 0])) positions[ci3 * 4 + 0] = 0.5;
      if (!isFinite(positions[ci3 * 4 + 1])) positions[ci3 * 4 + 1] = 0.5;
      if (!isFinite(positions[ci3 * 4 + 2])) positions[ci3 * 4 + 2] = 0.5;
      if (!isFinite(positions[ci3 * 4 + 3])) positions[ci3 * 4 + 3] = 2.0;
    }

    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // ===== generatePolytope (scene "polytope") =====
  function generatePolytope() {
    var i;
    var phi = (1 + Math.sqrt(5)) * 0.5;   // golden ratio, ~1.618
    var invPhi = 1 / phi;                  // ~0.618

    // ----- Build all 120 vertices of the 600-cell on the unit 3-sphere. -----
    // Three symmetry families:
    //   A: 8 permutations of (+/-1, 0, 0, 0)                              -- 8 vertices
    //   B: 16 choices of (+/-1/2, +/-1/2, +/-1/2, +/-1/2)                -- 16 vertices
    //   C: even permutations of (+/-phi/2, +/-1/2, +/-invPhi/2, 0)        -- 96 vertices
    // Total: 8 + 16 + 96 = 120. All lie on the unit 3-sphere (norm = 1).

    var verts = [];   // each element: [x, y, z, w4] in 4D
    var ai, si, b0, b1, b2, b3, va;

    // Family A: permutations of (+/-1, 0, 0, 0).
    for (ai = 0; ai < 4; ai++) {
      for (si = 0; si < 2; si++) {
        va = [0, 0, 0, 0];
        va[ai] = (si === 0) ? 1 : -1;
        verts.push(va);
      }
    }

    // Family B: all (+/-1/2, +/-1/2, +/-1/2, +/-1/2).
    var h = 0.5;
    for (b0 = 0; b0 < 2; b0++) {
      for (b1 = 0; b1 < 2; b1++) {
        for (b2 = 0; b2 < 2; b2++) {
          for (b3 = 0; b3 < 2; b3++) {
            verts.push([
              b0 ? h : -h,
              b1 ? h : -h,
              b2 ? h : -h,
              b3 ? h : -h
            ]);
          }
        }
      }
    }

    // Family C: even permutations of (+/-phi/2, +/-1/2, +/-invPhi/2, 0).
    // We enumerate all 24 permutations of 4 elements and keep only the even ones
    // (cycle-parity +1), apply each to the signed base vector, and keep only
    // results that contain a zero component (the zero entry landed somewhere).
    function permParity(p) {
      // p is an array of 4 distinct indices 0..3. Returns +1 for even, -1 for odd.
      var visited = [false, false, false, false];
      var par = 1, ci, cycLen, cur;
      for (ci = 0; ci < 4; ci++) {
        if (!visited[ci]) {
          cycLen = 0; cur = ci;
          while (!visited[cur]) { visited[cur] = true; cur = p[cur]; cycLen++; }
          if (cycLen % 2 === 0) par = -par;
        }
      }
      return par;
    }

    // All 24 permutations of [0,1,2,3] via Heap's algorithm.
    var allPerms = [];
    var permArr = [0, 1, 2, 3];
    var permStack = [0, 0, 0, 0];
    var pi, tmp;
    allPerms.push(permArr.slice());
    pi = 0;
    while (pi < 4) {    // 4 = length of permArr; iterative Heap's algorithm for n=4
      if (permStack[pi] < pi) {
        if (pi % 2 === 0) {
          tmp = permArr[0]; permArr[0] = permArr[pi]; permArr[pi] = tmp;
        } else {
          tmp = permArr[permStack[pi]]; permArr[permStack[pi]] = permArr[pi]; permArr[pi] = tmp;
        }
        allPerms.push(permArr.slice());
        permStack[pi]++;
        pi = 0;
      } else {
        permStack[pi] = 0;
        pi++;
      }
    }

    // Base values for family C before signing: (phi/2, 1/2, invPhi/2, 0).
    var cBase = [phi * 0.5, 0.5, invPhi * 0.5, 0];
    var cs0, cs1, cs2, signedBase, pi2, perm, permuted, qi2, hasSomeZero;
    for (cs0 = 0; cs0 < 2; cs0++) {
      for (cs1 = 0; cs1 < 2; cs1++) {
        for (cs2 = 0; cs2 < 2; cs2++) {
          signedBase = [
            (cs0 === 0 ? 1 : -1) * cBase[0],
            (cs1 === 0 ? 1 : -1) * cBase[1],
            (cs2 === 0 ? 1 : -1) * cBase[2],
            0
          ];
          for (pi2 = 0; pi2 < allPerms.length; pi2++) {
            perm = allPerms[pi2];
            if (permParity(perm) !== 1) continue;
            permuted = [
              signedBase[perm[0]],
              signedBase[perm[1]],
              signedBase[perm[2]],
              signedBase[perm[3]]
            ];
            // Keep only if some component is exactly zero.
            hasSomeZero = false;
            for (qi2 = 0; qi2 < 4; qi2++) {
              if (permuted[qi2] === 0) { hasSomeZero = true; break; }
            }
            if (hasSomeZero) verts.push(permuted);
          }
        }
      }
    }

    // Deduplicate: floating equality is safe here since all coords are exact
    // small fractions with no rounding in the construction above.
    var uniqueVerts = [];
    var uvi, uvj, dd, u, v;
    for (uvi = 0; uvi < verts.length; uvi++) {
      v = verts[uvi];
      var dup = false;
      for (uvj = 0; uvj < uniqueVerts.length; uvj++) {
        u = uniqueVerts[uvj];
        dd = (v[0]-u[0])*(v[0]-u[0]) + (v[1]-u[1])*(v[1]-u[1]) +
             (v[2]-u[2])*(v[2]-u[2]) + (v[3]-u[3])*(v[3]-u[3]);
        if (dd < 0.0001) { dup = true; break; }
      }
      if (!dup) uniqueVerts.push(v);
    }
    verts = uniqueVerts;
    // verts should now contain exactly 120 elements.

    // ----- Apply a fixed 4D double rotation: xw plane and yz plane. -----
    // Two independent simple rotations in orthogonal planes give a general element
    // of SO(4). The angles are chosen so the projection shows full non-degenerate
    // complexity with inner and outer structure both visible.
    var angle1 = 0.618;   // xw-plane rotation (radians)
    var angle2 = 1.0;     // yz-plane rotation
    var cos1 = Math.cos(angle1), sin1 = Math.sin(angle1);
    var cos2 = Math.cos(angle2), sin2 = Math.sin(angle2);

    var rotVerts = [];
    var rv, vv, vx, vy, vz, vw, rx, ry, rz, rw;
    for (rv = 0; rv < verts.length; rv++) {
      vv = verts[rv];
      vx = vv[0]; vy = vv[1]; vz = vv[2]; vw = vv[3];
      // xw plane: x' = cos*x + sin*w,  w' = -sin*x + cos*w.
      rx = cos1 * vx + sin1 * vw;
      rw = -sin1 * vx + cos1 * vw;
      // yz plane: y' = cos*y + sin*z,  z' = -sin*y + cos*z.
      ry = cos2 * vy + sin2 * vz;
      rz = -sin2 * vy + cos2 * vz;
      rotVerts.push([rx, ry, rz, rw]);
    }

    // ----- Find all 720 edges: vertex pairs at the minimal mutual distance. -----
    // For the 600-cell on the unit 3-sphere, the squared edge length is exactly
    // 1/phi^2 = 2 - phi ~= 0.382. We test on the unrotated vertices because
    // rotation is isometric and distances are preserved.
    var edgeLenSqTarget = 2 - phi;   // exact: 1/phi^2, approximately 0.382
    var edgeTol = edgeLenSqTarget * 0.05;

    var edges = [];
    var nv = verts.length;
    var ea, eb, va2, vb2, dxa, dya, dza, dwa, dsq;
    for (ea = 0; ea < nv; ea++) {
      for (eb = ea + 1; eb < nv; eb++) {
        va2 = verts[ea]; vb2 = verts[eb];
        dxa = va2[0] - vb2[0]; dya = va2[1] - vb2[1];
        dza = va2[2] - vb2[2]; dwa = va2[3] - vb2[3];
        dsq = dxa*dxa + dya*dya + dza*dza + dwa*dwa;
        if (Math.abs(dsq - edgeLenSqTarget) < edgeTol) {
          edges.push([ea, eb]);
        }
      }
    }

    // ----- Perspective-project rotated 4D vertices to 3D. -----
    // Viewpoint at w = 2.0. All vertices have |w| <= 1 after rotation (rotation
    // preserves the unit-sphere norm), so d - w is in [1, 3], giving a clear
    // perspective foreshortening without any vertex collapsing to infinity.
    var viewDist = 2.0;
    var proj3D = [];
    var origW4 = [];
    var pv, rv2, denom;
    for (pv = 0; pv < nv; pv++) {
      rv2 = rotVerts[pv];
      denom = viewDist - rv2[3];
      if (Math.abs(denom) < 0.001) denom = 0.001;   // guard against exact singularity
      proj3D.push([rv2[0] / denom, rv2[1] / denom, rv2[2] / denom]);
      origW4.push(rv2[3]);   // 4th coord of the rotated vertex, used for coloring
    }

    // ----- Sample 1 M points along all edges. -----
    // Distribute POINT_COUNT evenly across all edges; 'extras' edges get one
    // extra point so the total is exactly POINT_COUNT.
    var nEdges = edges.length;
    var ptsPerEdge = Math.ceil(POINT_COUNT / Math.max(nEdges, 1));
    var extras = POINT_COUNT - (ptsPerEdge - 1) * nEdges;

    var outIdx = 0;
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    var ei, ep, edgePts, idxA, idxB, pA, pB, wA, wB, t, px3, py3, pz3, pw4, base;

    for (ei = 0; ei < nEdges && outIdx < POINT_COUNT; ei++) {
      edgePts = (ei < extras) ? ptsPerEdge : (ptsPerEdge - 1);
      idxA = edges[ei][0]; idxB = edges[ei][1];
      pA = proj3D[idxA]; pB = proj3D[idxB];
      wA = origW4[idxA]; wB = origW4[idxB];

      for (ep = 0; ep < edgePts && outIdx < POINT_COUNT; ep++) {
        t = (edgePts > 1) ? (ep / (edgePts - 1)) : 0.5;
        px3 = pA[0] + t * (pB[0] - pA[0]);
        py3 = pA[1] + t * (pB[1] - pA[1]);
        pz3 = pA[2] + t * (pB[2] - pA[2]);
        pw4 = wA  + t * (wB  - wA);   // 4th coord interpolated along the edge

        positions[outIdx * 4 + 0] = px3;
        positions[outIdx * 4 + 1] = py3;
        positions[outIdx * 4 + 2] = pz3;
        // pw4 is in [-1, 1] after rotation; remap to color channel [1.5, 5.5].
        positions[outIdx * 4 + 3] = 1.5 + (pw4 + 1) * 2.0;

        if (px3 < xmin) xmin = px3; if (px3 > xmax) xmax = px3;
        if (py3 < ymin) ymin = py3; if (py3 > ymax) ymax = py3;
        if (pz3 < zmin) zmin = pz3; if (pz3 > zmax) zmax = pz3;

        outIdx++;
      }
    }

    // Fill any remaining slots by cycling from the start (guards against
    // arithmetic miscount if edge count differed from 720).
    var filled = outIdx;
    var copyFrom = 0;
    while (outIdx < POINT_COUNT) {
      base = copyFrom * 4;
      positions[outIdx * 4 + 0] = positions[base + 0];
      positions[outIdx * 4 + 1] = positions[base + 1];
      positions[outIdx * 4 + 2] = positions[base + 2];
      positions[outIdx * 4 + 3] = positions[base + 3];
      outIdx++;
      copyFrom = (copyFrom + 1) % Math.max(filled, 1);
    }

    // ----- Remap to centered unit cube with radius ~0.4. -----
    var cx2 = (xmin + xmax) * 0.5, cy2 = (ymin + ymax) * 0.5, cz2 = (zmin + zmax) * 0.5;
    var range2 = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    var scale2 = 0.80 / Math.max(range2, 0.0001);
    for (i = 0; i < POINT_COUNT; i++) {
      base = i * 4;
      positions[base + 0] = (positions[base + 0] - cx2) * scale2 + 0.5;
      positions[base + 1] = (positions[base + 1] - cy2) * scale2 + 0.5;
      positions[base + 2] = (positions[base + 2] - cz2) * scale2 + 0.5;
      var wc = positions[base + 3];
      if (!isFinite(wc)) wc = 2.0;
      if (wc < 1.5) wc = 1.5;
      if (wc > 5.5) wc = 5.5;
      positions[base + 3] = wc;
      if (!isFinite(positions[base]))     positions[base]     = 0.5;
      if (!isFinite(positions[base + 1])) positions[base + 1] = 0.5;
      if (!isFinite(positions[base + 2])) positions[base + 2] = 0.5;
    }

    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // ====== SACRED PATTERNS ======
  // Ten sacred-geometry forms, each reverse-engineered into a 3D point field
  // and lifted off the page. Planar mandalas are projected onto spheres, domes
  // and pyramids; 2D symbols are rebuilt as their true polyhedral or toroidal
  // solids. Each generator fills positions[0..n) with raw xyz + a colour weight
  // w in [1.5, 5.5] (the shader maps w-1 onto the six cluster-colour tiers),
  // then calls fitAndFill to centre the form on its centroid, scale it to live
  // at ~radius `rad` about the cube centre (so the flight camera, which spawns
  // there, is inside the form), cycle-fill any shortfall and upload. Every fill
  // is bounded + parametric (no rejection sampling), so none can ever stall.

  // Two orthonormal vectors spanning the plane perpendicular to unit (nx,ny,nz).
  function perpBasis(nx, ny, nz) {
    var ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    var ux, uy, uz;
    if (ax <= ay && ax <= az) { ux = 0; uy = -nz; uz = ny; }       // n x X
    else if (ay <= az) { ux = -nz; uy = 0; uz = nx; }              // n x Y
    else { ux = -ny; uy = nx; uz = 0; }                            // n x Z
    var ul = Math.sqrt(ux*ux + uy*uy + uz*uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var vx = ny*uz - nz*uy, vy = nz*ux - nx*uz, vz = nx*uy - ny*ux; // n x u (already unit)
    return [ux, uy, uz, vx, vy, vz];
  }

  // Centre the first `real` points on their centroid, scale so the form fits
  // radius ~`rad` about 0.5, cycle-fill the remainder, clamp/guard, then upload.
  function fitAndFill(real, rad) {
    if (real < 1) real = 1;
    if (real > POINT_COUNT) real = POINT_COUNT;
    var i, x, y, z;
    var cx = 0, cy = 0, cz = 0, cn = 0;
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (i = 0; i < real; i++) {
      x = positions[i*4]; y = positions[i*4+1]; z = positions[i*4+2];
      if (!(isFinite(x) && isFinite(y) && isFinite(z))) continue;
      cx += x; cy += y; cz += z; cn++;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    if (cn > 0) { cx /= cn; cy /= cn; cz /= cn; } else { cx = 0; cy = 0; cz = 0; }
    var span = Math.max(mxx - mnx, mxy - mny, mxz - mnz);
    if (!isFinite(span) || span < 1e-9) span = 1.0;
    var s = (rad * 2) / span;
    for (i = 0; i < real; i++) {
      x = positions[i*4]; y = positions[i*4+1]; z = positions[i*4+2];
      if (!isFinite(x)) x = cx; if (!isFinite(y)) y = cy; if (!isFinite(z)) z = cz;
      positions[i*4]   = (x - cx) * s + 0.5;
      positions[i*4+1] = (y - cy) * s + 0.5;
      positions[i*4+2] = (z - cz) * s + 0.5;
      var w = positions[i*4+3];
      if (!isFinite(w)) w = 2.0; else if (w < 1.5) w = 1.5; else if (w > 5.5) w = 5.5;
      positions[i*4+3] = w;
    }
    for (i = real; i < POINT_COUNT; i++) {
      var sidx = (i % real) * 4;
      positions[i*4]   = positions[sidx];
      positions[i*4+1] = positions[sidx+1];
      positions[i*4+2] = positions[sidx+2];
      positions[i*4+3] = positions[sidx+3];
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }
  // 1. FLOWER OF LIFE -- the overlapping-circle hex pattern lifted onto a
  // sphere. K circle centres sit on a Fibonacci sphere (each with ~6 neighbours,
  // the flower's hex coordination); around each we draw a geodesic small-circle
  // whose angular radius equals the centre spacing, so neighbouring circles pass
  // through each other and the vesica/petal lattice tiles the whole sphere.
  function generateFlowerOfLife() {
    var K = 150;
    var GA = Math.PI * (3 - Math.sqrt(5));
    var cxs = new Float32Array(K), cys = new Float32Array(K), czs = new Float32Array(K);
    var k;
    for (k = 0; k < K; k++) {
      var zc = 1 - 2 * (k + 0.5) / K;
      var rc = Math.sqrt(Math.max(0, 1 - zc*zc));
      var th = k * GA;
      cxs[k] = rc * Math.cos(th); cys[k] = rc * Math.sin(th); czs[k] = zc;
    }
    var rho = 3.3 / Math.sqrt(K);           // angular circle radius ~ neighbour spacing
    var cosR = Math.cos(rho), sinR = Math.sin(rho);
    var per = Math.floor(POINT_COUNT / K);
    var n = 0, c;
    for (c = 0; c < K; c++) {
      var nx = cxs[c], ny = cys[c], nz = czs[c];
      var bb = perpBasis(nx, ny, nz);
      var e1x = bb[0], e1y = bb[1], e1z = bb[2], e2x = bb[3], e2y = bb[4], e2z = bb[5];
      var wcol = 1.6 + (nz * 0.5 + 0.5) * 3.8;     // colour by centre latitude
      var p;
      for (p = 0; p < per && n < POINT_COUNT; p++) {
        var a = (p / per) * Math.PI * 2;
        var ca = Math.cos(a) * sinR, sa = Math.sin(a) * sinR;
        positions[n*4]   = cosR*nx + ca*e1x + sa*e2x;
        positions[n*4+1] = cosR*ny + ca*e1y + sa*e2y;
        positions[n*4+2] = cosR*nz + ca*e1z + sa*e2z;
        positions[n*4+3] = wcol;
        n++;
      }
    }
    fitAndFill(n, 0.42);
  }

  // 3. METATRON'S CUBE -- the thirteen Fruit-of-Life circles become thirteen
  // nodes in 3D (centre + the 12 vertices of a cuboctahedron, the "vector
  // equilibrium"); every pair is joined, giving the 78 lines that contain all
  // five Platonic solids. Edges are coloured by length, so the nested solids
  // sort themselves out by hue. Small spheres mark the thirteen nodes.
  function generateMetatron() {
    var nodes = [[0,0,0],
      [1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],
      [1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],
      [0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1]];
    var NN = nodes.length;
    var edges = [], ea, eb;
    for (ea = 0; ea < NN; ea++) for (eb = ea+1; eb < NN; eb++) edges.push([ea, eb]);
    var nE = edges.length;
    var per = Math.floor(POINT_COUNT * 0.88 / nE), n = 0, e;
    for (e = 0; e < nE; e++) {
      var A = nodes[edges[e][0]], B = nodes[edges[e][1]];
      var dx = B[0]-A[0], dy = B[1]-A[1], dz = B[2]-A[2];
      var len = Math.sqrt(dx*dx+dy*dy+dz*dz);
      var wcol = 1.5 + Math.min(len/2.83, 1) * 4.0;
      var p;
      for (p = 0; p < per && n < POINT_COUNT; p++) {
        var t = (per>1)? p/(per-1) : 0.5;
        positions[n*4]   = A[0]+t*dx;
        positions[n*4+1] = A[1]+t*dy;
        positions[n*4+2] = A[2]+t*dz;
        positions[n*4+3] = wcol;
        n++;
      }
    }
    var perNode = Math.floor((POINT_COUNT - n) / NN), nd;
    for (nd = 0; nd < NN; nd++) {
      var C = nodes[nd], q;
      for (q = 0; q < perNode && n < POINT_COUNT; q++) {
        var u = Math.random()*2-1, ph = Math.random()*Math.PI*2, rr = Math.sqrt(Math.max(0,1-u*u));
        positions[n*4]   = C[0] + 0.15*rr*Math.cos(ph);
        positions[n*4+1] = C[1] + 0.15*rr*Math.sin(ph);
        positions[n*4+2] = C[2] + 0.15*u;
        positions[n*4+3] = 5.2;
        n++;
      }
    }
    fitAndFill(n, 0.22);   // much smaller so the whole cage of lines is in view
  }

  // 7. HOPF FIBRATION -- the map S^3 -> S^2 in which every point of the base
  // sphere lifts to a great circle, and every pair of those circles is linked.
  // We take several latitude rings of base points, build each fibre, and project
  // it stereographically from S^3 into 3-space, where the fibres of one latitude
  // close up into a torus. Nested, interlinked, colour-banded by base latitude.
  function generateHopf() {
    // Expanded: more latitude rings (more nested tori) and denser fibres per
    // ring, over a wider colatitude band, so the weave reads as ring upon ring.
    var rings = 13, perRing = 44;
    var K = rings * perRing;
    var per = Math.max(1, Math.floor(POINT_COUNT / K));
    var n = 0, ri, pj;
    for (ri = 0; ri < rings; ri++) {
      var theta = (0.26 + 0.56 * ri / (rings - 1)) * Math.PI;   // colatitude band, off the poles: innermost torus to widest
      var st2 = Math.sin(theta/2), ct2 = Math.cos(theta/2);
      var wcol = 1.6 + (ri / (rings - 1)) * 3.8;                 // colour banded by latitude (which torus the fibre belongs to)
      for (pj = 0; pj < perRing; pj++) {
        var phi = (pj / perRing) * Math.PI * 2;
        var fibShade = 0.85 + 0.15 * Math.sin(pj * 1.7);          // gentle fibre-to-fibre shimmer within a torus
        var p;
        for (p = 0; p < per && n < POINT_COUNT; p++) {
          var psi = (p / per) * Math.PI * 2;
          var A = (psi + phi) * 0.5, B = (psi - phi) * 0.5;
          var x1 = st2*Math.cos(A), x2 = st2*Math.sin(A), x3 = ct2*Math.cos(B), x4 = ct2*Math.sin(B);
          var d = 1 - x4; if (d < 0.04) d = 0.04;
          positions[n*4]   = x1 / d;
          positions[n*4+1] = x2 / d;
          positions[n*4+2] = x3 / d;
          positions[n*4+3] = 1.5 + (wcol - 1.5) * fibShade;
          n++;
        }
      }
    }
    fitAndFill(n, 0.46);
  }

  // 8. PLATONIC SOLIDS -- the five regular polyhedra the ancients tied to the
  // elements and the cosmos, nested concentrically (octahedron, cube, tetrahedron,
  // icosahedron, dodecahedron) with the dodeca/icosa built from golden-ratio
  // coordinates. Edges are found by minimal vertex distance and coloured per solid.
  function generatePlatonic() {
    var phi = (1 + Math.sqrt(5)) / 2, ip = 1/phi, n = 0;
    var sg = [-1, 1], a, b, c2;
    var cube = [], dod = [];
    for (a=0;a<2;a++) for (b=0;b<2;b++) for (c2=0;c2<2;c2++) { cube.push([sg[a],sg[b],sg[c2]]); dod.push([sg[a],sg[b],sg[c2]]); }
    var dperm = [[0,ip,phi],[0,ip,-phi],[0,-ip,phi],[0,-ip,-phi],
                 [ip,phi,0],[ip,-phi,0],[-ip,phi,0],[-ip,-phi,0],
                 [phi,0,ip],[phi,0,-ip],[-phi,0,ip],[-phi,0,-ip]];
    var di; for (di=0;di<dperm.length;di++) dod.push(dperm[di]);
    var tet = [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
    var oct = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    var ico = [[0,1,phi],[0,1,-phi],[0,-1,phi],[0,-1,-phi],
               [1,phi,0],[1,-phi,0],[-1,phi,0],[-1,-phi,0],
               [phi,0,1],[phi,0,-1],[-phi,0,1],[-phi,0,-1]];
    var solids = [
      { v: oct,  rad: 0.55, w: 1.7 },
      { v: cube, rad: 0.68, w: 2.5 },
      { v: tet,  rad: 0.80, w: 3.3 },
      { v: ico,  rad: 0.90, w: 4.1 },
      { v: dod,  rad: 1.00, w: 4.9 }
    ];
    var budgetPer = Math.floor(POINT_COUNT / solids.length), si;
    for (si = 0; si < solids.length; si++) {
      var V = solids[si].v, rad = solids[si].rad, wcol = solids[si].w;
      var cr = 0, k, m;
      for (k=0;k<V.length;k++){ m = Math.sqrt(V[k][0]*V[k][0]+V[k][1]*V[k][1]+V[k][2]*V[k][2]); if (m>cr) cr=m; }
      var sc = rad / (cr || 1);
      var minD = Infinity, ka, kb, qq, dd;
      for (ka=0;ka<V.length;ka++) for (kb=ka+1;kb<V.length;kb++){ dd=0; for(qq=0;qq<3;qq++){var d=V[ka][qq]-V[kb][qq]; dd+=d*d;} if (dd<minD) minD=dd; }
      var E = [], dd2, q2;
      for (ka=0;ka<V.length;ka++) for (kb=ka+1;kb<V.length;kb++){ dd2=0; for(q2=0;q2<3;q2++){var d2=V[ka][q2]-V[kb][q2]; dd2+=d2*d2;} if (dd2 <= minD*1.06) E.push([ka,kb]); }
      var per = Math.max(1, Math.floor(budgetPer / Math.max(E.length,1))), e2, p;
      for (e2=0;e2<E.length;e2++){
        var A=V[E[e2][0]], B=V[E[e2][1]];
        for (p=0;p<per && n<POINT_COUNT;p++){
          var t=(per>1)?p/(per-1):0.5;
          positions[n*4]   = (A[0]+t*(B[0]-A[0]))*sc;
          positions[n*4+1] = (A[1]+t*(B[1]-A[1]))*sc;
          positions[n*4+2] = (A[2]+t*(B[2]-A[2]))*sc;
          positions[n*4+3] = wcol;
          n++;
        }
      }
    }
    fitAndFill(n, 0.30);
  }

  // 9. LOTUS -- a layered bloom built from rhodonea (rose) curves. Each layer is
  // a ring of petals, r = |cos(k/2 . theta)|; outer layers are wide and low,
  // inner layers smaller and higher, and every petal lifts at its tip so the
  // flower opens into a cup. A stamen core glows at the centre.
  function generateLotus() {
    var n = 0, layers = 6;
    var budgetPer = Math.floor(POINT_COUNT * 0.92 / layers), lyr;
    for (lyr = 0; lyr < layers; lyr++) {
      var lf = lyr / (layers - 1);
      var petals = 6 + lyr;
      var layerScale = 1.0 - lf * 0.7;
      var baseZ = lf * 0.5;
      var lift = 0.35 + lf * 0.3;
      var rot = lf * 0.5;
      var wcol = 1.6 + lf * 3.6;
      var samples = budgetPer, sj;
      for (sj = 0; sj < samples && n < POINT_COUNT; sj++) {
        var ang = (sj / samples) * Math.PI * 2;
        var petalR = Math.abs(Math.cos(petals * 0.5 * ang));
        var rfrac = Math.sqrt(Math.random());
        var rr = petalR * rfrac * layerScale * 0.62;
        var aa = ang + rot;
        var tip = rfrac * petalR;
        positions[n*4]   = Math.cos(aa) * rr;
        positions[n*4+1] = Math.sin(aa) * rr;
        positions[n*4+2] = baseZ + lift * tip * tip;
        positions[n*4+3] = wcol;
        n++;
      }
    }
    while (n < POINT_COUNT) {
      var u = Math.random()*2-1, ph = Math.random()*Math.PI*2, rr2 = Math.sqrt(Math.max(0,1-u*u))*0.06;
      positions[n*4]=rr2*Math.cos(ph); positions[n*4+1]=rr2*Math.sin(ph); positions[n*4+2]=0.55+0.06*u;
      positions[n*4+3]=5.3; n++;
    }
    fitAndFill(n, 0.46);
  }

  // SPHERICAL HARMONICS -- the natural vibration modes of a sphere (the math of
  // electron orbitals, bell tones, radiolaria). The radius in each direction is
  // set by a harmonic, r = sin(m0 phi)^m1 + cos(m2 phi)^m3 + sin(m4 th)^m5 +
  // cos(m6 th)^m7, so the sphere swells into lobes and petals. Colour rides r.
  function generateHarmonics() {
    var M = [4, 3, 2, 3, 6, 3, 2, 3];          // eight integer mode numbers (swap for other blooms)
    var gridP = Math.max(4, Math.floor(Math.sqrt(POINT_COUNT * 2)));
    var gridT = Math.max(2, Math.floor(gridP / 2));
    var n = 0, a, b;
    for (a = 0; a < gridT && n < POINT_COUNT; a++) {
      var th = (a + 0.5) / gridT * Math.PI;
      var st = Math.sin(th), ct = Math.cos(th);
      for (b = 0; b < gridP && n < POINT_COUNT; b++) {
        var ph = (b + 0.5) / gridP * Math.PI * 2;
        var r = Math.pow(Math.sin(M[0]*ph), M[1]) + Math.pow(Math.cos(M[2]*ph), M[3])
              + Math.pow(Math.sin(M[4]*th), M[5]) + Math.pow(Math.cos(M[6]*th), M[7]);
        if (!isFinite(r)) r = 0;
        var rr = r * (1 + (Math.random() - 0.5) * 0.02);   // a hair of radial thickness for glow
        positions[n*4]   = rr * st * Math.cos(ph);
        positions[n*4+1] = rr * ct;
        positions[n*4+2] = rr * st * Math.sin(ph);
        positions[n*4+3] = 1.6 + Math.min(Math.abs(r) / 3.2, 1) * 3.8;   // colour by radius magnitude: hot tips, cool throats
        n++;
      }
    }
    fitAndFill(n, 0.42);
  }

  // SUPERFORMULA -- Gielis's one equation for natural forms (flowers, starfish,
  // shells, diatoms). Two superformula profiles, one for latitude and one for
  // longitude, sweep out a 3D bloom; swap the parameters for a different species.
  function generateSupershape() {
    function sf(angle, m, n1, n2, n3) {
      var t1 = Math.pow(Math.abs(Math.cos(m * angle / 4)), n2);
      var t2 = Math.pow(Math.abs(Math.sin(m * angle / 4)), n3);
      var s = t1 + t2; if (s < 1e-6) s = 1e-6;
      var r = Math.pow(s, -1 / n1);
      return isFinite(r) ? Math.min(r, 4) : 0;          // clamp the star-point spikes
    }
    var gridP = Math.max(4, Math.floor(Math.sqrt(POINT_COUNT * 2)));
    var gridT = Math.max(2, Math.floor(gridP / 2));
    var n = 0, a, b;
    for (a = 0; a < gridT && n < POINT_COUNT; a++) {
      var th = -Math.PI/2 + (a + 0.5) / gridT * Math.PI;        // latitude
      var r1 = sf(th, 7, 0.5, 1.0, 1.0);
      var ct = Math.cos(th), stt = Math.sin(th);
      for (b = 0; b < gridP && n < POINT_COUNT; b++) {
        var ph = -Math.PI + (b + 0.5) / gridP * Math.PI * 2;    // longitude
        var r2 = sf(ph, 7, 0.5, 1.0, 1.0);
        var x = r2 * Math.cos(ph) * r1 * ct;
        var y = r2 * Math.sin(ph) * r1 * ct;
        var z = r1 * stt;
        positions[n*4]   = x;
        positions[n*4+1] = z;                            // latitude axis upright (world Y)
        positions[n*4+2] = y;
        positions[n*4+3] = 1.6 + Math.min(Math.sqrt(x*x + y*y + z*z) / 1.1, 1) * 3.8;
        n++;
      }
    }
    fitAndFill(n, 0.44);
  }

  // MAURER ROSE -- a rose curve sampled at a fixed angular stride and joined by
  // straight chords; the chords criss-cross into a lace far richer than the rose
  // itself. A few layers, lifted onto a gentle bowl, give the lacework depth.
  function generateMaurerRose() {
    var petalN = 6, deg = 71, layers = 3, STEPS = 721;   // (n, d) define the rose
    var perSeg = Math.max(1, Math.floor(POINT_COUNT / (layers * STEPS)));
    var n = 0, ly, k;
    for (ly = 0; ly < layers; ly++) {
      var lf = ly / Math.max(layers - 1, 1);
      var rot = lf * 0.6, zoff = (lf - 0.5) * 0.5, wbase = 1.7 + lf * 3.2;
      var px = 0, py = 0, have = false;
      for (k = 0; k <= STEPS; k++) {
        var thr = k * deg * Math.PI / 180;
        var rr = Math.sin(petalN * thr);
        var cx = rr * Math.cos(thr + rot), cy = rr * Math.sin(thr + rot);
        if (have) {
          var p;
          for (p = 0; p < perSeg && n < POINT_COUNT; p++) {
            var t = perSeg > 1 ? p / (perSeg - 1) : 0;
            var x = px + t * (cx - px), y = py + t * (cy - py);
            positions[n*4]   = x;
            positions[n*4+1] = 0.35 * (1 - (x*x + y*y)) + zoff;   // gentle bowl
            positions[n*4+2] = y;
            positions[n*4+3] = wbase + Math.min(x*x + y*y, 1) * 0.6;
            n++;
          }
        }
        px = cx; py = cy; have = true;
      }
    }
    fitAndFill(n, 0.46);
  }

  // ====== END SACRED PATTERNS ======

  // ====== PATHFINDING SEARCH (live, stateful scene) ======
  // A 3D lattice you fly through while a graph search expands from a START
  // beacon to an END beacon. Unlike every other scene (filled once), this one
  // rewrites each node's dev value every frame as the search runs. The engine
  // is pure JS and testable via window.GXSEARCH. Shader pathMode (params5.x)
  // reinterprets dev: 0.3 open lattice, 0.6 wall, 1..6 search heat (frontier
  // hottest, visited cooling by age), 7.5 path, 8.5 start, 9.5 end.
  var SEARCH_N = 56;                 // lattice nodes per side (56^3 = 175,616 - denser so the torus reads as a solid surface, not scattered disks). The Particles dev slider drives this on search scenes.
  var SEARCH_SPAN = 0.40;            // lattice extent in the unit cube (smaller = the whole grid + its start/end read at once; dev-tunable)
  var SEARCH_STEPS = 48;             // algorithm expansions per frame (dev-tunable search speed; HUD -/+ buttons scale it)
  var searchLoop = true;             // auto-restart the search after it settles (toggled by the HUD Loop button)
  var SEARCH_SHOW = 0.5;             // seconds the finished search is held (route pulses) before the loop transition
  var SEARCH_FADE = 1.8;             // seconds of the loop-transition animation between runs (longer = the dots ease out instead of snapping)
  var SEARCH_GHOST_TAIL = 0.55;      // extra seconds the just-finished route lingers, decaying, AFTER the next run has begun (the cross-run overlap)
  var SEARCH_TRANSITION = 1;         // fixed to Supernova ('nova'); the cycle button was removed, so this never changes
  var TX_NAMES = ['Stardust', 'Supernova', 'Aurora', 'Bloom'];
  var EDGE_BUDGET = 24000;           // max points for the traced route line (Region 2 of the buffer, after the N^3 lattice nodes)
  var pf = null;                     // pathfinder state
  var SEARCH_NB = (function () {     // the 26 neighbour offsets (26-connected grid)
    var a = [], di, dj, dk;
    for (di = -1; di <= 1; di++) for (dj = -1; dj <= 1; dj++) for (dk = -1; dk <= 1; dk++)
      if (!(di === 0 && dj === 0 && dk === 0)) a.push([di, dj, dk]);
    return a;
  })();

  function searchEnsure() {
    var N = SEARCH_N, total = N * N * N;
    if (!pf || pf.total !== total) {
      pf = { N: N, total: total, built: false,
             wall: new Uint8Array(total), state: new Int8Array(total),
             came: new Int32Array(total), g: new Float32Array(total), age: new Float32Array(total),
             queue: new Int32Array(total), qHead: 0, qTail: 0,
             stack: new Int32Array(total), stackN: 0,
             heap: new Int32Array(total), heapPri: new Float32Array(total), heapPos: new Int32Array(total), heapN: 0,
             came2: new Int32Array(total),                                  // bidirectional: end-side parent tree
             queue2: new Int32Array(total), q2Head: 0, q2Tail: 0,           // bidirectional: end-side BFS queue
             w: new Float32Array(total),                                    // stochastic-dijkstra / noisy-flood: frozen per-cell cost field
             reachVis: new Uint8Array(total),                               // scratch flood marks for the connectivity guarantee
             meet: -1,                                                      // bidirectional: meeting cell (-1 until fronts collide)
             src: new Int32Array(8), srcN: 0,                               // multi-source wavefront: extra source cell indices
             algo: 'bfs', start: 0, end: total - 1, cur: 0, lastClosed: 0, lineCount: 0,
             reached: false, done: false, pathTraced: false, holdT: 0, steps: 0 };
    }
    return pf;
  }

  function searchHeapPush(node, pri) {
    var h = pf.heap, hp = pf.heapPri, pos = pf.heapPos, n;
    if (pos[node] >= 0) { n = pos[node]; if (pri >= hp[n]) return; hp[n] = pri; }
    else { n = pf.heapN++; h[n] = node; hp[n] = pri; pos[node] = n; }
    while (n > 0) {
      var p = (n - 1) >> 1; if (hp[p] <= hp[n]) break;
      var tn = h[p]; h[p] = h[n]; h[n] = tn; var tp = hp[p]; hp[p] = hp[n]; hp[n] = tp;
      pos[h[p]] = p; pos[h[n]] = n; n = p;
    }
  }
  function searchHeapPop() {
    if (pf.heapN === 0) return -1;
    var h = pf.heap, hp = pf.heapPri, pos = pf.heapPos, top = h[0];
    pos[top] = -1; pf.heapN--;
    if (pf.heapN > 0) {
      h[0] = h[pf.heapN]; hp[0] = hp[pf.heapN]; pos[h[0]] = 0;
      var n = 0;
      for (;;) {
        var l = 2*n+1, r = l+1, s = n;
        if (l < pf.heapN && hp[l] < hp[s]) s = l;
        if (r < pf.heapN && hp[r] < hp[s]) s = r;
        if (s === n) break;
        var tn = h[s]; h[s] = h[n]; h[n] = tn; var tp = hp[s]; hp[s] = hp[n]; hp[n] = tp;
        pos[h[s]] = s; pos[h[n]] = n; n = s;
      }
    }
    return top;
  }
  function searchH(node) {
    var N = pf.N;
    var i = (node / (N*N)) | 0, r = node - i*N*N, j = (r / N) | 0, k = r - j*N;
    var ei = (pf.end / (N*N)) | 0, er = pf.end - ei*N*N, ej = (er / N) | 0, ek = er - ej*N;
    var dx = Math.abs(i-ei); if (dx > N-dx) dx = N-dx;   // torus: shortest way around the major ring (i wraps)
    var dy = Math.abs(j-ej); if (dy > N-dy) dy = N-dy;   // torus: shortest way around the tube (j wraps)
    var dz = k-ek; return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  function searchBuildLattice() {
    // The search space is a TORUS (a donut): i = major angle around the ring
    // (wraps), j = angle around the tube (wraps), k = radius within the tube
    // (does not wrap). The neighbour/heuristic code wraps i and j to match, so
    // the search can flow all the way around the donut and through the hole.
    var N = SEARCH_N, n = 0, i, j, k, t;
    var TAU = Math.PI * 2;
    var cx = 0.5, cy = 0.5, cz = 0.5;                 // donut centred in the unit cube, axis along +Z (hole faces the camera)
    var R = SEARCH_SPAN * 0.68;                        // major radius (centre of the tube ring) - larger so the hole reads clearly: a classic donut
    var rOut = SEARCH_SPAN * 0.30;                     // tube radius; the cross-section is a filled disk, so the donut is solid
    var CORE_FRAC = 0.55;                              // inner 55% of the tube radius is solid but impassable: the search runs the outer shell, so it travels around the tube, never through its middle
    var jit = (rOut / N) * 0.6;
    searchEnsure();
    // Spherical obstacle voids in grid space, so the flood has to wind around
    // them through the donut instead of running a clean ring.
    var obs = [];
    for (t = 0; t < 9; t++)
      obs.push([Math.random()*N, Math.random()*N, Math.random()*N, N*0.07 + Math.random()*N*0.05]);
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) for (k = 0; k < N; k++) {
      var th = (i / N) * TAU + (Math.random() - 0.5) * (TAU / N);   // major angle, jittered up to half a step so the ring blends into a continuous torus, not stacked slices
      var ph = (j / N) * TAU;                          // angle around the tube
      var rho = rOut * Math.sqrt((k + 0.5) / N);       // filled disk cross-section (equal-area: k=0 core out to k=N-1 rim)
      var ring = R + rho * Math.cos(ph);
      positions[n*4]   = cx + ring * Math.cos(th) + (Math.random()-0.5)*jit;
      positions[n*4+1] = cy + ring * Math.sin(th) + (Math.random()-0.5)*jit;
      positions[n*4+2] = cz + rho  * Math.sin(ph) + (Math.random()-0.5)*jit;
      var w = (rho < rOut * CORE_FRAC) ? 1 : 0;        // solid but impassable core, so a path can't cut through the tube's middle
      for (t = 0; t < obs.length; t++) { var dx=i-obs[t][0], dy=j-obs[t][1], dz=k-obs[t][2]; if (dx*dx+dy*dy+dz*dz < obs[t][3]*obs[t][3]) { w = 1; break; } }
      pf.wall[n] = w; positions[n*4+3] = w ? 0.6 : 0.3;
      n++;
    }
    // Start and end ride the outer surface a half-turn apart around the ring, so
    // the search must travel around the donut (either way) to connect them.
    var jMid = (N / 2) | 0;
    pf.start = (0    * N + jMid) * N + (N - 1);
    pf.end   = (jMid * N + jMid) * N + (N - 1);
    pf.wall[pf.start] = 0; pf.wall[pf.end] = 0;
    // Connectivity guarantee: flood from start over open cells; if the end is
    // never reached (an obstacle sphere happened to wall it off on the thin
    // shell), dissolve the random obstacles back to the bare core wall - a plain
    // torus shell is always fully connected, so start and end are then linked.
    var rv = pf.reachVis, fq = pf.queue, fh = 0, ft = 0, fc, fi2, fr2, fj2, fk2, foff, fni, fnj, fnk, fnb, connOk = false;
    rv.fill(0); rv[pf.start] = 1; fq[ft++] = pf.start;
    while (fh < ft) {
      fc = fq[fh++];
      if (fc === pf.end) { connOk = true; break; }
      fi2 = (fc/(N*N))|0; fr2 = fc-fi2*N*N; fj2 = (fr2/N)|0; fk2 = fr2-fj2*N;
      for (t = 0; t < 26; t++) {
        foff = SEARCH_NB[t]; fni = fi2+foff[0]; fnj = fj2+foff[1]; fnk = fk2+foff[2];
        if (fnk<0||fnk>=N) continue;
        if (fni<0) fni+=N; else if (fni>=N) fni-=N;
        if (fnj<0) fnj+=N; else if (fnj>=N) fnj-=N;
        fnb = (fni*N+fnj)*N+fnk;
        if (pf.wall[fnb] || rv[fnb]) continue;
        rv[fnb] = 1; fq[ft++] = fnb;
      }
    }
    if (!connOk) {
      n = 0;
      for (i = 0; i < N; i++) for (j = 0; j < N; j++) for (k = 0; k < N; k++) {
        var rhoC = rOut * Math.sqrt((k + 0.5) / N);
        var wc = (rhoC < rOut * CORE_FRAC) ? 1 : 0;          // keep only the impassable core; drop every obstacle sphere
        pf.wall[n] = wc; positions[n*4+3] = wc ? 0.6 : 0.3;
        n++;
      }
      pf.wall[pf.start] = 0; pf.wall[pf.end] = 0;
    }
    var free = 0, q; for (q = 0; q < pf.total; q++) if (!pf.wall[q]) free++;
    pf.cFree = free;                                  // open (non-wall) cell count = the real search space
    pf.routeEst = estimateRouteCount(N);              // order-of-magnitude "possible routes" headline for the HUD
  }

  function searchInit(algo) {
    searchEnsure();
    pf.algo = algo;
    pf.state.fill(0); pf.came.fill(-1); pf.g.fill(Infinity); pf.age.fill(0);
    pf.heapPos.fill(-1); pf.heapN = 0; pf.qHead = 0; pf.qTail = 0; pf.stackN = 0;
    pf.q2Head = 0; pf.q2Tail = 0; pf.meet = -1; pf.srcN = 0; pf.came2.fill(-1);   // bidirectional + multi-source resets
    pf.reached = false; pf.done = false; pf.pathTraced = false; pf.holdT = 0; pf.steps = 0;
    pf.lastClosed = pf.start; pf.lineCount = 0;
    pf.elapsed = 0; pf.cClosed = 0; pf.cOpen = 0; pf.cPath = 0;   // search HUD: elapsed timer + live counts (reset each (re)search)
    pf.phase = 'search'; pf.fadeT = 0; pf.txSnapped = false;     // loop-transition state machine: search -> show -> fade -> reset
    pf.ovActive = false; pf.stepAcc = 0;                          // clear any decaying route ghost + fractional-step carry on a fresh (re)search
    pf.g[pf.start] = 0; pf.state[pf.start] = 2;
    if (algo === 'bfs' || algo === 'wavefront') {
      pf.queue[pf.qTail++] = pf.start;
      if (algo === 'wavefront') {                                // multi-source: + up to 4 extra random open beacons (each a came=-1 root)
        pf.src[pf.srcN++] = pf.start;
        var ns = 4, tries, cand;
        while (pf.srcN < ns + 1) {
          tries = 0; cand = -1;
          do { cand = (Math.random() * pf.total) | 0; tries++; } while ((pf.wall[cand] || pf.state[cand] !== 0 || cand === pf.end) && tries < 40);
          if (cand >= 0 && pf.state[cand] === 0 && !pf.wall[cand] && cand !== pf.end) {
            pf.state[cand] = 2; pf.g[cand] = 0; pf.came[cand] = -1;
            pf.queue[pf.qTail++] = cand; pf.src[pf.srcN++] = cand;
          } else break;
        }
      }
    } else if (algo === 'bidir') {
      pf.queue[pf.qTail++] = pf.start;
      pf.queue2[pf.q2Tail++] = pf.end;
      pf.state[pf.end] = 4; pf.g[pf.end] = 0;                    // end-side frontier (distinct state 4)
    } else if (algo === 'dijkstra' || algo === 'randomflood') {
      var wi;
      for (wi = 0; wi < pf.total; wi++) pf.w[wi] = 0.25 + Math.random() * Math.random() * 6.0;   // skewed-low per-cell cost: many cheap, few dear -> shimmering tendrils
      if (algo === 'randomflood') {                              // smoother grain so the flood grows in organic lobes, not rings
        var fi, fci, fcr, fcj, fck, fN = pf.N;
        for (fi = 0; fi < pf.total; fi++) {
          fci = (fi/(fN*fN))|0; fcr = fi-fci*fN*fN; fcj = (fcr/fN)|0; fck = fcr-fcj*fN;
          pf.w[fi] = 3.0 + Math.sin(fci*0.5) + Math.sin(fcj*0.5+1.7) + Math.sin(fck*0.5+4.2) + Math.random()*0.6;
        }
      }
      pf.g[pf.start] = 0; searchHeapPush(pf.start, 0);
    } else if (algo === 'dfs') {
      pf.stack[pf.stackN++] = pf.start;
    } else if (algo === 'randomwalk') {
      pf.cur = pf.start;
    }
  }

  function searchStep() {
    if (pf.reached || pf.done) return;
    var N = pf.N, algo = pf.algo, cur, ti, off, ni, nj, nk, nb;
    if (algo === 'randomwalk') {
      cur = pf.cur;
      if (pf.state[cur] !== 1) { pf.state[cur] = 1; pf.age[cur] = 0; }
      if (cur === pf.end) { pf.reached = true; return; }
      var ci0 = (cur/(N*N))|0, cr0 = cur-ci0*N*N, cj0 = (cr0/N)|0, ck0 = cr0-cj0*N, picks = [];
      for (ti = 0; ti < 26; ti++) { off = SEARCH_NB[ti]; ni = ci0+off[0]; nj = cj0+off[1]; nk = ck0+off[2];
        if (nk<0||nk>=N) continue;                                  // tube radius does not wrap
        if (ni<0) ni+=N; else if (ni>=N) ni-=N;                     // torus: major angle wraps
        if (nj<0) nj+=N; else if (nj>=N) nj-=N;                     // torus: tube angle wraps
        nb = (ni*N+nj)*N+nk; if (!pf.wall[nb]) picks.push(nb); }
      if (picks.length === 0) { pf.done = true; return; }
      nb = picks[(Math.random()*picks.length)|0];
      if (pf.came[nb] < 0 && nb !== pf.start) pf.came[nb] = cur;
      if (pf.state[nb] === 0) pf.state[nb] = 2;
      pf.cur = nb; pf.lastClosed = nb; pf.steps++;
      return;
    }
    if (algo === 'bidir') {
      // Two BFS fronts grow at once: side A from start (state 2 open / 1 closed, came),
      // side B from end (state 4 open / 5 closed, came2). Alternate by step parity; a
      // cell touched by both sides is the meeting seam. lastClosed tracks the start side
      // only, so the live route line stays a stable start-rooted tendril mid-search.
      var sideB = (pf.steps & 1) === 1, openS, closeS, par, otherClose, otherOpen;
      if (!sideB) { openS = 2; closeS = 1; par = pf.came;  otherClose = 5; otherOpen = 4; }
      else        { openS = 4; closeS = 5; par = pf.came2; otherClose = 1; otherOpen = 2; }
      if (!sideB) { if (pf.qHead  >= pf.qTail)  { if (pf.q2Head >= pf.q2Tail) pf.done = true; pf.steps++; return; } cur = pf.queue[pf.qHead++]; }
      else        { if (pf.q2Head >= pf.q2Tail) { if (pf.qHead  >= pf.qTail)  pf.done = true; pf.steps++; return; } cur = pf.queue2[pf.q2Head++]; }
      if (pf.state[cur] === closeS) { pf.steps++; return; }                          // stale duplicate
      if (pf.state[cur] === otherClose || pf.state[cur] === otherOpen) {             // already owned by the other side: collision
        pf.meet = cur; pf.reached = true; pf.lastClosed = cur; return;
      }
      pf.state[cur] = closeS; pf.age[cur] = 0;
      if (!sideB) pf.lastClosed = cur;
      var bci = (cur/(N*N))|0, bcr = cur-bci*N*N, bcj = (bcr/N)|0, bck = bcr-bcj*N;
      for (ti = 0; ti < 26; ti++) {
        off = SEARCH_NB[ti]; ni = bci+off[0]; nj = bcj+off[1]; nk = bck+off[2];
        if (nk<0||nk>=N) continue;
        if (ni<0) ni+=N; else if (ni>=N) ni-=N;
        if (nj<0) nj+=N; else if (nj>=N) nj-=N;
        nb = (ni*N+nj)*N+nk;
        if (pf.wall[nb]) continue;
        if (pf.state[nb] === otherClose || pf.state[nb] === otherOpen) {             // expansion collision: the fronts kiss here
          par[nb] = cur; pf.meet = nb; pf.reached = true; pf.lastClosed = nb; pf.steps++; return;
        }
        if (pf.state[nb] === 0) {
          pf.state[nb] = openS; par[nb] = cur;
          if (!sideB) pf.queue[pf.qTail++] = nb; else pf.queue2[pf.q2Tail++] = nb;
        }
      }
      pf.steps++;
      return;
    }
    if (algo === 'dijkstra') {
      cur = searchHeapPop(); if (cur === -1) { pf.done = true; return; }
      if (pf.state[cur] === 1) return;
      pf.state[cur] = 1; pf.age[cur] = 0; pf.lastClosed = cur;
      if (cur === pf.end) { pf.reached = true; return; }
      var dci = (cur/(N*N))|0, dcr = cur-dci*N*N, dcj = (dcr/N)|0, dck = dcr-dcj*N;
      for (ti = 0; ti < 26; ti++) {
        off = SEARCH_NB[ti]; ni = dci+off[0]; nj = dcj+off[1]; nk = dck+off[2];
        if (nk<0||nk>=N) continue;
        if (ni<0) ni+=N; else if (ni>=N) ni-=N;
        if (nj<0) nj+=N; else if (nj>=N) nj-=N;
        nb = (ni*N+nj)*N+nk;
        if (pf.wall[nb] || pf.state[nb] === 1) continue;
        var dng = pf.g[cur] + pf.w[nb];                                              // random per-cell entry cost; NO heuristic -> Dijkstra
        if (dng < pf.g[nb]) { pf.g[nb] = dng; pf.came[nb] = cur; pf.state[nb] = 2; searchHeapPush(nb, dng); }
      }
      pf.steps++;
      return;
    }
    if (algo === 'randomflood') {
      cur = searchHeapPop(); if (cur === -1) { pf.done = true; return; }
      if (pf.state[cur] === 1) return;
      pf.state[cur] = 1; pf.age[cur] = 0; pf.lastClosed = cur;
      if (cur === pf.end) { pf.reached = true; return; }
      var rci = (cur/(N*N))|0, rcr = cur-rci*N*N, rcj = (rcr/N)|0, rck = rcr-rcj*N;
      for (ti = 0; ti < 26; ti++) {
        off = SEARCH_NB[ti]; ni = rci+off[0]; nj = rcj+off[1]; nk = rck+off[2];
        if (nk<0||nk>=N) continue;
        if (ni<0) ni+=N; else if (ni>=N) ni-=N;
        if (nj<0) nj+=N; else if (nj>=N) nj-=N;
        nb = (ni*N+nj)*N+nk;
        if (pf.wall[nb] || pf.state[nb] === 1 || pf.state[nb] === 2) continue;       // first-touch only (a tree, no relaxation)
        pf.state[nb] = 2; pf.came[nb] = cur; searchHeapPush(nb, pf.w[nb]);            // priority = frozen noise, NOT accumulated cost -> organic lobes
      }
      pf.steps++;
      return;
    }
    if (algo === 'dfs') { if (pf.stackN === 0) { pf.done = true; return; } cur = pf.stack[--pf.stackN]; }
    else { if (pf.qHead >= pf.qTail) { pf.done = true; return; } cur = pf.queue[pf.qHead++]; }   // bfs + wavefront share the queue
    if (pf.state[cur] === 1) return;
    pf.state[cur] = 1; pf.age[cur] = 0; pf.lastClosed = cur;   // head of the traced route line
    if (cur === pf.end) { pf.reached = true; return; }
    var ci = (cur/(N*N))|0, cr = cur-ci*N*N, cj = (cr/N)|0, ck = cr-cj*N;
    if (algo === 'dfs') {                       // shuffle so DFS wanders instead of marching the fixed diagonal
      var q, rr, tmp;
      for (q = 25; q > 0; q--) { rr = (Math.random()*(q+1))|0; tmp = SEARCH_NB[q]; SEARCH_NB[q] = SEARCH_NB[rr]; SEARCH_NB[rr] = tmp; }
    }
    for (ti = 0; ti < 26; ti++) {
      off = SEARCH_NB[ti]; ni = ci+off[0]; nj = cj+off[1]; nk = ck+off[2];
      if (nk<0||nk>=N) continue;                                    // tube radius does not wrap
      if (ni<0) ni+=N; else if (ni>=N) ni-=N;                       // torus: major angle wraps
      if (nj<0) nj+=N; else if (nj>=N) nj-=N;                       // torus: tube angle wraps
      nb = (ni*N+nj)*N+nk;
      if (pf.wall[nb] || pf.state[nb] === 1) continue;
      if (pf.state[nb] === 0) { pf.state[nb] = 2; pf.came[nb] = cur;                 // bfs/wavefront enqueue, dfs push
        if (algo === 'dfs') pf.stack[pf.stackN++] = nb; else pf.queue[pf.qTail++] = nb; }
    }
    pf.steps++;
  }

  function searchTracePath() {
    if (!pf.reached) return;
    if (pf.algo === 'bidir' && pf.meet >= 0) {
      // came holds meet->...->start (start side). came2 holds meet->...->end (end
      // side, each child pointing toward end). Reverse the came2 chain into came so
      // came becomes one continuous chain end->...->meet->...->start that every
      // existing reconstruction walker (all read came from end) handles unchanged.
      var child = pf.meet, p = pf.came2[child], gb = 0;
      while (p >= 0 && gb < pf.total) { pf.came[p] = child; child = p; p = pf.came2[p]; gb++; }
      var tb = pf.came[pf.end], g2 = 0;
      while (tb >= 0 && tb !== pf.start && g2 < pf.total) { pf.state[tb] = 3; tb = pf.came[tb]; g2++; }
      return;
    }
    var node = pf.came[pf.end], guard = 0;
    while (node >= 0 && node !== pf.start && guard < pf.total) { pf.state[node] = 3; node = pf.came[node]; guard++; }
  }

  // Normal per-cell colour (the dev value -> colour/size in the shader): start/end
  // beacons, path, frontier, cooling visited, wall, cold scaffold.
  function cellDevAt(i) {
    if (i === pf.start) return 8.5;
    if (i === pf.end) return 9.5;
    var s = pf.state[i];
    if (s === 3) return 7.5;
    if (s === 2) return 6.0;                                                    // start frontier: hot red
    if (s === 4) return 5.6;                                                    // end frontier (bidirectional): hot orange, a distinct hue
    if (s === 1) { var d = 6.0 - pf.age[i] * 1.6; return d < 0.3 ? 0.3 : d; }   // start visited: a heat pulse cooling back to the visible baseline (0.3)
    if (s === 5) { var d2 = 5.4 - pf.age[i] * 1.6; return d2 < 0.3 ? 0.3 : d2; }// end visited (bidirectional): orange-biased cooling ramp
    return pf.wall[i] ? 0.6 : 0.3;
  }

  function searchWriteDev() {
    var i, s, nClosed = 0, nOpen = 0, nPath = 0;
    for (i = 0; i < pf.total; i++) {
      if (i !== pf.start && i !== pf.end) { s = pf.state[i]; if (s === 3) nPath++; else if (s === 2 || s === 4) nOpen++; else if (s === 1 || s === 5) nClosed++; }
      positions[i*4+3] = cellDevAt(i);
    }
    pf.cClosed = nClosed; pf.cOpen = nOpen; pf.cPath = nPath;   // live counts for the search HUD (visited / frontier / path)
  }

  // ===== LOOP-TRANSITION STYLES =====================================================
  // When a search settles we play a transition before the next run. Each style is a
  // function tx*(ft) with fade progress ft in 0..1 that writes the per-cell dev (and
  // optionally positions) for that frame, animating from the frozen search result.
  // Snapshots taken once at fade start: pf.baseDev (result colour per cell) and
  // pf.basePos (grid positions, so position-based styles can offset from them).
  // Conventions every style follows:
  //   - only animate "lit" cells: baseDev in [0.9, 8.0) (search heat + path);
  //     leave beacons (>=8) and walls/scaffold (<0.9) at baseDev.
  //   - settle lit cells to the cold scaffold (0.3) by ft=1 so the reset is seamless.
  //   - if you move positions, return them to basePos by ft=1 (the grid is rebuilt then).
  // Styles are cycled live by the HUD "Transition" button (SEARCH_TRANSITION).
  function txSnapshot() {
    var i, n = pf.total;
    if (!pf.baseDev || pf.baseDev.length !== n) pf.baseDev = new Float32Array(n);
    for (i = 0; i < n; i++) pf.baseDev[i] = cellDevAt(i);
    pf.basePos = positions.slice(0, n * 4);
  }
  function txHash(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }   // deterministic 0..1 per cell
  function txApply(mode, ft) {
    if (mode === 1) tx1_supernova(ft);
    else if (mode === 2) tx2_aurora(ft);
    else if (mode === 3) tx3_bloom(ft);
    else tx0_stardust(ft);
  }

  // 0 — Stardust: the path ignites into stars, scatters into a slowly swirling
  // cloud of drifting sparkle, then re-gathers to the grid as it winks out.
  function tx0_stardust(ft) {
    var i, bd, dev, h, h2, h3, loc, tw, n = pf.total;
    var amp = Math.sin(ft * 3.14159265) * 0.16;       // drift envelope: 0 at ft=0 and ft=1, peak ~0.5
    var ang = ft * 2.4;                                 // swirl angle grows with ft (cloud rotates as it disperses)
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var ig = ft < 0.18 ? (ft / 0.18) : 1;               // quick ignite ramp at the very start
    for (i = 0; i < n; i++) {
      bd = pf.baseDev[i];
      if (bd > 0.9 && bd < 8.0) {
        h = txHash(i);
        h2 = h * 197.31; h2 = h2 - Math.floor(h2);      // two more cheap decorrelated hashes
        h3 = h * 71.93;  h3 = h3 - Math.floor(h3);
        loc = (ft - h * 0.40) / 0.55; loc = loc < 0 ? 0 : (loc > 1 ? 1 : loc);
        var dx = h * 2 - 1, dy = h2 * 2 - 1, dz = h3 * 2 - 1;
        var sx = dx * ca - dz * sa, sz = dx * sa + dz * ca;   // swirl horizontal drift around the Y axis
        var spread = amp * (0.6 + 0.7 * h2);
        var bx = pf.basePos[i*4], by = pf.basePos[i*4+1], bz = pf.basePos[i*4+2];
        positions[i*4+0] = bx + sx * spread;
        positions[i*4+1] = by + dy * spread * 0.85 + amp * 0.05 * Math.sin(ft * 9 + h * 18.0);
        positions[i*4+2] = bz + sz * spread;
        tw = 0.5 + 0.5 * Math.sin(ft * 30 + h * 6.283 + h2 * 9.0);
        dev = (bd + (5.4 - bd) * ig) * (0.5 + 0.65 * tw);
        if (tw > 0.82) dev = dev + (6.1 - dev) * ((tw - 0.82) / 0.18);   // sparkle peak -> white-gold
        if (dev < 0.9) dev = 0.9;
        if (dev > 6.4) dev = 6.4;
        dev = dev + (0.3 - dev) * loc;
        if (ft >= 0.985) dev = 0.3;                      // hard guarantee dev=0.3 at the end
      } else { dev = bd; }
      positions[i*4+3] = dev;
    }
  }

  // 1 — Supernova: a blinding flash, a radial detonation with a bright shockwave
  //     shell, then an implosion back onto the lattice as the embers die.
  function tx1_supernova(ft) {
    // In-place "nova": the finished result flares, a bright wash sweeps once
    // around the ring, then everything settles to the baseline. No outward
    // scatter - the positions stay on the torus the whole time.
    var i, bd, dev, n = pf.total, TAU = Math.PI * 2;
    var flare = ft < 0.22 ? (ft / 0.22) : 1;                  // ramp to a bright flash
    var sweep = ft * TAU;                                     // a bright band travels once around the ring
    for (i = 0; i < n; i++) {
      bd = pf.baseDev[i];
      if (bd > 0.9 && bd < 8.0) {
        var ang = Math.atan2(pf.basePos[i*4+1] - 0.5, pf.basePos[i*4] - 0.5);
        var band = 0.5 + 0.5 * Math.cos(ang - sweep);         // 1 at the wavefront, 0 opposite
        band = band * band * band;                            // tighten the travelling band
        var s0 = 0.34 + txHash(i) * 0.34;                     // per-cell stagger: each ember starts dying at a different time in [0.34, 0.68]
        var settle = ft < s0 ? 0 : (ft - s0) / (1.0 - s0);    // so they don't all wink out together - the last few linger to the end
        dev = bd + (6.3 - bd) * flare * (0.4 + 0.6 * band);   // flare, brightest along the sweeping band
        dev = dev + (0.3 - dev) * settle;                     // settle back to the baseline
        if (dev < 0.3) dev = 0.3;
      } else dev = bd;
      positions[i*4+3] = dev;
    }
  }

  // 2 — Aurora: superposed travelling colour curtains wash across the field,
  //     shimmering where the wavefronts cross, then the whole sheet dims out.
  //     Colour-only (dev sweeps the heat tiers blue->red); positions untouched.
  function tx2_aurora(ft) {
    var i, bd, dev, h, w, lit, n = pf.total, N = pf.N, ci, cr, cj, ck;
    var t1 = ft * 5.6, t2 = ft * 7.9 + 1.7, t3 = ft * 3.3 + 4.2;
    var sh = ft * 41.0;   // fine high-frequency shimmer clock
    var win = ft < 0.62 ? 1.0 : (0.5 + 0.5 * Math.cos((ft - 0.62) / 0.38 * 3.14159265));   // hold vivid, then roll off to 0
    for (i = 0; i < n; i++) {
      bd = pf.baseDev[i];
      if (bd > 0.9 && bd < 8.0) {
        ci = (i / (N*N)) | 0; cr = i - ci*N*N; cj = (cr / N) | 0; ck = cr - cj*N;
        w  = Math.sin((ci * 0.27 + cj * 0.11) - t1);                  // three curtains, different headings/speeds
        w += Math.sin((cj * 0.21 - ck * 0.31) + t2) * 0.85;
        w += Math.sin((ci * 0.09 + ck * 0.24 + cj * 0.05) + t3) * 0.7;
        w = w / 2.55;
        h = txHash(i);
        w += 0.13 * Math.sin(sh + h * 6.2831853);                    // per-cell shimmer
        lit = 0.5 + 0.5 * w; lit = lit < 0 ? 0 : (lit > 1 ? 1 : lit);
        dev = 1.05 + lit * 5.35;          // ~blue .. ~red, capped below the route band
        dev = 0.3 + (dev - 0.3) * win;
      } else dev = bd;
      positions[i*4+3] = dev;
    }
  }

  // 3 — Bloom: a luminous spherical shockwave EXPANDS OUTWARD from the goal,
  // flaring each shell white-gold as the front sweeps it, leaving cooled scaffold
  // behind, with a faint pressure-bump on the crest; all settles to 0.3 by ft=1.
  function tx3_bloom(ft) {
    var i, bd, dev, n = pf.total, N = pf.N;
    var ei = (pf.end / (N*N)) | 0, er = pf.end - ei*N*N, ej = (er / N) | 0, ek = er - ej*N;
    var maxD = N * 1.732;                                   // ~69: far corner distance
    var front = (ft / 0.82) * (maxD + 14.0);               // front clears the lattice before ft=1
    var band = 8.5, inv = 1.0 / band;                      // shell half-thickness (grid units)
    var tail = ft < 0.7 ? 1.0 : 1.0 - (ft - 0.7) / 0.3;    // global fade over the last 30%
    var bump = (1.0 - Math.abs(ft - 0.5) * 2.0); if (bump < 0) bump = 0;   // pressure-bump, peaks mid-fade
    var ci, cr, cj, ck, dx, dy, dz, d, e, shell, hot, nb, px, py, pz, len;
    for (i = 0; i < n; i++) {
      bd = pf.baseDev[i];
      if (bd > 0.9 && bd < 8.0) {
        ci = (i / (N*N)) | 0; cr = i - ci*N*N; cj = (cr / N) | 0; ck = cr - cj*N;
        dx = ci - ei; dy = cj - ej; dz = ck - ek; d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        e = d - front;                                      // signed distance to crest (<0 swept, >0 unreached)
        if (e <= 0) { shell = -e * inv; if (shell > 1) shell = 1; dev = bd + (0.3 - bd) * shell; }   // swept -> cools
        else { shell = e * inv; hot = Math.exp(-shell * shell * 1.6); dev = bd + (6.3 - bd) * hot; }  // hot crest, holds far out
        dev = dev + (0.3 - dev) * (1.0 - tail);             // global dim -> 0.3 by ft=1
        positions[i*4+3] = dev;
        nb = bump * Math.exp(-(e * inv) * (e * inv) * 2.2) * (e > -band ? 1 : 0);   // pressure-bump on the crest
        if (nb > 0.01 && d > 0.0001) {
          px = pf.basePos[i*4] - 0.5; py = pf.basePos[i*4+1] - 0.5; pz = pf.basePos[i*4+2] - 0.5;
          len = Math.sqrt(px*px + py*py + pz*pz); if (len < 0.0001) len = 1;
          d = nb * (0.9 / N) * 0.06 / len;
          positions[i*4]   = pf.basePos[i*4]   + px * d * N;
          positions[i*4+1] = pf.basePos[i*4+1] + py * d * N;
          positions[i*4+2] = pf.basePos[i*4+2] + pz * d * N;
        } else { positions[i*4] = pf.basePos[i*4]; positions[i*4+1] = pf.basePos[i*4+1]; positions[i*4+2] = pf.basePos[i*4+2]; }
      } else { positions[i*4+3] = bd; }
    }
  }
  // ===== END LOOP-TRANSITION STYLES =================================================

  // Fresh maze + restart. Used by the loop so every cycle differs: the obstacle
  // layout is re-randomised, so even deterministic searches (greedy, BFS, A*)
  // trace a different route each loop instead of repeating the same one. (Retry
  // keeps the current maze; switching algorithm also keeps it, for comparison.)
  function searchRegen() { searchBuildLattice(); searchInit(pf.algo); }

  function searchTick(dt) {
    searchEnsure();
    if (!pf.built) return;
    var i;
    // Freeze the whole search while a scene/algo morph is in flight: the old
    // search must not keep stepping (its route line crawling) as it fades out,
    // and the new one must not start until the lattice has fully risen. Just
    // render the frozen state.
    if (pendingField !== null || morph < 0.9) {
      pf.ovActive = false;                                    // a scene/algo switch cancels any lingering route ghost
      searchWriteDev(); searchBuildActiveLine();
      if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, (pf.total + pf.lineCount) * 4);
      return;
    }
    if (!pf.reached && !pf.done) {
      pf.elapsed += dt;
      pf.stepAcc = (pf.stepAcc || 0) + SEARCH_STEPS;        // fractional speeds (< 1) crawl: one expansion every few frames
      var sps = Math.floor(pf.stepAcc); pf.stepAcc -= sps;
      for (i = 0; i < sps && !pf.reached; i++) searchStep();
    }
    if ((pf.reached || pf.done) && !pf.pathTraced) { searchTracePath(); pf.pathTraced = true; pf.holdT = 0; pf.phase = 'show'; pf.fadeT = 0; }
    for (i = 0; i < pf.total; i++) { var st = pf.state[i]; if (st === 1 || st === 5) pf.age[i] += dt; }   // both start-side + bidirectional end-side visited cells cool
    // Loop transition once the search settles: briefly hold + pulse the result
    // (show), then run the collapse-to-goal fade, then reset seamlessly into the
    // next run (everything has already faded to the scaffold, so no hard cut).
    if (pf.pathTraced) {
      pf.holdT += dt;
      if (searchLoop) {
        if (pf.holdT < SEARCH_SHOW) { pf.phase = 'show'; pf.fadeT = 0; }
        else if (pf.holdT < SEARCH_SHOW + SEARCH_FADE) {
          pf.phase = 'fade'; pf.fadeT = (pf.holdT - SEARCH_SHOW) / SEARCH_FADE;
          if (!pf.txSnapped) {
            txSnapshot(); pf.txSnapped = true;                       // freeze the finished look once, at fade start
            // Snapshot the full-bright route as a decaying "ghost": it keeps
            // glowing and dying for SEARCH_GHOST_TAIL seconds PAST the regen
            // below, so the last route dots are still fading as the next run lights up.
            pf.ovCount = pf.lineCount;
            if (pf.ovCount > 0) {
              if (!pf.ovPos || pf.ovPos.length < pf.ovCount * 4) pf.ovPos = new Float32Array((pf.ovCount + 64) * 4);
              pf.ovPos.set(positions.subarray(pf.total * 4, (pf.total + pf.ovCount) * 4));
              pf.ovActive = true; pf.ovT = 0;
            }
          }
        } else { searchRegen(); }   // fresh maze each loop -> no repeated paths
      } else { pf.phase = 'show'; pf.fadeT = 0; }   // not looping: hold the finished result, no fade/reset
    }
    // Region 1 (the lattice): the transition owns it during the fade; otherwise the live search repaints it.
    if (pf.phase === 'fade' && pf.baseDev) { txApply(SEARCH_TRANSITION, pf.fadeT); }
    else { searchWriteDev(); }
    // Region 2 (the route): normally a live tendril, but from fade-start it becomes a frozen
    // ghost that decays over SEARCH_FADE + SEARCH_GHOST_TAIL, carrying the dying route across
    // the regen so it overlaps the next run instead of vanishing in an instant.
    if (pf.ovActive) {
      pf.ovT += dt;
      var ghostLife = SEARCH_FADE + SEARCH_GHOST_TAIL;
      var gk = 1 - pf.ovT / ghostLife; if (gk < 0) gk = 0;
      var gi, gb, gd;
      for (gi = 0; gi < pf.ovCount; gi++) {
        gb = (pf.total + gi) * 4;
        positions[gb]   = pf.ovPos[gi*4];
        positions[gb+1] = pf.ovPos[gi*4+1];
        positions[gb+2] = pf.ovPos[gi*4+2];
        gd = pf.ovPos[gi*4+3] * gk; positions[gb+3] = gd > 0.3 ? gd : 0.3;   // route brightness eases to the baseline
      }
      pf.lineCount = pf.ovCount;
      if (pf.ovT >= ghostLife) pf.ovActive = false;
    } else {
      searchBuildActiveLine();
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, (pf.total + pf.lineCount) * 4);
  }

  // Trace a connected line (dense points along came-from segments) from the
  // current head (or the end, once reached) back to the start, into Region 2 of
  // the buffer (after the N^3 lattice nodes). This is the "route" the viewer
  // watches grow node-to-node; for DFS it extends and retracts as it backtracks.
  function searchBuildActiveLine() {
    var head = pf.reached ? pf.end : pf.lastClosed;
    var dev = pf.reached ? 7.7 : 7.2;
    if (pf.phase === 'fade') dev = Math.max(0.3, 7.7 - pf.fadeT * 7.4);   // the 3D route dots cool + dim with the collapse
    var K = 6, li = pf.total, cap = pf.total + EDGE_BUDGET - K, node = head, guard = 0;
    while (node >= 0 && guard < pf.total && li < cap) {
      var par = pf.came[node]; if (par < 0) break;
      var ax = positions[node*4], ay = positions[node*4+1], az = positions[node*4+2];
      var bx = positions[par*4], by = positions[par*4+1], bz = positions[par*4+2];
      var s; for (s = 0; s < K; s++) { var t = s / K;
        positions[li*4] = ax + t*(bx-ax); positions[li*4+1] = ay + t*(by-ay); positions[li*4+2] = az + t*(bz-az);
        positions[li*4+3] = dev; li++; }
      node = par; guard++;
    }
    pf.lineCount = li - pf.total;
  }

  function isSearchField(f) { return f === 'bfs' || f === 'bidir' || f === 'dijkstra' || f === 'wavefront' || f === 'randomflood' || f === 'dfs' || f === 'randomwalk'; }

  /* ---- Life scenes -------------------------------------------------------- */
  // Living things you watch on the orbit camera. Life joins the search/sort
  // family: geometry is held (no fly-through morph to the cube grid), the
  // camera orbits the form, and a per-scene tick repaints the shared positions
  // buffer every frame. loadField -> generateLife routes by id; the frame loop
  // calls lifeTick. The first Life scene is reaction-diffusion.
  var rd = null;                 // reaction-diffusion state
  var lifeDrawCount = 0;         // instances the active Life scene draws (set by its generator)

  function isLifeField(f) { return f === 'boids' || f === 'ocean' || f === 'sacred' || f === 'attractor'; }
  function generateLife(f) {
    if (f === 'boids') generateBoids();
    else if (f === 'ocean') generateOcean();
    else if (f === 'sacred') generateSacred();
    else if (f === 'attractor') generateAttractor();
  }
  function lifeTick(dt) {
    if (currentField === 'boids') boidsTick(dt);
    else if (currentField === 'ocean') oceanTick(dt);
    else if (currentField === 'sacred') sacredTick(dt);
    else if (currentField === 'attractor') attractorTick(dt);
  }

  // Reaction-diffusion (Gray-Scott) on a doubly-periodic field painted onto a
  // torus, the field's natural shape: no poles, a seamless wrap in both
  // directions, even spacing, and grid neighbours map to surface neighbours.
  // Two chemicals (U fed in, V the autocatalyst) diffuse at different rates;
  // from a smooth start, spots erupt, grow, and split like dividing cells. The
  // torus is baked once; only each point's 4th float (V -> dev) moves per frame.
  function generateRxnDiff() {
    var GW = 340, GH = 170, cells = GW * GH;          // GW = longitude, GH = latitude; 2:1 so the spots read round on the sphere. Dense grid -> tightly packed dots on a big sphere
    if (!rd || rd.cells !== cells) {
      rd = { GW: GW, GH: GH, cells: cells,
             U: new Float32Array(cells), V: new Float32Array(cells),
             U2: new Float32Array(cells), V2: new Float32Array(cells),
             Du: 0.16, Dv: 0.08, F: 0.016, k: 0.049, dt: 1.0, sub: 3 };   // "moving spots" regime: perpetual crawl/split/die. sub = pace: lower is slower + each spot lives longer
    }
    rd.U.fill(1.0); rd.V.fill(0.0);                   // U saturated, V empty: the resting skin
    var s, i, x, y, cx, cy, dx, dy, rad;
    for (s = 0; s < 26; s++) {                        // seed a scatter of round V blots for the pattern to grow from
      cx = (Math.random() * GW) | 0; cy = (Math.random() * GH) | 0;
      rad = 3 + (Math.random() * 4 | 0);
      for (dy = -rad; dy <= rad; dy++) for (dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        x = (cx + dx + GW) % GW; y = (cy + dy + GH) % GH; i = y * GW + x;
        rd.U[i] = 0.50; rd.V[i] = 0.25;
      }
    }
    ensurePointCapacity(cells);
    // Bake the sphere surface once (x = longitude, y = latitude), centred at
    // (0.5,0.5,0.5) to match the orbit camera. The Gray-Scott field still runs
    // on the wrapped GW x GH grid; only the render mapping is a sphere now (mild
    // pole convergence, like any globe texture).
    var R = 0.70, TAU = Math.PI * 2, PI = Math.PI, lon, clon, slon, phi, sphi, cphi;   // big sphere
    for (y = 0; y < GH; y++) {
      phi = PI * (y + 0.5) / GH;                      // polar angle: 0 = +Y pole, PI = -Y pole
      sphi = Math.sin(phi); cphi = Math.cos(phi);
      for (x = 0; x < GW; x++) {
        lon = TAU * (x + 0.5) / GW; clon = Math.cos(lon); slon = Math.sin(lon);
        i = y * GW + x;
        positions[i * 4 + 0] = 0.5 + R * sphi * clon;
        positions[i * 4 + 1] = 0.5 + R * cphi;
        positions[i * 4 + 2] = 0.5 + R * sphi * slon;
        positions[i * 4 + 3] = 0.3;                   // resting dev (dim skin) until the tick paints V
      }
    }
    lifeDrawCount = cells;
    rxnDiffTick(0);                                   // paint frame 0 colours + first upload
    srAz = 0.9; srEl = 0.55; srR = 2.2;   // big sphere: always reframe well zoomed-out on entry (not preserved across life-scene switches, since it is much larger than the others)
    srDragging = false;
    camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0;
    clumps.length = 0;
  }

  function rxnDiffTick(dt) {
    if (!rd) return;
    var transitioning = (pendingField !== null) || morph < 0.9;   // hold the sim during the entrance/exit reveal morph
    if (!transitioning) {
      var U = rd.U, V = rd.V, U2 = rd.U2, V2 = rd.V2;
      var GW = rd.GW, GH = rd.GH, Du = rd.Du, Dv = rd.Dv, F = rd.F, k = rd.k, h = rd.dt, st;
      var x, y, i, l, ri, up, dn, lapU, lapV, uvv, yC, yU, yD, tmp;
      for (st = 0; st < rd.sub; st++) {
        for (y = 0; y < GH; y++) {
          yC = y * GW; yU = ((y - 1 + GH) % GH) * GW; yD = ((y + 1) % GH) * GW;   // wrapped neighbour rows (toroidal)
          for (x = 0; x < GW; x++) {
            i = yC + x; l = yC + ((x - 1 + GW) % GW); ri = yC + ((x + 1) % GW);
            up = yU + x; dn = yD + x;
            lapU = U[l] + U[ri] + U[up] + U[dn] - 4 * U[i];   // 4-neighbour discrete Laplacian
            lapV = V[l] + V[ri] + V[up] + V[dn] - 4 * V[i];
            uvv = U[i] * V[i] * V[i];                          // the U + 2V -> 3V reaction
            U2[i] = U[i] + (Du * lapU - uvv + F * (1 - U[i])) * h;
            V2[i] = V[i] + (Dv * lapV + uvv - (F + k) * V[i]) * h;
          }
        }
        tmp = rd.U; rd.U = rd.U2; rd.U2 = tmp;                 // ping-pong the buffers
        tmp = rd.V; rd.V = rd.V2; rd.V2 = tmp;
        U = rd.U; V = rd.V; U2 = rd.U2; V2 = rd.V2;
      }
    }
    // Repaint: geometry is baked, only the 4th float (V concentration -> dev) moves.
    var Vf = rd.V, c = rd.cells, j, vv, dev;
    for (j = 0; j < c; j++) {
      vv = Vf[j]; if (vv < 0) vv = 0; else if (vv > 0.5) vv = 0.5;
      vv = vv * 2.0;                                           // V ~[0,0.5] -> [0,1]
      dev = (vv < 0.18) ? 0.3 : (1.0 + vv * 5.0);             // dim resting skin, else cyan->green->gold->red heat
      positions[j * 4 + 3] = dev;
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, c * 4);
  }

  /* ---- Life scene: Boids (murmuration) ----------------------------------- */
  // Emergent flocking from three local rules (separation, alignment, cohesion)
  // plus a wandering hawk, watched on the orbit camera. Each of BOID_N birds is
  // drawn as a short fading trail of points, so the cloud reads as a dense
  // living sky. Neighbours are found with a uniform grid (the same count-sort
  // scheme as computeHeat) so it stays real-time. Colour rides speed.
  var bo = null;
  var BOID_N = 10000, BOID_TRAIL = 4, BOID_MAXNB = 16;   // 10k birds x 4 trail points = 40k drawn pts; cap neighbours/boid (cost ~ N x neighbours)
  var BOID_SPAN = 0.34;                        // flock half-extent inside the unit cube (centred at 0.5)
  var BOID_VIEW = 0.045, BOID_SEP = 0.020;     // neighbour radius (= one grid cell) + the tighter separation radius
  var BOID_MAXSPD = 0.45, BOID_MINSPD = 0.15, BOID_MAXF = 2.6;
  var BOID_W_SEP = 1.7, BOID_W_ALI = 1.05, BOID_W_COH = 0.95, BOID_W_HAWK = 2.2, BOID_W_BND = 1.6;
  var _bf = [0, 0, 0];                          // scratch: one clamped steering force

  // Reynolds steering: desired = normalize(dir) * MAXSPD; force = clamp(desired - vel, MAXF).
  function boidSteer(dx, dy, dz, vx, vy, vz) {
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl > 1e-9) { var sc = BOID_MAXSPD / dl; dx *= sc; dy *= sc; dz *= sc; }
    var sx = dx - vx, sy = dy - vy, sz = dz - vz;
    var sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl > BOID_MAXF) { var c = BOID_MAXF / sl; sx *= c; sy *= c; sz *= c; }
    _bf[0] = sx; _bf[1] = sy; _bf[2] = sz;
  }

  function generateBoids() {
    var N = BOID_N, i, t;
    if (!bo || bo.N !== N) {
      bo = { N: N,
             px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
             vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
             trail: new Float32Array(N * BOID_TRAIL * 3), head: 0,
             gCounts: null, gCursor: null, gOrder: new Int32Array(N), ptCell: new Int32Array(N),
             hawk: [0.5, 0.5, 0.5], hawkPhase: 0 };
    }
    for (i = 0; i < N; i++) {                    // seed in a sphere about (0.5,0.5,0.5), gentle random velocity
      var u = 2 * Math.random() - 1, ph = 6.2831853 * Math.random(), rr = BOID_SPAN * Math.cbrt(Math.random());
      var ss = Math.sqrt(1 - u * u);
      var x = 0.5 + rr * ss * Math.cos(ph), y = 0.5 + rr * u, z = 0.5 + rr * ss * Math.sin(ph);
      bo.px[i] = x; bo.py[i] = y; bo.pz[i] = z;
      bo.vx[i] = (Math.random() - 0.5) * BOID_MINSPD;
      bo.vy[i] = (Math.random() - 0.5) * BOID_MINSPD;
      bo.vz[i] = (Math.random() - 0.5) * BOID_MINSPD;
      for (t = 0; t < BOID_TRAIL; t++) { var b3 = (i * BOID_TRAIL + t) * 3; bo.trail[b3] = x; bo.trail[b3 + 1] = y; bo.trail[b3 + 2] = z; }
    }
    bo.head = 0; bo.hawk[0] = 0.5; bo.hawk[1] = 0.5; bo.hawk[2] = 0.5; bo.hawkPhase = 6.2831853 * Math.random();
    ensurePointCapacity(N * BOID_TRAIL);
    lifeDrawCount = N * BOID_TRAIL;
    boidsTick(0);                                // paint frame 0 + first upload
    if (!isLifeField(currentField)) { srAz = 0.7; srEl = 0.42; srR = 1.1; }   // frame the flock close in on a fresh entry, so individual birds read
    srDragging = false; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
  }

  function boidsTick(dt) {
    if (!bo) return;
    var N = bo.N, i, j, k;
    var transitioning = (pendingField !== null) || morph < 0.9;   // hold the flock during the entrance/exit reveal morph
    if (!transitioning) {
      if (dt > 0.05) dt = 0.05;
      var px = bo.px, py = bo.py, pz = bo.pz, vx = bo.vx, vy = bo.vy, vz = bo.vz;
      var G = Math.max(1, Math.floor(1 / BOID_VIEW)), GG = G * G, cells = GG * G;
      if (!bo.gCounts || bo.gCounts.length !== cells + 1) { bo.gCounts = new Int32Array(cells + 1); bo.gCursor = new Int32Array(cells); }
      else bo.gCounts.fill(0);
      var gC = bo.gCounts, gO = bo.gOrder, gCur = bo.gCursor, ptCell = bo.ptCell, cx, cy, cz, cell;
      for (i = 0; i < N; i++) {                  // count-sort the boids into the uniform grid (mirrors computeHeat)
        cx = (px[i] * G) | 0; if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
        cy = (py[i] * G) | 0; if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
        cz = (pz[i] * G) | 0; if (cz < 0) cz = 0; else if (cz >= G) cz = G - 1;
        cell = cx + cy * G + cz * GG; ptCell[i] = cell; gC[cell + 1]++;
      }
      for (i = 0; i < cells; i++) gC[i + 1] += gC[i];
      for (i = 0; i < cells; i++) gCur[i] = gC[i];
      for (i = 0; i < N; i++) gO[gCur[ptCell[i]]++] = i;

      bo.hawkPhase += dt * 0.5;                  // the hawk wanders slowly through the flock
      var hx = 0.5 + 0.26 * Math.sin(bo.hawkPhase) * Math.cos(bo.hawkPhase * 0.7);
      var hy = 0.5 + 0.20 * Math.sin(bo.hawkPhase * 1.3);
      var hz = 0.5 + 0.26 * Math.cos(bo.hawkPhase) * Math.cos(bo.hawkPhase * 0.5);
      bo.hawk[0] = hx; bo.hawk[1] = hy; bo.hawk[2] = hz;

      var view2 = BOID_VIEW * BOID_VIEW, sep2 = BOID_SEP * BOID_SEP, hawkR = 0.10, hawkR2 = hawkR * hawkR;
      for (i = 0; i < N; i++) {
        var x = px[i], y = py[i], z = pz[i], mvx = vx[i], mvy = vy[i], mvz = vz[i];
        cx = (x * G) | 0; if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
        cy = (y * G) | 0; if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
        cz = (z * G) | 0; if (cz < 0) cz = 0; else if (cz >= G) cz = G - 1;
        var sepx = 0, sepy = 0, sepz = 0, alix = 0, aliy = 0, aliz = 0, cohx = 0, cohy = 0, cohz = 0, nn = 0;
        var dcz, dcy, dcx, nx, ny, nz, nc, gs, ge, ax, ay, az, d2;
        scan:
        for (dcz = -1; dcz <= 1; dcz++) { nz = cz + dcz; if (nz < 0 || nz >= G) continue;
          for (dcy = -1; dcy <= 1; dcy++) { ny = cy + dcy; if (ny < 0 || ny >= G) continue;
            for (dcx = -1; dcx <= 1; dcx++) { nx = cx + dcx; if (nx < 0 || nx >= G) continue;
              nc = nx + ny * G + nz * GG; gs = gC[nc]; ge = gC[nc + 1];
              for (k = gs; k < ge; k++) {
                j = gO[k]; if (j === i) continue;
                ax = px[j] - x; ay = py[j] - y; az = pz[j] - z; d2 = ax * ax + ay * ay + az * az;
                if (d2 >= view2 || d2 < 1e-12) continue;
                cohx += px[j]; cohy += py[j]; cohz += pz[j];
                alix += vx[j]; aliy += vy[j]; aliz += vz[j];
                nn++;
                if (d2 < sep2) { var invd = 1 / Math.sqrt(d2); sepx -= ax * invd; sepy -= ay * invd; sepz -= az * invd; }
                if (nn >= BOID_MAXNB) break scan;   // a capped neighbour sample flocks fine and bounds the per-boid cost
              }
            }
          }
        }
        var accx = 0, accy = 0, accz = 0;
        if (nn > 0) {
          boidSteer(cohx / nn - x, cohy / nn - y, cohz / nn - z, mvx, mvy, mvz);   // cohesion: toward the local centroid
          accx += _bf[0] * BOID_W_COH; accy += _bf[1] * BOID_W_COH; accz += _bf[2] * BOID_W_COH;
          boidSteer(alix, aliy, aliz, mvx, mvy, mvz);                               // alignment: match neighbour heading
          accx += _bf[0] * BOID_W_ALI; accy += _bf[1] * BOID_W_ALI; accz += _bf[2] * BOID_W_ALI;
          if (sepx !== 0 || sepy !== 0 || sepz !== 0) {                             // separation: avoid crowding
            boidSteer(sepx, sepy, sepz, mvx, mvy, mvz);
            accx += _bf[0] * BOID_W_SEP; accy += _bf[1] * BOID_W_SEP; accz += _bf[2] * BOID_W_SEP;
          }
        }
        var ahx = x - hx, ahy = y - hy, ahz = z - hz, hd2 = ahx * ahx + ahy * ahy + ahz * ahz;
        if (hd2 < hawkR2 && hd2 > 1e-12) {        // flee the hawk, stronger when closer
          boidSteer(ahx, ahy, ahz, mvx, mvy, mvz);
          var hw = BOID_W_HAWK * (1 - Math.sqrt(hd2) / hawkR);
          accx += _bf[0] * hw; accy += _bf[1] * hw; accz += _bf[2] * hw;
        }
        var qx = x - 0.5, qy = y - 0.5, qz = z - 0.5, br = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (br > BOID_SPAN) {                      // soft spring back toward centre so the flock never escapes the frame
          boidSteer(-qx, -qy, -qz, mvx, mvy, mvz);
          var bw = BOID_W_BND * (br - BOID_SPAN) / BOID_SPAN;
          accx += _bf[0] * bw; accy += _bf[1] * bw; accz += _bf[2] * bw;
        }
        mvx += accx * dt; mvy += accy * dt; mvz += accz * dt;
        var sp = Math.sqrt(mvx * mvx + mvy * mvy + mvz * mvz);
        if (sp > BOID_MAXSPD) { var c2 = BOID_MAXSPD / sp; mvx *= c2; mvy *= c2; mvz *= c2; }
        else if (sp < BOID_MINSPD && sp > 1e-6) { var c3 = BOID_MINSPD / sp; mvx *= c3; mvy *= c3; mvz *= c3; }
        vx[i] = mvx; vy[i] = mvy; vz[i] = mvz;
        px[i] = x + mvx * dt; py[i] = y + mvy * dt; pz[i] = z + mvz * dt;
      }
      bo.head = (bo.head + 1) % BOID_TRAIL;       // advance the trail ring, store the new head sample
      var head0 = bo.head, tr0 = bo.trail;
      for (i = 0; i < N; i++) { var hb = (i * BOID_TRAIL + head0) * 3; tr0[hb] = px[i]; tr0[hb + 1] = py[i]; tr0[hb + 2] = pz[i]; }
    }
    // Always write the draw points from the trail ring + colour by speed, then upload.
    var head = bo.head, TR = BOID_TRAIL, trail = bo.trail, vxa = bo.vx, vya = bo.vy, vza = bo.vz;
    var invSpd = 1 / (BOID_MAXSPD - BOID_MINSPD);
    for (i = 0; i < N; i++) {
      var spd = Math.sqrt(vxa[i] * vxa[i] + vya[i] * vya[i] + vza[i] * vza[i]);
      var spd01 = (spd - BOID_MINSPD) * invSpd; if (spd01 < 0) spd01 = 0; else if (spd01 > 1) spd01 = 1;
      var dev0 = 1.5 + 4.3 * spd01;               // cyan glide -> red hard turn (rides the held-colour branch)
      for (k = 0; k < TR; k++) {
        var slot = head - k; if (slot < 0) slot += TR;
        var sb = (i * TR + slot) * 3, pi = (i * TR + k) * 4;
        positions[pi] = trail[sb]; positions[pi + 1] = trail[sb + 1]; positions[pi + 2] = trail[sb + 2];
        positions[pi + 3] = dev0 * (1 - 0.11 * k);   // the tail dims + cools behind the head
      }
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, N * TR * 4);
  }

  /* ---- Life scene: Ocean (Gerstner waves) --------------------------------- */
  // A flat grid of ~32k points displaced each frame by four summed Gerstner waves.
  // Classic Gerstner gives realistic sharp crests and horizontal pinch towards
  // peaks: each component adds y = amp*cos(theta), x/z pinch = steepness*amp*sin(theta).
  // Four wave trains at varied angles, wavelengths and steepnesses combine to a
  // convincing rolling sea. Colour maps wave height to dev: deep troughs stay cool
  // cyan (dev ~1.6), crests flare bright (dev ~5.5).

  var oc = null;                                   // ocean state: grid + wave params
  var OCEAN_GX = 250, OCEAN_GZ = 250;             // grid dimensions: ~62k points (denser, for a much bigger sea)
  var OCEAN_SPAN = 1.90;                           // full side length of the sea in scene units (much larger)
  // Gerstner wave params: [dirX, dirZ, wavelength, steepness-Q, amplitude, speed]
  // Q is the sharpness factor (0 = sinusoid, 1 = max cusps). amp and wavelength
  // set the wave size; speed is angular frequency (rad/s at unit wavelength = 1).
  var OCEAN_WAVES = [
    [  0.80,  0.60, 0.53, 0.45, 0.057, 1.4 ],   // primary swell, slightly off-axis (broader + taller for the big sea)
    [ -0.55,  0.84, 0.31, 0.38, 0.033, 2.0 ],   // cross-swell from the left
    [  0.30, -0.95, 0.20, 0.28, 0.020, 2.8 ],   // short choppy cross-wave
    [  0.95,  0.31, 0.39, 0.40, 0.027, 1.7 ]    // second long swell
  ];
  var OCEAN_DEV_TROUGH = 1.6;   // dev colour at lowest point (deep cool blue-cyan)
  var OCEAN_DEV_CREST  = 5.5;   // dev colour at highest point (bright yellow-white foam)

  function generateOcean() {
    var GX = OCEAN_GX, GZ = OCEAN_GZ, N = GX * GZ;
    if (!oc || oc.N !== N) {
      oc = { N: N, GX: GX, GZ: GZ,
             baseX: new Float32Array(N), baseZ: new Float32Array(N),
             phase: new Float32Array(N),
             t: 0.0 };
    }
    oc.t = 0.0;
    var span = OCEAN_SPAN, half = span * 0.5;
    var i, gx, gz;
    for (gz = 0; gz < GZ; gz++) {
      for (gx = 0; gx < GX; gx++) {
        i = gz * GX + gx;
        oc.baseX[i] = 0.5 + (gx / (GX - 1) - 0.5) * span;   // centred at 0.5 in scene space
        oc.baseZ[i] = 0.5 + (gz / (GZ - 1) - 0.5) * span;
        oc.phase[i] = Math.random() * 0.04;                    // tiny per-point phase jitter for foam sparkle
      }
    }
    ensurePointCapacity(N);
    lifeDrawCount = N;
    oceanTick(0);                                 // paint frame 0 + first upload
    srAz = 1.1; srEl = 0.34; srR = 2.4;   // big sea: always reframe well zoomed-out, low vista angle (not preserved across life-scene switches, since it is much larger now)
    srDragging = false; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
  }

  function oceanTick(dt) {
    if (!oc) return;
    var transitioning = (pendingField !== null) || morph < 0.9;
    if (!transitioning) oc.t += dt;
    var t = oc.t, N = oc.N, GX = oc.GX;
    var bX = oc.baseX, bZ = oc.baseZ, ph = oc.phase;
    var W = OCEAN_WAVES, nW = W.length;
    var TWO_PI = 6.283185307;
    var devRange = OCEAN_DEV_CREST - OCEAN_DEV_TROUGH;
    // find y range this tick for normalised dev mapping
    var yMin = 1e9, yMax = -1e9, i, w, wx, wz, wl, Q, amp, spd, freq, theta, s, c;
    // pre-compute per-wave normed directions and frequencies
    var wd = new Array(nW);
    for (w = 0; w < nW; w++) {
      var ww = W[w];
      var len = Math.sqrt(ww[0]*ww[0] + ww[1]*ww[1]);
      wd[w] = [ww[0]/len, ww[1]/len, TWO_PI/ww[2], ww[3], ww[4], ww[5]];
    }
    // compute y values to get range (two-pass for adaptive colour)
    var yArr = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var bx = bX[i], bz = bZ[i], y = 0;
      for (w = 0; w < nW; w++) {
        var d = wd[w]; freq = d[2]; amp = d[4]; spd = d[5];
        theta = (d[0] * bx + d[1] * bz) * freq + t * spd + ph[i];
        y += amp * Math.cos(theta);
      }
      yArr[i] = y;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
    var ySpan = yMax - yMin; if (ySpan < 1e-6) ySpan = 1e-6;
    // write positions with x/z Gerstner horizontal pinch + dev colour
    var invYSpan = 1.0 / ySpan;
    for (i = 0; i < N; i++) {
      var bx = bX[i], bz = bZ[i], y = yArr[i];
      var px = bx, pz = bz;
      // Gerstner horizontal displacement: sum of -Q*amp*sin(theta)*dir per wave
      for (w = 0; w < nW; w++) {
        var d = wd[w]; freq = d[2]; Q = d[3]; amp = d[4]; spd = d[5];
        theta = (d[0] * bx + d[1] * bz) * freq + t * spd + ph[i];
        s = Math.sin(theta);
        px += Q * amp * d[0] * (-s);
        pz += Q * amp * d[1] * (-s);
      }
      var t01 = (y - yMin) * invYSpan;             // 0 = trough, 1 = crest
      var dev = OCEAN_DEV_TROUGH + t01 * devRange;
      var pi = i * 4;
      positions[pi]     = px;
      positions[pi + 1] = 0.5 + y;                 // vertical centre at y=0.5
      positions[pi + 2] = pz;
      positions[pi + 3] = dev;
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, N * 4);
  }

  // ---------------------------------------------------------------------------
  //  Physarum (slime mould) Life scene -- Jones 2010 agent-trail model
  //  Architecture mirrors generateRxnDiff / rxnDiffTick:
  //    * GW x GH wrapped (toroidal) 2-D grid -- 2:1 so sphere reads round
  //    * One point per grid cell, XYZ baked ONCE, only dev + tiny breath updated
  //    * SL_AGENT_COUNT agents sense/rotate/move/deposit into the trail
  //    * Trail diffuses (3x3 box blur) + decays each sub-step
  //    * Trail intensity -> dev: dim background, bright glowing veins
  // ---------------------------------------------------------------------------

  var SL_GW    = 300;      // grid width  (longitude, wraps)
  var SL_GH    = 150;      // grid height (latitude,  wraps)  -- 2:1 so sphere reads round
  var SL_AGENT_COUNT = 12000;   // 12k agents -- tuned for stable vein occupancy ~8-20%

  // Jones (2010) classic params -- tuned for a stable evolving network
  var SL_SA    = 0.5236;   // sensor angle ~30 deg
  var SL_SD    = 9.0;      // sensor distance (grid cells)
  var SL_RA    = 0.4363;   // rotation angle ~25 deg per step
  var SL_SS    = 1.2;      // step size (grid cells per sub-step)
  var SL_DEP   = 5.0;      // trail deposit per agent per step
  var SL_DEC   = 0.91;     // trail decay per sub-step
  var SL_SUB   = 2;        // sub-steps per frame tick (2 is enough for stable veins)
  var SL_R     = 0.40;     // sphere radius (centred at 0.5,0.5,0.5)

  var SL_DEV_LO = 0.3;     // resting/empty cell dev (dim)
  var SL_DEV_HI = 5.5;     // dense-vein dev (bright cyan->gold->red)

  // Module-scope state object (null until generateSlime is called)
  var slSt = null;

  function generateSlime() {
    var GW = SL_GW, GH = SL_GH;
    var cells = GW * GH;
    var N = SL_AGENT_COUNT;

    // Allocate state (or reuse on re-entry)
    if (!slSt || slSt.cells !== cells || slSt.N !== N) {
      slSt = {
        N: N, GW: GW, GH: GH, cells: cells,
        ax:     new Float32Array(N),
        ay:     new Float32Array(N),
        ah:     new Float32Array(N),
        trail:  new Float32Array(cells),
        trail2: new Float32Array(cells),
        // Cached sphere geometry: base XYZ + outward unit normal XYZ + per-cell phase
        bx: new Float32Array(cells), by: new Float32Array(cells), bz: new Float32Array(cells),
        nx: new Float32Array(cells), ny: new Float32Array(cells), nz: new Float32Array(cells),
        phase: new Float32Array(cells),
        // Precomputed row/col wrap LUTs for the diffuse step
        rowPrev: new Int32Array(GH), rowNext: new Int32Array(GH),
        colPrev: new Int32Array(GW), colNext: new Int32Array(GW),
        simTime: 0.0
      };
      // Fill wrap LUTs once
      var r, c;
      for (r = 0; r < GH; r++) {
        slSt.rowPrev[r] = ((r - 1 + GH) % GH) * GW;
        slSt.rowNext[r] = ((r + 1) % GH) * GW;
      }
      for (c = 0; c < GW; c++) {
        slSt.colPrev[c] = (c - 1 + GW) % GW;
        slSt.colNext[c] = (c + 1) % GW;
      }
    } else {
      slSt.simTime = 0.0;
    }

    // Reset trail
    slSt.trail.fill(0.0);
    slSt.trail2.fill(0.0);

    // Seed agents uniformly across the grid with random headings
    var i, TAU = 6.28318530718;
    for (i = 0; i < N; i++) {
      slSt.ax[i] = Math.random() * GW;
      slSt.ay[i] = Math.random() * GH;
      slSt.ah[i] = TAU * Math.random();
    }

    // --- Bake sphere geometry + cached normals + per-cell phase offsets ---
    ensurePointCapacity(cells);
    var R = SL_R, PI = Math.PI;
    var lon, phi, clon, slon, cphi, sphi, x, y, idx;
    for (y = 0; y < GH; y++) {
      phi  = PI * (y + 0.5) / GH;
      sphi = Math.sin(phi);
      cphi = Math.cos(phi);
      for (x = 0; x < GW; x++) {
        lon  = TAU * (x + 0.5) / GW;
        clon = Math.cos(lon);
        slon = Math.sin(lon);
        idx  = y * GW + x;
        slSt.nx[idx] = sphi * clon;
        slSt.ny[idx] = cphi;
        slSt.nz[idx] = sphi * slon;
        slSt.bx[idx] = 0.5 + R * sphi * clon;
        slSt.by[idx] = 0.5 + R * cphi;
        slSt.bz[idx] = 0.5 + R * sphi * slon;
        slSt.phase[idx] = x * 0.031 + y * 0.047;
        positions[idx * 4    ] = slSt.bx[idx];
        positions[idx * 4 + 1] = slSt.by[idx];
        positions[idx * 4 + 2] = slSt.bz[idx];
        positions[idx * 4 + 3] = SL_DEV_LO;
      }
    }
    lifeDrawCount = cells;

    slimeTick(0);
    if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.50; srR = 1.6; }
    srDragging = false; camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
  }

  function slimeTick(dt) {
    if (!slSt) return;
    var transitioning = (pendingField !== null) || morph < 0.9;

    if (!transitioning) {
      var GW = slSt.GW, GH = slSt.GH;
      var N  = slSt.N;
      var ax = slSt.ax, ay = slSt.ay, ah = slSt.ah;
      var trail = slSt.trail, trail2 = slSt.trail2;
      var rowPrev = slSt.rowPrev, rowNext = slSt.rowNext;
      var colPrev = slSt.colPrev, colNext = slSt.colNext;

      var SA = SL_SA, SD = SL_SD, RA = SL_RA, SS = SL_SS, DEP = SL_DEP, DEC = SL_DEC;
      var ONE_OVER_9_DEC = DEC / 9.0;   // precomputed blend factor for diffuse
      var st, i, x, y, rowC, tmp;

      for (st = 0; st < SL_SUB; st++) {
        // --- Agent sense / rotate / move / deposit ---
        for (i = 0; i < N; i++) {
          var px = ax[i], py = ay[i], h = ah[i];

          // Sensor positions
          var fsx = px + SD * Math.cos(h),      fsy = py + SD * Math.sin(h);
          var lsx = px + SD * Math.cos(h + SA), lsy = py + SD * Math.sin(h + SA);
          var rsx = px + SD * Math.cos(h - SA), rsy = py + SD * Math.sin(h - SA);

          // Wrapped nearest-neighbour sample (mod for wrap; fast for small positive coords)
          var fxi = ((fsx | 0) % GW + GW) % GW, fyi = ((fsy | 0) % GH + GH) % GH;
          var lxi = ((lsx | 0) % GW + GW) % GW, lyi = ((lsy | 0) % GH + GH) % GH;
          var rxi = ((rsx | 0) % GW + GW) % GW, ryi = ((rsy | 0) % GH + GH) % GH;

          var tf = trail[fyi * GW + fxi];
          var tl = trail[lyi * GW + lxi];
          var tr = trail[ryi * GW + rxi];

          if (tf >= tl && tf >= tr) {
            // straight
          } else if (tl > tr) {
            h += RA;
          } else if (tr > tl) {
            h -= RA;
          } else {
            h += (Math.random() < 0.5 ? RA : -RA);
          }

          // Move forward + toroidal wrap
          var nx = ((px + SS * Math.cos(h)) % GW + GW) % GW;
          var ny = ((py + SS * Math.sin(h)) % GH + GH) % GH;
          ax[i] = nx; ay[i] = ny; ah[i] = h;

          // Deposit
          trail[((ny | 0) % GH) * GW + ((nx | 0) % GW)] += DEP;
        }

        // --- Diffuse (3x3 box blur) + decay using precomputed wrap LUTs ---
        for (y = 0; y < GH; y++) {
          rowC = y * GW;
          var rP = rowPrev[y], rN = rowNext[y];
          for (x = 0; x < GW; x++) {
            var cP = colPrev[x], cN = colNext[x];
            trail2[rowC + x] = (
              trail[rP + cP] + trail[rP + x ] + trail[rP + cN] +
              trail[rowC + cP] + trail[rowC + x ] + trail[rowC + cN] +
              trail[rN + cP] + trail[rN + x ] + trail[rN + cN]
            ) * ONE_OVER_9_DEC;
          }
        }

        // Ping-pong buffers
        tmp = slSt.trail; slSt.trail = slSt.trail2; slSt.trail2 = tmp;
        trail = slSt.trail; trail2 = slSt.trail2;
      }
    }

    // --- Update dev + radial breath (precomputed normals, one Math.sin per cell) ---
    var cells   = slSt.cells;
    var trailF  = slSt.trail;
    var devLo   = SL_DEV_LO, devHi = SL_DEV_HI;
    var bx = slSt.bx, by = slSt.by, bz = slSt.bz;
    var snx = slSt.nx, sny = slSt.ny, snz = slSt.nz;
    var ph = slSt.phase;

    // Normalize trail
    var tMax = 0.01, ci;
    for (ci = 0; ci < cells; ci++) { if (trailF[ci] > tMax) tMax = trailF[ci]; }
    var invMax = 1.0 / tMax;

    var timeOff = slSt.simTime;
    var tArg = timeOff * 1.8;  // radians/sec rate
    var breathAmp = 0.015;

    var t01, dev, breathe;
    for (ci = 0; ci < cells; ci++) {
      t01 = trailF[ci] * invMax;
      if (t01 < 0) t01 = 0; else if (t01 > 1) t01 = 1;
      dev = (t01 < 0.05) ? devLo : (devLo + t01 * (devHi - devLo));
      positions[ci * 4 + 3] = dev;
      breathe = breathAmp * Math.sin(ph[ci] + tArg);
      positions[ci * 4    ] = bx[ci] + breathe * snx[ci];
      positions[ci * 4 + 1] = by[ci] + breathe * sny[ci];
      positions[ci * 4 + 2] = bz[ci] + breathe * snz[ci];
    }
    slSt.simTime = timeOff + (dt > 0 ? dt : 0.016667);

    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }


  /* ---- Life scene: 3D Game of Life (gol3d) --------------------------------- */
  // B6/S567 (Bays' rule) on a 22^3 grid so cells are chunky and visible.
  // Each live cell is rendered as a cluster of 8 jittered points (fat glowing blob).
  // World scale 0.60 spaces cells generously so you can track individual birth/death.
  // Cell age drives dev: newborn = cyan (1.0), elder survivor = red (6.0).
  // Reseeds when population collapses (<300) or saturates (>75% of grid).

  var GOL_G            = 22;   // grid side; 22^3 = 10,648 cells
  var GOL_PTS_PER_CELL = 8;    // jitter cluster per live cell -> fat blobs
  var GOL_JSCALE       = 0.014;// cluster jitter radius in world units
  var GOL_WORLD_SCALE  = 0.40; // grid half-extent; with jitter max diag = 2*(0.40+0.014)*sqrt(3) ~ 1.435 < 1.46
  var GOL_MAXN         = 92000;// hard cap: 10648 cells * 8 pts + headroom
  var GOL_INTERVAL     = 0.20; // seconds between CA steps (readable 5 Hz pulse)
  var GOL_MAX_AGE      = 20;   // age at which dev saturates to red
  var GOL_MIN_POP      = 300;  // reseed when population falls below this
  var GOL_MAX_FILL_FRAC = 0.75;// reseed when live fraction exceeds this
  var GOL_SEED_FRAC    = 0.30; // initial fill fraction inside seed sphere

  var GOL_CELLS = GOL_G * GOL_G * GOL_G;  // 10,648
  var GOL_SEED_R = 9;          // seed blob radius (in grid cells)

  var gol_         = null;     // mutable state, null until first generate()
  var GOL_rngState = 87654321;

  // Park-Miller LCG
  function golRng() {
    GOL_rngState = (Math.imul(GOL_rngState, 16807) >>> 0) % 2147483647;
    if (GOL_rngState === 0) GOL_rngState = 1;
    return (GOL_rngState - 1) / 2147483646;
  }
  function golRngSeed(s) {
    GOL_rngState = ((s | 0) >>> 0) % 2147483647;
    if (GOL_rngState === 0) GOL_rngState = 1;
  }

  function golIdx(x, y, z) { return x + GOL_G * (y + GOL_G * z); }

  // Seed a sphere of radius GOL_SEED_R at the grid centre
  function golSeedBlob(grid, seed) {
    golRngSeed(seed);
    var cx = (GOL_G / 2) | 0, cy = cx, cz = cx;
    var r = GOL_SEED_R, r2 = r * r;
    var x, y, z, dx, dy, dz;
    for (z = cz - r; z <= cz + r; z++) {
      for (y = cy - r; y <= cy + r; y++) {
        for (x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || z < 0 || x >= GOL_G || y >= GOL_G || z >= GOL_G) continue;
          dx = x - cx; dy = y - cy; dz = z - cz;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            grid[golIdx(x, y, z)] = (golRng() < GOL_SEED_FRAC) ? 1 : 0;
          }
        }
      }
    }
  }

  // Write live cells to positions[] as fat jitter clusters; returns point count
  function golWritePositions(grid, age) {
    var G = GOL_G, G2 = G * G;
    var invG1 = 1.0 / (G - 1);
    var scale = 2.0 * GOL_WORLD_SCALE;
    var JSCALE = GOL_JSCALE;
    var ppc = GOL_PTS_PER_CELL;
    var p = 0, n = GOL_MAXN;
    var x, y, z, idx, a, dev, lx, ly, lz, j;

    for (idx = 0; idx < GOL_CELLS; idx++) {
      if (!grid[idx]) continue;
      x = idx % G;
      y = ((idx / G) | 0) % G;
      z = (idx / G2) | 0;

      // Map to world space centred at (0.5, 0.5, 0.5)
      lx = (x * invG1 - 0.5) * scale + 0.5;
      ly = (y * invG1 - 0.5) * scale + 0.5;
      lz = (z * invG1 - 0.5) * scale + 0.5;

      // Age -> dev: newborn cyan (1.0), long survivor red (6.0)
      a = age[idx];
      if (a <= 0) a = 0;
      if (a >= GOL_MAX_AGE) a = GOL_MAX_AGE;
      dev = 1.0 + (a / GOL_MAX_AGE) * 5.0;

      // Drop to 1 pt/cell if near capacity, to never overflow
      var activePpc = (p + (ppc + 2) * 4 <= n) ? ppc : 1;

      // First point at exact cell centre, rest jittered into a small ball
      for (j = 0; j < activePpc; j++) {
        if (p + 4 > n) break;
        var jitter = (j === 0) ? 0.0 : JSCALE;
        positions[p    ] = lx + (golRng() - 0.5) * 2.0 * jitter;
        positions[p + 1] = ly + (golRng() - 0.5) * 2.0 * jitter;
        positions[p + 2] = lz + (golRng() - 0.5) * 2.0 * jitter;
        positions[p + 3] = dev;
        p += 4;
      }
    }
    return p / 4;
  }

  // B6/S567 Moore-26 step; returns new population count
  function golStep(grid, gridNext, age, ageNext) {
    var G = GOL_G, G2 = G * G;
    var x, y, z, nx, ny, nz, dx, dy, dz, idx, nb, pop;
    pop = 0;
    for (z = 0; z < G; z++) {
      for (y = 0; y < G; y++) {
        for (x = 0; x < G; x++) {
          nb = 0;
          for (dz = -1; dz <= 1; dz++) {
            nz = z + dz; if (nz < 0 || nz >= G) continue;
            for (dy = -1; dy <= 1; dy++) {
              ny = y + dy; if (ny < 0 || ny >= G) continue;
              for (dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                nx = x + dx; if (nx < 0 || nx >= G) continue;
                if (grid[golIdx(nx, ny, nz)]) nb++;
              }
            }
          }
          idx = golIdx(x, y, z);
          var alive = grid[idx];
          var born = (!alive && nb === 6);
          var survives = (alive && (nb === 5 || nb === 6 || nb === 7));
          if (born || survives) {
            gridNext[idx] = 1;
            ageNext[idx]  = born ? 0 : (age[idx] + 1);
            pop++;
          } else {
            gridNext[idx] = 0;
            ageNext[idx]  = 0;
          }
        }
      }
    }
    return pop;
  }

  // ---- generateGol3d -------------------------------------------------------
  function generateGol3d() {
    ensurePointCapacity(GOL_MAXN);

    // Allocate once, reset on re-enter
    if (!gol_) {
      gol_ = {
        grid:     new Uint8Array(GOL_CELLS),
        gridNext: new Uint8Array(GOL_CELLS),
        age:      new Uint16Array(GOL_CELLS),
        ageNext:  new Uint16Array(GOL_CELLS),
        pop:      0,
        acc:      0,
        seed:     (Date.now() & 0x7fffffff) | 1
      };
    } else {
      gol_.grid.fill(0);
      gol_.gridNext.fill(0);
      gol_.age.fill(0);
      gol_.ageNext.fill(0);
      gol_.acc = 0;
    }

    golSeedBlob(gol_.grid, gol_.seed);

    var pop = 0, i;
    for (i = 0; i < GOL_CELLS; i++) { if (gol_.grid[i]) pop++; }
    gol_.pop = pop;

    lifeDrawCount = golWritePositions(gol_.grid, gol_.age);

    gol3dTick(0);
    if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.55; srR = 1.5; }
    srDragging = false; camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
  }

  // ---- gol3dTick -----------------------------------------------------------
  function gol3dTick(dt) {
    var transitioning = (pendingField !== null) || morph < 0.9;
    if (!transitioning) {
      if (!gol_) return;

      gol_.acc += dt;
      var stepped = false;
      while (gol_.acc >= GOL_INTERVAL) {
        gol_.acc -= GOL_INTERVAL;

        // Reseed if population collapses or saturates
        var needReseed = (gol_.pop < GOL_MIN_POP) ||
                         (gol_.pop > GOL_MAX_FILL_FRAC * GOL_CELLS);
        if (needReseed) {
          gol_.grid.fill(0);
          gol_.gridNext.fill(0);
          gol_.age.fill(0);
          gol_.ageNext.fill(0);
          gol_.seed = (gol_.seed * 1664525 + 1013904223) & 0x7fffffff;
          golSeedBlob(gol_.grid, gol_.seed);
          var pop0 = 0, k;
          for (k = 0; k < GOL_CELLS; k++) { if (gol_.grid[k]) pop0++; }
          gol_.pop = pop0;
          gol_.acc = 0;
          stepped = true;
          break;
        }

        // Advance one CA step
        var newPop = golStep(gol_.grid, gol_.gridNext, gol_.age, gol_.ageNext);
        var tmpG = gol_.grid;   gol_.grid     = gol_.gridNext;   gol_.gridNext = tmpG;
        var tmpA = gol_.age;    gol_.age      = gol_.ageNext;    gol_.ageNext  = tmpA;
        gol_.gridNext.fill(0);
        gol_.ageNext.fill(0);
        gol_.pop = newPop;
        stepped = true;
      }

      if (stepped || dt === 0) {
        lifeDrawCount = golWritePositions(gol_.grid, gol_.age);
      }
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  // ============================================================
  // SATURN — ringed planet scene for random-galaxy.js
  // Field id: "saturn"
  // N = 220000 points (70k planet + 140k rings + 4x2500 moons)
  // All code is ES5 / var-only to match the host IIFE.
  // Planet + moon base offsets are baked once at generate; the tick only
  // rotates/orbits them (the same cache trick the rings use) — no per-frame
  // RNG / Box-Muller replay, so it stays cheap at 60fps.
  // ============================================================

  var SAT_N_PLANET   = 70000;
  var SAT_N_RINGS    = 140000;
  var SAT_N_MOON     = 2500;   // per moon
  var SAT_N_MOONS    = 4;
  var SAT_N_TOTAL    = SAT_N_PLANET + SAT_N_RINGS + SAT_N_MOONS * SAT_N_MOON;

  // Axial tilt of Saturn: ~26.7 deg about X axis.
  var SAT_TILT       = 26.7 * Math.PI / 180;
  var SAT_COS_TILT   = Math.cos(SAT_TILT);
  var SAT_SIN_TILT   = Math.sin(SAT_TILT);

  // Planet geometry (local)
  var SAT_PLANET_R   = 0.13;   // equatorial radius
  var SAT_OBLATE     = 0.90;   // Y-axis scale factor (oblate)

  // Ring geometry (local, pre-tilt)
  var SAT_RING_INNER = 0.18;
  var SAT_RING_OUTER = 0.40;
  var SAT_CASSINI_LO = 0.285;
  var SAT_CASSINI_HI = 0.315;
  var SAT_RING_THICK = 0.004;  // half-thickness in Y

  // Moon orbits (local radius, initial phase, unused speed scale, dev colour, name)
  var SAT_MOON_ORBITS = [
      { r: 0.30, phase: 0.00, spd: 1.20, dev: 2.5, name: "Mimas"    },
      { r: 0.33, phase: 1.57, spd: 0.95, dev: 1.8, name: "Enceladus"},
      { r: 0.37, phase: 3.14, spd: 0.70, dev: 3.8, name: "Tethys"   },
      { r: 0.42, phase: 4.71, spd: 0.50, dev: 1.2, name: "Dione"    }
  ];
  var SAT_MOON_R     = 0.012;  // moon sphere radius (local)

  var SAT_PLANET_ROT_SPD = 0.08;  // planet spin (rad/s)
  // Keplerian ring: omega = K * r^(-1.5), K chosen so inner edge ~1.2 rad/s
  var SAT_RING_K     = SAT_RING_INNER * Math.sqrt(SAT_RING_INNER) * 1.2;

  // ---- module-scope state ------------------------------------
  var SAT_t           = 0;     // elapsed seconds
  var SAT_planet_ang  = 0;     // planet spin angle (radians)
  var SAT_ring_ang0   = null;  // [SAT_N_RINGS] initial angle in equatorial plane
  var SAT_ring_r      = null;  // [SAT_N_RINGS] radius of each ring particle
  var SAT_ring_y0     = null;  // [SAT_N_RINGS] Y offset (thickness)
  var SAT_planet_base = null;  // [SAT_N_PLANET*3] baked planet local offsets
  var SAT_moon_base   = null;  // [SAT_N_MOONS*SAT_N_MOON*3] baked offset from each moon centre

  // ---- tiny seeded LCG RNG (returns a closure) ---------------
  function satRNG(seed) {
      var s = (seed | 0) + 1;
      return function () {
          s = (Math.imul(s, 1664525) + 1013904223) | 0;
          return ((s >>> 1) & 0x7FFFFFFF) / 0x7FFFFFFF;
      };
  }

  // ---- tilt helper: rotate local (lx,ly,lz) by axial tilt (X) and centre ----
  function satToWorld(lx, ly, lz, out) {
      var wy = ly * SAT_COS_TILT - lz * SAT_SIN_TILT;
      var wz = ly * SAT_SIN_TILT + lz * SAT_COS_TILT;
      out[0] = lx + 0.5;
      out[1] = wy + 0.5;
      out[2] = wz + 0.5;
  }

  // ---- planet latitude -> dev (subtle cloud bands) -----------
  function satPlanetDev(lat) {
      var base = 3.5 - 1.5 * Math.abs(lat) / (Math.PI / 2); // golden-tan equator -> cooler poles
      var band = 0.5 * Math.sin(lat * 8.0);                 // soft horizontal banding
      return Math.max(0.3, Math.min(6.0, base + band));
  }

  // ---- ring radius -> dev (inner gold -> outer cyan) ---------
  function satRingDev(r) {
      var t = (r - SAT_RING_INNER) / (SAT_RING_OUTER - SAT_RING_INNER);
      t = Math.max(0, Math.min(1, t));
      return 3.5 - 2.3 * t;
  }

  // ---- Box-Muller Gaussian from LCG rng ----------------------
  function satGaussian(rng) {
      var u1, u2;
      do { u1 = rng(); } while (u1 < 1e-10);
      u2 = rng();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ---- generateSaturn ----------------------------------------
  function generateSaturn() {
      ensurePointCapacity(SAT_N_TOTAL);

      var rng = satRNG(0xBA5EBA11);
      var tmp = [0, 0, 0];

      // -- PLANET: bake base offsets once, write the initial frame --
      SAT_planet_base = new Float32Array(SAT_N_PLANET * 3);
      var pi = 0;
      while (pi < SAT_N_PLANET) {
          var gx = satGaussian(rng), gy = satGaussian(rng), gz = satGaussian(rng);
          var gr = Math.sqrt(gx*gx + gy*gy + gz*gz);
          if (gr < 1e-9) { continue; }
          var nx = gx/gr, ny = gy/gr, nz = gz/gr;
          var rad = SAT_PLANET_R * Math.pow(rng(), 1.0/3.0); // uniform volume
          var lx = nx * rad, ly = ny * rad * SAT_OBLATE, lz = nz * rad;
          var lat = Math.asin(Math.max(-1, Math.min(1, ny)));
          var s3 = pi * 3;
          SAT_planet_base[s3+0] = lx; SAT_planet_base[s3+1] = ly; SAT_planet_base[s3+2] = lz;
          satToWorld(lx, ly, lz, tmp);
          var bp = pi * 4;
          positions[bp+0] = tmp[0]; positions[bp+1] = tmp[1]; positions[bp+2] = tmp[2];
          positions[bp+3] = satPlanetDev(lat);
          pi++;
      }

      // -- RINGS: bake radius/angle/thickness, write the initial frame --
      SAT_ring_ang0 = new Float32Array(SAT_N_RINGS);
      SAT_ring_r    = new Float32Array(SAT_N_RINGS);
      SAT_ring_y0   = new Float32Array(SAT_N_RINGS);
      var ringBaseIdx = SAT_N_PLANET;
      var ri = 0, maxAtt = SAT_N_RINGS * 10, att = 0;
      while (ri < SAT_N_RINGS && att < maxAtt) {
          att++;
          // density prop 1/r via inverse-CDF: r = inner * exp(u * ln(outer/inner))
          var r = SAT_RING_INNER * Math.exp(rng() * Math.log(SAT_RING_OUTER / SAT_RING_INNER));
          if (r >= SAT_CASSINI_LO && r <= SAT_CASSINI_HI) { continue; } // Cassini gap
          if (r > SAT_RING_OUTER * 0.85) {                              // taper the outer edge
              var falloff = 1.0 - (r - SAT_RING_OUTER * 0.85) / (SAT_RING_OUTER * 0.15);
              if (rng() > falloff) { continue; }
          }
          var ang = rng() * 2 * Math.PI;
          var ythick = (rng() * 2 - 1) * SAT_RING_THICK;
          SAT_ring_ang0[ri] = ang; SAT_ring_r[ri] = r; SAT_ring_y0[ri] = ythick;
          satToWorld(r * Math.cos(ang), ythick, r * Math.sin(ang), tmp);
          var b2 = (ringBaseIdx + ri) * 4;
          positions[b2+0] = tmp[0]; positions[b2+1] = tmp[1]; positions[b2+2] = tmp[2];
          positions[b2+3] = satRingDev(r);
          ri++;
      }
      while (ri < SAT_N_RINGS) { // fill any rejection shortfall from the inner band
          var r3 = SAT_RING_INNER + rng() * (SAT_CASSINI_LO - SAT_RING_INNER - 0.01);
          var ang3 = rng() * 2 * Math.PI;
          SAT_ring_ang0[ri] = ang3; SAT_ring_r[ri] = r3; SAT_ring_y0[ri] = 0;
          satToWorld(r3 * Math.cos(ang3), 0, r3 * Math.sin(ang3), tmp);
          var b3 = (ringBaseIdx + ri) * 4;
          positions[b3+0] = tmp[0]; positions[b3+1] = tmp[1]; positions[b3+2] = tmp[2];
          positions[b3+3] = satRingDev(r3);
          ri++;
      }

      // -- MOONS: bake offset from each moon centre, write the initial frame --
      SAT_moon_base = new Float32Array(SAT_N_MOONS * SAT_N_MOON * 3);
      var moonBaseIdx = SAT_N_PLANET + SAT_N_RINGS;
      for (var m = 0; m < SAT_N_MOONS; m++) {
          var orbit = SAT_MOON_ORBITS[m];
          var moonCx = orbit.r * Math.cos(orbit.phase);
          var moonCz = orbit.r * Math.sin(orbit.phase);
          var mRNG = satRNG(0xFACE0000 + m);
          for (var mp = 0; mp < SAT_N_MOON; mp++) {
              var mgx = satGaussian(mRNG), mgy = satGaussian(mRNG), mgz = satGaussian(mRNG);
              var mgr = Math.sqrt(mgx*mgx + mgy*mgy + mgz*mgz);
              if (mgr < 1e-9) { mgr = 1; }
              var mrad = SAT_MOON_R * Math.pow(mRNG(), 1.0/3.0);
              var ox = (mgx/mgr) * mrad, oy = (mgy/mgr) * mrad * SAT_OBLATE, oz = (mgz/mgr) * mrad;
              var sidx = (m * SAT_N_MOON + mp) * 3;
              SAT_moon_base[sidx+0] = ox; SAT_moon_base[sidx+1] = oy; SAT_moon_base[sidx+2] = oz;
              satToWorld(moonCx + ox, oy, moonCz + oz, tmp);
              var b4 = (moonBaseIdx + m * SAT_N_MOON + mp) * 4;
              positions[b4+0] = tmp[0]; positions[b4+1] = tmp[1]; positions[b4+2] = tmp[2];
              positions[b4+3] = orbit.dev;
          }
      }

      SAT_t = 0;
      SAT_planet_ang = 0;
      lifeDrawCount = SAT_N_TOTAL;

      saturnTick(0);
      if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.5; srR = 1.7; }
      srDragging = false;
      camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0;
      clumps.length = 0;
  }

  // ---- saturnTick --------------------------------------------
  function saturnTick(dt) {
      var transitioning = (pendingField !== null) || morph < 0.9;
      if (!transitioning) {
          SAT_t          += dt;
          SAT_planet_ang += SAT_PLANET_ROT_SPD * dt;
          var cosP = Math.cos(SAT_planet_ang), sinP = Math.sin(SAT_planet_ang);
          var tmp2 = [0, 0, 0];

          // -- Planet: rotate baked offsets about the spin axis (XZ), keep oblate Y --
          for (var pi2 = 0; pi2 < SAT_N_PLANET; pi2++) {
              var s3 = pi2 * 3;
              var bx = SAT_planet_base[s3+0], by = SAT_planet_base[s3+1], bz = SAT_planet_base[s3+2];
              satToWorld(bx * cosP - bz * sinP, by, bx * sinP + bz * cosP, tmp2);
              var b = pi2 * 4;
              positions[b+0] = tmp2[0]; positions[b+1] = tmp2[1]; positions[b+2] = tmp2[2];
              // dev (index 3) set at generate time, unchanged
          }

          // -- Rings: Keplerian differential rotation, omega ~ r^(-1.5) --
          var ringBase = SAT_N_PLANET;
          for (var ri2 = 0; ri2 < SAT_N_RINGS; ri2++) {
              var r = SAT_ring_r[ri2];
              var omega = SAT_RING_K / (r * Math.sqrt(r));
              var ang = SAT_ring_ang0[ri2] + omega * SAT_t;
              satToWorld(r * Math.cos(ang), SAT_ring_y0[ri2], r * Math.sin(ang), tmp2);
              var b2 = (ringBase + ri2) * 4;
              positions[b2+0] = tmp2[0]; positions[b2+1] = tmp2[1]; positions[b2+2] = tmp2[2];
          }

          // -- Moons: orbit each centre (Keplerian), add baked offset --
          var moonBase = SAT_N_PLANET + SAT_N_RINGS;
          for (var m2 = 0; m2 < SAT_N_MOONS; m2++) {
              var orbit = SAT_MOON_ORBITS[m2];
              var moonOmega = SAT_RING_K / (orbit.r * Math.sqrt(orbit.r));
              var moonAng = orbit.phase + moonOmega * SAT_t;
              var moonCx = orbit.r * Math.cos(moonAng), moonCz = orbit.r * Math.sin(moonAng);
              for (var mp2 = 0; mp2 < SAT_N_MOON; mp2++) {
                  var sidx = (m2 * SAT_N_MOON + mp2) * 3;
                  satToWorld(moonCx + SAT_moon_base[sidx+0], SAT_moon_base[sidx+1], moonCz + SAT_moon_base[sidx+2], tmp2);
                  var b3 = (moonBase + m2 * SAT_N_MOON + mp2) * 4;
                  positions[b3+0] = tmp2[0]; positions[b3+1] = tmp2[1]; positions[b3+2] = tmp2[2];
              }
          }
      }
      if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  // ======================================================
  // SACRED GEOMETRY — Platonic Solids Morphing Wireframe
  // Field id: "sacred"   N: ~120000 points
  // ======================================================

  // ---- Constants --------------------------------------------------
  var SAC_N            = 120000;   // total point slots
  var SAC_CIRCUMRADIUS = 0.40;     // each solid normalised to this
  var SAC_MORPH_SPEED  = 0.10;     // solid->solid morph (units/sec, completes in 10 s)
  var SAC_YAW_SPEED    = 0.18;     // rad/s primary rotation
  var SAC_TUMBLE_SPEED = 0.07;     // rad/s secondary tilt
  var SAC_BREATH_AMP   = 0.06;     // ±6 % scale breathing
  var SAC_BREATH_FREQ  = 0.35;     // Hz
  var SAC_INNER_SCALE  = 0.48;     // inner nested copy scale
  var SAC_INNER_FRAC   = 0.35;     // fraction of N used for inner copy

  // ---- Module state -----------------------------------------------
  var SAC_time     = 0;        // accumulated seconds
  var SAC_morphT   = 0;        // [0,1) fractional position within current morph
  var SAC_solidIdx = 0;        // which solid are we morphing FROM (0-4)
  var SAC_yaw      = 0;        // current rotation angles
  var SAC_tumble   = 0;
  var SAC_innerYaw = 0;

  // Precomputed target positions for each solid: SAC_solids[solidIdx] = Float32Array(N*3)
  var SAC_solids   = null;     // array of 5 Float32Arrays, each length N*3
  var SAC_built    = false;

  // ---- Platonic solid definitions (vertices + edges) ---------------
  // All defined at unit circumradius; we'll normalise after.

  function sacredTetVerts() {
      // Regular tetrahedron
      var r = 1.0;
      return [
          [ r,  r,  r],
          [ r, -r, -r],
          [-r,  r, -r],
          [-r, -r,  r]
      ];
  }
  function sacredTetEdges() {
      return [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  }

  function sacredCubeVerts() {
      var h = 1.0 / Math.sqrt(3);
      var v = [], s = [-1, 1];
      for (var a = 0; a < 2; a++)
      for (var b = 0; b < 2; b++)
      for (var c = 0; c < 2; c++)
          v.push([s[a]*h, s[b]*h, s[c]*h]);
      return v;
  }
  function sacredCubeEdges() {
      // 12 edges of cube (bit-index neighbours differ in exactly one bit)
      var edges = [];
      for (var i = 0; i < 8; i++)
          for (var j = i+1; j < 8; j++) {
              var diff = i ^ j;
              if (diff && (diff & (diff-1)) === 0) edges.push([i,j]);
          }
      return edges;
  }

  function sacredOctVerts() {
      var r = 1.0;
      return [
          [ r, 0, 0], [-r, 0, 0],
          [0,  r, 0], [0, -r, 0],
          [0, 0,  r], [0, 0, -r]
      ];
  }
  function sacredOctEdges() {
      var v = sacredOctVerts();
      var edges = [];
      for (var i = 0; i < v.length; i++)
          for (var j = i+1; j < v.length; j++)
              if (Math.abs(v[i][0]*v[j][0] + v[i][1]*v[j][1] + v[i][2]*v[j][2]) < 0.01)
                  edges.push([i,j]);
      return edges;
  }

  function sacredDodeVerts() {
      // 20 vertices of regular dodecahedron
      var phi = (1 + Math.sqrt(5)) / 2;
      var v = [];
      var s1 = [-1, 1], s2 = [-1, 1], s3 = [-1, 1];
      // (±1,±1,±1)
      for (var a = 0; a < 2; a++)
      for (var b = 0; b < 2; b++)
      for (var c = 0; c < 2; c++)
          v.push([s1[a], s2[b], s3[c]]);
      // (0, ±1/φ, ±φ) and permutations
      var ip = 1.0 / phi;
      var pa = [0, 0], pb = [-1, 1], pc = [-1, 1];
      for (var b = 0; b < 2; b++)
      for (var c = 0; c < 2; c++)
          v.push([0, pb[b]*ip, pc[c]*phi]);
      for (var b = 0; b < 2; b++)
      for (var c = 0; c < 2; c++)
          v.push([pb[b]*ip, pc[c]*phi, 0]);
      for (var b = 0; b < 2; b++)
      for (var c = 0; c < 2; c++)
          v.push([pb[b]*phi, 0, pc[c]*ip]);
      return v;
  }
  function sacredDodeEdges() {
      var v = sacredDodeVerts();
      var edges = [];
      // Connect vertices within a threshold distance (edge length of dodecahedron)
      // Edge length = 2/phi = ~1.236; use 1.24 threshold with small tolerance
      var phi = (1 + Math.sqrt(5)) / 2;
      var elen2 = (2.0/phi) * (2.0/phi) * 1.05;
      for (var i = 0; i < v.length; i++)
          for (var j = i+1; j < v.length; j++) {
              var dx = v[i][0]-v[j][0], dy = v[i][1]-v[j][1], dz = v[i][2]-v[j][2];
              if (dx*dx+dy*dy+dz*dz < elen2) edges.push([i,j]);
          }
      return edges;
  }

  function sacredIcoVerts() {
      var phi = (1 + Math.sqrt(5)) / 2;
      var v = [];
      var s1 = [-1,1], s2 = [-1,1];
      for (var a = 0; a < 2; a++)
      for (var b = 0; b < 2; b++) {
          v.push([0, s1[a]*1.0, s2[b]*phi]);
          v.push([s1[a]*1.0, s2[b]*phi, 0]);
          v.push([s2[b]*phi, 0, s1[a]*1.0]);
      }
      return v;
  }
  function sacredIcoEdges() {
      var v = sacredIcoVerts();
      var edges = [];
      // icosahedron edge length = 2; connect within 2.05
      var elen2 = 4.0 * 1.05;
      for (var i = 0; i < v.length; i++)
          for (var j = i+1; j < v.length; j++) {
              var dx = v[i][0]-v[j][0], dy = v[i][1]-v[j][1], dz = v[i][2]-v[j][2];
              if (dx*dx+dy*dy+dz*dz < elen2) edges.push([i,j]);
          }
      return edges;
  }

  // ---- Normalise a vertex array to circumradius R -----------------
  function sacredNormalise(verts, R) {
      var maxr = 0;
      for (var i = 0; i < verts.length; i++) {
          var v = verts[i];
          var r = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
          if (r > maxr) maxr = r;
      }
      if (maxr < 1e-9) return verts;
      var scale = R / maxr;
      var out = [];
      for (var i = 0; i < verts.length; i++)
          out.push([verts[i][0]*scale, verts[i][1]*scale, verts[i][2]*scale]);
      return out;
  }

  // ---- Sample N positions on a solid's wireframe ------------------
  // Strategy: each slot maps to a deterministic (edgeIndex, t) pair.
  // We distribute slots across edges proportionally, with a cluster at vertices too.
  function sacredSampleSolid(verts, edges, N, outerOnly) {
      // outerOnly: if true, fill N. Otherwise fill N normally.
      var out = new Float32Array(N * 3);
      var nEdges = edges.length;
      var nVerts = verts.length;

      // How many points: 15% at vertices, 85% on edges
      var vertSlots = Math.floor(N * 0.15);
      var edgeSlots = N - vertSlots;

      // Vertex points: spread vertSlots among vertices, multiple per vertex
      for (var i = 0; i < vertSlots; i++) {
          var vi = i % nVerts;
          var v = verts[vi];
          // tiny jitter so they're not all exactly coincident
          var jitter = 0.002;
          var jx = (sacredHash(i*3+7)   - 0.5) * jitter;
          var jy = (sacredHash(i*3+13)  - 0.5) * jitter;
          var jz = (sacredHash(i*3+991) - 0.5) * jitter;
          out[i*3]   = v[0] + jx;
          out[i*3+1] = v[1] + jy;
          out[i*3+2] = v[2] + jz;
      }

      // Edge points: distribute evenly across all edges (deterministic, slot-stable)
      // Each slot maps to edge = floor(i * nEdges / edgeSlots), t = fractional position
      for (var i = 0; i < edgeSlots; i++) {
          var ei = Math.floor(i * nEdges / edgeSlots);
          var segStart = Math.floor(ei * edgeSlots / nEdges);
          var segLen   = Math.max(1, Math.floor((ei + 1) * edgeSlots / nEdges) - segStart);
          var t = ((i - segStart) + 0.5) / segLen;
          t = Math.max(0.001, Math.min(0.999, t));
          var e  = edges[ei];
          var va = verts[e[0]], vb = verts[e[1]];
          var idx = vertSlots + i;
          out[idx*3]   = va[0] + t*(vb[0]-va[0]);
          out[idx*3+1] = va[1] + t*(vb[1]-va[1]);
          out[idx*3+2] = va[2] + t*(vb[2]-va[2]);
      }
      return out;
  }

  // Simple deterministic hash: [0,1)
  function sacredHash(n) {
      n = (n ^ (n >>> 16)) * 0x45d9f3b | 0;
      n = (n ^ (n >>> 16)) * 0x45d9f3b | 0;
      n = n ^ (n >>> 16);
      return (n >>> 0) / 0xffffffff;
  }

  // ---- Build all 5 solids' target arrays -------------------------
  function sacredBuildSolids() {
      var allVerts = [
          sacredNormalise(sacredTetVerts(),  SAC_CIRCUMRADIUS),
          sacredNormalise(sacredCubeVerts(), SAC_CIRCUMRADIUS),
          sacredNormalise(sacredOctVerts(),  SAC_CIRCUMRADIUS),
          sacredNormalise(sacredDodeVerts(), SAC_CIRCUMRADIUS),
          sacredNormalise(sacredIcoVerts(),  SAC_CIRCUMRADIUS)
      ];
      var allEdges = [
          sacredTetEdges(),
          sacredCubeEdges(),
          sacredOctEdges(),
          sacredDodeEdges(),
          sacredIcoEdges()
      ];

      var N = SAC_N;
      var outerN = Math.floor(N * (1.0 - SAC_INNER_FRAC));
      var innerN = N - outerN;

      SAC_solids = [];
      for (var s = 0; s < 5; s++) {
          var buf = new Float32Array(N * 3);
          // Outer copy
          var outerPts = sacredSampleSolid(allVerts[s], allEdges[s], outerN, true);
          for (var i = 0; i < outerN * 3; i++) buf[i] = outerPts[i];
          // Inner copy at SAC_INNER_SCALE (counter-rotate handled at tick time via stored base)
          var innerPts = sacredSampleSolid(allVerts[s], allEdges[s], innerN, true);
          for (var i = 0; i < innerN * 3; i++) buf[outerN*3 + i] = innerPts[i] * SAC_INNER_SCALE;
          SAC_solids.push(buf);
      }
  }

  // ---- Smooth easing (hermite) ------------------------------------
  function sacredEase(t) {
      return t * t * (3.0 - 2.0 * t);
  }

  // ---- 3D rotation matrix helpers ---------------------------------
  // Rotate a [x,y,z] by yaw (about Y) then tilt (about X)
  function sacredRotate(x, y, z, yaw, tilt) {
      // Rotate about Y by yaw
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var x2 = cy*x + sy*z;
      var z2 = -sy*x + cy*z;
      // Rotate about X by tilt
      var cx = Math.cos(tilt), sx = Math.sin(tilt);
      var y3 = cx*y - sx*z2;
      var z3 = sx*y + cx*z2;
      return [x2, y3, z3];
  }

  // ---- Generate (one-time setup) ----------------------------------
  function generateSacred() {
      ensurePointCapacity(SAC_N);

      if (!SAC_built) {
          sacredBuildSolids();
          SAC_built   = true;
          SAC_time    = 0;
          SAC_morphT  = 0;
          SAC_solidIdx = 0;
          SAC_yaw     = 0;
          SAC_tumble  = 0;
          SAC_innerYaw = 0;
      }

      lifeDrawCount = SAC_N;

      // Write initial frame
      sacredTick(0);

      if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.45; srR = 1.6; }
      srDragging = false;
      camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0;
      clumps.length = 0;
  }

  // ---- Per-frame tick ---------------------------------------------
  function sacredTick(dt) {
      var transitioning = (pendingField !== null) || morph < 0.9;
      if (!transitioning) {
          SAC_time   += dt;
          SAC_morphT += dt * SAC_MORPH_SPEED;

          // Advance to next solid when morphT reaches 1
          if (SAC_morphT >= 1.0) {
              SAC_morphT  -= 1.0;
              SAC_solidIdx = (SAC_solidIdx + 1) % 5;
          }

          SAC_yaw      += dt * SAC_YAW_SPEED;
          SAC_tumble   += dt * SAC_TUMBLE_SPEED;
          SAC_innerYaw += dt * SAC_YAW_SPEED * (-1.7);  // counter-rotate
      }

      // Always (re)write positions from the current state, even while transitioning, so a
      // fresh entry uploads THIS scene's geometry and not the previous scene's stale buffer
      // (the held-geometry shader then fades it up by brightness). Mirrors oceanTick, which
      // gates only the time advance, never the position write. Without this, entering Sacred
      // from any other scene showed the prior cloud fade up, then pop into the polyhedron.
      var eased   = sacredEase(Math.max(0, Math.min(1, SAC_morphT)));
      var fromBuf = SAC_solids[SAC_solidIdx];
      var toBuf   = SAC_solids[(SAC_solidIdx + 1) % 5];

      var breathScale = 1.0 + SAC_BREATH_AMP * Math.sin(2.0 * Math.PI * SAC_BREATH_FREQ * SAC_time);
      var outerN = Math.floor(SAC_N * (1.0 - SAC_INNER_FRAC));
      var devMorph = 1.0 + eased * 4.5;          // 1.0 (cyan) -> 5.5 as the morph ignites
      var invR = 1.0 / (SAC_CIRCUMRADIUS * 1.1);

      // Rotation trig is constant across all points this frame — hoist it out of
      // the loop (was recomputed per point) and inline the rotate (was a function
      // call returning a fresh array per point -> heavy GC). Numerically identical.
      var cyO = Math.cos(SAC_yaw),         syO = Math.sin(SAC_yaw);
      var cxO = Math.cos(SAC_tumble),      sxO = Math.sin(SAC_tumble);
      var cyI = Math.cos(SAC_innerYaw),    syI = Math.sin(SAC_innerYaw);
      var cxI = Math.cos(SAC_tumble * 0.7), sxI = Math.sin(SAC_tumble * 0.7);

      var i, bx, by, bz, x2, z2, ry, rz, rdist, dev, b4;

      // -- Outer copy [0, outerN): rotate by (yaw, tumble) --
      for (i = 0; i < outerN; i++) {
          bx = (fromBuf[i*3]   + eased * (toBuf[i*3]   - fromBuf[i*3]))   * breathScale;
          by = (fromBuf[i*3+1] + eased * (toBuf[i*3+1] - fromBuf[i*3+1])) * breathScale;
          bz = (fromBuf[i*3+2] + eased * (toBuf[i*3+2] - fromBuf[i*3+2])) * breathScale;
          x2 = cyO*bx + syO*bz;  z2 = -syO*bx + cyO*bz;   // yaw about Y
          ry = cxO*by - sxO*z2;  rz =  sxO*by + cxO*z2;   // tilt about X
          b4 = i*4;
          positions[b4]   = x2 + 0.5;
          positions[b4+1] = ry + 0.5;
          positions[b4+2] = rz + 0.5;
          rdist = Math.sqrt(bx*bx + by*by + bz*bz);
          dev = devMorph + (rdist * invR) * 0.8;
          positions[b4+3] = dev < 0.4 ? 0.4 : (dev > 6.0 ? 6.0 : dev);
      }

      // -- Inner copy [outerN, N): counter-rotate by (innerYaw, tumble*0.7), shifted colour lane --
      for (i = outerN; i < SAC_N; i++) {
          bx = (fromBuf[i*3]   + eased * (toBuf[i*3]   - fromBuf[i*3]))   * breathScale;
          by = (fromBuf[i*3+1] + eased * (toBuf[i*3+1] - fromBuf[i*3+1])) * breathScale;
          bz = (fromBuf[i*3+2] + eased * (toBuf[i*3+2] - fromBuf[i*3+2])) * breathScale;
          x2 = cyI*bx + syI*bz;  z2 = -syI*bx + cyI*bz;
          ry = cxI*by - sxI*z2;  rz =  sxI*by + cxI*z2;
          b4 = i*4;
          positions[b4]   = x2 + 0.5;
          positions[b4+1] = ry + 0.5;
          positions[b4+2] = rz + 0.5;
          rdist = Math.sqrt(bx*bx + by*by + bz*bz);
          dev = (devMorph * 0.75 + 1.5) + (rdist * invR) * 0.8;
          positions[b4+3] = dev < 0.4 ? 0.4 : (dev > 6.0 ? 6.0 : dev);
      }

      if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  // ======= STRANGE ATTRACTOR FLOW =======
  // Aizawa attractor — 200k points flowing along the manifold.
  // a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1
  // Native bounds roughly [-1.5,1.5] x [-1.5,1.5] x [0,2].
  // Mapped to local sphere r~0.40 centered at (0.5,0.5,0.5).

  var ATR_N             = 200000;
  var ATR_a             = 0.95;
  var ATR_b             = 0.7;
  var ATR_c             = 0.6;
  var ATR_d             = 3.5;
  var ATR_e             = 0.25;
  var ATR_f             = 0.1;
  var ATR_H             = 0.010;    // RK2 sub-step size (keeps ~0.02 native units/frame)
  var ATR_SUBSTEPS      = 2;        // sub-steps per tick (allocation-free inline RK2)

  // Native bounding box used for scaling.
  // x,y in ~[-1.5,1.5], z in ~[0,2]; center (0, 0, 1).
  var ATR_SCALE         = 0.40 / 1.55;  // maps ±1.55 → ±0.40
  var ATR_CX            = 0.0;
  var ATR_CY            = 0.0;
  var ATR_CZ            = 1.0;          // center of native z range

  // Speed range for dev encoding (calibrated empirically).
  var ATR_SPEED_MIN     = 0.04;
  var ATR_SPEED_MAX     = 4.5;

  // Parallel native-space state arrays.
  var ATR_px = null;
  var ATR_py = null;
  var ATR_pz = null;

  // Seeded PRNG — Mulberry32.
  var ATR_seed = 0x3a7f2c1b;
  function atrRand() {
      ATR_seed = (ATR_seed + 0x6D2B79F5) >>> 0;
      var z = ATR_seed;
      z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
      z = (z ^ (Math.imul(z ^ (z >>> 7), z | 61) >>> 0)) >>> 0;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  // Aizawa derivative at (x,y,z), returns [dx,dy,dz].
  function atrDerivative(x, y, z) {
      var a = ATR_a, b = ATR_b, c = ATR_c, d = ATR_d, e = ATR_e, f = ATR_f;
      var dx = (z - b) * x - d * y;
      var dy = d * x + (z - b) * y;
      var dz = c + a * z - (z * z * z) / 3.0 - (x * x + y * y) * (1.0 + e * z) + f * z * (x * x * x);
      return [dx, dy, dz];
  }

  // RK4 step; returns [nx, ny, nz].
  function atrRK4(x, y, z, h) {
      var k1 = atrDerivative(x, y, z);
      var k2 = atrDerivative(x + h * 0.5 * k1[0], y + h * 0.5 * k1[1], z + h * 0.5 * k1[2]);
      var k3 = atrDerivative(x + h * 0.5 * k2[0], y + h * 0.5 * k2[1], z + h * 0.5 * k2[2]);
      var k4 = atrDerivative(x + h * k3[0], y + h * k3[1], z + h * k3[2]);
      return [
          x + (h / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]),
          y + (h / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]),
          z + (h / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2])
      ];
  }

  // Map native (x,y,z) to positions[] world space.
  function atrToWorld(nx, ny, nz, i) {
      var wx = (nx - ATR_CX) * ATR_SCALE + 0.5;
      var wy = (ny - ATR_CY) * ATR_SCALE + 0.5;
      var wz = (nz - ATR_CZ) * ATR_SCALE + 0.5;
      var base = i * 4;
      positions[base    ] = wx;
      positions[base + 1] = wy;
      positions[base + 2] = wz;
  }

  // Encode speed -> dev value [0.3,6].
  function atrSpeedToDev(speed) {
      var t = (speed - ATR_SPEED_MIN) / (ATR_SPEED_MAX - ATR_SPEED_MIN);
      if (t < 0.0) t = 0.0;
      if (t > 1.0) t = 1.0;
      // Map [0,1] -> [0.3,6]: cyan=cool(slow) -> red=hot(fast)
      return 0.3 + t * 5.7;
  }

  // Seed a point near the attractor.
  function atrSeedPoint(i) {
      ATR_px[i] = 0.1 + (atrRand() - 0.5) * 0.4;
      ATR_py[i] = 0.0 + (atrRand() - 0.5) * 0.4;
      ATR_pz[i] = 1.0 + (atrRand() - 0.5) * 0.4;
  }

  function generateAttractor() {
      var N = ATR_N;
      ensurePointCapacity(N);

      ATR_px = new Float64Array(N);
      ATR_py = new Float64Array(N);
      ATR_pz = new Float64Array(N);

      // Seed all points in a cloud near the attractor center.
      for (var i = 0; i < N; i++) {
          atrSeedPoint(i);
      }

      // Pre-warm: run ~40 steps to settle all points onto the manifold.
      // RK4 at h=0.004: 40 steps = 0.16 time units; enough to pull seed cloud
      // onto the attractor shell from a small initial cloud around (0.1,0,1).
      for (var w = 0; w < 40; w++) {
          for (var i = 0; i < N; i++) {
              var r = atrRK4(ATR_px[i], ATR_py[i], ATR_pz[i], ATR_H);
              ATR_px[i] = r[0]; ATR_py[i] = r[1]; ATR_pz[i] = r[2];
          }
      }

      // Write initial positions + dev.
      for (var i = 0; i < N; i++) {
          var nx = ATR_px[i], ny = ATR_py[i], nz = ATR_pz[i];
          atrToWorld(nx, ny, nz, i);
          var deriv = atrDerivative(nx, ny, nz);
          var speed = Math.sqrt(deriv[0]*deriv[0] + deriv[1]*deriv[1] + deriv[2]*deriv[2]);
          positions[i * 4 + 3] = atrSpeedToDev(speed);
      }

      lifeDrawCount = N;

      // --- EXACT FRAMING TAIL ---
      attractorTick(0);
      if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.5; srR = 1.7; }
      srDragging = false;
      camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0;
      clumps.length = 0;
  }

  function attractorTick(dt) {
      // --- EXACT GUARD ---
      var transitioning = (pendingField !== null) || morph < 0.9;
      if (!transitioning) {
          var N = ATR_N, h = ATR_H, substeps = ATR_SUBSTEPS, DIVERGE = 12.0;
          var a = ATR_a, b = ATR_b, c = ATR_c, d = ATR_d, e = ATR_e, f = ATR_f;
          var px = ATR_px, py = ATR_py, pz = ATR_pz;
          var i, s, x, y, z, zb, x2y2, dx, dy, dz, mx, my, mz, h2 = h * 0.5;

          // Allocation-free inline RK2 (midpoint). The old RK4 returned a fresh
          // [dx,dy,dz] array per stage -> ~5M tiny allocations/frame (GC churn).
          for (s = 0; s < substeps; s++) {
              for (i = 0; i < N; i++) {
                  x = px[i]; y = py[i]; z = pz[i];
                  if (x !== x || y !== y || z !== z ||
                      x > DIVERGE || x < -DIVERGE || y > DIVERGE || y < -DIVERGE || z > DIVERGE || z < -DIVERGE) {
                      atrSeedPoint(i); x = px[i]; y = py[i]; z = pz[i];
                  }
                  // k1 = f(x,y,z)
                  zb = z - b; x2y2 = x*x + y*y;
                  dx = zb*x - d*y;
                  dy = d*x + zb*y;
                  dz = c + a*z - (z*z*z)/3.0 - x2y2*(1.0 + e*z) + f*z*(x*x*x);
                  // midpoint
                  mx = x + h2*dx; my = y + h2*dy; mz = z + h2*dz;
                  // k2 = f(mid)
                  zb = mz - b; x2y2 = mx*mx + my*my;
                  dx = zb*mx - d*my;
                  dy = d*mx + zb*my;
                  dz = c + a*mz - (mz*mz*mz)/3.0 - x2y2*(1.0 + e*mz) + f*mz*(mx*mx*mx);
                  px[i] = x + h*dx;
                  py[i] = y + h*dy;
                  pz[i] = z + h*dz;
              }
          }

          // Write positions + speed-coloured dev (derivative inlined again).
          var sc = ATR_SCALE, cx = ATR_CX, cy = ATR_CY, cz = ATR_CZ, base, speed;
          for (i = 0; i < N; i++) {
              x = px[i]; y = py[i]; z = pz[i];
              base = i * 4;
              positions[base]     = (x - cx) * sc + 0.5;
              positions[base + 1] = (y - cy) * sc + 0.5;
              positions[base + 2] = (z - cz) * sc + 0.5;
              zb = z - b; x2y2 = x*x + y*y;
              dx = zb*x - d*y;
              dy = d*x + zb*y;
              dz = c + a*z - (z*z*z)/3.0 - x2y2*(1.0 + e*z) + f*z*(x*x*x);
              speed = Math.sqrt(dx*dx + dy*dy + dz*dz);
              positions[base + 3] = atrSpeedToDev(speed);
          }
      }

      if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  /* ============================================================
     CURL-NOISE FLOW FIELD  —  Life scene for random-galaxy.js
     Field id: 'curlflow'
     ~160 000 particles advected through a divergence-free
     curl-noise velocity field.  v = curl(PSI) (incompressible,
     smoke-like).  PSI = (n1,n2,n3) from three decorrelated
     gradient-noise fields; the noise drifts in a 4th (time)
     dimension so the flow keeps reorganising.
     PERF: the curl needs 12 gradient-noise evals per sample, far too
     costly per particle per frame (~73 ms at 160k). So the field is
     BAKED onto a 32^3 velocity grid that particles sample with a cheap
     trilinear lookup. The grid is refreshed ONE z-slice per frame (a
     rolling update at the advancing field-time) so it keeps drifting
     with no per-frame bake spike. dev encodes particle speed.
     ============================================================ */

  /* ---- CF_ prefixed module-scope constants + state ---- */
  var CF_N           = 120000;   // particle count (trimmed from 160k for tick headroom)
  var CF_FREQ        = 2.6;      // spatial noise frequency
  var CF_SPEED       = 0.18;     // velocity scale (world units / sec)
  var CF_TIME_SCALE  = 0.07;     // how fast the field evolves (noise time drift)
  var CF_EPSILON     = 0.01;     // finite-difference step for curl computation
  var CF_RADIUS      = 0.40;     // confinement sphere radius (local coords)
  var CF_DEV_SLOW    = 1.0;      // dev for near-zero speed
  var CF_DEV_FAST    = 6.0;      // dev for peak speed
  var CF_SPEED_REF   = 0.30;     // |v| that maps to CF_DEV_FAST
  var CF_GRID        = 32;       // velocity-grid resolution per axis (32^3 cells)

  /* Particle state arrays (allocated on first generateCurlflow call) */
  var cf_px = null, cf_py = null, cf_pz = null;
  var cf_t  = 0.0;               // field-time accumulator (drives noise drift)

  /* Baked velocity grid: CF_GRID^3 cells x 3 floats (raw curl units) + rolling slice cursor */
  var cf_gridV = null;
  var cf_sliceZ = 0;

  /* ---- Gradient noise (Perlin-style, fixed perm + 16 gradients) ---- */
  var CF_P = (function () {
    var p = new Int32Array(256);
    var i, j, tmp;
    for (i = 0; i < 256; i++) p[i] = i;
    var s = 0x9e3779b9;
    for (i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) | 0;
      j = ((s >>> 0) % (i + 1)) | 0;
      tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    var pp = new Int32Array(512);
    for (i = 0; i < 512; i++) pp[i] = p[i & 255];
    return pp;
  }());

  var CF_G = [
     1, 1, 0,  -1, 1, 0,   1,-1, 0,  -1,-1, 0,
     1, 0, 1,  -1, 0, 1,   1, 0,-1,  -1, 0,-1,
     0, 1, 1,   0,-1, 1,   0, 1,-1,   0,-1,-1,
     1, 1, 0,  -1, 1, 0,   0,-1, 1,   0,-1,-1
  ];

  /* Inlined gradient noise — scalar noise at (x,y,z); ox,oy,oz seed each component. */
  function cf_n(x, y, z, ox, oy, oz) {
    var nx = x + ox, ny = y + oy, nz = z + oz;
    var xi = (nx | 0) & 255; if (nx < 0 && nx !== (nx | 0)) xi = (xi - 1) & 255;
    var yi = (ny | 0) & 255; if (ny < 0 && ny !== (ny | 0)) yi = (yi - 1) & 255;
    var zi = (nz | 0) & 255; if (nz < 0 && nz !== (nz | 0)) zi = (zi - 1) & 255;
    var fx = nx - Math.floor(nx);
    var fy = ny - Math.floor(ny);
    var fz = nz - Math.floor(nz);
    var u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    var v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    var w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    var P = CF_P, G = CF_G;
    var A  = P[xi]     + yi;
    var AA = P[A]      + zi,  AB = P[A + 1] + zi;
    var B  = P[xi + 1] + yi;
    var BA = P[B]      + zi,  BB = P[B + 1] + zi;
    var h, i3, g000,g100,g010,g110,g001,g101,g011,g111;
    h = P[AA]     & 15; i3 = h * 3; g000 = G[i3]*fx     + G[i3+1]*fy     + G[i3+2]*fz;
    h = P[BA]     & 15; i3 = h * 3; g100 = G[i3]*(fx-1) + G[i3+1]*fy     + G[i3+2]*fz;
    h = P[AB]     & 15; i3 = h * 3; g010 = G[i3]*fx     + G[i3+1]*(fy-1) + G[i3+2]*fz;
    h = P[BB]     & 15; i3 = h * 3; g110 = G[i3]*(fx-1) + G[i3+1]*(fy-1) + G[i3+2]*fz;
    h = P[AA + 1] & 15; i3 = h * 3; g001 = G[i3]*fx     + G[i3+1]*fy     + G[i3+2]*(fz-1);
    h = P[BA + 1] & 15; i3 = h * 3; g101 = G[i3]*(fx-1) + G[i3+1]*fy     + G[i3+2]*(fz-1);
    h = P[AB + 1] & 15; i3 = h * 3; g011 = G[i3]*fx     + G[i3+1]*(fy-1) + G[i3+2]*(fz-1);
    h = P[BB + 1] & 15; i3 = h * 3; g111 = G[i3]*(fx-1) + G[i3+1]*(fy-1) + G[i3+2]*(fz-1);
    var x00 = g000 + u * (g100 - g000);
    var x10 = g010 + u * (g110 - g010);
    var x01 = g001 + u * (g101 - g001);
    var x11 = g011 + u * (g111 - g011);
    var y0  = x00  + v * (x10  - x00);
    var y1  = x01  + v * (x11  - x01);
    return y0 + w * (y1 - y0);
  }

  var CF_O1X =  0.00, CF_O1Y =  0.00, CF_O1Z =  0.00;
  var CF_O2X = 31.41, CF_O2Y = 17.83, CF_O2Z = 47.23;
  var CF_O3X = 83.11, CF_O3Y = 61.72, CF_O3Z = 29.57;

  /* curl(PSI)(x,y,z,t) via central finite differences; writes [vx,vy,vz] into out. */
  function cf_curl(x, y, z, t4, out) {
    var f   = CF_FREQ;
    var eps = CF_EPSILON;
    var sx  = x * f + t4 * 0.11;
    var sy  = y * f + t4 * 0.07;
    var sz  = z * f + t4 * 0.13;
    var ie  = 0.5 / eps;
    var p3py = cf_n(sx, sy + eps, sz, CF_O3X, CF_O3Y, CF_O3Z);
    var p3my = cf_n(sx, sy - eps, sz, CF_O3X, CF_O3Y, CF_O3Z);
    var p3px = cf_n(sx + eps, sy, sz, CF_O3X, CF_O3Y, CF_O3Z);
    var p3mx = cf_n(sx - eps, sy, sz, CF_O3X, CF_O3Y, CF_O3Z);
    var p2pz = cf_n(sx, sy, sz + eps, CF_O2X, CF_O2Y, CF_O2Z);
    var p2mz = cf_n(sx, sy, sz - eps, CF_O2X, CF_O2Y, CF_O2Z);
    var p2px = cf_n(sx + eps, sy, sz, CF_O2X, CF_O2Y, CF_O2Z);
    var p2mx = cf_n(sx - eps, sy, sz, CF_O2X, CF_O2Y, CF_O2Z);
    var p1pz = cf_n(sx, sy, sz + eps, CF_O1X, CF_O1Y, CF_O1Z);
    var p1mz = cf_n(sx, sy, sz - eps, CF_O1X, CF_O1Y, CF_O1Z);
    var p1py = cf_n(sx, sy + eps, sz, CF_O1X, CF_O1Y, CF_O1Z);
    var p1my = cf_n(sx, sy - eps, sz, CF_O1X, CF_O1Y, CF_O1Z);
    out[0] = ((p3py - p3my) - (p2pz - p2mz)) * ie;
    out[1] = ((p1pz - p1mz) - (p3px - p3mx)) * ie;
    out[2] = ((p2px - p2mx) - (p1py - p1my)) * ie;
  }

  /* ---- Velocity-grid bake + trilinear sample ---- */
  // Bake one z-slice (all x,y at this iz) of the grid at field-time t4.
  function cfBakeSlice(iz, t4) {
    var G = CF_GRID, R = CF_RADIUS, step = (2 * R) / (G - 1);
    var v = [0, 0, 0], ix, iy, base, lx, ly, lz;
    lz = -R + iz * step;
    for (iy = 0; iy < G; iy++) {
      ly = -R + iy * step;
      for (ix = 0; ix < G; ix++) {
        lx = -R + ix * step;
        cf_curl(lx, ly, lz, t4, v);
        base = ((iz * G + iy) * G + ix) * 3;
        cf_gridV[base]     = v[0];
        cf_gridV[base + 1] = v[1];
        cf_gridV[base + 2] = v[2];
      }
    }
  }
  function cfBakeAll(t4) { var G = CF_GRID, iz; for (iz = 0; iz < G; iz++) cfBakeSlice(iz, t4); }

  // Trilinear sample of the velocity grid at local (px,py,pz); writes out[0..2].
  function cfSampleVel(px, py, pz, out) {
    var G = CF_GRID, R = CF_RADIUS, inv = (G - 1) / (2 * R);
    var gx = (px + R) * inv, gy = (py + R) * inv, gz = (pz + R) * inv;
    if (gx < 0) gx = 0; else if (gx > G - 1.001) gx = G - 1.001;
    if (gy < 0) gy = 0; else if (gy > G - 1.001) gy = G - 1.001;
    if (gz < 0) gz = 0; else if (gz > G - 1.001) gz = G - 1.001;
    var ix = gx | 0, iy = gy | 0, iz = gz | 0;
    var fx = gx - ix, fy = gy - iy, fz = gz - iz;
    var V = cf_gridV, G3 = G * 3, G2_3 = G * G * 3;
    var b000 = ((iz * G + iy) * G + ix) * 3;
    var b100 = b000 + 3,      b010 = b000 + G3,      b110 = b010 + 3;
    var b001 = b000 + G2_3,   b101 = b001 + 3,       b011 = b001 + G3,  b111 = b011 + 3;
    var c0, c1, c2, c3, y0v, y1v;
    c0 = V[b000]   + fx*(V[b100]  -V[b000]);   c1 = V[b010]   + fx*(V[b110]  -V[b010]);
    c2 = V[b001]   + fx*(V[b101]  -V[b001]);   c3 = V[b011]   + fx*(V[b111]  -V[b011]);
    y0v = c0 + fy*(c1-c0); y1v = c2 + fy*(c3-c2); out[0] = y0v + fz*(y1v-y0v);
    c0 = V[b000+1] + fx*(V[b100+1]-V[b000+1]); c1 = V[b010+1] + fx*(V[b110+1]-V[b010+1]);
    c2 = V[b001+1] + fx*(V[b101+1]-V[b001+1]); c3 = V[b011+1] + fx*(V[b111+1]-V[b011+1]);
    y0v = c0 + fy*(c1-c0); y1v = c2 + fy*(c3-c2); out[1] = y0v + fz*(y1v-y0v);
    c0 = V[b000+2] + fx*(V[b100+2]-V[b000+2]); c1 = V[b010+2] + fx*(V[b110+2]-V[b010+2]);
    c2 = V[b001+2] + fx*(V[b101+2]-V[b001+2]); c3 = V[b011+2] + fx*(V[b111+2]-V[b011+2]);
    y0v = c0 + fy*(c1-c0); y1v = c2 + fy*(c3-c2); out[2] = y0v + fz*(y1v-y0v);
  }

  /* ---- generateCurlflow ---- */
  function generateCurlflow() {
    var N = CF_N;
    ensurePointCapacity(N);
    if (!cf_px || cf_px.length !== N) {
      cf_px = new Float32Array(N); cf_py = new Float32Array(N); cf_pz = new Float32Array(N);
    }
    if (!cf_gridV) cf_gridV = new Float32Array(CF_GRID * CF_GRID * CF_GRID * 3);
    cf_t = 0.0; cf_sliceZ = 0;

    // Seed particles uniformly inside the sphere (deterministic LCG rejection).
    var R = CF_RADIUS, R2 = R * R, rs = 0xdeadbeef;
    function cfRng() { rs = (rs * 1664525 + 1013904223) | 0; return (rs >>> 0) * 2.3283064365386963e-10; }
    var i = 0, px, py, pz;
    while (i < N) {
      px = (cfRng() * 2 - 1) * R; py = (cfRng() * 2 - 1) * R; pz = (cfRng() * 2 - 1) * R;
      if (px * px + py * py + pz * pz <= R2) { cf_px[i] = px; cf_py[i] = py; cf_pz[i] = pz; i++; }
    }

    cfBakeAll(0);   // full velocity-grid bake at field-time 0
    lifeDrawCount = N;

    var vel = [0, 0, 0], SPD = CF_SPEED, DEV_RANGE = CF_DEV_FAST - CF_DEV_SLOW, SPD_REF = CF_SPEED_REF;
    var pi, vx, vy, vz, spd, t01, dev;
    for (i = 0; i < N; i++) {
      cfSampleVel(cf_px[i], cf_py[i], cf_pz[i], vel);
      vx = vel[0] * SPD; vy = vel[1] * SPD; vz = vel[2] * SPD;
      spd = Math.sqrt(vx * vx + vy * vy + vz * vz); t01 = spd / SPD_REF; if (t01 > 1) t01 = 1;
      dev = CF_DEV_SLOW + t01 * DEV_RANGE;
      pi = i * 4;
      positions[pi] = cf_px[i] + 0.5; positions[pi + 1] = cf_py[i] + 0.5; positions[pi + 2] = cf_pz[i] + 0.5;
      positions[pi + 3] = dev;
    }

    curlflowTick(0);
    if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.5; srR = 1.6; }
    srDragging = false;
    camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0;
    clumps.length = 0;
  }

  /* ---- curlflowTick ---- */
  function curlflowTick(dt) {
    var transitioning = (pendingField !== null) || morph < 0.9;
    if (!transitioning) {
      var N = CF_N, R = CF_RADIUS, R2 = R * R, SPD = CF_SPEED;
      var DEV_RANGE = CF_DEV_FAST - CF_DEV_SLOW, SPD_REF = CF_SPEED_REF, G = CF_GRID;

      // Roll the velocity grid forward one z-slice at the advancing field-time.
      cf_t += dt * CF_TIME_SCALE;
      cfBakeSlice(cf_sliceZ, cf_t);
      cf_sliceZ++; if (cf_sliceZ >= G) cf_sliceZ = 0;

      var rs = ((cf_t * 1193 + 0.5) * 4294967296) | 0; if (rs === 0) rs = 1;
      var vel = [0, 0, 0];
      var i, pi, px, py, pz, vx, vy, vz, spd, t01, dev, rx, ry, rz, att;

      for (i = 0; i < N; i++) {
        px = cf_px[i]; py = cf_py[i]; pz = cf_pz[i];
        cfSampleVel(px, py, pz, vel);
        vx = vel[0] * SPD; vy = vel[1] * SPD; vz = vel[2] * SPD;
        px += vx * dt; py += vy * dt; pz += vz * dt;

        if (px * px + py * py + pz * pz > R2) {   // left the sphere -> respawn inside
          att = 0;
          do {
            rs = (rs * 1664525 + 1013904223) | 0; rx = ((rs >>> 0) * 2.3283064365386963e-10 * 2 - 1) * R;
            rs = (rs * 1664525 + 1013904223) | 0; ry = ((rs >>> 0) * 2.3283064365386963e-10 * 2 - 1) * R;
            rs = (rs * 1664525 + 1013904223) | 0; rz = ((rs >>> 0) * 2.3283064365386963e-10 * 2 - 1) * R;
            att++;
          } while (rx * rx + ry * ry + rz * rz > R2 && att < 10);
          px = rx; py = ry; pz = rz;
          cfSampleVel(px, py, pz, vel);
          vx = vel[0] * SPD; vy = vel[1] * SPD; vz = vel[2] * SPD;
        }

        cf_px[i] = px; cf_py[i] = py; cf_pz[i] = pz;
        spd = Math.sqrt(vx * vx + vy * vy + vz * vz); t01 = spd / SPD_REF; if (t01 > 1) t01 = 1;
        dev = CF_DEV_SLOW + t01 * DEV_RANGE;
        pi = i * 4;
        positions[pi] = px + 0.5; positions[pi + 1] = py + 0.5; positions[pi + 2] = pz + 0.5;
        positions[pi + 3] = dev;
      }
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  // ============================================================
  //  L-SYSTEM PLANT  —  random-galaxy.js Life scene
  //  field-id: 'lsystem'
  //  ~90000 points distributed along 3-D turtle-drawn branches
  //  Animation: growth wave (looping ~10s) + wind sway
  // ============================================================

  // ---- constants ----
  var LS_N          = 90000;   // total point budget
  var LS_ITER       = 5;       // L-system expansion iterations
  var LS_STEP_BASE  = 0.072;   // base forward step at iter 0 (shrinks per level)
  var LS_STEP_SHRINK= 0.62;    // step scale per level
  var LS_ANGLE_BASE = 26.0;    // branch angle in degrees (base)
  var LS_SWAY_AMP   = 0.020;   // max horizontal sway at tips
  var LS_SWAY_SPEED = 0.52;    // wind frequency (rad/s)
  var LS_GROW_CYCLE = 10.0;    // seconds for one full growth+hold cycle

  // dev colour: trunk = warm (orange/gold ~4.5), tips = cool cyan (~1.1)
  var LS_DEV_TRUNK  = 4.5;
  var LS_DEV_TIP    = 1.1;

  // ---- state ----
  // Per-point baked arrays (N entries each):
  var LS_N_ACTUAL  = 0;
  var LS_restX     = null;   // rest X (local: -0.5..0.5)
  var LS_restY     = null;   // rest Y (local)
  var LS_restZ     = null;   // rest Z (local)
  var LS_distRoot  = null;   // cumulative arc-length from root, normalised [0,1]
  var LS_devBase   = null;   // depth-based dev colour
  var LS_segPhase  = null;   // per-point sway phase (inherited from segment)

  var LS_totalArcLen = 0;   // world-space total arc length (for normalisation)
  var LS_time     = 0.0;
  var LS_inited   = false;

  // ================================================================
  //  Mulberry32 — seeded RNG
  // ================================================================
  function LS_rng(seed) {
    var s = seed >>> 0;
    return function() {
      s += 0x6D2B79F5;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ================================================================
  //  String expansion
  // ================================================================
  function LS_expand(axiom, rules, iters) {
    var str = axiom, i, j, ch, next;
    for (i = 0; i < iters; i++) {
      next = '';
      for (j = 0; j < str.length; j++) {
        ch = str[j];
        next += (rules[ch] !== undefined) ? rules[ch] : ch;
      }
      str = next;
    }
    return str;
  }

  // ================================================================
  //  Vector helpers (plain 3-element arrays)
  // ================================================================
  function LS_dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function LS_cross(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function LS_norm(v) {
    var len = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    if (len < 1e-10) return [0,1,0];
    return [v[0]/len, v[1]/len, v[2]/len];
  }
  // Rodrigues rotation: rotate vec v around unit axis by angle radians
  function LS_rot(v, axis, angle) {
    var cos = Math.cos(angle), sin = Math.sin(angle), dot = LS_dot(v, axis);
    var cx = LS_cross(axis, v);
    return [
      v[0]*cos + cx[0]*sin + axis[0]*dot*(1-cos),
      v[1]*cos + cx[1]*sin + axis[1]*dot*(1-cos),
      v[2]*cos + cx[2]*sin + axis[2]*dot*(1-cos)
    ];
  }

  // ================================================================
  //  Turtle interpretation + point distribution
  // ================================================================
  function LS_buildTree(rand) {
    var rules = { 'X': 'F+[[X]-X]-F[-FX]+X', 'F': 'FF' };
    var str = LS_expand('X', rules, LS_ITER);

    var DEG = Math.PI / 180.0;
    var baseAngle = LS_ANGLE_BASE * DEG;
    var jitter    = 7.0 * DEG;   // stochastic per-bracket

    // Stack frame: px,py,pz, fwd[3], right[3], step, depth, arcFromRoot, swayPhase
    var stack = [];
    // current turtle
    var px = 0, py = 0, pz = 0;
    var fwd   = [0,1,0];
    var right = [1,0,0];
    var up    = [0,0,1];
    var step  = LS_STEP_BASE;
    var depth = 0;
    var arcFromRoot = 0.0;  // cumulative arc length from root at current turtle head
    var swayPhase   = 0.0;

    // Collect raw segments: [ax,ay,az, bx,by,bz, depth, len, arcAtStart, arcAtEnd, swayPhase] = 11 floats
    // Pre-count F's to size the array
    var fCount = 0;
    for (var ci = 0; ci < str.length; ci++) { if (str[ci]==='F') fCount++; }
    var rawSegs = new Float32Array(fCount * 11 + 11);
    var rawSegCount = 0;
    var totalArcLen = 0;

    for (var ci = 0; ci < str.length; ci++) {
      var c = str[ci];
      var angle = baseAngle + (rand()-0.5)*jitter;

      if (c === 'F') {
        var ax=px, ay=py, az=pz;
        var bx=px+fwd[0]*step, by=py+fwd[1]*step, bz=pz+fwd[2]*step;
        var segLen = step;
        var base = rawSegCount * 11;
        rawSegs[base   ] = ax;  rawSegs[base+1] = ay;  rawSegs[base+2] = az;
        rawSegs[base+3 ] = bx;  rawSegs[base+4] = by;  rawSegs[base+5] = bz;
        rawSegs[base+6 ] = depth;
        rawSegs[base+7 ] = segLen;
        rawSegs[base+8 ] = arcFromRoot;          // arc at start of segment
        rawSegs[base+9 ] = arcFromRoot + segLen; // arc at end of segment
        rawSegs[base+10] = swayPhase;
        rawSegCount++;
        totalArcLen += segLen;
        arcFromRoot += segLen;
        px=bx; py=by; pz=bz;
      } else if (c==='+') {
        fwd   = LS_norm(LS_rot(fwd,   right, angle));
        up    = LS_norm(LS_rot(up,    right, angle));
      } else if (c==='-') {
        fwd   = LS_norm(LS_rot(fwd,   right, -angle));
        up    = LS_norm(LS_rot(up,    right, -angle));
      } else if (c==='/') {
        right = LS_norm(LS_rot(right, fwd,  angle));
        up    = LS_norm(LS_rot(up,    fwd,  angle));
      } else if (c==='\\') {
        right = LS_norm(LS_rot(right, fwd,  -angle));
        up    = LS_norm(LS_rot(up,    fwd,  -angle));
      } else if (c==='[') {
        stack.push([px,py,pz,
                    fwd[0],fwd[1],fwd[2],
                    right[0],right[1],right[2],
                    up[0],up[1],up[2],
                    step, depth, arcFromRoot, swayPhase]);
        depth++;
        step *= LS_STEP_SHRINK;
        // New branch gets a fresh random sway phase
        swayPhase = rand() * 6.28318530718;
      } else if (c===']') {
        if (stack.length > 0) {
          var fr = stack.pop();
          px=fr[0]; py=fr[1]; pz=fr[2];
          fwd   =[fr[3],fr[4],fr[5]];
          right =[fr[6],fr[7],fr[8]];
          up    =[fr[9],fr[10],fr[11]];
          step  =fr[12]; depth=fr[13]; arcFromRoot=fr[14]; swayPhase=fr[15];
        }
      }
      // X is non-terminal, no turtle action
    }

    // Find max depth for colour normalisation
    var maxDepth = 0;
    for (var si = 0; si < rawSegCount; si++) {
      var d = rawSegs[si*11+6];
      if (d > maxDepth) maxDepth = d;
    }
    if (maxDepth < 1) maxDepth = 1;

    // Find max path arc length (from root to the deepest tip) for normalising distRoot.
    // arcEnd of each segment = cumulative path-length from root on THAT branch.
    var maxPathArc = 0;
    for (var si = 0; si < rawSegCount; si++) {
      var arcEnd = rawSegs[si*11+9];
      if (arcEnd > maxPathArc) maxPathArc = arcEnd;
    }
    if (maxPathArc < 1e-8) maxPathArc = 1.0;

    // ---- AABB for scaling ----
    var xMin=1e9,xMax=-1e9,yMin=1e9,yMax=-1e9,zMin=1e9,zMax=-1e9;
    for (var si = 0; si < rawSegCount; si++) {
      var b = si*11;
      var coords = [rawSegs[b],rawSegs[b+1],rawSegs[b+2],rawSegs[b+3],rawSegs[b+4],rawSegs[b+5]];
      if (coords[0]<xMin) xMin=coords[0]; if (coords[0]>xMax) xMax=coords[0];
      if (coords[1]<yMin) yMin=coords[1]; if (coords[1]>yMax) yMax=coords[1];
      if (coords[2]<zMin) zMin=coords[2]; if (coords[2]>zMax) zMax=coords[2];
      if (coords[3]<xMin) xMin=coords[3]; if (coords[3]>xMax) xMax=coords[3];
      if (coords[4]<yMin) yMin=coords[4]; if (coords[4]>yMax) yMax=coords[4];
      if (coords[5]<zMin) zMin=coords[5]; if (coords[5]>zMax) zMax=coords[5];
    }
    var span = Math.max(xMax-xMin, yMax-yMin, zMax-zMin);
    if (span < 1e-6) span = 1.0;
    var scale = 0.76 / span;           // fit in radius ~0.38
    var offX = -(xMin+xMax)*0.5*scale; // center XZ
    var offZ = -(zMin+zMax)*0.5*scale;
    var offY = -yMin*scale - 0.36;     // base at Y=-0.36 (bottom of sphere interior)

    // Scale all arc lengths too
    var arcScale = scale;
    var totalArcScaled = totalArcLen * arcScale;
    var maxPathArcScaled = maxPathArc * arcScale;

    // ---- Distribute N points across segments (weight by segment length * trunk-weight) ----
    var weights = new Float32Array(rawSegCount);
    var totalWeight = 0;
    for (var si = 0; si < rawSegCount; si++) {
      var dep = rawSegs[si*11+6];
      var len = rawSegs[si*11+7];
      var trunkBonus = 1.0 + 2.5 * (1.0 - dep / maxDepth);  // trunk gets ~3.5x density
      weights[si] = len * trunkBonus;
      totalWeight += weights[si];
    }
    var N = LS_N;
    var ptPerSeg = new Int32Array(rawSegCount);
    var allocated = 0;
    var invW = N / totalWeight;
    for (var si = 0; si < rawSegCount; si++) {
      var cnt = Math.max(1, Math.round(weights[si] * invW));
      ptPerSeg[si] = cnt;
      allocated += cnt;
    }
    // Adjust rounding
    var diff = N - allocated;
    var step2 = diff > 0 ? 1 : -1;
    var adjust = Math.abs(diff);
    for (var d = 0; d < adjust; d++) {
      var idx = d % rawSegCount;
      if (step2 < 0 && ptPerSeg[idx] <= 1) { idx = (idx + 1) % rawSegCount; }
      ptPerSeg[idx] += step2;
    }
    // Recount exactly
    var totalN = 0;
    for (var si = 0; si < rawSegCount; si++) totalN += ptPerSeg[si];

    // ---- Fill baked arrays ----
    LS_restX    = new Float32Array(N);
    LS_restY    = new Float32Array(N);
    LS_restZ    = new Float32Array(N);
    LS_distRoot = new Float32Array(N);
    LS_devBase  = new Float32Array(N);
    LS_segPhase = new Float32Array(N);

    var pi = 0;
    // Normalise by max PATH arc (deepest branch path length), not total arc sum.
    // This gives distRoot=0 at base and distRoot=1 at the very tip of the longest branch.
    var invArc = maxPathArcScaled > 1e-8 ? 1.0 / maxPathArcScaled : 1.0;
    for (var si = 0; si < rawSegCount; si++) {
      var b = si*11;
      var ax = rawSegs[b  ]*scale+offX, ay = rawSegs[b+1]*scale+offY, az = rawSegs[b+2]*scale+offZ;
      var bx = rawSegs[b+3]*scale+offX, by = rawSegs[b+4]*scale+offY, bz = rawSegs[b+5]*scale+offZ;
      var dep      = rawSegs[b+6];
      var arcStart = rawSegs[b+8]*arcScale;
      var arcEnd   = rawSegs[b+9]*arcScale;
      var sPhase   = rawSegs[b+10];
      var cnt      = ptPerSeg[si];
      var depFrac  = dep / maxDepth;   // 0=trunk, 1=tips
      var dev      = LS_DEV_TRUNK + depFrac * (LS_DEV_TIP - LS_DEV_TRUNK);
      if (dev < 0.3) dev = 0.3;
      if (dev > 6.0) dev = 6.0;

      var invCnt = cnt > 1 ? 1.0/(cnt-1) : 1.0;
      for (var k = 0; k < cnt && pi < N; k++) {
        var t = cnt > 1 ? k * invCnt : 0.5;
        LS_restX[pi]    = ax + (bx-ax)*t;
        LS_restY[pi]    = ay + (by-ay)*t;
        LS_restZ[pi]    = az + (bz-az)*t;
        // normalised arc from root (0=base, 1=tip of longest branch)
        var arcHere = arcStart + t*(arcEnd-arcStart);
        LS_distRoot[pi] = arcHere * invArc;
        LS_devBase[pi]  = dev;
        LS_segPhase[pi] = sPhase;
        pi++;
      }
    }
    // Fill any leftover (rounding)
    while (pi < N) {
      LS_restX[pi]    = LS_restX[pi-1];
      LS_restY[pi]    = LS_restY[pi-1];
      LS_restZ[pi]    = LS_restZ[pi-1];
      LS_distRoot[pi] = LS_distRoot[pi-1];
      LS_devBase[pi]  = LS_devBase[pi-1];
      LS_segPhase[pi] = LS_segPhase[pi-1];
      pi++;
    }

    LS_N_ACTUAL    = N;
    LS_totalArcLen = totalArcScaled;
  }

  // ================================================================
  //  Generator — called once on scene entry
  // ================================================================
  function generateLsystem() {
    var rand = LS_rng(0xDEADBEEF);
    LS_buildTree(rand);
    LS_time   = 0.0;
    LS_inited = true;

    var N = LS_N_ACTUAL;
    ensurePointCapacity(N);
    // Seed positions to rest state
    for (var i = 0; i < N; i++) {
      var pi = i * 4;
      positions[pi  ] = 0.5 + LS_restX[i];
      positions[pi+1] = 0.5 + LS_restY[i];
      positions[pi+2] = 0.5 + LS_restZ[i];
      positions[pi+3] = LS_devBase[i];
    }
    lifeDrawCount = N;

    lsystemTick(0);
    if (!isLifeField(currentField)) { srAz = 0.9; srEl = 0.35; srR = 1.7; }
    srDragging = false;
    camUp = [0,1,0]; yawVel = 0; pitchVel = 0; rollVel = 0;
    clumps.length = 0;
  }

  // ================================================================
  //  Tick — called every frame
  // ================================================================
  function lsystemTick(dt) {
    var transitioning = (pendingField !== null) || morph < 0.9;
    if (!transitioning) {
      if (!LS_inited) return;
      LS_time += dt;

      var N = LS_N_ACTUAL;
      var t = LS_time;

      // ---- Growth front ----
      // rawFront cycles [0,1] each LS_GROW_CYCLE seconds
      var rawFront = (t % LS_GROW_CYCLE) / LS_GROW_CYCLE;
      // Ease: grow [0,0.75] -> growFront [0,1], hold [0.75,1] -> growFront=1, then restart
      var growFront;
      if (rawFront < 0.75) {
        var u = rawFront / 0.75;
        if (u < 0.5) {
          growFront = 4.0*u*u*u;
        } else {
          var um = u - 1.0;
          growFront = 1.0 + 4.0*um*um*um;
        }
      } else {
        growFront = 1.0;
      }

      // ---- Wind ----
      var windT = t * LS_SWAY_SPEED;

      for (var i = 0; i < N; i++) {
        var pi = i * 4;
        var dist = LS_distRoot[i];  // normalised arc from root [0,1]
        var rx = LS_restX[i];
        var ry = LS_restY[i];
        var rz = LS_restZ[i];

        // ---- Growth: scale from root ----
        // All not-yet-grown points collapse to the tree base (local y=-0.36, x=z=0).
        // As the growth front sweeps from 0->1 (normalised arc-depth), each point
        // transitions from base-position to rest-position with a smooth blend zone.
        var BLEND = 0.07;
        var growAlpha;
        if (dist >= growFront) {
          growAlpha = 0.0;  // above front: at base
        } else if (dist >= growFront - BLEND) {
          var u2 = (growFront - dist) / BLEND;  // 0 at front, 1 at blend edge
          growAlpha = 1.0 - u2 * u2;            // quadratic ease: 0->1 from front backward
        } else {
          growAlpha = 1.0;  // fully revealed
        }
        // Collapsed ("seed") position: tree base
        var SEED_Y = -0.36;
        var worldX = rx * growAlpha;          // lerp from 0
        var worldY = SEED_Y + (ry - SEED_Y) * growAlpha;
        var worldZ = rz * growAlpha;

        // ---- Wind sway ----
        // Amplitude scales with height above base and dist from root (tips sway more)
        var heightFrac = Math.max(0, worldY + 0.36) / 0.78;  // 0 at base, ~1 at top
        var swayAmp = LS_SWAY_AMP * heightFrac * dist;
        var phase = LS_segPhase[i];
        var swayX = swayAmp * Math.sin(windT + phase);
        var swayZ = swayAmp * 0.35 * Math.cos(windT*0.73 + phase + 1.4);

        positions[pi  ] = 0.5 + worldX + swayX;
        positions[pi+1] = 0.5 + worldY;
        positions[pi+2] = 0.5 + worldZ + swayZ;

        // ---- Dev / colour ----
        // Baked depth-based hue, plus tip-glow near the growth front
        var dev = LS_devBase[i];
        if (growFront < 0.98 && dist <= growFront) {
          // Points just behind the front get a growth-glow boost toward bright green
          var proximity = (growFront - dist) / Math.max(growFront, 0.04);
          if (proximity < 0.06) {
            // Spike to bright green/cyan on the leading edge
            dev = dev + (1.0 - proximity/0.06) * (2.5 - dev);
          }
        }
        if (dev < 0.3) dev = 0.3;
        if (dev > 6.0) dev = 6.0;
        positions[pi+3] = dev;
      }
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, lifeDrawCount * 4);
  }

  /* ---- Life scene: Motion (baked glTF point-cloud playback) -------------- */
  // Real creature rigs baked to per-frame point-cloud JSON by tools/bake-gltf-points.js.
  // N fixed surface points sample the mesh at every frame; playback lerps between
  // frames for smooth motion at any rate. Colour rides instantaneous per-point speed
  // (distance between consecutive frames), giving a shimmer-of-motion effect: slow
  // body parts stay cool cyan, fast-moving limbs flare gold and red.

  var MO_CLIPS = {                                 // id -> relative file path
    'mo-fox':          'assets/motion/fox-run.json',
    'mo-horse':        'assets/motion/horse.json',
    'mo-flamingo':     'assets/motion/flamingo.json',
    'mo-parrot':       'assets/motion/parrot.json',
    'mo-stork':        'assets/motion/stork.json',
    'mo-cesiumman':    'assets/motion/cesium-man.json',
    'mo-riggedfigure': 'assets/motion/rigged-figure.json',
    'mo-foxwalk':      'assets/motion/fox-walk.json',
    'mo-robotdance':   'assets/motion/robot-dance.json',
    'mo-robotrun':     'assets/motion/robot-run.json',
    'mo-molecule':     'assets/motion/molecule.json',
    'mo-dna':          'assets/motion/dna.json',
    'mo-protein':      'assets/motion/protein.json'
  };

  // Each animal gets ONE stable colour (a fixed dev on the cyan->green->gold->orange->red
  // ramp) instead of recolouring per-frame by speed -- the old behaviour made every point
  // shimmer through the whole rainbow as the creature moved. The shader's depth cue still
  // shades front/back so a solid colour still reads as a 3D form.
  var MO_DEV = {
    'mo-fox': 4.8, 'mo-foxwalk': 4.8, 'mo-horse': 4.2, 'mo-flamingo': 5.8,
    'mo-parrot': 2.2, 'mo-stork': 1.3, 'mo-cesiumman': 3.5, 'mo-riggedfigure': 3.3,
    'mo-robotdance': 1.6, 'mo-robotrun': 1.6, 'mo-molecule': 2.6, 'mo-dna': 1.8, 'mo-protein': 3.8
  };

  var moClip = null;    // { fps, frameCount, pointCount, frames, dev } -- set on fetch complete
  var moT = 0;          // fractional frame index (advances every tick)
  var moLoading = false;
  var MO_PLAYBACK = 0.5;    // time multiplier: 0.5 = half-speed for a calm, watchable pace

  function isMotionField(f) {
    return !!(MO_CLIPS[f]);
  }

  function generateMotion(id) {
    moClip = null;
    moT = 0;
    moLoading = true;
    var url = MO_CLIPS[id];
    if (!url) return;
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onload = function () {
      if (req.status !== 200) { moLoading = false; return; }
      var data;
      try { data = JSON.parse(req.responseText); } catch (e) { moLoading = false; return; }
      var fc = data.frameCount, N = data.pointCount;
      moClip = {
        fps: data.fps, frameCount: fc, pointCount: N,
        frames: data.frames,
        dev: (MO_DEV[id] != null ? MO_DEV[id] : 3.4)   // this animal's one stable colour
      };
      moLoading = false;
      ensurePointCapacity(N);
      lifeDrawCount = N;
      moT = 0;
      // Frame the creature close, slightly below center so it reads well
      srAz = 0.6; srEl = 0.3; srR = 1.4;
      srDragging = false; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
      motionTick(0);
    };
    req.onerror = function () { moLoading = false; };
    req.send();
    // Reset orbit state immediately while the fetch is in-flight
    srAz = 0.6; srEl = 0.3; srR = 1.4;
    srDragging = false; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0; clumps.length = 0;
  }

  function motionTick(dt) {
    if (!moClip) return;                     // still loading
    var transitioning = (pendingField !== null) || morph < 0.9;
    var clip = moClip, N = clip.pointCount, fc = clip.frameCount;
    var fps = clip.fps, frames = clip.frames, dev = clip.dev;
    if (!transitioning && dt > 0) {
      moT += dt * fps * MO_PLAYBACK;
    }
    var fIdx = Math.floor(moT) % fc;
    var fNext = (fIdx + 1) % fc;
    var alpha = moT - Math.floor(moT);
    var frameA = frames[fIdx], frameB = frames[fNext];
    // One stable colour per animal: dev is constant (no per-frame speed recolouring), so
    // the creature stays a single solid colour as it moves. The shader's depth cue still
    // shades front vs back, so the solid colour still reads as a 3D form.
    var pi, i, x, y, z;
    for (i = 0; i < N; i++) {
      x = frameA[i * 3]     + alpha * (frameB[i * 3]     - frameA[i * 3]);
      y = frameA[i * 3 + 1] + alpha * (frameB[i * 3 + 1] - frameA[i * 3 + 1]);
      z = frameA[i * 3 + 2] + alpha * (frameB[i * 3 + 2] - frameA[i * 3 + 2]);
      // Translate from baker's [-0.5, 0.5] centred coords to [0, 1] for positions
      pi = i * 4;
      positions[pi]     = x + 0.5;
      positions[pi + 1] = y + 0.5;
      positions[pi + 2] = z + 0.5;
      positions[pi + 3] = dev;
    }
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, N * 4);
  }

  function generateSearch(f) {
    var algo = (f === 'bidir') ? 'bidir' : (f === 'dijkstra') ? 'dijkstra' : (f === 'wavefront') ? 'wavefront' : (f === 'randomflood') ? 'randomflood' : (f === 'dfs') ? 'dfs' : (f === 'randomwalk') ? 'randomwalk' : 'bfs';
    searchEnsure();
    // Safety: the search scene writes the N^3 lattice (Region 1) plus up to
    // EDGE_BUDGET route-line points (Region 2). If the dev Particles slider was
    // lowered below that, grow the buffer so Region-2 writes don't truncate.
    ensurePointCapacity(pf.total + EDGE_BUDGET);
    // Rebuild the torus geometry on a FRESH entry from another scene. The
    // positions buffer is SHARED across every scene and the previous one (a sort
    // cylinder, an attractor, ...) clobbered the lattice xyz; searchWriteDev only
    // rewrites the dev channel, so without this the search renders that stale
    // geometry painted as search heat (the "stuck with the sorting one" bug).
    // currentField is still the PREVIOUS field here (loadField sets it after), so
    // an algorithm switch (came from a search scene, buffer intact) keeps the maze.
    if (!pf.built || !isSearchField(currentField)) { searchBuildLattice(); pf.built = true; }
    searchInit(algo);
    searchWriteDev();
    searchBuildActiveLine();
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, (pf.total + pf.lineCount) * 4);
    // Search scenes orbit the torus (the camera section computes camPos each
    // frame from these). Frame it from a 3/4 angle so the donut's hole + depth
    // read at once, then let it auto-spin. Only re-frame on a FRESH entry from
    // another scene; switching algorithm keeps the orbit going (currentField is
    // still the previous field here, so this tests "did we come from a search scene").
    if (!isSearchField(currentField)) { srAz = 0.9; srEl = 0.62; srR = 1.5; srSweep = 0; }   // srSweep 0 -> the roam eases in on a fresh entry instead of starting mid-sweep
    srDragging = false;
    camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0;
    clumps.length = 0;
  }

  // ---- Search scene overlay: START/END callouts + live stats HUD -----------
  // Projects the start/end lattice beacons to screen space each frame and draws
  // an SVG leader-line + label at each, plus a corner panel with the elapsed
  // timer, iteration count, explored/frontier counts, path length and the
  // search-space size. Pure DOM/SVG layered over the canvas; only shown on the
  // pathfinding scenes (isSearchField). projectWorldToScreen replicates the
  // shader's pathMode transform exactly: proj * (view * (center - camPos)).
  var searchHudBuilt = false, searchSvgEl = null, searchHudEl = null, hudLastField = null;
  var shStart = {}, shEnd = {}, shVal = {}, shRouteG = null, shRouteSegs = [];
  var ALGO_NAME = { bfs: 'Breadth-First', bidir: 'Bidirectional BFS', dijkstra: 'Stochastic Dijkstra', wavefront: 'Multi-Source Wavefront', randomflood: 'Noisy Flood', dfs: 'Depth-First', randomwalk: 'Random Walk' };

  function fmtInt(n) { n = n | 0; var s = '' + Math.abs(n), out = '', c = 0, i; for (i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = ',' + out; } return (n < 0 ? '-' : '') + out; }
  function bigComma(b) { var s = b.toString(), out = '', c = 0, i; for (i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = ',' + out; } return out; }
  // Exact number of distinct monotone (axis-positive) routes from start to end
  // across the open grid: the multinomial T! / (span!)^3 (T = 3*span). Computed
  // with BigInt so the whole ~48-digit number prints, comma-grouped.
  function estimateRouteCount(N) {
    var span = (N - 3) - 2; if (span < 1) return '1';
    var T = 3 * span, num = 1n, den = 1n, i;
    for (i = 2; i <= T; i++) num *= BigInt(i);
    for (i = 2; i <= span; i++) den *= BigInt(i);
    return bigComma(num / (den * den * den));
  }

  function projectWorldToScreen(wx, wy, wz, W, H) {
    var rx = wx - camPos[0], ry = wy - camPos[1], rz = wz - camPos[2];   // pathMode: world = center - camPos
    var vx = viewMat[0]*rx + viewMat[4]*ry + viewMat[8]*rz + viewMat[12];
    var vy = viewMat[1]*rx + viewMat[5]*ry + viewMat[9]*rz + viewMat[13];
    var vz = viewMat[2]*rx + viewMat[6]*ry + viewMat[10]*rz + viewMat[14];
    var vw = viewMat[3]*rx + viewMat[7]*ry + viewMat[11]*rz + viewMat[15];
    var cx = projMat[0]*vx + projMat[4]*vy + projMat[8]*vz + projMat[12]*vw;
    var cy = projMat[1]*vx + projMat[5]*vy + projMat[9]*vz + projMat[13]*vw;
    var cw = projMat[3]*vx + projMat[7]*vy + projMat[11]*vz + projMat[15]*vw;
    if (cw <= 0.0001) return null;                                       // behind the camera
    var dist = Math.sqrt(rx*rx + ry*ry + rz*rz);                         // world distance from the camera, for depth cueing
    return [(cx / cw * 0.5 + 0.5) * W, (0.5 - cy / cw * 0.5) * H, dist];
  }

  function placeCallout(g, idx, W, H) {
    var c = projectWorldToScreen(positions[idx*4], positions[idx*4+1], positions[idx*4+2], W, H);
    if (!c) { g.ring.style.display = 'none'; g.line.style.display = 'none'; g.txt.style.display = 'none'; return; }
    g.ring.style.display = ''; g.line.style.display = ''; g.txt.style.display = '';
    var sx = c[0], sy = c[1];
    var lx = Math.max(40, Math.min(W - 40, sx + 24)), ly = Math.max(22, Math.min(H - 14, sy - 26));   // label offset + clamp on-screen
    g.ring.setAttribute('cx', sx); g.ring.setAttribute('cy', sy);
    g.line.setAttribute('x1', sx); g.line.setAttribute('y1', sy); g.line.setAttribute('x2', lx); g.line.setAttribute('y2', ly);
    g.txt.setAttribute('x', lx); g.txt.setAttribute('y', ly - 4);
    g.txt.setAttribute('text-anchor', lx > W - 80 ? 'end' : 'start');
  }

  function ensureSearchHUD() {
    if (searchHudBuilt) return;
    var host = canvas && canvas.parentNode; if (!host) return;
    if (window.getComputedStyle && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var st = document.createElement('style');
    st.textContent =
      '#gx-search-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:42;overflow:visible;}' +
      '#gx-search-svg text{font-family:var(--d-mono,monospace);font-weight:700;font-size:12px;letter-spacing:0.18em;' +
        'paint-order:stroke;stroke:#03060e;stroke-width:3.5px;stroke-linejoin:round;}' +
      '#gx-search-hud{position:absolute;right:10px;top:50px;z-index:44;min-width:132px;max-width:182px;' +
        'background:rgba(8,10,18,0.64);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:7px 9px;' +
        'font-family:var(--d-mono,monospace);font-size:10px;color:#cdd6e6;box-shadow:0 4px 16px rgba(0,0,0,0.42);' +
        '-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);pointer-events:none;}' +
      '#gx-search-hud .gx-sh-algo{font-size:10.5px;letter-spacing:0.12em;text-transform:uppercase;color:#fff;font-weight:700;line-height:1.25;}' +
      '#gx-search-hud .gx-sh-status{font-size:9px;letter-spacing:0.09em;text-transform:uppercase;color:#7fd4ff;margin-bottom:6px;}' +
      '#gx-search-hud .gx-sh-row{display:flex;justify-content:space-between;gap:12px;margin:1.5px 0;}' +
      '#gx-search-hud .gx-sh-row span:first-child{color:#8190a8;}' +
      '#gx-search-hud .gx-sh-row span:last-child{color:#fff;font-variant-numeric:tabular-nums;}' +
      '#gx-search-svg .gx-route{filter:drop-shadow(0 0 3px rgba(180,210,255,0.45));}' +
      '#gx-search-hud .gx-sh-ctrl{display:flex;align-items:center;gap:6px;margin-top:7px;}' +
      '#gx-search-hud .gx-sh-ctrl-top{margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);}' +
      '#gx-search-hud .gx-sh-btn{pointer-events:auto;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:0.03em;' +
        'color:#cdd6e6;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:5px;padding:4px 9px;' +
        'transition:background .15s,border-color .15s,color .15s;}' +
      '#gx-search-hud .gx-sh-btn:hover{background:rgba(127,212,255,0.18);border-color:rgba(127,212,255,0.5);color:#fff;}' +
      '#gx-search-hud .gx-sh-btn.on{background:rgba(127,212,255,0.22);border-color:#7fd4ff;color:#fff;}' +
      '#gx-search-hud .gx-sh-clab{color:#8190a8;}' +
      '#gx-search-hud .gx-sh-spd{min-width:30px;text-align:center;color:#fff;font-variant-numeric:tabular-nums;}' +
      '#galaxy-wrapper.gx-clean #gx-search-hud{display:none!important;}';   // clean/screenshot mode keeps the callouts, hides the stats chrome
    document.head.appendChild(st);

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('id', 'gx-search-svg');
    function mkGroup(color, label) {
      var line = document.createElementNS(NS, 'line'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.6'); line.setAttribute('opacity', '0.85');
      var ring = document.createElementNS(NS, 'circle'); ring.setAttribute('r', '12'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', color); ring.setAttribute('stroke-width', '2'); ring.setAttribute('opacity', '0.92');
      var txt = document.createElementNS(NS, 'text'); txt.setAttribute('fill', color); txt.textContent = label;
      svg.appendChild(line); svg.appendChild(ring); svg.appendChild(txt);
      return { line: line, ring: ring, txt: txt };
    }
    var routeG = document.createElementNS(NS, 'g'); routeG.setAttribute('class', 'gx-route');   // depth-cued route: a pool of per-segment lines, coloured near->far (under the beacons)
    svg.appendChild(routeG); shRouteG = routeG;
    shStart = mkGroup('#7fe7ff', 'START');
    shEnd = mkGroup('#ffce6a', 'END');
    host.appendChild(svg); searchSvgEl = svg;

    var hud = document.createElement('div'); hud.setAttribute('id', 'gx-search-hud');
    var algo = document.createElement('div'); algo.className = 'gx-sh-algo'; hud.appendChild(algo); shVal.algo = algo;
    var status = document.createElement('div'); status.className = 'gx-sh-status'; hud.appendChild(status); shVal.status = status;
    function row(label) {
      var d = document.createElement('div'); d.className = 'gx-sh-row';
      var a = document.createElement('span'); a.textContent = label;
      var b = document.createElement('span'); b.textContent = '—';
      d.appendChild(a); d.appendChild(b); hud.appendChild(d); return b;
    }
    shVal.time = row('Time'); shVal.expl = row('Explored'); shVal.path = row('Path');

    // Controls: Retry (re-run the same maze), Loop (auto-restart toggle), Speed -/+.
    function refocus() { try { canvas.focus(); } catch (e) {} }   // keep WASD steering after a click
    function mkBtn(label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'gx-sh-btn'; b.textContent = label;
      b.addEventListener('click', function (ev) { ev.preventDefault(); fn(); refocus(); });
      return b;
    }
    var ctrlA = document.createElement('div'); ctrlA.className = 'gx-sh-ctrl gx-sh-ctrl-top';
    ctrlA.appendChild(mkBtn('Retry', function () { if (pf && pf.built) searchInit(pf.algo); }));
    var btnLoop = mkBtn('Loop', function () { searchLoop = !searchLoop; btnLoop.className = 'gx-sh-btn' + (searchLoop ? ' on' : ''); });
    btnLoop.className = 'gx-sh-btn' + (searchLoop ? ' on' : '');
    ctrlA.appendChild(btnLoop); hud.appendChild(ctrlA);
    var ctrlB = document.createElement('div'); ctrlB.className = 'gx-sh-ctrl';
    var clab = document.createElement('span'); clab.className = 'gx-sh-clab'; clab.textContent = 'Speed'; ctrlB.appendChild(clab);
    ctrlB.appendChild(mkBtn('−', function () { SEARCH_STEPS = Math.max(0.01, SEARCH_STEPS <= 1 ? Math.round(SEARCH_STEPS * 0.6 * 100) / 100 : Math.max(1, Math.round(SEARCH_STEPS * 0.6))); }));   // below 1 -> slow-mo crawl, down to 0.01
    var spd = document.createElement('span'); spd.className = 'gx-sh-spd'; spd.textContent = SEARCH_STEPS < 1 ? SEARCH_STEPS.toFixed(2) : SEARCH_STEPS; ctrlB.appendChild(spd); shVal.spd = spd;
    ctrlB.appendChild(mkBtn('+', function () { SEARCH_STEPS = Math.min(240, SEARCH_STEPS < 1 ? Math.round(SEARCH_STEPS * 1.7 * 100) / 100 : Math.round(SEARCH_STEPS * 1.7)); }));
    hud.appendChild(ctrlB);
    // (The loop transition is fixed to Supernova; the style-cycle button was removed.)

    host.appendChild(hud); searchHudEl = hud;

    searchHudBuilt = true;
  }

  function updateSearchHUD() {
    var on = isSearchField(currentField) && pf && pf.built;
    if (!searchHudBuilt) { if (!on) return; ensureSearchHUD(); if (!searchHudBuilt) return; }
    if (!on) { searchSvgEl.style.display = 'none'; searchHudEl.style.display = 'none'; hudLastField = null; return; }
    searchSvgEl.style.display = ''; searchHudEl.style.display = '';
    var W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
    placeCallout(shStart, pf.start, W, H);
    placeCallout(shEnd, pf.end, W, H);
    if (hudLastField !== currentField) {   // static parts: only rewrite when the scene changes
      hudLastField = currentField;
      shVal.algo.textContent = ALGO_NAME[pf.algo] || pf.algo;
    }
    shVal.status.textContent = pf.reached ? 'reached ✓' : (pf.done ? 'no path found' : 'searching…');
    shVal.status.style.color = pf.reached ? '#8effc0' : (pf.done ? '#ff9a8a' : '#7fd4ff');
    shVal.time.textContent = (pf.elapsed || 0).toFixed(1) + ' s';
    shVal.expl.textContent = fmtInt((pf.cClosed | 0) + (pf.cPath | 0)) + ' / ' + fmtInt(pf.cFree || 0);
    shVal.path.textContent = pf.reached ? fmtInt((pf.cPath | 0) + 2) + ' cells' : '—';
    if (shVal.spd) shVal.spd.textContent = SEARCH_STEPS < 1 ? SEARCH_STEPS.toFixed(2) : Math.round(SEARCH_STEPS);

    // Depth-cued route line. During a transition the cells animate, so we freeze
    // the line's shape and just fade it out; otherwise rebuild it from the chain,
    // colouring each segment near (warm white, thick, opaque) -> far (cool blue,
    // thin, faint) so it reads which part of the path is close to you in 3D.
    if (pf.phase === 'fade') {
      if (shRouteG) shRouteG.style.opacity = Math.max(0, 1 - pf.fadeT * 1.3).toFixed(3);
    } else {
      var node = pf.reached ? pf.end : pf.lastClosed, raw = [], guard = 0, c;
      while (node >= 0 && guard < 4000) {
        c = projectWorldToScreen(positions[node*4], positions[node*4+1], positions[node*4+2], W, H);
        if (c) raw.push(c);                                 // [screenX, screenY, camDist]
        if (node === pf.start) break;
        node = pf.came[node]; guard++;
      }
      var SEG_CAP = 240, ptsA = raw;                        // sample very long paths (DFS) down so the SVG stays light
      if (raw.length > SEG_CAP + 1) { ptsA = []; var stride = raw.length / (SEG_CAP + 1), si; for (si = 0; si <= SEG_CAP; si++) ptsA.push(raw[Math.min(raw.length - 1, Math.floor(si * stride))]); }
      var dmin = Infinity, dmax = -Infinity, qd; for (qd = 0; qd < ptsA.length; qd++) { var dv = ptsA[qd][2]; if (dv < dmin) dmin = dv; if (dv > dmax) dmax = dv; }
      var drange = (dmax - dmin) || 1;
      var gOp = 0.55, wMul = 1;
      if (pf.phase === 'show') { var pu = 0.5 + 0.5 * Math.sin(gxTime * 7); gOp = 0.8 + 0.2 * pu; wMul = 1 + 0.45 * pu; }   // celebrate: pulse
      if (shRouteG) {
        shRouteG.style.opacity = gOp.toFixed(3);
        var nseg = Math.max(0, ptsA.length - 1), iS, seg, a, b, t, r, g2, bl;
        for (iS = 0; iS < nseg; iS++) {
          a = ptsA[iS]; b = ptsA[iS + 1]; seg = shRouteSegs[iS];
          if (!seg) { seg = document.createElementNS('http://www.w3.org/2000/svg', 'line'); seg.setAttribute('stroke-linecap', 'round'); shRouteG.appendChild(seg); shRouteSegs[iS] = seg; }
          seg.style.display = '';
          seg.setAttribute('x1', a[0].toFixed(1)); seg.setAttribute('y1', a[1].toFixed(1));
          seg.setAttribute('x2', b[0].toFixed(1)); seg.setAttribute('y2', b[1].toFixed(1));
          t = ((a[2] + b[2]) * 0.5 - dmin) / drange;        // 0 = nearest part of the path, 1 = farthest
          r = Math.round(255 + (90 - 255) * t); g2 = Math.round(242 + (130 - 242) * t); bl = Math.round(205 + (255 - 205) * t);
          seg.setAttribute('stroke', 'rgb(' + r + ',' + g2 + ',' + bl + ')');
          seg.setAttribute('stroke-width', ((2.8 - 1.7 * t) * wMul).toFixed(1));
          seg.setAttribute('stroke-opacity', (1 - 0.5 * t).toFixed(2));
        }
        for (iS = nseg; iS < shRouteSegs.length; iS++) if (shRouteSegs[iS]) shRouteSegs[iS].style.display = 'none';
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.GXSEARCH = {
      reset: function (algo, n) {
        if (n) SEARCH_N = n;
        searchEnsure();
        if (!pf.built) { searchBuildLattice(); pf.built = true; }
        searchInit(algo || 'bfs');
        return window.GXSEARCH.stats();
      },
      step: function (k) {
        var i; k = k || 1;
        for (i = 0; i < k && !pf.reached && !pf.done; i++) searchStep();
        if ((pf.reached || pf.done) && !pf.pathTraced) { searchTracePath(); pf.pathTraced = true; }
        searchBuildActiveLine();
        return window.GXSEARCH.stats();
      },
      stats: function () {
        if (!pf) return { error: 'no search' };
        var i, u=0, fr=0, vi=0, pa=0, wa=0;
        for (i = 0; i < pf.total; i++) {
          if (pf.wall[i]) { wa++; continue; }
          var s = pf.state[i];
          if (s === 0) u++; else if (s === 2 || s === 4) fr++; else if (s === 1 || s === 5) vi++; else if (s === 3) pa++;
        }
        var pl = 0, ok = false;
        if (pf.reached) { var node = pf.end, g = 0; while (node >= 0 && node !== pf.start && g < pf.total) { pl++; node = pf.came[node]; g++; } ok = (node === pf.start); }
        return { algo: pf.algo, N: pf.N, total: pf.total, reached: pf.reached, done: pf.done, steps: pf.steps,
                 unvisited: u, frontier: fr, visited: vi, path: pa, walls: wa, pathLen: pl, pathConnectsToStart: ok,
                 lineCount: pf.lineCount, head: pf.lastClosed };
      }
    };
  }
  // ====== END PATHFINDING SEARCH ======

  // ====== SORTING (live, stateful scene) ======
  // A sorting algorithm visualized as a "Comparison Cylinder" you fly down: each
  // array element is a glowing RING of points; the ring's RADIUS + COLOUR encode
  // its value, and its DEPTH (z along the bore) is its current array slot. Sorting
  // smooths a scrambled tube of rings into a clean monotonic horn. Mirrors the
  // pathfinding scene's shape: a pre-recorded op list replayed a few ops/frame,
  // positions eased toward target slots, dev driving the same colour tiers.
  //
  // RECORDERS: each sortRecord_X(vals) runs the sort on a copy and returns an op
  // list; each op is [t,a,b]: t=0 COMPARE slots a,b (highlight), t=1 SWAP slots a,b.
  // Replaying just the swaps (in order) sorts the value array ascending.
  function sortRecord_selection(vals){ var arr=vals.slice(),ops=[],n=arr.length,i,j,m,t; for(i=0;i<n;i++){m=i;for(j=i+1;j<n;j++){ops.push([0,m,j]);if(arr[j]<arr[m])m=j;}if(m!==i){ops.push([1,i,m]);t=arr[i];arr[i]=arr[m];arr[m]=t;}}return ops; }
  function sortRecord_bubble(vals){ var arr=vals.slice(),ops=[],n=arr.length,i,j,t,sw; for(i=0;i<n-1;i++){sw=false;for(j=0;j<n-1-i;j++){ops.push([0,j,j+1]);if(arr[j]>arr[j+1]){ops.push([1,j,j+1]);t=arr[j];arr[j]=arr[j+1];arr[j+1]=t;sw=true;}}if(!sw)break;}return ops; }
  function sortRecord_cocktail(vals){ var arr=vals.slice(),ops=[],n=arr.length,lo=0,hi=n-1,i,t,sw; while(lo<hi){sw=false;for(i=lo;i<hi;i++){ops.push([0,i,i+1]);if(arr[i]>arr[i+1]){ops.push([1,i,i+1]);t=arr[i];arr[i]=arr[i+1];arr[i+1]=t;sw=true;}}hi--;for(i=hi;i>lo;i--){ops.push([0,i-1,i]);if(arr[i-1]>arr[i]){ops.push([1,i-1,i]);t=arr[i-1];arr[i-1]=arr[i];arr[i]=t;sw=true;}}lo++;if(!sw)break;}return ops; }
  function sortRecord_insertion(vals){ var arr=vals.slice(),ops=[],n=arr.length,i,j,t; for(i=1;i<n;i++){j=i;while(j>0){ops.push([0,j-1,j]);if(arr[j-1]>arr[j]){ops.push([1,j-1,j]);t=arr[j-1];arr[j-1]=arr[j];arr[j]=t;j--;}else break;}}return ops; }
  function sortRecord_gnome(vals){ var arr=vals.slice(),ops=[],n=arr.length,pos=0,t; while(pos<n){if(pos===0){pos++;continue;}ops.push([0,pos-1,pos]);if(arr[pos-1]<=arr[pos]){pos++;}else{ops.push([1,pos-1,pos]);t=arr[pos-1];arr[pos-1]=arr[pos];arr[pos]=t;pos--;}}return ops; }
  function sortRecord_shell(vals){ var arr=vals.slice(),ops=[],n=arr.length,gap,i,j,t; for(gap=Math.floor(n/2);gap>=1;gap=Math.floor(gap/2)){for(i=gap;i<n;i++){j=i;while(j>=gap){ops.push([0,j-gap,j]);if(arr[j-gap]>arr[j]){ops.push([1,j-gap,j]);t=arr[j-gap];arr[j-gap]=arr[j];arr[j]=t;j-=gap;}else break;}}}return ops; }
  function sortRecord_comb(vals){ var arr=vals.slice(),ops=[],n=arr.length,gap=n,sw=true,i,t; while(gap>1||sw){gap=Math.floor(gap/1.3);if(gap<1)gap=1;sw=false;for(i=0;i+gap<n;i++){ops.push([0,i,i+gap]);if(arr[i]>arr[i+gap]){ops.push([1,i,i+gap]);t=arr[i];arr[i]=arr[i+gap];arr[i+gap]=t;sw=true;}}}return ops; }
  function sortRecord_heap(vals){ var arr=vals.slice(),ops=[],n=arr.length,i,end,t;
    function sift(root,size){ var r=root,l,rc,big; while(true){ l=2*r+1; rc=2*r+2; big=r; if(l<size){ops.push([0,l,big]);if(arr[l]>arr[big])big=l;} if(rc<size){ops.push([0,rc,big]);if(arr[rc]>arr[big])big=rc;} if(big===r)break; ops.push([1,r,big]);t=arr[r];arr[r]=arr[big];arr[big]=t;r=big; } }
    for(i=Math.floor(n/2)-1;i>=0;i--)sift(i,n);
    for(end=n-1;end>0;end--){ops.push([1,0,end]);t=arr[0];arr[0]=arr[end];arr[end]=t;sift(0,end);}
    return ops; }
  function sortRecord_quick(vals){ var arr=vals.slice(),ops=[],n=arr.length; if(n<2)return ops; function cmp(a,b){ops.push([0,a,b]);return arr[a]<arr[b];} function swap(a,b){if(a===b)return;ops.push([1,a,b]);var t=arr[a];arr[a]=arr[b];arr[b]=t;} var stack=[],lo,hi,mid,i,j,p; stack.push(0);stack.push(n-1); while(stack.length){hi=stack.pop();lo=stack.pop();if(lo>=hi)continue;mid=lo+((hi-lo)>>1);if(mid!==lo){if(cmp(mid,lo))swap(mid,lo);if(cmp(hi,lo))swap(hi,lo);if(cmp(hi,mid))swap(hi,mid);swap(mid,hi);}else{if(cmp(hi,lo))swap(hi,lo);}p=hi;i=lo;for(j=lo;j<hi;j++){if(cmp(j,p)){swap(i,j);i++;}}swap(i,hi);stack.push(lo);stack.push(i-1);stack.push(i+1);stack.push(hi);}return ops; }
  function sortRecord_bitonic(vals){ var arr=vals.slice(),ops=[],n=arr.length; for(var k=2;k<=n;k*=2){for(var j=k/2;j>0;j=Math.floor(j/2)){for(var i=0;i<n;i++){var l=i^j;if(l>i){var asc=((i&k)===0);ops.push([0,i,l]);if((asc&&arr[i]>arr[l])||(!asc&&arr[i]<arr[l])){var t=arr[i];arr[i]=arr[l];arr[l]=t;ops.push([1,i,l]);}}}}}return ops; }
  function sortRecord_oddeven(vals){ var arr=vals.slice(),ops=[],n=arr.length; for(var phase=0;phase<n;phase++){var start=phase%2;for(var i=start;i+1<n;i+=2){ops.push([0,i,i+1]);if(arr[i]>arr[i+1]){var t=arr[i];arr[i]=arr[i+1];arr[i+1]=t;ops.push([1,i,i+1]);}}}return ops; }
  function sortRecord_pancake(vals){ var arr=vals.slice(),ops=[],n=arr.length; function flip(k){var lo=0,hi=k,t;for(;lo<hi;lo++,hi--){ops.push([1,lo,hi]);t=arr[lo];arr[lo]=arr[hi];arr[hi]=t;}} for(var cs=n;cs>=2;cs--){var mi=0;for(var i=1;i<cs;i++){ops.push([0,mi,i]);if(arr[i]>arr[mi])mi=i;}if(mi!==cs-1){if(mi!==0)flip(mi);flip(cs-1);}}return ops; }
  function sortRecord_bogo(vals){ var arr=vals.slice(),ops=[],n=arr.length,CAP=6000; function isSorted(){for(var i=0;i+1<n;i++){ops.push([0,i,i+1]);if(arr[i]>arr[i+1])return false;}return true;} if(n<=1)return ops; while(!isSorted()){if(ops.length>=CAP)break;for(var i=n-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));if(j!==i){ops.push([1,i,j]);var t=arr[i];arr[i]=arr[j];arr[j]=t;}}} for(var s=0;s<n-1;s++){var mi=s;for(var k=s+1;k<n;k++){ops.push([0,mi,k]);if(arr[k]<arr[mi])mi=k;}if(mi!==s){ops.push([1,s,mi]);var tt=arr[s];arr[s]=arr[mi];arr[mi]=tt;}}return ops; }

  var SORT_ALGOS = ['selection','bubble','cocktail','insertion','gnome','shell','comb','quick','heap','bitonic','oddeven','pancake','bogo'];
  function sortRecorderFor(a){
    switch(a){ case 'bubble':return sortRecord_bubble; case 'cocktail':return sortRecord_cocktail; case 'insertion':return sortRecord_insertion;
      case 'gnome':return sortRecord_gnome; case 'shell':return sortRecord_shell; case 'comb':return sortRecord_comb; case 'quick':return sortRecord_quick;
      case 'heap':return sortRecord_heap; case 'bitonic':return sortRecord_bitonic; case 'oddeven':return sortRecord_oddeven;
      case 'pancake':return sortRecord_pancake; case 'bogo':return sortRecord_bogo; default:return sortRecord_selection; }
  }
  function isSortField(f){ return SORT_ALGOS.indexOf(f) >= 0; }

  var SORT_N = 128;            // elements (power of two so bitonic works)
  var SORT_BOGO_N = 7;         // bogosort uses a tiny array (it is a gag)
  var SORT_TOTAL = 96000;      // total points across all rings (dense tubes so the donuts read solid, not dotty)
  var SORT_STEPS = 0.5;        // ops replayed per frame (fractional: < 1 crawls one op every few frames; dev Speed -/+ from 0.1 .. 120)
  var SORT_SPAN = 0.48;        // cylinder length along the bore (z)
  var SORT_Z0 = 0.18;          // near end of the cylinder
  var SORT_R0 = 0.022, SORT_RW = 0.108;   // ring radius = R0 + value*RW (much smaller cylinder)
  var SORT_TUBE = 0.014;       // ring tube thickness: each ring is a chunky torus donut, not a thin wire or a filled disc
  var SORT_READY = 0.3;        // brief pause on a fresh ENTRY before sorting starts (algo switches now fly-transition via the shuffle phase instead)
  var SORT_SHOW = 1.4;         // seconds to hold the sorted horn before reshuffling
  var SORT_SHUF = 0.7;         // seconds for the rings to fly to a fresh scramble
  var sortLoop = true;
  var SORT_SLICES = 80;        // History tapestry: time-slices baked into the monument
  var HELIX_W = 0.84;          // tapestry width (array-slot axis)
  var HELIX_H = 0.86;          // tapestry height (time axis: top = start/chaos, base = sorted)
  var HELIX_RELIEF = 0.16;     // 3D relief depth by value (so the wall undulates, not flat)
  var HELIX_SWEEP = 5.0;       // seconds for the playhead band to sweep the whole timeline
  var sr = null;               // sort state

  function sortEnsure(algo){
    var n = (algo === 'bogo') ? SORT_BOGO_N : SORT_N;
    if (!sr || sr.n !== n) {
      sr = { n:n, K:Math.floor(SORT_TOTAL / n), total:0, vals:new Float32Array(n), cur:new Int32Array(n),
             slotOf:new Int32Array(n), x:new Float32Array(n), age:new Float32Array(n), flag:new Int8Array(n),
             ops:[], opPtr:0, cmp:0, swaps:0, algo:algo, phase:'sort', holdT:0, shufT:0, built:false,
             view:'live', hist:null, helixTotal:0, playhead:0, aSwap:0, aCmp:-1, stepAcc:0, readyT:0 };
      sr.total = sr.n * sr.K;
    }
    sr.algo = algo;
    return sr;
  }
  function sortScramble(){
    var n = sr.n, i, j, t;
    for (i = 0; i < n; i++) sr.cur[i] = i;
    for (i = n - 1; i > 0; i--) { j = (Math.random() * (i + 1)) | 0; t = sr.cur[i]; sr.cur[i] = sr.cur[j]; sr.cur[j] = t; }
    for (i = 0; i < n; i++) sr.slotOf[sr.cur[i]] = i;
  }
  function sortBuildOps(){
    var n = sr.n, va = new Array(n), s;
    for (s = 0; s < n; s++) va[s] = sr.vals[sr.cur[s]];     // current value at each slot
    sr.ops = sortRecorderFor(sr.algo)(va);
    sr.opPtr = 0; sr.cmp = 0; sr.swaps = 0; sr.stepAcc = 0;
  }
  function sortStep(){
    if (sr.opPtr >= sr.ops.length) return;
    var op = sr.ops[sr.opPtr++], t = op[0], a = op[1], b = op[2];
    if (t === 0) { sr.cmp++; var e1 = sr.cur[a], e2 = sr.cur[b]; sr.flag[e1] = 1; sr.age[e1] = 0; sr.flag[e2] = 1; sr.age[e2] = 0; if (sortAudio.on && sortFNCount < 512) { sortFNVal[sortFNCount] = sr.vals[e1]; sortFNSwap[sortFNCount] = 0; sortFNCount++; } }
    else { sr.swaps++; var x = sr.cur[a], y = sr.cur[b]; sr.cur[a] = y; sr.cur[b] = x; sr.slotOf[y] = a; sr.slotOf[x] = b; sr.flag[x] = 2; sr.age[x] = 0; sr.flag[y] = 2; sr.age[y] = 0; if (sortAudio.on && sortFNCount < 512) { sortFNVal[sortFNCount] = sr.vals[x]; sortFNSwap[sortFNCount] = 1; sortFNCount++; } }
  }
  function sortLayout(){
    var n = sr.n, K = sr.K, e, j, idx, p, bz, R, val, dev, fl, base, twoPi = 6.2831853;
    var MINOR = 6, tubeR = SORT_TUBE, majorCount = Math.floor(K / MINOR); if (majorCount < 1) majorCount = 1;
    for (e = 0; e < n; e++) {
      p = sr.x[e]; val = sr.vals[e];
      R = SORT_R0 + val * SORT_RW;
      bz = SORT_Z0 + (n > 1 ? p / (n - 1) : 0) * SORT_SPAN;
      dev = 1.0 + val * 5.0;                                // colour by value (cool -> hot)
      fl = sr.flag[e];
      if (fl === 1) dev = 6.7;                              // comparing: white flash (sort band 6.5-7.0)
      else if (fl === 2) dev = 7.6;                         // swapping: gold pop (sort band 7.0-8.0)
      base = e * K;
      for (j = 0; j < K; j++) {                             // ring as a torus tube (hollow donut), densely sampled so it reads solid
        var maj = j % majorCount, mi = (j / majorCount) | 0;
        var u = twoPi * maj / majorCount, v = twoPi * mi / MINOR;
        var ringR = R + tubeR * Math.cos(v);
        idx = (base + j) * 4;
        positions[idx]   = 0.5 + ringR * Math.cos(u);
        positions[idx+1] = 0.5 + ringR * Math.sin(u);
        positions[idx+2] = bz + tubeR * Math.sin(v);
        positions[idx+3] = dev;
      }
    }
  }
  // ----- Helix of History: bake the whole sort timeline into one static monument -----
  // Replay the ops, snapshotting the value-at-each-slot at SORT_SLICES evenly-spaced
  // moments. The tower stacks those slices: height = time (chaos at the crown ->
  // sorted rainbow at the base), angle = array slot, colour = value, with a gentle
  // helical twist. Static (built once); you fly around it.
  function sortBuildHistory(){
    var T = SORT_SLICES, n = sr.n, ops = sr.ops, m = ops.length, s, t, op, a, b, tmp, target, opi = 0;
    if (!sr.hist || sr.hist.length !== T * n) sr.hist = new Float32Array(T * n);
    var va = new Float32Array(n);
    for (s = 0; s < n; s++) va[s] = sr.vals[sr.cur[s]];     // value at each slot, at the scrambled start
    for (t = 0; t < T; t++) {
      target = (T > 1) ? Math.round(t / (T - 1) * m) : m;
      while (opi < target) { op = ops[opi++]; if (op[0] === 1) { a = op[1]; b = op[2]; tmp = va[a]; va[a] = va[b]; va[b] = tmp; } }
      for (s = 0; s < n; s++) sr.hist[t * n + s] = va[s];
    }
  }
  // The monument is a space-time TAPESTRY (a glowing wall): x = array slot,
  // y = time (chaos at the top, sorted rainbow at the base), colour = value, with
  // a gentle 3D relief by value. A bright "playhead" band sweeps top->bottom so
  // you watch the whole sort resolve through time at once.
  function helixLayout(){
    var T = SORT_SLICES, n = sr.n, t, s, kk, idx, val, dev, p = 0, G = 4;   // 4x4 = 16 points per cell, tiling the full cell so the wall is solid + bright
    var W = HELIX_W, H = HELIX_H, x0 = 0.5 - W * 0.5, ytop = 0.5 + H * 0.5, dX = W / n, dY = H / T, relief = HELIX_RELIEF;
    var ph = sr.playhead;
    var revealed = ph >= T ? T : (Math.floor(ph) + 1); if (revealed > T) revealed = T; if (revealed < 1) revealed = 1;
    var edge = Math.floor(ph), building = (ph < T);          // the monument writes in from the top (start) down to the sorted base
    for (t = 0; t < revealed; t++) {
      var y = ytop - (T > 1 ? t / (T - 1) : 0) * H;
      var lit = building && (t >= edge - 1);                 // glowing writing edge as the history draws downward
      for (s = 0; s < n; s++) {
        val = sr.hist[t * n + s];
        dev = lit ? 6.7 : (1.0 + val * 5.0);                 // playhead flashes white; otherwise colour by value
        var cx2 = x0 + (s + 0.5) * dX, z2 = 0.5 + (val - 0.5) * relief;
        for (kk = 0; kk < 16; kk++) {
          var ax = kk % G, ay = (kk / G) | 0;
          idx = p * 4;
          positions[idx]   = cx2 + (ax / (G - 1) - 0.5) * dX * 1.08;
          positions[idx+1] = y + (ay / (G - 1) - 0.5) * dY * 1.08;
          positions[idx+2] = z2;
          positions[idx+3] = dev;
          p++;
        }
      }
    }
    sr.helixTotal = p;
  }
  // Both sort views are framed broadside, so the shape's long axis runs across the
  // screen WIDTH. The 50° FOV is vertical, so the horizontal FOV shrinks with the
  // aspect ratio: a tall, narrow portrait phone is the binding case and clips the
  // ends. Dolly the camera straight back along its view vector (composition kept,
  // just farther) by this factor; the floor gives desktop a touch more room too.
  function sortFitZoom(){
    var need = 1.05 / Math.max(0.3, aspect);   // clear the ~0.26-wide projection out of the horizontal FOV, ~20% margin
    return need > 1.15 ? need : 1.15;
  }
  function sortShowHelix(){       // build the history tapestry for the current algorithm
    sortScramble(); sortBuildOps(); sortBuildHistory();
    ensurePointCapacity(SORT_SLICES * sr.n * 16);
    sr.playhead = 0; sr.view = 'helix'; sr.built = true;     // start empty; the monument builds in from the top
    helixLayout();
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, sr.helixTotal * 4);
    var hz = sortFitZoom();
    camPos = [0.5 + 0.16 * hz, 0.5 + 0.05 * hz, 0.5 - 1.16 * hz]; camFwd = vnorm([0.5 - camPos[0], 0.5 - camPos[1], 0.5 - camPos[2]]); camUp = [0, 1, 0];   // face the tapestry from far enough to see the whole chaos->order span (aspect-aware), slight 3/4 for the relief
    yawVel = 0; pitchVel = 0; rollVel = 0;
  }
  function sortToggleView(){
    if (!sr) return;
    if (sr.view === 'helix') generateSort(sr.algo);   // back to the live cylinder
    else sortShowHelix();
  }

  // ----- Sonification (opt-in): value -> pentatonic pitch, golden-angle pan, cosmic bell + reverb -----
  // Pitch is quantised to a major pentatonic over 3 octaves from A2 so any overlapping
  // notes stay consonant. The golden ratio is NOT used for pitch (it is maximally
  // dissonant as an interval); instead phi^2 sets a quiet inharmonic shimmer partial
  // and the golden angle (137.5 deg) spaces successive notes across the stereo field.
  var sortAudio = { ctx:null, ready:false, on:true, bus:null, master:null, voices:0, nextT:0, panN:0 };   // sound defaults ON (all devices); the context is unlocked on the first gesture (sortAudioUnlock)
  var SORT_NOTE_RATE = 500;        // max scheduled notes/sec (firehose ceiling; only reached at high Speed)
  var SORT_VOICE_CAP = 160;        // max simultaneously ringing voices
  var sortFNVal = new Float32Array(512), sortFNSwap = new Uint8Array(512), sortFNCount = 0;   // this frame's op events to sonify
  var SORT_PENT = [0, 2, 4, 7, 9], SORT_BASE_HZ = 110, SORT_OCT = 3, SORT_NOTES = SORT_PENT.length * SORT_OCT + 1;
  function sortValToFreq(v){ v = v < 0 ? 0 : (v > 1 ? 1 : v); var i = Math.round(v * (SORT_NOTES - 1)); var oc = (i / SORT_PENT.length) | 0, deg = SORT_PENT[i % SORT_PENT.length]; return SORT_BASE_HZ * Math.pow(2, (oc * 12 + deg) / 12); }
  function sortMakeIR(ctx, sec, decay){ var rate = ctx.sampleRate, len = (rate * sec) | 0, buf = ctx.createBuffer(2, len, rate), ch, i, d; for (ch = 0; ch < 2; ch++) { d = buf.getChannelData(ch); for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return buf; }
  function sortAudioInit(){
    if (sortAudio.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var ctx = new AC();
    var bus = ctx.createGain(), comp = ctx.createDynamicsCompressor(), master = ctx.createGain();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    master.gain.value = 0.55;
    var conv = ctx.createConvolver(); conv.buffer = sortMakeIR(ctx, 3.2, 3.0);
    var wet = ctx.createGain(); wet.gain.value = 0.5;
    var dry = ctx.createGain(); dry.gain.value = 0.6;
    bus.connect(comp); comp.connect(dry); dry.connect(master); comp.connect(conv); conv.connect(wet); wet.connect(master); master.connect(ctx.destination);
    sortAudio.ctx = ctx; sortAudio.bus = bus; sortAudio.master = master; sortAudio.ready = true;
  }
  function sortAudioToggle(){
    if (!sortAudio.ctx) sortAudioInit();
    if (!sortAudio.ready) return;
    sortAudio.on = !sortAudio.on;
    if (sortAudio.on && sortAudio.ctx.state === 'suspended') sortAudio.ctx.resume();
  }
  // Sound defaults on, but browsers keep Web Audio suspended until a user gesture.
  // Unlock the context on the first interaction anywhere on the page (once), so
  // notes play the moment you reach a sorting scene without touching the button.
  var sortAudioUnlocked = false;
  function sortAudioUnlock(){
    if (sortAudioUnlocked) return;
    sortAudioUnlocked = true;
    sortAudioInit();
    if (sortAudio.ready && sortAudio.on && sortAudio.ctx.state === 'suspended') sortAudio.ctx.resume();
  }
  // Kill / restore the sort bus so note tails do not ring past a scene change. Leaving a
  // sort scene ramps the master to 0 (silencing in-flight + scheduled voices); a fresh sort
  // entry (generateSort) ramps it back. Both guard on a built context (no-op before the
  // first gesture), so they are safe to call from any transition.
  function sortAudioSilence(){
    var A = sortAudio; if (!A.ready || !A.master) return;
    var now = A.ctx.currentTime, g = A.master.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.0, now + 0.08);
  }
  function sortAudioRestore(){
    var A = sortAudio; if (!A.ready || !A.master) return;
    var now = A.ctx.currentTime, g = A.master.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.55, now + 0.05);   // 0.55 = sortAudioInit master gain
  }
  function sortPlayNote(freq, peak, bright, t0, dur){
    var A = sortAudio; if (!A.ready || A.voices >= SORT_VOICE_CAP) return;
    var ctx = A.ctx; if (t0 === undefined) t0 = ctx.currentTime;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
    var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq; o1.detune.value = 4;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq; o2.detune.value = -4;
    var o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = freq * 2.618;   // phi^2 inharmonic shimmer
    var g3 = ctx.createGain(); g3.gain.value = bright ? 0.07 : 0.035;
    o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g);
    var pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); A.panN++; var ang = (A.panN * 137.5) % 360; pan.pan.value = Math.sin(ang * Math.PI / 180) * 0.7; g.connect(pan); pan.connect(A.bus); }
    else g.connect(A.bus);
    var dur0 = dur || 0.4, AT = 0.008, D = bright ? dur0 : dur0 * 0.6;   // note length shrinks with speed (set per-frame in sortAudioSchedule)
    g.gain.linearRampToValueAtTime(peak, t0 + AT);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + AT + D);
    o1.start(t0); o2.start(t0); o3.start(t0);
    var st = t0 + AT + D + 0.03; o1.stop(st); o2.stop(st); o3.stop(st);
    A.voices++;
    o1.onended = function(){ try { g.disconnect(); g3.disconnect(); if (pan) pan.disconnect(); } catch (e) {} A.voices--; };
  }
  // Schedule this frame's op events as notes, spaced at <= SORT_NOTE_RATE/sec and
  // queued up to ~100ms ahead (Web Audio honours future start times), dropping any
  // overflow. At low Speed this is one note per op; at high Speed it fills toward
  // the 500/sec ceiling and fuses into a shimmering roar.
  function sortAudioSchedule(){
    var A = sortAudio; if (!A.on || !A.ready) { sortFNCount = 0; return; }
    if (A.ctx.state === 'suspended') { if (sortAudioUnlocked) A.ctx.resume(); sortFNCount = 0; return; }   // self-heal if the browser re-suspended the context (e.g. iOS after idle)
    var ctx = A.ctx, now = ctx.currentTime, gap = 1 / SORT_NOTE_RATE, i;
    var rate = Math.min(SORT_STEPS * 60, SORT_NOTE_RATE);        // approx notes/sec at this Speed
    var dur = Math.max(0.05, Math.min(1.0, 9 / (rate + 3)));     // long, ringing notes when slow; short, crisp ones when fast
    if (A.nextT < now) A.nextT = now;
    for (i = 0; i < sortFNCount; i++) {
      var t = A.nextT; if (t > now + 0.1) break;                 // don't queue more than ~100ms ahead; drop the rest
      sortPlayNote(sortValToFreq(sortFNVal[i]), sortFNSwap[i] ? 0.2 : 0.07, sortFNSwap[i] === 1, t, dur);
      A.nextT = t + gap;
    }
    sortFNCount = 0;
  }

  function sortTick(dt){
    if (!sr || !sr.built) return;
    if (sr.view === 'helix') {                               // history tapestry writes itself in, then holds the full monument, then rebuilds (Speed -/+ controls the rate)
      sr.playhead += dt * (SORT_SLICES / HELIX_SWEEP) * Math.min(4, SORT_STEPS / 10);
      if (sr.playhead > SORT_SLICES * 1.5) sr.playhead = 0;  // hold ~half a sweep at full, then rebuild from the top
      helixLayout();
      if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, sr.helixTotal * 4);
      return;
    }
    var e, n = sr.n, s; sortFNCount = 0;                     // collect this frame's op events for sonification
    // Freeze the whole simulation (stepping + sound) while a scene/algo morph is
    // in flight: the OLD sort must not keep sorting (or playing notes) as it fades
    // out, and the NEW one must not begin until the cylinder has fully risen. The
    // rings still ease + render below, just held at their current state.
    var transitioning = (pendingField !== null) || morph < 0.9;
    if (!transitioning) {
      if (sr.phase === 'ready') {                            // brief pause on a fresh scramble before sorting (algo switch)
        sr.readyT += dt;
        if (sr.readyT > SORT_READY) sr.phase = 'sort';
      } else if (sr.phase === 'sort') {
        sr.stepAcc += SORT_STEPS;                            // fractional: < 1 op/frame crawls
        var doN = Math.floor(sr.stepAcc); sr.stepAcc -= doN;
        for (s = 0; s < doN && sr.opPtr < sr.ops.length; s++) sortStep();
        if (sr.opPtr >= sr.ops.length) { sr.phase = 'show'; sr.holdT = 0; }
      } else if (sr.phase === 'show') {
        sr.holdT += dt;
        if (sortLoop && sr.holdT > SORT_SHOW) { sortScramble(); sr.phase = 'shuffle'; sr.shufT = 0; }
      } else if (sr.phase === 'shuffle') {
        sr.shufT += dt;
        if (sr.shufT > SORT_SHUF) { sortBuildOps(); sr.phase = 'sort'; }
      }
      sortAudioSchedule();                                   // schedule the frame's events at up to 500 notes/sec
    }
    var k = 1 - Math.exp(-9 * dt);
    for (e = 0; e < n; e++) { sr.x[e] += (sr.slotOf[e] - sr.x[e]) * k; sr.age[e] += dt; if (sr.flag[e] && sr.age[e] > 0.18) sr.flag[e] = 0; }
    sortLayout();
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, sr.total * 4);
  }
  function generateSort(algo){
    // Was this an algo switch from another sort scene (so the rings are already
    // on screen and we can fly them to the new scramble), or a fresh entry (snap)?
    // currentField is still the PREVIOUS field here (loadField sets it after).
    var wasSort = isSortField(currentField);
    var prevN = sr ? sr.n : -1;
    sortAudioRestore();                          // re-arm the sort bus (silenced when you leave a sort scene)
    sortEnsure(algo);
    ensurePointCapacity(sr.total);
    var animateSwap = wasSort && sr.built && sr.n === prevN;   // same ring count -> sr.x positions are valid to animate from
    var i;
    for (i = 0; i < sr.n; i++) sr.vals[i] = sr.n > 1 ? i / (sr.n - 1) : 0;   // element e's value
    for (i = 0; i < sr.n; i++) sr.flag[i] = 0;                               // clear stale compare/swap highlights before the transition
    sortScramble();
    if (animateSwap) {
      // Keep the rings where they are and let the shuffle phase fly them to the
      // new scramble (sr.x lerps to slotOf), then it builds the new algo's ops.
      sr.phase = 'shuffle'; sr.shufT = 0; sr.readyT = 0; sr.holdT = 0; sr.view = 'live';
    } else {
      for (i = 0; i < sr.n; i++) sr.x[i] = sr.slotOf[i];                     // fresh entry: snap to the scramble
      sortBuildOps();
      sr.phase = 'ready'; sr.readyT = 0; sr.holdT = 0; sr.shufT = 0; sr.view = 'live';
    }
    sr.built = true;
    sortLayout();
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions, 0, sr.total * 4);
    var scz = SORT_Z0 + SORT_SPAN * 0.5;                            // cylinder centre along the bore
    var fz = sortFitZoom();                                         // dolly back to fit the whole tube (portrait/mobile safe)
    camPos = [0.5 + 0.62 * fz, 0.5 + 0.12 * fz, scz - 0.12 * fz];   // mostly broadside (+x side), gently above, slight 3/4 tilt
    camFwd = vnorm([0.5 - camPos[0], 0.5 - camPos[1], scz - camPos[2]]);   // look at the cylinder centre
    camUp = [0, 1, 0];
    yawVel = 0; pitchVel = 0; rollVel = 0;
    clumps.length = 0;
  }

  // ----- Sort stats HUD (algorithm + live comparison/swap counts + progress + speed) -----
  var sortHudBuilt = false, sortHudEl = null, soVal = {}, sortHudCollapsed = false;   // sort stats panel can collapse to just its header so it stops obstructing the view
  var SORT_NAMES = { selection:'Selection sort', bubble:'Bubble sort', cocktail:'Cocktail shaker', insertion:'Insertion sort',
    gnome:'Gnome sort', shell:'Shell sort', comb:'Comb sort', quick:'Quicksort', heap:'Heapsort', bitonic:'Bitonic sort',
    oddeven:'Odd-even sort', pancake:'Pancake sort', bogo:'Bogosort' };
  function ensureSortHUD(){
    if (sortHudBuilt) return;
    var host = canvas && canvas.parentNode; if (!host) return;
    if (window.getComputedStyle && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var st = document.createElement('style');
    st.textContent =
      '#gx-sort-hud{position:absolute;right:12px;top:56px;z-index:44;min-width:192px;' +
        'background:rgba(8,10,18,0.82);border:1px solid rgba(255,255,255,0.13);border-radius:9px;padding:10px 12px;' +
        'font-family:var(--d-mono,monospace);font-size:11px;color:#cdd6e6;box-shadow:0 6px 24px rgba(0,0,0,0.5);' +
        '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);pointer-events:none;}' +
      '#gx-sort-hud .gx-so-algo{font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#fff;font-weight:700;}' +
      '#gx-sort-hud .gx-so-status{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#7fd4ff;margin-bottom:8px;}' +
      '#gx-sort-hud .gx-so-row{display:flex;justify-content:space-between;gap:16px;margin:2px 0;}' +
      '#gx-sort-hud .gx-so-row span:first-child{color:#8190a8;}' +
      '#gx-sort-hud .gx-so-row span:last-child{color:#fff;font-variant-numeric:tabular-nums;}' +
      '#gx-sort-hud .gx-so-ctrl{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);}' +
      '#gx-sort-hud .gx-so-clab{color:#8190a8;}' +
      '#gx-sort-hud .gx-so-btn{pointer-events:auto;cursor:pointer;font-family:inherit;font-size:11px;color:#cdd6e6;' +
        'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:5px;padding:3px 10px;transition:background .15s,border-color .15s,color .15s;}' +
      '#gx-sort-hud .gx-so-btn:hover{background:rgba(127,212,255,0.18);border-color:rgba(127,212,255,0.5);color:#fff;}' +
      '#gx-sort-hud .gx-so-spd{min-width:30px;text-align:center;color:#fff;font-variant-numeric:tabular-nums;}' +
      '#gx-sort-hud .gx-so-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}' +
      '#gx-sort-hud .gx-so-body{margin-top:8px;}' +
      '#gx-sort-hud .gx-so-toggle{pointer-events:auto;cursor:pointer;font-family:inherit;font-size:10px;line-height:1;color:#cdd6e6;' +
        'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:5px;padding:3px 7px;transition:background .15s,border-color .15s,color .15s;}' +
      '#gx-sort-hud .gx-so-toggle:hover{background:rgba(127,212,255,0.18);border-color:rgba(127,212,255,0.5);color:#fff;}' +
      '#gx-sort-hud.gx-so-collapsed{min-width:0;}' +
      '#gx-sort-hud.gx-so-collapsed .gx-so-body{display:none;}' +
      '#galaxy-wrapper.gx-clean #gx-sort-hud{display:none!important;}';
    document.head.appendChild(st);
    var hud = document.createElement('div'); hud.setAttribute('id', 'gx-sort-hud');
    if (sortHudCollapsed) hud.classList.add('gx-so-collapsed');
    function refocus(){ try { canvas.focus(); } catch(e){} }
    // Header: algorithm name + a caret that collapses the panel down to just this row.
    var head = document.createElement('div'); head.className = 'gx-so-head';
    var algo = document.createElement('div'); algo.className = 'gx-so-algo'; head.appendChild(algo); soVal.algo = algo;
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'gx-so-toggle';
    toggle.textContent = sortHudCollapsed ? '▸' : '▾';
    toggle.title = sortHudCollapsed ? 'Show stats' : 'Collapse stats';
    toggle.setAttribute('aria-expanded', sortHudCollapsed ? 'false' : 'true');
    toggle.addEventListener('click', function(ev){
      ev.preventDefault();
      sortHudCollapsed = !sortHudCollapsed;
      hud.classList.toggle('gx-so-collapsed', sortHudCollapsed);
      toggle.textContent = sortHudCollapsed ? '▸' : '▾';
      toggle.title = sortHudCollapsed ? 'Show stats' : 'Collapse stats';
      toggle.setAttribute('aria-expanded', sortHudCollapsed ? 'false' : 'true');
      refocus();
    });
    head.appendChild(toggle); hud.appendChild(head);
    // Body: everything that collapses away.
    var body = document.createElement('div'); body.className = 'gx-so-body';
    var status = document.createElement('div'); status.className = 'gx-so-status'; body.appendChild(status); soVal.status = status;
    function row(label){ var d=document.createElement('div'); d.className='gx-so-row'; var a=document.createElement('span'); a.textContent=label; var b=document.createElement('span'); b.textContent='—'; d.appendChild(a); d.appendChild(b); body.appendChild(d); return b; }
    soVal.cmp = row('Comparisons'); soVal.swaps = row('Swaps'); soVal.prog = row('Progress');
    function mkBtn(label, fn){ var b=document.createElement('button'); b.type='button'; b.className='gx-so-btn'; b.textContent=label; b.addEventListener('click', function(ev){ ev.preventDefault(); fn(); refocus(); }); return b; }
    var ctrl = document.createElement('div'); ctrl.className = 'gx-so-ctrl';
    var clab = document.createElement('span'); clab.className = 'gx-so-clab'; clab.textContent = 'Speed'; ctrl.appendChild(clab);
    ctrl.appendChild(mkBtn('−', function(){ SORT_STEPS = Math.max(0.01, Math.round(SORT_STEPS * 0.6 * 100) / 100); }));   // down to 0.01 for deep slow-mo
    var spd = document.createElement('span'); spd.className = 'gx-so-spd'; spd.textContent = SORT_STEPS; ctrl.appendChild(spd); soVal.spd = spd;
    ctrl.appendChild(mkBtn('+', function(){ SORT_STEPS = Math.min(120, SORT_STEPS < 1 ? Math.round(SORT_STEPS * 1.6 * 100) / 100 : Math.round(SORT_STEPS * 1.6)); }));
    body.appendChild(ctrl);
    var ctrlS = document.createElement('div'); ctrlS.className = 'gx-so-ctrl';
    var slab = document.createElement('span'); slab.className = 'gx-so-clab'; slab.textContent = 'Sound'; ctrlS.appendChild(slab);
    var btnSound = mkBtn(sortAudio.on ? 'On ♪' : 'Off', function(){ sortAudioToggle(); btnSound.textContent = sortAudio.on ? 'On ♪' : 'Off'; });
    btnSound.style.flex = '1'; ctrlS.appendChild(btnSound); body.appendChild(ctrlS); soVal.soundBtn = btnSound;
    hud.appendChild(body);
    host.appendChild(hud); sortHudEl = hud; sortHudBuilt = true;
  }
  function updateSortHUD(){
    var on = isSortField(currentField) && sr && sr.built;
    if (!sortHudBuilt) { if (!on) return; ensureSortHUD(); if (!sortHudBuilt) return; }
    if (!on) { sortHudEl.style.display = 'none'; return; }
    sortHudEl.style.display = '';
    soVal.algo.textContent = SORT_NAMES[sr.algo] || sr.algo;
    if (sortHudCollapsed) return;                          // body hidden: skip the per-frame stat writes
    soVal.status.textContent = sr.phase === 'ready' ? 'ready…' : (sr.phase === 'sort' ? 'sorting…' : (sr.phase === 'show' ? 'sorted ✓' : 'shuffling…'));
    soVal.status.style.color = sr.phase === 'show' ? '#8effc0' : '#7fd4ff';
    soVal.cmp.textContent = fmtInt(sr.cmp);
    soVal.swaps.textContent = fmtInt(sr.swaps);
    soVal.prog.textContent = (sr.ops.length > 0 ? Math.round(sr.opPtr / sr.ops.length * 100) : 0) + '%';
    if (soVal.spd) soVal.spd.textContent = SORT_STEPS < 1 ? SORT_STEPS.toFixed(2) : Math.round(SORT_STEPS);
    if (soVal.soundBtn) soVal.soundBtn.textContent = sortAudio.on ? 'On ♪' : 'Off';
  }

  if (typeof window !== 'undefined') {
    window.GXSORT = {
      reset: function (algo) { generateSort(algo || 'selection'); return window.GXSORT.stats(); },
      step: function (k) { k = k || 1; var i; for (i = 0; i < k && sr.opPtr < sr.ops.length; i++) sortStep(); return window.GXSORT.stats(); },
      run: function (algo) { if (algo) generateSort(algo); var g = 0; while (sr && sr.opPtr < sr.ops.length && g < 5000000) { sortStep(); g++; } return window.GXSORT.stats(); },
      helix: function (algo) {   // build the history monument; verify its base slice is the sorted rainbow
        generateSort(algo || 'selection'); sortScramble(); sortBuildOps(); sortBuildHistory();
        var T = SORT_SLICES, n = sr.n, s, baseAsc = true, crownVaried = false, b = (T - 1) * n;
        for (s = 1; s < n; s++) { if (sr.hist[b + s] < sr.hist[b + s - 1]) baseAsc = false; if (sr.hist[s] !== sr.hist[s - 1]) crownVaried = true; }
        return { algo: sr.algo, slices: T, n: n, baseSliceSorted: baseAsc, crownScrambled: crownVaried, helixPoints: T * n * 16 };
      },
      stats: function () {
        if (!sr) return { error: 'no sort' };
        var n = sr.n, s, asc = true, exact = true;
        for (s = 1; s < n; s++) if (sr.vals[sr.cur[s]] < sr.vals[sr.cur[s - 1]]) { asc = false; break; }
        for (s = 0; s < n; s++) if (sr.cur[s] !== s) { exact = false; break; }
        return { algo: sr.algo, n: n, ops: sr.ops.length, opPtr: sr.opPtr, cmp: sr.cmp, swaps: sr.swaps, ascending: asc, sortedExact: exact, total: sr.total, phase: sr.phase };
      }
    };
  }
  // ====== END SORTING ======


  // ===== generateClifford =====
  function generateClifford() {
    var ca = -1.4, cb = 1.6, cc = 1.0, cd = 0.7, ce = 1.7, cf = 0.9;
    var x = 0.1, y = 0.0, z = 0.0;
    var i, nx, ny, nz, spd;
    var xmin = Infinity, xmax = -Infinity;
    var ymin = Infinity, ymax = -Infinity;
    var zmin = Infinity, zmax = -Infinity;
    // Warmup: shed the transient before recording.
    for (i = 0; i < 1000; i++) {
      nx = Math.sin(ca * y) + cc * Math.cos(ca * x);
      ny = Math.sin(cb * z) + cd * Math.cos(cb * y);
      nz = Math.sin(ce * x) + cf * Math.cos(ce * z);
      x = nx; y = ny; z = nz;
    }
    // First pass: record raw coords and track extents.
    for (i = 0; i < POINT_COUNT; i++) {
      nx = Math.sin(ca * y) + cc * Math.cos(ca * x);
      ny = Math.sin(cb * z) + cd * Math.cos(cb * y);
      nz = Math.sin(ce * x) + cf * Math.cos(ce * z);
      spd = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y) + (nz - z) * (nz - z));
      x = nx; y = ny; z = nz;
      // Guard against any NaN/Inf that would corrupt the buffer.
      if (!isFinite(x)) x = 0; if (!isFinite(y)) y = 0; if (!isFinite(z)) z = 0;
      positions[i * 4 + 0] = x;
      positions[i * 4 + 1] = y;
      positions[i * 4 + 2] = z;
      positions[i * 4 + 3] = 1.5 + Math.min(spd * 0.88, 4.0);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    // Second pass: normalize centered at (0.5, 0.5, 0.5). Scaled down hard so the
    // attractor reads as a small knot you fly up to (and tiles with space around
    // it), instead of a giant lace that dwarfs the camera.
    var cxc = (xmin + xmax) * 0.5, cyc = (ymin + ymax) * 0.5, czc = (zmin + zmax) * 0.5;
    var maxExtent = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    var scale = 0.13 / maxExtent;   // smaller knot: reads more zoomed-out and the points pack denser (was 0.18)
    for (i = 0; i < POINT_COUNT; i++) {
      positions[i * 4 + 0] = (positions[i * 4 + 0] - cxc) * scale + 0.5;
      positions[i * 4 + 1] = (positions[i * 4 + 1] - cyc) * scale + 0.5;
      positions[i * 4 + 2] = (positions[i * 4 + 2] - czc) * scale + 0.5;
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // ===== generateLogistic =====
  function generateLogistic() {
    var R_MIN    = 2.8;
    var R_MAX    = 4.0;
    var WARMUP   = 400;    // iterations to settle onto attractor before sampling
    var SAMP     = 300;    // attractor samples per r-column
    var NCOLS    = Math.round(POINT_COUNT / SAMP);   // ~3333 columns

    // Pass 1: build a coarse 2-D hit-count histogram (HIST x HIST buckets)
    // to measure local density so Z can bulge the dense forks forward.
    var HIST = 50;
    var histSize = HIST * HIST;
    var hist = new Float32Array(histSize);
    var ci, s, x, r, hc, hr;
    for (ci = 0; ci < NCOLS; ci++) {
      r = R_MIN + (R_MAX - R_MIN) * (ci / (NCOLS - 1));
      x = 0.5;
      for (s = 0; s < WARMUP; s++) x = r * x * (1 - x);
      for (s = 0; s < SAMP; s++) {
        x = r * x * (1 - x);
        hc = Math.min(HIST - 1, (r - R_MIN) / (R_MAX - R_MIN) * HIST | 0);
        hr = Math.min(HIST - 1, x * HIST | 0);
        hist[hr * HIST + hc]++;
      }
    }
    // Log-normalise so the busiest cell maps to 1.0.
    var histMax = 0, k;
    for (k = 0; k < histSize; k++) if (hist[k] > histMax) histMax = hist[k];
    var logHistMax = (histMax > 0) ? Math.log(1 + histMax) : 1;

    // Pass 2: fill the positions buffer.
    var n = 0;
    var px, py, pz, pw, normLog;
    for (ci = 0; ci < NCOLS && n < POINT_COUNT; ci++) {
      r = R_MIN + (R_MAX - R_MIN) * (ci / (NCOLS - 1));
      x = 0.5;
      for (s = 0; s < WARMUP; s++) x = r * x * (1 - x);
      for (s = 0; s < SAMP && n < POINT_COUNT; s++) {
        x = r * x * (1 - x);
        px = (r - R_MIN) / (R_MAX - R_MIN);          // X in [0,1]: r axis
        py = x;                                        // Y in [0,1]: attractor value
        // Z: dense forks lift toward the viewer; sparse chaotic mist stays flat.
        hc = Math.min(HIST - 1, px * HIST | 0);
        hr = Math.min(HIST - 1, py * HIST | 0);
        normLog = Math.log(1 + hist[hr * HIST + hc]) / logHistMax;
        pz = 0.5 + normLog * 0.3;
        // W: color by position along the r axis (cyan -> gold -> red).
        pw = 1.5 + px * 4.0;
        // Clamp to guard against any floating-point edge cases.
        if (!isFinite(px)) px = 0.5;
        if (!isFinite(py)) py = 0.5;
        if (!isFinite(pz)) pz = 0.5;
        if (!isFinite(pw)) pw = 3.5;
        positions[n * 4 + 0] = px < 0 ? 0 : px > 1 ? 1 : px;
        positions[n * 4 + 1] = py < 0 ? 0 : py > 1 ? 1 : py;
        positions[n * 4 + 2] = pz < 0 ? 0 : pz > 1 ? 1 : pz;
        positions[n * 4 + 3] = pw < 1.5 ? 1.5 : pw > 5.5 ? 5.5 : pw;
        n++;
      }
    }
    // Fill any shortfall (shouldn't happen, but covers edge-count rounding).
    var base;
    for (var i = n; i < POINT_COUNT; i++) {
      base = (i % n) * 4;
      positions[i * 4 + 0] = positions[base + 0];
      positions[i * 4 + 1] = positions[base + 1];
      positions[i * 4 + 2] = positions[base + 2];
      positions[i * 4 + 3] = positions[base + 3];
    }
    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }

  // ===== generateRecaman =====
  function generateRecaman() {
    var N_TERMS = 4000;              // number of Recaman terms to compute
    var GOLDEN  = 2.39996323;        // golden angle in radians (~137.5 deg)
    var i, n, t;

    // Pass 1: generate the Recaman sequence.
    var seq     = new Float64Array(N_TERMS);
    var visited = {};                // set of values already in the sequence
    seq[0] = 0;
    visited[0] = true;
    var maxVal = 0;
    for (n = 1; n < N_TERMS; n++) {
      var back = seq[n - 1] - n;
      if (back > 0 && !visited[back]) {
        seq[n] = back;
      } else {
        seq[n] = seq[n - 1] + n;
      }
      visited[seq[n]] = true;
      if (seq[n] > maxVal) maxVal = seq[n];
    }
    if (maxVal < 1) maxVal = 1;

    // Pass 2: compute arc lengths. Each arc n connects a(n-1) to a(n) as a
    // semicircle of radius rr = |a(n) - a(n-1)| / 2 mapped to x-space via
    // xv = v / maxVal. Arc length = PI * rr (half circumference).
    var numArcs = N_TERMS - 1;
    var arcLen  = new Float64Array(numArcs);
    var totalLen = 0;
    for (i = 0; i < numArcs; i++) {
      var xvPrev = seq[i]     / maxVal;
      var xvCur  = seq[i + 1] / maxVal;
      var rr     = Math.abs(xvCur - xvPrev) * 0.5;
      arcLen[i]  = Math.PI * rr;    // half circumference
      totalLen  += arcLen[i];
    }
    if (totalLen < 1e-12) totalLen = 1.0;

    // Pass 3: allocate point slots per arc proportional to arc length, then
    // sample each arc. Arc n lies in a plane tilted around X by planeAngle,
    // advanced by the golden angle each step.
    // Arc parameterization: center cx = (xvPrev+xvCur)/2, radius rr,
    // t in [0, PI].
    //   pt.x = cx + rr * cos(t)
    //   pt.y = rr * sin(t) * cos(planeAngle)
    //   pt.z = rr * sin(t) * sin(planeAngle)
    var ptCount    = 0;
    var planeAngle = 0;
    var xmin4 = Infinity, xmax4 = -Infinity;
    var ymin4 = Infinity, ymax4 = -Infinity;
    var zmin4 = Infinity, zmax4 = -Infinity;

    for (i = 0; i < numArcs; i++) {
      var xvP = seq[i]     / maxVal;
      var xvC = seq[i + 1] / maxVal;
      var cx4 = (xvP + xvC) * 0.5;
      var rr4 = Math.abs(xvC - xvP) * 0.5;

      // Fraction of n along the full sequence drives color (early cool, late warm).
      var frac4 = i / Math.max(numArcs - 1, 1);
      var wCol4 = 1.5 + frac4 * 4.0;    // w in [1.5, 5.5]

      var nPts4 = Math.round((arcLen[i] / totalLen) * POINT_COUNT);
      if (nPts4 < 1) nPts4 = 1;

      var cosP = Math.cos(planeAngle);
      var sinP = Math.sin(planeAngle);

      for (var pi4 = 0; pi4 < nPts4 && ptCount < POINT_COUNT; pi4++, ptCount++) {
        t = (nPts4 > 1) ? (pi4 / (nPts4 - 1)) * Math.PI : 0;
        var cosT = Math.cos(t);
        var sinT = Math.sin(t);
        var px4  = cx4 + rr4 * cosT;
        var py4  = rr4 * sinT * cosP;
        var pz4  = rr4 * sinT * sinP;
        positions[ptCount * 4 + 0] = px4;
        positions[ptCount * 4 + 1] = py4;
        positions[ptCount * 4 + 2] = pz4;
        positions[ptCount * 4 + 3] = wCol4;
        if (px4 < xmin4) xmin4 = px4; if (px4 > xmax4) xmax4 = px4;
        if (py4 < ymin4) ymin4 = py4; if (py4 > ymax4) ymax4 = py4;
        if (pz4 < zmin4) zmin4 = pz4; if (pz4 > zmax4) zmax4 = pz4;
      }

      planeAngle += GOLDEN;
    }

    // Fill any shortfall by cycling earlier points.
    var fillBase4 = Math.max(ptCount, 1);
    for (i = ptCount; i < POINT_COUNT; i++) {
      var src4 = i % fillBase4;
      positions[i * 4 + 0] = positions[src4 * 4 + 0];
      positions[i * 4 + 1] = positions[src4 * 4 + 1];
      positions[i * 4 + 2] = positions[src4 * 4 + 2];
      positions[i * 4 + 3] = positions[src4 * 4 + 3];
    }

    // Two-pass normalize: center on bbox center, scale to radius ~0.4.
    if (!isFinite(xmin4) || !isFinite(xmax4)) { xmin4 = 0; xmax4 = 1; }
    if (!isFinite(ymin4) || !isFinite(ymax4)) { ymin4 = 0; ymax4 = 1; }
    if (!isFinite(zmin4) || !isFinite(zmax4)) { zmin4 = 0; zmax4 = 1; }
    var maxExt4 = Math.max(xmax4 - xmin4, ymax4 - ymin4, zmax4 - zmin4);
    if (maxExt4 < 1e-9) maxExt4 = 1.0;
    var scale4 = 0.8 / maxExt4;
    var cx4b   = (xmin4 + xmax4) * 0.5;
    var cy4b   = (ymin4 + ymax4) * 0.5;
    var cz4b   = (zmin4 + zmax4) * 0.5;
    for (i = 0; i < POINT_COUNT; i++) {
      var rx4 = positions[i * 4 + 0];
      var ry4 = positions[i * 4 + 1];
      var rz4 = positions[i * 4 + 2];
      if (!isFinite(rx4)) rx4 = cx4b;
      if (!isFinite(ry4)) ry4 = cy4b;
      if (!isFinite(rz4)) rz4 = cz4b;
      positions[i * 4 + 0] = (rx4 - cx4b) * scale4 + 0.5;
      positions[i * 4 + 1] = (ry4 - cy4b) * scale4 + 0.5;
      positions[i * 4 + 2] = (rz4 - cz4b) * scale4 + 0.5;
      if (!isFinite(positions[i * 4 + 3])) positions[i * 4 + 3] = 2.0;
    }

    clumps.length = 0;
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
  }
  // Recompute clustering (touching counts + clumps) without regenerating the
  // points. Used when the Cluster-radius slider changes.
  function recomputeClusters() {
    computeHeat();
    computeClumps();
    if (instanceBuffer && device) device.queue.writeBuffer(instanceBuffer, 0, positions);
    updatePrediction();
  }

  // Live "what would I see" blurb. Models flight as sweeping a tube of view
  // (radius FLIGHT_TARGET_DIST) through a field whose cluster-size distribution
  // is the CURRENT generator's actual touching-count histogram. The chance of
  // passing a size>=k cluster in 60s is 1 - exp(-lambda), where lambda is the
  // number of such clusters in the cube times the fraction of the cube swept.
  // Fast histogram from a subsample of stars, reusing the persistent grid, so
  // the prediction can update in real time while the radius slider is dragged
  // (the full per-star recolor is debounced separately). Scaled up to N.
  function sampleHistInto(radius) {
    for (var z = 0; z < 17; z++) touchHist[z] = 0;
    if (!gridOrder || !gridCounts) return;
    var G = Math.max(1, Math.floor(1 / PROX_RADIUS));
    var r2 = radius * radius;
    var stride = Math.max(1, Math.floor(POINT_COUNT / 24000));
    var counted = 0, i;
    for (i = 0; i < POINT_COUNT; i += stride) {
      var px = positions[i * 4], py = positions[i * 4 + 1], pz = positions[i * 4 + 2];
      var cx = (px * G) | 0; if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
      var cy = (py * G) | 0; if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
      var cz = (pz * G) | 0; if (cz < 0) cz = 0; else if (cz >= G) cz = G - 1;
      var count = 0;
      nb:
      for (var dz = -1; dz <= 1; dz++) { var nz = cz + dz; if (nz < 0 || nz >= G) continue;
        for (var dy = -1; dy <= 1; dy++) { var ny = cy + dy; if (ny < 0 || ny >= G) continue;
          for (var dx = -1; dx <= 1; dx++) { var nx = cx + dx; if (nx < 0 || nx >= G) continue;
            var nc = nx + ny * G + nz * G * G, s = gridCounts[nc], e = gridCounts[nc + 1];
            for (var k = s; k < e; k++) {
              var j = gridOrder[k]; if (j === i) continue;
              var ax = positions[j * 4] - px, ay = positions[j * 4 + 1] - py, az = positions[j * 4 + 2] - pz;
              if (ax * ax + ay * ay + az * az <= r2) { count++; if (count >= 32) break nb; }
            }
          }
        }
      }
      touchHist[count > 16 ? 16 : count]++;
      counted++;
    }
    var scale = counted > 0 ? POINT_COUNT / counted : 1;
    for (z = 0; z < 17; z++) touchHist[z] *= scale;
  }

  // Live odds oracle. Models flight as sweeping a tube of view (radius
  // FLIGHT_TARGET_DIST) through the wrapping star field, whose cluster-size
  // distribution is the CURRENT generator's actual touching-count histogram.
  // Chance of passing a size>=k cluster in 60s = 1 - exp(-lambda), with
  // lambda = (size>=k clusters per unit volume) * (volume the tube sweeps in
  // 60s). The field tiles infinitely around the camera, so the swept volume
  // grows linearly with speed and is NOT capped at one cube. That linear term
  // is what makes the Speed slider move the odds across its whole range.
  function updatePrediction() {
    if (!predValueEl) return;
    if (flightSpeed < 1e-4) {
      predValueEl.textContent = 'Stopped';
      if (predFillEl) predFillEl.style.width = '0%';
      if (predSubEl) predSubEl.textContent = 'Raise the speed and fly to start passing clusters.';
      return;
    }
    var R = FLIGHT_TARGET_DIST;
    var swept = Math.PI * R * R * 60 * flightSpeed;   // expected cube-volumes swept; linear in speed, uncapped
    function countAtLeast(k) {                         // size>=k clusters per unit cube
      var members = 0;
      for (var m = k - 1; m <= 16; m++) members += touchHist[m];
      return members / k;
    }
    // Headline size: the biggest cluster that actually EXISTS in numbers in
    // this universe (at least ~1 in the cube), capped at 8, floored at 3. It
    // depends on the generator + radius, NOT on speed, so the label holds
    // still while the odds and the meter slide as you change speed. Forecasting
    // a fixed 8-star was the bug: on a clean generator 8-star clumps never
    // happen, so the odds were pinned at "almost never" at every speed.
    var k = 3;
    for (var kk = 8; kk >= 3; kk--) { if (countAtLeast(kk) >= 1) { k = kk; break; } }
    var lambda = countAtLeast(k) * swept;              // expected encounters in 60s
    var pk = 1 - Math.exp(-lambda);
    if (predLabelEl) predLabelEl.textContent = 'Odds of passing ' + (k === 8 ? 'an ' : 'a ') + k + '-star cluster in the next 60s';
    if (pk >= 0.005) predValueEl.textContent = (pk * 100).toFixed(pk < 0.1 ? 1 : 0) + '%';
    else if (pk > 1e-9) predValueEl.textContent = '1 in ' + fmtOdds(1 / pk);
    else predValueEl.textContent = 'almost never';
    if (predFillEl) predFillEl.style.width = (Math.pow(pk, 0.4) * 100).toFixed(1) + '%';
    if (predSubEl) predSubEl.textContent = (lambda >= 0.6)
      ? ('Roughly ' + (lambda < 9.5 ? lambda.toFixed(1) : Math.round(lambda)) + ' in your path over 60s at this speed.')
      : 'A rare sight in this universe at these settings.';
  }

  // Proximity heat per star, stored in the 4th instance float (0..1).
  // Built with a uniform spatial grid (counting sort) so we can find each
  // star's close neighbours fast. Heat blends two things:
  //   clusterTerm  - how many neighbours sit within PROX_RADIUS (vs the
  //                  uniform-random expectation), so clusters score high.
  //   closeness    - how near the single closest neighbour is, so even an
  //                  isolated but very tight pair lights up.
  // Lonely stars score ~0 (dim, recede); packed cores saturate to 1 (white-hot).
  function computeHeat() {
    var r = PROX_RADIUS, r2 = r * r;
    var G = Math.max(1, Math.floor(1 / r));
    var cells = G * G * G;
    if (!gridCounts || gridCounts.length !== cells + 1) gridCounts = new Int32Array(cells + 1);
    else gridCounts.fill(0);
    if (!ptCell || ptCell.length !== POINT_COUNT) ptCell = new Int32Array(POINT_COUNT);
    var i, cx, cy, cz, cell;
    for (i = 0; i < POINT_COUNT; i++) {
      cx = (positions[i * 4] * G) | 0; if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
      cy = (positions[i * 4 + 1] * G) | 0; if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
      cz = (positions[i * 4 + 2] * G) | 0; if (cz < 0) cz = 0; else if (cz >= G) cz = G - 1;
      cell = cx + cy * G + cz * G * G;
      ptCell[i] = cell;
      gridCounts[cell + 1]++;
    }
    for (i = 0; i < cells; i++) gridCounts[i + 1] += gridCounts[i];   // prefix sum -> start offsets
    if (!gridOrder || gridOrder.length !== POINT_COUNT) gridOrder = new Int32Array(POINT_COUNT);
    if (!gridCursor || gridCursor.length !== cells) gridCursor = new Int32Array(cells);
    for (i = 0; i < cells; i++) gridCursor[i] = gridCounts[i];
    for (i = 0; i < POINT_COUNT; i++) gridOrder[gridCursor[ptCell[i]]++] = i;

    var tr2 = TOUCH_RADIUS * TOUCH_RADIUS;   // tight "touching" threshold (squared)
    for (var hz = 0; hz < 17; hz++) touchHist[hz] = 0;
    for (i = 0; i < POINT_COUNT; i++) {
      var px = positions[i * 4], py = positions[i * 4 + 1], pz = positions[i * 4 + 2];
      cx = (px * G) | 0; if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
      cy = (py * G) | 0; if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
      cz = (pz * G) | 0; if (cz < 0) cz = 0; else if (cz >= G) cz = G - 1;
      var count = 0;
      // Cap the neighbour count. Colour saturates at 6 neighbours and the
      // histogram buckets everything above 16, so 32 is plenty, and it stops a
      // degenerate generator (a line or grid that piles a million points into a
      // few cells) from turning this into billions of distance checks.
      nb:
      for (var dz = -1; dz <= 1; dz++) { var nz = cz + dz; if (nz < 0 || nz >= G) continue;
        for (var dy = -1; dy <= 1; dy++) { var ny = cy + dy; if (ny < 0 || ny >= G) continue;
          for (var dx = -1; dx <= 1; dx++) { var nx = cx + dx; if (nx < 0 || nx >= G) continue;
            var nc = nx + ny * G + nz * G * G;
            var s = gridCounts[nc], e = gridCounts[nc + 1];
            for (var k = s; k < e; k++) {
              var j = gridOrder[k]; if (j === i) continue;
              var ax = positions[j * 4] - px, ay = positions[j * 4 + 1] - py, az = positions[j * 4 + 2] - pz;
              var d2 = ax * ax + ay * ay + az * az;
              if (d2 <= tr2) { count++; if (count >= 32) break nb; }
            }
          }
        }
      }
      positions[i * 4 + 3] = count;   // how many stars are touching this one (its cluster crowding)
      touchHist[count > 16 ? 16 : count]++;
    }
  }

  // Detect the standout clumps: greedily merge the highest-heat points into
  // distinct clusters and keep the densest few. Each clump records its
  // centroid, member count, and the peak density ratio (for the callout).
  // Name each cluster using the CURRENT generator: hash the position to a seed,
  // run the active algorithm a few times, map to a catalog designation like
  // "MV-417". Computed once per regenerate and stored, so it stays stable.
  function clusterName(x, y, z) {
    var seed = ((Math.floor(x * 4096) * 73856093) ^ (Math.floor(y * 4096) * 19349663) ^ (Math.floor(z * 4096) * 83492791)) >>> 0;
    var g = ALGOS[currentIndex].make(seed || 1);
    var L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    return L.charAt((g() * L.length) | 0) + L.charAt((g() * L.length) | 0) + '-' + (((g() * 900) | 0) + 100);
  }
  // P(a uniform-random star has >= k touching neighbours) under Poisson(mu).
  function poissonAtLeast(k, mu) {
    if (k <= 0) return 1;
    var term = Math.exp(-mu), cum = term;
    for (var i = 1; i < k; i++) { term *= mu / i; cum += term; }
    return Math.max(1 - cum, 1e-15);
  }
  function fmtOdds(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' billion';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
    return Math.round(n).toLocaleString();
  }

  function computeClumps() {
    clumps.length = 0;
    var mu = POINT_COUNT * (4 / 3) * Math.PI * TOUCH_RADIUS * TOUCH_RADIUS * TOUCH_RADIUS;
    var cands = [];
    for (var i = 0; i < POINT_COUNT && cands.length < 60000; i++) if (positions[i * 4 + 3] >= CLUMP_MIN_COUNT) cands.push(i);
    cands.sort(function (a, b) { return positions[b * 4 + 3] - positions[a * 4 + 3]; });
    if (cands.length > CLUMP_CAND_CAP) cands.length = CLUMP_CAND_CAP;
    var claimed = new Uint8Array(cands.length);
    var cr = TOUCH_RADIUS * 2.5; var cr2 = cr * cr;   // group one touching knot per cluster
    for (var ci = 0; ci < cands.length && clumps.length < MAX_CLUMPS; ci++) {
      if (claimed[ci]) continue;
      var seed = cands[ci];
      var sx = positions[seed * 4], sy = positions[seed * 4 + 1], sz = positions[seed * 4 + 2];
      var ax = 0, ay = 0, az = 0, n = 0;
      for (var cj = ci; cj < cands.length; cj++) {
        if (claimed[cj]) continue;
        var p = cands[cj];
        var dx = positions[p * 4] - sx, dy = positions[p * 4 + 1] - sy, dz = positions[p * 4 + 2] - sz;
        if (dx * dx + dy * dy + dz * dz <= cr2) {
          claimed[cj] = 1;
          ax += positions[p * 4]; ay += positions[p * 4 + 1]; az += positions[p * 4 + 2]; n++;
        }
      }
      var ccx = ax / n, ccy = ay / n, ccz = az / n;
      var sc = positions[seed * 4 + 3];   // seed's own touching count (the tightest star in this clump)
      clumps.push({ x: ccx, y: ccy, z: ccz, size: sc + 1, tag: clusterName(ccx, ccy, ccz), odds: 1 / poissonAtLeast(sc, mu) });
    }
  }

  function setActiveChip() {
    if (!gensEl) return;
    var btns = gensEl.querySelectorAll('.gx-gen-chip');
    for (var i = 0; i < btns.length; i++) {
      var idx = parseInt(btns[i].getAttribute('data-index'), 10);
      btns[i].classList.toggle('active', idx === currentIndex);
    }
  }

  function updateLabel() {
    var algo = ALGOS[currentIndex];
    if (nameEl)  nameEl.textContent = algo.name;
    if (blurbEl) blurbEl.textContent = algo.blurb;
    if (badgeEl) { badgeEl.textContent = algo.tag; badgeEl.className = 'gx-badge gx-badge-' + algo.quality; }
    setActiveChip();
    bumpBlurb();
  }

  // Instruments drawer (Speed, Clumps, Forecast). Collapsed by default in
  // orbit so the panel stays clean; opened automatically in flight, where
  // speed and the odds are what you actually want.
  function setInstruments(open) {
    if (!instPanelEl) return;
    instPanelEl.classList.toggle('open', open);
    if (instToggleEl) instToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function selectAlgo(i) {
    if (i < 0 || i >= ALGOS.length) return;
    currentIndex = i;
    regenerate();
    updateLabel();
    track('galaxy_algo', { algo: ALGOS[currentIndex].key });
  }

  /* ---- Blurb fade (invisible-UI: surface on interaction, then recede) ---- */
  var dimTimer = null;
  function bumpBlurb() {
    if (!blurbEl) return;
    blurbEl.classList.remove('gx-dim');
    if (dimTimer) clearTimeout(dimTimer);
    dimTimer = setTimeout(function () { blurbEl.classList.add('gx-dim'); }, 6000);
  }

  /* ============================================================
     CAMERA  (orbit around the cube, centered at the origin)
     ============================================================ */
  var azimuth   = 0.7;
  var elevation = 0.45;
  var distance  = 2.3;
  var autoSpin  = true;
  var orbitDrag = false;                     // is the user actively dragging in orbit mode
  var azVel = 0, elVel = 0;                  // orbit fling momentum (rad/sec), eased out after release
  var ORBIT_DAMP = 4.5;                      // orbit momentum decay rate
  var lastPointerT = 0;

  // Flight mode (fullscreen): fixed-speed cruise, arrow keys steer, field wraps
  // infinitely around the camera so it feels like endless stars.
  var mode = 'flight';                      // always flight now: the camera cruises the tiled field
  var camPos = [0.5, 0.5, 0.5];
  var camFwd = [0, 0, 1], camUp = [0, 1, 0];  // free-look orientation basis (flight)
  var yawVel = 0, pitchVel = 0, rollVel = 0; // smoothed turn velocities (buttery accel/decel)
  var TURN_SMOOTH = 8;                        // turn easing rate (higher = snappier, lower = floatier)
  // Steering keys: arrows and WASD both yaw/pitch; Q/E roll around the forward axis.
  var held = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
               a: false, d: false, w: false, s: false, q: false, e: false };
  var lastTime = 0;
  var flightSpeed = 0.05;                    // live cruise speed, set by the speed slider (0 = stopped)
  var FLIGHT_SPEED = 0.05;                   // units/sec, fixed forward cruise (tunable)
  var lastCruiseSpeed = 0.05;                // remembered cruise speed, restored after a (stationary) search scene
  function applySpeed(v) {                   // set the live speed and sync the Speed slider UI (shows STOP at 0)
    flightSpeed = Math.max(0, Math.min(0.3, v));
    if (speedRange) speedRange.value = flightSpeed;
    if (speedVal) { var pct = Math.round(flightSpeed / 0.3 * 100); speedVal.textContent = pct === 0 ? 'STOP' : pct + '%'; }
  }
  var TURN_RATE = 1.0;                       // radians/sec yaw/pitch steering (tunable)
  var ROLL_RATE = 1.4;                       // radians/sec roll on Q/E (tunable)

  // Search scenes don't fly: the camera orbits/pans the torus (centred at
  // 0.5,0.5,0.5) so the donut's 3D shape reads. Drag spins it, scroll zooms,
  // and it idles with a slow auto-spin.
  var SEARCH_ORBIT_SPIN = 0.12;              // rad/sec idle auto-rotation
  var srAz = 0.9, srEl = 0.62, srR = 1.5;    // orbit azimuth, elevation, distance
  var srSweep = 0;                           // 0..1 gain on the idle elevation roam (eased in/out so it never snaps)
  var srDragging = false;

  // Per-scene start views, captured live with the C key (GXCAM) and applied on
  // select so each scene opens framed the way it looks best. Flight scenes only
  // (pos/fwd/up); search scenes orbit and sort scenes have their own framing.
  var SCENE_CAM = {
    lorenz: { pos: [0.446, 0.166, 1.431], fwd: [0.33, -0.94, 0.082], up: [-0.84, -0.253, 0.479] },
    thomas: { pos: [0.584, 0.604, 1.576], fwd: [-0.59, -0.577, -0.564], up: [-0.355, -0.442, 0.824] },
    aizawa: { pos: [0.526, -0.612, 6.987], fwd: [-0.009, -0.035, 0.999], up: [-0.761, 0.649, 0.016] },
    dadras: { pos: [0.53, -0.603, 7.045], fwd: [0.057, 0.19, 0.98], up: [-0.065, 0.98, -0.186] },
    sierpinski: { pos: [12.886, -1.431, 2.322], fwd: [0.992, -0.033, 0.119], up: [0.072, 0.935, -0.346] },
    jerusalem: { pos: [0.5, 0.5, 1.86], fwd: [0, 0, 1], up: [0, 1, 0] },     // pulled back so the whole cube reads (was framed at the hollow centre - too close)
    clifford: { pos: [0.5, 0.5, 2.05], fwd: [0, 0, 1], up: [0, 1, 0] },      // zoomed out so the knot reads as a compact dense form, not a wall in your face
    primes3d: { pos: [0.067, 0.529, 6.458], fwd: [-0.007, 0.006, 1], up: [1, -0.019, 0.007] },
    gprimes: { pos: [0.13, -4.562, 7.507], fwd: [-0.05, -0.998, 0.044], up: [-0.027, -0.043, -0.999] },
    collatz: { pos: [0.171, 0.485, 0.568], fwd: [-0.99, -0.029, -0.142], up: [-0.034, 0.999, 0.034] },
    pi: { pos: [0.5, 0.5, 0.974], fwd: [-0.052, 0.168, 0.984], up: [-0.993, -0.116, -0.032] },
    recaman: { pos: [4.1, 1.236, 1.791], fwd: [0.537, 0.608, -0.585], up: [0.127, 0.628, 0.768] },
    metatron: { pos: [0.5, 0.5, 1.858], fwd: [0, 0, 1], up: [0, 1, 0] },
    hopf: { pos: [0.5, 0.5, 1.738], fwd: [0, 0, 1], up: [0, 1, 0] },
    lotus: { pos: [0.5, 0.5, 0.772], fwd: [0, 0, 1], up: [0, 1, 0] },
    harmonics: { pos: [0.5, 0.5, 0.719], fwd: [0, 0, 1], up: [0, 1, 0] }
  };

  // Sparse / centred forms (the numbers' roads + every sacred pattern + the live
  // scenes) recenter the flight camera on select so you spawn inside/facing the
  // form rather than off in an empty void.
  var RESET_VIEW_SCENES = { pi:1, collatz:1, primes3d:1, floweroflife:1, metatron:1, hopf:1,
    lotus:1, harmonics:1, jerusalem:1, vicsek:1,
    bfs:1, bidir:1, dijkstra:1, wavefront:1, randomflood:1, dfs:1, randomwalk:1, rxndiff:1, boids:1,
    'mo-fox':1, 'mo-horse':1, 'mo-flamingo':1, 'mo-parrot':1, 'mo-stork':1,
    'mo-cesiumman':1, 'mo-riggedfigure':1, 'mo-foxwalk':1 };

  // Snap the camera to a scene's captured start view. Applied at select time AND
  // again the instant the field actually swaps in (after the reveal-morph dip):
  // the camera keeps cruising/orbiting during the ~1s dip, so without the second
  // application a scene would appear at a drifted orientation, not its captured one.
  function applyStartView(scene) {
    if (RESET_VIEW_SCENES[scene]) {
      camFwd = [0, 0, 1]; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0;
      camPos = (viewMode === 'raymarch') ? [0, 0, -2.4] : [0.5, 0.5, 0.5];
    }
    if (SCENE_CAM[scene]) {
      var sc = SCENE_CAM[scene];
      camPos = sc.pos.slice(); camFwd = sc.fwd.slice(); camUp = sc.up.slice();
      yawVel = 0; pitchVel = 0; rollVel = 0;
    }
  }

  // Expectation-ghost reveal: morph between the generator's real clumpy field
  // (1) and the even grid people imagine "random" to be (0). The hero proof.
  var morph = 1;
  var morphTarget = 1;
  var gridPending = false;                    // one-shot: Perfect grid was picked from a held (search/sort/life) scene, so after the dip settle on the grid, not the swapped point field
  var MORPH_SMOOTH = 3.4;                     // morph easing rate (frame-rate independent, ~1s settle)
  var MORPH_GRID_N = Math.max(2, Math.round(Math.cbrt(POINT_COUNT)));  // imagined-field lattice side (100 for 1,000,000)

  function eyePosition() {
    var ce = Math.cos(elevation);
    return [
      distance * ce * Math.cos(azimuth),
      distance * Math.sin(elevation),
      distance * ce * Math.sin(azimuth)
    ];
  }

  /* ---- vec3 + mat4 helpers ---- */
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vnorm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  // Rotate vector v around unit axis a by angle ang (Rodrigues).
  function rotAxis(v, a, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var d = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
    return [
      v[0] * c + (a[1] * v[2] - a[2] * v[1]) * s + a[0] * d * (1 - c),
      v[1] * c + (a[2] * v[0] - a[0] * v[2]) * s + a[1] * d * (1 - c),
      v[2] * c + (a[0] * v[1] - a[1] * v[0]) * s + a[2] * d * (1 - c)
    ];
  }
  function perspectiveZO(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0;        out[3] = 0;
    out[4] = 0;          out[5] = f; out[6] = 0;        out[7] = 0;
    out[8] = 0;          out[9] = 0; out[10] = far * nf; out[11] = -1;
    out[12] = 0;         out[13] = 0; out[14] = far * near * nf; out[15] = 0;
    return out;
  }

  function lookAt(out, eye, center, up) {
    var ex = eye[0], ey = eye[1], ez = eye[2];
    var z0 = ex - center[0], z1 = ey - center[1], z2 = ez - center[2];
    var len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len; z1 *= len; z2 *= len;
    var x0 = up[1] * z2 - up[2] * z1;
    var x1 = up[2] * z0 - up[0] * z2;
    var x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) { x0 = 0; x1 = 0; x2 = 0; } else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
    var y0 = z1 * x2 - z2 * x1;
    var y1 = z2 * x0 - z0 * x2;
    var y2 = z0 * x1 - z1 * x0;
    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
    out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
    out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
    out[12] = -(x0 * ex + x1 * ey + x2 * ez);
    out[13] = -(y0 * ex + y1 * ey + y2 * ez);
    out[14] = -(z0 * ex + z1 * ey + z2 * ez);
    out[15] = 1;
    return out;
  }

  /* ============================================================
     Render-tile offset table: every integer cell of a 7x7x7 neighbourhood
     (343 copies), sorted by distance from the centre. Draw distance picks the
     nearest RENDER_TILE_COUNT of these, so the lattice fills outward in shells
     with no diagonal gaps. Distance-sorted means the first 7 entries are the
     centre + 6 face neighbours, i.e. the historical default reproduces exactly.
     Fed to the vertex shader as a small static uniform buffer (binding 1).
     ============================================================ */
  var TILE_MAX = 343;
  var tileOffsetData = (function () {
    var R = 3, list = [], x, y, z;
    for (x = -R; x <= R; x++) for (y = -R; y <= R; y++) for (z = -R; z <= R; z++) list.push([x, y, z]);
    list.sort(function (a, b) {
      return (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) - (b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
    });
    var f = new Float32Array(TILE_MAX * 4);   // vec4 stride (xyz + pad) for uniform-array alignment
    for (var i = 0; i < TILE_MAX; i++) { f[i * 4] = list[i][0]; f[i * 4 + 1] = list[i][1]; f[i * 4 + 2] = list[i][2]; }
    return f;
  })();
  var tileOffsBuffer;

  /* ============================================================
     WGSL, instanced glowing star billboards
     ============================================================ */
  var SHADER = [
    'struct Uniforms {',
    '  view : mat4x4<f32>,',
    '  proj : mat4x4<f32>,',
    '  params : vec4<f32>,',     // x: star radius, w: star brightness
    '  params2 : vec4<f32>,',    // x: aura growth / gas radius, y: gas brightness, z: reveal morph, w: imagined-grid N
    '  params3 : vec4<f32>,',    // xyz: flight cam fractional pos, w: mode (0 orbit, 1 flight)
    '  params4 : vec4<f32>,',    // x: time (s), y: breathe amount, z: cluster-pop gain, w: grid lift
    '  params5 : vec4<f32>,',    // x: pathMode (1 = reinterpret dev as search state), y: beacon pulse 0..1
    '};',
    '@group(0) @binding(0) var<uniform> U : Uniforms;',
    'struct TileOffsets { offs : array<vec4<f32>, ' + TILE_MAX + '>, };',
    '@group(0) @binding(1) var<uniform> TOFF : TileOffsets;',
    '',
    'struct VSOut {',
    '  @builtin(position) pos : vec4<f32>,',
    '  @location(0) uv : vec2<f32>,',
    '  @location(1) color : vec3<f32>,',
    '};',
    '',
    // Density-deviation palette. dev = log2(local density / expected):
    // negative = void (cold blue), 0 = average, positive = cluster (warm gold),
    // very dense = white-hot core. Colour derives from the data, so it proves
    // the thesis instead of decorating it.
    // Discrete colour by cluster size (how many stars are touching). Level 0
    // is a plain pale star; each step up is a distinct colour so a 3- vs 4- vs
    // 5- vs 6- vs 7+-star cluster reads at a glance.
    'fn levelColor(lvl : f32) -> vec3<f32> {',
    '  var cols = array<vec3<f32>, 6>(',
    '    vec3<f32>(0.60, 0.68, 0.86),',   // 0: mundane (cluster size 1-2)
    '    vec3<f32>(0.30, 0.82, 0.95),',   // 1: size 3, cyan
    '    vec3<f32>(0.42, 0.95, 0.55),',   // 2: size 4, green
    '    vec3<f32>(1.00, 0.82, 0.30),',   // 3: size 5, gold
    '    vec3<f32>(1.00, 0.52, 0.20),',   // 4: size 6, orange
    '    vec3<f32>(1.00, 0.28, 0.42)',    // 5: size 7+, hot red
    '  );',
    '  let x = clamp(lvl, 0.0, 5.0);',
    '  let i = u32(floor(x));',
    '  let j = min(i + 1u, 5u);',
    '  return mix(cols[i], cols[j], x - floor(x));',   // smooth gradient between tiers (no hard colour banding)
    '}',
    '',
    'fn corner6(vi : u32) -> vec2<f32> {',
    '  var corners = array<vec2<f32>, 6>(',
    '    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),',
    '    vec2<f32>(-1.0,  1.0), vec2<f32>(1.0, -1.0), vec2<f32>( 1.0, 1.0)',
    '  );',
    '  return corners[vi];',
    '}',
    '',
    // Orbit: cube centred on the origin. Flight: tile the field infinitely,
    // placing each point at its nearest copy to the (fractional) camera so you
    // can fly forever through it.
    'fn worldPos(center : vec3<f32>) -> vec3<f32> {',
    '  if (U.params5.x > 0.5) { return center - U.params3.xyz; }',      // pathfinding: a single finite lattice (no wrap); camPos is passed absolute
    '  if (U.params3.w > 0.5) {',
    '    let rel = center - U.params3.xyz;',
    '    return rel - round(rel);',
    '  }',
    '  return center - vec3<f32>(0.5, 0.5, 0.5);',
    '}',
    // In flight, fade points out toward the wrap boundary, a soft spherical
    // horizon, so there are no hard edges and tiles never visibly pop.
    'fn flightFade(world : vec3<f32>) -> f32 {',
    '  if (U.params5.x > 0.5) { return 1.0; }',                          // pathfinding: finite object, no horizon fade
    '  if (U.params3.w > 0.5) {',
    '    return clamp((0.7 - length(world)) / 0.18, 0.0, 1.0);',
    '  }',
    '  return 1.0;',
    '}',
    '',
    // The "imagined" field: a stratified jittered grid, one star per cell of a
    // gridN^3 lattice. Perfectly even, no clumps, no voids, and no visible lines
    // (the per-cell offset is random). It is exactly what people picture when
    // they hear "random". Built on the GPU from the instance index, so it costs
    // no buffer and no CPU work, and we morph toward the real field by params2.z.
    'fn uhash(x : u32) -> f32 {',
    '  var h = x;',
    '  h = h ^ (h >> 16u);',
    '  h = h * 0x7feb352du;',
    '  h = h ^ (h >> 15u);',
    '  h = h * 0x846ca68bu;',
    '  h = h ^ (h >> 16u);',
    '  return f32(h & 0xffffffu) / 16777216.0;',
    '}',
    'fn imaginedPos(ii : u32) -> vec3<f32> {',
    '  let gn = U.params2.w;',
    '  let gi = f32(ii);',
    '  let cellsXY = gn * gn;',
    '  let iz = floor(gi / cellsXY);',
    '  let rem = gi - iz * cellsXY;',
    '  let iy = floor(rem / gn);',
    '  let ix = rem - iy * gn;',
    '  let jit = vec3<f32>(uhash(ii * 3u), uhash(ii * 3u + 1u), uhash(ii * 3u + 2u));',
    '  return (vec3<f32>(ix, iy, iz) + jit) / gn;',
    '}',
    '',
    // Stars: small, sharp, cluster-coloured. params2.z is the reveal morph
    // (0 = imagined even grid, 1 = the generator's real field); lerp both the
    // position and the cluster level by it, so clumps condense and warm up.
    '@vertex',
    'fn vs(@location(0) center : vec3<f32>, @location(1) dev : f32, @builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {',
    '  let corner = corner6(vi % 6u);',
    '  let tile = vi / 6u;',                                            // which copy: 0..RENDER_TILE_COUNT-1, indexed into the distance-sorted TOFF table (binding 1)
    '  let off = TOFF.offs[tile].xyz;',
    '  let m = U.params2.z;',
    // Pathfinding/sort hold their true geometry (torus / cylinder) at all morph
    // values - they must NEVER blend toward the imagined cube grid, or the scene
    // visibly breaks into a cube (or a half-morphed shape) on entry/exit. Their
    // fade in/out is driven by brightness (col * m) at the end of this shader.
    '  let centerM = select(mix(imaginedPos(ii), center, m), center, U.params5.x > 0.5);',
    '  let lifeT = U.params4.x;',                                       // drives the luminosity breath below (no geometric motion: scenes hold still, you fly through them)
    '  let world = worldPos(centerM) + off;',                          // nearest copy plus the tile offset, so the lattice extends far
    '  let fade = flightFade(world);',
    '  var out : VSOut;',
    '  if (fade < 0.004) { out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0); out.uv = corner; out.color = vec3<f32>(0.0, 0.0, 0.0); return out; }',  // cull faded copies (no fragments)
    '  var clip = U.proj * (U.view * vec4<f32>(world, 1.0));',
    '  var lvl = clamp((dev * m - 1.0) * (1.0 + U.params4.z), 0.0, 5.0);',  // params4.z = cluster-pop gain (random field only): clumps reach the hot tiers + bigger auras
    '  var szMul = 1.0 + lvl * U.params2.x * 0.30 * (1.0 + U.params4.z * 2.0);',
    '  var col = levelColor(lvl) * (0.7 + lvl * 0.55);',
    '  if (U.params5.x > 0.5) {',                                       // PATHFINDING / SORTING: dev encodes per-element state (written by the engine each frame)
    '    let pm = U.params5.y;',                                        // beacon pulse 0..1
    '    if (U.params5.z > 1.5) {',                                     // LIFE: full-strength dev colour (NOT the dim search baseline) + a brightness floor so cool / far-side points never vanish
    '      let h = clamp(dev - 1.0, 0.0, 5.0);',
    '      let dfL = clamp(1.06 - (clip.w - U.params5.w) * 0.9, 0.78, 1.12);',   // gentle depth cue, floored high (far side stays clearly lit)
    '      col = levelColor(h) * (1.55 + dev * 0.55) * dfL;',                    // floor (~1.7x) keeps cool points visible; steeper slope makes hot / activated points pop
    '      szMul = 2.2;',                                                        // CONSTANT point/line width -- never changes with colour, so morphs + heat do not pulse the thickness
    '    } else if (U.params5.z > 0.5) {',                              // SORTING: vivid full-strength rainbow by value + bright compare/swap flashes
    '      if (dev < 6.5) { let h = clamp(dev - 1.0, 0.0, 5.0); col = levelColor(h) * 2.3; szMul = 1.9; }',   // value: vivid full-strength tier colour, fuller points
    '      else if (dev < 7.0) { col = vec3<f32>(1.0, 1.0, 1.0) * 4.6; szMul = 3.3; }',                       // comparing: white flash
    '      else { col = vec3<f32>(1.0, 0.9, 0.5) * 4.6; szMul = 3.1; }',                                      // swapping: gold pop
    '    } else {',
    '      let df = clamp(1.18 - (clip.w - U.params5.w) * 2.2, 0.35, 1.18);',                    // depth cue: the far side of the donut dims, the near side brightens
    '      let rang = atan2(center.y - 0.5, center.x - 0.5);',                                   // angle around the ring, for the colour gradient
    '      let ringTint = vec3<f32>(0.34 + 0.16 * cos(rang), 0.40 + 0.12 * cos(rang + 2.094), 0.58 + 0.14 * cos(rang + 4.189));',  // subtle hue drift around the ring so the wraparound reads
    '      let base = ringTint * (0.42 * df);',                                                   // baseline: EVERY cell stays visible here (unvisited shell + solid core + cooled-down cells)
    '      if (dev < 0.95) { col = base; szMul = 0.40; }',                                        // visible baseline - the whole solid donut reads at this quiet level
    '      else if (dev < 6.5) { let h = clamp(dev - 1.0, 0.0, 5.0); col = base + levelColor(h) * (h * 0.55 * df); szMul = 0.40 + h * 0.8; }',  // visited HEAT: a bright pulse ADDED over the baseline, which fades back as the cell cools
    '      else if (dev < 8.0) { col = vec3<f32>(0.82, 0.90, 1.0) * 1.5; szMul = 1.4; }',         // traced ROUTE line: a calm cool-white, far less intense than before
    '      else if (dev < 9.0) { col = vec3<f32>(0.55, 0.95, 1.0) * (2.4 + pm * 1.4); szMul = 6.0 + pm * 3.0; }',         // START beacon (smaller so it does not balloon past the surface)
    '      else { col = vec3<f32>(1.0, 0.72, 0.22) * (2.4 + (1.0 - pm) * 1.4); szMul = 6.0 + (1.0 - pm) * 3.0; }',        // END beacon
    '    }',
    '  }',
    '  let sz = U.params.x * szMul * clip.w;',                          // constant screen size: a near star never balloons
    '  clip.x = clip.x + corner.x * sz / U.params.y;', // params.y = aspect, keeps the sprite round
    '  clip.y = clip.y + corner.y * sz;',
    '  out.pos = clip;',
    '  out.uv = corner;',
    '  let lifePulse = 1.0 + U.params4.y * sin(lifeT * 0.5);',          // tunable luminosity breath: every scene gently breathes (params4.y depth)
    '  let gridLift = 1.0 + (1.0 - m) * U.params4.w;',                  // lift the faint "perfect grid" (m -> 0) so its even stars read; no effect on the revealed field (m = 1)
    '  if (U.params5.x > 0.5) {',                                       // pathfinding/sort: geometry held; fade in/out by the morph (no grid-lift, no cube)
    '    out.color = col * clamp(m, 0.0, 1.0);',
    '  } else {',
    '    out.color = col * fade * lifePulse * gridLift;',
    '  }',
    '  return out;',
    '}',
    '',
    '@fragment',
    'fn fs(in : VSOut) -> @location(0) vec4<f32> {',
    '  let d = length(in.uv);',
    '  if (d > 1.0) { discard; }',
    '  let a = max(exp(-44.0 * d * d), 0.12 * exp(-8.0 * d * d));',
    '  return vec4<f32>(in.color * a * U.params.w, a);',
    '}',
    '',
    // Gas: large, soft, dev-coloured blobs that overlap into continuous nebula.
    // Per-blob brightness scales with density, so clusters glow and voids stay dark.
    '@vertex',
    'fn vsGas(@location(0) center : vec3<f32>, @location(1) dev : f32, @builtin(vertex_index) vi : u32) -> VSOut {',
    '  let corner = corner6(vi);',
    '  let world = worldPos(center);',
    '  var viewPos = U.view * vec4<f32>(world, 1.0);',
    '  viewPos.x = viewPos.x + corner.x * U.params2.x;',
    '  viewPos.y = viewPos.y + corner.y * U.params2.x;',
    '  var out : VSOut;',
    '  out.pos = U.proj * viewPos;',
    '  out.uv = corner;',
    '  let intensity = 0.25 + 0.75 * smoothstep(-1.5, 2.0, dev);',
    '  var gf = flightFade(world);',
    '  if (U.params3.w > 0.5) { gf = gf * smoothstep(0.04, 0.14, length(world)) * 0.5; }',
    '  out.color = levelColor(clamp(dev - 1.0, 0.0, 5.0)) * intensity * gf;',
    '  return out;',
    '}',
    '',
    '@fragment',
    'fn fsGas(in : VSOut) -> @location(0) vec4<f32> {',
    '  let d = length(in.uv);',
    '  if (d > 1.0) { discard; }',
    '  let a = exp(-2.4 * d * d);',
    '  return vec4<f32>(in.color * a * U.params2.y, a);',
    '}'
  ].join('\n');

  /* ============================================================
     WGSL, bloom post-process (fullscreen passes)
     bright-pass -> separable Gaussian blur -> ACES composite.
     ============================================================ */
  var POST_SHADER = [
    'struct FSOut {',
    '  @builtin(position) pos : vec4<f32>,',
    '  @location(0) uv : vec2<f32>,',
    '};',
    '@group(0) @binding(0) var samp : sampler;',
    '@group(0) @binding(1) var texA : texture_2d<f32>;',
    '@group(0) @binding(2) var texB : texture_2d<f32>;',
    '@group(0) @binding(3) var<uniform> blurDir : vec4<f32>;',
    '',
    '@vertex',
    'fn fsv(@builtin(vertex_index) vi : u32) -> FSOut {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  let xy = p[vi];',
    '  var o : FSOut;',
    '  o.pos = vec4<f32>(xy, 0.0, 1.0);',
    '  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);',
    '  return o;',
    '}',
    '',
    // Keep only what is brighter than the knee, the dense clumps bloom, faint dust does not.
    '@fragment',
    'fn bright(in : FSOut) -> @location(0) vec4<f32> {',
    '  let c = textureSample(texA, samp, in.uv).rgb;',
    '  let b = max(c - vec3<f32>(0.9), vec3<f32>(0.0));',
    '  return vec4<f32>(b, 1.0);',
    '}',
    '',
    // Separable 9-tap Gaussian (linear-sampled weights); direction in blurDir.xy.
    '@fragment',
    'fn blur(in : FSOut) -> @location(0) vec4<f32> {',
    '  let o1 = blurDir.xy * 1.3846153846;',
    '  let o2 = blurDir.xy * 3.2307692308;',
    '  var sum = textureSample(texA, samp, in.uv).rgb * 0.2270270270;',
    '  sum = sum + textureSample(texA, samp, in.uv + o1).rgb * 0.3162162162;',
    '  sum = sum + textureSample(texA, samp, in.uv - o1).rgb * 0.3162162162;',
    '  sum = sum + textureSample(texA, samp, in.uv + o2).rgb * 0.0702702703;',
    '  sum = sum + textureSample(texA, samp, in.uv - o2).rgb * 0.0702702703;',
    '  return vec4<f32>(sum, 1.0);',
    '}',
    '',
    'fn aces(x : vec3<f32>) -> vec3<f32> {',
    '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));',
    '}',
    '@fragment',
    'fn composite(in : FSOut) -> @location(0) vec4<f32> {',
    '  let scene = textureSample(texA, samp, in.uv).rgb;',
    '  let bloom = textureSample(texB, samp, in.uv).rgb;',
    '  var col = scene + bloom * 0.42;',
    '  col = aces(col * 1.22);',
    '  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));',
    '  col = clamp(mix(vec3<f32>(luma), col, 1.38), vec3<f32>(0.0), vec3<f32>(1.0));',   // vibrance: richer, cleaner colour (boosted on owner request)
    '  return vec4<f32>(col, 1.0);',
    '}',
    // Plain copy/upscale: brings the half-res raymarch target up to the
    // full-res scene texture (linear sampler) before the bloom passes.
    '@fragment',
    'fn copy(in : FSOut) -> @location(0) vec4<f32> {',
    '  return textureSample(texA, samp, in.uv);',
    '}'
  ].join('\n');

  /* ============================================================
     WGSL, skybox: a real nebula sampled by the camera's LOOK DIRECTION
     Turns each pixel into a world-space ray from the camera basis (fwd/up/right
     + vertical fovTan + aspect), maps that direction to equirectangular UV, and
     samples the nebula. Because it depends only on DIRECTION, turning the camera
     sweeps across it while flying never reaches it: a distant, world-anchored
     cosmos. Drawn first into the (MSAA, HDR) scene pass; the points glow on top.
     ============================================================ */
  var SKY_SHADER = [
    'struct SkyU {',
    '  fwd : vec4<f32>,',     // xyz camera forward, w = tan(fov/2) vertical
    '  up : vec4<f32>,',      // xyz camera up, w = aspect
    '  tint : vec4<f32>,',    // rgb brightness + hue multiplier
    '  rot : mat3x3<f32>,',   // spawn orientation: rotates the ray so the galactic centre sits in the spawn-facing direction
    '};',
    '@group(0) @binding(0) var<uniform> SKY : SkyU;',
    '@group(0) @binding(1) var skyTex : texture_2d<f32>;',
    '@group(0) @binding(2) var skySamp : sampler;',
    'struct SVO {',
    '  @builtin(position) pos : vec4<f32>,',
    '  @location(0) ndc : vec2<f32>,',
    '};',
    '@vertex',
    'fn skv(@builtin(vertex_index) vi : u32) -> SVO {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  let xy = p[vi];',
    '  var o : SVO;',
    '  o.pos = vec4<f32>(xy, 0.0, 1.0);',
    '  o.ndc = xy;',
    '  return o;',
    '}',
    '@fragment',
    'fn skf(in : SVO) -> @location(0) vec4<f32> {',
    '  let fwd = normalize(SKY.fwd.xyz);',
    '  let right = normalize(cross(fwd, SKY.up.xyz));',
    '  let up = cross(right, fwd);',
    '  let dir = normalize(fwd + right * (in.ndc.x * SKY.fwd.w * SKY.up.w) + up * (in.ndc.y * SKY.fwd.w));',
    '  let d = SKY.rot * dir;',   // rotate so the galactic centre lands in the spawn-facing direction
    '  let u = atan2(d.x, d.z) * 0.15915494 + 0.5;',   // longitude -> 1/(2pi)
    '  let v = acos(clamp(d.y, -1.0, 1.0)) * 0.31830989;',   // latitude -> 1/pi (0 zenith, 1 nadir)
    '  let raw = textureSampleLevel(skyTex, skySamp, vec2<f32>(u, v), 0.0).rgb;',
    '  // Tone compression: lift the dark sky off black + pull the bright band down so it stops washing out the points.',
    '  // toneLo = dark floor (raise to brighten the darks), toneHi = bright cap (lower to darken the band), toneG = midtone lift (<1 brightens).',
    '  let toneLo = 0.035; let toneHi = 0.42; let toneG = 0.7;',
    '  let curved = toneLo + (toneHi - toneLo) * pow(max(raw, vec3<f32>(0.0)), vec3<f32>(toneG));',
    '  let col = curved * SKY.tint.rgb;',
    '  return vec4<f32>(col, 1.0);',
    '}'
  ].join('\n');

  /* ============================================================
     WGSL, raymarched Mandelbulb (render path B)
     A full-screen pass that sphere-traces the power-8 Mandelbulb distance
     estimator and shades it. Renders into a half-res HDR target, then gets
     upscaled into the scene texture and bloomed like everything else. The
     camera (camPos / camFwd / camUp) is the same free-flight camera, so you
     literally fly into the formula.
     ============================================================ */
  var RAYMARCH_SHADER = [
    'struct RM {',
    '  a : vec4<f32>,',   // xyz camPos, w time
    '  b : vec4<f32>,',   // xyz camFwd, w fovTan
    '  c : vec4<f32>,',   // xyz camUp, w aspect
    '  d : vec4<f32>,',   // x power, y exposure
    '};',
    '@group(0) @binding(0) var<uniform> U : RM;',
    'struct VO { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };',
    '@vertex',
    'fn rv(@builtin(vertex_index) vi : u32) -> VO {',
    '  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  let xy = p[vi];',
    '  var o : VO;',
    '  o.pos = vec4<f32>(xy, 0.0, 1.0);',
    '  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);',
    '  return o;',
    '}',
    // Power-8 Mandelbulb distance estimator + orbit trap. Iterate z -> z^n + p
    // in spherical coordinates; track the running derivative dr for the DE.
    'fn mandelDE(p : vec3<f32>) -> vec2<f32> {',
    '  var z = p;',
    '  var dr = 1.0;',
    '  var r = 0.0;',
    '  var trap = 1e10;',
    '  let power = U.d.x;',
    '  for (var i = 0; i < 10; i = i + 1) {',
    '    r = length(z);',
    '    if (r > 2.0) { break; }',
    '    var theta = acos(clamp(z.z / r, -1.0, 1.0));',
    '    var phi = atan2(z.y, z.x);',
    '    dr = pow(r, power - 1.0) * power * dr + 1.0;',
    '    let zr = pow(r, power);',
    '    theta = theta * power;',
    '    phi = phi * power;',
    '    z = zr * vec3<f32>(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + p;',
    '    trap = min(trap, dot(z, z));',
    '  }',
    '  return vec2<f32>(0.5 * log(r) * r / dr, trap);',
    '}',
    'fn nrm(p : vec3<f32>) -> vec3<f32> {',
    '  let e = 0.0003;',
    '  return normalize(vec3<f32>(',
    '    mandelDE(p + vec3<f32>(e, 0.0, 0.0)).x - mandelDE(p - vec3<f32>(e, 0.0, 0.0)).x,',
    '    mandelDE(p + vec3<f32>(0.0, e, 0.0)).x - mandelDE(p - vec3<f32>(0.0, e, 0.0)).x,',
    '    mandelDE(p + vec3<f32>(0.0, 0.0, e)).x - mandelDE(p - vec3<f32>(0.0, 0.0, e)).x));',
    '}',
    'fn ao(p : vec3<f32>, n : vec3<f32>) -> f32 {',
    '  var occ = 0.0;',
    '  var sca = 1.0;',
    '  for (var i = 0; i < 5; i = i + 1) {',
    '    let hr = 0.01 + 0.14 * f32(i) / 4.0;',
    '    occ = occ + (hr - mandelDE(p + n * hr).x) * sca;',
    '    sca = sca * 0.9;',
    '  }',
    '  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);',
    '}',
    'fn pal(t : f32) -> vec3<f32> {',
    '  return vec3<f32>(0.5) + vec3<f32>(0.5) * cos(6.28318 * (t + vec3<f32>(0.0, 0.33, 0.6)));',
    '}',
    '@fragment',
    'fn rf(in : VO) -> @location(0) vec4<f32> {',
    '  let ro = U.a.xyz;',
    '  let fwd = normalize(U.b.xyz);',
    '  let right = normalize(cross(fwd, U.c.xyz));',
    '  let up = cross(right, fwd);',
    '  let ndc = in.uv * 2.0 - vec2<f32>(1.0, 1.0);',
    '  let rd = normalize(fwd + ndc.x * U.c.w * U.b.w * right - ndc.y * U.b.w * up);',
    '  var t = 0.0;',
    '  var hit = false;',
    '  var trap = 0.0;',
    '  var p = ro;',
    '  for (var i = 0; i < 110; i = i + 1) {',
    '    p = ro + rd * t;',
    '    let res = mandelDE(p);',
    '    trap = res.y;',
    '    if (res.x < 0.00022 * t + 0.000004) { hit = true; break; }',
    '    t = t + res.x;',
    '    if (t > 7.0) { break; }',
    '  }',
    '  var col = vec3<f32>(0.010, 0.013, 0.028) + vec3<f32>(0.0, 0.0, 0.03) * (1.0 - in.uv.y);',
    '  if (hit) {',
    '    let n = nrm(p);',
    '    let lig = normalize(vec3<f32>(0.55, 0.7, -0.45));',
    '    let dif = clamp(dot(n, lig), 0.0, 1.0);',
    '    let occ = ao(p, n);',
    '    let sky = 0.5 + 0.5 * n.y;',
    '    let base = pal(pow(clamp(trap, 0.0, 1.0), 0.35));',
    '    var lit = base * (0.16 + 0.6 * dif) * occ + base * sky * 0.22 * occ;',
    '    let fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);',
    '    lit = lit + base * fres * 0.7;',
    '    let fog = exp(-0.10 * t);',
    '    col = lit * fog * U.d.y;',
    '  }',
    '  return vec4<f32>(col, 1.0);',
    '}'
  ].join('\n');

  /* ============================================================
     GPU STATE + INIT
     ============================================================ */
  var device, context, format;
  var pipeline, gasPipeline, uniformBuffer, instanceBuffer, bindGroup, gasBindGroup;
  // Nebula skybox (world-anchored: sampled by look direction, see SKY_SHADER).
  // Image: ESO's full-sky Milky Way panorama (S. Brunier / ESO, CC BY 4.0), a true
  // 2:1 equirectangular all-sky map, so it wraps onto the sphere with no seam or
  // pole-smear and stays sharp under the narrow flight FOV.
  var skyboxPipeline = null, skyUniformBuffer = null, skySampler = null, skyTexture = null, skyBindGroup = null;
  var skyData = new Float32Array(24);            // fwd+fovTan, up+aspect, tint, then a mat3 (3 columns, each padded to vec4)
  var skyRotCols = new Float32Array([1,0,0, 0,1,0, 0,0,1]);   // skybox orientation matrix columns; identity until the first scene spawn
  var skyOrientField = null;                     // recompute the orientation whenever the active scene changes
  // Orient the skybox so the galactic centre (which sits at texture +Z) lands in the
  // direction the camera faces at spawn. Build the rotation mapping the spawn camera
  // frame onto a galaxy-forward frame; its columns are (-sR, sU, sF). Captured once
  // per scene, then held, so turning afterwards still sweeps across a fixed sky.
  function captureSkyOrient() {
    var fx = camFwd[0], fy = camFwd[1], fz = camFwd[2];
    var fn = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1; fx /= fn; fy /= fn; fz /= fn;            // sF
    var rx = fy*camUp[2] - fz*camUp[1], ry = fz*camUp[0] - fx*camUp[2], rz = fx*camUp[1] - fy*camUp[0];  // sR = sF x up
    var rn = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1; rx /= rn; ry /= rn; rz /= rn;
    var ux = ry*fz - rz*fy, uy = rz*fx - rx*fz, uz = rx*fy - ry*fx;                          // sU = sR x sF
    skyRotCols[0] = -rx; skyRotCols[1] = ux; skyRotCols[2] = fx;   // column 0
    skyRotCols[3] = -ry; skyRotCols[4] = uy; skyRotCols[5] = fy;   // column 1
    skyRotCols[6] = -rz; skyRotCols[7] = uz; skyRotCols[8] = fz;   // column 2
  }
  var SKY_TINT = [0.3, 0.3, 0.3];                // global FLAT multiplier ON TOP of the shader tone curve. 0.3 = much darker whole sky (neutral, no colour shift). Raise toward 1 to lighten, lower to darken
  // Load the nebula JPEG into a GPU texture, then build the skybox bind group. The
  // skybox draw stays gated on skyBindGroup, so until this resolves the background is
  // just black (no flash); a load failure simply leaves it black.
  function loadSkyTexture() {
    if (!device || typeof Image === 'undefined') return;
    var img = new Image();
    img.onload = function () {
      var ready = (typeof createImageBitmap === 'function') ? createImageBitmap(img) : Promise.resolve(img);
      ready.then(function (src) {
        var w = src.width || img.naturalWidth, h = src.height || img.naturalHeight;
        var tex = device.createTexture({
          size: [w, h], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        device.queue.copyExternalImageToTexture({ source: src }, { texture: tex }, [w, h]);
        skyTexture = tex;
        skyBindGroup = device.createBindGroup({
          layout: skyboxPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: skyUniformBuffer } },
            { binding: 1, resource: tex.createView() },
            { binding: 2, resource: skySampler }
          ]
        });
      }).catch(function () {});
    };
    img.onerror = function () {};
    img.src = 'assets/images/nebula-bg.jpg?v=6k';   // ?v cache-busts the 6000x3000 upgrade so browsers refetch the higher-res file
  }
  var uniformData = new Float32Array(52);   // view + proj + params + params2 + params3 + params4 + params5
  // ----- LIFE / look-tuning state -----
  var gxTime = 0;                            // seconds, accumulated in the frame loop; drives the luminosity breath
  var BREATHE_AMT = 0.0;                     // luminosity "breath" depth (dev-tunable); 0 = constant brightness (PC default: off)
  var CLUSTER_GAIN = 0.85;                   // how hard the random field's clumps pop: drives BOTH colour reach and aura size of dense knots (dev-tunable)
  var GRID_LIFT = 1.1;                       // brightness lift for the even "perfect grid" so its stars read (dev-tunable)
  var viewMat = new Float32Array(16);
  var projMat = new Float32Array(16);
  var aspect = 1;
  var running = false;
  var loopRunning = false;     // is a requestAnimationFrame loop currently scheduled
  var pageVisible = true;      // tab visible (Page Visibility API)
  var onScreen = true;         // demo is within the viewport (IntersectionObserver)
  var fpsAccum = 0, fpsFrames = 0;

  // Bloom / post-process state
  var brightPipeline, blurPipeline, compositePipeline, sampler;
  var brightBG, blurHBG, blurVBG, compositeBG;
  var dirHBuf, dirVBuf;
  var sceneTex, bloomA, bloomB, sceneView, bloomAView, bloomBView;
  var sceneMSAA, sceneMSAAView;        // multisampled scene target (antialiasing); resolves into sceneTex
  var MSAA = 4;                        // MSAA sample count for the point/line scene pass
  var postReady = false;

  // Render path B: raymarched Mandelbulb. Half-res HDR target, upscaled into
  // the scene texture before bloom.
  var raymarchPipeline, copyPipeline, rmTex, rmView, rmUniformBuffer, rmBindGroup, copyBG;
  var rmData = new Float32Array(16);
  var viewMode = 'points';      // 'points' | 'raymarch'
  var RAYMARCH_SCALE = 1.0;     // raymarch resolution fraction of the canvas (capped below); lower = faster, softer
  var FOV_TAN = Math.tan(50 * Math.PI / 180 / 2);   // matches the perspective fov

  var RENDER_TILE_COUNT = 16;   // render-distance: how many of the distance-sorted TOFF tiles to draw (PC default 16; dev slider goes to TILE_MAX = 343 / 7x7x7)
  var POINT_RADIUS   = 0.0021;  // star screen-space half-size (constant pixels; never balloons). Smaller = crisper, higher-def structure. Bumped up for fuller, higher-fidelity dots.
  var AURA_GROWTH    = 2.0;     // a high-heat star swells up to this many times bigger (a glowing aura). Lowered from 8 so bright points stay crisp instead of smearing fine filaments.
  var BRIGHTNESS     = 0.60;    // star brightness (tunable; PC default from owner playtest)
  // Dev panel (backtick) performance levers, all live-adjustable at runtime.
  var DPR_CAP    = 2;           // device-pixel-ratio cap (sizeCanvas)
  var RES_BUDGET = 8000000;     // max main-canvas pixels per frame (sizeCanvas; PC default 8 MP, mobile dialed back below)
  var BLOOM_DIV  = 1;           // bloom ping-pong downscale in createTargets: 1/N resolution (PC default full-res; mobile dialed back below)
  var DRAW_COUNT = POINT_COUNT; // how many of the POINT_COUNT points to actually draw
  var FPS_CAP    = 0;           // 0 = uncapped (display refresh); otherwise target fps
  var lastDraw   = 0;           // FPS_CAP throttle bookkeeping

  // ---- Mobile guard --------------------------------------------------------
  // The defaults above are the owner's dialed-in PC values (8 MP canvas, full-res
  // bloom, 4x MSAA, 16 render tiles). Real phones/tablets can't afford those, so
  // dial back ONLY the expensive levers. Detection is touch-device-only — a coarse
  // PRIMARY pointer AND no hover — so a small/short DESKTOP window keeps the full
  // PC profile. (An earlier innerHeight<760 heuristic wrongly demoted short desktop
  // windows to "mobile".) The look/aesthetic constants (point size, aura,
  // brightness, breathe, cluster pop, grid lift, particle count) stay identical.
  //
  // NOTE: do NOT lower MSAA here. The scene render pass (grep 'resolveTarget')
  // unconditionally resolves a multisampled attachment, so a 1-sample target is a
  // WebGPU validation error and the whole scene goes black. MSAA must stay > 1
  // unless that pass is first made MSAA-aware (render direct, no resolveTarget,
  // when MSAA === 1).
  var GX_MOBILE = (typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches);
  if (GX_MOBILE) {
    RES_BUDGET = 2000000;       // 2 MP cap on phones
    BLOOM_DIV = 3;              // 1/3-res bloom ping-pong
    RENDER_TILE_COUNT = 8;      // shorter render distance
    // MSAA stays 4 — see the note above (1-sample + resolveTarget = blank scene).
  }
  var GAS_ON         = false;   // splat-gas layer OFF for now: it read as fuzzy cottonballs and cost fps. Crisp stars now; a proper volumetric nebula is a later raymarch pass.
  var GAS_RADIUS     = 0.04;    // nebula blob radius, large so blobs merge into gas
  var GAS_BRIGHTNESS = 0.035;    // per-blob gas brightness, low; overlap + density do the work
  var GAS_COUNT      = 60000;   // blobs drawn for the gas layer (caps overdraw; a spatial subset)

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w * h > RES_BUDGET) {                  // pixel budget, dev-tunable via the backtick panel
      var s = Math.sqrt(RES_BUDGET / (w * h));
      w = Math.max(1, Math.floor(w * s));
      h = Math.max(1, Math.floor(h * s));
    }
    var changed = (canvas.width !== w || canvas.height !== h);
    if (changed) {
      canvas.width = w;
      canvas.height = h;
    }
    aspect = w / h;
    if (changed && postReady) createTargets();
  }

  // (Re)create the HDR scene target + half-res bloom ping-pong textures and
  // their bind groups. Called once at init and on every resize.
  function createTargets() {
    if (!device) return;
    var w = canvas.width, h = canvas.height;
    var hw = Math.max(1, Math.floor(w / BLOOM_DIV));   // bloom ping-pong downscale (dev-tunable); bloom is low-frequency so a low res is nearly invisible
    var hh = Math.max(1, Math.floor(h / BLOOM_DIV));
    if (sceneTex) sceneTex.destroy();
    if (sceneMSAA) sceneMSAA.destroy();
    if (bloomA) bloomA.destroy();
    if (bloomB) bloomB.destroy();
    var usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    sceneTex = device.createTexture({ size: [w, h], format: 'rgba16float', usage: usage });
    sceneMSAA = device.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT, sampleCount: MSAA });
    bloomA   = device.createTexture({ size: [hw, hh], format: 'rgba16float', usage: usage });
    bloomB   = device.createTexture({ size: [hw, hh], format: 'rgba16float', usage: usage });
    sceneView  = sceneTex.createView();
    sceneMSAAView = sceneMSAA.createView();
    bloomAView = bloomA.createView();
    bloomBView = bloomB.createView();

    brightBG = device.createBindGroup({
      layout: brightPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: sceneView }]
    });
    blurHBG = device.createBindGroup({
      layout: blurPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: bloomBView }, { binding: 3, resource: { buffer: dirHBuf } }]
    });
    blurVBG = device.createBindGroup({
      layout: blurPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: bloomAView }, { binding: 3, resource: { buffer: dirVBuf } }]
    });
    compositeBG = device.createBindGroup({
      layout: compositePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: sceneView }, { binding: 2, resource: bloomBView }]
    });

    // (Raymarch render path removed: the field is always drawn as points, so
    // the ~17MB half-res raymarch target is no longer allocated per resize.)

    device.queue.writeBuffer(dirHBuf, 0, new Float32Array([1 / hw, 0, 0, 0]));
    device.queue.writeBuffer(dirVBuf, 0, new Float32Array([0, 1 / hh, 0, 0]));
  }

  // Only render when the work is actually being seen: the tab is visible AND
  // the demo is on screen. Otherwise the loop stops, so the million-point GPU
  // pass is not cooking the laptop in a background tab or while scrolled past.
  function wantLoop() { return running && pageVisible && onScreen; }

  // ----- Intro: "first light" bloom-up (once, on initial load) -----
  // The old load showed two uncoordinated pops: a million points snapped onto black at
  // full brightness, then the 8MB nebula popped in behind them whenever it finished
  // downloading. Instead, hold a beat until the nebula texture is ready (or a short max
  // wait), then ease the whole field up from black in one slow bloom with a gentle
  // settling pan. introLum drives the star + gas brightness; skyReadyEase * introLum
  // drives the nebula (so a late/slow nebula still fades in rather than popping). At
  // lum = 1 every multiplier is 1, so this is completely inert once it finishes.
  var reduceMotion = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var introLum = 0, skyReadyEase = 0, introT = 0, introWait = 0;
  var introStarted = false, INTRO_DONE = false;
  var INTRO_DUR = reduceMotion ? 0.001 : 2.2;   // bloom-up duration (s); reduced-motion: appear at once, no animated bloom
  var INTRO_SKY_WAIT_MAX = 0.9;                 // hold the bloom at most this long for the nebula, then begin regardless
  var INTRO_SKY_EASE = 2.5;                     // nebula fade-in rate once its texture lands (also smooths a late/slow load, no pop)
  var INTRO_YAW = 0.05;                         // gentle settling-pan rate during the bloom (rad/s, decays to 0); skipped under reduced-motion

  function startLoop() {
    if (loopRunning || !wantLoop()) return;
    loopRunning = true;
    lastTime = 0;              // reset dt so the view does not lurch after a pause
    requestAnimationFrame(frame);
  }

  function frame() {
    if (!wantLoop()) { loopRunning = false; return; }

    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (FPS_CAP > 0 && now - lastDraw < (1000 / FPS_CAP) - 1) { requestAnimationFrame(frame); return; }   // dev fps cap: skip this tick, stay scheduled
    lastDraw = now;
    var dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
    lastTime = now;
    gxTime += dt;                              // drives the breathe + spin "life" motion

    // Intro "first light" bloom-up. skyReadyEase tracks the nebula texture landing; the
    // bloom clock waits for it (or INTRO_SKY_WAIT_MAX) so the background and the points
    // rise together, then introLum eases 0->1 once. Inert after INTRO_DONE.
    skyReadyEase += ((skyBindGroup ? 1 : 0) - skyReadyEase) * (1 - Math.exp(-INTRO_SKY_EASE * dt));
    if (!INTRO_DONE) {
      if (!introStarted) {
        introWait += dt;
        if (skyBindGroup || introWait >= INTRO_SKY_WAIT_MAX) {
          introStarted = true;
          if (statusEl) statusEl.style.display = 'none';   // belt-and-suspenders: clear any status as first light begins (empty in the normal path)
        }
      } else {
        introT += dt;
        var ip = introT >= INTRO_DUR ? 1 : introT / INTRO_DUR;
        introLum = ip * ip * ip * (ip * (ip * 6 - 15) + 10);   // smootherstep: slow-in, slow-out
        if (ip >= 1) { introLum = 1; INTRO_DONE = true; }
      }
    }

    if (fpsEl) {
      fpsFrames++; fpsAccum += dt;
      if (fpsAccum >= 0.5) { fpsEl.textContent = Math.round(fpsFrames / fpsAccum) + ' fps'; fpsFrames = 0; fpsAccum = 0; }
    }

    perspectiveZO(projMat, 50 * Math.PI / 180, aspect, 0.001, 100);

    morph += (morphTarget - morph) * (1 - Math.exp(-MORPH_SMOOTH * dt));   // buttery reveal morph
    if (pendingField !== null && morph < 0.05) {   // dipped to the grid: swap the field invisibly, then rise back
      var swField = pendingField;
      loadField(swField);
      applyStartView(swField);                      // re-assert the captured start view NOW (the dip drifted the camera) so the scene always rises at the right orientation
      pendingField = null;
      morphTarget = gridPending ? 0 : 1;            // grid-from-held: settle on the grid (morph 0), not the just-swapped point field
      gridPending = false;
    }

    if (isSearchField(currentField)) searchTick(dt);   // live pathfinding scene: step the search + repaint the lattice each frame
    if (isSortField(currentField)) sortTick(dt);       // live sorting scene: replay ops + repaint the rings each frame
    if (isLifeField(currentField)) lifeTick(dt);       // live Life scene: advance the organism + repaint each frame

    if (mode === 'flight') {
      if (isSearchField(currentField) || isLifeField(currentField)) {
        // Orbit the torus instead of flying through it, so its donut shape reads
        // in 3D. Drag spins it; left alone it sweeps the whole thing.
        if (!srDragging) srAz += SEARCH_ORBIT_SPIN * dt;
        if (srEl > 1.45) srEl = 1.45; else if (srEl < -1.45) srEl = -1.45;
        // Idle orbit roams over the top and under the bottom on two slow,
        // mutually-detuned beats (and az keeps spinning), so the donut is seen
        // from every angle. The roam is BLENDED in/out via srSweep, eased toward
        // 0 while you drag and back to 1 when you let go (or on entry), so the
        // motion transitions smoothly between manual and auto - never a snap.
        var autoEl = 0.45 + 0.70 * Math.sin(gxTime * 0.083) + 0.16 * Math.sin(gxTime * 0.27 + 1.3);   // bounded ~[-0.41, 1.31]: stays clear of the pole, no hard clamp
        srSweep += ((srDragging ? 0 : 1) - srSweep) * (1 - Math.exp(-2.2 * dt));
        var elEff = srEl + (autoEl - srEl) * srSweep;          // ease between the manual elevation and the auto roam
        if (elEff > 1.4) elEff = 1.4; else if (elEff < -1.4) elEff = -1.4;
        var srce = Math.cos(elEff);
        camPos[0] = 0.5 + srR * srce * Math.cos(srAz);
        camPos[1] = 0.5 + srR * Math.sin(elEff);
        camPos[2] = 0.5 + srR * srce * Math.sin(srAz);
        camFwd = vnorm([0.5 - camPos[0], 0.5 - camPos[1], 0.5 - camPos[2]]);
        camUp = vnorm(vcross(vnorm(vcross(camFwd, [0, 1, 0])), camFwd));
        lookAt(viewMat, [0, 0, 0], camFwd, camUp);
      } else {
      var tYaw = ((held.ArrowLeft || held.a) ? 1 : 0) - ((held.ArrowRight || held.d) ? 1 : 0);
      var tPit = ((held.ArrowUp || held.w) ? 1 : 0) - ((held.ArrowDown || held.s) ? 1 : 0);
      var tRoll = (held.e ? 1 : 0) - (held.q ? 1 : 0);   // E rolls one way, Q the other
      var ks = 1 - Math.exp(-TURN_SMOOTH * dt);          // frame-rate-independent easing
      yawVel   += (tYaw * TURN_RATE - yawVel) * ks;      // ease the turn velocity, not the angle
      pitchVel += (tPit * TURN_RATE - pitchVel) * ks;
      rollVel  += (tRoll * ROLL_RATE - rollVel) * ks;
      var rt = vnorm(vcross(camFwd, camUp));
      camFwd = rotAxis(camFwd, camUp, yawVel * dt);      // yaw around the camera's own up
      camFwd = rotAxis(camFwd, rt, pitchVel * dt);       // pitch around the camera's own right
      camUp  = rotAxis(camUp,  rt, pitchVel * dt);
      camUp  = rotAxis(camUp,  camFwd, rollVel * dt);    // roll around the camera's own forward (Q/E)
      camFwd = vnorm(camFwd);
      rt = vnorm(vcross(camFwd, camUp));
      camUp = vcross(rt, camFwd);                        // re-orthonormalize so up loops over the top
      if (introStarted && !INTRO_DONE && !reduceMotion) {   // gentle settling pan during first light, decays to 0 as the field arrives
        camFwd = vnorm(rotAxis(camFwd, camUp, INTRO_YAW * (1 - introLum) * dt));
        rt = vnorm(vcross(camFwd, camUp));
        camUp = vcross(rt, camFwd);
      }
      camPos[0] += camFwd[0] * flightSpeed * dt;
      camPos[1] += camFwd[1] * flightSpeed * dt;
      camPos[2] += camFwd[2] * flightSpeed * dt;
      lookAt(viewMat, [0, 0, 0], camFwd, camUp);
      }
      var absCam = isSearchField(currentField) || isSortField(currentField) || isLifeField(currentField);   // search/sort/life scenes are unwrapped finite objects: pass absolute camPos
      uniformData[40] = absCam ? camPos[0] : camPos[0] - Math.floor(camPos[0]);
      uniformData[41] = absCam ? camPos[1] : camPos[1] - Math.floor(camPos[1]);
      uniformData[42] = absCam ? camPos[2] : camPos[2] - Math.floor(camPos[2]);
      uniformData[43] = 1;
    } else {
      if (!orbitDrag) {
        if (Math.abs(azVel) > 0.0006 || Math.abs(elVel) > 0.0006) {
          azimuth += azVel * dt;                          // glide after a flick
          elevation += elVel * dt;
          if (elevation > 1.45) { elevation = 1.45; elVel = 0; } else if (elevation < -1.45) { elevation = -1.45; elVel = 0; }
          var od = Math.exp(-ORBIT_DAMP * dt);            // ease the spin out (frame-rate independent)
          azVel *= od; elVel *= od;
        } else if (autoSpin) {
          azimuth += 0.0016;
        }
      }
      var eye = eyePosition();
      lookAt(viewMat, eye, [0, 0, 0], [0, 1, 0]);
      uniformData[40] = 0; uniformData[41] = 0; uniformData[42] = 0; uniformData[43] = 0;
    }

    try { updateSearchHUD(); } catch (e) {}   // START/END callouts + stats; no-op off the search scenes, must never break the loop
    try { updateSortHUD(); } catch (e) {}     // sort stats panel + speed control; no-op off the sort scenes

    var encoder = device.createCommandEncoder();

    {
      // Render path: instanced point billboards (the field).
      uniformData.set(viewMat, 0);
      uniformData.set(projMat, 16);
      uniformData[32] = POINT_RADIUS * (currentField === 'boids' ? 3.0 : 1.0);   // boids: fatter points so each bird reads up close
      uniformData[33] = aspect;
      uniformData[34] = POINT_COUNT;
      uniformData[35] = BRIGHTNESS * introLum;       // first-light bloom-up: stars rise from black
      uniformData[36] = AURA_GROWTH;
      uniformData[37] = GAS_BRIGHTNESS * introLum;   // ...and the nebular gas with them
      uniformData[38] = morph;
      uniformData[39] = MORPH_GRID_N;
      uniformData[44] = gxTime;
      uniformData[45] = BREATHE_AMT;
      uniformData[46] = (currentField === 'random') ? CLUSTER_GAIN : 0;   // cluster-pop boosts only the random field
      uniformData[47] = GRID_LIFT;
      var searchOn = isSearchField(currentField), sortOn = isSortField(currentField), lifeOn = isLifeField(currentField);
      uniformData[48] = (searchOn || sortOn || lifeOn) ? 1 : 0;           // params5.x: hold geometry + reinterpret dev as search/sort/life state
      uniformData[49] = 0.5 + 0.5 * Math.sin(gxTime * 1.2);              // params5.y: beacon pulse (start/end throb in counter-phase)
      uniformData[50] = sortOn ? 1 : (lifeOn ? 2 : 0);                    // params5.z: render mode -> 0 search baseline, 1 sort vivid-rainbow, 2 life full-bright
      uniformData[51] = (searchOn || lifeOn) ? srR : 0;                   // params5.w: orbit radius, for the zoom-robust depth fade in the shader
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      if (skyboxPipeline) {                                               // feed the skybox the live camera basis so it rotates with the look direction
        if (currentField !== skyOrientField) { captureSkyOrient(); skyOrientField = currentField; }   // new scene: pin the galaxy to the spawn-facing direction
        skyData[0] = camFwd[0]; skyData[1] = camFwd[1]; skyData[2] = camFwd[2]; skyData[3] = FOV_TAN;
        skyData[4] = camUp[0];  skyData[5] = camUp[1];  skyData[6] = camUp[2];  skyData[7] = aspect;
        var skyMul = introLum * skyReadyEase;   // first-light: nebula rises with the points (and eases in cleanly if it loads late)
        skyData[8] = SKY_TINT[0] * skyMul; skyData[9] = SKY_TINT[1] * skyMul; skyData[10] = SKY_TINT[2] * skyMul; skyData[11] = 0;
        skyData[12] = skyRotCols[0]; skyData[13] = skyRotCols[1]; skyData[14] = skyRotCols[2]; skyData[15] = 0;
        skyData[16] = skyRotCols[3]; skyData[17] = skyRotCols[4]; skyData[18] = skyRotCols[5]; skyData[19] = 0;
        skyData[20] = skyRotCols[6]; skyData[21] = skyRotCols[7]; skyData[22] = skyRotCols[8]; skyData[23] = 0;
        device.queue.writeBuffer(skyUniformBuffer, 0, skyData);
      }

      var sp = encoder.beginRenderPass({
        colorAttachments: [{ view: sceneMSAAView, resolveTarget: sceneView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
      });
      if (skyBindGroup) { sp.setPipeline(skyboxPipeline); sp.setBindGroup(0, skyBindGroup); sp.draw(3); }   // distant nebula backdrop, drawn before the points
      sp.setVertexBuffer(0, instanceBuffer);
      if (GAS_ON) {
        sp.setPipeline(gasPipeline);
        sp.setBindGroup(0, gasBindGroup);
        sp.draw(6, Math.min(POINT_COUNT, GAS_COUNT));
      }
      sp.setPipeline(pipeline);
      sp.setBindGroup(0, bindGroup);
      sp.draw(6 * ((searchOn || sortOn || lifeOn) ? 1 : RENDER_TILE_COUNT), searchOn ? (pf ? pf.total + pf.lineCount : 0) : sortOn ? (sr ? (sr.view === 'helix' ? sr.helixTotal : sr.total) : 0) : lifeOn ? lifeDrawCount : DRAW_COUNT);   // search/sort/life = finite, untiled
      sp.end();
    }

    // 2. Bright-pass: scene -> bloomB (half res).
    var bp = encoder.beginRenderPass({
      colorAttachments: [{ view: bloomBView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    bp.setPipeline(brightPipeline); bp.setBindGroup(0, brightBG); bp.draw(3); bp.end();

    // 3. Horizontal blur: bloomB -> bloomA.
    var hb = encoder.beginRenderPass({
      colorAttachments: [{ view: bloomAView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    hb.setPipeline(blurPipeline); hb.setBindGroup(0, blurHBG); hb.draw(3); hb.end();

    // 4. Vertical blur: bloomA -> bloomB.
    var vb = encoder.beginRenderPass({
      colorAttachments: [{ view: bloomBView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    vb.setPipeline(blurPipeline); vb.setBindGroup(0, blurVBG); vb.draw(3); vb.end();

    // 5. Composite scene + bloom -> swapchain, tonemapped.
    var cp = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    cp.setPipeline(compositePipeline); cp.setBindGroup(0, compositeBG); cp.draw(3); cp.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  }

  // Keys + wheel only act when the demo is focused, so the embedded piece
  // never hijacks page scrolling or typing while the reader scrolls past.
  function focused() { return document.activeElement === canvas; }

  // Both embedded and fullscreen are flight: the camera always cruises forward
  // through the infinitely-tiled field. The button just toggles fullscreen.
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement) ||
           !!(wrapperEl && wrapperEl.classList.contains('gx-pseudo-fs'));
  }
  function updateHint() {
    if (!hintEl) return;
    hintEl.textContent = isFullscreen()
      ? ((isSearchField(currentField) || isLifeField(currentField))
          ? 'drag to spin · scroll to zoom · H to hide UI · ~ for toggles · Esc to exit'
          : 'drag or WASD to steer · Q/E roll · scroll for speed · H to hide UI · ~ for toggles · Esc to exit')
      : ((isSearchField(currentField) || isLifeField(currentField))
          ? 'drag to spin · scroll to zoom · H to hide UI · ~ for toggles'
          : 'drag or WASD to steer · Q/E roll · scroll for speed · H to hide UI · ~ for toggles');
  }

  // ---- Dev performance panel (toggled by the backtick key) ----
  // Live sliders for every lever that affects framerate and heat. Mounted on
  // wrapperEl so it stays visible in fullscreen. Built lazily on first toggle.
  var devPanelEl = null;
  function buildDevPanel() {
    if (devPanelEl || !wrapperEl) return;
    var st = document.createElement('style');
    st.textContent =
      '.gx-dev{position:absolute;top:10px;left:10px;z-index:60;width:226px;max-height:90%;overflow:auto;' +
      'background:rgba(8,10,18,0.9);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:10px 12px;' +
      'font-family:var(--d-mono,monospace);font-size:11px;color:#cdd6e6;box-shadow:0 6px 24px rgba(0,0,0,0.55);' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}' +
      '.gx-dev h4{margin:0 0 9px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9fb0c8;font-weight:600;}' +
      '.gx-dev-row{margin:0 0 9px;}' +
      '.gx-dev-lab{display:flex;justify-content:space-between;margin-bottom:3px;}' +
      '.gx-dev-val{color:#fff;}' +
      '.gx-dev input[type=range]{width:100%;height:14px;cursor:pointer;accent-color:#7fd4ff;}' +
      '.gx-dev-hint{color:#6b7790;font-size:10px;margin-top:4px;font-family:var(--font-body,system-ui,sans-serif);}';
    document.head.appendChild(st);

    if (window.getComputedStyle && getComputedStyle(wrapperEl).position === 'static') {
      wrapperEl.style.position = 'relative';
    }

    var p = document.createElement('div');
    p.className = 'gx-dev';
    p.style.display = 'none';
    var head = document.createElement('h4');
    head.textContent = 'Performance';
    p.appendChild(head);

    function stopEv(e) { e.stopPropagation(); }
    p.addEventListener('pointerdown', stopEv);
    p.addEventListener('mousedown', stopEv);
    p.addEventListener('touchstart', stopEv, { passive: true });
    p.addEventListener('wheel', stopEv, { passive: true });

    // apply(v) fires live on every drag tick (keep it cheap). commit(v) is
    // optional and fires once on release (the `change` event) for heavy levers
    // like a point-count regeneration. Returns handles so rows can cross-update.
    function row(label, min, max, step, val, fmt, apply, commit) {
      var r = document.createElement('div'); r.className = 'gx-dev-row';
      var lab = document.createElement('div'); lab.className = 'gx-dev-lab';
      var nm = document.createElement('span'); nm.textContent = label;
      var ve = document.createElement('span'); ve.className = 'gx-dev-val'; ve.textContent = fmt(val);
      lab.appendChild(nm); lab.appendChild(ve);
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        ve.textContent = fmt(v);
        if (apply) apply(v);
      });
      if (commit) inp.addEventListener('change', function () { commit(parseFloat(inp.value)); });
      r.appendChild(lab); r.appendChild(inp); p.appendChild(r);
      return { input: inp, val: ve, fmt: fmt };
    }

    function fmtK(v) { return v + 'k'; }

    row('FPS cap', 0, 144, 6, FPS_CAP, function (v) { return v <= 0 ? 'uncapped' : ('' + v); }, function (v) { FPS_CAP = v; });
    row('Resolution (MP)', 0.5, 8, 0.25, RES_BUDGET / 1e6, function (v) { return v.toFixed(2); }, function (v) { RES_BUDGET = v * 1e6; sizeCanvas(); });
    row('DPR cap', 0.5, 2, 0.05, DPR_CAP, function (v) { return v.toFixed(2); }, function (v) { DPR_CAP = v; sizeCanvas(); });
    row('Bloom downscale', 1, 6, 1, BLOOM_DIV, function (v) { return '1/' + v; }, function (v) { BLOOM_DIV = v; createTargets(); });
    // Particles = the ACTUAL generated count (and the density field). Heavy, so
    // it regenerates on release, not every tick. Bumping it bumps the draw cap
    // to match so the new points show; the "Points drawn" slider tracks it.
    var drawnRow;
    row('Particles (k)', 50, POINT_CAP / 1000, 50, POINT_COUNT / 1000, fmtK, null, function (v) {
      setPointCount(Math.round(v * 1000));
      if (drawnRow) {
        drawnRow.input.max = POINT_COUNT / 1000;
        drawnRow.input.value = DRAW_COUNT / 1000;
        drawnRow.val.textContent = drawnRow.fmt(DRAW_COUNT / 1000);
      }
    });
    drawnRow = row('Points drawn (k)', 50, POINT_COUNT / 1000, 50, DRAW_COUNT / 1000, fmtK, function (v) { DRAW_COUNT = Math.min(POINT_COUNT, Math.round(v * 1000)); });
    row('Draw distance', 1, TILE_MAX, 1, RENDER_TILE_COUNT, function (v) { return v + (v === 1 ? ' tile' : ' tiles'); }, function (v) { RENDER_TILE_COUNT = v; });
    row('Point size', 0.0004, 0.004, 0.0001, POINT_RADIUS, function (v) { return v.toFixed(4); }, function (v) { POINT_RADIUS = v; });
    row('Aura growth', 0, 8, 0.25, AURA_GROWTH, function (v) { return v.toFixed(2); }, function (v) { AURA_GROWTH = v; });
    row('Brightness', 0.2, 1.5, 0.05, BRIGHTNESS, function (v) { return v.toFixed(2); }, function (v) { BRIGHTNESS = v; });
    row('Breathe', 0, 0.25, 0.01, BREATHE_AMT, function (v) { return v.toFixed(2); }, function (v) { BREATHE_AMT = v; });
    row('Cluster pop', 0, 2, 0.05, CLUSTER_GAIN, function (v) { return v.toFixed(2); }, function (v) { CLUSTER_GAIN = v; });
    row('Grid lift', 0, 2.5, 0.1, GRID_LIFT, function (v) { return v.toFixed(1); }, function (v) { GRID_LIFT = v; });
    row('Search speed', 2, 240, 2, SEARCH_STEPS, function (v) { return '' + v; }, function (v) { SEARCH_STEPS = v; });

    var hint = document.createElement('div');
    hint.className = 'gx-dev-hint';
    hint.textContent = 'backtick toggles this panel';
    p.appendChild(hint);

    wrapperEl.appendChild(p);
    devPanelEl = p;
  }

  function toggleDevPanel() {
    if (!devPanelEl) buildDevPanel();
    if (!devPanelEl) return;
    devPanelEl.style.display = (devPanelEl.style.display === 'none') ? 'block' : 'none';
  }
  // CSS "pseudo-fullscreen": a position:fixed cover for browsers without the
  // Fullscreen API on elements (notably iOS Safari, which only fullscreens
  // <video>). Same visual result; the button shows the exit icon and Esc/tap
  // leaves. Re-fit the canvas backing store to the new viewport size.
  function setPseudoFs(on) {
    var el = wrapperEl || canvas;
    if (!el) return;
    el.classList.toggle('gx-pseudo-fs', on);
    document.documentElement.classList.toggle('gx-fs-lock', on);
    updateHint();
    try { canvas.focus(); } catch (e) {}
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }
  function toggleFullscreen() {
    var el = wrapperEl || canvas;
    if (isFullscreen()) {
      if (el && el.classList.contains('gx-pseudo-fs')) { setPseudoFs(false); return; }
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { try { exit.call(document); } catch (e) {} }
    } else {
      var req = el && (el.requestFullscreen || el.webkitRequestFullscreen);
      if (req) {
        try {
          var p = req.call(el);
          if (p && p.catch) p.catch(function () { setPseudoFs(true); });   // blocked/rejected: fall back
        } catch (e) { setPseudoFs(true); }
      } else {
        setPseudoFs(true);   // no element Fullscreen API (iOS Safari)
      }
    }
  }

  function initInput() {
    var lastX = 0, lastY = 0, dragging = false;

    // --- Camera capture (dev tool) ----------------------------------------
    // Fly/orbit to the view you want for a scene, then press C (or call
    // GXCAM.grab() in the console). It grabs that scene's camera into a running
    // table and copies the whole table to the clipboard, so the exact start
    // views can be pasted back and hardcoded as per-scene defaults.
    var lastSelectedScene = 'mulberry';
    var camCaptures = {};
    function camR3(v) { return Math.round(v * 1000) / 1000; }
    function camStateFor(scene) {
      if (isSearchField(scene)) return { az: camR3(srAz), el: camR3(srEl), r: camR3(srR) };   // search scenes orbit
      return { pos: [camR3(camPos[0]), camR3(camPos[1]), camR3(camPos[2])],
               fwd: [camR3(camFwd[0]), camR3(camFwd[1]), camR3(camFwd[2])],
               up:  [camR3(camUp[0]),  camR3(camUp[1]),  camR3(camUp[2])] };
    }
    function camDump() {
      var out = [], k;
      for (k in camCaptures) out.push("  '" + k + "': " + JSON.stringify(camCaptures[k]) + ',');
      return '{\n' + out.join('\n') + '\n}';
    }
    function captureCam() {
      camCaptures[lastSelectedScene] = camStateFor(lastSelectedScene);
      var txt = camDump(), nScene = Object.keys(camCaptures).length;
      if (navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(txt); } catch (e) {} }
      try { console.log('[GXCAM] captured "' + lastSelectedScene + '" (' + nScene + ' scenes), copied to clipboard:\n' + txt); } catch (e) {}
      showReveal('Captured "' + lastSelectedScene + '" (' + nScene + ' total) + copied. Press C on each scene, then paste it to me.');
    }
    window.GXCAM = { grab: captureCam, dump: function () { var t = camDump(); try { console.log(t); } catch (e) {} return t; }, clear: function () { camCaptures = {}; }, all: function () { return camCaptures; } };

    // Drag to steer: rotate the look direction by the mouse delta (same axes as
    // the arrow keys). The camera keeps cruising forward the whole time.
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; srDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try { canvas.focus(); } catch (err) {}
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (wrapperEl) wrapperEl.classList.remove('gx-clean');   // clicking the scene brings a hidden UI back (the Hide button is what hides it)
      bumpBlurb();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (isSearchField(currentField) || isLifeField(currentField)) {   // search/life scene: drag orbits the form
        srAz -= dx * 0.006;
        srEl += dy * 0.006;
        return;
      }
      var s = 0.005;
      var rt = vnorm(vcross(camFwd, camUp));
      camFwd = rotAxis(camFwd, camUp, -dx * s);    // yaw
      camFwd = rotAxis(camFwd, rt, -dy * s);       // pitch
      camUp  = rotAxis(camUp, rt, -dy * s);
      camFwd = vnorm(camFwd);
      rt = vnorm(vcross(camFwd, camUp));
      camUp = vcross(rt, camFwd);                  // re-orthonormalize, infinite look
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false; srDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Scroll to change cruise speed (and keep the Speed slider in sync).
    canvas.addEventListener('wheel', function (e) {
      if (!focused()) return;          // let the page scroll unless we're focused
      e.preventDefault();
      if (isSearchField(currentField) || isLifeField(currentField)) {   // search/life scene: scroll zooms the orbit in/out
        srR = Math.max(0.7, Math.min(3.2, srR + e.deltaY * 0.0012));
        return;
      }
      applySpeed(flightSpeed - e.deltaY * 0.00015);
      if (flightSpeed > 1e-4) lastCruiseSpeed = flightSpeed;   // remember it to resume after a search scene
      bumpBlurb();
    }, { passive: false });

    // The scene buttons (Mulberry / Perfect grid / Mandelbulb) are wired below (selectScene).

    window.addEventListener('keydown', function (e) {
      if (e.key === '`' || e.key === '~') { toggleDevPanel(); e.preventDefault(); return; }   // dev performance panel
      // Embedded: only act when the canvas is focused, so the page can still
      // scroll with the arrows. Fullscreen: always act.
      if (!isFullscreen() && !focused()) return;
      var k = (e.key.length === 1) ? e.key.toLowerCase() : e.key;   // letters case-insensitive
      if (held.hasOwnProperty(k)) { held[k] = true; e.preventDefault(); return; }   // arrows + WASD steer, Q/E roll
      if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
      if (e.key === 'Escape' && wrapperEl && wrapperEl.classList.contains('gx-pseudo-fs')) { toggleFullscreen(); return; }   // leave pseudo-fullscreen (real fullscreen exits on its own)
      if (e.key === 'h' || e.key === 'H') { toggleClean(); return; }   // hide all UI for clean screenshots
      if (e.key === 'c' || e.key === 'C') { captureCam(); return; }     // dev: copy the current scene's camera (to set per-scene start views)
      if (e.key === '1') { selectScene('mulberry'); return; }
      if (e.key === '2') { selectScene('grid'); return; }
      if (e.key === '3') { selectScene('thomas'); return; }
      if (e.key === '4') { selectScene('lorenz'); return; }
      if (e.key === 'r' || e.key === 'R') {
        currentSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
        regenerate();
        bumpBlurb();
      }
    });

    window.addEventListener('keyup', function (e) {
      var k = (e.key.length === 1) ? e.key.toLowerCase() : e.key;
      if (held.hasOwnProperty(k)) held[k] = false;
    });

    // Sound is on by default; unlock the Web Audio context on the first user
    // gesture (capture phase, so a control's stopPropagation can't swallow it).
    window.addEventListener('pointerdown', sortAudioUnlock, { once: true, capture: true });
    window.addEventListener('touchstart', sortAudioUnlock, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', sortAudioUnlock, { once: true, capture: true });

    var flyBtn = document.getElementById('galaxy-fly');
    if (flyBtn) flyBtn.addEventListener('click', toggleFullscreen);

    // Clean / screenshot mode: hide every UI overlay (controls, top-right, hint,
    // captions, dev panel), leaving only the render. Toggle with the H key or the
    // hide button; the button vanishes with the rest, so press H to bring it back.
    function toggleClean() { if (wrapperEl) wrapperEl.classList.toggle('gx-clean'); }
    var hideBtn = document.getElementById('galaxy-hide');
    if (hideBtn) hideBtn.addEventListener('click', function () { toggleClean(); try { canvas.focus(); } catch (e) {} });

    // Reset view: recenter the flight camera at the current scene's start.
    function resetView() {
      camFwd = [0, 0, 1]; camUp = [0, 1, 0]; yawVel = 0; pitchVel = 0; rollVel = 0; lastTime = 0;
      camPos = (viewMode === 'raymarch') ? [0, 0, -2.4] : [0.5, 0.5, 0.5];
      bumpBlurb();
    }
    var resetBtn = document.getElementById('galaxy-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      resetView();
      try { canvas.focus(); } catch (e) {}
    });

    // The view buttons: "Mulberry" (real clumpy field) and "Perfect grid" (the
    // even grid people picture). One selection at a time; the description text
    // and a cinematic caption follow it. The grid is the philosophical foil:
    // perfectly even, and so almost impossible by chance.
    var revealEl = document.getElementById('galaxy-reveal');
    var revealTimer = null;
    function showReveal(text) {
      if (!revealEl) return;
      revealEl.textContent = text;
      revealEl.classList.add('show');
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(function () { revealEl.classList.remove('show'); }, 4200);
    }
    // Pick a scene. Switching render path (points <-> raymarch) resets the
    // flight camera to that scene's start; switching within the point cloud
    // (Mulberry <-> Perfect grid) leaves the camera put so the morph reads.
    function selectScene(scene) {
      lastSelectedScene = scene;                 // remembered for the C-key camera capture
      // Leaving a sort scene for anything else: ramp the sort audio down so its note
      // tails do not ring into the next scene. No-op when audio is idle or staying in sort.
      if (isSortField(currentField) && !isSortField(scene)) sortAudioSilence();
      if (wrapperEl) {
        // Reflect the active scene in the category dropdowns: the owning
        // category shows the scene and gets the lit style; the others reset to
        // their category-name placeholder.
        var sels = wrapperEl.querySelectorAll('.gx-cat-select');
        for (var i = 0; i < sels.length; i++) {
          var s = sels[i], has = false, j;
          for (j = 0; j < s.options.length; j++) { if (s.options[j].value === scene) { has = true; break; } }
          s.value = has ? scene : '';
          s.classList.toggle('gx-cat-select--active', has);
        }
      }
      if (scene === 'grid') {
        // The grid is a morph target on the POINT cloud: from a point scene the buffer
        // dissolves straight into it with no reload. But the held-geometry scenes
        // (search/sort/life) ignore the imagined-grid blend in the shader, so morphing
        // one toward the grid just fades the organism to black, the grid never shows. So
        // from a held scene, dip out to the point cloud first, then settle on the grid.
        if (isSearchField(currentField) || isSortField(currentField) || isLifeField(currentField)) {
          pendingField = 'mulberry';
          gridPending = true;
        } else {
          pendingField = null;
        }
        morphTarget = 0;
        if (blurbEl) blurbEl.textContent = 'The tidy, evenly spaced grid everyone pictures when they hear the word random. It looks right, and it is completely wrong: real chance never lands this clean. The twist? Perfect order is so unlikely a real generator would essentially never roll it. Perfection is the one result that is truly impossible.';
        showReveal('A perfect grid: tidy, even, and almost impossible by chance.');
      } else {
        var field = isLifeField(scene) ? scene :
                    isSortField(scene) ? scene :
                    (scene === 'thomas') ? 'thomas' :
                    (scene === 'lorenz') ? 'lorenz' :
                    (scene === 'aizawa') ? 'aizawa' :
                    (scene === 'dadras') ? 'dadras' :
                    (scene === 'sierpinski') ? 'sierpinski' :
                    (scene === 'jerusalem') ? 'jerusalem' :
                    (scene === 'vicsek') ? 'vicsek' :
                    (scene === 'primes3d') ? 'primes3d' :
                    (scene === 'gprimes') ? 'gprimes' :
                    (scene === 'collatz') ? 'collatz' :
                    (scene === 'pi') ? 'pi' :
                    (scene === 'clifford') ? 'clifford' :
                    (scene === 'logistic') ? 'logistic' :
                    (scene === 'recaman') ? 'recaman' :
                    (scene === 'polytope') ? 'polytope' :
                    (scene === 'floweroflife') ? 'floweroflife' :
                    (scene === 'metatron') ? 'metatron' :
                    (scene === 'hopf') ? 'hopf' :
                    (scene === 'lotus') ? 'lotus' :
                    (scene === 'harmonics') ? 'harmonics' :
                    (scene === 'bfs') ? 'bfs' :
                    (scene === 'bidir') ? 'bidir' :
                    (scene === 'dijkstra') ? 'dijkstra' :
                    (scene === 'wavefront') ? 'wavefront' :
                    (scene === 'randomflood') ? 'randomflood' :
                    (scene === 'dfs') ? 'dfs' :
                    (scene === 'randomwalk') ? 'randomwalk' : 'random';
        var sameFamily = (isSearchField(currentField) && isSearchField(field)) ||
                         (isSortField(currentField)   && isSortField(field));
        if (currentField === field) {
          pendingField = null;
          morphTarget = 1;                 // right field already loaded: just rise from wherever we are
        } else if (sameFamily) {
          // Switching algorithm WITHIN the live search/sort scene: do NOT dip to
          // the grid (that reset the spin / teleported the sort). Swap the algo
          // live and stay fully visible - the orbit keeps spinning (search) and
          // the dots fly to their new scramble (sort).
          loadField(field);
          pendingField = null;
          morphTarget = 1;
        } else if (morph < 0.1) {
          loadField(field);                // already at the grid: swap invisibly, then rise
          pendingField = null;
          morphTarget = 1;
        } else {
          pendingField = field;            // a field is visible: dip to the grid, swap there (frame loop), then rise
          morphTarget = 0;
        }
        // Recenter / frame the flight camera on select (the shared set + captured
        // views live by RESET_VIEW_SCENES / SCENE_CAM, re-applied at swap time too).
        if (RESET_VIEW_SCENES[field]) resetView();   // resetView also bumps the blurb + resets dt
        applyStartView(scene);                        // captured per-scene start view overrides the generic recenter
        if (isSortField(scene)) {
          var SB = { selection:['Selection sort','hunt down the smallest, slam it to the front, repeat. All eyes, few hands.'],
            bubble:['Bubble sort','swap neighbours pass after pass; the biggest floats to the top. The slow, lovable classic.'],
            cocktail:['Cocktail shaker','bubble sort swinging both ways, so order closes in from both ends at once.'],
            insertion:['Insertion sort','grow a tidy run and tuck each new value into place. Lightning on nearly-sorted data.'],
            gnome:['Gnome sort','one worker shuffles forward, stumbles back on every fix. Insertion sort, solo.'],
            shell:['Shell sort','insertion sort that leaps across shrinking gaps: long jumps first, fine tuning last.'],
            comb:['Comb sort','bubble sort with a shrinking reach; the long swaps kill the slow crawl.'],
            quick:['Quicksort','pick a pivot, split, recurse. The pivot locks home forever. O(n log n) and proud.'],
            heap:['Heapsort','build a max-heap, then siphon the biggest off the top, again and again. O(n log n), in place.'],
            bitonic:['Bitonic sort','a parallel sorting machine: identical compare-swaps fire in lockstep, blind to the data.'],
            oddeven:['Odd-even sort','alternating rows of neighbour swaps ripple values one step at a time.'],
            pancake:['Pancake sort','flip whole stacks like pancakes to bring the biggest to the top, then the bottom.'],
            bogo:['Bogosort','shuffle everything and pray it is sorted. Repeat. A cosmic joke. (Tiny array, mercifully.)'] }[scene];
          if (blurbEl) blurbEl.textContent = SB[0] + ': ' + SB[1] + ' Every value is a glowing ring: radius and colour are its size, depth is its slot. Fly down the bore and watch the scrambled tube smooth into a clean horn.';
          showReveal(SB[0] + ': fly down the bore as it sorts.');
        } else if (scene === 'thomas') {
          if (blurbEl) blurbEl.textContent = 'The Thomas attractor. Each axis chases the sine of the next with a whisper of friction: one rule, no randomness, yet the path never repeats and never escapes. It braids an endless glowing lattice that tiles in every direction. Fly through it without end.';
          showReveal('Thomas attractor: a chaotic lattice you fly through forever.');
        } else if (scene === 'lorenz') {
          if (blurbEl) blurbEl.textContent = 'The Lorenz attractor, the original butterfly. Three weather equations from 1963, and out fell chaos: a path that loops one wing, jumps to the other, and never settles. Lobes glow where it lingers, the bridge flares gold where it races. The shape that made chaos a science.';
          showReveal('Lorenz attractor: the butterfly that started chaos theory.');
        } else if (scene === 'aizawa') {
          if (blurbEl) blurbEl.textContent = 'The Aizawa attractor. A banded sphere skewered by an axial spike through both poles: the orbit lingers in the rings, then accelerates up the spike. A planet-sized gyroscope frozen mid-spin, glowing brightest along its axis.';
          showReveal('Aizawa attractor: a ringed globe pierced by a glowing axial spike.');
        } else if (scene === 'dadras') {
          if (blurbEl) blurbEl.textContent = 'The Dadras attractor. A four-winged flow that folds back on itself, leaping between lobes with no warning yet always tracing the same butterfly-of-butterflies. Cool where it lingers, blazing where it whips across.';
          showReveal('Dadras attractor: a four-winged butterfly the path leaps between forever.');
        } else if (scene === 'primes3d') {
          if (blurbEl) blurbEl.textContent = 'Every point is an address (a, b, c) whose squared distance from the origin, a squared plus b squared plus c squared, is prime. The voids are not noise, they are theorems: Legendre proved that numbers shaped like 4-to-the-a times (8b+7) can never be a sum of three squares, punching perfect spherical holes in the cloud. Pure arithmetic, scattering like chance.';
          showReveal('Primes in 3D: the voids are theorems.');
        } else if (scene === 'gprimes') {
          if (blurbEl) blurbEl.textContent = 'Gaussian primes: complex integers a+bi that refuse to factor in the world where i squared is minus one. They tile the plane with four-fold symmetry, then blow open into vast voids nothing like a grid. The gaps, the spiral arms, the clusters: not disorder, but the deep structure of arithmetic, tiling forever.';
          showReveal('Gaussian primes: arithmetic carved into a fractal galaxy.');
        } else if (scene === 'sierpinski') {
          if (blurbEl) blurbEl.textContent = 'The Sierpinski tetrahedron. Pick a point, jump halfway to a random corner, repeat forever, and a flawless fractal precipitates out of pure chance. Fly toward any face and find another tetrahedron inside. And another. The recursion never ends.';
          showReveal('Sierpinski tetrahedron: a fractal conjured from pure chance.');
        } else if (scene === 'jerusalem') {
          if (blurbEl) blurbEl.textContent = 'The Jerusalem cube, a sponge cut by the silver ratio. A cross of slots splits it into eight big and twelve smaller cubes, and each splits the same way forever, doorways nesting inside doorways at two interleaved sizes. A sanctuary with no final room. Fly into a portal and find smaller portals waiting.';
          showReveal('Jerusalem cube: silver-ratio doorways nested forever.');
        } else if (scene === 'vicsek') {
          if (blurbEl) blurbEl.textContent = 'The 3D Vicsek fractal, a plus-sign grown from the chaos game. Keep a cube\'s core and six face centres, shrink, repeat: every arm sprouts a smaller cross from its tip, a spiky crystalline jack reaching into the dark. All reach, no bulk. Fly along an arm and watch it fork without end.';
          showReveal('Vicsek fractal: every arm sprouts a smaller plus, endlessly.');
        } else if (scene === 'collatz') {
          if (blurbEl) blurbEl.textContent = 'Pick a number. Even? Halve it. Odd? Triple it and add one. Repeat. Everything ever tested drains to 1, yet nobody can prove it must. Here 60,000 numbers trace their paths and share edges as they funnel home: the trunk burns gold and red where thousands converge, the outliers cool to cyan. A vast coral that all of mathematics pours into, rooted at 1.';
          showReveal('The Collatz tree: 60,000 paths draining into one glowing root.');
        } else if (scene === 'pi') {
          if (blurbEl) blurbEl.textContent = 'Turn each digit of pi into a step in space and you get an infinite road that never repeats its pattern. Here are 5,000 digits, computed from scratch with Machin\'s 1706 formula, each mapped to one of ten directions on a sphere, colour running cyan to red across the journey. It looks random, yet every turn was inevitable: the world\'s most famous number, drawn as a road.';
          showReveal('Pi: 5,000 digits, one step each, drawn as a road through space.');
        } else if (scene === 'polytope') {
          if (blurbEl) blurbEl.textContent = 'The shadow a four-dimensional jewel throws into our world. Every strut is an edge of the 600-cell: 120 vertices, 720 edges, each vertex meeting twelve others at the same angle, all living on a hypersphere you cannot stand on. It spins in two planes at once, a move impossible here. Colour marks depth in the fourth direction, the one you cannot point toward.';
          showReveal('600-cell: the shadow of a 4D jewel, coloured by 4D depth.');
        } else if (scene === 'floweroflife') {
          if (blurbEl) blurbEl.textContent = 'The Flower of Life, the oldest pattern in sacred geometry, lifted off the page onto a sphere. Equal circles spaced so each passes through its neighbours, overlapping into the lens shapes called vesica. Wrapped around a sphere it closes on itself, an endless lattice with no edge and no centre. Fly inside and it surrounds you.';
          showReveal('Flower of Life: interlocking circles wrapped around a sphere.');
        } else if (scene === 'metatron') {
          if (blurbEl) blurbEl.textContent = 'Metatron\'s Cube. Set thirteen circles at the centre and corners of a cuboctahedron, then join every pair with a line. The 78 lines are said to hide all five Platonic solids at once, nested together. Coloured by length, the hidden solids sort themselves out by hue as you fly the cage of light.';
          showReveal('Metatron\'s Cube: 78 lines hiding all five Platonic solids.');
        } else if (scene === 'hopf') {
          if (blurbEl) blurbEl.textContent = 'The Hopf fibration, one of the most beautiful objects in mathematics. It combs the 3-sphere into circles where every ring links through every other, an infinite chainmail with no free loop. Projected into our space, torus nests inside torus, every fibre threading the rest. Colour follows latitude.';
          showReveal('Hopf fibration: linked circles woven into nested tori.');
        } else if (scene === 'lotus') {
          if (blurbEl) blurbEl.textContent = 'The lotus, flower of awakening, grown from rose curves. Each petal layer is a rhodonea, radius equal to the cosine of a multiple of the angle, folding one sweep into a ring of lobes. Broad and low outside, small and high inside, every tip lifted so the bloom opens into a cup around a glowing core. Pure trig, arranged like a flower.';
          showReveal('Lotus: rose-curve petals opening into a bloom.');
        } else if (scene === 'harmonics') {
          if (blurbEl) blurbEl.textContent = 'Spherical harmonics, the natural ways a sphere can vibrate, the same math behind electron orbitals, bell tones, and starquakes. Let the radius follow one mode and the sphere swells into lobes and petals, a bloom straight from a wave equation. Sea urchins, pollen and radiolaria wear the same shapes. Colour rides the radius: hot tips, cool throats.';
          showReveal('Spherical harmonics: a sphere\'s vibration modes, bloomed into lobes.');
        } else if (scene === 'clifford') {
          if (blurbEl) blurbEl.textContent = 'The Clifford attractor. Six constants, one trig rule, a million steps. Built only from sines and cosines, the path can never blow up, yet it braids into dense glowing lace. Slow tangles glow cold, fast bridges flare gold to red. Fly into the knot and watch the threads part around you.';
          showReveal('Clifford attractor: bounded trig chaos woven into dense 3D lace.');
        } else if (scene === 'logistic') {
          if (blurbEl) blurbEl.textContent = 'Chaos theory\'s most famous picture. One rule, x becomes r times x times (one minus x): crank r and a single stable point splits to two, then four, then eight, a cascade of doublings that shatters into chaos near 3.57. A million points draw the whole road, forks lifting forward, the chaotic half fanning into mist with thin windows of calm hidden inside. Fly the r-axis and watch certainty break apart.';
          showReveal('Logistic map: fly the road from order into chaos, fork by fork.');
        } else if (scene === 'recaman') {
          if (blurbEl) blurbEl.textContent = 'Recaman\'s sequence, one of the strangest walks in math. From 0, try to jump back by the step count; if you cannot (negative or already visited), jump forward instead. The result lurches and doubles back with no pattern. Here 4,000 terms, each arc tilted by the golden angle into 3D, bloom into a dense helix of linked loops. Cyan early, red late.';
          showReveal('Recaman\'s sequence: linked arcs twisted into a golden-angle helix.');
        } else if (scene === 'bfs') {
          if (blurbEl) blurbEl.textContent = 'Breadth-first search, the simplest searcher there is. It explores in perfect rings, every cell one step farther than the last, a frontier swelling out like sonar. Because it reaches cells in order of distance, it can never miss the shortest route. Watch it flood the grid, wrap the walls, then light the way home.';
          showReveal('Breadth-first search: an expanding shell that floods in order.');
        } else if (scene === 'bidir') {
          if (blurbEl) blurbEl.textContent = 'Bidirectional search lights a fire at both ends. Two shells grow toward each other in opposite colours, blind to one another until their frontiers kiss, then the route snaps shut in a single bright seam. Twice the flood, half the wait.';
          showReveal('Bidirectional search: two shells that collide in the middle.');
        } else if (scene === 'dijkstra') {
          if (blurbEl) blurbEl.textContent = 'Dijkstra\'s algorithm on a maze laced with random cost. Every cell carries a price, so the wavefront stops swelling in tidy rings and instead surges through cheap channels and stalls at the dear ones, a shimmering front that gnaws around expensive pockets. The true cheapest route, however twisted, still lights up at the end.';
          showReveal('Stochastic Dijkstra: a front that races the cheap and stalls at the costly.');
        } else if (scene === 'wavefront') {
          if (blurbEl) blurbEl.textContent = 'A multi-source flood. Several beacons ignite at once, their wavefronts growing together across the torus until they collide and fuse along glowing seams. Breadth-first search dreaming in chorus, and one of those fronts is bound to wash over the goal.';
          showReveal('Multi-source wavefront: many fronts ignite at once and fuse.');
        } else if (scene === 'randomflood') {
          if (blurbEl) blurbEl.textContent = 'A flood with a wandering will. Each cell holds a sliver of noise, and the search always grows from its lowest-noise edge, so the front advances not in rings but in slow organic lobes, bulging and pinching along the grain. No goal, no promise, just a luminous tide creeping over the donut until it laps the end.';
          showReveal('Noisy flood: a frontier bulging in organic lobes along a frozen grain.');
        } else if (scene === 'dfs') {
          if (blurbEl) blurbEl.textContent = 'Depth-first search. It commits to one direction and plunges as deep as it can before backing up, sending a single glowing tendril snaking through the grid, recoiling from dead ends and stabbing off again. It reaches the end, but by a wildly wandering route, almost never the short one. A firefly lost in the maze.';
          showReveal('Depth-first search: a lone tendril plunging deep, wandering home.');
        } else if (scene === 'randomwalk') {
          if (blurbEl) blurbEl.textContent = 'A random walk, no strategy at all. Every step stumbles to a random neighbour, no memory, no aim, drifting and looping like a drunk mote of light. Yet on a finite grid, pure chance still carries it home in the end. The slowest searcher here, and a quiet echo of the opening scene: even aimless randomness arrives.';
          showReveal('Random walk: a drunk drift that chance still carries home.');
        } else if (scene === 'rxndiff') {
          if (blurbEl) blurbEl.textContent = 'Reaction-diffusion, the equation that paints animals. Two chemicals bleed across a skin: one feeds, one consumes, and because the feeder crawls while the eater races, a flat field cannot stay flat. Spots erupt, swell, split like dividing cells and heal into stripes and labyrinths, the very pattern a leopard, a pufferfish and a seashell each solve in the womb. Nothing is drawn here; the coat computes itself.';
          showReveal('Reaction-diffusion: a living coat that computes its own spots.');
        } else if (scene === 'boids') {
          if (blurbEl) blurbEl.textContent = 'A starling murmuration, computed live. No flock is choreographed: each of ten thousand birds obeys three plain instincts, do not crowd your neighbours, steer the way they steer, drift toward their centre, with a wandering hawk to fold the sky. From those three urges the whole cloud breathes, splits, and pours like one living thing. Speed paints it: calm glides run cool, hard banking turns flare gold and red. A mind no single bird possesses.';
          showReveal('Boids: three instincts, one murmuration.');
        } else if (isMotionField(scene)) {
          var MO_LABELS = {
            'mo-fox': 'a fox', 'mo-horse': 'a galloping horse', 'mo-flamingo': 'a flamingo',
            'mo-parrot': 'a parrot', 'mo-stork': 'a stork', 'mo-cesiumman': 'a walking human',
            'mo-riggedfigure': 'a human figure', 'mo-foxwalk': 'a fox walking'
          };
          var MO_REVEAL = {
            'mo-fox': 'Fox run: 6,000 points tracing a real rig.', 'mo-horse': 'Horse gallop: rippling muscle as a cloud of points.',
            'mo-flamingo': 'Flamingo: flapping wings dissolving into speed.', 'mo-parrot': 'Parrot: compact wingbeats in living light.',
            'mo-stork': 'Stork: long wingbeats, all motion and grace.', 'mo-cesiumman': 'Human walk: the weight shift in every step.',
            'mo-riggedfigure': 'Human figure: posture and pivot as pure geometry.', 'mo-foxwalk': 'Fox walk: soft pacing, every joint alive.'
          };
          var lbl = MO_LABELS[scene] || 'a creature';
          if (blurbEl) blurbEl.textContent = 'A real animation of ' + lbl + ', rebuilt as 6,000 points you watch loop. The motion is the original rig; only the skin is gone. Speed paints it: slow parts stay cool, fast-moving limbs flare gold and red as they swing. What you see is the pure shape of motion, stripped of everything but the movement itself.';
          showReveal(MO_REVEAL[scene] || 'Creature motion as a glowing point cloud.');
        } else {
          if (blurbEl) blurbEl.textContent = ALGOS[0].blurb;
          showReveal('Real randomness is clumpy: clusters, voids, structure.');
        }
      }
      bumpBlurb();
    }
    if (wrapperEl) {
      var csels = wrapperEl.querySelectorAll('.gx-cat-select');
      for (var sw = 0; sw < csels.length; sw++) {
        csels[sw].addEventListener('change', function () {
          var scene = this.value;
          if (!scene) return;                 // the category-name placeholder
          selectScene(scene);
          try { canvas.focus(); } catch (e) {}
          track('galaxy_scene', { scene: scene });
        });
      }
    }

    var reseedBtn = document.getElementById('galaxy-reseed');
    if (reseedBtn) reseedBtn.addEventListener('click', function () {
      currentSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
      regenerate();
      bumpBlurb();
    });

    if (speedRange) {
      speedRange.addEventListener('input', function () {
        flightSpeed = parseFloat(this.value);
        if (flightSpeed > 1e-4) lastCruiseSpeed = flightSpeed;   // remember it to resume after a search scene
        if (speedVal) {
          var pct = Math.round(flightSpeed / parseFloat(this.max) * 100);
          speedVal.textContent = pct === 0 ? 'STOP' : pct + '%';
        }
        updatePrediction();
      });
    }

    if (radiusGroup) {
      var radiusTimer = null;
      radiusGroup.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.tz-btn') : null;
        if (!btn) return;
        TOUCH_RADIUS = parseFloat(btn.getAttribute('data-radius'));
        var bs = radiusGroup.querySelectorAll('.tz-btn');
        for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('active', bs[i] === btn);
        sampleHistInto(TOUCH_RADIUS);   // fast estimate -> live odds, in real time
        updatePrediction();
        if (radiusTimer) clearTimeout(radiusTimer);
        radiusTimer = setTimeout(recomputeClusters, 110);   // full per-star recolor, debounced
        track('galaxy_clumps', { r: TOUCH_RADIUS });
      });
    }

    if (instToggleEl && instPanelEl) {
      instToggleEl.addEventListener('click', function () {
        setInstruments(!instPanelEl.classList.contains('open'));
      });
    }

    document.addEventListener('fullscreenchange', function () {
      if (isFullscreen()) { try { canvas.focus(); } catch (e) {} }
      else if (wrapperEl) wrapperEl.classList.remove('gx-dim');   // leaving fullscreen clears the immersive dim
      updateHint();
      sizeCanvas();
    });

    window.addEventListener('resize', sizeCanvas);
  }

  async function init() {
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { fail('No suitable GPU adapter found.'); return; }
    device = await adapter.requestDevice();
    device.lost.then(function (info) {
      running = false;
      fail('GPU device lost: ' + (info && info.message ? info.message : 'unknown'));
    });

    context = canvas.getContext('webgpu');
    format = navigator.gpu.getPreferredCanvasFormat();
    sizeCanvas();
    context.configure({ device: device, format: format, alphaMode: 'opaque' });

    var module = device.createShaderModule({ code: SHADER });
    var postModule = device.createShaderModule({ code: POST_SHADER });

    var pointBuffers = [{
      arrayStride: 16,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32' }
      ]
    }];
    var additiveTarget = {
      format: 'rgba16float',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
      }
    };

    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: module, entryPoint: 'vs', buffers: pointBuffers },
      fragment: { module: module, entryPoint: 'fs', targets: [additiveTarget] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: MSAA }
    });
    gasPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: module, entryPoint: 'vsGas', buffers: pointBuffers },
      fragment: { module: module, entryPoint: 'fsGas', targets: [additiveTarget] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: MSAA }
    });

    function postPipeline(entry, fmt) {
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: postModule, entryPoint: 'fsv' },
        fragment: { module: postModule, entryPoint: entry, targets: [{ format: fmt }] },
        primitive: { topology: 'triangle-list' }
      });
    }
    brightPipeline    = postPipeline('bright', 'rgba16float');
    blurPipeline      = postPipeline('blur', 'rgba16float');
    compositePipeline = postPipeline('composite', format);
    copyPipeline      = postPipeline('copy', 'rgba16float');

    // Skybox: matches the scene pass (MSAA, rgba16float, no blend so it writes the
    // nebula opaquely as the backdrop the additive points draw over).
    var skyModule = device.createShaderModule({ code: SKY_SHADER });
    skyboxPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: skyModule, entryPoint: 'skv' },
      fragment: { module: skyModule, entryPoint: 'skf', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: MSAA }
    });
    skySampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'clamp-to-edge'   // true equirect panorama: longitude wraps seamlessly
    });
    skyUniformBuffer = device.createBuffer({ size: skyData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    loadSkyTexture();

    var rmModule = device.createShaderModule({ code: RAYMARCH_SHADER });
    raymarchPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: rmModule, entryPoint: 'rv' },
      fragment: { module: rmModule, entryPoint: 'rf', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' }
    });

    sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
    });

    uniformBuffer = device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    instanceBuffer = device.createBuffer({
      size: positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    tileOffsBuffer = device.createBuffer({
      size: tileOffsetData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(tileOffsBuffer, 0, tileOffsetData);   // static, uploaded once
    dirHBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dirVBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: tileOffsBuffer } }
      ]
    });
    gasBindGroup = device.createBindGroup({
      layout: gasPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    rmUniformBuffer = device.createBuffer({
      size: rmData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    rmBindGroup = device.createBindGroup({
      layout: raymarchPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: rmUniformBuffer } }]
    });

    postReady = true;
    createTargets();

    regenerate();
    updateLabel();

    if (verEl) verEl.textContent = VERSION;
    // No status to hide here: the pre-roll is pure black (empty #galaxy-status), and the
    // intro block clears the element anyway as first light begins. fail() owns the error case.
    running = true;
    initInput();
    updateHint();

    // Render only when it is being seen: pause on a hidden tab or when the
    // demo is scrolled out of view, so the GPU is not running flat out for
    // nobody (this is what was heating the laptop).
    pageVisible = (document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', function () {
      pageVisible = (document.visibilityState === 'visible');
      startLoop();
    });
    if (window.IntersectionObserver && wrapperEl) {
      var io = new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        startLoop();
      }, { threshold: 0 });
      io.observe(wrapperEl);
    }

    startLoop();
  }

  init().catch(function (err) {
    fail('Failed to start WebGPU: ' + (err && err.message ? err.message : err));
    if (window.console) console.error(err);
  });
})();
