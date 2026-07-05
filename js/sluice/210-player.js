  /* ---- Drill animation (update loop + cutter spin) ----
     Lerps drillAnim.angle / .extension toward targets driven by the
     current drilling state, and advances pumpPhase / coneSpin so the
     cutter head visibly spins. Idle stow angle mirrors player.dir so
     the bit hangs off the front of the rig. */
  function updateDrillAnim(dt) {
    var targetA, targetE;
    if (drilling) {
      if (drilling.dirVec === 'd') targetA = Math.PI / 2;
      else if (drilling.dirVec === 'u') targetA = -Math.PI / 2;
      else if (drilling.dirVec === 'r') targetA = 0;
      else if (drilling.dirVec === 'l') targetA = Math.PI;
      else targetA = drillAnim.targetAngle;
      targetE = 1;
    } else if (player.thrusting && player.fuel > 0) {
      // Thrusting — drill points up. The whole chassis carries the bank, so
      // the arm itself stays readable instead of double-leaning.
      var liftFrac = Math.min(1, rocketIntensity);
      var upAng = (player.dir > 0) ? (-Math.PI * 0.35) : (Math.PI + Math.PI * 0.35);
      var idleAng = (player.dir > 0) ? (Math.PI * 0.45) : (Math.PI * 0.55);
      targetA = idleAng + (upAng - idleAng) * liftFrac;
      targetE = 0.3 * liftFrac;
    } else if (player.onGround && Math.abs(player.vx) > 30) {
      // Driving — point the bit forward in the direction of motion and
      // extend partially so it reads as "ready to bite". Scales with speed
      // so a slow nudge barely deploys the arm.
      var driveFrac = Math.min(1, (Math.abs(player.vx) - 30) / 140);
      targetA = (player.vx > 0) ? 0 : Math.PI;
      targetE = 0.55 * driveFrac;
    } else {
      targetA = (player.dir > 0) ? (Math.PI * 0.45) : (Math.PI * 0.55);
      targetE = 0;
    }
    drillAnim.targetAngle = targetA;
    drillAnim.targetExtension = targetE;

    var d = drillAnim.targetAngle - drillAnim.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // Airborne rocket taps make the drill pop up quickly, then settle down
    // slowly enough that a new tap can catch it before it fully stows.
    var airbornePose = !drilling && !player.onGround;
    var liftingDrill = player.dir > 0 ? d < 0 : d > 0;
    var lerpRate = (player.thrusting && !drilling) ? 28 : 14;
    if (airbornePose) lerpRate = liftingDrill ? 24 : 2.6;
    drillAnim.angle += d * Math.min(1, lerpRate * dt);

    var extRate = (player.thrusting && !drilling) ? 24 : 12;
    if (airbornePose) extRate = drillAnim.targetExtension > drillAnim.extension ? 18 : 2.8;
    drillAnim.extension += (drillAnim.targetExtension - drillAnim.extension) * Math.min(1, extRate * dt);

    var spinRate = drilling ? 26 : 0;
    drillAnim.coneSpin += spinRate * dt;
    if (drillAnim.coneSpin > Math.PI * 200) drillAnim.coneSpin -= Math.PI * 200;
    drillAnim.pumpPhase += (drilling ? 20 : 0) * dt;
    if (drillAnim.pumpPhase > Math.PI * 200) drillAnim.pumpPhase -= Math.PI * 200;
  }

  // v12.2 — World Y of the first solid surface directly below the rig, or
  // null if nothing solid is within range. Used to ground-cast the rig's
  // contact shadow instead of gluing it to the rig's feet.
  function groundYBelowPlayer() {
    var col = Math.floor((player.renderX + PLAYER_W / 2) / TILE);
    var startRow = Math.floor((player.renderY + PLAYER_H) / TILE);
    var endRow = startRow + 96;   // scan deep enough that the shadow persists while flying
    for (var r = startRow; r <= endRow; r++) {
      if (tileAt(r, col) !== null) return r * TILE;
    }
    return null;
  }

  function drawPlasmaCrownTooth(headR) {
    ctx.save();

    ctx.fillStyle = '#090512';
    ctx.beginPath();
    ctx.moveTo(headR + 0.10, -1.46);
    ctx.lineTo(headR + 1.78, -1.52);
    ctx.lineTo(headR + 2.16, -0.48);
    ctx.lineTo(headR + 2.42, 0);
    ctx.lineTo(headR + 2.16, 0.48);
    ctx.lineTo(headR + 1.78, 1.52);
    ctx.lineTo(headR + 0.10, 1.46);
    ctx.lineTo(headR + 0.44, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2b1740';
    ctx.beginPath();
    ctx.moveTo(headR + 0.34, -1.16);
    ctx.lineTo(headR + 1.54, -1.22);
    ctx.lineTo(headR + 1.86, -0.40);
    ctx.lineTo(headR + 2.12, 0);
    ctx.lineTo(headR + 1.86, 0.40);
    ctx.lineTo(headR + 1.54, 1.22);
    ctx.lineTo(headR + 0.34, 1.16);
    ctx.lineTo(headR + 0.62, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#c45cff';
    ctx.beginPath();
    ctx.moveTo(headR + 0.78, -0.34);
    ctx.lineTo(headR + 1.82, -0.26);
    ctx.lineTo(headR + 2.16, 0);
    ctx.lineTo(headR + 1.82, 0.26);
    ctx.lineTo(headR + 0.78, 0.34);
    ctx.lineTo(headR + 1.06, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8a42ff';
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(headR + 0.42, -1.00);
    ctx.lineTo(headR + 1.40, -0.92);
    ctx.lineTo(headR + 1.20, -0.64);
    ctx.lineTo(headR + 0.52, -0.68);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR + 0.42, 1.00);
    ctx.lineTo(headR + 1.40, 0.92);
    ctx.lineTo(headR + 1.20, 0.64);
    ctx.lineTo(headR + 0.52, 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f9eaff';
    ctx.fillRect(headR + 0.98, -0.09, 0.68, 0.18);
    ctx.fillRect(headR + 1.66, -0.04, 0.26, 0.08);

    ctx.strokeStyle = '#e476ff';
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.moveTo(headR + 0.58, -0.62);
    ctx.lineTo(headR + 1.90, 0);
    ctx.lineTo(headR + 0.58, 0.62);
    ctx.stroke();

    ctx.strokeStyle = '#6ffbff';
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.moveTo(headR + 0.50, -1.10);
    ctx.lineTo(headR + 1.70, -0.42);
    ctx.moveTo(headR + 0.50, 1.10);
    ctx.lineTo(headR + 1.70, 0.42);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlasmaCrownHub(headR) {
    ctx.save();
    ctx.fillStyle = '#080411';
    ctx.beginPath();
    ctx.moveTo(0, -headR * 0.38);
    ctx.lineTo(headR * 0.28, -headR * 0.22);
    ctx.lineTo(headR * 0.38, 0);
    ctx.lineTo(headR * 0.28, headR * 0.22);
    ctx.lineTo(0, headR * 0.38);
    ctx.lineTo(-headR * 0.28, headR * 0.22);
    ctx.lineTo(-headR * 0.38, 0);
    ctx.lineTo(-headR * 0.28, -headR * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d36bff';
    ctx.lineWidth = 0.46;
    ctx.stroke();

    ctx.strokeStyle = '#78fbff';
    ctx.lineWidth = 0.36;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.24, -headR * 0.12);
    ctx.lineTo(headR * 0.24, headR * 0.12);
    ctx.moveTo(-headR * 0.24, headR * 0.12);
    ctx.lineTo(headR * 0.24, -headR * 0.12);
    ctx.stroke();

    ctx.fillStyle = '#f9e6ff';
    ctx.fillRect(-0.48, -0.48, 0.96, 0.96);
    ctx.fillStyle = '#c45cff';
    ctx.fillRect(-0.24, -0.24, 0.48, 0.48);

    ctx.restore();
  }

  // Ground-cast contact shadow for the rig, drawn standalone in world space
  // (v17.91) BEFORE the jello + body so both render on top of it — otherwise
  // the shadow shows through the translucent gel. Drops onto the first solid
  // surface below the rig; widens + fades as the rig lifts off.
  function drawPlayerShadow() {
    var shGroundY = groundYBelowPlayer();
    if (shGroundY === null) return;
    var shH = shGroundY - (player.renderY + PLAYER_H);
    if (shH < 0) shH = 0;
    // v24.60 — drop shadow reads as the rig's contact patch: full + dark on the
    // deck, then it SHRINKS and lightens as the rig lifts, gone by ~2 blocks up
    // (a quick read on height + where you'll set down, the way a platformer drop
    // shadow works). (Supersedes v24.41, which GREW the shadow wider on the way
    // up and only faded it out ~12 tiles up.)
    var shK = shH / (TILE * 2); if (shK > 1) shK = 1;  // gone by ~2 blocks up
    if (shK >= 1) return;                              // 2+ blocks up -> no shadow
    var grip = 1 - shK;                                // 1 on the deck -> 0 at 2 blocks
    var shA = 0.40 * grip;                             // darkens toward the deck
    var shRX = 10.5 * grip + 0.8;                      // width shrinks with the lift
    var shRY = 2.4 * grip + 0.3;                       // height shrinks with the lift
    var shCX = player.renderX + PLAYER_W / 2;          // world X, centred on the rig
    var shCY = shGroundY - 0.8;                        // ride the block lip, don't sink in
    var shCol = 'rgba(0,0,0,' + shA.toFixed(3) + ')';
    var shGrad = ctx.createRadialGradient(shCX, shCY, 0, shCX, shCY, shRX);
    shGrad.addColorStop(0, shCol);
    shGrad.addColorStop(0.4, shCol);
    shGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(shCX, shCY, shRX, shRY, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // v23.36 — static rig-part gradients built once, not every frame. drawPlayer
  // runs every frame (the rig is always on screen) and re-created 7 gradients
  // whose endpoints and stops are pure literals (the hull/track/cupola/etc.
  // bodywork). These are drawn in the rig's LOCAL coordinate frame, and a
  // canvas gradient's coordinates are applied in whatever user space is active
  // at fill time, so a reused object paints identically frame to frame
  // regardless of the rig's world position/zoom/flip. The drill bit gradients
  // are deliberately NOT cached: their endpoints follow the live drill
  // extension and their stops switch on drill tier. Pixel-identical.
  // Built lazily with the main ctx (drawPlayer only ever runs in the main
  // render pass, never with ctx swapped to a chunk canvas), and a CanvasGradient
  // is bound to its creating context, so this stays valid for the run.
  var _playerGrads = null;
  function ensurePlayerGrads() {
    if (_playerGrads) return _playerGrads;
    var g = {};
    g.track = ctx.createLinearGradient(0, 18, 0, 25);
    g.track.addColorStop(0, '#2a2f2c');
    g.track.addColorStop(0.55, '#151817');
    g.track.addColorStop(1, '#070808');
    g.hull = ctx.createLinearGradient(0, 5, 0, 20);
    g.hull.addColorStop(0, '#59634f');
    g.hull.addColorStop(0.42, '#3e483b');
    g.hull.addColorStop(0.78, '#242c28');
    g.hull.addColorStop(1, '#121615');
    g.collar = ctx.createLinearGradient(16, 8, 21, 15);
    g.collar.addColorStop(0, '#4f5a50');
    g.collar.addColorStop(1, '#171a19');
    g.cupola = ctx.createLinearGradient(0, 4, 0, 11);
    g.cupola.addColorStop(0, '#68715f');
    g.cupola.addColorStop(1, '#252c28');
    g.pipe = ctx.createLinearGradient(2.7, 0, 5.6, 0);
    g.pipe.addColorStop(0, '#070807');
    g.pipe.addColorStop(0.5, '#60655f');
    g.pipe.addColorStop(1, '#101211');
    g.pod = ctx.createLinearGradient(0, -1.4, 0, 1.4);
    g.pod.addColorStop(0, '#758075');
    g.pod.addColorStop(0.52, '#303a35');
    g.pod.addColorStop(1, '#0b0f0e');
    g.cone = ctx.createLinearGradient(20, 11, 27, 11);
    g.cone.addColorStop(0, 'rgba(210,215,200,0.14)');
    g.cone.addColorStop(1, 'rgba(210,215,200,0)');
    _playerGrads = g;
    return g;
  }

  // ----- Flight FX state (render-only) -----
  // Touchdown suspension squash + rotation smear ghosts + buffet tremble.
  // Event counters in player.fx (bumped by the flight integrator in 080) are
  // consumed here by diffing against last-seen values, the same pattern as
  // the haptics shim (057). Everything below is a draw-transform trick: no
  // physics state is written, and drawPlayerShadow never sees any of it, so
  // the ground-cast shadow stays honest.
  var _pfxTime = 0;            // render-time accumulator, seconds
  var _pfxLast = 0;            // previous performance.now() sample
  var _pfxLandSeen = 0;        // last-seen player.fx.landN
  var _pfxLandAge = 9;         // seconds since the touchdown squash started
  var _pfxLandDip = 0;         // squash depth captured at touchdown

  // Advance the render-time clock and diff the landing counter. Called once
  // at the top of drawPlayer; deltas come from performance.now() and clamp
  // to 50ms so a backgrounded tab cannot fast-forward the squash spring.
  function playerFxTick() {
    var now = performance.now();
    var dtl = (now - _pfxLast) / 1000;
    _pfxLast = now;
    if (dtl < 0) dtl = 0;
    if (dtl > 0.05) dtl = 0.05;
    _pfxTime += dtl;
    _pfxLandAge += dtl;
    var fx = player.fx;
    if (fx && fx.landN !== _pfxLandSeen) {
      _pfxLandSeen = fx.landN;
      // Suspension travel: the base dip scales with impact fall speed; hard
      // and/or tilted touchdowns compress deeper, capped at 0.20.
      var impVy = fx.landVy || 0;
      var dip = impVy / 3000;
      if (dip > 0.16) dip = 0.16;
      if (impVy > 420) dip += (impVy - 420) / 12000;
      dip += (fx.landTilt || 0) * 0.04;
      if (dip > 0.20) dip = 0.20;
      _pfxLandDip = dip;
      _pfxLandAge = 0;
    }
  }

  // Current landing-squash deflection, evaluated in closed form so any frame
  // dt stays numerically stable: a slightly underdamped spring (w0 = 32
  // rad/s, zeta = 0.45) starts at the touchdown depth, springs back through
  // zero, overshoots once (~20% of the dip, near 110ms) and has settled by
  // ~180ms. Positive = squash, negative = the brief stretch overshoot.
  function playerFxLandSquash() {
    if (_pfxLandDip <= 0 || _pfxLandAge >= 0.3) return 0;
    var zw = 14.4;    // zeta * w0
    var wd = 28.57;   // damped frequency, w0 * sqrt(1 - zeta * zeta)
    var ta = _pfxLandAge;
    return _pfxLandDip * Math.exp(-zw * ta) *
      (Math.cos(wd * ta) + (zw / wd) * Math.sin(wd * ta));
  }

  // The rig body draw pass (track bed, hull, cupola, stack, lamp), factored
  // out of drawPlayer so the rotation smear ghosts can re-run the exact same
  // draw path with an angle + alpha override. Expects the caller to have set
  // up the full body transform (translate + tilt + squash + flip); the drill
  // assembly is NOT part of this pass, it stays world-space in drawPlayer.
  function drawPlayerRigBody(t) {
    var pgrad = ensurePlayerGrads();

    var movingRig = drilling || player.thrusting || Math.abs(player.vx) > 5;
    var gait = player.x * 0.16;

    // ----- T-10M-inspired track bed -----
    ctx.fillStyle = pgrad.track;
    roundRect(ctx, 1.3, 18.3, 19.4, 6.8, 2.2, true);
    ctx.strokeStyle = '#050606';
    ctx.lineWidth = 1;
    roundRect(ctx, 1.3, 18.3, 19.4, 6.8, 2.2, false, true);

    var treadOffset = Math.floor((player.x * 0.16) % 4);
    ctx.fillStyle = '#3c413c';
    ctx.save();
    ctx.beginPath();
    ctx.rect(2.2, 18.8, 17.6, 5.8);
    ctx.clip();
    for (var tr = 0; tr < 8; tr++) {
      ctx.fillRect(2.4 + tr * 3 - treadOffset, 19.0, 1.45, 4.9);
    }
    ctx.restore();
    for (var rw = 0; rw < 5; rw++) {
      var rx = 4.0 + rw * 3.5;
      ctx.fillStyle = '#090a0a';
      ctx.beginPath();
      ctx.arc(rx, 22.0, 1.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#525a50';
      ctx.beginPath();
      ctx.arc(rx, 22.0, 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    // ----- Heavy cast armor hull -----
    ctx.fillStyle = pgrad.hull;
    ctx.beginPath();
    ctx.moveTo(2.6, 17.6);
    ctx.lineTo(4.9, 10.0);
    ctx.quadraticCurveTo(8.6, 5.6, 14.6, 5.7);
    ctx.lineTo(19.8, 10.2);
    ctx.lineTo(19.0, 17.7);
    ctx.quadraticCurveTo(14.0, 20.6, 7.0, 20.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#070909';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Forward borer collar welded into the glacis.
    ctx.fillStyle = pgrad.collar;
    ctx.beginPath();
    ctx.moveTo(16.8, 8.6);
    ctx.lineTo(21.2, 10.4);
    ctx.lineTo(21.2, 14.2);
    ctx.lineTo(16.7, 16.2);
    ctx.quadraticCurveTo(18.6, 12.4, 16.8, 8.6);
    ctx.fill();

    // ----- Low command cupola and periscope slit -----
    ctx.fillStyle = pgrad.cupola;
    ctx.beginPath();
    ctx.moveTo(6.4, 9.6);
    ctx.quadraticCurveTo(8.5, 5.1, 13.7, 4.7);
    ctx.quadraticCurveTo(16.6, 5.0, 17.5, 8.6);
    ctx.lineTo(16.9, 10.8);
    ctx.lineTo(6.1, 11.0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#080a09';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#0a0d0c';
    roundRect(ctx, 8.0, 7.4, 7.2, 1.7, 0.7, true);
    ctx.fillStyle = 'rgba(178,188,160,0.38)';
    ctx.fillRect(8.8, 7.75, 5.0, 0.45);

    // ----- Connected rear exhaust stack -----
    // Smoke still spawns from the stack mouth via getExhaustWorldPos().
    ctx.fillStyle = '#171a18';
    ctx.beginPath();
    ctx.moveTo(2.4, 8.0);
    ctx.lineTo(5.7, 8.0);
    ctx.lineTo(7.0, 11.0);
    ctx.lineTo(3.4, 12.2);
    ctx.lineTo(2.1, 10.0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#070807';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = pgrad.pipe;
    roundRect(ctx, 2.9, 0.8, 2.8, 8.0, 0.8, true);
    // Dark mouth and warm rim.
    ctx.fillStyle = '#050506';
    ctx.beginPath();
    ctx.ellipse(4, 1.0, 1.45, 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    // Thin coppery rim around the mouth.
    ctx.strokeStyle = 'rgba(145,154,142,0.5)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.ellipse(4, 1.0, 1.55, 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Faint heat shimmer band at base of pipe (when running hard)
    if (movingRig) {
      var glowAlpha = 0.18 + Math.sin(t * 28) * 0.05;
      ctx.fillStyle = 'rgba(180,188,170,' + glowAlpha.toFixed(3) + ')';
      ctx.fillRect(3.6, 8.0, 1.3, 1.0);
    }

    // Small running light.
    var blink = (Math.sin(t * 4) + 1) * 0.5;
    ctx.fillStyle = 'rgba(255,70,58,' + (0.45 + blink * 0.45).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(6.0, 16.5, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // ----- Hooded white work lamp -----
    ctx.fillStyle = '#d7dbd0';
    ctx.beginPath();
    ctx.arc(19.0, 11.3, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pgrad.cone;
    ctx.beginPath();
    ctx.moveTo(20, 10.0);
    ctx.lineTo(27, 7.6);
    ctx.lineTo(27, 15.0);
    ctx.lineTo(20, 12.6);
    ctx.closePath();
    ctx.fill();
  }

  // Applies one full rig-body pass: world translate, tilt about the rig
  // centre, feet-anchored squash scale, then the facing flip, in the same
  // order the body transform has always used, and draws the body inside it.
  // The rotation smear ghosts call this with a past angle and a low alpha;
  // the main sprite calls it with alpha 1. One body pass per call, no
  // allocations, and the save/restore keeps the ghost alpha self-contained.
  function drawRigBodyPass(ox, oy, tilt, sx, sy, flip, alpha, t) {
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    if (Math.abs(tilt) > 0.0001) {
      ctx.translate(PLAYER_W * 0.5, PLAYER_H * 0.56);
      ctx.rotate(tilt);
      ctx.translate(-PLAYER_W * 0.5, -PLAYER_H * 0.56);
    }
    if (sy !== 1 || sx !== 1) {
      ctx.translate(PLAYER_W / 2, PLAYER_H);
      ctx.scale(sx, sy);
      ctx.translate(-PLAYER_W / 2, -PLAYER_H);
    }
    if (flip) {
      ctx.translate(PLAYER_W, 0);
      ctx.scale(-1, 1);
    }
    drawPlayerRigBody(t);
    ctx.restore();
  }

  function drawPlayer() {
    playerFxTick();

    var t = performance.now() / 1000;

    // Drill shake offset
    var shakeX = 0, shakeY = 0;
    if (drilling) {
      shakeX = (Math.random() - 0.5) * 0.6;
      shakeY = (Math.random() - 0.5) * 0.6;
    }
    // Airframe shiver (v24.117): EVENT-driven only. Discrete moments (a bomb
    // blast nearby, 065) kick player.tremor and it decays out in ~0.3s in the
    // integrator (080); there is NO continuous source. Barely-there by design
    // (motion you feel, not see): ~0.45 deg of rotational strain plus a
    // ~0.25px lateral whisper at the kick instant, fading fast. Angular into
    // bodyTilt below so hull + arm strain together; camera/world/HUD solid.
    var trembleTilt = 0;
    if ((player.tremor || 0) > 0) {
      var bufK = player.tremor;
      trembleTilt = (Math.sin(_pfxTime * 53) + 0.5 * Math.sin(_pfxTime * 37 + 1.3)) * 0.0055 * bufK;
      shakeX += Math.sin(_pfxTime * 41 + 0.7) * 0.25 * bufK;
    }

    // v23.70 — rotational free-flight points the whole rig along its thrust
    // heading (angle 0 = thrust right, -pi/2 = thrust up; +pi/2 maps the rig's
    // natural "up" onto the heading). Otherwise use the small legacy flight bank.
    // v23.82 — single eased source (computed in update), so the rig + its exhaust
    // rotate in lockstep and the rotation->upright boundary eases instead of snapping.
    var bodyTilt = (player.bodyTiltRender || 0) + trembleTilt;

    // v17.91 — the ground-cast contact shadow is now drawn by
    // drawPlayerShadow() BEFORE the jello (from render()), so the translucent
    // gel renders over the shadow instead of the shadow showing through it.

    // Squash on landing impact (positive) + airborne stretch (driven by vy).
    // Stretch is computed every frame from current motion so the rig
    // visibly elongates during a hard climb or free-fall — selling the speed
    // without any extra state. Squash always wins over stretch when present
    // so landing feedback never gets diluted.
    var sq = player.squash || 0;
    var fxSq = playerFxLandSquash();
    var stretchK = 0;
    if (sq < 0.05 && fxSq <= 0.01 && !drilling) {
      var vyAbs = Math.abs(player.vy);
      if (vyAbs > 90) {
        stretchK = (vyAbs - 90) / 380;
        if (stretchK > 1) stretchK = 1;
        // Ascending under power feels punchier with stronger stretch
        if (player.vy < 0 && player.thrustSpool > 0.4) stretchK *= 1.25;
        else stretchK *= 0.7;
        if (stretchK > 0.55) stretchK = 0.55;
      }
    }
    var sy = 1, sx = 1;
    if (sq > 0) {
      sy = 1 - sq * 0.18;
      sx = 1 + sq * 0.15;
    } else if (stretchK > 0) {
      sy = 1 + stretchK * 0.18;
      sx = 1 - stretchK * 0.10;
    }
    // Touchdown suspension squash (event-driven off player.fx.landN) rides
    // multiplicatively on top, anchored at the same feet point, so it
    // composes with the tilt and with whatever the physics squash is doing.
    // Volume conserving: its scaleX is exactly 1 / scaleY.
    var fxSy = 1, fxSx = 1;
    if (fxSq !== 0) {
      fxSy = 1 - fxSq;
      if (fxSy < 0.7) fxSy = 0.7;   // safety floor, the dip caps at 0.20
      fxSx = 1 / fxSy;
      sy *= fxSy;
      sx *= fxSx;
    }

    // Flip horizontally if facing left. The bank is a lean, never a
    // reorientation (v25.49: the one flight model never rotates the rig),
    // so the mirror always follows the travel direction.
    var rigFlip = player.dir < 0;

    var rigOX = player.renderX + shakeX;
    var rigOY = player.renderY + shakeY;

    // Main body pass. Translate uses the smoothed render position so
    // corner-correction snaps ease in instead of teleporting the sprite.
    // The drill assembly below renders AFTER this pass pops the mirrored
    // frame, so it can use true world-space angles without having to
    // compensate for the horizontal flip.
    drawRigBodyPass(rigOX, rigOY, bodyTilt, sx, sy, rigFlip, 1, t);

    // ===== Drill assembly (world-space pivot, no mirroring) =====
    // The pivot lives on the front-bottom of the body. "Front" depends
    // on facing direction in world space, so we compute it here from
    // player.dir without going through the mirrored frame at all.
    // Drilling angles stay in true world space, while idle/thrust poses add
    // the chassis bank so the arm remains physically bolted to the rig.
    // Drill pivot anchored to renderX/Y so the drill stays attached to
    // the visible sprite during corner-correction snaps (the body inside
    // drawPlayer was already translated to renderX/Y above).
    var pivotLocalX = player.dir > 0 ? PLAYER_W - 4.2 : 4.2;
    var pivotLocalY = 15.2;

    // Apply squash to the pivot too so the drill stays attached
    if (player.squash > 0) {
      var sqAmt = player.squash;
      pivotLocalY = PLAYER_H - (PLAYER_H - 15.2) * (1 - sqAmt * 0.18);
    }
    // Fold the touchdown suspension squash into the pivot the same way, on
    // both axes, so the drill stays bolted to the hull through the landing
    // dip and its overshoot (playerLocalToWorld applies translate + tilt
    // only, so feet-anchored scales must be pre-applied in local space).
    if (fxSy !== 1) {
      pivotLocalY = PLAYER_H - (PLAYER_H - pivotLocalY) * fxSy;
      pivotLocalX = PLAYER_W * 0.5 + (pivotLocalX - PLAYER_W * 0.5) * fxSx;
    }

    var pivotWorld = playerLocalToWorld(pivotLocalX, pivotLocalY);
    var pivotWorldX = pivotWorld.x + shakeX;
    var pivotWorldY = pivotWorld.y + shakeY;
    var armAngle = drillAnim.angle + (drilling ? 0 : bodyTilt);
    // ----- Change: drill no longer pulsates in/out while drilling, and the
    // extended length is reduced so the bit doesn't poke out so far. The
    // pumpPhase is still tracked in case other systems want it but is no
    // longer applied to the visible arm length.
    var mountedDrillTier = drillArtTier(upgrades.drillLevel || 1);
    var rustyDrill = mountedDrillTier <= 1;
    var carbideDrill = mountedDrillTier === 3;
    var tungstenDrill = mountedDrillTier === 4;
    var diamondDrill = mountedDrillTier === 5;
    var plasmaDrill = mountedDrillTier >= 6;
    var crownDrill = diamondDrill || plasmaDrill;
    var armLen = 3.2 + drillAnim.extension * 2.4;
    var bitLen = 3.6 + drillAnim.extension * 0.8;

    ctx.save();
    ctx.translate(pivotWorldX, pivotWorldY);
    ctx.rotate(armAngle);

    // Hydraulic socket / housing at the pivot — scaled up so the
    // mounting bracket reads as substantial industrial hardware.
    if (rustyDrill) {
      ctx.fillStyle = '#1a0a05';
      roundRect(ctx, -2.8, -2.8, 5.6, 5.8, 1.1, true);
      ctx.fillStyle = '#25241c';
      roundRect(ctx, -2.1, -2.0, 4.2, 4.3, 0.9, true);
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(-2.1, -2.0, 4.2, 1.0);
      ctx.fillStyle = '#8a3d22';
      ctx.fillRect(1.0, 0.9, 1.1, 1.0);
      ctx.fillStyle = '#686c62';
      ctx.beginPath();
      ctx.arc(-0.2, 0, 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#171b19';
      roundRect(ctx, -3.0, -3.0, 6.0, 6.0, 1.4, true);
      ctx.fillStyle = plasmaDrill ? '#5a3a72' : (diamondDrill ? '#6f756e' : (tungstenDrill ? '#5e6666' : (carbideDrill ? '#9ca88f' : '#4a554d')));
      ctx.fillRect(-3.0, -3.0, 6.0, 1.1);
      ctx.fillStyle = plasmaDrill ? '#c45cff' : (diamondDrill ? '#b79a50' : (tungstenDrill ? '#737c7b' : (carbideDrill ? '#d1aa55' : '#838b80')));
      ctx.beginPath();
      ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
      if (plasmaDrill) {
        ctx.fillStyle = '#080d16';
        ctx.fillRect(-2.2, -0.42, 4.4, 0.84);
        ctx.fillStyle = '#d36bff';
        ctx.fillRect(-1.55, -0.12, 3.1, 0.24);
        ctx.fillStyle = '#78fbff';
        ctx.fillRect(-0.85, 0.22, 1.7, 0.18);
      } else if (diamondDrill) {
        ctx.fillStyle = '#101718';
        ctx.fillRect(-2.2, -0.40, 4.4, 0.80);
        ctx.fillStyle = '#c9b46d';
        ctx.fillRect(-1.4, -0.16, 2.8, 0.32);
      } else if (tungstenDrill) {
        ctx.fillStyle = '#22292a';
        ctx.fillRect(-2.2, -0.45, 4.4, 0.9);
        ctx.fillStyle = '#9aa3a0';
        ctx.fillRect(-1.5, -0.18, 3.0, 0.36);
      } else if (carbideDrill) {
        ctx.fillStyle = '#d8d4af';
        ctx.fillRect(-1.0, -0.35, 2.0, 0.7);
      }
    }

    // Telescoping arm (along +x in local frame after rotation) — wider
    // and longer so the drill carries visual weight.
    var armGrad = ctx.createLinearGradient(0, -1.9, 0, 1.9);
    armGrad.addColorStop(0,   rustyDrill ? '#4a4a40' : (plasmaDrill ? '#74518e' : (diamondDrill ? '#858b82' : (tungstenDrill ? '#667071' : (carbideDrill ? '#aebba4' : '#59635a')))));
    armGrad.addColorStop(0.5, rustyDrill ? '#262820' : (plasmaDrill ? '#28163a' : (diamondDrill ? '#343d3e' : (tungstenDrill ? '#2d3638' : (carbideDrill ? '#758773' : '#2c3430')))));
    armGrad.addColorStop(1,   rustyDrill ? '#100e0b' : (plasmaDrill ? '#090512' : (diamondDrill ? '#121819' : (tungstenDrill ? '#0b1011' : (carbideDrill ? '#344139' : '#111413')))));
    ctx.fillStyle = armGrad;
    ctx.fillRect(2.2, -1.9, armLen, 3.8);
    if (plasmaDrill) {
      ctx.fillStyle = '#4ff8ff';
      ctx.fillRect(2.55, -1.46, Math.max(0.6, armLen - 0.7), 0.34);
      ctx.fillStyle = '#d36bff';
      ctx.fillRect(2.55, 1.10, Math.max(0.6, armLen - 0.7), 0.30);
      ctx.fillStyle = '#0b111b';
      ctx.fillRect(2.55, -0.20, Math.max(0.6, armLen - 0.7), 0.40);
    } else if (diamondDrill) {
      ctx.fillStyle = '#c3b475';
      ctx.fillRect(2.55, -1.56, Math.max(0.6, armLen - 0.7), 0.52);
      ctx.fillStyle = '#242b2b';
      ctx.fillRect(2.55, 1.02, Math.max(0.6, armLen - 0.7), 0.42);
    } else if (tungstenDrill) {
      ctx.fillStyle = '#828c8c';
      ctx.fillRect(2.55, -1.55, Math.max(0.6, armLen - 0.7), 0.48);
      ctx.fillStyle = '#171d1e';
      ctx.fillRect(2.55, 0.92, Math.max(0.6, armLen - 0.7), 0.62);
    } else if (carbideDrill) {
      ctx.fillStyle = '#cfd6b6';
      ctx.fillRect(2.6, -1.55, Math.max(0.6, armLen - 0.8), 0.65);
      ctx.fillStyle = '#5a6f5e';
      ctx.fillRect(2.6, 1.05, Math.max(0.6, armLen - 0.8), 0.42);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.6;
    var seams = Math.max(1, Math.floor(armLen / 3.0));
    for (var s = 0; s < seams; s++) {
      var sxp = 2.2 + (s + 1) * (armLen / (seams + 1));
      ctx.beginPath();
      ctx.moveTo(sxp, -1.9);
      ctx.lineTo(sxp, 1.9);
      ctx.stroke();
    }
    if (rustyDrill) {
      ctx.fillStyle = '#7a3b1f';
      ctx.fillRect(3.0, 0.9, 1.5, 0.8);
      ctx.fillRect(2.2 + armLen - 1.4, -1.5, 1.2, 0.8);
      ctx.fillStyle = '#9c7a3e';
      ctx.fillRect(2.2 + armLen - 0.9, -1.8, 0.7, 3.6);
    }

    // ===== Drill bit — tricone roller style =====
    // Two visible roller cones (the front-facing pair of a 3-cone bit;
    // the third sits behind in the body axis and is hidden by them).
    // Each cone is rimmed and dotted with carbide-button "spike teeth"
    // and rotates while drilling. Steel/gunmetal coloring.
    var bitStartX = 2.2 + armLen;
    var shankLen  = bitLen * 0.30;
    var coneR     = 2.25 + drillAnim.extension * 0.35;
    var coneOff   = coneR * 0.68;             // vertical offset of each cone center from axis
    var coneCx    = bitStartX + shankLen + coneR * 0.9;
    var coneSpin  = drillAnim.coneSpin;

    // 1) Shank — short cylindrical neck connecting arm to cone assembly.
    var shankGrad = ctx.createLinearGradient(bitStartX, -1.9, bitStartX, 1.9);
    shankGrad.addColorStop(0,    rustyDrill ? '#4f4a3e' : (plasmaDrill ? '#5c3a78' : (diamondDrill ? '#68746f' : (tungstenDrill ? '#5f6869' : (carbideDrill ? '#b9c5ad' : '#5a5a62')))));
    shankGrad.addColorStop(0.5,  rustyDrill ? '#85806f' : (plasmaDrill ? '#c66cff' : (diamondDrill ? '#b8aa72' : (tungstenDrill ? '#a1aaaa' : (carbideDrill ? '#d8c98d' : '#9a9aa2')))));
    shankGrad.addColorStop(1,    rustyDrill ? '#34261d' : (plasmaDrill ? '#090b18' : (diamondDrill ? '#171d1d' : (tungstenDrill ? '#151a1b' : (carbideDrill ? '#6d7c6d' : '#3a3a42')))));
    ctx.fillStyle = shankGrad;
    ctx.fillRect(bitStartX, -1.9, shankLen + 0.5, 3.8);
    // Dark seam where shank meets cone assembly
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(bitStartX + shankLen, -1.9);
    ctx.lineTo(bitStartX + shankLen,  1.9);
    ctx.stroke();

    // Draw the two cones — counter-rotating for visual interest and
    // to clearly read as two separate rolling elements, not one wheel.
    // Rotary tunnel-borer cutter head.
    var headR = 4.0 + drillAnim.extension * 0.45;
    if (tungstenDrill) headR += 0.15;
    var headX = bitStartX + shankLen + headR * 0.28;
    var cutterSpin = drillAnim.coneSpin * 1.4;

    var ringGrad = ctx.createRadialGradient(headX - headR * 0.25, -headR * 0.25, headR * 0.2, headX, 0, headR);
    ringGrad.addColorStop(0, rustyDrill ? '#8e8c7f' : (plasmaDrill ? '#d36bff' : (diamondDrill ? '#aaa17e' : (tungstenDrill ? '#7d8786' : (carbideDrill ? '#d7dfca' : '#9aa098')))));
    ringGrad.addColorStop(0.55, rustyDrill ? '#464a3f' : (plasmaDrill ? '#3b1f52' : (diamondDrill ? '#394344' : (tungstenDrill ? '#30393a' : (carbideDrill ? '#81966f' : '#515953')))));
    ringGrad.addColorStop(1, rustyDrill ? '#15110d' : (plasmaDrill ? '#050612' : (diamondDrill ? '#080b0c' : (tungstenDrill ? '#050809' : (carbideDrill ? '#24312b' : '#171a19')))));
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(headX, 0, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070807';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (plasmaDrill) {
      ctx.strokeStyle = '#67fbff';
      ctx.lineWidth = 0.78;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#aa4cff';
      ctx.lineWidth = 0.44;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 1.08, -Math.PI * 0.86, Math.PI * 0.22);
      ctx.arc(headX, 0, headR - 1.52, Math.PI * 0.34, Math.PI * 1.18);
      ctx.stroke();
    } else if (diamondDrill) {
      ctx.strokeStyle = '#c9bd92';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#2a1f12';
      ctx.lineWidth = 0.38;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 1.18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tungstenDrill) {
      ctx.strokeStyle = '#111719';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#8e9896';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.95, -Math.PI * 0.86, Math.PI * 0.10);
      ctx.stroke();
    } else if (carbideDrill) {
      ctx.strokeStyle = '#d8d4af';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.55, -Math.PI * 0.82, Math.PI * 0.18);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(headX, 0);
    ctx.rotate(cutterSpin);
    if (crownDrill) {
      ctx.fillStyle = '#414b49';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.56);
      ctx.lineTo(headR * 0.40, -headR * 0.30);
      ctx.lineTo(headR * 0.56, 0);
      ctx.lineTo(headR * 0.40, headR * 0.30);
      ctx.lineTo(0, headR * 0.56);
      ctx.lineTo(-headR * 0.40, headR * 0.30);
      ctx.lineTo(-headR * 0.56, 0);
      ctx.lineTo(-headR * 0.40, -headR * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = plasmaDrill ? '#d36bff' : '#b8aa72';
      ctx.lineWidth = 0.42;
      ctx.stroke();
      ctx.fillStyle = plasmaDrill ? '#060912' : '#242b2b';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.34);
      ctx.lineTo(headR * 0.28, 0);
      ctx.lineTo(0, headR * 0.34);
      ctx.lineTo(-headR * 0.28, 0);
      ctx.closePath();
      ctx.fill();
    }
    var bladeCount = (tungstenDrill || crownDrill) ? 6 : 8;
    for (var blade = 0; blade < bladeCount; blade++) {
      var ba = (blade / bladeCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(ba);
      var toothGrad = ctx.createLinearGradient(0, -1.0, headR + 2.1, 1.0);
      toothGrad.addColorStop(0, rustyDrill ? '#3a2a1d' : (plasmaDrill ? '#070b12' : (diamondDrill ? '#242b2b' : (tungstenDrill ? '#202829' : (carbideDrill ? '#596856' : '#303631')))));
      toothGrad.addColorStop(1, rustyDrill ? '#a8a696' : (plasmaDrill ? '#c45cff' : (diamondDrill ? '#d2c391' : (tungstenDrill ? '#9aa4a2' : (carbideDrill ? '#dbe1be' : '#b6bab0')))));
      ctx.fillStyle = toothGrad;
      ctx.beginPath();
      if (tungstenDrill) {
        ctx.moveTo(headR * 0.02, -1.30);
        ctx.lineTo(headR + 2.10, -1.34);
        ctx.lineTo(headR + 1.82, 0);
        ctx.lineTo(headR + 2.10, 1.34);
        ctx.lineTo(headR * 0.02, 1.30);
      } else if (crownDrill) {
        ctx.moveTo(headR * 0.18, -1.05);
        ctx.lineTo(headR + 1.72, -1.06);
        ctx.lineTo(headR + 1.48, -0.28);
        ctx.lineTo(headR + 1.76, 0);
        ctx.lineTo(headR + 1.48, 0.28);
        ctx.lineTo(headR + 1.72, 1.06);
        ctx.lineTo(headR * 0.18, 1.05);
        ctx.lineTo(headR * 0.38, 0);
      } else {
        ctx.moveTo(headR * 0.18, -0.85);
        ctx.lineTo(headR + 2.0, -1.25);
        ctx.lineTo(headR + 1.2, 1.25);
        ctx.lineTo(headR * 0.18, 0.85);
      }
      ctx.closePath();
      ctx.fill();
      if (crownDrill) {
        ctx.fillStyle = '#151a19';
        ctx.beginPath();
        ctx.moveTo(headR + 0.22, -1.42);
        ctx.lineTo(headR + 1.42, -1.66);
        ctx.lineTo(headR + 2.08, -0.36);
        ctx.lineTo(headR + 2.34, 0);
        ctx.lineTo(headR + 2.08, 0.36);
        ctx.lineTo(headR + 1.42, 1.66);
        ctx.lineTo(headR + 0.22, 1.42);
        ctx.lineTo(headR + 0.50, 0);
        ctx.closePath();
        ctx.fill();
        var gemCx = headR + 1.46;
        var gemD = 1.18;
        var gemW = 1.72;
        ctx.fillStyle = '#071318';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.72, -gemW * 0.74);
        ctx.lineTo(gemCx - gemD * 0.22, -gemW * 1.03);
        ctx.lineTo(gemCx + gemD * 0.42, -gemW * 0.94);
        ctx.lineTo(gemCx + gemD * 0.90, -gemW * 0.36);
        ctx.lineTo(gemCx + gemD * 1.18, 0);
        ctx.lineTo(gemCx + gemD * 0.90, gemW * 0.36);
        ctx.lineTo(gemCx + gemD * 0.42, gemW * 0.94);
        ctx.lineTo(gemCx - gemD * 0.22, gemW * 1.03);
        ctx.lineTo(gemCx - gemD * 0.72, gemW * 0.74);
        ctx.lineTo(gemCx - gemD * 0.92, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a9f3ff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.56, -gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.74, -gemW * 0.30);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.lineTo(gemCx + gemD * 0.74, gemW * 0.30);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.lineTo(gemCx - gemD * 0.56, gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.72, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.58, -gemW * 0.26);
        ctx.lineTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#48c8df';
        ctx.beginPath();
        ctx.moveTo(gemCx + gemD * 0.58, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.lineTo(gemCx + gemD * 0.58, gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d5ffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.56, -gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.72, 0);
        ctx.lineTo(gemCx - gemD * 0.56, gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.lineTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f7ffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.44, -gemW * 0.18);
        ctx.lineTo(gemCx + gemD * 0.02, -gemW * 0.44);
        ctx.lineTo(gemCx + gemD * 0.48, -gemW * 0.18);
        ctx.lineTo(gemCx + gemD * 0.30, gemW * 0.20);
        ctx.lineTo(gemCx - gemD * 0.30, gemW * 0.20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gemCx - gemD * 0.48, -gemW * 0.62, 0.76, 0.34);
        ctx.strokeStyle = '#237e90';
        ctx.lineWidth = 0.38;
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.72, 0);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.moveTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.moveTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.moveTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.moveTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.stroke();
        ctx.fillStyle = '#151a19';
        ctx.fillRect(gemCx - gemD * 0.92, -0.18, 0.42, 0.36);
        ctx.fillRect(gemCx + gemD * 0.86, -0.18, 0.40, 0.36);
        ctx.fillRect(gemCx - gemD * 0.34, -gemW * 1.02, 0.52, 0.36);
        ctx.fillRect(gemCx - gemD * 0.34, gemW * 0.82, 0.52, 0.36);
        if (plasmaDrill) drawPlasmaCrownTooth(headR);
      } else if (tungstenDrill) {
        ctx.fillStyle = '#111718';
        ctx.fillRect(headR + 1.42, -0.72, 0.46, 1.44);
        ctx.fillStyle = '#b9c1bf';
        ctx.fillRect(headR + 0.34, -0.86, 0.74, 0.36);
      } else if (carbideDrill) {
        ctx.fillStyle = '#14241f';
        ctx.beginPath();
        ctx.moveTo(headR + 0.82, -0.72);
        ctx.lineTo(headR + 1.84, -0.88);
        ctx.lineTo(headR + 1.62, 0.62);
        ctx.lineTo(headR + 0.72, 0.70);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#dcd2a6';
        ctx.beginPath();
        ctx.moveTo(headR + 1.02, -0.58);
        ctx.lineTo(headR + 1.72, -0.70);
        ctx.lineTo(headR + 1.48, 0.46);
        ctx.lineTo(headR + 0.88, 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#91bfa9';
        ctx.fillRect(headR + 1.14, -0.16, 0.52, 0.30);
      }
      ctx.restore();
    }
    if (plasmaDrill) {
      drawPlasmaCrownHub(headR);
    } else if (diamondDrill) {
      ctx.fillStyle = '#b8aa72';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.34);
      ctx.lineTo(headR * 0.30, 0);
      ctx.lineTo(0, headR * 0.34);
      ctx.lineTo(-headR * 0.30, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#151a19';
      ctx.lineWidth = 0.34;
      ctx.stroke();
      ctx.fillStyle = '#151a19';
      for (var hubBolt = 0; hubBolt < 4; hubBolt++) {
        ctx.save();
        ctx.rotate(Math.PI * 0.25 + hubBolt * Math.PI * 0.5);
        ctx.fillRect(headR * 0.42, -0.14, 0.34, 0.28);
        ctx.restore();
      }
      ctx.fillStyle = '#ded2a3';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.16);
      ctx.lineTo(headR * 0.14, 0);
      ctx.lineTo(0, headR * 0.16);
      ctx.lineTo(-headR * 0.14, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = tungstenDrill ? '#050809' : (carbideDrill ? '#111614' : '#0b0d0c');
      ctx.beginPath();
      ctx.arc(0, 0, tungstenDrill ? headR * 0.31 : headR * 0.43, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tungstenDrill ? '#6f7978' : (carbideDrill ? '#c5984e' : '#747d73');
      var boltCount = tungstenDrill ? 8 : 6;
      for (var bolt = 0; bolt < boltCount; bolt++) {
        var boltA = (bolt / boltCount) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(boltA) * headR * 0.62, Math.sin(boltA) * headR * 0.62, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tungstenDrill ? '#9aa3a0' : (carbideDrill ? '#d8d4af' : '#b8bcb2');
      ctx.beginPath();
      ctx.arc(0, 0, headR * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (rustyDrill) {
      ctx.fillStyle = '#8a3d22';
      ctx.fillRect(-headR * 0.64, headR * 0.10, 1.0, 0.9);
      ctx.fillRect(headR * 0.28, -headR * 0.56, 0.9, 0.8);
    }
    ctx.restore();

    ctx.restore();
  }

