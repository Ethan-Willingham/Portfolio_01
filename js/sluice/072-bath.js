  /* ==== BATHHOUSE B1 (v25.56): water-temperature dev scene =============
     Flag-gated (ENABLE_BATH, ?bath=1); the plan and every locked decision
     live in docs/game/BATHHOUSE_PLAN.md. v1 is WebGPU-only (B-D4): once
     the GPU liquid sim is driving, register ONE heat-source rect across
     the floor of the leftmost surface pond and flip the sim's BATH_ON
     lane. Hot water rises off the pond floor, convects, and cools toward
     ambient; per-particle heat rides flag bits 24:31 (see the v25.56
     blocks in js/liquid-wgpu.js). The CPU fallback ignores the flag
     until stage B9 ports the channel.
     Feel levers from the console: window.bathTune('BATH_BUOY', 400),
     BATH_EXCHANGE / BATH_COOL / BATH_SRC_T / BATH_SRC_RATE, BATH_ON 0/1.
     ===================================================================== */
  var bathArmed = false;   // one-shot: set once the dev source is registered
  var bathPond = null;     // the pond we heated (for the dev jump helper)
  // Dev-only: teleport the rig to sit at the heated pond so the feel-check is
  // one call (window.__bath.jump()) instead of a blind fly across the map.
  function bathJumpToPond() {
    if (!bathPond || typeof player === 'undefined') return false;
    player.x = (bathPond.cL + bathPond.cR + 1) * 0.5 * TILE - PLAYER_W * 0.5;
    player.y = (SKY_ROWS - 2) * TILE;
    if (player.vx !== undefined) player.vx = 0;
    if (player.vy !== undefined) player.vy = 0;
    return true;
  }
  function bathTune(name, v) {
    // Physics lanes go through setSimParam, the heat-tint look through
    // setRenderParam; unknown names are a no-op in each, so route to both.
    if (liquidWGPU && liquidWGPU.setSimParam)    liquidWGPU.setSimParam(name, v);
    if (liquidWGPU && liquidWGPU.setRenderParam) liquidWGPU.setRenderParam(name, v);
  }
  function bathArmDevScene() {
    if (bathArmed || !ENABLE_BATH) return;
    if (!(liquidWGPU && liquidWGPU.simActive)) return;   // GPU sim not driving yet
    if (typeof surfacePonds === 'undefined' || !surfacePonds.length) return;
    var p = surfacePonds[0];
    bathPond = p;
    var d = p.d || 1;
    // The pond body spans rows SKY_ROWS-1 .. SKY_ROWS+d (see the pond wake
    // expansion in 030-worldgen). Heat only its FLOOR band so the plume
    // reads as convection (rise, spread, cool, sink), not uniform warming.
    var x0 = p.cL * TILE, x1 = (p.cR + 1) * TILE;
    var y0 = (SKY_ROWS + d - 1) * TILE, y1 = (SKY_ROWS + d + 1) * TILE;
    bathTune('BATH_SRC_X0', x0); bathTune('BATH_SRC_Y0', y0);
    bathTune('BATH_SRC_X1', x1); bathTune('BATH_SRC_Y1', y1);
    bathTune('BATH_ON', 1);
    bathArmed = true;
    try {
      console.log('[bath] B1 heat source armed under pond 0: cols ' + p.cL +
        '-' + p.cR + ', floor rows ' + (SKY_ROWS + d - 1) + '-' + (SKY_ROWS + d) +
        '. Levers: window.bathTune, physics BATH_BUOY/BATH_EXCHANGE/BATH_COOL/' +
        'BATH_SRC_T, look BATH_TINT_STR (0 kills the tint) / BATH_TINT_R/G/B.');
    } catch (e) {}
  }
  if (ENABLE_BATH) {
    // Self-contained arm loop: no game-loop wiring for a dev scene. Cheap
    // (guards short-circuit), and irrelevant once armed.
    window.bathTune = bathTune;
    window.__bath = { tune: bathTune, jump: bathJumpToPond,
                      get pond() { return bathPond; } };
    setInterval(bathArmDevScene, 500);
  }
