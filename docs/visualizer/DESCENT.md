# Descent

[Open the comparison prototype](https://ethanwillingham.com/descent-lab.html).
It starts silently, with Pause, Instruments, Restart and Fullscreen. Direct
room choice, route position, quality, hydrogen state and seed controls live
inside Instruments. No homepage or hub curation changes belong to this build.

## Host and room boundary

`descent-lab.html`, `descent.css` and `js/descent.js` are the page host.
`js/descent-host.js` contains the DOM-free registry, clock, resource accounting
and lifecycle. `js/descent-room-adapters.js` supplies host explanations and
uses documented public extensions without editing a source room.

The route consumes these actual ES modules, in this order:

| Room | Module | Actual model |
| --- | --- | --- |
| Soap film | js/soap-film-room.js | Flat reduced Boussinesq fluid, conservative thickness transport, drainage and phenomenological rupture |
| Superfluid | js/negative-temperature-room.js | Conservative Gross-Pitaevskii evolution with a symmetric Fourier split step |
| Hydrogen | js/hydrogen-exactly-room.js | Finite analytic basis of the ideal Coulomb Hamiltonian |
| Gauge vacuum | js/qcd-lava-lamp-room.js | Pure SU(3) Wilson lattice gauge theory, no quarks |

Arrow of Time is an optional future room, excluded from this route. No magnet
is inserted as an intermediate spatial scale. The standalone page scripts are
never imported. The registry caches module results and records separate load
and initialization errors, including the exact missing module path.

One host-owned device configures one canvas. Each active room receives a device
facade that binds native methods, records its buffers, textures and query sets,
and rejects device destruction. Native resources remain usable in WebGPU
bindings. The room receives a view of a full-size `rgba16float` target. It never
receives the canvas context or swap-chain view. Descent submits the render
encoder after the room and final display pass have added their commands.

The manager serializes selection. It disposes the outgoing room before it
allocates the next, including when several selections arrive quickly. A ledger
also releases forgotten room resources after dispose. It rejects allocations
after disposal. The host retains neither an inactive target nor simulation.
Buffers, textures and query sets have explicit destruction; WebGPU pipelines,
bind groups and samplers have no destroy method and are released by reference.
Driver overhead and JS heap are outside the byte estimates.

## Route and clocks

The nominal cycle is 720 seconds of active watching time:

| Phase in each room | Seconds |
| --- | ---: |
| Fade in | 4 |
| Dwell | 170 |
| Fade out | 4 |
| Dark rest | 2 |

Loading pauses the clock and may lengthen a rest. Film thickness within 10%
of its declared rupture threshold, a rupture, paddle withdrawal or an in-flight
gauge update may extend the dwell, up to 210 seconds. A near-threshold film
waits for its measured rest state, within that ceiling.
These conditions come from snapshots; brightness never invents a climax.
Neither coefficients nor solver time are changed to meet the route schedule.
The opacity envelope is an editorial fade in linear radiance, not a physical
interpolation between equations. There is no moving tunnel or compulsory camera.

One requestAnimationFrame loop drives a fixed 1/60 ambient step. The bounded
work budget drops excess wall-clock debt rather than taking an enormous step.
The route slows under load. CPU frame cost and observed queue-completion latency can reduce the update
budget and then display resolution, with unchanged model coefficients. A
pending presentation prevents another frame of simulation and render commands
from being queued; skipped wall time is not accumulated as a catch-up debt.
Queue latency includes driver and browser scheduling, not just GPU execution. DPR is capped at
1.5. Rooms retain their own internal stable solver steps and time conversion.
Hydrogen currently uses the absolute local piece clock; the other rooms use
their room-local accumulated solver time. Instruments states those meanings.

Manual pause, hidden tabs and an offscreen view call no room step. A visibility
return preserves manual pause. Reduced motion starts with a live initial still,
Play, and automatic selection off. Fullscreen has both the native path and a
keyboard-dismissable page fallback. Page disposal aborts listeners, disconnects
observers, cancels the frame, aborts the optional beacon fetch and frees the
host device. A reported lost device stops work and explains Restart's reload.

Moving the route control chooses a room and starts from its seed. It does not
pretend to seek a fluid or Markov chain into its past. Restart resets the route
clock without overriding a deliberate pause.

## Scales, color and diagnostics

The route is editorial. The following dimensions cannot form a continuous
monotone scientific ruler:

| Room | Label policy | Provenance |
| --- | --- | --- |
| Film | 0.16 m square-frame side; thickness is separately measured in nm | Declared assumed apparatus dimension in the room parameters, not experimental calibration |
| Superfluid | Model units | No atom species or laboratory length conversion is supplied |
| Low-n hydrogen | 1.322943 nm, n_max squared a0 for n_max = 5 | Mode-specific snapshot and NIST Bohr radius; characteristic extent, not a density boundary |
| Rydberg option | 47.625949 nm, n0 squared a0 for n0 = 30 | Mode-specific snapshot and NIST Bohr radius |
| Gauge vacuum | Model units | No justified lattice spacing for this small Wilson box is supplied |

Descent defaults to the source hydrogen room's low-n spectral mode through its
public `setMode` extension. Rydberg remains an explicit option, with its own
scale. The host accepts snapshot overrides ahead of static roomInfo metadata.
It does not infer femtometers merely from beta 6.0 or borrow a calibration from
another gauge group. Each source module's technical note supplies model details:
[film](SOAP_FILM.md), [superfluid](NEGATIVE_TEMPERATURE.md),
[hydrogen](HYDROGEN_EXACTLY.md), [gauge field](QCD_LAVA_LAMP.md).

All room output is linear radiance. The host applies Reinhard c/(1+c), then
the piecewise sRGB transfer, once. There is no host bloom, temporal feedback,
fluid warp or dither. Exposure is 12 for the film, 1 for the superfluid and
hydrogen, and 1.2 for the gauge field, matching standalone linear multipliers.
Film interference colors are not replaced by a route palette. Hydrogen's
spectral-frequency encoding is not emitted radiation. Gauge colors represent
the signs of a smoothed charge estimator, not spectra or an instanton census.

The compact panel reads each snapshot's actual observables: film thickness and
volume ledger, superfluid norm, circulation and cluster measures, hydrogen basis
norm and overlaps, and gauge plaquette, matrix constraints and Q by cooling
depth. The raw snapshot includes diagnostic ages and unavailable measurements.
There is no universal score. The superfluid uses a saturating density display,
a faint phase tint and small spatial bloom. Hydrogen shades measured density
contours; spectral mode retains frequency false color, while the optional
Rydberg packet uses arbitrary density false color. The gauge render interpolates
measured charge maps, normalizes their display by measured RMS and shades a
1.1-RMS contour; those operations leave observables unchanged. Negative
temperature is not estimated by the superfluid room and is not claimed by this host. The gauge room is SU(3), but
it is not the reference film's improved cooling or a continuum calibration.

## Seeds and restoration

The default is an offline reproducible preset. Per-visit seeds are the first
64 bits of SHA-256 of `descent:v1:rootSeed:roomId:routeCycle`. The truncation is
explicit because the gauge sampler accepts two u32 seed words. A cycle repeats
the route with newly derived initial seeds. Inactive live states do not continue.
Hydrogen's source coefficients ignore its recorded seed; the host says so in
the raw room provenance.

The optional beacon button fetches quicknet, with the pinned chain hash
`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, public key
and bls-unchained-g1-rfc9380 scheme in `js/descent-seed.js`. Only successful BLS
verification by the locally bundled official drand-client 1.4.2 earns Verified.
SHA-256 of the signature is also checked. Both a good round-42 fixture and an
altered, rehashed signature are tested in Node and the browser. The key and
scheme cannot be replaced by relay metadata. No remote script is needed.

Beacon bytes select a PRNG seed. They do not turn its later samples into
independent quantum events. Network loss keeps the current seed and model.
Cached beacon data are verified again on load before the label is restored.
The offline path makes no external-entropy claim.

Storage records room, root seed and provenance, per-visit seed, model parameters,
quality, integer host steps, route state and pause. Generic rooms replay those
fixed steps in bounded batches after Play, with matching parameters and a
43,200-step replay budget. The piece clock is held during replay. A mismatch or
larger replay restarts honestly from the recorded seed, with an explanation.
An unfinished replay retains its total saved target when it is saved again.
The saved numerical count and solver time are checked after replay. An adaptive
or asynchronous solver can finish different work from the same host calls; a
mismatch is labeled as a new seeded replay rather than the saved GPU state.
No arbitrary GPU checkpoint is reconstructed from a wall-clock timestamp.
Floating-point replay is approximate across adapters; no worldwide synchronized
state is claimed. The analytic interim study can restore its mathematical time
directly without advancing a paused simulation.

## Interim and missing WebGPU

`js/descent-bootstrap-room.js` is an explicit interim study, not a substitute
export under another agent's id. It is outside the four-room completeness test.
It uses normalized 1s and 2p_z states with probabilities 1/4 and 3/4:

```text
psi_1s = exp(-r) / sqrt(pi)
psi_2p_z = z exp(-r/2) / (4 sqrt(2 pi))
rho = |0.5 psi_1s + sqrt(0.75) exp(-i phase) psi_2p_z|^2
phase advances by 2 pi per 36 watching seconds
```

Coordinates use a0. E_2-E_1 = 3/8 Hartree, so the slowed beat maps each watching
second to 16 pi/(3 times 36) atomic time units. The mean radius is 4.125 a0,
about 0.218286 nm. Midpoint quadrature projects density along the viewing ray.
The presentation uses density raised to 0.68, with a cream tint; those operations
do not enter any observable. No radiation is modeled.

The fallback PNG is a CPU calculation of this study at zero phase, with its
origin and quadrature in `hydrogen-still-origin.json`. It is neither a laboratory
recording nor a captured GPU frame. Missing WebGPU shows that labeled still and
disables live selection. A missing route module has an exact-path error instead
of an invented visual. The host can run its interim study while the route is
absent, but reports the route incomplete.

## Verification and evidence

```sh
node tools/test-descent-contract.mjs
NODE_PATH=/path/to/bundled/node_modules node tools/test-descent-numerics.mjs
DESCENT_WHOLE_ROUTES=1 DESCENT_TEST_OUTPUT=/tmp/descent-results \
  NODE_PATH=/path/to/bundled/node_modules node tools/test-descent-browser.cjs
node --check js/descent.js
```

The harness owns its HTTP server and the exact Chrome for Testing child launched
through `/Users/ethan/.local/bin/agent-chrome-for-testing`. Both close in finally.
It never launches the owner's personal Chrome. Deterministic fixtures exist only
inside tests and their HTTP interception; none is a production route module.

Contract checks cover imports and individual errors, format, resize before
render, encoder submission ownership, pause debt, a bounded event wait, two
complete schedules, seed derivation, shared-device protection, disposal and
rapid serialized selection. Browser checks use both fixtures and real modules,
1440x900, 390x844 and 844x390, native and rejected fullscreen, keyboard operation,
visibility and offscreen suspension, reduced motion, network failure, restoration,
missing modules, no WebGPU and explicit device destruction to exercise device
loss handling. No unexpected JS, shader or WebGPU validation errors remain.

Two full real routes run at low quality with the same 1/60 solver sequence at
faster wall-clock pacing. The accelerator awaits the gauge room's public
waitForIdle after each call, preserving its two requested sweeps per active
second instead of letting a tight JS batch suppress asynchronous updates.
Each visit records its complete dwell, fresh measured
diagnostics, transition and resource retirement. Snapshots and screenshots are
actual output; no solver coefficient is altered for a screenshot. Default medium
initialization, readbacks and separate render measurements are checked too.
Tests inspect actual source SHA-256 values served to the browser, so a shared
checkout's changing modules cannot silently masquerade as one tested revision.

The interim basis norm integrates to 1.0000000002109095 (tolerance 2e-9), and
mean radius to 4.124999999894551 a0. Its GPU f32 point density agrees with the
CPU formula within relative tolerance 3e-5 with a 1e-7 near-zero floor. Source
numerical tests also pass: film mass conservation and refinement, Fourier/GPE
norm and time refinement, hydrogen basis normalization and phase conventions,
and SU(3) gauge invariance, heatbath statistics and nontrivial flux normalization.
Those checks establish implemented-model behavior, not experimental fidelity.
The superfluid source reports 3.58% f32 norm loss over its separate 36-minute
run. Descent starts each three-minute visit from a derived seed, rather than
concealing or correcting that precision limit with frame normalization.

Final timings, source manifests and the exact tested module commits are recorded
with the delivered evidence below. Measurements apply to the observed Apple
Metal-3 hardware adapter, not real mobile hardware or Safari. GPU render times
use timestamp queries around the room's render pass. QCD's slice compute is
included in its queue-completion measurement, outside the volume-pass timestamp.
Solver call timings include calls that need no internal substep; queue fences
include scheduling and browser overhead. These distinctions are kept in the
machine-readable report.

Two largest adjacent medium rooms, hydrogen and SU(3), allocate simultaneously
on this adapter: about 29.7 MB for their persistent resources, plus test targets.
That proves allocation fit, not concurrent solver performance or cross-device
fit. Descent keeps its one-room policy. Every retired buffer, texture and query
set is released; swap-chain allocations, pipeline driver caches and JS garbage
collection are not measured as GPU VRAM.

## Delivered runs and measurements

[Whole-route report](../../assets/visualizer/descent/evidence/whole-route/report.json)
records 28 passed browser checks, including two complete real routes.
[Fresh-module report](../../assets/visualizer/descent/evidence/final/report.json)
records 20 passed checks, including the Rydberg option, numerical replay,
listener removal and subsequent source-room updates. The
[module manifest](../../assets/visualizer/descent/evidence/module-manifest.json)
records every served SHA-256 and whether it matches committed bytes. A room
loaded before an update keeps its imported version for that visit. Source
updates were never staged in the Descent commit.

Reviewed and tested source commits include:

| Input | Commit |
| --- | --- |
| Film | c1d8304e2c0cb25fb51bab01a3ec76b1f080c694 |
| Superfluid | a961fea4985fd4e477dc7d4bdb61d6d98b75350d |
| Hydrogen | e9fe9d63f2f57e266d0882cf7c83a704977b3723 |
| SU(3) gauge field | d2cca0b3f40211383963142ae58ff9d9f1f005f5 |

The later superfluid working copy maps three solver units per watching second;
the earlier full-route capture used 0.75. This is a source-room clock change,
not a host alteration of physical coefficients. Its actual parameters and
clock are displayed and saved. The film's optional persistent/oval standalone
mode does not replace Descent's square, draining default.

The final medium measurements below used Chrome for Testing 148.0.7778.96,
Apple M1 Pro hardware with the non-fallback apple / metal-3 adapter, and an
1118 by 495 HDR target. Each room has 90 samples; values are median / p95 in ms.
These shared-machine runs were not isolated from other GPU work. They are
observations, not cross-device budgets. A zero CPU reading can mean no internal
substep or work below the browser timer resolution.

| Room / medium grid | Step call CPU | Step queue fence | Render GPU timestamp | Render queue fence |
| --- | ---: | ---: | ---: | ---: |
| Film / 256 squared | 0.00 / 20.70 | 0.10 / 20.90 | 0.14 / 0.32 | 0.60 / 0.90 |
| GPE / 256 squared | 0.00 / 0.10 | 1.80 / 2.60 | 0.30 / 0.43 | 0.80 / 1.10 |
| Low-n H / 128 cubed, 160 ray steps | 0.00 / 0.10 | 2.10 / 2.70 | 1.65 / 2.06 | 2.30 / 2.70 |
| SU(3) / 12 to the fourth | 0.00 / 0.00 | 0.10 / 0.20 | 1.28 / 2.14 | 1.80 / 2.80 |

The final display and fade pass measured 1.40 / 2.77 ms
over 60 GPU samples. The same earlier full-route run measured 1.44 / 2.84 ms.
The reports keep both results rather than treating that variation as a guarantee.

Persistent room allocations were 2.294 MB for film, 1.611 MB for GPE,
16.778 MB for hydrogen and 12.954 MB for SU(3), plus 4.427 MB for the current
HDR target. MB here means one million bytes. Slow test readbacks raised the
hydrogen ledger peak to 33.555 MB and SU(3) to 19.258 MB, excluding the target.
All retired resource counts reached zero. The H/SU(3) pair allocation test
succeeded with 29.732 MB of persistent rooms plus 3.686 MB of test targets;
production still retains one active room.

The full-route film extensions were approximately 3.17 and 3.97 seconds and
captured rupture before departure. GPE's measured state near 128 solver units
had eight vortices, a largest component of four, C2 = 1, and norm loss about
0.247%. The gauge room reached 597 total sweeps including burn-in at the dwell
capture; measured unitarity and determinant errors stayed below 0.001. Its Q
near zero was reported without assigning an integer sector. The real GPE seed
replay reproduced sampled field values exactly on this adapter (test tolerance
1e-4); this does not establish cross-device equality.

Screenshots come from the named runs and are not visualizer inputs:

| Room | Current initial state | Developing structure | Dwell / measured state |
| --- | --- | --- | --- |
| Film | [Initial](../../assets/visualizer/descent/evidence/final/live-soap-film-startup.png) | [Developing](../../assets/visualizer/descent/evidence/whole-route/real-route-1-soap-film-developing.png) | [Dwell](../../assets/visualizer/descent/evidence/whole-route/real-route-1-soap-film-dwell.png) |
| Superfluid | [Initial](../../assets/visualizer/descent/evidence/final/live-negative-temperature-startup.png) | [Developing](../../assets/visualizer/descent/evidence/whole-route/real-route-1-negative-temperature-developing.png) | [Dwell](../../assets/visualizer/descent/evidence/whole-route/real-route-1-negative-temperature-dwell.png) |
| Hydrogen | [Initial](../../assets/visualizer/descent/evidence/final/live-hydrogen-exactly-startup.png) | [Developing](../../assets/visualizer/descent/evidence/whole-route/real-route-1-hydrogen-exactly-developing.png) | [Dwell](../../assets/visualizer/descent/evidence/whole-route/real-route-1-hydrogen-exactly-dwell.png) |
| Gauge vacuum | [Initial](../../assets/visualizer/descent/evidence/final/live-qcd-lava-lamp-startup.png) | [Developing](../../assets/visualizer/descent/evidence/whole-route/real-route-1-qcd-lava-lamp-developing.png) | [Dwell](../../assets/visualizer/descent/evidence/whole-route/real-route-1-qcd-lava-lamp-dwell.png) |

Additional captures show [rupture](../../assets/visualizer/descent/evidence/whole-route/real-route-1-soap-film-rupturing.png),
[dark transition](../../assets/visualizer/descent/evidence/whole-route/live-dark-transition.png),
[Rydberg mode](../../assets/visualizer/descent/evidence/final/live-hydrogen-revival-option.png),
[portrait](../../assets/visualizer/descent/evidence/final/layout-hydrogen-exactly-390x844.png),
[landscape](../../assets/visualizer/descent/evidence/final/layout-qcd-lava-lamp-844x390.png),
[device loss](../../assets/visualizer/descent/evidence/final/device-loss.png), and the
[calculated no-WebGPU fallback](../../assets/visualizer/descent/evidence/final/no-webgpu-calculated-still.png).
The reports retain both routes and the complete layout matrix.

## Sources and asset provenance

- [NIST Bohr radius](https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0) and
  [MIT Quantum Physics I](https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/)
  for the interim study's units and eigenstate model.
- The four roomInfo source lists and the linked source-room technical notes for
  their equations, calibration limits, numerical checks and color meanings.
- [drand JavaScript client](https://github.com/drand/drand-client) and
  [quicknet HTTP API](https://docs.drand.love/developer/http-api/) for verification.

The verifier is the official prebuilt drand-client 1.4.2 ESM artifact, minified
locally with esbuild 0.25.10. Rebundling its TypeScript against newly resolved
transitive versions failed initialization and was discarded. The shipped
artifact passed Node and browser BLS checks. Its code has no runtime CDN import.
License files and screenshot/data attribution live in the owned assets directory.
No generated thumbnail, remote footage or photographic asset was added.

## Owned files

- `descent-lab.html`, `descent.css`
- `js/descent.js`, `js/descent-host.js`, `js/descent-room-adapters.js`
- `js/descent-seed.js`, `js/descent-bootstrap-room.js`
- `tools/test-descent-contract.mjs`, `tools/test-descent-numerics.mjs`, `tools/test-descent-browser.cjs`
- `assets/visualizer/descent/` and this document

The source room implementations belong to their respective agents. Integration
commits stage only the owned paths under the shared atomic Git lock. The sitemap
generator runs after the new-page commit; comparison lab pages are excluded,
and pre-existing unrelated sitemap changes are preserved.
