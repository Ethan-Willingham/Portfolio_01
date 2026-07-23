/* "Which mind built which page" — the per-post model-attribution visualization.
   A grid of tinted metric cards (one per post: lead model, count, a split bar,
   washed with the lead model's colour), a detail tray that pops up anchored at the
   clicked card (a bottom sheet on mobile), an Edits<->Tokens toggle. Cards appear
   on scroll; numbers are static. Renders into #ma-root; no external deps. */
(function () {
  'use strict';
  var DATA = window.GIT_ATTRIBUTION;
  var root = document.getElementById('ma-root');
  if (!DATA || !root) return;

  var REDUCE = false; /* owner: animate for everyone, even with prefers-reduced-motion set */
  var MODELS = DATA.models;
  // Posts that are unlisted everywhere public (no homepage card, no hub, and pulled from the
  // archive page) should not surface a tile here either. Their data stays in
  // git-attribution-data.js untouched; the model fuel totals still count them. We just don't
  // render their tiles. To hide another post, add its key here.
  var HIDDEN_TILES = { 'weather': 1, 'forty': 1, 'alcoholics-anonymous': 1, 'first-164': 1 };
  var POSTS = DATA.posts.filter(function (p) { return !HIDDEN_TILES[p.key]; });
  var MID = {};
  MODELS.forEach(function (m) { MID[m.id] = m; });

  // ---------- build-effort per post, derived from the commit log (window.GIT_HISTORY) ----------
  var EFFORT = {};
  (function () {
    var GH = window.GIT_HISTORY;
    if (!GH || !GH.commits || !GH.topics) return;
    var keyByIdx = GH.topics.map(function (t) { return t.key; });
    function dayIdx(ts) { var d = new Date(ts * 1000); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000); }
    function ymd(ts) { var d = new Date(ts * 1000); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    GH.commits.forEach(function (c) {
      var key = keyByIdx[c[5]]; if (!key) return;            // [hash, ts, adds, dels, files, topicIdx, subject]
      var e = EFFORT[key] || (EFFORT[key] = { commits: 0, add: 0, del: 0, biggest: 0, first: Infinity, last: -Infinity, byDay: {} });
      e.commits++; e.add += c[2]; e.del += c[3];
      if (c[2] + c[3] > e.biggest) e.biggest = c[2] + c[3];
      if (c[1] < e.first) e.first = c[1];
      if (c[1] > e.last) e.last = c[1];
      var d = dayIdx(c[1]); e.byDay[d] = (e.byDay[d] || 0) + 1;
    });
    Object.keys(EFFORT).forEach(function (k) {
      var e = EFFORT[k], d0 = dayIdx(e.first), d1 = dayIdx(e.last);
      e.spanDays = d1 - d0 + 1; e.firstYMD = ymd(e.first); e.lastYMD = ymd(e.last); e.spark = [];
      for (var d = d0; d <= d1; d++) e.spark.push(e.byDay[d] || 0);
    });
  })();
  // prefer the commit log's real first/last dates so header, day-count and sparkline agree
  function postDates(post) { var e = EFFORT[post.key]; return e ? dateRange(e.firstYMD, e.lastYMD) : dateRange(post.first, post.last); }

  var metric = 'tokens'; // 'tokens' | 'edits' — tokens leads, and the grid sorts by it
  var activeModel = null; // model id the grid is filtered to, or null for "all"

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
  // order the posts by the current metric (desc), tie-broken by the other metric then key
  // so the sort is fully deterministic and the same post never "jitters" between equal neighbours
  function sortPosts() {
    POSTS.sort(function (a, b) {
      return (total(b) - total(a)) ||
        (metric === 'tokens' ? b.edits - a.edits : b.tokens - a.tokens) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
  }
  // ordered [{m, v, pct}] desc, only models that contributed
  function split(post) {
    var t = total(post) || 1;
    var arr = Object.keys(post.models).map(function (mid) {
      return { m: MID[mid], v: val(post, mid), pct: val(post, mid) / t * 100 };
    }).filter(function (x) { return x.m && x.v > 0; });
    arr.sort(function (a, b) { return b.v - a.v; });
    return arr;
  }
  // a conic ring; frac (0..1) is how much of the ring is drawn, the remainder
  // falls back to the empty track colour so the ring can "draw on".
  function donutCSS(parts, frac) {
    if (!parts.length) return '#3a443b';
    var stops = [], acc = 0;
    parts.forEach(function (p) { var to = acc + p.pct * frac; stops.push(p.m.color + ' ' + acc.toFixed(2) + '% ' + to.toFixed(2) + '%'); acc = to; });
    if (acc < 99.99) stops.push('#3a443b ' + acc.toFixed(2) + '% 100%');
    return 'conic-gradient(from -90deg, ' + stops.join(', ') + ')';
  }
  // draw the ring on (frac 0 -> 1), optionally after a stagger delay
  function drawDonut(el, parts, animate, delay) {
    if (el._raf2) cancelAnimationFrame(el._raf2);
    if (REDUCE || !animate || document.hidden) { el.style.background = donutCSS(parts, 1); return; }
    var t0 = null, dur = 720, dl = delay || 0;
    el.style.background = donutCSS(parts, 0);
    function step(ts) {
      if (t0 == null) t0 = ts;
      var k = (ts - t0 - dl) / dur; if (k < 0) k = 0; if (k > 1) k = 1;
      el.style.background = donutCSS(parts, easeOut(k));
      if (k < 1) el._raf2 = requestAnimationFrame(step); else el._raf2 = 0;
    }
    el._raf2 = requestAnimationFrame(step);
  }
  function barHTML(parts) { return parts.map(function (p) { return '<i style="background:' + p.m.color + '" data-pct="' + p.pct.toFixed(3) + '"></i>'; }).join(''); }
  function growBars(barEl) { if (!barEl) return; var ii = barEl.querySelectorAll('i'); for (var k = 0; k < ii.length; k++) ii[k].style.width = ii[k].getAttribute('data-pct') + '%'; }
  // a labelled mini-metric, and a commits-per-day sparkline tinted by the lead model
  function fact(n, label) { return '<div class="ma-fact"><b>' + n + '</b><span>' + label + '</span></div>'; }
  function sparkHTML(spark, color) {
    if (!spark || !spark.length) return '';
    var max = 1; for (var i = 0; i < spark.length; i++) if (spark[i] > max) max = spark[i];
    var n = spark.length, W = 100, H = 22, gap = n > 1 ? Math.min(0.9, 28 / n) : 0, bw = (W - gap * (n - 1)) / n, bars = '';
    for (var j = 0; j < n; j++) {
      var v = spark[j], h = v ? Math.max(2.5, v / max * H) : 1.2, x = j * (bw + gap);
      bars += '<rect x="' + x.toFixed(2) + '" y="' + (H - h).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) + '" rx="0.5" opacity="' + (v ? 1 : 0.2) + '"></rect>';
    }
    return '<div class="ma-spark-wrap"><svg class="ma-spark" viewBox="0 0 100 22" preserveAspectRatio="none" style="color:' + color + '">' + bars + '</svg><span class="ma-spark-lbl">commits per day, across ' + n + ' days</span></div>';
  }

  // ---------- animated number (interruptible) ----------
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  // numbers are shown static — owner does not want counting/moving numbers
  function animNum(el, to, fmt) { el._v = to; el.textContent = fmt(to); }

  // ---------- build: model legend (the built chips double as a single-select filter) ----------
  var legend = document.createElement('div');
  legend.className = 'ma-minds';
  var chipById = {};
  // list the models by how much they were used (most tokens first): 4.8, 4.7, ...
  MODELS.slice().sort(function (a, b) { return b.tokens - a.tokens; }).forEach(function (m) {
    var built = m.posts > 0;
    var interactive = built || !!m.note;  // fuel-only models (a note, no per-page tiles) are clickable too
    var chip = document.createElement(interactive ? 'button' : 'div');
    chip.className = 'ma-mind' + (interactive ? '' : ' is-minor');
    chip.style.setProperty('--mc', m.color);
    chip.innerHTML =
      '<span class="ma-mind-dot" style="background:' + m.color + '"></span>' +
      '<span class="ma-mind-name">' + m.label + '</span>' +
      '<span class="ma-mind-fuel">' + fmtTok(m.tokens) + ' · $' + m.cost.toLocaleString('en-US') + '</span>' +
      '<span class="ma-mind-posts">' + (m.note ? m.note : built ? m.posts + (m.posts === 1 ? ' post' : ' posts') : 'tooling only') + '</span>';
    if (interactive) {
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-label', built
        ? 'Show only the ' + m.posts + ' posts ' + m.label + ' helped build'
        : m.label + ' helped across the site; its work is not broken out page by page');
      chip.addEventListener('click', function () { setFilter(activeModel === m.id ? null : m.id); });
      chipById[m.id] = chip;
    }
    legend.appendChild(chip);
  });

  // ---------- build: filter status line ----------
  var hint = document.createElement('div');
  hint.className = 'ma-filter-hint';
  var hintText = document.createElement('span');
  var clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'ma-filter-clear';
  clearBtn.textContent = 'Show all posts';
  clearBtn.style.display = 'none';
  clearBtn.addEventListener('click', function () { setFilter(null); });
  hintText.textContent = 'Pick a model above to see only the posts it helped build.';
  hint.appendChild(hintText);
  hint.appendChild(clearBtn);

  // ---------- filtering ----------
  // a post matches when the active model contributed any change or token to it
  function matchesFilter(post) {
    if (!activeModel) return true;
    var r = post.models[activeModel];
    return !!(r && ((r.edits || 0) > 0 || (r.tokens || 0) > 0));
  }
  // show/hide the tiles for the current filter; re-reveal the surviving tiles with a quick stagger
  function applyFilter(animate) {
    var i = 0, shown = 0, go = animate && !REDUCE && !document.hidden;
    POSTS.forEach(function (post) {
      var el = post._el, ok = matchesFilter(post);
      el.style.display = ok ? '' : 'none';
      if (!ok) return;
      shown++;
      if (go) {
        var d = (i++) * 32;
        el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
        var bi = el.querySelectorAll('.cv-bar i'); for (var k = 0; k < bi.length; k++) bi[k].style.width = '0';
        void el.offsetWidth;
        el.style.transition = 'opacity 0.42s ease ' + d + 'ms, transform 0.5s var(--ma-spring) ' + d + 'ms';
        el.style.opacity = '1'; el.style.transform = 'none';
        (function (e2) { setTimeout(function () { growBars(e2.querySelector('.cv-bar')); }, d + 60); })(el);
      } else {
        el.style.opacity = '1'; el.style.transform = 'none';
        growBars(el.querySelector('.cv-bar'));
      }
    });
    revealed = true; // we've driven the reveal ourselves; keep the scroll observer from re-firing
    return shown;
  }
  function setFilter(mid) {
    activeModel = mid || null;
    Object.keys(chipById).forEach(function (id) {
      var on = id === activeModel;
      chipById[id].classList.toggle('is-active', on);
      chipById[id].setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    legend.classList.toggle('is-filtering', !!activeModel);
    var shown = applyFilter(true);
    if (activeModel) {
      var m = MID[activeModel];
      if (m.posts === 0 && m.note) {
        hintText.innerHTML = '<b style="color:' + m.color + '">' + m.label +
          '</b> worked across the site in July. Its share is not broken out page by page, so it has no individual tiles here.';
      } else {
        hintText.innerHTML = 'Showing the <b>' + shown + '</b> ' + (shown === 1 ? 'post' : 'posts') +
          ' <b style="color:' + m.color + '">' + m.label + '</b> helped build.';
      }
      clearBtn.style.display = '';
    } else {
      hintText.textContent = 'Pick a model above to see only the posts it helped build.';
      clearBtn.style.display = 'none';
    }
  }

  // ---------- build: metric toggle ----------
  var controls = document.createElement('div');
  controls.className = 'ma-controls';
  controls.innerHTML =
    '<div class="ma-toggle" role="tablist" aria-label="Choose how to measure each model\'s share">' +
    '<button class="ma-seg is-on" role="tab" aria-selected="true" data-m="tokens">Tokens</button>' +
    '<button class="ma-seg" role="tab" aria-selected="false" data-m="edits">Changes</button>' +
    '<span class="ma-seg-glider" aria-hidden="true"></span>' +
    '</div>' +
    '<p class="ma-controls-note" id="ma-note">Share of output tokens each model actually wrote into a post.</p>';

  // ---------- build: card grid ----------
  function cardInner(post, parts) {
    var top = parts[0];
    var arch = post.kind === 'archived' ? '<span class="cv-arch">(archived)</span>' : '';
    return '<div class="cv-top"><span class="cv-chip"><i style="background:' + top.m.color + '"></i><span class="cv-chipn">' + top.m.label + '</span></span><span class="cv-val">' + fmtVal(total(post)) + '</span></div>' +
      '<div class="cv-title">' + post.label + arch + '</div><div class="cv-bar">' + barHTML(parts) + '</div><div class="cv-date">' + postDates(post) + '</div>';
  }
  var grid = document.createElement('div');
  grid.className = 'cv-grid';
  sortPosts(); // lay the cards out biggest-first by the default metric (tokens)
  var ANIM = !REDUCE && ('IntersectionObserver' in window);
  POSTS.forEach(function (post) {
    var parts = split(post);
    var b = document.createElement('button');
    b.className = 'cv' + (post.kind === 'archived' ? ' is-arch' : '');
    b.setAttribute('data-key', post.key);
    b.innerHTML = cardInner(post, parts);
    grid.appendChild(b);
    post._el = b;
    if (ANIM) b.style.opacity = '0';   // revealed on scroll-in
    else growBars(b.querySelector('.cv-bar'));
  });

  // repaint a card for the current metric
  function paintTile(post) {
    var parts = split(post), el = post._el;
    el.innerHTML = cardInner(post, parts);
    growBars(el.querySelector('.cv-bar'));
  }

  // re-sort + re-lay-out the grid for the current metric using a FLIP glide.
  // FLIP = measure First rects, reorder the DOM, measure Last rects, Invert each card with a
  // transform back to where it was, then Play to none. Only `transform` (and the split-bar
  // `width`) animate, both compositor-cheap, so even the full ~50-card grid re-sorts smoothly
  // without thrashing layout or pegging the CPU. Reads and writes are batched into separate
  // passes so the whole move forces only a couple of reflows.
  var flipTok = 0, flipTimer = 0;
  function reorderGrid() {
    var go = !REDUCE && !document.hidden;
    // FIRST — where each visible card sits right now (one batched read)
    if (go) POSTS.forEach(function (p) {
      p._r0 = p._el.style.display === 'none' ? null : p._el.getBoundingClientRect();
    });
    // reorder the DOM into the new sort + repaint every tile for the new metric
    sortPosts();
    POSTS.forEach(function (p) { paintTile(p); grid.appendChild(p._el); });
    if (!go) return;
    // LAST — read all the new positions before touching any styles (no read/write interleave)
    var r1 = POSTS.map(function (p) {
      return (!p._r0 || p._el.style.display === 'none') ? null : p._el.getBoundingClientRect();
    });
    // INVERT — translate each card back to its old spot, instantly
    var moved = [];
    POSTS.forEach(function (p, i) {
      if (!r1[i]) return;
      var dx = p._r0.left - r1[i].left, dy = p._r0.top - r1[i].top;
      if (!dx && !dy) return;
      var el = p._el;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      el.style.zIndex = '1';
      moved.push({ el: el, i: i });
    });
    void grid.offsetWidth; // commit the inverted start positions in one reflow
    // PLAY — release the transforms; a soft top-to-bottom wave (capped so it never drags)
    var tok = ++flipTok;
    requestAnimationFrame(function () {
      moved.forEach(function (mv) {
        mv.el.style.transition = 'transform 0.6s var(--ma-flip) ' + Math.min(mv.i * 6, 150) + 'ms';
        mv.el.style.transform = 'none';
      });
    });
    // strip the inline transform once it settles, or it would override the CSS hover/scroll transforms
    if (flipTimer) clearTimeout(flipTimer);
    flipTimer = setTimeout(function () {
      if (tok !== flipTok) return;
      moved.forEach(function (mv) { mv.el.style.transition = ''; mv.el.style.transform = ''; mv.el.style.zIndex = ''; });
    }, 820);
  }

  // staggered reveal: cards rise + fade in and the split bars grow, on scroll-in
  var revealed = false;
  function revealGrid() {
    if (revealed) return; revealed = true;
    POSTS.forEach(function (post, i) {
      var el = post._el;
      if (REDUCE || document.hidden) { el.style.opacity = '1'; el.style.transform = 'none'; growBars(el.querySelector('.cv-bar')); return; }
      el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(13px)';
      var bi = el.querySelectorAll('.cv-bar i'); for (var k = 0; k < bi.length; k++) bi[k].style.width = '0';
      void el.offsetWidth;
      var d = Math.min(i * 18, 620);
      el.style.transition = 'opacity 0.5s ease ' + d + 'ms, transform 0.55s var(--ma-spring) ' + d + 'ms';
      el.style.opacity = '1'; el.style.transform = 'none';
      (function (e2) { setTimeout(function () { growBars(e2.querySelector('.cv-bar')); }, d + 70); })(el);
    });
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
    '<div class="ma-extra"></div>' +
    '<div class="ma-prompts"></div>' +
    '<a class="ma-tray-link" target="_self">Open the post<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M5 3h8v8M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';

  var openPost = null;
  function openTray(post, anchorEl) {
    openPost = post;
    var parts = split(post);
    tray.querySelector('.ma-tray-kind').textContent = post.kind === 'archived' ? 'Archived post' : 'Post';
    tray.querySelector('.ma-tray-kind').className = 'ma-tray-kind' + (post.kind === 'archived' ? ' is-arch' : '');
    tray.querySelector('.ma-tray-title').textContent = post.label;
    tray.querySelector('.ma-tray-when').textContent = 'Built ' + postDates(post);
    var link = tray.querySelector('.ma-tray-link');
    if (post.href) { link.href = post.href.indexOf('/') === 0 ? post.href : '/' + post.href; link.style.display = ''; }
    else link.style.display = 'none';
    paintTray(post, parts, true);
    setTrayMode(); // mode (centred modal vs bottom sheet) is already committed; just spring open
    lockScroll();
    scrim.classList.add('is-on');
    tray.classList.add('is-on');
    document.addEventListener('keydown', onKey);
    tray.querySelector('.ma-tray-x').focus();
  }
  // pick the mode from the viewport; only while closed, so the open transition stays same-mode
  function setTrayMode() { if (!tray.classList.contains('is-on')) tray.classList.toggle('is-centered', window.innerWidth >= 600); }
  // lock the page behind the modal without the scrollbar-jump (pad by its width)
  function lockScroll() {
    var sw = window.innerWidth - document.documentElement.clientWidth;
    if (sw > 0) document.body.style.paddingRight = sw + 'px';
    document.body.classList.add('ma-locked');
  }
  function unlockScroll() { document.body.style.paddingRight = ''; document.body.classList.remove('ma-locked'); }

  // ---------- the per-post prompt archive ----------
  var PROMPTS = window.POST_PROMPTS || {};
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtWhen(s) { // "2026-07-02T00:07" -> "Jul 2, 12:07 AM"
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || ''); if (!m) return '';
    var h = +m[4], ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + h12 + ':' + m[5] + ' ' + ap;
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
  }
  function flashCopy(btn, label) {
    if (btn._orig == null) btn._orig = btn.innerHTML;
    clearTimeout(btn._t); btn.classList.add('is-copied'); btn.textContent = label || 'Copied';
    btn._t = setTimeout(function () { btn.classList.remove('is-copied'); btn.innerHTML = btn._orig; btn._orig = null; }, 1500);
  }
  function copyText(text, btn, label) {
    var ok = function () { flashCopy(btn, label); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text); ok(); }); return;
      }
    } catch (e) {}
    legacyCopy(text); ok();
  }
  var COPY_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<path d="M5.5 4.6h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M7 4.6V3.7a1 1 0 0 1 1-1h2.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  function renderPrompts(post) {
    var host = tray.querySelector('.ma-prompts'); if (!host) return;
    var data = PROMPTS[post.key];
    host.innerHTML = '';
    if (!data || !data.prompts || !data.prompts.length) { host.style.display = 'none'; return; }
    host.style.display = '';
    var items = data.prompts;

    var head = document.createElement('div'); head.className = 'ma-prompts-head';
    head.innerHTML = '<div><span class="ma-prompts-kicker">Prompts to Claude</span>' +
      '<span class="ma-prompts-sub">' + items.length + ' ' + (items.length === 1 ? 'message' : 'messages') + ' that built it</span></div>';
    var copyAll = document.createElement('button'); copyAll.type = 'button'; copyAll.className = 'ma-copybtn';
    copyAll.innerHTML = COPY_ICON + 'Copy all';
    copyAll.addEventListener('click', function () {
      copyText(items.map(function (p) { return p.text; }).join('\n\n'), copyAll, 'Copied all');
    });
    head.appendChild(copyAll); host.appendChild(head);

    var scroll = document.createElement('div'); scroll.className = 'ma-prompts-scroll';
    items.forEach(function (p, i) {
      var card = document.createElement('div'); card.className = 'ma-prompt';
      var top = document.createElement('div'); top.className = 'ma-prompt-top';
      top.innerHTML = '<span class="ma-prompt-n">' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<span class="ma-prompt-when">' + fmtWhen(p.when) + '</span>';
      var pc = document.createElement('button'); pc.type = 'button'; pc.className = 'ma-prompt-copy';
      pc.textContent = 'copy'; pc.setAttribute('aria-label', 'Copy this prompt');
      pc.addEventListener('click', function () { copyText(p.text, pc, 'copied'); });
      top.appendChild(pc); card.appendChild(top);

      var txt = document.createElement('div'); txt.className = 'ma-prompt-text'; txt.textContent = p.text;
      var long = p.text.length > 240; if (long) txt.classList.add('is-clamped');
      card.appendChild(txt);
      if (long) {
        var more = document.createElement('button'); more.type = 'button'; more.className = 'ma-prompt-more';
        more.textContent = 'Show full prompt';
        more.addEventListener('click', function () {
          var clamped = txt.classList.toggle('is-clamped');
          more.textContent = clamped ? 'Show full prompt' : 'Show less';
        });
        card.appendChild(more);
      }
      scroll.appendChild(card);
    });
    host.appendChild(scroll);

    var note = document.createElement('p'); note.className = 'ma-prompts-note';
    note.textContent = 'The actual messages I typed to Claude to build this post, in order. Lightly cleaned for typos and readability, otherwise verbatim.';
    host.appendChild(note);
  }

  function paintTray(post, parts, animDonut) {
    parts = parts || split(post);
    drawDonut(tray.querySelector('.ma-donut-lg'), parts, !!animDonut, 0);
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
    // build-effort facts + commits-per-day sparkline + tokens-per-finished-word
    var ex = tray.querySelector('.ma-extra'), eff = EFFORT[post.key];
    if (ex && eff) {
      var wds = post.words || 0, tpw = wds ? post.tokens / wds : 0;
      var tpwStr = tpw >= 1000 ? '~' + Math.round(tpw / 1000) + 'k' : Math.round(tpw);
      var lead = (parts[0] && parts[0].m.color) || '#D4C4A0';
      ex.innerHTML =
        '<div class="ma-facts">' +
          fact(eff.commits, eff.commits === 1 ? 'commit' : 'commits') +
          fact(eff.spanDays, eff.spanDays === 1 ? 'day' : 'days') +
          fact(wds ? wds.toLocaleString('en-US') : 'n/a', wds === 1 ? 'word' : 'words') +
          fact(wds ? tpwStr : 'n/a', 'tokens / word') +
        '</div>' +
        sparkHTML(eff.spark, lead) +
        '<p class="ma-extra-note">+' + eff.add.toLocaleString('en-US') + ' / -' + eff.del.toLocaleString('en-US') + ' lines, biggest single change +' + eff.biggest.toLocaleString('en-US') + '</p>';
    } else if (ex) { ex.innerHTML = ''; }
    renderPrompts(post);
  }
  function closeTray() {
    openPost = null;
    scrim.classList.remove('is-on');
    tray.classList.remove('is-on');
    unlockScroll();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') closeTray(); }

  grid.addEventListener('click', function (e) {
    var t = e.target.closest('.cv'); if (!t) return;
    var post = POSTS.filter(function (p) { return p.key === t.getAttribute('data-key'); })[0];
    if (post) openTray(post, t);
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
    controls.querySelector('.ma-toggle').classList.toggle('is-edits', metric === 'edits');
    document.getElementById('ma-note').textContent = metric === 'tokens'
      ? 'Share of output tokens each model actually wrote into a post.'
      : 'Share of file changes each model made to a post.';
    reorderGrid(); // re-sort the grid by the new metric and FLIP-glide the cards (also repaints)
    if (openPost) paintTray(openPost);
  });

  // ---------- mount ----------
  root.appendChild(legend);
  root.appendChild(hint);
  root.appendChild(controls);
  root.appendChild(grid);
  // the tray + scrim are position:fixed; an ancestor of #ma-root carries a transform
  // (the .fade-in reveal), which would trap fixed positioning inside it. Mount them on
  // <body> so they centre against the viewport instead.
  document.body.appendChild(scrim);
  document.body.appendChild(tray);
  setTrayMode(); // commit the closed-state mode up front so the first open springs cleanly
  window.addEventListener('resize', setTrayMode);

  // reveal the grid a bit BEFORE it scrolls into view, so the tiles are already
  // in by the time you reach them (fire ~45% of a viewport early, on first contact)
  if (ANIM) {
    var io = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isIntersecting) { revealGrid(); io.disconnect(); break; }
      }
    }, { threshold: 0, rootMargin: '0px 0px 45% 0px' });
    io.observe(grid);
  }
})();
