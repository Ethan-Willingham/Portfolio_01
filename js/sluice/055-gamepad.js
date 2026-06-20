  /* ---- Gamepad bridge (phase 1: play + pause) ---- */
  // Xbox-standard-mapping gamepad support via the browser Gamepad API.
  // Architecture: a BRIDGE that writes into the SAME keys{} object the
  // keyboard uses (050-input.js does keys[e.key] = true/false with raw
  // e.key strings), so the game logic needs zero changes. gamepadTick(dt)
  // is called from the 350 game loop (typeof-guarded there).
  //
  // Key strings the game reads (evidence: 080-update-camera.js 135-140):
  //   left  = 'ArrowLeft' / 'a' / 'A'      right = 'ArrowRight' / 'd' / 'D'
  //   up    = 'ArrowUp' / 'w' / 'W' / ' '  down  = 'ArrowDown' / 's' / 'S'
  //   jetpack/thrust rides the same moveU read; the space key is ' '.
  // The bridge writes the Arrow* names for directions (read only by
  // movement) and ' ' for jet, so it never collides with letter hotkeys.
  //
  // Two write disciplines, mirroring what keydown/keyup would produce:
  //   HOLD keys (level-driven; movement + jet): keys[k] = true on engage
  //     edge, keys[k] = false on release edge.
  //   PULSE keys (the 350 loop consumes-and-clears these after reading:
  //     'e' 't' '1' '2' 'z' 'c' and 'Escape'-with-shop-open): set true on
  //     press edge ONLY, let the game clear them, never re-set while held;
  //     a new press requires a release first. On release, clear only if
  //     the game never consumed it (so a stale 'Escape' can't close a shop
  //     opened later).
  //
  // Ownership rule: the bridge only ever sets keys[k] = false for a key
  // it set true itself (gpBridgeHeld). A key already true at press time
  // belongs to the real keyboard and is left alone in both directions.
  //
  // Pause: pauseGame/resumeGame are closures inside setupInput (050) and
  // are NOT reachable from this scope, so Start dispatches a synthetic
  // KeyboardEvent('keydown', { key: 'Escape' }) on window. That runs the
  // exact keyboard Escape path: toggle pause when no shop is up, else
  // leave keys['Escape'] for the loop's shop-close handler. And because
  // pauseGame cancels the rAF loop (gamepadTick stops being called), a
  // low-rate setInterval poll watches the Start button while gamePaused
  // so the pad can resume. While paused, every write except the Start
  // edge is suppressed and all bridge-held keys are released.

  // ----- Tunables -----
  var GAMEPAD_DEADZONE = 0.22;        // radial deadzone on the left stick
  var GAMEPAD_STICK_ENGAGE = 0.30;    // per-direction hysteresis: engage above this
  var GAMEPAD_STICK_RELEASE = 0.22;   // per-direction hysteresis: release below this
  var GAMEPAD_TRIGGER_ON = 0.12;      // RT analog value that counts as thrust
  var GAMEPAD_PAUSE_POLL_MS = 150;    // Start-button poll rate while the loop is paused

  // ----- Mapping table (standard-mapping button/axis indices) -----
  // Exposed on window.__gamepad.mappingTable for debugging and for the
  // future analog-flight phase.
  var GAMEPAD_MAPPING = {
    'axes 0/1 (left stick)': 'move left/right/up/down (ArrowLeft/ArrowRight/ArrowUp/ArrowDown)',
    'buttons 14/15/12/13 (dpad)': 'move left/right/up/down',
    'button 0 (A)': 'jetpack (space)',
    'button 7 (RT, analog > 0.12)': 'jetpack (space)',
    'button 1 (B)': 'Escape (close shop/menus)',
    'button 3 (Y)': 'e (shop/dock)',
    'button 2 (X)': '1 (small bomb)',
    'button 4 (LB)': '2 (large bomb)',
    'button 5 (RB)': 'c (mineral ledger)',
    'button 6 (LT)': 'z (zoom)',
    'button 9 (Start)': 'pause toggle',
    'button 8 (Back/View)': 't (teleporter)'
  };

  // ----- Bridge state -----
  var gpConnected = false;
  var gpId = '';
  var gpBridgeHeld = {};     // key string -> true while THIS bridge holds keys[k] true
  var gpHoldLevel = {};      // hold-key string -> current engaged level (edge detect)
  var gpStickDir = { left: false, right: false, up: false, down: false };  // hysteresis state
  var gpPrev = [];           // previous per-button pressed levels (edge detect)
  var gpDebug = { connected: false, id: '', lx: 0, ly: 0, rt: 0, mappingTable: GAMEPAD_MAPPING };
  try { window.__gamepad = gpDebug; } catch (e) {}

  // ----- Helpers -----
  function gpFindPad() {
    // First connected pad reporting the 'standard' layout; everything guarded
    // so an absent/blocked Gamepad API is a silent no-op.
    try {
      if (!navigator.getGamepads) return null;
      var pads = navigator.getGamepads();
      if (!pads) return null;
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        if (p && p.connected && p.mapping === 'standard') return p;
      }
    } catch (e) {}
    return null;
  }

  function gpButtonDown(pad, idx) {
    var b = pad.buttons && pad.buttons[idx];
    if (!b) return false;
    return !!(b.pressed || b.value > 0.5);
  }

  function gpToast(t) {
    if (typeof showMsg === 'function') { try { showMsg(t); } catch (e) {} }
  }

  // Level-driven hold key (movement, jet). Writes only on level CHANGE so
  // it behaves like one keydown + one keyup, and only claims keys that the
  // keyboard is not already holding.
  function gpHoldSet(k, level) {
    var prev = !!gpHoldLevel[k];
    if (level === prev) return;
    gpHoldLevel[k] = level;
    if (level) {
      if (!keys[k]) { keys[k] = true; gpBridgeHeld[k] = true; }
    } else if (gpBridgeHeld[k]) {
      delete gpBridgeHeld[k];
      keys[k] = false;
    }
  }

  // Consume-and-clear pulse key. True on press edge only; the game loop
  // clears it after acting. Holding the button does not re-fire (a release
  // is required first). On release, clear it only if the game never
  // consumed it, and only if the bridge set it.
  function gpPulse(k, pressEdge, releaseEdge) {
    if (pressEdge && !keys[k]) {
      keys[k] = true;
      gpBridgeHeld[k] = true;
    }
    if (releaseEdge && gpBridgeHeld[k]) {
      delete gpBridgeHeld[k];
      if (keys[k]) keys[k] = false;
    }
  }

  // Release everything the bridge holds (pause, disconnect). Never touches
  // keys the keyboard set.
  function gpReleaseAll() {
    for (var k in gpBridgeHeld) {
      if (Object.prototype.hasOwnProperty.call(gpBridgeHeld, k) && keys[k]) keys[k] = false;
    }
    gpBridgeHeld = {};
    gpHoldLevel = {};
    gpStickDir.left = gpStickDir.right = gpStickDir.up = gpStickDir.down = false;
  }

  // Start button: route through the same window keydown path the keyboard
  // Escape uses (050-input.js), which calls pauseGame/resumeGame respecting
  // gamePaused. Those functions are closures inside setupInput, so this
  // synthetic event is the supported entry point.
  function gpTogglePause() {
    try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch (e) {}
  }

  // Per-direction hysteresis so flight rotation via a held direction does
  // not chatter at the threshold: engage above ENGAGE, hold until below
  // RELEASE. `val` is the signed-component magnitude for that direction.
  function gpDirLevel(cur, val) {
    return cur ? (val > GAMEPAD_STICK_RELEASE) : (val > GAMEPAD_STICK_ENGAGE);
  }

  // ----- Core poll (shared by the game-loop tick and the paused poll) -----
  function gpFrame() {
    var pad = gpFindPad();
    if (!pad) {
      if (gpConnected) {
        gpConnected = false;
        gpId = '';
        gpReleaseAll();
        gpPrev.length = 0;
        gpDebug.connected = false; gpDebug.id = '';
        gpDebug.lx = 0; gpDebug.ly = 0; gpDebug.rt = 0;
        gpToast('Gamepad disconnected');
      }
      return;
    }

    // Read raw inputs up front.
    var lx = (pad.axes && pad.axes.length > 0 && isFinite(pad.axes[0])) ? pad.axes[0] : 0;
    var ly = (pad.axes && pad.axes.length > 1 && isFinite(pad.axes[1])) ? pad.axes[1] : 0;
    var rtBtn = pad.buttons && pad.buttons[7];
    var rt = (rtBtn && isFinite(rtBtn.value)) ? rtBtn.value : (rtBtn && rtBtn.pressed ? 1 : 0);
    var now = [];
    for (var i = 0; i < 16; i++) now[i] = gpButtonDown(pad, i);

    gpDebug.connected = true; gpDebug.id = pad.id || '';
    gpDebug.lx = lx; gpDebug.ly = ly; gpDebug.rt = rt;

    if (!gpConnected) {
      // First sighting: seed the previous-state map from the live state so
      // a button held during connect cannot fire a spurious press edge.
      gpConnected = true;
      gpId = pad.id || '';
      gpPrev = now;
      gpToast('Gamepad connected');
      return;
    }

    var prev = gpPrev;
    gpPrev = now;

    // While the game is paused the rig must not be steerable under the
    // overlay: drop everything the bridge holds and act ONLY on the Start
    // press edge (which resumes via the Escape path).
    if (gamePaused) {
      gpReleaseAll();
      if (now[9] && !prev[9]) gpTogglePause();
      return;
    }

    // ----- Directions: left stick (radial deadzone + hysteresis) OR dpad -----
    var mag = Math.sqrt(lx * lx + ly * ly);
    var sx = mag >= GAMEPAD_DEADZONE ? lx : 0;
    var sy = mag >= GAMEPAD_DEADZONE ? ly : 0;
    gpStickDir.left  = gpDirLevel(gpStickDir.left,  -sx);
    gpStickDir.right = gpDirLevel(gpStickDir.right,  sx);
    gpStickDir.up    = gpDirLevel(gpStickDir.up,    -sy);
    gpStickDir.down  = gpDirLevel(gpStickDir.down,   sy);

    gpHoldSet('ArrowLeft',  gpStickDir.left  || now[14]);
    gpHoldSet('ArrowRight', gpStickDir.right || now[15]);
    gpHoldSet('ArrowUp',    gpStickDir.up    || now[12]);
    gpHoldSet('ArrowDown',  gpStickDir.down  || now[13]);

    // ----- Jetpack: A (0) or RT (7, analog) -> space -----
    gpHoldSet(' ', now[0] || rt > GAMEPAD_TRIGGER_ON);

    // ----- Pulse buttons (consume-and-clear keys in the 350 loop) -----
    gpPulse('Escape', now[1] && !prev[1], !now[1] && prev[1]);   // B: close shop/menus
    gpPulse('e',      now[3] && !prev[3], !now[3] && prev[3]);   // Y: shop/dock
    gpPulse('1',      now[2] && !prev[2], !now[2] && prev[2]);   // X: small bomb
    gpPulse('2',      now[4] && !prev[4], !now[4] && prev[4]);   // LB: large bomb
    gpPulse('c',      now[5] && !prev[5], !now[5] && prev[5]);   // RB: mineral ledger
    gpPulse('z',      now[6] && !prev[6], !now[6] && prev[6]);   // LT: zoom
    gpPulse('t',      now[8] && !prev[8], !now[8] && prev[8]);   // Back/View: teleporter

    // ----- Start (9): pause toggle on press edge -----
    if (now[9] && !prev[9]) gpTogglePause();
  }

  // ----- Entry points -----
  // Called every frame from the 350 game loop while it runs.
  function gamepadTick(dt) {
    gpFrame();
  }

  // pauseGame cancels the rAF loop, so gamepadTick stops while paused; this
  // slow poll keeps watching the pad so Start can resume. It only acts when
  // gamePaused is set (gpFrame suppresses everything but Start then).
  try {
    setInterval(function () {
      try { if (gamePaused) gpFrame(); } catch (e) {}
    }, GAMEPAD_PAUSE_POLL_MS);
  } catch (e) {}
