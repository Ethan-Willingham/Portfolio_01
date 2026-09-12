  // ====== RARE SURFACE TURTLE ======
  // One tiny passerby, with a long quiet interval between visits. It walks
  // in from beyond the camera edge, grazes, and eventually wanders back out.
  // Surface exposure advances the encounter clock; time in the mine does not.
  var surfaceTurtleWorld = null, surfaceTurtleSprites = null;
  var surfaceTurtleSerial = 0, surfaceTurtleWait = 50;
  var surfaceTurtle = { active:false, x:0, dir:1, entryDir:1, age:0,
    phase:0, pause:0, graze:8, shy:0, returning:false };

  function surfaceTurtleDelay(first) {
    var h = treesHash(COLS * 19 + (++surfaceTurtleSerial) * 619);
    return first ? 38 + h * 30 : 120 + h * 100;
  }

  function surfaceTurtleCanStand(x) {
    if (x < 10 || x > COLS * TILE - 10) return false;
    var left = Math.floor((x - 6) / TILE), right = Math.floor((x + 6) / TILE);
    for (var c = left; c <= right; c++) {
      var r = regionAt(c), t = tileAt(SKY_ROWS, c);
      if (!r || r.kind !== REGION_TOWN || !t || t === 'wall' || t.type === 'foundation' || treesInPond(c)) return false;
    }
    return true;
  }

  function surfaceTurtleLeave() {
    surfaceTurtle.active = false;
    surfaceTurtleWait = surfaceTurtleDelay(false);
  }

  function surfaceTurtleSpawn() {
    var side = treesHash(surfaceTurtleSerial * 137 + 5) < .5 ? -1 : 1;
    // Try either offscreen edge, never move a failed candidate onto the screen.
    for (var i = 0; i < 2; i++, side = -side) {
      var x = side < 0 ? cam.x - 20 : cam.x + screenW + 20;
      var dir = -side;
      if (!surfaceTurtleCanStand(x) || !surfaceTurtleCanStand(x + dir * 22)) continue;
      var t = surfaceTurtle;
      t.active = true; t.x = x; t.dir = dir; t.entryDir = dir;
      t.age = 0; t.phase = 0; t.pause = 0; t.shy = 0;
      t.graze = 9; t.returning = false;
      return true;
    }
    return false;
  }

  function surfaceTurtleUpdate(dt) {
    if (surfaceTurtleWorld !== world) {
      surfaceTurtleWorld = world; surfaceTurtleSerial = 0;
      surfaceTurtle.active = false; surfaceTurtleWait = surfaceTurtleDelay(true);
    }
    if (!(dt > 0) || !isFinite(dt)) return;
    dt = Math.min(dt, .05);
    var t = surfaceTurtle, surfaceY = SKY_ROWS * TILE;
    var surfaceVisible = cam.y < surfaceY && cam.y + screenH > surfaceY - 12;
    if (!t.active) {
      if (!surfaceVisible) return;
      surfaceTurtleWait -= dt;
      if (surfaceTurtleWait <= 0 && !surfaceTurtleSpawn()) surfaceTurtleWait = 18;
      return;
    }
    // A lost support tile must not leave an animal hovering over a shaft.
    // It disappears with that patch of surface scenery and starts a new wait.
    if (!surfaceTurtleCanStand(t.x)) { surfaceTurtleLeave(); return; }
    if (!surfaceVisible || t.x < cam.x - 120 || t.x > cam.x + screenW + 120) {
      surfaceTurtleLeave(); return;
    }
    t.age += dt;
    var px = player.x + PLAYER_W * .5, py = player.y + PLAYER_H;
    if (Math.abs(px - t.x) < 48 && Math.abs(py - surfaceY) < 38 && Math.abs(player.vx) > 30) t.shy = 2.4;
    t.shy = Math.max(0, t.shy - dt);
    if (t.shy > 0) return; // tuck quietly while the rig passes
    if (t.age > 42 && !t.returning) { t.dir = -t.entryDir; t.returning = true; }
    if (t.returning && (t.x < cam.x - 20 || t.x > cam.x + screenW + 20)) { surfaceTurtleLeave(); return; }
    if (t.pause > 0) { t.pause = Math.max(0, t.pause - dt); return; }
    t.graze -= dt;
    if (t.graze <= 0) {
      t.pause = 1.4 + treesHash(surfaceTurtleSerial + Math.floor(t.age)) * 2;
      t.graze = 8 + treesHash(surfaceTurtleSerial * 7 + Math.floor(t.age)) * 6;
      return;
    }
    var next = t.x + t.dir * 5 * dt;
    if (!surfaceTurtleCanStand(next + t.dir * 3)) {
      t.dir = -t.dir; t.pause = 1.2; // inspect a bank or pit, then turn away
      return;
    }
    t.x = next; t.phase += dt * 3;
  }

  function surfaceTurtleBake(frame) {
    var s = treesMakeSprite(18, 12), g = s.g;
    var tucked = frame === 2, foot = frame === 1 ? 1 : 0;
    g.fillStyle = BLD.outline;
    g.fillRect(3,4,9,4); g.fillRect(4,3,7,1); g.fillRect(5,2,5,1);
    g.fillRect(2,7,2,1);
    g.fillStyle = TREES_GREEN_DARK;
    g.fillRect(4,4,7,4); g.fillRect(5,3,5,1);
    g.fillRect(4 + foot,9,2,1); g.fillRect(9 - foot,9,2,1);
    g.fillRect(5,8,1,1); g.fillRect(9,8,1,1);
    g.fillRect(11,6,tucked ? 2 : 4,2);
    if (!tucked) g.fillRect(13,5,3,2);
    g.fillStyle = TREES_GREEN_MID;
    g.fillRect(5,4,5,2); g.fillRect(4,5,3,2);
    if (!tucked) g.fillRect(13,5,2,1);
    g.fillStyle = TREES_GREEN_LIT;
    g.fillRect(5,3,3,1); g.fillRect(4,4,2,1);
    g.fillStyle = TREES_GREEN_DARK;
    g.fillRect(7,4,1,3); g.fillRect(8,6,2,1);
    if (!tucked) { g.fillStyle = BLD.outline; g.fillRect(15,5,1,1); }
    return s.cv;
  }

  function drawSurfaceTurtle() {
    var t = surfaceTurtle, surfaceY = SKY_ROWS * TILE;
    if (!t.active || surfaceTurtleWorld !== world || cam.y >= surfaceY || cam.y + screenH < surfaceY - 12) return;
    if (t.x < cam.x - 10 || t.x > cam.x + screenW + 10 || !surfaceTurtleCanStand(t.x)) return;
    if (!surfaceTurtleSprites) surfaceTurtleSprites = [surfaceTurtleBake(0), surfaceTurtleBake(1), surfaceTurtleBake(2)];
    var frame = t.shy > 0 ? 2 : t.pause > 0 ? 0 : Math.floor(t.phase) % 2;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(t.x), surfaceY); ctx.scale(t.dir, 1);
    ctx.drawImage(surfaceTurtleSprites[frame], -9, -10);
    ctx.restore();
  }

  window.__surfaceTurtle = {
    info:function() { var t = surfaceTurtle; return {active:t.active, wait:surfaceTurtleWait,
      x:t.x, direction:t.dir, tucked:t.shy > 0, age:t.age}; }
  };
