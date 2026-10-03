# Hydrogen Exactly

Comparison prototype: [live page](https://ethanwillingham.com/hydrogen-exactly-lab.html).
No homepage, hub, archive, shared style or existing visualization changes.

Owned paths: hydrogen-exactly-lab.html, hydrogen-exactly.css,
js/hydrogen-exactly.js, js/hydrogen-exactly-room.js,
js/hydrogen-exactly-math.js, js/hydrogen-exactly-shaders.js,
js/hydrogen-exactly-beacon.js, assets/visualizer/hydrogen-exactly/,
tools/test-hydrogen-exactly-numerics.mjs,
tools/test-hydrogen-exactly-browser.cjs and this document.

## Implemented model

The fixed, infinite-mass nucleus Hamiltonian is H = -laplacian/2 - 1/r in
atomic units. E_n = -1/(2 n^2). Length is measured in Bohr radii a0;
time in hbar/Eh. The wavefunction is the finite sum of normalized
hydrogenic R_nl Y_lm eigenstates with independently evolving exp(-i E_n t).
Density is the squared magnitude of that complete complex sum.

The radial function uses generalized Laguerre recurrence and log-factorial
normalization. Spherical harmonics use the Condon-Shortley convention,
Y_l,-m = (-1)^m conjugate(Y_lm), with exp(i m phi) for positive m.
Circular states are evaluated in cylindrical coordinates using the equivalent
combined logarithmic normalization, avoiding both enormous factorials and
singular polar division. The value on the circular-state axis is explicitly
zero. atan2(0,0) is never sent through the shader's complex phase.

JS f64 computes phase differences and reduces them modulo 2 pi before
uploading f32 cosine/sine coefficients. CPU and GPU debug amplitudes remove
the same unobservable common phase exp(-i E_reference t), where the reference
is the first basis state's energy. To restore the convention in the stated
wavefunction, multiply debug psi by that common phase. Density, interference,
autocorrelation magnitude and rotation-adjusted overlap do not change.

Degenerate states share their n energy regardless of l or m. No fine structure,
Lamb shifts, finite nuclear mass, fields, radiation, environmental decoherence,
or continuum states are included. Exact eigenstates of this chosen model are
evaluated numerically; the piece is not an approximation-free hydrogen atom.

## Two states and their clocks

The default packet has n = 24 through 36, l = m = n-1, n0 = 30 and sigma = 1.5.
Its real amplitudes are exp(-(n-30)^2/(4 sigma^2)), normalized over that finite
list. They match the supplied proposed coefficient list to 1e-15. Positive
coefficients and the stated angular phase convention put the initial packet
near negative x. The starting width was retained after localization and
overlap evaluation; it was not calibrated against an experimental figure.

The local display clock maps one second to 2 pi 30^3 / 10 atomic time units.
One classical orbit is approximately 10 display seconds. The organizing scales
are T_rev = 200 and T_sr = 4500 display seconds, from the derivative expansion.
The energy sum always uses the full -1/(2 n^2) spectrum, never a quadratic fit.
The circular scale is n0^2 a0 = 47.62594894896 nm. Its cube has half-side 1700 a0.

The spectral mode uses 2p_z, 3s, 4s and 5s, with real amplitude 0.5 each.
It maps one display second to 24 atomic time units. Its highest-state extent
scale is 5^2 a0 = 1.32294302636 nm; cube half-side is 85 a0. This is a declared
characteristic scale, not a measured density boundary. It does not receive the
Rydberg revival score. Spectral speed is capped at 4x; Rydberg acceleration up to
64x is an explicit replay control. Physical time and display time stay separate.

There is no worldwide epoch, live beacon request, or random initial condition.
The room records the host seed but does not use it. An optional Instruments
button verifies the bundled historical quicknet round-42 fixture with pinned
drand-client 1.4.2. Only after SHA-256 and BLS signature verification succeeds
does the host show Verified and cache the fixture's seed in localStorage.
The chain hash, G2 public key and bls-unchained-g1-rfc9380 scheme are pinned
in the audit module. This historical seed does not change the deterministic
model; the UI and snapshot say so. No PRNG draws are claimed as physical entropy.
Browser tests change the signature and recompute its SHA-256 randomness, then
verify that the BLS check rejects it. The verifier and fixture are bundled,
so verification requires no external service. Audit failure cannot stop playback.
Replay is analytic and deterministic in its parameters; transcendental
functions and GPU floating-point arithmetic are not promised bit-identical
across devices. Pause, hidden/offscreen suspension and Restart use a local
clock. Pausing stops it; Restart sets it to zero without overriding manual pause.

## Computed events, including the failed strong-return claim

The overlap is |sum |c_n|^2 exp(-i E_n t)|^2. The rotation-adjusted overlap
maximizes that expression after adding -m phi to each phase. The UI searches
512 rotations; numerical event evidence searches 1024 (0.00614 rad spacing).
This is a wavefunction overlap allowing an orbital rotation, not an assertion
of exact density-shape equality.

Prominent peaks below are measured on an actual r = 900 a0, z = 0 spatial cut
with 720 angular samples and a 22% peak-height threshold. They are not cloud
instances. Integrating through the volume softens these maxima, so broad
subsidiary packets need not appear as isolated disconnected spheres.

| Display time, s | Initial overlap | Overlap allowing rotation | Prominent cut peaks |
| --- | --- | --- | --- |
| 0 | 1.0000 | 1.0000 | 1 |
| 30 | 0.1763 | 0.3356 | 3 |
| 50 | 0.3755 | 0.4419 | 2 |
| 66.6667 | 0.2996 | 0.3798 | 3 |
| 198.4 | 0.6262 | 0.7323 | 1 |
| 750 | 0.1787 | 0.4542 | 3 |
| 798.1 | 0.8053 | 0.8171 | 1 |

198.4 s was selected by a local scan over 185 to 205 s. The later return at
798.1 s was selected in a scan over 675 to 825 s. These are local representative
events, not proved global maxima. At precisely 200 s the adjusted overlap is
about 0.718. At 100 s it is about 0.706, while initial-position overlap is only
about 0.0005. Thus shape recovery and positional return can differ greatly.

For these coefficients and full energies, the paper's suggested T_sr/6 time,
750 s, does not demonstrate a strong superrevival. Instruments includes it
with that explicit limitation. Fraction denominators are not used as copy
counts. There is no forced perfect revival, duplicated cloud, or scheduled
replacement of the wavefunction.

## Spectral-frequency false color

Every pair contributes its signed density cross term. Frequency is the
angular difference |E_a-E_b|/hbar; wavelength is h c / (|E_a-E_b| Eh).
With the bundled constants, the ideal vacuum 2/3, 2/4 and 2/5 pairs are
656.112276, 486.009094 and 433.936691 nm. The remaining low-n pairs are infrared.
The 29/30 Rydberg beat is approximately 1,169,048 nm, also infrared. It never
receives a Balmer hue. Ultraviolet and infrared receive no visible spectral hue.

The original CIE 1931 2-degree observer CSV is bundled unchanged, SHA-256
fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1.
Linear interpolation obtains XYZ. The standard D65 white-point sRGB matrix
converts XYZ to linear RGB; negative channels are clipped and the largest
channel normalized to one. This is a display gamut and brightness treatment,
not spectroradiometry. No illuminant multiplication is applied to these
monochromatic frequency labels. The bundled metadata retains attribution,
license and checksums; punctuation in its standard title is normalized to a hyphen.

The spectral overlay blends visible-pair hues using absolute signed-cross-term
weights. Infrared contributes to density but not the visible hue mixture. This
positive beauty color never substitutes for density. The separate signed 2p/3s
view uses the pair's red hue for positive sign and a neutral cool diagnostic
for negative sign, labelled in Instruments. A probe at (0,0,3) a0 reports both
the signed term and the complete positive density.

This is density interference, not emitted light. No state radiates its assigned
color merely by being occupied. Actual emission obeys selection rules. The
NIST air-visible multiplet components and UV vacuum components remain separate
records in hydrogen-reference.json. They are not added as inconsistent energy
shifts to the ideal Hamiltonian or merged into one exact line.

## Renderer, precision and resource use

One compute pass evaluates the states into a 3D rgba16float presentation
texture. Alpha stores rho times domainHalfSide^3; RGB stores that scaled density
times the local display color. Scaling avoids underflow of physical high-n
densities in f16. Complex amplitudes and physical diagnostics are evaluated in
f32 before storage. No f16 coefficients, basis states or phases are used.

The default view draws six density contours from this trilinearly sampled
texture, at rhoScaled = 0.3, 0.9, 2.7, 8.1, 24.3 and 72.9. Newly reached higher
contours along each ray are refined by five bisections. The highest level reached
is shown, with its first surface normal estimated by centered voxel differences.
This reveals nested bands without mixing their colors into a pale cloud.
The contour thresholds omit faint tails from the image, not from the field or
captured-mass calculation. Surface illumination is a display aid, not light
emitted by the atom. Ray steps can miss a thin contour and the grid can soften
or displace a boundary; these are presentation errors.

Contour lighting uses a fixed world-space directional key, a camera-side fill,
and a tight halfway-vector highlight. Normals face the viewer, with Lambert
diffuse rather than equal illumination of both sides. Eight field samples toward
the key attenuate illumination where the same density level blocks it. Lighting
is evaluated once at the final chosen surface, rather than at every crossing.
A faint circular reference plane at normalized z = -0.27 has a sparse grid and
a soft shadow from 16 density samples toward the key. It fades at grazing angles
and vanishes when viewed from underneath. This synthetic receiver is composited
behind the contours and never obscures them. It is a visual guide, not a physical
surface, electron trajectory, or emitted-light prediction. Neither shadows nor
illumination modify the stored density, CPU/GPU probes, or mass calculation.

The circular packet defaults to density false color. A linear-RGB palette goes
from teal through blue, violet and pink to gold, using
t = clamp(log2(max(rhoScaled,0.3)/0.3)/6,0,1). These hues encode density alone;
they are arbitrary colors and do not represent visible Rydberg beats. Neutral
density remains selectable. Low-n mode defaults to the CIE frequency encoding.

The optional soft volume retains midpoint ray quadrature and synthetic
absorption/emission: alpha = 1-exp(-0.14 rhoScaled^1.4 ds) for the circular view,
and 1-exp(-0.26 rhoScaled ds) for the spectral view. Emission is multiplied by
2.6 and composited front to back. None of these display mappings enter norm,
phases, mass, or overlap. All views use linear color. The host adds its token
background, applies Reinhard mapping once, and converts once to sRGB. Exposure
multiplies linear room radiance. There is no bloom, temporal trail, noise,
dither, fluid warp, or animated camera driving the model.

The 2D view evaluates complex psi directly in the fragment shader, without
volume interpolation: xy equatorial plane for the circular packet, xz plane
for the spectral state. Brightness is
3.2 smoothstep(0.18,0.35,rhoScaled)(1-exp(-0.10 rhoScaled)). Analytic nodes
are dark. The volume's interpolation and finite pixels/rays can soften them;
no filament is presented as positive probability at a node.

| Quality | Grid | Maximum ray samples | Volume bytes |
| --- | --- | --- | --- |
| Low | 64 cubed | 96 | 2,097,152 |
| Medium (default) | 128 cubed | 160 | 16,777,216 |
| High | 160 cubed | 224 | 32,768,000 |

The host additionally owns a full-size rgba16float scene target. DPR is capped
at 2 and the long render dimension at 1800 pixels. The page uses the available
width, a compact header, and a stage sized to leave playback controls in view.
The orthographic camera frames the occupied orbit rather than the full render
box. Portrait volume views rotate the projection by 90 degrees and offset the
camera tilt by -0.32 radians, giving a default tilt of 0.6 radians. Framing
widens toward an overhead view so the rotated orbit fits the narrow canvas.
The box and density diagnostics are unchanged. Device limits, adapter and
shader validation are checked. Optional timestamp-query support is recorded;
the current benchmark uses queue completion rather than timestamp queries.
The fixed local clock ticks at 30 Hz, with at most two ticks per animation
frame. Since evolution is a pure analytic function, only the last needed tick
is evaluated for that frame. Extended slow windows reduce evaluation cadence
before reducing the volume grid. They do not alter the spectrum or time scale.

Hidden and offscreen demos stop scheduling work. Manual pause survives those
changes. Reduced motion starts with the actual GPU t=0 still and Play.
Missing WebGPU, local-data failure, and device loss show an explicitly labelled
CPU-computed t=0 density section. The standalone host catches initialization
errors. This fallback is a scientific section of the same packet, not a running
volume. Disposal aborts owned fetches, disconnects observers, removes listeners,
cancels animation, destroys owned buffers/textures and releases its own device.
The room itself never destroys the supplied host device.

Mouse or one-finger dragging rotates the 3D camera in both contour and soft
volume views. Pointer capture keeps the gesture active across the canvas edge;
release, cancellation, lost capture, hidden/offscreen suspension and disposal
end it. The canvas permits browser pinch zoom while taking one-finger gestures
for rotation. Arrow keys rotate a focused canvas, Shift increases the angle,
and Home or Instruments > Reset view restores the starting camera. Rotation
does not resume a paused packet or start evolution under reduced motion. The
analytic 2D section keeps its stated plane and disables camera gestures.

Yaw and tilt wrap to bounded angles without pole clamps, inertia or automatic
spinning. Multiple pointer updates share one pending presentation redraw; the
normal animation frame can satisfy that redraw too. Camera-only changes update
uniforms and reuse the existing density texture. They neither recompute the
field nor invalidate a measured box mass, increment the numerical step count,
or change the clock, coefficients, energy phases and physical diagnostics.

## Reusable room and example host

js/hydrogen-exactly-room.js implements apiVersion 1, id hydrogen-exactly.
Imports have no DOM side effects. The required createRoom, resize, step, render,
snapshot, debugReadback and dispose interface is implemented. The seed is recorded
as unused deterministic provenance. Mode-specific representativeScaleMeters
and scaleMeaning are provided in snapshot; consumers should use them rather
than assuming the roomInfo default is valid in spectral mode.

render clears and writes the supplied full-size rgba16float target, applies
exposure linearly and adds a pass to the host encoder without submitting it.
step submits the room's own compute command buffer. The host owns the canvas,
device, output target, presentation, loop and tone mapping. Extra methods are
setMode, setPresentation, setQuality and benchmark. Slow mass readbacks include
their score timestamp and age; absent measurements are null with an explicit
unavailableMeasurements entry. Numerical step count counts analytic evaluations,
not differential-equation integration substeps.

An example host, with device and target already owned by the caller:

```js
import { createRoom } from './js/hydrogen-exactly-room.js';
const room = await createRoom({ device, seed: '00000030', quality: 'medium',
  assetBaseURL: new URL('./assets/visualizer/hydrogen-exactly/', location.href).href });
room.resize({ width, height, dpr: 1 }); // physical pixels, no extra DPR multiply
room.step({ dtSeconds: 1/60, elapsedSeconds: 1/60, scoreSeconds: 1/60 });
const encoder = device.createCommandEncoder();
room.render({ encoder, targetView: target.createView(), width, height, exposure: 1 });
// Add host tone mapping/presentation to this encoder, then submit it.
device.queue.submit([encoder.finish()]);
const diagnostics = await room.debugReadback();
room.dispose(); // does not destroy device or target
```

The standalone js/hydrogen-exactly.js is a complete example host. The browser
test also runs two independent rooms on one supplied device, disposes one and
then verifies the second remains usable. There are no known unmet required room
contract methods. A host must serialize debug readback against stepping if it
needs a single frame's measurement. Shader initialization requires WebGPU and
the bundled observer table and throws HydrogenInitializationError on failure.

## Checks and measured results

Run:

```sh
node tools/test-hydrogen-exactly-numerics.mjs
NODE_PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tools/test-hydrogen-exactly-browser.cjs
node --check js/hydrogen-exactly.js
node --check js/hydrogen-exactly-room.js
node --check js/hydrogen-exactly-math.js
node --check js/hydrogen-exactly-shaders.js
```

The numerical test regenerates the computed CPU still and event evidence in
the owned assets directory. The browser test owns its HTTP server and exact
Chrome for Testing child, closing both in finally. It never launches personal
Chrome. Screenshots, detailed probes and JSON measurements live locally in the
gitignored research/visualizer/hydrogen-exactly-results directory.

Measured on October 3, 2026, Apple M1 Pro, hardware Apple Metal-3 WebGPU adapter
(isFallbackAdapter false), Chrome for Testing 148.0.7778.96. A 24-sample benchmark
after three warmups at 128 cubed and 1358 by 684 pixels measured compute median
3.0 ms / p95 4.0 ms, lit contour render with shadows median 3.2 ms / p95 4.4 ms.
These are GPU queue-completion latencies
including submit/wait overhead, not pure shader timestamps or a claim about
other devices. Simulation and rendering are timed separately. The final run's
current measurements are recorded in the local browser.json report.

Numerical results:

- All 17 radial and angular basis norms: maximum radial error 3.13e-11,
  angular error 4.27e-14, against tolerance 2e-9.
- Radial/azimuthal orthogonality: maximum radial overlap error 5.75e-11,
  tolerance 2e-9; every circular-state azimuthal difference is checked.
- Initial and time-evolved analytic norm: maximum error 4.45e-16,
  tolerance 2e-14, including long times. Single-state density and a two-state
  same-n superposition remain stationary, tolerance 1e-18 absolute density.
- Known R10, R20 node, R21, complex Y11 and negative-m conjugation values;
  circular cylindrical amplitudes agree with the general formula to 3e-18.
- SI wavelengths: tolerance 3e-9 nm against bundled ideal values; original CIE
  checksum checked. Three visible and three infrared low-n pairs are verified.
- Equatorial 256 to 512 grid section integral changes by 4.23e-9 relative.
  This 2D integral is not claimed as the 3D norm.
- Before choosing f16 display storage, 20,000 deterministic points assessed
  nearest-half rounding: maximum relative error above rhoScaled=1e-4 is
  4.84e-4, aggregate error 9.36e-6. Extremely faint tails have greater relative
  rounding/underflow error; f32 debug probes are separate from the f16 volume.
- GPU real/imaginary amplitudes and densities agree with f64 CPU at both modes,
  zero/axis points, event times and all quality tiers. Largest sampled scaled
  amplitude error was 1.59e-5; density error 2.99e-5. Test tolerances are 1e-3
  and 2e-3 respectively, with explicit small-density floors near nodes.

Finite-grid captured masses, not analytic norm:

| Grid | Circular at 50 s | Spectral at 3 s |
| --- | --- | --- |
| 64 | 0.99963015 | 0.99672575 |
| 128 | 0.99963029 | 0.99884801 |
| 160 | 0.99963364 | 0.99925990 |

Medium-to-high changes are about 3.35e-6 and 4.12e-4 respectively. These combine
finite-domain loss, voxel quadrature, f32 evaluation and f16 storage. They do not
prove a pointwise bound on nodal darkness or convergence of every ray integral.
The low-n central structure is less well resolved at the low tier.

Browser checks cover 1440x900, 390x844 and 844x390, no horizontal overflow,
44px primary targets, keyboard play, resize, real and rejected fullscreen,
pause/restart, hidden/offscreen suspension, reduced motion, deterministic replay,
local CIE request failure, missing WebGPU, explicit device loss, verified and
tampered beacon signatures, offline continuation and shared-device room isolation.
Startup, spreading, subsidiary packets, return, late return,
spectral volume and analytic-section screenshots were inspected. One complete
orbit was observed at normal pace, followed by a 64x run spanning more than
1200 display seconds across several revival phrases, using the same energies.
No script, shader or GPU validation errors remained in the passing run.
Presentation checks additionally verify that the large canvas and playback
controls fit the initial viewport, DPR 2 remains sharp, and switching contours,
soft volume, analytic section and density colors leaves GPU probes and captured
mass exactly unchanged at the same score.
Rotation checks compare GPU complex amplitudes, density and captured mass
before and after mouse rotation at a paused score. Screenshots demonstrate
changes in the projected volume. Tests cover edge-on, overhead, underneath and
flipped views, arrow keys, both reset controls, pointer capture beyond the
canvas, cancellation, fullscreen persistence and real CDP touch input at DPR 2.
Touch rotation leaves page scroll and the reduced-motion pause unchanged.

Limitations: no demonstrated knotted nodes, Bohmian tracers, fine structure,
Lamb shifts, spontaneous emission, or global synchronization.
These are deliberately absent and are not presented as complete.
The device-specific GPU comparison is a sampled check, not proof for all space,
time and hardware. Volume nodes and highly faint probability tails are limited
by sampling and display precision. No photosensitivity certification is claimed.

## Sources and asset provenance

- [Bluhm, Kostelecký and Porter](https://arxiv.org/html/quant-ph/9510029v1):
  revival scales, circular packets and approximate hydrogen returns.
- [NIST Bohr radius](https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0) and
  [Rydberg constant](https://physics.nist.gov/cgi-bin/cuu/Value?ryd): 2022 CODATA
  values in the supplied reference. h and c have their exact SI definitions.
- [NIST hydrogen strong lines](https://physics.nist.gov/PhysRefData/Handbook/Tables/hydrogentable2.htm):
  separate measured air-visible and vacuum-UV component records.
- [CIE observer table](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer),
  DOI 10.25039/CIE.DS.xvudnb9b, CC BY-SA 4.0. CSV and adapted metadata are
  attributed to the International Commission on Illumination. The table and
  derived spectral color mapping retain that attribution and license.
- [drand client](https://github.com/drand/drand-client): pinned 1.4.2 browser
  ESM bundle, with original embedded dependency notices and MIT license.
  drand-provenance.json records source and bundle checksums. Only its sourcemap
  URL comment was removed. The optional historical-fixture audit uses the
  client's full verification path with no live-network transport.

The prior-art Falstad and XMinty77 implementations were not copied or reused.
The model, shaders, host, tests and computed still were written for this piece.
The supplied presets/reference constants were retained as owned public inputs;
the rest of the research handoff remains local and gitignored. The still is
computed density, not a photograph, and no generated comparison thumbnail is used.
