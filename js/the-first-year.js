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
        if (e.shiftKey && (document.activeElement === first || document.activeElement === toc)) { e.preventDefault(); last.focus(); }
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
    window.addEventListener('hashchange', function () { openToHash(location.hash); });
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



/* Editorial charts: observed points, straight interpolation, and accessible tables. */
(function () {
  'use strict';
  var FY = window.FY, S = FY.svg, P = S.palette;
  FY.dataPlot = function (fig, cfg) {
    var W = 720, H = cfg.height || 380, svg = S.make(W, H);
    var x0 = cfg.bars ? 170 : 58, x1 = W - 72, y0 = 58, y1 = H - 52;
    var xs = S.scale(cfg.xmin || 0, cfg.xmax || 1, x0, x1);
    var ys = S.scale(0, cfg.ymax || 1, y1, y0);
    svg.setAttribute('aria-label', cfg.title + '. ' + cfg.description);
    svg.appendChild(S.text(W / 2, 23, cfg.title, 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14 }));
    if (cfg.bars) {
      var step = (y1 - y0) / cfg.rows.length;
      cfg.rows.forEach(function (r, i) {
        var cy = y0 + step * (i + .5), color = P.gold;
        svg.appendChild(S.text(x0 - 8, cy + 4, r[0], 'viz-axis', { 'text-anchor': 'end' }));
        S.el('rect', { x: x0, y: cy - step * .28, width: xs(r[1]) - x0, height: step * .56, fill: color, rx: 2 }, svg);
        svg.appendChild(S.text(xs(r[1]) + 7, cy + 4, '$' + r[1].toLocaleString('en-US'), 'viz-axis', {}));
      });
    } else {
      (cfg.xticks || []).forEach(function (v) {
        S.el('line', { x1: xs(v), y1: y0, x2: xs(v), y2: y1, class: 'viz-grid', opacity: .35 }, svg);
        svg.appendChild(S.text(xs(v), y1 + 18, String(v), 'viz-axis', { 'text-anchor': 'middle' }));
      });
      (cfg.yticks || []).forEach(function (v) {
        S.el('line', { x1: x0, y1: ys(v), x2: x1, y2: ys(v), class: 'viz-grid', opacity: .35 }, svg);
        svg.appendChild(S.text(x0 - 9, ys(v) + 4, String(v), 'viz-axis', { 'text-anchor': 'end' }));
      });
      cfg.series.forEach(function (trace, i) {
        var color = [P.gold, P.sky, P.emerg][i], points = trace.points.map(function (p) { return [xs(p[0]), ys(p[1])]; });
        S.el('path', { d: S.line(points), fill: 'none', stroke: color, 'stroke-width': 2 }, svg);
        points.forEach(function (p) { S.el('circle', { cx: p[0], cy: p[1], r: cfg.schematic ? 0 : 4, fill: color }, svg); });
        svg.appendChild(S.text(x0 + i * 210, 42, trace.label, 'viz-axis', { fill: color }));
      });
      svg.appendChild(S.text((x0 + x1) / 2, H - 9, cfg.xLabel, 'viz-axis', { 'text-anchor': 'middle' }));
      svg.appendChild(S.text(0, 0, cfg.yLabel, 'viz-axis', { 'text-anchor': 'middle', transform: 'translate(16 ' + ((y0 + y1) / 2) + ') rotate(-90)' }));
    }
    fig.appendChild(svg);
    var note = document.createElement('p'); note.className = 'viz-note'; note.innerHTML = cfg.note; fig.appendChild(note);
    var table = document.createElement('table'); table.className = 'viz-data';
    var caption = document.createElement('caption'); caption.textContent = cfg.title; table.appendChild(caption);
    var thead = document.createElement('thead'), header = document.createElement('tr');
    cfg.headers.forEach(function (label) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.appendChild(th); });
    thead.appendChild(header); table.appendChild(thead);
    var tbody = document.createElement('tbody');
    cfg.rows.forEach(function (row) { var tr = document.createElement('tr'); row.forEach(function (value, i) { var td = document.createElement(i ? 'td' : 'th'); if (!i) td.scope = 'row'; td.textContent = value; tr.appendChild(td); }); tbody.appendChild(tr); });
    table.appendChild(tbody); fig.appendChild(table);
  };
})();


(function () {
  'use strict';
  var FY = window.FY;
  FY.viz['cry-curve'] = function (fig) {
    FY.dataPlot(fig, {
      title: 'Selected published averages of crying and fussing',
      description: 'Weighted means from Vermillet 2022: 126 minutes at five to six weeks, 66 at thirteen to seventeen weeks, and 34 at eighteen to twenty-two weeks. Straight lines connect these selected means. No infant normal range is plotted.',
      xmax: 26, ymax: 150, xticks: [0, 5, 10, 15, 20, 25], yticks: [0, 30, 60, 90, 120, 150],
      xLabel: 'Age in weeks (interval midpoints)', yLabel: 'Crying plus fussing, minutes per day',
      series: [{ label: 'Selected weighted means', points: [[5.5,126],[15,66],[20,34]] }],
      headers: ['Age interval', 'Weighted mean, minutes/day'], rows: [['5 to 6 weeks',126],['13 to 17 weeks',66],['18 to 22 weeks',34]],
      note: 'These are three means reported in the paper, drawn at each age interval’s midpoint. Lines are straight interpolation, not the authors’ fitted model. The 57 studies varied greatly in country, sample and parent reporting, especially at later ages. Averages cannot determine whether a particular baby’s crying is normal. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9541248/">Vermillet et al. 2022, results and methods</a>.'
    });
  };
  FY.viz['cry-aht'] = function (fig) {
    var cry = [], harm = [];
    for (var w=0;w<=40;w+=.5) {
      cry.push([w,Math.exp(-Math.pow((w-5.5)/6,2))]);
      harm.push([w,Math.exp(-Math.pow((w-10)/6,2))+.3*Math.exp(-Math.pow((w-34)/6,2))]);
    }
    FY.dataPlot(fig, {
      title: 'Crying and abusive head trauma: a schematic',
      description: 'Illustrative profiles only. The curves and their relative heights are not measured incidence or a prediction of risk. They illustrate early crying and a later early-infancy peak in abusive head trauma.',
      xmax: 40, ymax: 1.2, xticks: [0,8,16,24,32,40], yticks: [], schematic: true,
      xLabel: 'Age in weeks', yLabel: 'Illustrative profiles, no risk scale',
      series: [{ label: 'Illustrative crying profile',points:cry},{label:'Illustrative trauma profile',points:harm}],
      headers:['What is shown','What it means'], rows:[['Curves','Illustrations, not a measured dataset'],['Relative heights','Arbitrary; do not compare rates'],['Care action','Put the baby safely down and get help before frustration escalates']],
      note:'The AAP report discusses the association between crying and abusive head trauma. This drawing illustrates timing; its widths and heights are chosen for the diagram and are not data. It cannot establish that crying causes an injury or predict a family’s risk. If frustration builds, put the baby on their back in an empty crib, step away briefly and call someone to take over. Never shake a baby. <a href="https://publications.aap.org/pediatrics/article/155/3/e2024070457/201049/Abusive-Head-Trauma-in-Infants-and-Children">AAP abusive head trauma technical report, 2025</a>.'
    });
  };
})();

/* module: death-injury.js */
/* Global under-five cause estimates and US infant or toddler registered counts have separate methods, populations and dates. Global 2024 cause shares are prematurity 18%, pneumonia 13%, birth asphyxia or trauma 10%. Neonatal totals are separate from the cause stack. Sources are linked beside the charts. */
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
       Leaders are rounded report and UNICEF cause shares for 2024; the remainder is
       the transparent arithmetic balance, labeled "all other causes." The
       neonatal-origin leaders (prematurity, birth asphyxia) sit at the
       bottom; the post-neonatal infection leader (pneumonia) above them. */
    var GLOBAL = [
      { label: 'Prematurity', v: 18, col: P.plum,  band: 'neonatal' },
      { label: 'Birth asphyxia / trauma', v: 10, col: P.sky, band: 'neonatal' },
      { label: 'Pneumonia (LRI)', v: 13, col: P.call, band: 'post' },
      { label: 'All other causes', v: 59, col: P.dim, band: 'mixed' }
    ];
    var GLOBAL_TOTAL = 4.9; /* million */
    /* Neonatal totals are reported separately, not encoded in the cause stack. */

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
    add(svg, S.text(W / 2, 20, 'Selected causes in two age groups', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
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
      add(svg, S.el('line', { x1: 46, y1: yy, x2: 50, y2: yy, stroke: P.rule, 'stroke-width': 1, opacity: 0.7 }));
      add(svg, S.text(42, yy + 3.5, String(g), 'viz-axis', { 'text-anchor': 'end' }));
    });
    add(svg, S.text(16, (plotT + plotB) / 2, 'share of deaths (%)', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, transform: 'rotate(-90 16 ' + ((plotT + plotB) / 2) + ')' }));

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
          add(svg, S.text(lx, midY + 3.5, d.label.replace('Short gestation / LBW', 'Short gestation').replace('Maternal complications', 'Maternal comp.'), 'viz-axis', { 'text-anchor': anchor, fill: P.parch, 'font-size': 10.5 }));
        }
        acc += d.v;
      });
    }

    /* draw the two bars; labels go outward (global to its left, US to its right) */
    stack(GLOBAL, gx, 'left');
    stack(US, ux, 'right');

    /* Keep the US rate and global age range beneath the separate bars. */
    add(svg, S.text(ux + barW / 2, plotB + 20, 'IMR ' + US_IMR.toFixed(2) + ' / 1,000', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 10 }));
    add(svg, S.text(gx + barW / 2, plotB + 20, 'age range: under 5', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim, 'font-size': 10 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label', 'Two cause-composition bars with different age ranges and totals. Estimated global under-five deaths in 2024: prematurity 18 percent, pneumonia 13 percent, birth asphyxia or trauma 10 percent, remainder 59 percent. US registered infant deaths in 2023: congenital anomalies 20 percent, short gestation or low birth weight 14.5 percent, SIDS 7.2 percent, injury 6.4 percent, maternal complications 5.7 percent, remainder 46.2 percent.');
    add(fig, svg);

    note(fig, 'The global total is an estimate for children under five; the US total is registered deaths before one year. Rounded cause shares and definitions differ. About 2.3 million of the estimated 4.9 million global deaths occurred in the first twenty-eight days; this age total is separate from the cause stack. Neither bar is a personal risk estimate. <span class="src"><a href="https://data.unicef.org/wp-content/uploads/2026/05/UNIGME-Child-Mortality-Report-2025.pdf">UN IGME Report 2025</a>, released in 2026, 2024 estimates and cause-of-death methods; <a href="https://www.cdc.gov/nchs/data/nvsr/nvsr74/nvsr74-07.pdf">CDC NVSR 74-7</a>, Table 3, 2023 registered deaths.</span>');

    dataTable(fig, 'World deaths under age 5, 2024 (UN IGME): share of all under-5 deaths',
      ['Cause', 'Share of under-5'],
      [
        ['Pneumonia / lower respiratory infections', '13%'],
        ['Prematurity (preterm birth complications)', '18%'],
        ['Birth asphyxia / trauma (intrapartum)', '10%'],
        ['All other causes (diarrhoea, malaria, congenital, injury, measles, sepsis, etc.)', '59%'],
        ['Memo: neonatal (first 28 days)', '47% (2.3M of 4.9M)'],
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

    /* NCHS final 2022 death-certificate counts, NVSR73(10), Tables1/2.
       SIDS is the underlying-cause R95 category. */
    var UNDER1 = [
      { label: 'Congenital anomalies', v: 3970, injury: false },
      { label: 'Short gestation', v: 2884, injury: false },
      { label: 'SIDS', v: 1529, injury: false },
      { label: 'Unintentional injury', v: 1354, injury: true, rank: '#4' }
    ];
    var AGE14 = [
      { label: 'Unintentional injury', v: 1288, injury: true, rank: '#1' },
      { label: 'Congenital anomalies', v: 441, injury: false },
      { label: 'Homicide', v: 343, injury: false },
      { label: 'Cancer', v: 266, injury: false }
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
    add(svg, S.text(W / 2, 20, 'Leading causes of death, by age', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 15 }));
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
      'Two ranked bar panels of leading underlying causes of death in the United States, 2022, from the NCHS final death-certificate report. ' +
      'For infants under 1 year: congenital anomalies 3,970 deaths, short gestation 2,884, SIDS 1,529, unintentional injury 1,354. ' +
      'For ages 1 to 4: unintentional injury 1,288, congenital anomalies 441, homicide 343, cancer 266. ' +
      'Ranked counts describe historical populations, not an individual child’s risk.');
    add(fig, svg);

    note(fig,
      'Unintentional injury ranks fourth among infant causes and first at ages 1 to 4 in these 2022 US counts. Rankings compare eligible underlying-cause categories; they are not a child’s individual risk. Infant sleep-environment deaths and older children’s injuries need different prevention measures. ' +
      '<span class="src"><a href="https://stacks.cdc.gov/view/cdc/164020/cdc_164020_DS1.pdf">NCHS, Deaths: Leading Causes for 2022, Tables 1 and 2</a>.</span>');

    dataTable(fig, 'Leading underlying causes of death, infants under 1, US 2022 (NCHS)',
      ['Rank', 'Cause', 'Deaths'],
      UNDER1.map(function (d, i) { return [String(i + 1), d.label, comma(d.v)]; }));

    dataTable(fig, 'Leading underlying causes of death, ages 1 to 4, US 2022 (NCHS)',
      ['Rank', 'Cause', 'Deaths'],
      AGE14.map(function (d, i) { return [String(i + 1), d.label, comma(d.v)]; }));

  };
})();


/* module: feeding-charts.js */
/* ============================================================
   THE FIRST YEAR, feeding charts module.
   Two visualizations for the feeding domain:
     FY.viz["bf-duration"]  the US2022 breastfeeding survey outcomes;
                            the 20th-century V-then-climb curve.
     FY.viz["milk-storage"] the CDC milk-storage rule of fours
                            reference infographic.
   Global estimates and registered US counts have different methods and age ranges.
   See the linked current sources and dated labels.
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
  /*    Selected modern measures, 2022 birth cohort, CDC NIS-Child.         */
  /* ====================================================================== */
  FY.viz['bf-duration'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 330, svg = S.make(W, H);
    var rows = [
      { label: 'Ever breastfed', v: 85.7, ci: 0.9, col: P.gold },
      { label: 'Any at 6 months', v: 62.1, ci: 1.1, col: P.sky },
      { label: 'Any at 12 months', v: 40.8, ci: 1.1, col: P.sky },
      { label: 'Exclusive through 6 months', v: 27.9, ci: 1.0, col: P.plum }
    ];
    var x = S.scale(0, 100, 225, 670);
    [0, 25, 50, 75, 100].forEach(function (v) {
      var xx = x(v);
      add(svg, S.el('line', { x1: xx, y1: 35, x2: xx, y2: 274, class: 'viz-grid' }));
      add(svg, S.text(xx, 296, v + '%', 'viz-axis', { 'text-anchor': 'middle' }));
    });
    rows.forEach(function (d, i) {
      var yy = 54 + i * 58;
      add(svg, S.text(215, yy + 20, d.label, 'viz-axis', { 'text-anchor': 'end' }));
      add(svg, S.el('rect', { x: x(0), y: yy, width: x(d.v) - x(0), height: 29, rx: 2, fill: d.col }));
      add(svg, S.text(x(d.v) + 7, yy + 20, d.v + '%', 'viz-axis', { fill: P.goldHi }));
    });
    svg.setAttribute('aria-label', 'US 2022 birth cohort, CDC National Immunization Survey-Child. Ever breastfed 85.7 percent, any breast milk at six months 62.1 percent, any at twelve months 40.8 percent, exclusive through six months 27.9 percent. These selected measures do not locate a precise drop or establish a cause.');
    add(fig, svg);
    note(fig, 'Dated estimates for the US 2022 birth cohort, based on recalled feeding histories in a telephone survey of households with children aged 19 to 35 months. Exclusive means breast milk without other liquids or solids. The table gives the reported half-widths of 95% confidence intervals. These measures describe feeding at selected stages, without identifying why families continued or stopped. <span class="src">Sources: <a href="https://www.cdc.gov/breastfeeding-data/survey/results.html">CDC national results</a> and <a href="https://www.cdc.gov/breastfeeding-data/survey/methodology.html">survey methods</a>. Newer cohorts are available at the results link.</span>');
    dataTable(fig, 'US breastfeeding, 2022 birth cohort', ['Measure', 'Percent', 'Half 95% CI (percentage points)'], rows.map(function (d) { return [d.label, String(d.v), String(d.ci)]; }));
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
      'For freshly expressed milk: up to four hours at 25 C or colder, four days refrigerated, and about six months frozen for best quality (up to twelve acceptable). Once completely thawed in the refrigerator, use within twenty-four hours; once warmed or brought to room temperature, within two hours. Do not refreeze or microwave. The care team may give a different storage plan for a sick or premature infant. ' +
      '<span class="src"><a href="https://www.cdc.gov/breastfeeding/breast-milk-preparation-and-storage/handling-breastmilk.html">CDC, Breast Milk Storage and Preparation</a> (updated August 14, 2026; reviewed March 25, 2026).</span>');

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
   runs about 6 to 7 percent heavier by 12 months. The references
   differ in study populations, feeding criteria and methods. WHO
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
   2026-06-01, source-linked): boys 6 mo WHO 7.934 vs CDC 7.897
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
    lg.appendChild(S.text(26, 0, 'WHO growth standard', 'viz-axis', { fill: P.gold }));
    S.el('line', { x1: 270, y1: -3, x2: 290, y2: -3, stroke: P.call, 'stroke-width': 2.4, 'stroke-dasharray': '6 4' }, lg);
    lg.appendChild(S.text(296, 0, 'CDC 2000 reference', 'viz-axis', { fill: P.call }));

    /* ---- accessibility, updated per sex ---- */
    function updateAria(d) {
      var w6 = atMonth(d.who, 6), c6 = atMonth(d.cdc, 6);
      var w12 = atMonth(d.who, 12), c12 = atMonth(d.cdc, 12);
      var sexWord = current === 'boys' ? 'boys' : 'girls';
      svg.setAttribute('aria-label',
        'Line chart overlaying median weight-for-age from birth to 24 months for ' + sexWord + ', the WHO Child Growth Standard against the CDC 2000 reference. ' +
        'At 6 months the two medians nearly coincide (WHO ' + w6.toFixed(2) + ' kg, CDC ' + c6.toFixed(2) + ' kg, a difference of ' + d.gap6 + '). ' +
        'By 12 months the CDC reference median runs heavier: WHO ' + w12.toFixed(2) + ' kg versus CDC ' + c12.toFixed(2) + ' kg, a gap of ' + d.gap12kg + ' kg, about ' + d.gap12pct + '. ' +
        'The references have different study populations, feeding criteria and methods. ' +
        'These population medians do not establish the cause of an individual baby’s growth pattern. Interpret the baby’s measurements and trend with their clinician.');
    }

    /* attach: controls first (above the svg), then the figure caption is
       already present, so insert the svg after it, then the note + table. */
    fig.appendChild(controls);
    fig.appendChild(svg);
    draw();

    note(fig, 'The US CDC recommends WHO growth standards from birth to age two. WHO and CDC charts differ in their study populations, feeding criteria and construction; the difference cannot be assigned entirely to feeding. At twelve months the age-matched CDC median is about 6 to 7 percent heavier. These are population references, not targets or proof that a child is thriving. WHO values are published monthly medians; CDC medians are linearly interpolated from half-month rows, and the lines connect selected three-month points. <span class="src"><a href="https://www.cdc.gov/growthcharts/who-data-files.htm">WHO files</a>; <a href="https://www.cdc.gov/growthcharts/data/zscore/wtageinf.csv">CDC infant LMS file</a>; <a href="https://www.cdc.gov/growth-chart-training/hcp/using-growth-charts/who-using.html">CDC chart guidance</a></span>');

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
                               and gas remedies: selected findings with
                               source-specific outcomes and limits.
   Global estimates and registered US counts have different methods and age ranges.
   See the linked current sources and dated labels.
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
    add(svg, S.text((rightX0 + rightX1) / 2, 16, 'Follow-up at mean age 13 (LEAP-Trio)', 'viz-label', { 'text-anchor': 'middle', fill: P.parch }));

    /* shared y domain 0..20 percent (max observed value is 17.2) */
    var yMax = 20;

    /* ===== LEFT: randomized-group comparison at age 5 ===== */
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

    svg.setAttribute('aria-label',
      'LEAP trial peanut allergy at age 5: 17.2 percent in avoidance versus 3.2 percent in consumption. Infants entered at 4 to less than 11 months with severe eczema, egg allergy, or both; baseline skin testing and food challenges determined suitability. Infants with skin-test wheals greater than 4 millimeters were excluded. ' +
      'LEAP-Trio follow-up at mean age 13 found 15.4 percent versus 4.4 percent among 497 children with outcome data, of 640 originally randomized. Subsequent diets were not randomized. The endpoints use different retained samples; connecting lines do not establish an individual trajectory or a home-challenge protocol.');
    add(fig, svg);

    note(fig,
      'LEAP randomly assigned 640 high-risk infants, aged 4 to less than 11 months with severe eczema, egg allergy, or both. Baseline skin testing and clinician-supervised challenges mattered: infants with wheals greater than 4 mm were excluded, and those who reacted to the consumption-group baseline challenge were told to avoid peanut. These are trial results, not instructions for a home challenge. Families with a high-risk infant should discuss assessment and introduction with their clinician. ' +
      'LEAP-Trio enrolled 508 original participants and determined allergy status in 497, at a mean age of 13. Food challenge established most outcomes; intake history and a biomarker prediction model supplied others. After LEAP-On, diets were unrestricted for nonallergic participants. The lower allergy rate remained associated with the original assignment; this follow-up did not randomize later diets or guarantee a lifetime result. ' +
      '<span class="src"><a href="https://media.mycme.com/documents/115/du_toit_2015_28582.pdf">Du Toit et al., LEAP 2015, original paper mirror</a>; <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12875682/">LEAP-Trio 2024, original follow-up</a>.</span>');

    dataTable(fig, 'LEAP peanut allergy by group (percent allergic)',
      ['Timepoint', 'Avoided peanut', 'Ate peanut early'],
      [
        ['Age 5 (LEAP, 2015)', '17.2', '3.2'],
        ['Age ~13 (LEAP-Trio, 2024)', '15.4', '4.4']
      ]);
  };

  /* ====================================================================== */
  /* 2. FY.viz["colic-remedies"]                                             */
  /*    Selected findings from maternal-diet and probiotic trials, with  */
  /*    its measured outcome, population and uncertainty.    */
  /*    Rows state study-specific results rather than invented evidence grades.           */
  /* ====================================================================== */
  FY.viz['colic-remedies'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 318;
    var svg = S.make(W, H);
    var rows = [
      { intervention: 'Maternal low-allergen diet, one-week trial',
        finding: '74% versus 37% achieved at least 25% less crying/fussing',
        scope: 'Hill 2005: 90 completers, exclusively breastfed; 48-hour diaries' },
      { intervention: 'L. reuteri DSM 17938, overall pooled estimate',
        finding: 'Day 21: -25.4 minutes/day (95% CI -47.3 to -3.5)',
        scope: 'Sung 2018: four trials, 345 infants; adjusted change difference' },
      { intervention: 'L. reuteri DSM 17938, breastfed subgroup',
        finding: 'Day 21: -46.4 minutes/day (95% CI -67.2 to -25.5)',
        scope: 'Formula-fed evidence came from one trial and was insufficient' }
    ];
    add(svg, S.text(W / 2, 23, 'Selected colic-treatment trial findings', 'viz-label', {
      'text-anchor': 'middle', fill: P.parch, 'font-size': 15
    }));
    add(svg, S.text(W / 2, 43, 'Different interventions, outcomes and populations', 'viz-axis', {
      'text-anchor': 'middle', fill: P.dim
    }));
    rows.forEach(function (d, i) {
      var y = 60 + i * 78;
      add(svg, S.el('rect', { x: 16, y: y, width: W - 32, height: 70, rx: 8,
        fill: 'rgba(0,0,0,0.16)', stroke: P.rule, 'stroke-width': 1 }));
      add(svg, S.text(32, y + 21, d.intervention, 'viz-label', {
        'text-anchor': 'start', fill: P.parch, 'font-size': 13
      }));
      add(svg, S.text(32, y + 40, d.finding, 'viz-axis', {
        'text-anchor': 'start', fill: P.dim, 'font-size': 12
      }));
      add(svg, S.text(32, y + 58, d.scope, 'viz-axis', {
        'text-anchor': 'start', fill: P.dim, 'font-size': 11
      }));
    });
    svg.setAttribute('aria-label', 'Selected study-specific colic-treatment findings. In Hill’s one-week maternal-diet trial, 74 percent versus 37 percent of ninety completing exclusively breastfed infants achieved at least a 25 percent reduction in crying and fussing recorded over forty-eight hours. Sung’s four-trial meta-analysis included 345 infants: the adjusted day-twenty-one change difference was minus 25.4 minutes per day overall, with a 95 percent confidence interval from minus 47.3 to minus 3.5, and minus 46.4 in the breastfed subgroup, with an interval from minus 67.2 to minus 25.5. Formula-fed evidence was insufficient. These findings are not general treatment instructions.');
    add(fig, svg);
    note(fig, 'Hill randomized 107 mother-infant pairs; ninety completed the seven-day study. Mothers could not be blinded to their diet, and crying/fussing was recorded in parental diaries. Sung pooled individual data from four double-blind trials of the specific strain L. reuteri DSM 17938. Its figures are adjusted between-group differences in change from baseline, rather than raw before-and-after minutes. Only one trial supplied formula-fed infants; results should not be generalized to other strains or all infants. Assessment of feeding, growth and illness comes first. Discuss a suspected allergy or a probiotic trial with the clinical team. <span class="src"><a href="https://pubmed.ncbi.nlm.nih.gov/16263986/">Hill 2005, DOI 10.1542/peds.2005-0147</a>; <a href="https://pubmed.ncbi.nlm.nih.gov/29279326/">Sung 2018, DOI 10.1542/peds.2017-1811</a></span>');
    dataTable(fig, 'Selected colic-treatment trial findings and population limits',
      ['Intervention', 'Finding', 'Population and measurement'],
      rows.map(function (d) { return [d.intervention, d.finding, d.scope]; }));
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
    { name: 'Hands and knees crawling',   p1: 5.2, med: 8.3,  p99: 13.5, note: '4.3% were not observed to crawl in this study cohort' },
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
      svg.appendChild(FY.svg.text(gxp, m.top + plotH + 20, String(t), 'viz-axis', { 'text-anchor': 'middle' }));
    }

    // X axis title.
    svg.appendChild(FY.svg.text(m.left + plotW / 2, m.top + plotH + 42, 'Age in months', 'viz-label', {
      'text-anchor': 'middle', fill: P.dim
    }));

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
      svg.appendChild(FY.svg.text(m.left - 12, cy + 4, d.name, 'viz-axis', {
        'text-anchor': 'end', fill: P.parch
      }));

      // The published reference interval, not a diagnostic boundary.
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
      svg.appendChild(FY.svg.text(x1 + 8, cy + 4, mo(d.med), 'viz-axis', {
        'text-anchor': 'start', fill: P.dim
      }));
    });

    // ---- Small inline legend (band = range, dot = median) ----
    var lg = FY.svg.el('g', null, svg);
    var lgy = m.top - 10;
    var lgx = m.left;
    FY.svg.el('rect', { x: lgx, y: lgy - 5, width: 26, height: 10, rx: 5, ry: 5, fill: P.dim, 'fill-opacity': 0.22, stroke: P.dim, 'stroke-opacity': 0.7, 'stroke-width': 1 }, lg);
    svg.appendChild(FY.svg.text(lgx + 32, lgy + 4, '1st to 99th percentile', 'viz-axis', { fill: P.dim }));
    var dotx = lgx + 196;
    FY.svg.el('circle', { cx: dotx, cy: lgy, r: 4.5, fill: P.dim, stroke: '#1c241e', 'stroke-width': 1 }, lg);
    svg.appendChild(FY.svg.text(dotx + 10, lgy + 4, 'median', 'viz-axis', { fill: P.dim }));

    // ---- Accessible spoken summary with the key numbers ----
    svg.setAttribute('aria-label',
      'Range bars of six WHO gross-motor milestones on a months axis, each spanning the 1st to 99th percentile with the median marked. ' +
      'Sitting without support, 3.8 to 9.2 months (median 5.9). ' +
      'Standing with assistance, 4.8 to 11.4 months (median 7.4). ' +
      'Hands and knees crawling, 5.2 to 13.5 months (median 8.3), and 4.3 percent were not observed to crawl in this study cohort. ' +
      'Walking with assistance, 5.9 to 13.7 months (median 9.0). ' +
      'Standing alone, 6.9 to 16.9 months (median 10.8). ' +
      'Walking alone, 8.2 to 17.6 months (median 12.0). ' +
      'These are reference-population percentiles, not limits for seeking assessment. Source: WHO Motor Development Study, MGRS, Acta Paediatrica 2006.');

    // Append the svg after the existing figcaption.
    fig.appendChild(svg);

    // ---- Reassuring caption plus source ----
    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent = 'The bars show published first-to-ninety-ninth percentile ages in the selected WHO study population, with the median marked. They do not define every healthy child or establish a safe deadline for referral. Discuss a missed milestone, asymmetry or any lost skill promptly with the clinician. Source: WHO Motor Development Study, Acta Paediatrica 2006, Supplement 450:86 to 95.';
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
/* Selected historical center-based infant childcare prices, OECD full-rate-equivalent leave comparisons and rounded 2017 to 2019 maternal mortality review categories. Dates, eligibility and denominator limits are stated in the chart notes. */
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
    var rows = [['Mississippi',7696],['Alabama',8632],['South Dakota',8632],['Texas',11349],['Florida',13011],['Ohio',13780],['New York',20439],['California',22628],['Maryland',25321],['District of Columbia',26193],['Massachusetts',26343]];
    FY.dataPlot(fig,{bars:true,height:480,xmax:28000,title:'Annual center-based infant care: selected states',description:'2024 report values from Child Care Aware of America, Table I. Statewide averages are historical and not a current provider quote.',rows:rows,headers:['State','Annual infant center price, USD'],note:'These eleven selected values come from Table I of the 2024 affordability analysis. The report mixes 2025 survey responses with older market-rate data for states that did not respond, including several shown here. It is a dated comparison, not a current price quote or a national infant average. The original rent comparison described two children in care, not one infant. <a href="https://info.childcareaware.org/hubfs/Affordability_Analysis_2024.pdf">Child Care Aware of America, Table I and methodology</a>.'});
  };

  /* ====================================================================== */
  /* 2. FY.viz["paid-leave"]                                                 */
  /*    Sorted bar of paid leave for mothers, full-rate-equivalent (FRE)     */
  /*    weeks, OECD PF2.1.A (April 2025). FRE = weeks x average payment rate */
  /*    so a long low-paid entitlement and a short well-paid one compare     */
  /*    honestly. The United States is the lone bar at zero. A note covers   */
  /*    eligibility and the distinction from calendar weeks.                */
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
    var maxV = 82.1;
    var labelW = 150;
    var x0 = labelW, x1 = W - 70;
    var x = S.scale(0, maxV, x0, x1);
    var plotTop = 74, plotBot = H - 92;

    /* titles */
    add(svg, S.text(W / 2, 20, 'Selected national paid-leave provisions', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14.5 }));
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
        add(svg, S.text(x0 + 7, cy + 3.5, '0.0  (national comparison)', 'viz-axis', { 'text-anchor': 'start', fill: P.emerg, 'font-size': 11 }));
      }
    });

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label',
      'Selected OECD national paid-leave provisions available to mothers as of April 2025, in full-rate-equivalent weeks: Estonia 82.1, Norway 39.3, Germany 38.2, Sweden 34.4, Canada 20.1, United Kingdom 11.7, Australia 9.2 and United States zero. ' +
      'Values use a claimant earning the national average. They are not calendar durations or a guarantee of individual eligibility. US state and employer benefits are outside this national comparison.');
    add(fig, svg);

    note(fig,
      'Full-rate-equivalent weeks multiply paid duration by the average replacement rate for a claimant earning the national average. The measure includes maternity, parental and home-care leave available to mothers, excluding leave reserved for fathers. It is not a calendar duration or an entitlement for every parent. Some countries calculate replacement from net earnings, others from gross earnings. US state, employer and occupation-specific benefits need separate checks. ' +
      '<span class="src"><a href="https://webfs.oecd.org/els-com/Family_Database/PF2_1_Parental_leave_systems.pdf">OECD PF2.1.A, column 9 and methodology, rules applicable in April 2025</a>.</span>');

    dataTable(fig, 'Paid leave for mothers, full-rate-equivalent weeks (OECD PF2.1.A, 2025)',
      ['Country', 'Full-rate-equivalent weeks'],
      DATA.map(function (d) { return [d.c, d.us ? '0.0 (national comparison)' : d.v.toFixed(1)]; }));
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
    add(svg, S.text(W / 2, 20, '2017 to 2019 review: mental-health conditions lead', 'viz-label', { 'text-anchor': 'middle', fill: P.parch, 'font-size': 14.5 }));
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


    /* preventability + late-window callout band along the bottom */
    var by = plotBot + 48;
    add(svg, S.el('rect', { x: x0, y: by - 10, width: x1 - x0, height: 1, fill: P.rule, opacity: 0.5 }));
    add(svg, S.text(x0, by + 6, 'Historical review data from thirty-six states, 2017 to 2019.', 'viz-note', { 'text-anchor': 'start', fill: P.parch, 'font-size': 10.5 }));
    add(svg, S.text(x0, by + 20, 'More than 80% were judged preventable in that review.', 'viz-note', { 'text-anchor': 'start', fill: P.parch, 'font-size': 10.5 }));
    add(svg, S.text(x0, by + 34, 'Pregnancy-related complications can occur through the whole year after birth.', 'viz-note', { 'text-anchor': 'start', fill: P.call, 'font-size': 10.5 }));

    /* ---- accessibility + attach ---- */
    svg.setAttribute('aria-label', 'Rounded cause shares in pregnancy-related deaths reviewed by committees in thirty-six US states, 2017 to 2019. Mental-health conditions were the largest specific category, about twenty-three percent. The chart is historical and not a current national mortality rate. More than eighty percent were judged preventable in that review, rather than in every pregnancy.');
    add(fig, svg);

    note(fig, 'This historical chart describes pregnancy-related deaths reviewed by committees in thirty-six states during 2017 to 2019. Cause shares are rounded, and not every state supplied every year. Mental-health conditions were the largest specific category. The CDC reported more than eighty percent judged preventable; this does not guarantee that any individual outcome is preventable. Continue mental and physical health follow-up throughout the year. <span class="src"><a href="https://archive.cdc.gov/www_cdc_gov/media/releases/2022/p0919-pregnancy-related-deaths.html">CDC 2022 summary of 2017 to 2019 data</a>; <a href="https://www.cdc.gov/maternal-mortality/php/data-research/mmria-methods/">review methods</a></span>');

    dataTable(fig, 'US pregnancy-related deaths by underlying cause (CDC MMRC, 2017 to 2019)',
      ['Cause', 'Share of pregnancy-related deaths'],
      CAUSES.map(function (d) { return [d.label, (d.v % 1 ? d.v.toFixed(1) : d.v) + '%']; })
        );
  };
})();


/* module: mortality-pendulum.js */
/* Selected historical mortality points and historical advice examples. Early mortality estimates and registration areas differ from later national data. Lines join selected points; they do not supply annual observations or identify a cause. */
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

  /* Selected registered historical rates and a separate period-linked series.
     No pre-registration estimate band or historical race comparison. */
  FY.viz['infant-mortality'] = function (fig) {
    if (!fig) return;
    var historical = [
      { y: 1915, v: 99.9 }, { y: 1933, v: 58.1 }, { y: 1950, v: 29.2 },
      { y: 1960, v: 26.0 }, { y: 1970, v: 20.0 }, { y: 1980, v: 12.6 },
      { y: 1990, v: 9.2 }, { y: 1997, v: 7.2 }, { y: 2000, v: 6.9 },
      { y: 2010, v: 6.15 }
    ];
    var linked = [{ y: 2017, v: 5.79 }, { y: 2021, v: 5.44 }, { y: 2022, v: 5.61 }, { y: 2023, v: 5.61 }];
    var W = 720, H = 370, svg = S.make(W, H);
    var x = S.scale(1915, 2025, 58, 692), y = S.scale(0, 110, 310, 30);
    [0, 25, 50, 75, 100].forEach(function (v) {
      S.el('line', { x1: 58, y1: y(v), x2: 692, y2: y(v), class: 'viz-grid' }, svg);
      svg.appendChild(S.text(48, y(v) + 4, String(v), 'viz-axis', { 'text-anchor': 'end' }));
    });
    [1915, 1933, 1950, 1975, 2000, 2023].forEach(function (v) {
      svg.appendChild(S.text(x(v), 333, String(v), 'viz-axis', { 'text-anchor': 'middle' }));
    });
    svg.appendChild(S.text(58, 16, 'Deaths under age one per 1,000 live births', 'viz-axis'));
    function plot(rows, color) {
      S.el('path', { d: S.line(rows.map(function (d) { return [x(d.y), y(d.v)]; })), fill: 'none', stroke: color, 'stroke-width': 2.4 }, svg);
      rows.forEach(function (d) { S.el('circle', { cx: x(d.y), cy: y(d.v), r: 3, fill: color }, svg); });
    }
    plot(historical, P.gold);
    plot(linked, P.sky);
    svg.appendChild(S.text(x(1915) + 8, y(99.9) - 7, '99.9 (1915)', 'viz-axis', { fill: P.parch }));
    svg.appendChild(S.text(x(1950) + 8, y(29.2) - 8, '29.2 (1950)', 'viz-axis', { fill: P.parch }));
    svg.appendChild(S.text(x(2023) - 4, y(5.61) - 15, '5.61 (2023, linked)', 'viz-axis', { 'text-anchor': 'end', fill: P.sky }));
    svg.setAttribute('aria-label', 'Selected registered US infant mortality rates. Historical series: 99.9 deaths per 1,000 live births in the 1915 registration area, 58.1 in 1933 and 29.2 in 1950, falling to 6.15 in 2010. Separate period-linked series: 5.79 in 2017, 5.44 in 2021, 5.61 in 2022 and 5.61 in 2023. Early registration coverage changed; these are dated population rates, not individual predictions or estimates of an intervention effect.');
    appendAfterCaption(fig, svg);
    fig.appendChild(noteEl('Gold: selected points from the NCHS historical vital-registration series. Its early registration area expanded; national birth-registration coverage began in 1933. Blue: selected points from the separate period-linked birth/infant-death series, which links certificates and weights unlinked records. Small differences between these data systems are expected. Lines connect selected years, rather than showing every annual fluctuation. This chart does not assign a causal share to medical care, feeding or a campaign. Sources: <a href="https://data.cdc.gov/National-Center-for-Health-Statistics/NCHS-Infant-and-neonatal-mortality-rates-United-St/epev-k6ss">NCHS historical table</a>; <a href="https://www.cdc.gov/nchs/data/nvsr/nvsr74/nvsr74-07.pdf">2023 period-linked report, methods and Table 1</a>.'));
    fig.appendChild(dataTable('Selected registered infant mortality rates', ['Year', 'Deaths per 1,000 live births', 'Data series'], historical.map(function (d) { return [String(d.y), String(d.v), d.y < 1933 ? 'Historical, changing registration area' : 'Historical vital registration']; }).concat(linked.map(function (d) { return [String(d.y), String(d.v), 'Period-linked birth/infant-death']; }))));
  };

  /* Three verified official initiative dates, without uniform advice eras. */
  FY.viz['advice-pendulum'] = function (fig) {
    if (!fig) return;
    var W = 720, H = 252, svg = S.make(W, H);
    var marks = [
      { year: '1981', name: 'International Code of Marketing of Breast-milk Substitutes', detail: 'World Health Assembly adopts the Code', color: P.plum },
      { year: '1991', name: 'WHO/UNICEF Baby-friendly Hospital Initiative', detail: 'Breastfeeding support in maternity and newborn services', color: P.ok },
      { year: '1994', name: 'NICHD Back to Sleep campaign', detail: 'Back sleeping to reduce SIDS risk; expanded in 2012', color: P.sky }
    ];
    S.el('line', { x1: 96, y1: 49, x2: 96, y2: 205, stroke: P.rule, 'stroke-width': 2 }, svg);
    marks.forEach(function (d, i) {
      var yy = 49 + i * 78;
      svg.appendChild(S.text(76, yy + 5, d.year, 'viz-label', { 'text-anchor': 'end', fill: P.goldHi }));
      S.el('circle', { cx: 96, cy: yy, r: 5, fill: d.color }, svg);
      svg.appendChild(S.text(116, yy + 4, d.name, 'viz-label', { fill: P.parch }));
      svg.appendChild(S.text(116, yy + 24, d.detail, 'viz-axis', { fill: P.dim }));
    });
    svg.setAttribute('aria-label', 'Selected official infant-care initiatives, 1981 to 1994. Dates mark adoption or launch, not uniform eras, reversals of every rule, or proof of each initiative’s effect. 1981, World Health Assembly adopts the breast-milk-substitute marketing Code. 1991, WHO and UNICEF launch the Baby-friendly Hospital Initiative. 1994, NICHD launches Back to Sleep, expanded to Safe to Sleep in 2012.');
    appendAfterCaption(fig, svg);
    fig.appendChild(noteEl('Dates mark the adoption or launch of these three initiatives. They do not divide infant care into uniform historical eras, establish that all advice reversed, or measure an initiative’s effect. Sources: <a href="https://www.who.int/publications-detail-redirect/9241541601">WHO Code history</a>; <a href="https://www.unicef.org/media/95191/file/Baby-friendly-hospital-initiative-implementation-guidance-2018.pdf">WHO/UNICEF implementation guidance</a>; <a href="https://safetosleep.nichd.nih.gov/campaign/history">NICHD campaign history</a>.'));
    fig.appendChild(dataTable('Selected official infant-care initiatives', ['Year', 'Initiative', 'Purpose'], marks.map(function (d) { return [d.year, d.name, d.detail]; })));
  };

})();



(function(){
  'use strict';
  var FY=window.FY;
  FY.viz['newt'] = function(fig){
    var controls=document.createElement('div'); controls.className='seg';controls.setAttribute('role','group');controls.setAttribute('aria-label','Delivery method');fig.appendChild(controls);
    var plot=document.createElement('div');fig.appendChild(plot);
    var selected='vaginal',buttons={};
    ['vaginal','cesarean'].forEach(function(mode){var b=document.createElement('button');b.type='button';b.textContent=mode==='vaginal'?'Vaginal birth':'Cesarean birth';b.addEventListener('click',function(){selected=mode;draw();});controls.appendChild(b);buttons[mode]=b;});
    function draw(){
      Object.keys(buttons).forEach(function(k){buttons[k].classList.toggle('on',k===selected);buttons[k].setAttribute('aria-pressed',k===selected?'true':'false');});
      plot.textContent='';
      var points=selected==='vaginal'?[[24,4.2],[48,7.1],[72,6.4]]:[[24,4.9],[48,8],[72,8.6],[96,5.8]];
      FY.dataPlot(plot,{title:'Early weight loss: published median anchors',description:'Selected median weight-loss estimates for exclusively breastfed newborns. Lines connect reported anchors; there are no reconstructed infant percentiles or diagnostic thresholds.',xmax:96,ymax:12,xticks:[0,24,48,72,96],yticks:[0,3,6,9,12],xLabel:'Hours after birth',yLabel:'Loss from birth weight, percent',series:[{label:selected==='vaginal'?'Vaginal birth':'Cesarean birth',points:points}],headers:['Hours after birth','Median loss, percent'],rows:points,note:'Reported median anchors from the Northern California hospital cohort, born at least 36 weeks in 2009 to 2013. Weights after supplemental feeding or discharge were excluded, and the analysis also excluded extreme changes. Lines are straight interpolation, not the complete NEWT nomogram. A median does not establish adequate feeding. Ten percent loss needs assessment, and a feeding problem can occur below it. <a href="https://www.newbornweight.org/wp-content/uploads/2016/12/2015_Breastfed-nomogram_Pediatrics.pdf">Flaherman et al. 2015, methods and results</a>.'});
    }draw();
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
    tbl.innerHTML = '<thead><tr><th>Sample</th><th>Estimate</th></tr></thead><tbody>' + data.map(function (d) { return '<tr><td>' + d[0] + '</td><td>' + (d[3] || d[1] + '%') + '</td></tr>'; }).join('') + '</tbody>';
    fig.appendChild(tbl);
  }

  FY.viz['ppd-spectrum'] = function (fig) {
    hbars(fig, [
      ['All 31 reporting sites', 13.2, P.gold, '13.2%'],
      ['Illinois', 9.7, P.gold, '9.7%'],
      ['Mississippi', 23.5, P.gold, '23.5%']
    ], 30, [0, 10, 20, 30],
      'Selected 2018 PRAMS postpartum depressive-symptom estimates: all 31 reporting sites 13.2 percent, Illinois 9.7 percent and Mississippi 23.5 percent. These are weighted survey estimates of symptoms, not clinical diagnoses or current national prevalence.',
      'PRAMS surveyed women with recent live births two to six months postpartum, averaging four months. These 31 sites met a weighted response-rate threshold of 55 percent. Symptoms meant answering always or often to either of two adapted PHQ-2 questions. Differences between sites can reflect their populations as well as reporting. The figures do not measure anxiety, OCD or psychosis, and a symptom screen needs further assessment.',
      '<a href="https://www.cdc.gov/mmwr/volumes/69/wr/mm6919a2.htm">CDC, 2018 PRAMS methods and Table 1</a>');
  };

  FY.viz['paternal-ppd'] = function (fig) {
    hbars(fig, [
      ['All included father samples', 10.4, P.sky, '10.4%'],
      ['3 to 6 month subgroup', 25.6, P.sky, '25.6%']
    ], 30, [0, 10, 20, 30],
      'Paulson and Bazemore 2010 pooled paternal-depression estimates: 10.4 percent overall, with a 95 percent confidence interval of 8.5 to 12.7 percent; 25.6 percent for the three-to-six-month subgroup, with an interval of 17.3 to 36.1 percent. Different study groups do not establish an individual trajectory.',
      'The review included 43 studies and 28,004 fathers, with varied settings and definitions: 40 studies used self-report measures and three used interviews. The main analysis used each study\'s earliest measurement. The three-to-six-month subgroup contained only three studies, including two higher-risk samples. Its larger estimate does not show that every father\'s symptoms rise over time or establish a universal screening date. Overall 95 percent confidence interval: 8.5 to 12.7 percent; subgroup: 17.3 to 36.1 percent.',
      '<a href="https://jamanetwork.com/journals/jama/fullarticle/185905">Paulson &amp; Bazemore 2010, methods and subgroup analysis</a>');
  };
})();


/* module: sleep-cryout-bedshare.js */
/* Published sleep reference intervals, observational bed-sharing associations and selected sleep-trial outcomes. Reference bands are not diagnostic thresholds. Study populations, comparison groups and limits are stated beside each chart. */
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
       (parent-reported time in bed plus daytime sleep): mean and percentiles.
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
    txt(14, m.top + plotH / 2, 'Reported hours per 24h', 'viz-label', {
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
    txt(lx + 28, ly + 10, 'Percentiles', 'viz-axis', { fill: P.parch });
    txt(lx + 28, ly + 23, '(2nd to 98th)', 'viz-axis', { fill: P.dim });
    // Mean line swatch.
    S.el('line', { x1: lx, y1: ly + 40, x2: lx + 22, y2: ly + 40, stroke: P.goldHi, 'stroke-width': 2.2 }, svg);
    S.el('circle', { cx: lx + 11, cy: ly + 40, r: 3.2, fill: P.goldHi, stroke: INK, 'stroke-width': 1 }, svg);
    txt(lx + 28, ly + 44, 'Average', 'viz-axis', { fill: P.parch });
    // NSF band swatch.
    S.el('rect', { x: lx, y: ly + 56, width: 22, height: 12, fill: P.ok, 'fill-opacity': 0.16, stroke: P.ok, 'stroke-opacity': 0.7, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, svg);
    txt(lx + 28, ly + 66, 'NSF advised', 'viz-axis', { fill: P.parch });
    txt(lx + 28, ly + 79, 'recommended', 'viz-axis', { fill: P.dim });

    fig.appendChild(svg);

    /* ---- aria-label: concise spoken summary with the key numbers ---- */
    svg.setAttribute('aria-label', 'Parent-reported time in bed plus daytime sleep: selected mean and second-to-ninety-eighth percentile values from the Zurich study, ages six to twenty-four months, alongside separate NSF consensus recommended ranges. These descriptive percentiles are not clinical thresholds.');

    /* ---- viz-note: reassuring caption + source ---- */
    var note = el('p', 'viz-note');
    note.textContent = 'The gold band describes parent-reported time in bed plus daytime sleep in the Zurich study from six months onward; the green band shows separate NSF 2015 consensus recommendations. Lines interpolate selected ages. Neither band can establish that unusual sleep is harmless. Discuss persistent concerns, especially with poor feeding, growth changes, breathing problems or unusual sleepiness. Sources: Iglowstein et al., Pediatrics 2003;111:302; Hirshkowitz et al., Sleep Health 2015;1:40 to 43.';
    fig.appendChild(note);

    /* ---- accessible data table fallback ---- */
    var tbl = el('table', 'viz-data');
    var cap = el('caption');
    cap.textContent = 'Parent-reported time in bed plus daytime sleep by age: Iglowstein 2003 mean and 2nd-to-98th percentile band, with the NSF 2015 recommended band.';
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

    /* Each study has its own exposure definitions and reference population.
       Odds ratios cannot be transferred into a personal risk calculator. */
    var ROWS = [
      { label: 'Without 3 specified hazards', sub: 'Blair 2014', or: 1.08, lo: 0.58, hi: 2.01, sig: false, group: 'clean' },
      { label: 'Breastfed infant under 3mo', sub: 'Carpenter 2013', or: 5.1, lo: 2.3, hi: 11.4, sig: true, group: 'clean' },
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
    txt(m.left + plotW / 2, m.top + plotH + 42, 'SIDS odds ratio: study-specific comparison (log scale)', 'viz-label', { 'text-anchor': 'middle', fill: P.dim });
    txt(X(1), m.top - 14, 'no change (OR 1)', 'viz-axis', { 'text-anchor': 'middle', fill: P.parch });

    /* ---- group headers in the left gutter ---- */
    txt(m.left - 12, m.top - 28, 'Selected study contexts', 'viz-axis', { 'text-anchor': 'end', fill: P.ok, 'font-weight': '700' });
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
    svg.setAttribute('aria-label', 'Selected observational associations between bed-sharing contexts and SIDS, on a log odds-ratio axis with confidence intervals. Blair compares with non-co-sleeping overall; Carpenter uses a different population and comparison. Absence of a statistically significant association does not demonstrate safety.');

    /* ---- viz-note ---- */
    var note = el('p', 'viz-note');
    note.textContent = 'The studies use different populations, definitions and comparison groups. Blair’s estimate of 1.08 (0.58 to 2.01) excludes sofa-sharing, smoking and more than two alcohol units, but compares with non-co-sleeping overall, not exclusively room-sharing. It does not prove safety, particularly in young infants. Carpenter’s 5.1 estimate compares breastfed infants under three months with nonsmoking parents and no maternal alcohol or drugs against room-sharing in that low-risk profile. Its 21.6 estimate compares bed-sharing with both parents smoking against the same nonsmoking room-sharing profile, not against room-sharing smokers. Other plotted estimates are context-specific associations, not a transferable personal risk calculator. Follow AAP guidance: back, firm, flat and on a separate infant sleep surface; avoid falling asleep with a baby on a sofa or armchair. Sources: Blair 2014, PLOS ONE e107799; Carpenter 2013, BMJ Open e002299.';
    fig.appendChild(note);

    /* ---- accessible data table fallback ---- */
    var tbl = el('table', 'viz-data');
    var cap = el('caption');
    cap.textContent = 'Selected bed-sharing associations with SIDS, 95% confidence intervals. The studies have different populations and comparison groups.';
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
     found, using the selected outcomes. Three Gradisar 2016
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
        detail: 'Sleep latency improved',
        stat: 'abstract-reported finding',
        foot: 'Gradisar 2016'
      },
      {
        key: 'cortisol',
        title: 'Stress hormone (cortisol)',
        verdict: 'NO RISE DETECTED',
        dir: 'flat',
        good: false,
        detail: 'Measured cortisol declined',
        stat: 'small trial; limited inference',
        foot: 'Gradisar 2016'
      },
      {
        key: 'attach',
        title: 'Attachment at 12 months',
        verdict: 'NONE DETECTED',
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
    txt(16, 24, "Selected sleep-trial outcomes", 'viz-label', { fill: P.parch, 'font-weight': '700' });

    /* ---- Top row: three tiles ---- */
    var pad = 16;
    var gap = 14;
    var rowTop = 40;
    var tileH = 176;
    var tileW = (W - pad * 2 - gap * 2) / 3;

    PANELS.forEach(function (d, i) {
      var tx = pad + i * (tileW + gap);
      var col = d.good ? P.ok : P.dim;

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

    txt(pad, by + 4, 'Child sleep problems (k=5)', 'viz-label', { fill: P.parch, 'font-weight': '700' });
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
    svg.setAttribute('aria-label', 'Selected outcomes: Gradisar’s small randomized trial, 43 infants aged six to sixteen months, found improved sleep and did not detect adverse cortisol or attachment outcomes. Park’s review included ten trials; the sleep-problem estimate pooled five comparisons, with odds ratio 0.51, confidence interval 0.37 to 0.69. Limited samples and follow-up cannot exclude every possible harm.');

    /* ---- viz-note ---- */
    var note = el('p', 'viz-note');
    note.textContent = 'Gradisar’s 2016 trial involved 43 infants aged six to sixteen months. Sleep latency improved; measured cortisol declined in the intervention groups, and attachment differences were not detected at follow-up. These results do not establish that training reduces stress or rule out every harm. The Gradisar findings here come from the accessible abstract; the full numerical results were unavailable. The tiles show qualitative findings. Park’s 2022 review included ten trials; five pooled comparisons supplied its reported-sleep-problem estimate (OR 0.51, 0.37 to 0.69), with no significant pooled maternal-depression benefit. Discuss feeding, health and readiness first; these studies do not support newborn sleep training. Sources: Gradisar et al., Pediatrics e20151486; Park et al., Scientific Reports 12:4172.';
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
      ['Time to fall asleep', 'Improvement reported', 'abstract only; numerical magnitude omitted', 'Gradisar 2016, n=43'],
      ['Salivary cortisol', 'No adverse response detected', 'declines reported; limited inference', 'Gradisar 2016, n=43'],
      ['Attachment at 12 months', 'No difference detected', 'Strange Situation, ns', 'Gradisar 2016'],
      ['Child sleep problems (pooled)', 'Significant reduction', 'OR 0.51 (0.37 to 0.69)', 'Park 2022, k=5; full review includes ten trials'],
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
/* Selected SUID anchors, with a 2015-to-2020 period-linked annual series.
   Other years are interpolated. Different data sources and classifications
   limit comparisons, and no campaign effect is estimated here. */
(function () {
  'use strict';
  var FY = (window.FY = window.FY || { viz: {}, tool: {} });

  // Published total rates are separate from rounded component sums.
  // 1990/2022 death-certificate anchors differ from the 2015-to-2020
  // period-linked series in Shapiro-Mendoza2023, Table1.
  var ANCHORS = [
    { y: 1990, sids: 130.3, unknown: 20.9, assb: 3.4, total: 154.6 },   // PMC6637428 (interp start)
    { y: 2015, sids: 39.3, unknown: 29.7, assb: 23.1, total: 92.0 }, // Published total differs from rounded component sum
    { y: 2016, sids: 37.9, unknown: 31.3, assb: 21.7, total: 90.9 },   // PMC10091458
    { y: 2017, sids: 35.2, unknown: 33.1, assb: 24.5, total: 92.8 },   // PMC10091458
    { y: 2018, sids: 35.0, unknown: 33.4, assb: 22.0, total: 90.4 },   // PMC10091458
    { y: 2019, sids: 33.3, unknown: 30.8, assb: 25.4, total: 89.5 },   // PMC10091458
    { y: 2020, sids: 38.2, unknown: 28.9, assb: 25.0, total: 92.1 },   // PMC10091458
    { y: 2022, sids: 41.7, unknown: 30.8, assb: 28.4, total: 100.9 }    // CDC hub (SUID 100.9)
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
        suid: lo.total + (hi.total - lo.total) * t,
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
    var stackedTop = data.map(function (d) { return [sx(d.y), sy(d.sids + d.unknown + d.assb)]; });
    var suidTop = data.map(function (d) { return [sx(d.y), sy(d.suid)]; });

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
    FY.svg.el('path', { d: areaBetween(unkTop, stackedTop), fill: P.plum, 'fill-opacity': '0.9', stroke: 'none' }, svg);

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

    svg.setAttribute('aria-label',
      'US sudden unexpected infant death rates per 100,000 live births, selected anchors from 1990 to 2022. SUID includes SIDS, unknown cause, and accidental suffocation and strangulation in bed. ' +
      'The 1990 death-certificate total is 154.6. The period-linked 2015 total is 92.0, with SIDS 39.3, unknown 29.7 and ASSB 23.1; rounded components need not add exactly to the published total. ' +
      'The 2022 death-certificate total is 100.9; its rounded component rates are derived from counts. Unmarked years outside 2015 to 2020 are interpolated. Dataset and classification differences limit comparisons; the chart does not isolate any campaign effect.');
    fig.appendChild(svg);

    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent = 'SUID combines SIDS, unknown cause and accidental suffocation and strangulation in bed. The 1990 and 2022 anchors come from death-certificate data; the 2015-to-2020 annual series uses period-linked birth/infant-death files. Other years are interpolated, not observed annual values. Published totals are retained separately because rounded component rates may not add exactly. The 2022 split is calculated from published counts and rounded. Cause labels and datasets differ, and this chart cannot isolate a campaign’s effect or explain later changes.';
    fig.appendChild(note);
    var source = document.createElement('p');
    source.className = 'viz-note';
    source.innerHTML = '<a href="https://stacks.cdc.gov/view/cdc/127170/cdc_127170_DS1.pdf">Shapiro-Mendoza et al. 2023, methods and Table 1</a>; <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6637428/">Erck Lambert et al. 2018</a>; <a href="https://www.cdc.gov/sudden-infant-death/data-research/data/index.html">CDC SUID data</a>. Sources report historical rates, not individual risk.';
    fig.appendChild(source);

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
      { lb: '12 to 17 lb', loKg: 5.4,  hiKg: 7.7,  mg: 80,  ml: 2.5 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.4, mg: 120, ml: 3.75 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 15.9, mg: 160, ml: 5 },
      { lb: '36 to 47 lb', loKg: 16.3, hiKg: 21.3, mg: 240, ml: 7.5 },
      { lb: '48 to 59 lb', loKg: 21.8, hiKg: 26.8, mg: 320, ml: 10 },
      { lb: '60 to 71 lb', loKg: 27.2, hiKg: 32.3, mg: 400, ml: 12.5 },
      { lb: '72 to 95 lb', loKg: 32.7, hiKg: 43.1, mg: 480, ml: 15 },
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
      { lb: '12 to 17 lb', loKg: 5.4,  hiKg: 7.7,  mg: 50,  ml: 1.25 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.4, mg: 75,  ml: 1.875 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 15.9, mg: 100, ml: 2.5 }
    ],
    /* above this weight, infant drops are not the right device */
    useChildrenAboveKg: 15.9
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
      { lb: '12 to 17 lb', loKg: 5.4,  hiKg: 7.7,  mg: 50,  ml: 2.5 },
      { lb: '18 to 23 lb', loKg: 8.1,  hiKg: 10.4, mg: 75,  ml: 3.75 },
      { lb: '24 to 35 lb', loKg: 10.9, hiKg: 15.9, mg: 100, ml: 5 },
      { lb: '36 to 47 lb', loKg: 16.3, hiKg: 21.3, mg: 150, ml: 7.5 },
      { lb: '48 to 59 lb', loKg: 21.8, hiKg: 26.8, mg: 200, ml: 10 },
      { lb: '60 to 71 lb', loKg: 27.2, hiKg: 32.3, mg: 250, ml: 12.5 },
      { lb: '72 to 95 lb', loKg: 32.7, hiKg: 43.1, mg: 300, ml: 15 }
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
      ibuConc: '',       /* exact ibuprofen concentration */
      ageMonths: null
    };

    /* ---- head ---- */
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'Fever and pain dose calculator' }, head);
    el('span', {
      class: 'tool-tag',
      text: 'age, weight and bottle strength',
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

    var ageWrap = el('div', { style: 'display:flex;flex-direction:column;gap:0.35em;' }, controls);
    el('label', { for: 'dose-age', text: 'Actual age in months (required)' }, ageWrap);
    var ageInput = el('input', { id: 'dose-age', type: 'number', min: '0', max: '23', step: '0.1', inputmode: 'decimal', style: 'width:7em;' }, ageWrap);
    var approvedLabel = el('label', { style: 'display:flex;gap:0.6em;align-items:flex-start;margin-top:1em;font-family:var(--font-body);' }, body);
    var approved = el('input', { type: 'checkbox', id: 'dose-approved' }, approvedLabel);
    el('span', { text: 'A clinician has said this medicine is appropriate for my baby and confirmed the dose.' }, approvedLabel);

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
      'Weight selects a band; actual age determines whether the medicine is appropriate. Treat for comfort. ' +
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
      'US liquid strength, 160 mg / 5 mL. Other countries and products can have different strengths.';

    /* ------------------------------------------------------------------
       concentration-select population: only ibuprofen needs a choice.
       For acetaminophen we lock the field (one strength exists) but keep
       it visible so the UI does not jump.
       ------------------------------------------------------------------ */
    function populateConc() {
      clear(concSel);
      if (state.drug === 'acet') {
        concLabel.textContent = 'Concentration';
        var o = el('option', { value: 'acet', text: 'US liquid 160 mg / 5 mL' }, concSel);
        o.selected = true;
        concSel.value = 'acet';
        concSel.disabled = true;
        concHint.textContent = 'Only the stated 160 mg/5 mL product is supported here; check the actual bottle.';
      } else {
        concLabel.textContent = 'Which ibuprofen? (required)';
        concSel.disabled = false;
        var ph = el('option', { value: '', text: 'Choose the bottle you have...' }, concSel);
        ph.disabled = true;
        el('option', { value: 'infant', text: 'Infant drops 50 mg / 1.25 mL' }, concSel);
        el('option', { value: 'child', text: "Children's liquid 100 mg / 5 mL" }, concSel);
        concSel.value = state.ibuConc || '';
        concHint.innerHTML = 'Ibuprofen comes in <b>two</b> strengths. Mixing them up can cause a dosing error, ' +
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
      if (kg > 20) {
        block('That weight is above this infant and child chart. For an older child or adult this size, ' +
          'follow the package directions for their weight or ask a pharmacist.');
        return;
      }

      if (state.ageMonths === null || !isFinite(state.ageMonths) || state.ageMonths < 0 || state.ageMonths >= 24) {
        block('Enter an actual age from birth to under 24 months. Weight cannot tell us a baby’s age.');
        return;
      }
      if (state.ageMonths < 3) {
        block('<b>Contact your clinician.</b> This tool does not dose babies under three months. A rectal temperature of 38C (100.4F) or higher needs immediate assessment, even when the baby looks well. Follow a clinician’s individual instructions.');
        return;
      }
      if (state.drug === 'ibu' && state.ageMonths < 6) {
        block('<b>No ibuprofen before six months in this US tool.</b> Actual age matters regardless of weight. Discuss any exception with the clinician.');
        return;
      }
      if (!approved.checked) {
        block('For a child under two, confirm the medicine and dose with a clinician before using this chart.');
        return;
      }
      if (state.drug === 'acet') {
        renderDoseCard(ACET, kg, lbStr());
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
          'in this table. Ask your pharmacist about a suitable <b>children’s liquid ' +
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
          'ask the clinician about treatment instead. Give only the confirmed medicine and dose.';
      }
    }

    /* ------------------------------------------------------------------
       events
       ------------------------------------------------------------------ */
    function setUnit(u) {
      if (state.unit === u) return;
      /* convert the visible value so the field tracks the same baby */
      var kg = state.weightKg;
      state.unit = u;
      if (u === 'kg') {
        btnKg.classList.add('on'); btnLb.classList.remove('on');
        btnKg.setAttribute('aria-pressed', 'true'); btnLb.setAttribute('aria-pressed', 'false');
        weightInput.max = '20';
        if (isFinite(kg) && kg > 0) weightInput.value = Math.round(kg * 1000) / 1000;
      } else {
        btnLb.classList.add('on'); btnKg.classList.remove('on');
        btnLb.setAttribute('aria-pressed', 'true'); btnKg.setAttribute('aria-pressed', 'false');
        weightInput.max = '44';
        if (isFinite(kg) && kg > 0) weightInput.value = Math.round(kg * LB_PER_KG * 1000) / 1000;
      }
      render();
    }

    function readWeight() {
      var v = parseFloat(weightInput.value);
      if (!isFinite(v) || v <= 0) { state.weightKg = null; }
      else { state.weightKg = (state.unit === 'kg') ? v : (v / LB_PER_KG); }
      render();
    }

    ageInput.addEventListener('input', function () { state.ageMonths = ageInput.value === '' ? null : Number(ageInput.value); render(); });
    approved.addEventListener('change', render);
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
      src.innerHTML = 'This is a table lookup, not a personalized prescription. Actual age gates apply regardless of weight. AAP advises clinician guidance for acetaminophen under two and no ibuprofen under six months without a clinician. ' +
        '<a href="https://www.choa.org/-/media/Files/Childrens/teaching-sheets/acetaminophen-and-ibuprofen-dose-chart.pdf">CHOA April 2025 dose chart</a>; ' +
        '<a href="https://www.healthychildren.org/English/safety-prevention/at-home/medication-safety/Pages/Acetaminophen-for-Fever-and-Pain.aspx">AAP acetaminophen</a>; ' +
        '<a href="https://www.healthychildren.org/English/safety-prevention/at-home/medication-safety/Pages/Ibuprofen-for-Fever-and-Pain.aspx">AAP ibuprofen</a>. Tables can differ slightly; follow the dose your clinician confirms.';
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
   uses checked monthly coefficients. No external libraries. No framework.
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
  var WFA_BOYS = [[0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.197, 5.5675, 0.12385], [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.1108], [0.1257, 7.934, 0.10958], [0.1134, 8.297, 0.10902], [0.1021, 8.6151, 0.10882], [0.0917, 8.9014, 0.10881], [0.082, 9.1649, 0.10891], [0.073, 9.4122, 0.10906], [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976], [0.0413, 10.3108, 0.11007], [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079], [0.0211, 10.9385, 0.11119], [0.0148, 11.143, 0.11164], [0.0087, 11.3462, 0.11211], [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369], [-0.0137, 12.1515, 0.11426]];
  var WFA_GIRLS = [[0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13], [0.0402, 5.8458, 0.12619], [-0.005, 6.4237, 0.12402], [-0.043, 6.8985, 0.12274], [-0.0756, 7.297, 0.12204], [-0.1039, 7.6422, 0.12178], [-0.1288, 7.9487, 0.12181], [-0.1507, 8.2254, 0.12199], [-0.17, 8.48, 0.12223], [-0.1872, 8.7192, 0.12247], [-0.2024, 8.9481, 0.12268], [-0.2158, 9.1699, 0.12283], [-0.2278, 9.387, 0.12294], [-0.2384, 9.6008, 0.12299], [-0.2478, 9.8124, 0.12303], [-0.2562, 10.0226, 0.12306], [-0.2637, 10.2315, 0.12309], [-0.2703, 10.4393, 0.12315], [-0.2762, 10.6464, 0.12323], [-0.2815, 10.8534, 0.12335], [-0.2862, 11.0608, 0.1235], [-0.2903, 11.2688, 0.12369], [-0.2941, 11.4775, 0.1239]];

  /* WHO length-for-age, cm. L = 1 at every age (so only M, S stored). */
  var LFA_BOYS = [[49.8842, 0.03795], [54.7244, 0.03557], [58.4249, 0.03424], [61.4292, 0.03328], [63.886, 0.03257], [65.9026, 0.03204], [67.6236, 0.03165], [69.1645, 0.03139], [70.5994, 0.03124], [71.9687, 0.03117], [73.2812, 0.03118], [74.5388, 0.03125], [75.7488, 0.03137], [76.9186, 0.03154], [78.0497, 0.03174], [79.1458, 0.03197], [80.2113, 0.03222], [81.2487, 0.0325], [82.2587, 0.03279], [83.2418, 0.0331], [84.1996, 0.03342], [85.1348, 0.03376], [86.0477, 0.0341], [86.941, 0.03445], [87.8161, 0.03479]];
  var LFA_GIRLS = [[49.1477, 0.0379], [53.6872, 0.0364], [57.0673, 0.03568], [59.8029, 0.0352], [62.0899, 0.03486], [64.0301, 0.03463], [65.7311, 0.03448], [67.2873, 0.03441], [68.7498, 0.0344], [70.1435, 0.03444], [71.4818, 0.03452], [72.771, 0.03464], [74.015, 0.03479], [75.2176, 0.03496], [76.3817, 0.03514], [77.5099, 0.03534], [78.6055, 0.03555], [79.671, 0.03576], [80.7079, 0.03598], [81.7182, 0.0362], [82.7036, 0.03643], [83.6654, 0.03666], [84.604, 0.03688], [85.5202, 0.03711], [86.4153, 0.03734]];

  /* WHO head-circumference-for-age, cm. L = 1 at every age. */
  var HCA_BOYS = [[34.4618, 0.03686], [37.2759, 0.03133], [39.1285, 0.02997], [40.5135, 0.02918], [41.6317, 0.02868], [42.5576, 0.02837], [43.3306, 0.02817], [43.9803, 0.02804], [44.53, 0.02796], [44.9998, 0.02792], [45.4051, 0.0279], [45.7573, 0.02789], [46.0661, 0.02789], [46.3395, 0.02789], [46.5844, 0.02791], [46.806, 0.02792], [47.0088, 0.02795], [47.1962, 0.02797], [47.3711, 0.028], [47.5357, 0.02803], [47.6919, 0.02806], [47.8408, 0.0281], [47.9833, 0.02813], [48.1201, 0.02817], [48.2515, 0.02821]];
  var HCA_GIRLS = [[33.8787, 0.03496], [36.5463, 0.0321], [38.2521, 0.03168], [39.5328, 0.0314], [40.5817, 0.03119], [41.459, 0.03102], [42.1995, 0.03087], [42.829, 0.03075], [43.3671, 0.03063], [43.83, 0.03053], [44.2319, 0.03044], [44.5844, 0.03035], [44.8965, 0.03027], [45.1752, 0.03019], [45.4265, 0.03012], [45.6551, 0.03006], [45.865, 0.02999], [46.0598, 0.02993], [46.2424, 0.02987], [46.4152, 0.02982], [46.5801, 0.02977], [46.7384, 0.02972], [46.8913, 0.02967], [47.0391, 0.02962], [47.1822, 0.02957]];

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
    rail.innerHTML = '<b>A percentile alone cannot establish health.</b> Measurement quality, feeding, development and the pattern over time all matter. Very low or high values, a change in trajectory, asymmetry or other concerns need clinical context. Recheck a questionable measurement with the care team; do not dismiss a growth change as measurement error. This plot is an educational reference comparison, not a diagnosis or a target.';

    /* a smaller method/source note */
    var srcNote = el('p', {
      class: 'g-src',
      style: 'margin:0.9em 0 0;font-size:0.8rem;color:' + P.dim + ';line-height:1.45',
      html: 'Uses WHO monthly LMS coefficients for weight, recumbent length and head circumference by sex, birth to twenty-four months. All 150 monthly rows were checked against the linked official files. Between monthly rows the coefficients are linearly interpolated, so intermediate-age results are approximations rather than WHO daily-table values. Measurement and age uncertainty limit interpretation. Premature infants may need another standard. <span class="src"><a href="https://www.cdc.gov/growthcharts/who-data-files.htm">WHO files via CDC</a></span>'
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
      var weeksEarly = earlyChk.checked ? Number(weeksInput.value) : 0;
      if (earlyChk.checked && (weeksInput.value === '' || !isFinite(weeksEarly) || weeksEarly < 0 || weeksEarly > 16 || weeksEarly % 1)) {
        bigLine.textContent = 'Enter whole weeks early from zero to sixteen.'; subLine.textContent = 'For gestational ages outside this tool, use the follow-up team’s chart.'; drawChart(sex, measKey, NaN, NaN, NaN); return;
      }
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
        subLine.textContent = 'This WHO chart covers birth to 2 years. Chart choice after two depends on the clinical programme.';
        drawChart(sex, measKey, NaN, NaN, NaN);
        return;
      }
      var ageForCalc = earlyChk.checked && weeksEarly > 0 ? correctedAge : ageNow;
      if (ageForCalc < 0) { bigLine.textContent = 'Before the due date, use the care team’s preterm growth chart.'; subLine.textContent = 'A term birth measurement is not a substitute for a preterm standard.'; drawChart(sex, measKey, NaN, NaN, NaN); return; }

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
        'The median (50th) here is ' + medianShown + ageNote + '. This is a reference comparison, not a diagnosis.';

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

   1) FY.tool['wellbaby-matrix'] : selected official well-child
      programme summaries. National and local services are named
      separately. Contacts, delivery and records link to the
      programme's own guidance. The selector highlights one row;
      this is not a comparable count or a ranking of health systems.

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

   Source notes:
   - Well-baby grid: direct official programme links in each row.
     Checked 4 October 2026. See the country audit in
     docs/editorial/2026-10-03/the-first-year-countries.md.
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

  // These rows describe named programmes, not comparable national totals.
  // Keep each retained factual claim tied to the direct official links.
  var MATRIX = [
  {
    "country": "United States (Bright Futures)",
    "key": "us",
    "ages": "Newborn; 3 to 5 days; by 1 month; 2, 4, 6, 9, 12, 15, 18 and 24 months. Next: 30 months.",
    "who": "Primary care team. Ask your practice which visits can happen at home.",
    "record": "Ask for copies of visit summaries, growth measurements and immunization records.",
    "note": "The AAP framework has 11 age columns from newborn through 24 months, including the newborn assessment, and 12 through 30 months. These are scheduled ages, not a count of visits every child receives.",
    "sources": [
      [
        "AAP periodicity schedule (2025)",
        "https://downloads.aap.org/AAP/PDF/periodicity_schedule.pdf"
      ]
    ]
  },
  {
    "country": "England (Healthy Child Programme)",
    "key": "uk",
    "ages": "Health-visitor reviews: day 1 to 14; 6 to 8 weeks; 9 to 15 months (the 12-month review). Next: 2 to 2.5 years. Physical exams: within 72 hours and at 6 to 8 weeks.",
    "who": "Health visitor and team for reviews; usually a GP for the 6-to-8-week physical exam. Current guidance prefers early health-visitor reviews at home.",
    "record": "Personal Child Health Record (PCHR), the red book.",
    "note": "England has an antenatal review as well as the four postnatal health-visitor reviews. The GP physical exam and vaccine appointments are separate contacts; five reviews is not a total of baby visits through age two.",
    "sources": [
      [
        "England programme (2026)",
        "https://www.gov.uk/government/publications/delivery-of-the-healthy-child-programme/part-2-health-visiting-ages-0-to-5"
      ],
      [
        "NHS reviews and red book",
        "https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/"
      ]
    ]
  },
  {
    "country": "Canada: Ontario (selected services)",
    "key": "ca",
    "ages": "Enhanced well-baby visit at 18 months. Agree the earlier routine visit schedule with the primary care team.",
    "who": "Family physician or other health care provider. Healthy Babies Healthy Children offers home visits to parents who need extra support.",
    "record": "Bring the yellow immunization card to vaccination visits.",
    "note": "This row describes Ontario's enhanced 18-month visit and targeted home support. It is not a Canadian national visit calendar, and the yellow card is an immunization record rather than a complete health booklet.",
    "sources": [
      [
        "Ontario 18-month visit (PDF)",
        "https://files.ontario.ca/mccss-enhanced-18-months-well-baby-visit-fact-sheet-en-2022-02-15.pdf"
      ],
      [
        "Ontario home support (PDF)",
        "https://files.ontario.ca/mccss-healthy-babies-healthy-children-fact-sheet-en-2022-02-14.pdf"
      ],
      [
        "Ontario immunization record (PDF)",
        "https://files.ontario.ca/moh-well-child-toolkit-tips-for-parents-en.pdf"
      ]
    ]
  },
  {
    "country": "Australia: Victoria (MCH)",
    "key": "au",
    "ages": "Initial home visit; 2, 4 and 8 weeks; 4, 8, 12, 18 and 24 months. Next: 3.5 years.",
    "who": "Maternal and child health nurse. First appointment is usually at home, within 2 weeks of birth or arrival home.",
    "record": "My Health, Learning and Development book, the green book.",
    "note": "Victoria lists ten Key Ages and Stages contacts through 3.5 years, nine of them through the two-year contact. This is the MCH nurse programme, not the total of medical and vaccine appointments.",
    "sources": [
      [
        "Victoria MCH service",
        "https://www.betterhealth.vic.gov.au/health/healthyliving/maternal-and-child-health-services"
      ]
    ]
  },
  {
    "country": "Germany (U examinations)",
    "key": "de",
    "ages": "U1: newborn; U2: day 3 to 10; U3: week 4 to 5; U4: 3rd to 4th month of life; U5: 6th to 7th; U6: 10th to 12th; U7: 21st to 24th.",
    "who": "Physician-led U examinations. Ask separately about postnatal midwife support.",
    "record": "Kinderuntersuchungsheft, the Gelbes Heft (yellow booklet); bring the vaccination record too.",
    "note": "U1 to U7 are seven named examinations. The source uses ordinal months of life; arrange the exact appointment window with the practice. Keep the named U appointments separate from vaccine visits and any additional follow-up.",
    "sources": [
      [
        "G-BA child examinations",
        "https://www.g-ba.de/themen/methodenbewertung/kinder/"
      ],
      [
        "G-BA booklet (June 2026)",
        "https://www.g-ba.de/service/versicherteninformationen/untersuchungshefte/"
      ]
    ]
  },
  {
    "country": "France (child preventive examinations)",
    "key": "fr",
    "ages": "Within 8 days; 2nd week; monthly at 1 to 5 months; 8, 11 and 12 months; 16 to 18 months; 23 to 24 months.",
    "who": "A physician in a practice or a Protection maternelle et infantile (PMI) service. Ask PMI about local family support.",
    "record": "Carnet de sante; results may also be recorded in Mon espace sante.",
    "note": "The current official calendar lists twelve examinations through the 23-to-24-month examination. Extra care and vaccination contacts are not counted in that figure.",
    "sources": [
      [
        "Service Public calendar (2026)",
        "https://www.service-public.gouv.fr/particuliers/vosdroits/F35490/0"
      ]
    ]
  },
  {
    "country": "Netherlands: Gooi en Vechtstreek (JGZ)",
    "key": "nl",
    "ages": "Infant clinic contacts are arranged with the family; the regional service allows more or fewer contacts according to need.",
    "who": "Youth-health physicians, nurses and other team members. A newborn screener visits at home for bloodspot and hearing screening.",
    "record": "MijnJeugdenGezin.nl parent portal: growth curves, vaccinations and consultation reports.",
    "note": "This regional service publishes a flexible contact plan. A newborn screening visit and continuing JGZ clinic care are different contacts; the row does not estimate a national visit total or maternity-care hours.",
    "sources": [
      [
        "Regional contact plan",
        "https://www.ggdgv.nl/opvoeding-en-ouderschap/team-jeugd-en-gezin/contactmomenten/"
      ],
      [
        "JGZ team and newborn screening",
        "https://www.ggdgv.nl/opvoeding-en-ouderschap/team-jeugd-en-gezin/"
      ],
      [
        "Parent record portal",
        "https://www.ggdgv.nl/opvoeding-en-ouderschap/team-jeugd-en-gezin/klantportaal-mijnjeugdengezin-nl/"
      ]
    ]
  },
  {
    "country": "Sweden (BVC)",
    "key": "se",
    "ages": "First contact after coming home; frequent contacts at 2 to 8 weeks; usually monthly at 3 to 5 months; 6, 8, 10, 12 and 18 months. Next: 2.5 to 3 years.",
    "who": "BVC nurse, with nurse-and-doctor visits at 4 weeks, 6 months and 12 months. First visit is usually at home; the 8-month home visit is not yet available in every region.",
    "record": "BVC clinical record; many centres also give the child a health book.",
    "note": "1177 describes early frequency according to need and some regional variation. Ask your BVC which early contacts and home visits are scheduled for your family.",
    "sources": [
      [
        "1177 BVC visits and records",
        "https://www.1177.se/barn--gravid/vard-och-stod-for-barn/besok-pa-barnavardscentralen-bvc/"
      ]
    ]
  },
  {
    "country": "Finland: Helsinki (child health clinic)",
    "key": "fi",
    "ages": "1 to 4 and 4 to 6 weeks; 2, 3, 4, 5, 6, 8, 12, 18 and 24 months.",
    "who": "Public-health nurse; nurse and doctor at 4 to 6 weeks and 4, 8 and 18 months. First-baby appointment is at home; families with previous births attend the clinic.",
    "record": "Ask the clinic how to obtain the child's measurements, vaccination history and examination results.",
    "note": "Helsinki lists age-specific checks. Nurse-and-doctor examinations can be joint or separate appointments, so the number of age windows is not necessarily the number of encounters.",
    "sources": [
      [
        "Helsinki age-specific checks",
        "https://www.hel.fi/en/health-and-social-services/child-and-family-services/helsinki-for-families-with-children/with-a-baby/babys-visits-to-the-child-health-clinic"
      ]
    ]
  },
  {
    "country": "Japan: Shinjuku City (Tokyo)",
    "key": "jp",
    "ages": "Programme checks named for 3 to 4, 6 to 7 and 9 to 10 months, and 18 months (medical and dental). The 18-month visit can be completed before age two.",
    "who": "Municipal health centres and contracted medical institutions. Home visitor, such as a midwife or public-health nurse, for babies aged 4 months or younger.",
    "record": "Mother and Child Health Handbook (Boshi Kenko Techo); use its birth reporting form to request the home visit.",
    "note": "This is Shinjuku City's programme. Local invitations and voucher windows govern the appointments. Ask the health centre for a replacement invitation or voucher if yours is missing.",
    "sources": [
      [
        "Shinjuku checkups (Japanese)",
        "https://www.city.shinjuku.lg.jp/soshiki/ushigome-h01_001009.html"
      ],
      [
        "Shinjuku home visit and handbook",
        "https://www.foreign.city.shinjuku.lg.jp/en/kosodate/sukusuku/"
      ]
    ]
  },
  {
    "country": "New Zealand (Well Child Tamariki Ora)",
    "key": "nz",
    "ages": "Maternity-carer assessments in the early weeks; Well Child assessments at 4 to 6 and 8 to 10 weeks, 3 to 4, 5 to 7, 9 to 12 and 15 to 18 months. Next window: 2 to 3 years.",
    "who": "Lead Maternity Carer initially, followed by the Well Child Tamariki Ora provider. Ask your provider where visits will happen.",
    "record": "Well Child Tamariki Ora My Health Book, with maternity and child assessment pages.",
    "note": "The six listed Well Child assessment windows before age two are separate from maternity assessments and vaccine appointments. The book also lists a two-to-three-year assessment and a B4 School Check.",
    "sources": [
      [
        "Official My Health Book and assessment windows",
        "https://healthed.govt.nz/products/well-child-tamariki-ora-my-health-book"
      ]
    ]
  },
  {
    "country": "Ireland (HSE child health checks)",
    "key": "ie",
    "ages": "Newborn exam within 72 hours; first home contact; GP at 2 and 6 weeks; developmental checks at 3, 9 to 11 and 21 to 24 months.",
    "who": "Public-health nurse (PHN) and GP. PHN home visit usually during the first 3 days at home; some midwife-led services hand over later.",
    "record": "Ask the PHN for assessment results and the GP for vaccination records.",
    "note": "The published HSE programme places the later infant developmental check at 9 to 11 months and the toddler check at 21 to 24 months. Vaccinations and extra follow-up add other contacts.",
    "sources": [
      [
        "HSE: birth to 6 months",
        "https://www2.hse.ie/babies-children/checks-milestones/health-checks/until-6-months/"
      ],
      [
        "HSE: 6 to 12 months",
        "https://www2.hse.ie/babies-children/checks-milestones/health-checks/6-12-months/"
      ],
      [
        "HSE: 1 to 2 years",
        "https://www2.hse.ie/babies-children/checks-milestones/health-checks/1-2-years/"
      ]
    ]
  }
];

  FY.tool['wellbaby-matrix'] = function (mount) {
    if (!mount) return;
    mount.textContent = '';
    var head = el('div', { class: 'tool-head' }, mount);
    el('h4', { text: 'Well-child care: ' + MATRIX.length + ' selected programmes' }, head);
    var body = el('div', { class: 'tool-body' }, mount);
    el('p', {
      style: 'font-family:var(--font-body);color:var(--text-dim);margin:0 0 0.9em;line-height:1.55;',
      text: 'Find the programme, contacts and records relevant to you. Some rows describe a national framework; others name one province, state, city or region. Vaccine appointments, maternity care and extra follow-up can add contacts.'
    }, body);

    var selId = 'fy-matrix-country';
    var field = el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:0.6em;margin-bottom:0.6em;' }, body);
    el('label', { for: selId, text: 'Highlight a programme:' }, field);
    var sel = el('select', { id: selId, style: 'flex:0 1 24em;min-width:12em;max-width:100%;' }, field);
    el('option', { value: '', text: 'None (show all)' }, sel);
    MATRIX.forEach(function (r) { el('option', { value: r.key, text: r.country }, sel); });

    var detail = el('div', {
      class: 'tool-out', 'aria-live': 'polite',
      style: 'margin-top:0.4em;min-height:1.5em;font-family:var(--font-body);color:var(--text);line-height:1.55;'
    }, body);
    el('p', { style: 'font-family:var(--font-body);font-size:0.9rem;color:var(--text-dim);line-height:1.5;', text: 'Guidance checked 4 October 2026. Contacts cover birth through about age two; later windows are identified. Scroll the table sideways to see all columns.' }, body);
    var wrap = el('div', { class: 'gtable-wrap' }, body);
    var table = el('table', { class: 'gtable' }, wrap);
    el('caption', {
      style: 'text-align:left;font-family:var(--font-body);color:var(--text-dim);padding:0.4em 0;line-height:1.5;',
      text: 'Selected well-child programmes'
    }, table);
    var thead = el('thead', null, table);
    var htr = el('tr', null, thead);
    ['Jurisdiction / programme', 'Contacts shown', 'Who and where', 'Records or arrangements', 'Official guidance'].forEach(function (h) {
      el('th', { scope: 'col', text: h }, htr);
    });
    var tbody = el('tbody', null, table);
    var rowEls = {};
    function addSources(parent, row) {
      row.sources.forEach(function (source, index) {
        if (index) el('br', null, parent);
        el('a', { href: source[1], text: source[0] }, parent);
      });
    }
    MATRIX.forEach(function (r) {
      var tr = el('tr', { 'data-programme': r.key }, tbody);
      rowEls[r.key] = tr;
      el('th', { scope: 'row', text: r.country }, tr);
      el('td', { text: r.ages }, tr);
      el('td', { text: r.who }, tr);
      el('td', { text: r.record }, tr);
      addSources(el('td', null, tr), r);
    });

    function render(key) {
      MATRIX.forEach(function (r) { rowEls[r.key].classList.remove('hl'); });
      detail.textContent = '';
      if (!key) {
        el('span', { style: 'color:var(--text-dim);', text: 'Select a programme for its scope and scheduling notes. Each row links directly to its official guidance.' }, detail);
        return;
      }
      var row = MATRIX.find(function (r) { return r.key === key; });
      if (!row) return;
      rowEls[key].classList.add('hl');
      el('b', { text: row.country + ': ' }, detail);
      el('span', { text: row.note }, detail);
      el('p', { text: 'Contacts: ' + row.ages }, detail);
      el('p', { text: 'Care: ' + row.who }, detail);
      el('p', { text: 'Records: ' + row.record }, detail);
      addSources(el('p', null, detail), row);
    }
    sel.addEventListener('change', function () { render(sel.value); });
    render('');
    var rail = el('div', { class: 'tool-rail', role: 'note' }, body);
    el('div', {
      html: '<b>Confirm the next appointment and who follows up.</b> Keep a copy of the baby’s results and vaccination record. Ask how to reach the team between scheduled contacts and how records transfer if you move.'
    }, rail);
    mount.setAttribute('role', 'group');
    mount.setAttribute('aria-label', 'Well-child care in ' + MATRIX.length + ' selected programmes. Choose a named jurisdiction to highlight its contacts, delivery and records. Every row has direct official source links. Programmes differ in scope and are not a national ranking.');
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
    el('h4', { text: 'Clinician-directed ORS plan' }, head);

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
      html: '<b>Use this only after a clinician has assessed dehydration and advised WHO Plan B.</b> This page cannot diagnose dehydration. Contact care urgently for a baby under three months, unusual drowsiness, inability to drink, persistent vomiting, much less urine, sunken eyes, green or bloody vomit, or other concerning symptoms. Follow the clinician’s plan and reassessment timing.'
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

    var ageLab = el('div', { style: 'display:flex;flex-direction:column;gap:0.25em;' }, field);
    el('label', { for: 'fy-ors-age', text: 'Actual age in months' }, ageLab);
    var ageInput = el('input', { id: 'fy-ors-age', type: 'number', min: '3', max: '23', step: '0.1', style: 'width:7em;' }, ageLab);
    var planLab = el('label', { style: 'display:flex;gap:0.6em;align-items:flex-start;margin-top:1em;' }, body);
    var plan = el('input', { type: 'checkbox', id: 'fy-ors-approved' }, planLab);
    el('span', { text: 'A clinician has assessed my baby, advised WHO Plan B and arranged reassessment. No urgent warning sign is present.' }, planLab);

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
      var age = ageInput.value === '' ? NaN : Number(ageInput.value);
      if (!isFinite(age) || age < 3 || age >= 24 || !plan.checked) {
        el('p', { class: 'blocked', text: 'Enter an age from three to under twenty-four months and confirm a clinician-directed Plan B. If your baby has warning signs, contact care now.' }, out);
        return;
      }

      if (!input.value || isNaN(raw) || raw <= 0) {
        el('p', {
          style: 'font-family:var(--font-body);color:var(--text-dim);margin:0;line-height:1.55;',
          text: 'Enter age and weight, and confirm the clinician-directed plan. No amount is shown until all required information is supplied.'
        }, out);
        return;
      }

      var kg = toKg(raw);

      var oor = (kg < KG_MIN || kg > KG_MAX);
      if (oor) { el('p', { class: 'blocked', text: 'Weight outside this infant tool. Check the value and unit, then follow the clinician’s individual plan.' }, out); return; }

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
      var currentKg = toKg(parseFloat(input.value));
      unit = u;
      if (isFinite(currentKg) && currentKg > 0) input.value = String(Math.round((u === 'kg' ? currentKg : currentKg * LB_PER_KG) * 1000) / 1000);
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
    ageInput.addEventListener('input', render);
    plan.addEventListener('change', render);
    render();

    // ---------- The "what counts as ORS" caveat ----------
    var rail = el('div', { class: 'tool-rail', role: 'note' }, body);
    el('div', {
      html: '<b>Use real oral rehydration solution, not water, juice, or sports drinks.</b> Plain water lacks the salts a dehydrated baby needs and can dangerously dilute their blood sodium; fruit juice and sports drinks are too sugary and can pull more water into the gut and worsen the diarrhea. Use a commercial low-osmolarity ORS (for example Pedialyte, or a WHO/UNICEF ORS sachet mixed exactly as directed). The modern WHO/UNICEF reduced-osmolarity formula (sodium 75, glucose 75 mmol/L, 245 mOsm/L) cuts stool volume by about 25 percent and the need for IV fluids by about 30 percent versus the old recipe. The BRAT diet and diluting formula are outdated; resume the baby\'s normal age-appropriate feeds early.'
    }, rail);
    el('div', {
      style: 'margin-top:0.5em;font-size:0.85rem;color:' + accentEmerg + ';font-family:var(--font-body);line-height:1.45;',
      text: 'If the baby is under 3 months, cannot keep fluids down, will not drink, or shows any severe-dehydration sign above, stop and call now. This tool calculates a clinician-directed plan. WHO Plan B requires observation and reassessment; a number does not establish suitability for home treatment.'
    }, rail);

    // ---------- Accessible summary on the mount ----------
    mount.setAttribute('role', 'group');
    mount.setAttribute('aria-label',
      'Oral rehydration calculation for a clinician-assessed baby from three to under twenty-four months with an advised WHO Plan B. ' +
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
    t911:    { rank: 1, label: 'Call 911 now', cls: 'emerg', blurb: 'Life-threatening. Call 911 (UK 999) or your local emergency number now. If unresponsive and not breathing normally, call emergency services and follow dispatcher CPR instructions.' },
    ter:     { rank: 2, label: 'Go to the ER now', cls: 'emerg', blurb: 'Be seen at an emergency department now, or call 911 if you cannot get there fast or the baby is getting worse.' },
    t24h:    { rank: 3, label: 'Contact a clinician today', cls: 'call', blurb: 'Call promptly for assessment today. Use urgent care or the emergency department if timely care is unavailable or the baby is worsening.' },
    tadvice: { rank: 4, label: 'Call for advice', cls: 'call', blurb: 'Contact your pediatrician or nurse advice line promptly, especially for a young infant. Watch for any sign above and re-present if it appears.' },
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
    body: 'ANY rectal temperature of 38.0 C (100.4 F) or higher in a baby under 3 months is an emergency, no matter how well the baby looks. Do not give a fever medicine and watch; be seen now. A LOW temperature (under 36.0 C / 96.8 F) in a newborn is just as worrying. A young baby can have a serious infection while still feeding and looking calm, which is exactly why the number alone is the trigger.',
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
      tier: 'ter',
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
      look: 'Fever in an otherwise well baby OVER 6 months with a mild illness',
      tier: 'tself',
      feat: 'An otherwise well, drinking baby older than 6 months with a fever and a mild viral illness may need no medicine at all; treat for comfort, not to chase the number. Watch for any red-flag sign, recheck overnight, and call if it persists beyond 2 to 3 days or the baby looks unwell.',
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
      tier: 'ter',
      feat: 'Count for a full 60 seconds. WHO uses 60/min or more under 2 months and 50/min or more from 2 to under 12 months. Do not delay care to count if breathing looks difficult. Nasal flaring or a new wheeze with visible effort gets a same-day visit; any breathing pause, blue color, grunting, or severe indrawing jumps to 911.',
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
      feat: 'A suspected swallowed button battery or magnet can cause serious internal injury fast: go to the ER now. For a suspected medicine, plant, or chemical swallow, call US Poison Control at 1-800-222-1222 right away (it is free, 24/7, and will tell you whether to watch at home or go in). Call 911 if the baby is drowsy, struggling to breathe, or having a seizure.',
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

   Selected schedules reviewed against linked official sources in October 2026.
   The local grids omit catch-up and many risk-based rules.
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
      key: 'birth', label: 'Birth', offsetMonths: 0, windowText: 'in the hospital',
      antigens: ['HepB'],
      note: 'A stable infant at least 2,000 g with a hepatitis-B-negative mother receives vaccine within 24 hours. Positive or unknown maternal status requires a timed protocol starting within 12 hours; HBIG and low-birth-weight rules must be applied by the birth team.'
    },
    {
      key: '2mo', label: '2 months', offsetMonths: 2, windowText: 'around 2 months (a 1 to 2 month visit)',
      antigens: ['DTaP', 'IPV', 'Hib', 'PCV', 'RV', 'HepB'],
      note: 'The big first round. Often given as a 6-in-1 combination shot plus pneumococcal plus oral rotavirus. The hepatitis B second dose can land at the 1 to 2 month visit.'
    },
    {
      key: '4mo', label: '4 months', offsetMonths: 4, windowText: 'around 4 months',
      antigens: ['DTaP', 'IPV', 'Hib', 'PCV', 'RV'],
      note: 'A near-repeat of the 2-month visit (rotavirus may be a 2-dose or 3-dose series depending on the brand).'
    },
    {
      key: '6mo', label: '6 months', offsetMonths: 6, windowText: 'around 6 months',
      antigens: ['DTaP', 'IPV', 'Hib', 'PCV', 'RV', 'HepB', 'Influenza'],
      note: 'IPV and hepatitis B dose three have a 6-to-18-month window; the final hepatitis B dose cannot be before 24 weeks. Hib and rotavirus dose three depend on product. Annual flu starts at six months; children receiving their first flu series generally need two doses at least four weeks apart.'
    },
    {
      key: '12mo', label: '12 months', offsetMonths: 12, windowText: '12 to 15 months',
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
    "US": {
        "name": "United States (CDC / AAP)",
        "ages": [
            "Birth",
            "2 mo",
            "4 mo",
            "6 mo",
            "12 to 15 mo"
        ],
        "rows": [
            [
                "HepB",
                "Birth protocol",
                "1 to 2 mo",
                "",
                "6 to 18 mo",
                ""
            ],
            [
                "DTaP",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                "15 to 18 mo"
            ],
            [
                "IPV",
                "",
                "2 mo",
                "4 mo",
                "6 to 18 mo",
                ""
            ],
            [
                "Hib",
                "",
                "2 mo",
                "4 mo",
                "if 3-dose primary brand",
                "12 to 15 mo"
            ],
            [
                "PCV",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                "12 to 15 mo"
            ],
            [
                "RV",
                "",
                "2 mo",
                "4 mo",
                "if 3-dose brand",
                ""
            ],
            [
                "MMR",
                "",
                "",
                "",
                "",
                "12 to 15 mo"
            ],
            [
                "Varicella",
                "",
                "",
                "",
                "",
                "12 to 15 mo"
            ],
            [
                "HepA",
                "",
                "",
                "",
                "",
                "12 to 23 mo"
            ],
            [
                "Influenza",
                "",
                "",
                "",
                "annual from 6 mo",
                ""
            ],
            [
                "RSV",
                "Seasonal eligibility; maternal vaccine or infant antibody",
                "",
                "",
                "",
                ""
            ]
        ],
        "foot": "Selected routine antigens, not a complete catch-up schedule. COVID-19 guidance should be checked separately with CDC and AAP. First-season flu often needs two doses at least four weeks apart. Hepatitis B birth timing depends on maternal status and birth weight.",
        "source": "https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html"
    },
    "UK": {
        "name": "United Kingdom (September 2026 schedule)",
        "ages": [
            "Birth",
            "8 wk",
            "12 wk",
            "16 wk",
            "12 mo"
        ],
        "rows": [
            [
                "HepB",
                "at-risk birth protocol",
                "8 wk",
                "12 wk",
                "16 wk",
                ""
            ],
            [
                "DTaP",
                "",
                "8 wk",
                "12 wk",
                "16 wk",
                ""
            ],
            [
                "IPV",
                "",
                "8 wk",
                "12 wk",
                "16 wk",
                ""
            ],
            [
                "Hib",
                "",
                "8 wk",
                "12 wk",
                "16 wk",
                ""
            ],
            [
                "PCV",
                "",
                "",
                "",
                "16 wk",
                "12 mo"
            ],
            [
                "RV",
                "",
                "8 wk",
                "12 wk",
                "",
                ""
            ],
            [
                "MenB",
                "",
                "8 wk",
                "12 wk",
                "",
                "12 mo"
            ],
            [
                "MMRV",
                "",
                "",
                "",
                "",
                "12 mo"
            ],
            [
                "Influenza",
                "",
                "",
                "",
                "clinical risk from 6 mo",
                ""
            ],
            [
                "RSV",
                "Maternal vaccine from 28 weeks; infant risk-based programme",
                "",
                "",
                "",
                ""
            ]
        ],
        "foot": "The eighteen-month six-in-one and MMRV visit applies to the eligible birth cohort (born on or after 1 July 2024). Flu under age two is risk-based; routine preschool flu begins later. At-risk hepatitis B schedules include additional doses and testing.",
        "source": "https://www.gov.uk/government/publications/the-complete-routine-immunisation-schedule/complete-routine-immunisation-schedule-from-1-july-2026"
    },
    "CA": {
        "name": "Canada: British Columbia example",
        "ages": [
            "Birth",
            "2 mo",
            "4 mo",
            "6 mo",
            "12 mo"
        ],
        "rows": [
            [
                "HepB",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "DTaP",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "IPV",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "Hib",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "PCV",
                "",
                "2 mo",
                "4 mo",
                "",
                "12 mo"
            ],
            [
                "RV",
                "",
                "2 mo",
                "4 mo",
                "",
                ""
            ],
            [
                "MenC",
                "",
                "2 mo",
                "",
                "",
                "12 mo"
            ],
            [
                "MMR",
                "",
                "",
                "",
                "",
                "12 mo"
            ],
            [
                "Varicella",
                "",
                "",
                "",
                "",
                "12 mo"
            ],
            [
                "HepA",
                "",
                "",
                "",
                "6 mo: Indigenous children",
                ""
            ],
            [
                "Influenza",
                "",
                "",
                "",
                "annual from 6 mo",
                ""
            ],
            [
                "RSV",
                "Check current provincial eligibility and funding",
                "",
                "",
                "",
                ""
            ]
        ],
        "foot": "This is a British Columbia example, not a Canadian national schedule. Hepatitis A for Indigenous children continues at eighteen months; combination boosters and later doses are outside this first-year grid. Other provinces differ, including hepatitis B, rotavirus and meningococcal timing.",
        "source": "https://www.canada.ca/en/public-health/services/immunization-vaccines/provincial-territorial-routine-vaccination-programs-infants-children.html"
    },
    "AU": {
        "name": "Australia (National Immunisation Program)",
        "ages": [
            "Birth",
            "6 wk / 2 mo",
            "4 mo",
            "6 mo",
            "12 mo"
        ],
        "rows": [
            [
                "HepB",
                "Birth",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "DTaP",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "IPV",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "Hib",
                "",
                "2 mo",
                "4 mo",
                "6 mo",
                ""
            ],
            [
                "PCV",
                "",
                "2 mo (from 6 wk)",
                "4 mo",
                "eligible Indigenous / medical risk",
                "12 mo"
            ],
            [
                "RV",
                "",
                "2 mo",
                "4 mo",
                "",
                ""
            ],
            [
                "MenB",
                "",
                "eligible Indigenous / risk",
                "eligible Indigenous / risk",
                "some medical-risk schedules",
                "eligible Indigenous / risk"
            ],
            [
                "MenACWY",
                "",
                "",
                "",
                "",
                "12 mo"
            ],
            [
                "MMR",
                "",
                "",
                "",
                "",
                "12 mo"
            ],
            [
                "Influenza",
                "",
                "",
                "",
                "annual from 6 mo",
                ""
            ],
            [
                "RSV",
                "Maternal vaccine and infant programmes: check eligibility",
                "",
                "",
                "",
                ""
            ]
        ],
        "foot": "NIP-funded infant MenB is for Aboriginal and Torres Strait Islander children and specified medical-risk groups, rather than every infant; state programmes may add eligibility. Annual flu is funded from six months to under five years; the first series may need two doses. MMRV and further boosters are at eighteen months.",
        "source": "https://www.health.gov.au/childhood-immunisation/immunisation-schedule?language=aus-P1"
    },
    "WHO": {
        "name": "WHO: programme guidance",
        "ages": [
            "Birth",
            "Primary series",
            "Later doses",
            "Eligibility",
            "National plan"
        ],
        "rows": [
            [
                "BCG",
                "where recommended",
                "",
                "",
                "TB context",
                "check"
            ],
            [
                "HepB",
                "within 24 hours",
                "national series",
                "",
                "",
                "check"
            ],
            [
                "DTaP",
                "",
                "can begin at 6 weeks",
                "boosters",
                "",
                "check"
            ],
            [
                "IPV",
                "",
                "polio vaccine mix varies",
                "",
                "",
                "check"
            ],
            [
                "Hib",
                "",
                "2 or 3 primary doses",
                "booster depends on scheme",
                "",
                "check"
            ],
            [
                "PCV",
                "",
                "2 or 3 primary doses",
                "booster depends on scheme",
                "",
                "check"
            ],
            [
                "RV",
                "",
                "product-specific age limits",
                "",
                "",
                "check"
            ],
            [
                "MMR",
                "",
                "first measles at 9 or 12 mo",
                "second dose",
                "",
                "check"
            ]
        ],
        "foot": "WHO provides options for national programmes, not one universal appointment calendar. Polio may use IPV and oral vaccines in different combinations. Use your country’s actual schedule and product rules.",
        "source": "https://www.who.int/teams/immunization-vaccines-and-biologicals/policies/who-recommendations-for-routine-immunization---summary-tables"
    },
    "DE": {
        "name": "Germany (STIKO 2026, term infants)",
        "ages": [
            "Birth",
            "2 mo",
            "4 mo",
            "11 mo",
            "12 mo"
        ],
        "rows": [
            [
                "HepB",
                "exposure protocol if indicated",
                "2 mo",
                "4 mo",
                "11 mo",
                ""
            ],
            [
                "DTaP",
                "",
                "2 mo",
                "4 mo",
                "11 mo",
                ""
            ],
            [
                "IPV",
                "",
                "2 mo",
                "4 mo",
                "11 mo",
                ""
            ],
            [
                "Hib",
                "",
                "2 mo",
                "4 mo",
                "11 mo",
                ""
            ],
            [
                "PCV",
                "",
                "2 mo",
                "4 mo",
                "11 mo",
                ""
            ],
            [
                "RV",
                "",
                "from 6 wk",
                "product-specific",
                "",
                ""
            ],
            [
                "MenB",
                "",
                "2 mo",
                "4 mo",
                "",
                "12 mo"
            ],
            [
                "MMR",
                "",
                "",
                "",
                "11 mo",
                "second at 15 mo"
            ],
            [
                "Varicella",
                "",
                "",
                "",
                "11 mo",
                "second at 15 mo"
            ],
            [
                "RSV",
                "Nirsevimab timed to first RSV season",
                "",
                "",
                "",
                ""
            ]
        ],
        "foot": "Premature infants receive an additional three-month dose of the six-in-one and pneumococcal series. The former twelve-month MenC recommendation was removed; MenACWY is now a routine adolescent dose at twelve to fourteen years. Rotavirus has product-specific completion limits.",
        "source": "https://edoc.rki.de/bitstream/handle/176904/13181/EB-4-2026.pdf"
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
  function addMonths(dt, n) { var first = new Date(dt.getFullYear(), dt.getMonth() + n, 1); var last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); return new Date(first.getFullYear(), first.getMonth(), Math.min(dt.getDate(), last)); }
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
    rail.innerHTML = '<b>Confirm doses with the current local schedule and the vaccination record.</b> This tool shows selected routine antigens and planning ages. It does not apply catch-up rules, minimum intervals, contraindications or every risk-based recommendation. A date passing does not mean a dose was given. US COVID-19 recommendations differ between CDC and AAP; discuss the current guidance with the clinician.';
    body.appendChild(rail);

    /* ---------- source line ---------- */
    var src = el('p');
    src.className = 'asof';
    src.style.cssText = 'margin-top:0.9rem;';
    src.textContent = 'Schedule sources checked 4 October 2026. Open the selected country’s source below before using the grid.';
    body.appendChild(src);

    /* ---------- render logic ---------- */
    function render() {
      // clear output
      while (out.firstChild) out.removeChild(out.firstChild);

      var countryKey = cSel.value;
      var country = COUNTRIES[countryKey] || COUNTRIES.US;
      var birth = parseDate(dIn.value);
      if (dIn.value && (!birth || birth > startOfToday())) { out.appendChild(el('p', 'blocked', 'Enter a valid birth date that is today or earlier. No timeline is calculated for a future date.')); return; }

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
        var due = addMonths(birth, v.offsetMonths);
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
        var tag = el('span', null, past ? 'age passed; check record' : 'planning date');
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
      rsv.innerHTML = '<b>RSV protection:</b> eligibility depends on season, infant age, maternal vaccination and medical risk. Most infants need either maternal vaccination or an infant antibody. An antibody is generally recommended if maternal vaccination was absent, unknown or less than fourteen days before birth; uncommon exceptions may justify both. Ask the clinician to apply the current CDC protocol. Annual <b>flu</b> begins at six months; the first season may require two doses at least four weeks apart.';
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
      if (country.source) {
        var sourceLink = el('a', null, 'Official schedule source'); sourceLink.href = country.source; section.appendChild(sourceLink);
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
   (b) a US measles-cases-by-year mini line ending at 2,289 in 2025 (vs 285 in
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
    //     2024=285 and 2025=2,289 confirmed in the immunization deep-dives.
    var cases = [
      [2010, 63], [2011, 220], [2012, 55], [2013, 187], [2014, 667],
      [2015, 188], [2016, 86], [2017, 120], [2018, 375], [2019, 1274],
      [2020, 13], [2021, 49], [2022, 121], [2023, 59], [2024, 285],
      [2025, 2289]
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
    txt(La.x, 30, 'Modeled deaths averted', 'viz-axis', { fill: P.gold, 'letter-spacing': '0.08em' });
    txt(La.x, 50, '154 million, 1974 to 2024', 'viz-axis', { fill: P.parch });

    // Right: short header line; the axis titles carry the specifics.
    txt(Rb.x - 42, 30, 'Dated US surveillance', 'viz-axis', { fill: P.gold, 'letter-spacing': '0.08em' });
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
    txt(barX + barW / 2, (base + yMeaslesTop) / 2 + 4, '94M', 'viz-label', { 'text-anchor': 'middle', style: 'fill:var(--bg)!important', fill: '#1d231e', 'font-weight': '700' });
    txt(barX + barW / 2, (yMeaslesTop + yTotalTop) / 2 + 4, '60M', 'viz-axis', { 'text-anchor': 'middle', style: 'fill:var(--bg)!important', fill: '#1d231e', 'font-weight': '700' });

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

    var maxCases = 2289;            // 2025 record sets the top of the left axis
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
    txt(Rb.x + Rb.w, threshY - 4, '95% coverage guide', 'viz-axis', { 'text-anchor': 'end', fill: P.emerg });

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

    // Mark the two endpoints the spec calls out: 2024 (285) and 2025 (2,289).
    var p2024 = casePts[casePts.length - 2], p2025 = casePts[casePts.length - 1];
    S.el('circle', { cx: p2024[0], cy: p2024[1], r: '3', fill: P.gold }, svg);
    txt(p2024[0] - 4, p2024[1] - 6, '285', 'viz-axis', { 'text-anchor': 'end', fill: P.parch });
    txt(p2024[0] - 4, p2024[1] + 7, 'in 2024', 'viz-axis', { 'text-anchor': 'end', fill: P.dim });
    S.el('circle', { cx: p2025[0], cy: p2025[1], r: '4', fill: P.goldHi, stroke: '#1d231e', 'stroke-width': '1' }, svg);
    txt(p2025[0] + 5, 34, '2,289', 'viz-label', { 'text-anchor': 'end', fill: P.goldHi, 'font-weight': '700' });
    txt(p2025[0] + 5, 50, 'in 2025', 'viz-axis', { 'text-anchor': 'end', fill: P.dim });

    // Flag the 2019 spike for context (largest since elimination until 2025).
    var p2019 = casePts[9];
    txt(p2019[0], p2019[1] - 7, '1,274 in 2019', 'viz-axis', { 'text-anchor': 'middle', fill: P.dim });

    // Attach the SVG after the figcaption.
    fig.appendChild(svg);

    /* ---------- Accessible spoken summary with the key numbers ---------- */
    svg.setAttribute('aria-label',
      'Two dated charts with different populations. Left: a model estimates vaccination averted an estimated 154 million deaths from 1974 to 2024, ' +
      'with measles vaccine alone accounting for about 94 million, over 60 percent of the total. ' +
      'Right: US measles cases rose from 285 in 2024 to 2,289 in 2025, the most since 1991, ' +
      'Separately, kindergarten two-dose MMR coverage slipped from 95.2 percent in 2019 to 2020 down to 92.5 percent in 2024 to 2025, ' +
      'The 95 percent line is an approximate community coverage guide, not an exact national threshold.');

    /* ---------- Reassuring / explanatory caption + source ---------- */
    var note = document.createElement('p');
    note.className = 'viz-note';
    note.textContent = 'The left panel is Shattock’s modeled estimate of deaths averted by vaccination from 1974 to 2024, not a direct count. The right panel retains US annual case counts through 2025 (2,289, preliminary CDC snapshot checked 4 October 2026) and kindergarten coverage through school year 2024 to 2025. They cover different populations and do not quantify a causal effect of the national coverage decline. Community protection depends on local immunity, importations and clustering; 95 percent is a coverage guide, not a guarantee. Sources: Shattock et al., Lancet 2024;403:2307; CDC Measles Cases and Outbreaks; CDC SchoolVaxView.';
    fig.appendChild(note);

    /* ---------- Accessible data table (the fallback for the numbers) ---------- */
    var tbl = document.createElement('table');
    tbl.className = 'viz-data';

    var capEl = document.createElement('caption');
    capEl.textContent = 'US measles cases per year with kindergarten 2-dose MMR coverage, plus the 154 million modeled deaths-averted breakdown.';
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
      '<tr><th scope="row">Approximate community coverage target</th><td>n/a</td><td>~95%</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (measles vaccine)</th><td colspan="2">~' + MEASLES_SAVED + ' million</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (all other vaccines)</th><td colspan="2">~' + OTHER_SAVED + ' million</td></tr>' +
      '<tr><th scope="row">Lives saved 1974 to 2024 (total)</th><td colspan="2">' + TOTAL_SAVED + ' million</td></tr>';
    tbl.appendChild(tfoot);

    fig.appendChild(tbl);
  };
})();
