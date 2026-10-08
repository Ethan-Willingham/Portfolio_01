/* ============================================================================
   search.js  -  the homepage search (a "find in the posts" typeahead).

   A literal CONTAINS search over a prebuilt index (search-index.json, made by
   tools/build-search-index.mjs). As you type, each result shows how many times
   the exact string occurs in that post and the FIRST occurrence in context, with
   the typed characters highlighted, like find-in-page across the whole site.

   - Literal substring match (precise: only posts that actually contain the text).
   - Per result: a "N matches" count + a context snippet (words either side).
   - Deep-links into the section the first hit lives in.
   - No guessing: if nothing contains the typed text, it shows no results. It
     never substitutes a near word for what you typed.
   - Archived posts are searchable, amber-flagged, and always after live posts.

   Lazy-loaded on first focus. Full keyboard + combobox a11y. No deps. No em dashes.
   ============================================================================ */
(function () {
  'use strict';

  var input = document.querySelector('.hs-input');
  var panel = document.getElementById('hs-panel');
  var live  = document.querySelector('.hs-readout');
  if (!input || !panel) return;

  // The results panel is frosted glass (a backdrop-filter blur). That blur can
  // only sample the posts behind it when no ancestor is a "backdrop root." The
  // masthead's one-second rise animation (transform + opacity) promotes
  // .site-header into a backdrop root and keeps it one even after it settles,
  // which silently kills the blur (the posts show through sharp instead of
  // diffused). The animation's end state is identical to no animation, so once
  // it has played we just remove it. Reduced-motion has no animation, nothing to
  // do; the setTimeout is a fallback in case the animationend event is missed.
  var header = document.querySelector('.site-header');
  if (header) {
    var dropHeaderAnim = function () { header.style.animation = 'none'; };
    header.addEventListener('animationend', dropHeaderAnim);
    setTimeout(dropHeaderAnim, 1400);
  }

  // scope: 'home' (every non-archived post, the default), 'archive' (the In
  // Progress index: archived posts plus the members of an in-progress
  // collection), or a hub slug (only that hub's posts). Set via the input's
  // data-search-scope attribute. The home scope includes the hub child posts,
  // so searching the homepage still finds a post that now lives inside a hub.
  // `archived` means the file moved under /archive and the root URL is dead;
  // `inprogress` means the post is still live at its own URL but belongs to a
  // collection that is not finished, so home search keeps finding it.
  var scope = input.getAttribute('data-search-scope') || 'home';
  function unfinished(p) { return !!p.archived || !!p.inprogress; }
  function inScope(p) {
    if (scope === 'home') return !p.archived;
    if (scope === 'archive') return unfinished(p);
    return p.hub === scope || (p.hubs && p.hubs.indexOf(scope) >= 0);
  }

  var LIMIT = 6;            // results shown (kept tight on purpose)
  var data = null;
  var loading = false;
  var results = [];
  var active = -1;
  var lastQuery = '';

  // ---- text helpers ---------------------------------------------------------
  function lc(s) { return (s || '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
  function countOf(s, q) { if (!s) return 0; var c = 0, i = 0; while ((i = s.indexOf(q, i)) >= 0) { c++; i += q.length; } return c; }
  function anchor(p, s) { return s && s.id ? p.url + '#' + s.id : p.url; }

  function hiLiteral(text, q) {
    var out = esc(text);
    if (!q) return out;
    var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return out.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="hs-hi">$1</mark>'); }
    catch (e) { return out; }
  }

  // a context window around a hit: a few words either side, trimmed to whole words.
  function contextWindow(text, pos, qlen) {
    var a = Math.max(0, pos - 34), b = Math.min(text.length, pos + qlen + 120);
    var pre = text.slice(a, pos), mid = text.slice(pos, pos + qlen), post = text.slice(pos + qlen, b);
    if (a > 0) pre = pre.replace(/^\S*\s+/, '');           // drop a clipped leading word
    if (b < text.length) post = post.replace(/\s+\S*$/, '');// drop a clipped trailing word
    return (a > 0 ? '… ' : '') + pre + mid + post + (b < text.length ? ' …' : '');
  }

  // ---- prepare the index once ----------------------------------------------
  function prepare(payload) {
    var posts = payload.posts || [], n = posts.length;
    posts.forEach(function (p, i) {
      p.titleLC = lc(p.title); p.recency = n > 1 ? (n - 1 - i) / (n - 1) : 1;
      (p.sections || []).forEach(function (s) { s.headLC = lc(s.head); s.textLC = lc(s.text); });
    });
    data = posts;
  }

  function load() {
    if (data || loading) return;
    loading = true;
    fetch('search-index.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { prepare(j); loading = false; if (document.activeElement === input && input.value.trim()) run(input.value); })
      .catch(function () { loading = false; });
  }

  // ---- the contains search --------------------------------------------------
  function literalHits(q) {
    var hits = [];
    for (var pi = 0; pi < data.length; pi++) {
      var p = data[pi];
      if (!inScope(p)) continue;
      var titleCount = countOf(p.titleLC, q), count = titleCount, firstSec = -1, firstPos = -1, headHits = 0;
      for (var si = 0; si < p.sections.length; si++) {
        var sec = p.sections[si];
        var hc = countOf(sec.headLC, q); headHits += hc;
        count += hc + countOf(sec.textLC, q);
        if (firstSec < 0) { var ph = sec.textLC.indexOf(q); if (ph >= 0) { firstSec = si; firstPos = ph; } }
      }
      if (count < 1) continue;
      // A title hit owns the top. A heading hit is only a nudge: kept below
      // the weight of a few body hits, so the visible per-post match counts
      // read as (near) sorted instead of looking shuffled.
      var score = (titleCount > 0 ? 10000 : 0) + headHits * 4 + count + p.recency * 3;
      hits.push({ post: p, count: count, score: score, firstSec: firstSec, firstPos: firstPos });
    }
    hits.sort(function (a, b) { return (unfinished(a.post) ? 1 : 0) - (unfinished(b.post) ? 1 : 0) || b.score - a.score; });
    return hits;
  }

  function buildResult(h, q) {
    var p = h.post, url = p.url, label = '', snippet;
    if (h.firstSec >= 0) {
      var sec = p.sections[h.firstSec];
      url = anchor(p, sec); label = sec.head;
      snippet = contextWindow(sec.text, h.firstPos, q.length);
    } else {
      snippet = p.desc || (p.sections[0] ? clip(p.sections[0].text, 150) : '');
    }
    return { post: p, url: url, archived: unfinished(p), count: h.count, label: label, titleHTML: hiLiteral(p.title, q), snippetHTML: hiLiteral(snippet, q) };
  }

  function run(raw) {
    lastQuery = raw;
    var q = lc(raw).replace(/\s+/g, ' ').trim();
    if (q.length < 2) { close(); return; }
    if (!data) { load(); return; }

    var hits = literalHits(q);          // literal only; no near-word guessing
    var totalInstances = 0, postCount = hits.length, i;
    for (i = 0; i < hits.length; i++) totalInstances += hits[i].count;
    results = hits.slice(0, LIMIT).map(function (h) { return buildResult(h, q); });
    active = results.length ? 0 : -1;
    render(q, totalInstances, postCount);
    open();
  }

  function rowHTML(r, i) {
    var n = r.count, countLbl = n + ' match' + (n === 1 ? '' : 'es');
    return '<a class="hs-res' + (r.archived ? ' is-arch' : '') + '" role="option" id="hs-opt-' + i + '" href="' + r.url + '"' +
      (i === active ? ' aria-selected="true"' : '') + ' data-i="' + i + '" tabindex="-1">' +
      '<span class="hs-res-thumb">' + (r.post.thumb ? '<img src="' + r.post.thumb + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
      '<span class="hs-res-main">' +
        '<span class="hs-res-top"><span class="hs-res-title">' + r.titleHTML + '</span><span class="hs-res-count">' + countLbl + '</span></span>' +
        '<span class="hs-res-snip">' + r.snippetHTML + '</span>' +
      '</span>' +
    '</a>';
  }

  function render(q, totalInstances, postCount) {
    var html;
    if (!results.length) {
      html = '<div class="hs-empty">No matches for “' + esc(q) + '”</div>';
      if (live) live.textContent = 'No matches';
    } else {
      html = '';
      var archHeader = false;
      for (var i = 0; i < results.length; i++) {
        // The header only earns its place when it divides finished from
        // unfinished. Unfinished always sorts last, so a finished results[0]
        // means the list holds both; an unfinished results[0] means every row
        // is unfinished (an in-progress hub searching itself) and the header
        // would label the whole list instead of splitting it.
        if (scope !== 'archive' && results[i].archived && !results[0].archived && !archHeader) { archHeader = true; html += '<div class="hs-group">In progress</div>'; }
        html += rowHTML(results[i], i);
      }
      var label = totalInstances + ' match' + (totalInstances === 1 ? '' : 'es') + ' in ' + postCount + ' post' + (postCount === 1 ? '' : 's');
      html += '<div class="hs-foot"><span class="hs-foot-count">' + label + '</span></div>';
      if (live) live.textContent = label;
    }
    panel.innerHTML = html;
    paintActive();
  }

  function paintActive() {
    var opts = panel.querySelectorAll('.hs-res');
    for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('is-active', i === active);
    input.setAttribute('aria-activedescendant', active >= 0 && results.length ? 'hs-opt-' + active : '');
    if (active >= 0 && opts[active]) opts[active].scrollIntoView({ block: 'nearest' });
  }

  // ---- open / close ---------------------------------------------------------
  var isOpen = false;
  function open() { if (isOpen) return; isOpen = true; panel.classList.add('is-open'); input.setAttribute('aria-expanded', 'true'); }
  function close() {
    if (!isOpen) { panel.classList.remove('is-open'); return; }
    isOpen = false; active = -1;
    panel.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-activedescendant', '');
    if (live) live.textContent = '';
  }
  function go(i) { var r = results[i]; if (r) window.location.href = r.url; }

  // ---- events ---------------------------------------------------------------
  input.addEventListener('focus', function () { load(); if (input.value.trim()) run(input.value); });
  input.addEventListener('input', function () { run(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { if (!isOpen) { run(input.value); return; } e.preventDefault(); if (results.length) { active = (active + 1) % results.length; paintActive(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { active = (active - 1 + results.length) % results.length; paintActive(); } }
    else if (e.key === 'Enter') { if (isOpen && active >= 0) { e.preventDefault(); go(active); } }
    else if (e.key === 'Escape') { if (isOpen) { e.preventDefault(); close(); } else if (input.value) { input.value = ''; close(); } else { input.blur(); } }
    else if (e.key === 'Tab') { close(); }
  });
  panel.addEventListener('mousemove', function (e) {
    var row = e.target.closest('.hs-res'); if (!row) return;
    var i = +row.getAttribute('data-i'); if (i !== active) { active = i; paintActive(); }
  });
  panel.addEventListener('mousedown', function (e) { if (e.target.closest('.hs-res')) e.preventDefault(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.home-search')) close(); });
  input.addEventListener('blur', function () { setTimeout(function () { if (!panel.contains(document.activeElement)) close(); }, 120); });
  document.addEventListener('keydown', function (e) {
    var ae = document.activeElement, typing = ae && /^(input|textarea|select)$/i.test(ae.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
  });

  // Idle-prefetch the index (so the first keystroke is instant) only where the
  // connection is likely unmetered: desktop-class pointers, and never against
  // an explicit Save-Data signal. Phones skip the ~600 KB prefetch and load it
  // on first focus (or the / shortcut) instead.
  var conn = navigator.connection || {};
  var prefetch = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches && !conn.saveData;
  if (prefetch) {
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 }); else setTimeout(load, 1500);
  }
})();

/* Resonant hairlines: catch, stretch, and release the search and footer rules.
   The held shape follows the hand; release feeds that shape and its current
   velocity into a damped string. Returning slowly removes stored energy.
   SVG overflow gives the string room without putting a big hitbox over links. */
(function () {
  'use strict';
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(any-pointer: fine)');
  var ns = 'http://www.w3.org/2000/svg';
  var waves = [], gesture = null, active = null, suppressClick = false;
  var css = document.createElement('style');
  css.textContent =
    '.home-search.wave-on{border-bottom-color:transparent;}' +
    '.home-search.wave-on::before,.home-search.wave-on::after{display:none;}' +
    '.site-footer-inner.wave-on{border-top-color:transparent;}' +
    '.hairline-string{position:absolute;left:0;bottom:0;width:100%;height:1px;overflow:visible;pointer-events:none;z-index:2;}' +
    '.site-footer-inner>.hairline-string{top:-1px;bottom:auto;}' +
    '.hairline-ink{fill:none;stroke-width:1;stroke-linejoin:round;pointer-events:none;}' +
    '.hairline-hit{fill:none;stroke:transparent;stroke-width:20;pointer-events:stroke;touch-action:pan-y;}' +
    '@media(hover:hover) and (pointer:fine){.hairline-hit{cursor:grab;}}' +
    '.hairline-dragging,.hairline-dragging *{cursor:grabbing!important;user-select:none!important;}' +
    '@media print{.hairline-string{display:none;}}';
  document.head.appendChild(css);

  var palette = getComputedStyle(document.documentElement);
  function rgb(token) {
    var hex = palette.getPropertyValue(token).trim().replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    return [0, 2, 4].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
  }
  var rule = rgb('--rule'), accent = rgb('--accent');
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function mount(host, input) {
    var svg = document.createElementNS(ns, 'svg');
    svg.classList.add('hairline-string');
    svg.setAttribute('aria-hidden', 'true');
    var ink = document.createElementNS(ns, 'path');
    var hit = document.createElementNS(ns, 'path');
    ink.classList.add('hairline-ink');
    hit.classList.add('hairline-hit');
    svg.appendChild(ink); svg.appendChild(hit); host.appendChild(svg);

    var count = 97, u = new Float64Array(count), velocity = new Float64Array(count);
    var width = 0, warmth = 0, frame = 0, lastTime = 0, remainder = 0;
    var held = null, focused = false;
    // Fixed physics steps keep a 144 Hz screen and a 60 Hz screen in tune.
    var dt = 1 / 480, tension = Math.pow((count - 1) * 3.2, 2);
    var damping = Math.exp(-4.2 * dt);
    var wave = { svg: svg, host: host, draw: draw, reset: reset, pluck: pluck,
      point: point, grab: grab, move: move, release: release };
    waves.push(wave);

    function draw() {
      var path = '';
      for (var i = 0; i < count; i++) {
        path += (i ? 'L' : 'M') + (i / (count - 1) * width).toFixed(2) + ',' + (0.5 + u[i]).toFixed(2);
      }
      ink.setAttribute('d', path); hit.setAttribute('d', path);
      var heat = Math.max(focused ? 0.22 : 0, warmth);
      ink.setAttribute('stroke', 'rgb(' + rule.map(function (c, i) {
        return Math.round(c + (accent[i] - c) * heat);
      }).join(',') + ')');
    }
    function size() {
      var next = host.clientWidth;
      if (next === width) return;
      if (active === wave) cancel();
      width = next; reset();
    }
    function reset() {
      cancelAnimationFrame(frame); frame = 0; remainder = 0; held = null;
      u.fill(0); velocity.fill(0); warmth = 0; draw();
    }
    function point(x, y) {
      var rect = svg.getBoundingClientRect();
      var localX = x - rect.left;
      var index = clamp(localX / width * (count - 1), 0, count - 1);
      var low = Math.floor(index), high = Math.min(count - 1, low + 1);
      return { x: localX, y: y - rect.top - 0.5, width: width,
        offset: u[low] + (u[high] - u[low]) * (index - low) };
    }
    function profile(i, x) {
      var t = i / (count - 1), p = clamp(x / width, 0.015, 0.985);
      var side = t < p ? t / p : (1 - t) / (1 - p);
      // Nearly straight arms with a small rounded bend under the fingertip.
      var corner = 0.025;
      return 1 - (Math.sqrt(Math.pow(1 - side, 2) + corner * corner) - corner) /
        (Math.sqrt(1 + corner * corner) - corner);
    }
    function pose(speed) {
      for (var i = 0; i < count; i++) {
        var shape = profile(i, held.x);
        u[i] = shape * held.offset; velocity[i] = shape * speed;
      }
      draw();
    }
    function grab(x, y, crossed) {
      var p = point(x, y);
      held = { x: p.x, gap: p.y - p.offset, offset: p.offset,
        moved: crossed, speed: 0, time: performance.now() };
    }
    function move(x, y) {
      if (!held) return false;
      var p = point(x, y), now = performance.now();
      var pull = p.y - held.gap;
      var limit = clamp(width * 0.22, 90, 170);
      // Resistance builds before the band slips out of the hand.
      var offset = pull / (1 + Math.abs(pull) / (limit * 2.5));
      held.speed = clamp((offset - held.offset) / Math.max(0.008, (now - held.time) / 1000), -900, 900);
      held.time = now; held.x = clamp(p.x, width * 0.015, width * 0.985);
      held.offset = offset; held.moved = true;
      warmth = clamp(Math.abs(pull) / limit, 0.12, 1);
      pose(0);
      if (Math.abs(pull) >= limit || p.x < -36 || p.x > width + 36) {
        release(true); return true;
      }
      return false;
    }
    function release(slip) {
      if (!held) return;
      if (held.moved) {
        // A pause in the hand kills throw velocity. A slow return to the rest
        // line can therefore finish almost silently, with no mandatory pluck.
        var speed = held.speed * Math.exp(-(performance.now() - held.time) / 65) * 0.28;
        if (slip) speed = -held.offset * 5;
        pose(speed);
        if (Math.abs(held.offset) < 0.65 && Math.abs(speed) < 9) {
          u.fill(0); velocity.fill(0); warmth = 0;
        }
      } else {
        pluck(held.x, 8);
      }
      held = null; run();
    }
    function pluck(x, amplitude) {
      if (motion.matches || !width) return;
      var center = clamp(x / width * (count - 1), 1, count - 2);
      for (var i = 1; i < count - 1; i++) u[i] += amplitude * Math.exp(-Math.pow((i - center) / 3, 2));
      warmth = 1; run();
    }
    function run() {
      if (!frame && !motion.matches) { lastTime = performance.now(); frame = requestAnimationFrame(tick); }
    }
    function tick(now) {
      frame = 0;
      if (held && held.moved) { remainder = 0; return; }
      var elapsed = Math.min(0.04, (now - lastTime) / 1000);
      lastTime = now; remainder += elapsed;
      while (remainder >= dt) {
        for (var i = 1; i < count - 1; i++) {
          velocity[i] = (velocity[i] + tension * (u[i - 1] + u[i + 1] - 2 * u[i]) * dt) * damping;
        }
        for (var j = 1; j < count - 1; j++) u[j] += velocity[j] * dt;
        remainder -= dt;
      }
      warmth = Math.max(0, warmth - elapsed * 0.65);
      var energy = 0;
      for (var k = 1; k < count - 1; k++) energy = Math.max(energy, Math.abs(u[k]), Math.abs(velocity[k]) / 25);
      if (energy < 0.06 && warmth === 0) { reset(); return; }
      draw(); frame = requestAnimationFrame(tick);
    }
    if (input) {
      var measure = document.createElement('canvas').getContext('2d');
      input.addEventListener('focus', function () { focused = true; draw(); });
      input.addEventListener('blur', function () { focused = false; draw(); });
      input.addEventListener('input', function () {
        if (!measure) return;
        var style = getComputedStyle(input);
        measure.font = style.fontSize + ' ' + style.fontFamily;
        var end = input.selectionStart === null ? input.value.length : input.selectionStart;
        var x = input.getBoundingClientRect().left - svg.getBoundingClientRect().left +
          measure.measureText(input.value.slice(0, end)).width - input.scrollLeft;
        pluck(clamp(x, 2, width - 2), 4.5);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') pluck(width * 0.5, 6); });
    }
    if (window.ResizeObserver) new ResizeObserver(size).observe(host);
    else window.addEventListener('resize', size);
    size();
  }

  function capture(wave, e, x, y, crossed) {
    active = wave; gesture.caught = true;
    gesture.startX = x; gesture.startY = y;
    wave.grab(x, y, crossed);
    if (crossed) window.getSelection().removeAllRanges();
    document.documentElement.classList.add('hairline-dragging');
    wave.svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function ungrab() {
    var previous = active; active = null;
    document.documentElement.classList.remove('hairline-dragging');
    if (previous && gesture && previous.svg.hasPointerCapture(gesture.id)) previous.svg.releasePointerCapture(gesture.id);
  }
  function cancel() {
    if (active) active.reset();
    ungrab(); gesture = null;
  }
  var interactive = 'a,button,input,textarea,select,summary,canvas,video,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"]';
  function startsOnText(e) {
    var caret, node, offset;
    if (document.caretPositionFromPoint) {
      caret = document.caretPositionFromPoint(e.clientX, e.clientY);
      node = caret && caret.offsetNode; offset = caret && caret.offset;
    } else if (document.caretRangeFromPoint) {
      caret = document.caretRangeFromPoint(e.clientX, e.clientY);
      node = caret && caret.startContainer; offset = caret && caret.startOffset;
    }
    if (!node || node.nodeType !== 3) return false;
    var range = document.createRange();
    range.setStart(node, Math.max(0, offset - 1));
    range.setEnd(node, Math.min(node.length, offset + 1));
    return Array.from(range.getClientRects()).some(function (r) {
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
  }
  window.addEventListener('pointerdown', function (e) {
    if (motion.matches || gesture || !e.isPrimary || e.button !== 0) return;
    var direct = waves.find(function (wave) { return wave.svg.contains(e.target); });
    if (!direct && (e.target.closest(interactive) || window.getSelection().toString() || startsOnText(e))) return;
    if (!direct && (!fine.matches || e.pointerType === 'touch')) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY,
      startX: e.clientX, startY: e.clientY, caught: false, touch: e.pointerType === 'touch', tap: direct };
    if (direct && !gesture.touch) capture(direct, e, e.clientX, e.clientY, false);
  });
  window.addEventListener('pointermove', function (e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (!(e.buttons & 1)) { cancel(); return; }
    if (gesture.touch) {
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 8) gesture.tap = null;
      return;
    }
    if (active) {
      e.preventDefault();
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 3 || gesture.moved) {
        gesture.moved = true;
        if (active.move(e.clientX, e.clientY)) ungrab();
      }
    } else if (gesture.caught) {
      e.preventDefault(); // A slipped band cannot be caught again until mouseup.
    } else if (!e.target.closest(interactive)) {
      for (var i = 0; i < waves.length; i++) {
        var wave = waves[i];
        var a = wave.point(gesture.x, gesture.y), b = wave.point(e.clientX, e.clientY);
        var from = a.y - a.offset, to = b.y - b.offset;
        if (from * to > 0 || from === to) continue;
        var fraction = from / (from - to);
        var x = gesture.x + (e.clientX - gesture.x) * fraction;
        var y = gesture.y + (e.clientY - gesture.y) * fraction;
        var p = wave.point(x, y);
        var under = document.elementFromPoint(x, y);
        if (p.x < 0 || p.x > p.width || !under || !wave.host.contains(under)) continue;
        capture(wave, e, x, y, true); gesture.moved = true;
        if (wave.move(e.clientX, e.clientY)) ungrab();
        break;
      }
    }
    gesture.x = e.clientX; gesture.y = e.clientY;
  }, { passive: false });
  window.addEventListener('pointerup', function (e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (gesture.touch && gesture.tap) {
      gesture.tap.pluck(gesture.tap.point(e.clientX, e.clientY).x, 8);
      gesture.caught = true;
    }
    if (active) active.release(false);
    suppressClick = gesture.caught;
    setTimeout(function () { suppressClick = false; }, 0);
    ungrab(); gesture = null;
  });
  window.addEventListener('click', function (e) {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);
  window.addEventListener('pointercancel', function (e) { if (gesture && e.pointerId === gesture.id) cancel(); });
  window.addEventListener('lostpointercapture', function (e) { if (active && gesture && e.pointerId === gesture.id) cancel(); });
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel, { passive: true });
  window.addEventListener('scroll', function () { if (gesture) cancel(); }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancel(); waves.forEach(function (wave) { wave.reset(); }); }
  });
  function syncMotion() {
    cancel();
    waves.forEach(function (wave) {
      wave.reset(); wave.svg.style.display = motion.matches ? 'none' : '';
      wave.host.classList.toggle('wave-on', !motion.matches);
    });
  }
  var search = document.querySelector('.home-search');
  if (search) mount(search, search.querySelector('.hs-input'));
  var footer = document.querySelector('.site-footer-inner');
  if (footer) mount(footer, null);
  motion.addEventListener('change', syncMotion);
  syncMotion();
})();
