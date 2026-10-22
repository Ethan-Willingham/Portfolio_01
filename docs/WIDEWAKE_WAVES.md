# Widewake waves, v0.29.0

Owner direction, 2026-10-21: waves are central to the game. Connect their
appearance to boat handling, make boats substantially faster, and use the ocean
to communicate scale and movement. Improve the water's entire color treatment.

`js/widewake-waves.js` owns the physical field. Its four metre-scale wave bands
also generate the GLSL used by `js/widewake-ocean-art.js`. Wavelengths span 7.5
to 84 metres. Different directions, periods and gently curved fronts prevent
the surface from moving as one flat texture. Physics and drawing use simulation
time, so pause, background inactivity and context recovery do not advance waves.
The second pass raises the long swell from 1.15 to 2.05 metres of amplitude and
the crossing band from 0.48 to 0.82 metres. Channels retain a smaller response.

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

`js/widewake-wave-view.js` draws the physical wake crests in one bounded batch,
clips them at dry banks and supplies the Canvas sea. Open water uses deep blue,
coastal water shifts toward teal, and river water stays greener. Surface normals,
curved wave shoulders, sparse foam, quieter reflections and shallow bottom color
provide movement cues at world scale. There is no screen-space scrolling overlay.
Reduced motion removes decorative glitter while retaining essential wave motion
and physical hull response. Canvas uses the same heights and forces with simpler
shading and translucent wake ribbons. Foam trails and hull shadows now follow
the displaced water. WebGL trail ribbons are subdivided across their width to
conform to curved swells. Bounded spray fans sit outside the bow shoulders,
respond to speed and downward hull motion, and clip at dry banks. Canvas uses
single tapered ribbons so overlapping segment ends do not form bright beads.

The physical wake buffers use 25,152 bytes. The wake drawing buffer has a fixed
8,192-segment ceiling. Rendering limits never reduce physical forces or combat
damage. The existing session-only policy remains: no save controls or storage
writes are restored. Dormant snapshot helpers retain bounded wave state so
deterministic regression tests can resume it exactly.

## Verification

- `node tools/widewake/test-waves.cjs`: analytic gradients, surface velocity,
  shelter, dry land, sustained hull stability, size response, wake crossings,
  expiration, finite buffers, flat-water control and faster player hulls.
- `node tools/widewake/test-waves-browser.cjs`: real WebGL and Canvas scenes at
  1440 by 900 and 844 by 390, CPU/GPU wave parity, frozen pause pixels, moving
  hull poses, wake crests, bow spray and graphics-context restoration during
  endgame combat. The fast launch must show at least 18 pixels of vertical
  travel and 4 pixels of bow inclination at its actual helm zoom.
  Uses Playwright's own cached headless browser. `WIDEWAKE_CHROME` can select an
  explicit testing executable; never point it at a personal browser profile.
- Existing driving, fleet handling, projectile, water-pressure, connected campaign
  and full 16,384-raider battle checks remain regression coverage. Pressure-only
  tests explicitly use flat water to isolate blast integration. Holding-station
  tests now allow bounded wave drift instead of requiring motionless coordinates.

Browser sizes emulate mobile viewports. Physical-phone performance and the
owner's assessment of the final handling and ocean appearance remain necessary
release evidence. Do not call the game production-complete based on these checks.
