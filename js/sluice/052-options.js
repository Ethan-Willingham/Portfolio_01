  // ====== PLAYER OPTIONS ======
  // Player-facing options behind the pause-screen OPTIONS pane (sluice.html).
  // On boot this reads every persisted 'sluice.opt.*' key and applies it, then
  // exposes window.SluiceOptions as the single live surface the DOM controls
  // talk to. Options with a gm lever apply through window.gm; gm is built far
  // below (360-gm-facade.js, gm.preset in 380-gm-presets-boot.js), so those
  // applies retry on a short timer until gm exists. Options with no lever
  // today live as plain fields on SluiceOptions for game code to read:
  //   SluiceOptions.shakeScale   0..1 multiplier for the combat screenshake
  //                              (085-combat.js combatShakeOffset; NOT yet
  //                              consumed there, wire it in a follow-up)
  //   SluiceOptions.damageFlash  red-screen hull-damage flash on/off
  //                              (140-render-maindraw.js damageFlashT draw;
  //                              NOT yet consumed there)
  //   SluiceOptions.lowFlash     photosensitive mode; drives the existing
  //                              weather.lightning gm lever (155-weather.js)
  //                              and is exposed for other full-screen flash
  //                              sources to honour
  // Persisted keys (all under 'sluice.opt.'): sfxvol (0..1), gfx
  // ('performance'|'balanced'|'extreme'), shake (0..1), dmgflash ('1'|'0'),
  // lowflash ('1'|'0'), banya ('1'|'0'). Unset keys keep the shipped defaults
  // and apply nothing, so a fresh profile boots exactly as before this
  // fragment existed.
  //
  // 'banya' is the one key deliberately NOT in OPT_KEYS: 010-constants.js
  // reads it at boot instead, because ENABLE_BATH must be settled before
  // 072-bath.js evaluates (and so ?bath=1 can still win over a stored 'off').
  // This fragment owns writing it and the LIVE flip below.
  (function buildPlayerOptions() {
    var OPT_PREFIX = 'sluice.opt.';

    // Pause-screen graphics choice -> GM_PRESETS device-tier name (see
    // 380-gm-presets-boot.js). 'medium' is the tier described as "balanced
    // fidelity and fps"; 'extreme' matches the unconditional boot preset, so
    // an unset or 'extreme' choice changes nothing.
    var OPT_GFX_PRESET = { performance: 'low', balanced: 'medium', extreme: 'extreme' };

    var OPT_KEYS = ['sfxvol', 'gfx', 'shake', 'dmgflash', 'lowflash'];

    // gm.set / gm.preset with a retry: this fragment evaluates long before the
    // gm facade exists, and boot is synchronous, so the first 100 ms tick
    // already lands after the game (and its boot preset) is up.
    function optGmSet(path, value, tries) {
      if (tries === undefined) tries = 50;
      try {
        if (window.gm && typeof window.gm.set === 'function') { window.gm.set(path, value); return; }
      } catch (e) {}
      if (tries > 0) setTimeout(function () { optGmSet(path, value, tries - 1); }, 100);
    }
    function optGmPreset(name, tries) {
      if (tries === undefined) tries = 50;
      try {
        if (window.gm && typeof window.gm.preset === 'function') { window.gm.preset(name); return; }
      } catch (e) {}
      if (tries > 0) setTimeout(function () { optGmPreset(name, tries - 1); }, 100);
    }

    function optTruthy(val) { var s = String(val); return s === '1' || s === 'true'; }
    function optClamp01(val) {
      var v = parseFloat(val);
      return isNaN(v) ? null : Math.max(0, Math.min(1, v));
    }

    var opts = {
      // Live fields for the systems with no gm lever today (see banner).
      shakeScale: 1,
      damageFlash: true,
      lowFlash: false,

      get: function (key) {
        try { return localStorage.getItem(OPT_PREFIX + key); } catch (e) { return null; }
      },
      // Persist + apply in one call; the DOM controls in sluice.html route here.
      set: function (key, val) {
        try { localStorage.setItem(OPT_PREFIX + key, String(val)); } catch (e) {}
        optApply(key, val);
      }
    };

    function optApply(key, val) {
      if (key === 'sfxvol') {
        var v = optClamp01(val);
        if (v === null) return;
        try { if (typeof SluiceAudio !== 'undefined' && SluiceAudio) SluiceAudio.setSfxVolume(v); } catch (e) {}
      } else if (key === 'gfx') {
        var name = OPT_GFX_PRESET[String(val)];
        if (name) optGmPreset(name);
      } else if (key === 'shake') {
        var s = optClamp01(val);
        if (s !== null) opts.shakeScale = s;
      } else if (key === 'dmgflash') {
        opts.damageFlash = optTruthy(val);
      } else if (key === 'lowflash') {
        opts.lowFlash = optTruthy(val);
        // The one full-screen flash with a lever today: storm lightning
        // (weatherTune.lightning, registered in the 'weather' gm group).
        optGmSet('weather.lightning', opts.lowFlash ? 0 : 1);
      } else if (key === 'banya') {
        // The bathhouse (docs/game/BATHHOUSE_PLAN.md). Every ENABLE_BATH
        // consumer is a per-frame gate and the tower's site is picked
        // lazily post-worldgen, so this flips LIVE: the banya appears in
        // town on the next frame, no reload, no new game. Switching it off
        // from inside the scene has to leave first, or the world stays
        // frozen behind a scene whose frame hook no longer runs.
        var bathOn = optTruthy(val);
        if (!bathOn && typeof bathMode !== 'undefined' && bathMode &&
            typeof bathExit === 'function') bathExit();
        ENABLE_BATH = bathOn;
      }
    }

    // Boot: apply every persisted key. Unset keys are skipped entirely, so the
    // shipped defaults (including the 'extreme' boot preset in 380) stand.
    for (var i = 0; i < OPT_KEYS.length; i++) {
      var saved = opts.get(OPT_KEYS[i]);
      if (saved !== null) optApply(OPT_KEYS[i], saved);
    }

    window.SluiceOptions = opts;
  })();
