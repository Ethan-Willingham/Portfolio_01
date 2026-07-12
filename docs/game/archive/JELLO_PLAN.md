# JELLO_PLAN.md — Squishy "Jello Tiles"

**Status:** ✓ Implemented in v17.69. The feature shipped — see the
`JELLO SOFT BODIES` banner in `js/sluice.js` and the "Jello soft
bodies" gotcha in [`AGENTS.md`](AGENTS.md). This doc is kept as the original
design spec / rationale. Tune the feel via the `JELLO_*` constants block.

---

## Goal

Add **jello tiles** to Sluice: squishy, **unminable** soft-body
blocks embedded in the terrain. The player can't drill through them, but can
mine the dirt/rock **around** them, then **push them out** of their socket and
**shove them around** the tunnels. The physics must feel world-class and
genuinely *fun* — reminiscent of the **JellyCar** games (squash, jiggle, pop
back, squeeze through gaps).

## Locked decisions (do not re-litigate)

- **Clusters MERGE** — adjacent jello tiles form **one bigger** soft-body blob.
- **Gravity-driven & pushable** — once dislodged, a blob falls, settles,
  squishes under its own weight, and the player shoves it with the drill/body.
- **Unminable** — the drill **bounces** off (like `barrier`/`bedrock`). The
  loop is: mine around → push into an exposed face → it **pops out of its
  socket** → free blob.
- **Squeeze through gaps** smaller than itself (the JellyCar party trick) — a
  core source of fun, keep it.
- **Bombs** don't destroy jello; a blast applies a **shove impulse**.

## Technical approach (researched — use this, don't reinvent)

Use **Position-Based Dynamics (PBD)**, not raw force-springs. Verlet-integrate
the points, then **project constraints directly onto positions** over 2–3
iterations. Unconditionally stable at any stiffness, cheap, easy to stack.

Each blob = a ring of point masses (≈8–12 for a single tile, more for big
merged clusters) + this constraint stack:

| Constraint | Job |
|---|---|
| Edge-ring distance | structure / silhouette |
| A few internal cross | anti-collapse |
| **Shape-matching** (fit rest-shape frame: centroid + best-fit rotation, pull points to matched slots) | the **squash-flat-and-pop-back magic** |
| Area / gas-**pressure** | keeps it "full," gives the bouncy jiggle |
| Collision as **position pushes** (move only the contacting points) | local **denting** where the drill/wall squeezes it |

## Feel tuning (the fun lives here — expose as named constants)

- Soft edges (deforms a lot); strong-ish shape-match but **underdamped** so it
  **wobbles 2–3 times** before settling — the jiggle *is* the joy.
- A little **recovery overshoot** (springy "boing").
- **Pressure tuned slightly high** → reads inflated/bouncy, squeezes then
  re-rounds.
- **Local denting** at contacts (not whole-body bounce) → it hugs the drill
  and walls.
- **Squash-and-stretch** under acceleration to sell weight.
- Juice: a "blorp" + splat particles when it **pops out of its socket**, and a
  faint **idle jiggle** so it reads as alive before you touch it.

## Performance (mandatory — 144fps target, strict perf budget)

See the Resolution config + PERF ISO notes in `AGENTS.md`. The whole feature
must be ~free until a jelly is actually moving.

- **Lazy activation** — while a jello tile is buried/surrounded it is just a
  plain static tile = **zero cost**. Only convert to a live soft body when it's
  been mined-around / dislodged. (99% stay dormant — this is the whole trick.)
- **Sleeping** — freeze a blob when its motion drops below a threshold; wake on
  disturbance.
- **Cap concurrent active blobs** (e.g., nearest N to the player). Low point
  count + PBD stays stable with few iterations.
- Collide points vs the **static tile grid** per-point (O(points); reuse the
  existing player tile-collision pattern). Draw blobs on the **entity layer**
  (live), NOT in the cached terrain chunks.

## Implementation steps

1. **New `jello` tile type** — unbreakable by drill (hp `999999` + bounce, like
   `barrier`). Generate random small **clusters/patches** in the ground at a
   depth band or two inside `generateWorld()`.
2. **New soft-body subsystem** in its own banner section (function-scoped, `var`
   style): a state array of active blobs + a named tunables block.
3. **Activation** — flood-fill connected jello tiles into one blob; **trace the
   cluster boundary** into a point-ring outline; add internal points +
   constraints; store the rest shape (for shape-matching); remove those static
   tiles from the grid.
4. **Sim loop** — gravity → Verlet → project constraints
   (edge/internal/shape-match/area) ×2–3 → collide points vs tile grid + player
   (push out / dent) → sleep check.
5. **Player interaction** — player pushes blob, blob pushes player; blob pops
   out of its socket into open space; squeezes through sub-blob gaps.
6. **Render** — glossy translucent filled polygon (the point ring) + inner
   highlight + specular + idle jiggle, on the entity layer.
7. Bump `GAME_VERSION`; commit + ff-merge `main` + push. Update the AGENTS.md
   section index with the new banner. Flip this doc's status [ ]→✓.

## Trickiest bits (be careful)

- **Boundary-tracing a merged cluster** of tiles into a clean outline polygon
  (marching squares / edge walk) — this is the hard part.
- Staying stable **and** fun at 144fps (lazy activation + sleeping are
  non-negotiable).
- Deformable-polygon vs static-grid **collision** (per-point-vs-cell push-out).
- A settled blob should stay a **free sleeping body** — do **not** try to
  re-tile it back into the grid (alignment hell).

## Strategy & verification

Get **one small merged cluster feeling juicy first** (nail the
jiggle/squash/pop), then scale to bigger clusters. The owner playtests from the
pushed build — after pushing, tell them what to look at and how to repro (dev
mode = backtick, dig down to a jello patch and shove it). For isolated tuning,
the throwaway-harness technique works (see the memory note / how other ores
were reviewed), but soft-body *feel* is best judged in-game.

## Background / references

This is JellyCar's soft-body model — point masses + edge/internal springs + a
shape-matching "frame" + gas pressure + per-point collision denting (see
Walaber's *"Deep Dive: The soft body physics of JellyCar, explained"*) —
**upgraded to PBD** for stability and performance.

- Shape matching — Müller et al., *"Meshless Deformations Based on Shape
  Matching"* (SIGGRAPH 2005).
- Pressure model — Matyka & Ollila, *"Pressure Model of Soft Body Simulation"*
  (2004).
- PBD — Müller et al., *"Position Based Dynamics"* (2007).
