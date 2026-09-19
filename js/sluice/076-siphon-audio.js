  /* ---- Siphon and sky-guest sound: one quiet pressure voice ----
     Reuse the existing filtered fuel-pump asset and pooled gel contacts.
     All calls go through the normal audio shims, so gesture unlock, volume,
     pause, tab-hide, and the engine's abandoned-loop watchdog still own them.
     No air-only motor: actual transferred particles are the audio source. */
  var siphonAudioFlow = 0;
  var siphonAudioDriving = false;
  var siphonAudioImpactGap = 0;

  function siphonAudioTick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(0.1, dt);
    var quiet = gamePaused || gameOver || gameWon || shopOpen || shopState !== 'closed' ||
      ledgerOpen || cargoManifestOpen || bathMode || introPhase !== 'done' ||
      (typeof document !== 'undefined' && document.hidden);
    var available = !quiet && typeof siphon !== 'undefined' && siphon &&
      siphon.equipped && siphon.pointer !== null && siphonAvailable();
    var moving = available && siphon.flow > 0;
    var transfer = moving ? Math.min(1, siphon.flow / Math.max(1, dt * 6200)) : 0;
    siphonAudioFlow += (transfer - siphonAudioFlow) * (1 - Math.exp(-dt * (moving ? 12 : 24)));
    // The station uses the same asset key. Yield that voice while docking;
    // a zero-gain siphon stop must never mute an active station fuel fill.
    var stationOwnsPump = shopOpen || shopState !== 'closed' || player.refueling;
    if (moving && !stationOwnsPump) {
      var fullness = Math.min(1, siphonTotal() / Math.max(1, siphon.capacity));
      var pouring = siphon.mode === 'pour';
      var pressure = Math.max(0, Math.min(1, siphon.power));
      sfxLoop('fuel-fill', {
        gain: (0.12 + 0.28 * Math.sqrt(siphonAudioFlow)) * pressure,
        pitch: (pouring ? 0.97 : 0.84) + siphonAudioFlow * 0.10 + fullness * 0.045,
        filter: (pouring ? 900 : 680) + siphonAudioFlow * 360,
        ramp: 0.065
      });
      siphonAudioDriving = true;
    } else if (siphonAudioDriving) {
      if (!stationOwnsPump) sfxLoop('fuel-fill', { gain: 0, ramp: 0.055 });
      siphonAudioDriving = false;
    }
    if (!available) siphonAudioFlow = 0;

    // Count edges rather than polling contact. At rest a body can touch the
    // floor thousands of times without making another sound. First seeing
    // a saved guest establishes its baseline; it never replays old bounces.
    siphonAudioImpactGap = Math.max(0, siphonAudioImpactGap - dt);
    var guests = typeof skySlimes !== 'undefined' ? skySlimes : [];
    var best = null, bestWeight = 0;
    for (var i = 0; i < guests.length; i++) {
      var s = guests[i], previous = s._audioBounces;
      s._audioBounces = s.bounces;
      if (previous === undefined || s.bounces <= previous || quiet || siphonAudioImpactGap > 0) continue;
      if (s.x + s.r < cam.x || s.x - s.r > cam.x + screenW ||
          s.y + s.r < cam.y || s.y - s.r > cam.y + screenH) continue;
      var speed = Math.hypot(s.vx, s.vy);
      if (speed < 38) continue;
      var dx = s.x - player.x - PLAYER_W * 0.5, dy = s.y - player.y - PLAYER_H * 0.5;
      var near = Math.max(0, 1 - Math.hypot(dx, dy) / (TILE * 14));
      var power = Math.min(1, (speed - 28) / 430), weight = power * near * near;
      if (weight > bestWeight) { best = s; bestWeight = weight; }
    }
    if (best && bestWeight > 0.02) {
      sfxPlay(best.wet > 0.2 ? 'jello-slap' : 'jello-wobble', {
        gain: 0.08 + bestWeight * 0.30,
        rate: 1.05 - (best.r - 22) * 0.026 + Math.min(4, best.bounces) * 0.014,
        pan: sfxPanAt(best.x)
      });
      siphonAudioImpactGap = 0.13;
    }
  }

