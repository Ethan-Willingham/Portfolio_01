# BATHHOUSE_PLAN.md: Sluice's second half (dig by day, bathhouse by night)

This is the **living main plan** for the bathhouse: a Spirited-Away-structured hot
spring venue the player builds above the mine and runs at dusk. It is the game's
"Dave the Diver sushi shop": the mine supplies heat, water, salts, fuel, and guests;
the bathhouse returns cash, reputation, and heat technology.

**How to use this doc.** Same contract as `EXPANSION_PLAN.md`: read it at the start
of any bathhouse session, update it at every stage boundary, append (never rewrite)
the Deviation log. Pair with `docs/game/GAME.md`, `TUNING.md` (water), and the
project memory (`project_bathhouse.md`).

**Provenance.** Designed and spec'd by the Fable 5 session of 2026-07-05 with the
owner (weekly Fable budget was nearly exhausted, so this doc front-loads every
architectural decision at line-level precision for Opus/Sonnet execution). The
conversational design treatment lives in that session; this doc is self-sufficient.

Status: **B1 SHIPPED (v25.56/57); B6+B8 SLICE SHIPPED (v25.77)**: the banya
tower stands in the town (dynamically sited clear of the lakes), walk-in or
click-to-enter swaps to the interior scene (off-map pocket room per B-D11,
scene-owned zoom fitting any canvas, HUD/smoke layers hidden inside, hot tub 1
convecting with the B1 tint beside cold tub 2, tap-the-door/ESC exit). Try:
`?bath=1`, then `__bath.warp()` + walk right into the door. Next = owner
feel-check of the slice, then B2 (the steam system) and the HOSE (B6 rest).
v25.77 slice lessons, recorded so nobody re-learns them: surface LAKES vary per
seed so the site must be picked post-worldgen; the world viewport EXCLUDES the
console strip so a scene must clear the FULL canvas itself; the console/toasts
live on a separate z:6 DOM canvas (`uiTopCanvas`, 140) that must be hidden in
scene mode (smoke z:5 too; liquid z:4 stays); the scene must OWN `worldScale`
per frame (fit room to canvas, restore on exit) or the room does not fit the
zoomed viewport, and overriding the global keeps the liquid overlay aligned.
Nothing ships enabled: everything sits behind `ENABLE_BATH` (default false,
`?bath=1` override) in the `js/sluice/010-constants.js` flag block.

**B1 verification record (2026-07-05, headless Chrome + CDP, Apple/Metal):**
baseline boot (no flag) logs all LiquidWGPU stages with 0 errors; `?bath=1` boot
logs `[bath] B1 heat source armed under pond 0`; a CDP-driven rover parked at the
pond shows 15,720 GPU particles staying fully awake (0 sleeping) with a rising
foam column over the heated floor while the rig sits still, at a capped 120 FPS
and 0 Dawn/console errors across ~25k log lines. Feel levers for the owner:
`window.bathTune('BATH_BUOY'|'BATH_EXCHANGE'|'BATH_COOL'|'BATH_SRC_T'|'BATH_SRC_RATE', v)`
and `BATH_ON` 0/1, live, no rebuild.

**v25.57 (2026-07-05): B1 made VISIBLE + the "I don't see it" fix.** Two findings
first: (a) the public site briefly served v25.55 because the Pages build for the
bath commit was mid-flight, resolves itself; (b) the shared local checkout is many
commits behind with WIP, so the bath code was never in the owner's local files
(sync/serve from a fresh checkout, per memory `knowledge_shared_checkout_push`).
The real gap: **B1 shipped physics-only, so hot water looked identical to cold**
(no tint = no steam yet). Fixed by a heat TINT (a B4-preview pulled forward so the
feel-check is possible): the surface FIELD pass carries per-particle temperature in
its free alpha channel, the COMPOSITE lerps water toward a warm tint by mean cell
temperature. Byte-exact no-op with the bath off (heat bits 0 -> field alpha 0).
CDP A/B verified: heated pond shows a warm floor gradient with the tint on, all-blue
with `BATH_TINT_STR 0`, same frame. New dev helper `window.__bath.jump()` teleports
the rig to the heated pond (one call, no blind fly-across). Tint is LIVE-tunable and
a taste call: `window.bathTune('BATH_TINT_STR'|'BATH_TINT_R'|'BATH_TINT_G'|'BATH_TINT_B', v)`;
default 0.55 is deliberately strong so it is unmissable, dial down or 0 to taste.

---

## 0. THE PIVOT (2026-07-09, owner + Fable; supersedes parts of sections 1, 7, 8)

The owner rejected the cutaway-in-the-world interior. The bathhouse is now TWO
halves:

- **Exterior**: a tall, beautiful pixel-art bathhouse standing in the town beside
  the other buildings (BUILDING_STYLE.md language + lanterns; windows light up
  floor by floor as reputation grows). Approach the door at dusk to enter.
- **Interior**: its OWN SCENE. Entering swaps to a fixed-camera, one-screen,
  lantern-lit bath hall; the world half is paused and unrendered. **The rig does
  NOT come inside.** All interior interaction is direct pointer: tap/hold/drag on
  mobile, click/hold/drag on PC. Pacing is Dave the Diver's sushi bar: requests
  arrive and you keep up.

**Architecture (new locked decision B-D11): the "separate scene" is presentation,
not a second coordinate system.** The interior room is BUILT in a reserved off-map
pocket of the existing world grid; entering = camera teleport + render/update mode
swap (world skipped, room drawn). Because the room IS world space, all three sims
(water, smoke/steam, jello guests) run inside it with zero sim changes, and with
the world paused the ENTIRE physics budget belongs to the room. Everything shipped
for B1 (temperature, tint, cooling) is load-bearing in the new design; nothing
built so far is wasted.

What this supersedes: vision bullets "tower in the world, not a scene" and "you
never leave the rig" (rewritten below), the Q&A "Building/interior" cutaway answer,
and section 8's fly-and-bonk fixture list (section 8 is rewritten as the pointer
service loop). The D-table physics decisions stand unchanged.

---

## 1. Vision (locked with the owner)

- **Structure, not skin, RESOLVED (2026-07-09): it is a BANYA.** Spirited Away's
  shape (tower of baths, boiler below, strange guests, a filthy-spirit set piece)
  wearing the game's own culture: the Russian bathhouse. The town already speaks
  Cyrillic (КАССА), so the sign reads «БАНЯ», materials stay timber + copper +
  riveted iron per BUILDING_STYLE.md, lighting is oil lamps, the door hangs a felt
  flap, birch bundles (veniki) hang by the tubs, and a samovar corner arrives as
  an upgrade. The recurring mysterious guest is the **Bannik**, the actual
  bathhouse spirit of Slavic folklore. Zero Japanese pastiche: the anime is the
  soul, the banya is the body.
- **The whole loop.** Dig by day (now also: cap steam vents, tap hot aquifers, chip
  mineral salts, meet slime dens). At dusk a bell starts an opt-in shift of a few
  minutes. Guests queue; tubs are real water; needs are read from the sim. End of
  shift, pull the sump grate and the night's coins, pearls, and sloughed ore pour
  out as one physical payout.
- **A landmark outside, a scene inside** (REWRITTEN by the 2026-07-09 pivot,
  section 0). The tall bathhouse stands in the town as pixel-art architecture; its
  interior is a fixed-camera one-screen scene entered through the door at dusk.
  Technically the room lives in an off-map pocket of the world grid (B-D11), so
  the sims still work inside it with zero new sim plumbing.
- **Inside, your hands are the pointer** (REWRITTEN by the pivot). The rig stays
  parked outside. Interior verbs are tap/click, press-and-hold, and drag: the same
  gestures on mobile and desktop. No menus; every control is a physical fixture.
- **Physics IS the score.** A guest's satisfaction samples actual water temperature
  at their body, actual submersion, actual murk/salt content, actual steam density.
  No faked meters anywhere. This is the game's identity claim; protect it.
- **Economy (REVISED 2026-07-09: no abstract stars).** One currency: cash. Cash
  buys tubs, TUB TIERS, floors, tanks, hose upgrades. What attracts guests is the
  BATH ITSELF: each slime species has requirements (tub tier >= X, liquid Y
  stocked, mineral Z stocked); meet them and that species starts appearing in the
  queue. New shapes + colors = new species = progression the player can SEE (ties
  to the Q&A body-plans track). No star meter anywhere; renown is emergent
  (fancier species tip more). Guests are SLIMES ONLY; miners get a bench outside.
  Bathhouse income complements ore, never replaces it.

## 2. Locked decisions (D-table; append, don't edit)

| # | Decision | Why |
|---|---|---|
| B-D1 | Temperature is stored as **heat above ambient** (0 = ambient, ~1 = scalding), decaying toward 0. | Every added kernel term is an exact `+0.0` when heat is 0, so the bit-faithful boot self-tests (Stages 1-6) stay green with no reference changes. The whole feature must keep this invariant: multiply by T, never add an epsilon. |
| B-D2 | Temperature copies the **aeration channel pattern** exactly: per-particle scalar + per-cell fixed-point accumulator, splat in P2G scatter, mass-normalize in p2gNormalize, gather + advance in G2P. | Aeration (`aux.y`, `cellAeration`) is a proven in-repo template for scalar transport incl. sparse variants and self-test twins. |
| B-D3 | Pipes are **endpoints, not simulated interiors**: intake cell, outlet cell, flow rate, carrying temperature/content. Mixing happens visibly in tubs. | Hydroneer-proven; robust; cheap. |
| B-D4 | Bath v1 is **WebGPU-only**. On the CPU fallback, `ENABLE_BATH` logs once and no-ops (same posture as smoke-water collision, desktop-only v25.47). CPU port is stage B9, decided after the owner feel-gate. | Budget + risk; the feel test needs desktop anyway. |
| B-D5 | Guest slimes are **dissolve-immune via a per-body flag** checked at the v25.55 dissolve trigger. Soaking feel = waterline riding + entry splash impulses + local ripples. **Never resurrect v25.50-52 two-way force coupling** (owner-rejected; see memory `project_slime_water_coupling`). | The dissolve rule would poof customers; the coupling saga is settled. |
| B-D6 | Steam = **CPU mirror drives the existing smoke backend**. Every liquid readback (`LIQUID_READBACK_EVERY` = 20 frames), scan mirror particles for hot-and-near-surface, emit via the smoke splat path that `tickFireplaceSmoke()` uses (`js/sluice/140-render-maindraw.js:930` area, backend in `190-smoke-webgl.js`). **Never drawImage the WebGPU canvas** (blank in update, GPU-stall in render; see memory `knowledge_onscreen_surface_water`). | Reuses the proven fireplace emitter; throttled by design. |
| B-D7 | SimParams grows one vec4, **`bath` at lanes 36-39**: heatExchange, heatCool, heatBuoy, heatOn. Host array 36 -> 40 floats, buffer 144 -> 160 bytes. At defaults (all 0) bytes beyond 144 are never read by old lanes, and all kernels see zero heat: self-test diffs unchanged. | The `feel` vec4 (32-35) is full: cohesion, airDrag, pressureMaxDv, lipFriction. |
| B-D8 | Heat sources are a **small uniform list of world-space rects** (max 8: firebox, vents, aquifer taps), applied in p2gNormalize after mass-normalize: cells inside a rect lerp `cellHeat` toward the rect's strength. Game uploads the list per frame (dev scene registers one under a surface pond). | Avoids touching terrain encoding or the ops replay; sources are few and rectangular. |
| B-D9 | New per-particle buffer `buf.temp` (n x f32). All four `aux` lanes are taken (x density, y aeration, zw pre-step pos). Spawns default 0; the ops-replay spawn path is untouched in v1 (sources warm water in place; a hot spring is a source rect at its mouth). | Smallest correct footprint. |
| B-D10 | Flag: `ENABLE_BATH = false` + `?bath=1`, in the 010-constants.js flag block, documented in GAME.md's ACTIVE/DISABLED table when it first ships. | House style. |
| B-D11 | (2026-07-09 pivot) The interior is a **separate SCENE built in a reserved off-map pocket of the world grid**: entering = camera teleport + mode swap (world paused + unrendered, room drawn with its own lighting). The rig stays outside; interior input is **pointer only** (tap/hold/drag = click/hold/drag). Exit restores the world at the door at morning. | Feels like Dave the Diver's restaurant; costs like a camera jump. The sims are world-space, so tubs/steam/guests work in the pocket with zero sim changes, and the paused world frees the whole physics budget for the room. |

## 3. Stage board (each stage = one focused session; owner feel-gates marked)

**B1. Temperature core in the GPU sim** (the hard one; spec in section 4).
Goal: hot water rises, convects, cools; `?bath=1&dev=1` scene heats the leftmost
surface pond via one registered source rect; gm levers live. Verify: parse + boot
self-tests all OK at defaults, then with `?bath=1` a visible convection roll in the
heated pond and no Dawn validation errors (check via Log domain / uncapturederror,
NOT consoleAPI; memory `knowledge_webgpu_dawn_pass_usage`).

**B2. THE STEAM SYSTEM (expanded 2026-07-09: steam must NOT look like smoke).**
The owner's call: players know our smoke; steam needs its own identity. Same fluid
solver, its own parameter set + palette, run scene-local (in the banya the smoke
backend runs in STEAM MODE; the world is paused so there is no conflict; the world
keeps smoke mode). Look targets: soft white rounded puffs, higher buoyancy (lazy
but insistent rise), much higher dissipation (short-lived), LOW curl (billow, not
swirl), slight warm tint under the lamps, pools into a visible layer under the
rafters, drains out the flue, thick steam legitimately obscures the room (venting
is management). No soot darkening ever; firebox smoke goes up the chimney and is
not simulated in-room. Emission via the flag-bit mirror scan (B-D6): rate scales
with temperature AND agitation, so pouring hot water throws a big plume off the
splash. gm lever group STEAM_* (buoy/diss/curl/alpha/tint). Worldgen half stays:
2-3 steam vents + 1 hot aquifer pocket in the 400 m arc. OWNER FEEL-GATE: "does
hot water + steam feel magical, and does steam read as NOT-smoke at a glance?"

**B3. Murk + salt content.** Second scalar channel, same machinery as temperature
(consider packing temp+murk as two halves of one buffer or two buffers; measure).
Salt blocks are droppable items that dissolve into tint + property. Render tint via
the surface field (`WGSL_SURFACE_FIELD`, line ~5458).

**B4. Hot-water render polish.** Warm tint by temperature + shimmer in `WGSL_RENDER`
(~5316) / surface composite. Small, taste-driven, gm-levered.

**B5. Guest slimes soak.** Requires `ENABLE_JELLO` interplay: dissolve-immunity flag
(B-D5), waterline riding, entry splash. Read memory `project_jello_bulletproofing`
lessons first (duplicate-var landmine, fpx anchoring, relocations are transports,
ship from a worktree). OWNER FEEL-GATE with A/B levers.

**B6. The room + THE HOSE** (restaged by the pivot; hose replaces per-tub taps,
owner design 2026-07-09). The off-map pocket room (B-D11): scene enter/exit (door
prompt at dusk, camera teleport, world pause, morning return), the fixed-camera
room render (banya timber, oil lamps, «БАНЯ» sign, its own light), tubs as solid
basins holding real water, plug-chain drain to the sump, flue vent, and the
pointer layer (tap/hold/drag, one code path for touch + mouse).
**The hose is the room's one instrument:** a copper articulated arm on a short
ceiling rail (Soviet swing-arm look; friction joints justify staying EXACTLY
where released). DRAG the nozzle anywhere; release and it holds position. TAP the
nozzle = flow on/off (a toggle, not a hold, so you can walk away from a running
pour or steer it live). A DIAL on the nozzle selects the liquid (v1: hot / cold;
later: whatever the tanks hold). While flowing it spawns real particles from the
nozzle mouth and DRAINS THE MATCHING TANK: spills are real, deliberate splashing
is allowed fun, waste is the cost. Arm follow uses a lightly damped 2-joint IK so
dragging has springy overshoot juice. Wall tanks (hot fed by boiler + coal; cold
by pond pipe) show reserves diegetically. Minerals stay JARS (drag over a tub to
tip and pour a dose into the B3 tint channel): hose = liquids, jars = minerals.

**B7. The service loop** (restaged; attractor model 2026-07-09, stars removed).
Dave-pacing: guests arrive on a clock, queue with visible patience (cap ~5
inside), wobble to a tub, show a pictographic request (fill level + temperature
band + mineral), soak, pay coins into the water, leave. Satisfaction is sim-read
at the body (B-D4). Tank reserves (hot = boiler + mined coal) and mineral doses
are CONSUMABLES stocked by mining: the day-feeds-night link. **Progression is the
attractor model:** each slime species (shape + color, per the body-plans track)
has requirements over tub tier + stocked liquids + stocked minerals; upgrading
the bath makes new species start appearing in the queue, and their requests use
what attracted them. Ramp: temp-only nights first; minerals join requests only
once MINED (depth bands are the menu); combos, scrubbing grimy guests, steam-room
requests, long-soak exact-band whales, and the Bannik's arc arrive as the bath's
tier + pantry grow. Soft-fail only (an impatient guest leaves; the queue thins
for a while). Night ~3-5 min, 6 -> ~20 guests as tubs grow 2 -> 5.

**B8. The exterior + transition.** The tall pixel-art BANYA in the town per
`BUILDING_STYLE.md` (the tile cross-section survives as the FACADE: stone base,
timber body, iron top, «БАНЯ» sign, oil lamps; windows light floor by floor as
floors are BUILT), the door-enter prompt, and the enter/exit swap polish. Art
lean within the banya register (how weathered, how warm) via a chooser lab page.

**B9. CPU fallback port + mobile.** Port the temperature channel into the v15
sparse CPU sim inside `js/sluice.js` fragments; mobile presets cap guests like they
cap water. Only after B2 and B5 gates pass.

**B10. LIQUID LOGISTICS (owner-parked 2026-07-09: design locked, build LATER).**
Underground gains typed LIQUID POCKETS beyond water/oil (hot spring water, mineral
brines, mud, stranger fluids deep). The rig gets a liquid TANK system separate
from ore cargo (revive the disabled `ENABLE_OIL` pump as the intake): suck a
pocket up, haul it home, DEPOSIT at the banya's tank station. Stocked exotic
liquids join the hose dial and the attractor requirements (exotic liquid + exotic
mineral + high tub tier = the rarest species). Do NOT build any of this until the
core night loop (B6 + B7) is fun; v1 ships with hot/cold only.

Parallelization: B3/B4 are same-file (liquid-wgpu.js) as B1 residue, serialize
them. B6/B7/B8 live in distinct sluice fragments and can run as parallel sessions
per the EXPANSION_PLAN map. Never two agents in one fragment; never edit js/sluice.js.

## 4. B1 spec: temperature in js/liquid-wgpu.js (line refs at v25.55 / 371d879)

New GPU state:
- `buf.temp` (n x 4 bytes, f32/particle): add beside `flag` in the buffer block at
  ~line 527. Storage usage flags identical to `pos`.
- `buf.cellHeat` (GRID_MAX_CELLS x 4, atomic i32 fixed-point): add beside
  `cellAeration` (~559). Clear it wherever cellAeration clears (dense clear at
  ~693 `enc.clearBuffer(...)` block + the sparse clear kernels
  `WGSL_P2G_CLEAR`/`WGSL_CLEAR_P2G_SPARSE_BODY` ~3579/3748).
- `heatSrcBuf` uniform: 8 rects x (x0,y0,x1,y1,strength,rate,pad,pad) f32 +
  count; written per frame by the game like `gameParamsBuf` (~632).

Kernel edits (the aeration lines are the pattern to copy; keep B-D1's
multiply-by-T zero-invariant in every term):
- `WGSL_P2G_SCATTER` (~3608): bind `temp` (read) + `cellHeat` (read_write atomic).
  In `splat()` (~3612) add `atomicAdd(&cellHeat[cell], encodeFx(t * w))` alongside
  the aeration splat (`aer` is read at ~3659 from `aux[i].y`; temp reads
  `temp[i]`).
- `WGSL_P2G_NORMALIZE_BODY` (~3732): after aeration mass-normalize, normalize
  cellHeat by the same cell mass; then apply heat sources: for cells whose world
  centre lies in a source rect, `heat = mix(heat, strength, rate)`. Mirror in the
  sparse normalize variant (the `normalizeSparse` pipe, ~5962).
- `WGSL_G2P_GATHER` (~4674): bind `temp` read_write + `cellHeat` read. Gather cell
  heat with the existing quadratic weights; then
  `t = mix(t, cellT, sp.bath.x); t *= (1.0 - sp.bath.y * dt);`
  buoyancy adds to the velocity where gravity applies:
  `v.y -= sp.bath.z * t * dt;` (upward; gravity is +y down here, match the sign
  of the existing gravity add at the density/gravity block ~4841). Gate the whole
  block on `sp.bath.w > 0.5` for zero cost when off. Write `temp[i] = t`.
- `WGSL_SIM_PARAMS` (~3931): append `bath : vec4<f32>,` (one shared struct string;
  every pipeline picks it up).
- `writeSimParams` (~1088): grow `simParamsHost` allocation (search its `new
  Float32Array(36)` / buffer size 144 at ~646) to 40 floats / 160 bytes; write
  lanes 36-39 from new tunables `LIQUID_HEAT_EXCHANGE` (start 0.15),
  `LIQUID_HEAT_COOL` (start 0.08/s), `LIQUID_HEAT_BUOY` (start ~220 px/s^2 at
  t=1), `bathOn` (0/1 from the game via a setter, mirrors how LIQUID_CALM et al
  arrive). Put the literals in the tunables block ~163 with the oil constants.
- Bind group layouts: `p2gBGL` (~5942) + the G2P layout (search `g2pBGL` /
  `liquid.g2pBGL` near the G2P pipeline creation) gain the new bindings; keep
  binding indices stable for existing buffers, append new ones at the end. The
  wake-terrain comment (~3986) notes the layout already carries 9+ storage
  buffers; stay under the 10-storage-buffer per-stage device limit or split the
  heat source list into the existing uniform instead of a new storage slot
  (uniform is the plan, B-D8, so only 2 new STORAGE bindings total: temp,
  cellHeat).
- Readback mirror (~7036-7107): add `rb.temp` (count x 4) to the persistent
  MAP_READ set and the mapAsync batch; expose as `mirror.temp` beside pos so the
  game can scan for steam (B2) and scoring (B7).
- Self-test note: do NOT extend the Stage 3/5/6 CPU references; with all-zero
  heat the GPU adds exact zeros and diffs are unchanged (B-D1). Add one new boot
  log line `LiquidWGPU Bath: temp channel on` when `bathOn=1` so headless checks
  can assert it.

Game-side (new fragment `js/sluice/072-bath.js`, keep it self-contained):
- Flag block entry (010) + `ENABLE_BATH`/`?bath=1`.
- `bathRegisterHeatSource(x0,y0,x1,y1,strength,rate)` -> uploads the uniform list.
- Dev scene: when `ENABLE_BATH && devMode`, register one source under the leftmost
  surface pond (find pond extents from worldgen's pond records in
  `030-worldgen.js` ~560) at strength 1.0, rate 0.02.
- gm levers: `gm.bath.exchange/cool/buoy/on` following `360-gm-facade.js` style.
- Build step: bump GAME_VERSION (000-head.js), `./build-sluice.sh`, commit
  fragments + bundle + grand-motherload.html together, push from a worktree off
  origin/main (`git push origin HEAD:main`; memory `knowledge_shared_checkout_push`).

Verify recipe (headless, from GAME.md, works in this repo):
serve the checkout, then headless Chrome CDP with
`--headless=new --enable-unsafe-webgpu --use-angle=metal` against
`grand-motherload.html?dev=1&nosave=1` and again with `&bath=1`; assert 0 errors,
all `LiquidWGPU Stage N ... OK` lines unchanged, and the Bath boot line present;
watch uncapturederror via the Log domain, not consoleAPI.

## 5. Risks and their answers

- **Slime-in-water feel** (B5) is the highest taste risk; it is deliberately late,
  behind two working feel-gates, and fully levered.
- **Perf**: a busy hall = water + steam + slimes on one screen, the engine's
  existing worst case; the v25.31-47 pass bought the headroom, and the bench
  recipe lives in memory `project_sluice_perf_pass`. Bench B1 with the source rect
  active vs `main` before pushing.
- **Self-test drift**: any future bath term MUST keep the B-D1 zero-invariant or
  Stage 5/6 diffs light up. If a term cannot be zero-formed, extend the CPU
  references in the same commit.
- **Scope creep**: the shift (B7) is the retention heart but it is UI + rules, not
  sim; do not let it start before B2's magic gate passes.

## 6. Owner calls still open

Art direction lean (chooser lab), shift pressure (cozy vs scored timer), whether
boiler tech gates deep-ore heat (recommended yes), the name (floated: The Sluice
Springs, The Boilhouse), and slime staff scope (recommended: 2-3 hires, friendship
gated).

## 7. Design Q&A (owner session 2026-07-05; recommended answers, confirm at feel-checks)

- **Slime dissolve (v25.55 poof)**: keep the code, demote to a per-body `soluble`
  flag at the dissolve trigger. Guests are insoluble (B-D5). Twist worth building:
  soluble "mineral slimes" ARE bath additives (toss in a tub, it poofs in its own
  silhouette and tints the water = the salt-block mechanic with a face).
- **Slime shapes**: physics is a point+spring lattice; cubes are just the default
  constructor. Track 1 (cheap, first): keep cube physics, render a smooth rounded
  blob skin with squash-stretch + a simple face. Track 2: new lattice constructors
  (disc blob, worm chain, sheet, big amoeba) in the same solver. CAUTION: the
  contact sweep + the 82-check suites were built against cubes; every new body
  plan needs a contact audit + suite pass.
- **Building/interior** (SUPERSEDED 2026-07-09 by the section-0 pivot; kept for
  history): the original answer was a no-loading cutaway in the world with the rig
  flying in. The pivot keeps the world-grid trick (the room is an off-map pocket,
  B-D11) but presents the interior as its OWN fixed-camera scene, rig outside,
  pointer-driven. The BUILDING_STYLE.md material language and lantern look stand.
- **Slime autonomy**: guests get a tiny state machine (queue -> tub -> soak ->
  pay -> leave) whose only output is compress-and-hop IMPULSES toward waypoints
  (Slime Rancher locomotion). The body stays a full soft body; pathing is a
  per-floor waypoint list, no real pathfinding. Wild slimes later get the same
  brain with wander/flee personality.
- **Water verbs**: sources = cold ponds, HOT aquifer pockets, steam vents (heat
  only), the boiler (cold + fuel -> hot). Moving: act 1 = rig water tank (reuse
  the disabled ENABLE_OIL pump intake), act 2 = pipes as endpoint pairs (B-D3),
  always = dug channels (v25.45 ledge pouring already does this: digging is
  plumbing). In-bath: fill, blend against a thermometer reading the REAL grid
  temperature (B1), salt (B3 tint/props), hose-scrub, squeegee-to-drain, pull the
  plug -> sump -> grate payout.

## 8. The night shift, concretely (REWRITTEN 2026-07-09 for the section-0 pivot)

One fixed room fills the screen; the whole night happens in this frame. Your hands
are the pointer (tap/hold/drag = click/hold/drag; identical on touch and mouse).
Numbers are v0 proposals. The scene mockup lives in the 2026-07-09 owner session.

**The screen (REVISED 2026-07-09 late: a SCROLLING TOWER, owner direction).**
The interior is five stacked floors you climb by scrolling (wheel, mouse drag,
touch drag; identical code path), entered at the BOTTOM: F1 four tubs + the
«БАНЯ» sign + the ВЫХОД door, F2 four dry tubs (the hose era fills them), F3 the
sauna «ПАРИЛКА» (bench tiers + kamenka stove), F4 two wide tubs, F5 one big hot
crown pool (the B1 heat rect lives there: the reward for climbing). Floors taper
with the exterior tiers. The camera fits the tower WIDTH on any screen, so
mobile portrait shows ~3 floors and desktop ~1, and both scroll. The service
wall (tanks, jars, boiler, hose rail) distributes across floors when B6's hose
lands. HUD stays diegetic; SHIPPED as the v25.83 slice in 072-bath.js
(BATH_FLOORS table; __bath.floor(1..5) scrolls for dev).

1. **Request.** A guest wobbles in low from the door, climbs into an empty tub DRY,
   and shows a pictographic bubble: temperature band + mineral (later: two minerals,
   murkiness, steam). You build the bath around the guest; satisfaction samples the
   sim at its body (B-D4), so the water it sits in must hit the request.
2. **Fill = THE HOSE** (owner design 2026-07-09; replaces per-tub taps). One
   copper articulated arm on a ceiling rail serves the whole row. DRAG the nozzle
   anywhere and it STAYS where released (friction joints); TAP the nozzle to
   toggle flow on/off; a DIAL on the nozzle picks the liquid (v1 hot/cold; later
   the tanks' exotics). Flow spawns real particles and drains the matching tank
   while running, whether or not you are holding it: steer a live pour, splash
   around a slime for fun, or waste your reserve, all real. The tub thermometer
   reads the true B1 temperature; blending is physical; overfill sloshes over.
   B1 cooling means a prepared bath drifts off-spec while a guest waits: THE
   PHYSICS IS THE ORDER TIMER (Dave's sushi never cooled; ours does).
3. **Minerals = drag a jar** from the shelf over a tub; it tips and pours while
   held; powder dissolves into the B3 tint/property channel; water visibly changes.
   One dose satisfies v1 requests; dose amounts are later depth. Mineral slimes
   (soluble guests, Q&A) can BE premium doses.
4. **Drain = tap the plug chain** (water + tint + contents drop to the sump).
   **Scrub = rub back and forth** on a grimy guest with the pointer (grime flakes
   into murk; drain + refill after). **Vent = tap the flue** when steam gets thick.
5. **Queue + pacing (Dave).** Guests arrive on a clock, wait at the door with
   visible patience, cap ~5 inside (~2-3 on weak mobile, same budget logic as the
   water cap). Serve accurate + fast = bigger tips. A guest that waits too long
   leaves slowly the way it came: no pay, and the queue thins for a while. Soft
   fail only.
6. **Supply = the day-feeds-night link.** The boiler's hot-water reserve burns down
   with every hot pour and refills from mined COAL; the jars hold mined mineral
   DOSES. Running out mid-rush gives tomorrow's dig a purpose (fish -> sushi, made
   literal).
7. **Payment, physical.** A happy guest flips coins into its water as it leaves;
   mineral-bathed slimes condense a pearl/ore bit (tiny refinery); the grimy spirit
   sheds ore as cleaned. Everything washes down the drain to the grate; pull it at
   closing = the night's take in one pour. No star meter (2026-07-09): cash is the
   only currency, and the bath itself is the gate (next item).
8. **Progression = the ATTRACTOR model** (owner direction 2026-07-09): upgrading
   the actual bath brings new guests. Each slime species (new shapes, new colors,
   per the body-plans track) has requirements over TUB TIER (wood -> copper ->
   stone -> exotic) + stocked liquids + stocked minerals; meet them and that
   species starts appearing in the queue, with requests drawn from what attracted
   it. Minerals join the pool only once MINED (depth bands = the menu: iron
   shallow, sulfur mid, copper deep, stranger salts below); exotic liquids join
   via B10 later. Grimy guests, steam-room requests, long-soak exact-band whales,
   and the Bannik's recurring arc arrive as tier + pantry grow. Regulars with
   remembered "usuals" start early. Night ~3-5 real minutes; ~6 guests growing
   toward ~20.

Maps onto the stage board: room/fixtures/pointer = B6; queue, requests, pacing,
supply, payment, ramp = B7; exterior + transition = B8.

## 9. Deviation log (append-only)

- 2026-07-10 (Fable; v25.98): STEAM QUALITY. Owner: blocky, low quality,
  splotches flash into existence. Three causes, three fixes: (1) the sim grid
  was the quality ceiling (velocity/curl at 160 short-axis for the whole view,
  one texel ~10 screen px, and the v25.97 curl x1.3 amplified exactly that
  grid frequency), so steam mode now RESIZES the smoke sim while inside
  (sim 288 short-axis, dye to canvas short-axis capped 1080, desktop WebGPU
  only, smokeWGPU.resize on push, smokeWGPUApplyRes recomputes standard on
  pop; verified bit-exact tune restore across enter/exit/enter); (2) curl
  boost trimmed to x1.12 since real detail now lives in the finer grid;
  (3) nothing deposits in one frame anymore: puffs became BOILS (emitters
  living ~0.6s under a sine envelope, ~1/10 the dye per frame, radius grows
  as the billow swells) and licks ramp in over 0.18s. Result: fine curling
  filaments and vortex pairs instead of stamped discs.

- 2026-07-10 (Fable; v25.97): REAL STEAM. The old emitter was a uniform
  drizzle of needle splats with velY 0.06 in a sim whose diesel emitter
  splats at 2.75: the steam had no momentum and blurred into a faint band.
  Steam is now EVENTS in three layers (all dials on __bath.steamTune):
  ambient drizzle over the waterline, random PUFFS (splat clusters + a wide
  faint bloom, rise ~1.6) that mushroom as they climb, and LICKS (short-lived
  jets that hold one wiggling spot ~0.75s, rise ~2.6) that send coherent
  tendrils up to curl and shred. Steam mode now also scales the sim itself:
  dye dissipation x0.47 (plumes live long enough to climb), curl x1.3 (the
  risen steam wanders and licks), time scale x1.35, all saved/restored on
  exit. Verified: three checkpoints show three different skies, no whiteout.

- 2026-07-10 (Fable, convection saga; v25.90-96): THE BOWL + THE BOIL SHIPPED.
  Bowl: the tub is ONE catenary at golden proportions (bathTubCurve, cosh with
  BATH_CAT_C = 2.0, W:D = phi^2); the drawn curve is MASTER, the carve digs
  deeper than the curve, and the foreground hole samples the exact curve, so
  water collides with the curve itself (no staircase; three squarish attempts
  before this law, do not retry them). Convection took five rounds of physics,
  each a real mechanism, none a lever: (1) hot sleepers wake + refuse the sleep
  latch (sleeping particles skip G2P where buoyancy lives); (2) bathMode is a
  continuous hard stimulus in liquidStateTick (sleeping cold water still
  carries mass = an immovable sculpture); (3) heat transport is
  advection-dominant (BATH_EXCHANGE small so heat RIDES parcels; 0.15
  equalized any plume away in ~40ms); (4) v25.95's concentrated vent was a
  momentum cannon (a standing Old Faithful mound), so v25.96 heats a WIDE
  band hugging the bowl belly instead and CAPS buoyant lift below gravity in
  the kernel (a body force that outruns free fall stands as a permanent
  fountain; capped, hot water rises only relative to cool water); (5) strong
  cooling (BATH_COOL 0.28) closes the loop so the tub never saturates
  uniformly hot and the boil stays alive forever (verified flat surface +
  live plumes at 150s). The heat is now a visible STOVE: an industrial gas
  burner under the copper bowl (fire chamber, steel manifold, flickering
  blue-core flames, glowing copper shell), drawn per-frame on the uiTop
  foreground strictly below the catenary. Tint is a soft exponential ramp
  through a warm mid-tone (the hard hot/cold border was honest rendering of
  a near-bimodal field). Steam biases over the full burner span.

- 2026-07-10 (Fable, hard-physics session; v25.85-87): B5 CORE + B2 CORE SHIPPED.
  Guests are real jello bodies (guest flag = dissolve-immune; ONE-WAY buoyancy in
  jelloIntegrate against an analytic waterline via b.bathBuoy, the water is never
  pushed back); a guest cycle runs continuously (spawn left/elevator, stall-based
  hop navigation, plunge with a real droplet splash, timed soak with contented
  bobs, LEAP out, waddle home, pay +$25 with a rising float, clean despawn, cap 2).
  Steam: the smoke backend runs scene-local in steam mode (smokeTune fields scaled
  + restored on exit, polarity-proof) with splats at hot-tub waterlines; the
  "invisible steam" bug was the hot tub being OFF-SCREEN (the smoke domain hugs
  the camera), fixed by moving heat to the bottom tub = the owner's test bench.
  Tubs are stepped BOWLS carved per-column (1 deep at edges, F.deep centre) drawn
  as a simple stone U with copper lips (owner cut the ornate vessel + black
  interior). Floors are cozy now: 7 interior rows + slab, one tub per floor.

- 2026-07-10 v25.85 (Fable physics session): B2 CORE + B5 CORE SHIPPED. STEAM:
  scene-local steam mode (smokeTune fields scaled on enter, restored exact on
  exit), emitted off hot (fill 2) tubs via world-to-UV splats, pooling under the
  slabs. THE GUEST: first slime customer (b.guest = dissolve-immune at the scan;
  jelloBuildBody 1-tile body; hop brain; one-way waterline buoyancy b.bathBuoy in
  jelloIntegrate, water NEVER force-coupled back; entry splash = spawned
  droplets). FOUR found-the-hard-way lessons for future sessions: (1) the scene
  MUST own screenW/screenH with worldScale (jello's draw cull + the smoke domain
  read them; stale values culled an on-camera body and shrank the domain);
  (2) drawSmoke() lives in the world render path, the scene must call it or dye
  steps invisibly; (3) guest "grounded" must be POSITIONAL/stall-based, never
  velocity (wedged bodies churn phantom velocity: two deadlocks); (4) guests
  must soak in WHATEVER tub they land in, any state (overshoot is charming).
  Steam brightness/rate + buoyancy lift/drag are v0 levers. Guests: 1, home
  floor only, no elevator ride yet (B7).

- 2026-07-09 v25.84 (owner): floors became PURCHASABLE: F1 free with two tubs,
  F2-F5 locked (grayed + in-scene КУПИТЬ button priced $2k/$8k/$20k/$50k v0, paid
  from real game money, red-blink when short); water + the crown heat spawn on
  unlock; the ELEVATOR shaft (cols 27-29, left-aligned floors so it runs truly
  vertical) got doors on every floor with ambient open/close on owned floors
  (slime traffic lands with B7); bottom clamp peeks a slice of F2 so scrolling is
  discoverable. Floor ownership is SESSION-ONLY until it joins SAVE_VERSION.
- 2026-07-09 latest session (owner): the interior became a five-floor SCROLLING
  TOWER (F1 4 tubs / F2 4 dry / F3 sauna / F4 2 wide / F5 big hot crown pool),
  replacing the single room; width-fit camera + vertical scroll target; enter at
  the bottom; the one B1 heat rect moved to the crown pool. Spawn lesson: tub
  water must seed near REST density (~1.6 px spacing; 655/tile), sparse seeding
  collapses to puddles. Shipped v25.83.

- 2026-07-09 later session (owner + Fable): (a) per-tub taps replaced by THE HOSE
  (ceiling-rail articulated arm, drag + stays, tap-to-toggle flow, liquid dial,
  drains tanks while running, spills welcome); (b) art direction RESOLVED as
  frontier-Soviet BANYA («БАНЯ», oil lamps, veniki, samovar upgrade, the Bannik as
  the mysterious regular; no Japanese pastiche); (c) reputation stars REMOVED:
  progression = the attractor model (tub tier + stocked liquids/minerals decide
  which slime species appear); (d) B2 expanded into the STEAM SYSTEM (steam must
  read as not-smoke: own params/palette, scene-local steam mode); (e) B10 parked:
  typed underground liquid pockets + rig tank + banya tank deposits, build only
  after B6/B7 are fun; (f) guests locked slimes-only.
- 2026-07-09 (THE PIVOT, owner-directed): interior changed from cutaway-in-world +
  rig-scale to a SEPARATE fixed-camera scene with pointer-only interaction and
  Dave-the-Diver request pacing (section 0, B-D11, rewritten section 8). The
  engine trick: the room is an off-map pocket of the world grid, so the "scene"
  is a camera teleport + mode swap and every sim works inside unchanged. All B1
  physics (temperature/tint/cooling) remains load-bearing: cooling IS the order
  timer. Superseded text is annotated in place, not deleted.

- 2026-07-05 (B1, deviates from B-D7/B-D9 as written): temperature does NOT get a
  `buf.temp`; it rides **flag bits 24:31** (raw 0..255 = T 0..2, floor-encoded so
  cooling reaches true 0). The G2P flag rebuild already re-wrote those bits and
  `restBase` is masked (`& 0xffff`), the ops-replay compaction copies flags whole,
  and spawns zero them (= ambient). Bonus: the existing flag readback mirror
  carries temperature for free (steam/scoring in B2 need no new readback).
- 2026-07-05 (B1): `cellHeat` lives in the **pressure layout**, not P2G. P2G sits
  at its 9-storage-buffer bail threshold; pressure had headroom (8 dense / 9
  sparse, both within what the chains already require), and gridPressure is a
  per-particle stencil pass with SimParams already bound, so splat/normalize/
  gather land there with ZERO new device requirements and zero P2G edits. Chain
  per substep: clearDV zeroes heat (dense) or heatClearSparse does (sparse, in
  clearPrev + runSparseEndClear, always dispatched so a toggled-off bath leaves
  no stale field) -> gridPressure splats -> heatNormalize (2b, dispatched only
  when BATH_ON) -> G2P gathers, relaxes, applies the source rect, cools, buoys.
- 2026-07-05 (B1): heat sources are ONE world-px rect in SimParams lanes
  (`bathB` rect + `bathC` strength/rate), not the B-D8 uniform list; B2 grows it
  to a list when vents/boiler need more than one.
- 2026-07-05 (B1, known behavior): sleeping particles neither splat nor update
  heat, so calm hot water holds its temperature (a resting tub stays hot, nice)
  but the cell field dilutes near sleep boundaries (mild artificial surface
  cooling). Revisit only if the owner's feel-check flags it.
