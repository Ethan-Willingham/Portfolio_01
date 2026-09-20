  // Purchased exhaust has an independent fluid field. Ambient smoke keeps its
  // own material, heavy-smoke option and source cadence. One instance is warmed
  // under the loading cover and reused for every cosmetic, including switching
  // back to stock while the old colored plume finishes fading.
  var rigExhaustFluid = null, rigExhaustCanvas = null, rigExhaustContext = null;
  var rigExhaustFailed = false, rigExhaustApplied = null;
  var rigExhaustAwake = 0, rigExhaustClock = 0, rigExhaustAccumulator = 0;
  var rigExhaustPrevX = null, rigExhaustPrevY = null, rigExhaustUnits = 0;
  var rigExhaustWaterTick = 0, rigExhaustDirty = false;
  var rigExhaustMaterial = null;
  var RIG_EXHAUST_SCALE = 0.4; // 24-world-pixel rig / 60-pixel demo fixture
  var RIG_EXHAUST_DT = 1 / 30;

  function rigExhaustAvailable() {
    return !!(rigExhaustFluid && rigExhaustFluid.isReady() && !rigExhaustFailed &&
      rigExhaustContext && !rigExhaustContext.isContextLost());
  }
  function rigExhaustGL() { return rigExhaustContext; }
  function rigExhaustIsCustom() {
    return rigExhaustAvailable() && rigExhaustState && rigExhaustState.equipped !== 'stock';
  }
  function rigExhaustNeedsStep() { return rigExhaustIsCustom() || rigExhaustAwake > 0; }

  function rigExhaustPositionDOM() {
    if (!rigExhaustCanvas || !smokeFluidCanvas) return;
    ['left', 'top', 'width', 'height', 'clipPath'].forEach(function (key) {
      var value = smokeFluidCanvas.style[key];
      if (rigExhaustCanvas.style[key] !== value) rigExhaustCanvas.style[key] = value;
    });
  }
  function rigExhaustUnitScale() {
    // The sampler uses the demo's simulation-cell velocity units. Convert to
    // this domain's cells so zoom and screen shape do not change world speed.
    var sim = rigExhaustFluid.config.SIM_RESOLUTION;
    return (640 / 224) * RIG_EXHAUST_SCALE * sim /
      Math.max(1, Math.min(smokeFluidDomainWorldW, smokeFluidDomainWorldH));
  }
  function rigExhaustApply(immediate) {
    rigExhaustApplied = null;
    if (!rigExhaustAvailable()) return;
    var def = rigExhaustGet();
    if (!def) return;
    rigExhaustMaterial = rigExhaustSettings();
    rigExhaustApplied = def.id;
    rigExhaustUnits = rigExhaustUnitScale();
    if (!def.recipe) return; // Old colored smoke keeps its last material until it fades.
    var c = rigExhaustFluid.config, recipe = def.recipe;
    c.OPTICAL_DENSITY = recipe.fluid.OPTICAL_DENSITY || 0;
    c.OPTICAL_BRIGHTNESS = recipe.fluid.OPTICAL_BRIGHTNESS == null ? 0.9 : recipe.fluid.OPTICAL_BRIGHTNESS;
    c.OPTICAL_ABSORPTION = recipe.fluid.OPTICAL_ABSORPTION == null ? 1 : recipe.fluid.OPTICAL_ABSORPTION;
    c.EDGE_SHARPNESS = rigExhaustMaterial.appearance.sharpness;
    c.DENSITY_DISSIPATION = recipe.fluid.DENSITY_DISSIPATION / rigExhaustMaterial.appearance.lifetime;
    c.VELOCITY_DISSIPATION = recipe.fluid.VELOCITY_DISSIPATION;
    c.CURL = Math.max(0, Math.min(50, recipe.fluid.CURL * rigExhaustMaterial.tuning.motion + def.scale.values.curl));
    smokeFluidApplyWind(rigExhaustFluid);
    var physics = Object.assign({}, rigExhaustMaterial.physics);
    ['BUOYANCY', 'WEIGHT', 'EDGE_SPIN'].forEach(function (key) { physics[key] *= rigExhaustUnits; });
    rigExhaustFluid.setPhysics(physics, immediate === true ? 0 : 0.35);
    // A new source can wake in a stationary world. Refresh its terrain mask.
    smokeObstPrevCamX = NaN;
  }
  function rigExhaustEnsure() {
    if (rigExhaustFailed || !smokeFluidCanvas || !SmokeFluid.create) return false;
    if (!rigExhaustFluid) {
      rigExhaustCanvas = document.createElement('canvas');
      rigExhaustCanvas.width = smokeFluidWidth;
      rigExhaustCanvas.height = smokeFluidHeight;
      rigExhaustCanvas.setAttribute('aria-hidden', 'true');
      rigExhaustCanvas.style.cssText = 'position:absolute;pointer-events:none;z-index:5;display:block;';
      rigExhaustFluid = SmokeFluid.create();
      if (!rigExhaustFluid.init(rigExhaustCanvas, {
        SIM_RESOLUTION: isMobile ? 112 : 224, DYE_RESOLUTION: isMobile ? 320 : 640,
        PRESSURE_ITERATIONS: isMobile ? 13 : 20, SHADING: false,
        DENSITY_DISSIPATION: 0.3, VELOCITY_DISSIPATION: 0.15, CURL: 12
      })) {
        rigExhaustFailed = true; rigExhaustCanvas = null; rigExhaustFluid = null;
        return false;
      }
      rigExhaustContext = rigExhaustCanvas.getContext('webgl2') || rigExhaustCanvas.getContext('webgl');
      canvas.parentElement.appendChild(rigExhaustCanvas);
      // Exercise every new material branch before gameplay is revealed.
      // Warm interaction textures too, so the first purchase does not compile
      // a new boundary program when its smoke encounters water or a slime.
      rigExhaustFluid.paintObstacleQuads(new Float32Array(0), 0, smokeFluidObstacleW, smokeFluidObstacleH);
      rigExhaustFluid.setMovingBodies([{ ringN: 3, ring: [0, 1, 2], px: [0, 1, 0], py: [0, 0, 1] }],
        0, 0, smokeFluidDomainWorldW, smokeFluidDomainWorldH, 1 / 60, smokeFluidObstacleW, smokeFluidObstacleH, true);
      rigExhaustFluid.setLiquidField([1], [1], [0], [0], 1, 0, 0,
        smokeFluidDomainWorldW, smokeFluidDomainWorldH, 1 / (LIQUID_CELL * LIQUID_CELL * LIQUID_PDELTA * LIQUID_PDELTA));
      rigExhaustFluid.setPhysics({ HEAT: 1, BUOYANCY: 20, WEIGHT: 5, VISCOSITY: 2, EDGE_SPIN: 20 }, 0);
      rigExhaustFluid.splat(0.5, 0.5, 0, 1, { r: 0.01, g: 0.005, b: 0.003 }, 0.02);
      rigExhaustFluid.step(1 / 60);
      rigExhaustFluid.config.OPTICAL_DENSITY = 1;
      rigExhaustFluid.config.EDGE_SHARPNESS = 1;
      rigExhaustFluid.displayPass();
      rigExhaustFluid.config.OPTICAL_DENSITY = 0;
      rigExhaustFluid.config.EDGE_SHARPNESS = 0;
      rigExhaustFluid.setPhysics({}, 0);
      rigExhaustFluid.setMovingBodies([], 0, 0, 1, 1, 1 / 60, smokeFluidObstacleW, smokeFluidObstacleH, true);
      rigExhaustFluid.setLiquidField([], [], [], [], 0, 0, 0, 1, 1, 1);
      rigExhaustFluid.clear(); rigExhaustFluid.clearObstacle(); rigExhaustFluid.displayPass();
      rigExhaustApply(true);
      smokeObstPrevCamX = NaN;
    }
    if (rigExhaustCanvas.width !== smokeFluidWidth || rigExhaustCanvas.height !== smokeFluidHeight) {
      rigExhaustFluid.resize(smokeFluidWidth, smokeFluidHeight);
      rigExhaustPrevX = rigExhaustPrevY = null;
      rigExhaustDirty = true;
      rigExhaustApply(true);
    }
    rigExhaustPositionDOM();
    if (rigExhaustApplied !== rigExhaustState.equipped || Math.abs(rigExhaustUnitScale() - rigExhaustUnits) > 0.01)
      rigExhaustApply();
    return rigExhaustAvailable();
  }

  function rigExhaustUpdate(dt) {
    if (!rigExhaustAvailable() || dt <= 0) return;
    dt = Math.min(0.05, dt);
    if (rigExhaustPrevX !== null && rigExhaustNeedsStep()) {
      var dx = (cam.x - rigExhaustPrevX) / smokeFluidDomainWorldW;
      var dy = (cam.y - rigExhaustPrevY) / smokeFluidDomainWorldH;
      if (dx || dy) rigExhaustFluid.scroll(dx, dy);
    }
    rigExhaustPrevX = cam.x; rigExhaustPrevY = cam.y;
    rigExhaustClock += dt;
    var def = rigExhaustGet();
    var emitting = def && def.recipe && smokeTune.enabled && smokeTune.diesel_enabled && !gameOver && !gameWon;
    if (emitting) {
      rigExhaustAccumulator = Math.min(RIG_EXHAUST_DT * 3, rigExhaustAccumulator + dt);
      var samples = Math.floor(rigExhaustAccumulator / RIG_EXHAUST_DT);
      rigExhaustAccumulator -= samples * RIG_EXHAUST_DT;
      var ex = getExhaustWorldPos();
      var tilt = player.bodyTiltRender || 0;
      var outwardX = Math.sin(tilt), outwardY = -Math.cos(tilt);
      var crossX = -outwardY, crossY = outwardX;
      var throttle = player.thrusting ? 1.5 : (drilling || Math.abs(player.vx) > 8 ? 1 : 0.65);
      var basis = smokeFluidDomainWorldH * Math.sqrt(Math.max(1, smokeFluidDomainWorldW / smokeFluidDomainWorldH));
      var radiusScale = Math.pow(Math.sqrt(1120 * 640) * RIG_EXHAUST_SCALE / Math.max(1, basis), 2);
      for (var n = 0; n < samples; n++) {
        var time = rigExhaustClock - rigExhaustAccumulator - (samples - n - 1) * RIG_EXHAUST_DT;
        var packets = window.SmokePresets.sample(def.recipe, time, 0, rigExhaustMaterial.tuning, def.scale.values, throttle);
        for (var i = 0; i < packets.length; i++) {
          var p = packets[i];
          var uv = smokeFluidWorldToUV(ex.x + (crossX * p.x + outwardX * p.y) * RIG_EXHAUST_SCALE,
            ex.y + (crossY * p.x + outwardY * p.y) * RIG_EXHAUST_SCALE);
          if (!uv.inView) continue;
          rigExhaustFluid.splat(uv.uvX, uv.uvY,
            (crossX * p.vx + outwardX * p.vy) * 2 * rigExhaustUnits,
            -(crossY * p.vx + outwardY * p.vy) * 2 * rigExhaustUnits,
            p.color, p.radius * 0.9 * radiusScale);
          rigExhaustAwake = Math.max(8, def.recipe.source.idleHold || 24) * rigExhaustMaterial.appearance.lifetime;
        }
      }
    } else rigExhaustAccumulator = 0;
    if (rigExhaustAwake <= 0) return;
    rigExhaustAwake -= dt;
    var ox = cam.x - smokeFluidMarginWorldX, oy = cam.y - smokeFluidMarginWorldY;
    rigExhaustFluid.setMovingBodies(smokeFluidMovingBodies(), ox, oy, smokeFluidDomainWorldW, smokeFluidDomainWorldH,
      dt, smokeFluidObstacleW, smokeFluidObstacleH, true);
    if ((rigExhaustWaterTick++ % 4) === 0 || liquidCount === 0) {
      rigExhaustFluid.setLiquidField(liquidX, liquidY, liquidVX, liquidVY, liquidCount,
        ox, oy, smokeFluidDomainWorldW, smokeFluidDomainWorldH, 1 / (LIQUID_CELL * LIQUID_CELL * LIQUID_PDELTA * LIQUID_PDELTA), liquidFrozen);
    }
    smokeFluidApplyWind(rigExhaustFluid);
    rocketSmokeCouple(rigExhaustFluid, dt);
    rigExhaustFluid.step(dt);
    rigExhaustDirty = true;
    if (rigExhaustAwake <= 0) { rigExhaustFluid.clear(); rigExhaustDirty = true; }
  }
  function rigExhaustDraw() {
    if (rigExhaustAvailable() && rigExhaustDirty) {
      rigExhaustFluid.displayPass();
      rigExhaustDirty = false;
    }
  }
  function rigExhaustClear() {
    if (rigExhaustAvailable()) {
      rigExhaustFluid.clear(); rigExhaustFluid.clearObstacle(); rigExhaustFluid.displayPass();
    }
    rigExhaustAwake = rigExhaustClock = rigExhaustAccumulator = 0;
    rigExhaustPrevX = rigExhaustPrevY = null;
    rigExhaustWaterTick = 0; rigExhaustDirty = false;
  }
