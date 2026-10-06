# Chain Reaction

Chain Reaction is in Phase 0, with no public machine or shipped stages. Its brief is
`research/next/09-chain-reaction.md` in the main checkout. Private project state and the
local look chooser live in `research/chain-reaction/`, a separate local Git repository.
Read the brief and that folder's current state before continuing.

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

The full verifier is read-only. It checks the vendored engine fingerprint and twenty-two
stored isolation hashes, reruns their numerical checks, and rejects any public stage
until stage recording, robustness, step events and chain checks are implemented.
A zero-stage result never proves a chain, a baton handoff or a robustness gate.
`--record` is unavailable during foundations.

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

Not implemented: baton envelopes, kits, stage schema, step-event verification,
200-run stage robustness, recorder, stage manifests, camera planner, material/prop
image lint, storyboard, sound, overview, first-load still, reveal flights and soak.
No Phase 0 or later gate has been approved merely because the foundation tests pass.

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
camera distance in log space; reduced motion cuts directly. The finished stage camera,
first-visit reveal, depth of field, motion blur, grain and bake/live matching are pending.

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
These values do not complete the full kit material table or freeze any gate.
