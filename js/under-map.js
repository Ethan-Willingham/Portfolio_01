/* under-map.js - the real map for "What's Under a Twin Cities Street".
   A self-contained canvas map: no tile server, no map library, no external
   requests. Real geometry, drawn in the site palette:
     - land + county lines, city limits   (Met Council)
     - lakes + the Mississippi            (DNR via Met Council)
     - the road skeleton                  (MnDOT functional class 1-4)
     - electric transmission lines        (OpenStreetMap, if present)
     - the regional sanitary interceptors, live + abandoned (MCES)
     - treatment plants + lift stations   (MCES)
   Web Mercator, flat typed arrays, one beginPath per style bucket, bbox
   culling. Layers lazy-load when the section scrolls near. */
(function () {
  'use strict';

  var HOST = document.getElementById('undermap');
  if (!HOST) return;
  var CANVAS = HOST.querySelector('canvas');
  var STATUS = HOST.querySelector('.um-status');
  var TIP = HOST.querySelector('.um-tip');
  var ctx = CANVAS.getContext('2d');

  // ---- palette (the dig-paint code, matched to the page tokens) ----
  var C = {
    land: '#2a322b', landOut: '#242b25',
    county: 'rgba(232,226,214,0.10)', city: 'rgba(232,226,214,0.22)',
    water: '#26343b', waterName: 'rgba(143,179,199,0.55)',
    road12: 'rgba(232,226,214,0.34)', road3: 'rgba(232,226,214,0.20)', road4: 'rgba(232,226,214,0.11)',
    power: 'rgba(184,121,109,0.85)',
    sewerLive: 'rgba(111,154,108,0.95)', sewerGhost: 'rgba(111,154,108,0.34)',
    lift: 'rgba(111,154,108,0.85)',
    plant: '#dfc288', plantGhost: 'rgba(223,194,136,0.38)',
    label: 'rgba(245,241,234,0.92)', labelHalo: 'rgba(30,36,32,0.85)',
    mark: '#d4c4a0'
  };

  // ---- layer registry ----
  var FILES = {
    counties: 'assets/map/counties.json',
    cities: 'assets/map/cities.json',
    water: 'assets/map/water.json',
    roads: 'assets/map/roads.json',
    power: 'assets/map/power.json',
    interceptors: 'assets/map/interceptors.json',
    lifts: 'assets/map/lifts.json',
    plants: 'assets/map/plants.json'
  };
  var L = {};             // parsed layers: {lines:[{xs,ys,bbox,props}], polys:[...], points:[...]}
  var on = { roads: true, power: true, sewer: true, plants: true };

  // ---- landmarks (hand-checked, deliberately few) ----
  var MARKS = [
    { lon: -93.2570, lat: 44.9806, name: 'St. Anthony Falls + the 1876 dike' }
  ];

  // ---- mercator ----
  function mx(lon) { return (lon + 180) / 360; }
  function my(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }

  // view: center in world units + zoom (px per world unit = 256 * 2^z).
  // The zoom is computed on first sizing so the metro fits any stage width.
  var view = { x: mx(-93.166), y: my(44.963), z: 10.9 };
  var HOME = { x: view.x, y: view.y, z: view.z };
  var fitted = false;
  function fitZoom() {
    var span = mx(-92.72) - mx(-93.72);   // the metro east-west, with margin
    var z = Math.log2(W / (span * 256));
    view.z = HOME.z = Math.max(9.4, Math.min(11.4, z));
    fitted = true;
  }
  var MINZ = 9.2, MAXZ = 15.5;
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
    // power
    if (on.power && L.power) strokeBucket(L.power, C.power, 1.05);
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
    // plants
    if (on.plants && L.plants) {
      L.plants.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        if (pt.p.k === 'ghost') {
          ctx.strokeStyle = C.plantGhost; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.2832); ctx.stroke();
          return;
        }
        ctx.fillStyle = C.plant;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(30,36,32,0.9)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 6.2832); ctx.stroke();
        if (view.z > 9.9) label(pt.p.name, p[0], p[1] - 9);
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
      if (view.z > 10.4) label(m.name, p[0], p[1] - 11);
    });
  }
  function label(text, x, y) {
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = C.labelHalo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = C.label; ctx.fillText(text, x, y);
  }

  var raf = null;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = null; draw(); }); }

  // ---- sizing ----
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = HOST.querySelector('.um-stage').getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    CANVAS.width = W * DPR; CANVAS.height = H * DPR;
    CANVAS.style.width = W + 'px'; CANVAS.style.height = H + 'px';
    if (!fitted && W > 0) fitZoom();
    requestDraw();
  }

  // ---- interaction ----
  function clampView() {
    view.z = Math.max(MINZ, Math.min(MAXZ, view.z));
    var s = scale();
    view.x = Math.max(mx(-94.6), Math.min(mx(-92.0), view.x));
    view.y = Math.max(my(45.75), Math.min(my(44.2), view.y));
    void s;
  }
  function zoomAt(px, py, dz) {
    var s0 = scale();
    var wx = view.x + (px - W / 2) / s0, wy = view.y + (py - H / 2) / s0;
    view.z += dz; clampView();
    var s1 = scale();
    view.x = wx - (px - W / 2) / s1; view.y = wy - (py - H / 2) / s1;
    clampView(); requestDraw();
  }

  var pointers = new Map(), pinch = null;
  var downAt = null;
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
      clampView(); requestDraw();
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
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && Date.now() - downAt.t < 600) hover(e);
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

  // plant + landmark tooltips
  function hover(e) {
    if (!L.plants) return;
    var rect = CANVAS.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = null, bd = 14;
    function test(x, y, name) {
      var p = toPx(x, y), d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bd) { bd = d; best = { x: p[0], y: p[1], name: name }; }
    }
    if (on.plants) L.plants.forEach(function (pt) { test(pt.x, pt.y, pt.p.name + (pt.p.k === 'ghost' ? ' (closed)' : '')); });
    MARKS.forEach(function (m) { test(mx(m.lon), my(m.lat), m.name); });
    if (best) {
      TIP.textContent = best.name;
      TIP.style.left = best.x + 'px'; TIP.style.top = (best.y - 14) + 'px';
      TIP.hidden = false; CANVAS.style.cursor = 'pointer';
    } else { hideTip(); }
  }
  function hideTip() { TIP.hidden = true; CANVAS.style.cursor = 'grab'; }

  // controls
  HOST.querySelectorAll('[data-um-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-um-toggle');
      on[k] = !on[k];
      btn.setAttribute('aria-pressed', on[k] ? 'true' : 'false');
      requestDraw();
    });
  });
  var zin = HOST.querySelector('[data-um-zoom="in"]'), zout = HOST.querySelector('[data-um-zoom="out"]'), zhome = HOST.querySelector('[data-um-zoom="home"]');
  if (zin) zin.addEventListener('click', function () { zoomAt(W / 2, H / 2, 0.6); });
  if (zout) zout.addEventListener('click', function () { zoomAt(W / 2, H / 2, -0.6); });
  if (zhome) zhome.addEventListener('click', function () { view.x = HOME.x; view.y = HOME.y; view.z = HOME.z; requestDraw(); });

  // ---- data load (lazy) ----
  var started = false;
  function start() {
    if (started) return; started = true;
    if (STATUS) STATUS.textContent = 'loading the real lines…';
    function grab(url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }).catch(function () { return null; });
    }
    Promise.all([
      grab(FILES.counties), grab(FILES.cities), grab(FILES.water), grab(FILES.roads),
      grab(FILES.power), grab(FILES.interceptors), grab(FILES.lifts), grab(FILES.plants)
    ]).then(function (r) {
      if (r[0]) L.counties = pack(r[0]);
      if (r[1]) L.cities = pack(r[1]);
      if (r[2]) L.water = pack(r[2]);
      if (r[3]) {
        var segs = pack(r[3]); L.roads = { r12: [], r3: [], r4: [] };
        segs.forEach(function (s2) { var c2 = s2.p.c; (c2 <= 2 ? L.roads.r12 : c2 === 3 ? L.roads.r3 : L.roads.r4).push(s2); });
      }
      if (r[4]) L.power = pack(r[4]);
      if (r[5]) {
        var iv = pack(r[5]); L.interceptors = { live: [], ghost: [] };
        iv.forEach(function (s3) { (s3.p.k === 'ghost' ? L.interceptors.ghost : L.interceptors.live).push(s3); });
      }
      if (r[6]) L.lifts = pack(r[6], 'points');
      if (r[7]) L.plants = pack(r[7], 'points');
      if (STATUS) STATUS.hidden = true;
      var powerBtn = HOST.querySelector('[data-um-toggle="power"]');
      if (!L.power && powerBtn) powerBtn.hidden = true;
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
