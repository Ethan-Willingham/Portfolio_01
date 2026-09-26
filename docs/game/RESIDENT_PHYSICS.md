# Soft resident physics

The post-bathhouse gel residents should communicate through their material
response. A push should compress the near side, transfer momentum through the
body, and produce a different result when applied off center. A release should
continue the motion already present in the material. The hard circular visitors
keep their existing physics and appearance.

## Material contract

- Rest geometry, elastic compliance, volume, and viscosity are independent of
  behavior state. A contact cannot switch the body into another material.
- There is no autonomous body pose, gait clock, destination, upright frame,
  ledge maneuver, or magnetic terrain attachment. The eye may glance and blink;
  those animations never write to the body solver.
- The planar volume cells preserve local area. Elastic braces and a weak,
  rotation-invariant rest preference let the body recover from deformation.
- Viscosity removes only velocity relative to the best fitting rigid motion.
  Its correction has zero total linear and angular impulse. Air drag and
  external contacts may still dissipate translation and rotation.
- Skin curvature is controlled under every load, with the same coefficients.
  The affine reference permits broad flattening and lateral spread.
- The hand applies bounded spring forces to a fixed material patch. Releasing
  or cancelling the grip leaves positions and velocities unchanged. Swept
  terrain protection remains active briefly after release.
- Terrain friction constrains tangential displacement as well as velocity,
  preventing constraint corrections from sliding a stopped contact patch.
  Static and dynamic friction are bounded by the normal contact correction.
- Sleep uses real elapsed time and speed at every display refresh rate.
  Supporting terrain and water can wake a sleeper. Waking supplies no impulse.
  A missing floor means a fall, including into a mine shaft.
- The visible contour, collision skin, and water displacement share the mesh.
  Interpolation changes only presentation, never contacts or saved positions.

## Implementation

`347-slime-material.js` replaces `347-slime-locomotion.js`. It contains the
viscosity decomposition and observational support state. `340-jello.js` keeps
the shared solver, with resident-specific material choices. `342-slime-landing.js`
owns local volume, curvature, and rig contact; `343-slime-mesh.js` owns the
planar material cells. `349-slime-touch.js` applies the grip and handles release.
Resident identities, radius, color, position, and existing saves are unchanged.

The first playable revision deliberately makes residents passive physical
toys. If autonomous movement returns, it must act through bounded local forces
and physical contact. Tests must demonstrate stalled motion under obstruction,
no propulsion in free space, and no material changes when interrupted. A new
body animation is not a substitute for those properties.

## Verification

```sh
node --check js/sluice.js
node tools/test-slime-mesh.mjs
node tools/test-resident-material.mjs
node tools/surface-slime-smoke.mjs
EXTENDED=1 CONTACTS=1 PLAYBACK=1 node tools/test-slime-landings.mjs
node tools/test-sky-slime-physics.cjs
node tools/test-sky-slime-jets.cjs
```

The material harness measures linear and angular momentum, free spin at
30/60/144 Hz, cell health and volume across three radii, quiet settling, mined
support, exact velocity continuity on release/cancel, and independence from
animation age. It writes a contact strip and numerical report to `/tmp`.
The smoke harness covers the real mouse/touch handlers, GPU water, bath
conversion, and save round trips. The landing harness tests pressure, piles,
ceilings, sustained load, ground driving, frame-time variation, and real playback.

The older crawl/snail/gait/orientation harnesses described the removed motor.
Their passive interaction checks now belong to the material and smoke harnesses.
