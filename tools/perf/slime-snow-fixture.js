// Test-only scene setup, injected by audit-sluice.mjs inside the game closure.
// The normal animation loop owns every subsequent update and render.
(function () {
  var fixture = null;
  function flags() {
    return { jello: ENABLE_JELLO, snow: worldSnowEnabled, rain: worldRainEnabled,
      contact: typeof SOFT_CONTACT !== 'undefined' && SOFT_CONTACT,
      handling: typeof SOFT_HANDLING !== 'undefined' && SOFT_HANDLING,
      terrain: typeof SOFT_TERRAIN !== 'undefined' && SOFT_TERRAIN,
      material: typeof SOFT_MATERIAL !== 'undefined' && SOFT_MATERIAL,
      pairs: typeof SOFT_PAIRS !== 'undefined' && SOFT_PAIRS,
      intent: typeof SOFT_INTENT !== 'undefined' && SOFT_INTENT,
      world: typeof SOFT_WORLD !== 'undefined' && SOFT_WORLD,
      presentation: typeof SOFT_PRESENTATION !== 'undefined' && SOFT_PRESENTATION };
  }
  function frame() {
    if (!fixture) return null;
    var residents = 0, awake = 0, visible = 0, points = 0;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i];
      if (!b.surfaceSlime) continue;
      residents++; points += b.n;
      if (!b.sleeping && !b.frozen) awake++;
      if (jelloBodyOnCamera(b)) visible++;
    }
    var gpu = liquidWGPU, timing = window.__auditJelloTiming;
    return { liquids: liquidCount, snowActive: snow.active, airborne: snow.grains.length,
      parkedSnow: snow.parked.length / 4, residents: residents, awakeResidents: awake,
      visibleResidents: visible, residentPoints: points, contacts: timing ? timing.contacts : null,
      outerTicks: timing ? timing.outerTicks : null, microsteps: timing ? timing.microsteps : null,
      microstepMultiplier: timing ? timing.microstepMultiplier : null, holding: !!surfaceSlimeGrip,
      jet: !!player.thrusting, ground: !!player.onGround,
      readbackGeneration: gpu ? gpu.readbackApplyGen : null,
      readbackAge: gpu && gpu.getReadbackAge ? gpu.getReadbackAge() : null,
      readbackCount: gpu ? gpu.readbackCount : null,
      readbackPending: gpu ? gpu.readbackPending : null,
      readbackResolved: gpu ? gpu.readbackResolved : null,
      liquidAwake: gpu ? gpu.awakeCount : null, liquidSleeping: gpu ? gpu.sleepingCount : null };
  }
  function snapshot() {
    if (!fixture) return null;
    var types = {}, physicalSnow = 0;
    // Full mirror counting happens only at setup/warmup/end, never per frame.
    for (var i = 0; i < liquidCount; i++) {
      var type = liquidType[i]; types[type] = (types[type] || 0) + 1;
      if (type === 5) physicalSnow++;
    }
    return Object.assign({}, fixture, frame(), { particleTypes: types, physicalSnow: physicalSnow,
      snowMass: snow.mass, snowTemperature: snow.temperature, precipitation: weather.pcp,
      wind: surfaceWind.current, airflow: snowAir.active, flags: flags(),
      gpuSimulation: !!(liquidWGPU && liquidWGPU.simActive),
      readbackNote: 'Counts and velocities come from the asynchronously applied CPU mirror.' });
  }
  function setup(name) {
    if (typeof softPlayEnabled !== 'undefined' && softPlayEnabled) throw Error('Combined audit requires normal boot, without softplay=1');
    var combined = name === 'slime-snow', col = DECK_CENTER_COL, floor = SKY_ROWS * TILE;
    var residentCount = window.__auditResidentCount === undefined ? 8 : window.__auditResidentCount;
    if (!Number.isInteger(residentCount) || residentCount < 1 || residentCount > 32) throw Error('Resident fixture count must be 1 to 32');
    if (combined) {
      // Find an existing dry apron. Keep the generated town and pond terrain.
      var found = false;
      for (var seek = 0; seek < 48 && !found; seek++) {
        col = DECK_LEFT_COL - 7 + seek;
        found = true;
        for (var c = col - 5; c <= col + 5; c++) {
          if (!tileAt(SKY_ROWS, c) || tileAt(SKY_ROWS - 1, c)) { found = false; break; }
        }
      }
      if (!found) throw Error('No existing dry town apron for combined audit');
    }
    var center = (col + 0.5) * TILE;
    if (combined && ENABLE_JELLO) {
      surfaceSlimeGrabEnd(undefined, true);
      // Only the scene's resident initial conditions change. Other bodies,
      // native liquids, snow, weather, terrain, and every solver stay live.
      for (var i = jelloBodies.length - 1; i >= 0; i--) if (jelloBodies[i].surfaceSlime) jelloBodies.splice(i, 1);
      jelloCount = jelloTotalPoints(); surfaceSlimesSeeded = true;
      var columns = Math.min(4, residentCount);
      for (var n = 0; n < residentCount; n++) {
        var x = center + (n % columns - (columns - 1) * 0.5) * 40, y = floor - 27 - Math.floor(n / columns) * 39;
        if (!surfaceSlimeBuild(x, y, { id: 9300 + n, seed: 0.08 + n * 0.115,
          hue: surfaceSlimeHues[n % surfaceSlimeHues.length], r: 25 })) throw Error('Could not create every requested audit resident');
      }
    }
    for (var key in keys) keys[key] = false;
    player.x = combined ? center - 140 : DECK_CENTER_COL * TILE;
    player.y = floor - PLAYER_H - 2; player.renderX = player.x; player.renderY = player.y;
    player.vx = player.vy = 0; player.thrusting = false; player.onGround = true;
    cam.snap = true; updateCamera(); canvas.focus({ preventScroll: true });
    fixture = { scene: name, center: center, floor: floor, left: center - 220, right: center + 220,
      expectedResidents: ENABLE_JELLO ? (combined ? residentCount : SURFACE_SLIME_STARTERS) : 0,
      layout: combined ? residentCount + ' ordinary radius-25 residents, 40px column and 39px row spacing' : SURFACE_SLIME_STARTERS + ' untouched normal starting residents',
      world: 'Normal seeded game; native terrain, ponds, snow and weather retained; liquid population streams with camera region',
      query: location.search, initial: null };
    fixture.initial = frame();
    return snapshot();
  }
  function pointer() {
    if (!fixture) return null;
    var best = null, distance = Infinity;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i];
      if (!b.surfaceSlime || !jelloBodyOnCamera(b)) continue;
      var d = Math.abs(b.cx - fixture.center);
      if (d < distance) { best = b; distance = d; }
    }
    if (!best) return null;
    var rect = canvas.getBoundingClientRect(), scale = dpr * worldScale;
    return { x: rect.left + (best.cx - cam.x) * scale * rect.width / canvas.width,
      y: rect.top + (best.cy - cam.y) * scale * rect.height / canvas.height,
      id: best.surfaceSlime.id, holding: !!surfaceSlimeGrip };
  }
  window.__slimeSnowFixture = { handles: function (name) { return name === 'town-normal' || name === 'slime-snow'; },
    setup: setup, snapshot: snapshot, frame: frame, pointer: pointer,
    bounds: function () { return fixture && { x: player.x, left: fixture.left, right: fixture.right }; } };
})();
