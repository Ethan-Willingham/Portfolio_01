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
The elastic tension braces remain separate from these cells. This
matters because enumerating triangles from the brace graph double-counts some
sectors. The default 37-node resident has 54 material cells whose areas sum to
the skin's enclosed area.

Each cell resists compression while allowing shear. Global area preservation
and a larger passive stretch limit let a landing spread the body sideways.
Incident-cell checks limit skin displacement before a contact can turn a
cell inside out. Terrain contacts and local volume are reconciled through
stacked residents as well as the body directly under the rig.

Compliant angular constraints resist isolated skin creases under load.
The reference follows the body's affine deformation, leaving broad flattening
and sideways spread free. Their gradients have zero total force and torque;
the resulting elastic deformation participates in the velocity solve.
The same bending law applies during free motion, handling, and contact.

Residents retain the same material during loading and release. There are no
crawling grips or muscle targets to switch off and restore. Viscosity damps
deformation without removing rigid translation or rotation, and runs before
terrain friction so it does not restore slip to a stopped contact point.
Legacy cube seating, bowl carving, and side ejection do not also act on the
resident being loaded. The rig remains subject to swept terrain and ceiling
collision during the coupled step. Jets, walking off, grabbing, and unsupported
falls release the contact normally.

Ordinary ground driving uses a rate-limited horizontal push at every driving
speed, without the old fling's added loft or spin. Falling onto the skin retains
the coupled landing response. Final side-containment corrections also pass
through the cell-orientation guard before rendering.

Continuous vertical rig movement feeds directly into its drawing position.
The existing correction filter only smooths residual errors, so contact does
not switch from a delayed fall to direct movement and back on rebound. The
camera and smoke domain sample the completed contact step before rendering.
The skin keeps this same timeline briefly after contact, avoiding a switch to
delayed interpolation in mid-rebound. Other residents retain interpolation.
Verlet history is rescaled when the step duration changes. Shape recovery and
viscosity also scale with elapsed time; small RAF variations cannot add an
extra block of spring strength or damping. The orientation guard covers both
the original health triangles and the actual material cells.

The saved resident format is unchanged. Restoring a resident rebuilds its
material cells from its existing identity, size, and position.

Verification commands:

```sh
node tools/test-slime-mesh.mjs
node tools/test-slime-landings.mjs
EXTENDED=only node tools/test-slime-landings.mjs
EXTENDED=1 CONTACTS=1 PLAYBACK=1 node tools/test-slime-landings.mjs
node tools/surface-slime-smoke.mjs
node tools/test-resident-material.mjs
```

The landing harness uses an owned Chrome for Testing process. It writes
trajectories, cell health, terrain checks, timing, and a contact strip to
`/tmp`. Extended cases include a full-height fall, a free-moving resident,
and small frame-time variations around 60 Hz. They check visible alignment,
legacy collision interference, and consistent compression/rebound strength.
`CONTACTS=1` adds held ground driving in both directions and 15-second seated
loads across three sizes and frame rates. Centered load fixtures follow the
body horizontally to keep pressure applied for the full interval; living
residents retain normal free movement, including off-center departures.
These check unintended flings,
vertical launch height, cell folds, and isolated sharp skin tips. Worst-case
rendered outlines are saved beside the trajectories. `CONTACTS=only` narrows
the run to those cases; `DIAGNOSTIC=1` records older comparison bundles without
applying the current assertions.
`PLAYBACK=1` also runs and samples the real game/render loop for 4.5 seconds.
`FPS`, `SPEEDS`, `CASES`, `DUMP`, and `PORT` narrow or relocate a run;
`BUNDLE` allows a baseline comparison. No test alters a player's saved game.
