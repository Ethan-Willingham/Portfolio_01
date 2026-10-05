# One Shift

A standalone top-down warehouse game. Its editable sources are classic scripts
under `js/one-shift-*.js`; it has no bundle step or other-game dependencies.
One tile represents four feet. Rates, equipment prices and daily wages are
scaled game-balance values, not quotations or training advice.

## Simulation

Fixed 20 Hz steps use seeded randomness. The clock advances 1.37 game minutes
per real second. People move independently of that clock. Cases retain their
item, client, lot, received day and best-by date through picking. Holds and
task reservations remove stock from availability.

Receiving requires paperwork, a matching seal, a reachable rear pallet label
and a count confirmation. A* supplies the worker's walk and pallet-jack route.
Workers stage, store, build case pallets, wrap and load through the same
validated commands used by the test driver. Wrong loading scans return a
reason; deliberately bypassed scans can cause a chargeback.

The forklift requires training and precedes hiring. Upper rack levels require
the forklift. The third shift opens optional contracts and purchases.

The SSCC uses GS1's documentation prefix 0614141. The label encodes AI 00
and an 18-digit SSCC in Code 128 C with FNC1, symbol checksum and quiet zones.
The published GS1 example `106141412345678908` is a regression vector.

## Sources

- [GS1 logistic label guideline](https://ref.gs1.org/guidelines/logistic-label/)
  for logistics labels and SSCC structure.
- [GS1 tag data standard](https://ref.gs1.org/standards/tds/1.12.0/)
  for the example prefix and SSCC vector.
- [OSHA powered industrial trucks](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178)
  for operator training, evaluation and workplace safety.
- [Red Stag warehouse services](https://redstagfulfillment.com/warehouse-services/)
  for kitting and cross-docking as actual services.
- [MET CO pricing](https://metcorpusa.com/pricing) for a published example of
  per-pallet storage and handling. Game prices remain scaled.

## Checks

Run `node tools/test-one-shift.cjs`. Verified at M1:

- Correct check digit on the GS1 example and 999 generated SSCCs; FNC1,
  Code C numeric pairs, checksum, stop symbol and quiet-zone width.
- Bot completes day one through player commands: seven received pallets,
  three shipped pallets and both outbound trucks complete.
- Three-day ramp: shortage recorded, case pallet built and wrapped, positive
  daily operating profit and no missed outbound truck.
- Goods conservation and ledger reconciliation on the ramp.
- Equal state hashes for equal seeds and commands; JSON state round trip.
- Forklift training and hiring prerequisite; holds, reservations and FEFO.

Browser, save corruption/migration, long-run economy, pathing stress and frame
budgets remain unverified at this milestone. The headless checks do not establish
cold-player usability or a finished commercial game.
