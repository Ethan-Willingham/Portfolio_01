# Smoke painter cache correctness gate

Run from the repository root:

```sh
node tools/perf/smoke-painter-cache/test-smoke-painter-cache.cjs
```

The runner extracts the current production painter and its state from
`js/sluice/190-smoke-webgl.js`. It compares them with the minimal frozen v28.134
reference in `fixtures/`. That fixture retains the original operations; existing
comment punctuation follows the repository rule. Provenance and hashes are in
`smoke-painter-provenance.json`.

The gate checks complete density, weighted-velocity and RGBA bytes, original
cache state, unchanged inputs, ordered canvas commands, exceptions and retries.
It covers append reuse, old-word edits, freezing and waking, shrink and swap,
capacity growth, input and accumulator replacement, unsupported storage,
NaN payloads, signed zero and six injected canvas failures. It requires actual
prefix reuse, so a candidate that always rebuilds cannot pass.

An explicit candidate fragment path as the first argument, `SMOKE_SOURCE`, or
`ROOT` selects another checkout. `REPORT_FILE` optionally saves the result.
The test launches no browser and measures no performance. Its canvas mocks and
`with` scope are for correctness only; the separate browser gate verifies real
pixels. See [SMOKE_OBSTACLE_CACHE.md](../../../docs/game/SMOKE_OBSTACLE_CACHE.md)
for measured scope and remaining limitations.
