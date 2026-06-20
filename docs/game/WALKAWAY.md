# WALKAWAY.md: Sluice free-forever / simplify / consolidate batch

Started 2026-06-19. Owner is away; running autonomously per the brief. This file
moves with the game into Portfolio_01 in Phase E.

## FINAL REPORT

All 13 brief items addressed across phases A to I. Everything is committed and pushed;
the game is LIVE and free at https://ethanwillingham.com/grand-motherload.html (v25.2).

**What shipped:**
1. **Single-town free-forever game** (v25.2). Central feature-flag block (010-constants.js),
   SINGLE_TOWN worldgen (015), boots clean (headless: 1 town / 0 zones, 0 errors).
2. **Balanced** for ~33min speedrun / ~2-3hr normal: town deepened to 800, a 6-layer hazard
   arc, a 19-ore progression. Modeled in docs/game/BALANCE.md (not yet feel-tested).
3. **Low-end lakes**: pond geometry shrunk (water sim untouched, full density kept).
4. **SFX wired** end to end (verify-only; assets/sfx is the only thing empty).
5. **Consolidated** into this repo at root (js/sluice/, js/sluice.js, build-sluice.sh,
   wgpu/audio engines, assets/music+sfx+shop, docs/game/). sluice-alpha archived (not deleted).
6. **grand-motherload.html** rewritten: loads js/sluice.js, free-forever copy, og cards,
   responsive embed that fills the viewport (verified desktop 1280 + mobile 380, no h-scroll).
7. **labs.html** chooser of all 16 game labs + a Labs button atop the game.
8. **SFX send-to-prod** (sfx-publish.html) reusing the post-editor crypto + GitHub API; crypto
   self-tested PASS, no real commit (needs the owner's password). SFX_INSTRUCTIONS.md written.
9. **About page**: the game's 253 real commits merged into the river (Sluice is now the top
   topic, 256); token figures are real ccusage that already include the game; honest, no rewrite.
10. **Docs + memory** updated to the new direction; docs/game/GAME.md is the quick-start.

**Flag-disabled (intentional, NOT bugs):** the multi-town world, combat + the rig auto-turret,
No Man's Zone obstacle courses, the cross-town Trade Board, jello/slime soft bodies, underground
oil + the oil pump, ore refinement. Each is one flag (010-constants.js) and a URL param away
(`?multitown=1`, `?combat=1`, `?nmz=1`, `?board=1`, `?jello=1`, `?oil=1`, `?refine=1`).

**Balance numbers (model, see BALANCE.md):** 800-deep town; layers topsoil/subsoil/deepcrust/
permafrost(heat gate)/magma+mantle(shield gate); 19 ores coal $5 to unobtanium $12,000, value
rising with depth; ~$2.14M minable, ~$40-55k to be bottom-ready; no dead upgrade tiers.

## PLAYTEST CHECKLIST (the feel I could not verify)

Use dev mode (backtick = money 999,999 + free purchases) to move fast.
- [ ] **Boot + look**: open grand-motherload.html. One town, rig on its deck, terrain + station
      render, no console errors. Resize the window + load on a phone: the game fills the viewport,
      nothing clipped, no horizontal scroll.
- [ ] **The loop feel**: play a real run from $0. Does the early bootstrap (coal/copper) drag?
      Time a rough speedrun and a casual run against the ~33min / ~2-3hr targets. Re-tune via
      BALANCE.md Section 9 (the cheapest fix is the early ore values / world depth).
- [ ] **The gates**: confirm the permafrost wall needs Heated Drill ($900) and that magma/mantle
      are tense-but-survivable with Heat Shield (not instant death). Fly to the bottom (~800m),
      confirm the 6 layers read distinctly and the deep gems feel weighty + rare.
- [ ] **Flight**: pause toggle shows only Rotation + VTOL; both feel right; mobile split controls
      work in Rotation.
- [ ] **Shop**: exactly two counters (Workshop + Supply Shelf), no Trade Board.
- [ ] **Audio**: drop a real key.m4a (or key_N.m4a) into assets/sfx, confirm it fires in-game.
      Then run the publish flow: sfx-test.html to audition, sfx-publish.html to send to prod
      (needs your password). See SFX_INSTRUCTIONS.md.
- [ ] **About page**: open about.html, click "Sluice" in the legend, confirm the game's commit
      arc looks right in the river.
- [ ] **Labs button** (top of the game) reaches labs.html and every lab opens.

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
- (G) CONFIRM SFX PUBLISH with real audio + password: the sfx-publish.html flow is built and the
  crypto path is self-tested (no real commit was made, by design). To use it, make a sound, name it
  per SFX_INSTRUCTIONS.md, audition on sfx-test.html, then open sfx-publish.html, unlock with the
  editor password, drop the file(s), and Send to prod. Needs your password (decrypts blog-edit-auth.json).
- (E, optional) GitHub repo archive: sluice-alpha got a final pointer commit + the tag
  sluice-public-handoff-v25.2 (it is NOT deleted). If you also want GitHub to mark it read-only,
  flip "Archive this repository" in its Settings (reversible). I left this to you since it is your
  account's call, not strictly required by the brief.
- (B, optional) The about-page river has the 253 post-split game commits. If you want the FULL game
  history shown (773 more pre-split commits), they are in ~/portfolio-01-full-history.bundle; say the
  word and a follow-up can extract + merge them too. Sluice is already the top topic without them.

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
- (E) PHASE E DONE: game consolidated into Portfolio_01 root (js/sluice/ + bundle + wgpu/audio +
  build-sluice.sh + assets/music,sfx,shop + moon.jpg + docs/game/). Worked in a worktree off
  origin/main (local main is a stale shared checkout); pushed origin HEAD:main = LIVE on Pages
  (verified: grand-motherload.html loads js/sluice.js, 2.95MB bundle + music serve 200). Stale
  v15.89 liquid/smoke-wgpu overwritten; dead 1.4M grand-motherload.js + a junk double-nested
  assets/shop/shop/ removed. AGENTS.md rewritten (site vs game routing, flag-disabled note);
  docs/game/GAME.md is the game quick-start; voice-lint exempts docs/game/*. sluice-alpha ARCHIVED
  (pointer commit f5e8d8e + tag sluice-public-handoff-v25.2; NOT deleted). Memory: new authoritative
  entry project_sluice_consolidated (full prune of stale game memory is Phase I).
- (F) PHASE F DONE (folded into the grand-motherload.html rewrite): free-forever copy (no Steam /
  private / last-build, no em dashes); the old Steam ticker is gone entirely (the message lives in
  the about copy); responsive embed fills the viewport (height min(88dvh, calc(100dvh - header))).
  Verified headless desktop 1280 + mobile 380: game fills viewport, NO horizontal scroll, HUD/
  console/d-pad not clipped, 0 console errors, flight toggle = Rotation+VTOL (no Today).
- (G) PHASE G DONE: 16 game labs brought into Portfolio_01 root (art/audio/autosell/commodity/
  death/depot/economy/endcap/item-map/mine/nmz-banner/station/sunset/sluice-lab + sfx-prompts/
  sfx-test). New labs.html chooser (grouped Sound/Art/Feel/Systems, disabled-system labs flagged,
  0 errors). "Labs" button added atop grand-motherload.html. SFX send-to-prod: new sfx-publish.html
  REUSES js/blog-edit-core.js (AES-256-GCM/PBKDF2-600k unlock + ghCommit binary base64 to
  assets/sfx/). Crypto self-tested PASS in Node AND in-page (encrypt/decrypt roundtrip + wrong-pw
  reject + binary b64), NO real prod commit. DEMOS updated (labs/sfx pages). SFX_INSTRUCTIONS.md
  written (root). Reuses the existing editor key (PAT scope: Contents Read+write on Portfolio_01).
- (H) PHASE H DONE: merged the game's REAL dev history into the about page. Added the 253 accessible
  sluice-alpha commits (v24.13->v25.2, real churn +203,837/-46,987) into js/git-history-data.js under
  topic 'sluice' (now 256 -> the LARGEST topic in the river; total 1120 commits, +336,160 lines).
  Data-file header note: game commits intentionally re-included, do NOT regenerate, full pre-split
  history (773 more game commits) is in portfolio-01-archive + ~/portfolio-01-full-history.bundle.
  Token figures are REAL ccusage (this machine: 15.58B / $15.36k / peak 1.54B which matches the
  baked 1.54B exactly); the 18.1B/$17k headline is a real multi-machine blend that ALREADY includes
  the game dev (it was all built with Claude), so the stat label now credits "the site and the game"
  (no fabrication). Verified: about.html river renders, Sluice top of legend (256), 0 console errors.
- (I) PHASE I DONE: docs/game/GAME.md is the future-session quick-start (ACTIVE vs DISABLED systems
  map, the fragments that matter, curated gm levers + dev hotkeys, build + verify recipe). Pruned the
  project memory: deleted 3 now-WRONG game-workflow entries (parallel-workdir / steam-rename / alpha-
  split, all superseded by the new project_sluice_consolidated entry), fixed the webgpu + site-deploy
  entries, shortened over-long index hooks; MEMORY.md back UNDER its size limit. This final report +
  the playtest checklist above are the wrap.
