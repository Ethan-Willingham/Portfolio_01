# Undertow

Undertow evolves a forced, incompressible two-dimensional fluid with passive dye. It is separate from the QCD experiment. Its vortices result from the fluid calculation; dye follows the computed velocity. There is no image feedback, procedural displacement field or repeated animation clip.

## Files and entry point

- `undertow-lab.html`, `undertow.css`, `js/undertow.js`: standalone page and lifecycle host.
- `js/undertow-room.js`: GPU solver, render passes and reusable room API.
- `js/undertow-shaders.js`: independently written WGSL.
- `js/undertow-model.js`: f64 reference operators, FFT pressure solve and bounded dye transport.
- `tools/test-undertow-numerics.mjs`, `tools/test-undertow-browser.cjs`: reference and real GPU checks.
- `assets/visualizer/undertow/`: actual simulation captures, saved fallback and numerical evidence.

Serve through HTTP on localhost. Live flow needs WebGPU in a secure context. URL parameters `quality=low|medium|high` and a 16-digit hexadecimal `seed` select a replay. Low uses 64 squared velocity cells and 384 squared dye cells; medium uses 128 and 512; high uses 256 and 1024. Restart applies changes and preserves manual pause.

```sh
node tools/test-undertow-numerics.mjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-undertow-browser.cjs
```

The browser harness owns a local server and the separate Chrome for Testing executable. Both close in `finally`; the owner's personal browser is never launched headless.

## Equations and domain

The dimensionless periodic rectangle has width 2 and height 1. Its horizontal and vertical velocities occupy faces of a staggered MAC grid, while pressure occupies cell centers. With spacing hx=2/N, hy=1/N:

```text
D(u,v)[x,y] = (u[x+1,y]-u[x,y])/hx + (v[x,y+1]-v[x,y])/hy
Gx(p)[x,y]  = (p[x,y]-p[x-1,y])/hx
Gy(p)[x,y]  = (p[x,y]-p[x,y-1])/hy
DG = the five-point periodic discrete Laplacian.
```

The velocity calculation is an operator-split approximation of

```text
du/dt + (u dot grad)u = -grad(p) + nu Laplacian(u) - alpha u + f
D u = 0
```

Here nu=0.000004, alpha=0.10 and dt=1/60. RK2 backtracing and bilinear sampling advect velocity. Viscosity uses an explicit five-point stencil and drag is explicit. The viscous step satisfies the diffusion stability bound at all offered grids. Semi-Lagrangian velocity transport is dissipative; this is a browser flow experiment, not a converged turbulence calculation.

Initialization uses six seeded low-frequency stream-function modes. The force uses six higher-frequency modes whose phases drift slowly. Both use the discrete curl:

```text
u[x,y] = (psi[x,y+1]-psi[x,y])/hy
v[x,y] = -(psi[x+1,y]-psi[x,y])/hx
```

D of this construction vanishes by cancellation of discrete differences. The initial modes are discarded after initialization; forcing continues to drive the actual fluid. A drag adds a localized Gaussian momentum source. Projection follows all velocity transport and sources, including pointer forces.

After advection and forces, solve DG p = D u*, then u = u* - G p. The periodic pressure solve uses a separable, radix-2 complex FFT with bit-reversed input and Cooley-Tukey butterflies. Its symbol is

```text
lambda[kx,ky] = -4 sin(pi kx/N)^2/hx^2 - 4 sin(pi ky/N)^2/hy^2.
```

Divide each nonzero Fourier coefficient by lambda and set the zero mode to zero. The divergence has zero mean by periodic telescoping. The unnormalized inverse transform is divided by N squared when forming G p. This solves the discrete operator used by the MAC divergence and gradient. It does not substitute a different continuum wave-number Laplacian or use a collocated stencil with mismatched operators.

## Dye

Three scalar concentrations live on a separate, finer, periodic grid. Their transport uses the projected MAC velocity, sampled at the appropriate face offsets. RK2 traces both forward and reversed semi-Lagrangian paths. The correction is

```text
forward = A_dt(original)
reversed = A_minus_dt(forward)
corrected = forward + (original - reversed)/2
```

Each corrected channel is clamped to the minimum and maximum of the four original nodes around its departure position. This bounded MacCormack method reduces the diffusion of a single semi-Lagrangian step without creating negative concentration or overshoot. It is not a conservative finite-volume scheme; dye mass can change through interpolation and clipping.

Seeded dye bands supply the initial field. A weak periodic color source replenishes dye at rate 0.018, with exponential fading at 0.006. A drag adds dye through a localized Gaussian source, using a color selected from fluid time. These are explicit sources in the model, distinct from transport. There are no fabricated particle births or claimed QCD events. Concentrations remain in [0,1].

The opening view advances 720 real solver steps, or 12 units of fluid time, to develop curls before Play. Reduced motion computes the same opening state and stays paused. On slow hardware a single pending simulation batch and a capped accumulator slow fluid time instead of enlarging dt. The standalone host cancels animation while hidden or offscreen, and preserves manual pause on returning.

## Display

The whole periodic domain fits the canvas; on other aspect ratios its display proportions change. Colors distinguish the three dye channels and have no spectral or temperature meaning. To separate mixed patches, subtract 92 percent of the locally smallest concentration from each channel and apply a power of 1.35. This is an explicit contrast map, not a claim that neutral mixtures vanished from the numerical state.

Gold, blue and coral are arbitrary channel encodings. Gradient-based highlights give ribbons a raised appearance. This is illustrative lighting of two-dimensional dye, not simulated three-dimensional geometry, surface tension, depth or caustics. No spatial noise is injected into the display. The room outputs linear rgba16float; the standalone host applies c/(1+c) and sRGB encoding once. Canvas dimensions cap at 2560, DPR at 2 and area at 4 Mi pixels. The surrounding UI uses the site's palette and three fonts.

Drag or touch to stir and add dye. Space toggles pause with the canvas focused. F opens fullscreen; Escape exits the CSS fallback. Controls have 44-pixel minimum touch targets. Device loss and validation failures show an explicitly labeled saved simulation snapshot. After loading, the solver has no network dependency.

## Verification

The reference tests check discrete-curl divergence, projection of a divergent field, preservation of the mean velocity, idempotence, an FFT round trip, zero-velocity dye identity, motion and bounds.

GPU checks compare seeded velocity, Fourier projection and dye correction with independent f64 operators. Grids 16, 32, 128 and 256 are checked, including periodic seams and the pressure zero mode. At N=256, a divergent fixture with RMS about 34 is projected below 0.00005, with maximum velocity error below 0.000002. The derivative magnifies f32 rounding with grid resolution, so the tolerance also checks relative reduction. The dye comparison uses the GPU's resulting projected velocity and independently transports the original dye, including its stated source and decay.

The standalone run covers 72 units of fluid time, with captures at startup, developing, payoff and long run. It checks dye bounds and divergence, drag input, seed replay, offline continuation, keyboard controls, native and fallback fullscreen, reduced motion, missing WebGPU, visibility and offscreen suspension. Machine-readable adapter details, diagnostics, timings and captures are in `verification.json`. Safari, physical mobile devices and actual OS device-loss injection remain untested.


Measured on an Apple Metal-3 hardware adapter in Chrome for Testing, with 32 GPU timestamp samples per phase. The browser did not identify the chip model. The render target was 2560 by 1264; the final tone-map pass is excluded. These timings exclude initialization and are observations, not cross-device guarantees.

| Flow / dye grid | Simulation median / p95 ms | Rendering median / p95 ms | Room buffers MiB |
| --- | ---: | ---: | ---: |
| 64 / 384 | 0.874 / 1.525 | 2.273 / 4.633 | 6.88 |
| 128 / 512 | 0.948 / 1.768 | 2.509 / 3.179 | 12.50 |
| 256 / 1024 | 4.079 / 5.757 | 2.478 / 4.137 | 50.00 |

Run `tools/benchmark-undertow.cjs` to refresh this separate phase benchmark. The host HDR target, swap chain and transient readback are additional allocations. A 2560 by 1264 rgba16float target adds about 24.7 MiB.

## Room contract

`roomInfo` and `createRoom({device,quality,seed,assetBaseURL})` use API version 1. The room owns its buffers, pipelines and bind groups. It does not configure a canvas, create DOM, start an animation loop or destroy the host's device. `step({dtSeconds})`, `render({encoder,targetView,width,height,exposure})`, `resize`, `snapshot` and `dispose` follow the existing visualizer contract. The caller submits the render encoder. The room's numerical step submissions remain independent of that render encoder.

Optional `setPointer`, `measure`, `advanceSteps`, `waitForIdle` and `debugReadback` support inspection and tests. Measurements expose kinetic energy, maximum speed, divergence RMS, concentration bounds and means, with the step at which they were collected. They run every four seconds in the standalone host and do not silently alter the flow grid. Resource release waits for pending work and measurements.

## Sources

- [Harris, Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu): advection and pressure projection.
- [Selle, Fedkiw, Kim, Liu and Rossignac, An Unconditionally Stable MacCormack Method](https://physbam.stanford.edu/papers/stanford2006-09.pdf): forward/reverse error correction and limiting.

The MAC discretization, FFT and WGSL are implemented from equations, with no copied shader code or redistributed reference images.
