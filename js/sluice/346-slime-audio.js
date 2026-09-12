  // Physics reports the strongest wet contact per body, then this controller
  // selects one nearby event after all substeps. A pile is one soundscape,
  // not a separate squelch for every point in the contact solver.
  var slimeAudioGap = 0;
  function slimeAudioState(b) {
    return b._sound || (b._sound = { hit: 0, jet: 0, cool: 0, x: 0, y: 0 });
  }
  function slimeAudioJet(b, x, y, force) {
    if (!rocketJetVisible()) return;
    var s = slimeAudioState(b);
    if (force > s.jet) { s.jet = force; s.jx = x; s.jy = y; }
  }
  function slimeAudioImpact(b, ringK, speed) {
    if (ringK < 0 || speed < 95 || b.sleeping || b.frozen) return;
    // Equilibrium pulses in a resting pile are not audible collisions.
    var vx = b.vx * JELLO_TIMESCALE, vy = b.vy * JELLO_TIMESCALE;
    if (vx * vx + vy * vy < 3600) return;
    var s = slimeAudioState(b), strength = Math.min(1, (speed - 65) / 360);
    if (strength > s.hit) {
      var k = b.ring[ringK];
      s.hit = strength; s.x = b.px[k]; s.y = b.py[k];
    }
  }
  function slimeAudioUpdate(dt) {
    var quiet = !ENABLE_JELLO || gamePaused || gameOver || gameWon || shopOpen ||
      shopState !== 'closed' || ledgerOpen || cargoManifestOpen;
    slimeAudioGap = Math.max(0, slimeAudioGap - dt);
    var best = null, score = 0;
    for (var i = 0; i < jelloBodies.length; i++) {
      var b = jelloBodies[i], s = b._sound;
      if (!s) continue;
      s.cool = Math.max(0, s.cool - dt);
      if (!quiet && !b.frozen && !b.sleeping && s.cool === 0 && slimeAudioGap === 0) {
        var hit = s.hit > 0, power = hit ? s.hit : s.jet;
        var x = hit ? s.x : s.jx, y = hit ? s.y : s.jy;
        var dx = x - player.x - PLAYER_W / 2, dy = y - player.y - PLAYER_H / 2;
        var distance = Math.sqrt(dx * dx + dy * dy) / (TILE * 14);
        var near = Math.max(0, 1 - distance);
        var visible = x >= cam.x && x <= cam.x + screenW && y >= cam.y && y <= cam.y + screenH;
        var weight = power * near * (hit ? 1.15 : 1);
        if (visible && weight > score && power > 0.07) {
          score = weight;
          best = { body: b, state: s, hit: hit, power: power, near: near, x: x };
        }
      }
      // Never queue collisions across cooldowns or a paused/frozen frame.
      s.hit = s.jet = 0;
    }
    if (!best) return;
    var size = Math.sqrt(best.body.tileW * best.body.tileH);
    var pitch = Math.max(0.82, Math.min(1.12, 1.13 - size * 0.045));
    sfxPlay(best.hit ? 'jello-slap' : 'jello-churn', {
      gain: (best.hit ? 0.32 + best.power * 0.58 : 0.24 + best.power * 0.50) * best.near * best.near,
      rate: pitch, pan: sfxPanAt(best.x)
    });
    best.state.cool = best.hit ? 0.34 : 0.30 + Math.random() * 0.14;
    slimeAudioGap = best.hit ? 0.16 : 0.23 + Math.random() * 0.08;
  }
