# Negative temperature

The [standalone comparison page](../../negative-temperature-lab.html) runs a complex condensate field on WebGPU. Moving repulsive potentials generate the dark vortex cores. The default protocol produces two persistent groups of four vortices with opposite circulation. No vortex sprites, attraction forces, sound input, external feed, or runtime dependencies drive the field.

The thermodynamic temperature of the vortex subsystem is **not estimated**. Organization is demonstrated in this finite-grid mean-field model. An equilibrium Onsager state, an inverse energy cascade, and a laboratory-calibrated negative temperature have not been established. The groups are smaller than the giant clusters in the experiments.

## Model and units

We solve

```text
i dpsi/dt = [-0.5 Laplacian + V + g |psi|^2] psi
rho = |psi|^2
N = integral rho dx dy
E = integral [0.5 |grad psi|^2 + V rho + 0.5 g rho^2] dx dy
v = grad arg(psi), away from cores
```

Choose an arbitrary length l0, time m l0^2 / hbar, and density n0. The reduced coefficients set hbar = m = 1, with g = g2D n0 m l0^2 / hbar^2 = 2. Bulk density is one and the bulk chemical potential is two. This is a condensate order parameter, not an exact simulation of individual atoms. No species, density in laboratory units, or value of l0 is calibrated. Consequently `representativeScaleMeters` is null.

N is an area-dependent normalization. The prepared field has N approximately 1105.9407, rather than one. A physical atom number would require the missing n0 l0^2 factor. Preparation uses fixed chemical potential to establish the bulk density; real evolution does not normalize the field.

Our healing-length convention is xi = 1 / sqrt(2 g rho0) = 0.5. Some sources omit the sqrt(2) in their definition, so quoted lengths from those conventions need conversion. With dx = 0.25, xi spans two cells and a diameter of 2 xi spans four. This is modest resolution; counts remain sensitive to it.

## Configuration and stirring

The source of truth is `CONFIG` in [negative-temperature-model.js](../../js/negative-temperature-model.js). The same object appears under Instruments > Model configuration and in every diagnostic snapshot.

| Parameter | Default |
| --- | ---: |
| Grid, complex precision | 256 by 256, f32 |
| FFT box side | 64 |
| Ellipse semiaxes | 24, 17 |
| Trap wall height, transition width | 12, 0.8 |
| Bulk density, g, chemical potential | 1, 2, 2 |
| dx, real dt | 0.25, 0.01 |
| Imaginary dt, preparation steps | 0.04, 1600 |
| Paddle peak, Gaussian widths | 10, 7.5 in x, 0.55 in y |
| Paddle x centers, starting y | -24 and +24, 22 |
| Paddle speed | 0.5 |
| Quiet time, sweep, withdrawal | 12, 44, 16 model units |
| Renewal interval | 540 model units |
| Clock mapping | 0.75 model units per active display second |
| Real damping, absorbing edges | Zero, none |
| Detection ellipse | Inner 89% of both semiaxes |
| Surrounding density threshold | 0.08 |
| Maximum same-sign link distance | 7 |
| Clustered label | A component of at least four, C2 at least 0.55 |

Let r = sqrt((x/24)^2 + (y/17)^2). The wall is 6 [1 + tanh((r - 1) 17 / 0.8)]. Its saturated argument is clamped to [-12, 12] in the shader. This avoids native GPU `tanh` overflow far outside the cloud; it changes only tails already saturated at f32 precision. The condensate edge is 16 healing lengths from the nearest periodic box boundary.

Two anisotropic Gaussian paddles extend inward from the left and right edges. Both move downward, with y = 22 - 0.5 min(s, 44), where s is time since stirring begins. Their amplitude ramps up over four model units and falls to zero over 16 units after the sweep. The first half-kick and last half-kick use the same midpoint potential, with updated density in the last kick. Once withdrawn, the field evolves conservatively until the next sweep. Subsequent sweeps act on the existing excited field, without resetting it.

The ellipse and double-paddle approach are inspired by [Gauthier and collaborators](https://arxiv.org/html/1801.06951v2). Their experiment uses an optical hard-wall trap and long barriers. This prototype uses smaller dimensionless geometry and smooth Gaussian barriers, with an independently tested speed. It does not reproduce their atom number, times, or temperature. The preprint first appeared in 2018; the [Science publication](https://doi.org/10.1126/science.aat5718) appeared in 2019.

[Johnstone and collaborators](https://arxiv.org/html/1801.06952v2) use moving barrier grids and signed vortex correlations. Here their two-nearest-neighbor C2 statistic measures organization. Their thermometry involves calibrated statistical curves, which this prototype does not implement. That preprint also appeared in 2018, followed by [Science in 2019](https://doi.org/10.1126/science.aat5793).

## Solver and preparation

One real step is a nonlinear/potential half-kick, forward two-dimensional FFT, kinetic multiplier exp(-i k^2 dt / 2), inverse FFT, then a second half-kick exp(-i [V + g rho] dt / 2). Density is recomputed for each kick. Fourier frequencies use signed integer modes; the forward convention is exp(-2 pi i jk/n), and each inverse axis divides by n.

Each axis uses a workgroup-local radix-2 Cooley-Tukey transform with bit-reversed loading and synchronized butterfly stages. Rows and columns are separate passes. Forward and inverse transforms, local kicks, and kinetic evolution alternate two complex storage buffers. Pass boundaries provide global storage ordering. Precomputed f32 twiddles and range-reduced phase polynomials reduce dependence on relaxed native trigonometric accuracy. Real zero damping uses an exact multiplier of one.

Preparation starts with a Thomas-Fermi amplitude and a constant phase, then applies imaginary-time split steps at fixed chemical potential. Kinetic evolution becomes exp(-k^2 dt / 2), and local evolution becomes exp(-(V + g rho - mu) dt / 2). This exchanges norm and energy with the preparation reservoir and is labeled separately. Another 100 preparation steps change the field by RMS 5.67e-8 on the tested device.

dt was selected using Fourier phase tests, a small CPU/GPU comparison, energy convergence, and the full stirring protocol at dt and dt/2. The maximum represented kinetic phase in one default step is approximately 1.58 radians. The method is norm-preserving in exact arithmetic, but neither total energy nor f32 norm is exact. Timestep reduction adds more f32 operations and can increase accumulated norm drift. Nonfinite fields are rejected rather than reported as zero vortices.

Algorithm references inspected were [wgsl-fft 0.5.1](https://docs.rs/wgsl-fft/0.5.1/wgsl_fft/) (MIT, Rust shader strings using Stockham radix-4) and [wgpuFFT](https://github.com/MaximEremenko/wgpuFFT) (Apache-2.0, Rust planners and WGSL kernels). This browser radix-2 implementation was written locally; neither crate is a browser dependency or a drop-in port. [Stagg's browser GPE](https://georgestagg.github.io/webgl_gpe/) instead uses dissipative GPE with RK4 and is not a conservation or timing reference for this solver.

## Diagnostics

Phase differences around each plaquette are wrapped to [-pi, pi]. A winding with magnitude greater than 1.5 pi is classified as one signed core. Detection excludes the low-density trap edge and checks average density on an eight-point ring about two healing lengths from the candidate. Sampling inside the hole incorrectly rejected resolved cores in an early implementation; the singular-core regression test now covers that error. Immediately adjacent same-sign detections are merged.

C2 averages the sign product with the two nearest neighbors. A graph connects same-sign vortices only when their distance is below seven and below the nearest opposite-sign distance for **both** endpoints. Connected-component sizes and C2 are reported separately. The Clustered state label requires both a four-member component and C2 >= 0.55. This is an operational organization criterion, not a temperature estimator.

Circulation is reported in quanta of 2 pi within the detection region. Core count can change through annihilation, nucleation, edge loss, or crossing the observation mask. Candidate annihilations are opposite-sign disappearances close to each other between samples, after same-sign position matching within three units. They can miss events and confuse rapid movement or boundary loss. No causal energy decomposition is claimed from this counter.

Energy uses a CPU f64 spectral transform of the actual GPU field, including the instantaneous paddle potential. Moving paddles do work. A separate forcing test compares energy change with integral rho dV/dt. The post-withdrawal energy-drift reference resets during each forced interval. Compressible sound remains in the conservative field, and annihilation can transfer vortex energy into sound. No damping is required for a vortex count to fall.

Diagnostics are sampled asynchronously, normally every three seconds (six for low quality). Snapshot reports the integer step and simulation time at readback, and both age in steps and age in wall seconds. Readbacks are serialized. Display filtering never feeds back into diagnostic data.

## Observed runs and limitations

The final [three-phrase run](../../assets/visualizer/negative-temperature/protocol-run.json) records every 1000 steps through step 162000, time 1620. This is 36 minutes under the normal clock mapping, accelerated in wall time with the identical solver sequence. Parameters, seed, signed positions, component sizes, norm, energy, boundary density, and diagnostic age are retained for every sample.

At time 250, step 25000, the field contains four positive and four negative vortices, in two four-member groups, with C2 = 1 and zero net detected circulation. Norm is 1100.1931, a loss of 0.5197% from the prepared field. Energy is 1457.1446. The outer four grid rows/columns contain 0.0412% of the norm. The [density screenshot](../../assets/visualizer/negative-temperature/payoff.png) and [signed instruments view](../../assets/visualizer/negative-temperature/payoff-instruments.png) come from this state.

The cluster criterion remains satisfied at every sample from time 110 through 580. This includes the beginning of the next forcing interval, so the unforced persistence claim is limited to time 110 through 540, about 9.6 display minutes. Later phrases inject additional vortices and have weaker organization. The full run contains 51 clustered samples out of 162, not permanent order.

The [padded-box check](../../assets/visualizer/negative-temperature/padding-check.json) increases the box to 96 and the grid to 512, with dt = 0.005 and the same trap and paddles. The nearest box margin rises to 48 healing lengths and the healing length spans 2.67 cells. At time 150 it has five cores of each sign, C2 = 0.7, and two four-member components. Such components persist through time 300, while C2 varies from 0.5 to 0.7. Its maximum boundary norm fraction is 0.0224%, compared with 0.1402% in the longer default run. This supports organization away from periodic seams, but does not prove independence from all boundary or sound effects. The changed counts demonstrate incomplete spatial convergence.

The default dt-halving test also retains two four-member groups at time 150, but count changes from 4/4 to 5/5 and accumulated f32 norm loss increases. These are qualitative checks of the protocol. They do not establish converged thermodynamic statistics.

Norm loss reaches 3.5833% over the three-phrase run. No frame normalization conceals it. This precision limitation matters for long unattended viewing. Negative temperature, a density of states, point-vortex energy thermometry, incompressible energy spectra, and exact cross-device replay remain unimplemented. The implementation makes no photosensitivity certification claim.

Earlier parameter trials are retained in this assets directory. `initial-fast-run.json` and `tuning-*.json` are explicitly marked superseded because their detector sampled core density incorrectly. `refined-protocol-runs.json` is explicitly invalid: unbounded shader tanh generated NaNs, serialized as null energies, before the fix. Their zero vortex counts cannot support a physical conclusion. `imprint-runs.json` explores separate neutral phase-and-density imprints; that condition is not used by the standalone piece. `wall-check-runs.json` records the wall comparison.

## Rendering and operation

The room draws the unmodified field into a full-size rgba16float target as linear radiance. Density uses a saturating transfer 1.8 [1 - exp(-1.7 rho)] with a smooth display floor between rho = 0.015 and 0.08. This reduces the visual prominence of weak sound outside the cloud and deepens low-density cores. A small four-neighbor contribution is spatial bloom. There is no feedback, trail buffer, fabricated noise, or tracer advection.

Phase is a cyclic OKLab wheel at constant lightness 0.77, chroma 0.022 by default and 0.12 in the phase instrument. It encodes phase rather than emitted spectral light. The velocity view computes Im(conj(psi) grad psi) / rho with centered differences, suppressing arrows below rho = 0.08. No integration through a core singularity is attempted. Optional sign rings use measured core positions and do not affect the wave equation.

The standalone host tone maps once with linear Reinhard, then performs sRGB transfer for its unorm canvas. The room itself never tone maps and applies exposure as a linear multiplier. A readback test finds exactly a factor of two when exposure doubles. Beyond the simulated square, the scene is background; edge pixels are not extruded or tiled.

Pause is separate from hidden/offscreen suspension. Reduced motion starts with a computed still and Play. Restart prepares the same fixed seed again and preserves the manual pause state. The offline hex seed controls only a global initial phase, through FNV-1a and Mulberry32; it is not a verified beacon or an independently measured quantum random event. Same-device restart is tested, while floating-point chaos prevents a cross-device exact replay promise.

The host uses fixed 1/60 ambient increments, up to four per frame. It waits for outstanding GPU work rather than accumulating an unbounded queue. Under load the same physical sequence advances more slowly. After reducing updates through that queue governor, sustained latency can reduce rendering DPR from its 1.5 cap to one. The numerical grid and physical parameters do not change silently. All three room quality labels currently use the validated 256 grid; low quality only samples instruments less often.

## Room interface and host example

[negative-temperature-room.js](../../js/negative-temperature-room.js) exports `roomInfo` and `createRoom` with API version one and id `negative-temperature`. Imports have no DOM or animation side effects. Initialization prepares the field, so it is asynchronous. A supplied device is required; initialization or limit failures throw an error for the host to catch.

```js
const room = await createRoom({ device, seed: '180106951', quality: 'medium', assetBaseURL });
room.resize({ width, height, dpr }); // width and height already in physical pixels
room.step({ dtSeconds: 1 / 60, elapsedSeconds, scoreSeconds });
const encoder = device.createCommandEncoder();
room.render({ encoder, targetView, width, height, exposure: 1 });
// Host can add presentation passes, then submit its encoder.
device.queue.submit([encoder.finish()]);
const snapshot = room.snapshot();
const state = await room.debugReadback(); // interleaved re, im Float32Array
room.dispose(); // destroys only the room's buffers
```

The room uses its accumulated active solver time for forcing and renewal; host elapsed and score clocks do not advance physics during suspension. Step submits compute work but creates no animation loop. Render only adds passes to the supplied encoder. It clears the target and never submits the render encoder, configures a canvas, fetches a swap-chain texture, creates controls, or destroys the supplied device or target. Asset URLs resolve from the module or the supplied absolute base. No runtime asset fetch is required.

`setDisplay` and `debugAdvance` are optional extra methods. DebugAdvance accelerates the same sequence for tests, without changing the equation. The standalone [entry script](../../js/negative-temperature.js) is a complete example host. The ownership test creates two rooms on one device, disposes one, and successfully renders the other. Snapshot carries model, units, configuration, provenance, quality, measured quantities, age, and numerical errors. DebugReadback supplies the complex field and the exact step/time captured for comparison.

## Validation and performance

Tests run October 3, 2026, on Apple M1 Pro with the native Metal WebGPU adapter in Chrome for Testing. The adapter reports apple / metal-3, `isFallbackAdapter: false`. These are hardware results, not software-adapter timings. GPU work uses f32; CPU references and spectral diagnostics use f64. There were no script or WebGPU validation errors in the final browser run.

| Check | Measured result | Assertion tolerance |
| --- | ---: | ---: |
| CPU FFT round trip RMS | 1.58e-16 | < 1e-12 |
| CPU plane-wave RMS | 1.92e-16 | < 1e-12 |
| CPU conservative relative norm drift | 1.31e-14 | < 1e-11 |
| CPU energy errors, dt 0.04 / 0.02 / 0.01 | 5.04e-6 / 1.26e-6 / 3.15e-7 | Error ratios > 3.8 |
| CPU field difference ratio on dt halving | 4.00054 | > 3.8 |
| CPU linear-loss norm error | 3.36e-14 | < 1e-11 |
| CPU paddle-work energy residual | -3.91e-8 | abs < 1e-4 |
| GPU FFT RMS, 32 / 256 / 512 grids | 1.01e-7 / 7.31e-8 / 5.46e-8 | < 2e-6 |
| Small CPU versus GPU, 20 steps RMS | 1.80e-6 | < 2e-5 |
| GPU analytic plane wave, 100 steps RMS | 1.54e-5 | < 5e-5 |
| GPU plane-wave norm drift, 100 steps | -3.32e-5 | abs < 1e-4 |
| Winding signs and singular-core density gate | Correct positive/negative and two centered cores | Exact counts/signs |
| Linear exposure ratio | 2 / 2 / 2 | Within 0.01 of two |

The CPU loss test uses `dpsi/dt = -gamma psi` as an isolated optional particle-loss term; it does not claim to test a thermal dissipative GPE. Real playback sets that coefficient to zero. Nonfinite input is rejected by a separate assertion.

| Operation | Full-run median / p95 | Final UI-run median / p95 | Measurement |
| --- | ---: | ---: | --- |
| One forward 2D FFT, 256 grid | 0.40 / 0.90 ms | 2.70 / 6.90 ms | Single transform, queue completion |
| Full GPE step, 256 grid | 0.225 / 0.325 ms | 0.688 / 1.713 ms | Eight-step batches, time divided by eight |
| Room render, 640 by 360 rgba16float | 0.40 / 0.80 ms | 1.40 / 3.10 ms | Single render, queue completion |

Each operation has 25 measured samples after four warmups, including CPU encoding/submission and queue-completion latency. FFT, solver and rendering were measured separately. Different batch sizes mean the FFT number is not an additive component cost; the single-transform driver overhead is significant. Timestamp queries are detected but not used. The final UI run was substantially slower on the same adapter; the cause was not isolated. Both observations are retained rather than treating the faster baseline as a promise. Normal speed needs 75 solver steps per active display second.

Browser checks cover 1440x900, 390x844 and 844x390; all visible controls have at least 44px targets and no horizontal overflow. Pause/resume, keyboard Space, instruments, phase, velocity, sign rings, fullscreen/exit, resize, hidden/offscreen suspension, retained manual pause, reduced motion, exact same-device restart, offline continuation, missing WebGPU, and device loss are exercised. Screenshots include [startup](../../assets/visualizer/negative-temperature/startup.png), [stirring](../../assets/visualizer/negative-temperature/developing.png), and the payoff, as well as all three viewport sizes. Fallback PNG/WebP is a recorded field render at time 250, with its origin stated in the interface.

Reproduce with bundled Playwright on NODE_PATH:

```sh
node tools/test-negative-temperature-numerics.mjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-browser.cjs --protocol
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-protocol.cjs
```

The browser harness owns its HTTP server and the exact browser child, launched through `/Users/ethan/.local/bin/agent-chrome-for-testing`, and closes both in finally. It does not launch the personal Chrome app or use broad process cleanup. The protocol harness repeats the padded-box check. `NT_STEPS` can shorten the browser recording while preserving the solver sequence; its default is three full phrases. Raw results are in [validation-full.json](../../assets/visualizer/negative-temperature/validation-full.json), the latest [validation.json](../../assets/visualizer/negative-temperature/validation.json), [cpu-validation.json](../../assets/visualizer/negative-temperature/cpu-validation.json), and protocol-run.json. The final restart check compares the complete complex field, with matching SHA-256 `45b157afbfb28050b3d92aa9f312a628554d110250eaebaee2db22e4532b418a` on this device.

## Owned files

- `negative-temperature-lab.html`, `negative-temperature.css`
- `js/negative-temperature.js`, `js/negative-temperature-room.js`
- `js/negative-temperature-model.js`, `js/negative-temperature-gpu.js`
- `tools/test-negative-temperature-numerics.mjs`, `tools/test-negative-temperature-browser.cjs`, `tools/test-negative-temperature-protocol.cjs`
- `assets/visualizer/negative-temperature/` screenshots, still fallback and diagnostic records
- `docs/visualizer/NEGATIVE_TEMPERATURE.md`

No homepage, hub, archive, lab index, shared style, component kit, other visualization, game, or research-bundle files belong to this change. The page is noindex and deliberately absent from curation. The sitemap generator excludes comparison lab pages.
