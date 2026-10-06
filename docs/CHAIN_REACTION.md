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

The full verifier is read-only. It checks the vendored engine fingerprint and twenty
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
