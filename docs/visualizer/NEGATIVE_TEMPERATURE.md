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

Our healing-length convention is xi = 1 / sqrt(2 g rho0) = 0.5. Some sources omit the sqrt(2) in their definition, so quoted lengths from those conventions need conversion. With dx = 0.125, xi spans four cells and a diameter of 2 xi spans eight. The previous 256 grid had half this linear resolution. Counts remain sensitive to spatial resolution and timestep.

## Configuration and stirring

The source of truth is `CONFIG` in [negative-temperature-model.js](../../js/negative-temperature-model.js). The same object appears under Instruments > Model configuration and in every diagnostic snapshot.

| Parameter | Default |
| --- | ---: |
| Grid, complex precision | 512 by 512, f32 |
| FFT box side | 64 |
| Ellipse semiaxes | 24, 17 |
| Trap wall height, transition width | 12, 0.8 |
| Bulk density, g, chemical potential | 1, 2, 2 |
| dx, real dt | 0.125, 0.004 |
| Imaginary dt, preparation steps | 0.04, 1600 |
| Paddle peak, Gaussian widths | 10, 7.5 in x, 0.55 in y |
| Paddle x centers, starting y | -24 and +24, 22 |
| Paddle speed | 0.5 |
| Quiet time, sweep, withdrawal | 12, 44, 16 model units |
| Renewal interval | 540 model units |
| Clock mapping | 3 model units per active display second |
| Standalone opening | Time 48, after 12000 real solver steps |
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

Each axis uses a workgroup-local radix-2 Cooley-Tukey transform with bit-reversed loading and synchronized butterfly stages. Workgroups use at most 256 threads, with multiple elements per thread. Rows and columns are separate passes. Forward and inverse transforms, local kicks, and kinetic evolution alternate two complex storage buffers. Pass boundaries provide global storage ordering. Precomputed f32 twiddles and range-reduced phase polynomials reduce dependence on relaxed native trigonometric accuracy. Real zero damping uses an exact multiplier of one.

Preparation starts with a Thomas-Fermi amplitude and a constant phase, then applies imaginary-time split steps at fixed chemical potential. Kinetic evolution becomes exp(-k^2 dt / 2), and local evolution becomes exp(-(V + g rho - mu) dt / 2). This exchanges norm and energy with the preparation reservoir and is labeled separately. At the previous 256 grid, another 100 preparation steps changed the field by RMS 5.67e-8 on the tested device.

dt was selected using Fourier phase tests, a small CPU/GPU comparison, energy convergence, and the stirring protocol at dt and dt/2. Raising the grid to 512 with the old dt = 0.01 produced grid-scale noise and excessive detections, so that trial was rejected. The new dt = 0.004 gives a maximum represented kinetic phase of approximately 2.53 radians. The method is norm-preserving in exact arithmetic, but neither total energy nor f32 norm is exact. Timestep reduction adds more f32 operations and can increase accumulated norm drift. Nonfinite fields are rejected rather than reported as zero vortices.

Algorithm references inspected were [wgsl-fft 0.5.1](https://docs.rs/wgsl-fft/0.5.1/wgsl_fft/) (MIT, Rust shader strings using Stockham radix-4) and [wgpuFFT](https://github.com/MaximEremenko/wgpuFFT) (Apache-2.0, Rust planners and WGSL kernels). This browser radix-2 implementation was written locally; neither crate is a browser dependency or a drop-in port. [Stagg's browser GPE](https://georgestagg.github.io/webgl_gpe/) instead uses dissipative GPE with RK4 and is not a conservation or timing reference for this solver.

## Diagnostics

Phase differences around each plaquette are wrapped to [-pi, pi]. A winding with magnitude greater than 1.5 pi is classified as one signed core. Detection excludes the low-density trap edge and checks average density on an eight-point ring about two healing lengths from the candidate. Sampling inside the hole incorrectly rejected resolved cores in an early implementation; the singular-core regression test now covers that error. Immediately adjacent same-sign detections are merged.

C2 averages the sign product with the two nearest neighbors. A graph connects same-sign vortices only when their distance is below seven and below the nearest opposite-sign distance for **both** endpoints. Connected-component sizes and C2 are reported separately. The Clustered state label requires both a four-member component and C2 >= 0.55. This is an operational organization criterion, not a temperature estimator.

Circulation is reported in quanta of 2 pi within the detection region. Core count can change through annihilation, nucleation, edge loss, or crossing the observation mask. Candidate annihilations are opposite-sign disappearances close to each other between samples, after same-sign position matching within three units. They can miss events and confuse rapid movement or boundary loss. No causal energy decomposition is claimed from this counter.

Energy uses a CPU f64 spectral transform of the actual GPU field, including the instantaneous paddle potential. A dedicated module worker normally performs this calculation and core detection, keeping the larger-grid diagnostics off the UI thread. If the worker cannot start, fails, or does not reply within four seconds, the room terminates it and runs the identical f64 measurement on the main thread. The readback is retained until measurement finishes. Snapshot reports `diagnosticsBackend` and `diagnosticsFallbackReason`. This fallback can briefly interrupt UI responsiveness during a measurement, but does not alter physics or normalize the field. Moving paddles do work. A separate forcing test compares energy change with integral rho dV/dt. The post-withdrawal energy-drift reference resets during each forced interval. Compressible sound remains in the conservative field, and annihilation can transfer vortex energy into sound. No damping is required for a vortex count to fall.

Diagnostics are sampled asynchronously, normally every three seconds (six for low quality). Snapshot reports the integer step and simulation time at readback, and both age in steps and age in wall seconds. Readbacks are serialized. Display filtering never feeds back into diagnostic data.

## Observed runs and limitations

The current [512-grid validation](../../assets/visualizer/negative-temperature/resolution-validation.json) records the first phrase at dt = 0.004 and the first sweep and relaxation through time 150 at dt = 0.002. Both use the same trap, paddles and seed. At time 150, the default has five cores of each sign, C2 = 0.7, two four-member components and two isolated cores. Norm loss is 0.7259%. At times 250, 400 and 540 it has four cores of each sign in two four-member components, with C2 = 1. At the end of the phrase, norm loss is 2.9910% and boundary norm fraction is 0.0263%. These observations sample selected times rather than every moment of persistence.

At half timestep, time 150 retains two four-member components, but has six positive and five negative cores, C2 = 0.3636 and norm loss of 1.4546%. It therefore fails the Clustered label's correlation threshold at that sample despite the two groups. The checks support qualitative organization, not converged counts or thermodynamic statistics. Quantitative long-run validation of multiple phrases at the new 512 default remains outstanding. No normalization hides accumulated f32 norm loss.

The following records describe the previous 256-grid default, not the new numerical configuration. Its [three-phrase run](../../assets/visualizer/negative-temperature/protocol-run.json) records every 1000 steps through step 162000, time 1620. This was 36 minutes under the original 0.75-unit clock mapping, accelerated in wall time with the identical solver sequence. The revised three-unit clock maps the same sequence to nine minutes; the stored record retains the original configuration. Parameters, seed, signed positions, component sizes, norm, energy, boundary density, and diagnostic age are retained for every sample.

At time 250, step 25000, the field contains four positive and four negative vortices, in two four-member groups, with C2 = 1 and zero net detected circulation. Norm is 1100.1931, a loss of 0.5197% from the prepared field. Energy is 1457.1446. The outer four grid rows/columns contain 0.0412% of the norm. The [density screenshot](../../assets/visualizer/negative-temperature/payoff.png) and [signed instruments view](../../assets/visualizer/negative-temperature/payoff-instruments.png) come from this state.

The cluster criterion remains satisfied at every sample from time 110 through 580. This includes the beginning of the next forcing interval, so the unforced persistence claim is limited to time 110 through 540, about 9.6 display minutes at the original speed, or 2.4 minutes at the revised speed. Later phrases inject additional vortices and have weaker organization. The full run contains 51 clustered samples out of 162, not permanent order.

The [padded-box check](../../assets/visualizer/negative-temperature/padding-check.json) increases the box to 96 and the grid to 512, with dt = 0.005 and the same trap and paddles. The nearest box margin rises to 48 healing lengths and the healing length spans 2.67 cells. At time 150 it has five cores of each sign, C2 = 0.7, and two four-member components. Such components persist through time 300, while C2 varies from 0.5 to 0.7. Its maximum boundary norm fraction is 0.0224%, compared with 0.1402% in the longer default run. This supports organization away from periodic seams, but does not prove independence from all boundary or sound effects. The changed counts demonstrate incomplete spatial convergence.

The previous 256-grid dt-halving test also retains two four-member groups at time 150, but count changes from 4/4 to 5/5 and accumulated f32 norm loss increases. These are qualitative checks of the protocol. They do not establish converged thermodynamic statistics.

At the previous 256 grid, norm loss reaches 3.5833% over the three-phrase run. This precision limitation matters for long unattended viewing, especially with the finer grid's greater step count. Negative temperature, a density of states, point-vortex energy thermometry, incompressible energy spectra, and exact cross-device replay remain unimplemented. The implementation makes no photosensitivity certification claim.

Earlier parameter trials are retained in this assets directory. `initial-fast-run.json` and `tuning-*.json` are explicitly marked superseded because their detector sampled core density incorrectly. `refined-protocol-runs.json` is explicitly invalid: unbounded shader tanh generated NaNs, serialized as null energies, before the fix. Their zero vortex counts cannot support a physical conclusion. `imprint-runs.json` explores separate neutral phase-and-density imprints; that condition is not used by the standalone piece. `wall-check-runs.json` records the wall comparison.

## Rendering and operation

The room draws the field into a full-size rgba16float target as linear radiance. The ellipse fits both viewport axes with a 10% margin. The standalone wrapper permits 1400px width and the desktop stage uses 68vh, bounded by 380px and 780px. This makes the visible cloud about 70% larger in the desktop reference view.

The v5 display reconstructs complex psi with Catmull-Rom bicubic interpolation, then computes rho = |psi| squared. The previous independent interpolation of sampled density filled subcell vortex zeros where neighboring complex amplitudes canceled. Bicubic reconstruction is a display approximation and can overshoot; it does not add simulated cells or change the evolved field. Luminosity now uses 1.6 rho^1.25 with a smooth display floor between rho = 0.015 and 0.045. This retains more contrast in sound and density changes than the previous saturating transfer. Spatial bloom has been removed.

The default v6 view uses the surface lighting selected by the owner from the preview. Its normal is proportional to (-1.8 d rho/dx, -1.8 d rho/dy, 1), using screen derivatives converted back to model units. A fixed light points along normalized (-0.45, 0.65, 0.8). Diffuse brightness is 0.38 + 0.62 max(normal dot light, 0); a warm specular term uses a half-vector, power 48 and strength 0.75. The same density luminosity gates both terms, so empty space and vortex zeros do not acquire highlights. This is illustrative relief shading of a two-dimensional density field, not a simulated three-dimensional surface, optical emission, or a force. It adds no contours in the default view and changes no solver or diagnostic quantity.

The optional contour view draws equal-density contours at rho = 0.035 + 0.1 k, with screen-pixel antialiasing and a physical density-slope mask that suppresses flat-field noise. Lines darken the underlying color by at most 36%. It preserves the earlier v5 presentation. Phase and velocity views omit the lighting and contours. There is no feedback, trail buffer, fabricated noise, or tracer advection.

Phase is a cyclic OKLab wheel at constant lightness 0.77, chroma 0.075 by default (v4 used 0.045, original captures used 0.022) and 0.12 in the phase instrument. It encodes phase rather than emitted spectral light. The velocity view computes Im(conj(psi) grad psi) / rho with centered differences, suppressing arrows below rho = 0.08. No integration through a core singularity is attempted. Optional sign rings use measured core positions and do not affect the wave equation.

The standalone host tone maps once with linear Reinhard, then performs sRGB transfer for its unorm canvas. The room itself never tone maps and applies exposure as a linear multiplier. A readback test finds exactly a factor of two when exposure doubles. Beyond the simulated square, the scene is background; edge pixels are not extruded or tiled.

The original quiet opening made the piece appear inactive. The standalone host now computes the first 12000 real steps at the current timestep, opening midway through the first sweep at time 48. It draws the evolving field and a progress percentage during that pre-roll, then advances at three model units per display second. This uses actual solver evolution. Creation of the reusable room still returns the prepared ground state; the pre-roll belongs to the standalone host. Restart repeats the same preparation and pre-roll.

Preparation and pre-roll use batches of at most 32 steps and show progress from the first preparation batch. Previously a worker that never replied left initialization awaiting its first diagnostic forever, with the phase label still reading Preparing the field. The loading regression reproduces that exact v3 state with a silent-worker fixture. The current version completes with either worker or main-thread measurement. GPU adapter/device requests, queue completion and readback each have a 15-second deadline. Failed initialization releases owned GPU resources and offers Reload beside the attributed recorded field image. A small page loader catches module download failures and watches for 30 seconds without preparation progress, so an entry-module failure also has a visible retry path.

Pause is separate from hidden/offscreen suspension. Reduced motion starts with a computed still and Play. Restart prepares the same fixed seed again and preserves the manual pause state. The offline hex seed controls only a global initial phase, through FNV-1a and Mulberry32; it is not a verified beacon or an independently measured quantum random event. Same-device restart is tested, while floating-point chaos prevents a cross-device exact replay promise.

The host uses fixed 1/60 ambient increments, up to four per frame. It waits for outstanding GPU work rather than accumulating an unbounded queue. Under load the same physical sequence advances more slowly. The canvas renders at least two pixels per CSS pixel on each axis, even on a 1x display, and caps DPR at 2.5. Sustained latency can reduce that cap to two, never below the requested 2x resolution. The desktop reference canvas is 2716 by 1224 for a 1358 by 612 CSS box. All three room quality labels use the validated 512 grid; low quality only samples instruments less often. The numerical grid and physical parameters do not change silently.

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
room.dispose(); // destroys the room's buffers and terminates its diagnostic worker
```

The room uses its accumulated active solver time for forcing and renewal; host elapsed and score clocks do not advance physics during suspension. Step submits compute work but creates no animation loop. Render only adds passes to the supplied encoder. It clears the target and never submits the render encoder, configures a canvas, fetches a swap-chain texture, creates controls, or destroys the supplied device or target. Asset URLs resolve from the module or the supplied absolute base. No runtime asset fetch is required.

`setDisplay` and `debugAdvance` are optional extra methods. DebugAdvance accelerates the same sequence for tests, without changing the equation. The standalone [entry script](../../js/negative-temperature.js) is a complete example host. The ownership test creates two rooms on one device, disposes one, and successfully renders the other. Snapshot carries model, units, configuration, provenance, quality, measured quantities, age, and numerical errors. DebugReadback supplies the complex field and the exact step/time captured for comparison.

An optional `onProgress` callback on createRoom reports compilation, preparation counts and the initial measurement. It does not create DOM or animation side effects. The standalone host uses it for its loading text and watchdog heartbeat.

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
| GPU FFT RMS, current 512 grid | 7.17e-8 | < 2e-6 |
| Small CPU versus GPU, 20 steps RMS | 1.80e-6 | < 2e-5 |
| GPU analytic plane wave, current grid, 100 steps RMS | 9.29e-6 | < 5e-5 |
| GPU plane-wave norm drift, current grid, 100 steps | -2.79e-5 | abs < 1e-4 |
| Winding signs and singular-core density gate | Correct positive/negative and two centered cores | Exact counts/signs |
| Linear exposure ratio | 2 / 2 / 2 | Within 0.01 of two |

The CPU loss test uses `dpsi/dt = -gamma psi` as an isolated optional particle-loss term; it does not claim to test a thermal dissipative GPE. Real playback sets that coefficient to zero. Nonfinite input is rejected by a separate assertion.

The [solver record](../../assets/visualizer/negative-temperature/resolution-validation.json), earlier [render and ownership record](../../assets/visualizer/negative-temperature/render-resolution-validation.json), the earlier [v5 rendering record](../../assets/visualizer/negative-temperature/sharpness-validation.json), and the current [surface-lighting record](../../assets/visualizer/negative-temperature/surface-validation.json) give:

| Operation | Median / p95 | Measurement |
| --- | ---: | --- |
| One forward 2D FFT, 512 grid | 0.80 / 1.50 ms | Single transform, queue completion |
| Full GPE step, 512 grid | 0.70 / 0.813 ms | Eight-step batches, time divided by eight |
| v6 surface render, 2716 by 1224 rgba16float | 1.30 / 1.40 ms | Single render, queue completion |
| Earlier v5 room render, same dimensions | 1.80 / 2.40 ms | Single render, queue completion |
| Earlier v4 room render, same dimensions | 0.90 / 2.20 ms | Single render, queue completion |

Historical 256-grid measurements are retained for comparison:

| Operation | Full-run median / p95 | Final UI-run median / p95 | Measurement |
| --- | ---: | ---: | --- |
| One forward 2D FFT, 256 grid | 0.40 / 0.90 ms | 2.70 / 6.90 ms | Single transform, queue completion |
| Full GPE step, 256 grid | 0.225 / 0.325 ms | 0.688 / 1.713 ms | Eight-step batches, time divided by eight |
| Room render, 640 by 360 rgba16float | 0.40 / 0.80 ms | 1.40 / 3.10 ms | Single render, queue completion |

Each operation has 25 measured samples after four warmups, including CPU encoding/submission and queue-completion latency. FFT, solver and rendering were measured separately. Different batch sizes mean the FFT number is not an additive component cost; the single-transform driver overhead is significant. Timestamp queries are detected but not used. The historical final UI run was substantially slower on the same adapter; the cause was not isolated. The current clock needs 750 solver steps per active display second. A room call queues at most 32 stable substeps, and the host still bounds queued work. These timings describe this device and workload, not a frame-rate guarantee.

Browser checks cover 1440x900, 390x844 and 844x390; all visible controls have at least 44px targets and no horizontal overflow. The current resolution regression covers live motion, desktop pixel dimensions, both mobile orientations, fullscreen/exit, pause, reduced motion and full-field replay. Historical checks also cover keyboard Space, instruments, phase, velocity, sign rings, hidden/offscreen suspension, retained manual pause, offline continuation, missing WebGPU, and device loss. Fallback PNG/WebP is now a recorded 512-grid field render at time 150, with its solver origin stated in the interface.

The current opening has its own [resolution regression record](../../assets/visualizer/negative-temperature/opening-resolution-validation.json). It starts at step 12000 in the Stirring phase. The five-second live check produces density-change RMS 0.197, which excludes mere global phase rotation as the apparent motion. The fixed room clock executes exactly 750 steps for 60 ambient increments. The warmed field repeats with SHA-256 `2e875a84a74bd11997ff2eb907751a037427dd4cbbf3297540bfa369b048d807` on this device. See the [larger opening](../../assets/visualizer/negative-temperature/opening-v3.png), [five seconds later](../../assets/visualizer/negative-temperature/opening-motion-v3.png), [payoff](../../assets/visualizer/negative-temperature/payoff-v3.png), and [detail view](../../assets/visualizer/negative-temperature/detail-v3.png). The earlier [256-grid opening record](../../assets/visualizer/negative-temperature/opening-validation.json) is retained as history.

The [loading regression](../../assets/visualizer/negative-temperature/loading-validation.json) covers native Chrome and WebKit startup, visible preparation/stirring progress, live advancement, 2x rendering, fullscreen, silent workers, a worker constructor blocked by SecurityError, an aborted module download followed by Reload, and an unanswered GPU-adapter request. The worker-fallback cases reproduce the complete Chrome opening field with the same hash above. The WebKit opening has a different hash, consistent with the existing cross-browser floating-point replay caveat. The test's GPU-timeout fixture shortens only the 15-second timer to 100ms; the production deadline remains 15 seconds. See the [loaded field](../../assets/visualizer/negative-temperature/loading-recovery.png).

Reproduce with bundled Playwright on NODE_PATH:

```sh
node tools/test-negative-temperature-numerics.mjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-browser.cjs --protocol
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-protocol.cjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-opening.cjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-resolution.cjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-loading.cjs
NODE_PATH=/path/to/node_modules node tools/test-negative-temperature-sharpness.cjs
```

The browser harness owns its HTTP server and the exact browser child, launched through `/Users/ethan/.local/bin/agent-chrome-for-testing`, and closes both in finally. It does not launch the personal Chrome app or use broad process cleanup. The protocol harness repeats the padded-box check. `NT_STEPS` can shorten the browser recording while preserving the solver sequence; its default is three full phrases at the current timestep. The browser harness retains explicit 256-grid numerical comparisons as historical regressions; the resolution harness checks the current default. Adding `--render-only` to the resolution command skips the long physical runs and repeats rendering, exposure and shared-device ownership checks. Historical results remain in [validation-full.json](../../assets/visualizer/negative-temperature/validation-full.json), [validation.json](../../assets/visualizer/negative-temperature/validation.json), [cpu-validation.json](../../assets/visualizer/negative-temperature/cpu-validation.json), and protocol-run.json.

The current sharpness harness draws the same time-150 complex field through the retained v4 reference shader and the v6 surface-lighting shader, using the same bound buffers, dimensions, exposure, and single host tone mapper. The complete field hash remains `102785c0bcf51bae88438cdfd237cf8d22466827e7badaa3ace593ceef89be99` before and after both draws. The earlier [v4](../../assets/visualizer/negative-temperature/sharpness-before-v4.png), [v5](../../assets/visualizer/negative-temperature/sharpness-after-v5.png), and [v5 page](../../assets/visualizer/negative-temperature/sharpness-page-v5.png) captures are retained. The v5 test confirmed a 2/2/2 linear exposure ratio, native Chrome and WebKit startup, live advancement, both mobile orientations without horizontal overflow, and at least 2x canvas resolution. All collected browser and GPU errors are empty. The [surface-lighting record](../../assets/visualizer/negative-temperature/surface-validation.json) repeats the unchanged field hash and 2/2/2 exposure ratio for v6. It verifies that the four selectable views draw different images while paused, then restores surface lighting. Chrome and WebKit load and advance the live field with no collected errors; mobile checks wait for actual canvas dimensions to match the viewport and requested DPR. The current [surface render](../../assets/visualizer/negative-temperature/surface-v6.png) is also the fallback source; the [v6 page](../../assets/visualizer/negative-temperature/surface-page-v6.png) opens with the same lighting. It does not claim to add numerical resolution; the physical 512 grid and timestep remain unchanged. Passing `--browser-only` repeats native startup, view switching and resizing without overwriting the field comparison and rendering benchmark.

## Owned files

- `negative-temperature-lab.html`, `negative-temperature.css`
- `js/negative-temperature.js`, `js/negative-temperature-room.js`
- `js/negative-temperature-model.js`, `js/negative-temperature-gpu.js`
- `js/negative-temperature-diagnostics-worker.js`
- `js/negative-temperature-loading.js`
- `tools/test-negative-temperature-numerics.mjs`, `tools/test-negative-temperature-browser.cjs`, `tools/test-negative-temperature-protocol.cjs`, `tools/test-negative-temperature-opening.cjs`, `tools/test-negative-temperature-resolution.cjs`
- `tools/test-negative-temperature-loading.cjs`, `tools/test-negative-temperature-sharpness.cjs`, `tools/negative-temperature-render-v4.wgsl`
- `assets/visualizer/negative-temperature/` screenshots, still fallback and diagnostic records
- `docs/visualizer/NEGATIVE_TEMPERATURE.md`

The owner subsequently requested an In Progress listing. Its card lives on archive.html and is included in the search index. The page remains at its lab URL and noindex. The sitemap generator excludes comparison lab pages. Shared style, component kit, other visualization, game, and research-bundle files remain outside this change.
