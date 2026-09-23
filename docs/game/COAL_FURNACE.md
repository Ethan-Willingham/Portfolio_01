# Coal furnace

The boiler uses large polygonal coal bodies and a staged burn model. Since
v28.63, WebGPU reacting flow owns combustion when available; see
[FIRE_SIMULATION.md](FIRE_SIMULATION.md) for gas transport, oxygen, thermal
exchange, persistence and measured performance. The combustion rates below
describe the retained CPU fallback. A new lump
has a 29 to 39 pixel bounding radius over the 320-pixel-wide grate, compared with
the former 13 to 20 pixel circles. Each unit still costs one coal from the
locker. Previously saved lumps keep their paid fuel, lifetime and original size.

Since v28.67, new fuel resembles lump charcoal: long blunt pieces mixed with
squat chunks, matte faces, lengthwise grain and small pits. The elongated shapes
are actual collision polygons, not stretched sprites. New pieces save their
polygons explicitly; older saved pieces keep their original geometry and fuel.

## Geometry and motion

`077-hearth-geometry.js` generates a seeded convex hull, recenters it on its
area centroid and calculates its area and moment of inertia. Art, pointer
picking, thermal exposure and collisions all use this same hull. Faces can rest
flush, corners can wedge, and an overhanging center of mass tips a piece off its
support. There is no hidden circular collision shape.

The simulation runs at 120 Hz. Separating-axis tests select a reference face;
clipping the incident edge supplies up to two contact points. Fourteen sequential
impulse passes solve linear and angular motion with Coulomb friction (0.72) and
low impact restitution (0.08). Persistent contacts reuse their previous support
and friction impulses. Five separate position passes remove overlap without
turning penetration into velocity. Gravity is 520 firebox pixels per second
squared. The sides and grate are fixed planes, with an open top.

Bodies are never pinned in place to make a stack look stable. Taking one into
the hand detaches its saved position from contacts, so unsupported coal falls.
Returning it restores gravity and contact. Loading stops at thirty-two bodies. Sixteen reserved slots allow fracture into
at most 48 burning bodies. Crowded beds use twenty impulse and nine position
passes to keep their contacts seated. Contact and ash work remain bounded.

## Combustion

The material model runs at 30 Hz on the same fixed clock. These are game-scale
rates and normalized temperatures, not a calibrated furnace or chemical model.

- Moisture starts at 5.5 to 10 percent on fresh coal. Warming evaporates it,
  consumes surface heat and emits pale vapor. Larger cores warm more slowly.
- Volatile fuel starts at 28 percent of combustible mass. A hot skin releases
  gas even before ignition; available oxygen controls how much produces flame
  and heat and how much leaves as smoke.
- Fixed carbon holds the other 72 percent. Its oxidation depends on core
  temperature, oxygen and the insulating ash coating. Once volatile fuel is
  exhausted, long flames give way to sustained coke glow and short fire wisps.
- The last carbon burns as embers. Spent coal breaks into persistent mineral grains,
  retains residual heat and gradually cools. Sweeping removes only spent material.

Each coal face samples its surroundings for exposed air. Adjacent hulls obstruct
the inlet; a compact pile can smolder. The grate admits air underneath, while
spent ash reduces that supply. Rearranging the pile opens faces; bellows increase
oxygen, reaction rate and fuel consumption. Their pressure decays over 2.7 seconds.

Heating uses a snapshot of nearby hot surfaces, so array order cannot propagate
fire through the whole pile in one tick. A cold boiler always needs an ignition
source. Reaction output heats the boiler's stored thermal state and, through the
existing bath service, the real bath water. Remaining fuel is an energy reserve,
not a countdown: several pieces burn simultaneously and tending changes the rate.

As fuel disappears, both mass and the visible contact hull shrink. Radius tends
toward `baseR * sqrt(0.20 + 0.80 * fuel)`, before the remaining mineral skeleton becomes loose ash. Shrinking supports make
the pile settle during the burn.

Since v28.65, solved contact impulses also measure compression from the pile.
Remaining carbon controls strength, and sustained overload accumulates damage.
A failed piece splits across a seeded plane through its centroid into two exact
convex portions. Their area shares divide reference mass, paid fuel share and
GPU thermal reservoirs. Their velocities inherit rigid motion at the new centers.
Each piece can split twice; the smallest pieces continue burning without further
splits. Fresh coal does not fragment just from dropping it.

Spent pieces turn into 4 to 12 mineral grains, retaining 16 percent of their dry
reference mass as game-scale residue. Up to 128 grains settle under gravity,
slide against coal polygons and form a small contact pile on the grate. When the
cap is reached, nearby grains merge without deleting mineral mass. Grains cool
on the CPU; their residual heat is not transferred back to the gas. The pile
reduces actual primary air in both combustion backends. Each sweep removes the
leftmost quarter and plays a rake stroke. It never refunds coal or removes live
fuel. Residue, custom fragment hulls, damage and generation persist in save v4.

## Art and feedback

`078-hearth-art.js` draws the shared hull with dark cleavage planes, interrupted
bedding lines, small pits and broken glossy edges. Surface heat opens glowing
fissures; ash coating covers parts of the black crust. The existing flame field
takes its intensity from actual volatile combustion. Separate bounded vapor
wisps show moisture and unburned gases. Impacts, ignition and bellows use physical
spark positions. Representative coal, fire, smoke and vapor draws run during
shader warm-up.

The boiler's tending hint reports the dominant burn phase, remaining fuel and
air. A crowded pile or obstructed grate prompts rearranging coal or raking ash.
The controls remain coal placement, flint, bellows and the rake.

## Persistence and verification

Hearth save version 4 adds fragments and granular residue to the
version 3 thermal state. It stores the base/current radius, fuel reservoirs, moisture,
surface and core heat, oxygen, emissions, coating and burn phase. Old hearth
saves migrate without increasing remaining fuel or extending purchased lifetime.
Geometry and contact caches are regenerated. Held pieces reload released with
zero throw velocity. Pause and tab suspension never trigger offline burning.

Run `node tools/test-hearth-physics.cjs` for face balance, overhang tipping,
friction, support removal, crowded drops, polygon containment and picking,
frame-rate independence, burn phases, material conservation, airflow, bellows,
ash obstruction, malformed saves and migration.

Run `node tools/fire-simulation-smoke.mjs` for the GPU fire and its numerical
checks. Run `node tools/coal-furnace-smoke.mjs` for a CPU-fallback full game boot, real mouse and phone
touch controls, staged fire screenshots, exact material save round trips,
bounded frame cost and clean shader warm-up. It owns its Chrome for Testing
process and saves screenshots outside the repository in `/tmp/sluice-coal-qa`.
