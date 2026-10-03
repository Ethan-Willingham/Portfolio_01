# Soap film room

Shared fluid and optical implementation for [Descent](../../descent-lab.html).
The separate soap-film post was deleted at the owner’s request on October 3, 2026.

## Optional persistent mode and interaction

The optional oval presentation has width / height equal
to the golden ratio, (1 + sqrt(5)) / 2 = 1.61803398875. It uses the whole
computational field, mapped from a square to a disk and then scaled to an ellipse:

```text
X = u sqrt(1 - v² / 2)
Y = v sqrt(1 - u² / 2),     u,v in [-1,1].
```

The renderer and pointer mapping use the matching analytic inverse. This is
a presentation map of the square flow, not a simulation on a physical elliptical
mesh. It preserves every part of the field, including the heated lower wall.
The dimensions and measured fluid volume refer to the computational square.

Setting persistent: true creates a closed film: evaporation and drainage
coefficients are zero, rupture is disabled, and autoRenew is false. restart
restores the seeded initial thickness and velocity, resets the clock and ledger,
and retains the configured temperature. Default createRoom calls use the square,
draining and cycling film consumed by Descent. persistent and presentation are
optional initialization fields.

setTemperatureC sets the nominal lower-edge temperature from 0 to 60 °C,
initially 34 °C. The reference remains
22 °C; the declared lateral boundary modulation still applies to the difference
between heater and reference. Changing it also changes the existing lower
thermal layer by delta T exp(-(1-y/L)/0.12), allowing an immediate heat input
without renewing or recoloring the thickness field. Temperature continues through
the existing buoyancy, advection, diffusion and cooling equations.

Dragging injects a compact momentum impulse into the MAC velocities. A tap
starts an eddy. Its streamfunction is a Gaussian with radius 0.012 m, smoothly
tapered to zero at three radii and exactly zero on the square walls. Dragging
uses (vx Y - vy X) times that envelope; a tap uses 0.008 m/s times the radius.
The discrete curl supplies horizontal and vertical face velocities, so discrete
divergence cancels. No thickness or optical colors are painted by input. Drag
target speed is capped at 0.012 m/s. If accumulated face speeds exceed 0.025 m/s,
the entire velocity field is scaled uniformly, preserving its divergence and
closed boundaries. This is a documented interaction bound. Normal advection
moves the interference bands.

## Geometry and equations

The computational apparatus is a flat square, 0.16 m on each side, vertical in gravity. Screen
x points right and screen y points down. Warm liquid accelerates upward. It is
thermal convection in a chosen geometry, not Rayleigh-Taylor instability.
[Seychelles et al. (2008)](https://doi.org/10.1103/PhysRevLett.100.144501)
used a half-bubble heated at its equator. This model does not reproduce that
curvature or claim experimental calibration.

The cycling room's reduced model is shown below. Optional persistent mode uses
the same momentum and temperature equations, with E = v_d = 0 and user impulses.

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
solution. The default room has no invented time-varying force, vorticity confinement, noise
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
step permits at most two increments per call, or one when the host lowers its
work budget. Its pending ambient backlog is capped at 0.12 s; dropped ambient
debt is reported. While caught up, one room-input second is one model second.
The host controls playback, rendering, viewport sizing and suspension.

Thickness is passive in this model, so the optional thicknessResolution field
can enable a finer GPU mesh without feeding back into momentum. It requires
persistent: true. The fine grid starts from the analytic initial thickness
evaluated at its own cell centers.

The GPU implements the same closed FCT transport, face correction limits and
SSPRK2 combination as the CPU reference. Each 0.04 s ambient increment advances
the CPU flow first, then holds its final projected velocity constant during the
fine transport substeps. This is first-order coupling in time. MAC velocities
are prolonged linearly in the face-normal direction and piecewise constantly in
the tangential direction. Every fine cell therefore inherits its parent cell's
divergence. Fine transport uses CFL <= 0.45 with (|u| + |v|) bounded by twice the
maximum coarse face speed. The GPU state and arithmetic are Float32.
Thickness readbacks refresh about every 0.25 model seconds, plus mapping latency.
Snapshot and pointer sample report that diagnostic age. They read thickness
directly rather than estimating it from displayed RGB. A generation check prevents
an older pending readback from overwriting a film just reset with restart.

The room defaults to CPU medium (256²); low is 128² and high is 512².
reduceQuality conservatively averages four thickness cells and restricts and
projects the velocity field. A fine GPU grid cannot be reduced with that method.
The optional render argument filmFill sets normalized x/y limits; omitting it
uses 82% width / 84% height framing. The CPU uses Float32 arrays with JavaScript
Float64 arithmetic. Optional thickness transport and optics use WebGPU.

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

The optical room desaturates out-of-gamut negative channels toward their
computed luminance until all channels are nonnegative, then outputs linear
radiance to rgba16float. Its default exposure remains 12 for existing hosts.
The host owns tone mapping and display encoding. The shared room supplies no
color-richness control, final display pass or standalone canvas.
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
again. step runs the CPU solver and queues uploads or fine GPU thickness
transport, without starting an animation loop. render adds a pass to the caller's encoder, clears the supplied
rgba16float target and applies exposure linearly. It never submits that encoder,
configures a canvas, destroys the supplied device or changes other rooms.
debugReadback exposes h on the thickness grid, temperature and MAC velocities
on flowGrid, and includes the grid dimensions. Without fine transport these
fields share the CPU grid. The optional fine h is copied from its real GPU state.

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

Descent supplies the canvas host. Optional methods include sampleAt,
setViewingAngle, restart and budget/restriction methods; these do not
replace any required interface member. Snapshot reports diagnostic age,
parameters, current and requested quality, exact numerical substep count, model
time and units, seed provenance and measured timings. debugReadback refreshes
its diagnostics and returns h, T, MAC faces and rupture events. Dispose destroys
only room-owned buffers, textures, queries and its fetch controller. The optional
afterSubmit hook maps timestamp readbacks after the host submits; an arbitrary
host can omit it, in which case GPU timings are unavailable. No room buffer is
mapped behind a host that is still constructing an encoder.

No WebGPU device, insufficient required limits, failed asset fetch or shader
compilation causes a documented initialization error for the host to handle.
All needed data are local; after initialization a lost network connection does
not stop the live model.

## Verification

Run from the repository root:

```sh
node tools/test-soap-film-optics.mjs
node tools/test-soap-film-numerics.mjs --long
NODE_PATH=/path/to/bundled/node_modules node tools/test-soap-film-material.cjs
node tools/test-descent-contract.mjs
```

The material reference harness serves the checkout over HTTP and owns the exact process
launched through /Users/ethan/.local/bin/agent-chrome-for-testing. Both it and
the server close in finally. It never launches the owner's personal Chrome.
Set SOAP_ARTIFACTS to choose its report directory. Set SOAP_REPORT
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

The retained [numerical report](../../assets/visualizer/soap-film/checks/numerics.json)
and [three-phrase report](../../assets/visualizer/soap-film/checks/phrases.json)
record conservation, convergence and cycling-room validation. Descent maintains
its own browser and route evidence.

The [GPU thickness reference](../../assets/visualizer/soap-film/checks/material-report.json)
compares 100 closed FCT increments against the CPU reference at matching 32²
grids and with 16² flow prolonged to 32² thickness. Maximum discrepancies are
below 0.02 nm, with relative mass error below 1e-5. Larger 512² and 1024² fixtures
check positive, finite thickness and conservation. A pending readback must not
overwrite state after restart. These checks validate the optional transport;
they do not establish identical long-time trajectories across resolutions.

### Remaining limits

This is a real reduced fluid model with spectral reflection. It omits surfactant
transport, Marangoni stresses, capillary menisci, disjoining pressure, deformation
of the film surface and molecular failure. Thickness does not feed back into
momentum. Its drainage mobility, viscosity, heat diffusivity, air drag and
failure criterion are assumptions. Rupture uses a constant-speed ideal estimate
with a reservoir for retracted mass; its rim is not a hydrodynamic simulation.
There is no lateral laser or branched-light extension. Short numerical convergence
checks support implementation behavior, not long-time equivalence to an experiment.
