  /* ---- Landing feedback ---- */
  // One contact event, using velocity at the surface after braking and water
  // drag. A grounded frame or a tiny drilling step never counts as a landing.
  function recordLandingImpact(speed, groundY, surface, cushion) {
    if ((player.airTime || 0) < 0.12 || speed <= 80 || !player.fx) return;
    var fx = player.fx;
    fx.landN++;
    fx.landVy = speed;
    fx.landTilt = Math.abs(player.bodyTiltRender || 0);
    fx.landX = player.x + PLAYER_W * 0.5;
    fx.landY = groundY;
    fx.landSurface = surface;
    fx.landCushion = cushion;
  }

  function resetLandingFeedback() {
    _pfxLandSeen = player.fx ? player.fx.landN : 0;
    _hapLandN = _pfxLandSeen;
    _pfxLandAge = 1;
    _pfxLandDip = 0;
    player.airTime = 0;
    player.peakFallVy = 0;
  }
