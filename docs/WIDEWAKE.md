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
- `js/widewake-work.js`: working-ground forecasts, moving schools, timed loads,
  raider approaches, weighted rare species, and validated watch state.
- `js/widewake-sea-save.js`: bounded active combat records, validation and exact
  continuation of motion, attacks, salvage and the simulation sequence.
- `js/widewake-render.js`: small canvas sprites, sea rendering, chart, port scenes.
- `js/widewake-convoy.js`: vessel selection, cargo transfers, hold reservations,
  guard orders, hull/cargo sorting, port repair, and paged fleet buttons that
  retain keyboard focus.
- `js/widewake-front.js`: independent pixel-art title scene and wordmark. This
  scene never steps the campaign. It uses the shared activity scheduler and
  honors the reduced-animation setting.
- `js/widewake-audio.js`: original synthesized music, sea and harbor ambience,
  spatial action cues, separate mix buses and bounded voice cleanup. No timers,
  external recordings or asset downloads.
- `js/widewake-controller.js`: standard-layout gamepad polling, analog dead zones,
  menu navigation, input release gates and optional haptics. It owns no scheduler.
- `js/widewake.js`: browser input, UI, feedback, local persistence, import/export.
  Uses the shared `js/demo-activity.js` controller to stop scheduling offscreen,
  hidden, or unfocused. Held input clears, audio suspends, and battle pause stays
  independent of returning to the page.
- `js/widewake-route-worker.js`: route searches off the rendering thread.
- `assets/widewake/earth-land.geojson`: vendored Natural Earth coastline data.
- `tools/widewake/`: core, geography, browser, and scale checks.
- `widewake-desktop/`: isolated Electron packaging, native file pickers, window
  lifecycle and packaged-app verification. `desktop/` is Sluice's separate build.

The web game has no framework, CDN, game dependency or bundle step. Serve the
repository over HTTP. Bump all Widewake CSS/script version parameters together
when editing it. Desktop dependencies are isolated in `widewake-desktop`.
Do not change Sluice or the other games as part of Widewake work.

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
  stop if the player leaves the area or the final workboat sinks. Loaded cargo
  remains on surviving boats. Each watch keeps its forecast until it finishes.
- Each market shows purchase and sale prices, the fleet's holdings, local exports,
  demand, quantity controls, and executable trade totals on button hover.
- Choosing a good's name opens trade comparisons on the chart. Owned cargo is
  compared with selling at the current or last port; a new order subtracts its
  actual purchase cost. Both use complete bulk quotes. The captain can explicitly
  buy the reviewed order while still at anchor. Comparing or selecting a route
  never spends coins. These are today's prices, not a guaranteed arrival price.
- The chart previews a checked water route before departure. Nearby opportunities
  use water-route distance, not distance across land. Estimates account for the
  flagship's hull, engine and speed fittings; combat and turns can add time.
  Taking the helm keeps the destination marked. Resume course, H or a left-stick
  click finds a new water route from the actual position without opening the
  chart. Take helm cancels automatic steering. Starting work, opening a modal,
  leaving the window or transferring the save cancels a pending route request.
  Arrival has its own quiet cue and harbor status. The first manual departure
  suggests the charter destination; a chart opened at a working ground offers
  the nearest harbor for the return. Passing a waypoint keeps forward throttle.
- Charter guidance checks the actual fleet before sending a captain to fish or
  extract oil. Missing workboats link to their Fleet listing, including after a
  loss. Site previews report matching workers and usable cargo space. Convoy
  buttons identify guard assignments and distant boats that are catching up.
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

## Working grounds and losses, v0.7

All 18 sites use physical workers with their own holds. Matching boats join the
watch together. Guards follow those boats; the captain continues steering and
fighting. No manual fishing or pumping action is required after deployment.

| Ground | Working time | Load per boat | Defensive consequence |
| --- | --- | --- | --- |
| Warm shoals | 60 seconds | 3 fish every 3 seconds, 60 total | Hold the ground against the day's raider mix |
| Cold banks | 60 seconds | 3 fish every 3 seconds, 60 total | Follow a school along a checked 140-unit water track |
| Deep water | 72 seconds | 12 fish every 12 seconds, 72 total | Larger, slower hauls while gunboats try to stand off |
| Gulf pumping | 60 seconds | 4 oil every 3 seconds, 80 total | Defend a stationary tender |
| Higher-threat wells | 72 seconds | 16 oil every 12 seconds, 96 total | Fast packs approach between pressure cycles |

Travel onto station can add time. Full holds stop work early; a complete watch
pays 100 + 75 times site danger in coins. Recalling, leaving the protection area
or losing every worker does not earn this bonus. The log retains the last watch's
loaded quantity, result and payment. Cargo lost with a boat is recorded separately.

The chart describes the site's load pattern, useful cargo room, daily forecast
and favored species. Forecasts stay fixed during a watch and survive saving.
They change approach width, bearing and the enemy mix at ordinary grounds.
Deep grounds favor gunboats; pressure wells favor fast raiders. A sound, compass
bearing and water marker warn three seconds before a wave. The lookout checks
clear water before announcing a direction. Coasts can change the preferred
alternating approach. Keeping the flagship inside a harbor ring does not disable
attacks on its workers outside the harbor.

Rare species use relative weights of 6 for Uncommon, 3 for Rare and 1 for
Legendary. A ground's favored species has twice its usual weight. Warm, cold and
deep regional pools remain separate. The first qualifying catch after twelve
seconds is still guaranteed if the captain has never found a rare species.

A sunk support boat leaves a bounded loss record: its identity, final damage
source, day and actual hold. If the flagship goes down, surviving hulls are towed
back to the last port and repaired. Coins become max(260, floor(coins * 0.75));
each remaining cargo quantity is halved and rounded down. A recovery receipt
shows the actual fee or relief grant, salvagers' cargo, and boats already lost
on that voyage. It offers Fleet and trade planning without spending anything.
Dismissal is saved, and the receipt can be reopened from Log.

On small screens, the working watch replaces the distant charter objective.
One notification remains visible at a time, with discoveries taking priority.
The approach warning belongs to the watch rather than duplicating a toast.
Active ground labels yield to named workers so the words do not overlap.

## Coastal convoy navigation, v0.13

Companions follow clear formation legs with their actual 13-unit hull clearance.
If the coast blocks the next leg, each boat retains a checked water route until
it can rejoin directly. Route searches are limited to one companion per simulation
step. Narrow coastal pockets disconnected from the broad ocean grid get a local
60-unit grid connection; both directions through the Magellan regression are
checked against the actual coastline. The worker shares checked navigation data
and prewarms routes for distant boats in a loaded save. Coastal caches are bounded.

Retained companion routes use up to 128 Float64 points in compact save records.
Reaching the end of a partial route triggers another check. Guard changes,
workboat deployment and recall discard obsolete destinations. The boats retain
their cargo, damage and real positions during recovery. No arrival teleport is
used to repair a stranded save.

The flagship still docks inside the 190-unit harbor ring. Every surviving
companion must be within the 1,200-unit harbor approach, which accommodates the
widest full convoy even at the outer edge of the flagship ring. Rejected docking
cannot clear enemies or salvage, stop work, award a visit or move cargo. The helm
names the waiting boat. Convoy opens on an endangered hull first, then the most
distant waiting boat. Distance sorting, position text and the selected boat's
directional marker help locate it. Return from the desk resumes its sailing.

Earlier full-campaign checks only required the flagship to arrive. They could
pass while docking gathered distant boats instantly. The v0.13 captain checks
every survivor before docking, and the maximum-fleet geography tour takes all
24 boats through all 24 ports. Those checks cover arrival integrity; they do not
establish combat balance or human enjoyment.

## Fleet reading and camera, v0.8

The default camera fits roughly 1,400 world units across the smaller canvas
dimension at the supported phone and desktop sizes. Minimum sprite sizes keep
small hulls visible. Manual zoom is stored as a factor of that fitted view, so
resizing, rotating or continuing a save keeps the captain's preference. Aim
conversion uses each canvas axis's actual scale, including odd viewport sizes.

Selected boats, critical hulls, working boats, rescue targets and admirals can
request labels. A bounded priority layout places them clear of friendly hulls,
the HUD, harbor and signal names, and one another, retaining the previous clear
slot when possible.
Selected and endangered boats take precedence when space is tight. Leader lines
connect displaced names to their hulls. Critical or selected companions outside
the view, including those covered by the HUD, get directional markers. Health
bars and the fleet summary remain available when there is no room for a name.

The small chart shows the nearby coast, friendly vessels, hostile contacts and
the flagship's heading. Opening it still presents the complete Earth chart.
The fleet strip has reachable previous/next controls when it overflows. Convoy
opens on the weakest critical hull, then a boat delaying harbor arrival, then
the flagship; an
explicit vessel selection takes precedence. Its desk sorts by fleet order, hull
condition or cargo without changing formation order. At port it also quotes and
performs the same whole-fleet repair offered by Fleet services.

## Controller play

The web edition accepts devices reported with the browser's standard gamepad
mapping. Unknown raw layouts are identified in Settings rather than guessed.
Only the active game's existing frame loop polls input. Disconnecting the active
controller pauses sailing, clears held inputs and stops vibration. Reconnection
and returning from an inactive window require releasing controls and explicitly
resuming. A held confirmation cannot activate the next screen.

| At sea | Action |
| --- | --- |
| Left stick | Analog steering, takes over from the helmsman |
| Right stick | Aim and fire; release for automatic fire |
| Right trigger | Fire along the last aim, or ahead if none |
| Left trigger | Full steam |
| A / Cross | Dock, deploy/recall workboats, investigate or leave a sea operation |
| X / Square | Broadside |
| Y / Triangle | Field repair |
| Left shoulder | Chart |
| Right shoulder | Convoy |
| D-pad up / down | Zoom |
| D-pad left / right | Previous / next formation |
| Menu / Options, B / Circle | Pause |
| View / Share | Handbook |

In menus, the D-pad or left stick moves focus. A/Cross activates the selected
control. Select a slider or dropdown to edit it, then confirm to accept or use
B/Circle to restore its starting value. Left/right shoulders visit controls in
order inside dialogs and switch services at port. Up/down within a service stays
in that service; moving up from its first row returns to the selected tab. Closed
panels are excluded from navigation. Focus follows transactions and rerendered
manifests and scrolls into view after viewport changes. The chart's destination
list reaches every port, work site, admiral and signal without a pointer.

Settings include a radial stick dead zone from 10 to 35 percent, optional
vibration and automatic or explicit A/B/X/Y or PlayStation button names. These
preferences migrate with defaults in old saves and also persist before a voyage
is started. Prompts follow the last used input. Vibration requests are short and
rate-limited; unsupported actuators do not prevent play. The aiming reticle stays
within the smaller viewport dimension without changing gun range.

Browser sound, full screen and file pickers may require an actual click or tap.
The game explains this when relevant. Suspended and interrupted audio sessions
are resumed explicitly and allocate no new cues while stopped. A blocked audio context leaves Sound
available to enable instead of claiming that the muted voyage is audible.
Controller checks use simulated standard devices in Chromium and WebKit; they do
not establish physical controller compatibility, vibration feel or Steam Input
support. Those remain release work. The mapping follows the
[W3C Gamepad standard](https://www.w3.org/TR/gamepad/).

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

`widewake-save-v2` is the current localStorage slot, with the previous valid
save at `widewake-save-backup-v2`. The portable JSON campaign schema remains
version 1. Corrupt primary saves can fall back to the backup. A saved voyage waits at the title with a summary of the fleet and charter.
Continue resumes play; no simulation runs behind the title or settings. Import
validates the campaign shape, numbers, identities, manifests,
upgrades and limits before replacing the live fleet. Storage failure is surfaced
and export remains available. Saves include individual boat positions and wakes,
the course and autopilot, formation, guard orders, reserved holds, action
cooldowns, hulls, cargo, progression, collections, charters and an active sea
operation. Watch saves include forecast day, loaded cargo, drift, approach and
next-wave timing. Recovery receipts, recent losses and the relative camera zoom
are validated too. Original
version-1 saves migrate with defaults for the new fields. An older active watch
labels its cargo counter as loaded since resuming, because earlier saves did not
record a reliable watch total.

From v0.11, one browser window owns the device save. The session holds an
exclusive [Web Lock](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
until the page leaves or explicitly hands over. Another window starts at the
title with Continue here. The current owner pauses, saves synchronously and
releases the lock before the requester reads the latest fleet. No lock is stolen.
Failed writes deny the handoff and leave the live fleet available for export.
BroadcastChannel carries requests, with storage events as a fallback. A bounded
request timeout uses the activity scheduler; there is no background heartbeat.
Leaving during a request cannot resume the game in the background. Returning
through browser history reloads the latest fleet and stays at the title.

Browsers without usable Web Locks permit play and export but never write the
shared save. A history-restored page whose last write failed also keeps its
unsaved in-memory fleet in export-only mode. This protects both that fleet and
any progress made in another window. The desktop edition uses its existing
single-instance profile lock and can write normally. Imported files and new
voyages require ownership. A pending restart confirmation closes on handoff.
Settings changed in a viewing window do not save its stale campaign.

The v1 storage pair is read only when neither v2 slot exists. Merely visiting or
leaving a legacy title does not migrate it. Starting play, importing, or changing
a saved preference writes the new primary before retiring observed old copies.
A still-open older client can continue writing its v1 slot without overwriting
v2. If storage is full during migration, only the other legacy copy may be
removed for one retry; the validated source remains intact until the new primary
succeeds. Ordinary writes also commit the primary first. A backup failure reports
that the primary succeeded, and a primary failure leaves the good backup alone.
The browser's atomic localStorage write is the durability boundary; there is no
claim of protection against erased browser data or device failure.

From v0.10, an optional versioned `sea` record retains enemy identities, hulls,
targets, phases and cooldowns; ramming and admiral attack windups; moving shots;
mortar markers; floating salvage; friendly momentum and navigation probes; and
encounter wave timing. Loading a partly cleared patrol does not spawn its initial
wave again. The random stream and enemy sequence also persist in port, so a
break does not reroll the next crossing. Cosmetic flashes and particles are not
saved. Sunk companions leave the live formation immediately. Coastal restore
uses the same hull clearance as movement.

Dense arrays use base64 little-endian fixed records with Float64 simulation
values: 101 bytes per enemy, 57 per projectile and 26 per salvage item. The
version-1 catalog indices follow the order of enemy/ability kinds and the data
module's goods, relics, admirals and signals. Append entries or provide a format
migration before reordering these catalogs. Validated records are transferred
once to the restored simulation. Caps are 1,200 enemies, 3,500 shots, 4,096 salvage
items and 64 mortar markers. The common web/native file limit is 1,500,000 UTF-8
bytes. Compact exports avoid enlarging the file with formatting. The maximum
tested battle with complete tracks and full companion routes occupies about
1.02 MB, leaving room for its
local backup. Storage failure remains visible and export stays available.

Pre-v0.10 saves contain no active combat records. They retain the old one-time
encounter reconstruction on initial load, then use full sea continuation on the
next save. Missing historical projectiles or enemy damage cannot be recovered.
Loading and backup selection check that the saved game can actually be restored,
including its operation and location, before accepting it.

Exported JSON is portable between the web and desktop builds. The desktop app
retains the same core and stable save schema, with a separate local profile.
Native pickers report completed export, cancellation and failure. Window closing
saves the current fleet before quitting; a failed write leaves it open by default.
The packaged-app check includes exact mid-watch and active-admiral close/reopen,
plus a maximum-size sea export and import. Use v0.10 or later in both editions
to retain these combat records. Steam Cloud
and platform services still need a deliberate adapter. See
`widewake-desktop/README.md` for builds and `widewake-desktop/ASSETS.md` before
distributing binaries.

## Checks

```sh
node tools/widewake/test-core.cjs
node tools/widewake/test-work.cjs
node tools/widewake/test-routes.cjs
node tools/widewake/test-helm.cjs
node tools/widewake/test-convoy-navigation.cjs
node tools/widewake/test-convoy-tour.cjs
node tools/widewake/test-voyage.cjs
node tools/widewake/test-feedback.cjs
node tools/widewake/test-trade-planning.cjs
node tools/widewake/test-playthrough.cjs
node tools/widewake/test-sea-save.cjs
node tools/widewake/test-save-store.cjs
node tools/widewake/test-reload-campaigns.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-front.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-work-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-audio.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-chart.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-helm-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-controller.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-fleet-view.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-convoy-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-sea-browser.cjs
NODE_PATH=/path/to/bundled/node_modules node tools/widewake/test-save-tabs.cjs
```

The front, chart, helm, work, controller, fleet-view, sea and audio harnesses also support
`WIDEWAKE_TEST_ENGINE=webkit`.
Audio checks render actual samples offline, verify independent mute, finite
levels and stereo position, then exercise input, inactivity and node cleanup in
the running game. They do not substitute for listening on speakers/headphones.
Chart checks cover review without departure, exact explicit purchases, stale
route replies, worker failure and fallback, retained destinations, missing boats,
guard status and touch layouts. Route previews and market comparisons are
transient UI state, not new save fields. Helm checks delay actual worker replies
to exercise cancellation, steering races, focus, title, fleet replacement,
protected work and cross-window handoff. Both engines cover keyboard, button
and left-stick-click control, failed workers, invalid routes and small touch
layouts, including the pending state.

Fleet-view checks exercise a 24-vessel fleet, strip paging, urgent selection,
sorting, exact port repair, clear labels and edge markers, fitted camera, aim
coordinates and zoom persistence. `WIDEWAKE_SOAK_SECONDS=300` adds a five-minute
live desktop battle with 1,200 enemies and 23 companions. Its raised-health
fixtures retain the load; they do not represent ordinary balance or valid
campaign saves. Memory samples follow explicit collection and are compared
with the first sample, rather than counting transient allocations as leaks.

The earned captain accepts `WIDEWAKE_CAPTAIN_SEED` and
`WIDEWAKE_FLEET_STYLE=balanced|merchant|gunline`. Each style finishes through real
purchases, travel, trade and combat. Periodic snapshots are validated every
twelve simulated seconds and at trading stops. `WIDEWAKE_CAPTAIN_RELOAD=1`
reconstructs the game at each of these checkpoints. The comparison harness runs
three fleet styles with and without reloads and requires identical final save
values. The focused sea suite additionally compares individual simulation frames
through attacks, losses, pickup and protected work. These are deterministic
continuation checks, not human balance or enjoyment assessments.

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

The captain can export its earned milestone saves with
`WIDEWAKE_CAPTAIN_OUTPUT=/absolute/output/folder`. Those JSON files are suitable
for normal Import save and interactive reviews. This option does not grant
money, health or objectives. Exported checkpoints should stay outside the repo.

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
