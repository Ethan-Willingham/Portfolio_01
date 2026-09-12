  // ====== SOLITARY SURFACE HAWK ======
  // A rare passing silhouette, three times the tiny flock birds' wingspan.
  // Its quiet glide belongs to the landscape: no flock, collision or rig AI.
  // Timers count surface exposure, so a long mining trip cannot queue a swarm.
  var rareBirdWorld = null, rareBirdSprites = null;
  var rareBird = { active:false, wait:0, pass:0, x:0, y:0, baseY:0,
    dir:1, speed:0, age:0, phase:0, flapPeriod:6, maxAge:0, seen:false };

  function rareBirdReset() {
    rareBirdWorld = world;
    rareBird.active = false;
    rareBird.pass = 0;
    rareBird.age = 0;
    // Add about one second for the offscreen approach after this first wait.
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

  function rareBirdBegin() {
    var b = rareBird, seed = ++b.pass * 137 + COLS;
    b.dir = birdsHash(seed + 3) < 0.5 ? 1 : -1;
    b.x = b.dir > 0 ? cam.x - 64 : cam.x + screenW + 64;
    var surfaceY = SKY_ROWS * TILE;
    var high = Math.max(cam.y + 24, surfaceY - 180);
    var low = surfaceY - 56;
    b.baseY = high + (low - high) * birdsHash(seed + 7);
    b.y = b.baseY;
    b.speed = 42 + birdsHash(seed + 11) * 16;
    b.phase = birdsHash(seed + 19) * Math.PI * 2;
    b.flapPeriod = 5 + birdsHash(seed + 23) * 3;
    b.maxAge = (screenW + 128) / b.speed + 8;
    b.age = 0; b.seen = false; b.active = true;
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
    b.x += b.dir * b.speed * dt;
    // A shallow, slowly rising glide. Position never follows the camera.
    b.y = b.baseY + Math.sin(b.age * 0.65 + b.phase) * 4 - b.age * 0.35;
    if (rareBirdInView(8)) b.seen = true;
    // Retire only outside the view. Following a hawk keeps it alive instead
    // of deleting it on a lifetime boundary in the middle of the sky.
    if ((b.seen && !rareBirdInView(96)) || (b.age > b.maxAge && !rareBirdInView(12))) {
      b.active = false;
      b.wait = 90 + birdsHash(b.pass * 271 + 947) * 90;
    }
  }

  function rareBirdBake() {
    // Nine-pixel profile: broad wings, a short fan tail and hooked head.
    // Broad stone shadow + warm brown breast keep the bird below the shop's
    // value range. No bright eye or outline halo at this small scale.
    var poses = [
      ['.........', '...mm....', 'dddddmdd.', '.dddddddm', 'ddd.wdd..', '.........'],
      ['ddd......', '.dm......', '..dm..dd.', '...dddddm', 'ddd.wdd..', '...d.....'],
      ['.........', '......dd.', 'ddddddddm', '...dddd..', 'dddmwdd..', '..dd.....']
    ];
    var colors = { d:BLD.stoneDark, m:BLD.stoneBase, w:BLD.woodDark };
    rareBirdSprites = [];
    for (var p = 0; p < poses.length; p++) {
      var cv = document.createElement('canvas');
      cv.width = 9; cv.height = 6;
      var g = cv.getContext('2d');
      for (var y = 0; y < 6; y++) for (var x = 0; x < 9; x++) {
        var color = colors[poses[p][y].charAt(x)];
        if (color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
      }
      rareBirdSprites.push(cv);
    }
  }

  function rareBirdPose() {
    var flap = rareBird.age % rareBird.flapPeriod;
    // Most of each five-to-eight-second cycle is a level glide, followed by
    // one unhurried upstroke/downstroke before the wings settle again.
    if (flap < rareBird.flapPeriod - 0.65) return 0;
    return flap < rareBird.flapPeriod - 0.32 ? 1 : 2;
  }

  function rareBirdDraw() {
    if (!rareBird.active || rareBirdWorld !== world || !rareBirdInView(8)) return;
    if (!rareBirdSprites) rareBirdBake();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(rareBird.x), Math.round(rareBird.y));
    ctx.scale(rareBird.dir, 1);
    ctx.drawImage(rareBirdSprites[rareBirdPose()], -4, -3);
    ctx.restore();
  }

  window.__rareBird = {
    info: function() {
      return { kind:'hawk', active:rareBird.active, wait:rareBird.wait,
        passes:rareBird.pass, x:rareBird.x, y:rareBird.y, direction:rareBird.dir,
        pose:rareBirdPose(), wingspan:9 };
    }
  };
