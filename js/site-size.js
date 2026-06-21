/* "Size on disk" - the deployed weight of the site today, and how it has grown.
   Reads window.SITE_SIZE (baked by tools/build-site-size.mjs): a total, a per-kind
   breakdown, and one [unixSec, bytes] sample per day. Renders a stat row, an area
   chart of the growth curve, and a one-line breakdown into #ss-root. No deps. */
(function () {
  'use strict';
  var D = window.SITE_SIZE;
  var root = document.getElementById('ss-root');
  if (!D || !root || !D.series || D.series.length < 2) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = !window.matchMedia || matchMedia('(hover: hover) and (pointer: fine)').matches;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmt(n, dp) {
    if (n >= 1 << 30) return (n / (1 << 30)).toFixed(dp == null ? 2 : dp) + ' GB';
    if (n >= 1 << 20) { var m = n / (1 << 20); return (m >= 100 ? Math.round(m) : m.toFixed(1)) + ' MB'; }
    if (n >= 1 << 10) return Math.round(n / (1 << 10)) + ' KB';
    return n + ' B';
  }
  function dateLabel(sec) { var d = new Date(sec * 1000); return MON[d.getMonth()] + ' ' + d.getDate(); }

  var series = D.series.slice().sort(function (a, b) { return a[0] - b[0]; });
  var n = series.length;
  var first = series[0][1], last = series[n - 1][1], maxV = 0;
  for (var i = 0; i < n; i++) if (series[i][1] > maxV) maxV = series[i][1];
  var biggest = (D.categories && D.categories[0]) || null;

  // ---------- stat row (reuses the .gh-stat look) ----------
  var stats = document.createElement('div');
  stats.className = 'ss-stats';
  function stat(nStr, lStr) { return '<div class="gh-stat"><span class="n">' + nStr + '</span><span class="l">' + lStr + '</span></div>'; }
  stats.innerHTML =
    stat(fmt(last, 1), 'the whole site today, on disk') +
    stat((last / first).toFixed(1) + '×', 'bigger than on ' + dateLabel(series[0][0]) + ', when this history starts') +
    (biggest ? stat(fmt(biggest.bytes, 0), 'of it ' + biggest.name.toLowerCase()) : '');
  root.appendChild(stats);

  // ---------- area chart ----------
  var W = 720, H = 230, padL = 6, padR = 16, padT = 16, padB = 26;
  var plotW = W - padL - padR, plotH = H - padT - padB, baseY = H - padB;
  // a "nice" y ceiling a touch above the peak
  var step = maxV > (700 << 20) ? (256 << 20) : (100 << 20);
  var yMax = Math.ceil(maxV * 1.08 / step) * step;
  var X = function (i) { return padL + (i / (n - 1)) * plotW; };
  var Y = function (v) { return padT + (1 - v / yMax) * plotH; };

  var linePts = [], areaPts = [];
  for (var j = 0; j < n; j++) { var x = X(j), y = Y(series[j][1]); linePts.push(x.toFixed(1) + ',' + y.toFixed(1)); }
  var areaD = 'M' + X(0).toFixed(1) + ',' + baseY + ' L' + linePts.join(' L') + ' L' + X(n - 1).toFixed(1) + ',' + baseY + ' Z';
  var lineD = 'M' + linePts.join(' L');

  // y gridlines + labels
  var grid = '', ylab = '';
  for (var g = step; g <= yMax + 1; g += step) {
    var gy = Y(g).toFixed(1);
    grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" class="ss-grid"/>';
    ylab += '<text x="' + (W - padR + 3) + '" y="' + (Y(g) + 3).toFixed(1) + '" class="ss-ylab">' + fmt(g, 0) + '</text>';
  }
  // x labels: first, last, and a couple in between
  var xlab = '';
  var marks = [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1].filter(function (v, k, a) { return a.indexOf(v) === k; });
  marks.forEach(function (idx) {
    var anchor = idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle';
    xlab += '<text x="' + X(idx).toFixed(1) + '" y="' + (H - 8) + '" class="ss-xlab" text-anchor="' + anchor + '">' + dateLabel(series[idx][0]) + '</text>';
  });

  var endX = X(n - 1).toFixed(1), endY = Y(last).toFixed(1);
  var svg =
    '<svg class="ss-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="The site has grown from ' + fmt(first, 1) + ' to ' + fmt(last, 1) + ' since ' + dateLabel(series[0][0]) + '.">' +
      '<defs><linearGradient id="ssg" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="var(--accent)" stop-opacity="0.34"/>' +
        '<stop offset="1" stop-color="var(--accent)" stop-opacity="0.02"/>' +
      '</linearGradient>' +
      '<clipPath id="ssclip"><rect class="ss-wipe" x="0" y="0" width="' + W + '" height="' + H + '"/></clipPath></defs>' +
      grid + ylab + xlab +
      '<g clip-path="url(#ssclip)">' +
        '<path d="' + areaD + '" fill="url(#ssg)"/>' +
        '<path d="' + lineD + '" class="ss-line"/>' +
      '</g>' +
      '<circle class="ss-end" cx="' + endX + '" cy="' + endY + '" r="3.5"/>' +
      '<g class="ss-hover" style="opacity:0"><line class="ss-guide" y1="' + padT + '" y2="' + baseY + '"/><circle class="ss-dot" r="3.5"/></g>' +
    '</svg>' +
    '<div class="ss-read" aria-hidden="true"></div>';

  var chart = document.createElement('div');
  chart.className = 'ss-chart';
  chart.innerHTML = svg;
  root.appendChild(chart);

  // ---------- one-line breakdown ----------
  if (D.categories && D.categories.length) {
    var bd = document.createElement('p');
    bd.className = 'ss-break';
    bd.innerHTML = D.categories.filter(function (c) { return c.bytes >= (1 << 20); })
      .map(function (c) { return '<b>' + fmt(c.bytes, 0) + '</b> ' + c.name; }).join('<span class="ss-sep">·</span>');
    root.appendChild(bd);
  }

  // ---------- draw-on ----------
  var wipe = chart.querySelector('.ss-wipe');
  if (!reduce && wipe && !document.hidden) {
    wipe.setAttribute('width', 0);                 // collapse first, then wipe open on scroll-in
    var t0 = null, dur = 900;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var stepFn = function (ts) {
      if (t0 == null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      wipe.setAttribute('width', (ease(k) * W).toFixed(1));
      if (k < 1) requestAnimationFrame(stepFn);
    };
    // only start when scrolled into view, so the wipe is seen
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        for (var k = 0; k < es.length; k++) if (es[k].isIntersecting) { requestAnimationFrame(stepFn); io.disconnect(); break; }
      }, { threshold: 0.3 });
      io.observe(chart);
    } else requestAnimationFrame(stepFn);
  }

  // ---------- hover readout (fine pointers only) ----------
  if (fine) {
    var svgEl = chart.querySelector('.ss-svg'), hov = chart.querySelector('.ss-hover'),
      guide = chart.querySelector('.ss-guide'), hdot = chart.querySelector('.ss-dot'), read = chart.querySelector('.ss-read');
    var nearest = function (clientX) {
      var r = svgEl.getBoundingClientRect();
      var vx = (clientX - r.left) / r.width * W;            // client px -> viewBox x
      var idx = Math.round((vx - padL) / plotW * (n - 1));
      return Math.max(0, Math.min(n - 1, idx));
    };
    svgEl.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var idx = nearest(e.clientX), vx = X(idx), vy = Y(series[idx][1]);
      guide.setAttribute('x1', vx.toFixed(1)); guide.setAttribute('x2', vx.toFixed(1));
      hdot.setAttribute('cx', vx.toFixed(1)); hdot.setAttribute('cy', vy.toFixed(1));
      hov.style.opacity = '1';
      read.innerHTML = '<b>' + fmt(series[idx][1], 1) + '</b> <span>' + dateLabel(series[idx][0]) + '</span>';
      read.style.opacity = '1';
    });
    svgEl.addEventListener('pointerleave', function () { hov.style.opacity = '0'; read.style.opacity = '0'; });
  }
})();
