    // ====== GM TUNING PRESETS ======
    // Phase 4 of the tuning system. A named library of lever bags layered on
    // top of the Phase-2 facade (window.gm) and the Phase-3 panel.
    //
    //   gm.preset(name)            apply a preset by name (then re-syncs panel)
    //   gm.presetList([cat])       list preset names (optionally by category)
    //   gm.presets                 the GM_PRESETS object itself
    //   gm.save(name)              capture gm.diff() as a custom preset + persist
    //   gm.delPreset(name)         delete a custom preset (from mem + storage)
    //   gm.detectTier()            heuristic device-tier name (potato..extreme)
    //   gm.autoTier()              apply the detected tier on demand
    //
    // Each GM_PRESETS entry: { cat, desc, values:{ 'group.name': value, ... } }.
    // `values` is a PARTIAL { path:value } bag — only the levers the preset
    // touches; gm.apply() clamps each into its lever's range. Categories:
    //   'device'  — perf tiers (potato/low/medium/high/ultra/extreme)
    //   'smoke'   — diesel-exhaust colour-play presets
    //   'rocket'  — jetpack-plume looks
    //   'water'   — full water materials (colour + fluid physics)
    //   'custom'  — user-saved presets (gm.save), persisted to localStorage
    //
    // Every numeric value below is inside the owning lever's documented
    // TUNING.md range. The whole build is wrapped in try/catch so a bad
    // preset can never break the game or boot.
    try {
      var GM_PRESETS_CUSTOM_KEY = 'gm_presets_custom';

      // ----- Device tier flag -----
      // When true, gm.preset(gmDetectTier()) runs once at boot. Default false:
      // the owner verifies the tier heuristics on real hardware first, then
      // flips this to true. Even when false, the detected tier is logged at
      // boot as a suggestion.
      var GM_AUTO_TIER = false;

      // ----- The preset library -----
      // Authored from TUNING.md. Look-presets specify ALL the levers that
      // define the look (they do not lean on defaults) so switching between
      // two looks is a clean, total swap.
      var GM_PRESETS = {

        // ===== Weather TYPE (cat:'weather') — flip the sky state =====
        // These set the mood (and precip type) only; they leave the cloud LOOK
        // dials alone, so they compose with the cloud-look presets below. The
        // sim eases into the new state over a few seconds. 'dynamic' resumes the
        // live mood machine. See TUNING.md §5.4 / BACKGROUND_STYLE §15.
        'clear sky':   { cat: 'weather', desc: 'Cloudless blue sky',                       values: { 'weather.MOOD': 0 } },
        'fair':        { cat: 'weather', desc: 'A few scattered fair-weather clouds',       values: { 'weather.MOOD': 1 } },
        'cloudy':      { cat: 'weather', desc: 'Broad cloud cover, still bright',           values: { 'weather.MOOD': 2 } },
        'overcast':    { cat: 'weather', desc: 'Full grey deck, no precip',                 values: { 'weather.MOOD': 3 } },
        'rainfall':    { cat: 'weather', desc: 'Steady rain under heavy cloud',             values: { 'weather.MOOD': 4, 'weather.precipMode': 1 } },
        'snowfall':    { cat: 'weather', desc: 'Steady snow under heavy cloud',             values: { 'weather.MOOD': 4, 'weather.precipMode': 2 } },
        'thunderstorm':{ cat: 'weather', desc: 'Dark storm, heavy rain, lightning',         values: { 'weather.MOOD': 5, 'weather.precipMode': 1, 'weather.lightning': 1 } },
        'blizzard':    { cat: 'weather', desc: 'Dark storm, heavy snow, lightning',         values: { 'weather.MOOD': 5, 'weather.precipMode': 2, 'weather.lightning': 1 } },
        'dynamic':     { cat: 'weather', desc: 'Resume the live weather machine (auto)',    values: { 'weather.MOOD': -1 } },

        // ===== Sky LOOK (cat:'clouds') — gorgeous complete starting points =====
        // Each is a COMPLETE sky: cloud appearance + showcase mood + the
        // world-anchored DECK shape (deckDensity / deckAltScale / deckThin,
        // v24.48) + the ascent HAZE (haze.maxA / haze.floorA). Setting the full
        // set means switching looks is a clean total swap. The deck dials are
        // where the fly-up character lives — low ceilings, towering stacks,
        // thin high cirrus — so fly up after picking to see each one breathe.
        'cloud defaults': { cat: 'clouds', desc: 'Reset every sky dial to the shipping look + dynamic weather',
          values: { 'weather.enabled': 1, 'weather.MOOD': -1, 'weather.driftScale': 1, 'weather.baseDrift': 6,
            'weather.rimGlow': 1, 'weather.highlight': 1, 'weather.shadow': 1, 'weather.contrast': 1,
            'weather.layerAlpha': 1, 'weather.softness': 1, 'weather.morphSpeed': 0,
            'weather.deckDensity': 1.0, 'weather.deckAltScale': 1.0, 'weather.deckThin': 0.66,
            'haze.maxA': 0.72, 'haze.floorA': 0.45,
            'weather.precipMode': 0, 'weather.precipRate': 1, 'weather.precipSpeed': 1,
            'weather.lightning': 1 } },
        'clear blue': { cat: 'clouds', desc: 'Near-empty blue sky, a few high wisps, clean horizon',
          values: { 'weather.MOOD': 0, 'weather.driftScale': 1.0, 'weather.baseDrift': 5, 'weather.rimGlow': 1.0,
            'weather.highlight': 1.1, 'weather.shadow': 1.0, 'weather.contrast': 1.0, 'weather.layerAlpha': 0.9,
            'weather.softness': 1.0, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.8, 'weather.deckAltScale': 1.2, 'weather.deckThin': 0.85,
            'haze.maxA': 0.6, 'haze.floorA': 0.4 } },
        'scattered fair': { cat: 'clouds', desc: 'Easy scattered fair-weather clouds at a natural spread',
          values: { 'weather.MOOD': 1, 'weather.driftScale': 1.0, 'weather.baseDrift': 6, 'weather.rimGlow': 1.2,
            'weather.highlight': 1.12, 'weather.shadow': 1.0, 'weather.contrast': 1.05, 'weather.layerAlpha': 0.95,
            'weather.softness': 1.0, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.92, 'weather.deckAltScale': 1.05, 'weather.deckThin': 0.74,
            'haze.maxA': 0.66, 'haze.floorA': 0.44 } },
        'puffy cumulus': { cat: 'clouds', desc: 'Big defined cotton puffs, crisp edges, bright lining',
          values: { 'weather.MOOD': 2, 'weather.driftScale': 0.9, 'weather.baseDrift': 5, 'weather.rimGlow': 1.7,
            'weather.highlight': 1.18, 'weather.shadow': 0.95, 'weather.contrast': 1.45, 'weather.layerAlpha': 1.0,
            'weather.softness': 0.5, 'weather.morphSpeed': 0,
            'weather.deckDensity': 1.0, 'weather.deckAltScale': 0.95, 'weather.deckThin': 0.7,
            'haze.maxA': 0.7, 'haze.floorA': 0.45 } },
        'towering stacks': { cat: 'clouds', desc: 'Dense clouds that build all the way up to space — fly up THROUGH them',
          values: { 'weather.MOOD': 3, 'weather.driftScale': 0.85, 'weather.baseDrift': 5, 'weather.rimGlow': 1.5,
            'weather.highlight': 1.2, 'weather.shadow': 0.9, 'weather.contrast': 1.3, 'weather.layerAlpha': 1.05,
            'weather.softness': 0.7, 'weather.morphSpeed': 0.05,
            'weather.deckDensity': 1.2, 'weather.deckAltScale': 1.15, 'weather.deckThin': 0.32,
            'haze.maxA': 0.72, 'haze.floorA': 0.5 } },
        'wispy cirrus': { cat: 'clouds', desc: 'Thin high feathery streaks riding high and drifting fast',
          values: { 'weather.MOOD': 1, 'weather.driftScale': 1.5, 'weather.baseDrift': 9, 'weather.rimGlow': 0.9,
            'weather.highlight': 1.1, 'weather.shadow': 1.0, 'weather.contrast': 0.7, 'weather.layerAlpha': 0.55,
            'weather.softness': 2.4, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.5, 'weather.deckAltScale': 1.55, 'weather.deckThin': 0.9,
            'haze.maxA': 0.6, 'haze.floorA': 0.4 } },
        'high & sparse': { cat: 'clouds', desc: 'A few faint clouds way up high, wide-open lower sky',
          values: { 'weather.MOOD': 1, 'weather.driftScale': 1.1, 'weather.baseDrift': 7, 'weather.rimGlow': 1.0,
            'weather.highlight': 1.1, 'weather.shadow': 1.0, 'weather.contrast': 0.9, 'weather.layerAlpha': 0.6,
            'weather.softness': 1.6, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.55, 'weather.deckAltScale': 1.8, 'weather.deckThin': 0.5,
            'haze.maxA': 0.58, 'haze.floorA': 0.4 } },
        'sea of cloud': { cat: 'clouds', desc: 'Thick low ceiling you punch up through into clear sky above',
          values: { 'weather.MOOD': 3, 'weather.driftScale': 0.7, 'weather.baseDrift': 4, 'weather.rimGlow': 1.4,
            'weather.highlight': 1.15, 'weather.shadow': 0.85, 'weather.contrast': 1.2, 'weather.layerAlpha': 1.1,
            'weather.softness': 1.2, 'weather.morphSpeed': 0,
            'weather.deckDensity': 1.25, 'weather.deckAltScale': 0.7, 'weather.deckThin': 1.0,
            'haze.maxA': 0.8, 'haze.floorA': 0.5 } },
        'moody overcast': { cat: 'clouds', desc: 'Low flat grey deck, heavy and dim',
          values: { 'weather.MOOD': 3, 'weather.driftScale': 0.8, 'weather.baseDrift': 5, 'weather.rimGlow': 0.55,
            'weather.highlight': 0.7, 'weather.shadow': 0.68, 'weather.contrast': 0.85, 'weather.layerAlpha': 1.15,
            'weather.softness': 1.5, 'weather.morphSpeed': 0,
            'weather.deckDensity': 1.15, 'weather.deckAltScale': 0.85, 'weather.deckThin': 0.85,
            'haze.maxA': 0.82, 'haze.floorA': 0.55 } },
        'dramatic sunset': { cat: 'clouds', desc: 'Blazing gold-rimmed edges (best at dusk or dawn)',
          values: { 'weather.MOOD': 2, 'weather.driftScale': 1.0, 'weather.baseDrift': 6, 'weather.rimGlow': 2.4,
            'weather.highlight': 1.55, 'weather.shadow': 0.8, 'weather.contrast': 1.35, 'weather.layerAlpha': 1.05,
            'weather.softness': 0.9, 'weather.morphSpeed': 0,
            'weather.deckDensity': 1.0, 'weather.deckAltScale': 1.0, 'weather.deckThin': 0.66,
            'haze.maxA': 0.76, 'haze.floorA': 0.5 } },
        'golden hour': { cat: 'clouds', desc: 'Warm soft low-sun glow on scattered clouds',
          values: { 'weather.MOOD': 1, 'weather.driftScale': 1.0, 'weather.baseDrift': 6, 'weather.rimGlow': 1.9,
            'weather.highlight': 1.4, 'weather.shadow': 0.9, 'weather.contrast': 1.1, 'weather.layerAlpha': 0.95,
            'weather.softness': 1.2, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.95, 'weather.deckAltScale': 1.1, 'weather.deckThin': 0.7,
            'haze.maxA': 0.78, 'haze.floorA': 0.5 } },
        'soft & dreamy': { cat: 'clouds', desc: 'Gentle pillowy clouds, slow and airy',
          values: { 'weather.MOOD': 1, 'weather.driftScale': 0.7, 'weather.baseDrift': 4, 'weather.rimGlow': 1.3,
            'weather.highlight': 1.12, 'weather.shadow': 1.0, 'weather.contrast': 0.85, 'weather.layerAlpha': 0.85,
            'weather.softness': 2.0, 'weather.morphSpeed': 0,
            'weather.deckDensity': 0.85, 'weather.deckAltScale': 1.0, 'weather.deckThin': 0.7,
            'haze.maxA': 0.62, 'haze.floorA': 0.42 } },
        'fast front': { cat: 'clouds', desc: 'Weather barreling through, drifting and morphing fast',
          values: { 'weather.MOOD': 2, 'weather.driftScale': 2.6, 'weather.baseDrift': 16, 'weather.rimGlow': 1.2,
            'weather.highlight': 1.1, 'weather.shadow': 0.95, 'weather.contrast': 1.1, 'weather.layerAlpha': 1.0,
            'weather.softness': 1.1, 'weather.morphSpeed': 0.35,
            'weather.deckDensity': 1.05, 'weather.deckAltScale': 1.0, 'weather.deckThin': 0.66,
            'haze.maxA': 0.72, 'haze.floorA': 0.46 } },
        'storm ceiling': { cat: 'clouds', desc: 'Dark low storm deck, lightning, heavy haze below',
          values: { 'weather.MOOD': 5, 'weather.driftScale': 2.0, 'weather.baseDrift': 14, 'weather.rimGlow': 0.6,
            'weather.highlight': 0.7, 'weather.shadow': 0.6, 'weather.contrast': 1.0, 'weather.layerAlpha': 1.2,
            'weather.softness': 1.2, 'weather.morphSpeed': 0.15, 'weather.lightning': 1,
            'weather.deckDensity': 1.25, 'weather.deckAltScale': 0.82, 'weather.deckThin': 0.9,
            'haze.maxA': 0.85, 'haze.floorA': 0.6 } },

        // ===== Device tiers (cat:'device') — the perf levers =====
        // Anchor values per the Phase-4 brief; the rest filled to be coherent
        // with the tier. RES_PIXEL_BUDGET in pixels (1.0M..6.0M).
        'potato': {
          cat: 'device',
          desc: 'Lowest-end device — minimum fidelity, maximum fps',
          values: {
            'res.RES_PIXEL_BUDGET': 1000000,
            'res.RENDER_SCALE_DESKTOP': 0.75,
            'res.RENDER_SCALE_MOBILE': 0.4,
            'res.TERRAIN_RES_FACTOR': 0.5,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 1.0,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 2,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 0.4,
            'res.SMOKE_RENDER_SCALE_MOBILE': 0.4,
            'smoke.sim_pressure_iters': 8,
            'rocket.spark_max': 120,
            'rocket.wake_max': 24
          }
        },
        'low': {
          cat: 'device',
          desc: 'Low-end device — lean settings, smooth fps',
          values: {
            'res.RES_PIXEL_BUDGET': 1500000,
            'res.RENDER_SCALE_DESKTOP': 0.8,
            'res.RENDER_SCALE_MOBILE': 0.45,
            'res.TERRAIN_RES_FACTOR': 0.55,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 1.2,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 2.5,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 0.5,
            'res.SMOKE_RENDER_SCALE_MOBILE': 0.5,
            'smoke.sim_pressure_iters': 12,
            'rocket.spark_max': 250,
            'rocket.wake_max': 40
          }
        },
        'medium': {
          cat: 'device',
          desc: 'Mid-range device — balanced fidelity and fps',
          values: {
            'res.RES_PIXEL_BUDGET': 2200000,
            'res.RENDER_SCALE_DESKTOP': 0.9,
            'res.RENDER_SCALE_MOBILE': 0.5,
            'res.TERRAIN_RES_FACTOR': 0.6,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 1.4,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 3,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 0.6,
            'res.SMOKE_RENDER_SCALE_MOBILE': 0.6,
            'smoke.sim_pressure_iters': 15,
            'rocket.spark_max': 400,
            'rocket.wake_max': 60
          }
        },
        'high': {
          cat: 'device',
          desc: 'Strong device — current shipping defaults',
          values: {
            'res.RES_PIXEL_BUDGET': 3000000,
            'res.RENDER_SCALE_DESKTOP': 1.0,
            'res.RENDER_SCALE_MOBILE': 0.55,
            'res.TERRAIN_RES_FACTOR': 0.62,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 1.5,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 3,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 0.6,
            'res.SMOKE_RENDER_SCALE_MOBILE': 0.6,
            'smoke.sim_pressure_iters': 17,
            'rocket.spark_max': 510,
            'rocket.wake_max': 70
          }
        },
        'ultra': {
          cat: 'device',
          desc: 'High-end gaming desktop — extra sharpness, fps headroom spent',
          values: {
            'res.RES_PIXEL_BUDGET': 4500000,
            'res.RENDER_SCALE_DESKTOP': 1.0,
            'res.RENDER_SCALE_MOBILE': 0.7,
            'res.TERRAIN_RES_FACTOR': 0.8,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 1.7,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 3.5,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 0.85,
            'res.SMOKE_RENDER_SCALE_MOBILE': 0.85,
            'smoke.sim_pressure_iters': 22,
            'rocket.spark_max': 800,
            'rocket.wake_max': 110
          }
        },
        'extreme': {
          cat: 'device',
          desc: 'Top-tier desktop — maximum fidelity, no compromises',
          values: {
            'res.RES_PIXEL_BUDGET': 6000000,
            'res.RENDER_SCALE_DESKTOP': 1.0,
            'res.RENDER_SCALE_MOBILE': 0.85,
            'res.TERRAIN_RES_FACTOR': 1.0,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MIN': 2.0,
            'res.TERRAIN_CHUNK_RENDER_SCALE_MAX': 4,
            'res.SMOKE_RENDER_SCALE_DESKTOP': 1.0,
            'res.SMOKE_RENDER_SCALE_MOBILE': 1.0,
            'smoke.sim_pressure_iters': 28,
            'rocket.spark_max': 1200,
            'rocket.wake_max': 160
          }
        },

        // ===== Smoke colours (cat:'smoke') — smoke.* colour levers =====
        // A colour-play library. 'smoke-default' restores the full stock
        // exhaust (shape + colour). Every other preset is a pure colour
        // swap — it sets only the 3 diesel_color channels, the per-particle
        // hue jitter, and the bloom (glow) so the colour reads; motion is
        // left untouched. Colour channels [0..0.3], jitter [0..0.05],
        // bloom_amount [0..1.5], bloom_radius [0.002..0.1].
        'smoke-default': {
          cat: 'smoke',
          desc: 'Stock diesel exhaust — the shipping look',
          values: {
            'smoke.diesel_rate_active': 0.05,
            'smoke.diesel_rate_moving': 0.085,
            'smoke.diesel_rad_active': 0.105,
            'smoke.diesel_rad_moving': 0.165,
            'smoke.diesel_velY_active': 2.75,
            'smoke.diesel_shed_amp': 1.31,
            'smoke.diesel_shed_freq': 10.8,
            'smoke.diesel_motion_scale': 0.34,
            'smoke.diesel_color_r': 0.14,
            'smoke.diesel_color_g': 0.13,
            'smoke.diesel_color_b': 0.11,
            'smoke.diesel_color_jitter': 0,
            'smoke.diesel_bloom_radius': 0.078,
            'smoke.diesel_bloom_amount': 0.82,
            'smoke.sim_density_dissipation': 1.5,
            'smoke.sim_curl': 28.5,
            'smoke.sim_splat_radius': 0.255,
            'smoke.wind_y': 3.35
          }
        },
        'smoke-inferno': {
          cat: 'smoke',
          desc: 'Raging fire-red — molten inferno glow',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.07, 'smoke.diesel_color_b': 0.01,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.45, 'smoke.diesel_bloom_radius': 0.092
          }
        },
        'smoke-ember': {
          cat: 'smoke',
          desc: 'Glowing orange embers — warm smoulder',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.13, 'smoke.diesel_color_b': 0.03,
            'smoke.diesel_color_jitter': 0.04,
            'smoke.diesel_bloom_amount': 1.30, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-amber': {
          cat: 'smoke',
          desc: 'Rich warm amber — honeyed glow',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.18, 'smoke.diesel_color_b': 0.05,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.20, 'smoke.diesel_bloom_radius': 0.080
          }
        },
        'smoke-solar': {
          cat: 'smoke',
          desc: 'Blazing solar gold — radiant yellow',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.26, 'smoke.diesel_color_b': 0.07,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.42, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-sulfur': {
          cat: 'smoke',
          desc: 'Acid sulfur yellow — chemical glow',
          values: {
            'smoke.diesel_color_r': 0.27, 'smoke.diesel_color_g': 0.30, 'smoke.diesel_color_b': 0.04,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.26, 'smoke.diesel_bloom_radius': 0.085
          }
        },
        'smoke-crimson': {
          cat: 'smoke',
          desc: 'Deep crimson — dark blood red',
          values: {
            'smoke.diesel_color_r': 0.27, 'smoke.diesel_color_g': 0.02, 'smoke.diesel_color_b': 0.05,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.15, 'smoke.diesel_bloom_radius': 0.082
          }
        },
        'smoke-coral': {
          cat: 'smoke',
          desc: 'Soft coral — warm pink-orange',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.14, 'smoke.diesel_color_b': 0.11,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.20, 'smoke.diesel_bloom_radius': 0.082
          }
        },
        'smoke-blood-moon': {
          cat: 'smoke',
          desc: 'Blood-moon red — ominous dark glow',
          values: {
            'smoke.diesel_color_r': 0.26, 'smoke.diesel_color_g': 0.05, 'smoke.diesel_color_b': 0.02,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.12, 'smoke.diesel_bloom_radius': 0.084
          }
        },
        'smoke-toxic': {
          cat: 'smoke',
          desc: 'Radioactive green — toxic acid haze',
          values: {
            'smoke.diesel_color_r': 0.06, 'smoke.diesel_color_g': 0.30, 'smoke.diesel_color_b': 0.04,
            'smoke.diesel_color_jitter': 0.04,
            'smoke.diesel_bloom_amount': 1.40, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-emerald': {
          cat: 'smoke',
          desc: 'Jewel emerald — rich deep green',
          values: {
            'smoke.diesel_color_r': 0.03, 'smoke.diesel_color_g': 0.28, 'smoke.diesel_color_b': 0.13,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.16, 'smoke.diesel_bloom_radius': 0.082
          }
        },
        'smoke-jade': {
          cat: 'smoke',
          desc: 'Jade — cool green-teal mineral',
          values: {
            'smoke.diesel_color_r': 0.04, 'smoke.diesel_color_g': 0.27, 'smoke.diesel_color_b': 0.20,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.14, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-mint': {
          cat: 'smoke',
          desc: 'Pale mint — soft fresh green',
          values: {
            'smoke.diesel_color_r': 0.14, 'smoke.diesel_color_g': 0.28, 'smoke.diesel_color_b': 0.20,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.15, 'smoke.diesel_bloom_radius': 0.088
          }
        },
        'smoke-venom': {
          cat: 'smoke',
          desc: 'Venom — sickly shifting green shimmer',
          values: {
            'smoke.diesel_color_r': 0.16, 'smoke.diesel_color_g': 0.26, 'smoke.diesel_color_b': 0.10,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.30, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-aqua': {
          cat: 'smoke',
          desc: 'Bright aqua — tropical cyan-green',
          values: {
            'smoke.diesel_color_r': 0.02, 'smoke.diesel_color_g': 0.28, 'smoke.diesel_color_b': 0.25,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.32, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-cyan': {
          cat: 'smoke',
          desc: 'Electric cyan — vivid neon glow',
          values: {
            'smoke.diesel_color_r': 0.00, 'smoke.diesel_color_g': 0.27, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.45, 'smoke.diesel_bloom_radius': 0.095
          }
        },
        'smoke-frost': {
          cat: 'smoke',
          desc: 'Icy frost — pale blue-white chill',
          values: {
            'smoke.diesel_color_r': 0.18, 'smoke.diesel_color_g': 0.27, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.22, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-azure': {
          cat: 'smoke',
          desc: 'Clear azure — bright sky blue',
          values: {
            'smoke.diesel_color_r': 0.05, 'smoke.diesel_color_g': 0.18, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.22, 'smoke.diesel_bloom_radius': 0.082
          }
        },
        'smoke-cobalt': {
          cat: 'smoke',
          desc: 'Deep cobalt — electric blue depth',
          values: {
            'smoke.diesel_color_r': 0.02, 'smoke.diesel_color_g': 0.07, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.36, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-indigo': {
          cat: 'smoke',
          desc: 'Indigo — deep blue-violet',
          values: {
            'smoke.diesel_color_r': 0.11, 'smoke.diesel_color_g': 0.04, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.26, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-violet': {
          cat: 'smoke',
          desc: 'Vivid violet — rich electric purple',
          values: {
            'smoke.diesel_color_r': 0.19, 'smoke.diesel_color_g': 0.04, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.32, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-amethyst': {
          cat: 'smoke',
          desc: 'Soft amethyst — gentle lavender',
          values: {
            'smoke.diesel_color_r': 0.21, 'smoke.diesel_color_g': 0.12, 'smoke.diesel_color_b': 0.28,
            'smoke.diesel_color_jitter': 0.04,
            'smoke.diesel_bloom_amount': 1.12, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-magenta': {
          cat: 'smoke',
          desc: 'Hot magenta — searing pink glow',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.02, 'smoke.diesel_color_b': 0.26,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.46, 'smoke.diesel_bloom_radius': 0.095
          }
        },
        'smoke-fuchsia': {
          cat: 'smoke',
          desc: 'Fuchsia — bold pink-purple',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.06, 'smoke.diesel_color_b': 0.19,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.30, 'smoke.diesel_bloom_radius': 0.086
          }
        },
        'smoke-rose': {
          cat: 'smoke',
          desc: 'Warm rose — dusky pink',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.13, 'smoke.diesel_color_b': 0.17,
            'smoke.diesel_color_jitter': 0.03,
            'smoke.diesel_bloom_amount': 1.16, 'smoke.diesel_bloom_radius': 0.085
          }
        },
        'smoke-white-hot': {
          cat: 'smoke',
          desc: 'White-hot — blazing pure-white core',
          values: {
            'smoke.diesel_color_r': 0.30, 'smoke.diesel_color_g': 0.30, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.00,
            'smoke.diesel_bloom_amount': 1.50, 'smoke.diesel_bloom_radius': 0.100
          }
        },
        'smoke-pearl': {
          cat: 'smoke',
          desc: 'Soft pearl — cool luminous white',
          values: {
            'smoke.diesel_color_r': 0.27, 'smoke.diesel_color_g': 0.27, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.02,
            'smoke.diesel_bloom_amount': 1.20, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-noir': {
          cat: 'smoke',
          desc: 'Pure noir — light-swallowing black',
          values: {
            'smoke.diesel_color_r': 0.03, 'smoke.diesel_color_g': 0.03, 'smoke.diesel_color_b': 0.04,
            'smoke.diesel_color_jitter': 0.00,
            'smoke.diesel_bloom_amount': 0.55, 'smoke.diesel_bloom_radius': 0.050
          }
        },
        'smoke-ash': {
          cat: 'smoke',
          desc: 'Neutral ash — plain grey smoke',
          values: {
            'smoke.diesel_color_r': 0.15, 'smoke.diesel_color_g': 0.15, 'smoke.diesel_color_b': 0.16,
            'smoke.diesel_color_jitter': 0.01,
            'smoke.diesel_bloom_amount': 0.80, 'smoke.diesel_bloom_radius': 0.072
          }
        },
        'smoke-iridescent': {
          cat: 'smoke',
          desc: 'Iridescent — oil-slick rainbow sheen',
          values: {
            'smoke.diesel_color_r': 0.17, 'smoke.diesel_color_g': 0.14, 'smoke.diesel_color_b': 0.26,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.30, 'smoke.diesel_bloom_radius': 0.090
          }
        },
        'smoke-aurora': {
          cat: 'smoke',
          desc: 'Aurora — drifting green-violet light',
          values: {
            'smoke.diesel_color_r': 0.08, 'smoke.diesel_color_g': 0.26, 'smoke.diesel_color_b': 0.22,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.36, 'smoke.diesel_bloom_radius': 0.095
          }
        },
        'smoke-nebula': {
          cat: 'smoke',
          desc: 'Nebula — cosmic purple-pink cloud',
          values: {
            'smoke.diesel_color_r': 0.22, 'smoke.diesel_color_g': 0.07, 'smoke.diesel_color_b': 0.28,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.32, 'smoke.diesel_bloom_radius': 0.095
          }
        },
        'smoke-prism': {
          cat: 'smoke',
          desc: 'Prism — full-spectrum rainbow chaos',
          values: {
            'smoke.diesel_color_r': 0.20, 'smoke.diesel_color_g': 0.19, 'smoke.diesel_color_b': 0.21,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.40, 'smoke.diesel_bloom_radius': 0.092
          }
        },
        'smoke-plasma': {
          cat: 'smoke',
          desc: 'Plasma — crackling blue-white energy',
          values: {
            'smoke.diesel_color_r': 0.13, 'smoke.diesel_color_g': 0.22, 'smoke.diesel_color_b': 0.30,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.46, 'smoke.diesel_bloom_radius': 0.095
          }
        },
        'smoke-candy': {
          cat: 'smoke',
          desc: 'Cotton candy — pastel pink-cyan swirl',
          values: {
            'smoke.diesel_color_r': 0.26, 'smoke.diesel_color_g': 0.21, 'smoke.diesel_color_b': 0.28,
            'smoke.diesel_color_jitter': 0.05,
            'smoke.diesel_bloom_amount': 1.20, 'smoke.diesel_bloom_radius': 0.090
          }
        },

        // ===== Rocket / jetpack looks (cat:'rocket') — rocket.* levers =====
        'rocket-default': {
          cat: 'rocket',
          desc: 'Stock jetpack plume — the shipping look',
          values: {
            'rocket.core_length': 40,
            'rocket.core_width': 3,
            'rocket.core_jitter': 2.3,
            'rocket.core_pulse_amp': 0.28,
            'rocket.core_inner_r': 1.67, 'rocket.core_inner_g': 0.22, 'rocket.core_inner_b': 1.71,
            'rocket.core_mid_r': 0.68, 'rocket.core_mid_g': 0.89, 'rocket.core_mid_b': 1.9,
            'rocket.core_outer_r': 1.92, 'rocket.core_outer_g': 1.94, 'rocket.core_outer_b': 1.22,
            'rocket.core_alpha': 0.34,
            'rocket.spark_rate': 0,
            'rocket.spark_speed': 680,
            'rocket.spark_spread': 1.06,
            'rocket.spark_size': 1.55,
            'rocket.spark_r': 0.07, 'rocket.spark_g': 0.55, 'rocket.spark_b': 0.56,
            'rocket.spark_alpha': 0.61,
            'rocket.wash_distance': 155,
            'rocket.wash_rate': 840
          }
        },
        'rocket-inferno': {
          cat: 'rocket',
          desc: 'Huge violent fire — power ladder rung 5 of 6',
          values: {
            'rocket.core_length': 95, 'rocket.core_length_min': 84,
            'rocket.core_width': 8.5, 'rocket.core_width_taper': 0.03,
            'rocket.core_jitter': 5.5,
            'rocket.core_pulse_amp': 0.55, 'rocket.core_pulse_freq': 34,
            'rocket.core_inner_r': 2.0, 'rocket.core_inner_g': 1.4, 'rocket.core_inner_b': 0.3,
            'rocket.core_mid_r': 2.0, 'rocket.core_mid_g': 0.7, 'rocket.core_mid_b': 0.15,
            'rocket.core_outer_r': 1.6, 'rocket.core_outer_g': 0.3, 'rocket.core_outer_b': 0.08,
            'rocket.core_alpha': 0.78,
            'rocket.shock_count': 9, 'rocket.shock_size': 3.4, 'rocket.shock_brightness': 0.42,
            'rocket.spark_rate': 380, 'rocket.spark_max': 1100,
            'rocket.spark_speed': 1200,
            'rocket.spark_spread': 1.5,
            'rocket.spark_size': 3.0,
            'rocket.spark_r': 1.0, 'rocket.spark_g': 0.55, 'rocket.spark_b': 0.12,
            'rocket.spark_alpha': 0.95,
            'rocket.wake_rate': 150, 'rocket.wake_max': 320,
            'rocket.wash_distance': 320, 'rocket.wash_rate': 2200
          }
        },
        'rocket-ion': {
          cat: 'rocket',
          desc: 'Tight clean blue sci-fi thruster — narrow focused jet',
          values: {
            'rocket.core_length': 26,
            'rocket.core_width': 1.8,
            'rocket.core_jitter': 0.6,
            'rocket.core_pulse_amp': 0.1,
            'rocket.core_inner_r': 0.7, 'rocket.core_inner_g': 1.6, 'rocket.core_inner_b': 2.0,
            'rocket.core_mid_r': 0.3, 'rocket.core_mid_g': 0.9, 'rocket.core_mid_b': 2.0,
            'rocket.core_outer_r': 0.5, 'rocket.core_outer_g': 0.7, 'rocket.core_outer_b': 1.9,
            'rocket.core_alpha': 0.5,
            'rocket.spark_rate': 40,
            'rocket.spark_speed': 520,
            'rocket.spark_spread': 0.3,
            'rocket.spark_size': 1.0,
            'rocket.spark_r': 0.5, 'rocket.spark_g': 0.9, 'rocket.spark_b': 2.0,
            'rocket.spark_alpha': 0.7,
            'rocket.wash_distance': 90,
            'rocket.wash_rate': 500
          }
        },
        'rocket-subtle': {
          cat: 'rocket',
          desc: 'Small tasteful plume — power ladder rung 2 of 6',
          values: {
            'rocket.core_length': 26, 'rocket.core_length_min': 22,
            'rocket.core_width': 2.2, 'rocket.core_width_taper': 0.05,
            'rocket.core_jitter': 1.3,
            'rocket.core_pulse_amp': 0.16, 'rocket.core_pulse_freq': 24,
            'rocket.core_inner_r': 1.4, 'rocket.core_inner_g': 0.5, 'rocket.core_inner_b': 1.4,
            'rocket.core_mid_r': 0.6, 'rocket.core_mid_g': 0.8, 'rocket.core_mid_b': 1.6,
            'rocket.core_outer_r': 1.4, 'rocket.core_outer_g': 1.4, 'rocket.core_outer_b': 1.0,
            'rocket.core_alpha': 0.24,
            'rocket.shock_count': 3, 'rocket.shock_size': 1.2, 'rocket.shock_brightness': 0.12,
            'rocket.spark_rate': 24, 'rocket.spark_max': 160,
            'rocket.spark_speed': 460,
            'rocket.spark_spread': 0.7,
            'rocket.spark_size': 1.1,
            'rocket.spark_r': 0.2, 'rocket.spark_g': 0.5, 'rocket.spark_b': 0.6,
            'rocket.spark_alpha': 0.42,
            'rocket.wake_rate': 12, 'rocket.wake_max': 30,
            'rocket.wash_distance': 100, 'rocket.wash_rate': 520
          }
        },
        'rocket-sparkler': {
          cat: 'rocket',
          desc: 'Spark-heavy chunky exhaust — showers of bright sparks',
          values: {
            'rocket.core_length': 36,
            'rocket.core_width': 3.0,
            'rocket.core_jitter': 3.0,
            'rocket.core_pulse_amp': 0.3,
            'rocket.core_inner_r': 1.8, 'rocket.core_inner_g': 1.2, 'rocket.core_inner_b': 0.4,
            'rocket.core_mid_r': 1.7, 'rocket.core_mid_g': 0.9, 'rocket.core_mid_b': 0.4,
            'rocket.core_outer_r': 1.6, 'rocket.core_outer_g': 1.5, 'rocket.core_outer_b': 0.7,
            'rocket.core_alpha': 0.35,
            'rocket.spark_rate': 320,
            'rocket.spark_speed': 760,
            'rocket.spark_spread': 1.6,
            'rocket.spark_size': 2.6,
            'rocket.spark_r': 1.0, 'rocket.spark_g': 0.8, 'rocket.spark_b': 0.3,
            'rocket.spark_alpha': 0.9,
            'rocket.wash_distance': 150,
            'rocket.wash_rate': 800
          }
        },
        'rocket-plasma': {
          cat: 'rocket',
          desc: 'Wide bright intense plasma jet — broad searing column',
          values: {
            'rocket.core_length': 60,
            'rocket.core_width': 8.0,
            'rocket.core_jitter': 2.0,
            'rocket.core_pulse_amp': 0.35,
            'rocket.core_inner_r': 2.0, 'rocket.core_inner_g': 1.9, 'rocket.core_inner_b': 2.0,
            'rocket.core_mid_r': 1.2, 'rocket.core_mid_g': 1.0, 'rocket.core_mid_b': 2.0,
            'rocket.core_outer_r': 1.9, 'rocket.core_outer_g': 0.6, 'rocket.core_outer_b': 2.0,
            'rocket.core_alpha': 0.7,
            'rocket.spark_rate': 160,
            'rocket.spark_speed': 880,
            'rocket.spark_spread': 1.2,
            'rocket.spark_size': 2.0,
            'rocket.spark_r': 1.6, 'rocket.spark_g': 0.9, 'rocket.spark_b': 2.0,
            'rocket.spark_alpha': 0.8,
            'rocket.wash_distance': 210,
            'rocket.wash_rate': 1200
          }
        },
        'rocket-retro': {
          cat: 'rocket',
          desc: 'Chunky low-detail plume — coarse, pixelated, blocky',
          values: {
            'rocket.core_length': 32,
            'rocket.core_width': 5.0,
            'rocket.core_jitter': 0.4,
            'rocket.core_pulse_amp': 0.1,
            'rocket.core_inner_r': 2.0, 'rocket.core_inner_g': 1.5, 'rocket.core_inner_b': 0.2,
            'rocket.core_mid_r': 1.9, 'rocket.core_mid_g': 0.6, 'rocket.core_mid_b': 0.1,
            'rocket.core_outer_r': 1.7, 'rocket.core_outer_g': 0.4, 'rocket.core_outer_b': 0.1,
            'rocket.core_alpha': 0.5,
            'rocket.spark_rate': 60,
            'rocket.spark_speed': 460,
            'rocket.spark_spread': 0.6,
            'rocket.spark_size': 3.2,
            'rocket.spark_r': 1.0, 'rocket.spark_g': 0.7, 'rocket.spark_b': 0.2,
            'rocket.spark_alpha': 0.95,
            'rocket.wash_distance': 110,
            'rocket.wash_rate': 600
          }
        },

        // ----- Rocket power ladder — 6 monotonic rungs (whisper..overkill).
        // The intensity levers escalate together; rung 2 is 'rocket-subtle'
        // and rung 5 is 'rocket-inferno' above. -----
        'rocket-whisper': {
          cat: 'rocket',
          desc: 'Faint short flame — power ladder rung 1 of 6',
          values: {
            'rocket.core_length': 14, 'rocket.core_length_min': 12,
            'rocket.core_width': 1.6, 'rocket.core_width_taper': 0.06,
            'rocket.core_jitter': 0.7,
            'rocket.core_pulse_amp': 0.1, 'rocket.core_pulse_freq': 20,
            'rocket.core_inner_r': 1.3, 'rocket.core_inner_g': 0.6, 'rocket.core_inner_b': 1.3,
            'rocket.core_mid_r': 0.55, 'rocket.core_mid_g': 0.78, 'rocket.core_mid_b': 1.5,
            'rocket.core_outer_r': 1.3, 'rocket.core_outer_g': 1.3, 'rocket.core_outer_b': 0.95,
            'rocket.core_alpha': 0.16,
            'rocket.shock_count': 2, 'rocket.shock_size': 1.0, 'rocket.shock_brightness': 0.08,
            'rocket.spark_rate': 6, 'rocket.spark_max': 80,
            'rocket.spark_speed': 360,
            'rocket.spark_spread': 0.55,
            'rocket.spark_size': 0.9,
            'rocket.spark_r': 0.2, 'rocket.spark_g': 0.5, 'rocket.spark_b': 0.6,
            'rocket.spark_alpha': 0.32,
            'rocket.wake_rate': 4, 'rocket.wake_max': 18,
            'rocket.wash_distance': 60, 'rocket.wash_rate': 320
          }
        },
        'rocket-strong': {
          cat: 'rocket',
          desc: 'Punchy plume, clearly bigger than stock — power ladder rung 3 of 6',
          values: {
            'rocket.core_length': 48, 'rocket.core_length_min': 42,
            'rocket.core_width': 3.6, 'rocket.core_width_taper': 0.04,
            'rocket.core_jitter': 2.6,
            'rocket.core_pulse_amp': 0.3, 'rocket.core_pulse_freq': 28,
            'rocket.core_inner_r': 1.7, 'rocket.core_inner_g': 0.4, 'rocket.core_inner_b': 1.7,
            'rocket.core_mid_r': 0.7, 'rocket.core_mid_g': 0.9, 'rocket.core_mid_b': 1.9,
            'rocket.core_outer_r': 1.9, 'rocket.core_outer_g': 1.9, 'rocket.core_outer_b': 1.2,
            'rocket.core_alpha': 0.42,
            'rocket.shock_count': 5, 'rocket.shock_size': 1.8, 'rocket.shock_brightness': 0.2,
            'rocket.spark_rate': 90, 'rocket.spark_max': 360,
            'rocket.spark_speed': 720,
            'rocket.spark_spread': 1.1,
            'rocket.spark_size': 1.7,
            'rocket.spark_r': 0.5, 'rocket.spark_g': 0.7, 'rocket.spark_b': 0.9,
            'rocket.spark_alpha': 0.6,
            'rocket.wake_rate': 40, 'rocket.wake_max': 90,
            'rocket.wash_distance': 165, 'rocket.wash_rate': 900
          }
        },
        'rocket-blazing': {
          cat: 'rocket',
          desc: 'Large aggressive plume, lots of spark — power ladder rung 4 of 6',
          values: {
            'rocket.core_length': 70, 'rocket.core_length_min': 62,
            'rocket.core_width': 5.6, 'rocket.core_width_taper': 0.035,
            'rocket.core_jitter': 4.0,
            'rocket.core_pulse_amp': 0.42, 'rocket.core_pulse_freq': 31,
            'rocket.core_inner_r': 1.9, 'rocket.core_inner_g': 0.8, 'rocket.core_inner_b': 1.0,
            'rocket.core_mid_r': 1.6, 'rocket.core_mid_g': 0.9, 'rocket.core_mid_b': 1.0,
            'rocket.core_outer_r': 1.9, 'rocket.core_outer_g': 1.2, 'rocket.core_outer_b': 0.6,
            'rocket.core_alpha': 0.6,
            'rocket.shock_count': 7, 'rocket.shock_size': 2.6, 'rocket.shock_brightness': 0.32,
            'rocket.spark_rate': 230, 'rocket.spark_max': 720,
            'rocket.spark_speed': 980,
            'rocket.spark_spread': 1.35,
            'rocket.spark_size': 2.3,
            'rocket.spark_r': 1.0, 'rocket.spark_g': 0.7, 'rocket.spark_b': 0.3,
            'rocket.spark_alpha': 0.82,
            'rocket.wake_rate': 95, 'rocket.wake_max': 200,
            'rocket.wash_distance': 250, 'rocket.wash_rate': 1600
          }
        },
        'rocket-overkill': {
          cat: 'rocket',
          desc: 'Everything near max — absurd — power ladder rung 6 of 6',
          values: {
            'rocket.core_length': 120, 'rocket.core_length_min': 110,
            'rocket.core_width': 12, 'rocket.core_width_taper': 0.02,
            'rocket.core_jitter': 9.5,
            'rocket.core_pulse_amp': 0.85, 'rocket.core_pulse_freq': 42,
            'rocket.core_inner_r': 2.4, 'rocket.core_inner_g': 1.8, 'rocket.core_inner_b': 0.6,
            'rocket.core_mid_r': 2.6, 'rocket.core_mid_g': 1.1, 'rocket.core_mid_b': 0.3,
            'rocket.core_outer_r': 2.2, 'rocket.core_outer_g': 0.6, 'rocket.core_outer_b': 0.15,
            'rocket.core_alpha': 1.0,
            'rocket.shock_count': 16, 'rocket.shock_size': 5.5, 'rocket.shock_brightness': 0.85,
            'rocket.spark_rate': 600, 'rocket.spark_max': 2000,
            'rocket.spark_speed': 1900,
            'rocket.spark_spread': 2.4,
            'rocket.spark_size': 5.5,
            'rocket.spark_r': 1.0, 'rocket.spark_g': 0.6, 'rocket.spark_b': 0.15,
            'rocket.spark_alpha': 1.4,
            'rocket.wake_rate': 380, 'rocket.wake_max': 500,
            'rocket.wash_distance': 400, 'rocket.wash_rate': 3000
          }
        },

        // ----- Rocket character / colour — pushes the HDR colour channels. -----
        'rocket-emerald': {
          cat: 'rocket',
          desc: 'Eerie green thruster — toxic glowing emerald flame',
          values: {
            'rocket.core_length': 44, 'rocket.core_length_min': 38,
            'rocket.core_width': 3.0, 'rocket.core_width_taper': 0.04,
            'rocket.core_jitter': 1.6,
            'rocket.core_pulse_amp': 0.22, 'rocket.core_pulse_freq': 27,
            'rocket.core_inner_r': 0.5, 'rocket.core_inner_g': 2.2, 'rocket.core_inner_b': 0.6,
            'rocket.core_mid_r': 0.3, 'rocket.core_mid_g': 1.9, 'rocket.core_mid_b': 0.7,
            'rocket.core_outer_r': 0.6, 'rocket.core_outer_g': 1.8, 'rocket.core_outer_b': 1.0,
            'rocket.core_alpha': 0.5,
            'rocket.shock_count': 5, 'rocket.shock_size': 2.0, 'rocket.shock_brightness': 0.2,
            'rocket.spark_rate': 110, 'rocket.spark_max': 420,
            'rocket.spark_speed': 700,
            'rocket.spark_spread': 0.9,
            'rocket.spark_size': 1.6,
            'rocket.spark_r': 0.4, 'rocket.spark_g': 2.0, 'rocket.spark_b': 0.5,
            'rocket.spark_alpha': 0.75,
            'rocket.wake_rate': 50, 'rocket.wake_max': 110,
            'rocket.wake_r': 0.5, 'rocket.wake_g': 1.6, 'rocket.wake_b': 0.7,
            'rocket.wash_distance': 150, 'rocket.wash_rate': 850
          }
        },
        'rocket-solar': {
          cat: 'rocket',
          desc: 'White-hot core fading to orange edges — like a sun flare',
          values: {
            'rocket.core_length': 56, 'rocket.core_length_min': 48,
            'rocket.core_width': 4.6, 'rocket.core_width_taper': 0.035,
            'rocket.core_jitter': 2.4,
            'rocket.core_pulse_amp': 0.3, 'rocket.core_pulse_freq': 30,
            'rocket.core_inner_r': 2.6, 'rocket.core_inner_g': 2.6, 'rocket.core_inner_b': 2.4,
            'rocket.core_mid_r': 2.4, 'rocket.core_mid_g': 1.7, 'rocket.core_mid_b': 0.7,
            'rocket.core_outer_r': 2.0, 'rocket.core_outer_g': 0.8, 'rocket.core_outer_b': 0.2,
            'rocket.core_alpha': 0.7,
            'rocket.shock_count': 6, 'rocket.shock_size': 2.4, 'rocket.shock_brightness': 0.4,
            'rocket.spark_rate': 160, 'rocket.spark_max': 560,
            'rocket.spark_speed': 880,
            'rocket.spark_spread': 1.2,
            'rocket.spark_size': 2.0,
            'rocket.spark_r': 2.4, 'rocket.spark_g': 1.5, 'rocket.spark_b': 0.5,
            'rocket.spark_alpha': 0.9,
            'rocket.wake_rate': 70, 'rocket.wake_max': 150,
            'rocket.wake_r': 2.0, 'rocket.wake_g': 1.4, 'rocket.wake_b': 0.9,
            'rocket.wash_distance': 190, 'rocket.wash_rate': 1100
          }
        },
        'rocket-crimson': {
          cat: 'rocket',
          desc: 'Deep blood-red exhaust — dark menacing crimson flame',
          values: {
            'rocket.core_length': 50, 'rocket.core_length_min': 44,
            'rocket.core_width': 4.0, 'rocket.core_width_taper': 0.04,
            'rocket.core_jitter': 3.0,
            'rocket.core_pulse_amp': 0.36, 'rocket.core_pulse_freq': 25,
            'rocket.core_inner_r': 2.4, 'rocket.core_inner_g': 0.5, 'rocket.core_inner_b': 0.3,
            'rocket.core_mid_r': 1.9, 'rocket.core_mid_g': 0.2, 'rocket.core_mid_b': 0.15,
            'rocket.core_outer_r': 1.3, 'rocket.core_outer_g': 0.08, 'rocket.core_outer_b': 0.06,
            'rocket.core_alpha': 0.62,
            'rocket.shock_count': 5, 'rocket.shock_size': 2.2, 'rocket.shock_brightness': 0.26,
            'rocket.spark_rate': 130, 'rocket.spark_max': 480,
            'rocket.spark_speed': 760,
            'rocket.spark_spread': 1.0,
            'rocket.spark_size': 1.8,
            'rocket.spark_r': 2.2, 'rocket.spark_g': 0.3, 'rocket.spark_b': 0.2,
            'rocket.spark_alpha': 0.8,
            'rocket.wake_rate': 60, 'rocket.wake_max': 130,
            'rocket.wake_r': 1.4, 'rocket.wake_g': 0.4, 'rocket.wake_b': 0.35,
            'rocket.wash_distance': 170, 'rocket.wash_rate': 950
          }
        },
        'rocket-cyan-jet': {
          cat: 'rocket',
          desc: 'Electric cyan jet — long thin crackling blue-green beam',
          values: {
            'rocket.core_length': 92, 'rocket.core_length_min': 84,
            'rocket.core_width': 1.9, 'rocket.core_width_taper': 0.02,
            'rocket.core_jitter': 0.9,
            'rocket.core_pulse_amp': 0.14, 'rocket.core_pulse_freq': 33,
            'rocket.core_inner_r': 0.5, 'rocket.core_inner_g': 2.4, 'rocket.core_inner_b': 2.6,
            'rocket.core_mid_r': 0.2, 'rocket.core_mid_g': 1.9, 'rocket.core_mid_b': 2.4,
            'rocket.core_outer_r': 0.3, 'rocket.core_outer_g': 1.3, 'rocket.core_outer_b': 1.9,
            'rocket.core_alpha': 0.6,
            'rocket.shock_count': 8, 'rocket.shock_size': 1.4, 'rocket.shock_brightness': 0.3,
            'rocket.spark_rate': 90, 'rocket.spark_max': 380,
            'rocket.spark_speed': 1000,
            'rocket.spark_spread': 0.4,
            'rocket.spark_size': 1.2,
            'rocket.spark_r': 0.4, 'rocket.spark_g': 2.2, 'rocket.spark_b': 2.5,
            'rocket.spark_alpha': 0.85,
            'rocket.wake_rate': 30, 'rocket.wake_max': 80,
            'rocket.wake_r': 0.5, 'rocket.wake_g': 1.7, 'rocket.wake_b': 1.9,
            'rocket.wash_distance': 130, 'rocket.wash_rate': 760
          }
        },
        'rocket-gold': {
          cat: 'rocket',
          desc: 'Warm gold and amber plume — rich molten-honey glow',
          values: {
            'rocket.core_length': 52, 'rocket.core_length_min': 46,
            'rocket.core_width': 4.2, 'rocket.core_width_taper': 0.04,
            'rocket.core_jitter': 2.2,
            'rocket.core_pulse_amp': 0.26, 'rocket.core_pulse_freq': 28,
            'rocket.core_inner_r': 2.4, 'rocket.core_inner_g': 1.9, 'rocket.core_inner_b': 0.7,
            'rocket.core_mid_r': 2.2, 'rocket.core_mid_g': 1.4, 'rocket.core_mid_b': 0.35,
            'rocket.core_outer_r': 1.8, 'rocket.core_outer_g': 1.0, 'rocket.core_outer_b': 0.25,
            'rocket.core_alpha': 0.58,
            'rocket.shock_count': 6, 'rocket.shock_size': 2.2, 'rocket.shock_brightness': 0.3,
            'rocket.spark_rate': 140, 'rocket.spark_max': 500,
            'rocket.spark_speed': 740,
            'rocket.spark_spread': 1.0,
            'rocket.spark_size': 1.9,
            'rocket.spark_r': 2.2, 'rocket.spark_g': 1.6, 'rocket.spark_b': 0.5,
            'rocket.spark_alpha': 0.85,
            'rocket.wake_rate': 60, 'rocket.wake_max': 130,
            'rocket.wake_r': 1.9, 'rocket.wake_g': 1.3, 'rocket.wake_b': 0.7,
            'rocket.wash_distance': 175, 'rocket.wash_rate': 1000
          }
        },

        // ----- Rocket style / wild — genuinely out-of-the-box looks. -----
        'rocket-comet': {
          cat: 'rocket',
          desc: 'Very long thin core plus long smoke wake — a streaking tail',
          values: {
            'rocket.core_length': 118, 'rocket.core_length_min': 100,
            'rocket.core_width': 1.7, 'rocket.core_width_taper': 0.015,
            'rocket.core_jitter': 1.0,
            'rocket.core_pulse_amp': 0.12, 'rocket.core_pulse_freq': 22,
            'rocket.core_inner_r': 2.0, 'rocket.core_inner_g': 1.7, 'rocket.core_inner_b': 1.9,
            'rocket.core_mid_r': 1.0, 'rocket.core_mid_g': 1.1, 'rocket.core_mid_b': 2.0,
            'rocket.core_outer_r': 1.6, 'rocket.core_outer_g': 1.6, 'rocket.core_outer_b': 1.0,
            'rocket.core_alpha': 0.5,
            'rocket.shock_count': 4, 'rocket.shock_size': 1.2, 'rocket.shock_brightness': 0.15,
            'rocket.spark_rate': 70, 'rocket.spark_max': 420,
            'rocket.spark_speed': 1100,
            'rocket.spark_spread': 0.35,
            'rocket.spark_size': 1.3, 'rocket.spark_life': 3.5, 'rocket.spark_drag': 1.2,
            'rocket.spark_r': 1.4, 'rocket.spark_g': 1.5, 'rocket.spark_b': 1.9,
            'rocket.spark_alpha': 0.8,
            'rocket.wake_rate': 220, 'rocket.wake_max': 500,
            'rocket.wake_speed': 110, 'rocket.wake_spread': 0.2,
            'rocket.wake_life': 3.6, 'rocket.wake_size': 2.6, 'rocket.wake_growth': 2.4,
            'rocket.wake_r': 1.6, 'rocket.wake_g': 1.6, 'rocket.wake_b': 2.0,
            'rocket.wake_alpha': 0.85,
            'rocket.wash_distance': 120, 'rocket.wash_rate': 600
          }
        },
        'rocket-smokestack': {
          cat: 'rocket',
          desc: 'Wake-heavy, faint flame — mostly billowing smoke, little fire',
          values: {
            'rocket.core_length': 18, 'rocket.core_length_min': 15,
            'rocket.core_width': 2.2, 'rocket.core_width_taper': 0.06,
            'rocket.core_jitter': 1.0,
            'rocket.core_pulse_amp': 0.12, 'rocket.core_pulse_freq': 20,
            'rocket.core_inner_r': 1.2, 'rocket.core_inner_g': 0.7, 'rocket.core_inner_b': 0.9,
            'rocket.core_mid_r': 0.7, 'rocket.core_mid_g': 0.7, 'rocket.core_mid_b': 0.9,
            'rocket.core_outer_r': 1.0, 'rocket.core_outer_g': 0.9, 'rocket.core_outer_b': 0.7,
            'rocket.core_alpha': 0.18,
            'rocket.shock_count': 2, 'rocket.shock_size': 0.8, 'rocket.shock_brightness': 0.06,
            'rocket.spark_rate': 10, 'rocket.spark_max': 90,
            'rocket.spark_speed': 320,
            'rocket.spark_spread': 0.6,
            'rocket.spark_size': 1.0,
            'rocket.spark_r': 0.6, 'rocket.spark_g': 0.5, 'rocket.spark_b': 0.4,
            'rocket.spark_alpha': 0.3,
            'rocket.wake_rate': 360, 'rocket.wake_max': 500,
            'rocket.wake_speed': 70, 'rocket.wake_spread': 0.7,
            'rocket.wake_life': 3.8, 'rocket.wake_size': 4.5, 'rocket.wake_growth': 2.8,
            'rocket.wake_drag': 0.4, 'rocket.wake_buoyancy': 160,
            'rocket.wake_r': 0.7, 'rocket.wake_g': 0.68, 'rocket.wake_b': 0.66,
            'rocket.wake_alpha': 1.0,
            'rocket.wash_distance': 110, 'rocket.wash_rate': 700
          }
        },
        'rocket-strobe': {
          cat: 'rocket',
          desc: 'Violent flicker — extreme core pulse, a strobing arc-light plume',
          values: {
            'rocket.core_length': 54, 'rocket.core_length_min': 20,
            'rocket.core_width': 4.5, 'rocket.core_width_taper': 0.04,
            'rocket.core_jitter': 6.0,
            'rocket.core_pulse_amp': 1.0, 'rocket.core_pulse_freq': 80,
            'rocket.core_inner_r': 2.4, 'rocket.core_inner_g': 2.2, 'rocket.core_inner_b': 2.6,
            'rocket.core_mid_r': 1.2, 'rocket.core_mid_g': 1.4, 'rocket.core_mid_b': 2.4,
            'rocket.core_outer_r': 2.2, 'rocket.core_outer_g': 1.8, 'rocket.core_outer_b': 2.0,
            'rocket.core_alpha': 0.7,
            'rocket.shock_count': 10, 'rocket.shock_size': 3.0, 'rocket.shock_brightness': 0.6,
            'rocket.shock_pulse_freq': 150,
            'rocket.spark_rate': 240, 'rocket.spark_max': 700,
            'rocket.spark_speed': 1100,
            'rocket.spark_spread': 1.4,
            'rocket.spark_size': 2.2,
            'rocket.spark_r': 2.0, 'rocket.spark_g': 1.9, 'rocket.spark_b': 2.2,
            'rocket.spark_alpha': 0.9,
            'rocket.wake_rate': 60, 'rocket.wake_max': 140,
            'rocket.wash_distance': 200, 'rocket.wash_rate': 1300,
            'rocket.wash_impact_pulse_freq': 60
          }
        },
        'rocket-void': {
          cat: 'rocket',
          desc: 'Dark cold eerie plume — dim cool colours, barely glowing',
          values: {
            'rocket.core_length': 40, 'rocket.core_length_min': 34,
            'rocket.core_width': 3.4, 'rocket.core_width_taper': 0.05,
            'rocket.core_jitter': 1.4,
            'rocket.core_pulse_amp': 0.18, 'rocket.core_pulse_freq': 14,
            'rocket.core_inner_r': 0.3, 'rocket.core_inner_g': 0.35, 'rocket.core_inner_b': 0.6,
            'rocket.core_mid_r': 0.15, 'rocket.core_mid_g': 0.25, 'rocket.core_mid_b': 0.5,
            'rocket.core_outer_r': 0.2, 'rocket.core_outer_g': 0.22, 'rocket.core_outer_b': 0.4,
            'rocket.core_alpha': 0.2,
            'rocket.shock_count': 3, 'rocket.shock_size': 1.4, 'rocket.shock_brightness': 0.06,
            'rocket.spark_rate': 40, 'rocket.spark_max': 260,
            'rocket.spark_speed': 500,
            'rocket.spark_spread': 0.8,
            'rocket.spark_size': 1.3,
            'rocket.spark_r': 0.25, 'rocket.spark_g': 0.3, 'rocket.spark_b': 0.55,
            'rocket.spark_alpha': 0.3,
            'rocket.wake_rate': 90, 'rocket.wake_max': 200,
            'rocket.wake_speed': 50, 'rocket.wake_life': 2.6, 'rocket.wake_size': 2.4,
            'rocket.wake_r': 0.22, 'rocket.wake_g': 0.26, 'rocket.wake_b': 0.45,
            'rocket.wake_alpha': 0.5,
            'rocket.wash_distance': 120, 'rocket.wash_rate': 600
          }
        },

        // ===== Water materials (cat:'water') — water.* levers =====
        // Each preset is a COMPLETE material: the rendered look (water/oil/
        // foam colour, opacity, particle size) AND the WebGPU sim's fluid-
        // feel physics (gravity, stiffness, damping, bounce, friction).
        // Applying one is a total swap — colour and behaviour at once.
        // Some push the sim hard enough that it barely reads as a liquid
        // (superball, popcorn, jelly, antigravity). All live, no recompile.
        // Colour/alpha/foam [0..1], particle size [0.5..4]; physics inside
        // the registered lever ranges (TUNING.md §2).
        'water-default': {
          cat: 'water',
          desc: 'Stock cyan water + black oil — the shipping material',
          values: {
            'water.LIQUID_WATER_R': 0.365, 'water.LIQUID_WATER_G': 0.780, 'water.LIQUID_WATER_B': 0.933,
            'water.LIQUID_WATER_ALPHA': 0.70,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.051, 'water.LIQUID_OIL_G': 0.039, 'water.LIQUID_OIL_B': 0.020,
            'water.LIQUID_OIL_ALPHA': 0.92,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.8, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.5,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 600,
            'water.LIQUID_PRESSURE_STIFF': 2.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.5,
            'water.LIQUID_DAMPING': 0.992, 'water.LIQUID_OIL_DAMPING': 0.97,
            'water.LIQUID_WATER_MOTION_SCALE': 0.97,
            'water.LIQUID_BOUNCE_WATER': 0.18, 'water.LIQUID_BOUNCE_OIL': 0.05,
            'water.LIQUID_WALL_BOUNCE_IN': 0.075, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.095,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.97
          }
        },
        'water-mercury': {
          cat: 'water',
          desc: 'Liquid silver mercury — dense, heavy, metallic',
          values: {
            'water.LIQUID_WATER_R': 0.78, 'water.LIQUID_WATER_G': 0.80, 'water.LIQUID_WATER_B': 0.85,
            'water.LIQUID_WATER_ALPHA': 0.98,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.30, 'water.LIQUID_OIL_G': 0.31, 'water.LIQUID_OIL_B': 0.34,
            'water.LIQUID_OIL_ALPHA': 0.97,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.2, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.8,
            'water.LIQUID_GRAVITY': 1380, 'water.LIQUID_OIL_GRAVITY': 980,
            'water.LIQUID_PRESSURE_STIFF': 3.4, 'water.LIQUID_OIL_PRESSURE_STIFF': 3.0,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.965,
            'water.LIQUID_WATER_MOTION_SCALE': 0.95,
            'water.LIQUID_BOUNCE_WATER': 0.06, 'water.LIQUID_BOUNCE_OIL': 0.04,
            'water.LIQUID_WALL_BOUNCE_IN': 0.04, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.05,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-magma': {
          cat: 'water',
          desc: 'Molten magma — barely flows, slumps and sticks',
          values: {
            'water.LIQUID_WATER_R': 1.0, 'water.LIQUID_WATER_G': 0.30, 'water.LIQUID_WATER_B': 0.05,
            'water.LIQUID_WATER_ALPHA': 0.98,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.82, 'water.LIQUID_WATER_FOAM_B': 0.28,
            'water.LIQUID_OIL_R': 0.20, 'water.LIQUID_OIL_G': 0.04, 'water.LIQUID_OIL_B': 0.0,
            'water.LIQUID_OIL_ALPHA': 0.99,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.5, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.9,
            'water.LIQUID_GRAVITY': 1320, 'water.LIQUID_OIL_GRAVITY': 1050,
            'water.LIQUID_PRESSURE_STIFF': 1.5, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.4,
            'water.LIQUID_DAMPING': 0.958, 'water.LIQUID_OIL_DAMPING': 0.955,
            'water.LIQUID_WATER_MOTION_SCALE': 0.82,
            'water.LIQUID_BOUNCE_WATER': 0.0, 'water.LIQUID_BOUNCE_OIL': 0.0,
            'water.LIQUID_WALL_BOUNCE_IN': 0.0, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.0,
            'water.LIQUID_FLOOR_FRICTION': 1.0, 'water.LIQUID_WALL_FRICTION': 1.0
          }
        },
        'water-honey': {
          cat: 'water',
          desc: 'Amber honey — thick, slow, viscous drag',
          values: {
            'water.LIQUID_WATER_R': 0.92, 'water.LIQUID_WATER_G': 0.62, 'water.LIQUID_WATER_B': 0.12,
            'water.LIQUID_WATER_ALPHA': 0.74,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.88, 'water.LIQUID_WATER_FOAM_B': 0.55,
            'water.LIQUID_OIL_R': 0.40, 'water.LIQUID_OIL_G': 0.26, 'water.LIQUID_OIL_B': 0.05,
            'water.LIQUID_OIL_ALPHA': 0.90,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.1, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 940, 'water.LIQUID_OIL_GRAVITY': 620,
            'water.LIQUID_PRESSURE_STIFF': 2.2, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.0,
            'water.LIQUID_DAMPING': 0.96, 'water.LIQUID_OIL_DAMPING': 0.957,
            'water.LIQUID_WATER_MOTION_SCALE': 0.84,
            'water.LIQUID_BOUNCE_WATER': 0.04, 'water.LIQUID_BOUNCE_OIL': 0.03,
            'water.LIQUID_WALL_BOUNCE_IN': 0.02, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.03,
            'water.LIQUID_FLOOR_FRICTION': 0.87, 'water.LIQUID_WALL_FRICTION': 0.91
          }
        },
        'water-blood': {
          cat: 'water',
          desc: 'Deep crimson blood — heavy, dark, opaque',
          values: {
            'water.LIQUID_WATER_R': 0.55, 'water.LIQUID_WATER_G': 0.02, 'water.LIQUID_WATER_B': 0.04,
            'water.LIQUID_WATER_ALPHA': 0.93,
            'water.LIQUID_WATER_FOAM_R': 0.95, 'water.LIQUID_WATER_FOAM_G': 0.40, 'water.LIQUID_WATER_FOAM_B': 0.40,
            'water.LIQUID_OIL_R': 0.15, 'water.LIQUID_OIL_G': 0.0, 'water.LIQUID_OIL_B': 0.01,
            'water.LIQUID_OIL_ALPHA': 0.95,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 1380, 'water.LIQUID_OIL_GRAVITY': 980,
            'water.LIQUID_PRESSURE_STIFF': 3.4, 'water.LIQUID_OIL_PRESSURE_STIFF': 3.0,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.965,
            'water.LIQUID_WATER_MOTION_SCALE': 0.95,
            'water.LIQUID_BOUNCE_WATER': 0.06, 'water.LIQUID_BOUNCE_OIL': 0.04,
            'water.LIQUID_WALL_BOUNCE_IN': 0.04, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.05,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-oil-slick': {
          cat: 'water',
          desc: 'Dark oil slick — sluggish iridescent crude',
          values: {
            'water.LIQUID_WATER_R': 0.10, 'water.LIQUID_WATER_G': 0.09, 'water.LIQUID_WATER_B': 0.14,
            'water.LIQUID_WATER_ALPHA': 0.88,
            'water.LIQUID_WATER_FOAM_R': 0.45, 'water.LIQUID_WATER_FOAM_G': 0.50, 'water.LIQUID_WATER_FOAM_B': 0.65,
            'water.LIQUID_OIL_R': 0.04, 'water.LIQUID_OIL_G': 0.03, 'water.LIQUID_OIL_B': 0.06,
            'water.LIQUID_OIL_ALPHA': 0.97,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 940, 'water.LIQUID_OIL_GRAVITY': 620,
            'water.LIQUID_PRESSURE_STIFF': 2.2, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.0,
            'water.LIQUID_DAMPING': 0.96, 'water.LIQUID_OIL_DAMPING': 0.957,
            'water.LIQUID_WATER_MOTION_SCALE': 0.84,
            'water.LIQUID_BOUNCE_WATER': 0.04, 'water.LIQUID_BOUNCE_OIL': 0.03,
            'water.LIQUID_WALL_BOUNCE_IN': 0.02, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.03,
            'water.LIQUID_FLOOR_FRICTION': 0.87, 'water.LIQUID_WALL_FRICTION': 0.91
          }
        },
        'water-quicksilver': {
          cat: 'water',
          desc: 'Quicksilver — frictionless, races and never rests',
          values: {
            'water.LIQUID_WATER_R': 0.85, 'water.LIQUID_WATER_G': 0.87, 'water.LIQUID_WATER_B': 0.92,
            'water.LIQUID_WATER_ALPHA': 0.97,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.42, 'water.LIQUID_OIL_G': 0.43, 'water.LIQUID_OIL_B': 0.47,
            'water.LIQUID_OIL_ALPHA': 0.95,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 1120, 'water.LIQUID_OIL_GRAVITY': 720,
            'water.LIQUID_PRESSURE_STIFF': 3.0, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.7,
            'water.LIQUID_DAMPING': 0.999, 'water.LIQUID_OIL_DAMPING': 0.995,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.22, 'water.LIQUID_BOUNCE_OIL': 0.12,
            'water.LIQUID_WALL_BOUNCE_IN': 0.12, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.14,
            'water.LIQUID_FLOOR_FRICTION': 0.80, 'water.LIQUID_WALL_FRICTION': 0.85
          }
        },
        'water-superball': {
          cat: 'water',
          desc: 'Superball — bounces off everything, hardly a liquid',
          values: {
            'water.LIQUID_WATER_R': 0.05, 'water.LIQUID_WATER_G': 0.95, 'water.LIQUID_WATER_B': 0.70,
            'water.LIQUID_WATER_ALPHA': 0.92,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.95, 'water.LIQUID_OIL_G': 0.20, 'water.LIQUID_OIL_B': 0.55,
            'water.LIQUID_OIL_ALPHA': 0.90,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.2, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.8,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 620,
            'water.LIQUID_PRESSURE_STIFF': 6.0, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.6,
            'water.LIQUID_DAMPING': 0.999, 'water.LIQUID_OIL_DAMPING': 0.996,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.60, 'water.LIQUID_BOUNCE_OIL': 0.52,
            'water.LIQUID_WALL_BOUNCE_IN': 0.40, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.40,
            'water.LIQUID_FLOOR_FRICTION': 0.85, 'water.LIQUID_WALL_FRICTION': 0.86
          }
        },
        'water-popcorn': {
          cat: 'water',
          desc: 'Popcorn — light kernels leap and scatter, not a liquid',
          values: {
            'water.LIQUID_WATER_R': 0.98, 'water.LIQUID_WATER_G': 0.90, 'water.LIQUID_WATER_B': 0.55,
            'water.LIQUID_WATER_ALPHA': 0.95,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.98, 'water.LIQUID_WATER_FOAM_B': 0.85,
            'water.LIQUID_OIL_R': 0.55, 'water.LIQUID_OIL_G': 0.42, 'water.LIQUID_OIL_B': 0.10,
            'water.LIQUID_OIL_ALPHA': 0.93,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.6, 'water.LIQUID_OIL_PARTICLE_SIZE': 3.0,
            'water.LIQUID_GRAVITY': 640, 'water.LIQUID_OIL_GRAVITY': 420,
            'water.LIQUID_PRESSURE_STIFF': 5.7, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.3,
            'water.LIQUID_DAMPING': 0.998, 'water.LIQUID_OIL_DAMPING': 0.995,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.52, 'water.LIQUID_BOUNCE_OIL': 0.42,
            'water.LIQUID_WALL_BOUNCE_IN': 0.34, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.36,
            'water.LIQUID_FLOOR_FRICTION': 0.86, 'water.LIQUID_WALL_FRICTION': 0.88
          }
        },
        'water-champagne': {
          cat: 'water',
          desc: 'Champagne — pale, weightless, endlessly fizzing',
          values: {
            'water.LIQUID_WATER_R': 0.96, 'water.LIQUID_WATER_G': 0.88, 'water.LIQUID_WATER_B': 0.55,
            'water.LIQUID_WATER_ALPHA': 0.55,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.70, 'water.LIQUID_OIL_G': 0.58, 'water.LIQUID_OIL_B': 0.22,
            'water.LIQUID_OIL_ALPHA': 0.55,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.7, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.3,
            'water.LIQUID_GRAVITY': 440, 'water.LIQUID_OIL_GRAVITY': 290,
            'water.LIQUID_PRESSURE_STIFF': 2.3, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.1,
            'water.LIQUID_DAMPING': 0.999, 'water.LIQUID_OIL_DAMPING': 0.997,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.14, 'water.LIQUID_BOUNCE_OIL': 0.08,
            'water.LIQUID_WALL_BOUNCE_IN': 0.08, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.10,
            'water.LIQUID_FLOOR_FRICTION': 0.95, 'water.LIQUID_WALL_FRICTION': 0.98,
            'water.LIQUID_AERATION_BLUR': 0.09, 'water.LIQUID_AERATION_DAMP': 0.96,
            'water.LIQUID_AERATION_THRESHOLD': 0.88, 'water.LIQUID_AERATION_COEFF': 28
          }
        },
        'water-plasma': {
          cat: 'water',
          desc: 'Magenta plasma — wild, chaotic, electric churn',
          values: {
            'water.LIQUID_WATER_R': 1.0, 'water.LIQUID_WATER_G': 0.10, 'water.LIQUID_WATER_B': 0.80,
            'water.LIQUID_WATER_ALPHA': 0.84,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.70, 'water.LIQUID_WATER_FOAM_B': 0.95,
            'water.LIQUID_OIL_R': 0.55, 'water.LIQUID_OIL_G': 0.0, 'water.LIQUID_OIL_B': 0.55,
            'water.LIQUID_OIL_ALPHA': 0.90,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 920, 'water.LIQUID_OIL_GRAVITY': 640,
            'water.LIQUID_PRESSURE_STIFF': 5.6, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.0,
            'water.LIQUID_DAMPING': 0.999, 'water.LIQUID_OIL_DAMPING': 0.994,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.55, 'water.LIQUID_BOUNCE_OIL': 0.40,
            'water.LIQUID_WALL_BOUNCE_IN': 0.38, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.40,
            'water.LIQUID_FLOOR_FRICTION': 0.85, 'water.LIQUID_WALL_FRICTION': 0.86
          }
        },
        'water-toxic': {
          cat: 'water',
          desc: 'Radioactive sludge — glowing green, froths and bubbles',
          values: {
            'water.LIQUID_WATER_R': 0.45, 'water.LIQUID_WATER_G': 1.0, 'water.LIQUID_WATER_B': 0.0,
            'water.LIQUID_WATER_ALPHA': 0.85,
            'water.LIQUID_WATER_FOAM_R': 0.85, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 0.45,
            'water.LIQUID_OIL_R': 0.10, 'water.LIQUID_OIL_G': 0.22, 'water.LIQUID_OIL_B': 0.0,
            'water.LIQUID_OIL_ALPHA': 0.93,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.1, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 600,
            'water.LIQUID_PRESSURE_STIFF': 2.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.5,
            'water.LIQUID_DAMPING': 0.992, 'water.LIQUID_OIL_DAMPING': 0.97,
            'water.LIQUID_WATER_MOTION_SCALE': 0.97,
            'water.LIQUID_BOUNCE_WATER': 0.18, 'water.LIQUID_BOUNCE_OIL': 0.05,
            'water.LIQUID_WALL_BOUNCE_IN': 0.075, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.095,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.97,
            'water.LIQUID_AERATION_BLUR': 0.09, 'water.LIQUID_AERATION_DAMP': 0.96,
            'water.LIQUID_AERATION_THRESHOLD': 0.88, 'water.LIQUID_AERATION_COEFF': 28
          }
        },
        'water-void': {
          cat: 'water',
          desc: 'Void matter — black, dense, wobbling dark mass',
          values: {
            'water.LIQUID_WATER_R': 0.02, 'water.LIQUID_WATER_G': 0.02, 'water.LIQUID_WATER_B': 0.03,
            'water.LIQUID_WATER_ALPHA': 0.96,
            'water.LIQUID_WATER_FOAM_R': 0.30, 'water.LIQUID_WATER_FOAM_G': 0.30, 'water.LIQUID_WATER_FOAM_B': 0.34,
            'water.LIQUID_OIL_R': 0.0, 'water.LIQUID_OIL_G': 0.0, 'water.LIQUID_OIL_B': 0.0,
            'water.LIQUID_OIL_ALPHA': 1.0,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 780, 'water.LIQUID_OIL_GRAVITY': 520,
            'water.LIQUID_PRESSURE_STIFF': 5.8, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.2,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.978,
            'water.LIQUID_WATER_MOTION_SCALE': 0.90,
            'water.LIQUID_BOUNCE_WATER': 0.40, 'water.LIQUID_BOUNCE_OIL': 0.30,
            'water.LIQUID_WALL_BOUNCE_IN': 0.26, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.30,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-lava': {
          cat: 'water',
          desc: 'Bright lava — heavy molten rock, slams and spreads',
          values: {
            'water.LIQUID_WATER_R': 1.0, 'water.LIQUID_WATER_G': 0.42, 'water.LIQUID_WATER_B': 0.08,
            'water.LIQUID_WATER_ALPHA': 0.97,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.78, 'water.LIQUID_WATER_FOAM_B': 0.30,
            'water.LIQUID_OIL_R': 0.30, 'water.LIQUID_OIL_G': 0.08, 'water.LIQUID_OIL_B': 0.0,
            'water.LIQUID_OIL_ALPHA': 0.98,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.4, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.9,
            'water.LIQUID_GRAVITY': 1380, 'water.LIQUID_OIL_GRAVITY': 980,
            'water.LIQUID_PRESSURE_STIFF': 3.4, 'water.LIQUID_OIL_PRESSURE_STIFF': 3.0,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.965,
            'water.LIQUID_WATER_MOTION_SCALE': 0.95,
            'water.LIQUID_BOUNCE_WATER': 0.06, 'water.LIQUID_BOUNCE_OIL': 0.04,
            'water.LIQUID_WALL_BOUNCE_IN': 0.04, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.05,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-slime': {
          cat: 'water',
          desc: 'Slime — soft drifting blobs of green goo',
          values: {
            'water.LIQUID_WATER_R': 0.35, 'water.LIQUID_WATER_G': 0.95, 'water.LIQUID_WATER_B': 0.20,
            'water.LIQUID_WATER_ALPHA': 0.80,
            'water.LIQUID_WATER_FOAM_R': 0.70, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 0.50,
            'water.LIQUID_OIL_R': 0.18, 'water.LIQUID_OIL_G': 0.30, 'water.LIQUID_OIL_B': 0.05,
            'water.LIQUID_OIL_ALPHA': 0.92,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.3, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.8,
            'water.LIQUID_GRAVITY': 560, 'water.LIQUID_OIL_GRAVITY': 380,
            'water.LIQUID_PRESSURE_STIFF': 1.6, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.5,
            'water.LIQUID_DAMPING': 0.997, 'water.LIQUID_OIL_DAMPING': 0.994,
            'water.LIQUID_WATER_MOTION_SCALE': 0.92,
            'water.LIQUID_BOUNCE_WATER': 0.20, 'water.LIQUID_BOUNCE_OIL': 0.12,
            'water.LIQUID_WALL_BOUNCE_IN': 0.10, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.12,
            'water.LIQUID_FLOOR_FRICTION': 0.93, 'water.LIQUID_WALL_FRICTION': 0.96
          }
        },
        'water-ectoplasm': {
          cat: 'water',
          desc: 'Ectoplasm — pale ghostly vapour, drifts and hangs',
          values: {
            'water.LIQUID_WATER_R': 0.70, 'water.LIQUID_WATER_G': 0.95, 'water.LIQUID_WATER_B': 0.78,
            'water.LIQUID_WATER_ALPHA': 0.30,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.40, 'water.LIQUID_OIL_G': 0.55, 'water.LIQUID_OIL_B': 0.45,
            'water.LIQUID_OIL_ALPHA': 0.32,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.7, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.3,
            'water.LIQUID_GRAVITY': 470, 'water.LIQUID_OIL_GRAVITY': 310,
            'water.LIQUID_PRESSURE_STIFF': 2.5, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.2,
            'water.LIQUID_DAMPING': 0.998, 'water.LIQUID_OIL_DAMPING': 0.996,
            'water.LIQUID_WATER_MOTION_SCALE': 0.99,
            'water.LIQUID_BOUNCE_WATER': 0.16, 'water.LIQUID_BOUNCE_OIL': 0.09,
            'water.LIQUID_WALL_BOUNCE_IN': 0.10, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.12,
            'water.LIQUID_FLOOR_FRICTION': 0.94, 'water.LIQUID_WALL_FRICTION': 0.97
          }
        },
        'water-antigravity': {
          cat: 'water',
          desc: 'Antigravity mist — near-weightless, floats in place',
          values: {
            'water.LIQUID_WATER_R': 0.55, 'water.LIQUID_WATER_G': 0.92, 'water.LIQUID_WATER_B': 1.0,
            'water.LIQUID_WATER_ALPHA': 0.42,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.30, 'water.LIQUID_OIL_G': 0.55, 'water.LIQUID_OIL_B': 0.65,
            'water.LIQUID_OIL_ALPHA': 0.45,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.7, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.3,
            'water.LIQUID_GRAVITY': 400, 'water.LIQUID_OIL_GRAVITY': 250,
            'water.LIQUID_PRESSURE_STIFF': 1.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.8,
            'water.LIQUID_DAMPING': 1.0, 'water.LIQUID_OIL_DAMPING': 1.0,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.12, 'water.LIQUID_BOUNCE_OIL': 0.06,
            'water.LIQUID_WALL_BOUNCE_IN': 0.06, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.08,
            'water.LIQUID_FLOOR_FRICTION': 0.96, 'water.LIQUID_WALL_FRICTION': 0.99
          }
        },
        'water-jelly': {
          cat: 'water',
          desc: 'Jelly — translucent wobbling springy blob',
          values: {
            'water.LIQUID_WATER_R': 0.55, 'water.LIQUID_WATER_G': 0.20, 'water.LIQUID_WATER_B': 0.85,
            'water.LIQUID_WATER_ALPHA': 0.72,
            'water.LIQUID_WATER_FOAM_R': 0.85, 'water.LIQUID_WATER_FOAM_G': 0.70, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.25, 'water.LIQUID_OIL_G': 0.05, 'water.LIQUID_OIL_B': 0.40,
            'water.LIQUID_OIL_ALPHA': 0.88,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.3, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.9,
            'water.LIQUID_GRAVITY': 780, 'water.LIQUID_OIL_GRAVITY': 520,
            'water.LIQUID_PRESSURE_STIFF': 5.8, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.2,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.978,
            'water.LIQUID_WATER_MOTION_SCALE': 0.90,
            'water.LIQUID_BOUNCE_WATER': 0.40, 'water.LIQUID_BOUNCE_OIL': 0.30,
            'water.LIQUID_WALL_BOUNCE_IN': 0.26, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.30,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-tar-pit': {
          cat: 'water',
          desc: 'Tar pit — black, dead, sticks where it lands',
          values: {
            'water.LIQUID_WATER_R': 0.05, 'water.LIQUID_WATER_G': 0.04, 'water.LIQUID_WATER_B': 0.03,
            'water.LIQUID_WATER_ALPHA': 0.99,
            'water.LIQUID_WATER_FOAM_R': 0.25, 'water.LIQUID_WATER_FOAM_G': 0.22, 'water.LIQUID_WATER_FOAM_B': 0.18,
            'water.LIQUID_OIL_R': 0.02, 'water.LIQUID_OIL_G': 0.015, 'water.LIQUID_OIL_B': 0.01,
            'water.LIQUID_OIL_ALPHA': 1.0,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.4, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.9,
            'water.LIQUID_GRAVITY': 1320, 'water.LIQUID_OIL_GRAVITY': 1050,
            'water.LIQUID_PRESSURE_STIFF': 1.5, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.4,
            'water.LIQUID_DAMPING': 0.958, 'water.LIQUID_OIL_DAMPING': 0.955,
            'water.LIQUID_WATER_MOTION_SCALE': 0.82,
            'water.LIQUID_BOUNCE_WATER': 0.0, 'water.LIQUID_BOUNCE_OIL': 0.0,
            'water.LIQUID_WALL_BOUNCE_IN': 0.0, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.0,
            'water.LIQUID_FLOOR_FRICTION': 1.0, 'water.LIQUID_WALL_FRICTION': 1.0
          }
        },
        'water-glass': {
          cat: 'water',
          desc: 'Clear glass water — near-invisible, ghostly ripple',
          values: {
            'water.LIQUID_WATER_R': 0.70, 'water.LIQUID_WATER_G': 0.88, 'water.LIQUID_WATER_B': 0.95,
            'water.LIQUID_WATER_ALPHA': 0.16,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.20, 'water.LIQUID_OIL_G': 0.20, 'water.LIQUID_OIL_B': 0.22,
            'water.LIQUID_OIL_ALPHA': 0.30,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.6, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.2,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 600,
            'water.LIQUID_PRESSURE_STIFF': 2.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.5,
            'water.LIQUID_DAMPING': 0.992, 'water.LIQUID_OIL_DAMPING': 0.97,
            'water.LIQUID_WATER_MOTION_SCALE': 0.97,
            'water.LIQUID_BOUNCE_WATER': 0.18, 'water.LIQUID_BOUNCE_OIL': 0.05,
            'water.LIQUID_WALL_BOUNCE_IN': 0.075, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.095,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.97
          }
        },
        'water-liquid-gold': {
          cat: 'water',
          desc: 'Liquid gold — rich molten amber, heavy and gleaming',
          values: {
            'water.LIQUID_WATER_R': 1.0, 'water.LIQUID_WATER_G': 0.78, 'water.LIQUID_WATER_B': 0.18,
            'water.LIQUID_WATER_ALPHA': 0.93,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 0.95, 'water.LIQUID_WATER_FOAM_B': 0.70,
            'water.LIQUID_OIL_R': 0.35, 'water.LIQUID_OIL_G': 0.24, 'water.LIQUID_OIL_B': 0.04,
            'water.LIQUID_OIL_ALPHA': 0.95,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.1, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 1380, 'water.LIQUID_OIL_GRAVITY': 980,
            'water.LIQUID_PRESSURE_STIFF': 3.4, 'water.LIQUID_OIL_PRESSURE_STIFF': 3.0,
            'water.LIQUID_DAMPING': 0.985, 'water.LIQUID_OIL_DAMPING': 0.965,
            'water.LIQUID_WATER_MOTION_SCALE': 0.95,
            'water.LIQUID_BOUNCE_WATER': 0.06, 'water.LIQUID_BOUNCE_OIL': 0.04,
            'water.LIQUID_WALL_BOUNCE_IN': 0.04, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.05,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.95
          }
        },
        'water-frost-slush': {
          cat: 'water',
          desc: 'Frost slush — half-frozen, sluggish, barely creeps',
          values: {
            'water.LIQUID_WATER_R': 0.80, 'water.LIQUID_WATER_G': 0.90, 'water.LIQUID_WATER_B': 0.97,
            'water.LIQUID_WATER_ALPHA': 0.78,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.55, 'water.LIQUID_OIL_G': 0.65, 'water.LIQUID_OIL_B': 0.72,
            'water.LIQUID_OIL_ALPHA': 0.85,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.2, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 1300, 'water.LIQUID_OIL_GRAVITY': 900,
            'water.LIQUID_PRESSURE_STIFF': 2.0, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.9,
            'water.LIQUID_DAMPING': 0.962, 'water.LIQUID_OIL_DAMPING': 0.958,
            'water.LIQUID_WATER_MOTION_SCALE': 0.81,
            'water.LIQUID_BOUNCE_WATER': 0.02, 'water.LIQUID_BOUNCE_OIL': 0.02,
            'water.LIQUID_WALL_BOUNCE_IN': 0.0, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.01,
            'water.LIQUID_FLOOR_FRICTION': 0.99, 'water.LIQUID_WALL_FRICTION': 1.0
          }
        },
        'water-cosmic': {
          cat: 'water',
          desc: 'Cosmic nebula — deep blue-purple, dreamy slow drift',
          values: {
            'water.LIQUID_WATER_R': 0.16, 'water.LIQUID_WATER_G': 0.10, 'water.LIQUID_WATER_B': 0.48,
            'water.LIQUID_WATER_ALPHA': 0.86,
            'water.LIQUID_WATER_FOAM_R': 0.70, 'water.LIQUID_WATER_FOAM_G': 0.65, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.05, 'water.LIQUID_OIL_G': 0.02, 'water.LIQUID_OIL_B': 0.16,
            'water.LIQUID_OIL_ALPHA': 0.95,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 470, 'water.LIQUID_OIL_GRAVITY': 310,
            'water.LIQUID_PRESSURE_STIFF': 2.5, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.2,
            'water.LIQUID_DAMPING': 0.998, 'water.LIQUID_OIL_DAMPING': 0.996,
            'water.LIQUID_WATER_MOTION_SCALE': 0.99,
            'water.LIQUID_BOUNCE_WATER': 0.16, 'water.LIQUID_BOUNCE_OIL': 0.09,
            'water.LIQUID_WALL_BOUNCE_IN': 0.10, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.12,
            'water.LIQUID_FLOOR_FRICTION': 0.94, 'water.LIQUID_WALL_FRICTION': 0.97
          }
        },
        'water-neon-coolant': {
          cat: 'water',
          desc: 'Neon coolant — electric cyan, lively and springy',
          values: {
            'water.LIQUID_WATER_R': 0.0, 'water.LIQUID_WATER_G': 0.95, 'water.LIQUID_WATER_B': 1.0,
            'water.LIQUID_WATER_ALPHA': 0.82,
            'water.LIQUID_WATER_FOAM_R': 0.75, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.0, 'water.LIQUID_OIL_G': 0.55, 'water.LIQUID_OIL_B': 0.70,
            'water.LIQUID_OIL_ALPHA': 0.88,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 1100, 'water.LIQUID_OIL_GRAVITY': 700,
            'water.LIQUID_PRESSURE_STIFF': 5.0, 'water.LIQUID_OIL_PRESSURE_STIFF': 4.5,
            'water.LIQUID_DAMPING': 0.998, 'water.LIQUID_OIL_DAMPING': 0.99,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.30, 'water.LIQUID_BOUNCE_OIL': 0.18,
            'water.LIQUID_WALL_BOUNCE_IN': 0.20, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.22,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.94
          }
        },
        'water-acid': {
          cat: 'water',
          desc: 'Caustic acid — yellow-green, hisses and froths',
          values: {
            'water.LIQUID_WATER_R': 0.82, 'water.LIQUID_WATER_G': 0.95, 'water.LIQUID_WATER_B': 0.10,
            'water.LIQUID_WATER_ALPHA': 0.80,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 0.55,
            'water.LIQUID_OIL_R': 0.22, 'water.LIQUID_OIL_G': 0.26, 'water.LIQUID_OIL_B': 0.0,
            'water.LIQUID_OIL_ALPHA': 0.92,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.6,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 600,
            'water.LIQUID_PRESSURE_STIFF': 2.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.5,
            'water.LIQUID_DAMPING': 0.992, 'water.LIQUID_OIL_DAMPING': 0.97,
            'water.LIQUID_WATER_MOTION_SCALE': 0.97,
            'water.LIQUID_BOUNCE_WATER': 0.18, 'water.LIQUID_BOUNCE_OIL': 0.05,
            'water.LIQUID_WALL_BOUNCE_IN': 0.075, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.095,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.97,
            'water.LIQUID_AERATION_BLUR': 0.09, 'water.LIQUID_AERATION_DAMP': 0.96,
            'water.LIQUID_AERATION_THRESHOLD': 0.88, 'water.LIQUID_AERATION_COEFF': 28
          }
        },
        'water-milk': {
          cat: 'water',
          desc: 'Creamy milk — soft opaque white pour',
          values: {
            'water.LIQUID_WATER_R': 0.97, 'water.LIQUID_WATER_G': 0.96, 'water.LIQUID_WATER_B': 0.92,
            'water.LIQUID_WATER_ALPHA': 0.97,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.55, 'water.LIQUID_OIL_G': 0.48, 'water.LIQUID_OIL_B': 0.36,
            'water.LIQUID_OIL_ALPHA': 0.95,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.2, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.7,
            'water.LIQUID_GRAVITY': 1000, 'water.LIQUID_OIL_GRAVITY': 600,
            'water.LIQUID_PRESSURE_STIFF': 2.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 2.5,
            'water.LIQUID_DAMPING': 0.992, 'water.LIQUID_OIL_DAMPING': 0.97,
            'water.LIQUID_WATER_MOTION_SCALE': 0.97,
            'water.LIQUID_BOUNCE_WATER': 0.18, 'water.LIQUID_BOUNCE_OIL': 0.05,
            'water.LIQUID_WALL_BOUNCE_IN': 0.075, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.095,
            'water.LIQUID_FLOOR_FRICTION': 0.92, 'water.LIQUID_WALL_FRICTION': 0.97
          }
        },
        'water-sludge': {
          cat: 'water',
          desc: 'Swamp sludge — murky, heavy, stagnant ooze',
          values: {
            'water.LIQUID_WATER_R': 0.28, 'water.LIQUID_WATER_G': 0.30, 'water.LIQUID_WATER_B': 0.12,
            'water.LIQUID_WATER_ALPHA': 0.96,
            'water.LIQUID_WATER_FOAM_R': 0.45, 'water.LIQUID_WATER_FOAM_G': 0.42, 'water.LIQUID_WATER_FOAM_B': 0.25,
            'water.LIQUID_OIL_R': 0.10, 'water.LIQUID_OIL_G': 0.10, 'water.LIQUID_OIL_B': 0.04,
            'water.LIQUID_OIL_ALPHA': 0.97,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.4, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.9,
            'water.LIQUID_GRAVITY': 1320, 'water.LIQUID_OIL_GRAVITY': 1050,
            'water.LIQUID_PRESSURE_STIFF': 1.5, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.4,
            'water.LIQUID_DAMPING': 0.958, 'water.LIQUID_OIL_DAMPING': 0.955,
            'water.LIQUID_WATER_MOTION_SCALE': 0.82,
            'water.LIQUID_BOUNCE_WATER': 0.0, 'water.LIQUID_BOUNCE_OIL': 0.0,
            'water.LIQUID_WALL_BOUNCE_IN': 0.0, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.0,
            'water.LIQUID_FLOOR_FRICTION': 1.0, 'water.LIQUID_WALL_FRICTION': 1.0
          }
        },
        'water-electric': {
          cat: 'water',
          desc: 'Live current — crackling blue, jittery and violent',
          values: {
            'water.LIQUID_WATER_R': 0.45, 'water.LIQUID_WATER_G': 0.80, 'water.LIQUID_WATER_B': 1.0,
            'water.LIQUID_WATER_ALPHA': 0.84,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.20, 'water.LIQUID_OIL_G': 0.45, 'water.LIQUID_OIL_B': 0.95,
            'water.LIQUID_OIL_ALPHA': 0.88,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.0, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.5,
            'water.LIQUID_GRAVITY': 920, 'water.LIQUID_OIL_GRAVITY': 640,
            'water.LIQUID_PRESSURE_STIFF': 5.6, 'water.LIQUID_OIL_PRESSURE_STIFF': 5.0,
            'water.LIQUID_DAMPING': 0.999, 'water.LIQUID_OIL_DAMPING': 0.994,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.55, 'water.LIQUID_BOUNCE_OIL': 0.40,
            'water.LIQUID_WALL_BOUNCE_IN': 0.38, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.40,
            'water.LIQUID_FLOOR_FRICTION': 0.85, 'water.LIQUID_WALL_FRICTION': 0.86
          }
        },
        'water-stardust': {
          cat: 'water',
          desc: 'Stardust — violet motes hanging weightless',
          values: {
            'water.LIQUID_WATER_R': 0.45, 'water.LIQUID_WATER_G': 0.30, 'water.LIQUID_WATER_B': 0.85,
            'water.LIQUID_WATER_ALPHA': 0.55,
            'water.LIQUID_WATER_FOAM_R': 1.0, 'water.LIQUID_WATER_FOAM_G': 1.0, 'water.LIQUID_WATER_FOAM_B': 1.0,
            'water.LIQUID_OIL_R': 0.20, 'water.LIQUID_OIL_G': 0.10, 'water.LIQUID_OIL_B': 0.40,
            'water.LIQUID_OIL_ALPHA': 0.55,
            'water.LIQUID_WATER_PARTICLE_SIZE': 1.8, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.4,
            'water.LIQUID_GRAVITY': 400, 'water.LIQUID_OIL_GRAVITY': 250,
            'water.LIQUID_PRESSURE_STIFF': 1.9, 'water.LIQUID_OIL_PRESSURE_STIFF': 1.8,
            'water.LIQUID_DAMPING': 1.0, 'water.LIQUID_OIL_DAMPING': 1.0,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.12, 'water.LIQUID_BOUNCE_OIL': 0.06,
            'water.LIQUID_WALL_BOUNCE_IN': 0.06, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.08,
            'water.LIQUID_FLOOR_FRICTION': 0.96, 'water.LIQUID_WALL_FRICTION': 0.99
          }
        },
        'water-rubber': {
          cat: 'water',
          desc: 'Liquid rubber — deep teal, elastic and bouncy',
          values: {
            'water.LIQUID_WATER_R': 0.05, 'water.LIQUID_WATER_G': 0.45, 'water.LIQUID_WATER_B': 0.42,
            'water.LIQUID_WATER_ALPHA': 0.95,
            'water.LIQUID_WATER_FOAM_R': 0.60, 'water.LIQUID_WATER_FOAM_G': 0.95, 'water.LIQUID_WATER_FOAM_B': 0.90,
            'water.LIQUID_OIL_R': 0.10, 'water.LIQUID_OIL_G': 0.30, 'water.LIQUID_OIL_B': 0.28,
            'water.LIQUID_OIL_ALPHA': 0.96,
            'water.LIQUID_WATER_PARTICLE_SIZE': 2.2, 'water.LIQUID_OIL_PARTICLE_SIZE': 2.8,
            'water.LIQUID_GRAVITY': 1100, 'water.LIQUID_OIL_GRAVITY': 700,
            'water.LIQUID_PRESSURE_STIFF': 5.0, 'water.LIQUID_OIL_PRESSURE_STIFF': 4.5,
            'water.LIQUID_DAMPING': 0.998, 'water.LIQUID_OIL_DAMPING': 0.99,
            'water.LIQUID_WATER_MOTION_SCALE': 1.0,
            'water.LIQUID_BOUNCE_WATER': 0.30, 'water.LIQUID_BOUNCE_OIL': 0.18,
            'water.LIQUID_WALL_BOUNCE_IN': 0.20, 'water.LIQUID_WALL_BOUNCE_EDGE': 0.22,
            'water.LIQUID_FLOOR_FRICTION': 0.90, 'water.LIQUID_WALL_FRICTION': 0.94
          }
        },

        // ===== Jello feel presets (cat:'jello') — a deliberately WIDE spread so the owner
        // can click through extremes and find the feel, then we narrow. Each is a COMPLETE
        // definition (every key feel lever set, no carryover) so switching is a clean A/B.
        // JELLO_E is listed BEFORE JELLO_XPBD_VOL_COMPLIANCE so the explicit squish value
        // wins over jelloRecomputeMaterial's E-derived default. Solver stays xpbd (1) except
        // the two reference presets and the FEM one. =====
        'jello-ref-pbd-slime': {
          cat: 'jello', desc: 'REFERENCE: the v1 PBD "perfect slime" (old solver)',
          values: {
            'jello.JELLO_SOLVER_ID': 0,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 10, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0001, 'jello.JELLO_XPBD_SHAPE': 0.09,
            'jello.JELLO_DAMPING': 0.998, 'jello.JELLO_INT_DAMP': 0, 'jello.JELLO_VMAX': 600, 'jello.JELLO_SLEEP_VSQ': 9, 'jello.JELLO_XPBD_SUBSTEPS': 5,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.18
          }
        },
        'jello-ref-xpbd-now': {
          cat: 'jello', desc: 'REFERENCE: current xpbd defaults (stiff + lively)',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 10, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0001, 'jello.JELLO_XPBD_SHAPE': 0.09,
            'jello.JELLO_DAMPING': 0.998, 'jello.JELLO_INT_DAMP': 0, 'jello.JELLO_VMAX': 600, 'jello.JELLO_SLEEP_VSQ': 9, 'jello.JELLO_XPBD_SUBSTEPS': 5,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.18
          }
        },
        'jello-rock-hard': {
          cat: 'jello', desc: 'Stiff rock — barely squishes, crisp cube',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 80, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0001, 'jello.JELLO_XPBD_SHAPE': 0.25,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 50, 'jello.JELLO_VMAX': 500, 'jello.JELLO_SLEEP_VSQ': 10, 'jello.JELLO_XPBD_SUBSTEPS': 8,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.2
          }
        },
        'jello-firm-rubber': {
          cat: 'jello', desc: 'Firm rubber — some give, holds shape well',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 30, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0004, 'jello.JELLO_XPBD_SHAPE': 0.15,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 30, 'jello.JELLO_VMAX': 450, 'jello.JELLO_SLEEP_VSQ': 12, 'jello.JELLO_XPBD_SUBSTEPS': 8,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.2
          }
        },
        'jello-soft-give': {
          cat: 'jello', desc: 'Soft — lots of squish, gentle spring-back',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 4, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.002, 'jello.JELLO_XPBD_SHAPE': 0.1,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 30, 'jello.JELLO_VMAX': 350, 'jello.JELLO_SLEEP_VSQ': 15, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.15
          }
        },
        'jello-super-soft': {
          cat: 'jello', desc: 'Super soft — wobbly jello, squashes a lot',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 2, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0035, 'jello.JELLO_XPBD_SHAPE': 0.08,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 40, 'jello.JELLO_VMAX': 300, 'jello.JELLO_SLEEP_VSQ': 15, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.1
          }
        },
        'jello-dead-calm': {
          cat: 'jello', desc: 'Dead calm — settles instantly, barely moves',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 6, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0015, 'jello.JELLO_XPBD_SHAPE': 0.12,
            'jello.JELLO_DAMPING': 0.95, 'jello.JELLO_INT_DAMP': 90, 'jello.JELLO_VMAX': 200, 'jello.JELLO_SLEEP_VSQ': 30, 'jello.JELLO_XPBD_SUBSTEPS': 12,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.0
          }
        },
        'jello-lively-jiggly': {
          cat: 'jello', desc: 'Lively — jiggly, energetic, slow to settle',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 10, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.001, 'jello.JELLO_XPBD_SHAPE': 0.1,
            'jello.JELLO_DAMPING': 0.998, 'jello.JELLO_INT_DAMP': 10, 'jello.JELLO_VMAX': 900, 'jello.JELLO_SLEEP_VSQ': 9, 'jello.JELLO_XPBD_SUBSTEPS': 6,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.35
          }
        },
        'jello-floppy-blob': {
          cat: 'jello', desc: 'Floppy blob — almost no shape memory (slumps)',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 5, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.002, 'jello.JELLO_XPBD_SHAPE': 0.02,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 25, 'jello.JELLO_VMAX': 350, 'jello.JELLO_SLEEP_VSQ': 15, 'jello.JELLO_XPBD_SUBSTEPS': 8,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.1
          }
        },
        'jello-crisp-cube': {
          cat: 'jello', desc: 'Crisp cube — strong shape memory, holds square',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 20, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0003, 'jello.JELLO_XPBD_SHAPE': 0.35,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 50, 'jello.JELLO_VMAX': 500, 'jello.JELLO_SLEEP_VSQ': 12, 'jello.JELLO_XPBD_SUBSTEPS': 12,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.2
          }
        },
        'jello-water-balloon': {
          cat: 'jello', desc: 'Water balloon — sloshy, heavy, low shape memory',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 2, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.003, 'jello.JELLO_XPBD_SHAPE': 0.05,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 20, 'jello.JELLO_VMAX': 300, 'jello.JELLO_SLEEP_VSQ': 12, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.1, 'jello.JELLO_GRAVITY': 700, 'jello.JELLO_BOUNCE': 0.1
          }
        },
        'jello-memory-foam': {
          cat: 'jello', desc: 'Memory foam — deforms and HOLDS the dent, settles dead (v22: plasticity + viscosity)',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 6, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0025, 'jello.JELLO_XPBD_SHAPE': 0.12,
            'jello.JELLO_XSPH': 0.35, 'jello.JELLO_PLASTICITY': 0.12, 'jello.JELLO_YIELD': 0.12, 'jello.JELLO_HARDEN': 0.05,
            'jello.JELLO_CONTACT_DAMP': 1.0, 'jello.JELLO_CONTACT_FRICTION': 0.8, 'jello.JELLO_CONTACT_SELF': 1,
            'jello.JELLO_DAMPING': 0.95, 'jello.JELLO_INT_DAMP': 65, 'jello.JELLO_VMAX': 300, 'jello.JELLO_SLEEP_VSQ': 20, 'jello.JELLO_XPBD_SUBSTEPS': 8,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.0
          }
        },
        'jello-bouncy-ball': {
          cat: 'jello', desc: 'Bouncy ball — stiff + super bouncy + lively',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 45, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0003, 'jello.JELLO_XPBD_SHAPE': 0.2,
            'jello.JELLO_DAMPING': 0.998, 'jello.JELLO_INT_DAMP': 8, 'jello.JELLO_VMAX': 1000, 'jello.JELLO_SLEEP_VSQ': 4, 'jello.JELLO_XPBD_SUBSTEPS': 8,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.6
          }
        },
        'jello-oozy-goo': {
          cat: 'jello', desc: 'Oozy goo — slime, oozes + spreads, almost no spring-back (v22: high viscosity)',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 2, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.004, 'jello.JELLO_XPBD_SHAPE': 0.03,
            'jello.JELLO_XSPH': 0.6, 'jello.JELLO_PLASTICITY': 0.05, 'jello.JELLO_YIELD': 0.1, 'jello.JELLO_HARDEN': 0.02,
            'jello.JELLO_CONTACT_DAMP': 1.0, 'jello.JELLO_CONTACT_FRICTION': 0.5, 'jello.JELLO_CONTACT_SELF': 1,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 65, 'jello.JELLO_VMAX': 300, 'jello.JELLO_SLEEP_VSQ': 18, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 0.95, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.05
          }
        },
        'jello-puffy-balloon': {
          cat: 'jello', desc: 'Puffy — over-inflated, rounds out, pushes apart',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 6, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.001, 'jello.JELLO_XPBD_SHAPE': 0.1,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 20, 'jello.JELLO_VMAX': 400, 'jello.JELLO_SLEEP_VSQ': 12, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.3, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.2
          }
        },
        'jello-heavy-dense': {
          cat: 'jello', desc: 'Heavy + dense — sinks, sluggish, weighty',
          values: {
            'jello.JELLO_SOLVER_ID': 1,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 15, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.0008, 'jello.JELLO_XPBD_SHAPE': 0.12,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 50, 'jello.JELLO_VMAX': 350, 'jello.JELLO_SLEEP_VSQ': 15, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 950, 'jello.JELLO_BOUNCE': 0.1
          }
        },
        'jello-fem-neohookean': {
          cat: 'jello', desc: 'FEM solver — Neo-Hookean, try the third solver',
          values: {
            'jello.JELLO_SOLVER_ID': 2,
            'jello.JELLO_XSPH': 0, 'jello.JELLO_PLASTICITY': 0,
            'jello.JELLO_E': 15, 'jello.JELLO_XPBD_VOL_COMPLIANCE': 0.001, 'jello.JELLO_XPBD_SHAPE': 0.1,
            'jello.JELLO_DAMPING': 0.99, 'jello.JELLO_INT_DAMP': 30, 'jello.JELLO_VMAX': 400, 'jello.JELLO_SLEEP_VSQ': 12, 'jello.JELLO_XPBD_SUBSTEPS': 10,
            'jello.JELLO_INFLATE': 1.0, 'jello.JELLO_GRAVITY': 540, 'jello.JELLO_BOUNCE': 0.15
          }
        }

      };

      // ----- Device auto-detection -----
      // Heuristic device-tier guess from browser-exposed signals. Returns one
      // of the six 'device' preset names. Thresholds (deliberately cautious —
      // browsers under-report, so we lean conservative):
      //   * Mobile (isMobile) is capped at 'medium' regardless of other
      //     signals — phone GPUs need the headroom. A weak phone drops to
      //     'low'. (No 'potato' on mobile: the mobile-side levers in 'low'
      //     are already aggressive.)
      //   * Desktop uses navigator.deviceMemory (GB) and hardwareConcurrency
      //     (logical cores) as the primary axes, then nudges by screen-pixel
      //     count × devicePixelRatio (a huge hi-DPI canvas is a real cost).
      //   * deviceMemory is missing in Firefox/Safari — when absent we fall
      //     back to core count alone and assume mid-range.
      // This only SUGGESTS a tier. Applying it is opt-in (GM_AUTO_TIER or
      // gm.autoTier()).
      function gmDetectTier() {
        try {
          var mem = (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number')
            ? navigator.deviceMemory : 0;            // GB, 0 = unknown
          var cores = (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number')
            ? navigator.hardwareConcurrency : 0;      // logical cores, 0 = unknown
          var dpr = (typeof window !== 'undefined' && window.devicePixelRatio)
            ? window.devicePixelRatio : 1;
          var sw = (typeof window !== 'undefined' && window.screen && window.screen.width)
            ? window.screen.width : 1280;
          var sh = (typeof window !== 'undefined' && window.screen && window.screen.height)
            ? window.screen.height : 720;
          // Effective backing-store pixels the device would like to drive.
          var screenPix = sw * sh * dpr * dpr;

          // ----- Mobile branch — capped at 'medium' -----
          if (typeof isMobile !== 'undefined' && isMobile) {
            // Weak phone: little RAM, few cores → 'low'. Otherwise 'medium'.
            if ((mem && mem <= 3) || (cores && cores <= 4)) return 'low';
            return 'medium';
          }

          // ----- Desktop branch -----
          // Score: start mid, move on memory + cores.
          var score = 3; // 1=potato 2=low 3=medium 4=high 5=ultra 6=extreme
          if (mem) {
            if (mem <= 2) score = 1;
            else if (mem <= 4) score = 2;
            else if (mem <= 6) score = 3;
            else if (mem <= 8) score = 4;
            else if (mem <= 16) score = 5;
            else score = 6;
          }
          if (cores) {
            var cScore;
            if (cores <= 2) cScore = 1;
            else if (cores <= 4) cScore = 2;
            else if (cores <= 6) cScore = 3;
            else if (cores <= 8) cScore = 4;
            else if (cores <= 12) cScore = 5;
            else cScore = 6;
            // Average the two axes when both are known; else take the core
            // axis (memory absent in FF/Safari).
            score = mem ? Math.round((score + cScore) / 2) : cScore;
          }
          // A very large hi-DPI desktop canvas is expensive — pull the tier
          // down one notch if the device wants to drive >8 MP.
          if (screenPix > 8000000 && score > 1) score -= 1;
          // A small low-DPI display is cheap — allow one notch up.
          else if (screenPix < 2500000 && score < 6) score += 1;

          var names = ['potato', 'low', 'medium', 'high', 'ultra', 'extreme'];
          var idx = Math.max(0, Math.min(5, score - 1));
          return names[idx];
        } catch (e) {
          try { console.warn('gm: detectTier failed:', e); } catch (_) {}
          return 'high'; // safe shipping default
        }
      }

      // ----- localStorage: custom presets -----
      // Load any user-saved presets back into GM_PRESETS. Stored as a JSON
      // map { name: { desc, values } } under GM_PRESETS_CUSTOM_KEY; cat is
      // forced to 'custom' on load.
      function gmLoadCustomPresets() {
        try {
          if (typeof localStorage === 'undefined') return;
          var raw = localStorage.getItem(GM_PRESETS_CUSTOM_KEY);
          if (!raw) return;
          var obj = JSON.parse(raw);
          if (!obj || typeof obj !== 'object') return;
          Object.keys(obj).forEach(function (name) {
            var p = obj[name];
            if (!p || typeof p !== 'object' || !p.values) return;
            GM_PRESETS[name] = {
              cat: 'custom',
              desc: (typeof p.desc === 'string') ? p.desc : 'Saved preset',
              values: p.values
            };
          });
        } catch (e) {
          try { console.warn('gm: loading custom presets failed:', e); } catch (_) {}
        }
      }

      // Persist every cat:'custom' preset back to localStorage.
      function gmPersistCustomPresets() {
        try {
          if (typeof localStorage === 'undefined') return;
          var out = {};
          Object.keys(GM_PRESETS).forEach(function (name) {
            var p = GM_PRESETS[name];
            if (p && p.cat === 'custom') {
              out[name] = { desc: p.desc, values: p.values };
            }
          });
          localStorage.setItem(GM_PRESETS_CUSTOM_KEY, JSON.stringify(out));
        } catch (e) {
          try { console.warn('gm: persisting custom presets failed:', e); } catch (_) {}
        }
      }

      // Pull in saved presets before the facade is extended.
      gmLoadCustomPresets();

      // ----- Extend window.gm with the preset API -----
      // window.gm is built in the Phase-2 facade block above; it only fails
      // to exist if that block threw. Guard so this section is independent.
      if (window.gm) {
        var gmRef = window.gm;
        gmRef.presets = GM_PRESETS;
        gmRef.activePreset = null;   // last preset applied — drives the panel highlight

        // Apply a preset by name. Unknown name → warn, no-op. After applying
        // the bag we refresh the tuning panel so its controls reflect the
        // new values.
        gmRef.preset = function (name) {
          try {
            var p = GM_PRESETS[name];
            if (!p) {
              console.warn('gm: unknown preset "' + name + '". Try gm.presetList().');
              return;
            }
            gmRef.apply(p.values);
            gmRef.activePreset = name;
            if (window.gmPanelSync) { try { gmPanelSync(); } catch (_) {} }
            console.log('gm: applied preset "' + name + '" (' + p.cat + ') — ' + p.desc);
            return name;
          } catch (e) {
            try { console.warn('gm: preset "' + name + '" failed:', e); } catch (_) {}
          }
        };

        // List preset names, optionally filtered to one category. Logs a
        // readable block and returns the name array.
        gmRef.presetList = function (cat) {
          var names = [];
          try {
            Object.keys(GM_PRESETS).forEach(function (name) {
              if (cat && GM_PRESETS[name].cat !== cat) return;
              names.push(name);
            });
            names.sort();
            var lines = names.map(function (n) {
              var p = GM_PRESETS[n];
              return '  [' + p.cat + '] ' + n + ' — ' + p.desc;
            });
            console.log(
              'gm presets' + (cat ? ' (' + cat + ')' : '') + ':\n' +
              (lines.join('\n') || '  (none)')
            );
          } catch (e) {
            try { console.warn('gm: presetList failed:', e); } catch (_) {}
          }
          return names;
        };

        // Capture the current gm.diff() as a named custom preset. Stores it
        // in GM_PRESETS (cat:'custom') and persists to localStorage so it
        // survives a reload.
        gmRef.save = function (name) {
          try {
            name = (name == null) ? '' : String(name).trim();
            if (!name) { console.warn('gm: save needs a preset name'); return; }
            var diff = {};
            try { diff = gmRef.diff() || {}; } catch (_) {}
            if (!Object.keys(diff).length) {
              console.warn('gm: nothing changed from defaults — preset "' + name + '" not saved');
              return;
            }
            GM_PRESETS[name] = {
              cat: 'custom',
              desc: 'Saved ' + new Date().toLocaleString(),
              values: diff
            };
            gmPersistCustomPresets();
            gmRef.activePreset = name;
            if (window.gmPanelSync) { try { gmPanelSync(); } catch (_) {} }
            console.log('gm: saved custom preset "' + name + '" (' +
              Object.keys(diff).length + ' levers)');
            return name;
          } catch (e) {
            try { console.warn('gm: save "' + name + '" failed:', e); } catch (_) {}
          }
        };

        // Delete a custom preset (memory + localStorage). Refuses to delete
        // built-in presets.
        gmRef.delPreset = function (name) {
          try {
            var p = GM_PRESETS[name];
            if (!p) { console.warn('gm: unknown preset "' + name + '"'); return; }
            if (p.cat !== 'custom') {
              console.warn('gm: "' + name + '" is a built-in preset — cannot delete');
              return;
            }
            delete GM_PRESETS[name];
            gmPersistCustomPresets();
            console.log('gm: deleted custom preset "' + name + '"');
            return name;
          } catch (e) {
            try { console.warn('gm: delPreset "' + name + '" failed:', e); } catch (_) {}
          }
        };

        // Device-tier helpers.
        gmRef.detectTier = gmDetectTier;
        gmRef.autoTier = function () {
          try {
            var tier = gmDetectTier();
            console.log('gm: auto-tier detected "' + tier + '"');
            return gmRef.preset(tier);
          } catch (e) {
            try { console.warn('gm: autoTier failed:', e); } catch (_) {}
          }
        };
      }

      // ----- Boot: report detected tier, optionally apply it -----
      try {
        var gmBootTier = gmDetectTier();
        if (GM_AUTO_TIER && window.gm && window.gm.preset) {
          // Opt-in: match the auto-detected device tier instead of the default.
          console.log('gm: GM_AUTO_TIER on (applying device tier "' + gmBootTier + '")');
          window.gm.preset(gmBootTier);
        } else if (window.gm && window.gm.preset) {
          // Default look (owner request): ship the EXTREME graphics preset on
          // DESKTOP for maximum fidelity. v25.10 — but NOT on mobile. 'extreme'
          // sets RENDER_SCALE_MOBILE 0.85 + a 6 MP budget + 4x terrain chunks +
          // full-res smoke; on a phone that is a ~1.85 MP main canvas stacked with
          // the uiTop + liquid canvases and a large terrain cache. A fast phone
          // chip (e.g. iPhone Air) renders it at 60fps, but the GPU-memory footprint
          // pushes iOS Safari past its per-tab limit and the tab CRASHES, while a
          // weaker phone just runs heavy (the 20fps Android). Ship the memory-sane
          // 'high' tier on mobile — which equals the in-code defaults (0.55 scale,
          // 3 MP budget, 3x terrain, 0.6 smoke). The L panel or ?gmpreset=NAME
          // (below, which wins) can still switch any device any time.
          var gmBootPreset = (typeof isMobile !== 'undefined' && isMobile) ? 'high' : 'extreme';
          console.log('gm: applying default graphics preset "' + gmBootPreset + '" (detected device tier "' + gmBootTier + '")');
          window.gm.preset(gmBootPreset);
        }
      } catch (e) {
        try { console.warn('gm: boot tier detection failed:', e); } catch (_) {}
      }

      // v14.22 — ?gmpreset=NAME in the URL applies a preset at boot. Done
      // here (right after the auto-tier block) so an explicit preset wins
      // over GM_AUTO_TIER when both are given. gm.preset() warns on an
      // unknown name; the whole thing is guarded so a junk query can't
      // break boot.
      try {
        if (window.location && window.gm && window.gm.preset) {
          var _gmpM = window.location.search.match(/[?&]gmpreset=([^&]+)/i);
          if (_gmpM) {
            var _gmpName = decodeURIComponent(_gmpM[1]);
            console.log('gm: ?gmpreset=' + _gmpName + ' — applying from URL');
            window.gm.preset(_gmpName);
          }
        }
      } catch (e) {
        try { console.warn('gm: ?gmpreset boot apply failed:', e); } catch (_) {}
      }

      // Expose for the panel's presets section (built in gmPanelBuild).
      window.GM_PRESETS = GM_PRESETS;
    } catch (gmPresetErr) {
      try { console.warn('gm: preset system failed to initialise:', gmPresetErr); } catch (_) {}
    }

    // v14.22 — ?dev=1 / ?dev=true: run dev mode on through setDevMode() so
    // the localStorage persist + panel sync fire the same as the backtick
    // key. The early URL parser already flipped `devMode`; this just routes
    // it through the normal entry point (and creates the mobile TUNE button).
    try {
      if (window.location &&
          /[?&]dev=(1(?!\d)|true)/i.test(window.location.search)) {
        setDevMode(true);
      }
    } catch (e) {
      try { console.warn('gm: ?dev boot apply failed:', e); } catch (_) {}
    }

    // Persistent save (047-save.js): read the newest valid slot BEFORE init
    // (synchronous localStorage), run the normal fresh init, then overlay the
    // saved world + profile. If the overlay throws, re-init so a corrupt save
    // can never strand the player on a half-applied world.
    var __saveEnv = null;
    try { __saveEnv = saveLoadEnvelope(); } catch (e) {
      try { console.warn('save: load failed, starting fresh:', e); } catch (_) {}
    }
    init();
    if (__saveEnv) {
      try {
        saveApply(__saveEnv);
        console.log('save: resumed (slot n=' + (__saveEnv.n || 0) + ', $' + money + ', depth record ' + depthRecord + 'm)');
      } catch (e) {
        try { console.error('save: apply failed, starting fresh:', e); } catch (_) {}
        init();
      }
    }
    syncFireplacePresetPanel();
    track('game_started');
    gameRafId = requestAnimationFrame(function (t) { lastTime = t; loop(t); });
  } catch (e) {
    window.__bootErr = String(e) + '\n' + (e.stack || '');
    try { console.error('GM boot threw:', e); } catch (_) {}
  }
