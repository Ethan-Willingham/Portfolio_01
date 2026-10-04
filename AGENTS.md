# AGENTS.md - Portfolio site (public)

This is the **public** portfolio site, served from GitHub Pages on every push to `main`.
`CLAUDE.md` imports this file via `@AGENTS.md`, so the same doc serves every AI assistant.

---

## The Sluice game lives here now (free forever, public)

The 2D mining game **Sluice** is developed in THIS repo again (consolidated back on
2026-06-19) and is **free forever, public, and playable on the site** at
`grand-motherload.html`. The old "closed-source, frozen v15.2 demo, coming to Steam"
plan is dead. The private `sluice-alpha` repo is archived (read-only pointer).

**Where the game lives (all at the repo root):**
- `grand-motherload.html` - the post that hosts the playable game (URL kept for stability).
- `js/sluice/NNN-*.js` - the editable game source (one IIFE split into ordered fragments).
- `js/sluice.js` - the assembled bundle (GENERATED; never hand-edit it).
- `build-sluice.sh` - concatenates the fragments into `js/sluice.js`.
- `js/liquid-wgpu.js`, `js/smoke-wgpu.js`, `js/jello-wgpu.js`, `js/audio.js` - the WebGPU
  water/oil + smoke + jello ports and the Web Audio engine.
- `assets/music/` (in-game music), `assets/sfx/` (sound effects, drop-in), `assets/shop/`
  (shop art), `assets/images/moon.jpg` (night sky).
- `docs/game/` - the game's design docs (its own AGENTS, the art/audio/economy bibles,
  BALANCE.md, TUNING.md, etc.), namespaced so they do not collide with the site's own
  AGENTS/CANON/STYLE/VOICE. **Read `docs/game/GAME.md` first for any game work.**

**Build step (every game change):** bump `GAME_VERSION` in `js/sluice/000-head.js`, edit the
fragment(s) in `js/sluice/`, run `./build-sluice.sh`, then commit the fragment(s), the rebuilt
`js/sluice.js`, AND `grand-motherload.html` (the build stamps its game script tags with
`?v=<GAME_VERSION>` so a deployed fix is never masked by a stale browser/CDN cache).
Verify with `node --check js/sluice.js` plus a browser/headless boot.

**Site work vs game work:** site = the posts/pages + `style.css` + the non-sluice `js/` scripts
(read this file + STYLE/VOICE/CANON). Game = `js/sluice/` + `grand-motherload.html` + the files
above (read `docs/game/GAME.md`). They share `style.css` (the game shell reuses the `--d-*`
panel tokens) and the three fonts; otherwise they do not overlap.

**Sluice mobile policy (owner instruction, 2026-10-01): landscape only.** Develop
and verify every mobile game view for landscape, including touch controls, shops,
menus, the bathhouse and browser-toolbar height changes. Portrait shows the rotate
screen and freezes gameplay and held input until the device returns to landscape.
Keep manual pause separate so rotating never resumes a deliberately paused game.
Loading may continue behind the rotate screen. Test portrait only to verify this
gate; do not build or maintain active portrait gameplay layouts unless the owner
explicitly changes this policy. Narrow or tall desktop windows remain supported.

**Sluice mobile presentation (owner instruction, 2026-10-01): match desktop.**
Use the same scene composition, controls, trays and menus on landscape mobile
and desktop at the same viewport size. Adapt spacing and scale to the viewport,
with touch targets at least 44px, rather than introducing mobile tabs or a
different arrangement. The bathhouse keeps its integrated tub above the furnace
and its tools beside the firebox on every active device.

> **The game is a deliberately SIMPLE single-town mining sandbox.** Multi-town world, combat +
> the rig auto-turret, No Man's Zone obstacle courses, the cross-town Trade Board, underground
> oil, and ore refinement are **intentionally disabled** behind a central feature-flag block
> (`js/sluice/010-constants.js`). They are NOT bugs and NOT missing
> features; do not re-enable a flag without asking the owner. Each can be spot-checked per
> page-load with a URL param (e.g. `?multitown=1`, `?combat=1`); see the flag block.
> (The **bathhouse** is enabled by default since v28.5, by owner request.
> Pause > Options > Banya remains a persisted switch; `?bath=0` disables it
> for testing and `?bath=1` enables it. Sky slimes visit, wait, soak, pay, and leave.
> Physical coal chunks fuel the boiler; flint and a forged steel striker light it.
> Spilled bath water is permanently lost on the floor. Guest recipes are undecided. See
> `docs/game/BATHHOUSE_SERVICE.md`. Outdoor pearl gardens have been removed.)
> (Jello/slime soft bodies are **LIVE** for surface residents and bathhouse slimes.
> Pond-bank glass slimes and buried slimes were removed in v28.58, including from
> existing saves. Keep `ENABLE_JELLO = true` for the remaining soft bodies. The
> v26.69 slime-NPC brains (`js/sluice/345-slime-npc.js`: wander/hop/startle + swim
> states) are PARKED OFF since v26.73 by owner call, shipped but disabled; enable per
> boot with `?npc=1` or live with gm `slime.NPC`.)

---

## What lives here

**All Four Wheels**, a separate shopping-cart game in progress, lives in
`four-wheels.html`, `four-wheels.css`, and `js/four-wheels*.js`. Its editable sources
are ordinary scripts, with no bundle step and no Sluice dependencies. Read
`docs/FOUR_WHEELS.md` for the handling model and checks. Keep this post on
`archive.html` (In Progress). Bump the `?v=` values on its CSS and game scripts
when changing them so deployed edits bypass stale caches.

**Hunting Game**, the JavaScript port of the owner's Unity hunting prototype,
lives in `hunting-game.html`, `hunting-game.css`, and `js/hunting-*.js`.
Read `docs/HUNTING_GAME.md` for the ballistics, art, and checks.
**For every hunting visual task, also read `docs/hunting-style/README.md` and use
its painting catalog and reference-packet workflow. The owner directed the entire
game's style, including every map, animal and UI state, to follow the 14 paintings
on `gallery.html` (2026-10-03). Historical pixel art is not the target for new art.
The next scenery task is prepared in `docs/hunting-style/FIRST_MAP.md`.** Its original
pixel art and editable Aseprite sources live in `assets/hunting/`. The current
deer art uses `deer-[1-5]-v4.png`, with boar in `boar-v3.png`. Generated masters
and prompts live in `source-v2/`, `source-v3/` and `source-v4/`; see `docs/HUNTING_ART.md` and
`tools/build-hunting-art.cjs`. The owner's design is a simple fixed lookout over
a huge field. Holding fast-forward visibly moves the sun; wildlife arrivals
briefly ease the speed, then can pass if the player keeps holding. First click
raises the scope, second click fires a visible round with gravity and wind.
Owls and squirrels add ambient movement. Keep the active interface to watching,
time and shooting; do not restore camp planning, shops or tracking dialogs.
`js/hunting-campaign.js` retains the clock, deer progression, recoveries and
compatible local save. Birch Clearing and Cypress Edge are playable areas. Keep this
post beside All Four Wheels on `archive.html` (In Progress). It has no Unity
runtime, Sluice dependencies, or bundle step. Bump its CSS and script `?v=`
values when changing them.

The portfolio pages and their assets (~50 live posts now; this lists the structure,
not every page):

- `index.html` holds standalone homepage posts and site search, ordered newest
  first by their original publication dates. The former Career posts and
  `the-other-side.html` appear individually. Their GitHub creation commits and
  America/Chicago dates live in `tools/homepage-posts.json`.
- `archive.html` (In Progress) also lists the reading collections:
  `religion.html`, `philosophy.html`, `inner-life.html`, and `staying-alive.html`.
  Longform and Career category pages are retired; their old URLs redirect.
  A post is either a homepage card or a collection member, never both.
- Demo/visualization posts: `gallery.html`, `particle-life.html`, `particles.html`,
  `daylight-globe.html`, `optional-body.html`, `random-galaxy.html`, `ocean.html`, and
  `grand-motherload.html` (the playable **Sluice** game; see the game section above).
- `about.html` is the site's meta page (how it's made, and what it's
  made of); it absorbed the former `colophon.html` and `git-history.html` posts
  and is powered by the `js/git-history*` and `js/git-attribution*` scripts.
- `archive.html` + `archive/<slug>/` hold shelved posts (see Archiving below), and
  `labs.html` indexes the throwaway `*-lab.html` choosers that were kept.
- Shared: `style.css`, the site scripts in `js/` (`main.js`, `globe.js`, `particle-life.js`,
  `particles.js`, `git-history*.js`, `git-attribution*.js`, `optional-body.js`, `random-galaxy.js`, `backtotop.js`),
  and `assets/` (fonts, images, thumbs, etc.).

## Conventions

- Static HTML/CSS/JS, served as-is. To test, open the relevant `.html` in a browser.
- Site pages use the three self-hosted typefaces (Century Supra, Segoe UI, Commit Mono);
  keep new text on one of those and avoid font CDNs. (The Sluice game shares these three fonts;
  its canvas HUD uses Commit Mono.)
- Color: the whole site runs on one warm, OKLCH-tuned palette on a locked dark-green background (`--bg: #303931`). **Read `STYLE.md` before adding or changing any color, type, or component** (it folds in the old PALETTE.md and documents the component kit in `kit.css`). The source of truth is the `:root` block in `style.css`; prefer `var(--token)` over a raw hex. Never recolor photographs, `--img-bg` mattes, `@media print` blocks, or the `best-photographs` gallery.
- Prose: every post is written in one calibrated voice. **Read `VOICE.md` before writing or editing post prose** (the Warm base voice, the calibration passages pulled verbatim from live posts, how to open a post and how to deliver a fact, the generic-sentence test and the symptoms-of-empty-writing table, and the credibility rules that keep posts off the wrong end of a Hacker News thread). It was calibrated with the owner via `voice-lab.html`; the no-em-dash rule below is part of it.
- Archiving: moving a finished post off the homepage into `/archive` (owner's curation call) is a multi-step checklist that is easy to half-do. **Read `ARCHIVING.md` before archiving or un-archiving any post** (move the page, move its thumbs, fix shared paths to absolute, fix the `og:`/`twitter:` tags to the archive URL, add the banner, bump the counter, drop the homepage card, add the card to `archive.html`, rebuild the search index, regenerate the sitemap, refresh the About-page attribution tile).
- Sitemap: `sitemap.xml` is generated (`node tools/build-sitemap.mjs`, lastmod from git). Regenerate and commit it whenever a page is added, archived, or removed. `robots.txt` points crawlers at it.
- Images: every photographic `<img>` is served as WebP through a `<picture>` wrapper with a JPG/PNG fallback (about 55% smaller, no visible quality loss). After adding or changing any post image, run `node tools/build-webp.mjs` (writes a `.webp` sibling for every raster the HTML references, q82 photos / lossless small PNGs) then `node tools/wrap-picture.mjs` (wraps bare `<img>` in `<picture>`); both are idempotent, driven by real references, and skip the `*-lab.html` choosers. Keep the first above-the-fold image `loading="eager"` and the rest `loading="lazy"`.
- Commit and push every change to `main`; GitHub Pages auto-deploys. No manual deploy step.
- No em dashes in any content or commit messages (use commas, periods, parentheses, or "to").
- No emojis anywhere: posts, UI copy, commit messages, docs. This is an owner rule and it
  applies to every AI assistant working in this repo (Claude, ChatGPT/Codex, all of them).
  The only sanctioned pictographs are three long-standing text glyphs already in the site
  (the checkmark, star, and pickaxe); do not add new ones.
- A git pre-commit linter (`tools/voice-lint.sh`, wired via `tools/githooks/`) hard-blocks em dashes, emojis, and the formulaic empty-writing tells listed in `VOICE.md` from any staged `.html`/`.md` post content. Enable it once per checkout with `git config core.hooksPath tools/githooks`. It skips the frozen game demo, the throwaway `*-lab.html` choosers, and the meta-docs; bypass in a real exception with `git commit --no-verify`.
