  /* ---- Surface resident material mesh ----
     The polar rings form a planar triangle mesh. Advancing the next angular
     vertex of either ring stitches each annulus exactly once. The existing
     spring braces remain independent: they drive the calibrated muscle gait,
     but their overlapping graph cycles are not material volume cells. */
  function surfaceSlimeInstallMesh(b) {
    if (!b || !(b.n > 6)) return false;
    var rings = Math.round((Math.sqrt(12 * b.n - 3) - 3) / 6);
    if (1 + 3 * rings * (rings + 1) !== b.n) return false;
    var ta = [], tb = [], tc = [], dm = [], areas = [];
    var valid = true;
    function triangle(a, c, d) {
      var x1 = b.rx[c] - b.rx[a], y1 = b.ry[c] - b.ry[a];
      var x2 = b.rx[d] - b.rx[a], y2 = b.ry[d] - b.ry[a];
      var det = x1 * y2 - x2 * y1;
      if (!(det > 1e-8)) { valid = false; return; }
      ta.push(a); tb.push(c); tc.push(d);
      dm.push(y2 / det, -x2 / det, -y1 / det, x1 / det);
      areas.push(det * 0.5);
    }
    for (var k = 0; k < 6; k++) triangle(0, 1 + k, 1 + (k + 1) % 6);
    for (var r = 2; r <= rings; r++) {
      var innerCount = 6 * (r - 1), outerCount = 6 * r;
      var innerStart = 1 + 3 * (r - 2) * (r - 1);
      var outerStart = 1 + 3 * (r - 1) * r;
      var innerPhase = ((r - 1) & 1) * Math.PI / innerCount;
      var outerPhase = (r & 1) * Math.PI / outerCount;
      var inner = 0, outer = 0;
      while (inner < innerCount || outer < outerCount) {
        var a = innerStart + inner % innerCount;
        var c = outerStart + outer % outerCount;
        var nextInner = innerPhase + (inner + 1) * Math.PI * 2 / innerCount;
        var nextOuter = outerPhase + (outer + 1) * Math.PI * 2 / outerCount;
        if (outer < outerCount && (inner >= innerCount || nextOuter <= nextInner)) {
          triangle(a, c, outerStart + (outer + 1) % outerCount);
          outer++;
        } else {
          triangle(a, c, innerStart + (inner + 1) % innerCount);
          inner++;
        }
      }
    }
    // Keep installation atomic if a future builder supplies an invalid rest pose.
    if (!valid) return false;
    b.cellA = Int32Array.from(ta); b.cellB = Int32Array.from(tb); b.cellC = Int32Array.from(tc);
    b.cellInv = Float32Array.from(dm); b.cellRestArea = Float32Array.from(areas);
    b.cellN = ta.length; b.cellLambda = new Float32Array(ta.length);
    return true;
  }
