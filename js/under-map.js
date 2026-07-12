/* under-map.js - the real map for "What's Under a Twin Cities Street".
   A self-contained canvas map: no tile server, no map library, no external
   requests. Real geometry, drawn in the site palette:
     - land + county lines, city limits            (Met Council)
     - lakes + the Mississippi                     (DNR via Met Council)
     - the road skeleton                           (MnDOT functional class 1-4)
     - electric transmission + distribution lines,
       substations, and every mapped power plant  (OpenStreetMap, ODbL)
     - the regional sanitary interceptors, live + abandoned,
       lift stations, treatment plants, and the
       sewersheds that say where a flush drains   (MCES)
   Web Mercator, flat typed arrays, one beginPath per style bucket, bbox
   culling. Layers lazy-load when the section scrolls near. Tap a plant for
   its facts; tap open ground to learn which treatment plant serves it. */
(function () {
  'use strict';

  var HOST = document.getElementById('undermap');
  if (!HOST) return;
  var CANVAS = HOST.querySelector('canvas');
  var STATUS = HOST.querySelector('.um-status');
  var TIP = HOST.querySelector('.um-tip');
  var SHED = HOST.querySelector('.um-shed');
  var SCALE = HOST.querySelector('.um-scale');
  var STAGE = HOST.querySelector('.um-stage');
  var ctx = CANVAS.getContext('2d');

  // ---- palette (the dig-paint code, matched to the page tokens) ----
  var C = {
    land: '#2a322b',
    county: 'rgba(232,226,214,0.10)', city: 'rgba(232,226,214,0.22)',
    water: '#26343b',
    road12: 'rgba(232,226,214,0.34)', road3: 'rgba(232,226,214,0.20)', road4: 'rgba(232,226,214,0.11)',
    grid: 'rgba(184,121,109,0.85)', gridMinor: 'rgba(184,121,109,0.38)',
    sub: 'rgba(184,121,109,0.60)',
    sewerLive: 'rgba(111,154,108,0.95)', sewerGhost: 'rgba(111,154,108,0.34)',
    lift: 'rgba(111,154,108,0.85)',
    shed: 'rgba(111,154,108,0.045)', shedLine: 'rgba(111,154,108,0.10)', shedHi: 'rgba(111,154,108,0.13)',
    tplant: '#dfc288',  tplantGhost: 'rgba(223,194,136,0.38)',
    label: 'rgba(245,241,234,0.92)', labelHalo: 'rgba(30,36,32,0.85)',
    mark: '#d4c4a0'
  };
  // power plants, colored by fuel (plant:source)
  var FUEL = {
    hydro: '#8fb3c7', nuclear: '#b79bc4', gas: '#dfc288', oil: '#cf9f78',
    coal: '#b8796d', waste: '#cf9f78', solar: '#ece5d3', wind: '#9ec79a',
    biomass: '#6f9a6c', battery: '#b79bc4'
  };

  // ---- layer registry ----
  var FILES = {
    counties: 'assets/map/counties.json',
    cities: 'assets/map/cities.json',
    water: 'assets/map/water.json',
    roads: 'assets/map/roads.json',
    power: 'assets/map/power.json',
    powerminor: 'assets/map/powerminor.json',
    substations: 'assets/map/substations.json',
    powerplants: 'assets/map/powerplants.json',
    interceptors: 'assets/map/interceptors.json',
    lifts: 'assets/map/lifts.json',
    tplants: 'assets/map/plants.json',
    sewersheds: 'assets/map/sewersheds.json'
  };
  var L = {};
  var on = { roads: true, grid: true, pplants: true, sewer: true };

  // ---- landmarks (hand-checked, deliberately few) ----
  var MARKS = [
    { lon: -93.2570, lat: 44.9806, name: 'St. Anthony Falls + the 1876 dike' }
  ];

  // ---- mercator ----
  function mx(lon) { return (lon + 180) / 360; }
  function my(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  function lonOf(x) { return x * 360 - 180; }
  function latOf(y) { var n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

  // view: center in world units + zoom (px per world unit = 256 * 2^z).
  // The zoom is computed on first sizing so the metro fits any stage width.
  var MINZ = 9.2, MAXZ = 15.5;
  var view = { x: mx(-93.166), y: my(44.963), z: 10.9 };
  var HOME = { x: view.x, y: view.y, z: view.z };
  var fitted = false;
  function fitZoom() {
    var span = mx(-92.72) - mx(-93.72);   // the metro east-west, with margin
    var z = Math.log2(W / (span * 256));
    view.z = HOME.z = Math.max(9.4, Math.min(11.4, z));
    fitted = true;
    var m = (location.hash || '').match(/#map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/);
    if (m) { view.z = Math.max(MINZ, Math.min(MAXZ, +m[1])); view.y = my(+m[2]); view.x = mx(+m[3]); }
  }
  var W = 0, H = 0, DPR = 1;

  function scale() { return 256 * Math.pow(2, view.z); }
  function toPx(x, y) { var s = scale(); return [ (x - view.x) * s + W / 2, (y - view.y) * s + H / 2 ]; }

  // ---- geometry ingestion ----
  function eachRing(geom, cb) {
    var t = geom.type, cs = geom.coordinates;
    if (t === 'LineString') cb(cs);
    else if (t === 'MultiLineString' || t === 'Polygon') cs.forEach(cb);
    else if (t === 'MultiPolygon') cs.forEach(function (p) { p.forEach(cb); });
  }
  function pack(gj, kind) {
    var out = [];
    var feats = gj.features || (gj.type === 'GeometryCollection' ? gj.geometries.map(function (g) { return { geometry: g, properties: {} }; }) : []);
    feats.forEach(function (f) {
      if (!f.geometry) return;
      if (kind === 'points') {
        var c = f.geometry.coordinates;
        if (f.geometry.type === 'Point') out.push({ x: mx(c[0]), y: my(c[1]), p: f.properties || {} });
        return;
      }
      eachRing(f.geometry, function (ring) {
        var n = ring.length, xs = new Float64Array(n), ys = new Float64Array(n);
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (var i = 0; i < n; i++) {
          var X = mx(ring[i][0]), Y = my(ring[i][1]);
          xs[i] = X; ys[i] = Y;
          if (X < x0) x0 = X; if (X > x1) x1 = X;
          if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
        out.push({ xs: xs, ys: ys, n: n, b: [x0, y0, x1, y1], p: f.properties || {} });
      });
    });
    return out;
  }

  // ---- drawing ----
  function tracePath(seg, s, cx, cy) {
    var xs = seg.xs, ys = seg.ys, n = seg.n;
    ctx.moveTo((xs[0] - cx) * s + W / 2, (ys[0] - cy) * s + H / 2);
    for (var i = 1; i < n; i++) ctx.lineTo((xs[i] - cx) * s + W / 2, (ys[i] - cy) * s + H / 2);
  }
  function visible(seg, cx, cy, s) {
    var pad = 40;
    var x0 = (seg.b[0] - cx) * s + W / 2, x1 = (seg.b[2] - cx) * s + W / 2;
    var y0 = (seg.b[1] - cy) * s + H / 2, y1 = (seg.b[3] - cy) * s + H / 2;
    return x1 > -pad && x0 < W + pad && y1 > -pad && y0 < H + pad;
  }
  function strokeBucket(segs, style, width, dash) {
    var s = scale(), cx = view.x, cy = view.y, any = false;
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      if (!visible(segs[i], cx, cy, s)) continue;
      tracePath(segs[i], s, cx, cy); any = true;
    }
    if (!any) return;
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke(); ctx.setLineDash([]);
  }

  var shedPick = null; // name of the tapped sewershed
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var s = scale(), cx = view.x, cy = view.y;

    // land
    if (L.counties) {
      ctx.beginPath();
      L.counties.forEach(function (seg) { tracePath(seg, s, cx, cy); ctx.closePath(); });
      ctx.fillStyle = C.land; ctx.fill();
      ctx.strokeStyle = C.county; ctx.lineWidth = 1; ctx.stroke();
    }
    // sewersheds: the quiet answer to "where does my flush go"
    if (on.sewer && L.sheds) {
      Object.keys(L.sheds).forEach(function (name) {
        ctx.beginPath();
        L.sheds[name].forEach(function (seg) { if (visible(seg, cx, cy, s)) { tracePath(seg, s, cx, cy); ctx.closePath(); } });
        ctx.fillStyle = (name === shedPick) ? C.shedHi : C.shed;
        ctx.fill('evenodd');
        if (name === shedPick) { ctx.strokeStyle = C.shedLine; ctx.lineWidth = 1.2; ctx.stroke(); }
      });
    }
    // water
    if (L.water) {
      ctx.beginPath();
      for (var i = 0; i < L.water.length; i++) { if (visible(L.water[i], cx, cy, s)) { tracePath(L.water[i], s, cx, cy); ctx.closePath(); } }
      ctx.fillStyle = C.water; ctx.fill();
    }
    // city limits
    if (L.cities) strokeBucket(L.cities, C.city, 1.1, [5, 4]);
    // roads by class
    if (on.roads && L.roads) {
      strokeBucket(L.roads.r4, C.road4, 0.6);
      strokeBucket(L.roads.r3, C.road3, 0.8);
      strokeBucket(L.roads.r12, C.road12, 1.25);
    }
    // the grid: distribution feeders come in on zoom, transmission always
    if (on.grid) {
      if (L.powerminor && view.z > 10.4) strokeBucket(L.powerminor, C.gridMinor, 0.7);
      if (L.power) strokeBucket(L.power, C.grid, 1.05);
      if (L.subs) {
        ctx.fillStyle = C.sub;
        var showMinorSubs = view.z > 11.0;
        L.subs.forEach(function (pt) {
          if (!pt.p.m && !showMinorSubs) return;
          var p = toPx(pt.x, pt.y);
          if (p[0] < -8 || p[0] > W + 8 || p[1] < -8 || p[1] > H + 8) return;
          var r = pt.p.m ? 2.4 : 1.6;
          ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
        });
      }
    }
    // sewers
    if (on.sewer && L.interceptors) {
      strokeBucket(L.interceptors.ghost, C.sewerGhost, 1, [3, 4]);
      strokeBucket(L.interceptors.live, C.sewerLive, 1.7);
    }
    // lift stations
    if (on.sewer && L.lifts && view.z > 10.3) {
      ctx.fillStyle = C.lift;
      L.lifts.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -8 || p[0] > W + 8 || p[1] < -8 || p[1] > H + 8) return;
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 6.2832); ctx.fill();
      });
    }
    // treatment plants
    if (on.sewer && L.tplants) {
      L.tplants.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        if (pt.p.k === 'ghost') {
          if (view.z > 11) {
            ctx.strokeStyle = C.tplantGhost; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.2832); ctx.stroke();
          }
          return;
        }
        ctx.fillStyle = C.tplant;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(30,36,32,0.9)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 6.2832); ctx.stroke();
        if (view.z > 9.9) label(pt.p.name, p[0], p[1] - 9, 5);
      });
    }
    // power plants, sized by megawatts, colored by fuel
    if (on.pplants && L.pplants) {
      L.pplants.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        var mw = pt.p.mw || 0;
        if (!mw && view.z < 10.6) return;   // tiny unrated plants only up close
        var r = mw ? Math.max(2.6, Math.min(11, 2 + Math.sqrt(mw) * 0.42)) : 2.4;
        var col = FUEL[pt.p.src] || C.mark;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(30,36,32,0.9)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.stroke();
        if (pt.p.name !== 'unnamed plant' && ((mw >= 90 && view.z > 9.9) || view.z > 11.6)) label(pt.p.name, p[0], p[1] - r - 4, Math.min(4, mw / 200));
      });
    }
    // landmarks
    MARKS.forEach(function (m) {
      var p = toPx(mx(m.lon), my(m.lat));
      if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5.5, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = C.mark;
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 6.2832); ctx.fill();
      if (view.z > 10.4) label(m.name, p[0], p[1] - 11, 6);
    });
    flushLabels();
    drawScale();
  }
  var labelQ = [];
  function label(text, x, y, prio) { labelQ.push({ t: text, x: x, y: y, p: prio || 0 }); }
  function flushLabels() {
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    labelQ.sort(function (a2, b2) { return b2.p - a2.p; });
    var placed = [];
    labelQ.forEach(function (q) {
      var w2 = ctx.measureText(q.t).width / 2 + 4;
      var r = { x0: q.x - w2, x1: q.x + w2, y0: q.y - 13, y1: q.y + 2 };
      for (var i = 0; i < placed.length; i++) {
        var o = placed[i];
        if (r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) return;
      }
      placed.push(r);
      ctx.lineWidth = 3; ctx.strokeStyle = C.labelHalo;
      ctx.strokeText(q.t, q.x, q.y);
      ctx.fillStyle = C.label; ctx.fillText(q.t, q.x, q.y);
    });
    labelQ = [];
  }
  function drawScale() {
    if (!SCALE) return;
    var lat = latOf(view.y) * Math.PI / 180;
    var metersPerPx = 40075016.686 * Math.cos(lat) / scale();
    var milesPerPx = metersPerPx / 1609.344;
    var steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50];
    var target = 90 * milesPerPx, mi = steps[0];
    for (var i = 0; i < steps.length; i++) { if (steps[i] <= target) mi = steps[i]; }
    SCALE.textContent = mi + ' mi';
    SCALE.style.width = (mi / milesPerPx) + 'px';
  }

  var raf = null;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = null; draw(); }); }

  // ---- sizing ----
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = STAGE.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    CANVAS.width = W * DPR; CANVAS.height = H * DPR;
    CANVAS.style.width = W + 'px'; CANVAS.style.height = H + 'px';
    if (!fitted && W > 0) fitZoom();
    requestDraw();
  }

  // ---- interaction ----
  var hashTimer = null;
  function noteMoved() {
    hideTip(); if (SHED) SHED.hidden = true; shedPick = null;
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      try { history.replaceState(null, '', '#map=' + view.z.toFixed(2) + '/' + latOf(view.y).toFixed(4) + '/' + lonOf(view.x).toFixed(4)); } catch (err) {}
    }, 500);
  }
  function clampView() {
    view.z = Math.max(MINZ, Math.min(MAXZ, view.z));
    view.x = Math.max(mx(-94.6), Math.min(mx(-92.0), view.x));
    view.y = Math.max(my(45.75), Math.min(my(44.2), view.y));
  }
  function zoomAt(px, py, dz) {
    var s0 = scale();
    var wx = view.x + (px - W / 2) / s0, wy = view.y + (py - H / 2) / s0;
    view.z += dz; clampView();
    var s1 = scale();
    view.x = wx - (px - W / 2) / s1; view.y = wy - (py - H / 2) / s1;
    clampView(); noteMoved(); requestDraw();
  }

  var pointers = new Map(), pinch = null, downAt = null;
  CANVAS.addEventListener('pointerdown', function (e) {
    CANVAS.setPointerCapture(e.pointerId);
    downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z: view.z };
    }
    hideTip();
  });
  CANVAS.addEventListener('pointermove', function (e) {
    var prev = pointers.get(e.pointerId);
    if (!prev) { hover(e); return; }
    var cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      var s = scale();
      view.x -= (cur.x - prev.x) / s; view.y -= (cur.y - prev.y) / s;
      clampView(); noteMoved(); requestDraw();
    } else if (pointers.size === 2 && pinch) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      var rect = CANVAS.getBoundingClientRect();
      var cxp = (pts[0].x + pts[1].x) / 2 - rect.left, cyp = (pts[0].y + pts[1].y) / 2 - rect.top;
      var nz = pinch.z + Math.log2(Math.max(0.05, d / pinch.d));
      zoomAt(cxp, cyp, nz - view.z);
    }
  });
  function endPointer(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; }
  CANVAS.addEventListener('pointerup', function (e) {
    endPointer(e);
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && Date.now() - downAt.t < 600) tap(e);
    downAt = null;
  });
  CANVAS.addEventListener('pointercancel', endPointer);
  CANVAS.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = CANVAS.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, -e.deltaY * 0.0022);
  }, { passive: false });
  CANVAS.addEventListener('dblclick', function (e) {
    var rect = CANVAS.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, 0.7);
  });
  CANVAS.addEventListener('keydown', function (e) {
    var s = scale(), step = 60 / s;
    var k = e.key;
    if (k === 'ArrowLeft') view.x -= step;
    else if (k === 'ArrowRight') view.x += step;
    else if (k === 'ArrowUp') view.y -= step;
    else if (k === 'ArrowDown') view.y += step;
    else if (k === '+' || k === '=') { zoomAt(W / 2, H / 2, 0.5); return; }
    else if (k === '-' || k === '_') { zoomAt(W / 2, H / 2, -0.5); return; }
    else if (k === '0') { view.x = HOME.x; view.y = HOME.y; view.z = HOME.z; }
    else return;
    e.preventDefault(); clampView(); noteMoved(); requestDraw();
  });

  // ---- hit testing ----
  function nearestPoint(e) {
    var rect = CANVAS.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = null, bd = 15;
    function test(x, y, name) {
      var p = toPx(x, y), d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bd) { bd = d; best = { x: p[0], y: p[1], name: name }; }
    }
    if (on.pplants && L.pplants) L.pplants.forEach(function (pt) {
      var mw = pt.p.mw;
      var bits = (pt.p.name === 'unnamed plant' ? 'power plant' : pt.p.name) + ' · ' + pt.p.src + (mw ? ' · ' + (mw >= 1000 ? (mw / 1000).toFixed(1) + ' GW' : Math.round(mw) + ' MW') : '');
      test(pt.x, pt.y, bits);
    });
    if (on.sewer && L.tplants) L.tplants.forEach(function (pt) {
      var t = pt.p.name + (pt.p.k === 'ghost' ? ' (closed' : ' (wastewater');
      t += pt.p.yr ? ', ' + pt.p.yr + ')' : ')';
      test(pt.x, pt.y, t);
    });
    MARKS.forEach(function (m) { test(mx(m.lon), my(m.lat), m.name); });
    return { best: best, px: px, py: py };
  }
  function hover(e) {
    var r = nearestPoint(e);
    if (r.best) {
      TIP.textContent = r.best.name;
      TIP.style.left = r.best.x + 'px'; TIP.style.top = (r.best.y - 14) + 'px';
      TIP.hidden = false; CANVAS.style.cursor = 'pointer';
    } else { hideTip(); }
  }
  function tap(e) {
    var r = nearestPoint(e);
    if (r.best) {
      TIP.textContent = r.best.name;
      TIP.style.left = r.best.x + 'px'; TIP.style.top = (r.best.y - 14) + 'px';
      TIP.hidden = false;
      return;
    }
    // no dot under the finger: answer the ground question instead
    if (!on.sewer || !L.sheds || !SHED) return;
    var s = scale();
    var wx = view.x + (r.px - W / 2) / s, wy = view.y + (r.py - H / 2) / s;
    var found = null;
    Object.keys(L.sheds).forEach(function (name) {
      if (found) return;
      var cross = 0;
      L.sheds[name].forEach(function (seg) {
        if (wx < seg.b[0] || wx > seg.b[2] || wy < seg.b[1] || wy > seg.b[3]) return;
        var xs = seg.xs, ys = seg.ys, n = seg.n;
        for (var i2 = 0, j = n - 1; i2 < n; j = i2++) {
          if ((ys[i2] > wy) !== (ys[j] > wy) && wx < (xs[j] - xs[i2]) * (wy - ys[i2]) / (ys[j] - ys[i2]) + xs[i2]) cross++;
        }
      });
      if (cross % 2 === 1) found = name;
    });
    if (found) {
      shedPick = found;
      SHED.textContent = 'This ground drains to the ' + found + ' plant.';
      SHED.hidden = false;
    } else {
      shedPick = null;
      SHED.hidden = true;
    }
    requestDraw();
  }
  function hideTip() { TIP.hidden = true; CANVAS.style.cursor = 'grab'; }

  // controls
  HOST.querySelectorAll('[data-um-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-um-toggle');
      on[k] = !on[k];
      btn.setAttribute('aria-pressed', on[k] ? 'true' : 'false');
      if (k === 'sewer' && !on.sewer && SHED) { SHED.hidden = true; shedPick = null; }
      requestDraw();
    });
  });
  var zin = HOST.querySelector('[data-um-zoom="in"]'), zout = HOST.querySelector('[data-um-zoom="out"]'), zhome = HOST.querySelector('[data-um-zoom="home"]'), zfull = HOST.querySelector('[data-um-zoom="full"]');
  if (zin) zin.addEventListener('click', function () { zoomAt(W / 2, H / 2, 0.6); });
  if (zout) zout.addEventListener('click', function () { zoomAt(W / 2, H / 2, -0.6); });
  if (zhome) zhome.addEventListener('click', function () { view.x = HOME.x; view.y = HOME.y; view.z = HOME.z; noteMoved(); requestDraw(); });
  if (zfull) {
    if (!STAGE.requestFullscreen) { zfull.hidden = true; }
    else {
      zfull.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else STAGE.requestFullscreen();
      });
      document.addEventListener('fullscreenchange', function () { setTimeout(resize, 60); });
    }
  }

  // ---- data load (lazy) ----
  var started = false;
  function start() {
    if (started) return; started = true;
    if (STATUS) STATUS.textContent = 'loading the real lines…';
    function grab(url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }).catch(function () { return null; });
    }
    var names = Object.keys(FILES);
    Promise.all(names.map(function (k) { return grab(FILES[k]); })).then(function (rs) {
      var r = {}; names.forEach(function (k, i) { r[k] = rs[i]; });
      if (r.counties) L.counties = pack(r.counties);
      if (r.cities) L.cities = pack(r.cities);
      if (r.water) L.water = pack(r.water);
      if (r.roads) {
        var segs = pack(r.roads); L.roads = { r12: [], r3: [], r4: [] };
        segs.forEach(function (s2) { var c2 = s2.p.c; (c2 <= 2 ? L.roads.r12 : c2 === 3 ? L.roads.r3 : L.roads.r4).push(s2); });
      }
      if (r.power) L.power = pack(r.power);
      if (r.powerminor) L.powerminor = pack(r.powerminor);
      if (r.substations) L.subs = pack(r.substations, 'points');
      if (r.powerplants) L.pplants = pack(r.powerplants, 'points');
      if (r.interceptors) {
        var iv = pack(r.interceptors); L.interceptors = { live: [], ghost: [] };
        iv.forEach(function (s3) { (s3.p.k === 'ghost' ? L.interceptors.ghost : L.interceptors.live).push(s3); });
      }
      if (r.lifts) L.lifts = pack(r.lifts, 'points');
      if (r.tplants) L.tplants = pack(r.tplants, 'points');
      if (r.sewersheds) {
        var shedSegs = pack(r.sewersheds); L.sheds = {};
        shedSegs.forEach(function (sg) {
          var nm = sg.p.WWTP;
          if (!nm || nm === 'WATER') return;
          (L.sheds[nm] = L.sheds[nm] || []).push(sg);
        });
      }
      if (STATUS) STATUS.hidden = true;
      requestDraw();
    }).catch(function () {
      if (STATUS) STATUS.textContent = 'The map data could not load. The reading above still works.';
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { start(); io.disconnect(); } });
    }, { rootMargin: '600px 0px' });
    io.observe(HOST);
  } else { start(); }
  // Belt and suspenders: environments where IO never fires (some embedded
  // webviews throttle the rendering pipeline) still get the map.
  window.addEventListener('scroll', function onFirstScroll() {
    window.removeEventListener('scroll', onFirstScroll);
    start();
  }, { passive: true, once: true });
  setTimeout(function () {
    var top = HOST.getBoundingClientRect().top;
    if (top < window.innerHeight * 2.5) start();
  }, 2500);

  window.addEventListener('resize', resize);
  resize();
})();
