# Hunting Game

The browser version of `/Users/ethan/hunting-game`, the owner's 2D Unity
prototype. The Unity source was reviewed at commit `0ef16c9` (2026-09-01) and
stays intact. This game is ordinary JavaScript served from `hunting-game.html`,
listed beside All Four Wheels on In Progress.

The owner supplied the original design prompt on 2026-09-30. Version 3 adds a
complete camp-to-field loop around the original visible bullet mechanic.
Keep developing the JavaScript version in this repo. The current art is
generated pixel art and can accept owner-drawn replacements later.

## Sources

- `hunting-game.html`: camp, field, tracking dialog, controls, and short post.
- `hunting-game.css`: site-colored shell, camp panels, phone layouts, fullscreen.
- `js/hunting-campaign.js`: clock, inventory, progression, tracking and save data.
- `js/hunting-physics.js`: ballistics, movement, animal behavior and pixel hits.
- `js/hunting-view.js`: renderer, asset loading, species masks and scope camera.
- `js/hunting-game.js`: fixed-step loop, input, UI, saving, sound and phase changes.
- `assets/hunting/*-v2.png`: birch meadow, deer and hunter.
- `assets/hunting/*-v3.png`: cypress field, boar, dog and tracking illustration.
- `assets/hunting/source-v2/`, `source-v3/`: generated masters and full prompts.
- `tools/build-hunting-art.cjs`: repeatable asset normalization, requires Sharp.
- `assets/hunting/source/*.aseprite`: original Unity art, retained as history.
- `tools/export-hunting-art.mjs`: legacy Aseprite export.

No Unity runtime, game engine package, Sluice dependencies or bundle step.
The public page uses the site's three self-hosted fonts and its existing
analytics. Artwork load failures keep a usable reload prompt. Bump the page's
CSS and script version queries when changing deployed files.

## The loop

Camp begins at 05:30 on day 1, with 160 credits and a field rifle. Camp has
Plan an outing, Outfitter, and Pack & trophies tabs. The clock supports pause,
real time, 60x and 300x. Wait until jumps to the next occurrence of a selected
hour, including tomorrow if that hour has passed. Dawn and dusk increase
animal activity. The game clock advances only while the visible tab is active.

Embarking and returning each use ten minutes. Departure is blocked if the
field would be dark on arrival. An outing returns automatically at 20:00.
Field Wait uses 8x animal simulation and 300x clock speed, with the hunter
standing still. This keeps fast wait smooth without integrating 300 physics
steps per rendered frame. Normal field time is real time.

The hunter enters the bottom left on foot. WASD, arrow keys, or four touch
buttons move across the open ground. Walking too close to an animal startles
it. E or Climb stand works within 1.4 world units of the stand at bottom center.
Mounted movement stays on the deck; Leave stand returns to the path. Ground
shots launch from a lower height than stand shots. Scope, aim guide, reload,
visible bullets, sideways wind and five-round magazines work in either state.

Clean hits finish a short recovery run and add an animal to the pack. A wound
can be followed up, or leave a blood trail into the trees. Escaped wounds add
an unfinished trail. A wounded animal still in the clearing when leaving also
adds a trail. Returning finishes rounds already in flight and clean-hit timers,
so pressing Return does not lose a recovery that is about to complete.

Searching uses the illustrated trail screen for a short presentation. A
search consumes 20 game minutes, or 12 with Bracken. Each trail gets one attempt.
The outcome is reserved and saved before the presentation starts, preventing
a reload from rolling the same trail again. Old trails have lower odds and
recover lower-value animals. The result allows returning to camp or continuing
the same outing. Searching also works from camp after the hunt.

Selling a packed animal pays its current value and retains the field record.
Keeping a trophy removes it from the sellable pack without paying credits.
Sold and kept animals remain in the collection. Record weight and bronze,
silver or gold tier derive from a seeded game score, not a wildlife scoring
standard. Time lowers packed sale value too, to a floor of 40 percent freshness.
Records and unfinished trails are retained across outings.

## Progression

- Birch Clearing: whitetail bucks, open birch and spruce meadow, initial area.
- Cypress Edge: wild boar, cypress and reed clearing, stronger wind. Unlock needs
  two recoveries and 350 credits. It is a separate playable one-screen map.
- Weighted-round rifle, 400 credits: reduces wind acceleration by 40 percent.
  Both owned rifles can be selected before departure.
- Bracken, 300 credits: higher tracking odds, shorter searches, follows the
  hunter in the field. Bringing him is optional after purchase.
- Field-dressing kit, 100 credits: halves the time penalty on recovery value
  and doubles the packed freshness window.

These are game tuning values. They do not model real hunting, animal welfare,
market prices, or species biology. Duck hunting, exotic regions, a larger
connected world and authored directional animation remain future work.

## Ballistics and art

The Unity mechanic uses ground x/y plus bullet height. One world unit is 32
pixels on the 640 by 360 canvas, preserving the original 20 by 11.25-unit field.
The crosshair marks the still-air landing point. Aim beyond an animal so the
round remains high enough when crossing its depth plane. The renderer adds
height to its screen position so the flight is visible.

At launch, duration = range / muzzleSpeed. Vertical velocity is
`(0.5 * gravity * duration^2 - muzzleHeight) / duration`. Position is analytic,
including `0.5 * wind * windStrength * age^2` sideways drift. Weapon wind
modifiers affect the actual shot and the guide identically. The simulation
advances in 1/120-second steps. Candidates are resolved in crossing order,
including shots travelling toward or away from the top of the screen. Animal
position is interpolated at the crossing, then its mirrored PNG alpha is read.
A transparent pixel lets the round continue.

The right-facing deer is 64 by 48; boar is 64 by 42. Their current vital center
is u = 0.67, v = 0.45 with normalized radius 0.10. The actual opaque shoulder
was checked for both orientations. The ellipse uses the species mask's own
width and height. Source alpha remains intact; runtime sprites have binary
alpha so visible boundaries and collision boundaries match. The first port's
24 by 19 deer and original sources remain as history. See `HUNTING_ART.md`.

Downed animals fade after 12 seconds and do not occupy the three-living-animal
spawn limit. Blood marks are bounded to 120 visible drops per outing. The field
shades with time of day. Current animals are single-frame sprites; the hunter
has a small walking bob. Avoid presenting this as handmade or fully animated art.

## Controls and saves

G toggles the optional guide. Q or held right mouse raises a 2x scope. Its
camera centers on the aim at activation and then holds still; pointer input
uses the inverse projection. Touch must hold and drag to aim; Fire is separate
and touching the field never fires. Movement and Wait use pointer capture,
with release, cancel and lost-capture cleanup. Keyboard input is scoped to the
game and ignores text and select inputs. The tracking dialog traps Tab and
supports Escape when a search is not in progress.

P or Escape pauses the field. Losing focus, hiding the tab or scrolling the
game out of view pauses it too. Held inputs clear on phase changes. Sound
starts off and is synthesized after enabling it. Fullscreen uses the native
API where available and a page fallback otherwise.

Local storage key: `hunting-camp-v1`, schema version 1. Saved data includes
clock, credits, equipment, area unlocks, loadout, records and trail outcomes.
A reload starts at camp. It does not resume a live bullet or preserve a field's
animal positions. Storage errors leave the game playable and show the save
limitation inline. No account, server save, offline time jump or cloud sync.

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

Campaign checks cover overnight time, gate conditions, single-payment sales,
trophies, upgrades, tracking success and failure, delay and preservation,
and save reload. Physics checks use actual species PNG alpha, including
mirrored vital hits, gaps, reverse shots, ground height, wind, bounds, stand
proximity and wound trails. Browser checks follow the full earned loop with
real pointer and touch shots, plus scope, waiting, pause, fullscreen, focus
loss, persisted state and portrait/landscape layouts.

The QA server injects inspection helpers at `TEST_HOOKS`; public scripts expose
no test-state API. The harness owns a Chrome for Testing process through
`/Users/ethan/.local/bin/agent-chrome-for-testing`, closes it in `finally`, and
writes screenshots to `/tmp/hunting-game-v3-qa`. Never launch the owner's
personal Chrome with headless or debugging flags.
