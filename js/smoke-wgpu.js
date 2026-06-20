/*
 * smoke-wgpu.js — WebGPU port of the SmokeFluid WebGL fluid simulation.
 *
 * Companion to liquid-wgpu.js. The game's smoke is a Pavel-Dobryakov-style
 * 2D fluid sim (advection / pressure-projection / vorticity confinement),
 * historically run as WebGL fragment-shader passes (the SmokeFluid module
 * inside sluice.js). Running WebGPU (the liquid sim) and WebGL
 * (the smoke sim) in the same frame forces the browser to serialise the
 * two graphics backends — that cross-backend friction is what keeps the
 * frame from pipelining. Porting the smoke to WebGPU makes the whole
 * frame single-API (WebGPU + the Canvas2D main canvas) and removes it,
 * and it puts the smoke on the same GPU-compute footing as the water.
 *
 * SHARED DEVICE: this module never calls requestAdapter / requestDevice.
 * It borrows the GPUDevice that liquid-wgpu.js already created, so the
 * whole game runs on ONE WebGPU device. create(opts) takes opts.liquid
 * (the LiquidWGPU instance) and chains off its readyPromise.
 *
 * Built in stages, mirroring the liquid port. STAGE 1: the module
 * skeleton, shared-device acquisition, and the simulation textures.
 * STAGE 2: the seven core fluid-sim passes ported to WGSL render
 * pipelines (curl, vorticity, divergence, clear, pressure,
 * gradientSubtract, advection) plus a step(dt) chain that runs them in
 * the WebGL SmokeFluid step() order.
 * STAGE 3: the force/dye injection (splat) and the on-screen shading
 * pass (display) ported to WGSL, plus the WebGPU output canvas.
 * splat() runs two additive aspect-corrected Gaussian passes (velocity
 * then dye); displayPass() renders the dye through the no-shading
 * display shader onto a detached <canvas> with a 'webgpu' context
 * (premultiplied-over blend), mirroring liquid-wgpu.js's
 * liquidWGPUCanvas.
 * STAGE 4: the scroll (world-lock) pass ported to WGSL. scroll(dx,dy)
 * shifts the velocity + dye fields by a UV offset when the camera pans
 * so the smoke stays world-anchored, reading transparent-black
 * off-domain. Like the WebGL scroll it negates Y, is a no-op when both
 * offsets are 0, and aborts (skips) when either offset magnitude
 * exceeds ~1.5 (a big jump is treated as a teleport and the field
 * flashes clear).
 * STAGE 5 (this commit): the obstacle system. A separate rgba8unorm
 * mask texture (alpha > 0.5 = solid) the smoke physically collides
 * with. setObstacleAlpha(canvas) uploads a Canvas2D silhouette via
 * copyExternalImageToTexture (the desktop path); paintObstacleQuads()
 * rasterises NDC triangles straight into the mask through a WGSL quad
 * pipeline (the mobile path, zero cross-context upload); clearObstacle()
 * disables it. The obstacle reads are wired back into advection,
 * gradientSubtract and the display pass — a solid cell holds no smoke
 * and shows no dye. The output canvas is still NOT inserted into the
 * DOM (the go-live stage does that). The module remains DORMANT —
 * nothing in the game calls step() / splat() / displayPass() /
 * scroll() / setObstacleAlpha() yet, the WebGL SmokeFluid keeps driving
 * until the port goes live (a later stage). If WebGPU is unavailable
 * the instance simply reports available=false and the game keeps its
 * WebGL smoke (then SPH-lite).
 */
(function () {
  'use strict';

  var STAGE = 5;

  /* ---- Texture formats — mirror the WebGL SmokeFluid FBOs ------------
   * velocity carries (dx,dy); dye carries (r,g,b,a); pressure, divergence
   * and curl are single-channel scalar fields; obstacle is an 8-bit mask
   * (alpha > 0.5 = solid). The WebGL sim stored these as F16 via the
   * OES/EXT half-float extensions; WebGPU's *16float formats are natively
   * renderable AND filterable, so the extension dance disappears and the
   * shader math runs at f32 (a precision upgrade).
   * -------------------------------------------------------------------- */
  var FMT_VELOCITY = 'rg16float';
  var FMT_DYE      = 'rgba16float';
  var FMT_SCALAR   = 'r16float';      // pressure / divergence / curl
  var FMT_OBSTACLE = 'rgba8unorm';

  // Default sim / dye resolutions until the game drives resize() with the
  // real per-device figures (mobile 96/256, desktop 160/384-672).
  var DEFAULT_SIM_W = 160, DEFAULT_SIM_H = 96;
  var DEFAULT_DYE_W = 512, DEFAULT_DYE_H = 288;

  // Default size of the Stage-3 WebGPU output canvas (the display target).
  // A placeholder until the game resizes it to the smoke domain's device-
  // pixel size when the port goes live; matches the dye aspect.
  var DEFAULT_RENDER_W = 1280, DEFAULT_RENDER_H = 720;

  /* ---- Simulation constants — mirror the WebGL SmokeFluid config -----
   * These are the per-step tunables the fluid solver reads. The names /
   * values track the WebGL SmokeFluid `config` object (PRESSURE,
   * PRESSURE_ITERATIONS, CURL, *_DISSIPATION, SPLAT_RADIUS). Each
   * instance gets its own copy on instance.config so the game can tweak
   * it later without touching this template. SIM_RESOLUTION /
   * DYE_RESOLUTION live in the WebGL config too but here the resolution
   * is driven by resize().
   * -------------------------------------------------------------------- */
  function defaultConfig() {
    return {
      DENSITY_DISSIPATION: 1.6,
      VELOCITY_DISSIPATION: 0.4,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 25,
      CURL: 26,
      // Default splat radius (Stage 3) — splat() divides by 100 then
      // aspect-corrects, exactly as the WebGL SmokeFluid splat().
      SPLAT_RADIUS: 0.22
    };
  }

  // Make a texture usable as a render-pass target AND sampled in a shader.
  function mkTex(device, label, w, h, format, extraUsage) {
    return device.createTexture({
      label: label,
      size: { width: Math.max(1, w | 0), height: Math.max(1, h | 0) },
      format: format,
      usage: GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.RENDER_ATTACHMENT |
             (extraUsage || 0)
    });
  }

  // A ping-pong pair — read() is sampled, write() is the render target,
  // swap() flips them. Mirrors the WebGL createDoubleFBO read/write/swap.
  function mkPingPong(device, label, w, h, format, extraUsage) {
    var a = mkTex(device, label + '.a', w, h, format, extraUsage);
    var b = mkTex(device, label + '.b', w, h, format, extraUsage);
    var pp = { _a: a, _b: b, _flip: false, w: w | 0, h: h | 0, format: format };
    pp.read  = function () { return pp._flip ? pp._b : pp._a; };
    pp.write = function () { return pp._flip ? pp._a : pp._b; };
    pp.swap  = function () { pp._flip = !pp._flip; };
    pp.destroy = function () {
      try { a.destroy(); } catch (_) {}
      try { b.destroy(); } catch (_) {}
    };
    return pp;
  }

  /* ---- Texture allocation --------------------------------------------
   * velocity / dye / pressure are ping-pong (double-buffered); divergence
   * and curl are single (written once, read once per step). velocity /
   * pressure / divergence / curl live at the sim resolution; dye lives at
   * the (higher) dye resolution. The obstacle mask is NOT built here — it
   * has its own resolution (the game's obstacle canvas / quad size, not
   * the sim grid) and must survive a sim resize, so ensureObstacleTex()
   * manages it separately (see Stage 5).
   * -------------------------------------------------------------------- */
  function buildTextures(instance, simW, simH, dyeW, dyeH) {
    var dev = instance.device;
    destroyTextures(instance);
    instance.simW = simW | 0; instance.simH = simH | 0;
    instance.dyeW = dyeW | 0; instance.dyeH = dyeH | 0;
    instance.tex = {
      velocity:   mkPingPong(dev, 'smoke.velocity',   simW, simH, FMT_VELOCITY),
      dye:        mkPingPong(dev, 'smoke.dye',        dyeW, dyeH, FMT_DYE),
      pressure:   mkPingPong(dev, 'smoke.pressure',   simW, simH, FMT_SCALAR),
      divergence: mkTex(dev,      'smoke.divergence', simW, simH, FMT_SCALAR),
      curl:       mkTex(dev,      'smoke.curl',       simW, simH, FMT_SCALAR)
    };
    instance.texturesReady = true;
  }

  function destroyTextures(instance) {
    var t = instance.tex;
    if (!t) return;
    try { t.velocity.destroy(); }   catch (_) {}
    try { t.dye.destroy(); }        catch (_) {}
    try { t.pressure.destroy(); }   catch (_) {}
    try { t.divergence.destroy(); } catch (_) {}
    try { t.curl.destroy(); }       catch (_) {}
    instance.tex = null;
    instance.texturesReady = false;
  }

  /* ==== WGSL shaders — faithful ports of the WebGL SmokeFluid GLSL =====
   * Each fragment shader is a near line-for-line port of its GLSL twin
   * in sluice.js (CURL_FS, VORTICITY_FS, ...). Differences:
   *   - The GLSL vertex shader (BASE_VS) precomputes the 4 neighbour UVs
   *     (vL/vR/vT/vB) as varyings. WGSL recomputes them in the fragment
   *     shader from vUv +/- texelSize — bit-identical, no extra varyings.
   *   - The math runs at f32 (GLSL was mediump/highp) — a precision
   *     upgrade, harmless.
   *   - The obstacle (uObstacle) reads in ADVECTION / GRADIENT_SUBTRACT /
   *     DISPLAY are wired in (Stage 5): a solid mask cell (alpha > 0.5)
   *     zeroes the smoke there. Every shader that samples the obstacle
   *     uses textureSampleLevel (explicit LOD) throughout — the obstacle
   *     early-out is a non-uniform branch, and the auto-LOD textureSample
   *     is forbidden after non-uniform control flow. u_wind_x is kept as
   *     a uniform but the game will pass 0 until wind is wired.
   *
   * HARD RULE: never put a backtick anywhere in these strings — the WGSL
   * lives inside a JS backtick template literal and a stray backtick
   * terminates it. Plain-ASCII // comments only.
   * ==================================================================== */

  // Fullscreen-triangle vertex shader. No vertex buffer — three clip-space
  // corners are generated from @builtin(vertex_index) in {0,1,2}. vUv is
  // Y-up in [0,1] to match the WebGL BASE_VS (vUv = aPosition*0.5+0.5).
  var WGSL_FULLSCREEN_VS = /* wgsl */ `
struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       vUv : vec2<f32>,
};
@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VOut {
  // vid 0 -> (0,0)  1 -> (2,0)  2 -> (0,2)  in uv space; the triangle
  // overshoots the [0,1] square so it covers the whole clip volume.
  var uv = vec2<f32>(f32((vid << 1u) & 2u), f32(vid & 2u));
  var out : VOut;
  out.vUv = uv;
  // uv 0..2 -> clip -1..3. uv.y is kept Y-up (uv.y 0 at clip y -1).
  out.pos = vec4<f32>(uv * 2.0 - vec2<f32>(1.0, 1.0), 0.0, 1.0);
  return out;
}
`;

  // --- curl — port of CURL_FS. Scalar vorticity field from velocity. ---
  var WGSL_CURL_FS = /* wgsl */ `
struct U { texelSize : vec2<f32> };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uVelocity : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var vL = vUv - vec2<f32>(u.texelSize.x, 0.0);
  var vR = vUv + vec2<f32>(u.texelSize.x, 0.0);
  var vT = vUv + vec2<f32>(0.0, u.texelSize.y);
  var vB = vUv - vec2<f32>(0.0, u.texelSize.y);
  var L = textureSample(uVelocity, samp, vL).y;
  var R = textureSample(uVelocity, samp, vR).y;
  var T = textureSample(uVelocity, samp, vT).x;
  var B = textureSample(uVelocity, samp, vB).x;
  var vorticity = R - L - T + B;
  return vec4<f32>(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

  // --- vorticity — port of VORTICITY_FS. Vorticity-confinement force. --
  var WGSL_VORTICITY_FS = /* wgsl */ `
struct U {
  texelSize : vec2<f32>,
  curl      : f32,
  dt        : f32,
};
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uVelocity : texture_2d<f32>;
@group(0) @binding(3) var uCurl     : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var vL = vUv - vec2<f32>(u.texelSize.x, 0.0);
  var vR = vUv + vec2<f32>(u.texelSize.x, 0.0);
  var vT = vUv + vec2<f32>(0.0, u.texelSize.y);
  var vB = vUv - vec2<f32>(0.0, u.texelSize.y);
  var L = textureSample(uCurl, samp, vL).x;
  var R = textureSample(uCurl, samp, vR).x;
  var T = textureSample(uCurl, samp, vT).x;
  var B = textureSample(uCurl, samp, vB).x;
  var C = textureSample(uCurl, samp, vUv).x;
  var force = 0.5 * vec2<f32>(abs(T) - abs(B), abs(R) - abs(L));
  force = force / (length(force) + 0.0001);
  force = force * (u.curl * C);
  force.y = force.y * -1.0;
  var velocity = textureSample(uVelocity, samp, vUv).xy;
  velocity = velocity + force * u.dt;
  velocity = min(max(velocity, vec2<f32>(-1000.0)), vec2<f32>(1000.0));
  return vec4<f32>(velocity, 0.0, 1.0);
}
`;

  // --- divergence — port of DIVERGENCE_FS. Velocity-field divergence. --
  var WGSL_DIVERGENCE_FS = /* wgsl */ `
struct U { texelSize : vec2<f32> };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uVelocity : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var vL = vUv - vec2<f32>(u.texelSize.x, 0.0);
  var vR = vUv + vec2<f32>(u.texelSize.x, 0.0);
  var vT = vUv + vec2<f32>(0.0, u.texelSize.y);
  var vB = vUv - vec2<f32>(0.0, u.texelSize.y);
  var L = textureSample(uVelocity, samp, vL).x;
  var R = textureSample(uVelocity, samp, vR).x;
  var T = textureSample(uVelocity, samp, vT).y;
  var B = textureSample(uVelocity, samp, vB).y;
  var C = textureSample(uVelocity, samp, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  var divv = 0.5 * (R - L + T - B);
  return vec4<f32>(divv, 0.0, 0.0, 1.0);
}
`;

  // --- clear — port of CLEAR_FS. Multiply a field by a scalar; used as
  //     the per-step pressure decay (value = config.PRESSURE clamped). --
  var WGSL_CLEAR_FS = /* wgsl */ `
struct U { value : f32 };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uTexture : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  return u.value * textureSample(uTexture, samp, vUv);
}
`;

  // --- pressure — port of PRESSURE_FS. One Jacobi pressure iteration. --
  var WGSL_PRESSURE_FS = /* wgsl */ `
struct U { texelSize : vec2<f32> };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uPressure   : texture_2d<f32>;
@group(0) @binding(3) var uDivergence : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var vL = vUv - vec2<f32>(u.texelSize.x, 0.0);
  var vR = vUv + vec2<f32>(u.texelSize.x, 0.0);
  var vT = vUv + vec2<f32>(0.0, u.texelSize.y);
  var vB = vUv - vec2<f32>(0.0, u.texelSize.y);
  var L = textureSample(uPressure, samp, vL).x;
  var R = textureSample(uPressure, samp, vR).x;
  var T = textureSample(uPressure, samp, vT).x;
  var B = textureSample(uPressure, samp, vB).x;
  var divergence = textureSample(uDivergence, samp, vUv).x;
  var pressure = (L + R + B + T - divergence) * 0.25;
  return vec4<f32>(pressure, 0.0, 0.0, 1.0);
}
`;

  // --- gradientSubtract — port of GRADIENT_SUBTRACT_FS. Subtract the
  //     pressure gradient from velocity (the projection step). The
  //     uObstacle early-out (Stage 5) zeroes velocity inside solid
  //     cells; every read is textureSampleLevel since that branch makes
  //     the rest of the shader non-uniform control flow. ----------------
  var WGSL_GRADIENT_SUBTRACT_FS = /* wgsl */ `
struct U {
  texelSize   : vec2<f32>,
  useObstacle : f32,
};
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uPressure : texture_2d<f32>;
@group(0) @binding(3) var uVelocity : texture_2d<f32>;
@group(0) @binding(4) var uObstacle : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  if (u.useObstacle > 0.5 && textureSampleLevel(uObstacle, samp, vUv, 0.0).a > 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  var vL = vUv - vec2<f32>(u.texelSize.x, 0.0);
  var vR = vUv + vec2<f32>(u.texelSize.x, 0.0);
  var vT = vUv + vec2<f32>(0.0, u.texelSize.y);
  var vB = vUv - vec2<f32>(0.0, u.texelSize.y);
  var L = textureSampleLevel(uPressure, samp, vL, 0.0).x;
  var R = textureSampleLevel(uPressure, samp, vR, 0.0).x;
  var T = textureSampleLevel(uPressure, samp, vT, 0.0).x;
  var B = textureSampleLevel(uPressure, samp, vB, 0.0).x;
  var velocity = textureSampleLevel(uVelocity, samp, vUv, 0.0).xy;
  velocity = velocity - vec2<f32>(R - L, T - B);
  velocity = min(max(velocity, vec2<f32>(-1000.0)), vec2<f32>(1000.0));
  return vec4<f32>(velocity, 0.0, 1.0);
}
`;

  // --- advection — port of ADVECTION_FS. Semi-Lagrangian advection with
  //     dissipation decay. The uObstacle early-out (Stage 5) zeroes the
  //     advected field inside solid cells; the wind drift is kept
  //     (u_wind_x defaults to 0). *16float textures are natively
  //     filterable, so the GLSL MANUAL_FILTERING bilerp path is unused —
  //     this is the linear-sampler branch. Every texture read is
  //     textureSampleLevel: the obstacle early-out is a non-uniform
  //     branch and the auto-LOD textureSample is illegal after it. ------
  var WGSL_ADVECTION_FS = /* wgsl */ `
struct U {
  texelSize    : vec2<f32>,
  dt           : f32,
  dissipation  : f32,
  windX        : f32,
  windAboveY   : f32,
  useObstacle  : f32,
};
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uVelocity : texture_2d<f32>;
@group(0) @binding(3) var uSource   : texture_2d<f32>;
@group(0) @binding(4) var uObstacle : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  if (u.useObstacle > 0.5 && textureSampleLevel(uObstacle, samp, vUv, 0.0).a > 0.5) {
    return vec4<f32>(0.0);
  }
  var windDrift = 0.0;
  if (vUv.y >= u.windAboveY) { windDrift = u.dt * u.windX; }
  var coord = vUv - u.dt * textureSampleLevel(uVelocity, samp, vUv, 0.0).xy * u.texelSize
              - vec2<f32>(windDrift, 0.0);
  var result = textureSampleLevel(uSource, samp, coord, 0.0);
  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
    return vec4<f32>(0.0);
  }
  var decay = 1.0 + u.dissipation * u.dt;
  return result / decay;
}
`;

  // --- splat — port of SPLAT_FS. Additive aspect-corrected Gaussian
  //     injection: reads the target field, adds an exp(-dot(p,p)/radius)
  //     blob of `color`, writes the sum. Run once into velocity (color =
  //     dx,dy,0) then once into dye (color = r,g,b). The WebGL splat ran
  //     with BLEND disabled and did the read+add in-shader — the WGSL
  //     pass clears its target and does the same (uTarget IS the field's
  //     read() texture, so base + splat == the additive accumulate). The
  //     aspect / radius math is precomputed on the JS side (splat()) and
  //     arrives here as the final `aspectRatio` + `radius` uniforms. ----
  var WGSL_SPLAT_FS = /* wgsl */ `
struct U {
  point       : vec2<f32>,
  color       : vec3<f32>,
  aspectRatio : f32,
  radius      : f32,
};
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uTarget : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var p = vUv - u.point;
  p.x = p.x * u.aspectRatio;
  var splat = exp(-dot(p, p) / u.radius) * u.color;
  var base = textureSample(uTarget, samp, vUv).xyz;
  return vec4<f32>(base + splat, 1.0);
}
`;

  // --- display — port of DISPLAY_FS, no-SHADING path. A straight dye
  //     read; the canvas alpha is max(r,g,b) so the smoke composites
  //     premultiplied-over against the page (the displayPass blend is
  //     ONE / ONE_MINUS_SRC_ALPHA, matching the WebGL displayPass). The
  //     SHADING normal-estimate branch is omitted (the game runs SHADING
  //     off on desktop). The obstacle cutout (Stage 5) zeroes alpha
  //     inside solid cells so no smoke shows there. --------------------
  var WGSL_DISPLAY_FS = /* wgsl */ `
struct U { useObstacle : f32 };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uTexture  : texture_2d<f32>;
@group(0) @binding(3) var uObstacle : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var c = textureSampleLevel(uTexture, samp, vUv, 0.0).rgb;
  var a = max(c.r, max(c.g, c.b));
  if (u.useObstacle > 0.5 && textureSampleLevel(uObstacle, samp, vUv, 0.0).a > 0.5) {
    a = 0.0;
  }
  return vec4<f32>(c, a);
}
`;

  // --- scroll — port of SCROLL_FS. World-lock shift: sample uTexture at
  //     vUv + offset; any uv component outside [0,1] returns transparent
  //     black (the field shifts and the freshly-exposed edge is empty).
  //     Run once on dye then once on velocity by scroll(). Uniform: an
  //     offset vec2. ----------------------------------------------------
  var WGSL_SCROLL_FS = /* wgsl */ `
struct U { offset : vec2<f32> };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var uTexture : texture_2d<f32>;
@fragment
fn fs(@location(0) vUv : vec2<f32>) -> @location(0) vec4<f32> {
  var uv = vUv + u.offset;
  // textureSampleLevel (explicit LOD) — textureSample's auto-LOD needs
  // uniform control flow, but the off-domain test below branches first.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4<f32>(0.0);
  }
  return textureSampleLevel(uTexture, samp, uv, 0.0);
}
`;

  // --- obstacle quad — the mobile paintObstacleQuads() path. A plain
  //     vertex-buffer pipeline (NDC vec2 verts, no bind group) that
  //     rasterises solid white (alpha = 1 = solid) triangles into the
  //     obstacle mask. Port of the WebGL OBS_QUAD_VS / OBS_QUAD_FS pair.
  //     The game has already flipped Y into the verts, so the vertex
  //     stage is a straight clip-space pass-through. --------------------
  var WGSL_OBSTACLE_QUAD = /* wgsl */ `
@vertex
fn vs(@location(0) pos : vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(pos, 0.0, 1.0);
}
@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}
`;

  /* ---- Pipeline + uniform infrastructure -----------------------------
   * One GPURenderPipeline per pass. Every pass shares the fullscreen-
   * triangle vertex shader and the same draw(3) call; they differ only
   * in their fragment shader, target format, and uniform layout.
   *
   * Each pass owns a small uniform buffer (16-byte aligned, padded to a
   * multiple of 16). The bind group is rebuilt per runPass() call so the
   * sampled textures can be the live ping-pong read() targets.
   * -------------------------------------------------------------------- */

  // A linear-filtering, clamp-to-edge sampler — mirrors the WebGL FBOs'
  // LINEAR / CLAMP_TO_EDGE params (advection bilinear-samples; clamp
  // keeps off-domain reads from wrapping).
  function buildSampler(device) {
    return device.createSampler({
      label: 'smoke.linearSampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  // Build one render pipeline for a pass. `texCount` sampled textures are
  // declared at bindings 2..(2+texCount-1); binding 0 is the uniform,
  // binding 1 the sampler. The fragment target uses `format`. `blend` is
  // an optional GPUBlendState — omitted for the fluid passes (they
  // overwrite their target), supplied for the display pass (premultiplied
  // over). The fluid passes always declare a binding-0 uniform; the
  // display pass needs no uniform but keeps the slot (a tiny dummy buffer
  // is bound) so it can share runPass-style bind-group plumbing.
  function buildPassPipeline(device, label, fsCode, texCount, format, blend) {
    var entries = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
    ];
    var t;
    for (t = 0; t < texCount; t++) {
      entries.push({
        binding: 2 + t,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' }
      });
    }
    var bgl = device.createBindGroupLayout({ label: label + '.bgl', entries: entries });
    var vsMod = device.createShaderModule({ label: label + '.vs', code: WGSL_FULLSCREEN_VS });
    var fsMod = device.createShaderModule({ label: label + '.fs', code: fsCode });
    var target = { format: format };
    if (blend) target.blend = blend;
    var pipeline = device.createRenderPipeline({
      label: label + '.pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: vsMod, entryPoint: 'vs' },
      fragment: { module: fsMod, entryPoint: 'fs', targets: [target] },
      primitive: { topology: 'triangle-list' }
    });
    return { pipeline: pipeline, bgl: bgl, texCount: texCount };
  }

  // Allocate a uniform buffer of `floatCount` f32 lanes, padded so the
  // byte size is a multiple of 16 (WebGPU uniform-buffer requirement).
  function mkUniform(device, label, floatCount) {
    var bytes = floatCount * 4;
    bytes = Math.ceil(bytes / 16) * 16;
    return {
      buffer: device.createBuffer({
        label: label,
        size: bytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      host: new Float32Array(bytes / 4)
    };
  }

  /* ---- ensureObstacleTex(instance, w, h) -----------------------------
   * Lazily (re)allocate the obstacle mask texture at w x h. The obstacle
   * has its own resolution — the game's obstacle canvas (desktop) or
   * quad-paint size (mobile), NOT the sim grid — and must survive a sim
   * resize, so it lives outside instance.tex / buildTextures. A 1x1
   * transparent default is created at pipeline-build time so the
   * advection / gradientSubtract / display bind groups always have a
   * valid obstacle view even before the first paint; the first
   * setObstacleAlpha() / paintObstacleQuads() grows it to the real size.
   * Usage: TEXTURE_BINDING (sampled) + RENDER_ATTACHMENT (the quad-paint
   * pass; copyExternalImageToTexture also requires it) + COPY_DST (the
   * copyExternalImageToTexture upload).
   * -------------------------------------------------------------------- */
  function ensureObstacleTex(instance, w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    if (instance.obstacleTex && instance.obsW === w && instance.obsH === h) return;
    if (instance.obstacleTex) { try { instance.obstacleTex.destroy(); } catch (_) {} }
    instance.obstacleTex = mkTex(instance.device, 'smoke.obstacle', w, h,
                                 FMT_OBSTACLE, GPUTextureUsage.COPY_DST);
    instance.obsW = w;
    instance.obsH = h;
  }

  /* ---- buildRenderCanvas(instance) -----------------------------------
   * Stage 3 — create the WebGPU output canvas the display pass renders
   * into. A detached <canvas> (NOT inserted into the DOM — a later stage
   * does that, mirroring liquid-wgpu.js's liquidWGPUCanvas) with a
   * 'webgpu' context configured for the preferred canvas format +
   * premultiplied alpha. Sized to a sensible default; the game will
   * resize it when the smoke goes live. Stored on the instance as
   * renderCanvas / renderCtx / renderFormat. Returns true on success;
   * on failure leaves renderCanvas null and returns false (the display
   * pipeline build then skips and the module simply has no Stage-3
   * display path — Stages 1-2 are unaffected).
   * -------------------------------------------------------------------- */
  function buildRenderCanvas(instance) {
    if (typeof document === 'undefined' || !navigator || !navigator.gpu) return false;
    var cv = document.createElement('canvas');
    cv.width = DEFAULT_RENDER_W;
    cv.height = DEFAULT_RENDER_H;
    var ctx = cv.getContext('webgpu');
    if (!ctx) {
      try { console.log('SmokeWGPU Stage 3: webgpu canvas context unavailable — display skipped.'); } catch (_) {}
      return false;
    }
    var fmt = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: instance.device, format: fmt, alphaMode: 'premultiplied' });
    instance.renderCanvas = cv;
    instance.renderCtx = ctx;
    instance.renderFormat = fmt;
    return true;
  }

  /* ---- buildPipelines(instance) --------------------------------------
   * Builds the sampler, the seven fluid-pass pipelines, the Stage-3
   * splat + display pipelines, the output canvas, and one uniform buffer
   * per pass. Called once in create()'s device-ready handler, right
   * after buildTextures(). Throws on a WGSL compile / pipeline failure —
   * the caller wraps this in try/catch so device acquisition survives.
   * -------------------------------------------------------------------- */
  function buildPipelines(instance) {
    var dev = instance.device;
    instance.sampler = buildSampler(dev);
    // Stage 5 — the 1x1 transparent obstacle default, so the obstacle
    // bind-group slots are always valid (useObstacle stays 0 until the
    // first real paint grows it). Sampled with the shared linear sampler.
    ensureObstacleTex(instance, 1, 1);

    // texCount per pass: curl reads velocity (1); vorticity reads
    // velocity + curl (2); divergence reads velocity (1); clear reads
    // one texture (1); pressure reads pressure + divergence (2);
    // gradientSubtract reads pressure + velocity + obstacle (3);
    // advection reads velocity + source + obstacle (3).
    instance.pipes = {
      curl:       buildPassPipeline(dev, 'smoke.curl',     WGSL_CURL_FS,              1, FMT_SCALAR),
      vorticity:  buildPassPipeline(dev, 'smoke.vort',     WGSL_VORTICITY_FS,         2, FMT_VELOCITY),
      divergence: buildPassPipeline(dev, 'smoke.div',      WGSL_DIVERGENCE_FS,        1, FMT_SCALAR),
      // clear runs on pressure (r16float) here — its only step() use is
      // the pressure decay multiply.
      clear:      buildPassPipeline(dev, 'smoke.clear',    WGSL_CLEAR_FS,             1, FMT_SCALAR),
      pressure:   buildPassPipeline(dev, 'smoke.press',    WGSL_PRESSURE_FS,          2, FMT_SCALAR),
      gradient:   buildPassPipeline(dev, 'smoke.grad',     WGSL_GRADIENT_SUBTRACT_FS, 3, FMT_VELOCITY),
      // advection is run twice per step — on velocity (rg16float) and on
      // dye (rgba16float). A pipeline's fragment target format is fixed,
      // so we build one pipeline per output format and pick at step().
      advectVel:  buildPassPipeline(dev, 'smoke.advV',     WGSL_ADVECTION_FS,         3, FMT_VELOCITY),
      advectDye:  buildPassPipeline(dev, 'smoke.advD',     WGSL_ADVECTION_FS,         3, FMT_DYE),
      // Stage 3 — splat is run twice per splat() call (once into velocity,
      // once into dye); one pipeline per output format, same as advection.
      // It reads one texture (uTarget) and overwrites its target, so no
      // blend — the additive accumulate happens in-shader.
      splatVel:   buildPassPipeline(dev, 'smoke.splatV',   WGSL_SPLAT_FS,             1, FMT_VELOCITY),
      splatDye:   buildPassPipeline(dev, 'smoke.splatD',   WGSL_SPLAT_FS,             1, FMT_DYE),
      // Stage 4 — scroll is run twice per scroll() call (once on dye, once
      // on velocity); one pipeline per output format, same as advection /
      // splat. It reads one texture (uTexture) and overwrites its target.
      scrollVel:  buildPassPipeline(dev, 'smoke.scrollV',  WGSL_SCROLL_FS,            1, FMT_VELOCITY),
      scrollDye:  buildPassPipeline(dev, 'smoke.scrollD',  WGSL_SCROLL_FS,            1, FMT_DYE)
    };

    // Uniform buffers — one per logical pass. Lane layouts (WGSL struct
    // alignment in parentheses — vec3 forces a 16B-aligned slot):
    //   curl       : texelSize.xy                       (2 -> pad 16B)
    //   vorticity  : texelSize.xy, curl, dt             (4 -> 16B)
    //   divergence : texelSize.xy                       (2 -> pad 16B)
    //   clear      : value                              (1 -> pad 16B)
    //   pressure   : texelSize.xy                       (2 -> pad 16B)
    //   gradient   : texelSize.xy, useObstacle           (3 -> pad 16B)
    //   advection  : texelSize.xy, dt, dissipation,
    //                windX, windAboveY, useObstacle      (7 -> pad 32B)
    //   splat      : point.xy @0, color.xyz @16,
    //                aspectRatio @28, radius @32        (struct 48B = 12 lanes)
    //   scroll     : offset.xy                          (2 -> pad 16B)
    instance.uniforms = {
      curl:       mkUniform(dev, 'smoke.u.curl',     2),
      vorticity:  mkUniform(dev, 'smoke.u.vort',     4),
      divergence: mkUniform(dev, 'smoke.u.div',      2),
      clear:      mkUniform(dev, 'smoke.u.clear',    1),
      pressure:   mkUniform(dev, 'smoke.u.press',    2),
      gradient:   mkUniform(dev, 'smoke.u.grad',     3),
      // advection is run twice per step with different uniforms — give
      // the velocity and dye passes separate uniform buffers so a single
      // command encoder can carry both without a mid-encode overwrite.
      advectVel:  mkUniform(dev, 'smoke.u.advV',     7),
      advectDye:  mkUniform(dev, 'smoke.u.advD',     7),
      // splat is run twice per splat() call (velocity then dye) with
      // different colour — separate buffers so one encoder carries both.
      // 12 lanes covers the vec3-padded 48-byte struct.
      splatVel:   mkUniform(dev, 'smoke.u.splatV',   12),
      splatDye:   mkUniform(dev, 'smoke.u.splatD',   12),
      // scroll is run twice per scroll() call (dye then velocity) with the
      // SAME offset — but separate buffers so one encoder carries both
      // passes without a mid-encode overwrite (matches splat / advection).
      scrollVel:  mkUniform(dev, 'smoke.u.scrollV',  2),
      scrollDye:  mkUniform(dev, 'smoke.u.scrollD',  2)
    };

    // Stage 5 — the obstacle-quad pipeline (the mobile paintObstacleQuads
    // path). Unlike the fluid passes it takes a real vertex buffer of NDC
    // triangle verts and has no bind group; it just rasterises solid
    // white (alpha = 1) into the obstacle mask. 'auto' layout — there are
    // no bindings to declare.
    var obsQuadMod = dev.createShaderModule({
      label: 'smoke.obsQuad.mod', code: WGSL_OBSTACLE_QUAD });
    instance.obstacleQuadPipeline = dev.createRenderPipeline({
      label: 'smoke.obsQuad.pipeline',
      layout: 'auto',
      vertex: {
        module: obsQuadMod, entryPoint: 'vs',
        buffers: [{
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
        }]
      },
      fragment: {
        module: obsQuadMod, entryPoint: 'fs',
        targets: [{ format: FMT_OBSTACLE }]
      },
      primitive: { topology: 'triangle-list' }
    });

    // Stage 3 — the WebGPU output canvas + the display pipeline. The
    // display pipeline's fragment target format is the preferred canvas
    // format, so the canvas must exist first. If the canvas build fails
    // (no document / no webgpu context) the display path is simply
    // absent — the fluid pipelines above stay good, step() still runs.
    if (buildRenderCanvas(instance)) {
      // Premultiplied-over blend — matches the WebGL displayPass()
      // gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA) over a premultiplied-
      // alpha canvas. The display shader outputs vec4(c, max(c.rgb)),
      // i.e. premultiplied colour (c already plays the role of rgb*a-ish
      // glow), so the colour factor is 'one'.
      var displayBlend = {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      };
      // texCount 2 — display samples the dye (uTexture) + the obstacle
      // mask (uObstacle, Stage 5).
      instance.pipes.display = buildPassPipeline(
        dev, 'smoke.display', WGSL_DISPLAY_FS, 2, instance.renderFormat, displayBlend);
      // The display shader's binding-0 uniform carries useObstacle (a
      // single f32 padded to 16B) — set per displayPass() call.
      instance.uniforms.display = mkUniform(dev, 'smoke.u.display', 1);
    }

    instance.pipelinesReady = true;
  }

  function destroyPipelines(instance) {
    var u = instance.uniforms;
    if (u) {
      try { u.curl.buffer.destroy(); }       catch (_) {}
      try { u.vorticity.buffer.destroy(); }  catch (_) {}
      try { u.divergence.buffer.destroy(); } catch (_) {}
      try { u.clear.buffer.destroy(); }      catch (_) {}
      try { u.pressure.buffer.destroy(); }   catch (_) {}
      try { u.gradient.buffer.destroy(); }   catch (_) {}
      try { u.advectVel.buffer.destroy(); }  catch (_) {}
      try { u.advectDye.buffer.destroy(); }  catch (_) {}
      try { if (u.splatVel) u.splatVel.buffer.destroy(); }   catch (_) {}
      try { if (u.splatDye) u.splatDye.buffer.destroy(); }   catch (_) {}
      try { if (u.scrollVel) u.scrollVel.buffer.destroy(); } catch (_) {}
      try { if (u.scrollDye) u.scrollDye.buffer.destroy(); } catch (_) {}
      try { if (u.display) u.display.buffer.destroy(); }     catch (_) {}
    }
    // Stage 5 — the obstacle mask texture + the quad-paint vertex buffer.
    if (instance.obstacleTex)     { try { instance.obstacleTex.destroy(); }     catch (_) {} }
    if (instance.obstacleQuadVBO) { try { instance.obstacleQuadVBO.destroy(); } catch (_) {} }
    instance.obstacleTex = null;
    instance.obstacleQuadVBO = null;
    instance.obstacleQuadPipeline = null;
    instance.obsW = 0; instance.obsH = 0;
    instance.obstacleActive = false;
    instance.obstacleQuadCap = 0;
    // Stage 3 — unconfigure the output canvas's webgpu context. The
    // detached <canvas> element itself is left for GC (it was never in
    // the DOM); a future stage that DOM-inserts it owns its removal.
    if (instance.renderCtx) {
      try { instance.renderCtx.unconfigure(); } catch (_) {}
    }
    instance.renderCanvas = null;
    instance.renderCtx = null;
    instance.renderFormat = null;
    instance.uniforms = null;
    instance.pipes = null;
    instance.sampler = null;
    instance.pipelinesReady = false;
  }

  /* ---- runPass(...) --------------------------------------------------
   * One fluid-sim pass: begin a render pass that draws the fullscreen
   * triangle into `targetTex`, sampling `srcTextures` (a list of
   * GPUTexture). `pass` is one of instance.pipes.*; `uniform` is the
   * matching instance.uniforms.* entry whose host array has already been
   * filled by the caller. `enc` is the shared command encoder for the
   * frame so every pass batches into one submit.
   *
   * The bind group is created fresh each call — the sampled textures are
   * the live ping-pong read() targets and change every swap().
   * -------------------------------------------------------------------- */
  function runPass(instance, enc, pass, uniform, srcTextures, targetTex) {
    var dev = instance.device;
    // Push the current uniform host data to the GPU.
    instance.queue.writeBuffer(uniform.buffer, 0, uniform.host);
    var entries = [
      { binding: 0, resource: { buffer: uniform.buffer } },
      { binding: 1, resource: instance.sampler }
    ];
    var i;
    for (i = 0; i < srcTextures.length; i++) {
      entries.push({ binding: 2 + i, resource: srcTextures[i].createView() });
    }
    var bg = dev.createBindGroup({ layout: pass.bgl, entries: entries });
    var rp = enc.beginRenderPass({
      label: 'smoke.pass',
      colorAttachments: [{
        view: targetTex.createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    rp.setPipeline(pass.pipeline);
    rp.setBindGroup(0, bg);
    rp.draw(3);
    rp.end();
  }

  /* ---- step(dt) ------------------------------------------------------
   * Runs the seven core fluid passes in the EXACT WebGL SmokeFluid
   * step() order:
   *   1. curl              -> curl texture
   *   2. vorticity         -> velocity (swap)
   *   3. divergence        -> divergence texture
   *   4. clear (decay)     -> pressure  (swap)   value = config.PRESSURE
   *   5. pressure x N      -> pressure  (swap each iteration)
   *   6. gradientSubtract  -> velocity  (swap)
   *   7. advect velocity   -> velocity  (swap)   dissipation = VELOCITY_*
   *   8. advect dye        -> dye       (swap)   dissipation = DENSITY_*
   * gradientSubtract + both advections read the obstacle mask (Stage 5);
   * curl / vorticity / divergence / clear / pressure do not. All passes
   * batch into one command encoder + one queue.submit(). Returns true if
   * it ran.
   * -------------------------------------------------------------------- */
  function step(instance, dt) {
    if (!instance.available || !instance.pipelinesReady || !instance.texturesReady) return false;
    if (!(dt > 0)) return false;

    var dev = instance.device;
    var cfg = instance.config;
    var tex = instance.tex;
    var pipes = instance.pipes;
    var uni = instance.uniforms;

    // velocity / pressure / divergence / curl live at the sim resolution;
    // texelSize is 1/res in each axis. With native *16float linear
    // filtering the WebGL sim uses the sim-velocity texelSize for every
    // pass (its dye-resolution dyeTexelSize is only fed in the no-linear
    // MANUAL_FILTERING fallback) — so one sim texel size covers all 8
    // passes here, dye advection included.
    var sTexX = 1.0 / Math.max(1, instance.simW);
    var sTexY = 1.0 / Math.max(1, instance.simH);

    // pressureDecay — config.PRESSURE clamped to [0, 0.99], exactly as
    // the WebGL step() does before the clear pass.
    var pressureDecay = cfg.PRESSURE;
    if (pressureDecay < 0) pressureDecay = 0;
    else if (pressureDecay > 0.99) pressureDecay = 0.99;

    // useObstacle — 1 once an obstacle mask has been painted (Stage 5).
    // The WebGL step() computes the same flag once and feeds it to
    // gradientSubtract + both advections; obsTex is always a valid
    // texture (the 1x1 transparent default until the first paint).
    var useObstacle = instance.obstacleActive ? 1.0 : 0.0;
    var obsTex = instance.obstacleTex;

    var enc = dev.createCommandEncoder({ label: 'smoke.step' });

    // 1. curl -> curl texture (samples velocity.read()).
    uni.curl.host[0] = sTexX;
    uni.curl.host[1] = sTexY;
    runPass(instance, enc, pipes.curl, uni.curl,
            [tex.velocity.read()], tex.curl);

    // 2. vorticity -> velocity.write() (samples velocity.read() + curl).
    uni.vorticity.host[0] = sTexX;
    uni.vorticity.host[1] = sTexY;
    uni.vorticity.host[2] = cfg.CURL;
    uni.vorticity.host[3] = dt;
    runPass(instance, enc, pipes.vorticity, uni.vorticity,
            [tex.velocity.read(), tex.curl], tex.velocity.write());
    tex.velocity.swap();

    // 3. divergence -> divergence texture (samples velocity.read()).
    uni.divergence.host[0] = sTexX;
    uni.divergence.host[1] = sTexY;
    runPass(instance, enc, pipes.divergence, uni.divergence,
            [tex.velocity.read()], tex.divergence);

    // 4. clear (pressure decay) -> pressure.write() (samples pressure.read()).
    uni.clear.host[0] = pressureDecay;
    runPass(instance, enc, pipes.clear, uni.clear,
            [tex.pressure.read()], tex.pressure.write());
    tex.pressure.swap();

    // 5. pressure x PRESSURE_ITERATIONS — each iteration samples the
    //    latest pressure.read() + divergence, writes pressure.write().
    var iters = cfg.PRESSURE_ITERATIONS | 0;
    uni.pressure.host[0] = sTexX;
    uni.pressure.host[1] = sTexY;
    var i;
    for (i = 0; i < iters; i++) {
      runPass(instance, enc, pipes.pressure, uni.pressure,
              [tex.pressure.read(), tex.divergence], tex.pressure.write());
      tex.pressure.swap();
    }

    // 6. gradientSubtract -> velocity.write() (samples pressure.read() +
    //    velocity.read()).
    uni.gradient.host[0] = sTexX;
    uni.gradient.host[1] = sTexY;
    uni.gradient.host[2] = useObstacle;
    runPass(instance, enc, pipes.gradient, uni.gradient,
            [tex.pressure.read(), tex.velocity.read(), obsTex], tex.velocity.write());
    tex.velocity.swap();

    // 7. advect velocity -> velocity.write(). uSource == uVelocity here
    //    (the field advects itself). texelSize is the sim texel; no wind
    //    on the velocity pass (keeps the pressure solve clean).
    uni.advectVel.host[0] = sTexX;
    uni.advectVel.host[1] = sTexY;
    uni.advectVel.host[2] = dt;
    uni.advectVel.host[3] = cfg.VELOCITY_DISSIPATION;
    uni.advectVel.host[4] = 0.0;   // windX
    uni.advectVel.host[5] = 0.0;   // windAboveY
    uni.advectVel.host[6] = useObstacle;
    runPass(instance, enc, pipes.advectVel, uni.advectVel,
            [tex.velocity.read(), tex.velocity.read(), obsTex], tex.velocity.write());
    tex.velocity.swap();

    // 8. advect dye -> dye.write(). uVelocity is the sim velocity,
    //    uSource is the dye field. With native linear filtering the
    //    WebGL sim uses the velocity texelSize for the velocity lookup
    //    (the MANUAL_FILTERING dyeTexelSize path is unused) — so a
    //    single texelSize uniform is correct. Wind defaults to 0 until
    //    the game wires it.
    uni.advectDye.host[0] = sTexX;
    uni.advectDye.host[1] = sTexY;
    uni.advectDye.host[2] = dt;
    uni.advectDye.host[3] = cfg.DENSITY_DISSIPATION;
    uni.advectDye.host[4] = cfg.wind_x || 0.0;
    uni.advectDye.host[5] = (cfg.wind_above_y != null) ? cfg.wind_above_y : 0.0;
    uni.advectDye.host[6] = useObstacle;
    runPass(instance, enc, pipes.advectDye, uni.advectDye,
            [tex.velocity.read(), tex.dye.read(), obsTex], tex.dye.write());
    tex.dye.swap();

    instance.queue.submit([enc.finish()]);
    return true;
  }

  /* ---- clear(instance) -----------------------------------------------
   * Port of the WebGL SmokeFluid clear(): zero every field (dye,
   * velocity, pressure) so a fresh run does not inherit the previous
   * run's smoke. The game calls this on restart / win. Re-allocating the
   * sim textures is the cleanest zero — a freshly created WebGPU texture
   * is guaranteed zero-initialised, and the next step()/displayPass()
   * builds its bind groups against the new textures anyway.
   * -------------------------------------------------------------------- */
  function clear(instance) {
    if (!instance.available || !instance.texturesReady) return false;
    try {
      buildTextures(instance, instance.simW, instance.simH,
                    instance.dyeW, instance.dyeH);
    } catch (e) {
      try { console.warn('SmokeWGPU: clear failed — ' + ((e && e.message) || e)); } catch (_) {}
      return false;
    }
    return true;
  }

  /* ---- correctRadius(r, aspect) --------------------------------------
   * Faithful port of the WebGL SmokeFluid correctRadius helper: a wide
   * (landscape) viewport stretches the splat radius by the aspect so the
   * Gaussian stays round on screen. Tall viewports leave it alone.
   * -------------------------------------------------------------------- */
  function correctRadius(r, aspect) {
    if (aspect > 1) r = r * aspect;
    return r;
  }

  /* ---- splat(instance, uvX, uvY, dx, dy, color, splatRadius) ---------
   * Port of the WebGL SmokeFluid splat(): inject a force impulse + a dye
   * blob at (uvX,uvY) in [0,1] UV space. Two additive Gaussian passes —
   * once into velocity (splat rgb = dx,dy,0) then once into dye (splat
   * rgb = color.r,g,b) — each followed by a ping-pong swap(). The WGSL
   * SPLAT_FS reads the target field and adds exp(-dot(p,p)/radius)*color,
   * so each pass accumulates onto the live read() texture.
   *
   * Radius handling mirrors the WebGL path exactly: rad defaults to
   * config.SPLAT_RADIUS, is divided by 100, then correctRadius-stretched
   * by the output-canvas aspect. `color` is { r, g, b }. `splatRadius`
   * is optional. Both passes batch into one command encoder + submit.
   * Returns true if a splat ran.
   * -------------------------------------------------------------------- */
  function splat(instance, uvX, uvY, dx, dy, color, splatRadius) {
    if (!instance.available || !instance.pipelinesReady || !instance.texturesReady) return false;
    var dev = instance.device;
    var pipes = instance.pipes;
    var uni = instance.uniforms;
    var tex = instance.tex;

    // Aspect of the display target — the WebGL splat used the GL canvas's
    // width/height; the WebGPU equivalent is the output canvas. Fall back
    // to the dye aspect (then 1) if the canvas is not built.
    var aspect = 1.0;
    if (instance.renderCanvas && instance.renderCanvas.height > 0) {
      aspect = instance.renderCanvas.width / instance.renderCanvas.height;
    } else if (instance.dyeH > 0) {
      aspect = instance.dyeW / instance.dyeH;
    }
    if (!(aspect > 0)) aspect = 1.0;

    // rad -> /100 -> correctRadius, exactly as the WebGL splat().
    var rad = (splatRadius != null) ? splatRadius : instance.config.SPLAT_RADIUS;
    if (rad == null) rad = 0.22;   // WebGL config default
    var radius = correctRadius(rad / 100.0, aspect);

    var enc = dev.createCommandEncoder({ label: 'smoke.splat' });

    // Pass 1 — velocity. splat colour carries the force vector (dx,dy,0).
    // Host lanes: point.xy @0/1, color.xyz @4/5/6, aspectRatio @7,
    // radius @8 (vec3 forces color to a 16-byte slot — lanes 2/3 pad).
    var hv = uni.splatVel.host;
    hv[0] = uvX;    hv[1] = uvY;
    hv[4] = dx;     hv[5] = dy;     hv[6] = 0.0;
    hv[7] = aspect; hv[8] = radius;
    runPass(instance, enc, pipes.splatVel, uni.splatVel,
            [tex.velocity.read()], tex.velocity.write());
    tex.velocity.swap();

    // Pass 2 — dye. splat colour carries the dye colour.
    var hd = uni.splatDye.host;
    hd[0] = uvX;        hd[1] = uvY;
    hd[4] = color.r;    hd[5] = color.g;    hd[6] = color.b;
    hd[7] = aspect;     hd[8] = radius;
    runPass(instance, enc, pipes.splatDye, uni.splatDye,
            [tex.dye.read()], tex.dye.write());
    tex.dye.swap();

    instance.queue.submit([enc.finish()]);
    return true;
  }

  /* ---- scroll(instance, dxCamFrac, dyCamFrac) ------------------------
   * Port of the WebGL SmokeFluid scroll(): the world-lock pass. When the
   * camera pans, the smoke field is shifted by the same UV fraction so
   * the smoke stays anchored to the world rather than the screen. The
   * WGSL SCROLL_FS samples the field at vUv + offset and returns
   * transparent black off-domain — the freshly-exposed edge is empty.
   *
   * Faithful to the WebGL scroll():
   *   - no-op when BOTH dxCamFrac and dyCamFrac are 0;
   *   - aborts (skips entirely) when EITHER magnitude exceeds 1.5 — a
   *     jump that big is a teleport, so the field is left to flash clear
   *     rather than scrolled by a meaningless amount;
   *   - the Y offset is negated (oy = -dyCamFrac) — the dye/velocity UV
   *     space is Y-up while camera-fraction Y runs the other way;
   *   - runs the scroll pass on the dye ping-pong then the velocity
   *     ping-pong, each followed by a swap().
   * Dye (rgba16float) and velocity (rg16float) are different formats and
   * a pipeline's target format is fixed, so there are two scroll
   * pipelines (scrollDye / scrollVel) — same split as advection / splat.
   * Both passes batch into one command encoder + submit. Returns true if
   * a scroll actually ran (false on no-op / teleport-abort / not ready).
   * -------------------------------------------------------------------- */
  function scroll(instance, dxCamFrac, dyCamFrac) {
    if (!instance.available || !instance.pipelinesReady || !instance.texturesReady) return false;
    // No-op when the camera did not move.
    if (!dxCamFrac && !dyCamFrac) return false;
    // Teleport — a jump this large is not a pan; let the field flash clear.
    if (Math.abs(dxCamFrac) > 1.5 || Math.abs(dyCamFrac) > 1.5) return false;

    var dev = instance.device;
    var pipes = instance.pipes;
    var uni = instance.uniforms;
    var tex = instance.tex;

    // ox/oy mirror the WebGL scroll(): X straight through, Y negated.
    var ox = dxCamFrac;
    var oy = -dyCamFrac;

    var enc = dev.createCommandEncoder({ label: 'smoke.scroll' });

    // Pass 1 — dye. Shift the dye field by (ox,oy); off-domain reads
    // transparent black.
    uni.scrollDye.host[0] = ox;
    uni.scrollDye.host[1] = oy;
    runPass(instance, enc, pipes.scrollDye, uni.scrollDye,
            [tex.dye.read()], tex.dye.write());
    tex.dye.swap();

    // Pass 2 — velocity. Same offset, separate uniform buffer so one
    // encoder carries both passes without a mid-encode overwrite.
    uni.scrollVel.host[0] = ox;
    uni.scrollVel.host[1] = oy;
    runPass(instance, enc, pipes.scrollVel, uni.scrollVel,
            [tex.velocity.read()], tex.velocity.write());
    tex.velocity.swap();

    instance.queue.submit([enc.finish()]);
    return true;
  }

  /* ---- displayPass(instance) -----------------------------------------
   * Port of the WebGL SmokeFluid displayPass(): render the current dye
   * field through the display shader onto the WebGPU output canvas. The
   * WGSL DISPLAY_FS is the no-SHADING path — a straight dye read with
   * alpha = max(r,g,b), zeroed inside obstacle cells (Stage 5). The
   * render pipeline's target uses premultiplied-
   * over blend (one / one-minus-src-alpha), matching the WebGL
   * displayPass gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA) over a
   * premultiplied-alpha canvas. The pass clears the canvas first (the
   * canvas would otherwise keep the previous frame).
   *
   * Runs in its own command encoder + submit. Returns true if it ran.
   * -------------------------------------------------------------------- */
  function displayPass(instance) {
    if (!instance.available || !instance.pipelinesReady || !instance.texturesReady) return false;
    if (!instance.renderCtx || !instance.pipes.display) return false;
    var dev = instance.device;
    var pass = instance.pipes.display;
    var uni = instance.uniforms.display;
    var tex = instance.tex;

    // The webgpu context's current texture is the canvas backbuffer.
    var view;
    try {
      view = instance.renderCtx.getCurrentTexture().createView();
    } catch (e) {
      return false;
    }

    // The display shader's binding-0 uniform carries useObstacle (Stage
    // 5) — 1 once an obstacle mask has been painted. binding 3 is the
    // obstacle mask itself (always a valid texture — the 1x1 default).
    uni.host[0] = instance.obstacleActive ? 1.0 : 0.0;
    instance.queue.writeBuffer(uni.buffer, 0, uni.host);
    var bg = dev.createBindGroup({
      label: 'smoke.display.bg',
      layout: pass.bgl,
      entries: [
        { binding: 0, resource: { buffer: uni.buffer } },
        { binding: 1, resource: instance.sampler },
        { binding: 2, resource: tex.dye.read().createView() },
        { binding: 3, resource: instance.obstacleTex.createView() }
      ]
    });

    var enc = dev.createCommandEncoder({ label: 'smoke.displayPass' });
    var rp = enc.beginRenderPass({
      label: 'smoke.display.rp',
      colorAttachments: [{
        view: view,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    rp.setPipeline(pass.pipeline);
    rp.setBindGroup(0, bg);
    rp.draw(3);
    rp.end();
    instance.queue.submit([enc.finish()]);
    return true;
  }

  /* ---- ensureObstacleQuadVBO(instance, floatCount) -------------------
   * Grow (to a power-of-two float capacity) the vertex buffer that
   * paintObstacleQuads() streams its NDC verts into. Returns the buffer.
   * -------------------------------------------------------------------- */
  function ensureObstacleQuadVBO(instance, floatCount) {
    var need = Math.max(2, floatCount | 0);
    if (instance.obstacleQuadVBO && instance.obstacleQuadCap >= need) {
      return instance.obstacleQuadVBO;
    }
    if (instance.obstacleQuadVBO) {
      try { instance.obstacleQuadVBO.destroy(); } catch (_) {}
    }
    var cap = 2;
    while (cap < need) cap = cap * 2;
    instance.obstacleQuadVBO = instance.device.createBuffer({
      label: 'smoke.obsQuad.vbo',
      size: cap * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    instance.obstacleQuadCap = cap;
    return instance.obstacleQuadVBO;
  }

  /* ---- paintObstacleQuads(instance, verts, vertCount, w, h) ----------
   * Port of the WebGL SmokeFluid paintObstacleQuads() — the mobile
   * obstacle path. `verts` is a Float32Array of NDC vec2 triangle verts
   * (the game has already Y-flipped them); `vertCount` is the vertex
   * count (3 per triangle). Sizes the obstacle mask to w x h, clears it,
   * and rasterises the triangles as solid (alpha = 1) through the
   * obstacle-quad pipeline. With 0 verts the mask is just cleared.
   * obstacleActive becomes true either way — an empty obstacle is still
   * "an obstacle pass is running", mirroring the WebGL path setting
   * obstacleSrcCanvas = obstacleFB. One command encoder + submit.
   * Returns true if it ran.
   * -------------------------------------------------------------------- */
  function paintObstacleQuads(instance, verts, vertCount, w, h) {
    if (!instance.available || !instance.pipelinesReady) return false;
    if (!instance.obstacleQuadPipeline) return false;
    vertCount = vertCount | 0;
    if (vertCount < 0) vertCount = 0;
    ensureObstacleTex(instance, w, h);
    instance.obstacleActive = true;
    var dev = instance.device;

    var hasVerts = vertCount > 0 && verts && verts.length >= vertCount * 2;
    if (hasVerts) {
      ensureObstacleQuadVBO(instance, vertCount * 2);
      instance.queue.writeBuffer(instance.obstacleQuadVBO, 0, verts, 0, vertCount * 2);
    }

    var enc = dev.createCommandEncoder({ label: 'smoke.obsQuad' });
    var rp = enc.beginRenderPass({
      label: 'smoke.obsQuad.rp',
      colorAttachments: [{
        view: instance.obstacleTex.createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    if (hasVerts) {
      rp.setPipeline(instance.obstacleQuadPipeline);
      rp.setVertexBuffer(0, instance.obstacleQuadVBO);
      rp.draw(vertCount);
    }
    rp.end();
    instance.queue.submit([enc.finish()]);
    return true;
  }

  /* ---- setObstacleAlpha(instance, srcCanvas) -------------------------
   * Port of the WebGL SmokeFluid setObstacleAlpha() — the desktop
   * obstacle path. Uploads `srcCanvas` (a Canvas2D silhouette whose
   * alpha channel is the solid mask) into the obstacle texture via
   * copyExternalImageToTexture, sizing the texture to the canvas. flipY
   * mirrors the WebGL UNPACK_FLIP_Y_WEBGL = true — the canvas is Y-down
   * while the dye/velocity UVs are Y-up. A null srcCanvas disables the
   * obstacle (matches the WebGL null branch). Returns true on success.
   * -------------------------------------------------------------------- */
  function setObstacleAlpha(instance, srcCanvas) {
    if (!instance.available || !instance.pipelinesReady) return false;
    if (!srcCanvas) { instance.obstacleActive = false; return true; }
    var w = srcCanvas.width | 0;
    var h = srcCanvas.height | 0;
    if (w < 1 || h < 1) { instance.obstacleActive = false; return false; }
    ensureObstacleTex(instance, w, h);
    try {
      instance.queue.copyExternalImageToTexture(
        { source: srcCanvas, flipY: true },
        { texture: instance.obstacleTex },
        { width: w, height: h });
    } catch (e) {
      try { console.warn('SmokeWGPU: setObstacleAlpha upload failed — ' +
        ((e && e.message) || e)); } catch (_) {}
      instance.obstacleActive = false;
      return false;
    }
    instance.obstacleActive = true;
    return true;
  }

  /* ---- clearObstacle(instance) ---------------------------------------
   * Port of the WebGL SmokeFluid clearObstacle(): drop the obstacle —
   * useObstacle goes 0 and the smoke stops colliding. The mask texture
   * is left allocated (the next paint reuses or resizes it).
   * -------------------------------------------------------------------- */
  function clearObstacle(instance) {
    instance.obstacleActive = false;
  }

  /* ---- runStage5SelfTest(instance) -----------------------------------
   * After all pipelines are built, exercise the full surface inside one
   * validation error scope: splat a test blob, paint a test obstacle
   * (the quad path), advance the fluid one step() so advection +
   * gradientSubtract run their obstacle reads, render via displayPass()
   * (the display obstacle cutout), scroll() the fields, then upload a
   * test obstacle canvas (the desktop setObstacleAlpha path) and step()
   * once more. Reports the result. Mirrors the liquid-wgpu.js per-stage
   * self-test + console.log style. Async (popErrorScope returns a
   * promise); called fire-and-forget from create() so it never blocks
   * device init.
   * -------------------------------------------------------------------- */
  function runStage5SelfTest(instance) {
    if (!instance.pipelinesReady) {
      try { console.log('SmokeWGPU Stage 5: pipelines unavailable — self-test skipped.'); } catch (_) {}
      return Promise.resolve(false);
    }
    var dev = instance.device;
    try { dev.pushErrorScope('validation'); } catch (_) {}
    var splatted = false, painted = false, stepped = false, displayed = false;
    var scrolled = false, uploaded = false, stepped2 = false;
    try {
      // Splat a test blob at the centre — a gentle upward force impulse
      // plus a mid-grey dye dab.
      splatted = splat(instance, 0.5, 0.5, 0.0, 80.0, { r: 0.3, g: 0.3, b: 0.3 });
      // Stage 5 — paint a test obstacle (one NDC triangle) so the step()
      // below exercises the advection + gradientSubtract obstacle reads,
      // and displayPass() the display cutout.
      painted = paintObstacleQuads(instance,
        new Float32Array([-0.6, -0.6,  0.6, -0.6,  0.0, 0.6]), 3, 64, 64);
      stepped = step(instance, 1 / 60);
      displayed = displayPass(instance);
      // Stage 4 — a small valid pan (well under the 1.5 teleport cap).
      scrolled = scroll(instance, 0.01, 0.01);
      // Stage 5 — also exercise the desktop copyExternalImageToTexture
      // upload path with a small Canvas2D obstacle silhouette.
      if (typeof document !== 'undefined') {
        var oc = document.createElement('canvas');
        oc.width = 48; oc.height = 32;
        var octx = oc.getContext('2d');
        if (octx) {
          octx.fillStyle = '#000';
          octx.fillRect(8, 8, 24, 16);
          uploaded = setObstacleAlpha(instance, oc);
        }
      }
      stepped2 = step(instance, 1 / 60);
      clearObstacle(instance);
    } catch (e) {
      try { console.log('SmokeWGPU Stage 5: self-test threw — ' + ((e && e.message) || e)); } catch (_) {}
    }
    return Promise.resolve(dev.popErrorScope ? dev.popErrorScope() : null)
      .then(function (err) {
        if (err) {
          try { console.log('SmokeWGPU Stage 5: self-test validation error — ' + (err.message || err)); } catch (_) {}
          return false;
        }
        var ok = splatted && painted && stepped && displayed && scrolled && uploaded && stepped2;
        try {
          if (ok) {
            console.log('SmokeWGPU Stage 5: obstacles ported — painted a test ' +
              'obstacle (quad path), ran step() + displayPass() with the ' +
              'obstacle reads live in advection / gradientSubtract / display, ' +
              'scrolled the fields, then uploaded a Canvas2D obstacle and ' +
              'stepped again clean. Dormant — WebGL smoke still driving.');
          } else {
            console.log('SmokeWGPU Stage 5: pipelines built — partial self-test ' +
              '(splat=' + splatted + ' paint=' + painted + ' step=' + stepped +
              ' display=' + displayed + ' scroll=' + scrolled + ' upload=' + uploaded +
              ' step2=' + stepped2 + '). Dormant.');
          }
        } catch (_) {}
        return ok;
      })
      .catch(function (e) {
        try { console.log('SmokeWGPU Stage 5: self-test error — ' + ((e && e.message) || e)); } catch (_) {}
        return false;
      });
  }

  /* ---- create(opts) --------------------------------------------------
   * opts.liquid              — the LiquidWGPU instance whose GPUDevice is
   *                            shared (REQUIRED; no liquid -> dormant).
   * opts.simW/simH/dyeW/dyeH — initial resolutions (optional; defaults
   *                            above; the game drives resize() later).
   *
   * Never throws — on any failure the instance reports available=false /
   * failed=true and the game keeps its WebGL SmokeFluid.
   * -------------------------------------------------------------------- */
  function create(opts) {
    opts = opts || {};
    var instance = {
      stage: STAGE,
      opts: opts,
      device: null,
      queue: null,
      deviceReady: false,     // shared device acquired
      available: false,       // WebGPU smoke usable
      failed: false,          // unrecoverable — WebGL smoke stays
      texturesReady: false,   // sim textures allocated
      pipelinesReady: false,  // Stage 2-5 — render pipelines built
      readyPromise: null,
      tex: null,
      sampler: null,          // shared linear sampler (Stage 2)
      pipes: null,            // per-pass render pipelines (Stage 2/3)
      uniforms: null,         // per-pass uniform buffers (Stage 2/3)
      renderCanvas: null,     // Stage 3 — webgpu output canvas (detached)
      renderCtx: null,        // Stage 3 — its 'webgpu' context
      renderFormat: null,     // Stage 3 — preferred canvas format
      config: defaultConfig(),// sim tunables — mirror the WebGL config
      simW: 0, simH: 0, dyeW: 0, dyeH: 0,
      // --- obstacle state (Stage 5) ---
      obstacleTex: null,          // the rgba8unorm obstacle mask texture
      obsW: 0, obsH: 0,           // its current resolution
      obstacleActive: false,      // useObstacle flag — has a mask been painted?
      obstacleQuadPipeline: null, // mobile paintObstacleQuads() pipeline
      obstacleQuadVBO: null,      // its streamed NDC-vert buffer
      obstacleQuadCap: 0,         // VBO capacity in f32 lanes
      // --- methods (Stage 1) ---
      // Re-allocate the sim textures at a new resolution. The game calls
      // this when the smoke domain / device-pixel size changes. The
      // pipelines are resolution-independent (texelSize is a uniform),
      // so a resize only rebuilds the textures.
      resize: function (simW, simH, dyeW, dyeH) {
        if (!instance.available || !instance.device) return;
        try {
          buildTextures(instance, simW, simH, dyeW, dyeH);
        } catch (e) {
          try { console.warn('SmokeWGPU: resize failed — ' + ((e && e.message) || e)); } catch (_) {}
        }
      },
      // --- methods (Stage 2) ---
      // Advance the fluid sim one step. Dormant for now — nothing in the
      // game calls this yet (the WebGL SmokeFluid still drives). Returns
      // true if a step actually ran.
      step: function (dt) { return step(instance, dt); },
      // Zero every field — the game calls this on restart / win.
      clear: function () { return clear(instance); },
      // --- methods (Stage 3) ---
      // Inject a force + dye blob at (uvX,uvY) in [0,1] UV space — two
      // additive Gaussian passes (velocity then dye). color is {r,g,b};
      // splatRadius optional. Dormant — nothing in the game calls this.
      splat: function (uvX, uvY, dx, dy, color, splatRadius) {
        return splat(instance, uvX, uvY, dx, dy, color, splatRadius);
      },
      // Render the current dye field to the webgpu output canvas
      // (instance.renderCanvas) through the display shader. Dormant —
      // a later stage DOM-inserts the canvas and drives this.
      displayPass: function () { return displayPass(instance); },
      // --- methods (Stage 4) ---
      // World-lock shift: when the camera pans by (dxCamFrac,dyCamFrac)
      // in UV fractions, shift the dye + velocity fields to match so the
      // smoke stays world-anchored. No-op if both are 0, aborts on a
      // teleport-sized jump. Dormant — nothing in the game calls this.
      scroll: function (dxCamFrac, dyCamFrac) {
        return scroll(instance, dxCamFrac, dyCamFrac);
      },
      // --- methods (Stage 5) ---
      // Obstacle mask — the smoke physically collides with solid cells.
      // setObstacleAlpha(canvas) uploads a Canvas2D silhouette (desktop);
      // paintObstacleQuads(verts,vertCount,w,h) rasterises NDC triangles
      // (mobile); clearObstacle() drops it. Dormant — nothing in the game
      // calls these yet. Named to match the WebGL SmokeFluid so the
      // go-live stage can route to either path without a shim.
      setObstacleAlpha: function (srcCanvas) {
        return setObstacleAlpha(instance, srcCanvas);
      },
      paintObstacleQuads: function (verts, vertCount, w, h) {
        return paintObstacleQuads(instance, verts, vertCount, w, h);
      },
      clearObstacle: function () { return clearObstacle(instance); },
      destroy: function () {
        destroyPipelines(instance);
        destroyTextures(instance);
      }
    };

    var liquid = opts.liquid;
    if (!liquid || !liquid.readyPromise) {
      // No liquid module to borrow a device from — stay dormant.
      instance.failed = true;
      instance.readyPromise = Promise.resolve(false);
      try { console.log('SmokeWGPU: no shared WebGPU device — WebGL smoke stays.'); } catch (_) {}
      return instance;
    }

    // Chain off the liquid module's device init. We test liquid.device +
    // liquid.available directly (not the resolved value) so this is robust
    // to whatever liquid's readyPromise resolves to.
    instance.readyPromise = liquid.readyPromise.then(function () {
      if (!liquid.device || !liquid.available) {
        instance.failed = true;
        try { console.log('SmokeWGPU: shared device unavailable — WebGL smoke stays.'); } catch (_) {}
        return false;
      }
      instance.device = liquid.device;
      instance.queue = liquid.device.queue;
      instance.deviceReady = true;
      instance.available = true;
      // A lost device drops the GPU smoke path too (the game falls back).
      try {
        liquid.device.lost.then(function (info) {
          instance.available = false;
          instance.failed = true;
          try { console.warn('SmokeWGPU: shared device lost —', info && info.message); } catch (_) {}
        });
      } catch (_) {}
      try {
        var sw = (opts.simW | 0) || DEFAULT_SIM_W;
        var sh = (opts.simH | 0) || DEFAULT_SIM_H;
        var dw = (opts.dyeW | 0) || DEFAULT_DYE_W;
        var dh = (opts.dyeH | 0) || DEFAULT_DYE_H;
        buildTextures(instance, sw, sh, dw, dh);
        try {
          console.log('SmokeWGPU Stage ' + STAGE + ': shared device acquired — sim ' +
            sw + 'x' + sh + ' / dye ' + dw + 'x' + dh +
            ' textures allocated (dormant, WebGL smoke still driving).');
        } catch (_) {}
      } catch (e) {
        instance.available = false;
        instance.failed = true;
        try { console.warn('SmokeWGPU Stage 1: texture build failed — ' + ((e && e.message) || e)); } catch (_) {}
        return false;
      }
      // Stage 2-5 — build the fluid-pass render pipelines, the Stage-3
      // splat + display pipelines + the webgpu output canvas, the
      // Stage-4 scroll pipelines, the Stage-5 obstacle-quad pipeline +
      // the 1x1 obstacle default, then self-test the whole surface.
      // Wrapped so a WGSL compile / pipeline failure cannot take down
      // device acquisition: on failure the textures stay (Stage 1 is
      // still good) but pipelinesReady stays false, so step() / splat()
      // / displayPass() / scroll() / setObstacleAlpha() are no-ops and
      // the game keeps its WebGL smoke. The self-test is fired and not
      // awaited — it must not block create()'s readyPromise.
      try {
        buildPipelines(instance);
        runStage5SelfTest(instance);
      } catch (e2) {
        instance.pipelinesReady = false;
        try { console.warn('SmokeWGPU Stage 5: pipeline build failed — ' + ((e2 && e2.message) || e2)); } catch (_) {}
      }
      return true;
    }).catch(function (e) {
      instance.available = false;
      instance.failed = true;
      try { console.warn('SmokeWGPU: init error — ' + ((e && e.message) || e)); } catch (_) {}
      return false;
    });

    return instance;
  }

  window.SmokeWGPU = { create: create, stage: STAGE };
})();
