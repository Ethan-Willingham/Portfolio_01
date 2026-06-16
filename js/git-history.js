/* The Eruption — every commit to this site as a point of light on a time axis.
   Reads the baked snapshot in window.GIT_HISTORY (js/git-history-data.js).
   Canvas 2D, additive glow sprites, zoom/pan over time, hover/click cards. */
(function () {
  'use strict';

  var DATA = window.GIT_HISTORY;
  var stage = document.getElementById('gh-stage');
  var canvas = document.getElementById('gh-canvas');
  if (!DATA || !stage || !canvas) return;
  var ctx = canvas.getContext('2d');

  var cardEl = document.getElementById('gh-card');
  var legendEl = document.getElementById('gh-legend');
  var readoutEl = document.getElementById('gh-readout');
  var hintEl = document.getElementById('gh-hint');

  // ----- data layout: [hash, unixSec, adds, dels, files, topicIdx, subject] -----
  var IX_HASH = 0, IX_T = 1, IX_A = 2, IX_D = 3, IX_F = 4, IX_TI = 5, IX_S = 6;
  var commits = DATA.commits;
  var topics = DATA.topics;
  var N = commits.length;

  // ----- the fuel: tokens spent per day, drawn as a glow band on the shared
  // time axis behind the dots (folded in from the old standalone usage chart).
  // Index 0 = May 1 2026; one entry per day through Jun 16. Before May 1 the
  // site was built by hand, so there is no band there — that absence is the point. -----
  var DAILY = [16607317, 36137104, 69177645, 42724566, 39884750, 410619, 81899196,
    71871667, 113285745, 159976758, 329253840, 295195507, 457538327, 127231443, 0,
    285454643, 309323557, 623423505, 271215837, 66298045, 290609738, 1197709924,
    1543803732, 1320336965, 702974597, 285643166, 67725588, 507072587, 829700193,
    948042044, 779405982, 553922455, 691281258, 98965260, 130233736,
    49406229, 0, 437292700, 97568887, 927412697, 737451722, 441003124, 189071669, 957780846,
    828288732, 65467268, 18225562];
  var DAILY_T0 = new Date(2026, 4, 1).getTime() / 1000; // May 1 2026, local midnight
  var DAILY_MAX = 1.6e9;                                 // scale ceiling (peak day ≈ 1.54B)
  function tokensOnDay(sec) {
    var idx = Math.floor((sec - DAILY_T0) / 86400);
    return (idx >= 0 && idx < DAILY.length) ? DAILY[idx] : -1;
  }

  // ----- precompute -----
  var tMin = commits[0][IX_T], tMax = commits[N - 1][IX_T];
  var span0 = tMax - tMin;
  // default focus window: the recent month (scroll/pinch out to reveal the full history)
  var defT0 = new Date(2026, 4, 20).getTime() / 1000;  // May 20, 2026
  var defT1 = new Date(2026, 5, 17).getTime() / 1000;  // Jun 17, 2026 (covers through Jun 16)
  var fullT0 = tMin - Math.max(86400, span0 * 0.015);
  var fullT1 = Math.max(tMax + 86400 * 7, defT1);       // zoom-out bound; always covers the default window
  var fullSpan = fullT1 - fullT0;
  var minSpan = 600; // zoom in to ~10 minutes

  var maxChurn = 1, totalAdd = 0, totalDel = 0, maxCum = 1;
  var cum = new Float64Array(N);
  var phase = new Float64Array(N);
  var topicCount = [];
  for (var t = 0; t < topics.length; t++) topicCount[t] = 0;
  var run = 0;
  for (var i = 0; i < N; i++) {
    var c = commits[i];
    var churn = c[IX_A] + c[IX_D];
    if (churn > maxChurn) maxChurn = churn;
    totalAdd += c[IX_A]; totalDel += c[IX_D];
    run += c[IX_A] - c[IX_D];
    cum[i] = run;
    if (run > maxCum) maxCum = run;
    topicCount[c[IX_TI]]++;
    var s = Math.sin(i * 12.9898) * 43758.5453;
    phase[i] = (s - Math.floor(s)) * 6.2831853;
  }
  var logMaxChurn = Math.log10(1 + maxChurn);
  var sqrtMaxChurn = Math.sqrt(maxChurn);

  // ----- crisp point sprites, one per topic colour (Editorial look: precise dots, no bloom) -----
  var SP = 24;
  function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  var sprites = topics.map(function (tp) {
    var rgb = hexRgb(tp.color);
    var cv = document.createElement('canvas'); cv.width = cv.height = SP;
    var g = cv.getContext('2d');
    var m = SP / 2;
    var lr = Math.min(255, rgb[0] + 70), lg = Math.min(255, rgb[1] + 70), lb = Math.min(255, rgb[2] + 70);
    var grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0.0, 'rgba(' + lr + ',' + lg + ',' + lb + ',1)');
    grad.addColorStop(0.42, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.98)');
    grad.addColorStop(0.62, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.38)');
    grad.addColorStop(1.0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    g.fillStyle = grad; g.fillRect(0, 0, SP, SP);
    return cv;
  });

  // ----- state -----
  var view = { t0: defT0, t1: defT1 };
  var enabled = topics.map(function () { return true; });
  var hoverIdx = -1, pinnedIdx = -1;
  var bandX = -1; // cursor x (css px) when hovering the plot, drives the token readout; -1 = off
  var reduce = false; /* owner: animate for everyone, even with prefers-reduced-motion set */
  var introStart = performance.now();
  var introOn = !reduce && !document.hidden; // only play the rise when we can actually animate
  var INTRO_RISE = 850, INTRO_STAGGER = 700;

  var dpr = 1, cssW = 1, cssH = 1;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function plot() {
    var L = 14, R = 46, T = 16, B = 26;
    return { L: L, T: T, W: Math.max(10, cssW - L - R), Hh: Math.max(10, cssH - T - B), G: cssH - B };
  }
  function xFromT(tt, P) { return P.L + (tt - view.t0) / (view.t1 - view.t0) * P.W; }
  function tFromX(x, P) { return view.t0 + (x - P.L) / P.W * (view.t1 - view.t0); }
  function yForChurn(churn, P) { return P.G - (Math.log10(1 + churn) / logMaxChurn) * P.Hh * 0.9; }

  // ----- resize -----
  function resize() {
    var r = stage.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestRender();
  }

  // ----- render -----
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function timeTicks() {
    var t0 = view.t0, t1 = view.t1, days = (t1 - t0) / 86400, out = [];
    var d0 = new Date(t0 * 1000), d1 = new Date(t1 * 1000), ts, y, m;
    if (days > 540) {
      for (y = d0.getFullYear(); y <= d1.getFullYear(); y++) {
        ts = new Date(y, 0, 1).getTime() / 1000;
        if (ts >= t0 && ts <= t1) out.push({ t: ts, label: String(y), major: true });
      }
      if (out.length < 2) { // add quarters when only one year shows
        var yy = d0.getFullYear();
        for (var q = 0; q < 12; q += 3) { ts = new Date(yy, q, 1).getTime() / 1000; if (ts >= t0 && ts <= t1) out.push({ t: ts, label: MON[q] + ' ' + yy, major: q === 0 }); }
      }
    } else if (days > 70) {
      y = d0.getFullYear(); m = d0.getMonth();
      for (; ;) { ts = new Date(y, m, 1).getTime() / 1000; if (ts > t1) break; if (ts >= t0) out.push({ t: ts, label: m === 0 ? String(y) : MON[m], major: m === 0 }); m++; if (m > 11) { m = 0; y++; } }
    } else if (days > 5) {
      var step = days > 30 ? 7 : (days > 14 ? 3 : 1);
      var dd = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
      for (; ;) { ts = dd.getTime() / 1000; if (ts > t1) break; if (ts >= t0) out.push({ t: ts, label: dd.getDate() + ' ' + MON[dd.getMonth()], major: dd.getDate() === 1 }); dd.setDate(dd.getDate() + step); }
    } else {
      var sh = days > 2 ? 12 : (days > 0.7 ? 6 : (days > 0.25 ? 2 : 1));
      var dh = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), d0.getHours());
      for (; ;) { ts = dh.getTime() / 1000; if (ts > t1) break; if (ts >= t0) { var h = dh.getHours(); out.push({ t: ts, label: h === 0 ? (dh.getDate() + ' ' + MON[dh.getMonth()]) : pad2(h) + ':00', major: h === 0 }); } dh.setHours(dh.getHours() + sh); }
    }
    return out;
  }

  function fmtChurn(n) { return n >= 1000 ? (n / 1000) + 'k' : String(n); }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fmtTokFull(n) { // for the band readout: "623M" / "1.54B"
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(n);
  }

  function render() {
    var now = performance.now();
    var P = plot();
    ctx.clearRect(0, 0, cssW, cssH);

    // churn reference lines (faint horizontal grid; labels drawn after the dots)
    ctx.lineWidth = 1;
    var refs = [10, 100, 1000, 10000, 100000];
    ctx.strokeStyle = 'rgba(245,241,234,0.08)';
    for (var ri = 0; ri < refs.length; ri++) {
      if (refs[ri] > maxChurn * 1.3) break;
      var ry = yForChurn(refs[ri], P);
      ctx.beginPath(); ctx.moveTo(P.L, ry); ctx.lineTo(P.L + P.W, ry); ctx.stroke();
    }

    // ground line (the timeline floor)
    ctx.strokeStyle = 'rgba(245,241,234,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.L, P.G + 0.5); ctx.lineTo(P.L + P.W, P.G + 0.5); ctx.stroke();

    // time axis gridlines (labels drawn after the dots)
    var ticks = timeTicks();
    for (var ti = 0; ti < ticks.length; ti++) {
      var tx = xFromT(ticks[ti].t, P);
      if (tx < P.L - 1 || tx > P.L + P.W + 1) continue;
      ctx.strokeStyle = ticks[ti].major ? 'rgba(245,241,234,0.16)' : 'rgba(245,241,234,0.08)';
      ctx.beginPath(); ctx.moveTo(tx, P.T); ctx.lineTo(tx, P.G); ctx.stroke();
    }

    // the fuel — daily token spend as a glow band rising from the floor, on the
    // same time axis as the dots. Empty before May 2026 (the by-hand years), a
    // bright swell over the eruption. Drawn here so the dots land on top of it.
    var bandMax = P.Hh * 0.42;
    ctx.save();
    ctx.beginPath(); ctx.rect(P.L, P.T, P.W, P.G - P.T); ctx.clip();
    ctx.beginPath();
    var fx0 = xFromT(DAILY_T0 + 43200, P), fx1 = 0;
    ctx.moveTo(fx0, P.G);
    for (var fd = 0; fd < DAILY.length; fd++) {
      var fxx = xFromT(DAILY_T0 + fd * 86400 + 43200, P);
      var fvv = DAILY[fd] / DAILY_MAX; if (fvv > 1) fvv = 1;
      ctx.lineTo(fxx, P.G - fvv * bandMax);
      fx1 = fxx;
    }
    ctx.lineTo(fx1, P.G); ctx.closePath();
    var fg = ctx.createLinearGradient(0, P.G - bandMax, 0, P.G);
    fg.addColorStop(0, 'rgba(232,149,78,0.26)');
    fg.addColorStop(1, 'rgba(232,149,78,0.07)');
    ctx.fillStyle = fg; ctx.fill();
    ctx.beginPath();
    for (var fe = 0; fe < DAILY.length; fe++) {
      var fex = xFromT(DAILY_T0 + fe * 86400 + 43200, P);
      var fev = DAILY[fe] / DAILY_MAX; if (fev > 1) fev = 1;
      if (fe === 0) ctx.moveTo(fex, P.G - fev * bandMax); else ctx.lineTo(fex, P.G - fev * bandMax);
    }
    ctx.strokeStyle = 'rgba(244,179,107,0.6)'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();

    // dots — crisp points (Editorial look: source-over so dense weeks stay distinct)
    var elapsed = now - introStart;
    var intro = introOn && elapsed < (INTRO_RISE + INTRO_STAGGER + 60);
    var span = tMax - tMin || 1;
    var anyFilter = enabled.indexOf(false) !== -1;
    for (var j = 0; j < N; j++) {
      var cc = commits[j];
      var x = xFromT(cc[IX_T], P);
      if (x < P.L - 32 || x > P.L + P.W + 32) continue;
      var on = enabled[cc[IX_TI]];
      var ch = cc[IX_A] + cc[IX_D];
      var yT = yForChurn(ch, P);

      var e = 1, y = yT;
      if (intro) {
        var frac = (cc[IX_T] - tMin) / span;
        var p = clamp((elapsed - frac * INTRO_STAGGER) / INTRO_RISE, 0, 1);
        e = 1 - Math.pow(1 - p, 3);
        y = P.G + (yT - P.G) * e;
      }
      var tw = (!intro && !reduce && !document.hidden) ? (1 + 0.06 * Math.sin(now * 0.0014 + phase[j])) : 1;

      var alpha = e * tw * (on ? 0.92 : (anyFilter ? 0.05 : 0.92));
      if (j === hoverIdx || j === pinnedIdx) alpha = Math.min(1.4, alpha + 0.5);
      var cn = Math.sqrt(ch) / sqrtMaxChurn;
      var coreR = 1.1 + cn * 2.3;
      var gsz = coreR * 3.4 * (0.55 + 0.45 * e);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(sprites[cc[IX_TI]], x - gsz / 2, y - gsz / 2, gsz, gsz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // selection ring
    var sel = pinnedIdx >= 0 ? pinnedIdx : hoverIdx;
    if (sel >= 0 && enabled[commits[sel][IX_TI]]) {
      var sc = commits[sel];
      var sx = xFromT(sc[IX_T], P), sy = yForChurn(sc[IX_A] + sc[IX_D], P);
      ctx.strokeStyle = 'rgba(245,241,234,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(sx, sy, 7.5, 0, 6.2831853); ctx.stroke();
    }

    // labels last, so text reads crisply over the dots
    ctx.font = '500 11px "Commit Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(224,220,209,0.72)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var li = 0; li < refs.length; li++) {
      if (refs[li] > maxChurn * 1.3) break;
      ctx.fillText(fmtChurn(refs[li]), P.L + P.W + 6, yForChurn(refs[li], P));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var lj = 0; lj < ticks.length; lj++) {
      var ltx = xFromT(ticks[lj].t, P);
      if (ltx < P.L - 1 || ltx > P.L + P.W + 1) continue;
      ctx.fillStyle = ticks[lj].major ? 'rgba(244,240,229,0.9)' : 'rgba(224,220,209,0.6)';
      ctx.fillText(ticks[lj].label, ltx, P.G + 7);
    }

    // band readout — the day under the cursor, snapped onto the orange token line,
    // with a guide line and a "18 May · 623M tokens" chip. Mouse hover only.
    if (bandX >= P.L && bandX <= P.L + P.W) {
      var rIdx = Math.floor((tFromX(bandX, P) - DAILY_T0) / 86400);
      if (rIdx >= 0 && rIdx < DAILY.length) {
        var rbx = xFromT(DAILY_T0 + rIdx * 86400 + 43200, P);
        if (rbx >= P.L && rbx <= P.L + P.W) {
          var rVal = DAILY[rIdx];
          var rFr = rVal / DAILY_MAX; if (rFr > 1) rFr = 1;
          var rby = P.G - rFr * bandMax;
          // guide line + marker dot on the band
          ctx.save();
          ctx.strokeStyle = 'rgba(244,179,107,0.30)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(rbx, P.T); ctx.lineTo(rbx, P.G); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(rbx, rby, 4, 0, 6.2831853);
          ctx.fillStyle = '#F6BE78'; ctx.fill();
          ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(12,14,11,0.92)'; ctx.stroke();
          // chip
          var rd = new Date((DAILY_T0 + rIdx * 86400) * 1000);
          var rl1 = rd.getDate() + ' ' + MON[rd.getMonth()];
          var rl2 = rVal > 0 ? fmtTokFull(rVal) + ' tokens' : 'no tokens that day';
          ctx.font = '600 11.5px "Commit Mono", ui-monospace, monospace';
          var rw1 = ctx.measureText(rl1).width;
          ctx.font = '500 11.5px "Commit Mono", ui-monospace, monospace';
          var rw2 = ctx.measureText(rl2).width;
          var rpx = 9, rpy = 6, rlh = 15, rgap = 11;
          var rbw = Math.max(rw1, rw2) + rpx * 2, rbh = rpy * 2 + rlh + 13;
          var rbX = clamp(rbx - rbw / 2, P.L, P.L + P.W - rbw);
          var rbY = rby - rgap - rbh;
          if (rbY < P.T + 2) rbY = Math.min(rby + rgap, P.G - rbh - 2);
          ctx.fillStyle = 'rgba(16,19,14,0.95)';
          ctx.strokeStyle = 'rgba(244,179,107,0.38)'; ctx.lineWidth = 1;
          roundRect(ctx, rbX, rbY, rbw, rbh, 7); ctx.fill(); ctx.stroke();
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = '600 11.5px "Commit Mono", ui-monospace, monospace';
          ctx.fillStyle = 'rgba(244,240,229,0.96)'; ctx.fillText(rl1, rbX + rpx, rbY + rpy);
          ctx.font = '500 11.5px "Commit Mono", ui-monospace, monospace';
          ctx.fillStyle = '#F4B36B'; ctx.fillText(rl2, rbX + rpx, rbY + rpy + rlh);
          ctx.restore();
        }
      }
    }
  }

  // ----- render scheduling -----
  // render() always draws a full, correct frame synchronously, so content
  // shows even where rAF is throttled (e.g. a backgrounded tab). The rAF loop
  // only drives the optional motion (intro rise + faint twinkle).
  var rafId = 0;
  function frame() {
    rafId = 0;
    render();
    if (!reduce && !document.hidden) rafId = requestAnimationFrame(frame);
  }
  function requestRender() {
    render();
    if (!reduce && !document.hidden && !rafId) rafId = requestAnimationFrame(frame);
  }

  // ----- hit testing -----
  function pickAt(px, py) {
    var P = plot(), best = -1, bestD = 15 * 15;
    for (var i = 0; i < N; i++) {
      var c = commits[i]; if (!enabled[c[IX_TI]]) continue;
      var x = xFromT(c[IX_T], P); if (x < P.L - 6 || x > P.L + P.W + 6) continue;
      var y = yForChurn(c[IX_A] + c[IX_D], P);
      var dx = x - px, dy = y - py, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ----- card -----
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtN(n) { return n.toLocaleString('en-US'); }
  function fmtTok(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return Math.round(n / 1e6) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }
  function fmtDate(sec) {
    var d = new Date(sec * 1000);
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12; if (h12 === 0) h12 = 12;
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + h12 + ':' + pad2(d.getMinutes()) + ' ' + ap;
  }
  function showCard(idx, px, py, pinned) {
    var c = commits[idx], tp = topics[c[IX_TI]], col = tp.color;
    var url = DATA.repo; // commit links neutered (public history reset 2026-05-29; SHAs no longer resolve)
    var dayTok = tokensOnDay(c[IX_T]);
    var fuelLine = dayTok > 0
      ? '<div class="gh-card-fuel">' + fmtTok(dayTok) + ' tokens spent that day</div>'
      : (dayTok === 0 ? '' : '<div class="gh-card-fuel gh-card-byhand">built by hand</div>');
    cardEl.innerHTML =
      '<div class="gh-card-top">' +
        '<span class="gh-card-dot" style="color:' + col + ';background:' + col + '"></span>' +
        '<span class="gh-card-topic" style="color:' + col + '">' + esc(tp.label) + '</span>' +
        '<span class="gh-card-date">' + fmtDate(c[IX_T]) + '</span>' +
      '</div>' +
      '<p class="gh-card-msg">' + esc(c[IX_S] || '(no message)') + '</p>' +
      fuelLine +
      '<div class="gh-card-foot">' +
        '<span class="gh-card-add">+' + fmtN(c[IX_A]) + '</span>' +
        '<span class="gh-card-del">−' + fmtN(c[IX_D]) + '</span>' +
        '<span>· ' + c[IX_F] + (c[IX_F] === 1 ? ' file' : ' files') + '</span>' +
        '<a class="gh-card-link" href="' + url + '" target="_blank" rel="noopener">GitHub ↗</a>' +
      '</div>';
    cardEl.classList.add('is-on');
    cardEl.classList.toggle('is-pinned', !!pinned);
    var cw = cardEl.offsetWidth, chh = cardEl.offsetHeight;
    var x = px + 16; if (x + cw > cssW - 6) x = px - 16 - cw; if (x < 6) x = 6;
    var y = py - chh - 14; if (y < 6) y = py + 18; if (y + chh > cssH - 6) y = cssH - 6 - chh;
    cardEl.style.left = x + 'px'; cardEl.style.top = y + 'px';
  }
  function hideCard() { cardEl.classList.remove('is-on', 'is-pinned'); }

  // ----- view ops -----
  function clampView() {
    var span = view.t1 - view.t0;
    if (span >= fullSpan) { view.t0 = fullT0; view.t1 = fullT1; return; }
    if (view.t0 < fullT0) { view.t0 = fullT0; view.t1 = fullT0 + span; }
    if (view.t1 > fullT1) { view.t1 = fullT1; view.t0 = fullT1 - span; }
  }
  function zoomAt(cssX, factor) {
    var P = plot(), span = view.t1 - view.t0;
    var tAt = view.t0 + (cssX - P.L) / P.W * span;
    var ns = clamp(span * factor, minSpan, fullSpan);
    var f = (tAt - view.t0) / span;
    view.t0 = tAt - f * ns; view.t1 = view.t0 + ns;
    clampView();
  }
  function killHint() { if (hintEl) hintEl.classList.add('is-gone'); }

  // ----- pointer interaction (mouse + touch + pinch) -----
  var pointers = {}, pcount = 0;
  var panStart = null, pinchPrev = 0, movedFar = false, downX = 0, downY = 0, downType = 'mouse';

  function localXY(e) {
    var r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && (e.target.closest('.gh-btn') || e.target.closest('.gh-card-link'))) return;
    var pt = localXY(e);
    pointers[e.pointerId] = pt; pcount++;
    stage.setPointerCapture(e.pointerId);
    downX = pt.x; downY = pt.y; movedFar = false; downType = e.pointerType || 'mouse';
    if (pcount === 1) { panStart = { x: pt.x, t0: view.t0, t1: view.t1 }; stage.classList.add('is-panning'); }
    else if (pcount === 2) { var ids = Object.keys(pointers); pinchPrev = Math.abs(pointers[ids[0]].x - pointers[ids[1]].x) || 1; panStart = null; }
  });

  stage.addEventListener('pointermove', function (e) {
    var pt = localXY(e);
    if (pointers[e.pointerId]) pointers[e.pointerId] = pt;

    if (pcount >= 2) {
      var ids = Object.keys(pointers);
      var midX = (pointers[ids[0]].x + pointers[ids[1]].x) / 2;
      var dist = Math.abs(pointers[ids[0]].x - pointers[ids[1]].x) || 1;
      if (pinchPrev) { zoomAt(midX, pinchPrev / dist); killHint(); requestRender(); }
      pinchPrev = dist; movedFar = true;
      return;
    }

    if (pcount === 1 && panStart) {
      var dx = pt.x - downX, dy = pt.y - downY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedFar = true;
      var P = plot(), span = panStart.t1 - panStart.t0;
      var dt = (pt.x - panStart.x) / P.W * span;
      view.t0 = panStart.t0 - dt; view.t1 = panStart.t1 - dt;
      clampView(); killHint(); hideCard(); hoverIdx = -1; bandX = -1; requestRender();
      return;
    }

    // hover (mouse only)
    if (e.pointerType === 'mouse' || e.pointerType === '') {
      var Pb = plot();
      bandX = (pt.x >= Pb.L && pt.x <= Pb.L + Pb.W && pt.y >= Pb.T && pt.y <= Pb.G) ? pt.x : -1;
      var idx = pickAt(pt.x, pt.y);
      if (idx !== hoverIdx) {
        hoverIdx = idx;
        if (idx >= 0) { showCard(idx, pt.x, pt.y, false); stage.style.cursor = 'pointer'; }
        else { if (pinnedIdx < 0) hideCard(); stage.style.cursor = ''; }
        requestRender();
      } else if (idx >= 0) {
        showCard(idx, pt.x, pt.y, false);
      }
    }
  });

  function endPointer(e) {
    var wasFar = movedFar, type = downType;
    if (pointers[e.pointerId]) { delete pointers[e.pointerId]; pcount = Math.max(0, pcount - 1); }
    if (pcount < 2) pinchPrev = 0;
    if (pcount === 0) { panStart = null; stage.classList.remove('is-panning'); }
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}

    if (!wasFar) {
      var pt = localXY(e);
      var idx = pickAt(pt.x, pt.y);
      if (idx >= 0) {
        if (type === 'mouse') {
          window.open(DATA.repo, '_blank', 'noopener'); // neutered: SHAs reset 2026-05-29
        } else {
          pinnedIdx = idx; hoverIdx = idx; showCard(idx, pt.x, pt.y, true); requestRender();
        }
      } else {
        pinnedIdx = -1; hoverIdx = -1; hideCard(); requestRender();
      }
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', function (e) {
    if (pointers[e.pointerId]) { delete pointers[e.pointerId]; pcount = Math.max(0, pcount - 1); }
    if (pcount < 2) pinchPrev = 0;
    if (pcount === 0) { panStart = null; stage.classList.remove('is-panning'); }
  });
  stage.addEventListener('pointerleave', function () {
    bandX = -1;
    if (pcount === 0 && pinnedIdx < 0) { hoverIdx = -1; hideCard(); stage.style.cursor = ''; }
    requestRender();
  });

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var pt = localXY(e);
    zoomAt(pt.x, Math.exp(e.deltaY * 0.0016));
    killHint(); requestRender();
    if (e.pointerType !== 'touch') { var idx = pickAt(pt.x, pt.y); if (idx !== hoverIdx) { hoverIdx = idx; if (idx >= 0) showCard(idx, pt.x, pt.y, false); else if (pinnedIdx < 0) hideCard(); } }
  }, { passive: false });

  // ----- controls -----
  document.getElementById('gh-reset').addEventListener('click', function () {
    view.t0 = defT0; view.t1 = defT1; pinnedIdx = -1; hoverIdx = -1; hideCard(); requestRender();
  });
  var fsBtn = document.getElementById('gh-fs');
  fsBtn.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', function () { setTimeout(resize, 60); });

  // ----- legend: chips grouped by kind. Each chip pairs two sibling controls:
  //   a filter toggle (aria-pressed) and, for real pages, a link to the article. -----
  var GO_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 L11 5 M6 5 H11 V10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var KINDS = [
    { key: 'post', label: 'Blog posts' },
    { key: 'archived', label: 'Archived' },
    { key: 'other', label: 'Other' }
  ];
  KINDS.forEach(function (kd) {
    var ids = topics.map(function (_, i) { return i; }).filter(function (i) {
      return topicCount[i] > 0 && (topics[i].kind || 'other') === kd.key;
    });
    if (!ids.length) return;
    ids.sort(function (a, b) { return topicCount[b] - topicCount[a]; });

    var group = document.createElement('div');
    group.className = 'gh-legend-group';
    group.setAttribute('role', 'group');
    var headId = 'gh-legend-' + kd.key;
    group.setAttribute('aria-labelledby', headId);
    var head = document.createElement('div');
    head.className = 'gh-legend-head'; head.id = headId; head.textContent = kd.label;
    group.appendChild(head);

    var chipWrap = document.createElement('div');
    chipWrap.className = 'gh-legend-chips';
    ids.forEach(function (i) {
      var tp = topics[i];
      var chip = document.createElement('div');
      chip.className = 'gh-chip'; chip.setAttribute('data-kind', tp.kind || 'other');

      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'gh-chip-toggle';
      btn.setAttribute('aria-pressed', enabled[i] ? 'true' : 'false');
      btn.setAttribute('aria-label', tp.label + ', ' + fmtN(topicCount[i]) + ' commits; toggle on the timeline');
      btn.innerHTML = '<span class="gh-chip-dot" style="--c:' + tp.color + '"></span>' +
        '<span class="gh-chip-label">' + esc(tp.label) + '</span>' +
        '<span class="gh-chip-n">' + fmtN(topicCount[i]) + '</span>';
      btn.addEventListener('click', function () {
        enabled[i] = !enabled[i];
        btn.setAttribute('aria-pressed', enabled[i] ? 'true' : 'false');
        if (pinnedIdx >= 0 && !enabled[commits[pinnedIdx][IX_TI]]) { pinnedIdx = -1; hideCard(); }
        requestRender();
      });
      chip.appendChild(btn);

      if (tp.href) {
        var go = document.createElement('a');
        go.className = 'gh-chip-go'; go.href = tp.href;
        go.target = '_blank'; go.rel = 'noopener';
        go.setAttribute('aria-label', 'Open ' + tp.label + (tp.kind === 'archived' ? ' (archived)' : '') + ' article');
        go.innerHTML = GO_SVG;
        chip.appendChild(go);
      }
      chipWrap.appendChild(chip);
    });
    group.appendChild(chipWrap);
    legendEl.appendChild(group);
  });

  // ----- readout -----
  function monYr(sec) { var d = new Date(sec * 1000); return MON[d.getMonth()] + ' ' + d.getFullYear(); }
  readoutEl.innerHTML =
    '<b>' + fmtN(N) + '</b> commits<br>' +
    '<span class="gh-r-sub">' + monYr(tMin) + ' – ' + monYr(tMax) + '</span><br>' +
    '<span style="color:#7dd3a0">+' + fmtN(totalAdd) + '</span> <span style="color:#e08a7a">−' + fmtN(totalDel) + '</span> <span class="gh-r-sub">lines</span>';

  // resume motion (and replay the rise) when a backgrounded tab is focused
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      if (!reduce) { introStart = performance.now(); introOn = true; }
      requestRender();
    }
  });

  // ----- boot -----
  if (window.ResizeObserver) { new ResizeObserver(resize).observe(stage); } else { window.addEventListener('resize', resize); }
  resize();
  requestRender();
  setTimeout(killHint, 5500); // auto-dismiss so the hint never lingers over the axis
})();
