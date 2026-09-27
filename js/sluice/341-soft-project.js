  /* ---- Sequential resident physics comparisons (?softnext=1) ---- */
  var softProjectParams = new URLSearchParams(location.search);
  var softProjectEnabled = softProjectParams.get('softnext') === '1';
  var SOFT_PROJECT_MAX_STAGE = 2;
  var softProjectStage = Math.max(1, Math.min(SOFT_PROJECT_MAX_STAGE,
    Number(softProjectParams.get('softstage')) || SOFT_PROJECT_MAX_STAGE));
  var softProjectNew = true;
  var SOFT_PAIRS = softProjectEnabled;
  var SOFT_INTENT = softProjectEnabled && softProjectStage >= 2;
  var SOFT_WORLD = softProjectEnabled && softProjectStage >= 3;
  var SOFT_PRESENTATION = softProjectEnabled && softProjectStage >= 4;

  function softProjectSelect(fresh) {
    softProjectNew = fresh;
    var stage = softProjectEnabled ? softProjectStage - (fresh ? 0 : 1) : 0;
    SOFT_PAIRS = stage >= 1;
    SOFT_INTENT = stage >= 2;
    SOFT_WORLD = stage >= 3;
    SOFT_PRESENTATION = stage >= 4;
  }

  function softProjectScene(x, floor) {
    var first = null, count = softPlayCase === 'pile' ? 6 : 2;
    for (var i = 0; i < count; i++) {
      var dx = softPlayCase === 'pile' ? (i % 2) * 54 - 27 : softPlayCase === 'support' ? 0 : i * 65;
      var dy = softPlayCase === 'pile' ? Math.floor(i / 2) * 54 : softPlayCase === 'support' ? i * 54 : 0;
      var b = surfaceSlimeBuild(x + dx, floor - 30 - dy,
        { id: 9001 + i, seed: 0.18 + i * 0.13, hue: surfaceSlimeHues[i % surfaceSlimeHues.length], r: 24.3 });
      if (!first) first = b;
    }
    return first;
  }
