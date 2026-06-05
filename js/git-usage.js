/* Usage charts for the git-history post. Static SVG, baked from ccusage
   snapshots, May into June 2026. May 1-21 carry the prior two-machine
   (laptop + desktop) snapshot; May 22 to June 4 are this machine's ccusage,
   refreshed June 5. Renders once (no rAF), then wires a hover readout. */
(function () {
  'use strict';
  var el = document.getElementById('gh-chart-daily');
  if (!el) return;

  // combined tokens per day, May 1 to June 4 2026 (index 0 = May 1; the 15th had no activity)
  var vals = [16607317, 36137104, 69177645, 42724566, 39884750, 410619, 81899196,
    71871667, 113285745, 159976758, 329253840, 295195507, 457538327, 127231443, 0,
    285454643, 309323557, 623423505, 271215837, 66298045, 290609738, 1197709924,
    1543803732, 1320336965, 702974597, 285643166, 67725588, 507072587, 829700193,
    948042044, 779405982, 553922455, 691281258, 98965260, 130233736];

  var W = 1000, H = 360, padL = 46, padR = 16, padT = 30, padB = 34;
  var plotW = W - padL - padR, plotH = H - padT - padB, ground = padT + plotH;
  var n = vals.length, slot = plotW / n, barW = slot * 0.6;
  var maxT = 1.6e9;
  function y(t) { return ground - (t / maxT) * plotH; }
  function fmtInt(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function dayLabel(i) { return i < 31 ? 'May ' + (i + 1) : 'Jun ' + (i - 30); }
  var peakI = 0, i;
  for (i = 1; i < n; i++) if (vals[i] > vals[peakI]) peakI = i;

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
    'style="width:100%;height:auto;display:block" role="img" ' +
    'aria-label="Tokens burned per day from May into June 2026, peaking at 1.54 billion on May 23">';
  s += '<defs>' +
    '<linearGradient id="ghbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4B36B"/><stop offset="1" stop-color="#B65F28"/></linearGradient>' +
    '<linearGradient id="ghpk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7BE"/><stop offset="1" stop-color="#E8954E"/></linearGradient>' +
    '<filter id="ghglow" x="-30%" y="-12%" width="160%" height="135%"><feGaussianBlur stdDeviation="2.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '</defs>';

  // reference gridlines
  [[0.5e9, '0.5B'], [1e9, '1B'], [1.5e9, '1.5B']].forEach(function (g) {
    var gy = y(g[0]);
    s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + plotW) + '" y2="' + gy + '" stroke="rgba(212,196,160,0.10)" stroke-width="1"/>';
    s += '<text x="' + (padL - 7) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-family="Commit Mono,ui-monospace,monospace" font-size="11" fill="rgba(190,184,168,0.5)">' + g[1] + '</text>';
  });
  // baseline
  s += '<line x1="' + padL + '" y1="' + ground + '" x2="' + (padL + plotW) + '" y2="' + ground + '" stroke="rgba(212,196,160,0.18)" stroke-width="1"/>';

  // hover highlight band (behind the bars), moved to the active column by JS
  s += '<rect id="gh-hover-band" x="0" y="' + padT + '" width="' + slot.toFixed(1) + '" height="' + plotH + '" fill="rgba(232,149,78,0.13)" pointer-events="none" style="display:none"/>';

  // bars (with bloom)
  s += '<g filter="url(#ghglow)">';
  for (i = 0; i < n; i++) {
    if (vals[i] <= 0) continue;
    var bx = padL + i * slot + (slot - barW) / 2, by = y(vals[i]), bh = ground - by;
    s += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (i === peakI ? 'url(#ghpk)' : 'url(#ghbar)') + '">' +
      '<title>' + dayLabel(i) + ': ' + fmtInt(vals[i]) + ' tokens spent</title></rect>';
  }
  s += '</g>';

  // peak callout
  var pcx = padL + peakI * slot + slot / 2;
  s += '<text x="' + pcx.toFixed(1) + '" y="' + (y(vals[peakI]) - 9) + '" text-anchor="middle" font-family="century_supra_a,Georgia,serif" font-size="16" fill="#F5F1EA">1.54B</text>';

  // x labels
  [[0, 'May 1'], [9, '10'], [19, '20'], [30, '31'], [34, 'Jun 4']].forEach(function (t) {
    var lx = padL + t[0] * slot + slot / 2;
    s += '<text x="' + lx.toFixed(1) + '" y="' + (ground + 16) + '" text-anchor="middle" font-family="Commit Mono,ui-monospace,monospace" font-size="11" fill="rgba(184,178,162,0.5)">' + t[1] + '</text>';
  });

  // transparent overlay captures the cursor across the whole plot, so a column
  // reads even between bars (and the slow native bar tooltips stay quiet)
  s += '<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="transparent" pointer-events="all" style="cursor:crosshair"/>';

  s += '</svg>';
  el.innerHTML = s;

  // ----- hover readout -----
  var svg = el.querySelector('svg');
  var band = el.querySelector('#gh-hover-band');
  var tip = document.createElement('div');
  tip.className = 'gh-bar-tip';
  el.appendChild(tip);

  function dayAt(clientX) {
    var r = svg.getBoundingClientRect();
    var vbX = (clientX - r.left) / r.width * W;
    if (vbX < padL || vbX > padL + plotW) return -1;
    var idx = Math.floor((vbX - padL) / slot);
    return (idx < 0 || idx >= n) ? -1 : idx;
  }
  function hide() { tip.classList.remove('is-on'); band.style.display = 'none'; }
  function move(e) {
    var idx = dayAt(e.clientX);
    if (idx < 0) { hide(); return; }
    band.setAttribute('x', (padL + idx * slot).toFixed(1));
    band.style.display = '';
    tip.innerHTML = '<span class="d">' + dayLabel(idx) + '</span><span class="v">' + fmtInt(vals[idx]) + ' tokens</span>';
    tip.classList.add('is-on');
    var r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(tw / 2 + 2, Math.min(r.width - tw / 2 - 2, e.clientX - r.left)) + 'px';
    tip.style.top = Math.max(th + 2, e.clientY - r.top - 12) + 'px';
  }
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', hide);
})();
