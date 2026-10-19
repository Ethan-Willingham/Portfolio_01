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

The 2026-10-19 direction supersedes that initial stopping point: keep a persistent
production-readiness goal and work in repeated passes through the entire game.
Working systems and passing automated checks are necessary, not sufficient.
Mobile play is a first-class requirement. The ambition is exceptional quality
and broad Steam appeal, without promising a sales number or declaring a game
the best ever. The active quality ledger is `docs/WIDEWAKE_RELEASE.md`.

The owner also explicitly requires opening the URL to feel like launching a
purchased game. Keep the title, continue/new voyage, settings, pause and return
flows inside the game. No blog heading, portfolio navigation, article introduction
or surrounding page furniture. A discreet site exit may live in Credits.

On 2026-10-19 the owner explicitly said the first public build was far from the
full game requested and was disappointing. Treat that build as a foundation,
not fulfillment. Prioritize a connected experience, thoughtful pacing, distinct
encounters, and complete playthroughs. A long feature list is not evidence that
the game feels finished.

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
  self-hosted fonts and warm green interface colors. Its standalone stylesheet
  deliberately does not import the portfolio stylesheet or blog component kit.
- `js/widewake-data.js`: ports, prices, boats, hulls, fittings, fish, admirals.
- `js/widewake-world.js`: Earth polygons, collision, route finding, spatial hash.
- `js/widewake-core.js`: pure JavaScript campaign and fixed-step simulation.
- `js/widewake-voyage.js`: charters, sea stories, rescue operations, encounter
  rewards, and their validated save state. No DOM dependencies.
- `js/widewake-render.js`: small canvas sprites, sea rendering, chart, port scenes.
- `js/widewake-convoy.js`: vessel selection, cargo transfers, hold reservations,
  guard orders, and fleet buttons that retain keyboard focus.
- `js/widewake-front.js`: independent pixel-art title scene and wordmark. This
  scene never steps the campaign. It uses the shared activity scheduler and
  honors the reduced-animation setting.
- `js/widewake-audio.js`: original synthesized music, sea and harbor ambience,
  spatial action cues, separate mix buses and bounded voice cleanup. No timers,
  external recordings or asset downloads.
- `js/widewake.js`: browser input, UI, feedback, local persistence, import/export.
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
loaded into cargo lighters first, then the flagship and other free holds;
production fills its workboat first. Workboats reserve their holds for fish or
oil by default. Existing cargo stays aboard when a reservation changes. The
Convoy desk moves whole units between actual holds at port, without trading
or changing coins. Sinking a
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
  Gunboats, destroyers and repair launches can guard a named cargo boat or the
  flagship. Automatic orders divide them between active workboats or protect a
  stranded crew during a rescue. When work ends they rejoin the flagship.
- Production vessels move onto station before their timer starts. Operations
  stop if the player leaves the area or the workboat sinks. Loaded cargo remains.
- Each market shows purchase and sale prices, the fleet's holdings, local exports,
  demand, quantity controls, and executable trade totals on button hover.
- Disabled purchases show their price or rank requirement. Empty holds and a
  lack of workboats produce an explicit reason rather than silently doing nothing.
- Audio is locally synthesized, with master, music, effects and sea/harbor levels.
  Cannon fire, ordinary hits, sinking, repairs, salvage and discoveries have
  separate cues. Sound begins only after input and suspends with page inactivity.
  Camera impacts have a separate setting. Reduced animation also removes muzzle
  flashes and recoil, hit flashes, sea bobbing and animated effect expansion.
- Held manual aim tracks the screen pointer as the camera moves. Auto targets
  have corner brackets. Flagship hits show the incoming direction; escort hits
  do not shake the flagship camera. Broadside and repair buttons show cooldown
  progress and respond immediately to a successful action.
- Cargo pickups remain afloat when no suitable hold has room. Repair crates
  remain until a nearby vessel needs them, then help the most damaged hull by
  percentage. Receipts name the actual repaired ship and loaded cargo. First
  species discoveries show one card with the naturalist's actual payment.
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
backup. A saved voyage waits at the title with a summary of the fleet and charter.
Continue resumes play; no simulation runs behind the title or settings. Import
validates the campaign shape, numbers, identities, manifests,
upgrades and limits before replacing the live fleet. Storage failure is surfaced
and export remains available. Saves include individual boat positions and wakes,
the course and autopilot, formation, guard orders, reserved holds, action
cooldowns, hulls, cargo, progression, collections, charters and an active sea
operation. Original version-1 saves migrate with defaults for the new fields.
Transient projectiles and enemy
formations are regenerated after loading; they are not a replay format.

Exported JSON is the portable save format for this browser build. A future Steam
package should retain the core module and adapt persistence, input and platform
services through the browser shell, rather than rewriting the economy.

## Checks

```sh
node tools/widewake/test-core.cjs
node tools/widewake/test-routes.cjs
node tools/widewake/test-voyage.cjs
node tools/widewake/test-feedback.cjs
node tools/widewake/test-playthrough.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-front.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-audio.cjs
```

The front and audio harnesses also support `WIDEWAKE_TEST_ENGINE=webkit`.
Audio checks render actual samples offline, verify independent mute, finite
levels and stereo position, then exercise input, inactivity and node cleanup in
the running game. They do not substitute for listening on speakers/headphones.

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

## Campaign and sea stories, v0.2

The Voyage desk carries six sequential charters. They link the Nassau trade,
first trawler, brig, Calypso recovery, Atlantic blockade, Lisbon, northern fishing
and a timber delivery, oil production, the Cape, the Indian Ocean, eastern trade,
deep-water fishing, and the Pacific finale. The final charter requires returning
to Havana after Last Light. Its homecoming screen records the voyage and returns
the player to the same fleet and open-world sandbox. These objectives guide a
route without locking other regions or taking away free sailing.

Fifteen authored sea signals add wreck recoveries, stranded crews, blockades,
and traveling merchants. Investigate with E inside the signal ring. Wrecks offer
a quick cargo recovery or a longer guarded operation for money and a fitting.
Rescues require protecting an actual target hull for 45 seconds. Failed or
abandoned operations can be retried. Resolved stories pay once. Merchants quote
one complete order and check the purse and usable holds before taking payment.
Encounter dialogs pause the sea while the captain decides.

The Red Widow winds up aimed fan salvos. The Iron King marks water before mortar
impacts. Last Light mixes fans, mortars and ring salvos with gaps. Each admiral
calls reinforcements at half hull. Rammers show their committed charge direction
before accelerating. Critical friendly hulls have a distinct warning, visible
name and offscreen pointer; the minimap now includes the convoy. C opens the
convoy desk at sea or port. Transfers and hold reservations are port actions.

Rank thresholds were spread out after an earned playthrough exposed escalation
far ahead of affordable fleet strength. Ordinary patrols have more space between
waves. Production ramps through its one-minute operation and adds pressure for
extra workboats. Admiral fittings are excluded from ordinary raider drops.

The helmsman now slows at waypoints, detects blocked progress, and replans from
the actual hull position. Routes check swept clearance rays against coastline
edges, in addition to sampling. This prevents a narrow coastal sliver from
passing the planner but blocking the boat. A regression exercises the southwest
Iceland stall with an upgraded engine, alongside both Gibraltar directions.

## Extended verification, 2026-10-19

The automated captain in `test-playthrough.cjs` completed all six charters using
ordinary purchases, market trades, steering, hulls, guns and repairs. No money,
health, invulnerability, kills, objectives, or position jumps were injected.
The seeded run took 41.7 minutes of simulated sailing, reached the final admiral
in a frigate, lost ships, bought a Leviathan afterward, and returned to Havana
with ten vessels. It finished with 941 kills and 28,362 coins. This is a reproducible
campaign solvability and pacing check, not a human usability or enjoyment study.

The convoy and voyage scenarios also cover conservation in transfers, reserved
holds, automatic and named protection, sinking a protected ship, original-save
migration, actual per-ship save positions, courses, cooldowns, one-time rewards,
repeatable failures, merchant payment, charter delivery and ending persistence.
All 15 sea-story sites have water-only approaches, in addition to the 42 ports
and resource sites. Browser checks exercise the transfer and order controls,
earned first charter, wreck decisions, real rescue combat, merchant payment,
mortar tells, homecoming and continuing play. Desktop and touch dialogs and
ocean views are inspected as screenshots. The earlier release's performance
numbers are historical; use the latest browser report for the current build.

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
