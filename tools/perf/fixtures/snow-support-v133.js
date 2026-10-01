// Frozen v28.133 production support closure.
// Full fragment SHA256 c0edf7ed2a48857540b40501a1a9481e903fb434e4047f50b2b34471d72dd827.
// Retain traversal and Number arithmetic exactly; this file is a regression fixture.
  function snowContactRadius() { return LIQUID_CELL / Math.sqrt(LIQUID_SNOW_DENSITY) * 0.5; }
  var snowSupportPoints = new Float64Array(0);
  var snowSupportNext = new Int32Array(0), snowSupportQueue = new Int32Array(0);
  function snowSupportDistance() { return snowContactRadius() * 2 + 0.25; }
  function snowBuildSupport() {
    // A chain of touching grains rooted in terrain carries contact,
    // including while it slides or compacts. Velocity cannot make a pile
    // permeable to returning powder. Detached clouds have no terrain root.
    // Contact crosses bucket boundaries; bucket occupancy is not support.
    var reach = snowSupportDistance(), reach2 = reach * reach;
    var cell = Math.max(LIQUID_CELL, reach), width = Math.ceil(COLS * TILE / cell) + 1;
    var count = liquidCount, types = liquidType, xs = liquidX, ys = liquidY;
    var floor = Math.floor, solid = liquidWorldSolidAt, groundReach = snowContactRadius() + 0.3;
    // Every point/link/queue slot below is written before use. Retain only
    // scratch capacity between builds; logical counts never include its tail.
    if (snowSupportNext.length < count) {
      var capacity = Math.max(256, count, snowSupportNext.length * 2);
      snowSupportPoints = new Float64Array(capacity * 2);
      snowSupportNext = new Int32Array(capacity);
      snowSupportQueue = new Int32Array(capacity);
    }
    var heads = new Map(), bed = new Map(), points = snowSupportPoints, next = snowSupportNext, queue = snowSupportQueue;
    var pointCount = 0, queueCount = 0;
    for (var i = 0; i < count; i++) {
      if (types[i] !== 5) continue;
      var x = xs[i], y = ys[i], n = pointCount++;
      points[n * 2] = x; points[n * 2 + 1] = y;
      if (solid(x, y + groundReach)) {
        queue[queueCount++] = n; next[n] = -1;
      } else {
        var key = floor(y / cell) * width + floor(x / cell);
        var head = heads.get(key);
        next[n] = head === undefined ? -1 : head; heads.set(key, n);
      }
    }
    for (var q = 0; q < queueCount; q++) {
      var n = queue[q], x = points[n * 2], y = points[n * 2 + 1];
      var col = floor(x / cell), row = floor(y / cell), key = row * width + col;
      var bucket = bed.get(key);
      if (!bucket) { bucket = []; bed.set(key, bucket); }
      bucket.push(x, y);
      for (var r = -1; r <= 1; r++) for (var c = -1; c <= 1; c++) {
        var nearKey = (row + r) * width + col + c;
        var current = heads.get(nearKey), previous = -1;
        while (current !== undefined && current >= 0) {
          var following = next[current];
          var dx = x - points[current * 2], dy = y - points[current * 2 + 1];
          if (dx * dx + dy * dy <= reach2) {
            // Remove visited grains from candidate lists. Dense reached
            // buckets therefore do not get rescanned for every neighbour.
            if (previous < 0) heads.set(nearKey, following);
            else next[previous] = following;
            queue[queueCount++] = current;
          } else previous = current;
          current = following;
        }
      }
    }
    return bed;
  }
  function snowInsertContact() {} // Extraction end anchor, outside the frozen closure.
