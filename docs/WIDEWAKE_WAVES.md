# Widewake waves, v0.33.0

Owner direction, 2026-10-21: waves are central to the game. Connect their
appearance to boat handling, make boats substantially faster, and use the ocean
to communicate scale and movement. Improve the water's entire color treatment.

The owner's 2026-10-22 follow-up asks for more space between waves, so a captain
at full speed can identify the approaching face and its effect on the boat.

`js/widewake-waves.js` owns the physical field. Six wave packets also
generate the GLSL used by `js/widewake-ocean-art.js`. Each front has a smooth
envelope that varies across the crest and bends with slower group motion.
This breaks the long diagonal bands into finite swells. A dominant 144-metre
swell replaces the former 72-metre lead wave. Two quieter companion swells
vary its height and direction; the remaining small ripples add little motion
to the hull. Their asymmetric profile gives sharper crests and broader troughs.
The main swell takes about 2.8 seconds to cross a full-speed launch heading
into it, or 1.65 seconds for the patrol boat. Crossing and following seas take
longer. These are nominal encounter periods, not timers driving the hull.
Analytic
gradients include both the envelope and its bending, so the hulls follow the
same shaped water seen on screen. A smooth height limit bounds constructive
interference without clipped peaks. Physics and drawing use simulation time,
so pause, background inactivity and context recovery do not advance waves.
Channels retain a smaller response.

Open water carries the strongest swell. The same depth and salinity inputs used
by terrain reduce it in channels and toward dry banks. This is an authored,
analytic sea for the game, not a fluid solver or a meteorological forecast.
There is no wind menu, capsize penalty or new damage rule.

## Boats and handling

Each friendly hull samples its centre, bow, stern and both sides. Damped buoyancy
drives heave, pitch and roll. Hull length and cargo determine response: a launch
follows short waves more readily than a loaded industrial vessel. Surface slope
and orbital water velocity act on world momentum, and climbing a face adds
resistance. Small wave torques disturb heading without replacing rudder input.
All displacement still passes through the existing bank and pier checks.
Buoyancy damping follows the surface velocity under the moving hull, including
its forward speed across a slope. This keeps fast boats riding crests. Speed
raises the bow slightly, while carried angular momentum banks the hull into
its turn. Combined inclination is bounded so the sprite projection cannot invert.

The manual helm carries yaw after steering release, with less sideways grip and
longer coasting. Countersteering and braking apply stronger control. At full
speed, a 0.8-second turn followed by 0.75 seconds of straight throttle carries
about 45 degrees on the launch and 30 degrees on the patrol boat and frigate.
The former handling carried about 8 degrees. These are isolated flat-water
measurements; wave forces also affect the live voyage. Vector navigation and
autopilot keep their existing conservative steering response.

Ship sprites incline with the sampled water plane and interpolate between physics
steps. Their inclination is an affine approximation using the existing directional
sprites. Gun mounts follow the inclined deck; floating salvage and raiders share
the sea's height. Enemy movement uses a staggered, lightweight wave response,
independent of blast pressure. It allocates two fixed arrays rather than one
physics body per raider.

The owner's next correction asks for the small starter boat to get air and
splash down on each wave. A planing launch now releases from a substantial
crest after climbing its face. It carries upward velocity through a ballistic
arc with gravity, rather than remaining attached to the buoyancy spring.
Speed and load set takeoff strength. Slow launches and larger vessels retain
supported buoyancy. There is no jump button or new landing damage penalty.

While airborne, momentum carries the hull forward with little air steering;
water brakes and rudder grip return on contact. Bow spray and new stern foam
stop during flight, leaving a gap in the wake. The shadow stays on the water.
Landing is detected against the live wave surface. Relative impact speed drives
a brief grip and bow-dip response, two broken sheets of splash, and a splash
sound. Spray remains at the contact point as the boat moves on. Effects use
simulation time, pause with the boat and share the existing fixed spray budget.

The launch now makes 36 m/s, the patrol boat 72 m/s, and the frigate 68 m/s before
upgrades. Endgame captain speed is 72 m/s. Companion cruise speeds rise by 65
percent while staying below the captain. These are arcade values. Autopilot
retains the former conservative channel cruise limits and slows for bends.

## Wakes and water appearance

A fixed pool of 384 stern disturbances spreads through the water for eight
seconds. Speed and beam set their strength. Their aft arcs have a crest and
trough, fade with age, and can rock and push other friendly hulls. The player
emits a crest every 0.18 seconds, with slower companion sampling to keep the
fixed pool bounded. Wake height now grows to 0.55 metres on the broadest hulls.
Each hull excludes its own wake from its buoyancy probes. Hostile boats sample
ambient waves only, keeping the endgame load bounded. Existing twelve-second
foam trails retain turns and stopping history independently of this pressure.

The owner rejected the diagonal bands, expanding wake circles and narrow
smoke-like trail on 2026-10-22. Physical wake packets remain invisible. The
visible wash now separates into two spreading shoulders, leaving clear water
between them as it ages. Dense stern churn fades on a hull-relative travel
time, while broken foam remains along the arms of the V. Shared endpoints
preserve the path through turns. `js/widewake-wave-view.js` supplies bounded bow
spray and the Canvas sea. Open water uses deep blue, coastal water shifts toward
teal, and river water stays greener. Directional face lighting and view-dependent
sky reflection describe the slopes without canceling each other's contrast.
Broken foam follows narrow crest lips instead of filling every high patch.
The lip's slope window is narrowed for the longer swells, keeping whitecaps
close to their tops rather than spreading a foam carpet over the whole face.
There is no screen-space scrolling overlay.
Reduced motion removes decorative glitter while retaining essential wave motion
and physical hull response. Canvas uses the same heights and forces with simpler
shading and translucent wake ribbons. Foam trails and hull shadows follow
the displaced water. WebGL trail ribbons are subdivided along their length and
across their width to conform to curved swells. Bounded spray fans sit outside the bow shoulders,
respond to speed and downward hull motion, and clip at dry banks. Canvas uses
shared endpoint profiles and longitudinal alpha gradients to avoid bright
segment joints. Both wake paths clip widening shoulders at dry banks.

WebGL water resolves the viewing ray against the shared heightfield and writes
its actual projected surface depth. Crests can cover submerged hull pixels,
and troughs expose them. This replaces the v0.30 far-plane workaround, which
kept foam visible but left the sea without a waterline. Wake fragments solve
the same surface and use a small depth bias, so they stay on top of the water
without drawing through solid hulls or scenery. Land retains its own geometry.
The shoreline is still authored and fixed, with no advancing swash or
overturning breakers. Overview terrain omits depth until detailed tiles load.
Canvas retains simpler painter ordering and cannot provide WebGL waterline depth.

The physical wake buffers use 25,152 bytes. The spray drawing buffer has a fixed
8,192-segment ceiling, with at most 32 segments per friendly hull. Persistent
foam keeps 61,440 bytes of history and a fixed 3,120-segment GPU buffer of
262,080 bytes, including age and bank-edge depths. Rendering limits never reduce physical forces or combat
damage. The existing session-only policy remains: no save controls or storage
writes are restored. Dormant snapshot helpers retain bounded wave state so
deterministic regression tests can resume it exactly.

## Verification

- `node tools/widewake/test-waves.cjs`: analytic gradients, surface velocity,
  shelter, dry land, sustained hull stability, size response, wake crossings,
  expiration, finite buffers, flat-water control and faster player hulls.
- `node tools/widewake/test-launch-jumps.cjs`: repeated crest takeoffs in exposed
  and sheltered water, ballistic gravity, real water contact, air momentum,
  slow/heavy/flat controls, timestep convergence and mid-flight continuation.
- `node tools/widewake/test-launch-jumps-browser.cjs`: real takeoff, rising,
  apex, descent and landing frames in desktop and landscape-phone WebGL and
  Canvas. Checks wake gaps in flight, visible splash pixels, frozen effects and
  the rendered splash sound through an offline audio context.
- `node tools/widewake/test-waves-browser.cjs`: real WebGL and Canvas scenes at
  1440 by 900 and 844 by 390, CPU/GPU wave parity, frozen pause pixels, moving
  hull poses, foam trails, absence of circular wake crests, bow spray and graphics-context restoration during
  endgame combat. The fast launch must show at least 18 pixels of vertical
  travel and 4 pixels of bow inclination at its actual helm zoom.
  Uses Playwright's own cached headless browser. `WIDEWAKE_CHROME` can select an
  explicit testing executable; never point it at a personal browser profile.
- `node tools/widewake/test-wake-visibility-browser.cjs`: actual foam pixels at
  positive and negative wave heights, opaque hull and harbor-building occlusion,
  and dry-bank depth. A depth-disabled reference reveals any hidden trough foam.
- `node tools/widewake/test-water-depth-browser.cjs`: actual submerged geometry
  disappears below crests and returns in troughs on both water paths. Real
  launch pixels verify that water meets the hull while leaving its deck visible.
- `node tools/widewake/test-wash-shape-browser.cjs`: rendered stern churn,
  a clearing centre, two broken spreading shoulders, bounded history and
  desktop and landscape-phone images in WebGL and Canvas.
- `node tools/widewake/test-sea-volume-browser.cjs`: six-frame launch and escort
  full-encounter crest crossings at their actual helm zoom, with flat-water
  controls. Ordinary desktop and landscape-phone following views cover sheltered
  and exposed water. Actual framebuffer contrast is checked separately from
  physical hull travel; the wider fixed-camera sequence is supporting evidence.
- `node tools/widewake/test-swell-readability.cjs`: full-speed crest intervals
  and corresponding hull motion across multiple headings and starting phases,
  with a v0.31 spectrum control to catch a return of rapid overlapping jolts.
- Existing driving, fleet handling, projectile, water-pressure, connected campaign
  and full 16,384-raider battle checks remain regression coverage. Pressure-only
  tests explicitly use flat water to isolate blast integration. Holding-station
  tests now allow bounded wave drift instead of requiring motionless coordinates.

Browser sizes emulate mobile viewports. Physical-phone performance and the
owner's assessment of the final handling and ocean appearance remain necessary
release evidence. Do not call the game production-complete based on these checks.
