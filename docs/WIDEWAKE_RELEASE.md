# Widewake production goal

Owner direction, 2026-10-19: keep improving the whole game in repeated passes.
Treat the tiny actions, the connected experience and mobile play as seriously as
the large features. A playable public build is not the finish line. Opening the
game must feel like launching a purchased game, with no blog wrapper.

The goal is active. The current build is not a production release. The owner's
sales ambition informs the care invested; it is not a forecast or a completion
criterion. Tradewinds, It's About Pirates and BELTFED remain the three references.
The exact owner constraints and source links are in `WIDEWAKE.md`.

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
| Launch and identity | Dedicated title, saved-fleet summary, new/continue, settings, help and return flow | Maintain cohesive identity through every view; iterate beyond the initial title scene |
| First voyage | Earned starter trade and protected fishing complete in browser checks | Observe an unassisted first session; make controls, profit and the first purchase understandable without a long manual |
| Helm and camera | Acceleration, damping, route handoff, coastal collision and zoom work | Review turning, arrival, taking the helm, coasts and camera at every hull size and input method |
| Combat | Real projectiles, admiral tells, directional hits, reticles, recoil and distinct impacts | Review dense threat reading and formation decisions; verify difficulty with varied builds, not one scripted captain |
| Trade | Exact quotes, visible order quantities, reserved-hold explanation and no instant resale exploit | Reveal route opportunities; review market pacing and late-game reasons to trade |
| Convoy | Per-vessel manifests, assignments, reserves and physical movement | Review recovery after losses, large-fleet selection, convoy stragglers and clear causes of failure |
| Fishing and oil | Real protected workers, different grounds, rare catches | Review risk and yield, repeated-operation variety, rarity weighting, and reasons to change sites |
| Progression | Six solvable charters and three admirals; earned simulated campaign | More human play, build diversity, optional pursuits and free-play depth; eliminate grind or runaway snowballing |
| Earth and discovery | Real coastlines, 24 ports, 18 work sites and 15 signals | Review recognizable regions, travel interest, geography seams, legible chart and destination discovery |
| Art | Chunky native sprites and harbor scenes; 24 distinct briefs saved | Make compositions and silhouettes more individual; final image generation remains deferred by the owner |
| Sound | Original sparse score, sea/engine ambience, distinct spatial cues, independent mixer and bounded voices | Listening on speakers/headphones, broader regional atmosphere, long-session comfort and battle priority review |
| Interface and access | Keyboard, mouse and touch; dialog focus and pause | Controller operation, readable text, target size, focus order, settings, reduced motion and non-color threat cues |
| Mobile | Chromium and WebKit touch emulation | Full-screen portrait and landscape flows, safe areas, browser-height changes, sustained performance and physical-device validation |
| Saves and recovery | Validated imports, backup, actual fleet positions and courses | Launch without overwriting a fleet, storage errors, version migration, safe updates and long-session recovery |
| Performance | Short 1,200-enemy browser run on M1 Pro with sound active | Long-session and constrained-device budgets, memory stability, loading cost and input latency |
| Shipping | Public GitHub Pages build with cache versions | Desktop package, platform/controller services, asset/license inventory, release QA, distributable smoke checks and store materials |

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
