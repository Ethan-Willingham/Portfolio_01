/* under-map.js - the real map for "What's Under a Twin Cities Street".
   A self-contained canvas map: no map library, no tile server of our own.
   Real geometry, drawn in the site palette:
     - land, county lines, city limits                 (Met Council)
     - lakes + the Mississippi                         (DNR via Met Council)
     - the road skeleton                               (MnDOT class 1-4)
     - electric transmission + distribution, substations,
       and every mapped power plant                    (OpenStreetMap, ODbL)
     - sanitary: the regional interceptors by type, lift stations,
       treatment plants, sewersheds                    (MCES)
     - storm: every Minneapolis catch basin            (City of Minneapolis)
     - drinking water plants                           (OSM)
     - data centers + the 511 Building carrier hotel   (OSM + PeeringDB)
   External requests happen only for the aerial basemap: USGS tiles, plus
   the MnGeo state composite for house-level sharpness when zoomed in.
   Groups the data cannot cover are said out loud in the layer card. */
(function () {
  'use strict';

  var HOST = document.getElementById('undermap');
  if (!HOST) return;
  var CANVAS = HOST.querySelector('canvas');
  var STATUS = HOST.querySelector('.um-status');
  var SHED = HOST.querySelector('.um-shed');
  var SCALE = HOST.querySelector('.um-scale');
  var STAGE = HOST.querySelector('.um-stage');
  var PANEL = HOST.querySelector('.um-panel');
  var ctx = CANVAS.getContext('2d');

  // ---- palette ----
  var C = {
    land: '#2a322b',
    county: 'rgba(232,226,214,0.10)', city: 'rgba(232,226,214,0.22)',
    water: '#26343b',
    road12: 'rgba(232,226,214,0.34)', road3: 'rgba(232,226,214,0.20)', road4: 'rgba(232,226,214,0.11)',
    sub: 'rgba(184,121,109,0.60)',
    lift: 'rgba(111,154,108,0.85)',
    inlet: 'rgba(143,179,199,0.8)',
    shed: 'rgba(111,154,108,0.045)', shedLine: 'rgba(111,154,108,0.10)', shedHi: 'rgba(111,154,108,0.13)',
    tplant: '#dfc288', tplantGhost: 'rgba(223,194,136,0.38)',
    ww: '#8fb3c7',
    dc: '#cf9f78',
    hydrant: '#d9978c', tower: '#8fb3c7',
    gas: '#dfc288', steam: '#cf9f78',
    bstream: '#8fb3c7',
    bdepth0: '#6f9a6c', bdepth1: '#dfc288', bdepth2: '#cf9f78', bdepth3: '#b8796d',
    bedrock: 'rgba(183,155,196,0.18)', bedrockLn: 'rgba(183,155,196,0.5)', fault: 'rgba(183,155,196,0.55)',
    well: 'rgba(164,162,147,0.7)',
    dam: '#8fb3c7', exch: '#cf9f78', pave: '#8f9184',
    sel: '#ede0c0', hov: '#f5f1ea',
    label: 'rgba(245,241,234,0.92)', labelHalo: 'rgba(30,36,32,0.85)',
    mark: '#d4c4a0'
  };
  var FUEL = {
    hydro: '#8fb3c7', nuclear: '#b79bc4', gas: '#dfc288', oil: '#cf9f78',
    coal: '#b8796d', waste: '#cf9f78', solar: '#ece5d3', wind: '#9ec79a',
    biomass: '#6f9a6c', battery: '#b79bc4'
  };
  // Line styles per basemap: satellite gets brighter cores; both get a dark
  // casing under every utility line so the network reads over anything.
  function lineStyles() {
    if (SAT.on) return {
      case_: 'rgba(8,12,9,0.9)',
      kv345: { c: '#e8a48e', w: 2.6 }, kv200: { c: '#e09a86', w: 2.0 }, kv100: { c: '#d59079', w: 1.5 }, kvLow: { c: '#c48774', w: 1.0 }, minor: { c: 'rgba(214,150,132,0.8)', w: 0.9 },
      sewer: { c: '#93cf8b', w: 2.3 }, siphon: { c: '#93cf8b', w: 2.5 }, ghost: { c: 'rgba(147,207,139,0.4)', w: 1.1 }
    };
    return {
      case_: 'rgba(16,21,17,0.8)',
      kv345: { c: '#cd8b78', w: 2.4 }, kv200: { c: '#c48371', w: 1.9 }, kv100: { c: '#b8796d', w: 1.4 }, kvLow: { c: 'rgba(184,121,109,0.6)', w: 0.95 }, minor: { c: 'rgba(184,121,109,0.42)', w: 0.8 },
      sewer: { c: '#7fb27a', w: 2.0 }, siphon: { c: '#7fb27a', w: 2.2 }, ghost: { c: 'rgba(111,154,108,0.38)', w: 1.0 }
    };
  }

  // ---- aerial imagery ----
  // Base: USGS The National Map (public domain), tiles to z16.
  // Sharp overlay: the MnGeo Minnesota composite image service, fetched one
  // viewport-sized image at a time once you zoom past ~z14. Both load only
  // while the satellite basemap is on.
  var SAT = { on: false, cache: new Map(), maxTiles: 350 };
  function tileURL(z, x, y) { return 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/' + z + '/' + y + '/' + x; }
  function tileGet(z, x, y) {
    var k = z + '/' + x + '/' + y;
    var t = SAT.cache.get(k);
    if (t) return t;
    if (SAT.cache.size > SAT.maxTiles) SAT.cache.delete(SAT.cache.keys().next().value);
    t = { img: new Image(), ok: false, dead: false };
    t.img.onload = function () { t.ok = true; requestDraw(); };
    t.img.onerror = function () { t.dead = true; };
    t.img.src = tileURL(z, x, y);
    SAT.cache.set(k, t);
    return t;
  }
  var HQ = { img: null, box: null, pending: null, timer: null };
  var WORLD_M = 40075016.686;
  function hqRefresh() {
    if (!SAT.on || view.z < 14.2) return;
    if (HQ.timer) clearTimeout(HQ.timer);
    HQ.timer = setTimeout(function () {
      var s = scale();
      var wpx = Math.min(2200, Math.round(W * DPR)), hpx = Math.min(2200, Math.round(H * DPR));
      var x0 = view.x - (W / 2) / s, x1 = view.x + (W / 2) / s;
      var y0 = view.y - (H / 2) / s, y1 = view.y + (H / 2) / s;
      var mx0 = (x0 - 0.5) * WORLD_M, mx1 = (x1 - 0.5) * WORLD_M;
      var my0 = (0.5 - y1) * WORLD_M, my1 = (0.5 - y0) * WORLD_M;
      var url = 'https://imageserver.gisdata.mn.gov/cgi-bin/mncomp?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=mncomp&STYLES=&CRS=EPSG:3857' +
        '&BBOX=' + mx0.toFixed(1) + ',' + my0.toFixed(1) + ',' + mx1.toFixed(1) + ',' + my1.toFixed(1) +
        '&WIDTH=' + wpx + '&HEIGHT=' + hpx + '&FORMAT=image/jpeg';
      var img = new Image();
      HQ.pending = img;
      img.onload = function () {
        if (HQ.pending !== img) return;
        HQ.img = img; HQ.box = { x0: x0, x1: x1, y0: y0, y1: y1 };
        requestDraw();
      };
      img.onerror = function () { if (HQ.pending === img) HQ.pending = null; };
      img.src = url;
    }, 380);
  }
  function drawTiles() {
    var zi = Math.max(3, Math.min(16, Math.floor(view.z + 0.4)));
    var n = Math.pow(2, zi), s = scale(), ts = s / n;
    var x0 = Math.floor((view.x - (W / 2) / s) * n), x1 = Math.floor((view.x + (W / 2) / s) * n);
    var y0 = Math.floor((view.y - (H / 2) / s) * n), y1 = Math.floor((view.y + (H / 2) / s) * n);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        var t = tileGet(zi, tx, ty);
        if (!t.ok || t.dead) continue;
        var px = (tx / n - view.x) * s + W / 2, py = (ty / n - view.y) * s + H / 2;
        try { ctx.drawImage(t.img, px, py, ts + 0.6, ts + 0.6); } catch (err) {}
      }
    }
    // the sharp state overlay, reprojected from its captured view
    if (HQ.img && HQ.box && view.z >= 14.2) {
      var b = HQ.box;
      var px0 = (b.x0 - view.x) * s + W / 2, py0 = (b.y0 - view.y) * s + H / 2;
      var pw = (b.x1 - b.x0) * s, ph = (b.y1 - b.y0) * s;
      try { ctx.drawImage(HQ.img, px0, py0, pw, ph); } catch (err) {}
    }
    ctx.fillStyle = view.z < 13 ? 'rgba(30,36,32,0.22)' : 'rgba(30,36,32,0.10)';
    ctx.fillRect(0, 0, W, H);
  }

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
    sewersheds: 'assets/map/sewersheds.json',
    waterworks: 'assets/map/waterworks.json',
    comms: 'assets/map/comms.json',
    inlets: 'assets/map/inlets.json'
  };
  var L = {};
  // the honest groups. The original set is on by default; the newer granular
  // layers each get their own toggle. Heavy/optional ones default off so they
  // neither clutter the first view nor load until asked for.
  var on = {
    san: true, storm: true, water: true, elec: true, pplants: true, comms: true, roads: true,
    hydrants: true, towers: true,          // water, extra
    gas: true, steam: true,                // pipelines
    bstreams: true,                        // buried creeks
    dams: false, exch: false,              // charm (wired batch 5)
    meters: false, pavement: false,        // off by default
    bdepth: false, bedrock: false, wells: false  // the rock, off by default
  };

  // Lazy layer registry: file + geometry kind, loaded on demand. A toggle maps
  // to a load key via TOGLOAD (gas + steam share one pipelines file).
  var LAZY = {
    hydr:    { file: 'assets/map/hydrants.json',     kind: 'points' },
    towers:  { file: 'assets/map/watertowers.json',  kind: 'points' },
    pipes:   { file: 'assets/map/pipelines.json',    kind: 'lines' },
    bstream: { file: 'assets/map/streamsug.json',    kind: 'lines' },
    dams:    { file: 'assets/map/damslocks.json',    kind: 'points' },
    exch:    { file: 'assets/map/exchanges.json',    kind: 'points' },
    meters:  { file: 'assets/map/meters.json',       kind: 'points' },
    pave:    { file: 'assets/map/pavement.json',     kind: 'lines' },
    bdepth:  { file: 'assets/map/bedrockdepth.json', kind: 'points' },
    bedrock: { file: 'assets/map/bedrock.json',      kind: 'polys' },
    bfault:  { file: 'assets/map/bedrockfaults.json',kind: 'lines' },
    wells:   { file: 'assets/map/wells.json',        kind: 'points' }
  };
  // toggle key -> the load key(s) it needs
  var TOGLOAD = {
    hydrants: ['hydr'], towers: ['towers'], gas: ['pipes'], steam: ['pipes'],
    bstreams: ['bstream'], dams: ['dams'], exch: ['exch'], meters: ['meters'],
    pavement: ['pave'], bdepth: ['bdepth'], bedrock: ['bedrock', 'bfault'], wells: ['wells']
  };
  var loading = {};
  function ensureLayer(k) {
    var cfg = LAZY[k];
    if (!cfg || L[k] || loading[k]) return;
    loading[k] = true;
    fetch(cfg.file).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j) L[k] = pack(j, cfg.kind === 'points' ? 'points' : undefined);
      loading[k] = false; requestDraw();
    }).catch(function () { loading[k] = false; });
  }
  function ensureActive() {
    Object.keys(TOGLOAD).forEach(function (tk) { if (on[tk]) TOGLOAD[tk].forEach(ensureLayer); });
  }

  var MARKS = [
    { lon: -93.2570, lat: 44.9806, name: 'St. Anthony Falls + the 1876 dike', group: null,
      blurb: 'The only major waterfall on the Mississippi, artificial since 1880. Under the river just upstream sits the concrete dike the Army Corps finished in 1876, up to 40 feet deep and 1,850 feet across, built after the Eastman tunnel collapse nearly unzipped the falls.' },
    { lon: -93.25458, lat: 44.97141, name: 'The 511 Building', group: 'comms',
      blurb: 'The metro\'s carrier hotel: the old warehouse at 511 11th Ave S where the region\'s networks physically interconnect. MICE, the Midwest Internet Cooperative Exchange, peers 158 networks here (Cologix MIN1, per PeeringDB). If your packet crosses town, odds are it passes through this building.' }
  ];

  // ---- mercator ----
  function mx(lon) { return (lon + 180) / 360; }
  function my(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  function lonOf(x) { return x * 360 - 180; }
  function latOf(y) { var n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

  var MINZ = 9.2, MAXZ = 17.6;
  var view = { x: mx(-93.166), y: my(44.963), z: 10.9 };
  var HOME = { x: view.x, y: view.y, z: view.z };
  var fitted = false;
  function fitZoom() {
    var span = mx(-92.72) - mx(-93.72);
    var z = Math.log2(W / (span * 256));
    view.z = HOME.z = Math.max(9.4, Math.min(11.4, z));
    fitted = true;
    var m = (location.hash || '').match(/#map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(\/sat)?/);
    if (m) {
      view.z = Math.max(MINZ, Math.min(MAXZ, +m[1])); view.y = my(+m[2]); view.x = mx(+m[3]);
      if (m[4]) setBase(true);
    }
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
  function strokeBucket(segs, style, width, dash, casing) {
    var s = scale(), cx = view.x, cy = view.y, any = false;
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      if (!visible(segs[i], cx, cy, s)) continue;
      tracePath(segs[i], s, cx, cy); any = true;
    }
    if (!any) return;
    if (casing) {
      ctx.strokeStyle = casing; ctx.lineWidth = width + 2.4;
      ctx.setLineDash([]); ctx.stroke();
    }
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke(); ctx.setLineDash([]);
  }

  var shedPick = null;
  var HOVL = null;   // hovered line {seg, meta}
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var s = scale(), cx = view.x, cy = view.y;

    if (SAT.on) drawTiles();
    if (!SAT.on && L.counties) {
      ctx.beginPath();
      L.counties.forEach(function (seg) { tracePath(seg, s, cx, cy); ctx.closePath(); });
      ctx.fillStyle = C.land; ctx.fill();
      ctx.strokeStyle = C.county; ctx.lineWidth = 1; ctx.stroke();
    }
    // --- the rock: background surfaces under everything (drawn map only) ---
    if (!SAT.on && on.bedrock && L.bedrock) {
      for (var bri = 0; bri < L.bedrock.length; bri++) {
        var bseg = L.bedrock[bri];
        if (!visible(bseg, cx, cy, s)) continue;
        ctx.fillStyle = (bseg.p.u || '').charAt(0) === 'C' ? 'rgba(223,194,136,0.16)' : 'rgba(183,155,196,0.17)';
        ctx.beginPath(); tracePath(bseg, s, cx, cy); ctx.closePath(); ctx.fill();
      }
    }
    if (!SAT.on && on.bedrock && L.bfault) strokeBucket(L.bfault, C.fault, 0.8, [4, 3]);
    if (!SAT.on && on.bdepth && L.bdepth && view.z < 13.6) {
      var cellPx = Math.max(4, (0.004 / 360) * s * 1.5), chalf = cellPx / 2;
      for (var dpi = 0; dpi < L.bdepth.length; dpi++) {
        var dc = L.bdepth[dpi];
        var dpx = (dc.x - cx) * s + W / 2, dpy = (dc.y - cy) * s + H / 2;
        if (dpx < -cellPx || dpx > W + cellPx || dpy < -cellPx || dpy > H + cellPx) continue;
        var dft = dc.p.ft;
        ctx.fillStyle = dft < 50 ? 'rgba(223,194,136,0.42)' : dft < 150 ? 'rgba(207,159,120,0.42)' : dft < 300 ? 'rgba(184,121,109,0.44)' : 'rgba(183,155,196,0.48)';
        ctx.fillRect(dpx - chalf, dpy - chalf, cellPx, cellPx);
      }
    }
    if (!SAT.on && on.san && L.sheds) {
      Object.keys(L.sheds).forEach(function (name) {
        ctx.beginPath();
        L.sheds[name].forEach(function (seg) { if (visible(seg, cx, cy, s)) { tracePath(seg, s, cx, cy); ctx.closePath(); } });
        ctx.fillStyle = (name === shedPick) ? C.shedHi : C.shed;
        ctx.fill('evenodd');
        if (name === shedPick) { ctx.strokeStyle = C.shedLine; ctx.lineWidth = 1.2; ctx.stroke(); }
      });
    }
    if (!SAT.on && L.water) {
      ctx.beginPath();
      for (var i = 0; i < L.water.length; i++) { if (visible(L.water[i], cx, cy, s)) { tracePath(L.water[i], s, cx, cy); ctx.closePath(); } }
      ctx.fillStyle = C.water; ctx.fill();
    }
    if (!SAT.on && L.cities) strokeBucket(L.cities, C.city, 1.1, [5, 4]);
    if (!SAT.on && on.roads && L.roads) {
      strokeBucket(L.roads.r4, C.road4, 0.6);
      strokeBucket(L.roads.r3, C.road3, 0.8);
      strokeBucket(L.roads.r12, C.road12, 1.25);
    }

    var LS = lineStyles();
    // electric
    if (on.elec) {
      if (L.powerminor && view.z > 10.4) strokeBucket(L.powerminor, LS.minor.c, LS.minor.w, null, LS.case_);
      if (L.grid) {
        strokeBucket(L.grid.low, LS.kvLow.c, LS.kvLow.w, null, LS.case_);
        strokeBucket(L.grid.k100, LS.kv100.c, LS.kv100.w, null, LS.case_);
        strokeBucket(L.grid.k200, LS.kv200.c, LS.kv200.w, null, LS.case_);
        strokeBucket(L.grid.k345, LS.kv345.c, LS.kv345.w, null, LS.case_);
      }
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
    // gas transmission + steam (pipelines). Distribution mains stay unpublished;
    // these are the high-pressure feeders and the downtown district-heat lines.
    if ((on.gas || on.steam) && L.pipes) {
      if (on.gas) strokeBucket(L.pipes.filter(function (s) { return s.p.k === 'g'; }), C.gas, 1.8, null, LS.case_);
      if (on.steam) strokeBucket(L.pipes.filter(function (s) { return s.p.k === 's'; }), C.steam, 1.6, [7, 4], LS.case_);
    }
    // buried streams: creeks and brooks now running underground in storm
    // tunnels and culverts. Ghost-blue dashes, water where it shouldn't be.
    if (on.bstreams && L.bstream) strokeBucket(L.bstream, C.bstream, 1.7, [6, 4], LS.case_);
    // sanitary
    if (on.san && L.interceptors) {
      strokeBucket(L.interceptors.ghost, LS.ghost.c, LS.ghost.w, [3, 4]);
      strokeBucket(L.interceptors.g, LS.sewer.c, LS.sewer.w, null, LS.case_);
      strokeBucket(L.interceptors.f, LS.sewer.c, LS.sewer.w, [8, 4], LS.case_);
      strokeBucket(L.interceptors.s, LS.siphon.c, LS.siphon.w, [2, 3], LS.case_);
    }
    if (on.san && L.lifts && view.z > 10.3) {
      ctx.fillStyle = C.lift;
      L.lifts.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -8 || p[0] > W + 8 || p[1] < -8 || p[1] > H + 8) return;
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 6.2832); ctx.fill();
      });
    }
    // storm inlets (Minneapolis)
    if (on.storm && L.inlets && view.z > 12.6) {
      ctx.fillStyle = C.inlet;
      var r2 = view.z > 14.5 ? 2.2 : 1.4;
      L.inlets.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -4 || p[0] > W + 4 || p[1] < -4 || p[1] > H + 4) return;
        ctx.fillRect(p[0] - r2 / 2, p[1] - r2 / 2, r2, r2);
      });
    }
    // treatment plants
    if (on.san && L.tplants) {
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
    // drinking water plants
    if (on.water && L.ww) {
      L.ww.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        ctx.strokeStyle = C.ww; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.4, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgba(143,179,199,0.5)';
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.4, 0, 6.2832); ctx.fill();
        if (view.z > 10.8) label(pt.p.name, p[0], p[1] - 8, 3);
      });
    }
    // hydrants (Minneapolis): the gated water mains, surfacing. 8,000 dots, so
    // only past a close zoom, else the city turns to mush.
    if (on.hydrants && L.hydr && view.z > 12.4) {
      ctx.fillStyle = C.hydrant;
      var hr = view.z > 14.2 ? 2.1 : 1.35;
      for (var hi = 0; hi < L.hydr.length; hi++) {
        var hp = toPx(L.hydr[hi].x, L.hydr[hi].y);
        if (hp[0] < -4 || hp[0] > W + 4 || hp[1] < -4 || hp[1] > H + 4) continue;
        ctx.beginPath(); ctx.arc(hp[0], hp[1], hr, 0, 6.2832); ctx.fill();
      }
    }
    // water towers: the one above-ground element, kept quiet so the buried
    // network stays the story. A small tank on a stalk, past a mid zoom.
    if (on.towers && L.towers && view.z > 11.2) {
      ctx.strokeStyle = C.tower; ctx.lineWidth = 1.3;
      ctx.fillStyle = 'rgba(143,179,199,0.22)';
      L.towers.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) return;
        ctx.beginPath(); ctx.arc(p[0], p[1] - 1.6, 2.2, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[0], p[1] + 0.5); ctx.lineTo(p[0], p[1] + 3); ctx.stroke();
        if (view.z > 12.6) label(pt.p.name || 'Water tower', p[0], p[1] - 7, 1);
      });
    }
    // water wells (decimated sample): where the usable ground has been drilled
    if (on.wells && L.wells && view.z > 11.4) {
      ctx.fillStyle = C.well;
      for (var wi = 0; wi < L.wells.length; wi++) {
        var wp = toPx(L.wells[wi].x, L.wells[wi].y);
        if (wp[0] < -4 || wp[0] > W + 4 || wp[1] < -4 || wp[1] > H + 4) continue;
        ctx.beginPath(); ctx.arc(wp[0], wp[1], 1.3, 0, 6.2832); ctx.fill();
      }
    }
    // data centers
    if (on.comms && L.dc) {
      L.dc.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        ctx.fillStyle = C.dc;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1] - 3.6); ctx.lineTo(p[0] + 3.6, p[1]); ctx.lineTo(p[0], p[1] + 3.6); ctx.lineTo(p[0] - 3.6, p[1]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(30,36,32,0.9)'; ctx.lineWidth = 1.1; ctx.stroke();
        if (view.z > 11.2) label(pt.p.name, p[0], p[1] - 8, 2);
      });
    }
    // power plants
    if (on.pplants && L.pplants) {
      L.pplants.forEach(function (pt) {
        var p = toPx(pt.x, pt.y);
        if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
        var mw = pt.p.mw || 0;
        if (!mw && view.z < 10.6) return;
        var r = mw ? Math.max(2.6, Math.min(11, 2 + Math.sqrt(mw) * 0.42)) : 2.4;
        ctx.fillStyle = FUEL[pt.p.src] || C.mark;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(30,36,32,0.9)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.stroke();
        if (pt.p.name !== 'unnamed plant' && ((mw >= 90 && view.z > 9.9) || view.z > 11.6)) label(pt.p.name, p[0], p[1] - r - 4, Math.min(4, mw / 200));
      });
    }
    // landmarks
    MARKS.forEach(function (m) {
      if (m.group && !on[m.group]) return;
      var p = toPx(mx(m.lon), my(m.lat));
      if (p[0] < -60 || p[0] > W + 60 || p[1] < -30 || p[1] > H + 30) return;
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5.5, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = C.mark;
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 6.2832); ctx.fill();
      if (view.z > 10.4) label(m.name, p[0], p[1] - 11, 6);
    });
    // hovered line highlight
    if (HOVL) {
      ctx.beginPath();
      tracePath(HOVL.seg, s, cx, cy);
      ctx.strokeStyle = LS.case_; ctx.lineWidth = (HOVL.meta.w || 2) + 4.2; ctx.stroke();
      ctx.strokeStyle = C.hov; ctx.lineWidth = (HOVL.meta.w || 2) + 1.4;
      ctx.setLineDash(HOVL.meta.dash || []); ctx.stroke(); ctx.setLineDash([]);
    }
    // selection ring
    if (SEL && SEL.x !== undefined) {
      var sp = toPx(SEL.x, SEL.y);
      ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], 9, 0, 6.2832); ctx.stroke();
    }
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
    var metersPerPx = WORLD_M * Math.cos(lat) / scale();
    var milesPerPx = metersPerPx / 1609.344;
    var steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
    var target = 90 * milesPerPx, mi = steps[0];
    for (var i = 0; i < steps.length; i++) { if (steps[i] <= target) mi = steps[i]; }
    SCALE.textContent = mi + ' mi';
    SCALE.style.width = (mi / milesPerPx) + 'px';
  }

  var raf = null;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = null; draw(); }); }

  // ---- sizing ----
  function resize() {
    // True full-bleed: the section lives inside an off-center reading column,
    // so CSS alone cannot center it on the viewport. Pin it here.
    var parentLeft = HOST.parentElement.getBoundingClientRect().left;
    HOST.style.marginLeft = (-parentLeft) + 'px';
    HOST.style.width = document.documentElement.clientWidth + 'px';
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
    if (SHED) SHED.hidden = true; shedPick = null;
    HOVL = null;
    hqRefresh();
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      try { history.replaceState(null, '', '#map=' + view.z.toFixed(2) + '/' + latOf(view.y).toFixed(4) + '/' + lonOf(view.x).toFixed(4) + (SAT.on ? '/sat' : '')); } catch (err) {}
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
    try { CANVAS.setPointerCapture(e.pointerId); } catch (err) {}
    downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z: view.z };
    }
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

  // ---- the inspector ----
  var SEL = null;
  var FACTS = {
    'Metro': 'The one that started it all: opened 1938 at Pig\'s Eye as the first major-metro sewage plant on the Mississippi. Today it treats about 225 million gallons a day, roughly half the wastewater the whole state produces, for a service population over two million.',
    'Blue Lake': 'One of the regional system\'s two big southwest plants, serving the Minnesota River side of the metro.',
    'Seneca': 'Treats the Minnesota River valley\'s share of the metro\'s flow, tucked below the bluffs in Eagan.',
    'Monticello Nuclear Generating Plant': 'A single boiling-water reactor on the Mississippi upstream of the cities, running since 1971. The river water that cools it flows on down through both downtowns.',
    'Prairie Island Nuclear Generating Plant': 'Two pressurized-water reactors downstream near Red Wing. Its spent fuel is stored on site, next to the Prairie Island Indian Community, some homes within 600 yards.',
    'Allen S. King Power Plant': 'The tall stack on the St. Croix at Bayport. One of the last big coal units in the metro.',
    'Covanta Hennepin Energy': 'The downtown garbage burner: Hennepin County trash goes in, about 39 megawatts come out, a block from the ballpark.',
    'High Bridge Power Plant': 'St. Paul\'s riverside plant at the High Bridge, burning gas to cover the city\'s peaks.',
    'Riverside Generating Plant': 'North Minneapolis\'s big gas plant on the river bend, a coal site for a century before conversion.',
    'Minneapolis Water Treatment Plant': 'Where Minneapolis drinks from: river water drawn upstream in Fridley, softened, filtered, and pushed into the city\'s mains.',
    'McCarrons Water Treatment Plant': 'St. Paul Regional Water\'s plant. The east metro\'s taps start here.',
    'Minnesota Gateway Data Center': 'The data-center floors of the 511 Building, the metro\'s main carrier hotel.'
  };
  var KINDBLURB = {
    tplant: 'A regional wastewater treatment plant: everything flushed in its sewershed ends up here, gets cleaned, and returns to the river.',
    tplantGhost: 'A treatment plant that closed when the regional system consolidated. Its ground remembers.',
    ww: 'A drinking-water treatment plant: the clean half of the water cycle, upstream of every tap it serves.',
    dc: 'A data center: one of the buildings where the metro\'s fiber physically terminates and networks exchange traffic.',
    sub: 'A substation: where transmission voltage steps down toward neighborhood feeders.',
    inlet: 'A storm inlet: the grate at the curb. Everything that goes down it reaches a lake or the river with no treatment plant in between.',
    hydrant: 'A fire hydrant: the water distribution network surfacing. The mains it taps are not published, but every hydrant marks where they run.',
    tower: 'A water tower: elevated storage that holds the system\'s pressure steady, and its only presence on the skyline.',
    gas: 'A gas transmission main: the high-pressure lines that feed the city gate stations. The distribution mains under your street stay unpublished.',
    steam: 'A steam or hot-water district-heating main: buried pipe that heats a cluster of downtown buildings from a central plant.',
    bstream: 'A buried watercourse: a creek or stream running underground in a storm tunnel or culvert. Some were open water before the city grew over them.',
    dam: 'A dam or lock on the river: where the falls were tamed and the barges are lifted.',
    exch: 'A telephone exchange: the older copper central offices, the fiber era\'s inheritance from the phone network.',
    well: 'A drilled well, logged in the state\'s County Well Index. Its depth records how far down the usable ground goes here.',
    pplant: { nuclear: 'Splits uranium to boil water.', coal: 'Burns coal, the old backbone.', gas: 'Burns natural gas, the system\'s flexible middle.', oil: 'An oil or dual-fuel peaker, run when demand spikes.', hydro: 'Spins on falling river water, the oldest power here.', waste: 'Burns garbage and sells the heat.', solar: 'A solar array.', wind: 'A wind site.', biomass: 'Burns plant matter.', battery: 'A grid battery.' }
  };
  function mwText(mw) { return mw ? (mw >= 1000 ? (mw / 1000).toFixed(1) + ' GW' : Math.round(mw) + ' MW') : null; }
  function openPanel(sel) {
    if (!PANEL) return;
    SEL = sel;
    var rows = '';
    (sel.facts || []).forEach(function (f2) { rows += '<div class="um-prow"><span>' + f2[0] + '</span><b>' + f2[1] + '</b></div>'; });
    PANEL.innerHTML =
      '<button class="um-pclose" aria-label="Close">&times;</button>' +
      '<p class="um-pk" style="--pk:' + (sel.color || '#d4c4a0') + '">' + sel.kindLabel + '</p>' +
      '<h4>' + sel.name + '</h4>' + rows +
      (sel.blurb ? '<p class="um-pblurb">' + sel.blurb + '</p>' : '') +
      (sel.x !== undefined ? '<div class="um-pact"><button class="um-b1" data-pa="fly">Fly closer</button><button class="um-b2" data-pa="sat">See it from above</button></div>' : '');
    PANEL.hidden = false;
    PANEL.querySelector('.um-pclose').addEventListener('click', closePanel);
    var fb = PANEL.querySelector('[data-pa="fly"]'), sb = PANEL.querySelector('[data-pa="sat"]');
    if (fb) fb.addEventListener('click', function () { flyTo(lonOf(sel.x), latOf(sel.y), 15.4); });
    if (sb) sb.addEventListener('click', function () { setBase(true); flyTo(lonOf(sel.x), latOf(sel.y), 16.4); });
    requestDraw();
  }
  function closePanel() { if (PANEL) PANEL.hidden = true; SEL = null; requestDraw(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

  // ---- line hit testing (shared by hover + tap) ----
  function lineBuckets() {
    var LS = lineStyles(), out = [];
    if (on.elec && L.grid) {
      out.push({ segs: L.grid.k345, meta: { name: '345 kV transmission line', kindLabel: 'Electric · backbone', color: LS.kv345.c, w: LS.kv345.w, blurb: 'The metro\'s highest-voltage tier: the long-haul lines that move bulk power between plants and the region.' } });
      out.push({ segs: L.grid.k200, meta: { name: '230 kV transmission line', kindLabel: 'Electric', color: LS.kv200.c, w: LS.kv200.w, blurb: 'Heavy regional transmission.' } });
      out.push({ segs: L.grid.k100, meta: { name: '115 to 161 kV transmission line', kindLabel: 'Electric', color: LS.kv100.c, w: LS.kv100.w, blurb: 'The workhorse tier that rings the cities and feeds the big substations.' } });
      out.push({ segs: L.grid.low, meta: { name: 'Sub-100 kV line', kindLabel: 'Electric', color: LS.kvLow.c, w: LS.kvLow.w, blurb: 'Lower-voltage subtransmission, the step before neighborhood feeders.' } });
      if (view.z > 10.4 && L.powerminor) out.push({ segs: L.powerminor, meta: { name: 'Distribution feeder', kindLabel: 'Electric · local', color: LS.minor.c, w: LS.minor.w, blurb: 'A local feeder on its way to the poles and pad transformers. OSM maps only some of these; the full street-level grid is Xcel\'s and is not public.' } });
    }
    if (on.san && L.interceptors) {
      out.push({ segs: L.interceptors.f, meta: { name: 'Forcemain interceptor', kindLabel: 'Sanitary sewer', color: LS.sewer.c, w: LS.sewer.w, dash: [8, 4], blurb: 'A pressurized sewer: where gravity runs out, lift-station pumps shove the flow uphill through these.' } });
      out.push({ segs: L.interceptors.s, meta: { name: 'Siphon crossing', kindLabel: 'Sanitary sewer', color: LS.siphon.c, w: LS.siphon.w, dash: [2, 3], blurb: 'An inverted siphon: the pipe dives under a river or obstacle and pressure pushes the flow up the far side.' } });
      out.push({ segs: L.interceptors.g, meta: { name: 'Gravity interceptor', kindLabel: 'Sanitary sewer', color: LS.sewer.c, w: LS.sewer.w, blurb: 'The default sewer: a tunnel laid on a steady downhill grade, flowing to the plant on slope alone. These are the regional trunk lines; the smaller street mains that feed them are not published.' } });
      out.push({ segs: L.interceptors.ghost, meta: { name: 'Abandoned interceptor', kindLabel: 'Sanitary sewer · ghost', color: LS.ghost.c, w: LS.ghost.w, dash: [3, 4], blurb: 'A retired line, abandoned or removed as the regional system was rebuilt. Drawn as a ghost.' } });
    }
    if (on.gas && L.pipes) out.push({ segs: L.pipes.filter(function (s) { return s.p.k === 'g'; }), meta: { name: 'Gas transmission main', kindLabel: 'Gas · transmission', color: C.gas, w: 1.8, blurb: KINDBLURB.gas } });
    if (on.steam && L.pipes) out.push({ segs: L.pipes.filter(function (s) { return s.p.k === 's'; }), meta: { name: 'District-heat main', kindLabel: 'Steam / hot water', color: C.steam, w: 1.6, dash: [7, 4], blurb: KINDBLURB.steam } });
    if (on.bstreams && L.bstream) out.push({ segs: L.bstream, meta: { name: 'Buried watercourse', kindLabel: 'Storm · buried creek', color: C.bstream, w: 1.7, dash: [6, 4], blurb: KINDBLURB.bstream } });
    return out;
  }
  function lineAt(px, py) {
    var s = scale(), cx = view.x, cy = view.y;
    var best = null, bd = 7;
    lineBuckets().forEach(function (bk) {
      bk.segs.forEach(function (seg) {
        if (!visible(seg, cx, cy, s)) return;
        var xs = seg.xs, ys = seg.ys, n = seg.n;
        var X0 = (xs[0] - cx) * s + W / 2, Y0 = (ys[0] - cy) * s + H / 2;
        for (var i = 1; i < n; i++) {
          var X1 = (xs[i] - cx) * s + W / 2, Y1 = (ys[i] - cy) * s + H / 2;
          var dx = X1 - X0, dy = Y1 - Y0;
          var L2 = dx * dx + dy * dy;
          var t = L2 ? Math.max(0, Math.min(1, ((px - X0) * dx + (py - Y0) * dy) / L2)) : 0;
          var qx = X0 + t * dx, qy = Y0 + t * dy;
          var d2 = Math.hypot(px - qx, py - qy);
          if (d2 < bd) { bd = d2; best = { meta: bk.meta, seg: seg }; }
          X0 = X1; Y0 = Y1;
        }
      });
    });
    return best;
  }

  // ---- point hit testing ----
  function nearestPoint(e) {
    var rect = CANVAS.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var best = null, bd = 15;
    function test(x, y, sel) {
      var p = toPx(x, y), d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bd) { bd = d; sel.x = x; sel.y = y; best = { sel: sel }; }
    }
    if (on.pplants && L.pplants) L.pplants.forEach(function (pt) {
      var mw = pt.p.mw, nm = pt.p.name === 'unnamed plant' ? 'Power plant' : pt.p.name;
      var facts = [['fuel', pt.p.src]]; if (mw) facts.push(['output', mwText(mw)]);
      test(pt.x, pt.y, { kind: 'pplant', kindLabel: 'Power plant · ' + pt.p.src, color: FUEL[pt.p.src] || C.mark, name: nm, facts: facts, blurb: FACTS[pt.p.name] || (KINDBLURB.pplant[pt.p.src] || '') });
    });
    if (on.san && L.tplants) L.tplants.forEach(function (pt) {
      var ghost = pt.p.k === 'ghost';
      var facts = []; if (pt.p.yr) facts.push(['opened', String(pt.p.yr)]);
      test(pt.x, pt.y, { kind: 'tplant', kindLabel: ghost ? 'Closed treatment plant' : 'Wastewater treatment plant', color: C.tplant, name: pt.p.name, facts: facts, blurb: FACTS[pt.p.name] || (ghost ? KINDBLURB.tplantGhost : KINDBLURB.tplant) });
    });
    if (on.water && L.ww) L.ww.forEach(function (pt) {
      test(pt.x, pt.y, { kind: 'ww', kindLabel: 'Drinking-water plant', color: C.ww, name: pt.p.name, facts: [], blurb: FACTS[pt.p.name] || KINDBLURB.ww });
    });
    if (on.comms && L.dc) L.dc.forEach(function (pt) {
      test(pt.x, pt.y, { kind: 'dc', kindLabel: 'Data center', color: C.dc, name: pt.p.name, facts: [], blurb: FACTS[pt.p.name] || KINDBLURB.dc });
    });
    if (on.elec && L.subs && view.z > 10.6) L.subs.forEach(function (pt) {
      if (!pt.p.name && !pt.p.kv) return;
      var nm = pt.p.name || 'Substation';
      var facts = []; if (pt.p.kv) facts.push(['voltage', pt.p.kv + ' kV']);
      test(pt.x, pt.y, { kind: 'sub', kindLabel: 'Substation', color: C.sub, name: nm, facts: facts, blurb: KINDBLURB.sub });
    });
    if (on.storm && L.inlets && view.z > 13.6) L.inlets.forEach(function (pt) {
      test(pt.x, pt.y, { kind: 'inlet', kindLabel: 'Storm inlet · Minneapolis', color: C.inlet, name: 'Storm inlet', facts: [], blurb: KINDBLURB.inlet });
    });
    if (on.hydrants && L.hydr && view.z > 13.2) L.hydr.forEach(function (pt) {
      test(pt.x, pt.y, { kind: 'hydrant', kindLabel: 'Fire hydrant · Minneapolis', color: C.hydrant, name: 'Fire hydrant', facts: pt.p.yr ? [['installed', String(pt.p.yr)]] : [], blurb: KINDBLURB.hydrant });
    });
    if (on.towers && L.towers) L.towers.forEach(function (pt) {
      test(pt.x, pt.y, { kind: 'tower', kindLabel: 'Water tower', color: C.tower, name: pt.p.name || 'Water tower', facts: [], blurb: KINDBLURB.tower });
    });
    if (on.wells && L.wells && view.z > 12.2) L.wells.forEach(function (pt) {
      var wf = []; if (pt.p.d) wf.push(['drilled', pt.p.d + ' ft']); if (pt.p.a) wf.push(['aquifer', pt.p.a]);
      test(pt.x, pt.y, { kind: 'well', kindLabel: 'Drilled well', color: C.well, name: 'Drilled well', facts: wf, blurb: KINDBLURB.well });
    });
    MARKS.forEach(function (m) {
      if (m.group && !on[m.group]) return;
      test(mx(m.lon), my(m.lat), { kind: 'mark', kindLabel: 'Landmark', color: C.mark, name: m.name, facts: [], blurb: m.blurb });
    });
    return { best: best, px: px, py: py };
  }

  var FINE = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hoverName = null, lastLineCheck = 0;
  function hover(e) {
    var r = nearestPoint(e);
    if (r.best) {
      CANVAS.style.cursor = 'pointer';
      if (HOVL) { HOVL = null; requestDraw(); }
      if (FINE && r.best.sel.name !== hoverName) {
        hoverName = r.best.sel.name;
        openPanel(r.best.sel);
      }
      return;
    }
    // line hover, throttled: highlight it and open its card
    var now = Date.now();
    if (now - lastLineCheck > 90) {
      lastLineCheck = now;
      var lh = lineAt(r.px, r.py);
      if (lh) {
        CANVAS.style.cursor = 'pointer';
        if (!HOVL || HOVL.seg !== lh.seg) { HOVL = lh; requestDraw(); }
        if (FINE && lh.meta.name !== hoverName) {
          hoverName = lh.meta.name;
          openPanel({ kind: 'line', kindLabel: lh.meta.kindLabel, color: lh.meta.color, name: lh.meta.name, facts: [], blurb: lh.meta.blurb });
        }
        return;
      }
      if (HOVL) { HOVL = null; requestDraw(); }
      CANVAS.style.cursor = 'grab';
      hoverName = null;
    }
  }
  function tap(e) {
    var r = nearestPoint(e);
    if (r.best) { openPanel(r.best.sel); return; }
    var lh = lineAt(r.px, r.py);
    if (lh) { HOVL = lh; openPanel({ kind: 'line', kindLabel: lh.meta.kindLabel, color: lh.meta.color, name: lh.meta.name, facts: [], blurb: lh.meta.blurb }); requestDraw(); return; }
    // open ground: which plant does this spot drain to?
    if (!on.san || !L.sheds || !SHED) return;
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

  // ---- controls ----
  HOST.querySelectorAll('[data-um-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-um-toggle');
      if (!(k in on)) return;
      on[k] = !on[k];
      btn.setAttribute('aria-pressed', on[k] ? 'true' : 'false');
      if (on[k] && TOGLOAD[k]) TOGLOAD[k].forEach(ensureLayer);  // fetch on first enable
      if (k === 'san' && !on.san && SHED) { SHED.hidden = true; shedPick = null; }
      HOVL = null;
      requestDraw();
    });
  });
  var baseThumb = HOST.querySelector('[data-um-basethumb]');
  function setBase(sat) {
    SAT.on = !!sat;
    if (baseThumb) {
      var img = baseThumb.querySelector('img'), lbl = baseThumb.querySelector('span');
      if (img) img.src = SAT.on ? 'assets/map/base-drawn.jpg' : 'assets/map/base-sat.jpg';
      if (lbl) lbl.textContent = SAT.on ? 'Drawn' : 'Satellite';
      baseThumb.setAttribute('aria-label', SAT.on ? 'Switch to the drawn map' : 'Switch to satellite view');
    }
    noteMoved(); requestDraw();
  }
  if (baseThumb) baseThumb.addEventListener('click', function () { setBase(!SAT.on); });

  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var flyRaf = null;
  function flyTo(lon, lat, z2) {
    if (flyRaf) cancelAnimationFrame(flyRaf);
    var tx = mx(lon), ty = my(lat), tz = Math.max(MINZ, Math.min(MAXZ, z2));
    if (REDUCE) { view.x = tx; view.y = ty; view.z = tz; clampView(); noteMoved(); requestDraw(); return; }
    var fx = view.x, fy = view.y, fz = view.z, t0 = performance.now(), DUR = 800;
    function step(now) {
      var t = Math.min(1, (now - t0) / DUR);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      view.x = fx + (tx - fx) * e; view.y = fy + (ty - fy) * e; view.z = fz + (tz - fz) * e;
      clampView(); requestDraw();
      if (t < 1) flyRaf = requestAnimationFrame(step); else { flyRaf = null; noteMoved(); }
    }
    flyRaf = requestAnimationFrame(step);
  }
  HOST.querySelectorAll('[data-um-fly]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = btn.getAttribute('data-um-fly').split(',');
      flyTo(+v[0], +v[1], +v[2]);
    });
  });
  var placesSel = HOST.querySelector('[data-um-places]');
  if (placesSel) placesSel.addEventListener('change', function () {
    if (!placesSel.value) return;
    var v = placesSel.value.split(',');
    flyTo(+v[0], +v[1], +v[2]);
  });
  var layersCard = HOST.querySelector('.um-layers');
  if (layersCard && window.matchMedia && window.matchMedia('(min-width: 701px)').matches) layersCard.setAttribute('open', '');

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
    ensureActive();  // pull the default-on granular layers alongside the core set
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
      if (r.power) {
        var gsegs = pack(r.power); L.grid = { k345: [], k200: [], k100: [], low: [] };
        gsegs.forEach(function (gs) {
          var v = gs.p.v || 0;
          (v >= 300 ? L.grid.k345 : v >= 200 ? L.grid.k200 : v >= 100 ? L.grid.k100 : L.grid.low).push(gs);
        });
      }
      if (r.powerminor) L.powerminor = pack(r.powerminor);
      if (r.substations) L.subs = pack(r.substations, 'points');
      if (r.powerplants) L.pplants = pack(r.powerplants, 'points');
      if (r.interceptors) {
        var iv = pack(r.interceptors); L.interceptors = { g: [], f: [], s: [], ghost: [] };
        iv.forEach(function (s3) {
          var t3 = s3.p.t;
          (t3 === 'x' ? L.interceptors.ghost : t3 === 'f' ? L.interceptors.f : t3 === 's' ? L.interceptors.s : L.interceptors.g).push(s3);
        });
      }
      if (r.lifts) L.lifts = pack(r.lifts, 'points');
      if (r.tplants) L.tplants = pack(r.tplants, 'points');
      if (r.waterworks) L.ww = pack(r.waterworks, 'points');
      if (r.comms) L.dc = pack(r.comms, 'points');
      if (r.inlets) L.inlets = pack(r.inlets, 'points');
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
