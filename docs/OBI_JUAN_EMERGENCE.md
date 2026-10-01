# Emergence in Obi Juan

Emergence is a category inside `random-galaxy.html`. It has seven models, three presets per model, local intervention tools, rule controls, inspection, a comparison view, device-local saved setups and setup links.

## Files and lifecycle

- `js/random-galaxy-emergence-models.js`: deterministic models, typed state arrays, neighbor bins, trail fields and FFT convolution. Also exports a Node module for behavioral checks.
- `js/random-galaxy-emergence.js`: lab UI, interaction, projection, field rendering and batched WebGL sprites. Canvas drawing provides a sprite fallback.
- `js/random-galaxy.js`: owns the app clock and switches between the older WebGPU scenes and Emergence. Its frame loop returns before submitting WebGPU work when an Emergence world is active.
- `assets/emergence/lenia-orbium.json`: the published Orbium seed and its original parameters, with creator and source attribution.
- `tools/build-galaxy-previews.cjs`: vector illustrations for the scene chooser and all 21 presets.

Models advance at 30 fixed steps per second. Lenia advances at 15 updates per second, each applying its published time increment of 0.1. At most two simulation steps run in one frame. A return from a hidden or unfocused window resets elapsed time rather than catching up. The shared activity gate stops animation on window blur, document hiding, page hiding and an offscreen app. No model owns a worker or background timer.

When WebGPU is absent or cannot initialize, the same Emergence engine runs through a fallback app clock with the same activity gates. Other categories need the main WebGPU renderer. Mobile and machines with four or fewer logical processors use smaller agent populations and a capped pixel ratio. Fields and particle buffers are reused. Paused worlds redraw only when something changes.

Controls remain in the left sidebar above 900px and above the view on smaller screens. Small desktop heights use compact controls. Advanced controls live in the Lab dialog, which scrolls internally. No controls are mounted below the scene.

## Model references and limits

- **Flocking birds:** three-dimensional separation, alignment and cohesion from [Craig Reynolds](https://www.red3d.com/cwr/boids/). A soft boundary, a placeable predator and spherical obstacles add local steering. The camera orbits the flock, preserves its released direction and resumes immediately. Inspection can follow one bird.
- **Ant colony:** food discovery, trail following, diffusion and evaporation, inspired by [NetLogo Ants](https://ccl.northwestern.edu/netlogo/models/Ants). Returning ants know the nest direction. Food is conserved between sources, carrying ants and deliveries. Walls block agents and chemical diffusion.
- **Slime networks:** three chemical sensors, trail deposition, diffusion, decay and occupied-cell avoidance, inspired by [Jeff Jones's transport network model](https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks). Food reinforces the field. Agents can reconnect a cut network. This does not guarantee a shortest route.
- **Firefly rhythms:** local phase coupling with adjustable frequency diversity. The lab cites [Mirollo and Strogatz](https://www.clear.rice.edu/comp551/papers/MirolloStrogatz-TemporalSynchronization-SIAM1990.pdf) as synchronization research. This implementation uses sinusoidal local phase coupling, rather than reproducing their globally coupled pulse model. The metric is the magnitude of the mean phase vector.
- **Particle Life:** four directed species relationships, mandatory short-range repulsion, finite-range forces, damping and periodic boundaries. Inspired by [Particle Life](https://github.com/HackerPoet/Particle-Life). No scripted trajectory or external flow field.
- **Lenia organisms:** periodic FFT convolution with a normalized polynomial ring kernel, Gaussian growth and a clipped continuous cell density. [Bert Chan's published Orbium unicaudatus data](https://github.com/Chakazul/Lenia/blob/master/Python/animals.json) supplies the seed, radius 13, growth center 0.15, width 0.015 and time scale 10. The single swimmer uses a 128-square grid; multiple swimmers use 256-square grids. Rule changes and collisions can destroy an organism. This is separate from the parked Gray-Scott spots scene.
- **Crowd flow:** desired velocity, local pedestrian repulsion and wall avoidance, inspired by [Helbing and Molnar](https://arxiv.org/abs/cond-mat/9805244). Opposing streams wrap through the horizontal edges. The flow metric compares motion toward destinations with free walking pace. This is an illustrative model, not a crowd safety tool.

Inspection reveals local neighborhoods, sensors or cell density. Revealing signals exposes chemical fields, phase colors or a sample neighborhood. Comparison clones the entire current model state, including random generator state, then changes one rule on the right. Rule edits affect the right world while comparison is active. The camera is shared between both views.

## Saved setups

`gx-emergence-setups` stores up to six configurations in local storage. Setup links use a versioned `#em=` JSON fragment. They contain the model, preset, seed, rules, relationships, food, walls and view. They recreate a starting setup rather than storing a simulation frame. Device populations can differ. Input is constrained to known models, presets and rule bounds, with limits on food and walls. Saved names are rendered as text.

## Checks

Use the bundled Node dependency path for the two Playwright harnesses. Both own and close a Chrome for Testing process through `~/.local/bin/agent-chrome-for-testing`.

```sh
node --check js/random-galaxy.js
node --check js/random-galaxy-emergence-models.js
node --check js/random-galaxy-emergence.js
node tools/test-galaxy-search.cjs
node tools/test-galaxy-emergence.cjs
node tools/test-galaxy-picker.cjs
node tools/test-galaxy-emergence-browser.cjs
```

Behavioral checks cover FFT correctness, stable Orbium motion, food conservation, trail repair, synchronization, relationship changes, flocking, walls and deterministic comparisons. Browser checks cover rendered sprite pixels, all seven models, lab controls, setup round trips, immediate rotation, activity gates, responsive layout and browsers without WebGPU. The chooser harness also checks the existing search, sorting, Space and Explore scenes.

On changes, bump the HTML stylesheet and script query versions, the core version, the picker previews, and the Emergence asset versions together. Rebuild the SVG illustrations when scenes or presets change.
