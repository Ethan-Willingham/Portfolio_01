# Snow support pruning proof, v28.134

The accepted source is `js/sluice/159-snow-physics.js`. The frozen reference
closure is `tools/perf/fixtures/snow-support-v133.js`; its support-body SHA256
is `700f8524a3fcd263126f494e550d6f50171c45801cbb9be68f13790b9def0be0`.
The current fragment SHA256 is
`533e00ff0817f1532dbd3e7c448a4bdc502d214ebc0a0bf632a6df4952e88d9d`.
This proof concerns CPU landing-support search. It changes no GPU grain physics.

## Distinct optimization and unchanged semantics

The v28.134 support builder replaces the fixed nine-neighbor support query with the subset of those cells that intersects a conservative axis-aligned contact rectangle. It derives the rectangle from the current queued point and existing reach, without scanning candidate lists or maintaining bucket extrema/population. Earlier `earlier unresolved-bucket bounds`, `earlier lazy bounds`, and `earlier lazy-after-empty bounds` instead build actual bucket bounds eagerly or lazily. This is a different algorithm and does not repeat those candidates.

The original distance arithmetic `dx * dx + dy * dy <= reach2` is unchanged. Remaining cells retain original ascending r then c order; linked-list traversal, removals, roots, queue insertion, bed insertion and all coordinates remain unchanged. Skipped lists receive no reads or mutation in the builder. The only additional input work is coordinate-domain validation and reusable floor values. `liquidWorldSolidAt` receives exactly the original arguments in the original input order. This relies on the production predicate being a query, without mutation of the point arrays or Math functions while a build runs.

## Accepted domain and fallback

Pruning requires `1 <= cell <= 2^20`, `2^-10 <= reach <= cell`, and integer `3 <= width <= 2^26`. Every snow input must satisfy `0 <= x <= 2^20`, `-2^20 <= y <= 2^20`, and `0 <= floor(x / cell) < width`. These inequalities reject NaN and infinities. A single unsupported snow input disables pruning for the entire build, after the input pass and before BFS. Malformed constants also retain all nine cells. Non-snow inputs do not belong to the support graph and need no new restriction.

For a queued point in either edge column (`col == 0` or `col == width - 1`), retain all nine cells even when the build is otherwise eligible. This avoids row/column wrap through the original numeric key. Interior columns have canonical neighbor columns for every original c in -1, 0, 1. Negative y is fully supported.

The bounds also make numeric keys exact. `abs(row)` is at most 2^20, neighbor rows differ by at most one, width is at most 2^26 and canonical columns are below width. Every multiplication/addition used by the keys is an exactly representable integer with magnitude below 2^47. `row * width + col` is injective over integer rows and canonical columns. Thus the bucket for an interior `(row+r,col+c)` contains only points with those separate floor coordinates, rather than points from an aliased column outside the canonical domain.

## Conservative Number rounding argument

The proof concerns the existing JavaScript binary64 operations, rather than an ideal real circle. Let `u = 2^-53` be unit roundoff, `R` the already computed Number reach, and `z` either coordinate of an eligible queued point. Let `p` be the corresponding coordinate of a candidate accepted by the original distance predicate.

1. The accepted-domain reach square is finite and normal. In the original predicate, nonnegative rounded sum `RN(RN(dx^2) + RN(dy^2))` cannot be below either rounded squared term, because round-to-nearest is monotone and those terms are already representable. Therefore an accepted axis term is at most `RN(R^2)`.
2. If the rounded axis difference has magnitude at least R/2, its square is normal (R is at least 2^-10). The standard bounds for rounded subtraction and multiplication imply `abs(z-p) <= R * sqrt((1+u)/(1-u)) / (1-u)`. Using a loose bound, this is less than `R + 8*u*M`, where `M = x + abs(y) + cell + R + 1`. If the rounded difference is smaller than R/2, including a subnormal difference, its actual separation is already less than R plus that same loose margin. Coordinates, squares and sums cannot overflow in this domain.
3. The builder computes `pad = 64 * Number.EPSILON * (x + abs(y) + cell + R + 1)`, using the exact literal `1.4210854715202004e-14`. This is `128*u` times a rounded sum of five nonnegative terms. The sum has four additions, contains a term 1, and cannot overflow. Power-of-two scaling is normal and exact here. A deliberately loose lower bound is `pad >= 120*u*M`.
4. Each outward endpoint is formed with two original Number additions/subtractions: `RN(RN(z-R)-pad)` and `RN(RN(z+R)+pad)`. Their total absolute rounding error is less than `8*u*M` in this domain, including possible cancellation. The computed lower endpoint is therefore at most `z-R-112*u*M`, and the upper endpoint is at least `z+R+112*u*M`. Both contain every coordinate accepted under step 2, with substantial spare margin. No guessed geometric cell boundary or exact-real interpretation is needed.
5. Dividing two ordered finite Number coordinates by the same positive cell is monotone, including its rounding. Applying `floor` is also monotone. Consequently `floor(lower/cell) <= floor(p/cell) <= floor(upper/cell)` directly in Number arithmetic. There is no separate division-rounding assumption. The candidate intersects these inclusive bounds with the original [-1,1] offsets. Every original accepted contact remains in that intersection.

Because excluded cells contain no accepted contact, the original traversal of any excluded live list would perform no removals and no queue insertion. Removing that traversal preserves subsequent lists, BFS order, ordered bed entries and all logical scratch words. The original candidate predicate and Number arithmetic remain the authority near a threshold. Pruning does not change connectivity, contact radius, mass, material, velocity or GPU physics.

## Reproduction and measured scope

Run `node tools/perf/test-snow-support-range.mjs`. This is an untimed extracted
production-closure differential. It checks exact ordered bed entries and
residual heads, complete allocated points/next/queue arrays, terrain-query
argument bytes and unchanged inputs. Its diagnostic visits every excluded
live list and requires the original distance predicate to reject every
skipped candidate. It covers contact thresholds, adjacent Number values,
f32 arrays, negative y, signed zero, custom NaN payloads, aliases, unsupported
constants, edge columns and reused scratch capacities.

`FIXTURE=/absolute/capture/support-fixture.json` adds a real captured state.
An independently recorded ordered bed is required when that fixture provides
one; otherwise the comparison uses the frozen reference and validates every
recorded terrain-root query in original snow-slot order. `DUMP` optionally
saves the bounded JSON report. No temporary fixture is required by default.

Real captures contain 14,000 snow grains and a mixed state with 15,902 snow
among 36,289 liquids. Both pass complete state comparisons. The mixed state
retains 14,709 accepted links while distance checks fall from 233,529 to
118,852. The isolated browser benchmark includes the entire support closure,
but substitutes a recorded O(1) root oracle for production terrain queries.
Captured medians fall from 4.7 to 3.6 ms and from 5.5 to 4.1 ms. Dense and
adversarial cases are retained in the Downloads evidence packet. These are
function savings, not an established native FPS or maximum population.
