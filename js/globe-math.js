/* Daylight Globe astronomy. No network or rendering dependencies.
   Solar equations: NOAA GML's Meeus calculator, with east-positive longitude.
   Moon: Paul Schlyter's low-precision orbital model, including its perturbations.
   References and limits: docs/DAYLIGHT_GLOBE_MATH.md. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GlobeMath = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEG = Math.PI / 180;
  var DAY = 86400000;
  var J2000 = 2451545;
  var HORIZON = -0.833;
  var AU_EARTH_RADII = 23454.791;
  function modulo(a, n) { return ((a % n) + n) % n; }
  function signed(a) { return modulo(a + 180, 360) - 180; }
  function clamp(a) { return Math.max(-1, Math.min(1, a)); }
  function sin(a) { return Math.sin(a * DEG); }
  function cos(a) { return Math.cos(a * DEG); }
  function epoch(date) {
    var value = date instanceof Date ? date.getTime() : Number(date);
    if (!Number.isFinite(value)) throw new RangeError('Invalid astronomy date');
    return value;
  }
  function geographicVector(latitude, longitude) {
    return {x: cos(latitude) * cos(longitude), y: sin(latitude), z: -cos(latitude) * sin(longitude)};
  }
  function solar(date, tilt) {
    var ms = epoch(date);
    var jd = ms / DAY + 2440587.5;
    var t = (jd - J2000) / 36525;
    var meanLongitude = modulo(280.46646 + t * (36000.76983 + 0.0003032 * t), 360);
    var anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    var eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    var center = sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) + sin(2 * anomaly) * (0.019993 - 0.000101 * t) + sin(3 * anomaly) * 0.000289;
    var omega = 125.04 - 1934.136 * t;
    var apparentLongitude = meanLongitude + center - 0.00569 - 0.00478 * sin(omega);
    var meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    var realObliquity = meanObliquity + 0.00256 * cos(omega);
    var obliquity = tilt == null ? realObliquity : Number(tilt);
    if (!Number.isFinite(obliquity) || obliquity < 0 || obliquity > 90) throw new RangeError('Invalid axial tilt');
    var declination = Math.asin(sin(obliquity) * sin(apparentLongitude)) / DEG;
    var y = Math.pow(Math.tan(obliquity * DEG / 2), 2);
    var equationOfTime = 4 / DEG * (y * sin(2 * meanLongitude) - 2 * eccentricity * sin(anomaly) + 4 * eccentricity * y * sin(anomaly) * cos(2 * meanLongitude) - 0.5 * y * y * sin(4 * meanLongitude) - 1.25 * eccentricity * eccentricity * sin(2 * anomaly));
    var utcMinutes = modulo(ms, DAY) / 60000;
    var longitude = signed(180 - utcMinutes / 4 - equationOfTime / 4);
    var distanceAU = 1.000001018 * (1 - eccentricity * eccentricity) / (1 + eccentricity * cos(anomaly + center));
    return {declination: declination, equationOfTime: equationOfTime, longitude: longitude, vector: geographicVector(declination, longitude), obliquity: obliquity, realObliquity: realObliquity, eclipticLongitude: modulo(apparentLongitude, 360), distanceAU: distanceAU};
  }
  // Geometric elevation. Refraction belongs in the sunrise horizon threshold,
  // never in the physical globe's day/night lighting direction.
  function solarElevation(date, latitude, longitude, tilt) {
    var sun = solar(date, tilt);
    return Math.asin(clamp(sin(latitude) * sin(sun.declination) + cos(latitude) * cos(sun.declination) * cos(longitude - sun.longitude))) / DEG;
  }
  function daylight(date, latitude, longitude, tilt) {
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude)) throw new RangeError('Invalid geographic coordinate');
    longitude = signed(longitude);
    // Select the displayed local apparent solar date, including equation of
    // time. Solve both midnight boundaries in UTC so brief polar events cannot
    // be assigned to a neighboring solar date near midnight.
    var ms = epoch(date);
    var solarStamp = ms + (longitude * 4 + solar(ms,tilt).equationOfTime) * 60000;
    var dayStamp = Math.floor(solarStamp / DAY) * DAY;
    function midnight(stamp) {
      var utc = stamp - longitude * 240000;
      for (var iteration = 0; iteration < 6; iteration++) utc = stamp - (longitude * 4 + solar(utc,tilt).equationOfTime) * 60000;
      return utc;
    }
    var start = midnight(dayStamp);
    var end = midnight(dayStamp + DAY);
    var step = (end - start) / 48;
    var samples = [];
    for (var sample = -1; sample <= 49; sample++) samples.push({time: start + sample * step, elevation: solarElevation(start + sample * step, latitude, longitude, tilt) - HORIZON});
    // Near the polar circles a day or night can last less than one sample.
    // Add true local extrema so a brief horizon crossing is still bracketed.
    var extrema = [];
    for (var k = 1; k < samples.length - 1; k++) {
      var a = samples[k - 1].elevation;
      var b = samples[k].elevation;
      var c = samples[k + 1].elevation;
      var maximum = b > a && b > c;
      var minimum = b < a && b < c;
      if (maximum || minimum) {
        var left = samples[k - 1].time;
        var right = samples[k + 1].time;
        for (var search = 0; search < 32; search++) {
          var first = left + (right - left) / 3;
          var second = right - (right - left) / 3;
          var firstElevation = solarElevation(first, latitude, longitude, tilt);
          var secondElevation = solarElevation(second, latitude, longitude, tilt);
          if ((firstElevation < secondElevation) === maximum) left = first;
          else right = second;
        }
        var peak = (left + right) / 2;
        if (peak > start && peak < end) extrema.push({time: peak, elevation: solarElevation(peak, latitude, longitude, tilt) - HORIZON});
      }
    }
    samples = samples.filter(function (sample) { return sample.time >= start && sample.time <= end; }).concat(extrema).sort(function (a, b) { return a.time - b.time; });
    var previousTime = start;
    var previous = samples[0].elevation;
    var initiallyUp = previous >= 0;
    var up = initiallyUp;
    var upSince = up ? start : null;
    var daylightMs = 0;
    var sunrise = null;
    var sunset = null;
    for (var i = 1; i < samples.length; i++) {
      var time = samples[i].time;
      var elevation = samples[i].elevation;
      if ((previous < 0 && elevation >= 0) || (previous >= 0 && elevation < 0)) {
        var lo = previousTime;
        var hi = time;
        var rise = elevation >= 0;
        for (var j = 0; j < 24; j++) {
          var middle = (lo + hi) / 2;
          var above = solarElevation(middle, latitude, longitude, tilt) >= HORIZON;
          if (above === rise) hi = middle;
          else lo = middle;
        }
        var crossing = new Date((lo + hi) / 2);
        if (rise) { sunrise = crossing; up = true; upSince = crossing.getTime(); }
        else { sunset = crossing; daylightMs += crossing.getTime() - upSince; up = false; upSince = null; }
      }
      previousTime = time;
      previous = elevation;
    }
    if (up) daylightMs += end - upSince;
    var polar = sunrise === null && sunset === null ? (initiallyUp ? 'day' : 'night') : null;
    // Apparent solar days vary by seconds in elapsed UTC length. A complete
    // polar solar day still represents 24 solar-clock hours in the pin panel.
    var hours = polar === 'day' ? 24 : polar === 'night' ? 0 : Math.max(0,Math.min(24,daylightMs / 3600000));
    return {sunrise: sunrise, sunset: sunset, hours: hours, polar: polar, start: new Date(start), end: new Date(end), solarDate: new Date(dayStamp).toISOString().slice(0,10)};
  }
  function moon(date) {
    var ms = epoch(date);
    var jd = ms / DAY + 2440587.5;
    var d = jd - 2451543.5;
    var node = modulo(125.1228 - 0.0529538083 * d, 360);
    var inclination = 5.1454;
    var periapsis = modulo(318.0634 + 0.1643573223 * d, 360);
    var anomaly = modulo(115.3654 + 13.0649929509 * d, 360);
    var eccentricity = 0.0549;
    var semimajor = 60.2666;
    var eccentricAnomaly = anomaly * DEG;
    // Newton's method solves Kepler's equation rather than retaining its
    // first-order approximation at the Moon's comparatively large eccentricity.
    for (var i = 0; i < 5; i++) eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - anomaly * DEG) / (1 - eccentricity * Math.cos(eccentricAnomaly));
    var xv = semimajor * (Math.cos(eccentricAnomaly) - eccentricity);
    var yv = semimajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly);
    var trueAnomaly = Math.atan2(yv, xv) / DEG;
    var distance = Math.sqrt(xv * xv + yv * yv);
    var x = distance * (cos(node) * cos(trueAnomaly + periapsis) - sin(node) * sin(trueAnomaly + periapsis) * cos(inclination));
    var y = distance * (sin(node) * cos(trueAnomaly + periapsis) + cos(node) * sin(trueAnomaly + periapsis) * cos(inclination));
    var z = distance * sin(trueAnomaly + periapsis) * sin(inclination);
    var longitude = Math.atan2(y, x) / DEG;
    var latitude = Math.atan2(z, Math.hypot(x, y)) / DEG;
    var sunAnomaly = modulo(356.0470 + 0.9856002585 * d, 360);
    var sunPeriapsis = 282.9404 + 0.0000470935 * d;
    var sunMeanLongitude = sunAnomaly + sunPeriapsis;
    var moonMeanLongitude = anomaly + periapsis + node;
    var elongationMean = moonMeanLongitude - sunMeanLongitude;
    var argumentLatitude = moonMeanLongitude - node;
    longitude += -1.274 * sin(anomaly - 2 * elongationMean) + 0.658 * sin(2 * elongationMean) - 0.186 * sin(sunAnomaly) - 0.059 * sin(2 * anomaly - 2 * elongationMean) - 0.057 * sin(anomaly - 2 * elongationMean + sunAnomaly) + 0.053 * sin(anomaly + 2 * elongationMean) + 0.046 * sin(2 * elongationMean - sunAnomaly) + 0.041 * sin(anomaly - sunAnomaly) - 0.035 * sin(elongationMean) - 0.031 * sin(anomaly + sunAnomaly) - 0.015 * sin(2 * argumentLatitude - 2 * elongationMean) + 0.011 * sin(anomaly - 4 * elongationMean);
    latitude += -0.173 * sin(argumentLatitude - 2 * elongationMean) - 0.055 * sin(anomaly - argumentLatitude - 2 * elongationMean) - 0.046 * sin(anomaly + argumentLatitude - 2 * elongationMean) + 0.033 * sin(argumentLatitude + 2 * elongationMean) + 0.017 * sin(2 * anomaly + argumentLatitude);
    distance += -0.58 * cos(anomaly - 2 * elongationMean) - 0.46 * cos(2 * elongationMean);
    var sun = solar(ms);
    // Equatorial coordinates of date, then Earth-fixed using Greenwich sidereal
    // rotation. Three.js texture convention: Greenwich +X, east longitude -Z.
    x = cos(longitude) * cos(latitude);
    y = sin(longitude) * cos(latitude) * cos(sun.realObliquity) - sin(latitude) * sin(sun.realObliquity);
    z = sin(longitude) * cos(latitude) * sin(sun.realObliquity) + sin(latitude) * cos(sun.realObliquity);
    var ra = Math.atan2(y, x) / DEG;
    var dec = Math.atan2(z, Math.hypot(x, y)) / DEG;
    var t = (jd - J2000) / 36525;
    var sidereal = modulo(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * t * t - t * t * t / 38710000, 360);
    var earthLongitude = signed(ra - sidereal);
    var vector = geographicVector(dec, earthLongitude);
    var dot = clamp(vector.x * sun.vector.x + vector.y * sun.vector.y + vector.z * sun.vector.z);
    var sunDistance = sun.distanceAU * AU_EARTH_RADII;
    var incidenceCos = (distance - sunDistance * dot) / Math.sqrt(sunDistance * sunDistance + distance * distance - 2 * sunDistance * distance * dot);
    return {vector: vector, distance: distance, illumination: (1 + clamp(incidenceCos)) / 2, phase: modulo(longitude - sun.eclipticLongitude, 360), elongation: Math.acos(dot) / DEG, longitude: earthLongitude, declination: dec, sunVector: sun.vector, sunDistanceEarthRadii: sunDistance};
  }
  function apparentSolarMinutes(date, longitude, tilt) {
    var ms = epoch(date);
    return modulo(ms / 60000 + longitude * 4 + solar(ms,tilt).equationOfTime, 1440);
  }
  return {solar: solar, solarElevation: solarElevation, daylight: daylight, moon: moon, apparentSolarMinutes: apparentSolarMinutes, geographicVector: geographicVector};
}));
