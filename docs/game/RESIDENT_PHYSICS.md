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

## Elastic material comparison (v28.116)

Open `grand-motherload.html?softplay=1&softmaterial=1`. **New material** and
**Prior material** use the same contact, handling, and terrain experiments.
The arrangements are **Drop and settle**, **Lift and throw**, and **Ledge and
wall**. Repeat restores the arrangement, and the drop starts from the same
unstrained body. Saves are disabled. The ordinary game and earlier comparisons
keep their existing materials. Hard circular visitors are unchanged.

The trial keeps the resident's 37-node spring web. The 78 overlapping health
triangles remain orientation probes; they are not a valid FEM integration mesh.
Their summed rest area is about 1.46 times the enclosed body area. Converting
them directly into elastic volume elements would count material more than once.

Each spring stores quadratic plus quartic strain energy. It yields softly near
rest and gains resistance continuously with stretch or compression. Its XPBD
constraint uses the derivative of that energy in both the effective mass and
the correction. No interaction state changes its compliance. The boundary area
constraint keeps one fixed rest volume and computes all gradients before
moving any node. This avoids the artificial net force and torque produced by
rereading already-moved neighbors during the prior pressure pass.

Internal damping applies equal and opposite impulses along each spring. It
reduces deformation energy while preserving linear and angular momentum.
It replaces the old neighbor-averaged XSPH damping and the velocity pull toward
a moving muscle pose. The material also omits global shape matching and timed
shape recovery. Its visible relaxation comes from elastic forces and damping.
Existing contact, strain limits, orientation guards, and exceptional inversion
recovery remain safeguards.
The active orientation barrier also removes inward area velocity using the
corrected triangle's gradient. Previously a positional repair could preserve
invisible compression velocity and repeatedly strike the same barrier. The
new impulse dissipates that motion locally; terrain can supply an external
reaction when the gradient is blocked by a wall or floor.

Initial trial coefficients are spring compliance 0.002, area compliance 0.002,
quartic strain factor 4, and edge damping 8 per real second. These are game-unit
coefficients for the existing equal-mass web, not calibrated physical units.

The existing brain, muscle rest-length waves, and terrain adhesion remain
active. Removing the additional global pose pull changes how those muscles
move the body; this stage must therefore check self-directed movement as well
as passive manipulation. The later intention/movement stage remains separate.
World gravity, air drag, rig contact, pointer handling, and terrain friction
are held constant in the comparison.

`tools/test-soft-material.mjs` compares matched drops, off-center pulls,
wall pressure, ledge release, and active movement. It measures area, deformation,
motion, release continuity, topology, and terrain separation. Isolated checks
verify internal damping and pressure do not manufacture momentum, and that
identical material states receive identical elastic corrections regardless of
behavioral flags. These checks admit an experiment to playtesting; they do not
establish that the owner prefers its feel.

Verification passed 36 matched physics cases at 30, 60, and 144 Hz and 12 real
mouse/touch interactions. Every new-material case retained positive health
triangle orientation, legal skin/terrain geometry, and zero rollback. Area
stayed between 0.957 and 1.002 of its target in these fixtures. Release preserved
node positions and histories exactly. Internal damping preserved translation
and spin; isolated pressure and area-contact checks passed their momentum and
energy checks. Self-directed movement remained active. Repeat, cancellation,
mobile controls, and ordinary defaults passed. The earlier terrain comparison,
hard-circle tests, and shared toy boot also passed regression checks.

Browser validation used native CPU canvas rendering with the existing
timer-RAF test hook and actual loading gates. It does not establish GPU
performance or identical trajectories across display rates.

## Pile performance pass (v28.117)

The contact comparison was testing every skin node against every nonincident
skin edge, including length normalization, at least four times per gel
substep. Terrain closure repeated that work. A browser CPU profile of eight
pressed residents identified this self-contact scan as the largest cost.

The solver now checks for a proper skin crossing first, rejecting edge pairs
with disjoint bounds. A clear outline needs no self-contact correction. Its
coordinates are cached in ring order so repeated visits can reuse that result;
any changed position or changed outline invalidates it by direct comparison.
Terrain validation shares this geometric query. Crossed outlines still run
the original correction loop, in the same order with the same arithmetic.
No physics step count, material parameter, collision force, or sleep threshold
changed. This affects the opt-in comparisons; ordinary game defaults and hard
circular visitors remain unchanged.

`tools/test-soft-pile-performance.mjs` measures the actual browser physics
update with awake, separated, piled and held residents. It uses a deterministic
simulation clock but a native clock for timings, with rendering excluded.
Two repeats of each eight-body fixture at 60 Hz measured these mean physics
times on the same host:

| Mode | Pile, before to after | Held pile, before to after |
| --- | --- | --- |
| Original game | 2.63 to 2.60 ms | 2.84 to 2.79 ms |
| Contact/handling comparison | 5.64 to 2.76 ms | 5.89 to 3.05 ms |
| Terrain comparison | 10.35 to 3.51 ms | 11.27 to 4.08 ms |
| Material comparison | 10.89 to 3.92 ms | 9.70 to 3.80 ms |

The material pile's mean cost fell 64%; its mean per-run 95th percentile fell
from 11.4 to 4.2 ms. These are CPU physics timings, not whole-game FPS or GPU
measurements. All 32 matched runs, including separated bodies and the original
game, produced identical SHA256 digests of every measured node position and
velocity-history byte. Each mode also reproduced its trajectory across repeats.

`tools/test-soft-skin-equivalence.cjs` compares the optimized scan against
v28.116 across deformed, crossed, touching and nearly collinear skins, changing
geometry and history between calls. All 18,216 position/history comparisons
are bit-identical, including 56,072 actual contact corrections. The full
36-case material suite, 12 real mouse/touch interactions, eight terrain
regressions at 60 Hz with free-air identity checks, and protected hard-circle
tests also pass.

## Pair contact and piles (v28.118)

Open `grand-motherload.html?softplay=1&softnext=1&softstage=1`.
**New physics** enables pair contact; **Prior physics** holds the preceding
contact, handling, terrain, and material experiments constant. Saves are off.
Small pile, two slimes, remove support, and ledge/wall arrangements can be reset
with Repeat. The support arrangement uses two bodies so the upper one can rest
on the lower one before extraction. Ordinary play retains the accepted baseline.

The existing particle hash handles bulk contact. Local node/edge and edge/edge
constraints address actual skin penetration missed between those particles.
Contact distributes position repair and normal/friction impulses over the
contacting material nodes. Position repair moves Verlet history equally, with
a 2 px nodal correction cap. Terrain mobility masks provide the wall reaction;
friction follows the normal projection and a final normal projection removes
any closing velocity introduced by that masked friction. Managed pairs omit
legacy centroid unmerge, containment ejection, crowd damping, and perch hold.
Removing a supporting body can therefore make another body fall.

The 2,120 isolated cases pass 11,616 checks of momentum, energy, friction,
normal closure, correction bounds, terrain mobility, and opt-out behavior.
The completed browser run passes 30 prior/new cases at 30/60/144 Hz and 16 real
mouse/touch cases. New pairs show no self-crossings, inter-body crossings,
embedded nodes, terrain-segment hits, or enclosed terrain samples in these
fixtures. Area ranges from 0.943 to 1.001 of rest. Supported bodies fall 27.9
to 28.8 px after extraction. Repeat, release/cancel history identity, mobile
control reachability, ordinary defaults, and the protected circle suites pass.
Rendered pile and manipulation captures were inspected. These checks establish
readiness for comparison, not owner acceptance of the feel. Browser evidence
uses CPU canvas; final combined performance remains a separate checkpoint.

## Remaining development sequence

Continue comparing one mechanism at a time:

1. Playtest the elastic material response: compression, stretch, and settling.
   Assess the current comparison before promoting it or changing the mesh.
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
