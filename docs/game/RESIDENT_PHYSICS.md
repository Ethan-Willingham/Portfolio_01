# Soft resident rollback and findings

The owner rejected the soft resident changes first deployed in v28.75 and
every subsequent iteration. Restore the last deployed v28.74 behavior before
attempting further improvements. The hard circular sky visitors are explicitly
protected: keep their physics and appearance unchanged.

## Exact baseline

The baseline is commit `ba92610` (September 23, 2026), which reached
`origin/main` at 20:47:56 CDT. The next push was merge `ce133cc` at 20:51:56,
stamped v28.75. Its other parent, `ba2e674`, also used v28.74 but introduced
the first new landing solver. It was not independently deployed. Choosing
the merge's first parent would therefore retain the first rejected iteration.

The rollback restores these fragments byte for byte from `ba92610`:

- `080-update-camera.js`
- `340-jello.js`
- `347-slime-locomotion.js`
- `347-surface-slimes.js`
- `349-slime-touch.js`
- `350-gameloop-boot.js`

It removes `342-slime-landing.js`, `343-slime-mesh.js`, and
`347-slime-material.js`, together with the tests specific to those experiments.
The original movement and interaction harnesses are restored. The shared toy
engine is synchronized through the existing build guard. The release version
continues increasing so browser caches receive the rollback.

Resident identity, radius, color, location, and save format are unchanged.
The hard-circle source `348-sky-slimes.js` is unchanged. Later bathhouse,
fire, snow, and exhaust work is retained.

## What changed, and why it could feel worse

The mechanisms below are established by the source diffs. Their effects on
feel are interpretations consistent with the owner's feedback, not something
the numerical tests proved.

| First deployed version | Change | Likely consequence |
| --- | --- | --- |
| v28.75, `ba2e674` inside `ce133cc` | Added a separate coupled rig landing solver and local volume cells. Landing repeatedly detached the motor, setting `motorBlend` to zero. That blend also controlled stiffness, damping, volume compliance, and stretch limits. | Touching a slime changed the material itself. Contact could feel like entering a special interaction mode. |
| v28.78, `22107a9` | Increased passive damping, expanded departure contact, added orientation corrections, and kept a special simulation/render mode for half a second after contact. | More state-dependent transitions controlled how a fall, compression, and departure looked and behaved. |
| v28.82, `e9e7187` | Ground driving suppressed the fling tier and injected spin. Skin smoothing moved positions and their velocity history together toward an affine reference, followed by additional orientation corrections. | Push outcomes became more prescribed. Some visible shape corrections had no corresponding velocity. |
| v28.88, `4204ed3` | Removed crawling, climbing, and terrain grips; retained the new landing and pressure stack; added continuous angular skin constraints, new friction, and deformation damping. | Removed the creatures' initiative while continuing to constrain their reactions. Stability became passivity. |

The first landing patch raised passive shape matching from a multiplier of
0.14 to 0.30, raised passive damping from 0.65 to 3, and reduced global volume
compliance to 0.06 of the normal value. v28.78 raised passive damping to 5.
These coefficients belong to different stages of the solver; they cannot be
combined into one stiffness or settling-time measurement. They do show that
the work changed much more than the contact calculation.

The v28.88 viscosity rate was 22 per second. In isolation, its residual
deformation velocity halves in about 32 milliseconds. Elastic forces can
replenish that motion, so this is not a measured whole-body settling time.
Nevertheless, it is a strong damping choice for a creature whose appeal
depends on visible deformation and recovery.

The last pass also made a product decision without establishing that it
matched the request: it interpreted "less scripted" as removing autonomous
movement. The user asked for more convincing creatures. Turning them into
passive objects did not meet that request.

## What the tests missed

Finite positions, intact meshes, conserved momentum, terrain exclusion, and
working saves are useful safeguards. They do not establish whether a creature
feels expressive, responsive, surprising, or enjoyable. The passive-material
tests even made the absence of self-directed movement a passing condition.
That checked the implementation's chosen direction rather than validating the
user's desired experience.

The restored baseline still has timed crawling, travelling muscle targets,
changing spring rest lengths, and phase-controlled terrain grips. The rollback
does not claim to deliver fully emergent motion. It restores the requested
reference so subsequent changes can be judged against something concrete.

Further work should preserve this reference, change one physical mechanism at
a time, and compare the same pushes, off-center drops, throws, wall contacts,
and interruptions side by side. Numerical checks remain safeguards. A better
score on them is insufficient evidence to replace the accepted feel again.

## Rollback verification

- Exact source comparison against `ba92610` for all six restored fragments.
- Hard-circle source comparison against the current release.
- Syntax checks for the rebuilt game and synchronized toy.
- `node tools/surface-slime-smoke.mjs`: browser boot, movement, impacts at
  30/60/144 Hz, rock and rig contact, mouse/touch manipulation, bath conversion,
  GPU water, and resident/full-game saves.
- `node tools/surface-slime-smooth.mjs`: movement continuity, wall progress,
  turns, material orientation, and display interpolation.
- `node tools/test-sky-slimes.cjs`, `node tools/test-sky-slime-jets.cjs`, and
  `node tools/test-sky-slime-physics.cjs`: protected hard-circle behavior.

Browser checks use a separate owned Chrome for Testing process and disposable
profiles. They do not read or modify the player's live save.


## Contact playtest after the rollback

Open `grand-motherload.html?softplay=1` for the opt-in comparison. The ordinary
page still uses the restored interaction path. The playtest disables both save
loading and writing, including when the URL has no `nosave` parameter.

Choose **New contacts** or **Original**, select a centered drop, either edge
drop, or a push from either side, then use **Repeat**. Each reset reconstructs
the same resident, starting rig pose, and original nearby terrain. The push applies ordinary driving
input briefly; afterward the player can drive, fly, or drag normally.
`?softcontact=1` enables only the new contact path in the normal world.

This first experiment replaces overlapping resident/rig responses with local
skin contact at the existing gel substep rate. A contact projects the rig and
the contacted skin patch apart according to their masses. Bounded friction
opposes sliding. The local force can compress or turn the gel; its existing
springs recover the deformation. The trial bypasses the resident's old landing
punch, stored rebound, track shear, bowl deformation, fling tier, and separate
rig containment passes. It does not inject a replacement bounce or spin.

The existing lattice, material coefficients, muscle waves, grips, autonomous
movement, pointer handling, jets, and world collision remain the reference.
Contact iterates with the baseline orientation constraint so a newly pressed
skin cell does not wait for the next material tick to resist folding. Actual
skin edge crossings also receive local self-contact, using their previous
sides and equal/opposite point/edge responses. This addresses tiny folds as a
pushed body returns to the floor, without prescribing an outline. It applies
consistently to all trial residents; autonomous motion can therefore diverge
when the original skin would have crossed itself. This is still the original
position-based material, including its existing recovery
and motor state transitions. The experiment does not claim fully emergent
creature behavior or a new water coupling. Hard-circle physics is untouched.

`tools/test-soft-contact.mjs` runs matched drops at several speeds and display
rates, pushes from both sides, exact trajectory identity before the first
self-contact intervention, unchanged material parameters,
high-refresh support continuity, frozen menus, and the real comparison UI.
It writes reports and actual-render image strips under `/tmp`, including both
rig-perimeter and reverse skin-inside-hull penetration. Numerical safeguards
are admission criteria for playtesting, not evidence that the new feel is
preferred. Keep the default baseline until that preference is established.

## Material handling comparison (v28.110)

Open `grand-motherload.html?softplay=1&softhandling=1` for the next comparison.
**New handling** and **Original handling** hold the v28.98 contact experiment
constant, changing only the grab/release path. The original contact comparison
URL and ordinary default game remain unchanged. Both playgrounds disable saves.

The three arrangements are **Lift and throw**, **Ledge and wall**, and
**Two slimes**, on a level apron west of town with visible foundation obstacles.
They provide loose residents to manipulate directly. Try lifting
from the middle, pulling an edge, swinging, changing direction, stopping the
hand before release, and pressing against the wall. Repeat restores the local
terrain, residents, rig, and inputs.

The new hand applies an implicit spring/damper to the same fixed, weighted
material patch as the original grip. It uses the original whole-body spring
and damping gains with the same point mass as rig contact. Damping measures
motion relative to the moving hand. Input targets advance through the actual
gel substeps, including queued input on display frames without a gel tick.
Gravity continues to act while held. The rest of the body follows through its
existing springs, which lets an off-center pull supply torque.

Release and cancellation remove the attachment without changing any node
position or velocity history. They do not call the cursor-velocity launch
helper or start the original 1.2-second rest-shape recovery. Resetting only the
render snapshot prevents the switch from held to interpolated drawing from
jumping backward. Swept terrain and enclosure checks operate independently
of shape recovery in the experiment. If a grip step is geometrically rejected,
all its positions return to their previous legal pose and velocity history is
set to that same pose. This conservative fallback discards the blocked step's
motion. Preserving previous or candidate velocity while every node stands
still would store an invisible throw. Valid steps retain their ordinary motion.

The baseline motor detachment, genuine inversion recovery, material settings,
world contacts, jets, water behavior, and hard circular visitors are retained.
This is a handling experiment, not a replacement for the creature's locomotion.
`tools/test-soft-handling.mjs` compares release continuity, swing and stretch,
wall contacts, frame rates, and real mouse/touch interactions. Playtesting
still decides whether the response feels better.

The handling solver passed 42 matched cases at 30, 60, and 144 Hz, plus 12
mouse/touch interactions across both modes and all three arrangements. Release
changed no node position or velocity history. Wall tests confirmed actual
contact and caught a rejected-step defect: a stationary held body retained
roughly 300 px/s of invisible motion. After the history fix, the stationary
wall hold releases at zero velocity at all three rates. Off-center swings
retain their simulated spin. These checks establish continuity and safety;
they do not establish a preferred feel or identical trajectories across rates.

## Terrain contact comparison (v28.112)

Open `grand-motherload.html?softplay=1&softterrain=1`. **New terrain** and
**Prior terrain** hold physical handling and rig contact constant. Both use
the same material, autonomous movement, and visible test arrangements. Saves
are disabled, and the ordinary game retains its accepted baseline.

The terrain trial replaces endpoint-only point collision and midpoint skin
collision with swept point contacts, exact skin-segment/tile intersection,
and moving-edge contacts with exposed convex tile corners. Each constraint
acts on the contacting node or the two nodes that support that skin location.
The correction uses their weights and effective mass. Tangential velocity is
retained subject to friction bounded by the inward normal impulse. Internal
tile seams do not create corner contacts.

Terrain and the existing orientation constraint converge locally before
validation, including after global contact and after release. A triangle whose
orientation gradient is constrained by terrain now includes the resulting wall
reaction in its velocity. Previously that correction could stop the visible
body while preserving its momentum into the wall. Free-space orientation
corrections retain the baseline behavior. Atomic rollback remains a fallback
for unresolved invalid manipulation, not the intended response to pressure.
Skin crossings are checked independently of the health triangles: a shallow
fold at a floor/wall corner can leave every triangle facing correctly. Local
self-contact and terrain constraints close together before accepting the step.

The comparison harness is `tools/test-soft-terrain.mjs`. It checks the entire
skin and enclosed terrain samples, rather than treating legal nodes alone as
proof of a legal body. Floor pressure, wall sliding and reversal, ledge pulls,
and removal of support are compared at multiple display rates. Separate
free-flight and held-in-air comparisons protect unchanged motion away from
terrain. Tests establish safety and continuity; preference still comes from
playing the comparison.

The terrain comparison passed 24 A/B cases at 30, 60, and 144 Hz, plus 12 real
mouse/touch interactions. The new mode had no embedded nodes, skin/terrain
intersections, enclosed terrain samples, self-crossings, or inverted health
triangles in these fixtures. Free-flight and held-in-air node histories were
identical with terrain toggled. Release preserved all node histories, and
Repeat, cancellation, mobile controls, and ordinary-game defaults passed.
Floor-pressure rollback counts fell from 979-1046 to zero; wall-slide counts
fell from 1185-1200 to at most one. The new mode continued sliding and reversing
under pressure, with no frozen or tangentially stuck frames in these fixtures.
The final run used native CPU canvas rendering with the existing timer-RAF
test hook and actual loading gates; GPU rendering was not validated in that run.

## Remaining development sequence

After terrain contact earns its place, compare one mechanism at a time:

1. Material response: compression, stretch, surface tension, and internal
   motion settling, with the existing mesh assessed before structural changes.
2. Soft-body pairs and small piles: load transfer, local deformation, sliding,
   separation, and removal of support.
3. Movement driven by intention: destinations and muscle effort remain active,
   while contact and the body's current motion determine the result of each
   attempt and interruption.
4. World forces: audit existing jets and water coupling at the actual contact
   locations, then test those forces in combination.
5. Presentation: make the simulated compression, stretch, eye inertia, and
   contact strength legible through rendering and sound.
6. Integration and performance: ordinary play, multiple residents, bathhouse
   conversion, saves, desktop, touch, and frame-rate coverage. Promote only
   comparisons the owner prefers; numerical stability alone is insufficient.

Hard circular visitors remain protected throughout. No stage may discard the
accepted reference or silently change several physical mechanisms together.
