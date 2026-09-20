
  /* ============================================================
     BOMB PHYSICS (065): live charges are projectiles
     ------------------------------------------------------------
     Dropped charges used to be parked on a tile with a burning
     fuse (the old activateBomb placement). Now a charge is a
     physical object: it inherits the rig's velocity on release,
     falls under gravity, bounces off terrain with restitution
     and friction, tumbles in the air, rolls to a stop, and
     detonates wherever it ENDS UP. The blast aims at the solid
     tile under a resting charge, so the classic "drop a charge
     to dig straight down" move behaves exactly like before.

     What is new on top of the base flight:
       - Velocity inheritance: bombing runs from a moving rig.
       - Large charges are impact-fused: past bombTune.IMPACT_V
         they detonate on the first hard hit (dive-bomb payoff).
         Small charges always burn the full fuse, so they can be
         lobbed and bounced around corners.
       - Chain reactions: a blast kicks other live charges away
         and crimps their fuses (staggered sympathetic booms).
       - Mining the floor out from under a resting charge drops
         it (it simply starts falling again).
       - Fuse embers spray off the tip while a charge tumbles.

     Ownership: this fragment owns everything between release
     and boom (spawn, integration, rendering, embers, chain
     kicks, blast juice). The blast itself (cell clearing, ore
     pickup, player damage, billow/streak FX) is unchanged in
     060's detonateBomb. bombSpawn() is called by activateBomb
     (060); updateLiveBombs/drawLiveBombs keep their old names
     so the 350/140 dispatch sites stay untouched. No water
     coupling here at all: underwater blasts disturb liquid only
     through the existing markTerrainCleared mutation path, so
     the v24.125 resting-calm baseline is untouched.

     Levers: gm group 'bombs' (registered in 360, next to
     trees). Debug: window.__bombs (count / info / spawn /
     boomAll / tune).
     ============================================================ */

  var bombTune = {
    GRAV: 640,         // gravity on live charges (px/s^2)
    REST_SMALL: 0.42,  // bounce energy kept by a small charge
    REST_LARGE: 0.20,  // large charges land like bricks
    FRICT: 7,          // ground roll friction (1/s)
    DRAG: 0.12,        // air drag on horizontal speed (1/s)
    INHERIT: 1.0,      // fraction of rig velocity a charge keeps
    TOSS_X: 70,        // sideways toss along facing (px/s)
    TOSS_UP: 90,       // grounded-release upward pop (px/s)
    FUSE_SMALL: 2.0,   // seconds
    FUSE_LARGE: 2.4,
    IMPACT_V: 430,     // large-charge impact fuse (px/s; 0 = off)
    CHAIN: 1,          // blasts kick + crimp other live fuses
    SHAKE: 1,          // blast screen-shake trauma scale
    EMBERS: 1          // fuse ember spray (0 = off)
  };

  var bombSparks = [];        // fuse embers (visual only, sub-second lives)
  var BOMB_SETTLE_V = 100;    // land softer than this and the charge beds down
  var BOMB_SFX_V = 90;        // quietest impact that still thunks

  // Release a live charge from the rig. Inventory + radio chatter stay in
  // activateBomb (060); this owns the physics birth.
  function bombSpawn(size) {
    var isLarge = size === 'large';
    var fuse = isLarge ? bombTune.FUSE_LARGE : bombTune.FUSE_SMALL;
    var face = (player.dir < 0) ? -1 : 1;
    var vx = player.vx * bombTune.INHERIT + face * (player.onGround ? bombTune.TOSS_X : 30);
    var vy = player.vy * bombTune.INHERIT + (player.onGround ? -bombTune.TOSS_UP : 40);
    liveBombs.push({
      x: player.x + PLAYER_W / 2,
      y: player.y + PLAYER_H / 2 + 4,
      vx: vx,
      vy: vy,
      angle: 0,
      angVel: (Math.random() * 2 - 1) * 3 - vx * 0.004,   // a touch of toss spin
      size: isLarge ? 'large' : 'small',
      rad: isLarge ? 7 : 5,
      fuseT: fuse,
      fuseMax: fuse,
      resting: false,
      armT: 0,           // impact fuse arms shortly after release
      emberT: 0,
      r: 0, c: 0         // blast cell, refreshed by bombBoom at detonation
    });
    sfxPlay('bomb-throw');
  }

  // Solid-terrain probe at a world pixel. tileAt returns null for open
  // air, a tile object for solid cells, and 'wall' off the world edges.
  function bombSolidAt(px, py) {
    return tileAt(Math.floor(py / TILE), Math.floor(px / TILE)) !== null;
  }

  // Tick all live charges: physics first, then the fuse. Replaces the old
  // park-and-burn updateLiveBombs (060); same name, same 350 dispatch.
  function updateLiveBombs(dt) {
    if (bombSparks.length) bombSparksUpdate(dt);
    if (!liveBombs.length) return;
    // Fuse hiss while any charge burns; stops itself (engine watchdog) the
    // frame this stops being called, on detonation, pause, or restart alike.
    sfxLoop('bomb-fuse', { gain: Math.min(1, 0.6 + liveBombs.length * 0.15) });
    for (var i = liveBombs.length - 1; i >= 0; i--) {
      var b = liveBombs[i];
      b.fuseT -= dt;
      b.armT += dt;
      if (b.fuseT > 0) bombStep(b, dt);
      if (b.fuseT <= 0 || b.boomNow) {
        liveBombs.splice(i, 1);
        bombBoom(b);
        continue;
      }
      bombEmbers(b, dt);
    }
  }

  // Integrate one charge for one frame. Substepped so a dive-bombed charge
  // (rig speed plus gravity) cannot tunnel through a one-tile wall on a
  // slow frame: each substep moves at most ~8 px.
  function bombStep(b, dt) {
    if (b.resting) { bombRollOut(b, dt); return; }
    var speed = Math.max(Math.abs(b.vx), Math.abs(b.vy) + bombTune.GRAV * dt);
    var steps = Math.ceil(speed * dt / 8);
    if (steps < 1) steps = 1; else if (steps > 8) steps = 8;
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      bombSubStep(b, h);
      if (b.resting || b.boomNow) break;
    }
  }

  // One collision substep: gravity, drag, tumble, then axis-separated
  // tile sweeps (x first, then y) with restitution on each hit.
  function bombSubStep(b, h) {
    var rest = b.size === 'large' ? bombTune.REST_LARGE : bombTune.REST_SMALL;
    b.vy += bombTune.GRAV * h;
    var dragK = 1 - bombTune.DRAG * h;
    if (dragK < 0) dragK = 0;
    b.vx *= dragK;
    b.angle += b.angVel * h;
    b.angVel *= Math.max(0, 1 - 0.35 * h);

    // X sweep
    if (b.vx !== 0) {
      var nx = b.x + b.vx * h;
      var lead = nx + (b.vx > 0 ? b.rad : -b.rad);
      if (bombSolidAt(lead, b.y - b.rad * 0.5) || bombSolidAt(lead, b.y + b.rad * 0.5)) {
        bombImpact(b, Math.abs(b.vx));
        var wc = Math.floor(lead / TILE);
        b.x = b.vx > 0 ? wc * TILE - b.rad - 0.01 : (wc + 1) * TILE + b.rad + 0.01;
        b.vx = -b.vx * rest;
        b.angVel = -b.angVel * 0.4 + (Math.random() * 2 - 1) * 2;
      } else {
        b.x = nx;
      }
    }
    if (b.boomNow) return;

    // Y sweep
    var ny = b.y + b.vy * h;
    if (b.vy > 0) {
      var foot = ny + b.rad;
      if (bombSolidAt(b.x - b.rad * 0.5, foot) || bombSolidAt(b.x + b.rad * 0.5, foot)) {
        var impact = b.vy;
        bombImpact(b, impact);
        b.y = Math.floor(foot / TILE) * TILE - b.rad - 0.01;
        if (b.boomNow) return;
        if (impact < BOMB_SETTLE_V) {
          b.resting = true;
          b.vy = 0;
        } else {
          b.vy = -impact * rest;
          b.vx *= 0.82;                                       // tangential scrub
          b.angVel = b.vx / b.rad * (0.5 + Math.random() * 0.5);
        }
      } else {
        b.y = ny;
      }
    } else if (b.vy < 0) {
      var head = ny - b.rad;
      if (bombSolidAt(b.x - b.rad * 0.5, head) || bombSolidAt(b.x + b.rad * 0.5, head)) {
        bombImpact(b, -b.vy);
        b.y = (Math.floor(head / TILE) + 1) * TILE + b.rad + 0.01;
        b.vy = -b.vy * rest * 0.6;
      } else {
        b.y = ny;
      }
    } else {
      b.y = ny;
    }
  }

  // A bedded charge: roll out residual slide, ease onto its side, and
  // re-fall if the floor under it gets mined away mid-fuse.
  function bombRollOut(b, dt) {
    if (!bombSolidAt(b.x, b.y + b.rad + 1.5)) {
      b.resting = false;        // floor is gone, back to free fall
      return;
    }
    b.vx *= Math.max(0, 1 - bombTune.FRICT * dt);
    if (b.vx > -4 && b.vx < 4) b.vx = 0;
    if (b.vx !== 0) {
      var nx = b.x + b.vx * dt;
      var lead = nx + (b.vx > 0 ? b.rad : -b.rad);
      if (bombSolidAt(lead, b.y)) { b.vx = 0; } else { b.x = nx; }
      if (!bombSolidAt(b.x, b.y + b.rad + 1.5)) { b.resting = false; return; }   // rolled off an edge
      b.angVel = b.vx / b.rad;
      b.angle += b.angVel * dt;
    } else {
      // Ease onto the nearest lying-flat pose (stick horizontal).
      var target = Math.round((b.angle - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      b.angle += (target - b.angle) * Math.min(1, dt * 10);
      b.angVel = 0;
    }
  }

  // Shared impact handling for every wall/floor/ceiling hit: a thunk that
  // scales with speed, and the large charge's impact fuse.
  function bombImpact(b, speed) {
    if (speed >= BOMB_SFX_V) {
      sfxPlay('debris', {
        pan: sfxPanAt(b.x),
        gain: Math.min(0.9, 0.2 + speed / 800),
        rate: b.size === 'large' ? 0.85 : 1.15,
        jitter: 0.06
      });
    }
    if (b.size === 'large' && bombTune.IMPACT_V > 0 && b.armT > 0.3 && speed >= bombTune.IMPACT_V) {
      b.boomNow = true;
    }
  }

  // Detonation wrapper: aim the blast at where the charge ENDED UP, run
  // 060's detonateBomb (cells, ore, damage, billow FX), then layer the
  // physics juice on top (screen shake, hull tremor, smoke, chain kicks).
  function bombBoom(b) {
    var isLarge = b.size === 'large';
    var c = Math.floor(b.x / TILE);
    var r = Math.floor(b.y / TILE);
    // A charge sits in the air cell ON TOP of its floor; aim one cell down
    // so a bedded charge still digs (the old parked-bomb semantics).
    var below = tileAt(r + 1, c);
    if (tileAt(r, c) === null && below !== null && below !== 'wall') r += 1;
    b.r = r; b.c = c;
    detonateBomb(b);

    var cx = c * TILE + TILE / 2;
    var cy = r * TILE + TILE / 2;
    if (bombTune.SHAKE > 0 && typeof addTrauma === 'function') {
      addTrauma((isLarge ? 0.42 : 0.24) * bombTune.SHAKE);
    }
    // Hull shiver: a decaying event kick (player.tremor, decayed in 080 and
    // rendered in 210), scaled by how close the blast was. Never a loop.
    var dxp = (player.x + PLAYER_W / 2) - cx;
    var dyp = (player.y + PLAYER_H / 2) - cy;
    var dp = Math.sqrt(dxp * dxp + dyp * dyp);
    var tr = 1 - dp / (TILE * (isLarge ? 7 : 4.5));
    if (tr > 0 && (player.tremor || 0) < tr) player.tremor = tr;
    bombSmokePuff(cx, cy, isLarge);
    if (bombTune.CHAIN) bombChainKick(cx, cy, TILE * (isLarge ? 3.4 : 2.2), isLarge);
  }

  // Sympathetic detonation: every other live charge in range gets flung
  // away from the blast and has its fuse crimped short, so clusters go up
  // as a staggered string instead of one merged bang.
  function bombChainKick(cx, cy, r, isLarge) {
    for (var i = 0; i < liveBombs.length; i++) {
      var o = liveBombs[i];
      var dx = o.x - cx, dy = o.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      var fall = 1 - d / r;
      var nx = d > 0.001 ? dx / d : 0;
      var ny = d > 0.001 ? dy / d : -1;
      o.resting = false;
      o.vx += nx * (isLarge ? 340 : 240) * fall;
      o.vy += ny * (isLarge ? 340 : 240) * fall - 90 * fall;
      o.angVel += (Math.random() * 2 - 1) * 9 * fall;
      var crimp = 0.12 + (d / r) * 0.25;
      if (o.fuseT > crimp) o.fuseT = crimp;
    }
  }

  // One-shot dust column into the WebGL smoke sim. Silently skipped when
  // the sim is unavailable (the SPH fallback gets nothing, matching how
  // the other one-shot emitters degrade).
  function bombSmokePuff(cx, cy, isLarge) {
    try {
      if (typeof smokeFluidEnsure !== 'function' || !smokeFluidEnsure()) return;
      if (typeof smokeDriver === 'undefined' || !smokeDriver || !smokeDriver.splat) return;
      var uv = smokeFluidWorldToUV(cx, cy);
      if (!uv.inView) return;
      var rad = isLarge ? 0.045 : 0.025;
      smokeDriver.splat(uv.uvX, uv.uvY, 0, 0.09, { r: 0.30, g: 0.26, b: 0.22 }, rad);
      smokeDriver.splat(uv.uvX, uv.uvY, 0, 0.05, { r: 0.50, g: 0.36, b: 0.18 }, rad * 0.5);
    } catch (e) {}
  }

  // ----- Fuse embers (tiny amber flecks off the burning tip) -----

  // Fuse tip in world space; rotates with the body. Local tip offsets
  // match the sprite drawings below.
  function bombFuseTip(b) {
    var lx = b.size === 'large' ? 6 : 0;
    var ly = -13;
    var ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    return { x: b.x + lx * ca - ly * sa, y: b.y + lx * sa + ly * ca };
  }

  function bombEmbers(b, dt) {
    if (bombTune.EMBERS <= 0) return;
    b.emberT -= dt;
    if (b.emberT > 0 || bombSparks.length > 90) return;
    var late = 1 - b.fuseT / b.fuseMax;             // embers get busier late
    b.emberT = 0.10 - late * 0.06 + Math.random() * 0.05;
    var tip = bombFuseTip(b);
    var life = 0.2 + Math.random() * 0.2;
    bombSparks.push({
      x: tip.x, y: tip.y,
      vx: b.vx * 0.25 + (Math.random() * 2 - 1) * 28,
      vy: b.vy * 0.25 - 14 - Math.random() * 26,
      t: life,
      max: life
    });
  }

  function bombSparksUpdate(dt) {
    for (var i = bombSparks.length - 1; i >= 0; i--) {
      var s = bombSparks[i];
      s.t -= dt;
      if (s.t <= 0) { bombSparks.splice(i, 1); continue; }
      s.vy += 300 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  // ----- Rendering (world space; ctx already carries the camera transform) -----

  // Render all live charges + embers. Replaces the old static-bomb
  // renderer; same name, same 140 dispatch.
  function drawLiveBombs() {
    var nowS = performance.now() / 1000;
    for (var i = 0; i < liveBombs.length; i++) {
      var b = liveBombs[i];
      var isLarge = b.size === 'large';
      var prog = 1 - (b.fuseT / b.fuseMax);
      // Pulse rate accelerates as the fuse burns down; the last second
      // goes mad-flickery so the player feels the urgency.
      var pulseHz = 2 + prog * 8;
      var pulse = (Math.sin(nowS * pulseHz * Math.PI * 2) + 1) * 0.5;

      // Soft danger halo, growing and quickening as the fuse runs down.
      var haloR = (isLarge ? 14 : 10) + pulse * (isLarge ? 6 : 4) + prog * 4;
      var halo = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, haloR);
      halo.addColorStop(0, 'rgba(255,80,40,' + (0.20 + pulse * 0.22 + prog * 0.18).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(b.x, b.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      if (isLarge) drawBombBundle(pulse); else drawBombStick(pulse);
      ctx.restore();

      // Countdown chip for the last second (billboard, never rotates).
      if (b.fuseT < 1) {
        ctx.fillStyle = 'rgba(255,200,80,' + (0.6 + pulse * 0.4).toFixed(2) + ')';
        ctx.font = 'bold 9px ' + UI_FONT;
        ctx.textAlign = 'center';
        ctx.fillText(b.fuseT.toFixed(1), b.x, b.y - 18);
        ctx.textAlign = 'left';
      }
    }
    drawBombSparks();
  }

  // World sprite for a small charge: one red dynamite stick in the shelf
  // icon's language (iron crimp caps, cream paper band, twine fuse with a
  // breathing ember). Local space, fuse up, ~9x18 px.
  function drawBombStick(pulse) {
    ctx.fillStyle = '#1a0a05'; ctx.fillRect(-4.5, -9.5, 9, 19);     // outline
    ctx.fillStyle = '#7a1a14'; ctx.fillRect(-3.5, -8.5, 7, 17);     // stick body
    ctx.fillStyle = '#a01a14'; ctx.fillRect(-2.5, -7.5, 5, 15);
    ctx.fillStyle = '#c83830'; ctx.fillRect(-2.5, -7.5, 1.5, 15);   // sheen edge
    ctx.fillStyle = '#2a2724'; ctx.fillRect(-4, -9, 8, 2.5);        // crimp caps
    ctx.fillStyle = '#4f4c46'; ctx.fillRect(-3.5, -8.8, 7, 1);
    ctx.fillStyle = '#2a2724'; ctx.fillRect(-4, 6.5, 8, 2.5);
    ctx.fillStyle = '#e8d098'; ctx.fillRect(-4, -1.5, 8, 3);        // paper band
    ctx.fillStyle = '#bfa46a'; ctx.fillRect(-4, 1, 8, 0.6);
    ctx.fillStyle = '#5e3e22'; ctx.fillRect(-0.75, -13, 1.5, 4.5);  // twine fuse
    ctx.fillStyle = pulse > 0.5 ? '#fff0b0' : '#ffd060';            // ember
    ctx.fillRect(-1, -14.5, 2, 2);
  }

  // World sprite for a large charge: the shelf icon's 3-stick bundle with
  // twine bands and the brass detonator clip. Local space, fuse up,
  // ~15x19 px.
  function drawBombBundle(pulse) {
    ctx.fillStyle = '#1a0a05'; ctx.fillRect(-7.5, -9.5, 15, 19);    // outline
    for (var di = 0; di < 3; di++) {
      var x2 = -6.5 + di * 4.5;
      ctx.fillStyle = '#7a1a14'; ctx.fillRect(x2, -8.5, 4, 17);
      ctx.fillStyle = '#a01a14'; ctx.fillRect(x2 + 0.5, -7.5, 3, 15);
      ctx.fillStyle = '#c83830'; ctx.fillRect(x2 + 0.5, -7, 1, 14);
      ctx.fillStyle = '#3a1410'; ctx.fillRect(x2, -8.5, 4, 1.5);
      ctx.fillRect(x2, 7, 4, 1.5);
    }
    ctx.fillStyle = '#3a1810'; ctx.fillRect(-7, -3.5, 14, 2.5);     // twine bands
    ctx.fillStyle = '#5e3e22'; ctx.fillRect(-7, -3.5, 14, 0.7);
    ctx.fillStyle = '#3a1810'; ctx.fillRect(-7, 2.5, 14, 2.5);
    ctx.fillStyle = '#5e3e22'; ctx.fillRect(-7, 2.5, 14, 0.7);
    ctx.fillStyle = '#1a0a05'; ctx.fillRect(-2, -12.5, 9, 4);       // brass clip
    ctx.fillStyle = '#7a5a2c'; ctx.fillRect(-1.5, -12, 8, 3);
    ctx.fillStyle = '#a07c40'; ctx.fillRect(-1.5, -12, 8, 1);
    ctx.fillStyle = '#5e3e22'; ctx.fillRect(5, -13.5, 1.5, 3);      // fuse stub
    ctx.fillStyle = pulse > 0.5 ? '#fff0b0' : '#ffd060';            // ember
    ctx.fillRect(5.5, -14.5, 2, 2);
  }

  function drawBombSparks() {
    for (var i = 0; i < bombSparks.length; i++) {
      var s = bombSparks[i];
      var a = s.t / s.max;
      if (a > 0.6) ctx.fillStyle = 'rgba(255,240,176,' + a.toFixed(2) + ')';
      else ctx.fillStyle = 'rgba(255,170,60,' + (a * 0.9).toFixed(2) + ')';
      ctx.fillRect(s.x - 0.75, s.y - 0.75, 1.5, 1.5);
    }
  }

  // Dev/debug handle (matches the window.__trees pattern). spawn() skips
  // the inventory on purpose; activateBomb owns the economy.
  window.__bombs = {
    count: function () { return liveBombs.length; },
    info: function () {
      var resting = 0;
      for (var i = 0; i < liveBombs.length; i++) if (liveBombs[i].resting) resting++;
      return { live: liveBombs.length, resting: resting, embers: bombSparks.length };
    },
    spawn: function (size, vx, vy) {
      bombSpawn(size === 'large' ? 'large' : 'small');
      var b = liveBombs[liveBombs.length - 1];
      if (b && typeof vx === 'number') b.vx = vx;
      if (b && typeof vy === 'number') b.vy = vy;
      return b;
    },
    boomAll: function () {
      var n = liveBombs.length;
      while (liveBombs.length) bombBoom(liveBombs.pop());
      return n;
    },
    tune: bombTune
  };
