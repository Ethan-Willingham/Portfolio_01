# Widewake waves, v0.37.0

Owner direction, 2026-10-21: waves are central to the game. Connect their
appearance to boat handling, make boats substantially faster, and use the ocean
to communicate scale and movement. Improve the water's entire color treatment.

The owner's 2026-10-22 follow-up asks for more space between waves, so a captain
at full speed can identify the approaching face and its effect on the boat.

The next visual correction asks for clearer wave boundaries and better-looking
water. Stronger directional slope shading separates the rising face from the
dark falling face. A teal shoulder and a narrow, irregular foam lip identify
the crest. The lip tapers with the dominant packet's envelope, revealing its
ends, and its foam pattern travels in that packet's coordinates. The lip follows
the combined surface gradient, including companion swells. Foam breaks into
patches while a quieter shoulder keeps the whole ridge readable. Canvas uses
the same packet frame and simpler foam detail within its existing raster budget.
The physical wave field and spacing remain unchanged. The later rigid-body
correction below replaces the former launch behavior. Smaller sheltered waves
now receive stronger crest and face contrast at ordinary helm zoom.

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

Owner direction, 2026-10-22: jumping must follow scalable physics, with different
outcomes from different encounters. The former crest detector, speed threshold,
small-hull exemption, upward kick, minimum bow-up angle and forced landing pose
are removed. There is no requirement to jump on every wave.

Five pressure patches at the centre, bow, stern and both sides support one rigid
hull. Each samples the rendered sea. Immersion and draft determine displaced
water and buoyant force; relative water/hull velocity supplies dissipative
pressure. Patches outside the water exert no force. The hull integrates gravity,
vertical velocity, pitch, roll and angular momentum. Patch lever arms and hull
moments of inertia determine rotation. Cargo increases displacement and inertia.
The same calculation applies to every hull size without a launch-specific branch.

A hull leaves the water when all its patches lose contact. Its existing velocity
and rotation carry through free flight, under gravity of 9.81 m/s squared and
small angular drag. No takeoff impulse or pitch reset is applied. A falling wave
can expose the keel while the hull is already moving downward. Entry pressures
catch the hull on whichever patch contacts first, without snapping its height,
resetting its velocity or prescribing a bow dip. Partial immersion continuously
scales propeller, rudder and water-brake authority. Dry controls cannot generate
thrust or countersteer. Banking comes from lateral force below the centre of mass.

The solver uses bounded substeps scaled to the hull's natural time scale. It
retains the existing five reusable probes and applies detailed contact only to
the friendly fleet, never one body per raider. Dry-flight and contact events use
simulation time. Pause and inactivity retain the existing state.

The manual helm carries yaw after steering release, with less sideways grip and
longer coasting. Countersteering and braking apply stronger control. At full
speed, a 0.8-second turn followed by 0.75 seconds of straight throttle carries
about 45 degrees on the launch and 30 degrees on the patrol boat and frigate.
The former handling carried about 8 degrees. These are isolated flat-water
measurements; wave forces also affect the live voyage. Vector navigation and
autopilot keep their existing conservative steering response.

Ship poses use the integrated hull height and rotation, interpolated between
physics steps. Nearby friendly boats render their model geometry with pitch and roll.
Distant hulls and Canvas use an affine approximation on directional sprites.
Gun mounts follow the inclined deck; floating salvage and raiders share
the sea's height. Enemy movement uses a staggered, lightweight wave response,
independent of blast pressure. It allocates two fixed arrays rather than one
physics body per raider.

Bow spray and new stern foam stop while the hull is dry, leaving a gap in the
wake. The shadow stays on the water. First water contact records the relative
closing speed and location for the existing spray sheets and splash sound.
Effects stay at that contact point, freeze on pause and use the existing fixed
spray budget. The event supplies no extra landing force or damage penalty.

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
Its slope window has pixel derivatives for distance filtering. The packet frame
uses the same dominant-wave coefficients as the CPU sampler and generated GLSL,
so foam stays attached to the approaching ridge. Stronger shading normals reveal
the faces without changing geometric water depth or hull contact.
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
- `node tools/widewake/test-launch-jumps.cjs`: exact unsupported gravity,
  preserved rotation, dissipative entry, naturally different successive flights,
  speed/load/heading response, supported slow and sheltered controls, timestep
  convergence and exact continuation. Geometrically similar 6, 12, 24 and 48 m
  hulls cross scaled waves with speeds and times scaled by the square root of
  length; their normalized physical trajectories must agree.
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
  across multiple headings and starting phases, with a v0.31 spectrum control
  to catch a return of rapid overlapping waves. Hull separation and unsupported
  gravity are checked without requiring a prescribed rise on every crest.
- Existing driving, fleet handling, projectile, water-pressure, connected campaign
  and full 16,384-raider battle checks remain regression coverage. Pressure-only
  tests explicitly use flat water to isolate blast integration. Holding-station
  tests now allow bounded wave drift instead of requiring motionless coordinates.

Browser sizes emulate mobile viewports. Physical-phone performance and the
owner's assessment of the final handling and ocean appearance remain necessary
release evidence. Do not call the game production-complete based on these checks.
