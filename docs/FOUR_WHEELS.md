# All Four Wheels

A standalone JavaScript game in progress at `four-wheels.html`, listed in the
In Progress section of `archive.html`. It has no Sluice dependencies or bundle step.

## The current game

One continuous, hand-built route, approximately 2,335 feet long in the game's
scale. The goal is to get the cart to the end. There is no countdown. The HUD
shows current distance, furthest distance and section. Falls are in the pause menu. Sections change the
HUD and scenery without stopping the simulation, replacing the cart, resetting
momentum or requesting another scene.

The route combines dirt, asphalt, grass shoulders, red and white racing curbs,
physical guardrails, bare cliff edges, two water crossings, and three grocery
stores. Turns are rounded centerline curves. Every road ribbon and rounded join
supplies the renderer and floor support. Tiles inside stores take priority over
road materials. Each tire samples the material under its own actual contact.
Dirt has grip 0.85 and drag 1.38; grass has grip 0.7 and drag 3.8; asphalt has grip
1 and drag 0.68; tile has grip and drag 1. Spills modify those same tire samples.

The twelve sections and their fall destinations are:

| Section | Surface | Rail sides | Fall returns to |
| --- | --- | --- | --- |
| The first push | Dirt | Both | The first push |
| The speed bumps | Asphalt | One | The first push |
| A grocery detour | Dirt and tile | One | The first push |
| The water crossing | Asphalt | One | The speed bumps |
| Quarry switchbacks | Dirt | One | A grocery detour |
| The boost gap | Asphalt | Both | The water crossing |
| No rail, no bargain | Dirt | None | The first push |
| The water relay | Dirt and tile | One | Quarry switchbacks |
| Grass on the outside | Dirt | One | The boost gap |
| Ice on the thin end | Asphalt | One | The boost gap |
| Last bottles | Asphalt and tile | One | The water relay |
| The last long turn | Dirt | None | Grass on the outside |

The road has real elevation: a gentle first hill, four speed bumps, a raised
causeway, a quarry climb and descent, a boost ramp across an empty gap, an icy
ledge, and a final climb. The cart has vertical velocity, pitch, roll and angular
rates. Four cylindrical tires, the lower frame, basket corners and handle produce
unilateral ground impulses. Unsupported contacts cannot pull the cart back onto
the floor. The shopper has an independent pelvis, flexible arms and braced legs.

## Terrain, jumps and the water relay

`four-wheels-terrain.js` is the shared height field and contact solver. It works
in the same artwork units as the existing cart, at 120 fixed steps per second.
Gravity is 200 units per second squared. Contact normals follow the local slope;
point Jacobians account for heading, angular velocity and independent caster
swivel. A normalized quaternion stores the cart tilt, including sideways and
upside-down poses. Heading absorbs quaternion twist so steering follows the basket. Sequential accumulated impulses remain nonnegative. Mild restitution and
ground damping settle landings without flattening the cart's orientation.
The empty cart rotates around a center of mass 10 units forward and 16 above its
floor pose. Low tire impacts and high basket impacts produce different pitch and
roll torques. Collision hulls are sliced at the obstacle's actual height. The
frame, rim and handle can hit and scrape the road. Turning over on supported
road no longer triggers a cliff fall. This is
a small game solver, not an imported general-purpose physics engine.

Hills use smooth centerline height profiles. The four painted speed bumps have
cosine sections, 4.5 units high and 30 units long. Their shape lifts each wheel
separately. The boost applies a directional force only at supported wheels;
the 55-unit ramp rises 18 units before a 70-unit gap. The gap removes the dirt,
asphalt, shoulders and rails. Leaving the ramp preserves upward and horizontal
velocity. Gravity determines airtime and where the tires land. A slow approach
can fall short. Airborne controls cannot create ground traction or braking.
Blue ice has tire grip 0.07 and rolling drag 0.085. Footing also reduces push,
pull and steering force. Braking before it is substantially more effective than
trying to stop while on it.

In the weekly shop, table 6 carries a water-filled vase beside two brass contacts
and a closed physical shutter. Only water film cells at sufficient depth count.
A four-neighbor flood fill must find a continuous wet path between the contacts;
two isolated puddles or ketchup do not count. A connection held for 0.3 seconds
latches the relay. The shutter then rises over 1.25 seconds, with its moving
bottom and top used by collisions. Its lamp and visible water path reflect the
actual relay state. The open relay, water, debris and toppled table survive falls
and reloads. Wet tires can paint a connecting trail if the vase lands to one side.

## Editable sources

- `four-wheels.html`: game shell, briefing, results and play notes.
- `four-wheels.css`: viewport canvas, floating HUD, paper menus and phone controls.
- `js/four-wheels-course.js`: route geometry, spatial hashes, surfaces, stores,
  guardrails, swinging-door poses, route distance, catches and saved-world schema.
- `js/four-wheels-stock.js`: furniture, supported stock, products, breakage and films.
- `js/four-wheels-terrain.js`: height fields, loaded ground contacts, recovery,
  boosts, gravity, landing and water connectivity.
- `js/four-wheels-tricks.js`: legacy timed-game regression fixture, not loaded by the live game.
- `js/four-wheels-physics.js`: cart, four caster constraints, contacts and fixed steps.
- `js/four-wheels-view.js`: shared isometric camera, pixel rasterizer and 3D models.
- `js/four-wheels-audio.js`: surface-aware wheel Foley, material impacts and audio lifecycle.
- `js/four-wheels.js`: input, lifecycle, saved run, records and UI.

`js/four-wheels-levels.js` and `tools/four-wheels-driver.cjs` remain as legacy
regression fixtures for the old timed store. The live page loads the course
module instead. Keep browser order: stock, terrain, course, physics, view, audio, main.

## Handling to preserve

The cart is a rigid body. The basket center is 14 units ahead and the walking
stance is about 16 behind. Steering applies a force couple without rotating the
existing velocity vector. Push and pull apply force along the heading. Brake
acts on the actual velocity.

The shopper is a separate spring mass. Legs support the pelvis on local ground,
while arms exchange impulses with the moving handle. Elbows bend before the
maximum reach becomes a unilateral tether. Knees crouch as the handle drops.
Torso lean has its own damped velocity and survives saves. The head follows the
torso rather than the basket tilt. Feet can lose ground independently of tires.
Countersteering shifts hand loading against a sideways tip. Pull opposes a
forward tip; push opposes an excessive backward tip. The finite balance torque
requires planted feet. No input grants traction to a fully airborne assembly.
The legacy timed fixtures retain their original combined body.

All four wheels have independent swivel angles, angular velocities and signed
rolling distances. Each fixed pivot carries a fork whose tire trails 5.5 units
behind it. The tire center is not the pivot. A tiny mirrored axle offset starts
the swing when pulling directly backward. Bearing drag exchanges angular momentum
with the chassis; idle casters keep their last angles. Ground impulses constrain
lateral tire velocity using body translation, yaw and caster swivel inertia.
Unsupported tires receive no ground grip. Unequal surfaces can produce braking yaw.

The menu's test cart button switches between the original four swivel wheels and
front swivel wheels with fixed rear forks. The rear pair are the pivots at local
X = 1, nearest the shopper. They stay aligned with the chassis while their tires
roll forward or backward. Their lateral grip and collision impulses act on the
chassis without an independent swivel degree of freedom, including on tilted
terrain. Front forks retain the existing caster physics. Fixed rear pins use
steel instead of gold. Switching preserves the cart, momentum, route and mess;
pressing the button again restores four swivel wheels. The selected arrangement
survives restart, falls and saved-run reloads. Practice inherits the current
arrangement, while returning to the run restores its parked arrangement.

The tire envelope is 8 by 4 units. Physical fork pivots, trailing tire contacts,
collision rectangles, colored tread and visible wheel models share the same pose.
The silver cart stays empty and translucent, with three-unit wire spacing so all
four wheels remain visible. The shopper has articulated trouser legs, planted and
swinging feet, travel-driven walking phase, a shaded head and eased effort/braking
lean. A small per-pixel depth buffer renders the cart and shopper. Metallic
rim tubes, tires, forks and limbs have shaded 3D faces, and hide each other at
their actual depth during a tumble. Each tire also has a height-dependent
contact shadow. Gait advances during physics, including travel around the handle while
rotating. Rendering and pause do not advance it.

The caster model follows the principles described by
[Arrizabalaga et al., 2021](https://arxiv.org/abs/2110.05604), simplified for a game.
The contact solver uses point velocity, equal and opposite impulses and Coulomb
friction, as described in [Box2D's simulation documentation](https://box2d.org/documentation/md_simulation.html).
No Box2D dependency is loaded.

## Route, collisions and falls

54 ordered wheel checkpoints keep progress tied to driving the route. A tire's
actual oriented envelope touching the 20-unit circle clears it, including exact
tangency. The basket or shopper alone cannot clear a checkpoint. The current
circle is visible, with a section number at an entrance and GO on intermediate
marks. Offscreen guidance points to that same circle. Direction arrows, numbered
roadside signs and the course map show the route. Distance projects between consecutive
cleared and upcoming marks, preventing a shortcut to the final platform from
raising the record. Four artwork units equal one displayed foot.

Guardrails and store walls use convex polygon collisions from their displayed
geometry. Basket, shopper and each tire receive separate contact impulses.
Contacts immediately turn the exact outlines and contact point red, including
resting contact with a 0.04-unit tolerance. The highlight fades over 0.32 seconds.
Grass remains supporting floor. Curbs are paint, not an invisible wall.

Each wheel samples support at its actual tilted, trailing contact. The feet
sample their own ground. Missing wheels lose grip and load; the remaining
contacts continue supporting and steering the cart. Losing two wheels does not
start a scripted fall. A two-wheel overhang can be pulled back. The actual
support torques determine pitch and roll as the center of mass moves beyond the
supported footprint. Tires can recover across a lip while within four units of
its top; they cannot teleport up through the underside of a platform.

A fall becomes committed when an unsupported body drops 38 units below its last
supporting surface. Cart angle alone does not commit a fall. Gravity and angular
momentum continue. The cart hits water at -50 or rock at -100. Its actual lowest
geometry meets the lower plane, and frame and tire contacts produce the rebound
and tumble before the catch returns it.
It then returns to the earlier catch using the same body, wheels and stock world.
Ordered progress rewinds. Furthest distance, furniture, products, doors, relay
and spills remain. There is no time penalty. Pause freezes gravity, relay motion
and water too. Practice catches at the practiced section instead. Props and
loose products can also fall off the track.

At the end, all route marks must be cleared and the complete basket, four tire
envelopes and shopper circle must fit inside the finish pad. Completion records
elapsed rolling time and falls without adding a deadline.

## The stores and persistent mess

Quick Mart, The Weekly Shop and Last Bottles have tiled floors, physical walls
with matching entrance/exit gaps, storefront signs and two hinged glass leaves
per entrance. The leaves rotate about fixed jambs, respond to cart and tire
impulses, spring closed with damping, and stop at their angular limits. Gentle
force opens them. A high impact breaks the actual leaf and spawns falling glass
pieces. Those share the 220-fragment cap with broken stock.

Ten tables and racks contain real supported products. Tables hold one water vase.
Racks populate tiers at 12, 22 and 32 units, with at most two rows per tier to keep
large racks bounded. Supported stock adds to mass, inertia and center of mass.
A bump transfers yaw, translation and tipping torque. Stock retains momentum
relative to a moved board. Gravity slides it as the board tilts. Crossing the
edge or losing support releases it with the board's actual 3D velocity.

Furniture is a full prism, rotating about its leading floor edge as it topples.
Its projected hull supplies the collision shape. Falling frames can hit each
other. A down rack remains a solid three-dimensional object on the floor.

Wine bottles, jars, vases, dishes, pots, cans, ketchup and cartons have mass,
friction, bounce, height, vertical velocity and tumbling. Fragile objects break
into physical fragments and pour their contents. A tire can crush a bottle that
the basket clears. Ketchup flattens and pours sauce. A water vase makes a clear
puddle. Cans roll and rattle; ceramic breaks differently from glass.

Floor films have material-specific flow, grip and drag. Flow runs at 20 Hz and
conserves volume. Tires pick up a limited coating and deposit it into clean cells,
leaving wet or colored tracks. Global cells cover the entire course. Supported
floor checks keep liquid out of the void. Collision broad phases, sleeping landed
items and a spatial product grid bound the simulation. Obstacles do not impose
clock penalties. Films spread conservatively, with a height difference contributing to flow on slopes.

Spin, slide, near-miss scoring, combos and their UI were removed in v22 by
owner request. Turning remains the cart's fundamental control. Short sounds,
contact flashes, dust, landing shake, edge recovery text and relay feedback
acknowledge physical events without adding another score.

## Camera, art and controls

The camera looks down about 52 degrees. Projection is x = 290 + 0.84(x-y),
y = 24 + 0.66(x+y) - 0.74z. Input and physics use world coordinates. Depth-sorted
solid faces draw furniture and products at their real heights. The cart and
articulated shopper use a small per-pixel depth buffer inside that world scene.

The following camera uses a 960-pixel canvas on wide views and 480 in portrait,
at scales 1.45 and 1.8 respectively. Canvas height matches the stage aspect ratio.
Course map fits the entire route without advancing physics. Lazy 256-unit floor
tiles cache deterministic gravel, asphalt flecks, grass tufts, flowers, curbs and
store tiles, capped at 32 canvases. Floor polygons are clipped into eight-unit
height-field facets. Exposed rock faces use the exact supporting edge, with
visible-side culling and vertical subdivisions for falling-cart occlusion.
Guardrail posts and beams follow the road height. The camera follows ground
elevation and part of a jump arc, retaining the lip in view during a drop. Floor polygons, support, rails, spills, shadows,
markers and overlays share the projection. The art is drawn locally and the game
has no runtime art requests or third-party engine.

The canvas fills the entire browser viewport from page load, with no reserved
header, footer, border or page scrolling. Distance, best and the current section
occupy one small dark panel at the upper left.
The upper right has two 44-pixel buttons: course map and pause/menu. There is no
always-visible minimap. The pause menu contains route progress, falls, the current
section's advice, unlocked practice, restart, sound, fullscreen, expandable help
and links back to the site. Help and the route picker scroll inside their dialogs.
Opening either clears driving input; closed dialogs cannot receive keyboard focus.
Tab and reverse Tab stay within the active dialog. Phone captions use small dark
labels above the driving stick, with no bottom background band.

Keyboard: W/S or up/down push/pull; A/D or left/right rotate; Space brakes;
P/Escape pauses; R requests a fresh run; F toggles fullscreen; M toggles the course
map. Inputs are scoped
to focus inside the game. Restart asks in-game before discarding the run and
retains records and unlocked practice. Escape cancels that confirmation.

Phones have one floating, two-axis left thumbstick, 140 to 200 pixels wide,
and a large momentary brake on the right. Dragging up pushes, down pulls,
and sideways turns. Diagonals combine those forces. The initial touch is
neutral anywhere in the control zone: the base appears under that thumb and
subsequent movement is relative to that frozen origin. A circular travel limit
and a 12-percent dead zone prevent accidental input. Releasing coasts. Braking
suppresses push/pull while preserving steering, including tip recovery.
Safe-area padding keeps both controls clear of the home indicator.

Native Touch Events own fingers; compatibility Pointer Events cannot create a
second input for them. Window-level touch end/cancel handlers release individual
identifiers and reconcile the complete remaining contact list. A new touch
also discards stale identifiers before claiming a control. Mouse and pen use
captured Pointer Events with window-level terminal listeners and a buttons-up
check. The stick springs back on release, cancellation, pause, blur, pagehide,
visibility loss, lost pointer capture or viewport/orientation changes. No held
input is persisted. The frozen origin and travel radius cannot change because
of a caption or browser layout adjustment. An attached keyboard can also use
the focused stick and brake; the normal desktop controls remain available.

## Sound effects

Sound is on by default and starts after the play button or sound button receives
a gesture. The menu saves its on/off preference in `four-wheels-sound-v1`, separate
from the run. Missing audio support or blocked storage still permits play.

The standalone Web Audio engine generates its own noise and resonant tones.
Loaded tires blend their surfaces and signed rolling speeds for gravel, grass,
asphalt, tile and ice rumble, including turns in place. Actual fork swivel produces
short squeaks; brake input and sideways tire slip produce a skid. Aligned forks
can roll sideways without a false skid. Travel adds light frame rattle, and the
shopper's gait adds footfalls. Unsupported wheels and airborne carts make no
rolling or skid noise.
The lifting relay shutter has a quiet motor sound.

Physical events play metal basket and guardrail knocks, rack crashes, can rattles, distinct
glass and ceramic breaks, bottle and vase splashes, sauce squashes, landing
thumps, water falls, boosts, checkpoints and the finish cue. Nearby impacts pan
with the isometric camera and fade with distance; distant stock cannot play a
close-up crash. Cooldowns, a 32-voice cap and a compressor bound noisy pileups.
Finished sources disconnect.
Pause, route selection, restart confirmation, focus loss and pagehide silence
loops and pending effects. Idle audio contexts suspend after their last effect
ends, then resume on the next play gesture. Late unlocks cannot revive paused
sound. Muting stops every sound, including scheduled cues. A closed context
rebuilds on the next play gesture; initialization failures release all audio nodes.
The game remains playable if the audio script itself fails to load.
The engine reads physics without changing the cart or consuming its randomness.
There are no audio downloads, music, or dependencies on Sluice's audio engine.

## Saves and practice

`four-wheels-course-v1` holds best distance, completion/time/falls, and one parked
challenge run. Older v1 through v6 timed record keys remain untouched. Every two
seconds of play, on pause, fall, recovery and pagehide, the game saves the cart,
casters, gait, route state, time, falls, furniture, props, supported and loose
stock, films, hinged doors, loaded contacts, vertical motion and the water relay. Restoring rebuilds shelf references
and film maps; it does not turn supported stock into falling products. Short-lived particles restart after reload. Mid-jump and mid-fall saves retain
vertical velocity, orientation, angular rates and delayed impact.

Loading parks a valid saved run behind Continue. Schema 3 migrates the former planar schema 1: records and store mess stay, new
vertical motion initializes on the terrain, and the new relay table gets a vase.
An old pose inside the new gap moves to its catch. Invalid versions or malformed
physics values start a fresh run safely. Blocked storage shows a short message
and permits play. Record distance stays after a fall or fresh start.

Reached sections unlock practice cards. Practice creates its own world while
parking the challenge snapshot. It cannot alter the challenge record or overwrite
its save. Exit practice/Return to run restores that parked challenge, including
its exact body momentum and mess. Reload during practice loads the parked challenge.

## Verification and release

Run `node --check` on all seven live scripts and the legacy fixture, then:

```sh
node tools/test-four-wheels.cjs
node tools/test-four-wheels-wheel-modes.cjs
node tools/test-four-wheels-stock.cjs
node tools/test-four-wheels-view.cjs
node tools/test-four-wheels-journey.cjs
node tools/test-four-wheels-tricks.cjs
node tools/test-four-wheels-terrain.cjs
node tools/test-four-wheels-balance.cjs
node tools/test-four-wheels-course.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-audio.cjs
CART_ENGINE=webkit NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-audio.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
MOBILE_ONLY=1 NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
MOBILE_ONLY=1 CART_ENGINE=webkit NODE_PATH=/path/to/playwright/node_modules node tools/test-four-wheels-browser.cjs
```

The old room and journey tests preserve handling and stock regression fixtures.
The audio suite renders real stereo PCM to check material spectra, every effect,
surface blending, tire motion, footfalls, shutter movement, distance attenuation,
voice cleanup and bounded pileup levels. Gesture-driven desktop and phone checks
cover audible driving, persisted mute, paused processing, unlock races, finish
cues, closed-context recovery, pagehide and unavailable audio or storage.
The new course tests verify floor continuity, material forces, real rail contacts,
water/cliff setbacks, retained world identity and mess, swinging/broken doors,
stock tiers, saved debris and films, corruption rejection, ordered tire progress,
complete finish footprint and removal of live spin rewards. Terrain checks
cover slope settling, individual bumps, savable overhangs, real launches, failed
jumps, airborne traction, ice, disconnected film rejection, table-powered relay
and saved airborne motion. The verification pilot drives all
twelve sections using player forces, without teleporting or forced falls.

The browser suite covers the same whole journey, desktop/mobile input, parked
reloads, practice isolation, restart confirmation, both falls, paused gravity,
edge rescue, jump reload, lifting water relay, ice, overview, fullscreen, 320-pixel phones, short landscape, blocked storage,
reduced motion, no scene requests and JavaScript errors. Layout assertions check the canvas itself against all four viewport edges,
compact separated HUD buttons, help scrolling, dialog keyboard focus and retained
phone controls. Mobile regressions cover neutral off-center starts, diagonals,
frozen origins, native release/cancellation outside controls, absent mouse
capture, missed terminal events, stale-contact repair and two-finger braking.
Chromium uses native CDP contacts; the optional managed WebKit run uses native
taps and WebKit TouchEvent/TouchList gestures. Private hooks and the
pilot are injected by the local test server, never shipped. Use the owned
`/Users/ethan/.local/bin/agent-chrome-for-testing` process and close it in finally.

`ASSETS=1` refreshes the 1200 by 750 thumbnail and WebP sibling from the renderer.
Keep the archive picture wrapper. Bump all eight CSS/script query versions for
any deployment. Commit only the game's changes and push main, which deploys via
GitHub Pages. Check deployed bytes and real desktop/mobile input before reporting
that a release is live.

## Balance and impact verification

`node tools/test-four-wheels-balance.cjs` checks countersteering recovery,
impact-height torque, a supported-road tumble, independent shopper motion over
bumps, rigid dimensions through a full rotation, deterministic recovery saves
and upgrading a v22 run. Saved schema 3 carries the tilt quaternion and shopper
spring velocities. Schema 2 upgrades these fields while keeping stock, the
relay, route progress and records. The browser checks include successive bump,
impact and recovery frames on desktop and touch controls on a phone.
