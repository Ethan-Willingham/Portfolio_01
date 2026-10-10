/* Opening selection only. The host owns pointer capture and releases the cap. */
(function (global) {
  'use strict';
  function pickOpening(point, openings, cssScale) {
    var radius = 22 / Math.max(cssScale || 1, 1e-6), best = null, distance = radius;
    global.WSSBoundaries.normalizeCaps(openings).forEach(function (cut) {
      var x = Math.max(cut.x0, Math.min(cut.x1, point.x));
      var y = Math.max(cut.y0, Math.min(cut.y1, point.y));
      var d = Math.hypot(point.x-x, point.y-y);
      if (d <= distance) { best = cut; distance = d; }
    });
    return best;
  }
  global.WSSHands = {pickOpening:pickOpening};
})(typeof window !== 'undefined' ? window : globalThis);
