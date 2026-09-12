  // ====== SOLITARY WHITE HERON ======
  // A rare, broad-winged white visitor above the tiny flock silhouettes.
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
    b.speed = 34 + birdsHash(seed + 11) * 12;
    b.phase = birdsHash(seed + 19) * Math.PI * 2;
    b.flapPeriod = 4.2 + birdsHash(seed + 23) * 1.8;
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
    var stroke = b.age % b.flapPeriod - (b.flapPeriod - 1.76);
    var lift = stroke > 0 ? Math.sin(stroke / .88 * Math.PI * 2) * .8 : 0;
    b.y = b.baseY + Math.sin(b.age * 0.65 + b.phase) * 4 - b.age * 0.35 + lift;
    if (rareBirdInView(20)) b.seen = true;
    // Retire only outside the view. Following a heron keeps it alive instead
    // of deleting it on a lifetime boundary in the middle of the sky.
    if ((b.seen && !rareBirdInView(96)) || (b.age > b.maxAge && !rareBirdInView(20))) {
      b.active = false;
      b.wait = 90 + birdsHash(b.pass * 271 + 947) * 90;
    }
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
    var flap = rareBird.age % rareBird.flapPeriod;
    // Two measured wingbeats, then a rest. Intermediate poses and a small
    // body lift give the bird weight without the tiny flock's frantic flutter.
    if (flap < rareBird.flapPeriod - 1.76) return 0;
    return 1 + Math.floor((flap - rareBird.flapPeriod + 1.76) / .11) % 8;
  }

  function rareBirdDraw() {
    if (!rareBird.active || rareBirdWorld !== world || !rareBirdInView(20)) return;
    if (!rareBirdSprites) rareBirdBake();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(rareBird.x), Math.round(rareBird.y));
    ctx.scale(rareBird.dir, 1);
    ctx.drawImage(rareBirdSprites[rareBirdPose()], -16, -15);
    ctx.restore();
  }

  window.__rareBird = {
    info: function() {
      return { kind:'white heron', active:rareBird.active, wait:rareBird.wait,
        passes:rareBird.pass, x:rareBird.x, y:rareBird.y, direction:rareBird.dir,
        pose:rareBirdPose(), wingspan:30 };
    }
  };
