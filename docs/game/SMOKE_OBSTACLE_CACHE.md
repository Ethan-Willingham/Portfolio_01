# Smoke obstacle cache, v28.135

Ordinary desktop smoke reconstructs its liquid obstacle mask from the asynchronous
particle mirror. Snow shares those arrays. A small append previously invalidated
the mask and deposited the entire population again, even when every earlier input
word was unchanged.

v28.135 retains the completed density and weighted-velocity accumulators for a
strict append only after verifying every old x, y and vertical-velocity Float32
word and every old frozen byte. It then deposits the suffix in the original slot
order. Each Float32 accumulator receives exactly the same arithmetic and rounding
as a full rebuild. The original cache-hit path is retained.

The certificate also requires the same GPU instance, input arrays, cached object,
accumulators, world window and flow threshold. Edits, shrinking, swapping, freezing,
waking, camera-window changes and unsupported storage use the full rebuild.
Readback generation changes never substitute for the input-word proof. The private
word snapshots grow with input capacity; only scratch metadata persists.

The certificate is cleared before accumulator writes and committed after the
original cache assignment. A failed canvas paint cannot append the same suffix
again on retry. Optional snapshot allocation failures discard the certificate.
The original cached frozen copy remains the frozen-input witness for appends.

Empty density bins now explicitly write zero alpha and skip the remaining alpha
formula. Nonempty bins retain that formula, including exceptional-number behavior.
Image upload, canvas draw order, physical particles, solver steps and graphics
settings are unchanged.

## Verification and measured scope

The actual extracted painters passed 696 comparisons over 348 executions,
including 21 successful prefix reuses. These compare complete density,
weighted-velocity and RGBA buffers, original cache state, unchanged inputs and
ordered canvas calls. Fault/retry, capacity growth, identity changes, shrink/swap,
unusual Float32 words and unsupported inputs are included. A browser gate adds
83 comparisons of real canvas pixels, buffers, cache and commands before timing.
The portable correctness gate is retained in the repository:

```sh
node tools/perf/smoke-painter-cache/test-smoke-painter-cache.cjs
```

Six serial ABBA cycles of the lexical browser painter replay measured the synthetic
24,000-record append case at 0.53125 ms before and 0.11875 ms after. Its same-count
full rebuild measured 0.54375 ms before and 0.56250 ms after, exposing snapshot
overhead. These are averages of 16 calls, with terrain and GPU uploads excluded;
they are component service measurements, not game FPS. The earlier harness using
`with` substantially distorted hot-loop timing. A captured-state replay still
has an unexplained absolute deposit-cost disparity from the live game and is not
used to claim an in-game millisecond saving.

Two four-minute ordinary town routes kept normal snow, water and stock smoke,
carried all five original resident IDs for more than ten seconds each, and used
about five seconds of actual jets. With at least 9,000 active grains, mean recorded
smoke CPU cost was 0.6864 ms in the original route and 0.4366 ms in the candidate
route. During held-body frames it was 0.7815 ms and 0.4185 ms. Snow populations and
physical trajectories differed, so these observations are not a controlled total
FPS speedup. Four stationary full-game ABBA runs likewise showed no clear total
throughput change; their smoke painter was active much less often.

The natural candidate still exceeded the 8.33 ms CPU budget on 27.85 percent of
frames with at least 9,000 grains. Snow support construction, slime solving and
GPU liquid/snow work remain substantial. Native foreground 120 FPS capacity is
not established by this release. See [SLIME_SNOW_CAPACITY.md](SLIME_SNOW_CAPACITY.md)
for the continuing investigation.
