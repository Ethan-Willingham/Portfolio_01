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

  var PLANET = { sun:'Su', moon:'Mo', mercury:'Me', venus:'Ve', mars:'Ma',
    jupiter:'Ju', saturn:'Sa', uranus:'Ur', neptune:'Ne', pluto:'Pl' };
  var NAME = { sun:'Sun', moon:'Moon', mercury:'Mercury', venus:'Venus', mars:'Mars',
    jupiter:'Jupiter', saturn:'Saturn', uranus:'Uranus', neptune:'Neptune', pluto:'Pluto' };

  /* Sample modern shorthand is interpretive, not a measured personality.
     The historical notes identify records, not an inventor of every trait. */
  var PTOLEMY = 'https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B%2A.html#17';
  var PLANET_PROV = {
    sun: ['self-expression, vitality', 'Traditional ruler of Leo.', PTOLEMY],
    moon: ['moods, habits', 'Traditional ruler of Cancer.', PTOLEMY],
    mercury: ['thought, speech', 'Traditional ruler of Gemini and Virgo.', PTOLEMY],
    venus: ['affection, pleasure', 'Traditional ruler of Taurus and Libra.', PTOLEMY],
    mars: ['initiative, conflict', 'Traditional ruler of Aries and Scorpio.', PTOLEMY],
    jupiter: ['growth, good fortune', 'Traditional ruler of Sagittarius and Pisces.', PTOLEMY],
    saturn: ['limits, responsibility', 'Traditional ruler of Capricorn and Aquarius.', PTOLEMY],
    uranus: ['change, independence', 'Discovered in 1781. Its astrological meanings are later additions.', 'https://science.nasa.gov/uranus/facts/'],
    neptune: ['imagination, illusion', 'Discovered in 1846. Its astrological meanings are later additions.', 'https://science.nasa.gov/neptune/facts/'],
    pluto: ['power, transformation', 'Discovered in 1930, classified as a dwarf planet in 2006. Its inclusion is an astrological convention.', 'https://science.nasa.gov/dwarf-planets/pluto/facts/']
  };
  var SIGN_PROV = {
    Aries: 'initiative', Taurus: 'steadiness', Gemini: 'curiosity', Cancer: 'care',
    Leo: 'expression', Virgo: 'order', Libra: 'balance', Scorpio: 'intensity',
    Sagittarius: 'exploration', Capricorn: 'ambition', Aquarius: 'independence', Pisces: 'sensitivity'
  };

  /* A rough present-era calendar guide, not an IAU boundary calculation.
     Entry dates vary with year and time; do not use this for a boundary birth. */
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
  function degTxt(b) { return 'about ' + Math.floor(b.deg) + '°'; }

  /* ---------------- the chart wheel ---------------- */
  function wheelSVG(c) {
    var cx = 134, cy = 134, R = 126, rSign = 109, rPlanet = 80, rTick = 100;
    var asc = c.angles ? c.angles.asc : 0;
    function pos(L, r) { var a = (180 - (L - asc)) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    var s = '<svg width="268" height="268" viewBox="-16 -16 300 300" style="position:relative;z-index:1" role="img" aria-label="Approximate tropical chart wheel">';
    s += ring(cx, cy, R, 'var(--line)', 1);
    s += ring(cx, cy, rSign + 9, 'var(--line)', .6);
    s += ring(cx, cy, rPlanet - 14, 'var(--line)', .4);
    var k;
    for (k = 0; k < 12; k++) {
      var bL = Math.floor(asc / 30) * 30 + k * 30;
      var p = pos(bL, R), pi = pos(bL, rPlanet - 14);
      s += line(pi, p, 'var(--line)', .5, 1);
      var gc = pos(bL + 15, rSign);
      s += txt(gc[0], gc[1] + 5, E.SIGN_LABEL[(((bL / 30) % 12) + 12) % 12], 9, 'var(--dim)');
    }
    if (c.angles) {
      angleMark(c.angles.asc, 'ASC');
      angleMark(c.angles.mc, 'MC');
    }
    var usedLabels = [];
    c.bodies.forEach(function (b) {
      var t1 = pos(b.lon, rTick), t2 = pos(b.lon, rTick - 6), g = planetLabel(b.lon);
      s += line(t1, t2, 'var(--dim)', 1, 1);
      s += txt(g[0], g[1] + 4, PLANET[b.key], 13, 'var(--accent)');
    });
    s += '</svg>';
    return s;

    function planetLabel(lon) {
      var radii = [rPlanet, rPlanet - 19, rPlanet - 38, rPlanet + 18], best, bestGap = -1;
      for (var i = 0; i < radii.length; i++) {
        var candidate = pos(lon, radii[i]), gap = Infinity;
        usedLabels.forEach(function (p) {
          gap = Math.min(gap, Math.pow(p[0] - candidate[0], 2) + Math.pow(p[1] - candidate[1], 2));
        });
        if (gap > bestGap) { best = candidate; bestGap = gap; }
        if (gap >= 18 * 18) break;
      }
      usedLabels.push(best); return best;
    }

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

  /* ---------------- date and time pickers ---------------- */
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var WD = ['S','M','T','W','T','F','S'];
  function z2(n) { return ('0' + n).slice(-2); }

  // shared popover placement + outside-close, used by both pickers
  function popController(trig, pop, onRender) {
    function place() {
      var r = trig.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      var top = r.bottom + 6;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      top = Math.max(8, Math.min(top, Math.max(8, window.innerHeight - ph - 8)));
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    }
    var onOutside, onKey;
    function open() {
      onRender(); pop.classList.add('show'); trig.classList.add('open'); place();
      onOutside = function (e) { if (!pop.contains(e.target) && !trig.contains(e.target)) close(); };
      onKey = function (e) { if (e.key === 'Escape') { close(); trig.focus(); } };
      setTimeout(function () { document.addEventListener('mousedown', onOutside); }, 0);
      document.addEventListener('keydown', onKey);
      window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    }
    function close() {
      pop.classList.remove('show'); trig.classList.remove('open');
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place);
    }
    return { open: open, close: close, place: place, isOpen: function () { return pop.classList.contains('show'); } };
  }

  // DATE: trigger + portaled calendar with instant month/year jump + keyboard
  function createDatePicker(mount, hiddenId, initialYMD, onChange) {
    var p = initialYMD.split('-');
    var sel = { y: +p[0], m: +p[1] - 1, d: +p[2] };
    var view = { y: sel.y, m: sel.m };
    var foc = new Date(sel.y, sel.m, sel.d);
    var mode = 'days';
    var TODAY = new Date();

    var hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = hiddenId;
    var trig = document.createElement('button'); trig.type = 'button'; trig.className = 'pk-trigger';
    trig.setAttribute('aria-label', 'Choose date');
    trig.innerHTML = '<span class="pk-val"></span><span class="pk-i" aria-hidden="true"></span>';
    mount.appendChild(hidden); mount.appendChild(trig);
    var pop = document.createElement('div'); pop.className = 'pk-pop'; pop.setAttribute('role', 'dialog');
    document.body.appendChild(pop);

    function commit() {
      hidden.value = sel.y + '-' + z2(sel.m + 1) + '-' + z2(sel.d);
      trig.querySelector('.pk-val').textContent = sel.d + ' ' + MON[sel.m] + ' ' + sel.y;
    }
    function sameDay(a, y, m, d) { return a.getFullYear() === y && a.getMonth() === m && a.getDate() === d; }

    function renderDays() {
      var first = new Date(view.y, view.m, 1).getDay();
      var h = '<div class="pk-head"><button class="pk-arrow" type="button" data-a="pm" aria-label="Previous month">&#8249;</button>' +
        '<button class="pk-title" type="button" data-a="pick">' + MONTHS[view.m] + ' ' + view.y + '</button>' +
        '<button class="pk-arrow" type="button" data-a="nm" aria-label="Next month">&#8250;</button></div><div class="pk-grid">';
      for (var w = 0; w < 7; w++) h += '<div class="pk-wd">' + WD[w] + '</div>';
      for (var i = 0; i < 42; i++) {
        var cur = new Date(view.y, view.m, 1 - first + i);
        var inM = cur.getMonth() === view.m, cls = 'pk-day';
        var outside = cur.getFullYear() < 1900 || cur.getFullYear() > 2099;
        if (!inM) cls += ' oth';
        if (sameDay(cur, sel.y, sel.m, sel.d)) cls += ' sel';
        if (sameDay(cur, TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())) cls += ' today';
        if (sameDay(cur, foc.getFullYear(), foc.getMonth(), foc.getDate())) cls += ' foc';
        h += '<button type="button"' + (outside ? ' disabled' : '') + ' class="' + cls + '" data-date="' +
          cur.getFullYear() + '-' + z2(cur.getMonth() + 1) + '-' + z2(cur.getDate()) + '">' + cur.getDate() + '</button>';
      }
      pop.innerHTML = h + '</div>';
    }
    function renderPick() {
      var h = '<div class="pk-head"><button class="pk-arrow" type="button" data-a="days" aria-label="Back">&#8249;</button>' +
        '<button class="pk-title" type="button" data-a="days">' + view.y + '</button><span style="width:28px"></span></div>';
      h += '<div class="pk-months">';
      for (var m = 0; m < 12; m++) h += '<button type="button" class="pk-mo' + (m === view.m ? ' on' : '') + '" data-m="' + m + '">' + MON[m] + '</button>';
      h += '</div><div class="pk-years">';
      for (var y = 1900; y <= 2099; y++) h += '<button type="button" class="pk-yr' + (y === view.y ? ' on' : '') + '" data-y="' + y + '">' + y + '</button>';
      pop.innerHTML = h + '</div>';
      var on = pop.querySelector('.pk-yr.on'); if (on) on.scrollIntoView({ block: 'center' });
    }
    function render() { if (mode === 'days') renderDays(); else renderPick(); }
    var ctl = popController(trig, pop, render);

    function pick(dateStr) {
      var q = dateStr.split('-'); if (+q[0] < 1900 || +q[0] > 2099) return; sel = { y: +q[0], m: +q[1] - 1, d: +q[2] };
      view = { y: sel.y, m: sel.m }; foc = new Date(sel.y, sel.m, sel.d);
      commit(); ctl.close(); trig.focus(); if (onChange) onChange();
    }

    pop.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var a = t.getAttribute('data-a');
      if (a === 'pm') { if (view.y === 1900 && view.m === 0) return; view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderDays(); ctl.place(); return; }
      if (a === 'nm') { if (view.y === 2099 && view.m === 11) return; view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderDays(); ctl.place(); return; }
      if (a === 'pick') { mode = 'pick'; renderPick(); ctl.place(); return; }
      if (a === 'days') { mode = 'days'; renderDays(); ctl.place(); return; }
      if (t.classList.contains('pk-mo')) { view.m = +t.getAttribute('data-m'); mode = 'days'; renderDays(); ctl.place(); return; }
      if (t.classList.contains('pk-yr')) { view.y = +t.getAttribute('data-y'); renderPick(); ctl.place(); return; }
      if (t.classList.contains('pk-day')) pick(t.getAttribute('data-date'));
    });
    // keyboard: arrows move focus, Enter picks (only in day mode)
    pop.addEventListener('keydown', function (e) {
      if (mode !== 'days') return;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); var next = new Date(foc.getFullYear(), foc.getMonth(), foc.getDate() + step);
        if (next.getFullYear() < 1900 || next.getFullYear() > 2099) return; foc = next;
        view = { y: foc.getFullYear(), m: foc.getMonth() }; renderDays(); ctl.place(); return; }
      if (e.key === 'Enter') { e.preventDefault();
        pick(foc.getFullYear() + '-' + z2(foc.getMonth() + 1) + '-' + z2(foc.getDate())); }
    });
    trig.addEventListener('click', function () { ctl.isOpen() ? ctl.close() : ctl.open(); });
    trig.setAttribute('tabindex', '0');

    commit();
    return { getValue: function () { return hidden.value; }, setValue: function (v) { pick(v); ctl.close(); } };
  }

  // TIME: trigger + portaled hour/minute/AM-PM columns + "don't know" toggle
  function createTimePicker(mount, hiddenId, initialHHMM, onChange, onKnown) {
    var hp = initialHHMM.split(':'); var h24 = +hp[0] || 0, mn = +hp[1] || 0; var known = true;
    var hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = hiddenId;
    var trig = document.createElement('button'); trig.type = 'button'; trig.className = 'pk-trigger';
    trig.setAttribute('aria-label', 'Choose time');
    trig.innerHTML = '<span class="pk-val"></span><span class="pk-i" aria-hidden="true"></span>';
    var know = document.createElement('label'); know.className = 'pk-noknow';
    know.innerHTML = '<input type="checkbox"> don’t know';
    var wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap = '5px';
    wrap.appendChild(trig); wrap.appendChild(know);
    mount.appendChild(hidden); mount.appendChild(wrap);
    var pop = document.createElement('div'); pop.className = 'pk-pop tpop'; pop.setAttribute('role', 'dialog');
    document.body.appendChild(pop);

    function label() {
      if (!known) return 'unknown (noon used)';
      var ap = h24 >= 12 ? 'PM' : 'AM', h12 = h24 % 12; if (h12 === 0) h12 = 12;
      return z2(h12) + ':' + z2(mn) + ' ' + ap;
    }
    function commit() { hidden.value = z2(h24) + ':' + z2(mn); trig.querySelector('.pk-val').textContent = label(); }

    function render() {
      var ap = h24 >= 12 ? 'PM' : 'AM', h12 = h24 % 12; if (h12 === 0) h12 = 12;
      var h = '<div class="pk-col"><div class="pk-collab">Hour</div><div class="pk-scroll" data-col="h">';
      for (var i = 1; i <= 12; i++) h += '<button type="button" class="pk-opt' + (i === h12 ? ' on' : '') + '" data-h="' + i + '">' + z2(i) + '</button>';
      h += '</div></div><div class="pk-col"><div class="pk-collab">Min</div><div class="pk-scroll" data-col="m">';
      for (var j = 0; j < 60; j++) h += '<button type="button" class="pk-opt' + (j === mn ? ' on' : '') + '" data-mn="' + j + '">' + z2(j) + '</button>';
      h += '</div></div><div class="pk-ampm"><button type="button" class="pk-ap' + (ap === 'AM' ? ' on' : '') + '" data-ap="AM">AM</button>' +
        '<button type="button" class="pk-ap' + (ap === 'PM' ? ' on' : '') + '" data-ap="PM">PM</button></div>';
      pop.innerHTML = h;
      var onh = pop.querySelector('[data-col="h"] .on'); if (onh) onh.scrollIntoView({ block: 'center' });
      var onm = pop.querySelector('[data-col="m"] .on'); if (onm) onm.scrollIntoView({ block: 'center' });
    }
    var ctl = popController(trig, pop, render);

    pop.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-h')) { var pm = h24 >= 12; h24 = (+t.getAttribute('data-h') % 12) + (pm ? 12 : 0); }
      else if (t.hasAttribute('data-mn')) { mn = +t.getAttribute('data-mn'); }
      else if (t.hasAttribute('data-ap')) { var wantPM = t.getAttribute('data-ap') === 'PM';
        if (wantPM && h24 < 12) h24 += 12; if (!wantPM && h24 >= 12) h24 -= 12; }
      else return;
      commit(); render(); ctl.place(); if (onChange) onChange();
    });
    trig.addEventListener('click', function () { if (!known) return; ctl.isOpen() ? ctl.close() : ctl.open(); });
    know.querySelector('input').addEventListener('change', function () {
      known = !this.checked; trig.classList.toggle('muted', !known); trig.disabled = !known;
      if (!known) ctl.close(); commit(); if (onKnown) onKnown(known);
    });

    commit();
    return { getValue: function () { return hidden.value; },
      setValue: function (v) { var s = v.split(':'); h24 = +s[0] || 0; mn = +s[1] || 0; commit(); if (ctl.isOpen()) render(); },
      isKnown: function () { return known; } };
  }

  /* ---------------- panel state + build ---------------- */
  var datePicker, timePicker;
  var state = { sys: 'whole', lat: 40.71, lon: -74.01, off: -5, hasPlace: true, timeKnown: true, placeError: '' };

  function buildPanel() {
    var ip = $('ss-ip');
    ip.innerHTML =
      '<div class="ss-ip-bar"><div class="lhs"><span class="ss-dot"></span>' +
        '<span class="ss-ip-title">Approximate natal chart</span><span class="ss-stamp" id="ss-stamp"></span></div>' +
        '<div class="ss-seg" id="ss-seg" role="group" aria-label="House system">' +
          '<button type="button" data-sys="whole" class="on">Whole</button>' +
          '<button type="button" data-sys="equal">Equal</button>' +
          '<button type="button" data-sys="placidus">Placidus</button></div></div>' +
      '<div class="ss-inputs">' +
        '<div class="ss-fld"><label>Birth date</label><div id="ss-date-mount"></div></div>' +
        '<div class="ss-fld"><label>Birth time</label><div id="ss-time-mount"></div></div>' +
        '<div class="ss-fld ss-place"><label for="ss-city">Birthplace</label><input id="ss-city" list="ss-cities" placeholder="city" value="New York, USA"></div>' +
        '<div class="ss-fld"><label for="ss-off">UTC offset (hours)</label><input id="ss-off" type="number" min="-14" max="14" step="any" value="-5"></div>' +
        '<button class="ss-adv" id="ss-adv" type="button">Coordinates</button>' +
        '<div class="ss-coords" id="ss-coords">' +
          '<div class="ss-fld"><label for="ss-lat">Lat °N</label><input id="ss-lat" type="number" min="-89.9999" max="89.9999" step="any" value="40.71"></div>' +
          '<div class="ss-fld"><label for="ss-lon">Lon °E</label><input id="ss-lon" type="number" min="-180" max="180" step="any" value="-74.01"></div>' +
        '</div><p class="ss-input-help">City presets use modern standard time. Enter the offset actually in force at birth, including daylight saving and historical changes. East is positive; west is negative.</p></div>' +
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

    // custom pickers (replace the native date/time inputs)
    datePicker = createDatePicker($('ss-date-mount'), 'ss-date', '1990-06-15', function () { update(); });
    timePicker = createTimePicker($('ss-time-mount'), 'ss-time', '12:00',
      function () { syncScrubFromTime(); update(); },
      function (known) { state.timeKnown = known; update(); });

    // events
    $('ss-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.sys = b.getAttribute('data-sys');
      [].forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
      update();
    });
    $('ss-adv').addEventListener('click', function () { $('ss-coords').classList.toggle('show'); });
    $('ss-city').addEventListener('input', onCity);
    ['ss-lat', 'ss-lon'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        $('ss-city').value = ''; state.placeError = ''; readCoordinates(); update();
      });
    });
    $('ss-off').addEventListener('input', function () { state.off = readNumber('ss-off'); update(); });
    $('ss-scrub').addEventListener('input', function () {
      var m = +this.value; timePicker.setValue(z2(Math.floor(m / 60)) + ':' + z2(m % 60)); update();
    });
    onCity(); syncScrubFromTime();
  }

  function readNumber(id) {
    var value = $(id).value.trim(); return value === '' ? NaN : Number(value);
  }
  function readCoordinates() {
    state.lat = readNumber('ss-lat'); state.lon = readNumber('ss-lon');
    var empty = $('ss-lat').value.trim() === '' && $('ss-lon').value.trim() === '';
    state.hasPlace = !empty;
    state.placeError = empty ? '' : (!isFinite(state.lat) || !isFinite(state.lon) ||
      Math.abs(state.lat) >= 90 || Math.abs(state.lon) > 180)
      ? 'Enter latitude between -90 and +90 (excluding the poles), and longitude from -180 to +180.' : '';
  }
  function onCity() {
    var v = ($('ss-city').value || '').trim().toLowerCase();
    var c = CITY_MAP[v]; state.placeError = '';
    if (c) {
      state.lat = c[1]; state.lon = c[2]; state.off = c[3]; state.hasPlace = true;
      $('ss-lat').value = c[1]; $('ss-lon').value = c[2]; $('ss-off').value = c[3];
    } else {
      state.hasPlace = false; state.lat = null; state.lon = null;
      $('ss-lat').value = ''; $('ss-lon').value = '';
      state.off = v ? NaN : 0; $('ss-off').value = v ? '' : '0';
      if (v) {
        state.placeError = 'Choose a listed city, or enter coordinates and the birth UTC offset.';
        $('ss-coords').classList.add('show');
      }
    }
    update();
  }
  function syncScrubFromTime() {
    var t = ($('ss-time').value || '12:00').split(':');
    $('ss-scrub').value = (+t[0]) * 60 + (+t[1] || 0);
  }

  function readOpts() {
    var d = ($('ss-date').value || '1990-06-15').split('-');
    var t = (state.timeKnown ? $('ss-time').value : '12:00').split(':');
    if (state.placeError) throw new RangeError(state.placeError);
    if (!isFinite(state.off)) throw new RangeError('Enter the birth UTC offset. Blank is not UTC.');
    var angles = state.hasPlace && state.timeKnown;  // Ascendant + houses need both a place and a known time
    return { year:+d[0], month:+d[1], day:+d[2], hour:+t[0], minute:+t[1] || 0,
      tzOffsetHours: state.off, houseSystem: state.sys,
      latDeg: angles ? state.lat : null,
      lonEastDeg: angles ? state.lon : null };
  }

  /* ---------------- render ---------------- */
  function update() {
    var o, c;
    $('ss-share-out').textContent = '';
    $('ss-share-text').hidden = true;
    try { o = readOpts(); c = E.computeChart(o); }
    catch (error) {
      $('ss-wheel').innerHTML = ''; $('ss-big3').textContent = 'Chart needs valid inputs.';
      $('ss-table').innerHTML = ''; $('ss-precess').textContent = '';
      $('ss-stamp').textContent = 'Input incomplete';
      $('ss-note').textContent = error.message; $('ss-scrub').disabled = true;
      $('ss-scrub-read').textContent = ''; $('ss-share-btn').disabled = true;
      if (!$('ss-cmp-wrap').hidden) $('ss-cmp').textContent = error.message;
      return;
    }
    $('ss-share-btn').disabled = false;
    $('ss-wheel').innerHTML = wheelSVG(c);
    $('ss-stamp').textContent = o.year + '-' + pad(o.month) + '-' + pad(o.day) +
      (c.angles ? ' · ' + Math.abs(state.lat).toFixed(1) + (state.lat >= 0 ? '°N' : '°S')
        : state.timeKnown ? ' · no birthplace' : ' · noon assumed');

    var sun = c.sun, moon = c.moon, rising = c.rising;
    $('ss-big3').innerHTML = b3('', 'Sun', sun.sign, degTxt(sun)) + b3('', 'Moon', moon.sign, degTxt(moon)) +
      (rising ? b3('', 'Rising', rising.sign, degTxt(rising))
        : '<div class="ss-b3"><div class="k">Rising</div><div class="v ss-missing">' +
          (state.timeKnown ? 'needs birthplace' : 'needs birth time') + '</div></div>');

    $('ss-table').innerHTML = c.bodies.map(function (b) {
      var pv = PLANET_PROV[b.key];
      return '<button type="button" class="ss-prow" data-k="' + b.key + '" aria-expanded="false" aria-controls="ss-prov-' + b.key + '">' +
        '<span class="pg">' + PLANET[b.key] + '</span><span class="pn">' + NAME[b.key] + '</span>' +
        '<span class="ps">' + b.sign + ' ' + degTxt(b) + '</span><span class="ph">' + (b.house ? 'H' + b.house : '') + '</span></button>' +
        '<div class="ss-prov" id="ss-prov-' + b.key + '"><b>Sample modern keywords:</b> ' + pv[0] +
        '. For ' + b.sign + ': ' + SIGN_PROV[b.sign] + '. <b>Historical note:</b> ' + pv[1] +
        ' <a href="' + pv[2] + '">' + (b.key === 'uranus' || b.key === 'neptune' || b.key === 'pluto' ? 'Discovery record' : 'Ptolemy, I.17') + '</a>.</div>';
    }).join('');
    [].forEach.call($('ss-table').querySelectorAll('.ss-prow'), function (row) {
      row.addEventListener('click', function () {
        var open = row.classList.toggle('open'); row.setAttribute('aria-expanded', String(open));
      });
    });

    var sid = E.placeOnZodiac(sun.lon - c.ayanamsha);
    $('ss-precess').innerHTML = '<span class="ss-xlab">Sun labels, different conventions</span>' +
      '<span class="ss-pill">Tropical <b>' + sun.sign + '</b></span>' +
      '<span class="ss-pill alt">Sidereal (Fagan-Bradley) <b>' + sid.sign + '</b></span>' +
      '<span class="ss-pill">Calendar constellation guide <b>' + iauSun(o.month, o.day) + '</b></span>' +
      '<span class="ss-xlab">Constellation label is approximate, not computed for this birth.</span>';

    $('ss-scrub').disabled = !c.angles;
    $('ss-scrub-read').textContent = c.angles ? 'Drag to see the rising sign change with birth time.' :
      !state.timeKnown ? 'Unknown time: rising sign and houses hidden.' : 'Add a birthplace to see the rising sign.';

    var note = 'Approximate geocentric positions, shown in whole degrees. A position near a sign boundary may fall in the neighboring sign. ';
    var near = c.bodies.filter(function (b) { return b.deg < .25 || b.deg > 29.75; }).map(function (b) { return NAME[b.key]; });
    if (rising && (rising.deg < .25 || rising.deg > 29.75)) near.push('Rising sign');
    if (near.length) note += 'Within this demo\'s quarter-degree caution band: ' + near.join(', ') + '. ';
    if (!state.timeKnown) {
      var signs = uncertainSigns(o);
      note += 'Birth time unknown: local noon at the entered UTC offset is assumed. ' +
        (signs.length ? 'Signs that change in samples across this date: ' + signs.join('; ') + '. ' :
          'No sign changes found in samples across this date, but the birth instant remains unknown. ') +
        'The Moon moves especially quickly. Rising sign and houses are omitted. ';
    }
    if (c.angles) {
      note += 'Rising sign and houses depend on time, place and the birth UTC offset. ';
      if (c.houseFallback) note += 'Placidus is replaced by Equal here (' + c.houseFallback + '). ';
      if (Math.abs(state.lat) > 66) note += 'At high latitudes, horizon geometry also needs care. ';
      note += '<button class="ss-adv" id="ss-cmp-btn" type="button">Compare house systems</button>';
    }
    $('ss-note').innerHTML = note;
    var cb = $('ss-cmp-btn');
    if (cb) cb.addEventListener('click', function () {
      var w = $('ss-cmp-wrap'); w.hidden = !w.hidden;
      if (!w.hidden) { renderCompare(); w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
    if (!$('ss-cmp-wrap').hidden) renderCompare();
  }
  function uncertainSigns(o) {
    var samples = [0, 6, 12, 18, 23], found = {};
    samples.forEach(function (hour) {
      var c = E.computeChart({ year:o.year, month:o.month, day:o.day, hour:hour,
        minute:hour === 23 ? 59 : 0, tzOffsetHours:o.tzOffsetHours, latDeg:null, lonEastDeg:null });
      c.bodies.forEach(function (b) {
        if (!found[b.key]) found[b.key] = [];
        if (found[b.key].indexOf(b.sign) < 0) found[b.key].push(b.sign);
      });
    });
    return E.BODY_ORDER.filter(function (key) { return found[key].length > 1; })
      .map(function (key) { return NAME[key] + ' (' + found[key].join(' / ') + ')'; });
  }
  function pad(n) { return ('0' + n).slice(-2); }
  function b3(g, k, sign, deg) {
    return '<div class="ss-b3"><div class="k"><span class="g">' + g + '</span>' + k + '</div>' +
      '<div class="v">' + sign + '<span class="deg">' + deg + '</span></div></div>';
  }

  /* ---------------- house disagreement ---------------- */
  function renderCompare() {
    if (!state.timeKnown) { $('ss-cmp').textContent = 'A known birth time is needed to compare houses.'; return; }
    if (!state.hasPlace) { $('ss-cmp').textContent = 'Add a birthplace to compare houses.'; return; }
    var o = readOpts();
    var sys = ['whole', 'equal', 'placidus'];
    var charts = sys.map(function (s) { o.houseSystem = s; return E.computeChart(o); });
    var rows = E.BODY_ORDER.map(function (k, i) {
      var hs = charts.map(function (c) { return c.bodies[i].house; });
      var diff = !(hs[0] === hs[1] && hs[1] === hs[2]);
      return '<tr><td class="pn">' + NAME[k] + '</td>' +
        hs.map(function (h) { return '<td class="' + (diff ? 'diff' : '') + '">House ' + h + '</td>'; }).join('') + '</tr>';
    }).join('');
    $('ss-cmp').innerHTML = '<table><thead><tr><th>Body</th><th>Whole sign</th><th>Equal</th><th>' +
      (charts[2].houseFallback ? 'Equal fallback' : 'Placidus') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (charts[2].houseFallback ? '<p class="ss-input-help">Placidus uses Equal in this demo: ' + charts[2].houseFallback + '.</p>' : '');
  }

  /* ---------------- Barnum opener ---------------- */
  // A custom generic reading, not a quotation from Forer's 13-item sketch.
  var FORER = 'You want your efforts to be noticed, though praise can make you uncomfortable. Some decisions still bother you after everyone else has moved on. You like having a plan, but resent a routine that leaves no room to change your mind. People who know you well see a different side from people you have just met. You can name things you have handled well and things you wish you had done differently.';
  function initBarnum() {
    createDatePicker($('ss-bn-date-mount'), 'ss-bn-date', '1990-06-15', function () {});
    var go = $('ss-bn-go'), dateEl = $('ss-bn-date'),
        reading = $('ss-bn-reading'), rate = $('ss-bn-rate'), stars = $('ss-bn-stars'),
        reveal = $('ss-bn-reveal'), revealText = $('ss-bn-reveal-text');
    var sign = '';
    for (var i = 1; i <= 5; i++) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '★'; btn.setAttribute('role', 'radio'); btn.setAttribute('aria-checked', 'false'); btn.setAttribute('aria-label', i + ' of 5');
      btn.dataset.n = i; stars.appendChild(btn);
    }
    stars.addEventListener('mouseover', function (e) { if (e.target.dataset.n) litUpTo(+e.target.dataset.n); });
    stars.addEventListener('mouseout', function () { litUpTo(0); });
    stars.addEventListener('click', function (e) {
      if (!e.target.dataset.n) return;
      var n = +e.target.dataset.n; litUpTo(n, true);
      revealText.textContent = 'You rated it ' + n + ' out of 5. Your birthday changes the label, but everyone gets the same paragraph. ' +
        'Recognition alone cannot tell us whether a reading was made for us. This is a demonstration, not a measurement of your personality or a controlled test of astrology.';
      reveal.classList.add('show');
    });
    function litUpTo(n, lock) {
      [].forEach.call(stars.children, function (b) { b.classList.toggle('lit', +b.dataset.n <= n); });
      if (lock) { stars._locked = n; [].forEach.call(stars.children, function (b) { b.setAttribute('aria-checked', String(+b.dataset.n === n)); }); }
      else if (stars._locked) [].forEach.call(stars.children, function (b) { b.classList.toggle('lit', +b.dataset.n <= stars._locked); });
    }
    go.addEventListener('click', function () {
      stars._locked = 0; litUpTo(0);
      [].forEach.call(stars.children, function (b) { b.setAttribute('aria-checked', 'false'); });
      reveal.classList.remove('show'); revealText.textContent = '';
      var d = (dateEl.value || '1990-06-15').split('-');
      var c = E.computeChart({ year:+d[0], month:+d[1], day:+d[2], hour:12, minute:0, tzOffsetHours:0, latDeg:null, lonEastDeg:null });
      sign = c.sun.sign;
      reading.innerHTML = '<span style="color:var(--accent);font-style:normal;font-family:var(--font-mono);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase">Reading labeled ' + sign + '</span><br>' + FORER;
      reading.classList.add('show');
      rate.classList.add('show');
    });
    $('ss-bn-tochart').addEventListener('click', function () {
      $('ss-machine').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- chart summary and truthful clipboard status ---------- */
  function initShare() {
    var btn = $('ss-share-btn'); if (!btn) return;
    btn.addEventListener('click', function () {
      var o, c;
      try { o = readOpts(); c = E.computeChart(o); }
      catch (error) { $('ss-share-out').textContent = error.message; return; }
      var txt = 'Approximate tropical chart for ' + o.year + '-' + pad(o.month) + '-' + pad(o.day) +
        ', ' + pad(o.hour) + ':' + pad(o.minute) + ' with a UTC offset of ' + (o.tzOffsetHours >= 0 ? '+' : '') + o.tzOffsetHours + ' hours' +
        (state.timeKnown ? '.' : ' (local noon assumed; birth time unknown).') +
        ' Sun: ' + c.sun.sign + '. Moon: ' + c.moon.sign + '.' +
        (c.rising ? ' Rising: ' + c.rising.sign + '. Houses: ' + c.effectiveHouseSystem +
          (c.houseFallback ? ' (Placidus fallback)' : '') + '.' : ' Rising sign and houses omitted.') +
        (!state.timeKnown ? ' Signs may change during the birth date.' : '') +
        ' This is a calculation demonstration, not a personality prediction. ' +
        'https://ethanwillingham.com/archive/star-signs/star-signs.html';
      var preview = $('ss-share-text'); preview.value = txt; preview.hidden = false;
      $('ss-share-out').textContent = 'Copying...';
      function done(success) {
        $('ss-share-out').textContent = success ? 'Copied.' : 'Copy failed. Select the text below to copy it yourself.';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(legacyCopy(preview)); });
      } else { done(legacyCopy(preview)); }
    });
    function legacyCopy(preview) {
      preview.focus(); preview.select();
      try { return document.execCommand('copy') === true; } catch (error) { return false; }
    }
  }

  function boot() { buildPanel(); update(); initBarnum(); initShare(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
