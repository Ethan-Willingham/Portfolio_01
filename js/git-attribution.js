/* "Which mind built which page" — the per-post model-attribution visualization.
   A family.co-flavoured reading of js/git-attribution-data.js: a grid of rounded
   app-icon tiles (one per post, each a conic ring of the models that built it),
   a single-focus tray that springs up on tap, an Edits<->Tokens toggle whose
   percentages morph and count. All motion is gated behind prefers-reduced-motion.
   Renders into #ma-root; no external deps. */
(function () {
  'use strict';
  var DATA = window.GIT_ATTRIBUTION;
  var root = document.getElementById('ma-root');
  if (!DATA || !root) return;

  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MODELS = DATA.models;
  var POSTS = DATA.posts;
  var MID = {};
  MODELS.forEach(function (m) { MID[m.id] = m; });

  var metric = 'edits'; // 'edits' | 'tokens'

  // ---------- formatting ----------
  function fmtEdits(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtTok(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return Math.round(n).toString();
  }
  function fmtVal(n) { return metric === 'tokens' ? fmtTok(n) : fmtEdits(n); }
  function fmtFull(n) { return metric === 'tokens' ? fmtTok(n) + ' tokens' : fmtEdits(n) + (n === 1 ? ' change' : ' changes'); }
  function fmtDate(s) { // "2026-06-10" -> "Jun 10"
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var p = s.split('-'); return mo[(+p[1]) - 1] + ' ' + (+p[2]);
  }
  function dateRange(a, b) {
    if (a === b) return fmtDate(a);
    var pa = a.split('-'), pb = b.split('-');
    if (pa[1] === pb[1]) { var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return mo[(+pa[1]) - 1] + ' ' + (+pa[2]) + '–' + (+pb[2]); }
    return fmtDate(a) + ' – ' + fmtDate(b);
  }

  // value of a model within a post for the current metric
  function val(post, mid) { var r = post.models[mid]; return r ? (metric === 'tokens' ? r.tokens : r.edits) : 0; }
  function total(post) { return metric === 'tokens' ? post.tokens : post.edits; }
  // ordered [{m, v, pct}] desc, only models that contributed
  function split(post) {
    var t = total(post) || 1;
    var arr = Object.keys(post.models).map(function (mid) {
      return { m: MID[mid], v: val(post, mid), pct: val(post, mid) / t * 100 };
    }).filter(function (x) { return x.m && x.v > 0; });
    arr.sort(function (a, b) { return b.v - a.v; });
    return arr;
  }
  function conic(parts) {
    if (!parts.length) return '#3a443b';
    var stops = [], acc = 0;
    parts.forEach(function (p) { var to = acc + p.pct; stops.push(p.m.color + ' ' + acc.toFixed(2) + '% ' + to.toFixed(2) + '%'); acc = to; });
    return 'conic-gradient(from -90deg, ' + stops.join(', ') + ')';
  }

  // ---------- animated number (interruptible) ----------
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  function animNum(el, to, fmt) {
    var from = el._v == null ? 0 : el._v;
    el._v = to;
    if (REDUCE || from === to) { el.textContent = fmt(to); return; }
    if (el._raf) cancelAnimationFrame(el._raf);
    var t0 = null, dur = 620;
    function step(ts) {
      if (t0 == null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = easeOut(k);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step); else el._raf = 0;
    }
    el._raf = requestAnimationFrame(step);
  }

  // ---------- build: model legend ----------
  var legend = document.createElement('div');
  legend.className = 'ma-minds';
  MODELS.forEach(function (m) {
    var built = m.posts > 0;
    var chip = document.createElement('div');
    chip.className = 'ma-mind' + (built ? '' : ' is-minor');
    chip.innerHTML =
      '<span class="ma-mind-dot" style="background:' + m.color + '"></span>' +
      '<span class="ma-mind-name">' + m.label + '</span>' +
      '<span class="ma-mind-fuel">' + fmtTok(m.tokens) + ' · $' + m.cost.toLocaleString('en-US') + '</span>' +
      '<span class="ma-mind-posts">' + (built ? m.posts + (m.posts === 1 ? ' post' : ' posts') : 'tooling only') + '</span>';
    legend.appendChild(chip);
  });

  // ---------- build: metric toggle ----------
  var controls = document.createElement('div');
  controls.className = 'ma-controls';
  controls.innerHTML =
    '<div class="ma-toggle" role="tablist" aria-label="Choose how to measure each model\'s share">' +
    '<button class="ma-seg is-on" role="tab" aria-selected="true" data-m="edits">Changes</button>' +
    '<button class="ma-seg" role="tab" aria-selected="false" data-m="tokens">Tokens</button>' +
    '<span class="ma-seg-glider" aria-hidden="true"></span>' +
    '</div>' +
    '<p class="ma-controls-note" id="ma-note">Share of file changes each model made to a post.</p>';

  // ---------- build: tile grid ----------
  var grid = document.createElement('div');
  grid.className = 'ma-grid';
  POSTS.forEach(function (post, i) {
    var b = document.createElement('button');
    b.className = 'ma-tile';
    b.setAttribute('data-key', post.key);
    b.style.setProperty('--i', i);
    if (post.kind === 'archived') b.classList.add('is-arch');
    b.innerHTML =
      '<span class="ma-donut"><span class="ma-donut-hole"><span class="ma-donut-val"></span></span></span>' +
      '<span class="ma-tile-title">' + post.label + '</span>' +
      '<span class="ma-tile-sub"></span>';
    grid.appendChild(b);
    post._el = b;
    paintTile(post);
  });

  function paintTile(post) {
    var parts = split(post);
    var d = post._el.querySelector('.ma-donut');
    d.style.background = conic(parts);
    animNum(post._el.querySelector('.ma-donut-val'), total(post), fmtVal);
    // the italic title already marks archived (timeline-legend convention), so the sub stays a compact date
    post._el.querySelector('.ma-tile-sub').textContent = dateRange(post.first, post.last);
  }

  // ---------- build: tray ----------
  var scrim = document.createElement('div');
  scrim.className = 'ma-scrim';
  var tray = document.createElement('div');
  tray.className = 'ma-tray';
  tray.setAttribute('role', 'dialog');
  tray.setAttribute('aria-modal', 'true');
  tray.setAttribute('aria-label', 'Post detail');
  tray.innerHTML =
    '<button class="ma-tray-x" aria-label="Close">' +
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
    '<div class="ma-tray-head">' +
    '<span class="ma-donut ma-donut-lg"><span class="ma-donut-hole"><span class="ma-donut-val"></span></span></span>' +
    '<div class="ma-tray-id"><span class="ma-tray-kind"></span><h3 class="ma-tray-title"></h3><span class="ma-tray-when"></span></div>' +
    '</div>' +
    '<div class="ma-tray-bar" aria-hidden="true"></div>' +
    '<div class="ma-tray-rows"></div>' +
    '<a class="ma-tray-link" target="_self">Open the post <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M5 3h8v8M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';

  var openPost = null;
  function openTray(post) {
    openPost = post;
    var parts = split(post);
    tray.querySelector('.ma-tray-kind').textContent = post.kind === 'archived' ? 'Archived post' : 'Post';
    tray.querySelector('.ma-tray-kind').className = 'ma-tray-kind' + (post.kind === 'archived' ? ' is-arch' : '');
    tray.querySelector('.ma-tray-title').textContent = post.label;
    tray.querySelector('.ma-tray-when').textContent = 'Built ' + dateRange(post.first, post.last);
    var link = tray.querySelector('.ma-tray-link');
    if (post.href) { link.href = post.href.indexOf('/') === 0 ? post.href : '/' + post.href; link.style.display = ''; }
    else link.style.display = 'none';
    paintTray(post, parts);
    scrim.classList.add('is-on');
    tray.classList.add('is-on');
    document.addEventListener('keydown', onKey);
    tray.querySelector('.ma-tray-x').focus();
  }
  function paintTray(post, parts) {
    parts = parts || split(post);
    tray.querySelector('.ma-donut-lg').style.background = conic(parts);
    animNum(tray.querySelector('.ma-donut-lg .ma-donut-val'), total(post), fmtVal);
    // stacked bar
    var bar = tray.querySelector('.ma-tray-bar');
    bar.innerHTML = '';
    parts.forEach(function (p) {
      var seg = document.createElement('span');
      seg.className = 'ma-barseg';
      seg.style.background = p.m.color;
      seg.title = p.m.label + ' ' + p.pct.toFixed(0) + '%';
      bar.appendChild(seg);
      requestAnimationFrame(function () { seg.style.width = p.pct.toFixed(2) + '%'; });
    });
    // rows
    var rows = tray.querySelector('.ma-tray-rows');
    rows.innerHTML = '';
    parts.forEach(function (p, idx) {
      var row = document.createElement('div');
      row.className = 'ma-row';
      row.style.setProperty('--i', idx);
      row.innerHTML =
        '<span class="ma-row-dot" style="background:' + p.m.color + '"></span>' +
        '<span class="ma-row-name">' + p.m.label + '</span>' +
        '<span class="ma-row-val"></span>' +
        '<span class="ma-row-pct"></span>';
      rows.appendChild(row);
      animNum(row.querySelector('.ma-row-val'), p.v, function (x) { return fmtFull(x); });
      animNum(row.querySelector('.ma-row-pct'), p.pct, function (x) { return Math.round(x) + '%'; });
    });
  }
  function closeTray() {
    openPost = null;
    scrim.classList.remove('is-on');
    tray.classList.remove('is-on');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeTray(); }

  grid.addEventListener('click', function (e) {
    var t = e.target.closest('.ma-tile'); if (!t) return;
    var post = POSTS.filter(function (p) { return p.key === t.getAttribute('data-key'); })[0];
    if (post) openTray(post);
  });
  scrim.addEventListener('click', closeTray);
  tray.querySelector('.ma-tray-x').addEventListener('click', closeTray);

  // ---------- metric toggle ----------
  controls.querySelector('.ma-toggle').addEventListener('click', function (e) {
    var seg = e.target.closest('.ma-seg'); if (!seg) return;
    var m = seg.getAttribute('data-m'); if (m === metric) return;
    metric = m;
    var segs = controls.querySelectorAll('.ma-seg');
    segs.forEach(function (s) {
      var on = s.getAttribute('data-m') === metric;
      s.classList.toggle('is-on', on); s.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    controls.querySelector('.ma-toggle').classList.toggle('is-tokens', metric === 'tokens');
    document.getElementById('ma-note').textContent = metric === 'tokens'
      ? 'Share of output tokens each model actually wrote into a post.'
      : 'Share of file changes each model made to a post.';
    POSTS.forEach(paintTile);
    if (openPost) paintTray(openPost);
  });

  // ---------- mount ----------
  root.appendChild(legend);
  root.appendChild(controls);
  root.appendChild(grid);
  root.appendChild(scrim);
  root.appendChild(tray);
})();
