# WALKAWAY.md: Sluice free-forever / simplify / consolidate batch

Started 2026-06-19. Owner is away; running autonomously per the brief. This file
moves with the game into Portfolio_01 in Phase E.

## Decisions
- (A) Version jumped v24.191 -> v25.0 to mark the free-forever / single-town relaunch.
- (A) SAVE_VERSION bumped 1 -> 2: old multi-town saves (grid serialized at 3188 wide) are
  incompatible with the 320-wide single-town world and would corrupt; a version mismatch is
  skipped (fresh world), so this cleanly retires them. The owner starts a new game.
- (A) Combat/NMZ/jello/oil/refinement guarded with first-line early-returns inside their own
  functions (lowest-churn, call sites untouched). Oil + jello were ALREADY not generated in the
  live world (worldgen never called generateOilPockets/generateJelloPatches), so the flags mostly
  prevent re-enabling + neutralize save-loaded jello + the oil pump upgrade. Refinement was never
  built (econ registry has zero consumers); refined items are filtered out of the catalog.
- (A) Flight: removed the "Today" button from the pause toggle (sluice.html); Rotation + VTOL only.
  Legacy mode 0 stays in code, reachable via the dev F hotkey, and coerces to the Rotation highlight.
- (A) Each flag is URL-overridable for spot-checks: ?multitown=1 ?combat=1 ?nmz=1 ?board=1 ?jello=1
  ?oil=1 ?refine=1 (declared in 010-constants.js, read before 015 builds the regions).
- (init) Owner's 4 assumptions accepted as-is: (1) flight toggle = Rotation + VTOL only,
  legacy "Today" stays in code but off the toggle; (2) archive sluice-alpha with a final
  pointer commit, do not delete; (3) game lives at Portfolio_01 ROOT (js/sluice.js, js/sluice/,
  build-sluice.sh); (4) ccusage = real numbers, use what the logs cover, never fabricate.
- (init) Working directly in ~/sluice-alpha on main (owner is away, no live session to clobber).
  sluice-alpha rule: build, bump GAME_VERSION, commit fragment+bundle path-scoped, pull --rebase, push.
- (init) Central feature-flag defaults for the new game: SINGLE_TOWN=true, ENABLE_NMZ=false,
  ENABLE_COMBAT=false, ENABLE_TRADE_BOARD=false, ENABLE_JELLO=false, ENABLE_OIL=false,
  ENABLE_REFINEMENT=false. Flags centralized + commented (010-constants.js). Disable, don't delete.

## Balance model (Phase B summary, full detail in BALANCE.md)
- Town 0 is now the WHOLE game: deepened 350 -> 800, re-layered to the full 6-layer arc
  (topsoil/subsoil/deepcrust/permafrost[heat gate]/magma+mantle[shield gate]), ore set
  5 -> 19 ores (coal $5 to unobtanium $12000) arced by depth, only renderer-proven ores.
- Kept all tuned value/hp/cost curves unchanged: the model shows they hit ~33min speedrun /
  2-3hr normal once re-pointed at an 800-deep town. ~$2.14M minable, ~$55k to be bottom-ready.
- Re-justified Heated Drill (permafrost hard gate) + Heat Shield (magma damage); no dead tiers;
  oil pump hidden. CAVEAT: modeled first pass, owner must playtest feel (checklist in BALANCE.md).

## NEEDS OWNER
- (D) PLAYTEST audio: SFX is wired but assets/sfx/ is empty, so drop real key_N.m4a (or
  key.m4a for single-variant keys) into assets/sfx/ and confirm they fire in-game. The
  Send-to-prod UI + step-by-step come in Phase G (SFX_INSTRUCTIONS.md).
- (B) PLAYTEST the balance feel: speedrun ~33min / normal ~2-3hr is modeled, not felt. Use dev
  mode (backtick = money 999,999 + free buys). Watch the early bootstrap (could drag) and the
  magma gate (should be tense not lethal). Re-tune levers per BALANCE.md Section 9 if needed.
- (pending) Items requiring the owner's password or a real prod commit will be logged here as found.

## Done-log
- (init) Read sluice-alpha AGENTS.md, README, build-sluice.sh, 000-head.js. Mapped 68 fragments,
  conventions (var/single-IIFE/concat build), versioning + push rules, flight modes, water harness.
- (init) Set up 9-phase task list + this log.
- (A) PHASE A DONE (v25.0). Central flag block in 010-constants.js. SINGLE_TOWN branch in
  015 buildRegions(). Guards: combat (085: combatInit/updateCombat/drawCombat/nmzShearFactor),
  NMZ (087: courseBuild/nmzCourseTick/drawNmzCourse; 175 banners; 310 exit-arrow), jello (120
  activation, 140 draw, 350 update, 030 placement), oil (070 suction, 030 placement, 270+240
  pump item), refinement (012 catalog), trade board (250 hub 2-station layout, 240 route guard),
  birds roost loop (205), pond bounds (030). Flight toggle Today-removed (sluice.html).
  SAVE_VERSION 1->2 (047). Built, node --check PASS, headless boot PASS: 1 town / 0 zones,
  gm levers OK, flightMode 1, 0 console errors.
- (B) PHASE B DONE (v25.1). Town 0 deepened 350->800, 6-layer hazard arc, 19-ore progression
  (015). Heated-drill hint generalized (060). Kept tuned value/hp/cost curves. BALANCE.md model
  (~$2.14M minable, ~$55k bottom-ready, no dead tiers, time-to-bottom math, playtest checklist).
- (B/C) WORLDGEN FIX (030): carveGreatSeamChamber() now resolves the deepest town from the live
  REGIONS table (was scanning raw TOWN_DEPTHS -> town 3 @ 1400 -> seam silently failed in single-town).
- (C) PHASE C DONE (v25.2): low-end lake sizing. Water sim UNTOUCHED, density stays FULL. Pond
  geometry in 030 shrunk: width 9-14->6-9, depth 5-8->3-4, area clamp 100->24 tiles (~15.7k
  particles/live lake, ~4x lighter), gap 96-150->130-210. Documented in TUNING.md.
- (D) PHASE D DONE (verify only, no code change): SFX wired END-TO-END in js/audio.js (SFX_DIR
  'assets/sfx/', 82-entry SFX_MANIFEST, sfxFiles/loadAllSfx loader, playSfx, sfxLoopDrive +
  sfxLoopWatchdog, game-side sfxPlay/sfxLoop in 080). assets/sfx/ empty = why it is silent.
