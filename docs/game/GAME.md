# GAME.md: Sluice quick-start (read this first)

Sluice is a 2D browser mining game that lives in this site repo. It is **free forever,
public, and playable at `/grand-motherload.html`**. This file is the fast on-ramp; the
deep design docs are the other files in `docs/game/` (see the map at the bottom).

> New direction (2026-06-19): the game was pulled back out of the private `sluice-alpha`
> repo, simplified to a **single-town mining sandbox**, and shipped free on the site. The
> closed-source / Steam / multi-town / combat plans are parked behind feature flags, not
> built out. Do not "restore" them; do not treat a disabled system as a bug.

---

## The loop (what the game IS now)

Dig down through one town, collect ore, fly up to the surface station to sell + refuel
+ upgrade, then go deeper. No win screen, just a deeper hole. The town is 400 m deep (was
800; compressed 2026-07-03 so the ore art's native ~400 m arc lands and variety hits from
the first few metres). Balanced for a ~20 min skilled speedrun to the bottom and a ~1.5 hr
normal playthrough (see `BALANCE.md`).

**Surface garden (v28.0):** clay sky slimes arrive like meteors and bounce to rest.
Four lots west of town become 11-wide, 2-deep stone, copper, iron, and crystal baths.
Buy land with cash and bring the later baths' construction ores in cargo. The free
siphon (`F`) draws real liquid with left mouse and pours with right mouse; `R` selects
a fluid chamber while equipped. It also carries one cooled slime. Touch players tap
SIPHON, choose IN or OUT, then hold on the world. `E` or a sign tap builds/collects.

Fill a bath and add a slime to grow a pearl. Water starts the loop; shallow brine,
nectar below the heated-drill gate, and deep lumen unlock richer recipes. Each pearl
incorporates actual liquid, and one finished pearl waits per lot. Purchased baths,
residents, tank contents, progress, and poured liquids persist. Offscreen liquid is
parked to preserve the shared particle budget. This is independent of the optional
indoor banya and the disabled underground slime brains. See `SLIME_GARDEN.md`.

---

## Build & run

The game is ONE IIFE split into ordered fragments in `js/sluice/NNN-*.js`, concatenated into
`js/sluice.js` by `build-sluice.sh`. **Edit a fragment, never the bundle.**

```bash
./build-sluice.sh                 # rebuild js/sluice.js from the fragments
node --check js/sluice.js         # parse-check
python3 -m http.server 8000       # then open http://localhost:8000/grand-motherload.html
```

**Every change:** edit the fragment, run `./build-sluice.sh`, bump `GAME_VERSION` in
`js/sluice/000-head.js`, commit BOTH the fragment(s) and the rebuilt `js/sluice.js`. Push to
`main` deploys to the live site (GitHub Pages). Code style is invariant: `var` (not let/const),
single IIFE, no imports/modules, no build step beyond the `cat`. Match what is there.

**Verify (you cannot drive the RAF loop in a paused preview):** `node --check`, then a
headless boot is the reliable check. A working recipe: serve the repo, then drive headless
Chrome over CDP (`--headless=new --enable-unsafe-webgpu --use-angle=metal`) against
`grand-motherload.html?dev=1&nosave=1`, read the console + `window.gm`. A clean boot logs
`[regions] WORLD_COLS 320 ... 1 regions (1 towns, 0 zones)` and 0 errors. Dev mode (backtick,
or `?dev=1`) clamps money to 999,999 and frees purchases so deep content is one keypress away.

---

## ACTIVE vs DISABLED systems (read before "fixing" anything)

The central feature-flag block is at the **top of `js/sluice/010-constants.js`**. It loads
before everything, and each flag is URL-overridable for a no-build spot-check.

| System | Flag | Default | Spot-check |
|---|---|---|---|
| Single town world | `SINGLE_TOWN` | **on** | `?multitown=1` brings back the wide 4-town world |
| Combat + rig auto-turret | `ENABLE_COMBAT` | off | `?combat=1` |
| No Man's Zone courses | `ENABLE_NMZ` | off | `?nmz=1` |
| Cross-town Trade Board | `ENABLE_TRADE_BOARD` | off | `?board=1` |
| Jello / slime soft bodies | `ENABLE_JELLO` | **on** (v25.59) | `?jello=0` boots without slimes |
| Underground oil + pump | `ENABLE_OIL` | off | `?oil=1` |
| Ore refinement catalog | `ENABLE_REFINEMENT` | off | `?refine=1` |

A disabled system is **inert by design** (guarded with first-line early-returns in its own
functions; the code still compiles and keeps its gm levers). Missing enemies / zones / oil /
slimes are NOT bugs. Do not flip a flag to `true` and ship it without asking the owner.

**ACTIVE for the simple game:** worldgen (single town, 400 m, 6 layers, all 32 ores), drilling, fuel,
cargo, the surface station shop (Workshop + Supply Shelf only), upgrades (drill/fuel/cargo/
hull/booster/heat/shield/vert), bombs, the water/oil particle sim (water and mineral liquids), smoke, rare
buried slimes (v25.59: `ENABLE_JELLO` on; ~1 straight-down encounter per 150 m, tuned by
`JELLO_PATCH_CHANCE` in 030) that fully cushion a fall (the v26.69 NPC brains in
345-slime-npc.js are PARKED OFF since v26.73, owner call; `?npc=1` or gm `slime.NPC`
enables wander/hop/startle + swim states), fall damage (v25.59: `FALL_IMPACT_FX`
on, a bad drop can kill on bare rock), flight (ONE unified model everywhere since v25.49:
`flyTune` + the FLY FEEL presets), the night sky/weather/mountains/trees, audio (music + the
procedural SFX bank), save/respawn, the Great Seam endgame chamber, the Mineral Ledger,
and the Cargo Hold inspector (click the console's Cargo hatch or press I to see
quantities, unit prices, and haul value while the mine is paused).

---

## Fragments that matter for the simple game

(The full fragment map is in `docs/game/AGENTS.md`. These are the ones you will actually touch.)

| Fragment | What |
|---|---|
| `000-head.js` | IIFE open, `GAME_VERSION` |
| `010-constants.js` | **the feature-flag block**, TILE/GRAVITY/DRILL_SPEED, ORES table, liquid tunables |
| `015-regions.js` | **the single-town world**: `buildRegions()`, `TOWN_DEPTHS[0]`, `TOWN_LAYERS[0]`, `TOWN_ORES[0]` (the depth/layer/ore arc) |
| `020-state.js` | game state, the `shop` upgrade-cost arrays, pause overlay text |
| `030-worldgen.js` | terrain + ore-vein placement, surface ponds (low-end lake sizing), the Great Seam |
| `040-init-resize-resolution.js` | `init()`, `resize()`, fuel/cargo/hull/climb formulas |
| `045-loading.js` / `046-shader-warm.js` | the loading cover and the first-use GPU shader warm-up; give any new visual effect (a new gradient, clip, blend mode, particle or menu art) a representative draw in 046 so it compiles under the cover instead of stalling play |
| `047-save.js` | save/respawn (`SAVE_VERSION`) |
| `071-liquid-catalog.js` | fluid identities, conserved transfer, samples, and sky-slime liquid boundaries |
| `073-liquid-deposits.js` | finite mineral pockets, offscreen liquid storage, and liquid persistence |
| `074-slime-garden.js` | four surface lots, construction, recipes, and pearl rewards |
| `075-liquid-tool.js` / `076-siphon-audio.js` | aimed siphon, fluid chambers, one passenger, touch controls, and sound |
| `053-pause-menu.js` | native pause/options/controls navigation and settings; `sluice-menu.css` holds the scoped menu layout |
| `060-shop-logic.js` | buy/sell logic, `drillBlockReason` (the heat/drill gates), the auto-sell reveal |
| `245-ui-kit.js` | the reusable modal kit: fizzed-world backdrop + the catalog modal (tabs/list/detail/action) |
| `250/270/280-shop-*.js` | the STORE modal spec + routing (250) and its workshop/shelf item builders (270/280) |
| `297-cargo-manifest.js` | current cargo inspection: grouped mineral quantities, exact prices, responsive pages, and modal input |
| `080-update-camera.js` | movement, drilling, fuel burn, the one flight integrator, the SFX shims |
| `156-render-planet.js` | pixel-art continents and oceans below the sky horizon, lit by the existing day/night cycle |
| `165-render-trees.js` / `166-render-surface-boulders.js` | open woodland and scattered surface stones, derived from supporting terrain |
| `167-surface-turtle.js` / `206-rare-bird.js` | rare surface visitors: a tiny walking turtle and a larger solitary white heron |
| `340-jello.js` | slime soft bodies, continuous gel rendering, and the topology-independent actor-intent seam |
| `348-sky-slimes.js` | clay meteor arrivals, elastic rebounds, eye animation, capture, and persistence |
| `350-gameloop-boot.js` | the game loop + boot |
| `360-gm-facade.js` / `370-gm-panel.js` | `window.gm` live tuning (toggle `L` in dev) |

---

## Live tuning + dev hotkeys

Press backtick to toggle **dev mode** (money 999,999, free purchases, the perf overlay).
Then the useful keys: **L** opens the `window.gm` slider panel (every tunable, grouped);
**X** cycles the water debug kit; **N** cycles weather moods; **G** the GPU probe; **H** the
perf-ISO A/B; **Z** zoom; **R** restart. The on-screen **+ SLIME** button under TUNE drops
a slime above the rig on every press. From the console, `gm.get('group.lever')` /
`gm.set('group.lever', v)` change anything live; the groups you will reach for most are
`water.*` (the liquid sim, see TUNING.md §2), `light.*` (fog of war), `weather.*`, `fly.*`
(mode + feel), `trees.*`, `haze.*`. Boot levers: `?nosave=1` (fresh world, no save), `?dev=1`,
the feature-flag overrides above (`?multitown=1` etc.), `?ponds=wide` or `?ponds=deep` (the
pause > Options > World pond style, for a fresh world), and the water harness
`?pondtest=1..4` + `?wdbg=NAME:V,...`.

## Audio

`js/audio.js` is wired end to end. Music lives in `assets/music/*.m4a`.
`assets/sfx/` contains 162 original procedural sounds for all 84 manifest keys:
AAC one-shots and seamless PCM loops. Rebuild the bank with
`python3 tools/audio/build-sfx.py`. The generator needs Python, NumPy, and
macOS `afconvert`; the game has no added runtime dependency.

See `assets/sfx/README.md` for tuning, sources, and the browser verification
command. Master, Music, and SFX controls live in pause > Options. New players
start at moderate volume after their first gesture; saved mute settings win.
`docs/game/SFX_BIBLE.md` remains the design reference. Its earlier empty-bank
notes and historical release plans describe the old state.

---

## The design docs (in `docs/game/`)

`AGENTS.md` (the full fragment map + section index + invariants), `BALANCE.md` (the economy
model), `TUNING.md` (every visual/perf lever), `BACKGROUND_STYLE.md` / `BUILDING_STYLE.md` /
`UI_STYLE.md` / `PIXEL_ART.md` (art bibles), `MINERALS_BIBLE.md` (ores), `MUSIC_BIBLE.md` +
`MUSIC_PROMPT_SYSTEM.md` / `SFX_BIBLE.md` + `SFX_PROMPT_SYSTEM.md` (audio), `ECONOMY_BIBLE.md`
/ `ITEM_DESIGN_BIBLE.md` / `SHOP_PSYCHOLOGY.md` / `WORLD_DESIGN.md` (systems), `EXPANSION_PLAN.md`
(the parked multi-town/combat plan, behind the flags). Read the relevant one before deep work.
