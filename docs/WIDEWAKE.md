# Widewake

Working title for Ethan's JavaScript naval trading and convoy game. The public
portfolio is its temporary home, under In Progress. The intended destination is
Steam. It is separate from Sluice, Hunting Game, and All Four Wheels.

## Owner direction, 2026-10-18

Build a proper connected game, with care for tiny interactions, rather than an
attractive menu around a thin first pass. Think through systems twice, then play
them. The owner specifically emphasized steering, combat, progression, and the
feel of even small actions. Continue independently until the initial build is
usable and tested; avoid spending effort on an enormous speculative plan.

- The entire sailing world is Earth, with real coastlines. Players can steer
  freely, approach ports, cross oceans, and wrap around the Pacific seam.
- Port trading follows the old Tradewinds idea: regional prices, buy low, sell
  high, invest in the next boat. Rare salvage and fish keep voyages interesting.
- Combat should take cues from It's About Pirates: a distant camera, direct
  movement, automatic or manual aim, visible projectiles, many enemies, and
  strong upgrades. Create original assets and behavior.
- The differentiator is a moving fleet. Escorts defend themselves, cargo boats
  actually carry cargo, and workboats produce resources while the player
  protects them. BELTFED is the reference for defensive scale and readable
  swarms, not a claim that this build matches its engine or enemy counts.
- Fish and oil are automatic production at appropriate locations with the right
  boat. The player protects the boat rather than playing a fishing minigame.
- Non-sailing presentation should eventually use chunky, individual pixel art.
  The first cinematic, detailed generated studies were rejected as too polished
  and recognizably AI. The owner then asked for distinct, imperfect moods and
  compositions, followed by an explicit instruction to stop generating images,
  save prompts for later, and continue the gameplay build.

The 24 individual art briefs are in
`assets/widewake/source/port-prompts.json`. Do not resume generation merely
because more art would be useful. The current code-drawn harbor scenes provide
distinct interim backgrounds while that art pass is deferred.

## Files and ownership

- `widewake.html`, `widewake.css`: full-window game shell, using the site's
  self-hosted fonts and warm green interface colors.
- `js/widewake-data.js`: ports, prices, boats, hulls, fittings, fish, admirals.
- `js/widewake-world.js`: Earth polygons, collision, route finding, spatial hash.
- `js/widewake-core.js`: pure JavaScript campaign and fixed-step simulation.
- `js/widewake-render.js`: small canvas sprites, sea rendering, chart, port scenes.
- `js/widewake.js`: browser input, UI, audio, local persistence, import/export.
  Uses the shared `js/demo-activity.js` controller to stop scheduling offscreen,
  hidden, or unfocused. Held input clears, audio suspends, and battle pause stays
  independent of returning to the page.
- `js/widewake-route-worker.js`: route searches off the rendering thread.
- `assets/widewake/earth-land.geojson`: vendored Natural Earth coastline data.
- `tools/widewake/`: core, geography, browser, and scale checks.

There is no framework, CDN, game dependency, or bundle step. Serve the repository
over HTTP. Bump all Widewake CSS/script version parameters together when editing
it. Do not change Sluice or the other games as part of Widewake work.

## Initial game loop

Start in Havana with 780 coins, a cutter, 12 sugar, and the gunboat Wren. The
chart suggests Nassau. Buy extra sugar if desired, sail there, and sell it.
The first delivery milestone pays an additional 400 coins. A fishing trawler is
750 coins; the Bahama Bank is nearby. The first rare catch is guaranteed during
the first operation so the collection system is encountered naturally.

The campaign has 24 ports, 10 trade goods, 18 resource sites, 5 flagship hulls,
6 support boat roles, 4 repeatable upgrade tracks, 7 salvage fittings, 9 rare
species, delivery contracts, 11 milestones, and 3 named admiral encounters.
Captain rank gates stronger equipment; new ports, trade, combat and production
all provide experience. Milestone rewards are granted once. After the world
circuit and admirals, the trading and fleet sandbox continues.

Every support vessel has a separate cargo manifest and hull. Incoming trade is
distributed into free holds; production fills its workboat first. Sinking a
support vessel loses its cargo. Damaged ships can be repaired at ports or with a
paid emergency repair at sea. Losing the flagship returns the surviving fleet
to the last harbor, with a recoverable loss rather than a permanently insolvent
save. A new game's purse is never overwritten just to recover from malformed
import data.

## Feel and implementation choices

- Directional input has acceleration and damping. Heading turns toward travel
  rather than instantly snapping. The camera follows with a short lag.
- Guns use visible traveling rounds and swept hit tests. A broadside is a
  deliberate cooldown action. Friendly fire is disabled.
- Three fleet formations change spacing. Support ships turn and catch up.
- Production vessels move onto station before their timer starts. Operations
  stop if the player leaves the area or the workboat sinks. Loaded cargo remains.
- Each market shows purchase and sale prices, the fleet's holdings, local exports,
  demand, quantity controls, and executable trade totals on button hover.
- Disabled purchases show their price or rank requirement. Empty holds and a
  lack of workboats produce an explicit reason rather than silently doing nothing.
- Audio is locally synthesized, with a mute switch and volume control. Camera
  impacts have a separate setting. Reduced-motion preferences disable UI motion.
- Chart, pause, blur, and hidden-tab states freeze simulation and clear held input.
  Returning to the window does not silently resume a battle. Quantity controls
  sit above the goods list; keyboard focus survives a completed trade.
- Touch has steering and combat buttons; the desktop layout remains usable on
  landscape touch devices. Portrait remains a supported compact layout for this
  game; Sluice's separate landscape policy does not automatically apply here.

## World model

Longitude and latitude map to a wrapped equirectangular world. Distances and
travel time are compressed for play; the rendering is not a navigation product.
The land geometry is Natural Earth 1:110m, so very small islands and harbor detail
are simplified. Port anchorages are moved a little offshore when necessary.
There are no fabricated connecting land bridges or random replacement continents.

Routes use a water grid and check actual polygon clearance. Gibraltar has a
verified fine corridor because it is narrower than the coarse navigation grid.
The game does not pretend that artificial canals are open ocean: routes go
around land unless a real, traversable water corridor exists in the data.

Companions follow the actual flagship wake around obstructing coastlines. They
do not teleport to catch up. Multiple matching workboats occupy stations at a
resource site, fill their own holds first, and attract additional attackers.
Surviving workers continue if their lead boat sinks.

The simulation caps active enemies at 1,200 and projectiles at 3,500. Normal
progression starts with a handful and grows through production danger and fleet
strength. Projectile broad phase uses a spatial hash. These caps are protective
bounds, not proof of any particular frame rate. Record measured scale results
with the hardware/browser and actual living counts, not a boast about BELTFED.

## Save contract

`widewake-save-v1` is a versioned localStorage record. The previous valid save is
retained at `widewake-save-backup-v1`. Corrupt primary saves can fall back to the
backup. A saved voyage opens paused so returning captains can orient themselves
before the sea resumes. Import validates the campaign shape, numbers, identities, manifests,
upgrades and limits before replacing the live fleet. Storage failure is surfaced
and export remains available. Saves include position, hulls, cargo, progression,
collections and an active production operation. Transient projectiles and enemy
formations are regenerated after loading; they are not a replay format.

Exported JSON is the portable save format for this browser build. A future Steam
package should retain the core module and adapt persistence, input and platform
services through the browser shell, rather than rewriting the economy.

## Checks

```sh
node tools/widewake/test-core.cjs
node tools/widewake/test-routes.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-browser.cjs
```

Browser tests must use `/Users/ethan/.local/bin/agent-chrome-for-testing` or an
explicit testing-browser override. Never launch the owner's personal Chrome with
headless/debugging flags. Each harness closes its exact browser in `finally`.

Cover first trade, all port and resource routes, narrow passages, land collision,
manual steering, automatic escorts, production, actual cargo loss, cooldowns,
rank gates, contracts, pause/blur, persistent saves, malformed imports, touch
input, page overflow, all service tabs, and a dense battle. Inspect screenshots.

## Bulk order pricing

Trades quote each unit against the changing supply curve and use that same
quote for payment. The buttons show the complete order cost, with unit prices
alongside. Max stops at affordable units, actual stock, or cargo capacity.
Stock is always a whole number, including after market pressure decays overnight.
Buying and immediately reselling must lose money even in an oversupplied port;
the economy checks sweep every port and good across multiple order sizes and
pressure levels. This closes the opening-price batch exploit found in the final
review of the first build.

## Initial verification, 2026-10-18

Twenty-one core scenarios passed, including a real first trade, economy constraints,
individual cargo loss, production and save continuation, multiple workboats
losing their leader, upgrades, bosses, and rescue from bankruptcy. All 42 port
and resource destinations have water-only routes. The actual helm and a
following escort traverse Gibraltar in both directions.

The Chromium browser run exercised all services, the starter trade, hiring a
trawler, a full protected fishing operation with ordinary equipment and live
enemies, save export/import/reload, malformed saves, manual and inactivity pause,
and desktop plus landscape and portrait touch layouts. No uncaught browser
errors were reported. A separate WebKit touch smoke check passed loading,
trading, route calculation, docking, steering controls and pause. Screenshots
were inspected. Mobile checks are browser
emulation, not physical-device certification.

On an Apple M1 Pro with Chrome for Testing 148 at 1440 by 900, a 240-frame dense
battle measurement retained 1,200 enemies and 21 support boats, with live motion,
targeting, projectiles and rendering. Median frame interval was 8.3 ms and the
95th percentile was 9.9 ms. Only fixture hull health was raised to keep the
population alive during measurement. This is a short local stress result, not
a guarantee for every browser, machine, or extended campaign.

## References

- [It's About Pirates](https://store.steampowered.com/app/4468540/Its_About_Pirates/),
  inspected 2026-10-18: survivor combat, manual/automatic aim and ship builds.
- [BELTFED](https://store.steampowered.com/app/4879420/BELTFED/), inspected
  2026-10-18: automated production and defenses against large swarms.
- [Natural Earth](https://www.naturalearthdata.com/) and its
  [public-domain vector repository](https://github.com/nvkelso/natural-earth-vector).
  Vendored source: `geojson/ne_110m_land.geojson`.

## Later work, deliberately not claimed complete

The owner deferred the final image-generation pass. These prompts and interim
harbors are not the finished art collection. A Steam release also still requires
packaging, platform/controller integration, accessibility work beyond the current
browser controls, longer balance playtests, final assets and a release process.
Do not describe the temporary public build as Steam-ready.
