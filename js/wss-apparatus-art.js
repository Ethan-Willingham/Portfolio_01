/* Abstract source and control marks, drawn in simulation coordinates. */
(function (root) {
  'use strict';

  var ink = '#1e2420', line = '#a4a293', faint = '#767d71';
  var water = '#8fb3c7', warm = '#cf9f78', accent = '#d4c4a0';

  function begin(c, x, y) {
    c.save();c.translate(x, y);c.lineWidth = .85;c.lineCap = 'round';c.lineJoin = 'round';
  }
  function segment(c, x1, y1, x2, y2, color, width) {
    c.strokeStyle = color;c.lineWidth = width || .85;
    c.beginPath();c.moveTo(x1, y1);c.lineTo(x2, y2);c.stroke();
  }
  function dot(c, x, y, radius, color) {
    c.fillStyle = color;c.beginPath();c.arc(x, y, radius, 0, Math.PI * 2);c.fill();
  }
  function capsule(c, x, y, width, height, radius) {
    c.beginPath();c.roundRect(x, y, width, height, radius);
    c.fillStyle = ink;c.fill();c.strokeStyle = line;c.lineWidth = .85;c.stroke();
  }

  function sourcePort(c, x, y, options) {
    options = options || {};
    begin(c, x, y);
    capsule(c, -10, -4, 20, 8, 4);
    segment(c, -3, 0, 3, 0, water, 1.25);
    if (options.active) segment(c, 0, 4, 0, 7, water, 1);
    c.restore();
  }

  function heatSource(c, x, y, options) {
    options = options || {};
    begin(c, x, y);
    capsule(c, -15, 3, 30, 7, 3.5);
    segment(c, -8, 6.5, 6, 6.5, options.burning ? warm : faint, 1.1);
    dot(c, 10, 6.5, 1, options.burning ? warm : faint);
    dot(c, -28, 20, 1.7, options.wet ? faint : warm);
    c.restore();
  }

  function heater(c, rect, options) {
    options = options || {};
    begin(c, rect.x, rect.y);
    var width = rect.width, height = Math.max(8, rect.height);
    capsule(c, 0, 0, width, height, Math.min(4, height * .5));
    if (options.heated && options.glow) {
      c.save();c.globalAlpha = .18;c.fillStyle = warm;
      c.beginPath();c.roundRect(1, 1, width - 2, height - 2, Math.min(3, height * .5 - 1));c.fill();c.restore();
      c.shadowColor = warm;c.shadowBlur = 6;
    }
    segment(c, 5, height * .5, Math.max(5, width - 10), height * .5,
      options.heated ? warm : faint, 1.1);
    dot(c, width - 5, height * .5, 1.1, options.heated ? warm : faint);
    c.restore();
  }

  function airPort(c, x, y, options) {
    options = options || {};
    begin(c, x, y);
    var bottom = options.bottom === undefined ? 384 : options.bottom;
    segment(c, 0, 5, 0, bottom - y, faint, .75);
    c.beginPath();c.arc(0, 0, 4.5, 0, Math.PI * 2);
    c.fillStyle = ink;c.fill();c.strokeStyle = line;c.lineWidth = .85;c.stroke();
    dot(c, 0, 0, 1.2, options.active ? water : faint);
    c.restore();
  }

  function flowControl(c, source, options) {
    options = options || {};
    begin(c, source.x, source.y);
    segment(c, -12, 0, -5, 0, faint, .75);
    c.beginPath();c.arc(0, 0, 5, 0, Math.PI * 2);
    c.fillStyle = ink;c.fill();c.strokeStyle = line;c.lineWidth = .85;c.stroke();
    if (options.enabled === false) segment(c, 0, -2, 0, 2, faint, 1.1);
    else segment(c, -2, 0, 2, 0, water, 1.1);
    c.restore();
  }

  function opening(c, aperture, options) {
    options = options || {};
    var length = aperture.end - aperture.start;
    if (aperture.axis === 'x') {
      begin(c, aperture.at, aperture.start);c.rotate(Math.PI * .5);
    } else begin(c, aperture.start, aperture.at);
    segment(c, 0, -3, 0, 3, faint, .85);
    segment(c, length, -3, length, 3, faint, .85);
    if (options.closed) segment(c, 0, 0, length, 0, accent, 2);
    else {
      var gap = Math.min(10, length * .5);
      segment(c, 0, 0, (length - gap) * .5, 0, line, 1.1);
      segment(c, (length + gap) * .5, 0, length, 0, line, 1.1);
    }
    c.restore();
  }

  root.WSSApparatusArt = {
    sourcePort: sourcePort, heatSource: heatSource, heater: heater,
    airPort: airPort, flowControl: flowControl, opening: opening
  };
})(typeof window !== 'undefined' ? window : globalThis);
