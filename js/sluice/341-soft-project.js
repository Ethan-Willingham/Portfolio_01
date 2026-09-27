  /* ---- Sequential resident physics comparisons (?softnext=1) ---- */
  var softProjectParams = new URLSearchParams(location.search);
  var softProjectEnabled = softProjectParams.get('softnext') === '1';
  var SOFT_PROJECT_MAX_STAGE = 4;
  var softProjectStage = Math.max(1, Math.min(SOFT_PROJECT_MAX_STAGE,
    Number(softProjectParams.get('softstage')) || SOFT_PROJECT_MAX_STAGE));
  var softProjectNew = true;
  var softProjectReference = false;
  var SOFT_PAIRS = softProjectEnabled;
  var SOFT_INTENT = softProjectEnabled && softProjectStage >= 2;
  var SOFT_WORLD = softProjectEnabled && softProjectStage >= 3;
  var SOFT_PRESENTATION = softProjectEnabled && softProjectStage >= 4;

  function softProjectSelect(fresh) {
    softProjectNew = fresh;
    softProjectReference = false;
    if (softProjectEnabled) SOFT_CONTACT = SOFT_HANDLING = SOFT_TERRAIN = SOFT_MATERIAL = true;
    var stage = softProjectEnabled ? softProjectStage - (fresh ? 0 : 1) : 0;
    SOFT_PAIRS = stage >= 1;
    SOFT_INTENT = stage >= 2;
    SOFT_WORLD = stage >= 3;
    SOFT_PRESENTATION = stage >= 4;
  }

  function softProjectUseReference() {
    softProjectReference = true;
    SOFT_CONTACT = SOFT_HANDLING = SOFT_TERRAIN = SOFT_MATERIAL = false;
    SOFT_PAIRS = SOFT_INTENT = SOFT_WORLD = SOFT_PRESENTATION = false;
  }

  function softProjectPrepareWorld(origin, floor) {
    // Use the ordinary mutation path so CPU arrays and queued GPU operations
    // reset together, including when a prior readback is still in flight.
    for (var i = liquidCount - 1; i >= 0; i--) removeLiquidParticle(i);
    if (softPlayCase !== 'water') return;
    for (var row = SKY_ROWS - 3; row <= SKY_ROWS; row++) {
      for (var col = origin - 3; col <= origin + 3; col++) {
        world[row][col] = row === SKY_ROWS || col === origin - 3 || col === origin + 3 ?
          { type: 'foundation', hp: ORES.foundation.hp } : null;
        invalidateTerrainAround(row, col);
      }
    }
    var gap = LIQUID_CELL * LIQUID_PDELTA;
    for (var y = floor - TILE * 2 + gap; y < floor - gap; y += gap) {
      for (var x = (origin - 2) * TILE + gap; x < (origin + 3) * TILE - gap; x += gap) {
        addLiquidParticle(0, x, y, 0, 0, 0);
      }
    }
  }

  function softProjectScene(x, floor) {
    var first = null, count = softPlayCase === 'pile' ? 6 : 2;
    var impact = softPlayCase === 'head-on' || softPlayCase === 'glancing';
    for (var i = 0; i < count; i++) {
      var dx = softPlayCase === 'pile' ? (i % 2) * 54 - 27 : softPlayCase === 'support' ? 0 : i * 65;
      var dy = softPlayCase === 'pile' ? Math.floor(i / 2) * 54 : softPlayCase === 'support' ? i * 54 : 0;
      if (softPlayCase === 'water') dy = 100;
      if (impact) { dx = i ? 65 : -65; dy = 115 - (softPlayCase === 'glancing' && i ? 20 : 0); }
      var b = surfaceSlimeBuild(x + dx, floor - 30 - dy,
        { id: 9001 + i, seed: 0.18 + i * 0.13, hue: surfaceSlimeHues[i % surfaceSlimeHues.length], r: 24.3 });
      if (softPlayCase === 'intent') {
        // Choose an ordinary destination toward the obstacles in both modes.
        // Each controller supplies its own physical effort from this state.
        b.surfaceSlime.dir = b.surfaceSlime.goalDir = 1;
        b.surfaceSlime.goalX = x + TILE * 7;
        b.surfaceSlime.state = 'crawl'; b.surfaceSlime.timer = 30;
      }
      if (impact) {
        surfaceSlimeDetach(b, 3);
        for (var p = 0; p < b.n; p++) b.ox[p] -= (i ? -180 : 180) *
          (JELLO_H / Math.max(1, JELLO_XPBD_SUBSTEPS)) / JELLO_TIMESCALE;
      }
      if (!first) first = b;
    }
    return first;
  }
