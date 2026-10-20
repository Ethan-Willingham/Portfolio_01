# Widewake production goal

Owner direction, 2026-10-19: keep improving the whole game in repeated passes.
Treat the tiny actions, the connected experience and mobile play as seriously as
the large features. A playable public build is not the finish line. Opening the
game must feel like launching a purchased game, with no blog wrapper.

The goal is active. The current build is not a production release. The owner's
sales ambition informs the care invested; it is not a forecast or a completion
criterion. Tradewinds, It's About Pirates and BELTFED remain the three references.
The exact owner constraints and source links are in `WIDEWAKE.md`.

The latest owner direction is staged in `WIDEWAKE_OCEAN.md`: endgame combat
performance first, an isometric ocean and rethought zoom, then an original world
at believable local scale with varied waterways. This supersedes the earlier
Earth target. Keep the approved title. The owner subsequently directed the new ocean to replace the old game flow.
Version 0.22 makes Bracken Reach the playable campaign and preserves previous
world saves for export. The current architecture and limits are in
`WIDEWAKE_REACH.md`; historical campaign evidence below does not establish
production readiness for the replacement.

## Current scope override, 2026-10-19

The owner has deferred saving and removed reverse and tow-back completely.
Do not restore persistence, file actions, save handoff, reverse inputs or tow
recovery as quality work. Play fresh or in-memory sessions; existing save slots
remain untouched. Earlier save evidence below is historical. See
`WIDEWAKE_REACH.md` for the active session and control contract.

## How a pass works

1. Play the current build from a clean launch and from an existing fleet. Follow
   a connected loop: market, course, sailing, combat or work, return, upgrades.
   Alternate early, middle and late campaign saves across passes.
2. Review every area in the ledger below. Record observed friction and design
   consequences. A review can conclude that an area needs no change this pass;
   do not create churn simply to touch every file.
3. Fix the most consequential problems together. Revisit assumptions when a
   change makes another system weaker. Preserve the earned progression checks.
4. Inspect the result in motion and at desktop, landscape touch and portrait
   touch sizes. Test new failure cases as well as successful actions.
5. Publish a verified increment, record evidence and remaining issues, then
   start another pass. A published increment does not complete the goal.

## Quality ledger

| Area | Current evidence | Next work / release requirement |
| --- | --- | --- |
| Launch and identity | Owner-approved title, current version and direct New ocean access, independent navy/cyan identity, scene-led harbor and focused services | Preserve the approved title; maintain cohesive identity through the remaining views |
| First voyage | Real-time starter sailing reviewed; guidance checks workboats; earned trade and fishing complete | Observe an unassisted human session; keep controls, profit and purchases understandable without a long manual |
| Helm and camera | Trials have weighted handling, interpolated motion and anchored zoom; three hull sizes complete the estuary routes with bank and pier clearance, reverse and tow | Add constrained-water convoy orders; review small-screen fleet readability, controller integration and calm travel |
| Combat | Main-game Endgame combat button starts a disposable watch: 16,384 raiders, 24 armed boats, changing fronts, rams, repair crates and automatic weapon rhythms | Human feel review, earned loadouts, terrain-aware large fronts and campaign difficulty |
| Trade | Regional warehouse depth, earned merchant expansion, exact bulk quotes, water routes and reserved holds | Review market pacing, discovery of trade routes, and late-game reasons to trade |
| Convoy | Checked coastal recovery, physical harbor arrivals, all 24 ports with a full wide convoy, saved routes and distance inspection | Extended survival with different guard assignments and fleet builds; review arrival feedback in ordinary play |
| Fishing and oil | Five work rhythms across 18 sites, optional double/triple watches, carried rare catches and safe-return payment | Longer play across fleet builds, risk/reward pacing and worthwhile repeat visits |
| Progression | Six earned charters; staged harbor access with alternate rank routes and legacy access preserved | Human pacing, optional pursuits and free-play depth; eliminate grind or runaway snowballing |
| World and discovery | Existing Earth campaign retained; Bracken Reach has three connected landings, a shallow shortcut, draft, current and salinity | Connect convoy work, trade and discovery in the region, then expand and deliberately migrate saves |
| Art | Filtered directional sprites with continuous heading blends, display-aware resolution, animated work gear, water, wakes, foliage and three landing scenes in the trials | Refine weapon mounting, distant silhouettes, bank variety and atmosphere; image generation remains deferred |
| Sound | Original score, spatial cues, mixer, bounded voices and suspended/interrupted recovery | Listening on speakers/headphones, broader regional atmosphere, long-session comfort and battle priority review |
| Interface and access | Locked service previews, compact future stock, selected-item trading and contextual sea actions; keyboard, touch and standard controller flows | Physical controllers, remapping, button-label coverage, readable text and non-color threat cues |
| Mobile | Chromium and WebKit touch emulation | Full-screen portrait and landscape flows, safe areas, browser-height changes, sustained performance and physical-device validation |
| Saves and recovery | Full active-sea records, 676 matching v0.15 campaign reloads, exclusive browser writer, explicit handoff, primary-first writes and legacy migration | Future format upgrades, erased storage, supported platform/cloud integration and long-session recovery |
| Performance | Separate isometric trial uses bounded simulation buffers, local collision queries and instanced WebGL2 drawing; evidence below | Physical-device budgets, terrain pathing, streamed regions, pickups, persistence and longer sessions under the new load |
| Shipping | Public web build, tested offline Mac app, Windows package and asset inventory | Windows execution, signing, font clearance, Steam services, release QA and store materials |

## Release gates

- The complete campaign can be finished with ordinary progression, with several
  viable approaches. Optional trade, fishing, oil and fleet building remain
  worthwhile. Repetition, rewards and difficulty have been assessed through play.
- No known progress blockers, accidental save loss, invisible attacks, unresponsive
  controls, inaccessible required actions or viewport clipping remain.
- Launch, new game, continue, pause, settings, help, recovery and ending form one
  finished experience. Saves survive supported upgrades and invalid imports.
- Every port and major gameplay state has intentional art and sound. Deferred
  assets are resolved with the owner, not silently counted as finished.
- Keyboard/mouse, touch and the intended Steam controller flow are tested through
  a full loop. Mobile layouts work in both orientations and handle resizing.
- Performance, memory and save reliability hold over long sessions on the agreed
  target devices, not just a short powerful-desktop stress run.
- A reproducible desktop release package runs outside the development environment.
  Platform integration, asset provenance and distribution requirements are checked.
- Remaining limitations are documented accurately. No open required work is hidden
  by a version bump, feature count or a successful test suite.

## Pass 1, launch and the device boundary

The first review found that the main URL opened directly into a trading panel
with an In Progress link. It also found that portrait harbor screens scrolled the
whole page. Both conflict with the requested purchased-game presentation.

This pass introduces an original low-resolution sailing title scene, a saved-fleet
summary, Continue and New Voyage, in-game settings/help/credits, a first-departure
prompt, explicit save-and-return, and an independent game stylesheet. Preferences
are available before starting. Merely opening the URL does not create a save or
advance a fleet. Portrait ports keep the game frame fixed and scroll services.
Pushing the touch helm to its rim provides the same full-steam action as Shift.

First-pass browser review found two concrete defects: Escape closed the wrong
dialog when help was opened above pause, and the departure controls fell below
an 800 by 600 viewport. Dialog stacking and compact harbor spacing were corrected.
The market now shows actual order quantities, readable reasons for unavailable
purchases and the distinction between general cargo room and reserved work holds.

The launcher checks cover fresh arrival without a phantom save, preferences before
play, reduced animation, first-course departure, save-and-return, reload, nested
pause, restart cancellation/confirmation, import, last-valid backup and unavailable
storage. Touch checks exercise manual fire, a visible full-steam helm state, and
clearing held input on pause. The layout set includes 1440 by 900, 844 by 390,
390 by 844, 360 by 640, 667 by 375 and 800 by 600. Rotation and viewport-height
changes must keep a deliberately paused voyage paused. Chromium and WebKit runs
are recorded with the checks; they do not substitute for physical-device testing.

The connected gameplay browser run still completes the earned first trade,
fishing, convoy transfers and guard assignment, first charter, sea stories and
ending controls. A short scale sample retained 1,200 living enemies and 21 support
boats at a 9.6 ms 95th-percentile frame interval on the M1 Pro testing machine.
No changes to economy or combat balance were made in this pass.

Next pass: audio and action feedback, first-session clarity, combat and fleet
readability. Revisit the whole ledger while doing that work. Final port art,
controller support, long-session tuning, desktop packaging and physical mobile
verification remain open. This front-end pass is not production completion.

## Pass 2, sound and action feedback, v0.4

The review found silent ordinary hits, silent companion guns, generic beeps for
unrelated actions, no ocean soundscape, and held manual aim drifting as the camera
moved. Full holds consumed cargo pickups, while repair crates could disappear
against a healthy flagship with an injured escort alongside. The broadside
button also waited for the next HUD refresh to acknowledge a click.

The soundscape now has original sparse plucked phrases, water, engine and pump
beds, and occasional harbor or rigging sounds. Action cues distinguish cannon
fire, broadside, incoming damage, sinking, repairs, purchases and discoveries.
World cues pan and attenuate with location. Music steps back during combat.
Master, effects, music and ambience levels save independently. Voices are bounded
and cleaned up; no audio context starts just by opening the URL. Inactivity
suspends sound and gameplay, and returning still requires resuming the voyage.

Manual aim follows the held pointer. Automatic targets, incoming flagship damage,
muzzle flashes, impact sparks, sinking debris and repair rings now give separate
visual information. Reduced animation preserves essential danger tells while
removing recoil, flashes and decorative motion. Broadside has immediate button
feedback and a reload meter; repair shows its cooldown or the actual reason it
is unavailable. Salvage respects real hold space and actual damaged vessels.
Discovery cards and receipts report earned rewards without duplicate messages.

Phone inspection found discovery cards covering pickup receipts and the steering
pad. Notifications and receipts now share a stack, with compact portrait cards
beside the helm. Landscape feedback sits to the right of the main sailing view.
The checks combine an active fishing operation, discovery, two separate repaired
hulls, fleet controls and the helm at 360 by 640 and 667 by 375. Receipts also
disappear correctly when returning to the title.

Evidence for this pass:

- Core, voyage and eight feedback scenarios pass, including occupied holds,
  repair ownership, single discovery rewards, old settings and dense effects.
- The ordinary-progression simulated captain still completes all six charters,
  returns to Havana in 41.5 simulated minutes with ten vessels, and defeats
  Last Light in a frigate. The run ends with 976 kills and 31,693 coins. Pickup
  availability changes some outcomes; reward and combat formulas were not raised.
- Chromium and WebKit cover the mix controls, generated samples, manual aim,
  damage feedback, discovery, cooldown, multi-vessel repair receipts, inactivity
  and voice cleanup. Muted samples are exactly silent. A simultaneous full-volume
  cue mix peaks below 0.87 of full scale; no invalid samples occur. The running
  1,000-cue burst is rate-limited and returns to the normal music voice count.
- Launcher checks pass in Chromium and WebKit across desktop, short windows,
  portrait and landscape phones, including settings, imports and rotation pause.
- The connected browser run still completes the first trade, fishing, earned
  charter, convoy orders, rescue, merchant and ending flows. With audio active,
  1,200 living enemies and 21 support boats run at 8.3 ms median and 9.6 ms
  95th-percentile frame interval over 240 frames, with at most 25 audio voices.
  Hardware: Apple M1 Pro, Chrome for Testing 148, 1440 by 900. This remains a
  short desktop sample, not a physical-mobile performance certification.

Whole-game review: launch and saved-fleet flows remain coherent; helm aim and
combat feedback improved; trade and convoy cargo benefit from honest pickup
handling; fishing discoveries and oil ambience now have feedback; the earned
campaign remains solvable. Geography, route rules and port compositions were
left unchanged because this pass found no new defect there. The presentation,
access, mobile, save and performance boundaries were rechecked around these
changes. Shipping gates remain open.

Next pass: first-session understanding, chart/trade opportunities, travel interest
and fleet readability. Review all areas again, including failure recovery and
the late-game loop. Listening review, longer varied play, final port art,
controller support, desktop packaging and physical mobile verification remain
required. Numeric audio checks are not a claim of musical or listening quality.

## Pass 3, the captain's next decision, v0.5

A fresh real-time sail from Havana to Nassau exposed a gap after the sugar sale:
the next charter action pointed at the fishing ground with no help hiring its
required trawler. The chart also showed only unit prices and straight-line travel
time. Those are weak tools for a game about bulk cargo and real coastlines.

Goods names now open trade comparisons. The captain can compare cargo already
aboard or a new purchase, choose an order size, and look for nearby gains or the
largest gain. Owned cargo compares complete sale proceeds with the current or
last port. New cargo subtracts the actual affordable purchase quote. Every unit
uses the existing supply curve. Selection and preview are read-only; a separate
purchase action names the departure port and loads exactly the reviewed order before sailing. Prices are
explicitly today's quotes and may change during travel.

Nearby opportunities use actual water routes. The first review of the feature
had ranked San Francisco as nearby across land; the corrected worker calculates
all destination sailing distances. A selected route is drawn and timed before
the departure button becomes available. Closing the chart or changing a
destination cannot let an old reply cast the fleet off. Worker errors remain
visible at anchor; unavailable workers use the existing geometry in scheduled
chunks. Manual steering keeps the intended destination through save/reload and
lets the captain plot again from the new position. After work clears the course,
the chart suggests the nearest harbor, including the last port.

Missing fishing or oil boats now lead to the correct Fleet listing. This guidance
also recovers after a boat sinks. Work-site previews report the available workers
and compatible hold space. Escort buttons show who they guard; distant followers
say they are catching up. Their accessible labels include hull condition, role,
cargo and orders. The chart keeps Close visible when scrolling and reduces the
map when the comparison list is expanded, so its three options fit on desktop.

Evidence:

- Core, voyage and feedback suites still pass. Five new planning scenarios check
  every port's bulk sale against unit-by-unit execution, read-only comparisons,
  purchases limited by purse and holds, routes around South America, engine-aware
  estimates, retained destinations and workboat guidance after a loss.
- Chromium and WebKit chart runs cover a real reviewed purchase, the earned
  Nassau sale, trawler purchase, guarded fishing, stale route replies, failed and
  unavailable workers, and portrait/landscape touch layouts. Screenshots include
  360 by 640, 667 by 375 and 800 by 600. Selecting a route cannot buy cargo or
  depart until its separate action is pressed.
- The launcher suite passes with clickable goods names and the new chart flow.
  The connected browser suite completes trade, production, campaign, convoy and
  save flows. Its audio-enabled 1,200-enemy sample remains at 9.6 ms p95 on the
  M1 Pro with Chrome for Testing 148 at 1440 by 900.
- The earned simulated campaign again returns home in 41.5 minutes, with 976
  kills and 31,693 coins. No reward, price or difficulty increases were used to
  make the revised guidance pass. This is solvability evidence, not a human
  judgment of pacing or enjoyment.

Whole-game review: launch and audio remain intact; steering now preserves route
intent; combat and protected production continue through the same connected
checks; trade, charter decisions and fleet orders are easier to inspect. Earth
geography now informs comparison rankings as well as actual sailing. Portrait
and short landscape layouts were reviewed around the larger chart. Save format,
core combat balance and interim art remain unchanged.

Next: make travel and repeated operations more varied, review fleet losses and
recovery, and develop the controller flow. The full release gates remain open,
including listening, extended human play, final assets, desktop distribution and
physical-device verification. Deferred image generation stays deferred.


## Pass 4, controllers through the voyage

Version 0.6.0 adds standard-layout controller input across the title, services,
chart, fleet orders and sailing. Analog steering and aiming use a radial dead
zone. The right stick aims and fires; triggers support held fire and full steam.
Face buttons dock, work, fire a broadside and repair. The D-pad changes zoom and
formation. Controller menus support directional movement, ordered shoulder
navigation, editable lists and sliders, acceptance and undo. Port shoulders
switch services. Prompts follow the last input and saved button-name preference.

The review found concrete gaps beyond the missing gamepad API. Closed details
panels could report rectangles for controls that were impossible to focus,
trapping navigation. Up/down could leave a service for an unrelated harbor
button. A price change or emptied manifest could discard focus. Rotating a small
viewport could leave its selected control outside the dialog. Those cases now
have explicit behavior, with visible focus, editing hints and scrolling. WebKit
also drew native dropdowns smaller than the requested touch target; the shared
select treatment now enforces a 44-pixel minimum.

Pause, modal transitions, disconnection and inactivity clear held controls.
Reconnection requires neutral sticks and released buttons. Holding confirmation
through a transition cannot activate the next screen. There is no controller
polling timer outside the existing activity loop. Optional haptics are brief,
rate-limited and stopped on pause or input handoff. The controller aim marker
adapts to the viewport without changing cannon range.

Cold-start testing separates simulated controller input from the automation
framework's user activation. Chromium correctly withheld sound until a real
click. WebKit exposed an interrupted context, which now receives the same
explicit recovery handling as a suspended one. Interrupted audio allocates no
new cues and can be explicitly suspended while the page is inactive. Sound stays
available to enable when a browser blocks it. Deliberate zero volume and the
Sound toggle retain their separate meanings. Browser full screen and file import
explain when a click or tap is required.

Evidence:

- Chromium and WebKit complete controller-driven new voyage, cargo purchase,
  reviewed course, manual fire and steering, broadside, zoom, formation, docking,
  Nassau sale, trawler purchase, named guard assignment, protected fishing and
  return. Ordinary fixed-step travel is accelerated for the checks; money,
  health and victories are not injected into this connected route.
- Both engines cover held confirmations, nested pause, dropdown and slider undo,
  preferences before starting, empty cargo rows, saved-title return, mixed input,
  disconnect/reconnect, unknown layouts, denied controller access, stopped
  background polling and focus at 360 by 640 and 667 by 375. Controller hardware
  is simulated; physical sticks, vibration and Steam Input remain unverified.
- The launcher, chart, audio, core and voyage checks pass. Mouse and touch remain
  usable, saved fleets and imports retain their validation, and the campaign
  captain still completes six charters in 41.5 simulated minutes. The final run
  has ten vessels, 976 kills and 31,693 coins, with Last Light defeated in a frigate.
- The connected browser regression includes work, sea stories and ending flows.
  Its isolated 240-frame sample with 1,200 enemies, 21 support boats and audio
  active records 8.3 ms median and 9.6 ms p95 on the M1 Pro with Chrome for Testing
  148 at 1440 by 900. This is still a short desktop sample.

Whole-game review: the launcher and every ordinary service are reachable from
one controller. Trading and charter decisions lead into the same earned sea
loop. Helm, aiming and fleet commands gained input safeguards. Fishing remains
survivable with an ordinary starter fleet; oil production rules, geography,
campaign balance and interim harbor compositions remain unchanged. Saves gained
validated preferences rather than a new format. Mobile menus and audio recovery
received fixes found during this pass. The web build is still in development.

Next: improve repeated-operation variety and fleet-loss recovery. In particular,
a defeat should show the actual losses and a clear route back into useful work,
and fishing and oil should give more reasons to change sites and tactics. Keep
reviewing all areas each pass. Physical-device play, human pacing/listening,
controller remapping, final art, desktop packaging and platform integration still
belong to the release gates. Image generation remains deferred.


## Pass 5, working watches and fleet recovery, v0.7

Defeat previously gave a generic claim that a quarter of the purse was taken.
That was false for small purses, where harbor relief instead keeps the company
viable. Lost boats had no durable manifest or cause beyond a short message.
Fishing and oil both used the same one-minute stationary timer; the rarity
labels did not affect species probability.

The new recovery screen records actual fees, relief, lost cargo and sunk boats.
It keeps earned progression and leads into an affordable trading run or fleet
review. Its unread state survives closing the browser. The Log retains the
receipt, loss history and last working watch. The recovery economy is unchanged.

Working grounds now have five rhythms: shoal nets, moving cold schools, deep
hauls, steady pumping and pressure cycles. The starter yields remain 60 fish
and 80 oil; deep fishing and higher-threat wells take 72 working seconds for
72 fish and 96 oil per boat. Coast-checked drift keeps workers moving physically.
Forecasts change with the day and stay fixed during a watch. Larger hauls favor
different raider types, and directions are announced before a wave appears.
Rare catches now have rarity weights and favored grounds.

Review found and corrected three connected issues. A warning initially pointed
into blocked land, so the lookout now chooses a clear-water sector first.
Parking the flagship near a harbor could suppress attacks on its workboats;
working waves now remain active outside that harbor. On phones, stacked messages
could hide the watch and boats. The watch replaces the charter while working,
one notification takes priority, and the approach warning is shown once. Ground
labels also stop colliding with named workboats.

Evidence:

- Twelve work/recovery checks cover exact odd cargo losses, all purse boundaries,
  invalid imports, all 18 grounds' station paths and yields, moving workers,
  complete and interrupted watches, forecast/approach saves, old-watch migration,
  clear-water waves, harbor shelter and weighted species.
- Chromium and WebKit exercise defeat, pending receipt reload, keyboard/controller
  dismissal, retained history, trade planning, all five chart profiles and both
  phone orientations. The 360 by 640 and 667 by 375 reviews keep the approach
  readable and the 44-pixel recovery actions reachable.
- Core, convoy/voyage, feedback and trade checks pass. Controller play still
  completes the earned first trade, a protected fishing watch and return. Audio
  and mobile notification checks pass. WebKit launcher and chart checks retain
  the save, pause, import, rotation and route-failure behavior.
- The ordinary-progression captain completes six charters in 41.6 simulated
  minutes, with nine boats, 935 kills and 43,186 coins. Last Light is defeated
  in a frigate. Different random catches and enemy approaches change income;
  this one captain is evidence of viability, not a balance certification.
- The connected browser run lands 60 fish with the starter cutter, escort and
  purchased trawler, then continues through charter, rescue, merchant and ending
  flows. Its 240-frame desktop sample with 1,200 enemies, 21 support boats and
  audio active records 8.3 ms median and 9.7 ms p95 on the M1 Pro with Chrome for
  Testing 148 at 1440 by 900. Lookout planning across all sites takes under 1.6 ms
  in a separate Node sample. These remain short desktop checks.

Whole-game review: launch still opens as a game, with no portfolio wrapper.
Trading now connects to an explicit recovery route. Helm and convoy positioning
matter at moving grounds, and combat warnings are tied to actual approaches.
Campaign work objectives remain earned and solvable. Earth routes, existing
harbor compositions and music did not need new content in this pass; the visual
and sound changes serve working status. Save migrations, mobile views, focus and
failure handling were checked around the additions. Final art remains deferred.

Next: review large-fleet combat reading, including worker names that can still
overlap a nearby hull, progression across different builds and long-session stability, then carry those findings into the desktop release path.
Physical-device play, human pacing and listening, controller remapping, final art,
desktop packaging and platform integration remain open release requirements.
The persistent production goal remains active.


## Pass 6, large fleets and sustained play, v0.8

The review found that the camera retained a desktop zoom on phones, showing
too little water for a convoy. Large fleet strips could hide the first boat,
names overlapped hulls, critical ships could disappear under the HUD, and long
Convoy lists squeezed their own rows. The small chart showed too much of Earth
to be useful for nearby combat. Repairing a damaged convoy required leaving its
desk and finding the same action in another service.

The fitted camera preserves a relative manual zoom across resizing and saves.
Minimum hull sizes, clear priority labels, leader lines and unobstructed edge
markers keep selected, working and endangered vessels identifiable. The local
chart shows nearby hostile contacts and heading. Fleet paging, hull/cargo sorting,
an SOS count and urgent opening selection make a large convoy manageable without
reordering the formation. Port repairs show the exact existing fleet quote.

Evidence:

- Chromium and WebKit fleet checks cover 24 boats, reaching the first and last
  strip entries, selected-row scrolling, hull/cargo order, two critical markers,
  HUD and hull clearance, 44-pixel controls, unclipped list rows and camera/aim
  behavior at 1440 by 900, 360 by 640 and 667 by 375. Zoom survives a title and
  reload cycle. Port repair deducts the quoted cost exactly once.
- The five-minute Chromium battle retains 1,200 enemies and 23 companions with
  movement, projectiles, rendering and audio active. Thirty-second samples have
  9.6 to 10.0 ms p95 frame intervals. Retained JavaScript heap grows by 309,204
  bytes between the first and last collected samples, with a peak of 6.98 MB;
  DOM count stays at 702. Audio, projectiles and effects remain bounded. This
  Apple M1 Pro / Chrome for Testing 148 / 1440 by 900 run uses invulnerable load
  fixtures, excludes mortar hazards, and is not a phone or balance benchmark.
- Three ordinary-progression captains finish all six charters: gunline seed
  12345 in 42.1 simulated minutes with 18 total vessels, merchant seed 91 in
  41.9 with 11, and balanced seed 744 in 41.8 with 10. Together they validate
  628 periodic campaign snapshots, the largest 88,168 bytes. Purchases, income,
  damage and victories are earned. These checks validate save shape without
  reloading every snapshot; they do not establish human enjoyment or difficulty.
- Core, voyage, work, feedback and trade checks pass. The Chromium controller
  route completes an earned trade, protected fishing, return, a purchased cargo
  lighter, transfer and fleet repair. Audio/moving aim, phone feedback and the
  WebKit launch, resize, pause and save checks pass. The connected browser route
  still covers sea stories, live rescue, mortar tells, import and ending controls.

Whole-game review: launch remains a dedicated game with a saved voyage. Early
trade, production and recovery retain their prices and balance; fleet attention
now leads directly to the relevant hull or repair. Larger fleets and battle cues
received the main visual work, and portrait sailing exposes more usable water.
Earth routes, charter content, harbor scenes and the score are unchanged.
Multiple campaign builds and the sustained battle extend the evidence beyond a
single short captain. Image generation remains deferred.

Next: build and test the desktop distribution path, then investigate continuation
at active combat and admiral boundaries. Transient enemies currently regenerate
on reload; the consequence for an injured admiral needs a dedicated check.
Physical devices, human pacing/listening, remapping, final assets and platform
integration remain release requirements. The production goal stays active.


## Pass 7, an actual desktop application, v0.9

The offline application packages the same game, coastlines, fonts, worker and
audio synthesis in a local ASAR archive. There is no development server or
website dependency. A dedicated application identity, cutter icon, native file
pickers, full screen and Quit complete the window-level flow. The web interface
keeps these desktop-only actions hidden. The Sluice desktop project is untouched.

The profile and origin remain stable across version updates. Native exports
report actual completion or cancellation, and imports retain the existing
campaign validator. Closing the window first writes the current fleet, then
flushes storage. Write failure leaves the window open by default with export
still usable. A second instance cannot open the same profile concurrently.

The native-window check exposed a mismatch between OS minimization and the
renderer visibility reported through automation. The app now forwards its own
blur, minimize, hide, lock and suspend events into the game's existing activity
scheduler. Returning can restore UI scheduling but cannot silently unpause the
voyage. This avoids depending solely on document visibility at the host boundary.

Evidence:

- The staged application and the packaged Mac arm64 executable launch offline
  on Electron 44.9.0. Checks cover renderer isolation, resource/path boundaries,
  one profile owner, native full screen, exports, canceled pickers, failed file
  writes, malformed imports and restoring a portable browser-format save.
- The native captain buys sugar, follows the worker's water route, docks at
  Nassau, sells earned cargo, buys a trawler and begins protected fishing.
  Closing the OS window mid-watch and reopening preserves exact coins, fish,
  elapsed campaign time and work progress. Ordinary fixed steps accelerate
  travel; the run does not grant money, hull health or victories.
- Minimizing stops simulation and controller polling, and restoring retains the
  pause. Simulated OS suspend/resume signals also retain pause. Failed local
  storage leaves the application open and an emergency JSON export remains
  available. The final successful Quit closes the owned process.
- Chromium and WebKit web launcher checks still cover title, settings, file
  import, corrupt/unavailable storage, pause, rotation, touch and contained
  layouts. Native Quit stays hidden in the website. No gameplay balance or
  simulation module was changed during this pass.
- Mac arm64 and Windows x64 packages build with the same 22 served game files,
  about 675 KB before the runtime. Each served file has a byte count and SHA-256
  digest. The complete runtime folders are approximately 308 MB and 369 MB.
  The Windows package has not executed on Windows. Builds remain local.

Whole-game review: launch now has a concrete application counterpart to the web
home. Native persistence and window transitions were tested through earned trade
and protected production. Helm, combat, convoy behavior, world routes, campaign
content, interim harbors and the score share the same sources and remain at their
prior settings. Web/mobile launch and save regressions were checked around the
shell changes. The asset inventory includes font-rights checks and bundled
open-source notices; it does not claim all release rights are cleared.

Next: active combat continuation is now a verified issue, not just a suspicion.
A Red Widow reduced from 2,600 to 2,000 hull reloads at 2,600 after one step.
Fix named encounter continuity, then review interruption and return through
ordinary battles and sea operations. Keep working through the whole ledger.
Signing, proprietary font clearance, Windows/Linux/Steam Deck execution,
Steamworks/cloud integration, final art, remapping and physical/human play remain
open. This desktop increment does not complete the production goal.

## Pass 8, leaving and returning to the same battle, v0.10

The damaged-admiral check exposed a wider persistence gap: ordinary attackers,
projectiles, warnings and floating loot vanished on reload, and an active patrol
recreated its entire initial wave. The sea now saves its bounded combat state,
attack timing, convoy momentum and random sequence. Patrol survivors resume in
place. Fishing and oil watches retain their actual raiders as well as their
existing work progress. Port saves preserve the sequence for the next crossing.

Long campaign comparisons found an escort moving on load near a coastline. Its
restore clearance was 15 units while its actual hull clearance was 13. These now
agree. Sunk companions also leave the formation immediately, so a reload cannot
change a surviving boat's formation slot for a frame. Port snapshots discard the
unused sea pose. An active admiral has one sea label; its old anchorage label no
longer sits above the moving vessel's name.

Evidence:

- Focused checks compare simulation frames through all three admirals, their
  phases and pending attacks, ramming, moving cannonballs, mortar deadlines,
  patrol completion, rescues, protected fishing/oil, salvage pickup, sinking and
  coastal movement. Defeated admirals and completed operations cannot pay twice.
- Three earned automated captains each finish with identical final save values
  when run continuously and when reconstructed every 12 simulated seconds and
  at trading stops. Balanced seed 12345 takes 41.6 simulated minutes with 223
  reloads, merchant seed 91 takes 42.0 with 225, and gunline seed 744 takes 42.3
  with 226. All six runs finish the six charters through actual purchases, travel,
  trade, protection and combat. The resumed runs total 674 reloads. These runs
  establish continuity, not human enjoyment or target-device performance.
- A deliberately dense valid fixture holds 1,200 enemies, 3,500 shots, 4,096
  salvage items, 23 companion boats and complete navigation tracks in 955,503
  bytes. Primary and backup fit in local storage. Twelve paused browser saves
  measure 20.5 ms median / 27 ms slowest in Chromium and 18 / 22 ms in WebKit on
  the development Mac. These are storage costs, not sustained frame-rate claims.
- Chromium and WebKit cover desktop, 360 by 640 portrait and 667 by 375 landscape
  battle reloads, paused title return, full-size exports/imports, malformed data
  and backup recovery. An operation that parses but cannot resume at its saved
  location is rejected before loading; a subsequent failed primary write leaves
  the good backup intact. Launcher, preferences, touch, rotation and unavailable
  storage checks also pass in both engines. Screenshots were inspected.
- The packaged Mac arm64 app repeats the earned trade/fishing loop and exact
  window-close continuation with an admiral's pending mortars and the dense sea.
  Its native picker accepts the larger portable save. Mac arm64 and Windows x64
  packages rebuild with 23 served game files, about 687 KB before the runtime.
  Windows execution remains unverified and the packages remain local.

Whole-game review: launch and pause continue to provide the dedicated game
experience. Helm, combat, convoy, trade, work, progression and discoveries now
survive breaks together instead of only preserving campaign totals. Art and
audio remain interim, with the duplicate-label correction serving battle reading.
Input and mobile flows were checked around reload and import; no new control
scheme was introduced. Dense save costs and native close behavior were measured.
Original version-1 saves still load, but their missing historical combat state
cannot be recreated retroactively.

Next: check competing browser tabs and interrupted writes, then return to the
first-voyage and late-game feel review. Human pacing, physical devices, remapping,
final art, distribution rights and Steam/platform work remain open. This pass
does not complete the production goal.


## Pass 9, one fleet across browser windows, v0.11

Two-window play reproduced a real rollback in Chromium and WebKit. A captain
bought up to 22 sugar, then leaving an older window restored its 17-sugar fleet.
The browser shell now grants one window the device save. Continue here asks the
current window to pause and save, then loads that latest fleet after ownership
has transferred. An older window cannot save on close, change the campaign by
editing preferences, finish an obsolete restart confirmation, or import into a
fleet it no longer owns.

Writes now commit the primary before its backup. A failed primary leaves the
previous backup intact; a failed backup reports the successful primary honestly.
The storage slot moves to v2 while portable campaign JSON remains version 1.
This separates already-open older releases, which cannot participate in the new
handoff protocol. A valid old save migrates on play or a deliberate edit. Dense
migration can make room by removing only the other legacy copy, retaining the
validated source until the new primary succeeds.

Evidence:

- Real same-origin browser windows reproduce and prevent the original rollback,
  perform two-way handoffs, and preserve complete admiral battles, protected
  fishing and oil operations. Concurrent requests produce one writer.
- Both engines cover closed owners, history restoration, leaving during a
  request, denied saves with emergency export, retry, blocked or missing locks,
  the storage-event fallback, import ownership and canceled stale confirmations.
  A returned page with unsaved RAM keeps that fleet for export without replacing
  progress made elsewhere. Unsupported locking permits export-only play.
- Legacy checks cover a dense sea with both old copies, an old client writing
  after migration, visiting and leaving an untouched title, loading the latest
  old-version fleet on Continue, and importing before the first migrated voyage.
  Focused storage checks cover quota retries, retained valid sources, changed
  old copies, corrupt current data and partial backup failure.
- Phone review found a handoff notice competing with the footer at 667 by 375.
  The short title keeps a compact logo and two-line fleet summary, with the
  chapter still available in the voyage. The normal notice and all controls fit;
  longer recovery messages can scroll inside the menu. Portrait and landscape
  screenshots were inspected. Touch targets remain at least 44 pixels.

The desktop check found a separate focus defect: leaving macOS full screen could
leave the activity scheduler disabled while the document reported focus. The
native host now resynchronizes activity after full-screen, show and restore
transitions. This resumes scheduling without removing a deliberate game pause.
The staged and packaged Mac arm64 apps pass the native checks, including earned
trade and protected fishing, active-battle close/reopen, native import/export,
minimize/suspend, and failed-write recovery. Mac and Windows packages contain the
same 24 game files, 699,991 bytes before the runtime. Packaged asset digests and
host sources match the checkout. Windows execution remains unverified; binaries
remain local. Final Chromium and WebKit launcher checks pass, including the short
menu and touch layouts.

Whole-game review: the dedicated launcher remains the entry point and all
handoff/recovery flows stay inside the game. Trade, fleets, combat, fishing, oil
and campaign state transfer together. Helm, economy, content, provisional art
and audio retain their existing tuning; this pass changes persistence and the
short-screen menu, not difficulty. The dense save and ordinary launcher checks
remain part of regression coverage. This work closes a concrete progress-loss
bug, not the production goal.

Next: return to unassisted first-voyage clarity, steering and arrival feel, then
ordinary late-game combat and reasons to revisit the world. Keep reviewing the
whole ledger. Human pacing, physical devices, remapping, final art, distribution
rights and Steam/platform work remain open.


## Pass 10, taking and returning the helm, v0.12

A fresh manual departure exposed a misleading chart default: it pointed back to
Havana while the charter asked for Nassau. A short steering correction also
required reopening the chart, and the same "open the chart to resume" message
remained after arrival. The chart now suggests the current charter destination
when appropriate. At a fishing or oil ground it still offers the nearest harbor
for the return, including after the charter has advanced.

Resume course and Take helm are available on the ocean, on H, and on a standard
controller's left-stick click. Resumption asks the worker for a new water route
from the actual position. It checks the first leg again when the result arrives.
The check uses the flagship's collision radius; an initially larger clearance
incorrectly rejected a valid course after steering beside the Havana shore.
Manual input, cancel, chart, convoy, pause, blur, title, state replacement, work
and save handoff invalidate pending requests. A late reply cannot take control.
The fallback planner remains available after a worker error.

Passed waypoints now select the next leg in the same simulation step, removing
a one-frame throttle drop. Acceleration, manual turn speed, hull speeds and
collision behavior retain their existing tuning. Arrival has a quiet two-note
cue and distinguishes a harbor from a marked course. The helm button retains
keyboard focus through HUD updates. The short landscape touch view places the
objective between the hull and chart so course text cannot cover the joystick;
sea controls meet the 44-pixel target, including Pause. Singular boat counts
also read correctly after losing companions.

Play and verification:

- An ordinary local voyage sold the starting sugar in Nassau, bought a trawler,
  reached Bahama Bank using the new takeover/resume control, returned and bought
  the brig. Leaving the first watch unattended during development lost both
  companions. That unattended interval is not evidence about active balance.
- With earned replacements, the brig completed a real-time 60-fish watch using
  movement, automatic guns, broadside and repairs. Both companions had full hulls
  when the watch ended. A little sunfish and brass fire control were recovered.
  The convoy returned to Nassau, sold the 60 fish for 2,286 coins, fitted recovered
  parts and repaired for 18 coins. No resources or invulnerability were injected.
- Core, work, voyage, feedback, all 42 routes, Gibraltar in both directions,
  Iceland recovery, date-line passage and exact active-sea continuation pass.
  Three earned campaign styles still finish, with identical final saves across
  675 reloads: balanced 41.9 minutes, merchant 42.0, gunline 42.6. These timings
  belong to automated captains and do not establish human pacing.
- Chromium and WebKit pass the delayed-worker helm checks, including stale
  ownership, held controller buttons and preserved keyboard focus. Portrait
  360 by 640 and 390 by 844, and landscape 667 by 375 and 844 by 390, include
  pending and resumed controls with inspected screenshots. The chart and full
  controller flows pass, as does the connected browser trade/work/story loop.
- The browser battle check retained 1,200 enemies and 21 companions with sound;
  this run measured 10.2 ms p95 on the local M1 Pro. It is a short desktop check,
  not a physical-phone performance claim.
- The packaged Mac arm64 app passes native H takeover/resumption through its
  bundled worker, first trade and fishing, full screen, minimize/suspend, native
  files, failed-save recovery and active-sea close/reopen. Mac and Windows x64
  packages match all 24 source assets, 704,781 bytes, and their host scripts.
  Windows execution is still unverified. Binaries remain local.

Whole-game review: launch stays a full-window game; trade, the upgrade payoff,
real cargo, guard behavior, fishing, discoveries and the return to port were
played together. Oil and late campaign continuation were checked in the work
and earned-campaign suites. This pass does not alter prices, drop rates, work
rhythms, campaign content, harbor art or the score. Deferred art remains deferred.
The new information fits touch play without obscuring steering, and resumption
obeys the existing pause and save ownership rules.

Next: ordinary middle- and late-game combat with larger convoys, stragglers at
arrival, and the reasons to revisit ports after the charters. Review how early
milestone and rare-catch payments affect choices across several starting seeds.
Continue the entire ledger. Unassisted human sessions, physical controllers and
phones, remapping, final art, distribution rights and Steam/platform work remain
open. This increment does not complete the production goal.


## Pass 11, getting the whole convoy home, v0.13

The larger-fleet review found a serious gap in earlier campaign verification.
Some escorts stopped on a coast thousands of world units behind the flagship.
Docking then gathered all boats, hiding the failure and carrying their cargo into
port. One balanced run left Wren near Iceland on the Lisbon arrival; its final
Havana arrival left three boats in southern South America. A gunline run left
nine there. Earlier successful campaigns did not establish physical fleet travel.

Companions now use their actual hull clearance, retain checked coastal routes,
and return to direct formation legs when visible. They no longer depend on a
reachable point surviving in the flagship's trimmed wake. A finer local grid
connects narrow water pockets to the ocean graph when the broad route fails.
The Magellan pocket is checked in both directions. Tight turns continue far
enough to reach the next safe waypoint instead of stopping just short of it.
Only one companion starts a route search per simulation step. The worker shares
checked grid data and prewarms recovery routes from distant saved positions.

Docking requires every living boat to reach the harbor approach. Its radius
allows the widest full formation at the flagship ring's outer edge. Waiting
names appear at the helm, the dock button explains its state, and the convoy
desk prioritizes an endangered hull, then a waiting boat. Distance sort, actual
coordinates and selected-boat pointers help find it. The pointer placement now
handles tall portrait and short landscape HUDs. An interactive rescue arrival
also exposed a vessel name overlapping the signal name; ship labels now reserve
space for visible harbor, site, signal and approach text.

Companion routes are saved as bounded Float64 records. Old saves lacking them
remain readable. New orders, deployment and recall clear obsolete destinations.
The largest staged battle, with complete tracks and 128 route points for every
companion, occupies 1,018,674 bytes. Its primary and backup consume about 4.07 MB
of UTF-16 storage, within the existing allowance. The file limit was not raised.

Play and verification:

- Imported an earned v0.12 Havana-arrival save through the normal browser UI.
  Watched Wren, Sparrow and Mackerel sail from southern South America into the
  harbor approach. Docking then became available. All nine boats and their
  19 cargo units arrived, and the final charter reported nine boats home.
- Continued that fleet to the hospital-launch rescue. Automatic escorts changed
  their protection target, completed the operation and returned to formation.
  The nine boats reached New York, its twelfth visited port, with full hulls.
  The 27 cargo units sold for 1,608 coins, leaving 48,169 coins and empty holds.
  This was an earned late-game fleet at a low-threat rescue, not a new balance
  result for an early fleet. No resources were injected into this review save.
- A quiet maximum-fleet fixture sailed all 24 boats, in wide formation with a
  named guard, into all 24 ports over 132,831 simulation steps. The ordinary
  balanced, merchant and gunline captains still finish with identical saved
  outcomes across 676 reloads: 41.7, 42.2 and 42.7 simulated minutes respectively.
  Every surviving boat is checked before docking. Neither fixture is a claim
  about human pacing or long-term enjoyment.
- Focused checks cover both actual coast traps, conserved cargo and damage,
  narrow-channel routes, per-step planning limits, exact saved motion using a
  fresh Earth instance, old records, invalid route data, widest-formation
  arrival, rejected docking and changed work/guard orders. Core, helm, routes,
  trade, work, voyage, feedback, storage and full campaign checks pass.
- Chromium and WebKit cover a loaded stranded fleet, worker cache sharing,
  actual catch-up, blocked and successful docking, full-fleet distance sorting,
  selected pointers, dense-save backup/import/export and phone layouts at
  360 by 640, 390 by 844, 667 by 375 and 844 by 390. Screenshots were inspected.
  The warmed recovery measured about 1 ms for its slowest simulation step on
  this M1 Pro. A cold long-distance route can still cost over 100 ms; the worker
  reduces that initial cost for a loaded save. This is not a phone benchmark.

The packaged Mac arm64 app passes the earned trade and fishing loop, native
helm/worker flow, full screen and minimize behavior, failed-save handling, native
file round trips and active-sea OS-close continuation. Mac and Windows x64
packages match all 24 source assets, 712,063 bytes, and their host scripts.
Windows execution is unverified. The browser stress check retained 1,200
living enemies and 21 companions with sound at 9.8 ms p95 on this M1 Pro; it was
a short desktop check. Packages remain local development artifacts.

Whole-game review: title and menus remain a dedicated game. Actual fleet travel,
cargo return, rescue protection, final charter, continued sailing, a new port
and exact sales were reviewed together. Automated fishing and oil checks cover
changed worker routing. Harbor compositions and the score are unchanged; image
generation remains deferred. Early low-threat operations become easy with an
earned late fleet. That can express progression, but optional high-threat trips
and repeat trade need a stronger reason to spend an established company's money.

Next: compare ordinary late-game fights and protected work across fleet builds,
then improve optional voyage choices and rewards without flattening regional
trade or making early waters scale mechanically with the player. Continue the
whole ledger, including sound, mobile and small interactions. Physical-device
validation, unassisted human sessions, remapping, final art, distribution rights
and Steam integration remain open. This increment does not complete the goal.


## Pass 12, independent game identity and worthwhile return trips, v0.14

The owner rejected the inherited portfolio colors, editorial type and crowded
explanations. This is an explicit game-specific exception to the site's palette
rules. Widewake now uses blue seas, navy panels, cyan actions, amber currency and
coral danger. Its original title art and all 24 harbor palettes were retuned.
Century Supra is removed from the game and its desktop asset set. The site itself
is unchanged. Image generation remains deferred.

The presentation review used Balatro's official shop screenshot, DREDGE's official
media and Black Salt Games' mobile UI talk, linked in `WIDEWAKE.md`. Ports open on
their scene with six service buttons. Selecting a service opens its panel. Trade
shows the goods picker, one selected item, quantity and actual order totals.
Stories, market news and landing details expand on demand. The sea retains hull,
chart, fleet alert and relevant actions, with formation and manifests inside Fleet.
Routine instructions, duplicated controls, the persistent fleet strip and repeated
notifications were removed. The hidden strip's render work was also removed.
Phone landscape uses a wide inventory with selection beside the order; portrait
uses a focused service pane. Touch labels omit keyboard prompts.

The gameplay review preceding this correction added optional longer protected
work. Completing a site's standard watch unlocks its double, then its triple.
Each retains the site's fishing or oil rhythm. Later watches increase loads and
raider numbers, bring attacks from two checked water approaches and announce
those approaches. They do not increase enemy health. Forecasts state time, cargo,
payment and raid multiplier before deployment. Recall, full holds and losses
retain surviving cargo without awarding completion money or the next unlock.

Rare fish now replace a normal fish in the hold that received the haul. Discovery
records the find immediately; payment waits until the carrying boat reaches port.
A lost boat loses its specimens. Rescue applies cargo losses before payment.
Returning to port pays surviving specimens once and records their landing.
Historical receipts preserve the paid amount rather than depending on today's
prices. Old saves preserve earlier discovery payments without duplicating them.

Play and verification:

- Continued an earned late-game fleet through a double watch at Japan Trench,
  returned to Yokohama, landed five specimens for 4,600 coins, sold ordinary
  cargo, repaired and upgraded guns. The redesigned harbor was then used for
  an actual tea purchase. This fleet received no review-only money or boats.
- Compared the same earned eastern-charter fleet at Japan Trench. A passive
  double watch lost three of nine companions; deliberate interception retained
  all nine, completed 180 loads and earned the 1,188 coin completion payment.
  A third watch overwhelmed the smaller fleet. An expanded fleet bought with
  earned funds completed it, peaked at 185 living enemies and returned with
  losses. These are scripted tactics and one seed, not final balance evidence.
- Balanced, merchant and gunline captains completed all six charters in 41.7,
  42.2 and 42.4 simulated minutes. Continuous and resumed runs matched over
  674 reloads, including every harbor arrival. Longer watches also match exact
  saved outcomes. All 18 grounds, failed completion cases, lost carriers,
  capacity, legacy catches and invalid records have focused checks.
- Chromium and WebKit cover the six-view interface sweep, title, first work,
  longer watches and controller flow. Desktop, compact desktop, 360/390-wide
  portrait and 667/844-wide landscape layouts were inspected. The trade checks
  verify actual purchases, reachable controls and visible order buttons.
  All 24 harbor scenes and palettes are distinct. Phone emulation is not a
  substitute for physical-device play.
- Controller testing exposed a hidden-panel focus trap and skipped service
  actions. Harbor lists now follow their reading order. The short landscape
  title also clipped the other-window save notice; it now fits above the footer.
  Full save-ownership, failed-write and cross-window handoff checks pass.
  Chart review, course cancellation, guard orders, audio lifetime and feedback
  separation also pass through the new interface.
- A short Chromium battle retained 1,200 enemies and 21 companions with sound
  at 9.9 ms p95 on this M1 Pro. No browser errors were recorded. The earlier
  five-minute stress test remains useful history, but this pass's measurement
  is a short desktop check, not a sustained phone result.

The rebuilt Mac arm64 app passes the earned trade and fishing loop, bundled
route worker, native file round trips, minimize behavior, failed-save recovery
and exact active-sea OS-close continuation. Mac and Windows x64 packages match
all 23 source assets, 713,687 bytes, and the host scripts. Windows execution is
unverified. Both packages remain local development artifacts.

Whole-game review: launch, trading, steering, chart, fleet orders, protected work,
rare cargo, port return, upgrades, sound, touch and controller flows were assessed
together. Combat mechanics and regional prices remain unchanged. The new longer
watches provide another reason to prepare a fleet and return safely, but do not
resolve every late-game economy question. Original code-drawn art remains interim.

Next: resume ordinary late-game combat and trade pacing across different fleets,
including losses and the time needed to replace them. Keep the quieter interface
as a constraint on future features. Physical devices, unassisted human play,
remapping, final art, distribution rights and Steam integration remain open.
This increment does not complete the production goal.


## Pass 13, cargo fleets that can trade, v0.15

The late-game economy review found that every export market held only about
100 units. Extra cargo boats could not improve even a well-funded company's
orders. The same earned fleet made two Yokohama-Shanghai round trips with zero,
three and six purchased cargo lighters. Under the old markets all three variants
loaded the same orders: 122 tea, 114 textiles, 56 coffee and 40 oil. Their roughly
3,200 to 3,800 coin returns barely changed with the extra capacity.

All 24 ports now have regional warehouse sizes. Export stock ranges from 160 to
1,200 units, with smaller general markets. Price pressure is proportional to
that port's depth, so a large trading harbor can handle a bulk shipment. These
are fixed world values, not bonuses tied to the player. Stocks still deplete,
prices still respond per unit and passing days still recover supply. Quotes,
payments, physical holds and reserved workboat cargo use the existing contracts.
Combat bounties and protected-work yields are unchanged.

With the same earned starting fleet, the revised route loaded 317 units before
expansion and 647 after buying three lighters. Two round trips earned 10,898
versus 12,826 coins after operating costs and vessel losses, counting new boats
at replacement cost. Six additional lighters were less useful than three on this
repeated route: stock depletion and falling destination prices still matter.
The new earned merchant harness records actual purchases, arrivals, losses,
repairs and sales. This is a scripted comparison, not proof of final balance.

A live browser review bought three lighters with earned money, loaded 582 tea
for 27,505 coins, sailed the entire ten-boat convoy from Yokohama to Shanghai,
and sold all 587 tea aboard for 34,536 coins. All boats arrived. This also exposed
a focus error: selling the last cargo moved focus onto Buy. Exhausted orders
now return to the selected quantity, so a repeated keyboard or controller
confirmation cannot reverse the transaction. Phone tests cover this after both
selling the last cargo and filling the hold.

The trade chart also lost repeated cargo summaries and explanatory sentences.
It shows the purchase quote, destination sale, trade margin and a single brief
price-change notice. Prices and unavailable-order reasons remain explicit.
Compact dialog padding had also exposed scrolling text above sticky titles;
chart and work headings now meet the scroll edge.
The quiet harbor and sea layout, art direction and deferred image-generation
constraint carry forward.

Verification:

- Balanced, merchant and gunline earned captains complete all six charters in
  41.7, 42.2 and 42.7 simulated minutes. Continuous and resumed outcomes match
  over 676 reloads, including every harbor. The revised economy does not block
  the initial sugar trade, trawler, fishing, oil, upgrades or later admirals.
- The longer-work review still completes double and triple watches, applies
  actual cargo losses and returns to harbor. Its unchanged battles peak at
  185 living enemies. Market sales at the end use the revised prices.
- Core and market checks cover regional stocks, no player-scaled supply,
  warehouse exhaustion and recovery, full convoy loading, reserved work holds,
  exact unit versus bulk pricing, legacy impact records and same-port resale.
- Chromium and WebKit cover the chart, exact 800-plus-unit orders, completed
  purchases, saved cargo, repeat-confirm behavior and phone portrait/landscape
  reach. Standard-controller checks exercise the earned early loop and the
  empty-order focus behavior.

The rebuilt Mac arm64 app passes the earned trade and fishing loop, offline
route worker, native save round trips, failed-save recovery and exact active-sea
OS-close continuation. Mac and Windows x64 packages match all 23 source assets,
714,423 bytes, and the three host scripts. Windows execution remains unverified.
Both packages are local development artifacts, not distribution releases.

Whole-game review: the live route connected fleet purchases, cargo placement,
chart comparison, sailing, combat exposure, complete arrival and sale. Existing
longer-work and full-campaign evidence cover the progression connections. Sound,
steering, battle rules, harbor art and the sea HUD need no changes for this market
revision. The checks do not replace human balance sessions or physical devices.

Next: assess mixed cargo routes, sustained losses and optional pursuits after
maximum upgrades. Review combat readability and new-player choices without
adding back persistent explanations. Late double-watch income still exceeds
this relatively safe trading route; compare other regional routes and fleet
builds before changing rewards. The remaining release gates and production goal
stay open.

## Pass 14, readable attacks, v0.16

The combat review found that skiffs, gunners and rammers used nearly the same
shape. It also found a specific warning error: Last Light fired a wider fan
than its displayed sector. The ring warning did not reveal the four wider gaps.
Both problems weaken the player's ability to make a deliberate move.

The four ordinary enemy classes and three admirals now have individual chunky
silhouettes. Rammers have a pointed prow, gunners a long barrel, armored boats
a broad plated hull and the Iron King visible mortar wells. Small-screen minimum
sizes keep heavy boats and admirals recognizable. These are original code-drawn
sprites. The deferred image-generation instruction still applies.

Fan, ring and charge definitions are shared by firing, saved-state validation
and the renderer. Fan boundaries include every actual shot, ring spokes leave
the real gaps open, and a rammer's marked corridor shrinks as it completes its
charge. Windup arcs show timing. Mortar circles and attack outlines draw above
explosions and shots, with selection and names above them. An attack originating
outside the viewport can still show its incoming lanes. This adds no persistent
HUD text. Damage, speeds, firing times, rewards and the saved format are unchanged.

The live review resumed a v0.15 double watch at Japan Trench in v0.16. It was not
a successful defense: the trawler, one destroyer and two cargo lighters were lost.
Six boats reached Yokohama with 63 fish, other salvage and three rare catches.
The naturalist paid 2,550 coins at the harbor. Replacing all four lost boats cost
6,950 coins, repairs cost 88, and the restored ten-boat fleet retained 55,033 coins.
Selling the 63 surviving fish paid another 2,028 coins and returned focus to Max,
leaving 57,061 coins and ten units of other salvage. Cargo on lost boats stayed
lost. The review included long intervals relying on
automatic defenses, so it does not establish tuned difficulty or optimal tactics.
It does exercise a failed watch, an actual return and a recoverable fleet.

That return also exposed a small mismatch: the chart estimated ten seconds,
while the sea HUD rounded every short trip to one minute. Both now use the same
five-second estimates below one minute. Waiting for distant boats still has its
own arrival state.

Verification:

- New checks compare warning lanes against actual emitted rounds, including
  shot counts, full range, the Pacific seam, the four ring gaps and remaining
  charge distance. All seven silhouettes also differ without their colors.
- Chromium and WebKit render fan, ring and mortar encounters at desktop,
  portrait and landscape sizes, including explosions and reduced animation.
  Incoming lanes remain drawn when their source is outside the viewport.
- A staged 1,200-ship render with 300 charge warnings measured 7.4 ms p95 in
  Chromium and 5 ms in WebKit on this M1 Pro. This isolates drawing cost.
  A separate 60-second live simulation retained 1,200 enemies with targeting,
  shots, sound and saving at 9.2 ms p95. Memory, effects and voices stayed bounded.
  These desktop measurements do not establish sustained physical-phone results.
- Core and active-sea continuation checks pass. The balanced earned captain
  completes all six charters in 41.7 simulated minutes with 223 reconstructions;
  its final save exactly matches the v0.15 campaign. The warning refactor has
  not changed that captain's outcome.
- Helm checks in both browser engines cover the short ETA, steering, controller
  press edges, route cancellation, save handoff and four touch viewports. Fleet
  checks retain clear names, SOS pointers, zoom persistence and port repair.

The rebuilt Mac app passes offline trading, fishing, native file round trips,
failed-save recovery and exact active-admiral OS-close continuation. Mac arm64
and Windows x64 packages match all 23 game assets, 720,208 bytes, and the host
scripts. Windows execution is unverified. Both remain local development builds.

Whole-game review: this pass connects visible threats, manual movement, protected
work, losses, physical cargo, rare-catch landing, port repair and replacement.
The quieter harbor, regional trade, first voyage, camera and campaign remain
intact. Audio behavior is unchanged; specific attack sounds deserve a listening
pass. Final art, broad balance, physical devices and distribution gates remain
open.

Next: review the last admiral and optional pursuits through ordinary play, with
attention to audible danger and the choice between escaping, defending and
replacing a fleet. Mixed trading routes and repeated work income still need
comparison. The production goal remains active.

## Pass 15, earned harbor services, v0.17

The owner asked for fewer available decisions at the beginning, visible locked
areas and earned progression. They also approved the title screen and explicitly
asked to keep it. Its markup, art renderer and styling are unchanged, apart from
the version label.

Fresh voyages open Trade and Voyage. Fleet hiring opens at rank 2, Shipyard after
hauling 12 fish or reaching rank 3, and Jobs after the first charter or at rank 4.
Log opens at a second port or when an earlier discovery or loss needs a record.
The rank alternatives let trading and fighting captains progress without taking
every charter step in order. Existing acquisition history, upgrades, fittings
and delivery contracts preserve the corresponding access. Losses and spending
cannot close an earned service. The saved format is unchanged.

Locked services keep their place and a lock mark. Selecting one shows the
requirement, progress and a next action. Your boats remains available inside the
Fleet and Shipyard previews for repairs, transfers and guard orders. Unlocks
wait until port for brief feedback, without a modal or stolen focus. A newly
revealed shop never moves a held confirmation onto a purchase. Future vessels
have compact name/rank rows; charter history and sea reports expand on demand.

Play and verification:

- Played a separate fresh voyage through the ordinary interface. Early fighting
  and the first Nassau arrival opened Fleet and Log. Sold the twelve sugar,
  hired a trawler for 750 coins, protected its standard Bahama Bank watch, and
  returned all three boats. Rare catches paid 680 coins. Repairs cost 43 coins,
  the brig cost 2,800, and the first charter opened Jobs. Selling 57 fish paid
  2,622 coins, leaving 4,273 coins and nine units of other cargo. No resources or
  completed objectives were injected into this review voyage.
- Chromium and WebKit cover visible locks, short previews, permanent access,
  alternate paths, legacy contracts, rejected stale purchase actions, repairs,
  focus preservation and save/reload. All six desktop and phone viewport sizes
  fit; short landscape previews keep their next actions visible without scrolling.
- The browser and controller earned loops still reach fishing and the first
  charter. The title checks cover launch, continue, restart, import, nested pause,
  touch input and small viewports. The core, voyage and sea-save suites pass.
- The balanced earned captain completes six charters in 41.7 simulated minutes
  with 223 reconstructions. Its final hash matches v0.16 exactly. A short browser
  run retained 1,200 enemies and 21 companions with sound at 9.1 ms p95 on this
  M1 Pro. These are scripted desktop checks, not physical-phone or human pacing
  evidence.

The packaged Mac app passes offline trading, fishing, native files, failure
handling and exact active-sea OS-close continuation. Mac arm64 and Windows x64
packages match all 23 game assets, 729,584 bytes, and their host scripts. Windows
execution is still unverified. These remain local development builds.

Whole-game review: the first voyage now connects access, charter guidance,
purchases, work, damage, repairs, cargo sales and the next service. The approved
title, Earth, combat, economy, sound and save format remain intact. No images
were generated. The live Jobs review exposed another pacing question: early
offers can list distant Pacific destinations beside Havana, without the actual
sailing time or required buying capital in the offer. Review those contract
choices before broadening their rewards or adding more explanatory text.

Next: return to the last admiral, audible threat cues and optional pursuits;
include contract usefulness and actual route costs in the trade pass. Physical
devices, unassisted human sessions, remapping, final art, distribution rights
and Steam integration remain open. The production goal remains active.

## Pass 16, a separate isometric endgame sea trial

The owner changed the ocean brief: performance first, far more activity, an
isometric view, deliberate zoom, and a world built around believable local
waterways. They also explicitly asked to stage the work. The first stage is
`widewake-battle.html`, an isolated playable trial. It does not access campaign
storage. The v0.17 campaign, earned harbor services and approved title remain
unchanged. The trial's preset equipment is an engineering load, not earned
progression or proposed starting balance.

The trial has 24 finite friendly hulls, including four working boats, against a
target population of 16,384 live light raiders. Three raider roles move, attack,
take damage and sink. Destroyed boats are replaced by new approaching vessels.
Rapid guns intercept the front, flak clears pockets, and batteries aim into
dense groups with traveling arcing shells. Hostile projectiles have reserved
capacity. Going underway stops work, and production waits for boats to reach
their new stations. Cargo belongs to each working hull and is lost with it.

The first moving review completed the three-minute defense with all four
workboats afloat and 111,784 raiders sunk. That is cumulative destruction, not
the simultaneous population. This establishes a playable stress loop, not
tuned campaign difficulty: the supplied formation is deliberately very strong.
The next review must test breaches, useful manual intervention, varied fronts,
withdrawal and recovery rather than merely raising the enemy counter.

The new renderer draws original hull sides, raised cabins, rotating guns,
industrial towers, wakes and shells through instanced WebGL2 batches. The
simulation and camera share a tested isometric projection and inverse. Helm,
Fleet and Survey are stops on continuous zoom; wheel and two-finger pinch keep
the inspected water point in place. Steering eases the camera back toward the
flagship. Pinching clears held fire. Reduced motion removes decorative movement
and flashes. Graphics-context recovery pauses explicitly before resuming.

Verification and limits:

- Projection, picking, local collision queries, ordered piercing, hostile shot
  reserve, physical cargo loss, station arrival and deterministic replay pass.
  A three-minute simulation produces 114,955 actual kills and 131,330 spawns,
  with a 1.65 ms simulation-step p95 on this M1 Pro. Fixed simulation buffers
  occupy 2,253,312 bytes; this is not the browser's total memory footprint.
- The final-source three-minute Chromium run sustains the 16,384 target with
  111,950 kills, 17 GPU draw calls, about 7,000 visible raiders at its last
  sample, 9.8 ms whole-run frame p95 and 10.2 ms p99. The ordinary battle peaks
  at 359 simultaneous shots, with zero rejected shots and at most 19 audio
  voices. Thousands of rounds are a separate capacity fixture, not a claim
  about that organic sample.
- Chromium and WebKit cover keyboard steering, work/broadside controls, zoom,
  cleared held input on focus loss, manual resume and WebGL context recovery.
  Four emulated phone viewports retain the same simulation population and
  test rotation while paused. Chromium exercises native multi-touch pinch;
  WebKit checks touch controls and the camera buttons. These are desktop
  browser tests, not physical-phone certification.
- A separate two-second ceiling fixture refills the population to 16,384 before
  every step while filling all 8,192 projectile and 2,048 effect slots. It draws
  up to 7,760 visible rounds and includes real collision, kills and replenishment.
  Combined simulation, refill and draw submission measure 4.4 ms CPU p95, with
  10.2 ms frame p95. This artificial fixture is not normal encounter balance.
- The completed follow-up Chromium suite measures 14.2 ms frame p95 under 4x
  CPU throttling. Its one-minute sound-active continuation retains no heap
  growth after collection, measuring 80,196 bytes less at the last sample.
  The forced Canvas fallback keeps the full simulation, renders 3,552 visible
  raiders in its smaller viewport, and measures 9.9 ms frame p95 with a bounded
  164-sprite cache. WebGL remains the primary visual path. None of these short
  desktop samples substitutes for long sessions on a physical minimum device.

Whole-game review: the existing trading, work, progression and saves provide
integration requirements, but have not yet been connected to this renderer.
The title and harbor stay as approved. No images were generated. Small distant
ships need further readability review, especially on phones; the art and sound
still need a qualitative pass. This trial does not yet include terrain, bank
collision, global routes, salvage pickup loads, persistent battles, controller
input or native packaging. Those cannot be inferred from its frame-time result.

Next: complete the combat and camera feel review, then build one estuary greybox
from `WIDEWAKE_OCEAN.md`. Prove hull clearance, turning, current, draft, convoy
columns and recovery through one river and a shallow alternate route. Repeat
the endgame load against real geography before expanding the world or migrating
the campaign. The production goal remains active.

## Pass 17, weighted handling and two gun banks, trial v0.19

The initial trial let a boat move sideways while its hull turned afterward. Its
Broadside fired a radial circle, so orientation did little for that action. The
review also found no distinction between a manual aim point inside weapon reach
and one outside it, and no owned hit acknowledgement. Those weaknesses matter
before defining river bends or treating the sea trial as a finished battle.

Flagship and companion movement now uses heading, angular acceleration, throttle
and braking. Directional input remains relative to the isometric screen. Asking
for the opposite direction slows and turns the hull. A released helm coasts to
a stop; low analog input permits a slower approach. The current 86 m flagship
reaches 95 percent cruise in 3.38 seconds and needs 31.56 m to stop. Those numbers
are game tuning, not naval specifications. Ship-to-ship and bank collision,
reverse gear and constrained-water formation orders remain open.

The broadside sends 24 rounds from each side over roughly four tenths of a
second. A mouse hover or keyboard focus previews the actual bank lanes without
adding persistent instructions. Its footprint is derived from the same muzzle
positions and directions as the shots. Hull orientation now determines which
water the volley covers. The reload meter and disabled state acknowledge the
press immediately. Pause freezes the remaining rounds and resumes the same
volley. Touch activation does not leave the hover preview on screen.

Barrels recoil independently of their mounts. Gun impacts have a bounded flash
budget, and manual hits give a small confirmation and the existing impact sound.
A distant aim point shows the firing limit and a dashed remainder. Manual rounds
end on that indicated reach, including offset muzzles and the last partial
simulation step. Reduced motion removes barrel recoil and decorative impact
flashes. Hulls, turrets and traveling rounds share interpolated render poses,
while the simulation still steps at 60 Hz. Pooled raider slots retain their own
previous positions when compacted, preventing a swapped slot from sliding across
the screen. Arcing shells and explosions retain their full visible bounds.

WebKit initially skipped game buttons during Tab navigation and did not expose
the same focus-visible state as Chromium. The trial now cycles its available
controls explicitly, including the pause dialog, with a visible keyboard focus
state that clears on pointer use. Browser-level shortcuts remain available.

The moving review completed the working period with all four workboats afloat
and 120,524 cumulative kills. It included a right turn, a turn upward, a rolling
broadside, going underway, another turn and returning to work. The enemy battle
continued while production was paused underway, so that count is not a direct
score comparison with a stationary three-minute run. The preset still offers
very strong automatic protection: the separate stationary baseline wins without
manual intervention, while an unprotected wandering flagship can be destroyed.
Encounter variety, purposeful offensive movement and earned loadout balance
still require work.

Verification:

- Core collision, reserve, finite hull/cargo, deterministic simulation and the
  three-minute turnover test pass. The final core run records 113,347 kills,
  129,729 spawns and 1.44 ms simulation-step p95 on this M1 Pro. The additional
  pose history and shot ownership bring fixed buffers to 2,556,416 bytes.
- Handling checks measure acceleration, braking, bounded turning and equal
  diagonal speed. A moved convoy reaches every working station and resumes
  production. Shot checks cover both banks, all preview lanes, range endpoints,
  owned feedback and bounded impact/audio work.
- Chromium and WebKit exercise real keyboard and pointer actions, immediate
  reload feedback, pausing mid-volley, both aim states, actual manual hits,
  interpolated GPU positions without simulation mutation, reduced motion and
  touch cleanup. The existing touch layouts, focus-loss pause, context recovery,
  anchored zoom and storage isolation also pass.
- The three-minute Chromium continuation records 112,015 kills, roughly 16,384
  live raiders, 18 GPU batches, 9.9 ms whole-run frame p95 and 10.4 ms p99.
  The final sample draws 7,237 raiders. It rejects no shots and peaks at 20 audio
  voices. Collected heap grows by 81,848 bytes between the first and last
  samples; this short run does not settle long-session memory behavior.
- The 4x CPU-throttled desktop sample measures 13.3 ms frame p95. The full
  8,192-shot/2,048-effect fixture keeps 16,384 raiders before each step, draws
  up to 7,760 rounds and measures 4.1 ms combined CPU p95. The Canvas fallback
  retains the full simulation and measures 9.6 ms frame p95 in its smaller
  viewport. Physical-device verification remains required.

Whole-game review: the new movement and weapon geometry will affect future
channels, convoy deployment and work protection, so those systems now have
measurable constraints. The existing campaign's trading, charters, harbor
progression, active saves and desktop packages are unchanged. The approved title
is untouched. No images were generated. The trial still has no terrain, cargo
collection, persistent battles or earned progression, and its phone checks still
run on desktop hardware. These remain integration and release requirements.

Next: build the first navigable estuary greybox at the measured boat scale.
Prove channel width, turning room, banks, current, safe recovery and convoy
columns before adding a large world. Carry forward the open combat readability,
front variety, audio-priority and mobile-device work; the production goal remains
active.

## Pass 18, directional sprites and Bracken Reach, trial v0.20

The owner redirected this pass toward graphics while the first region was being
built, then clarified that Factorio was a reference for sprite detail and
animation, not industrial styling. The new ocean art remains nautical and
original. It is authored as editable geometry, baked once into directional color
and depth sprites, and drawn as instanced quads. The existing campaign and its
approved title remain unchanged. The owner also asked for regular production
pushes; this pass is a publishable milestone, not a completed production game.

The vessels now have shaped hulls, inset decks, seams, raised rails, cabin
windows, deck fittings and equipment for their roles. Friendly hulls have 64
headings and raiders have 32. Working winches and drill rods animate separately
from the hull and stop when a workboat leaves its station or fills its hold.
Their phases freeze rather than resetting when work stops. The hull's small bob
is shared by attached mounts and gear. Propellers, speed-driven stern wakes,
shadows and quiet layered water add motion without a particle per visible wave.
Reduced motion freezes decorative movement. The original turret/recoil system
remains; weapon mounting and finer animation still need an art review.

Bracken Reach is the first original region, an 8 by 12 km estuary in metre units.
Tern Yard, Lockmill and Reed Landing have different timber buildings and piers.
The winding main route is 9.0 km. The shallow reed cut saves the launch 1.24 km;
the 38 m escort and 61 m industrial ship need the deeper route. Shared depth,
current, salinity and bank data drive both navigation and rendering. Full hull
clearance uses conservative circle acceptance, then an oriented hull sample near
banks. Thin piers use separating-axis collision with the same footprints as the
art. Movement sweeps intermediate positions and stops before an obstruction.
Reverse and a six-metres-per-second tow along actual safe history provide recovery.

Route searches and tile preparation run in a worker. The camera retains an
overview while nearby terrain loads. Cache sweeps cover the three landings,
outer water and the minimum zoom, including revisiting an evicted region. Shore
detail includes grouped canopy variants, reeds, stones, mud, shallow-water color
and depth-driven wash. The first visual review found overly busy water and plain
buildings; this version quiets the surface and adds pitched roofs, planks, windows,
posts and dock fittings. Canvas retains ships, buildings and vegetation, with
simpler water and without the WebGL mechanism animations.

Verification on the M1 Pro:

- All three hulls complete their permitted round trips under actual steering
  simulation. The launch visits the reed landing and mill, then returns home.
  Deep-draft vessels reject the cut. Independent dense samples check 128 accepted
  hull poses. Bank and pier contact, reverse and tow preserve legal positions;
  the maximum tow step is 0.10 m at 60 Hz.
- Chromium and WebKit exercise steering, reverse, worker-plotted routes,
  freshwater arrival, zoom, focus-loss pause and four touch viewports. A detected
  41 px camera button was corrected to meet the 44 px target. Chromium also loses
  and restores the graphics context. Campaign storage stays untouched.
- Every one of the battle's 544 and region's 616 atlas frames contains visible
  pixels within its padded boundary. Both browser engines check work animation,
  stopping and resuming production, pause, reduced motion, and the forced Canvas
  route. Color/depth atlas storage is 20.06 MiB for battle and 22.73 MiB for the
  region. Packing scenery into shared shelves reduced the initial 48 MiB region atlas.
- The final three-minute Chromium combat continuation records 112,010 kills,
  16,379 remaining raiders, all 24 friendly hulls, 21 draw batches, 9.2 ms whole-run
  frame p95 and 9.3 ms p99. Collected heap grows by 90,332 bytes across the sample.
  The 4x CPU-throttled sample measures 15.5 ms frame p95. The full 8,192-shot and
  2,048-effect fixture retains 16,384 raiders before each step and measures 4.1 ms
  combined CPU p95. The Canvas battle measures 9.1 ms frame p95 with 193 cached
  sprites. These are desktop measurements, not a physical-mobile guarantee.
- The navigation cache sweep peaks at 24,935,680 bytes of retained vertex/prop
  payload and 84 tiles. Its desktop/touch samples measure 9.9 to 10.3 ms frame
  p95. GPU copies of terrain vertices and the sprite atlas are additional memory;
  these figures are not a total application-memory measurement.

Whole-game review: regional route constraints now give small and large hulls
different uses, which should feed trade, fishing and fleet progression. Those
loops still run in the existing campaign and are not yet connected to Bracken
Reach. This trial has no encounters, fleet columns, oil or fishing sites, tide
cycle, save migration or local economy. Quiet travel currently has little to
discover. The older Earth campaign's progression, markets, work, saves and
desktop packages are unchanged. Final harbor image generation remains deferred.

Next: carry a convoy through this region and make a connected work-and-return
loop, then test enemy routing and the endgame load at a bend and tile boundary.
Continue the weapon mounting, distant readability, more varied banks and audio
review before expanding the map. Physical phones, long sessions, human pacing
and Steam release gates remain open. The production objective is unfinished.

## Pass 19, smooth motion and reachable builds, v0.21

The owner reported shimmering moving pixel art, an old version on the main site,
and unclear local access. The earlier ocean build had deployed successfully, but
its separate URLs were missing from the main title and the campaign still showed
0.17. The title now provides New ocean, with Explore Bracken Reach and Defend the
fleet. Every entry point shows 0.21.0. The approved title art is unchanged. The
navigation and combat trials remain separate from the campaign and its save.
Both trials, their dependencies and the terrain worker also enter the offline
package through its explicit local navigation and resource allowlists.

The renderer previously drew at half CSS resolution, enlarged with pixelated CSS,
and nearest-sampled fine details. Frozen-simulation camera sweeps reproduced the
reported flicker. Ships also snapped to the nearest baked heading. Rendering now
uses a display-aware buffer capped near 2.1 million pixels, keeps fractional
positions, filters complete mip chains in isolated direction layers, and blends
neighbouring headings. Opaque depth is followed by blended silhouette coverage.
The second pass reuses uploaded instances. Animated water, trees and machinery
share interpolated visual time. Canvas fallback gets the same raster and sampling
correction. The campaign renderer also interpolates ships and projectiles between
simulation ticks and removes ship-position rounding.

In the deterministic Chromium pixel sweep, a translating tree's brightness range
fell from 16.83 percent to 0.37 percent; the escort fell from 4.08 to 0.49 percent.
The normalized temporal jump measure fell from 1.93 to 0.47 for that tree and 1.89
to 0.35 for the escort. Slow turning fell from 2.00 to 0.42. These are controlled
rendered-pixel measurements, not perceptual quality scores. Zoom across a mip
transition and a tiny distant raider are included in the regression. Chromium and
WebKit pass those checks, including a bounded raster on a simulated 3x display.

The unchanged 16,384-raider combat load completed a three-minute Chromium run
with 112,005 kills, all 24 friendly boats afloat, 1,080 fish and 720 oil loaded.
Whole-run frame intervals measured 9.5 ms at p95 and 10.3 ms at p99 on this M1 Pro.
The separate 4x CPU slowdown measured 14.5 ms at p95. The full 8,192-projectile /
2,048-effect fixture measured 4.3 ms p95 for CPU simulation plus drawing submission.
The blended edge pass brings normal combat to 31 draws. Both color and depth mip
chains together use 28.85 MiB for combat and 30.79 MiB for the region, below the
existing 32 MiB sprite budget. Canvas retained the same population with a bounded
256-sprite cache and measured 9.7 ms p95 frame intervals. These are machine-specific
results; physical mobile validation is still open.

Main-menu round trips exposed an unnecessary rewrite of loaded modern saves when
leaving the title. Untouched saves now wait for play or an intentional change,
as legacy saves already did. Both trial round trips preserve the saved voyage
byte for byte. Fresh visits do not create a campaign save. Chromium and WebKit
also pass the existing title, touch layouts, navigation, zoom-anchor, pause,
context-recovery and handling checks. Local play instructions now name the main
page and its menu route. The running local preview was synchronized only after
checking the Widewake dependencies, preserving unrelated checkout changes.

The complete retained-campaign browser run passed, including trading, protected
fishing, progression and ending controls; its 1,200-enemy scene measured 9.8 ms p95.
Chromium and WebKit both pass the multi-window ownership and recovery suite.
The handoff notice now sits beside Continue so it remains visible on short phones.
Controller navigation through the new menu passes, as do the offline Mac trial
launches, terrain worker, native file operations and exact OS-close continuation.

This pass fixes motion and access. Constrained-water convoys, connected trade and
work in Bracken Reach, campaign migration, further world content and the other
production gates remain open.

## v0.22: one ocean, one play flow

The approved title now starts or continues Bracken Reach. The trial chooser and
Earth play flow are retired. All three ports, trading, earned services, fleet
purchases, upgrades, production, salvage and combat share the metre-scale region.
A separate save namespace preserves old-world files. The offline package stages
28 files and no longer includes the Earth coastline or old campaign runtime.

The graphics pass seats and scales weapon mounts to the actual decks, replaces
block explosions with a short core and pressure ring, reduces surface noise,
and gives shoreline foliage distinct branching silhouettes. Ports use their
actual world scenery. The approved title illustration and smooth-motion renderer
are preserved.

The connected core test completes first trade, earned fishing, an oil fixture,
and a four-vessel Lockmill round trip with 812 raiders defeated before recovery
testing. Its first-stage funds are earned; its later oil fleet is a funded test
fixture. Chromium and WebKit cover real UI trade, worker routes, active fishing
save/reload, input release, and four touch layouts. Continuous-motion pixel
checks still pass. See `WIDEWAKE_REACH.md` for the current test entry points.

A focused 2,048-raider open-sea simulation initially cost 63 ms at the 95th
percentile because every enemy repeated terrain probes. Shared conservative
cells and the open-water fast path reduced that measured step to 0.77 ms on this
M1 Pro. This short diagnostic is not a physical-phone or whole-game frame-rate
claim. The separate sustained battle benchmark remains the endgame load check.

Remaining: larger terrain-aware fronts, player-led first-session pacing, deeper
fleet orders, additional regions and distinctive long-term encounters. This is
a connected replacement region, not a production or Steam release declaration.

The final three-minute browser soak held 16,384 target raiders with all 24
friendly hulls alive, 112,010 kills, 1,080 fish and 720 oil. Its full-run frame
p95 was 9.9 ms and p99 10.3 ms on the M1 Pro. Full projectile/effect capacity and
Canvas fallback checks also passed. This measures the shared open-sea benchmark.
The current campaign's geography-aware admission limit remains 2,048.

Final native staging passes the same-region launch, route worker, import/export,
minimize pause, and quit/relaunch persistence. Window handoff, quota failure and
backup recovery pass in the browser, with previous-world storage unchanged.
All ship headings and scenery atlas layers pass visibility and clipping checks;
the atlas remains under 32 MiB. The In Progress card now uses an actual capture
of the new harbor and boats rather than the retired Havana art.

## v0.23: a quieter game interface

The harbor now uses a service list over the actual world, a single delivery
shortcut and Cast off. Locked services explain the next requirement when opened.
The approved title artwork, menu composition and colors are unchanged.

Trade is a cargo ledger with original illustrations, one selected good, Buy/Sell
order modes, a quantity and an exact total. Max respects the current price curve,
coins and cargo space. Fleet and shipyard use actual boat previews and separate
owned boats, purchases, fittings and hulls. A paper chart keeps destinations and
route confirmation separate. Sailing uses compact hull/depth instruments and a
labelled Zoom control; settings and save-file controls remain folded on pause.

The pass checks full holds, empty cargo, unaffordable orders, later fleets,
upgrades, route selection, touch target spacing, nested menus and keyboard focus.
The UI harness covers Chromium and WebKit at desktop size and five phone layouts,
including 568 by 320 landscape. Browser ownership, quota recovery and old-world
storage protection still pass. The offline 29-file package passes native save
export/import, minimize pause and quit/relaunch. The connected campaign core test
still completes its trade, production and river-convoy checks.

Phone checks use browser device emulation on the M1 Pro, not physical handsets.
Controller checks exercise the actual focus/activation handlers without claiming
a hardware controller playthrough. No new enemy-capacity or performance claim is
made by this UI pass. The whole-game production goal remains open.

## v0.24: momentum, wakes and automatic combat

The owner made driving the priority and removed manual firing from the campaign.
Friendly boats now keep world-space momentum while their hulls turn. Surge, sway,
yaw and engine spool provide acceleration, sideslip, coasting and reverse thrust.
Hull size and cargo affect response. The launch turns promptly; heavier loaded
hulls need room. Routes, full-hull clearance, physical reverse and tow still pass.
A checked, staggered departure approach prevents support boats cutting across
quays to join the convoy. Engine spool and joining routes survive save/reload.

The launch is readable at the default camera distance on every tested viewport.
The yellow ring and filled hull marker are gone. Close, Fleet and Wide use
viewport-independent scale; rotation preserves the selected distance. Smooth
zoom anchors and a limited velocity lead keep the water ahead available.

Wake histories stay in the water when the boat turns or stops. Foam spreads
according to hull speed and emission strength, fades over twelve seconds, and
joins continuously through bends. Bow shoulders share the same rendering batch.
The fixed history uses 61,440 bytes; a 3,120-segment GPU allocation draws the
entire friendly fleet in one call. Distant samples are reduced. Canvas uses the
same history. Enemy count does not allocate more wake trails.

The campaign has no fire button, aiming or Space-to-shoot action. Guns acquire
their own targets, and a hostile in a clear bank arc releases a rolling broadside
on larger player hulls. Empty water does not consume the salvo. The isolated
engineering battle harness retains manual controls for its existing checks.

Validation includes the connected trade, fishing, oil and river-convoy sequence;
physics convergence, loaded hulls and reverse thrust; old-save defaults and
validation; world-anchored wake lifetime and all 24 bounded histories; automatic
starter guns and bank salvos; browser saves, quota recovery and writer ownership.
Chromium and WebKit checks cover real keyboard/pointer input, emulated phones,
rotation, camera anchors, Canvas fallback, menus and fleet progression. Existing
subpixel-motion and sprite-atlas checks still pass. The offline desktop shell
passes import/export, pause and quit/relaunch.

The M1 Pro browser benchmark retains 16,384 raiders, including its four-times CPU
throttle and full 8,192-shot / 2,048-effect fixture. A focused final render check
also fills all 24 wake histories before this capacity fixture. Its report lives
with the v0.24 visual evidence. These are local browser measurements, not a claim
of physical-phone or Steam production readiness. Human handling feedback,
long-session device testing and the remaining whole-game work are still needed.


## v0.25: the endgame button and fleet combat

The owner explicitly requested a public shortcut into full fleet combat. The
title and pause menus now offer Endgame combat. It uses the current ocean and
helm inside the main game, with a preset 24-boat fleet, 16,384 active enemies,
real production, five changing attack fronts, flanking raids, repair pickups
and win/loss/retry/return flows. Voyage storage remains separate. The title art
and its established styling are unchanged.

Cannons now have short burst rhythms, flak fires pairs, mortars stagger their
shots, and both flagship banks fire automatically when enemies enter their arcs.
Every friendly role has a defense, including the repair tender. Shared weapons
lead moving targets and divide shots between targets; mortar and flak crews
reserve impact cells to avoid wasting every salvo on one group. The normal
campaign receives the targeting and sound improvements without the preset
endgame fire rates. Derived weapon specs are cached outside save data.

The new iron ram has original hull geometry, a visible wind-up and a committed
charge lane. The player's steering can evade the charge. Rams seek workboats
but collide with other friendly hulls on the way. Repair crates reward leaving
the safe center and do not revive sunken boats. The fleet follow/hold order
changes actual workboat movement and production, rather than a display timer.

The camera leaves the swarm in view while a small pennant marks the flagship.
Health bars are reserved for workers and damaged escorts. Threat rounds stay
coral, friendly fire stays warm, and flak/mortar sounds have distinct attacks.
Short hit tints and water pressure rings show contact without filling the sea
with damage text. The HUD contains hull condition, the watch and its tally,
movement, one fleet order and Zoom. There are no manual firing controls.

The seeded pure-simulation watch completes 180 seconds, all five phases and
177,989 real kills, with finite hull damage and cargo. It verifies all 24 boats
fire, same-seed determinism, inert manual aim input, actual follow/hold pauses,
repair collection, ram commitment, win/loss and frozen results. Combat typed
arrays stay at 3,342,848 bytes. New enemies are admitted at most 48 per tick;
rounds, effects, crates, wakes and sounds have fixed limits.

The main-game Chromium pass measures 9.7 ms frame p95 with 6,521 enemies visible,
and 13.0 ms at four-times CPU throttling with 10,436 visible. Both retain the
16,384 simulation target and all 24 boats; 32 to 34 draw calls and at most 20
audio voices were recorded in those samples. These are M1 Pro browser results,
not physical-handset measurements. Chromium and WebKit verify the actual public
button, movement, fleet orders, pause/context recovery, win/retry/loss/return,
reload and voyage isolation. Phone layouts use real browser touch events in
Chromium and pointer input on WebKit's touch layout. Canvas retains the same
population rather than reducing combat behind its fallback.

The full-buffer fixture also runs the new automatic combat object, keeping
16,384 live enemies while refilling all 8,192 shots and 2,048 effects. It records
7,743 visible rounds and 1,488 wake segments across all 24 histories. Simulation
plus rendering takes 6.4 ms CPU p95, with 10.1 ms frame p95, in that local fixture.
The shared art checks retain the 32 MiB atlas budget and smooth heading blends.

The shortcut is intentionally powerful and easy to enter. Its test equipment
is not campaign progression. Human combat feel review, campaign balance, large
raids in constrained waterways, physical-device runs and the rest of the
whole-game production ledger remain open. This pass is not a production-ready
Steam release claim.

The v0.25.1 follow-up makes optional help match the active mode and reports only
living hulls and enemies in debug metrics. It changes no combat tuning.
