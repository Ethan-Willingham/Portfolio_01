/* Canonical stationary boundary cuts, shared by pressure geometry and parcels. */
(function (global) {
  'use strict';
  function normalizeCaps(input) {
    if (!input) return [];
    if (!Array.isArray(input) || input.length > 16) throw new Error('At most sixteen held cuts are supported.');
    return input.filter(function (c) { return c && c.enabled !== false; }).map(function (c) {
      var axis = c.axis, at = c.at, start = c.start, end = c.end;
      if (axis !== 'x' && axis !== 'y') {
        if (c.x0 === c.x1) { axis = 'x'; at = c.x0; start = c.y0; end = c.y1; }
        else if (c.y0 === c.y1) { axis = 'y'; at = c.y0; start = c.x0; end = c.x1; }
        else throw new Error('Held cuts must be horizontal or vertical.');
      }
      if (![at, start, end].every(Number.isFinite) || start === end) throw new Error('Held cut coordinates are invalid.');
      return {axis:axis, at:at, start:Math.min(start,end), end:Math.max(start,end),
        x0:axis === 'x' ? at : Math.min(start,end), y0:axis === 'y' ? at : Math.min(start,end),
        x1:axis === 'x' ? at : Math.max(start,end), y1:axis === 'y' ? at : Math.max(start,end)};
    });
  }
  function closePressureFaces(geometry, width, height, dx, input) {
    normalizeCaps(input).forEach(function (c) {
      var line = Math.round(c.at / dx);
      if (Math.abs(c.at - line * dx) > 1e-5) throw new Error('Held cuts must lie on pressure faces.');
      var first = Math.floor(c.start / dx), last = Math.ceil(c.end / dx);
      for (var k = first; k < last; k++) {
        if (c.axis === 'y' && k >= 0 && k < width && line > 0 && line < height) {
          geometry[((line-1)*width+k)*8+7] = 0;
          geometry[(line*width+k)*8+6] = 0;
        } else if (c.axis === 'x' && k >= 0 && k < height && line > 0 && line < width) {
          geometry[(k*width+line-1)*8+5] = 0;
          geometry[(k*width+line)*8+4] = 0;
        }
      }
    });
    return geometry;
  }
  function crossing(a, b, c) {
    c = normalizeCaps([c])[0];
    var old = c.axis === 'x' ? a.x : a.y, next = c.axis === 'x' ? b.x : b.y;
    if (old === next || (old-c.at)*(next-c.at) > 0) return null;
    var t = (c.at-old)/(next-old);
    if (t < 0 || t > 1) return null;
    var along = c.axis === 'x' ? a.y+(b.y-a.y)*t : a.x+(b.x-a.x)*t;
    return along >= c.start-1e-5 && along <= c.end+1e-5 ? {t:t,along:along} : null;
  }
  global.WSSBoundaries = {normalizeCaps:normalizeCaps, closePressureFaces:closePressureFaces, crossing:crossing};
})(typeof window !== 'undefined' ? window : globalThis);
