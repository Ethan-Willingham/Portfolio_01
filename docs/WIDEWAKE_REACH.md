# Bracken Reach, the playable world

Owner instruction, 2026-10-19: make the new ocean part of the game, retire the old
world, and bring the graphics into one consistent visual system. This explicitly
supersedes the earlier instruction to keep the new ocean in separate trials.

Version 0.25.2 opens the approved title illustration, then starts at Tern Yard in
Bracken Reach. Continue loads this same world. There is no Earth campaign or
trial chooser in the normal play flow. An old `widewake-estuary.html` bookmark
redirects to the game. `?test` retains the isolated navigation harness; the battle
page remains an engineering benchmark. The owner explicitly requested a public
endgame shortcut; the title and pause menus now launch a new automatic combat
watch in the main shell, separately from that older manual-control harness.

## Current connected loop

The launch starts with 520 coins, eight salt and a 32-unit hold. Sell eight salt
at Reed Landing to earn 350 coins and open Fleet. The shallow landing cannot
berth a trawler: return to Tern Yard to buy one. Grain is a useful return cargo.
A completed Tern Shoal fishing watch opens Shipyard. Lockmill exports timber;
Tern Yard buys it. The Outer Sound oil watch earns access to heavy escorts.

All three ports occupy the actual terrain. Their docked views keep the ocean,
piers and buildings on screen, with a quiet service menu. Trade opens one
order at a time. Locked Fleet and Shipyard areas remain visible with a short
requirement. The log records visited landings and rare catches.

Seven goods have regional prices, a buy/sell spread and bounded market pressure.
Cargo occupies actual vessel holds. Six purchasable support roles, three
flagship hulls, four upgrade tracks, repairs, salvage, fishing and oil production
operate in the same region and save. Watches load the workboats; the player
protects them. The three grounds introduce Glass mullet, Copper pike and Amber
nautilus. A first completed watch at each ground guarantees its discovery.

Routes use the fleet's largest draft and clearance envelope. A launch can use
the Reed cut; bringing deeper boats closes it. Autopilot respects the channel
cruise speed and the slowest surviving boat. Followers advance through the
recorded wake in order, then take checked routes to work stations or harbor berths. A blocked follower
backs away physically before retrying a turn. Boarding the harbor requires the
fleet within its 360 m anchorage. Boats are not teleported through bends.

Raiders approach through water, using the channel graph where a bank blocks
sight. Projectiles cannot shoot across land. A shared conservative navigation
cell cache replaces repeated full-hull probes for every light enemy. Cells are
8 m across; their clearance rectangle includes the largest raider at every
heading and the cell's half-diagonal. The cache is bounded to 65,536 entries.
Open sea has a constant-time clearance path. Friendly hulls retain exact
oriented clearance and pier collision.

Campaign admission is bounded to 2,048 raiders, with progressive watch waves.
The new endgame button starts a 16,384-enemy open-water watch. The older
battle harness also verifies the shared renderer and combat buffers. Neither
is evidence of 16,384 terrain-aware campaign enemies. Larger fronts in constrained waterways need their own measured pass.

## Endgame combat, v0.25

The title and pause menus both have **Endgame combat**, by explicit owner request.
It opens directly into a three-minute workboat defense with 24 armed friendly
boats, 16,384 raiders, five changing fronts, short flanking raids, repair crates
and a result/retry/return flow. The four workboats load actual holds while on
station. E or the fleet button recalls the fleet to follow the flagship, pausing
production, or holds the current position and resumes work when boats arrive.

The endgame loadout is disposable and does not unlock campaign equipment. An
active voyage is saved before entry and retained in memory. The combat mode
never calls the voyage writer. Return restores the same voyage. Reload, title
exit or desktop quit leaves the normal Continue save available. If ownership
moves to another window, the stale retained voyage is discarded. The title art,
layout styling and background remain unchanged apart from the requested button.

Rapid cannons fire short bursts; flak fires pairs; mortars fire staggered salvos
at dense pockets. The flagship automatically releases its gun banks when an
enemy crosses their arc. Shared targeting leads moving boats, divides same-tick
shots between targets, and temporarily reserves impact cells so multiple area
weapons spread their shells. Campaign weapons use the same targeting without
receiving the test loadout's fire rates or free upgrades.

Iron rams have a separate 34 m silhouette. They slow for an 0.8-second wind-up,
show a short dashed lane, then charge along that fixed heading. They cannot
home during the charge. They seek working boats but hit the first friendly hull
in their path. Sparse repair crates heal surviving boats when the flagship
sails within 95 m. They cannot revive a lost boat.

The normal helm, reverse, camera, gamepad and touch controls are reused. There
is no click-to-fire, aiming, or active broadside button. The chart is absent in
this open-water watch. A pennant identifies the flagship without covering it;
workboat hull bars, one watch progress bar and a quiet tally carry the essentials.
No per-enemy names or damage numbers cover the swarm. Only committed ram lanes
receive warnings. Reduced motion suppresses hit tints, recoil and edge flashes.

Simulation buffers are fixed: 32,768 enemy capacity, 8,192 rounds including a
1,024-round hostile reserve, 2,048 effects, 24 wake histories and 16 repair crates.
Enemy admission is capped at 48 per tick. A shared cell grid handles queries;
there is no all-pairs fleet/enemy separation. The new targeting and ram state
bring combat typed arrays to 3,342,848 bytes, independent of kills or elapsed
session time. Effect, audio and notification budgets remain bounded.

The open-water test is deliberately a powerful fleet. Campaign difficulty,
terrain-aware large raids and earned midgame loadouts still need playtesting.
It is not the finished Steam balance or proof of physical-phone performance.

### Reinforcement arrivals, v0.25.4

Owner direction, 2026-10-19: enemies should enter offscreen at the back of the
swarm, with a tighter limit on zooming out. New endgame arrivals, including
flanking raids, start in a 3.2 to 3.68 km outer band behind the initial fronts.
Panning across that band moves admission beyond the visible water along the
same approach. Detached friendly boats also retain 600 m of arrival clearance.
The starting enemy formation is prepared before the scene opens.

Wide is now the furthest zoom for wheel, pinch, gamepad and the named camera
stops. Viewport size sets a 2.5 km maximum distance from camera to corner;
rotation preserves the chosen stop and clamps intermediate scales. Admission
checks the padded isometric viewport and any pending zoom or recenter destination
before each simulation frame. Endgame admission also reserves its widest view.
It keeps the 48-arrivals-per-tick limit and the same fixed combat buffers.

Campaign waves use the same viewport exclusion, join beyond surviving attackers,
and check nearby friendly boats, water clearance, ports and the world boundary.
River approaches use offscreen channel nodes. A wave with no valid approach
admits fewer enemies instead of putting them into visible water. Camera guards
are transient and do not change the save format. Longer approaches reduce the
old replacement rate and give new waves actual travel time.

## Interface contract, v0.23

The owner explicitly rejected generic website panels and asked for a distinctive
game interface that is as quiet and obvious as possible. Preserve the approved
title. The harbor uses a short service list over the world, one visible delivery,
and a clear Cast off action. The delivery opens its destination on the chart.
Locked services show their requirement when selected.

Paper is reserved for harbor decisions and the navigation chart. Dark instruments
belong over the water. Do not add dashboard cards, decorative labels, paragraph
instructions or another persistent status strip. Original chart marks and cargo
illustrations live in `js/widewake-reach-ui.js`. Fleet thumbnails use the actual
boat meshes, cached once per view and heading.

Trade shows one good and one order. Buy and Sell show their unit prices; the
confirmation shows quantity and total. Max uses the exact price curve, available
coins and remaining cargo space when buying, or the amount aboard when selling.
Never let a generic Max value refer to two different orders at once. Transaction
feedback stays in the ledger. No silent order is sent when switching a selection.

Fleet separates owned boats from purchases. Available roles appear as progression
opens them; fittings and replacement hulls are separate views. The pause menu keeps
settings and save files folded until requested. Save errors automatically expose
file actions. Nested help and canceled imports return to their parent menu.

The sailing HUD keeps hull and depth together. Zoom is a labelled control with
Close, Fleet and Wide choices on demand. Wheel, pinch and keyboard camera stops
remain available. Chart and nearby dock/work actions occupy the lower right. All weapons fire
automatically; do not add a manual fire action. The main-world scale lives on the chart, avoiding action overlaps on phones.
Modal decisions hide the inactive HUD, including stale notices behind them.

Use at least 44 px for interactive targets. Preserve the same actions on phones;
compact landscape layouts move contextual actions above the lower row and allow
long fleet and destination lists to scroll. Keep the chart confirmation outside
that scrolling list. Do not restore nearest-neighbor scaling to moving scenery.

## Driving and wakes, v0.24

Friendly hulls use surge, sway and yaw at the existing fixed 60 Hz. Turning the
bow does not rotate its world velocity. Sideways water resistance brings the
trajectory around; engine spool and hull size set response. Cargo adds up to
28 percent inertia without silently changing rated top speed. Releasing the
helm coasts; R, the touch Reverse button, or controller RT applies reverse thrust
and then makes sternway. The shared enemy movement remains lightweight.

The camera's Close stop is measured in CSS pixels per metre, independent of the
viewport shrink used by the scene. Rotation preserves the selected scale. Wheel
and pinch retain their water anchor; stops recenter, and a bounded velocity lead
opens water ahead of the bow. A tiny leader appears above a distant hull only.
There is no hull selection ring or filled marker covering the boat.

A fixed wake history records the stern in world space. It survives turns and
stops, spreads and fades over twelve seconds, and resets on a recovery jump.
Twenty-four 128-point tracks use 61,440 bytes of CPU history. The GPU ribbon has
a fixed 3,120-segment buffer, shared endpoint normals, one instanced draw call,
and reduced sampling at distance. Small bow shoulders share that batch. Canvas
uses the same histories. Raiders do not allocate individual persistent trails.
Context restoration keeps the history and recreates only its GPU resources.

Starter guns and support weapons acquire targets automatically. Larger player
hulls release their rolling bank salvo when a hostile enters a clear broadside
arc; empty water does not consume it. The old isolated battle harness retains
manual firing as an engineering test, not a campaign control.

On departure, each support boat takes a checked approach from its berth to the
captain's recorded path. This prevents a heavy boat cutting across the quay to
reach the first wake point. The approach and engine spool persist in saves;
older version-one saves default the new fields safely.

## Independent fleet handling, v0.25.2

Owner instruction, 2026-10-19: the main ship should move more quickly than its
fleet, and the other captains should feel human instead of mirroring each move.
Manual captain speeds are 20 m/s for the launch, 40 for the patrol boat and
38 for the frigate. The endgame flagship makes 40 m/s. Companion cruise speeds
vary slightly by crew and stay below the captain's speed, including with engine
upgrades. The captain accelerates and turns more promptly while keeping world
momentum, cargo inertia, coasting and reverse thrust.

Open-water crews track individual delayed formation positions and reconsider
their steering at staggered intervals. They accept a small position error after
settling, so every movement does not trigger a formation correction. Workboats
settle inside the production radius. Holding position leaves the captain free
to circle the fleet; recalling them takes actual travel time.

River crews retain the ordered, checked wake path with small spacing differences
and shorter steering intervals. Bank avoidance can interrupt a held decision
immediately. Autopilot retains conservative channel speeds; taking manual control
restores captain speed on that same step. Held crew decisions are validated and
saved with each ship, and older saves default them safely. Crew timing uses ship
identity and simulation ticks, without advancing the combat random stream.

## Graphics contract

One unit is one metre. Decks, piers, doors, railings, trees, weapon mounts and
work equipment use that scale. A six-metre launch is naturally smaller than a
warehouse or a trawler. The default camera keeps at least 40 CSS pixels of projected hull length at
every heading and viewport. Fleet and Wide remain deliberate overview choices.

All nautical and shore models use the same isometric projection, directional
lighting, muted material family, baked color/depth sprites, filtered edges and
mipmaps. Gun mounts now sit on the actual detailed deck and scale to their hull.
Fine material grain and water highlights are quieter. Alder, cypress and willow
crowns have different silhouettes, with visible gaps between branches. Floating salvage uses the same wooden crate materials as the piers. Reeds
root at the bank instead of hovering; vegetation leaves the reed hut clear.

Explosions have a short bright core, irregular smoke and a faint pressure ring.
The splash radius no longer becomes a giant solid block of orange. Canvas
fallback uses matching rounded silhouettes. Preserve the v0.21 continuous
movement, directional blending and display-aware raster budget. Do not reapply
nearest-neighbor scaling to the moving scene.

The title artwork is unchanged. Image generation remains deferred by the owner.
The 24 earlier port prompts are historical material, not a request to generate
Earth-port backgrounds or restore the retired world.

## Source and persistence

- `widewake.html`, `widewake-reach.css`: current shell, ports and quiet ocean HUD.
  `widewake.css` retains the approved title styling.
- `js/widewake-reach-game.js`: pure campaign, market, progression, fleet movement,
  work, terrain-aware combat and validated persistence.
- `js/widewake-reach.js`: title, menus, controls, chart, audio, combat entry and save ownership.
- `js/widewake-combat.js`: disposable endgame watch, loadout, fronts and repair drops.
- `js/widewake-combat-view.js`: fleet camera, flagship pennant, workboat bars and ram lanes.
- `js/widewake-reach-ui.js`: original interface marks, cargo art and vessel previews.
- `js/widewake-estuary-core.js`: authored waterways, field and route clearance.
- `js/widewake-estuary-view.js`, `js/widewake-estuary-worker.js`: bounded terrain,
  background route preparation and region overlays.
- `js/widewake-battle-core.js`, `js/widewake-ocean*.js`: shared combat and graphics.
- `js/widewake-saves.js`: single-writer session and backup store infrastructure.

The previous Earth modules are historical source, unused by the current HTML or
the desktop package. Current checks are the Reach tests below. Old campaign
browser tests describe the retired shell and must not be presented as validation
of this build.

Current storage is `widewake-reach-v1` plus `widewake-reach-backup-v1`. The old
`widewake-save-v1` and `widewake-save-v2` slots remain untouched and exportable
from Settings. Coordinates and economies are too different for an honest
one-to-one migration. An old save is never silently interpreted as a new-world
fleet. New voyage and import require a concrete replacement confirmation when
appropriate. Passive title visits do not write campaign state.

Saves include actual positions, movement, cargo, routes, followers, active work,
RNG state, raiders, projectiles and weapon cooldowns. Corrupt primary saves fall
back to the backup. Quota failure retains the live voyage with an export action.
A second window must hand off ownership before it can write.

## Verification

```sh
node tools/widewake/test-spawns.cjs
node tools/widewake/test-spawns-browser.cjs
node tools/widewake/test-combat.cjs
node tools/widewake/test-combat-browser.cjs
node tools/widewake/test-driving.cjs
node tools/widewake/test-fleet-handling.cjs
node tools/widewake/test-driving-browser.cjs
node tools/widewake/test-reach-game.cjs
node tools/widewake/test-reach-browser.cjs
node tools/widewake/test-reach-ui.cjs
node tools/widewake/test-reach-saves.cjs
node tools/widewake/test-estuary.cjs
node tools/widewake/test-ocean-motion-browser.cjs
node tools/widewake/test-ocean-art-browser.cjs
node tools/widewake/test-battle-core.cjs
node tools/widewake/test-battle-browser.cjs
node widewake-desktop/prepare.mjs
node widewake-desktop/test-policy.cjs
node widewake-desktop/test-desktop.cjs
```

Browser harnesses require Playwright on NODE_PATH and own their test browser.
Use the agent Chrome for Testing wrapper, never the personal Chrome executable.
`WIDEWAKE_TEST_ENGINE=webkit` selects WebKit in the relevant harnesses.
The save handoff harness uses a running preview, defaulting to port 8733; set
`WIDEWAKE_TEST_URL` to use another address.

The connected core test covers about 43 simulated minutes: the first delivery,
return trade, earned trawler, fishing and salvage sale, upgrades, oil watch,
a four-boat trip to Lockmill and back, active-state restoration and shipwreck
recovery. It uses a funded later-stage fixture for the oil and river convoy;
it is not a claim of a complete organically earned economy playthrough.

## Next quality work

Review the first long passage with a human player, deepen encounter variety,
expand physical fleet orders and trading choices, and measure larger fronts in
narrow water. The current region has three ports, not a finished world-spanning
campaign. The owner-approved production goal remains open.
