/* Small bench apparatus, drawn in simulation coordinates. */
(function (root) {
  'use strict';

  // The site palette supplies the materials: warm steel, old brass, porcelain.
  // These drawings identify existing sources and openings; they add no solids.
  var material = {
    shadow: '#1e2420',
    dark: '#303931',
    steel: '#5a675c',
    edge: '#767d71',
    light: '#b8b2a2',
    brass: '#bc9d65',
    brassLight: '#d4c4a0',
    ceramic: '#e8e2d6',
    water: '#8fb3c7',
    heat: '#cf9f78',
    coal: '#b8796d'
  };

  function path(c, points, close) {
    c.beginPath();
    for (var i = 0; i < points.length; i++) {
      if (i) c.lineTo(points[i][0], points[i][1]);
      else c.moveTo(points[i][0], points[i][1]);
    }
    if (close) c.closePath();
  }

  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath();c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill;c.fill(); }
    if (stroke) { c.strokeStyle = stroke;c.stroke(); }
  }

  function pail(c, x, y, options) {
    options = options || {};
    c.save();c.translate(x, y);c.lineWidth = .8;c.lineJoin = 'round';

    // A rolled-rim watering jug. Its short spout ends at the real pour source.
    c.strokeStyle = material.edge;c.lineWidth = 1.5;
    c.beginPath();c.moveTo(-23, -22);c.bezierCurveTo(-36, -24, -35, -7, -23, -9);c.stroke();
    path(c, [[-26, -25], [-5, -25], [-8, -5], [-23, -5]], true);
    c.fillStyle = material.steel;c.fill();c.strokeStyle = material.light;c.lineWidth = .7;c.stroke();
    path(c, [[-9, -16], [4, -6], [2, 0], [-12, -8]], true);
    c.fillStyle = material.steel;c.fill();c.strokeStyle = material.light;c.stroke();
    c.strokeStyle = material.dark;c.beginPath();c.moveTo(-7, -11);c.lineTo(1, -4);c.stroke();

    // The light catches the rim and one folded side, with water visible inside.
    c.fillStyle = material.edge;c.fillRect(-23, -23, 2, 15);
    ellipse(c, -15.5, -25, 10.5, 2.2, material.shadow, material.light);
    ellipse(c, -15.5, -25, 8, 1.15, material.water);
    c.strokeStyle = material.light;c.beginPath();c.moveTo(-22, -7);c.lineTo(-9, -7);c.stroke();
    ellipse(c, 2.3, -1.1, 2.1, 1.1, material.shadow, material.brass);
    c.strokeStyle = material.brass;c.lineWidth = 1.2;
    c.beginPath();c.arc(-15, -27, 9, Math.PI, Math.PI * 2);c.stroke();
    ellipse(c, -24, -26.8, 1.2, 1.2, material.brass);
    ellipse(c, -6, -26.8, 1.2, 1.2, material.brass);
    if (options.active) {
      c.strokeStyle = material.water;c.lineWidth = 1;
      c.beginPath();c.moveTo(2.3, 1);c.lineTo(2.3, 5);c.stroke();
    }
    c.restore();
  }

  function hearth(c, x, y, options) {
    options = options || {};
    c.save();c.translate(x, y);c.lineWidth = .8;c.lineJoin = 'round';

    // An open iron cradle leaves the water's path to the basin visible.
    c.fillStyle = material.shadow;c.fillRect(-30, 12, 10, 7);c.fillRect(20, 12, 10, 7);
    c.strokeStyle = material.edge;c.beginPath();
    c.moveTo(-30, 13);c.lineTo(-20, 13);c.moveTo(20, 13);c.lineTo(30, 13);
    c.moveTo(-25, 14);c.lineTo(-25, 22);c.moveTo(25, 14);c.lineTo(25, 22);c.stroke();
    c.strokeStyle = material.steel;c.lineWidth = 1.2;c.beginPath();
    c.moveTo(-22, 12);c.lineTo(22, 12);c.stroke();
    c.lineWidth = .8;
    for (var i = -18; i <= 18; i += 6) {
      c.beginPath();c.moveTo(i, 8);c.lineTo(i + 2, 12);c.stroke();
    }

    // Two charred pieces of fuel, with a narrow end grain and ember seams.
    c.save();c.translate(-1, 6);c.rotate(-.13);
    path(c, [[-17, -4], [14, -4], [17, -2], [16, 3], [-16, 3]], true);
    c.fillStyle = material.shadow;c.fill();c.strokeStyle = material.steel;c.stroke();
    ellipse(c, 15, -.4, 2.4, 3.1, material.dark, material.edge);
    c.strokeStyle = options.burning ? material.coal : material.edge;
    c.beginPath();c.moveTo(-11, -2);c.lineTo(-1, -1);c.moveTo(3, 1);c.lineTo(10, 1);c.stroke();c.restore();
    c.save();c.translate(0, 2);c.rotate(.2);
    path(c, [[-13, -3], [12, -3], [14, -1], [12, 3], [-13, 3]], true);
    c.fillStyle = material.dark;c.fill();c.strokeStyle = material.steel;c.stroke();
    ellipse(c, -13, 0, 2, 2.7, material.shadow, material.edge);
    c.strokeStyle = options.burning ? material.heat : material.edge;
    c.beginPath();c.moveTo(-8, -1);c.lineTo(0, -.7);c.moveTo(3, 1);c.lineTo(9, 1);c.stroke();c.restore();

    // The separate declared ember sits at the old marker, beside the grate.
    path(c, [[-36, 19], [-31, 16], [-24, 17], [-20, 21], [-23, 24], [-33, 24]], true);
    c.fillStyle = material.shadow;c.fill();c.strokeStyle = material.steel;c.stroke();
    c.strokeStyle = options.wet ? material.edge : material.coal;c.lineWidth = 1.1;
    c.beginPath();c.moveTo(-32, 18);c.lineTo(-29, 21);c.lineTo(-25, 19);c.moveTo(-29, 21);c.lineTo(-28, 23);c.stroke();
    c.restore();
  }

  function heater(c, rect, options) {
    options = options || {};
    var x = rect.x, y = rect.y, w = rect.width, h = rect.height;
    c.save();c.translate(x, y);c.lineWidth = .7;c.lineJoin = 'round';
    c.fillStyle = material.shadow;c.fillRect(-2, -2, w + 4, h + 4);
    c.strokeStyle = material.edge;c.strokeRect(-2, -2, w + 4, h + 4);
    c.fillStyle = material.ceramic;c.fillRect(0, 0, 3, h);c.fillRect(w - 3, 0, 3, h);
    c.strokeStyle = options.heated ? material.heat : material.brass;c.lineWidth = 1.2;
    c.beginPath();c.moveTo(3, h * .5);
    var turns = Math.max(3, Math.round((w - 6) / 5));
    for (var i = 0; i <= turns; i++) c.lineTo(4 + (w - 8) * i / turns, i % 2 ? h - 1.5 : 1.5);
    c.lineTo(w - 3, h * .5);c.stroke();
    c.strokeStyle = material.light;c.lineWidth = .6;c.beginPath();
    c.moveTo(-1, -1);c.lineTo(w + 1, -1);c.stroke();
    ellipse(c, w + 1, h + 1, .8, .8, options.heated ? material.heat : material.edge);
    c.restore();
  }

  function hose(c, x, y, options) {
    options = options || {};
    var bottom = options.bottom === undefined ? 384 : options.bottom;
    c.save();c.lineCap = 'round';
    c.beginPath();c.moveTo(x, bottom);c.bezierCurveTo(x - 6, bottom - 22, x - 5, y + 20, x, y + 4);
    c.strokeStyle = material.shadow;c.lineWidth = 5;c.stroke();
    c.strokeStyle = material.steel;c.lineWidth = 2.5;c.stroke();
    c.strokeStyle = material.edge;c.lineWidth = .5;c.stroke();
    c.translate(x, y);c.lineWidth = .7;
    c.fillStyle = material.brass;c.fillRect(-3.5, -1, 7, 7);
    c.strokeStyle = material.brassLight;c.strokeRect(-3.5, -1, 7, 7);
    c.strokeStyle = material.dark;c.beginPath();c.moveTo(-3, 2);c.lineTo(3, 2);c.moveTo(-3, 4);c.lineTo(3, 4);c.stroke();
    ellipse(c, 0, -1, 3.5, 1.3, material.shadow, material.brassLight);
    c.restore();
  }

  function tap(c, source, options) {
    options = options || {};
    c.save();c.translate(source.x, source.y);c.lineCap = 'round';c.lineJoin = 'round';
    c.beginPath();c.moveTo(-23, -12);c.lineTo(-8, -12);c.quadraticCurveTo(0, -12, 0, -5);c.lineTo(0, 0);
    c.strokeStyle = material.shadow;c.lineWidth = 8;c.stroke();
    c.strokeStyle = material.brass;c.lineWidth = 5.5;c.stroke();
    c.strokeStyle = material.brassLight;c.lineWidth = .7;c.stroke();
    c.lineWidth = .7;c.fillStyle = material.steel;c.fillRect(-25, -16, 4, 8);c.strokeStyle = material.edge;c.strokeRect(-25, -16, 4, 8);
    c.fillStyle = material.brass;c.fillRect(-15, -21, 3, 8);
    c.strokeStyle = material.brassLight;c.lineWidth = 1.4;c.beginPath();
    if (options.enabled === false) { c.moveTo(-13.5, -27);c.lineTo(-13.5, -17); }
    else { c.moveTo(-19, -23);c.lineTo(-8, -23); }
    c.stroke();ellipse(c, -13.5, -23, 1.5, 1.5, material.brass, material.brassLight);
    c.lineWidth = .7;ellipse(c, 0, 0, 3.8, 1.3, material.shadow, material.brassLight);
    c.restore();
  }

  function opening(c, aperture, options) {
    options = options || {};
    var length = aperture.end - aperture.start;
    c.save();
    if (aperture.axis === 'x') { c.translate(aperture.at, aperture.start);c.rotate(Math.PI * .5); }
    else c.translate(aperture.start, aperture.at);
    c.lineWidth = .7;c.lineJoin = 'round';
    c.fillStyle = material.steel;c.fillRect(-4, -4, 4, 8);c.fillRect(length, -4, 4, 8);
    c.strokeStyle = material.edge;c.strokeRect(-4, -4, 4, 8);c.strokeRect(length, -4, 4, 8);
    ellipse(c, -2, 0, .8, .8, material.brassLight);ellipse(c, length + 2, 0, .8, .8, material.brassLight);
    if (!options.closed) c.rotate(-.75);
    path(c, [[0, -2], [length, -2], [length + 1, 0], [length, 2], [0, 2]], true);
    c.fillStyle = material.brass;c.fill();c.strokeStyle = material.brassLight;c.stroke();
    c.strokeStyle = material.dark;c.beginPath();c.moveTo(2, 1);c.lineTo(Math.max(2, length - 2), 1);c.stroke();
    if (length >= 10) {
      c.strokeStyle = material.brassLight;c.lineWidth = 1;
      c.beginPath();c.moveTo(length * .5 - 3, -2);c.lineTo(length * .5 - 3, -5);c.lineTo(length * .5 + 3, -5);c.lineTo(length * .5 + 3, -2);c.stroke();
    }
    c.restore();
  }

  root.WSSApparatusArt = {pail: pail, hearth: hearth, heater: heater, hose: hose, tap: tap, opening: opening};
})(typeof window !== 'undefined' ? window : globalThis);
