/* Measured HYG 4.1 stars, CC BY-SA 4.0 data. See assets/data/stars-hyg-v41.source.json
   and docs/DAYLIGHT_GLOBE_STARS.md. This module has no rendering dependency. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GlobeStars = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000, J2000 = 2451545, TAU = Math.PI * 2;
  var ARCSEC = Math.PI / (180 * 3600), MAS = ARCSEC / 1000;
  var HEADER_BYTES = 32, RECORD_BYTES = 24;

  function julianDate(date) {
    var ms = +date;
    if (!Number.isFinite(ms)) throw new RangeError('Invalid star date');
    return ms / DAY + 2440587.5;
  }
  function wrap(value, period) { return (value % period + period) % period; }

  // USNO Circular 179, equations 2.11 and 2.12, IAU 2006 mean sidereal time.
  // UTC substitutes for UT1 and TT, adequate for this geocentric display.
  function gmstRadians(date) {
    var jd = julianDate(date), d = jd - J2000, t = d / 36525;
    var era = TAU * wrap(0.7790572732640 + 0.00273781191135448 * d + wrap(jd, 1), 1);
    var equinox = 0.014506 + t * (4612.156534 + t * (1.3915817 + t *
      (-0.00000044 + t * (-0.000029956 - 0.0000000368 * t))));
    return wrap(era + equinox * ARCSEC, TAU);
  }

  // Lieske IAU 1976 precession from J2000 mean equator/equinox to date.
  // Row-major, right-handed conventional equatorial XYZ (Z = north pole).
  function precessionMatrix(date) {
    var t = (julianDate(date) - J2000) / 36525;
    var zeta = t * (2306.2181 + t * (0.30188 + 0.017998 * t)) * ARCSEC;
    var z = t * (2306.2181 + t * (1.09468 + 0.018203 * t)) * ARCSEC;
    var theta = t * (2004.3109 + t * (-0.42665 - 0.041833 * t)) * ARCSEC;
    var ca = Math.cos(zeta), sa = Math.sin(zeta), cz = Math.cos(z), sz = Math.sin(z);
    var ct = Math.cos(theta), st = Math.sin(theta);
    return new Float64Array([
      cz * ct * ca - sz * sa, -cz * ct * sa - sz * ca, -cz * st,
      sz * ct * ca + cz * sa, -sz * ct * sa + cz * ca, -sz * st,
      st * ca, -st * sa, ct
    ]);
  }

  // J2000 conventional equatorial XYZ -> the globe's geographic XYZ.
  // longitude = RA(date) - GMST; Greenwich +X, north +Y, east longitude -Z.
  function earthFrame(date) {
    var p = precessionMatrix(date), q = gmstRadians(date), c = Math.cos(q), s = Math.sin(q);
    var out = new Float64Array(9);
    for (var j = 0; j < 3; j++) {
      out[j] = c * p[j] + s * p[3 + j];
      out[3 + j] = p[6 + j];
      out[6 + j] = s * p[j] - c * p[3 + j];
    }
    return out;
  }

  function linearChannel(encoded) {
    var value = encoded / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function decode(input) {
    var buffer, offset = 0, length;
    if (input instanceof ArrayBuffer) { buffer = input; length = buffer.byteLength; }
    else if (ArrayBuffer.isView(input)) { buffer = input.buffer; offset = input.byteOffset; length = input.byteLength; }
    else throw new TypeError('Star catalog must be an ArrayBuffer or view');
    if (length < HEADER_BYTES) throw new Error('Truncated star catalog');
    var view = new DataView(buffer, offset, length);
    var magic = '';
    for (var i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
    var count = view.getUint32(8, true), stride = view.getUint16(12, true);
    if (magic !== 'GLBSTAR1' || view.getUint16(14, true) !== 1 || stride !== RECORD_BYTES ||
        view.getFloat64(16, true) !== J2000 || view.getFloat32(24, true) !== 6 ||
        view.getUint32(28, true) !== 0 || count < 1 || count > 20000 ||
        length !== HEADER_BYTES + count * stride) throw new Error('Invalid star catalog header');
    var catalog = {
      count: count, epoch: J2000, magnitudeLimit: 6,
      ids: new Uint32Array(count), ra: new Float64Array(count), dec: new Float64Array(count),
      pmRa: new Int16Array(count), pmDec: new Int16Array(count),
      magnitudes: new Float32Array(count), colorIndices: new Float32Array(count),
      colors: new Float32Array(count * 3), missingColor: new Uint8Array(count)
    };
    var previousMagnitude = -Infinity, seen = new Set();
    for (i = 0; i < count; i++) {
      var at = HEADER_BYTES + i * stride, id = view.getUint32(at, true);
      var ra = view.getFloat32(at + 4, true), dec = view.getFloat32(at + 8, true);
      var magnitude = view.getInt16(at + 16, true) / 1000;
      var bv = view.getInt16(at + 18, true), flags = view.getUint8(at + 23);
      if (!id || seen.has(id) || !Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= TAU ||
          Math.abs(dec) > Math.PI / 2 || magnitude < -2 || magnitude > 6 || magnitude < previousMagnitude ||
          flags > 1 || (flags === 1) !== (bv === 32767)) throw new Error('Invalid star catalog record');
      seen.add(id); previousMagnitude = magnitude;
      catalog.ids[i] = id; catalog.ra[i] = ra; catalog.dec[i] = dec;
      catalog.pmRa[i] = view.getInt16(at + 12, true); catalog.pmDec[i] = view.getInt16(at + 14, true);
      catalog.magnitudes[i] = magnitude; catalog.colorIndices[i] = flags ? NaN : bv / 1000;
      catalog.missingColor[i] = flags;
      var r = linearChannel(view.getUint8(at + 20)), g = linearChannel(view.getUint8(at + 21));
      var b = linearChannel(view.getUint8(at + 22)), luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (!(luminance > 0)) throw new Error('Invalid star color');
      // Normalize to visual luminance 1. Magnitude controls flux separately.
      catalog.colors[i * 3] = r / luminance;
      catalog.colors[i * 3 + 1] = g / luminance;
      catalog.colors[i * 3 + 2] = b / luminance;
    }
    return catalog;
  }

  async function load(url, options) {
    options = options || {};
    var response = await fetch(url || 'assets/data/stars-hyg-v41.bin', { signal: options.signal });
    if (!response.ok) throw new Error('Star catalog HTTP ' + response.status);
    return decode(await response.arrayBuffer());
  }

  // pmRa is mu_alpha*cos(delta), not a change in raw RA. Moving in the two
  // tangent directions avoids dividing by cos(delta) near the celestial poles.
  function movedDirection(ra, dec, pmRa, pmDec, years) {
    var ca = Math.cos(ra), sa = Math.sin(ra), cd = Math.cos(dec), sd = Math.sin(dec);
    var a = (pmRa || 0) * years * MAS, d = (pmDec || 0) * years * MAS;
    var x = cd * ca - a * sa - d * sd * ca;
    var y = cd * sa + a * ca - d * sd * sa;
    var z = sd + d * cd, norm = Math.hypot(x, y, z);
    return [x / norm, y / norm, z / norm];
  }

  function worldPositions(catalog, date, radius, target) {
    radius = radius === undefined ? 1 : radius;
    if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('Invalid star radius');
    if (!catalog || !Number.isInteger(catalog.count) || catalog.count < 1) throw new TypeError('Invalid star catalog');
    if (target !== undefined && (!(target instanceof Float32Array) || target.length !== catalog.count * 3))
      throw new TypeError('Star target must be a Float32Array with count * 3 values');
    var out = target || new Float32Array(catalog.count * 3), frame = earthFrame(date);
    var years = (julianDate(date) - catalog.epoch) / 365.25;
    for (var i = 0; i < catalog.count; i++) {
      var v = movedDirection(catalog.ra[i], catalog.dec[i], catalog.pmRa[i], catalog.pmDec[i], years);
      for (var j = 0; j < 3; j++) out[i * 3 + j] = radius *
        (frame[j * 3] * v[0] + frame[j * 3 + 1] * v[1] + frame[j * 3 + 2] * v[2]);
    }
    return out;
  }

  function flux(magnitude) { return Math.pow(10, -0.4 * magnitude); }
  return Object.freeze({ decode: decode, load: load, julianDate: julianDate,
    gmstRadians: gmstRadians, precessionMatrix: precessionMatrix, earthFrame: earthFrame,
    worldPositions: worldPositions, flux: flux });
}));
