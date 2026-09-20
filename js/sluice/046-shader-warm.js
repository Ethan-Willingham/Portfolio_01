  /* ---- Shader warm-up: compile first-use Canvas GPU programs while loading ----
     Chrome's GPU raster builds a shader program the first time any canvas on
     the page draws a new mix of geometry, paint, blend mode and clip. A cold
     program stalls the GPU thread for roughly 10-30 ms on the owner's Windows
     machine (docs/game/PERFORMANCE_STALLS_2026-09-12.md). The loading scene
     renders only the resting spawn view, and v27.1 warmed only the rig, so
     slimes, digging, new terrain, flight particles, cave walls, menus and
     damage effects still compiled in the middle of play.

     Every 2D canvas shares one program cache, so these passes draw
     representative states into hidden canvases and a 1-pixel readback pushes
     them through GPU raster under the loading cover. World drawing never
     touches the game canvas; the sky pass's full renders repaint the HUD
     layer, as every loading frame does. Every borrowed value is restored even
     when a pass throws.
     Measurements: docs/game/PERFORMANCE_SHADER_WARMUP_2026-09-13.md. */

  var shaderWarmState = null;   // { key, ms, passes, errors, times }

  function shaderWarmKey() {
    return canvas.width + ':' + canvas.height + ':' + dpr * worldScale + ':' + TERRAIN_CHUNK_RENDER_SCALE;
  }

  // Called by renderLoadingScene after its ordinary scene render. Returns true
  // on the frame that ran the passes, so loading counts fresh frames after it.
  function prepareShaderWarmup() {
    var key = shaderWarmKey();
    if (shaderWarmState && shaderWarmState.key === key) return false;
    shaderWarmState = runShaderWarmup(key);
    window.__shaderWarm = shaderWarmState;
    return true;
  }

  function runShaderWarmup(key) {
    var state = { key: key, ms: 0, passes: 0, errors: [], times: {} };
    var warm = document.createElement('canvas');
    // Two spare pixels keep a full-view opaque fill (a magma band, a cave
    // wall) from counting as a whole-canvas overwrite, which would discard
    // the passes queued before it.
    warm.width = canvas.width + 2;
    warm.height = canvas.height + 2;
    var warmCtx = warm.getContext('2d');
    if (!warmCtx) return state;
    var passes = [
      ['sky', shaderWarmSky], ['rig', shaderWarmRig], ['shadow', shaderWarmShadow], ['dig', shaderWarmDig],
      ['slime', shaderWarmSlime], ['visitors', shaderWarmVisitors], ['terrain', shaderWarmTerrain], ['scenery', shaderWarmScenery],
      ['banya', shaderWarmBanya], ['underground', shaderWarmUnderground], ['blast', shaderWarmBlast],
      ['rain', shaderWarmRain], ['hearth', function () { hearthArtWarm(ctx); }],
      ['hud', shaderWarmHud], ['menus', shaderWarmMenus]
    ];
    var mainCtx = ctx, ws = dpr * worldScale, t0 = performance.now();
    ctx = warmCtx;
    try {
      // Once on the camera's pixel grid and once a fraction off it: moving
      // edges select anti-aliased variants that a resting view never uses.
      for (var round = 0; round < 2; round++) {
        for (var i = 0; i < passes.length; i++) {
          var name = passes[i][0];
          if (round && (name === 'menus' || name === 'terrain' || name === 'sky')) continue;
          var tp = performance.now();
          ctx.save();
          try {
            passes[i][1](ws, round ? 0.37 : 0, round ? 0.21 : 0);
            state.passes++;
          } catch (e) {
            state.errors.push(name + ': ' + e);
          }
          ctx.restore();
          state.times[name] = Math.round((state.times[name] || 0) + performance.now() - tp);
        }
      }
    } finally {
      ctx = mainCtx;
    }
    var tr = performance.now();
    try { warmCtx.getImageData(0, 0, 1, 1); } catch (e) { state.errors.push('readback: ' + e); }
    state.times.raster = Math.round(performance.now() - tr);
    warm.width = warm.height = 0;
    state.ms = Math.round(performance.now() - t0);
    return state;
  }

  // The whole scene from high above the town, where the sky, bank edge and
  // limb take stencil clips a resting view never needs. The camera is put
  // back; the hidden canvas is two pixels larger, so render()'s clear leaves
  // the passes queued after it intact. Runs first.
  function shaderWarmSky() {
    var camY = cam.y, surfaceY = SKY_ROWS * TILE;
    try {
      cam.y = surfaceY - screenH * 1.25 + 20;
      render();
      cam.y = surfaceY - screenH * 0.97;
      render();
    } finally {
      cam.y = camY;
    }
  }

  function shaderWarmWorld(ws, ox, oy) {
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws + ox, -cam.y * ws + oy);
    ctx.imageSmoothingEnabled = true;
  }

  // Exercise the whole tower and both curtain states even when the spawn
  // camera only catches its lower tiers. Restore the real scene afterward.
  function shaderWarmBanya(ws, ox, oy) {
    if (!ENABLE_BATH || !bathPickSite()) return;
    var camX = cam.x, camY = cam.y, door = bathDoorT;
    var night = bathNightOverride, inside = bathMode;
    try {
      cam.x = banyaX + BANYA_W / 2 - screenW / 2;
      cam.y = SKY_ROWS * TILE - 500;
      bathMode = false;
      shaderWarmWorld(ws, ox, oy);
      for (var i = 0; i < 3; i++) {
        bathDoorT = i / 2;
        bathNightOverride = i === 2 ? 1 : 0;
        drawBanyaExterior();
      }
    } finally {
      cam.x = camX; cam.y = camY; bathDoorT = door;
      bathNightOverride = night; bathMode = inside;
    }
  }

  // Rig art for every drill and booster tier (upgrades swap the art), in the
  // poses play reaches: parked, reversing, climbing through ignition, a hard
  // bank with a short flame, drilling, and a landing squash. Climbing poses
  // carry wake, wash, sparks, pressure curls and landing dust.
  function shaderWarmRig(ws, ox, oy) {
    var livePlayer = player, tick = playerFxTick, tracks = playerTrackAnim;
    var visible = rocketJetVisible, clearance = rocketFlameClearance, ground = groundYBelowPlayer;
    var intensity = rocketIntensity, ignition = flightIgniteT, liveDrilling = drilling;
    var drillLevel = upgrades.drillLevel, boosterLevel = upgrades.boosterLevel;
    var angle = drillAnim.angle, extension = drillAnim.extension, spin = drillAnim.coneSpin;
    var wake = rocketWake, wash = rocketWash, sparks = rocketSparks, rings = flightRings;
    var tilts = [0, 0, 0.18, -0.44, 0, 0.04];
    try {
      player = Object.assign({}, livePlayer);
      playerTrackAnim = Object.assign({}, tracks);
      playerFxTick = function () {};
      rocketFlameClearance = function () { return 1; };
      rocketJetVisible = function () { return player.thrusting; };
      groundYBelowPlayer = function () { return player.renderY + PLAYER_H + (player.onGround ? 0 : 24); };
      rocketWake = []; rocketWash = []; rocketSparks = []; flightRings = [];
      shaderWarmWorld(ws, ox, oy);
      for (var level = 1; level <= 6; level++) {
        upgrades.drillLevel = level;
        upgrades.boosterLevel = level > 5 ? 5 : level;
        for (var pose = 0; pose < 6; pose++) {
          var x = cam.x + screenW * (0.08 + pose * 0.15);
          var y = cam.y + screenH * (0.04 + level * 0.13);
          player.x = player.renderX = x;
          player.y = player.renderY = y;
          player.dir = pose % 2 ? -1 : 1;
          player.onGround = pose === 0 || pose === 1 || pose >= 4;
          player.bodyTiltRender = tilts[pose];
          player.vx = pose === 1 ? -290 : (pose === 2 ? 160 : 0);
          player.vy = pose === 2 ? -300 : (pose === 3 ? 420 : 0);
          player.thrusting = pose === 2 || pose === 3;
          player.thrustSpool = player.thrusting ? 1 : 0;
          player.lastMoveU = player.thrusting;
          player.squash = pose === 5 ? 0.7 : 0;
          player.tremor = pose === 3 ? 1 : 0;
          playerTrackAnim.frameTravel = pose === 1 ? -2.5 : 0;
          rocketIntensity = pose === 3 ? 0.12 : (player.thrusting ? 1 : 0);
          flightIgniteT = pose === 2 ? FLIGHT_IGNITE_DURATION : 0;
          drilling = pose === 4 ? { r: 0, c: 0, dirVec: 'd', timer: 0.1, hitTime: 0.3 } : null;
          drillAnim.angle = pose === 4 ? Math.PI * 0.5 : 0;
          drillAnim.extension = pose === 4 ? 1 : 0;
          drillAnim.coneSpin = pose * 0.7;
          if (player.thrusting) shaderWarmParticles(x + PLAYER_W * 0.5, y + PLAYER_H);
          else rocketWake.length = rocketWash.length = rocketSparks.length = flightRings.length = 0;
          drawRocketPlume();
          drawPlayer();
        }
      }
    } finally {
      player = livePlayer; playerFxTick = tick; playerTrackAnim = tracks;
      rocketJetVisible = visible; rocketFlameClearance = clearance; groundYBelowPlayer = ground;
      rocketIntensity = intensity; flightIgniteT = ignition; drilling = liveDrilling;
      upgrades.drillLevel = drillLevel; upgrades.boosterLevel = boosterLevel;
      drillAnim.angle = angle; drillAnim.extension = extension; drillAnim.coneSpin = spin;
      rocketWake = wake; rocketWash = wash; rocketSparks = sparks; flightRings = rings;
    }
  }

  function shaderWarmParticles(x, y) {
    rocketWake.length = rocketWash.length = rocketSparks.length = flightRings.length = 0;
    for (var k = 0; k < 3; k++) {
      rocketWake.push({ x: x - 6 + k * 6, y: y + 8 + k * 4, vx: 0, vy: 0,
        age: 0.2 + k * 0.5, life: 1.7, size: 2 + k * 4, phase: k });
      rocketWash.push({ x: x - 10 + k * 10, y: y + 10, vx: 0, vy: 0,
        age: 0.1 + k * 0.25, life: 0.95, size: 3 + k * 5, phase: k });
      rocketSparks.push({ x: x + k * 2, y: y + 6 + k * 3, vx: 0, vy: 0,
        age: 0.04 * k, life: 0.35, size: 1 + k * 0.6 });
    }
    rocketWash.push({ x: x + 14, y: y + 2, vx: 0, vy: 0, age: 0.04, life: 0.26,
      size: 1.9, landing: true, phase: 0 });
    flightRings.push({ x: x, y: y + 6, vx: 0, vy: 0, r0: 1.8, r1: 7.5, age: 0.06,
      life: 0.26, w: 0.75, shock: 0, angle: 0 });
    flightRings.push({ x: x + 10, y: y + 6, vx: 0, vy: 0, r0: 1.8, r1: 7.5, age: 0.14,
      life: 0.26, w: 0.75, shock: 0, angle: player.bodyTiltRender });
  }

  // The contact shadow shrinks as the rig lifts; its size picks the draw path.
  function shaderWarmShadow(ws, ox, oy) {
    var livePlayer = player, ground = groundYBelowPlayer, lift = 0;
    var lifts = [0, 10, 30, 52];
    try {
      player = Object.assign({}, livePlayer);
      groundYBelowPlayer = function () { return player.renderY + PLAYER_H + lift; };
      shaderWarmWorld(ws, ox, oy);
      for (var i = 0; i < lifts.length; i++) {
        lift = lifts[i];
        player.renderX = cam.x + screenW * (0.2 + i * 0.18);
        player.renderY = cam.y + screenH * 0.5;
        drawPlayerShadow();
      }
    } finally {
      player = livePlayer; groundYBelowPlayer = ground;
    }
  }

  // Mining feedback: crack telegraphs inside their tile clip (each crack's
  // random shape and length picks its own path renderer), block-break chips,
  // grit and dust, the rare-ore flash, ring and sparks, and pickup text.
  function shaderWarmDig(ws, ox, oy) {
    var chips = mineChips, grit = mineGrit, dust = mineDust, flashes = mineFlashes;
    try {
      mineChips = []; mineGrit = []; mineDust = []; mineFlashes = [];
      shaderWarmWorld(ws, ox, oy);
      var r = Math.floor((cam.y + screenH * 0.55) / TILE);
      if (r < SKY_ROWS) r = SKY_ROWS;
      if (r > TOTAL_ROWS - 3) r = TOTAL_ROWS - 3;
      var c = Math.floor((cam.x + screenW * 0.2) / TILE);
      var rare = null;
      for (var type in ORES) {
        if (ORES[type].value >= 800) { rare = type; break; }
      }
      spawnMineBreak(r, c, { type: 'dirt' });
      spawnMineBreak(r, c + 2, { type: 'stone' });
      if (rare) spawnMineBreak(r, c + 4, { type: rare });
      var i;
      for (i = 0; i < mineDust.length; i++) mineDust[i].t = mineDust[i].maxT * 0.4;
      for (i = 0; i < mineChips.length; i++) mineChips[i].t = mineChips[i].maxT * (i % 2 ? 0.8 : 0.3);
      for (i = 0; i < mineFlashes.length; i++) {
        mineFlashes[i].delay = 0;
        mineFlashes[i].t = mineFlashes[i].maxT * 0.4;
      }
      drawMineFx();
      var dirs = ['d', 'u', 'l', 'r'], progress = [0.12, 0.4, 0.72, 1];
      for (var d = 0; d < dirs.length; d++) {
        for (var p = 0; p < progress.length; p++) {
          mineDrawCracks(r + (p % 2), c + 6 + d * 2 + p, dirs[d], progress[p]);
        }
      }
      // A crack drawn three times larger falls back from the mask atlas to
      // tessellation, the path renderer long jagged cracks reach in play.
      var bx = (c + 2) * TILE, by = (r + 1) * TILE;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(3, 3);
      ctx.translate(-bx, -by);
      mineDrawCracks(r + 1, c + 2, 'd', 1);
      mineDrawCracks(r + 1, c + 3, 'r', 0.72);
      ctx.restore();
      drawFloaterText('+$120 Gold', (c + 3) * TILE, r * TILE - 8, '#ffd24a', 0.6);
      drawFloaterText('Shiny Amber +$900', (c + 7) * TILE, r * TILE - 20, '#ffe6a0', 1);
    } finally {
      mineChips = chips; mineGrit = grit; mineDust = dust; mineFlashes = flashes;
    }
  }

  // Slimes: every live body drawn where the view can hold it, then temporary
  // cluster and disc bodies (never simulated, removed before returning) at
  // rest, squashed, sheared and enlarged. The sheen transform, strain
  // hotspots and clip size each select different programs. Splats follow.
  function shaderWarmSlime(ws, ox, oy) {
    if (!ENABLE_JELLO) return;
    var cx = cam.x + screenW * 0.5, cy = cam.y + screenH * 0.5;
    var bodies = jelloBodies, splats = jelloSplats, temp = [], i;
    try {
      for (i = 0; i < bodies.length && i < 4; i++) {
        var live = bodies[i];
        if (!isFinite(live.cx) || !isFinite(live.cy)) continue;
        ctx.setTransform(ws, 0, 0, ws, -(live.cx - screenW * 0.5) * ws + ox, -(live.cy - screenH * 0.5) * ws + oy);
        ctx.imageSmoothingEnabled = true;
        // Drawing eases the caustic and glint followers; keep the live ones as they were.
        var followers = [live._cau0X, live._cau0Y, live._cau1X, live._cau1Y, live.glintLX, live.glintLY];
        jelloDrawBody(live);
        live._cau0X = followers[0]; live._cau0Y = followers[1];
        live._cau1X = followers[2]; live._cau1Y = followers[3];
        live.glintLX = followers[4]; live.glintLY = followers[5];
      }
      shaderWarmWorld(ws, ox, oy);
      var r0 = Math.floor(cy / TILE), c0 = Math.floor(cx / TILE);
      var shapes = [
        [{ r: r0, c: c0 }, { r: r0, c: c0 + 1 }, { r: r0 + 1, c: c0 }, { r: r0 + 1, c: c0 + 1 }],
        [{ r: r0, c: c0 - 3 }, { r: r0, c: c0 - 2 }, { r: r0, c: c0 - 1 }]
      ];
      for (i = 0; i < shapes.length; i++) {
        var cluster = jelloBuildBody(shapes[i], 'slime');
        if (cluster) temp.push(cluster);
      }
      var disc = jelloBuildDisc(cx, cy, TILE * 1.1, 'slime');
      if (disc) temp.push(disc);
      // Squash, stretch, shear and bulk motion, which moves the shading.
      var poses = [[1, 1, 0, 0, 0], [1.32, 0.7, 0, 900, -600], [0.82, 1.24, 0.28, -1400, 800], [1, 1, 0, 2400, 2400]];
      for (i = 0; i < temp.length; i++) {
        var body = temp[i];
        var baseX = Float64Array.from(body.px), baseY = Float64Array.from(body.py);
        var bx = (body.bboxL + body.bboxR) * 0.5, by = (body.bboxT + body.bboxB) * 0.5;
        for (var p = 0; p < poses.length; p++) {
          shaderWarmDeform(body, baseX, baseY, bx, by, poses[p][0], poses[p][1], poses[p][2]);
          body.vx = poses[p][3];
          body.vy = poses[p][4];
          for (var s = 0; s < 10; s++) jelloStrainField(body);
          jelloDrawBody(body);
        }
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(2.4, 2.4);
        ctx.translate(-bx, -by);
        jelloDrawBody(body);
        ctx.restore();
      }
      // The frame's own path: splats, then the bodies through the shared
      // refraction backdrop, where overlapping lenses read the canvas.
      jelloBodies = temp;
      jelloSplats = [
        { x: cx - 30, y: cy, r: 3, hue: JELLO_RENDER_HUE, life: 0.5, maxLife: 1 },
        { x: cx + 30, y: cy, r: 6, hue: JELLO_RENDER_HUE, life: 1, maxLife: 1 }
      ];
      drawJelloBlobs();
    } finally {
      jelloBodies = bodies; jelloSplats = splats;
      for (i = 0; i < temp.length; i++) {
        var at = jelloBodies.indexOf(temp[i]);
        if (at >= 0) jelloBodies.splice(at, 1);
      }
      jelloCount = jelloTotalPoints();
    }
  }

  function shaderWarmDeform(b, baseX, baseY, cx, cy, sx, sy, shear) {
    var l = Infinity, r = -Infinity, t = Infinity, bm = -Infinity;
    for (var i = 0; i < b.n; i++) {
      var dx = baseX[i] - cx, dy = baseY[i] - cy;
      var x = cx + dx * sx + dy * shear, y = cy + dy * sy;
      b.px[i] = x; b.py[i] = y;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > bm) bm = y;
    }
    b.bboxL = l; b.bboxR = r; b.bboxT = t; b.bboxB = bm;
    b.shFrame = -1;   // refit the sheen deformation for this pose
  }

  // Visitor order bubbles, meteor wakes and the scoop/dump effects all
  // introduce paints absent from a fresh spawn. Draw temporary specimens,
  // never construction or simulation, and restore every borrowed reference.
  function shaderWarmVisitors(ws, ox, oy) {
    if (typeof bathDrawOrder !== 'function' || typeof skySlimeDraw !== 'function' ||
        typeof siphonDraw !== 'function') return;
    var liveSlimes = skySlimes, liveDust = skySlimeDust;
    var liveSiphon = siphon, liveButtons = siphonButtons, available = siphonAvailable;
    var livePlayer = player;
    var x = cam.x + screenW * 0.5, y = cam.y + screenH * 0.48;
    try {
      player = Object.assign({}, livePlayer);
      player.x = x - PLAYER_W * 0.5; player.y = y - PLAYER_H * 0.5;
      shaderWarmWorld(ws, ox, oy);

      skySlimes = [];
      skySlimeDust = [{ x: x - 45, y: y + 24, r: 2.4, life: 0.2, max: 0.5 }];
      for (var pose = 0; pose < 3; pose++) {
        var s = { x: x - 80 + pose * 80, y: y - 60, r: 25,
          vx: pose ? 0 : -110, vy: pose ? 0 : 480, oval: 1,
          eyeSize: 0.40 + pose * 0.01, seed: 0.17 + pose * 0.23, angle: pose * 0.4,
          squash: pose === 1 ? 0.11 : 0, eye: pose === 1 ? 0.12 : 0.86,
          pupilX: 1.3, pupilY: -0.9, entry: pose ? 0 : 0.9,
          wet: pose === 2 ? 0.8 : 0,
          _ground: pose === 1, _trail: [] };
        if (!pose) {
          for (var t = 0; t < 8; t++) s._trail.push({ x: s.x + (7 - t) * 7,
            y: s.y - (7 - t) * 15, r: 20, life: 0.08 + t * 0.055 });
        }
        skySlimes.push(s);
      }
      skySlimeDraw();
      ctx.save();
      ctx.translate(x - 884, y - (BATH_FLOORS[0].fr * TILE - 164));
      bathDrawOrder({ slot: 0, s: { x: 904, y: BATH_FLOORS[0].fr * TILE - 25, r: 25 } });
      ctx.restore();

      siphon = Object.assign({}, liveSiphon);
      siphonAvailable = function () { return true; };  // loading normally hides this tool
      siphon.equipped = true; siphon.power = 0.85; siphon.clock = 0.27;
      siphon.tank = [3600, 0, 1400, 2400, 900]; siphon.selected = 0;
      siphon.mode = 'suck'; siphon.passenger = null;
      siphon.notice = 'Dumping the whole load.'; siphon.noticeT = 1;
      siphon.fx = [{ x: x + 20, y: y + 44, type: 2, t: 0.1, life: 0.3 },
        { x: x + 76, y: y - 40, type: 3, t: 0.17, life: 0.3 }];
      siphonDraw();
      ctx.setTransform(dpr, 0, 0, dpr, ox, oy);
      siphonHUD();
      shaderWarmWorld(ws, ox, oy);
      siphon.mode = 'dump'; siphon.selected = 4; siphon.passenger = skySlimes[2];
      siphon.dump = { started: true, age: 0.12, initial: 16000, sent: 4000 };
      siphonDraw();
      ctx.setTransform(dpr, 0, 0, dpr, ox, oy);
      siphonHUD();
    } finally {
      skySlimes = liveSlimes; skySlimeDust = liveDust;
      siphon = liveSiphon; siphonButtons = liveButtons; siphonAvailable = available;
      player = livePlayer;
    }
  }

  // Terrain chunks: the first chunks built for new ground compile programs of
  // their own. Stone patches clip their washes, chips and rims through their
  // outline, and a lone stone tile has a small convex outline that takes other
  // GPU paths than a large mass; caves and dug tunnels erase voids. Canonical
  // 8x8 tile layouts are written into the chunk column farthest from the view,
  // rendered at the surface and at each layer depth, and the original tiles
  // are put back exactly. A small sample of real chunks follows. Drawing the
  // borrowed chunk canvas into the warm canvas snapshots each render before
  // the next one clears it.
  var SHADER_WARM_TERRAIN = [
    ['........', '........', 'dddddddd', 'dddddddd', 'dddSdddd', 'dd...ddd', 'dd....dd', 'dddddddd'],
    ['dddddddd', 'dddddddd', 'dddddddd', 'dddSdddd', 'dddddddd', 'dddddddd', 'dddddddd', 'dddddddd'],
    ['dddddddd', 'dddddddd', 'ddSSdddd', 'ddSSdddd', 'dd......', 'dd......', 'dddddddd', 'dddddddd'],
    ['SSSSdddd', 'SSSSSddd', 'SS...ddd', 'SS....dd', 'SSS...dd', 'SSSSdddd', 'SSSSSddd', 'dddddddd'],
    ['dddddddd', 'dddd.ddd', 'dddd.ddd', 'd.......', 'dddd.ddd', 'dddd.ddd', 'dddddddd', 'dddddddd'],
    ['dddddddd', 'ddoodddd', 'dooSdd..', 'ddoSd...', 'dddd....', 'ddSSdd..', 'dddddddd', 'dddddddd'],
    ['dddddddd', 'dSdddSdd', 'ddSdSddd', 'dddSdddd', 'ddSdSd..', 'dSdddS..', 'dddddd..', 'dddddddd'],
    ['SSSSSSSS', 'SSSSSSSS', 'SSS.SSSS', 'SSS.SSSS', 'SS....SS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'],
    // Where the station deck ends: foundation beside dirt, ore pockets and voids.
    ['........', '........', 'Fddddddd', 'dddddddd', 'dddodddd', 'doood...', 'ooodd...', 'oodooo..'],
    ['dddodddd', 'doood...', 'ooodd...', 'oodooo..', 'doddoo..', 'ddddodd.', 'ddddddSd', 'ddddSSSd'],
    ['doddoo..', 'ddddodd.', 'ddddddSd', 'ddddSSSd', 'dddSSSdd', 'dddSSSdd', 'Sddddddd', 'Sddddddd']
  ];
  var SHADER_WARM_DEEP = [0, 3, 5, 7];

  function shaderWarmTerrain() {
    var scale = TERRAIN_CHUNK_RENDER_SCALE, T = TERRAIN_CHUNK_TILES;
    var size = Math.ceil((TERRAIN_CHUNK_PX + TERRAIN_CHUNK_PAD * 2) * scale);
    var chunkCanvas = document.createElement('canvas');
    chunkCanvas.width = chunkCanvas.height = size;
    var chunk = { canvas: chunkCanvas, ctx: chunkCanvas.getContext('2d'), scale: scale,
      dirty: true, ready: false, lastUsed: 0 };
    var n = 0;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var cc = cam.x < COLS * TILE * 0.5 ? Math.floor(COLS / T) - 3 : 2;
      var rows = [Math.floor(SKY_ROWS / T)];
      var stack = camLayerStack();
      for (var i = 0; i < stack.length; i++) {
        rows.push(Math.floor((SKY_ROWS + Math.floor((stack[i].minDepth + stack[i].maxDepth) / 2)) / T));
      }
      for (var ri = 0; ri < rows.length; ri++) {
        var count = ri === 0 ? SHADER_WARM_TERRAIN.length : SHADER_WARM_DEEP.length;
        for (var p = 0; p < count; p++) {
          var layout = SHADER_WARM_TERRAIN[ri === 0 ? p : SHADER_WARM_DEEP[p]];
          if (shaderWarmTerrainLayout(rows[ri], cc, layout, chunk)) {
            ctx.drawImage(chunkCanvas, 0, 0, 2, 2, (n % 500) * 3, Math.floor(n / 500) * 3, 2, 2);
            n++;
          }
        }
      }
      var picks = shaderWarmPickChunks();
      for (var k = 0; k < picks.length; k++) {
        renderTerrainChunk(picks[k].r, picks[k].c, chunk);
        ctx.drawImage(chunkCanvas, 0, 0, 2, 2, (n % 500) * 3, Math.floor(n / 500) * 3, 2, 2);
        n++;
      }
    } finally {
      chunkCanvas.width = chunkCanvas.height = 0;
    }
  }

  function shaderWarmTerrainLayout(cr, cc, layout, chunk) {
    var T = TERRAIN_CHUNK_TILES, r0 = cr * T - 2, c0 = cc * T - 2, saved = [], r, c;
    if (r0 < 0 || r0 + 8 > TOTAL_ROWS || c0 < 0 || c0 + 8 > COLS) return false;
    for (r = 0; r < 8; r++) {
      if (!world[r0 + r]) return false;
      for (c = 0; c < 8; c++) saved.push(world[r0 + r][c0 + c]);
    }
    try {
      for (r = 0; r < 8; r++) {
        for (c = 0; c < 8; c++) {
          var ch = layout[r].charAt(c);
          var type = ch === 'S' ? 'stone' : (ch === 'o' ? 'coal' : (ch === 'F' ? 'foundation' : 'dirt'));
          world[r0 + r][c0 + c] = ch === '.' ? null : { type: type, hp: type === 'foundation' ? 999999 : ORES[type].hp };
        }
      }
      renderTerrainChunk(cr, cc, chunk);
    } finally {
      var k = 0;
      for (r = 0; r < 8; r++) {
        for (c = 0; c < 8; c++) world[r0 + r][c0 + c] = saved[k++];
      }
    }
    return true;
  }

  // Per band (the surface strip, then each layer), bucket evenly spread
  // candidate chunks by stone-patch size and open space, and keep the most
  // varied chunk in each bucket. An isolated stone tile clips its detail
  // through the mask atlas, a large mass through the stencil, so each size
  // compiles different programs. One extra pick per band favours ores.
  function shaderWarmPickChunks() {
    var T = TERRAIN_CHUNK_TILES, picks = [], taken = {};
    var cap = 2;
    var bands = [[SKY_ROWS - T, SKY_ROWS + 2 * T]];
    var stack = camLayerStack();
    for (var i = 0; i < stack.length; i++) {
      bands.push([SKY_ROWS + stack[i].minDepth, SKY_ROWS + stack[i].maxDepth]);
    }
    for (var b = 0; b < bands.length; b++) {
      var r0 = Math.max(0, bands[b][0]), r1 = Math.min(TOTAL_ROWS - 1, bands[b][1]);
      if (r1 <= r0) continue;
      var buckets = {}, ores = null;
      for (var k = 0; k < 64; k++) {
        var row = r0 + Math.floor(((k * 0.618034 + b * 0.137) % 1) * (r1 - r0 + 1));
        var col = Math.floor(((k * 0.414214 + b * 0.31) % 1) * (COLS - T));
        var cr = Math.floor(row / T), cc = Math.floor(col / T), key = cr + ':' + cc;
        if (taken[key]) continue;
        var f = shaderWarmChunkFeatures(cr, cc);
        if (!f.solid) continue;
        var pick = { r: cr, c: cc, key: key, distinct: f.distinct, ores: f.ores };
        var bucket = f.stoneBucket + (f.open ? 'o' : 'c');
        if (!buckets[bucket] || pick.distinct > buckets[bucket].distinct) buckets[bucket] = pick;
        if (f.ores && (!ores || f.ores > ores.ores)) ores = pick;
      }
      var order = ['s1o', 's2o', 's3o', 's0o', 's1c', 's3c', 's2c', 's0c'], n = 0;
      for (var o = 0; o < order.length && n < cap; o++) {
        var chosen = buckets[order[o]];
        if (!chosen || taken[chosen.key]) continue;
        taken[chosen.key] = true;
        picks.push(chosen);
        n++;
      }
    }
    return picks;
  }

  function shaderWarmChunkFeatures(cr, cc) {
    var T = TERRAIN_CHUNK_TILES, kinds = {}, f = { solid: 0, open: 0, distinct: 0, ores: 0, stoneBucket: 's0' };
    var stone = 0;
    for (var r = cr * T - 1; r <= cr * T + T; r++) {
      for (var c = cc * T - 1; c <= cc * T + T; c++) {
        var tile = getTileObj(r, c);
        if (!tile) { f.open++; continue; }
        f.solid++;
        if (tile.type === 'stone') stone++;
        if (!kinds[tile.type]) {
          kinds[tile.type] = 1;
          f.distinct++;
          if (tile.type !== 'dirt' && tile.type !== 'stone' && ORES[tile.type] && ORES[tile.type].value > 0) f.ores++;
        }
      }
    }
    f.stoneBucket = stone === 0 ? 's0' : (stone <= 3 ? 's1' : (stone <= 12 ? 's2' : 's3'));
    return f;
  }

  // Surface details the spawn view lacks: grass tufts, soil patches, seed
  // stalks and pebbles over open ground, foundation panels off the pixel
  // grid, the lit shop door, and the horizon limb that appears after takeoff.
  function shaderWarmScenery(ws, ox, oy) {
    var glow = shopGlowT, camX = cam.x, camY = cam.y, surfaceY = SKY_ROWS * TILE;
    try {
      shaderWarmWorld(ws, ox, oy);
      var x = cam.x + screenW * 0.25, y = cam.y + screenH * 0.5;
      drawSoilPatch(x, 12, 0.5, y);
      drawSoilPatch(x + 60, 32, 0.95, y);
      var fr = Math.floor((cam.y + screenH * 0.3) / TILE), fc = Math.floor((cam.x + screenW * 0.6) / TILE);
      for (var i = 0; i < 6; i++) drawFoundationTile(fr, fc + i, (fc + i) * TILE, fr * TILE);
      shopGlowT = 1;
      drawShopDoorGlow();
      // The pump pad's hazard stripes scroll inside their clip while the pump
      // runs, so stripe edges cross the clip at fractions of a pixel.
      drawHazardStripes(x, y + 20, 40, 6, 0.37, true);
      drawHazardStripes(x + 60, y + 20, 40, 6, 1.61, true);
      cam.y = surfaceY - screenH * 0.5;
      var grassCols = [DECK_LEFT_COL - 70, DECK_LEFT_COL - 30, DECK_CENTER_COL + 40];
      for (var g = 0; g < grassCols.length; g++) {
        cam.x = Math.max(0, grassCols[g]) * TILE;
        shaderWarmWorld(ws, ox, oy);
        drawSurfaceGrassLine(cam.x, cam.x + screenW, surfaceY);
      }
      cam.x = camX;
      cam.y = surfaceY - screenH * 0.9;
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      drawHorizonLimb();
      // Storm veil: the overcast sheet's scaled repeating texture at partial
      // alpha, then its top-weighted shade, as drawWeatherClouds paints them.
      // The live veil canvas is blank until a storm bakes it, and a pattern of
      // a blank canvas draws nothing, so a filled stand-in of the same size is used.
      var sheet = document.createElement('canvas');
      sheet.width = VEIL_TW;
      sheet.height = VEIL_TH;
      var sheetCtx = sheet.getContext('2d');
      var tone = sheetCtx.createLinearGradient(0, 0, VEIL_TW, VEIL_TH);
      tone.addColorStop(0, 'rgba(200,200,210,0.8)');
      tone.addColorStop(1, 'rgba(90,90,100,0.3)');
      sheetCtx.fillStyle = tone;
      sheetCtx.fillRect(0, 0, VEIL_TW, VEIL_TH);
      var skyPx = Math.round(canvas.height * 0.6), vwPx = VEIL_WORLD_W * ws;
      var veil = ctx.createPattern(sheet, 'repeat');
      veil.setTransform(new DOMMatrix([vwPx / VEIL_TW, 0, 0, (skyPx * 1.02) / VEIL_TH, -37.5, 0]));
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, canvas.width, skyPx);
      ctx.globalAlpha = 1;
      var shade = ctx.createLinearGradient(0, 0, 0, skyPx);
      shade.addColorStop(0, 'rgba(70,74,86,0.3)');
      shade.addColorStop(1, 'rgba(70,74,86,0)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, canvas.width, skyPx);
      sheet.width = sheet.height = 0;
    } finally {
      shopGlowT = glow; cam.x = camX; cam.y = camY;
    }
  }

  // Every biome wall, heat band and seam blend at the depth where it appears,
  // plus the surface bank seen from the air, where its clip spans the view.
  function shaderWarmUnderground(ws, ox, oy) {
    var camY = cam.y, surfaceY = SKY_ROWS * TILE;
    try {
      // From the air the topsoil band enters as a thin strip at the bottom of
      // the view; its height decides whether the bank clip splits.
      var depths = [surfaceY - screenH * 0.92];
      var strips = [3, 8, 14, 24, 40, 70];
      for (var h = 0; h < strips.length; h++) depths.push(surfaceY - screenH + strips[h]);
      var stack = camLayerStack();
      for (var i = 0; i < stack.length; i++) {
        depths.push(surfaceY + stack[i].minDepth * TILE - screenH * 0.5);
      }
      for (var d = 0; d < depths.length; d++) {
        cam.y = depths[d];
        shaderWarmWorld(ws, ox, oy);
        drawUndergroundBackground(cam.x, cam.x + screenW, cam.y, cam.y + screenH, surfaceY);
      }
    } finally {
      cam.y = camY;
    }
  }

  // Small and large blasts early and late in their lives, plus both lit charges.
  function shaderWarmBlast(ws, ox, oy) {
    var blasts = explosions, bombs = liveBombs, embers = bombSparks;
    try {
      shaderWarmWorld(ws, ox, oy);
      var x = cam.x + screenW * 0.5, y = cam.y + screenH * 0.5;
      var small = buildExplosion(x - 90, y, TILE * 1.2, false);
      var large = buildExplosion(x + 90, y, TILE * 2.4, true);
      explosions = [small, large];
      small.t = 0.12; large.t = 0.45;
      drawExplosions();
      small.t = 0.6; large.t = 0.9;
      drawExplosions();
      liveBombs = [
        { x: x - 40, y: y + 40, size: 'small', fuseT: 0.6, fuseMax: 2, angle: 0.4 },
        { x: x + 40, y: y + 40, size: 'large', fuseT: 1.8, fuseMax: 2.4, angle: -0.2 }
      ];
      bombSparks = [];
      drawLiveBombs();
    } finally {
      explosions = blasts; liveBombs = bombs; bombSparks = embers;
    }
  }

  // Screen-space plates: tip and warning radio messages, the hull damage
  // flash and the death veil.
  function shaderWarmHud(ws, ox, oy) {
    ctx.setTransform(dpr, 0, 0, dpr, ox, oy);
    ctx.imageSmoothingEnabled = false;
    drawRadioPlate('Drill down to find ore, then fly it home.', 'TIP', false, 0.5, 70);
    drawRadioPlate('Cargo full!', 'RIG', true, 1, 140);
    drawRadioPlate('Fly home to sell your haul.', 'TIP', false, 0.08, 210);
    drawRadioPlate('Fly home to sell your haul.', 'TIP', false, 0.25, 280);
    drawDamageFlash(0.55);
    drawDeathVeil(0.7, 0.35);
  }

  // Station store tabs while fading in and fully open, drill upgrade art for
  // every tier at list and detail sizes, the cargo manifest and the mineral
  // ledger, each drawn with temporary open state, then closed without animation.
  function shaderWarmMenus() {
    var modal = ukModal, modalState = ukState, openT = ukOpenT, closeT = ukCloseT;
    var lastTab = storeLastTab, manifest = cargoManifestOpen, page = cargoManifestPage;
    var hold = cargo, ledger = ledgerOpen;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!modal) {
        ukCatalogOpen(storeSpec());
        ukOpenT = 0.35;
        ukCatalogDraw(nsMetrics());
        ukOpenT = 1;
        ukCatalogDraw(nsMetrics());
        ukSwitchTab('shelf');
        ukCatalogDraw(nsMetrics());
        ukCatalogReset();
      }
      for (var level = 1; level <= 6; level++) {
        ctx.globalAlpha = level % 2 ? 1 : 0.5;
        drawUpgradeIconBig('drill', 40 + level * 40, 60, 28, level);
        drawUpgradeIconBig('drill', 40 + level * 120, 180, 110, level);
      }
      ctx.globalAlpha = 1;
      cargo = [];
      var types = ['coal', 'silver', 'amber', 'gold'];
      for (var i = 0; i < types.length; i++) {
        if (ORES[types[i]]) cargo.push({ type: types[i], shiny: i === 2 });
      }
      cargoManifestOpen = true;
      cargoManifestPage = 0;
      drawCargoManifest();
      cargoManifestOpen = false;
      ledgerOpen = true;
      drawLedger();
    } finally {
      ukModal = modal; ukState = modalState; ukOpenT = openT; ukCloseT = closeT;
      storeLastTab = lastTab;
      UK_HIT.length = 0;
      cargoManifestOpen = manifest; cargoManifestPage = page; cargo = hold; ledgerOpen = ledger;
    }
  }
