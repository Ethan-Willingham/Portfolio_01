  // ====== FLIGHT HAPTICS SHIM (v24.112) ======
  // Browser haptics for flight feel: Gamepad dual-rumble (vibrationActuator,
  // Chromium + recent Safari/Firefox) plus navigator.vibrate on Android for
  // the strongest events only. Event-driven off the player.fx counters that
  // the flight integrator bumps (080), plus a light stick-shaker tick while
  // the stall buffet telegraph is live. Every call is try-guarded; with no
  // pad or vibration support this whole file is a no-op. Zero gameplay effect.
  var _hapLandN = 0, _hapBoomN = 0, _hapIgniteN = 0, _hapBuffetT = 0;
  function _hapPad() {
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : null;
      if (!pads) return null;
      for (var i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].vibrationActuator) return pads[i].vibrationActuator;
      }
    } catch (e) {}
    return null;
  }
  function _hapPulse(strong, weak, ms) {
    var act = _hapPad();
    if (act && act.playEffect) {
      try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
    } else if (isMobile && navigator.vibrate) {
      // Android only (iOS has no vibrate API); big events only, never loops.
      try { if (strong >= 0.5) navigator.vibrate(Math.min(60, ms)); } catch (e) {}
    }
  }
  function hapticsUpdate(dt) {
    var fx = player.fx;
    if (!fx) return;
    if (fx.landN !== _hapLandN) {
      _hapLandN = fx.landN;
      var _hard = (fx.landVy || 0) > 420 || (fx.landTilt || 0) > 0.5;
      _hapPulse(_hard ? 1.0 : 0.35, _hard ? 0.6 : 0.2, _hard ? 110 : 50);
    }
    if (fx.boomN !== _hapBoomN) { _hapBoomN = fx.boomN; _hapPulse(0.9, 0.9, 160); }
    if (fx.igniteN !== _hapIgniteN) { _hapIgniteN = fx.igniteN; _hapPulse(0, 0.25, 40); }
    // v24.117: pulses ride the event-driven shiver envelope (stall break,
    // vapor, boom), not the continuous buffet state, so rumble is as rare
    // and brief as the visual tremor.
    if (player.rotFlightActive && (player.tremor || 0) > 0.35) {
      _hapBuffetT -= dt;
      if (_hapBuffetT <= 0) {
        _hapBuffetT = 0.09;
        _hapPulse(0, 0.12 + 0.2 * player.tremor, 30);
      }
    } else {
      _hapBuffetT = 0;
    }
  }
