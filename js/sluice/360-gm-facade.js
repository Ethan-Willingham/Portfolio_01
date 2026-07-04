    // ====== GM TUNING FACADE (window.gm) ======
    // Phase 2 of the tuning system. Exposes a `window.gm` console facade so the
    // owner can live-tune the game from the browser console, e.g.
    //   gm.set('smoke.sim_curl', 38)   gm.list('rocket')   gm.diff()
    // It builds a registry (GM_LEVERS) keyed by 'group.name'; each entry carries
    // get/set accessors, min/max/step bounds, the default value, and a `live`
    // flag. This registry is the foundation for a later in-game slider panel
    // and a preset system — keep its shape clean. The whole build is wrapped in
    // a try/catch so a registration failure can never break the game boot.
    //
    // The LIQUID_* water LOOK vars (colour / opacity / particle size) ARE
    // registered here as the 'water' group (v14.25) — live via the WebGPU
    // RenderParams uniform. The water-SIM constants stay unregistered: they
    // are baked into the WebGPU compute shaders at module load (rebuild-only)
    // — see TUNING.md §2.
    try {
      // The lever registry. Keyed 'group.name'. Each entry:
      //   { group, label, get(), set(v), min, max, step, def, live }
      var GM_LEVERS = {};

      // Auto-register every number/boolean field on an object as a lever.
      // `ranges` is an optional { key: {min,max,step} } table; absent keys fall
      // back to sensible bounds. The forEach closure binds `key` per entry.
      function gmRegisterObject(prefix, group, obj, ranges) {
        if (!obj) return;
        ranges = ranges || {};
        Object.keys(obj).forEach(function (key) {
          var val = obj[key];
          var isBool = (typeof val === 'boolean');
          if (typeof val !== 'number' && !isBool) return;
          var r = ranges[key] || {};
          var mn, mx, st;
          if (typeof r.min === 'number') mn = r.min;
          else mn = 0;
          if (typeof r.max === 'number') mx = r.max;
          else mx = isBool ? 1 : Math.max(1, (typeof val === 'number' ? val : 0) * 3);
          if (typeof r.step === 'number') st = r.step;
          else st = isBool ? 1 : undefined;
          GM_LEVERS[prefix + '.' + key] = {
            group: group,
            label: key,
            get: function () { return obj[key]; },
            set: function (v) { obj[key] = v; },
            min: mn,
            max: mx,
            step: st,
            def: val,
            live: true
          };
        });
      }

      // Register a single standalone lever with custom get/set (side-effects).
      function gmRegisterLever(path, group, label, getFn, setFn, mn, mx, st) {
        GM_LEVERS[path] = {
          group: group,
          label: label,
          get: getFn,
          set: setFn,
          min: mn,
          max: mx,
          step: st,
          def: getFn(),
          live: true
        };
      }

      // ----- Auto-registered objects -----
      // smokeTune — ranges from TUNING.md §1.1.
      gmRegisterObject('smoke', 'smoke', smokeTune, {
        enabled:                  { min: 0, max: 1, step: 1 },
        diesel_enabled:           { min: 0, max: 1, step: 1 },
        thruster_enabled:         { min: 0, max: 1, step: 1 },
        world_lock:               { min: 0, max: 1, step: 1 },
        diesel_rate_active:       { min: 0, max: 0.2 },
        diesel_rate_moving:       { min: 0, max: 0.2 },
        diesel_rate_idle:         { min: 0, max: 0.1 },
        diesel_rad_active:        { min: 0, max: 0.5 },
        diesel_rad_moving:        { min: 0, max: 0.5 },
        diesel_rad_idle:          { min: 0, max: 0.5 },
        diesel_velY_active:       { min: 0, max: 8 },
        diesel_velY_idle:         { min: 0, max: 4 },
        diesel_shed_amp:          { min: 0, max: 4 },
        diesel_shed_freq:         { min: 0, max: 30 },
        diesel_dir_force:         { min: 0, max: 4 },
        diesel_vx_coupling:       { min: 0, max: 0.2 },
        diesel_motion_scale:      { min: 0.02, max: 2 },
        diesel_rise_cap:          { min: 0.1, max: 999 },
        diesel_color_r:           { min: 0, max: 0.3 },
        diesel_color_g:           { min: 0, max: 0.3 },
        diesel_color_b:           { min: 0, max: 0.3 },
        diesel_color_jitter:      { min: 0, max: 0.05 },
        diesel_source_lift:       { min: 0, max: 15 },
        diesel_source_radius:     { min: 0.001, max: 0.05 },
        diesel_bloom_lift:        { min: 0, max: 15 },
        diesel_bloom_radius:      { min: 0.002, max: 0.1 },
        diesel_bloom_amount:      { min: 0, max: 1.5 },
        wind_x:                   { min: -1, max: 1 },
        wind_y:                   { min: 0, max: 8 },
        pulse_rate:               { min: 0, max: 4 },
        pulse_depth:              { min: 0, max: 1 },
        buoyancy_strength:        { min: 0, max: 2 },
        buoyancy_radius:          { min: 0.02, max: 0.3 },
        sim_time_scale:           { min: 0.02, max: 2 },
        sim_density_dissipation:  { min: 0.1, max: 3 },
        sim_velocity_dissipation: { min: 0, max: 1 },
        sim_curl:                 { min: 0, max: 50 },
        sim_pressure:             { min: 0, max: 0.99 },
        sim_pressure_iters:       { min: 1, max: 30, step: 1 },
        sim_splat_radius:         { min: 0.05, max: 0.5 }
      });

      // flightTune — full-rotation flight feel levers. The in-game flight lab:
      // mode (0 today / 1 full rotation / 2 VTOL hover) plus turn / thrust /
      // gravity / drag. Press F in dev mode to cycle; the L-panel buttons
      // apply named presets. Mode 2's own levers are the 'vtol' group below.
      gmRegisterObject('flight', 'flight', flightTune, {
        mode:      { min: 0, max: 2, step: 1 },
        thrust:    { min: 0, max: 4000 },
        gravity:   { min: 0, max: 1500 },
        linDamp:   { min: 0, max: 6, step: 0.05 },
        turnAccel: { min: 0, max: 40, step: 0.5 },
        angDamp:   { min: 0, max: 15, step: 0.1 },
        maxOmega:  { min: 1, max: 20, step: 0.5 },
        maxSpeed:  { min: 0, max: 2000, step: 10 }
      });

      // flight2 — the above-ground AERO layer (v24.112): lift/AoA/stall +
      // ground-effect cushion + dive-earned soft cap + throttle-coupled turn +
      // transonic ladder. ENABLE 0 reverts to pure thrust+drag (flight1).
      gmRegisterObject('flight2', 'flight2', flight2, {
        ENABLE:           { min: 0, max: 1, step: 1 },
        CLA:              { min: 0, max: 10, step: 0.1 },
        STALL_A:          { min: 0.1, max: 0.8, step: 0.01 },
        STALL_BLEND:      { min: 1.05, max: 2.5, step: 0.05 },
        CLMAX:            { min: 0.3, max: 3, step: 0.05 },
        CD0:              { min: 0.01, max: 0.5, step: 0.005 },
        K_IND:            { min: 0, max: 1.5, step: 0.01 },
        AREA_K:           { min: 0.001, max: 0.05, step: 0.0005 },
        MIN_AERO_V:       { min: 20, max: 200, step: 5 },
        LINDAMP_MULT:     { min: 0, max: 1, step: 0.05 },
        BUFFET_A0:        { min: 0.4, max: 0.95, step: 0.05 },
        BUFFET_HI:        { min: 1.2, max: 4, step: 0.05 },
        TELEGRAPH_V:      { min: 60, max: 400, step: 5 },
        WV_TORQUE:        { min: 0, max: 15, step: 0.5 },
        WV_HI:            { min: 0.5, max: 2.5, step: 0.05 },
        TREMOR_AMP:       { min: 0, max: 2, step: 0.05 },
        TURN_THRUST_MULT: { min: 0.2, max: 1, step: 0.02 },
        TURN_OMEGA_MULT:  { min: 0.2, max: 1, step: 0.02 },
        TURN_EASE:        { min: 2, max: 30, step: 1 },
        SOFT_CAP:         { min: 200, max: 900, step: 10 },
        OVER_K:           { min: 5, max: 200, step: 5 },
        DIVE_OVER:        { min: 1, max: 2.2, step: 0.05 },
        OVER_GAIN:        { min: 0.05, max: 1, step: 0.01 },
        OVER_DECAY:       { min: 0.5, max: 8, step: 0.1 },
        FALL_CAP:         { min: 600, max: 1400, step: 20 },
        GE_SPAN:          { min: 32, max: 200, step: 4 },
        GE_LIFT:          { min: 0, max: 0.4, step: 0.01 },
        GE_DRAG:          { min: 0.2, max: 1, step: 0.05 },
        STIFF_V:          { min: 300, max: 900, step: 10 },
        STIFF_MIN:        { min: 0.3, max: 1, step: 0.02 },
        BOOM_V:           { min: 400, max: 1200, step: 5 },
        SPOOL_RISE:       { min: 3, max: 60, step: 1 },
        SPOOL_FALL:       { min: 5, max: 160, step: 1 },
        SPOOL_FLOOR:      { min: 0, max: 0.8, step: 0.05 }
      });

      // vtolTune — VTOL hover flight (mode 2, v24.145): direct strafe
      // authority + the legacy jet's vertical shape at sky grade. The L-panel
      // 'vtol' group carries one-click VTOL_PRESETS buttons (370).
      gmRegisterObject('vtol', 'vtol', vtolTune, {
        acc:        { min: 0, max: 3000, step: 10 },
        speed:      { min: 50, max: 900, step: 5 },
        fric:       { min: 0, max: 1200, step: 10 },
        revBoost:   { min: 1, max: 4, step: 0.05 },
        climbForce: { min: 0, max: 4000, step: 10 },
        climbTerm:  { min: -900, max: -50, step: 5 },
        gravity:    { min: 0, max: 1500, step: 5 },
        gravRelief: { min: 0, max: 0.9, step: 0.01 },
        overBleed:  { min: 0, max: 3, step: 0.05 },
        tilt:       { min: 0, max: 0.56, step: 0.01 }
      });

      // weatherTune — cloud + precip LOOK/feel (TUNING.md §5.4). The weather SIM
      // (coverage / precip / mood) is driven by the mood machine in 155-weather.js;
      // these are the look levers. The MOOD lever below force-locks a mood live.
      gmRegisterObject('weather', 'weather', weatherTune, {
        enabled:     { min: 0, max: 1, step: 1 },
        driftScale:  { min: 0, max: 4 },
        baseDrift:   { min: 0, max: 40 },
        precipRate:  { min: 0, max: 3 },
        precipSpeed: { min: 0.2, max: 3 },
        lightning:   { min: 0, max: 1, step: 1 },
        rimGlow:     { min: 0, max: 3 },
        highlight:   { min: 0, max: 2 },
        shadow:      { min: 0, max: 2 },
        contrast:    { min: 0.2, max: 2.5 },
        layerAlpha:  { min: 0, max: 1.5 },
        softness:    { min: 0.2, max: 3 },
        morphSpeed:  { min: 0, max: 1 },
        precipMode:  { min: 0, max: 2, step: 1 },
        deckDensity:  { min: 0, max: 1.5 },
        deckAltScale: { min: 0.6, max: 2.4 },
        deckThin:     { min: 0, max: 1.2 }
      });
      // MOOD: -1 auto (sim drives it) / 0..5 = clear, fair, cloudy, overcast, precip, storm.
      gmRegisterLever('weather.MOOD', 'weather', 'MOOD (-1 auto..5 storm)',
        function () { return weatherForce; },
        function (v) {
          weatherForce = Math.round(v);
          if (weatherForce >= 0) { weatherSetMood(weatherForce, false); weather.moodT = 9e9; }
        }, -1, 5, 1);

      // hazeTune — horizon aerial-perspective veil (158-horizon-atmos.js). Eases
      // in as the player climbs so the ground below the horizon dissolves into
      // atmosphere instead of a hard black edge. Colour tracks the live sky.
      gmRegisterObject('haze', 'haze', hazeTune, {
        enabled:  { min: 0, max: 1, step: 1 },
        startPad: { min: -0.2, max: 0.4 },
        maxA:     { min: 0, max: 1 },
        floorA:   { min: 0, max: 1 },
        feather:  { min: 0, max: 0.3 }
      });

      // limbTune — horizon limb (158-horizon-atmos.js, v24.132). Recomposites
      // the BELOW-line slice of the already-rendered sky over the ground as
      // the player climbs, so the land edge dissolves into the atmospheric
      // limb instead of hard-cutting at the sunset glow. band/fullAt size the
      // effect; shapePos/shapeA shape the downward fade. Alpha at the line is
      // always 1.0 by design (see the 158 invariants) — there is no maxA.
      gmRegisterObject('limb', 'haze', limbTune, {
        enabled:  { min: 0, max: 1, step: 1 },
        startPad: { min: -0.2, max: 0.4 },
        fullAt:   { min: 0.5, max: 1.05 },
        band:     { min: 0, max: 0.35 },
        shapePos: { min: 0.05, max: 0.95 },
        shapeA:   { min: 0, max: 1 }
      });

      // SKY_SUNSET_GRADE — the Volcanic twilight colour-grade (150-render-nightsky.js).
      // Dial the sunset drama by eye; sunset.drama = 0 turns the grade off entirely
      // (a clean A/B for "is the grade what's making that line?"). Live: the sky
      // cache key folds in these values (see renderSkyGL skyKey).
      gmRegisterObject('sunset', 'sunset', SKY_SUNSET_GRADE, {
        drama:    { min: 0, max: 2 },
        sat:      { min: 0, max: 2 },
        ozone:    { min: 0, max: 1 },
        multi:    { min: 0, max: 1 },
        gain:     { min: 0, max: 4 },
        floor:    { min: 0, max: 0.5 },
        contrast: { min: 0.5, max: 2 },
        radial:   { min: 0, max: 1 },
        twi:      { min: 0, max: 0.6 },
        twiShape: { min: 0.5, max: 6 }
      });

      // fireplaceTune — chimney smoke (TUNING.md §1.3). Explicit ranges: the
      // colour channels are tiny additive values, so the auto-fallback
      // (0..value*3 -> ~0..0.02) is technically fine but the sliders read
      // better with deliberate tight maxes.
      gmRegisterObject('fireplace', 'fireplace', fireplaceTune, {
        enabled:           { min: 0, max: 1, step: 1 },
        color_r:           { min: 0, max: 0.03 },
        color_g:           { min: 0, max: 0.03 },
        color_b:           { min: 0, max: 0.03 },
        color_jitter:      { min: 0, max: 0.005 },
        radius:            { min: 0.002, max: 0.1 },
        velY:              { min: 0, max: 4 },
        sway_amp:          { min: 0, max: 1 },
        sway_freq:         { min: 0, max: 3 },
        pulse_rate:        { min: 0, max: 4 },
        pulse_depth:       { min: 0, max: 1 },
        bloom_enabled:     { min: 0, max: 1, step: 1 },
        bloom_lift:        { min: 0, max: 20 },
        bloom_radius:      { min: 0.002, max: 0.15 },
        bloom_amount:      { min: 0, max: 1.5 },
        bloom_velY:        { min: 0, max: 3 },
        buoyancy_enabled:  { min: 0, max: 1, step: 1 },
        buoyancy_strength: { min: 0, max: 2 },
        buoyancy_radius:   { min: 0.01, max: 0.3 }
      });

      // rocketTune — jetpack plume (TUNING.md §6.1). Explicit ranges are
      // REQUIRED here: the auto-fallback (0 .. value*3) is wrong for this
      // object — the rate fields default to 0 (would cap at max 1) and the
      // HDR colour channels routinely exceed 1. These ranges keep both the
      // presets and the panel sliders sane.
      gmRegisterObject('rocket', 'rocket', rocketTune, {
        enabled:                { min: 0, max: 1, step: 1 },
        ramp_up:                { min: 0, max: 120 },
        ramp_down:              { min: 0, max: 120 },
        core_length:            { min: 0, max: 120 },
        core_length_min:        { min: 0, max: 120 },
        core_width:             { min: 0, max: 12 },
        core_width_taper:       { min: 0, max: 0.3 },
        core_jitter:            { min: 0, max: 10 },
        core_pulse_amp:         { min: 0, max: 1 },
        core_pulse_freq:        { min: 0, max: 80 },
        core_inner_r:           { min: 0, max: 3 },
        core_inner_g:           { min: 0, max: 3 },
        core_inner_b:           { min: 0, max: 3 },
        core_mid_r:             { min: 0, max: 3 },
        core_mid_g:             { min: 0, max: 3 },
        core_mid_b:             { min: 0, max: 3 },
        core_outer_r:           { min: 0, max: 3 },
        core_outer_g:           { min: 0, max: 3 },
        core_outer_b:           { min: 0, max: 3 },
        core_alpha:             { min: 0, max: 1 },
        shock_enabled:          { min: 0, max: 1, step: 1 },
        shock_count:            { min: 0, max: 16, step: 1 },
        shock_size:             { min: 0, max: 6 },
        shock_brightness:       { min: 0, max: 1 },
        shock_pulse_freq:       { min: 0, max: 150 },
        wash_enabled:           { min: 0, max: 1, step: 1 },
        wash_distance:          { min: 0, max: 400 },
        wash_rate:              { min: 0, max: 3000 },
        wash_speed:             { min: 0, max: 500 },
        wash_speed_jitter:      { min: 0, max: 1 },
        wash_lift:              { min: 0, max: 150 },
        wash_life:              { min: 0, max: 3 },
        wash_size:              { min: 0, max: 10 },
        wash_growth:            { min: 0, max: 40 },
        wash_drag:              { min: 0, max: 8 },
        wash_lobes:             { min: 1, max: 12, step: 1 },
        wash_lobe_spread:       { min: 0, max: 2 },
        wash_rot_speed:         { min: 0, max: 8 },
        wash_top_light:         { min: 0, max: 1 },
        wash_shadow:            { min: 0, max: 1 },
        wash_top_r:             { min: 0, max: 3 },
        wash_top_g:             { min: 0, max: 3 },
        wash_top_b:             { min: 0, max: 3 },
        wash_r:                 { min: 0, max: 3 },
        wash_g:                 { min: 0, max: 3 },
        wash_b:                 { min: 0, max: 3 },
        wash_alpha:             { min: 0, max: 1 },
        wash_streak_enabled:    { min: 0, max: 1, step: 1 },
        wash_streak_alpha:      { min: 0, max: 1 },
        wash_streak_length:     { min: 0, max: 0.5 },
        wash_impact_enabled:    { min: 0, max: 1, step: 1 },
        wash_impact_size:       { min: 0, max: 100 },
        wash_impact_alpha:      { min: 0, max: 1.5 },
        wash_impact_r:          { min: 0, max: 3 },
        wash_impact_g:          { min: 0, max: 3 },
        wash_impact_b:          { min: 0, max: 3 },
        wash_impact_pulse_freq: { min: 0, max: 60 },
        spark_rate:             { min: 0, max: 600 },
        spark_max:              { min: 0, max: 2000, step: 1 },
        spark_speed:            { min: 0, max: 2000 },
        spark_speed_jitter:     { min: 0, max: 1 },
        spark_spread:           { min: 0, max: 3.14 },
        spark_life:             { min: 0, max: 5 },
        spark_size:             { min: 0, max: 8 },
        spark_drag:             { min: 0, max: 10 },
        spark_gravity:          { min: -500, max: 1000 },
        spark_r:                { min: 0, max: 3 },
        spark_g:                { min: 0, max: 3 },
        spark_b:                { min: 0, max: 3 },
        spark_alpha:            { min: 0, max: 1.5 },
        wake_rate:              { min: 0, max: 400 },
        wake_max:               { min: 0, max: 500, step: 1 },
        wake_speed:             { min: 0, max: 200 },
        wake_spread:            { min: 0, max: 3.14 },
        wake_life:              { min: 0, max: 4 },
        wake_size:              { min: 0, max: 8 },
        wake_growth:            { min: 0, max: 3 },
        wake_drag:              { min: 0, max: 5 },
        wake_buoyancy:          { min: 0, max: 300 },
        wake_r:                 { min: 0, max: 3 },
        wake_g:                 { min: 0, max: 3 },
        wake_b:                 { min: 0, max: 3 },
        wake_alpha:             { min: 0, max: 1.5 }
      });

      // grassWindTune — the miner's jet exhaust laying the surface grass over.
      gmRegisterObject('grass', 'grass', grassWindTune, {
        enabled:  { min: 0, max: 1, step: 1 },
        reach:    { min: 1, max: 24 },
        radius:   { min: 0.5, max: 8 },
        bend:     { min: 0, max: 4 },
        fanOut:   { min: 0, max: 2 },
        downwind: { min: 0, max: 2 },
        flatten:  { min: 0, max: 1 }
      });

      // treesTune — surface trees (165): grove density, sway, rig gusts,
      // leaf wakes, canopy bird launches. density applies on the next
      // rebuild (window.__trees.rebuild() forces one).
      gmRegisterObject('trees', 'trees', treesTune, {
        enabled:    { min: 0, max: 1, step: 1 },
        density:    { min: 0, max: 3 },
        swayAmp:    { min: 0, max: 4 },
        windCouple: { min: 0, max: 3 },
        gustR:      { min: 20, max: 240 },
        gustGain:   { min: 0, max: 4 },
        leafRate:   { min: 0, max: 4 },
        birdPeriod: { min: 2, max: 60 },
        fallRate:   { min: 0.2, max: 3 }
      });

      // bombTune — live-charge physics (065): toss, bounce, fuses, impact
      // detonation, chain reactions, blast juice.
      gmRegisterObject('bombs', 'bombs', bombTune, {
        GRAV:       { min: 200, max: 1200 },
        REST_SMALL: { min: 0, max: 0.9, step: 0.02 },
        REST_LARGE: { min: 0, max: 0.9, step: 0.02 },
        FRICT:      { min: 0, max: 20 },
        DRAG:       { min: 0, max: 1, step: 0.02 },
        INHERIT:    { min: 0, max: 1.5, step: 0.05 },
        TOSS_X:     { min: 0, max: 300 },
        TOSS_UP:    { min: 0, max: 300 },
        FUSE_SMALL: { min: 0.5, max: 6, step: 0.1 },
        FUSE_LARGE: { min: 0.5, max: 6, step: 0.1 },
        IMPACT_V:   { min: 0, max: 1200 },
        CHAIN:      { min: 0, max: 1, step: 1 },
        SHAKE:      { min: 0, max: 3, step: 0.1 },
        EMBERS:     { min: 0, max: 1, step: 1 }
      });

      // SUN — TUNING.md §5.3. Non-numeric fields skip automatically; `paused`
      // is a boolean toggle.
      gmRegisterObject('sky', 'sky', SUN, {
        paused:       { min: 0, max: 1, step: 1 },
        fovY_deg:     { min: 60, max: 110 },
        pitch_deg:    { min: 0, max: 40 },
        altitude_deg: { min: 20, max: 80 },
        azimuth_deg:  { min: 0, max: 90 },
        intensity:    { min: 10, max: 40 },
        discSize:     { min: 0.02, max: 0.12 },
        mieG:         { min: 0.6, max: 0.9 }
      });

      // Night star field — master dimmer + twinkle depth (150-render-nightsky.js
      // NIGHT_SKY). Live so the owner can chill the cosmos to taste without a
      // rebuild; both fold straight into the per-frame draw alpha, no cache to
      // bust. NIGHT_DIM 1 restores the pre-v25.34 (strong) look.
      if (typeof NIGHT_SKY !== 'undefined') {
        gmRegisterLever('sky.NIGHT_DIM', 'sky', 'star field brightness (stars+nebula+twinkle)',
          function () { return NIGHT_SKY.intensity; },
          function (v) { NIGHT_SKY.intensity = v; },
          0, 1, 0.02);
        gmRegisterLever('sky.TWINKLE', 'sky', 'twinkle pulse depth (0 steady .. flickerier)',
          function () { return NIGHT_SKY.twinkle; },
          function (v) { NIGHT_SKY.twinkle = v; },
          0, 0.6, 0.02);
      }

      // ----- Standalone var levers (need side-effects on set) -----
      // Shiny ore spawn rarity — live-tunable so the owner can dial how often
      // a shiny appears by feel (takes effect on the next world / regen).
      if (typeof SHINY_ORE_CHANCE !== 'undefined') {
        gmRegisterLever('ore.SHINY_ORE_CHANCE', 'ore', 'Shiny ore spawn chance',
          function () { return SHINY_ORE_CHANCE; },
          function (v) { SHINY_ORE_CHANCE = v; },
          0, 0.2, 0.005);
      }
      // Shiny sell premium — how many times base value a shiny unit fetches.
      if (typeof SHINY_VALUE_MULT !== 'undefined') {
        gmRegisterLever('ore.SHINY_VALUE_MULT', 'ore', 'Shiny ore sell value multiple',
          function () { return SHINY_VALUE_MULT; },
          function (v) { SHINY_VALUE_MULT = v; },
          1, 25, 0.5);
      }
      // Console end-cap style — the owner picks the ornate cap live from the L
      // panel. 0 = original plain cap; 1 Fluted Pilaster, 2 Star Medallion,
      // 3 Hazard Bracket, 4 Stepped Glass, 5 Filigree Rosette, 6 Gauge Cluster
      // (designed in endcap-lab.html). set() clears the console frame cache so
      // the new cap is rebuilt on the next frame.
      if (typeof consoleCapStyleId !== 'undefined') {
        gmRegisterLever('endcap.STYLE', 'endcap', 'STYLE 0old 1flute 2star 3bracket 4glass 5rosette 6gauges',
          function () { return consoleCapStyleId; },
          function (v) { consoleCapStyleId = Math.max(0, Math.min(CAP_STYLES.length - 1, Math.round(v))); consoleFrameKey = ''; },
          0, 6, 1);
      }
      // Resolution levers — TUNING.md §3. Each set() reassigns the var then
      // calls resize() so the backing store re-sizes immediately.
      if (typeof RES_PIXEL_BUDGET !== 'undefined') {
        gmRegisterLever('res.RES_PIXEL_BUDGET', 'res', 'RES_PIXEL_BUDGET',
          function () { return RES_PIXEL_BUDGET; },
          function (v) { RES_PIXEL_BUDGET = v; resize(); },
          1000000, 6000000, undefined);
      }
      if (typeof RENDER_SCALE_DESKTOP !== 'undefined') {
        gmRegisterLever('res.RENDER_SCALE_DESKTOP', 'res', 'RENDER_SCALE_DESKTOP',
          function () { return RENDER_SCALE_DESKTOP; },
          function (v) { RENDER_SCALE_DESKTOP = v; resize(); },
          0.75, 1.25, undefined);
      }
      if (typeof RENDER_SCALE_MOBILE !== 'undefined') {
        gmRegisterLever('res.RENDER_SCALE_MOBILE', 'res', 'RENDER_SCALE_MOBILE',
          function () { return RENDER_SCALE_MOBILE; },
          function (v) { RENDER_SCALE_MOBILE = v; resize(); },
          0.4, 0.85, undefined);
      }
      if (typeof TERRAIN_CHUNK_RENDER_SCALE_MIN !== 'undefined') {
        gmRegisterLever('res.TERRAIN_CHUNK_RENDER_SCALE_MIN', 'res', 'TERRAIN_CHUNK_RENDER_SCALE_MIN',
          function () { return TERRAIN_CHUNK_RENDER_SCALE_MIN; },
          function (v) { TERRAIN_CHUNK_RENDER_SCALE_MIN = v; resize(); },
          1.0, 2.0, undefined);
      }
      if (typeof TERRAIN_CHUNK_RENDER_SCALE_MAX !== 'undefined') {
        gmRegisterLever('res.TERRAIN_CHUNK_RENDER_SCALE_MAX', 'res', 'TERRAIN_CHUNK_RENDER_SCALE_MAX',
          function () { return TERRAIN_CHUNK_RENDER_SCALE_MAX; },
          function (v) { TERRAIN_CHUNK_RENDER_SCALE_MAX = v; resize(); },
          2, 4, undefined);
      }
      if (typeof SMOKE_RENDER_SCALE_DESKTOP !== 'undefined') {
        gmRegisterLever('res.SMOKE_RENDER_SCALE_DESKTOP', 'res', 'SMOKE_RENDER_SCALE_DESKTOP',
          function () { return SMOKE_RENDER_SCALE_DESKTOP; },
          function (v) { SMOKE_RENDER_SCALE_DESKTOP = v; resize(); },
          0.4, 1.0, undefined);
      }
      if (typeof SMOKE_RENDER_SCALE_MOBILE !== 'undefined') {
        gmRegisterLever('res.SMOKE_RENDER_SCALE_MOBILE', 'res', 'SMOKE_RENDER_SCALE_MOBILE',
          function () { return SMOKE_RENDER_SCALE_MOBILE; },
          function (v) { SMOKE_RENDER_SCALE_MOBILE = v; resize(); },
          0.4, 1.0, undefined);
      }
      // TERRAIN_RES_FACTOR also needs the terrain chunk cache cleared so the
      // block bitmaps re-bake at the new fraction (terrainChunkCache is a
      // plain var object — reassigning to {} clears it).
      if (typeof TERRAIN_RES_FACTOR !== 'undefined') {
        gmRegisterLever('res.TERRAIN_RES_FACTOR', 'res', 'TERRAIN_RES_FACTOR',
          function () { return TERRAIN_RES_FACTOR; },
          function (v) {
            TERRAIN_RES_FACTOR = v; resize();
            // FULL terrain-cache invalidation — mirrors syncTerrainChunkRenderScale.
            // A bare `terrainChunkCache = {}` leaves terrainChunkCount /
            // terrainChunkUseTick stale, desyncing the LRU bookkeeping so the
            // dirt can stop re-caching (looks like it "deleted the terrain").
            terrainChunkCache = {}; terrainChunkCount = 0; terrainChunkUseTick = 0;
            terrainChunkRebuildBoostFrames = Math.max(terrainChunkRebuildBoostFrames || 0, 3);
          },
          0.5, 1.0, undefined);
      }
      // Camera framing — TUNING.md §7. No side-effect (read fresh by the
      // camera update each frame).
      if (typeof CAMERA_SURFACE_FRAC !== 'undefined') {
        gmRegisterLever('camera.CAMERA_SURFACE_FRAC', 'camera', 'CAMERA_SURFACE_FRAC',
          function () { return CAMERA_SURFACE_FRAC; },
          function (v) { CAMERA_SURFACE_FRAC = v; },
          0.3, 0.7, undefined);
      }
      if (typeof CAMERA_DEEP_FRAC !== 'undefined') {
        gmRegisterLever('camera.CAMERA_DEEP_FRAC', 'camera', 'CAMERA_DEEP_FRAC',
          function () { return CAMERA_DEEP_FRAC; },
          function (v) { CAMERA_DEEP_FRAC = v; },
          0.3, 0.6, undefined);
      }
      // Day/night cycle length — TUNING.md §5.3. No side-effect.
      if (typeof DAY_CYCLE_SECONDS !== 'undefined') {
        gmRegisterLever('sky.DAY_CYCLE_SECONDS', 'sky', 'DAY_CYCLE_SECONDS',
          function () { return DAY_CYCLE_SECONDS; },
          function (v) { DAY_CYCLE_SECONDS = v; },
          120, 900, undefined);
      }
      // Smoke domain overscan — TUNING.md §1.2. No side-effect.
      if (typeof SMOKE_FLUID_OVERSCAN !== 'undefined') {
        gmRegisterLever('smoke.SMOKE_FLUID_OVERSCAN', 'smoke', 'SMOKE_FLUID_OVERSCAN',
          function () { return SMOKE_FLUID_OVERSCAN; },
          function (v) { SMOKE_FLUID_OVERSCAN = v; },
          0.0, 0.6, undefined);
      }

      // Water LOOK levers (v14.25) — the WebGPU water's rendered colour +
      // opacity + particle size. These are LIVE: each set() reassigns the
      // sluice.js LIQUID_* var (the CPU fallback renderer reads it
      // directly) AND calls liquidWGPU.setRenderParam() so the WebGPU water
      // updates the same frame with NO shader recompile (the render shader
      // reads colours from the per-frame RenderParams uniform). Only the
      // rendered LOOK is tunable here — the water SIM constants stay baked.
      // gmSetWaterLook: assign the var + push to the GPU. `name` is the var
      // name stripped of its LIQUID_ prefix (what setRenderParam expects).
      function gmSetWaterLook(name, v) {
        if (liquidWGPU && liquidWGPU.setRenderParam) {
          try { liquidWGPU.setRenderParam(name, v); } catch (_) {}
        }
      }
      if (typeof LIQUID_WATER_R !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_R', 'water', 'LIQUID_WATER_R',
          function () { return LIQUID_WATER_R; },
          function (v) { LIQUID_WATER_R = v; gmSetWaterLook('WATER_R', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_G !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_G', 'water', 'LIQUID_WATER_G',
          function () { return LIQUID_WATER_G; },
          function (v) { LIQUID_WATER_G = v; gmSetWaterLook('WATER_G', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_B !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_B', 'water', 'LIQUID_WATER_B',
          function () { return LIQUID_WATER_B; },
          function (v) { LIQUID_WATER_B = v; gmSetWaterLook('WATER_B', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_FOAM_R !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_FOAM_R', 'water', 'LIQUID_WATER_FOAM_R',
          function () { return LIQUID_WATER_FOAM_R; },
          function (v) { LIQUID_WATER_FOAM_R = v; gmSetWaterLook('WATER_FOAM_R', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_FOAM_G !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_FOAM_G', 'water', 'LIQUID_WATER_FOAM_G',
          function () { return LIQUID_WATER_FOAM_G; },
          function (v) { LIQUID_WATER_FOAM_G = v; gmSetWaterLook('WATER_FOAM_G', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_FOAM_B !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_FOAM_B', 'water', 'LIQUID_WATER_FOAM_B',
          function () { return LIQUID_WATER_FOAM_B; },
          function (v) { LIQUID_WATER_FOAM_B = v; gmSetWaterLook('WATER_FOAM_B', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_ALPHA !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_ALPHA', 'water', 'LIQUID_WATER_ALPHA',
          function () { return LIQUID_WATER_ALPHA; },
          function (v) { LIQUID_WATER_ALPHA = v; gmSetWaterLook('WATER_ALPHA', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_OIL_R !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_R', 'water', 'LIQUID_OIL_R',
          function () { return LIQUID_OIL_R; },
          function (v) { LIQUID_OIL_R = v; gmSetWaterLook('OIL_R', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_OIL_G !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_G', 'water', 'LIQUID_OIL_G',
          function () { return LIQUID_OIL_G; },
          function (v) { LIQUID_OIL_G = v; gmSetWaterLook('OIL_G', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_OIL_B !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_B', 'water', 'LIQUID_OIL_B',
          function () { return LIQUID_OIL_B; },
          function (v) { LIQUID_OIL_B = v; gmSetWaterLook('OIL_B', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_OIL_ALPHA !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_ALPHA', 'water', 'LIQUID_OIL_ALPHA',
          function () { return LIQUID_OIL_ALPHA; },
          function (v) { LIQUID_OIL_ALPHA = v; gmSetWaterLook('OIL_ALPHA', v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_WATER_PARTICLE_SIZE !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_PARTICLE_SIZE', 'water', 'LIQUID_WATER_PARTICLE_SIZE',
          function () { return LIQUID_WATER_PARTICLE_SIZE; },
          function (v) { LIQUID_WATER_PARTICLE_SIZE = v; gmSetWaterLook('WATER_PARTICLE_SIZE', v); },
          0.5, 4, undefined);
      }
      if (typeof LIQUID_OIL_PARTICLE_SIZE !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_PARTICLE_SIZE', 'water', 'LIQUID_OIL_PARTICLE_SIZE',
          function () { return LIQUID_OIL_PARTICLE_SIZE; },
          function (v) { LIQUID_OIL_PARTICLE_SIZE = v; gmSetWaterLook('OIL_PARTICLE_SIZE', v); },
          0.5, 4, undefined);
      }
      // v24.113 — surface render (WebGPU only): field + threshold
      // compositing so water reads as one continuous body. SURFACE_RENDER
      // 0/1 toggles back to the legacy per-particle discs live.
      if (typeof LIQUID_SURFACE_RENDER !== 'undefined') {
        gmRegisterLever('water.LIQUID_SURFACE_RENDER', 'water', 'LIQUID_SURFACE_RENDER',
          function () { return LIQUID_SURFACE_RENDER; },
          function (v) { LIQUID_SURFACE_RENDER = v; gmSetWaterLook('SURFACE_RENDER', v); },
          0, 1, 1);
      }
      // v25.32 — droplet pass: low-support water particles draw as small
      // visible drops (spray/strays) instead of falling under the surface
      // threshold and vanishing. 0 = the old invisible-stray behavior.
      if (typeof LIQUID_DROPLETS !== 'undefined') {
        gmRegisterLever('water.DROPLETS', 'water', 'DROPLETS (visible spray)',
          function () { return LIQUID_DROPLETS; },
          function (v) { LIQUID_DROPLETS = v ? 1 : 0; gmSetWaterLook('DROPLETS', LIQUID_DROPLETS); },
          0, 1, 1);
      }
      // v24.160 — PARTICLE PROOF overlay toggle: each particle drawn as one
      // hard dot over the water, so a "giant particle" is provably one
      // particle (one dot) or a merged cluster (a speckle of many dots).
      if (typeof LIQUID_DBG_PARTICLES !== 'undefined') {
        gmRegisterLever('water.DBG_PARTICLES', 'water', 'DBG_PARTICLES',
          function () { return LIQUID_DBG_PARTICLES; },
          function (v) { LIQUID_DBG_PARTICLES = v ? 1 : 0; gmSetWaterLook('DBG_PARTICLES', LIQUID_DBG_PARTICLES); },
          0, 1, 1);
      }
      if (typeof LIQUID_SURFACE_THRESH !== 'undefined') {
        gmRegisterLever('water.LIQUID_SURFACE_THRESH', 'water', 'LIQUID_SURFACE_THRESH',
          function () { return LIQUID_SURFACE_THRESH; },
          function (v) { LIQUID_SURFACE_THRESH = v; gmSetWaterLook('SURFACE_THRESH', v); },
          0.2, 2.5, undefined);
      }
      if (typeof LIQUID_SURFACE_SOFT !== 'undefined') {
        gmRegisterLever('water.LIQUID_SURFACE_SOFT', 'water', 'LIQUID_SURFACE_SOFT',
          function () { return LIQUID_SURFACE_SOFT; },
          function (v) { LIQUID_SURFACE_SOFT = v; gmSetWaterLook('SURFACE_SOFT', v); },
          0.05, 1, undefined);
      }
      if (typeof LIQUID_SURFACE_RSCALE !== 'undefined') {
        gmRegisterLever('water.LIQUID_SURFACE_RSCALE', 'water', 'LIQUID_SURFACE_RSCALE',
          function () { return LIQUID_SURFACE_RSCALE; },
          function (v) { LIQUID_SURFACE_RSCALE = v; gmSetWaterLook('SURFACE_RSCALE', v); },
          1, 3, undefined);
      }

      // Water PHYSICS levers (v14.26) — the WebGPU water SIM's fluid-feel
      // constants (gravity, pressure stiffness, damping, friction, wall +
      // terrain bounce, aeration). LIVE: each set() reassigns the
      // sluice.js LIQUID_* var (the CPU fallback solver reads it)
      // AND calls liquidWGPU.setSimParam() so the WebGPU compute kernels
      // pick it up on the next sim step with NO pipeline recompile (the
      // kernels read the SimParams uniform). Ranges from TUNING.md
      // §2.2 / §2.3 / §2.4 / §2.9. gmSetWaterSim: push the value to the GPU
      // sim; `name` is the var name stripped of its LIQUID_ prefix (what
      // setSimParam expects). Each registration typeof-guards its var so a
      // missing constant is skipped rather than throwing.
      function gmSetWaterSim(name, v) {
        if (liquidWGPU && liquidWGPU.setSimParam) {
          try { liquidWGPU.setSimParam(name, v); } catch (_) {}
        }
      }
      // v25.13 — panel readout mirror for the engine-side sparse-grid flag
      // (liquid-wgpu.js owns the real one; default there is 1 = sparse).
      var gmWaterSparseMirror = 1;
      if (typeof LIQUID_GRAVITY !== 'undefined') {
        gmRegisterLever('water.LIQUID_GRAVITY', 'water', 'LIQUID_GRAVITY',
          function () { return LIQUID_GRAVITY; },
          function (v) { LIQUID_GRAVITY = v; gmSetWaterSim('GRAVITY', v); },
          400, 1400, undefined);
      }
      if (typeof LIQUID_OIL_GRAVITY !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_GRAVITY', 'water', 'LIQUID_OIL_GRAVITY',
          function () { return LIQUID_OIL_GRAVITY; },
          function (v) { LIQUID_OIL_GRAVITY = v; gmSetWaterSim('OIL_GRAVITY', v); },
          250, 1200, undefined);
      }
      if (typeof LIQUID_PRESSURE_STIFF !== 'undefined') {
        gmRegisterLever('water.LIQUID_PRESSURE_STIFF', 'water', 'LIQUID_PRESSURE_STIFF',
          function () { return LIQUID_PRESSURE_STIFF; },
          function (v) { LIQUID_PRESSURE_STIFF = v; gmSetWaterSim('PRESSURE_STIFF', v); },
          1.0, 6.0, undefined);
      }
      if (typeof LIQUID_OIL_PRESSURE_STIFF !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_PRESSURE_STIFF', 'water', 'LIQUID_OIL_PRESSURE_STIFF',
          function () { return LIQUID_OIL_PRESSURE_STIFF; },
          function (v) { LIQUID_OIL_PRESSURE_STIFF = v; gmSetWaterSim('OIL_PRESSURE_STIFF', v); },
          1.0, 6.0, undefined);
      }
      if (typeof LIQUID_DAMPING !== 'undefined') {
        gmRegisterLever('water.LIQUID_DAMPING', 'water', 'LIQUID_DAMPING',
          function () { return LIQUID_DAMPING; },
          function (v) { LIQUID_DAMPING = v; gmSetWaterSim('DAMPING', v); },
          0.95, 1.0, undefined);
      }
      // v24.115 — grid viscosity: the rest-calm lever (anti-phase standing
      // waves cancel at the grid; 0 disables, high values read syrupy).
      if (typeof LIQUID_GRID_VISC !== 'undefined') {
        gmRegisterLever('water.LIQUID_GRID_VISC', 'water', 'LIQUID_GRID_VISC',
          function () { return LIQUID_GRID_VISC; },
          function (v) { LIQUID_GRID_VISC = v; gmSetWaterSim('GRID_VISC', v); },
          0, 0.6, undefined);
      }
      // v24.124 — fixed-quantum substepping (the 120 Hz firecracker fix):
      // 1 = constant stepDt with remainder banking (default), 0 = legacy
      // ceil-split where stepDt swings with frame jitter (kept for A/B).
      if (typeof LIQUID_FIXED_STEP !== 'undefined') {
        gmRegisterLever('water.FIXED_STEP', 'water', 'FIXED_STEP',
          function () { return LIQUID_FIXED_STEP; },
          function (v) { LIQUID_FIXED_STEP = v ? 1 : 0; liquidStepAcc = 0; gmSetWaterSim('FIXED_STEP', v); },
          0, 1, 1);
      }
      // v25.29 — sim playback rate (the slo-mo fix): dt banks x TIMESCALE
      // into the fixed-quantum accumulator, so the same calm physics play
      // faster. 1.55² x LIQUID_GRAVITY(250) ≈ world GRAVITY (600). 1 = the
      // old slo-mo; rationale at the 010-constants block.
      if (typeof LIQUID_TIMESCALE !== 'undefined') {
        gmRegisterLever('water.TIMESCALE', 'water', 'TIMESCALE (sim playback rate)',
          function () { return LIQUID_TIMESCALE; },
          function (v) { LIQUID_TIMESCALE = (v > 0 && isFinite(v)) ? v : 1; liquidStepAcc = 0; gmSetWaterSim('TIMESCALE', v); },
          0.5, 2.5, undefined);
      }
      // v24.145 WATER STATE MACHINE — stimulated -> settling -> frozen
      // (liquidStateTick in 070; rationale at the const block in 020).
      // FREEZE 0 also clears an active latch so the A/B flip is instant.
      // VISC_LIVE is the stimulated-state grid viscosity (the settled
      // target stays LIQUID_GRID_VISC above); the blend rides to the GPU
      // per frame from the state tick, so neither lever needs a sim push.
      if (typeof LIQUID_FREEZE !== 'undefined') {
        gmRegisterLever('water.FREEZE', 'water', 'FREEZE',
          function () { return LIQUID_FREEZE; },
          function (v) { LIQUID_FREEZE = v ? 1 : 0; if (!LIQUID_FREEZE) { liquidFrozenAll = false; liquidFreezeHoldT = 0; } },
          0, 1, 1);
      }
      // v24.169 — SAHARAN-RAW master switch (the re-port experiment).
      if (typeof LIQUID_RAW !== 'undefined') {
        gmRegisterLever('water.RAW', 'water', 'RAW',
          function () { return LIQUID_RAW; },
          function (v) {
            LIQUID_RAW = v ? 1 : 0;
            // v25.32 — a live 1 -> 0 flip must also clear the KERNEL no-sleep
            // bit (the RAW state-tick pushes DBG_FLAGS 1 every frame; nothing
            // in the normal path re-pushes it, so GPU sleep stayed off and
            // the freeze latch could never converge after an A/B flip).
            if (!LIQUID_RAW) {
              LIQUID_DBG_NO_SLEEP = 0;
              gmSetWaterSim('DBG_FLAGS', LIQUID_DBG_FLAGS);
            }
          },
          0, 1, 1);
      }
      // v24.170 — RAW settling dissipation (Old Faithful knob): 1.0 = pure
      // saharan (never settles), lower = a burst spews then settles faster.
      if (typeof LIQUID_RAW_DAMP !== 'undefined') {
        gmRegisterLever('water.RAW_DAMP', 'water', 'RAW_DAMP',
          function () { return LIQUID_RAW_DAMP; },
          function (v) { LIQUID_RAW_DAMP = v; },
          0.97, 1.0, undefined);
      }
      // v24.183 — RAW grid viscosity (EOS-limit-cycle killer): 0 = pure saharan,
      // raise to settle a stressed runaway the velocity damping can't. The RAW
      // branch (070) pushes this to GRID_VISC each frame; no setSimParam here.
      if (typeof LIQUID_RAW_VISC !== 'undefined') {
        gmRegisterLever('water.RAW_VISC', 'water', 'RAW_VISC (0=saharan)',
          function () { return LIQUID_RAW_VISC; },
          function (v) { LIQUID_RAW_VISC = v; },
          0, 0.6, undefined);
      }
      // v24.185 — ANTI-CLUMP (min-separation) on/off. Pushes over-dense particle
      // knots apart so they can never get stuck over-pressured. 1 = on (fix), 0
      // = off (A/B the old behaviour).
      if (typeof LIQUID_DECLUMP_ON !== 'undefined') {
        gmRegisterLever('water.DECLUMP', 'water', 'DECLUMP (anti-clump 1=on)',
          function () { return LIQUID_DECLUMP_ON; },
          function (v) { LIQUID_DECLUMP_ON = v ? 1 : 0; gmSetWaterSim('DECLUMP_ON', LIQUID_DECLUMP_ON); },
          0, 1, 1);
      }
      // v25.13 — SPARSE BLOCK GRID (liquid-wgpu.js v15.0). 1 = GPU-driven
      // sparse active-block dispatch, cost scales with wet area (shipping
      // default); 0 = the old dense full-bbox chain (the A/B baseline; also
      // the automatic fallback on devices under 10 storage buffers/stage).
      // Engine-side flag, no game twin — the mirror var here only feeds the
      // panel readout. Spot-check per load with ?wdbg=SPARSE:0.
      gmRegisterLever('water.SPARSE', 'water', 'SPARSE grid (1=on)',
        function () { return gmWaterSparseMirror; },
        function (v) { gmWaterSparseMirror = v ? 1 : 0; gmSetWaterSim('SPARSE', gmWaterSparseMirror); },
        0, 1, 1);
      // v24.173 OLD-FAITHFUL — speed cap + speed-gated burst damp. MAX_VEL =
      // hard per-particle speed cap (kills the "crazy particle" runaway, 0 =
      // off). BURST_DAMP = per-substep factor for fully-fast water (1.0 = off,
      // lower = a stir settles faster). GATE_LO/HI = the px/s band over which
      // burst damp ramps in (LO above rested ambient so rest stays calm). Each
      // pushes to the GPU sim (g2pC lane) live, no recompile.
      // v25.41 — the shallow-popcorn root fix: per-substep pressure impulse
      // cap (the pop quantum) + air drag on separated droplets. 0 / 1 = old.
      if (typeof LIQUID_PRESSURE_MAX_DV !== 'undefined') {
        gmRegisterLever('water.PRESSURE_MAX_DV', 'water', 'PRESSURE_MAX_DV (px/s per substep, 0=off)',
          function () { return LIQUID_PRESSURE_MAX_DV; },
          function (v) { LIQUID_PRESSURE_MAX_DV = v < 0 ? 0 : v; gmSetWaterSim('PRESSURE_MAX_DV', LIQUID_PRESSURE_MAX_DV); },
          0, 40, undefined);
      }
      // COHESION is EXPERIMENTAL and defaults 0 — measured explosive at any
      // sustained level (see 010); the lever exists for supervised A/B only.
      if (typeof LIQUID_COHESION !== 'undefined') {
        gmRegisterLever('water.COHESION', 'water', 'COHESION (DANGER: explosive)',
          function () { return LIQUID_COHESION; },
          function (v) { LIQUID_COHESION = v < 0 ? 0 : (v > 1 ? 1 : v); gmSetWaterSim('COHESION', LIQUID_COHESION); },
          0, 0.3, undefined);
      }
      if (typeof LIQUID_AIR_DRAG !== 'undefined') {
        gmRegisterLever('water.AIR_DRAG', 'water', 'AIR_DRAG (droplet keep/substep)',
          function () { return LIQUID_AIR_DRAG; },
          function (v) { LIQUID_AIR_DRAG = v < 0.9 ? 0.9 : (v > 1 ? 1 : v); gmSetWaterSim('AIR_DRAG', LIQUID_AIR_DRAG); },
          0.98, 1.0, undefined);
      }
      if (typeof LIQUID_MAX_VEL !== 'undefined') {
        gmRegisterLever('water.MAX_VEL', 'water', 'MAX_VEL (px/s cap, 0=off)',
          function () { return LIQUID_MAX_VEL; },
          function (v) { LIQUID_MAX_VEL = v; gmSetWaterSim('MAX_VEL', v); },
          0, 1500, undefined);
      }
      if (typeof LIQUID_BURST_DAMP !== 'undefined') {
        gmRegisterLever('water.BURST_DAMP', 'water', 'BURST_DAMP (1=off)',
          function () { return LIQUID_BURST_DAMP; },
          function (v) { LIQUID_BURST_DAMP = v; gmSetWaterSim('BURST_DAMP', v); },
          0.95, 1.0, undefined);
      }
      if (typeof LIQUID_BURST_GATE_LO !== 'undefined') {
        gmRegisterLever('water.BURST_GATE_LO', 'water', 'BURST_GATE_LO (px/s)',
          function () { return LIQUID_BURST_GATE_LO; },
          function (v) { LIQUID_BURST_GATE_LO = v; gmSetWaterSim('BURST_GATE_LO', v); },
          0, 400, undefined);
      }
      if (typeof LIQUID_BURST_GATE_HI !== 'undefined') {
        gmRegisterLever('water.BURST_GATE_HI', 'water', 'BURST_GATE_HI (px/s)',
          function () { return LIQUID_BURST_GATE_HI; },
          function (v) { LIQUID_BURST_GATE_HI = v; gmSetWaterSim('BURST_GATE_HI', v); },
          50, 800, undefined);
      }
      // v24.175 — ORPHAN DWELL: orphan-ticks (~0.25s each at 120fps) a FAST lone
      // stray must persist before it evaporates (the stuck "giant excited
      // orphan" cleanup). Lower = cleared sooner; higher = safer for spew
      // droplets. CPU-side only (the orphan tick), no GPU push.
      if (typeof LIQUID_ORPHAN_DWELL_TICKS !== 'undefined') {
        gmRegisterLever('water.ORPHAN_DWELL', 'water', 'ORPHAN_DWELL (ticks)',
          function () { return LIQUID_ORPHAN_DWELL_TICKS; },
          function (v) { LIQUID_ORPHAN_DWELL_TICKS = Math.max(1, v | 0); },
          1, 40, 1);
      }
      if (typeof LIQUID_VISC_LIVE !== 'undefined') {
        gmRegisterLever('water.VISC_LIVE', 'water', 'VISC_LIVE',
          function () { return LIQUID_VISC_LIVE; },
          function (v) { LIQUID_VISC_LIVE = v; },
          0, 0.6, undefined);
      }
      // v24.152 — THE slosh knob: per-substep damping while lively.
      // 1.0 = saharan-raw (sloshes for tens of seconds), 0.992 = the old
      // always-on damping (dies in ~1-2 s). Settled water always grinds
      // with the full LIQUID_DAMPING lever regardless.
      if (typeof LIQUID_DAMP_LIVE !== 'undefined') {
        gmRegisterLever('water.DAMP_LIVE', 'water', 'DAMP_LIVE',
          function () { return LIQUID_DAMP_LIVE; },
          function (v) { LIQUID_DAMP_LIVE = v; },
          0.99, 1.0, undefined);
      }
      // v25.44 — the honey dials: the lively APIC transfer scale and the
      // per-substep terrain frictions (state tick pushes MOTION_LIVE per
      // frame at calm 0; frictions ride gmSetWaterSim to the GPU).
      if (typeof LIQUID_MOTION_LIVE !== 'undefined') {
        gmRegisterLever('water.MOTION_LIVE', 'water', 'MOTION_LIVE',
          function () { return LIQUID_MOTION_LIVE; },
          function (v) { LIQUID_MOTION_LIVE = v; },
          0.97, 1.0, undefined);
      }
      if (typeof LIQUID_FLOOR_FRICTION !== 'undefined') {
        gmRegisterLever('water.FLOOR_FRICTION', 'water', 'FLOOR_FRICTION (per substep)',
          function () { return LIQUID_FLOOR_FRICTION; },
          function (v) { LIQUID_FLOOR_FRICTION = v; gmSetWaterSim('FLOOR_FRICTION', v); },
          0.85, 1.0, undefined);
      }
      if (typeof LIQUID_WALL_FRICTION !== 'undefined') {
        gmRegisterLever('water.WALL_FRICTION', 'water', 'WALL_FRICTION (per substep)',
          function () { return LIQUID_WALL_FRICTION; },
          function (v) { LIQUID_WALL_FRICTION = v; gmSetWaterSim('WALL_FRICTION', v); },
          0.9, 1.0, undefined);
      }
      // v25.45 — ledge-lip spill: open-edge floor cells barely grip so
      // blobs pour off ledges; set equal to FLOOR_FRICTION = old damming.
      if (typeof LIQUID_LIP_FRICTION !== 'undefined') {
        gmRegisterLever('water.LIP_FRICTION', 'water', 'LIP_FRICTION (ledge spill)',
          function () { return LIQUID_LIP_FRICTION; },
          function (v) { LIQUID_LIP_FRICTION = v < 0.9 ? 0.9 : (v > 1 ? 1 : v); gmSetWaterSim('LIP_FRICTION', LIQUID_LIP_FRICTION); },
          0.9, 1.0, undefined);
      }
      if (typeof LIQUID_CALM_RAMP !== 'undefined') {
        gmRegisterLever('water.CALM_RAMP', 'water', 'CALM_RAMP',
          function () { return LIQUID_CALM_RAMP; },
          function (v) { LIQUID_CALM_RAMP = v; },
          0.2, 4.0, undefined);
      }
      // v25.39 — rest liveliness: the calm ramp parks here instead of 1.0.
      // 1 = the old dead-still settle (re-arms the freeze latch), lower =
      // livelier rest; 0.5 = the mid-transition shimmer the owner picked.
      if (typeof LIQUID_CALM_MAX !== 'undefined') {
        gmRegisterLever('water.CALM_MAX', 'water', 'CALM_MAX (rest stillness)',
          function () { return LIQUID_CALM_MAX; },
          function (v) { LIQUID_CALM_MAX = v < 0 ? 0 : (v > 1 ? 1 : v); },
          0, 1, undefined);
      }
      if (typeof LIQUID_STIM_HOLD !== 'undefined') {
        gmRegisterLever('water.STIM_HOLD', 'water', 'STIM_HOLD',
          function () { return LIQUID_STIM_HOLD; },
          function (v) { LIQUID_STIM_HOLD = v; },
          0.2, 4.0, undefined);
      }
      if (typeof LIQUID_STIM_MAX !== 'undefined') {
        gmRegisterLever('water.STIM_MAX', 'water', 'STIM_MAX',
          function () { return LIQUID_STIM_MAX; },
          function (v) { LIQUID_STIM_MAX = v; },
          2.0, 15.0, undefined);
      }
      // v24.148 RIG WATER MEDIUM — swim/sink feel in the deep lakes (080).
      if (typeof WATER_RIG_DRAG !== 'undefined') {
        gmRegisterLever('water.RIG_DRAG', 'water', 'RIG_DRAG',
          function () { return WATER_RIG_DRAG; },
          function (v) { WATER_RIG_DRAG = v; },
          0, 6, undefined);
      }
      if (typeof WATER_RIG_BUOY !== 'undefined') {
        gmRegisterLever('water.RIG_BUOY', 'water', 'RIG_BUOY',
          function () { return WATER_RIG_BUOY; },
          function (v) { WATER_RIG_BUOY = v; },
          0, 0.95, undefined);
      }
      if (typeof WATER_RIG_SINK_VMAX !== 'undefined') {
        gmRegisterLever('water.RIG_SINK_VMAX', 'water', 'RIG_SINK_VMAX',
          function () { return WATER_RIG_SINK_VMAX; },
          function (v) { WATER_RIG_SINK_VMAX = v; },
          40, 250, undefined);
      }
      // v24.120 WATER DEBUG KIT — firecracker-hunt toggles. Each lever
      // disables ONE mechanism suspected of the resting-pond "sections
      // jolt in sync ~1/s" pops, so the culprit can be isolated live:
      // flip one at a time while staring at a pond, with DBG_DRAW's
      // meter reading out wake bursts / speeds / dt state. All default
      // OFF = shipping behaviour. NO_SLEEP + NO_BRAKE also ride to the
      // GPU kernels as one bitmask (SimParams coll.w via DBG_FLAGS).
      function gmWaterDbgFlags() {
        return (LIQUID_DBG_NO_SLEEP ? 1 : 0) | (LIQUID_DBG_NO_BRAKE ? 2 : 0);
      }
      if (typeof LIQUID_DBG_NO_SLEEP !== 'undefined') {
        gmRegisterLever('water.DBG_NO_SLEEP', 'water', 'DBG_NO_SLEEP',
          function () { return LIQUID_DBG_NO_SLEEP; },
          function (v) { LIQUID_DBG_NO_SLEEP = v ? 1 : 0; gmSetWaterSim('DBG_FLAGS', gmWaterDbgFlags()); },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_NO_BRAKE !== 'undefined') {
        gmRegisterLever('water.DBG_NO_BRAKE', 'water', 'DBG_NO_BRAKE',
          function () { return LIQUID_DBG_NO_BRAKE; },
          function (v) { LIQUID_DBG_NO_BRAKE = v ? 1 : 0; gmSetWaterSim('DBG_FLAGS', gmWaterDbgFlags()); },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_NO_IDLESKIP !== 'undefined') {
        gmRegisterLever('water.DBG_NO_IDLESKIP', 'water', 'DBG_NO_IDLESKIP',
          function () { return LIQUID_DBG_NO_IDLESKIP; },
          function (v) { LIQUID_DBG_NO_IDLESKIP = v ? 1 : 0; },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_NO_SWEEP !== 'undefined') {
        gmRegisterLever('water.DBG_NO_SWEEP', 'water', 'DBG_NO_SWEEP',
          function () { return LIQUID_DBG_NO_SWEEP; },
          function (v) { LIQUID_DBG_NO_SWEEP = v ? 1 : 0; },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_NO_PLAYER !== 'undefined') {
        gmRegisterLever('water.DBG_NO_PLAYER', 'water', 'DBG_NO_PLAYER',
          function () { return LIQUID_DBG_NO_PLAYER; },
          function (v) { LIQUID_DBG_NO_PLAYER = v ? 1 : 0; },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_FIXED_DT !== 'undefined') {
        gmRegisterLever('water.DBG_FIXED_DT', 'water', 'DBG_FIXED_DT',
          function () { return LIQUID_DBG_FIXED_DT; },
          function (v) { LIQUID_DBG_FIXED_DT = v ? 1 : 0; },
          0, 1, 1);
      }
      if (typeof LIQUID_DBG_DT_SPIKE !== 'undefined') {
        gmRegisterLever('water.DBG_DT_SPIKE', 'water', 'DBG_DT_SPIKE',
          function () { return LIQUID_DBG_DT_SPIKE; },
          function (v) { LIQUID_DBG_DT_SPIKE = v; },
          0, 100, 5);
      }
      if (typeof LIQUID_DBG_DRAW !== 'undefined') {
        gmRegisterLever('water.DBG_DRAW', 'water', 'DBG_DRAW',
          function () { return LIQUID_DBG_DRAW; },
          function (v) { LIQUID_DBG_DRAW = Math.round(v); },
          0, 2, 1);
      }
      if (typeof LIQUID_DBG_READBACK !== 'undefined') {
        gmRegisterLever('water.DBG_READBACK_EVERY', 'water', 'DBG_READBACK_EVERY',
          function () { return LIQUID_DBG_READBACK; },
          function (v) { LIQUID_DBG_READBACK = Math.round(v); gmSetWaterSim('DBG_READBACK_EVERY', LIQUID_DBG_READBACK); },
          4, 60, 2);
      }
      if (typeof LIQUID_OIL_DAMPING !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_DAMPING', 'water', 'LIQUID_OIL_DAMPING',
          function () { return LIQUID_OIL_DAMPING; },
          function (v) { LIQUID_OIL_DAMPING = v; gmSetWaterSim('OIL_DAMPING', v); },
          0.95, 1.0, undefined);
      }
      if (typeof LIQUID_WATER_MOTION_SCALE !== 'undefined') {
        gmRegisterLever('water.LIQUID_WATER_MOTION_SCALE', 'water', 'LIQUID_WATER_MOTION_SCALE',
          function () { return LIQUID_WATER_MOTION_SCALE; },
          function (v) { LIQUID_WATER_MOTION_SCALE = v; gmSetWaterSim('WATER_MOTION_SCALE', v); },
          0.8, 1.0, undefined);
      }
      if (typeof LIQUID_FLOOR_FRICTION !== 'undefined') {
        gmRegisterLever('water.LIQUID_FLOOR_FRICTION', 'water', 'LIQUID_FLOOR_FRICTION',
          function () { return LIQUID_FLOOR_FRICTION; },
          function (v) { LIQUID_FLOOR_FRICTION = v; gmSetWaterSim('FLOOR_FRICTION', v); },
          0.80, 1.0, undefined);
      }
      if (typeof LIQUID_WALL_FRICTION !== 'undefined') {
        gmRegisterLever('water.LIQUID_WALL_FRICTION', 'water', 'LIQUID_WALL_FRICTION',
          function () { return LIQUID_WALL_FRICTION; },
          function (v) { LIQUID_WALL_FRICTION = v; gmSetWaterSim('WALL_FRICTION', v); },
          0.85, 1.0, undefined);
      }
      if (typeof LIQUID_WALL_BOUNCE_IN !== 'undefined') {
        gmRegisterLever('water.LIQUID_WALL_BOUNCE_IN', 'water', 'LIQUID_WALL_BOUNCE_IN',
          function () { return LIQUID_WALL_BOUNCE_IN; },
          function (v) { LIQUID_WALL_BOUNCE_IN = v; gmSetWaterSim('WALL_BOUNCE_IN', v); },
          0.0, 0.4, undefined);
      }
      if (typeof LIQUID_WALL_BOUNCE_EDGE !== 'undefined') {
        gmRegisterLever('water.LIQUID_WALL_BOUNCE_EDGE', 'water', 'LIQUID_WALL_BOUNCE_EDGE',
          function () { return LIQUID_WALL_BOUNCE_EDGE; },
          function (v) { LIQUID_WALL_BOUNCE_EDGE = v; gmSetWaterSim('WALL_BOUNCE_EDGE', v); },
          0.0, 0.4, undefined);
      }
      if (typeof LIQUID_OIL_WALL_BOUNCE_IN !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_WALL_BOUNCE_IN', 'water', 'LIQUID_OIL_WALL_BOUNCE_IN',
          function () { return LIQUID_OIL_WALL_BOUNCE_IN; },
          function (v) { LIQUID_OIL_WALL_BOUNCE_IN = v; gmSetWaterSim('OIL_WALL_BOUNCE_IN', v); },
          0.0, 0.4, undefined);
      }
      if (typeof LIQUID_OIL_WALL_BOUNCE_EDGE !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_WALL_BOUNCE_EDGE', 'water', 'LIQUID_OIL_WALL_BOUNCE_EDGE',
          function () { return LIQUID_OIL_WALL_BOUNCE_EDGE; },
          function (v) { LIQUID_OIL_WALL_BOUNCE_EDGE = v; gmSetWaterSim('OIL_WALL_BOUNCE_EDGE', v); },
          0.0, 0.4, undefined);
      }
      if (typeof LIQUID_OIL_FLOOR_FRICTION !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_FLOOR_FRICTION', 'water', 'LIQUID_OIL_FLOOR_FRICTION',
          function () { return LIQUID_OIL_FLOOR_FRICTION; },
          function (v) { LIQUID_OIL_FLOOR_FRICTION = v; gmSetWaterSim('OIL_FLOOR_FRICTION', v); },
          0.80, 1.0, undefined);
      }
      if (typeof LIQUID_OIL_WALL_FRICTION !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_WALL_FRICTION', 'water', 'LIQUID_OIL_WALL_FRICTION',
          function () { return LIQUID_OIL_WALL_FRICTION; },
          function (v) { LIQUID_OIL_WALL_FRICTION = v; gmSetWaterSim('OIL_WALL_FRICTION', v); },
          0.85, 1.0, undefined);
      }
      if (typeof LIQUID_BOUNCE_WATER !== 'undefined') {
        gmRegisterLever('water.LIQUID_BOUNCE_WATER', 'water', 'LIQUID_BOUNCE_WATER',
          function () { return LIQUID_BOUNCE_WATER; },
          function (v) { LIQUID_BOUNCE_WATER = v; gmSetWaterSim('BOUNCE_WATER', v); },
          0.0, 0.6, undefined);
      }
      if (typeof LIQUID_BOUNCE_OIL !== 'undefined') {
        gmRegisterLever('water.LIQUID_BOUNCE_OIL', 'water', 'LIQUID_BOUNCE_OIL',
          function () { return LIQUID_BOUNCE_OIL; },
          function (v) { LIQUID_BOUNCE_OIL = v; gmSetWaterSim('BOUNCE_OIL', v); },
          0.0, 0.6, undefined);
      }
      if (typeof LIQUID_AERATION_THRESHOLD !== 'undefined') {
        gmRegisterLever('water.LIQUID_AERATION_THRESHOLD', 'water', 'LIQUID_AERATION_THRESHOLD',
          function () { return LIQUID_AERATION_THRESHOLD; },
          function (v) { LIQUID_AERATION_THRESHOLD = v; gmSetWaterSim('AERATION_THRESHOLD', v); },
          0.2, 0.9, undefined);
      }
      if (typeof LIQUID_OIL_AERATION_THRESHOLD !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_AERATION_THRESHOLD', 'water', 'LIQUID_OIL_AERATION_THRESHOLD',
          function () { return LIQUID_OIL_AERATION_THRESHOLD; },
          function (v) { LIQUID_OIL_AERATION_THRESHOLD = v; gmSetWaterSim('OIL_AERATION_THRESHOLD', v); },
          0.2, 0.9, undefined);
      }
      if (typeof LIQUID_AERATION_COEFF !== 'undefined') {
        gmRegisterLever('water.LIQUID_AERATION_COEFF', 'water', 'LIQUID_AERATION_COEFF',
          function () { return LIQUID_AERATION_COEFF; },
          function (v) { LIQUID_AERATION_COEFF = v; gmSetWaterSim('AERATION_COEFF', v); },
          0, 30, undefined);
      }
      if (typeof LIQUID_OIL_AERATION_COEFF !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_AERATION_COEFF', 'water', 'LIQUID_OIL_AERATION_COEFF',
          function () { return LIQUID_OIL_AERATION_COEFF; },
          function (v) { LIQUID_OIL_AERATION_COEFF = v; gmSetWaterSim('OIL_AERATION_COEFF', v); },
          0, 30, undefined);
      }
      if (typeof LIQUID_AERATION_BLUR !== 'undefined') {
        gmRegisterLever('water.LIQUID_AERATION_BLUR', 'water', 'LIQUID_AERATION_BLUR',
          function () { return LIQUID_AERATION_BLUR; },
          function (v) { LIQUID_AERATION_BLUR = v; gmSetWaterSim('AERATION_BLUR', v); },
          0.0, 0.1, undefined);
      }
      if (typeof LIQUID_OIL_AERATION_BLUR !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_AERATION_BLUR', 'water', 'LIQUID_OIL_AERATION_BLUR',
          function () { return LIQUID_OIL_AERATION_BLUR; },
          function (v) { LIQUID_OIL_AERATION_BLUR = v; gmSetWaterSim('OIL_AERATION_BLUR', v); },
          0.0, 0.1, undefined);
      }
      if (typeof LIQUID_AERATION_DAMP !== 'undefined') {
        gmRegisterLever('water.LIQUID_AERATION_DAMP', 'water', 'LIQUID_AERATION_DAMP',
          function () { return LIQUID_AERATION_DAMP; },
          function (v) { LIQUID_AERATION_DAMP = v; gmSetWaterSim('AERATION_DAMP', v); },
          0.9, 1.0, undefined);
      }
      if (typeof LIQUID_OIL_AERATION_DAMP !== 'undefined') {
        gmRegisterLever('water.LIQUID_OIL_AERATION_DAMP', 'water', 'LIQUID_OIL_AERATION_DAMP',
          function () { return LIQUID_OIL_AERATION_DAMP; },
          function (v) { LIQUID_OIL_AERATION_DAMP = v; gmSetWaterSim('OIL_AERATION_DAMP', v); },
          0.9, 1.0, undefined);
      }

      // ----- Jello feel levers (v17.80) -----
      // All JELLO_* tunables registered here so the owner can dial them live
      // from the browser console:  gm.set('jello.JELLO_PLASTICITY', 0.05)
      // JELLO_E and JELLO_NU have custom setters that call jelloRecomputeMaterial()
      // so MU/LAMBDA are re-derived immediately — no reload needed.
      if (typeof JELLO_E !== 'undefined') {
        // v25.45 — perf-era A/B toggles, kept at the TOP of the jello group
        // (owner: "so I can turn off and on what you just did"). 1 = shipped
        // behavior, 0 = the exact pre-change behavior.
        gmRegisterLever('jello.PARK_PIPELINE (v25.38 sleep)', 'jello', 'PARK_PIPELINE',
          function () { return JELLO_PARK_PIPELINE; },
          function (v) { JELLO_PARK_PIPELINE = v ? 1 : 0; },
          0, 1, 1);
        gmRegisterLever('jello.WAKE_GATES (v25.38 parked-rig)', 'jello', 'WAKE_GATES',
          function () { return JELLO_WAKE_GATES; },
          function (v) { JELLO_WAKE_GATES = v ? 1 : 0; },
          0, 1, 1);
        gmRegisterLever('jello.GATE_EARLY_EXIT (v25.43)', 'jello', 'GATE_EARLY_EXIT',
          function () { return JELLO_GATE_EARLY_EXIT; },
          function (v) { JELLO_GATE_EARLY_EXIT = v ? 1 : 0; },
          0, 1, 1);
        gmRegisterLever('jello.GATE_SLEEP_PAIRS (v25.43)', 'jello', 'GATE_SLEEP_PAIRS',
          function () { return JELLO_GATE_SLEEP_PAIRS; },
          function (v) { JELLO_GATE_SLEEP_PAIRS = v ? 1 : 0; },
          0, 1, 1);
        gmRegisterLever('jello.JELLO_E', 'jello', 'JELLO_E',
          function () { return JELLO_E; },
          function (v) { JELLO_E = Math.max(0.5, v); jelloRecomputeMaterial(); },
          1, 400, undefined);   // floor lowered 10 -> 1 so the gel can be dialed much SOFTER (more squish)
      }
      if (typeof JELLO_NU !== 'undefined') {
        gmRegisterLever('jello.JELLO_NU', 'jello', 'JELLO_NU',
          function () { return JELLO_NU; },
          function (v) { JELLO_NU = Math.min(v, 0.499); jelloRecomputeMaterial(); },
          0.01, 0.499, undefined);
      }
      if (typeof JELLO_DAMPING !== 'undefined') {
        gmRegisterLever('jello.JELLO_DAMPING', 'jello', 'JELLO_DAMPING',
          function () { return JELLO_DAMPING; },
          function (v) { JELLO_DAMPING = v; },
          0.90, 1.0, undefined);
      }
      if (typeof JELLO_VMAX !== 'undefined') {
        gmRegisterLever('jello.JELLO_VMAX', 'jello', 'JELLO_VMAX',
          function () { return JELLO_VMAX; },
          function (v) { JELLO_VMAX = v; },
          50, 1500, undefined);
      }
      if (typeof JELLO_GRAVITY !== 'undefined') {
        gmRegisterLever('jello.JELLO_GRAVITY', 'jello', 'JELLO_GRAVITY',
          function () { return JELLO_GRAVITY; },
          function (v) { JELLO_GRAVITY = v; },
          0, 2000, undefined);
      }
      if (typeof JELLO_TIMESCALE !== 'undefined') {
        gmRegisterLever('jello.JELLO_TIMESCALE', 'jello', 'JELLO_TIMESCALE',
          function () { return JELLO_TIMESCALE; },
          function (v) { JELLO_TIMESCALE = v; },
          0.15, 1, undefined);  // <1 = slow-mo / massive feel
      }
      if (typeof JELLO_PLASTICITY !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLASTICITY', 'jello', 'JELLO_PLASTICITY',
          function () { return JELLO_PLASTICITY; },
          function (v) { JELLO_PLASTICITY = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_YIELD !== 'undefined') {
        gmRegisterLever('jello.JELLO_YIELD', 'jello', 'JELLO_YIELD',
          function () { return JELLO_YIELD; },
          function (v) { JELLO_YIELD = v; },
          0.01, 2.0, undefined);
      }
      if (typeof JELLO_HARDEN !== 'undefined') {
        gmRegisterLever('jello.JELLO_HARDEN', 'jello', 'JELLO_HARDEN',
          function () { return JELLO_HARDEN; },
          function (v) { JELLO_HARDEN = v; },
          0, 0.5, undefined);
      }
      if (typeof JELLO_SHEAR !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHEAR', 'jello', 'JELLO_SHEAR',
          function () { return JELLO_SHEAR; },
          function (v) { JELLO_SHEAR = v; },
          -0.5, 0.5, undefined);
      }
      if (typeof JELLO_SHEAR_CAP !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHEAR_CAP', 'jello', 'JELLO_SHEAR_CAP',
          function () { return JELLO_SHEAR_CAP; },
          function (v) { JELLO_SHEAR_CAP = v; },
          0.5, 10, undefined);
      }
      if (typeof JELLO_PLAYER_EJECT !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLAYER_EJECT', 'jello', 'JELLO_PLAYER_EJECT',
          function () { return JELLO_PLAYER_EJECT; },
          function (v) { JELLO_PLAYER_EJECT = v; },
          0, 600, undefined);
      }
      if (typeof JELLO_TRACTION !== 'undefined') {
        gmRegisterLever('jello.JELLO_TRACTION', 'jello', 'JELLO_TRACTION',
          function () { return JELLO_TRACTION; },
          function (v) { JELLO_TRACTION = v; },
          0, 2, undefined);
      }
      if (typeof JELLO_FLING !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLING', 'jello', 'JELLO_FLING',
          function () { return JELLO_FLING; },
          function (v) { JELLO_FLING = v; },
          0, 3, undefined);   // fraction of rig speed the blob is flung at (drive-into launch)
      }
      if (typeof JELLO_FLING_SPIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLING_SPIN', 'jello', 'JELLO_FLING_SPIN',
          function () { return JELLO_FLING_SPIN; },
          function (v) { JELLO_FLING_SPIN = v; },
          0, 1, undefined);   // fling height-gradient: rammed bodies tumble off (0 = uniform launch)
      }
      if (typeof JELLO_FLING_LOFT !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLING_LOFT', 'jello', 'JELLO_FLING_LOFT',
          function () { return JELLO_FLING_LOFT; },
          function (v) { JELLO_FLING_LOFT = v; },
          0, 0.8, undefined); // upward tilt of a horizontal fling (airborne = the spin survives)
      }
      if (typeof JELLO_FLING_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLING_MIN', 'jello', 'JELLO_FLING_MIN',
          function () { return JELLO_FLING_MIN; },
          function (v) { JELLO_FLING_MIN = v; },
          0, 400, undefined);   // min rig speed to trigger a fling (px/s)
      }
      if (typeof JELLO_PUSH !== 'undefined') {
        gmRegisterLever('jello.JELLO_PUSH', 'jello', 'JELLO_PUSH',
          function () { return JELLO_PUSH; },
          function (v) { JELLO_PUSH = v; },
          0, 1.2, undefined);   // walk-speed bulldoze: fraction of rig speed the body is driven toward
      }
      if (typeof JELLO_PUSH_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_PUSH_MIN', 'jello', 'JELLO_PUSH_MIN',
          function () { return JELLO_PUSH_MIN; },
          function (v) { JELLO_PUSH_MIN = v; },
          0, 100, undefined);   // min rig speed for a contact to count as a push (px/s)
      }
      if (typeof JELLO_PUSH_ACCEL !== 'undefined') {
        gmRegisterLever('jello.JELLO_PUSH_ACCEL', 'jello', 'JELLO_PUSH_ACCEL',
          function () { return JELLO_PUSH_ACCEL; },
          function (v) { JELLO_PUSH_ACCEL = v; },
          100, 3000, undefined); // drive rate at 2-tile reference mass (px/s^2)
      }
      if (typeof JELLO_GAP_BLOCK !== 'undefined') {
        gmRegisterLever('jello.JELLO_GAP_BLOCK', 'jello', 'JELLO_GAP_BLOCK',
          function () { return JELLO_GAP_BLOCK; },
          function (v) { JELLO_GAP_BLOCK = Math.round(v); },
          0, 1, 1);   // 1 = block squeezing through 1-tile cracks (floppy-preserving), 0 = off
      }
      if (typeof JELLO_CONTACT !== 'undefined') {
        gmRegisterLever('jello.JELLO_CONTACT', 'jello', 'JELLO_CONTACT',
          function () { return JELLO_CONTACT; },
          function (v) { JELLO_CONTACT = Math.round(v); },
          0, 1, 1);   // unified per-particle contact master toggle
        gmRegisterLever('jello.JELLO_CONTACT_DAMP', 'jello', 'JELLO_CONTACT_DAMP',
          function () { return JELLO_CONTACT_DAMP; },
          function (v) { JELLO_CONTACT_DAMP = v; },
          0, 1, 0.9);   // inelasticity: bleed of the approach velocity (1 = no bounce, settles hard)
        gmRegisterLever('jello.JELLO_CONTACT_FRICTION', 'jello', 'JELLO_CONTACT_FRICTION',
          function () { return JELLO_CONTACT_FRICTION; },
          function (v) { JELLO_CONTACT_FRICTION = v; },
          0, 1.5, 0.6);   // contact friction (holds a pressed pile from slumping into mush)
        gmRegisterLever('jello.JELLO_CONTACT_R_FRAC', 'jello', 'JELLO_CONTACT_R_FRAC',
          function () { return JELLO_CONTACT_R_FRAC; },
          function (v) { JELLO_CONTACT_R_FRAC = v; },
          0.2, 0.9, 0.5);   // particle radius / lattice spacing; 2r = the gap kept between blobs
        gmRegisterLever('jello.JELLO_CONTACT_SELF', 'jello', 'JELLO_CONTACT_SELF',
          function () { return JELLO_CONTACT_SELF; },
          function (v) { JELLO_CONTACT_SELF = Math.round(v); },
          0, 1, 1);   // self-collision (a body can't fold through itself)
        gmRegisterLever('jello.JELLO_SELF_MIN_REST', 'jello', 'JELLO_SELF_MIN_REST',
          function () { return JELLO_SELF_MIN_REST; },
          function (v) { JELLO_SELF_MIN_REST = v; },
          1, 5, 2.5);   // min rest distance (in lattice spacings) for self-collision; lower = stricter
      }
      if (typeof JELLO_XSPH !== 'undefined') {
        gmRegisterLever('jello.JELLO_XSPH', 'jello', 'JELLO_XSPH',
          function () { return JELLO_XSPH; },
          function (v) { JELLO_XSPH = v; },
          0, 1, 0.2);   // XSPH viscosity: ooze + pile-settle damping (0 = springy, 0.5+ = goo)
      }
      if (typeof JELLO_RENDER_OUTSET !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_OUTSET', 'jello', 'JELLO_RENDER_OUTSET',
          function () { return JELLO_RENDER_OUTSET; },
          function (v) { JELLO_RENDER_OUTSET = v; },
          0, 2, 1.0);   // draw surface outward by this * particle radius (1 = touching, 0 = gappy)
      }
      if (typeof JELLO_CONTACT_ITERS !== 'undefined') {
        gmRegisterLever('jello.JELLO_CONTACT_ITERS', 'jello', 'JELLO_CONTACT_ITERS',
          function () { return JELLO_CONTACT_ITERS; },
          function (v) { JELLO_CONTACT_ITERS = Math.max(1, Math.round(v)); },
          1, 6, 3);   // contact solve passes per substep (more = firmer separation, no conjoin)
      }
      if (typeof JELLO_STATIC_CREEP !== 'undefined') {
        gmRegisterLever('jello.JELLO_STATIC_CREEP', 'jello', 'JELLO_STATIC_CREEP',
          function () { return JELLO_STATIC_CREEP; },
          function (v) { JELLO_STATIC_CREEP = v; },
          0, 0.9, 0.3);   // tangential velocity KEPT in the static-friction regime; lets a pressed touching row creep apart and settle (0 = the old exact stick = touching rows never sleep)
      }
      if (typeof JELLO_CONTACT_CONTAIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_CONTACT_CONTAIN', 'jello', 'JELLO_CONTACT_CONTAIN',
          function () { return JELLO_CONTACT_CONTAIN; },
          function (v) { JELLO_CONTACT_CONTAIN = Math.round(v); },
          0, 1, 1);   // boundary-containment backstop: guarantees no ring sits inside another (anti-conjoin)
      }
      if (typeof JELLO_MAX_STRETCH !== 'undefined') {
        gmRegisterLever('jello.JELLO_MAX_STRETCH', 'jello', 'JELLO_MAX_STRETCH',
          function () { return JELLO_MAX_STRETCH; },
          function (v) { JELLO_MAX_STRETCH = v; },
          1, 4, undefined);   // max edge stretch (anti-extrude). lower = can't squeeze through gaps; 0 = off
      }
      if (typeof JELLO_SOLVER !== 'undefined') {
        gmRegisterLever('jello.JELLO_SOLVER_ID', 'jello', 'JELLO_SOLVER_ID',
          function () { return JELLO_SOLVERS.indexOf(JELLO_SOLVER); },
          function (v) { var i = Math.max(0, Math.min(JELLO_SOLVERS.length - 1, Math.round(v))); JELLO_SOLVER = JELLO_SOLVERS[i]; },
          0, 2, 1);   // 0=pbd (jello-v1), 1=xpbd, 2=fem  (also the 'M' dev hotkey)
      }
      if (typeof JELLO_XPBD_SUBSTEPS !== 'undefined') {
        gmRegisterLever('jello.JELLO_XPBD_SUBSTEPS', 'jello', 'JELLO_XPBD_SUBSTEPS',
          function () { return JELLO_XPBD_SUBSTEPS; },
          function (v) { JELLO_XPBD_SUBSTEPS = Math.max(1, Math.round(v)); },
          1, 20, 1);   // small-steps refinement for xpbd/fem (more = stiffer-capable, costlier)
      }
      if (typeof JELLO_XPBD_SHAPE !== 'undefined') {
        gmRegisterLever('jello.JELLO_XPBD_SHAPE', 'jello', 'JELLO_XPBD_SHAPE',
          function () { return JELLO_XPBD_SHAPE; },
          function (v) { JELLO_XPBD_SHAPE = v; },
          0, 0.5, undefined);   // per-substep square-shape memory: 0 = floppy hooks, ~0.09 = floppy + coherent, 0.2+ = firm
      }
      if (typeof JELLO_INT_DAMP !== 'undefined') {
        gmRegisterLever('jello.JELLO_INT_DAMP', 'jello', 'JELLO_INT_DAMP',
          function () { return JELLO_INT_DAMP; },
          function (v) { JELLO_INT_DAMP = Math.max(0, v); },
          0, 150, 1);   // internal wobble decay rate (1/s): 0 = ring forever, 30 = settle, 80+ = snap
      }
      // XPBD/FEM compliances (inverse stiffness). Normally driven by JELLO_E in
      // jelloRecomputeMaterial (so E remains the master firmness knob); exposed here for
      // direct per-constraint tuning during the solver exploration. Setting E/NU resets them.
      if (typeof JELLO_XPBD_COMPLIANCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_XPBD_COMPLIANCE', 'jello', 'JELLO_XPBD_COMPLIANCE',
          function () { return JELLO_XPBD_COMPLIANCE; },
          function (v) { JELLO_XPBD_COMPLIANCE = v; },
          0, 4e-3, undefined);   // xpbd structural edges (0 = rigid)
      }
      if (typeof JELLO_XPBD_SHEAR_COMPLIANCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_XPBD_SHEAR_COMPLIANCE', 'jello', 'JELLO_XPBD_SHEAR_COMPLIANCE',
          function () { return JELLO_XPBD_SHEAR_COMPLIANCE; },
          function (v) { JELLO_XPBD_SHEAR_COMPLIANCE = v; },
          0, 8e-3, undefined);   // xpbd shear diagonals
      }
      if (typeof JELLO_XPBD_VOL_COMPLIANCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_XPBD_VOL_COMPLIANCE', 'jello', 'JELLO_XPBD_VOL_COMPLIANCE',
          function () { return JELLO_XPBD_VOL_COMPLIANCE; },
          function (v) { JELLO_XPBD_VOL_COMPLIANCE = v; },
          0, 4e-3, undefined);   // xpbd gas/volume
      }
      if (typeof JELLO_FEM_DEV_COMPLIANCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_FEM_DEV_COMPLIANCE', 'jello', 'JELLO_FEM_DEV_COMPLIANCE',
          function () { return JELLO_FEM_DEV_COMPLIANCE; },
          function (v) { JELLO_FEM_DEV_COMPLIANCE = v; },
          0, 0.1, undefined);    // fem deviatoric (distortion) per unit area
      }
      if (typeof JELLO_FEM_VOL_COMPLIANCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_FEM_VOL_COMPLIANCE', 'jello', 'JELLO_FEM_VOL_COMPLIANCE',
          function () { return JELLO_FEM_VOL_COMPLIANCE; },
          function (v) { JELLO_FEM_VOL_COMPLIANCE = v; },
          0, 0.1, undefined);    // fem hydrostatic (volume) per unit area
      }
      if (typeof JELLO_GROUND_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_GROUND_MIN', 'jello', 'JELLO_GROUND_MIN',
          function () { return JELLO_GROUND_MIN; },
          function (v) { JELLO_GROUND_MIN = v; },
          0.1, 5, undefined);
      }
      if (typeof JELLO_GROUND_GRIP !== 'undefined') {
        gmRegisterLever('jello.JELLO_GROUND_GRIP', 'jello', 'JELLO_GROUND_GRIP',
          function () { return JELLO_GROUND_GRIP; },
          function (v) { JELLO_GROUND_GRIP = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_SINK !== 'undefined') {
        gmRegisterLever('jello.JELLO_SINK', 'jello', 'JELLO_SINK',
          function () { return JELLO_SINK; },
          function (v) { JELLO_SINK = v; },
          0, 60, undefined);   // bowl depth (px the rig sinks below the surrounding surface)
      }
      if (typeof JELLO_BOWL !== 'undefined') {
        gmRegisterLever('jello.JELLO_BOWL', 'jello', 'JELLO_BOWL',
          function () { return JELLO_BOWL; },
          function (v) { JELLO_BOWL = v; },
          0, 1, undefined);    // how fast the bowl walls conform (visual bowl shape)
      }
      if (typeof JELLO_LAND_SPRING !== 'undefined') {
        gmRegisterLever('jello.JELLO_LAND_SPRING', 'jello', 'JELLO_LAND_SPRING',
          function () { return JELLO_LAND_SPRING; },
          function (v) { JELLO_LAND_SPRING = v; },
          10, 400, undefined);  // slime catch stiffness (low = deeper/softer sink, high = shallow/stiff)
      }
      if (typeof JELLO_RIDE_SINK !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIDE_SINK', 'jello', 'JELLO_RIDE_SINK',
          function () { return JELLO_RIDE_SINK; },
          function (v) { JELLO_RIDE_SINK = v; },
          0, 24, 1);            // px the resting rig beds INTO the gel (0 = perch on top, v24.124)
      }
      if (typeof JELLO_FLOOR_FRICTION !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLOOR_FRICTION', 'jello', 'JELLO_FLOOR_FRICTION',
          function () { return JELLO_FLOOR_FRICTION; },
          function (v) { JELLO_FLOOR_FRICTION = v; },
          0.5, 1, undefined);   // tangential velocity kept on floor contact (lower = stickier base = tips/rolls)
      }
      if (typeof JELLO_LAND_DAMP !== 'undefined') {
        gmRegisterLever('jello.JELLO_LAND_DAMP', 'jello', 'JELLO_LAND_DAMP',
          function () { return JELLO_LAND_DAMP; },
          function (v) { JELLO_LAND_DAMP = v; },
          0, 20, undefined);    // fall absorption (higher = less bounce)
      }
      if (typeof JELLO_RIDE_SMOOTH !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIDE_SMOOTH', 'jello', 'JELLO_RIDE_SMOOTH',
          function () { return JELLO_RIDE_SMOOTH; },
          function (v) { JELLO_RIDE_SMOOTH = v; },
          0.02, 1, undefined);   // low = buttery suspension, high = tracks every jiggle
      }
      if (typeof JELLO_CARRY !== 'undefined') {
        gmRegisterLever('jello.JELLO_CARRY', 'jello', 'JELLO_CARRY',
          function () { return JELLO_CARRY; },
          function (v) { JELLO_CARRY = v; },
          0, 1, undefined);   // ride a moving blob's horizontal motion (Celeste carry)
      }
      if (typeof JELLO_CARRY_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_CARRY_MIN', 'jello', 'JELLO_CARRY_MIN',
          function () { return JELLO_CARRY_MIN; },
          function (v) { JELLO_CARRY_MIN = v; },
          0, 300, undefined);   // min blob speed (px/s) to ride — deadzones out settling jiggle
      }
      if (typeof JELLO_TRAMPOLINE !== 'undefined') {
        gmRegisterLever('jello.JELLO_TRAMPOLINE', 'jello', 'JELLO_TRAMPOLINE',
          function () { return JELLO_TRAMPOLINE; },
          function (v) { JELLO_TRAMPOLINE = v; },
          0, 1, undefined);   // trampoline restitution on a slam (0 = pure cushion)
      }
      if (typeof JELLO_BOUNCE_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_BOUNCE_MIN', 'jello', 'JELLO_BOUNCE_MIN',
          function () { return JELLO_BOUNCE_MIN; },
          function (v) { JELLO_BOUNCE_MIN = v; },
          0, 600, undefined);   // min impact speed (px/s) for a landing to bounce
      }
      if (typeof FALL_IMPACT_FX !== 'undefined') {
        gmRegisterLever('jello.FALL_IMPACT_FX', 'jello', 'FALL_IMPACT_FX',
          function () { return FALL_IMPACT_FX ? 1 : 0; },
          function (v) { FALL_IMPACT_FX = !!v; },
          0, 1, 1);   // hard-landing FX (fall damage / squash / flash / hit-pause freeze): OFF for testing
      }
      if (typeof JELLO_TRACK_SHEAR !== 'undefined') {
        gmRegisterLever('jello.JELLO_TRACK_SHEAR', 'jello', 'JELLO_TRACK_SHEAR',
          function () { return JELLO_TRACK_SHEAR; },
          function (v) { JELLO_TRACK_SHEAR = v; },
          0, 2, undefined);
      }
      if (typeof JELLO_SUPPORT !== 'undefined') {
        gmRegisterLever('jello.JELLO_SUPPORT', 'jello', 'JELLO_SUPPORT',
          function () { return JELLO_SUPPORT; },
          function (v) { JELLO_SUPPORT = v; },
          0, 20, undefined);
      }
      if (typeof JELLO_PLAYER_BLOCK !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLAYER_BLOCK', 'jello', 'JELLO_PLAYER_BLOCK',
          function () { return JELLO_PLAYER_BLOCK; },
          function (v) { JELLO_PLAYER_BLOCK = v; },
          0, 1, undefined);
      }
      // (JELLO_PUSH is registered ONCE, in the drive/fling block far above: it is the
      // v24.151 walk-speed bulldoze lever. The legacy "ramming slides the whole cube"
      // registration that lived here clobbered that one's range + default — and its
      // legacy `var` in 340 clobbered the VALUE (1.05 -> 0.7, under the >=1 floor the
      // push tier documents). Both removed in the duplicate-var sweep. Don't re-add.)
      if (typeof JELLO_VISCOSITY !== 'undefined') {
        gmRegisterLever('jello.JELLO_VISCOSITY', 'jello', 'JELLO_VISCOSITY',
          function () { return JELLO_VISCOSITY; },
          function (v) { JELLO_VISCOSITY = v; },
          0, 12, undefined);    // the soft catch — how much into-gel motion bleeds on contact
      }
      // (JELLO_CONTACT is registered ONCE, in the per-particle contact block far above:
      // it is the 0/1 contact master toggle. The 0.05..1 "memory-foam ease-out" knob that
      // used to live here was superseded by the v24.94 containment levers (JELLO_EJECT_RATE /
      // JELLO_YIELD_RATE); re-registering it here clobbered the toggle. Don't re-add it.)
      if (typeof JELLO_REACT !== 'undefined') {
        gmRegisterLever('jello.JELLO_REACT', 'jello', 'JELLO_REACT',
          function () { return JELLO_REACT; },
          function (v) { JELLO_REACT = v; },
          0, 1500, undefined);  // force shoving the rig out once its centre crosses the ring
      }
      if (typeof JELLO_BARRIER !== 'undefined') {
        gmRegisterLever('jello.JELLO_BARRIER', 'jello', 'JELLO_BARRIER',
          function () { return JELLO_BARRIER; },
          function (v) { JELLO_BARRIER = v; },
          0, 12, undefined);    // px/frame hard ejection out of the closed ring (no tunneling)
      }
      if (typeof JELLO_CRADLE !== 'undefined') {
        gmRegisterLever('jello.JELLO_CRADLE', 'jello', 'JELLO_CRADLE',
          function () { return JELLO_CRADLE; },
          function (v) { JELLO_CRADLE = v; },
          0.05, 1, undefined);  // low = deep enveloping pocket, high = firmer/shallower wall
      }
      if (typeof JELLO_BUOYANCY !== 'undefined') {
        gmRegisterLever('jello.JELLO_BUOYANCY', 'jello', 'JELLO_BUOYANCY',
          function () { return JELLO_BUOYANCY; },
          function (v) { JELLO_BUOYANCY = v; },
          0, 1000, undefined);  // gentle push-out of a buried rig (low = slow feedback)
      }
      if (typeof JELLO_TOP_BAND !== 'undefined') {
        gmRegisterLever('jello.JELLO_TOP_BAND', 'jello', 'JELLO_TOP_BAND',
          function () { return JELLO_TOP_BAND; },
          function (v) { JELLO_TOP_BAND = v; },
          0, 200, undefined);   // depth below the surface still treated as "on top"
      }
      if (typeof JELLO_IMPACT !== 'undefined') {
        gmRegisterLever('jello.JELLO_IMPACT', 'jello', 'JELLO_IMPACT',
          function () { return JELLO_IMPACT; },
          function (v) { JELLO_IMPACT = v; },
          0, 2, undefined);     // how hard a fast collision dents the contact + splashes
      }
      if (typeof JELLO_PRESSURE !== 'undefined') {
        gmRegisterLever('jello.JELLO_PRESSURE', 'jello', 'JELLO_PRESSURE',
          function () { return JELLO_PRESSURE; },
          function (v) { JELLO_PRESSURE = v; },
          0, 1, undefined);     // trapped-gas stiffness (0 = no inflation/bounce)
      }
      if (typeof JELLO_INFLATE !== 'undefined') {
        gmRegisterLever('jello.JELLO_INFLATE', 'jello', 'JELLO_INFLATE',
          function () { return JELLO_INFLATE; },
          function (v) { JELLO_INFLATE = v; },
          0.8, 1.5, undefined); // target area vs rest (>1 = puffed taut)
      }
      if (typeof JELLO_AREA_FLOOR !== 'undefined') {
        gmRegisterLever('jello.JELLO_AREA_FLOOR', 'jello', 'JELLO_AREA_FLOOR',
          function () { return JELLO_AREA_FLOOR; },
          function (v) { JELLO_AREA_FLOOR = v; },
          0.3, 1, undefined);   // hard incompressibility floor (can't crush below this fraction of volume)
      }
      if (typeof JELLO_REST_DAMP !== 'undefined') {
        gmRegisterLever('jello.JELLO_REST_DAMP', 'jello', 'JELLO_REST_DAMP',
          function () { return JELLO_REST_DAMP; },
          function (v) { JELLO_REST_DAMP = v; },
          0, 0.8, undefined);   // settle the gel around a resting rig (higher = calmer, no joggle)
      }
      if (typeof JELLO_WEIGHT !== 'undefined') {
        gmRegisterLever('jello.JELLO_WEIGHT', 'jello', 'JELLO_WEIGHT',
          function () { return JELLO_WEIGHT; },
          function (v) { JELLO_WEIGHT = v; },
          0, 200, undefined);   // how much the rig sinks the membrane it stands on
      }
      if (typeof JELLO_PLAYER_CARRY !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLAYER_CARRY', 'jello', 'JELLO_PLAYER_CARRY',
          function () { return JELLO_PLAYER_CARRY; },
          function (v) { JELLO_PLAYER_CARRY = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_JET_PUSH !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_PUSH', 'jello', 'JELLO_JET_PUSH',
          function () { return JELLO_JET_PUSH; },
          function (v) { JELLO_JET_PUSH = v; },
          0, 600, undefined);
      }
      if (typeof JELLO_JET_REACT !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_REACT', 'jello', 'JELLO_JET_REACT',
          function () { return JELLO_JET_REACT; },
          function (v) { JELLO_JET_REACT = v; },
          0, 2.5, undefined);
      }
      if (typeof JELLO_JET_REACT_CAP !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_REACT_CAP', 'jello', 'JELLO_JET_REACT_CAP',
          function () { return JELLO_JET_REACT_CAP; },
          function (v) { JELLO_JET_REACT_CAP = v; },
          0, 3, undefined);
      }
      // ---- v24.94 collision-overhaul levers ----
      if (typeof JELLO_REST_VEL !== 'undefined') {
        gmRegisterLever('jello.JELLO_REST_VEL', 'jello', 'JELLO_REST_VEL',
          function () { return JELLO_REST_VEL; },
          function (v) { JELLO_REST_VEL = v; },
          0, 200, undefined);   // restitution threshold (px/s): slower contacts don't bounce (anti rest-buzz)
      }
      if (typeof JELLO_EJECT_RATE !== 'undefined') {
        gmRegisterLever('jello.JELLO_EJECT_RATE', 'jello', 'JELLO_EJECT_RATE',
          function () { return JELLO_EJECT_RATE; },
          function (v) { JELLO_EJECT_RATE = v; },
          60, 1200, undefined);   // px/s the hard containment may move the rig (anti teleport-pop)
      }
      if (typeof JELLO_ENGULF_CAP !== 'undefined') {
        gmRegisterLever('jello.JELLO_ENGULF_CAP', 'jello', 'JELLO_ENGULF_CAP',
          function () { return JELLO_ENGULF_CAP; },
          function (v) { JELLO_ENGULF_CAP = v; },
          1, 20, 1);   // px of gel allowed inside the hull (the dent); past it gel is displaced out
      }
      if (typeof JELLO_UNMERGE_RATE !== 'undefined') {
        gmRegisterLever('jello.JELLO_UNMERGE_RATE', 'jello', 'JELLO_UNMERGE_RATE',
          function () { return JELLO_UNMERGE_RATE; },
          function (v) { JELLO_UNMERGE_RATE = v; },
          0, 300, undefined);   // px/s a merged pair (centroid inside the other ring) is pulled apart
      }
      if (typeof JELLO_CROWD_CALM !== 'undefined') {
        gmRegisterLever('jello.JELLO_CROWD_CALM', 'jello', 'JELLO_CROWD_CALM',
          function () { return JELLO_CROWD_CALM; },
          function (v) { JELLO_CROWD_CALM = v; },
          0, 0.5, undefined);   // velocity drained per frame while crowd-pressed (overfilled pocket sits still)
      }
      if (typeof JELLO_EJECT_SNAP !== 'undefined') {
        gmRegisterLever('jello.JELLO_EJECT_SNAP', 'jello', 'JELLO_EJECT_SNAP',
          function () { return JELLO_EJECT_SNAP; },
          function (v) { JELLO_EJECT_SNAP = v; },
          0, 30, undefined);   // px overlap resolved instantly (shallow grazes stay crisp)
      }
      if (typeof JELLO_YIELD_RATE !== 'undefined') {
        gmRegisterLever('jello.JELLO_YIELD_RATE', 'jello', 'JELLO_YIELD_RATE',
          function () { return JELLO_YIELD_RATE; },
          function (v) { JELLO_YIELD_RATE = v; },
          0, 800, undefined);   // px/s the blob's gel squeezes out of the rig's space on deep overlap
      }
      if (typeof JELLO_RIG_PUSH !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIG_PUSH', 'jello', 'JELLO_RIG_PUSH',
          function () { return JELLO_RIG_PUSH; },
          function (v) { JELLO_RIG_PUSH = v; },
          0, 1, undefined);   // two-way coupling: fraction of a blob's approach speed handed to the rig
      }
      if (typeof JELLO_MASS_RATIO !== 'undefined') {
        gmRegisterLever('jello.JELLO_MASS_RATIO', 'jello', 'JELLO_MASS_RATIO',
          function () { return JELLO_MASS_RATIO; },
          function (v) { JELLO_MASS_RATIO = v; },
          0, 4, undefined);   // per-tile blob:rig mass ratio for the momentum exchange
      }
      if (typeof JELLO_GAP_FIT !== 'undefined') {
        gmRegisterLever('jello.JELLO_GAP_FIT', 'jello', 'JELLO_GAP_FIT',
          function () { return JELLO_GAP_FIT; },
          function (v) { JELLO_GAP_FIT = v ? 1 : 0; },
          0, 1, 1);   // 1 = a 1-tile body may slot into a 1-wide channel (tetris fit)
      }
      if (typeof JELLO_GAP_FIT_DRIVE !== 'undefined') {
        gmRegisterLever('jello.JELLO_GAP_FIT_DRIVE', 'jello', 'JELLO_GAP_FIT_DRIVE',
          function () { return JELLO_GAP_FIT_DRIVE; },
          function (v) { JELLO_GAP_FIT_DRIVE = v; },
          0, 400, undefined);   // down px/s for a 1-wide body to fit an OPEN shaft (else held; lower = fits easier)
      }
      if (typeof JELLO_PERCH !== 'undefined') {
        gmRegisterLever('jello.JELLO_PERCH', 'jello', 'JELLO_PERCH',
          function () { return JELLO_PERCH; },
          function (v) { JELLO_PERCH = v ? 1 : 0; },
          0, 1, 1);   // 1 = hold a resting body undermined by digging (anti-drain); 0 = free-fall
      }
      if (typeof JELLO_PERCH_RELEASE !== 'undefined') {
        gmRegisterLever('jello.JELLO_PERCH_RELEASE', 'jello', 'JELLO_PERCH_RELEASE',
          function () { return JELLO_PERCH_RELEASE; },
          function (v) { JELLO_PERCH_RELEASE = v; },
          0, 400, undefined);   // real px/s above which a body is "driven" (pushed/dropped) and never perch-held
      }
      if (typeof JELLO_PERCH_SLOW !== 'undefined') {
        gmRegisterLever('jello.JELLO_PERCH_SLOW', 'jello', 'JELLO_PERCH_SLOW',
          function () { return JELLO_PERCH_SLOW; },
          function (v) { JELLO_PERCH_SLOW = v; },
          0, 400, undefined);   // real px/s at/below which a supported body records its perch altitude
      }
      if (typeof JELLO_JET_LEN !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_LEN', 'jello', 'JELLO_JET_LEN',
          function () { return JELLO_JET_LEN; },
          function (v) { JELLO_JET_LEN = v; },
          TILE, TILE * 8, undefined);   // axial reach of the thrust-aligned jet cone
      }
      if (typeof JELLO_JET_R0 !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_R0', 'jello', 'JELLO_JET_R0',
          function () { return JELLO_JET_R0; },
          function (v) { JELLO_JET_R0 = v; },
          2, 24, undefined);   // cone radius at the nozzle (px)
      }
      if (typeof JELLO_JET_TAN !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_TAN', 'jello', 'JELLO_JET_TAN',
          function () { return JELLO_JET_TAN; },
          function (v) { JELLO_JET_TAN = v; },
          0.1, 1.2, undefined);   // tan(cone half-angle)
      }
      if (typeof JELLO_JET_NEAR !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_NEAR', 'jello', 'JELLO_JET_NEAR',
          function () { return JELLO_JET_NEAR; },
          function (v) { JELLO_JET_NEAR = v; },
          0, TILE * 3, undefined);   // axial distance where crater fades into the far-field velocity push
      }
      // ----- Physics-anchored shading (v24.96) -----
      // JELLO_SHADE = 0 restores the legacy bbox/timer lighting exactly.
      if (typeof JELLO_SHADE !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHADE', 'jello', 'JELLO_SHADE',
          function () { return JELLO_SHADE; },
          function (v) { JELLO_SHADE = Math.round(v); },
          0, 1, 1);   // master: 0 = legacy shading, 1 = lighting anchored to the solver
        gmRegisterLever('jello.JELLO_SHADE_LAG', 'jello', 'JELLO_SHADE_LAG',
          function () { return JELLO_SHADE_LAG; },
          function (v) { JELLO_SHADE_LAG = v; },
          0.02, 1, undefined);   // glint follower ease/frame (low = long liquid trail)
        gmRegisterLever('jello.JELLO_SHADE_CAUSTIC', 'jello', 'JELLO_SHADE_CAUSTIC',
          function () { return JELLO_SHADE_CAUSTIC; },
          function (v) { JELLO_SHADE_CAUSTIC = v; },
          0, 25, undefined);     // caustic slide per px of anchor deformation
        gmRegisterLever('jello.JELLO_SHADE_STRAIN', 'jello', 'JELLO_SHADE_STRAIN',
          function () { return JELLO_SHADE_STRAIN; },
          function (v) { JELLO_SHADE_STRAIN = v; },
          0, 1, undefined);      // strain hotspot strength (0 = off)
        gmRegisterLever('jello.JELLO_SHADE_STRAIN_K', 'jello', 'JELLO_SHADE_STRAIN_K',
          function () { return JELLO_SHADE_STRAIN_K; },
          function (v) { JELLO_SHADE_STRAIN_K = Math.round(v); },
          0, 4, 1);              // max hotspots per body
        gmRegisterLever('jello.JELLO_SHADE_SQUASH', 'jello', 'JELLO_SHADE_SQUASH',
          function () { return JELLO_SHADE_SQUASH; },
          function (v) { JELLO_SHADE_SQUASH = v; },
          0, 1, undefined);      // sheen ellipse squash-stretch follow
      }
      // ----- Impact ripples (v24.95): render-space ring wave on the drawn skin -----
      if (typeof JELLO_RIPPLE !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIPPLE', 'jello', 'JELLO_RIPPLE',
          function () { return JELLO_RIPPLE; },
          function (v) { JELLO_RIPPLE = v; },
          0, 1, undefined);   // master: 0 = exactly today's render
      }
      if (typeof JELLO_RIPPLE_SPEED !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIPPLE_SPEED', 'jello', 'JELLO_RIPPLE_SPEED',
          function () { return JELLO_RIPPLE_SPEED; },
          function (v) { JELLO_RIPPLE_SPEED = v; },
          60, 640, undefined);   // px/s along the skin (CFL-clamped internally, always stable)
      }
      if (typeof JELLO_RIPPLE_DAMP !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIPPLE_DAMP', 'jello', 'JELLO_RIPPLE_DAMP',
          function () { return JELLO_RIPPLE_DAMP; },
          function (v) { JELLO_RIPPLE_DAMP = v; },
          0.001, 0.6, undefined);   // per-second wave-velocity retention (higher = longer ring)
      }
      if (typeof JELLO_RIPPLE_TTL !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIPPLE_TTL', 'jello', 'JELLO_RIPPLE_TTL',
          function () { return JELLO_RIPPLE_TTL; },
          function (v) { JELLO_RIPPLE_TTL = v; },
          0.5, 10, 3);   // ripple watchdog: max continuous ring seconds before force-clear (anti balloon-freeze)
      }
      if (typeof JELLO_RIPPLE_MAX !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIPPLE_MAX', 'jello', 'JELLO_RIPPLE_MAX',
          function () { return JELLO_RIPPLE_MAX; },
          function (v) { JELLO_RIPPLE_MAX = v; },
          0, 10, undefined);   // px amplitude cap (also capped at outset + 0.35r — never inverts)
      }
      if (typeof JELLO_JET_VEL !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_VEL', 'jello', 'JELLO_JET_VEL',
          function () { return JELLO_JET_VEL; },
          function (v) { JELLO_JET_VEL = v; },
          0, 2400, undefined);   // far-field jet momentum feed
      }
      if (typeof JELLO_BOUNCE !== 'undefined') {
        gmRegisterLever('jello.JELLO_BOUNCE', 'jello', 'JELLO_BOUNCE',
          function () { return JELLO_BOUNCE; },
          function (v) { JELLO_BOUNCE = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_FLOOR_FRICTION !== 'undefined') {
        gmRegisterLever('jello.JELLO_FLOOR_FRICTION', 'jello', 'JELLO_FLOOR_FRICTION',
          function () { return JELLO_FLOOR_FRICTION; },
          function (v) { JELLO_FLOOR_FRICTION = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_ISO !== 'undefined') {
        gmRegisterLever('jello.JELLO_ISO', 'jello', 'JELLO_ISO',
          function () { return JELLO_ISO; },
          function (v) { JELLO_ISO = v; },
          0.1, 1.0, undefined);
      }
      if (typeof JELLO_RENDER_ALPHA !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_ALPHA', 'jello', 'JELLO_RENDER_ALPHA',
          function () { return JELLO_RENDER_ALPHA; },
          function (v) { JELLO_RENDER_ALPHA = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_RIM !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIM', 'jello', 'JELLO_RIM',
          function () { return JELLO_RIM; },
          function (v) { JELLO_RIM = v; },
          0, 1, undefined);   // Fresnel rim strokes (ships 0 since v24.121 — owner-vetoed outline)
      }
      if (typeof JELLO_RENDER_SMOOTH !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_SMOOTH', 'jello', 'JELLO_RENDER_SMOOTH',
          function () { return JELLO_RENDER_SMOOTH; },
          function (v) { JELLO_RENDER_SMOOTH = v; },
          0, 1, 1);           // outline curve smoothing (ships 0 since v24.121 — sharp corners)
      }
      if (typeof JELLO_EDGE_STYLE !== 'undefined') {
        gmRegisterLever('jello.JELLO_EDGE_STYLE', 'jello', 'JELLO_EDGE_STYLE',
          function () { return JELLO_EDGE_STYLE; },
          function (v) { JELLO_EDGE_STYLE = v < 0 ? 0 : (v > 3 ? 3 : Math.round(v)); },
          0, 3, 1);           // 0 classic, 1 soft fringe, 2 fuzzy (ships), 3 plush — dev 'I' cycles
      }
      if (typeof JELLO_EDGE_FUZZ !== 'undefined') {
        gmRegisterLever('jello.JELLO_EDGE_FUZZ', 'jello', 'JELLO_EDGE_FUZZ',
          function () { return JELLO_EDGE_FUZZ; },
          function (v) { JELLO_EDGE_FUZZ = v; },
          0, 2, undefined);   // fringe + hair scale (v25.27 edge treatment)
      }
      if (typeof JELLO_GLOSS !== 'undefined') {
        gmRegisterLever('jello.JELLO_GLOSS', 'jello', 'JELLO_GLOSS',
          function () { return JELLO_GLOSS; },
          function (v) { JELLO_GLOSS = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_REFRACT !== 'undefined') {
        gmRegisterLever('jello.JELLO_REFRACT', 'jello', 'JELLO_REFRACT',
          function () { return JELLO_REFRACT; },
          function (v) { JELLO_REFRACT = v; },
          0, 0.5, undefined);   // glass lens magnification of the backdrop (0 = off)
      }
      if (typeof JELLO_SHIMMER !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHIMMER', 'jello', 'JELLO_SHIMMER',
          function () { return JELLO_SHIMMER; },
          function (v) { JELLO_SHIMMER = v; },
          0, 1, undefined);
      }
      if (typeof JELLO_METABALL_RADIUS !== 'undefined') {
        gmRegisterLever('jello.JELLO_METABALL_RADIUS', 'jello', 'JELLO_METABALL_RADIUS',
          function () { return JELLO_METABALL_RADIUS; },
          function (v) { JELLO_METABALL_RADIUS = v; },
          4, 24, undefined);
      }
      if (typeof JELLO_RENDER_CELL !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_CELL', 'jello', 'JELLO_RENDER_CELL',
          function () { return JELLO_RENDER_CELL; },
          function (v) { JELLO_RENDER_CELL = v; },
          3, 12, undefined);
      }
      if (typeof JELLO_DEBUG_PARTICLES !== 'undefined') {
        gmRegisterLever('jello.JELLO_DEBUG_PARTICLES', 'jello', 'JELLO_DEBUG_PARTICLES',
          function () { return JELLO_DEBUG_PARTICLES; },
          function (v) { JELLO_DEBUG_PARTICLES = v; },
          0, 1, undefined);
      }

      // ----- Shape-matching feel knobs (v17.97) -----
      // The new lattice soft-body model. JELLO_E (above) auto-derives the three
      // stiffnesses; these let the owner override each independently and tune
      // the squish/spring-back/edge-crispness directly.
      if (typeof JELLO_SHAPE_BETA !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHAPE_BETA', 'jello', 'JELLO_SHAPE_BETA',
          function () { return JELLO_SHAPE_BETA; },
          function (v) { JELLO_SHAPE_BETA = v; },
          0, 1, undefined);   // 0 = hard spring-back to a perfect square, 1 = floppy
      }
      if (typeof JELLO_SHAPE_STIFF !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHAPE_STIFF', 'jello', 'JELLO_SHAPE_STIFF',
          function () { return JELLO_SHAPE_STIFF; },
          function (v) { JELLO_SHAPE_STIFF = v; },
          0, 1, undefined);   // global shape-match pull per iteration
      }
      if (typeof JELLO_SPRING !== 'undefined') {
        gmRegisterLever('jello.JELLO_SPRING', 'jello', 'JELLO_SPRING',
          function () { return JELLO_SPRING; },
          function (v) { JELLO_SPRING = v; },
          0, 1, undefined);   // structural (edge) spring stiffness
      }
      if (typeof JELLO_SHEAR_SPRING !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHEAR_SPRING', 'jello', 'JELLO_SHEAR_SPRING',
          function () { return JELLO_SHEAR_SPRING; },
          function (v) { JELLO_SHEAR_SPRING = v; },
          0, 1, undefined);   // cell-diagonal (shear) spring stiffness
      }
      if (typeof JELLO_ITERS !== 'undefined') {
        gmRegisterLever('jello.JELLO_ITERS', 'jello', 'JELLO_ITERS',
          function () { return JELLO_ITERS; },
          function (v) { JELLO_ITERS = Math.max(1, Math.round(v)); },
          1, 10, undefined);  // constraint-solve iterations per substep (firmer at higher)
      }
      if (typeof JELLO_RENDER_SMOOTH !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_SMOOTH', 'jello', 'JELLO_RENDER_SMOOTH',
          function () { return JELLO_RENDER_SMOOTH; },
          function (v) { JELLO_RENDER_SMOOTH = v; },
          0, 1, undefined);   // 0 = crisp straight edges (tetris), 1 = fully smoothed
      }
      if (typeof JELLO_RIM !== 'undefined') {
        gmRegisterLever('jello.JELLO_RIM', 'jello', 'JELLO_RIM',
          function () { return JELLO_RIM; },
          function (v) { JELLO_RIM = v; },
          0, 1, undefined);   // crisp outline stroke alpha
      }
      // ----- v21.27: register the REMAINING JELLO_* tunables so the L panel covers every
      // live jello lever (player-contact + body-body + sleep/freeze + splat + build/perf +
      // render). Derived (MU/LAMBDA) and pure-alias (MAX_PARTICLES/PPT) vars are omitted on
      // purpose — drive those through JELLO_E/JELLO_NU and JELLO_MAX_POINTS/JELLO_NPT. -----
      if (typeof JELLO_PLOW !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLOW', 'jello', 'JELLO_PLOW',
          function () { return JELLO_PLOW; },
          function (v) { JELLO_PLOW = v; },
          0, 2, undefined);   // how hard the rig shoves gel it overlaps along its travel dir
      }
      if (typeof JELLO_PLOW_BASE !== 'undefined') {
        gmRegisterLever('jello.JELLO_PLOW_BASE', 'jello', 'JELLO_PLOW_BASE',
          function () { return JELLO_PLOW_BASE; },
          function (v) { JELLO_PLOW_BASE = v; },
          0, 1, undefined);   // plow bite kept at the ground line (1 = uniform push = slide, low = shear = tip/roll)
      }
      if (typeof JELLO_FOAM_DAMP !== 'undefined') {
        gmRegisterLever('jello.JELLO_FOAM_DAMP', 'jello', 'JELLO_FOAM_DAMP',
          function () { return JELLO_FOAM_DAMP; },
          function (v) { JELLO_FOAM_DAMP = v; },
          0, 0.9, undefined);   // along-axis velocity absorbed on side/underside contact (memory foam)
      }
      if (typeof JELLO_SIDE_SINK !== 'undefined') {
        gmRegisterLever('jello.JELLO_SIDE_SINK', 'jello', 'JELLO_SIDE_SINK',
          function () { return JELLO_SIDE_SINK; },
          function (v) { JELLO_SIDE_SINK = v; },
          0, 60, undefined);   // px the rig sinks into a blob's flank before the firm stop
      }
      if (typeof JELLO_WALL_FRICTION !== 'undefined') {
        gmRegisterLever('jello.JELLO_WALL_FRICTION', 'jello', 'JELLO_WALL_FRICTION',
          function () { return JELLO_WALL_FRICTION; },
          function (v) { JELLO_WALL_FRICTION = v; },
          0, 1, undefined);   // tangential velocity kept on wall contact
      }
      if (typeof JELLO_SLEEP_VSQ !== 'undefined') {
        gmRegisterLever('jello.JELLO_SLEEP_VSQ', 'jello', 'JELLO_SLEEP_VSQ',
          function () { return JELLO_SLEEP_VSQ; },
          function (v) { JELLO_SLEEP_VSQ = v; },
          0, 50, undefined);   // per-point speed^2 below which a body counts as still
      }
      if (typeof JELLO_SLEEP_FRAMES !== 'undefined') {
        gmRegisterLever('jello.JELLO_SLEEP_FRAMES', 'jello', 'JELLO_SLEEP_FRAMES',
          function () { return JELLO_SLEEP_FRAMES; },
          function (v) { JELLO_SLEEP_FRAMES = Math.max(1, Math.round(v)); },
          1, 300, 1);   // still frames before a body sleeps
      }
      if (typeof JELLO_ACTIVE_MARGIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_ACTIVE_MARGIN', 'jello', 'JELLO_ACTIVE_MARGIN',
          function () { return JELLO_ACTIVE_MARGIN; },
          function (v) { JELLO_ACTIVE_MARGIN = v; },
          0, 2, undefined);   // screen-fraction margin before an off-camera body freezes
      }
      if (typeof JELLO_SPLAT_GRAVITY !== 'undefined') {
        gmRegisterLever('jello.JELLO_SPLAT_GRAVITY', 'jello', 'JELLO_SPLAT_GRAVITY',
          function () { return JELLO_SPLAT_GRAVITY; },
          function (v) { JELLO_SPLAT_GRAVITY = v; },
          0, 2000, undefined);   // birth/impact splat particle gravity
      }
      if (typeof JELLO_RENDER_HUE !== 'undefined') {
        gmRegisterLever('jello.JELLO_RENDER_HUE', 'jello', 'JELLO_RENDER_HUE',
          function () { return JELLO_RENDER_HUE; },
          function (v) { JELLO_RENDER_HUE = v; },
          0, 360, 1);   // base gel hue (teal=158); applies to bodies built after the change
      }
      if (typeof JELLO_JET_RANGE !== 'undefined') {
        gmRegisterLever('jello.JELLO_JET_RANGE', 'jello', 'JELLO_JET_RANGE',
          function () { return JELLO_JET_RANGE; },
          function (v) { JELLO_JET_RANGE = v; },
          0, 160, undefined);   // jetpack-wash cone range (px)
      }
      if (typeof JELLO_NPT !== 'undefined') {
        gmRegisterLever('jello.JELLO_NPT', 'jello', 'JELLO_NPT',
          function () { return JELLO_NPT; },
          function (v) { JELLO_NPT = Math.max(2, Math.round(v)); },
          2, 4, 1);   // lattice points per tile per axis — affects NEW bodies only (build-time)
      }
      if (typeof JELLO_NPT_SMALL !== 'undefined') {
        gmRegisterLever('jello.JELLO_NPT_SMALL', 'jello', 'JELLO_NPT_SMALL',
          function () { return JELLO_NPT_SMALL; },
          function (v) { JELLO_NPT_SMALL = Math.max(2, Math.round(v)); },
          3, 6, 1);   // lattice npt for tiny bodies (<= SMALL_CELLS tiles) - NEW bodies only
      }
      if (typeof JELLO_NPT_MED !== 'undefined') {
        gmRegisterLever('jello.JELLO_NPT_MED', 'jello', 'JELLO_NPT_MED',
          function () { return JELLO_NPT_MED; },
          function (v) { JELLO_NPT_MED = Math.max(2, Math.round(v)); },
          2, 5, 1);   // lattice npt for mid-size bodies (<= MED_CELLS tiles) - NEW bodies only
      }
      if (typeof JELLO_NPT_SMALL_CELLS !== 'undefined') {
        gmRegisterLever('jello.JELLO_NPT_SMALL_CELLS', 'jello', 'JELLO_NPT_SMALL_CELLS',
          function () { return JELLO_NPT_SMALL_CELLS; },
          function (v) { JELLO_NPT_SMALL_CELLS = Math.max(1, Math.round(v)); },
          1, 8, 1);   // tile-count ceiling for the SMALL density tier
      }
      if (typeof JELLO_NPT_MED_CELLS !== 'undefined') {
        gmRegisterLever('jello.JELLO_NPT_MED_CELLS', 'jello', 'JELLO_NPT_MED_CELLS',
          function () { return JELLO_NPT_MED_CELLS; },
          function (v) { JELLO_NPT_MED_CELLS = Math.max(1, Math.round(v)); },
          2, 16, 1);   // tile-count ceiling for the MED density tier
      }
      if (typeof JELLO_H !== 'undefined') {
        gmRegisterLever('jello.JELLO_H', 'jello', 'JELLO_H',
          function () { return JELLO_H; },
          function (v) { JELLO_H = v; },
          0.002, 0.02, undefined);   // sim substep length (s) — smaller = finer/stiffer, costlier
      }
      if (typeof JELLO_MAX_SUBSTEPS !== 'undefined') {
        gmRegisterLever('jello.JELLO_MAX_SUBSTEPS', 'jello', 'JELLO_MAX_SUBSTEPS',
          function () { return JELLO_MAX_SUBSTEPS; },
          function (v) { JELLO_MAX_SUBSTEPS = Math.max(1, Math.round(v)); },
          1, 12, 1);   // catch-up substep cap per frame
      }
      if (typeof JELLO_MAX_POINTS !== 'undefined') {
        gmRegisterLever('jello.JELLO_MAX_POINTS', 'jello', 'JELLO_MAX_POINTS',
          function () { return JELLO_MAX_POINTS; },
          function (v) { JELLO_MAX_POINTS = Math.max(4, Math.round(v)); },
          100, 12000, 100);   // total lattice-point budget across all bodies
      }
      if (typeof JELLO_MAX_BODIES !== 'undefined') {
        gmRegisterLever('jello.JELLO_MAX_BODIES', 'jello', 'JELLO_MAX_BODIES',
          function () { return JELLO_MAX_BODIES; },
          function (v) { JELLO_MAX_BODIES = Math.max(1, Math.round(v)); },
          1, 128, 1);   // max simultaneous live bodies
      }
      if (typeof JELLO_MAX_CELLS !== 'undefined') {
        gmRegisterLever('jello.JELLO_MAX_CELLS', 'jello', 'JELLO_MAX_CELLS',
          function () { return JELLO_MAX_CELLS; },
          function (v) { JELLO_MAX_CELLS = Math.max(1, Math.round(v)); },
          1, 256, 1);   // flood-fill tile cap per activated cluster
      }
      if (typeof JELLO_SHOVE !== 'undefined') {
        gmRegisterLever('jello.JELLO_SHOVE', 'jello', 'JELLO_SHOVE',
          function () { return JELLO_SHOVE; },
          function (v) { JELLO_SHOVE = v; },
          0, 2, undefined);   // (legacy/reserved — old whole-blob slide; currently unused)
      }
      if (typeof JELLO_SUPPORT_MIN !== 'undefined') {
        gmRegisterLever('jello.JELLO_SUPPORT_MIN', 'jello', 'JELLO_SUPPORT_MIN',
          function () { return JELLO_SUPPORT_MIN; },
          function (v) { JELLO_SUPPORT_MIN = v; },
          0, 5, undefined);   // (legacy/compat — movement owns Y grounding now)
      }

      // v23.39 — Stage-1 optimization toggles as live boolean levers, so they
      // can be A/B-flipped from the L panel or gm.set('perf.smokeIdleSkip', 0)
      // without a rebuild. Default 1 (optimization runs); 0 restores the exact
      // pre-v23.32 every-frame path. Mirrored by the 'K' hotkey + overlay row.
      if (typeof PERF_SMOKE_IDLE_SKIP !== 'undefined') {
        gmRegisterLever('perf.smokeIdleSkip', 'perf', 'smokeIdleSkip',
          function () { return PERF_SMOKE_IDLE_SKIP ? 1 : 0; },
          function (v) { PERF_SMOKE_IDLE_SKIP = !!v; },
          0, 1, 1);
      }
      if (typeof PERF_SMOKE_OBSTACLE_DIRTY !== 'undefined') {
        gmRegisterLever('perf.smokeObstacleDirty', 'perf', 'smokeObstacleDirty',
          function () { return PERF_SMOKE_OBSTACLE_DIRTY ? 1 : 0; },
          function (v) { PERF_SMOKE_OBSTACLE_DIRTY = !!v; },
          0, 1, 1);
      }
      if (typeof PERF_CONSOLE_CACHE !== 'undefined') {
        gmRegisterLever('perf.consoleCache', 'perf', 'consoleCache',
          function () { return PERF_CONSOLE_CACHE ? 1 : 0; },
          function (v) { PERF_CONSOLE_CACHE = !!v; },
          0, 1, 1);           // v25.31 instrument cache; 0 = legacy direct draw (A/B)
      }
      if (typeof PERF_MAGMA_SKIP_LIVE_TINT !== 'undefined') {
        gmRegisterLever('perf.magmaSkipLiveTint', 'perf', 'magmaSkipLiveTint',
          function () { return PERF_MAGMA_SKIP_LIVE_TINT ? 1 : 0; },
          function (v) { PERF_MAGMA_SKIP_LIVE_TINT = !!v; },
          0, 1, 1);
      }

      // ----- Lighting / fog-of-war (185-lighting.js) -----
      gmRegisterObject('light', 'light', lightTune, {
        enabled:   { min: 0, max: 1, step: 1 },
        darkAlpha: { min: 0, max: 1, step: 0.02 },
        soft:      { min: 0, max: 1, step: 1 },
        reach:     { min: 1, max: 3, step: 0.1 }
      });

      // ----- market (ECONOMY_BIBLE.md): live price-model feel knobs. The
      // specialization table (MARKET.SPEC) + category map stay in code; these are
      // the scalars + per-category depth the owner dials by feel. All live (the
      // model reads MARKET every tick), so changes take effect with no rebuild.
      if (typeof MARKET !== 'undefined' && MARKET) {
        gmRegisterObject('market', 'market', MARKET, {
          SECONDS_PER_TICK: { min: 5,   max: 120,  step: 5 },
          REVERSION:        { min: 0,   max: 0.30, step: 0.005 },
          VOLATILITY:       { min: 0,   max: 0.15, step: 0.005 },
          IMPACT:           { min: 0,   max: 2,    step: 0.05 },
          M_MIN:            { min: 0.2, max: 0.9,  step: 0.05 },
          M_MAX:            { min: 1.2, max: 3,    step: 0.05 }
        });
        gmRegisterObject('marketDepth', 'market', MARKET.DEPTH, {
          STAPLE:     { min: 50, max: 1000, step: 10 },
          METAL:      { min: 50, max: 1000, step: 10 },
          MINING:     { min: 50, max: 1000, step: 10 },
          ASSAY:      { min: 50, max: 1000, step: 10 },
          INSTRUMENT: { min: 50, max: 1000, step: 10 },
          EXOTIC:     { min: 50, max: 1000, step: 10 }
        });
      }

      // ----- The window.gm facade -----
      var gm = {};
      // Direct references to the three tuning objects, so both
      // `gm.set('smoke.sim_curl', 38)` and `gm.smoke.sim_curl = 38` work.
      gm.smoke = smokeTune;
      gm.fireplace = fireplaceTune;
      gm.rocket = rocketTune;
      gm.flight = flightTune;

      // Numeric coerce helper — booleans pass through 0/1.
      function gmCoerce(entry, value) {
        if (typeof value === 'boolean') return value;
        var n = Number(value);
        if (!isFinite(n)) return value;
        if (typeof entry.min === 'number' && n < entry.min) n = entry.min;
        if (typeof entry.max === 'number' && n > entry.max) n = entry.max;
        return n;
      }

      // Set one lever by path. Clamps numeric values, runs the entry's set()
      // (side-effects included), logs a confirmation.
      gm.set = function (path, value) {
        var entry = GM_LEVERS[path];
        if (!entry) { console.warn('gm: unknown lever "' + path + '"'); return; }
        var v = gmCoerce(entry, value);
        try {
          entry.set(v);
        } catch (err) {
          console.warn('gm: set "' + path + '" threw:', err);
          return;
        }
        console.log('gm: ' + path + ' = ' + v);
        return v;
      };

      // Get one lever's current value.
      gm.get = function (path) {
        var entry = GM_LEVERS[path];
        if (!entry) { console.warn('gm: unknown lever "' + path + '"'); return undefined; }
        return entry.get();
      };

      // List every lever (optionally filtered to one group) as a readable line.
      gm.list = function (group) {
        var lines = [];
        Object.keys(GM_LEVERS).sort().forEach(function (path) {
          var e = GM_LEVERS[path];
          if (group && e.group !== group) return;
          var rng = '[' + e.min + '..' + e.max + ']';
          lines.push(path + ' = ' + e.get() + '  (' + e.def + ', ' + rng + ')');
        });
        var out = lines.join('\n');
        console.log(out || 'gm: no levers' + (group ? ' in group "' + group + '"' : ''));
        return lines;
      };

      // Sorted unique group names.
      gm.groups = function () {
        var seen = {};
        Object.keys(GM_LEVERS).forEach(function (path) { seen[GM_LEVERS[path].group] = true; });
        return Object.keys(seen).sort();
      };

      // Reset one lever, all levers in a group, or (no arg) everything to def.
      gm.reset = function (pathOrGroup) {
        var groups = gm.groups();
        var isGroup = (pathOrGroup && groups.indexOf(pathOrGroup) !== -1);
        var n = 0;
        Object.keys(GM_LEVERS).forEach(function (path) {
          var e = GM_LEVERS[path];
          if (pathOrGroup && !isGroup && path !== pathOrGroup) return;
          if (pathOrGroup && isGroup && e.group !== pathOrGroup) return;
          try { e.set(e.def); n++; } catch (err) { console.warn('gm: reset "' + path + '" threw:', err); }
        });
        if (pathOrGroup && !isGroup && n === 0) { console.warn('gm: unknown lever or group "' + pathOrGroup + '"'); return; }
        if (!pathOrGroup) gm.activePreset = null;   // full reset — no preset is active
        console.log('gm: reset ' + n + ' lever' + (n === 1 ? '' : 's') +
          (pathOrGroup ? ' (' + pathOrGroup + ')' : ' (all)'));
      };

      // Plain { path: value } object of every lever's current value.
      gm.snapshot = function () {
        var out = {};
        Object.keys(GM_LEVERS).forEach(function (path) { out[path] = GM_LEVERS[path].get(); });
        return out;
      };

      // { path: value } for only the levers that differ from their default.
      gm.diff = function () {
        var out = {};
        Object.keys(GM_LEVERS).forEach(function (path) {
          var e = GM_LEVERS[path];
          if (e.get() !== e.def) out[path] = e.get();
        });
        return out;
      };

      // Apply a { path: value } bag — the future preset system calls this.
      // Unknown paths warn (via gm.set) but never throw.
      gm.apply = function (obj) {
        if (!obj || typeof obj !== 'object') { console.warn('gm: apply expects an object'); return; }
        Object.keys(obj).forEach(function (path) { gm.set(path, obj[path]); });
      };

      // Short usage guide.
      gm.help = function () {
        console.log(
          'gm — Sluice tuning facade\n' +
          '  gm.set(path, value)   set a lever (clamped to range), runs side-effects\n' +
          '  gm.get(path)          read a lever\n' +
          '  gm.list([group])      list levers as "path = value (def, [min..max])"\n' +
          '  gm.groups()           list group names\n' +
          '  gm.reset([pathOrGroup]) reset a lever / group / everything to default\n' +
          '  gm.snapshot()         {path:value} of every lever\n' +
          '  gm.diff()             {path:value} of levers changed from default\n' +
          '  gm.apply(obj)         apply a {path:value} bag (preset system uses this)\n' +
          '  gm.smoke / gm.fireplace / gm.rocket  direct tuning-object refs\n' +
          'Groups: ' + gm.groups().join(', ') + '\n' +
          'Note: the water sim (LIQUID_* constants) is NOT live-tunable here — it\n' +
          'is baked into the WebGPU shaders, so water tuning is source-edit +\n' +
          'reload for now. See TUNING.md §2.'
        );
      };

      window.gm = gm;
      window.GM_LEVERS = GM_LEVERS;
    } catch (gmErr) {
      try { console.warn('gm: tuning facade failed to initialise:', gmErr); } catch (_) {}
    }

