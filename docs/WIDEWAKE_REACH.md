# Bracken Reach, the playable world

Owner instruction, 2026-10-19: make the new ocean part of the game, retire the old
world, and bring the graphics into one consistent visual system. This explicitly
supersedes the earlier instruction to keep the new ocean in separate trials.

Version 0.23 opens the approved title illustration, then starts at Tern Yard in
Bracken Reach. Continue loads this same world. There is no Earth campaign or
trial chooser in the normal play flow. An old `widewake-estuary.html` bookmark
redirects to the game. `?test` retains the isolated navigation harness; the battle
page remains an engineering benchmark, without a main-menu entry.

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
the Reed cut; bringing deeper boats closes it. Autopilot cruises at the slowest
surviving boat's speed. Followers advance through the recorded wake in order,
then take checked routes to work stations or harbor berths. A blocked follower
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
The separate 16,384-enemy battle test still verifies the shared renderer and
combat buffers. That test is not evidence of 16,384 terrain-aware campaign
enemies. Larger fronts in constrained waterways need their own measured pass.

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
remain available. Chart, broadside and nearby dock/work actions occupy the lower
right. The main-world scale lives on the chart, avoiding action overlaps on phones.
Modal decisions hide the inactive HUD, including stale notices behind them.

Use at least 44 px for interactive targets. Preserve the same actions on phones;
compact landscape layouts move contextual actions above the lower row and allow
long fleet and destination lists to scroll. Keep the chart confirmation outside
that scrolling list. Do not restore nearest-neighbor scaling to moving scenery.

## Graphics contract

One unit is one metre. Decks, piers, doors, railings, trees, weapon mounts and
work equipment use that scale. A six-metre launch is naturally smaller than a
warehouse or a trawler. Camera stops let the player inspect the small boat.

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
- `js/widewake-reach.js`: title, menus, controls, chart, audio and save ownership.
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
