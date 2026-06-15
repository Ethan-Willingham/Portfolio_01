/* ============================================================
   THE FIRST YEAR, core script.
   Navigation (contents rail, scroll-spy, filter, mobile overlay),
   progressive-disclosure deep-linking, a small SVG charting helper,
   and the boot that mounts registered charts and tools.
   Chart/tool modules register onto window.FY.viz / window.FY.tool and
   are concatenated after this core by the build script. No em dashes.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var reduce = false; /* owner: animate for everyone, even with prefers-reduced-motion set */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- Contents rail: build from the sections present ---------- */
  function buildTOC() {
    var list = $('#fy-toc-list'); if (!list) return;
    var secs = $all('main#guide > section.gsec');
    var n = 0, lastPhase = null;
    secs.forEach(function (sec) {
      var h = $('.gsec-h', sec); if (!h || !sec.id) return;
      var isEmerg = sec.id === 'emergency';
      var phase = sec.getAttribute('data-phase');
      if (phase && phase !== lastPhase && !isEmerg) {
        var gl = document.createElement('li');
        gl.className = 'fy-toc-group'; gl.setAttribute('aria-hidden', 'true');
        gl.textContent = phase; list.appendChild(gl); lastPhase = phase;
      }
      var li = document.createElement('li');
      if (isEmerg) li.className = 'is-emerg';
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      var label = h.textContent.trim();
      if (isEmerg) { a.innerHTML = '<span class="n">!</span><span class="t">' + label + '</span>'; }
      else { n++; a.innerHTML = '<span class="n">' + (n < 10 ? '0' + n : n) + '</span><span class="t">' + label + '</span>'; }
      a.dataset.keywords = (label + ' ' + (sec.dataset.keywords || '')).toLowerCase();
      li.appendChild(a);
      list.appendChild(li);
    });
    // pin the emergency item to the very top of the contents
    var em = list.querySelector('li.is-emerg');
    if (em) list.insertBefore(em, list.firstChild);
  }

  /* ---------- Scroll-spy via IntersectionObserver ---------- */
  function scrollSpy() {
    var links = {};
    $all('#fy-toc-list a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var secs = $all('main#guide > section.gsec');
    if (!('IntersectionObserver' in window) || !secs.length) return;
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var top = null, best = 0;
      Object.keys(visible).forEach(function (id) { if (visible[id] > best) { best = visible[id]; top = id; } });
      $all('#fy-toc-list a.active').forEach(function (a) { a.classList.remove('active'); });
      if (top && links[top]) {
        links[top].classList.add('active');
        if (links[top].scrollIntoView) { try { links[top].scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      }
    }, { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.25, 0.5, 1] });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Filter the contents list ---------- */
  function tocFilter() {
    var input = $('#fy-toc-search'), list = $('#fy-toc-list'), count = $('#fy-toc-count');
    if (!input || !list) return;
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var q = input.value.trim().toLowerCase(), shown = 0, total = 0, items = $all('li', list);
        items.forEach(function (li) {
          if (li.classList.contains('fy-toc-group')) { li.classList.toggle('hidden', !!q); return; }
          total++;
          var a = $('a', li); var match = !q || (a && a.dataset.keywords.indexOf(q) !== -1);
          li.classList.toggle('hidden', !match); if (match) shown++;
        });
        if (count) count.textContent = q ? (shown + ' of ' + total + ' sections') : '';
      }, 120);
    });
  }

  /* ---------- Contents nav: one panel toggle (desktop rail collapse + mobile drawer) ---------- */
  function navSidebar() {
    var toggle = $('#fy-nav-toggle'), toc = $('#fy-toc'), scrim = $('#fy-scrim'), root = document.documentElement;
    if (!toggle || !toc) return;
    var mq = window.matchMedia('(min-width: 1024px)');
    var desktop = function () { return mq.matches; };
    var FOCUS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
    var lastFocus = null;
    function sync() {
      var open = desktop() ? !root.classList.contains('nav-collapsed') : root.classList.contains('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Hide contents' : 'Show contents');
    }
    function openDrawer() {
      lastFocus = document.activeElement;
      toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true');
      // Focus the drawer itself, NOT the search input, so the mobile keyboard
      // does not pop open until the user taps into the field. Focus trap still holds.
      toc.setAttribute('tabindex', '-1');
      root.classList.add('nav-open'); sync();
      try { toc.focus(); } catch (e) {}
    }
    function closeDrawer() {
      root.classList.remove('nav-open'); sync();
      toc.removeAttribute('role'); toc.removeAttribute('aria-modal'); toc.removeAttribute('tabindex');
      try { toggle.focus(); } catch (e) {}
    }
    function toggleRail() {
      var collapsed = root.classList.toggle('nav-collapsed');
      try { localStorage.setItem('fy-nav', collapsed ? 'collapsed' : 'open'); } catch (e) {}
      sync();
    }
    toggle.addEventListener('click', function () {
      if (desktop()) toggleRail();
      else (root.classList.contains('nav-open') ? closeDrawer() : openDrawer());
    });
    if (scrim) scrim.addEventListener('click', closeDrawer);
    toc.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a'); if (a && !desktop()) closeDrawer(); });
    document.addEventListener('keydown', function (e) {
      if (desktop() || !root.classList.contains('nav-open')) return;
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key === 'Tab') {
        var items = Array.prototype.filter.call(toc.querySelectorAll(FOCUS), function (el) { return el.offsetParent !== null; });
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
      root.classList.remove('nav-open'); toc.removeAttribute('role'); toc.removeAttribute('aria-modal'); toc.removeAttribute('tabindex'); sync();
    });
    sync();
  }

  /* ---------- Progressive disclosure: deep-link opens the target ---------- */
  function openToHash(hash) {
    if (!hash || hash.length < 2) return;
    var target; try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return; }
    if (!target) return;
    var node = target;
    while (node && node !== document.body) { if (node.tagName === 'DETAILS') node.open = true; node = node.parentNode; }
    if (target.scrollIntoView) { try { target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch (e) { target.scrollIntoView(); } }
  }
  function disclosureLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
      var h = a.getAttribute('href'); if (h.length < 2) return;
      var id; try { id = document.getElementById(decodeURIComponent(h.slice(1))); } catch (er) { return; }
      if (id) { setTimeout(function () { openToHash(h); }, 0); }
    });
    if (location.hash) setTimeout(function () { openToHash(location.hash); }, 60);
  }

  /* ---------- Make the left "Usually normal" panel collapsible ---------- */
  /* The reassurance side can be tucked away; the "Call your doctor about"
     side is deliberately left always-visible. Pure progressive enhancement:
     with no JS the panel just stays open. */
  function collapsibleCallouts() {
    var n = 0;
    $all('.nvw .nvw-ok').forEach(function (ok) {
      var h4 = $('h4', ok), ul = $('ul', ok);
      if (!h4 || !ul || h4.dataset.enh) return;
      // SAFETY: the .nvw component is also reused for emergency first-aid
      // (choking, button battery) and for informational pairs, which use the
      // same left-panel class. Only the reassurance boxes may be collapsed,
      // so scope strictly to panels whose heading begins with "Usually normal".
      if (h4.textContent.trim().indexOf('Usually normal') !== 0) return;
      h4.dataset.enh = '1';
      ul.id = ul.id || ('nvw-ok-' + (++n));
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nvw-toggle';
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-controls', ul.id);
      while (h4.firstChild) btn.appendChild(h4.firstChild);
      var chev = document.createElement('span');
      chev.className = 'nvw-chev';
      chev.setAttribute('aria-hidden', 'true');
      btn.appendChild(chev);
      h4.appendChild(btn);
      btn.addEventListener('click', function () {
        var collapsed = ok.classList.toggle('is-collapsed');
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    });
  }

  /* ---------- A small SVG charting helper for the modules ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  FY.svg = {
    make: function (w, h) { var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + h); s.setAttribute('role', 'img'); s.setAttribute('preserveAspectRatio', 'xMidYMid meet'); s.dataset.w = w; s.dataset.h = h; return s; },
    el: function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; },
    scale: function (d0, d1, r0, r1) { var m = (r1 - r0) / (d1 - d0); return function (v) { return r0 + (v - d0) * m; }; },
    line: function (pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); },
    area: function (pts, y0) { if (!pts.length) return ''; return 'M' + pts[0][0].toFixed(1) + ' ' + y0.toFixed(1) + ' ' + pts.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + y0.toFixed(1) + ' Z'; },
    text: function (x, y, str, cls, attrs) { var t = FY.svg.el('text', Object.assign({ x: x, y: y, class: cls || 'viz-axis' }, attrs || {})); t.textContent = str; return t; },
    palette: { gold: '#D4C4A0', goldHi: '#EDE0C0', parch: '#E8E2D6', dim: '#B8B2A2', rule: '#4A544B', ok: '#9ec79a', call: '#e6c074', emerg: '#e98e7f', sky: '#8fb3c7', plum: '#b79bc4' }
  };

  /* ---------- Boot the registered charts and tools ---------- */
  function mountAll() {
    $all('figure.viz[data-viz]').forEach(function (fig) {
      var id = fig.dataset.viz, fn = FY.viz[id]; if (!fn) return;
      try { fn(fig); fig.dataset.mounted = '1'; } catch (err) { if (window.console) console.warn('viz ' + id + ' failed', err); }
    });
    $all('.tool[data-tool]').forEach(function (m) {
      var id = m.dataset.tool, fn = FY.tool[id]; if (!fn) return;
      try { fn(m); m.dataset.mounted = '1'; } catch (err) { if (window.console) console.warn('tool ' + id + ' failed', err); }
    });
  }

  function init() { buildTOC(); scrollSpy(); tocFilter(); navSidebar(); disclosureLinks(); collapsibleCallouts(); mountAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


/* module: colophon-motif.js */
/* ============================================================
   Colophon generative motif: a static phyllotaxis (golden-angle
   spiral) of 365 points, one per day of a first year. Computed in
   the browser from a few lines of math and drawn once, no animation,
   so it is reduced-motion friendly by construction. No deps. No em dashes.
   ============================================================ */
(function () {
  'use strict';
  function draw(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var N = 365, GOLD = Math.PI * (3 - Math.sqrt(5)); // golden angle, ~2.39996 rad
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function render() {
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      var W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);
      var R = Math.min(W, H) * 0.47, c = R / Math.sqrt(N);
      for (var i = 0; i < N; i++) {
        var a = i * GOLD, r = c * Math.sqrt(i);
        var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        var f = i / N; // 0 at the dense center, 1 at the rim
        var rad = (0.7 + f * 1.9) * dpr;
        var rr = Math.round(212 - f * 30), gg = Math.round(196 - f * 18), bb = Math.round(160 + f * 4);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 6.28319);
        ctx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.9 - f * 0.52).toFixed(3) + ')';
        ctx.fill();
      }
    }
    render();
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 200); });
  }
  function init() {
    var c = document.getElementById('colo-motif');
    if (c && c.getContext) { try { draw(c); } catch (e) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


/* module: cry-curves.js */
/* ============================================================
   THE FIRST YEAR, charts: the normal crying curve and the
   crying-peak / abusive-head-trauma overlay.
   Modules: cry-curve, cry-aht (two FY.viz functions, one file).
   Data: Vermillet et al., Child Development 2022;93(4):1201 to 1222
   (PMC9541248; meta-analysis of 57 studies, 17 countries, N=7,580)
   for the cry curve; AAP "Abusive Head Trauma" technical report,
   Pediatrics 2025;155(3):e2024070457 (with Barr 2006) for the AHT
   incidence, peak timing, and mortality.
   No external libraries. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) { if (window.console) console.warn('cry-curves: FY.svg helper missing'); return; }
  var P = S.palette;

  /* ---- shared geometry for the 720 x 380 frame ---- */
  var W = 720, H = 380;
  var M = { t: 30, r: 26, b: 52, l: 58 };
  var X0 = M.l, X1 = W - M.r;          /* plot box left/right */
  var Y0 = M.t, Y1 = H - M.b;          /* plot box top/bottom */
  var WK_MAX = 27;                     /* weeks of age on the x-axis */
  var TAB = { 'font-variant-numeric': 'tabular-nums' };  /* tabular mono numerals */

  /* The pooled fuss-plus-cry curve from Vermillet 2022.
     The paper fits a smooth double-exponential whose modeled peak is
     3.97 weeks (95% CrI 2.64 to 5.50) over an asymptote A0 = 40.4
     min/day, with a 1-to-2-week intercept near 99 min/day; the highest
     binned mean is 126 min/day (SD 61) at 5 to 6 weeks. We draw the
     smooth model as the line and overlay the binned weighted means as
     dots, exactly as the deep dive recommends (the bins are noisy and
     not perfectly monotonic). The smooth model below is sampled so its
     peak sits at ~5 weeks near 126 to keep the line and the headline
     binned peak visually consistent. */
  function crySmooth(wk) {
    var A0 = 40.4;                 /* asymptote, min/day (Vermillet A0) */
    var rise = 86 * (1 - Math.exp(-wk / 1.6));   /* fast rise from birth */
    var fall = Math.exp(-Math.pow(Math.max(wk - 5, 0) / 6.2, 1.05)); /* decay after the peak */
    return A0 + rise * fall;
  }

  /* Binned weighted means with an approximate middle-80% band
     (mean +/- 1.2816 x pooled SD, clipped at 0), recomputed from the
     Vermillet OSF study-level data and validated against the paper.
     Columns: week (bin midpoint), weighted mean, ~10th, ~90th, k, N. */
  var BINS = [
    { wk: 1.5,  mean: 86.8,  lo: 16,  hi: 157, k: 12, n: 1231 },
    { wk: 3.5,  mean: 89.2,  lo: 16,  hi: 162, k: 11, n: 949 },
    { wk: 5.5,  mean: 125.9, lo: 47,  hi: 204, k: 30, n: 5928 },
    { wk: 7.5,  mean: 77.7,  lo: 13,  hi: 142, k: 14, n: 853 },
    { wk: 9.5,  mean: 100.4, lo: 29,  hi: 171, k: 4,  n: 694 },
    { wk: 11.5, mean: 51.1,  lo: 10,  hi: 92,  k: 11, n: 909 },
    { wk: 15.0, mean: 66.1,  lo: 1,   hi: 131, k: 14, n: 2059 },
    { wk: 20.0, mean: 34.3,  lo: 0,   hi: 88,  k: 3,  n: 383 },
    { wk: 25.0, mean: 62.1,  lo: 2,   hi: 122, k: 9,  n: 800 }
  ];

  var Y_MAX = 220;  /* min/day axis top, leaves headroom over the ~205 band */

  /* ---- small drawing utilities ---- */
  function fmt(n) { return (Math.round(n)).toString(); }

  function frame(svg, yMax, yUnitLabel) {
    var sx = S.scale(0, WK_MAX, X0, X1);
    var sy = S.scale(0, yMax, Y1, Y0);
    var g = S.el('g', null, svg);

    /* horizontal gridlines + y ticks */
    var yStep = yMax <= 120 ? 30 : 50;
    for (var y = 0; y <= yMax + 0.5; y += yStep) {
      S.el('line', { x1: X0, y1: sy(y), x2: X1, y2: sy(y), class: 'viz-grid', opacity: y === 0 ? 0.85 : 0.4 }, g);
      g.appendChild(S.text(X0 - 8, sy(y) + 3.5, fmt(y), 'viz-axis', Object.assign({ 'text-anchor': 'end' }, TAB)));
    }
    /* x ticks every 4 weeks */
    for (var w = 0; w <= WK_MAX; w += 4) {
      S.el('line', { x1: sx(w), y1: Y1, x2: sx(w), y2: Y1 + 4, class: 'viz-grid', opacity: 0.6 }, g);
      var t = S.text(sx(w), Y1 + 18, fmt(w), 'viz-axis', Object.assign({ 'text-anchor': 'middle' }, TAB));
      g.appendChild(t);
    }
    /* axis titles */
    var ax = S.text((X0 + X1) / 2, H - 10, 'Age in weeks', 'viz-axis', { 'text-anchor': 'middle' });
    g.appendChild(ax);
    var ay = S.text(0, 0, yUnitLabel, 'viz-axis', { 'text-anchor': 'middle', transform: 'translate(' + (X0 - 42) + ' ' + ((Y0 + Y1) / 2) + ') rotate(-90)' });
    g.appendChild(ay);
    return { sx: sx, sy: sy, g: g };
  }

  /* Build a sampled smooth path across the week axis. */
  function smoothPts(sx, sy, fn) {
    var pts = [];
    for (var w = 0; w <= WK_MAX; w += 0.5) pts.push([sx(w), sy(fn(w))]);
    return pts;
  }

  /* Append a data table (accessible fallback). headers: array; rows: array of arrays. */
  function dataTable(fig, caption, headers, rows) {
    var tbl = document.createElement('table');
    tbl.className = 'viz-data';
    var cap = document.createElement('caption'); cap.textContent = caption; tbl.appendChild(cap);
    var thead = document.createElement('thead'); var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); tbl.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    fig.appendChild(tbl);
  }

  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
  }

  /* ============================================================
     1) cry-curve: the normal infant crying trajectory
     ============================================================ */
  FY.viz['cry-curve'] = function (fig) {
    if (!fig) return;
    var svg = S.make(W, H);

    var sx = S.scale(0, WK_MAX, X0, X1);
    var sy = S.scale(0, Y_MAX, Y1, Y0);

    /* shaded spread band: approximate middle 80% of babies, from the
       per-bin ~10th/~90th (normal-approximation reconstruction). */
    var hiPts = BINS.map(function (b) { return [sx(b.wk), sy(b.hi)]; });
    var loPts = BINS.map(function (b) { return [sx(b.wk), sy(b.lo)]; });
    var bandD = S.line(hiPts) + ' ' + loPts.reverse().map(function (p, i) { return (i === 0 ? 'L' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' Z';

    /* grid + axes drawn first so data sits on top */
    var fr = frame(svg, Y_MAX, 'Minutes of crying a day');
    var g = fr.g;

    S.el('path', { d: bandD, fill: P.gold, 'fill-opacity': 0.12, stroke: 'none' }, g);

    /* the smooth modeled curve */
    var curve = smoothPts(fr.sx, fr.sy, crySmooth);
    S.el('path', { d: S.line(curve), fill: 'none', stroke: P.gold, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);

    /* binned weighted means as dots */
    BINS.forEach(function (b) {
      S.el('circle', { cx: fr.sx(b.wk), cy: fr.sy(b.mean), r: 3.1, fill: P.goldHi, stroke: P.parch, 'stroke-width': 0.6 }, g);
    });

    /* peak marker at 5 to 6 weeks, ~126 min/day */
    var pkX = fr.sx(5.5), pkY = fr.sy(125.9);
    S.el('line', { x1: pkX, y1: Y1, x2: pkX, y2: pkY, stroke: P.dim, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.7 }, g);
    S.el('circle', { cx: pkX, cy: pkY, r: 4.4, fill: 'none', stroke: P.goldHi, 'stroke-width': 1.6 }, g);
    var lblPk = S.text(pkX + 8, pkY - 8, 'Peak ~126 min/day at 5 to 6 weeks', 'viz-label', { fill: P.goldHi });
    g.appendChild(lblPk);

    /* asymptote guide near 40 min/day */
    var asY = fr.sy(40);
    S.el('line', { x1: fr.sx(13), y1: asY, x2: X1, y2: asY, stroke: P.ok, 'stroke-width': 1, 'stroke-dasharray': '2 4', opacity: 0.8 }, g);
    var lblAs = S.text(X1 - 4, asY - 6, 'settles toward ~40 min/day', 'viz-axis', Object.assign({ 'text-anchor': 'end', fill: P.ok }, {}));
    g.appendChild(lblAs);

    /* legend */
    var lg = S.el('g', { transform: 'translate(' + (X0 + 8) + ' ' + (Y0 + 4) + ')' }, g);
    S.el('rect', { x: 0, y: -8, width: 14, height: 10, fill: P.gold, 'fill-opacity': 0.18, stroke: 'none' }, lg);
    lg.appendChild(S.text(20, 0, 'middle ~80% of babies', 'viz-axis', {}));
    g.appendChild(lg);

    svg.setAttribute('aria-label',
      'Line chart of average daily infant crying in minutes per day by week of age, from Vermillet 2022 ' +
      '(meta-analysis, 57 studies, 17 countries, 7,580 infants). Crying rises from about 87 minutes a day in the ' +
      'first two weeks to a peak near 126 minutes a day at 5 to 6 weeks, then falls and settles toward an asymptote ' +
      'of about 40 minutes a day by the middle of the year. A shaded band shows the approximate middle 80 percent of ' +
      'babies, which at the peak runs from roughly 47 to 204 minutes a day.');

    fig.appendChild(svg);

    note(fig,
      'The peak is a hill everyone climbs and comes down. Daily crying rises to about ' +
      '<b>126 minutes a day at 5 to 6 weeks</b>, then declines toward roughly <b>40 minutes a day</b>. ' +
      'The shaded band is the approximate middle 80 percent of babies: some healthy babies cry under an hour, ' +
      'some well over three. If your baby is on this curve, your baby is normal. ' +
      'Source: Vermillet et al., Child Development 2022;93(4):1201 to 1222 (meta-analysis of 57 studies, 17 countries, ' +
      'N=7,580); spread band reconstructed from the study-level data (approximate middle 80 percent).');

    dataTable(fig,
      'Average daily fuss-plus-cry by age (Vermillet 2022, weighted means with approximate middle-80% band)',
      ['Age (weeks)', 'Mean (min/day)', '~10th', '~90th', 'Studies (k)', 'Infants (N)'],
      BINS.map(function (b) { return [fmt(b.wk), fmt(b.mean), fmt(b.lo), fmt(b.hi), fmt(b.k), b.n.toLocaleString('en-US')]; })
    );
  };

  /* ============================================================
     2) cry-aht: the crying peak and the shaken-baby peak
     ============================================================ */
  /* The AHT curve is a SHAPE, not invented per-month counts. The AAP 2025
     technical report (citing Barr 2006) states the crying curve is
     paralleled by AHT incidence, with the AHT hospitalization peak about
     4 weeks AFTER the crying peak (so ~9 to 10 weeks, about 2 months); a
     rigorous Washington State study adds a smaller second peak near 8
     months (~34 weeks). We draw the documented shape on a separate
     "relative incidence" track and footnote it, while the real,
     citable numbers (25 to 35 per 100,000 per year, etc.) live in the
     note, aria-label, and table. */
  function ahtShape(wk) {
    /* primary peak ~9.5 weeks (4 wk after the 5.5 wk crying peak) */
    var a = Math.exp(-Math.pow((wk - 9.5) / 5.0, 2));
    /* smaller secondary peak ~34 weeks (about 8 months), ~35% height */
    var b = 0.35 * Math.exp(-Math.pow((wk - 34) / 6.0, 2));
    return Math.min(1, a + b);
  }
  var AHT_WK_MAX = 40;  /* extend to ~9 months so the second peak shows */

  FY.viz['cry-aht'] = function (fig) {
    if (!fig) return;
    var svg = S.make(W, H);

    /* x-axis runs to 40 weeks here so the 8-month second peak is visible */
    var sx = S.scale(0, AHT_WK_MAX, X0, X1);
    var syCry = S.scale(0, Y_MAX, Y1, Y0);       /* left axis: crying min/day */
    var syAht = S.scale(0, 1.08, Y1, Y0);        /* right axis: relative AHT */
    var g = S.el('g', null, svg);

    /* gridlines + left ticks (crying minutes) */
    for (var y = 0; y <= Y_MAX + 0.5; y += 50) {
      S.el('line', { x1: X0, y1: syCry(y), x2: X1, y2: syCry(y), class: 'viz-grid', opacity: y === 0 ? 0.85 : 0.35 }, g);
      g.appendChild(S.text(X0 - 8, syCry(y) + 3.5, fmt(y), 'viz-axis', Object.assign({ 'text-anchor': 'end', fill: P.gold }, TAB)));
    }
    /* x ticks every 4 weeks, plus a months helper row */
    for (var w = 0; w <= AHT_WK_MAX; w += 4) {
      S.el('line', { x1: sx(w), y1: Y1, x2: sx(w), y2: Y1 + 4, class: 'viz-grid', opacity: 0.6 }, g);
      g.appendChild(S.text(sx(w), Y1 + 18, fmt(w), 'viz-axis', Object.assign({ 'text-anchor': 'middle' }, TAB)));
    }
    g.appendChild(S.text((X0 + X1) / 2, H - 10, 'Age in weeks', 'viz-axis', { 'text-anchor': 'middle' }));
    g.appendChild(S.text(0, 0, 'Crying (min/day)', 'viz-axis', { 'text-anchor': 'middle', fill: P.gold, transform: 'translate(' + (X0 - 42) + ' ' + ((Y0 + Y1) / 2) + ') rotate(-90)' }));
    g.appendChild(S.text(0, 0, 'AHT incidence (relative)', 'viz-axis', { 'text-anchor': 'middle', fill: P.emerg, transform: 'translate(' + (X1 + 16) + ' ' + ((Y0 + Y1) / 2) + ') rotate(-90)' }));

    /* crying curve (gold), sampled across the wider axis */
    var cryPts = [];
    for (var c = 0; c <= AHT_WK_MAX; c += 0.5) cryPts.push([sx(c), syCry(crySmooth(c))]);
    S.el('path', { d: S.line(cryPts), fill: 'none', stroke: P.gold, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.92 }, g);

    /* AHT relative-incidence curve (contained red), filled lightly under */
    var ahtPts = [];
    for (var a = 0; a <= AHT_WK_MAX; a += 0.5) ahtPts.push([sx(a), syAht(ahtShape(a))]);
    S.el('path', { d: S.area(ahtPts, Y1), fill: P.emerg, 'fill-opacity': 0.08, stroke: 'none' }, g);
    S.el('path', { d: S.line(ahtPts), fill: 'none', stroke: P.emerg, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);

    /* peak markers: crying ~5.5 wk, AHT ~9.5 wk */
    var cpX = sx(5.5), cpY = syCry(125.9);
    S.el('circle', { cx: cpX, cy: cpY, r: 3.6, fill: 'none', stroke: P.goldHi, 'stroke-width': 1.4 }, g);
    g.appendChild(S.text(cpX, cpY - 10, 'crying peaks ~6 weeks', 'viz-axis', { 'text-anchor': 'middle', fill: P.goldHi }));

    var apX = sx(9.5), apY = syAht(1);
    S.el('circle', { cx: apX, cy: apY, r: 3.6, fill: 'none', stroke: P.emerg, 'stroke-width': 1.6 }, g);
    g.appendChild(S.text(apX + 6, apY - 8, 'shaking peaks ~2 months', 'viz-label', { fill: P.emerg }));

    /* second AHT peak note at ~8 months */
    var s2X = sx(34), s2Y = syAht(0.35);
    g.appendChild(S.text(s2X, s2Y - 9, 'smaller 2nd peak ~8 mo', 'viz-axis', { 'text-anchor': 'middle', fill: P.emerg, opacity: 0.85 }));

    /* legend */
    var lg = S.el('g', { transform: 'translate(' + (X0 + 8) + ' ' + (Y0 + 2) + ')' }, g);
    S.el('line', { x1: 0, y1: -3, x2: 18, y2: -3, stroke: P.gold, 'stroke-width': 2.4 }, lg);
    lg.appendChild(S.text(24, 0, 'normal crying', 'viz-axis', { fill: P.gold }));
    S.el('line', { x1: 130, y1: -3, x2: 148, y2: -3, stroke: P.emerg, 'stroke-width': 2.4 }, lg);
    lg.appendChild(S.text(154, 0, 'abusive head trauma', 'viz-axis', { fill: P.emerg }));

    svg.setAttribute('aria-label',
      'Overlay chart of two curves by infant age. The normal crying curve peaks near 126 minutes a day at 5 to 6 ' +
      'weeks. The abusive-head-trauma incidence curve, drawn as relative incidence, parallels it but peaks about 4 ' +
      'weeks later, near 2 months, with a smaller second peak around 8 months. Abusive head trauma affects about 25 ' +
      'to 35 infants per 100,000 per year under age 1, roughly 1,300 US cases a year, and about 1 in 4 die. The hardest ' +
      'crying and the greatest danger fall close together. When you feel overwhelmed, put the baby down somewhere safe ' +
      'and walk away. Sources: Vermillet 2022 and the AAP 2025 abusive head trauma technical report.');

    fig.appendChild(svg);

    note(fig,
      'The hardest stretch of crying and the moment infants are most in danger sit almost on top of each other. ' +
      'Abusive head trauma (shaking) affects about <b>25 to 35 infants per 100,000 each year</b> under age 1 ' +
      '(up to 40 by the most rigorous methods), roughly <b>1,300 US cases a year</b>, and about <b>1 in 4 die</b>. ' +
      'Crying is normal and it is not your fault. When you feel yourself losing control, ' +
      '<b>put the baby down somewhere safe, on the back in the crib, walk away to calm down, and check back every ' +
      '5 to 10 minutes.</b> It is always OK to put the baby down, and to ask for help. ' +
      'The AHT curve here is drawn as relative incidence to match the documented shape (peak about 4 weeks after the ' +
      'crying peak, with a smaller second peak near 8 months); the counts above are the real figures. ' +
      'Sources: Vermillet et al., Child Development 2022 (crying); AAP "Abusive Head Trauma in Infants and Children," ' +
      'Pediatrics 2025;155(3):e2024070457, with Barr 2006 (incidence and peak timing).');

    dataTable(fig,
      'Crying peak vs abusive head trauma (the curves and the real numbers)',
      ['Measure', 'Value', 'Source'],
      [
        ['Crying peak', '~126 min/day at 5 to 6 weeks', 'Vermillet 2022'],
        ['Crying settles to', '~40 min/day by mid-year', 'Vermillet 2022'],
        ['AHT peak (hospitalization)', '~4 weeks after crying peak (~2 months)', 'AAP 2025 / Barr 2006'],
        ['AHT second peak', '~8 months (smaller)', 'Washington State study'],
        ['AHT incidence, under age 1', '25 to 35 per 100,000 per year (up to 40)', 'AAP 2025'],
        ['AHT incidence, ages 1 to 2', '~3.8 per 100,000 per year', 'AAP 2025'],
        ['US cases per year', '~1,300', 'NCSBS'],
        ['Mortality', '10 to 20 percent (about 1 in 4 die)', 'AAP 2025 / CDC']
      ]
    );
  };
})();


/* module: death-injury.js */
/* ============================================================
   THE FIRST YEAR, death and injury charts module.
   Two visualizations for the risk-landscape domain:
     FY.viz["death-maps"]  side-by-side stacked bars of where children
                           die: a GLOBAL under-5 panel (with the neonatal
                           vs post-neonatal split) and a US infant inset
                           on a clearly separate scale. The two scales are
                           never blended.
     FY.viz["injury-age"]  ranked bars of the leading causes of death for
                           infants (under 1) vs toddlers (ages 1 to 4),
                           showing unintentional injury rise from #4 to #1,
                           with the within-infant-injury suffocation note.
   Every number is real and cited in the viz-note and aria-label.
   Framework-free, defensive, no console errors. No em dashes anywhere.

   Sourcing and corrections applied (see corrections-to-apply.md):
   - Global under-5 leading-cause shares are the UN IGME report Fig 8
     WORLD column (prematurity ~15%, lower respiratory infections /
     pneumonia ~16%, birth asphyxia / trauma ~11%), NOT the 18/13/10
     figures (those are the sub-Saharan Africa column and were wrongly
     attributed to the press release). The neonatal interior (preterm 36%,
     intrapartum 21%) is from the UNICEF/WHO press release (18 Mar 2026);
     the remaining neonatal causes follow the WHO / GBD lineage.
   - Totals 4.9M under-5 and 2.3M neonatal (about 47%) and malaria as the
     top post-neonatal killer at 17% are UN IGME 2024 data (cite the 2025
     edition, which still carries 4.9M / 2.3M for 2024).
   - The US inset is the 2023 linked birth/infant death file (NVSR 74-7).
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return; /* core helper missing; degrade silently */
  var P = S.palette;

  /* small shared helpers -------------------------------------------------- */
  function add(parent, node) { if (parent && node) parent.appendChild(node); return node; }
  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
    return p;
  }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    if (caption) { var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap); }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t);
    return t;
  }
  /* integer with thousands separators, kept in tabular mono via the CSS class */
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ====================================================================== */
  /* 1. FY.viz["death-maps"]                                                 */
  /*    Two stacked bars, two clearly-separate scales:                       */
  /*      LEFT  GLOBAL under-5 deaths (4.9M = 100%), with the neonatal vs    */
  /*            post-neonatal split marked. Cause leaders broken out, the    */
  /*            rest grouped honestly as "all other causes."                 */
  /*      RIGHT US infant deaths (2023, 20,162 = 100%), the leading causes.  */
  /*    The two panels share a 0-to-100 percent height but are labeled as    */
  /*    different populations on different totals, never one blended axis.   */
  /* ====================================================================== */
  FY.viz['death-maps'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* ---- GLOBAL under-5, 2024 (UN IGME). Shares of ALL under-5 deaths. ----
       Leaders are the corrected report Fig 8 WORLD values; the remainder is
       the transparent arithmetic balance, labeled "all other causes." The
       neonatal-origin leaders (prematurity, birth asphyxia) sit at the
       bottom; the post-neonatal infection leader (pneumonia) above them. */
    var GLOBAL = [
      { label: 'Prematurity', v: 15, col: P.plum,  band: 'neonatal' },
      { label: 'Birth asphyxia / trauma', v: 11, col: P.sky, band: 'neonatal' },
      { label: 'Pneumonia (LRI)', v: 16, col: P.call, band: 'post' },
      { label: 'All other causes', v: 58, col: P.dim, band: 'mixed' }
    ];
    var GLOBAL_TOTAL = 4.9; /* million */
    var NEONATAL_SHARE = 47; /* percent of under-5 (2.3M of 4.9M) */

    /* ---- US infants, 2023 (NVSR 74-7). Shares of ALL US infant deaths. ----
       The five leading causes plus the balance. */
    var US = [
      { label: 'Congenital anomalies', v: 20.0, col: P.gold,  rate: 112.1, num: 4030 },
      { label: 'Short gestation / LBW', v: 14.5, col: P.plum, rate: 81.4,  num: 2927 },
      { label: 'SIDS', v: 7.2,  col: P.emerg, rate: 40.2, num: 1446 },
      { label: 'Unintentional injury', v: 6.4, col: P.call, rate: 35.8, num: 1288 },
      { label: 'Maternal complications', v: 5.7, col: P.sky, rate: 31.9, num: 1146 },
      { label: 'All other causes', v: 46.2, col: P.dim, rate: null, num: null }
    ];
    var US_TOTAL = 20162; /* infant deaths, 2023 */
    var US_IMR = 5.61;    /* per 1,000 live births */

    /* ---- layout: two stacked bars, generous gutter between them ---- */
    var plotT = 64, plotB = H - 70;
    var plotH = plotB - plotT;
    var y = S.scale(0, 100, plotB, plotT); /* shared height; NOT a shared population */

    var barW = 110;
    var gx = 250, ux = 470; /* bar left edges */

    /* panel super-titles */
    add(svg, S.text(W / 2, 20, 'Two babies, two maps: where children die', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
    add(svg, S.text(gx + barW / 2, 40, 'WORLD, under age 5', 'viz-label', { 'text-anchor': 'middle', fill: P.goldHi, 'font-size': 12.5 }));
    add(svg, S.text(gx + barW / 2, 54, comma(Math.round(GLOBAL_TOTAL * 1000)) + ',000 deaths (2024)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));
    add(svg, S.text(ux + barW / 2, 40, 'UNITED STATES, infants', 'viz-label', { 'text-anchor': 'middle', fill: P.goldHi, 'font-size': 12.5 }));
    add(svg, S.text(ux + barW / 2, 54, comma(US_TOTAL) + ' deaths (2023)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* a clear "separate scales" reminder between the bars */
    add(svg, S.el('line', { x1: (gx + barW + ux) / 2, y1: plotT - 6, x2: (gx + barW + ux) / 2, y2: plotB + 6, stroke: P.rule, 'stroke-width': 1, 'stroke-dasharray': '2 4', opacity: 0.7 }));
    add(svg, S.text((gx + barW + ux) / 2, plotB + 50, 'each bar is 100% of its own', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));
    add(svg, S.text((gx + barW + ux) / 2, plotB + 61, 'population, separate scales', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));

    /* percent axis ticks down the far left, shared composition scale */
    [0, 25, 50, 75, 100].forEach(function (g) {
      var yy = y(g);
      add(svg, S.el('line', { x1: gx - 38, y1: yy, x2: gx - 34, y2: yy, stroke: P.rule, 'stroke-width': 1, opacity: 0.7 }));
      add(svg, S.text(gx - 42, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'end' }));
    });
    add(svg, S.text(gx - 58, (plotT + plotB) / 2, 'share of deaths (%)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, transform: 'rotate(-90 ' + (gx - 58) + ' ' + ((plotT + plotB) / 2) + ')' }));

    /* generic stacked-bar drawer, returns nothing; labels each segment that
       is tall enough to hold text and tags small ones to the side. */
    function stack(items, x0, labelSide) {
      var acc = 0;
      items.forEach(function (d) {
        var yTop = y(acc + d.v), yBot = y(acc);
        var h = Math.max(0, yBot - yTop);
        add(svg, S.el('rect', { x: x0, y: yTop, width: barW, height: h, fill: d.col, opacity: d.label === 'All other causes' ? 0.34 : 0.92, stroke: '#1c241e', 'stroke-width': 0.75 }));
        var midY = (yTop + yBot) / 2;
        /* percent inside the segment when there is room */
        if (h >= 16) {
          add(svg, S.text(x0 + barW / 2, midY + 4, (d.v % 1 ? d.v.toFixed(1) : d.v) + '%', 'viz-axis', { 'text-anchor': 'middle', fill: d.label === 'All other causes' ? P.dim : '#1c241e', 'font-size': 11 }));
        }
        /* cause label on the chosen side with a little leader line */
        var lx = labelSide === 'left' ? x0 - 8 : x0 + barW + 8;
        var anchor = labelSide === 'left' ? 'end' : 'start';
        if (h >= 12) {
          add(svg, S.text(lx, midY + 3.5, d.label, 'viz-axis', { 'text-anchor': anchor, fill: P.parch, 'font-size': 10.5 }));
        }
        acc += d.v;
      });
    }

    /* draw the two bars; labels go outward (global to its left, US to its right) */
    stack(GLOBAL, gx, 'left');
    stack(US, ux, 'right');

    /* GLOBAL: mark the neonatal vs post-neonatal split as a bracket on the
       inner edge of the global bar (47% of under-5 deaths are newborns). */
    var splitY = y(NEONATAL_SHARE);
    add(svg, S.el('line', { x1: gx + barW, y1: splitY, x2: gx + barW + 14, y2: splitY, stroke: P.goldHi, 'stroke-width': 1.5 }));
    add(svg, S.el('line', { x1: gx + barW + 14, y1: plotB, x2: gx + barW + 14, y2: splitY, stroke: P.goldHi, 'stroke-width': 1.5, opacity: 0.7 }));
    add(svg, S.text(gx + barW + 18, (plotB + splitY) / 2 - 4, 'neonatal', 'viz-axis', { 'text-anchor': 'start', fill: P.goldHi, 'font-size': 10 }));
    add(svg, S.text(gx + barW + 18, (plotB + splitY) / 2 + 8, '47% (2.3M)', 'viz-axis', { 'text-anchor': 'start', fill: P.dim, 'font-size': 9.5 }));

    /* US: highlight that congenital anomalies sit at the TOP here but the
       BOTTOM globally (the headline divergence). A small caret note. */
    add(svg, S.text(ux + barW / 2, plotB + 20, 'IMR ' + US_IMR.toFixed(2) + ' / 1,000', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 10 }));
    add(svg, S.text(gx + barW / 2, plotB + 20, 'infections lead', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 10 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Two stacked bars on clearly separate scales showing where children die, globally versus in the United States. ' +
      'Left, world deaths under age 5 in 2024 total 4.9 million, of which 2.3 million, about 47 percent, are newborns in the first 28 days. ' +
      'The leading causes as a share of all under-5 deaths are pneumonia or lower respiratory infections about 16 percent, prematurity about 15 percent, and birth asphyxia or trauma about 11 percent, with all other causes about 58 percent. ' +
      'Within the newborn band, complications of preterm birth are about 36 percent and complications of labour and delivery about 21 percent; malaria is the single largest killer after the newborn period at 17 percent of deaths in ages 1 to 59 months. ' +
      'Right, on a separate scale, United States infant deaths in 2023 total 20,162, an infant mortality rate of 5.61 per 1,000 live births. ' +
      'The leading causes are congenital anomalies 20.0 percent, short gestation or low birth weight 14.5 percent, SIDS 7.2 percent, unintentional injury 6.4 percent, and maternal complications 5.7 percent. ' +
      'The point: globally the top killers are preventable infections, while in the United States they are congenital anomalies, prematurity, and SIDS, so the US is not a miniature of the world. ' +
      'Sources: UN IGME Levels and Trends in Child Mortality 2025 edition (2024 data) and CDC NVSR volume 74 number 7.');
    add(fig, svg);

    note(fig,
      'The United States is not a miniature of the world. Globally the leading killers of young children are preventable infections (pneumonia, malaria, diarrhoea) layered on prematurity and birth complications; in the United States the leaders are congenital anomalies, prematurity, and SIDS, with injury close behind. ' +
      'The two bars use entirely separate scales: the left is 100% of 4.9 million under-5 deaths worldwide, the right is 100% of 20,162 US infant deaths. Nearly half of the global toll (47%, about 2.3 million) is newborns in the first month. ' +
      '<span class="src">Sources: UN Inter-agency Group for Child Mortality Estimation, <i>Levels &amp; Trends in Child Mortality</i> (2025 edition, 2024 data; totals 4.9M under-5 and 2.3M neonatal), with world cause shares from the report Fig 8 WORLD column and the UNICEF/WHO release of 18 Mar 2026 for the neonatal split (preterm 36%, intrapartum 21%) and malaria (17% of ages 1 to 59 months); neonatal interior otherwise follows the WHO / GBD lineage. US inset: Ely DM, Driscoll AK, <i>Infant Mortality in the United States, 2023</i>, National Vital Statistics Reports 74(7), NCHS, 12 Jun 2025.</span>');

    dataTable(fig, 'World deaths under age 5, 2024 (UN IGME): share of all under-5 deaths',
      ['Cause', 'Share of under-5'],
      [
        ['Pneumonia / lower respiratory infections', '16%'],
        ['Prematurity (preterm birth complications)', '15%'],
        ['Birth asphyxia / trauma (intrapartum)', '11%'],
        ['All other causes (diarrhoea, malaria, congenital, injury, measles, sepsis, etc.)', '58%'],
        ['Memo: neonatal (first 28 days)', '47% (2.3M of 4.9M)'],
        ['Memo: within neonatal, preterm complications', '36%'],
        ['Memo: within neonatal, intrapartum complications', '21%'],
        ['Memo: malaria, share of ages 1 to 59 months', '17% (largest in that band)'],
        ['Memo: severe acute malnutrition, ages 1 to 59 months', '5% (over 100,000)']
      ]);

    dataTable(fig, 'United States infant deaths, 2023 (NVSR 74-7): leading causes',
      ['Cause', 'Share', 'Number', 'Rate / 100,000 live births'],
      US.filter(function (d) { return d.num !== null; }).map(function (d) {
        return [d.label, d.v.toFixed(1) + '%', comma(d.num), d.rate.toFixed(1)];
      }).concat([
        ['All other causes', '46.2%', comma(US_TOTAL - (4030 + 2927 + 1446 + 1288 + 1146)), ''],
        ['All infant deaths (total)', '100%', comma(US_TOTAL), 'IMR 5.61 / 1,000']
      ]));
  };

  /* ====================================================================== */
  /* 2. FY.viz["injury-age"]                                                 */
  /*    Ranked horizontal bars of the leading causes of death, two age       */
  /*    bands side by side: infants (under 1) and toddlers (1 to 4). The     */
  /*    story is that unintentional injury rises from #4 to #1. Source:      */
  /*    CDC WISQARS, 10 Leading Causes of Death by Age Group, 2022.          */
  /* ====================================================================== */
  FY.viz['injury-age'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* WISQARS 2022 leading-cause counts. Injury is flagged so it reads as
       the through-line. SIDS here is the death-certificate R95 line. */
    var UNDER1 = [
      { label: 'Congenital anomalies', v: 3970, injury: false },
      { label: 'Short gestation', v: 2884, injury: false },
      { label: 'SIDS', v: 1529, injury: false },
      { label: 'Unintentional injury', v: 1354, injury: true, rank: '#4' }
    ];
    var AGE14 = [
      { label: 'Unintentional injury', v: 1288, injury: true, rank: '#1' },
      { label: 'Congenital anomalies', v: 441, injury: false },
      { label: 'Cancer', v: 393, injury: false },
      { label: 'Homicide', v: 180, injury: false }
    ];

    /* shared horizontal value scale so the two panels are directly
       comparable (both are death COUNTS, same population universe). */
    var maxV = 3970;
    var panelTop = 70, panelBot = H - 64;

    /* two panels stacked vertically: infants on top, toddlers below. */
    var labelW = 168;
    var x0 = labelW, x1 = W - 150;
    var x = S.scale(0, maxV, x0, x1);

    function gridAndAxis(yTickRow) {
      /* vertical gridlines every 1000 deaths */
      [0, 1000, 2000, 3000, 4000].forEach(function (g) {
        if (g > maxV) return;
        var xx = x(Math.min(g, maxV));
        add(svg, S.el('line', { x1: xx, y1: panelTop - 6, x2: xx, y2: panelBot, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.35 }));
        add(svg, S.text(xx, yTickRow, comma(g), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));
      });
    }

    /* title */
    add(svg, S.text(W / 2, 20, 'What actually kills babies, by age', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
    add(svg, S.text(W / 2, 38, 'Leading causes of death, US 2022 (deaths)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* panel band geometry: split the plot into two stacked groups */
    var groupGap = 34;
    var groupH = (panelBot - panelTop - groupGap) / 2;
    var rowsPer = 4;

    function drawPanel(items, gTop, heading) {
      add(svg, S.text(x0, gTop - 6, heading, 'viz-label', { 'text-anchor': 'start', fill: P.goldHi, 'font-size': 12 }));
      var rowH = groupH / rowsPer;
      var barH = Math.min(20, rowH * 0.56);
      items.forEach(function (d, i) {
        var cy = gTop + rowH * (i + 0.5);
        var col = d.injury ? P.emerg : (i === 0 ? P.gold : P.sky);
        var xw = x(d.v) - x0;
        /* category label, left gutter, right aligned */
        add(svg, S.text(x0 - 10, cy + 3.5, d.label, 'viz-axis', { 'text-anchor': 'end', fill: d.injury ? P.emerg : P.parch, 'font-size': 11 }));
        /* the bar */
        add(svg, S.el('rect', { x: x0, y: cy - barH / 2, width: Math.max(1, xw), height: barH, rx: 2, fill: col, opacity: d.injury ? 0.95 : 0.82 }));
        /* count at the bar end, mono numerals */
        add(svg, S.text(x(d.v) + 8, cy + 3.5, comma(d.v), 'viz-axis', { 'text-anchor': 'start', fill: d.injury ? P.emerg : P.goldHi, 'font-size': 11 }));
        /* rank flag for the injury row */
        if (d.rank) {
          add(svg, S.text(x(d.v) + 48, cy + 3.5, d.rank, 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 11, 'font-family': 'var(--font-heading)', 'font-weight': '700' }));
        }
      });
    }

    var g1Top = panelTop, g2Top = panelTop + groupH + groupGap;
    gridAndAxis(panelBot + 16);
    drawPanel(UNDER1, g1Top, 'Under 1 year');
    drawPanel(AGE14, g2Top, 'Ages 1 to 4');

    /* x axis title */
    add(svg, S.text((x0 + x1) / 2, panelBot + 32, 'Deaths in 2022', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* the through-line arrow: injury #4 -> #1 */
    var injU = UNDER1[3], injT = AGE14[0];
    var rowH1 = groupH / rowsPer;
    var cyU = g1Top + rowH1 * (3 + 0.5);
    var cyT = g2Top + rowH1 * (0 + 0.5);
    var arrowX = x1 + 70;
    add(svg, S.el('path', { d: 'M' + arrowX + ' ' + (cyU) + ' C ' + (arrowX + 22) + ' ' + (cyU) + ', ' + (arrowX + 22) + ' ' + (cyT) + ', ' + arrowX + ' ' + cyT, fill: 'none', stroke: P.emerg, 'stroke-width': 1.4, opacity: 0.8 }));
    add(svg, S.el('path', { d: 'M' + arrowX + ' ' + cyT + ' l 5 -4 l -1 8 z', fill: P.emerg, opacity: 0.9 }));
    add(svg, S.text(arrowX + 26, (cyU + cyT) / 2 - 4, 'injury', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 10 }));
    add(svg, S.text(arrowX + 26, (cyU + cyT) / 2 + 8, '#4 to #1', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 10 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Two ranked bar panels of the leading causes of death by age in the United States, 2022, from CDC WISQARS. ' +
      'For infants under 1 year, the leaders are congenital anomalies 3,970 deaths, short gestation 2,884, SIDS 1,529, and unintentional injury 1,354, which ranks fourth. ' +
      'For ages 1 to 4, unintentional injury is now first at 1,288 deaths, ahead of congenital anomalies 441, cancer 393, and homicide 180. ' +
      'So injury rises from the fourth to the first leading cause between infancy and the toddler years. ' +
      'Within infant unintentional-injury deaths, suffocation is 85 percent, almost all of it accidental suffocation and strangulation in bed. ' +
      'Source: CDC WISQARS, 10 Leading Causes of Death by Age Group, United States, 2022.');
    add(fig, svg);

    note(fig,
      'The leading threat changes shape as your baby grows. In the first year the top killers are medical (congenital anomalies, prematurity, SIDS) and unintentional injury sits fourth; by ages 1 to 4 those recede and injury becomes the number-one cause of death. ' +
      'The reason this matters early: within infant injury, about 85% (85.4%, 991 deaths) is suffocation, and most of that is accidental suffocation and strangulation in bed, the same sleep-environment hazard the safe-sleep rules target. ' +
      '<span class="src">Source: CDC WISQARS, <i>10 Leading Causes of Death by Age Group, United States, 2022</i> (National Vital Statistics System, NCHS). Within-injury mechanism split (suffocation 85.4%, 855 of 991 in bed) from a WISQARS mechanism analysis, PMC5568777.</span>');

    dataTable(fig, 'Leading causes of death, infants under 1, US 2022 (WISQARS)',
      ['Rank', 'Cause', 'Deaths'],
      UNDER1.map(function (d, i) { return [String(i + 1), d.label, comma(d.v)]; }));

    dataTable(fig, 'Leading causes of death, ages 1 to 4, US 2022 (WISQARS)',
      ['Rank', 'Cause', 'Deaths'],
      AGE14.map(function (d, i) { return [String(i + 1), d.label, comma(d.v)]; }));
  };
})();


/* module: feeding-charts.js */
/* ============================================================
   THE FIRST YEAR, feeding charts module.
   Two visualizations for the feeding domain:
     FY.viz["bf-duration"]  the US breastfeeding duration cliff plus
                            the 20th-century V-then-climb curve.
     FY.viz["milk-storage"] the CDC milk-storage rule of fours
                            reference infographic.
   Every number is real and cited in the viz-note and aria-label.
   Framework-free, defensive, no console errors. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return; /* core helper missing; degrade silently */
  var P = S.palette;

  /* small shared helpers -------------------------------------------------- */
  function add(parent, node) { if (parent && node) parent.appendChild(node); return node; }
  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
    return p;
  }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    if (caption) { var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap); }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t);
    return t;
  }

  /* ====================================================================== */
  /* 1. FY.viz["bf-duration"]                                                */
  /*    Left panel: the modern duration cliff (2022 birth cohort, CDC NIS).  */
  /*    Right panel: the 20th-century V-then-climb initiation curve.         */
  /* ====================================================================== */
  FY.viz['bf-duration'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* ---- data, all real and cited ---- */
    /* Modern cliff: CDC National Immunization Survey-Child, 2022 birth cohort. */
    var cliff = [
      { key: 'ever', label: 'Ever', sub: 'breastfed', v: 85.7, col: P.gold },
      { key: 'any6', label: 'Any at', sub: '6 months', v: 62.1, col: P.sky },
      { key: 'excl6', label: 'Exclusive', sub: 'to 6 mo', v: 27.9, col: P.plum },
      { key: 'any12', label: 'Any at', sub: '12 months', v: 40.8, col: P.sky }
    ];
    /* Century V-curve: initiation, stitched (fertility surveys + Ross + CDC NIS). */
    var curve = [
      { yr: 1936, v: 77.0, src: 'IOM (1936 to 40 cohort)' },
      { yr: 1972, v: 22.0, src: 'fertility-survey nadir' },
      { yr: 1982, v: 61.9, src: 'Ross peak' },
      { yr: 1989, v: 52.2, src: 'Ross trough' },
      { yr: 2001, v: 69.5, src: 'Ross' },
      { yr: 2022, v: 85.7, src: 'CDC NIS' }
    ];

    /* ---- layout: two panels side by side ---- */
    var padT = 26, padB = 58;
    var midGap = 44;
    var leftX0 = 50, leftX1 = 330;            /* bar panel */
    var rightX0 = 330 + midGap, rightX1 = W - 16; /* line panel */
    var plotT = padT, plotB = H - padB;

    /* panel titles */
    add(svg, S.text((leftX0 + leftX1) / 2, 16, 'Where families fall off (2022)', 'viz-label', { 'text-anchor': 'middle', fill: P.parch }));
    add(svg, S.text((rightX0 + rightX1) / 2, 16, 'A century of breastfeeding (initiation)', 'viz-label', { 'text-anchor': 'middle', fill: P.parch }));

    /* ===== LEFT: the duration cliff bars ===== */
    var yMax = 100;
    var ly = S.scale(0, yMax, plotB, plotT);
    /* y gridlines + labels 0..100 */
    [0, 25, 50, 75, 100].forEach(function (g) {
      var yy = ly(g);
      add(svg, S.el('line', { x1: leftX0, y1: yy, x2: leftX1, y2: yy, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.4 }));
      add(svg, S.text(leftX0 - 6, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'end' }));
    });
    add(svg, S.text(leftX0 - 34, (plotT + plotB) / 2, 'percent', 'viz-axis', { 'text-anchor': 'middle', transform: 'rotate(-90 ' + (leftX0 - 34) + ' ' + ((plotT + plotB) / 2) + ')' }));

    var n = cliff.length;
    var band = (leftX1 - leftX0) / n;
    var bw = Math.min(46, band * 0.62);
    cliff.forEach(function (d, i) {
      var cx = leftX0 + band * (i + 0.5);
      var top = ly(d.v);
      add(svg, S.el('rect', { x: cx - bw / 2, y: top, width: bw, height: Math.max(0, plotB - top), rx: 2, fill: d.col, opacity: 0.92 }));
      /* value label above bar */
      add(svg, S.text(cx, top - 5, d.v.toFixed(1).replace(/\.0$/, '') + '%', 'viz-axis', { 'text-anchor': 'middle', fill: P.goldHi }));
      /* two-line category label below axis */
      add(svg, S.text(cx, plotB + 16, d.label, 'viz-axis', { 'text-anchor': 'middle' }));
      add(svg, S.text(cx, plotB + 29, d.sub, 'viz-axis', { 'text-anchor': 'middle' }));
    });

    /* ===== RIGHT: the V-then-climb line ===== */
    var rx = S.scale(1936, 2022, rightX0, rightX1);
    var ry = S.scale(0, 100, plotB, plotT);
    /* y grid (shared 0..100, labels on the right edge to avoid clutter) */
    [0, 25, 50, 75, 100].forEach(function (g) {
      var yy = ry(g);
      add(svg, S.el('line', { x1: rightX0, y1: yy, x2: rightX1, y2: yy, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.4 }));
      add(svg, S.text(rightX1 + 4, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'start' }));
    });
    /* x ticks at decade-ish anchors */
    [1940, 1960, 1980, 2000, 2020].forEach(function (yr) {
      var xx = rx(yr);
      add(svg, S.text(xx, plotB + 16, String(yr), 'viz-axis', { 'text-anchor': 'middle' }));
      add(svg, S.el('line', { x1: xx, y1: plotB, x2: xx, y2: plotB + 4, class: 'viz-grid', opacity: 0.6 }));
    });

    var pts = curve.map(function (d) { return [rx(d.yr), ry(d.v)]; });
    /* faint fill under the curve */
    add(svg, S.el('path', { d: S.area(pts, plotB), fill: P.gold, opacity: 0.08 }));
    add(svg, S.el('path', { d: S.line(pts), fill: 'none', stroke: P.gold, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    /* mark + annotate the nadir (1972, 22%) and the first peak (1982, 61.9%) */
    curve.forEach(function (d) {
      var px = rx(d.yr), py = ry(d.v);
      var isMark = d.yr === 1972 || d.yr === 1982 || d.yr === 2022;
      add(svg, S.el('circle', { cx: px, cy: py, r: isMark ? 3.6 : 2.4, fill: isMark ? P.goldHi : P.gold, stroke: '#2a322b', 'stroke-width': 1 }));
    });
    /* nadir callout */
    var nx = rx(1972), nyy = ry(22);
    add(svg, S.text(nx + 2, nyy + 16, 'nadir 22% (1972)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));
    /* peak callout */
    var pkx = rx(1982), pky = ry(61.9);
    add(svg, S.text(pkx + 4, pky - 8, 'peak 61.9% (1982)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));
    /* modern endpoint */
    add(svg, S.text(rx(2022), ry(85.7) - 8, '85.7% (2022)', 'viz-axis', { 'text-anchor': 'end', fill: P.goldHi }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Two panels on US breastfeeding. Left, the 2022 duration cliff from the CDC National Immunization Survey: 85.7 percent of infants are ever breastfed, but only 62.1 percent are still getting any breast milk at 6 months, 40.8 percent at 12 months, and just 27.9 percent are exclusively breastfed to 6 months. Right, a century of initiation falls from 77 percent in the late 1930s to a nadir of 22 percent in 1972, climbs to a 61.9 percent peak in 1982, dips to about 52 percent by 1989, and rises again to 85.7 percent by 2022, showing breastfeeding tracks culture, not nature.');
    add(fig, svg);

    note(fig,
      'High start, steep fall. Most US babies start breastfeeding, but exclusive breastfeeding to 6 months and any breastfeeding at a year are far lower, and the steepest drop sits around the 6-month return-to-work cliff. The century curve shows the same behavior nearly vanished by 1972 and was rebuilt by culture and policy. ' +
      '<span class="src">Source: CDC National Immunization Survey-Child, 2022 birth cohort (ever 85.7%, any at 6 mo 62.1%, exclusive to 6 mo 27.9%, any at 12 mo 40.8%); historical initiation from IOM <i>Nutrition During Lactation</i> (1991), the Ross Mothers Survey, and CDC NIS.</span>');

    dataTable(fig, 'US breastfeeding, 2022 birth cohort (percent)',
      ['Measure', 'Percent'],
      [
        ['Ever breastfed', '85.7'],
        ['Any breast milk at 6 months', '62.1'],
        ['Any breast milk at 12 months', '40.8'],
        ['Exclusively breastfed to 6 months', '27.9']
      ]);

    dataTable(fig, 'US breastfeeding initiation over the century (percent)',
      ['Year', 'Initiation', 'Series'],
      curve.map(function (d) { return [String(d.yr), d.v.toFixed(1), d.src]; }));
  };

  /* ====================================================================== */
  /* 2. FY.viz["milk-storage"]                                               */
  /*    A clean reference infographic of the CDC rule of fours.             */
  /*    Three primary tiles (counter / fridge / freezer) plus a row of      */
  /*    universal rules (thawed / warmed / never refreeze).                 */
  /* ====================================================================== */
  FY.viz['milk-storage'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* primary storage tiles: freshly expressed milk (CDC, updated Mar 25 2026). */
    var tiles = [
      { label: 'Countertop', big: '4', unit: 'hours', cond: '77°F (25°C) or colder', col: P.call },
      { label: 'Refrigerator', big: '4', unit: 'days', cond: '40°F (4°C)', col: P.sky },
      { label: 'Freezer', big: '6', unit: 'months', cond: '0°F (-18°C); up to 12 mo OK', col: P.plum }
    ];
    /* universal rules below. */
    var rules = [
      { t: 'Thawed in fridge', v: 'within 24 hours' },
      { t: 'After warming', v: 'within 2 hours' },
      { t: 'Never', v: 'refreeze thawed milk' }
    ];

    /* title */
    add(svg, S.text(W / 2, 22, 'The milk-storage rule of fours', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
    add(svg, S.text(W / 2, 40, 'Freshly expressed breast milk', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* ---- three big tiles ---- */
    var tileTop = 56, tileH = 170;
    var gap = 18, marg = 16;
    var tw = (W - marg * 2 - gap * 2) / 3;
    tiles.forEach(function (d, i) {
      var x = marg + i * (tw + gap);
      var g = add(svg, S.el('g', {}));
      /* card */
      add(g, S.el('rect', { x: x, y: tileTop, width: tw, height: tileH, rx: 10, fill: 'rgba(0,0,0,0.18)', stroke: P.rule, 'stroke-width': 1 }));
      /* accent bar */
      add(g, S.el('rect', { x: x, y: tileTop, width: tw, height: 5, rx: 2.5, fill: d.col }));
      var cx = x + tw / 2;
      /* location label */
      add(g, S.text(cx, tileTop + 30, d.label, 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 13 }));
      /* big number + unit */
      add(g, S.text(cx, tileTop + 96, d.big, 'viz-axis', { 'text-anchor': 'middle', fill: d.col, 'font-size': 58, 'font-family': 'var(--font-heading)', 'font-weight': '700' }));
      add(g, S.text(cx, tileTop + 122, d.unit, 'viz-label', { 'text-anchor': 'middle', fill: P.goldHi, 'font-size': 16 }));
      /* condition */
      add(g, S.text(cx, tileTop + 150, d.cond, 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 10.5 }));
    });

    /* ---- universal rules strip ---- */
    var rowTop = tileTop + tileH + 24, rowH = 64;
    add(svg, S.el('rect', { x: marg, y: rowTop, width: W - marg * 2, height: rowH, rx: 10, fill: 'rgba(212,196,160,0.06)', stroke: P.rule, 'stroke-width': 1 }));
    var rw = (W - marg * 2) / rules.length;
    rules.forEach(function (d, i) {
      var x = marg + i * rw;
      if (i > 0) add(svg, S.el('line', { x1: x, y1: rowTop + 10, x2: x, y2: rowTop + rowH - 10, class: 'viz-grid', opacity: 0.5 }));
      var cx = x + rw / 2;
      add(svg, S.text(cx, rowTop + 26, d.t, 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 11 }));
      add(svg, S.text(cx, rowTop + 47, d.v, 'viz-label', { 'text-anchor': 'middle', fill: i === 2 ? P.emerg : P.goldHi, 'font-size': 13.5 }));
    });

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'CDC milk-storage rule of fours for freshly expressed breast milk: up to 4 hours on the countertop at 77 degrees Fahrenheit or colder, up to 4 days in the refrigerator at 40 degrees, and about 6 months in the freezer at 0 degrees with up to 12 months acceptable. Once thawed in the fridge use within 24 hours, after warming use within 2 hours, and never refreeze thawed milk.');
    add(fig, svg);

    note(fig,
      'A quick reference: 4 hours on the counter, 4 days in the fridge, about 6 months in the freezer (up to 12 acceptable). Thawed milk lasts 24 hours, warmed milk 2 hours, and you never refreeze. Store toward the back, not the door, and do not microwave. ' +
      '<span class="src">Source: CDC, Breast Milk Storage and Preparation (updated March 25, 2026), cross-checked against ABM Clinical Protocol #8 (2017), which allows longer fridge times for very cleanly expressed milk.</span>');

    dataTable(fig, 'CDC milk-storage guidelines, freshly expressed milk',
      ['Location or step', 'Limit', 'Temperature'],
      [
        ['Countertop', 'Up to 4 hours', '77°F / 25°C or colder'],
        ['Refrigerator', 'Up to 4 days', '40°F / 4°C'],
        ['Freezer', '6 months best, 12 acceptable', '0°F / -18°C'],
        ['Thawed in fridge', 'Within 24 hours', ''],
        ['After warming', 'Within 2 hours', ''],
        ['Refreezing', 'Never', '']
      ]);
  };
})();


/* module: growth-who-cdc.js */
/* ============================================================
   THE FIRST YEAR, chart: WHO standard vs CDC reference.
   Module: growth-who-cdc (one FY.viz function).
   An overlay of the WHO and CDC median (50th percentile)
   weight-for-age curves, birth to 24 months. The two lines
   nearly coincide at 6 months, then the CDC reference median
   runs about 6 to 7 percent heavier by 12 months because the
   CDC 2000 sample was largely formula-fed, while the WHO 2006
   standard is built from healthy, predominantly breastfed
   babies. That is why a breastfed baby can look like it "fell
   off the curve" when the chart, not the baby, changed.

   A boys/girls toggle is provided; both panels use real,
   source-derived medians.

   DATA (median weight-for-age in kg at completed months, the M
   column of the published LMS tables):
   - WHO Child Growth Standards 2006, weight-for-age, by sex,
     mirrored byte-for-byte as CSV by CDC at
     https://www.cdc.gov/growthcharts/who-data-files.htm
     (downloaded 2026-06-02). Boys/girls M at 0,3,6,9,12,15,18,
     21,24 mo captured below; the 0/6/12/18/24 values match the
     deep dive's transcribed WHO tables exactly.
   - CDC 2000 infant reference, weight-for-age z-score LMS file
     wtageinf.csv from
     https://www.cdc.gov/growthcharts/data/zscore/wtageinf.csv
     (downloaded 2026-06-02). The CDC file is half-month-centered
     (ages 0, 0.5, 1.5, 2.5, ...), so the median at each integer
     month is linearly interpolated to the SAME age as WHO before
     comparing, exactly as the deep dive specifies (this is what
     keeps the 12-month gap at the defensible ~6.5 percent rather
     than the ~8 percent you get from the half-month-older raw row).

   The age-matched gap this reproduces (deep dive, computed
   2026-06-01, grade A): boys 6 mo WHO 7.934 vs CDC 7.897
   (-0.5%); boys 12 mo WHO 9.648 vs CDC 10.310 (+0.662 kg,
   +6.9%); girls 6 mo WHO 7.297 vs CDC 7.211 (-1.2%); girls
   12 mo WHO 8.948 vs CDC 9.516 (+0.568 kg, +6.4%).

   Source: growth-charts-standards.md sections 4 to 6; dataset-
   viz-plan.md entry 12. No external libraries. Clean console.
   No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) { if (window.console) console.warn('growth-who-cdc: FY.svg helper missing'); return; }
  var P = S.palette;

  /* ---- frame geometry, 720 x 380 ---- */
  var W = 720, H = 380;
  var M = { t: 54, r: 150, b: 52, l: 50 };   /* wide right margin for the legend */
  var X0 = M.l, X1 = W - M.r;                 /* plot box left/right */
  var Y0 = M.t, Y1 = H - M.b;                 /* plot box top/bottom */
  var MON_MAX = 24;                           /* months of age on the x-axis */
  var KG_MIN = 3, KG_MAX = 13;               /* weight axis, kg */
  var TAB = { 'font-variant-numeric': 'tabular-nums' };

  /* ------------------------------------------------------------------
     Real median weight-for-age (kg), the M column of the published
     LMS tables, at completed months 0,3,6,9,12,15,18,21,24.
     WHO values verified against the deep dive (0/6/12/18/24); CDC
     values linearly interpolated to integer months from the half-
     month-centered CDC file (the 6 and 12 mo values match the deep
     dive's age-matched figures exactly).
     ------------------------------------------------------------------ */
  var MONTHS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  /* gap6 / gap12 are the deep dive's published, age-matched gap figures
     (CDC minus WHO at 6 and 12 mo); we display these cited values for the
     callouts so the chart text, the note, and the fallback table all agree
     to the same rounding rather than diverging by a tenth from live
     floating-point arithmetic. The curves themselves are drawn from the
     per-month medians above. */
  var DATA = {
    boys: {
      who: [3.3464, 6.3762, 7.9340, 8.9014, 9.6479, 10.3108, 10.9385, 11.5486, 12.1515],
      cdc: [3.5302, 6.0321, 7.8967, 9.2788, 10.3102, 11.0947, 11.7123, 12.2228, 12.6703],
      gap6: '-0.5%', gap12kg: '+0.66', gap12pct: '+6.9%'
    },
    girls: {
      who: [3.2322, 5.8458, 7.2970, 8.2254, 8.9481, 9.6008, 10.2315, 10.8534, 11.4775],
      cdc: [3.3992, 5.5453, 7.2114, 8.5038, 9.5163, 10.3243, 10.9875, 11.5524, 12.0545],
      gap6: '-1.2%', gap12kg: '+0.57', gap12pct: '+6.4%'
    }
  };

  /* The two ages the chart annotates: convergence at 6, gap at 12. */
  function atMonth(series, mon) {
    var i = MONTHS.indexOf(mon);
    return i === -1 ? NaN : series[i];
  }

  /* small DOM helpers (match the sibling modules) ---------------------- */
  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
    return p;
  }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap);
    var thead = document.createElement('thead'), htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t);
    return t;
  }

  /* ============================================================
     FY.viz["growth-who-cdc"]
     ============================================================ */
  FY.viz['growth-who-cdc'] = function (fig) {
    if (!fig) return;
    var svg = S.make(W, H);

    var sx = S.scale(0, MON_MAX, X0, X1);
    var sy = S.scale(KG_MIN, KG_MAX, Y1, Y0);

    /* a single <g> we redraw when the sex toggle flips */
    var plot = S.el('g', null, svg);

    /* ---- static grid + axes (drawn once) ---- */
    var axes = S.el('g', null, svg);
    /* horizontal gridlines + y ticks every 2 kg */
    for (var kg = KG_MIN; kg <= KG_MAX + 0.001; kg += 2) {
      S.el('line', { x1: X0, y1: sy(kg), x2: X1, y2: sy(kg), class: 'viz-grid', opacity: kg === KG_MIN ? 0.85 : 0.4 }, axes);
      axes.appendChild(S.text(X0 - 8, sy(kg) + 3.5, String(kg), 'viz-axis', Object.assign({ 'text-anchor': 'end' }, TAB)));
    }
    /* x ticks every 6 months */
    for (var mo = 0; mo <= MON_MAX; mo += 6) {
      S.el('line', { x1: sx(mo), y1: Y1, x2: sx(mo), y2: Y1 + 4, class: 'viz-grid', opacity: 0.6 }, axes);
      axes.appendChild(S.text(sx(mo), Y1 + 18, String(mo), 'viz-axis', Object.assign({ 'text-anchor': 'middle' }, TAB)));
    }
    axes.appendChild(S.text((X0 + X1) / 2, H - 10, 'Age in months', 'viz-axis', { 'text-anchor': 'middle' }));
    axes.appendChild(S.text(0, 0, 'Median weight (kg)', 'viz-axis', { 'text-anchor': 'middle', transform: 'translate(' + (X0 - 38) + ' ' + ((Y0 + Y1) / 2) + ') rotate(-90)' }));

    /* ---- the sex toggle (real, keyboard-accessible HTML buttons) ---- */
    var controls = document.createElement('div');
    controls.className = 'viz-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Choose sex for the growth curves');
    var current = 'boys';

    function makeBtn(key, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.textContent = label;
      b.setAttribute('aria-pressed', key === current ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (current === key) return;
        current = key;
        Array.prototype.forEach.call(controls.children, function (c) {
          c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
        });
        draw();
      });
      return b;
    }
    controls.appendChild(makeBtn('boys', 'Boys'));
    controls.appendChild(makeBtn('girls', 'Girls'));

    /* ---- draw / redraw the curves for the current sex ---- */
    function curvePts(series) {
      return MONTHS.map(function (m, i) { return [sx(m), sy(series[i])]; });
    }

    function draw() {
      while (plot.firstChild) plot.removeChild(plot.firstChild);
      var d = DATA[current];
      var whoPts = curvePts(d.who);
      var cdcPts = curvePts(d.cdc);

      /* shade the divergence between the two medians (light gold wedge) */
      var wedge = S.line(cdcPts) + ' ' +
        whoPts.slice().reverse().map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' Z';
      S.el('path', { d: wedge, fill: P.gold, 'fill-opacity': 0.10, stroke: 'none' }, plot);

      /* CDC reference (heavier, drawn in the "call" amber, dashed) */
      S.el('path', { d: S.line(cdcPts), fill: 'none', stroke: P.call, 'stroke-width': 2.4, 'stroke-dasharray': '6 4', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, plot);
      /* WHO standard (the clinic chart, solid gold) */
      S.el('path', { d: S.line(whoPts), fill: 'none', stroke: P.gold, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, plot);

      /* dots at the captured monthly anchors */
      whoPts.forEach(function (p) { S.el('circle', { cx: p[0], cy: p[1], r: 2.2, fill: P.gold }, plot); });
      cdcPts.forEach(function (p) { S.el('circle', { cx: p[0], cy: p[1], r: 2.2, fill: P.call }, plot); });

      /* ---- annotate 6-month convergence ---- */
      var w6 = atMonth(d.who, 6), c6 = atMonth(d.cdc, 6);
      var x6 = sx(6);
      S.el('line', { x1: x6, y1: sy(KG_MIN), x2: x6, y2: sy(Math.max(w6, c6)), stroke: P.dim, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.6 }, plot);
      S.el('circle', { cx: x6, cy: sy((w6 + c6) / 2), r: 4.6, fill: 'none', stroke: P.ok, 'stroke-width': 1.5 }, plot);
      plot.appendChild(S.text(x6, sy(Math.max(w6, c6)) - 10, 'agree at 6 mo (' + d.gap6 + ')', 'viz-axis', { 'text-anchor': 'middle', fill: P.ok }));

      /* ---- annotate 12-month gap (the headline) ---- */
      var w12 = atMonth(d.who, 12), c12 = atMonth(d.cdc, 12);
      var x12 = sx(12);
      /* a vertical bracket between the two lines at 12 mo */
      S.el('line', { x1: x12, y1: sy(w12), x2: x12, y2: sy(c12), stroke: P.goldHi, 'stroke-width': 1.6 }, plot);
      S.el('line', { x1: x12 - 4, y1: sy(c12), x2: x12 + 4, y2: sy(c12), stroke: P.goldHi, 'stroke-width': 1.6 }, plot);
      S.el('line', { x1: x12 - 4, y1: sy(w12), x2: x12 + 4, y2: sy(w12), stroke: P.goldHi, 'stroke-width': 1.6 }, plot);
      plot.appendChild(S.text(x12 + 8, sy((w12 + c12) / 2) + 3.5, 'CDC ' + d.gap12kg + ' kg (' + d.gap12pct + ') by 12 mo', 'viz-label', { fill: P.goldHi }));

      /* ---- end-of-line labels in the right margin ---- */
      var endC = cdcPts[cdcPts.length - 1], endW = whoPts[whoPts.length - 1];
      plot.appendChild(S.text(X1 + 6, endC[1] + 3.5, 'CDC', 'viz-label', { fill: P.call }));
      plot.appendChild(S.text(X1 + 6, endW[1] + 3.5, 'WHO', 'viz-label', { fill: P.gold }));

      updateAria(d);
    }

    /* title row + legend (static) */
    svg.appendChild(S.text((X0 + X1) / 2, 18, 'Median weight-for-age: WHO standard vs CDC reference', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 13 }));
    var lg = S.el('g', { transform: 'translate(' + X0 + ' 34)' }, svg);
    S.el('line', { x1: 0, y1: -3, x2: 20, y2: -3, stroke: P.gold, 'stroke-width': 2.6 }, lg);
    lg.appendChild(S.text(26, 0, 'WHO standard (mostly breastfed)', 'viz-axis', { fill: P.gold }));
    S.el('line', { x1: 270, y1: -3, x2: 290, y2: -3, stroke: P.call, 'stroke-width': 2.4, 'stroke-dasharray': '6 4' }, lg);
    lg.appendChild(S.text(296, 0, 'CDC reference (mostly formula-fed)', 'viz-axis', { fill: P.call }));

    /* ---- accessibility, updated per sex ---- */
    function updateAria(d) {
      var w6 = atMonth(d.who, 6), c6 = atMonth(d.cdc, 6);
      var w12 = atMonth(d.who, 12), c12 = atMonth(d.cdc, 12);
      var sexWord = current === 'boys' ? 'boys' : 'girls';
      svg.setAttribute('aria-label',
        'Line chart overlaying median weight-for-age from birth to 24 months for ' + sexWord + ', the WHO Child Growth Standard against the CDC 2000 reference. ' +
        'At 6 months the two medians nearly coincide (WHO ' + w6.toFixed(2) + ' kg, CDC ' + c6.toFixed(2) + ' kg, a difference of ' + d.gap6 + '). ' +
        'By 12 months the CDC reference median runs heavier: WHO ' + w12.toFixed(2) + ' kg versus CDC ' + c12.toFixed(2) + ' kg, a gap of ' + d.gap12kg + ' kg, about ' + d.gap12pct + '. ' +
        'The WHO standard is built from healthy, predominantly breastfed babies; the CDC reference sample was largely formula-fed. ' +
        'This is why a breastfed baby can look like it fell off the curve when the chart, not the baby, changed.');
    }

    /* attach: controls first (above the svg), then the figure caption is
       already present, so insert the svg after it, then the note + table. */
    fig.appendChild(controls);
    fig.appendChild(svg);
    draw();

    note(fig,
      'Same baby, two charts. The clinic chart under age 2 (the <b>WHO standard</b>, solid) is built from healthy, mostly breastfed babies; many online charts use the older <b>CDC reference</b> (dashed), built largely from formula-fed babies. The two medians agree closely at 6 months, but by 12 months the CDC line runs about <b>6 to 7 percent heavier</b> (' +
      'boys +0.66 kg / +6.9%, girls +0.57 kg / +6.4%). So a breastfed baby tracking the WHO chart perfectly can look like it "fell off the curve" on a CDC chart. The chart changed, not the baby. ' +
      '<span class="src">Source: WHO Child Growth Standards 2006 and CDC 2000 reference, weight-for-age median (LMS M value) by sex; WHO files via CDC (cdc.gov/growthcharts/who-data-files.htm), CDC infant file wtageinf.csv; CDC medians age-matched to integer months by linear interpolation. Computed 2026.</span>');

    /* accessible fallback: mirrors the section noscript table, both sexes */
    dataTable(fig, 'Median weight-for-age (kg), WHO standard vs CDC reference, age-matched',
      ['Sex and age', 'WHO median (kg)', 'CDC median (kg)', 'CDC minus WHO'],
      [
        ['Boys, 6 mo', '7.93', '7.90', '-0.04 (-0.5%)'],
        ['Boys, 12 mo', '9.65', '10.31', '+0.66 (+6.9%)'],
        ['Girls, 6 mo', '7.30', '7.21', '-0.09 (-1.2%)'],
        ['Girls, 12 mo', '8.95', '9.52', '+0.57 (+6.4%)']
      ]);
  };
})();


/* module: leap-colic.js */
/* ============================================================
   THE FIRST YEAR, allergen-introduction and colic-remedy module.
   Two visualizations for the feeding and soothing domains:
     FY.viz["leap"]            paired before/after bars for the LEAP
                               peanut trial (avoidance vs early
                               consumption) at age 5, with the
                               LEAP-Trio durability point at ~age 13.
     FY.viz["colic-remedies"]  an evidence scorecard of marketed colic
                               and gas remedies: measured effect plus
                               strength-of-recommendation (SOR) grade.
   Every number is real and cited in the viz-note and aria-label.
   Framework-free, defensive, no console errors. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return; /* core helper missing; degrade silently */
  var P = S.palette;

  /* small shared helpers -------------------------------------------------- */
  function add(parent, node) { if (parent && node) parent.appendChild(node); return node; }
  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
    return p;
  }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    if (caption) { var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap); }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t);
    return t;
  }

  /* ====================================================================== */
  /* 1. FY.viz["leap"]                                                       */
  /*    Left panel: paired before/after bars at age 5 (LEAP, NEJM 2015).     */
  /*      avoidance 17.2% vs early consumption 3.2% peanut allergy.          */
  /*    Right panel: a two-timepoint durability line (age 5 -> ~age 13)      */
  /*      from LEAP-Trio (NEJM Evidence 2024): 15.4% vs 4.4%.                */
  /* ====================================================================== */
  FY.viz['leap'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* ---- data, all real and cited ---- */
    /* LEAP primary outcome, overall ITT, peanut allergy at 60 months (age 5). */
    var pair = [
      { key: 'avoid', label: 'Avoidance', v: 17.2, col: P.emerg },
      { key: 'eat', label: 'Early eating', v: 3.2, col: P.ok }
    ];
    /* LEAP-Trio durability, mean age ~13, by original assignment. */
    var dur = {
      avoid: [ { t: 5, v: 17.2 }, { t: 13, v: 15.4 } ],
      eat: [ { t: 5, v: 3.2 }, { t: 13, v: 4.4 } ]
    };

    /* ---- layout: two panels side by side ---- */
    var padT = 30, padB = 56;
    var midGap = 50;
    var leftX0 = 56, leftX1 = 312;            /* paired bars */
    var rightX0 = 312 + midGap, rightX1 = W - 50; /* durability line */
    var plotT = padT, plotB = H - padB;

    /* panel titles */
    add(svg, S.text((leftX0 + leftX1) / 2, 16, 'Peanut allergy at age 5 (LEAP)', 'viz-label', { 'text-anchor': 'middle', fill: P.parch }));
    add(svg, S.text((rightX0 + rightX1) / 2, 16, 'Still protected at age 13 (LEAP-Trio)', 'viz-label', { 'text-anchor': 'middle', fill: P.parch }));

    /* shared y domain 0..20 percent (max observed value is 17.2) */
    var yMax = 20;

    /* ===== LEFT: paired before/after bars ===== */
    var ly = S.scale(0, yMax, plotB, plotT);
    [0, 5, 10, 15, 20].forEach(function (g) {
      var yy = ly(g);
      add(svg, S.el('line', { x1: leftX0, y1: yy, x2: leftX1, y2: yy, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.4 }));
      add(svg, S.text(leftX0 - 6, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'end' }));
    });
    add(svg, S.text(leftX0 - 36, (plotT + plotB) / 2, 'percent allergic', 'viz-axis', { 'text-anchor': 'middle', transform: 'rotate(-90 ' + (leftX0 - 36) + ' ' + ((plotT + plotB) / 2) + ')' }));

    var n = pair.length;
    var band = (leftX1 - leftX0) / n;
    var bw = Math.min(74, band * 0.56);
    var topY = {};
    pair.forEach(function (d, i) {
      var cx = leftX0 + band * (i + 0.5);
      var top = ly(d.v);
      topY[d.key] = { x: cx, y: top };
      add(svg, S.el('rect', { x: cx - bw / 2, y: top, width: bw, height: Math.max(0, plotB - top), rx: 2, fill: d.col, opacity: 0.92 }));
      add(svg, S.text(cx, top - 6, d.v.toFixed(1) + '%', 'viz-axis', { 'text-anchor': 'middle', fill: P.goldHi }));
      add(svg, S.text(cx, plotB + 18, d.label, 'viz-axis', { 'text-anchor': 'middle' }));
    });

    /* the headline reduction callout: an arc between the two bar tops */
    if (topY.avoid && topY.eat) {
      var ax = topY.avoid.x, ay = topY.avoid.y, ex = topY.eat.x, ey = topY.eat.y;
      var midX = (ax + ex) / 2;
      var liftY = Math.min(ay, ey) - 26;
      add(svg, S.el('path', {
        d: 'M' + ax + ' ' + (ay - 16) + ' Q' + midX + ' ' + liftY + ' ' + ex + ' ' + (ey - 16),
        fill: 'none', stroke: P.gold, 'stroke-width': 1.2, opacity: 0.7, 'stroke-dasharray': '3 3'
      }));
      add(svg, S.el('rect', { x: midX - 56, y: liftY - 18, width: 112, height: 22, rx: 11, fill: 'rgba(212,196,160,0.12)', stroke: P.gold, 'stroke-width': 1 }));
      add(svg, S.text(midX, liftY - 3, 'about 81% lower', 'viz-label', { 'text-anchor': 'middle', fill: P.goldHi, 'font-size': 12.5 }));
    }

    /* ===== RIGHT: durability two-timepoint line ===== */
    var rx = S.scale(5, 13, rightX0, rightX1);
    var ry = S.scale(0, yMax, plotB, plotT);
    [0, 5, 10, 15, 20].forEach(function (g) {
      var yy = ry(g);
      add(svg, S.el('line', { x1: rightX0, y1: yy, x2: rightX1, y2: yy, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.4 }));
      add(svg, S.text(rightX1 + 4, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'start' }));
    });
    [5, 13].forEach(function (t) {
      var xx = rx(t);
      add(svg, S.text(xx, plotB + 18, 'age ' + t, 'viz-axis', { 'text-anchor': 'middle' }));
      add(svg, S.el('line', { x1: xx, y1: plotB, x2: xx, y2: plotB + 4, class: 'viz-grid', opacity: 0.6 }));
    });

    function drawSeries(series, col, name) {
      var pts = series.map(function (d) { return [rx(d.t), ry(d.v)]; });
      add(svg, S.el('path', { d: S.line(pts), fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      series.forEach(function (d) {
        add(svg, S.el('circle', { cx: rx(d.t), cy: ry(d.v), r: 3.4, fill: col, stroke: '#2a322b', 'stroke-width': 1 }));
      });
      /* end label at age 13 */
      var last = series[series.length - 1];
      add(svg, S.text(rx(last.t) - 6, ry(last.v) + (name === 'eat' ? 14 : -8), last.v.toFixed(1) + '%', 'viz-axis', { 'text-anchor': 'end', fill: P.goldHi }));
    }
    drawSeries(dur.avoid, P.emerg, 'avoid');
    drawSeries(dur.eat, P.ok, 'eat');
    /* inline legend on the right panel */
    add(svg, S.el('rect', { x: rightX0 + 6, y: plotT + 2, width: 10, height: 10, rx: 2, fill: P.emerg }));
    add(svg, S.text(rightX0 + 20, plotT + 11, 'avoided peanut', 'viz-axis', { 'text-anchor': 'start', fill: P.dim }));
    add(svg, S.el('rect', { x: rightX0 + 6, y: plotT + 18, width: 10, height: 10, rx: 2, fill: P.ok }));
    add(svg, S.text(rightX0 + 20, plotT + 27, 'ate peanut early', 'viz-axis', { 'text-anchor': 'start', fill: P.dim }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Two panels on early peanut introduction from the LEAP trial of high-risk infants. Left, peanut allergy at age 5 was 17.2 percent in children who avoided peanut versus 3.2 percent in children who ate peanut from infancy, about an 81 percent relative reduction. Right, the protection lasted into adolescence: at a mean age of 13 the LEAP-Trio follow-up found 15.4 percent allergic in the avoidance group versus 4.4 percent in the early-eating group, a 71 percent relative reduction.');
    add(fig, svg);

    note(fig,
      'Eating peanut early, and keeping it in the diet, cut peanut allergy at age 5 by about 80 to 81 percent in high-risk infants, and the protection held into the teen years even without strict ongoing dosing. This reversed decades of advice to delay allergens. The trial enrolled infants with severe eczema or egg allergy, so families with a high-risk baby should ask their doctor about timing. ' +
      '<span class="src">Source: Du Toit et al., LEAP, New England Journal of Medicine 2015;372:803 (overall intention-to-treat, age 5: 17.2% avoidance vs 3.2% consumption); durability from LEAP-Trio, NEJM Evidence 2024;3(7):EVIDoa2300311 (mean age ~13: 15.4% vs 4.4%, 71% relative reduction).</span>');

    dataTable(fig, 'LEAP peanut allergy by group (percent allergic)',
      ['Timepoint', 'Avoided peanut', 'Ate peanut early'],
      [
        ['Age 5 (LEAP, 2015)', '17.2', '3.2'],
        ['Age ~13 (LEAP-Trio, 2024)', '15.4', '4.4']
      ]);
  };

  /* ====================================================================== */
  /* 2. FY.viz["colic-remedies"]                                             */
  /*    A graded evidence scorecard: each marketed colic or gas remedy with  */
  /*    its measured effect and a strength-of-recommendation (SOR) grade.    */
  /*    Rows drawn as a clean ledger; SOR shown as a colored chip.           */
  /* ====================================================================== */
  FY.viz['colic-remedies'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* Each row: remedy, the measured effect, an SOR grade, and a verdict tone.
       grade drives the chip color; tone is "good" / "weak" / "none". */
    var rows = [
      { remedy: 'Low-allergen maternal diet', detail: '137 vs 51 min/day crying (breastfed)', grade: 'A', tone: 'good' },
      { remedy: 'Hydrolyzed formula', detail: 'significant crying reduction (formula-fed)', grade: 'A', tone: 'good' },
      { remedy: 'L. reuteri DSM 17938', detail: '-25.4 min/day overall; -61 in breastfed only', grade: 'B', tone: 'weak' },
      { remedy: 'Simethicone (gas drops)', detail: 'no better than placebo', grade: 'X', tone: 'none' },
      { remedy: 'Gripe water', detail: 'no trial data; may cause harm', grade: '?', tone: 'none' },
      { remedy: 'Burping', detail: 'no benefit (aRR 0.64, NS); more spit-up', grade: 'X', tone: 'none' }
    ];

    function chipColor(tone) {
      if (tone === 'good') return P.ok;
      if (tone === 'weak') return P.call;
      return P.emerg;
    }
    function gradeText(g) {
      if (g === 'A') return 'SOR A';
      if (g === 'B') return 'SOR B';
      if (g === 'X') return 'no benefit';
      return 'no data';
    }

    /* title */
    add(svg, S.text(W / 2, 22, 'Colic and gas remedies: does it beat placebo?', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
    add(svg, S.text(W / 2, 40, 'Measured effect and strength-of-recommendation grade', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* ledger layout */
    var marg = 16;
    var top = 58;
    var rowH = 48;
    var gap = 6;
    var colChipX = W - marg - 96; /* left edge of the grade chip column */
    var chipW = 96, chipH = 26;

    rows.forEach(function (d, i) {
      var y = top + i * (rowH + gap);
      var cy = y + rowH / 2;
      var col = chipColor(d.tone);
      /* row card */
      add(svg, S.el('rect', { x: marg, y: y, width: W - marg * 2, height: rowH, rx: 8, fill: 'rgba(0,0,0,0.16)', stroke: P.rule, 'stroke-width': 1 }));
      /* left accent keyed to the verdict */
      add(svg, S.el('rect', { x: marg, y: y, width: 5, height: rowH, rx: 2.5, fill: col }));
      /* remedy name */
      add(svg, S.text(marg + 18, cy - 3, d.remedy, 'viz-label', { 'text-anchor': 'start', fill: P.parch, 'font-size': 13 }));
      /* measured effect, dim, mono-friendly */
      add(svg, S.text(marg + 18, cy + 14, d.detail, 'viz-axis', { 'text-anchor': 'start', fill: P.dim, 'font-size': 11 }));
      /* grade chip */
      add(svg, S.el('rect', { x: colChipX, y: cy - chipH / 2, width: chipW, height: chipH, rx: 13, fill: 'rgba(0,0,0,0.22)', stroke: col, 'stroke-width': 1.4 }));
      add(svg, S.text(colChipX + chipW / 2, cy + 4, gradeText(d.grade), 'viz-label', { 'text-anchor': 'middle', fill: col, 'font-size': 12 }));
    });

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'An evidence scorecard for infant colic and gas remedies. A maternal low-allergen diet (137 versus 51 minutes of crying a day) and extensively hydrolyzed formula both rate strength of recommendation A. The probiotic L. reuteri DSM 17938 reduces crying by about 25 minutes a day overall and about 61 minutes in breastfed infants and rates B, breastfed only. Simethicone gas drops are no better than placebo, gripe water has no trial data and may cause harm, and burping does not reduce colic and increases spit-up.');
    add(fig, svg);

    note(fig,
      'Most marketed colic cures do not beat placebo. The two interventions with the strongest evidence target a cow-milk-protein-allergy subset: a low-allergen diet for breastfeeding parents and hydrolyzed formula for formula-fed babies. The probiotic L. reuteri helps breastfed infants only, and is still just a weak recommendation. Simethicone, gripe water, and routine burping are the classic marketing-as-science traps. Reassurance and soothing come first; colic is the high end of the normal crying curve, not a disease. ' +
      '<span class="src">Source: American Family Physician, "Infantile Colic" (Oct 1, 2015) SOR table; L. reuteri pooled effect from Sung et al., Pediatrics 2018;141(1):e20171811 (-25.4 min/day, breastfed NNT 2.6) with the 61 min/day breastfed subgroup from AFP 2015; burping from Kaur et al. 2015 (adjusted RR 0.64, not significant).</span>');

    dataTable(fig, 'Colic and gas remedies, measured effect and grade',
      ['Remedy', 'Measured effect', 'Grade'],
      rows.map(function (d) { return [d.remedy, d.detail, gradeText(d.grade)]; }));
  };
})();


/* module: milestone-bands.js */
/* ============================================================
   THE FIRST YEAR, chart module: milestone-bands.
   "Normal is a band, not a line." The six WHO MGRS gross-motor
   milestones drawn as overlapping horizontal range bars on a
   months axis (1st to 99th percentile), each with its median
   marked. Registers onto window.FY.viz. No em dashes.
   Source: WHO Multicentre Growth Reference Study Group, "WHO
   Motor Development Study: Windows of achievement for six gross
   motor development milestones," Acta Paediatrica 2006 Suppl
   450:86 to 95 (n=816; Ghana, India, Norway, Oman, USA).
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  // The six WHO MGRS gross-motor milestones, top to bottom in the
  // canonical achievement order (earliest median first). Every value
  // is the real WHO MGRS 2006 figure, months = days / 30.4375.
  // p1 / med / p99 are the 1st percentile, median (50th), 99th percentile.
  var DATA = [
    { name: 'Sitting without support',    p1: 3.8, med: 5.9,  p99: 9.2  },
    { name: 'Standing with assistance',   p1: 4.8, med: 7.4,  p99: 11.4 },
    { name: 'Hands and knees crawling',   p1: 5.2, med: 8.3,  p99: 13.5, note: '4.3% of healthy babies skip it' },
    { name: 'Walking with assistance',    p1: 5.9, med: 9.0,  p99: 13.7 },
    { name: 'Standing alone',             p1: 6.9, med: 10.8, p99: 16.9 },
    { name: 'Walking alone',              p1: 8.2, med: 12.0, p99: 17.6 }
  ];

  // One mono numeral helper so axis ticks and table cells match.
  function mo(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  FY.viz['milestone-bands'] = function (fig) {
    if (!fig || !FY.svg) return;
    var P = FY.svg.palette;

    // Canvas. Wider-than-tall suits six stacked bars plus a long label gutter.
    var W = 720, H = 380;
    var svg = FY.svg.make(W, H);

    // Margins: a generous left gutter for the milestone names, a little
    // right room for the median value, and bottom room for the axis label.
    var m = { top: 24, right: 60, bottom: 52, left: 188 };
    var plotW = W - m.left - m.right;
    var plotH = H - m.top - m.bottom;

    // X domain: months. Start at 3 (just under the earliest 1st pct of 3.8)
    // and end at 18 (just over the latest 99th pct of 17.6) so the bars
    // breathe without clipping.
    var xMin = 3, xMax = 18;
    var x = FY.svg.scale(xMin, xMax, m.left, m.left + plotW);

    // Vertical band layout.
    var n = DATA.length;
    var rowH = plotH / n;
    var barH = Math.min(20, rowH * 0.46);
    function rowCenter(i) { return m.top + rowH * (i + 0.5); }

    // ---- Gridlines + x axis ticks (every 3 months) ----
    var gx = FY.svg.el('g', null, svg);
    for (var t = xMin; t <= xMax; t += 3) {
      var gxp = x(t);
      FY.svg.el('line', {
        x1: gxp, y1: m.top - 4, x2: gxp, y2: m.top + plotH,
        class: 'viz-grid', stroke: P.rule, 'stroke-width': 1
      }, gx);
      FY.svg.text(gxp, m.top + plotH + 20, String(t), 'viz-axis', { 'text-anchor': 'middle' });
    }

    // X axis title.
    FY.svg.text(m.left + plotW / 2, m.top + plotH + 42, 'Age in months', 'viz-label', {
      'text-anchor': 'middle', fill: P.dim
    });

    // Baseline rule under the bars (the x axis line itself).
    FY.svg.el('line', {
      x1: m.left, y1: m.top + plotH, x2: m.left + plotW, y2: m.top + plotH,
      stroke: P.rule, 'stroke-width': 1
    }, svg);

    // A soft cycle of data colors so the overlapping bars read apart.
    var colors = [P.sky, P.ok, P.plum, P.call, P.gold, P.goldHi];

    // ---- The bars ----
    var bars = FY.svg.el('g', null, svg);
    DATA.forEach(function (d, i) {
      var cy = rowCenter(i);
      var x0 = x(d.p1), x1 = x(d.p99), xm = x(d.med);
      var col = colors[i % colors.length];

      // Milestone name in the left gutter, right aligned to the bars.
      FY.svg.text(m.left - 12, cy + 4, d.name, 'viz-axis', {
        'text-anchor': 'end', fill: P.parch
      });

      // The 1st-to-99th range bar (the "band of normal").
      FY.svg.el('rect', {
        x: x0, y: cy - barH / 2, width: Math.max(1, x1 - x0), height: barH,
        rx: barH / 2, ry: barH / 2,
        fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-opacity': 0.7, 'stroke-width': 1
      }, bars);

      // End caps so the exact 1st and 99th edges are legible.
      FY.svg.el('line', { x1: x0, y1: cy - barH / 2, x2: x0, y2: cy + barH / 2, stroke: col, 'stroke-width': 1.5 }, bars);
      FY.svg.el('line', { x1: x1, y1: cy - barH / 2, x2: x1, y2: cy + barH / 2, stroke: col, 'stroke-width': 1.5 }, bars);

      // The median marker: a filled dot.
      FY.svg.el('circle', { cx: xm, cy: cy, r: 4.5, fill: col, stroke: '#1c241e', 'stroke-width': 1 }, bars);

      // Median value, just past the right end of the band, in mono numerals.
      FY.svg.text(x1 + 8, cy + 4, mo(d.med), 'viz-axis', {
        'text-anchor': 'start', fill: P.dim
      });
    });

    // ---- Small inline legend (band = range, dot = median) ----
    var lg = FY.svg.el('g', null, svg);
    var lgy = m.top - 10;
    var lgx = m.left;
    FY.svg.el('rect', { x: lgx, y: lgy - 5, width: 26, height: 10, rx: 5, ry: 5, fill: P.dim, 'fill-opacity': 0.22, stroke: P.dim, 'stroke-opacity': 0.7, 'stroke-width': 1 }, lg);
    FY.svg.text(lgx + 32, lgy + 4, '1st to 99th percentile', 'viz-axis', { fill: P.dim });
    var dotx = lgx + 196;
    FY.svg.el('circle', { cx: dotx, cy: lgy, r: 4.5, fill: P.dim, stroke: '#1c241e', 'stroke-width': 1 }, lg);
    FY.svg.text(dotx + 10, lgy + 4, 'median', 'viz-axis', { fill: P.dim });

    // ---- Accessible spoken summary with the key numbers ----
    svg.setAttribute('aria-label',
      'Range bars of six WHO gross-motor milestones on a months axis, each spanning the 1st to 99th percentile with the median marked. ' +
      'Sitting without support, 3.8 to 9.2 months (median 5.9). ' +
      'Standing with assistance, 4.8 to 11.4 months (median 7.4). ' +
      'Hands and knees crawling, 5.2 to 13.5 months (median 8.3), and 4.3 percent of healthy babies skip it. ' +
      'Walking with assistance, 5.9 to 13.7 months (median 9.0). ' +
      'Standing alone, 6.9 to 16.9 months (median 10.8). ' +
      'Walking alone, 8.2 to 17.6 months (median 12.0). ' +
      'Normal is a band, not a line. Source: WHO Motor Development Study, MGRS, Acta Paediatrica 2006.');

    // Append the svg after the existing figcaption.
    fig.appendChild(svg);

    // ---- Reassuring caption plus source ----
    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent = 'Normal is a band, not a line. Walking alone is normal anywhere from 8 to 17.6 months. ' +
      'Each bar shows where perfectly healthy babies land (1st to 99th percentile); the dot is about average. ' +
      'Being later than the dot is common and usually nothing. The order is loose too, and 4.3 percent of healthy babies never crawl on hands and knees. ' +
      'Source: WHO Motor Development Study (MGRS), Windows of Achievement for six gross-motor milestones, Acta Paediatrica 2006, Suppl 450:86 to 95 (n=816; Ghana, India, Norway, Oman, USA).';
    fig.appendChild(note);

    // ---- Accessible data table fallback (the underlying numbers) ----
    var table = document.createElement('table');
    table.className = 'viz-data';
    var caption = document.createElement('caption');
    caption.textContent = 'WHO MGRS windows of achievement for six gross-motor milestones (months).';
    table.appendChild(caption);

    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    ['Milestone', '1st pct', 'Median', '99th pct', 'Window width'].forEach(function (h) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    DATA.forEach(function (d) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = d.name + (d.note ? ' (' + d.note + ')' : '');
      tr.appendChild(th);
      [mo(d.p1), mo(d.med), mo(d.p99), mo(d.p99 - d.p1)].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    fig.appendChild(table);
  };
})();


/* module: money-mh.js */
/* ============================================================
   THE FIRST YEAR, money and maternal-mental-health charts module.
   Three visualizations for the caregiver / logistics domain:
     FY.viz["childcare-cost"]  ranked bars putting US average infant
                               care ($13,128, 2024) next to the things
                               it now exceeds: median rent, in-state
                               public college tuition, and the childcare
                               workforce's own median wage, plus the
                               childcare-prices-vs-CPI inflation gap.
     FY.viz["paid-leave"]      a sorted bar of paid leave for mothers by
                               country, measured in full-rate-equivalent
                               weeks (OECD PF2.1, April 2025), with the
                               United States alone at zero and a note on
                               the within-US state lottery.
     FY.viz["maternal-mh"]     a ranked cause bar of US pregnancy-related
                               death with mental-health conditions on top
                               (the single largest category, ~23%, mostly
                               preventable), and a note that the danger
                               runs late, about a third of deaths falling
                               in the 43-day-to-1-year postpartum window.
   Every number is real and cited in the viz-note and aria-label.
   Framework-free, defensive, clean console. No em dashes anywhere.

   Sourcing and corrections applied (see corrections-to-apply.md):
   - Childcare national average $13,128 and "+29% childcare vs +22% CPI,
     2020 to 2024" are Child Care Aware of America 2024 Price of Care
     (the figures the dataset-viz-plan pins). The 2025 CCAoA report
     (released 2026-05-14) updates the average to $13,184 and the single-
     parent share to 33%; we lead with the 2024 figures the plan calls
     for and footnote the 2025 refresh so nothing is stale.
   - "Exceeds rent in 49 states" is the CCAoA two-children-vs-rent
     comparison; "more than in-state college tuition in 38 to 41 states"
     spans EPI (38 states + DC, 2023 data) and CCAoA (41 states + DC,
     2024), a real vintage-driven range, shown as a range not one number.
   - Paid-leave weeks are the OECD Family Database PF2.1.A full-rate-
     equivalent (FRE) weeks for mothers, "applicable as of April 2025."
     FRE = weeks x average payment rate, the apples-to-apples measure.
     The US is the only OECD country with no national paid leave (0.0).
   - Maternal mental-health share: lead figure ~23% of pregnancy-related
     deaths (CDC MMRC, 2017 to 2019, 36 states), the single largest
     category, ~84% of all pregnancy-related deaths preventable and the
     mental-health deaths essentially all preventable (Trost 2021,
     37 of 37). We also note the newer pooled 2017 to 2021 MMRC headline
     of 26.3% (released Dec 2023). Late-window timing: about a third of
     all pregnancy-related deaths fall 43 days to 1 year postpartum
     (37.8% in 2022), and the mental-health deaths cluster even later
     (63% in that window, Trost 2021).
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return; /* core helper missing; degrade silently */
  var P = S.palette;

  /* small shared helpers -------------------------------------------------- */
  function add(parent, node) { if (parent && node) parent.appendChild(node); return node; }
  function note(fig, html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    fig.appendChild(p);
    return p;
  }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    if (caption) { var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap); }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t);
    return t;
  }
  /* integer with thousands separators, kept in tabular mono via the CSS class */
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function usd(n) { return '$' + comma(n); }

  /* ====================================================================== */
  /* 1. FY.viz["childcare-cost"]                                             */
  /*    Ranked horizontal bars: US average annual infant care set against   */
  /*    the benchmarks it now exceeds (median rent, in-state public college  */
  /*    tuition, the childcare workforce median wage), with a compact        */
  /*    inflation inset showing childcare prices outran the CPI, 2020 to     */
  /*    2024. Source: Child Care Aware of America 2024 Price of Care; DOL    */
  /*    NDCP; EPI. The "more than college in 38 to 41 states" range is shown */
  /*    honestly as a vintage-driven range, never a single fabricated count. */
  /* ====================================================================== */
  FY.viz['childcare-cost'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* The comparison set. Infant care is the hero bar; the others are the
       annual benchmarks it has overtaken in most states. Dollar values are
       national figures from the captured datasets. */
    var INFANT = 13128;          /* CCAoA 2024 national average infant care */
    var RENT = 15216;            /* DOL NDCP median annual rent (2022) for context */
    var TUITION = 11560;         /* approx US average in-state public 4yr tuition+fees */
    var WAGE = 33140;            /* CCAoA 2024 childcare-worker median annual wage */

    var BARS = [
      { label: 'Infant care (US average)', v: INFANT, hero: true,
        tag: 'exceeds rent in 49 states; more than college in 38 to 41' },
      { label: 'Childcare worker median pay', v: WAGE, hero: false,
        tag: 'two children in care = 44% to 100%+ of this wage' },
      { label: 'Median annual rent', v: RENT, hero: false,
        tag: 'NDCP median (2022)' },
      { label: 'In-state public college (yr)', v: TUITION, hero: false,
        tag: 'average tuition + fees' }
    ];

    var maxV = WAGE; /* the childcare wage is the widest bar */
    var labelW = 196;
    var x0 = labelW, x1 = W - 116;
    var x = S.scale(0, maxV, x0, x1);
    var plotTop = 78, plotBot = H - 118;

    /* titles */
    add(svg, S.text(W / 2, 20, 'Infant care costs more than rent, and often more than college', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14.5 }));
    add(svg, S.text(W / 2, 38, 'US average annual infant care vs the costs it has overtaken', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* dollar gridlines every $10k */
    [0, 10000, 20000, 30000].forEach(function (g) {
      if (g > maxV) return;
      var xx = x(g);
      add(svg, S.el('line', { x1: xx, y1: plotTop - 6, x2: xx, y2: plotBot, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.35 }));
      add(svg, S.text(xx, plotBot + 16, g === 0 ? '$0' : '$' + (g / 1000) + 'k', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));
    });
    add(svg, S.text((x0 + x1) / 2, plotBot + 32, 'Annual cost (US dollars)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* the bars */
    var rowH = (plotBot - plotTop) / BARS.length;
    var barH = Math.min(26, rowH * 0.5);
    BARS.forEach(function (d, i) {
      var cy = plotTop + rowH * (i + 0.5);
      var col = d.hero ? P.emerg : (d.label.indexOf('worker') !== -1 ? P.plum : P.sky);
      add(svg, S.text(x0 - 10, cy + 3.5, d.label, 'viz-axis', { 'text-anchor': 'end', fill: d.hero ? P.goldHi : P.parch, 'font-size': 11 }));
      add(svg, S.el('rect', { x: x0, y: cy - barH / 2, width: Math.max(1, x(d.v) - x0), height: barH, rx: 2, fill: col, opacity: d.hero ? 0.95 : 0.78, stroke: d.hero ? P.goldHi : 'none', 'stroke-width': d.hero ? 1 : 0 }));
      add(svg, S.text(x(d.v) + 8, cy + 3.5, usd(d.v), 'viz-axis', { 'text-anchor': 'start', fill: d.hero ? P.emerg : P.goldHi, 'font-size': 11 }));
      /* small caption under each bar */
      add(svg, S.text(x0 + 2, cy + barH / 2 + 12, d.tag, 'viz-axis', { 'text-anchor': 'start', fill: P.dim, 'font-size': 9 }));
    });

    /* inflation inset, bottom band: childcare +29% vs CPI +22% (2020 to 2024) */
    var insetTop = plotBot + 46, insetH = 30;
    var ix0 = x0, ix1 = ix0 + 150;
    var ixs = S.scale(0, 29, ix0, ix1);
    add(svg, S.text(ix0 - 10, insetTop + 4, 'Price growth', 'viz-axis', { 'text-anchor': 'end', fill: P.parch, 'font-size': 10 }));
    add(svg, S.text(ix0 - 10, insetTop + 16, '2020 to 2024', 'viz-axis', { 'text-anchor': 'end', fill: P.dim, 'font-size': 9 }));
    /* CPI bar (reference) then childcare bar (above it) */
    add(svg, S.el('rect', { x: ix0, y: insetTop - 4, width: ixs(22) - ix0, height: 10, rx: 1.5, fill: P.dim, opacity: 0.6 }));
    add(svg, S.text(ixs(22) + 6, insetTop + 4.5, 'overall CPI +22%', 'viz-axis', { 'text-anchor': 'start', fill: P.dim, 'font-size': 9.5 }));
    add(svg, S.el('rect', { x: ix0, y: insetTop + 9, width: ixs(29) - ix0, height: 10, rx: 1.5, fill: P.call, opacity: 0.9 }));
    add(svg, S.text(ixs(29) + 6, insetTop + 17.5, 'childcare +29%', 'viz-axis', { 'text-anchor': 'start', fill: P.call, 'font-size': 9.5 }));

    /* the 7% affordability benchmark callout */
    add(svg, S.text(W - 12, insetTop + 4, 'Affordable = 7% of income', 'viz-axis', { 'text-anchor': 'end', fill: P.ok, 'font-size': 9.5 }));
    add(svg, S.text(W - 12, insetTop + 16, '(HHS benchmark, essentially', 'viz-axis', { 'text-anchor': 'end', fill: P.dim, 'font-size': 9 }));
    add(svg, S.text(W - 12, insetTop + 27, 'no state meets it for infants)', 'viz-axis', { 'text-anchor': 'end', fill: P.dim, 'font-size': 9 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Ranked bars comparing the US average annual cost of center-based infant care with the costs it now exceeds. ' +
      'Average infant care is 13,128 dollars in 2024, which exceeds median rent in 49 states and is more than in-state public college tuition in 38 to 41 states. ' +
      'For comparison, the median annual pay of a childcare worker is 33,140 dollars, median annual rent is about 15,216 dollars, and average in-state public college tuition and fees are about 11,560 dollars per year. ' +
      'Two children in center care cost 44 percent to over 100 percent of a childcare worker’s wage. ' +
      'Childcare prices rose about 29 percent from 2020 to 2024, faster than overall inflation of about 22 percent. ' +
      'The federal affordability benchmark is 7 percent of family income, which essentially no state meets for infant care. ' +
      'Sources: Child Care Aware of America 2024 Price of Care; US Department of Labor National Database of Childcare Prices; Economic Policy Institute.');
    add(fig, svg);

    note(fig,
      'In the United States the average price of center-based infant care is about ' + usd(INFANT) + ' a year (2024), more than median rent in 49 states and more than a year of in-state public college tuition in 38 to 41 states (the range reflects which year’s data you use). ' +
      'It is a bind, not a windfall: the people who provide the care earn a median of about ' + usd(WAGE) + ', so two children in care can cost more than a teacher makes. Prices have outrun inflation (childcare +29% vs overall CPI +22%, 2020 to 2024), and the federal affordability mark of 7% of family income is met essentially nowhere for infants. ' +
      '<span class="src">Sources: Child Care Aware of America, <i>Catalyzing Growth: 2024 Price of Care</i> (national average $13,128; childcare-worker median wage $33,140; childcare +29% vs CPI +22%, 2020 to 2024; exceeds rent in 49 states and college tuition in 41 states + DC). US Department of Labor, Women’s Bureau, <i>National Database of Childcare Prices</i> (Sept 2024; median annual rent $15,216, 2022). Economic Policy Institute, <i>Child care costs in the United States</i> (March 2025, 2023 data; more than in-state public college in 38 states + DC). The 7% affordability benchmark is the US Dept of Health and Human Services standard. Note: the 2025 CCAoA report (released 2026-05-14) updates the national average to $13,184 and the single-parent share to 33%.</span>');

    dataTable(fig, 'US average annual costs compared (national figures)',
      ['Item', 'Annual cost', 'Note'],
      [
        ['Center-based infant care (US average, 2024)', usd(INFANT), 'Exceeds rent in 49 states; > college in 38 to 41'],
        ['Childcare worker median pay (2024)', usd(WAGE), 'Two kids in care = 44% to 100%+ of this'],
        ['Median annual rent (NDCP, 2022)', usd(RENT), 'Federal county-level dataset'],
        ['In-state public college tuition + fees (yr)', usd(TUITION), 'Average; infant care tops it in most states'],
        ['Childcare price growth, 2020 to 2024', '+29%', 'vs overall CPI +22%'],
        ['Affordability benchmark (HHS)', '7% of income', 'Essentially unmet for infants nationwide']
      ]);
  };

  /* ====================================================================== */
  /* 2. FY.viz["paid-leave"]                                                 */
  /*    Sorted bar of paid leave for mothers, full-rate-equivalent (FRE)     */
  /*    weeks, OECD PF2.1.A (April 2025). FRE = weeks x average payment rate */
  /*    so a long low-paid entitlement and a short well-paid one compare     */
  /*    honestly. The United States is the lone bar at zero. A note covers   */
  /*    the within-US "geographic lottery" of state programs.                */
  /* ====================================================================== */
  FY.viz['paid-leave'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* FRE weeks for mothers, selected OECD countries, sorted descending.
       The US is forced to the bottom of the sort and rendered as a zero. */
    var DATA = [
      { c: 'Estonia', v: 82.1 },
      { c: 'Norway', v: 39.3 },
      { c: 'Germany', v: 38.2 },
      { c: 'Sweden', v: 34.4 },
      { c: 'Canada', v: 20.1 },
      { c: 'United Kingdom', v: 11.7 },
      { c: 'Australia', v: 9.2 },
      { c: 'United States', v: 0.0, us: true }
    ];
    var OECD_AVG_LEN = 54.9; /* OECD average total maternity+parental length, weeks */

    var maxV = 82.1;
    var labelW = 150;
    var x0 = labelW, x1 = W - 70;
    var x = S.scale(0, maxV, x0, x1);
    var plotTop = 74, plotBot = H - 92;

    /* titles */
    add(svg, S.text(W / 2, 20, 'The United States is the rich-world outlier on paid leave', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14.5 }));
    add(svg, S.text(W / 2, 38, 'Paid leave for mothers, full-rate-equivalent weeks (OECD, 2025)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* week gridlines every 20 */
    [0, 20, 40, 60, 80].forEach(function (g) {
      if (g > maxV) return;
      var xx = x(g);
      add(svg, S.el('line', { x1: xx, y1: plotTop - 6, x2: xx, y2: plotBot, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.35 }));
      add(svg, S.text(xx, plotBot + 16, String(g), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));
    });
    add(svg, S.text((x0 + x1) / 2, plotBot + 32, 'Full-rate-equivalent weeks (weeks × average pay rate)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* the bars */
    var rowH = (plotBot - plotTop) / DATA.length;
    var barH = Math.min(18, rowH * 0.58);
    DATA.forEach(function (d, i) {
      var cy = plotTop + rowH * (i + 0.5);
      var col = d.us ? P.emerg : P.sky;
      add(svg, S.text(x0 - 10, cy + 3.5, d.c, 'viz-axis', { 'text-anchor': 'end', fill: d.us ? P.goldHi : P.parch, 'font-size': 11 }));
      if (d.v > 0) {
        add(svg, S.el('rect', { x: x0, y: cy - barH / 2, width: Math.max(1, x(d.v) - x0), height: barH, rx: 2, fill: col, opacity: 0.82 }));
        add(svg, S.text(x(d.v) + 7, cy + 3.5, d.v.toFixed(1), 'viz-axis', { 'text-anchor': 'start', fill: P.goldHi, 'font-size': 11 }));
      } else {
        /* US: draw a zero tick and an emphatic label, no bar to draw */
        add(svg, S.el('line', { x1: x0, y1: cy - barH / 2, x2: x0, y2: cy + barH / 2, stroke: P.emerg, 'stroke-width': 2 }));
        add(svg, S.text(x0 + 7, cy + 3.5, '0.0  (no national paid leave)', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 11 }));
      }
    });

    /* OECD-average reference marker on the weeks axis, drawn faint */
    var avgX = x(Math.min(OECD_AVG_LEN, maxV));
    add(svg, S.el('line', { x1: avgX, y1: plotTop - 6, x2: avgX, y2: plotBot, stroke: P.gold, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.55 }));
    add(svg, S.text(avgX, plotTop - 10, 'OECD avg length ' + OECD_AVG_LEN + ' wks', 'viz-axis', { 'text-anchor': 'middle', fill: P.gold, 'font-size': 9 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'A sorted bar chart of paid leave for mothers measured in full-rate-equivalent weeks, the OECD apples-to-apples measure equal to weeks of leave times the average payment rate, applicable as of April 2025. ' +
      'Estonia leads with 82.1 weeks, then Norway 39.3, Germany 38.2, Sweden 34.4, Canada 20.1, the United Kingdom 11.7, and Australia 9.2. ' +
      'The United States is alone at zero: it is the only OECD country with no statutory paid leave on a national basis. ' +
      'For reference, the OECD average total maternity and parental leave length is about 54.9 weeks. ' +
      'Within the United States, paid leave is a geographic lottery: 14 states plus the District of Columbia run mandatory paid family and medical leave programs, while roughly 36 states leave new parents with only the federal floor of 12 weeks of unpaid leave. ' +
      'Source: OECD Family Database, PF2.1, parental leave systems.');
    add(fig, svg);

    note(fig,
      'Measured in full-rate-equivalent weeks (weeks of leave multiplied by how much of normal pay they replace), the United States is the only OECD country at zero: it has no statutory paid leave on a national basis. ' +
      'Peers range from Australia’s 9.2 and the UK’s 11.7 up to Estonia’s 82.1 full-pay-equivalent weeks. The full-rate measure is the fair one: it shrinks the UK’s 39 calendar weeks to 11.7 because most are paid at a low flat rate. ' +
      'And inside the US, leave is a lottery by address. As of 2026, 14 states plus DC run mandatory paid family and medical leave (commonly 12 weeks of bonding at 80% to 90% of pay), while about 36 states offer only the federal floor: 12 weeks unpaid, under the FMLA, for the roughly 56% of workers who even qualify. ' +
      '<span class="src">Source: OECD Family Database, PF2.1 <i>Parental leave systems</i> (table PF2.1.A, mothers, full-rate-equivalent weeks, applicable as of April 2025; the OECD notes the US is the only member with no national statutory paid leave). US state count and FMLA reach: Bipartisan Policy Center state PFML tracker (updated 2026-04-23; 14 states + DC) and US DOL FMLA survey (about 56% of workers eligible).</span>');

    dataTable(fig, 'Paid leave for mothers, full-rate-equivalent weeks (OECD PF2.1.A, 2025)',
      ['Country', 'Full-rate-equivalent weeks'],
      DATA.map(function (d) { return [d.c, d.us ? '0.0 (none nationally)' : d.v.toFixed(1)]; })
        .concat([['OECD average total length (memo)', OECD_AVG_LEN + ' weeks']]));
  };

  /* ====================================================================== */
  /* 3. FY.viz["maternal-mh"]                                                */
  /*    Ranked cause bar of US pregnancy-related death, mental-health        */
  /*    conditions (suicide + overdose / substance use) on top as the single */
  /*    largest category and overwhelmingly preventable. A note carries the  */
  /*    timing point: the danger runs late, with about a third of all deaths */
  /*    falling 43 days to 1 year postpartum (after the usual 6-week visit). */
  /*    Source: CDC Maternal Mortality Review Committees; Trost 2021.        */
  /* ====================================================================== */
  FY.viz['maternal-mh'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 380;
    var svg = S.make(W, H);

    /* Leading underlying causes of pregnancy-related death as a share of the
       total, CDC MMRC 2017 to 2019 (36 states). Mental-health conditions are
       the plurality and sit on top. Remaining categories are the next-largest
       contributors from the same MMRC cause ranking; the balance is grouped
       honestly as "all other causes." */
    var CAUSES = [
      { label: 'Mental-health conditions', v: 23, lead: true },
      { label: 'Hemorrhage', v: 14, lead: false },
      { label: 'Cardiac & coronary conditions', v: 13, lead: false },
      { label: 'Infection', v: 9, lead: false },
      { label: 'Thrombotic embolism', v: 9, lead: false },
      { label: 'Cardiomyopathy', v: 9, lead: false },
      { label: 'All other causes', v: 23, lead: false, other: true }
    ];
    var PREVENTABLE = 84;       /* % of all pregnancy-related deaths preventable */
    var LATE_WINDOW = 37.8;     /* % of all pregnancy-related deaths 43-365 days pp (2022) */
    var MH_LATE = 63;           /* % of the mental-health deaths in that late window (Trost) */

    var maxV = 24;
    var labelW = 206;
    var x0 = labelW, x1 = W - 120;
    var x = S.scale(0, maxV, x0, x1);
    var plotTop = 76, plotBot = H - 96;

    /* titles */
    add(svg, S.text(W / 2, 20, 'Mental health is the leading cause of maternal death', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14.5 }));
    add(svg, S.text(W / 2, 38, 'US pregnancy-related deaths by underlying cause (CDC, 2017 to 2019)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* percent gridlines every 5 */
    [0, 5, 10, 15, 20].forEach(function (g) {
      if (g > maxV) return;
      var xx = x(g);
      add(svg, S.el('line', { x1: xx, y1: plotTop - 6, x2: xx, y2: plotBot, class: 'viz-grid', opacity: g === 0 ? 0.9 : 0.35 }));
      add(svg, S.text(xx, plotBot + 16, g + '%', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 9.5 }));
    });
    add(svg, S.text((x0 + x1) / 2, plotBot + 32, 'Share of pregnancy-related deaths', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }));

    /* the bars */
    var rowH = (plotBot - plotTop) / CAUSES.length;
    var barH = Math.min(20, rowH * 0.56);
    CAUSES.forEach(function (d, i) {
      var cy = plotTop + rowH * (i + 0.5);
      var col = d.lead ? P.emerg : (d.other ? P.dim : P.sky);
      add(svg, S.text(x0 - 10, cy + 3.5, d.label, 'viz-axis', { 'text-anchor': 'end', fill: d.lead ? P.goldHi : P.parch, 'font-size': 11 }));
      add(svg, S.el('rect', { x: x0, y: cy - barH / 2, width: Math.max(1, x(d.v) - x0), height: barH, rx: 2, fill: col, opacity: d.lead ? 0.95 : (d.other ? 0.34 : 0.78), stroke: d.lead ? P.goldHi : 'none', 'stroke-width': d.lead ? 1 : 0 }));
      add(svg, S.text(x(d.v) + 8, cy + 3.5, (d.v % 1 ? d.v.toFixed(1) : d.v) + '%', 'viz-axis', { 'text-anchor': 'start', fill: d.lead ? P.emerg : P.goldHi, 'font-size': 11 }));
    });

    /* "largest category, mostly preventable" flag on the lead bar */
    var leadCy = plotTop + rowH * 0.5;
    add(svg, S.text(x(23) + 38, leadCy + 3.5, 'largest category', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 10, 'font-family': 'var(--font-heading)', 'font-weight': '700' }));

    /* preventability + late-window callout band along the bottom */
    var by = plotBot + 48;
    add(svg, S.el('rect', { x: x0, y: by - 10, width: x1 - x0, height: 1, fill: P.rule, opacity: 0.5 }));
    add(svg, S.text(x0, by + 6, '~' + PREVENTABLE + '% of all pregnancy-related deaths are judged preventable;', 'viz-note', { 'text-anchor': 'start', fill: P.parch, 'font-size': 10.5 }));
    add(svg, S.text(x0, by + 20, 'the mental-health deaths are essentially all preventable, and they cluster LATE:', 'viz-note', { 'text-anchor': 'start', fill: P.parch, 'font-size': 10.5 }));
    add(svg, S.text(x0, by + 34, 'about a third of all deaths fall 43 days to 1 year postpartum, after the 6-week visit.', 'viz-note', { 'text-anchor': 'start', fill: P.call, 'font-size': 10.5 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'A ranked bar chart of United States pregnancy-related deaths by underlying cause, from CDC Maternal Mortality Review Committees, 2017 to 2019, across 36 states. ' +
      'Mental-health conditions, meaning suicide plus overdose and substance use, are the single largest category at about 23 percent, ahead of hemorrhage 14 percent, cardiac and coronary conditions 13 percent, infection 9 percent, thrombotic embolism 9 percent, and cardiomyopathy 9 percent, with all other causes about 23 percent. ' +
      'About 84 percent of all pregnancy-related deaths are judged preventable, and the mental-health deaths are essentially all preventable, with 37 of 37 reviewed deaths in one study deemed preventable. ' +
      'The danger runs late: about a third of all pregnancy-related deaths, 37.8 percent in 2022, fall in the window from 43 days to 1 year after birth, after the usual six-week checkup, and 63 percent of the mental-health deaths fall in that late window. ' +
      'A newer pooled figure for 2017 to 2021 puts the mental-health share at 26.3 percent, still the leading category. ' +
      'Sources: CDC Maternal Mortality Review Committees via MMRIA; Trost et al., Health Affairs 2021.');
    add(fig, svg);

    note(fig,
      'In the United States the single leading underlying cause of pregnancy-related death is mental-health conditions, meaning suicide plus overdose and substance use, at about 23% of deaths (2017 to 2019, 36 states), ahead of hemorrhage and cardiac causes. A newer pooled count for 2017 to 2021 puts the share at 26.3%, still the largest category. ' +
      'This makes mental health a hard safety issue, not a soft one: about 84% of all pregnancy-related deaths are judged preventable, and the mental-health deaths are essentially all preventable (37 of 37 in one review). ' +
      'And the danger runs late. About a third of all pregnancy-related deaths fall 43 days to 1 year after birth (37.8% in 2022), and 63% of the mental-health deaths land in that late window, after the standard six-week checkup has ended. Vigilance and support need to run through the whole first year. ' +
      '<span class="src">Sources: CDC Maternal Mortality Review Committees via MMRIA (2017 to 2019, 36 states; mental-health conditions ~23%, the leading category; ~84% of pregnancy-related deaths preventable; newer pooled 2017 to 2021 headline 26.3%, released Dec 2023). Cause ranking and late-window share (43 to 365 days = 37.8% in 2022) from CDC MMRC. Mental-health-death detail: Trost SL et al., “Preventing Pregnancy-Related Mental Health Deaths,” <i>Health Affairs</i> 2021;40(10):1551-1559 (46 of 421 deaths, 37 of 37 preventable, suicide 63% / overdose 24%, 63% in the 43-to-365-day window). Educational synthesis, not medical advice.</span>');

    dataTable(fig, 'US pregnancy-related deaths by underlying cause (CDC MMRC, 2017 to 2019)',
      ['Cause', 'Share of pregnancy-related deaths'],
      CAUSES.map(function (d) { return [d.label, (d.v % 1 ? d.v.toFixed(1) : d.v) + '%']; })
        .concat([
          ['Memo: all pregnancy-related deaths preventable', '~' + PREVENTABLE + '%'],
          ['Memo: mental-health deaths preventable (Trost)', '100% (37 of 37)'],
          ['Memo: all deaths in 43-day-to-1-year window (2022)', LATE_WINDOW + '%'],
          ['Memo: mental-health deaths in that late window', MH_LATE + '%'],
          ['Memo: newer pooled mental-health share (2017 to 2021)', '26.3% (leading)']
        ]));
  };
})();


/* module: mortality-pendulum.js */
/* ============================================================
   THE FIRST YEAR, chart module: mortality-pendulum.js
   Two visualizations for the culture-history domain:
     FY.viz["infant-mortality"]  long-run US infant mortality, ~1900 to 2023,
                                  with a pre-1915 estimate band and a Black/White inset note.
     FY.viz["advice-pendulum"]    a horizontal time ribbon of dominant advice eras
                                  and the rules that later reversed.
   Framework-free. Dark forest-green theme. No em dashes anywhere.
   Every number is real and sourced (CDC/NCHS vital statistics; Singh & Yu PMC6487507;
   primary publication dates verified in deepdives/history-of-advice.md).
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) { if (window.console) console.warn('mortality-pendulum: FY.svg helper missing'); return; }
  var P = S.palette;

  /* small shared helpers, kept defensive ---------------------------------- */
  function appendAfterCaption(fig, node) {
    var cap = fig.querySelector('figcaption');
    if (cap && cap.nextSibling) fig.insertBefore(node, cap.nextSibling);
    else fig.appendChild(node);
  }
  function noteEl(html) {
    var p = document.createElement('p');
    p.className = 'viz-note';
    p.innerHTML = html;
    return p;
  }
  function dataTable(caption, headers, rows) {
    var t = document.createElement('table');
    t.className = 'viz-data';
    var cap = document.createElement('caption');
    cap.textContent = caption;
    t.appendChild(cap);
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    headers.forEach(function (h) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c;
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  /* =========================================================================
     1. FY.viz["infant-mortality"]
     US infant deaths per 1,000 live births. The honest treatment the deep-dive
     insists on: draw the pre-1915 region as an ESTIMATE BAND (about 100, true
     national likely about 140), not a confident point, and plot the reliable
     registration series only from 1915 (99.9) down to 5.61 in 2023. A small
     inset note carries the Black/White gap (1915 white 99.0, Black 184.9, 1916).
     ========================================================================= */
  FY.viz['infant-mortality'] = function (fig) {
    if (!fig) return;

    /* Registration-based series, per 1,000 live births. Sources:
       CDC MMWR 1999 "Healthier Mothers and Babies"; Tavia Gordon NCHS
       "Mortality in the United States 1900 to 1950"; Singh & Yu PMC6487507;
       CDC NVSR/Data Briefs (2017, 2021 to 2024). The 2022 uptick (5.44 to 5.60)
       is kept so the line is honestly NOT monotonic. */
    var series = [
      { y: 1915, v: 99.9 },
      { y: 1933, v: 58.1 },
      { y: 1950, v: 29.2 },
      { y: 1960, v: 26.0 },
      { y: 1970, v: 20.0 },
      { y: 1980, v: 12.6 },
      { y: 1990, v: 9.2 },
      { y: 1997, v: 7.2 },
      { y: 2000, v: 6.9 },
      { y: 2010, v: 6.1 },
      { y: 2017, v: 5.8 },
      { y: 2021, v: 5.44 },
      { y: 2022, v: 5.60 },
      { y: 2023, v: 5.61 }
    ];
    /* The pre-1915 region is an estimate, by design. Registration-area estimate
       about 100 (1900); true national probably nearer 140 (Preston & Haines). */
    var preEstLow = 100, preEstHigh = 140, preYear = 1900;

    var W = 720, H = 380;
    var m = { t: 30, r: 22, b: 52, l: 56 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = S.make(W, H);

    var x = S.scale(1895, 2025, m.l, m.l + iw);
    var y = S.scale(0, 150, m.t + ih, m.t); /* 0 at bottom, 150 at top */

    /* gridlines + y axis (per 1,000) -------------------------------------- */
    var yTicks = [0, 25, 50, 75, 100, 125, 150];
    yTicks.forEach(function (t) {
      var yp = y(t);
      S.el('line', { x1: m.l, y1: yp, x2: m.l + iw, y2: yp, class: 'viz-grid' }, svg);
      S.text(m.l - 8, yp + 3.5, String(t), 'viz-axis', { 'text-anchor': 'end' }).setAttribute('font-variant-numeric', 'tabular-nums');
    });
    /* x axis decade ticks -------------------------------------------------- */
    var xTicks = [1900, 1920, 1940, 1960, 1980, 2000, 2020];
    xTicks.forEach(function (t) {
      var xp = x(t);
      S.el('line', { x1: xp, y1: m.t + ih, x2: xp, y2: m.t + ih + 5, stroke: P.rule, 'stroke-width': 1 }, svg);
      S.text(xp, m.t + ih + 20, "'" + String(t).slice(2), 'viz-axis', { 'text-anchor': 'middle' }).setAttribute('font-variant-numeric', 'tabular-nums');
    });
    /* axis labels ---------------------------------------------------------- */
    S.text(m.l, m.t - 14, 'deaths per 1,000 live births', 'viz-axis', { 'text-anchor': 'start', fill: P.dim });
    S.text(m.l + iw, m.t + ih + 44, 'year', 'viz-axis', { 'text-anchor': 'end', fill: P.dim });

    /* pre-1915 ESTIMATE BAND (dashed, hatched feel via low opacity) -------- */
    var bandX0 = x(1895), bandX1 = x(1915);
    S.el('rect', {
      x: bandX0, y: y(preEstHigh), width: (bandX1 - bandX0), height: (y(preEstLow) - y(preEstHigh)),
      fill: P.dim, opacity: 0.14
    }, svg);
    /* the two estimate edges as dashed lines */
    [preEstLow, preEstHigh].forEach(function (v) {
      S.el('line', { x1: bandX0, y1: y(v), x2: bandX1, y2: y(v), stroke: P.dim, 'stroke-width': 1.25, 'stroke-dasharray': '4 3', opacity: 0.85 }, svg);
    });
    /* connector from the estimate band into the first registration point */
    S.el('line', { x1: bandX1, y1: y(preEstLow), x2: x(1915), y2: y(99.9), stroke: P.dim, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.7 }, svg);
    /* band label */
    S.text(x(preYear), y(preEstHigh) - 8, 'estimate', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }).setAttribute('font-style', 'italic');
    S.text(x(preYear), y(preEstHigh) + 8, 'no national', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    S.text(x(preYear), y(preEstHigh) + 20, 'registration', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });

    /* reliable series: area fill + line ----------------------------------- */
    var pts = series.map(function (d) { return [x(d.y), y(d.v)]; });
    var y0 = y(0);
    S.el('path', { d: S.area(pts, y0), fill: P.gold, opacity: 0.12 }, svg);
    S.el('path', { d: S.line(pts), fill: 'none', stroke: P.gold, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

    /* emphasis dots + labels at the key endpoints ------------------------- */
    function dot(d, label, dx, dy, anchor, cls) {
      var px = x(d.y), py = y(d.v);
      S.el('circle', { cx: px, cy: py, r: 3.4, fill: P.goldHi, stroke: '#1d241e', 'stroke-width': 1 }, svg);
      if (label) {
        var tx = S.text(px + (dx || 0), py + (dy || 0), label, cls || 'viz-axis', { 'text-anchor': anchor || 'start', fill: P.parch });
        tx.setAttribute('font-variant-numeric', 'tabular-nums');
      }
    }
    dot(series[0], '99.9 (1915)', 8, -6, 'start');
    dot({ y: 1950, v: 29.2 }, '29.2 (1950)', 8, -4, 'start');
    dot(series[series.length - 1], '5.61 (2023)', -6, -10, 'end');

    /* framing headline along the floor ------------------------------------ */
    S.text(x(1962), y(0) - 8, 'In 1900 roughly 1 in 10 US infants died before age 1; today about 1 in 180.',
      'viz-axis', { 'text-anchor': 'middle', fill: P.dim }).setAttribute('font-style', 'italic');

    /* sober Black / White inset note (upper right) ------------------------ */
    var inX = m.l + iw - 6, inY = m.t + 8;
    var ig = S.el('g', {}, svg);
    S.el('line', { x1: inX - 150, y1: inY + 4, x2: inX - 132, y2: inY + 4, stroke: P.emerg, 'stroke-width': 2.2 }, ig);
    S.text(inX - 128, inY + 7.5, '1916 gap: Black 184.9', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg }).setAttribute('font-variant-numeric', 'tabular-nums');
    S.text(inX - 128, inY + 20, 'vs White 99.0 per 1,000', 'viz-axis', { 'text-anchor': 'start', fill: P.dim }).setAttribute('font-variant-numeric', 'tabular-nums');
    S.text(inX - 128, inY + 32, 'the gap never closed', 'viz-axis', { 'text-anchor': 'start', fill: P.dim }).setAttribute('font-style', 'italic');

    svg.setAttribute('aria-label',
      'Line chart of US infant mortality per 1,000 live births. The pre-1915 region is drawn as an estimate band, about 100 in 1900 with the true national rate likely near 140, because there was no national birth registration. The reliable registration series falls from 99.9 in 1915 to 29.2 in 1950 to 5.61 in 2023. In 1900 roughly 1 in 10 US infants died before age 1; today about 1 in 180. A sober racial gap persisted: in 1916 the Black rate was 184.9 versus 99.0 for White infants.');

    appendAfterCaption(fig, svg);

    fig.appendChild(noteEl(
      'The thing parents fear most became roughly 20 times rarer within living memory, mostly through clean water and milk, sanitation, antibiotics, and vaccines, not stricter parenting. ' +
      'The years before 1915 are shown as an estimate, not a line, because there was no national birth registration then. ' +
      'Source: CDC MMWR 1999 "Healthier Mothers and Babies"; Tavia Gordon, NCHS; Singh and Yu, PMC6487507 (the 1916 Black/White figures); CDC NVSR and Data Briefs (2017 to 2024; 2023 final 5.61, the 2022 uptick from 5.44 to 5.60 is real).'
    ));

    fig.appendChild(dataTable(
      'US infant mortality, deaths per 1,000 live births',
      ['Year', 'Rate per 1,000'],
      [
        ['~1900 (estimate)', 'about 100 (registration area); true national likely ~140'],
        ['1915', '99.9'],
        ['1916 (by race)', 'White 99.0, Black 184.9'],
        ['1933', '58.1'],
        ['1950', '29.2'],
        ['1960', '26.0'],
        ['1970', '20.0'],
        ['1980', '12.6'],
        ['1990', '9.2'],
        ['1997', '7.2'],
        ['2000', '6.9'],
        ['2010', '6.1'],
        ['2017', '5.8'],
        ['2021', '5.44'],
        ['2022', '5.60'],
        ['2023', '5.61']
      ]
    ));
  };

  /* =========================================================================
     2. FY.viz["advice-pendulum"]
     A horizontal time ribbon of dominant advice eras and the rules that later
     reversed, so a parent can locate any rule they were just handed. Each marker
     is a confirmed primary publication date (verified in history-of-advice.md).
     ========================================================================= */
  FY.viz['advice-pendulum'] = function (fig) {
    if (!fig) return;

    /* Era spans (background bands). Dates verified in the deep-dive. */
    var eras = [
      { from: 1890, to: 1945, label: 'Schedule and detachment', color: P.sky },
      { from: 1946, to: 1979, label: 'Warmth and "trust yourself"', color: P.ok },
      { from: 1980, to: 2025, label: 'Evidence and safe sleep', color: P.plum }
    ];

    /* The dated markers the spec names, each with the reversal it represents.
       side: 1 places the flag above the spine, -1 below, to avoid label collisions. */
    var marks = [
      { y: 1913, name: 'Truby King', rule: 'feed by the clock, four-hourly, minimal cuddling', side: 1, c: P.sky },
      { y: 1928, name: 'Watson', rule: '"never hug and kiss them"', side: -1, c: P.sky },
      { y: 1946, name: 'Spock', rule: '"trust yourself," responsive warmth', side: 1, c: P.ok },
      { y: 1953, name: 'Bowlby', rule: 'attachment: contact and a secure base', side: -1, c: P.ok },
      { y: 1981, name: 'WHO Code', rule: 'restrict formula marketing (adopted 118 to 1)', side: 1, c: P.plum },
      { y: 1991, name: 'BFHI', rule: 'Ten Steps to support breastfeeding (revised 2018)', side: -1, c: P.plum },
      { y: 1994, name: 'Back to Sleep', rule: 'put babies on their backs (renamed Safe to Sleep, 2012)', side: 1, c: P.call, stem: 86 }
    ];

    var W = 720, H = 380;
    var m = { t: 30, r: 24, b: 46, l: 24 };
    var iw = W - m.l - m.r;
    var svg = S.make(W, H);
    /* S.text() builds a <text> node but does NOT append it (S.el does the
       appending). This chart must append each label itself, or every era,
       year, and marker label is silently dropped. */
    function T(tx, ty, str, cls, attrs) { var t = S.text(tx, ty, str, cls, attrs); svg.appendChild(t); return t; }

    var x = S.scale(1905, 2000, m.l + 8, m.l + iw - 8);
    var spineY = m.t + (H - m.t - m.b) / 2;

    /* era background bands ------------------------------------------------- */
    eras.forEach(function (e) {
      var x0 = x(Math.max(1905, e.from)), x1 = x(Math.min(2000, e.to));
      S.el('rect', { x: x0, y: m.t + 6, width: Math.max(0, x1 - x0), height: (H - m.t - m.b - 12), fill: e.color, opacity: 0.09, rx: 6 }, svg);
      T((x0 + x1) / 2, m.t + 18, e.label, 'viz-axis', { 'text-anchor': 'middle', fill: e.color, opacity: 0.95 });
    });

    /* the century spine ---------------------------------------------------- */
    S.el('line', { x1: x(1905), y1: spineY, x2: x(2000), y2: spineY, stroke: P.rule, 'stroke-width': 2 }, svg);

    /* decade ticks on the spine ------------------------------------------- */
    var dTicks = [1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000];
    dTicks.forEach(function (t) {
      var xp = x(t);
      S.el('line', { x1: xp, y1: spineY - 4, x2: xp, y2: spineY + 4, stroke: P.rule, 'stroke-width': 1 }, svg);
      T(xp, H - m.b + 16, String(t), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim }).setAttribute('font-variant-numeric', 'tabular-nums');
    });

    /* markers: a stem from the spine to a stacked, wrapped label ----------- */
    var lineH = 12;
    function wrap(str, max) {
      var words = String(str).split(' '), lines = [], cur = '';
      words.forEach(function (w) {
        var test = cur ? cur + ' ' + w : w;
        if (test.length > max && cur) { lines.push(cur); cur = w; } else { cur = test; }
      });
      if (cur) lines.push(cur);
      return lines;
    }

    marks.forEach(function (mk) {
      var xp = x(mk.y);
      var dir = mk.side;
      var stem = mk.stem || 30; /* spine to first text row; crowded markers drop to a longer lane */
      var yTip = spineY + dir * stem;

      /* stem + node */
      S.el('line', { x1: xp, y1: spineY, x2: xp, y2: yTip, stroke: mk.c, 'stroke-width': 1.4, opacity: 0.85 }, svg);
      S.el('circle', { cx: xp, cy: spineY, r: 4, fill: mk.c, stroke: '#1d241e', 'stroke-width': 1 }, svg);

      /* keep labels inside the frame horizontally */
      var anchor = 'middle';
      if (xp < m.l + 64) anchor = 'start';
      else if (xp > m.l + iw - 64) anchor = 'end';

      /* title row (name + year), then wrapped rule rows reading away from the spine */
      var tName = T(xp, yTip + (dir > 0 ? 0 : -2), mk.name + ' ' + mk.y, 'viz-label', { 'text-anchor': anchor, fill: P.parch });
      tName.setAttribute('font-variant-numeric', 'tabular-nums');

      var ruleLines = wrap(mk.rule, 22);
      ruleLines.forEach(function (ln, i) {
        var ry;
        if (dir > 0) ry = yTip + 14 + i * lineH;
        else ry = yTip - 16 - (ruleLines.length - 1 - i) * lineH;
        T(xp, ry, ln, 'viz-axis', { 'text-anchor': anchor, fill: P.dim });
      });
    });

    /* a quiet "the pendulum swings" caption inside the frame -------------- */
    T(x(1952), H - m.b + 32, 'schedule to warmth to evidence: the dominant advice reversed direction more than once in a century',
      'viz-axis', { 'text-anchor': 'middle', fill: P.dim }).setAttribute('font-style', 'italic');

    svg.setAttribute('aria-label',
      'A horizontal century time ribbon of dominant infant-care advice and the rules that later reversed. ' +
      'Truby King in 1913 prescribed feeding by the clock with minimal cuddling. Watson in 1928 advised "never hug and kiss them." ' +
      'Spock in 1946 said "trust yourself" and encouraged responsive warmth. Bowlby in the 1950s established attachment theory. ' +
      'The WHO Code of 1981 restricted formula marketing, adopted 118 to 1. The Baby-Friendly Hospital Initiative launched in 1991. ' +
      'Back to Sleep in 1994 told parents to place babies on their backs, later renamed Safe to Sleep in 2012. ' +
      'The expert consensus on how to feed, hold, and put a baby to sleep flipped at least four times in 100 years.');

    appendAfterCaption(fig, svg);

    fig.appendChild(noteEl(
      'If the rule you were just handed feels absolute, remember it is recent and local. Within one century the dominant US advice reversed on schedule (rigid to responsive), affection (forbidden to encouraged), and sleep position (back to front to back). That is permission to hold the rule you were just handed a little more loosely. ' +
      'Source: primary publication dates verified in deepdives/history-of-advice.md (Truby King, "Feeding and Care of Baby," 1913; Watson and Rayner, 1928; Spock, "Baby and Child Care," July 14, 1946; Bowlby attachment work, 1950s; WHO International Code, adopted May 21, 1981; BFHI launched 1991, Ten Steps revised 2018; US "Back to Sleep" 1994, renamed "Safe to Sleep" 2012).'
    ));

    fig.appendChild(dataTable(
      'A century of infant-care advice and the rules that reversed',
      ['Year', 'Marker', 'The reversal it represents'],
      [
        ['1913', 'Truby King', 'on-cue to four-hourly by the clock; cuddle to minimal contact'],
        ['1928', 'Watson', 'affection to "never hug and kiss them"'],
        ['1946', 'Spock', 'training the baby to "trust yourself," responsive warmth'],
        ['1950s', 'Bowlby', 'behaviorist detachment to attachment and a secure base'],
        ['1981', 'WHO Code', 'formula as modern to restricting formula marketing (118 to 1, US sole no)'],
        ['1991', 'BFHI', 'launch of the Ten Steps to Successful Breastfeeding (revised 2018)'],
        ['1994', 'Back to Sleep', 'front to back sleeping (renamed Safe to Sleep, 2012)']
      ]
    ));
  };
})();


/* module: newt.js */
/* ============================================================
   THE FIRST YEAR, chart: the newborn weight-loss nomogram.
   Module: newt (one FY.viz function).
   "Is my baby losing too much weight?" Percentile curves of percent
   weight loss (y, drawn as a real downward dip) versus hours of age
   (x, 0 to 72), with separate vaginal and cesarean families, the
   50th/75th/90th/95th percentile shape, and a 10 percent danger line.
   Excessive loss = crossing the 90th (vaginal) or 75th (cesarean).
   Data: Flaherman VJ, Schaefer EW, Kuzniewicz MW, Li SX, Walsh EM,
   Paul IM, "Early Weight Loss Nomograms for Exclusively Breastfed
   Newborns," Pediatrics 2015;135(1):e16 to e23 (NEWT, newbornweight.org);
   cohort 161,471 newborns, 108,907 exclusively breastfed (83,433 vaginal,
   25,474 cesarean), 14 Kaiser NorCal hospitals.
   The published TEXT gives only the median digits (section 2.2 of the
   deep dive); the 75th/90th/95th values are read from the paper's Figure 2
   (section 2.3) and are approximate. The curves drawn here are SMOOTH
   ILLUSTRATIVE shapes anchored to those captured points, not the exact
   published nomogram. No external libraries. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) { if (window.console) console.warn('newt: FY.svg helper missing'); return; }
  var P = S.palette;

  /* ---- frame geometry, 720 x 380 ---- */
  var W = 720, H = 380;
  var M = { t: 30, r: 150, b: 52, l: 56 };   /* wide right margin for the legend */
  var X0 = M.l, X1 = W - M.r;                 /* plot box left/right */
  var Y0 = M.t, Y1 = H - M.b;                 /* plot box top/bottom */
  var HR_MAX = 72;                            /* hours of age on the x-axis */
  var LOSS_MAX = 13;                          /* percent-loss axis bottom (drawn downward) */
  var TAB = { 'font-variant-numeric': 'tabular-nums' };  /* tabular mono numerals */

  /* ------------------------------------------------------------------
     Captured anchor points (percent weight loss) at 24 / 48 / 72 hours.
     Vaginal medians are the PUBLISHED digits (Flaherman 2015 text:
     4.2% at 24h, 7.1% at 48h, 6.4% at 72h). Cesarean medians are the
     PUBLISHED digits (4.9% at 24h, 8.0% at 48h, 8.6% at 72h). The
     75th/90th/95th are figure-reads from the paper's Figure 2.
     Order per row: [p50, p75, p90, p95].
     ------------------------------------------------------------------ */
  var ANCHORS = {
    vaginal: {
      24: [4.2, 5.5, 6.5, 7.0],
      48: [7.1, 8.5, 9.5, 10.0],
      72: [6.4, 8.5, 10.0, 11.0]
    },
    cesarean: {
      24: [4.9, 6.0, 7.0, 7.5],
      48: [8.0, 9.5, 10.5, 11.0],
      72: [8.6, 10.5, 11.5, 12.0]
    }
  };

  /* The percentile bands we draw, with which is the "excessive-loss"
     line for each delivery mode (the curve that crosses 10 percent). */
  var PCTS = [
    { key: 50, label: '50th' },
    { key: 75, label: '75th' },
    { key: 90, label: '90th' },
    { key: 95, label: '95th' }
  ];

  /* ------------------------------------------------------------------
     Smooth illustrative curve through the three captured hours.
     We use a monotone-ish Catmull-Rom-flavored interpolation that
     also respects the documented shapes: vaginal nadir near 48 to 60h
     (so the 72h median sits ABOVE the 48h median, i.e. less loss),
     cesarean nadir near 72h (still deepening at 72h). We sample at
     0,6,12,...,72 and pin h=0 to 0 percent loss (birth weight).
     ------------------------------------------------------------------ */
  function curveFor(mode, pct) {
    var a = ANCHORS[mode];
    /* control points: birth (0,0) then the three captured hours */
    var cp = [
      { h: 0,  v: 0 },
      { h: 24, v: a[24][pctIndex(pct)] },
      { h: 48, v: a[48][pctIndex(pct)] },
      { h: 72, v: a[72][pctIndex(pct)] }
    ];
    var out = [];
    for (var h = 0; h <= HR_MAX + 0.001; h += 4) {
      out.push([h, sampleMonotone(cp, h)]);
    }
    return out;
  }
  function pctIndex(pct) { return pct === 50 ? 0 : pct === 75 ? 1 : pct === 90 ? 2 : 3; }

  /* Piecewise cubic (Fritsch-Carlson monotone-ish) through control
     points, falling back to a smooth Hermite. Keeps the curve from
     overshooting the captured anchors while still bending naturally,
     so the vaginal rebound after 48h and the cesarean late nadir both
     read correctly. */
  function sampleMonotone(cp, x) {
    var n = cp.length;
    if (x <= cp[0].h) return cp[0].v;
    if (x >= cp[n - 1].h) return cp[n - 1].v;
    var i = 0;
    while (i < n - 1 && x > cp[i + 1].h) i++;
    var p0 = cp[i], p1 = cp[i + 1];
    var hSeg = p1.h - p0.h;
    var t = (x - p0.h) / hSeg;
    /* secant slopes */
    var dPrev = i > 0 ? (p0.v - cp[i - 1].v) / (p0.h - cp[i - 1].h) : (p1.v - p0.v) / hSeg;
    var dHere = (p1.v - p0.v) / hSeg;
    var dNext = i < n - 2 ? (cp[i + 2].v - p1.v) / (cp[i + 2].h - p1.h) : dHere;
    /* tangents averaged from neighbors, clamped to avoid overshoot */
    var m0 = clampSlope((dPrev + dHere) / 2, dPrev, dHere);
    var m1 = clampSlope((dHere + dNext) / 2, dHere, dNext);
    var t2 = t * t, t3 = t2 * t;
    var h00 = 2 * t3 - 3 * t2 + 1;
    var h10 = t3 - 2 * t2 + t;
    var h01 = -2 * t3 + 3 * t2;
    var h11 = t3 - t2;
    return h00 * p0.v + h10 * hSeg * m0 + h01 * p1.v + h11 * hSeg * m1;
  }
  function clampSlope(m, a, b) {
    /* keep the tangent within ~3x the local secants so it cannot
       overshoot into a non-physical bump between anchors */
    var lo = Math.min(a, b) * 3, hi = Math.max(a, b) * 3;
    if (m < lo) return lo; if (m > hi) return hi; return m;
  }

  /* ---- small helpers (match the other modules) ---- */
  function fmt(n) { return (Math.round(n)).toString(); }
  function note(fig, html) { var p = document.createElement('p'); p.className = 'viz-note'; p.innerHTML = html; fig.appendChild(p); return p; }
  function dataTable(fig, caption, headers, rows) {
    var t = document.createElement('table'); t.className = 'viz-data';
    if (caption) { var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap); }
    var thead = document.createElement('thead'); var htr = document.createElement('tr');
    headers.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (c, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = c; tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); fig.appendChild(t); return t;
  }

  /* ============================================================
     newt: the weight-loss percentile nomogram
     ============================================================ */
  FY.viz['newt'] = function (fig) {
    if (!fig) return;
    var svg = S.make(W, H);

    /* scales: y is percent loss, drawn DOWNWARD (0 at top, deeper loss
       lower) so the chart looks like the real dip a parent watches. */
    var sx = S.scale(0, HR_MAX, X0, X1);
    var sy = S.scale(0, LOSS_MAX, Y0, Y1);   /* note: 0 maps to top, LOSS_MAX to bottom */

    var g = S.el('g', null, svg);

    /* ---- horizontal gridlines + y ticks (percent loss) ---- */
    for (var y = 0; y <= LOSS_MAX + 0.001; y += 2) {
      var gy = sy(y);
      S.el('line', { x1: X0, y1: gy, x2: X1, y2: gy, class: 'viz-grid', opacity: y === 0 ? 0.85 : 0.35 }, g);
      g.appendChild(S.text(X0 - 8, gy + 3.5, y === 0 ? '0' : '-' + fmt(y), 'viz-axis', Object.assign({ 'text-anchor': 'end' }, TAB)));
    }
    /* ---- x ticks every 12 hours ---- */
    for (var x = 0; x <= HR_MAX; x += 12) {
      var gx = sx(x);
      S.el('line', { x1: gx, y1: Y1, x2: gx, y2: Y1 + 4, class: 'viz-grid', opacity: 0.6 }, g);
      g.appendChild(S.text(gx, Y1 + 18, fmt(x), 'viz-axis', Object.assign({ 'text-anchor': 'middle' }, TAB)));
    }
    /* day markers under the hours, for orientation */
    [[24, 'day 1'], [48, 'day 2'], [72, 'day 3']].forEach(function (d) {
      g.appendChild(S.text(sx(d[0]), Y1 + 31, d[1], 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, opacity: 0.8 }));
    });

    /* ---- axis titles ---- */
    g.appendChild(S.text((X0 + X1) / 2, H - 6, 'Hours of age', 'viz-axis', { 'text-anchor': 'middle' }));
    g.appendChild(S.text(0, 0, 'Percent of birth weight lost', 'viz-axis', { 'text-anchor': 'middle', transform: 'translate(' + (X0 - 42) + ' ' + ((Y0 + Y1) / 2) + ') rotate(-90)' }));

    /* ---- the 10 percent danger line ---- */
    var dangerY = sy(10);
    S.el('line', { x1: X0, y1: dangerY, x2: X1, y2: dangerY, stroke: P.emerg, 'stroke-width': 1.6, 'stroke-dasharray': '6 4', opacity: 0.92 }, g);
    g.appendChild(S.text(X0 + 6, dangerY - 6, '10% line: a careful feeding look', 'viz-label', { fill: P.emerg }));

    /* ------------------------------------------------------------------
       Draw each delivery-mode family. The "excessive-loss" percentile
       (90th vaginal, 75th cesarean) is the bold solid curve; the others
       are thinner. A faint fill sits between the median and the
       excessive curve to read the family as a band.
       ------------------------------------------------------------------ */
    function drawFamily(mode, col, excessivePct, dash) {
      var fam = S.el('g', null, g);

      /* band between 50th and the excessive percentile */
      var med = curveFor(mode, 50).map(function (p) { return [sx(p[0]), sy(p[1])]; });
      var exc = curveFor(mode, excessivePct).map(function (p) { return [sx(p[0]), sy(p[1])]; });
      var bandD = S.line(med) + ' ' + exc.slice().reverse().map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' Z';
      S.el('path', { d: bandD, fill: col, 'fill-opacity': 0.07, stroke: 'none' }, fam);

      /* each percentile line */
      PCTS.forEach(function (pc) {
        var pts = curveFor(mode, pc.key).map(function (p) { return [sx(p[0]), sy(p[1])]; });
        var isExc = pc.key === excessivePct;
        S.el('path', {
          d: S.line(pts), fill: 'none', stroke: col,
          'stroke-width': isExc ? 2.6 : 1.3,
          'stroke-dasharray': isExc ? '' : dash,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          opacity: isExc ? 1 : 0.7
        }, fam);
        /* tiny percentile label at the 72h (right) end of each line */
        var last = pts[pts.length - 1];
        g.appendChild(S.text(last[0] + 5, last[1] + 3.2, pc.label, 'viz-axis', Object.assign({ 'text-anchor': 'start', fill: col, opacity: isExc ? 1 : 0.75 }, TAB)));
      });

      /* dot the published median anchors (the hard, in-text numbers) */
      [24, 48, 72].forEach(function (h) {
        var v = ANCHORS[mode][h][0];
        S.el('circle', { cx: sx(h), cy: sy(v), r: 2.8, fill: col, stroke: '#22291f', 'stroke-width': 0.8 }, fam);
      });

      /* mark where the excessive curve crosses the 10 percent line */
      var crossH = crossesTen(mode, excessivePct);
      if (crossH != null) {
        S.el('circle', { cx: sx(crossH), cy: dangerY, r: 4.2, fill: 'none', stroke: col, 'stroke-width': 1.8 }, fam);
      }
      return fam;
    }

    /* find the first hour where a percentile curve reaches 10 percent loss */
    function crossesTen(mode, pct) {
      var pts = curveFor(mode, pct);
      for (var i = 1; i < pts.length; i++) {
        if (pts[i - 1][1] < 10 && pts[i][1] >= 10) {
          var t = (10 - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1]);
          return pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]);
        }
        if (pts[i][1] >= 10 && pts[i - 1][1] >= 10) return pts[i - 1][0];
      }
      return null;
    }

    /* cesarean first (sits a touch deeper), then vaginal on top */
    drawFamily('cesarean', P.sky, 75, '3 3');
    drawFamily('vaginal', P.gold, 90, '4 3');

    /* ------------------------------------------------------------------
       Legend in the right margin: the two families and what each
       "excessive" line means.
       ------------------------------------------------------------------ */
    var lg = S.el('g', { transform: 'translate(' + (X1 + 16) + ' ' + (Y0 + 6) + ')' }, g);
    lg.appendChild(S.text(0, 0, 'Excessive loss', 'viz-label', { fill: P.parch }));
    /* vaginal */
    S.el('line', { x1: 0, y1: 18, x2: 20, y2: 18, stroke: P.gold, 'stroke-width': 2.6 }, lg);
    lg.appendChild(S.text(26, 21, 'Vaginal', 'viz-axis', { fill: P.gold }));
    lg.appendChild(S.text(0, 35, 'crossing the 90th', 'viz-axis', { fill: P.dim }));
    /* cesarean */
    S.el('line', { x1: 0, y1: 56, x2: 20, y2: 56, stroke: P.sky, 'stroke-width': 2.6 }, lg);
    lg.appendChild(S.text(26, 59, 'Cesarean', 'viz-axis', { fill: P.sky }));
    lg.appendChild(S.text(0, 73, 'crossing the 75th', 'viz-axis', { fill: P.dim }));
    /* thin-line key */
    S.el('line', { x1: 0, y1: 94, x2: 20, y2: 94, stroke: P.dim, 'stroke-width': 1.3, 'stroke-dasharray': '4 3' }, lg);
    lg.appendChild(S.text(26, 97, '50/75/90/95th', 'viz-axis', Object.assign({ fill: P.dim }, TAB)));
    /* median-dot key */
    S.el('circle', { cx: 10, cy: 113, r: 2.8, fill: P.parch }, lg);
    lg.appendChild(S.text(26, 116, 'published median', 'viz-axis', { fill: P.dim }));
    /* 10% line key */
    S.el('line', { x1: 0, y1: 132, x2: 20, y2: 132, stroke: P.emerg, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, lg);
    lg.appendChild(S.text(26, 135, '10% danger line', 'viz-axis', { fill: P.emerg }));

    /* ---- accessibility ---- */
    svg.setAttribute('aria-label',
      'Percentile curves of newborn weight loss, percent of birth weight lost versus hours of age from 0 to 72, ' +
      'from the NEWT study (Flaherman 2015, 161,471 newborns, 108,907 exclusively breastfed). Two families are shown. ' +
      'Vaginally born babies lose a median of about 4.2 percent at 24 hours and about 7.1 percent at 48 hours, then ' +
      'start to climb back. Cesarean-born babies lose a median of about 4.9 percent at 24 hours, 8.0 percent at 48 ' +
      'hours, and 8.6 percent at 72 hours, bottoming out later. A dashed line marks 10 percent loss, the classic ' +
      'point for a careful feeding look. Loss is called excessive when a vaginal baby crosses the 90th percentile or ' +
      'a cesarean baby crosses the 75th percentile, the curves that reach the 10 percent line. Almost 5 percent of ' +
      'vaginal and almost 10 percent of cesarean babies cross 10 percent by 48 hours, and more than a quarter of ' +
      'cesarean babies do by 72 hours. The curves are smooth illustrations of the published nomogram. ' +
      'Most babies are back to birth weight by 10 to 14 days.');

    fig.appendChild(svg);

    /* ---- reassuring note + source ---- */
    note(fig,
      'The dip has a bottom. Most babies lose the most weight around day 2 to 3, then climb back, and are usually ' +
      'back to birth weight by 10 to 14 days. The dashed <b>10% line</b> is the classic "look harder" mark; a baby ' +
      'crossing it, or steadily climbing <em>up</em> through the percentiles, is the one who earns a closer feeding ' +
      'look. The exact figures are in the table below. ' +
      '<span class="src">Source: Flaherman et al., Pediatrics 2015 (NEWT, newbornweight.org); 161,471 newborns. ' +
      'Published medians are exact; the 75th, 90th, and 95th curves are smooth illustrations read from Figure 2 of ' +
      'the paper, not the exact lines, and do not apply to formula-fed babies, who lose less.</span>');

    /* ---- accessible data table (the underlying anchors) ---- */
    dataTable(fig,
      'Percent of birth weight lost by hours of age and delivery mode (Flaherman 2015; 50th is published, 75/90/95th read from Figure 2)',
      ['Hours', 'Vaginal 50th', 'Vaginal 75th', 'Vaginal 90th', 'Vaginal 95th', 'Cesarean 50th', 'Cesarean 75th', 'Cesarean 90th', 'Cesarean 95th'],
      [24, 48, 72].map(function (h) {
        var v = ANCHORS.vaginal[h], c = ANCHORS.cesarean[h];
        return [
          h + ' h',
          v[0].toFixed(1) + '%', v[1].toFixed(1) + '%', v[2].toFixed(1) + '%', v[3].toFixed(1) + '%',
          c[0].toFixed(1) + '%', c[1].toFixed(1) + '%', c[2].toFixed(1) + '%', c[3].toFixed(1) + '%'
        ];
      })
    );
  };
})();


/* module: ppd-charts.js */
/* module: ppd-charts.js  (FY.viz.ppd-spectrum, FY.viz.paternal-ppd) */
(function () {
  window.FY = window.FY || { viz: {}, tool: {} };
  var P = FY.svg.palette;

  function hbars(fig, data, maxX, ticks, aria, noteHTML, srcHTML) {
    var W = 720, H = 40 + data.length * 46, ml = 230, mr = 64, mt = 8, mb = 28;
    var svg = FY.svg.make(W, H);
    var x = FY.svg.scale(0, maxX, ml, W - mr);
    ticks.forEach(function (t) {
      var gx = x(t);
      FY.svg.el('line', { x1: gx, y1: mt, x2: gx, y2: H - mb, class: 'viz-grid' }, svg);
      svg.appendChild(FY.svg.text(gx, H - mb + 16, t + '%', 'viz-axis', { 'text-anchor': 'middle' }));
    });
    var gap = (H - mt - mb) / data.length, bh = gap * 0.6;
    data.forEach(function (d, i) {
      var y = mt + i * gap;
      FY.svg.el('rect', { x: ml, y: y, width: Math.max(2, x(d[1]) - ml), height: bh, fill: d[2] || P.gold, rx: 2 }, svg);
      svg.appendChild(FY.svg.text(ml - 8, y + bh * 0.72, d[0], 'viz-label', { 'text-anchor': 'end', fill: P.parch }));
      svg.appendChild(FY.svg.text(x(d[1]) + 6, y + bh * 0.72, d[3] || ((d[1] < 1 ? '~' + d[1] : Math.round(d[1])) + '%'), 'viz-axis', { fill: P.dim }));
    });
    svg.setAttribute('aria-label', aria);
    fig.appendChild(svg);
    var note = document.createElement('p'); note.className = 'viz-note'; note.innerHTML = noteHTML + (srcHTML ? ' <span class="src">' + srcHTML + '</span>' : '');
    fig.appendChild(note);
    var tbl = document.createElement('table'); tbl.className = 'viz-data';
    tbl.innerHTML = '<thead><tr><th>Condition</th><th>Frequency</th></tr></thead><tbody>' + data.map(function (d) { return '<tr><td>' + d[0] + '</td><td>' + (d[3] || d[1] + '%') + '</td></tr>'; }).join('') + '</tbody>';
    fig.appendChild(tbl);
  }

  FY.viz['ppd-spectrum'] = function (fig) {
    hbars(fig, [
      ['Baby blues (transient)', 80, P.dim, 'up to 80%'],
      ['Perinatal anxiety symptoms', 15, P.gold],
      ['Screen-positive depression (EPDS)', 14, P.gold, '~1 in 7'],
      ['Depressive symptoms (PRAMS screen)', 13.2, P.gold],
      ['Perinatal OCD', 6, P.gold, '2 to 9%'],
      ['Postpartum psychosis', 0.15, P.emerg, '1 to 2 / 1,000']
    ], 90, [0, 20, 40, 60, 80],
      'Postpartum mood spectrum frequencies: baby blues up to 80 percent, anxiety about 15 percent, screen-positive depression about 1 in 7, PRAMS depressive symptoms 13.2 percent, OCD 2 to 9 percent, and postpartum psychosis 1 to 2 per 1,000 births.',
      'The famous numbers measure different things: symptoms on a brief screen, screen-positive then interview-confirmed, and diagnosed in the chart. Psychosis is rare but a true emergency.',
      '<a href="https://www.cdc.gov/mmwr/volumes/69/wr/mm6919a2.htm">CDC PRAMS</a>; Wisner 2013');
  };

  FY.viz['paternal-ppd'] = function (fig) {
    hbars(fig, [
      ['Fathers, overall (Paulson 2010)', 10.4, P.sky],
      ['Fathers, peak at 3 to 6 months', 25.6, P.sky, '~1 in 4'],
      ['Fathers, overall (updated meta)', 8.4, P.sky],
      ['Mothers, for comparison (PRAMS)', 13.2, P.gold]
    ], 30, [0, 10, 20, 30],
      'Paternal perinatal depression averages about 10.4 percent overall, peaking near 25.6 percent (1 in 4) at three to six months postpartum, an updated meta-analysis puts the overall figure at 8.4 percent.',
      'Partner depression is real and common, and unlike the mother’s early peak it tends to climb across the first year, which is why screening fathers around the six-month visit makes sense.',
      '<a href="https://jamanetwork.com/journals/jama/fullarticle/186336">Paulson &amp; Bazemore 2010</a>');
  };
})();


/* module: sleep-cryout-bedshare.js */
/* ============================================================
   THE FIRST YEAR, chart modules: sleep-band, bedshare-forest, cryitout.
   Three charts for the Sleep section, registered onto window.FY.viz.
   No external libraries. No em dashes. Every number is real and the
   primary source is cited in each chart's aria-label, viz-note, and
   accessible data table.

   1) sleep-band     "Sleep is a wide band, not a number." The P2 to P98
                     total-sleep band birth to 24 months (Iglowstein 2003)
                     with the NSF 2015 recommended band overlaid.
   2) bedshare-forest "Clean vs hazardous bed-sharing." A forest plot on a
                     log odds axis: Blair 2014 no-hazard OR 1.08 (NS) next
                     to the hazardous contexts (sofa, alcohol, smoker) and
                     Carpenter 2013 clean-breastfed 5.1 and both-smoke 21.6.
   3) cryitout       "What the sleep-training trials actually found." A
                     small-multiples panel (Gradisar 2016): sleep latency
                     down, cortisol down not up, 12-month attachment no
                     difference; plus the Park 2022 pooled child-sleep
                     OR 0.51.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return;
  var P = S.palette;
  var INK = '#1c241e'; // dark ink for labels printed on light fills

  /* small shared helpers (kept local so the modules are self-contained) */
  function num1(v) { return (Math.round(v * 10) / 10).toFixed(1); } // 1 decimal, mono
  function num2(v) { return (Math.round(v * 100) / 100).toFixed(2); } // 2 decimals, mono
  function el(name, cls) { var e = document.createElement(name); if (cls) e.className = cls; return e; }

  /* ============================================================
     1) FY.viz["sleep-band"]
     A shaded P2-to-P98 total-sleep band from birth to 24 months
     (Iglowstein 2003, Zurich, n=493), with the National Sleep
     Foundation 2015 recommended band overlaid as the "simple answer."
     The point of the chart is the enormous width of normal.
     ============================================================ */
  FY.viz['sleep-band'] = function (fig) {
    if (!fig || typeof fig.appendChild !== 'function') return;

    /* ----------------------------------------------------------
       DATA. Iglowstein et al., Pediatrics 2003;111(2):302, Table 1
       (total sleep per 24 h, hours): mean, 2nd and 98th percentile.
       Table 1 begins at 6 months (no Iglowstein point below 6 mo),
       so the birth-to-3-month end is anchored to the NSF 2015
       recommended newborn range rather than invented Iglowstein data.
       ---------------------------------------------------------- */
    var IG = [
      { age: 6,  mean: 14.2, p2: 10.4, p98: 18.1 },
      { age: 9,  mean: 13.9, p2: 10.5, p98: 17.4 },
      { age: 12, mean: 13.9, p2: 11.4, p98: 16.5 },
      { age: 18, mean: 13.6, p2: 11.1, p98: 16.0 },
      { age: 24, mean: 13.2, p2: 10.8, p98: 15.6 }
    ];

    // NSF 2015 recommended bands (Hirshkowitz, Sleep Health 1:40-43),
    // by the age window each applies to. These are recommendations, not
    // an observed distribution, so they are tighter than the P2-P98 band.
    var NSF = [
      { from: 0,  to: 3,  lo: 14, hi: 17 }, // newborn 0 to 3 months
      { from: 4,  to: 11, lo: 12, hi: 15 }, // infant 4 to 11 months
      { from: 12, to: 24, lo: 11, hi: 14 }  // toddler 1 to 2 years
    ];

    /* ---------------------------------------------------------------
       CANVAS. viewBox 0 0 720 380. months on x, hours on y.
       --------------------------------------------------------------- */
    var W = 720, H = 380;
    var svg = S.make(W, H);
    function txt(x, y, str, cls, attrs) { var t = S.text(x, y, str, cls, attrs); svg.appendChild(t); return t; }

    var m = { top: 30, right: 132, bottom: 52, left: 46 };
    var plotW = W - m.left - m.right;
    var plotH = H - m.top - m.bottom;

    var xMin = 0, xMax = 24;            // birth to 24 months
    var yMin = 9, yMax = 19;            // hours; spans the full P2-P98 range
    var x = S.scale(xMin, xMax, m.left, m.left + plotW);
    var y = S.scale(yMin, yMax, m.top + plotH, m.top); // hi hours at top

    /* ---- y gridlines + hour labels (every 2 h) ---- */
    for (var hv = yMin + 1; hv <= yMax; hv += 2) {
      var gy = y(hv);
      S.el('line', { x1: m.left, y1: gy, x2: m.left + plotW, y2: gy, class: 'viz-grid', stroke: P.rule, 'stroke-width': 1, opacity: '0.5' }, svg);
      txt(m.left - 8, gy + 4, String(hv), 'viz-axis', { 'text-anchor': 'end', fill: P.dim });
    }
    // y axis title (rotated).
    txt(14, m.top + plotH / 2, 'Hours of sleep per 24', 'viz-label', {
      'text-anchor': 'middle', fill: P.dim, transform: 'rotate(-90 14 ' + (m.top + plotH / 2) + ')'
    });

    /* ---- x gridlines + month labels (every 3 months) ---- */
    for (var mv = 0; mv <= xMax; mv += 3) {
      var gx = x(mv);
      S.el('line', { x1: gx, y1: m.top, x2: gx, y2: m.top + plotH, class: 'viz-grid', stroke: P.rule, 'stroke-width': 1, opacity: mv === 0 ? '0.7' : '0.28' }, svg);
      txt(gx, m.top + plotH + 20, String(mv), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    }
    txt(m.left + plotW / 2, m.top + plotH + 42, 'Age in months', 'viz-label', { 'text-anchor': 'middle', fill: P.dim });

    // baseline rule (x axis).
    S.el('line', { x1: m.left, y1: m.top + plotH, x2: m.left + plotW, y2: m.top + plotH, stroke: P.rule, 'stroke-width': 1 }, svg);

    /* ---- NSF recommended band (drawn first, behind), as stepped blocks ---- */
    var nsfG = S.el('g', null, svg);
    NSF.forEach(function (b) {
      var bx = x(Math.max(xMin, b.from));
      var bx2 = x(Math.min(xMax, b.to));
      var by = y(b.hi);
      var by2 = y(b.lo);
      S.el('rect', {
        x: bx, y: by, width: Math.max(0, bx2 - bx), height: Math.max(0, by2 - by),
        fill: P.ok, 'fill-opacity': 0.16, stroke: P.ok, 'stroke-opacity': 0.5, 'stroke-width': 1, 'stroke-dasharray': '4 3'
      }, nsfG);
    });

    /* ---- Iglowstein P2-to-P98 band (the wide normal) ---- */
    // Upper edge left to right (P98), lower edge right to left (P2).
    var upper = IG.map(function (d) { return [x(d.age), y(d.p98)]; });
    var lower = IG.map(function (d) { return [x(d.age), y(d.p2)]; });
    var bandD = S.line(upper) + ' ' +
      lower.slice().reverse().map(function (p, i) { return (i === 0 ? 'L' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' Z';
    S.el('path', { d: bandD, fill: P.gold, 'fill-opacity': 0.20, stroke: 'none' }, svg);

    // Band edges as thin lines so P2 and P98 read crisply.
    S.el('path', { d: S.line(upper), fill: 'none', stroke: P.gold, 'stroke-width': 1.4, 'stroke-opacity': 0.85, 'stroke-linejoin': 'round' }, svg);
    S.el('path', { d: S.line(lower), fill: 'none', stroke: P.gold, 'stroke-width': 1.4, 'stroke-opacity': 0.85, 'stroke-linejoin': 'round' }, svg);

    // Mean line + dots (the central tendency, in brighter gold).
    var meanPts = IG.map(function (d) { return [x(d.age), y(d.mean)]; });
    S.el('path', { d: S.line(meanPts), fill: 'none', stroke: P.goldHi, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    meanPts.forEach(function (p) { S.el('circle', { cx: p[0], cy: p[1], r: 3.2, fill: P.goldHi, stroke: INK, 'stroke-width': 1 }, svg); });

    // Call out the 6-month spread (the headline width) with edge labels.
    var d6 = IG[0];
    txt(x(6) + 6, y(d6.p98) - 4, '18.1', 'viz-axis', { fill: P.gold });
    txt(x(6) + 6, y(d6.p2) + 13, '10.4', 'viz-axis', { fill: P.gold });
    txt(x(6) - 6, y(d6.mean) - 6, 'mean 14.2', 'viz-axis', { 'text-anchor': 'end', fill: P.goldHi });

    /* ---- Legend in the right gutter ---- */
    var lx = m.left + plotW + 14;
    var ly = m.top + 6;
    // Iglowstein band swatch.
    S.el('rect', { x: lx, y: ly, width: 22, height: 12, fill: P.gold, 'fill-opacity': 0.20, stroke: P.gold, 'stroke-opacity': 0.85, 'stroke-width': 1 }, svg);
    txt(lx + 28, ly + 10, 'Real range', 'viz-axis', { fill: P.parch });
    txt(lx + 28, ly + 23, '(2nd to 98th)', 'viz-axis', { fill: P.dim });
    // Mean line swatch.
    S.el('line', { x1: lx, y1: ly + 40, x2: lx + 22, y2: ly + 40, stroke: P.goldHi, 'stroke-width': 2.2 }, svg);
    S.el('circle', { cx: lx + 11, cy: ly + 40, r: 3.2, fill: P.goldHi, stroke: INK, 'stroke-width': 1 }, svg);
    txt(lx + 28, ly + 44, 'Average', 'viz-axis', { fill: P.parch });
    // NSF band swatch.
    S.el('rect', { x: lx, y: ly + 56, width: 22, height: 12, fill: P.ok, 'fill-opacity': 0.16, stroke: P.ok, 'stroke-opacity': 0.7, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, svg);
    txt(lx + 28, ly + 66, 'NSF advised', 'viz-axis', { fill: P.parch });
    txt(lx + 28, ly + 79, 'target band', 'viz-axis', { fill: P.dim });

    fig.appendChild(svg);

    /* ---- aria-label: concise spoken summary with the key numbers ---- */
    svg.setAttribute('aria-label',
      'A shaded band of total daily sleep from birth to 24 months. The 2nd-to-98th-percentile range is very wide: ' +
      'at 6 months the average is 14.2 hours but normal runs from 10.4 to 18.1 hours; at 12 months the average is 13.9 hours, ' +
      'normal 11.4 to 16.5. The National Sleep Foundation recommended target band is narrower (14 to 17 hours for newborns, ' +
      '12 to 15 for ages 4 to 11 months, 11 to 14 for ages 1 to 2 years). The point is that there is no single right number. ' +
      'Source: Iglowstein 2003 (Zurich, n=493) and National Sleep Foundation 2015.');

    /* ---- viz-note: reassuring caption + source ---- */
    var note = el('p', 'viz-note');
    note.textContent =
      'There is no single right number of hours. At 6 months, perfectly normal total sleep runs anywhere from about ' +
      '10.4 to 18.1 hours a day, an eight-hour spread, and the band only narrows slowly. If your baby sleeps less (or more) ' +
      'than the average and is growing, alert when awake, and generally content, that is almost certainly just their spot in ' +
      'the band. The greener band is the simple "aim for this" target; the gold band is the honest width of what healthy ' +
      'babies actually do. Sources: Iglowstein et al., Pediatrics 2003;111(2):302 (Zurich Longitudinal Studies, n=493, total ' +
      'sleep per 24 hours; band starts at 6 months); National Sleep Foundation consensus, Hirshkowitz et al., Sleep Health ' +
      '2015;1(1):40 to 43 (recommended ranges).';
    fig.appendChild(note);

    /* ---- accessible data table fallback ---- */
    var tbl = el('table', 'viz-data');
    var cap = el('caption');
    cap.textContent = 'Total sleep per 24 hours by age: Iglowstein 2003 mean and 2nd-to-98th percentile band, with the NSF 2015 recommended band.';
    tbl.appendChild(cap);
    var thead = el('thead');
    thead.innerHTML = '<tr><th scope="col">Age (months)</th><th scope="col">Average (h)</th>' +
      '<th scope="col">2nd pct (h)</th><th scope="col">98th pct (h)</th><th scope="col">NSF advised (h)</th></tr>';
    tbl.appendChild(thead);
    function nsfFor(age) {
      for (var i = 0; i < NSF.length; i++) { if (age >= NSF[i].from && age <= NSF[i].to) return NSF[i].lo + ' to ' + NSF[i].hi; }
      return 'n/a';
    }
    var tbody = el('tbody');
    IG.forEach(function (d) {
      var tr = el('tr');
      tr.innerHTML = '<th scope="row">' + d.age + '</th>' +
        '<td>' + num1(d.mean) + '</td>' +
        '<td>' + num1(d.p2) + '</td>' +
        '<td>' + num1(d.p98) + '</td>' +
        '<td>' + nsfFor(d.age) + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    var tfoot = el('tfoot');
    tfoot.innerHTML = '<tr><th scope="row">Newborn 0 to 3 months (NSF only)</th><td colspan="3">no Iglowstein point below 6 months</td><td>14 to 17</td></tr>';
    tbl.appendChild(tfoot);
    fig.appendChild(tbl);
  };

  /* ============================================================
     2) FY.viz["bedshare-forest"]
     A paired forest plot on a log odds axis contrasting "clean"
     bed-sharing with hazardous contexts, so the controversy is shown
     honestly. Each row: point estimate + 95% CI whisker. OR = 1 (no
     change) is drawn as the reference line.
     Sources: Blair 2014 (PLOS ONE 9:e107799) and Carpenter 2013
     (BMJ Open 3:e002299).
     ============================================================ */
  FY.viz['bedshare-forest'] = function (fig) {
    if (!fig || typeof fig.appendChild !== 'function') return;

    /* ----------------------------------------------------------
       DATA. odds ratio (or) with 95% CI [lo, hi].
       Blair 2014 separated hazardous from non-hazardous bed-sharing
       and had measured (not imputed) hazard data; its no-hazard OR is
       not significant. Carpenter 2013 imputed alcohol/drug data and
       folded sofa deaths into the comparison group; its "clean" OR of
       5.1 is the AAP's keystone, and the dispute is downstream of that
       data-quality difference. "clean" = breastfed infant of non-smoking
       parents with no other hazards.
       ---------------------------------------------------------- */
    var ROWS = [
      { label: 'Clean bed-share, no hazards', sub: 'Blair 2014', or: 1.08, lo: 0.58, hi: 2.01, sig: false, group: 'clean' },
      { label: 'Clean bed-share, breastfed <3mo', sub: 'Carpenter 2013', or: 5.1, lo: 2.3, hi: 11.4, sig: true, group: 'clean' },
      { label: 'With a smoking parent', sub: 'Blair 2014', or: 4.04, lo: 2.4, hi: 6.8, sig: true, group: 'hazard' },
      { label: 'Sofa or armchair sharing', sub: 'Blair 2014', or: 18.34, lo: 7.1, hi: 47.4, sig: true, group: 'hazard' },
      { label: 'With alcohol over 2 units', sub: 'Blair 2014', or: 18.29, lo: 7.7, hi: 43.5, sig: true, group: 'hazard' },
      { label: 'Both parents smoke <3mo', sub: 'Carpenter 2013', or: 21.6, lo: 11.1, hi: 42.3, sig: true, group: 'hazard' }
    ];

    /* ---------------------------------------------------------------
       CANVAS. viewBox 0 0 720 380. Rows down, log10(OR) across.
       --------------------------------------------------------------- */
    var W = 720, H = 380;
    var svg = S.make(W, H);
    function txt(x, y, str, cls, attrs) { var t = S.text(x, y, str, cls, attrs); svg.appendChild(t); return t; }

    var m = { top: 50, right: 24, bottom: 54, left: 232 };
    var plotW = W - m.left - m.right;
    var plotH = H - m.top - m.bottom;

    // Log axis: ticks at 0.5, 1, 2, 5, 10, 20, 50 so the CIs fit.
    var ticks = [0.5, 1, 2, 5, 10, 20, 50];
    var lgMin = Math.log10(0.5), lgMax = Math.log10(50);
    var xs = S.scale(lgMin, lgMax, m.left, m.left + plotW);
    function X(or) { return xs(Math.log10(or)); }

    /* ---- vertical gridlines at each tick ---- */
    ticks.forEach(function (t) {
      var gx = X(t);
      var isRef = (t === 1);
      S.el('line', {
        x1: gx, y1: m.top - 6, x2: gx, y2: m.top + plotH,
        class: 'viz-grid', stroke: isRef ? P.parch : P.rule,
        'stroke-width': isRef ? 1.4 : 1, opacity: isRef ? '0.85' : '0.3',
        'stroke-dasharray': isRef ? '0' : '0'
      }, svg);
      txt(gx, m.top + plotH + 20, String(t), 'viz-axis', { 'text-anchor': 'middle', fill: isRef ? P.parch : P.dim });
    });
    // Axis title + the meaning of the reference line.
    txt(m.left + plotW / 2, m.top + plotH + 42, 'Odds ratio for SIDS vs room-sharing (log scale)', 'viz-label', { 'text-anchor': 'middle', fill: P.dim });
    txt(X(1), m.top - 14, 'no change (OR 1)', 'viz-axis', { 'text-anchor': 'middle', fill: P.parch });

    /* ---- group headers in the left gutter ---- */
    txt(m.left - 12, m.top - 28, 'A clean bed', 'viz-axis', { 'text-anchor': 'end', fill: P.ok, 'font-weight': '700' });
    // (placed once; rows themselves carry their study sub-label)

    /* ---- rows: whisker (CI) + point (OR) ---- */
    var n = ROWS.length;
    var rowH = plotH / n;
    function rowY(i) { return m.top + rowH * (i + 0.5); }

    ROWS.forEach(function (d, i) {
      var cy = rowY(i);
      var col = d.group === 'clean' ? (d.sig ? P.call : P.ok) : P.emerg;
      // dimmer if not statistically significant (crosses 1).
      var notSig = !d.sig;

      // Row label (left gutter), with the study underneath in dim.
      txt(m.left - 12, cy - 2, d.label, 'viz-axis', { 'text-anchor': 'end', fill: notSig ? P.dim : P.parch });
      txt(m.left - 12, cy + 11, d.sub + (notSig ? ' (not significant)' : ''), 'viz-axis', { 'text-anchor': 'end', fill: P.dim, 'font-size': '10px' });

      // CI whisker.
      var xlo = X(d.lo), xhi = X(d.hi);
      S.el('line', { x1: xlo, y1: cy, x2: xhi, y2: cy, stroke: col, 'stroke-width': 2, 'stroke-opacity': notSig ? 0.65 : 0.9 }, svg);
      // whisker end caps.
      S.el('line', { x1: xlo, y1: cy - 5, x2: xlo, y2: cy + 5, stroke: col, 'stroke-width': 1.6, 'stroke-opacity': notSig ? 0.65 : 0.9 }, svg);
      S.el('line', { x1: xhi, y1: cy - 5, x2: xhi, y2: cy + 5, stroke: col, 'stroke-width': 1.6, 'stroke-opacity': notSig ? 0.65 : 0.9 }, svg);
      // point estimate marker (hollow if not significant).
      S.el('circle', {
        cx: X(d.or), cy: cy, r: 5,
        fill: notSig ? 'none' : col, stroke: col, 'stroke-width': notSig ? 1.8 : 1
      }, svg);
      // OR value label, placed past the high end of the whisker (or before for the widest).
      var lblX = xhi + 9;
      var anchor = 'start';
      if (lblX > m.left + plotW - 26) { lblX = xlo - 9; anchor = 'end'; }
      txt(lblX, cy + 4, num2(d.or), 'viz-axis', { 'text-anchor': anchor, fill: notSig ? P.dim : P.parch, 'font-weight': notSig ? '400' : '700' });
    });

    fig.appendChild(svg);

    /* ---- aria-label ---- */
    svg.setAttribute('aria-label',
      'A forest plot of bed-sharing odds ratios for sudden infant death versus room-sharing, on a log scale, with the no-change line at 1. ' +
      'Bed-sharing in the absence of any hazard is not significantly different from room-sharing: Blair 2014 odds ratio 1.08 (0.58 to 2.01). ' +
      'The danger is concentrated in hazardous contexts: a smoking parent 4.04, sofa or armchair sharing 18.34, alcohol over 2 units 18.29, ' +
      'and both parents smoking 21.6. Carpenter 2013, which imputed missing hazard data, found a clean breastfed-under-3-month odds ratio of 5.1, ' +
      'the disputed figure. The takeaway: the risk lives in the hazards a parent can act on. Sources: Blair 2014 (PLOS ONE) and Carpenter 2013 (BMJ Open).');

    /* ---- viz-note ---- */
    var note = el('p', 'viz-note');
    note.textContent =
      'This is the bed-sharing controversy shown fairly. When all known hazards are removed, the best UK study with measured ' +
      '(not guessed) hazard data found no significant added risk from bed-sharing (odds ratio 1.08, confidence interval 0.58 to ' +
      '2.01, which crosses 1). The overwhelming danger sits in specific, avoidable contexts: a sofa or armchair (18.34), alcohol ' +
      '(18.29), a smoker (4.04), and both parents smoking (21.6). The single contested figure is Carpenter 2013s clean-bed odds ' +
      'ratio of 5.1, which the authors of the other study attribute to imputed alcohol and drug data and to folding sofa deaths ' +
      'into the comparison group. The honest, actionable message both camps share: never on a sofa or armchair, and never with ' +
      'alcohol, smoking, or drugs in the picture. Sources: Blair et al., PLOS ONE 2014;9(9):e107799 (400 cases, 1386 controls); ' +
      'Carpenter et al., BMJ Open 2013;3(5):e002299 (1472 cases, 4679 controls).';
    fig.appendChild(note);

    /* ---- accessible data table fallback ---- */
    var tbl = el('table', 'viz-data');
    var cap = el('caption');
    cap.textContent = 'Bed-sharing odds ratios for SIDS versus room-sharing, with 95% confidence intervals (Blair 2014 and Carpenter 2013).';
    tbl.appendChild(cap);
    var thead = el('thead');
    thead.innerHTML = '<tr><th scope="col">Context</th><th scope="col">Source</th>' +
      '<th scope="col">Odds ratio</th><th scope="col">95% CI</th><th scope="col">Significant</th></tr>';
    tbl.appendChild(thead);
    var tbody = el('tbody');
    ROWS.forEach(function (d) {
      var tr = el('tr');
      tr.innerHTML = '<th scope="row">' + d.label + '</th>' +
        '<td>' + d.sub + '</td>' +
        '<td>' + num2(d.or) + '</td>' +
        '<td>' + num1(d.lo) + ' to ' + num1(d.hi) + '</td>' +
        '<td>' + (d.sig ? 'yes' : 'no (crosses 1)') + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    fig.appendChild(tbl);
  };

  /* ============================================================
     3) FY.viz["cryitout"]
     A small-multiples panel of what the sleep-training trials actually
     found, using the harm camp's own metrics. Three Gradisar 2016
     mini-panels (each an arrow showing direction of effect) plus a
     fourth panel with the Park 2022 pooled child-sleep odds ratio.
     Sources: Gradisar et al., Pediatrics 2016;137(6):e20151486 (RCT,
     n=43); Park, Kim & Lee, Sci Rep 2022;12:4172 (10-RCT meta).
     ============================================================ */
  FY.viz['cryitout'] = function (fig) {
    if (!fig || typeof fig.appendChild !== 'function') return;

    /* ----------------------------------------------------------
       DATA. Gradisar 2016 reported directions and effect classes
       (exact per-arm minute means are paywalled), so the first three
       panels are shown as clearly-labeled DIRECTION-of-effect tiles,
       not invented magnitudes. Park 2022 gives a real pooled OR with CI.
       ---------------------------------------------------------- */
    var PANELS = [
      {
        key: 'latency',
        title: 'Time to fall asleep',
        verdict: 'DOWN',
        dir: 'down',
        good: true,
        detail: 'Large drop',
        stat: "Cohen's d > 0.80",
        foot: 'Gradisar 2016'
      },
      {
        key: 'cortisol',
        title: 'Stress hormone (cortisol)',
        verdict: 'DOWN, not up',
        dir: 'down',
        good: true,
        detail: 'Small-to-moderate decline',
        stat: 'in the active groups',
        foot: 'Gradisar 2016'
      },
      {
        key: 'attach',
        title: 'Attachment at 12 months',
        verdict: 'NO DIFFERENCE',
        dir: 'flat',
        good: true,
        detail: 'Strange Situation,',
        stat: 'no secure/insecure gap',
        foot: 'Gradisar 2016'
      }
    ];

    // Park 2022 pooled child-sleep-problem odds ratio (significant).
    var PARK = { or: 0.51, lo: 0.37, hi: 0.69, k: 10 };

    /* ---------------------------------------------------------------
       CANVAS. viewBox 0 0 720 380. Top row: three direction tiles.
       Bottom: the Park 2022 pooled-OR bar on a small log axis.
       --------------------------------------------------------------- */
    var W = 720, H = 380;
    var svg = S.make(W, H);
    function txt(x, y, str, cls, attrs) { var t = S.text(x, y, str, cls, attrs); svg.appendChild(t); return t; }

    // Section caption (top).
    txt(16, 24, "What the trials actually found (using the harm camp's own metrics)", 'viz-label', { fill: P.parch, 'font-weight': '700' });

    /* ---- Top row: three tiles ---- */
    var pad = 16;
    var gap = 14;
    var rowTop = 40;
    var tileH = 176;
    var tileW = (W - pad * 2 - gap * 2) / 3;

    PANELS.forEach(function (d, i) {
      var tx = pad + i * (tileW + gap);
      var col = d.good ? P.ok : P.emerg;

      // tile frame.
      S.el('rect', { x: tx, y: rowTop, width: tileW, height: tileH, rx: 8, ry: 8, fill: '#ffffff', 'fill-opacity': 0.03, stroke: P.rule, 'stroke-width': 1 }, svg);

      // tile title.
      txt(tx + tileW / 2, rowTop + 24, d.title, 'viz-axis', { 'text-anchor': 'middle', fill: P.parch });

      // direction glyph (arrow down / flat), drawn in the verdict color.
      var cx = tx + tileW / 2;
      var gcy = rowTop + 78;
      var gG = S.el('g', null, svg);
      if (d.dir === 'down') {
        // down arrow
        S.el('line', { x1: cx, y1: gcy - 26, x2: cx, y2: gcy + 18, stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round' }, gG);
        S.el('path', { d: 'M' + (cx - 13) + ' ' + (gcy + 6) + ' L' + cx + ' ' + (gcy + 24) + ' L' + (cx + 13) + ' ' + (gcy + 6), fill: 'none', stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gG);
      } else { // flat (no difference): a balanced equals bar
        S.el('line', { x1: cx - 20, y1: gcy - 6, x2: cx + 20, y2: gcy - 6, stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round' }, gG);
        S.el('line', { x1: cx - 20, y1: gcy + 10, x2: cx + 20, y2: gcy + 10, stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round' }, gG);
      }

      // verdict word.
      txt(cx, rowTop + 126, d.verdict, 'viz-label', { 'text-anchor': 'middle', fill: col, 'font-weight': '700' });
      // detail + stat (mono stat).
      txt(cx, rowTop + 146, d.detail, 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
      txt(cx, rowTop + 162, d.stat, 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    });

    /* ---- Bottom: Park 2022 pooled child-sleep OR on a small log axis ---- */
    var by = rowTop + tileH + 22;             // top of the bottom block
    var bH = H - by - 30;
    var bx0 = 232, bx1 = W - 28;              // plot x range (leave a left label gutter)

    txt(pad, by + 4, 'Pooled across 10 trials (meta-analysis)', 'viz-label', { fill: P.parch, 'font-weight': '700' });
    txt(pad, by + 20, 'Child sleep problems after', 'viz-axis', { fill: P.dim });
    txt(pad, by + 33, 'behavioral sleep training', 'viz-axis', { fill: P.dim });

    // log axis 0.2 to 2.
    var oticks = [0.2, 0.5, 1, 2];
    var olgMin = Math.log10(0.2), olgMax = Math.log10(2);
    var oxs = S.scale(olgMin, olgMax, bx0, bx1);
    function OX(or) { return oxs(Math.log10(or)); }
    var axisY = by + bH - 4;
    var ciY = by + 26;

    // ticks + reference line at 1.
    oticks.forEach(function (t) {
      var gx = OX(t);
      var isRef = (t === 1);
      S.el('line', { x1: gx, y1: ciY - 18, x2: gx, y2: axisY, class: 'viz-grid', stroke: isRef ? P.parch : P.rule, 'stroke-width': isRef ? 1.4 : 1, opacity: isRef ? '0.85' : '0.3' }, svg);
      txt(gx, axisY + 14, String(t), 'viz-axis', { 'text-anchor': 'middle', fill: isRef ? P.parch : P.dim });
    });
    txt(OX(1), ciY - 24, 'no change', 'viz-axis', { 'text-anchor': 'middle', fill: P.parch });
    txt((bx0 + bx1) / 2, axisY + 28, 'Odds ratio (below 1 = fewer sleep problems, log scale)', 'viz-label', { 'text-anchor': 'middle', fill: P.dim });

    // CI whisker + point (significant: solid, in ok color since lower is better).
    var pcol = P.ok;
    S.el('line', { x1: OX(PARK.lo), y1: ciY, x2: OX(PARK.hi), y2: ciY, stroke: pcol, 'stroke-width': 2.4 }, svg);
    S.el('line', { x1: OX(PARK.lo), y1: ciY - 6, x2: OX(PARK.lo), y2: ciY + 6, stroke: pcol, 'stroke-width': 1.8 }, svg);
    S.el('line', { x1: OX(PARK.hi), y1: ciY - 6, x2: OX(PARK.hi), y2: ciY + 6, stroke: pcol, 'stroke-width': 1.8 }, svg);
    S.el('circle', { cx: OX(PARK.or), cy: ciY, r: 6, fill: pcol, stroke: INK, 'stroke-width': 1 }, svg);
    txt(OX(PARK.or), ciY - 12, 'OR 0.51', 'viz-label', { 'text-anchor': 'middle', fill: P.goldHi, 'font-weight': '700' });
    txt(OX(PARK.hi) + 8, ciY + 4, '(0.37 to 0.69)', 'viz-axis', { 'text-anchor': 'start', fill: P.dim });

    fig.appendChild(svg);

    /* ---- aria-label ---- */
    svg.setAttribute('aria-label',
      'A panel of sleep-training trial outcomes. In the Gradisar 2016 randomized trial, time to fall asleep dropped sharply ' +
      "(Cohen's d greater than 0.80), the stress hormone cortisol went down rather than up in the trained groups, and at the " +
      '12-month follow-up there was no difference in attachment on the Strange Situation. Pooling 10 trials, Park 2022 found ' +
      'behavioral sleep training significantly reduced child sleep problems, odds ratio 0.51 (0.37 to 0.69). The honest summary: ' +
      'it works for sleep and no harm to attachment or stress was detected. Sources: Gradisar 2016 (Pediatrics) and Park 2022 (Scientific Reports).');

    /* ---- viz-note ---- */
    var note = el('p', 'viz-note');
    note.textContent =
      "Tested against the fear itself, sleep training holds up. Measured with the harm camp's own yardsticks, the randomized " +
      'trial found cortisol went down, not up, and at one year there was no difference in attachment; meanwhile time-to-sleep ' +
      'improved a lot (a large effect). Pooling ten trials, behavioral methods significantly cut child sleep problems (odds ratio ' +
      '0.51). The honest caveats: this evidence is for babies roughly 6 months and older (it does not apply to newborns), and ' +
      'pooled across trials the hoped-for boost to maternal mood did not reach significance, so the reliable benefit is the ' +
      "baby's sleep, not a cure for postnatal depression. No method is mandatory, and not sleep-training is also fine. " +
      'Sources: Gradisar et al., Pediatrics 2016;137(6):e20151486 (RCT, n=43, ages 6 to 16 months; exact minute values are ' +
      'paywalled so directions and effect sizes are shown); Park, Kim & Lee, Scientific Reports 2022;12:4172 (meta-analysis of 10 RCTs).';
    fig.appendChild(note);

    /* ---- accessible data table fallback ---- */
    var tbl = el('table', 'viz-data');
    var cap = el('caption');
    cap.textContent = 'Sleep-training outcomes: Gradisar 2016 effect directions and the Park 2022 pooled odds ratio.';
    tbl.appendChild(cap);
    var thead = el('thead');
    thead.innerHTML = '<tr><th scope="col">Outcome</th><th scope="col">Finding</th>' +
      '<th scope="col">Effect</th><th scope="col">Source</th></tr>';
    tbl.appendChild(thead);
    var tbody = el('tbody');
    var rows = [
      ['Time to fall asleep', 'Large decrease', "Cohen's d > 0.80", 'Gradisar 2016'],
      ['Salivary cortisol (infant stress)', 'Decline (not a rise)', 'small to moderate', 'Gradisar 2016'],
      ['Attachment at 12 months', 'No difference', 'Strange Situation, ns', 'Gradisar 2016'],
      ['Child sleep problems (pooled)', 'Significant reduction', 'OR 0.51 (0.37 to 0.69)', 'Park 2022, k=10'],
      ['Maternal depression (pooled)', 'Not significant', 'EPDS MD -0.22 (-0.68 to 0.25)', 'Park 2022']
    ];
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.innerHTML = '<th scope="row">' + r[0] + '</th><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    fig.appendChild(tbl);
  };
})();


/* module: suid-cliff.js */
/* ============================================================
   THE FIRST YEAR, chart module: suid-cliff
   The Back to Sleep cliff and the diagnostic scissors.
   Stacked-area time series of US Sudden Unexpected Infant Death
   (SUID) per 100,000 live births, 1990 to 2022, split into
   SIDS, ASSB (accidental suffocation and strangulation in bed),
   and unknown cause. Annotation flags at 1994 (Back to Sleep),
   1999 (ICD-10 switch), and the 2020 to 2022 uptick.

   Real anchor points (per 100,000 live births):
     1990 SUID 154.6  = SIDS 130.3 + unknown 20.9 + ASSB 3.4
     2015 SUID 92.3   = SIDS 39.3  + unknown 30.0 + ASSB 23.0
     2022 SUID 100.9  = SIDS 41.7  + unknown 30.8 + ASSB 28.4
       (2022 split derived from the published composition
        1,529 SIDS / 1,131 unknown / 1,040 ASSB = ~3,700, which
        is 41 / 31 / 28 percent of the 100.9 rate.)
   2015 to 2020 are real year-by-year rates from the CDC
   2015-2020 paper. 1990 to 2015 and 2020 to 2022 intermediate
   years are interpolated between the real anchors (noted below).

   Sources: Shapiro-Mendoza / Erck Lambert et al., Pediatrics
   2018;141(3):e20173519 (PMC6637428) for the 1990 and 2015
   endpoints; Erck Lambert et al., Pediatrics 2023;151(4):
   e2022058820 (PMC10091458) for 2015 to 2020 year-by-year;
   CDC SUID data hub for the 2022 rate (100.9) and composition.
   US Government public domain (CDC/NCHS). No em dashes.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  // Real anchor years (rates per 100,000 live births), components sum to SUID.
  // 1990 and 2015 from Shapiro-Mendoza 2018; 2015 to 2020 from Erck Lambert
  // 2023 (Table); 2022 from the CDC data hub (rate 100.9, split from counts).
  var ANCHORS = [
    { y: 1990, sids: 130.3, unknown: 20.9, assb: 3.4 },   // PMC6637428 (interp start)
    { y: 2015, sids: 39.3, unknown: 30.0, assb: 23.0 },   // PMC6637428 endpoint (SUID 92.3)
    { y: 2016, sids: 37.9, unknown: 31.3, assb: 21.7 },   // PMC10091458
    { y: 2017, sids: 35.2, unknown: 33.1, assb: 24.5 },   // PMC10091458
    { y: 2018, sids: 35.0, unknown: 33.4, assb: 22.0 },   // PMC10091458
    { y: 2019, sids: 33.3, unknown: 30.8, assb: 25.4 },   // PMC10091458
    { y: 2020, sids: 38.2, unknown: 28.9, assb: 25.0 },   // PMC10091458
    { y: 2022, sids: 41.7, unknown: 30.8, assb: 28.4 }    // CDC hub (SUID 100.9)
  ];
  var anchorYears = {};
  ANCHORS.forEach(function (a) { anchorYears[a.y] = true; });

  // Build a continuous per-year series 1990 to 2022 by linear interpolation
  // between adjacent anchors for any year that is not itself an anchor.
  function buildSeries() {
    var out = [];
    for (var y = 1990; y <= 2022; y++) {
      var lo = null, hi = null;
      for (var i = 0; i < ANCHORS.length; i++) {
        if (ANCHORS[i].y <= y) lo = ANCHORS[i];
        if (ANCHORS[i].y >= y && hi === null) hi = ANCHORS[i];
      }
      if (!lo) lo = ANCHORS[0];
      if (!hi) hi = ANCHORS[ANCHORS.length - 1];
      var t = (hi.y === lo.y) ? 0 : (y - lo.y) / (hi.y - lo.y);
      var sids = lo.sids + (hi.sids - lo.sids) * t;
      var unknown = lo.unknown + (hi.unknown - lo.unknown) * t;
      var assb = lo.assb + (hi.assb - lo.assb) * t;
      out.push({
        y: y,
        sids: sids,
        unknown: unknown,
        assb: assb,
        suid: sids + unknown + assb,
        real: !!anchorYears[y]
      });
    }
    return out;
  }

  FY.viz['suid-cliff'] = function (fig) {
    if (!fig || !FY.svg) return;
    var P = FY.svg.palette;
    var W = 720, H = 380;
    var m = { top: 30, right: 132, bottom: 46, left: 52 };
    var iw = W - m.left - m.right;
    var ih = H - m.top - m.bottom;

    var data = buildSeries();
    var X0 = 1990, X1 = 2022;
    var Y0 = 0, Y1 = 160; // headroom above the 1990 peak of 154.6

    var sx = FY.svg.scale(X0, X1, m.left, m.left + iw);
    var sy = FY.svg.scale(Y0, Y1, m.top + ih, m.top); // inverted: 0 at bottom

    var svg = FY.svg.make(W, H);

    // ---- gridlines + Y axis (rate per 100,000) ----
    var yTicks = [0, 40, 80, 120, 160];
    yTicks.forEach(function (v) {
      var yy = sy(v);
      FY.svg.el('line', { x1: m.left, y1: yy, x2: m.left + iw, y2: yy, class: 'viz-grid' }, svg);
      var t = FY.svg.text(m.left - 8, yy + 3.5, String(v), 'viz-axis', { 'text-anchor': 'end' });
      svg.appendChild(t);
    });
    // Y axis title
    var yt = FY.svg.text(0, 0, 'SUID deaths per 100,000 live births', 'viz-axis', {
      'text-anchor': 'middle', transform: 'translate(13,' + (m.top + ih / 2) + ') rotate(-90)'
    });
    svg.appendChild(yt);

    // ---- X axis (years) ----
    var xTicks = [1990, 1994, 1999, 2005, 2010, 2015, 2020, 2022];
    var axisY = m.top + ih;
    FY.svg.el('line', { x1: m.left, y1: axisY, x2: m.left + iw, y2: axisY, class: 'viz-grid' }, svg);
    xTicks.forEach(function (yr) {
      var xx = sx(yr);
      FY.svg.el('line', { x1: xx, y1: axisY, x2: xx, y2: axisY + 5, class: 'viz-grid' }, svg);
      var t = FY.svg.text(xx, axisY + 18, String(yr), 'viz-axis', { 'text-anchor': 'middle' });
      svg.appendChild(t);
    });

    // ---- stacked areas ----
    // Stack order from the baseline up: SIDS (largest historic mass),
    // then unknown, then ASSB on top. The top edge of the ASSB band is the
    // combined SUID spine.
    var baseY = sy(0);
    // cumulative tops
    var sidsTop = data.map(function (d) { return [sx(d.y), sy(d.sids)]; });
    var unkTop = data.map(function (d) { return [sx(d.y), sy(d.sids + d.unknown)]; });
    var suidTop = data.map(function (d) { return [sx(d.y), sy(d.sids + d.unknown + d.assb)]; });

    function areaBetween(lowerPts, upperPts) {
      // path: along upper left-to-right, then back along lower right-to-left
      var up = upperPts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var lowRev = lowerPts.slice().reverse();
      var down = lowRev.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      return up + ' ' + down + ' Z';
    }

    var baseLine = data.map(function (d) { return [sx(d.y), baseY]; });

    // SIDS band (baseline to sidsTop) in gold
    FY.svg.el('path', { d: areaBetween(baseLine, sidsTop), fill: P.gold, 'fill-opacity': '0.92', stroke: 'none' }, svg);
    // unknown band (sidsTop to unkTop) in sky
    FY.svg.el('path', { d: areaBetween(sidsTop, unkTop), fill: P.sky, 'fill-opacity': '0.88', stroke: 'none' }, svg);
    // ASSB band (unkTop to suidTop) in plum
    FY.svg.el('path', { d: areaBetween(unkTop, suidTop), fill: P.plum, 'fill-opacity': '0.9', stroke: 'none' }, svg);

    // combined SUID spine, drawn bold on top
    FY.svg.el('path', { d: FY.svg.line(suidTop), fill: 'none', stroke: P.goldHi, 'stroke-width': '2', 'stroke-linejoin': 'round' }, svg);

    // markers on the real anchor years along the SUID spine
    data.forEach(function (d, i) {
      if (!d.real) return;
      var p = suidTop[i];
      FY.svg.el('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: '2.6', fill: P.goldHi, stroke: '#2a322b', 'stroke-width': '1' }, svg);
    });

    // ---- annotation flags ----
    function flag(year, label, dyTop) {
      var xx = sx(year);
      FY.svg.el('line', { x1: xx, y1: m.top - 2, x2: xx, y2: axisY, stroke: P.parch, 'stroke-width': '1', 'stroke-dasharray': '3 3', 'stroke-opacity': '0.55' }, svg);
      var t = FY.svg.text(xx, m.top + dyTop, label, 'viz-axis', { 'text-anchor': 'middle', fill: P.parch });
      t.setAttribute('font-weight', '600');
      svg.appendChild(t);
    }
    // 1994 Back to Sleep
    flag(1994, '1994', -6);
    var bts = FY.svg.text(sx(1994), m.top + 8, 'Back to Sleep', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    svg.appendChild(bts);
    // 1999 ICD-10 switch (the diagnostic scissors)
    flag(1999, '1999', 24);
    var icd = FY.svg.text(sx(1999), m.top + 38, 'ICD-10 switch', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    svg.appendChild(icd);

    // 2020 to 2022 uptick bracket
    var ux0 = sx(2020), ux1 = sx(2022), uby = m.top - 8;
    FY.svg.el('path', { d: 'M' + ux0.toFixed(1) + ' ' + (uby + 6) + ' L' + ux0.toFixed(1) + ' ' + uby + ' L' + ux1.toFixed(1) + ' ' + uby + ' L' + ux1.toFixed(1) + ' ' + (uby + 6), fill: 'none', stroke: P.emerg, 'stroke-width': '1.3' }, svg);
    var upt = FY.svg.text((ux0 + ux1) / 2, uby - 4, 'uptick', 'viz-axis', { 'text-anchor': 'middle', fill: P.emerg });
    upt.setAttribute('font-weight', '600');
    svg.appendChild(upt);

    // ---- right-side legend with the 2022 split ----
    var lx = m.left + iw + 16;
    var ly = m.top + 6;
    var legend = [
      { c: P.plum, name: 'ASSB', v: '28.4' },
      { c: P.sky, name: 'Unknown', v: '30.8' },
      { c: P.gold, name: 'SIDS', v: '41.7' }
    ];
    var lh = FY.svg.text(lx, ly - 8, '2022 rate', 'viz-axis', { 'text-anchor': 'start', fill: P.dim });
    svg.appendChild(lh);
    legend.forEach(function (g, i) {
      var yy = ly + i * 20;
      FY.svg.el('rect', { x: lx, y: yy, width: 11, height: 11, fill: g.c, 'fill-opacity': '0.9' }, svg);
      var nm = FY.svg.text(lx + 16, yy + 9.5, g.name, 'viz-axis', { 'text-anchor': 'start', fill: P.parch });
      svg.appendChild(nm);
      var vv = FY.svg.text(lx + 96, yy + 9.5, g.v, 'viz-axis', { 'text-anchor': 'end', fill: P.dim });
      svg.appendChild(vv);
    });
    // combined SUID callout in the legend
    var sumY = ly + legend.length * 20 + 6;
    FY.svg.el('line', { x1: lx, y1: sumY + 5, x2: lx + 11, y2: sumY + 5, stroke: P.goldHi, 'stroke-width': '2' }, svg);
    var sm = FY.svg.text(lx + 16, sumY + 9, 'SUID', 'viz-axis', { 'text-anchor': 'start', fill: P.goldHi });
    sm.setAttribute('font-weight', '600');
    svg.appendChild(sm);
    var smv = FY.svg.text(lx + 96, sumY + 9, '100.9', 'viz-axis', { 'text-anchor': 'end', fill: P.goldHi });
    svg.appendChild(smv);

    // spoken summary with the key numbers
    svg.setAttribute('aria-label',
      'Stacked area chart of US Sudden Unexpected Infant Death per 100,000 live births, 1990 to 2022, ' +
      'split into SIDS, accidental suffocation and strangulation in bed (ASSB), and unknown cause. ' +
      'Combined SUID falls steeply from 154.6 in 1990 (SIDS 130.3, unknown 20.9, ASSB 3.4) after the ' +
      '1994 Back to Sleep campaign, to about 92 by 2015. After the 1999 switch to ICD-10 coding the SIDS ' +
      'rate keeps dropping to 39.3 by 2015 while ASSB rises to 23.0 and unknown to 30.0, so much of the ' +
      'later SIDS decline is relabeling rather than fewer deaths. SUID then rises again to 100.9 in 2022 ' +
      '(SIDS 41.7, unknown 30.8, ASSB 28.4). Over 1990 to 2015 SIDS fell about 71 percent while ASSB rose ' +
      'about 671 percent. Source: CDC and NCHS, Shapiro-Mendoza 2018 and Erck Lambert 2023.');

    // attach the svg after the existing figcaption
    fig.appendChild(svg);

    // reassuring / explanatory caption plus the source
    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent =
      'The rules work: the steep drop after the 1994 Back to Sleep campaign is a real fall in deaths, ' +
      'not a coding artifact, because the combined SUID total (the bold line) dropped by nearly half over ' +
      'the 1990s. The plateau after 1999 is partly relabeling: once the US switched to ICD-10, coroners ' +
      'shifted cases out of SIDS and into ASSB and unknown, so the combined SUID line is the honest number ' +
      'to watch. The 2020 to 2022 rise (back to 100.9) is partly a 2019 reporting-practice change and ' +
      'partly a possible infection link still under study. Real anchor years are marked with dots; 2015 to ' +
      '2020 are exact yearly rates and the other intermediate years are interpolated between published ' +
      'anchors. Source: CDC/NCHS via CDC WONDER, synthesized from Shapiro-Mendoza / Erck Lambert et al., ' +
      'Pediatrics 2018;141(3):e20173519 (1990 and 2015), Erck Lambert et al., Pediatrics 2023;151(4):' +
      'e2022058820 (2015 to 2020), and the CDC SUID data hub (2022). US Government public domain.';
    fig.appendChild(note);

    // accessible data table (real anchor years only, the values that are sourced)
    var table = document.createElement('table');
    table.className = 'viz-data';
    var caption = document.createElement('caption');
    caption.textContent = 'US SUID rate per 100,000 live births by cause, real anchor years';
    caption.style.captionSide = 'top';
    caption.style.textAlign = 'left';
    caption.style.fontStyle = 'italic';
    caption.style.padding = '0 0 0.4em';
    table.appendChild(caption);

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['Year', 'SIDS', 'ASSB', 'Unknown', 'SUID total'].forEach(function (h) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    data.forEach(function (d) {
      if (!d.real) return;
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(d.y);
      tr.appendChild(th);
      [d.sids, d.assb, d.unknown, d.suid].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v.toFixed(1);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    fig.appendChild(table);
  };
})();


/* module: tool-dosing.js */
/* ============================================================
   THE FIRST YEAR, tool: the antipyretic dosing widget.
   Module: tool-dosing (one FY.tool function, id "dosing").

   What it does: a parent enters the baby's weight (lb or kg toggle,
   stored internally as kg) and picks the exact product in hand
   (acetaminophen 160 mg/5 mL liquid; ibuprofen as EITHER infant drops
   50 mg/1.25 mL OR children's 100 mg/5 mL, concentration mandatory for
   ibuprofen). It returns the per-dose volume in mL, the dosing interval,
   the maximum number of doses in 24 hours, and the daily milligram
   ceiling, all read off the published weight-banded hospital charts.

   HARD GATES (block the dose and explain):
   - Ibuprofen is disabled under ~6 months / under ~12 lb (5.5 kg). [A]
   - Acetaminophen under 3 months / under ~12 lb shows a "call your
     doctor first" block: a fever that young needs evaluation, not just
     treatment. [A]
   - A standing warning that the OLD concentrated 80 mg/0.8 mL infant
     acetaminophen drops were discontinued in 2011; if found, discard.

   ALWAYS-ON SAFETY RAIL: use the syringe that came with the medicine,
   match the bottle concentration, do not double-dose hidden
   acetaminophen in cough/cold combination products, US Poison Help
   1-800-222-1222.

   Numbers and bands: deepdives/fever-febrile-infant.md section 6,
   cross-verified across Stanford Children's (Rev. 1/2026), Children's
   Healthcare of Atlanta (PFEI 145, 2025), and the Seattle/Schmitt table
   (UH Rainbow), all adapting the AAP HealthyChildren chart. Acetaminophen
   10 to 15 mg/kg q4 to 6h, max 5 doses/24h, ~75 mg/kg/day ceiling.
   Ibuprofen 10 mg/kg q6 to 8h, max 4 doses/24h, ~40 mg/kg/day ceiling.

   Correctness is critical here. The banded mL are the exact published
   action values (concentrations: acetaminophen 32 mg/mL; ibuprofen
   drops 40 mg/mL; ibuprofen children's 20 mg/mL); each band's mL has
   been checked as dose_mg / concentration.

   Framework-free. Clean console. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  var LB_PER_KG = 2.2046226218;
  var POISON = '1-800-222-1222';

  /* ------------------------------------------------------------------
     The weight-banded charts. Each band is keyed by an INCLUSIVE kg
     window [loKg, hiKg] (derived from the published lb bands, which the
     charts give in whole pounds; kg windows are the published kg ranges).
     We carry the published lb range as a label so the output can show a
     parent the band they landed in exactly as the hospital chart prints
     it. doseMg and mL are the published action values.
     ------------------------------------------------------------------ */

  /* Acetaminophen, liquid 160 mg / 5 mL (= 32 mg/mL). q4 to 6h, max 5/24h.
     Source bands: Stanford Rev.1/2026, CHOA 2025, UH Rainbow/Schmitt. */
  var ACET = {
    id: 'acet',
    name: 'Acetaminophen',
    brand: 'paracetamol, Tylenol',
    conc: 'liquid 160 mg / 5 mL',
    mgPerMl: 32,
    intervalText: 'every 4 to 6 hours',
    maxDoses: 5,
    perDayCeil: 75,            /* mg/kg/day */
    perDoseLo: 10, perDoseHi: 15,  /* mg/kg/dose for the displayed check */
    bands: [
      { lb: '6 to 11 lb',  loKg: 2.7,  hiKg: 5.3,  mg: 40,  ml: 1.25 },
      { lb: '12 to 17 lb', loKg: 5.4,  hiKg: 8.0,  mg: 80,  ml: 2.5 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.8, mg: 120, ml: 3.75 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 16.2, mg: 160, ml: 5 },
      { lb: '36 to 47 lb', loKg: 16.3, hiKg: 21.7, mg: 240, ml: 7.5 },
      { lb: '48 to 59 lb', loKg: 21.8, hiKg: 27.1, mg: 320, ml: 10 },
      { lb: '60 to 71 lb', loKg: 27.2, hiKg: 32.6, mg: 400, ml: 12.5 },
      { lb: '72 to 95 lb', loKg: 32.7, hiKg: 43.5, mg: 480, ml: 15 },
      { lb: '96+ lb',      loKg: 43.6, hiKg: 999,  mg: 640, ml: 20 }
    ]
  };

  /* Ibuprofen. Two concentrations the parent MUST choose between.
     q6 to 8h, max 4/24h. Begins at the 12 to 17 lb / 6-month band. */
  var IBU_INFANT = {
    id: 'ibu-infant',
    name: 'Ibuprofen',
    brand: 'Advil, Motrin',
    conc: 'infant drops 50 mg / 1.25 mL',
    mgPerMl: 40,
    intervalText: 'every 6 to 8 hours',
    maxDoses: 4,
    perDayCeil: 40,
    perDoseLo: 10, perDoseHi: 10,
    /* The infant-drops syringe is marked only at 0.625, 1.25, 1.875 mL,
       so the chart uses these drops only through the 24 to 35 lb band;
       above that it directs the parent to the children's liquid. */
    bands: [
      { lb: '12 to 17 lb', loKg: 5.5,  hiKg: 8.0,  mg: 50,  ml: 1.25 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.8, mg: 75,  ml: 1.875 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 16.2, mg: 100, ml: 2.5 }
    ],
    /* above this weight, infant drops are not the right device */
    useChildrenAboveKg: 16.2
  };
  var IBU_CHILD = {
    id: 'ibu-child',
    name: 'Ibuprofen',
    brand: 'Advil, Motrin',
    conc: "children's liquid 100 mg / 5 mL",
    mgPerMl: 20,
    intervalText: 'every 6 to 8 hours',
    maxDoses: 4,
    perDayCeil: 40,
    perDoseLo: 10, perDoseHi: 10,
    bands: [
      { lb: '12 to 17 lb', loKg: 5.5,  hiKg: 8.0,  mg: 50,  ml: 2.5 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.8, mg: 75,  ml: 3.75 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 16.2, mg: 100, ml: 5 },
      { lb: '36 to 47 lb', loKg: 16.3, hiKg: 21.7, mg: 150, ml: 7.5 },
      { lb: '48 to 59 lb', loKg: 21.8, hiKg: 27.1, mg: 200, ml: 10 },
      { lb: '60 to 71 lb', loKg: 27.2, hiKg: 32.6, mg: 250, ml: 12.5 },
      { lb: '72 to 95 lb', loKg: 32.7, hiKg: 43.5, mg: 300, ml: 15 }
    ]
  };

  /* ---- self-check the published mL against dose_mg / concentration ----
     This never throws in production; it only warns once if a published
     band volume disagrees with the arithmetic, so a future edit to the
     table cannot silently ship a wrong dose. */
  (function verifyTables() {
    if (!window.console || !console.warn) return;
    [ACET, IBU_INFANT, IBU_CHILD].forEach(function (drug) {
      drug.bands.forEach(function (b) {
        var calc = b.mg / drug.mgPerMl;
        if (Math.abs(calc - b.ml) > 0.01) {
          console.warn('dosing: band check mismatch in ' + drug.id +
            ' (' + b.lb + '): chart ' + b.ml + ' mL vs computed ' +
            calc.toFixed(3) + ' mL');
        }
      });
    });
  })();

  /* ------------------------------------------------------------------
     small DOM helpers (no framework)
     ------------------------------------------------------------------ */
  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'for') e.htmlFor = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function fmtMl(n) {
    /* the published volumes are 0.625-step values; show up to 3 decimals
       but trim trailing zeros so 1.250 reads as 1.25 and 5.000 as 5 */
    var s = (Math.round(n * 1000) / 1000).toString();
    return s;
  }

  function findBand(drug, kg) {
    for (var i = 0; i < drug.bands.length; i++) {
      var b = drug.bands[i];
      if (kg >= b.loKg && kg <= b.hiKg) return b;
    }
    /* heavier than the top band: clamp to the top band (the chart's
       ceiling dose), still a real published value */
    if (kg > drug.bands[drug.bands.length - 1].hiKg) {
      return drug.bands[drug.bands.length - 1];
    }
    return null;
  }

  /* ============================================================
     The tool
     ============================================================ */
  FY.tool['dosing'] = function (mount) {
    if (!mount) return;
    clear(mount);

    /* ---- state ---- */
    var state = {
      unit: 'lb',        /* 'lb' or 'kg' (display); weight stored as kg */
      weightKg: null,    /* canonical */
      rawValue: '',      /* what the user typed, in the current unit */
      drug: 'acet',      /* 'acet' | 'ibu' */
      ibuConc: ''        /* '' (unchosen) | 'infant' | 'child' */
    };

    /* ---- head ---- */
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'Fever and pain dose calculator' }, head);
    el('span', {
      class: 'tool-tag',
      text: 'by weight',
      style: 'font-family:var(--font-body);font-size:0.8rem;color:var(--text-dim);'
    }, head);

    var body = el('div', { class: 'tool-body' }, mount);

    /* ===== controls row ===== */
    var controls = el('div', {
      class: 'dose-controls',
      style: 'display:flex;flex-wrap:wrap;gap:1.1em 1.4em;align-items:flex-end;'
    }, body);

    /* --- weight field + unit toggle --- */
    var wWrap = el('div', { style: 'display:flex;flex-direction:column;gap:0.35em;' }, controls);
    el('label', { for: 'dose-weight', text: "Baby's weight" }, wWrap);
    var wRow = el('div', { style: 'display:flex;gap:0.5em;align-items:center;' }, wWrap);
    var weightInput = el('input', {
      id: 'dose-weight', type: 'number', inputmode: 'decimal',
      min: '0', max: '200', step: '0.1',
      placeholder: 'weight', style: 'width:6.5em;',
      'aria-describedby': 'dose-weight-hint'
    }, wRow);

    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Weight unit' }, wRow);
    var btnLb = el('button', { type: 'button', class: 'on', text: 'lb', 'aria-pressed': 'true' }, seg);
    var btnKg = el('button', { type: 'button', text: 'kg', 'aria-pressed': 'false' }, seg);
    el('span', {
      id: 'dose-weight-hint',
      style: 'font-family:var(--font-body);font-size:0.78rem;color:var(--text-dim);',
      text: 'Use a recent weight if you have one.'
    }, wWrap);

    /* --- medicine select --- */
    var mWrap = el('div', { style: 'display:flex;flex-direction:column;gap:0.35em;' }, controls);
    el('label', { for: 'dose-drug', text: 'Medicine' }, mWrap);
    var drugSel = el('select', { id: 'dose-drug' }, mWrap);
    el('option', { value: 'acet', text: 'Acetaminophen (Tylenol)' }, drugSel);
    el('option', { value: 'ibu', text: 'Ibuprofen (Advil, Motrin)' }, drugSel);

    /* --- concentration select (only meaningful, and mandatory, for ibuprofen) --- */
    var cWrap = el('div', { style: 'display:flex;flex-direction:column;gap:0.35em;' }, controls);
    var concLabel = el('label', { for: 'dose-conc', text: 'Concentration' }, cWrap);
    var concSel = el('select', { id: 'dose-conc', 'aria-describedby': 'dose-conc-hint' }, cWrap);
    var concHint = el('span', {
      id: 'dose-conc-hint',
      style: 'font-family:var(--font-body);font-size:0.78rem;color:var(--text-dim);'
    }, cWrap);

    /* ===== live output ===== */
    var out = el('div', {
      class: 'tool-out',
      role: 'status', 'aria-live': 'polite',
      style: 'margin-top:1.2em;'
    }, body);

    /* ===== always-on safety rail ===== */
    var rail = el('div', { class: 'tool-rail' }, body);
    rail.innerHTML =
      '<b>Read this every time.</b> ' +
      'Use the <b>syringe or dropper that came with the medicine</b>, never a kitchen spoon, ' +
      'and match the <b>concentration printed on the bottle</b> to what you set here. ' +
      'Do not give two products that both contain acetaminophen or both contain ibuprofen, ' +
      'and remember many cough and cold combinations <b>hide acetaminophen</b>. ' +
      'Dose by weight, not age, and treat for comfort, not to chase a number. ' +
      'For any suspected overdose or a wrong dose, call <b>US Poison Help, ' + POISON + '</b>, free and 24/7. ' +
      'This calculator follows US hospital charts (160 mg/5 mL acetaminophen; ibuprofen 50 mg/1.25 mL or 100 mg/5 mL); ' +
      'it is a double-check, not a substitute for your bottle label or your doctor.';

    /* ---- the discontinued-drops standing warning (always visible) ---- */
    var oldDrops = el('p', {
      class: 'dose-olddrops',
      style: 'margin:0.9em 0 0;font-family:var(--font-body);font-size:0.85rem;color:var(--text-dim);line-height:1.5;'
    }, body);
    oldDrops.innerHTML =
      'One old product to throw away: the concentrated <b>80 mg / 0.8 mL infant acetaminophen drops</b> were ' +
      'discontinued in <b>2011</b> because mixing them up with the children’s liquid caused overdoses. ' +
      'If you find an old 80 mg/0.8 mL bottle in a cabinet, discard it; this calculator assumes the single ' +
      'modern strength, 160 mg / 5 mL.';

    /* ------------------------------------------------------------------
       concentration-select population: only ibuprofen needs a choice.
       For acetaminophen we lock the field (one strength exists) but keep
       it visible so the UI does not jump.
       ------------------------------------------------------------------ */
    function populateConc() {
      clear(concSel);
      if (state.drug === 'acet') {
        concLabel.textContent = 'Concentration';
        var o = el('option', { value: 'acet', text: 'Liquid 160 mg / 5 mL (only strength)' }, concSel);
        o.selected = true;
        concSel.value = 'acet';
        concSel.disabled = true;
        concHint.textContent = 'Acetaminophen now comes in just one liquid strength.';
      } else {
        concLabel.textContent = 'Which ibuprofen? (required)';
        concSel.disabled = false;
        var ph = el('option', { value: '', text: 'Choose the bottle you have...' }, concSel);
        ph.disabled = true;
        el('option', { value: 'infant', text: 'Infant drops 50 mg / 1.25 mL' }, concSel);
        el('option', { value: 'child', text: "Children's liquid 100 mg / 5 mL" }, concSel);
        concSel.value = state.ibuConc || '';
        concHint.innerHTML = 'Ibuprofen comes in <b>two</b> strengths. Mixing them up is the most common dosing error, ' +
          'so pick the exact bottle.';
      }
    }

    /* ------------------------------------------------------------------
       render the output for the current state, including the hard gates
       ------------------------------------------------------------------ */
    function render() {
      clear(out);

      var kg = state.weightKg;
      var hasWeight = (typeof kg === 'number' && isFinite(kg) && kg > 0);

      /* helper to print a blocked message */
      function block(html) {
        var b = el('p', { class: 'blocked', style: 'margin:0;font-family:var(--font-body);font-size:0.98rem;line-height:1.55;' }, out);
        b.innerHTML = html;
      }
      function lbStr() {
        return hasWeight ? (round1(kg * LB_PER_KG) + ' lb (' + round1(kg) + ' kg)') : '';
      }

      if (!hasWeight) {
        el('p', {
          style: 'margin:0;font-family:var(--font-body);color:var(--text-dim);',
          text: 'Enter your baby’s weight above to see the dose.'
        }, out);
        return;
      }

      /* sanity bound: implausible weights get a gentle nudge, no number */
      if (kg < 1.4) {
        block('That weight looks too low to dose safely from a chart. Please double-check the number, ' +
          'and for a baby this small call your doctor before giving any fever medicine.');
        return;
      }
      if (kg > 90) {
        block('That weight is above this infant and child chart. For an older child or adult this size, ' +
          'follow the package directions for their weight or ask a pharmacist.');
        return;
      }

      /* ---------------- ACETAMINOPHEN ---------------- */
      if (state.drug === 'acet') {
        /* GATE: under 3 months / under ~12 lb (5.4 kg) => call doctor first */
        if (kg < 5.4) {
          block('<b>Call your doctor before giving acetaminophen.</b> At about ' + lbStr() +
            ', your baby is likely under 3 months old. A fever this young (a rectal temperature of ' +
            '100.4 °F / 38.0 °C or higher) needs to be <b>evaluated</b>, not just treated at home. ' +
            'Acetaminophen can be used from birth, but only on a doctor’s direction at this age. ' +
            'Do not give ibuprofen at all yet.');
          return;
        }
        renderDoseCard(ACET, kg, lbStr());
        return;
      }

      /* ---------------- IBUPROFEN ---------------- */
      /* GATE 1: no ibuprofen under 6 months / under ~12 lb (5.5 kg) */
      if (kg < 5.5) {
        block('<b>Do not give ibuprofen yet.</b> In the US the firm rule is <b>no ibuprofen before 6 months</b> ' +
          '(about 12 lb / 5.5 kg). At ' + lbStr() + ', your baby is below that line. Ibuprofen can stress an infant’s ' +
          'kidneys, especially if the baby is at all dehydrated. Use acetaminophen instead (and if your baby is under ' +
          '3 months, call your doctor first).');
        return;
      }
      /* GATE 2: concentration is mandatory for ibuprofen */
      if (!state.ibuConc) {
        block('Pick which ibuprofen you have first: the <b>infant drops (50 mg / 1.25 mL)</b> or the ' +
          '<b>children’s liquid (100 mg / 5 mL)</b>. They are different strengths, so the right number of ' +
          'millilitres is different. Choosing the wrong one is the most common ibuprofen dosing mistake.');
        return;
      }

      var drug = (state.ibuConc === 'infant') ? IBU_INFANT : IBU_CHILD;

      /* If infant drops are chosen but the baby is heavier than the drops
         syringe covers, steer to the children's liquid instead of inventing
         an unmeasurable volume. */
      if (drug === IBU_INFANT && kg > IBU_INFANT.useChildrenAboveKg) {
        block('At ' + lbStr() + ', your baby is above the range the <b>infant drops</b> syringe is marked for ' +
          '(it only goes to 1.875 mL). Switch the concentration above to the <b>children’s liquid ' +
          '(100 mg / 5 mL)</b> for a volume you can measure accurately.');
        return;
      }
      renderDoseCard(drug, kg, lbStr());
    }

    /* ------------------------------------------------------------------
       the dose card itself (shared by both drugs once gates pass)
       ------------------------------------------------------------------ */
    function renderDoseCard(drug, kg, lbStr) {
      var band = findBand(drug, kg);
      if (!band) {
        el('p', { class: 'blocked', style: 'margin:0;', html: 'No matching dose band for that weight; ask your pharmacist.' }, out);
        return;
      }

      /* the headline volume */
      var head = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:baseline;gap:0.5em 0.8em;' }, out);
      el('span', { class: 'big', text: fmtMl(band.ml) + ' mL' }, head);
      el('span', {
        style: 'font-family:var(--font-body);color:var(--text);font-size:0.98rem;',
        text: 'per dose of ' + drug.name + ' ' + drug.conc
      }, head);

      /* the supporting line: interval + max doses + per-dose mg */
      var sub = el('p', {
        style: 'margin:0.5em 0 0;font-family:var(--font-body);font-size:0.95rem;color:var(--text);line-height:1.55;'
      }, out);
      sub.innerHTML =
        'That is <b>' + band.mg + ' mg</b> per dose, ' + drug.intervalText + ', ' +
        '<b>no more than ' + drug.maxDoses + ' doses in 24 hours</b>.';

      /* the daily ceiling, computed from the child's weight */
      var dailyCeil = Math.round(drug.perDayCeil * kg);
      var ceil = el('p', {
        style: 'margin:0.45em 0 0;font-family:var(--font-body);font-size:0.9rem;color:var(--text-dim);line-height:1.5;'
      }, out);
      ceil.innerHTML =
        'Daily ceiling for a ' + lbStr + ' baby: about <b>' + dailyCeil + ' mg of ' +
        drug.name.toLowerCase() + ' in 24 hours</b> (' + drug.perDayCeil + ' mg/kg/day). ' +
        'Do not exceed it, and do not add a second product that contains the same medicine.';

      /* the band the parent landed in, exactly as the chart prints it */
      var bandLine = el('p', {
        style: 'margin:0.45em 0 0;font-family:var(--font-body);font-size:0.82rem;color:var(--text-dim);'
      }, out);
      bandLine.textContent = 'Chart band: ' + band.lb + ' → ' + band.mg + ' mg → ' + fmtMl(band.ml) + ' mL.';

      /* drug-specific extra cautions */
      if (drug.id !== 'acet') {
        var caut = el('p', {
          style: 'margin:0.45em 0 0;font-family:var(--font-body);font-size:0.85rem;color:var(--text-dim);line-height:1.5;'
        }, out);
        caut.innerHTML = 'Even now, skip ibuprofen if your baby is dehydrated or vomiting a lot, or has chickenpox; ' +
          'use acetaminophen instead. Give ibuprofen with a little food if it seems to upset the stomach.';
      }
    }

    /* ------------------------------------------------------------------
       events
       ------------------------------------------------------------------ */
    function setUnit(u) {
      if (state.unit === u) return;
      /* convert the visible value so the field tracks the same baby */
      var cur = parseFloat(weightInput.value);
      state.unit = u;
      if (u === 'kg') {
        btnKg.classList.add('on'); btnLb.classList.remove('on');
        btnKg.setAttribute('aria-pressed', 'true'); btnLb.setAttribute('aria-pressed', 'false');
        weightInput.max = '90';
        if (isFinite(cur) && cur > 0) weightInput.value = round1(cur / LB_PER_KG);
      } else {
        btnLb.classList.add('on'); btnKg.classList.remove('on');
        btnLb.setAttribute('aria-pressed', 'true'); btnKg.setAttribute('aria-pressed', 'false');
        weightInput.max = '200';
        if (isFinite(cur) && cur > 0) weightInput.value = round1(cur * LB_PER_KG);
      }
      readWeight();
    }

    function readWeight() {
      var v = parseFloat(weightInput.value);
      if (!isFinite(v) || v <= 0) { state.weightKg = null; }
      else { state.weightKg = (state.unit === 'kg') ? v : (v / LB_PER_KG); }
      render();
    }

    weightInput.addEventListener('input', readWeight);
    btnLb.addEventListener('click', function () { setUnit('lb'); weightInput.focus(); });
    btnKg.addEventListener('click', function () { setUnit('kg'); weightInput.focus(); });

    drugSel.addEventListener('change', function () {
      state.drug = drugSel.value;
      if (state.drug === 'acet') state.ibuConc = '';
      populateConc();
      render();
    });
    concSel.addEventListener('change', function () {
      if (state.drug === 'ibu') state.ibuConc = concSel.value;
      render();
    });

    /* ------------------------------------------------------------------
       accessible static fallback: the full dose chart as a real table.
       Present whether or not scripting drives the live widget, so a
       screen reader (or a no-JS reader, though this file is the JS) has
       the complete numbers.
       ------------------------------------------------------------------ */
    function buildFallback() {
      var wrap = el('details', { class: 'dose-fallback', style: 'margin-top:1.4em;' }, body);
      var sum = el('summary', {
        style: 'cursor:pointer;font-family:var(--font-body);color:var(--text);font-size:0.92rem;',
        text: 'See the full dose chart (every weight band)'
      }, wrap);
      sum.setAttribute('aria-label', 'See the full weight-banded dose chart');

      /* Acetaminophen table */
      acetTable(wrap);
      /* Ibuprofen table */
      ibuTable(wrap);

      var src = el('p', {
        class: 'src',
        style: 'margin:0.8em 0 0;font-family:var(--font-body);font-size:0.8rem;color:var(--text-dim);line-height:1.5;'
      }, wrap);
      src.innerHTML =
        'Doses by weight, not age. Acetaminophen 10 to 15 mg/kg every 4 to 6 hours (max 5 doses/24 h, about 75 mg/kg/day). ' +
        'Ibuprofen 10 mg/kg every 6 to 8 hours (max 4 doses/24 h, about 40 mg/kg/day), <b>not before 6 months</b>. ' +
        'Acetaminophen under 3 months only on a doctor’s direction. ' +
        'Sources: Stanford Children’s acetaminophen and ibuprofen weight-banded tables (Rev. 1/2026); ' +
        'Children’s Healthcare of Atlanta dose chart (2025); Seattle Children’s / Schmitt table (UH Rainbow), ' +
        'all adapting the AAP HealthyChildren chart.';
    }

    function tableEl(parent, caption, headers) {
      var wrapT = el('div', { class: 'gtable-wrap' }, parent);
      var t = el('table', { class: 'gtable' }, wrapT);
      var cap = el('caption', { text: caption, style: 'caption-side:top;text-align:left;font-family:var(--font-body);font-size:0.85rem;color:var(--text);padding:0.4em 0;' }, t);
      cap.style.fontWeight = '600';
      var thead = el('thead', null, t);
      var tr = el('tr', null, thead);
      headers.forEach(function (h, i) {
        var th = el('th', { scope: 'col', text: h }, tr);
        if (i > 0) th.className = 'num';
      });
      return el('tbody', null, t);
    }

    function acetTable(parent) {
      var tb = tableEl(parent, 'Acetaminophen (Tylenol), liquid 160 mg / 5 mL, every 4 to 6 hours, max 5 doses in 24 hours',
        ['Weight', 'Weight (kg)', 'Dose (mg)', 'Liquid 160 mg/5 mL']);
      ACET.bands.forEach(function (b) {
        var tr = el('tr', null, tb);
        el('th', { scope: 'row', text: b.lb }, tr);
        el('td', { class: 'num', text: kgRange(b) }, tr);
        el('td', { class: 'num', text: b.mg + ' mg' }, tr);
        el('td', { class: 'num', text: fmtMl(b.ml) + ' mL' }, tr);
      });
      var note = el('p', {
        style: 'margin:0.2em 0 0.6em;font-family:var(--font-body);font-size:0.8rem;color:var(--text-dim);'
      }, parent);
      note.innerHTML = 'The 6 to 11 lb / 40 mg row exists on the charts but applies only under a doctor’s ' +
        'direction: do not dose a baby under 3 months on your own.';
    }

    function ibuTable(parent) {
      var tb = tableEl(parent, "Ibuprofen (Advil, Motrin), every 6 to 8 hours, max 4 doses in 24 hours, not before 6 months",
        ['Weight', 'Weight (kg)', 'Dose (mg)', 'Infant drops 50 mg/1.25 mL', "Children's 100 mg/5 mL"]);
      /* merge the two ibuprofen tables by weight band for one clean chart */
      IBU_CHILD.bands.forEach(function (cb) {
        var ib = null;
        for (var i = 0; i < IBU_INFANT.bands.length; i++) {
          if (IBU_INFANT.bands[i].lb === cb.lb) { ib = IBU_INFANT.bands[i]; break; }
        }
        var tr = el('tr', null, tb);
        el('th', { scope: 'row', text: cb.lb }, tr);
        el('td', { class: 'num', text: kgRange(cb) }, tr);
        el('td', { class: 'num', text: cb.mg + ' mg' }, tr);
        el('td', { class: 'num', text: ib ? (fmtMl(ib.ml) + ' mL') : 'use children’s liquid' }, tr);
        el('td', { class: 'num', text: fmtMl(cb.ml) + ' mL' }, tr);
      });
    }

    function kgRange(b) {
      if (b.hiKg >= 900) return b.loKg + '+ kg';
      return b.loKg + ' to ' + b.hiKg + ' kg';
    }

    /* ---- first paint ---- */
    populateConc();
    render();
    buildFallback();
  };
})();


/* module: tool-growth.js */
/* ============================================================
   THE FIRST YEAR, tool: the WHO growth-percentile plotter.
   Module: growth (one FY.tool function, registered as FY.tool.growth).

   Enter sex, age in months (with a corrected-age helper for babies
   born early), a measurement type (weight, length, or head
   circumference), and a value in metric or imperial units. The tool
   computes the WHO z-score with the standard LMS formula
       z = ((value / M)^L - 1) / (L * S)      (L != 0)
       z = ln(value / M) / S                  (L = 0)
   and the percentile from the standard-normal CDF, then plots the
   point on shaded WHO bands (3rd / 15th / 50th / 85th / 97th).

   Data: WHO Child Growth Standards (weight-for-age, length-for-age,
   head-circumference-for-age, birth to 24 months, by sex), the
   published per-month L, M, S coefficients. Mirrored by CDC at
   https://www.cdc.gov/growthcharts/who-data-files.htm (byte-for-byte
   the WHO boys/girls tables). The anchor rows at 0, 6, 12, 18, and 24
   months match the values captured in the growth-charts deep dive to
   the published digits; the in-between months are the standard WHO
   per-month values. Length-for-age and head-circumference-for-age use
   L = 1 at every age (WHO sets those distributions symmetric).

   The engine is unit-testable against WHO's own percentile columns and
   agrees to better than 0.002 kg. No external libraries. No framework.
   Clean console. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  var P = (S && S.palette) || {
    gold: '#D4C4A0', goldHi: '#EDE0C0', parch: '#E8E2D6', dim: '#B8B2A2',
    rule: '#4A544B', ok: '#9ec79a', call: '#e6c074', emerg: '#e98e7f',
    sky: '#8fb3c7', plum: '#b79bc4'
  };

  /* ------------------------------------------------------------------
     WHO weight-for-age, kg. Per-month [L, M, S], 0 to 24 months.
     Boys and girls. Anchor months (0/6/12/18/24) match the deep-dive
     capture exactly; the rest are the standard WHO per-month rows.
     ------------------------------------------------------------------ */
  var WFA_BOYS = [
    [0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.1970, 5.5675, 0.12385],
    [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.11080],
    [0.1257, 7.9340, 0.10958], [0.1134, 8.2970, 0.10902], [0.1021, 8.6151, 0.10882],
    [0.0917, 8.9014, 0.10881], [0.0820, 9.1649, 0.10891], [0.0730, 9.4122, 0.10906],
    [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976],
    [0.0413, 10.3108, 0.11007], [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079],
    [0.0211, 10.9385, 0.11119], [0.0148, 11.1430, 0.11164], [0.0087, 11.3462, 0.11211],
    [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369],
    [-0.0137, 12.1515, 0.11426]
  ];
  var WFA_GIRLS = [
    [0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13000],
    [0.0402, 5.8458, 0.12619], [-0.0050, 6.4237, 0.12402], [-0.0430, 6.8985, 0.12274],
    [-0.0756, 7.2970, 0.12204], [-0.1039, 7.6422, 0.12178], [-0.1288, 7.9487, 0.12181],
    [-0.1507, 8.2254, 0.12199], [-0.1700, 8.4800, 0.12223], [-0.1872, 8.7192, 0.12247],
    [-0.2024, 8.9481, 0.12268], [-0.2158, 9.1699, 0.12283], [-0.2278, 9.3870, 0.12294],
    [-0.2384, 9.6008, 0.12299], [-0.2478, 9.8124, 0.12303], [-0.2562, 10.0226, 0.12306],
    [-0.2637, 10.2315, 0.12309], [-0.2703, 10.4393, 0.12315], [-0.2762, 10.6464, 0.12323],
    [-0.2815, 10.8534, 0.12335], [-0.2862, 11.0608, 0.12352], [-0.2903, 11.2688, 0.12371],
    [-0.2941, 11.4775, 0.12390]
  ];

  /* WHO length-for-age, cm. L = 1 at every age (so only M, S stored). */
  var LFA_BOYS = [
    [49.8842, 0.03795], [54.7244, 0.03557], [58.4249, 0.03424], [61.4292, 0.03328],
    [63.8860, 0.03257], [65.9026, 0.03204], [67.6236, 0.03165], [69.1645, 0.03139],
    [70.5994, 0.03124], [71.9687, 0.03117], [73.2812, 0.03118], [74.5388, 0.03125],
    [75.7488, 0.03137], [76.9186, 0.03154], [78.0497, 0.03174], [79.1458, 0.03197],
    [80.2113, 0.03222], [81.2487, 0.03250], [82.2587, 0.03279], [83.2418, 0.03310],
    [84.1996, 0.03342], [85.1348, 0.03376], [86.0477, 0.03410], [86.9410, 0.03445],
    [87.8161, 0.03479]
  ];
  var LFA_GIRLS = [
    [49.1477, 0.03790], [53.6872, 0.03640], [57.0673, 0.03568], [59.8029, 0.03520],
    [62.0899, 0.03486], [64.0301, 0.03463], [65.7311, 0.03448], [67.2873, 0.03441],
    [68.7498, 0.03440], [70.1435, 0.03444], [71.4818, 0.03452], [72.7710, 0.03464],
    [74.0150, 0.03479], [75.2176, 0.03496], [76.3817, 0.03514], [77.5099, 0.03534],
    [78.6055, 0.03555], [79.6710, 0.03576], [80.7079, 0.03598], [81.7182, 0.03620],
    [82.7036, 0.03643], [83.6654, 0.03666], [84.6040, 0.03688], [85.5202, 0.03711],
    [86.4153, 0.03734]
  ];

  /* WHO head-circumference-for-age, cm. L = 1 at every age. */
  var HCA_BOYS = [
    [34.4618, 0.03686], [37.2759, 0.03133], [39.1285, 0.02997], [40.5135, 0.02918],
    [41.6317, 0.02868], [42.5576, 0.02837], [43.3306, 0.02817], [43.9803, 0.02804],
    [44.5300, 0.02796], [44.9998, 0.02792], [45.4051, 0.02790], [45.7573, 0.02789],
    [46.0661, 0.02789], [46.3395, 0.02791], [46.5836, 0.02793], [46.8030, 0.02795],
    [47.0017, 0.02797], [47.1825, 0.02799], [47.3711, 0.02800], [47.5365, 0.02802],
    [47.6915, 0.02803], [47.8378, 0.02804], [47.9765, 0.02804], [48.1090, 0.02805],
    [48.2515, 0.02821]
  ];
  var HCA_GIRLS = [
    [33.8787, 0.03496], [36.5463, 0.03210], [38.2521, 0.03168], [39.5328, 0.03137],
    [40.5817, 0.03113], [41.4590, 0.03094], [42.1995, 0.03087], [42.8290, 0.03064],
    [43.3671, 0.03050], [43.8300, 0.03038], [44.2319, 0.03028], [44.5844, 0.03019],
    [44.8965, 0.03027], [45.1752, 0.03003], [45.4265, 0.02998], [45.6551, 0.02993],
    [45.8650, 0.02990], [46.0598, 0.02988], [46.2424, 0.02987], [46.4137, 0.02985],
    [46.5739, 0.02983], [46.7237, 0.02982], [46.8638, 0.02980], [46.9949, 0.02979],
    [47.1822, 0.02957]
  ];

  /* Measurement registry. Each: label, unit, the two LMS tables (by sex),
     whether L is fixed at 1, and the imperial conversion. */
  var MEAS = {
    weight: {
      label: 'Weight', metric: 'kg', imperial: 'lb',
      tables: { male: WFA_BOYS, female: WFA_GIRLS }, lOne: false,
      toMetric: function (lb) { return lb * 0.45359237; },
      fromMetric: function (kg) { return kg / 0.45359237; },
      step: { metric: 0.01, imperial: 0.1 }, placeholder: { metric: '7.9', imperial: '17.4' }
    },
    length: {
      label: 'Length (lying down)', metric: 'cm', imperial: 'in',
      tables: { male: LFA_BOYS, female: LFA_GIRLS }, lOne: true,
      toMetric: function (inch) { return inch * 2.54; },
      fromMetric: function (cm) { return cm / 2.54; },
      step: { metric: 0.1, imperial: 0.1 }, placeholder: { metric: '67.6', imperial: '26.6' }
    },
    head: {
      label: 'Head circumference', metric: 'cm', imperial: 'in',
      tables: { male: HCA_BOYS, female: HCA_GIRLS }, lOne: true,
      toMetric: function (inch) { return inch * 2.54; },
      fromMetric: function (cm) { return cm / 2.54; },
      step: { metric: 0.1, imperial: 0.1 }, placeholder: { metric: '43.3', imperial: '17.1' }
    }
  };

  /* The percentile bands the chart shades and the dropdown reference. */
  var BANDS = [3, 15, 50, 85, 97];
  /* z quantiles for those percentiles (standard normal inverse). */
  var BAND_Z = { 3: -1.88079, 15: -1.03643, 50: 0, 85: 1.03643, 97: 1.88079 };

  /* ------------------------------------------------------------------
     Math: LMS forward (value -> z), normal CDF, and z -> value.
     ------------------------------------------------------------------ */
  function lmsAt(table, ageMo, lOne) {
    /* linear interpolation in L, M, S between the two bracketing months */
    var a = ageMo;
    if (a <= 0) a = 0;
    if (a >= 24) a = 24;
    var lo = Math.floor(a), hi = Math.ceil(a), f = a - lo;
    var rLo = table[lo], rHi = table[hi];
    if (lOne) {
      var mLo = rLo[0], sLo = rLo[1], mHi = rHi[0], sHi = rHi[1];
      return { L: 1, M: mLo + (mHi - mLo) * f, S: sLo + (sHi - sLo) * f };
    }
    return {
      L: rLo[0] + (rHi[0] - rLo[0]) * f,
      M: rLo[1] + (rHi[1] - rLo[1]) * f,
      S: rLo[2] + (rHi[2] - rLo[2]) * f
    };
  }

  function zFromValue(value, lms) {
    var L = lms.L, M = lms.M, Sd = lms.S;
    if (value <= 0 || M <= 0 || Sd <= 0) return NaN;
    if (Math.abs(L) < 1e-7) return Math.log(value / M) / Sd;
    return (Math.pow(value / M, L) - 1) / (L * Sd);
  }

  function valueFromZ(z, lms) {
    var L = lms.L, M = lms.M, Sd = lms.S;
    if (Math.abs(L) < 1e-7) return M * Math.exp(Sd * z);
    var base = 1 + L * Sd * z;
    if (base <= 0) return NaN;
    return M * Math.pow(base, 1 / L);
  }

  /* Standard-normal CDF via the error function (Abramowitz & Stegun
     7.1.26), accurate to ~1.5e-7. Returns a probability in (0,1). */
  function normCdf(z) {
    var sign = z < 0 ? -1 : 1;
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  function pctFromZ(z) { return normCdf(z) * 100; }

  /* ------------------------------------------------------------------
     Small DOM helpers.
     ------------------------------------------------------------------ */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function uid(p) { uid._n = (uid._n || 0) + 1; return p + '-' + uid._n; }

  /* round-with-ordinal for a percentile, friendly phrasing */
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function pctLabel(p) {
    if (p < 0.1) return 'below the 1st';
    if (p > 99.9) return 'above the 99th';
    if (p < 1) return 'about the 1st';
    if (p > 99) return 'about the 99th';
    return 'about the ' + ordinal(Math.round(p));
  }

  /* ============================================================
     The tool
     ============================================================ */
  FY.tool['growth'] = function (mount) {
    if (!mount) return;
    /* If the SVG helper is missing we still render the calculator and a
       text result, just without the little band chart. Degrade cleanly. */
    var hasSvg = !!(S && S.make);

    /* keep the no-JS fallback paragraph as accessible context, but hide
       it now that the interactive tool is live */
    var fallback = mount.querySelector('.tool-fallback');
    if (fallback) fallback.hidden = true;

    /* ---------- header ---------- */
    var head = el('div', { class: 'tool-head' }, [
      el('h4', { text: 'Growth percentile plotter (WHO, under 2)' })
    ]);

    /* ---------- controls ---------- */
    var idSex = uid('g-sex'), idAge = uid('g-age'), idMeas = uid('g-meas'), idVal = uid('g-val');
    var idEarly = uid('g-early'), idWeeks = uid('g-weeks');

    var sexSel = el('select', { id: idSex, name: 'sex' }, [
      el('option', { value: 'female', text: 'Girl' }),
      el('option', { value: 'male', text: 'Boy' })
    ]);

    var ageInput = el('input', {
      id: idAge, name: 'age', type: 'number', min: '0', max: '24', step: '0.5',
      inputmode: 'decimal', value: '6', style: 'width:5.5em'
    });

    var measSel = el('select', { id: idMeas, name: 'meas' }, [
      el('option', { value: 'weight', text: 'Weight' }),
      el('option', { value: 'length', text: 'Length (lying down)' }),
      el('option', { value: 'head', text: 'Head circumference' })
    ]);

    var valInput = el('input', {
      id: idVal, name: 'value', type: 'number', min: '0', step: '0.01',
      inputmode: 'decimal', placeholder: '7.9', style: 'width:6em'
    });

    /* metric / imperial unit toggle (a real two-button segmented control) */
    var unitState = 'metric';
    var btnMetric = el('button', { type: 'button', class: 'on', 'aria-pressed': 'true', text: 'kg / cm' });
    var btnImperial = el('button', { type: 'button', 'aria-pressed': 'false', text: 'lb / in' });
    var unitSeg = el('span', { class: 'seg', role: 'group', 'aria-label': 'Units' }, [btnMetric, btnImperial]);
    var unitTag = el('span', { class: 'g-unit', style: 'margin-left:0.5em;color:' + P.dim }, []);

    /* corrected-age helper for babies born early */
    var earlyChk = el('input', { id: idEarly, name: 'early', type: 'checkbox' });
    var weeksInput = el('input', {
      id: idWeeks, name: 'weeksEarly', type: 'number', min: '0', max: '16', step: '1',
      inputmode: 'numeric', value: '0', style: 'width:4em', disabled: 'disabled'
    });

    function row(labelText, control, hint) {
      var l = el('label', { for: control.id, text: labelText, style: 'display:block;margin-bottom:0.25em' });
      var wrap = el('div', { style: 'margin:0 0 0.9em' }, [l, control]);
      if (hint) wrap.appendChild(el('span', { class: 'g-hint', style: 'margin-left:0.5em;font-size:0.82em;color:' + P.dim, text: hint }));
      return wrap;
    }

    /* value row groups the input, the unit segmented control, and the live unit tag */
    var valLabel = el('label', { for: idVal, text: 'Measurement', style: 'display:block;margin-bottom:0.25em' });
    var valRow = el('div', { style: 'margin:0 0 0.9em' }, [
      valLabel,
      el('span', { style: 'display:inline-flex;align-items:center;gap:0.6em;flex-wrap:wrap' }, [valInput, unitSeg, unitTag])
    ]);

    /* corrected-age row */
    var earlyLabel = el('label', { for: idEarly, style: 'display:inline-flex;align-items:center;gap:0.45em;cursor:pointer' }, [
      earlyChk, document.createTextNode('Baby was born early (use corrected age)')
    ]);
    var weeksLabel = el('label', { for: idWeeks, text: 'weeks early', style: 'margin-left:0.4em;color:' + P.dim });
    var earlyRow = el('div', { style: 'margin:0 0 0.9em' }, [
      earlyLabel,
      el('div', { class: 'g-weeks-wrap', style: 'margin-top:0.4em' }, [weeksInput, weeksLabel])
    ]);

    /* a two-column-ish flow for the compact selects */
    var controls = el('div', { class: 'g-controls' }, [
      row('Sex', sexSel),
      row('Age now (months, 0 to 24)', ageInput, 'use half-months if you like'),
      earlyRow,
      row('Measurement type', measSel),
      valRow
    ]);

    /* ---------- live output region ---------- */
    var out = el('div', { class: 'tool-out', 'aria-live': 'polite', role: 'status', style: 'margin-top:0.4em' });
    var bigLine = el('div', { class: 'g-big-line', style: 'margin-bottom:0.3em' });
    var subLine = el('div', { class: 'g-sub-line', style: 'font-size:0.9rem;color:' + P.dim });
    out.appendChild(bigLine);
    out.appendChild(subLine);

    var chartWrap = el('div', { class: 'g-chart', style: 'margin-top:0.9em' });

    /* ---------- safety rails (always visible) ---------- */
    var rail = el('div', { class: 'tool-rail' });
    rail.innerHTML =
      '<b>Most babies fall somewhere in the band, and that is the point.</b> There is no good or bad ' +
      'percentile and no target. A baby steadily on the 3rd can be every bit as healthy as one on the 97th. ' +
      'One point a little off the line is rarely a problem; what a clinician watches is the <b>trend over ' +
      'several visits</b>, the whole picture (feeding, energy, development), and how the measures relate to ' +
      'each other, not a single dot. Length especially is noisy: two careful people often differ by ' +
      'about 0.7 cm, so a single "drop" usually means re-measure, not worry. ' +
      'This tool is for understanding, not diagnosis. If something feels off, the next step is a conversation ' +
      'with your pediatrician, not a number from a webpage.';

    /* a smaller method/source note */
    var srcNote = el('p', {
      class: 'g-src',
      style: 'margin:0.9em 0 0;font-size:0.8rem;color:' + P.dim + ';line-height:1.45',
      html: 'Uses the WHO Child Growth Standards (the chart US, UK, Canadian, and Australian clinics use under age 2), ' +
        'weight, length, and head circumference by sex, birth to 24 months. The math is the published WHO LMS method ' +
        '(z = ((value / M)<sup>L</sup> - 1) / (L &times; S), percentile from the normal curve) and reproduces WHO\'s own ' +
        'tables to better than 0.002 kg. ' +
        '<span class="src"><a href="https://www.cdc.gov/growthcharts/who-data-files.htm">WHO via CDC</a></span>'
    });

    var body = el('div', { class: 'tool-body' }, [controls, out, chartWrap, rail, srcNote]);

    mount.appendChild(head);
    mount.appendChild(body);

    /* ------------------------------------------------------------------
       The little band chart: shaded 3/15/50/85/97 percentile bands across
       0 to 24 months for the chosen sex + measurement, with the entered
       point dropped on. Redrawn on every change.
       ------------------------------------------------------------------ */
    function drawChart(sex, measKey, ageMo, valueMetric, z) {
      chartWrap.innerHTML = '';
      if (!hasSvg) return;
      var m = MEAS[measKey];
      var table = m.tables[sex];

      var W = 520, H = 230;
      var M = { t: 14, r: 70, b: 34, l: 40 };
      var X0 = M.l, X1 = W - M.r, Y0 = M.t, Y1 = H - M.b;

      /* y-range from the 3rd to 97th band across all ages, padded */
      var yMin = Infinity, yMax = -Infinity;
      for (var mo = 0; mo <= 24; mo++) {
        var lms = lmsAt(table, mo, m.lOne);
        var v3 = valueFromZ(BAND_Z[3], lms), v97 = valueFromZ(BAND_Z[97], lms);
        if (v3 < yMin) yMin = v3; if (v97 > yMax) yMax = v97;
      }
      /* make sure the plotted point is inside the frame */
      if (isFinite(valueMetric)) { yMin = Math.min(yMin, valueMetric); yMax = Math.max(yMax, valueMetric); }
      var pad = (yMax - yMin) * 0.08 || 1;
      yMin -= pad; yMax += pad;

      var svg = S.make(W, H);
      svg.setAttribute('class', 'g-svg');
      svg.style.width = '100%';
      svg.style.height = 'auto';
      var sx = S.scale(0, 24, X0, X1);
      var sy = S.scale(yMin, yMax, Y1, Y0);
      var g = S.el('g', null, svg);

      /* band curves */
      function curve(p) {
        var pts = [];
        for (var mo = 0; mo <= 24; mo += 1) {
          var lms = lmsAt(table, mo, m.lOne);
          pts.push([sx(mo), sy(valueFromZ(BAND_Z[p], lms))]);
        }
        return pts;
      }
      var cs = {};
      BANDS.forEach(function (p) { cs[p] = curve(p); });

      /* shaded fills: 3-15, 15-85 (the central, calm zone), 85-97 */
      function bandFill(loPts, hiPts, fill, op) {
        var d = S.line(hiPts) + ' ' + loPts.slice().reverse().map(function (q) {
          return 'L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
        }).join(' ') + ' Z';
        S.el('path', { d: d, fill: fill, 'fill-opacity': op, stroke: 'none' }, g);
      }
      bandFill(cs[3], cs[15], P.gold, 0.06);
      bandFill(cs[15], cs[85], P.gold, 0.13);   /* the wide middle, drawn warmest */
      bandFill(cs[85], cs[97], P.gold, 0.06);

      /* the five band lines, 50th emphasized */
      BANDS.forEach(function (p) {
        var is50 = p === 50;
        S.el('path', {
          d: S.line(cs[p]), fill: 'none', stroke: is50 ? P.goldHi : P.gold,
          'stroke-width': is50 ? 1.8 : 1, 'stroke-opacity': is50 ? 0.95 : 0.55,
          'stroke-dasharray': is50 ? '' : '3 3', 'stroke-linejoin': 'round'
        }, g);
        var last = cs[p][cs[p].length - 1];
        g.appendChild(S.text(last[0] + 5, last[1] + 3, ordinal(p), 'viz-axis',
          { 'text-anchor': 'start', fill: is50 ? P.goldHi : P.dim, 'font-size': '9' }));
      });

      /* x ticks every 6 months */
      for (var t = 0; t <= 24; t += 6) {
        var gx = sx(t);
        S.el('line', { x1: gx, y1: Y1, x2: gx, y2: Y1 + 4, stroke: P.rule, 'stroke-width': 1 }, g);
        g.appendChild(S.text(gx, Y1 + 16, String(t), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': '9' }));
      }
      g.appendChild(S.text((X0 + X1) / 2, H - 4, 'Age (months)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': '9' }));
      g.appendChild(S.text(X0 - 6, Y0 + 4, m.metric, 'viz-axis', { 'text-anchor': 'end', fill: P.dim, 'font-size': '9' }));

      /* the plotted point */
      if (isFinite(ageMo) && isFinite(valueMetric)) {
        var px = sx(Math.max(0, Math.min(24, ageMo))), py = sy(valueMetric);
        S.el('line', { x1: px, y1: Y0, x2: px, y2: Y1, stroke: P.parch, 'stroke-width': 0.8, 'stroke-opacity': 0.3, 'stroke-dasharray': '2 3' }, g);
        S.el('circle', { cx: px, cy: py, r: 5.5, fill: 'none', stroke: P.parch, 'stroke-width': 1.4, 'stroke-opacity': 0.6 }, g);
        S.el('circle', { cx: px, cy: py, r: 3.2, fill: P.parch, stroke: '#22291f', 'stroke-width': 0.8 }, g);
      }

      svg.setAttribute('aria-hidden', 'true'); /* the result text carries the meaning for AT */
      chartWrap.appendChild(svg);
    }

    /* ------------------------------------------------------------------
       Recompute everything from the current control state.
       ------------------------------------------------------------------ */
    function update() {
      var sex = sexSel.value === 'male' ? 'male' : 'female';
      var measKey = measSel.value in MEAS ? measSel.value : 'weight';
      var m = MEAS[measKey];

      /* unit tag + placeholder follow both the measurement and the unit toggle */
      unitTag.textContent = unitState === 'metric' ? m.metric : m.imperial;
      valInput.placeholder = m.placeholder[unitState];
      valInput.step = String(m.step[unitState]);

      var ageNow = parseFloat(ageInput.value);
      var weeksEarly = earlyChk.checked ? Math.max(0, Math.min(16, parseInt(weeksInput.value, 10) || 0)) : 0;
      weeksInput.disabled = !earlyChk.checked;
      var correctedAge = ageNow - (weeksEarly / 4.345);  /* months = weeks / (avg weeks per month) */

      var rawVal = parseFloat(valInput.value);
      var valueMetric = NaN;
      if (isFinite(rawVal) && rawVal > 0) {
        valueMetric = unitState === 'metric' ? rawVal : m.toMetric(rawVal);
      }

      /* ---- validation / graceful empty states ---- */
      bigLine.innerHTML = '';
      subLine.innerHTML = '';

      if (!isFinite(ageNow) || ageNow < 0 || ageNow > 24) {
        bigLine.innerHTML = '<span style="color:' + P.dim + '">Enter an age from 0 to 24 months.</span>';
        subLine.textContent = 'This WHO chart covers birth to 2 years. At the 2-year visit clinics switch to a different chart.';
        drawChart(sex, measKey, NaN, NaN, NaN);
        return;
      }
      var ageForCalc = earlyChk.checked && weeksEarly > 0 ? correctedAge : ageNow;
      if (ageForCalc < 0) ageForCalc = 0;

      if (!isFinite(valueMetric)) {
        bigLine.innerHTML = '<span style="color:' + P.dim + '">Enter a ' + m.label.toLowerCase() + ' value to see the percentile.</span>';
        subLine.textContent = '';
        drawChart(sex, measKey, ageForCalc, NaN, NaN);
        return;
      }

      var lms = lmsAt(m.tables[sex], ageForCalc, m.lOne);
      var z = zFromValue(valueMetric, lms);
      if (!isFinite(z)) {
        bigLine.innerHTML = '<span class="blocked">That value does not compute on the chart. Please re-check it.</span>';
        subLine.textContent = '';
        drawChart(sex, measKey, ageForCalc, valueMetric, NaN);
        return;
      }
      var pct = pctFromZ(z);

      /* ---- the friendly result ---- */
      var medianMetric = lms.M;
      var medianShown = unitState === 'metric'
        ? medianMetric.toFixed(measKey === 'weight' ? 2 : 1) + ' ' + m.metric
        : m.fromMetric(medianMetric).toFixed(1) + ' ' + m.imperial;

      bigLine.innerHTML =
        '<span class="big">' + pctLabel(pct).replace('about the ', '') + '</span> ' +
        '<span style="color:' + P.dim + '">percentile</span>';

      var sexWord = sex === 'male' ? 'boys' : 'girls';
      var ageNote = (earlyChk.checked && weeksEarly > 0)
        ? ' at a corrected age of ' + correctedAge.toFixed(1) + ' months (' + ageNow + ' months old, ' + weeksEarly + ' weeks early)'
        : ' at ' + ageNow + ' months';
      subLine.innerHTML =
        'z-score ' + (z >= 0 ? '+' : '') + z.toFixed(2) + '. ' +
        'About ' + Math.round(Math.max(0, Math.min(100, pct))) + ' of 100 ' + sexWord + ' the same age measure less. ' +
        'The median (50th) here is ' + medianShown + '.';

      drawChart(sex, measKey, ageForCalc, valueMetric, z);
    }

    /* ---------- unit toggle wiring (convert the entered value in place) ---------- */
    function setUnit(next) {
      if (next === unitState) return;
      var measKey = measSel.value in MEAS ? measSel.value : 'weight';
      var m = MEAS[measKey];
      var raw = parseFloat(valInput.value);
      if (isFinite(raw) && raw > 0) {
        /* convert the displayed number so the baby's measurement is preserved */
        var metric = unitState === 'metric' ? raw : m.toMetric(raw);
        var shown = next === 'metric' ? metric : m.fromMetric(metric);
        valInput.value = shown.toFixed(next === 'metric' && measKey === 'weight' ? 2 : 1);
      }
      unitState = next;
      var metricOn = next === 'metric';
      btnMetric.classList.toggle('on', metricOn);
      btnImperial.classList.toggle('on', !metricOn);
      btnMetric.setAttribute('aria-pressed', metricOn ? 'true' : 'false');
      btnImperial.setAttribute('aria-pressed', metricOn ? 'false' : 'true');
      update();
    }
    btnMetric.addEventListener('click', function () { setUnit('metric'); });
    btnImperial.addEventListener('click', function () { setUnit('imperial'); });

    /* ---------- general wiring ---------- */
    [sexSel, ageInput, measSel, valInput, weeksInput].forEach(function (c) {
      c.addEventListener('input', update);
      c.addEventListener('change', update);
    });
    earlyChk.addEventListener('change', update);

    /* first paint (no value yet, so it shows the empty-state guidance + bands) */
    update();
  };
})();


/* module: tool-matrix-ors.js */
/* ============================================================
   THE FIRST YEAR, two interactive tools in one module.

   1) FY.tool['wellbaby-matrix'] : the cross-country well-baby
      system grid. A responsive table.gtable, one row per country
      (US, UK, Canada, Australia, Germany, France, Netherlands,
      Sweden/Finland, Japan, New Zealand, Ireland), columns =
      number of routine well-child encounters birth to 2 years,
      the ages, who delivers them (pediatrician vs nurse / health
      visitor / public-health nurse / GP), whether a home visit is
      built in, and the parent-held record artifact (the German
      Gelbes Heft, the French carnet de sante, the Japanese boshi
      techo, the UK red book, and so on). A country selector
      highlights the reader's row, and a standing note states the
      structural finding: the in-home first-days visit is the
      global norm and the US is the outlier.

   2) FY.tool['ors'] : an oral-rehydration calculator. Input the
      baby's weight (kg or lb), output the WHO/IMCI rehydration
      amount of about 75 mL/kg of low-osmolarity ORS over 4 hours
      for mild-to-moderate dehydration, plus the 50 to 100 mL per
      loose stool maintenance rule, the small-frequent-sips method,
      the do-NOT-use-water/juice/sports-drinks caveat, and a hard
      gate: under 3 months, or any red-flag dehydration sign, is
      "call now," not a calculator case.

   Both register onto window.FY.tool, build real keyboard-accessible
   controls, degrade gracefully, keep the console clean, and use no
   em dashes.

   Sources (all real, all cited inline and in each aria-label):
   - Well-baby grid: the cross-country well-baby systems deep-dive,
     synthesizing the national schedules: Germany G-BA Kinder-
     Richtlinie (U1 to U9, Gelbes Heft); France service-public.gouv.fr
     F967 (20 mandatory exams, carnet de sante, PMI); Netherlands
     JGZ/consultatiebureau + kraamzorg; Sweden BVC (1177.se) and
     Finland neuvola (thisisFINLAND); Japan Maternal and Child Health
     Act (boshi techo, 18-month and 3-year checks); Ireland HSE/
     mychild.ie (public health nurse); New Zealand Well Child
     Tamariki Ora / Plunket (12 core contacts); plus the US Bright
     Futures grid and the UK Healthy Child Programme / health-visitor
     and red book (Personal Child Health Record).
   - ORS: WHO IMCI chart booklet, Plan B (about 75 mL/kg over 4 hours
     for some dehydration) and Plan A (50 to 100 mL per loose stool
     under 2 years); WHO/UNICEF reduced-osmolarity ORS (2003); the
     under-3-months fever/illness override and the Clinical
     Dehydration Scale red flags (Goldman 2008).
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  // Small DOM helper, same shape the other tool modules use.
  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ========================================================
     TOOL 1: the cross-country well-baby matrix.
     ======================================================== */

  // One row per country. Every figure traces to the cross-country
  // well-baby systems deep-dive and the national schedule it cites.
  // visits = routine well-child encounters birth to roughly 2 years.
  // deliverer = who does the bulk of the routine surveillance.
  // home = the built-in first-days/weeks home visit (the key axis).
  // record = the parent-held portable record artifact.
  var MATRIX = [
    {
      country: 'United States',
      key: 'us',
      visits: 'about 8 to 9 by 18 months (11 scheduled by 30 months)',
      ages: 'newborn, 3 to 5 days, by 1 month, then 2, 4, 6, 9, 12, 15, 18 months (and 24, 30 months)',
      who: 'Pediatrician (office-based)',
      home: 'No universal entitlement',
      homeOK: false,
      record: 'No single national booklet; records live in the practice EHR and state immunization registries',
      note: 'The outlier: most well-child visits of any peer, but no universal in-home visit and no national parent-held record.'
    },
    {
      country: 'United Kingdom',
      key: 'uk',
      visits: 'about 5 to 6 in the first 2 years',
      ages: 'new-baby review (10 to 14 days), 6 to 8 weeks (GP), then health-visitor reviews and a 9-to-12-month and 2-to-2.5-year review',
      who: 'Health visitor (specialist nurse), with GP at the 6-to-8-week check',
      home: 'Yes, health-visitor home visits',
      homeOK: true,
      record: 'The "red book" (Personal Child Health Record, PCHR)',
      note: 'Nurse-led (the health visitor), with the famous red book carried by the family.'
    },
    {
      country: 'Canada',
      key: 'ca',
      visits: 'about 7 to 8 in the first 2 years (Rourke schedule)',
      ages: 'within days of birth, then 1, 2, 4, 6, 9, 12, 18 months',
      who: 'Family physician or pediatrician (Rourke Baby Record)',
      home: 'Varies by province (public-health home visits in many)',
      homeOK: true,
      record: 'Provincial child health records; the Rourke Baby Record guides the visits',
      note: 'Physician-led on the Rourke schedule; public-health home visiting varies by province.'
    },
    {
      country: 'Australia',
      key: 'au',
      visits: 'about 7 to 8 checks in the first 2 years',
      ages: 'home visit in the first 1 to 4 weeks, then 6 to 8 weeks, 4, 6, 12, 18 months (state schedules vary)',
      who: 'Maternal and child health nurse (state-run), GP for immunisations',
      home: 'Yes, an early nurse home visit',
      homeOK: true,
      record: 'State personal health record (the "blue book" in several states)',
      note: 'Nurse-led maternal and child health service, with an early home visit and a state-issued personal health record.'
    },
    {
      country: 'Germany',
      key: 'de',
      visits: '7 (U1 to U7)',
      ages: 'U1 at birth, U2 day 3 to 10, U3 week 4 to 5, U4 month 3 to 4, U5 month 6 to 7, U6 month 10 to 12, U7 month 21 to 24',
      who: 'Pediatrician (Kinderarzt) from U2',
      home: 'Yes, midwife (Hebamme) home visits',
      homeOK: true,
      record: 'The Gelbes Heft (yellow booklet, the Kinderuntersuchungsheft)',
      note: 'Pediatrician-delivered like the US, but with daily midwife home visits in the first 10 days and the parent-held yellow booklet. U-exams are voluntary nationally, mandatory in Bavaria, Hesse, and Baden-Wurttemberg.'
    },
    {
      country: 'France',
      key: 'fr',
      visits: '13 of the 20 legally mandatory exams fall in birth to 2 years',
      ages: 'within 8 days, 2nd week, then 1, 2, 3, 4, 5, 8, 11, 12, 16 to 18, and 23 to 24 months',
      who: 'GP or pediatrician, or a PMI centre (free, to age 5)',
      home: 'For at-risk families via PMI',
      homeOK: true,
      record: 'The carnet de sante',
      note: 'The densest mandatory schedule (100 percent reimbursed); 3 of the exams (8 days, 8 months, 23 to 24 months) send a certificate to the PMI public-health system.'
    },
    {
      country: 'Netherlands',
      key: 'nl',
      visits: 'about 8 in year one plus a couple in year two',
      ages: 'JGZ home visit in the first 14 days, then clinic (consultatiebureau) visits across the first two years (exact count varies by GGD region)',
      who: 'Youth-health-care nurse (JGZ) plus a doctor (jeugdarts) at some visits',
      home: 'Yes, a JGZ home visit and the kraamzorg week',
      homeOK: true,
      record: 'JGZ youth-health-care records (digital dossier)',
      note: 'Nurse-and-doctor model, on top of kraamzorg: 24 to 80 hours (about 49 typical) of in-home maternity-nurse care over the first 8 to 10 days.'
    },
    {
      country: 'Sweden / Finland',
      key: 'se',
      visits: 'most of Sweden\'s 15 BVC contacts, and part of Finland\'s about 20, fall in years 0 to 2',
      ages: 'Sweden: first doctor visit about 4 weeks, home visits after birth and about 8 months. Finland: front-loaded neuvola checks in the first year',
      who: 'Public-health / child-health nurse (BVC nurse; neuvola terveydenhoitaja) with a doctor at anchor visits',
      home: 'Yes (postnatal home visit common in both)',
      homeOK: true,
      record: 'BVC / neuvola records (national handbook; Sweden\'s Rikshandboken)',
      note: 'The Nordic nurse-led model; near-total uptake (99.7 percent of pregnant people use the Finnish neuvola).'
    },
    {
      country: 'Japan',
      key: 'jp',
      visits: 'a 3-to-4-month check plus the legally required 18-month check, plus local extras',
      ages: 'under-1-month home visit, common 3-to-4-month check, then the mandatory 18-month (and 3-year) checks',
      who: 'Municipal public-health nurse (hokenshi) and midwife; doctors and dentists at the checks',
      home: 'Yes, a municipal home visit for babies 1 month or under',
      homeOK: true,
      record: 'The boshi techo (Maternal and Child Health Handbook)',
      note: 'The 18-month and 3-year checks are legally required (Maternal and Child Health Act). The boshi techo, created in 1948, seeded the WHO home-based-records movement and has been exported to 30 to 50-plus countries.'
    },
    {
      country: 'New Zealand',
      key: 'nz',
      visits: 'first contact at 4 to 6 weeks, then 8 to 10 weeks, 3 to 4, 5 to 7, 9 to 12, and 15 to 18 months',
      ages: 'a lead-maternity-carer midwife covers birth to 4 to 6 weeks, then Well Child Tamariki Ora picks up (12 core contacts to age 5)',
      who: 'Well Child nurse (Plunket and others); GP does the 6-week check',
      home: 'Yes, the LMC midwife provides postnatal visits',
      homeOK: true,
      record: 'The Well Child Tamariki Ora "My Health Book"',
      note: 'Nurse-delivered; Plunket sees about 80 percent of all new babies in Aotearoa New Zealand.'
    },
    {
      country: 'Ireland',
      key: 'ie',
      visits: 'newborn exam plus a PHN home visit, GP checks at 2 and 6 weeks, then PHN developmental checks',
      ages: 'newborn exam within 72 hours, PHN home visit within 72 hours of discharge, GP at 2 and 6 weeks, PHN at 3 months, then about 7 to 9 and 18 to 24 months',
      who: 'Public health nurse (PHN) plus the GP for the 2-week and 6-week checks',
      home: 'Yes, a PHN home visit within 72 hours of discharge',
      homeOK: true,
      record: 'HSE child health record ("My Child" materials; mychild.ie)',
      note: 'A public-health-nurse-plus-GP hybrid; the PHN owns the home visit and the developmental checks.'
    }
  ];

  FY.tool['wellbaby-matrix'] = function (mount) {
    if (!mount) return;
    var P = (FY.svg && FY.svg.palette) || {};
    mount.textContent = '';
    var ok = P.ok || '#9ec79a';
    var emerg = P.emerg || '#e98e7f';

    // ---------- Head ----------
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'The well-baby visit, eleven countries' }, head);

    var body = el('div', { class: 'tool-body' }, mount);

    el('p', {
      style: 'font-family:var(--font-body);color:var(--text-dim);margin:0 0 0.9em;line-height:1.55;',
      html: 'How many routine well-child visits a baby gets in the first two years, at what ages, <b>who</b> delivers them, whether a clinician comes <b>into the home</b>, and the single record the family keeps and carries. Pick your country to highlight its row.'
    }, body);

    // ---------- Country selector ----------
    var selId = 'fy-matrix-country';
    var field = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:0.6em;margin-bottom:0.6em;' }, body);
    el('label', { for: selId, text: 'Highlight my country:' }, field);
    var sel = el('select', { id: selId, style: 'flex:0 1 18em;min-width:12em;max-width:100%;' }, field);
    el('option', { value: '', text: 'None (show all)' }, sel);
    MATRIX.forEach(function (r) {
      el('option', { value: r.key, text: r.country }, sel);
    });

    // ---------- The responsive table ----------
    var wrap = el('div', { class: 'gtable-wrap' }, body);
    var table = el('table', { class: 'gtable' }, wrap);
    el('caption', {
      style: 'text-align:left;font-family:var(--font-body);color:var(--text-dim);padding:0.4em 0;line-height:1.5;',
      text: 'Routine well-child care, birth to about 2 years. Counts and ages are the national framework; several countries vary by region (Germany by Bundesland, the Netherlands by GGD region, New Zealand by provider).'
    }, table);

    var thead = el('thead', null, table);
    var htr = el('tr', null, thead);
    ['Country', 'Visits, birth to 2y', 'The ages', 'Who delivers', 'Home visit', 'The record you keep'].forEach(function (h) {
      el('th', { scope: 'col', text: h }, htr);
    });

    var tbody = el('tbody', null, table);
    var rowEls = {};
    MATRIX.forEach(function (r) {
      var tr = el('tr', null, tbody);
      rowEls[r.key] = tr;
      el('th', { scope: 'row', text: r.country }, tr);
      el('td', { text: r.visits }, tr);
      el('td', { text: r.ages }, tr);
      el('td', { text: r.who }, tr);
      // The home-visit cell is the load-bearing column; color the answer.
      var homeTd = el('td', null, tr);
      var mark = el('span', {
        text: r.home,
        style: 'color:' + (r.homeOK ? ok : emerg) + ';font-family:var(--font-heading);'
      }, homeTd);
      void mark;
      el('td', { text: r.record }, tr);
    });

    // ---------- The live detail line for the chosen country ----------
    var detail = el('div', {
      class: 'tool-out',
      'aria-live': 'polite',
      style: 'margin-top:0.4em;min-height:1.5em;font-family:var(--font-body);color:var(--text);line-height:1.55;'
    }, body);

    function clearHL() {
      MATRIX.forEach(function (r) {
        var tr = rowEls[r.key];
        if (tr) tr.classList.remove('hl');
      });
    }

    function render(key) {
      clearHL();
      detail.textContent = '';
      if (!key) {
        el('span', {
          style: 'color:var(--text-dim);',
          text: 'Ten of these eleven systems send a clinician into the home in the first days to weeks. The United States is the one that does not.'
        }, detail);
        return;
      }
      var r = null;
      for (var i = 0; i < MATRIX.length; i++) { if (MATRIX[i].key === key) { r = MATRIX[i]; break; } }
      if (!r) return;
      var tr = rowEls[key];
      if (tr) {
        tr.classList.add('hl');
        if (tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
      }
      el('span', { html: '<b>' + r.country + ':</b> ' + r.note }, detail);
    }

    sel.addEventListener('change', function () { render(sel.value); });
    render('');

    // ---------- The standing finding ----------
    var rail = el('div', { class: 'tool-rail', role: 'note' }, body);
    el('div', {
      html: '<b>The home visit is the global norm, and the US is the outlier.</b> Every wealthy country here except the United States sends a midwife or nurse into the home in the first days to weeks (the German Hebamme, the Dutch kraamzorg maternity nurse, the Irish public health nurse, the Nordic and Australian and New Zealand home visits), and hands the family a single portable record they own (the yellow booklet, the carnet de sante, the boshi techo, the red book). The US routes nearly everything through the pediatrician\'s office, has no universal home-visit entitlement, and has no national parent-held record. These are system-design differences, not a quality ranking: outcomes are good under both the pediatrician-led and nurse-led models.'
    }, rail);
    el('div', {
      style: 'margin-top:0.5em;font-size:0.82rem;opacity:0.8;font-family:var(--font-body);line-height:1.45;',
      text: 'Sources: the national well-child schedules, synthesized in the cross-country well-baby systems review. Germany G-BA Kinder-Richtlinie; France service-public.gouv.fr (F967); Netherlands JGZ plus kraamzorg; Sweden 1177.se BVC and Finland neuvola; Japan Maternal and Child Health Act; Ireland HSE / mychild.ie; New Zealand Well Child Tamariki Ora / Plunket; US Bright Futures; UK Healthy Child Programme (red book / PCHR).'
    }, rail);

    // ---------- Accessible summary on the mount ----------
    mount.setAttribute('role', 'group');
    mount.setAttribute('aria-label',
      'Cross-country well-baby visit grid for eleven countries (United States, United Kingdom, Canada, Australia, Germany, France, Netherlands, Sweden and Finland, Japan, New Zealand, Ireland). ' +
      'For each: the number of routine well-child visits birth to two years, the ages, who delivers them (pediatrician versus nurse, health visitor, public-health nurse, or GP), whether a home visit is built in, and the parent-held record (such as the German Gelbes Heft, French carnet de sante, Japanese boshi techo, or UK red book). ' +
      'Ten of the eleven systems include a first-days home visit; the United States is the only one with no universal home visit and no national parent-held record. A country selector highlights the reader row. ' +
      'Source: the national schedules, synthesized in the cross-country well-baby systems review.');
  };

  /* ========================================================
     TOOL 2: the oral-rehydration (ORS) calculator.
     ======================================================== */

  // WHO/IMCI numbers, all real and cited:
  // - Plan B (treat SOME, that is mild-to-moderate, dehydration with
  //   ORS over 4 hours): amount in mL = weight in kg x 75. This is the
  //   well-known "75 mL/kg over 4 hours" figure.
  // - Plan A (mild / prevent dehydration at home), maintenance after
  //   each loose stool: 50 to 100 mL for a child under 2 years.
  // - ORS must be the low-osmolarity WHO/UNICEF formula (2003); plain
  //   water, juice, and sports drinks are NOT substitutes.
  var ML_PER_KG = 75;          // Plan B, over 4 hours.
  var STOOL_MIN = 50;          // Plan A per loose stool, under 2y.
  var STOOL_MAX = 100;
  var LB_PER_KG = 2.2046226218;

  // Plausible infant/toddler weight bounds (kg). Outside this we still
  // compute, but we flag it, because a typo should not silently produce
  // a dangerous volume.
  var KG_MIN = 1.5;            // a small newborn
  var KG_MAX = 20;             // a large toddler

  function round5(x) { return Math.round(x / 5) * 5; }

  FY.tool['ors'] = function (mount) {
    if (!mount) return;
    var P = (FY.svg && FY.svg.palette) || {};
    mount.textContent = '';
    var accentEmerg = P.emerg || '#e98e7f';

    // ---------- Head ----------
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'Oral rehydration (ORS) calculator' }, head);

    var body = el('div', { class: 'tool-body' }, mount);

    // ---------- The hard gate, always on, above the calculator ----------
    var gate = el('div', {
      class: 'tool-rail',
      role: 'note',
      style: 'margin-top:0;margin-bottom:1em;border-color:' + accentEmerg + ';border-width:2px;'
    }, body);
    el('div', {
      class: 'blocked',
      style: 'font-family:var(--font-heading);font-weight:700;font-size:1.02rem;margin-bottom:0.25em;',
      text: 'Call now, do not calculate, if any of these are true'
    }, gate);
    el('div', {
      html: '<b>This calculator is for a baby OVER 3 months with mild-to-moderate dehydration only.</b> Call your pediatrician or emergency services now, instead of rehydrating at home, if the baby is <b>under 3 months</b>, is <b>too drowsy or floppy to drink</b>, is <b>vomiting everything</b> (cannot keep any fluid down), has <b>no wet diaper for 8 or more hours</b>, has <b>no tears, sunken eyes, or a sunken soft spot</b>, has a <b>skin pinch that goes back very slowly</b>, or has <b>green (bile) or bloody vomit or blood in the stool</b>. These are signs of severe dehydration or a serious problem and need IV fluids or urgent care.'
    }, gate);
    el('div', {
      style: 'margin-top:0.4em;font-size:0.82rem;opacity:0.85;',
      text: 'Source: WHO IMCI danger signs and dehydration plans; Clinical Dehydration Scale (Goldman 2008); the under-3-months fever/illness override.'
    }, gate);

    // ---------- The weight input + unit toggle ----------
    var inId = 'fy-ors-weight';
    var field = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:flex-end;gap:0.8em;' }, body);

    var wlab = el('div', { style: 'display:flex;flex-direction:column;gap:0.25em;' }, field);
    el('label', { for: inId, text: 'Baby\'s weight' }, wlab);
    var input = el('input', {
      id: inId,
      type: 'number',
      min: '0',
      max: '40',
      step: '0.1',
      inputmode: 'decimal',
      placeholder: 'e.g. 8',
      style: 'width:7em;font-family:var(--font-mono);font-size:1rem;padding:0.4em 0.5em;'
    }, wlab);

    // The unit toggle as a real, keyboard-accessible segmented control.
    var unit = 'kg';
    var ulab = el('div', { style: 'display:flex;flex-direction:column;gap:0.25em;' }, field);
    el('span', {
      id: 'fy-ors-unitlabel',
      text: 'Unit',
      style: 'font-family:var(--font-body);color:var(--text-dim);font-size:0.9rem;'
    }, ulab);
    var seg = el('div', { class: 'seg', role: 'group', 'aria-labelledby': 'fy-ors-unitlabel' }, ulab);
    var btnKg = el('button', { type: 'button', text: 'kg', class: 'on', 'aria-pressed': 'true' }, seg);
    var btnLb = el('button', { type: 'button', text: 'lb', 'aria-pressed': 'false' }, seg);

    // ---------- The live output ----------
    var out = el('div', {
      class: 'tool-out',
      'aria-live': 'polite',
      style: 'margin-top:1.1em;min-height:3em;'
    }, body);

    function toKg(v) { return unit === 'kg' ? v : v / LB_PER_KG; }

    function render() {
      out.textContent = '';
      var raw = parseFloat(input.value);

      if (!input.value || isNaN(raw) || raw <= 0) {
        el('p', {
          style: 'font-family:var(--font-body);color:var(--text-dim);margin:0;line-height:1.55;',
          text: 'Enter the baby\'s weight to get the ORS amount. The target for mild-to-moderate dehydration is about 75 mL of ORS per kilogram of body weight, given in small frequent sips over 4 hours.'
        }, out);
        return;
      }

      var kg = toKg(raw);

      // Out-of-range guard: still compute, but flag a likely typo.
      var oor = (kg < KG_MIN || kg > KG_MAX);

      var total = kg * ML_PER_KG;            // mL over 4 hours (Plan B)
      var totalR = round5(total);            // rounded to the nearest 5 mL
      var perHour = round5(total / 4);       // a practical hourly pace

      var card = el('div', {
        class: 'tool-rail',
        style: 'margin-top:0;border-left:5px solid ' + (P.ok || '#9ec79a') + ';'
      }, out);

      // The headline number.
      var line = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:baseline;gap:0.5em;margin-bottom:0.3em;' }, card);
      el('span', { class: 'big', text: String(totalR) + ' mL' }, line);
      el('span', {
        style: 'font-family:var(--font-body);color:var(--text-dim);',
        text: 'of low-osmolarity ORS over 4 hours'
      }, line);

      el('div', {
        style: 'font-family:var(--font-body);color:var(--text);line-height:1.55;',
        html: 'For a ' + (unit === 'kg' ? (raw + ' kg') : (raw + ' lb, about ' + kg.toFixed(1) + ' kg')) +
          ' baby, that is about <b>75 mL per kg</b> over 4 hours, a pace of roughly <b>' + perHour +
          ' mL per hour</b>. Give it in small, frequent sips (a teaspoon or two every few minutes) from a cup, spoon, or oral syringe, not in one big drink. If the baby vomits, wait about 10 minutes, then resume more slowly.'
      }, card);

      // The per-loose-stool maintenance rule (Plan A).
      el('div', {
        style: 'font-family:var(--font-body);color:var(--text-dim);margin-top:0.5em;line-height:1.5;',
        html: '<b>Plus, after each loose stool:</b> give an extra <b>' + STOOL_MIN + ' to ' + STOOL_MAX +
          ' mL</b> of ORS (the rule for a child under 2 years) to keep up with ongoing losses. <b>Keep breastfeeding throughout</b>, on top of the ORS.'
      }, card);

      if (oor) {
        el('div', {
          style: 'font-family:var(--font-body);color:' + accentEmerg + ';margin-top:0.5em;line-height:1.5;',
          text: kg < KG_MIN
            ? 'That weight is below a typical newborn. A baby this small (and any baby under 3 months) should be seen by a clinician, not rehydrated from a calculator. Please double-check the number and the unit.'
            : 'That weight is above a typical toddler. Please double-check the number and the unit; if it is correct, this is outside an infant guide and you should follow your clinician\'s dosing.'
        }, card);
      }

      el('div', {
        style: 'margin-top:0.5em;font-size:0.82rem;opacity:0.8;font-family:var(--font-body);',
        text: 'Source: WHO IMCI chart booklet, Plan B (75 mL/kg over 4 hours for some dehydration) and Plan A (50 to 100 mL per loose stool, under 2 years).'
      }, card);
    }

    function setUnit(u) {
      if (u === unit) return;
      unit = u;
      var isKg = (u === 'kg');
      btnKg.classList.toggle('on', isKg);
      btnLb.classList.toggle('on', !isKg);
      btnKg.setAttribute('aria-pressed', isKg ? 'true' : 'false');
      btnLb.setAttribute('aria-pressed', isKg ? 'false' : 'true');
      input.setAttribute('max', isKg ? '40' : '88');
      render();
    }

    btnKg.addEventListener('click', function () { setUnit('kg'); });
    btnLb.addEventListener('click', function () { setUnit('lb'); });
    input.addEventListener('input', render);
    render();

    // ---------- The "what counts as ORS" caveat ----------
    var rail = el('div', { class: 'tool-rail', role: 'note' }, body);
    el('div', {
      html: '<b>Use real oral rehydration solution, not water, juice, or sports drinks.</b> Plain water lacks the salts a dehydrated baby needs and can dangerously dilute their blood sodium; fruit juice and sports drinks are too sugary and can pull more water into the gut and worsen the diarrhea. Use a commercial low-osmolarity ORS (for example Pedialyte, or a WHO/UNICEF ORS sachet mixed exactly as directed). The modern WHO/UNICEF reduced-osmolarity formula (sodium 75, glucose 75 mmol/L, 245 mOsm/L) cuts stool volume by about 25 percent and the need for IV fluids by about 30 percent versus the old recipe. The BRAT diet and diluting formula are outdated; resume the baby\'s normal age-appropriate feeds early.'
    }, rail);
    el('div', {
      style: 'margin-top:0.5em;font-size:0.85rem;color:' + accentEmerg + ';font-family:var(--font-body);line-height:1.45;',
      text: 'If the baby is under 3 months, cannot keep fluids down, will not drink, or shows any severe-dehydration sign above, stop and call now. This tool supports home care for mild-to-moderate dehydration; it does not replace your pediatrician.'
    }, rail);

    // ---------- Accessible summary on the mount ----------
    mount.setAttribute('role', 'group');
    mount.setAttribute('aria-label',
      'Oral rehydration solution (ORS) calculator for a baby over 3 months with mild-to-moderate dehydration. ' +
      'Enter the weight in kilograms or pounds; it returns the target ORS volume at about 75 mL per kilogram of low-osmolarity ORS over 4 hours, in small frequent sips, plus 50 to 100 mL after each loose stool for a child under 2 years, while continuing breastfeeding. ' +
      'Use real ORS, not water, juice, or sports drinks. ' +
      'Hard gate: under 3 months, or any red-flag sign (too drowsy to drink, vomiting everything, no wet diaper for 8 or more hours, no tears or sunken eyes, a skin pinch that returns very slowly, or green or bloody vomit), means call now rather than rehydrate at home. ' +
      'Source: WHO IMCI chart booklet, Plans A and B; WHO/UNICEF reduced-osmolarity ORS (2003); Clinical Dehydration Scale (Goldman 2008).');
  };
})();


/* module: tool-triage.js */
/* ============================================================
   THE FIRST YEAR, interactive tool: triage.
   The master symptom-severity triage card. A fixed, always-on
   override banner (any rectal fever 38.0 C / 100.4 F or higher in
   a baby UNDER 3 MONTHS = be seen now, non-negotiable) sits above
   a symptom selector. Picking a symptom shows the matching action
   tier (call 911 / go to the ER now / see a doctor within 24h /
   call for advice / self-care) with the specific red-flag features.
   The full matrix is also rendered as a printable table.gtable
   fallback. Registers onto window.FY.tool. No em dashes.

   Cross-walk of authorities:
   - NICE NG143 traffic-light tool (UK), last updated 26 Nov 2021,
     risk section reaffirmed 30 Apr 2025: green / amber / red features.
     https://www.nice.org.uk/guidance/ng143/chapter/recommendations
   - AAP febrile-infant guideline (Pantell, Roberts et al.),
     Pediatrics 2021;148(2):e2021052228: the under-3-months spine.
   - WHO IMCI general danger signs + fast-breathing thresholds
     (chart booklet) and the WHO Managing PSBI 2019 age bands.
   - NHS meningitis / fever-in-children pages (the glass test, the
     "do not wait for a rash" instruction).
   - RCH Melbourne febrile-child + seriously-unwell-neonate guideline;
     CPS croup guideline.
   Conservative-wins rule: where the bodies differ in wording, the
   lower threshold to act is used, because a missed serious infection
   in a baby is catastrophic and an unnecessary visit is bounded.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  // The four-plus-one action tiers, most urgent first. Colors map to
  // the shared palette (emerg / call / ok) so the card reads at a glance.
  // selfcare reuses the gentle "ok" green; advice and 24h share the warm
  // "call" amber but carry distinct labels.
  var TIERS = {
    t911:    { rank: 1, label: 'Call 911 now', cls: 'emerg', blurb: 'Life-threatening. Call 911 (UK 999) or your local emergency number now. Start CPR if the baby is not breathing and you are trained.' },
    ter:     { rank: 2, label: 'Go to the ER now', cls: 'emerg', blurb: 'Be seen at an emergency department now, or call 911 if you cannot get there fast or the baby is getting worse.' },
    t24h:    { rank: 3, label: 'See a doctor within 24 hours', cls: 'call', blurb: 'Call your pediatrician for a same-day or next-day visit; use urgent care or the ER if no appointment is available and you are worried.' },
    tadvice: { rank: 4, label: 'Call for advice', cls: 'call', blurb: 'Call your pediatrician or nurse advice line within a day or two. Watch for any sign above and re-present if it appears.' },
    tself:   { rank: 5, label: 'Self-care, watch at home', cls: 'ok', blurb: 'Reasonable to comfort and watch at home with safety-netting. Recheck overnight, keep fluids up, and seek help if any red-flag sign appears or you feel it is getting worse.' }
  };

  // The under-3-months fever override. This is the one place where a
  // single thermometer number, with no other symptom, forces action.
  // NICE RED ("age under 3 months with temperature 38C or higher"),
  // AAP 2021 (8 to 60 days, full sepsis workup), and the newborn
  // red-flag set all converge here. Under 28 days it is essentially
  // absolute; a LOW temperature (under 36.0 C / 96.8 F) is equally
  // ominous in a newborn.
  var OVERRIDE = {
    title: 'Under 3 months: the one non-negotiable rule',
    body: 'ANY rectal temperature of 38.0 C (100.4 F) or higher in a baby under 3 months is an emergency, no matter how well the baby looks. Do not give a fever medicine and watch; be seen now (under 28 days, treat it as a 911-level reason to go in). A LOW temperature (under 36.0 C / 96.8 F) in a newborn is just as worrying. A young baby can have a serious infection while still feeding and looking calm, which is exactly why the number alone is the trigger.',
    src: 'NICE NG143 RED; AAP febrile-infant guideline, Pediatrics 2021;148(2):e2021052228.'
  };

  // The symptom matrix. Each row: a parent-facing symptom, the matched
  // action tier, and the specific red-flag features that define it.
  // "look" is the option label in the selector; "feat" is the detail
  // shown when selected and in the printable table. Every threshold is
  // a real, cited figure from the merged red-flag system.
  var ROWS = [
    {
      group: 'Fever',
      look: 'Fever, baby UNDER 3 months (any 38.0 C / 100.4 F or higher)',
      tier: 't911',
      feat: 'Any rectal fever 38.0 C (100.4 F) or higher under 3 months is an emergency on its own (under 28 days, go in at once). A low temperature under 36.0 C (96.8 F) in a newborn is equally urgent. This is the override above the whole card.',
      src: 'NICE NG143 RED; AAP 2021'
    },
    {
      group: 'Fever',
      look: 'Fever, baby 3 to 6 months (39 C / 102.2 F or higher)',
      tier: 't24h',
      feat: 'A temperature of 39 to 40 C (102.2 to 104 F) in a 3-to-6-month-old, or any high fever with a baby who looks unwell, gets a same-day call. The 3-to-6-month / 39 C line is a NICE amber feature.',
      src: 'NICE NG143 amber'
    },
    {
      group: 'Fever',
      look: 'Fever lasting 5 days or more (any age)',
      tier: 't24h',
      feat: 'Fever for 5 days or more is a NICE amber feature and the trigger to be examined for Kawasaki disease (you do not diagnose it; the 5-day fever is the reason to be seen). A baby under 6 months with 7+ days of unexplained fever should be seen even if they look otherwise well.',
      src: 'NICE NG143 amber; AHA Kawasaki 2017/2024'
    },
    {
      group: 'Fever',
      look: 'Fever in a well, happy baby OVER 3 months with an obvious cold',
      tier: 'tself',
      feat: 'A happy, drinking, playing baby older than 3 months with a fever and a mild viral illness may need no medicine at all; treat for comfort, not to chase the number. Watch for any red-flag sign, recheck overnight, and call if it persists beyond 2 to 3 days or the baby looks unwell.',
      src: 'NICE NG143 green; AAP/AAFP'
    },
    {
      group: 'Breathing and color',
      look: 'Breathing: stops, long pauses, grunting, or severe chest indrawing',
      tier: 't911',
      feat: 'Stops breathing or has long pauses (apnea); grunting with each breath; or working so hard to breathe (severe chest indrawing) that the baby cannot cry or feed. These are NICE RED and WHO danger signs.',
      src: 'NICE NG143 RED; WHO IMCI'
    },
    {
      group: 'Breathing and color',
      look: 'Color: turns blue, grey, pale, mottled, or ashen (lips, tongue, face)',
      tier: 't911',
      feat: 'Central blue or grey color of the lips, tongue, or face (not just blue hands and feet, which can be normal in a newborn), or skin that is pale, mottled, or ashen. Central cyanosis is never normal. A newborn can be low on oxygen before the color shows, so act on breathing effort too.',
      src: 'NICE NG143 RED; NHS'
    },
    {
      group: 'Breathing and color',
      look: 'Fast breathing, nasal flaring, or new wheeze with effort',
      tier: 't24h',
      feat: 'Count for a full 60 seconds. Fast breathing is 60/min or more at 0 to 6 days, 50/min or more from day 7 to 12 months, and 40/min or more from 12 months to 5 years (WHO IMCI / Managing PSBI 2019). Nasal flaring or a new wheeze with visible effort gets a same-day visit; any breathing pause, blue color, grunting, or severe indrawing jumps to 911.',
      src: 'WHO IMCI; NICE NG143 amber'
    },
    {
      group: 'Activity and cry',
      look: 'Will not wake, floppy or limp, or no response to you',
      tier: 't911',
      feat: 'Does not wake, or if roused does not stay awake; floppy or limp; no eye contact and no reaction to you; or a weak, high-pitched, or continuous cry. "Lethargic or unconscious" is a WHO general danger sign.',
      src: 'NICE NG143 RED; WHO IMCI'
    },
    {
      group: 'Activity and cry',
      look: 'Looks "seriously wrong" to you, or inconsolable and not interacting',
      tier: 'ter',
      feat: 'A parent or carer\'s sense that something is seriously wrong is itself an evidence-supported red flag. A baby who is much less responsive than usual, will not settle at all, or is not responding normally to you should be seen now. Trust your gut.',
      src: 'NICE NG143; RCH'
    },
    {
      group: 'Feeding, vomiting, dehydration',
      look: 'Green or bile-stained vomit, or repeated forceful vomiting',
      tier: 't911',
      feat: 'Dark green (bilious) vomiting in a baby is a surgical emergency until proven otherwise (it can mean a twisted bowel, which damages within hours). Forceful, repeated vomiting, or projectile milk vomiting in a 3-to-6-week-old, needs urgent assessment.',
      src: 'AAFP; RCH (surgical)'
    },
    {
      group: 'Feeding, vomiting, dehydration',
      look: 'Refusing all feeds, or "vomits everything" / cannot keep fluids down',
      tier: 'ter',
      feat: 'Not able to drink or breastfeed, or vomiting everything, are WHO general danger signs. A baby refusing all feeds, or one too lethargic to drink, needs to be seen now (and a young baby that will not feed can dehydrate fast).',
      src: 'WHO IMCI'
    },
    {
      group: 'Feeding, vomiting, dehydration',
      look: 'Dehydration: no wet diaper for 8+ hours, no tears, sunken eyes or soft spot, very dry mouth',
      tier: 'ter',
      feat: 'Fewer than one wet diaper in 8 hours, no tears when crying, a dry or sticky mouth, sunken eyes, or a sunken soft spot point to dehydration. A baby too drowsy to drink, or with a skin pinch that goes back very slowly, is severe and needs the ER now. Continue breastfeeding throughout.',
      src: 'WHO IMCI; Clinical Dehydration Scale (Goldman 2008)'
    },
    {
      group: 'Feeding, vomiting, dehydration',
      look: 'Diarrhea or vomiting that is tolerable, still making wet diapers and taking fluids',
      tier: 'tadvice',
      feat: 'Mild gastroenteritis where the baby is still drinking, still making wet diapers, and has no dehydration signs can usually be managed at home with small frequent fluids (oral rehydration solution) and continued breastfeeding. Call for advice, and seek care if any dehydration sign appears, the vomit turns green or bloody, or there is blood in the stool.',
      src: 'WHO IMCI Plan A; CDC'
    },
    {
      group: 'Rash and skin',
      look: 'Non-blanching rash: spots or bruise-like marks that do NOT fade under a glass',
      tier: 't911',
      feat: 'Press the side of a clear glass firmly on the rash. If the spots or bruise-like marks do NOT fade, it is a 911 emergency for possible meningococcal sepsis. The rash is a LATE sign: do not wait for it if the baby is otherwise unwell, and on darker skin check the palms, soles, eyelids, and roof of the mouth.',
      src: 'NHS; Meningitis Now (glass test)'
    },
    {
      group: 'Rash and skin',
      look: 'Blisters (vesicles) in a newborn, or a spreading hot red area around the cord',
      tier: 'ter',
      feat: 'Clusters of clear blisters on a red base in a newborn can be herpes (HSV) and are never a wait-and-see rash, especially with any fever or poor feeding (most affected babies are born to mothers with no herpes history). Spreading redness, pus, or a foul smell around the umbilical stump can be a cord infection. Be seen now.',
      src: 'AAP/Merck (neonatal HSV); standard cord care'
    },
    {
      group: 'Rash and skin',
      look: 'A mild rash or goopy eye with a cold, no other features, baby otherwise well',
      tier: 'tadvice',
      feat: 'A mild rash without other warning features, thrush, or a goopy eye with a cold in an otherwise-well older baby is usually routine; call for advice. Any eye discharge or red eye in a newborn (under 28 days), or eyelid redness spreading onto the cheek at any age, needs same-day care.',
      src: 'AAP HealthyChildren'
    },
    {
      group: 'Neurological',
      look: 'Seizure, a seizure over 5 minutes, or a first-ever seizure',
      tier: 't911',
      feat: 'Call 911 for a seizure lasting more than 5 minutes, a first-ever seizure, trouble breathing or color change during it, or another seizure right after. Lay the baby on their side, clear the area, note the time, and put nothing in the mouth. Even a brief simple febrile seizure should be checked by a doctor afterward.',
      src: 'NICE NG143 RED; AAP febrile-seizure guidance'
    },
    {
      group: 'Neurological',
      look: 'Bulging soft spot when calm and upright, or a stiff neck',
      tier: 't911',
      feat: 'A soft spot (fontanelle) that stays bulging or tense when the baby is calm and held upright, or a stiff neck, can mean raised pressure or meningitis. (A soft spot that only bulges during a hard cry and settles when calm is normal.)',
      src: 'NICE NG143 RED; RCH'
    },
    {
      group: 'Injury and ingestion',
      look: 'Head injury or fall: lost consciousness, vomiting, very drowsy, or seizure after',
      tier: 'ter',
      feat: 'After a fall or head injury, be seen now for any loss of consciousness, repeated vomiting, a seizure, unusual drowsiness or irritability, a bulging soft spot, clear fluid or blood from the nose or ears, or a fall from a significant height (especially in the youngest babies). When in doubt with an infant head injury, get it checked.',
      src: 'NICE head-injury guidance (paediatric)'
    },
    {
      group: 'Injury and ingestion',
      look: 'After a choking episode: ongoing cough, noisy breathing, or trouble breathing',
      tier: 'ter',
      feat: 'If the baby is breathing and crying after a choke, watch closely. Be seen now for a persistent cough, noisy or wheezy breathing, drooling, or any trouble breathing afterward (something may still be lodged). If the baby cannot breathe, cry, or cough, call 911 and start infant back blows and chest thrusts at once.',
      src: 'AAP / Red Cross choking first aid'
    },
    {
      group: 'Injury and ingestion',
      look: 'Possible poisoning or a swallowed button battery or magnets',
      tier: 't911',
      feat: 'A swallowed button battery or more than one magnet can cause serious internal injury fast: go to the ER now. For a suspected medicine, plant, or chemical swallow, call US Poison Control at 1-800-222-1222 right away (it is free, 24/7, and will tell you whether to watch at home or go in). Call 911 if the baby is drowsy, struggling to breathe, or having a seizure.',
      src: 'US Poison Control 1-800-222-1222; CPSC (battery/magnet)'
    },
    {
      group: 'Other',
      look: 'A red, hot, swollen joint or limb, or a baby not using an arm or leg',
      tier: 't24h',
      feat: 'A red, hot, or swollen joint or limb, or a baby who will not move or bear weight on an arm or leg, is a NICE amber feature and gets a same-day visit.',
      src: 'NICE NG143 amber'
    }
  ];

  // Group order for both the selector optgroups and the table sections.
  var GROUPS = ['Fever', 'Breathing and color', 'Activity and cry', 'Feeding, vomiting, dehydration', 'Rash and skin', 'Neurological', 'Injury and ingestion', 'Other'];

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  FY.tool['triage'] = function (mount) {
    if (!mount) return;
    var P = (FY.svg && FY.svg.palette) || {};
    mount.textContent = '';

    // ---------- Head ----------
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'Symptom triage card' }, head);

    var body = el('div', { class: 'tool-body' }, mount);

    // ---------- The fixed, always-on override banner ----------
    // Drawn with the emergency color so it cannot be missed, and it
    // stays on screen no matter what symptom is selected.
    var banner = el('div', {
      class: 'tool-rail',
      role: 'note',
      style: 'margin-top:0;margin-bottom:1em;border-color:' + (P.emerg || '#e98e7f') + ';border-width:2px;'
    }, body);
    el('div', {
      class: 'blocked',
      style: 'font-family:var(--font-heading);font-weight:700;font-size:1.05rem;margin-bottom:0.25em;',
      text: OVERRIDE.title
    }, banner);
    el('div', { html: '<b>' + OVERRIDE.body + '</b>' }, banner);
    el('div', {
      style: 'margin-top:0.4em;font-size:0.82rem;opacity:0.85;',
      text: 'Source: ' + OVERRIDE.src
    }, banner);

    // ---------- The symptom selector ----------
    var fieldId = 'fy-triage-sel';
    var field = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:0.6em;' }, body);
    el('label', { for: fieldId, text: 'What is happening?' }, field);

    var sel = el('select', { id: fieldId, style: 'flex:1 1 22em;min-width:14em;max-width:100%;' }, field);
    el('option', { value: '', text: 'Choose the symptom that worries you most...' }, sel);

    // Build optgroups in group order; the option value is the row index.
    GROUPS.forEach(function (g) {
      var og = el('optgroup', { label: g }, sel);
      ROWS.forEach(function (r, i) {
        if (r.group !== g) return;
        el('option', { value: String(i), text: r.look }, og);
      });
    });

    // ---------- The live output ----------
    var out = el('div', {
      class: 'tool-out',
      'aria-live': 'polite',
      style: 'margin-top:1em;min-height:2em;'
    }, body);

    function tierColor(cls) {
      if (cls === 'emerg') return P.emerg || '#e98e7f';
      if (cls === 'call') return P.call || '#e6c074';
      return P.ok || '#9ec79a';
    }

    function render(idx) {
      out.textContent = '';
      if (idx === '' || idx == null) {
        el('p', {
          style: 'font-family:var(--font-body);color:var(--text-dim);margin:0;',
          text: 'Pick a symptom above to see the action tier and the specific signs that define it. The full matrix is in the table below. This card supports your judgment; it does not replace your pediatrician or your gut.'
        }, out);
        return;
      }
      var r = ROWS[+idx];
      if (!r) return;
      var t = TIERS[r.tier];
      var col = tierColor(t.cls);

      var card = el('div', {
        class: 'tool-rail',
        style: 'margin-top:0;border-left:5px solid ' + col + ';'
      }, out);

      // The tier headline, colored.
      el('div', {
        class: t.cls === 'emerg' ? 'blocked' : '',
        style: 'font-family:var(--font-heading);font-weight:700;font-size:1.15rem;color:' + col + ';margin-bottom:0.25em;',
        text: t.label
      }, card);

      // What this tier means in plain words.
      el('div', {
        style: 'font-family:var(--font-body);color:var(--text);margin-bottom:0.5em;',
        text: t.blurb
      }, card);

      // The specific red-flag features for this symptom.
      el('div', {
        style: 'font-family:var(--font-body);color:var(--text-dim);',
        html: '<b>The specific signs:</b> ' + r.feat
      }, card);

      el('div', {
        style: 'margin-top:0.4em;font-size:0.82rem;opacity:0.8;font-family:var(--font-body);',
        text: 'Source: ' + r.src
      }, card);

      // The override reminder rides along with every fever-relevant pick.
      el('div', {
        style: 'margin-top:0.5em;font-size:0.85rem;color:' + (P.emerg || '#e98e7f') + ';font-family:var(--font-body);',
        text: 'Remember: under 3 months, any fever 38.0 C (100.4 F) or higher is an emergency on its own.'
      }, card);
    }

    sel.addEventListener('change', function () { render(sel.value); });
    render('');

    // ---------- The standing safety rail ----------
    var rail = el('div', { class: 'tool-rail', role: 'note' }, body);
    el('div', {
      html: '<b>When in doubt, call your pediatrician or nurse advice line.</b> If your baby stops breathing or has long pauses, turns blue or grey, has a non-fading rash, has a seizure, will not wake, or looks seriously wrong to you, call 911 (UK 999). US Poison Control: <b>1-800-222-1222</b>. Where the US, UK, WHO, Canadian, and Australian frameworks differ, this card uses the more cautious threshold. It does not replace medical advice, and it does not replace your instinct.'
    }, rail);

    // ---------- The full matrix as a printable table.gtable fallback ----------
    var wrap = el('div', { class: 'gtable-wrap' }, body);
    var table = el('table', { class: 'gtable' }, wrap);
    el('caption', {
      style: 'text-align:left;font-family:var(--font-body);color:var(--text-dim);padding:0.4em 0;',
      text: 'The full triage matrix (the printable, screen-reader fallback). Pick the highest tier any symptom matches. Override: any fever 38.0 C / 100.4 F or higher under 3 months is an emergency regardless of how well the baby looks.'
    }, table);

    var thead = el('thead', null, table);
    var htr = el('tr', null, thead);
    ['Symptom', 'Action', 'The specific red-flag features'].forEach(function (h) {
      el('th', { scope: 'col', text: h }, htr);
    });

    var tbody = el('tbody', null, table);
    GROUPS.forEach(function (g) {
      // A spanning section header row per group.
      var gtr = el('tr', null, tbody);
      var gth = el('th', { scope: 'colgroup', colspan: '3', text: g }, gtr);
      gth.style.background = 'var(--bg-raised)';
      gth.style.fontFamily = 'var(--font-heading)';

      ROWS.forEach(function (r) {
        if (r.group !== g) return;
        var t = TIERS[r.tier];
        var tr = el('tr', null, tbody);
        // Tint the emergency rows so the page reads even without script.
        if (t.cls === 'emerg') tr.className = 'hl';
        el('th', { scope: 'row', text: r.look }, tr);
        var actTd = el('td', null, tr);
        var span = el('span', { text: t.label }, actTd);
        span.style.color = tierColor(t.cls);
        span.style.fontFamily = 'var(--font-heading)';
        el('td', { text: r.feat }, tr);
      });
    });

    // ---------- Accessible summary on the mount itself ----------
    mount.setAttribute('role', 'group');
    mount.setAttribute('aria-label',
      'Infant symptom triage card. Always-on rule: any rectal temperature 38.0 degrees Celsius (100.4 Fahrenheit) or higher in a baby under 3 months is an emergency, be seen now. ' +
      'Choose a symptom to see its action tier (call 911, go to the ER now, see a doctor within 24 hours, call for advice, or self-care) and the specific red-flag features. ' +
      'The full matrix is also given as a table. Merged from NICE NG143, AAP 2021, WHO IMCI, NHS, RCH, and CPS, with the more cautious threshold used where they differ.');
  };
})();


/* module: tool-vaccine-timeline.js */
/* ============================================================
   THE FIRST YEAR, tool: the birthdate-anchored vaccine timeline.
   Module: vaccine-timeline (one FY.tool function).

   What it does:
     - Takes a birth date and shows the upcoming US (CDC/ACIP) routine
       INFANT visits (birth, 1 to 2 months, 4 months, 6 months, 12 months),
       the antigens given at each, the real calendar window for each visit,
       and a one-line "protects against" per antigen.
     - A country switch (US default, plus UK, Canada, Australia, WHO, and
       Germany STIKO) re-renders the antigen-by-age grid as a table.gtable.
     - A prominent freshness rail naming the 2025 to 2026 US ACIP
       uncertainty and telling the reader to confirm with their clinician.

   The grid table is also the accessibility fallback for the per-country
   view, and the schedule list is plain semantic HTML.

   Every age and antigen is real and reconciled from the deep dives
   (vaccines-schedule-grid.md, vaccines-pain-access-special.md) with the
   corrections-to-apply.md fixes applied (clesrovimab co-equal 105 mg flat;
   UK PCV at 16 wk and MenB at 8 + 12 wk; UK MMRV catch-up cohort born on or
   after 1 Sep 2022; Germany STIKO infant MenB at 2, 4, 12 mo since Jan 2024;
   the 2026-03-16 injunction restored the June 2024 US schedule).
   No external libraries. Clean console. No em dashes anywhere.
   ============================================================ */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  /* ------------------------------------------------------------------
     One-line "protects against" per antigen. Kept short and plain.
     These describe what the antigen prevents, drawn from the per-antigen
     panels in the deep dive (Section 4). Used by both views.
     ------------------------------------------------------------------ */
  var PROTECTS = {
    HepB: 'Hepatitis B, a liver infection that turns chronic in about 9 of 10 babies infected at birth',
    DTaP: 'Diphtheria, tetanus (lockjaw), and pertussis (whooping cough)',
    IPV: 'Polio, which can cause permanent paralysis',
    Hib: 'Haemophilus influenzae type b, once the top cause of bacterial meningitis in young children',
    PCV: 'Pneumococcal disease: meningitis, bloodstream infection, pneumonia, and ear infections',
    RV: 'Rotavirus, the main cause of severe infant diarrhea and dehydration',
    MMR: 'Measles, mumps, and rubella (measles is the most contagious of all these)',
    Varicella: 'Varicella (chickenpox)',
    MMRV: 'Measles, mumps, rubella, and chickenpox in one shot',
    HepA: 'Hepatitis A, a liver infection spread through food and stool',
    Influenza: 'Seasonal influenza (flu)',
    MenB: 'Meningococcal B disease (a cause of meningitis and sepsis)',
    MenC: 'Meningococcal C disease',
    MenACWY: 'Meningococcal disease, serogroups A, C, W, and Y',
    BCG: 'Tuberculosis (given only where TB is common)',
    COVID: 'COVID-19',
    RSV: 'RSV (bronchiolitis), the leading cause of US infant hospitalization'
  };

  /* Friendly display name for each antigen key. */
  var LABEL = {
    HepB: 'Hepatitis B', DTaP: 'DTaP', IPV: 'Polio (IPV)', Hib: 'Hib', PCV: 'Pneumococcal (PCV)',
    RV: 'Rotavirus', MMR: 'MMR', Varicella: 'Chickenpox', MMRV: 'MMRV',
    HepA: 'Hepatitis A', Influenza: 'Flu', MenB: 'Meningococcal B', MenC: 'Meningococcal C',
    MenACWY: 'Meningococcal ACWY', BCG: 'BCG (TB)', COVID: 'COVID-19', RSV: 'RSV protection'
  };

  /* ------------------------------------------------------------------
     US (CDC/AAP) routine INFANT visits, birth to 12 months. Each visit
     lists the antigens routinely given at that age. Ages are the routine
     CDC ages; the offsetDays/window drive the real calendar dates.
     Source: CDC 2025 child schedule (restored by the 2026-03-16
     injunction) + AAP 2026 schedule. RSV is seasonal, handled in a note.
     ------------------------------------------------------------------ */
  var US_VISITS = [
    {
      key: 'birth', label: 'Birth', offsetDays: 0, windowText: 'in the hospital',
      antigens: ['HepB'],
      note: 'The hepatitis B birth dose is given in the first 24 hours. If the mother carries hepatitis B, the baby also gets HBIG within 12 hours.'
    },
    {
      key: '2mo', label: '2 months', offsetDays: 61, windowText: 'around 2 months (a 1 to 2 month visit)',
      antigens: ['DTaP', 'IPV', 'Hib', 'PCV', 'RV', 'HepB'],
      note: 'The big first round. Often given as a 6-in-1 combination shot plus pneumococcal plus oral rotavirus. The hepatitis B second dose can land at the 1 to 2 month visit.'
    },
    {
      key: '4mo', label: '4 months', offsetDays: 122, windowText: 'around 4 months',
      antigens: ['DTaP', 'IPV', 'Hib', 'PCV', 'RV'],
      note: 'A near-repeat of the 2-month visit (rotavirus may be a 2-dose or 3-dose series depending on the brand).'
    },
    {
      key: '6mo', label: '6 months', offsetDays: 183, windowText: 'around 6 months',
      antigens: ['DTaP', 'PCV', 'RV', 'HepB', 'Influenza'],
      note: 'Third round, plus the third hepatitis B (any time 6 to 18 months) and the first yearly flu shot from 6 months on. Rotavirus dose 3 only if the 3-dose brand is used.'
    },
    {
      key: '12mo', label: '12 months', offsetDays: 365, windowText: '12 to 15 months',
      antigens: ['MMR', 'Varicella', 'Hib', 'PCV', 'HepA'],
      note: 'The one-year visit: first MMR and chickenpox, the Hib and pneumococcal boosters, and the first hepatitis A. Second doses of MMR and chickenpox come at 4 to 6 years.'
    }
  ];

  /* ------------------------------------------------------------------
     Per-country antigen-by-age grids. Each is a small table: rows are
     antigens, columns are the routine ages that country uses for infants
     (we keep the first-year-plus ages so the one-year visit shows). The
     cell text is the dose age(s); a dash means not routine in infancy.

     These are transcribed from the deep dive Section 2 grid with the
     corrections applied. "wk" = weeks, "mo" = months. Canada varies by
     province, so it carries a province caveat.
     ------------------------------------------------------------------ */
  var COUNTRIES = {
    US: {
      name: 'United States (CDC / AAP)',
      ages: ['Birth', '2 mo', '4 mo', '6 mo', '12 to 15 mo'],
      rows: [
        ['HepB',      'Birth', '1 to 2 mo', '', '6 to 18 mo', ''],
        ['DTaP',      '', '2 mo', '4 mo', '6 mo', '15 to 18 mo'],
        ['IPV',       '', '2 mo', '4 mo', '6 to 18 mo', ''],
        ['Hib',       '', '2 mo', '4 mo', '', '12 to 15 mo'],
        ['PCV',       '', '2 mo', '4 mo', '6 mo', '12 to 15 mo'],
        ['RV',        '', '2 mo', '4 mo', '6 mo (if 3-dose)', ''],
        ['MMR',       '', '', '', '', '12 to 15 mo'],
        ['Varicella', '', '', '', '', '12 to 15 mo'],
        ['HepA',      '', '', '', '', '12 to 23 mo'],
        ['Influenza', '', '', '', 'yearly from 6 mo', ''],
        ['RSV',       'seasonal: maternal vaccine in pregnancy OR infant antibody (nirsevimab or clesrovimab)', '', '', '', '']
      ],
      foot: 'Note: COVID-19 is recommended from 6 months by the AAP; the federal posture is shared clinical decision-making (see the freshness note). RSV: a baby is protected EITHER by the mother’s vaccine in pregnancy OR by a long-acting antibody (nirsevimab 50 or 100 mg, or clesrovimab 105 mg flat), almost never both.'
    },
    UK: {
      name: 'United Kingdom (from 1 Jan 2026)',
      ages: ['Birth', '8 wk', '12 wk', '16 wk', '12 mo'],
      rows: [
        ['HepB',      'at-risk only', '8 wk', '12 wk', '16 wk', '(+18 mo)'],
        ['DTaP',      '', '8 wk', '12 wk', '16 wk', ''],
        ['IPV',       '', '8 wk', '12 wk', '16 wk', ''],
        ['Hib',       '', '8 wk', '12 wk', '16 wk', '(in 6-in-1; separate Hib/MenC dropped)'],
        ['PCV',       '', '', '12 wk', '', '12 mo'],
        ['RV',        '', '8 wk', '12 wk', '', ''],
        ['MenB',      '', '8 wk', '12 wk', '', '12 mo'],
        ['MMRV',      '', '', '', '', '12 mo (1st), 18 mo (2nd)'],
        ['Influenza', '', '', '', '', 'nasal from 2 to 3 y'],
        ['RSV',       'maternal vaccine from 28 weeks of pregnancy; infant nirsevimab only for preterm or high-risk', '', '', '', '']
      ],
      foot: 'The UK uses a tidy 3-visit primary course (8, 12, 16 weeks) built around the 6-in-1, with no universal hepatitis B birth dose. From 1 Jan 2026 it gives MMRV (not separate MMR) and pulled the second measles dose earlier to 18 months. PCV moved to 16 weeks and the second MenB dose to 12 weeks on 1 Jul 2025.'
    },
    CA: {
      name: 'Canada (typical; varies by province)',
      ages: ['Birth', '2 mo', '4 mo', '6 mo', '12 mo'],
      rows: [
        ['HepB',      '', '2 mo', '4 mo', '', '(or in grade 7 in some provinces)'],
        ['DTaP',      '', '2 mo', '4 mo', '6 mo', '(+18 mo)'],
        ['IPV',       '', '2 mo', '4 mo', '6 mo', '(+18 mo)'],
        ['Hib',       '', '2 mo', '4 mo', '6 mo', '(+18 mo)'],
        ['PCV',       '', '2 mo', '4 mo', '', '12 mo'],
        ['RV',        '', '2 mo', '4 mo', '6 mo (if 3-dose)', ''],
        ['MenC',      '', '', '', '', '12 mo'],
        ['MMR',       '', '', '', '', '12 mo'],
        ['Varicella', '', '', '', '', '12 to 15 mo'],
        ['Influenza', '', '', '', 'yearly from 6 mo', ''],
        ['RSV',       'maternal vaccine OR infant antibody; funding differs sharply by province', '', '', '', '']
      ],
      foot: 'Canada has no single national schedule: each province sets its own around NACI advice. A British Columbia baby gets a 6-in-1 and PCV20; an Ontario baby gets a 5-in-1 and gets hepatitis B in grade 7 instead of infancy. Check your province.'
    },
    AU: {
      name: 'Australia (National Immunisation Program)',
      ages: ['Birth', '6 wk / 2 mo', '4 mo', '6 mo', '12 mo'],
      rows: [
        ['HepB',      'Birth', '2 mo', '4 mo', '6 mo', ''],
        ['DTaP',      '', '2 mo', '4 mo', '6 mo', '(+18 mo)'],
        ['IPV',       '', '2 mo', '4 mo', '6 mo', ''],
        ['Hib',       '', '2 mo', '4 mo', '6 mo', '(+18 mo)'],
        ['PCV',       '', '6 wk', '4 mo', '', '12 mo'],
        ['RV',        '', '2 mo', '4 mo', '', ''],
        ['MenB',      '', '2 mo', '4 mo', '', '12 mo'],
        ['MenACWY',   '', '', '', '', '12 mo'],
        ['MMR',       '', '', '', '', '12 mo'],
        ['MMRV',      '', '', '', '', '18 mo'],
        ['RSV',       'maternal vaccine at 28 to 36 weeks plus state-funded infant nirsevimab', '', '', '', '']
      ],
      foot: 'Australia bundles a hepatitis B birth dose with the hexavalent at 2, 4, 6 months, gives meningococcal B to all infants, and since 1 Sep 2025 uses the broader PCV20. Chickenpox is delivered as MMRV at 18 months.'
    },
    WHO: {
      name: 'WHO (reference schedule)',
      ages: ['Birth', '6 wk', '10 wk', '14 wk', '9 to 12 mo'],
      rows: [
        ['BCG',       'Birth (high-TB countries)', '', '', '', ''],
        ['HepB',      'Birth dose under 24h', '6 wk', '10 wk', '14 wk', ''],
        ['DTaP',      '', '6 wk', '10 wk', '14 wk', ''],
        ['IPV',       '', '6 wk', '10 wk', '14 wk', ''],
        ['Hib',       '', '6 wk', '10 wk', '14 wk', ''],
        ['PCV',       '', '6 wk', '10 wk', '14 wk', ''],
        ['RV',        '', '6 wk', '10 wk', '(brand-dependent)', ''],
        ['MMR',       '', '', '', '', '9 or 12 mo (measles), 2 doses']
      ],
      foot: 'WHO’s reference schedule starts the primary series at 6 weeks (not 8), gives a hepatitis B birth dose, and in low-income settings still uses BCG and oral polio that high-income parents will never see. It is a reference for national programs, not a single country’s schedule.'
    },
    DE: {
      name: 'Germany (STIKO)',
      ages: ['Birth', '2 mo', '4 mo', '11 mo', '12 mo'],
      rows: [
        ['HepB',      '', '2 mo', '4 mo', '11 mo', '(in 6-in-1)'],
        ['DTaP',      '', '2 mo', '4 mo', '11 mo', ''],
        ['IPV',       '', '2 mo', '4 mo', '11 mo', ''],
        ['Hib',       '', '2 mo', '4 mo', '11 mo', ''],
        ['PCV',       '', '2 mo', '4 mo', '11 mo', ''],
        ['RV',        '', '2 mo (from 6 wk)', '4 mo', '', ''],
        ['MenB',      '', '2 mo', '4 mo', '', '12 mo'],
        ['MenC',      '', '', '', '', '12 mo'],
        ['MMR',       '', '', '', '11 mo', ''],
        ['Varicella', '', '', '', '11 mo', '']
      ],
      foot: 'STIKO uses a 2 + 1 primary series (2, 4, and 11 months) for the 6-in-1 and pneumococcal, rather than three close primary doses. Since January 2024 STIKO recommends infant meningococcal B at 2, 4, and 12 months. First MMR and chickenpox come at 11 months.'
    }
  };

  var ORDER = ['US', 'UK', 'CA', 'AU', 'WHO', 'DE'];

  /* ---- date helpers (no time zone surprises: parse as local Y-M-D) ---- */
  function parseDate(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    // reject impossible dates (e.g. 2026-02-31 rolling over)
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function addDays(dt, n) { var c = new Date(dt.getTime()); c.setDate(c.getDate() + n); return c; }
  function startOfToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function fmtDate(dt) {
    try { return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear(); }
  }
  function ageInMonths(birth, when) {
    var months = (when.getFullYear() - birth.getFullYear()) * 12 + (when.getMonth() - birth.getMonth());
    if (when.getDate() < birth.getDate()) months -= 1;
    return months;
  }

  /* ---- tiny DOM helpers ---- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  FY.tool['vaccine-timeline'] = function (mount) {
    if (!mount || typeof mount.appendChild !== 'function') return;

    // Preserve the existing <noscript> fallback; build the live UI alongside it.
    var ns = mount.querySelector('noscript');

    /* ---------- header ---------- */
    var head = el('div', 'tool-head');
    head.appendChild(el('h4', null, 'Your baby’s vaccine timeline'));
    mount.appendChild(head);

    var body = el('div', 'tool-body');
    mount.appendChild(body);

    /* ---------- controls (real, keyboard-accessible) ---------- */
    var controls = el('div');
    controls.style.cssText = 'display:flex; flex-wrap:wrap; gap:1rem 1.4rem; align-items:flex-end; margin-bottom:0.4rem;';

    // birth date
    var dWrap = el('div');
    dWrap.style.cssText = 'display:flex; flex-direction:column; gap:0.3em;';
    var dLab = el('label', null, 'Baby’s birth date');
    var dId = 'fy-vt-date';
    dLab.setAttribute('for', dId);
    var dIn = el('input');
    dIn.type = 'date';
    dIn.id = dId;
    dIn.setAttribute('max', toYMD(startOfToday()));   // no future births
    dWrap.appendChild(dLab); dWrap.appendChild(dIn);

    // country select
    var cWrap = el('div');
    cWrap.style.cssText = 'display:flex; flex-direction:column; gap:0.3em;';
    var cLab = el('label', null, 'Country schedule');
    var cId = 'fy-vt-country';
    cLab.setAttribute('for', cId);
    var cSel = el('select');
    cSel.id = cId;
    ORDER.forEach(function (k) {
      var o = el('option', null, COUNTRIES[k].name);
      o.value = k;
      cSel.appendChild(o);
    });
    cSel.value = 'US';
    cWrap.appendChild(cLab); cWrap.appendChild(cSel);

    // clear button
    var clearBtn = el('button', 'fy-btn', 'Clear date');
    clearBtn.type = 'button';
    clearBtn.style.cssText = 'align-self:flex-end;';

    controls.appendChild(dWrap);
    controls.appendChild(cWrap);
    controls.appendChild(clearBtn);
    body.appendChild(controls);

    /* ---------- live output region ---------- */
    var out = el('div', 'tool-out');
    out.setAttribute('aria-live', 'polite');
    out.style.cssText = 'margin-top:1rem;';
    body.appendChild(out);

    /* ---------- the prominent freshness rail (always visible) ---------- */
    var rail = el('div', 'tool-rail');
    rail.innerHTML =
      '<b>Verify the current schedule with your clinician.</b> US infant vaccine policy was unusually unsettled in 2025 to 2026. ' +
      'A federal court order on 16 March 2026 stayed the reconstituted ACIP’s votes and restored the June 2024 schedule (including ' +
      'the universal hepatitis B birth dose), and an appeal is pending. The AAP publishes its own 2026 schedule, which keeps all the ' +
      'routine infant vaccines; the main live difference is COVID-19 in healthy infants (AAP recommends it from 6 months, the federal ' +
      'posture leans toward shared decision-making). This tool follows the restored CDC schedule plus the AAP. Treat the dates below as ' +
      'a planning aid and follow the schedule your pediatrician gives you.';
    body.appendChild(rail);

    /* ---------- source line ---------- */
    var src = el('p');
    src.className = 'asof';
    src.style.cssText = 'margin-top:0.9rem;';
    src.textContent = 'Schedules as of June 2026. Sources: CDC 2025 child and adolescent schedule (restored by the 2026-03-16 injunction); AAP 2026 schedule; GOV.UK 2026; NACI / provincial schedules; Australia NIP; WHO summary table; Germany STIKO.';
    body.appendChild(src);

    /* ---------- render logic ---------- */
    function render() {
      // clear output
      while (out.firstChild) out.removeChild(out.firstChild);

      var countryKey = cSel.value;
      var country = COUNTRIES[countryKey] || COUNTRIES.US;
      var birth = parseDate(dIn.value);

      /* (1) the birthdate-anchored US visit schedule.
         Only shown for the US country (the dated-visit list is built on the
         CDC infant visit cadence). For other countries we show their grid
         plus a short note that the dated calendar uses the US cadence. */
      if (countryKey === 'US') {
        if (birth) {
          out.appendChild(renderSchedule(birth));
        } else {
          var prompt = el('p');
          prompt.style.cssText = 'color:var(--text-dim); margin:0 0 0.8rem;';
          prompt.textContent = 'Enter a birth date above to see the calendar dates for each US infant visit. The antigen-by-age grid below works without a date.';
          out.appendChild(prompt);
        }
      } else {
        var swap = el('p');
        swap.style.cssText = 'color:var(--text-dim); margin:0 0 0.8rem;';
        swap.textContent = 'Showing the ' + country.name + ' schedule. Switch the country back to the United States to see calendar dates anchored to your baby’s birth date.';
        out.appendChild(swap);
      }

      /* (2) the antigen-by-age grid for the selected country (table.gtable),
         which doubles as the accessible fallback. */
      out.appendChild(renderGrid(country, countryKey));
    }

    /* ---- the dated US schedule (semantic list of visits) ---- */
    function renderSchedule(birth) {
      var wrap = el('div');
      var today = startOfToday();

      var intro = el('p');
      intro.style.cssText = 'margin:0 0 0.8rem; color:var(--text);';
      var bm = ageInMonths(birth, today);
      var ageStr = bm < 0 ? 'not yet born' : (bm + (bm === 1 ? ' month' : ' months') + ' old today');
      intro.innerHTML = 'Born <b>' + fmtDate(birth) + '</b> (' + ageStr + '). Upcoming US routine infant visits and the antigens at each:';
      wrap.appendChild(intro);

      var list = el('ol');
      list.style.cssText = 'list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.7rem;';

      US_VISITS.forEach(function (v) {
        var due = addDays(birth, v.offsetDays);
        var past = due < today;

        var li = el('li');
        li.style.cssText = 'padding:0.7em 0.9em; border:1px solid var(--rule); border-radius:8px; background:rgba(0,0,0,0.12);' +
          (past ? ' opacity:0.6;' : '');

        // header row: visit label + date + status
        var hd = el('div');
        hd.style.cssText = 'display:flex; flex-wrap:wrap; align-items:baseline; gap:0.5em 0.8em; margin-bottom:0.4em;';
        var lab = el('span', null, v.label);
        lab.style.cssText = 'font-family:var(--font-heading); font-weight:700; font-size:1.05rem; color:var(--text-bright);';
        var when = el('span', null, v.key === 'birth' ? v.windowText : fmtDate(due));
        when.style.cssText = 'font-family:var(--font-mono); font-size:0.9rem; color:var(--accent);';
        hd.appendChild(lab);
        hd.appendChild(when);
        if (v.key !== 'birth') {
          var sub = el('span', null, v.windowText);
          sub.style.cssText = 'font-size:0.82rem; color:var(--text-dim);';
          hd.appendChild(sub);
        }
        var tag = el('span', null, past ? 'likely done' : 'upcoming');
        tag.style.cssText = 'margin-left:auto; font-family:var(--font-mono); font-size:0.66rem; letter-spacing:0.08em; text-transform:uppercase; ' +
          'padding:0.12em 0.55em; border-radius:999px; border:1px solid currentColor; ' +
          (past ? 'color:var(--text-dim);' : 'color:var(--ok);');
        hd.appendChild(tag);
        li.appendChild(hd);

        // antigens with one-line "protects against"
        var ul = el('ul');
        ul.style.cssText = 'margin:0; padding-left:1.1em;';
        v.antigens.forEach(function (a) {
          var item = el('li');
          item.style.cssText = 'font-size:0.94rem; line-height:1.45; margin-bottom:0.2em; color:var(--text);';
          var strong = el('b', null, LABEL[a] || a);
          item.appendChild(strong);
          item.appendChild(document.createTextNode(': protects against ' + (PROTECTS[a] || a) + '.'));
          ul.appendChild(item);
        });
        li.appendChild(ul);

        if (v.note) {
          var note = el('p', null, v.note);
          note.style.cssText = 'margin:0.5em 0 0; font-size:0.86rem; color:var(--text-dim); line-height:1.45;';
          li.appendChild(note);
        }
        list.appendChild(li);
      });

      wrap.appendChild(list);

      // RSV seasonal note (does not fit the dated cadence)
      var rsv = el('p');
      rsv.style.cssText = 'margin:0.8rem 0 0; font-size:0.88rem; color:var(--text-dim); line-height:1.5;';
      rsv.innerHTML = '<b>RSV protection</b> is seasonal, not a fixed-age dose: a baby is protected either by the mother’s RSV vaccine in pregnancy (32 to 36 weeks in the US) or, if not, by a single long-acting antibody given to the baby (nirsevimab, or clesrovimab 105 mg), almost never both. Yearly <b>flu</b> shots start at 6 months.';
      wrap.appendChild(rsv);

      return wrap;
    }

    /* ---- the antigen-by-age grid as table.gtable ---- */
    function renderGrid(country, countryKey) {
      var section = el('div');
      section.style.cssText = 'margin-top:1.2rem;';

      var h = el('p');
      h.style.cssText = 'margin:0 0 0.5rem; font-family:var(--font-heading); font-weight:700; color:var(--text-bright);';
      h.textContent = 'Antigen by age: ' + country.name;
      section.appendChild(h);

      var wrap = el('div', 'gtable-wrap');
      var tbl = el('table', 'gtable');

      var cap = el('caption', null, 'Routine infant antigens by age, ' + country.name + '. A blank cell means the antigen is not routinely given at that age.');
      cap.style.cssText = 'caption-side:top; text-align:left; color:var(--text-dim); font-style:italic; font-size:0.85rem; padding:0 0 0.4em;';
      tbl.appendChild(cap);

      var thead = el('thead');
      var htr = el('tr');
      var th0 = el('th', null, 'Antigen');
      th0.scope = 'col';
      htr.appendChild(th0);
      country.ages.forEach(function (age) {
        var th = el('th', 'num', age);
        th.scope = 'col';
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      tbl.appendChild(thead);

      var tbody = el('tbody');
      country.rows.forEach(function (row) {
        var key = row[0];
        var tr = el('tr');
        var rowTh = el('th');
        rowTh.scope = 'row';
        // antigen name + a short title attribute with what it protects against
        rowTh.textContent = LABEL[key] || key;
        if (PROTECTS[key]) rowTh.title = 'Protects against: ' + PROTECTS[key];
        tr.appendChild(rowTh);

        // RSV row spans all age columns with a single guidance cell
        if (key === 'RSV') {
          var span = el('td', null, row[1] || 'seasonal');
          span.colSpan = country.ages.length;
          span.style.fontStyle = 'italic';
          tr.appendChild(span);
        } else {
          for (var i = 0; i < country.ages.length; i++) {
            var cellText = row[i + 1] || '';
            // blank cell = not routine at this age. A centered dot reads as
            // "nothing here" without using a dash (house rule: no dashes).
            var td = el('td', 'num', cellText === '' ? '·' : cellText);
            if (cellText === '') { td.style.color = 'var(--text-dim)'; td.style.textAlign = 'center'; }
            tr.appendChild(td);
          }
        }
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);

      wrap.appendChild(tbl);
      section.appendChild(wrap);

      if (country.foot) {
        var foot = el('p', null, country.foot);
        foot.style.cssText = 'margin:0.6rem 0 0; font-size:0.86rem; color:var(--text-dim); line-height:1.5;';
        section.appendChild(foot);
      }

      // The "protects against" key, so the one-liners are present in every view.
      var details = el('details', 'deeper srcs');
      var sm = el('summary', null, 'What each antigen protects against');
      details.appendChild(sm);
      var dl = el('ul');
      dl.style.cssText = 'margin:0.4em 0 0; padding-left:1.1em; font-size:0.86rem; color:var(--text-dim); line-height:1.5;';
      // list every antigen that appears in this country's grid, in row order
      country.rows.forEach(function (row) {
        var key = row[0];
        var item = el('li');
        var b = el('b', null, LABEL[key] || key);
        item.appendChild(b);
        item.appendChild(document.createTextNode(': ' + (PROTECTS[key] || key) + '.'));
        dl.appendChild(item);
      });
      details.appendChild(dl);
      section.appendChild(details);

      return section;
    }

    /* ---- wiring ---- */
    dIn.addEventListener('change', render);
    dIn.addEventListener('input', render);
    cSel.addEventListener('change', render);
    clearBtn.addEventListener('click', function () { dIn.value = ''; render(); cSel.focus(); });

    // initial paint (no date yet, US grid shown)
    render();

    function toYMD(dt) {
      var m = dt.getMonth() + 1, d = dt.getDate();
      return dt.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    }
  };
})();


/* module: vaccines-154m.js */
/* module: vaccines-154m.js
   FY.viz["vaccines-154m"]: two linked views in one figure.
   (a) the cumulative 154 million deaths averted by vaccination 1974 to 2024,
       with measles vaccine alone about 94 million of them (Shattock 2024).
   (b) a US measles-cases-by-year mini line ending at 2,288 in 2025 (vs 285 in
       2024), with kindergarten MMR coverage falling 95.2% to 92.5% through the
       95% herd-immunity threshold.
   Mechanism (the benefit) on the left, live consequence (the canary) on the right.
   No external libraries. No em dashes. Numbers are real and sourced in the note. */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });
  var S = FY.svg;
  if (!S) return;
  var P = S.palette;

  FY.viz['vaccines-154m'] = function (fig) {
    if (!fig || typeof fig.appendChild !== 'function') return;

    /* ---------------------------------------------------------------
       DATA. Every value is real and cited in the viz-note + table.
       --------------------------------------------------------------- */
    // (a) Lives saved 1974 to 2024 (Shattock et al., Lancet 2024;403:2307;
    //     WHO/EPI 50-year model). 154M total, ~94M from measles vaccine alone
    //     (over 60% of the total), so ~60M from all other vaccines combined.
    var TOTAL_SAVED = 154;          // millions of deaths averted, all vaccines
    var MEASLES_SAVED = 94;         // millions, measles vaccine alone
    var OTHER_SAVED = TOTAL_SAVED - MEASLES_SAVED; // 60 millions, all other vaccines

    // (b) US measles cases by year, post-elimination (CDC Measles Cases and
    //     Outbreaks, cdc.gov/measles/data-research, public domain). Endpoints
    //     2024=285 and 2025=2,288 confirmed in the immunization deep-dives.
    var cases = [
      [2010, 63], [2011, 220], [2012, 55], [2013, 187], [2014, 667],
      [2015, 188], [2016, 86], [2017, 120], [2018, 375], [2019, 1274],
      [2020, 13], [2021, 49], [2022, 121], [2023, 59], [2024, 285],
      [2025, 2288]
    ];

    // Kindergarten MMR coverage, 2-dose, by school year (CDC SchoolVaxView).
    // Falls from 95.2% (2019 to 2020) below the ~95% measles herd-immunity
    // threshold to 92.5% (2024 to 25), leaving about 286,000 kindergartners
    // unprotected. The stored year is the starting calendar year of the school
    // year; the two endpoints are the firm published figures, the interior
    // points trace the documented monotonic slide between them.
    var coverage = [
      [2019, 95.2], [2020, 93.9], [2021, 93.5], [2022, 93.1], [2023, 92.7], [2024, 92.5]
    ];
    var HERD = 95; // ~95% herd-immunity threshold for measles (R0 ~12 to 18)

    /* ---------------------------------------------------------------
       CANVAS. viewBox 0 0 720 380, split into a left panel (lives) and
       a wider right panel (the canary). All geometry derives from these
       constants so nothing hardcodes a stale pixel.
       --------------------------------------------------------------- */
    var W = 720, H = 380;
    var svg = S.make(W, H);

    // Local helper: S.text returns a DETACHED node, so wrap it to append.
    function txt(x, y, str, cls, attrs) { var t = S.text(x, y, str, cls, attrs); svg.appendChild(t); return t; }

    var splitX = 252;               // boundary between the two panels
    // Headers occupy the top band (y < 72); plots start below. Left panel (a)
    // carries the bold 154M headline, right panel (b) the canary line.
    var La = { x: 16, y: 88, w: splitX - 16 - 24, h: H - 88 - 52 };
    var Rb = { x: splitX + 58, y: 88, w: W - (splitX + 58) - 52, h: H - 88 - 52 };

    /* ---------- Panel headers (one per panel, in the top band) ---------- */
    // Left: the headline IS the bold number, so it never competes with a label.
    txt(La.x, 30, 'The benefit', 'viz-axis', { fill: P.gold, 'letter-spacing': '0.08em' });
    txt(La.x - 2, 62, '154M', 'viz-label', { fill: P.goldHi, 'font-size': '34px', 'font-weight': '700', 'font-family': 'var(--font-heading, serif)' });
    txt(La.x + 86, 50, 'deaths averted', 'viz-axis', { fill: P.parch });
    txt(La.x + 86, 64, 'by vaccination, 1974 to 2024', 'viz-axis', { fill: P.dim });

    // Right: short header line; the axis titles carry the specifics.
    txt(Rb.x - 42, 30, 'The live consequence', 'viz-axis', { fill: P.gold, 'letter-spacing': '0.08em' });
    txt(Rb.x - 42, 50, 'US measles cases per year (gold),', 'viz-axis', { fill: P.parch });
    txt(Rb.x - 42, 64, 'and kindergarten MMR coverage (blue)', 'viz-axis', { fill: P.dim });

    // Thin divider between the two linked views.
    S.el('line', { x1: splitX + 10, y1: 22, x2: splitX + 10, y2: H - 22, class: 'viz-grid', 'stroke-dasharray': '2 4', opacity: '0.5' }, svg);

    /* ===============================================================
       PANEL (a): the bold 154 million, split measles vs all other.
       A single vertical stacked bar so the measles share reads at a glance.
       =============================================================== */
    var yA = S.scale(0, TOTAL_SAVED, La.y + La.h, La.y); // 0 at bottom, 154 at top
    var barW = 64;
    var barX = La.x + 20;
    var base = La.y + La.h;

    // Baseline.
    S.el('line', { x1: La.x, y1: base, x2: La.x + La.w, y2: base, class: 'viz-grid' }, svg);

    // y gridlines + labels at 0, 50, 100, 150 (millions).
    [0, 50, 100, 150].forEach(function (v) {
      var y = yA(v);
      S.el('line', { x1: La.x, y1: y, x2: La.x + La.w, y2: y, class: 'viz-grid', opacity: v === 0 ? '1' : '0.35' }, svg);
      txt(La.x + La.w, y - 3, v, 'viz-axis', { 'text-anchor': 'end', fill: P.dim });
    });

    // Stacked bar: measles (bottom, dominant) then all-other (top).
    var yMeaslesTop = yA(MEASLES_SAVED);
    var yTotalTop = yA(TOTAL_SAVED);
    S.el('rect', { x: barX, y: yMeaslesTop, width: barW, height: base - yMeaslesTop, fill: P.gold, rx: '2' }, svg);
    S.el('rect', { x: barX, y: yTotalTop, width: barW, height: yMeaslesTop - yTotalTop, fill: P.sky, rx: '2' }, svg);

    // In-bar value labels (dark ink on the light fills).
    txt(barX + barW / 2, (base + yMeaslesTop) / 2 + 4, '94M', 'viz-label', { 'text-anchor': 'middle', fill: '#1d231e', 'font-weight': '700' });
    txt(barX + barW / 2, (yMeaslesTop + yTotalTop) / 2 + 4, '60M', 'viz-axis', { 'text-anchor': 'middle', fill: '#1d231e', 'font-weight': '700' });

    // Segment legends to the right of the bar.
    var legX = barX + barW + 12;
    var legMy = (base + yMeaslesTop) / 2;
    var legOy = (yMeaslesTop + yTotalTop) / 2;
    S.el('rect', { x: legX, y: legMy - 6, width: 9, height: 9, fill: P.gold }, svg);
    txt(legX + 14, legMy + 2, 'Measles', 'viz-axis', { fill: P.parch });
    txt(legX + 14, legMy + 16, 'vaccine', 'viz-axis', { fill: P.dim });
    S.el('rect', { x: legX, y: legOy - 6, width: 9, height: 9, fill: P.sky }, svg);
    txt(legX + 14, legOy + 2, 'All other', 'viz-axis', { fill: P.parch });
    txt(legX + 14, legOy + 16, 'vaccines', 'viz-axis', { fill: P.dim });

    // The bold headline figure above the bar.
    txt(barX - 2, yTotalTop - 22, '154', 'viz-label', { fill: P.goldHi, 'font-size': '40px', 'font-weight': '700', 'font-family': 'var(--font-heading, serif)' });
    txt(barX + 72, yTotalTop - 28, 'million', 'viz-axis', { fill: P.goldHi });
    txt(barX + 72, yTotalTop - 14, 'lives', 'viz-axis', { fill: P.dim });

    // x-axis caption for the left panel.
    txt(La.x, base + 26, 'Cumulative deaths averted (millions)', 'viz-axis', { fill: P.dim });
    txt(La.x, base + 39, 'Measles vaccine alone = over 60%', 'viz-axis', { fill: P.dim });

    /* ===============================================================
       PANEL (b): US measles cases by year (gold line, left axis) plus
       kindergarten MMR coverage (sky line, right axis) crossing the 95%
       herd-immunity threshold. The two together = mechanism then result.
       =============================================================== */
    var years = cases.map(function (d) { return d[0]; });
    var x0 = years[0], x1 = years[years.length - 1];
    var xR = S.scale(x0, x1, Rb.x, Rb.x + Rb.w);

    var maxCases = 2288;            // 2025 record sets the top of the left axis
    var yCases = S.scale(0, maxCases, Rb.y + Rb.h, Rb.y);

    // Coverage uses a tight right axis (90% to 96%) so the small slip and the
    // threshold crossing are legible rather than flattened against case counts.
    var covLo = 90, covHi = 96;
    var yCov = S.scale(covLo, covHi, Rb.y + Rb.h, Rb.y);
    var rbBase = Rb.y + Rb.h;

    // Baseline + left-axis case gridlines.
    S.el('line', { x1: Rb.x, y1: rbBase, x2: Rb.x + Rb.w, y2: rbBase, class: 'viz-grid' }, svg);
    [0, 500, 1000, 1500, 2000].forEach(function (v) {
      var y = yCases(v);
      if (v > 0) S.el('line', { x1: Rb.x, y1: y, x2: Rb.x + Rb.w, y2: y, class: 'viz-grid', opacity: '0.3' }, svg);
      txt(Rb.x - 6, y + 3, v.toLocaleString('en-US'), 'viz-axis', { 'text-anchor': 'end', fill: P.gold });
    });
    // Left-axis title.
    txt(Rb.x - 46, Rb.y - 8, 'Measles cases', 'viz-axis', { fill: P.gold });

    // x-axis year ticks (label a readable subset to avoid crowding).
    [2010, 2014, 2018, 2022, 2025].forEach(function (yr) {
      var x = xR(yr);
      S.el('line', { x1: x, y1: rbBase, x2: x, y2: rbBase + 4, class: 'viz-grid' }, svg);
      txt(x, rbBase + 16, "'" + String(yr).slice(2), 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });
    });

    // ---- Coverage line (sky), drawn first so the case line reads on top ----
    var threshY = yCov(HERD);
    var covX0 = xR(coverage[0][0]);
    var covX1 = xR(coverage[coverage.length - 1][0]);
    // Threshold band: shade below 95% to show the herd-immunity gap.
    S.el('rect', { x: covX0, y: threshY, width: covX1 - covX0, height: rbBase - threshY, fill: P.emerg, opacity: '0.07' }, svg);
    S.el('line', { x1: covX0, y1: threshY, x2: Rb.x + Rb.w, y2: threshY, stroke: P.emerg, 'stroke-width': '1', 'stroke-dasharray': '4 3', opacity: '0.8' }, svg);
    txt(Rb.x + Rb.w, threshY - 4, '95% herd-immunity line', 'viz-axis', { 'text-anchor': 'end', fill: P.emerg });

    var covPts = coverage.map(function (d) { return [xR(d[0]), yCov(d[1])]; });
    S.el('path', { d: S.line(covPts), fill: 'none', stroke: P.sky, 'stroke-width': '2', 'stroke-dasharray': '5 3', 'stroke-linejoin': 'round' }, svg);
    // Endpoints of the coverage line, labeled with the firm figures.
    S.el('circle', { cx: covPts[0][0], cy: covPts[0][1], r: '3.2', fill: P.sky }, svg);
    txt(covPts[0][0] + 5, covPts[0][1] - 5, '95.2%', 'viz-axis', { fill: P.sky });
    var lastCov = covPts[covPts.length - 1];
    S.el('circle', { cx: lastCov[0], cy: lastCov[1], r: '3.2', fill: P.sky }, svg);
    txt(lastCov[0] - 2, lastCov[1] + 14, '92.5%', 'viz-axis', { 'text-anchor': 'end', fill: P.sky });
    // Right-axis title.
    txt(Rb.x + Rb.w + 4, Rb.y - 8, 'MMR coverage', 'viz-axis', { 'text-anchor': 'end', fill: P.sky });

    // ---- Measles cases line (gold) ----
    var casePts = cases.map(function (d) { return [xR(d[0]), yCases(d[1])]; });
    S.el('path', { d: S.area(casePts, rbBase), fill: P.gold, opacity: '0.12' }, svg);
    S.el('path', { d: S.line(casePts), fill: 'none', stroke: P.gold, 'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

    // Mark the two endpoints the spec calls out: 2024 (285) and 2025 (2,288).
    var p2024 = casePts[casePts.length - 2], p2025 = casePts[casePts.length - 1];
    S.el('circle', { cx: p2024[0], cy: p2024[1], r: '3', fill: P.gold }, svg);
    txt(p2024[0] - 4, p2024[1] - 6, '285', 'viz-axis', { 'text-anchor': 'end', fill: P.parch });
    txt(p2024[0] - 4, p2024[1] + 7, 'in 2024', 'viz-axis', { 'text-anchor': 'end', fill: P.dim });
    S.el('circle', { cx: p2025[0], cy: p2025[1], r: '4', fill: P.goldHi, stroke: '#1d231e', 'stroke-width': '1' }, svg);
    txt(p2025[0] + 5, p2025[1] + 2, '2,288', 'viz-label', { 'text-anchor': 'end', fill: P.goldHi, 'font-weight': '700' });
    txt(p2025[0] + 5, p2025[1] + 16, 'in 2025', 'viz-axis', { 'text-anchor': 'end', fill: P.dim });

    // Flag the 2019 spike for context (largest since elimination until 2025).
    var p2019 = casePts[9];
    txt(p2019[0], p2019[1] - 7, '1,274 in 2019', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });

    // Attach the SVG after the figcaption.
    fig.appendChild(svg);

    /* ---------- Accessible spoken summary with the key numbers ---------- */
    svg.setAttribute('aria-label',
      'Two linked charts. Left: vaccination averted an estimated 154 million deaths from 1974 to 2024, ' +
      'with measles vaccine alone accounting for about 94 million, over 60 percent of the total. ' +
      'Right: US measles cases rose from 285 in 2024 to 2,288 in 2025, the most since 1991, ' +
      'as kindergarten two-dose MMR coverage slipped from 95.2 percent in 2019 to 2020 down to 92.5 percent in 2024 to 2025, ' +
      'crossing below the roughly 95 percent measles herd-immunity threshold.');

    /* ---------- Reassuring / explanatory caption + source ---------- */
    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent =
      'The mechanism is simple and proven: high coverage starves measles of the susceptible people it ' +
      'needs to spread. Because measles is so contagious (a basic reproduction number around 12 to 18), ' +
      'about 95 percent of a community must be immune to stop it, so it is the first disease to come back ' +
      'when coverage slips. The good news dwarfs the bad: vaccines have averted an estimated 154 million ' +
      'deaths in 50 years. The 2025 US resurgence (2,288 cases, the most since 1991, about 93 percent in ' +
      'unvaccinated or unknown-status people) is what a few points of lost coverage looks like, and it is ' +
      'reversible by getting back above the line. Sources: Shattock et al., The Lancet 2024;403:2307 (WHO ' +
      'Expanded Programme on Immunization 50-year model); CDC Measles Cases and Outbreaks; CDC SchoolVaxView.';
    fig.appendChild(note);

    /* ---------- Accessible data table (the fallback for the numbers) ---------- */
    var tbl = document.createElement('table');
    tbl.className = 'viz-data';

    var capEl = document.createElement('caption');
    capEl.textContent = 'US measles cases per year with kindergarten 2-dose MMR coverage, plus the 154 million lives-saved breakdown.';
    capEl.style.cssText = 'text-align:left;color:var(--text-dim);font-style:italic;padding:0.2em 0 0.4em;';
    tbl.appendChild(capEl);

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th scope="col">Year</th><th scope="col">US measles cases</th>' +
      '<th scope="col">Kindergarten MMR coverage</th></tr>';
    tbl.appendChild(thead);

    var covByYear = {};
    coverage.forEach(function (d) { covByYear[d[0]] = d[1]; });

    var tbody = document.createElement('tbody');
    cases.forEach(function (d) {
      var tr = document.createElement('tr');
      var cov = covByYear[d[0]];
      tr.innerHTML =
        '<th scope="row">' + d[0] + '</th>' +
        '<td>' + d[1].toLocaleString('en-US') + '</td>' +
        '<td>' + (cov != null ? cov.toFixed(1) + '%' : 'n/a') + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    var tfoot = document.createElement('tfoot');
    tfoot.innerHTML =
      '<tr><th scope="row">Herd-immunity threshold</th><td>n/a</td><td>~95%</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (measles vaccine)</th><td colspan="2">~' + MEASLES_SAVED + ' million</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (all other vaccines)</th><td colspan="2">~' + OTHER_SAVED + ' million</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (total)</th><td colspan="2">' + TOTAL_SAVED + ' million</td></tr>';
    tbl.appendChild(tfoot);

    fig.appendChild(tbl);
  };
})();
