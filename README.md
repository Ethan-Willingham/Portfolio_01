<div align="center">

```
███████╗████████╗██╗  ██╗ █████╗ ███╗   ██╗
██╔════╝╚══██╔══╝██║  ██║██╔══██╗████╗  ██║
█████╗     ██║   ███████║███████║██╔██╗ ██║
██╔══╝     ██║   ██╔══██║██╔══██║██║╚██╗██║
███████╗   ██║   ██║  ██║██║  ██║██║ ╚████║
╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
    W I L L I N G H A M
```

**Personal website & browser experiments**

[![Deployed on AWS Amplify](https://img.shields.io/badge/AWS_Amplify-deployed-FF9900?style=flat-square&logo=awsamplify&logoColor=white)](https://aws.amazon.com/amplify/)
[![HTML5](https://img.shields.io/badge/HTML5-pure-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![WebGL](https://img.shields.io/badge/WebGL-fluid_sim-990000?style=flat-square&logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![WebGPU](https://img.shields.io/badge/WebGPU-particles-6A0DAD?style=flat-square)](https://gpuweb.github.io/gpuweb/)
[![No build step](https://img.shields.io/badge/build_step-none-brightgreen?style=flat-square)](.)

</div>

---

## What's here

A static site with no framework, no bundler, no build step. Just files. Each page is a self-contained experiment (a game, a simulation, a gallery, a demo), written entirely by hand and with LLMs across many sessions.

<br>

## Pages

| Page | What it is |
|------|-----------|
| [`index.html`](index.html) | The homepage and article list. |
| [`git-history.html`](git-history.html) | **Every Change This Website Ever Made.** Every commit as a point of light on a three-year timeline. |
| [`weather.html`](weather.html) | **Why We Can Never Predict the Weather.** The math of chaos and the two-week forecast wall. |
| [`random-galaxy.html`](random-galaxy.html) | **Obi Juan Algorithm.** A million points you fly through in 3D: strange attractors, fractals, primes, a 4D shadow. |
| [`optional-body.html`](optional-body.html) | **How Much of You Do You Need?** An interactive descent through the parts you can live without. |
| [`gallery.html`](gallery.html) | **The Old Masters.** A small private gallery of paintings, click to zoom. |
| [`particle-life.html`](particle-life.html) | **The Ghost in the Swarm.** 100,000 particles obeying three lines of math on the GPU. |
| [`sluice.html`](sluice.html) | **Sluice.** A browser mining game, built from scratch (see below). |
| [`daylight-globe.html`](daylight-globe.html) | **Every Hour of Daylight, Visualized.** A spinnable 3D Earth with NASA's night lights. |
| [`particles.html`](particles.html) | **Rendering Particles Without a Canvas.** The whole renderer is one CSS property on a 1px div. |

<br>

---

<div align="center">

## ⛏ Sluice

*The main attraction.*

</div>

A from-scratch browser mining game, built inside a single IIFE with no dependencies. Drill through Earth's crust, collect ore, upgrade your rig, and blast through the barrier band into the deep earth.

**What's under the hood:**

- **Procedural world generation:** Earth layers, barrier band, ore veins, all seeded fresh each run
- **Two-tier smoke system:** WebGL fluid simulation (Pavel Dobryakov's Stable Fluids, inlined) with a silent SPH-lite fallback for devices without WebGL
- **Terrain chunk cache:** off-screen canvas tiles for near-zero per-frame redraw cost
- **Dev mode.** Press <kbd>`</kbd> in-game: infinite money, free shop, instant access to late-game content

<details>
<summary><strong>In-game controls</strong></summary>

<br>

| Key | Action |
|-----|--------|
| <kbd>W A S D</kbd> / Arrows | Move |
| <kbd>Space</kbd> | Jetpack |
| <kbd>E</kbd> or <kbd>P</kbd> | Open / close shop |
| <kbd>1</kbd> / <kbd>2</kbd> | Drop small / large bomb |
| <kbd>T</kbd> | Teleport to surface |
| <kbd>Z</kbd> | Toggle zoom |
| <kbd>R</kbd> | Restart |
| <kbd>`</kbd> | **Dev mode toggle** |

Touch and D-pad are fully supported on mobile.

</details>

<br>

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Hosting | AWS Amplify | Push to `main` → auto-deploy, zero config |
| Rendering | Canvas 2D + WebGL + WebGPU | Right tool per page, no abstraction over all three |
| Fonts | Century Supra (Matthew Butterick) | Commercial serif; woff2 served locally |
| Styling | Single `style.css` | Mobile-first, CSS custom properties, no preprocessor |
| Scripts | Vanilla JS | No framework, no transpiler, no node_modules |

<br>

---

<details>
<summary><strong>File structure</strong></summary>

<br>

```
/
├── index.html                  ← homepage / article list
├── git-history.html            ← commit-history visualization
├── weather.html                ← chaos & forecasting essay
├── random-galaxy.html          ← 3D strange-attractor flythrough
├── optional-body.html          ← interactive anatomy descent
├── gallery.html                ← Old Masters gallery
├── particle-life.html          ← 100k-particle WebGPU sim
├── sluice.html       ← the mining game
├── daylight-globe.html         ← 3D daylight Earth
├── particles.html              ← CSS-only particle demos
├── style.css                   ← site-wide panel system + fonts
├── AGENTS.md                   ← onboarding doc for AI coding assistants
├── ...                         ← design docs (BUILDING_STYLE, MINERALS_BIBLE, TUNING, ...)
│
├── js/
│   ├── sluice.js     ← entire game, ~39k lines, single IIFE
│   ├── liquid-wgpu.js          ← WebGPU MLS-MPM water/oil solver
│   ├── particle-life.js        ← WebGPU particle sim
│   ├── random-galaxy.js        ← strange attractors, fractals, primes
│   ├── globe.js                ← 3D Earth renderer (Three.js)
│   ├── git-history.js          ← commit-timeline renderer
│   ├── particles.js            ← CSS-only particle renderer
│   └── main.js                 ← reading progress bar (shared)
│
└── assets/
    ├── fonts/                  ← Century Supra woff2 files
    ├── images/                 ← hero, earth, moon, gallery paintings
    ├── atlas/                  ← anatomical plates (optional-body)
    ├── shop/                   ← Sluice shop art
    ├── weather/                ← weather-essay figures
    └── thumbs/                 ← homepage article thumbnails
```

</details>

<details>
<summary><strong>Running locally</strong></summary>

<br>

No build step. Serve the root directory over HTTP (browsers block some APIs on `file://`):

```bash
# Python
python -m http.server 8080

# Node
npx serve .

# VS Code
# Install "Live Server" extension → right-click index.html → Open with Live Server
```

Then open `http://localhost:8080`.

For the game specifically, open `sluice.html`. Press <kbd>`</kbd> to enable dev mode.

</details>

<br>

---

<div align="center">

*No framework was harmed in the making of this website.*

</div>
