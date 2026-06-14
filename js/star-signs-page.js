/* ============================================================================
   star-signs-page.js  --  the page wiring for "Star Signs, X-Rayed".
   Depends on the global StarSigns engine (js/star-signs.js). Builds the
   instrument panel, the Barnum opener, the precession X-ray, the rising-sign
   scrubber, and the house-disagreement view. Plain var, no deps.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof StarSigns === 'undefined') return;
  var E = StarSigns;

  var PLANET = { sun:'☉', moon:'☽', mercury:'☿', venus:'♀', mars:'♂',
    jupiter:'♃', saturn:'♄', uranus:'♅', neptune:'♆', pluto:'♇' };
  var NAME = { sun:'Sun', moon:'Moon', mercury:'Mercury', venus:'Venus', mars:'Mars',
    jupiter:'Jupiter', saturn:'Saturn', uranus:'Uranus', neptune:'Neptune', pluto:'Pluto' };

  /* who decided each planet means what, and when */
  var PLANET_PROV = {
    sun:     ['vitality, the core self', 'A luminary since Babylonian astronomy; its dignity in Leo is fixed by Ptolemy.', '~150 CE'],
    moon:    ['moods, instinct, the body', 'The second luminary; Babylonian, refined by the Hellenistic astrologers.', '~150 CE'],
    mercury: ['the mind, speech, trade', 'Named for the messenger; rule of Gemini and Virgo set by Ptolemy.', '~150 CE'],
    venus:   ['love, beauty, what you value', 'Inherits the Mesopotamian Inanna / Ishtar lineage; rules Taurus and Libra in Ptolemy.', '~150 CE'],
    mars:    ['drive, anger, conflict', "Ptolemy's lesser malefic; ruler of Aries (and, before Pluto, Scorpio).", '~150 CE'],
    jupiter: ['luck, growth, excess', "Ptolemy's greater benefic; ruler of Sagittarius and Pisces.", '~150 CE'],
    saturn:  ['limits, time, discipline', "Ptolemy's greater malefic; ruler of Capricorn and Aquarius.", '~150 CE'],
    uranus:  ['disruption, the new', 'Discovered 1781 by Herschel; its meaning is modern, written in after the fact, and it took Aquarius from Saturn.', '1781'],
    neptune: ['dreams, dissolution, illusion', 'Discovered 1846; meaning assigned in the 20th century, and it took Pisces from Jupiter.', '1846'],
    pluto:   ['power, death, rebirth', 'Found 1930; meaning is mid-20th-century, and it took Scorpio from Mars. Demoted to a dwarf planet in 2006; astrology kept it.', '1930'] };

  /* the 12 signs: trait, then where the trait actually comes from */
  var SIGN_PROV = {
    Aries:['initiative, heat, the first move','Babylonian "Hired Man", the ram; the fiery, cardinal, Mars-ruled character is Ptolemy.'],
    Taurus:['steadiness, appetite, the material','The Bull of Heaven, among the oldest constellations; Venus-ruled, fixed earth in Ptolemy.'],
    Gemini:['talk, cleverness, duality','The Babylonian Great Twins; the "mercurial" intellect is the Hellenistic Mercury assignment.'],
    Cancer:['home, mood, protection','Babylonian; the crab and the Moon link, watery and cardinal, codified by Ptolemy.'],
    Leo:['pride, display, the self','The lion, ancient; Sun-ruled, fixed-fire royalty is Hellenistic.'],
    Virgo:['order, service, analysis','The grain maiden (Mesopotamian Shala); Mercury-ruled, mutable earth in Ptolemy.'],
    Libra:['balance, fairness, the other','Once the Scorpion\'s claws; Rome split off the Scales. Venus-ruled.'],
    Scorpio:['depth, control, intensity','The ancient scorpion; Mars-ruled, then Pluto after 1930, fixed water.'],
    Sagittarius:['freedom, meaning, the horizon','The archer-centaur; Jupiter-ruled, mutable fire in Ptolemy.'],
    Capricorn:['ambition, structure, time','The sea-goat, Sumerian (Enki); Saturn-ruled, cardinal earth.'],
    Aquarius:['ideas, distance, the group','The water-pourer, Babylonian (GU.LA); Saturn-ruled, then Uranus after 1781.'],
    Pisces:['empathy, drift, the unseen','The two fish; Jupiter-ruled, then Neptune after 1846, mutable water.'] };

  /* which constellation the Sun is ACTUALLY in, by IAU boundaries (entry dates).
     Note Ophiuchus, the 13th, which the zodiac deletes. */
  var IAU = [[120,'Capricornus'],[216,'Aquarius'],[311,'Pisces'],[418,'Aries'],
    [513,'Taurus'],[621,'Gemini'],[720,'Cancer'],[810,'Leo'],[916,'Virgo'],
    [1030,'Libra'],[1123,'Scorpius'],[1129,'Ophiuchus'],[1217,'Sagittarius']];
  function iauSun(month, day) {
    var md = month * 100 + day, con = 'Sagittarius';
    for (var i = 0; i < IAU.length; i++) if (md >= IAU[i][0]) con = IAU[i][1];
    return con;
  }

  /* a curated, self-contained city list: name, lat, lon(E+), standard UTC offset.
     Offsets are standard time; the X-ray is honest about DST + historical zones. */
  var CITIES = [
    ['New York, USA',40.71,-74.01,-5],['Los Angeles, USA',34.05,-118.24,-8],
    ['Chicago, USA',41.88,-87.63,-6],['Houston, USA',29.76,-95.37,-6],
    ['Denver, USA',39.74,-104.99,-7],['Miami, USA',25.76,-80.19,-5],
    ['San Francisco, USA',37.77,-122.42,-8],['Honolulu, USA',21.31,-157.86,-10],
    ['Anchorage, USA',61.22,-149.90,-9],['Toronto, Canada',43.65,-79.38,-5],
    ['Vancouver, Canada',49.28,-123.12,-8],['Mexico City, Mexico',19.43,-99.13,-6],
    ['São Paulo, Brazil',-23.55,-46.63,-3],['Buenos Aires, Argentina',-34.60,-58.38,-3],
    ['Lima, Peru',-12.05,-77.04,-5],['Bogotá, Colombia',4.71,-74.07,-5],
    ['London, UK',51.51,-0.13,0],['Lisbon, Portugal',38.72,-9.14,0],
    ['Paris, France',48.86,2.35,1],['Madrid, Spain',40.42,-3.70,1],
    ['Berlin, Germany',52.52,13.41,1],['Rome, Italy',41.90,12.50,1],
    ['Amsterdam, Netherlands',52.37,4.90,1],['Stockholm, Sweden',59.33,18.07,1],
    ['Athens, Greece',37.98,23.73,2],['Cairo, Egypt',30.04,31.24,2],
    ['Johannesburg, South Africa',-26.20,28.05,2],['Moscow, Russia',55.76,37.62,3],
    ['Istanbul, Turkey',41.01,28.98,3],['Nairobi, Kenya',-1.29,36.82,3],
    ['Lagos, Nigeria',6.52,3.38,1],['Tehran, Iran',35.69,51.39,3.5],
    ['Dubai, UAE',25.20,55.27,4],['Karachi, Pakistan',24.86,67.01,5],
    ['Mumbai, India',19.08,72.88,5.5],['Delhi, India',28.61,77.21,5.5],
    ['Bangkok, Thailand',13.76,100.50,7],['Jakarta, Indonesia',-6.21,106.85,7],
    ['Singapore',1.35,103.82,8],['Hong Kong',22.32,114.17,8],
    ['Beijing, China',39.90,116.41,8],['Shanghai, China',31.23,121.47,8],
    ['Manila, Philippines',14.60,120.98,8],['Seoul, South Korea',37.57,126.98,9],
    ['Tokyo, Japan',35.68,139.65,9],['Sydney, Australia',-33.87,151.21,10],
    ['Melbourne, Australia',-37.81,144.96,10],['Auckland, New Zealand',-36.85,174.76,12] ];
  var CITY_MAP = {}; CITIES.forEach(function (c) { CITY_MAP[c[0].toLowerCase()] = c; });

  function $(id) { return document.getElementById(id); }
  function degTxt(b) { return Math.floor(b.deg) + '°'; }

  /* ---------------- the chart wheel ---------------- */
  function wheelSVG(c) {
    var cx = 134, cy = 134, R = 126, rSign = 109, rPlanet = 80, rTick = 100;
    var asc = c.angles ? c.angles.asc : 0;
    function pos(L, r) { var a = (180 - (L - asc)) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    var s = '<svg width="268" height="268" viewBox="0 0 268 268" style="position:relative;z-index:1" role="img" aria-label="Your natal chart wheel">';
    s += ring(cx, cy, R, 'var(--line)', 1);
    s += ring(cx, cy, rSign + 9, 'var(--line)', .6);
    s += ring(cx, cy, rPlanet - 14, 'var(--line)', .4);
    var k;
    for (k = 0; k < 12; k++) {
      var bL = Math.floor(asc / 30) * 30 + k * 30;
      var p = pos(bL, R), pi = pos(bL, rPlanet - 14);
      s += line(pi, p, 'var(--line)', .5, 1);
      var gc = pos(bL + 15, rSign);
      s += txt(gc[0], gc[1] + 5, E.SIGN_GLYPH[(((bL / 30) % 12) + 12) % 12], 16, 'var(--dim)');
    }
    if (c.angles) {
      angleMark(c.angles.asc, 'ASC');
      angleMark(c.angles.mc, 'MC');
    }
    c.bodies.forEach(function (b) {
      var t1 = pos(b.lon, rTick), t2 = pos(b.lon, rTick - 6), g = pos(b.lon, rPlanet);
      s += line(t1, t2, 'var(--dim)', 1, 1);
      s += txt(g[0], g[1] + 4, PLANET[b.key], 13, 'var(--accent)');
    });
    s += '</svg>';
    return s;

    function angleMark(L, label) {
      var a1 = pos(L, R), a2 = pos(L, rPlanet - 14), lp = pos(L, R + 11);
      s += line(a2, a1, 'var(--accent)', 1, 1.6);
      s += txt(lp[0], lp[1] + 3, label, 9, 'var(--accent)');
    }
  }
  function ring(cx, cy, r, col, op) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-opacity="' + op + '"/>';
  }
  function line(a, b, col, op, w) {
    return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="' + col + '" stroke-opacity="' + op + '" stroke-width="' + w + '"/>';
  }
  function txt(x, y, t, size, col) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" font-size="' + size + '" fill="' + col + '" font-family="var(--font-mono)">' + t + '</text>';
  }

  /* ---------------- panel state + build ---------------- */
  var state = { sys: 'whole', lat: 40.71, lon: -74.01, off: -5, hasPlace: true };

  function buildPanel() {
    var ip = $('ss-ip');
    ip.innerHTML =
      '<div class="ss-ip-bar"><div class="lhs"><span class="ss-dot"></span>' +
        '<span class="ss-ip-title">Natal chart</span><span class="ss-stamp" id="ss-stamp"></span></div>' +
        '<div class="ss-seg" id="ss-seg" role="group" aria-label="House system">' +
          '<button data-sys="whole" class="on">Whole</button>' +
          '<button data-sys="equal">Equal</button>' +
          '<button data-sys="placidus">Placidus</button></div></div>' +
      '<div class="ss-inputs">' +
        '<div class="ss-fld"><label for="ss-date">Birth date</label><input type="date" id="ss-date" value="1990-06-15"></div>' +
        '<div class="ss-fld"><label for="ss-time">Birth time</label><input type="time" id="ss-time" value="12:00"></div>' +
        '<div class="ss-fld ss-place"><label for="ss-city">Birthplace</label><input id="ss-city" list="ss-cities" placeholder="city" value="New York, USA"></div>' +
        '<button class="ss-adv" id="ss-adv" type="button">coords</button>' +
        '<div class="ss-coords" id="ss-coords">' +
          '<div class="ss-fld"><label for="ss-lat">Lat °N</label><input id="ss-lat" type="number" step="0.01" value="40.71"></div>' +
          '<div class="ss-fld"><label for="ss-lon">Lon °E</label><input id="ss-lon" type="number" step="0.01" value="-74.01"></div>' +
          '<div class="ss-fld"><label for="ss-off">UTC ±h</label><input id="ss-off" type="number" step="0.5" value="-5"></div>' +
        '</div></div>' +
      '<div class="ss-ip-body"><div class="ss-wheel"><div class="glow"></div><div id="ss-wheel"></div></div>' +
        '<div class="ss-read"><div class="ss-big3" id="ss-big3"></div><div class="ss-tbl" id="ss-table"></div></div></div>' +
      '<div class="ss-xray" id="ss-precess"></div>' +
      '<div class="ss-scrubwrap"><label for="ss-scrub">Birth time</label>' +
        '<input type="range" id="ss-scrub" min="0" max="1439" step="1" value="720">' +
        '<span class="ss-scrub-read" id="ss-scrub-read"></span></div>' +
      '<div class="ss-note" id="ss-note"></div>';

    // datalist
    var dl = $('ss-cities');
    if (dl && !dl.childElementCount) {
      CITIES.forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; dl.appendChild(o); });
    }

    // events
    $('ss-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.sys = b.getAttribute('data-sys');
      [].forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
      update();
      if (!$('ss-cmp-wrap').hidden) renderCompare();
    });
    $('ss-adv').addEventListener('click', function () { $('ss-coords').classList.toggle('show'); });
    ['ss-date', 'ss-time'].forEach(function (id) {
      $(id).addEventListener('input', function () { syncScrubFromTime(); update(); });
    });
    $('ss-city').addEventListener('input', onCity);
    ['ss-lat', 'ss-lon', 'ss-off'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        state.lat = parseFloat($('ss-lat').value); state.lon = parseFloat($('ss-lon').value);
        state.off = parseFloat($('ss-off').value);
        state.hasPlace = isFinite(state.lat) && isFinite(state.lon);
        update();
      });
    });
    $('ss-scrub').addEventListener('input', function () {
      var m = +this.value; var hh = ('0' + Math.floor(m / 60)).slice(-2), mm = ('0' + (m % 60)).slice(-2);
      $('ss-time').value = hh + ':' + mm; update();
    });
    onCity(); syncScrubFromTime();
  }

  function onCity() {
    var v = ($('ss-city').value || '').trim().toLowerCase();
    var c = CITY_MAP[v];
    if (c) {
      state.lat = c[1]; state.lon = c[2]; state.off = c[3]; state.hasPlace = true;
      $('ss-lat').value = c[1]; $('ss-lon').value = c[2]; $('ss-off').value = c[3];
    } else if (v === '') {
      state.hasPlace = false;
    }
    update();
  }
  function syncScrubFromTime() {
    var t = ($('ss-time').value || '12:00').split(':');
    $('ss-scrub').value = (+t[0]) * 60 + (+t[1] || 0);
  }

  function readOpts() {
    var d = ($('ss-date').value || '1990-06-15').split('-');
    var t = ($('ss-time').value || '12:00').split(':');
    return { year:+d[0], month:+d[1], day:+d[2], hour:+t[0], minute:+t[1] || 0,
      tzOffsetHours: state.off, houseSystem: state.sys,
      latDeg: state.hasPlace ? state.lat : null,
      lonEastDeg: state.hasPlace ? state.lon : null };
  }

  /* ---------------- render ---------------- */
  function update() {
    var o = readOpts(), c = E.computeChart(o);
    $('ss-wheel').innerHTML = wheelSVG(c);
    $('ss-stamp').textContent = o.year + '-' + pad(o.month) + '-' + pad(o.day) +
      (c.angles ? ' · ' + Math.abs(state.lat).toFixed(1) + (state.lat >= 0 ? '°N' : '°S') : ' · no birthplace');

    var sun = c.sun, moon = c.moon, rising = c.rising;
    $('ss-big3').innerHTML =
      b3('☉', 'Sun', sun.sign, degTxt(sun)) +
      b3('☽', 'Moon', moon.sign, degTxt(moon)) +
      (rising ? b3('ASC', 'Rising', rising.sign, Math.floor(rising.deg) + '°')
              : '<div class="ss-b3"><div class="k"><span class="g">ASC</span>Rising</div><div class="v" style="font-size:11px;color:var(--dim)">add birthplace</div></div>');

    $('ss-table').innerHTML = c.bodies.map(function (b) {
      var pv = PLANET_PROV[b.key];
      return '<div class="ss-prow" data-k="' + b.key + '">' +
          '<span class="pg">' + PLANET[b.key] + '</span>' +
          '<span class="pn">' + NAME[b.key] + '</span>' +
          '<span class="ps">' + b.sign + ' ' + degTxt(b) + '</span>' +
          '<span class="ph">' + (b.house ? 'H' + b.house : '') + '</span></div>' +
        '<div class="ss-prov" data-k="' + b.key + '"><b>' + NAME[b.key] + '</b> rules ' + pv[0] + '. ' +
          SIGN_PROV[b.sign][1] + ' <span class="when">Meaning fixed: ' + pv[2] + '.</span></div>';
    }).join('');
    [].forEach.call($('ss-table').querySelectorAll('.ss-prow'), function (row) {
      row.addEventListener('click', function () { row.classList.toggle('open'); });
    });

    // precession: the three Suns
    var sid = E.placeOnZodiac(sun.lon - c.ayanamsha);
    var iau = iauSun(o.month, o.day);
    var flip = (sid.sign !== sun.sign) || (iau !== sun.sign);
    $('ss-precess').innerHTML = '<span class="ss-xlab">Your Sun, three ways</span>' +
      '<span class="ss-pill">Dateline sign <b>' + sun.sign + ' ' + degTxt(sun) + '</b></span>' +
      '<span class="ss-pill ' + (sid.sign !== sun.sign ? 'alt' : '') + '">Real sky <b>' + sid.sign + ' ' + Math.floor(sid.deg) + '°</b></span>' +
      '<span class="ss-pill ' + (iau !== sun.sign ? 'alt' : '') + '">Constellation <b>' + iau + '</b></span>' +
      (flip ? '<span class="ss-xlab" style="flex:1;text-align:right">precession has moved the sky</span>' : '');

    // scrubber readout
    if (c.angles) {
      $('ss-scrub-read').innerHTML = 'Rising sign <b>' + rising.sign + '</b> at ' + $('ss-time').value +
        ' · drag to watch it change';
      $('ss-scrub').disabled = false;
    } else {
      $('ss-scrub-read').innerHTML = 'Enter a birthplace to see your rising sign';
      $('ss-scrub').disabled = true;
    }

    // honest note
    $('ss-note').innerHTML = c.angles
      ? 'Positions are real astronomy (Schlyter\'s ephemeris), accurate to well under a degree. The rising sign and houses depend on the exact birth minute and a clean timezone; we use a fixed modern UTC offset, so a daylight-saving or historical-zone error of an hour can nudge the Ascendant. ' +
        '<button class="ss-adv" id="ss-cmp-btn" type="button" style="display:inline">compare the three house systems →</button>'
      : 'Sun, Moon, and planets need only your date and time. Add a birthplace for the Ascendant and houses.';
    var cb = $('ss-cmp-btn');
    if (cb) cb.addEventListener('click', function () {
      var w = $('ss-cmp-wrap'); w.hidden = !w.hidden; if (!w.hidden) { renderCompare(); w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
  }
  function pad(n) { return ('0' + n).slice(-2); }
  function b3(g, k, sign, deg) {
    return '<div class="ss-b3"><div class="k"><span class="g">' + g + '</span>' + k + '</div>' +
      '<div class="v">' + sign + '<span class="deg">' + deg + '</span></div></div>';
  }

  /* ---------------- house disagreement ---------------- */
  function renderCompare() {
    if (!state.hasPlace) { $('ss-cmp').innerHTML = '<p class="ss-body dim" style="font-size:1rem">Add a birthplace first.</p>'; return; }
    var o = readOpts();
    var sys = ['whole', 'equal', 'placidus'];
    var charts = sys.map(function (s) { o.houseSystem = s; return E.computeChart(o); });
    var rows = E.BODY_ORDER.map(function (k, i) {
      var hs = charts.map(function (c) { return c.bodies[i].house; });
      var diff = !(hs[0] === hs[1] && hs[1] === hs[2]);
      return '<tr><td class="pn">' + PLANET[k] + ' ' + NAME[k] + '</td>' +
        hs.map(function (h) { return '<td class="' + (diff ? 'diff' : '') + '">House ' + h + '</td>'; }).join('') + '</tr>';
    }).join('');
    $('ss-cmp').innerHTML = '<table><thead><tr><th>Planet</th><th>Whole sign</th><th>Equal</th><th>Placidus</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  }

  /* ---------------- Barnum opener ---------------- */
  var FORER = 'You have a great need for other people to like and admire you, yet you tend to be critical of yourself. You have a great deal of unused capacity you have not turned to your advantage. Disciplined and self-controlled outside, you tend to be worried and insecure inside. At times you have serious doubts about whether you have made the right decision. You prefer a certain amount of variety and grow dissatisfied when hemmed in. You pride yourself on being an independent thinker, and you do not accept others’ claims without proof. But you have found it unwise to be too frank in revealing yourself to others.';
  function initBarnum() {
    var go = $('ss-bn-go'), dateEl = $('ss-bn-date'),
        reading = $('ss-bn-reading'), rate = $('ss-bn-rate'), stars = $('ss-bn-stars'),
        reveal = $('ss-bn-reveal'), revealText = $('ss-bn-reveal-text');
    var sign = '';
    for (var i = 1; i <= 5; i++) {
      var btn = document.createElement('button');
      btn.textContent = '★'; btn.setAttribute('role', 'radio'); btn.setAttribute('aria-label', i + ' of 5');
      btn.dataset.n = i; stars.appendChild(btn);
    }
    stars.addEventListener('mouseover', function (e) { if (e.target.dataset.n) litUpTo(+e.target.dataset.n); });
    stars.addEventListener('mouseout', function () { litUpTo(0); });
    stars.addEventListener('click', function (e) {
      if (!e.target.dataset.n) return;
      var n = +e.target.dataset.n; litUpTo(n, true);
      revealText.innerHTML = 'Every word of that was generic, and you gave it ' + n + (n === 1 ? ' star' : ' stars') +
        '. It is the same paragraph for a ' + sign + ', a Scorpio, and everyone else; you may have recognized yourself anyway. ' +
        'That flash of recognition, not the sky, is the engine under every horoscope. Now let us build your real chart and trace where each piece of it came from.';
      reveal.classList.add('show');
    });
    function litUpTo(n, lock) {
      [].forEach.call(stars.children, function (b) { b.classList.toggle('lit', +b.dataset.n <= n); });
      if (lock) stars._locked = n;
      else if (stars._locked) [].forEach.call(stars.children, function (b) { b.classList.toggle('lit', +b.dataset.n <= stars._locked); });
    }
    go.addEventListener('click', function () {
      var d = (dateEl.value || '1990-06-15').split('-');
      var c = E.computeChart({ year:+d[0], month:+d[1], day:+d[2], hour:12, minute:0, tzOffsetHours:0, latDeg:null, lonEastDeg:null });
      sign = c.sun.sign;
      reading.innerHTML = '<span style="color:var(--accent);font-style:normal;font-family:var(--font-mono);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase">Reading for a ' + sign + '</span><br>' + FORER;
      reading.classList.add('show');
      rate.classList.add('show');
    });
    $('ss-bn-tochart').addEventListener('click', function () {
      $('ss-machine').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- honest share ---------------- */
  function initShare() {
    var btn = $('ss-share-btn'); if (!btn) return;
    btn.addEventListener('click', function () {
      var o = readOpts(), c = E.computeChart(o);
      var iau = iauSun(o.month, o.day);
      var txt = 'My Sun is in tropical ' + c.sun.sign + ', which today sits in the constellation ' + iau + '. ' +
        'The personality pinned to it was codified by Ptolemy around 150 CE and packaged for newspapers in the 1930s. ' +
        'As far as the evidence goes it predicts nothing, and I read it anyway. (via ethanwillingham.com/star-signs)';
      var done = function () { $('ss-share-out').textContent = 'Copied'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { legacyCopy(txt); done(); });
      } else { legacyCopy(txt); done(); }
    });
    function legacyCopy(txt) {
      var t = document.createElement('textarea'); t.value = txt;
      t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t);
      t.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(t);
    }
  }

  function boot() { buildPanel(); update(); initBarnum(); initShare(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
