# Soap film

Open [the live comparison prototype](https://ethanwillingham.com/soap-film-lab.html).
The page starts silently. Pause, Instruments, Restart and Fullscreen are its
outer controls. Reduced motion starts with an actual still state and Play.
No source files outside the soap-film prefix are needed or changed.

## Geometry and equations

The apparatus is a flat square, 0.16 m on each side, vertical in gravity. Screen
x points right and screen y points down. Warm liquid accelerates upward. It is
thermal convection in a chosen geometry, not Rayleigh-Taylor instability.
[Seychelles et al. (2008)](https://doi.org/10.1103/PhysRevLett.100.144501)
used a half-bubble heated at its equator. This model does not reproduce that
curvature or claim experimental calibration.

The reduced model is

```text
u_t + u.grad u = -grad p + nu laplacian(u)
                  - g beta (T - T0) e_y - alpha u
 div u = 0
T_t + u.grad T = kappa laplacian(T) - c (T - T0)
h_t + div(h u + j_drain) = -E
j_drain = v_d h (h / h_ref)^2 e_y
```

Here p is kinematic pressure (pressure divided by constant reference density).
The thickness equation uses meters analytically; arrays store nanometers. All
fluxes use the same thickness units and convert to cubic meters in the ledger.
Drainage is a cubic constitutive law with an effective mobility, a chosen
approximation to gravity-driven drainage. It is not derived from a calibrated
surfactant constitutive model. Downward flux crosses cell faces and leaves at
the bottom. A closed incompressible flow alone cannot drain uniform h. This
implementation separates that flux from incompressible advection and from
uniform evaporation.

| Coefficient | Value | Meaning |
| --- | --- | --- |
| L | 0.16 m | square-frame side, assumed apparatus size |
| nu | 1.0e-6 m²/s | effective kinematic viscosity |
| kappa | 1.2e-6 m²/s | effective in-plane thermal diffusivity |
| g | 9.81 m/s² | gravity magnitude |
| beta | 2.0e-4 K⁻¹ | assumed thermal expansion coefficient |
| alpha | 1 s⁻¹ | linear effective air drag |
| T0 | 22 °C | cooling reference and upper-edge temperature |
| lower heating | 12 K | temperature rise before the spatial modulation |
| c | 0.025 s⁻¹ | relaxation of T toward the ambient temperature |
| E | 0.7 nm/s | evaporation, uniform while intact |
| v_d | 0.000055 m/s | drainage mobility at h_ref |
| h_ref | 800 nm | drainage constitutive reference thickness |
| failure criterion | 18 nm | minimum cell thickness that opens a hole |
| gamma | 0.03 N/m | assumed surface tension for the hole estimate |
| rho | 1000 kg/m³ | assumed liquid density for the hole estimate |

These are selected effective coefficients, not measured values for a soap
solution. There is no invented time-varying force, vorticity confinement, noise
texture, particle blob scheduler or soundtrack.

All four walls are impermeable to u, with free-slip tangential velocity. The
pressure correction has homogeneous Neumann conditions. Temperature ghost
cells at the top are T0; the lower ghosts are

```text
T0 + 12 [1 + 0.15 cos(2 pi x/L) + 0.08 sin(6 pi x/L)] °C.
```

Side temperature ghosts have zero normal gradient. Temperature is advected
with the projected velocity, diffuses and cools. Its boundary values enter the
same finite-difference diffusion operator. The temperature boundary location
has a half-cell discretization error. Thickness has zero advective wall flux,
zero drainage influx at the top, and outward drainage at the bottom; there is
no hidden continual replenishment while a film is intact.

The initial thickness is a smooth vertical gradient, from approximately 140
to 1120 nm, with two declared sinusoidal perturbations. The initial temperature
has a warm lower boundary layer and a 0.35 K asymmetric perturbation. The fixed
hex seed selects the phase of that perturbation. Subsequent apparatus renewals
advance the initial thickness phase by 0.71 radians per film. There is no
Math.random call, external beacon, quantum randomness claim or network seed
requirement. Restart returns to the first seeded state and resets the ledger.
An exact cross-device floating-point replay is not promised.

## Numerical method and clock

Momentum uses a MAC staggered grid: pressure, thickness and temperature at
cell centers, horizontal and vertical velocities on their respective faces.
Velocity transport is semi-Lagrangian and dissipative. Viscosity is explicit;
linear drag is implicit. Temperature uses semi-Lagrangian advection and explicit
diffusion and cooling. The heat advection is not a conservative energy solver.

A consistent discrete divergence and gradient form the pressure equation.
Geometric multigrid uses red-black Gauss-Seidel smoothing, conservative residual
restriction, bilinear correction prolongation and a small coarse-grid solve.
The discrete equation is L q = D u, with q = dt p / dx. The right hand side's
roundoff mean is removed for Neumann compatibility. Each projection runs up to
six V cycles, stopping at a max discrete residual of 2e-8 m/s. The instrument
reports that residual divided by dx², in 1/(m s), and measures the corrected
velocity divergence separately in 1/s. Hitting the cycle cap is possible and
the actual residual remains visible; convergence is not assumed.

Thickness uses conservative flux-corrected transport. A monotone donor-cell
base is corrected toward a monotonized-central reconstruction. Face corrections
are limited by adjacent cells' positive and negative budgets, preserving local
bounds relative to the source neighborhood and the low-order state. A separate
conservative drainage flux follows, with donor outflow bounded by available
fluid. Evaporation is removed separately and cannot make h negative. Two
transport stages are combined by SSP RK2. The drainage/advection splitting
and dissipative momentum transport limit accuracy; this is not a high-order
quantitative thin-film solver.

The stable substep obeys explicit diffusion and an advective CFL bound. A
0.04-second ambient increment is split into as many stable substeps as needed.
The standalone loop renders independently, with at most two increments per
call, or one when cost rises. Its pending ambient backlog is capped at 0.12 s;
dropped ambient debt is reported. While caught up, one room-input second is one
model second. The standalone host defaults to 3× playback, passing three model
seconds per wall second, with 1×, 2× and 4× also available in Instruments.
Changing playback speed preserves the current state and stable solver steps.
Under load the piece plays slower in wall time. Hidden and
offscreen states perform no simulation or rendering, and a manual pause survives
those changes.

The standalone default begins at 128², medium is 256², and high is 512². The
room module retains its medium default for other hosts. The standalone host
first reduces its per-frame work budget when the measured p95 exceeds 26 ms.
If p95 stays over 32 ms after 100 samples, it halves the grid, stopping at 128².
This restriction averages thickness over four cells, preserving area-integrated
volume; face velocities are restricted and projected again. It retains model
time, fluid ledger, seed, temperature, hole and apparatus cycle. It does not
change coefficients or secretly renew the apparatus. Instruments and the caption
report the change. Explicitly choosing a grid disables automatic reduction.
The standalone stage fills the available viewport below a compact heading,
with the playback controls visible at the bottom. Its square film uses 96% of
the available width, capped by the stage height minus 64 CSS pixels reserved
for labels. Pointer sampling uses the same geometry. The optional render
argument filmFill sets normalized x/y limits; omitting it retains the room's
original 82% width / 84% height framing for existing hosts.
Canvas DPR is capped at 1.5. The CPU model uses Float32 state arrays and
JavaScript Float64 arithmetic; optics and composite are rendered in WebGPU.
No GPU fluid solver or 1024² performance is claimed.

## Optics and presentation

[CIE's 1931 observer](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer)
and [D65 illuminant](https://cie.co.at/datatable/cie-standard-illuminant-d65)
are the supplied official 1 nm tables, with their original metadata and
CC BY-SA 4.0 attribution in assets/visualizer/soap-film/ATTRIBUTION.md. Input
MD5 checks are part of the test. The lookup and derived still use the same
license. [NIST SCATMECH's inspected thin-film implementation](https://pages.nist.gov/SCATMECH/code/filmtran.cpp)
uses separate s and p layer matrices and internal propagation angles. This
single symmetric lossless layer uses the algebraically reduced amplitudes.

Air has n = 1; the film has a nondispersive water-like n = 1.333. This is an
assumption, not a measured refractive index for a specific detergent. Thickness
and wavelength both use nanometers in the phase calculation. Snell's law gives
sin(theta_film) = sin(theta_air)/n_film. For each polarization,

```text
phi = 4 pi n_film h cos(theta_film) / lambda
R = 2 r² (1 - cos phi) / (1 + r⁴ - 2 r² cos phi)
```

The sign reversal at the air-to-film interface is retained through the symmetric
layer amplitudes. s and p reflectances are averaged for unpolarized light.
The illuminant is directional D65 white reflected from the selected external
angle, default 18 degrees, against a dark transmitted background. The image
maps film coordinates to a square; it does not show geometric foreshortening.
The viewing-angle control changes the optical incidence, not the convection.

XYZ is the 360 to 830 nm rectangle sum of D65 R times the color-matching
functions, normalized by the D65 y-bar sum. The standard XYZ-to-linear-sRGB
matrix follows integration. The baked 4096 × 31 lookup spans 0 to 4095 nm at
1 nm increments and 0 to 60 degrees at 2-degree increments. It stores unclipped
linear Float32 RGB. Thickness and angle lookup interpolation is linear. The
renderer's thickness reconstruction is bilinear and has no feedback trails.
If thickness exceeded 4095 nm the optical lookup would clamp; diagnostics retain
the true value. Tested runs stay inside that range.

Only out-of-gamut negative channels are desaturated toward their computed
luminance until all channels are nonnegative. Exposure multiplies linear
radiance by 12. The standalone host tone maps once with 1 - exp(-radiance), then
encodes sRGB. The room itself outputs linear radiance to rgba16float. There is
no bloom, extra hue ramp, luminance lift for black film or model-driving dither.
The frame has a dim neutral apparatus reflection. After renewal the illumination
shutter opens over six model seconds with smoothstep, without altering h. This
presentation fade is separate from physical state and mass accounting. It is
not a photosensitivity certification.

## Rupture and renewal

A hole starts at the actual minimum-thickness cell once h <= 18 nm. This is a
phenomenological failure rule. [Experimental soap-film work](https://pubs.aip.org/aip/pof/article/35/5/057116/2890229/The-stability-of-magnetic-soap-films)
discusses stabilization and black films. Molecular disjoining pressure and black-film
stabilization are absent; a real stabilized black film need not rupture.
After initiation, hydrodynamics freeze and a circular hole expands. The ideal
Taylor-Culick estimate is

```text
U = sqrt(2 gamma / (rho h_mean)) [m/s]
r_display(t + dt) = r_display(t) + U dt / 240 [m]
```

h_mean is the area-mean thickness at initiation, converted from nm to m. The
estimate assumes a uniform ideal film and two surfaces. Per unit front
length, surface tension supplies 2 gamma, balanced by the incoming momentum
flux rho h U². gamma has units kg/s² and rho h has units kg/m²; their ratio
has units m²/s², giving U in m/s. Applying one
representative speed to a nonuniform film is a kinematic approximation, not a
rim-flow solution. Radius divided by the 0.16 m side maps to film UV coordinates.
The replay is deliberately slowed 240 times; the interface states this, and
the clock is labelled model time. Cells inside the moving hole become zero
thickness; their liquid enters a separately accounted rim reservoir. No
optical color is used to decide rupture.

When the hole covers the frame, all remaining liquid and the rim are removed by
the apparatus. It rests five model seconds, then resets h, temperature and u,
adding the new film volume to cumulative replenishment. There is no claim that
one intact film conserves mass through removal and renewal. The ledger is

```text
film volume + rim volume + evaporated + drained + apparatus-removed
    - replenished = measured floating-point balance error.
```

The remaining-film observables read h directly; pointer sampling also reads T.
Touch starts with the center sample and moves it when the film is touched.
The rendered hole mask follows the kinematic radius; its subpixel boundary and
the discrete cell-removal boundary can differ by one cell.

## Room interface and example host

js/soap-film-room.js exports roomInfo and createRoom. Importing it has no page
side effects. resize uses physical pixel dimensions; dpr is not multiplied
again. step runs the CPU solver and queues state uploads, without starting an
animation loop. render adds a pass to the caller's encoder, clears the supplied
rgba16float target and applies exposure linearly. It never submits that encoder,
configures a canvas, destroys the supplied device or changes other rooms.
The room's model-specific CPU fields are available through debugReadback.
Hydrodynamics are CPU, so the GPU reference test covers actual GPU optics and
compositing, not an invented GPU fluid readback.

```js
import { createRoom } from './js/soap-film-room.js';
const room = await createRoom({ device, seed: '51a9f17c', quality: 'medium' });
room.resize({ width, height, dpr: 1 });
room.step({ dtSeconds: 1/60, elapsedSeconds: 0, scoreSeconds: 0 });
const encoder = device.createCommandEncoder();
room.render({ encoder, targetView, width, height, exposure: 12 });
device.queue.submit([encoder.finish()]);
room.afterSubmit(); // Optional GPU timestamp collection, after submission.
console.log(room.snapshot());
// A host-owned display pass performs tone mapping and sRGB encoding.
room.dispose();
```

The complete canvas host is js/soap-film.js. Extra standalone controls use
sampleAt, setViewingAngle, restart and budget/restriction methods; these do not
replace any required interface member. Snapshot reports diagnostic age,
parameters, current and requested quality, exact numerical substep count, model
time and units, seed provenance and measured timings. debugReadback refreshes
its diagnostics and returns h, T, MAC faces and rupture events. Dispose destroys
only room-owned buffers, textures, queries and its fetch controller. The optional
afterSubmit hook maps timestamp readbacks after the host submits; an arbitrary
host can omit it, in which case GPU timings are unavailable. No room buffer is
mapped behind a host that is still constructing an encoder.

No WebGPU device, insufficient required limits, failed asset fetch or shader
compilation causes a documented initialization error. The standalone host catches
it and shows an explicitly labelled computed initial-state still. Device loss
stops work and shows that still. This fallback is a spectral calculation, not
a substitute animated solver. All needed data are local; after initialization,
a lost network connection does not stop the live model.

## Verification

Run from the repository root:

```sh
node tools/test-soap-film-optics.mjs
node tools/test-soap-film-numerics.mjs --long
NODE_PATH=/path/to/bundled/node_modules SOAP_LONG=1 node tools/test-soap-film-browser.cjs
```

The browser harness serves the checkout over HTTP and owns the exact process
launched through /Users/ethan/.local/bin/agent-chrome-for-testing. Both it and
the server close in finally. It never launches the owner's personal Chrome.
Set SOAP_ARTIFACTS to choose the screenshot/report directory. Set SOAP_REPORT
for the numerical JSON. The accelerated phrase test uses the same sequence of
0.04 s increments at faster wall-clock pacing; coefficients stay unchanged.

Numerical results and hardware measurements are recorded below after the final
verification run. These are implementation checks of a reduced model. Short
step/grid convergence does not establish long-time experimental fidelity,
and the threshold cannot predict the lifetime of a real soap film.

### Original recorded results, October 3, 2026

The final run used an Apple M1 Pro, macOS, headless Chrome for Testing, and an
Apple metal-3 WebGPU adapter reporting isFallbackAdapter = false. These are
hardware results, not a software-adapter estimate. Hydrodynamics ran on the CPU.
Float32 state, a 0.04 s ambient update (nominal 25 updates/s), stable internal
substeps and a 1078 × 550 rgba16float image were used. GPU costs use timestamp
queries with 92 samples. CPU solver costs use the last 240 active updates at
about 60 model seconds; rest and hole replay are excluded from solver samples.

| Cost | Median | p95 |
| --- | --- | --- |
| CPU fluid solver, 256², per 0.04 s increment | 52.9 ms | 54.8 ms |
| CPU fluid solver, 128², per 0.04 s increment | 8.9 ms | 9.2 ms |
| GPU spectral lookup, gamut map and linear composite | 0.170 ms | 0.181 ms |
| GPU final tone map and display encoding | 0.226 ms | 0.237 ms |
| CPU encoding/submitting both render passes | 0.10 ms | 0.20 ms |

The original 2 to 4 ms hypothesis does not hold for this CPU fluid solver at
128² or 256². The original default depended on automatic restriction on this machine;
256² can be retained explicitly for slower playback. 512² is available but
has not been given a long-run performance or convergence claim. GPU optical
costs above are for the 256² developing state. The 128² run has only one GPU
timestamp sample and is not used for a second GPU percentile estimate.

| Numerical check | Measured result | Test tolerance |
| --- | --- | --- |
| closed Float64 thickness transport, 1000 steps | relative volume error 2.22e-16; bounded, positive h | mass < 1e-12; extrema within 1e-8 nm |
| closed full Float32 solver, uniform h, 8 s | relative mass error 1.44e-7; h = 599.990 to 600.012 nm | mass < 1e-6; h within 0.1 nm of 600 |
| independent divergent MAC fixture, 64² | max projected divergence 7.44e-7 s⁻¹ | < 1e-5 s⁻¹ |
| lower-center buoyancy after the first step | mean v = -4.25e-6 m/s, upward | negative screen-y velocity |
| dt refinement, 32² at 4 s | 40/20 ms RMS 0.00236 nm; 20/10 ms RMS 0.00115 nm | decreasing RMS difference |
| grid refinement, 15 s | 32/64 RMS 1.548 nm; 64/128 RMS 1.117 nm | decreasing RMS difference |
| Float32 versus Float64 at 2 s | thickness RMS 0.000536 nm | < 0.01 nm |
| official CIE checkpoints, 12 thicknesses | max XYZ error 2.78e-17 | < 1e-12 |
| small GPU versus CPU spectral/composite case | max linear RGB error 5.08e-5, 9 channels | < 1e-4, including rgba16float quantization |
| 256 to 128 conservative restriction | volume difference -5.14e-18 m³; model-time difference 0 | volume < 1e-14 m³; time unchanged |

The optical tests additionally verify the two official MD5 checksums, R(0) = 0,
0 <= R <= 1 over sampled thickness/wavelength/angle combinations, normal-incidence
phase minima at h = lambda/(2 n), maxima at h = lambda/(4 n), and darkening of
very thin layers. These tests do not invert an RGB image to estimate thickness.
The 256² developing state reports max divergence 2.79e-5 s⁻¹ and pressure-equation
residual 0.0444 1/(m s), consistent with the documented discrete stopping bound.

The accelerated browser run at 128² completed three full phrases. Holes began
at 171.72, 353.48 and 535.44 model seconds, each at a measured minimum just below
18 nm. The final volume ledger error was -6.70e-14 m³, approximately 9.76e-7 of
cumulative supply. An independent 64² run completed three phrases by 589.44 s
with a relative ledger error of about 9.90e-8. Its first rupture was at 186.36 s,
showing that the lifetime is sensitive to discretization. These are numerical
film lifetimes under a selected criterion, not laboratory predictions.

Desktop 1440 × 900, portrait 390 × 844, and landscape 844 × 390 were visually
inspected. The browser checks passed keyboard pause/play, manual pause through
hidden/offscreen suspension, Instruments, angle changes, real fullscreen, resize,
20 px phone gutters, 44 px controls, touch sampling, reduced-motion startup,
repeatable seed initialization, network loss after load, missing WebGPU and
explicit device loss. No script, shader or WebGPU validation errors were captured.
Automatic reduction's state transfer was tested directly; the thresholds are
cost-dependent and do not promise a particular update rate on every device.

Saved evidence:
[startup](../../assets/visualizer/soap-film/checks/startup.png),
[developing convection](../../assets/visualizer/soap-film/checks/developing.png),
[thinning](../../assets/visualizer/soap-film/checks/thinning.png),
[rupture](../../assets/visualizer/soap-film/checks/rupture.png),
[portrait](../../assets/visualizer/soap-film/checks/portrait.png),
[landscape](../../assets/visualizer/soap-film/checks/landscape.png), and
[fallback](../../assets/visualizer/soap-film/checks/fallback.png).
The machine-readable [numerical report](../../assets/visualizer/soap-film/checks/numerics.json),
[browser report](../../assets/visualizer/soap-film/checks/browser.json) and
[three-phrase report](../../assets/visualizer/soap-film/checks/phrases.json)
retain parameters, diagnostic ages, seeds, grids, counters and timings.

### Faster playback and larger default view, October 3, 2026

The updated standalone starts at 128² and requests 3× playback. On the same
Apple hardware adapter, the browser measured 2.99 model seconds per wall second
over a three-second sample of developed flow, versus 1.01 at the 1× setting.
Solver increments remain 0.04 model seconds with the same stable substeps and
physical coefficients. The speed control acts immediately without renewal or
changing manual pause.

At 1440 × 900 the stage is now 1358 × 729 CSS pixels, and the square film has
a 665 px side rather than 462 px, about 2.07 times its original visible area.
The default controls fit within the viewport at 1440 × 900, 390 × 844 and
844 × 390. Portrait retains the site's 20 px gutter. All original browser
interaction and fallback checks passed, with no captured script or WebGPU errors.
The enlarged GPU composite measured 0.220 ms median / 0.275 ms p95 over 93
timestamp samples. CPU solver increments measured 9.1 / 9.4 ms at 128².
The independent GPU optical reference still differs from the CPU calculation by
at most 5.08e-5 linear RGB, below the 1e-4 tolerance.

Updated evidence: [default view](../../assets/visualizer/soap-film/checks-v2/startup.png),
[developed film](../../assets/visualizer/soap-film/checks-v2/developing.png),
[portrait](../../assets/visualizer/soap-film/checks-v2/390x844.png),
[landscape](../../assets/visualizer/soap-film/checks-v2/844x390.png), and
[browser report](../../assets/visualizer/soap-film/checks-v2/report.json).
The fluid and optical equations are unchanged; the earlier numerical and
three-phrase results remain the model validation record.

### Remaining limits

This is a real reduced fluid model with spectral reflection. It omits surfactant
transport, Marangoni stresses, capillary menisci, disjoining pressure, deformation
of the film surface and molecular failure. Thickness does not feed back into
momentum. Its drainage mobility, viscosity, heat diffusivity, air drag and
failure criterion are assumptions. Rupture uses a constant-speed ideal estimate
with a reservoir for retracted mass; its rim is not a hydrodynamic simulation.
There is no lateral laser or branched-light extension. Short numerical convergence
checks support implementation behavior, not long-time equivalence to an experiment.
