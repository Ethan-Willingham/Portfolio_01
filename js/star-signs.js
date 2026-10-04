/* ============================================================================
   star-signs.js  --  the engine behind "Star Signs, X-Rayed"

   A compact educational ephemeris based on Paul Schlyter's low-precision
   formulae (https://stjarnhimlen.se/comp/ppcomp.html). It calculates approximate
   geocentric ecliptic positions, angles and three house conventions. The page
   supports Gregorian dates in 1900 through 2099, within the useful period of
   the included Pluto series. Small errors can change a sign near its boundary.
   This is not a precision ephemeris or evidence for personality predictions.

   The engine exports itself for node so its calculations can be checked
   independently of the page UI.

   No dependencies, no build step, plain `var`. Same house rules as the rest of
   the site.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---- small angle helpers ------------------------------------------------ */
  var PI = Math.PI, RAD = PI / 180, DEG = 180 / PI;
  function rev(x) { return x - Math.floor(x / 360) * 360; }          // -> [0,360)
  function rev180(x) { x = rev(x); return x > 180 ? x - 360 : x; }   // -> (-180,180]
  function sind(x) { return Math.sin(x * RAD); }
  function cosd(x) { return Math.cos(x * RAD); }
  function tand(x) { return Math.tan(x * RAD); }
  function asind(x) { return Math.asin(x) * DEG; }
  function atan2d(y, x) { return Math.atan2(y, x) * DEG; }

  /* ---- the zodiac ---------------------------------------------------------- */
  var SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];
  var SIGN_LABEL = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir',
                    'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];

  // Tropical longitude (0 = the March-equinox point) -> sign, degree-in-sign.
  function placeOnZodiac(lon) {
    lon = rev(lon);
    var idx = Math.floor(lon / 30);
    return {
      lon: lon,
      sign: SIGNS[idx],
      signIndex: idx,
      label: SIGN_LABEL[idx],
      deg: lon - idx * 30                 // 0..30 within the sign
    };
  }

  /* ---- time: days since 1999-12-31 00:00 UT ------------------------------
     UTC calendar arithmetic avoids the one-day error in Schlyter's shorter
     formula during January and February 1900. Offsets may cross midnight. */
  function dayNumber(year, month, day, utHours) {
    return (Date.UTC(year, month - 1, day) - Date.UTC(1999, 11, 31)) / 86400000
      + (utHours || 0) / 24;
  }

  function obliquity(d) { return 23.4393 - 3.563e-7 * d; }  // ecliptic tilt, deg

  /* ---- Kepler: mean anomaly + eccentricity -> true anomaly & radius -------
     Iterates the eccentric anomaly. e here is small (< 0.25 even for Pluto),
     so a handful of Newton steps converge well past the precision we need. -- */
  function trueAnomaly(M, e) {
    M = rev(M);
    var E = M + e * DEG * sind(M) * (1 + e * cosd(M));   // first guess (deg)
    for (var k = 0; k < 12; k++) {
      var dE = (E - e * DEG * sind(E) - M) / (1 - e * cosd(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    var xv = cosd(E) - e;
    var yv = Math.sqrt(1 - e * e) * sind(E);
    return { v: rev(atan2d(yv, xv)), r: Math.sqrt(xv * xv + yv * yv) };
  }

  /* ---- orbital elements as linear functions of d -------------------------
     Each returns { N, i, w, a, e, M } in degrees / AU (Earth radii for Moon).
     Straight from Schlyter. ----------------------------------------------- */
  var ELEMENTS = {
    sun: function (d) { return { N: 0, i: 0,
      w: 282.9404 + 4.70935e-5 * d, a: 1.0,
      e: 0.016709 - 1.151e-9 * d, M: 356.0470 + 0.9856002585 * d }; },
    moon: function (d) { return { N: 125.1228 - 0.0529538083 * d, i: 5.1454,
      w: 318.0634 + 0.1643573223 * d, a: 60.2666,
      e: 0.054900, M: 115.3654 + 13.0649929509 * d }; },
    mercury: function (d) { return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.00e-8 * d,
      w: 29.1241 + 1.01444e-5 * d, a: 0.387098,
      e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d }; },
    venus: function (d) { return { N: 76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d,
      w: 54.8910 + 1.38374e-5 * d, a: 0.723330,
      e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d }; },
    mars: function (d) { return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d,
      w: 286.5016 + 2.92961e-5 * d, a: 1.523688,
      e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d }; },
    jupiter: function (d) { return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d,
      w: 273.8777 + 1.64505e-5 * d, a: 5.20256,
      e: 0.048498 + 4.469e-9 * d, M: 19.8950 + 0.0830853001 * d }; },
    saturn: function (d) { return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d,
      w: 339.3939 + 2.97661e-5 * d, a: 9.55475,
      e: 0.055546 - 9.499e-9 * d, M: 316.9670 + 0.0334442282 * d }; },
    uranus: function (d) { return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d,
      w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d,
      e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d }; },
    neptune: function (d) { return { N: 131.7806 + 3.0173e-5 * d, i: 1.7700 - 2.55e-7 * d,
      w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d,
      e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d }; }
  };

  // Heliocentric ecliptic rectangular coords for a planet (AU). Sun handled
  // separately; Moon and Pluto are special-cased in geocentric().
  function helioRect(el) {
    var ta = trueAnomaly(el.M, el.e);
    var r = ta.r * el.a, v = ta.v;
    var xh = r * (cosd(el.N) * cosd(v + el.w) - sind(el.N) * sind(v + el.w) * cosd(el.i));
    var yh = r * (sind(el.N) * cosd(v + el.w) + cosd(el.N) * sind(v + el.w) * cosd(el.i));
    var zh = r * (sind(v + el.w) * sind(el.i));
    return { x: xh, y: yh, z: zh, r: r, v: v };
  }

  // Sun, geocentric ecliptic (the Sun's apparent position from Earth).
  function sunGeo(d) {
    var el = ELEMENTS.sun(d);
    var ta = trueAnomaly(el.M, el.e);
    var lon = rev(el.w + ta.v);
    var r = ta.r;
    return { x: r * cosd(lon), y: r * sind(lon), z: 0, lon: lon, lat: 0, r: r, mLon: rev(el.w + el.M) };
  }

  /* ---- the Moon, with the dozen perturbation terms that matter ----------- */
  function moonGeo(d) {
    var m = ELEMENTS.moon(d), s = ELEMENTS.sun(d);
    var ta = trueAnomaly(m.M, m.e);
    var r = ta.r * m.a, v = ta.v;
    // heliocentric-style position about the Earth (Moon orbits us)
    var xe = r * (cosd(m.N) * cosd(v + m.w) - sind(m.N) * sind(v + m.w) * cosd(m.i));
    var ye = r * (sind(m.N) * cosd(v + m.w) + cosd(m.N) * sind(v + m.w) * cosd(m.i));
    var ze = r * (sind(v + m.w) * sind(m.i));
    var lon = atan2d(ye, xe), lat = atan2d(ze, Math.sqrt(xe * xe + ye * ye));

    // perturbation arguments
    var Ms = s.M, Mm = m.M;
    var Ls = rev(s.M + s.w);              // Sun mean longitude
    var Lm = rev(m.M + m.w + m.N);        // Moon mean longitude
    var D = rev(Lm - Ls);                 // mean elongation
    var F = rev(Lm - m.N);                // argument of latitude

    lon += -1.274 * sind(Mm - 2 * D)
         +  0.658 * sind(2 * D)
         -  0.186 * sind(Ms)
         -  0.059 * sind(2 * Mm - 2 * D)
         -  0.057 * sind(Mm - 2 * D + Ms)
         +  0.053 * sind(Mm + 2 * D)
         +  0.046 * sind(2 * D - Ms)
         +  0.041 * sind(Mm - Ms)
         -  0.035 * sind(D)
         -  0.031 * sind(Mm + Ms)
         -  0.015 * sind(2 * F - 2 * D)
         +  0.011 * sind(Mm - 4 * D);
    lat += -0.173 * sind(F - 2 * D)
         -  0.055 * sind(Mm - F - 2 * D)
         -  0.046 * sind(Mm + F - 2 * D)
         +  0.033 * sind(F + 2 * D)
         +  0.017 * sind(2 * Mm + F);
    lon = rev(lon);
    return { lon: lon, lat: lat, r: r };
  }

  /* ---- Pluto, Schlyter's bespoke series (valid roughly 1800-2099) -------- */
  function plutoHelio(d) {
    var S = 50.03 + 0.033459652 * d;
    var P = 238.95 + 0.003968789 * d;
    var lon = 238.9508 + 0.00400703 * d
      - 19.799 * sind(P) + 19.848 * cosd(P)
      + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P)
      + 0.610 * sind(3 * P) + 1.211 * cosd(3 * P)
      - 0.341 * sind(4 * P) - 0.190 * cosd(4 * P)
      + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P)
      - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P)
      + 0.020 * sind(S - P) - 0.010 * cosd(S - P);
    var lat = -3.9082
      - 5.453 * sind(P) - 14.975 * cosd(P)
      + 3.527 * sind(2 * P) + 1.673 * cosd(2 * P)
      - 1.051 * sind(3 * P) + 0.328 * cosd(3 * P)
      + 0.179 * sind(4 * P) - 0.292 * cosd(4 * P)
      + 0.019 * sind(5 * P) + 0.100 * cosd(5 * P)
      - 0.031 * sind(6 * P) - 0.026 * cosd(6 * P)
      + 0.011 * cosd(S - P);
    var r = 40.72
      + 6.68 * sind(P) + 6.90 * cosd(P)
      - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P)
      + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
    lon = rev(lon);
    return {
      x: r * cosd(lon) * cosd(lat),
      y: r * sind(lon) * cosd(lat),
      z: r * sind(lat), r: r
    };
  }

  // The big-planet mutual perturbations (Jupiter/Saturn/Uranus longitude only).
  function bigPlanetPerturb(name, d) {
    var Mj = ELEMENTS.jupiter(d).M, Msa = ELEMENTS.saturn(d).M, Mu = ELEMENTS.uranus(d).M;
    if (name === 'jupiter') {
      return -0.332 * sind(2 * Mj - 5 * Msa - 67.6)
           - 0.056 * sind(2 * Mj - 2 * Msa + 21)
           + 0.042 * sind(3 * Mj - 5 * Msa + 21)
           - 0.036 * sind(Mj - 2 * Msa)
           + 0.022 * cosd(Mj - Msa)
           + 0.023 * sind(2 * Mj - 3 * Msa + 52)
           - 0.016 * sind(Mj - 5 * Msa - 69);
    }
    if (name === 'saturn') {
      return  0.812 * sind(2 * Mj - 5 * Msa - 67.6)
           - 0.229 * cosd(2 * Mj - 4 * Msa - 2)
           + 0.119 * sind(Mj - 2 * Msa - 3)
           + 0.046 * sind(2 * Mj - 6 * Msa - 69)
           + 0.014 * sind(Mj - 3 * Msa + 32);
    }
    if (name === 'uranus') {
      return  0.040 * sind(Msa - 2 * Mu + 6)
           + 0.035 * sind(Msa - 3 * Mu + 33)
           - 0.015 * sind(Mj - Mu + 20);
    }
    return 0;
  }

  // Geocentric ecliptic longitude/latitude/distance for any supported body.
  function geocentric(name, d) {
    if (name === 'sun') { var sg = sunGeo(d); return { lon: sg.lon, lat: 0, r: sg.r }; }
    if (name === 'moon') return moonGeo(d);

    var s = sunGeo(d);   // Sun's geocentric rectangular = -(Earth heliocentric)
    var p;
    if (name === 'pluto') {
      p = plutoHelio(d);
    } else {
      p = helioRect(ELEMENTS[name](d));
      var dl = bigPlanetPerturb(name, d);
      if (dl) {
        // rotate the heliocentric vector by the longitude perturbation
        var lon0 = atan2d(p.y, p.x) + dl;
        var rxy = Math.sqrt(p.x * p.x + p.y * p.y);
        p = { x: rxy * cosd(lon0), y: rxy * sind(lon0), z: p.z, r: p.r };
      }
    }
    var xg = p.x + s.x, yg = p.y + s.y, zg = p.z;
    return {
      lon: rev(atan2d(yg, xg)),
      lat: atan2d(zg, Math.sqrt(xg * xg + yg * yg)),
      r: Math.sqrt(xg * xg + yg * yg + zg * zg)
    };
  }

  /* ---- Ascendant, Midheaven, sidereal time ------------------------------- */
  function siderealMC(d, utHours, lonEastDeg, obl) {
    var s = sunGeo(d);
    var gmst0 = rev(s.mLon + 180);            // Schlyter's continuously varying GMST0
    var lst = rev(gmst0 + utHours * 15.0 + lonEastDeg);  // local sidereal, deg
    var ramc = lst;                            // RA of the meridian
    var mc = rev(atan2d(sind(ramc), cosd(ramc) * cosd(obl)));
    return { ramc: ramc, mc: mc, lst: lst };
  }

  function ascendant(ramc, latDeg, obl) {
    // Standard Ascendant formula; quadrant fixed so the ASC sits on the
    // eastern horizon (roughly a quarter-turn ahead of the MC).
    var asc = atan2d(cosd(ramc), -(sind(ramc) * cosd(obl) + tand(latDeg) * sind(obl)));
    return rev(asc);
  }

  /* ---- house systems ------------------------------------------------------
     Whole Sign  : an ancient scheme. House 1 is the entire sign the Ascendant
                   falls in; the rest follow, one sign each.
     Equal       : house 1 starts exactly on the Ascendant degree; +30 each.
     Placidus    : a widely used time-based scheme. Divides the semidiurnal/seminocturnal
                   arcs by time. Undefined toward the poles, so we fall back to
                   Equal above ~66 degrees latitude. -------------------------- */
  function housesWhole(asc) {
    var base = Math.floor(asc / 30) * 30, c = [];
    for (var h = 0; h < 12; h++) c.push(rev(base + h * 30));
    return c;
  }
  function housesEqual(asc) {
    var c = [];
    for (var h = 0; h < 12; h++) c.push(rev(asc + h * 30));
    return c;
  }
  function housesPlacidus(ramc, mc, asc, latDeg, obl) {
    if (Math.abs(latDeg) > 66) return { cusps: housesEqual(asc), fallback: 'latitude above 66 degrees' };

    function eclFromRA(ra) { return rev(atan2d(sind(ra), cosd(ra) * cosd(obl))); }
    function declOf(lon) { return asind(sind(obl) * sind(lon)); }
    function acosd(x) { x = Math.max(-1, Math.min(1, x)); return Math.acos(x) * DEG; }

    // Each intermediate cusp sits where its own right ascension equals
    // RAMC + offset + mult * (its diurnal semi-arc). Solved by fixed-point
    // iteration: guess RA, read off the ecliptic point and its declination,
    // recompute the semi-arc, repeat. (Derived from the hour-angle of each
    // cusp as a fraction of its day arc; offsets fold in the 60/120 turns for
    // the below-horizon eastern cusps.)
    var failed = false;
    function solve(offset, mult) {
      var ra = ramc + offset + mult * 90;          // first guess
      for (var k = 0; k < 40; k++) {
        var dsa = acosd(-tand(latDeg) * tand(declOf(eclFromRA(ra))));
        var raNew = ramc + offset + mult * dsa;
        if (Math.abs(rev180(raNew - ra)) < 1e-7) { ra = raNew; break; }
        ra = raNew;
      }
      if (k === 40) failed = true;
      return eclFromRA(ra);
    }

    var c = new Array(12);
    c[0] = asc;                       // 1  Ascendant (exact)
    c[3] = rev(mc + 180);             // 4  IC (exact)
    c[6] = rev(asc + 180);            // 7  Descendant (exact)
    c[9] = mc;                        // 10 Midheaven (exact)
    c[10] = solve(0, 1 / 3);          // 11
    c[11] = solve(0, 2 / 3);          // 12
    c[1] = solve(60, 2 / 3);          // 2
    c[2] = solve(120, 1 / 3);         // 3
    c[4] = rev(c[10] + 180);          // 5  opposite 11
    c[5] = rev(c[11] + 180);          // 6  opposite 12
    c[7] = rev(c[1] + 180);           // 8  opposite 2
    c[8] = rev(c[2] + 180);           // 9  opposite 3

    for (var h = 0; h < 12; h++) if (!isFinite(c[h])) failed = true;
    if (failed) return { cusps: housesEqual(asc), fallback: 'cusp solver did not converge' };
    return { cusps: c, fallback: null };
  }

  /* ---- aspects ------------------------------------------------------------ */
  var ASPECTS = [
    { name: 'conjunction', angle: 0, orb: 8 },
    { name: 'sextile', angle: 60, orb: 5 },
    { name: 'square', angle: 90, orb: 7 },
    { name: 'trine', angle: 120, orb: 7 },
    { name: 'opposition', angle: 180, orb: 8 }
  ];
  function findAspects(bodies) {
    var out = [];
    for (var i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        var sep = Math.abs(rev180(bodies[i].lon - bodies[j].lon));
        for (var a = 0; a < ASPECTS.length; a++) {
          var diff = Math.abs(sep - ASPECTS[a].angle);
          if (diff <= ASPECTS[a].orb) {
            out.push({ a: bodies[i].key, b: bodies[j].key, type: ASPECTS[a].name,
                       orb: +diff.toFixed(2) });
          }
        }
      }
    }
    return out;
  }

  /* ---- a linear Fagan-Bradley sidereal comparison ------------------------
     The Swiss Ephemeris source defines 24.042044444 degrees at B1950, not
     J2000. Its mean J2000 value is about 24.7403 degrees. The linear rate here
     is an approximation, not Swiss Ephemeris's full precession calculation.
     Sidereal signs remain twelve equal bins, not IAU constellations. */
  function ayanamsha(d) {
    var years = (d - 1.5) / 365.25;  // Noon UT on 2000-01-01 is this approximation's reference.
    return 24.7403 + (50.29 / 3600) * years;
  }

  /* ---- the whole chart ---------------------------------------------------- */
  var BODY_ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars',
                    'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

  function computeChart(opts) {
    // opts: { year, month, day, hour, minute, tzOffsetHours, latDeg, lonEastDeg, houseSystem }
    function numberIn(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
    var hourPart = opts.hour === undefined ? 0 : opts.hour;
    var minute = opts.minute === undefined ? 0 : opts.minute;
    var off = opts.tzOffsetHours === undefined ? 0 : opts.tzOffsetHours;
    if (!numberIn(opts.year, 1900, 2099) || opts.year % 1 ||
        !numberIn(opts.month, 1, 12) || opts.month % 1 ||
        !numberIn(opts.day, 1, 31) || opts.day % 1 ||
        new Date(Date.UTC(opts.year, opts.month - 1, opts.day)).getUTCMonth() !== opts.month - 1) {
      throw new RangeError('Choose a valid Gregorian date from 1900 through 2099.');
    }
    if (!numberIn(hourPart, 0, 23) || hourPart % 1 || !numberIn(minute, 0, 59) || minute % 1) {
      throw new RangeError('Choose a valid time.');
    }
    if (!numberIn(off, -14, 14)) throw new RangeError('Enter a UTC offset from -14 to +14 hours.');
    var hasLat = opts.latDeg !== null && opts.latDeg !== undefined;
    var hasLon = opts.lonEastDeg !== null && opts.lonEastDeg !== undefined;
    if (hasLat !== hasLon || (hasLat && (!numberIn(opts.latDeg, -90, 90) || Math.abs(opts.latDeg) === 90 ||
        !numberIn(opts.lonEastDeg, -180, 180)))) {
      throw new RangeError('Enter latitude between -90 and +90 (excluding the poles), and longitude from -180 to +180.');
    }
    if (opts.houseSystem && ['whole', 'equal', 'placidus'].indexOf(opts.houseSystem) < 0) {
      throw new RangeError('Choose a supported house system.');
    }
    var hour = hourPart + minute / 60;
    var utHours = hour - off;
    var d = dayNumber(opts.year, opts.month, opts.day, utHours);
    var obl = obliquity(d);

    var bodies = BODY_ORDER.map(function (name) {
      var g = geocentric(name, d);
      var z = placeOnZodiac(g.lon);
      return { key: name, lon: g.lon, lat: g.lat, dist: g.r,
               sign: z.sign, signIndex: z.signIndex, label: z.label, deg: z.deg };
    });

    var hasPlace = hasLat && hasLon;
    var angles = null, houses = null, houseFallback = null;
    var sys = opts.houseSystem || 'whole', effectiveHouseSystem = sys;
    if (hasPlace) {
      var sid = siderealMC(d, utHours, opts.lonEastDeg, obl);
      var asc = ascendant(sid.ramc, opts.latDeg, obl);
      var ascZ = placeOnZodiac(asc), mcZ = placeOnZodiac(sid.mc);
      angles = { asc: asc, mc: sid.mc, ascSign: ascZ, mcSign: mcZ, lst: sid.lst };
      var placidus = sys === 'placidus' ? housesPlacidus(sid.ramc, sid.mc, asc, opts.latDeg, obl) : null;
      var cusps = placidus ? placidus.cusps : sys === 'equal' ? housesEqual(asc) : housesWhole(asc);
      houseFallback = placidus ? placidus.fallback : null;
      if (houseFallback) effectiveHouseSystem = 'equal';
      houses = cusps.map(function (c) { return placeOnZodiac(c); });
      // tag each body with the house it falls in
      bodies.forEach(function (b) { b.house = houseOf(b.lon, cusps); });
    }

    var aspects = findAspects(bodies);
    var ayan = ayanamsha(d);

    return {
      d: d, obl: obl, ut: utHours, ayanamsha: ayan,
      bodies: bodies, angles: angles, houses: houses, aspects: aspects,
      houseFallback: houseFallback, effectiveHouseSystem: effectiveHouseSystem,
      sun: bodies[0], moon: bodies[1], rising: angles ? angles.ascSign : null
    };
  }

  function houseOf(lon, cusps) {
    for (var h = 0; h < 12; h++) {
      var a = cusps[h], b = cusps[(h + 1) % 12];
      var span = rev(b - a), pos = rev(lon - a);
      if (pos < span || span === 0) return h + 1;
    }
    return 12;
  }

  /* ---- export the engine for node + the page ----------------------------- */
  var ENGINE = {
    SIGNS: SIGNS, SIGN_LABEL: SIGN_LABEL, ASPECTS: ASPECTS, BODY_ORDER: BODY_ORDER,
    dayNumber: dayNumber, obliquity: obliquity, geocentric: geocentric,
    placeOnZodiac: placeOnZodiac, ascendant: ascendant, siderealMC: siderealMC,
    ayanamsha: ayanamsha, computeChart: computeChart, rev: rev
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  root.StarSigns = ENGINE;

})(typeof window !== 'undefined' ? window : globalThis);
