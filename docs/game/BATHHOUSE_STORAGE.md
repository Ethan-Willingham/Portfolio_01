# Bathhouse liquid storage

Three riveted 320 L silos sit beside the bathhouse. Each holds one liquid
identity. Empty silos can accept a different liquid. A sight glass shows the
actual fill fraction and the outlet wheel marks the selected liquid.

The game already has water, oil, brine, nectar, and lumen. The silos reuse those
identities, colors, and shared liquid particles. Oil remains a legacy resource;
storage does not enable underground oil deposits. Snow stays in the rig's
separate snow chamber and cannot silently become water in a silo.

`074-bath-silos.js` owns the storage state and transfer functions. Counts use the
same particles as the world solver and rig tank, with 100 particles per displayed
litre. Silos start empty, with the first assigned to water. No action replenishes
storage without removing the same quantity from its source.

- `bathSiloDepositRig()` explicitly unloads carried liquids into matching tanks,
  then empty tanks. A full store or a fourth liquid leaves the excess in the rig.
- `bathSiloDeposit(index, type, count)` fills one compatible vessel from the rig.
  `bathSiloWithdraw(index, count)` returns liquid within the rig's shared capacity,
  including space already occupied by snow.
- `bathSiloSelect(index)` selects that vessel's identity.
  `bathSiloSelectLiquid(type)` selects an identity directly.
- `bathLiquidCount(type)` includes silo stock, carried stock, recovered legacy
  supplies, and reserved pours. It never includes another material.
- `bathSiloEmit(type, count, x, y, vx, vy)` reserves stock and uses the existing
  liquid emitter. Only accepted particles leave inventory. A blocked nozzle or
  full solver leaves un-emitted particles in that identity's pending queue.

The hose must use `bathSiloEmit` for each actual discharge and must not also
subtract from `bathPour` or call `bathTakeWater`. Selection changes do not relabel
pending liquid. This lets water and mineral streams share the same tools without
turning all stored quantities into water.

`bathSiloSave()` records assigned identities, counts, temperature, selection,
and pending quantities. Call `bathSiloRestore(saved.silos, saved.pour)` after the
service restore has loaded `bathSupplies`; then clear the old `bathPour` field.
Separately reserved old queued water migrates even when typed silo queues are
also present; clearing `bathPour` after restore prevents a duplicate on the next
save. Recovered garden supplies fill compatible silos,
while overflow remains in its existing supply bin. Oversized or retired saved
vessels retain excess liquid in a pending queue instead of discarding it.
`bathSiloReset()` clears storage for a new game.

Stored liquid defaults to 20 C. Same-material transfers preserve the mass
weighted temperature. After successful emission,
`bathThermalOnPour(type, count, temperatureC, x, y)` gives the thermal model the
actual output. Optional `bathThermalRigTemperature` and `bathThermalRigReceive`
hooks allow a future rig temperature model without changing storage accounting.

`drawBathSilo(context, index, x, y, width, height, options)` and
`drawBathSilos(context, x, y, width, height, options)` use the existing building
palette, catalogue liquid colors, and caller-provided coordinates. They return
hit rectangles, leaving camera placement and input routing to the scene. Set
`labels: false` for tiny exterior art; room controls supply readable liquid names
and quantities. Representative silo art should draw during shader warm-up.

Verify the storage contract with `node tools/test-bath-silos.cjs`. It covers
multi-material transfers, full containers, snow separation, blocked and partial
emission, selection changes, thermal accounting, save reload, old supplies,
overflow retention, and drawing coordinates.

Exterior siting starts one tile beyond the tower's right eave and scans for a dry
208-pixel footprint. It excludes pond banks, the station/depot footprint, and the
world edge. The saved site stays fixed. `bathSilosExteriorRect()` and
`isPointOnBathSilos(x, y)` use the same bounds. `drawBathSilosExterior()` draws the
three vessels, stone plinth, and copper manifold, and calls
`bathSilosLayFoundation()` once to protect only the footprint's surface cells.
Deeper terrain remains mineable. As with the existing bath foundation, an old
save with the rig in a newly reinforced cell returns the rig to its top.

Developer mode can discharge the selected liquid through `bathSiloEmit` without
consuming or replenishing persistent inventory. The same emitter still enforces
blocked nozzles and solver capacity. Gameplay availability controls should allow
this mode explicitly, rather than adding fictional stock to silo save data.
