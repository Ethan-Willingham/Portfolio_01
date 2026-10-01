# Direct snow support reconstruction

This change makes the CPU reconstruction of snow's landing surface cheaper without reducing grains, support contacts, solver steps or snapshot freshness. Eligible builds replace numeric Map lookups for bucket heads with a bounded stamped array and reuse the original Number bucket coordinates. The support bed returned to the game remains the original Map, with the same keys, grain coordinates and insertion order.

Fresh liquid snapshots trigger complete support reconstruction. Visible wet residents can request snapshots every two frames rather than the usual twenty to maintain water coupling. This increases the frequency of a substantial CPU task while a large snow pile is present. The change retains those requests and makes each reconstruction cheaper.

## Exact behavior and fallback

A preflight reads every snow point, including terrain roots, before any terrain query. It caches the original Math.floor column and row values as Float64 and admits only ordinary nonshared typed arrays, finite supported coordinates, canonical interior columns, safe integer keys and a bounded rectangle with a one-cell halo. Every subsequent neighbor lookup lies inside that halo. Negative rows remain supported; border columns, negative or oversized column aliases, unsupported values/storage and excessive rectangles retain the complete original Map path.

The heads array preserves absent versus present-empty values through generation stamps. It does not change the linked lists, breadth-first queue, accepted neighbor-cell pruning, Number distance predicate or removals. The terrain predicate still runs once per original snow index, in the same order with the same arguments. Its production implementation is synchronous and does not change particle inputs; its basin lookup cache may update. Mutating or reentrant replacement predicates are outside this acceleration contract and are not dynamically detected.

The paired heads/stamp arrays retain at most 262,144 slots, or 2 MiB. Float64 coordinate scratch grows with point capacity. Optional allocation failure selects the original path before terrain calls, and the two table arrays commit together. Changing the rectangle or shrinking a population cannot expose old entries. Epoch wrap clears retained stamps. No root, connectivity or support result is reused across builds, so new snapshots and terrain edits still receive complete reconstruction.

## Validation

The portable gate uniquely reverses seven pinned source edits and requires the recovered complete source to match the immutable accepted baseline. It compares ordered bed and residual head Maps, complete original scratch and queue words, unchanged inputs and the terrain callback ledger. It covers Number and Float32 boundaries, signed zero, negative rows, key aliases, malformed coordinates/constants, shared storage, optional allocation failures, changing capacities/origins, halo-area limits, epoch wrap and terrain exceptions. Every direct lookup is compared with an independent original numeric-key Map projection.

The 1,989 synthetic-case gate and both 1,990-case captured-state gates passed. The captured rectangles required 6,969 and 13,780 slots. After the portable files are installed, run:

```sh
node tools/perf/snow-support-direct/gate.mjs
```

`AFTER` accepts the private candidate before integration. Optional `FIXTURE` adds a recorded state and checks its independently recorded ordered bed when present; `DUMP` saves the report. The gate requires no full frozen-source fixture, browser, GPU or performance clock.

Six serial lexical CPU ABBA cycles measured the full support closure, including preflight and table setup with warmed scratch. The controlled 14,000-grain capture fell from 3.6 to 2.4 ms median. The natural mixed capture, containing 15,902 snow grains among 36,289 particles, fell from 4.2 to 2.8 ms. Both improvements were 33.3%. These isolated measurements use the recorded original-slot root oracle and exclude production terrain-query service and GPU work.

## Controlled whole-game result

Four serial 30-second runs used ABBA order, five ordinary solving residents and 14,000 maintained snow grains. Water, particle weather maintenance and the baseline liquid GPU implementation stayed enabled. New atmospheric flakes were suppressed to retain the controlled population. Requested readback cadence two was a water-coupling demand proxy; it did not force wet residents. Actual physics progressed during each capture, and trajectories differed.

| Pooled measure | Baseline | Direct support |
| --- | ---: | ---: |
| Recorded callbacks | 4,708 | 5,005 |
| Full synchronous CPU median / p95 | 8.6 / 11.4 ms | 7.4 / 9.9 ms |
| CPU frames above 8.33 ms | 50.96% | 21.54% |
| Particle/weather median on support-build frames | 4.4 ms | 3.1 ms |
| Mean callback service rate | 78.52/s | 83.43/s |
| Completed support builds | 2,405 | 2,623 |
| Internal body calls | 108,015 | 107,925 |

All 2,623 candidate builds used the direct path. The improvement occurred with more completed support builds and nearly equal body work, rather than omitted support or fewer physical bodies. The particle/weather measurement is an inclusive parent bucket, not an additional cost to add to the full frame. Baseline and candidate two-quantum GPU spans had medians of 8.73 and 8.80 ms; GPU code was unchanged. CPU and GPU durations are not additive.

These timer-paced service results establish a CPU improvement in the controlled workload. They do not establish native display FPS or a 120 FPS population limit. The candidate still exceeded the CPU budget on 21.54% of callbacks, and sampled GPU spans remained substantial.

Two serial 240-second ordinary-input routes retained natural snow emission, water, stock smoke and production readback ownership. Original resident IDs 1 through 5 survived; IDs 1, 2 and 3 completed verified ten-second drags in both runs. Held-body time was 35.90 and 35.82 seconds, with about 2.30 seconds of actual jets. Baseline completed 3,253 support builds; the candidate completed 3,385, all through direct addressing, with no failures. Internal body calls were 430,872 and 431,454. Peak snow populations were 17,421 and 16,902, so this adaptive pair is an ordinary-use validation with different trajectories, not a perfectly fixed workload.

Full synchronous CPU median / p95 changed from 5.3 / 11.4 to 5.2 / 10.0 ms; frames above 8.33 ms changed from 13.64% to 11.95%. During handling, median CPU stayed 5.7 ms while p95 fell from 13.2 to 11.7 ms. Support-build particle/weather medians were 5.1 and 3.7 ms. In the 12,000 to 16,000 snow range they were 5.5 and 4.3 ms, and in the 16,000 to 20,000 range 6.2 and 4.6 ms. Full-route mean callback service was 90.80 and 92.63/s. Maximum CPU frames were 21.9 and 26.7 ms, so the p95 improvement does not mean every individual frame improved.

Sampled two-quantum GPU spans had medians of 8.81 and 8.53 ms with unchanged GPU code and different populations. This does not attribute a GPU speedup to the CPU lookup. CPU and GPU budget failures remain; foreground native 120 FPS validation and final population limits are still pending.

The private GPU guest/fallback fusion is excluded. Although its exact GPU gates passed, representative natural playback did not show an overall benefit and its CPU support workload differed substantially. Lazy prefix AABB pruning is also excluded: it eliminated repeated scans in a synthetic disconnected cloud but regressed the captured ordinary states by about 2.4 to 2.8%, and the ordinary 36,000-grain fixture by 3.1%. Those negative results remain part of the record.

Provenance: candidate source SHA `be6f46f75dc9a1c7faf279f3db7b8655681444ea623f15a3ecbc0296e811a945`; recovered baseline SHA `533e00ff0817f1532dbd3e7c448a4bdc502d214ebc0a0bf632a6df4952e88d9d`. Whole-game evidence: `/tmp/support-direct-fastmirror-abba-summary.json`. Adopted in v28.136. The Downloads project packet retains the raw captures, source pins and summaries.
