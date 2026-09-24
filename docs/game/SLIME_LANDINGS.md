# Resident slime landings

The default surface residents use a coupled rig and gel contact solve. The
rig's swept feet acquire the actual skin, then both participants advance in
the same small physics steps. Five samples across the tracks distribute load
to interpolated skin edges. Finite contact compliance and relative normal
damping spread the load over the compression; a pinched material cell cannot
redirect its rejected displacement into a hard rig stop. Bounded friction
grips the tracks. The recovering mesh supplies
the rebound; there is no stored launch impulse.

`342-slime-landing.js` owns this contact and the local material-volume solve.
`343-slime-mesh.js` builds a planar cell mesh over each resident's radial nodes.
The tension braces used by crawling remain separate from these cells. This
matters because enumerating triangles from the brace graph double-counts some
sectors. The default 37-node resident has 54 material cells whose areas sum to
the skin's enclosed area.

Each cell resists compression while allowing shear. Global area preservation
and a larger passive stretch limit let a landing spread the body sideways.
Incident-cell checks limit skin displacement before a contact can turn a
cell inside out. Terrain contacts and local volume are reconciled through
stacked residents as well as the body directly under the rig.

Loaded residents release their climbing grips and pause their muscle waves.
The active gait's volume targets and compliance blend back in as crawling
resumes. Internal damping removes lingering oscillation. Legacy cube seating,
bowl carving, and side ejection do not also act on the resident being loaded.
The rig remains subject to swept terrain and ceiling collision during the
coupled step. Jets, walking off, grabbing, and unsupported falls release the
contact normally.

Continuous vertical rig movement feeds directly into its drawing position.
The existing correction filter only smooths residual errors, so contact does
not switch from a delayed fall to direct movement and back on rebound. The
camera and smoke domain sample the completed contact step before rendering.
The skin keeps this same timeline briefly after contact, avoiding a switch to
delayed interpolation in mid-rebound. Other residents retain interpolation.
Verlet history is rescaled when the step duration changes. Shape recovery and
viscosity also scale with elapsed time; small RAF variations cannot add an
extra block of spring strength or damping. The orientation guard covers both
the original health triangles and the actual material cells during crawling.

The saved resident format is unchanged. Restoring a resident rebuilds its
material cells from its existing identity, size, and position.

Verification commands:

```sh
node tools/test-slime-mesh.mjs
node tools/test-slime-landings.mjs
EXTENDED=only node tools/test-slime-landings.mjs
EXTENDED=1 PLAYBACK=1 node tools/test-slime-landings.mjs
node tools/surface-slime-smoke.mjs
node tools/surface-slime-crawl.mjs
node tools/surface-slime-smooth.mjs
```

The landing harness uses an owned Chrome for Testing process. It writes
trajectories, cell health, terrain checks, timing, and a contact strip to
`/tmp`. Extended cases include a full-height fall, a living crawling resident,
and small frame-time variations around 60 Hz. They check visible alignment,
legacy collision interference, and consistent compression/rebound strength.
`PLAYBACK=1` also runs and samples the real game/render loop for 4.5 seconds.
`FPS`, `SPEEDS`, `CASES`, `DUMP`, and `PORT` narrow or relocate a run;
`BUNDLE` allows a baseline comparison. No test alters a player's saved game.
