# Hunting Game

The browser version of `/Users/ethan/hunting-game`, the owner's 2D Unity
prototype. The Unity source was reviewed at commit `0ef16c9` (2026-09-01) and
stays intact. This game is ordinary JavaScript served from `hunting-game.html`,
listed beside All Four Wheels on In Progress.

The owner clarified the design on 2026-10-02: a simple lookout game about
watching a huge field, rushing the sun across the sky, and catching a brief
animal opportunity before it passes. Version 5 replaces the camp planner,
shop, walking, stand interaction and tracking screens with that direct loop.
The current art is generated pixel art and can accept owner-drawn replacements.

## Sources

- `hunting-game.html`: field, compact controls, pause and optional settings.
- `hunting-game.css`: site-colored shell, phone layouts and fullscreen.
- `js/hunting-campaign.js`: clock, deer progression, record data and legacy save.
- `js/hunting-physics.js`: ballistics, finite visits, animal behavior and pixel hits.
- `js/hunting-view.js`: distant-field renderer, moving sun, scope and projection.
- `js/hunting-game.js`: fixed-step loop, input, UI, saving, sound and time pacing.
- `assets/hunting/*-v2.png`: original birch meadow and hunter art.
- `assets/hunting/*-v3.png`: cypress field, boar, dog and tracking illustration.
- `assets/hunting/deer-[1-5]-v4.png`: five four-legged whitetail buck sprites.
- `assets/hunting/source-v2/`, `source-v3/`, `source-v4/`: masters and full prompts.
- `tools/build-hunting-art.cjs`: repeatable asset normalization, requires Sharp.
- `assets/hunting/source/*.aseprite`: original Unity art, retained as history.
- `tools/export-hunting-art.mjs`: legacy Aseprite export.

No Unity runtime, game engine package, Sluice dependencies or bundle step.
The public page uses the site's three self-hosted fonts and existing analytics.
Artwork load failures keep a usable reload prompt. Bump the page's CSS and
script version queries when changing deployed files.

## The loop

Loading goes straight into the field. The player remains at a raised lookout,
looking over foreground grass, distant hills and the tree line. Animals have
real depth: a far deer looks small in the wide view and becomes readable
through the scope. There is no walking or preparation required before a shot.

Hold Fast forward, F or Space to move the day along. The sun travels visibly
across the sky from the same clock used by the simulation and saved time.
Dawn, daylight, dusk and night change the light. The clock can continue through
the night into the next day without a camp screen or departure gate.

A newly arriving animal gives a 2.4-second real-time easing window while
fast-forward is held. It reduces both clock and animal speed without stopping
either. The window expires even if the player keeps holding the button, and
the same animal does not keep extending it. Release fast-forward to watch at
normal speed. Continuing to rush time can carry an animal out of the field.
Each visit has a finite life; animals do not wait indefinitely for the player.

Owls and squirrels add movement to the scene alongside deer and boar. They
have distinct behavior and silhouettes. Ambient wildlife does not create an
automatic pause or an endless slow-time window.

The first primary click raises the scope around that point. The sight starts
at the lens center, on the animal you clicked. Move the mouse to aim; small
corrections keep the view steady, while moving the sight toward the lens edge
smoothly pans farther across the field. Return toward the center to stop,
then click again to fire. Scope and Aim / Fire offer the
same two-step action on touchscreens. Raising a scope slows rushed time to
normal time so the player can aim; it does not pause wildlife. A shot keeps
the scope raised while the projectile flies, with a wide flight inset, then
lowers the scope shortly after the round finishes.

Rounds are visible in flight, with a trail, gravity and sideways wind. Flight
runs at a readable pace while the game clock stays at normal speed. The flight
inset reports range in yards and drift in inches. A clean
hit finishes a brief recovery run and saves the animal to the field record.
Wounds and misses remain visible in the field without a tracking interstitial.
The rifle keeps five-round magazines and a short reload.

## Deer and records

Birch deer keep the five distinct coats, racks and silhouettes from version 4.
Only recovered deer count toward a new deer level. Records retain their
original species, level and art. Historical deer in old saves are level 1;
their recoveries still contribute to the unlock count.

| Level | Deer | Deer recoveries to unlock | Weight range |
|---|---|---|---|
| 1 | Young buck | 0 | 110 to 140 lb |
| 2 | Woodland buck | 2 | 140 to 180 lb |
| 3 | Ridge buck | 5 | 180 to 220 lb |
| 4 | Old monarch | 9 | 220 to 260 lb |
| 5 | Crowned stag | 14 | 260 to 300 lb |

The More panel contains optional field choices, settings and records. It
pauses the field while open and returns directly to the same lookout. Field
choices stay disabled until an in-flight round or clean recovery finishes,
so a change cannot discard a pending recovery. The
previous economy, equipment and tracking data remain in compatible saves;
the active game no longer requires those menus to hunt.

Weights and record tiers are game tuning, not a wildlife scoring standard.
The game does not model real hunting, market prices or species biology.

## Ballistics and projection

The lookout uses world x across the field, world y as depth and h as height.
The eye and muzzle are 12 world units above the ground. The base canvas is
640 by 360, with a focal length of 300 and horizon at y = 144. Projection is:

```text
screen.x = 320 + 300 * x / depth
screen.y = 144 + 300 * (12 - h) / depth
```

Scope magnification is 6x around the selected sight. Pointer input uses the
inverse of the same projection and resolves to a sight ray at depth 100.
Mouse movement is relative to the pointer position at zoom, with the reticle
serving as the scoped cursor. Zoom and canvas re-entry never jump the sight
to the old physical cursor location. The inner 38 percent of the aiming
radius is a steady area for fine corrections. Outside it, a smoothstep curve
reaches full pan speed at 88 percent of the radius, with a 0.12-second
exponential ease into motion. Maximum speed is 240 scoped pixels per second;
diagonal travel has the same speed. Returning to the steady area, leaving
the canvas or releasing a touch stops immediately without inertia. A short
gold arc on the lens rim shows the direction and strength of motion.

The scope stays within the wide view. The sight ray updates from the current
reticle and camera on every pan step, so shots follow the visible reticle.
Rendering and collisions use each animal's own physical size and sprite.
The renderer draws the scene at the final magnified scale, so scoped animals
retain their source detail instead of enlarging an already tiny field image.

The rifle launches along the sight ray. Vertical position follows
`h = muzzleHeight + verticalVelocity * age - 0.5 * gravity * age^2`.
Sideways displacement includes `0.5 * wind * windStrength * age^2`. Raising
the crosshair compensates for drop, and aiming against the wind compensates
for drift. The internal diagnostic guide uses the same launch and position
calculations as the actual projectile; the playable controls keep it hidden.

The simulation advances in 1/120-second steps. Candidate animals are checked
in crossing order, and their positions are interpolated at the crossing. Hit
detection reads the animal's correctly mirrored PNG alpha. A transparent
pixel lets the round continue. The vital center is u = 0.67, v = 0.45 with
normalized radius 0.10 for deer and boar.

The five right-facing deer are 56 by 56, 60 by 57, 64 by 59, 70 by 63 and
76 by 75; boar is 64 by 42. Runtime sprites have binary alpha, matching
visible boundaries to collision boundaries. Source alpha remains intact.
Downed animals fade after 12 seconds, and blood marks are bounded. Existing
animal art is single-frame; owls and squirrels use procedural canvas shapes.
See `HUNTING_ART.md` for asset history.

## Controls and saves

Keyboard input is scoped to the game and ignores text and select inputs.
F and Space hold fast-forward. Q or right-click toggles the scope, R reloads,
and P or Escape pauses. Mouse movement controls both the sight and scope.
Scope movement stops on canvas exit, pause, focus loss, viewport changes or
lowering the scope, and is locked while a round is in flight. The visible
controls cover time, scope activation, shooting and pause without requiring
a keyboard.

Touch aim uses pointer capture and dragging, with the same steady center and
edge panning. Releasing the touch immediately stops panning. Aim / Fire raises
the scope on its first activation and fires on the next. Hold controls clear on release,
cancel and lost capture. Pausing, opening More, losing focus, hiding the tab
or scrolling the game out of view also clears held input and stops time.
The pause and More overlays maintain keyboard focus within their controls.

Sound starts off and is synthesized after enabling it. Fullscreen uses the
native API where available and a page fallback otherwise. Phone portrait
and landscape retain the same field and actions, with 44-pixel touch targets.
The Sluice-only landscape gate does not apply to Hunting Game.

Local storage key: `hunting-camp-v1`, schema version 1. The compatible save
retains the clock, region, selected deer level, records and prior economy
data. A reload begins in the lookout at the saved time. It does not resume
a live bullet or preserve an animal's field position. Storage errors leave
the game playable and show the save limitation inline. No account, server
save, offline time jump or cloud sync.

## Checks

Use bundled Node packages (`pngjs`, `playwright`, `sharp` for rebuilding art).
The deployed game needs none of those dependencies.

```sh
node --check js/hunting-campaign.js
node --check js/hunting-physics.js
node --check js/hunting-view.js
node --check js/hunting-game.js
node tools/test-hunting-campaign.cjs
NODE_PATH=/path/to/node_modules node tools/test-hunting-game.cjs
NODE_PATH=/path/to/node_modules node tools/test-hunting-browser.cjs
```

Campaign checks cover save compatibility, deer unlocks and retained historical
economy behavior. Physics checks use real sprite alpha for both orientations,
all five levels, opaque vitals, transparent gaps, wind and visible gravity.
Lookout checks cover bounded visits, arrival events, ambient wildlife and
finite time easing.

Browser checks verify immediate field entry, sun movement, finite arrival
easing, opportunities that can pass, real two-click scope shots, inverse
projection, mouse scope movement and shot alignment, a steady aiming center,
soft acceleration, diagonal speed, zoom and re-entry continuity, scope lens
bounds, touch aiming and pan release, pause, focus loss, held-input
cleanup after a focus change, stalled frames, pending recoveries, fullscreen,
records and reload. Closing More offscreen keeps the field paused. The checks
also inspect desktop, portrait, narrow-phone and
landscape layouts for overflow and usable controls.

The local QA server inserts inspection helpers at `TEST_HOOKS`; public scripts
expose no test-state API. The harness owns a Chrome for Testing process through
`/Users/ethan/.local/bin/agent-chrome-for-testing`, closes it in `finally`, and
writes screenshots to `/tmp/hunting-game-v7-qa`. Never launch the owner's
personal Chrome with headless or debugging flags.
