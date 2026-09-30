# Soft resident rollback and findings

The owner has since authorized the complete new resident model in ordinary
play. The rollout described under Combined playground supersedes the earlier
default-baseline instructions below; those sections record the comparisons
and their verification as they were developed.

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

## Movement through bounded effort (v28.119)

At checkpoint 2, New keeps destinations, idle/crawl decisions, and edge turns,
then spends effort through local spring rest strain and terrain traction.
There is no center-velocity target, imposed pose, or air drive. Rest strain is
bounded to 18 percent and its change to 65 percent per real second. Total
traction is limited to 2.2 body weights, with each patch limited to 0.6 body
weights. Mucus attachments begin at the current contact, follow measured
surface slip, and release on overload, lost terrain, handling, or wetness.
A wall attempt can partly lift the body and then slip.

Long movement tests exposed two distinct skin defects. Integration could fold
skin in a step without terrain penetration, while closure was gated on a
terrain hit. Also, nonincident edges could overlap collinearly on the floor
without satisfying a strict crossing test. That zero-width pose became a
rollback snapshot, so a subsequent fold repeatedly restored it and froze the
body. Merely extending the validator stopped visible folds but did not fix
movement.

The intent trial closes actual skin contact independently of terrain hits.
Its contact uses the swept point/edge crossing when available, with local
separation for degenerate intersections. Collinear overlap is included in the
query; mere endpoint touching and ordinary flat separated edges remain clear.
The clear-ring cache records which policy it used. Corrections distribute
locally through terrain mobility masks, move histories with geometric repair,
and remove inward relative velocity without prescribing the body outline.
The accepted reference and earlier comparison arithmetic are retained.

The contact law suite covers 2,016 cases, including all 63 nonempty terrain
mobility masks, the 2 px correction cap, momentum, torque, energy, and normal
closure. The extended browser matrix checks floor travel in both directions,
walls, and ledges for 20 seconds each at 30/60/144 Hz. Geometry checks include
skin crossings, collinear overlap, triangle orientation, terrain segments,
and enclosed terrain, alongside rejected-step and frozen-motion counts.

The completed matrix has zero exposed crossings, overlaps, embedded nodes,
terrain-segment hits, enclosed terrain samples, and rejected steps. No active
body freezes beyond a single unticked display frame at 144 Hz. This admits the
controller to combined testing; it does not establish a preferred feel.

## Local jets and water (v28.120)

At checkpoint 3, New adds local world forces to pair contact and physical
movement. Prior keeps those earlier checkpoints. Exhaust pressure acts on
upstream skin edges with terrain and nearer-body shielding. Its reaction on
the rig uses the same point/rig mass ratio as rig contact, with one shared
frame budget. Pressure falls as skin approaches exhaust speed. There is no
near-field positional carving or prescribed body trajectory.

An 8 px sparse grid averages the actual local water velocities. Wet skin
receives drag relative to that flow, with stronger normal than tangential
resistance. Each component exponentially approaches the current without
overshooting it. The existing hydrostatic lift remains; the old whole-body
water drag is bypassed for these residents. Liquid velocities and GPU mirror
ages use the fluid solver clock, so the adapter converts them to real time.
The CPU fluid boundary uses local skin velocity and retains tangential flow.
The GPU boundary also receives the correct solver-time velocity, including
slow material motion previously hidden by its speed fade.

Water can wake a sleeping resident through a current or changing hydrostatic
support, including immersion in still water and removal of water. Frozen
bodies outside the camera keep the existing culling behavior. GPU flow older
than 0.1 real seconds is discarded. A visible wet trial resident temporarily
requests a two-frame readback interval; leaving the wet scene restores the
current user setting. Ordinary dry frames do not change readback cadence.

The isolated force suite passes 22 law groups, covering dissipation, timestep
conversion, momentum/recoil budgets, shielding, cache invalidation, sleeping,
opt-out behavior, and cadence restoration. Actual CPU basin and jet fixtures
pass at 30/60/144 Hz. Actual WebGPU fixtures pass at 30/60 Hz with advancing
readback generations, stable skins, and conserved particle counts. With pairs, intent, and world forces active, fresh flow was available for
93.2% and 100% of wet frames at 30 and 60 Hz after initial acquisition;
remaining gaps occurred on water reacquisition.
A deliberately blocked asynchronous readback supplied no drag or wake, and a
subsequent fresh current woke the resident. These are correctness checks,
not GPU performance measurements.

Coupling is approximate two-way interaction, not a conservative fluid-solid
solver. Existing hydrostatic sampling retains its own mirror behavior, and
GPU boundary upload still includes at most six visible residents. Those
limits are not changed by the new local drag calculation.

## Material presentation (v28.121)

At checkpoint 4, New adds eyes, highlights, and contact sound to the preceding
physical mechanisms. Eye deformation uses a local six-spoke strain map.
Highlights and three inclusions attach to real local rest-mesh triangles,
so their motion follows the material around them. The pupil responds to
actual node motion and retains the resident's idle gaze. Rendering reads the
physics state without changing node positions, rest geometry, or histories.
The palette and unstroked body outline are retained.

Rig, terrain, and pair solvers report actual approach speed and resolved
normal velocity change in real px/s. A pinned body can therefore sound when
its local patch is struck, even if its center is stationary. The older
center-speed heuristic is bypassed for these residents. Existing strongest-hit
selection, per-body cooldowns, distance falloff, and the shared pile voice
limit still select sound events. The new path reuses the existing sound bank.

The isolated suite passes 3,843 assertions, including real hook calculations,
read-only material drawing, pupil behavior at 30/60/144 Hz, pinned impacts,
and pile voice limits. The browser harness exercises the real renderer and
warm-up, including rest, compression, shear, and blinking. Real contact events
reach the existing mixer for terrain, rig, and simultaneous eight-body hits;
cooldowns suppress repeats and pause discards queued events. Audio verification
checks event requests, not a listening judgment. Rendered comparison captures
were inspected. Final feel and sound preference remain owner playtesting.

## Combined playground (v28.122)

The complete trial is available at
[the resident playground](https://ethanwillingham.com/grand-motherload.html?softplay=1&softnext=1).
Saves are disabled there. Select Pair contact, Movement, Jets and water, or
Eyes and sound. New adds the selected mechanism to Prior, keeping earlier
checkpoints active. Accepted reference turns off all eight experiments while
retaining the same scene. Repeat restores terrain, particles, resident poses,
and input ownership. Nine scenes cover piles, two residents, removal of
support, ledges and walls, head-on and glancing impact, crawling, rig jets,
and a raised water basin. The controls also work on touch screens; native
selector keys stay with the selector instead of moving the rig.

At the owner's request, ordinary play now enables all eight resident paths:
rig contact, handling, terrain contact, elastic material, pair contact,
bounded movement, local jets and water, and deformation-led eyes and sound.
Existing and resumed residents and newly softened bath guests use that same
model with ordinary saves. `?softnext=0` restores the pre-v28.75 reference.
The older isolated `?softplay=1` comparisons and explicit contact, handling,
terrain, or material query flags retain their individual selections.
`?softnext=1&softstage=1` through `&softstage=4` selects a combined checkpoint.
Force state is transient; resident identity, color, size, and saved placement
keep the existing format. The hard circular sky slime source remains unchanged.

### Verification and limits

The final v28.122 CPU browser matrix passes 144 prior/new physics cases at
30/60/144 Hz, plus 36 real mouse/touch cases across the nine scenes. New-mode
fixtures have no self-crossings, collinear overlap (movement and later),
inter-body skin crossings, embedded nodes, terrain-segment hits, or enclosed
terrain. Area stays between 0.941 and 1.001 of rest; supported bodies fall
27.9 to 28.8 px when their support is removed. The separate extended movement
matrix covers both crawl directions, walls, and ledges for 20 seconds each.

Save identity and dimensions, bathhouse conversion, pause and shop freezing,
sleep/wake through grabbing, menu cancellation, Repeat, release ownership,
and mobile reachability pass. Eight reference/prior-material trajectories
match v28.117 byte for byte. All three protected circular-slime suites pass,
and their source SHA256 remains
`419ab25667a688ca9a21ca5dbe93bb9031fbe69f187e3e704a778a8b6fbbdabe`.
The shared water/smoke/slime toy boots with advancing simulation and canvas
pixels, finite residents, active water and smoke, and no browser exceptions.
Final WebGPU checks run all four checkpoints at 30/60 Hz. The actual playground
basin retains 6,300 particles; a real Repeat click restores identical water
and resident pose hashes. At v28.122, a fresh ordinary boot left all eight
trials off; the subsequent owner-authorized rollout changes that default.
These GPU checks validate behavior, not GPU frame timing.

Serial CPU measurements on this machine use eight awake residents, with
other test browsers closed. The dry pile and held-pressure fixtures each run
180 measured frames twice after warm-up; repeated trajectories match exactly.
Mean `updateJello` milliseconds per frame are:

| Mode | Pile | Held pressure |
| --- | ---: | ---: |
| Prior material | 4.19 | 4.03 |
| New pairs | 4.68 | 5.61 |
| Complete trial | 4.53 | 5.66 |

The complete trial's worst measured p95 is 6.1 ms in that comparison. With
autonomous effort active for 20 seconds, physics averages 4.85 ms for the pile
and 5.49 ms while held, with clear sampled skin and terrain. A separate active
run including update, brains, physics, and CPU canvas work averages 8.90 and
9.61 ms; p95 is 9.9 and 10.3 ms, with no measured frame over 16.7 ms (maximum
13.6 ms). This is a dry CPU fixture, not GPU timing or a full-game FPS promise.
No broad repeated all-edge search was reintroduced.

The sustained held test records 2,461 cumulative per-body guard rejections
under an imposed 80 px press into the confined pile. This counter is not a
frozen-frame count; the guard also rejects thin, positively oriented held
triangles. The five-second release test preserves all node histories at
release, then moves the held material 89.5 px, maintains area from 0.966 to
1.000, and records zero further guard rejections across all eight bodies.
There is no continuing rollback after the forcing input is removed.

The v28.122 integration includes the concurrent snow release `8d96d39`. At
that checkpoint its snow fragments and WebGPU liquid engine were preserved byte for byte; the
combined CPU/GPU and snow regression suites were rerun after that merge.

Numerical health, law tests, and inspected captures establish a reviewable
model. The owner authorized its promotion into ordinary play without requiring
a playground visit. Its movement, handling, eyes, and sound remain subject to
the owner's judgment during normal play; the reference remains available.


### v28.123 snow performance and ordinary rollout

The complete resident model is enabled in normal play, including saved residents
and bathhouse conversions. Snow previously retained a 1.5 px guest-contact
response threshold despite a roughly 1.4 px grain diameter. The threshold is
now one tenth of the grain radius. Shallow overlap is legal only at an exposed
union face; a face hidden inside another resident still requires projection.
Rare whole-union escapes evaluate candidates cooperatively on the GPU and retain
the original ordered selection. Terrain work and nearby resident work use separate
passes. A conservative displacement bound skips unreachable neighbor cells while
preserving the original grid membership and contact order.

Snow uses four contact relaxation passes and a final contact, density, and air
shield pass per existing grain timestep. A four-pass total failed the returning
powder settling check and was rejected. Five passes retain quiet settling, clear
terrain, mass conservation, and jet lofting. Ordered mutation replay now remaps
GPU readbacks through additions, swap removals, nudges, and material changes.
New particles retain their authored rows; invalid logs and full uploads reject
the snapshot. Continuous snowfall no longer prevents the mirror from updating.

Verification on Apple M1 Pro with Chrome for Testing 148 used normal generated
worlds at 1440 by 900, DPR 2, the extreme game preset, native animation callbacks,
normal vsync, and no CPU profiler or GPU timestamp sampling. Each final scene
ran for 60 measured seconds plus ten seconds of recovery, with the complete
startup timeline retained. A matched original-engine capture averaged 14.3 callbacks per second.
The five starting residents with the fix averaged 59.3 callbacks
per second and ended with about 9,600 active snow grains. Eight residents with
actual grab, walking, and jet inputs averaged 62.3 and finished near 60. The
lowest complete one-second bins were 49.2 and 52.6 respectively. These are
callback rates on this test host, not a claim of 120 Hz display presentation.

The focused GPU suite passes 25 cases and 107 checks for union contacts, terrain,
rigs, moving snapshots, protected tails, and ordinary water. Three grain-search
fixtures match original outputs bit for bit over 32 iterations, excluding the
private grid-membership metadata lane. Readback mutation tests pass 1,005 cases
and 309,450 assertions. Contact and jet regressions conserve every emitted grain,
retain zero physical CPU transfers, and pass settling and lofting gates.
See `tools/perf/SLIME_SNOW.md` for the continuous capture commands.

### v28.126 ordinary water collision cost

An owner recording on AC power retained about 19 to 23 FPS in the worst town
stretch and recovered to about 120 FPS after flying far left. Ordinary water
collision averaged 20.85 ms per sampled encoder in the worst five-second town
window, versus 0.066 ms far left. Water and snow remained present away from town;
all five residents became frozen. Sampled snow contact cost per pass stayed
similar. These encoder timings omit composition and queue waiting.

Ordinary water now queues only particles whose nearest resident-union exit
fails, then finishes those particles in a compact GPU pass. This keeps the
expensive escape search out of the common terrain kernel. Candidates that
cannot beat the current valid winner skip containment and clearance checks,
using the complete original comparator and visitation order. The water
deadband, response, pressure, terrain rollback, bounds, bowl collision, and
velocity limits retain their original calculations. Snow shader bytes and
protected circular slimes are unchanged. Both water and snow finish their
queued work before reusing the same buffers.

`node tools/test-water-collision-gpu.mjs` passes 45 GPU cases and 267 checks,
including exact float words, flags, pressure, repeated calls, moving and
concave boundaries, blocked exits, tail protection, and water to snow to water
in one encoder. `BENCH=1` measures the production kernels without shader test
instrumentation, reseeding identical particle inputs for each dispatch. On
Apple M1 Pro, median collision time falls from 7.15 to 3.76 ms for the dense
floor case and 7.14 to 3.75 ms for the bowl case. Scattered-contact cases improve
by 1.6 to 2.2 times; the empty-guest case adds about 0.013 ms. These are fixed
GPU workloads, not ordinary-game FPS measurements.

A separate 60-second ordinary boot used the five natural starting residents,
snow, stock smoke, native animation callbacks, and the owner's recorded
keyboard and pointer controls. No residents were respawned or repositioned.
It averaged 59.6 callbacks per second; the lowest full-second bin was 46.0,
with no browser or shader errors. The controls do not reproduce identical
physics trajectories, and this test browser does not establish the owner's
120 Hz presentation rate. Owner play remains the final performance check.

### v28.128 dense snow and resident contact cost

The next owner recording disproved water as the whole explanation. Its worst
nine-second town stretch averaged 11.4 FPS and 76.4 ms of sampled liquid GPU
passes. Snow contacts accounted for 37.8 ms, shielding 14.3 ms, and snow escape
plus displacement tracking 12.1 ms. Ordinary water collision and escape were
only 0.55 ms. Each worst frame ran ten snow steps with all five contact
iterations, retaining 241 sampled passes. These sums omit composition and
queue waiting.

An ordinary 90-second boot with every non-snow liquid removed still averaged
15.4 FPS, with a full-second low of 10.0. The trace's particle types contained
only snow. Five residents spawned naturally; none were repositioned or forced
into a fixture. Dense snow and resident contact are sufficient to reproduce
the slowdown.

Snow now builds a snow-only neighbor index after prediction. Water rebuilds
the complete shared index before its next step. Frozen snow remains available
as a neighbor. Contacts and shielding dispatch through the spatially ordered
index while retaining original particle IDs, traversal order, contact math,
motion bounds, and all five iterations. Quiet grains skip atomic maximum writes
of zero to an already nonnegative motion bound. Snow union escapes use compact
32-lane workgroups, retaining candidate order, the complete comparator, legal
overlap checks, clearance tests, response, and final state writes. Candidates
that cannot beat the current valid winner skip expensive geometry checks.
The ordinary water shader and protected circular slimes are unchanged.

`BENCH=1 node tools/test-snow-neighbors-gpu.mjs` passes 22 dense/sparse cases
with exact position, velocity, auxiliary state, flags, and cell motion words,
plus eight shared-grid reuse stages. Both versions use canonical within-cell
ordering to isolate filtering from the existing unordered atomic scatter.
On Apple M1 Pro, sparse median contacts, shielding, and motion tracking change
as follows for fixed particle inputs:

| Input | v28.126 | v28.128 |
| --- | ---: | ---: |
| 13,600 snow and 11,400 water | 5.139 ms | 0.378 ms |
| The same snow with water removed | 0.721 ms | 0.378 ms |
| The same water-free snow compressed to 40 percent of its width and height | 2.460 ms | 1.649 ms |

These are isolated kernels, not whole-frame or FPS gains.
`COMPACT=1 node tools/test-snow-collision-gpu.mjs` passes 25 GPU cases and 107
checks against pinned v28.126, including exact state words and original legal
overlap behavior. The contact and returning-powder regression also passes.

A separate 184-second ordinary background capture retained stock smoke,
water, snowfall, the five natural residents, native callbacks, and the owner's
recorded keyboard timings. It averaged 57.2 FPS with a full-second low of 20.0;
the final twenty seconds averaged 59.6 FPS. It retained 14,893 active snow grains
at peak, no pauses, and no browser or shader errors. This run predates integration
of the concurrent v28.127 startup changes and uses the same final snow kernels.
The inputs do not reproduce the owner's physical trajectory, and a headless
60 Hz run does not prove restored 120 FPS. Short dips remain an observed limit.

After integrating v28.127 startup, a 90-second water-free background boot with
the final kernels averaged 49.2 FPS, with a full-second low of 17.0. Its retained
particle types were exclusively snow and it had no pauses or browser/shader
errors. This and the earlier baseline are ordinary boots with different
trajectories; the fixed-kernel comparisons above isolate the implementation
gain.

The settling harness now pins ambient wind for its quiet-pile fixture and
removes the whole fixture floor for unsupported-pile checks. Its numeric
assertions are unchanged. Reports for both pinned v28.126 and the candidate
retain all mass, launch no flakes, have no upward-moving grains, and keep the
surface within the existing motion limits at depths 3, 7, 12, 20, and 32.
Unsupported piles at depths 7 and 12 fall without a sleep latch. The strict
total-velocity RMS threshold still fails at depths 20 and 32 in both versions:
1.48 and 1.83 in the baseline, 1.31 and 1.82 in the candidate. This inherited
deep-pile motion limit remains unresolved; the report-only runs do not count
as passes of those assertions. The residual sinusoidal grain drift is still
active in this fixture.
