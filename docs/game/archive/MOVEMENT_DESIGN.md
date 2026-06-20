# Sluice — Movement Design Notes

> **For the next agent:** this is a living design doc for the player-movement work on the Sluice mini-game. Read it end-to-end before changing player physics. Update it when you ship a stage.

---

## Project context

- **File:** `js/sluice.js` (single ~12k-line IIFE-wrapped vanilla JS file)
- **Game:** browser-native 2D mining game — drill rig with fuel, hull, ore loop, with both Earth and a moon to reach
- **Movement spec:** 2D vehicle with tank treads + upward-only jetpack. Mining is the core loop. Tight 1-block-wide cave tunnels are common. Lots of hovering with the jets.
- **Tech:** vanilla JS, HTML5 canvas, no build step, no framework
- **Run:** serve project root with any static server (`python -m http.server 8765`), open `sluice.html`

## Design north star

> "the dig-deep-and-upgrade loop, SteamWorld Dig 2's responsiveness, Cave Story's jet feel, Terraria's hover precision."

| Reference game | What it contributes |
|---|---|
| SteamWorld Dig 2 | Drill-traversal interplay, snappy ground accel |
| Cave Story (Booster v2.0) | Variable jet — tap burst, hold climb, clean release |
| Terraria UFO mount | Hover-settle, velocity-target precision in tight spaces |
| Solar Jetman | Cargo affects flight feel |
| Spelunky 2 jetpack item | Tap-burst micro-lift in mining context |
| Owlboy | Sustained flight as primary mobility |
| Hollow Knight | Apex easing, hit-pause |
| Jetpack Joyride | Clean release semantics |

## Key file locations (line numbers approximate)

- `init()` ~line 830 — player object construction (incl. all new movement state)
- `update(dt)` ~line 2700 — main per-frame movement
- Movement constants block ~line 2895 (start of "Movement + physics" section)
- Jet thrust block ~line 2980
- Y-collision + landing fx ~line 3060
- Drill triggers ~line 3120
- `updateCamera()` ~line 3170
- `drawPlayer()` ~line 10300 (squash + stretch live here)
- `solidAt()` ~line 2540 — AABB collision query
- `updateRover()` ~line 2545 — rover-balloon physics (separate from player update; uses its own gravity multiplier)

## Current physics constants (Stage 1 shipped)

All declared as `var`s at the top of the "Movement + physics" block in `update()`.

### Horizontal motion
| Constant | Value | Range that feels OK | Notes |
|---|---|---|---|
| `TOP_SPEED` | 200 | 180-220 | px/s ground-drive cap |
| `ROCKET_SIDE_SPEED_LIMIT` | 720 | 560-800 | high safety terminal for sideways rocket inertia; not the normal drive cap |
| `ACC_GROUND` | 2000 | 1800-2400 | sharp accel with a touch more rig weight |
| `TURN_BOOST` | 1.9 | 1.6-2.4 | legacy reserve; airborne input no longer translates the rig |
| `TURN_BRAKE_GROUND` | 1650 | 1200-2200 | extra braking while reversing on ground; creates the subtle tread-shift through zero |
| `FRIC_GROUND` | 1150 | 900-1500 | slight ground coast on release instead of instant stop |
| `FRIC_GROUND_SKID` | 220 | 140-360 | low friction while landing with rocket overspeed |
| `INSTANT_KICK` | 28 | 20-40 | px/s nudge on direction tap edge |

### Jet (tuned post-Stage 1)
| Constant | Value | Range | Notes |
|---|---|---|---|
| `THRUST_FORCE_MAX` | 1400 | 1200-1800 | peak upward force px/s² |
| `THRUST_TERMINAL` | -220 | -180 to -280 | max climb velocity |
| `THRUST_TILT_INPUT_MAX` | 0.54 | 0.42-0.62 | desired body bank while steering in flight |
| `THRUST_SIDE_AUTHORITY` | 0.88 | 0.65-1.05 | effective side thrust after rig mass/inertia |
| `SIDE_THRUST_COOK_RISE` | 2.6 | 1.8-3.4 | 1/sec horizontal thrust authority build-up |
| `SIDE_THRUST_COOK_FALL` | 3.4 | 2.4-4.4 | 1/sec side burn vent/reset |
| `ROCKET_SIDE_DRAG_LINEAR` | 0.20 | 0.10-0.35 | linear aerodynamic damping applied every airborne frame |
| `ROCKET_SIDE_DRAG_QUAD` | 0.00070 | 0.00045-0.0010 | v² drag; creates the soft sideways terminal over time |
| `FLIGHT_TILT_MAX` | 0.56 | 0.44-0.64 | chassis bank cap in radians, roughly 32 degrees |
| `FLIGHT_TILT_SPRING` | 125 | 90-150 | angular spring toward the desired bank |
| `FLIGHT_TILT_DAMP` | 15.5 | 12-20 | damping for the inertial bank settle |
| `THRUST_SPOOL_RISE` | 48 | 36-60 | 1/sec, full in ~20ms after the tap floor |
| `THRUST_SPOOL_FALL` | 145 | 110-170 | 1/sec, gone in ~7ms (clean cutoff) |
| `THRUST_SPOOL_TAP_FLOOR` | 0.68 | 0.55-0.8 | spool snaps to this on press edge |
| `TAP_IMPULSE_DELTA` | 150 | 120-200 | px/s vy kick on tap |
| `TAP_IMPULSE_FLOOR` | -160 | -130 to -200 | tap clamps vy no faster than this |
| `TAP_FUEL_COST` | 0.05 | 0.03-0.08 | per-tap fuel charge |
| `HOVER_ASSIST` | 220 | 180-280 | extra anti-grav near vy=0 |
| `HOVER_BAND` | 80 | 60-100 | `|vy|` range where hover-assist applies |
| `GRAVITY_PLAYER` | 760 | 700-820 | px/s² down |
| `GRAVITY_RELIEF` | 0.30 | 0.20-0.45 | gravity scaled while jet spool active |
| `MAX_FALL` | 740 | 680-800 | terminal fall speed |
| `COYOTE_T` | 0.10 | 0.08-0.15 | seconds of grace after leaving ground |
| `JET_BUFFER_T` | 0.10 | reserved | NOT consumed by jet currently (clean release) |

### Player state added by Stage 1
On `player`: `thrustSpool`, `sideThrustCook`, derived `thrustVecX/Y`, `flightTilt/flightTiltVel`, `coyoteT`, `jetBufferT`, `edgeMoveL/R/U/D`, `lastMoveL/R/U/D`, `airTime`, `peakFallVy`, `onCeiling`. Initialized in `init()`.

---

## Stages

### Stage 1 — Variable jet ✅ SHIPPED
Commits: `c2d4c87` (initial), `61f1130` (tuning)

What: Tap = micro-lift, hold = sustained climb, release = clean cutoff. Also fixed a critical sign bug in the headroom formula that had been zeroing thrust force at vy=0.

Status: User accepted current tuning.

### Stage 2 — Hover-settle + apex easing ✅ SHIPPED
Reference: Terraria UFO mount (settle) + Hollow Knight (apex).

What:
- **Hover settle:** when jet is NOT held AND not on ground AND `|vy| < 60`, vy is damped exponentially toward zero (`vy *= exp(-HOVER_SETTLE_DAMP * dt)`). Held jet uses the existing `HOVER_ASSIST` path — settle only fires post-release.
- **Apex easing:** while airborne and `|vy| < 80`, gravity is multiplied by a smoothstep that hits 0.5x at vy=0 and 1.0x at the band edge. Short and strong, not long and weak.

Constants added (movement block):
```js
var HOVER_SETTLE_BAND = 60;
var HOVER_SETTLE_DAMP = 8;        // 1/sec damping rate
var APEX_EASING_BAND = 80;
var APEX_EASING_FACTOR = 0.5;     // gravity multiplier at vy=0 inside band
```

Status: shipped, awaiting playtest feedback for tuning.

### Stage 3 — Corner correction (ceiling + sides) ✅ SHIPPED
Reference: Celeste (±1–4px nudges, source-doc'd), SMB head-bonk slip (~25% of tile), generic best practice = ceiling + sides only, skip floor (conflicts with landing/step-up).

What:
- **Side-wall slip:** when X motion is blocked airborne, try small vertical nudges (1–8px ≈ 25% of TILE=32) up first then down to slip past corners. Mirrors the existing ceiling slip exactly. `vx` is preserved through the slip (research: position correction only).
- **Ground side motion:** unchanged — running into a wall stops you predictably.
- **Floor:** intentionally skipped per research (would conflict with landing-on-edge + step-up).
- **Ceiling:** already had this since pre-Stage-1 (Change 8); kept identical.

So "four-sided" turned out to be three-sided after research. That matches Celeste/Mario practice.

Status: shipped, awaiting playtest feedback.

### Stage 4 — Drill flow ✅ SHIPPED (v4.1, overhauled to position-glide v5.4)
References (research-backed): SteamWorld Dig 2 drill cadence, Hollow Knight / God of War hit-pause (2-3 frames), Drill Dozer momentum carry-through, Terraria 250ms tier, Game Feel (Swink) <100ms input response.

What:
- **Hit-pause on tile-break:** new global `hitPauseT`. Set to 33ms (~2 frames at 60fps) the moment a tile breaks. While > 0, `update()` early-returns; smoke + render keep running. Single biggest "weight" perception trick. Reusable for Stage 5 hard landings.
- **Punch-through velocity pop:** on tile break, vy or vx is kicked ±95 px/s in the drill direction. The rig visibly snaps into the cleared space instead of just standing there. Drill Dozer model.
- **Anticipation squash during drill:** progressive squash 0 → 0.12 across `DRILL_TIME`. Doesn't gate damage (research warning: anticipation runs *during* the active phase, never before it).
- **Squash spike on break:** boost squash to 0.32 the moment tile breaks.
- **Lateral row-snap:** drilling left/right snaps `player.y` to the row of the target tile if within ~13px, mirroring the existing column-snap on downward drilling. The renderY lerp smooths the snap visually.
- **Up-drill column-snap:** mirrors downward — sets `slideTargetX` to ease the rig under the target tile.
- **DRILL_TIME tune:** 0.25 → 0.22 (220ms — Terraria's 250ms range, slightly faster).

Constants added:
```js
var hitPauseT = 0;             // global hit-pause timer
// (drill break uses POP_SPEED = 95 inline)
```

Status: shipped, awaiting playtest feedback. Stage 5 (hard-landing hit-pause) can now reuse the `hitPauseT` system.

### Stage 5 — Hit-pause on hard impacts ✅ SHIPPED (v5.1)
What:
- **Damage-causing landings:** `hitPauseT = clamp(0.04 + fallDmg/600, _, 0.07)` — scales 40-70ms with damage magnitude, capped so chained big falls don't compound into input lag.
- **Sub-damage thumps (impactVy > 260):** 22-35ms hit-pause via `landK`. Below 260 px/s impact, no pause — soft drops stay snappy.
- Reuses the global `hitPauseT` early-return added in Stage 4.

Status: shipped, awaiting playtest feedback.

### Stage 6 — Vector thrust + whole-rig bank ✅ SHIPPED
What:
- **Body-mounted vector thrust:** holding left/right while airborne changes the rig's attitude whether the booster is on or off; thrust force, plume, smoke, and nozzles all derive from the actual `flightTilt`, so thrusters never aim independently from the chassis.
- **No hidden air strafe:** left/right input in air only rotates the rig. Horizontal movement comes from carried ground inertia, booster force along `flightTilt`, collision response, and drag.
- **Rocket overspeed:** sideways thrust can accelerate well beyond the tread-drive `TOP_SPEED`, but it builds over time through side acceleration, `sideThrustCook`, and continuous drag instead of snapping to a cap. `ROCKET_SIDE_SPEED_LIMIT` is only a high safety rail. Landing overspeed uses `FRIC_GROUND_SKID` so fast touchdowns slide.
- **Landing reset:** the rig snaps back to horizontal immediately on ground contact by zeroing `flightTilt` and `flightTiltVel`.

Status: shipped as the first full inertial-flight pass.

### Stage 7 — Camera redesign
Initial pass was reverted. Re-implement carefully:
- Lookahead: leads player ~50px in direction of motion, with a deadzone in the center
- Screen shake: short decay, scales with impact, applied as transform offset only (NOT to `cam.x/cam.y` — preserves culling, smoke domain anchoring, and HUD prompt placement)

### Stage 8 — Cargo-affects-flight (Solar Jetman)
Subtle mass scaling: `THRUST_FORCE_MAX` scaled down by ~3% per cargo item; up to ~30% sluggishness at full cargo. Free difficulty curve, free progression feel.

### Stage 9 — Audio pass
- Engine rev (loop, pitch tied to `|vx|`)
- Drill grind (loop while drilling, pitch tied to drill power level)
- Jet hiss (loop while jet active, volume tied to `thrustSpool`)
- Landing thud (one-shot, volume tied to impact vy)
- Ore-pop "kachunk" (one-shot per tile broken)

---

## Additional world-class mechanics to consider (later)

Surfaced during research; not yet staged. Pick from these if Stages 1-9 don't fully sell the feel:

- **Sub-pixel collision (Super Meat Boy)** — eliminates "stuck on tile edge" in 1-block tunnels. Significant refactor of `solidAt()` and the X/Y collision sweep.
- **Wall slide (Mega Man X / Hollow Knight)** — controlled descent down narrow shafts by holding into the wall.
- **Edge magnetism (Spelunky 2)** — snap into a 1-tile-wide shaft when falling close to it. Big QoL.
- **Camera leash with input-shake (Hades)** — camera resists then follows; tiny shake on each pull.
- **Velocity-target hover mode (Terraria UFO)** — separate "park" state distinct from the main force-based jet.

---

## Tuning conventions

- Ground accel should be 1.5-2x air accel
- Friction should be ≥1.2x acceleration (so stops feel decisive)
- Spool fall should be 2-4x spool rise (clean release > responsive ignition)
- Apex / hover bands should be ≤ `|TERMINAL|/3` (so easing is local to neutral)
- Per-tap fuel cost ≤ 1/2 of held-second drain (tapping should always be more economical than holding)

## Workflow conventions

- **Skip browser/preview verification** — the user does all visual/playtest themselves. Don't run `mcp__Claude_Preview__*` tools.
- **After every accepted change:** commit + ff-merge into `main` + push to GitHub. Do all three by default.
- **Commit messages:** short imperative subject, body explains why + what.
- **Version bump on every shipped commit.** `GAME_VERSION` lives at the top of `js/sluice.js` and renders in the bottom-right of the HUD. Format: `v<stage>.<iter>`. `<stage>` matches the current movement design stage; `<iter>` is a sequential counter within that stage. Bump `<iter>` on every shipped change so playtest screenshots tie to a commit. When a new stage begins, set `<stage>` to that number and reset `<iter>` to 1.

## For the next agent

- Stage 1 is shipped + tuned. User accepted current values.
- Stage 2 is shipped (hover-settle + apex easing). Initial damp tuned 8 → 5.5 (commit a72d861).
- Stage 3 is shipped (ceiling + side-wall corner slip). Awaiting playtest.
- Stage 4 (drill flow) is next.
- User is iterative: implement one stage at a time, wait for explicit feedback before moving on.
- User does all playtesting — never spin up the browser preview to "verify."
- Always commit + push after the user approves a change.

## Open questions / things to watch

- **Fall damage thresholds** (`fallDamageForImpact()` ~line 916) were NOT retuned after gravity went 600→760 + `MAX_FALL` went 640→740. May feel slightly more punishing now. Worth a sanity check the next time a fall-damage moment comes up.
- **Rover update** (`updateRover()` ~line 2545) uses the original `GRAVITY = 600` constant directly with its own `gMul = 2.6`. Player gravity changes do NOT affect rover physics — by design.
- **Smoke domain** (`smokeFluidUpdateDomain()` ~line 9070+) is anchored to `cam.x/cam.y`. Any future camera shake MUST be applied as a render-only transform offset, not to `cam.x/cam.y` directly, or the smoke desyncs. (We tried it once; reverted.)
- **`jetBufferT`** is currently maintained but unused (clean release semantics for variable jet). Reserve it for a future "buffer jet press across drill completion" use case if it ever comes up.
