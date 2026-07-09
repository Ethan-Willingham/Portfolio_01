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

Status: **B1 SHIPPED (v25.56)** by the Fable session itself; next = B2 (steam +
source authoring) after the owner's feel-check of the heated pond. Nothing ships
enabled: everything sits behind `ENABLE_BATH` (default false, `?bath=1` override)
in the `js/sluice/010-constants.js` flag block, exact style of `ENABLE_JELLO`.

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

- **Structure, not skin.** Spirited Away's shape (tower of baths, boiler below,
  strange guests, one filthy-spirit set piece) in the game's own frontier-steamworks
  art language (timber, corrugated iron, copper pipe, lanterns later). No pastiche.
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
- **Economy.** One currency (cash) plus reputation stars. Rep, not money, gates
  floors and guest tiers. Bathhouse income complements ore (pocket money early,
  unique goods late), never replaces it.

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

**B2. Steam + heat-source authoring.** Mirror-driven steam emission (B-D6) tuned to
read as bath steam (white, lazy). Worldgen: 2-3 steam vents and 1 hot aquifer pocket
in the existing 400 m arc (`030-worldgen.js`), each a capped source rect the player
activates. OWNER FEEL-GATE: "does hot water + steam feel magical?" If no, stop and
re-scope before B3+.

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

**B6. The room** (restaged by the section-0 pivot). The off-map pocket room
(B-D11): scene enter/exit (door prompt at dusk, camera teleport, world pause,
morning return), the fixed-camera room render (timber, lanterns, its own light),
tubs as solid basins holding real water, taps that spawn hot/cold particles while
HELD, jar drag-and-pour (doses -> the B3 tint channel), plug-chain drain to the
sump, flue vent, and the pointer layer (tap/hold/drag routing, one code path for
touch + mouse). Reuses the oil pump intake for tap plumbing fiction only.

**B7. The service loop** (restaged). Dave-pacing: guests arrive on a clock, queue
with visible patience (cap ~5 inside), wobble to a tub, show a pictographic
request (temperature band + mineral), soak, pay coins into the water, leave.
Satisfaction is sim-read at the body (B-D4). Hot-water reserve (boiler, coal-fed)
and mineral doses are CONSUMABLES stocked by mining: the day-feeds-night link.
Request tiers ramp: temp-only -> +1 mineral (gated on having MINED it; depth bands
are the menu) -> combos/scrubs (rep 2) -> steam room requests (rep 3) -> VIP exact
bands (rep 4) -> the quiet one arc (rep 5). Soft-fail only (impatient guest leaves,
rep tick down). Night length ~3-5 min, 6 -> ~20 guests as tubs grow 2 -> 5.

**B8. The exterior + transition.** The tall pixel-art bathhouse in the town per
`BUILDING_STYLE.md` (the tile cross-section survives as the FACADE: stone base,
timber body, iron top, lanterns; windows light floor by floor with reputation),
the door-enter prompt, and the enter/exit swap polish. Art direction lean
(industrial vs lantern-fantasy %) stays an OWNER CALL via a chooser lab page.

**B9. CPU fallback port + mobile.** Port the temperature channel into the v15
sparse CPU sim inside `js/sluice.js` fragments; mobile presets cap guests like they
cap water. Only after B2 and B5 gates pass.

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

**The screen.** Left: the entry door + visible queue (planning info, like seeing
Dave's line). Center: the tub row (2 tubs growing to 5) under a copper tap run,
floor in front where guests wobble. Right: the service wall: mineral jar shelf,
boiler with pressure gauge + firebox, coal pile. Floor: drain grate + till. Top:
lanterns, drifting steam, a flue window. HUD is diegetic: thermometers on tubs,
the gauge on the boiler, patience shown on the guests; only cash/rep sit small in
a corner.

1. **Request.** A guest wobbles in low from the door, climbs into an empty tub DRY,
   and shows a pictographic bubble: temperature band + mineral (later: two minerals,
   murkiness, steam). You build the bath around the guest; satisfaction samples the
   sim at its body (B-D4), so the water it sits in must hit the request.
2. **Fill = press-and-HOLD a tap.** Hot (red) or cold (blue) per tub; real particles
   pour while held. The tub thermometer reads the true B1 temperature; blending is
   physical. Overfill sloshes over for real. B1 cooling means a prepared bath
   drifts off-spec while a guest waits: THE PHYSICS IS THE ORDER TIMER (Dave's
   sushi never cooled; ours does).
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
   leaves slowly the way it came: no pay, a rep tick down. Soft fail only.
6. **Supply = the day-feeds-night link.** The boiler's hot-water reserve burns down
   with every hot pour and refills from mined COAL; the jars hold mined mineral
   DOSES. Running out mid-rush gives tomorrow's dig a purpose (fish -> sushi, made
   literal).
7. **Payment, physical.** A happy guest flips coins into its water as it leaves;
   mineral-bathed slimes condense a pearl/ore bit (tiny refinery); the grimy spirit
   sheds ore as cleaned. Everything washes down the drain to the grate; pull it at
   closing = the night's take in one pour. Reputation (stars) is separate and gates
   floors + guest tiers.
8. **Progression ramp** (owner delegated): nights 1-3 = temperature only, 2 tubs.
   Minerals join the request pool only once MINED (depth bands = the menu: iron
   shallow, sulfur mid, copper deep, stranger salts below). Rep 2 = combos + grimy
   guests; rep 3 = steam room + steam requests; rep 4 = VIP long-soak whales with
   exact bands; rep 5 = the quiet one's arc. Regulars with remembered "usuals"
   start early. Night ~3-5 real minutes; ~6 guests growing toward ~20.

Maps onto the stage board: room/fixtures/pointer = B6; queue, requests, pacing,
supply, payment, ramp = B7; exterior + transition = B8.

## 9. Deviation log (append-only)

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
