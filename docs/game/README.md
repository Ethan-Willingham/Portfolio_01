<div align="center">

# ⛏ Sluice

**A 2D browser mining game, built from scratch — entirely with LLMs.**

Private alpha · vanilla JS, single IIFE, no build framework · heading to Steam

</div>

---

## What it is

Drill down through Earth's crust, collect ore, upgrade your rig, refuel and sell at the surface station, and blast through the barrier band into the deep earth. An open-ended mining sandbox — no win screen, just deeper.

Written in plain JavaScript inside one IIFE, with no dependencies and no transpile step. The whole game is `js/sluice.js`, a bundle assembled from the editable fragments in `js/sluice/` (see **Build & run**).

**Under the hood:**

- **Procedural worldgen** — Earth layers, ore veins, a reinforced barrier band, and a bedrock floor, seeded fresh each run.
- **GPU-first physics** — water and oil run as a WebGPU MLS-MPM particle solver (`js/liquid-wgpu.js`), with a bit-faithful CPU fallback. Diesel smoke is a WebGL fluid sim with an SPH-lite fallback.
- **Soft bodies** — squishy "jello" tiles become live PBD / XPBD soft bodies the moment you dig next to them.
- **Terrain chunk cache** — off-screen tiles keep per-frame redraw cost near zero.
- **Live music** — town / travel / underground / combat stems mixed through a Web Audio bus graph (`js/audio.js`).
- **Dev mode** — press <kbd>`</kbd>: money clamps to 999,999, every shop purchase is free, so late-game content is one keypress away.

<details>
<summary><strong>Controls</strong></summary>

<br>

| Key | Action |
|-----|--------|
| <kbd>W A S D</kbd> / Arrows | Move |
| <kbd>Space</kbd> | Jetpack / fly |
| <kbd>E</kbd> or <kbd>P</kbd> | Open / close shop (at a station) |
| <kbd>1</kbd> / <kbd>2</kbd> | Drop small / large bomb |
| <kbd>T</kbd> | Teleport to surface |
| <kbd>B</kbd> | Deploy rover balloons |
| <kbd>Z</kbd> | Toggle zoom |
| <kbd>R</kbd> | Restart |
| <kbd>`</kbd> | **Dev mode toggle** |

Touch and an on-screen D-pad are fully supported on mobile.

</details>

## Build & run

The game is one IIFE split into ordered text fragments under `js/sluice/`. After editing a fragment, reassemble the bundle:

```bash
./build-sluice.sh        # concatenates js/sluice/[0-9][0-9][0-9]-*.js → js/sluice.js
```

There's no transpiler or bundler: `build-sluice.sh` is a plain text concat, so the bundle is byte-for-byte the sum of its fragments. To play, serve the folder over HTTP and open `sluice.html`:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/sluice.html
```

There's one checkout (`~/sluice-alpha`) and you work directly in it. On every change: build, bump `GAME_VERSION`, commit to local `main`, then `git pull --rebase` and `git push origin main`, so the working tree and the remote always match. The owner just refreshes their open browser/preview to see it.

## For AI assistants

**[AGENTS.md](AGENTS.md)** is the canonical onboarding doc (Claude Code reads it via `CLAUDE.md`). It covers the fragment split layout, the section index into the bundle, the code-style invariants, and the per-system design bibles — `BUILDING_STYLE`, `BACKGROUND_STYLE`, `UI_STYLE`, `MINERALS_BIBLE`, `MUSIC_BIBLE`, `SFX_BIBLE`, `TUNING`, and more. Read it before touching `js/sluice/`.

---

<div align="center">

*Closed-source alpha. No framework, no node_modules, no build step beyond a `cat`.*

</div>
