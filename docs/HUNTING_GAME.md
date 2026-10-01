# Hunting Game

The first browser version of `/Users/ethan/hunting-game`, the owner's 2D Unity
prototype. The source project was reviewed at commit `0ef16c9` (2026-09-01).
The Unity project stays intact. This version is ordinary JavaScript served from
`hunting-game.html`, listed beside All Four Wheels on In Progress.

## Sources

- `hunting-game.html`: game shell, briefing, controls, and short post.
- `hunting-game.css`: site-colored shell, mobile layouts, and fullscreen.
- `js/hunting-physics.js`: tuning, analytic ballistics, deer behavior, ammo, and recovery.
- `js/hunting-view.js`: pixel renderer, asset loading, alpha mask, and scope camera.
- `js/hunting-game.js`: fixed-step loop, input, UI, synthesized sound, and pause state.
- `assets/hunting/*.png`: the original exported sprites.
- `assets/hunting/source/*.aseprite`: editable sources copied from the Unity project.
- `tools/export-hunting-art.mjs`: repeatable export using the installed Aseprite CLI.

No Unity player, game engine dependency, Sluice code, or bundle step. The only
external request on the page is the site's existing analytics. Fonts are the
site's three self-hosted faces. Asset load errors keep a usable reload prompt.
CSS, scripts, and sprite requests have version query strings. Bump those when
changing a deployed file.

## What was carried over

Read the Unity `README.md`, `Tuning.cs`, `Game.cs`, `Hunter.cs`, `Bullet.cs`,
`Deer.cs`, `Art.cs`, and `AsepriteSetup.cs` before porting. The main mechanic
is ground position plus height, with a visible slow bullet. Its landing time
is solved from the aim point, so aiming beyond an animal raises the bullet's
height at the animal's depth plane. Wind adds sideways acceleration during the
flight. A is left, D is right, R reloads, right mouse holds the scope, and F
fast-forwards eight times. The magazine holds five rounds and reload takes
1.1 seconds. The stand, movement bounds, deer speeds, three living deer limit,
and six-second spawn interval use the original tuning.

The current source values take precedence over older README comments:
`VitalsCenter` is 0.40 from the nose and 0.45 up from the hooves, rather than
the README's old 0.25. The original art faces right. In unmirrored PNG space,
the vital center is therefore u = 0.60, v = 0.45, with radius 0.10 in
normalized sprite coordinates. That circle appears as an ellipse in pixels.

Sprites are exported with transparent margins trimmed, matching Unity's local
artwork pivot rather than the Aseprite canvas bounds. The deer is 24 by 19
pixels. The hunter was still an ASCII placeholder in `Art.cs`; its original
rows and palette were rendered to PNG and saved as an editable Aseprite file.
All art pixels are retained. Grass and bushes stay behind animals, as in Unity.

## Shooting and simulation

World units match Unity: x right, y farther into the clearing, height above the
ground. One unit is 16 pixels. The full field is a 320 by 180 canvas. The
crosshair is a ground-plane landing point in still air. The renderer adds
height to the bullet's screen position so its flight is visible from above.

At launch, duration = range / muzzleSpeed. Vertical launch velocity is
`(0.5 * gravity * duration^2 - standHeight) / duration`. Position is evaluated
analytically from age, including `0.5 * wind * windStrength * age^2` sideways
drift. The simulation advances in 1/120-second steps. Resolve a shot at the
crossing of the deer's moving depth plane, interpolate its lateral position,
then read the alpha of that actual mirrored sprite pixel. Transparent pixels
let the round continue. Candidates in one step are resolved in crossing order.

A vital hit flees for 0.7 to 1.8 seconds, then counts as recovered. An outside
hit wounds the animal; it runs toward the trees and can receive a follow-up.
An unrecovered wounded escape is reported. Living deer alone count toward the
spawn limit, and downed deer disappear after 12 seconds. This repairs the Unity
prototype's three-recovery spawn lock. Vital-hit recovery timers finish even
when the deer has run beyond the visible frame.

The MVP keeps the original open-ended practice loop. It has no invented levels,
shop, timer, or hunting campaign. A fresh outing resets all state. Records
are not persisted. This is a deliberately simplified game model.

## Browser controls

The optional guide starts on: vital ellipses, predicted visible arc, and
wind-adjusted landing square. It does not move the aim or modify ballistics.
G toggles it. Q toggles the 2x scope; right mouse raises it while held. The
scope camera centers on the aim at activation, with field-edge clamping, then
holds still until lowered. Pointer coordinates use its inverse projection.

Touch dragging only aims. A separate Fire button shoots, avoiding accidental
shots during dragging. Scope and reload have buttons. A/D buttons and Wait
use pointer capture and release on pointer-up, cancel, or lost capture. Keyboard
shortcuts apply only while focus is inside the game, so page navigation retains
its normal keys. P or Escape pauses. Losing focus, hiding the tab, or scrolling
the game out of view pauses it. No simulation time passes in a briefing or
pause, and all held inputs clear on phase changes.

Sound starts off and is synthesized only after enabling it. Fullscreen uses
the browser API where available and a fixed-position page fallback otherwise.
The pixel canvas keeps its aspect ratio at every viewport size. Mobile
controls keep 44-pixel touch targets, and the briefing can scroll on short
screens.

## Checks

Use the bundled Node package directory for the test dependencies (`pngjs` and
`playwright`); the deployed game does not require them.

```sh
node --check js/hunting-physics.js
node --check js/hunting-view.js
node --check js/hunting-game.js
NODE_PATH=/path/to/node_modules node tools/test-hunting-game.cjs
NODE_PATH=/path/to/node_modules node tools/test-hunting-browser.cjs
```

The simulation checks use the actual PNG alpha mask: precise landing, wind
drift and compensation, both deer orientations, vital recovery, transparent
leg gaps, wounded escapes, reload, stand bounds, ongoing spawning, and fixed
steps. Browser checks cover real clicks and touch shots, scope, guide, keyboard
input, pause, reset, fast-forward, fullscreen, focus loss, asset loading, and
desktop/mobile layouts. Browser helpers are injected only by the QA server;
the public scripts expose no test-state hooks.

The browser harness owns a Chrome for Testing child through
`/Users/ethan/.local/bin/agent-chrome-for-testing` and closes it in `finally`.
Never launch the owner's personal Chrome with headless or debugging flags.
Screenshots default to `/tmp/hunting-game-qa`. The card thumbnail comes from the
game's real rendered canvas, with nearest-neighbor enlargement.
