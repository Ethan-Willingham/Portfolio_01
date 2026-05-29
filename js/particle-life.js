/* ============================================================
   PARTICLE-LIFE.JS
   A WebGPU compute-shader Particle Life simulation.

   Each particle has a position, velocity, and a discrete COLOR.
   A KxK matrix encodes how each color attracts/repels each other.
   Forces are evaluated only within a small radius rMax, made
   tractable for hundreds of thousands of particles by a bucketed
   uniform grid built each frame in a compute shader.

   Pipeline per frame (all on GPU):
     1. clearGrid   - reset per-cell particle counters
     2. buildGrid   - each particle inserts itself into its cell
     3. updateForces- read 3x3 cells, sum forces, integrate
     4. render      - instanced quads with additive blending

   Buffers ping-pong between two particle buffers (A,B) to avoid
   read/write hazards in the force pass.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Analytics helper (safe no-op if gtag is missing) ---- */
  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }
  var hasInteractedSim = false;

  var container = document.getElementById('pl-container');
  if (!container) return;

  var canvas        = container.querySelector('.pl-canvas');
  var statusEl      = container.querySelector('.pl-status');
  var fpsEl         = container.querySelector('.pl-fps');
  var countEl       = container.querySelector('.pl-particle-count');
  var matrixGridEl  = container.querySelector('.pl-matrix-grid');
  var resetBtn      = container.querySelector('.pl-reset');
  var randomizeBtn  = container.querySelector('.pl-randomize');
  var recolorBtns   = container.querySelectorAll('.pl-recolor');
  var presetBtns    = container.querySelectorAll('[data-preset]');
  var loopToggleEl  = container.querySelector('.pl-toggle-loop');
  var symToggleEl   = container.querySelector('.pl-toggle-sym');
  var fieldToggleEl  = container.querySelector('.pl-toggle-field');
  var layerToggleEl  = container.querySelector('.pl-toggle-layers');
  var autoToggleEl   = container.querySelector('.pl-toggle-auto');
  var fieldPrevBtn   = container.querySelector('.pl-field-prev');
  var fieldNextBtn   = container.querySelector('.pl-field-next');

  /* ---------- WebGPU support check ---------- */
  if (!navigator.gpu) {
    canvas.style.display = 'none';
    statusEl.textContent = 'WebGPU not available in this browser. Try a recent Chrome, Edge, or a Chromium-based browser on macOS, Windows, or Linux. Safari and Firefox are still rolling out support.';
    statusEl.classList.add('pl-status-error');
    return;
  }

  /* ---------- Slider helpers ---------- */
  var sliders = {};
  var defaults = {};
  var inputs = container.querySelectorAll('input[type="range"]');
  for (var i = 0; i < inputs.length; i++) {
    var s = inputs[i];
    sliders[s.dataset.param] = s;
    defaults[s.dataset.param] = s.defaultValue;
    (function (sl) {
      var valEl = container.querySelector('[data-value="' + sl.dataset.param + '"]');
      if (valEl) {
        valEl.textContent = formatVal(sl.dataset.param, sl.value);
        sl.addEventListener('input', function () {
          valEl.textContent = formatVal(sl.dataset.param, sl.value);
          onSliderChange(sl.dataset.param);
        });
      }
    })(s);
  }
  function formatVal(name, v) {
    if (name === 'count') {
      var n = parseInt(v, 10);
      return n >= 1000 ? (n / 1000).toFixed(0) + 'k' : String(n);
    }
    if (name === 'friction') return parseFloat(v).toFixed(2);
    if (name === 'force')    return parseFloat(v).toFixed(2);
    if (name === 'beta')     return parseFloat(v).toFixed(2);
    if (name === 'repel')    return parseFloat(v).toFixed(1);
    if (name === 'fieldstr')  return parseFloat(v).toFixed(1);
    if (name === 'fieldmorph') return parseFloat(v).toFixed(1) + '×';
    return v;
  }
  function param(name, fallback) {
    if (sliders[name]) return parseFloat(sliders[name].value);
    return fallback;
  }

  /* ---------- Tiered particle cap ----------
     Three tiers, conservative by default:

       mobile    (default on phones / small screens):  8,000
       desktop   (default everywhere else):           40,000
       unlocked  (after the user clicks "Unlock"):
                   from mobile  -> 40,000
                   from desktop -> 100,000

     The Count slider's max is set to the tier's cap. Randomize and presets
     also clamp to it (via getCountCap() below). The user can opt into the
     next tier with a small button in the header — the choice persists in
     localStorage so they don't have to re-unlock on every page load.

     Why so cautious by default: this post is meant to read on any phone,
     including older Android hardware that absolutely can't drive a force-
     pass on 30k particles at 60fps. Better to start safely and let
     enthusiasts opt up than to chug on first paint and lose the visitor. */
  var TIER_STORE_KEY = 'pl-cap-tier-v1';
  var CAP_MOBILE_BASE   = 8000;
  var CAP_DESKTOP_BASE  = 40000;
  var CAP_MOBILE_UNLOCK = 40000;
  var CAP_DESKTOP_UNLOCK = 100000;
  // Headroom note: the counting-sort grid removed the per-cell neighbor cap
  // (dense clumps no longer drop neighbors) and cut the force-pass memory
  // cost, and the glow now renders at half res, so there is real room to lift
  // CAP_DESKTOP_UNLOCK above 100k. Left at 100k deliberately: it is the
  // article's headline number, and the right ceiling is a per-GPU call best
  // made by reading the ?perf "compute" + "glow" lines at the candidate count
  // (raise it once a playtest confirms the target still holds ~60fps). The
  // unlock pill text tracks this value automatically.

  function detectBaseTier() {
    var coarsePointer = false;
    try { coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }
    catch (e) { /* old browser, treat as not coarse */ }
    var smallViewport = (window.innerWidth || 0) <= 820;
    return (coarsePointer || smallViewport) ? 'mobile' : 'desktop';
  }

  var BASE_TIER = detectBaseTier();          // never changes for the session
  var IS_UNLOCKED = false;                    // mutable; user can flip via button
  try {
    if (localStorage.getItem(TIER_STORE_KEY) === 'unlocked') IS_UNLOCKED = true;
  } catch (e) { /* private mode etc. — treat as not unlocked */ }

  // Returns the active count cap for this session given tier + unlock state.
  function getCountCap() {
    if (BASE_TIER === 'mobile') {
      return IS_UNLOCKED ? CAP_MOBILE_UNLOCK : CAP_MOBILE_BASE;
    }
    return IS_UNLOCKED ? CAP_DESKTOP_UNLOCK : CAP_DESKTOP_BASE;
  }

  // Apply the current cap to the slider's max + value, and refresh the
  // value label. Called once at startup and whenever the user unlocks.
  function applyCountCapToSlider() {
    if (!sliders.count) return;
    var cap = getCountCap();
    sliders.count.max = String(cap);
    if (parseInt(sliders.count.value, 10) > cap) {
      sliders.count.value = String(cap);
    }
    var valEl = container.querySelector('[data-value="count"]');
    if (valEl) valEl.textContent = formatVal('count', sliders.count.value);
  }

  // Run once now so the slider reflects the tier before anything else
  // reads from it.
  applyCountCapToSlider();

  /* Unlock toggle wiring. The button is always visible and toggles
     between two states:
       locked   → "Got a beefy phone/GPU? Unlock up to Nk" (green pulse)
       unlocked → "Lock back to Nk" (dim, no pulse)
     Locking back is important — a user might unlock, watch the sim chug,
     and want to undo without refreshing or wiping localStorage. The
     active tier persists across reloads so the state survives navigation.
     Wired up here (not inside init()) so the button still appears even
     if WebGPU is unavailable on this browser; in that case we hide it
     since there'd be nothing to act on. */
  (function setupUnlockUI() {
    // Two unlock buttons exist as separate, STATIC nodes: one in the header (the
    // inline view) and a dedicated one in the fullscreen drawer (.pl-drawer-unlock).
    // Neither is ever moved. Earlier builds had ONE button that JS relocated into
    // the drawer on fullscreen, but moving a node into the position:fixed drawer
    // made iOS Safari stop repainting its label after the first change. CSS shows
    // exactly one of the two per layout; this wires both together.
    var btns = Array.prototype.slice.call(container.querySelectorAll('.pl-unlock'));
    var msgs = Array.prototype.slice.call(container.querySelectorAll('.pl-unlock-msg'));
    if (!btns.length) return;
    if (!navigator.gpu) return;

    function unlockedCap() {
      return BASE_TIER === 'mobile' ? CAP_MOBILE_UNLOCK : CAP_DESKTOP_UNLOCK;
    }
    function baseCap() {
      return BASE_TIER === 'mobile' ? CAP_MOBILE_BASE : CAP_DESKTOP_BASE;
    }

    // Each button carries a roomy + a terse label span (CSS swaps them by width).
    // Rebuild them as fresh nodes rather than editing textContent — freshly
    // inserted nodes paint reliably on iOS Safari where in-place edits did not.
    function setOneLabel(b, long, tiny) {
      var nl = document.createElement('span');
      nl.className = 'pl-unlock-long';
      nl.textContent = long;
      var nt = document.createElement('span');
      nt.className = 'pl-unlock-tiny';
      nt.textContent = tiny;
      while (b.firstChild) b.removeChild(b.firstChild);
      b.appendChild(nl);
      b.appendChild(nt);
    }

    // Refresh every button's label, title, and locked/unlocked variant from the
    // current IS_UNLOCKED. Called on first paint and after each toggle.
    function refreshButtons() {
      var long, tiny, title, active;
      if (IS_UNLOCKED) {
        long  = 'Back to ' + (baseCap() / 1000) + 'K particles';
        tiny  = 'Back to ' + (baseCap() / 1000) + 'K';
        title = 'Step the cap (Count, Randomize and presets) back down to ' +
                (baseCap() / 1000) + 'K particles, smoother on this device.';
        active = true;
      } else {
        long  = 'Unlock ' + (unlockedCap() / 1000) + 'K particles';
        tiny  = 'Unlock ' + (unlockedCap() / 1000) + 'K';
        title = 'Raise the cap (Count, Randomize and presets) to ' +
                (unlockedCap() / 1000) + 'K particles. Tap again to go back if it runs slow.';
        active = false;
      }
      btns.forEach(function (b) {
        b.hidden = false;
        setOneLabel(b, long, tiny);
        b.title = title;
        b.classList.toggle('pl-unlock-active', active);
      });
    }

    // Brief confirmation after a toggle, on whichever msg span(s) are present.
    // Fades out after a few seconds so it doesn't linger.
    var msgTimer = null;
    function flashUnlockMsg(text) {
      if (!msgs.length) return;
      msgs.forEach(function (m) {
        m.textContent = text;
        m.classList.add('pl-unlock-msg-visible');
      });
      if (msgTimer) clearTimeout(msgTimer);
      msgTimer = setTimeout(function () {
        msgs.forEach(function (m) { m.classList.remove('pl-unlock-msg-visible'); });
      }, 3000);
    }

    function onToggle() {
      IS_UNLOCKED = !IS_UNLOCKED;
      try {
        localStorage.setItem(TIER_STORE_KEY, IS_UNLOCKED ? 'unlocked' : 'locked');
      } catch (e) { /* private mode — fall back to in-memory only */ }
      track(IS_UNLOCKED ? 'cap_unlocked' : 'cap_relocked', { tier: BASE_TIER });

      // Lower (or raise) the slider's max + value to match the new cap.
      applyCountCapToSlider();

      // If we just LOCKED and the live sim is running with more particles than
      // the new cap allows, respawn at the cap so the chug stops immediately.
      // spawnParticles is only safe after the GPU pipeline exists — it does,
      // because these buttons stay hidden until WebGPU init succeeds.
      if (!IS_UNLOCKED && simN > getCountCap()) {
        spawnParticles(getCountCap());
      }

      refreshButtons();
      flashUnlockMsg(IS_UNLOCKED
        ? 'Now ' + (unlockedCap() / 1000) + 'K particles'
        : 'Back to ' + (baseCap() / 1000) + 'K particles');
    }

    refreshButtons();
    btns.forEach(function (b) { b.addEventListener('click', onToggle); });
  })();

  /* ---------- Color palette (chemistry & phenomena) ----------
     Stepped away from the standard rainbow this time. These are pulled
     from physical and chemical phenomena -- the colors of flame tests,
     oxidized metals, bioluminescence, gemstone fluorescence, plasma
     discharges, and old-pharmacy glass. Some are clean neons, some are
     deliberately muddy or unusual (rust, bone, arsenic green) so the
     swatch grid never reads as "default rainbow assistant aesthetic."
     They still hit hard against the dark background because the dirty
     ones sit next to the bright ones in any random matrix and the
     contrast does the work. Brightness range is wider than typical:
     tonemap will pull the brights down and the dim ones stay subtle.

     The last entry, "void," is a deliberate experiment with the
     additive-blending pipeline. Its RGB is barely above zero, so a
     single void particle is effectively invisible -- but the renderer
     SUMS particle contributions, so a dense cluster of voids forms a
     silky dark shape that reads visually as a hole or shadow against
     brighter species. Sparse void particles vanish into the background;
     dense ones sculpt negative space. */
  var PALETTE = [
    [1.00, 0.95, 0.30],   // chromium yellow   -- the lab-glass yellow
    [0.20, 0.85, 0.55],   // malachite         -- oxidized copper green
    [0.95, 0.30, 0.65],   // plasma pink       -- argon discharge tube
    [0.10, 0.55, 0.95],   // cobalt arc        -- electrical-blue plasma
    [0.65, 1.00, 0.10],   // arsenic lime      -- toxic, fluorescent
    [0.95, 0.45, 0.15],   // blood orange      -- iron-rich rust glow
    [0.85, 0.85, 0.95],   // mercury silver    -- liquid-metal high key
    [0.55, 0.20, 0.85],   // iodine violet     -- crystal sublimate purple
    [0.10, 0.95, 0.95],   // phosphor cyan     -- old CRT screen burn
    [0.75, 0.40, 0.20],   // raw umber         -- deliberately earthy
    [0.95, 0.85, 0.65],   // bone china        -- warm off-white
    [0.05, 0.40, 0.45],   // deep teal         -- abyssal, low-key
    [1.00, 0.20, 0.20],   // sulfur red        -- match-head bright
    [0.45, 0.30, 0.55],   // amethyst smoke    -- dusty cool contrast
    [0.04, 0.03, 0.06]    // void              -- near-zero, sums into shadows
  ];
  function paletteHex(idx) {
    var c = speciesColors[idx] || [0, 0, 0];
    var h = function (x) { var n = Math.round(Math.min(1, Math.max(0, x)) * 255); return ('0' + n.toString(16)).slice(-2); };
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }

  var K_MAX = 15;
  var K = 8;
  var matrix = new Float32Array(K_MAX * K_MAX);

  /* ---------- Live per-species colors ----------
     Each species' color is an [r,g,b] (0..1) held here, read by the
     matrix swatches (paletteHex) and the GPU (uploadPalette). Filled by
     the procedural palette engine below. Legacy saved slots / hardcoded
     presets that stored integer indices resolve through the curated
     PALETTE into here (see applyConfig). Default = the curated PALETTE
     order so the very first paint matches the old look until init()
     applies the Lava preset. */
  var speciesColors = new Array(K_MAX);
  for (var _spi = 0; _spi < K_MAX; _spi++) {
    speciesColors[_spi] = PALETTE[_spi % PALETTE.length].slice();
  }

  /* ============================================================
     PROCEDURAL PALETTE ENGINE  (OKLCH harmony, perceptual)

     Every color roll is a *designed* palette, not a random grab. We pick
     a harmony scheme (mono / analogous / complementary / split-comp /
     triadic / tetradic / square / golden-angle), lay K hues out on it in
     OKLCH — a perceptually-uniform space, so equal steps look equal and
     a fixed lightness/chroma reads consistently across hues — hold L and
     C in a band tuned to glow on the near-black additive canvas, then
     refine the set for mutual distinguishability (minimum Oklab distance,
     a floor that relaxes as K grows so 15 species still resolve).

     Harmony comes from the scheme + the shared L/C band; variety comes
     from randomizing the base hue, the scheme, the spread and per-color
     jitter on every roll. Distinguishability is the refine pass.

     Color math is Ottosson's Oklab (bottosson.github.io/posts/oklab).
     ============================================================ */
  function palRand(a, b) { return a + Math.random() * (b - a); }

  // linear-light channel -> gamma-encoded sRGB (0..1)
  function srgbGamma(x) {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  }
  // OKLCH (L 0..1, C chroma, h degrees) -> linear sRGB triple (may be out of gamut)
  function oklchToLinear(L, C, hDeg) {
    var h = hDeg * Math.PI / 180;
    var a = C * Math.cos(h);
    var b = C * Math.sin(h);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
       4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  function linInGamut(rgb) {
    var e = 0.0002;
    return rgb[0] >= -e && rgb[0] <= 1 + e &&
           rgb[1] >= -e && rgb[1] <= 1 + e &&
           rgb[2] >= -e && rgb[2] <= 1 + e;
  }
  // OKLCH -> gamma sRGB triple in [0,1], chroma reduced (binary search) until
  // the color is inside the sRGB gamut, so vivid colors desaturate cleanly
  // instead of per-channel clipping (which would shift hue).
  // Largest chroma at (L, hDeg) that stays inside the sRGB gamut.
  function gamutMapC(L, C, hDeg) {
    if (linInGamut(oklchToLinear(L, C, hDeg))) return C;
    var lo = 0, hi = C;
    for (var it = 0; it < 16; it++) {
      var mid = (lo + hi) * 0.5;
      if (linInGamut(oklchToLinear(L, mid, hDeg))) lo = mid; else hi = mid;
    }
    return lo;
  }
  function oklchToRgb(L, C, hDeg) {
    var lin = oklchToLinear(L, gamutMapC(L, C, hDeg), hDeg);
    return [
      Math.min(1, Math.max(0, srgbGamma(lin[0]))),
      Math.min(1, Math.max(0, srgbGamma(lin[1]))),
      Math.min(1, Math.max(0, srgbGamma(lin[2])))
    ];
  }
  // Lay out K hues (degrees) for a harmony scheme around base hue h0.
  function schemeHues(scheme, K, h0) {
    var hues = [], i, j;
    if (scheme === 'golden') {                       // max separation for many colors
      for (i = 0; i < K; i++) hues.push(h0 + i * 137.508);
      return hues;
    }
    if (scheme === 'mono') {
      for (i = 0; i < K; i++) hues.push(h0 + palRand(-7, 7));
      return hues;
    }
    if (scheme === 'analogous') {                    // one arc, widened as K grows
      var span = Math.min(135, 45 + K * 6);
      for (i = 0; i < K; i++) {
        var t = K > 1 ? (i / (K - 1) - 0.5) : 0;
        hues.push(h0 + t * span + palRand(-4, 4));
      }
      return hues;
    }
    // anchor-based schemes: spread K across the offsets, fan out within each
    var offs;
    if (scheme === 'complementary') offs = [0, 180];
    else if (scheme === 'split')    offs = [0, 150, 210];
    else if (scheme === 'triadic')  offs = [0, 120, 240];
    else if (scheme === 'tetradic') offs = [0, 60, 180, 240];
    else                            offs = [0, 90, 180, 270];   // square
    var A = offs.length, counts = [];
    for (i = 0; i < A; i++) counts.push(0);
    for (i = 0; i < K; i++) counts[i % A]++;
    for (i = 0; i < A; i++) {
      var cnt = counts[i];
      var step = cnt > 1 ? Math.min(22, 46 / cnt) : 0;
      for (j = 0; j < cnt; j++) {
        hues.push(h0 + offs[i] + (j - (cnt - 1) / 2) * step + palRand(-4, 4));
      }
    }
    return hues;
  }

  // Choose a scheme appropriate to the species count.
  function pickScheme(K) {
    var pool;
    if (K <= 2)       pool = ['complementary', 'analogous', 'mono', 'complementary'];
    else if (K === 3) pool = ['triadic', 'split', 'analogous', 'complementary'];
    else if (K === 4) pool = ['tetradic', 'square', 'analogous', 'triadic'];
    else if (K <= 7)  pool = ['analogous', 'triadic', 'split', 'tetradic', 'golden'];
    else              pool = ['golden', 'analogous', 'golden', 'triadic'];   // many: favor wide spreads
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* Tonal "moods" — each roll picks one, and it sets the lightness + chroma
     BAND the whole palette lives in. This is what gives rolls wildly
     different character (electric neons, soft pastels, deep jewels, dusky
     muted sets, dark-to-light high-contrast) instead of one vivid look every
     time — the variety the fixed old palette could never reach. l/c are the
     [min,max] band centers; lj/cj are per-color jitter; rh is the
     lightness-ramp half-width used by the gradient (analogous/mono) schemes.
     Tuned to stay legible on the near-black additive canvas (dense clusters
     glow, so even the dark tones read). */
  var TONES = [
    { name: 'vivid',    l: [0.62, 0.74], lj: 0.07, c: [0.15, 0.20],  cj: 0.03, rh: 0.14, w: 3 },
    { name: 'neon',     l: [0.70, 0.83], lj: 0.05, c: [0.20, 0.28],  cj: 0.02, rh: 0.12, w: 2 },
    { name: 'pastel',   l: [0.80, 0.92], lj: 0.05, c: [0.05, 0.10],  cj: 0.02, rh: 0.10, w: 2 },
    { name: 'jewel',    l: [0.45, 0.60], lj: 0.07, c: [0.13, 0.20],  cj: 0.03, rh: 0.13, w: 2 },
    { name: 'muted',    l: [0.56, 0.74], lj: 0.07, c: [0.045, 0.085], cj: 0.02, rh: 0.15, w: 1.5 },
    { name: 'contrast', l: [0.50, 0.66], lj: 0.20, c: [0.12, 0.20],  cj: 0.05, rh: 0.22, w: 1.5 }
  ];
  function pickTone(K) {
    var tot = 0, w = [], i;
    for (i = 0; i < TONES.length; i++) {
      var wi = TONES[i].w;
      // Low-contrast tones (muted/pastel) can't keep many colors apart;
      // fade them as K grows so high-species rolls stay readable. They
      // still dominate at the low counts where they look best.
      if (K >= 9 && (TONES[i].name === 'muted' || TONES[i].name === 'pastel')) wi *= 0.25;
      w.push(wi); tot += wi;
    }
    var r = Math.random() * tot;
    for (i = 0; i < TONES.length; i++) { r -= w[i]; if (r <= 0) return TONES[i]; }
    return TONES[0];
  }

  // Generate K beautiful, distinguishable [r,g,b] colors (0..1).
  function generatePalette(K) {
    K = Math.max(1, Math.min(K_MAX, K | 0));
    var scheme = pickScheme(K);
    var hues = schemeHues(scheme, K, palRand(0, 360));
    var gradient = (scheme === 'analogous' || scheme === 'mono');
    var tone = pickTone(K);
    var Lc = palRand(tone.l[0], tone.l[1]);   // tone sets the lightness band
    var Cc = palRand(tone.c[0], tone.c[1]);   // ...and the chroma band
    var accent = Math.floor(Math.random() * K);
    var cols = [], i;
    for (i = 0; i < K; i++) {
      var L, C;
      if (gradient && K > 1) {
        // analogous/mono: ride a lightness ramp (within the tone's band) so
        // a tight hue arc still reads as K distinct steps — a clean gradient.
        L = (Lc - tone.rh) + (i / (K - 1)) * 2 * tone.rh;
        C = Cc + palRand(-tone.cj, tone.cj);
      } else {
        L = Lc + palRand(-tone.lj, tone.lj);
        C = Cc + palRand(-tone.cj, tone.cj);
      }
      if (i === accent) C += 0.035;          // one punchy accent (60-30-10 feel)
      L = Math.min(0.93, Math.max(0.40, L));
      C = Math.min(0.30, Math.max(0.035, C));
      cols.push({ L: L, C: C, h: hues[i] });
    }
    // Refine for distinguishability (iwanthue-style force repulsion):
    // measure every pair in Oklab using the gamut-mapped (effective)
    // chroma — i.e. what actually renders — and nudge crowded pairs apart,
    // clamping back into the vivid L/C band. The floor relaxes as K grows
    // so 15 species still resolve. A well-spread low-K scheme converges
    // instantly (nothing is crowded); a too-tight high-K analogous arc
    // gets gently widened until the species read apart.
    var dmin = Math.max(0.10, 0.30 - 0.012 * K);
    for (var iter = 0; iter < 120; iter++) {
      var pos = [], fx = [], pp, qq;
      for (pp = 0; pp < K; pp++) {
        var eC = gamutMapC(cols[pp].L, cols[pp].C, cols[pp].h);
        var hr = cols[pp].h * Math.PI / 180;
        pos.push([cols[pp].L, eC * Math.cos(hr), eC * Math.sin(hr)]);
        fx.push([0, 0, 0]);
      }
      var moved = false;
      for (pp = 0; pp < K; pp++) {
        for (qq = pp + 1; qq < K; qq++) {
          var dL = pos[pp][0] - pos[qq][0];
          var da = pos[pp][1] - pos[qq][1];
          var db = pos[pp][2] - pos[qq][2];
          var d = Math.sqrt(dL * dL + da * da + db * db);
          if (d < dmin) {
            moved = true;
            var w = (dmin - d) / Math.max(d, 1e-4) * 0.5;
            fx[pp][0] += dL * w; fx[pp][1] += da * w; fx[pp][2] += db * w;
            fx[qq][0] -= dL * w; fx[qq][1] -= da * w; fx[qq][2] -= db * w;
          }
        }
      }
      if (!moved) break;
      for (pp = 0; pp < K; pp++) {
        var nL = Math.min(0.93, Math.max(0.40, pos[pp][0] + fx[pp][0]));
        var na = pos[pp][1] + fx[pp][1], nb = pos[pp][2] + fx[pp][2];
        var nC = Math.min(0.30, Math.max(0.035, Math.sqrt(na * na + nb * nb)));
        cols[pp].L = nL;
        cols[pp].C = nC;
        cols[pp].h = Math.atan2(nb, na) * 180 / Math.PI;
      }
    }
    var out = [];
    for (i = 0; i < K; i++) out.push(oklchToRgb(cols[i].L, cols[i].C, cols[i].h));
    return out;
  }

  /* Roll a fresh designed palette into speciesColors (used by the matrix
     swatches + the GPU). Replaces the old fixed-PALETTE shuffle: every
     species now gets a generated OKLCH color from a harmony scheme. The
     name is kept because randomizeMatrix / setK / randomizeAll call it. */
  function randomizeSpeciesPalette() {
    var cols = generatePalette(K);
    for (var i = 0; i < K_MAX; i++) speciesColors[i] = cols[i % cols.length].slice();
  }

  function randomizeMatrix() {
    for (var i = 0; i < K * K; i++) {
      matrix[i] = Math.random() * 2 - 1;
    }
    if (simSymmetric) symmetrizeMatrix();
    // Roll fresh colors alongside the matrix — same intent (a fresh
    // visual roll), and cheap. Guarded on paletteBuffer because this
    // can fire before WebGPU init in some paths.
    randomizeSpeciesPalette();
    if (paletteBuffer) uploadPalette();
    rebuildMatrixGrid();
    uploadMatrix();
  }

  /* Force matrix symmetry by averaging each (i,j) and (j,i) pair so the
     interaction between two species is mutual. Called whenever the
     "Symmetric" toggle is on after any matrix write. */
  function symmetrizeMatrix() {
    for (var i = 0; i < K; i++) {
      for (var j = i + 1; j < K; j++) {
        var avg = 0.5 * (matrix[i * K + j] + matrix[j * K + i]);
        matrix[i * K + j] = avg;
        matrix[j * K + i] = avg;
      }
    }
  }

  /* Re-stripe the colors buffer so every particle's species index is in
     [0, K). Called when K changes — particle positions/velocities stay
     intact, only their species reassigns. */
  function reassignColors() {
    if (!colorsBuffer || !simN) return;
    var colors = new Uint32Array(simN);
    for (var i = 0; i < simN; i++) colors[i] = i % K;
    device.queue.writeBuffer(colorsBuffer, 0, colors);
  }

  /* Change the number of species K in [1, K_MAX]. Re-randomizes the
     matrix to fit the new size, restripes particle colors, rebuilds
     the matrix UI, and re-uploads. The shader reads only the first
     K rows/cols of the matrix buffer, so we don't have to reallocate. */
  function setK(newK) {
    newK = Math.max(1, Math.min(K_MAX, newK | 0));
    if (newK === K) return;
    K = newK;
    // Wipe and re-randomize the matrix in the new layout. (Old entries
    // were addressed by the old K, so they'd land in the wrong slots.)
    for (var i = 0; i < K * K; i++) {
      matrix[i] = Math.random() * 2 - 1;
    }
    if (simSymmetric) symmetrizeMatrix();
    reassignColors();
    // Fresh colors on every species-count change — the visible swatch
    // count is changing anyway, no reason to keep the old prefix.
    randomizeSpeciesPalette();
    if (paletteBuffer) uploadPalette();
    rebuildMatrixGrid();
    uploadMatrix();
  }

  /* Full randomize: matrix + physics sliders + species count. Each slider
     gets a uniform value in its declared min/max range, snapped to its
     step. Count is biased toward the lower half AND hard-capped at
     getCountCap() so randomization stays smooth at whatever tier the
     user is in. Species count is picked from {2, 4, 8, 12} so the result
     feels visually distinct each time. */
  function randomizeAll() {
    var physics = {};
    var keys = ['count', 'rmax', 'force', 'friction', 'beta', 'repel'];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var s = sliders[key];
      if (!s) continue;
      var lo   = parseFloat(s.min);
      var hi   = parseFloat(s.max);
      var step = parseFloat(s.step) || 1;
      // Cap the *effective* upper bound for count to the active tier cap
      // before sampling, then bias low on top of that. Two layers of
      // protection so we never roll a 200k surprise on a phone.
      if (key === 'count') {
        hi = Math.min(hi, getCountCap());
        if (hi < lo) hi = lo;
      }
      var t = Math.random();
      if (key === 'count') {
        // Bias count low so most rolls are well under the cap, not just
        // at it.
        t = t * t;
      }
      var raw = lo + t * (hi - lo);
      var snapped = Math.round((raw - lo) / step) * step + lo;
      // Clamp + fix floating-point fuzz.
      snapped = Math.max(lo, Math.min(hi, snapped));
      physics[key] = snapped;
    }
    applyPhysics(physics);
    // Roll a new species count from a curated list — these counts give
    // visually distinct looks more reliably than arbitrary numbers
    // (2 = duets, 4 = quadrants, 8 = the default richness, 12 = busy).
    // The slider can still be set to anything in [1, 15] manually.
    var SPECIES_CHOICES = [2, 4, 8, 12];
    var newK = SPECIES_CHOICES[Math.floor(Math.random() * SPECIES_CHOICES.length)];
    var prevK = K;
    if (sliders.species) {
      sliders.species.value = newK;
      var sval = container.querySelector('[data-value="species"]');
      if (sval) sval.textContent = String(newK);
    }
    setK(newK);
    if (newK === prevK) {
      // setK no-ops when K is unchanged, so randomize the matrix here.
      for (var i = 0; i < K * K; i++) {
        matrix[i] = Math.random() * 2 - 1;
      }
      if (simSymmetric) symmetrizeMatrix();
      // setK was a no-op, so it didn't reshuffle the palette either —
      // do it here so "Randomize all" always lands on a fresh color set
      // even when the species count happens to repeat.
      randomizeSpeciesPalette();
      if (paletteBuffer) uploadPalette();
      rebuildMatrixGrid();
      uploadMatrix();
    }
  }

  /* Three hand-saved presets, each one a complete simulation
     snapshot (matrix + physics + flags + palette). The numbers come
     from share strings -- see snapshotConfig() for the structure.
     They are loaded through the same applyConfig() path the slot
     system uses.

     The `palette` array on each preset is the species -> palette-index
     mapping that locks the colors. Without it, applyConfig() would fall
     through to a fresh randomization on every preset click, and Lava
     would land different colors every time. The indices here are
     hand-picked from the PALETTE table to match each preset's mood. */
  var PRESETS = {
    lava: {
      k: 2,
      matrix: [
        0.8297898173332214, 0.2864423096179962,
        -0.4763852059841156, 0.8313683867454529
      ],
      // Original tuning was 58k. Stays here so unlocked desktop sees the
      // full density; applyPreset() clamps down to the tier cap at apply
      // time. 58k looks gloriously dense on a discrete GPU.
      physics: { count: 58000, rmax: 36, force: 2.2, friction: 1.45, beta: 0.55, repel: 10.4 },
      // Symmetric=true to match the new default. The asymmetric off-diagonal
      // pair (0.29 / -0.48) averages to a mild mutual repulsion; lava still
      // reads as molten clusters separating along their boundary.
      looping: true, symmetric: true,
      // chromium yellow + blood orange -- classic warm-spectrum lava
      palette: [0, 5]
    },

    cells: {
      k: 2,
      matrix: [
        0.8395563960075378, 0.5612764358520508,
        -0.2763305902481079, 0.5049974918365479
      ],
      physics: { count: 30000, rmax: 69, force: 0.2, friction: 1.45, beta: 0.74, repel: 1.9 },
      looping: true, symmetric: false,
      // malachite + iodine violet -- biological membrane vs nucleus contrast
      palette: [1, 7]
    },

    sodapop: {
      k: 2,
      matrix: [
        -0.6380895376205444, -0.8358436226844788,
        -0.8358436226844788, 0.8606353402137756
      ],
      // Original tuning was 182k. Stays at 182k in the table so unlocked
      // desktop users see the full effect; applyPreset() clamps down to
      // the tier cap (8k mobile / 40k desktop / 40k mobile-unlocked) at
      // apply time.
      physics: { count: 182000, rmax: 33, force: 0.35, friction: 1.75, beta: 0.47, repel: 5.2 },
      looping: true, symmetric: true,
      // plasma pink + phosphor cyan -- retro fizzy soda
      palette: [2, 8]
    }
  };
  /* Push a {count, rmax, force, friction, beta} object into the actual
     sliders, value labels, and live sim state. Called by presets that
     ship physics overrides, and by the global Randomize. */
  function applyPhysics(p) {
    if (!p) return;
    var keys = ['count', 'rmax', 'force', 'friction', 'beta', 'repel'];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (p[key] === undefined || !sliders[key]) continue;
      sliders[key].value = p[key];
      // Read the actual slider value back: the browser silently clamps to
      // [min, max], so the label and the spawn count must reflect that
      // (matters on devices where we cap 'count' lower than a preset asked).
      var valEl = container.querySelector('[data-value="' + key + '"]');
      if (valEl) valEl.textContent = formatVal(key, sliders[key].value);
    }
    simRMax     = parseFloat(sliders.rmax.value);
    simForce    = parseFloat(sliders.force.value);
    simFriction = parseFloat(sliders.friction.value);
    simBeta     = parseFloat(sliders.beta.value);
    if (sliders.repel) simRepel = parseFloat(sliders.repel.value);
    if (p.rmax !== undefined) {
      recomputeGridDims();
      createGridBuffers();
      rebuildBindGroups();
    }
    if (p.count !== undefined) {
      spawnParticles(parseInt(sliders.count.value, 10));
    }
  }

  function applyPreset(name) {
    var preset = PRESETS[name];
    if (!preset) return;
    // Clone so we don't mutate the canonical preset table when we cap.
    // Pass through `palette` so applyConfig restores the locked color
    // mapping instead of randomizing -- without this the same preset
    // looks different every time the user clicks it.
    var cfg = {
      k: preset.k,
      matrix: preset.matrix,
      physics: preset.physics ? Object.assign({}, preset.physics) : null,
      looping: preset.looping,
      symmetric: preset.symmetric,
      palette: preset.palette ? preset.palette.slice() : null
    };
    // Apply the active tier cap to preset particle counts. The preset
    // table is left intact in case it's referenced elsewhere (share
    // strings, etc.) — only the *applied* count is reduced. On mobile
    // base tier (8k cap), even Lava and Cells get clamped down; after
    // unlocking, the original tunings come back.
    var cap = getCountCap();
    if (cfg.physics && typeof cfg.physics.count === 'number'
        && cfg.physics.count > cap) {
      cfg.physics.count = cap;
    }
    // The new presets use the same snapshot shape as the slot system
    // (k, matrix, physics, looping, symmetric). Route through applyConfig
    // so K, the matrix, the physics sliders, and both flags update together.
    applyConfig(cfg);
  }

  /* ============================================================
     SLOT SYSTEM — save up to 5 user-discovered configurations.
     Persists via localStorage. Each slot stores K, the full matrix,
     and the five physics knobs.
     ============================================================ */
  var SLOT_COUNT     = 5;
  var SLOT_STORE_KEY = 'pl-slots-v1';
  var slots = new Array(SLOT_COUNT).fill(null); // null = empty

  function snapshotConfig() {
    var m = new Array(K * K);
    for (var i = 0; i < K * K; i++) m[i] = matrix[i];
    // Snapshot the live per-species colors as [r,g,b] triples so saved
    // slots + share strings reproduce exactly what the user saw. (Older
    // saves stored integer PALETTE indices; applyConfig accepts both.)
    var pal = new Array(K);
    for (var pi = 0; pi < K; pi++) {
      var sc = speciesColors[pi] || [0, 0, 0];
      pal[pi] = [Math.round(sc[0] * 1000) / 1000, Math.round(sc[1] * 1000) / 1000, Math.round(sc[2] * 1000) / 1000];
    }
    return {
      k: K,
      matrix: m,
      palette: pal,
      physics: {
        count:    parseInt(sliders.count.value, 10),
        rmax:     parseFloat(sliders.rmax.value),
        force:    parseFloat(sliders.force.value),
        friction: parseFloat(sliders.friction.value),
        beta:     parseFloat(sliders.beta.value),
        repel:    sliders.repel ? parseFloat(sliders.repel.value) : 4.0
      },
      looping:   simLooping,
      symmetric: simSymmetric,
      // Rogue field: store the user-facing settings (not the transient morph
      // state -- which pattern is mid-crossfade -- which is re-rolled on load).
      field: {
        enabled:  fieldEnabled,
        layers:   fieldLayersOn,
        auto:     fieldAutoMorph,
        strength: sliders.fieldstr ? parseFloat(sliders.fieldstr.value) : FIELD_STRENGTH_DEFAULT,
        morph:    sliders.fieldmorph ? parseFloat(sliders.fieldmorph.value) : 1.0
      }
    };
  }

  function applyConfig(cfg) {
    if (!cfg || !cfg.matrix) return false;
    // Adopt the saved species count if it's valid.
    if (typeof cfg.k === 'number' && cfg.k >= 1 && cfg.k <= K_MAX) {
      if (cfg.k !== K) {
        K = cfg.k | 0;
        if (sliders.species) {
          sliders.species.value = K;
          var sval = container.querySelector('[data-value="species"]');
          if (sval) sval.textContent = String(K);
        }
        reassignColors();
      }
    }
    // Restore the palette. New saves/shares store [r,g,b] triples; the
    // hardcoded presets + pre-engine legacy slots store integer indices
    // into the curated PALETTE. Resolve either form into speciesColors,
    // cycling to fill all K_MAX (entries past K are unused). Absent ->
    // roll a fresh designed palette.
    if (Array.isArray(cfg.palette) && cfg.palette.length) {
      var palCfg = cfg.palette;
      for (var ci = 0; ci < K_MAX; ci++) {
        var src = palCfg[ci % palCfg.length];
        if (Array.isArray(src)) {
          speciesColors[ci] = [
            Math.min(1, Math.max(0, +src[0] || 0)),
            Math.min(1, Math.max(0, +src[1] || 0)),
            Math.min(1, Math.max(0, +src[2] || 0))
          ];
        } else {
          var idx = src | 0;
          if (idx < 0 || idx >= PALETTE.length) idx = 0;
          speciesColors[ci] = PALETTE[idx].slice();
        }
      }
    } else {
      randomizeSpeciesPalette();
    }
    if (paletteBuffer) uploadPalette();
    if (cfg.physics) applyPhysics(cfg.physics);
    if (typeof cfg.looping === 'boolean') {
      simLooping = cfg.looping;
      if (loopToggleEl) loopToggleEl.checked = simLooping;
    }
    if (typeof cfg.symmetric === 'boolean') {
      simSymmetric = cfg.symmetric;
      if (symToggleEl) symToggleEl.checked = simSymmetric;
    }
    for (var i = 0; i < K * K && i < cfg.matrix.length; i++) {
      var v = cfg.matrix[i];
      if (typeof v !== 'number' || !isFinite(v)) v = 0;
      matrix[i] = Math.max(-1, Math.min(1, v));
    }
    // If the loaded config (or the current default) wants symmetry, enforce
    // it on the just-written matrix. Without this, presets/slots that store
    // an asymmetric matrix alongside symmetric=true would render with the
    // toggle on but visibly asymmetric cells in the matrix grid.
    if (simSymmetric) symmetrizeMatrix();
    rebuildMatrixGrid();
    uploadMatrix();
    // Restore the rogue field ONLY if this config carries it. Presets, boot,
    // and "Randomize all" pass no `field` block, so they leave the user's
    // current field settings alone; saved slots + share strings carry it and
    // round-trip exactly. Old (pre-field) shares simply lack the key.
    if (cfg.field && typeof cfg.field === 'object') applyFieldConfig(cfg.field);
    return true;
  }

  function loadSlotsFromStorage() {
    try {
      var raw = localStorage.getItem(SLOT_STORE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (var i = 0; i < SLOT_COUNT; i++) {
        slots[i] = parsed[i] && parsed[i].matrix ? parsed[i] : null;
      }
    } catch (e) { /* corrupt or unavailable — ignore */ }
  }

  function persistSlots() {
    try {
      localStorage.setItem(SLOT_STORE_KEY, JSON.stringify(slots));
    } catch (e) { /* private mode / quota — nothing we can do */ }
  }

  function saveToSlot(i) {
    if (i < 0 || i >= SLOT_COUNT) return;
    slots[i] = snapshotConfig();
    persistSlots();
    refreshSlotUI();
  }

  function loadFromSlot(i) {
    if (i < 0 || i >= SLOT_COUNT) return;
    if (!slots[i]) return;
    applyConfig(slots[i]);
  }

  function clearSlot(i) {
    if (i < 0 || i >= SLOT_COUNT) return;
    slots[i] = null;
    persistSlots();
    refreshSlotUI();
  }

  /* ---------- Export / import as a compact share string ----------
     Format: "PL1:" + base64(JSON). The PL1 prefix lets us version the
     format without ambiguity if it ever changes.                   */
  var SHARE_PREFIX = 'PL1:';

  function b64encode(s) {
    // btoa needs Latin-1; encode UTF-8 first to be safe.
    return btoa(unescape(encodeURIComponent(s)));
  }
  function b64decode(s) {
    return decodeURIComponent(escape(atob(s)));
  }

  function exportConfig() {
    var cfg = snapshotConfig();
    return SHARE_PREFIX + b64encode(JSON.stringify(cfg));
  }

  function importConfig(str) {
    if (typeof str !== 'string') return false;
    str = str.trim();
    if (str.indexOf(SHARE_PREFIX) === 0) str = str.slice(SHARE_PREFIX.length);
    try {
      var json = b64decode(str);
      var cfg = JSON.parse(json);
      return applyConfig(cfg);
    } catch (e) {
      return false;
    }
  }

  /* ---------- Slot UI wiring (built in HTML) ---------- */
  var slotsContainer = container.querySelector('.pl-slots');
  var slotSaveBtn    = container.querySelector('.pl-slot-save');
  var slotExportBtn  = container.querySelector('.pl-slot-export');
  var slotImportBtn  = container.querySelector('.pl-slot-import');
  var slotShareEl    = container.querySelector('.pl-slot-share');
  var slotMsgEl      = container.querySelector('.pl-slot-msg');

  function flashMsg(text, isError) {
    if (!slotMsgEl) return;
    slotMsgEl.textContent = text;
    slotMsgEl.style.color = isError ? '#d76b6b' : '';
    clearTimeout(flashMsg._t);
    flashMsg._t = setTimeout(function () {
      if (slotMsgEl.textContent === text) slotMsgEl.textContent = '';
    }, 2400);
  }

  function refreshSlotUI() {
    if (!slotsContainer) return;
    var btns = slotsContainer.querySelectorAll('.pl-slot');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var filled = !!slots[i];
      b.classList.toggle('pl-slot-filled', filled);
      b.classList.toggle('pl-slot-empty', !filled);
      b.title = filled
        ? 'Load slot ' + (i+1) + '  (long-press or right-click to clear)'
        : 'Empty — click "Save current" to fill';
    }
  }

  function nextEmptySlot() {
    for (var i = 0; i < SLOT_COUNT; i++) if (!slots[i]) return i;
    return -1;
  }

  function bindSlotUI() {
    if (slotsContainer) {
      var btns = slotsContainer.querySelectorAll('.pl-slot');
      // Long-press window. ~550ms is comfortable on mobile (longer than
      // browser scroll-detection thresholds, shorter than impatience).
      var LONG_PRESS_MS = 550;
      // Movement tolerance before we consider the gesture a swipe and
      // cancel the long-press timer. ~10 device px is forgiving for
      // jittery fingers without letting actual scroll attempts trigger.
      var LONG_PRESS_MOVE_TOL = 10;
      for (var i = 0; i < btns.length; i++) {
        (function (b, idx) {
          // Click = the simple case: tap empty -> save, tap filled -> load.
          // The long-press handler can suppress this when it fires.
          b.addEventListener('click', function () {
            if (b._suppressClick) {
              b._suppressClick = false;
              return;
            }
            if (slots[idx]) {
              loadFromSlot(idx);
              flashMsg('Loaded slot ' + (idx+1));
            } else {
              saveToSlot(idx);
              flashMsg('Saved to slot ' + (idx+1));
            }
          });
          // Right-click: desktop muscle memory. Still works.
          b.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            if (slots[idx]) {
              clearSlot(idx);
              flashMsg('Cleared slot ' + (idx+1));
            }
          });
          // Long-press: the touch-friendly equivalent. Hold a filled
          // slot ~half a second to clear it. Works on desktop too
          // (mousedown). We use pointer events so one path covers both
          // mouse and touch.
          var pressTimer = null;
          var startX = 0, startY = 0;
          function cancelPress() {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            b.classList.remove('pl-slot-pressing');
          }
          b.addEventListener('pointerdown', function (e) {
            // Empty slots have nothing to clear — don't show the "pressing"
            // animation, but allow the click to still save.
            if (!slots[idx]) return;
            startX = e.clientX;
            startY = e.clientY;
            b.classList.add('pl-slot-pressing');
            pressTimer = setTimeout(function () {
              pressTimer = null;
              b.classList.remove('pl-slot-pressing');
              // Suppress the click that follows the touch release so we
              // don't immediately re-save a freshly cleared slot.
              b._suppressClick = true;
              if (slots[idx]) {
                clearSlot(idx);
                flashMsg('Cleared slot ' + (idx+1));
              }
            }, LONG_PRESS_MS);
          });
          b.addEventListener('pointermove', function (e) {
            if (!pressTimer) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            if (dx*dx + dy*dy > LONG_PRESS_MOVE_TOL * LONG_PRESS_MOVE_TOL) {
              cancelPress();
            }
          });
          b.addEventListener('pointerup',     cancelPress);
          b.addEventListener('pointerleave',  cancelPress);
          b.addEventListener('pointercancel', cancelPress);
        })(btns[i], i);
      }
    }
    if (slotSaveBtn) {
      slotSaveBtn.addEventListener('click', function () {
        var idx = nextEmptySlot();
        if (idx === -1) {
          flashMsg('All 5 slots full — long-press one to clear', true);
          return;
        }
        saveToSlot(idx);
        flashMsg('Saved to slot ' + (idx+1));
      });
    }
    if (slotExportBtn) {
      slotExportBtn.addEventListener('click', function () {
        var s = exportConfig();
        if (slotShareEl) {
          slotShareEl.value = s;
          slotShareEl.focus();
          slotShareEl.select();
        }
        // Best-effort copy to clipboard.
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(s);
            flashMsg('Copied share string to clipboard');
          } else {
            document.execCommand && document.execCommand('copy');
            flashMsg('Share string ready — copy from box');
          }
        } catch (e) {
          flashMsg('Share string ready — copy from box');
        }
      });
    }
    if (slotImportBtn) {
      slotImportBtn.addEventListener('click', function () {
        var s = slotShareEl ? slotShareEl.value : '';
        if (!s) { flashMsg('Paste a share string into the box first', true); return; }
        var ok = importConfig(s);
        flashMsg(ok ? 'Imported' : 'Could not parse that string', !ok);
      });
    }
    refreshSlotUI();
  }

  loadSlotsFromStorage();

  /* Visual matrix editor: KxK colored cells. Click to cycle force. */
  function rebuildMatrixGrid() {
    if (!matrixGridEl) return;
    matrixGridEl.innerHTML = '';
    matrixGridEl.style.gridTemplateColumns = 'auto repeat(' + K + ', 1fr)';
    matrixGridEl.style.gridTemplateRows    = 'auto repeat(' + K + ', 1fr)';

    // Scale cell size so the grid fits the left column even at K=15.
    // K<=8: 26px (matches the original size). K>8: shrink linearly so
    // the grid stays roughly the same overall width; clamp at K>=14 so
    // the bottom of the linear ramp doesn't dip below readable.
    var cellPx;
    if (K <= 8)       cellPx = 26;
    else if (K >= 14) cellPx = 16;
    else              cellPx = Math.round(26 - (K - 8) * (26 - 16) / (14 - 8));
    matrixGridEl.style.setProperty('--pl-cell-size', cellPx + 'px');
    // Header swatches stay a touch smaller than the cells.
    matrixGridEl.style.setProperty('--pl-head-size', Math.max(12, cellPx - 8) + 'px');

    // Top-left corner (empty)
    var corner = document.createElement('div');
    corner.className = 'pl-matrix-corner';
    matrixGridEl.appendChild(corner);

    // Column headers (colored swatches)
    for (var c = 0; c < K; c++) {
      var th = document.createElement('div');
      th.className = 'pl-matrix-head';
      th.style.background = paletteHex(c);
      matrixGridEl.appendChild(th);
    }

    // Rows
    for (var r = 0; r < K; r++) {
      var rh = document.createElement('div');
      rh.className = 'pl-matrix-head';
      rh.style.background = paletteHex(r);
      matrixGridEl.appendChild(rh);

      for (var cc = 0; cc < K; cc++) {
        (function (rr, c2) {
          var cell = document.createElement('div');
          cell.className = 'pl-matrix-cell';
          var v = matrix[rr * K + c2];
          paintCell(cell, v);
          cell.title = 'row ' + rr + ' acts on col ' + c2 + ': ' + v.toFixed(2);
          cell.addEventListener('click', function (e) {
            // Shift-click to randomize this single cell, otherwise cycle.
            if (e.shiftKey) {
              matrix[rr * K + c2] = Math.random() * 2 - 1;
            } else {
              // Cycle through 5 levels.
              var levels = [-0.8, -0.4, 0.0, 0.4, 0.8];
              var cur = matrix[rr * K + c2];
              var idx = 0, best = Infinity;
              for (var k = 0; k < levels.length; k++) {
                var d = Math.abs(cur - levels[k]);
                if (d < best) { best = d; idx = k; }
              }
              matrix[rr * K + c2] = levels[(idx + 1) % levels.length];
            }
            // Mirror the change if symmetric mode is on, then rebuild the
            // grid so the transposed cell visibly updates too.
            if (simSymmetric && rr !== c2) {
              matrix[c2 * K + rr] = matrix[rr * K + c2];
              rebuildMatrixGrid();
            } else {
              paintCell(cell, matrix[rr * K + c2]);
              cell.title = 'row ' + rr + ' acts on col ' + c2 + ': ' + matrix[rr * K + c2].toFixed(2);
            }
            uploadMatrix();
          });
          matrixGridEl.appendChild(cell);
        })(r, cc);
      }
    }
  }

  function paintCell(cell, v) {
    // -1 -> deep red, 0 -> dark grey, +1 -> green
    var t = (v + 1) * 0.5;
    var r, g, b;
    if (v < 0) {
      var s = -v;
      r = 0.45 + 0.50 * s; g = 0.10 + 0.05 * s; b = 0.18 + 0.10 * s;
    } else {
      var s2 = v;
      r = 0.10 + 0.10 * s2; g = 0.30 + 0.55 * s2; b = 0.18 + 0.15 * s2;
    }
    cell.style.background = 'rgb(' + (r*255|0) + ',' + (g*255|0) + ',' + (b*255|0) + ')';
    cell.style.opacity = 0.30 + Math.abs(v) * 0.70;
  }

  /* ---------- WebGPU initialization ---------- */
  var device, context, presentationFormat;
  var paramsBuffer, matrixBuffer, colorsBuffer, paletteBuffer;
  var particlesA, particlesB;
  var cellCountBuffer, cellStartBuffer, sortedBuffer;
  var clearPipeline, countPipeline, scanPipeline, scatterPipeline, updatePipeline, renderPipeline;
  var glowPipeline, compositePipeline;
  var computeBGL, renderBGL, compositeBGL;
  var computeBG_AB, computeBG_BA;
  var renderBG_A, renderBG_B;
  var quadVertexBuffer;
  // One-shot pass that rescales every particle's position when the world
  // (canvas) size changes, e.g. entering fullscreen. Without it the swarm
  // stays in its old corner and the freshly-expanded area renders blank.
  var rescaleBGL, rescalePipeline, rescaleParamsBuffer, rescaleBG_A, rescaleBG_B;

  // HDR offscreen target and its composite resources.
  var hdrTexture, hdrView;
  var hdrSampler;
  var compositeBG;       // recreated whenever hdrTexture is recreated
  var hdrFormat = 'rgba16float';
  var hdrSizeW = 0, hdrSizeH = 0;

  // Half-resolution glow (bloom) target. The 6x-radius glow quads are pure
  // fill-rate, so rendering them at half the linear resolution (a quarter of
  // the fragments) is the biggest render-side win at high N / fullscreen. The
  // glow is soft by nature, so the linear upsample in the composite pass is
  // visually near-lossless (the halo just softens a hair). The sharp particle
  // cores stay full-res in hdrTexture.
  var GLOW_DOWNSAMPLE = 2;
  var glowTexture, glowView, glowSampler;

  /* ---- GPU timing instrumentation (opt-in via ?perf) ----
     timestamp-query reads real per-pass GPU time. Gated behind the URL param
     so normal visitors never pay the (tiny) query + readback cost, and behind
     adapter support so it silently no-ops where the feature is unavailable.
     Surfaces three figures in a corner overlay: the whole compute block
     (grid + force pass), the HDR particle draw, and the composite. This is the
     measure-first foundation for the optimization work — the RAF loop can't be
     driven headlessly, so this is how the framerate cost gets read on real
     hardware. */
  var perfEnabled = /[?&]perf\b/.test(location.search || '');
  var tsSupported = false;
  var tsQuerySet = null, tsResolveBuf = null, tsReadBuf = null;
  var tsPending = false, tsFrameCount = 0;
  var perfOverlayEl = null;

  // Simulation parameters (mutable at runtime). Initial particle count
  // honors the active tier cap so the first spawn doesn't waste cycles
  // building a 30k buffer on a phone that's about to overwrite it with
  // an 8k preset.
  var simN = Math.min(30000, getCountCap());
  var simWorld = { w: 0, h: 0 };
  var simRMax = 32;
  var simCellsX = 0, simCellsY = 0;
  var simMaxPerCell = 256;   // recomputed per grid in recomputeGridDims()
  // Workgroup size for the per-particle compute passes (count / scatter /
  // update). Single source of truth: injected into those shaders AND used as
  // the dispatch divisor, so the two can never drift out of sync. The passes
  // are correctness-neutral to this value, so it is purely a perf knob. 64 is
  // the safe baseline; to A/B, set 128 or 256, reload with ?perf, and watch
  // the "compute" line in the overlay (the best value is GPU-dependent, so
  // revert to 64 if a larger size regresses).
  var COMPUTE_WG = 64;
  var simBeta = 0.30;
  var simForce = 1.0;
  var simFriction = 0.55;
  var simRepel = 4.0;
  var simLooping = true;     // toroidal world; false = bouncing walls
  var simSymmetric = true;   // enforce matrix[i][j] == matrix[j][i]
  /* ---------- Pointer state ----------
     Beyond a single pull-to-cursor force, this models the cursor as a
     low-frequency disturbance in a fluid: smoothed position, smoothed
     velocity, a press envelope (ramp in / ramp out so the field never
     snaps on or off), and a "mode" that switches the force field
     between a swirling drag (default) and an outward shockwave (shift).
       x,y       — raw pixel position from the latest pointer event
       sx,sy     — exponentially smoothed position (low-pass filtered);
                   the WGSL force field uses THESE, never the raw values,
                   so any pointer jitter at the OS level can't kick the
                   simulation. The smoothing also lets the particle
                   field "lag" behind the cursor a touch, which reads as
                   the medium having mass.
       vx,vy    — smoothed velocity, derived from sx,sy frame deltas.
                   Drives the advection (drag) component: particles
                   move in the direction the cursor is moving, not
                   merely toward it.
       envelope — 0..1 press amplitude. Ramps up on press, decays on
                  release with a long tail. Multiplies the entire force,
                  so quick taps ripple gently and held drags ramp in.
       mode     — 0 = swirl/drag, 1 = shockwave repel.
       radius   — pixel radius of the pointer field. */
  var simPointer = {
    x: 0,  y: 0,
    sx: 0, sy: 0,
    vx: 0, vy: 0,
    envelope: 0,
    mode: 0,
    radius: 380,
    down: false,
    hasPos: false   // becomes true on first pointer event so we don't
                    // initialize sx/sy at (0,0) and lurch on first frame
  };

  /* ====== ROGUE FIELD — morphing geometric flow conductor ======
     An invisible vector field is added to every particle's force in
     WGSL_UPDATE. Here we run the "playlist": a shuffle-bag tour through the
     pattern set, crossfading one pattern into the next like an old-school
     music visualizer. The tour is a fixed shuffled ORDER plus a CURSOR, so
     the user can step forward AND backward through it (Prev / Next) and can
     freeze it entirely (Auto-morph off). Four live pattern ids drive the two
     density layers; the GPU does the per-particle density blend:
        loose particles:  fieldA (from) -> fieldB (to)
        dense clusters:   fieldC (from) -> fieldD (to)   [when layers on]
     At rest the loose layer shows order[idx] and the dense layer order[idx+1]
     (one step ahead, so two different shapes always coexist). A transition to
     idx+dir lerps both layers by fieldAlpha; on completion idx += dir. Going
     backward just sets dir = -1, which is why we keep a persistent order
     instead of a consumable bag.

     Defaults come from flow-field visualizer research (Milkdrop/AVS preset
     blending; Reynolds flow-following): the external field is a CONDUCTOR,
     well under the swarm's own forces, with long soft crossfades and no hard
     cuts -- a ~14s hold and ~6s smootherstep transition. */
  var FIELD_PATTERNS = [
    'Vortex', 'Vortex grid', 'Quasicrystal 5', 'Quasicrystal 7',
    'Rose mandala', 'Golden spiral', 'Lissajous', 'Wave moire',
    'Flower of life', 'Ring pulse'
  ];
  var FIELD_STRENGTH_DEFAULT = 2.0;  // mirrors the slider default in the HTML
  var FIELD_SCALE = 2.2;             // spatial frequency (pattern cells / view)
  var FIELD_DENSE_BOOST = 3.2;       // dense particles feel this x the field
                                     // force when Density layers is on, so the
                                     // tight clusters forcefully trace their
                                     // pattern while loose dust drifts (the
                                     // "intensity" of the layer split)
  var FIELD_HOLD = 14.0;             // seconds a pattern holds before morphing
  var FIELD_TRANS = 6.0;             // seconds to crossfade in the ambient auto-tour
                                     // (Prev/Next are instant hard cuts -- see fieldStep)
  var FIELD_JITTER = 4.0;            // +/- seconds of randomness on each hold
  var FIELD_PHASE_RATE = 0.5;        // how fast each pattern animates (rad/s)
  var FIELD_TWO_PI_K = 6.283185307 * 1024.0;  // phase wrap to keep f32 precise

  var fieldEnabled = true;           // master on/off (default on: it's the feature)
  var fieldLayersOn = false;         // split loose vs dense onto two patterns (off by default)
  var fieldAutoMorph = true;         // auto-cycle; false = hold until Prev/Next
  var fieldPhase = 0.0;              // animation clock, uploaded each frame
  var fieldAlphaEased = 0.0;         // smootherstep(crossfade), uploaded to GPU
  var fieldA = 0, fieldB = 1, fieldC = 1, fieldD = 2; // loose from/to, dense from/to
  var fieldOrder = [];               // fixed shuffled permutation of pattern ids
  var fieldIdx = 0;                  // cursor: loose-layer "from" position in order
  var fieldDir = 0;                  // active transition direction: +1 / -1 / 0 hold
  var fieldState = 'hold';           // 'hold' | 'trans'
  var fieldTimer = 0.0;              // seconds elapsed in the current state
  var fieldHoldLen = FIELD_HOLD;     // this hold's length (re-rolled w/ jitter)
  var fieldRawAlpha = 0.0;           // un-eased crossfade progress 0..1
  var fieldNameEl = null;            // readout span (looked up at wire time)

  // Index into the shuffled order, wrapping both ways.
  function fieldOrderAt(i) {
    var n = fieldOrder.length;
    return fieldOrder[((i % n) + n) % n];
  }

  // Recompute the four live pattern ids from the cursor + active direction.
  // Holding (dir 0): the "to" ids equal the "from" ids, so any residual alpha
  // is a no-op. Transitioning: each layer lerps toward its dir-shifted neighbor.
  function fieldComputeIds() {
    var target = fieldIdx + fieldDir;
    fieldA = fieldOrderAt(fieldIdx);       // loose from
    fieldB = fieldOrderAt(target);         // loose to
    fieldC = fieldOrderAt(fieldIdx + 1);   // dense from (one step ahead)
    fieldD = fieldOrderAt(target + 1);     // dense to
  }

  // Fisher-Yates shuffle of [0 .. N-1]. Fixed for the session (re-rolled only
  // on Reset / load) so Prev and Next are exact inverses.
  function fieldShuffleOrder() {
    fieldOrder = FIELD_PATTERNS.map(function (_, i) { return i; });
    for (var i = fieldOrder.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = fieldOrder[i]; fieldOrder[i] = fieldOrder[j]; fieldOrder[j] = t;
    }
  }

  function fieldInitPlaylist() {
    fieldShuffleOrder();
    fieldIdx = 0;
    fieldDir = 0;
    fieldState = 'hold';
    fieldTimer = 0.0;
    fieldRawAlpha = 0.0;
    fieldAlphaEased = 0.0;
    fieldHoldLen = FIELD_HOLD + (Math.random() * 2 - 1) * FIELD_JITTER;
    fieldComputeIds();
    fieldUpdateReadout();
  }

  // Land on the cursor's destination: advance idx by the active direction,
  // stop transitioning, and re-arm the hold.
  function fieldCommit() {
    var n = fieldOrder.length;
    fieldIdx = (((fieldIdx + fieldDir) % n) + n) % n;
    fieldDir = 0;
    fieldState = 'hold';
    fieldTimer = 0.0;
    fieldRawAlpha = 0.0;
    fieldAlphaEased = 0.0;
    fieldHoldLen = FIELD_HOLD + (Math.random() * 2 - 1) * FIELD_JITTER;
    fieldComputeIds();
    fieldUpdateReadout();
  }

  // Begin a crossfade in the given direction (+1 next, -1 prev). If one is
  // already running, snap it home first so repeated presses feel responsive.
  // Smooth crossfade -- used ONLY by the ambient auto-tour.
  function fieldStartTransition(dir) {
    if (fieldState === 'trans') fieldCommit();
    fieldDir = dir;
    fieldState = 'trans';
    fieldTimer = 0.0;
    fieldRawAlpha = 0.0;
    fieldAlphaEased = 0.0;
    fieldComputeIds();
    fieldUpdateReadout();
  }

  // Prev / Next: INSTANT hard cut. Jump the cursor and show the new pattern
  // immediately (no crossfade), so a click registers at once. The field force
  // switches in one frame; the particles still ease into the new flow on their
  // own thanks to their inertia, so it reads as snappy, not jarring.
  function fieldStep(dir) {
    if (fieldState === 'trans') fieldCommit();   // settle any in-flight auto crossfade
    var n = fieldOrder.length;
    fieldIdx = (((fieldIdx + dir) % n) + n) % n;
    fieldDir = 0;
    fieldState = 'hold';
    fieldTimer = 0.0;                              // restart the auto-hold countdown
    fieldRawAlpha = 0.0;
    fieldAlphaEased = 0.0;
    fieldComputeIds();
    fieldUpdateReadout();
  }
  function fieldNext() { fieldStep(1); }
  function fieldPrev() { fieldStep(-1); }

  // smootherstep (quintic): zero velocity AND acceleration at both ends, so
  // the morph eases in and out imperceptibly. Stronger than cubic smoothstep.
  function smootherstep(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // The "Morph" slider is a speed multiplier; higher = shorter hold + trans.
  function fieldMorphRate() { return param('fieldmorph', 1.0); }

  function advanceField(dt) {
    // Advance the pattern's internal animation clock ONLY while the field is
    // actively touring or mid-crossfade. With Auto-morph off and parked, freeze
    // it so the pattern truly holds still instead of slowly rotating/drifting
    // (that drift was the "it still changes when auto-morph is off" report).
    if (fieldEnabled && (fieldAutoMorph || fieldState === 'trans')) {
      fieldPhase += dt * FIELD_PHASE_RATE;
      if (fieldPhase > FIELD_TWO_PI_K) { fieldPhase -= FIELD_TWO_PI_K; }
    }
    if (!fieldEnabled) return;
    var rate = fieldMorphRate();
    if (fieldState === 'hold') {
      fieldAlphaEased = 0.0;
      // Only auto-advance when Auto-morph is on. Off = park on this pattern
      // until the user steps with Prev / Next.
      if (fieldAutoMorph) {
        fieldTimer += dt * rate;
        if (fieldTimer >= fieldHoldLen) fieldStartTransition(1);
      }
    } else { // 'trans' -- the ambient auto-tour crossfade; runs to completion.
      fieldTimer += dt * rate;
      fieldRawAlpha = FIELD_TRANS > 0 ? (fieldTimer / FIELD_TRANS) : 1.0;
      if (fieldRawAlpha >= 1.0) {
        fieldAlphaEased = 1.0;
        fieldCommit();              // lands on idx+dir, re-arms the hold
      } else {
        fieldAlphaEased = smootherstep(fieldRawAlpha);
      }
    }
    fieldUpdateReadout();
  }

  // Human-readable "what am I looking at" string: the loose channel's
  // dominant pattern, plus (when layers are on) the dense channel's.
  function fieldUpdateReadout() {
    if (!fieldNameEl) return;
    if (!fieldEnabled) { fieldNameEl.textContent = 'off'; return; }
    var looseId = (fieldAlphaEased < 0.5) ? fieldA : fieldB;
    var txt = FIELD_PATTERNS[looseId] || '?';
    if (fieldLayersOn) {
      var denseId = (fieldAlphaEased < 0.5) ? fieldC : fieldD;
      if (denseId !== looseId) txt += '  /  ' + (FIELD_PATTERNS[denseId] || '?');
    }
    fieldNameEl.textContent = txt;
  }

  // Restore the field from a saved/imported config block (see snapshotConfig).
  // Updates the live state, the toggle checkboxes, and the two sliders, then
  // re-rolls a fresh playlist so the tour starts clean with the loaded knobs.
  function applyFieldConfig(f) {
    if (typeof f.enabled === 'boolean') {
      fieldEnabled = f.enabled;
      if (fieldToggleEl) fieldToggleEl.checked = fieldEnabled;
    }
    if (typeof f.layers === 'boolean') {
      fieldLayersOn = f.layers;
      if (layerToggleEl) layerToggleEl.checked = fieldLayersOn;
    }
    if (typeof f.auto === 'boolean') {
      fieldAutoMorph = f.auto;
      if (autoToggleEl) autoToggleEl.checked = fieldAutoMorph;
    }
    setFieldSlider('fieldstr', f.strength);
    setFieldSlider('fieldmorph', f.morph);
    fieldInitPlaylist();
  }

  // Set a field slider's value (clamped to its own min/max) and refresh the
  // value label, so loaded saves move the actual UI, not just the sim state.
  function setFieldSlider(name, val) {
    if (typeof val !== 'number' || !isFinite(val)) return;
    var sl = sliders[name];
    if (!sl) return;
    var lo = parseFloat(sl.min), hi = parseFloat(sl.max);
    if (isFinite(lo)) val = Math.max(lo, val);
    if (isFinite(hi)) val = Math.min(hi, val);
    sl.value = String(val);
    var valEl = container.querySelector('[data-value="' + name + '"]');
    if (valEl) valEl.textContent = formatVal(name, sl.value);
  }

  fieldInitPlaylist();

  var pingFlip = false; // false => A is input, B is output

  init().catch(function (err) {
    console.error(err);
    statusEl.textContent = 'WebGPU init failed: ' + err.message;
    statusEl.classList.add('pl-status-error');
    canvas.style.display = 'none';
  });

  async function init() {
    var adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No adapter');

    // Request a device with as much storage as we can get.
    var requiredLimits = {};
    if (adapter.limits.maxStorageBufferBindingSize) {
      requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
    }
    if (adapter.limits.maxBufferSize) {
      requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
    }
    // Only request timestamp-query when the reader opted into ?perf AND the
    // adapter offers it — keeps the default path identical to before.
    var requiredFeatures = [];
    if (perfEnabled && adapter.features && adapter.features.has('timestamp-query')) {
      requiredFeatures.push('timestamp-query');
    }
    device = await adapter.requestDevice({
      requiredLimits: requiredLimits,
      requiredFeatures: requiredFeatures
    });
    tsSupported = requiredFeatures.indexOf('timestamp-query') >= 0 &&
                  device.features && device.features.has('timestamp-query');

    context = canvas.getContext('webgpu');
    presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: device,
      format: presentationFormat,
      alphaMode: 'premultiplied'
    });

    resizeCanvas();

    createBuffers();
    createPipelines();
    ensureHDRTarget();
    spawnParticles(simN);
    rebuildMatrixGrid();
    // Open on the Lava setup (dense molten clusters) so the first frame is
    // striking, then roll a fresh generated palette over it with the color
    // engine instead of Lava's fixed warm pair.
    applyPreset('lava');
    randomizeSpeciesPalette();
    if (paletteBuffer) uploadPalette();
    rebuildMatrixGrid();

    statusEl.style.display = 'none';
    setupPointer();
    window.addEventListener('resize', onResize);
    // Watch the canvas's own box, not just the window. Entering native
    // fullscreen animates the canvas to full size over a few frames and may
    // fire only an early `resize`, so the double-rAF in applyFsState can read
    // a not-yet-settled size and leave the swarm in a small corner. The
    // observer fires onResize the moment the box actually changes (including
    // when the fullscreen animation lands), so the rescale stretches the
    // particles to the final size. It does NOT fire on drawer open/close (that
    // is an absolute overlay and never changes the canvas box).
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { onResize(); });
      try { ro.observe(canvas); } catch (e) { /* old engine: window resize covers it */ }
    }

    if (tsSupported) setupPerf();

    track('simulation_loaded');
    requestAnimationFrame(frame);
  }

  /* ---------- Canvas sizing ----------
     Backing store = CSS size x DPR, capped to MAX_CANVAS_PIXELS. The cap
     only bites in fullscreen (a Retina laptop at DPR 2 fills millions of
     pixels); it keeps the per-frame glow-pass fragment cost in check at
     100k particles. The inline canvas is far below the cap, so it stays
     native-crisp. pointerScaleX/Y carry the exact CSS->backing ratio so
     pointer mapping stays correct under any cap. */
  var MAX_CANVAS_PIXELS = 4.5e6;
  var pointerScaleX = 1, pointerScaleY = 1;
  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, rect.width  * dpr);
    var h = Math.max(2, rect.height * dpr);
    var px = w * h;
    if (px > MAX_CANVAS_PIXELS) {
      var s = Math.sqrt(MAX_CANVAS_PIXELS / px);
      w *= s; h *= s;
    }
    canvas.width  = Math.max(2, Math.round(w));
    canvas.height = Math.max(2, Math.round(h));
    simWorld.w = canvas.width;
    simWorld.h = canvas.height;
    pointerScaleX = canvas.width  / Math.max(1, rect.width);
    pointerScaleY = canvas.height / Math.max(1, rect.height);
    recomputeGridDims();
  }

  function recomputeGridDims() {
    // Cell sizing: the largest grid count whose cells are still at least
    // rMax wide. Using floor() (not ceil) means cellsX * cellSize == worldW
    // exactly, which removes the phantom strip on the right and bottom
    // edges that the old ceil() arrangement created — that strip used to
    // cause inconsistent neighbor sets right where particles wrapped
    // across the seam, producing the visible bands at those edges.
    //
    // Edge case: if worldW < 2*rMax (very small canvas, or rMax dialed up
    // to most of the canvas size), floor would give cellsX=1; we clamp to
    // 2. The shader gets the per-axis cell size from worldW/cellsX, which
    // in that rare case is < rMax — neighbor finding's 3x3 walk could
    // miss particles slightly more than cellSize away. Acceptable for
    // such degenerate canvas sizes (it still finds most neighbors).
    simCellsX = Math.max(2, Math.floor(simWorld.w / simRMax));
    simCellsY = Math.max(2, Math.floor(simWorld.h / simRMax));
    // The counting-sort grid stores particles in a compact, exactly-N sorted
    // array addressed by per-cell prefix-sum offsets, so there is no per-cell
    // capacity to size and NO dropped neighbors in dense clumps (the old
    // fixed-stride bucket had a maxPerCell cap that clipped them, causing the
    // square-edge force artifacts). simMaxPerCell is kept at 0: its param slot
    // still ships (the struct layout is shared with the render/glow shaders)
    // but nothing reads it now.
    simMaxPerCell = 0;
  }

  function onResize() {
    // World space IS canvas-pixel space, and particle positions live in it,
    // so when the canvas grows (e.g. into fullscreen) the swarm would stay in
    // its old corner and leave the new area blank. Capture the old size, then
    // stretch every particle into the new world so the fill is immediate.
    var oldW = simWorld.w, oldH = simWorld.h;
    resizeCanvas();
    rescalePositions(oldW, oldH);
    // Recreate cell buffer to match new dims.
    createGridBuffers();
    rebuildBindGroups();
    // Recreate HDR offscreen target to match the new canvas size.
    ensureHDRTarget();
  }

  // GPU one-shot: multiply every particle position by newWorld / oldWorld so
  // the existing arrangement stretches to fill the resized world instead of
  // clustering in the old corner. Both ping-pong buffers are scaled.
  function rescalePositions(oldW, oldH) {
    if (!rescalePipeline || !device) return;
    if (!(oldW > 1) || !(oldH > 1)) return;        // no valid prior size
    var sx = simWorld.w / oldW, sy = simWorld.h / oldH;
    if (Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return;  // trivial change
    var buf = new ArrayBuffer(16);
    new Float32Array(buf, 0, 2)[0] = sx;
    new Float32Array(buf, 0, 2)[1] = sy;
    new Uint32Array(buf, 8, 1)[0] = simN;
    device.queue.writeBuffer(rescaleParamsBuffer, 0, buf);
    var groups = Math.ceil(simN / 64);
    var enc = device.createCommandEncoder();
    var cp = enc.beginComputePass();
    cp.setPipeline(rescalePipeline);
    cp.setBindGroup(0, rescaleBG_A); cp.dispatchWorkgroups(groups);
    cp.setBindGroup(0, rescaleBG_B); cp.dispatchWorkgroups(groups);
    cp.end();
    device.queue.submit([enc.finish()]);
  }

  /* ---------- Buffer creation ---------- */
  function createBuffers() {
    // Params: see WGSL Params struct. The compute struct grew to 36 fields
    // (144 bytes) when the rogue field was added; the render/glow shaders
    // keep their shorter struct and just read the first fields off the same
    // (larger) buffer, which WebGPU allows. 144 is 16-byte aligned.
    paramsBuffer = device.createBuffer({
      size: 144,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Rescale params (scale.xy, n, pad) for the resize position-rescale pass.
    rescaleParamsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Matrix: max KxK floats.
    matrixBuffer = device.createBuffer({
      size: K_MAX * K_MAX * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Palette: K_MAX vec4f (rgb + intensity).
    paletteBuffer = device.createBuffer({
      size: K_MAX * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    uploadPalette();

    // Particle buffers ping-pong (4 floats each: pos.xy, vel.xy).
    var maxParticles = 1000000;
    particlesA = device.createBuffer({
      size: maxParticles * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
    });
    particlesB = device.createBuffer({
      size: maxParticles * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
    });

    // Sorted scratch for the counting-sort grid: one vec4 per particle
    // (pos.xy, color, originalIndex), rebuilt each frame in cell order so the
    // force pass reads contiguous neighbor runs instead of gathering by index.
    sortedBuffer = device.createBuffer({
      size: maxParticles * 16,
      usage: GPUBufferUsage.STORAGE
    });

    // Colors: one u32 per particle.
    colorsBuffer = device.createBuffer({
      size: maxParticles * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    createGridBuffers();

    // A unit quad (two triangles).
    var quadData = new Float32Array([
      -1, -1,   1, -1,  -1,  1,
       1, -1,   1,  1,  -1,  1
    ]);
    quadVertexBuffer = device.createBuffer({
      size: quadData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(quadVertexBuffer, 0, quadData);
  }

  function createGridBuffers() {
    var numCells = simCellsX * simCellsY;
    if (cellCountBuffer) cellCountBuffer.destroy();
    if (cellStartBuffer) cellStartBuffer.destroy();
    // Per-cell particle counts (also reused as the scatter write cursor).
    cellCountBuffer = device.createBuffer({
      size: Math.max(1, numCells) * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    // Exclusive prefix sum of the counts: cellStart[c]..cellStart[c+1] is
    // cell c's contiguous run in the sorted array. Needs numCells+1 entries
    // (the last holds the running total = N).
    cellStartBuffer = device.createBuffer({
      size: Math.max(2, numCells + 1) * 4,
      usage: GPUBufferUsage.STORAGE
    });
  }

  /* ---------- HDR offscreen target ---------- */
  function ensureHDRTarget() {
    var w = canvas.width;
    var h = canvas.height;
    if (hdrTexture && hdrSizeW === w && hdrSizeH === h) return;
    if (hdrTexture) hdrTexture.destroy();
    if (glowTexture) glowTexture.destroy();
    hdrTexture = device.createTexture({
      size: { width: Math.max(1, w), height: Math.max(1, h) },
      format: hdrFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    hdrView = hdrTexture.createView();
    // Half-res glow target (quarter the fragments for the soft halo pass).
    var gw = Math.max(1, Math.floor(w / GLOW_DOWNSAMPLE));
    var gh = Math.max(1, Math.floor(h / GLOW_DOWNSAMPLE));
    glowTexture = device.createTexture({
      size: { width: gw, height: gh },
      format: hdrFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    glowView = glowTexture.createView();
    hdrSizeW = w;
    hdrSizeH = h;
    // The composite pass samples both targets; rebuild its bind group. hdr is
    // sampled 1:1 (nearest); glow is upsampled (linear) for a smooth halo.
    if (compositeBGL) {
      compositeBG = device.createBindGroup({
        layout: compositeBGL,
        entries: [
          { binding: 0, resource: hdrView },
          { binding: 1, resource: hdrSampler },
          { binding: 2, resource: glowView },
          { binding: 3, resource: glowSampler }
        ]
      });
    }
  }

  function uploadPalette() {
    var data = new Float32Array(K_MAX * 4);
    for (var i = 0; i < K_MAX; i++) {
      var c = speciesColors[i] || [0, 0, 0];
      data[i * 4 + 0] = c[0];
      data[i * 4 + 1] = c[1];
      data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = 1.0;
    }
    device.queue.writeBuffer(paletteBuffer, 0, data);
  }

  function uploadMatrix() {
    device.queue.writeBuffer(matrixBuffer, 0, matrix);
  }

  // Reusable scratch for uploadParams: filled and re-uploaded every frame.
  // Hoisted out of the function so the hot path does not allocate a fresh
  // ArrayBuffer (+ two typed-array views) 60x a second and feed the GC.
  var paramsScratch = new ArrayBuffer(144);
  var paramsScratchU32 = new Uint32Array(paramsScratch);
  var paramsScratchF32 = new Float32Array(paramsScratch);

  function uploadParams(dt) {
    // Params struct grew with the pointer overhaul + rogue field: 36 scalar
    // slots = 144 bytes, which is 16-byte aligned. The render/glow shaders
    // read only the first fields off the same (larger) buffer.
    var u32 = paramsScratchU32;
    var f32 = paramsScratchF32;
    u32[0]  = simN;
    u32[1]  = K;
    u32[2]  = simCellsX;
    u32[3]  = simCellsY;
    f32[4]  = simWorld.w;
    f32[5]  = simWorld.h;
    f32[6]  = simRMax;
    f32[7]  = simRMax; // cellSize == rMax
    f32[8]  = simBeta;
    f32[9]  = simForce * 220.0;
    f32[10] = Math.exp(-Math.max(0.001, simFriction) * dt * 8);
    f32[11] = dt;
    // Pointer position uses the SMOOTHED values, never the raw cursor.
    f32[12] = simPointer.sx;
    f32[13] = simPointer.sy;
    // Legacy "pointerForce" is now an envelope amplitude in [0,1].
    // The shader scales its own force constants by this value — it's
    // multiplicative, not the magnitude itself. Sending 0 lets the
    // shader cheaply early-out and skip the pointer block entirely
    // when the gesture has fully faded.
    f32[14] = simPointer.envelope;
    f32[15] = simPointer.radius;
    u32[16] = simMaxPerCell;
    f32[17] = Math.max(1.5, Math.min(4.5, 8000 / Math.sqrt(simN)));  // particle radius (px)
    f32[18] = 1.05;  // brightness (lowered for crisper dots)
    f32[19] = simRepel; // collision strength
    u32[20] = simLooping ? 1 : 0;  // toroidal world flag
    // Pointer velocity (px/s, smoothed). Drives the advection term —
    // particles get carried in the direction the cursor is moving,
    // not yanked toward where it currently is.
    f32[21] = simPointer.vx;
    f32[22] = simPointer.vy;
    // Mode: 0 swirl/drag, 1 outward shockwave (shift+drag).
    u32[23] = simPointer.mode | 0;
    // ---- Rogue field (slots 24..35) ----
    // An invisible flow added to totalForce in WGSL_UPDATE. fieldStrength 0
    // makes the shader skip the whole block, so the master toggle just sends
    // 0 when off. Phase/alpha/pattern ids come from the JS morph engine.
    f32[24] = fieldEnabled ? param('fieldstr', FIELD_STRENGTH_DEFAULT) : 0.0;
    f32[25] = fieldPhase;          // animation clock
    f32[26] = fieldAlphaEased;     // smootherstep-eased crossfade 0..1
    u32[27] = fieldA | 0;          // loose-channel FROM pattern
    u32[28] = fieldB | 0;          // loose-channel TO pattern
    u32[29] = fieldC | 0;          // dense-channel FROM pattern
    f32[30] = FIELD_SCALE;         // spatial frequency (fixed for v1)
    // Density band for the loose/dense layer split. Particle Life clumps, so
    // anchor the band to AVERAGE occupancy (simN / cell count): a cell near or
    // below average reads as "loose"; a few times denser is a real cluster.
    var nCellsTot = Math.max(1, simCellsX * simCellsY);
    var avgPerCell = simN / nCellsTot;
    // Lower, tighter band than before so the split is dramatic: cluster
    // particles (> ~1.7x average occupancy) commit fully to the dense layer,
    // gap particles (< ~0.6x) to the loose layer, with a crisp transition.
    f32[31] = Math.max(2.0, avgPerCell * 0.6);    // densLo
    f32[32] = Math.max(5.0, avgPerCell * 1.7);    // densHi
    u32[33] = (fieldEnabled && fieldLayersOn) ? 1 : 0;
    u32[34] = fieldD | 0;          // dense-channel TO pattern
    f32[35] = FIELD_DENSE_BOOST;   // dense-layer force multiplier (intensity)
    device.queue.writeBuffer(paramsBuffer, 0, paramsScratch);
  }

  /* ---------- Particle spawn ---------- */
  function spawnParticles(n) {
    simN = n;
    recomputeGridDims();
    createGridBuffers();

    var posVel = new Float32Array(n * 4);
    var colors = new Uint32Array(n);
    for (var i = 0; i < n; i++) {
      posVel[i * 4 + 0] = Math.random() * simWorld.w;
      posVel[i * 4 + 1] = Math.random() * simWorld.h;
      posVel[i * 4 + 2] = (Math.random() - 0.5) * 4;
      posVel[i * 4 + 3] = (Math.random() - 0.5) * 4;
      colors[i] = i % K;
    }
    device.queue.writeBuffer(particlesA, 0, posVel);
    device.queue.writeBuffer(particlesB, 0, posVel);
    device.queue.writeBuffer(colorsBuffer, 0, colors);

    rebuildBindGroups();
    if (countEl) countEl.textContent = n.toLocaleString() + ' particles';
  }

  /* ---------- Pipelines ---------- */
  function createPipelines() {
    // Common compute bind group layout.
    computeBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // matrix
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // colors
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particlesIn
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // particlesOut
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // cellCount (atomic) + scatter cursor
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // cellStart (prefix sum)
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }            // sorted particles
      ]
    });

    var computeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeBGL] });

    var clearMod   = device.createShaderModule({ code: WGSL_COMMON + WGSL_CLEAR });
    var countMod   = device.createShaderModule({ code: WGSL_COMMON + WGSL_COUNT });
    var scanMod    = device.createShaderModule({ code: WGSL_COMMON + WGSL_SCAN });
    var scatterMod = device.createShaderModule({ code: WGSL_COMMON + WGSL_SCATTER });
    var updateMod  = device.createShaderModule({ code: WGSL_COMMON + WGSL_UPDATE });

    clearPipeline   = device.createComputePipeline({ layout: computeLayout, compute: { module: clearMod,   entryPoint: 'main' } });
    countPipeline   = device.createComputePipeline({ layout: computeLayout, compute: { module: countMod,   entryPoint: 'main' } });
    scanPipeline    = device.createComputePipeline({ layout: computeLayout, compute: { module: scanMod,    entryPoint: 'main' } });
    scatterPipeline = device.createComputePipeline({ layout: computeLayout, compute: { module: scatterMod, entryPoint: 'main' } });
    updatePipeline  = device.createComputePipeline({ layout: computeLayout, compute: { module: updateMod,  entryPoint: 'main' } });

    // Resize position-rescale pass (own tiny layout: uniform + storage).
    rescaleBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
      ]
    });
    var rescaleMod = device.createShaderModule({ code: WGSL_RESCALE });
    rescalePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [rescaleBGL] }),
      compute: { module: rescaleMod, entryPoint: 'main' }
    });
    // Bind groups for both ping-pong buffers (rescaling both is harmless and
    // sidesteps having to know which one holds the current state).
    rescaleBG_A = device.createBindGroup({
      layout: rescaleBGL,
      entries: [
        { binding: 0, resource: { buffer: rescaleParamsBuffer } },
        { binding: 1, resource: { buffer: particlesA } }
      ]
    });
    rescaleBG_B = device.createBindGroup({
      layout: rescaleBGL,
      entries: [
        { binding: 0, resource: { buffer: rescaleParamsBuffer } },
        { binding: 1, resource: { buffer: particlesB } }
      ]
    });

    // Render bind group layout.
    renderBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },             // params
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },                              // particles
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },                              // colors
        { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }               // palette
      ]
    });

    var renderMod = device.createShaderModule({ code: WGSL_RENDER });
    renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
      vertex: {
        module: renderMod,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }
        ]
      },
      fragment: {
        module: renderMod,
        entryPoint: 'fs',
        targets: [{
          format: hdrFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });

    // Glow pass: same geometry, larger quads (6x particle radius), soft
    // gaussian-style halo. Additive into the same HDR target.
    var glowMod = device.createShaderModule({ code: WGSL_GLOW });
    glowPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
      vertex: {
        module: glowMod,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }
        ]
      },
      fragment: {
        module: glowMod,
        entryPoint: 'fs',
        targets: [{
          format: hdrFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });

    // Composite pass: full-screen triangle that samples the HDR target,
    // applies ACES tonemapping, adds tiny dither, and writes to the swap
    // chain. No vertex buffer needed; positions are generated from the
    // vertex_index.
    compositeBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },   // hdr (sharp)
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },      // nearest
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },   // glow (half-res)
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }       // linear upsample
      ]
    });
    var compositeMod = device.createShaderModule({ code: WGSL_COMPOSITE });
    compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [compositeBGL] }),
      vertex:   { module: compositeMod, entryPoint: 'vs' },
      fragment: {
        module: compositeMod,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }]
      },
      primitive: { topology: 'triangle-list' }
    });
    hdrSampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    glowSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  function rebuildBindGroups() {
    // Compute bind groups (ping-pong).
    computeBG_AB = device.createBindGroup({
      layout: computeBGL,
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: matrixBuffer } },
        { binding: 2, resource: { buffer: colorsBuffer } },
        { binding: 3, resource: { buffer: particlesA } },
        { binding: 4, resource: { buffer: particlesB } },
        { binding: 5, resource: { buffer: cellCountBuffer } },
        { binding: 6, resource: { buffer: cellStartBuffer } },
        { binding: 7, resource: { buffer: sortedBuffer } }
      ]
    });
    computeBG_BA = device.createBindGroup({
      layout: computeBGL,
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: matrixBuffer } },
        { binding: 2, resource: { buffer: colorsBuffer } },
        { binding: 3, resource: { buffer: particlesB } },
        { binding: 4, resource: { buffer: particlesA } },
        { binding: 5, resource: { buffer: cellCountBuffer } },
        { binding: 6, resource: { buffer: cellStartBuffer } },
        { binding: 7, resource: { buffer: sortedBuffer } }
      ]
    });
    renderBG_A = device.createBindGroup({
      layout: renderBGL,
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: particlesA } },
        { binding: 2, resource: { buffer: colorsBuffer } },
        { binding: 3, resource: { buffer: paletteBuffer } }
      ]
    });
    renderBG_B = device.createBindGroup({
      layout: renderBGL,
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: particlesB } },
        { binding: 2, resource: { buffer: colorsBuffer } },
        { binding: 3, resource: { buffer: paletteBuffer } }
      ]
    });
  }

  /* ---------- Frame ---------- */
  var prevTime = 0, accumFps = 0, accumFrames = 0;

  function frame(t) {
    var dt = Math.min(0.033, Math.max(0.001, (t - prevTime) / 1000));
    if (prevTime === 0) dt = 1 / 60;
    prevTime = t;
    accumFps += 1 / dt;
    accumFrames++;
    if (accumFrames >= 30) {
      if (fpsEl) fpsEl.textContent = (accumFps / accumFrames).toFixed(0) + ' fps';
      accumFps = 0; accumFrames = 0;
    }

    // Smooth pointer state first — the uploaded params must reflect
    // the post-smoothed position/velocity/envelope, not the raw event
    // data, otherwise the GPU sees the same jitter we just filtered.
    smoothPointer(dt);
    // Advance the rogue-field morph clock (pattern crossfade + animation)
    // before uploading, so the GPU sees this frame's phase/alpha/ids.
    advanceField(dt);
    uploadParams(dt);

    var enc = device.createCommandEncoder();
    var inputBG  = pingFlip ? computeBG_BA : computeBG_AB;
    var renderBG = pingFlip ? renderBG_A   : renderBG_B; // we just wrote to "out" buffer

    // Compute passes.
    var cp = enc.beginComputePass(tsSupported
      ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
      : undefined);

    var nCells = simCellsX * simCellsY;
    var pGroups = Math.ceil(simN / COMPUTE_WG);

    // 1. zero the per-cell counters
    cp.setPipeline(clearPipeline);
    cp.setBindGroup(0, inputBG);
    cp.dispatchWorkgroups(Math.ceil(nCells / 64));

    // 2. count particles per cell
    cp.setPipeline(countPipeline);
    cp.setBindGroup(0, inputBG);
    cp.dispatchWorkgroups(pGroups);

    // 3. exclusive prefix-sum the counts into cellStart (single invocation)
    cp.setPipeline(scanPipeline);
    cp.setBindGroup(0, inputBG);
    cp.dispatchWorkgroups(1);

    // 4. scatter each particle into its cell's slot in the sorted array
    cp.setPipeline(scatterPipeline);
    cp.setBindGroup(0, inputBG);
    cp.dispatchWorkgroups(pGroups);

    // 5. sum forces from contiguous neighbor runs, integrate, write out
    cp.setPipeline(updatePipeline);
    cp.setBindGroup(0, inputBG);
    cp.dispatchWorkgroups(pGroups);

    cp.end();

    // ----- Particle rendering into HDR offscreen target -----
    // Safety: if a resize event hasn't fired yet, make sure the HDR
    // target exists at the right size before rendering.
    ensureHDRTarget();

    // Glow pass: large soft halos, rendered into the half-res glow target
    // (a quarter of the fragments). Upsampled in the composite pass.
    var glowDesc = {
      colorAttachments: [{
        view: glowView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    };
    if (tsSupported) {
      glowDesc.timestampWrites = { querySet: tsQuerySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 };
    }
    var glowPass = enc.beginRenderPass(glowDesc);
    glowPass.setPipeline(glowPipeline);
    glowPass.setBindGroup(0, renderBG);
    glowPass.setVertexBuffer(0, quadVertexBuffer);
    glowPass.draw(6, simN, 0, 0);
    glowPass.end();

    // Main pass: sharp particle discs at full res in the HDR target.
    var hdrDesc = {
      colorAttachments: [{
        view: hdrView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    };
    if (tsSupported) {
      hdrDesc.timestampWrites = { querySet: tsQuerySet, beginningOfPassWriteIndex: 4, endOfPassWriteIndex: 5 };
    }
    var hdrPass = enc.beginRenderPass(hdrDesc);
    hdrPass.setPipeline(renderPipeline);
    hdrPass.setBindGroup(0, renderBG);
    hdrPass.setVertexBuffer(0, quadVertexBuffer);
    hdrPass.draw(6, simN, 0, 0);
    hdrPass.end();

    // ----- Composite pass: ACES tonemap + dither into swap chain -----
    var swapDesc = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.020, g: 0.020, b: 0.028, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    };
    if (tsSupported) {
      swapDesc.timestampWrites = { querySet: tsQuerySet, beginningOfPassWriteIndex: 6, endOfPassWriteIndex: 7 };
    }
    var swapPass = enc.beginRenderPass(swapDesc);
    swapPass.setPipeline(compositePipeline);
    swapPass.setBindGroup(0, compositeBG);
    swapPass.draw(3, 1, 0, 0);
    swapPass.end();

    if (tsSupported) {
      enc.resolveQuerySet(tsQuerySet, 0, 8, tsResolveBuf, 0);
      // Only stage a fresh readback when no map is in flight, so the copy
      // never targets a buffer that is currently mapped.
      if (!tsPending) enc.copyBufferToBuffer(tsResolveBuf, 0, tsReadBuf, 0, 64);
    }
    device.queue.submit([enc.finish()]);
    pingFlip = !pingFlip;

    if (tsSupported && !tsPending) {
      tsFrameCount++;
      if (tsFrameCount >= 20) { tsFrameCount = 0; readPerfTimings(); }
    }

    requestAnimationFrame(frame);
  }

  /* ---------- GPU timing setup + readback (only when tsSupported) ---------- */
  // Build the timestamp QuerySet, its resolve + mappable readback buffers,
  // and the corner overlay. Called once from init().
  function setupPerf() {
    try {
      tsQuerySet   = device.createQuerySet({ type: 'timestamp', count: 8 });
      tsResolveBuf = device.createBuffer({
        size: 8 * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
      });
      tsReadBuf = device.createBuffer({
        size: 8 * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
    } catch (e) {
      tsSupported = false;   // any failure: fall back to the normal path
      return;
    }
    var wrap = container.querySelector('.pl-canvas-wrap');
    if (wrap) {
      perfOverlayEl = document.createElement('div');
      perfOverlayEl.style.cssText =
        'position:absolute;top:6px;left:8px;z-index:20;pointer-events:none;' +
        'font:11px/1.45 "Commit Mono",ui-monospace,monospace;' +
        'color:rgba(220,235,255,0.82);text-shadow:0 1px 2px rgba(0,0,0,0.9);' +
        'white-space:pre;letter-spacing:0.02em;';
      perfOverlayEl.textContent = 'GPU timing: warming up...';
      wrap.appendChild(perfOverlayEl);
    }
  }

  // Map the readback buffer (never more than one map in flight) and turn the
  // six u64 nanosecond timestamps into three per-pass millisecond figures.
  function readPerfTimings() {
    if (!tsReadBuf || tsPending) return;
    tsPending = true;
    tsReadBuf.mapAsync(GPUMapMode.READ).then(function () {
      var v = new BigUint64Array(tsReadBuf.getMappedRange());
      var ms = function (a, b) {
        var d = v[b] - v[a];
        return d > 0n ? Number(d) / 1e6 : 0;
      };
      var cmp = ms(0, 1), glow = ms(2, 3), draw = ms(4, 5), comp = ms(6, 7);
      tsReadBuf.unmap();
      tsPending = false;
      if (perfOverlayEl) {
        perfOverlayEl.textContent =
          'compute   ' + cmp.toFixed(2)  + ' ms\n' +
          'glow      ' + glow.toFixed(2) + ' ms\n' +
          'sharp     ' + draw.toFixed(2) + ' ms\n' +
          'composite ' + comp.toFixed(2) + ' ms';
      }
    }).catch(function () { tsPending = false; });
  }

  /* ---------- Pointer handling ----------
     Events feed raw position into simPointer. A separate per-frame
     smoothing pass (smoothPointer, called from frame()) is what the
     GPU actually consumes. Press/release flip envelope direction;
     the envelope itself ramps in smoothPointer over many frames so
     the force field never snaps on or off.

     Mode is captured at press time and held for the duration of the
     gesture — toggling shift mid-drag would be a strange feel, this
     locks one continuous gesture to one behavior. */
  function setupPointer() {
    function getXY(e) {
      var r = canvas.getBoundingClientRect();
      var src = e.touches ? e.touches[0] : e;
      // Map CSS coords to backing-store (world) coords with the exact
      // ratio resizeCanvas computed, so the pointer field lands under the
      // cursor even when MAX_CANVAS_PIXELS scaled the backing store down.
      simPointer.x = (src.clientX - r.left) * pointerScaleX;
      simPointer.y = (src.clientY - r.top)  * pointerScaleY;
      // First-touch seed: align smoothed position with raw so we don't
      // sweep a phantom force field across the canvas from (0,0).
      if (!simPointer.hasPos) {
        simPointer.sx = simPointer.x;
        simPointer.sy = simPointer.y;
        simPointer.hasPos = true;
      }
    }
    canvas.addEventListener('pointerdown', function (e) {
      simPointer.down = true;
      simPointer.mode = e.shiftKey ? 1 : 0; // 0 = swirl, 1 = repel
      getXY(e);
      // Re-seed the smoothed position to the press point and zero the
      // velocity. Without this, the EMA would briefly sweep from
      // wherever the last release left sx/sy to the new press,
      // dragging a phantom field across the canvas; and any inherited
      // velocity from a previous flick would dump unrelated motion
      // into the field as soon as the new press's envelope ramped up.
      simPointer.sx = simPointer.x;
      simPointer.sy = simPointer.y;
      simPointer.vx = 0;
      simPointer.vy = 0;
      canvas.setPointerCapture(e.pointerId);
      if (!hasInteractedSim) { hasInteractedSim = true; track('simulation_interaction'); }
    });
    canvas.addEventListener('pointermove', function (e) {
      // Only track the cursor while the gesture is active. After
      // release, the envelope is still decaying and we want the
      // trailing wake to stay where the user let go, not chase the
      // cursor around the canvas as it idles.
      if (simPointer.down) getXY(e);
    });
    canvas.addEventListener('pointerup', function () {
      simPointer.down = false;
      // envelope decays in smoothPointer; mode stays as-is so the
      // tail of the gesture finishes in the same flavor it started in
    });
    canvas.addEventListener('pointercancel', function () {
      simPointer.down = false;
    });
  }

  /* Per-frame pointer smoothing. Runs once at the top of frame() and
     produces the values uploaded to the GPU. Three jobs:

       1. Low-pass the raw position into (sx, sy). Tau ~50ms feels
          like the cursor "drags" the medium with a hint of weight,
          without lagging visibly.
       2. Derive a smoothed velocity from the position-step. We
          deliberately compute vx/vy from the SMOOTHED position
          rather than raw — that keeps the velocity vector free of
          the high-frequency jaggies that come out of pointer events
          on some hardware. Velocity is what powers the advection
          ("drag" the field), so it has to feel like flow, not noise.
       3. Drive the press envelope. Up while down, down while not.
          Asymmetric time constants: faster ramp-up (snappy on press)
          than ramp-down (so the swirl persists for ~half a second
          after release, leaving a beautiful trailing wake instead of
          cutting off mid-motion). */
  function smoothPointer(dt) {
    if (!simPointer.hasPos) return;

    // Low-pass position. alpha = 1 - exp(-dt/tau). Tau in seconds.
    var tauPos = 0.045;
    var aPos = 1 - Math.exp(-dt / tauPos);
    var prevSx = simPointer.sx;
    var prevSy = simPointer.sy;
    simPointer.sx += (simPointer.x - simPointer.sx) * aPos;
    simPointer.sy += (simPointer.y - simPointer.sy) * aPos;

    // Smoothed velocity = (smoothed position step) / dt, then EMA.
    // The first division gives an instantaneous velocity in px/s, the
    // EMA flattens the bumps. Tau ~80ms — long enough that quick
    // micro-jitter doesn't reverse the velocity vector.
    var instVx = (simPointer.sx - prevSx) / Math.max(dt, 1e-4);
    var instVy = (simPointer.sy - prevSy) / Math.max(dt, 1e-4);
    var tauVel = 0.08;
    var aVel = 1 - Math.exp(-dt / tauVel);
    simPointer.vx += (instVx - simPointer.vx) * aVel;
    simPointer.vy += (instVy - simPointer.vy) * aVel;

    // Envelope. Up while down, fade while up. Asymmetric tau makes
    // the release feel like a swirl that gradually loses energy
    // rather than a hard cut. Press ramp is fast (~50ms) so the
    // user feels the touch land instantly; release tail is long
    // (~450ms) so the wake dissipates beautifully.
    var tauEnv = simPointer.down ? 0.05 : 0.45;
    var aEnv = 1 - Math.exp(-dt / tauEnv);
    var target = simPointer.down ? 1.0 : 0.0;
    simPointer.envelope += (target - simPointer.envelope) * aEnv;

    // Snap tiny envelope to zero so we can occasionally skip the
    // pointer block entirely on the GPU side via pointerForce==0.
    if (!simPointer.down && simPointer.envelope < 0.002) {
      simPointer.envelope = 0;
      // Also bleed velocity to zero once the field has fully faded,
      // so the next press doesn't carry a stale velocity from the
      // previous gesture.
      simPointer.vx *= 0.0;
      simPointer.vy *= 0.0;
    }
  }

  /* ---------- Slider change handling ---------- */
  function onSliderChange(name) {
    if (name === 'count') {
      var newN = parseInt(sliders.count.value, 10);
      // Round to nearest 1000 for predictable behavior.
      newN = Math.max(1000, Math.round(newN / 1000) * 1000);
      spawnParticles(newN);
    } else if (name === 'rmax') {
      simRMax = parseFloat(sliders.rmax.value);
      recomputeGridDims();
      createGridBuffers();
      rebuildBindGroups();
    } else if (name === 'force') {
      simForce = parseFloat(sliders.force.value);
    } else if (name === 'friction') {
      simFriction = parseFloat(sliders.friction.value);
    } else if (name === 'beta') {
      simBeta = parseFloat(sliders.beta.value);
    } else if (name === 'repel') {
      simRepel = parseFloat(sliders.repel.value);
    } else if (name === 'species') {
      var newK = parseInt(sliders.species.value, 10);
      setK(newK);
    }
  }

  /* ---------- Buttons ---------- */
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      // Restore default slider values.
      for (var key in defaults) {
        if (sliders[key]) {
          sliders[key].value = defaults[key];
          var valEl = container.querySelector('[data-value="' + key + '"]');
          if (valEl) valEl.textContent = formatVal(key, defaults[key]);
        }
      }
      simRMax     = parseFloat(sliders.rmax.value);
      simForce    = parseFloat(sliders.force.value);
      simFriction = parseFloat(sliders.friction.value);
      simBeta     = parseFloat(sliders.beta.value);
      if (sliders.repel) simRepel = parseFloat(sliders.repel.value);
      // Reset toggles to defaults: looping on, symmetric on.
      simLooping = true;
      simSymmetric = true;
      if (loopToggleEl) loopToggleEl.checked = true;
      if (symToggleEl)  symToggleEl.checked  = true;
      // Reset the rogue field: enabled, layered, fresh playlist. The Field
      // and Morph sliders are already restored to defaults by the loop above.
      fieldEnabled = true;
      fieldLayersOn = false;
      fieldAutoMorph = true;
      if (fieldToggleEl) fieldToggleEl.checked = true;
      if (layerToggleEl) layerToggleEl.checked = false;
      if (autoToggleEl)  autoToggleEl.checked  = true;
      fieldInitPlaylist();
      // Restore the K=8 default. setK is a no-op if K is already 8.
      var defaultK = sliders.species ? parseInt(sliders.species.value, 10) : 8;
      setK(defaultK);
      spawnParticles(parseInt(sliders.count.value, 10));
      // New random matrix at the default K, rather than forcing the
      // Cells preset (which would override K and physics).
      randomizeMatrix();
    });
  }
  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', function () {
      track('randomize_clicked');
      randomizeAll();
    });
  }
  // "New colors" — reroll ONLY the palette (a fresh harmonious scheme),
  // keeping the matrix, physics and species count exactly as they are.
  // There are two copies (under-swatches + action-bar); wire both.
  for (var rci = 0; rci < recolorBtns.length; rci++) {
    recolorBtns[rci].addEventListener('click', function () {
      track('recolor_clicked');
      randomizeSpeciesPalette();
      if (paletteBuffer) uploadPalette();
      rebuildMatrixGrid();
    });
  }
  for (var pi = 0; pi < presetBtns.length; pi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        track('preset_applied', { preset_name: btn.dataset.preset });
        applyPreset(btn.dataset.preset);
      });
    })(presetBtns[pi]);
  }
  if (loopToggleEl) {
    loopToggleEl.checked = simLooping;
    loopToggleEl.addEventListener('change', function () {
      simLooping = !!loopToggleEl.checked;
      // Picked up next frame via uploadParams.
    });
  }
  if (symToggleEl) {
    symToggleEl.checked = simSymmetric;
    symToggleEl.addEventListener('change', function () {
      simSymmetric = !!symToggleEl.checked;
      // If just turned on, immediately symmetrize the current matrix so
      // the toggle takes visible effect right away.
      if (simSymmetric) {
        symmetrizeMatrix();
        rebuildMatrixGrid();
        uploadMatrix();
      }
    });
  }
  // ---- Rogue field controls ----
  // The two sliders (fieldstr, fieldmorph) are read live by uploadParams /
  // fieldMorphRate, so they need no onSliderChange case; only the toggles,
  // the Prev/Next buttons, and the readout span need wiring here.
  fieldNameEl = container.querySelector('.pl-field-name');
  fieldUpdateReadout();
  if (fieldToggleEl) {
    fieldToggleEl.checked = fieldEnabled;
    fieldToggleEl.addEventListener('change', function () {
      fieldEnabled = !!fieldToggleEl.checked;
      fieldUpdateReadout();
    });
  }
  if (layerToggleEl) {
    layerToggleEl.checked = fieldLayersOn;
    layerToggleEl.addEventListener('change', function () {
      fieldLayersOn = !!layerToggleEl.checked;
      fieldUpdateReadout();
    });
  }
  if (autoToggleEl) {
    autoToggleEl.checked = fieldAutoMorph;
    autoToggleEl.addEventListener('change', function () {
      fieldAutoMorph = !!autoToggleEl.checked;
      // Turning auto back on re-arms the hold timer from now, so it doesn't
      // immediately fire off a stale countdown.
      if (fieldAutoMorph && fieldState === 'hold') fieldTimer = 0.0;
    });
  }
  if (fieldPrevBtn) {
    fieldPrevBtn.addEventListener('click', function () {
      track('field_prev_clicked');
      fieldPrev();
    });
  }
  if (fieldNextBtn) {
    fieldNextBtn.addEventListener('click', function () {
      track('field_next_clicked');
      fieldNext();
    });
  }
  bindSlotUI();

  /* ============================================================
     FULLSCREEN + CONTROL DRAWER
     Native Fullscreen API on the wrapper (webkit-prefixed), with a
     CSS-only fallback for browsers that lack the API or reject the
     request. A single class, .is-fs, drives the look for BOTH paths:
     the canvas fills the screen and the controls slide in as a drawer
     (a right rail in landscape, a bottom sheet in portrait).
     ============================================================ */
  (function setupFullscreen() {
    var wrap = container;                       // the .pl-wrapper
    var fsBtn        = container.querySelector('.pl-fullscreen');
    var drawerToggle = container.querySelector('.pl-fs-drawer-toggle');
    var drawerClose  = container.querySelector('.pl-drawer-close');
    var drawerExit   = container.querySelector('.pl-drawer-exit');
    var scrim        = container.querySelector('.pl-scrim');
    var controls     = container.querySelector('.pl-controls');
    var drawerBar    = container.querySelector('.pl-drawer-bar');
    if (!fsBtn) return;

    var cssOnlyFs = false;   // true while using the CSS fallback path

    // CSS-fallback only: lift the wrapper to be a direct child of <body>
    // so its position:fixed resolves against the viewport. The .post-body
    // fade-in leaves a held translateY(0) transform that would otherwise
    // become the containing block and shrink the wrapper to the article
    // column. Native fullscreen promotes the element to the top layer,
    // which escapes that on its own — so we must NOT reparent during native
    // FS (removing the fullscreen element from the doc would exit FS).
    // Same lift-to-body trick the Sluice page uses.
    var originalParent = wrap.parentNode;
    var originalNext   = wrap.nextSibling;
    function moveWrapperToBody() {
      if (wrap.parentNode !== document.body) document.body.appendChild(wrap);
    }
    function restoreWrapper() {
      if (!originalParent || wrap.parentNode === originalParent) return;
      if (originalNext && originalNext.parentNode === originalParent) {
        originalParent.insertBefore(wrap, originalNext);
      } else {
        originalParent.appendChild(wrap);
      }
    }

    function nativeFsEl() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function isFs() { return !!nativeFsEl() || cssOnlyFs; }

    function setDrawer(open) {
      wrap.classList.toggle('pl-drawer-open', open);
      if (drawerToggle) drawerToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) wrap.classList.remove('pl-ui-dim');
    }

    // Apply / clear the fullscreen look, then resize the sim to the new
    // canvas size. A double rAF lets the fullscreen layout settle before
    // resizeCanvas() reads the new rect.
    function applyFsState(on) {
      wrap.classList.toggle('is-fs', on);
      if (fsBtn) fsBtn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
      if (!on) { setDrawer(false); wrap.classList.remove('pl-ui-dim'); }
      requestAnimationFrame(function () {
        onResize();
        requestAnimationFrame(onResize);
      });
    }

    function enterCssFs() {
      moveWrapperToBody();
      cssOnlyFs = true;
      applyFsState(true);
    }
    function exitCssFs() {
      cssOnlyFs = false;
      applyFsState(false);
      restoreWrapper();
    }

    function toggleFullscreen() {
      if (isFs()) {
        if (nativeFsEl()) {
          var exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) { try { exit.call(document); } catch (e) {} }
          else { exitCssFs(); }
        } else {
          exitCssFs();
        }
        return;
      }
      // Try native first, in place (top layer escapes transformed
      // ancestors). Only the fallback needs the lift-to-body.
      var req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      if (!req) { enterCssFs(); return; }
      try {
        var p = req.call(wrap);
        if (p && typeof p.then === 'function') {
          p.catch(function () { enterCssFs(); });   // rejected (older iOS) -> CSS fallback
        }
      } catch (e) { enterCssFs(); }
    }

    function onFsChange() {
      if (!nativeFsEl()) cssOnlyFs = false;   // left native FS -> drop css flag too
      var on = !!nativeFsEl() || cssOnlyFs;
      applyFsState(on);
      track(on ? 'fullscreen_enter' : 'fullscreen_exit');
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    if (drawerToggle) drawerToggle.addEventListener('click', function () {
      setDrawer(!wrap.classList.contains('pl-drawer-open'));
    });
    if (drawerClose) drawerClose.addEventListener('click', function () { setDrawer(false); });
    if (drawerExit)  drawerExit.addEventListener('click', toggleFullscreen);
    if (scrim)       scrim.addEventListener('click', function () { setDrawer(false); });

    // F only triggers when the reader is actually on the demo (hover) or
    // already fullscreen, so it never hijacks the page while scrolling.
    var wrapHovered = false;
    wrap.addEventListener('pointerenter', function () { wrapHovered = true; });
    wrap.addEventListener('pointerleave', function () { wrapHovered = false; });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = e.key;
      if (k === 'f' || k === 'F') {
        if (isFs() || wrapHovered) { toggleFullscreen(); e.preventDefault(); }
      } else if ((k === 'r' || k === 'R') && isFs()) {
        track('randomize_clicked');
        randomizeAll();
        e.preventDefault();
      } else if (k === 'Escape' && cssOnlyFs) {
        exitCssFs();   // native FS exits on Esc by itself; this covers the fallback
      }
    });

    // Immersive auto-dim: the floating header fades back while the pointer
    // sits idle in fullscreen; any movement (or opening the drawer) brings
    // it straight back. Kept subtle and gated to fullscreen only.
    var dimTimer = null;
    function nudgeUI() {
      if (!isFs()) return;
      wrap.classList.remove('pl-ui-dim');
      if (dimTimer) clearTimeout(dimTimer);
      dimTimer = setTimeout(function () {
        if (isFs() && !wrap.classList.contains('pl-drawer-open')) {
          wrap.classList.add('pl-ui-dim');
        }
      }, 2600);
    }
    wrap.addEventListener('pointermove', nudgeUI);
    wrap.addEventListener('pointerdown', nudgeUI);

    // Drag-to-dismiss: in the portrait bottom-sheet layout the drawer can be
    // grabbed by its top bar and pushed down to close. Only downward travel is
    // tracked; past ~28% of the sheet height (or 140px) it snaps shut, otherwise
    // it springs back open. Gated to portrait fullscreen with the drawer open,
    // so the landscape side rail and the desktop drawer are untouched. Pointer
    // events are bound to the bar (the grab handle) only, so the scrollable
    // control body below it still scrolls normally; taps on the bar's own
    // exit/close buttons pass straight through.
    if (drawerBar && controls) {
      var dragging = false, dragStartY = 0, dragDY = 0, sheetH = 1;
      function portraitSheet() {
        return isFs() && wrap.classList.contains('pl-drawer-open') &&
               window.matchMedia('(orientation: portrait)').matches;
      }
      drawerBar.addEventListener('pointerdown', function (e) {
        if (!portraitSheet()) return;
        if (e.target.closest && e.target.closest('button')) return;
        dragging = true;
        dragStartY = e.clientY;
        dragDY = 0;
        sheetH = controls.getBoundingClientRect().height || 1;
        controls.style.transition = 'none';
        wrap.classList.add('pl-drawer-dragging');
        try { drawerBar.setPointerCapture(e.pointerId); } catch (err) {}
      });
      drawerBar.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        dragDY = Math.max(0, e.clientY - dragStartY);
        controls.style.transform = 'translateY(' + dragDY + 'px)';
        e.preventDefault();
      });
      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        wrap.classList.remove('pl-drawer-dragging');
        try { drawerBar.releasePointerCapture(e.pointerId); } catch (err) {}
        controls.style.transition = '';   // restore the CSS slide transition
        controls.style.transform = '';     // hand back to the class-driven transform
        if (dragDY > Math.min(140, sheetH * 0.28)) setDrawer(false);
      }
      drawerBar.addEventListener('pointerup', endDrag);
      drawerBar.addEventListener('pointercancel', endDrag);
    }
  })();

  /* ============================================================
     WGSL SHADERS
     ============================================================ */
  var WGSL_COMMON = /* wgsl */`
struct Params {
  N: u32,
  K: u32,
  cellsX: u32,
  cellsY: u32,
  worldW: f32,
  worldH: f32,
  rMax: f32,
  cellSize: f32,
  beta: f32,
  forceScale: f32,
  frictionMul: f32,
  dt: f32,
  pointerX: f32,        // smoothed x in pixels
  pointerY: f32,        // smoothed y in pixels
  pointerForce: f32,    // press envelope in [0, 1]; multiplies all pointer terms
  pointerRadius: f32,
  maxPerCell: u32,
  particleSize: f32,
  brightness: f32,
  repel: f32,
  looping: u32,
  pointerVx: f32,       // smoothed cursor velocity in px/s, drives advection
  pointerVy: f32,
  pointerMode: u32,     // 0 = swirl/drag, 1 = outward shockwave
  // ---- Rogue field (an invisible, slowly morphing geometric flow that
  //       conducts the whole swarm; see the ROGUE FIELD banner below) ----
  fieldStrength: f32,   // 0 = field off; otherwise the conductor force size
  fieldPhase: f32,      // animation clock; drives each pattern's slow motion
  fieldAlpha: f32,      // crossfade 0..1, already smootherstep-eased in JS
  fieldA: u32,          // loose-channel pattern id (crossfade FROM)
  fieldB: u32,          // loose-channel pattern id (crossfade TO)
  fieldC: u32,          // dense-channel pattern id (crossfade FROM)
  fieldScale: f32,      // spatial frequency (how many pattern cells span view)
  fieldDensLo: f32,     // local density (particles/cell) = fully "loose" layer
  fieldDensHi: f32,     // local density = fully "dense" layer
  fieldLayers: u32,     // 1 = split loose vs dense particles onto two patterns
  fieldD: u32,          // dense-channel pattern id (crossfade TO)
  fieldDenseBoost: f32, // dense-layer force multiplier (how hard clusters obey
                        // their pattern vs the loose dust -- the "intensity"
                        // of the density-layer split). 1.0 = no boost.
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> matrix: array<f32>;
@group(0) @binding(2) var<storage, read> colors: array<u32>;
@group(0) @binding(3) var<storage, read> particlesIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> particlesOut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(7) var<storage, read_write> sorted: array<vec4<f32>>;

// Per-axis cell sizes derived from world dim / cell count, so cells
// exactly tile the world (no phantom strip on the right/bottom seam).
// The Params.cellSize field is ignored here — recomputeGridDims() in JS
// chose cellsX/Y as floor(world/rMax), guaranteeing these sizes are
// >= rMax, which is what the 3x3 cell walk in WGSL_UPDATE relies on.
// max(..., rMax) is a safety net for the degenerate case worldW<2*rMax
// where cellsX got clamped to 2; the cell math then has a small phantom
// strip (same as the old layout) but neighbor finding stays correct.
fn cellOf(p: vec2<f32>) -> vec2<i32> {
  let csx = max(params.worldW / f32(params.cellsX), params.rMax);
  let csy = max(params.worldH / f32(params.cellsY), params.rMax);
  let cx = clamp(i32(floor(p.x / csx)), 0, i32(params.cellsX) - 1);
  let cy = clamp(i32(floor(p.y / csy)), 0, i32(params.cellsY) - 1);
  return vec2<i32>(cx, cy);
}
fn cellIdx(c: vec2<i32>) -> u32 {
  return u32(c.y) * params.cellsX + u32(c.x);
}
`;

  var WGSL_CLEAR = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let total = params.cellsX * params.cellsY;
  if (i >= total) { return; }
  atomicStore(&cellCount[i], 0u);
}
`;

  // Standalone one-shot pass (no WGSL_COMMON): multiply every particle's
  // position by a per-axis scale so the swarm stretches to fill the world
  // after a resize. Run on resize, never in the hot loop.
  var WGSL_RESCALE = /* wgsl */`
struct RescaleParams { scale: vec2<f32>, n: u32, _pad: u32, };
@group(0) @binding(0) var<uniform> rp: RescaleParams;
@group(0) @binding(1) var<storage, read_write> parts: array<vec4<f32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= rp.n) { return; }
  var p = parts[i];
  p.x = p.x * rp.scale.x;
  p.y = p.y * rp.scale.y;
  parts[i] = p;
}
`;

  // Counting-sort grid build, split into three ordered passes (count ->
  // prefix-sum -> scatter). Within one compute pass each dispatch sees the
  // previous dispatch's storage writes, so the chain is correct without manual
  // barriers. The payoff is in WGSL_UPDATE: neighbor reads become contiguous
  // runs of the sorted array instead of per-neighbor gathers, and there is no
  // maxPerCell cap so dense clumps never drop neighbors.
  var WGSL_COUNT = /* wgsl */`
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.N) { return; }
  let ci = cellIdx(cellOf(particlesIn[i].xy));
  atomicAdd(&cellCount[ci], 1u);
}
`;

  // Serial exclusive prefix sum over the per-cell counts -> cellStart. One
  // invocation walks every cell; numCells is a few thousand to ~17k, so this
  // is tens of microseconds while the rest of the GPU briefly idles -- far
  // cheaper than the contiguous-read win it unlocks in the force pass. After
  // recording each cell's start we overwrite cellCount with that start so the
  // same buffer doubles as the scatter write cursor.
  var WGSL_SCAN = /* wgsl */`
@compute @workgroup_size(1)
fn main() {
  let nc = params.cellsX * params.cellsY;
  var run: u32 = 0u;
  for (var c: u32 = 0u; c < nc; c = c + 1u) {
    let cnt = atomicLoad(&cellCount[c]);
    cellStart[c] = run;
    atomicStore(&cellCount[c], run);
    run = run + cnt;
  }
  cellStart[nc] = run;
}
`;

  // Scatter: each particle claims the next slot in its cell's run (an atomic
  // bump of the cursor) and writes (pos.xy, color, originalIndex) there, so
  // the sorted array holds every particle grouped contiguously by cell. No
  // capacity check needed -- the cursor can only advance within the cell's
  // own [cellStart[c], cellStart[c+1]) range.
  var WGSL_SCATTER = /* wgsl */`
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.N) { return; }
  let p = particlesIn[i];
  let ci = cellIdx(cellOf(p.xy));
  let slot = atomicAdd(&cellCount[ci], 1u);
  sorted[slot] = vec4<f32>(p.x, p.y, f32(colors[i]), f32(i));
}
`;

  // Two-force Particle Life model (after Lisyarus, after Mohr/Ventrella).
  //
  //   collision(d)   = -repel * max(0, 1 - d/(beta*rMax))     // close-range, always repel
  //   interaction(d) =      a * max(0, 1 - d/rMax)            // long-range, signed by matrix
  //
  // Both forces are linear triangles peaked at d=0 and zero at their
  // respective radii. Collision lives inside beta*rMax (a fraction of
  // the interaction radius). Their sum has a smooth equilibrium distance
  // where attraction balances repulsion — that is what produces stable
  // shells, orbits, and "real-cell"-looking clusters.
  //
  // The world is a torus: cell lookups wrap, pair distances use the
  // minimum-image convention, and integration wraps positions modulo
  // worldW/worldH instead of clamping to walls.
  var WGSL_UPDATE = /* wgsl */`
fn forceFn(d: f32, a: f32, beta: f32, repel: f32) -> f32 {
  // d is in pixel units, beta is the collision-radius ratio (0..1),
  // repel is the global collision strength.  rMax is implicit because
  // we already early-out beyond it in the caller.
  let collisionR = beta;            // already pre-multiplied by rMax outside
  var f = 0.0;
  // Interaction: peaked at d=0, decays to 0 at rMax (d normalized by rMax).
  // Caller passes d already normalized to [0, 1] = d/rMax.
  f = f + a * max(0.0, 1.0 - d);
  // Collision: peaked at d=0, decays to 0 at collisionR (also normalized).
  if (d < collisionR) {
    f = f - repel * (1.0 - d / collisionR);
  }
  return f;
}

// Wrap an integer cell coordinate into [0, n).
fn wrapCell(c: i32, n: i32) -> i32 {
  return ((c % n) + n) % n;
}

// Minimum-image delta on a torus: returns the shortest vector
// from one position to another, accounting for wrap-around on each axis.
fn minImage(delta: vec2<f32>, world: vec2<f32>) -> vec2<f32> {
  var d = delta;
  let half = world * 0.5;
  if (d.x >  half.x) { d.x = d.x - world.x; }
  if (d.x < -half.x) { d.x = d.x + world.x; }
  if (d.y >  half.y) { d.y = d.y - world.y; }
  if (d.y < -half.y) { d.y = d.y + world.y; }
  return d;
}

// ====== ROGUE FIELD =========================================================
// An invisible, slowly morphing flow added to every particle's force. Each
// pattern is the CURL of a scalar potential P:  (fx, fy) = (dP/dy, -dP/dx).
// The curl is divergence-free, so particles CIRCULATE along the pattern's
// contours instead of collapsing into its bright spots -- a plain gradient
// field would suck everything into point attractors and look dead. The JS
// morph engine crossfades pattern A -> B (loose channel) and B -> C (dense
// channel); the per-particle blend by local density happens in main().
// Patterns are evaluated in normalized view space q (origin at screen centre,
// |q| ~ 1 at the nearer edge) and return a roughly-unit-scale flow; main()
// renormalises after blending. Math verified with a JXA divergence harness.
const PI_F  : f32 = 3.14159265;
const TAU_F : f32 = 6.28318531;

// 5/7-fold quasicrystal: curl of a sum of n equal-angle plane waves. The
// shared phase ph makes the whole interference lattice breathe. Penrose-like
// at n=5, the classic "quasicrystal" look at n=7.
fn fieldQuasi(q: vec2<f32>, n: u32, scl: f32, ph: f32) -> vec2<f32> {
  var fx = 0.0;
  var fy = 0.0;
  let k = 2.2 * scl;
  let nn = f32(n);
  for (var i: u32 = 0u; i < n; i = i + 1u) {
    let th = PI_F * f32(i) / nn;
    let c = cos(th);
    let s = sin(th);
    let sn = sin(k * (q.x * c + q.y * s) + ph);
    fx = fx - k * s * sn;   //  dP/dy
    fy = fy + k * c * sn;   // -dP/dx
  }
  return vec2<f32>(fx, fy);
}

// n-fold rose / mandala: kp angular petals crossed with concentric rings,
// swirled so the petals rotate instead of collapsing inward.
fn fieldRose(q: vec2<f32>, kp: f32, scl: f32, ph: f32) -> vec2<f32> {
  let r  = max(length(q), 0.06);
  let th = atan2(q.y, q.x);
  let m  = 3.0 * scl;
  let ang = kp * th + ph;
  let vr = -(kp / r) * sin(ang) * cos(m * r);   // (1/r) dP/dth
  let vt =  m * cos(ang) * sin(m * r);          // -dP/dr
  let ct = cos(th);
  let st = sin(th);
  return vec2<f32>(vr * ct - vt * st, vr * st + vt * ct);
}

// Golden / logarithmic spiral: constant-pitch orbit-and-drift with a
// golden-angle azimuthal ripple, so Fibonacci-count arms emerge.
fn fieldSpiral(q: vec2<f32>, ph: f32) -> vec2<f32> {
  let r  = max(length(q), 0.04);
  let th = atan2(q.y, q.x);
  let b  = 0.16;                       // outward pitch (0 = pure rotation)
  let golden = 2.39996323;             // 137.507 deg in radians
  let swirl = 1.0 + 0.30 * cos((TAU_F / golden) * th - 6.0 * sqrt(r) + ph);
  let ct = cos(th);
  let st = sin(th);
  return vec2<f32>(swirl * (-st) + b * ct, swirl * ct + b * st);
}

// Three-wave interference (soft moire): curl of a cos-sum with arbitrary,
// non-symmetric wavevectors drifting at different speeds.
fn fieldWaves(q: vec2<f32>, scl: f32, ph: f32) -> vec2<f32> {
  let k = 2.6 * scl;
  let a1 = k * ( 0.95 * q.x + 0.31 * q.y) + ph;
  let a2 = k * (-0.41 * q.x + 0.91 * q.y) - ph * 0.8;
  let a3 = k * ( 0.59 * q.x - 0.81 * q.y) + ph * 0.6;
  // fx = -sum(ky*sin) ; fy = sum(kx*sin)   (ky = k*dir.y, kx = k*dir.x)
  let fx = -k * (0.31 * sin(a1) + 0.91 * sin(a2) - 0.81 * sin(a3));
  let fy =  k * (0.95 * sin(a1) - 0.41 * sin(a2) + 0.59 * sin(a3));
  return vec2<f32>(fx, fy);
}

// Flower of Life: 7 overlapping circle-ripple sources (a hex of radius R plus
// the centre). curl of the summed ripples -> flow traces the vesica petals
// instead of draining into the seven centres.
fn fieldFlower(q: vec2<f32>, scl: f32, ph: f32) -> vec2<f32> {
  let w = 6.0 * scl;
  let R = 0.34;
  var gx = 0.0;
  var gy = 0.0;
  for (var i: u32 = 0u; i < 7u; i = i + 1u) {
    var cx = 0.0;
    var cy = 0.0;
    if (i > 0u) {
      let ang = (PI_F / 3.0) * f32(i - 1u);    // 60 deg steps
      cx = R * cos(ang);
      cy = R * sin(ang);
    }
    let dx = q.x - cx;
    let dy = q.y - cy;
    let rr = max(sqrt(dx * dx + dy * dy), 0.02);
    let g = -w * sin(w * (rr - R) + ph) / rr;  // dP/dr factored to unit radial
    gx = gx + g * dx;
    gy = gy + g * dy;
  }
  return vec2<f32>(gy, -gx);                    // curl
}

// Concentric ring pulse: curl of a radial standing wave -> counter-rotating
// rings that pulse outward as ph advances.
fn fieldRings(q: vec2<f32>, scl: f32, ph: f32) -> vec2<f32> {
  let r = max(length(q), 0.04);
  let m = 5.0 * scl;
  let g = -m * sin(m * r - ph) / r;
  return vec2<f32>(g * q.y, -g * q.x);          // curl of P(r)
}

// Dispatch: pattern id -> flow vector (roughly unit scale, divergence-free).
fn fieldAt(q: vec2<f32>, id: u32, scl: f32, ph: f32) -> vec2<f32> {
  switch (id) {
    case 0u: { return vec2<f32>(-q.y, q.x); }                  // single vortex
    case 1u: {                                                 // Taylor-Green grid
      let k = PI_F * scl;
      return vec2<f32>(-cos(k * q.x) * sin(k * q.y),
                        sin(k * q.x) * cos(k * q.y));
    }
    case 2u: { return fieldQuasi(q, 5u, scl, ph); }            // 5-fold quasicrystal
    case 3u: { return fieldQuasi(q, 7u, scl, ph); }            // 7-fold quasicrystal
    case 4u: { return fieldRose(q, 5.0, scl, ph); }            // rose mandala
    case 5u: { return fieldSpiral(q, ph); }                    // golden spiral
    case 6u: {                                                 // Lissajous curl
      let a = 3.0 * scl;
      let b = 2.0 * scl;
      return vec2<f32>( b * sin(a * q.x + ph) * cos(b * q.y),
                       -a * cos(a * q.x + ph) * sin(b * q.y));
    }
    case 7u: { return fieldWaves(q, scl, ph); }                // wave interference
    case 8u: { return fieldFlower(q, scl, ph); }               // flower of life
    case 9u: { return fieldRings(q, scl, ph); }                // concentric rings
    default: { return vec2<f32>(0.0, 0.0); }
  }
}

// Normalize, or return zero in the rare dead spot where a crossfade of two
// opposing flows cancels. Keeps the conductor force a constant magnitude.
fn fieldUnit(v: vec2<f32>) -> vec2<f32> {
  let l = length(v);
  if (l > 1e-4) { return v / l; }
  return vec2<f32>(0.0, 0.0);
}

@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.N) { return; }

  let me = particlesIn[i];
  var pos = me.xy;
  var vel = me.zw;
  let myColor = colors[i];

  let cellMe = cellOf(pos);
  var totalForce = vec2<f32>(0.0, 0.0);

  let rMax = params.rMax;
  let invR = 1.0 / rMax;
  let rMax2 = rMax * rMax;
  let cxN = i32(params.cellsX);
  let cyN = i32(params.cellsY);
  let world = vec2<f32>(params.worldW, params.worldH);
  let looping = params.looping == 1u;

  // Walk the 3x3 cell neighborhood. On a torus we wrap cell indices;
  // on a bounded world we skip cells that fall outside the grid.
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      var nx = cellMe.x + dx;
      var ny = cellMe.y + dy;
      if (looping) {
        nx = wrapCell(nx, cxN);
        ny = wrapCell(ny, cyN);
      } else {
        if (nx < 0 || nx >= cxN || ny < 0 || ny >= cyN) { continue; }
      }
      let nc = vec2<i32>(nx, ny);
      let nIdx = cellIdx(nc);
      // Contiguous run of this cell's particles in the sorted array.
      let start = cellStart[nIdx];
      let end = cellStart[nIdx + 1u];

      for (var s: u32 = start; s < end; s = s + 1u) {
        let e = sorted[s];               // (pos.xy, color, originalIndex)
        let j = u32(e.w);
        if (j == i) { continue; }
        var delta = e.xy - pos;
        if (looping) { delta = minImage(delta, world); }
        let d2 = dot(delta, delta);
        if (d2 > rMax2 || d2 < 1e-6) { continue; }
        let dist = sqrt(d2);
        let dn = dist * invR;
        let a = matrix[myColor * params.K + u32(e.z)];
        let f = forceFn(dn, a, params.beta, params.repel);
        totalForce = totalForce + (delta / dist) * f;
      }
    }
  }

  // ---------- Pointer interaction (vortex + advection field) ----------
  // The cursor is modeled as a low-frequency disturbance in a fluid, not
  // a hard attractor. Inside its radius, a particle feels the SUM of
  // four small forces, all enveloped by params.pointerForce in [0, 1]:
  //
  //   1. ADVECTION  -- particles drift in the direction the cursor is
  //                    moving (params.pointerVx, params.pointerVy).
  //                    This is the "drag the medium with you" feel and
  //                    it is the largest term whenever the cursor is in
  //                    motion. When the cursor is still, it goes to 0.
  //   2. SWIRL      -- a tangential force perpendicular to (pos -> ptr).
  //                    Particles orbit the cursor instead of collapsing
  //                    into it. The sign creates a coherent vortex.
  //   3. SOFT PULL  -- a very mild radial attractor that fades to zero
  //                    AT the center (not peaks there, like the old code
  //                    did). Just enough to keep particles in the field
  //                    long enough to swirl, never enough to clump them.
  //   4. REPEL MODE -- when params.pointerMode == 1, the swirl/pull/
  //                    advection terms are suppressed and replaced with
  //                    a smooth outward shockwave. Used by shift-drag.
  //
  // The radial weight w is a smooth bell, peaked midway through the
  // radius and tapering to zero at BOTH endpoints. That is what kills
  // the old "yank to a point" feel -- there is literally no force at
  // d=0 to pull anything to a single spot.
  let pCenter = vec2<f32>(params.pointerX, params.pointerY);
  var toPtr = pCenter - pos;
  if (looping) { toPtr = minImage(toPtr, world); }
  let pd = length(toPtr);
  let pR = params.pointerRadius;
  if (pd < pR && pd > 0.5 && params.pointerForce > 0.001) {
    // Bell-shaped radial weight: rises from 0 at the very center,
    // peaks at ~40% of radius, falls to 0 at the rim.
    //   - inner ramp:  smoothstep(0, 0.40*R, d)  -- kills center pile-up
    //   - outer ramp:  1 - smoothstep(0.40*R, R, d) -- gentle outer fade
    // Multiplied together, plus a tiny envelope curve so quick taps
    // are felt instead of nothing.
    let dn      = pd / pR;                                  // 0..1
    let inRamp  = smoothstep(0.0, 0.40, dn);
    let outRamp = 1.0 - smoothstep(0.40, 1.0, dn);
    let w       = inRamp * outRamp;                         // bell, peak ~0.4
    let env     = params.pointerForce;                      // 0..1

    // Unit vector from particle TO pointer; perpendicular gives a
    // counter-clockwise tangent. We use (-toPtr.y, toPtr.x) / pd.
    let toUnit  = toPtr / pd;
    let tanUnit = vec2<f32>(-toUnit.y, toUnit.x);

    if (params.pointerMode == 0u) {
      // ---- Swirl + advection mode (default drag) ----
      //
      // Tunables -- kept inline so the WGSL is a single source of truth
      // for the cursor feel. The relative ratios matter more than the
      // absolutes; pull is the smallest, swirl is the dominant rotational
      // term, advection scales with cursor speed. Sized so that at peak
      // bell weight (w ~= 1) and full envelope, the pointer dominates
      // the local species forces -- you should clearly feel the cursor
      // as a force of nature on the medium, not just a soft brush.
      let kSwirl   = 9.0;        // tangential rotation strength
      let kPull    = 3.0;        // mild radial pull (vanishes at center)
      let kAdvect  = 0.012;      // scales pointer-velocity (px/s -> force units)

      // Pointer velocity vector. Its magnitude lives in px/s; we cap
      // it so a frantic flick doesn't dump unbounded energy into the
      // field (which would make particles fly clear off-screen).
      let pVel = vec2<f32>(params.pointerVx, params.pointerVy);
      let pSpeed = length(pVel);
      let speedCap = 6000.0;      // px/s, ~very fast drag
      let pVelClamped = select(
        pVel * (speedCap / max(pSpeed, 1.0)),
        pVel,
        pSpeed < speedCap
      );

      // Speed-modulated swirl: when the cursor is moving, the vortex
      // gets stronger, which makes whipping motions feel kinetic. A
      // floor of 0.7 keeps the swirl alive when the cursor is parked,
      // and the ceiling of ~3.5 means a fast drag triples the rotation.
      let speedBoost = 0.7 + min(pSpeed / 1200.0, 2.8);

      // Compose the three force components and add them in. All are
      // gated by w (the bell) and env (press envelope) so they fade
      // gracefully on press / release and never kick the simulation
      // discontinuously.
      var pf = vec2<f32>(0.0, 0.0);
      pf = pf + tanUnit * (kSwirl * speedBoost * w * env);
      pf = pf + toUnit  * (kPull             * w * env);
      pf = pf + pVelClamped * (kAdvect       * w * env);

      totalForce = totalForce + pf;
    } else {
      // ---- Repel / shockwave mode (shift-drag) ----
      //
      // Pure outward push, sharper bell so the wave has a defined
      // edge. No advection here — the goal is "push everything away
      // from this spot" and adding velocity drag would muddy the
      // shockwave silhouette. The profile is full-strength at the
      // center (so a stationary repel digs out a clean cavity) and
      // smoothly tapers to zero at the rim.
      let kPush = 18.0;
      let pushW = 1.0 - smoothstep(0.0, 1.0, dn);  // 1 at center, 0 at rim
      totalForce = totalForce - toUnit * (kPush * pushW * env);
    }
  }

  // ---------- Rogue field (morphing geometric conductor) ----------
  // A gentle, divergence-free flow added on top of the species + pointer
  // forces. It GUIDES the swarm without erasing its own life: at the default
  // strength it reads as a slow current, not a magnet. The loose channel
  // morphs pattern A -> B; with layers on, dense clusters instead follow
  // B -> C, blended per-particle by how packed this particle's grid cell is.
  if (params.fieldStrength > 0.001) {
    let center = world * 0.5;
    let Rv = max(1.0, 0.5 * min(world.x, world.y));
    let q = (pos - center) / Rv;
    let scl = params.fieldScale;
    let ph  = params.fieldPhase;
    // Normalize EACH pattern to a unit direction BEFORE crossfading. The
    // patterns differ wildly in raw magnitude (a flat vortex ~1, a rose
    // mandala ~76 near its centre); blending raw vectors would let the loud
    // pattern dominate the morph. Unit-first makes every pattern conduct with
    // equal authority, so alpha is an honest 50/50 directional blend. A JXA
    // harness confirmed the resulting dead-spot fraction is < 0.1%.
    // Loose layer crossfades looseFrom (A) -> looseTo (B) by alpha.
    let dLF = fieldUnit(fieldAt(q, params.fieldA, scl, ph));
    let dLT = fieldUnit(fieldAt(q, params.fieldB, scl, ph));
    let looseDir = fieldUnit(mix(dLF, dLT, params.fieldAlpha));
    var flow = looseDir;
    var strengthMul = 1.0;
    if (params.fieldLayers == 1u) {
      // Dense clusters ride a step ahead: their own crossfade denseFrom (C) ->
      // denseTo (D). Four independent ids so the morph works in EITHER
      // direction (Prev as well as Next); at rest C/D are the loose layer's
      // next shape, so two different patterns always coexist.
      let dDF = fieldUnit(fieldAt(q, params.fieldC, scl, ph));
      let dDT = fieldUnit(fieldAt(q, params.fieldD, scl, ph));
      let denseDir = fieldUnit(mix(dDF, dDT, params.fieldAlpha));
      let myCellI = cellIdx(cellMe);
      let myCount = f32(cellStart[myCellI + 1u] - cellStart[myCellI]);
      let densT = smoothstep(params.fieldDensLo, params.fieldDensHi, myCount);
      flow = mix(looseDir, denseDir, densT);
      // INTENSITY: dense particles feel a much stronger field (fieldDenseBoost),
      // so the tight clusters forcefully snap into their pattern while the loose
      // dust only drifts. This is what makes the two layers read as distinct.
      strengthMul = mix(1.0, params.fieldDenseBoost, densT);
    }
    totalForce = totalForce + fieldUnit(flow) * (params.fieldStrength * strengthMul);
  }

  // Bounded world: a soft repulsion in the margin near each edge keeps
  // particles inside without hard bounces. Skipped on a torus.
  if (!looping) {
    let margin = min(world.x, world.y) * 0.05;
    let wallStrength = 6.0;
    if (pos.x < margin)            { totalForce.x = totalForce.x + (margin - pos.x) / margin * wallStrength; }
    if (pos.x > world.x - margin)  { totalForce.x = totalForce.x - (pos.x - (world.x - margin)) / margin * wallStrength; }
    if (pos.y < margin)            { totalForce.y = totalForce.y + (margin - pos.y) / margin * wallStrength; }
    if (pos.y > world.y - margin)  { totalForce.y = totalForce.y - (pos.y - (world.y - margin)) / margin * wallStrength; }
  }

  // Symplectic-ish Euler: forces -> velocity -> friction -> position.
  vel = vel + totalForce * params.forceScale * params.dt;
  vel = vel * params.frictionMul;
  pos = pos + vel * params.dt;

  if (looping) {
    // Wrap position into [0, world). Two passes via floor handle big jumps.
    pos.x = pos.x - floor(pos.x / world.x) * world.x;
    pos.y = pos.y - floor(pos.y / world.y) * world.y;
  } else {
    // Hard backstop: clamp into bounds and zero outward velocity.
    if (pos.x < 0.0)      { pos.x = 0.0;      vel.x = max(vel.x, 0.0); }
    if (pos.x > world.x)  { pos.x = world.x;  vel.x = min(vel.x, 0.0); }
    if (pos.y < 0.0)      { pos.y = 0.0;      vel.y = max(vel.y, 0.0); }
    if (pos.y > world.y)  { pos.y = world.y;  vel.y = min(vel.y, 0.0); }
  }

  particlesOut[i] = vec4<f32>(pos, vel);
}
`;

  var WGSL_RENDER = /* wgsl */`
struct Params {
  N: u32,
  K: u32,
  cellsX: u32,
  cellsY: u32,
  worldW: f32,
  worldH: f32,
  rMax: f32,
  cellSize: f32,
  beta: f32,
  forceScale: f32,
  frictionMul: f32,
  dt: f32,
  pointerX: f32,
  pointerY: f32,
  pointerForce: f32,
  pointerRadius: f32,
  maxPerCell: u32,
  particleSize: f32,
  brightness: f32,
  repel: f32,
  looping: u32,
  pointerVx: f32,
  pointerVy: f32,
  pointerMode: u32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> colors: array<u32>;
@group(0) @binding(3) var<uniform> palette: array<vec4<f32>, 15>;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
}

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @builtin(instance_index) iid: u32) -> VOut {
  let p = particles[iid];
  let r = params.particleSize;
  let world = p.xy + corner * r;
  // Convert world (px) to clip space [-1, 1], y flipped.
  let clip = vec2<f32>(
    (world.x / params.worldW) * 2.0 - 1.0,
    1.0 - (world.y / params.worldH) * 2.0
  );
  var out: VOut;
  out.pos = vec4<f32>(clip, 0.0, 1.0);
  out.uv  = corner;
  let cIdx = colors[iid];
  out.color = palette[cIdx].xyz;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  // Crisp dot: solid core out to ~70% of the radius, then a quick
  // anti-aliased falloff to zero. Gives a sharp particle with a faint
  // glow rim, instead of the previous gaussian smear.
  let edge = smoothstep(1.0, 0.49, r2);
  let a    = edge;
  let rgb  = in.color * a * params.brightness;
  return vec4<f32>(rgb, a);
}
`;

  /* ---------- Glow pass ----------
     Same instanced quads as the main render pass, but each quad is
     enlarged by GLOW_SCALE so the soft halo extends well beyond the
     sharp particle. The fragment is a fast gaussian-ish falloff
     (exp(-6 r^2) / 64) which sums beautifully under additive blending
     into the HDR target. No discard: the falloff is naturally tiny at
     the corners of the quad. */
  var WGSL_GLOW = /* wgsl */`
struct Params {
  N: u32,
  K: u32,
  cellsX: u32,
  cellsY: u32,
  worldW: f32,
  worldH: f32,
  rMax: f32,
  cellSize: f32,
  beta: f32,
  forceScale: f32,
  frictionMul: f32,
  dt: f32,
  pointerX: f32,
  pointerY: f32,
  pointerForce: f32,
  pointerRadius: f32,
  maxPerCell: u32,
  particleSize: f32,
  brightness: f32,
  repel: f32,
  looping: u32,
  pointerVx: f32,
  pointerVy: f32,
  pointerMode: u32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> colors: array<u32>;
@group(0) @binding(3) var<uniform> palette: array<vec4<f32>, 15>;

const GLOW_SCALE: f32 = 6.0;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
}

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @builtin(instance_index) iid: u32) -> VOut {
  let p = particles[iid];
  let r = params.particleSize * GLOW_SCALE;
  let world = p.xy + corner * r;
  let clip = vec2<f32>(
    (world.x / params.worldW) * 2.0 - 1.0,
    1.0 - (world.y / params.worldH) * 2.0
  );
  var out: VOut;
  out.pos = vec4<f32>(clip, 0.0, 1.0);
  // uv is the corner in [-1,1] of the enlarged quad; r in shader space
  // already covers the whole halo footprint, so pass uv straight through.
  out.uv  = corner;
  let cIdx = colors[iid];
  out.color = palette[cIdx].xyz;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Soft gaussian-ish falloff, normalized so a single particle's halo
  // is dim and only dense overlapping clusters glow brightly.
  let g   = exp(-6.0 * r2) / 64.0;
  let rgb = in.color * g * params.brightness;
  return vec4<f32>(rgb, g);
}
`;

  /* ---------- Composite pass ----------
     Full-screen triangle. Samples the HDR target, applies the
     Narkowicz ACES tonemap to compress highlights into [0,1], and
     adds a tiny hash-based dither so the dark glow gradients don't
     band on 8-bit displays. Background tint matches the previous
     near-black so the canvas reads consistently. */
  var WGSL_COMPOSITE = /* wgsl */`
@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var hdrSamp: sampler;
@group(0) @binding(2) var glowTex: texture_2d<f32>;
@group(0) @binding(3) var glowSamp: sampler;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

// Single triangle that covers the whole screen. Vertex 0..2:
//   ( -1, -1 ), ( 3, -1 ), ( -1, 3 )
// The third vertex is intentionally outside [-1,1] so the rasterizer
// fills the entire viewport with one primitive.
@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VOut {
  let xy = vec2<f32>(
    f32((vid << 1u) & 2u) * 2.0 - 1.0,
    f32(vid & 2u) * 2.0 - 1.0
  );
  var out: VOut;
  out.pos = vec4<f32>(xy.x, xy.y, 0.0, 1.0);
  // Flip Y so uv.y == 0 at top of screen, matching texture sample.
  out.uv  = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

// Narkowicz ACES approximation. Cheap, 5 madds, looks great.
fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Cheap pseudo-noise dither in [-0.5, 0.5] / 255. Hides 8-bit banding
// in the dim halo gradients without being visible on its own.
fn dither(p: vec2<f32>) -> f32 {
  let n = fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  return (n - 0.5) / 255.0;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  // Sharp particle cores (full-res, nearest) + soft halo (half-res glow,
  // linear-upsampled) summed in HDR before the tonemap, exactly as the old
  // single additive target did -- only the glow is now cheaper to produce.
  let sharp = textureSample(hdrTex, hdrSamp, in.uv).rgb;
  let glow  = textureSample(glowTex, glowSamp, in.uv).rgb;
  // Subtle background tint matches the old clear color so empty
  // regions don't read as pure black against the page background.
  let bg  = vec3<f32>(0.020, 0.020, 0.028);
  let lit = aces(sharp + glow + bg);
  let d   = vec3<f32>(dither(in.pos.xy));
  return vec4<f32>(lit + d, 1.0);
}
`;

})();
