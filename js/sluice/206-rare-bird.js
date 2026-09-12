  // ====== SOLITARY WHITE HERON ======
  // A rare white visitor resting inside a canopy until the rig passes.
  // Smaller and behind the trees, with a gently varying continuous wingbeat.
  // Timers count surface exposure, so a long mining trip cannot queue a swarm.
  var rareBirdWorld = null, rareBirdSprites = null;
  var RARE_BIRD_SCALE = .75;
  var rareBird = { active:false, state:'waiting', perch:null, wait:0, pass:0, x:0, y:0,
    dir:1, speed:0, vx:0, vy:0, age:0, flightAge:0, phase:0, wingPhase:0,
    flapHz:1.3, routeY:0, routeWait:0, route:0, maxAge:0, seen:false };

  function rareBirdReset() {
    rareBirdWorld = world;
    rareBird.active = false;
    rareBird.state = 'waiting'; rareBird.perch = null;
    rareBird.pass = 0;
    rareBird.age = 0;
    rareBird.flightAge = 0; rareBird.wingPhase = 0;
    rareBird.vx = 0; rareBird.vy = 0;
    // A long surface wait admits one hidden roost, never a flock of visitors.
    rareBird.wait = 45 + birdsHash(COLS * 13 + 829) * 28;
  }

  function rareBirdSurfaceVisible() {
    var surfaceY = SKY_ROWS * TILE;
    return cam.y < surfaceY - 72 && cam.y + screenH > surfaceY - 8;
  }

  function rareBirdInView(pad) {
    return rareBird.x >= cam.x - pad && rareBird.x <= cam.x + screenW + pad &&
      rareBird.y >= cam.y - pad && rareBird.y <= cam.y + screenH + pad;
  }

  function rareBirdTreeValid(t) {
    if (!t || t.st !== 0 || t.spr.h < 48 ||
        (t.kind !== TREES_KIND_SPRUCE && t.kind !== TREES_KIND_BIRCH)) return false;
    var ground = tileAt(SKY_ROWS, t.c);
    return !!ground && ground !== 'wall' && ground.type !== 'foundation';
  }

  function rareBirdBegin() {
    if (!treesTune.enabled || !treesBuilt || treesWorldRef !== world) return false;
    var b = rareBird, seed = (b.pass + 1) * 137 + COLS;
    var px = player.x + PLAYER_W * .5, ahead = player.vx < -5 ? -1 : 1;
    var chosen = null, best = Infinity;
    for (var i = 0; i < TREES.length; i++) {
      var t = TREES[i], dx = t.x - px;
      if (!rareBirdTreeValid(t) || Math.abs(dx) < 150 ||
          t.x < cam.x - 320 || t.x > cam.x + screenW + 320) continue;
      var score = Math.abs(dx) + (dx * ahead < 0 ? 180 : 0) + birdsHash(t.c + seed) * 120;
      if (score < best) { best = score; chosen = t; }
    }
    if (!chosen) { b.wait = 4; return false; }
    b.pass++; b.perch = chosen; b.state = 'perched';
    b.x = chosen.x; b.y = chosen.cy - 4;
    b.dir = b.x >= px ? 1 : -1;
    b.speed = 32 + birdsHash(seed + 11) * 12;
    b.phase = birdsHash(seed + 19) * Math.PI * 2;
    b.flapHz = 1.22 + birdsHash(seed + 23) * .20;
    b.maxAge = (screenW + 128) / b.speed + 8;
    b.age = 0; b.flightAge = 0; b.wingPhase = 0;
    b.vx = 0; b.vy = 0; b.route = 0;
    b.seen = false; b.active = true;
    return true;
  }

  function rareBirdRetire() {
    var b = rareBird;
    b.active = false; b.state = 'waiting'; b.perch = null;
    b.wait = 90 + birdsHash(b.pass * 271 + 947) * 90;
  }

  function rareBirdTakeoff() {
    var b = rareBird, dx = b.x - (player.x + PLAYER_W * .5);
    b.dir = dx ? (dx > 0 ? 1 : -1) : b.dir;
    b.state = 'takeoff'; b.perch = null; b.flightAge = 0;
    b.vx = b.dir * 12; b.vy = -32; b.wingPhase = 0;
    b.routeY = Math.min(b.y - 48, SKY_ROWS * TILE - 120);
    b.routeWait = 2.4;
  }

  function rareBirdWingUpdate(dt) {
    var b = rareBird;
    // Small, slow rate changes avoid a metronome; the stronger launch strokes
    // ease into cruising without freezing on a long glide frame.
    var hz = b.flapHz + .32 * Math.exp(-b.flightAge * .8) +
      Math.sin(b.flightAge * .83 + b.phase) * .09 + Math.sin(b.flightAge * .31 + b.phase) * .05;
    b.wingPhase = (b.wingPhase + dt * hz * Math.PI * 2) % (Math.PI * 2);
  }

  function rareBirdUpdate(dt) {
    if (rareBirdWorld !== world) rareBirdReset();
    if (!(dt > 0) || !isFinite(dt)) return;
    if (dt > 0.05) dt = 0.05;
    var b = rareBird;
    if (!b.active) {
      if (!rareBirdSurfaceVisible()) return;
      b.wait -= dt;
      if (b.wait <= 0) rareBirdBegin();
      return;
    }
    b.age += dt;
    if (b.state === 'perched') {
      // Hidden inside real foliage, so admitting a visitor never pops a
      // white sprite onto the screen. A rebuild cannot leave a ghost roost.
      if (!treesTune.enabled || !treesBuilt || treesWorldRef !== world || TREES.indexOf(b.perch) < 0) {
        rareBirdRetire(); return;
      }
      b.x = b.perch.x; b.y = b.perch.cy - 4;
      var dx = player.x + PLAYER_W * .5 - b.x;
      var dy = (player.y + PLAYER_H * .5 - b.y) * .5;
      var moving = Math.abs(player.vx) + Math.abs(player.vy) > 8;
      if (!rareBirdTreeValid(b.perch) || (moving && dx * dx + dy * dy < 125 * 125)) rareBirdTakeoff();
      else if (!rareBirdInView(400)) rareBirdRetire();
      return;
    }
    b.flightAge += dt;
    if (b.flightAge > 1.6) b.state = 'flying';
    rareBirdWingUpdate(dt);
    b.routeWait -= dt;
    if (b.routeWait <= 0) {
      var key = b.pass * 719 + ++b.route * 173;
      b.routeY = SKY_ROWS * TILE - 115 - birdsHash(key) * 135;
      b.routeWait = 3.5 + birdsHash(key + 7) * 3;
    }
    // Seek changing heights with bounded acceleration. Targets can move
    // abruptly, but the bird itself climbs and dips along smooth arcs.
    var goalY = b.routeY + Math.sin(b.flightAge * .37 + b.phase) * 9;
    var targetVY = Math.max(-40, Math.min(26, (goalY - b.y) * .85));
    b.vy += (targetVY - b.vy) * Math.min(1, dt * 1.8);
    var speed = b.speed + Math.sin(b.flightAge * .44 + b.phase) * 2;
    b.vx += (b.dir * speed - b.vx) * Math.min(1, dt * 1.5);
    b.x += b.vx * dt;
    b.y += (b.vy + Math.sin(b.wingPhase) * 1.4) * dt;
    if (rareBirdInView(20)) b.seen = true;
    // Retire only outside the view. Following a heron keeps it alive instead
    // of deleting it on a lifetime boundary in the middle of the sky.
    if ((b.seen && !rareBirdInView(96)) || (b.flightAge > b.maxAge && !rareBirdInView(20))) rareBirdRetire();
  }

  function rareBirdBake() {
    // Folded neck, long trailing legs, a slender ochre bill and broad white
    // feathers. Reuse the sky's warm cloud white with cool stone shadows.
    // Pose zero is a glide; eight more poses describe a full slow wingbeat.
    var wing = [-2, -9, -7, -2, 5, 10, 6, 0, -6];
    var white = SKY.cloudSunHi, shade = BLD.stonePale;
    rareBirdSprites = [];
    for (var p = 0; p < wing.length; p++) {
      var cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      var g = cv.getContext('2d');
      // Rasterize at pixel centers, keeping every feather edge crisp.
      function feather(points, color) {
        g.fillStyle = color;
        for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
          var inside = false;
          for (var a = 0, b = points.length - 1; a < points.length; b = a++) {
            var v = points[a], u = points[b];
            if ((v[1] > y + .5) !== (u[1] > y + .5) &&
                x + .5 < (u[0] - v[0]) * (y + .5 - v[1]) / (u[1] - v[1]) + v[0]) inside = !inside;
          }
          if (inside) g.fillRect(x, y, 1, 1);
        }
      }
      var w = wing[p], head = p === 4 || p === 5 ? 1 : 0;
      // Far wing first, offset and cooler so the two wings separate in flight.
      feather([[18,14],[16,10+w*.3],[11,12+w*.7],[7,13+w*.8],
        [8,16+w*.8],[12,16+w*.5],[18,16]], BLD.metalPale);
      // Two trailing legs and a slight tail fan follow the body on each stroke.
      var tail = p === 5 || p === 6 ? 1 : 0;
      g.fillStyle = BLD.stoneBase;
      g.fillRect(1,18+tail,12,1); g.fillRect(0,20+tail,10,1);
      g.fillRect(10,19+tail,3,1); g.fillRect(12,18+tail,2,1);
      g.fillRect(13,17,2,2);
      g.fillStyle = shade; g.fillRect(7,15+tail,7,3);
      g.fillStyle = white; g.fillRect(8,14+tail,6,2);
      // Broad breast with a shaded underside, folded neck and small alert head.
      g.fillStyle = shade; g.fillRect(11,14,11,4); g.fillRect(13,18,6,1);
      g.fillStyle = white; g.fillRect(10,13,11,3); g.fillRect(12,12,8,2);
      g.fillRect(20,11+head,3,5); g.fillRect(22,9+head,4,3);
      g.fillStyle = shade; g.fillRect(23,12+head,2,1);
      g.fillStyle = BLD.goldDark; g.fillRect(26,11+head,4,1);
      g.fillStyle = BLD.goldBase; g.fillRect(26,10+head,3,1);
      g.fillStyle = BLD.metalDark; g.fillRect(24,10+head,1,1);
      // Near wing: stepped primary feathers, warm upper face, quiet underside.
      feather([[18,14],[14,12+w*.2],[9,13+w*.6],[3,14+w],
        [2,16+w],[4,16+w],[4,18+w],[6,17+w],[7,18+w],
        [9,16+w*.7],[13,17+w*.3],[17,16]], white);
      feather([[3,16+w],[4,18+w],[6,17+w],[7,18+w],
        [9,16+w*.7],[13,17+w*.3],[17,16],[11,15+w*.5]], shade);
      rareBirdSprites.push(cv);
    }
  }

  function rareBirdPose() {
    // Quicker power stroke, slower recovery. Phase is integrated in update,
    // so drawing while paused cannot advance the wings.
    var phase = rareBird.wingPhase / (Math.PI * 2);
    return phase < .44 ? 1 + Math.min(3, Math.floor(phase / .44 * 4)) :
      5 + Math.min(3, Math.floor((phase - .44) / .56 * 4));
  }

  function rareBirdDraw() {
    if (!rareBird.active || rareBird.state === 'perched' || rareBirdWorld !== world || !rareBirdInView(20)) return;
    if (!rareBirdSprites) rareBirdBake();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(rareBird.x), Math.round(rareBird.y));
    ctx.scale(rareBird.dir * RARE_BIRD_SCALE, RARE_BIRD_SCALE);
    ctx.globalAlpha *= .76;
    ctx.drawImage(rareBirdSprites[rareBirdPose()], -16, -15);
    ctx.restore();
  }

  window.__rareBird = {
    info: function() {
      return { kind:'white heron', active:rareBird.active, wait:rareBird.wait,
        passes:rareBird.pass, x:rareBird.x, y:rareBird.y, direction:rareBird.dir,
        state:rareBird.state, treeCol:rareBird.perch ? rareBird.perch.c : null,
        vx:rareBird.vx, vy:rareBird.vy, wingPhase:rareBird.wingPhase,
        pose:rareBirdPose(), wingspan:30 * RARE_BIRD_SCALE };
    }
  };
