# QCD Lava Lamp

Built October 3, 2026. The page is `qcd-lava-lamp-lab.html`, a comparison prototype listed in In Progress and excluded from the sitemap. It implements pure SU(3) Wilson lattice gauge theory with periodic boundaries, beta 6.0, and no quarks. The SU(2) solver is retained for numerical checks, not presented as QCD. All production density comes from the gauge ensemble.

## Files and running

- `qcd-lava-lamp-lab.html`, `qcd-lava-lamp.css`: site shell and local presentation.
- `js/qcd-lava-lamp.js`: standalone host, canvas, controls and animation loop.
- `js/qcd-lava-lamp-room.js`: Descent room and GPU lattice driver.
- `js/qcd-lava-lamp-shaders.js`: heatbath, cooling, observables, slice and volume shaders.
- `js/qcd-lava-lamp-math.js`: independent f64 CPU reference.
- `tools/test-qcd-lava-lamp-numerics.mjs`, `tools/test-qcd-lava-lamp-browser.cjs`: numerical and browser harnesses.
- `assets/visualizer/qcd-lava-lamp/`: actual simulation screenshots, saved fallback, provenance and machine-readable checks.

Serve the repository through HTTP on localhost. Open `/qcd-lava-lamp-lab.html`. A secure context and WebGPU are required for live sampling. `?quality=low|medium|high&seed=5eedc0de1234abcd` selects 8^4, 12^4 or 16^4 and a 64-bit hexadecimal seed. Medium defaults to 12^4 after measuring all three sizes. Restart applies the chosen seed and size, preserving manual pause.

```sh
node tools/test-qcd-lava-lamp-numerics.mjs --spike
NODE_PATH=/path/to/playwright/node_modules node tools/test-qcd-lava-lamp-browser.cjs --bench
```

The harness owns an HTTP server and the separate `/Users/ethan/.local/bin/agent-chrome-for-testing` browser, closing both in `finally`. No personal Chrome process is launched. `--bench` regenerates performance evidence; a normal browser run retains that evidence and reruns correctness, layout and lifecycle checks.

## Ensemble and heatbath derivation

Links are row-major complex matrices, with four positive directions at each site. The Wilson action and six forward/backward staples use the orientations in the supplied prompt. For one link the variable part of the action is `-(beta/Nc) ReTr(U V†)`. Tests replace one link and compare this expression with a complete plaquette sum.

Write the SU(2) quaternion as `a0 I + i(a1 sigma1 + a2 sigma2 + a3 sigma3)`. Its matrix is `[[a0+i a3, a2+i a1], [-a2+i a1, a0-i a3]]`. With this convention quaternion multiplication has a negative vector cross product.

For left multiplication of rows i,j, form `K = U V†`. Its relevant block projects onto the quaternion

```text
k0 = Re(Kii + Kjj)/2
k1 = Im(Kij + Kji)/2
k2 = Re(Kij - Kji)/2
k3 = Im(Kii - Kjj)/2
```

If `A` is that quaternion matrix and `r = |k|`, then the variable weight is `exp[(2 beta/Nc) r t0]` for `R = T A†/r`. The updated link is `R U`. Zero r uses an arbitrary identity orientation and a Haar draw. The SU(3) solver cycles (0,1), (0,2), (1,2) once per link. These are exact conditional SU(2) heatbaths in exact arithmetic; the composition is a Cabibbo-Marinari sweep, not a direct independent Haar-weighted draw of the whole SU(3) link.

The radial Haar factor is `sqrt(1-t0^2)`. For alpha >= 1, invert the truncated exponential with `t0 = 1 + log(u + (1-u) exp(-2 alpha))/alpha`, then accept when `v^2 <= 1-t0^2`. For alpha < 1, use a uniform proposal on [-1,1] and accept when `v^2 <= (1-t0^2) exp[2 alpha (t0-1)]`. This branch avoids subtractive loss at small alpha and preserves the Boltzmann factor. After acceptance, draw a uniform direction on S^2. This is the Creutz rejection method, described in [Johnson, section III B](https://arxiv.org/pdf/1003.3219); the subgroup construction is also covered in [Lüscher's lectures](https://luscher.web.cern.ch/luscher/lectures/LesHouches09.pdf).

Each direction and checkerboard parity has its own dispatch/pass. Other same-direction links in its staples are at opposite parity. Simultaneous links therefore do not read changing staples. CPU sequential and batch schedules agree exactly at the same sweep/direction/parity order.

A hot start is Haar: complex Gaussian first and second rows are normalized and orthogonalized, and the third is the conjugate cross product. This fixes determinant one. SU(2) starts use the alpha-zero heatbath. The page discards 256 initial sampling sweeps. This is an engineering burn-in, not proof that topology has equilibrated.

No link projection or reunitarization is applied to the sampler. Products remain in SU(N) algebraically; f32 rounding accumulates. Instruments measure the largest real/imaginary component of `U U† - I` and the largest complex magnitude of `det U - 1`. Sampling halts if a measured error exceeds 0.001, leaving the last view and a Restart message. That threshold is an operational bound, not a precision guarantee.

## PRNG and provenance

Philox4x32-10 follows the algorithm in [Salmon et al.](https://www.thesalmons.org/john/random123/papers/random123sc11.pdf). Its counter is `(site, sweep, schedule, drawBlock)`; schedule includes direction, parity and subgroup. Hot initialization uses disjoint schedule numbers. The two-word key comes directly from the displayed 16-digit seed. Each block supplies four uniform values using its high 23 bits plus a half-bin offset, so logarithms never see zero.

The published zero-counter/key Philox vector is tested. This code was implemented from equations, not copied from a reference implementation. Random123's [BSD license](https://github.com/DEShawResearch/random123/blob/main/LICENSE) was checked; there is no vendored code. Reference papers and videos are linked, with no redistributed reference footage.

The selected mode uses an offline fixed seed. It has no drand dependency, chain, round or verified beacon claim. It does not characterize PRNG outputs as quantum measurements. Same-device seed-and-step replay passes. Floating-point calculations, transcendental functions and rejection paths can differ between adapters, so cross-device exact replay is not promised.

## Charge operator and normalization

Generators are Hermitian with `Tr(Ta Tb) = delta_ab/2`. Links follow `U = exp(i g a A)`, and positive plaquettes approach `exp(i g a^2 F)`. Set epsilon_0123 = +1. For each mu < nu the clover sum C uses the four paths based at the measured site:

```text
(+mu, +nu, -mu, -nu)
(+nu, -mu, -nu, +mu)
(-mu, -nu, +mu, +nu)
(-nu, +mu, +nu, -mu)
```

All four have positive mu-nu orientation. Define the dimensionless Hermitian, traceless field

```text
Fhat_mu_nu = (C - C†)/(8 i), with its trace removed.
```

Four plaquettes contribute `C-C† = 8 i g a^2 F + ...`, so Fhat approaches g a^2 F. The continuum normalization for this convention is

```text
q(x) = epsilon_mu_nu_rho_sigma Tr(Fhat_mu_nu Fhat_rho_sigma)/(32 pi^2)
     = Tr(Fhat_01 Fhat_23 - Fhat_02 Fhat_13 + Fhat_03 Fhat_12)/(4 pi^2).
Q = sum over all four-dimensional sites of q(x).
```

The factor eight in the second equality comes from antisymmetric index pairs and cyclic trace. This is the unimproved one-plaquette clover estimator. It has finite-spacing errors. The rendered 3D slice is never substituted for full 4D Q, and no rounded sector or instanton count is shown.

### Nontrivial periodic fixture

This fixture is used only in tests. Embed quantized Abelian fluxes in `diag(exp(i theta), exp(-i theta), 1)`. For f = 2 pi k/L^2 in the 01 plane use `U0 = exp(-i f x1 H)` and `U1 = exp(i f L x0 H)` only at x1 = L-1; other U1 links are identity. H is diag(1,-1,0). Repeat in the 23 plane. Quantization makes the seam plaquettes match the bulk across both periodic boundaries. This is a periodic torus construction, not a truncated single instanton.

Every plaquette in a flux plane is `diag(exp(i f), exp(-i f), 1)`. The clover fields are `diag(sin f, -sin f, 0)`, giving

```text
Q_clover = L^4 sin(f01) sin(f23)/(2 pi^2)
Q_continuum = 2 k01 k23.
```

For k01=k23=1, CPU Q is 1.8992824071 at 4^4 and 1.9935827281 at 8^4, converging to 2. Arbitrary periodic local Haar gauge transformations preserve the charge map. Identity and gauge-transformed identity have zero action and charge.

## Smoothing and display clocks

The live sampler has a separate link field. Every 16 sampling sweeps, copy it to a cooling buffer. One Wilson cooling sweep greedily maximizes each subgroup's local staple weight using T=I. Measure that same source snapshot at 0, 2, 4 and 8 sweeps, storing four complete density maps. Lowering depth selects a retained shallower map; it never attempts to undo cooling or inject texture noise. CPU action decreases across eight cooling sweeps.

The browser targets two Markov sweeps per ambient second, with at most one pending sampling submission. Busy hardware reduces the achieved count. Quality is an explicit lattice selection; the governor does not silently change beta or the lattice. Fixed 1/60 ambient steps drive the scan at ten seconds per lattice plane. A 12-plane scan lasts 120 ambient seconds. The optional 127-second depth breath interpolates the retained maps. Scan, sampling, camera and presentation clocks are distinct from physical Minkowski time. No topological event is scheduled.

Wilson cooling can erase small structures. [Improved field-strength operators](https://arxiv.org/abs/hep-lat/0203008) combine larger clovers to reduce discretization errors; [Wilson flow](https://arxiv.org/abs/1006.4518) supplies a continuous smoothing scale. Neither is implemented here. They would need new staple/force operators, integration and normalization checks. The current cooling and operator cannot reproduce the improved 25-sweep treatment in the [reference visualization](https://arxiv.org/html/1903.08308v1), which uses a 24^3 x 36 SU(3) box. Beta 6.0 does not assign our box a physical spacing.

The slice interpolates neighboring planes along coordinate zero and uses hardware trilinear interpolation within the measured 3D density map. Previous and current snapshots crossfade for seven seconds, each normalized by its own measured RMS. Warm and blue are arbitrary sign encodings, not spectra.

The display traces contours where the absolute interpolated charge is 1.1 times the measured RMS. A ray uses 128 intervals and five bisections to locate each entering contour, then composites that surface with opacity 0.8. Central-difference normals, a fixed light and restrained specular highlights give the surfaces depth. A thin boundary fade closes contours at the edge of the displayed periodic box. This presentation gives the coarse lattice clear silhouettes; it does not create sub-lattice detail or change the charge measurements. No synthetic instantons, texture noise, fluid warp or image feedback drive it.

The room writes linear radiance to rgba16float and applies exposure linearly. The standalone host maps `c/(1+c)` once before sRGB encoding, without bloom. Its enlarged view occupies nearly the full page width and 690 CSS pixels at 1440 x 900. The render target caps DPR at 2, dimensions at 2560 pixels and total area at 4 Mi pixels. The camera fits the volume to the shorter viewport axis so portrait views retain the whole field. Observable values are calculated from lattice state before presentation filtering. RMS scaling makes a weak cooled field visible; it does not imply preserved physical amplitude. Instruments expose the RMS, peak and Q curve through the room snapshot. There is no photosensitivity certification claim.

## Memory budget

The adapter reported 128 MiB per storage binding and 256 MiB per buffer. No API reports total available VRAM. The solver caps lattices at 16^4 and accounts for separate buffers before choosing its schedule.

| Allocation, SU(3) at 16^4 | Bytes | MiB |
| --- | ---: | ---: |
| Live unsmoothed links | 18,874,368 | 18 |
| Cooling links | 18,874,368 | 18 |
| Four current charge maps | 1,048,576 | 1 |
| Four previous charge maps | 1,048,576 | 1 |
| Live per-site diagnostics | 1,048,576 | 1 |
| Solver and view uniforms | 720 | 0.00069 |
| 16^3 rgba16float slice | 32,768 | 0.03125 |
| Ordinary transient diagnostic readback | 2,097,152 | 2 |
| Optional debug link and charge readback | 19,922,944 | 19 |

Readback buffers are destroyed after mapping. Debug arrays also consume JS heap, which is not included in GPU totals. The host owns its HDR target, swap chain and any presentation resources; a 2560 x 1264 HDR target adds 25,886,720 bytes. Low and medium persistent solver buffers are 2,556,544 and 12,939,904 bytes before the room view and volume texture.

## Verification and measured results

Machine-readable evidence is in `cpu-verification.json` and `verification.json` beside the screenshots. The final browser run used Chrome for Testing on an Apple Metal-3 hardware adapter, reported non-fallback. The browser did not identify an Apple chip model. Times below are GPU timestamps, except the readback/reduction row, which includes queue and CPU wall time. They are observations from this run, not budgets guaranteed on other machines. Shader compilation and initialization are excluded.

| Phase | 8^4 median / p95 ms | 12^4 median / p95 ms | 16^4 median / p95 ms |
| --- | ---: | ---: | ---: |
| SU(3) heatbath sweep | 0.861 / 0.945 | 3.301 / 3.650 | 16.907 / 25.918 |
| One cooling sweep | 0.704 / 1.016 | 3.018 / 3.313 | 17.273 / 23.608 |
| Full 4D clover charge | 0.328 / 0.340 | 1.424 / 1.641 | 4.464 / 14.468 |
| Live plaquette and constraints | 0.117 / 0.122 | 0.422 / 0.433 | 1.175 / 1.335 |
| Four-depth readback and CPU sum | 0.700 / 5.900 | 1.500 / 2.500 | 3.700 / 7.400 |

There are 16 isolated measurements per solver phase. The updated 12^4 contour rendering at 2560 x 1264 took 6.212 / 9.234 ms over 32 GPU measurements; whole submitted render wall time was 6.900 / 9.900 ms. Slice assembly was 0.0069 / 0.0483 ms. The standalone final tone-map pass is outside that room benchmark. Its costs are not included in the volume-only timestamp. This run showed more variable 16^4 costs, so the default remains 12^4.

Numerical checks include:

- Identity: exact action zero, plaquette one and charge zero in CPU and GPU tests.
- Staple/full-action changes: CPU errors below 8e-13, tolerance 2e-10.
- Sequential/checkerboard scheduling: identical CPU fields at one sweep.
- Heatbath moments: 80,000 draws each at alpha 0, 0.1, 1, 6 and 20 agree with quadrature within 0.006. Haar SU(3) entries have mean squared modulus near 1/3.
- CPU/GPU one-sweep SU(3) link comparison: maximum component error 3.25e-6 and RMS 2.57e-7; test tolerance 2e-4. Charge differences are below 6e-9 across both groups, tolerance 2e-7. These compare a small 4^4 case with identical streams.
- GPU periodic flux Q: 1.8992822766 versus 1.8992824071 expected. Pointwise gauge-invariance error below 3e-9. CPU normalization converges from 4^4 to 8^4.
- CPU/GPU cooling comparison: maximum component error below 9e-7, tolerance 2e-4. CPU Wilson action is non-increasing across eight sweeps.
- Same-device seed replay: identical links after restarting at the same integer step count.

Cold and Haar-hot SU(3) starts were followed for 384 sweeps at 8^4 and 16^4. Plaquettes approached roughly 0.593 to 0.595. At 16^4 the four-sweep Q changed sign and ranged over several units. At 8^4 it spent much of the later run near zero. These observations do not establish equilibrium, tunneling rates or absence of topology freezing. At 16^4, one tested field's nearest-neighbor charge correlation rose from about 0.03 unsmoothed to about 0.76 after four cooling sweeps, while RMS fell by roughly sevenfold. The solver does generate coherent structures without seeding them.

Samples 16 sweeps apart retain measurable correlations. Short plaquette lag-one estimates range from about -0.02 to 0.34 in the cold/hot checks, with insufficient statistics for a reliable integrated autocorrelation time. Instruments keep a live history and label snapshots as potentially correlated. They never claim independent samples.

The visual run covers 240 ambient seconds at 12^4: two complete scan cycles and almost two depth breaths. It uses the normal 1/60 step sequence at accelerated wall pacing, reaching 736 sampling sweeps including burn-in. Maximum measured unitarity and determinant errors were about 5.3e-5 and 7.7e-5. Startup, developing, payoff and longer-run screenshots preserve actual output and checkpoint metadata. This is not evidence for a continuum instanton sector.

Browser tests inspect 1440 x 900, 390 x 844 and 844 x 390, and exercise keyboard pause, native/pseudo fullscreen, resize, touch targets, manual pause across visibility changes, offscreen suspension, reduced-motion still startup, offline sampling and missing WebGPU. Reduced motion still computes initialization but never starts the ambient animation until Play. The saved fallback has separately recorded origin. All harnessed JS, shader and validation checks pass. Safari, real mobile GPU performance and actual OS device-loss injection remain untested; the host catches reported device loss and pending work errors.

## Descent contract and example host

The module exports `roomInfo` and `createRoom({device, seed, quality, assetBaseURL})` with API version 1. It does not configure a canvas, create DOM, start rAF, fetch a swap-chain view or destroy the supplied device. Asset URLs resolve against import.meta.url when omitted; this procedural room needs no asset fetch. Importing the module has no standalone effects. Unsupported devices throw `QCDInitializationError`.

```js
import { createRoom } from './js/qcd-lava-lamp-room.js';
const room = await createRoom({
  device,
  seed: '5eedc0de1234abcd',
  quality: 'medium',
  assetBaseURL: new URL('./assets/visualizer/qcd-lava-lamp/', location.href).href
});
room.resize({ width: 1280, height: 620, dpr: 1 });
room.step({ dtSeconds: 1/60, elapsedSeconds: 1/60, scoreSeconds: 1/60 });
const encoder = device.createCommandEncoder();
room.render({ encoder, targetView: hostHDRView, width: 1280, height: 620, exposure: 1 });
// The host can add its own tone mapping here, then submits once.
device.queue.submit([encoder.finish()]);
console.log(room.snapshot());
// A slow correctness read exposes all live links and all four density maps.
const state = await room.debugReadback();
room.dispose(); // Only room-owned resources are released.
```

Physical pixel width/height are used once; dpr is informational. The host must suspend calls to step when hidden or paused. Rendering adds slice and volume passes to the supplied encoder, clears the full rgba16float target and leaves submission to the host. Snapshot diagnostics include age, last measured sweep, group, parameters, provenance, Q at each depth, constraints and memory. Optional helpers for smoothing and accelerated tests extend the required methods. No part of the required room interface is knowingly missing.

## Limits

This is a real pure-gauge SU(3) prototype, with a coarse, small periodic volume and an unimproved charge estimator. It is not calibrated to femtometers, full QCD with fermions, the reference video's exact ensemble, or a detector recording of vacuum dynamics. Deep cooling can remove the features that make the image interesting. No integer-sector or instanton identity is assigned. Improved cooling, improved field operators, calibrated spacing, stronger thermalization/topology statistics and cross-device validation remain research work.
