# Chain Reaction

Chain Reaction is listed on In Progress at `archive.html`. The canonical entry,
`chain-reaction.html`, opens a direct fullscreen four-stage demo with Home,
Pause, Replay and Follow controls. `chain-reaction-workbench.html` is the secondary
index for seven separate mechanism and construction studies, the sound comparison
lab and the earlier three-stage review slice at `chain-reaction/earlier-slice.html`.
Sound remains off by default. The brief is
`research/next/09-chain-reaction.md` in the main checkout. Private project state and the
local look chooser live in `research/chain-reaction/`, a separate local Git repository.
Read the brief and that folder's current state before continuing.

## In Progress workbench

The current draft viewer also lives at `chain-reaction/connected-slice.html`. It contains
24 transfers across four stages, lasting 34.620833 seconds. Stage four is the
drawer outlet. Its viewer adapter stays under `chain-reaction/stages/viewer/`,
separate from the three standard stage records in `assets/chain-reaction/stages/`.
The draft still needs delivered-work margins, an energy audit across variations,
independent visual review and a decision on cord slack display and routing. The
rocker outlet is available as an isolated study; it has not become stage five.

Build the curated browser package from the independent research repository:

```sh
CHAIN_REACTION_RESEARCH=/absolute/path/to/research/chain-reaction \
  node tools/chain-reaction/build-workbench.mjs
```

The exporter copies an explicit list of current browser files, rewrites local
preview paths to permanent site paths, pins the latest catch and drawer kits,
and records source and published hashes in `chain-reaction/workbench-manifest.json`.
It does not copy research notes, evidence or failed candidates. The canonical demo is searchable and included in the sitemap; its draft viewers
retain `noindex,nofollow`. The workbench remains reachable from In Progress.
The four-stage runtime retains its read-only contact, cord and pacing observers,
and refuses a handoff when the combined transfer report fails.

`workbench.mjs` checks every exported file hash, completes all four stages in both
Chrome and WebKit, compares all four snapshot hashes and contact reports, compares
six standalone mechanism worlds with Node, exercises all ten prop poses, and
checks the project page at desktop and both phone orientations. It also checks
the 20-pixel phone gutter and rejects missing same-origin assets or page errors.
The local checks preserve all four chronological physical hashes after the
fullscreen and environment changes.
Set `CHAIN_REACTION_URL` to verify the deployed site with the same checks. Screenshots
and the report go to `CHAIN_REACTION_OUTPUT`, or `/tmp/chain-reaction-workbench`.

`workbench-still.mjs` renders stage four at two seconds for the index and project
page preview image. It requires the browser environment and `CHAIN_REACTION_SHARP`.

## Evolving miniature worlds

The owner requested an immersive demo with Home as its only navigation control,
and changing rooms, woods, materials and backgrounds inspired by I Spy books.
The opening four environments are authored in `chain-reaction/world-dressing.js`:
an amber pegboard workshop with honey maple, a walnut sewing alcove with a woven
wall, a cherry and plum toy theatre, and a slate and smoked-oak curiosity cabinet.
The set dressing adds 131 meshes around the existing mechanisms. Its authored
geometry keeps at least 0.12 units of front clearance from the moving construction.
An instance-aware Node geometry audit verifies those bounds against the actual
renderer inputs. Scenery does not enter the solver; existing mechanical geometry,
material recipes and timing stay unchanged.

`immersive.mjs` checks both entry routes in Chrome and WebKit at four sizes. It
verifies fullscreen layout, Home as the only navigation link, 44-pixel controls,
Replay/Pause/Follow, four distinct theme records, all eight drawer transfer frames,
and exact frozen and paused zoom-return image pairs. `workbench.mjs` retains the
full chronological physics comparison.

`batching.mjs` compares all four rooms and the overview with their original and
batched scenery. Forty material batches preserve all 131 authored objects and
21,184 triangles. Geometry/UV/material/shadow checks and both-browser pixel
comparisons preserve the scene; the largest mean channel difference is 0.000518
on a 0-to-255 scale, confined to raster rounding. Physical snapshots match exactly.

`immersive-film.mjs` measures five actual DPR2 runs of fourth-stage playback and
five animated full-overview runs per profile. Median p95 intervals are 4.8/4.0 ms
for the owner's 859x767 viewport and 10.4/12.6 ms for an 844x390 CPU4 landscape
phone proxy. Both meet the unchanged 16.7 ms budget. These are desktop GPU proxy
measurements, not physical phone results. The retained first unbatched overview
failed at 20.1 ms; no objects, antialiasing or texture detail were removed to pass.

The renderer retains four-sample scene MSAA, DPR up to two, zero focus/motion/grain
blur, lens-relative 24-bit depth and 4096 PCF shadow maps. Static batching changes
render overhead, not the physics, scenery palette or optical quality.

Future chapters must change architecture, dominant surfaces, prop vocabulary,
composition and light together, with genuinely new material mechanisms verified
before inclusion. A palette change alone does not satisfy this direction. Room
transitions must carry the marble through a visible physical handoff; camera travel
cannot substitute for one. Keep background details crisp and active impacts and
cords legible. The set builder rejects extra stages until their scenery is authored;
it does not silently repeat the opening room. The planned broader vocabulary includes sewing, theatre, collected
curiosities, seaside miniatures and a glass conservatory beyond the opening workshop.

Primary references are Walter Wick's [miniature world-building and Chain Reaction
discussion](https://www.walterwick.com/blog/2015/10/13/floor-games),
[deep-focus composition](https://www.walterwick.com/blog/2015/11/16/photo-illusions-in-the-digital-age)
and [I Spy set construction](https://www.walterwick.com/behind-the-scenes/i-spy).
These inform original environments; no book images or exact scenes are reused.

The editable physics module is `js/chain-reaction-physics.js`. It loads the pinned
Rapier module by dynamic import and uses one classic-script namespace, `ChainReaction`.
No bundler or runtime package registry is needed. Bodies use a fixed 1/240-second step,
193 units/s squared gravity, and 1 unit per 2 inches. The engine length unit is
19.68503937007874 units per meter. Setup uses exact stored numbers. Rotation math in
isolation tools only measures joint errors, and never feeds the solver.

The foundation exercises falling marbles, eight-block stacks, fourteen dominoes,
pendulums, levers, wheels, rope and spring constraints, continuous collision detection,
and a 96-body stress fixture. Each fixture is tested in both row orientations. The
mirror changes physics poses, velocities and anchors only. Rendering must relight in
world space and keep handed props unchanged.

Solver settings are provisional: 12 solver iterations, four CCD substeps, contact
natural frequency 240, normalized linear error 0.00001 and prediction distance 0.002.
Contact between a joint's own connected bodies is disabled; other contacts remain
active. A low contact frequency compressed the stacked test blocks. The pendulum's
initial pose must agree with its pivot, otherwise the solver starts by correcting a
large position error. These failure cases belong in future kit tests.

## Checks

From the isolated worktree:

```sh
node tools/chain-reaction/spike.mjs
node tools/chain-reaction/verify.mjs --full
node tools/chain-reaction/lint.mjs
```

The full verifier is read-only. It checks the vendored engine fingerprint and twenty-eight
stored isolation hashes, reruns their numerical checks, and replays all recorded stage
orientations. `--record` validates changed stages, runs their variations and interruption
controls, then records poses, events, camera paths and hashes. A zero-stage result
only proves the foundations.

For browser tools, install Playwright in a scratch directory outside this repo. Match
the cached WebKit build. Set `CHAIN_REACTION_PLAYWRIGHT` to its package path. The
initial run used Playwright 1.62.1 and cached WebKit 2336. Chrome launches only through
`/Users/ethan/.local/bin/agent-chrome-for-testing`, with disabled GPU vsync and frame
limits. Each browser launch has a five-minute bound and closes its owned browser in
`finally`; servers close too. No personal Chrome process is launched.

```sh
CHAIN_REACTION_PLAYWRIGHT=/tmp/chain-reaction-runtime/node_modules/playwright \
  node tools/chain-reaction/parity.mjs
```

Parity compares complete Rapier snapshot SHA-256 digests in Node, Chrome for Testing
and WebKit, for every isolation fixture in both orientations. Browser tools do not
approve stage art, mechanics or taste.

`capture.mjs` loads the private lab and captures exact simulation times at 1440x900,
844x390 and 390x844. Set `CHAIN_REACTION_RESEARCH` to the absolute research folder.
Captures stay local. This foundation tool is not yet the half-second visitor contact
sheet or a stage storyboard generator.

`perf.mjs` uses the same environment variables, a local exclusive lock, and five runs
per desktop and phone-landscape profile. Phone CPU is throttled 4x. It measures rAF
intervals, CPU work, physics and GPU timer queries at the actual viewport resolution.
A desktop GPU at phone resolution remains a proxy, not an iPhone measurement. A shared process lock
excludes other foundation tools, captures and browser runs during performance tests.
A stale lock is reclaimed only after its recorded process has exited. Stress bodies are rendered and stepped together.

Remaining: the complete kit, row connector, material/prop image lint, full stage
storyboards, fresh visual review and long soak. The review slice has emission
normalization, schema, recorder, variation tests, manifest, camera paths, provisional
sound, overview, loading stills and reveal flights.
Gate 0 evidence is complete: cross-engine spike parity, the phone proxy budget, the
private chooser, the owner direction request and the owner tin-toy choice. Final
look and sound approval and Gate 1 remain open.

## Mechanical releases

Physics version 0.2.0 adds compound bodies, sliding guides and limited revolute
bearings. Compound bodies sum each piece's actual volume, mass, center of mass and
moment of inertia. Every collider has zero automatic density; the explicit total
is assigned to the body. Mass version 0.2.0 exposes the same arithmetic to Node and
browsers. The original primitive mass results and twenty-two isolation hashes remain
unchanged. Prismatic limits follow their stored axis; mirrored angular stops reverse
their limits. These constraints represent mounted guides and bearing stop tabs.

New mechanisms use the versioned `fresh-v1` contact profile. The pinned engine's
default contact cache retained support after a thin latch moved clear at this scale.
An identity contact hook requests fresh contact determination at every tick. It
accepts every permitted pair and keeps the ordinary impulse solver. It changes no
poses, velocities, forces or contact coefficients. Existing baseline fixtures keep
their prior profile. The engine documents the hook in its
[collision guide](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection/);
its [contact-update code](https://github.com/dimforge/rapier/blob/master/src/geometry/narrow_phase/pair_update.rs)
excludes hooked pairs from contact recycling. A pinned-engine reproduction and its
fresh-contact replacement are checked together.

Depth groups describe separate front and rear planes. Each compound piece can
declare its own depth, depth offset and layer. The validator rejects a filtered pair
whose visible depth intervals overlap. A bridge piece spans both planes and collides
with both. The renderer must use these same dimensions and offsets. Nothing is
filtered merely to avoid a jam.

`geometry.mjs` rejects an intersecting armed layout before the first solver tick.
`chain-reaction-events.js` observes contact, blocker withdrawal and marble clearance.
It never drives a body. Contact time is the handoff time; a separate travel threshold
confirms the recipient's motion. Comparing those threshold completion times would
misorder two correctly timed contacts. The observer still rejects motion before
contact, a blocked release and a marble released before clearance.
Release checks respect each collider's collision groups. A part in another depth
plane may overlap in projection without blocking the mechanism. The regression
fixture rejects the old false blockage, still rejects actual same-plane contact,
and confirms that sampling leaves every world snapshot unchanged. Both fixtures
also run through Node, Chrome and WebKit parity.

`kit.mjs` checks the sliding latch, supported hanging cup and wheel knocker in both
orientations, including exact masses, initial geometry, depth groups, transfer order,
snapshot-preserving observation and disconnected-source controls. Seven negative
controls cover early motion, overlap, filtered visible collision, an unknown profile
and reversed transfers, plus release depth and a reused entry marble omitted from
interruption checks. These are isolated kit tests, not approved public stages.

## Credits

- [Rapier](https://rapier.rs/), Dimforge, Apache-2.0.
  `@dimforge/rapier2d-deterministic-compat` 0.21.0 comes from the exact npm tarball in
  `js/vendor/rapier2d-0.21.0/provenance.json`. Its license is retained alongside it.
  The compatibility module contains its WebAssembly payload.
- The local material study uses the site's existing vendored three.js r128, MIT.
  Geometry and textures in this first study are constructed in code. No generated
  images, material scans or third-party photographs are shipped.
- [Rapier determinism guidance](https://rapier.rs/docs/user_guides/javascript/determinism/)
  explains snapshot parity and deterministic initialization.

## Phase 0 material study

The private chooser now shows each material on a beveled plank and block, a lathed
disc and round rod, at three zooms and five measured rotation angles. String is
constructed as three twisted strands. Maple uses separate longitudinal and end-grain
projection; color, normal and roughness textures come from growth fields. The brass
sample reflects procedural studio softboxes. Light positions remain fixed while
samples rotate. The hero marble can be inspected at 12, 80 and 300 CSS pixels.

The material board and photographs live in the ignored research folder. Eight
original object photographs come from Commons, with exact file/page fingerprints and
licenses; felt uses a photograph-derived ambientCG albedo surface. These are private
references and are never shipped as textures or stage art. Camera, materials, film
effects and physics mass assumptions remain provisional. No look approval is claimed.

The lab uses a 13.039-degree vertical field, approximately a 105 mm lens with a
24 mm sensor height, and a five-degree elevation. Its reveal demonstration eases
camera distance in log space; reduced motion cuts directly. The public slice now has a baked stage camera, first-visit reveal, depth of field,
motion blur and grain. Fallback stills use the live renderer; exact compression
matching remains limited by WebP quantization.

`rotation.mjs` creates exact 0, 45, 90, 135 and 180-degree captures at all three zooms,
plus sheets beside the private source photographs. Set `CHAIN_REACTION_SHARP` to the
bundled Sharp package. `--only hero` can recapture one sample. These are material tests,
not stage rotation sheets or a professional-quality gate.

`smoke.mjs` checks both Chrome and WebKit, including reference image loading, the
300-pixel marble view, visible 44-pixel controls and reduced motion. Native WebKit
select controls ignored the intended height; the chooser now uses explicit 44-pixel
select styling. Hidden controls are excluded from tap-target measurements, and all
visible material controls are checked separately.

`preview.mjs --lan` serves the local chooser for six hours, so an iPhone on the same
network can inspect it. The default loopback preview lasts one hour. The server serves
only supported web file types and rejects hidden path components. Stop the owned
server with SIGINT. No public machine page is created by this preview.

## Contact causality and the tin preview

The owner selected the tin-toy direction. The local chooser now defaults to painted
tin dominoes, with rolled seams and brass details. Independent moving wheel and
pendulum specimens are removed from the chain preview.

The original `dominoes.json` is an isolation test deliberately started by a tilted
first domino. Reusing it in the ball preview was a bug. The ramp also intersected
the first domino. The new `marble-dominoes.json` starts all fourteen dominoes upright
and clears the ramp. Both orientations pass the same contact contract.

`js/chain-reaction-causality.js` observes actual solver contact impulses. Every
domino must receive contact from its declared predecessor before leaving its armed
pose, and every domino must ultimately fall. It observes each 1/240-second tick,
including contact-force events from collision substeps. Manifold readings alone
missed one early impact because the cached contact data lagged the CCD response.
The observer never adds forces, releases bodies or scripts motion.

`verify --full` also runs fourteen counterfactuals per orientation: removing the ball,
and separately clamping each predecessor that has downstream dominoes. Downstream
bodies must stay upright for ten seconds. It deliberately reintroduces both known
bugs and requires the gate to reject them. Removing a single domino is not the same
as breaking causality: a projectile or sliding domino can bridge the empty gap.
Clamping a link tests interruption while preserving the physical barrier.

Chrome and WebKit smoke runs check the armed pose at 0.3 seconds, all fourteen
contact-before-motion records, completed falls, and the no-ball control. The lab
loads the exact verified fixture. Future contact-chain candidates need their own
causal contract and tests before shipping; this is not a general stage verifier.
The original twenty snapshot baselines are unchanged; two new mirrored baselines
cover this fixture.

Explicit mass and angular inertia can now be supplied to the physics module. Tin
dominoes approximate closed 0.2 mm steel shells at 7,850 kg/m3: 4.888 g each, with
outer dimensions 8.128 by 66.04 by 14.224 mm. Their moment of inertia subtracts
the inner cuboid from the outer cuboid. The 15.875 mm solid ceramic marble uses an
assumed 2,400 kg/m3 bulk density, giving 5.027 g and spherical rotational inertia.
Paint, rolled seams and embossed details are approximations in this provisional
model. Friction and restitution still need physical calibration. Steel density
is within the range in [Ansys material property data, table A2](https://www.ansys.com/content/dam/amp/2021/august/webpage-requests/education-resources-dam-upload-batch-2/material-property-data-for-eng-materials-BOKENGEN21.pdf).
The complete provisional material table follows. No threshold is frozen.

## Material mass and contact recipes

`js/chain-reaction-materials.json` is the versioned data source. Density determines
mass through declared three-dimensional construction, even though the solver uses
two-dimensional collision geometry. Friction and bounce are proposed simulation
recipes. The sliding tests check the solver against the chosen Coulomb model;
they do not measure real objects. A contact pair uses the arithmetic mean.
Sound families are proposed tags; sound design and owner approval remain pending.

| Material | Bulk density, kg/m3 | Friction | Restitution | Proposed sound |
| --- | ---: | ---: | ---: | --- |
| Sugar maple | 705.6 | 0.45 | 0.15 | wood |
| Painted steel | 7,850 | 0.45 | 0.05 | tin |
| Tinplate shell | 7,850 | 0.45 | 0.05 | tin |
| Brass, CuZn30 | 8,530 | 0.30 | 0.08 | brass |
| Laminated solid card | 670 | 0.60 | 0.02 | card |
| Cork | 180 | 0.75 | 0.05 | cork |
| F-13 felt | 181.11542588157602 | 0.75 | 0.01 | felt |
| Ceramic and glazed ceramic | 2,400 | 0.22 | 0.15 | ceramic |
| Natural rubber | 925 | 0.85 | 0.50 | rubber |
| Twisted nylon cord | 855 | 0.15 | 0.01 | string |

Maple uses the sugar-maple specific gravity of 0.63 at twelve percent moisture from
the [USDA Wood Handbook](https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr282/fpl_gtr282.pdf),
converted using dry mass and moisture mass. Steel, card, cork and rubber use midpoints
of the ranges in the Ansys table linked above. Card is solid laminated stock, so
corrugated voids must be modeled separately. [Aurubis CuZn30 data](https://jobs.aurubis.com/aurubis-com/dam/jcr%3A0ab1c76f-1d24-429a-a36f-547fdafc104f/PNA%20226_CuZn30_C26000-E.N.pdf)
gives brass density. [US Felt's F-13 specification](https://www.usfelt.com/sae_felt_specs.html)
gives 8.48 pounds per square yard per inch of thickness, converted to bulk density.

Ceramic remains an explicit 2,400 kg/m3 study assumption. The referenced
[C110 porcelain](https://www.pofahermsdorf.de/wp-content/uploads/2017/11/WSU_Porzellan_C110_eng.pdf)
is 2,340 kg/m3, so this is an approximation. Nylon cord uses the 1.14 fiber specific
gravity in [Samson's fiber comparison](https://www.samsonrope.com/docs/default-source/default-document-library/warning-insert.pdf)
with an assumed 75 percent packing fraction. Paint, glaze and seams are excluded
from bulk mass in this first model; consequential additions need explicit mass.

`js/chain-reaction-mass.js` computes sphere, solid disk, solid box and closed shell
mass and rotational inertia using arithmetic and a stored pi constant. Units are
kilograms and kilogram times world-unit squared. Stage authoring must store the exact
results handed to the engine. Forty-four dimensional checks cover every recipe and
construction; doubling dimensions scales mass by eight and inertia by thirty-two.
All fifteen dynamic masses in the tin fixture match exactly. The stored physics
baselines are unchanged.

## Provisional spike limits

`js/chain-reaction-thresholds.json` is the machine-readable source. These initial
proposals freeze only with the owner's Gate 1 approval. Existing timing, jitter,
200-run stage robustness and 199/200 success requirements in the brief remain fixed.

| Limit | Proposal | Evidence or intended check |
| --- | --- | --- |
| Moving bodies | 32 per stage; two worlds during handoff | Two-world benchmark, contact observation and rendered zoom |
| Frame budget | 16.7 ms p95 | Five runs per resolution, CPU 4x for phone proxy |
| Linear velocity cap | 80 units/s, 160 inches/s | Ordinary spike peak 54.683 units/s; thin-wall CCD passes at 40, 80 and 120 |
| Active-path minimum surface speed | 0.25 units/s, half an inch/s | Includes angular motion; no-ball tin rest speed is zero |
| Camera translation jerk | 80 units/s cubed | Quintic pans of 4 units in 1.5 s and 16 in 2.3 s pass; 16 in 1.2 s rejected |
| Camera log-zoom jerk | 15 per second cubed | Existing 9.3-to-14-unit reveal over 1.2 s measures 14.203 |
| Handoff view | 8 units wide, at least 4 high, target y = 2 | Marble projects above 12 CSS pixels at both phone orientations and desktop |
| Lens | 13.039 degrees vertical, 5 degrees elevation | Current private look study; final stage camera pending |
| Hero marble | 5/8-inch sphere, 5.027488 g | Ceramic geometry and exact stored fixture mass |
| Port rail | Top 2 inches above bench; 8 inches long | Two hundred straight-rail corner/interior samples, both orientations |
| Nominal baton speed | 8 inches/s | Canonical rolling state passes rail in both orientations |
| ACCEPT | Speed 6.4 to 9.6 inches/s, y 2.3045 to 2.3525 inches, vertical speed at most 0.6 inches/s, rolling spin residual at most 2 rad/s | Full range sampled by the rail experiment |
| EMIT | Speed 7.84 to 8.16 inches/s, y 2.3125 inches plus or minus 0.008 inch, vertical speed at most 0.4 inches/s, rolling spin residual at most 0.5 rad/s | Canonical rail cases pass; out-of-range mutations rejected |

Rolling spin residual means angular velocity minus the expected rolling angular
velocity. A zero-spin marble sliding along the rail is not a rolling handoff.
The nominal canonical state is x = 0, y = 1.15625, vx = 4, vy = 0, spin = -25.6.
The reflected canonical state reverses horizontal speed and spin.

The rail experiment measured vertical positions from 1.1531626 to 1.1542175 units
and maximum vertical speed 0.1286403 units/s. Those measurements informed the initial
contact tolerance. A flat rail settles bounce but does not normalize incoming speed.
The two canonical runs pass the complete EMIT envelope; the other rail samples prove
settling only. This is not the 200-run robustness gate for a stage. Each stage still
needs a visible release/run-out mechanism and complete robustness checks.

`capacity.mjs` steps two independent worlds, observes contacts each physics tick,
renders all dynamic bodies in the existing near scene and zooms across ten plots.
Median p95 for the CPU-4x 844x390 proxy is 10.1 ms at 32 bodies per world, 13.2 ms at 48
and 16.2 ms at 64. Desktop at 32 is 3.1 ms; GPU p95 is 1.434 ms for the phone proxy
and 2.065 ms for desktop. Every run has more than five percent of frames with all
bodies awake, so sleeping alone cannot hide the busy interval. The conservative 32-body proposal leaves room for final
film effects and sound. This is a desktop-GPU proxy, not a measured phone. Recheck
with the finished slice before freezing the cap.

```sh
node tools/chain-reaction/materials.mjs
node tools/chain-reaction/limits.mjs
CHAIN_REACTION_PLAYWRIGHT=/tmp/chain-reaction-runtime/node_modules/playwright \
CHAIN_REACTION_RESEARCH=/Users/ethan/Portfolio_01/research/chain-reaction \
  node tools/chain-reaction/capacity.mjs
```

The full verifier also runs the material and limit checks. Parity retains the original
forty-four fixture comparisons and adds four hundred rail snapshots plus eighty-eight
mass-model comparisons across Chrome and WebKit. No stage schema, recorder, complete
chain or final art is approved by these tests.

## Three-stage review slice

The earlier review at `chain-reaction/earlier-slice.html` contains three mechanisms and sixteen physical
transfers, lasting 24.43 seconds. A damped gravity arm tips a ruler; a hanging tin
cup pushes a weighted mallet; a crossed-spoke wheel pushes a second knocker.
Every mechanism ends by sliding a latch, dropping a gate and releasing a ceramic
marble down the same measured run-out. This is a review slice. Its look, sound and
proposed anchors remain unapproved.

The three recorded stages pass 200 variations per orientation, 1,200 runs in total.
Sampling includes all sixteen entry-envelope corners, position variation of
0.02 units, angle variation of 0.5 degrees and ten percent friction/bounce variation.
All thirty-two independently clamped-predecessor controls keep the output marble
inside the plot. Twenty-two doubled-recipient-mass runs also complete. This is a
load-reserve stress test, rather than a calibrated measurement of delivered energy.
Materials and mass stay unchanged when finishes change.

`schema.mjs` validates data-only stages, named recipes, exact mass and inertia, kit
versions, mounts, canonical entries and recorded results. `stage.mjs` observes
contacts and recipient motion, output state, plot bounds, surface speed, dead time
and rope stretch. `verify --record` is the only writer of verified blocks and accepts
changed files only. It reuses a variation report only when the complete source hash,
physics version and both canonical state hashes match. `verify --full` is read-only
and replays every canonical orientation, retaining all foundation gates.

```sh
node tools/chain-reaction/verify.mjs --record assets/chain-reaction/stages/00001.json
node tools/chain-reaction/manifest.mjs
node tools/chain-reaction/verify.mjs --full
node tools/chain-reaction/lint.mjs
```

Public records retain poses, events, camera paths and summary evidence. Full traces
stay in the private research repository. Compact stage serialization avoids copying
verbose diagnostic data into every future stage. The manifest keeps content hashes,
titles, durations and step counts.

Camera paths use quintic easing and logarithmic zoom. Actual contact points are
projected at 1440x900, 844x390 and 390x844 for both follow and reveal paths. The first
pullback uses 2.3-second flights and a 1.5-second hold to keep the existing jerk caps.
After the owner's zoom-flashing feedback, the reveal moved into stage 1's slow arm
fall. It returns at 6.7 seconds, before the first contact at 6.896 seconds. Stage 2
stays close through the cup setup. This solves the hidden-contact problem without
retiming physics; it differs from the brief's proposed four-second stage-2 breather. The same width, height and target position join
stages. The renderer carries the marble's painted rotation into the next entry and
hides each future canonical entry until its predecessor arrives.

The scene uses real-depth meshes, shared procedural finishes, world-space light,
beveled edges, visible bearings, stops, guide slots, stands and dashpots. The owner requested sharper background objects and shadows on October 6, 2026.
The current renderer copies the scene color without focus blur, shutter blur or
film grain. Physics stays at 240 Hz. Earlier versions used depth-buffer focus blur
and two display-only shutter samples; their evidence remains in the private records. The renderer warms
both scene and film shaders before motion. The scene target retains a 24-bit depth texture.
The row light and its shadow volume stay anchored to the set during camera travel.
The current multisample scene pass resolves both color and 24-bit depth. Camera clip limits track
lens distance (near is half the distance, far is 1.5 times it plus 8 units), and the
GPU depth probes reconstruct distance from those actual limits. The former 16-bit buffer
with fixed 0.1-to-800 limits lost inches of depth at overview distance. Gold mounting
feet could then tie with the farther bench in depth and be overwritten by it.
A missing depth buffer formerly let rear objects overwrite front objects in one
shutter sample, changing brightness by up to 82 RGB levels on the frozen scene.

`slice.mjs` compares six full-stage snapshots and semantic reports in Chrome and
WebKit, then checks controls, layouts, deep links and reduced motion. `film.mjs`
measures five busy and overview runs per profile, captures sixteen splice frames,
and checks continuous playback. `opening.mjs` checks the automatic reveal, return
and saved-stage resume in both browsers. Its return-before-contact assertion prevents
future opening edits from hiding the first transfer. `temporal.mjs` freezes bodies
and grain, compares both shutter passes at three zooms and three screen shapes in
both browsers, and checks a 121-frame pullback-and-return sequence. All 24 comparisons
are pixel-identical for frozen bodies. These checks isolate shutter occlusion and
return stability; they missed depth precision failures during camera travel.
`depth.mjs` now reads GPU depth at known bench-plane points throughout 121 camera
frames, including the owner's viewport and high-density displays in Chrome/WebKit.
It also uses the real bearing-foot geometry in a color-ID scene with the production
paint-before-maple order. The old renderer lost that foot in 330 of 414 visible
samples; the correction loses none. Maximum bench depth error fell from 2.657 units
to 0.000589. The color-ID view is test-only. It never alters public materials.

`alignment.mjs` compares the actual rendered collider meshes with their physical
positions and thicknesses. It covers armed and spent poses, both directions and
both browsers. Simple parts formerly applied their depth offset twice; compound
parts applied it once. The correction leaves no mismatches in 288 mesh probes per
browser, compared with 192 before. This check keeps visible contact surfaces aligned
with the physics, including mechanisms that mix simple and compound parts.

`storyboard.mjs` steps each canonical stage in Node, checks its stored state hash,
then renders exact requested ticks in the browser without rAF. It writes twelve
event frames, half-second timelines, sixteen frames at 30 fps around the payoff
and handoff, a fixed-camera maximum-light exposure of swept surfaces, and three
1:1 pixel crops at the closest allowed zoom. The first-visit reveal gets half-second
sheets at desktop and both phone shapes. Reports retain physics and renderer hashes.
All images and traces stay private. Set `CHAIN_REACTION_SHARP` to the scratch Sharp
package, and optionally set `CHAIN_REACTION_EVIDENCE` to a cycle directory. Otherwise
new capture tools use `research/chain-reaction/evidence/latest`.

Static stock, mounts and dressing cache their local transforms. Moving part groups,
dashpots and their rods still update; parent motion reaches every attached mesh.
Both color exposures share one shadow map from the latest shutter sample. This is
a display approximation that avoids rendering the same shadow map twice per frame.
Physics and color exposure times stay unchanged. Paused and hidden views stop
painting until their scene or camera changes. Follow restores the paused camera,
and at the end it follows the final marble. Metrics reset never changes the rendered
stage. `idle.mjs` checks those behaviors in both browsers.

`film.mjs` now includes the owner's high-density viewport and a CPU-4x high-density
phone profile, with the existing 16.7 ms limit. The browser harness owns each test
process and closes it in a finally block.

## Sound for owner review

The public sound button stays hidden. A private comparison pairs modal voices with
CC0 [wood knocks by ominouswhoosh](https://freesound.org/people/ominouswhoosh/sounds/679772/)
and a [thin metal impact by Allan Legemaate](https://freesound.org/people/alegemaate/sounds/364706/).
Preview audio is decoded in memory for spectral and decay comparisons and is never
shipped. Resonant modes follow material and size, with provisional frequencies rather
than measured object calibration. The approach follows the authors' description of
[FoleyAutomatic](https://www.persianney.com/kvdoelcsubc/pubs.html).

A rolling noise voice follows marble speed near the rail. Verified contacts schedule
modal impacts with 100 ms lookahead, a 60 ms pair cooldown and at most eight voices.
Off-screen voices become quieter and duller. A deterministic room impulse combines
three early reflections with a decaying tail. Its absolute impulse sum is bounded,
so the voice cap, rolling gain and room response permit a conservative clipping
check. One world provides no cross-world loudness comparison yet. Approval by ear
belongs to the owner.


## Sharpness and antialiasing

Renderer 0.1.4 antialiases the offscreen scene, rather than relying only on the
canvas context. Supported WebGL2 uses four-sample multisampling, clamped to the
GPU's sample limit. Other contexts use a larger scene texture with linear
downsampling, bounded to eight million pixels and the GPU texture limit. Screen
DPR is capped at two. Final color has no focus blur, shutter blending or grain,
so rear surfaces and moving edges retain their rendered detail. The fixed key
light uses a 4096 shadow map with narrower PCF filtering, clamped to the GPU limit.

The clarity fixture measures actual GPU multisample allocations and fractional
coverage on a diagonal edge. A rear checkerboard and raw scene-buffer comparison
prove that the final pass preserves detail. The former single-sample scene buffer
has no fractional edge coverage in the fixture; its focus pass changes values by
up to 107 levels. The revised final pass matches the scene buffer exactly in both
browsers, while actual multisampling supplies edge coverage. Rendering checks
retain zoom stability and physical mesh alignment. Private prototypes share these
quality settings, with separate tests of actual WebGL2 and forced WebGL1 pages.

The depth check compares a resolved sample with the exact bench-plane depth range
inside its pixel, retaining the 0.002-unit allowance outside that range. This
accounts for the covered subpixel selected by MSAA depth resolve. The revised
renderer loses none of 414 mounting-foot frames; the old 16-bit renderer loses
330 of 414 and fails all six profiles with errors up to 2.47 units outside the
pixel footprint. No simulation setting or physical gate changes.

The CPU-4x landscape phone proxy stays within the 16.7 ms frame budget: median
busy/overview p95 intervals are 10.0/11.0 ms at DPR one and 10.8/11.3 ms at DPR
two, across five runs per view. Desktop is 5.7/5.6 ms; the owner-sized high-density
view is 7.8/6.3 ms. Continuous three-stage playback and all sixteen handoff frames
pass. These are local proxy measurements, not measurements on the owner's phone.
