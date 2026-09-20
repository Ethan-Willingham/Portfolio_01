# Bathhouse service

The owner replaced surface pearl gardens with visiting sky slimes in v28.5.
This is the current playable slice. Individual guest requests have not been
chosen. The earlier planning document remains background for future work.

## Player routine

1. Gather water with the rig's scoop and mine coal near the surface.
2. Tap the bathhouse, or park at its door and press E, to enter.
3. ADD WATER pours stored water into the real tub. LIGHT / 10 COAL spends
   ten coal once to start the shared stove. New tubs start dry and cold.
4. Sky slimes arrive, bounce, wander, and enter on their own. Tap a warm-bath
   bubble, or press E, when the water level and warmth are sufficient.
5. Guests hop into the tub, relax, pay, and hop out. They leave through the
   entrance and reappear outside before wandering away.

The stove serves the whole tub. Admission never spends a per-guest dose of
water or coal. A low or cold tub pauses earned soaking time until restored.
The visitor loop continues while the player mines. The global pause stops it.

## Heat and water

The current fuel batch is ten coal for a four-minute fire. The stove warms
water gradually; adding cold water dilutes the warmth, and the tub cools after
the fire expires. The stored thermal state drives the existing GPU heat source,
water tint, convection, steam, and the visible flame. The CPU fallback uses the
same service warmth state. The temperature display is a game-scale estimate.

Water is counted in the shared liquid particles (100 particles per displayed
litre). ADD WATER transfers actual tank contents to a saved pouring reservoir,
then emits them into the tub. A blocked or full solver retains pending water.
The working level is 40 L and the refill cap is 150 L. Guests splash small
amounts across the rim while entering, bathing, and leaving. Physical contact
can spill more water. Floor contact deletes the liquid through the solver's
mutation journal and briefly darkens/wets the floor. Parked offscreen spills
are drained too. No floor spill returns to the tank or survives in a save.
Natural lakes and underground liquids remain available for the scoop.

## Current tuning

Two indoor guests, eight total visitors including carried and indoor guests.
An 18-second warm soak pays $75. These are initial timing/payment values,
not guest recipes. All visitors currently ask only for a warm bath.
`074-bath-service.js` contains the fuel, fill, warmth, duration, and payout
values. `348-sky-slimes.js` owns surface arrivals, wander, approach, and departure.
Underground NPC brains remain disabled by their existing flag.

## Sky visitor physics and appearance (v28.7)

Sky guests are circular bouncy bodies with a rotating stone crust and one classic
white googly eye. Its loose black disk responds to acceleration and only sometimes
glances at a nearby player. Impact squash is brief and visual; it never changes the
collision radius. Existing visitors acquire this appearance when loaded.

Ground contacts keep a fixed restitution (0.86 to 0.875, multiplied by 0.88 on
soil), with friction transferring slide into spin and rolling slowing gradually.
At least 240 physics substeps per second prevent fast visitors passing through
terrain. Rig contacts use the rig's traveled path, transfer momentum both ways,
and delay intentional hopping for 2.5 seconds. A stationary rig can be hopped over.
Natural rebounds finish before the visitor starts another intentional hop.

Water response measures the waterline beside the solid body and computes its
submerged circular area. Shallow puddles cushion a floor bounce; deeper water
slows the plunge and supports the guest at roughly 72 percent immersion. Drag
increases with speed. The existing CPU/GPU guest colliders displace real water,
and the entry splash changes velocity only. Sparse spray is excluded from the
waterline, and ambient flow coupling is filtered so the guest does not repeatedly
accelerate from its own delayed GPU wake.

## Save behavior and retired gardens

The additive `bathhouse` save field retains guests and their movement states,
soak progress, payment status, floor purchases, fire time, warmth, pending
water, recovered supplies, and irreversible spill totals. World and mineral
liquid saves retain the carved room and its actual water. Restoring re-arms
the stove without refilling it, charging guests again, or repeating payments.

A legacy `garden` envelope refunds purchased land, credits construction ores
at their ordinary value and any ready pearl, replaces only the former bowl
footprint with dirt, lifts trapped actors onto its surface, and recovers its
liquid as bathhouse stock. New saves omit `garden`, so conversion happens once.
The old garden renderer, construction, production loop, and tests are retired.

## Verification

- `node tools/test-sky-slimes.cjs`: collision, capture, identity, population.
- `node tools/test-sky-slime-physics.cjs`: restitution, rolling, rig momentum,
  fast wall collisions, water depth, buoyancy, and eye motion at 30/60/144 Hz.
- `node tools/sky-slime-smoke.mjs`: browser art views, normal drive input,
  real WebGPU water entry/bobbing and particle conservation.
- `node tools/test-bathhouse.cjs`: navigation at 30/60/144 Hz, ten-coal startup,
  shared resources, warmth, payment, reload, departure, migration, floor drains.
- `node tools/bathhouse-smoke.mjs`: real browser, water solver, shared stove,
  visitor service, persistence, desktop and phone views. Uses the dedicated
  Chrome for Testing launcher and closes its own child process.
